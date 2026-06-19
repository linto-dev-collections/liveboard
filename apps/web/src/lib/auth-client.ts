import { ac, admin, member, owner } from "@liveboard/auth/permissions";
import { env } from "@liveboard/env/web";
import {
  lastLoginMethodClient,
  organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_SERVER_URL,
  fetchOptions: {
    credentials: "include",
  },
  plugins: [
    organizationClient({
      ac,
      roles: { owner, admin, member },
    }),
    // 前回ログイン方法 (email / google) を読み取り、sign-in ページで
    // 「前回利用」バッジを出すために使う。サーバ側 lastLoginMethod() と対。
    // 提供 API: getLastUsedLoginMethod() / isLastUsedLoginMethod() / clearLastUsedLoginMethod()
    // cookieName はサーバ側 lastLoginMethod({ cookieName }) と一致させる
    // （advanced.cookiePrefix には追従しないため明示）。
    lastLoginMethodClient({ cookieName: "liveboard.last_used_login_method" }),
  ],
});
