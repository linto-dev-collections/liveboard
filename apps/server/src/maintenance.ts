/**
 * Composition Root（scheduled Worker 用）。Cron Trigger から起動し、削除 Saga・アセット GC・
 * 孤児回収を 1 ステップ進める。レイヤ規約上 `use-cases/` から触れない Board DO は、ここで
 * `getServerByName` を使ってゲートウェイ実装に閉じ込め、use-case へ注入する。
 */
import { getServerByName } from "partyserver";
import { createAssetRepository } from "./infrastructure/repositories/asset.repository";
import { createAuditRepository } from "./infrastructure/repositories/audit.repository";
import { createBoardRepository } from "./infrastructure/repositories/board.repository";
import { createDeletionJobRepository } from "./infrastructure/repositories/deletion-job.repository";
import {
  ASSET_GC_GRACE_MS,
  ASSET_GC_MIN_AGE_MS,
  DELETION_JOBS_PER_TICK,
  DELETION_LEASE_TTL_MS,
  DELETION_MAX_ATTEMPTS,
  DELETION_RETRY_BACKOFF_MS,
  MAINTENANCE_BATCH_LIMIT,
  ORPHAN_MIN_AGE_MS,
} from "./realtime/limits";
import type { AppEnv } from "./types";
import { createGcAssetsService } from "./use-cases/maintenance/gc-assets.service";
import type { BoardMaintenanceGateway } from "./use-cases/maintenance/ports";
import { createProcessDeletionJobService } from "./use-cases/maintenance/process-deletion-job.service";
import { createReclaimOrphansService } from "./use-cases/maintenance/reclaim-orphans.service";

/** 孤児回収は IN 句の都合で 1 ページ ≤100 件にする。 */
const ORPHAN_PAGE_LIMIT = 100;
const ORPHAN_MAX_PAGES = 20;

export async function runScheduledMaintenance(
  env: AppEnv["Bindings"],
): Promise<void> {
  const now = Date.now();
  // フェンシング用のワーカー識別子（この起動に固有）。
  const worker = crypto.randomUUID();

  const gateway: BoardMaintenanceGateway = {
    purge: async (boardId) => {
      const stub = await getServerByName(env.Board, boardId);
      await stub.purge();
    },
    hasLiveFileRefs: async (boardId, fileIds) => {
      const stub = await getServerByName(env.Board, boardId);
      return stub.hasLiveFileRefs(fileIds);
    },
  };

  const deletionJobRepo = createDeletionJobRepository(env.DB);
  const boardRepo = createBoardRepository(env.DB);
  const assetRepo = createAssetRepository(env.DB);
  const auditRepo = createAuditRepository(env.DB);

  // 1) 削除 Saga: due ジョブを上限まで進める（1 件ずつ claim）。
  try {
    const processJob = createProcessDeletionJobService({
      deletionJobRepo,
      boardRepo,
      assetRepo,
      auditRepo,
      gateway,
      r2: env.R2_ASSETS,
    });
    const config = {
      worker,
      leaseTtlMs: DELETION_LEASE_TTL_MS,
      maxAttempts: DELETION_MAX_ATTEMPTS,
      backoffMs: DELETION_RETRY_BACKOFF_MS,
    };
    for (let i = 0; i < DELETION_JOBS_PER_TICK; i++) {
      const { processed } = await processJob.execute(config, Date.now());
      if (!processed) break;
    }
  } catch (error) {
    console.error("[maintenance] deletion saga failed", error);
  }

  // 2) アセット二段階 GC。
  try {
    const gcAssets = createGcAssetsService({
      assetRepo,
      gateway,
      r2: env.R2_ASSETS,
    });
    await gcAssets.execute(
      {
        minAgeMs: ASSET_GC_MIN_AGE_MS,
        graceMs: ASSET_GC_GRACE_MS,
        limit: MAINTENANCE_BATCH_LIMIT,
      },
      now,
    );
  } catch (error) {
    console.error("[maintenance] asset gc failed", error);
  }

  // 3) 孤児回収。
  try {
    const reclaim = createReclaimOrphansService({
      assetRepo,
      r2: env.R2_ASSETS,
    });
    await reclaim.execute(
      {
        prefix: "boards/",
        minAgeMs: ORPHAN_MIN_AGE_MS,
        pageLimit: ORPHAN_PAGE_LIMIT,
        maxPages: ORPHAN_MAX_PAGES,
      },
      now,
    );
  } catch (error) {
    console.error("[maintenance] orphan reclaim failed", error);
  }
}
