# CLAUDE.md

このリポジトリで作業するAIエージェント・開発者向けのガイドです。
**なぜこのサイトを作っているか**は [docs/CONCEPT.md](./docs/CONCEPT.md) を先に読んでください。

---

## プロジェクト概要

`https://tool.hasokon.com` で公開する無料Webツール集。
1ページ = 1ツールで、SEOで検索上位を狙い、AdSenseで収益化する。

- **完全静的サイト**（Next.js App Router + `output: 'export'`）
- **計算はすべてクライアントサイド**。サーバーもDBもなく、入力値は外部に送信しない
- ホスティングは **AWS S3 + CloudFront**、デプロイは main への push で GitHub Actions が実行

## 技術構成

| 領域 | 選定 | 備考 |
|---|---|---|
| フレームワーク | Next.js 16 (App Router) | `output: 'export'`, `trailingSlash: true` |
| 言語 | TypeScript | **6系に固定**。7系はNext.jsのコンパイラAPI非対応でビルドが落ちる |
| テスト | Vitest | 計算ロジック（純関数）のみを対象 |
| スタイル | 素のCSS（`app/globals.css`） | CSS-in-JSやTailwindは導入していない |
| ホスティング | S3 + CloudFront (OIDC経由でデプロイ) | [DEPLOY.md](./DEPLOY.md) |

## ディレクトリ構成

```
app/
  layout.tsx          共通レイアウト（ヘッダ・フッタ・メタ情報）
  page.tsx            トップ（ツール一覧。registryから生成）
  globals.css         全スタイル。ここ以外にCSSを増やさない
  sitemap.ts          registryから自動生成
  robots.ts
  privacy/ contact/   AdSense審査に必要な固定ページ
  {slug}/
    page.tsx          サーバーコンポーネント（metadata / JSON-LD / 解説 / FAQ）
    Calculator.tsx    'use client' のUI。ロジックは持たせない
lib/
  registry.ts         ツールレジストリ（一覧・sitemapの単一の情報源）
  {slug}.ts           計算ロジック（純関数のみ。DOM/Reactに依存しない）
tests/
  {slug}.test.ts      lib/{slug}.ts のテスト
docs/CONCEPT.md       コンセプトと方針
```

## 設計上の約束

1. **ロジックとUIを分離する** — 計算は `lib/{slug}.ts` の純関数。`Calculator.tsx` は入力と表示だけ。
   これによりロジックがテスト可能になり、UIを壊さず計算式を直せる
2. **制度データは1箇所に集約する** — 料率・金額・等級表はファイル冒頭の定数にまとめ、
   「【データ更新箇所】」コメントを付ける。年1回の更新をそこだけで完結させるため
3. **registry.ts が単一の情報源** — トップ一覧もsitemapもここから生成される。
   ツールを実装したら `ready: true` にする（`false` の間は「準備中」表示でリンクされない）
4. **新しいCSSクラスを増やさない** — `card` / `note` / `adslot` / `tool-card` / `lead` など
   既存クラス + 最小限のインラインstyleで組む
5. **出典を明記する** — 制度・法令に関わるツールは、一次情報へのリンクと最終更新日をページ下部に置く

## ツールの追加手順

1. `lib/{slug}.ts` — 計算ロジックを純関数で実装。JSDocで出典と更新箇所を明記
2. `tests/{slug}.test.ts` — import は `@/lib/{slug}`。一次資料の計算例・境界値・異常値を必ず入れる
3. `app/{slug}/page.tsx` — 構成は `h1 → p.lead → <Calculator /> → adslot → 解説 → FAQ → adslot → 出典`
   - `metadata` に `title` / `description` / `alternates.canonical`（`${SITE_URL}/{slug}/`）
   - JSON-LD で `WebApplication` + `FAQPage`
4. `app/{slug}/Calculator.tsx` — `'use client'`。`useState` で入力を持ち、lib の関数を呼ぶだけ
5. `lib/registry.ts` にエントリを追加し `ready: true` に
6. `npm test && npm run build` が通ることを確認

## よく踏む落とし穴

- **`app/sitemap.ts` / `app/robots.ts` には `export const dynamic = 'force-static'` が必須**。
  `output: 'export'` ではこれがないとビルドが落ちる
- **CloudFront に URL書き換え Function が必要**。`trailingSlash: true` のため
  `/warikan/` → `/warikan/index.html` の変換をしないと全ページ403になる（DEPLOY.md 3-1）
- **TypeScript を 7系に上げない**（上記のとおりビルドが落ちる）
- **Vitest のエイリアス**は `vitest.config.ts` の `resolve.alias` で `@` を解決している。
  `fileURLToPath(new URL('.', import.meta.url))` を使うこと（`__dirname` はESMで未定義）

## コマンド

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # 計算ロジックのテスト（現在96件）
npm run build    # out/ に静的出力
```

## 運用（定期メンテ）

| 頻度 | 作業 |
|---|---|
| 毎年3〜4月 | `lib/kosodate-shienkin.ts` の `FISCAL_YEARS` を確定値に更新 |
| 税制改正時 | `lib/nenshu-kabe.ts` の `WALL_DEFS` を更新 |
| 電気料金改定時 | `lib/aircon-denkidai.ts` の単価目安を更新 |
| 月1回 | Search Console でクエリを確認し、伸びているページを強化 |

記事の定期更新は不要。これは意図的な設計です（[docs/CONCEPT.md](./docs/CONCEPT.md) 参照）。

## 現在の状態と次の一手

- 実装済み: ツール8本 / テスト96件 / sitemap・robots / GitHub Actions
- 未着手: AWSリソース作成 → 初回デプロイ → Search Console登録 → AdSense申請
- 中長期: 制度改正が出るたびに計算機を追加する（このサイトの本命戦略）

### 未確認事項（着手前に検証すること）

- `lib/nenshu-kabe.ts` の金額（178万 / 119万 / 136万 / 169万）は
  二次情報ベースで実装している。**公開前に国税庁等の一次情報で最終確認すること**
- 傷病手当金の端数処理は協会けんぽの実務ベース。健保組合により運用差がある
