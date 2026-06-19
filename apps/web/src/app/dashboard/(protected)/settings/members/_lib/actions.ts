"use server";

import {
  inviteMemberSchema,
  updateMemberRoleSchema,
} from "@liveboard/shared/schemas";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { serverAuthClient, serverFetchOptions } from "@/lib/auth-server-client";
import type { ApiResult } from "@/lib/handle-api-response";

const idSchema = z.string().min(1, "ID is required");

export async function inviteMember(
  email: string,
  role: string,
): Promise<ApiResult<void>> {
  const parsed = inviteMemberSchema.safeParse({ email, role });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const { error } = await serverAuthClient.organization.inviteMember(
    { email: parsed.data.email, role: parsed.data.role },
    await serverFetchOptions(),
  );
  if (error) {
    return {
      success: false,
      error: error.message ?? "Failed to invite member",
    };
  }
  revalidatePath("/dashboard/settings/members");
  return { success: true, data: undefined };
}

export async function updateMemberRole(
  memberId: string,
  role: string,
): Promise<ApiResult<void>> {
  const parsed = updateMemberRoleSchema.safeParse({ memberId, role });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const { error } = await serverAuthClient.organization.updateMemberRole(
    { memberId: parsed.data.memberId, role: parsed.data.role },
    await serverFetchOptions(),
  );
  if (error) {
    return { success: false, error: error.message ?? "Failed to update role" };
  }
  revalidatePath("/dashboard/settings/members");
  return { success: true, data: undefined };
}

export async function removeMember(
  memberIdOrEmail: string,
): Promise<ApiResult<void>> {
  const parsed = idSchema.safeParse(memberIdOrEmail);
  if (!parsed.success) {
    return { success: false, error: "Member ID or email is required" };
  }
  const { error } = await serverAuthClient.organization.removeMember(
    { memberIdOrEmail: parsed.data },
    await serverFetchOptions(),
  );
  if (error) {
    return {
      success: false,
      error: error.message ?? "Failed to remove member",
    };
  }
  revalidatePath("/dashboard/settings/members");
  return { success: true, data: undefined };
}

export async function cancelInvitation(
  invitationId: string,
): Promise<ApiResult<void>> {
  const parsed = idSchema.safeParse(invitationId);
  if (!parsed.success) {
    return { success: false, error: "Invitation ID is required" };
  }
  const { error } = await serverAuthClient.organization.cancelInvitation(
    { invitationId: parsed.data },
    await serverFetchOptions(),
  );
  if (error) {
    return {
      success: false,
      error: error.message ?? "Failed to cancel invitation",
    };
  }
  revalidatePath("/dashboard/settings/members");
  return { success: true, data: undefined };
}
