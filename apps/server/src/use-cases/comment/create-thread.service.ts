import { CommentNotFoundError } from "../../domain/errors/comment.error";
import type { AnchorKind, CommentThreadView } from "../../domain/types/comment";
import type { createCommentRepository } from "../../infrastructure/repositories/comment.repository";
import type { createNotificationRepository } from "../../infrastructure/repositories/notification.repository";
import { persistMentions } from "./persist-mentions";

type Deps = {
  commentRepo: ReturnType<typeof createCommentRepository>;
  notificationRepo: ReturnType<typeof createNotificationRepository>;
};

/**
 * スレッド作成（最初のコメント＋メンション＋通知を原子的に永続化）。
 * board アクセス（org スコープ＋メンバー性）は route の requireBoardAccess で検証済み。
 * 返す `thread` を route が DO へ broadcast し、`notifyUserIds` をオンライン即時通知に使う。
 */
export function createCreateThreadService(deps: Deps) {
  return {
    async execute(params: {
      boardId: string;
      userId: string;
      anchorKind: AnchorKind;
      anchorElementId: string | null;
      anchorX: number | null;
      anchorY: number | null;
      body: string;
      mentionedUserIds: string[];
    }): Promise<{ thread: CommentThreadView; notifyUserIds: string[] }> {
      const threadId = crypto.randomUUID();
      const commentId = crypto.randomUUID();
      const now = Date.now();

      await deps.commentRepo.createThreadWithComment({
        threadId,
        commentId,
        boardId: params.boardId,
        anchorKind: params.anchorKind,
        anchorElementId: params.anchorElementId,
        anchorX: params.anchorX,
        anchorY: params.anchorY,
        body: params.body,
        userId: params.userId,
      });

      const notifyUserIds = await persistMentions(deps, {
        boardId: params.boardId,
        commentId,
        actorUserId: params.userId,
        mentionedUserIds: params.mentionedUserIds,
        now,
      });

      const thread = await deps.commentRepo.getThreadWithComments({
        threadId,
        boardId: params.boardId,
      });
      if (!thread) throw new CommentNotFoundError();
      return { thread, notifyUserIds };
    },
  };
}
