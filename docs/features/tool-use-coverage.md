# 公開中のツール24本が `tool_use` を1件も送っていない — 流入1位のふるさと納税・3位の働き損・年末調整も「開かれたが使われなかった」が測れない。全ツールに送らせ、送り忘れをテストで落とす

**状態**：実装済み（2026-11-26。セッション `session_012RoU2FbERDzjoGCq2mtpgA`。23本に `trackToolUse` を足し、`tools/tests/tool-use-coverage.test.ts` で送り忘れを落とす。マージで test.hasokon.com、次の `v*` で本番）。
もとは提案（2026-10-25 起票。セッション `session_01Gwy8W3zkADBbVS4kEZFmWZ`）。**2026-11-26 に再計測（セッション `session_012RoU2E5s4Fz5gpxyLuesn2`）：
11-15 の期日を過ぎても未実装で、穴は 23 本・tools の PV の 47%（10-25 の 25% から倍増）に広がった。期日を 2026-12-04 に引き直す**（下「2026-11-26 の再計測」）
**優先度：中→高（計測の穴。いま利用者に誤った答えは出していない）。** ただし**年末調整（11〜12月）とふるさと納税（12/31締め）の繁忙期の前に入れないと、
その時期の「使われ方」が今年も残らない**。当初は 2026-11-15 までのマージを提案した。**引き直した期日は 2026-12-04 のマージ・次の `v*` で本番**
（12月の最後の3週＝ふるさと納税の締め前の山だけでも測るため）。
**着手条件**：なし（コードだけで直せる。GA4 側の設定は増えない）。
**公開条件**：実装 PR のマージで test.hasokon.com に出る。**テスト環境と localhost では `shouldTrack()` が false で、`gtag` そのものが呼ばれない**
（`dataLayer` にも積まれない）ので、送られることはテスト（下の B）と本番のリアルタイム レポートで確かめる。次の `v*` タグで本番。`stage` は動かさない。
**対象**：`tools/app/{slug}/Calculator.tsx`（下表の24本）・`tools/tests/tool-use-coverage.test.ts`（新規）・`tools/CLAUDE.md`（「アクセス解析」の1行）
**関連**：[measurement-hygiene.md](./measurement-hygiene.md)（GA4 の送信条件）・[ga4-page-path.md](./ga4-page-path.md)・
[card-games-drag-drop.md](./card-games-drag-drop.md)（games 側の `first-move` の測り方）

---

## 背景と根拠

### 計測値（2026-10-25 取得。GA4 Data API・プロパティ 548154955、2026-09-27〜10-24 の28日）

`tools/CLAUDE.md` は「ページビューだけでは『開かれたが使われなかった』が分からないので、主要な操作で `trackToolUse(slug, action)` を呼んでいる」
「新しいツールを足したときは、押して結果が出る操作があれば同じように呼ぶ」と書いている。
しかし `tools/app/{slug}/` を `trackToolUse` で検索すると、**registry の75本のうち24本が1回も呼んでいない**
（`roulette` / `group` / `dice` は `app/_roulette/` から呼んでいるので数えない）。

| 呼んでいないツール（28日の PV が多い順） | PV | エンゲージメント時間（秒・合計） |
|---|---|---|
| `furusato-nozei`（ふるさと納税 上限額） | **159**（tools で1位） | **15,933**（tools で1位） |
| `hatarakizon`（働き損） | 47 | 3,775 |
| `kogaku-ryoyohi`（高額療養費） | 31 | 2,190 |
| `kosodate-shienkin`（子ども・子育て支援金） | 21 | 1,669 |
| `nenshu-kabe`（年収の壁） | 21 | 1,070 |
| `aspect-ratio`・`ideco`（各12）・`nenmatsu-chosei`（8）・`koko-jugyoryo`（5）・`kyuyo-nenkin-kojo`（4）・ほか | 34 | — |
| `zaishoku-rorei-nenkin`・`nenkin-gensen`・`juminzei-hikazei`・`boei-tokubetsu-shotokuzei`・`tedori-keisan`・`shoyo-tedori`・`shitsugyo-hoken`・`ikuji-kyugyo-kyufu`・`taishokukin-tedori`・`shobyo-teate`・`iryohi-kojo`・`aircon-denkidai`・`warikan`・`hebon-romaji` | （上の「ほか」と28日で0〜2PV の行） | — |

- **tools の個別ページの PV 1,296 のうち 326（25%）が、`tool_use` の無いページ**。エンゲージメント時間では半分を超える（ふるさと納税1本で 15,933 秒）
- 同じ期間の `tool_use` 上位は reversi 460・nenrei-keisan 426・yoikuhi-keisan 341・tabako-zei-neage 137・shuzei-kaisei 106。
  **PV で1位のふるさと納税がこの表に載らない**ので、「どのツールがどれだけ使われているか」の比較（`trackToolUse` の JSDoc が掲げる目的）が成り立っていない
