# CLAUDE.md（tools）

hasokon.com モノレポの `tools/` で作業するAIエージェント・開発者向けのガイドです。
npmコマンドはすべて `tools/` ディレクトリ内で実行します。
**なぜこのサイトを作っているか**は [docs/CONCEPT.md](./docs/CONCEPT.md) を先に読んでください。

---

## プロジェクト概要

`https://hasokon.com/tools/` で公開している無料Webツール集（basePath: /tools でドメイン統合済み。旧 tool.hasokon.com は301）。
1ページ = 1ツールで、SEOで検索上位を狙い、AdSenseで収益化する。

- **完全静的サイト**（Next.js App Router + `output: 'export'`）
- **計算はすべてクライアントサイド**。サーバーもDBもなく、入力値は外部に送信しない
- ホスティングは **AWS S3 + CloudFront**。デプロイはリポジトリルートの
  `.github/workflows/deploy.yml` が home + tools + games をまとめて行う
  （main → test.hasokon.com/tools/、`v*` タグ → 本番。1タグでサイト全体）

## 技術構成

| 領域 | 選定 | 備考 |
|---|---|---|
| フレームワーク | Next.js 16 (App Router) | `output: 'export'`, `trailingSlash: true` |
| 言語 | TypeScript | **6系に固定**。7系はNext.jsのコンパイラAPI非対応でビルドが落ちる |
| テスト | Vitest | 計算ロジック（純関数）のみを対象 |
| スタイル | 素のCSS（`app/globals.css`） | CSS-in-JSやTailwindは導入していない |
| ホスティング | S3 + CloudFront (OIDC経由でデプロイ) | ルートの deploy.yml |

## ディレクトリ構成

```
app/
  layout.tsx          共通レイアウト（ヘッダ・フッタ・メタ情報）
  page.tsx            トップ（ツール一覧。registryから生成）
  globals.css         全スタイル。ここ以外にCSSを増やさない
  sitemap.ts          registryから自動生成
  privacy/ contact/   AdSense審査に必要な固定ページ
  not-found.tsx       404ページ（out/404.html になる）
  AdUnit.tsx          広告枠。lib/adsense.ts が未設定なら何も出さない
  Analytics.tsx       ページビュー送信。lib/analytics.ts が未設定なら何もしない
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
docs/CONCEPT.md       コンセプトと方針
```

robots.txt と ads.txt はここにはない。ドメイン統合により、どちらも
ドメイン直下の静的ファイル（リポジトリルートの `home/robots.txt`・`home/ads.txt`）で
一元管理している（basePath 配下からは配信しない）。

