# CLAUDE.md（learn）

hasokon.com モノレポの `learn/` で作業するAIエージェント・開発者向けのガイドです。
npmコマンドはすべて `learn/` ディレクトリ内で実行します。

## プロジェクト概要

`https://hasokon.com/learn/` で公開する「投資の教科書」。
tools / games と技術構成・運用方針は共通です。**迷ったら tools/CLAUDE.md に従う。**

- 完全静的サイト（Next.js App Router + `output: 'export'`、TypeScriptは6系に固定）
- basePath は `/learn`。dev は 3002番（tools=3000・games=3001 と同時に立てられる）
- 仕様は [docs/features/learn-toshi.md](../docs/features/learn-toshi.md)

**現状：セクションごと公開前。** 全章 `stage` は `wip` / `preview` で `noindex`、
sitemap にも出ません。**ホームからのリンクも張っていません**（運営者の指示）。

## この章立ての前提を壊さないこと

`tools/docs/CONCEPT.md` は「**記事を書き続けられない**」を理由にブログ型を除外しています。
学習セクションはそこにぶつかるので、**乗せ方を変えて両立させて**います。
ここが崩れると、このセクションはサイトの方針に反した重荷になります。

1. **コンテンツをデータとして持つ。** 章は `lib/curriculum.ts`、
   参考文献は `lib/sources.ts` が単一の情報源。本文だけを増やさない
2. **古びる章と古びない章を分ける。** `ChapterDef.volatility` が印。
   `annual` は年1回の点検対象で、いまは第3部（制度と税金）だけ。
   **第1部（原理）に `annual` を混ぜない**（`tests/curriculum.test.ts` が落とす）
3. **ニュースを追いかけない。** 相場の見通し・予想は書かない

**この前提を変えるなら、先に `tools/docs/CONCEPT.md` を直してから。**

## 守ること（金融商品取引法）

**このサイトは投資助言・代理業の登録をしていません。** 越えると登録が要る線なので、
例外を作らないこと。**`tests/compliance.test.ts` が本文を検査して落とします。**

- **個別銘柄を推奨しない。** 「この株を買うべき」「いま買い時」は書かない
- **売買時期を助言しない**
- **断定的判断を提供しない**（金商法38条2号）。「必ず儲かる」「元本は保証」は書かない
- **民間の個別商品名・証券会社名を出さない**（運営者の判断）。
  公的なもの（個人向け国債・NISA・iDeCo・GPIF）と指数（TOPIX・S&P500）は実名。
  実践性は「信託報酬0.1%と1.5%で20年後にいくら差が出るか」のような
  **一般化した数値例**で担保する
- **免責は共通部品が機械的に出す。** ページ側に手書きしない（二重になる）

## 参考文献の出し方

「参考文献はちゃんと明示して」が要望の核なので、出典を後付けの飾りにしません。

- 文献は `lib/sources.ts` にIDつきで定義し、章は `sources={['fsa-nisa', ...]}` で参照する
- ページ下部の一覧は**参照されたIDから自動生成**する。手書きしない
- **未登録のIDを参照するとビルドが落ちる**（`sourceById` が投げる）
- **出典が1件も無い章はテストが落ちる**
- **制度の章（`volatility: 'annual'`）には官公庁の出典が要る**（テストが見張る）
- **文献を先に足して章をあとで書かない。** 参照されていない文献は
  `tests/sources.test.ts` の許容リストに入れる必要があり、書いたら外す
- 一次資料（金融庁・国税庁・財務省・日本証券業協会・投資信託協会・JPX・GPIF）を優先する

## 章の追加手順

1. `lib/curriculum.ts` の該当の章の `stage` を `wip` → `preview` にし、`updatedAt` を入れる
2. `app/{slug}/page.tsx` を作る。**中身は `<Chapter slug="..." sources={[...]}>` で包む**
   （免責・参考文献・前後ナビ・JSON-LD・パンくずはこれが出す）
3. `metadata` に `title` / `description` / `alternates.canonical` /
   **`robots: robotsFor('{slug}')`** を書く（書き忘れは `tests/stage.test.ts` が落とす）
4. **ページ側で `openGraph` を書かない**（layout の og:image ごと差し替わる）
5. 本文で参照した文献を `lib/sources.ts` に足し、`tests/sources.test.ts` の
   許容リストから外す
6. `npm test && npm run build` が通ることを確認

**新しい章を勝手に増やさない。** 全35章は `lib/curriculum.ts` に定義済みで、
これが仕様書の章立てと対応しています。増やすなら仕様書も直すこと。

## 数字を書くときの約束

- **本文に出す計算結果は必ず検算する。** 表の値・平均取得単価・利回りなど。
  この教科書は数字が主役なので、1つ間違えると全体の信頼が落ちる
- **前提を必ず添える**（「税・手数料は考えない」「年利が一定だったら」）。
  複利の表を前提なしで出すと、そうなると約束したように読める
- **過去の実績は将来を約束しない**と併記する

## 画面の約束

tools / games と共通です（[mobile-one-screen.md](../docs/features/mobile-one-screen.md)）。

- **CSSは `app/globals.css` だけ**。新しいファイルを増やさない
- **狭い画面向けの上書きはファイル末尾の `@media (max-width: 600px)` にまとめる**
  （メディアクエリは詳細度を上げないので、途中に置くと後ろの規則に黙って負ける）
- **押す先は44pxを割らない**（前後ナビが該当）
- デザイントークンは tools / games / home と同じ値にする

## コマンド

```bash
npm install
npm run dev      # http://localhost:3002
npm test         # カリキュラム・参考文献・編集方針のテスト
npm run build    # out/ に静的出力
```

**`npm install` が `edgesOut` のエラーで落ちるときは `--legacy-peer-deps` を付ける。**
vitest の新しい版が peer 依存の解決で npm を落とすことがある（`package-lock.json` は
生成済みなので、`npm ci` は素通りする）。

## AdSense / アクセス解析

tools / games と同じ設定（`lib/adsense.ts` / `lib/analytics.ts`）。
広告は**本文より下にだけ**置く。`app/_chapter/Chapter.tsx` が1枠出しています。

## リリースの約束

ルートの CLAUDE.md を参照。**本番タグは運営者の承認必須**（mainへのpushまでが自律範囲）。

公開するときは、`stage` を上げるPRで
`home/index.html`・`home/llms.txt`・`home/sitemap.xml` にも足すこと
（`home/` にはビルド工程が無く `stage` が効かない）。