- 過去の提案は `tool_use` を効果の物差しにしている（例：[kogaku-furusato-saitei-seikaku-2026-10-12.md](./kogaku-furusato-saitei-seikaku-2026-10-12.md) の「`/tools/kogaku-ryoyohi/` の `tool_use` を修正前後で比べる」）。
  **その `kogaku-ryoyohi` は `tool_use` を送っていない**ので、この測り方では効果がいつまでも0に見える
- games は registry の全ゲームが `trackToolUse` を呼んでいる（同じ方法で確認）。穴は tools だけ

### 2026-11-26 の再計測（GA4 Data API・プロパティ 548154955、2026-10-29〜11-25 の28日）

`origin/main`（`ca538bb`）で `tools/app/{slug}/` を `trackToolUse(` で検索し直した（`roulette` / `group` / `dice` は `app/_roulette/`）。

- **呼んでいないのは 23 本**（10-25 の 24 本から `aircon-denkidai` が抜けた）。**23 本すべて `public`**。
  11 月に入った `wip` の新ツール（subnet・cron-shiki・hash-keisan・color-code・tanka-hikaku・jikan-keisan・gensen-hoshu ほか）は全部呼んでいる＝**穴は古い公開中のツールに固まっている**
- **tools の個別ページの PV 1,212 のうち 574（47.4%）・エンゲージメント時間 125,920 秒のうち 65,476 秒（52.0%）が、`tool_use` の無いページ**（10-25 は PV の 25%）。
  繁忙期に入って、**測れないツールのほうに客が寄っている**

| 呼んでいないツール（28日の PV が多い順） | PV | ユーザー | 1人あたりエンゲージ秒 |
|---|---|---|---|
| `furusato-nozei`（ふるさと納税 上限額） | **291**（tools で1位） | 251 | 112 |
| `hatarakizon`（働き損） | 71 | 51 | 281 |
| `juminzei-hikazei`（住民税 非課税） | 55 | 46 | 127 |
| `kosodate-shienkin`（子ども・子育て支援金） | 39 | 34 | 120 |
| `nenkin-gensen`（年金の源泉徴収） | 27 | 24 | 119 |
| `nenmatsu-chosei`（年末調整） | 23 | 19 | 126 |
| `kogaku-ryoyohi`・`nenshu-kabe`・`ideco`・`kyuyo-nenkin-kojo`・`aspect-ratio`・`iryohi-kojo`・`koko-jugyoryo`・`boei-tokubetsu-shotokuzei` | 14・13・12・11・6・6・3・2 | — | — |

- 比べると、**呼んでいるツールは開いた人の 6〜7 割が使っている**（`yoikuhi-keisan` 168 人中 120 人＝71%・`nenrei-keisan` 128 人中 81 人＝63%）。
  ふるさと納税の 251 人のうち何人が上限額まで出したかは、**いまのままでは 12/31 の締めまで1件も分からない**
- ふるさと納税の週ごとの PV は 45週 92・46週 79・47週 58・48週（11/23〜25 の3日）22。**12 月の第2〜4週が例年の山**なので、12/4 マージ・次のリリースで本番に出れば山の大半を測れる
- 進め方は上の「仕様」A〜C のまま変えない（action の付け方・テスト・CLAUDE.md の1行）。対象の表は 24 本 → 上の 23 本に読み替える（`aircon-denkidai` は対応済み）

### なぜ起きたか

- 送るかどうかを確かめるテストが無い。`tests/analytics.test.ts` は `trackToolUse` が `tool_use` を送ることは見ているが、**各ツールが呼んでいるか**は見ていない
- 呼んでいない24本は、ほとんどが**ボタンが無く、入力を変えるたびに結果が出る**型（`onChange` で再計算）。「押して結果が出る操作があれば」という書き方だと、
  押す操作が無いツールは呼ばなくてよいように読める

---

## 仕様

### A. 24本に `trackToolUse` を足す

すでに送っているツールの作法（`yoikuhi-keisan`・`nenrei-keisan`・`tsukin-teate-hikazei`）に揃える。**新しい関数・新しいイベント名は作らない。**

| 操作 | 呼び方 | action |
|---|---|---|
| 金額・日付など**数値の入力欄** | `onBlur`（入力し終えたとき。`onChange` で送ると1文字ごとに飛ぶ） | `input-{項目}`（例：`input-income`） |
| ラジオ・セレクト・チェックの**切り替え** | `onChange` | `select-{項目}`（例：`select-family`） |
| 行の追加・削除・リセットなどの**ボタン** | `onClick` | `add-row` / `remove-row` / `reset` |
| 結果の**コピー** | コピーに成功したとき | `copy` |

- 各ツールで**主要な入力（それを入れないと答えが出ない欄）には必ず1つ**付ける。全部の欄に付ける必要はない
- slug は `const SLUG = '{slug}'` に置いて使ってよい（`tsukin-teate-hikazei` の形）。下のテストはどちらの書き方も拾う
- **送る値に入力値（年収・医療費などの金額）を入れない。** `action` は項目名だけ。`trackToolUse` の第2引数に `${income}` のような値を混ぜないこと
  （プライバシーポリシーは「入力内容は送信しない」と書いている。GA4 の利用規約でも個人を推測できる値は送らない）
