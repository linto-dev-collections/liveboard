import { GoodbyeContainer } from "./_containers/goodbye-container";

/**
 * アカウント削除完了画面（marketing route group, 認証不要）。
 * 削除受付後の自動遷移先。session は既に削除済みなので未ログイン状態でアクセスされる。
 * バックグラウンドで Cloudflare Workflow が chunked delete を進行中。
 */
export default function GoodbyePage() {
  return <GoodbyeContainer />;
}
