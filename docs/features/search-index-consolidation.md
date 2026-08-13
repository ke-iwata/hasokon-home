# 検索インデックス統合の完了（旧サブドメイン → hasokon.com）

**状態**：一部実装。計測スクリプト [`scripts/gsc-canonical-audit.mjs`](../../scripts/gsc-canonical-audit.mjs) は追加済み（2026-08-10）。
**Search Console 上の運用作業（手順1〜4）は未実施**で、運営者の操作待ち。
**対象**：hasokon.com 全体（運用作業が中心。コード変更はほぼ無い）
**起票**：2026-08-10

---

## 背景と根拠

2026-08-08 に `tool.hasokon.com` → `hasokon.com/tools/`、`game.hasokon.com` → `hasokon.com/games/`
のドメイン統合を実施した（[DECISIONS.md](../DECISIONS.md) 2026-08-08 参照）。
その2日後にあたる 2026-08-10 に、Search Console の API で実際の取り込み状況を確認した。

### 計測値（2026-08-10 取得）

**Search Analytics API / 直近28日（2026-07-13〜2026-08-09、プロパティ `https://hasokon.com/`）**

| 指標 | 値 |
|---|---|
| クリック | 3 |
| 表示回数 | 10 |
| 平均掲載順位 | 5.1 |

表示があったのは `/`（9回）・`/privacy.html`（1回）・`/tools/sleep-cycle/`（1回）のみ。
**ツール13本・ゲーム6本のほとんどが検索結果に一度も出ていない。**

**URL Inspection API による個別ページの状態（同日取得）**

| URL | 判定 | カバレッジ | Googleが選んだ正規URL | 最終クロール |
|---|---|---|---|---|
| `/` | PASS | 送信して登録されました | `https://hasokon.com/` | 2026-08-08 |
| `/tools/` | PASS | 送信して登録されました | `https://hasokon.com/tools/` | 2026-08-10 |
| `/tools/furusato-nozei/` | PASS | 送信して登録されました | `https://hasokon.com/tools/furusato-nozei/` | 2026-08-09 |
| `/tools/nenshu-kabe/` | NEUTRAL | 重複。Googleが別のページを正規に選択 | **`https://tool.hasokon.com/nenshu-kabe/`** | 2026-08-07 |
| `/games/minesweeper/` | NEUTRAL | 重複。Googleが別のページを正規に選択 | **`https://game.hasokon.com/minesweeper/`** | 2026-08-07 |
| `/games/` | NEUTRAL | 検出 - インデックス未登録 | － | 未クロール |
| `/games/2048/` | NEUTRAL | 検出 - インデックス未登録 | － | 未クロール |

### ここから分かること

1. **統合そのものは正しく動いている。** 301 は実測で確認済み（2026-08-10）。

   ```
   https://tool.hasokon.com/nenshu-kabe/  → 301 → https://hasokon.com/tools/nenshu-kabe/
   https://game.hasokon.com/minesweeper/  → 301 → https://hasokon.com/games/minesweeper/
   https://roulette.hasokon.com/          → 301 → https://hasokon.com/tools/roulette/
   ```

   canonical タグも新URLを正しく指している（実測でHTMLを確認）。
   **設定の誤りではない。**

2. **にもかかわらず、一部のページは旧サブドメインが正規URLのまま残っている。**
   `nenshu-kabe` と `minesweeper` の最終クロールは **2026-08-07**、つまり統合（08-08）の**前日**。
   Googleは統合前の状態を握ったままで、まだ再クロールに来ていない。

3. **再クロールが済んだページは正しく統合されている。**
   `/tools/furusato-nozei/`（08-09クロール）と `/tools/`（08-10クロール）は
   新URLが正規として登録されている。**つまり、時間が解決する問題ではある。**

4. **ただし放置すると遅い。** 新規ドメインのクロール頻度は低く、86ページ全部が
   再クロールされるまで数週間〜数か月かかる。その間、旧URLに溜まった評価は宙に浮いたままで、
   新URLは検索結果に出ない。**この期間を短縮する手段が Search Console にある。**

### いま欠けているもの

Search Console に登録されているプロパティを API で確認したところ、**1件だけだった**。

```
https://hasokon.com/   （siteFullUser）
```

**旧サブドメイン（`tool.hasokon.com` / `game.hasokon.com` / `roulette.hasokon.com`）が
プロパティとして登録されていない。** これが問題で、

- Search Console の**アドレス変更ツールが使えない**（移転元プロパティの所有権が要る）
- 旧URLに何ページ・どれだけの評価が残っているのか**観測する手段が無い**
- 統合が完了したかどうかを**確認する手段が無い**

アドレス変更ツールは、Google に「このサイトはここへ移った」と明示的に伝えるもので、
301 だけの場合に比べてクロールの優先度が上がり、評価の移転も早くなる。
サブドメイン → ルートドメインの移転は、このツールが正式に対応しているケースにあたる。

---

## 現状の再現手順

```bash
# 1. Search Console に登録されているプロパティを見る（1件しか無いことの確認）
#    → https://hasokon.com/ だけが返る
GET https://searchconsole.googleapis.com/webmasters/v3/sites

# 2. 旧サブドメインが正規URLとして残っているページを見る
POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect
{"inspectionUrl":"https://hasokon.com/tools/nenshu-kabe/","siteUrl":"https://hasokon.com/"}
#    → indexStatusResult.googleCanonical = "https://tool.hasokon.com/nenshu-kabe/"
```

