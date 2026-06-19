import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { InvitationView } from "../_features/invitation-view";
import { getInvitationState } from "../_lib/queries";

type Props = {
  id: string;
};

/**
 * 招待受諾ページの Container。
 *
 * 認証/認可レイヤは Better Auth の `organization.acceptInvitation` が最終的に
 * 「invitation.email === session.user.email」「emailVerified === true」を強制するので
 * ここを通らずに横取りされる心配はない (ref: better-auth/dist/plugins/organization/routes/crud-invites.mjs)。
 * ただし「ボタンを押して英語の 403 メッセージが出てから初めて気付く」という UX を避けるため、
 * サーバ側で `getInvitationState` を pre-fetch して、状態別に View に振り分ける:
 *   - 未ログイン: /sign-in へリダイレクト (callbackURL で復帰)
 *   - 401:       同上 (cookie はあるが session 失効)
 *   - 成功:      AcceptInvitation (誰がどの組織に招待しているか表示)
 *   - 不一致:    InvitationMismatch (別アカウントでログインし直す導線)
 *   - 未検証:    InvitationEmailUnverified (メール確認導線)
 *   - その他:    InvitationNotFound (期限切れ / 取消 / 組織消滅 等を一括)
 */
export async function InvitationContainer({ id }: Props) {
  const cookieStore = await cookies();
  const session = cookieStore.get("__Secure-better-auth.session_token");

  if (!session) {
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(`/invitation/${id}`)}`);
  }

  const result = await getInvitationState(id);
  if (result.kind === "redirect-to-sign-in") {
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(`/invitation/${id}`)}`);
  }

  return <InvitationView state={result.state} />;
}
