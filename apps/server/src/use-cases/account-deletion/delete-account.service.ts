import { OwnershipConflictError } from "../../domain/errors/account-deletion.error";
import {
  UnauthorizedError,
  ValidationError,
} from "../../domain/errors/domain.error";
import type { OrganizationAction } from "../../domain/types/account-deletion";
import type { createAccountDeletionPendingRepository } from "../../infrastructure/repositories/account-deletion-pending.repository";
import type { createAccountPurgeRepository } from "../../infrastructure/repositories/account-purge.repository";
import type { createOrganizationRepository } from "../../infrastructure/repositories/organization.repository";
import type { createSessionRepository } from "../../infrastructure/repositories/session.repository";
import type { createUserRepository } from "../../infrastructure/repositories/user.repository";

type CoreDeps = {
  userRepo: ReturnType<typeof createUserRepository>;
  orgRepo: ReturnType<typeof createOrganizationRepository>;
  pendingRepo: ReturnType<typeof createAccountDeletionPendingRepository>;
  sessionRepo: ReturnType<typeof createSessionRepository>;
  purgeRepo: ReturnType<typeof createAccountPurgeRepository>;
  /** 後継 owner への通知メール（composition root 経由）。 */
  sendOwnershipTransferNotice: (params: {
    to: string;
    recipientName: string;
    organizationName: string;
    previousOwnerName: string;
  }) => Promise<void>;
};

type Deps = CoreDeps & {
  /** PBKDF2 hash 比較関数（@liveboard/auth から composition root 経由で注入）。 */
  verifyPassword: (params: {
    hash: string;
    password: string;
  }) => Promise<boolean>;
};

/**
 * organizationActions と現在の DB 状態の整合性を検証する純粋関数。
 * 副作用は一切無く、不整合があれば OwnershipConflictError / ValidationError を投げる。
 *
 * password 経路 (createDeleteAccountService) と OAuth 再認証経路 (initiate-reauth.service)
 * の両方の事前チェックで使う。
 */
export async function validateOrganizationActions(params: {
  userId: string;
  organizationActions: OrganizationAction[];
  orgRepo: ReturnType<typeof createOrganizationRepository>;
}): Promise<void> {
  const owned = await params.orgRepo.findOwnedByUserId(params.userId);
  const actionMap = new Map(
    params.organizationActions.map((a) => [a.organizationId, a]),
  );

  // すべての owner org が actions に網羅されていること
  for (const org of owned) {
    const action = actionMap.get(org.organizationId);
    if (!action) {
      throw new OwnershipConflictError(
        `Missing action for organization '${org.organizationName}'. Please reopen the deletion dialog and choose transfer or delete-org.`,
      );
    }
    if (action.action === "transfer") {
      const candidates = await params.orgRepo.findOwnerCandidates(
        org.organizationId,
      );
      const valid = candidates.some(
        (c) => c.userId === action.transferToUserId,
      );
      if (!valid) {
        throw new OwnershipConflictError(
          `Transfer target is no longer a valid member of '${org.organizationName}'. Please reopen the deletion dialog.`,
        );
      }
    }
    if (action.action === "delete-org" && org.memberCount > 1) {
      throw new OwnershipConflictError(
        `'${org.organizationName}' now has ${org.memberCount - 1} other member(s). Please reopen the deletion dialog and choose transfer.`,
      );
    }
  }

  // owner ではない org が actions に紛れていないこと
  for (const action of params.organizationActions) {
    if (!owned.find((o) => o.organizationId === action.organizationId)) {
      throw new ValidationError(
        `You are not the owner of organization '${action.organizationId}'`,
      );
    }
  }
}

/**
 * 削除フローの本体。本人性検証 (password / re-auth) を **済ませた前提** で呼ぶ。
 *
 * - 整合性検証 (validateOrganizationActions)
 * - account_deletion_pending を 'processing' で upsert（部分失敗時の再登録ガード）
 * - owner swap/delete を atomic に実行 + owner-count assertion
 * - session 全削除（即ログアウト）
 * - 譲渡通知メール送信 (best-effort)
 * - email 宛 pending 招待の削除 + user 行 DELETE（cascade で関連行を一括削除）
 *
 * 録画・課金・Webhook を持たないため、旧版の Cloudflare Workflow 非同期削除は不要で、
 * すべて同期的に完了する。成功時は user 行 DELETE の cascade で
 * account_deletion_pending も消えるため、pending 行は残らない。
 */
