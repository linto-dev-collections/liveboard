"use client";

import { useState } from "react";
import { toast } from "sonner";
import { removeMember, updateMemberRole } from "../../../../_lib/actions";
import type { Member } from "../../../../_lib/types";
import { MemberCard } from "./_components/member-card";

export function MembersList({ members }: { members: Member[] }) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleRoleChange = async (memberId: string, role: string) => {
    setUpdatingId(memberId);
    const result = await updateMemberRole(memberId, role);
    setUpdatingId(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("ロールを更新しました");
  };

  const handleRemove = async (memberId: string) => {
    const result = await removeMember(memberId);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("メンバーを削除しました");
  };

  return (
    <div className="space-y-3">
      {members.map((m) => (
        <MemberCard
          key={m.id}
          member={m}
          onRoleChange={(role) => handleRoleChange(m.id, role)}
          onRemove={() => handleRemove(m.id)}
          isUpdating={updatingId === m.id}
        />
      ))}
    </div>
  );
}
