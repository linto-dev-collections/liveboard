"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@liveboard/ui/components/ui/avatar";
import { Button } from "@liveboard/ui/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@liveboard/ui/components/ui/popover";
import { ScrollArea } from "@liveboard/ui/components/ui/scroll-area";
import { Textarea } from "@liveboard/ui/components/ui/textarea";
import { cn } from "@liveboard/ui/lib/utils";
import {
  CheckCircle2Icon,
  CircleIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { formatRelativeTime } from "@/lib/format";
import type {
  CommentItem,
  CommentThread,
  MentionableUser,
} from "../_lib/types";
import { CommentComposer } from "./comment-composer";

function initials(name: string | null): string {
  return (name ?? "?").charAt(0).toUpperCase();
}

function relative(ms: number): string {
  return formatRelativeTime(new Date(ms).toISOString());
}

/** 1 件のコメント行（自分/owner には編集・削除を表示）。 */
function CommentRow({
  comment,
  currentUserId,
  canManage,
  onEdit,
  onDelete,
}: {
  comment: CommentItem;
  currentUserId: string | null;
  canManage: boolean;
  onEdit: (commentId: string, body: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [busy, setBusy] = useState(false);
  const isAuthor = currentUserId !== null && comment.authorId === currentUserId;

  async function save() {
    if (draft.trim().length === 0 || busy) return;
    setBusy(true);
    try {
      await onEdit(comment.id, draft.trim());
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2">
      <Avatar className="mt-0.5 size-6 shrink-0">
        <AvatarImage src={comment.authorImage ?? undefined} alt="" />
        <AvatarFallback className="text-xs">
          {initials(comment.authorName)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-medium text-sm">
            {comment.authorName ?? "不明なユーザー"}
          </span>
          <span className="shrink-0 text-muted-foreground text-xs">
            {relative(comment.createdAt)}
          </span>
          {(isAuthor || canManage) && !editing ? (
            <div className="ml-auto flex shrink-0 gap-0.5">
              {isAuthor ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="編集"
                  onClick={() => {
                    setDraft(comment.body);
                    setEditing(true);
                  }}
                >
                  <PencilIcon />
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="削除"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void onDelete(comment.id).finally(() => setBusy(false));
                }}
              >
                <Trash2Icon />
              </Button>
            </div>
          ) : null}
        </div>
        {editing ? (
          <div className="mt-1 flex flex-col gap-1.5">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-14 text-sm"
            />
            <div className="flex justify-end gap-1.5">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setEditing(false)}
              >
                キャンセル
              </Button>
              <Button size="xs" disabled={busy} onClick={save}>
                保存
              </Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm">
            {comment.body}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * キャンバス上のコメントピン＋スレッドポップオーバー（Presentational）。
 * 位置（container 相対 px）は親が射影して渡す。データ通信は親のコールバックに委譲する。
 */
export function CommentPin({
  thread,
  position,
  open,
  onOpenChange,
  currentUserId,
  canManage,
  fetchMentionable,
  onReply,
  onResolve,
  onEdit,
  onDelete,
}: {
  thread: CommentThread;
  position: { x: number; y: number };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string | null;
  canManage: boolean;
  fetchMentionable: (q: string) => Promise<MentionableUser[]>;
  onReply: (body: string, mentionedUserIds: string[]) => Promise<void>;
  onResolve: (resolved: boolean) => Promise<void>;
  onEdit: (commentId: string, body: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
}) {
  return (
    <div
      className="pointer-events-auto absolute -translate-x-1/2 -translate-y-full"
      style={{ left: position.x, top: position.y }}
    >
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger
          aria-label="コメントスレッドを開く"
          className={cn(
            "flex h-7 min-w-7 items-center justify-center gap-1 rounded-full rounded-bl-none border px-1.5 font-medium text-xs shadow-md transition-colors",
            thread.resolved
              ? "border-border bg-muted text-muted-foreground"
              : "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {thread.resolved ? (
            <CheckCircle2Icon className="size-3.5" />
          ) : (
            <span>{thread.comments.length}</span>
          )}
        </PopoverTrigger>
        <PopoverContent align="start" side="top" className="w-80 gap-0 p-0">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="font-medium text-sm">コメント</span>
            <Button
              variant={thread.resolved ? "secondary" : "ghost"}
              size="xs"
              onClick={() => void onResolve(!thread.resolved)}
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

          <ScrollArea className="max-h-64">
            <div className="flex flex-col gap-3 p-3">
              {thread.comments.map((c) => (
                <CommentRow
                  key={c.id}
                  comment={c}
                  currentUserId={currentUserId}
                  canManage={canManage}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </div>
          </ScrollArea>

          <div className="border-t p-3">
            <CommentComposer
              onSubmit={onReply}
              fetchMentionable={fetchMentionable}
              placeholder="返信（@ でメンション）"
              submitLabel="返信"
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
