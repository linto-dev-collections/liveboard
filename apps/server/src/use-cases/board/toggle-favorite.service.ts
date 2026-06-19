import { BoardNotFoundError } from "../../domain/errors/board.error";
import type { createBoardRepository } from "../../infrastructure/repositories/board.repository";

type Deps = {
  boardRepo: ReturnType<typeof createBoardRepository>;
};

/**
 * 自分のお気に入りを追加/解除する。対象ボードは org スコープで存在確認（404）。
 * 追加は §8.2 の原子的 conditional insert（自分が org メンバーであることを担保）。
 */
export function createToggleFavoriteService(deps: Deps) {
  return {
    async execute(params: {
      boardId: string;
      organizationId: string;
      userId: string;
      favorite: boolean;
    }): Promise<void> {
      const found = await deps.boardRepo.getBoardForOrg({
        boardId: params.boardId,
        organizationId: params.organizationId,
      });
      if (!found) throw new BoardNotFoundError(params.boardId);

      if (params.favorite) {
        await deps.boardRepo.addFavorite({
          boardId: params.boardId,
          userId: params.userId,
          now: Date.now(),
        });
      } else {
        await deps.boardRepo.removeFavorite({
          boardId: params.boardId,
          userId: params.userId,
        });
      }
    },
  };
}
