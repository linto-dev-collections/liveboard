/**
 * Google ブランドガイドライン準拠の "Google G" ロゴ。
 *
 * - https://developers.google.com/identity/branding-guidelines
 *   "Regardless of the text, you can't change the size or color of the Google 'G' logo.
 *    It must be the standard color version and appear on a white background."
 * - 色 (#4285F4 / #34A853 / #FBBC05 / #EA4335) と path は **改変しない**。
 * - サイズ変更だけ許可。className 経由で `size-*` を渡して調整する。
 *
 * 配置 (Phase 4 で昇格):
 *   `(auth)` Route Group の sign-in/sign-up と、`dashboard/(protected)` Route Group の
 *   settings/account 画面の両方から参照されるため、Route Group をまたいで再利用される
 *   共通 UI として `src/components/` に置く。CLAUDE.md §1.3 の
 *   「アプリ全体で使う UI」に該当。
 *
 * Server Component として描画される。`"use client"` は付けない。
 */
export function GoogleLogo({
  className,
  title = "Google",
}: {
  className?: string;
  /** スクリーンリーダー向けの説明。装飾用途のときは省略しても OK (button 側の aria-label 優先)。 */
  title?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <clipPath id="google-logo-g">
        <path d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z" />
      </clipPath>
      <g clipPath="url(#google-logo-g)">
        <path fill="#FBBC05" d="M0 37V11l17 13z" />
        <path fill="#EA4335" d="M0 11l17 13 7-6.1L48 14V0H0z" />
        <path fill="#34A853" d="M0 37l30-23 7.9 1L48 0v48H0z" />
        <path fill="#4285F4" d="M48 48L17 24l-4-3 35-10z" />
      </g>
    </svg>
  );
}
