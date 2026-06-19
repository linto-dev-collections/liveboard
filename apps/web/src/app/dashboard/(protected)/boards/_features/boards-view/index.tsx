"use client";

import { Input } from "@liveboard/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@liveboard/ui/components/ui/select";
import { Toggle } from "@liveboard/ui/components/ui/toggle";
import { SearchIcon, StarIcon } from "lucide-react";
import { useQueryStates } from "nuqs";
import { useEffect, useState, useTransition } from "react";
import { boardsSearchParsers } from "../../_lib/search-params";
import type { BoardListItem, BoardSort } from "../../_lib/types";
import { BoardCard } from "../board-card";
import { CreateBoardDialog } from "../create-board-dialog";
import { BoardsEmptyState } from "./_components/boards-empty-state";

export function BoardsView({ boards }: { boards: BoardListItem[] }) {
  const [isPending, startTransition] = useTransition();
  const [{ q, favorite, sort }, setParams] = useQueryStates(
    boardsSearchParsers,
    {
      shallow: false,
      startTransition,
    },
  );

  // 検索入力は即時反映（local state）、URL（= 再取得）へは 300ms デバウンスで反映。
  const [search, setSearch] = useState(q);
  useEffect(() => {
    setSearch(q);
  }, [q]);
  useEffect(() => {
    if (search === q) return;
    const timer = setTimeout(() => {
      setParams({ q: search || null });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, q, setParams]);

  const isFiltered = q.length > 0 || favorite;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full sm:max-w-xs">
            <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="ボードを検索"
              aria-label="ボードを検索"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Toggle
            variant="outline"
            aria-label="お気に入りのみ表示"
            pressed={favorite}
            onPressedChange={(pressed) =>
              setParams({ favorite: pressed || null })
            }
          >
            <StarIcon
              className={favorite ? "fill-current text-yellow-500" : ""}
            />
            お気に入り
          </Toggle>
          <Select
            value={sort}
            onValueChange={(value) =>
              value && setParams({ sort: value as BoardSort })
            }
            items={[
              { value: "recent", label: "最近の更新" },
              { value: "title", label: "名前順" },
            ]}
          >
            <SelectTrigger size="sm" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">最近の更新</SelectItem>
              <SelectItem value="title">名前順</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <CreateBoardDialog />
      </div>

      {boards.length === 0 ? (
        isFiltered ? (
          <p className="py-12 text-center text-muted-foreground text-sm">
            条件に一致するボードがありません。
          </p>
        ) : (
          <BoardsEmptyState />
        )
      ) : (
        <div
          className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${
            isPending ? "opacity-60 transition-opacity" : ""
          }`}
        >
          {boards.map((board) => (
            <BoardCard key={board.id} board={board} />
          ))}
        </div>
      )}
    </div>
  );
}
