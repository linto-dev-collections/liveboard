/**
 * コメント・通知のクライアント型（サーバ `apps/server/src/domain/types/comment.ts`・
 * `realtime/protocol.ts` と整合する手書き型）。epoch ミリ秒で時刻を表す。
 */

export type AnchorKind = "element" | "point";

export type CommentItem = {
  id: string;
  threadId: string;
  authorId: string | null;
  authorName: string | null;
  authorImage: string | null;
  body: string;
  createdAt: number;
  updatedAt: number;
};

export type CommentThread = {
  id: string;
  boardId: string;
  anchorKind: AnchorKind;
  anchorElementId: string | null;
  anchorX: number | null;
  anchorY: number | null;
  resolved: boolean;
  resolvedAt: number | null;
  resolvedByUserId: string | null;
  createdByUserId: string | null;
  createdAt: number;
  updatedAt: number;
  comments: CommentItem[];
};

export type MentionableUser = {
  userId: string;
  name: string;
  email: string;
  image: string | null;
};

export type NotificationItem = {
  id: string;
  type: "mention";
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

// ---- WS（サーバ→クライアント） ----

export type CommentEventKind =
  | "thread_created"
  | "comment_added"
  | "comment_updated"
  | "comment_deleted"
  | "thread_resolved";

export type CommentWsMessage = {
  type: "COMMENT";
  event: CommentEventKind;
  thread?: CommentThread;
  threadId?: string;
  commentId?: string;
  threadDeleted?: boolean;
};

export type NotificationWsMessage = {
  type: "NOTIFICATION";
  notification: NotificationItem;
};
