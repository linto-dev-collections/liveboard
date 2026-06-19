"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { serverAuthClient, serverFetchOptions } from "@/lib/auth-server-client";
import type { ApiResult } from "@/lib/handle-api-response";

const orgIdSchema = z.string().min(1, "Organization ID is required");
const orgNameSchema = z.string().min(1, "Organization name is required");

export async function updateOrganization(
  orgId: string,
  name: string,
): Promise<ApiResult<void>> {
  const idResult = orgIdSchema.safeParse(orgId);
  if (!idResult.success) {
    return { success: false, error: idResult.error.issues[0].message };
  }
  const nameResult = orgNameSchema.safeParse(name);
  if (!nameResult.success) {
    return { success: false, error: nameResult.error.issues[0].message };
  }
  const { error } = await serverAuthClient.organization.update(
    {
      data: {
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      },
      organizationId: orgId,
    },
    await serverFetchOptions(),
  );
  if (error) {
    return {
      success: false,
      error: error.message ?? "Failed to update organization",
    };
  }
  revalidatePath("/dashboard/settings/organization");
  return { success: true, data: undefined };
}
