import { CommentNotFoundError } from "../../domain/errors/comment.error";
import type { CommentThreadView } from "../../domain/types/comment";
import type { createCommentRepository } from "../../infrastructure/repositories/comment.repository";

type Deps = {
  commentRepo: ReturnType<typeof createCommentRepository>;
};

/**
 * スレッドの解決 / 再オープン。board メンバーなら可（viewer も可）。
 * 解決時に resolved_at / resolved_by_user_id を記録、再オープンで NULL に戻す。
 */
export function createResolveThreadService(deps: Deps) {
  return {
    async execute(params: {
      boardId: string;
      threadId: string;
      userId: string;
      resolved: boolean;
    }): Promise<{ thread: CommentThreadView }> {
      const exists = await deps.commentRepo.getThreadForBoard({
        threadId: params.threadId,
        boardId: params.boardId,
      });
      if (!exists) throw new CommentNotFoundError();

      await deps.commentRepo.resolveThread({
        threadId: params.threadId,
        boardId: params.boardId,
        userId: params.userId,
        resolved: params.resolved,
        now: Date.now(),
      });

      const thread = await deps.commentRepo.getThreadWithComments({
        threadId: params.threadId,
        boardId: params.boardId,
      });
      if (!thread) throw new CommentNotFoundError();
      return { thread };
    },
  };
}
