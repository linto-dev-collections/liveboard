import {
  board,
  comment,
  commentThread,
  notification,
  user,
} from "@liveboard/db/schema";
import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { NotificationView } from "../../domain/types/comment";

/**
 * 通知（mention）の永続化（テーブル §4.7・§8.2・F4/F5）。
 *
 * 不変条件:
 *   - **テナント境界（§8.2）**: 通知は `WHERE EXISTS (... JOIN member)` の原子的 INSERT で
 *     org メンバーのみ。org 外への通知は 0 行で作られない。
 *   - **org 整合（MF4）**: `organization_id` はコメントの board の org から取得し一致を保証。
 *   - **dedup**: UNIQUE(type, user_id, comment_id) ＋ `ON CONFLICT DO NOTHING` で再試行重複を排除。
 *   - **自分宛のみ**: list/markRead/count は常に userId＋organizationId でスコープ（IDOR 防止）。
 */
export function createNotificationRepository(d1: D1Database) {
  const db = drizzle(d1);

  return {
    /**
     * §8.2 メンション通知の**原子的 INSERT**。被通知ごとに 1 文を batch 実行する。
     * board の org を `organization_id` に焼き込み（非正規化を安全維持）、被通知が
     * その org のメンバーである場合のみ作成する。recipients は actor を除外・重複排除済み想定。
     */
    async createMentionNotificationsAtomic(params: {
      boardId: string;
      commentId: string;
      actorUserId: string;
      recipients: { id: string; userId: string }[];
      now: number;
    }): Promise<void> {
      if (params.recipients.length === 0) return;
      const stmt = d1.prepare(
        `INSERT INTO notification (id, user_id, organization_id, type, comment_id, actor_user_id, read_at, created_at)
         SELECT ?1, ?2, b.organization_id, 'mention', ?3, ?4, NULL, ?5
         FROM board b JOIN member m ON m.organization_id = b.organization_id
         WHERE b.id = ?6 AND m.user_id = ?2
         ON CONFLICT (type, user_id, comment_id) DO NOTHING`,
      );
      await d1.batch(
        params.recipients.map((r) =>
          stmt.bind(
            r.id,
            r.userId,
            params.commentId,
            params.actorUserId,
            params.now,
            params.boardId,
          ),
        ),
      );
    },

    /**
     * 自分宛の通知一覧（org スコープ・新しい順）。`unreadOnly` で未読のみ、
     * `cursor`（createdAt epoch ミリ秒）未満で続きを取得する。
     * 表示用に actor 氏名・コメント本文・遷移先 board/thread を JOIN で同梱する。
     */
    async listNotifications(params: {
      userId: string;
      organizationId: string;
      unreadOnly?: boolean;
      cursor?: number;
      limit: number;
    }): Promise<NotificationView[]> {
      const conditions = [
        eq(notification.userId, params.userId),
        eq(notification.organizationId, params.organizationId),
      ];
      if (params.unreadOnly) conditions.push(isNull(notification.readAt));
      if (params.cursor !== undefined) {
        conditions.push(lt(notification.createdAt, new Date(params.cursor)));
      }

      const rows = await db
        .select({
          id: notification.id,
          type: notification.type,
          commentId: notification.commentId,
          threadId: comment.threadId,
          boardId: commentThread.boardId,
          boardTitle: board.title,
          actorUserId: notification.actorUserId,
          actorName: user.name,
          commentBody: comment.body,
          readAt: notification.readAt,
          createdAt: notification.createdAt,
        })
        .from(notification)
        .innerJoin(comment, eq(notification.commentId, comment.id))
        .innerJoin(commentThread, eq(comment.threadId, commentThread.id))
        .innerJoin(board, eq(commentThread.boardId, board.id))
        .leftJoin(user, eq(notification.actorUserId, user.id))
        .where(and(...conditions))
        .orderBy(desc(notification.createdAt))
        .limit(params.limit)
        .all();

      return rows.map((r) => ({
        id: r.id,
        type: r.type,
        commentId: r.commentId,
        threadId: r.threadId,
        boardId: r.boardId,
        boardTitle: r.boardTitle ?? null,
        actorUserId: r.actorUserId,
        actorName: r.actorName ?? null,
        commentBody: r.commentBody,
        readAt: r.readAt ? r.readAt.getTime() : null,
        createdAt: r.createdAt.getTime(),
      }));
    },

    /**
     * 既読化（自分宛・org スコープ・未読のみ）。`ids` 指定で個別、未指定で全件。
     * 空配列は明示的に「何もしない」。
     */
    async markRead(params: {
      userId: string;
      organizationId: string;
      ids?: string[];
      now: number;
    }): Promise<void> {
      if (params.ids && params.ids.length === 0) return;
      const conditions = [
        eq(notification.userId, params.userId),
        eq(notification.organizationId, params.organizationId),
        isNull(notification.readAt),
      ];
      if (params.ids) {
        conditions.push(inArray(notification.id, params.ids));
      }
      await db
        .update(notification)
        .set({ readAt: new Date(params.now) })
        .where(and(...conditions));
    },

    /** 自分宛の未読数（org スコープ・ベルバッジ用）。 */
    async countUnread(params: {
      userId: string;
      organizationId: string;
    }): Promise<number> {
      const row = await db
        .select({ c: sql<number>`COUNT(*)` })
        .from(notification)
        .where(
          and(
            eq(notification.userId, params.userId),
            eq(notification.organizationId, params.organizationId),
            isNull(notification.readAt),
          ),
        )
        .get();
      return row?.c ?? 0;
    },
  };
}
