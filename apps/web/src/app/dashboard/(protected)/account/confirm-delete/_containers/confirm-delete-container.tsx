import { ConfirmDeletePageView } from "../_features/confirm-delete-page-view";

type Props = {
  nonce?: string;
};

/**
 * confirm-delete ページ用 Server Container。
 * page.tsx 側で URL から nonce を抽出して props で受け取る。
 *
 * nonce 自体は URL クエリで運ぶが、後続 Server Action 側で
 * `currentSessionId !== prev_session_id` と `currentSession.createdAt > row.createdAt`
 * を検証するため、URL に nonce が出ていても他人の nonce 流用は弾かれる。
 */
export function ConfirmDeleteContainer({ nonce }: Props) {
  return <ConfirmDeletePageView nonce={nonce ?? ""} />;
}
