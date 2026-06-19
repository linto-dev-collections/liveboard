"use client";

import { useOrgRefresh } from "@/lib/use-org-refresh";
import type { Organization } from "../../_lib/types";
import { OrgNameForm } from "./_features/org-name-form";

export function SettingsView({ organization }: { organization: Organization }) {
  useOrgRefresh();

  return (
    <div className="max-w-lg space-y-6">
      <h2 className="font-semibold text-lg">組織設定</h2>
      <OrgNameForm
        key={organization.id}
        orgId={organization.id}
        currentName={organization.name}
      />
    </div>
  );
}
