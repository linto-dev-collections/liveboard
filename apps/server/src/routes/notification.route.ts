import { zValidator } from "@hono/zod-validator";
import {
  listNotificationsQuerySchema,
  markReadSchema,
} from "@liveboard/shared/schemas";
import { Hono } from "hono";
import { createNotificationRepository } from "../infrastructure/repositories/notification.repository";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import type { AppEnv } from "../types";
import { createCountUnreadService } from "../use-cases/notification/count-unread.service";
import { createListNotificationsService } from "../use-cases/notification/list-notifications.service";
import { createMarkReadService } from "../use-cases/notification/mark-read.service";

/**
 * 通知センター REST（`/api/notifications`）。常に **自分宛・org スコープ**で、
 * 他人/別 org の通知は返さない・既読化できない（IDOR 防止）。
 * `requirePermission("dashboard","read")` で active org を確定（全メンバーが保有）。
 */
export const notificationRoute = new Hono<AppEnv>()
  .use("/*", authMiddleware)
  // 一覧（未読のみ・カーソルページング）
  .get(
    "/",
    requirePermission("dashboard", "read"),
    zValidator("query", listNotificationsQuerySchema),
    async (c) => {
      const { unreadOnly, cursor } = c.req.valid("query");
      const service = createListNotificationsService({
        notificationRepo: createNotificationRepository(c.env.DB),
      });
      const notifications = await service.execute({
        userId: c.get("user").id,
        organizationId: c.get("activeOrganizationId"),
        unreadOnly,
        cursor,
      });
      return c.json({ notifications });
    },
  )
  // 未読数（ベルバッジ）
  .get("/unread-count", requirePermission("dashboard", "read"), async (c) => {
    const service = createCountUnreadService({
      notificationRepo: createNotificationRepository(c.env.DB),
    });
    const count = await service.execute({
      userId: c.get("user").id,
      organizationId: c.get("activeOrganizationId"),
    });
    return c.json({ count });
  })
  // 既読化（ids 指定で個別・未指定で全件）
  .post(
    "/read",
    requirePermission("dashboard", "read"),
    zValidator("json", markReadSchema),
    async (c) => {
      const { ids } = c.req.valid("json");
      const service = createMarkReadService({
        notificationRepo: createNotificationRepository(c.env.DB),
      });
      await service.execute({
        userId: c.get("user").id,
        organizationId: c.get("activeOrganizationId"),
        ids,
      });
      return c.json({ success: true });
    },
  );
