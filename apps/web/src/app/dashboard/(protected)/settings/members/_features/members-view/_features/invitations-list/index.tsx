"use client";

import { toast } from "sonner";
import { cancelInvitation } from "../../../../_lib/actions";
import type { Invitation } from "../../../../_lib/types";
import { InvitationCard } from "./_components/invitation-card";

export function InvitationsList({
  invitations,
}: {
  invitations: Invitation[];
}) {
  const pending = invitations.filter((i) => i.status === "pending");

  if (pending.length === 0) {
    return null;
  }

  const handleCancel = async (invitationId: string) => {
    const result = await cancelInvitation(invitationId);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("招待を取り消しました");
  };

  return (
    <div className="space-y-3">
      <h3 className="font-medium text-muted-foreground text-sm">
        保留中の招待
      </h3>
      {pending.map((inv) => (
        <InvitationCard
          key={inv.id}
          email={inv.email}
          role={inv.role}
          onCancel={() => handleCancel(inv.id)}
        />
      ))}
    </div>
  );
}
