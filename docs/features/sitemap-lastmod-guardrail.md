# トップページの更新が Bing に通知されていない — `lastmod` の据え置きを CI で落とし、サイトマップ index にも `lastmod` を入れる

**状態**：提案（2026-09-24 起票）。**1 は実害が出ている**ので先に直す
**対象**：`home/sitemap-home.xml`・`home/sitemap.xml`・`scripts/test/`（新規テスト1本）・
`.github/workflows/deploy.yml`（index の `lastmod` を配信時に埋める場合）
**起票**：2026-09-24
**緊急度**：**高**（1 について）。Bing は当サイトの最大の流入元
（直近90日 240セッション。[ai-assistant-channel.md](./ai-assistant-channel.md) の計測）で、
IndexNow はその Bing への唯一の能動的な通知経路。そこが黙って空振りしている

---

## 1. 実害：`/`（トップ）の更新が IndexNow で送られていない

### 何が起きているか

`scripts/indexnow-submit.mjs` は、**前回と今回のサイトマップを `<loc>` ＋ `<lastmod>` で
突き合わせ、新規か `lastmod` が動いた URL だけ**を送る（同ファイル 175〜183 行）。
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
1 と同じ仕組みで直るが、優先度は分けて考えてよい。

### なぜ気づけなかったか

`home/` にはビルド工程が無く、`lastmod` は**人が手で上げる約束**になっている。
CLAUDE.md には書いてあるが、**守られなかったときに落ちるものが無い**。
`scripts/test/sitemap.test.mjs` は「`lastmod` が `YYYY-MM-DD` の形か」までは見ているが、
「中身が変わったのに据え置かれていないか」は見ていない。

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

### 現状（2026-09-24 取得・Search Console Sitemaps API と URL 検査 API）

| サイトマップ | Google の状態 | 最終ダウンロード |
|---|---|---|
| `/sitemap.xml`（index） | 送信済み | 2026-09-14 |
| `/tools/sitemap.xml` | 個別送信済み・56 URL / 登録 **0** | 2026-09-13 |
| `/games/sitemap.xml` | 個別送信済み・26 URL / 登録 **0** | 2026-09-16 |
| `/sitemap-home.xml` | index 経由・2 URL / 登録 **0** | **2026-09-08** |
| `/learn/sitemap.xml` | **`404 notFound`（レポートに無い）** | **一度もない** |

[sitemap-discovery-audit.md](./sitemap-discovery-audit.md) の A（`home/robots.txt` に子4本を直書き）は
**2026-09-19 に本番へ反映済み**（`curl https://hasokon.com/robots.txt` で 5 行とも配信を確認した）。
**その 5 日後の今日の計測がこれ**で、`/sitemap-home.xml` は 09-08 のまま読み直されていない。

URL 単位でも動いていない（`scripts/gsc-canonical-audit.mjs`、128 URL 全件）：

| `coverageState` | 2026-09-16 | **2026-09-24** |
|---|---:|---:|
| Submitted and indexed | 1 | **1** |
| Crawled - currently not indexed | 30 | **36** |
| URL is unknown to Google | 91 | **90**（うち learn 38・tools 37・games 14・`/about.html` 1） |
| Duplicate, Google chose different canonical | 1 | **1** |

learn の unknown は **39 → 38**。**誤差の範囲で、A が効いたとは言えない。**

