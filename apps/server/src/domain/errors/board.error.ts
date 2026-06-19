import { DomainError } from "./domain.error";

/**
 * ボードが存在しない／別組織のボード（IDOR 防止のため存在を漏らさず 404 にする）。
 * HTTP マッピング: 404 Not Found（app.ts:onError の NOT_FOUND）。
 */
export class BoardNotFoundError extends DomainError {
  constructor(boardId: string) {
    super(`board not found: ${boardId}`, "NOT_FOUND");
  }
}

/**
 * 実効ロール（M8）が要求操作に満たないとき throw。
 * リネーム/削除/role 付与は board owner（org owner/admin 含む）のみ。
 * HTTP マッピング: 403 Forbidden（app.ts:onError の PERMISSION_DENIED）。
 */
export class BoardForbiddenError extends DomainError {
  constructor(message = "この操作を行う権限がありません") {
    super(message, "PERMISSION_DENIED");
  }
}
