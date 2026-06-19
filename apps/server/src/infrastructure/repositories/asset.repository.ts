import { asset, board, boardR2Object } from "@liveboard/db/schema";
import { and, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { AssetMime } from "../../domain/services/asset-validation";

/** GC 走査・削除で扱う 1 行（fileId は DO 生存参照の照合キー）。 */
export type GcAssetRow = {
  boardId: string;
  fileId: string;
  r2ObjectId: string;
  r2Key: string;
};

/**
 * R2 統一マニフェスト（`board_r2_object`）と画像メタ（`asset`）の永続化（テーブル §4.8/§4.9・§8.3）。
 *
 * 不変条件:
 *   - **D1 先・R2 後（G6）**: pending を条件付き INSERT（削除中ボードを拒否 H6）してから R2 に書く。
 *   - **ready は size 必須（I7）**: `markObjectReady` は size を必ず付ける。
 *   - **kind='asset' 強制（H7）**: asset は `createPendingObject(kind:'asset')` で作った object のみ参照。
 *   - **配信は ready のみ（F9）**: `getAssetForRetrieve` は status='ready' に限定。
 */
export function createAssetRepository(d1: D1Database) {
  const db = drizzle(d1);

  return {
    /**
     * §8.3 条件付き pending INSERT（H6）。`board.deletion_state='active' AND deleted_at IS NULL`
     * のときのみ 1 行 INSERT。削除中/不存在なら 0 行（呼び出し側が 409 化）。
     * @returns 影響行数（0 = 削除中/不存在で拒否）
     */
    async createPendingObject(params: {
      id: string;
      boardId: string;
      kind: "asset" | "thumbnail";
      r2Key: string;
      now: number;
    }): Promise<number> {
      const res = await d1
        .prepare(
          `INSERT INTO board_r2_object (id, board_id, kind, r2_key, status, size, created_at, updated_at)
           SELECT ?, ?, ?, ?, 'pending', NULL, ?, ?
           WHERE EXISTS (
             SELECT 1 FROM board b
             WHERE b.id = ? AND b.deletion_state = 'active' AND b.deleted_at IS NULL
           )`,
        )
        .bind(
          params.id,
          params.boardId,
          params.kind,
          params.r2Key,
          params.now,
          params.now,
          params.boardId,
        )
        .run();
      return res.meta.changes ?? 0;
    },

    /**
     * 画像メタ作成 ＋ object を ready 化を **同一バッチ**で原子的に行う（I7・H7）。
     * asset の複合 FK `(board_id, r2_object_id) → board_r2_object(board_id, id)` により
     * 別ボード参照は DB で拒否される（G2）。
     */
    async finalizeAsset(params: {
      boardId: string;
      fileId: string;
      r2ObjectId: string;
      mime: AssetMime;
      width: number | null;
      height: number | null;
      sha256: string | null;
      userId: string;
      size: number;
      now: number;
    }): Promise<void> {
      await db.batch([
        db.insert(asset).values({
          boardId: params.boardId,
          fileId: params.fileId,
          r2ObjectId: params.r2ObjectId,
          mime: params.mime,
          width: params.width,
          height: params.height,
          sha256: params.sha256,
          createdByUserId: params.userId,
        }),
        db
          .update(boardR2Object)
          .set({
            status: "ready",
            size: params.size,
            updatedAt: new Date(params.now),
          })
          .where(
            and(
              eq(boardR2Object.id, params.r2ObjectId),
              eq(boardR2Object.boardId, params.boardId),
              inArray(boardR2Object.status, ["pending", "sanitizing"]),
            ),
          ),
      ]);
    },

    /** object のステータス更新（失敗時の `failed` 化等）。 */
    async markObjectStatus(params: {
      id: string;
      status: "pending" | "sanitizing" | "ready" | "deleting" | "failed";
      now: number;
    }): Promise<void> {
      await db
        .update(boardR2Object)
        .set({ status: params.status, updatedAt: new Date(params.now) })
        .where(eq(boardR2Object.id, params.id));
    },

    /**
     * 配信用の取得（F9）。**status='ready' の object のみ** r2Key/mime を返す。
     * 取得時に `asset.last_retrieved_at` を更新（GC 補助・§4.9）。
     */
    async getAssetForRetrieve(params: {
      boardId: string;
      fileId: string;
      now: number;
    }): Promise<{ r2Key: string; mime: AssetMime } | null> {
      const row = await db
        .select({ r2Key: boardR2Object.r2Key, mime: asset.mime })
        .from(asset)
        .innerJoin(
          boardR2Object,
          and(
            eq(asset.r2ObjectId, boardR2Object.id),
            eq(asset.boardId, boardR2Object.boardId),
          ),
        )
        .where(
          and(
            eq(asset.boardId, params.boardId),
            eq(asset.fileId, params.fileId),
            eq(boardR2Object.status, "ready"),
          ),
        )
        .get();
      if (!row) return null;

      await db
        .update(asset)
        .set({ lastRetrievedAt: new Date(params.now) })
        .where(
          and(
            eq(asset.boardId, params.boardId),
            eq(asset.fileId, params.fileId),
          ),
        );
      return { r2Key: row.r2Key, mime: row.mime };
    },

    /** ボードの ready な画像合計バイト（N4 容量上限の判定用）。 */
    async sumReadyAssetBytes(params: { boardId: string }): Promise<number> {
      const row = await db
        .select({
          total: sql<number>`COALESCE(SUM(${boardR2Object.size}), 0)`,
        })
        .from(boardR2Object)
        .where(
          and(
            eq(boardR2Object.boardId, params.boardId),
            eq(boardR2Object.kind, "asset"),
            eq(boardR2Object.status, "ready"),
          ),
        )
        .get();
      return row?.total ?? 0;
    },

    /**
     * サムネ整合更新（§4.8 注記）。**manifest（kind='thumbnail'）と board.thumbnail_key を
     * 同一バッチ**で整合させる。固定キー（boards/:id/thumbnail.png）を r2Key 競合で upsert。
     */
    async setThumbnail(params: {
      objectId: string;
      boardId: string;
      organizationId: string;
      r2Key: string;
      size: number;
      now: number;
    }): Promise<void> {
      await d1.batch([
        d1
          .prepare(
            `INSERT INTO board_r2_object (id, board_id, kind, r2_key, status, size, created_at, updated_at)
             SELECT ?, ?, 'thumbnail', ?, 'ready', ?, ?, ?
             WHERE EXISTS (
               SELECT 1 FROM board b
               WHERE b.id = ? AND b.deletion_state = 'active' AND b.deleted_at IS NULL
             )
             ON CONFLICT(r2_key) DO UPDATE SET
               status = 'ready', size = excluded.size, updated_at = excluded.updated_at`,
          )
          .bind(
            params.objectId,
            params.boardId,
            params.r2Key,
            params.size,
            params.now,
            params.now,
            params.boardId,
          ),
        d1
          .prepare(
            `UPDATE board SET thumbnail_key = ?, updated_at = ?
             WHERE id = ? AND organization_id = ? AND deleted_at IS NULL`,
          )
          .bind(
            params.r2Key,
            params.now,
            params.boardId,
            params.organizationId,
          ),
      ]);
    },

    // ---- 削除 Saga / GC / 孤児回収（Phase 6・§8.3） ----

    /**
     * 削除 Saga（purging_r2）の再列挙（H6・取りこぼし防止）。当該 board の **全** R2 オブジェクト
     * （kind 問わず）の `r2Key` を返す。Saga はこれらを R2 から削除する（D1 行は board CASCADE）。
     */
    async listR2ObjectsForBoard(params: {
      boardId: string;
    }): Promise<{ id: string; r2Key: string }[]> {
      return db
        .select({ id: boardR2Object.id, r2Key: boardR2Object.r2Key })
        .from(boardR2Object)
        .where(eq(boardR2Object.boardId, params.boardId))
        .all();
    },

    /**
     * アセット GC 候補化スキャン（I4）。active board の **ready な kind='asset'** で、まだ候補化
     * しておらず（gc_candidate_at IS NULL）作成から minAge 経過したものを返す。呼び出し側が DO の
     * 生存参照を照合し、参照無しのものを `markGcCandidate` する。
     */
    async listAssetsForGcScan(params: {
      now: number;
      minAgeMs: number;
      limit: number;
    }): Promise<{ boardId: string; fileId: string; r2ObjectId: string }[]> {
      return db
        .select({
          boardId: asset.boardId,
          fileId: asset.fileId,
          r2ObjectId: boardR2Object.id,
        })
        .from(boardR2Object)
        .innerJoin(
          asset,
          and(
            eq(asset.r2ObjectId, boardR2Object.id),
            eq(asset.boardId, boardR2Object.boardId),
          ),
        )
        .innerJoin(board, eq(board.id, boardR2Object.boardId))
        .where(
          and(
            eq(boardR2Object.kind, "asset"),
            eq(boardR2Object.status, "ready"),
            isNull(boardR2Object.gcCandidateAt),
            lt(boardR2Object.createdAt, new Date(params.now - params.minAgeMs)),
            eq(board.deletionState, "active"),
            isNull(board.deletedAt),
          ),
        )
        .limit(params.limit)
        .all();
    },

    /** GC 候補化（gc_candidate_at=now）。猶予期間の起点を記録する。 */
    async markGcCandidate(params: {
      r2ObjectId: string;
      now: number;
    }): Promise<void> {
      await db
        .update(boardR2Object)
        .set({
          gcCandidateAt: new Date(params.now),
          updatedAt: new Date(params.now),
        })
        .where(eq(boardR2Object.id, params.r2ObjectId));
    },

    /** GC 候補解除（再参照されたとき・gc_candidate_at=NULL）。 */
    async clearGcCandidate(params: { r2ObjectId: string }): Promise<void> {
      const now = Date.now();
      await db
        .update(boardR2Object)
        .set({ gcCandidateAt: null, updatedAt: new Date(now) })
        .where(eq(boardR2Object.id, params.r2ObjectId));
    },

    /**
     * 猶予期間（grace）を過ぎた GC 候補（kind='asset'）を返す。呼び出し側が DO 生存参照を
     * **再確認**し、なお参照無しなら R2 削除→`deleteR2Object`、再参照済みなら `clearGcCandidate`。
     */
    async listGcDue(params: {
      now: number;
      graceMs: number;
      limit: number;
    }): Promise<GcAssetRow[]> {
      return db
        .select({
          boardId: asset.boardId,
          fileId: asset.fileId,
          r2ObjectId: boardR2Object.id,
          r2Key: boardR2Object.r2Key,
        })
        .from(boardR2Object)
        .innerJoin(
          asset,
          and(
            eq(asset.r2ObjectId, boardR2Object.id),
            eq(asset.boardId, boardR2Object.boardId),
          ),
        )
        .where(
          and(
            eq(boardR2Object.kind, "asset"),
            isNotNull(boardR2Object.gcCandidateAt),
            lt(
              boardR2Object.gcCandidateAt,
              new Date(params.now - params.graceMs),
            ),
          ),
        )
        .limit(params.limit)
        .all();
    },

    /** R2 削除後の manifest 行削除（asset は複合 FK CASCADE で連動削除）。 */
    async deleteR2Object(params: { r2ObjectId: string }): Promise<void> {
      await db
        .delete(boardR2Object)
        .where(eq(boardR2Object.id, params.r2ObjectId));
    },

    /**
     * 孤児回収（G6）用: 与えた r2Key 群のうち manifest（board_r2_object）に**存在する**ものを返す。
     * 呼び出し側は R2 list 結果からこれを除いた残り（manifest 外）を孤児として回収する。
     */
    async filterKnownR2Keys(params: {
      r2Keys: string[];
    }): Promise<Set<string>> {
      if (params.r2Keys.length === 0) return new Set();
      const rows = await db
        .select({ r2Key: boardR2Object.r2Key })
        .from(boardR2Object)
        .where(inArray(boardR2Object.r2Key, params.r2Keys))
        .all();
      return new Set(rows.map((r) => r.r2Key));
    },
  };
}
