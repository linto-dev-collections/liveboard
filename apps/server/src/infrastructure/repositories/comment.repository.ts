import { comment, commentThread, member, user } from "@liveboard/db/schema";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type {
  AnchorKind,
  CommentThreadView,
  CommentView,
  MentionableUser,
} from "../../domain/types/comment";

/** LIKE の特殊文字（`%` `_` `\`）をエスケープし、前方一致を安全にする。 */
function escapeLikePrefix(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * コメントスレッド/コメント/メンションの永続化（テーブル §4.4–4.6・§8.2）。
 *
 * 不変条件:
 *   - **board→org スコープ**: スレッド/コメント取得・更新は必ず boardId で絞り、
 *     thread が当該 board に属することを検証する（同一 org 内の別 board IDOR も防ぐ）。
 *   - **テナント境界（§8.2）**: メンションは `WHERE EXISTS (... JOIN member)` の
 *     原子的 INSERT で org メンバーのみ。非メンバーは 0 行で無視される。
 *   - anchor 整合（element ⇔ point）は DB の CHECK で担保（schema 側の refine と二重防御）。
 */
export function createCommentRepository(d1: D1Database) {
  const db = drizzle(d1);

  /** thread_id ごとにコメント（author 表示情報付き・作成昇順）をまとめる。 */
  async function loadCommentsByThreadIds(
    threadIds: string[],
  ): Promise<Map<string, CommentView[]>> {
    const map = new Map<string, CommentView[]>();
    if (threadIds.length === 0) return map;
    const rows = await db
      .select({
        id: comment.id,
        threadId: comment.threadId,
        authorId: comment.authorId,
        authorName: user.name,
        authorImage: user.image,
        body: comment.body,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
      })
      .from(comment)
      .leftJoin(user, eq(comment.authorId, user.id))
      .where(inArray(comment.threadId, threadIds))
      .orderBy(asc(comment.createdAt))
      .all();
    for (const r of rows) {
      const view: CommentView = {
        id: r.id,
        threadId: r.threadId,
        authorId: r.authorId,
        authorName: r.authorName ?? null,
        authorImage: r.authorImage ?? null,
        body: r.body,
        createdAt: r.createdAt.getTime(),
        updatedAt: r.updatedAt.getTime(),
      };
      const list = map.get(r.threadId);
      if (list) list.push(view);
      else map.set(r.threadId, [view]);
    }
    return map;
  }

  type ThreadRow = typeof commentThread.$inferSelect;
  function toThreadView(
    t: ThreadRow,
    comments: CommentView[],
  ): CommentThreadView {
    return {
      id: t.id,
      boardId: t.boardId,
      anchorKind: t.anchorKind,
      anchorElementId: t.anchorElementId,
      anchorX: t.anchorX,
      anchorY: t.anchorY,
      resolved: t.resolved,
      resolvedAt: t.resolvedAt ? t.resolvedAt.getTime() : null,
      resolvedByUserId: t.resolvedByUserId,
      createdByUserId: t.createdByUserId,
      createdAt: t.createdAt.getTime(),
      updatedAt: t.updatedAt.getTime(),
      comments,
    };
  }

  return {
    /**
     * スレッド＋最初のコメントを **D1 バッチ**で原子的に作成する。
     * anchor 整合は DB CHECK（comment_thread_anchor_check）が担保する。
     */
    async createThreadWithComment(params: {
      threadId: string;
      commentId: string;
      boardId: string;
      anchorKind: AnchorKind;
      anchorElementId: string | null;
      anchorX: number | null;
      anchorY: number | null;
      body: string;
      userId: string;
    }): Promise<void> {
      await db.batch([
        db.insert(commentThread).values({
          id: params.threadId,
          boardId: params.boardId,
          anchorKind: params.anchorKind,
          anchorElementId: params.anchorElementId,
          anchorX: params.anchorX,
          anchorY: params.anchorY,
          createdByUserId: params.userId,
        }),
        db.insert(comment).values({
          id: params.commentId,
          threadId: params.threadId,
          authorId: params.userId,
          body: params.body,
        }),
      ]);
    },

    /**
     * 既存スレッドへ返信。thread が当該 board に属する場合のみ INSERT（board→org スコープ）。
     * @returns 影響行数（0 = thread が board に存在せず → 404）
     */
    async addComment(params: {
      commentId: string;
      threadId: string;
      boardId: string;
      body: string;
      userId: string;
      now: number;
    }): Promise<number> {
      const res = await d1
        .prepare(
          `INSERT INTO comment (id, thread_id, author_id, body, created_at, updated_at)
           SELECT ?, ?, ?, ?, ?, ?
           WHERE EXISTS (
             SELECT 1 FROM comment_thread ct WHERE ct.id = ? AND ct.board_id = ?
           )`,
        )
        .bind(
          params.commentId,
          params.threadId,
          params.userId,
          params.body,
          params.now,
          params.now,
          params.threadId,
          params.boardId,
        )
        .run();
      return res.meta.changes ?? 0;
    },

    /** コメント 1 件を board スコープで取得（編集/削除の認可判定用）。 */
    async getCommentForBoard(params: {
      commentId: string;
      boardId: string;
    }): Promise<{
      id: string;
      threadId: string;
      authorId: string | null;
    } | null> {
      const row = await db
        .select({
          id: comment.id,
          threadId: comment.threadId,
          authorId: comment.authorId,
        })
        .from(comment)
        .innerJoin(commentThread, eq(comment.threadId, commentThread.id))
        .where(
          and(
            eq(comment.id, params.commentId),
            eq(commentThread.boardId, params.boardId),
          ),
        )
        .get();
      return row ?? null;
    },

    /** コメント本文を更新（呼び出し側で author 認可済み）。 */
    async updateComment(params: {
      commentId: string;
      body: string;
      now: number;
    }): Promise<void> {
      await db
        .update(comment)
        .set({ body: params.body, updatedAt: new Date(params.now) })
        .where(eq(comment.id, params.commentId));
    },

    /** コメント削除（comment_mention/notification は FK CASCADE で削除）。 */
    async deleteComment(params: { commentId: string }): Promise<void> {
      await db.delete(comment).where(eq(comment.id, params.commentId));
    },

    /** スレッド内の残コメント数（最後の 1 件削除後にスレッドを掃除するため）。 */
    async countCommentsInThread(params: { threadId: string }): Promise<number> {
      const row = await db
        .select({ c: sql<number>`COUNT(*)` })
        .from(comment)
        .where(eq(comment.threadId, params.threadId))
        .get();
      return row?.c ?? 0;
    },

    /** スレッド削除（残コメント 0 のとき・comment も CASCADE）。 */
    async deleteThread(params: { threadId: string }): Promise<void> {
      await db
        .delete(commentThread)
        .where(eq(commentThread.id, params.threadId));
    },

    /** スレッドの存在を board スコープで確認（解決/再オープンの 404 判定用）。 */
    async getThreadForBoard(params: {
      threadId: string;
      boardId: string;
    }): Promise<{ id: string } | null> {
      const row = await db
        .select({ id: commentThread.id })
        .from(commentThread)
        .where(
          and(
            eq(commentThread.id, params.threadId),
            eq(commentThread.boardId, params.boardId),
          ),
        )
        .get();
      return row ?? null;
    },

    /** スレッドの解決 / 再オープン（board スコープ）。 */
    async resolveThread(params: {
      threadId: string;
      boardId: string;
      userId: string;
      resolved: boolean;
      now: number;
    }): Promise<void> {
      await db
        .update(commentThread)
        .set({
          resolved: params.resolved,
          resolvedAt: params.resolved ? new Date(params.now) : null,
          resolvedByUserId: params.resolved ? params.userId : null,
        })
        .where(
          and(
            eq(commentThread.id, params.threadId),
            eq(commentThread.boardId, params.boardId),
          ),
        );
    },

    /** board のスレッド一覧（resolved 絞り込み・各スレッドに comments を同梱）。 */
    async listThreadsWithComments(params: {
      boardId: string;
      resolved?: boolean;
    }): Promise<CommentThreadView[]> {
      const conditions = [eq(commentThread.boardId, params.boardId)];
      if (params.resolved !== undefined) {
        conditions.push(eq(commentThread.resolved, params.resolved));
      }
      const threads = await db
        .select()
        .from(commentThread)
        .where(and(...conditions))
        .orderBy(asc(commentThread.createdAt))
        .all();
      const commentsMap = await loadCommentsByThreadIds(
        threads.map((t) => t.id),
      );
      return threads.map((t) => toThreadView(t, commentsMap.get(t.id) ?? []));
    },

    /** スレッド 1 件＋comments を board スコープで取得（broadcast ペイロード構築用）。 */
    async getThreadWithComments(params: {
      threadId: string;
      boardId: string;
    }): Promise<CommentThreadView | null> {
      const t = await db
        .select()
        .from(commentThread)
        .where(
          and(
            eq(commentThread.id, params.threadId),
            eq(commentThread.boardId, params.boardId),
          ),
        )
        .get();
      if (!t) return null;
      const commentsMap = await loadCommentsByThreadIds([t.id]);
      return toThreadView(t, commentsMap.get(t.id) ?? []);
    },

    /**
     * §8.2 メンションの**原子的 INSERT**（テナント境界）。被メンションが当該コメントの
     * board の org メンバーである場合のみ insert する。非メンバーは EXISTS 不成立で 0 行。
     * 重複（同一 comment×user）は PK 競合で無視。userIds は呼び出し側で重複排除済み想定。
     */
    async addMentionsAtomic(params: {
      commentId: string;
      userIds: string[];
      now: number;
    }): Promise<void> {
      if (params.userIds.length === 0) return;
      const stmt = d1.prepare(
        `INSERT INTO comment_mention (comment_id, mentioned_user_id, created_at)
         SELECT ?1, ?2, ?3
         WHERE EXISTS (
           SELECT 1 FROM comment c
           JOIN comment_thread ct ON ct.id = c.thread_id
           JOIN board b ON b.id = ct.board_id
           JOIN member m ON m.organization_id = b.organization_id
           WHERE c.id = ?1 AND m.user_id = ?2
         )
         ON CONFLICT (comment_id, mentioned_user_id) DO NOTHING`,
      );
      await d1.batch(
        params.userIds.map((uid) =>
          stmt.bind(params.commentId, uid, params.now),
        ),
      );
    },

    /**
     * メンション補完候補（当該 org のメンバー）。`q` は氏名/メールの前方一致。
     * org 外ユーザーは候補に出さない（テナント境界・補完段階でも漏らさない）。
     */
    async listMentionableUsers(params: {
      organizationId: string;
      q?: string;
      limit: number;
    }): Promise<MentionableUser[]> {
      const conditions = [eq(member.organizationId, params.organizationId)];
      if (params.q && params.q.length > 0) {
        const pattern = `${escapeLikePrefix(params.q)}%`;
        conditions.push(
          sql`(${user.name} COLLATE NOCASE LIKE ${pattern} ESCAPE '\\' OR ${user.email} COLLATE NOCASE LIKE ${pattern} ESCAPE '\\')`,
        );
      }
      const rows = await db
        .select({
          userId: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        })
        .from(member)
        .innerJoin(user, eq(member.userId, user.id))
        .where(and(...conditions))
        .orderBy(asc(sql`${user.name} COLLATE NOCASE`))
        .limit(params.limit)
        .all();
      return rows.map((r) => ({
        userId: r.userId,
        name: r.name,
        email: r.email,
        image: r.image ?? null,
      }));
    },
  };
}
