import { zValidator } from "@hono/zod-validator";
import {
  createCommentSchema,
  createThreadSchema,
  listThreadsQuerySchema,
  mentionableQuerySchema,
  resolveThreadSchema,
  updateCommentSchema,
} from "@liveboard/shared/schemas";
import type { Context } from "hono";
import { Hono } from "hono";
import { getServerByName } from "partyserver";
import { canManage } from "../domain/services/board-access";
import type { Board } from "../domain/types/board";
import type { CommentThreadView } from "../domain/types/comment";
import { createBoardRepository } from "../infrastructure/repositories/board.repository";
import { createCommentRepository } from "../infrastructure/repositories/comment.repository";
import { createNotificationRepository } from "../infrastructure/repositories/notification.repository";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import type {
  CommentEventKind,
  CommentMessage,
  NotificationMessage,
} from "../realtime/protocol";
import type { AppEnv } from "../types";
import { createGetBoardService } from "../use-cases/board/get-board.service";
import { createGetEffectiveRoleService } from "../use-cases/board/get-effective-role.service";
import { createAddCommentService } from "../use-cases/comment/add-comment.service";
import { createCreateThreadService } from "../use-cases/comment/create-thread.service";
import { createDeleteCommentService } from "../use-cases/comment/delete-comment.service";
import { createListThreadsService } from "../use-cases/comment/list-threads.service";
import { createResolveThreadService } from "../use-cases/comment/resolve-thread.service";
import { createUpdateCommentService } from "../use-cases/comment/update-comment.service";

/** メンション補完の最大候補数。 */
const MENTIONABLE_LIMIT = 10;

/**
 * board の存在・org スコープ・実効ロールを解決する（M8/M9 の再認可）。
 * 非メンバー・別 org・不存在は `getBoard` が 404 を投げる（IDOR 防止）。
 */
async function requireBoardAccess(
  c: Context<AppEnv>,
  boardId: string,
): Promise<{ board: Board; effectiveRole: "owner" | "editor" | "viewer" }> {
  const boardRepo = createBoardRepository(c.env.DB);
  const getBoard = createGetBoardService({
    boardRepo,
    getEffectiveRole: createGetEffectiveRoleService({ boardRepo }),
  });
  return getBoard.execute({
    boardId,
    organizationId: c.get("activeOrganizationId"),
    userId: c.get("user").id,
  });
}

/**
 * route → DO のコメント配信（D1 永続化後・best-effort）。DO 障害でも D1 が正本のため
 * レスポンスは成功させる（参加者は次回 GET /comments で整合する）。
 */
async function broadcastComment(
  c: Context<AppEnv>,
  boardId: string,
  message: CommentMessage,
  notify?: { userIds: string[]; notification: NotificationMessage },
): Promise<void> {
  try {
    const stub = await getServerByName(c.env.Board, boardId);
    await stub.broadcastCommentEvent({
      message,
      notifyUserIds: notify?.userIds ?? [],
      notification: notify?.notification ?? null,
    });
  } catch (error) {
    console.error("[comment] broadcast failed", error);
  }
}

/** thread の最新コメントを被メンション即時通知（NOTIFICATION）の本体に整形する。 */
function buildMentionNotification(
  c: Context<AppEnv>,
  board: Board,
  thread: CommentThreadView,
): NotificationMessage | null {
  const last = thread.comments.at(-1);
  if (!last) return null;
  const user = c.get("user");
  return {
    type: "NOTIFICATION",
    notification: {
      // ボード上のトースト用の代表 ID（通知センターは GET で実 ID を取得する）。
      id: `mention:${last.id}`,
      type: "mention",
      commentId: last.id,
      threadId: thread.id,
      boardId: board.id,
      boardTitle: board.title,
      actorUserId: user.id,
      actorName: user.name ?? null,
      commentBody: last.body,
      readAt: null,
      createdAt: last.createdAt,
    },
  };
}

/** COMMENT メッセージ（thread upsert 系）を作る。 */
function threadMessage(
  event: CommentEventKind,
  thread: CommentThreadView,
): CommentMessage {
  return { type: "COMMENT", event, thread };
}

/**
 * コメント・メンション REST（`/api/boards/:id/comments` 系・`/mentionable`）。
 *
 * - 認証＋org スコープ＋board メンバー（requireBoardAccess が非メンバーを 404）。
 * - コメント可否: board メンバーは全ロール可（viewer も可・F-CM）。編集は author、削除は author/owner。
 * - **D1 が正本**: route が永続化し、DO へは配信のみ依頼（getServerByName）。
 * - メンション/通知はテナント境界（§8.2）の原子的 INSERT で org メンバーのみ。
 */
