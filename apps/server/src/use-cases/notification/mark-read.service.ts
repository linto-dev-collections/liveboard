import type { createNotificationRepository } from "../../infrastructure/repositories/notification.repository";

type Deps = {
  notificationRepo: ReturnType<typeof createNotificationRepository>;
};

/**
 * 通知の既読化（自分宛・org スコープ）。`ids` 指定で個別、未指定で全件既読。
 * 常に userId＋organizationId でスコープし、他人の通知は既読化できない。
 */
export function createMarkReadService(deps: Deps) {
  return {
    async execute(params: {
      userId: string;
      organizationId: string;
      ids?: string[];
    }): Promise<void> {
      await deps.notificationRepo.markRead({
        userId: params.userId,
        organizationId: params.organizationId,
        ids: params.ids,
        now: Date.now(),
      });
    },
  };
}
