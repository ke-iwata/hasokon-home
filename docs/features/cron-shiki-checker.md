# 新ツール「cron 式 チェッカー（次回実行・日本時間）」— cron 式を貼ると意味を日本語で読み、次の実行日時を日本時間で 10 件並べる。GitHub Actions・AWS EventBridge は UTC なので「日本時間で毎朝9時」の式を逆算して出す。日と曜日の OR 条件・`?`・`L`・`W`・`#` の方言の違いを判定し、祝日にかかる回を印つきで示す。送信なし

**状態**：提案（2026-11-21 起票。セッション `session_012RoU2ECJkNmTczHFZZtYPa`。定期の企画ルーティン）。**このPRは仕様書だけで、コードは触っていない。**
**いつ `public` にするか**：期日のない恒常需要。開発者向けの小道具（Base64・JSON 整形・正規表現・URL デコード・UNIX 時間・ハッシュ値）を `public` にする波に**同じ時期に並べる**
**優先度：中。** 法改正ものの後ろでよい。[unix-jikan-excel-serial.md](./unix-jikan-excel-serial.md) が「cron 式は別ツールの候補として残す」と書いていた穴を埋める
**対象**：`tools/`（`hasokon.com/tools/cron-shiki/` を想定。category は `計算・変換`。`tools/lib/cron/`（新規）・`tools/app/cron-shiki/`・`tools/tests/cron.test.ts`）
**起票**：2026-11-21
**関連**：[unix-jikan-excel-serial.md](./unix-jikan-excel-serial.md)（日本時間と UTC の扱い・相互リンク）・[nissu-keisan.md](./nissu-keisan.md)（祝日の表 `holidayName`・`HOLIDAY_FIRST_YEAR`/`HOLIDAY_LAST_YEAR` を共有）・
[seiki-hyogen-checker.md](./seiki-hyogen-checker.md)（貼って即座に読み解く UI の型）・[hash-keisan.md](./hash-keisan.md)・[base64-henkan.md](./base64-henkan.md)・
[thin-tool-content.md](./thin-tool-content.md)（本文の型）・[feature-flags.md](./feature-flags.md)・[tool-use-coverage.md](./tool-use-coverage.md)・[card-illustrations.md](./card-illustrations.md)

---

## 背景と根拠

### 計測値（GA4 Data API・プロパティ 548154955、2026-11-21 取得。直近 28 日＝10-24〜11-20）

| 項目 | 値 |
|---|---|
| セッション全体 | 1,399（Organic Search 1,179・Direct 124・Unassigned 48・AI Assistant 46） |
| 端末 | **desktop 1,185（85%）**・mobile 203・tablet 5 |
| `/tools/password` の着地 | 49・エンゲージメント率 78%・平均 323 秒（ブックマークで繰り返し使われる型） |
| `/tools/qr-code`・`/tools/aspect-ratio` | 6・9 |
| Google 自然検索（Search Console `https://hasokon.com/`、10-20〜11-19） | クリック 0・表示 2（[google-index-recovery.md](./google-index-recovery.md)） |

- 来訪の 85% が**デスクトップ**（多くは Bing＝Windows の Edge）。職場の PC から来ている層に、仕事の道具を置く余地がある
- 開発者向けの道具は `wip` に 8 本（base64・json-seikei・seiki-hyogen・url-decode・unix-jikan・text-hikaku・hash-keisan・jikan-keisan）並んでいるが、**「スケジュール」を扱う道具が無い**。cron は「書くたびに調べる」代表で、パスワード生成と同じく**ブックマークされて戻ってくる**型

### 世の中の需要と競合（2026-11-21 の Web 調査）

日本語で使える cron の確認サイトは luft.co.jp（Cron Expression Generator）・mecanik.dev（Cron式パーサー）・wavespeed.ai（cron式ジェネレーター）・miniwebtool など。英語では crontab.guru が定番。どれも「式 → 意味・次回実行」までは出すが、**日本の開発者が実際につまずく3点が弱い**：

