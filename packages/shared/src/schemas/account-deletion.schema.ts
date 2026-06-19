import { z } from "zod";

/**
 * 組織アクション。
 * - "transfer": 後継 owner（admin/member 問わず）に owner を譲渡
 * - "delete-org": 1 人 org を組織ごと削除
 *
 * web (Server Action) と server (route validator) の両方で使う共有スキーマ。
 */
export const organizationActionSchema = z.discriminatedUnion("action", [
  z.object({
    organizationId: z.string().min(1),
    action: z.literal("transfer"),
    transferToUserId: z.string().min(1),
  }),
  z.object({
    organizationId: z.string().min(1),
    action: z.literal("delete-org"),
  }),
]);

export const deleteAccountSchema = z.object({
  password: z.string().min(1),
  organizationActions: z.array(organizationActionSchema).max(20),
});

/**
 * OAuth 専用ユーザー (password 無し) の削除フロー: 第 1 段階。
 * `organizationActions` の sanpshot を server 側で保存する目的の API ボディ。
 */
export const initiateReauthSchema = z.object({
  organizationActions: z.array(organizationActionSchema).max(20),
});

/**
 * OAuth 専用ユーザーの削除フロー: 第 2 段階 (Google 再認証完了後)。
 *
 * nonce は initiate で発行された `crypto.getRandomValues(32 bytes)` の base64url 文字列。
 * 文字数下限はゆとりを持って 32 (= ~24 bytes), 上限は 64 (= ~48 bytes) で許容する。
 */
export const confirmReauthSchema = z.object({
  nonce: z
    .string()
    .min(32)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
});

export type OrganizationAction = z.infer<typeof organizationActionSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
export type InitiateReauthInput = z.infer<typeof initiateReauthSchema>;
export type ConfirmReauthInput = z.infer<typeof confirmReauthSchema>;
