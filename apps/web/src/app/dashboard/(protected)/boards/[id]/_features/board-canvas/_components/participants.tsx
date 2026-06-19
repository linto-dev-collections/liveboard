"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@liveboard/ui/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@liveboard/ui/components/ui/tooltip";
import { useSyncExternalStore } from "react";
import type { PresenceStore } from "../_lib/presence";
import type { ParticipantInfo } from "../_lib/types";

/** スタック表示する最大アバター数。超過分は +N でまとめる。 */
const MAX_VISIBLE = 5;

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (
    (parts[0][0] ?? "") + (parts[parts.length - 1][0] ?? "")
  ).toUpperCase();
}

function ParticipantAvatar({
  participant,
  label,
}: {
  participant: ParticipantInfo;
  label: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span />}>
        <Avatar size="sm">
          {/* ユーザーが設定しているアイコン（プロフィール画像）。未設定・読込失敗時は
              色付きイニシャルにフォールバックする（Base UI Avatar の既定挙動）。 */}
          <AvatarImage
            src={participant.image || undefined}
            alt={participant.username}
          />
          <AvatarFallback
            style={{ backgroundColor: participant.color, color: "#fff" }}
          >
            {initials(participant.username)}
          </AvatarFallback>
        </Avatar>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * オンライン参加者のアバターを `renderTopRightUI` でスタック表示する。
 * 自分＋他参加者（presence ロスター）を購読し、人数が多いときは +N に畳む。
 */
export function Participants({ presence }: { presence: PresenceStore }) {
  const snapshot = useSyncExternalStore(
    presence.subscribe,
    presence.getSnapshot,
    presence.getSnapshot,
  );

  const all: { participant: ParticipantInfo; isSelf: boolean }[] = [];
  if (snapshot.self) all.push({ participant: snapshot.self, isSelf: true });
  for (const other of snapshot.others) {
    all.push({ participant: other, isSelf: false });
  }
  if (all.length === 0) return null;

  const visible = all.slice(0, MAX_VISIBLE);
  const overflow = all.length - visible.length;

  return (
    <TooltipProvider>
      <AvatarGroup data-size="sm">
        {visible.map(({ participant, isSelf }) => (
          <ParticipantAvatar
            key={participant.socketId}
            participant={participant}
            label={
              isSelf
                ? `${participant.username || "あなた"}（あなた）`
                : participant.username || "匿名ユーザー"
            }
          />
        ))}
        {overflow > 0 ? <AvatarGroupCount>+{overflow}</AvatarGroupCount> : null}
      </AvatarGroup>
    </TooltipProvider>
  );
}
