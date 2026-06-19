import { db } from "@liveboard/db";
import { account } from "@liveboard/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * 指定ユーザーが credential (= email/password) アカウントを持つかを判定する。
 *
 * 用途:
 *   `@liveboard/auth` の `onExistingUserSignUp` から呼ぶ。サインアップ重複の通知メールを
 *   下記 2 種から出し分けるために使う:
 *     - false (OAuth のみで登録、password 未設定): Google での再ログインを案内する
 *     - true  (credential あり): 既存の「ログインしてください + 必要なら forgot」案内
 *
 * 設計判断:
 *   - 「password を持つか」の判定は server 側 user.repository の findPasswordHash と
 *     同等だが、packages → apps の逆依存を避けるため packages レイヤ内で完結させる。
 *   - 行の存在のみで判定可能 (password カラムが NULL になっているケースは Better Auth
 *     現挙動では発生しない: credential 行は password 設定時に作られる)。
 */
export async function userHasCredentialAccount(
  userId: string,
): Promise<boolean> {
  const row = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(eq(account.userId, userId), eq(account.providerId, "credential")),
    )
    .get();
  return row !== undefined;
}
