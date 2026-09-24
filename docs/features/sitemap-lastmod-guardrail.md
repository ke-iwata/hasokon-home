# トップページの更新が Bing に通知されていない — `lastmod` の据え置きを CI で落とし、サイトマップ index にも `lastmod` を入れる

**状態**：提案（2026-09-24 起票／2026-09-25 レビュー反映）。**1 は実害が出ている**ので先に直す。
**A と B は別PR・別リリースに分ける**（下記「A と B を分ける理由」）
**対象**：
- A … `home/sitemap-home.xml`・`scripts/test/`（新規テスト1本）・**`.github/workflows/test.yml`**（`fetch-depth`）
- B … `home/sitemap.xml`・`scripts/build-sitemap-index.mjs`（新規）・`.github/workflows/deploy.yml`・`scripts/test/`
**起票**：2026-09-24
**緊急度**：**高**（A について）。Bing は当サイト最大の流入元
（直近90日 240セッション。[ai-assistant-channel.md](./ai-assistant-channel.md) の計測）で、
IndexNow はその Bing への唯一の能動的な通知経路。そこが黙って空振りしている

---

## 1. 実害：`/`（トップ）の更新が IndexNow で送られていない

### 何が起きているか

`scripts/indexnow-submit.mjs` は、**前回と今回のサイトマップを `<loc>` ＋ `<lastmod>` で
突き合わせ、新規か `lastmod` が動いた URL だけ**を送る（`selectChanged()`）。
CLAUDE.md にも「home のページを中身を変えたらその `lastmod` を変更日に上げる。
据え置くと更新が Bing に通知されない」と書いてある。

**その据え置きが実際に起きている。**

| 事実 | 出どころ |
|---|---|
| `home/index.html` が **2026-09-19** に 32 行増えた（ツール6本のカード追加） | `git log -1 -- home/index.html` → `fcc2154`（#243） |
| `home/sitemap-home.xml` の `/` の `lastmod` は **2026-09-09** のまま | `home/sitemap-home.xml` 現物 |
| `home/sitemap-home.xml` の最終変更は **2026-09-18**（#212）で、#243 では触られていない | `git log -3 -- home/sitemap-home.xml` |

つまり **#243 でトップページに増えた 6 本のツールへの導線は、IndexNow の差分に入らず、
Bing に「トップが変わった」と通知されていない**。

同じ据え置きが `privacy.html` にもある（ファイルは 2026-09-17 の #219 で変更、
`lastmod` は 2026-08-19 のまま）。ただしこちらは運営者情報へのリンク先を
`/tools/about/` → `/about.html` に差し替えただけなので、**通知しなくても実害は小さい**。
`/about.html` は変更日・`lastmod` とも 2026-09-17 で**一致している**（テストが守るべき正常系）。

### なぜ気づけなかったか

`home/` にはビルド工程が無く、`lastmod` は**人が手で上げる約束**になっている。
CLAUDE.md には書いてあるが、**守られなかったときに落ちるものが無い**。
`scripts/test/sitemap.test.mjs:130` は `/^\d{4}-\d{2}-\d{2}$/` で書式しか見ていない。

### A の効果が出るのは「次の `v*` リリース」

`.github/workflows/deploy.yml` の IndexNow 関連は **3ステップとも
`if: ${{ startsWith(github.ref, 'refs/tags/') }}`**（148・177・279 行）。
**main へのマージ（テスト環境）では IndexNow は動かない。**

差分の「後」側は HTTP ではなく**同期するファイルそのもの**を使っている：

```yaml
# deploy.yml:181
cp home/sitemap-home.xml /tmp/sitemaps-after/sitemap-home.xml
```

commit した `sitemap-home.xml` がそのまま差分の「後」側になるので、
**`lastmod` を直せば確実に差分に乗る**（CloudFront のキャッシュを踏まない作りになっている）。
ただし **A の実装PRをマージしただけでは Bing に届かない。**
CLAUDE.md のとおり本番リリース（`v*` タグ）は運営者の承認が要るので、
**効果は運営者が次のタグを打った時点で発生する**。実装者が「マージしたのに送られない」と
追いかけないよう、ここを前提として書いておく。

なお `indexnow-submit.mjs` に渡している `--sitemap https://hasokon.com/sitemap.xml` は
**host と keyLocation を決めるため**と、`--after` が無いときの起点としてだけ使われる。
デプロイでは常に `--after` を渡しているので、**index の中身は差分計算に使われない**。
したがって **B は IndexNow に影響しない。**

