import { env } from "@liveboard/env/web";
import { hcWithType } from "@liveboard/server/hc";

export const api = hcWithType(env.NEXT_PUBLIC_SERVER_URL, {
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    return fetch(input, {
      credentials: "include",
      cache: "no-store",
      ...init,
    });
  },
});
