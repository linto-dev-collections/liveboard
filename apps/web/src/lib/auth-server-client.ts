import { ac, admin, member, owner } from "@liveboard/auth/permissions";
import { env } from "@liveboard/env/web";
import { createAuthClient } from "better-auth/client";
import { organizationClient } from "better-auth/client/plugins";
import { headers } from "next/headers";

/**
 * Server-side Better Auth client for use in Server Actions and Server Components.
 *
 * Unlike the React client (`auth-client.ts`), this uses `better-auth/client`
 * (no React hooks) and is safe to use in server-side code.
 * It communicates with the auth server via HTTP, avoiding direct import of
 * `@liveboard/auth` which depends on `cloudflare:workers`.
 */
export const serverAuthClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_SERVER_URL,
  plugins: [
    organizationClient({
      ac,
      roles: { owner, admin, member },
    }),
  ],
});

/**
 * Returns fetchOptions that forward the current request's cookies
 * for authenticated server-side calls.
 */
export async function serverFetchOptions() {
  const headersList = await headers();
  const cookie = headersList.get("cookie") ?? "";
  const origin = headersList.get("origin") || env.NEXT_PUBLIC_SERVER_URL;
  return {
    headers: { cookie, origin },
  };
}
