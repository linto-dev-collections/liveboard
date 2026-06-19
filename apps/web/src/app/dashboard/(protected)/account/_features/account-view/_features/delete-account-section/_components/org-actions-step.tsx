"use client";

import { Badge } from "@liveboard/ui/components/ui/badge";
import { Checkbox } from "@liveboard/ui/components/ui/checkbox";
import { Label } from "@liveboard/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@liveboard/ui/components/ui/select";
import { AlertTriangleIcon, UsersIcon } from "lucide-react";
import type {
  OrganizationAction,
  OwnedOrganizationSummary,
} from "../_lib/types";

type Props = {
  ownedOrgs: OwnedOrganizationSummary[];
  actions: Map<string, OrganizationAction>;
  onChange: (next: Map<string, OrganizationAction>) => void;
};

export function OrgActionsStep({ ownedOrgs, actions, onChange }: Props) {
  const setAction = (orgId: string, next: OrganizationAction | null) => {
    const m = new Map(actions);
    if (next) m.set(orgId, next);
    else m.delete(orgId);
    onChange(m);
  };

  return (
    <div className="max-h-[60vh] space-y-4 overflow-y-auto py-2">
      {ownedOrgs.map((org) => {
        const action = actions.get(org.organizationId);
        const isSolo = org.memberCount === 1;
        const isStuck = !isSolo && org.candidates.length === 0;

        return (
          <div
            key={org.organizationId}
            className="rounded-md border bg-card p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="font-medium">{org.organizationName}</p>
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <UsersIcon className="size-3.5" />
                  <span>メンバー {org.memberCount} 人</span>
                  <Badge variant="secondary">あなたがオーナー</Badge>
                </div>
              </div>
            </div>

            {isStuck ? (
              <div className="mt-3 rounded border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                <p className="font-medium">譲渡できる候補メンバーがいません</p>
                <p className="mt-1 text-warning/80 text-xs">
                  この組織には他のメンバーがいますが、メール確認が完了していないため譲渡先として選べません。対象メンバーがメール確認を完了したあとで、再度この画面を開いてください。
                </p>
              </div>
            ) : isSolo ? (
              <div className="mt-3 rounded border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangleIcon className="mt-0.5 size-4 text-destructive" />
                  <div className="space-y-2">
                    <p className="font-medium text-destructive text-sm">
                      この組織はあなた 1 人だけで構成されています
                    </p>
                    <p className="text-muted-foreground text-xs">
                      アカウントを削除すると、組織「{org.organizationName}
                      」も一緒に削除されます。含まれる招待や設定はすべて消えます。
                    </p>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`delete-org-${org.organizationId}`}
                        checked={action?.action === "delete-org"}
                        onCheckedChange={(checked) =>
                          setAction(
                            org.organizationId,
                            checked
                              ? {
                                  organizationId: org.organizationId,
                                  action: "delete-org",
                                }
                              : null,
                          )
                        }
                      />
                      <Label
                        htmlFor={`delete-org-${org.organizationId}`}
                        className="text-sm"
                      >
                        この組織を一緒に削除することを了承します
                      </Label>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <Label htmlFor={`transfer-${org.organizationId}`}>
                  オーナーを引き継ぐメンバーを選択
                </Label>
                <Select
                  value={
                    action?.action === "transfer" ? action.transferToUserId : ""
                  }
                  onValueChange={(v) =>
                    v
                      ? setAction(org.organizationId, {
                          organizationId: org.organizationId,
                          action: "transfer",
                          transferToUserId: v,
                        })
                      : setAction(org.organizationId, null)
                  }
                >
                  <SelectTrigger
                    id={`transfer-${org.organizationId}`}
                    className="w-full"
                  >
                    {/*
                      Base UI の Select は items prop か Value.children のどちらかを
                      指定しないと、デフォルトで value（ここでは userId）を文字列化して
                      表示してしまう。candidates から該当メンバーを引いて email を表示する。
                    */}
                    <SelectValue placeholder="メンバーを選択...">
                      {(value: string) => {
                        if (!value) return "メンバーを選択...";
                        const selected = org.candidates.find(
                          (c) => c.userId === value,
                        );
                        if (!selected) return "メンバーを選択...";
                        return (
                          <>
                            <span>{selected.name}</span>
                            <span className="text-muted-foreground text-xs">
                              {selected.email}
                            </span>
                          </>
                        );
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {org.candidates.map((c) => (
                      <SelectItem key={c.userId} value={c.userId}>
                        <div className="flex items-center gap-2">
                          <span>{c.name}</span>
                          <span className="text-muted-foreground text-xs">
                            {c.email}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {c.role === "admin" ? "管理者" : "メンバー"}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  選択したメンバーはアカウント削除の確定と同時にオーナーになります。事後通知メールが送信されます。
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
