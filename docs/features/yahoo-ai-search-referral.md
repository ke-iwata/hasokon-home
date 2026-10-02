# Yahoo! JAPAN 検索の AI アシスタント経由の流入（`utm_source=openai`）が 1 週間で 1 → 138 セッション/日に増え、GA4 では「Organic Search」「Cross-network」「Unassigned」に割れて数えられている — 週次集計に「参照元ホスト × utm_source」を足し、AI 経由の読み方を直す

**状態**：**A・B・D を実装済み**（2026-10-01。セッション `session_017DFEqwXCyCLuP8bRWNrRt2`）。C は運営者の任意作業で未着手。B の判定（09-30 の行が付け直されたか）は 10-05 の週次で見る。起票は 2026-10-01（セッション `session_01CBTnoTTpMsUXsqGpqGYn7f`）。
**緊急度**：高。**サイトの 1 日のセッション数がこの 1 本の経路で 3 日間に 34 → 137 に跳ねた**のに、
いまの週次集計（`scripts/ga4-ai-channel.mjs`）はこれを「AI Assistant」として数えない。
次の週次（10-05 月）で「AI Assistant は横ばい、Organic Search と Cross-network が急増」と読んでしまう。
**着手条件**：なし。スクリプトと仕様書だけで、サイトの HTML・計測タグは触らない。
**対象**：`scripts/lib/ga4.mjs`・`scripts/ga4-ai-channel.mjs`・`scripts/test/ga4-ai-channel.test.mjs`（A・B）。
運営者の GA4 管理画面の作業は C（任意・10 分）
**起票**：2026-10-01
**関連**：[ai-assistant-channel.md](./ai-assistant-channel.md)（週次集計の持ち主。「判断に使うのは AI Assistant の増減」の読み方を本提案で広げる）・
[web-vitals-phantom-sessions.md](./web-vitals-phantom-sessions.md)（`Unassigned` の読み方。本提案の「処理待ち」はそれとは別の `Unassigned`）・
[shuzei-kaisei-post-revision-copy.md](./shuzei-kaisei-post-revision-copy.md)（AI アシスタントは `description` を読む。本提案で「読んでいるのは Yahoo! の AI でもある」ことが分かった）・
[google-index-recovery.md](./google-index-recovery.md)（Google が載せないあいだ、流入は Bing と AI で持っている。その AI の正体の半分がこれ）

---

## 背景と根拠

### 計測値（2026-10-01 取得・GA4 Data API `runReport`、`properties/548154955`）

**日別のセッション数**（`date` × `sessions`）。09-28 から 3 日続けて跳ねている：

| 日 | 09-24 | 09-25 | 09-26 | 09-27 | **09-28** | **09-29** | **09-30** |
|---|---:|---:|---:|---:|---:|---:|---:|
| セッション | 34 | 46 | 29 | 28 | **76** | **84** | **137** |

**その増分はほぼすべて参照元 `search.yahoo.co.jp` から来ている**（`pageReferrer` に `yahoo` を含むセッション × `sessionDefaultChannelGroup`）：

| 日 | 09-23 | 09-24 | 09-25 | 09-26 | 09-27 | 09-28 | 09-29 | 09-30 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Yahoo! 参照のセッション | 1 | 4 | 3 | 4 | 3 | **31** | **41** | **138** |
| うち GA4 のチャネル | Organic | Organic | Organic | Organic | Organic | Organic 31 | Organic 41 | **Cross-network 73・Unassigned 59**・Organic 6 |

**着地 URL には `?utm_source=openai&utm_medium=organic` が付いている**（`pageLocation` / `sessionManualSource` / `sessionManualMedium`）。
直近 10 日（09-21〜09-30）の参照元 × GA4 の付け方：

| `pageReferrer` | `sessionSource` | `sessionDefaultChannelGroup` | セッション |
|---|---|---|---:|
| `https://www.bing.com/` | bing | Organic Search | 189 |
| **`https://search.yahoo.co.jp/`** | **openai** | **Organic Search** | **93** |
| **`https://search.yahoo.co.jp/`** | **(data not available)** | **Cross-network** | **73** |
| **`https://search.yahoo.co.jp/`** | **(not set)** | **Unassigned** | **59** |
| `https://www.bing.com/` | (data not available) | Cross-network | 34 |
| `https://www.bing.com/` | (not set) | Unassigned | 25 |
| （直接） | chatgpt.com | AI Assistant | 16 |
| `https://hasokon.com/games/daifugo/` ほか内部 | chatgpt.com | AI Assistant | 36 |

