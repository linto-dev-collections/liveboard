import type { BoardRoleValue, EffectiveRole, OrgRole } from "../types/board";

/**
 * 権限解決（M8・テーブル定義書 §3）を行う純関数。
 * DB を参照せず、呼び出し側（use-case）が repository で集めた
 * `orgRole`（member.role）と `boardRole`（board_role.role）から実効ロールを算出する。
 *
 * 規則（上から順に評価）:
 *   1. org `owner`/`admin` → board でも `owner` 相当（board_role を上書き）
 *   2. それ以外で `boardRole` 行があれば → その role
 *   3. org メンバー（`member`）で board_role 無し → 既定 `editor`
 *   4. 非メンバー（`orgRole === null`）→ `null`（アクセス不可）
 */
export function resolveEffectiveRole(params: {
  orgRole: OrgRole | null;
  boardRole: BoardRoleValue | null;
}): EffectiveRole | null {
  const { orgRole, boardRole } = params;
  // 4. 非メンバーはアクセス不可
  if (orgRole === null) return null;
  // 1. org owner/admin は board owner 相当
  if (orgRole === "owner" || orgRole === "admin") return "owner";
  // 2. 明示的な board_role 行
  if (boardRole !== null) return boardRole;
  // 3. org メンバーの既定は editor
  return "editor";
}

/** 要素の編集（描画・更新・削除）が可能か。owner / editor のみ。 */
export function canEdit(role: EffectiveRole | null): boolean {
  return role === "owner" || role === "editor";
}

/** ボードの管理（リネーム・削除要求・role 付与）が可能か。owner のみ。 */
export function canManage(role: EffectiveRole | null): boolean {
  return role === "owner";
}

/**
 * コメントが可能か。owner / editor / viewer すべて可（viewer もコメントは可）。
 * 非メンバー（null）は不可。
 */
export function canComment(role: EffectiveRole | null): boolean {
  return role !== null;
}
