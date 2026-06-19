import { env } from "@liveboard/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { DomainError } from "./domain/errors/domain.error";
import { routes } from "./routes";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>()
  .use(logger())
  .use(
    "/*",
    cors({
      origin: (origin) => {
        const allowed = env.CORS_ORIGIN.split(",").map((o) => o.trim());
        return allowed.includes(origin) ? origin : allowed[0];
      },
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      maxAge: 3600,
      credentials: true,
    }),
  )
  .get("/health", (c) => c.json({ status: "ok" }))
  .route("/", routes)
  .onError((err, c) => {
    if (err instanceof DomainError) {
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        PERMISSION_DENIED: 403,
        UNAUTHORIZED: 401,
        ALREADY_EXISTS: 409,
        VALIDATION_ERROR: 400,
        // 409 Conflict: 削除中ボードへのアップロード等、現状との競合（H6 のレース窓）
        CONFLICT: 409,
        // 413 Payload Too Large: アセットのサイズ上限超過（M9）
        PAYLOAD_TOO_LARGE: 413,
        // 415 Unsupported Media Type: 許可外 MIME / マジックバイト不一致 / SVG 無効（M9）
        UNSUPPORTED_MEDIA_TYPE: 415,
        // 410 Gone: アカウント削除フローが進行中（middleware が user の状態を参照）
        ACCOUNT_DELETION_PENDING: 410,
        // 409 Conflict: 削除 confirm 時点で snapshot と現状が乖離（race ガード）
        OWNERSHIP_CONFLICT: 409,
        // 410 Gone: OAuth 削除フローの再認証 nonce が TTL 切れ
        REAUTH_EXPIRED: 410,
      };
      const status = statusMap[err.code] ?? 400;
      return c.json(
        {
          error: err.message,
          code: err.code,
        },
        status as 400 | 401 | 403 | 404 | 409 | 410 | 413 | 415,
      );
    }
    console.error("Unhandled error:", err);
    return c.json({ error: "Internal Server Error" }, 500);
  });

export default app;
export type AppType = typeof app;
