import { DomainError } from "./domain.error";

/**
 * アカウント削除フローが進行中（status='processing'/'failed'）のユーザーに対する API アクセスで throw。
 * クライアントは code === "ACCOUNT_DELETION_PENDING" で 410 を区別できる。
 * HTTP マッピング: 410 Gone（apps/server/src/app.ts:onError）。
 */
export class AccountDeletionPendingError extends DomainError {
  constructor() {
    super("Account deletion in progress", "ACCOUNT_DELETION_PENDING");
  }
}

/**
 * 削除フロー confirm 時に「request 時の snapshot」と「現在の状態」が乖離したとき throw。
 * race ガード: メンバー追加・脱退、別 org の owner になった等を検出。
 * HTTP マッピング: 409 Conflict。
 */
export class OwnershipConflictError extends DomainError {
  constructor(message: string) {
    super(message, "OWNERSHIP_CONFLICT");
  }
}

/**
 * OAuth ユーザーの削除フローで、Google 再認証の nonce が有効期限切れだったとき throw。
 * クライアントは code === "REAUTH_EXPIRED" を見て「もう一度 Google 認証からやり直し」を促す。
 * HTTP マッピング: 410 Gone。
 */
export class ReauthExpiredError extends DomainError {
  constructor() {
    super(
      "Re-authentication expired. Please retry from the deletion screen.",
      "REAUTH_EXPIRED",
    );
  }
}
