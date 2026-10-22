# 一覧ページ 3 枚（`/tools/`・`/games/`・`/learn/`）の title・description を今の中身に合わせる — `/games/` は 6 本だった 2026-08 の「ナンプレ・ブロック崩しをブラウザで」のまま（いまは 27 本）、`/learn/` は「学ぶ｜hasokon.com」で分野名すら入っていない。数は registry・curriculum から出し、名前を挙げたものが `public` かをテストで見張る

**状態**：提案（2026-10-22 起票。セッション `session_01EUdU4MfuqkFbEnBGiFtGLc`）
**優先度：中。** 計算・法対応の誤りではないが、検索結果と AI 回答に出る**一覧ページの見出しが中身と食い違っている**。直すのは文字列と小さなテストだけで、工数に対して効きが大きい。
**着手条件**：なし。**公開条件**：実装 PR のマージで test.hasokon.com に出る。次の `v*` タグで本番。`stage` は動かさない。
**対象**：`games/app/layout.tsx`（`title.default`・`description`）・`tools/app/layout.tsx`（同）・`learn/app/page.tsx`（`title`・`description`）・
各アプリの `tests/`（下「テスト」）・`games/README.md`（冒頭の紹介文。任意）
**起票**：2026-10-22
**関連**：[self-canonical-coverage.md](./self-canonical-coverage.md)（一覧ページの `metadata` に canonical だけを書き、title は layout の既定値を使う、と決めた仕様書）・
[home-findability.md](./home-findability.md)（ホームから一覧への導線）・[yahoo-ai-search-referral.md](./yahoo-ai-search-referral.md)（AI 回答からの流入）・[learn-toshi.md](./learn-toshi.md)

---

## 背景と根拠

### いまの title・description（2026-10-22 に本番の HTML を取得して確認）

| ページ | title | description | 中身 |
|---|---|---|---|
| `/games/` | 無料ミニゲーム集｜**ナンプレ・ブロック崩し**をブラウザで | インストール不要・登録不要でそのまま遊べる無料ミニゲーム集。**ナンプレ・ブロック崩しなど**をブラウザだけで。 | `public` **27 本**（ソリティア 6 種・リバーシ・五目並べ・大富豪・七並べ・花札こいこい・麻雀ソリティアなど） |
| `/tools/` | 無料計算ツール集｜年収の壁・支援金・電気代などをすぐ計算 | 子ども・子育て支援金計算機など、暮らしと仕事に役立つ無料のWebツール集。… | `public` **68 本** |
| `/learn/` | **学ぶ｜hasokon.com** | hasokon.com の学習ページ。いまは投資を体系的に学べる全37章の教科書があります。… | 投資の教科書 全 37 章 |

- `/games/` の文言は、ゲームが 6 本（ソリティア・スパイダー・マインスイーパー・2048・ナンプレ・ブロック崩し）だった 2026-08 のもの（game-freecell.md の背景に同じ 6 本の記述）。
  ページ本文のリード（`games/app/page.tsx`）はすでに「ソリティア・ナンプレ・リバーシ・花札などの定番」に直っているのに、**title と description だけが取り残されている**
- `/tools/` の「年収の壁・支援金・電気代」は第 1 弾のころの主力。いまの着地の上位（下）とずれている
- `/learn/` の title は **キーワードが 1 つも無い**（「学ぶ」はセクション名、「hasokon.com」はドメイン）。CLAUDE.md のとおり `SITE_NAME` を分野名にしてはいけないが、**title の後ろ半分は分野名を書ける**

### 計測値（GA4 プロパティ 548154955、直近 28 日。2026-10-22 取得）

- 着地の上位：`/tools/tabako-zei-neage/` 340 PV・`/tools/shuzei-kaisei/` 191・`/tools/nenrei-keisan/` 170・`/tools/furusato-nozei/` 134・`/tools/yoikuhi-keisan/` 104・`/tools/saitei-chingin/` 95
- 一覧ページ：`/games/` 62 PV（14 ユーザー）・`/tools/` 16 PV（7 ユーザー）。`/learn/` は上位 40 に入らない
- ゲームで Bing から着地しているのは `/games/freecell/` 12・`/games/reversi/` 11 など個別のページで、**一覧ページへのオーガニック着地はほぼ無い**。一方、`/games/reversi/` は 9 ユーザーで延べ約 6.6 時間、`/games/daifugo/` は 3 ユーザーで 35 PV と、来た人はよく遊んでいる
- オーガニックは Bing と Yahoo! の AI 回答（`openai`）がほぼ全部。Search Console は表示 4・クリック 0（google-index-recovery.md の状態のまま）。
  **Bing は title とクエリの語の一致を強く見る**ので、「ソリティア 無料」「リバーシ 無料」のような一覧向けの語に、いまの `/games/` の title はかすりもしない

---

## 提案する仕様

### 1. `/games/`（`games/app/layout.tsx`）

- **title.default**：`無料ミニゲーム集｜ソリティア・リバーシ・大富豪・ナンプレ`（全角 28 字。検索結果に出る 30 字前後に収める）
  - 選び方：`public` のゲームのうち、Bing の着地と滞在の実績があるもの（フリーセル・リバーシ・大富豪）と、検索量の大きい定番（ソリティア・ナンプレ）。フリーセルはソリティアに含めて書く
- **description**：registry から本数を入れて組み立てる
  `インストール不要・登録不要で遊べる無料ミニゲーム${publicGames.length}本。ソリティア（クロンダイク・スパイダー・フリーセル）、リバーシ・五目並べ、大富豪・七並べ・花札こいこい、ナンプレ・ノノグラム、マインスイーパー・2048など。CPU対戦つき、スマホ対応。`
