# web_vitals 導入初日に GA4 のセッションが 28 → 75 に跳ねた — うち 42 は page_view の無い「幽霊セッション」。読み方の注意と、止め方・見張り方・カスタム定義の登録

**状態**：提案（2026-09-29 起票。セッション `session_01UBDziAjHeeJzaW6rf1Z3ZF`）。
**A（セッションのタイムアウト延長）は運営者の GA4 管理画面の作業**（コード変更なし・1 分）。
**D（カスタム定義の登録）も運営者作業**で、[mobile-lighthouse-third-party.md](./mobile-lighthouse-third-party.md) の E が
求めていたものが **2026-09-29 時点で 0 件のまま**（Data API の `metadata` で確認）。B・C はコード。
**対象**：GA4 プロパティ `548154955`（管理画面）・`tools/lib/analytics.ts`・`games/lib/analytics.ts`（B）・
`scripts/ga4-ai-channel.mjs`・`scripts/lib/ga4.mjs`（C）
**起票**：2026-09-29
**関連**：[mobile-lighthouse-third-party.md](./mobile-lighthouse-third-party.md)（E で `web_vitals` を入れた。本提案はその副作用）・
[measurement-hygiene.md](./measurement-hygiene.md)（計測を汚さない約束。本提案はその続き）・
[ai-assistant-channel.md](./ai-assistant-channel.md)（週次のチャネル表。**Unassigned が 24 → 71 に跳ねたのはこの副作用で、チャネルの変化ではない**）・
[google-index-recovery.md](./google-index-recovery.md)（10/1 ごろの再計測でセッション数を読むときに、この分を引く）

---

## 背景と根拠

### 計測値（2026-09-29 取得。GA4 Data API `runReport`、`properties/548154955`）

**日別のイベント数とセッション数**（`date` × `eventName`）。`web_vitals` は #279 が本番に出た 2026-09-28 が初日。

| 日 | session_start | page_view | web_vitals | セッション（GA4 の値） |
|---|---|---|---|---|
| 09-24 | 34 | 34 | 0 | 34 |
| 09-25 | 46 | 72 | 0 | 46 |
| 09-26 | 28 | 54 | 0 | 29 |
| 09-27 | 28 | 28 | 0 | 28 |
| **09-28** | **72** | **89** | **162** | **75** |

**09-28 のセッションを、着地ページ（`landingPage`）とイベントで切ったもの**

| 着地ページ | 含まれるイベント | セッション数 | エンゲージ |
|---|---|---|---|
| **（空）** | `web_vitals` 81 件（42 セッション）・`user_engagement` 36 件（32）・`tool_use` 22 件（10）・`scroll` 4 件 | **42〜45** | **0** |
| `/tools/tabako-zei-neage` | page_view 32・session_start 32・first_visit 31・web_vitals 33 | 32 | 10 |
| `/tools/saitei-chingin` | page_view 12・session_start 12・web_vitals 15 | 12 | 7 |
| `/tools/shuzei-kaisei` | page_view 10・session_start 10・web_vitals 14 | 10 | 4 |

- **着地ページが空のセッションには `page_view` も `session_start` も 1 件も無い**。中身は `web_vitals`・`user_engagement`・
  `tool_use` という、**ページを閉じる／離れるときに飛ぶイベントだけ**。チャネルは全部 `Unassigned`（`(not set) / (not set)`）
- 同じ型のセッションは `web_vitals` を入れる前からあった。**09-02〜09-27 は 1 日 1〜4 件**（bing / chatgpt.com 経由、
  1 セッション 2 イベント＝`user_engagement` と `scroll` か `tool_use`）。**09-28 に 42 件へ跳ねた**
- 28 日で見ると `Unassigned` は **24 → 71 セッション**、`Cross-network` に 18 件（すべて 09-28。参照元が
  `(data not available)`＝**GA4 の帰属処理が終わっていない直近の値**で、こちらは `page_view`・`session_start` を持つ
  ふつうの訪問。1〜2 日で Organic Search か Direct に移るはず。09-30 に取り直して確かめる）

### 起きていること：セッションが 30 分で切れたあとに `web_vitals` が飛び、page_view の無い新しいセッションになる

