"use server";

import {
  deleteAccountSchema,
  initiateReauthSchema,
} from "@liveboard/shared/schemas";
import { createServerApi } from "@/lib/api.server";
import { handleApiResponse } from "@/lib/handle-api-response";
import type { OrganizationAction, OwnedOrganizationSummary } from "./types";

type Result<T> = { success: true; data: T } | { success: false; error: string };

export async function fetchDeletionPrerequisites(): Promise<
  Result<{ ownedOrganizations: OwnedOrganizationSummary[] }>
> {
  const api = await createServerApi();
  const res = await api.api.account["deletion-prerequisites"].$get();
  const result = await handleApiResponse<{
    ownedOrganizations: OwnedOrganizationSummary[];
  }>(res);
  if (!result.success) return { success: false, error: result.error };
  return { success: true, data: result.data };
}

type DeleteResult =
  | { success: true; ownershipConflict?: false }
  | { success: false; error: string; ownershipConflict?: false }
  | { success: false; error: string; ownershipConflict: true };

export async function deleteAccount(params: {
  password: string;
  organizationActions: OrganizationAction[];
}): Promise<DeleteResult> {
  const parsed = deleteAccountSchema.safeParse(params);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "入力が不正です",
    };
  }
  const api = await createServerApi();
  const res = await api.api.account.delete.$post({ json: parsed.data });
  if (res.status === 409) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    return {
      success: false,
      error: body?.error ?? "組織の状態が変わりました。再度お試しください。",
      ownershipConflict: true,
    };
  }
  const result = await handleApiResponse<{
    success: true;
  }>(res);
  if (!result.success) return { success: false, error: result.error };
  return { success: true };
}

type InitiateReauthResult =
  | { success: true; data: { nonce: string; expiresAt: string } }
  | { success: false; error: string; ownershipConflict?: false }
  | { success: false; error: string; ownershipConflict: true };

/**
 * OAuth 専用ユーザーがアカウント削除を開始する時に呼ぶ。
 * server で organizationActions の事前検証 + nonce 発行を行う。
 * 返ってきた nonce を `authClient.signIn.social({ callbackURL: ...?nonce=... })`
 * に渡すことで、Google 再認証後の confirm-reauth へ繋ぐ。
 */
export async function initiateReauth(params: {
  organizationActions: OrganizationAction[];
}): Promise<InitiateReauthResult> {
  const parsed = initiateReauthSchema.safeParse(params);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "入力が不正です",
    };
  }
  const api = await createServerApi();
  const res = await api.api.account["delete-reauth"].initiate.$post({
    json: parsed.data,
  });
  if (res.status === 409) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    return {
      success: false,
      error: body?.error ?? "組織の状態が変わりました。再度お試しください。",
      ownershipConflict: true,
    };
  }
  const result = await handleApiResponse<{
    nonce: string;
    expiresAt: string;
  }>(res);
  if (!result.success) return { success: false, error: result.error };
  return {
    success: true,
    data: { nonce: result.data.nonce, expiresAt: result.data.expiresAt },
  };
}
