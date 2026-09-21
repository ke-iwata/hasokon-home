# learn のサイトマップ（39 URL）が Google に一度も読まれていない — robots.txt に子サイトマップを直接書き、週次監査で「読まれたか」を数える

**状態**：**A・B は実装済み（2026-09-19）。C（運営者の画面作業）は未実施。**[google-index-recovery.md](./google-index-recovery.md) の「経過」
2026-09-17 の末尾にある **「サイトマップ index の子が Google に読まれていない」を Sitemaps API で
裏づけ、コード側でできる手当てを切り出したもの**。復旧計画の A（週次監査）の拡張と、
`home/robots.txt` の 1 か所の変更で済む。
**対象**：`home/robots.txt`・`scripts/gsc-canonical-audit.mjs`・`scripts/lib/search-console.mjs`・
`scripts/test/`（新規テスト 1 本）
**起票**：2026-09-19
**緊急度**：中。Google 登録ゼロの根本原因（サイト単位の品質判定）はこれでは直らないが、
**learn の 39 URL は「Google が存在を知らない」段階で止まっている**ので、知らせる手段を増やすのは
判定を待つあいだにできる数少ない作業

---

## 背景と根拠

### 計測値（2026-09-19 取得・Search Console Sitemaps API）

`GET https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fhasokon.com%2F/sitemaps` と、
子サイトマップごとの `GET .../sitemaps/{feedpath}` をサービスアカウント
（`GOOGLE_SERVICE_ACCOUNT_JSON`、`webmasters.readonly`）で叩いた結果：

| サイトマップ | Google の状態 | 最終ダウンロード | 送信 URL 数 | 登録 |
|---|---|---|---|---|
| `/sitemap.xml`（index） | 送信済み（09-14 に運営者が再送信） | 2026-09-14 | —（index なので数えない） | — |
| `/tools/sitemap.xml` | 08-14 に個別送信済み | 2026-09-13 | 56 | **0** |
| `/games/sitemap.xml` | 08-14 に個別送信済み | 2026-09-16 | 26 | **0** |
| `/sitemap-home.xml` | 個別送信なし。**index 経由で認識** | 2026-09-08 | 2（本番 v1.18.0 の実体と一致） | **0** |
| `/learn/sitemap.xml` | **`404 notFound`：「送信済みでも既知でもないサイトマップ」** | **一度もない** | （実体は 39） | — |

読み取れること：

1. **index の子は「読まれることもある」が「learn だけ一度も読まれていない」。** `sitemap-home.xml` は
   個別送信していないのに index 経由で 09-08 に読まれている。なのに同じ index に並ぶ
   `/learn/sitemap.xml` は Google に存在すら認識されていない。実体は `curl` で 200・`application/xml`・
   6,058 バイト、`<urlset>` の形式も tools / games と同じで、**ファイル側に違いは無い**
   （2026-09-19 に確認）。Google 側の index の処理が途中で止まっている、あるいは index の
   4 本目を後回しにしたまま再訪していない、のどちらか
2. **仮説：index 経由の子は、個別送信した子より読まれにくい。** `sitemap-home.xml` の最終ダウンロードは
   **09-08** で、個別送信した tools（09-13）・games（09-16）より古い。index 自体は 09-14 に
   再送信されているが、その日に子まで読み直された形跡は無い。**根拠はこの比較 1 件だけ**なので
   観測（日付）と仮説（読まれにくい）を分けて扱い、B の監査を数週間回して確かめる。
   （送信 URL 数 2 は本番 v1.18.0 の実体と一致している。`/about.html` を足した #219 は main に
   あるだけで本番未反映なので、ここから「子が再読込されていない」とは言えない。
   起票時の自己点検で訂正。当初は main の 3 URL で数えていた）
3. この 39 は、09-16 の URL 検査 API の内訳（`URL is unknown to Google` **91** 件のうち learn **39**）と
   一致する。**learn の unknown はサイトの品質判定以前に、Google に URL を渡せていないことが原因**
4. 3 本とも「登録 0」なのは既知の状態（[google-index-recovery.md](./google-index-recovery.md)）で、
   本仕様の対象外

### 検索流入の現状（同日取得）

