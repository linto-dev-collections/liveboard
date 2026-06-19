import type { BoardListItem } from "../../domain/types/board";
import type { createBoardRepository } from "../../infrastructure/repositories/board.repository";

type Deps = {
  boardRepo: ReturnType<typeof createBoardRepository>;
};

/**
 * org スコープのボード一覧。閲覧は org メンバー（route の requirePermission で保証）。
 */
export function createListBoardsService(deps: Deps) {
  return {
    async execute(params: {
      organizationId: string;
      userId: string;
      q?: string;
      favoriteOnly?: boolean;
      sort: "recent" | "title";
    }): Promise<BoardListItem[]> {
      return deps.boardRepo.listBoards(params);
    },
  };
}
