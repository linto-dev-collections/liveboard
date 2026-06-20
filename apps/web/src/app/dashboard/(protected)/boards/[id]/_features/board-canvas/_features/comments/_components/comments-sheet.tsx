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
import { cn } from "@liveboard/ui/lib/utils";
import {
  CheckCircle2Icon,
  CircleIcon,
  MessageSquarePlusIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatRelativeTime } from "@/lib/format";
import type { CommentThread } from "../_lib/types";

function relative(ms: number): string {
  return formatRelativeTime(new Date(ms).toISOString());
}

function ThreadRow({
  thread,
  onJump,
  onResolve,
  highlighted,
}: {
  thread: CommentThread;
  onJump: (threadId: string) => void;
  onResolve: (threadId: string, resolved: boolean) => Promise<void>;
  highlighted?: boolean;
}) {
  const first = thread.comments[0];
  // 行全体を <button> にすると解決ボタン（<button>）が入れ子になり HTML 不正（hydration error）。
  // カードは <div> にし、ジャンプ用ボタンと解決ボタンを**兄弟**として並べる。
  return (
    <div
      data-thread-id={thread.id}
      className={cn(
        "flex flex-col gap-1 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/60",
        highlighted ? "border-primary ring-2 ring-primary" : "border-border",
      )}
    >
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
  highlightThreadId,
  onHighlightConsumed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  threads: CommentThread[];
  onJump: (threadId: string) => void;
  onResolve: (threadId: string, resolved: boolean) => Promise<void>;
  onAddComment: () => void;
  /** キャンバスにピンを出せないスレッドへジャンプした際の強調対象。 */
  highlightThreadId?: string | null;
  /** 強調を表示し終えたら呼ぶ（親の指定をクリアするため）。 */
  onHighlightConsumed?: () => void;
}) {
  const [tab, setTab] = useState("open");
  const [ringId, setRingId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const openThreads = threads.filter((t) => !t.resolved);
  const resolvedThreads = threads.filter((t) => t.resolved);
  const list = tab === "open" ? openThreads : resolvedThreads;

  // フォールバック時（キャンバスにピンを出せないスレッド）に、該当行を含むタブへ
  // 切り替えてスクロールし、一時的にリング強調する。
  // biome-ignore lint/correctness/useExhaustiveDependencies: highlightThreadId 変化時のみ起動する一回限りの強調。threads / コールバックは起動時点の値で十分。
  useEffect(() => {
    if (!highlightThreadId) return;
    const target = threads.find((x) => x.id === highlightThreadId);
    if (target) setTab(target.resolved ? "resolved" : "open");
    setRingId(highlightThreadId);
    // タブ切替後の再レンダーを待ってから該当行へスクロールする。
    const scrollTimer = setTimeout(() => {
      listRef.current
        ?.querySelector(`[data-thread-id="${CSS.escape(highlightThreadId)}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);
    const ringTimer = setTimeout(() => setRingId(null), 1800);
    const consumeTimer = setTimeout(() => onHighlightConsumed?.(), 2000);
    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(ringTimer);
      clearTimeout(consumeTimer);
    };
  }, [highlightThreadId]);

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
              <div className="flex flex-col gap-2 p-3" ref={listRef}>
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
                      highlighted={thread.id === ringId}
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
