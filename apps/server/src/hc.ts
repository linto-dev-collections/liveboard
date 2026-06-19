import { hc } from "hono/client";
import type { AppType } from "./app";

const client = hc<AppType>("");
export type Client = typeof client;

export const hcWithType = (...args: Parameters<typeof hc>): Client =>
  hc<AppType>(...args);

// hono/client の型ヘルパを再エクスポート (web 側に hono を直接依存させないため)
export type { InferRequestType, InferResponseType } from "hono/client";
