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

/**
 * ボード削除要求。board owner（M8 canManage）のみ可。
 * 即時物理削除はせず `deletion_state='purging'` + deletion_job(queued) を投入する。
 * 以降の WS 入室は Phase 2 認可（deletion_state != 'active'）で拒否される。
 * Saga 実行自体は Phase 6。
 */
export function createRequestBoardDeletionService(deps: Deps) {
  return {
    async execute(params: {
      boardId: string;
      organizationId: string;
      userId: string;
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

      await deps.boardRepo.requestBoardDeletion({
        boardId: params.boardId,
        organizationId: params.organizationId,
        userId: params.userId,
        jobId: crypto.randomUUID(),
        now: Date.now(),
      });
      await recordAudit(deps.auditRepo, {
        organizationId: params.organizationId,
        actorUserId: params.userId,
        action: "board.delete",
        targetType: "board",
        targetId: params.boardId,
      });
    },
  };
}