GA4 のセッションは既定で**30 分無操作で切れる**。web-vitals の INP・CLS は、
**ページが `hidden` になった（タブを閉じた・別タブに移った）ときに確定して送る**設計で、
タブを 30 分以上開いたまま放置してから閉じると、**切れたセッションのあとに来た初めてのイベント**として
**新しいセッション**を作る。そのセッションには `page_view` が無いので着地ページが `(not set)`、参照元も無いので `Unassigned`。
GA4 の「着地ページ (not set)」の代表的な原因として広く知られている型で、当サイトでは `user_engagement` で
1 日 1〜4 件起きていたものが、**全訪問者に `web_vitals` を付けたことで全員に起きるようになった**。

`web_vitals` そのものが壊れているわけではない（33 件が `/tools/tabako-zei-neage` の着地に正しく付いている）。
**送る時刻**が問題。

### なぜ放っておけないか

1. **セッション数が 1.5〜2 倍に水増しされる。** 09-28 の 75 セッションのうち実訪問は 30 前後（前日 28・前々日 29 と同じ水準）。
   「09-28 に流入が倍になった」と読むと間違う
2. **チャネル表が崩れる。** [ai-assistant-channel.md](./ai-assistant-channel.md) の週次レポートは `Unassigned` を 1 行として
   持っている。24 → 71 は AI・検索・直接のどれでもない幽霊で、放っておくと**毎週の一番大きい行が `Unassigned` になる**
3. **エンゲージメント率が落ちる。** 幽霊セッションは全部エンゲージ 0 なので、サイト全体のエンゲージメント率
   （28 日 desktop 56%・mobile 41%）が実態より低く出る。mobile-one-screen.md の「収まったか」を GA4 で読むときに効く
4. **10/1 ごろの再計測に混ざる。** [google-index-recovery.md](./google-index-recovery.md) は「ページが増えた効果」と
   「対策の効果」を分けて読む約束をしたが、ここに**「計測の変更」という 3 つ目の変数**が入った

## 現状

- `tools/lib/analytics.ts` / `games/lib/analytics.ts` の `reportWebVitals()` が `onLCP` / `onINP` / `onCLS` に
  `trackWebVital` をそのまま渡している。**送る時刻の制御は無い**（web.dev の GA4 向けサンプルどおり）
- GA4 のセッションのタイムアウトは既定の **30 分**
- **カスタム定義は 0 件**（2026-09-29、Data API `properties/548154955/metadata` の `customDefinition: true` が
  ディメンション・指標ともに空）。E の仕様が求めた `metric_name`・`metric_rating`（ディメンション）・`metric_value`（指標）が
  未登録なので、**いま溜まっている 162 件は探索でも API でも内訳を切れない**（`customEvent:metric_rating` を指定すると
  400 が返る。登録前のイベントは遡って切れない）

再現（数字を取り直す）：

```bash
# 着地ページが空のセッション（= page_view の無いセッション）を日別に数える
node -e '
const body={dateRanges:[{startDate:"14daysAgo",endDate:"yesterday"}],dimensions:[{name:"date"}],metrics:[{name:"sessions"}],
dimensionFilter:{filter:{fieldName:"landingPage",inListFilter:{values:["","(not set)"]}}}};
console.log(JSON.stringify(body))'
# ↑ を runReport に渡す（scripts/lib/ga4.mjs の report() を使う）
```

## 提案する仕様

### A：GA4 のセッションのタイムアウトを最大（7 時間 55 分）に延ばす（運営者・1 分・コード変更なし）

管理 → データストリーム → ウェブ → タグ設定を行う → すべて表示 → **セッションのタイムアウトを調整する** → 7 時間 55 分。

- 30 分以上放置してから閉じても同じセッションに `web_vitals`・`user_engagement` が入るので、**幽霊セッションが消える**。
  `web_vitals` を入れる前から 1 日 1〜4 件あった分も一緒に消える
- **セッションの定義が変わる**ので、変更日を [DECISIONS.md](../DECISIONS.md) に残し、**前後のセッション数を並べて比べない**
  （減る方向。訪問者数 `activeUsers` は変わらないので、比較は `activeUsers` でする）
- GA4 の「(not set) 着地ページ」への標準的な対処で、コード・リリースを要しない。**これを第一候補にする**

### B：（A を採らない場合）`web_vitals` は「セッションが生きているあいだ」だけ送る（コード）

`lib/analytics.ts` に「最後に何かを送った時刻」を持たせ、`trackWebVital` の入口で
**前回の送信から 25 分以上たっていたら送らない**（GA4 の 30 分より手前で切る）。

