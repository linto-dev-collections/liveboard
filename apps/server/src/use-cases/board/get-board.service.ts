import { BoardNotFoundError } from "../../domain/errors/board.error";
import type { Board, EffectiveRole } from "../../domain/types/board";
import type { createBoardRepository } from "../../infrastructure/repositories/board.repository";
import type { createGetEffectiveRoleService } from "./get-effective-role.service";

type Deps = {
  boardRepo: ReturnType<typeof createBoardRepository>;
  getEffectiveRole: ReturnType<typeof createGetEffectiveRoleService>;
};

/**
 * ボード詳細取得。org スコープで存在確認し、呼び出し者の実効ロールも返す。
 * 他組織・非メンバー・存在しないボードは 404（IDOR 防止・存在を漏らさない）。
 */
export function createGetBoardService(deps: Deps) {
  return {
    async execute(params: {
      boardId: string;
      organizationId: string;
      userId: string;
    }): Promise<{ board: Board; effectiveRole: EffectiveRole }> {
      const found = await deps.boardRepo.getBoardForOrg({
        boardId: params.boardId,
        organizationId: params.organizationId,
      });
      if (!found) throw new BoardNotFoundError(params.boardId);

      const effectiveRole = await deps.getEffectiveRole.execute({
        boardId: params.boardId,
        organizationId: params.organizationId,
        userId: params.userId,
      });
      // 非メンバーは存在を漏らさず 404
      if (effectiveRole === null) throw new BoardNotFoundError(params.boardId);

      return { board: found, effectiveRole };
    },
  };
}