1. **タイムゾーン。** GitHub Actions の `schedule` と AWS EventBridge（スケジュール式）は **UTC 固定**。「日本時間の毎朝9時」に動かすには `0 0 * * *` と書く必要があり、**日付が1日ずれる**（日本時間の月曜 8:00 は UTC の日曜 23:00）。曜日指定と組み合わせると間違えやすい。多くのサイトは「選んだタイムゾーンで計算する」だけで、**日本時間 → UTC の式に直す**機能が無い
2. **方言。** Linux の crontab（5 フィールド・日と曜日は **OR**）・Quartz／Spring（6〜7 フィールド・秒あり・`?` 必須）・AWS EventBridge（6 フィールド・年あり・日か曜日の片方が `?` 必須・曜日は 1=日曜）・Kubernetes CronJob（5 フィールド・`timeZone` 指定可）で、**同じ見た目の式が別の意味になる**。どの方言として読んだかを示すサイトは少ない
3. **日本の祝日。** 「平日の 9 時」を `0 9 * * 1-5` で書くと祝日にも動く。次回実行の一覧で**祝日にかかる回を印つき**で見せると、「祝日は止めたい」に気づける（祝日を除く式は cron では書けないので、その旨と回避策を本文で説明する）

---

## 機能（仕様）

### 入力

- **cron 式**（1 行。貼った瞬間に解析。`crontab -l` の1行を丸ごと貼っても、6 フィールド目以降のコマンドを無視して読む）
- **方言**：自動判定（既定）／Linux crontab／GitHub Actions／AWS EventBridge／Kubernetes CronJob／Quartz・Spring
- **式のタイムゾーン**：方言から既定値を決める（GitHub Actions・AWS EventBridge は UTC、それ以外は「サーバーの設定次第」として日本時間を既定）。手で切り替え可
- **表示のタイムゾーン**：日本時間（Asia/Tokyo）固定＋ UTC 併記

### 自動判定のルール（`tools/lib/cron/dialect.ts`）

1. フィールド数 5 → crontab 系（crontab／GitHub Actions／Kubernetes は文法が同じ。既定は crontab として読み、タイムゾーンの切り替えを目立たせる）
2. フィールド数 6 で、どちらかの日・曜日が `?` かつ末尾が年らしい（`*` または 4 桁・範囲）→ AWS EventBridge
3. フィールド数 6〜7 で先頭が秒（0〜59）→ Quartz・Spring
4. `@daily`・`@hourly`・`@weekly`・`@monthly`・`@yearly`・`@reboot` → crontab のマクロとして展開して見せる（`@reboot` は次回実行を出せない旨）
5. `cron(...)`・`rate(...)` で囲まれていたら AWS EventBridge（`rate` は「◯分ごと」と読むだけ）
- 判定が割れるときは**読んだ方言をはっきり出す**（「Linux の crontab として読みました」）

### 出力

1. **日本語の読み下し**：例 `30 9 * * 1-5` →「月曜〜金曜の 9:30」。`*/15 9-18 * * *` →「9時台〜18時台の、0・15・30・45分」
2. **次の実行日時を 10 件**（日本時間と UTC を併記、曜日つき）。**祝日にかかる回に「祝日（◯◯の日）」の印**、年末年始（12/29〜1/3）にも印
3. **フィールドの内訳表**（分・時・日・月・曜日（＋秒・年）ごとに、受け付けた値の一覧）
4. **注意の帯**（該当するときだけ）
   - 日と曜日の両方を指定した crontab の式：「**日と曜日はどちらかに当てはまれば動きます（OR）**。例：`0 9 1 * 1` は『毎月1日』と『毎週月曜』の両方」
   - UTC の方言で曜日を指定し、時刻が UTC 15:00〜23:59（＝日本時間の翌日 0:00〜8:59）の式：「**日本時間では曜日が1日あとにずれます**」
   - `31` 日や `2/30` など、ある月に存在しない日：「◯月には実行されません」。一度も実行されない式（`0 0 30 2 *`）は「**この式は実行されません**」
   - GitHub Actions：「最短は5分ごと。混雑時は遅れたり飛ばされたりすることがあります」（GitHub のドキュメントの記述どおり。出典リンク）
   - 曜日の 0 と 7（crontab では両方日曜）、AWS は 1=日曜：方言ごとの対応表を出す
