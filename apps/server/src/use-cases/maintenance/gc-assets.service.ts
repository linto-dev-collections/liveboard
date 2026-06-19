import type { createAssetRepository } from "../../infrastructure/repositories/asset.repository";
import { type BoardMaintenanceGateway, groupByBoard } from "./ports";

type Deps = {
  assetRepo: ReturnType<typeof createAssetRepository>;
  gateway: BoardMaintenanceGateway;
  r2: R2Bucket;
};

export type GcAssetsConfig = {
  /** 候補化までの最小経過時間（アップロード直後の誤回収防止）。 */
  minAgeMs: number;
  /** 候補化から削除までの猶予。 */
  graceMs: number;
  /** 1 回の処理上限。 */
  limit: number;
};

/**
 * アセット二段階 GC（I4・§8.3）。
 *   1. **候補化**: active board の ready な kind='asset' で、DO に**生存参照が無い**ものを候補化。
 *   2. **猶予**: 候補化から `graceMs` 経過するまで削除しない（その間の再参照で候補解除）。
 *   3. **再確認→削除**: 猶予経過後に DO 生存参照を**再確認**し、なお無ければ R2 削除→manifest 行削除。
 *
 * DO 生存参照の確認は `gateway.hasLiveFileRefs` 越し（`element_file_id_idx`）。二段階＋再確認で TOCTOU を回避する。
 */
export function createGcAssetsService(deps: Deps) {
  return {
    async execute(
      config: GcAssetsConfig,
      now: number,
    ): Promise<{ candidates: number; deleted: number; cleared: number }> {
      let candidates = 0;
      let deleted = 0;
      let cleared = 0;

      // 1. 候補化スキャン（ボード単位で DO 照合）。
      const scan = await deps.assetRepo.listAssetsForGcScan({
        now,
        minAgeMs: config.minAgeMs,
        limit: config.limit,
      });
      for (const [boardId, items] of groupByBoard(scan)) {
        const live = new Set(
          await deps.gateway.hasLiveFileRefs(
            boardId,
            items.map((i) => i.fileId),
          ),
        );
        for (const it of items) {
          if (live.has(it.fileId)) continue;
          await deps.assetRepo.markGcCandidate({
            r2ObjectId: it.r2ObjectId,
            now,
          });
          candidates++;
        }
      }

      // 2+3. 猶予経過分を再確認して削除（再参照されていれば候補解除）。
      const due = await deps.assetRepo.listGcDue({
        now,
        graceMs: config.graceMs,
        limit: config.limit,
      });
      for (const [boardId, items] of groupByBoard(due)) {
        const live = new Set(
          await deps.gateway.hasLiveFileRefs(
            boardId,
            items.map((i) => i.fileId),
          ),
        );
        for (const it of items) {
          if (live.has(it.fileId)) {
            await deps.assetRepo.clearGcCandidate({
              r2ObjectId: it.r2ObjectId,
            });
            cleared++;
            continue;
          }
          // R2 先・D1 行後（孤児化しても孤児回収で掃ける方向）。
          await deps.r2.delete(it.r2Key);
          await deps.assetRepo.deleteR2Object({ r2ObjectId: it.r2ObjectId });
          deleted++;
        }
      }

      return { candidates, deleted, cleared };
    },
  };
}
