import "@liveboard/env/web";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

// pnpm monorepo の root を Turbopack に明示する。未設定だと
// pnpm-lock.yaml の探索結果次第で誤った workspace を root に
// 認識する既知の挙動 (vercel/next.js#92540) を避ける。
const monorepoRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  serverExternalPackages: ["@liveboard/server"],
  allowedDevOrigins: ["3001.mydevbox.pp.ua"],
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;

initOpenNextCloudflareForDev();
