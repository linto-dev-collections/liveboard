import type { Metadata } from "next";
import Link from "next/link";
import { LiveboardIcon } from "@/app/_features/site-chrome";

// 認証導線 (sign-in / sign-up / forgot-password / reset-password / check-email /
// verify-email / account-not-linked) は SERP に露出する必要がないため一律 noindex。
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * 認証フロー共通レイアウト。
 *
 * 認証画面はフィッシング懸念のあるサインアップを含むため、
 * 必ずブランドロゴをヘッダに表示し、信頼感とランディングへの導線を残す。
 * 子コンポーネントは中央寄せの max-w-md Card 構造を前提とする
 * (sign-in / sign-up / forgot-password / reset-password / check-email /
 *  verify-email / account-not-linked で揃える)。
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center px-6 py-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 font-semibold text-foreground text-sm leading-none transition-colors hover:text-foreground/80"
        >
          <LiveboardIcon className="size-6" />
          liveboard
        </Link>
      </header>
      <div className="flex flex-1 items-center justify-center p-4">
        {children}
      </div>
    </div>
  );
}
