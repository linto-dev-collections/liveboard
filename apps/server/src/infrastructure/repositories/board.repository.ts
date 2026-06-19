import {
  board,
  boardFavorite,
  boardRole,
  deletionJob,
  member,
} from "@liveboard/db/schema";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type {
  Board,
  BoardListItem,
  BoardRoleEntry,
  BoardRoleValue,
  OrgRole,
} from "../../domain/types/board";

/** LIKE の特殊文字（`%` `_` `\`）をエスケープし、前方一致を安全にする。 */
function escapeLikePrefix(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function toOrgRole(role: string | undefined): OrgRole | null {
  if (role === "owner") return "owner";
  if (role === "admin") return "admin";
  if (role === "member") return "member";
  // member 行はあるが想定外 role 値 → 既定 member 扱い
  return role === undefined ? null : "member";
}

export function createBoardRepository(d1: D1Database) {
  const db = drizzle(d1);

  return {
    /**
     * 指定ユーザーの当該 org における member.role を返す（M8 の入力）。
     * member 行が無ければ null（org 非メンバー）。
     */
    async getOrgRole(params: {
      organizationId: string;
      userId: string;
    }): Promise<OrgRole | null> {
      const row = await db
        .select({ role: member.role })
        .from(member)
        .where(
          and(
            eq(member.organizationId, params.organizationId),
            eq(member.userId, params.userId),
          ),
        )
        .get();
      return toOrgRole(row?.role);
    },

    /** 指定ユーザーの当該ボードにおける board_role.role を返す（無ければ null）。 */
    async getBoardRole(params: {
      boardId: string;
      userId: string;
    }): Promise<BoardRoleValue | null> {
      const row = await db
        .select({ role: boardRole.role })
        .from(boardRole)
        .where(
          and(
            eq(boardRole.boardId, params.boardId),
            eq(boardRole.userId, params.userId),
          ),
        )
        .get();
      return row?.role ?? null;
    },

    /**
     * ボードと作成者の owner board_role を **原子的バッチ**で作成する。
     * board → board_role の順で 1 トランザクション。board_role の複合 FK
     * `board_role_member_fk (org,user)→member` により、作成者が org メンバーで
     * なければ FK 違反でバッチ全体がロールバックする（テナント境界の DB 強制）。
     */
    async createBoardWithOwner(params: {
      id: string;
      organizationId: string;
      title: string;
      userId: string;
      now: number;
    }): Promise<void> {
      await db.batch([
        db.insert(board).values({
          id: params.id,
          organizationId: params.organizationId,
          title: params.title,
          createdByUserId: params.userId,
          lastActivityAt: new Date(params.now),
        }),
        db.insert(boardRole).values({
          boardId: params.id,
          organizationId: params.organizationId,
          userId: params.userId,
          role: "owner",
        }),
      ]);
    },

    /**
     * org スコープのボード一覧。`deleted_at IS NULL` のみ。
     * - `q`: 前方一致（`title COLLATE NOCASE LIKE 'q%'`・`board_org_title_idx` 活用）
     * - `favoriteOnly`: board_favorite（user×board）で INNER JOIN
     * - `sort`: 'recent'→last_activity_at DESC / 'title'→title COLLATE NOCASE ASC
     * 各行に isFavorite（LEFT JOIN）と thumbnailKey を含む。
     */
    async listBoards(params: {
      organizationId: string;
      userId: string;
      q?: string;
      favoriteOnly?: boolean;
      sort: "recent" | "title";
    }): Promise<BoardListItem[]> {
      const conditions = [
        eq(board.organizationId, params.organizationId),
        isNull(board.deletedAt),
      ];
      if (params.q && params.q.length > 0) {
        const pattern = `${escapeLikePrefix(params.q)}%`;
        conditions.push(
          sql`${board.title} COLLATE NOCASE LIKE ${pattern} ESCAPE '\\'`,
        );
      }
      if (params.favoriteOnly) {
        conditions.push(sql`${boardFavorite.userId} IS NOT NULL`);
      }

      const orderBy =
        params.sort === "title"
          ? asc(sql`${board.title} COLLATE NOCASE`)
          : desc(board.lastActivityAt);

      const rows = await db
        .select({
          id: board.id,
          title: board.title,
          thumbnailKey: board.thumbnailKey,
          lastActivityAt: board.lastActivityAt,
          favoriteUserId: boardFavorite.userId,
        })
        .from(board)
        .leftJoin(
          boardFavorite,
          and(
            eq(boardFavorite.boardId, board.id),
            eq(boardFavorite.userId, params.userId),
          ),
        )
        .where(and(...conditions))
        .orderBy(orderBy)
        .all();

      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        thumbnailKey: r.thumbnailKey,
        lastActivityAt: r.lastActivityAt.getTime(),
        isFavorite: r.favoriteUserId !== null,
      }));
    },

    /**
     * org スコープで 1 件取得（`deleted_at IS NULL`）。
     * 他組織・存在しない場合は null（route が 404 化＝IDOR 防止）。
     */
    async getBoardForOrg(params: {
      boardId: string;
      organizationId: string;
    }): Promise<Board | null> {
      const row = await db
        .select()
        .from(board)
        .where(
          and(
            eq(board.id, params.boardId),
            eq(board.organizationId, params.organizationId),
            isNull(board.deletedAt),
          ),
        )
        .get();
      if (!row) return null;
      return {
        id: row.id,
        organizationId: row.organizationId,
        title: row.title,
        createdByUserId: row.createdByUserId,
        thumbnailKey: row.thumbnailKey,
        lastActivityAt: row.lastActivityAt.getTime(),
        deletionState: row.deletionState,
        createdAt: row.createdAt.getTime(),
        updatedAt: row.updatedAt.getTime(),
      };
    },

    /**
     * WS 接続認可用の軽量取得。`deleted_at` でフィルタせず deletion_state を返すため、
     * 「存在しない/別 org → null（404）」と「purging → 403」を呼び出し側で区別できる。
     */
    async findBoardForConnection(params: {
      boardId: string;
      organizationId: string;
    }): Promise<{ deletionState: "active" | "purging" } | null> {
      const row = await db
        .select({ deletionState: board.deletionState })
        .from(board)
        .where(
          and(
            eq(board.id, params.boardId),
            eq(board.organizationId, params.organizationId),
          ),
        )
        .get();
      return row ?? null;
    },

    /**
     * D1 `board.last_activity_at` を更新（DO が採用バッチ後にデバウンスして呼ぶ）。
     * DO SQLite への write-through とは別物で、一覧の新着順表示のためのアクティビティ通知。
     */
    async touchLastActivity(params: {
      boardId: string;
      now: number;
    }): Promise<void> {
      await db
        .update(board)
        .set({ lastActivityAt: new Date(params.now) })
        .where(eq(board.id, params.boardId));
    },

    /** リネーム（org スコープ・active のみ）。 */
    async renameBoard(params: {
      boardId: string;
      organizationId: string;
      title: string;
    }): Promise<void> {
      await db
        .update(board)
        .set({ title: params.title })
        .where(
          and(
            eq(board.id, params.boardId),
            eq(board.organizationId, params.organizationId),
            isNull(board.deletedAt),
          ),
        );
    },

    /**
     * 削除要求（Saga の入口）。**バッチ**で
     *   ① board を active→purging（deleted_at=now）に更新
     *   ② deletion_job(queued) を作成（UNIQUE board_id で二重作成を防止）
     * を原子的に行う。Saga 実行自体は Phase 6。
     */
    async requestBoardDeletion(params: {
      boardId: string;
      organizationId: string;
      userId: string;
      jobId: string;
      now: number;
    }): Promise<void> {
      await db.batch([
        db
          .update(board)
          .set({ deletionState: "purging", deletedAt: new Date(params.now) })
          .where(
            and(
              eq(board.id, params.boardId),
              eq(board.organizationId, params.organizationId),
              eq(board.deletionState, "active"),
            ),
          ),
        db
          .insert(deletionJob)
          .values({
            id: params.jobId,
            boardId: params.boardId,
            organizationId: params.organizationId,
            state: "queued",
            requestedByUserId: params.userId,
          })
          .onConflictDoNothing({ target: deletionJob.boardId }),
      ]);
    },

    /**
     * board_role の付与/変更を **§8.2 の原子的 conditional insert** で行う。
     * 対象ユーザーが当該ボードの org メンバーである場合のみ insert/update し、
     * 非メンバーなら 0 行（呼び出し側が拒否）。TOCTOU 回避（check-then-write しない）。
     * @returns 影響行数（0 = 対象が org 非メンバーで拒否）
     */
    async upsertBoardRole(params: {
      boardId: string;
      userId: string;
      role: BoardRoleValue;
      now: number;
    }): Promise<number> {
      const res = await d1
        .prepare(
          `INSERT INTO board_role (board_id, organization_id, user_id, role, created_at, updated_at)
           SELECT b.id, b.organization_id, ?, ?, ?, ?
           FROM board b JOIN member m ON m.organization_id = b.organization_id
           WHERE b.id = ? AND m.user_id = ?
           ON CONFLICT(board_id, user_id) DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at`,
        )
        .bind(
          params.userId,
          params.role,
          params.now,
          params.now,
          params.boardId,
          params.userId,
        )
        .run();
      return res.meta.changes ?? 0;
    },

    /** board_role 一覧（ACL 表示用）。 */
    async listBoardRoles(boardId: string): Promise<BoardRoleEntry[]> {
      const rows = await db
        .select({ userId: boardRole.userId, role: boardRole.role })
        .from(boardRole)
        .where(eq(boardRole.boardId, boardId))
        .all();
      return rows;
    },

    /**
     * お気に入り追加を **§8.2 の原子的 conditional insert** で行う。
     * 自分（org メンバー）が対象なので通常 1 行。既にお気に入り済みなら 0 行（冪等）。
     */
    async addFavorite(params: {
      boardId: string;
      userId: string;
      now: number;
    }): Promise<void> {
      await d1
        .prepare(
          `INSERT INTO board_favorite (user_id, organization_id, board_id, created_at)
           SELECT ?, b.organization_id, b.id, ?
           FROM board b JOIN member m ON m.organization_id = b.organization_id
           WHERE b.id = ? AND m.user_id = ?
           ON CONFLICT(user_id, board_id) DO NOTHING`,
        )
        .bind(params.userId, params.now, params.boardId, params.userId)
        .run();
    },

    /** お気に入り解除。 */
    async removeFavorite(params: {
      boardId: string;
      userId: string;
    }): Promise<void> {
      await db
        .delete(boardFavorite)
        .where(
          and(
            eq(boardFavorite.boardId, params.boardId),
            eq(boardFavorite.userId, params.userId),
          ),
        );
    },

    /**
     * 削除 Saga 最終段（§8.1 ready_to_delete→done）の D1 ハード削除。`board` を消すと FK CASCADE で
     * board_role / board_favorite / comment_thread(→comment→mention/notification) /
     * board_r2_object(→asset) が連動削除される。deletion_job は FK 無しで残る（finish で done）。
     */
    async hardDeleteBoard(params: { boardId: string }): Promise<void> {
      await db.delete(board).where(eq(board.id, params.boardId));
    },
  };
}