- `trackPageView` / `trackEvent` が呼ばれるたびに時刻を更新（`Date.now()`。純関数側は時刻を引数で受けてテスト可能にする）
- 失うのは「30 分以上放置したタブ」の INP・CLS。**その値はどのみち放置中の値で、表示速度の判断には要らない**
- 純関数 `shouldSendVital(lastSentAt, now, timeoutMs)` とテストを足す。tools / games の両方に同じ変更
- A と両方入れる必要は無い（A で幽霊は消える）。**B は A を採らないと運営者が決めた場合の代替**

### C：週次監査で「page_view の無いセッション」を数え、1 割を超えたら警告する（コード）

`scripts/ga4-ai-channel.mjs`（週 1 回の `gsc-audit.yml` に相乗り済み）に、
`landingPage` が空／`(not set)` のセッション数と全体に対する割合を 1 行足す。

- **10% を超えたら警告**（09-02〜09-27 は 3〜15%、09-28 は 56%。暫定の閾値で、A のあとに下がった実測で見直す）
- チャネル表の `Unassigned` の行に「うち page_view 無し N」を添える。**これが無いと A・B の効果を毎週確かめられない**
- `scripts/lib/ga4.mjs` に `phantomSessionRequest()` とパーサを足し、既存の `parseRows` を通す。テストは既存の型どおり

### D：カスタム定義を登録する（運営者・5 分・コード変更なし。E の仕様に元からある作業）

管理 → カスタム定義 → **カスタム ディメンション**（イベント スコープ）に `metric_name`・`metric_rating`、
**カスタム指標**に `metric_value`（単位：標準）を登録する。

- 登録した日以降のイベントだけが切れる。**登録が遅れた日数ぶん、B（AdSense の読み込み順）の前後比較の起点が後ろへずれる**
- 登録後に `customEvent:metric_rating` で `runReport` が通ることを確認し、[mobile-lighthouse-third-party.md](./mobile-lighthouse-third-party.md)
  の E の状態行に登録日を書く

### E：09-28 以降の数字の読み方（運用の約束。コード変更なし）

- **A の適用日までのセッション数は、着地ページ空のセッションを引いて読む**（09-28 は 75 − 42 ≒ 33）
- 週次のチャネル表で `Unassigned` が跳ねている週は、C の「うち page_view 無し」を見てから判断する
- 10/1 ごろの google-index-recovery.md の再計測では **セッションではなく `activeUsers` と `page_view` を使う**

## 期待される効果

- **セッション数・チャネル表・エンゲージメント率が実態に戻る**（09-28 の型が続くと、毎日 30〜40 件の幽霊が積まれる）
- `web_vitals` の 3 指標は引き続き全訪問者から集まる（A なら欠けない。B でも判断に要る分は残る）
- **D が入れば、E（仕様書）が目指した「good の割合 75%」を初めて読める**。いまは 162 件を数えられるだけで中身が見えない
- 測り方：C の週次の割合。A の適用後 2 週で **10% 未満**に落ちていれば効いている

## 工数の見積り

| 作業 | 目安 |
|---|---|
| A：セッションのタイムアウト変更（運営者） | 画面作業 1 分・0 トークン |
| B：`shouldSendVital` ＋ `lastSentAt` の配線（tools / games）＋テスト | 15k（A を採らない場合のみ） |
| C：`phantomSessionRequest` ＋ 週次スクリプトの 1 行 ＋ テスト | 15k |
| D：カスタム定義の登録（運営者） | 画面作業 5 分・0 トークン |
| E：DECISIONS.md への記録 | 3k |
| **合計** | **約 20k トークン**（B を入れるなら 35k）＋ 運営者の画面作業 6 分 |

## やらないこと

- **`web_vitals` を外すこと。** E の目的（AdSense の読み込み順を変える前後を実測で比べる）は生きている。送る時刻の問題であって、
  送ること自体の問題ではない
- **GA4 のフィルタや「データの除外」で `Unassigned` を隠すこと。** measurement-hygiene.md の判断（管理画面の手作業はリポジトリに
  残らない）と同じ理由。A はセッションの定義の変更で、データを捨てるわけではない
- **`page_view` を `web_vitals` と一緒にもう一度送ること。** 二重計上になる（Analytics.tsx の「二重に数えられることはない」を壊す）
- **BigQuery エクスポートで p75 を出すこと。** E の仕様書のとおり別判断。D で `metric_rating` の割合が読めれば当面足りる
- **`user_engagement` 由来の幽霊（1 日 1〜4 件）だけを別に直すこと。** A で一緒に消える
