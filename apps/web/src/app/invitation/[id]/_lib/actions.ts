"use server";

import { z } from "zod";
import { serverAuthClient, serverFetchOptions } from "@/lib/auth-server-client";
import type { ApiResult } from "@/lib/handle-api-response";

const invitationIdSchema = z.string().min(1, "Invitation ID is required");

/**
 * Better Auth の ORGANIZATION_ERROR_CODES (SNAKE_CASE キー) を日本語に変換する。
 * 想定されるのは、page.tsx の pre-validation を通過してから accept/reject ボタンを
 * 押すまでの間に状態が変わったケース (招待が取り消された、別端末で承認された等)。
 *
 * 既知コード以外は generic 日本語に倒し、英語の生エラーをユーザーに見せない。
 */
function localizeError(code: string | undefined, fallback: string): string {
  switch (code) {
    case "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION":
      return "この招待はあなた宛ではありません。招待されたメールアドレスでログインし直してください。";
    case "EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION":
    case "EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION":
      return "招待を承認するには、メールアドレスの確認を先に完了してください。";
    case "INVITATION_NOT_FOUND":
    case "FAILED_TO_RETRIEVE_INVITATION":
      return "招待が見つかりませんでした。すでに処理済みか、有効期限が切れている可能性があります。";
    case "ORGANIZATION_NOT_FOUND":
      return "招待元の組織が見つかりませんでした。";
    case "INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION":
      return "招待者が組織のメンバーではなくなったため、この招待は受けられません。";
    case "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED":
      return "組織のメンバー上限に達しています。組織オーナーにご連絡ください。";
    case "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION":
      return "すでにこの組織のメンバーです。";
    default:
      return fallback;
  }
}

export async function acceptInvitation(
  invitationId: string,
): Promise<ApiResult<void>> {
  const parsed = invitationIdSchema.safeParse(invitationId);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const { error } = await serverAuthClient.organization.acceptInvitation(
    { invitationId: parsed.data },
    await serverFetchOptions(),
  );
  if (error) {
    const code = (error as { code?: string }).code;
    return {
      success: false,
      error: localizeError(code, "招待の承認に失敗しました。"),
    };
  }
  return { success: true, data: undefined };
}

export async function rejectInvitation(
  invitationId: string,
): Promise<ApiResult<void>> {
  const parsed = invitationIdSchema.safeParse(invitationId);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const { error } = await serverAuthClient.organization.rejectInvitation(
    { invitationId: parsed.data },
    await serverFetchOptions(),
  );
  if (error) {
    const code = (error as { code?: string }).code;
    return {
      success: false,
      error: localizeError(code, "招待の辞退に失敗しました。"),
    };
  }
  return { success: true, data: undefined };
}
