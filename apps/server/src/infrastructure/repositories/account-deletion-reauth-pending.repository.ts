import { accountDeletionReauthPending } from "@liveboard/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { OrganizationAction } from "../../domain/types/account-deletion";

export type AccountDeletionReauthPendingRow =
  typeof accountDeletionReauthPending.$inferSelect;

/**
 * OAuth ユーザー (password 無し) の削除フローで使う「Google 再認証 nonce」の
 * 一時保管 repository。
 *
 * - upsert: 同一 user の古い row を消して新 row を INSERT する
 *   (同時に複数の nonce を発行できないようにする invariant)
 * - findActiveByNonce: 未使用 (used_at IS NULL) の row のみ返す。
 *   `c.get("session").id !== prev_session_id` 等の検証は service 層で行う。
 * - markUsed: 未使用の row だけを WHERE 条件に含めて optimistic に UPDATE する
 *   (1 行 UPDATE できた場合のみ confirm を続行 = single-use)
 */
export function createAccountDeletionReauthPendingRepository(d1: D1Database) {
  const db = drizzle(d1);

  return {
    async upsert(params: {
      nonce: string;
      userId: string;
      prevSessionId: string;
      organizationActions: OrganizationAction[];
      expiresAt: Date;
    }): Promise<void> {
      // 同一 user の既存 row を削除 (新 nonce で上書き)。
      await db
        .delete(accountDeletionReauthPending)
        .where(eq(accountDeletionReauthPending.userId, params.userId));
      await db.insert(accountDeletionReauthPending).values({
        nonce: params.nonce,
        userId: params.userId,
        prevSessionId: params.prevSessionId,
        organizationActions: params.organizationActions,
        expiresAt: params.expiresAt,
        createdAt: new Date(),
      });
    },

    async findActiveByNonce(
      nonce: string,
    ): Promise<AccountDeletionReauthPendingRow | undefined> {
      return db
        .select()
        .from(accountDeletionReauthPending)
        .where(
          and(
            eq(accountDeletionReauthPending.nonce, nonce),
            isNull(accountDeletionReauthPending.usedAt),
          ),
        )
        .get();
    },

    /**
     * `used_at` を now に更新する。`used_at IS NULL` の row だけが対象。
     * `.returning()` で実際に更新された行を返し、length===1 のときだけ single-use
     * 確保成功 (atomic test-and-set)。length===0 なら既に消費済み or 存在しない。
     */
    async markUsed(nonce: string): Promise<{ acquired: boolean }> {
      const updated = await db
        .update(accountDeletionReauthPending)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(accountDeletionReauthPending.nonce, nonce),
            isNull(accountDeletionReauthPending.usedAt),
          ),
        )
        .returning({ nonce: accountDeletionReauthPending.nonce });
      return { acquired: updated.length === 1 };
    },

    async deleteByUserId(userId: string): Promise<void> {
      await db
        .delete(accountDeletionReauthPending)
        .where(eq(accountDeletionReauthPending.userId, userId));
    },
  };
}
