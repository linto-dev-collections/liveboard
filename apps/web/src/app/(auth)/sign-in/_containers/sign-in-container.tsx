import { SignInForm } from "../_features/sign-in-form";

/**
 * sign-in ページ用 Server Container。
 *
 * CLAUDE.md §2: page → container → view の 3 層を厳格に守るため、
 * Suspense の内側に container を挟む形に統一する。SignInForm 自体は
 * "use client" の form エントリで、ここではブラウザ側 fetch を行わないため
 * 構造上は passthrough だが、新規 fetch が必要になったときに自然に
 * 追加できる差し込みポイントとなる。
 */
export function SignInContainer() {
  return <SignInForm />;
}
