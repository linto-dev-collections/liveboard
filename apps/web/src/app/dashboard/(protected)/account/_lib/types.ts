import type { authClient } from "@/lib/auth-client";

/**
 * `authClient.listAccounts()` が返す 1 行ぶんの型。
 *
 * CLAUDE.md section 5.1 では「API レスポンスは InferResponseType か SDK 型から導出」
 * を要求しているため、ここでは Better Auth の client 関数戻り値から逆算する。
 *
 * Better Auth 1.6.9 の OpenAPI schema 上、各行は
 *   { id, providerId, accountId, userId, scopes: string[], createdAt, updatedAt }
 * を持つ (https://github.com/better-auth/better-auth/blob/main/packages/better-auth/src/api/routes/account.ts)。
 *
 * providerId の値 (例):
 *   - "credential" → email/password で sign-up したユーザー
 *   - "google"     → Google で sign-up / linkSocial したユーザー
 */
type ListAccountsData = NonNullable<
  Awaited<ReturnType<typeof authClient.listAccounts>>["data"]
>;

export type LinkedAccount = ListAccountsData[number];
