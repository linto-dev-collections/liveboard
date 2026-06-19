import type { createAssetRepository } from "../../infrastructure/repositories/asset.repository";

type Deps = {
  assetRepo: ReturnType<typeof createAssetRepository>;
  r2: R2Bucket;
};

export type ReclaimOrphansConfig = {
  /** 走査する R2 prefix（例 "boards/"）。 */
  prefix: string;
  /** 孤児とみなす最小経過時間（アップロード直後のレース回避）。 */
  minAgeMs: number;
  /** 1 ページの list 件数（IN 句のために ≤100 推奨）。 */
  pageLimit: number;
  /** 1 回の実行で走査する最大ページ数（暴走防止）。 */
  maxPages: number;
};

/**
 * 孤児回収（G6）。R2 を `prefix` で走査し、**manifest（board_r2_object）に存在しない**オブジェクトを
 * 回収する（途中失敗・ハード削除済みボードの取りこぼしの保険）。
 *
 * - D1 先・R2 後（G6）のため、正規オブジェクトは必ず先に manifest 行を持つ。manifest 外＝孤児。
 * - アップロード直後のレースを避けるため、作成から `minAgeMs` 経過したもののみ削除する。
 * - バックアップ/履歴の保持期間中の kind は manifest に残るため対象外になる（行があれば既知）。
 */
export function createReclaimOrphansService(deps: Deps) {
  return {
    async execute(
      config: ReclaimOrphansConfig,
      now: number,
    ): Promise<{ scanned: number; reclaimed: number }> {
      let scanned = 0;
      let reclaimed = 0;
      let cursor: string | undefined;

      for (let page = 0; page < config.maxPages; page++) {
        const listed = await deps.r2.list({
          prefix: config.prefix,
          cursor,
          limit: config.pageLimit,
        });
        scanned += listed.objects.length;

        const known = await deps.assetRepo.filterKnownR2Keys({
          r2Keys: listed.objects.map((o) => o.key),
        });
        const orphans = listed.objects
          .filter(
            (o) =>
              !known.has(o.key) && o.uploaded.getTime() < now - config.minAgeMs,
          )
          .map((o) => o.key);
        if (orphans.length > 0) {
          await deps.r2.delete(orphans);
          reclaimed += orphans.length;
        }

        if (!listed.truncated) break;
        cursor = listed.cursor;
      }

      return { scanned, reclaimed };
    },
  };
}
