/**
 * コメント・メンション・通知の domain 型。
 * 外部パッケージ依存禁止（dependency-cruiser: domain-no-external-packages）。
 * epoch ミリ秒で時刻を表現する（repository が Date→number に整形して返す）。
 */

export type AnchorKind = "element" | "point";

/** コメント 1 件（表示用に author の氏名/画像を同梱）。 */
export type CommentView = {
  id: string;
  threadId: string;
  authorId: string | null;
  authorName: string | null;
  authorImage: string | null;
  body: string;
  createdAt: number;
  updatedAt: number;
};

/** スレッド 1 件（comments を含む。サイドバー/ピン表示用）。 */
export type CommentThreadView = {
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
  comments: CommentView[];
};

/** 通知 1 件（表示用に actor 氏名・コメント本文・遷移先 board/thread を同梱）。 */
export type NotificationView = {
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

/** メンション補完候補（org メンバー）。 */
export type MentionableUser = {
  userId: string;
  name: string;
  email: string;
  image: string | null;
};