- 年分・年度を切り替えるラジオ（ふるさと納税の令和8年分／令和9年分など）は `select-year` に揃える。繁忙期にどちらの年分が使われたかが分かる

### B. 送り忘れを落とすテスト（`tools/tests/tool-use-coverage.test.ts`・新規）

- `lib/registry.ts` の**全エントリ**（`stage` を問わない。`wip` のうちに書かせる）について、そのツールの UI のファイルに
  `trackToolUse('{slug}'` か、`const SLUG = '{slug}'` と `trackToolUse(SLUG` の組が**1つ以上ある**ことを確かめる
- 探す場所は `app/{slug}/` の `.tsx`。`roulette` / `group` / `dice` だけは `app/_roulette/` を見る（対応表をテストの中に持つ。3本だけ）
- **slug の打ち間違いも落とす**：`app/{slug}/` の中で、別の slug を `trackToolUse` に渡していたら失敗にする（コピペで足したツールが前のツールの名前で送る事故）
- **入力値を送っていないか**はテストでは見ない（テンプレートリテラルの `${…}` が選択肢の値か自由入力かを字面で見分けられない）。
  既存の tools のテンプレートリテラルは7か所で、どれも**決まった選択肢の値**だけを埋めている
  （`shusseki-teishi` の `disease-${…}`・`bosai-bichiku-keisan` の `days-${…}`・`qr-code` の `mode-${…}`・`gazo-resize` の `run-${mode}`・`password` の3か所。2026-10-25 に確認）。
  今回の24本では**テンプレートリテラルを使わず、action を文字列の直書きにする**（レビューで見る。迷ったら直書き）
- 失敗したときのメッセージに、足りないツールの slug を全部並べる（1本ずつ直しては回す手戻りを避ける）

### C. `tools/CLAUDE.md` の1行

「新しいツールを足したときは、押して結果が出る操作があれば同じように呼ぶ」を、
「**新しいツールには必ず呼ぶ（ボタンが無いツールは主要な入力欄の `onBlur`）。入れ忘れは `tests/tool-use-coverage.test.ts` が落とす。入力値は送らない**」に直す。

---

## 確認手順

1. **CI**：`tools/tests/tool-use-coverage.test.ts` が通る（24本がそろっていること・打ち間違いが無いことをここで確かめる）
2. **テスト環境**：test.hasokon.com/tools/furusato-nozei/ ほかで、計算の見た目と動きが変わっていないこと
   （計測は送られないので、ここでは「壊れていない」だけを見る）
3. **本番リリースの直後**：hasokon.com/tools/furusato-nozei/ で年収を入れて欄の外を押し、GA4 の「リアルタイム」レポートのイベントに
   `tool_use` が出ること。同じことを `hatarakizon`・`kogaku-ryoyohi`・`nenmatsu-chosei` で1回ずつ
4. **リリースの翌週**：GA4 Data API で `tool_use` を `pagePath` 別に見て（`tool` はカスタムディメンションに未登録で `customEvent:tool` では引けない。2026-10-25 にメタデータ API で確認）、24本のうち PV のあったものが出ていること

## やらないこと

- **GA4 の「キーイベント」の設定・カスタムディメンションの登録**：`tool` / `action` は `tool_use` のパラメータとして既に送っている。ツール別は `pagePath` で見分けられるので、登録は本提案に入れない（`action` 別に見たくなったら、GA4 の管理画面でイベント スコープのカスタムディメンションに登録する。過去分には遡らない）
- **既存の29本の action 名の付け直し**：過去のデータと比べられなくなる
- **1ページ1回だけ送る（重複排除）**：既存のツールが欄ごとに送っているので、混ぜると比べられない。比べるときは「`tool_use` のあったセッション ÷ セッション」で見る
- games 側（穴が無い）

## 期待される効果

- **tools の PV の25%・エンゲージメント時間の半分以上**が、「使われたか」を測れるようになる
- 年末調整（11〜12月）・ふるさと納税（12月）の繁忙期に、**開いて使わずに帰った客の割合**が分かる。上位ツールの改善提案（入力欄の並べ替え・早見表への誘導など）の判断材料になる
- 過去の提案が効果の物差しにしてきた `tool_use` が、高額療養費などで初めて動く
- 送り忘れがテストで止まるので、以後ツールを足しても穴が再発しない

## 工数の見積り（消費トークン数）

| 作業 | トークン |
|---|---|
| 24本の `Calculator.tsx` に `trackToolUse` を足す（1本あたり 2〜4 か所。主要な入力を読むのに各 2〜3k） | 約 70k |
| `tests/tool-use-coverage.test.ts`（registry の読み取り・対応表・打ち間違い） | 約 15k |
| `tools/CLAUDE.md` の1行・`npm test && npm run build`・テスト環境で24本の見た目が変わらないことの確認 | 約 15k |
| **合計** | **約 100k** |
