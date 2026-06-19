import type { CommentThreadView } from "../../domain/types/comment";
import type { createCommentRepository } from "../../infrastructure/repositories/comment.repository";

type Deps = {
  commentRepo: ReturnType<typeof createCommentRepository>;
};

/**
 * board のスレッド一覧（各スレッドに comments を同梱）。
 * board アクセスは route で検証済み。`resolved` で未解決/解決を絞り込める。
 */
export function createListThreadsService(deps: Deps) {
  return {
    async execute(params: {
      boardId: string;
      resolved?: boolean;
    }): Promise<CommentThreadView[]> {
      return deps.commentRepo.listThreadsWithComments({
        boardId: params.boardId,
        resolved: params.resolved,
      });
    },
  };
}
