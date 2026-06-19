"use client";

import { Button } from "@liveboard/ui/components/ui/button";
import { ScrollArea } from "@liveboard/ui/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@liveboard/ui/components/ui/sheet";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@liveboard/ui/components/ui/tabs";
import {
  CheckCircle2Icon,
  CircleIcon,
  MessageSquarePlusIcon,
} from "lucide-react";
import { useState } from "react";
import { formatRelativeTime } from "@/lib/format";
import type { CommentThread } from "../_lib/types";

function relative(ms: number): string {
  return formatRelativeTime(new Date(ms).toISOString());
}

function ThreadRow({
  thread,
  onJump,
  onResolve,
}: {
  thread: CommentThread;
  onJump: (threadId: string) => void;
  onResolve: (threadId: string, resolved: boolean) => Promise<void>;
}) {
  const first = thread.comments[0];
  // 行全体を <button> にすると解決ボタン（<button>）が入れ子になり HTML 不正（hydration error）。
  // カードは <div> にし、ジャンプ用ボタンと解決ボタンを**兄弟**として並べる。
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/60">
      <button
        type="button"
        onClick={() => onJump(thread.id)}
        className="flex w-full flex-col gap-1 text-left"
      >
        <div className="flex w-full items-center justify-between gap-2">
          <span className="truncate font-medium text-sm">
            {first?.authorName ?? "不明なユーザー"}
          </span>
          <span className="shrink-0 text-muted-foreground text-xs">
            {relative(thread.createdAt)}
          </span>
        </div>
        <p className="line-clamp-2 text-left text-muted-foreground text-sm">
          {first?.body ?? "(本文なし)"}
        </p>
      </button>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs">
          {thread.comments.length} 件
        </span>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => void onResolve(thread.id, !thread.resolved)}
        >
          {thread.resolved ? (
            <>
              <CircleIcon />
              再オープン
            </>
          ) : (
            <>
              <CheckCircle2Icon />
              解決
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

/**
 * コメントサイドバー（Presentational）。未解決/解決済みタブでスレッド一覧を表示し、
 * 行クリックで該当ピンへジャンプ、解決トグル、新規コメント追加を親へ通知する。
 */
export function CommentsSheet({
  open,
  onOpenChange,
  threads,
  onJump,
  onResolve,
  onAddComment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  threads: CommentThread[];
  onJump: (threadId: string) => void;
  onResolve: (threadId: string, resolved: boolean) => Promise<void>;
  onAddComment: () => void;
}) {
  const [tab, setTab] = useState("open");
  const openThreads = threads.filter((t) => !t.resolved);
  const resolvedThreads = threads.filter((t) => t.resolved);
  const list = tab === "open" ? openThreads : resolvedThreads;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>コメント</SheetTitle>
        </SheetHeader>

        <div className="border-b p-3">
          <Button className="w-full" size="sm" onClick={onAddComment}>
            <MessageSquarePlusIcon />
            コメントを追加
          </Button>
        </div>

        <Tabs
          value={tab}
          onValueChange={setTab}
          className="min-h-0 flex-1 gap-0"
        >
          <div className="px-3 pt-3">
            <TabsList className="w-full">
              <TabsTrigger value="open">
                未解決 ({openThreads.length})
              </TabsTrigger>
              <TabsTrigger value="resolved">
                解決済み ({resolvedThreads.length})
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value={tab} className="min-h-0 flex-1">
            <ScrollArea className="h-full">
              <div className="flex flex-col gap-2 p-3">
                {list.length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground text-sm">
                    {tab === "open"
                      ? "未解決のコメントはありません"
                      : "解決済みのコメントはありません"}
                  </p>
                ) : (
                  list.map((thread) => (
                    <ThreadRow
                      key={thread.id}
                      thread={thread}
                      onJump={onJump}
                      onResolve={onResolve}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
