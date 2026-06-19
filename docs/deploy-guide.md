# liveboard 本番デプロイガイド

Cloudflare Workers + Alchemy（TypeScript IaC）で `*.workers.dev` 上に運用する手順。
`main` への push で GitHub Actions（`.github/workflows/ci.yml`）が CI → deploy を実行し、
Alchemy が D1 / Durable Object / Workers をまとめて作成・更新する。

以下の例では自分の workers.dev サブドメインを `linto-dev` と表記する。

---

## 全体像

```txt
             Browser (host & participants)
                           │  HTTPS / WebSocket
                           ▼
      ┌────────────────────────────────────────┐
      │ Web — Next.js / OpenNext               │
      │ liveboard.linto-dev.workers.dev        │
      │ Host dashboard + voting UI             │
      └────────────────────────────────────────┘
                           │  fetch / WS
                           ▼
      ┌────────────────────────────────────────┐
      │ Server — Hono                          │
      │ + Better Auth + PartyServer (Poll)     │
      │ liveboard-api.linto-dev.workers.dev    │
      └────────────────────────────────────────┘
                           │
                           ▼
      ┌────────────────────────────────────────┐
      │ D1 (SQLite)                            │
      │ Durable Object: Poll (real-time tally) │
      └────────────────────────────────────────┘

      (All workers run on Cloudflare, deployed by Alchemy)
```

- **Web**：ホストのダッシュボード（作成・公開・締切・結果共有）＋ 参加者の投票画面 `/p/[joinCode]`。
- **Server**：Better Auth（認証）＋ 投票 API ＋ リアルタイム投票の Durable Object `Poll`（WebSocket）。
- **D1**：投票・選択肢・得票・認証データの永続化。
- 参加者は**ログイン不要**（匿名 voterKey）。ホストのみログインが必要。
- Alchemy は内部用の state worker `liveboard-alchemy-state` も作成する（アクセス不要）。

---

## 前提条件

- `gh`（GitHub CLI）を `gh auth login` 済みで、対象リポジトリのディレクトリ内で実行する。
- Cloudflare アカウントを保有し、**workers.dev サブドメインが有効**であること（Step 0）。

---

## Step 0: workers.dev サブドメインと URL の確認

1. Cloudflare ダッシュボード → **Workers & Pages** → **Settings** の **Subdomain**（`xxxxx.workers.dev` の `xxxxx`）を確認。未登録なら任意名（例 `liveboard`）を登録。
2. 本番（`stage=prod`）はワーカー名を固定するため、URL は以下になる:

   | 役割 | Worker 名 | URL |
   | --- | --- | --- |
   | Web（Next.js） | `liveboard` | `https://liveboard.linto-dev.workers.dev` |
   | Server（Hono/API） | `liveboard-api` | `https://liveboard-api.linto-dev.workers.dev` |
   | Alchemy state | `liveboard-alchemy-state` | 内部利用（アクセス不要） |

3. **Cookie 共有（ホストログインに必須）**：web と server は親 `linto-dev.workers.dev` を共有する。`workers.dev` は Public Suffix List 登録済みのため、`COOKIE_DOMAIN=linto-dev.workers.dev` を指定する（Step 5）。**空だとホストログインの SSR が失敗**（参加者投票は影響なし）。

---

## Step 1: Cloudflare API Token / Account ID

1. ダッシュボード → **My Profile** → **API Tokens** → **Create Token** → **Custom token** で以下を付与:

   | リソース | 権限 |
   | --- | --- |
   | Account → Workers Scripts | Edit |
   | Account → D1 | Edit |
   | Account → Account Settings | Read |
   | User → User Details | Read |
   | User → Memberships | Read |

   作成後に表示される値をコピー（**再表示不可**）→ `CLOUDFLARE_API_TOKEN`。
2. ダッシュボード右サイドの **Account ID** をコピー → `CLOUDFLARE_ACCOUNT_ID`。

---

## Step 2: 本番用シークレットの生成

