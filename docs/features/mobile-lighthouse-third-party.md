# スマホの Lighthouse がツール 44・ゲーム 29（トップは 92）— 広告・計測スクリプトの読み込み順と、リンク色のコントラスト 4.44 を直す

**状態**：実装中（2026-09-27 起票。**E・A・D を実装済み**（セッション `session_01U5xhGbNw2tJCNcpYydXyXY`）。B は E の基準値が 1 群 300 件たまってから、C は運営者の判断待ち）。A・D は小さく、実装のPRを分けずに 1 本で出せる。B は tools と games の両方に同じ変更。
C は**運営者の AdSense 管理画面の作業**（コード変更なし）。E は計測で、B の効果を測るために B より先に入れる。
**対象**：`tools/`・`games/`（`app/layout.tsx`・`lib/analytics.ts`。**D の `globals.css` は tools だけ**——games には `.panel` / `.hint` が無い）。
`home/` は対象外（下記「現状」のとおり 92 点で問題なし）
**起票**：2026-09-27（セッション `session_01GYZkZ7NZZVDeK5X5vVDidv`）
**関連**：[measurement-hygiene.md](./measurement-hygiene.md)（GA4 の送り方の約束。E はこの上に載せる）・
[mobile-one-screen.md](./mobile-one-screen.md)（スマホ 1 画面の約束。本提案は「表示が速いか」で、あちらは「収まるか」）・
[google-index-recovery.md](./google-index-recovery.md)（Google に登録されたあと、順位を決める要素の 1 つが表示速度）

---

## 背景と根拠

### 計測値（2026-09-27 取得。Lighthouse 12・スマホ・シミュレーション既定値）

Lighthouse 12 をこの実行環境の Chromium（141）で、既定のスマホ設定（Moto G Power 相当・CPU 4 倍遅・RTT 150ms・1.6Mbps）で回した。
**同じ条件で 3 ページを比べた結果**：

| ページ | Performance | LCP | TBT | TTI | 第三者スクリプトの主スレッド占有 | 総転送量 | 未使用 JS |
|---|---|---|---|---|---|---|---|
| `/`（トップ。AdSense なし） | **92** | 3.2 s | 80 ms | 3.6 s | 60 ms | 203 KiB | 73 KiB |
| `/tools/saitei-chingin/`（着地 1 位のツール） | **44** | 6.4 s | 880 ms | 10.8 s | **790 ms** | 817 KiB | 323 KiB |
| `/games/block-puzzle/`（`tool_use`＝開始＋結果の回数が 1 位のゲーム） | **29** | 8.1 s | 430 ms | 8.7 s | 430 ms | 740 KiB | 279 KiB |

注意：この環境の外向き HTTPS は代理サーバーを通るため、**TTFB（0.6〜1.1 s）は実測より悪く出ている**。
絶対値は運営者の手元（PageSpeed Insights）で取り直すこと。ただし **3 ページの差は同じ条件の中の差**で、差の出どころは下の内訳で説明できる。

**`/tools/saitei-chingin/` の内訳（Lighthouse の `third-party-summary` と `bootup-time`）**

| 出どころ | 転送量 | 主スレッドをブロック |
|---|---|---|
| Google/Doubleclick Ads（`adsbygoogle.js` 2 本・`show_ads_impl_fy2021.js`） | 314 KB | **511 ms** |
| Google FundingChoices（`fundingchoicesmessages.google.com/i/ca-pub-…`：同意メッセージ） | 106 KB | **184 ms** |
| Google Tag Manager（`gtag/js`） | 177 KB | 97 ms |
| 自前の最大チャンク（`_next/static/chunks/25o46h8mdjlrg.js`。React・Next の実行時） | 68 KB（227 KB 展開） | scripting 1,010 ms |

- `uses-rel-preconnect`：`https://pagead2.googlesyndication.com` への preconnect が無く、**推定 300 ms** の損
- `color-contrast`（Accessibility 0.96 の唯一の減点）：`div.card > div.panel > p.hint > a` の**コントラスト比 4.44**
  （前景 `#15803d` ＝ `--accent`、背景 `#f3f1ed` ＝ `--surface-2`、12.48px）。WCAG AA の 4.5 にわずかに届かない。
  `.hint` は `--fs-xs`（0.78rem）で、結果パネル内の出典リンクがこの組み合わせになる。**ツール全ページの結果パネルに同じ構造がある**
- `uses-http2`「16 リクエストが HTTP/2 でない」は**この環境の代理サーバーの影響**（`curl` で本番は HTTP/2 を返す）。無視する
- `bf-cache`・`third-party-cookies` は GA4・AdSense 由来で、Lighthouse 自身が「対処不能」に分類している。無視する

### いまの利用者への影響は小さいが、「これから来る利用者」の条件になる

