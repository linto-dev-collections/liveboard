import type { createAssetRepository } from "../../infrastructure/repositories/asset.repository";
import type { createAuditRepository } from "../../infrastructure/repositories/audit.repository";
import type { createBoardRepository } from "../../infrastructure/repositories/board.repository";
import type {
  ClaimedJob,
  createDeletionJobRepository,
} from "../../infrastructure/repositories/deletion-job.repository";
import type { BoardMaintenanceGateway } from "./ports";

type Deps = {
  deletionJobRepo: ReturnType<typeof createDeletionJobRepository>;
  boardRepo: ReturnType<typeof createBoardRepository>;
  assetRepo: ReturnType<typeof createAssetRepository>;
  auditRepo: ReturnType<typeof createAuditRepository>;
  gateway: BoardMaintenanceGateway;
  r2: R2Bucket;
};

export type DeletionJobConfig = {
  /** このワーカー固有のリース所有者 ID（フェンシング）。 */
  worker: string;
  leaseTtlMs: number;
  maxAttempts: number;
  backoffMs: number;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 削除 Saga（テーブル §8.1）を 1 件分進める use-case。**claim でリースを取り**、CAS フェンシングで
 * 各遷移を行う。各ステップは冪等（purge/R2 削除/CASCADE）で、リース喪失時は中断して再 claim を待つ。
 *
 *   queued → purging_do : DO purge（SQLite 全消去・接続切断）
 *   purging_do → purging_r2 : board_r2_object を**再列挙**（H6）して R2 から削除
 *   purging_r2 → ready_to_delete
 *   ready_to_delete → done : D1 board ハード削除（子は CASCADE）＋ audit(board.purge_done)
 */
export function createProcessDeletionJobService(deps: Deps) {
  async function runSaga(
    job: ClaimedJob,
    config: DeletionJobConfig,
  ): Promise<void> {
    const cas = (
      expected: ClaimedJob["state"],
      next: ClaimedJob["state"],
    ): Promise<boolean> =>
      deps.deletionJobRepo.transition({
        id: job.id,
        expected,
        next,
        worker: config.worker,
        leaseVersion: job.leaseVersion,
        now: Date.now(),
      });

    let state = job.state;

    if (state === "queued") {
      await deps.gateway.purge(job.boardId);
      if (!(await cas("queued", "purging_do"))) return; // リース喪失 → 中断
      state = "purging_do";
    }

    if (state === "purging_do") {
      // H6: 削除直前に board_r2_object を再列挙して取りこぼしを防ぐ。
      const objects = await deps.assetRepo.listR2ObjectsForBoard({
        boardId: job.boardId,
      });
      if (objects.length > 0) {
        await deps.r2.delete(objects.map((o) => o.r2Key));
      }
      if (!(await cas("purging_do", "purging_r2"))) return;
      state = "purging_r2";
    }

    if (state === "purging_r2") {
      if (!(await cas("purging_r2", "ready_to_delete"))) return;
      state = "ready_to_delete";
    }

    if (state === "ready_to_delete") {
      await deps.boardRepo.hardDeleteBoard({ boardId: job.boardId });
      // F6/G7: 監査記録（best-effort・snapshot 付き）。
      await deps.auditRepo
        .append({
          organizationId: job.organizationId,
          actorUserId: null,
          action: "board.purge_done",
          targetType: "board",
          targetId: job.boardId,
        })
        .catch((error) => console.error("[saga] audit failed", error));
      await deps.deletionJobRepo.finish({
        id: job.id,
        worker: config.worker,
        leaseVersion: job.leaseVersion,
        now: Date.now(),
      });
    }
  }

  return {
    /** due ジョブを 1 件 claim して進める。処理したら true、due 無しなら false。 */
    async execute(
      config: DeletionJobConfig,
      now: number,
    ): Promise<{ processed: boolean }> {
      const job = await deps.deletionJobRepo.claimDueJob({
        worker: config.worker,
        now,
        ttlMs: config.leaseTtlMs,
      });
      if (!job) return { processed: false };

      try {
        await runSaga(job, config);
      } catch (error) {
        await deps.deletionJobRepo.fail({
          id: job.id,
          worker: config.worker,
          leaseVersion: job.leaseVersion,
          error: errorMessage(error),
          backoffMs: config.backoffMs,
          maxAttempts: config.maxAttempts,
          now: Date.now(),
        });
      }
      return { processed: true };
    },
  };
}
