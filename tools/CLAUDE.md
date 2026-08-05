# CLAUDE.md

このリポジトリで作業するAIエージェント・開発者向けのガイドです。
**なぜこのサイトを作っているか**は [docs/CONCEPT.md](./docs/CONCEPT.md) を先に読んでください。

---

## プロジェクト概要

`https://tool.hasokon.com` で公開している無料Webツール集。
1ページ = 1ツールで、SEOで検索上位を狙い、AdSenseで収益化する。

- **完全静的サイト**（Next.js App Router + `output: 'export'`）
- **計算はすべてクライアントサイド**。サーバーもDBもなく、入力値は外部に送信しない
- ホスティングは **AWS S3 + CloudFront**。デプロイは2段階:
  - main にマージ → **tool.test.hasokon.com**（Basic認証つきテスト環境）
  - `v*` タグを push → **tool.hasokon.com**（本番）。`git tag v1.0.0 && git push origin v1.0.0`

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
  not-found.tsx       404ページ（out/404.html になる）
  AdUnit.tsx          広告枠。lib/adsense.ts が未設定なら何も出さない
  Analytics.tsx       ページビュー送信。lib/analytics.ts が未設定なら何もしない
  ads.txt/route.ts    /ads.txt を lib/adsense.ts から生成
  {slug}/
    page.tsx          サーバーコンポーネント（metadata / JSON-LD / 解説 / FAQ）
    Calculator.tsx    'use client' のUI。ロジックは持たせない
  _roulette/          ルーレット系ツールのUI（'use client'）
  r/[slug]/           用途別ルーレット。lib/roulette/presets.json から生成
  guide/[slug]/       使い方の記事。lib/roulette/guides.json から生成
lib/
  registry.ts         ツールレジストリ（一覧・sitemapの単一の情報源）
  adsense.ts          AdSenseの設定。ここだけ埋めれば広告が出る
  analytics.ts        GA4の設定。ここだけ埋めれば計測が始まる
  {slug}.ts           計算ロジック（純関数のみ。DOM/Reactに依存しない）
  roulette/           ルーレット系のロジックとデータ（純関数のみ）
tests/
  {slug}.test.ts      lib/{slug}.ts のテスト
infra/
  certificate.yaml    ACM証明書（us-east-1でないとCloudFrontで使えない）
  site.yaml           S3 + CloudFront + Route53 + デプロイ用IAMロール
  setup.sh            上記2つを順に構築しGitHub Secretsまで設定する
