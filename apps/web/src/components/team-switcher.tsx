"use client";

import { Button } from "@liveboard/ui/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@liveboard/ui/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@liveboard/ui/components/ui/dropdown-menu";
import { Input } from "@liveboard/ui/components/ui/input";
import { Label } from "@liveboard/ui/components/ui/label";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@liveboard/ui/components/ui/sidebar";
import { Skeleton } from "@liveboard/ui/components/ui/skeleton";
import { BuildingIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { useAuth } from "./auth-provider";

function generateSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+/g, "-")
      .replace(/^-|-$/g, "") || `org-${Date.now()}`
  );
}

export function TeamSwitcher() {
  const { isMobile } = useSidebar();
  const { activeOrg, orgs, orgsPending, refetchOrg } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [creating, setCreating] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // setActive は cookie の activeOrganizationId を書き換えるだけで、Next.js Router
  // Cache に乗っている現在ルートの RSC payload は無効化されない。await した上で
  // router.refresh() を呼ぶことで、サーバー側を再実行して新 org スコープのデータを
  // 反映させる (recordings 等の Server Component が依存)。
  const handleSetActive = async (orgId: string) => {
    if (switching || orgId === activeOrg?.id) return;
    setSwitching(true);
    try {
      const { error } = await authClient.organization.setActive({
        organizationId: orgId,
      });
      if (error) {
        toast.error(error.message ?? "組織の切り替えに失敗しました");
        return;
      }
      router.refresh();
    } finally {
      setSwitching(false);
    }
  };

  const handleCreateOrg = async () => {
    const trimmed = orgName.trim();
    if (!trimmed) return;

    setCreating(true);
    try {
      const slug = generateSlug(trimmed);
      const { data, error } = await authClient.organization.create({
        name: trimmed,
        slug,
      });

      if (error) {
        toast.error(error.message ?? "組織の作成に失敗しました");
        return;
      }

      await authClient.organization.setActive({
        organizationId: data.id,
      });

      await refetchOrg();
      router.refresh();

      setCreateDialogOpen(false);
      setOrgName("");
      toast.success("組織を作成しました");
    } catch {
      toast.error("組織の作成に失敗しました");
    } finally {
      setCreating(false);
    }
  };

  if (!mounted || orgsPending) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" disabled>
            <Skeleton className="size-8 rounded-lg" />
            <div className="grid flex-1 gap-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
              />
            }
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <BuildingIcon className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">
                {activeOrg?.name ?? "組織を選択"}
              </span>
              <span className="truncate text-xs">
                {activeOrg ? "アクティブ" : "組織が選択されていません"}
              </span>
            </div>
            <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-muted-foreground text-xs">
                組織一覧
              </DropdownMenuLabel>
              {orgs.map((org) => (
                <DropdownMenuItem
                  key={org.id}
                  onClick={() => handleSetActive(org.id)}
                  className="gap-2 p-2"
                >
                  <div className="flex size-6 items-center justify-center rounded-md border">
                    <BuildingIcon className="size-4" />
                  </div>
                  {org.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                className="gap-2 p-2"
                onClick={() => setCreateDialogOpen(true)}
              >
                <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                  <PlusIcon className="size-4" />
                </div>
                <div className="font-medium text-muted-foreground">
                  組織を作成
                </div>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog
          open={createDialogOpen}
          onOpenChange={(open) => {
            setCreateDialogOpen(open);
            if (!open) setOrgName("");
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>組織を作成</DialogTitle>
              <DialogDescription>新しい組織を作成します。</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="org-name">組織名</Label>
              <Input
                id="org-name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                maxLength={100}
                disabled={creating}
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                キャンセル
              </DialogClose>
              <Button
                onClick={handleCreateOrg}
                disabled={!orgName.trim() || creating}
              >
                {creating ? "作成中..." : "作成"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