- **GSC 検索パフォーマンス（`https://hasokon.com/`）**：2026-08-20〜09-16 の表示は **合計 1**
  （09-06 に 1 回、`/tools/privacy/` 掲載順位 1）。**クリック 0**
- **GA4（プロパティ 548154955、09-05〜09-18、着地セッション）**：`google / organic` **17**
  （うち `/games/2048/` 11）、`bing / organic` **156**、`chatgpt.com` **27**（2 番目の流入元）。
  learn への着地は 0

### いまの週次監査では見つからない

`.github/workflows/gsc-audit.yml`（毎週月曜）が回す `scripts/gsc-canonical-audit.mjs` は
URL 検査 API の `coverageState` を数えるだけで、**サイトマップが読まれたかは見ていない**。
上の表は今回 API を手で叩いて初めて分かった。復旧計画の「A の週次監査には、index の子サイトマップが
読まれているかの確認も足す」（09-17 の経過）が未着手のまま

## 現状

- `home/robots.txt` は `Sitemap: https://hasokon.com/sitemap.xml` の 1 行だけ。子サイトマップ 4 本は
  index を経由しないと見つからない
- 監査スクリプトは `collectUrls()` で index を辿って URL を集めるが、Google 側の
  「読んだ／読んでいない」は取っていない
- 再現：上の Sitemaps API を叩く（`scripts/lib/google-auth.mjs` の `fetchAccessToken()` で
  取ったトークンで `GET .../sites/{site}/sitemaps`）。`/learn/sitemap.xml` が `404 notFound` で返る

## 提案する仕様

### A. `home/robots.txt` に子サイトマップ 4 本を `Sitemap:` で直接書く

```
User-agent: *
Allow: /

Sitemap: https://hasokon.com/sitemap.xml
Sitemap: https://hasokon.com/sitemap-home.xml
Sitemap: https://hasokon.com/tools/sitemap.xml
Sitemap: https://hasokon.com/games/sitemap.xml
Sitemap: https://hasokon.com/learn/sitemap.xml
```

- `robots.txt` の `Sitemap:` は複数行書ける（Google・Bing とも公式に対応）。index の処理と
  **独立した発見経路**なので、index の 4 本目が読まれないという今回の症状に直接効く
- index の行は残す（Bing・IndexNow 系のクローラーは index を正しく辿っている）
- **テスト**：`scripts/test/robots-sitemaps.test.mjs` を新設し、`home/robots.txt` の `Sitemap:` 行の
  集合が **`home/sitemap.xml` の `<sitemap><loc>` ＋ index 自身**と一致することを
  `scripts/lib/sitemap.mjs` の `parseLocs()` で検証する（子を増減したら両方直さないと落ちる）。
  既存の `scripts/test/indexnow-submit.test.mjs` が `robots.txt` の `Allow: /` を見ているので、
  その約束は壊さない
- `home/robots.txt` は test.hasokon.com にも同じ内容で同期されるが、いまも `hasokon.com` の URL を
  書いているので扱いは変わらない（Basic 認証の内側）。**テスト環境向けの分岐は作らない**

### B. 週次監査に「サイトマップが読まれたか」を足す

`scripts/lib/search-console.mjs` に Sitemaps API の薄い関数を 2 つ足す：

```js
export async function listSitemaps({ siteUrl, accessToken }, options = {})   // GET sites/{site}/sitemaps
export async function getSitemap({ siteUrl, feedpath, accessToken }, options = {}) // GET sites/{site}/sitemaps/{feedpath}
```

`scripts/gsc-canonical-audit.mjs` は index を辿って得た `sitemaps`（既に持っている）の各 URL について
`getSitemap()` を呼び、`--out` の JSON に次を足す：

```json
"sitemaps": [
  { "path": "https://hasokon.com/learn/sitemap.xml", "known": false, "lastDownloaded": null, "submitted": null, "indexed": null },
  { "path": "https://hasokon.com/sitemap-home.xml", "known": true, "lastDownloaded": "2026-09-08T19:37:21.507Z", "submitted": 2, "indexed": 0 }
]
```

- 標準エラーに 1 本 1 行で「読まれた日・送信数・登録数」を出し、**`known: false` が 1 本でもあれば
  終了コード 1**（いまの「未完了」と同じ扱い。ジョブは落とさず、ログで分かる）
