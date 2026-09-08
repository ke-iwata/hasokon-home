# CLAUDE.md

hasokon.com のモノレポで作業するAIエージェント・開発者向けのガイドです。
2026年8月に hasokon-tools / hasokon-games を統合しました（旧リポジトリはアーカイブ済み。
全履歴はこのリポジトリに取り込んであります）。

## 構成

```
home/    hasokon.com のポータル（素の静的HTML。ビルドなし）
tools/   hasokon.com/tools/  無料計算ツール集（Next.js静的エクスポート）→ tools/CLAUDE.md
games/   hasokon.com/games/  無料ミニゲーム集（Next.js静的エクスポート）→ games/CLAUDE.md
learn/   hasokon.com/learn/  学ぶ（分野ごとの読み物。Next.js静的エクスポート）→ learn/CLAUDE.md
docs/    サイト横断のドキュメント（各アプリ固有の docs は各ディレクトリ配下）
infra/   ポインタのみ。AWSは hasokon-infra リポジトリ（Terraform）で管理
```

- tools / games / learn で作業するときは、それぞれの `CLAUDE.md` に従う。
  npmコマンドはすべて各ディレクトリ内で実行する（ルートに package.json はない）
- **home/ はS3バケット直下にそのまま同期される。** サイトの成果物以外
  （開発用ドキュメント・設定ファイル）を home/ に置かないこと

## デプロイ

`.github/workflows/deploy.yml` が home + tools + games + learn をまとめて扱う:

- main にマージ → **test.hasokon.com**（Basic認証つきテスト環境）
- `v*` タグを push → **hasokon.com**（本番）。1つのタグでサイト全体がリリースされる

