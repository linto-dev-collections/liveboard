import {
  CommentForbiddenError,
  CommentNotFoundError,
} from "../../domain/errors/comment.error";
import type { CommentThreadView } from "../../domain/types/comment";
import type { createCommentRepository } from "../../infrastructure/repositories/comment.repository";

type Deps = {
  commentRepo: ReturnType<typeof createCommentRepository>;
};

/**
 * コメント削除。**author または board owner（canManage）**のみ。
 * スレッド最後の 1 件を消した場合はスレッドごと掃除する（空ピンを残さない）。
 * comment_mention / notification は FK CASCADE で連動削除される。
 */
export function createDeleteCommentService(deps: Deps) {
  return {
    async execute(params: {
      boardId: string;
      commentId: string;
      userId: string;
      canManage: boolean;
    }): Promise<{
      thread: CommentThreadView | null;
      threadId: string;
      threadDeleted: boolean;
    }> {
      const existing = await deps.commentRepo.getCommentForBoard({
        commentId: params.commentId,
        boardId: params.boardId,
      });
      if (!existing) throw new CommentNotFoundError();
      if (existing.authorId !== params.userId && !params.canManage) {
        throw new CommentForbiddenError(
          "このコメントを削除する権限がありません",
        );
      }

      await deps.commentRepo.deleteComment({ commentId: params.commentId });

      const remaining = await deps.commentRepo.countCommentsInThread({
        threadId: existing.threadId,
      });
      if (remaining === 0) {
        await deps.commentRepo.deleteThread({ threadId: existing.threadId });
        return {
          thread: null,
          threadId: existing.threadId,
          threadDeleted: true,
        };
      }

      const thread = await deps.commentRepo.getThreadWithComments({
        threadId: existing.threadId,
        boardId: params.boardId,
      });
      if (!thread) throw new CommentNotFoundError();
      return { thread, threadId: existing.threadId, threadDeleted: false };
    },
  };
}
