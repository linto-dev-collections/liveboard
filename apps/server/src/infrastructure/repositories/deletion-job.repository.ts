/**
 * 削除 Saga の `deletion_job`（テーブル §4.10・§8.1・F4b/H4）。
 *
 * - **原子的 claim**: due ジョブ 1 件をリース取得（`lease_owner`/`lease_expires_at`/`lease_version++`）。
 *   影響 1 行のワーカーのみが処理する（split-brain 防止）。
 * - **全遷移は CAS（H4・フェンシング）**: `state=expected ∧ lease_owner=worker ∧ lease_version=v ∧
 *   lease_expires_at>=now` のときのみ遷移。リース失効後の旧ワーカーは 0 行で弾かれる。
 *
 * drizzle ではなく raw SQL（`d1.prepare`）を使う: `UPDATE ... WHERE id=(SELECT ... LIMIT 1) RETURNING`
 * のような原子的 claim と CAS を素直に表現するため。
 */

export type DeletionJobState =
  | "queued"
  | "purging_do"
  | "purging_r2"
  | "ready_to_delete"
  | "done"
  | "failed";

/** claim 中の有効状態（done/failed 以外）。 */
const ACTIVE_STATES = "('queued','purging_do','purging_r2','ready_to_delete')";

export type ClaimedJob = {
  id: string;
  boardId: string;
  organizationId: string;
  state: DeletionJobState;
  leaseVersion: number;
};

export function createDeletionJobRepository(d1: D1Database) {
  return {
    /**
     * §4.10 原子的 claim。due（再試行待ち超過・未リース or リース失効）なジョブ 1 件を
     * リース取得し、`(id, board_id, organization_id, state, lease_version)` を返す。無ければ null。
     */
    async claimDueJob(params: {
      worker: string;
      now: number;
      ttlMs: number;
    }): Promise<ClaimedJob | null> {
      const row = await d1
        .prepare(
          `UPDATE deletion_job
             SET lease_owner = ?1,
                 lease_expires_at = ?2,
                 lease_version = lease_version + 1,
                 started_at = COALESCE(started_at, ?3),
                 attempts = attempts + 1,
                 updated_at = ?3
           WHERE id = (
             SELECT id FROM deletion_job
             WHERE state IN ${ACTIVE_STATES}
               AND (next_retry_at IS NULL OR next_retry_at <= ?3)
               AND (lease_expires_at IS NULL OR lease_expires_at < ?3)
             ORDER BY created_at
             LIMIT 1
           )
           RETURNING id, board_id, organization_id, state, lease_version`,
        )
        .bind(params.worker, params.now + params.ttlMs, params.now)
        .first<{
          id: string;
          board_id: string;
          organization_id: string;
          state: DeletionJobState;
          lease_version: number;
        }>();
      if (!row) return null;
      return {
        id: row.id,
        boardId: row.board_id,
        organizationId: row.organization_id,
        state: row.state,
        leaseVersion: row.lease_version,
      };
    },

    /**
     * H4 CAS 遷移。期待状態かつ自分のリース（version 一致・未失効）のときのみ次状態へ。
     * @returns true=遷移成功 / false=リース喪失・状態不一致（旧ワーカーを弾く）
     */
    async transition(params: {
      id: string;
      expected: DeletionJobState;
      next: DeletionJobState;
      worker: string;
      leaseVersion: number;
      now: number;
    }): Promise<boolean> {
      const res = await d1
        .prepare(
          `UPDATE deletion_job SET state = ?, updated_at = ?
           WHERE id = ? AND state = ? AND lease_owner = ?
             AND lease_version = ? AND lease_expires_at >= ?`,
        )
        .bind(
          params.next,
          params.now,
          params.id,
          params.expected,
          params.worker,
          params.leaseVersion,
          params.now,
        )
        .run();
      return (res.meta.changes ?? 0) === 1;
    },

    /** 完了（`done`）＋リース解放（CAS）。 */
    async finish(params: {
      id: string;
      worker: string;
      leaseVersion: number;
      now: number;
    }): Promise<boolean> {
      const res = await d1
        .prepare(
          `UPDATE deletion_job
             SET state = 'done', lease_owner = NULL, lease_expires_at = NULL,
                 last_error = NULL, updated_at = ?
           WHERE id = ? AND lease_owner = ? AND lease_version = ?
             AND lease_expires_at >= ?`,
        )
        .bind(
          params.now,
          params.id,
          params.worker,
          params.leaseVersion,
          params.now,
        )
        .run();
      return (res.meta.changes ?? 0) === 1;
    },

    /**
     * 失敗記録＋リース解放。`attempts`（claim 時に +1 済み）が上限到達なら `failed`（打ち切り）、
     * 未満なら状態を保持して `next_retry_at` で再 claim を待つ。CAS（version 一致）で旧ワーカーを弾く。
     */
    async fail(params: {
      id: string;
      worker: string;
      leaseVersion: number;
      error: string;
      backoffMs: number;
      maxAttempts: number;
      now: number;
    }): Promise<void> {
      await d1
        .prepare(
          `UPDATE deletion_job
             SET state = CASE WHEN attempts >= ? THEN 'failed' ELSE state END,
                 lease_owner = NULL,
                 lease_expires_at = NULL,
                 next_retry_at = ?,
                 last_error = ?,
                 updated_at = ?
           WHERE id = ? AND lease_owner = ? AND lease_version = ?`,
        )
        .bind(
          params.maxAttempts,
          params.now + params.backoffMs,
          params.error.slice(0, 1000),
          params.now,
          params.id,
          params.worker,
          params.leaseVersion,
        )
        .run();
    },
  };
}
