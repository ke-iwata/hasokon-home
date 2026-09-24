# AIアシスタント経由の流入が 1 → 68 セッションに増えた — 本命チャネルとして計測し、llms.txt を実測に合わせて直す

**状態**：**A・B（B-1／B-2／B-2b／B-2c／B-3／B-4）を実装済み**（2026-09-24。本番反映はタグリリース待ち）。
C（AIクローラーが実際に取れているかの集計）は [hasokon-infra #15](https://github.com/ke-iwata/hasokon-infra/pull/15)
のマージ待ちで**未着手**。起票は2026-09-24／2026-09-25 レビュー反映。
コード変更は `home/llms.txt`・各アプリの `lib/llms.ts` と `app/llms.txt/route.ts`（新規）・
`scripts/`（`ga4-ai-channel.mjs`・`lib/ga4.mjs`）・`learn/tests/compliance.test.ts` に閉じている
**対象**：`home/llms.txt`・`tools/` `games/` `learn/` の `app/llms.txt/route.ts`（新規）・`scripts/`（週次レポートへの計測追加）・`learn/tests/compliance.test.ts`（B-4）
**起票**：2026-09-24
**緊急度**：中〜高。**落ちているチャネルの立て直しではなく、いま伸びているチャネルへの投資**。
Google 登録が 128 URL 中 1 件で止まっている（[google-index-recovery.md](./google-index-recovery.md)）あいだ、
このサイトの流入は Bing と AI アシスタントで持っている

---

## 背景と根拠

### 計測値（2026-09-24 取得・GA4 Data API `runReport`、`properties/548154955`）

チャネル別セッション。直近28日（2026-08-27〜09-23）と、その前の28日（2026-07-30〜08-26）を並べた。

| チャネル | 直近28日 | 前の28日 | 変化 |
|---|---:|---:|---|
| Organic Search | 268 | 104 | +164 |
| **AI Assistant** | **68** | **1** | **+67（68倍）** |
| Direct | 36 | 156 | −120 |
| Unassigned | 15 | 24 | −9 |
| Cross-network | 4 | 0 | +4 |
| Referral | 4 | 2 | +2 |
| Organic Social | 0 | 2 | −2 |

**AI Assistant は 1 → 68 で、いまや 2 番目に大きいチャネル**（全体の約17%）。
[llms-txt.md](./llms-txt.md) は 2026-08-14 に「28日で1件」を根拠に llms.txt を置いた。
**その1か月後の実測がこれ**で、当時の見立て（「AI経由は増える」）は当たっている。

参照元（90日・2026-06-26〜09-23、`sessionSource`）：

| 参照元 | セッション |
|---|---:|
| bing | 240 |
| (direct) | 192 |
| google | 119 |
| **chatgpt.com** | **68** |
| homescreen（PWA） | 34 |
| search.google.com | 11 |
| github.com | 5 |
| copilot.com | 3 |

`google` の 119 は、Search Console 側で**表示回数がほぼゼロ**
（2026-08-19 以降、28日間のクリック 0・表示 1）なのと食い違う。
Google 検索の結果ページ以外（Discover・アプリ内ブラウザ・`search.google.com` 経由など）が
混ざっているとみられ、**このチャネルを「Google 検索が効いている」根拠にしてはいけない**。
判断に使うのは Search Console の実数のほう。

### AI 経由で実際に入ってきているページ（90日・`landingPage` × AI Assistant）

| ランディング | セッション |
|---|---:|
| /games/daifugo | 15 |
| /tools/interval-timer | 10 |
| (not set) | 9 |
| /games | 9 |
| /games/breakout | 3 |
| /games/nanpre | 3 |
| /tools/furusato-nozei | 3 |
| /（トップ） | 2 |
| /games/2048・/games/color-sort・/games/nonogram・/tools/sleep-cycle | 各2 |
| /games/block-puzzle・/games/hanafuda-koikoi・/games/shichinarabe・/tools/ideco・/tools/mojisu-count・/tools/nenrei-keisan | 各1 |

**ここが今回いちばん効く発見**：AI 経由の 1 位は **大富豪（15）**、2 位は
**インターバルタイマー（10）**。どちらも「制度の計算機」ではない。
GA4 のページビュー上位（最低賃金 78・ブロックパズル 57・2048 54・たばこ税 47）とも一致しない。
**AI アシスタントに選ばれているページと、検索で読まれているページは別物**という前提で
llms.txt を書き直す余地がある。

（母数が小さいので順位そのものは動く。使うのは「ゲームと日用ツールが上位に来る」という傾向のほうで、
個別の順位を根拠に何かを消したりはしない）

### いまの llms.txt が実測とずれているところ

`home/llms.txt` は 125 行・111 項目で、[llmstxt.org](https://llmstxt.org/) の形式に沿っている。
ただし 2026-08-14 に「AI に何を読ませたいか」だけで書いたもので、実測を反映していない。

1. **1 サイト 1 ファイルに 111 項目が平らに並んでいる。** llmstxt.org は
   詳細を別ファイルに分けて `## Optional` から参照する書き方を想定している。
   いまは全部 1 枚に入っていて、セクションごとの深掘りが無い
2. **ゲームの説明が薄い。** AI 経由の 1 位が大富豪なのに、llms.txt のゲーム行は
   ツール行より短い。「どのルールに対応しているか（都落ち・革命・8切り など）」は
   ページ本文には書いてあるが llms.txt には出ていない。**AI が引用するときの
   手がかりが本文にしか無い**
3. **learn（全37章）が入口1行だけ。** 章ごとの見出しが llms.txt に無いので、
   「NISAの仕組み」のような問いに対してサイトを候補に挙げる材料が薄い
4. **更新日が書かれていない。** 各ページには最終更新日があるが llms.txt には無い。
   制度の計算機は「いつ時点の法令か」が引用の可否を分ける

## 提案

### A. 週次レポートに AI チャネルを足す（測れるようにするのが先）

`scripts/` の週次監査（`gsc-canonical-audit.mjs` と同じ枠組み）に、GA4 Data API の
`sessionDefaultChannelGroup` × `sessionSource` と、AI Assistant に絞った `landingPage` を
足して、月曜のログに 1 行で出す。**これが無いと、以下 B・C をやっても効いたか分からない**。

- 指標：`AI Assistant` のセッション数（28日）と、その上位ランディング5件
- サービスアカウントは `analytics.readonly` を既に持っている（今回の計測もそれで取った）。
  **新しい権限もスコープの追加も要らない**

### B. llms.txt を実測に合わせて書き直す

**方針：`home/llms.txt` は入口だけの案内板にし、詳細はセクションごとの子ファイルを
registry / curriculum から生成する。** 二重管理を作らないための線引きを先に決めておく。

| | 持つもの | 作りかた |
|---|---|---|
| `home/llms.txt` | サイトの説明・各セクションへの入口・`## Optional`（運営者情報・プライバシー） | **手書き**。日付は持たない |
| `/tools/llms.txt`・`/games/llms.txt`・`/learn/llms.txt` | 個々のツール・ゲーム・章の行（説明・最終更新日） | **生成**（registry / curriculum） |

#### B-2（🔴 最重要）生成は必ず `publicTools` / `publicGames` / `publicChapters` を通す

CLAUDE.md の約束：

> 一覧を出すときは `publicGames` / `publicTools` / `publicSubjects` / `publicChapters` を通す。
> `games` / `tools` / `subjects` / `chapters` を直に `filter` しない（書き忘れが公開事故になる）

いま現物を数えると、**公開前のものが 8 件ある**：

| | 件数 | 例 |
|---|---:|---|
| `tools` の `wip` | 2 | 出産予定日・OTC類似薬「特別の料金」計算機（#240） |
| `games` の `wip` | 4 | 星置きパズル（#242）・箱入り娘・ボルダリングマージ・タイピング |
| `games` の `preview` | 2 | 二角取り・ピンボール |

素直に `registry` を舐めて生成すると、**この 8 件が llms.txt に載って AI アシスタントに
配られる**。`stage` は `noindex` を付けるが、**llms.txt は robots と別経路なので止まらない**。

`publicTools`（`tools/lib/registry.ts:550`）・`publicGames`（`games/lib/registry.ts:417`）・
`publicChapters`（`learn/lib/curriculum.ts:657`）を通すこと。

**現行の `scripts/test/llms-txt.test.mjs` は「手書きの `home/llms.txt` と registry の
食い違いを検知する」ためのもの**で、生成に切り替えると役目が変わる。
**守りを検知側から生成側へ移すところまでが B-2 の仕事**：

- 生成関数に `stage !== 'public'` が 1 件も混ざらないことのテスト
  （`wip` / `preview` の実物を入れて 0 件になることを確かめる）
- `llms-txt.test.mjs` は **`home/llms.txt` が入口だけになっていること**
  （個々のツール行を持たない・子ファイル 3 本を指している）の検証に書き換える

#### B-2b（🟡）セクションは `## Optional` ではなく通常セクションから指す

llmstxt.org の `## Optional` は「**短い文脈が必要なら飛ばしてよい URL**」という意味。
子ファイルはサイトの中身そのものへの入口なので、そこに置くと
**いちばん読ませたいものを自分で降格させる**ことになる。

**決定：`## ツール` / `## ゲーム` / `## 学ぶ` という通常セクションから子ファイルを指す。
`## Optional` には本当に副次的なもの（運営者情報・プライバシー）を置く。**

#### B-2c（🟡）静的エクスポートの制約

`tools` / `games` / `learn` は Next.js の **静的エクスポート**（`output: 'export'` ＋
`trailingSlash: true`）。`/tools/llms.txt` を Route Handler で出すなら
**動的関数を使わない静的な `GET` に限る**（`app/sitemap.ts` と同じ扱い）。
ここを外すとビルドが通らない。

また `sitemap.ts` は Next.js の規約ルートなので**出力先の前例にならない**。
`app/llms.txt/route.ts` の形で `out/llms.txt` に出るか、ディレクトリが挟まるかは
設定次第なので、**実装時に `out/` の現物を確認すること**。

#### B-1（🟡）ゲーム行の加筆は `/games/llms.txt` 側に入れる

AI 経由の 1 位が大富豪なのに、llms.txt のゲーム行はツール行より短い。
「どのルールに対応しているか（都落ち・革命・8切り など）」はページ本文の
`<h2>ルール</h2>` 配下にあるので、**その語を出すだけ**でよい（新しい文章は書かない）。

**入れる先は `/games/llms.txt`**。`home/llms.txt` に書くと B-2 のあとで書き直しになるので、
**B-2 を先にやる**。

#### B-3（🟡）`updatedAt` は生成される子ファイルにだけ置く

**`home/` にはビルド工程が無い**（CLAUDE.md の「ここだけは運用で守る」）。
`home/llms.txt` の行に日付を手書きすると、**同日の
[sitemap-lastmod-guardrail.md](./sitemap-lastmod-guardrail.md) が見つけたのと
まったく同じ腐りかた**（中身が変わったのに日付が据え置かれる）をする。
しかも今度は CI で検知する仕組みすら無い。

**決定：`updatedAt` は `/tools/llms.txt`・`/games/llms.txt`・`/learn/llms.txt` にだけ置き、
`home/llms.txt` は日付を持たない案内板に徹する。**
`home/` の固定ページ（`/about.html` 等）には registry が無いので、**日付を付けない**。

#### B-4（🔴）learn 37章を出すなら、コンプライアンス検査の網を広げる

`learn/tests/compliance.test.ts` の検査対象は **`app/**/page.tsx` のソース**だけ
（`writtenChapters` の各章ページ＋学ぶトップ＋投資の目次。同ファイル 22・24・25 行）。
**`lib/curriculum.ts` の `description` は読んでいない。**

つまり 37章の `description` を `/learn/llms.txt` に出すと、
**コンプライアンス検査を一度も通っていない 37 行が公開される**。
いま `description` が使われている場所（一覧カード・meta description）でも同じ穴は開いているが、
**llms.txt は「AI に引用させるために出す」ものなので露出のしかたが変わる**。

投資助言・代理業の登録をしていない以上、ここは形式の話では済まない。
**B-4 をやるなら `compliance.test.ts` の検査対象に `curriculum.ts` の `description` を足すこと。**
作業としては小さいはずで、**B-4 と同じ PR に入れる**。

### C. AI クローラーが実際に取れているかを確かめる

`home/robots.txt` は `User-agent: * / Allow: /` なので、`OAI-SearchBot`・`ChatGPT-User`・
`PerplexityBot`・`ClaudeBot` はいずれも許可されている。**設定としては問題ない**ので
robots.txt は触らない。確かめるのは配信側で、CloudFront のアクセスログが入れば
（[hasokon-infra #15](https://github.com/ke-iwata/hasokon-infra/pull/15)）
User-Agent 別に「実際に来ているか・何を取ったか」を数えられる。
**この提案は #15 のマージを待たないが、入れば C の精度が上がる**（依存ではなく相乗）。

## 期待される効果

- **いちばん確かなのは B-2 の「生成にする」部分**で、これは AI 流入と関係なく効く。
  ツール・ゲームを増やしたときに llms.txt の行を書き忘れる経路が消える
- AI 経由のセッションが増えるかどうかは**約束できない**。引用するかどうかは
  各アシスタント側の判断で、llms.txt を読んでいる保証も公表されていない。
  この提案が約束するのは「**測れるようにする（A）**」と「**引用の材料を増やす（B）**」まで
- ただし ChatGPT の検索は Bing のインデックスに依存する部分が大きく、**当サイトは
  Bing には入っている**（Organic Search 268 の大半が bing）。Google の登録待ちと違い、
  **ここは手を入れれば結果に届く経路になっている**

## 工数の見積り

| 作業 | 目安 |
|---|---|
| A：週次レポートに GA4 のチャネル計測を追加 ＋ テスト | 約 30k トークン |
| B-2：セクション別 llms.txt の生成（3アプリ）＋ `public` フィルタのテスト ＋ `llms-txt.test.mjs` の書き換え | 約 75k トークン |
| B-1：ゲーム行の加筆（29件・`/games/llms.txt` 側） | 約 25k トークン |
| B-3：`updatedAt`（子ファイルのみ） | 約 10k トークン |
| B-4：learn 37章 ＋ `compliance.test.ts` の検査対象拡張 | 約 30k トークン |
| C：ログが入ってからの集計（#15 依存） | 約 15k トークン |
| 合計 | **約 185k トークン**（A だけなら 30k） |

**A → B-2 → B-1 → B-3 → B-4 の順で、A を先に入れること。**
測る手段が無いまま llms.txt を触ると、効いたかどうかが永久に分からなくなる。

## やらないこと

- **AI 向けに本文を別出しする（クローキング）**：同じ URL で人と AI に違う中身を返すのは
  検索エンジンのガイドライン違反で、Bing からの流入という現在の生命線を失う
- **llms.txt にツール・ゲームの計算ロジックを書く**：出典と結論はページ本文にあり、
  llms.txt は案内板。ここに数字を写すと二重管理になり、法改正のたびに 2 か所直すことになる
- **`registry` / `chapters` を直に `filter` して llms.txt を生成する**：B-2 のとおり
  公開前 8 件が漏れる。`publicTools` / `publicGames` / `publicChapters` を通す
- **`home/llms.txt` に個々のツール行や日付を残す**：B-3 のとおり腐る。入口だけにする
- **AI 経由が増えたことを根拠に、検索向けの手当て（サイトマップ・インデックス復旧）を
  止める**：68 セッションはまだ小さく、Bing 経由 240 の内訳を崩す理由にはならない
- **`sessionSource: google` の 119 を「Google 検索が回復した」と読む**：Search Console の
  表示回数がほぼゼロなので食い違っている。判断には Search Console の実数を使う

---

## 実装メモ（2026-09-24）

提案の順（A → B-2 → B-1 → B-3 → B-4）どおりに入れた。**C は別作業**。

### A（測れるようにする）

- `scripts/ga4-ai-channel.mjs` ＋ `scripts/lib/ga4.mjs`。直近28日とその前の28日を
  1回の `runReport` で取り、AI Assistant のセッション数・増減・全体に占める割合と、
  AI に絞ったランディング上位5件を出す
- 週1回の実行は `.github/workflows/gsc-audit.yml` に**相乗り**させた。
  ジョブもSecretも増やしていない（同じサービスアカウントで `analytics.readonly`）。
  **GA4 側が失敗しても Search Console の計測は落とさない**（`::warning` どまり）
- 権限が無いときに「AI経由0セッション」と読めてしまわないよう、**失敗は必ず終了コード2**にした

### B（llms.txt を実測に合わせる）

| | 持つもの | 作りかた |
|---|---|---|
| `home/llms.txt` | サイトの説明・3セクションへの入口・`## Optional` | 手書き・**日付を持たない**（26行） |
| `/tools/llms.txt`・`/games/llms.txt`・`/learn/llms.txt` | 個々の行（説明・最終更新日） | `lib/llms.ts` が registry / curriculum から生成 |

- **B-2**：生成は `publicTools` / `publicGames` / `publicChapters` / `publicSubjects` を通す。
  公開前の8件（tools 2・games 6）が出ないことを各アプリの `tests/llms.test.ts` で確かめている。
  **見張りが空振りしないよう、公開前が0件になったらテストが落ちる**ようにもした。
  `scripts/test/llms-txt.test.mjs` は「`home/llms.txt` が入口のままか」の検査に書き換えた
- **B-2b**：子ファイルは `## ツール` / `## ゲーム` / `## 学ぶ` から指す。
  `## Optional` に置いていないことをテストで固定した
- **B-2c**：`app/llms.txt/route.ts`（`dynamic = 'force-static'` の引数なし `GET`）で、
  3アプリとも `out/llms.txt` に出ることをビルドで確認した（ディレクトリは挟まらない）
- **B-1**：ゲーム行に `keywords`（`lib/registry.ts` の新しい項目）を並べる。
  大富豪なら「8切り・革命・縛り・階段・11バック・5飛ばし・9リバース・スペ3返し・都落ち」。
  **新しい文章は書かない**という約束は、`tests/llms.test.ts` が
  「各語がそのゲームの `page.tsx` にあるか」を検査して守る
- **B-3**：`updatedAt` は子ファイルにだけ置いた。`home/llms.txt` に日付が入ったら
  `scripts/test/llms-txt.test.mjs` が落とす
- **B-4**：`learn/tests/compliance.test.ts` の検査対象に `curriculum.ts` の
  `description`（37章）と分野の `description` / `lead` を足した。
  あわせて、分野の説明が「全35章」のまま据え置かれていたのを37章に直し、
  **実際の章数とずれたら落ちるテスト**を `tests/curriculum.test.ts` に足した
  （llms.txt でAIに配るようになったので、目視では守れない）

### 測り直すとき

`node scripts/ga4-ai-channel.mjs --out ...` の結果を週ごとに並べる。
**本番反映（タグリリース）前後で比べること。** main へのマージはテスト環境までで、
AI アシスタントが読むのは本番の `hasokon.com/llms.txt` のほう。
