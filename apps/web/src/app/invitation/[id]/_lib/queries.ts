import { serverAuthClient, serverFetchOptions } from "@/lib/auth-server-client";
import type { InvitationState } from "./types";

/**
 * `getInvitationState` の戻り値型。
 *
 * CLAUDE.md §6.1 / §5.3 の規約上 `_lib/queries.ts` は
 * `Promise<ApiResult<T>>` を返すのが本来の形だが、ここは Better Auth の
 * 401 (session 失効) が「redirect する」分岐を要求し、これは
 * success/failure に乗せにくいため、独自 discriminated union を採用する。
 * Container 側で `kind === "redirect-to-sign-in"` を直接 handle する。
 */
export type InvitationFetchResult =
  | { kind: "state"; state: InvitationState }
  | { kind: "redirect-to-sign-in" };

/**
 * Better Auth の `organization.getInvitation` を呼び、Container 用の
 * discriminated state に変換する。
 *
 * 元実装: apps/web/src/app/invitation/[id]/page.tsx:45-72
 *
 * - error.code は @better-auth/core の defineErrorCodes が SNAKE_CASE キーを
 *   code フィールドとして body に載せるため、文字列比較で安定して分岐できる。
 * - INVITATION_NOT_FOUND は better-call の APIError.fromStatus 経由で
 *   code が乗らずに message のみのケース。期限切れ/取消/不存在を一括で扱う。
 */
export async function getInvitationState(
  id: string,
): Promise<InvitationFetchResult> {
  const { data, error } = await serverAuthClient.organization.getInvitation(
    { query: { id } },
    await serverFetchOptions(),
  );

  if (error) {
    // 401: session cookie はあったが server 側で認証 reject された (期限切れ等)
    if (error.status === 401) {
      return { kind: "redirect-to-sign-in" };
    }
    const code = (error as { code?: string }).code;
    if (code === "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION") {
      return { kind: "state", state: { kind: "mismatch" } };
    }
    if (
      code ===
        "EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION" ||
      code === "EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION"
    ) {
      return { kind: "state", state: { kind: "email-unverified" } };
    }
    return { kind: "state", state: { kind: "not-found" } };
  }

  return {
    kind: "state",
    state: {
      kind: "ok",
      invitation: {
        id: data.id,
        organizationName: data.organizationName,
        inviterEmail: data.inviterEmail,
        role: data.role,
      },
    },
  };
}
