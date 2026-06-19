"use client";

import { buttonVariants } from "@liveboard/ui/components/ui/button";
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="fixed top-4 z-40 flex w-full justify-center px-4 md:top-6">
      <nav
        aria-label="グローバルナビゲーション"
        className="flex w-full max-w-3xl items-center justify-between gap-3 rounded-full border border-border/40 bg-background/60 px-4 py-2 shadow-[0_8px_30px_-12px_rgb(0_0_0/0.12)] ring-1 ring-white/40 backdrop-blur-xl transition-all hover:bg-background/80 md:px-5 md:py-2.5 dark:ring-white/5"
      >
        <Link
          href="/"
          className="flex min-w-28 items-center gap-2 font-semibold text-foreground text-sm md:text-base"
        >
          <LiveboardIcon className="size-6" />
          liveboard
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/sign-in"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            ログイン
          </Link>
          <Link
            href="/sign-up"
            className={buttonVariants({ size: "sm", className: "min-w-24" })}
          >
            無料で始める
          </Link>
        </div>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-border/40 border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-6 py-12 md:flex-row md:justify-between">
        <div className="flex items-center gap-2 font-medium text-foreground text-sm">
          <LiveboardIcon className="size-5" />
          liveboard
        </div>

        <p className="text-muted-foreground text-xs">
          © {new Date().getFullYear()} liveboard.
        </p>
      </div>
    </footer>
  );
}

// app/icon.svg と同一ソース。favicon と同期させたい場合は両方を更新する。
export function LiveboardIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 800 800"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M476.8 144C539.525 144 570.889 144 594.847 156.207C615.921 166.945 633.055 184.079 643.793 205.153C656 229.111 656 260.475 656 323.2V476.8C656 539.525 656 570.889 643.793 594.847C633.055 615.921 615.921 633.055 594.847 643.793C570.889 656 539.525 656 476.8 656H323.2C260.475 656 229.111 656 205.153 643.793C184.079 633.055 166.945 615.921 156.207 594.847C144 570.889 144 539.525 144 476.8V323.2C144 260.475 144 229.111 156.207 205.153C166.945 184.079 184.079 166.945 205.153 156.207C229.111 144 260.475 144 323.2 144H476.8ZM316.8 240C289.917 240 276.476 240 266.208 245.231C257.176 249.833 249.833 257.176 245.231 266.208C240 276.476 240 289.917 240 316.8V483.2C240 510.083 240 523.524 245.231 533.792C249.833 542.824 257.176 550.167 266.208 554.769C276.476 560 289.917 560 316.8 560H483.2C510.083 560 523.524 560 533.792 554.769C542.824 550.167 550.167 542.824 554.769 533.792C560 523.524 560 510.083 560 483.2V316.8C560 289.917 560 276.476 554.769 266.208C550.167 257.176 542.824 249.833 533.792 245.231C523.524 240 510.083 240 483.2 240H316.8Z"
        fill="#DF6035"
      />
    </svg>
  );
}
