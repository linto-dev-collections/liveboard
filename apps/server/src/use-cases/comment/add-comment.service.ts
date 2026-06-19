import { CommentNotFoundError } from "../../domain/errors/comment.error";
import type { CommentThreadView } from "../../domain/types/comment";
import type { createCommentRepository } from "../../infrastructure/repositories/comment.repository";
import type { createNotificationRepository } from "../../infrastructure/repositories/notification.repository";
import { persistMentions } from "./persist-mentions";

type Deps = {
  commentRepo: ReturnType<typeof createCommentRepository>;
  notificationRepo: ReturnType<typeof createNotificationRepository>;
};

/**
 * 既存スレッドへの返信（コメント＋メンション＋通知を永続化）。
 * thread が当該 board に属さなければ addComment が 0 行となり 404。
 */
export function createAddCommentService(deps: Deps) {
  return {
    async execute(params: {
      boardId: string;
      threadId: string;
      userId: string;
      body: string;
      mentionedUserIds: string[];
    }): Promise<{ thread: CommentThreadView; notifyUserIds: string[] }> {
      const commentId = crypto.randomUUID();
      const now = Date.now();

      const changes = await deps.commentRepo.addComment({
        commentId,
        threadId: params.threadId,
        boardId: params.boardId,
        body: params.body,
        userId: params.userId,
        now,
      });
      if (changes === 0) throw new CommentNotFoundError();

      const notifyUserIds = await persistMentions(deps, {
        boardId: params.boardId,
        commentId,
        actorUserId: params.userId,
        mentionedUserIds: params.mentionedUserIds,
        now,
      });

      const thread = await deps.commentRepo.getThreadWithComments({
        threadId: params.threadId,
        boardId: params.boardId,
      });
      if (!thread) throw new CommentNotFoundError();
      return { thread, notifyUserIds };
    },
  };
}
