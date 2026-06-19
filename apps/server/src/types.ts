import type { auth } from "@liveboard/auth";

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
  };
  Variables: {
    user: typeof auth.$Infer.Session.user;
    session: typeof auth.$Infer.Session.session;
    activeOrganizationId: string;
  };
};
