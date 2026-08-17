# CLAUDE.md（games）

hasokon.com モノレポの `games/` で作業するAIエージェント・開発者向けのガイドです。
npmコマンドはすべて `games/` ディレクトリ内で実行します。

## プロジェクト概要

`https://hasokon.com/games/` で公開する無料ミニゲーム集。
同じモノレポの `tools/` と技術構成・運用方針はすべて共通。
**迷ったら tools/CLAUDE.md に従う。**

- 完全静的サイト（Next.js App Router + `output: 'export'`、TypeScriptは6系に固定）
- ゲームはすべてクライアントサイドで動く。サーバーもDBもない
- ホスティングは S3 + CloudFront。mainへのpushでGitHub Actionsがデプロイ

## 設計上の約束

1. **ゲームロジックとUIを分離する** — ロジックは `lib/{slug}.ts` の純関数
   （ブロック崩しの物理も含む）。`Game.tsx` は入力と描画だけ。
   これによりロジックがテストできる（現在291件）
2. **`lib/registry.ts` が単一の情報源** — トップ一覧・sitemapはここから生成
3. **CSSは `app/globals.css` だけ** — 新しいファイルを増やさない
   （記録の帯は `.rec-strip` / `.rec-note` / `.rec-best`）
4. **名称の商標に注意する**（このリポジトリ固有の約束）
   - 「数独」はニコリの登録商標 → **ナンプレ**と呼ぶ
   - 「オセロ」は登録商標（リバーシと呼ぶ）。「ソリティア」「スパイダーソリティア」
     「マインスイーパー」「2048」はジャンルの一般名称として広く使われている
   - 「テトリス」も商標。ゲームのルール自体は著作権で保護されないが、
     名称・ロゴ・固有のビジュアル表現の模倣は避ける。
     新しいゲームを足すときは必ず名称の商標を確認すること

## 画面の約束（全ゲーム共通）

運営者からの指摘を直すたびに同じ罠を踏んでいるので、**次に足すゲームでも最初から
守ること**。仕様は [mobile-one-screen.md](../docs/features/mobile-one-screen.md) と
[cpu-speed.md](../docs/features/cpu-speed.md)。

### 大きさ・レイアウト

1. **盤面は動かさない。** 文言や札の枚数で伸び縮みする場所は、`min-height` ではなく
   **`height` で「何行ぶん」を確保する**（`line-height` を明示し、あふれは
   `overflow: hidden` か `auto`）。`min-height` は下限しか決めないので、
   1行が2行に増えた瞬間に下が全部ずれる。
   条件付きで行ごと出し入れするのも同じ理由で禁止（空でも枠は置く）
2. **盤の大きさは幅だけでなく画面の高さからも決める。**
   `max-width: min(var(--board-max), max(200px, calc(100dvh - var(--chrome))))`。
   盤は正方形なので幅を抑えれば高さも縮む。`--chrome` は盤以外が使う高さの実測値、
   `--board-max` は広い画面での上限。
   **盤の規則で `max-width` を書き直さない**（同じ詳細度の後勝ちで無効になる）。
   **`Game.tsx` から `maxWidth` をインラインで渡さない**（インラインが勝って
   高さの制限ごと消える）。可変の上限は `--board-max` を渡す
3. **狭い画面向けの上書きは `app/globals.css` の末尾の
   `@media (max-width: 600px)` にまとめる。** メディアクエリは詳細度を上げないので、
   ファイルの途中に置くと後ろの通常の規則に**黙って負ける**
4. **押す先は44pxを割らない。** 詰めるときの下限はここ。
   割りそうなら、詰めるのをやめるか折り返しの段数を減らす方を選ぶ
5. **設定は隠さない。** まず1つを小さくして段数を減らす。畳んでよいのは、
   毎局は変えないルール設定が多すぎる場合だけ（大富豪の `.df-rules`、
   花札の `.hf-rules`）。スタート・先手後手の選択は畳まない

### 状態と表示

