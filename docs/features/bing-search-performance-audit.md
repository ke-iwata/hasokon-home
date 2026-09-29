# 検索パフォーマンスの実測値は Bing にしかない — Bing Webmaster Tools API を週次監査に足し、「どの語で・どのページが」出ているかを毎週残す

**状態**：A・B・C を実装済み（2026-09-29）。**D（運営者の API キー発行・Secret 登録）待ち**。キーが入るまで週次監査は警告を出して Bing だけ飛ばす。
**着手条件**：**運営者が Bing Webmaster Tools の「設定 → API アクセス」で API キーを発行し、
GitHub Secret `BING_WEBMASTER_API_KEY` に登録する**（画面作業。所有権確認は 2026-09-25 に済んでいるので、
発行は数分）。キーが無い間は、週次監査は警告だけ出して飛ばす（`GOOGLE_SERVICE_ACCOUNT_JSON` 未設定時と同じ扱い）。
**対象**：`scripts/bing-search-stats.mjs`（新規）・`scripts/lib/bing-webmaster.mjs`（新規）・
`scripts/test/bing-webmaster.test.mjs`（新規）・`.github/workflows/gsc-audit.yml`（ステップ 1 つ追加）
**起票**：2026-09-28（セッション `session_01Bjfv5Ay9BkJVSJH766VddV`）
**関連**：[google-index-recovery.md](./google-index-recovery.md)（運営者作業 4 で Bing Webmaster Tools に
サイトマップを送信。「初回計測は 09-28 の週次監査で一緒に取る」と書いたが、**画面作業なので自動では取れない**。
本提案はその計測を API に置き換えるもの）・[ai-assistant-channel.md](./ai-assistant-channel.md)
（同じ週次ジョブに GA4 のチャネル計測を足した先例。本提案は同じ枠に Bing を足す）・
[sitemap-lastmod-guardrail.md](./sitemap-lastmod-guardrail.md)（IndexNow の送信先が Bing。送った結果が
効いたかは、Bing 側の表示回数でしか見えない）

---

## 背景と根拠

### Google の検索パフォーマンスは 28 日で表示 1 回。流入の 9 割は Bing

2026-09-28 に Search Console API（`searchAnalytics/query`）と GA4 Data API（`runReport`、
`properties/548154955`）で取得した。

**Search Console（2026-08-29〜09-26、4 プロパティ合計）**

| プロパティ | 表示回数 | クリック |
|---|---|---|
| `https://hasokon.com/` | **1**（`/tools/privacy/` が 09-06 に 1 回） | 0 |
| `https://tool.hasokon.com/` | 0 | 0 |
| `https://game.hasokon.com/` | 0 | 0 |
| `https://roulette.hasokon.com/` | 0 | 0 |

**GA4（直近 28 日 08-31〜09-27 ／ その前の 28 日）**

| チャネル・参照元 | 直近 28 日 | 前の 28 日 |
|---|---|---|
| Organic Search 全体 | **358** | 111 |
| うち `sessionSource: bing` | **319** | — |
| うち `sessionSource: google` | 25 | — |
| AI Assistant（chatgpt.com） | 79 | 8 |
| Direct | 38 | 151 |

Organic Search が 3 倍に伸びたが、**その 89% が Bing**。Google からは 25（Search Console の表示 1 回と
食い違うので、Discover やアプリ内ブラウザが混ざっているとみられる。ai-assistant-channel.md の指摘と同じ）。

### 伸びたのは「期日のある制度」のツール。だが**何の語で出ているのかが分からない**

ページ別（GA4・セッション、直近 28 日 ／ 前の 28 日）：

| ページ | 直近 | 前 |
|---|---|---|
| `/tools/saitei-chingin/`（最低賃金） | **117** | 1 |
| `/tools/shuzei-kaisei/`（酒税改正・10-01 施行） | **56** | 0 |
| `/tools/tabako-zei-neage/`（たばこ税） | **52** | 2 |
| `/tools/yoikuhi-keisan/`（養育費） | 44 | 1 |
| `/tools/kogaku-ryoyohi/`（高額療養費） | 23 | 1 |
| `/tools/nenrei-keisan/`（年齢計算） | 21 | 1 |

最低賃金は 1 → 117 と、1 か月で当サイト最大のページになった（10 月の改定期）。
**これは Bing の検索結果に載った結果とみられるが、「最低賃金 いくら」で出ているのか
「最低賃金 東京 2026」で出ているのか、表示回数に対するクリック率がいくつなのかは、
いまのサイトのどこにも残らない。** Search Console にはデータが無く（上表）、GA4 は検索語を持たない。

つまり **title・description・見出しを検索語に合わせて直す、という SEO の基本作業の根拠が、
このサイトには 1 つも無い**。Google の登録が戻るまで（[google-index-recovery.md](./google-index-recovery.md)、
09-28 の再計測で「クロール済み - 未登録」**43** 件・unknown 68 件）、Bing のデータが唯一の実測値になる。

