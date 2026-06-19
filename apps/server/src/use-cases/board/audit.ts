import type { createAuditRepository } from "../../infrastructure/repositories/audit.repository";

/**
 * 監査記録の **best-effort** ラッパー。監査の失敗で主操作（作成/リネーム/削除要求/権限変更）を
 * 巻き戻さないよう、例外を握りつぶしてログのみ残す（append-only・F6）。
 */
export async function recordAudit(
  auditRepo: ReturnType<typeof createAuditRepository>,
  entry: {
    organizationId: string;
    actorUserId: string | null;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await auditRepo.append(entry);
  } catch (error) {
    console.error("[audit] append failed", entry.action, error);
  }
}
