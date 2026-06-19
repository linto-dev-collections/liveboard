import { Hono } from "hono";
import type { AppEnv } from "../types";
import { accountRoute } from "./account.route";
import { assetRoute } from "./asset.route";
import { authRoute } from "./auth.route";
import { boardRoute } from "./board.route";
import { commentRoute } from "./comment.route";
import { notificationRoute } from "./notification.route";
import { organizationRoute } from "./organization.route";

export const routes = new Hono<AppEnv>()
  // Auth (BetterAuth handler + sign-up guard)
  .route("/api/auth", authRoute)
  // 現在の active organization の取得
  .route("/api/organizations", organizationRoute)
  // アカウント削除（退会）: prerequisites / delete / reauth
  .route("/api/account", accountRoute)
  // ボード管理（CRUD・一覧/検索・お気に入り・ACL）
  .route("/api/boards", boardRoute)
  // 画像アセット（R2 アップロード/取得・サムネ）。boardRoute と同じ prefix に追加マウント。
  .route("/api/boards", assetRoute)
  // コメント・メンション（スレッド/返信/解決・mentionable）。同 prefix に追加マウント。
  .route("/api/boards", commentRoute)
  // 通知センター（自分宛・org スコープ）
  .route("/api/notifications", notificationRoute);
