# apps/web — 配置判断ルール

`apps/web` を実装するときに **「どこに置くか」で迷ったときに参照する判断テーブル** のみを置く。機械検査されるルール / 命名 / 型ポリシー / データ取得パターン / 運用ルールは `.dependency-cruiser.cjs` と周辺コードから読み取れる。

---

## 1. `_components/` か `_features/<name>/` か

`_components/` は **props で受け取った値だけで動く Presentational** に限定する。以下のいずれかを行う場合は `_features/<name>/` に昇格する。

| 振る舞い | 例 | 配置先 |
| --- | --- | --- |
| Server Action (`_lib/*actions.ts`) を import する | `deleteRecording`, `createWebhookEndpoint` | `_features/<name>/` |
| ブラウザから直接 `fetch()` を叩く | サムネ生成・アップロード等 | `_features/<name>/` (fetch は `_lib/api.ts` に) |
| `@/lib/auth-client` (Better Auth) を使う | `authClient.signIn.social`, `authClient.subscription.billingPortal` | `_features/<name>/` |
| `nuqs` の `useQueryState` で URL state を mutate する | toolbar の view / q / sort | `_features/<name>/` |
| `next/navigation` の `useRouter` で push/replace する | `?status=` を消すための router.replace | `_features/<name>/` |
| 独自の `_lib/` (queries / actions / types) を持つ規模 | サブ UI に状態・通信ロジックがある | `_features/<name>/` |
| `@liveboard/env/web` を import する必要がある | サーバー URL 組立て等 | `_features/<name>/` (または caller に lift して結果文字列を props で渡す) |

---

## 2. ある UI / 関数をどの階層に置くか

| 置きたいもの | 置く場所 |
| --- | --- |
| あるページ専用の UI | そのページ配下の `_features/<view-name>/` |
| ある feature 専用の小さい部品 | その feature 配下の `_components/` |
| 同じ Route Group 全体で使う UI | Route Group 直下の `_features/` か `_components/` |
| アプリ全体で使う UI | `src/components/` |
| アプリ全体で使う関数 (フォーマッタ等) | `src/lib/format.ts` など `src/lib/` 配下 |
| デザインシステム共通プリミティブ | `@liveboard/ui` (パッケージ) |

共通化は **本当に複数箇所で使うようになってから** 上の階層へ昇格させる (コロケーション優先)。

---

## 3. 子 `_features/<child>/` か `_components/<child>.tsx` か

view の中で UI の塊を分けたいとき、以下のどれかを満たすなら **子 `_features/`**、満たさないなら **`_components/`**。

| `_features/<child>/` にする | `_components/<child>.tsx` にする |
| --- | --- |
| 子が独自の `_lib/` (queries / actions / types) を持つ | データを props で受け取るだけ |
| 子の中でさらに `_features/` や `_components/` に分割する規模 | 1 ファイルで完結する小さな部品 |
| 子がそのスコープで「ひとつの機能」と呼べる粒度 | レイアウト・表示の都合で分けた部品 |

---

## 4. URL state を `page → Container` ルートか View 内 `useQueryState` か

| 用途 | 読み込み場所 | 実装 |
| --- | --- | --- |
| SEO / 初期データに影響する値 (期間 / ID / sort key 等 fetch 引数になるもの) | `page.tsx` → Container | `_lib/search-params.ts` に `loadXxxSearchParams` parser を定義、`page.tsx` で展開して Container に props 渡し |
| 純 UI 状態 (page reload を伴わない View 内 toggle / filter / 表示モード) | `_features/<view>/index.tsx` 直接 | `useQueryState` を View 内で直接呼ぶ |

**境界判定基準:** その値が変わると container の fetch を再実行する必要があるか。Yes なら page/container、No なら view。