export const commentRoute = new Hono<AppEnv>()
  .use("/*", authMiddleware)
  // スレッド一覧（resolved 絞り込み）
  .get(
    "/:id/comments",
    requirePermission("board", "read"),
    zValidator("query", listThreadsQuerySchema),
    async (c) => {
      const boardId = c.req.param("id");
      await requireBoardAccess(c, boardId);
      const { resolved } = c.req.valid("query");

      const service = createListThreadsService({
        commentRepo: createCommentRepository(c.env.DB),
      });
      const threads = await service.execute({ boardId, resolved });
      return c.json({ threads });
    },
  )
  // スレッド作成（最初のコメント）
  .post(
    "/:id/comments",
    requirePermission("board", "read"),
    zValidator("json", createThreadSchema),
    async (c) => {
      const boardId = c.req.param("id");
      const { board } = await requireBoardAccess(c, boardId);
      const input = c.req.valid("json");

      const service = createCreateThreadService({
        commentRepo: createCommentRepository(c.env.DB),
        notificationRepo: createNotificationRepository(c.env.DB),
      });
      const { thread, notifyUserIds } = await service.execute({
        boardId,
        userId: c.get("user").id,
        anchorKind: input.anchorKind,
        anchorElementId: input.anchorElementId ?? null,
        anchorX: input.anchorX ?? null,
        anchorY: input.anchorY ?? null,
        body: input.body,
        mentionedUserIds: input.mentionedUserIds ?? [],
      });

      const notification = buildMentionNotification(c, board, thread);
      await broadcastComment(
        c,
        boardId,
        threadMessage("thread_created", thread),
        notification && notifyUserIds.length > 0
          ? { userIds: notifyUserIds, notification }
          : undefined,
      );
      return c.json({ thread }, 201);
    },
  )
  // 返信（既存スレッドへコメント追加）
  .post(
    "/:id/comments/:threadId",
    requirePermission("board", "read"),
    zValidator("json", createCommentSchema),
    async (c) => {
      const boardId = c.req.param("id");
      const threadId = c.req.param("threadId");
      const { board } = await requireBoardAccess(c, boardId);
      const input = c.req.valid("json");

      const service = createAddCommentService({
        commentRepo: createCommentRepository(c.env.DB),
        notificationRepo: createNotificationRepository(c.env.DB),
      });
      const { thread, notifyUserIds } = await service.execute({
        boardId,
        threadId,
        userId: c.get("user").id,
        body: input.body,
        mentionedUserIds: input.mentionedUserIds ?? [],
      });

      const notification = buildMentionNotification(c, board, thread);
      await broadcastComment(
        c,
        boardId,
        threadMessage("comment_added", thread),
        notification && notifyUserIds.length > 0
          ? { userIds: notifyUserIds, notification }
          : undefined,
      );
      return c.json({ thread }, 201);
    },
  )
  // 解決 / 再オープン
  .put(
    "/:id/comments/:threadId/resolve",
    requirePermission("board", "read"),
    zValidator("json", resolveThreadSchema),
    async (c) => {
      const boardId = c.req.param("id");
      const threadId = c.req.param("threadId");
      await requireBoardAccess(c, boardId);
      const { resolved } = c.req.valid("json");

      const service = createResolveThreadService({
        commentRepo: createCommentRepository(c.env.DB),
      });
      const { thread } = await service.execute({
        boardId,
        threadId,
        userId: c.get("user").id,
        resolved,
      });
      await broadcastComment(
        c,
        boardId,
        threadMessage("thread_resolved", thread),
      );
      return c.json({ thread });
    },
  )
  // コメント編集（author のみ）
  .patch(
    "/:id/comments/items/:commentId",
    requirePermission("board", "read"),
    zValidator("json", updateCommentSchema),
    async (c) => {
      const boardId = c.req.param("id");
      const commentId = c.req.param("commentId");
      await requireBoardAccess(c, boardId);
      const { body } = c.req.valid("json");

      const service = createUpdateCommentService({
        commentRepo: createCommentRepository(c.env.DB),
      });
      const { thread } = await service.execute({
        boardId,
        commentId,
        userId: c.get("user").id,
        body,
      });
      await broadcastComment(
        c,
        boardId,
        threadMessage("comment_updated", thread),
      );
      return c.json({ thread });
    },
  )
  // コメント削除（author / board owner）
  .delete(
    "/:id/comments/items/:commentId",
    requirePermission("board", "read"),
    async (c) => {
      const boardId = c.req.param("id");
      const commentId = c.req.param("commentId");
      const { effectiveRole } = await requireBoardAccess(c, boardId);

      const service = createDeleteCommentService({
        commentRepo: createCommentRepository(c.env.DB),
      });
      const result = await service.execute({
        boardId,
        commentId,
        userId: c.get("user").id,
        canManage: canManage(effectiveRole),
      });

      const message: CommentMessage = result.threadDeleted
        ? {
            type: "COMMENT",
            event: "comment_deleted",
            threadId: result.threadId,
            commentId,
            threadDeleted: true,
          }
        : {
            type: "COMMENT",
            event: "comment_deleted",
            threadId: result.threadId,
            commentId,
            thread: result.thread ?? undefined,
          };
      await broadcastComment(c, boardId, message);
      return c.json({ success: true });
    },
  )
  // メンション補完（org メンバー前方一致）
  .get(
    "/:id/mentionable",
    requirePermission("board", "read"),
    zValidator("query", mentionableQuerySchema),
    async (c) => {
      const boardId = c.req.param("id");
      await requireBoardAccess(c, boardId);
      const { q } = c.req.valid("query");

      const users = await createCommentRepository(
        c.env.DB,
      ).listMentionableUsers({
        organizationId: c.get("activeOrganizationId"),
        q,
        limit: MENTIONABLE_LIMIT,
      });
      return c.json({ users });
    },
  );
