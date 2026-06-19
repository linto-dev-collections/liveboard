"use client";

import { Avatar, AvatarFallback } from "@liveboard/ui/components/ui/avatar";
import { Button } from "@liveboard/ui/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@liveboard/ui/components/ui/popover";
import { ScrollArea } from "@liveboard/ui/components/ui/scroll-area";
import {
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@liveboard/ui/components/ui/sidebar";
import { cn } from "@liveboard/ui/lib/utils";
import { BellIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";
import { useAuth } from "./auth-provider";

/** 未読数のポーリング間隔（ボードに居ない間は WS 通知が届かないため）。 */
const POLL_MS = 60_000;

type NotificationItem = {
  id: string;
  commentId: string;
  threadId: string;
  boardId: string;
  boardTitle: string | null;
  actorUserId: string | null;
  actorName: string | null;
  commentBody: string;
  readAt: number | null;
  createdAt: number;
};

/**
 * 通知センター（ベル＋未読バッジ・一覧・既読化）。サイドバー footer に常駐し、
 * ダッシュボードのどこからでもメンション通知を後追い確認できる（F-CM-06）。
 * 未読数は初期取得＋定期ポーリング、ボード上では WS で即時トーストされる（comments 側）。
 */
export function NotificationBell() {
  const { session, activeOrg } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const orgId = activeOrg?.id ?? null;

  const refreshCount = useCallback(async () => {
    try {
      const res = await api.api.notifications["unread-count"].$get();
      if (!res.ok) return;
      const data = await res.json();
      setCount(data.count);
    } catch {
      // 未読数の取得失敗はバッジ非表示に倒す（致命ではない）。
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.api.notifications.$get({ query: {} });
      if (res.ok) {
        const data = await res.json();
        setItems(data.notifications as NotificationItem[]);
      }
    } catch {
      // 一覧の取得失敗は空表示（再オープンで再試行）。
    } finally {
      setLoading(false);
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: orgId はアクティブ org 変更時に未読数を再取得するための意図的なトリガ。
  useEffect(() => {
    if (!session) return;
    void refreshCount();
    const timer = setInterval(() => void refreshCount(), POLL_MS);
    const onFocus = () => void refreshCount();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [session, orgId, refreshCount]);

  useEffect(() => {
    if (open) void loadList();
  }, [open, loadList]);

  if (!session) return null;

  async function markAllRead() {
    try {
      const res = await api.api.notifications.read.$post({ json: {} });
      if (res.ok) {
        setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? 0 })));
        setCount(0);
      }
    } catch {
      // 失敗は無視（次回ポーリングで整合）。
    }
  }

  async function openItem(n: NotificationItem) {
    setOpen(false);
    if (!n.readAt) {
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, readAt: 0 } : x)),
      );
      setCount((c) => Math.max(0, c - 1));
      try {
        await api.api.notifications.read.$post({ json: { ids: [n.id] } });
      } catch {
        // 失敗は無視。
      }
    }
    router.push(`/dashboard/boards/${n.boardId}`);
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger render={<SidebarMenuButton tooltip="通知" />}>
            <BellIcon />
            <span>通知</span>
          </PopoverTrigger>
          {count > 0 ? (
            <SidebarMenuBadge className="bg-primary text-primary-foreground">
              {count > 99 ? "99+" : count}
            </SidebarMenuBadge>
          ) : null}
          <PopoverContent align="start" side="right" className="w-80 gap-0 p-0">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="font-medium text-sm">通知</span>
              {count > 0 ? (
                <Button variant="ghost" size="xs" onClick={markAllRead}>
                  すべて既読
                </Button>
              ) : null}
            </div>
            <ScrollArea className="max-h-96">
              <div className="flex flex-col">
                {loading ? (
                  <p className="py-8 text-center text-muted-foreground text-sm">
                    読み込み中...
                  </p>
                ) : items.length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground text-sm">
                    通知はありません
                  </p>
                ) : (
                  items.map((n) => (
                    <button
                      type="button"
                      key={n.id}
                      onClick={() => void openItem(n)}
                      className={cn(
                        "flex gap-2 border-b px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/60",
                        n.readAt === null ? "bg-primary/5" : "",
                      )}
                    >
                      <Avatar className="mt-0.5 size-7 shrink-0">
                        <AvatarFallback className="text-xs">
                          {(n.actorName ?? "?").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          <span className="font-medium">
                            {n.actorName ?? "誰か"}
                          </span>{" "}
                          さんがあなたをメンションしました
                        </p>
                        <p className="line-clamp-2 text-muted-foreground text-xs">
                          {n.commentBody}
                        </p>
                        <p className="mt-0.5 text-muted-foreground text-xs">
                          {n.boardTitle ?? "ボード"} ·{" "}
                          {formatRelativeTime(
                            new Date(n.createdAt).toISOString(),
                          )}
                        </p>
                      </div>
                      {n.readAt === null ? (
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
