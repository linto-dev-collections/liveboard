/**
 * Composition Root 用ヘルパ。
 *
 * `@liveboard/auth` (BetterAuth + Resend) は dep-cruiser ルールにより
 * routes / middleware / use-cases / infrastructure / domain から直接 import できないため、
 * ここで吸収する。routes は `./account-deletion-deps` をインポートして DI 関数群を取得する。
 */

import {
  sendOwnershipTransferNoticeEmail as _sendOwnershipTransferNoticeEmail,
  verifyPassword as _verifyPassword,
  auth,
} from "@liveboard/auth";
import type { AppEnv } from "./types";

export type AccountDeletionEnv = AppEnv["Bindings"];

export const verifyPassword = _verifyPassword;

/**
 * 退会完了レスポンスに付与する Set-Cookie expire ヘッダ群を取得する。
 *
 * 削除完了後にブラウザの better-auth cookie (session_token / session_data) を
 * 必ず expire させないと、cookieCache (60s TTL) が削除済 user_id を含む signed payload を
 * 保持し続け、同じ email で再登録した直後の verifyEmail が「email 一致」だけで
 * stale session を流用 → organization.create 時の member.user_id FK が破綻する
 * （drizzle FOREIGN KEY constraint failed）。
 *
 * service.execute 内で session 行は DB 削除済のため signOut の delete は no-op だが、
 * better-auth の deleteSessionCookie が確実に Max-Age=0 の Set-Cookie を発行する。
 */
export async function buildAccountDeletionExpireCookies(
  headers: Headers,
): Promise<string[]> {
  const { headers: signOutHeaders } = await auth.api.signOut({
    headers,
    returnHeaders: true,
  });
  // Set-Cookie は同名複数個になり得るため、Headers iteration ではなく
  // getSetCookie() を使う（カンマで結合されると Date 内のカンマで壊れる）。
  return (
    signOutHeaders as Headers & { getSetCookie(): string[] }
  ).getSetCookie();
}

/** 後継 owner への引継ぎ通知メール（delete-account で injection）。 */
export function buildSendOwnershipTransferNoticeEmail(env: AccountDeletionEnv) {
  return async (params: {
    to: string;
    recipientName: string;
    organizationName: string;
    previousOwnerName: string;
  }) => {
    await _sendOwnershipTransferNoticeEmail({
      resendApiKey: env.RESEND_API_KEY,
      fromEmail: env.FROM_EMAIL,
      to: params.to,
      recipientName: params.recipientName,
      organizationName: params.organizationName,
      previousOwnerName: params.previousOwnerName,
    });
  };
}
