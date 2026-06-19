"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@liveboard/ui/components/ui/avatar";
import { Textarea } from "@liveboard/ui/components/ui/textarea";
import { cn } from "@liveboard/ui/lib/utils";
import { useEffect, useRef, useState } from "react";
import { applyMention, getActiveMentionQuery } from "../_lib/mentions";
import type { MentionableUser } from "../_lib/types";

const SUGGEST_DEBOUNCE_MS = 150;

/**
 * `@メンション` 補完付きテキストエリア（Presentational・props-only）。
 * データ取得は親から渡される `fetchMentionable` に委譲する（_components は fetch しない）。
 */
export function MentionTextarea({
  value,
  onChange,
  onSelectMention,
  fetchMentionable,
  placeholder,
  disabled,
  autoFocus,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelectMention: (user: MentionableUser) => void;
  fetchMentionable: (q: string) => Promise<MentionableUser[]>;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  onSubmit?: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [suggestions, setSuggestions] = useState<MentionableUser[]>([]);
  const [highlight, setHighlight] = useState(0);
  const activeRef = useRef<{ query: string; start: number } | null>(null);
  const caretRef = useRef<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqRef = useRef(0);

  // 補完確定後のキャレット位置を復元（value は制御コンポーネントのため次描画で適用）。
  // biome-ignore lint/correctness/useExhaustiveDependencies: value 変更後の再描画でキャレットを復元するための意図的な依存。
  useEffect(() => {
    if (caretRef.current !== null && textareaRef.current) {
      const pos = caretRef.current;
      caretRef.current = null;
      textareaRef.current.setSelectionRange(pos, pos);
    }
  }, [value]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const open = suggestions.length > 0 && activeRef.current !== null;

  function refreshSuggestions(text: string, caret: number) {
    const active = getActiveMentionQuery(text, caret);
    activeRef.current = active;
    if (!active) {
      setSuggestions([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const reqId = ++reqRef.current;
    debounceRef.current = setTimeout(() => {
      fetchMentionable(active.query)
        .then((users) => {
          if (reqId !== reqRef.current) return; // 古いレスポンスは破棄
          setSuggestions(users);
          setHighlight(0);
        })
        .catch(() => setSuggestions([]));
    }, SUGGEST_DEBOUNCE_MS);
  }

  function selectUser(user: MentionableUser) {
    const active = activeRef.current;
    const el = textareaRef.current;
    if (!active || !el) return;
    const { text, caret } = applyMention(
      value,
      active.start,
      el.selectionStart,
      user,
    );
    caretRef.current = caret;
    activeRef.current = null;
    setSuggestions([]);
    onSelectMention(user);
    onChange(text);
  }

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="min-h-16 text-sm"
        onChange={(e) => {
          onChange(e.target.value);
          refreshSuggestions(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => (h + 1) % suggestions.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight(
                (h) => (h - 1 + suggestions.length) % suggestions.length,
              );
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              const user = suggestions[highlight];
              if (user) {
                e.preventDefault();
                selectUser(user);
                return;
              }
            }
            if (e.key === "Escape") {
              e.preventDefault();
              activeRef.current = null;
              setSuggestions([]);
              return;
            }
          }
          if (
            (e.metaKey || e.ctrlKey) &&
            e.key === "Enter" &&
            onSubmit &&
            !disabled
          ) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      {open ? (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg">
          {suggestions.map((user, i) => (
            <button
              type="button"
              key={user.userId}
              // pointerDown だと textarea の blur より前に確定でき、選択が安定する。
              onMouseDown={(e) => {
                e.preventDefault();
                selectUser(user);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm",
                i === highlight ? "bg-muted" : "hover:bg-muted/60",
              )}
            >
              <Avatar className="size-6">
                <AvatarImage src={user.image ?? undefined} alt="" />
                <AvatarFallback className="text-xs">
                  {user.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate">{user.name}</span>
              <span className="truncate text-muted-foreground text-xs">
                {user.email}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
