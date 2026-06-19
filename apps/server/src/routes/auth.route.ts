import { auth } from "@liveboard/auth";
import { Hono } from "hono";
import { createAccountDeletionPendingRepository } from "../infrastructure/repositories/account-deletion-pending.repository";
import type { AppEnv } from "../types";

/**
 * sign-up エンドポイントの差し止め。
 *
 * Better Auth は requireEmailVerification + 既存 email の場合、enumeration 防止のため
 * 成功風レスポンスを返し、`onExistingUserSignUp` 経由で「既にアカウントがあります」
 * メールを送る挙動を持つ。削除フローが進行中（processing/failed）のユーザーに対して
 * この挙動が走ると、誤誘導メールが届きユーザーが困惑する。
 *
 * 削除中であることは伝えず、汎用エラーで弾く（enumeration リスクは小さい想定）。
 *
 * 二重防御メモ:
 *   `@liveboard/auth` の `databaseHooks.user.create.before` でも同等のガードを
 *   実装済み (Google 等の social provider 経路までカバーするため)。
 *   この Hono レベルガードは /sign-up/email 限定だが、handler に到達する前に
 *   400 を返してレスポンス body 文言を完全に制御するために維持している。
 *   両者が触る条件は同じなので動作は冪等。
 */
async function blockSignUpForDeletionInProgress(
  rawRequest: Request,
  env: AppEnv["Bindings"],
): Promise<Response | null> {
  let parsed: { email?: unknown };
  try {
    parsed = (await rawRequest.clone().json()) as { email?: unknown };
  } catch {
    return null;
  }
  if (typeof parsed.email !== "string") return null;
  const repo = createAccountDeletionPendingRepository(env.DB);
  const inProgress = await repo.findInProgressByEmail(
    parsed.email.toLowerCase(),
  );
  if (!inProgress) return null;
  return Response.json(
    {
      message:
        "アカウントの登録に失敗しました。時間を置いて再度お試しください。",
    },
    { status: 400 },
  );
}

export const authRoute = new Hono<AppEnv>()
  .post("/sign-up/email", async (c) => {
    const blocked = await blockSignUpForDeletionInProgress(c.req.raw, c.env);
    if (blocked) return blocked;
    return auth.handler(c.req.raw);
  })
  .on(["POST", "GET"], "/*", (c) => auth.handler(c.req.raw));
