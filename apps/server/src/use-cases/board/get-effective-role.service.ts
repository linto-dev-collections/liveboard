import { resolveEffectiveRole } from "../../domain/services/board-access";
import type { EffectiveRole } from "../../domain/types/board";
import type { createBoardRepository } from "../../infrastructure/repositories/board.repository";

type Deps = {
  boardRepo: ReturnType<typeof createBoardRepository>;
};

/**
 * 権限解決（M8）の use-case。repository から orgRole / boardRole を集め、
 * 純関数 `resolveEffectiveRole` で実効ロールを返す。
 * REST（本フェーズ）と WS 認可（Phase 2）の双方から再利用する。
 */
export function createGetEffectiveRoleService(deps: Deps) {
  return {
    async execute(params: {
      boardId: string;
      organizationId: string;
      userId: string;
    }): Promise<EffectiveRole | null> {
      const [orgRole, boardRole] = await Promise.all([
        deps.boardRepo.getOrgRole({
          organizationId: params.organizationId,
          userId: params.userId,
        }),
        deps.boardRepo.getBoardRole({
          boardId: params.boardId,
          userId: params.userId,
        }),
      ]);
      return resolveEffectiveRole({ orgRole, boardRole });
    },
  };
}