### Bing Webmaster Tools の画面では、誰も取りに行かない

google-index-recovery.md の 2026-09-25 の経過に、「初回計測は 09-28（月）の週次監査で一緒に取り、ここに残す」と
書いた。しかし**週次監査（`gsc-audit.yml`）は Search Console と GA4 の API しか叩かない**ので、Bing の値は
画面を開いて手で写すしかない。同じ経過のなかで「画面作業なので誰も取りに行かない」と自分で書いてある。
今回（09-28）も取れていない。**画面作業のままでは、来週も再来週も同じ**。

### API はある。キーは運営者しか発行できない

Bing Webmaster Tools API は、API キー（設定 → API アクセスで発行。**ユーザー単位で 1 本**、
確認済みの全サイトに使える）を `apikey` クエリに付けた GET で叩ける
（[Getting Access to the Bing Webmaster Tools API](https://learn.microsoft.com/en-us/bingwebmaster/getting-access)、
2026-09-28 取得）。JSON エンドポイントは `https://ssl.bing.com/webmaster/api.svc/json/<メソッド>?siteUrl=…&apikey=…`。

使うメソッド（[IWebmasterApi](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi)、2026-09-28 取得）：

| メソッド | 返るもの | 使い道 |
|---|---|---|
| `GetRankAndTrafficStats` | 日別の表示回数・クリック | サイト全体の週次の推移 |
| `GetQueryStats` | 上位クエリの表示・クリック・平均掲載順位 | **どの語で出ているか** |
| `GetPageStats` | 上位ページの表示・クリック・平均掲載順位 | どのページが出ているか・CTR |
| `GetPageQueryStats(siteUrl, page)` | 特定ページのクエリ内訳 | 上位 5 ページの語を見る（任意） |

`GetQueryStats` の応答例（同ページ）：`{"d":[{"Query":"…","Impressions":100,"Clicks":15,"AvgImpressionPosition":17,"AvgClickPosition":18,"Date":"/Date(1316156400000-0700)/"}]}`。
**データは週 1 回更新**（同ページの Remarks）なので、週次で取るのがちょうどよい。

## 提案する仕様

### A. `scripts/bing-search-stats.mjs`（新規）

`scripts/ga4-ai-channel.mjs` と同じ作り（依存ゼロ・`--out`・`--dry-run`・`--help`・終了コード 0/2）。

```
node scripts/bing-search-stats.mjs --site https://hasokon.com/ --out bing-2026-10-05.json
```

- 環境変数 `BING_WEBMASTER_API_KEY` を読む。**キーはログに出さない**（URL のクエリに載るので、
  失敗時のエラーメッセージから `apikey=` を伏せる。テストで確認する）
- `GetRankAndTrafficStats` → `GetQueryStats` → `GetPageStats` の順に 3 回 GET。各 1 回まで再試行
  （`scripts/lib/search-console.mjs` の `backoffDelay` / `isRetryable` を流用）
- 標準出力に Markdown の表を出す：
  1. 直近 7 日・28 日の表示回数とクリック（`GetRankAndTrafficStats` の `Date` で切る。**日別で返るとは決めつけない**。
     週ごとにまとまった点で返ったら、表に「週単位」と書いて 7 日の行は出さない）
  2. 上位クエリ **20 件まで**（表示回数順。クリック・CTR・平均掲載順位）
  3. 上位ページ 20 件（同上）。**パスは `hasokon.com` からの相対**にして GA4 の `pagePath` と目視で突き合わせられるようにする
- **検索語の出し方（このリポジトリは public）**：`ke-iwata/hasokon-home` は公開リポジトリで、Actions のログは誰でも読め、
  artifact もサインインすれば誰でも落とせる。検索語には人名など個人に関わる語がまれに混ざる（養育費・相続まわりで特に）。
  そのため **クエリは表示回数 5 回以上のものだけを、上位 20 件まで**出し、**それより細かい行は `--out` の JSON にも残さない**
  （`MIN_IMPRESSIONS = 5`・`TOP_N = 20` を lib の定数にしてテストで固定する）。ページ別の表は URL だけなので絞らない。
  合計値（`GetRankAndTrafficStats`）はそのまま出す
- `--out` で JSON も残す（`gsc-audit.yml` の artifact）。上の絞り込みを通したあとの行だけ

### B. `scripts/lib/bing-webmaster.mjs`（新規・純関数）

- `endpointUrl(method, siteUrl, apiKey, extra)`：URL の組み立て
- `parseDotNetDate('/Date(1316156400000-0700)/')` → ISO 日付。**この形式は WCF 固有**なので単体テストを置く
- `summarizeTraffic(rows, nowIso)`：7 日・28 日の合計
- `topN(rows, key, n)`・`filterQueries(rows, minImpressions)`・`formatReport(...)`：表の組み立てと絞り込み
- `redactKey(message, apiKey)`：エラー文からキーを伏せる

### C. `.github/workflows/gsc-audit.yml` にステップを 1 つ足す

GA4 のステップ（「AIアシスタント経由の流入を数える」）の直後に足す。**いまの GA4 のステップは失敗しても落とさない**
（終了コードが 0 でなければ `::warning` を出すだけ。「こちらの失敗で GSC の結果まで落とさない」）。Bing も同じにする。
キーの期限切れ・レート制限はふつうに起こるので、**Bing の失敗でその週の GSC・GA4 の結果を失わない**ことが条件。

- **Bing のステップは終了コードで落とさない。** 0 でなければ `::warning` を出して次へ進む
- **`steps.audit.outputs.skipped` では止めない。** Bing は Google のサービスアカウントと関係が無いので、
  自前で `BING_WEBMASTER_API_KEY` が空なら `::warning` を出して飛ばす。`mkdir -p audit-out` もこのステップで行う
  （GSC のステップが飛ばされていると `audit-out/` が無い）
- **artifact のステップの条件を直す。** いまは `if: steps.audit.outputs.skipped == 'false'` だけで `always()` が無い。
  Bing だけが動いた週も残るように `if: always() && hashFiles('audit-out/**') != ''` にする。
  artifact の名前は既存の `gsc-audit-${{ github.run_id }}` のまま（日付ではない）で、その中に `bing-<日付>.json` を同梱する
- **リポジトリには commit しない**（既存の方針どおり）

### D. 運営者作業（1 回だけ）

1. [Bing Webmaster Tools](https://www.bing.com/webmasters) にサインイン → 右上「設定」→「API アクセス」→ 規約に同意 → 「API キーを生成」
2. GitHub の `ke-iwata/hasokon-home` → Settings → Secrets and variables → Actions → `BING_WEBMASTER_API_KEY`
3. Actions の「GSC audit」を手動起動（`workflow_dispatch`）して、初回の表を取る。その値を
   google-index-recovery.md の経過（09-25 の「初回計測」の行）に書き戻す

## 期待される効果

- **SEO の作業に根拠ができる。** 「最低賃金」で 117 セッションを取っているページの検索語と CTR が分かれば、
  title・description の改善は当てずっぽうでなくなる。次に伸びる制度ツール（酒税・たばこ税・年末調整）も同じ
- **IndexNow の効果が見える。** [sitemap-lastmod-guardrail.md](./sitemap-lastmod-guardrail.md) は
  「Bing に通知されたか」を送信ログでしか確認できない。表示回数の推移が週次で残れば、通知 → 表示の結び付きを追える
- **Google 復旧の見切りに使える。** Google が戻らない間、Bing の表示回数が伸びているなら
  「ページの品質」ではなく「Google 側の判定」の問題だと切り分けられる（逆も同じ）
- 数値目標：**導入 4 週で、上位クエリ 20 件と CTR が毎週 artifact に残っている状態**。それを見て title を直すのは別の仕様書

## 工数の見積り

| 作業 | 目安 |
|---|---|
| B：lib（URL 組み立て・日付変換・集計・伏せ字）＋ テスト | 約 20k トークン |
| A：CLI（引数・再試行・表の出力） | 約 20k トークン |
| C：workflow のステップ追加 | 約 5k トークン |
| D：運営者の画面作業（キー発行・Secret 登録・初回起動） | 人手 10 分 |
| 合計 | **約 45k トークン** |

## やらないこと

- **Bing への URL 送信（`SubmitUrlBatch`）は使わない。** すでに IndexNow で送っており、経路を 2 本にすると
  どちらが効いたか分からなくなる
- **結果をリポジトリに commit しない。** 既存の週次監査と同じく Actions のログと artifact に残す
- **検索語を全件は出さない。** public リポジトリのログ・artifact は誰でも見られるので、表示回数 5 回未満のクエリは
  表にも JSON にも残さない（上の A）。全件が要る場面は Bing Webmaster Tools の画面で見る
- **キーの OAuth 化はしない。** API キーで足りる（読み取りだけ）。キーが漏れたら Bing 側で削除して再発行する
- **title・description の書き換えはこの仕様書に含めない。** 4 週ぶんの数字を見てから別の仕様書で

## 実装者への申し送り

- `siteUrl` は Bing に登録した表記（`https://hasokon.com/`、末尾スラッシュあり）と一致させる。違うと空の配列が返る
- 応答の `d` が空でもエラーにしない（登録直後は 0 件が正常）。「0 件」と「取れなかった」は表で区別する
- `Date` は `/Date(ミリ秒±タイムゾーン)/` 形式。`Date.parse` では読めないので B の変換を通す
- `GetRankAndTrafficStats` の粒度は返ってきた `Date` の間隔から判定する。日別なら 7 日・28 日、週単位なら 28 日だけを出し、
  表の見出しに粒度を書く（「7 日」を週の点から作らない）
- キーが URL に載る API なので、**`--dry-run` の出力にもキーを出さない**（`apikey=***` に置き換える）