**AWSの構成は [hasokon-infra](https://github.com/ke-iwata/hasokon-infra)（Terraform）で一元管理。**
コンソールで直接いじらず、hasokon-infra を変更して `terraform apply` する。

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
- ads.txt はドメイン直下の `home/ads.txt`（静的ファイル）だけにある。
  パブリッシャーIDを変えるときは `lib/adsense.ts` と `home/ads.txt` の両方を直すこと
- `ADSENSE_CLIENT` を空にすると、スクリプトも広告枠も出力されなくなる
- **AdSenseのscriptは `app/layout.tsx` の `<head>` に生タグで置く**。`next/script` の
  `afterInteractive` だと静的HTMLにpreloadしか出ず、審査でコードを検出されない可能性があるため
- **計算機より上に広告を置かない**（UX悪化 → 直帰率上昇 → 順位下落を避ける。docs/CONCEPT.md 5参照）

## アクセス解析（Googleアナリティクス）

設定は `lib/analytics.ts` の1箇所。`GA_MEASUREMENT_ID` に測定ID（`G-` から始まる）を
入れるだけで有効になり、空の間はスクリプトも計測処理も一切出力されない。

- **判定が2つあるので取り違えないこと**（[docs/features/measurement-hygiene.md](../docs/features/measurement-hygiene.md)）。
  `isAnalyticsEnabled()` は測定IDの有無だけを見る**ビルド時**の判定で、
  gtag.js の `<script>` を出すかどうかを決める（`app/layout.tsx`）。
  `shouldTrack()` は**ブラウザ**での判定で、`MEASURED_HOST`（`hasokon.com`）以外では false。
  `isAnalyticsEnabled()` にホスト条件を足すと、ビルド時に `window` が無いため
  本番のHTMLからも gtag.js のタグが消える
- **test.hasokon.com と localhost では1件も送らない**。GA4の30日分の page_view の3割が
  開発・テスト環境の分で、レポートが使えなくなっていたため。テスト環境で確かめるときは、
  DevToolsで「送られていないこと」を見る
- **`send_page_view: false` にしてある**。`next/link` の移動は通常のページ読み込みを
  伴わないため、gtagの自動送信では2ページ目以降が記録されない。ページビューは
  `app/Analytics.tsx` が `usePathname` の変化を見て送る（初回も含めてこちらに一本化）
- **`page_path` を GA4 に送り返さないこと。** `usePathname()` は basePath（`/tools`）を
  取り除いたパスを返すため、渡すとGA4上のURLが実際のURLと食い違う。`page_location`
  （`window.location.href`）だけで送る。`usePathname` は移動の検知にだけ使う
  （経緯は [docs/features/ga4-page-path.md](../docs/features/ga4-page-path.md)。
  `tests/analytics.test.ts` が回帰を見張っている）
- **ページビューだけでは「開かれたが使われなかった」が分からない**ので、
  主要な操作で `trackToolUse(slug, action)` を呼んでいる（ルーレットを回す・
  サイコロを振る・グループ分けする・変換結果をコピーする）。
  GA4では `tool_use` イベントに `tool` / `action` パラメータが付く形で集計される
- 新しいツールを足したときは、押して結果が出る操作があれば同じように呼ぶ
- **Cookieを使うのでプライバシーポリシーへの記載が必要**。`app/privacy/page.tsx` の
  「アクセス解析について」に記載済み。オプトアウトの案内も置いている

## SNS共有時のサムネイル（OGP画像）

`lib/registry.ts` の `OGP_IMAGE` を `app/layout.tsx` が `openGraph.images` と
`twitter` に渡していて、**全ページが同じ1枚を使う**（`public/ogp.png`）。
仕様は [docs/features/ogp-image.md](../docs/features/ogp-image.md)、
画像の作り方は [design/ogp/](../design/ogp/)。

- **ページ側で `openGraph` を書くと layout の `images` ごと差し替わる**。
  Next.js のメタデータは入れ子のオブジェクトを浅く上書きするため、
  `openGraph: { url: ... }` とだけ書いたページは og:image を落とす。
  ページ固有の画像を持たせるときは `images` も一緒に書くこと
  （`tests/ogp.test.ts` が app/ 配下を走査して見張っている）
- **URLは絶対URL**。`metadataBase` があるので相対でも動くが、
  出力HTMLを目で確かめにくいので値そのものを絶対URLで持つ
- `twitter` は `openGraph` から画像を引き継がない。`card` と `images` を明示する

## よく踏む落とし穴

- **`app/sitemap.ts` には `export const dynamic = 'force-static'` が必須**。
  `output: 'export'` ではこれがないとビルドが落ちる（同種のメタデータルートを
  足すときも同じ）。robots.txt はルート直下の `home/robots.txt` にあり、ここでは生成しない
- **CloudFront に URL書き換え Function が必要**。`trailingSlash: true` のため全ページが
  `{slug}/index.html` というキーで出力される。S3にはディレクトリの概念がなく `/{slug}/` という
  キーは存在しないので、変換しないと全ページ403になる（hasokon-infra の
  CloudFront Function が変換している）。特定ページ向けの対応ではなく全ページ共通
- **TypeScript を 7系に上げない**（上記のとおりビルドが落ちる）
- **Vitest のエイリアス**は `vitest.config.ts` の `resolve.alias` で `@` を解決している。
  `fileURLToPath(new URL('.', import.meta.url))` を使うこと（`__dirname` はESMで未定義）

## コマンド

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # 計算ロジックのテスト（現在330件）
npm run build    # out/ に静的出力
```

## 運用（定期メンテ）

| 頻度 | 作業 |
|---|---|
| 毎年3〜4月 | `lib/kosodate-shienkin.ts` の `FISCAL_YEARS` を確定値に更新 |
| 毎年3月 | 協会けんぽの料率改定を `lib/hatarakizon.ts` の `HEALTH_RATE` / `KAIGO_RATE` に反映 |
| 等級表の改定時 | `lib/shaho-grades.ts` の `GRADES`（支援金・傷病手当金・働き損の3ツールが参照） |
| 税制改正時 | `lib/nenshu-kabe.ts` の `WALL_DEFS` を更新 |
| 電気料金改定時 | `lib/aircon-denkidai.ts` の単価目安を更新 |
| 月1回 | Search Console でクエリを確認し、伸びているページを強化 |

記事の定期更新は不要。これは意図的な設計です（[docs/CONCEPT.md](./docs/CONCEPT.md) 参照）。

## 現在の状態と次の一手

- 公開済み: https://hasokon.com/tools/ （S3 + CloudFront。hasokon-home のバケットの tools/ 配下に同期）
- ツール15本 / 用途別ルーレット10本 / 使い方の記事6本 / テスト330件
- AdSenseは旧サイトから引き継いだアカウントで配信中（自動広告のみ）
- GA4は計測中（`lib/analytics.ts` に測定ID設定済み。games と同じプロパティ）
- 残り: Search Consoleでのサイトマップ送信、AdSense管理画面へのサイト追加、
  ルートドメイン（home/）にGA4タグを入れるかの判断
- 中長期: 制度改正が出るたびに計算機を追加する（このサイトの本命戦略）

### 制度データの根拠と注意点

- `lib/nenshu-kabe.ts` の金額は**検証済み**（2026年8月）。
  所得税法等の一部を改正する法律（**令和8年法律第12号**・2026年3月31日成立公布）により
  令和8年分から 給与所得控除74万円 / 基礎控除104万円（本則62万＋特例加算42万）となり、
  178万・136万・169万・159万・163万・119万はいずれもこの組み合わせで導出できる。
  なお**国税庁のタックスアンサーは令和7年分の内容のまま**で本改正が未反映なので、
  参照するときに数値が食い違って見えるが誤りではない
- **2026年10月1日に106万円の壁の賃金要件が撤廃される**。撤廃後は金額の壁ではなくなる。
  `WallDef.effectiveFrom` / `effectiveUntil`（暦日）で**施行日を境に自動で切り替わる**ので、
  運営者が手で切り替える作業は不要（切り替え忘れを防ぐための設計。
  経緯は [docs/features/nenshu-kabe-2026-10-wall-removal.md](../docs/features/nenshu-kabe-2026-10-wall-removal.md)）。
  基準日は `KabeInput.asOf`（既定は現在日）。静的書き出しなのでビルド時刻で固定してはいけない。
  `Calculator.tsx` はビルド時刻を初期値にして、マウント後に現在日へ差し替えている
  （サーバ描画とハイドレーションの食い違いを避けるため）
- 加入するかどうかの判定は `evaluateShaho()` が返す。企業規模要件の段階的縮小
  （2027年10月〜2035年10月）は**まだ入れていない**。`effectiveFrom` の仕組みは
  用意してあるので、必要になったら定義を足すだけで済む
- 傷病手当金の端数処理は協会けんぽの実務ベース。健保組合により運用差がある
- 壁ちょうどの年収の扱いは壁ごとに違う（`WallDef.inclusive`）。
  社会保険は「130万円未満」が扶養条件なのでちょうどで該当、税金は超えた分に課税なので非該当

## リリースの約束

ルートの CLAUDE.md を参照。**本番タグは運営者の承認必須**（mainへのpushまでが自律範囲）。