## 2. サイトマップ index に `<lastmod>` が無い

`home/sitemap.xml` は 4 本の子を指す index だが、**`<sitemap>` に `<lastmod>` が 1 つも無い**：

```xml
<sitemap>
  <loc>https://hasokon.com/sitemap-home.xml</loc>
</sitemap>
```

[sitemaps.org のプロトコル](https://www.sitemaps.org/protocol.html#sitemapindex_tag)では
index の `<sitemap>` にも `<lastmod>`（任意）を置ける。Google の
[サイトマップのヘルプ](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)は
`lastmod` を「**どれを読み直すか決める手がかり**」として扱う。
**いまの index は、子のどれが新しくなったかを一切示していない。**

**`<lastmod>` の欠落は、子が読み直されない理由を [sitemap-discovery-audit.md](./sitemap-discovery-audit.md) の
「index 経由の子は個別送信の子より読まれにくい」とは別の経路で説明しうる：
index を読み直しても、どの子が新しいか分からないので子を取りに行かない。**
これは仮説で、入れてみないと確かめられない。ただしコストは 4 行。

### 現状（2026-09-25 取得・Search Console Sitemaps API）

| サイトマップ | 最終送信 | 最終ダウンロード | 送信 URL / 登録 |
|---|---|---|---|
| `/sitemap.xml`（index） | 2026-09-24 15:49 | 2026-09-24 15:49 | — |
| `/sitemap-home.xml` | **2026-09-24 13:34** | **2026-09-24 13:34** | 3 / **0** |
| `/learn/sitemap.xml` | **2026-09-24 13:33** | **2026-09-24 13:33** | 39 / **0** |
| `/games/sitemap.xml` | 2026-08-14 | **2026-09-16** | 26 / **0** |
| `/tools/sitemap.xml` | 2026-08-14 | **2026-09-13** | 56 / **0** |

## A：`lastmod` の据え置きを CI で落とす

`scripts/test/` に 1 本足す。**`home/sitemap-home.xml` に載っている各 URL について、
対応する HTML の `git log -1 --format=%ad --date=short -- <file>` が
`lastmod` より新しければ落とす。**

あわせて、いま据え置かれている 2 つを現実に合わせる（**この実装PRに含める**）：
`/` を `2026-09-19` に、`/privacy.html` を `2026-09-17` に。

### A-1（🔴 必須）浅いクローンでは「飛ばす」安全弁が効かない

**当初案の「`git log` が空になるので飛ばす」は成り立たない。** 実測した：

```
$ git clone --depth 1 <repo> && cd <clone>
$ git rev-parse --is-shallow-repository
true
$ git log -1 --format=%ad --date=short -- home/index.html
2026-09-25        ← tip コミットの日付。空ではない
```

depth 1 のクローンには履歴が 1 つしか無く、git は**その 1 コミットが全ファイルを作成した**
ものとして扱う。`home/index.html` も `privacy.html` も `about.html` も、
**すべて「今日変更された」ことになる**。

- 安全弁（空なら飛ばす）は**一度も発動しない**
- テストは全 URL に「`lastmod` を今日に上げろ」と要求する
- **`home/` を誰も触っていない PR でも赤。main も赤**

`.github/workflows/test.yml:20` の `actions/checkout@v4` に `fetch-depth` の指定は無い
（リポジトリ内の checkout 6 か所すべて未指定＝既定の `fetch-depth: 1`）。

**したがって：**

1. **`.github/workflows/test.yml` の checkout に `fetch-depth: 0` を入れる**
2. **「取れなければ飛ばす」をやめる。** `git rev-parse --is-shallow-repository` が `true` なら
   **「履歴が無いので判定できない」と落とす**。黙って飛ばすと、ガードレールが効いていないのか
   守られているのか区別がつかず、「再発は CI で止まる」が成立しなくなる

### A-2（🔴 必須）`%ad`（author date）を使う。`%cd` にしない

squash マージでは committer date がマージ日に動く。`%cd` で比較すると
「PR 作成日に `lastmod` を上げた → 翌日マージ」で誤検知して落ちる。
**author date は squash でも残る**ので、起票日に `lastmod` を書いておけば数日後のマージでも通る。
**テストのコメントにこの理由を残すこと。**

`fetch-depth: 0` を入れれば CI は UTC で動く。`lastmod` は JST 基準で書かれるので
**UTC の日付が JST より後になることはなく、偽陽性の向きには倒れない**（安全側）。
これもコメントに 1 行。

### A-3（🟡 決定事項）整形だけの変更での空振りは**許容する**

コメントを 1 行直しただけでも `git log` の日付は動くので、テストは
「中身は変わっていないのに `lastmod` を上げろ」と言ってくる。
`lastmod` を上げると、内容が変わっていないのに IndexNow が Bing へ通知を送る。

**これは許容する。** 空振りの送信が最大 3 URL 増えるだけで、
内容ハッシュで判定する仕組みを作るほうが高くつく。
**実装者は内容ハッシュを作り込まないこと。**

（「やらないこと」で `lastmod` の自動生成を退けた理由と同じ非対称性が検知側にも出るが、
生成側は「機械が勝手に日付を動かす」、検知側は「人が明示的に上げる」で、後者は事故にならない。）

## B：サイトマップ index に `<lastmod>` を入れる

各子の中の `<lastmod>` の最大値を、index の `<sitemap>` の `<lastmod>` にする。

```xml
<sitemap>
  <loc>https://hasokon.com/sitemap-home.xml</loc>
  <lastmod>2026-09-19</lastmod>
</sitemap>
```

`tools` / `games` / `learn` の子は Next.js の `app/sitemap.ts` が registry の `updatedAt` から
出しているので、**index の値は配信時に埋める**。

### B-1（🔴 必須）deploy のステップは「位置は同じ・`if:` は付けない」

`.github/workflows/deploy.yml:231-233` はこうなっている：

```yaml
- name: テスト環境向けにトップの一覧を作る
  if: ${{ !startsWith(github.ref, 'refs/tags/') }}   # ← タグ（本番）では通らない
  run: node scripts/build-test-home.mjs
```

**「`build-test-home.mjs` と同じ位置に足す」を字面で読むとこの `if:` ごと複製され、
本番のサイトマップ index にだけ `lastmod` が入らない**という、提案の目的と正反対の結果になる。

`scripts/build-sitemap-index.mjs`（仮）は **位置は同じ・`if:` は付けない**（本番・テストの両方で回す）。
`out/` の子 4 本を読んで index を書き出す。

### B-2（🟡 必須）`<loc>` は commit が正・`lastmod` は配信時のみ

`scripts/test/robots-sitemaps.test.mjs:34` が **commit 済みの `home/sitemap.xml`** を
`parseLocs()` して `home/robots.txt` の 5 行と突き合わせている。
**commit 側の `home/sitemap.xml` は `<loc>` 4 本を持った正しい XML のまま残すこと**
（プレースホルダや空テンプレに置き換えるとこのテストが落ちる）。

そのうえで、**commit 側に `<lastmod>` が混ざっていないことを見張るテスト**を足す。
先例がある：`scripts/test/build-test-home.test.mjs` は「テスト環境用の生成結果を
`home/index.html` に commit していないか」を見張っていて、CLAUDE.md にも約束が書かれている。
**B はまったく同じ形の罠**（手元の値と配信の値がずれて、どちらが正か分からなくなる）。

生成結果についても、`<loc>` 4 本・全部に `<lastmod>` があることをテストで確かめる。

### B-3（🔴 必須）B の効果は `/tools/` と `/games/` のサイトマップで測る

**当初案の指標（`/sitemap-home.xml` の `lastDownloaded` が 09-08 から動くか）は使えなくなった。**
運営者が 2026-09-24 13:34 に Search Console から `/sitemap-home.xml` を個別送信したため
（#248。`sitemap-discovery-audit.md` の C）、**すでに 09-24 に読み直されている**。
個別送信はそれ自体が読み直しを起こすので、以後この 2 本（`/sitemap-home.xml` と
`/learn/sitemap.xml`）が動いても **B が効いたのか 09-24 の送信の余波なのか区別できない。**

**対照群を使う。** `/tools/sitemap.xml`（最終ダウンロード **2026-09-13**）と
`/games/sitemap.xml`（**2026-09-16**）は **09-24 の送信対象ではなく、A の `lastmod` 修正も
かからない**（A が触るのは `sitemap-home.xml` だけ）。
**index に `lastmod` が効くなら、手で触っていないこの 2 本こそが動くはず。**

| 指標 | ベースライン |
|---|---|
| `/tools/sitemap.xml` の `lastDownloaded` | 2026-09-13 |
| `/games/sitemap.xml` の `lastDownloaded` | 2026-09-16 |

**停止条件：B を載せた `v*` リリースから 14 日たっても、この 2 本の `lastDownloaded` が
どちらも動かなければ、B は効いていないと判断し、サイトマップ周りの追加施策はそこで止める。**

止めどきを決める理由をはっきり書く。このサイトのサイトマップ施策は
#211 → #234 → #238 → #248 → 本件で 5 本目だが、**`Submitted and indexed` は 1 → 1 のまま、
`Crawled - currently not indexed` は 30 → 36 と増えている**。この仕様書自身が
「サイトマップの手当てで直る種類ではない」と書いているとおり。
**1 回あたり 4 行でも、止めどきを決めずに積むと「やった感」だけが増える。**

## A と B を分ける理由

**A と B は別PR・別リリースにする。** 工数表は合計で書いてあるが 1 本の作業ではない。

A は `sitemap-home.xml` の中身（`lastmod` 2 か所）を書き換える。同じリリースに B を載せると、
子が読み直されたときに「index に `lastmod` が付いたから（B）」「子の中身が変わったから（A）」
「通常の再クロール周期」のどれか区別できない。
これは #238 のレビューで指摘された「C と A は本番リリースで同時」と同じ型の取りこぼし。

**A を先に出して観測 → その後 B。**
（B-3 の対照群は `sitemap-home.xml` を避けているので交絡はかなり減るが、
リリースを分けておくほうが確実。）

## C：週次監査に「子が読み直されているか」を足す

[sitemap-discovery-audit.md](./sitemap-discovery-audit.md) の B で
`lastDownloaded` が 14 日より古い子を知らせる仕組みは**もう入っている**。
B のあとは、そこに **「index の `lastmod` を上げた日」より後に
`/tools/sitemap.xml` と `/games/sitemap.xml` が読み直されたか**を 1 行足すだけでよい。

## 期待される効果

- **A は確実に効く**（`deploy.yml` の差分の作りで裏が取れている）。ただし
  **効果が出るのは次の `v*` リリース**であって、実装PRのマージ時点ではない。
  据え置きの再発は CI で止まる
- **B は仮説**。`/tools/` `/games/` の `lastDownloaded` が動くかで測り、14 日で降りる
- **どちらも「Google に登録される」ことは約束しない。** 128 URL 中 1 件という
  いまの状態はサイト単位の品質判定によるもので（[google-index-recovery.md](./google-index-recovery.md)）、
  サイトマップの手当てで直る種類のものではない。**この提案が約束するのは、
  更新を渡す経路が詰まっていない状態にすること**まで

## 工数の見積り

**A と B は別PR。合計は目安で、1 本の作業ではない。**

| 作業 | 目安 |
|---|---|
| **A**：`lastmod` 2 か所の修正 ＋ CI テスト 1 本 ＋ `test.yml` の `fetch-depth: 0` | 約 40k トークン |
| **B**：index 生成スクリプト ＋ `deploy.yml` ＋ テスト2本（生成・commit 側ガード） | 約 50k トークン |
| **C**：週次監査へ 1 行 | 約 10k トークン |

## やらないこと

- **`lastmod` をコミット日から自動生成して `sitemap-home.xml` を書き換える**：
  ファイルの更新日と「内容が変わった日」は別物（整形だけの変更でも日付が動く）。
  **人が上げ、機械は据え置きを検知するだけ**にする
- **整形だけの変更を検知側で除外する仕組み（内容ハッシュ・コミットメッセージのマーカー）を作る**：
  A-3 のとおり空振りは許容する
- **`home/find.js`・`home/analytics.js`・`home/BingSiteAuth.xml` などの非HTMLファイルを
  A の対象に入れる**：`sitemap-home.xml` に載るのは HTML ページの URL だけで、
  同梱アセットが変わっても HTML の中身は変わらない。**当面 `index.html` / `about.html` /
  `privacy.html` の 3 枚で十分**（次にこの仕様書を読む実装者が同じ検討をやり直さないよう明記する）
- **`404.html` を対象に入れる**：サイトマップに載せていないので対象外（いまの扱いを変えない）
- **`changefreq` / `priority` を触る**：Google はどちらも使わないと明言しており、
  今回の症状の説明にならない
- **index をやめて 1 本の平らなサイトマップにする**：
  [sitemap-discovery-audit.md](./sitemap-discovery-audit.md) の「やらないこと」のとおり
- **`/learn/sitemap.xml` を Sitemaps API（PUT）で自動送信する**：同じく見送り済み。
  **2026-09-24 に運営者が手で送信済み**（#248）
