import { session } from "@liveboard/db/schema";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

/**
 * BetterAuth が管理する session テーブルの管理用ラッパ。
 * アカウント削除フローで「即時ログアウト + 以降 middleware が 410」を保証するため、
 * 同期段階で全 session を物理 DELETE する。
 */
export function createSessionRepository(d1: D1Database) {
  const db = drizzle(d1);

  return {
    async deleteAllByUserId(userId: string): Promise<number> {
      const result = await db
        .delete(session)
        .where(eq(session.userId, userId))
        .returning({ id: session.id });
      return result.length;
    },
  };
}