- **`known: false` は「Google が読んでいない」ではなく「サイトマップ レポートに無い」**。
  robots.txt 経由で発見されたサイトマップはレポートに出ないので、A が効いても `false` のまま。
  ログの文言もそこまでしか言わない（2026-09-19 の #237 レビューで訂正。「経過」参照）
- `lastDownloaded` が **14 日より古い**子も同じく 1 で知らせる（「index 経由の子は個別送信の子より
  読まれにくい」という上記 2 の**仮説**を見張るため。**閾値 14 日は暫定**で、監査を数週間回して
  子ごとの読まれ方が分かったら見直す。終了コード 1 はいまのワークフローでは落ちない）
- `getSitemap()` の `feedpath` は **URL 全体を `encodeURIComponent()` でエンコード**する
  （`sites/{site}` と同じ扱い）。**404 は `isRetryable()` の対象にせず、そのまま `known: false` に落とす**
  （再試行で無駄に待たない）
- それ以外の API の失敗（401/403/5xx）は既存の `isRetryable()`・`backoffDelay()` で再試行し、
  それでも駄目なら終了コード 2（既存の約束どおり）
- `gsc-audit.yml` は変更なし（`--out` の JSON に列が増えるだけ）。artifact を開けば
  「learn が読まれたか」が毎週分かる
- テストは `scripts/test/search-console.test.mjs` に `fetch` を差し替えた 2 関数分と、
  `scripts/test/gsc-canonical-audit.test.mjs` に `known: false` で終了コード 1 になる 1 ケースを足す

### C. 運営者作業（1 回・画面）

Search Console の「サイトマップ」で **`/learn/sitemap.xml` と `/sitemap-home.xml` を個別に送信**する
（[google-index-recovery.md](./google-index-recovery.md) 09-17 の「次の手」と同じ。A・B とは独立に
今すぐできる）。

**順序は「C と A を同時」に決める。基準日は本番リリース**（2026-09-19 マージ後レビューの推奨 1）。
A（`home/robots.txt`）は main へのマージでは test.hasokon.com（Basic 認証の内側）にしか出ず、
Google に見えるのは `v*` タグの本番リリース後なので、**C はその本番リリースの日に合わせて打つ**。
C を先に打って 1 週間待てば「どちらが効いたか」を切り分けられるが、learn の 39 URL を渡すのが
1 週間遅れるので、切り分けより速さを採る。効いたかは B の監査で見る：**`known: true` は C だけでも立つ**
（robots.txt 経由の発見はレポートに出ない。下記「期待される効果」）ので、C の完了は送信後 1 週間の
監査で `known: true` と `lastDownloaded` が入ることで確認し、**A が効いているかは 2 回目以降の監査で
`lastDownloaded` が更新され続けるか**と、learn の `coverageState` が `unknown` から動くかで見る。
実施したら、**本ファイルの「経過」と google-index-recovery.md の「経過」の両方に日付を残す**
（二重管理で片方だけ更新されるのを避ける）

## 実装者への申し送り

- 実装 PR は `home/`・`scripts/` を触るので、**コミット・PR タイトルは `docs:` ではなく
  `feat:`（B の監査拡張）／`chore:`（A の robots.txt）**にする（CLAUDE.md の約束。
  google-index-recovery.md と同じ）
- 実装後は本ファイルの `**状態**：` 行を「実装済み」に上げ、`docs/DECISIONS.md` の冒頭に
  1 エントリ足す（union マージの約束どおり、既存エントリは触らない）

## 経過