6. **1つの札・駒は、どの瞬間も画面の1か所にだけ出す。**
   花札で「めくった札」の枠と場の両方に同じ札が出ていたのはこの違反
7. **表示の出し分けは局面（`phase`）で決める。残っているデータの有無で決めない。**
   `lastDrawn` のような「直前に何をしたか」の目印は用が済んでも残す設計になりがちで、
   それで出し分けると、済んだあとも出たままになる
8. **途中の状態を見せたいなら、局面を1つ足して手を2つに割る。**
   ロジック側（`lib/`）は純関数のまま「めくる」「移す」を別の関数にし、
   `Game.tsx` があいだの間（ms）を持つ。速さの倍率は `delayFor` に通す
9. **局面を足したら不変条件のテストを直す。** 「48枚そろっている」のような確認は、
   どこにも属していない札が増えると落ちる（落ちるのが正しい。数え漏れを教えてくれる）

### 測り方

**目で見て「収まっていそう」は当てにならない。** `npm run dev` して Playwright で
端末幅を作り、`main .card` の高さを実測する。レイアウトのずれも、
手を進めながら高さを測れば一発で出る（記録の帯の行間 `gap` が効いていたのも実測で判明）。

## ゲームの追加手順

1. `lib/{slug}.ts` — ロジックを純関数で実装（乱数は注入できる形にしてテスト可能に）
2. `tests/{slug}.test.ts` — 境界値・進行・終了条件を必ず入れる
3. `app/{slug}/Game.tsx`（'use client'）と `app/{slug}/page.tsx`
   （metadata / JSON-LD(VideoGame + FAQPage + BreadcrumbList) / パンくず /
   遊び方 / FAQ / AdUnit×2 / 他のゲーム一覧）
   - パンくずは `const trail = breadcrumbFor('{slug}')` を作り、`@graph` に
     `breadcrumbList(trail)`、見出しの直前に `<Breadcrumb trail={trail} />`。
     名前は registry から引かれるので手書きしない
     （[docs/features/breadcrumbs.md](../docs/features/breadcrumbs.md)。
     入れ忘れは `tests/jsonld.test.ts` が落とす）
4. `lib/registry.ts` にエントリを追加。**`stage` は公開してよいと決まるまで
   `'preview'`**（一覧・sitemap・llms.txt から外れ、`noindex` が付く。
   仕様は [docs/features/feature-flags.md](../docs/features/feature-flags.md)）。
   `page.tsx` の `metadata` には `robots: robotsFor('{slug}')` を書く
   （書き忘れは `tests/stage.test.ts` が落とす）。
   トップの一覧は `games` ではなく **`publicGames`** を通す
5. 記録（ベスト・勝敗・クリアタイム）を付ける。`lib/records.ts` と
   `app/_records/Records.tsx`（`useRecords` / `useStopwatch` / `RecordStrip`）を使い、
   **ゲームごとに個別の localStorage キーを作らない**
   （[docs/features/game-records.md](../docs/features/game-records.md)）
6. `npm test && npm run build` が通ることを確認

## AdSense / アクセス解析

- `lib/adsense.ts`（tools と同じパブリッシャーID・配信中）。
  **AdSense管理画面に hasokon.com/games/ のサイト追加が必要**
- `lib/analytics.ts` の `GA_MEASUREMENT_ID` は設定済み（tools・home と同じID）。
  ドメイン統合で1プロパティに集約したため、games だけを見るときは
  GA4のレポートでページパス（`/games/`）で絞り込む
- 主要な操作で `trackToolUse(slug, action)` を呼ぶ（開始・クリア・勝敗など実装済み）
- **判定が2つあるので取り違えないこと**（[docs/features/measurement-hygiene.md](../docs/features/measurement-hygiene.md)）。
  `isAnalyticsEnabled()` は測定IDの有無だけを見る**ビルド時**の判定で、
  gtag.js の `<script>` を出すかどうかを決める（`app/layout.tsx`）。
  `shouldTrack()` は**ブラウザ**での判定で、`MEASURED_HOST`（`hasokon.com`）以外では false。
  `isAnalyticsEnabled()` にホスト条件を足すと、ビルド時に `window` が無いため
  本番のHTMLからも gtag.js のタグが消える
