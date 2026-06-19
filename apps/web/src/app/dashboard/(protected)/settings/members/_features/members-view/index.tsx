"use client";

import { useOrgRefresh } from "@/lib/use-org-refresh";
import type { Invitation, Member } from "../../_lib/types";
import { InvitationsList } from "./_features/invitations-list";
import { InviteMemberDialog } from "./_features/invite-member-dialog";
import { MembersList } from "./_features/members-list";

export function MembersView({
  members,
  invitations,
}: {
  members: Member[];
  invitations: Invitation[];
}) {
  useOrgRefresh();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">メンバー</h2>
        <InviteMemberDialog />
      </div>
      <MembersList members={members} />
      <InvitationsList invitations={invitations} />
    </div>
  );
}