GA4（プロパティ 548154955、直近 28 日 08-30〜09-26）：全 490 セッションのうち **desktop 421（86%）・mobile 66（13%）**。
流入の 63% が Bing で、Bing はデスクトップの Edge から来る。**いまの利用者の 9 割近くはスマホの遅さに当たっていない**。

一方で：

- [google-index-recovery.md](./google-index-recovery.md) のとおり Google の登録はトップ 1 URL のまま。登録が戻ったとき、
  モバイルの表示速度（Core Web Vitals）は順位に効く要素の 1 つで、**戻った瞬間に不利を抱えた状態で並ぶ**
- AI Assistant チャネル（82 セッション・17%）の mobile 比率は 19/82（23%）で、Organic の 18/354（5%）より高い。
  伸びているチャネルほどスマホの割合が高い
- 直帰率は mobile 47%（engagementRate 0.53）、desktop 37%（0.63）。**差の全部が速度ではない**が、
  ツール 1 本の初回表示が 6〜8 秒なら数字に出て当然の値

### 直すべき順序：計測 → 小さく確実 → 広告の読み込み順

当サイトの約束（[ai-assistant-channel.md](./ai-assistant-channel.md)「測るほうを先に入れた」）に沿って、
**利用者の実測値（Core Web Vitals）を GA4 に送る**ところから始める。Lighthouse はラボ値で、
運営者の PSI と本仕様書の値がずれるのは代理サーバーのせいか、本当にそうなのかを**利用者の実測で決める**。

---

## 現状

- `tools/app/layout.tsx`・`games/app/layout.tsx`：`<script async src="…adsbygoogle.js?client=…">` と
  `<script async src="…gtag/js?id=…">` を `<head>` に置いている。`async` なので HTML の解析は止めないが、
  **到着した順に主スレッドを取る**ので、初回描画の前後に広告スクリプト 314 KB の評価が挟まる
- `preconnect` / `dns-prefetch` は無い
- FundingChoices（同意メッセージ）は**コードに無い**。AdSense の「プライバシーとメッセージ」で有効になっている
  メッセージ（EU・英国・米国州法のいずれか）が、`adsbygoogle.js` から自動で読み込んでいる。
  日本の利用者にはメッセージは表示されないが、**スクリプト（106 KB・184 ms）は全員が読み込む**
- `home/index.html` は AdSense を入れていないので 92 点。`analytics.js` は `defer`

---

## 提案する仕様

### E：Core Web Vitals を GA4 に送る（最初に入れる。B の前後比較のため）

- `web-vitals`（Google 製・約 2 KB・attribution 無し版）を tools / games の `lib/analytics.ts` に足し、
  `onLCP` / `onINP` / `onCLS` で **`web_vitals` イベント**（`metric_name`・`metric_value`・`metric_rating`・`metric_id`）を送る
- **`metric_value` は整数で送る。CLS だけ 1000 倍**（web.dev の推奨どおり `Math.round(name === 'CLS' ? value * 1000 : value)`。
  GA4 のイベントパラメータは小数の扱いが弱く、CLS 0.05 のような値が丸められて消えるため）。読むときは 1000 で割る
- `shouldTrack()` の判定はそのまま（本番ホスト以外は送らない。[measurement-hygiene.md](./measurement-hygiene.md)）
- 送信は `sendBeacon` が使えるので `transport_type: 'beacon'`。ページ離脱時の INP・CLS を落とさない
- **読み方は `metric_rating`（good / needs-improvement / poor）の割合を主にする。** GA4 の探索にはパーセンタイルの集計が
  無いので、p75 はそのままでは出ない。運営者作業として **`metric_name`・`metric_rating` をカスタムディメンション、
  `metric_value` をカスタム指標として GA4 に登録する**（登録前のイベントは探索で内訳を切れない）。
  **p75 を見たいときは BigQuery エクスポートが前提**（無料枠で足りる量。入れるかは別判断）
- 目標は Google の「良好」の閾値（LCP 2.5 s・INP 200 ms・CLS 0.1）で、**good の割合 75% 以上**を「良好」と読む
  （CrUX の判定と同じ基準）
- **判断の下限**：mobile は 28 日で 66 セッションしか無いので、1 ページあたり数十件しか集まらない。
  **比較の 1 群あたり LCP の件数が 300 件に達するまで判定しない**（達しない場合は tools 全ページ・games 全ページの単位で束ねる）
- プライバシー：送るのは表示速度の数値・評価・ページの URL だけで、ツールに入力された内容は含まない。
  `home/privacy.html` の「収集されるのは閲覧されたページ・滞在時間・参照元・大まかな地域・端末の種類など」の範囲内と考えるが、
  実装の PR で同じ段落に「表示速度」の語を足しておく（読む人が迷わないように）
