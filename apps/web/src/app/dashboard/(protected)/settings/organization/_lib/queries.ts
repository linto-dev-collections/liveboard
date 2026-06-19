import { serverAuthClient, serverFetchOptions } from "@/lib/auth-server-client";
import type { ApiResult } from "@/lib/handle-api-response";
import type { Organization } from "./types";

export async function getActiveOrganization(): Promise<
  ApiResult<Organization>
> {
  const { data, error } =
    await serverAuthClient.organization.getFullOrganization({
      fetchOptions: await serverFetchOptions(),
    });
  if (error || !data) {
    return {
      success: false,
      error: error?.message ?? "No active organization",
    };
  }
  return {
    success: true,
    data: { id: data.id, name: data.name, slug: data.slug },
  };
}