- 2026-09-19：起票（#234）。同じ PR の 1 件目の企画レビュー
  （[#234 のコメント](https://github.com/ke-iwata/hasokon-home/pull/234#issuecomment-5737748558)、
  レビュアー `session_012CB1PpSavg5FWrhoEA5RKK`）で、`sitemap-home.xml` の実体を
  main（3 URL）で数えていた誤りを訂正（本番 v1.18.0 は 2 URL）。同日マージ
- 2026-09-19：マージ後に付いた 2 件目のレビュー
  （[#234 のコメント](https://github.com/ke-iwata/hasokon-home/pull/234#issuecomment-5738006272)、
  レビュアー `session_015RdWAewxmB3VNfiRUTGS6e`）を #238 で反映：この「経過」の出どころを明記、
  C と A は同時（基準日は本番リリース）と決定、「読まれにくい」は仮説・14 日は暫定と明記、
  測り方の 91 → 52 は上限ケースに弱めた（主指標は「unknown が減る方向」。`known` は C の進捗）
- 2026-09-19：**A・B を実装（#237）。** `home/robots.txt` に子サイトマップ 4 本を `Sitemap:` で追加し、
  `scripts/lib/search-console.mjs` に `listSitemaps()` / `getSitemap()` / `toSitemapStatus()` を足して
  週次監査が 1 本ずつの「読まれた日・送信数・登録数」を出すようにした。
  `--out` の JSON に `sitemaps` が増え、レポートに無い／14 日より古い子があれば終了コード 1。
  **C は未実施**（Search Console の画面で `/learn/sitemap.xml` と `/sitemap-home.xml` を個別送信する）
- 2026-09-19：#237 のレビューで、**A の効果は B では測れない**という指摘を受けて確認方法を訂正。
  サイトマップ レポート（＝ Sitemaps API）は
  [公式ヘルプ](https://support.google.com/webmasters/answer/7451001)に
  「**robots.txt 経由で見つかったサイトマップは出さない**」と明記があり、
  A が効いて `/learn/sitemap.xml` がクロールされても `known` は `false` のままになる。
  **`known` は C の進捗を見るもの**、**A の効果は `coverageByState` の learn 39 件が減るかで見るもの**、
  と役割を分けた。`formatSitemapStatus()` の文言も「Google は知らない」から
  「サイトマップ レポートに無い」に弱めた（API が言えるのはそこまで）

## 期待される効果

- **learn の 39 URL が「Google が存在を知らない」から先へ進む。** 主の指標は、週次監査の
  `URL is unknown to Google` が **減る方向に動く**こと（`--out` の `rows` に URL ごとの
  `coverageState` があるので learn だけ数えられる。上限ケースは learn の 39 が全部 `Crawled` か
  `Discovered` に移って 91 → 52）。渡しても Google が取りに来ない可能性はあり、
  登録されるかどうかはサイト単位の品質判定次第で、**この提案が約束するのは「渡す」ところまで**
- **A の効果を B（`sitemaps` の `known`）で測ってはいけない。** サイトマップ レポートは
  「レポートから送信したもの」と「送信済み index の子」しか出さず、
  **robots.txt 経由で見つけたものは読まれていても出ない**
  （[公式ヘルプ](https://support.google.com/webmasters/answer/7451001)）。
  `known` が `false` から `true` に変わるのは **C をやったとき**で、
  そのときも A と C のどちらが効いたかは区別できない
- 送信済み index の子がレポートに出ていない・読み直されていない状態を、
  次からは手で API を叩かなくても月曜のログで気づける。
  ただし **C を済ませるまでは learn と home の 2 本で終了コード 1 が毎週立つ**
  （learn はレポートに無い、home は最終ダウンロードが 14 日より古くなる）
- Bing にはすでに読まれているので、Bing 側の変化は期待しない（測っても差は出ないはず）

## 工数の見積り

| 作業 | 目安 |
|---|---|
| A：`robots.txt` 4 行 ＋ テスト 1 本 | 約 10k トークン |
| B：Sitemaps API 2 関数 ＋ 監査への組み込み ＋ テスト | 約 40k トークン |
| C：運営者の画面作業 | 5 分 |
| 合計 | **約 50k トークン** |

## やらないこと

- **index をやめて 1 本の平らなサイトマップにまとめる**：tools / games / learn はそれぞれ Next.js の
  `app/sitemap.ts` が出しており、home にはビルド工程が無い。まとめるにはデプロイ時に
  4 本を結合する工程が要り、`lastmod` を見る IndexNow の差分検出（`scripts/indexnow-submit.mjs`）
  にも手が入る。robots.txt の 4 行で同じ発見経路が作れるので見送る
- **監査から Sitemaps API の `submit`（PUT）で未知の子を自動送信する**：書き込みには
  `webmasters`（読み取り専用でない）スコープが要り、週次 cron から Search Console に書き込むのは
  運営者が把握しない操作になる。まず C を手で 1 回やり、効くと分かってから検討する
- **learn のサイトマップを tools のサイトマップに合流させる**：URL の管轄が変わるだけで、
  Google が index の 4 本目を読まない原因の説明にはならない
