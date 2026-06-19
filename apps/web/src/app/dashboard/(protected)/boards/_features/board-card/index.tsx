"use client";

import { env } from "@liveboard/env/web";
import { renameBoardSchema } from "@liveboard/shared/schemas";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@liveboard/ui/components/ui/alert-dialog";
import { Button } from "@liveboard/ui/components/ui/button";
import { Card } from "@liveboard/ui/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@liveboard/ui/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@liveboard/ui/components/ui/dropdown-menu";
import { Input } from "@liveboard/ui/components/ui/input";
import { Label } from "@liveboard/ui/components/ui/label";
import {
  MoreHorizontalIcon,
  PencilIcon,
  PresentationIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import {
  deleteBoardAction,
  renameBoardAction,
  toggleFavoriteAction,
} from "../../_lib/actions";
import type { BoardListItem } from "../../_lib/types";

export function BoardCard({ board }: { board: BoardListItem }) {
  const href = `/dashboard/boards/${board.id}` as const;
  const [isPending, startTransition] = useTransition();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [title, setTitle] = useState(board.title);

  function handleToggleFavorite() {
    startTransition(async () => {
      const result = await toggleFavoriteAction(board.id, !board.isFavorite);
      if (!result.success) toast.error(result.error);
    });
  }

  function handleRename(e: React.FormEvent) {
    e.preventDefault();
    const parsed = renameBoardSchema.safeParse({ title });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    startTransition(async () => {
      const result = await renameBoardAction(board.id, parsed.data.title);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("名前を変更しました");
      setRenameOpen(false);
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteBoardAction(board.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("ボードを削除しました");
      setDeleteOpen(false);
    });
  }

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <Link
        href={href}
        aria-label={`${board.title} を開く`}
        className="flex aspect-video items-center justify-center overflow-hidden bg-gradient-to-br from-muted to-muted/40 transition-colors hover:from-muted/80"
      >
        {board.thumbnailKey ? (
          // R2 サムネ（GET /api/boards/:id/thumbnail）。?v= で更新時にキャッシュを破棄。
          // 同一サイト Cookie で認可（cross-origin img でも SameSite=Lax が送られる）。
          // biome-ignore lint/performance/noImgElement: 外部 Worker の動的サムネで next/image 最適化は不要。
          <img
            src={`${env.NEXT_PUBLIC_SERVER_URL}/api/boards/${board.id}/thumbnail?v=${board.lastActivityAt}`}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          <PresentationIcon className="size-10 text-muted-foreground/50" />
        )}
      </Link>

      <div className="flex items-start justify-between gap-2 p-3">
        <div className="min-w-0 flex-1">
          <Link
            href={href}
            className="block truncate font-medium hover:underline"
          >
            {board.title}
          </Link>
          <p className="text-muted-foreground text-xs">
            更新 {formatDate(new Date(board.lastActivityAt))}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={
              board.isFavorite ? "お気に入りから外す" : "お気に入りに追加"
            }
            aria-pressed={board.isFavorite}
            disabled={isPending}
            onClick={handleToggleFavorite}
          >
            <StarIcon
              className={
                board.isFavorite ? "fill-yellow-400 text-yellow-400" : ""
              }
            />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label="ボードの操作"
                />
              }
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  setTitle(board.title);
                  setRenameOpen(true);
                }}
              >
                <PencilIcon />
                名前を変更
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2Icon />
                削除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* リネーム */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>名前を変更</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRename} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`rename-${board.id}`}>タイトル</Label>
              <Input
                id={`rename-${board.id}`}
                value={title}
                autoFocus
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                キャンセル
              </DialogClose>
              <Button type="submit" disabled={isPending}>
                {isPending ? "保存中..." : "保存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 削除確認 */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ボードを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{board.title}」を削除します。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
            >
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
