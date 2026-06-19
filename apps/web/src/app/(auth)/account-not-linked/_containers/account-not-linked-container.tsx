import { AccountNotLinkedView } from "../_features/account-not-linked-view";

/**
 * account-not-linked ページ用 Server Container。
 * CLAUDE.md §2: page → container → view の 3 層を厳格に守るため
 * passthrough container を挟む。
 */
export function AccountNotLinkedContainer() {
  return <AccountNotLinkedView />;
}
