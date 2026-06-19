"use client";

import { buttonVariants } from "@liveboard/ui/components/ui/button";
import Link from "next/link";
import { LiveboardIcon, SiteFooter, SiteHeader } from "../site-chrome";

export function LandingView() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-32 text-center">
        <LiveboardIcon className="size-16 md:size-20" />
        <h1 className="max-w-2xl font-bold text-4xl tracking-tight md:text-5xl">
          liveboard
        </h1>
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/sign-up"
            className={buttonVariants({ size: "lg", className: "min-w-44" })}
          >
            無料で始める
          </Link>
          <Link
            href="/sign-in"
            className={buttonVariants({
              variant: "outline",
              size: "lg",
              className: "min-w-44",
            })}
          >
            ログイン
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
