import type { NextMiddleware } from "next/server";
import { NextResponse } from "next/server";

// Next.js 16 で `middleware.ts` は `proxy.ts` (Node.js runtime) に renaming
// されたが、@opennextjs/cloudflare は現時点で Node.js middleware を未サポート
// (https://github.com/opennextjs/opennextjs-cloudflare/issues/1213)。
// Adapters API 対応までは Edge middleware = 旧 `middleware.ts` 形式で維持する。
// Next.js 17 で middleware 削除予定なので、その前に再リネーム要。
export const middleware: NextMiddleware = (request) => {
  // BETTER_AUTH_URL が常に https のため、better-auth は cookie に必ず
  // __Secure- prefix を付ける (better-auth/dist/cookies/index.mjs の prefix 判定)。
  const sessionCookie = request.cookies.get(
    "__Secure-better-auth.session_token",
  );
  const { pathname } = request.nextUrl;
  const isAuthPage =
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/verify-email") ||
    pathname.startsWith("/check-email");

  // Redirect authenticated users away from auth pages.
  // callbackUrl が指定されていればそちらへ転送する。open redirect を避けるため、
  // 内部パス (`/`) かつ protocol-relative (`//`) でないものに制限する。
  if (sessionCookie && isAuthPage) {
    const cb = request.nextUrl.searchParams.get("callbackUrl");
    const isInternal = !!cb && cb.startsWith("/") && !cb.startsWith("//");
    return NextResponse.redirect(
      new URL(isInternal ? cb : "/dashboard", request.url),
    );
  }

  // Redirect old /login to new sign-in path
  if (pathname === "/login") {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const response = NextResponse.next();

  // Prevent browser disk cache for dashboard pages.
  // Without this, browser back serves stale HTML from disk cache,
  // causing React hydration to fail silently.
  if (pathname.startsWith("/dashboard")) {
    response.headers.set("Cache-Control", "no-store, must-revalidate");
  }

  return response;
};

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
