import { zValidator } from "@hono/zod-validator";
import {
  createBoardSchema,
  listBoardsQuerySchema,
  renameBoardSchema,
  setBoardRoleSchema,
} from "@liveboard/shared/schemas";
import { Hono } from "hono";
import { getServerByName } from "partyserver";
import { createAuditRepository } from "../infrastructure/repositories/audit.repository";
import { createBoardRepository } from "../infrastructure/repositories/board.repository";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import type { AppEnv } from "../types";
import { createCreateBoardService } from "../use-cases/board/create-board.service";
import { createGetBoardService } from "../use-cases/board/get-board.service";
import { createGetEffectiveRoleService } from "../use-cases/board/get-effective-role.service";
import { createListBoardsService } from "../use-cases/board/list-boards.service";
import { createRenameBoardService } from "../use-cases/board/rename-board.service";
import { createRequestBoardDeletionService } from "../use-cases/board/request-board-deletion.service";
import { createSetBoardRoleService } from "../use-cases/board/set-board-role.service";
import { createToggleFavoriteService } from "../use-cases/board/toggle-favorite.service";

/**
 * ボード管理 REST。全ルートで 認証(authMiddleware) + requirePermission("board",*)。
 *
 * 認可方針:
 *   - 一覧/詳細/お気に入り: requirePermission("board","read")（org メンバー = 全員 read 可）
 *   - 作成: requirePermission("board","create")
 *   - リネーム/削除/role 付与: requirePermission("board","read") + **board 単位 canManage(M8)**。
 *     org `member` も「自分が作成した（board_role owner）ボード」は管理できる必要があるため、
 *     org レベルの update/delete では gate しない（org member は org レベル update/delete を持たない）。
 *     実体の権限は board_role（M8）の canManage で判定する。
 *   - 全操作を activeOrganizationId でスコープし、他組織のボードは 404（IDOR 防止）。
 */
