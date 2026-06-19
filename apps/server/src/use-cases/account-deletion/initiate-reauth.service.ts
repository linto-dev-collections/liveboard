import { ValidationError } from "../../domain/errors/domain.error";
import type { OrganizationAction } from "../../domain/types/account-deletion";
import type { createAccountDeletionReauthPendingRepository } from "../../infrastructure/repositories/account-deletion-reauth-pending.repository";
import type { createOrganizationRepository } from "../../infrastructure/repositories/organization.repository";
import type { createUserRepository } from "../../infrastructure/repositories/user.repository";
import { validateOrganizationActions } from "./delete-account.service";

type Deps = {
  userRepo: ReturnType<typeof createUserRepository>;
  orgRepo: ReturnType<typeof createOrganizationRepository>;
  reauthRepo: ReturnType<typeof createAccountDeletionReauthPendingRepository>;
};

/** Google 再認証の証跡を意図的に短時間で expire させる。 */
const REAUTH_TTL_MS = 5 * 60 * 1000;

/** 32-byte ランダム値を base64url 文字列で返す (~43 文字、padding なし)。 */
function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

/**
 * OAuth 専用ユーザーのアカウント削除フロー: 第 1 段階 = nonce 発行。
 *
 * - password 持ちユーザーが誤って本経路を叩いた場合は弾く (本経路は OAuth 専用)
 * - organizationActions と現在の DB 状態の整合性を事前検証 (race ガード前段)
 * - 既存 row を削除して新 row を INSERT (同一 user の nonce は常に 1 件以下)
 * - nonce を返す (client は authClient.signIn.social の callbackURL に埋め込む)
 *
 * 注意: 本ステップでは `account_deletion_pending` には **触れない**。削除を確定状態に
 * 遷移させるのは confirm-reauth が再認証完了を検証した後である。
 */
export function createInitiateReauthService(deps: Deps) {
  return {
    async execute(params: {
      userId: string;
      prevSessionId: string;
      organizationActions: OrganizationAction[];
    }): Promise<{ nonce: string; expiresAt: Date }> {
      // 1. password を持つユーザーは本経路を使えない (password 経路に誘導)
      const hash = await deps.userRepo.findPasswordHash(params.userId);
      if (hash) {
        throw new ValidationError(
          "Use password-based deletion endpoint for credential users.",
        );
      }

      // 2. organizationActions の整合性を事前検証 (Step 2 と同じロジックを共有)
      await validateOrganizationActions({
        userId: params.userId,
        organizationActions: params.organizationActions,
        orgRepo: deps.orgRepo,
      });

      // 3. nonce 発行 + upsert (内部で既存 row を消してから INSERT)
      const nonce = generateNonce();
      const expiresAt = new Date(Date.now() + REAUTH_TTL_MS);
      await deps.reauthRepo.upsert({
        nonce,
        userId: params.userId,
        prevSessionId: params.prevSessionId,
        organizationActions: params.organizationActions,
        expiresAt,
      });

      return { nonce, expiresAt };
    },
  };
}