認証は環境変数 `GOOGLE_SERVICE_ACCOUNT_JSON`（`claude@hasokon-site.iam.gserviceaccount.com`）。
スコープは `https://www.googleapis.com/auth/webmasters.readonly`。

---

## 提案する仕様

**コードの変更は無い。Search Console 上の運用作業。**
サービスアカウントは読み取り権限しか持たず、アドレス変更ツールは API から実行できないため、
**運営者が管理画面で操作する必要がある。**

### 手順

1. **旧サブドメインをプロパティとして追加する**（3件）
   - `tool.hasokon.com`
   - `game.hasokon.com`
   - `roulette.hasokon.com`

   所有権の確認は **DNS TXT レコード**で行う。旧サブドメインは全ページ301で
   HTMLを返さないため、HTMLタグ・HTMLファイルによる確認は使えない。
   DNS は hasokon-infra（Terraform）で管理しているので、
   確認用の TXT レコードもそちらに追加する。

2. **アドレス変更ツールを実行する**（3件それぞれ）
   Search Console → 設定 → アドレス変更 → 移転先に `https://hasokon.com/` を指定。
   ツールが 301 の実在を自動検証するので、301 を**外さないまま**実行すること。

3. **サービスアカウントに新プロパティの閲覧権限を付ける**
   `claude@hasokon-site.iam.gserviceaccount.com` を各プロパティの「制限付き」ユーザーに追加。
   これをやらないと、統合の進捗を自動で追えない。

4. **301 を最低1年は維持する**
   アドレス変更ツールの効果は 180日 で切れる。その後も旧URLの被リンクは残るため、
   CloudFront の 301 設定は消さない。hasokon-infra 側にコメントを残す。

### 併せて直すもの（別リポジトリ）

`/games/` が「検出 - インデックス未登録」のままである件は、セクショントップに
自己参照 canonical が無いことも一因と見ている。

移送先として書いていた各リポジトリ（hasokon-tools / hasokon-games）は
モノレポ統合でアーカイブされ、`section-index-canonical.md` はどちらにも存在しないまま
申し送りだけが落ちていた。**[self-canonical-coverage.md](./self-canonical-coverage.md) で
引き取って実装済み**（2026-08-13）。

---

## 期待される効果

| 項目 | 期待 |
|---|---|
| 再クロールまでの期間 | 数週間〜数か月 → **1〜3週間程度に短縮**（アドレス変更ツールの一般的な挙動） |
| 旧URLの評価の移転 | 301のみの場合より確実かつ早くなる |
| 観測性 | 旧URLに残っている表示回数・クリックが**見えるようになる**（現在は完全に不可視） |

**効果の測り方**：実施の1週間後・4週間後に URL Inspection API を全86URLに対して回し、
`googleCanonical` が旧サブドメインを指すURLの件数を数える。**この件数が0になったら統合完了。**
現在の件数は、抽出した7URL中2件（`nenshu-kabe`, `minesweeper`）。
全86URLでの正確な件数は未計測なので、実施前にベースラインとして取っておくこと。

この数え上げは [`scripts/gsc-canonical-audit.mjs`](../../scripts/gsc-canonical-audit.mjs) で自動化してある
（`node scripts/gsc-canonical-audit.mjs --out baseline-2026-08-10.json`）。
旧サブドメインを指すURLが0件なら終了コード0を返すので、統合完了の判定はこれで足りる。
使い方は [scripts/README.md](../../scripts/README.md) を参照。

なお、**この作業で検索順位そのものが上がるわけではない**。
「本来つくはずの評価が正しい場所につく」だけである。順位を上げるのは中身の仕事。

## 工数の見積り

| 作業 | 目安 |
|---|---|
| DNS TXT レコードの追加（hasokon-infra / Terraform） | 30分 |
| プロパティ追加 × 3 + アドレス変更ツール実行 × 3 | 30分 |
| サービスアカウントへの権限付与 × 3 | 10分 |
| ベースライン計測スクリプト（全86URLの `googleCanonical` を集計） | 1時間 |
| **合計** | **約2時間**（うち運営者の手作業は約1時間） |

DNS の伝播待ちがあるため、1日で終わらない可能性がある。

## やらないこと

- **URL削除ツールで旧URLを消す**
  やってはいけない。旧URLを削除すると 301 による評価の受け渡しまで止まる。
  旧URLは「消す」のではなく「移す」。

- **Indexing API での一括送信**
  Indexing API は求人情報とライブ配信にしか対応しておらず、通常のページに使うのは
  ガイドライン違反。効果も無い。

- **URL検査ツールからの手動インデックス登録を86ページ分やる**
  1日あたりの送信数に上限があり、86ページには現実的でない。
  トップページとセクショントップ（`/`, `/tools/`, `/games/`）の3つだけは
  手動送信する価値があるが、それ以外はアドレス変更ツールとサイトマップに任せる。

- **旧サブドメインにコンテンツを復活させて rel=canonical で新URLを指す**
  301 のほうが強いシグナルで、すでに正しく動いている。わざわざ弱い方法に変える理由が無い。
