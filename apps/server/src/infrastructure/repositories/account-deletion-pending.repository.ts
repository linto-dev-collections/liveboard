import { accountDeletionPending, user } from "@liveboard/db/schema";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { OrganizationAction } from "../../domain/types/account-deletion";

export type AccountDeletionPendingRow =
  typeof accountDeletionPending.$inferSelect;

type Status = "processing" | "failed";

export function createAccountDeletionPendingRepository(d1: D1Database) {
  const db = drizzle(d1);

  return {
    /**
     * /api/account/delete で呼ぶ。既に行があれば metadata / status を上書きする。
     */
    async upsert(params: {
      userId: string;
      status: Status;
      metadata?: { organizationActions: OrganizationAction[] };
    }): Promise<void> {
      const now = new Date();
      const existing = await db
        .select({ userId: accountDeletionPending.userId })
        .from(accountDeletionPending)
        .where(eq(accountDeletionPending.userId, params.userId))
        .get();
      if (existing) {
        await db
          .update(accountDeletionPending)
          .set({
            status: params.status,
            metadata: params.metadata ?? null,
            lastErrorMessage: null,
            updatedAt: now,
          })
          .where(eq(accountDeletionPending.userId, params.userId));
        return;
      }
      await db.insert(accountDeletionPending).values({
        userId: params.userId,
        status: params.status,
        metadata: params.metadata ?? null,
        requestedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    },

    async setStatus(
      userId: string,
      status: Status,
      errorMessage?: string,
    ): Promise<void> {
      await db
        .update(accountDeletionPending)
        .set({
          status,
          lastErrorMessage: errorMessage ?? null,
          updatedAt: new Date(),
        })
        .where(eq(accountDeletionPending.userId, userId));
    },

    async findByUserId(
      userId: string,
    ): Promise<AccountDeletionPendingRow | undefined> {
      return db
        .select()
        .from(accountDeletionPending)
        .where(eq(accountDeletionPending.userId, userId))
        .get();
    },

    /**
     * 削除フローが進行中（processing/failed）のユーザーを email で検出する。
     *
     * sign-up エンドポイントの前段で参照する。Better Auth は requireEmailVerification +
     * 既存 email の場合、enumeration 防止のため成功風レスポンス + onExistingUserSignUp
     * 経由で「既にアカウントがあります」メールを送るが、削除中ユーザーに同挙動を
     * 適用すると誤誘導になるため、本メソッドで先回り検出して登録自体を弾く。
     */
    async findInProgressByEmail(email: string): Promise<
      | {
          userId: string;
          status: Status;
        }
      | undefined
    > {
      const row = await db
        .select({
          userId: accountDeletionPending.userId,
          status: accountDeletionPending.status,
        })
        .from(accountDeletionPending)
        .innerJoin(user, eq(user.id, accountDeletionPending.userId))
        .where(eq(user.email, email))
        .get();
      if (!row) return undefined;
      return { userId: row.userId, status: row.status };
    },

    /**
     * Workflow 最終ステップで呼ぶ（user 行 DELETE 直前）。
     * 通常は user 行 DELETE → cascade で消えるが、明示削除にも対応する。
     */
    async deleteByUserId(userId: string): Promise<void> {
      await db
        .delete(accountDeletionPending)
        .where(eq(accountDeletionPending.userId, userId));
    },
  };
}