同期先は S3 バケット（hasokon-com / hasokon-com-test）で、
home/ → バケット直下、tools/out/ → tools/、games/out/ → games/、learn/out/ → learn/。
CloudFront・証明書・IAMロールは [hasokon-infra](https://github.com/ke-iwata/hasokon-infra)
（Terraform）で一元管理。コンソールで直接いじらず、hasokon-infra にPRを出す。

## コミット・PRタイトルの約束

- `docs:` プレフィックスは、**変更が docs/ 配下（機能提案・実装の記録など）だけに
  収まる場合にのみ**使う。CLAUDE.md・コード内コメント・README の修正を含むときは
  `docs:` にしない（整理・雑務なら `chore:`、機能追加なら `feat:`、修正なら `fix:`）

## docs更新とコンフリクトの約束（並走ブランチ対策）

機能実装が並走しても docs がコンフリクトしないための運用。
詳細は [docs/README.md](./docs/README.md) の「並走ブランチとコンフリクトの約束」。

- **DECISIONS.md（ルート・tools・games）は union マージ**（`.gitattributes`）。
  新しいエントリは冒頭の `---` 直下に**1つの自己完結したブロック**として足し、
  **既存エントリの本文を同じPRで書き換えない**（unionは行単位で黙って統合するため）。
  マージ後にエントリの順序がずれていたら手で直してよい
- **docs/features/README.md に一覧・状態の表を復活させない**。状態は各仕様書冒頭の
  `**状態**：` 行だけで管理し、仕様書の追加・更新で README は触らない

## 公開の段階（フィーチャーフラグ）

`games` / `tools` の `lib/registry.ts`（`learn` は `lib/curriculum.ts`）の `stage` が、
**そのツール・ゲーム・章を公開するかどうかの唯一の切り替え**。仕様は
[docs/features/feature-flags.md](./docs/features/feature-flags.md)。

| stage | 一覧・sitemap・llms.txt | `robots` | URLを直接叩くと |
|---|---|---|---|
| `wip` / `preview` | 出さない | `noindex` | **見える**（秘密にはできない） |
| `public` | 出す | 既定 | 見える |

- **一覧を出すときは `publicGames` / `publicTools` / `publicSubjects` / `publicChapters` を通す。**
  `games` / `tools` / `subjects` / `chapters` を直に `filter` しない（書き忘れが公開事故になる）
- **ページの `metadata` に `robots: robotsFor('<slug>')` を書く**
  （書き忘れは `{games,tools,learn}/tests/stage.test.ts` が落とす）
- **`home/index.html` のカードと `home/llms.txt` の行は、`public` にするPRで足す。**
  `home/` にはビルド工程が無いので `stage` が効かない。ここだけは運用で守る
- **テスト環境のトップにだけは、公開前のものも「本番未公開」の印つきで並ぶ**
  （`scripts/build-test-home.mjs` がデプロイ時に差し込む。本番のデプロイは通らない）。
  仕様は [docs/features/test-home-unreleased.md](./docs/features/test-home-unreleased.md)。
  **生成結果を `home/index.html` にcommitしないこと**（本番のトップから
  `noindex` のページへリンクすることになる。`scripts/test/build-test-home.test.mjs` が落とす）
- **フラグは「まだ公開していない」ためのもの。** 一度公開したものを引っ込めるのは
  別の作業（URLがインデックスされているので、消すと404になる）
- **フラグは腐る。** 仕様書の `**状態**：` 行に「いつ `public` にするか」を書き、
  公開するPRで `stage` を上げる

## 学習セクション（learn/）

`hasokon.com/learn/` の「学ぶ」。tools / games と違い**読み物**なので、
別の約束がいくつかある。詳細は [learn/CLAUDE.md](./learn/CLAUDE.md) と
[docs/features/learn-toshi.md](./docs/features/learn-toshi.md)。

- **URLは分野を1段挟む。** `/learn/`（分野の一覧）→ `/learn/{subject}/`（その分野の目次）
  → `/learn/{subject}/{slug}/`（章）。**学習セクションを投資に限定しないため。**
  URLの組み立ては `chapterPath()` / `subjectPath()` を通すこと（各ページで継ぎ足さない）
- **`SITE_NAME` はセクション名（「学ぶ」）で、分野名ではない。**
  ここを分野名にすると、パンくずが「投資の教科書 ＞ 投資の教科書」になる

- **`tools/docs/CONCEPT.md` はブログ型を除外している**（「記事を書き続けられない」）。
  学習セクションはそこに真っ向からぶつかるので、**コンテンツをデータとして持つ**
  ことで両立させている。章は `lib/curriculum.ts`、参考文献は `lib/sources.ts`。
  **この前提を崩す（本文を場当たりに増やす）なら、CONCEPT.md のほうを先に直すこと**
- **投資助言・代理業の登録はしていない。** 個別銘柄の推奨・売買時期の助言・
  断定的判断（金商法38条2号）は書かない。民間の個別商品名・証券会社名も出さない。
  **`learn/tests/compliance.test.ts` が本文を検査して落とす**
- **出典のない章を作らない。** `learn/tests/sources.test.ts` が落とす
- **2026-09-07に「投資の教科書」を公開した（いまは全37章）。** ホームからのリンク
  （`index.html` のヒーローと学ぶの節・`404.html` のカード）、`llms.txt` の39行、
  `sitemap.xml` の4本目が入っている。
  章を増やしたら**ホームの「全◯章」も直す**（`scripts/test/home-nav.test.mjs` が落とす）

## リリースの約束

**本番へのリリース（v* タグ）は運営者の承認が必要。AIエージェントは自発的にリリースしないこと。**

1. main への push（テスト環境への反映）までは自律的に行ってよい
2. テスト環境のURLと確認ポイントを運営者に提示する
3. 運営者の明示的な指示（「リリースして」等）を得てから、Actions の
   `release.yml` を起動する。バージョンを渡すと、タグ作成 → GitHub Release公開 →
   本番デプロイまで自動で行われる（運営者が自分でタグを打ってもよい）
4. AIエージェントのgit認証はブランチのpushのみでタグを直接pushできない。
   リリースは必ず `release.yml` か運営者の手で行う

テスト環境の Basic認証: hasokon / preview2026

## home/ の注意

- ads.txt は AdSense 用。tools/games 側の `lib/adsense.ts` と内容を揃えること
- GA4のタグは `index.html` / `404.html` の2枚に入っていて、中身は `analytics.js` に集約。
  測定IDと送信先ホスト（`hasokon.com`）は tools/games の `lib/analytics.ts` と揃えること
  （`scripts/test/home-analytics.test.mjs` がずれを検知する）。
  仕様は [docs/features/measurement-hygiene.md](./docs/features/measurement-hygiene.md)
- `index.html` / `404.html` のサイト一覧は、ツールやゲームを増やしたら両方更新する。
  **読み物（learn）は1ページ1機能の一覧ではないので、カードの並びにせず入口を1つ置いている。**
  `.quicknav` はカード一覧への近道なので載せていない（`scripts/test/home-nav.test.mjs` 参照）
- `llms.txt` は AIアシスタント向けのサイト案内（[llmstxt.org](https://llmstxt.org/) 形式）。
  ツールやゲームを増やしたら、`index.html` / sitemap と同じように1行足す
  （`scripts/test/llms-txt.test.mjs` が registry との食い違いを検知する）。
  仕様は [docs/features/llms-txt.md](./docs/features/llms-txt.md)
- `sitemap.xml` はインデックス形式で home / tools / games / learn の4本を指す。
  home のページを増やしたら `sitemap-home.xml` を更新する
- ファビコン（favicon.ico / icon.svg / apple-touch-icon.png）はドメイン直下に置いてあり、
  tools/games のページもブラウザのフォールバックでこれを使う
- SNS共有時のサムネイル（`ogp.png`）は home / tools / games / learn に1枚ずつあり、
  原典は `design/ogp/gen-ogp.mjs`。**PNGを直接編集せず、スクリプトを回して差し替える**。
  `og:image` は必ず絶対URLで書くこと（相対パスを解決できないクローラーが多い）。
  仕様は [docs/features/ogp-image.md](./docs/features/ogp-image.md)
