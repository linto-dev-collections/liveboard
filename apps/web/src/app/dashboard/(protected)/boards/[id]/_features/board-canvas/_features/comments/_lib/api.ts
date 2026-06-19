import type { AnchorKind, CommentThread, MentionableUser } from "./types";

/**
 * コメント・メンション REST のクライアント（plain fetch・`credentials:"include"`）。
 * hc を使わないのは asset と同様、追加マウントされた route の型結合を避けて堅牢にするため。
 */

export class CommentApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CommentApiError";
  }
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new CommentApiError(
      body?.error ?? `リクエストに失敗しました (${res.status})`,
      res.status,
    );
  }
  return res.json() as Promise<T>;
}

function base(serverUrl: string, boardId: string): string {
  return `${serverUrl}/api/boards/${boardId}`;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export type CreateThreadInput = {
  anchorKind: AnchorKind;
  anchorElementId?: string;
  anchorX?: number;
  anchorY?: number;
  body: string;
  mentionedUserIds?: string[];
};

export async function listThreads(
  serverUrl: string,
  boardId: string,
): Promise<CommentThread[]> {
  const res = await fetch(`${base(serverUrl, boardId)}/comments`, {
    credentials: "include",
  });
  return (await jsonOrThrow<{ threads: CommentThread[] }>(res)).threads;
}

export async function createThread(
  serverUrl: string,
  boardId: string,
  input: CreateThreadInput,
): Promise<CommentThread> {
  const res = await fetch(
    `${base(serverUrl, boardId)}/comments`,
    jsonInit("POST", input),
  );
  return (await jsonOrThrow<{ thread: CommentThread }>(res)).thread;
}

export async function addComment(
  serverUrl: string,
  boardId: string,
  threadId: string,
  input: { body: string; mentionedUserIds?: string[] },
): Promise<CommentThread> {
  const res = await fetch(
    `${base(serverUrl, boardId)}/comments/${threadId}`,
    jsonInit("POST", input),
  );
  return (await jsonOrThrow<{ thread: CommentThread }>(res)).thread;
}

export async function resolveThread(
  serverUrl: string,
  boardId: string,
  threadId: string,
  resolved: boolean,
): Promise<CommentThread> {
  const res = await fetch(
    `${base(serverUrl, boardId)}/comments/${threadId}/resolve`,
    jsonInit("PUT", { resolved }),
  );
  return (await jsonOrThrow<{ thread: CommentThread }>(res)).thread;
}

export async function updateComment(
  serverUrl: string,
  boardId: string,
  commentId: string,
  body: string,
): Promise<CommentThread> {
  const res = await fetch(
    `${base(serverUrl, boardId)}/comments/items/${commentId}`,
    jsonInit("PATCH", { body }),
  );
  return (await jsonOrThrow<{ thread: CommentThread }>(res)).thread;
}

export async function deleteComment(
  serverUrl: string,
  boardId: string,
  commentId: string,
): Promise<void> {
  const res = await fetch(
    `${base(serverUrl, boardId)}/comments/items/${commentId}`,
    { method: "DELETE", credentials: "include" },
  );
  await jsonOrThrow<{ success: boolean }>(res);
}

export async function fetchMentionable(
  serverUrl: string,
  boardId: string,
  q: string,
): Promise<MentionableUser[]> {
  const url = new URL(`${base(serverUrl, boardId)}/mentionable`);
  if (q) url.searchParams.set("q", q);
  const res = await fetch(url, { credentials: "include" });
  return (await jsonOrThrow<{ users: MentionableUser[] }>(res)).users;
}