- `games/app/page.tsx` の「title / description は layout.tsx の既定値をそのまま使う」は変えない（self-canonical-coverage.md の判断のまま。layout の既定値を直す）

### 2. `/tools/`（`tools/app/layout.tsx`）

- **title.default**：`無料計算ツール集｜年齢・ふるさと納税・養育費・最低賃金をすぐ計算`（全角 31 字）
  - 選び方：直近 28 日の着地の上位から、**時期で古びない**もの。たばこ税・酒税は着地 1・2 位だが「値上げ」は 2029 年で終わる語なので title には入れず、description に回す
- **description**：`年齢計算・ふるさと納税・養育費・最低賃金・たばこ税と酒税の改正など、暮らしと仕事のお金を計算する無料ツール${publicTools.length}本。すべてブラウザ内で完結し、入力データは送信されません。`

### 3. `/learn/`（`learn/app/page.tsx`。layout の既定値は触らない）

- **title**：`` `${SITE_NAME}｜投資の教科書（全${publicChapters.length}章）株式・投資信託・NISAの仕組み` ``
  - `SITE_NAME`（学ぶ）は変えない。パンくずは今のまま
  - 「全◯章」は**文字で書かずに `publicChapters` から出す**（章を足すたびに直し忘れる。いまの description の「全37章」も同じ形に直す）
- **description**：`株式・債券・投資信託・NISA・iDeCoの仕組みを、全${n}章で体系的に学べる無料の教科書。記述の根拠は各章の末尾に、一次資料へのリンクつきで並べています。`
  - `learn/tests/compliance.test.ts` の禁止語（民間の個別商品名・証券会社名・断定）に当たらないこと。NISA・iDeCo は制度名なので可
  - 分野が 2 つ以上になったら、title の後ろ半分を「投資・◯◯を一次資料つきで」に変える（そのときは subjects から組み立てる）

### 4. 名前を挙げたものが `public` かを見張る

title・description に**名前を書いたゲーム・ツールが `wip`／`preview` に戻ったり消えたりすると、一覧に無いものを見出しで約束する**ことになる。

- 名前は配列（`HUB_TITLE_GAMES = ['solitaire', 'reversi', 'daifugo', 'nanpre']` のように slug で）に持ち、文字列は registry の `name` から組み立てる。
  description の例示も同じく slug の配列から（`花札 こいこい` は registry の `name` のまま出すか、表示用の短い名前を持つかは実装で決める）
- テスト：配列の slug がすべて `publicGames` / `publicTools` に入っていること

---

## テスト

- `games/tests/`：`metadata.title.default` に「ナンプレ・ブロック崩し」が無い／名前を挙げた slug がすべて `public`／description の本数が `publicGames.length` と一致
- `tools/tests/`：同様（名前を挙げた slug がすべて `public`・本数の一致）
- `learn/tests/`：title と description の「全◯章」が `publicChapters.length` と一致（`curriculum.test.ts` の「全◯章」の見張りに足す）。`compliance.test.ts` が通る
- 既存の `stage.test.ts`・`llms.test.ts`・`scripts/test/home-nav.test.mjs` が通る

## やらないこと

- **一覧ページへの `ItemList` の構造化データ**：Google の一覧のリッチリザルトはレシピ・コースなど特定の型だけで、ゲーム・ツールの一覧では出ない。Bing にも効く根拠が見つからなかったので足さない
- **個別のツール・ゲームの title の見直し**：別件。個々のページは定期の点検（kokai-tool-seikaku-*.md）で扱う
- **ホーム（`home/index.html`）の title**：「hasokon｜無料の計算ツール・ミニゲーム・アプリ」で中身と合っている
- **title の接尾辞にサイト名を戻すこと**：layout のコメントどおり、認知がつくまで keyword に回す判断を維持する

## 期待される効果

- Bing で「ソリティア 無料」「リバーシ 無料 ブラウザ」「投資 教科書 無料」「無料 計算ツール」のような**一覧向けの語**に、一覧ページが候補に入る。個別ページに着地した人の 2 本目への回遊の入口も同じページ
- Yahoo! の AI 回答（直近 28 日でオーガニックの約 4 分の 1）は description を要約に使うことが多く、「27 本」「全 37 章」の具体的な数が引かれやすい
- 数を registry から出すので、**ゲーム・ツール・章を足すたびに一覧の文言が自動で正しくなる**（今回のような取り残しが起きない）
- 測り方：公開 4 週間後に GA4 で `/games/`・`/tools/`・`/learn/` のオーガニック着地（いまはほぼ 0）と、一覧から個別ページへの遷移数

## 工数の見積り（消費トークン数）

約 **25k トークン**

| 作業 | 目安 |
|---|---|
| 3 ファイルの title・description（registry・curriculum から組み立て） | 約 8k |
| テスト 3 本（名前の slug が `public`・数の一致・禁止語） | 約 10k |
| ビルドして 3 枚の `<title>`・`<meta name="description">` を確かめる | 約 5k |
| `games/README.md` の紹介文（任意） | 約 2k |

## 出典・確認したもの（2026-10-22）

- 本番の HTML：https://hasokon.com/games/ ・ https://hasokon.com/tools/ ・ https://hasokon.com/learn/ の `<title>` と `<meta name="description">`
- `games/lib/registry.ts`（`public` 27 本）・`tools/lib/registry.ts`（`public` 68 本）・`learn/lib/curriculum.ts`
- GA4 Data API（プロパティ 548154955）の `pagePath`・`landingPage × sessionSource`（直近 28 日）、Search Console の検索アナリティクス（2026-09-22〜10-20）
