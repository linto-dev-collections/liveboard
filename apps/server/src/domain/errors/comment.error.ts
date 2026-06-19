import { DomainError } from "./domain.error";

/**
 * スレッド/コメントが存在しない、または board→org スコープ外（IDOR 防止で存在を漏らさず 404）。
 * HTTP マッピング: 404 Not Found（app.ts:onError の NOT_FOUND）。
 */
export class CommentNotFoundError extends DomainError {
  constructor(message = "コメントが見つかりません") {
    super(message, "NOT_FOUND");
  }
}

/**
 * コメントの編集/削除を行う権限が無いとき（編集は author のみ・削除は author/board owner）。
 * HTTP マッピング: 403 Forbidden（app.ts:onError の PERMISSION_DENIED）。
 */
export class CommentForbiddenError extends DomainError {
  constructor(message = "この操作を行う権限がありません") {
    super(message, "PERMISSION_DENIED");
  }
}