ここで公平に書いておくと、**robots.txt 経由で見つけたサイトマップは Search Console の
サイトマップ レポートに出ない**（[公式ヘルプ](https://support.google.com/webmasters/answer/7451001)）ので、
`404 notFound` のままでも「A が効いていない」証明にはならない。
**A の効果は `coverageState` で見る約束**（sitemap-discovery-audit.md の「期待される効果」）で、
そちらが 39 → 38 なので、**5 日の時点では動いていない**、というのが言えることの全部。

`<lastmod>` の欠落は、A とは別の経路で同じ症状を説明しうる：
**index を読み直しても、どの子が新しいか分からないので子を取りに行かない。**
これは仮説で、入れてみないと確かめられない。ただし**コストは 4 行**なので、
確かめる価値のほうが大きい。

## 提案

### A（先にやる）：`lastmod` の据え置きを CI で落とす

`scripts/test/` に 1 本足す。**`home/` 配下の配信対象ファイルについて、
`git log -1 --format=%ad --date=short -- <file>` の日付が
`home/sitemap-home.xml` のその URL の `lastmod` より新しければ落とす。**

- 対象は `sitemap-home.xml` に載っている URL（`/` → `index.html`、`/about.html`、`/privacy.html`）
- 落ちたときのメッセージに「**`lastmod` を `YYYY-MM-DD` に上げてください。
  据え置くと IndexNow がこの URL を送りません**」と、直しかたを書く
- `404.html` はサイトマップに載せないので対象外（いまの扱いを変えない）
- CI がシャロークローンだと `git log` が空になるので、取れなかったファイルは
  **落とさず飛ばす**（偽陽性で main を止めない）

あわせて、いま据え置かれている 2 つを現実に合わせる：
`/` を `2026-09-19` に、`/privacy.html` を `2026-09-17` に。
**次のデプロイで IndexNow がこの 2 本を Bing へ送る。**

### B：サイトマップ index に `<lastmod>` を入れる

各子の中の `<lastmod>` の最大値を、index の `<sitemap>` の `<lastmod>` にする。

```xml
<sitemap>
  <loc>https://hasokon.com/sitemap-home.xml</loc>
  <lastmod>2026-09-19</lastmod>
</sitemap>
```

`tools` / `games` / `learn` の子は Next.js の `app/sitemap.ts` が registry の `updatedAt` から
出しているので、**index の値は配信時に埋めるのが正しい**。`.github/workflows/deploy.yml` は
すでに `scripts/build-test-home.mjs` をデプロイ時に挟む形を持っているので、同じ場所に
`scripts/build-sitemap-index.mjs`（仮）を足して、`out/` の子 4 本を読んで index を書き出す。

- **`home/sitemap.xml` の中身は commit しない**（`build-test-home.mjs` と同じ扱い。
  手元の値と配信の値がずれて、どちらが正か分からなくなるのを避ける）
- 生成結果が `<loc>` 4 本・全部に `<lastmod>` があることをテストで確かめる
- `home/robots.txt` の 5 行とは独立（あちらは発見経路、こちらは再取得の手がかり）

### C：週次監査に「子が読み直されているか」を足す

[sitemap-discovery-audit.md](./sitemap-discovery-audit.md) の B で
`lastDownloaded` が 14 日より古い子を知らせる仕組みは**もう入っている**。
B を入れたあとは、そこに **「index の `lastmod` を上げた日」より後に
子が読み直されたか**を 1 行足すだけで、B が効いたかどうかが月曜のログで分かる。

## 期待される効果

- **A は確実に効く**。IndexNow の差分は `lastmod` を見ているだけなので、
  直せば次のデプロイで送られる。**「送った」ところまでは IndexNow の応答で確認できる**
  （Bing が結果をどう扱うかは別）。据え置きの再発は CI で止まる
- **B は仮説**。`lastmod` を入れれば Google が子を読み直す、という保証は無い。
  `/sitemap-home.xml` の `lastDownloaded` が 09-08 から動くかどうかで測る
- **どちらも「Google に登録される」ことは約束しない。** 128 URL 中 1 件という
  いまの状態はサイト単位の品質判定によるもので（[google-index-recovery.md](./google-index-recovery.md)）、
  サイトマップの手当てで直る種類のものではない。**この提案が約束するのは、
  更新を渡す経路が詰まっていない状態にすること**まで

## 工数の見積り

| 作業 | 目安 |
|---|---|
| A：`lastmod` 2 か所の修正 ＋ CI テスト 1 本 | 約 35k トークン |
| B：index 生成スクリプト ＋ deploy.yml ＋ テスト | 約 45k トークン |
| C：週次監査へ 1 行 | 約 10k トークン |
| 合計 | **約 90k トークン**（A だけなら 35k） |

## やらないこと

- **`lastmod` をコミット日から自動生成して `sitemap-home.xml` を書き換える**：
  ファイルの更新日と「内容が変わった日」は別物（整形だけの変更でも日付が動く）。
  **人が上げ、機械は据え置きを検知するだけ**にする
- **`changefreq` / `priority` を触る**：Google はどちらも使わないと明言しており、
  今回の症状の説明にならない
- **index をやめて 1 本の平らなサイトマップにする**：
  [sitemap-discovery-audit.md](./sitemap-discovery-audit.md) の「やらないこと」のとおり
- **`/learn/sitemap.xml` を Sitemaps API（PUT）で自動送信する**：同じく見送り済み
  （書き込みスコープが要り、週次 cron から Search Console に書き込むのは運営者が把握しない操作になる）
