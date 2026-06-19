import { ReauthExpiredError } from "../../domain/errors/account-deletion.error";
import {
  NotFoundError,
  PermissionDeniedError,
} from "../../domain/errors/domain.error";
import type { createAccountDeletionPendingRepository } from "../../infrastructure/repositories/account-deletion-pending.repository";
import type { createAccountDeletionReauthPendingRepository } from "../../infrastructure/repositories/account-deletion-reauth-pending.repository";
import type { createAccountPurgeRepository } from "../../infrastructure/repositories/account-purge.repository";
import type { createOrganizationRepository } from "../../infrastructure/repositories/organization.repository";
import type { createSessionRepository } from "../../infrastructure/repositories/session.repository";
import type { createUserRepository } from "../../infrastructure/repositories/user.repository";
import { executeAccountDeletion } from "./delete-account.service";

type Deps = {
  userRepo: ReturnType<typeof createUserRepository>;
  orgRepo: ReturnType<typeof createOrganizationRepository>;
  pendingRepo: ReturnType<typeof createAccountDeletionPendingRepository>;
  reauthRepo: ReturnType<typeof createAccountDeletionReauthPendingRepository>;
  sessionRepo: ReturnType<typeof createSessionRepository>;
  purgeRepo: ReturnType<typeof createAccountPurgeRepository>;
  sendOwnershipTransferNotice: (params: {
    to: string;
    recipientName: string;
    organizationName: string;
    previousOwnerName: string;
  }) => Promise<void>;
};

/**
 * OAuth 専用ユーザーのアカウント削除フロー: 第 2 段階 = Google 再認証完了の検証 + 削除実行。
 *
 * 入力:
 *   - nonce (initiate-reauth で発行された値)
 *   - currentSessionId / currentSessionCreatedAt (Hono c.get("session") から)
 *   - userId (Hono c.get("user") から)
 *
 * 検証ロジック (順序保持):
 *   1. nonce で未使用 row を引く → 無ければ NotFound (404)
 *   2. userId と row.userId が一致 → 違えば PermissionDenied (403)
 *   3. expires_at >= now → 過ぎていれば ReauthExpired (410)
 *   4. currentSessionId !== prev_session_id → 同じなら "再認証されていない"
 *      として PermissionDenied (403)
 *   5. currentSessionCreatedAt > row.createdAt → 古い session が誤って使われていれば 403
 *   6. markUsed で single-use 確保 (atomic, returning で検証) → 失敗なら 409 相当の race
 *   7. executeAccountDeletion を呼び、 organizationActions は **DB の snapshot を使う**
 *      (request からは渡さない = 改ざん不可)
 */
export function createConfirmReauthService(deps: Deps) {
  return {
    async execute(params: {
      userId: string;
      currentSessionId: string;
      currentSessionCreatedAt: Date;
      nonce: string;
    }): Promise<{ userId: string }> {
      // 1. 未使用 row を取得
      const row = await deps.reauthRepo.findActiveByNonce(params.nonce);
      if (!row) {
        // 存在しない or 既に消費済み (used_at IS NOT NULL は WHERE で除外している)
        throw new NotFoundError("ReauthPending", params.nonce);
      }

      // 2. nonce 紐付け user とリクエスト user の一致
      if (row.userId !== params.userId) {
        throw new PermissionDeniedError("Nonce does not belong to this user.");
      }

      // 3. TTL
      if (row.expiresAt.getTime() < Date.now()) {
        throw new ReauthExpiredError();
      }

      // 4. 再認証で session.id が新しくなっていること
      if (params.currentSessionId === row.prevSessionId) {
        throw new PermissionDeniedError(
          "Re-authentication required: session has not changed.",
        );
      }

      // 5. 新 session が initiate の後に作られていること
      if (params.currentSessionCreatedAt.getTime() <= row.createdAt.getTime()) {
        throw new PermissionDeniedError(
          "Re-authentication required: current session is not newer than the initiation.",
        );
      }

      // 6. single-use 確保 (atomic test-and-set)
      const { acquired } = await deps.reauthRepo.markUsed(params.nonce);
      if (!acquired) {
        // 並行する別リクエストが先に消費した。replay or 並行多重クリック。
        throw new PermissionDeniedError(
          "Re-authentication token already used.",
        );
      }

      // 7. 削除実行 (organizationActions は DB snapshot からのみ)
      return executeAccountDeletion(deps, {
        userId: params.userId,
        organizationActions: row.organizationActions,
      });
    },
  };
}
