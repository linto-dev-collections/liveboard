import { db } from "@liveboard/db";
import { accountDeletionPending, user } from "@liveboard/db/schema";
import { and, eq, inArray } from "drizzle-orm";

/**
 * 削除フローが進行中 (status: 'processing' | 'failed') の email かを判定する。
 *
 * 用途:
 *   `@liveboard/auth` の `databaseHooks.user.create.before` から呼ぶ。
 *   email/password 経路、Google 等の social 経路、`linkSocial` で
 *   新規 user 行が作られるあらゆる経路で、削除進行中ユーザーが
 *   同じ email で再登録されるのを防ぐ。
 *
 * 設計判断:
 *   - スキーマ上 `account_deletion_pending` には email カラムが無く `user_id` のみ。
 *     既存の `account-deletion-pending.repository.findInProgressByEmail` と同じく
 *     `user` テーブルと INNER JOIN して email から逆引きする。
 *   - status enum は schema 上 `processing | failed` の 2 値のみ
 *     (旧 'pending' は 1-step 化に伴い廃止済み)。
 *   - email は入力時点で lowercase に正規化して比較する
 *     (apps/server/src/routes/auth.route.ts の既存ガードと同じ挙動)。
 *   - server 側 repository を直接 import すると
 *     packages → apps の逆方向依存になるため、packages レイヤ内で完結する
 *     最小実装を置く (本ファイル)。
 *     スキーマ・status・JOIN ロジックは server 側 repository と二重持ちに
 *     なるが、変更頻度が極めて低い (status enum は廃止だけが起きた歴) ため許容。
 */
export async function isAccountDeletionInProgressForEmail(
  email: string,
): Promise<boolean> {
  const normalized = email.toLowerCase();
  const row = await db
    .select({ userId: accountDeletionPending.userId })
    .from(accountDeletionPending)
    .innerJoin(user, eq(user.id, accountDeletionPending.userId))
    .where(
      and(
        eq(user.email, normalized),
        inArray(accountDeletionPending.status, ["processing", "failed"]),
      ),
    )
    .get();
  return row !== undefined;
}