docs/CONCEPT.md       コンセプトと方針
```

**AWSの構成はコンソールで直接いじらない。** `infra/*.yaml` を直して
`./infra/setup.sh` を再実行する（何度実行しても同じ結果になる）。
手で変更すると次回の実行で巻き戻る。

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
3. `app/{slug}/page.tsx` — 構成は
   `h1 → p.lead → <Calculator /> → <AdUnit position="below-tool" /> → 解説 → FAQ → <AdUnit position="below-faq" /> → 出典`
   - `metadata` に `title` / `description` / `alternates.canonical`（`${SITE_URL}/{slug}/`）
   - JSON-LD で `WebApplication` + `FAQPage`
4. `app/{slug}/Calculator.tsx` — `'use client'`。`useState` で入力を持ち、lib の関数を呼ぶだけ
5. `lib/registry.ts` にエントリを追加し `ready: true` に。
   `updatedAt` には**中身を更新した日**を入れる（sitemap の lastmod になる。ビルド日ではない）
6. `npm test && npm run build` が通ることを確認

## AdSense

設定は `lib/adsense.ts` の1箇所に集約されている。
旧サイト（roulette.hasokon.com）から引き継いだ審査済みアカウントで**配信中**。

- 旧サイトが自動広告のみで運用していたため、`AD_SLOTS` は空のまま。
  スクリプトが入っていれば自動広告は動く
- 手動で広告枠を置きたくなったら、AdSense管理画面で広告ユニットを作って
  `AD_SLOTS` にスロットIDを入れる（`below-tool` = ツールの下、`below-faq` = 解説の下）
- 広告枠は `app/AdUnit.tsx`（`'use client'`）。ページ側は `<AdUnit position="below-tool" />` と書く。
  スロット未設定のときは、開発中のみ破線のプレースホルダを出し、本番ビルドでは何も出力しない
- `/ads.txt` も同じ定数から生成されるので、パブリッシャーIDを二重管理しなくてよい。
  ルートドメイン（hasokon.com）側にも同じ内容が必要なので、変えるときは
  [hasokon-home](https://github.com/ke-iwata/hasokon-home) も直すこと
- `ADSENSE_CLIENT` を空にすると、スクリプトも広告枠も ads.txt も出力されなくなる
- **AdSenseのscriptは `app/layout.tsx` の `<head>` に生タグで置く**。`next/script` の
  `afterInteractive` だと静的HTMLにpreloadしか出ず、審査でコードを検出されない可能性があるため
- **計算機より上に広告を置かない**（UX悪化 → 直帰率上昇 → 順位下落を避ける。docs/CONCEPT.md 5参照）

## アクセス解析（Googleアナリティクス）

設定は `lib/analytics.ts` の1箇所。`GA_MEASUREMENT_ID` に測定ID（`G-` から始まる）を
入れるだけで有効になり、空の間はスクリプトも計測処理も一切出力されない。

- **`send_page_view: false` にしてある**。`next/link` の移動は通常のページ読み込みを
  伴わないため、gtagの自動送信では2ページ目以降が記録されない。ページビューは
  `app/Analytics.tsx` が `usePathname` の変化を見て送る（初回も含めてこちらに一本化）
- **ページビューだけでは「開かれたが使われなかった」が分からない**ので、
  主要な操作で `trackToolUse(slug, action)` を呼んでいる（ルーレットを回す・
  サイコロを振る・グループ分けする・変換結果をコピーする）。
  GA4では `tool_use` イベントに `tool` / `action` パラメータが付く形で集計される
- 新しいツールを足したときは、押して結果が出る操作があれば同じように呼ぶ
- **Cookieを使うのでプライバシーポリシーへの記載が必要**。`app/privacy/page.tsx` の
  「アクセス解析について」に記載済み。オプトアウトの案内も置いている

## よく踏む落とし穴

- **`app/sitemap.ts` / `app/robots.ts` には `export const dynamic = 'force-static'` が必須**。
  `output: 'export'` ではこれがないとビルドが落ちる
- **CloudFront に URL書き換え Function が必要**。`trailingSlash: true` のため全ページが
  `{slug}/index.html` というキーで出力される。S3にはディレクトリの概念がなく `/{slug}/` という
  キーは存在しないので、変換しないと全ページ403になる（`infra/site.yaml` の RewriteFunction）。
  特定ページ向けの対応ではなく全ページ共通
- **TypeScript を 7系に上げない**（上記のとおりビルドが落ちる）
- **Vitest のエイリアス**は `vitest.config.ts` の `resolve.alias` で `@` を解決している。
  `fileURLToPath(new URL('.', import.meta.url))` を使うこと（`__dirname` はESMで未定義）

## コマンド

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # 計算ロジックのテスト（現在201件）
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

- 公開済み: https://tool.hasokon.com （S3 + CloudFront）
- ツール13本 / 用途別ルーレット10本 / 使い方の記事6本 / テスト201件
- AdSenseは旧サイトから引き継いだアカウントで配信中（自動広告のみ）
- 残り: Search Consoleでのサイトマップ送信、AdSense管理画面へのサイト追加、
  `lib/analytics.ts` にGA4の測定IDを設定
- 中長期: 制度改正が出るたびに計算機を追加する（このサイトの本命戦略）

### 制度データの根拠と注意点

- `lib/nenshu-kabe.ts` の金額は**検証済み**（2026年8月）。
  所得税法等の一部を改正する法律（**令和8年法律第12号**・2026年3月31日成立公布）により
  令和8年分から 給与所得控除74万円 / 基礎控除104万円（本則62万＋特例加算42万）となり、
  178万・136万・169万・159万・163万・119万はいずれもこの組み合わせで導出できる。
  なお**国税庁のタックスアンサーは令和7年分の内容のまま**で本改正が未反映なので、
  参照するときに数値が食い違って見えるが誤りではない
- **2026年10月に106万円の壁の賃金要件が撤廃される**。撤廃後は金額の壁ではなくなるため、
  10月以降に `lib/nenshu-kabe.ts` の106万円の壁の note とページFAQの文言を見直すこと
- 傷病手当金の端数処理は協会けんぽの実務ベース。健保組合により運用差がある
- 壁ちょうどの年収の扱いは壁ごとに違う（`WallDef.inclusive`）。
  社会保険は「130万円未満」が扶養条件なのでちょうどで該当、税金は超えた分に課税なので非該当
