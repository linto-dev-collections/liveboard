import { account, user } from "@liveboard/db/schema";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

export type UserSummary = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
};

/**
 * BetterAuth が管理する user テーブルの読み取り専用ラッパ。
 * 書き込みは BetterAuth に任せる（org / session 等の整合性を維持するため）。
 */
export function createUserRepository(d1: D1Database) {
  const db = drizzle(d1);

  return {
    async findById(id: string): Promise<UserSummary | undefined> {
      const row = await db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
        })
        .from(user)
        .where(eq(user.id, id))
        .get();
      return row;
    },

    /**
     * credential providerId のアカウント行から password hash を取得する。
     * SSO のみのユーザーは null。
     */
    async findPasswordHash(userId: string): Promise<string | null> {
      const row = await db
        .select({ password: account.password })
        .from(account)
        .where(
          and(eq(account.userId, userId), eq(account.providerId, "credential")),
        )
        .get();
      return row?.password ?? null;
    },
  };
}
