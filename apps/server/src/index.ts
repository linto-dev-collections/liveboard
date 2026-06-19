import app from "./app";
import type { AppEnv } from "./types";

export default {
  async fetch(
    request: Request,
    env: AppEnv["Bindings"],
    ctx: ExecutionContext,
  ): Promise<Response> {
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<AppEnv["Bindings"]>;

export type { AppType } from "./app";
