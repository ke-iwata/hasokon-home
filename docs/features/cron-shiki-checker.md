# 新ツール「cron 式 チェッカー（次回実行・日本時間）」— cron 式を貼ると意味を日本語で読み、次の実行日時を日本時間で 10 件並べる。GitHub Actions は `timezone: "Asia/Tokyo"` つきの YAML を、`timezone` を使えない環境（EventBridge のルール・古い GHES・既存のワークフロー）には UTC に直した式を出す。日と曜日の OR 条件・`?`・`L`・`W`・`#`・曜日の数字の方言の違いを判定し、祝日にかかる回を印つきで示す。送信なし

**状態**：提案（2026-11-21 起票。セッション `session_012RoU2ECJkNmTczHFZZtYPa`。定期の企画ルーティン。**同日の企画レビュー（#534、`session_012RoU2GCQkhWz7RZp7FVfwU`）の必須5点・実装時の注意4点を反映**：GitHub Actions の `timezone:`（2026-03〜）を1番目の答えに／EventBridge のルールと Scheduler を分ける／Quartz と Spring の曜日の数字を分ける／自動判定の優先順位と割れたときの選ばせ方／テスト1の期待値／Vixie cron の「`*` で始まる」／祝日の表の範囲／探索のステップ数での検査／色だけに頼らない区別）。**このPRは仕様書だけで、コードは触っていない。**
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

