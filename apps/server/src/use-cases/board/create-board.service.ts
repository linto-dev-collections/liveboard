import type { createAuditRepository } from "../../infrastructure/repositories/audit.repository";
import type { createBoardRepository } from "../../infrastructure/repositories/board.repository";
import { recordAudit } from "./audit";

type Deps = {
  boardRepo: ReturnType<typeof createBoardRepository>;
  auditRepo: ReturnType<typeof createAuditRepository>;
};

/**
 * ボード作成。作成者を owner board_role として原子的に登録する。
 * org メンバー性は board_role の複合 FK（member）で DB 強制される。
 */
export function createCreateBoardService(deps: Deps) {
  return {
    async execute(params: {
      organizationId: string;
      userId: string;
      title: string;
    }): Promise<{ id: string; title: string }> {
      const id = crypto.randomUUID();
      const now = Date.now();
      await deps.boardRepo.createBoardWithOwner({
        id,
        organizationId: params.organizationId,
        title: params.title,
        userId: params.userId,
        now,
      });
      // F6: 監査記録（best-effort）。
      await recordAudit(deps.auditRepo, {
        organizationId: params.organizationId,
        actorUserId: params.userId,
        action: "board.create",
        targetType: "board",
        targetId: id,
        metadata: { title: params.title },
      });
      return { id, title: params.title };
    },
  };
}