それぞれ別の値を生成する:

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET（認証セッション署名）
openssl rand -base64 32   # ALCHEMY_PASSWORD（state 暗号化）
openssl rand -base64 32   # ALCHEMY_STATE_TOKEN（state ストア認証）
```

> `ALCHEMY_PASSWORD` / `ALCHEMY_STATE_TOKEN` は**一度設定したら変更しない**（既存 state を復号・認証できなくなる）。

---

## Step 3: Google Sign-in（OAuth Client）

ホストのログインに Google を使う場合（scope: `openid email profile`）:

1. [Google Cloud Console](https://console.cloud.google.com/) で OAuth 同意画面を構成。
2. **認証情報** → **OAuth クライアント ID**（種類: ウェブアプリケーション）を作成。
3. **承認済みのリダイレクト URI** に以下を追加:

   ```txt
   https://liveboard-api.linto-dev.workers.dev/api/auth/callback/google
   ```

4. **Client ID** → `GOOGLE_SIGNIN_CLIENT_ID`、**Client Secret** → `GOOGLE_SIGNIN_CLIENT_SECRET`。

> 使わない場合も空文字を登録しておくとビルド時の env 検証で躓かない（メール/パスワード認証は動作する）。

---

## Step 4: Resend（メール送信）

1. [Resend](https://resend.com/) で API キーを発行 → `RESEND_API_KEY`。
2. 送信元ドメインを検証し、検証済みアドレスを `FROM_EMAIL` に使う（動作確認だけなら `onboarding@resend.dev` も可）。

---

## Step 5: GitHub に Secrets / Variables を登録

### 5-1. Secrets（7 件）

`gh secret set <NAME>` は対話入力（シェル履歴に残らない）:

```bash
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
gh secret set ALCHEMY_PASSWORD
gh secret set ALCHEMY_STATE_TOKEN
gh secret set BETTER_AUTH_SECRET
gh secret set RESEND_API_KEY
gh secret set GOOGLE_SIGNIN_CLIENT_SECRET
```

### 5-2. Variables（7 件）

`linto-dev` を自分のサブドメインに置換して実行:

```bash
gh variable set NEXT_PUBLIC_APP_URL     --body "https://liveboard.linto-dev.workers.dev"
gh variable set NEXT_PUBLIC_SERVER_URL  --body "https://liveboard-api.linto-dev.workers.dev"
gh variable set BETTER_AUTH_URL         --body "https://liveboard-api.linto-dev.workers.dev"
gh variable set CORS_ORIGIN             --body "https://liveboard.linto-dev.workers.dev"
gh variable set COOKIE_DOMAIN           --body "linto-dev.workers.dev"
gh variable set FROM_EMAIL              --body "noreply@mail.linto.dev"
gh variable set GOOGLE_SIGNIN_CLIENT_ID --body "641765280794-r91q82hvmddb85557i9t8ni880o7nlf8.apps.googleusercontent.com"
```

- `CORS_ORIGIN` には **Web の origin を必ず含める**（含めないと投票 WS が `1008 forbidden origin` で切断）。
- `COOKIE_DOMAIN` を**空にしない**（Step 0-3）。
- `NEXT_PUBLIC_*` は**ビルド時にバンドルへ埋め込まれる**ため、変更時は再 push（再ビルド）が必要。

### 5-3. 確認

```bash
gh secret list     # 7 件
gh variable list   # 7 件
```

---

## Step 6: デプロイ

`main` への push で CI（lint / 型 / build）→ deploy が走る。deploy では `alchemy deploy` が
D1 作成＋マイグレーション、server / web のビルド＆デプロイ、state worker 作成を一括実行する。

```bash
git push origin main
```

> コード変更が無い場合は GitHub の **Actions** タブから対象ワークフローを **Re-run** でも実行できる。

---

## Step 7: デプロイ後の確認

1. Actions → 最新実行 → **deploy** → **Deploy** ログ末尾の URL が Step 5 の Variable と一致するか確認:

   ```txt
   Web    -> https://liveboard.linto-dev.workers.dev
   Server -> https://liveboard-api.linto-dev.workers.dev
   ```

   異なる場合は該当 Variable（と Google のリダイレクト URI）を実際の値に直して再 push。
2. Web で **サインアップ → メール認証 → ログイン**が成功し、ダッシュボードが表示される。
3. ホストで**投票を作成（draft）→ 公開（open）**。
4. 別ブラウザで `/p/<joinCode>` を開いて**投票** → 双方の画面で**得票・参加人数がリアルタイム更新**される。
5. ホストが**締切（closed）→ 参加者画面が即切替**。再読込後も**結果が保持**される（D1 永続化）。