1. **タイムゾーンが環境ごとに違う。**
   - **GitHub Actions** は 2026-03 から `on.schedule` の各項目に `timezone:`（IANA 名）を `cron:` の隣に書けるようになった（[GitHub Changelog 2026-03-19「GitHub Actions: Late March 2026 updates」](https://github.blog/changelog/2026-03-19-github-actions-late-march-2026-updates/)）。**書かなければ従来どおり UTC**。ネットの解説記事・既存のワークフロー・`timezone` に未対応の GitHub Enterprise Server は UTC 前提のままなので、「`timezone` を足せば済む」ことと「足さないと UTC で、日本時間の朝は前日の UTC」の両方を知らせる価値がある
   - **AWS** は2つが別物：**EventBridge のルール**（`cron(...)`。UTC 固定）と、**EventBridge Scheduler**（`ScheduleExpressionTimezone` でタイムゾーンを指定できる）。同じ `cron(...)` の見た目でも、どちらに書くかで答えが変わる
   - **Kubernetes CronJob** は `spec.timeZone` を指定できる（指定しなければ kube-controller-manager のタイムゾーン）。**Linux の crontab** はサーバーのタイムゾーン（`CRON_TZ` を使える実装もある）
   - 多くのサイトは「選んだタイムゾーンで次回を出す」だけで、**どの環境なら何を書けばよいか**までは答えていない
2. **方言。** Linux の crontab（5 フィールド・日と曜日は **OR**）・Quartz（6〜7 フィールド・秒あり・`?` 必須・**曜日 1=日曜〜7=土曜**）・Spring の `CronExpression`（6 フィールド・秒あり・**曜日 0/7=日曜・1=月曜**）・AWS（6 フィールド・年あり・日か曜日の片方が `?` 必須・曜日は 1=日曜）・Kubernetes CronJob（5 フィールド）で、**同じ見た目の式が別の意味になる**（`0 15 10 ? * 6#3` は Quartz なら第3金曜、Spring なら第3土曜）。どの方言として読んだかを示すサイトは少ない
3. **日本の祝日。** 「平日の 9 時」を `0 9 * * 1-5` で書くと祝日にも動く。次回実行の一覧で**祝日にかかる回を印つき**で見せると、「祝日は止めたい」に気づける（祝日を除く式は cron では書けないので、その旨と回避策を本文で説明する）

---

## 機能（仕様）

### 入力

- **cron 式**（1 行。貼った瞬間に解析。`crontab -l` の1行を丸ごと貼っても、6 フィールド目以降のコマンドを無視して読む）
- **方言**：自動判定（既定）／Linux crontab／GitHub Actions／AWS EventBridge ルール／AWS EventBridge Scheduler／Kubernetes CronJob／Quartz／Spring
- **式のタイムゾーン**：方言から既定値を決める（下の表）。手で切り替え可
- **表示のタイムゾーン**：日本時間（Asia/Tokyo）固定＋ UTC 併記

| 方言 | 式のタイムゾーンの既定 | 画面に出す一言 |
|---|---|---|
| Linux crontab | 日本時間 | 「サーバーのタイムゾーンで動きます（`timedatectl` で確認）」 |
| GitHub Actions | **UTC**（`timezone:` を書かない場合） | 「`timezone: "Asia/Tokyo"` を書けば日本時間で書けます」 |
| AWS EventBridge ルール | **UTC 固定** | 「ルールはタイムゾーンを指定できません。Scheduler なら指定できます」 |
| AWS EventBridge Scheduler | 日本時間（`ScheduleExpressionTimezone: Asia/Tokyo` を前提） | 「`ScheduleExpressionTimezone` を指定しないと UTC です」 |
| Kubernetes CronJob | 日本時間（`timeZone: Asia/Tokyo` を前提） | 「`spec.timeZone` を指定しないとコントローラーのタイムゾーンです」 |
| Quartz／Spring | 日本時間 | 「アプリの JVM・スケジューラーの設定のタイムゾーンです」 |

### 自動判定のルール（`tools/lib/cron/dialect.ts`）

**上から順に当てはめ、最初に当たったものを使う。** 複数の方言として読めて、意味（次回実行）が変わるときは、選ばせる。

1. `cron(...)`・`rate(...)`・`at(...)` で囲まれていたら AWS（ルールか Scheduler かは決められないので、**既定はルール（UTC）にして切り替えを目立たせる**。`rate` は「◯分ごと」と読むだけ）
2. `@daily`・`@hourly`・`@weekly`・`@monthly`・`@yearly`・`@annually`・`@reboot` → crontab のマクロとして展開して見せる（`@reboot` は次回実行を出せない旨）
3. フィールド数 5 → crontab 系（crontab／GitHub Actions／Kubernetes は文法が同じ。既定は crontab として読み、方言の切り替えを目立たせる）
4. フィールド数 7 → Quartz（秒・分・時・日・月・曜日・年）
5. フィールド数 6：**AWS・Quartz・Spring の3つの文法でそれぞれ解析し、誤りにならなかったものだけを候補に残す**（位置の決め打ちはしない）
   - `?` の置ける位置は、AWS が 3 番目（日）か 5 番目（曜日）、Quartz・Spring が 4 番目（日）か 6 番目（曜日）で**重ならない**。AWS はどちらかの `?` が必須なので、**AWS と Quartz／Spring が同時に候補に残ることは無い**。例：`0 0 12 ? * *` は AWS だと 4 番目（月）が `?` で誤り → Quartz／Spring として「毎日 12:00:00」と読む。`0 12 ? * MON *` は Quartz／Spring だと 3 番目（時）が `?` で誤り → AWS として「毎週月曜 12:00（UTC）」と読む
   - したがって実際に割れるのは **Quartz と Spring**（下の 6）。それでも候補が2つ以上残り次回実行が変わるときは、両方の読みを並べて方言のボタンで選ばせる（既定は Quartz）。この「割れたら並べて選ばせる」は将来方言を足したときにも同じに扱う
6. Quartz と Spring の両方で読めて、**曜日に数字（`1`〜`7`・`6#3` など）がある**ときは、**両方の読みを並べる**（「Quartz なら金曜、Spring なら土曜」）。曜日が名前（`MON`・`FRI`）か `*`・`?` だけなら読みは同じなので並べない
- 判定の結果は**読んだ方言をはっきり出す**（「Linux の crontab として読みました」）

### 出力

1. **日本語の読み下し**：例 `30 9 * * 1-5` →「月曜〜金曜の 9:30」。`*/15 9-18 * * *` →「9時台〜18時台の、0・15・30・45分」
2. **次の実行日時を 10 件**（日本時間と UTC を併記、曜日つき）。**祝日にかかる回に「祝日（◯◯の日）」の印**、年末年始（12/29〜1/3）にも印。祝日の表の範囲外は下「計算」
3. **フィールドの内訳表**（分・時・日・月・曜日（＋秒・年）ごとに、受け付けた値の一覧）。**列には「① 分」「② 時」…の番号と名前の見出し**を付け、入力欄の下線の色と合わせる（色だけに頼らない。下「画面」）
4. **注意の帯**（該当するときだけ）
   - 日と曜日の両方を指定した crontab の式：「**日と曜日はどちらかに当てはまれば動きます（OR）**。例：`0 9 1 * 1` は『毎月1日』と『毎週月曜』の両方」（判定の正確な条件は下「計算」）
   - **式のタイムゾーンが UTC**（GitHub Actions で `timezone` なし・EventBridge ルール）で、曜日か日を指定し、時刻が UTC 15:00〜23:59（＝日本時間の翌日 0:00〜8:59）の式：「**日本時間では曜日（日付）が1日あとにずれます**」
   - `31` 日や `2/30` など、ある月に存在しない日：「◯月には実行されません」。一度も実行されない式（`0 0 30 2 *`）は「**この式は実行されません**」
   - GitHub Actions：「最短は5分ごと。混雑時は遅れたり飛ばされたりすることがあります」（GitHub のドキュメントの記述どおり。出典リンク）。**GitHub Actions の方言で `@daily` などのマクロを貼ったら**「GitHub Actions はマクロを受け付けません。`0 0 * * *` と書いてください」
   - 曜日の数字の方言差：crontab は 0 と 7 が日曜・Spring は 0/7 が日曜・Quartz と AWS は 1=日曜〜7=土曜。対応表を出す
5. **環境ごとの書き方**（日本時間で書いた式を、その環境で日本時間に動かすには）
   - **GitHub Actions（1番目）**：`timezone: "Asia/Tokyo"` を足した YAML を出す。式はそのまま
     ```yaml
     on:
       schedule:
         - cron: "30 9 * * 1-5"
           timezone: "Asia/Tokyo"
     ```
   - **GitHub Actions（2番目・`timezone` を使えないとき）**：UTC の式に直したもの。使う場面を添える——「既存のワークフローを変えずに直したい」「`timezone` に未対応の GitHub Enterprise Server」
   - **AWS EventBridge Scheduler**：`ScheduleExpression: cron(...)` と `ScheduleExpressionTimezone: Asia/Tokyo` の組（AWS の6フィールドの書式に直す。`?` の付け方も）
   - **AWS EventBridge ルール**：UTC に直した `cron(...)`
   - **Kubernetes CronJob**：`spec.timeZone: "Asia/Tokyo"` を足した YAML
   - **UTC に直すときの規則**：
     - 時刻だけずらせば済む場合（9 時間引いても日付が変わらない）：時のフィールドだけ書き換える
     - 日付をまたぐ場合（日本時間 0:00〜8:59）：曜日・日を1つ前にずらした式を出す。**範囲（`1-5`）や `L` をまたいで1つの式で表せないときは、2 行に分けた式**を出す（GitHub Actions の `schedule` は複数行を書けるので、YAML の形でそのまま貼れるようにする）
   - コピーのボタン（式のみ／YAML のブロック／AWS の `cron(...)`）
6. **作る**（逆向き）：「毎日／平日／毎週◯曜／毎月◯日／◯分ごと」と時刻を選ぶと式を作る（よく使う 10 パターンのボタンを本文にも置く）

### 計算（`tools/lib/cron/`）

- `parse.ts`：方言ごとの文法で解析し、各フィールドを値の集合に展開する。`*`・`,`・`-`・`/`・名前（`JAN`・`MON`）・`?`・`L`・`W`・`#`・`LW`（Quartz・AWS のみ）。**曜日の数字は方言ごとの表で曜日に直す**（Quartz・AWS は 1=日曜、Spring と crontab は 0/7=日曜・1=月曜）。**誤りは位置つきで返す**（「3 番目（日）の `32` は 1〜31 の範囲外」）
- `next.ts`：開始時刻から次の一致を順に探す。**1分ずつ回さず**、年→月→日→時→分（→秒）の順で次の候補へ飛ばす（`0 0 29 2 *` のような稀な式でも速い）。探す上限は 5 年先まで（それ以上は「5年以内に実行されません」）。**探索のステップ数（候補へ飛んだ回数）を数えて返す**（テスト9で上限を見張る）
- タイムゾーンは **UTC と Asia/Tokyo の2つだけ**を扱う。日本は夏時間が無いので +9:00 の固定差で計算でき、`Intl` の重い処理に頼らない（他のタイムゾーンを足すときは別提案。夏時間の「同じ時刻が2回・0回」の扱いが要る）
- crontab の日・曜日（Vixie cron の仕様）：**日・曜日のフィールドが `*` で始まる**（`*` だけでなく `*/2` なども含む）ときは「制限なし」とみなし、**どちらかが `*` で始まるなら AND、両方とも `*` で始まらないなら OR**。たとえば `0 9 */2 * 1` は「`*/2` が `*` で始まる」ので AND（奇数日かつ月曜）になる。Quartz・Spring・AWS は片方が `?`（Spring は `*` でも可）なので常に片方だけ
- 祝日：`tools/lib/nissu-keisan.ts` の `holidayName` を使う。表の範囲（いまは `HOLIDAY_FIRST_YEAR`〜`HOLIDAY_LAST_YEAR` = 2027 まで）を超えた回は、**祝日の印の列に「—（表の範囲外）」**を出し、表の下に「祝日の表は 2027 年まで。それ以降の祝日は印が付きません」と1行出す（10 件のうち1件でも範囲外があるときだけ）。表の更新は `nissu-keisan.ts` の翌年の祝日の追加（例年2月の官報・内閣府の発表）を待つ。このツールに独自の祝日表は持たない

---

## 画面とUI

- 入力欄は 1 行、等幅フォント。フィールドごとに**色分けした下線**に加え、**下線の下に小さく「①分 ②時 ③日 ④月 ⑤曜」の番号と名前**を出し、内訳表の列見出しと一致させる（色の見分けにくい人でも対応が取れるように。色は補助）
- 読み下しを最上段に大きく、次に次回実行の表、注意の帯、内訳表、環境ごとの書き方、作る、の順
- 375px 幅でも次回実行の表を横スクロールさせない（日本時間と UTC を2段に）
- コピーのボタンは 44px 以上。コピーしたら「コピーしました」を 2 秒
- URL のクエリ（`?q=…&d=github`）で式と方言を共有できる（ブックマーク・社内チャットで貼れる）。**式はサーバーに送らない**（静的エクスポートなのでクエリはブラウザの中で読むだけ）
- `tool_use` は「解析に成功した」「環境ごとの書き方を開いた」「コピーした」で送る。**式そのものは送らない**（[tool-use-coverage.md](./tool-use-coverage.md)・[measurement-hygiene.md](./measurement-hygiene.md)）

### ページの中身（SEO・本文）

- `<h1>`：「cron 式 チェッカー（次回実行・日本時間）」
- `title`：「cron 式 チェッカー｜次回実行日時を日本時間で確認・GitHub Actions の timezone と UTC 変換」
- `description`：「cron 式を貼ると、意味を日本語で表示し、次の実行日時を日本時間と UTC で10件並べます。GitHub Actions の timezone 指定・EventBridge の UTC 変換・Quartz と Spring の曜日の違い・日と曜日の OR 条件・祝日にかかる回のチェックも。入力はブラウザの外に送りません。」
- 本文：cron 式の書き方（5 フィールドの表）・よく使う式の一覧（10 例）・方言の違い（表。曜日の数字を含む）・**GitHub Actions で日本時間に動かす方法（`timezone` を書く／書けないときは UTC に直す）**・**AWS のルールと Scheduler の違い**・祝日を除きたいとき（スクリプト側で判定する、の回避策）・よくある質問
- `robots: robotsFor('cron-shiki')`

---

## 確かめること（テスト）

`tools/tests/cron.test.ts`：

1. `30 9 * * 1-5` の読み下しと、基準 2026-12-28（月）9:00 からの次回 10 件 = 12/28・12/29・12/30・12/31・**2027-01-01**・01-04・01-05・01-06・01-07・01-08 の 9:30。12/29〜1/3 に年末年始の印、**1/1 に「祝日（元日）」の印**。別に、基準 2027-01-08（金）9:31 からの次回1件目が **2027-01-11（月・成人の日）9:30 で祝日の印**
2. 日と曜日の OR：`0 9 1 * 1` が 1 日と月曜の両方で動く。`0 9 1 * *` は 1 日だけ。**`0 9 */2 * 1` は AND（奇数日かつ月曜）**
3. `*/15 9-18 * * *`・`0 0 29 2 *`（次は 2028-02-29）・`0 0 30 2 *`（実行されない）・`0 0 31 * *`（31 日のある月だけ）
4. 曜日 0 と 7 が同じ（crontab）／AWS の `cron(0 0 ? * MON-FRI *)` と `cron(0 0 ? * 2-6 *)` が同じ（月〜金）
5. Quartz の `0 0 12 ? * WED`・`0 15 10 L * ?`・`0 15 10 ? * 6#3`（**Quartz なら第3金曜**）。**Spring の `0 15 10 * * 6#3` は第3土曜**、`0 0 9 * * 1-5` は月〜金（Quartz なら日〜木）。数字の曜日で Quartz・Spring の両方に読めるときに両方の読みが返る
6. 自動判定：`0 0 12 ? * *` → Quartz／Spring（AWS は 4 番目の `?` で誤りになり候補から外れる。曜日が `*` なので両者の読みは同じで、並べない）。`0 12 ? * MON *` → AWS（Quartz／Spring は 3 番目の `?` で誤り）。`0 0 9 ? * 2` → Quartz（月曜）と Spring（火曜）の**両方の読みが返る**。5 フィールドの `30 9 * * 1-5` → crontab。`cron(0 9 * * ? *)` → AWS ルール
7. 環境ごとの書き方：
   - GitHub Actions：`30 9 * * 1-5` から `timezone: "Asia/Tokyo"` つきの YAML（式は変えない）が1番目に出る
   - UTC への変換：`0 9 * * *` → `0 0 * * *`／`0 8 * * 1-5` → `0 23 * * 0-4`／`30 8 1 * *`（毎月1日 8:30）→ 前月の末日に当たるので**1行では書けない旨と代替**（`L` の使えない crontab では2行の近似を出さず、説明だけにする。EventBridge ルールなら `cron(30 23 L * ? *)` を出す）
   - EventBridge Scheduler：`ScheduleExpressionTimezone: Asia/Tokyo` と AWS 書式の式の組
8. 誤りの位置：`0 9 32 * *` が 3 番目のフィールドの誤りとして返る
9. `@daily` の展開・`@reboot` の次回実行なし・**GitHub Actions の方言で `@daily` に注意が出る**
10. 次回探索：`0 0 30 2 *` が 5 年の上限で止まり、**ステップ数が上限（例：5 年 × 12 か月 × 数回の飛び＝ 1,000 以下）に収まる**。時間では測らない（CI で揺れるため）
11. 祝日の表の範囲外：基準 2027-12-27 からの `0 9 * * *` 10 件で、2028 年の回に「表の範囲外」が付き、表の下の1行が出る
12. `stage`・`robots`・llms（既存のテスト）

---

## 期待される効果

- 「cron 確認」「cron 式 次回実行」「crontab 書き方」「cron 毎朝9時」「github actions cron 日本時間」「github actions schedule timezone」などの**恒常的な検索**。季節性が無く、法改正ものの山の谷を埋める
- **差別化は「環境ごとに何を書けばよいか」まで答えること**。GitHub Actions は `timezone` で解決するようになったが、(a) UTC 前提の古い解説・既存のワークフローがまだ多く、「`timezone` を書けばよい」と「書かないと UTC」を同じ画面で示す価値がある、(b) EventBridge のルールと Scheduler の違い・Quartz と Spring の曜日の違いは、相変わらず既存のツールサイトが答えていない
- 目安：恒常的に**月 30〜100 着地**（Bing 中心）。GitHub Actions の「日本時間」の悩みは `timezone` の普及で徐々に減るとみて、起票時の見込み（50〜150）から下げた。Bing で上位が取れない場合は月 10〜30 程度。ブックマークされると Direct・Unassigned の再訪が積み上がる
- 開発者向けの道具が 9 本になり、`/tools/` の「計算・変換」の回遊（UNIX 時間・正規表現・JSON 整形）が増える

## 工数（目安）

- 実装：**中（約 25〜35 万トークン）**。内訳は解析と方言（Quartz・Spring・AWS ルール／Scheduler を分ける）8〜10 万・自動判定と両方の読み 3〜4 万・次回探索と祝日 4〜6 万・環境ごとの書き方と UTC 変換 4〜6 万・テスト 4〜5 万・画面と本文・SEO 4〜5 万（レビューを受けて方言を増やしたぶん、起票時の 20〜30 万から上げた）
- 外部ライブラリは使わない（cron のパーサーは小さく、方言の扱いを自分で決めたいので。依存を増やさない方針 [dependency-vulnerability-audit.md](./dependency-vulnerability-audit.md)）

## 将来（このPRの範囲外）

- systemd の `OnCalendar` 形式の読み下し
- 日本時間以外のタイムゾーン（夏時間の扱いが要る）
- 「祝日を除く」スクリプトの断片（bash・GitHub Actions の `if:`）を本文に置く
