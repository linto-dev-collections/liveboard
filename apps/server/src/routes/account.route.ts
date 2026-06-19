import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  buildAccountDeletionExpireCookies,
  buildSendOwnershipTransferNoticeEmail,
  verifyPassword,
} from "../account-deletion-deps";
import { createAccountDeletionPendingRepository } from "../infrastructure/repositories/account-deletion-pending.repository";
import { createAccountDeletionReauthPendingRepository } from "../infrastructure/repositories/account-deletion-reauth-pending.repository";
import { createAccountPurgeRepository } from "../infrastructure/repositories/account-purge.repository";
import { createOrganizationRepository } from "../infrastructure/repositories/organization.repository";
import { createSessionRepository } from "../infrastructure/repositories/session.repository";
import { createUserRepository } from "../infrastructure/repositories/user.repository";
import { authMiddleware } from "../middleware/auth";
import type { AppEnv } from "../types";
import { createConfirmReauthService } from "../use-cases/account-deletion/confirm-reauth.service";
import { createDeleteAccountService } from "../use-cases/account-deletion/delete-account.service";
import { createGetDeletionPrerequisitesService } from "../use-cases/account-deletion/get-deletion-prerequisites.service";
import { createInitiateReauthService } from "../use-cases/account-deletion/initiate-reauth.service";
import {
  confirmReauthSchema,
  deleteAccountSchema,
  initiateReauthSchema,
} from "./account.schemas";

/**
 * アカウント削除（退会）フロー: 4 エンドポイント。
 *
 * 共通:
 *   - GET  /api/account/deletion-prerequisites — 削除前画面用の owner orgs + 候補メンバー
 *
 * password 経路 (credential を持つユーザー):
 *   - POST /api/account/delete — password + organizationActions を検証してその場で削除
 *
 * OAuth 専用ユーザー経路 (password 無し):
 *   - POST /api/account/delete-reauth/initiate  — organizationActions snapshot を保存
 *     して nonce を返す。client は Google で prompt=login の再認証を行う
 *   - POST /api/account/delete-reauth/confirm   — Google 再認証完了後、session 新規性を
 *     検証して削除を実行
 *
 * NOTE: `/delete` と `/delete/...` を Hono RPC で同居させると `hcWithType` が
 * `delete` を $post-only のリクエスト型に collapse してしまい sub-path が型から
 * 失われる。そのため reauth は別 prefix `/delete-reauth/` に分離している。
 *
 * 録画・課金・Webhook を持たないため、削除は同期的に完了する（Cloudflare Workflow 不要）。
 */
export const accountRoute = new Hono<AppEnv>()
  .use("/*", authMiddleware)
  .get("/deletion-prerequisites", async (c) => {
    const user = c.get("user");
    const service = createGetDeletionPrerequisitesService({
      orgRepo: createOrganizationRepository(c.env.DB),
    });
    const result = await service.execute(user.id);
    return c.json(result);
  })
  .post("/delete", zValidator("json", deleteAccountSchema), async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const service = createDeleteAccountService({
      verifyPassword,
      userRepo: createUserRepository(c.env.DB),
      orgRepo: createOrganizationRepository(c.env.DB),
      pendingRepo: createAccountDeletionPendingRepository(c.env.DB),
      sessionRepo: createSessionRepository(c.env.DB),
      purgeRepo: createAccountPurgeRepository(c.env.DB),
      sendOwnershipTransferNotice: buildSendOwnershipTransferNoticeEmail(c.env),
    });
    await service.execute({
      userId: user.id,
      password: body.password,
      organizationActions: body.organizationActions,
    });

    // 削除完了レスポンスに better-auth cookie の expire ヘッダを付与する。
    // 詳細は buildAccountDeletionExpireCookies の docstring 参照。
    const expireCookies = await buildAccountDeletionExpireCookies(
      c.req.raw.headers,
    );
    for (const setCookie of expireCookies) {
      c.header("Set-Cookie", setCookie, { append: true });
    }

    return c.json({ success: true });
  })
  .post(
    "/delete-reauth/initiate",
    zValidator("json", initiateReauthSchema),
    async (c) => {
      const user = c.get("user");
      const session = c.get("session");
      const body = c.req.valid("json");

      const service = createInitiateReauthService({
        userRepo: createUserRepository(c.env.DB),
        orgRepo: createOrganizationRepository(c.env.DB),
        reauthRepo: createAccountDeletionReauthPendingRepository(c.env.DB),
      });
      const result = await service.execute({
        userId: user.id,
        prevSessionId: session.id,
        organizationActions: body.organizationActions,
      });

      return c.json({
        nonce: result.nonce,
        expiresAt: result.expiresAt.toISOString(),
      });
    },
  )
  .post(
    "/delete-reauth/confirm",
    zValidator("json", confirmReauthSchema),
    async (c) => {
      const user = c.get("user");
      const session = c.get("session");
      const body = c.req.valid("json");

      const service = createConfirmReauthService({
        userRepo: createUserRepository(c.env.DB),
        orgRepo: createOrganizationRepository(c.env.DB),
        pendingRepo: createAccountDeletionPendingRepository(c.env.DB),
        reauthRepo: createAccountDeletionReauthPendingRepository(c.env.DB),
        sessionRepo: createSessionRepository(c.env.DB),
        purgeRepo: createAccountPurgeRepository(c.env.DB),
        sendOwnershipTransferNotice: buildSendOwnershipTransferNoticeEmail(
          c.env,
        ),
      });
      await service.execute({
        userId: user.id,
        currentSessionId: session.id,
        currentSessionCreatedAt: session.createdAt,
        nonce: body.nonce,
      });

      const expireCookies = await buildAccountDeletionExpireCookies(
        c.req.raw.headers,
      );
      for (const setCookie of expireCookies) {
        c.header("Set-Cookie", setCookie, { append: true });
      }

      return c.json({ success: true });
    },
  );
