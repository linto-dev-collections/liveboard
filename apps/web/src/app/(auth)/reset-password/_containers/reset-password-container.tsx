import { ResetPasswordForm } from "../_features/reset-password-form";

/**
 * reset-password ページ用 Server Container。
 * CLAUDE.md §2: page → container → view の 3 層を厳格に守るため
 * Suspense の内側に container を挟む形に統一する。
 */
export function ResetPasswordContainer() {
  return <ResetPasswordForm />;
}
