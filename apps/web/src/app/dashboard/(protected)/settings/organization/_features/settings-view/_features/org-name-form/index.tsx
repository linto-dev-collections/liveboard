"use client";

import { Button } from "@liveboard/ui/components/ui/button";
import { Input } from "@liveboard/ui/components/ui/input";
import { Label } from "@liveboard/ui/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { updateOrganization } from "../../../../_lib/actions";

export function OrgNameForm({
  orgId,
  currentName,
}: {
  orgId: string;
  currentName: string;
}) {
  const { refetchOrg } = useAuth();
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("組織名は必須です");
      return;
    }
    if (trimmed === currentName) return;

    setSaving(true);
    const result = await updateOrganization(orgId, trimmed);
    setSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    await refetchOrg();
    toast.success("組織情報を更新しました");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="org-name">組織名</Label>
        <Input
          id="org-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={saving || name.trim() === currentName}>
        {saving ? "保存中..." : "保存"}
      </Button>
    </form>
  );
}
