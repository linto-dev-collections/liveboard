/**
 * ボード管理の domain 型。
 * 外部パッケージ依存禁止（dependency-cruiser: domain-no-external-packages）。
 */

/** 組織内ロール（BetterAuth member.role）。 */
export type OrgRole = "owner" | "admin" | "member";

/** board_role の値（ボード単位の ACL）。 */
export type BoardRoleValue = "owner" | "editor" | "viewer";

/**
 * 権限解決（M8）の結果として算出される実効ロール。
 * null は「アクセス不可（org 非メンバー）」を表す。
 */
export type EffectiveRole = "owner" | "editor" | "viewer";

/** board テーブルの 1 行（repository から route へ返す整形済み型）。 */
export type Board = {
  id: string;
  organizationId: string;
  title: string;
  createdByUserId: string | null;
  thumbnailKey: string | null;
  /** epoch ミリ秒。 */
  lastActivityAt: number;
  deletionState: "active" | "purging";
  createdAt: number;
  updatedAt: number;
};

/** ダッシュボード一覧用の軽量行。 */
export type BoardListItem = {
  id: string;
  title: string;
  thumbnailKey: string | null;
  lastActivityAt: number;
  isFavorite: boolean;
};

/** board_role 一覧の 1 行。 */
export type BoardRoleEntry = {
  userId: string;
  role: BoardRoleValue;
};
