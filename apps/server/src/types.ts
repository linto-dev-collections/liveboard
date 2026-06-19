import type { auth } from "@liveboard/auth";
import type { Board } from "./realtime/board-server";

export type AppEnv = {
  Bindings: {
    DB: D1Database;
    CORS_ORIGIN: string;
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL: string;
    RESEND_API_KEY: string;
    FROM_EMAIL: string;
    COOKIE_DOMAIN: string;
    GOOGLE_SIGNIN_CLIENT_ID: string;
    GOOGLE_SIGNIN_CLIENT_SECRET: string;
    // Board Durable Object（1 ボード = 1 DO）。実体は Phase 2 で拡張。
    Board: DurableObjectNamespace<Board>;
    // 画像・サムネ・バックアップ用 R2 バケット（資産アクセスは server に集約）。
    R2_ASSETS: R2Bucket;
  };
  Variables: {
    user: typeof auth.$Infer.Session.user;
    session: typeof auth.$Infer.Session.session;
    activeOrganizationId: string;
  };
};
