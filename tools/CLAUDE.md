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
   `<Breadcrumb /> → h1 → p.lead → <Calculator /> → <AdUnit position="below-tool" /> → 解説 → FAQ → <AdUnit position="below-faq" /> → 出典`
   - `metadata` に `title` / `description` / `alternates.canonical`（`${SITE_URL}/{slug}/`）
   - JSON-LD で `WebApplication` + `FAQPage` + `BreadcrumbList`。
     パンくずは `const trail = breadcrumbFor('{slug}')` を作り、
     `@graph` に `breadcrumbList(trail)`、見出しの直前に `<Breadcrumb trail={trail} />`。
     名前は registry から引かれるので手書きしない
     （[docs/features/breadcrumbs.md](../docs/features/breadcrumbs.md)。
     入れ忘れは `tests/jsonld.test.ts` が落とす）
4. `app/{slug}/Calculator.tsx` — `'use client'`。`useState` で入力を持ち、lib の関数を呼ぶだけ
5. `lib/registry.ts` にエントリを追加。**`stage` は公開してよいと決まるまで
   `'preview'`**（一覧・sitemap・llms.txt から外れ、`noindex` が付く。
   仕様は [docs/features/feature-flags.md](../docs/features/feature-flags.md)）。
   `page.tsx` の `metadata` には `robots: robotsFor('{slug}')` を書く
   （書き忘れは `tests/stage.test.ts` が落とす）。
   一覧は `tools` ではなく **`publicTools`** を通す。
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
npm test         # 計算ロジックのテスト（現在1000件）
npm run build    # out/ に静的出力
```

## 運用（定期メンテ）

| 頻度 | 作業 |
|---|---|
| 毎年2〜3月（翌年分の祝日が公示されたら） | `lib/nissu-keisan.ts` の `HOLIDAYS` に翌年分を内閣府CSVから写して足し、`HOLIDAY_LAST_YEAR` と `HOLIDAY_UPDATED_AT` を直す（写し間違いは `tests/nissu-keisan.test.ts` が祝日法からの導出と突き合わせて落とす） |
| 毎年3〜4月 | `lib/kosodate-shienkin.ts` の `FISCAL_YEARS` を確定値に更新（**支援金・働き損の2ツールに効く**。`hatarakizon.ts` は `status: '確定'` の最新年度を自動で拾うので、あちらは触らない） |
| 毎年3月 | 協会けんぽの料率改定を `lib/hatarakizon.ts` の `HEALTH_RATE` / `KAIGO_RATE` に反映（子ども・子育て支援金率はここに書かない。上の行を参照）。**働き損・手取り計算機の2ツールに効く**（`lib/tedori-keisan.ts` は料率を持たず `calcTakeHome()` を共有している） |
| 令和10年分以後の控除改正時（手取り計算機） | `lib/tedori-keisan.ts` の `TAX_RULES_R7`（改正前との比較対象）を新しい「改正前の年分」に差し替える。控除額そのものは `lib/furusato-nozei.ts`・`lib/nenmatsu-chosei.ts` にあるので、ここには持たない。基礎控除の特例加算42万円は**令和8・9年分だけの時限措置**なので、令和10年分では比較の主題が変わる |
| 等級表の改定時 | `lib/shaho-grades.ts` の `GRADES`（支援金・傷病手当金・働き損・在職老齢年金の4ツールが参照） |
| 毎年度（在職老齢年金） | 支給停止調整額を `lib/zaishoku-rorei-nenkin.ts` の `FISCAL_YEARS` に1行追加（賃金の変動に応じて毎年度改定される） |
| 毎年8月1日（失業保険） | `lib/shitsugyo-hoken.ts` の `BENEFIT_RATE_RULES` / `WAGE_DAILY_MIN` / `BENEFIT_DAILY_MIN` / `TAPER_FROM` を、厚労省が7月末の官報公布後に出す「基本手当日額の計算式及び金額」のPDF（[令和8年8月1日～](https://www.mhlw.go.jp/content/001726936.pdf)）から写し、`RATE_TABLE_LABEL` / `RATE_TABLE_EFFECTIVE_FROM` / `DATA_CHECKED_AT` を直す。**屈折点（80%が終わる額・逓減帯の上端）も毎年動く**ので上限額だけ直さないこと。所定給付日数のテーブルは法律なので毎年は変わらない |
| 拠出限度額の改定時（iDeCo） | `lib/ideco.ts` の `LIMITS` / `SHARED_FRAME_*` / `INNER_CAP_BEFORE`。加入可能年齢は `JOIN_AGE_LIMIT_*` |
| 税制改正時 | `lib/nenshu-kabe.ts` の `WALL_DEFS` を更新 |
| ふるさと納税の年度改定時 | `lib/furusato-nozei.ts` の定数（給与所得控除・基礎控除・所得税の速算表・各控除額）と、`app/furusato-nozei/page.tsx` の**早見表の見出し・title・description の年表記**（「2026年・令和8年分」）。早見表の数値はロジックから生成されるので自動で追随するが、年の文字列だけは追随しない |
| 電気料金改定時 | `lib/aircon-denkidai.ts` の単価目安を更新 |
| 自転車の反則金の改定時 | `lib/jitensha-hansokukin.ts` の `VIOLATIONS`（警察庁の一覧PDFを正とする。自治体サイトには誤りの実例がある）。制度そのものの数値は `SYSTEM` |
| 高額療養費の改正時 | `lib/kogaku-ryoyohi.ts` の `LIMIT_TABLES` に施行月つきの表を1つ足す（令和9年8月の13区分細分化が次） |
| 毎年12月（税制改正大綱が出たら） | セルフメディケーション税制の適用期限を `lib/iryohi-kojo.ts` の `SELF_MED_EXPIRES_AT` / `SELF_MED_CHECKED_AT` に反映（現行の期限は2026年12月31日。延長は令和9年度税制改正待ち）。**画面では「今年で終わり」と断定せず「現時点の期限は〜」と書く**（延長された瞬間に嘘になる文言を置かない）。足切り・上限が変わったら `MEDICAL_THRESHOLD_FIXED` / `MEDICAL_CAP` / `SELF_MED_THRESHOLD` / `SELF_MED_CAP` |
| 就学支援金の限度額改定時 | `lib/koko-jugyoryo.ts` の `SUPPORT_LIMITS`（公立・私立の年額と通信制の1単位あたり）。上限単位数は `UNITS_PER_YEAR_CAP` / `UNITS_TOTAL_CAP` |
| たばこ税率の改正時 | `lib/tabako-zei.ts` の `PHASES` に施行日つきのフェーズを1つ足す（施行日の昇順を保つこと。財務省「たばこ税等に関する資料」・国税庁を正とする）。現行の3段階は2029年4月で終わるので、それ以降の改正が決まるまで追加は不要 |
| 酒税率の改正時 | `lib/shuzei-kaisei.ts` の `STAGES` に段階を1つ足し、`CATEGORIES` の `ratesPerKl` に同じ `StageId` の行を足す（型が全段階を要求するので書き漏れるとビルドが落ちる）。国税庁「酒税率一覧表」を正とする。現行の3段階は2026年10月で完了するので、それ以降の改正が決まるまで追加は不要 |
| 標準算定方式の改定時（養育費） | `lib/yoikuhi.ts` の `BASIC_INCOME_RATES` / `LIVING_COST_INDEX` / `INCOME_LIMIT`（裁判所の司法研究を正とする。現行は令和元年12月改定版）。法務省令が変わったら `STATUTORY_SUPPORT_PER_CHILD` / `LIEN_CAP_PER_CHILD` |
| インボイスの経過措置が改正されたとき | `lib/invoice-nozeigaku.ts` の `YEARS`（年ごとに使える特例）・`SPECIAL_RATES`（2割・3割）・`BUSINESS_TYPES`（みなし仕入率）・`PURCHASE_TRANSITION`（7・5・3割控除）。国税庁のインボイス特設サイトとインボイスQ&Aを正とする。**3割特例は2028年分で終わる**ので、それ以降の措置が決まるまで追加は不要 |
| 官公庁の備蓄目安が改定されたとき | `lib/bosai-bichiku.ts` の `STOCK_ITEMS`（農林水産省「災害時に備えた食品ストックガイド」と東京都「東京備蓄ナビ」を正とする）。**係数を直したら `source` と `basis` も一緒に直すこと**。`basis: 'official'` は一次資料に数値そのものが書かれているものだけに使う |
| 月1回 | Search Console でクエリを確認し、伸びているページを強化 |

記事の定期更新は不要。これは意図的な設計です（[docs/CONCEPT.md](./docs/CONCEPT.md) 参照）。

## 現在の状態と次の一手

- 公開済み: https://hasokon.com/tools/ （S3 + CloudFront。hasokon-home のバケットの tools/ 配下に同期）
- ツール36本（ほかに公開前が2本：`tedori-keisan`（`stage: 'preview'`）・
  `iryohi-kojo`（`stage: 'wip'`））/
  用途別ルーレット10本 / 使い方の記事6本 / テスト1593件
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
- **iDeCoの改正（2026年12月1日施行）は「引き上げ」ではなく「合算ルールへの切り替え」**。
  第2号の上限は `62,000円 −（企業型DCの事業主掛金 ＋ DB等の他制度掛金相当額）`で、
  6.2万円を固定の上限として扱うと企業年金がある人に過大な額が出る。
  施行日の判定は `lib/nenshu-kabe.ts` と同じく暦日の文字列で行い、画面はビルド時刻で
  描画してからマウント後に「開いた日」で評価し直す（`lib/ideco.ts`）。
  新しい額が実際に効くのは2026年12月拠出分（2027年1月引落分）からなので、
  **「いま出せる額」と必ず並べて出すこと**
  （[docs/features/ideco-kyoshutsu-gendogaku.md](../docs/features/ideco-kyoshutsu-gendogaku.md)）
- **養育費は「額の決め方」と「2026年4月の新制度」が別物**。額は裁判所の標準算定方式
  （令和元年12月改定）で、改正民法（令和6年法律第33号）でも変わっていない。
  改正で増えたのは法定養育費（月2万円 × 子の数）と先取特権（月8万円 × 子の数まで）で、
  どちらも法務省令（令和7年法務省令第56号）が額を定めている。
  **法定養育費は2026年4月1日以降に成立した離婚にしか適用されない**（遡及なし。
  先取特権のほうは施行前の取決めでも施行後に生ずる分には及ぶ）。
  **先取特権の上限は月8万円で、取り決めた養育費の全額に及ぶわけではない**。
  この2点は誤解が多いので、画面と解説の両方で独立した見出しにしてある
  （[docs/features/yoikuhi-keisan.md](../docs/features/yoikuhi-keisan.md)）。
  算定表の値を持たず方式を実装しているので、`tests/yoikuhi.test.ts` が
  算定表（表1〜表3）の升目と突き合わせて回帰を見張っている
- **たばこは「加熱式の課税方式見直し」と「税率の引き上げ」が別の改正**。前者は
  紙巻たばこへの本数の換算方法の変更で、2026年4月1日・2026年10月1日の2段階。
  上がり幅が製品の重量と定価で決まるので**一律の金額を出せない**。
  「税額を出してよいか」の判断は `ratesFor(kind, asOf)` に集約してあり、揃う前の加熱式には
  `undefined` を返す（0や紙巻と同額で埋めないこと）。`estimateSpending()` の `rates` は
  **省略できない必須キー**にしてある。既定値を持たせると、画面側が何も書かずに紙巻の税額を
  得てしまうため（実際にそれで加熱式に紙巻の内訳が出る不具合を作った）。後者は
  2027年4月から毎年4月に国たばこ税を1本0.5円ずつ3回で、紙巻・加熱式に共通。
  **増税分は税抜10円/箱だが、たばこ税は消費税の課税対象なので小売価格では11円**。
  将来の小売価格は認可制のため確定せず、画面では必ず「想定」と添える
  （[docs/features/tabako-zei-neage.md](../docs/features/tabako-zei-neage.md)）
- **酒税の2026年10月改正は「一本化」なので、上がるものと下がるものが同時にある**。
  ビール系飲料が1klあたり155,000円に揃うため、ビールは350mlで▲9.10円の**減税**、
  発泡酒（麦芽比率25%未満）・第三のビールは+7.26円、チューハイ等は+7.00円の増税。
  `estimateBurden()` の合計は**マイナスにもなる**ので、絶対値や「増加分だけ」に
  丸めないこと（内訳は `annualIncrease` / `annualDecrease`）。
  第三のビールは税率区分としては2023年10月に発泡酒へ統合済みで、計算機では1つにまとめ、
  早見表には行を残してある。**段階の見出しに「現行」と書かない**（静的書き出しなので
  期間そのものを名前にする）。比較する2つの段階は `BEFORE_STAGE_ID` / `AFTER_STAGE_ID`
  で固定してあり、開いた日で切り替わらない
  （[docs/features/shuzei-kaisei-hayamihyo.md](../docs/features/shuzei-kaisei-hayamihyo.md)）
- **坪・畳は法定計量単位ではない**（面積の法定計量単位は㎡）。1坪 = 400/121㎡ は
  1尺 = 10/33m・1間 = 6尺・1坪 = 1間四方から導ける値で、**分数のまま持ち丸めは表示時だけ**
  （`lib/tsubo-heibei.ts`）。畳は規格ごとに違い、既定は不動産広告と同じ
  「1畳 = 1.62㎡以上」（不動産の表示に関する公正競争規約施行規則）。畳の寸法は
  **mmの整数**で持つこと。メートルの小数で掛けると団地間の1.445㎡が1.44㎡に落ちる
  （[docs/features/tsubo-heibei-jo-henkan.md](../docs/features/tsubo-heibei-jo-henkan.md)）
- **失業保険（基本手当）は「およそ50〜80%」で丸めない。** `lib/shitsugyo-hoken.ts` は
  厚労省「基本手当日額の計算式及び金額」の逓減式をそのまま実装している。
  **60〜64歳だけ逓減帯に算式が2本あり、低いほうを採る**（`y = 0.05w + 12,120×0.4`）。
  片方だけだと賃金日額9,000円あたりで200円ほど過大に出る。給付制限は
  **令和7年4月1日以降の離職なら原則1ヶ月**（「2ヶ月」は旧制度）で、5年内に2回以上の
  自己都合離職と重責解雇は3ヶ月。**教育訓練等による解除は重責解雇には効かない**ので、
  `restrictionFor()` は重責解雇を教育訓練の判定より先に返している。
  **所定給付日数の表（category）・給付制限（reason）・受給資格の被保険者期間の要件は
  独立した3つの軸**で、どれか一つからは導けない（`insuredMonthsRequired()` のコメント参照）
  （[docs/features/shitsugyo-hoken-kihon-teate.md](../docs/features/shitsugyo-hoken-kihon-teate.md)）
- **インボイスは「納税額」より「簡易課税の届出期限」のほうが間違えやすい。**
  原則は「適用したい課税期間の初日の前日」＝個人なら前年12月31日だが、
  2割特例・3割特例からの移行には特則があり、**翌課税期間に係る確定申告期限まで**
  間に合う（平成28年法律第15号の附則51の2⑥・51の3⑤。国税庁 インボイスQ&A 問117）。
  2027年分から簡易課税にするなら2026年12月31日ではなく**2028年3月31日**まで。
  `kaniDeadline()` は原則と特則を必ず両方返す（片方だけ出すと1年損する人が出る）。
  また**3割特例は個人事業者限定で令和9年・10年分の2年間だけ**、
  **第3種（みなし仕入率70%）は3割特例と同率**で「安い」ではない
  （[docs/features/invoice-2wari-tokurei-shuryo.md](../docs/features/invoice-2wari-tokurei-shuryo.md)）
- 傷病手当金の端数処理は協会けんぽの実務ベース。健保組合により運用差がある
- 壁ちょうどの年収の扱いは壁ごとに違う（`WallDef.inclusive`）。
  社会保険は「130万円未満」が扶養条件なのでちょうどで該当、税金は超えた分に課税なので非該当

## リリースの約束

ルートの CLAUDE.md を参照。**本番タグは運営者の承認必須**（mainへのpushまでが自律範囲）。
