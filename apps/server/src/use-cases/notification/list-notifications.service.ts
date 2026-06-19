import type { NotificationView } from "../../domain/types/comment";
import type { createNotificationRepository } from "../../infrastructure/repositories/notification.repository";

type Deps = {
  notificationRepo: ReturnType<typeof createNotificationRepository>;
};

/** 1 ページの取得件数。 */
const PAGE_SIZE = 30;

/**
 * 自分宛の通知一覧（org スコープ・新しい順）。`unreadOnly`・`cursor`（createdAt）で
 * ページング。他人/別 org の通知は repository 側で常にスコープされ返らない（IDOR 防止）。
 */
export function createListNotificationsService(deps: Deps) {
  return {
    async execute(params: {
      userId: string;
      organizationId: string;
      unreadOnly?: boolean;
      cursor?: number;
    }): Promise<NotificationView[]> {
      return deps.notificationRepo.listNotifications({
        userId: params.userId,
        organizationId: params.organizationId,
        unreadOnly: params.unreadOnly,
        cursor: params.cursor,
        limit: PAGE_SIZE,
      });
    },
  };
}
