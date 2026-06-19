import {
  BoardForbiddenError,
  BoardNotFoundError,
} from "../../domain/errors/board.error";
import { ValidationError } from "../../domain/errors/domain.error";
import { canManage } from "../../domain/services/board-access";
import type { BoardRoleValue } from "../../domain/types/board";
import type { createAuditRepository } from "../../infrastructure/repositories/audit.repository";
import type { createBoardRepository } from "../../infrastructure/repositories/board.repository";
import { recordAudit } from "./audit";
import type { createGetEffectiveRoleService } from "./get-effective-role.service";

type Deps = {
  boardRepo: ReturnType<typeof createBoardRepository>;
  getEffectiveRole: ReturnType<typeof createGetEffectiveRoleService>;
  auditRepo: ReturnType<typeof createAuditRepository>;
  /** 失効切断（M7・即時 revoke）: 降格時に対象ユーザーの WS を即時切断する。 */
  revokeUser: (boardId: string, userId: string) => Promise<void>;
};

/**
 * board_role の付与/変更。実行者は board owner（M8 canManage）のみ。
 * 付与対象が org メンバーであることは §8.2 の原子的 conditional insert で担保し、
 * 非メンバー（0 行）は ValidationError で拒否する（テナント境界）。
 */
export function createSetBoardRoleService(deps: Deps) {
  return {
    async execute(params: {
      boardId: string;
      organizationId: string;
      actingUserId: string;
      targetUserId: string;
      role: BoardRoleValue;
    }): Promise<void> {
      const found = await deps.boardRepo.getBoardForOrg({
        boardId: params.boardId,
        organizationId: params.organizationId,
      });
      if (!found) throw new BoardNotFoundError(params.boardId);

      const actingRole = await deps.getEffectiveRole.execute({
        boardId: params.boardId,
        organizationId: params.organizationId,
        userId: params.actingUserId,
      });
      if (!canManage(actingRole)) throw new BoardForbiddenError();

      const changes = await deps.boardRepo.upsertBoardRole({
        boardId: params.boardId,
        userId: params.targetUserId,
        role: params.role,
        now: Date.now(),
      });
      if (changes === 0) {
        throw new ValidationError("対象ユーザーは組織のメンバーではありません");
      }

      await recordAudit(deps.auditRepo, {
        organizationId: params.organizationId,
        actorUserId: params.actingUserId,
        action: "board.role_changed",
        targetType: "board",
        targetId: params.boardId,
        metadata: { targetUserId: params.targetUserId, role: params.role },
      });

      // M7: viewer 降格時は対象の編集 WS を即時切断（期限付き再認可の補助）。
      // org owner/admin は board_role に関わらず owner 相当のため revoke しない。
      if (params.role === "viewer") {
        await deps.revokeUser(params.boardId, params.targetUserId);
      }
    },
  };
}
