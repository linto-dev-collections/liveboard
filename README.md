# liveboard

BetterAuth による認証・組織・招待・退会機能を備えた最小プラットフォーム。

- **server** (`apps/server`): Hono on Cloudflare Workers。BetterAuth ハンドラ + 組織 / 退会 API。
- **web** (`apps/web`): Next.js (OpenNext on Cloudflare Workers)。認証画面・ダッシュボード・組織/メンバー設定・退会フロー。
- インフラは alchemy (IaC) + D1 (SQLite)。`pnpm dev` で web/server をローカル起動する。

## セットアップ

```bash
cp .env.example .env.local   # 値を設定（BETTER_AUTH_SECRET / RESEND_API_KEY / GOOGLE_SIGNIN_* など）
pnpm install
pnpm db:generate             # スキーマからマイグレーション生成（初回）
pnpm dev
```

> Better Auth の cookie は `secure` + `SameSite=none` で発行されるため、
> ブラウザに保存させるには HTTPS origin（トンネル等）が必要です。
