/**
 * アカウント削除フロー専用の domain 型。
 * 外部パッケージ依存禁止（dependency-cruiser: domain-no-external-packages）。
 */

/**
 * 削除フローで指定する組織アクション。
 * - "transfer": 後継 owner（admin/member 問わず）に owner を譲渡
 * - "delete-org": 1 人 org を組織ごと削除（cascade で member/invitation も消える）
 */
export type OrganizationAction =
  | { organizationId: string; action: "transfer"; transferToUserId: string }
  | { organizationId: string; action: "delete-org" };

/**
 * 削除前画面に渡すための owner org サマリ。
 * candidates が空配列なら譲渡先がいない（= delete-org 一択 or stuck）。
 */
export type OwnedOrganizationSummary = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  /** owner 含むメンバー総数（自分含む） */
  memberCount: number;
  /** 自分以外の有効候補メンバー（メール確認済 + 削除中ではない） */
  candidates: Array<{
    userId: string;
    memberId: string;
    name: string;
    email: string;
    role: "admin" | "member";
  }>;
};
