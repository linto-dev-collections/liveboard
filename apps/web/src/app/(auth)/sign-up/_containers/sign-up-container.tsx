import { SignUpForm } from "../_features/sign-up-form";

/**
 * sign-up ページ用 Server Container。
 * CLAUDE.md §2: page → container → view の 3 層を厳格に守るため
 * Suspense の内側に container を挟む形に統一する。
 */
export function SignUpContainer() {
  return <SignUpForm />;
}
