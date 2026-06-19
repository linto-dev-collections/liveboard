/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  extends: "dependency-cruiser/configs/recommended-strict",

  // ---------------------------------------------------------------------------
  // 設計メモ (Phase 8 完了 + nested _components 検査強化後)
  //
  // - CLAUDE.md §1.1 / §3.1 / §4.1 の import 境界を encode する。
  // - Phase 8 で baseline 除外を全廃し、strict (error severity) に切替済み。
  // - Route Group 越えチェックは 2 系統に分離:
  //     a) RG-A → RG-B クロス参照 (= `no-cross-route-group`): capture group 形式
  //     b) 非 RG (= app 直下や _features/landing-view 等) → RG 内部 private path
  //        (= `no-cross-route-group-import`): from.pathNot で 3 RG を除外
  // - 同名ルールを複数並べても上書きはされず独立評価されるため、例外は必ず
  //   ルール内部の `pathNot` に書く。
  // - nested `_features/<name>/_components/` も `_components` 系ルールの対象。
  //   Phase 1 で baseline 用に入れていた from.pathNot は撤去済み。
  // ---------------------------------------------------------------------------

  forbidden: [
    // =========================================================================
    // CLAUDE.md §4.1: `_lib/` → `_features/` への import 禁止
    // (レイヤ逆転防止: 型は `_lib/types.ts` に置く)
    // =========================================================================
    // 厳密化 (Phase 9.1): _lib → _components の除外を撤去 (UI 依存はレイヤ逆転)。
    //   _lib → _lib のみ除外。これは型合成 (親 feature _lib・自身 _lib・descendant 型参照) を許容するため。
    //   既存コードの違反 0 件で安全に厳格化済み。
    {
      name: "lib-no-features",
      comment:
        "CLAUDE.md §4.1: `_lib/` から `_features/` への import 禁止（レイヤ逆転）。" +
        "型は `_lib/types.ts` に置く。" +
        "_lib → _lib (型合成) のみ除外する。_lib → _components は UI 依存となるため禁止。",
      severity: "error",
      from: { path: "^src/app/.+/_lib/.+" },
      to: {
        path: "^src/app/.+/_features/",
        pathNot: "^src/app/.+/_lib/",
      },
    },

    // =========================================================================
    // CLAUDE.md §4.1: `_components/` → sibling `_features/` 禁止
    // (`_components` は Presentational に限定)
    // =========================================================================
    // 厳密化 (Phase 9.1): capture group ベースで「同一 feature の _components のみ除外」に。
    //   旧 pathNot: ["^src/app/.+/_components/"] は任意の _components を許容 (cross-feature 直 import を見逃す)。
    //   新 pathNot: ["^src/app/.+/_features/$1/_components/"] で同一 feature のみ許容。
    //   _lib (任意) は型合成 (親 feature _lib 参照を含む) のため引き続き許容。
    // 注: capture group は alphanumeric+hyphen の feature 名のみ安全。
    //     Route Group `(auth)` 等の括弧や dynamic segment `[token]` は捕捉対象外
    //     ([^/]+ で <name> 部分だけを捕捉)。
    {
      name: "components-no-sibling-features",
      comment:
        "CLAUDE.md §4.1: `_components/` から兄弟 `_features/` への import 禁止。" +
        "`_components` は Presentational に限定する。" +
        "同一 feature の _components と任意の _lib (型合成) のみ除外する。",
      severity: "error",
      from: { path: "^src/app/.+/_features/([^/]+)/_components/.+" },
      to: {
        path: "^src/app/.+/_features/",
        pathNot: ["^src/app/.+/_features/$1/_components/", "^src/app/.+/_lib/"],
      },
    },

    // =========================================================================
    // Route-level `_components/` (= `_features/<name>/` 配下にない _components)
    // → `_features/` 直接 import 禁止 (app-level top features のみ例外)
    // =========================================================================
    // 例: src/app/embed/_components/, src/app/(auth)/_components/ 等。
    //     `src/app/_features/site-chrome/` 等の app-level top features は
    //     既存利用 (embed-powered-badge.tsx → site-chrome) があり、共通 UI primitive として許容。
    {
      name: "components-no-sibling-features",
      comment:
        "CLAUDE.md §4.1: Route-level `_components/` から `_features/` への import 禁止。" +
        "app-level top features (src/app/_features/*) と型合成 (_lib) のみ除外する。",
      severity: "error",
      from: {
        path: "^src/app/.+/_components/.+",
        pathNot: "/_features/[^/]+/_components/",
      },
      to: {
        path: "^src/app/.+/_features/",
        pathNot: ["^src/app/_features/", "^src/app/.+/_lib/"],
      },
    },

    // =========================================================================
    // CLAUDE.md §4.1: Route Group 外部から内部 private path への import 禁止
    // (case 2: 非 RG → RG 内部)
    // =========================================================================
    {
      name: "no-cross-route-group-import",
      comment:
        "CLAUDE.md §4.1: Route Group ((auth)/(marketing)/dashboard/(protected)) の" +
        "外部から内部 private path に直接 import 禁止。" +
        "共通ロジックは `src/lib/` か `src/components/` に集約する。",
      severity: "error",
      from: {
        pathNot: [
          "^src/app/\\(auth\\)/",
          "^src/app/\\(marketing\\)/",
          "^src/app/dashboard/\\(protected\\)/",
        ],
      },
      to: {
        path: [
          "^src/app/\\(auth\\)/.+",
          "^src/app/\\(marketing\\)/.+",
          "^src/app/dashboard/\\(protected\\)/.+",
        ],
      },
    },

    // =========================================================================
    // CLAUDE.md §4.1: Route Group 同士の相互 import 禁止
    // (case 1: RG-A → RG-B)
    // =========================================================================
    // capture group + $1 substitution は (auth)/(marketing)/(protected) のような
    // 括弧を含む Route Group 名では機能しない: 捕捉文字列 `(auth)` が $1 で
    // pathNot に注入される際に regex メタ文字として再解釈され、`(auth)` が
    // literal にマッチしない (= `(protected)` 等の自身も除外できず false positive)。
    // そのため 3 つの from = 各 RG / to = 他 2 RG の rule に分割している。
    {
      name: "no-cross-route-group",
      comment:
        "CLAUDE.md §4.1: (auth) → ((marketing) | dashboard/(protected)) への import 禁止。",
      severity: "error",
      from: { path: "^src/app/\\(auth\\)/" },
      to: {
        path: [
          "^src/app/\\(marketing\\)/",
          "^src/app/dashboard/\\(protected\\)/",
        ],
      },
    },
    {
      name: "no-cross-route-group",
      comment:
        "CLAUDE.md §4.1: (marketing) → ((auth) | dashboard/(protected)) への import 禁止。",
      severity: "error",
      from: { path: "^src/app/\\(marketing\\)/" },
      to: {
        path: ["^src/app/\\(auth\\)/", "^src/app/dashboard/\\(protected\\)/"],
      },
    },
    {
      name: "no-cross-route-group",
      comment:
        "CLAUDE.md §4.1: dashboard/(protected) → ((auth) | (marketing)) への import 禁止。",
      severity: "error",
      from: { path: "^src/app/dashboard/\\(protected\\)/" },
      to: {
        path: ["^src/app/\\(auth\\)/", "^src/app/\\(marketing\\)/"],
      },
    },

    // =========================================================================
    // CLAUDE.md §4.1: 単独 route 間の相互 import 禁止
    // (share / embed / embed-auth / invitation / promo)
    // =========================================================================
    // 単独 route のディレクトリ名は alphanumeric + ハイフンのみで regex メタ文字を含まない
    // ため、capture group 形式が安全に機能する。
    {
      name: "no-cross-standalone-route",
      comment:
        "CLAUDE.md §4.1: share / embed / embed-auth / invitation / promo は相互 import 禁止。",
      severity: "error",
      from: {
        path: "^src/app/(share|embed|embed-auth|invitation|promo)/",
      },
      to: {
        path: "^src/app/(share|embed|embed-auth|invitation|promo)/",
        pathNot: "^src/app/$1/",
      },
    },

    // =========================================================================
    // CLAUDE.md §1.1: `_features/<name>.tsx` (即値ファイル) 禁止
    // (feature は必ず `_features/<name>/index.tsx` (+ 任意の _components/_lib/_features) フォルダ形式)
    // =========================================================================
    // Phase 9.5 で導入。既存違反 3 件 (site-chrome / extension-popup-shell /
    // resend-verification-button) を `_features/<name>/index.tsx` 形式に refactor 済み。
    //
    // 検出ロジック: import 先パスが `_features/<one-segment>.tsx` に一致したら fire。
    //   - `_features/<X>/index.tsx` は 2 segments 先のため一致しない (許容)
    //   - `_features/<X>/loading-skeleton.tsx` も同様に一致しない (許容)
    //
    // 2 パターン分割は `(.+/)?` が safe-regex で polynomial backtrack 判定されるため。
    {
      name: "no-immediate-tsx-in-features",
      comment:
        "CLAUDE.md §1.1: feature は `_features/<name>/index.tsx` フォルダ形式で定義する。" +
        "即値ファイル `_features/<name>.tsx` は禁止 (子 _components / _lib / _features の追加余地を構造で確保)。",
      severity: "error",
      from: {}, // 全 from を対象 (誰かが import しているだけで違反)
      to: {
        path: [
          "^src/app/_features/[^/]+\\.tsx?$",
          "^src/app/.+/_features/[^/]+\\.tsx?$",
        ],
      },
    },

    // =========================================================================
    // CLAUDE.md §1.1 / §3.2: `_features/<X>/` 直下に置ける file の allowlist
    // (`no-immediate-tsx-in-features` は `_features/<X>.tsx` (即値ファイル) を検出するが、
    //  `_features/<X>/<loose>.tsx?` (= フォルダ直下の non-index ファイル) は対象外。
    //  本ルールがその死角を埋める)
    // =========================================================================
    // Phase 10.1 で導入。既存違反 7 件を refactor して error で投入:
    //   - dashboard-overview/empty-state-onboarding.tsx → _components/empty-state-onboarding.tsx (env を props lift)
    //   - dashboard-overview/metric-card.tsx → _components/metric-card.tsx (props-only)
    //   - dashboard-overview/period-tabs.tsx → _features/period-tabs/index.tsx (useQueryState 持ち)
    //   - dashboard-overview/recent-recordings-card.tsx → _features/recent-recordings-card/index.tsx (Server Component + queries 呼出)
    //   - share-view/_features/resizable-layout/side-panel-tabs.tsx → _features/side-panel-tabs/index.tsx (useEffect + fetch 持ち)
    //   - share-view/_features/transcription-panel-shared/queries.ts → _lib/api.ts (queries は _lib 配下)
    //
    // 検出ロジック: import 先パスが `_features/<X>/<file>.(ts|tsx)` に一致したら fire。
    // pathNot で標準ファイルを除外:
    //   - `index.tsx?` (feature エントリ)
    //   - `loading.tsx?` / `loading-skeleton.tsx?` (Suspense fallback 用、CLAUDE.md §11.1 で page.tsx からの直 import が許容されている)
    //   - `use-*.tsx?` (custom hook ファイル。`use-form.ts` 等)
    //
    // `_features/<X>/_components/`, `_lib/`, `_features/<Y>/` 配下のファイルは
    // TO regex `^src/app/.+/_features/[^/]+/[^/]+\.(ts|tsx)$` が
    // 「`_features/<X>/<file>` の 1 segment 直下」のみマッチするため対象外
    // (= subdirectory 内ファイルは自然に除外される)。
    {
      name: "no-loose-files-in-feature-root",
      comment:
        "CLAUDE.md §1.1 / §3.2: `_features/<X>/` 直下に置けるファイルは " +
        "`index.tsx` / `loading.tsx` / `loading-skeleton.tsx` / `use-*.ts(x)` のみ。" +
        "それ以外は `_components/` (props-only Presentational) / `_lib/` (型/queries/actions) / " +
        "子 `_features/<Y>/` のいずれかに振り分ける。",
      severity: "error",
      from: {},
      to: {
        path: "^src/app/.+/_features/[^/]+/[^/]+\\.(ts|tsx)$",
        pathNot: [
          "/_features/[^/]+/index\\.tsx?$",
          "/_features/[^/]+/loading(-skeleton)?\\.tsx?$",
          "/_features/[^/]+/use-[^/]+\\.tsx?$",
        ],
      },
    },

    // =========================================================================
    // CLAUDE.md §4.1: 他 feature の internal piercing 禁止
    // (公開 API は `_features/<X>/index.tsx` (+ loading-skeleton.tsx) のみ)
    // =========================================================================
    // depcruise の back-reference は **FROM 側 capture → TO 側 pathNot** の
    // 単方向のみサポートされる (`components-no-sibling-features` 等の既存実装と同じ)。
    // そのため「外部からのピアス」と「feature 間のピアス」を 2 ルールに分割する。
    //
    // 設計の妥協点:
    //   greedy `.+?` で **outermost (= ルートに最も近い)** feature 名を捕捉し、
    //   その scope 配下からの internal access は全て許容する。これにより:
    //     - 子 feature → 親 feature の _components / _lib アクセス: 許容
    //     - 親 feature → 子 feature の _components / _lib アクセス: 同じ outermost
    //       scope のため許容される (= relaxation)。理想的には index.tsx 経由が望ましいが
    //       depcruise の制約で機械検査困難なため、PR レビューで確認する。
    //   厳格に検出されるのは「sibling feature 間 (異なる outermost feature)」と
    //   「外部 (containers / route _components 等) からの piercing」。

    // -------------------------------------------------------------------------
    // Rule A: 外部 (= 任意の _features/ 配下にない) → feature internal 禁止
    // -------------------------------------------------------------------------
    // `_containers/`, route-level `_components/`, `_features/<X>/loading-skeleton.tsx`
    // 等の外側から feature internal にアクセス禁止。
    // FROM 除外: `_features/` は Rule B が担当。`_lib/` は `lib-no-features` が担当。
    {
      name: "no-feature-internal-piercing-external",
      comment:
        "CLAUDE.md §4.1: feature 外部 (containers / route _components / page 等) から" +
        "`_features/<X>/_components/`, `_lib/`, `_features/<child>/` への直接 import 禁止。" +
        "公開 API は `_features/<X>/index.tsx` と `loading-skeleton.tsx` のみ。",
      severity: "error",
      from: {
        path: "^src/app/",
        pathNot: [
          "^src/app/.+/_features/", // feature 間ピアスは Rule B
          "^src/app/.+/_lib/", // _lib → _lib は lib-no-features の exemption と整合
        ],
      },
      to: {
        path: "^src/app/.+/_features/[^/]+/(_components|_lib|_features)/.+",
      },
    },

    // -------------------------------------------------------------------------
    // Rule B: feature 間ピアス禁止 (outermost feature 名が異なる場合のみ fire)
    // -------------------------------------------------------------------------
    // `_features/<outer>/...` 配下から、別の `_features/<outer'>/...` の internal
    // (= `_components/`, `_lib/`, `_features/<child>/`) への import を禁止する。
    // outermost feature 名が一致するケース (= 同一 feature scope) は除外:
    //   - 子 → 親の _components / _lib アクセス: 同 outermost なので除外
    //   - 親 → 子の _components / _lib アクセス: 同 outermost なので除外 (relaxation)
    //   - 同じ親配下の sibling 同士の internal アクセス: 同 outermost なので除外 (relaxation)
    // FROM capture は非貪欲 `.+?` で「最も浅い (outermost) feature 名」を捕捉する。
    {
      name: "no-feature-internal-piercing-cross",
      comment:
        "CLAUDE.md §4.1: ある feature 配下から **別の outermost feature** の internal" +
        " (`_components/`, `_lib/`, `_features/<child>/`) への直接 import 禁止。" +
        "同 outermost scope の親子・sibling 内アクセスは relaxation で許容 (PR レビューでカバー)。",
      severity: "error",
      from: {
        // 非貪欲: outermost feature 名 ([^/]+) を捕捉
        path: "^src/app/.+?/_features/([^/]+)/",
      },
      to: {
        path: "^src/app/.+/_features/[^/]+/(_components|_lib|_features)/.+",
        // 同 outermost feature scope は除外
        pathNot: ["^src/app/.+/_features/$1/"],
      },
    },

    // =========================================================================
    // CLAUDE.md §4.1: 子 feature が親 feature の index.tsx を import 禁止
    // =========================================================================
    // `_features/<parent>/_features/<child>/<...>` から
    // `_features/<parent>/index.tsx` への import を禁止する。
    // 親 → 子は props で渡す。
    //
    // 子の自身の index.tsx (= `_features/<parent>/_features/<child>/index.tsx`) は
    // to.pathNot で除外する。
    {
      name: "child-feature-no-parent",
      comment:
        "CLAUDE.md §4.1: 子 feature から親 feature の index.tsx への逆 import 禁止。" +
        "親 → 子は props で渡す。",
      severity: "error",
      from: { path: "^src/app/.+/_features/[^/]+/_features/[^/]+/" },
      to: {
        path: "^src/app/.+/_features/[^/]+/index\\.tsx?$",
        pathNot: "^src/app/.+/_features/[^/]+/_features/[^/]+/index\\.tsx?$",
      },
    },

    // =========================================================================
    // CLAUDE.md §11.5: `src/components/<X>/_components/` は X 専用 private
    // =========================================================================
    // `src/components/<X>/<entry>.tsx` の内部実装として `_components/` を作る場合、
    // 外部からその private に直接 import するのを禁止する。
    // (App Router 側の `_components/` 規約と同じ思想を共有 UI 側にも適用)。
    //
    // 現状 `src/components/devtools/_components/` は Phase 9.2 で平野化済みのため
    // ルール対象なし (0 violations)。将来 `_components/` を再導入した場合の
    // preventive guard として error 投入。
    //
    // 2 rules に分割する理由は §4.1 の feature internal piercing と同じ:
    // depcruise back-reference が FROM capture → TO pathNot 方向のみサポートのため。
    {
      name: "shared-components-no-piercing-external",
      comment:
        "CLAUDE.md §11.5: `src/components/<X>/_components/` への外部 (src/app, src/lib 等) からの直接 import 禁止。" +
        "公開 API は `src/components/<X>/<entry>.tsx` のみ。",
      severity: "error",
      from: {
        path: "^src/",
        pathNot: ["^src/components/"], // 内部からの cross-X は別 rule で
      },
      to: { path: "^src/components/[^/]+/_components/" },
    },
    {
      name: "shared-components-no-piercing-cross",
      comment:
        "CLAUDE.md §11.5: `src/components/<X>/` から別 `src/components/<Y>/_components/` への直接 import 禁止。",
      severity: "error",
      from: { path: "^src/components/([^/]+)/" },
      to: {
        path: "^src/components/[^/]+/_components/",
        pathNot: ["^src/components/$1/_components/"],
      },
    },

    // =========================================================================
    // CLAUDE.md §1.1 / §3.1: `_components/` は Presentational
    // (browser 用 API クライアントを使わない)
    // =========================================================================
    // 注意: 直接 `fetch(...)` を呼ぶケースは depcruise では検出できない (AST レベルの
    //       call expression は対象外)。`components-env-warning` で間接検出を補助する。
    {
      name: "components-no-api-client",
      comment:
        "CLAUDE.md §1.1 / §3.1: `_components/` は Presentational。" +
        "`@/lib/api` (browser RPC client) を使わない。データ取得が必要なら `_features/` に昇格する。",
      severity: "error",
      from: { path: "^src/app/.+/_components/.+" },
      to: { path: "^src/lib/api\\.ts$" },
    },

    // =========================================================================
    // CLAUDE.md §1.1: `_components/` は Presentational
    // (Server-only API helper を使わない)
    // =========================================================================
    {
      name: "components-no-server-api",
      comment:
        "CLAUDE.md §1.1: `_components/` は Presentational。" +
        "`@/lib/api.server` (Server-only) も使わない。",
      severity: "error",
      from: { path: "^src/app/.+/_components/.+" },
      to: { path: "^src/lib/api\\.server\\.ts$" },
    },

    // =========================================================================
    // CLAUDE.md §1.1: `_components/` から Server-only API import 禁止
    // (next/headers, next/cache)
    // =========================================================================
    {
      name: "components-no-server-actions-helper",
      comment:
        "CLAUDE.md §1.1: `_components/` から `next/headers` 等の Server-only API を import 禁止。",
      severity: "error",
      from: { path: "^src/app/.+/_components/.+" },
      to: {
        path: "^(next/headers|next/cache)$",
        dependencyTypes: ["npm"],
      },
    },

    // =========================================================================
    // CLAUDE.md §1.1: `_components/` は `@liveboard/env/web` を import しない
    // (URL 組立て等は親 _features で行い、props で渡す)
    // =========================================================================
    // Phase 9.3 で warn → error に昇格。既存違反 1 件 (video-player.tsx の
    // streamUrl) を caller (recording-detail-view/index.tsx) に lift して
    // props (videoUrl) で受け取る形に修正済み、0 violations で安全昇格。
    //
    // URL 文字列の組み立てが必要な _components は、親 _features で env を
    // 読み込んで結果文字列だけ props 経由で渡す。
    {
      name: "components-no-env",
      comment:
        "CLAUDE.md §1.1: `_components/` から `@liveboard/env/web` import 禁止。" +
        "URL 組立て等 env 参照が必要な場合は親 `_features/` で行い、結果文字列を props で渡す。",
      severity: "error",
      from: { path: "^src/app/.+/_components/.+" },
      to: { path: "^@liveboard/env/web$" },
    },

    // =========================================================================
    // CLAUDE.md §1.1: `_components/` は props-only Presentational
    // (Server Action `_lib/*actions.ts` を import する場合は `_features/` に昇格)
    // =========================================================================
    // Phase 9.1 で warn baseline として導入し、既存違反 14 件 (webhook 6 + recordings 10 +
    // account 1 + 直接 fetch 1) を `_features/<name>/` に昇格して error に格上げ済み。
    {
      name: "components-no-server-actions",
      comment:
        "CLAUDE.md §1.1: `_components/` は props-only Presentational。" +
        "Server Action (`_lib/*actions.ts`) を import する場合は `_features/<name>/` に昇格する。",
      severity: "error",
      from: { path: "^src/app/.+/_components/.+" },
      to: { path: "^src/app/.+/_lib/.*actions\\.ts$" },
    },

    // =========================================================================
    // CLAUDE.md §1.1: `_components/` から `@/lib/auth-client` 禁止
    // (Better Auth client は副作用呼び出し: sign-in / billing portal / passkey 等)
    // =========================================================================
    // Phase 9.2: social-sign-in, customer-portal-link を `_features/<name>/` に昇格して
    // 既存違反 0 件で error 投入。Better Auth client は OAuth redirect や Stripe portal
    // 起動などの I/O を持つため、Presentational から呼ぶと testability / mock 不可。
    {
      name: "components-no-auth-client",
      comment:
        "CLAUDE.md §1.1: `_components/` から `@/lib/auth-client` (Better Auth) 禁止。" +
        "authClient.signIn / subscription.billingPortal 等は副作用を持つため `_features/<name>/` に昇格する。",
      severity: "error",
      from: { path: "^src/app/.+/_components/.+" },
      to: { path: "^src/lib/auth-client(\\.ts)?$" },
    },

    // =========================================================================
    // CLAUDE.md §1.1: `_components/` から `nuqs` 禁止
    // (`useQueryState` は URL state mutation = 副作用扱い)
    // =========================================================================
    // Phase 9.2: recordings-toolbar を `_features/<name>/` に昇格して error 投入。
    // useQueryState は内部で window.history を触る URL state mutation のため、
    // 「props で受け取り、出口は callback」の props-only 原則に反する。
    {
      name: "components-no-nuqs",
      comment:
        "CLAUDE.md §1.1: `_components/` から `nuqs` (`useQueryState` 等) 禁止。" +
        "URL state を扱う場合は `_features/<name>/` に昇格し、state / setter を props で渡す。",
      severity: "error",
      from: { path: "^src/app/.+/_components/.+" },
      // safe-regex の polynomial-backtracking 判定を避けるため `(/.+)?` のような
      // 入れ子量化子は使わず、トップレベルと subpath を 2 つの literal anchor で表現する。
      to: { path: ["^nuqs$", "^nuqs/"], dependencyTypes: ["npm"] },
    },

    // =========================================================================
    // CLAUDE.md §1.1: `_components/` から `next/navigation` 禁止
    // (`useRouter().push/replace/refresh` 等の URL state mutation 副作用)
    // =========================================================================
    // Phase 10.1: 既存違反 1 件 (`billing-view/_components/checkout-status-toast.tsx`
    // が `useRouter().replace()` で URL を mutate) を `_features/checkout-status-toast/`
    // に昇格して 0 件で error 投入。
    //
    // 設計判断: depcruise は import source 単位の検査しかできず、副作用版
    // (`useRouter`) と非副作用版 (`usePathname` / `useSearchParams` / `useParams`) を
    // named import 単位で区別できないため、`next/navigation` 自体を _components 配下から
    // 一律 ban する。pathname / searchParams / params が必要な _components は props で
    // 受け取り、caller (`_features/<name>/index.tsx`) 側で hook を呼ぶ。これは
    // `components-no-nuqs` と同じ caller-lift パターン。
    {
      name: "components-no-next-navigation",
      comment:
        "CLAUDE.md §1.1: `_components/` から `next/navigation` import 禁止。" +
        "`useRouter().push/replace/refresh` は URL state mutation の副作用 (= nuqs と同種)。" +
        "`usePathname/useSearchParams/useParams` も props で受け取り caller-lift する。" +
        "URL を触る必要があれば `_features/<name>/` に昇格する。",
      severity: "error",
      from: { path: "^src/app/.+/_components/.+" },
      to: { path: "^next/navigation$", dependencyTypes: ["npm"] },
    },

    // =========================================================================
    // CLAUDE.md §2: page.tsx は `_lib/` を直接 import しない
    // (例外: generateMetadata 用 `_lib/queries.ts` / searchParams loader `_lib/search-params.ts`)
    // =========================================================================
    // page.tsx は薄いシェル: searchParams / Suspense / Container 呼び出しのみ。
    // `_lib/` への直接アクセスは原則 _containers 経由に揃える。
    //
    // 例外として **Next.js 標準パターン** のみ pathNot で許容:
    //   - `_lib/queries.ts` — `generateMetadata()` 用の Server-side fetch
    //     (例: share/[token]/page.tsx, embed/[token]/page.tsx)
    //   - `_lib/search-params.ts` — Next.js searchParams loader (nuqs 等)
    //     (例: dashboard/(protected)/page.tsx)
    //
    // Phase 9.3 で導入 (現状 3 件全て例外パターン該当、違反 0 件)。
    {
      name: "page-no-direct-lib",
      comment:
        "CLAUDE.md §2: page.tsx は `_lib/` を直接 import 禁止。" +
        "例外は `_lib/queries.ts` (generateMetadata 用) と `_lib/search-params.ts` (Next.js searchParams loader) のみ。",
      severity: "error",
      from: {
        path: ["^src/app/page\\.tsx?$", "^src/app/.+/page\\.tsx?$"],
      },
      to: {
        path: "^src/app/.+/_lib/.+",
        pathNot: ["/_lib/queries\\.ts$", "/_lib/search-params\\.ts$"],
      },
    },

    // =========================================================================
    // CLAUDE.md §2: page.tsx は container 経由で view を呼ぶ。
    // 直接 `_features/` を import するのは禁止 (error)。
    // =========================================================================
    // page.tsx は薄いシェルに留め、searchParams / Suspense / Container 呼び出し
    // のみを担う。データ取得や UI 組み立ては `_containers/` → `_features/` の
    // 順に降ろす。Phase 9.2 で warn から error に格上げ済み (既存違反 0 件で安全昇格)。
    {
      name: "page-no-direct-features",
      comment:
        "CLAUDE.md §2: page.tsx は `_containers/` 経由で view を呼び出す。" +
        "直接 `_features/` import は禁止。" +
        "ただし `<Suspense fallback={<XxxSkeleton/>}>` のための loading skeleton 直 import は許容する。",
      severity: "error",
      from: {
        // ルート (`src/app/page.tsx`) とサブパス (`src/app/.../page.tsx`) を
        // 配列で OR 表現する。`(.+/)?` を使うと safe-regex がポリノミアル
        // バックトラックとして弾くので、固定 2 パターンに分割する。
        path: ["^src/app/page\\.tsx?$", "^src/app/.+/page\\.tsx?$"],
      },
      to: {
        path: "^src/app/.+/_features/",
        // Suspense fallback として page.tsx が直 import するのは正当パターン。
        //   - `loading-skeleton.tsx` (本リポジトリ既存命名)
        //   - `loading.tsx` (App Router 特殊ファイル名と被るが feature 内配置)
        pathNot: "/loading(-skeleton)?\\.tsx?$",
      },
    },

    // =========================================================================
    // 循環依存（apps/server と同設定）
    // =========================================================================
    {
      name: "no-circular",
      comment:
        "ランタイム循環依存を禁止（type-only import を経路に含む循環は除外）。",
      severity: "error",
      from: {},
      to: {
        circular: true,
        viaOnly: { dependencyTypesNot: ["type-only"] },
      },
    },
    {
      name: "no-circular-type-only",
      comment:
        "type-only のみの循環依存も禁止（Phase 9.3 で warn → error に昇格、" +
        "既存 0 件で安全昇格）。",
      severity: "error",
      from: {},
      to: { circular: true },
    },

    // =========================================================================
    // recommended-strict プリセットの無効化（他ツールと責務が重複するため）
    // =========================================================================
    // knip がエントリポイント起点の到達性解析で検出する（より正確）
    { name: "no-orphans", severity: "ignore", from: {}, to: {} },
    // tsc --noEmit が型チェック時に検出する
    { name: "not-to-unresolvable", severity: "ignore", from: {}, to: {} },
  ],

  options: {
    doNotFollow: {
      path: "node_modules",
    },

    tsPreCompilationDeps: true,

    tsConfig: {
      fileName: "./tsconfig.json",
    },

    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"],
      conditionNames: ["import", "require", "node", "default"],
      mainFields: ["module", "main", "types"],
    },

    // pnpm のシンボリックリンクを保持
    preserveSymlinks: true,

    cache: {
      strategy: "content",
      folder: "node_modules/.cache/dependency-cruiser",
    },

    progress: { type: "performance-log" },

    reporterOptions: {
      dot: {
        collapsePattern: "node_modules/(@[^/]+/[^/]+|[^/]+)",
      },
      text: {
        highlightFocused: true,
      },
    },
  },
};