5. **「日本時間で書いた式を UTC に直す」**（GitHub Actions・AWS 向け）：日本時間の式を入れると、UTC の式を出す
   - 時刻だけずらせば済む場合（9 時間引いても日付が変わらない）：時のフィールドだけ書き換える
   - 日付をまたぐ場合（日本時間 0:00〜8:59）：曜日・日を1つ前にずらした式を出す。**範囲（`1-5`）や `L` をまたいで1つの式で表せないときは、2 行に分けた式**を出す（GitHub Actions の `schedule` は複数行を書けるので、YAML の形でそのまま貼れるようにする）
   - コピーのボタン（式のみ／YAML の `on.schedule` ブロック／AWS の `cron(...)`）
6. **作る**（逆向き）：「毎日／平日／毎週◯曜／毎月◯日／◯分ごと」と時刻を選ぶと式を作る（よく使う 10 パターンのボタンを本文にも置く）

### 計算（`tools/lib/cron/`）

- `parse.ts`：方言ごとの文法で解析し、各フィールドを値の集合に展開する。`*`・`,`・`-`・`/`・名前（`JAN`・`MON`）・`?`・`L`・`W`・`#`・`LW`（Quartz・AWS のみ）。**誤りは位置つきで返す**（「3 番目（日）の `32` は 1〜31 の範囲外」）
- `next.ts`：開始時刻から次の一致を順に探す。**1分ずつ回さず**、月→日→時→分の順で次の候補へ飛ばす（`0 0 29 2 *` のような稀な式でも速い）。探す上限は 5 年先まで（それ以上は「5年以内に実行されません」）
- タイムゾーンは **UTC と Asia/Tokyo の2つだけ**を扱う。日本は夏時間が無いので +9:00 の固定差で計算でき、`Intl` の重い処理に頼らない（他のタイムゾーンを足すときは別提案。夏時間の「同じ時刻が2回・0回」の扱いが要る）
- crontab の日・曜日：**どちらかが `*` のときは AND、両方が `*` 以外なら OR**（Vixie cron の仕様）。Quartz・AWS は片方が `?` 必須なので常に片方だけ
- 祝日：`tools/lib/nissu-keisan.ts` の `holidayName` を使う。表の範囲（`HOLIDAY_FIRST_YEAR`〜`HOLIDAY_LAST_YEAR`）を超えた回には印を出さず、「祝日の表は ◯◯年まで」と添える

---

## 画面とUI

- 入力欄は 1 行、等幅フォント。フィールドごとに**色分けした下線**で、内訳表の列と色を合わせる
- 読み下しを最上段に大きく、次に次回実行の表、注意の帯、内訳表、UTC 変換、作る、の順
- 375px 幅でも次回実行の表を横スクロールさせない（日本時間と UTC を2段に）
- コピーのボタンは 44px 以上。コピーしたら「コピーしました」を 2 秒
- URL のクエリ（`?q=…&d=github`）で式と方言を共有できる（ブックマーク・社内チャットで貼れる）。**式はサーバーに送らない**（静的エクスポートなのでクエリはブラウザの中で読むだけ）
- `tool_use` は「解析に成功した」「UTC 変換を使った」「コピーした」で送る。**式そのものは送らない**（[tool-use-coverage.md](./tool-use-coverage.md)・[measurement-hygiene.md](./measurement-hygiene.md)）

### ページの中身（SEO・本文）

