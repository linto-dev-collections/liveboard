import { Suspense } from "react";
import { ConfirmDeleteContainer } from "./_containers/confirm-delete-container";

/**
 * Google 再認証完了後の最終確認ページ。
 *
 * Flow:
 *   /dashboard/account の削除ダイアログから initiate-reauth →
 *   authClient.signIn.social({ prompt:"login", callbackURL: 当ページ?nonce=... }) →
 *   Better Auth callback handler が新 session を発行して当ページに redirect →
 *   ユーザーが「アカウントを削除する」をクリック →
 *   confirm-reauth が session 新規性 + nonce を検証して削除実行
 *
 * nonce 自体は URL クエリで運ぶが、攻撃者が他人の nonce を URL に貼っても
 * `currentSessionId !== prev_session_id` および `currentSession.createdAt > row.createdAt`
 * の検証で確実に弾かれる (server 側で防御される)。
 */
export default async function ConfirmDeletePage({
  searchParams,
}: PageProps<"/dashboard/account/confirm-delete">) {
  const sp = await searchParams;
  const nonce = typeof sp.nonce === "string" ? sp.nonce : undefined;
  return (
    <Suspense>
      <ConfirmDeleteContainer nonce={nonce} />
    </Suspense>
  );
}
