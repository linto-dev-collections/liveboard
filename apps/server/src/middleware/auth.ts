import { auth } from "@liveboard/auth";
import { createMiddleware } from "hono/factory";
import { AccountDeletionPendingError } from "../domain/errors/account-deletion.error";
import { createAccountDeletionPendingRepository } from "../infrastructure/repositories/account-deletion-pending.repository";
import type { AppEnv } from "../types";

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("user", session.user);
  c.set("session", session.session);

  // アカウント削除フローが confirm 済 (status='processing'/'failed') のユーザーは即座に 410 で拒否。
  // 'pending'（メール未確認中）のユーザーは UI 利用継続を許可（再考の余地）。
  const pendingRepo = createAccountDeletionPendingRepository(c.env.DB);
  const pending = await pendingRepo.findByUserId(session.user.id);
  if (
    pending &&
    (pending.status === "processing" || pending.status === "failed")
  ) {
    throw new AccountDeletionPendingError();
  }

  await next();
});

/**
 * リクエストヘッダーからセッション情報を取得するヘルパー。
 * 認証必須でないエンドポイント（公開共有アクセス）で使用する。
 * セッションがない場合は null を返す（エラーをスローしない）。
 *
 * dep-cruiser: middleware/ は @liveboard/auth の使用が許可されている。
 * share-access.route.ts はこの関数を import することで
 * @liveboard/auth を直接 import せずにセッション情報を取得できる。
 */
export async function getSessionFromRequest(
  headers: Headers,
): Promise<{ userId: string } | null> {
  const session = await auth.api.getSession({ headers });
  if (!session?.user) {
    return null;
  }
  return { userId: session.user.id };
}