export async function executeAccountDeletion(
  deps: CoreDeps,
  params: {
    userId: string;
    organizationActions: OrganizationAction[];
  },
): Promise<{ userId: string }> {
  // 1. 整合性検証（snapshot vs 現状の乖離検出）
  await validateOrganizationActions({
    userId: params.userId,
    organizationActions: params.organizationActions,
    orgRepo: deps.orgRepo,
  });

  // 2. account_deletion_pending を 'processing' で upsert
  //    （以降この user の API は middleware で 410。部分失敗時の再登録ガードにもなる）
  const userRow = await deps.userRepo.findById(params.userId);
  await deps.pendingRepo.upsert({
    userId: params.userId,
    status: "processing",
    metadata: { organizationActions: params.organizationActions },
  });

  // 3. Owner actions を atomic に実行
  const owned = await deps.orgRepo.findOwnedByUserId(params.userId);
  const transferNotices: Array<{
    orgName: string;
    targetUserId: string;
  }> = [];
  for (const action of params.organizationActions) {
    const stillOwned = owned.find(
      (o) => o.organizationId === action.organizationId,
    );
    if (!stillOwned) continue;
    if (action.action === "transfer") {
      await deps.orgRepo.swapOwnership({
        organizationId: action.organizationId,
        fromUserId: params.userId,
        toUserId: action.transferToUserId,
      });
      transferNotices.push({
        orgName: stillOwned.organizationName,
        targetUserId: action.transferToUserId,
      });
    } else if (action.action === "delete-org") {
      await deps.orgRepo.deleteSoloOrganization({
        organizationId: action.organizationId,
        userId: params.userId,
      });
    }
  }

  // 3a. 不変条件 assertion: もう自分が owner の org は無いこと
  const remainingOwned = await deps.orgRepo.findOwnedByUserId(params.userId);
  if (remainingOwned.length > 0) {
    const names = remainingOwned.map((o) => o.organizationName).join(", ");
    await deps.pendingRepo.setStatus(
      params.userId,
      "failed",
      `Owner-count assertion failed: ${names}`,
    );
    throw new Error(
      `Internal: user ${params.userId} still owns organization(s): ${names}`,
    );
  }

  // 4. session 全削除（即ログアウト）。user 行 DELETE の cascade でも消えるが、
  //    確実に即時無効化するため明示削除する。
  await deps.sessionRepo.deleteAllByUserId(params.userId);

  // 5. 譲渡通知メール送信（best-effort、失敗しても削除フローは継続）
  const previousOwner = userRow;
  for (const notice of transferNotices) {
    try {
      const recipient = await deps.userRepo.findById(notice.targetUserId);
      if (!recipient || !previousOwner) continue;
      await deps.sendOwnershipTransferNotice({
        to: recipient.email,
        recipientName: recipient.name,
        organizationName: notice.orgName,
        previousOwnerName: previousOwner.name,
      });
    } catch (err) {
      console.warn("[delete-account] transfer notice email failed:", err);
    }
  }

  // 6. email 宛 pending 招待を削除（cascade されない）してから user 行 DELETE。
  //    user DELETE の cascade で session / account / member / invitation(inviter) /
  //    account_deletion_pending / account_deletion_reauth_pending が連動削除される。
  if (userRow?.email) {
    await deps.purgeRepo.deletePendingInvitationsByEmail(userRow.email);
  }
  await deps.purgeRepo.deleteUserCascade(params.userId);

  return { userId: params.userId };
}

/**
 * password 経路のアカウント削除サービス (credential を持つユーザー向け)。
 *
 * password を検証してから executeAccountDeletion に委譲する薄いラッパー。
 * OAuth 専用ユーザー (password 無し) は別経路 (initiate-reauth + confirm-reauth) を使う。
 */
export function createDeleteAccountService(deps: Deps) {
  return {
    async execute(params: {
      userId: string;
      password: string;
      organizationActions: OrganizationAction[];
    }): Promise<{ userId: string }> {
      // 1. password 検証 (本経路の本人性検証)
      const hash = await deps.userRepo.findPasswordHash(params.userId);
      if (!hash) {
        // OAuth 専用ユーザーが誤って本経路を叩いた場合に備える。client は
        // listAccounts で事前判別する想定だが、サーバも防御層として弾く。
        throw new ValidationError("Password authentication required");
      }
      const ok = await deps.verifyPassword({
        hash,
        password: params.password,
      });
      if (!ok) {
        throw new UnauthorizedError("Invalid password");
      }

      // 2. 共通の削除実行へ
      return executeAccountDeletion(deps, {
        userId: params.userId,
        organizationActions: params.organizationActions,
      });
    },
  };
}
