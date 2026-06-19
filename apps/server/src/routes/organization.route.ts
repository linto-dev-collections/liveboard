import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import type { AppEnv } from "../types";

export const organizationRoute = new Hono<AppEnv>()
  .use("/*", authMiddleware)
  .get("/", async (c) => {
    const session = c.get("session");
    return c.json({
      activeOrganizationId: session.activeOrganizationId,
    });
  });
