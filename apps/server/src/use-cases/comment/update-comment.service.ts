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
 * コメント本文の編集。**author のみ**（board owner でも他人のコメントは編集不可）。
 * 編集ではメンション/通知は再生成しない（仕様簡素化・本文のみ更新）。
 */
export function createUpdateCommentService(deps: Deps) {
  return {
    async execute(params: {
      boardId: string;
      commentId: string;
      userId: string;
      body: string;
    }): Promise<{ thread: CommentThreadView }> {
      const existing = await deps.commentRepo.getCommentForBoard({
        commentId: params.commentId,
        boardId: params.boardId,
      });
      if (!existing) throw new CommentNotFoundError();
      if (existing.authorId !== params.userId) {
        throw new CommentForbiddenError("自分のコメントのみ編集できます");
      }

      await deps.commentRepo.updateComment({
        commentId: params.commentId,
        body: params.body,
        now: Date.now(),
      });

      const thread = await deps.commentRepo.getThreadWithComments({
        threadId: existing.threadId,
        boardId: params.boardId,
      });
      if (!thread) throw new CommentNotFoundError();
      return { thread };
    },
  };
}
