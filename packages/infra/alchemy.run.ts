import { spawnSync } from "node:child_process";
import alchemy from "alchemy";

// alchemy dev は内部で next dev / workerd など複数の子プロセスを spawn する。
// alchemy / node --watch 内部の cleanup は末端の workerd まで到達しないことがあり、
// SIGINT (Ctrl+C) / SIGTERM / uncaughtException いずれでも親が exit する前に
// 子孫を BFS で列挙して kill しないと workerd が PPID=1 で孤児化する。
// 孤児が累積すると file watcher 枠 (kqueue / FSEvents) を圧迫し、
// 次回 `pnpm dev` 起動時の Watchpack で連鎖的に EMFILE を再発する。
function killDescendants(): Set<number> {
  const queue: number[] = [process.pid];
  const seen = new Set<number>();
  while (queue.length > 0) {
    const pid = queue.shift()!;
    if (seen.has(pid)) continue;
    seen.add(pid);
    const result = spawnSync("pgrep", ["-P", String(pid)], { encoding: "utf8" });
    const stdout = result.stdout?.trim();
    if (!stdout) continue;
    for (const line of stdout.split("\n")) {
      const child = Number(line);
      if (Number.isFinite(child) && child > 0) queue.push(child);
    }
  }
  seen.delete(process.pid);
  for (const pid of seen) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
  return seen;
}

// 子孫 kill → 1s 猶予 → SIGKILL フォールバック → exit。
// unref() しないことで猶予中も active handle として残し、SIGKILL と exit 到達を担保する。
function cleanupAndExit(exitCode: number): void {
  process.exitCode = exitCode;
  const descendants = killDescendants();
  if (descendants.size === 0) {
    process.exit(exitCode);
    return;
  }
  setTimeout(() => {
    for (const pid of descendants) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    }
    process.exit(exitCode);
  }, 1000);
}

// ローカル開発時のみ: Miniflare プロキシでクライアント切断時に発生する AbortError の
// unhandled エラーによるクラッシュを防止し、かつ Ctrl+C 等での通常停止でも子孫まで確実に kill する。
// deploy/CI では Node 既定の挙動 (exit code 1 + stack trace) を尊重するため dev 限定にゲートする。
if (!process.env.ALCHEMY_DEPLOY) {
  // 128 + signal number (SIGINT=2 → 130, SIGTERM=15 → 143) は POSIX 慣習。
  process.on("SIGINT", () => cleanupAndExit(130));
  process.on("SIGTERM", () => cleanupAndExit(143));
  process.on("uncaughtException", (err) => {
    if (err instanceof DOMException && err.name === "AbortError") return;
    console.error("Uncaught exception:", err);
    cleanupAndExit(1);
  });
}

import { D1Database, Nextjs, Worker } from "alchemy/cloudflare";
import { CloudflareStateStore } from "alchemy/state";
import { config } from "dotenv";

// ローカル開発時のみ .env.local を読み込む。
// 全ての環境変数はルートの .env.local に一元管理。
// CI/CD (ALCHEMY_DEPLOY=1) では GitHub Actions の env から供給される。
if (!process.env.ALCHEMY_DEPLOY) {
  config({ path: "../../.env.local" });
}

const stage = process.env.ALCHEMY_STAGE ?? "dev";

// 本番（stage=prod）のみワーカー名を固定し、workers.dev の URL を短く整える
// （既定の `liveboard-web-prod` / `liveboard-server-prod` → `liveboard` / `liveboard-api`）。
// ローカル開発や他ステージでは name を渡さず、Alchemy 既定の
// `<app>-<resource>-<stage>` 命名（例 `liveboard-web-dev`）のままにして
// ローカルの D1/DO state やステージ分離を壊さない。
const isProd = stage === "prod";
const webName = isProd ? { name: "liveboard" } : {};
const serverName = isProd ? { name: "liveboard-api" } : {};

const app = await alchemy("liveboard", {
  stage,
  password: process.env.ALCHEMY_PASSWORD,
  // deploy/CI ではリモート state、dev ではローカルファイルシステム state
  ...(process.env.ALCHEMY_DEPLOY
    ? {
        stateStore: (scope) =>
          new CloudflareStateStore(scope, {
            scriptName: "liveboard-alchemy-state",
            forceUpdate: true,
          }),
      }
    : {}),
});

const db = await D1Database("database", {
  migrationsDir: "../../packages/db/src/migrations",
});

export const web = await Nextjs("web", {
  ...webName,
  cwd: "../../apps/web",
  // Next.js 16.2+ の `app/opengraph-image.tsx` を OpenNext で bundle すると、
  // @vercel/og の `Geist-Regular.ttf.bin` を `await import(...)` する形に compile される。
  // alchemy 0.91.2 の WorkerBundle は esbuild 標準 loader だけでは `.bin` を扱えず
  // "No loader is configured for .bin files" で失敗するため、binary loader を明示する。
  bundle: {
    minify: true,
    loader: {
      ".bin": "binary",
    },
  },
  bindings: {
    NEXT_PUBLIC_SERVER_URL: alchemy.env.NEXT_PUBLIC_SERVER_URL!,
    NEXT_PUBLIC_APP_URL: alchemy.env.NEXT_PUBLIC_APP_URL!,
    DB: db,
    CORS_ORIGIN: alchemy.env.CORS_ORIGIN!,
    BETTER_AUTH_SECRET: alchemy.secret.env.BETTER_AUTH_SECRET!,
    BETTER_AUTH_URL: alchemy.env.BETTER_AUTH_URL!,
    COOKIE_DOMAIN: alchemy.env.COOKIE_DOMAIN!,
  },
  dev: {
    command: "pnpm next dev --port 3001",
    domain: "localhost:3001",
  },
});

export const server = await Worker("server", {
  ...serverName,
  cwd: "../../apps/server",
  entrypoint: "src/index.ts",
  compatibility: "node",
  bindings: {
    DB: db,
    CORS_ORIGIN: alchemy.env.CORS_ORIGIN!,
    BETTER_AUTH_SECRET: alchemy.secret.env.BETTER_AUTH_SECRET!,
    BETTER_AUTH_URL: alchemy.env.BETTER_AUTH_URL!,
    RESEND_API_KEY: alchemy.secret.env.RESEND_API_KEY!,
    FROM_EMAIL: alchemy.env.FROM_EMAIL!,
    COOKIE_DOMAIN: alchemy.env.COOKIE_DOMAIN!,
    // Better Auth Google Sign-in (scope: openid email profile)
    // redirect URI は Better Auth 既定の `${BETTER_AUTH_URL}/api/auth/callback/google`。
    GOOGLE_SIGNIN_CLIENT_ID: alchemy.env.GOOGLE_SIGNIN_CLIENT_ID!,
    GOOGLE_SIGNIN_CLIENT_SECRET: alchemy.secret.env.GOOGLE_SIGNIN_CLIENT_SECRET!,
  },
  dev: {
    port: 3000,
  },
});

console.log(`Web    -> ${web.url}`);
console.log(`Server -> ${server.url}`);

await app.finalize();
