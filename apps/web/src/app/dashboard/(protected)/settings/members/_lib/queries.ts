import { serverAuthClient, serverFetchOptions } from "@/lib/auth-server-client";
import type { ApiResult } from "@/lib/handle-api-response";
import type { FullOrganization, Invitation, Member } from "./types";

export async function getFullOrganization(): Promise<
  ApiResult<FullOrganization>
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
    data: {
      members: data.members.map(
        (member): Member => ({
          id: member.id,
          role: member.role,
          user: {
            id: member.user.id,
            name: member.user.name,
            email: member.user.email,
            image: member.user.image,
          },
        }),
      ),
      invitations: data.invitations.map(
        (invitation): Invitation => ({
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          status: invitation.status,
        }),
      ),
    },
  };
}