- `<h1>`：「cron 式 チェッカー（次回実行・日本時間）」
- `title`：「cron 式 チェッカー｜次回実行日時を日本時間で確認・GitHub Actions の UTC 変換」
- `description`：「cron 式を貼ると、意味を日本語で表示し、次の実行日時を日本時間と UTC で10件並べます。GitHub Actions・AWS EventBridge の UTC への変換、日と曜日の OR 条件・祝日にかかる回のチェックも。入力はブラウザの外に送りません。」
- 本文：cron 式の書き方（5 フィールドの表）・よく使う式の一覧（10 例）・方言の違い（表）・**GitHub Actions で日本時間に動かす方法**・祝日を除きたいとき（スクリプト側で判定する、の回避策）・よくある質問
- `robots: robotsFor('cron-shiki')`

---

## 確かめること（テスト）

`tools/tests/cron.test.ts`：

1. `30 9 * * 1-5` の読み下しと、基準 2026-12-28（月）9:00 からの次回 10 件（12/29〜1/3 の年末年始の印、2027-01-11 成人の日の祝日の印）
2. 日と曜日の OR：`0 9 1 * 1` が 1 日と月曜の両方で動く。`0 9 1 * *` は 1 日だけ
3. `*/15 9-18 * * *`・`0 0 29 2 *`（次は 2028-02-29）・`0 0 30 2 *`（実行されない）・`0 0 31 * *`（31 日のある月だけ）
4. 曜日 0 と 7 が同じ（crontab）／AWS の `cron(0 0 ? * MON-FRI *)` の曜日が 2〜6 として読まれる
5. Quartz の `0 0 12 ? * WED`・`0 15 10 L * ?`・`0 15 10 ? * 6#3`（第3金曜）
6. 日本時間 → UTC：`0 9 * * *` → `0 0 * * *`／`0 8 * * 1-5` → `0 23 * * 0-4`／`30 8 1 * *`（毎月1日 8:30）→ 前月の末日に当たるので**1行では書けない旨と代替**（`L` の使えない crontab では2行の近似を出さず、説明だけにする）
7. 誤りの位置：`0 9 32 * *` が 3 番目のフィールドの誤りとして返る
8. `@daily` の展開・`@reboot` の次回実行なし
9. 次回探索が 5 年の上限で止まり、遅くならない（1 式 10 件を 5ms 未満の目安）
10. `stage`・`robots`・llms（既存のテスト）

---

## 期待される効果

- 「cron 確認」「cron 式 次回実行」「crontab 書き方」「github actions cron 日本時間」「cron 毎朝9時」などの**恒常的な検索**。季節性が無く、法改正ものの山の谷を埋める
- 「GitHub Actions の cron を日本時間で」は**既存のツールサイトが答えていない**具体的な悩みで、Q&A 記事（Qiita・Zenn）に流れている検索を、そのまま貼れる式と YAML で取りにいく
- 目安：恒常的に**月 50〜150 着地**（Bing 中心。`/tools/password` の 2〜3 倍の検索の幅があるとみる）。ブックマークされると Direct・Unassigned の再訪が積み上がる
- 開発者向けの道具が 9 本になり、`/tools/` の「計算・変換」の回遊（UNIX 時間・正規表現・JSON 整形）が増える

## 工数（目安）

- 実装：**中（約 20〜30 万トークン）**。内訳は解析と方言 6〜8 万・次回探索と祝日 4〜6 万・UTC 変換（日付をまたぐ分割）4〜6 万・テスト 3〜4 万・画面と本文・SEO 4〜5 万
- 外部ライブラリは使わない（cron のパーサーは小さく、方言の扱いを自分で決めたいので。依存を増やさない方針 [dependency-vulnerability-audit.md](./dependency-vulnerability-audit.md)）

## 将来（このPRの範囲外）

- systemd の `OnCalendar` 形式の読み下し
- 日本時間以外のタイムゾーン（夏時間の扱いが要る）
- 「祝日を除く」スクリプトの断片（bash・GitHub Actions の `if:`）を本文に置く
