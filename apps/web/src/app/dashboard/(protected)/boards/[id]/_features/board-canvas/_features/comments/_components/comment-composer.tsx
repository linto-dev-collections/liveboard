"use client";

import { Button } from "@liveboard/ui/components/ui/button";
import { SendHorizontalIcon } from "lucide-react";
import { useState } from "react";
import { extractMentionedUserIds } from "../_lib/mentions";
import type { MentionableUser } from "../_lib/types";
import { MentionTextarea } from "./mention-textarea";

/**
 * コメント入力（新規スレッド / 返信 共用・Presentational）。
 * 送信時に本文と「残っている @メンション」から userId を抽出して親へ渡す。
 */
export function CommentComposer({
  onSubmit,
  fetchMentionable,
  placeholder = "コメントを入力（@ でメンション）",
  submitLabel = "送信",
  autoFocus,
}: {
  onSubmit: (body: string, mentionedUserIds: string[]) => Promise<void>;
  fetchMentionable: (q: string) => Promise<MentionableUser[]>;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const [selected, setSelected] = useState<MentionableUser[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = value.trim().length > 0 && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const mentionedUserIds = extractMentionedUserIds(value, selected);
      await onSubmit(value.trim(), mentionedUserIds);
      setValue("");
      setSelected([]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <MentionTextarea
        value={value}
        onChange={setValue}
        onSelectMention={(user) =>
          setSelected((prev) =>
            prev.some((u) => u.userId === user.userId) ? prev : [...prev, user],
          )
        }
        fetchMentionable={fetchMentionable}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={submitting}
        onSubmit={submit}
      />
      <div className="flex justify-end">
        <Button size="sm" disabled={!canSubmit} onClick={submit}>
          <SendHorizontalIcon />
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