3 つ分かる：

1. **`search.yahoo.co.jp` の参照で `utm_source=openai` が付く経路は、Yahoo! JAPAN 検索の AI アシスタント（AI 回答）のリンクである。**
   Yahoo! 検索の AI 機能は OpenAI の API で動いていて（LINE ヤフーの [リリース](https://www.lycorp.co.jp/ja/news/release/019684/)、
   [ITmedia 2025-07-31](https://www.itmedia.co.jp/aiplus/articles/2507/31/news101.html)）、OpenAI の API の Web 検索が出典 URL に
   `utm_source=openai` を付ける。「`openai / organic` は Yahoo! の AI アシスタント検索経由」と突き止めた
   [第三者の報告](https://x.com/haseshout/status/2042906821921509378)とも一致する。
   **ChatGPT 本体からの流入は `chatgpt.com`（`utm_source=chatgpt.com`）で、別物**
2. **GA4 は `utm_medium=organic` を見て「Organic Search」に入れる。** 2026-10-01 時点でこのプロパティのチャネルグループは
   既定の 1 つだけ（Admin API `channelGroups` で確認）で、「AI Assistant」は GA4 組み込みの既定チャネル。
   その判定より `medium=organic` が先に効くので、**Yahoo! の AI 経由はいくら増えても「AI Assistant」に出ない**。
   いまの週次集計は `AI_CHANNEL = 'AI Assistant'` の増減だけを「判断に使う」と決めている（`scripts/lib/ga4.mjs`）ので、
   **この経路の増加は Organic Search の増加としか読めない**
3. **09-30 の「Cross-network / (data not available)」107 件と「Unassigned / (not set)」59 件は、同じ Yahoo! 経由の
   前日分が、参照元の処理待ちのまま出ている形**とみる。根拠は、09-28・09-29 には同じ付き方の行が無く（Organic 31・41 と
   Unassigned 1・2 だけ）、09-30 だけに集中していること、`sessionManualSource` が `(not set)` なのに `pageLocation` には
   `?utm_source=openai` が残っていること。GA4 は直近 24〜48 時間の参照元・属性を後から埋める。
   **確定ではない**ので、本提案の B で「翌週の集計で 09-30 の行がどう付け直されたか」を見て判定を書く
   （同じ日の Bing 参照 59 件も `(data not available)` / `(not set)` に落ちているので、Yahoo! 固有ではなく「前日分」の性質）

### 中身は本物のユーザーで、Bing と同じくらい使っている

直近 10 日の `sessionSource` 別（`engagedSessions` / `averageSessionDuration` / `tool_use` の件数）：

| 参照元 | セッション | エンゲージ | 平均滞在（秒） | `tool_use` |
|---|---:|---:|---:|---:|
| bing | 192 | 142（74%） | 174 | 266 |
| **openai（Yahoo! AI）** | **98** | **66（67%）** | **151** | **65** |
| chatgpt.com | 38 | 18（47%） | 407 | 106 |

着地はほぼ**期日のあるページ**に集中している（10 日・`openai` の `pageLocation`）：
`/tools/tabako-zei-neage/` 70、`/tools/nenrei-keisan/` 19、`/tools/shuzei-kaisei/` 3。
09-30 の Cross-network 107 件も `/tools/tabako-zei-neage/` 79・`/tools/shuzei-kaisei/` 18（10-01 の施行の前日）。
**Yahoo! の AI は「たばこ 値上げ 10月」「酒税 10月」のような今の質問に、当サイトのページを出典として出している。**
端末は Edge/Windows 44・iOS の Safari（アプリ内）20・Android WebView 16 で、Yahoo! JAPAN アプリ内ブラウザが 3 分の 1。

### なぜ放っておけないか

- **週次の読み違い。** 10-05（月）の `gsc-audit.yml` は 28 日（09-07〜10-04）を前の 28 日と比べる。
  このままだと「AI Assistant 76（前 68）横ばい、Organic Search 504 → 急増、Cross-network 4 → 100 超」と出て、
  **「Bing が伸びた」「広告ネットワーク経由が出た」と誤読する**。実際は 1 本の新しい経路
- **[ai-assistant-channel.md](./ai-assistant-channel.md) の「AI Assistant は 2 番目のチャネル（68）」は、いま数え直すと
  AI 経由は `chatgpt.com` 75 ＋ `openai` 98 ＝ 173 セッション（28 日）で、Organic Search 全体 504 のうち 98 が AI。**
  Google 経由（`google` 19）の 9 倍。「伸びているチャネルへの投資」の判断材料が 2 倍ずれている
- **前日分の処理待ちを「幽霊」「クロスネットワーク」と読む危険。** [web-vitals-phantom-sessions.md](./web-vitals-phantom-sessions.md) の
  C は `Unassigned` のうち着地が空のものを数える。09-30 の `Unassigned` 59 件は着地があるので幽霊ではないが、
  集計を読む人が区別できる注記が無い

## 現状

- `scripts/lib/ga4.mjs`：`channelRequest()`（チャネル × 参照元）・`landingPageRequest()`（AI Assistant に絞った着地）・
  `phantomSessionRequest()` の 3 本。**参照元ホスト（`pageReferrer`）も `utm_source` の生値（`sessionManualSource`）も取っていない**
- `summarize()` は `AI_CHANNEL` の現在値・前期値・増減だけを「判断の行」に出す。`topSources()` に `openai` が出るが、
  ChatGPT と同じものに見える
- 日付の窓は `endDate: 'yesterday'`（「当日ぶんが確定していないため」）。**前日分も参照元が確定していない**ことは想定していない
- 再現：`node scripts/ga4-ai-channel.mjs --days 28`（`GOOGLE_SERVICE_ACCOUNT_JSON` が要る）。本書の数字は同じ API を
  `date` / `pageReferrer` / `sessionManualSource` の次元で引き直したもの

## 提案する仕様

### A. 週次集計に「参照元ホスト × `sessionSource`」の表と「AI 経由の合計」を足す（`scripts/lib/ga4.mjs`）

- `referrerRequest(days)` を足す：`dimensions: pageReferrer, sessionSource, sessionDefaultChannelGroup`、
  `metrics: eventCount`、`dimensionFilter: eventName = 'session_start'`（セッションの最初の 1 件に絞ると件数がセッション数になる）。
  `pageReferrer` はホスト名に丸める（`new URL(ref).hostname`、空は `(none)`）。上位 10 行を表で出す
- `summarize()` に **`aiTraffic`** を足し、1 行で出す：
  `AI 経由: 合計 N（ChatGPT 直接 n1〔sessionSource = chatgpt.com〕・Yahoo! AI n2〔sessionSource = openai〕・その他の AI Assistant n3）`。
  **判断に使う値は `AI Assistant` チャネル単独から、この合計に替える。** 前期との比較も合計で出す
- 読み方の注記を `formatReport()` に固定で 1 行：「`openai` は Yahoo! JAPAN 検索の AI 回答（OpenAI API 経由）。ChatGPT 本体は `chatgpt.com`」
- `openai` は OpenAI API の Web 検索を使うサービス全般が付ける値なので、参照元ホストの表に `search.yahoo.co.jp` 以外の
  `openai` 行が出てきたら「Yahoo! AI」という呼び名を見直す（合計 `aiTraffic.total` はそのままで正しい）
- 2 行目の `AI Assistant: N セッション` と全体比・着地上位は**チャネル単独**の値で、1 行目の合計とは数字が違う。行に「チャネル単独」と添える
- JSON スナップショットにも `aiTraffic` と `referrers` を残す（週次の artifact で推移を追えるように）

### B. 前日分の「処理待ち」を注記し、閾値で警告する

- `channelRequest()` の結果で、`sessionSource` が `(data not available)` または `(not set)` の行の合計が
  全セッションの **10% を超えたら** `::warning::` を 1 行出す：「参照元が未確定のセッションが N 件（M%）。直近 1〜2 日分の処理待ちの可能性。
  翌週の集計で付け直されていれば問題なし」。終了コードは 0 のまま（計測はできている）
- **窓は変えない**（`endDate: 'yesterday'` のまま）。`2daysAgo` に縮めると過去のスナップショットと比べられなくなり、
  09-28 から始まった急増を 1 週遅れで見ることになる。注記で足りる
- **判定の記録**：10-05 の週次で 09-30 の行を見る。`Cross-network 107` / `Unassigned 59` が `openai / Organic Search` に
  付け直されていれば上の 3. は確定で、本書の「背景と根拠」に 1 行足す。付け直されていなければ、Cross-network の原因は別
  （`gclid` 等のパラメータ）なので `pageLocation` を全件引いて調べ直す

### C. 運営者（任意・10 分）：GA4 のカスタムチャネルグループで `openai` を分ける

- GA4 管理 → データの表示 → チャネルグループ → 「新しいチャネルグループを作成」（既定のコピー）→ チャネル「AI 検索（Yahoo!）」を
  **AI Assistant の上**に足し、条件を `ソース` 完全一致 `openai`。既定のグループは触らない（レポートの比較が壊れる）
- カスタムグループは**過去の期間にも遡って効く**ので、作った日から 28 日の推移が引ける。A の集計はカスタムグループに依存しない
  （Data API の `sessionDefaultChannelGroup` は既定のまま）ので、やらなくても A・B は成立する

### D. 仕様書の読み替え（コードは触らない）

- [ai-assistant-channel.md](./ai-assistant-channel.md) の「判断に使うのは AI Assistant の増減」は、A が入った時点で
  「AI 経由の合計（`aiTraffic`）の増減」に読み替える。向こうの本文は本提案の実装 PR で 1 行だけ直す
  （状態行の下に「2026-10 から合計で読む。[yahoo-ai-search-referral.md](./yahoo-ai-search-referral.md)」）。
  **同じ PR で向こうの本文の他の行は触らない**（並走中の提案との衝突を避ける）

## 期待される効果

- **誤読の回避**（最大の効果）。10-05 の週次が「AI 経由 173 → ？」「Yahoo! AI は 09-28 から」と正しく出る。
  AI 経由が Organic の中に隠れたまま「Bing が伸びた」と判断して Bing 向けの施策に寄せる、という取り違えを防ぐ
- **投資判断の材料。** Yahoo! の AI 回答が出典に選ぶのは、期日のあるページの `description` と本文。
  [shuzei-kaisei-post-revision-copy.md](./shuzei-kaisei-post-revision-copy.md) の「AI が description を読む」は、
  ChatGPT だけでなく Yahoo! 検索の AI（日本の検索の第 2 位）にも効く。**施行日を過ぎた文面を放置するコストが、
  この経路の分だけ大きくなった**。たばこページの `description` にも「加熱式たばこは 2026 年 10 月に…揃います」と
  施行前の語尾が残っていて、09-30 の着地 1 位がそのページ（本提案の対象外。酒税と同じ型の別提案で扱う）
- **測り方**：A のあと 4 週、`aiTraffic` の合計と内訳を週次の表で追う。Yahoo! AI は Bing のインデックス（OpenAI の Web 検索は
  Bing ベース）から出典を選ぶので、[bing-search-performance-audit.md](./bing-search-performance-audit.md) の
  Bing の表示回数と並べて読む

## 工数の見積り

| 作業 | 消費トークン（目安） |
|---|---|
| A：`referrerRequest()`・`aiTraffic` の集計と表示・JSON への追加＋テスト（`scripts/test/ga4-ai-channel.test.mjs` に 4〜5 ケース） | 45k |
| B：未確定行の割合と `::warning::`＋テスト 2 ケース | 15k |
| D：ai-assistant-channel.md の 1 行・DECISIONS.md | 10k |
| **合計** | **約 70k**（API の権限・Secret・ワークフローは増えない） |

C は運営者の画面作業 10 分。

## やらないこと

- **`utm_source=openai` を書き換えたり、URL から落としたりしない。** リンクは Yahoo! 側が付けるもので、当サイトでは制御できない。
  落とすと ChatGPT 本体（`chatgpt.com`）との区別も消える
- **Yahoo! AI 向けの新しい施策（専用の案内ファイルなど）は立てない。** 出典の選択は OpenAI の Web 検索（Bing のインデックス）が
  するので、効くのは Bing の登録と各ページの `description`・本文の鮮度。どちらも既存の仕様書が持っている
- **集計の窓を `2daysAgo` までに縮めない**（B で理由を書いた）
- **既定のチャネルグループを編集しない。** GA4 の既定グループは編集できず、できたとしても過去との比較が壊れる
- **GA4 の「AI Assistant」の中身（Google が `chatgpt.com` 等をどう判定しているか）を当サイトで再現しない。** 組み込みの判定に任せ、
  当サイトは `openai` を足し算するだけ
