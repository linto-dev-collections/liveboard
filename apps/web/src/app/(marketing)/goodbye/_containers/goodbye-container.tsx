import { GoodbyeView } from "../_features/goodbye-view";

/**
 * 静的ページのため fetch は無いが、`CLAUDE.md` §2 の
 * 「page → container → view 3 層を例外なし」に従い空の container を置く。
 */
export function GoodbyeContainer() {
  return <GoodbyeView />;
}
