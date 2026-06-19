import { Hono } from "hono";
import type { AppEnv } from "../types";
import { accountRoute } from "./account.route";
import { authRoute } from "./auth.route";
import { organizationRoute } from "./organization.route";

export const routes = new Hono<AppEnv>()
  // Auth (BetterAuth handler + sign-up guard)
  .route("/api/auth", authRoute)
  // 現在の active organization の取得
  .route("/api/organizations", organizationRoute)
  // アカウント削除（退会）: prerequisites / delete / reauth
  .route("/api/account", accountRoute);
