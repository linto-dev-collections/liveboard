import type { createNotificationRepository } from "../../infrastructure/repositories/notification.repository";

type Deps = {
  notificationRepo: ReturnType<typeof createNotificationRepository>;
};

/** 自分宛の未読通知数（org スコープ・ベルバッジ用）。 */
export function createCountUnreadService(deps: Deps) {
  return {
    async execute(params: {
      userId: string;
      organizationId: string;
    }): Promise<number> {
      return deps.notificationRepo.countUnread({
        userId: params.userId,
        organizationId: params.organizationId,
      });
    },
  };
}
