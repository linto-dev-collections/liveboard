import { auditLog } from "@liveboard/db/schema";
import { drizzle } from "drizzle-orm/d1";

/**
 * 監査ログ（append-only・テーブル §4.11・F6/G7）。
 *
 * - `organization_id`（org 削除で SET NULL）と **`organization_id_snapshot`（不変・作成時固定 G7）**
 *   の双方を記録し、org 削除後も帰属を追跡できるようにする。
 * - 追記のみ（更新/削除なし）。失敗しても主操作は継続できるよう、呼び出し側で best-effort 扱い可。
 */
export function createAuditRepository(d1: D1Database) {
  const db = drizzle(d1);

  return {
    async append(params: {
      organizationId: string;
      actorUserId: string | null;
      action: string;
      targetType: string;
      targetId: string;
      metadata?: Record<string, unknown>;
    }): Promise<void> {
      await db.insert(auditLog).values({
        id: crypto.randomUUID(),
        organizationId: params.organizationId,
        // G7: org 削除後も有効な不変スナップショット。
        organizationIdSnapshot: params.organizationId,
        actorUserId: params.actorUserId,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      });
    },
  };
}