- テスト：`tests/analytics.test.ts` に「本番ホスト以外では web_vitals を送らない」「イベント名・パラメータ名が固定」
  「CLS だけ 1000 倍・整数」を足す

### A：`preconnect` を 2 本足す（tools / games の `layout.tsx`）

```html
<link rel="preconnect" href="https://pagead2.googlesyndication.com" crossorigin />
<link rel="preconnect" href="https://www.googletagmanager.com" />
```

- Lighthouse の推定で 300 ms。`crossorigin` は `adsbygoogle.js` が CORS で取られるため
- 3 本目以降（`googleads.g.doubleclick.net`・`fundingchoicesmessages.google.com`）は足さない。preconnect は
  多いほど効かなくなる（ブラウザは 4〜6 本で打ち切る）

### D：結果パネル内のリンク色をコントラスト 4.5 以上にする（**tools の `globals.css` だけ**。games には `.panel` / `.hint` が無い）

```css
/* 結果パネル周辺（--surface-2 / --accent-soft の地）のリンクは --accent では 4.44 で AA に届かない。
   --accent-strong（#14532d）なら --surface-2 に対して 8.08。ダークは --accent-strong（#86efac）が地 #17251c に対して 11.35 */
.panel a,
.hint a {
  color: var(--accent-strong);
}
```

- `--accent` そのものは変えない（`design/tokens.css` が原典で、home / games とも揃えている。ボタン・見出しの色が全部動く）
- ダーク側は現状（`#4ade80` on `#17251c` ＝ 9.14）で AA を満たすが、同じセレクタで `--accent-strong` にしても悪化しない
  （`#86efac` on `--accent-soft` `#17251c` ＝ 11.35、`.panel.quiet` の地 `--surface-2` `#2f2b29` に対しては 9.98）
- 確認：Lighthouse の `color-contrast` が `/tools/saitei-chingin/` で通る。ほかに `.panel` 外で `.hint a` を使う箇所が
  無いか `grep -rn 'className="hint"' app/` で見て、あれば同じ扱い

### B：AdSense の読み込みを「最初の描画のあと」に回す（tools / games の `layout.tsx`）

**前提：`layout.tsx` のコメントが、生の `<script>` を `<head>` に置く理由を 2 つ書いている。** B はその判断を覆すので、両方に手当てを書く。

1. 「`next/script`（afterInteractive）だと静的 HTML に script タグが出ず、**AdSense のサイト審査でコードを検出されない可能性がある**」
   → 静的 HTML から `adsbygoogle.js` が消えても「サイト」の確認が外れないよう、**`<meta name="google-adsense-account" content="ca-pub-…">`
   を `<head>` に残す**（Google が AdSense のサイト確認方法として公式に用意しているメタタグ。`lib/adsense.ts` の `ADSENSE_CLIENT` から出す）。
   実装の前に AdSense 管理画面「サイト」で確認方法にメタタグが選べる状態かを運営者が見て、「経過」に書く
2. 「AdSense が実行時に `<head>` へ `<script>` を差し込むため、インライン script を React の子として置くと**ハイドレーションで食い違う**」
   → `<head>` にインライン script は置かない。**`Analytics.tsx` と同じ型のクライアントコンポーネント（`app/AdSenseLoader.tsx`）**を
   `<body>` の先頭に置き、`useEffect` で `window` の `load` を待って（既に `load` 済みなら即）`document.createElement('script')` で
   `adsbygoogle.js` を差し込む。差し込みは 1 回だけ（`AdUnit.tsx` の `pushed` と同じ ref の守り）

- `<script async src="…adsbygoogle.js">` を `<head>` から外し、上の 2 で **`load` 後**に差し込む（`AdUnit.tsx` の `push({})` は
  スクリプトの到着前でも `window.adsbygoogle` のキューに積まれるので、順序の問題は起きない）
- **利用者の操作を待たない**（「初回スクロールで読み込む」型にはしない）。操作待ちにすると広告の表示回数が落ち、
  収益に直接効く。`load` 後なら初回描画・LCP・TBT の計測区間から外れるだけで、表示回数はほぼ変わらない
- gtag は動かさない（97 ms。ページビューの取りこぼしを避ける。`Analytics.tsx` の初回送信が遅れると直帰の計測が変わる）
- 自動広告（`AD_SLOTS` が空のまま）にも効く。`adsbygoogle.js` の到着が遅れるぶん、自動広告の挿入も `load` 後になる
- 効果の確認（**揺れに負けない基準にする。** 直近 28 日で 490 セッション・mobile 66 では、2 週間の RPM は曜日と広告単価の揺れだけで
  5% を超えて動く）：
  - 速度側：E の `metric_rating` の good 割合を、**前後それぞれ 1 群 300 件以上**たまってから比べる（件数が足りなければ判断しない）
  - 収益側：**RPM ではなく「ページビューあたりの広告表示回数」**（AdSense レポートの表示回数 ÷ GA4 の `page_view`。読み込み順の変更が
    直接効く指標で、単価の揺れを受けない）を **前後 4 週間**で比べ、**10% 以上落ちたら戻す**。RPM は参考値として並べるだけ