- test.hasokon.com と localhost では1件も送らない（GA4の3割がこの分だった）。
  テスト環境で計測を確かめたいときは、DevToolsで「送られていないこと」を見る
- **`page_path` を GA4 に送り返さないこと。** `usePathname()` は basePath（`/games`）を
  取り除いたパスを返すため、渡すとGA4上のURLが実際のURLと食い違う。`page_location`
  （`window.location.href`）だけで送る。`usePathname` は移動の検知にだけ使う
  （経緯は [docs/features/ga4-page-path.md](../docs/features/ga4-page-path.md)。
  `tests/analytics.test.ts` が回帰を見張っている）

## 「ホーム画面に追加」（Webアプリマニフェスト）

`app/manifest.ts` が `/games/manifest.webmanifest` を書き出し、`app/layout.tsx` の
`metadata.manifest` が全ページの `<head>` にリンクを出す。
仕様は [docs/features/games-pwa-manifest.md](../docs/features/games-pwa-manifest.md)。

- **マニフェストの中身に basePath は付かない。** `start_url` / `scope` / `icons[].src` は
  自分で `/games/` から書く（Next.js が補正するのは `<link rel="manifest">` の
  href だけ）。付け忘れるとアイコンが404になり、インストール導線ごと出なくなる
- **`metadata.manifest` はルート相対のまま書く**（絶対URLにすると
  test.hasokon.com から本番のマニフェストを読みに行き、scope 外で弾かれる）
- アイコンPNGは `public/icons/` にあり、原典は
  [design/manifest-icons/](../design/manifest-icons/)。**直接編集せず、スクリプトを回す**
- **Service Worker は入れない**（仕様書の「やらないこと」）。静的サイトで
  古いHTMLがキャッシュに残り続ける事故のリスクが利益を上回る
- ホーム画面からの起動は `start_url` の `utm_source=homescreen` で数える。
  効果を見るときはGA4でこの参照元を絞り込む
- テストは `tests/manifest.test.ts`（中身）と
  `scripts/test/manifest-icons.test.mjs`（アイコンの実ファイル）の2本

## SNS共有時のサムネイル（OGP画像）

`lib/registry.ts` の `OGP_IMAGE` を `app/layout.tsx` が `openGraph.images` と
`twitter` に渡していて、全ページが同じ1枚を使う（`public/ogp.png`。
tools と地の色を反転させて見分けられるようにしている）。
仕様は [docs/features/ogp-image.md](../docs/features/ogp-image.md)、
画像の作り方は [design/ogp/](../design/ogp/)。**tools と同じ約束**：

- **ページ側で `openGraph` を書くと layout の `images` ごと差し替わる**
  （`tests/ogp.test.ts` が app/ 配下を走査して見張っている）
- URLは絶対URL。`twitter` は `openGraph` から画像を引き継がないので `card` と `images` を明示する

## インフラ

AWSリソース（S3 / CloudFront / Route53 / IAM）は
[hasokon-infra](https://github.com/ke-iwata/hasokon-infra)（Terraform）で管理。

デプロイはリポジトリルートの `.github/workflows/deploy.yml` が
home + tools + games をまとめて行う:
- main にマージ → test.hasokon.com/games/（Basic認証つきテスト環境）
- `v*` タグ → hasokon.com/games/（本番。1タグでサイト全体）

**AWSはコンソールで直接いじらない**。hasokon-infra（Terraform）にPRを出す

## コマンド

```bash
npm install
npm run dev      # http://localhost:3001（tools と同時起動できるよう3001）
npm test         # ゲームロジックのテスト
npm run build    # out/ に静的出力
```

## リリースの約束

ルートの CLAUDE.md を参照。**本番タグは運営者の承認必須**（mainへのpushまでが自律範囲）。