export const boardRoute = new Hono<AppEnv>()
  .use("/*", authMiddleware)
  // 一覧（前方一致検索・お気に入り絞り込み・並び替え）
  .get(
    "/",
    requirePermission("board", "read"),
    zValidator("query", listBoardsQuerySchema),
    async (c) => {
      const user = c.get("user");
      const organizationId = c.get("activeOrganizationId");
      const { q, favorite, sort } = c.req.valid("query");

      const service = createListBoardsService({
        boardRepo: createBoardRepository(c.env.DB),
      });
      const boards = await service.execute({
        organizationId,
        userId: user.id,
        q,
        favoriteOnly: favorite,
        sort,
      });
      return c.json({ boards });
    },
  )
  // 作成
  .post(
    "/",
    requirePermission("board", "create"),
    zValidator("json", createBoardSchema),
    async (c) => {
      const user = c.get("user");
      const organizationId = c.get("activeOrganizationId");
      const { title } = c.req.valid("json");

      const service = createCreateBoardService({
        boardRepo: createBoardRepository(c.env.DB),
        auditRepo: createAuditRepository(c.env.DB),
      });
      const board = await service.execute({
        organizationId,
        userId: user.id,
        title,
      });
      return c.json({ board }, 201);
    },
  )
  // 詳細（呼び出し者の実効ロールも返す）
  .get("/:id", requirePermission("board", "read"), async (c) => {
    const user = c.get("user");
    const organizationId = c.get("activeOrganizationId");
    const boardId = c.req.param("id");

    const boardRepo = createBoardRepository(c.env.DB);
    const service = createGetBoardService({
      boardRepo,
      getEffectiveRole: createGetEffectiveRoleService({ boardRepo }),
    });
    const result = await service.execute({
      boardId,
      organizationId,
      userId: user.id,
    });
    return c.json(result);
  })
  // リネーム
  .patch(
    "/:id",
    requirePermission("board", "read"),
    zValidator("json", renameBoardSchema),
    async (c) => {
      const user = c.get("user");
      const organizationId = c.get("activeOrganizationId");
      const boardId = c.req.param("id");
      const { title } = c.req.valid("json");

      const boardRepo = createBoardRepository(c.env.DB);
      const service = createRenameBoardService({
        boardRepo,
        getEffectiveRole: createGetEffectiveRoleService({ boardRepo }),
        auditRepo: createAuditRepository(c.env.DB),
      });
      await service.execute({
        boardId,
        organizationId,
        userId: user.id,
        title,
      });
      return c.json({ success: true });
    },
  )
  // 削除要求（Saga キュー投入）
  .delete("/:id", requirePermission("board", "read"), async (c) => {
    const user = c.get("user");
    const organizationId = c.get("activeOrganizationId");
    const boardId = c.req.param("id");

    const boardRepo = createBoardRepository(c.env.DB);
    const service = createRequestBoardDeletionService({
      boardRepo,
      getEffectiveRole: createGetEffectiveRoleService({ boardRepo }),
      auditRepo: createAuditRepository(c.env.DB),
    });
    await service.execute({ boardId, organizationId, userId: user.id });
    return c.json({ success: true });
  })
  // お気に入り追加
  .put("/:id/favorite", requirePermission("board", "read"), async (c) => {
    const user = c.get("user");
    const organizationId = c.get("activeOrganizationId");
    const boardId = c.req.param("id");

    const service = createToggleFavoriteService({
      boardRepo: createBoardRepository(c.env.DB),
    });
    await service.execute({
      boardId,
      organizationId,
      userId: user.id,
      favorite: true,
    });
    return c.json({ success: true });
  })
  // お気に入り解除
  .delete("/:id/favorite", requirePermission("board", "read"), async (c) => {
    const user = c.get("user");
    const organizationId = c.get("activeOrganizationId");
    const boardId = c.req.param("id");

    const service = createToggleFavoriteService({
      boardRepo: createBoardRepository(c.env.DB),
    });
    await service.execute({
      boardId,
      organizationId,
      userId: user.id,
      favorite: false,
    });
    return c.json({ success: true });
  })
  // ACL 一覧（board owner のみ）
  .get("/:id/roles", requirePermission("board", "read"), async (c) => {
    const user = c.get("user");
    const organizationId = c.get("activeOrganizationId");
    const boardId = c.req.param("id");

    const boardRepo = createBoardRepository(c.env.DB);
    // 存在 + 管理権限の確認のため get-board を通す（404/403 を統一）。
    const getBoard = createGetBoardService({
      boardRepo,
      getEffectiveRole: createGetEffectiveRoleService({ boardRepo }),
    });
    const { effectiveRole } = await getBoard.execute({
      boardId,
      organizationId,
      userId: user.id,
    });
    if (effectiveRole !== "owner") {
      return c.json({ error: "Forbidden" }, 403);
    }
    const roles = await boardRepo.listBoardRoles(boardId);
    return c.json({ roles });
  })
  // ACL 付与/変更（board owner のみ）
  .put(
    "/:id/roles",
    requirePermission("board", "read"),
    zValidator("json", setBoardRoleSchema),
    async (c) => {
      const user = c.get("user");
      const organizationId = c.get("activeOrganizationId");
      const boardId = c.req.param("id");
      const { userId: targetUserId, role } = c.req.valid("json");

      const boardRepo = createBoardRepository(c.env.DB);
      const service = createSetBoardRoleService({
        boardRepo,
        getEffectiveRole: createGetEffectiveRoleService({ boardRepo }),
        auditRepo: createAuditRepository(c.env.DB),
        // 失効切断（M7）: 降格時に対象ユーザーの Board DO 接続を即時切断（best-effort）。
        revokeUser: async (id, targetId) => {
          try {
            const stub = await getServerByName(c.env.Board, id);
            await stub.revokeUser(targetId);
          } catch (error) {
            console.error("[board] revokeUser failed", error);
          }
        },
      });
      await service.execute({
        boardId,
        organizationId,
        actingUserId: user.id,
        targetUserId,
        role,
      });
      return c.json({ success: true });
    },
  );