- `tests/layout.test.ts`（無ければ新設）：`<head>` に `adsbygoogle.js` の `<script>` が**無い**こと、`preconnect` が**ある**こと、
  **`google-adsense-account` の meta が `ADSENSE_CLIENT` の値で**ある**こと**を見る

### C：FundingChoices（同意メッセージ）の要否を運営者が判断する（コード変更なし。**既定は「有効のまま」**）

- AdSense 管理画面 →「プライバシーとメッセージ」で、有効になっているメッセージ（GDPR＝EEA・英国・スイス／米国州法）を確認する
- **無効にした場合の影響を正しく押さえる**：Google は **2024 年 1 月 16 日から、EEA・英国・スイスで広告を配信するパブリッシャーに
  Google 認定の CMP（同意管理プラットフォーム）の利用を必須**にしている。メッセージを無効にすると、その地域では
  「パーソナライズ無しの通常配信」ではなく**制限付き広告（Limited Ads）か配信なし**になる。また同意を取らずに広告 Cookie を
  使う形になるので、**GDPR / ePrivacy 上の論点が残る**（`home/privacy.html` は現状 EEA 向けの同意に触れていない。
  無効化するならそちらとの整合も要る）
- **既定は有効のまま。** 無効化は、GA4 の国別セッション（直近 28 日）で EEA・英国・スイスの割合が十分に小さく、
  かつ上の影響を運営者が理解したうえで選ぶ**選択肢**として置く。選んだ場合に取り除けるのは 106 KB・184 ms
- **どちらに決めたかと、その時点の地域別の割合を本仕様書の「経過」に書く**

---

## 期待される効果

- Lighthouse（ラボ値）：A＋B で第三者の主スレッド占有 790 ms のうち AdSense 分 511 ms と preconnect 300 ms が
  初回描画の区間から外れる。**TBT 880 → 300 ms 台、LCP 6.4 → 4 s 台**を見込む（TTFB は環境依存で残る）。
  C まで入れば TBT はさらに 184 ms 減る
- Accessibility：D で 0.96 → 1.00（唯一の減点が消える）
- 利用者の実測：E で初めて数字が取れる。**「良好」の閾値に対する good の割合（CrUX と同じ 75% 基準）を週次で見られる**ようになるのが
  この提案の一番大きい成果で、B の前後比較もこれで決める（p75 そのものは BigQuery エクスポートを入れたときに）
- 収益：B は表示回数をほぼ変えない設計。**ページビューあたりの広告表示回数の前後 4 週間比較で 10% 以上の低下が出たら戻す**と先に決める

---

## 工数の見積り

| 作業 | 消費トークン（目安） |
|---|---|
| E：`web-vitals` の導入・`lib/analytics.ts`・テスト（tools / games）＋ GA4 のカスタムディメンション登録（運営者） | 45k |
| A＋D：`layout.tsx` の `preconnect`・tools `globals.css` の 1 ルール・Lighthouse 再計測 | 15k |
| B：`AdSenseLoader.tsx`・`google-adsense-account` の meta・`AdUnit` との順序確認・テスト（tools / games） | 50k |
| C：運営者の管理画面確認と「経過」の追記 | 5k |
| **合計** | **約 115k**（E → A＋D → B の順。B は E の基準値が 1 群 300 件たまってから） |

---

## やらないこと

- **AdSense を外す・ページの一部だけ広告なしにする**：収益の柱。読み込み順を変えるところまで
- **利用者の操作を待って広告を読み込む（遅延ロード）**：表示回数が落ちる。上記 B の理由
- **React・Next の実行時チャンク（227 KB 展開・scripting 1,010 ms）を削る**：フレームワーク側の大きさで、
  静的書き出し（`output: 'export'`）を維持したまま削る手段が無い。「ビルドなしの素の HTML に戻す」は
  46 本のツールを書き直すことになり、比較にならない
- **Service Worker でスクリプトをキャッシュする**：[games-pwa-manifest.md](./games-pwa-manifest.md) の
  「古い HTML が残る事故」の判断を維持
- **`--accent` の値を変える**：`design/tokens.css` の原典で、ボタン・見出し・home の色まで動く。D は `.panel` 内のリンクに限る
- **gtag を `load` 後に回す**：97 ms のために、ページビュー計測の順序を変えるリスクを取らない
- **Lighthouse を CI に入れる**：この環境の代理サーバーで TTFB が動くとおり、ラボ値は環境で揺れる。
  実測（E）を主にし、Lighthouse は運営者が PSI で節目に取る
