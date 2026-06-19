import { auth } from "@liveboard/auth";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

export const requirePermission = (resource: string, action: string) => {
  return createMiddleware<AppEnv>(async (c, next) => {
    const session = c.get("session");
    const activeOrganizationId = session.activeOrganizationId;
    if (!activeOrganizationId) {
      return c.json({ error: "No active organization" }, 400);
    }

    const result = await auth.api.hasPermission({
      headers: c.req.raw.headers,
      body: { permissions: { [resource]: [action] } },
    });
    if (!result?.success) {
      return c.json({ error: "Forbidden" }, 403);
    }

    c.set("activeOrganizationId", activeOrganizationId);
    await next();
  });
};
