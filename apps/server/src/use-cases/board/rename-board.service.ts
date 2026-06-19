import {
  BoardForbiddenError,
  BoardNotFoundError,
} from "../../domain/errors/board.error";
import { canManage } from "../../domain/services/board-access";
import type { createAuditRepository } from "../../infrastructure/repositories/audit.repository";
import type { createBoardRepository } from "../../infrastructure/repositories/board.repository";
import { recordAudit } from "./audit";
import type { createGetEffectiveRoleService } from "./get-effective-role.service";

type Deps = {
  boardRepo: ReturnType<typeof createBoardRepository>;
  getEffectiveRole: ReturnType<typeof createGetEffectiveRoleService>;
  auditRepo: ReturnType<typeof createAuditRepository>;
};

/** ボードのリネーム。board owner（M8 canManage）のみ可。 */
export function createRenameBoardService(deps: Deps) {
  return {
    async execute(params: {
      boardId: string;
      organizationId: string;
      userId: string;
      title: string;
    }): Promise<void> {
      const found = await deps.boardRepo.getBoardForOrg({
        boardId: params.boardId,
        organizationId: params.organizationId,
      });
      if (!found) throw new BoardNotFoundError(params.boardId);

      const role = await deps.getEffectiveRole.execute({
        boardId: params.boardId,
        organizationId: params.organizationId,
        userId: params.userId,
      });
      if (!canManage(role)) throw new BoardForbiddenError();

      await deps.boardRepo.renameBoard({
        boardId: params.boardId,
        organizationId: params.organizationId,
        title: params.title,
      });
      await recordAudit(deps.auditRepo, {
        organizationId: params.organizationId,
        actorUserId: params.userId,
        action: "board.rename",
        targetType: "board",
        targetId: params.boardId,
        metadata: { title: params.title },
      });
    },
  };
}
