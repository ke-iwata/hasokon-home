# Google検索のインデックスが「123件中1件」に落ちている — 調査結果と復旧計画

**状態**：提案（2026-09-16 起票）。**運営者作業 1〜3 は 2026-09-17 に実施済み**（手動対策なし。
結果は末尾「経過」）。**2 回目（サイトマップ個別送信・登録リクエスト 10 件）は 2026-09-24**（同じく「経過」）。**4（Bing Webmaster Tools）は 2026-09-25 に実施済み**（所有権確認ファイルを #249・v1.20.0 で本番へ、サイトマップ送信済み。末尾「経過」）。5（`public` 停止）は
運営者の最終判断待ち。 コード側は **A を #211 で・C を 2026-09-17 に（#219）実施済み**、B・D はこれから。
**対象**：hasokon.com 全体（tools / games / learn / home）。運用作業が中心、コード変更は小さい
**起票**：2026-09-16
**緊急度**：高。**Google 経由の流入がほぼゼロになっており、いま新しいツール・ゲームを足しても
Google には載らない**（Bing 経由の流入で持っている状態）

---

## 背景と根拠

2026-08-08 のドメイン統合（`tool.` / `game.` / `roulette.hasokon.com` → `hasokon.com`）から
5週間たったが、**統合先の hasokon.com は Google にほとんど登録されていない**。
[search-index-consolidation.md](./search-index-consolidation.md)（2026-08-10）は
「再クロールが済めば時間が解決する」と見立てていたが、**実際には旧URLの評価は消え、新URLは
登録されない**という最悪の側に転んだ。

### 計測値（2026-09-16 取得）

**URL検査API（`scripts/gsc-canonical-audit.mjs`、サイトマップ 5本・123 URL 全件）**

| 状態（`coverageState`） | 件数 | 意味 |
|---|---|---|
| Submitted and indexed | **1** | `/`（トップ）だけ。最終クロール 2026-09-13 |
| Crawled - currently not indexed | **30** | **Google はクロールしたうえで「登録しない」と判断**。tools 20 / games 10。最終クロールは 08-11〜09-15 に分散 |
| URL is unknown to Google | **91** | サイトマップに載っているのに、Google が URL の存在を認識していない。tools 36（うちルーレット用途別 `/tools/r/*` 10・ガイド `/tools/guide/*` 6）/ games 15 / learn 39 / 固定ページ 1 |
| Duplicate, Google chose different canonical | **1** | `/tools/shobyo-teate/` → `tool.hasokon.com/shobyo-teate/`（最終クロール **08-07**、統合前のまま） |

2026-08-10 の同じ検査では `/games/2048/` は「検出 - インデックス未登録」だった。
それが今は「unknown」に**後退**している。時間が解決する方向には動いていない。

この 30 / 91 の内訳は、現行スクリプトの `--out` で残る JSON（各行の `coverageState`）を
集計したもの。**A が入る前でも同じ手順で再計測できる**：

```bash
node scripts/gsc-canonical-audit.mjs --out audit.json
node -e 'const a=require("./audit.json");const c={};for(const r of a.rows)c[r.coverageState]=(c[r.coverageState]||0)+1;console.log(c)'
```

**Search Console の Search Analytics（プロパティ `https://hasokon.com/`）**

| 期間 | クリック | 表示 |
|---|---|---|
| 2026-07-20〜08-16（前28日） | 5 | 122 |
| 2026-08-17〜09-13（直近28日） | **1** | **4** |
| 日別 | 08-12〜08-16 は 1日 11〜26 表示（平均掲載順位 39〜50位）。**08-20 以降は 1日 0〜1 表示** | |

旧サブドメインのプロパティも直近28日で `game.` 1表示 / `tool.` 1表示 / `roulette.` 0。
**サイト全体で Google の表示が消えている**（旧URLに評価が残っているわけでもない）。

**サイトマップ（Sitemaps API）**：`tools/sitemap.xml` 送信 56・**登録 0**、`games/sitemap.xml`
送信 26・**登録 0**。どちらもエラー 0・警告 0 で、Google は 09-13 / 09-16 に読んでいる。
サイトマップの index（`/sitemap.xml`）は 09-14 に再送信されている。

**GA4（プロパティ 548154955）**：検索エンジン別のオーガニック流入（週次セッション）

| ISO週 | google | bing |
|---|---|---|
| 2026-W33（08-10〜16） | **61** | 3 |
| W34 | 12 | 3 |
| W35 | 13 | 1 |
| W36 | 18 | 54 |
| W37 | 4 | 69 |
| W38（09-14〜15 の2日） | **2** | 27 |

直近28日のチャネル別：**bing/organic 154 セッション（140 ユーザー）、google/organic 45 セッション
（ユーザーは 2 人。`/games/2048/` を繰り返し遊ぶ人 1 人で 21 セッション）**、
chatgpt.com 34、direct 60。**いまのサイトは Bing に支えられている。**
Bing の着地ページは `/tools/saitei-chingin/` 59・`/tools/tabako-zei-neage/` 25・
`/tools/yoikuhi-keisan/` 12 など。**同じページが Google では「unknown」か「Crawled - not indexed」**
なので、コンテンツ側の需要はあるのに Google だけが載せていない、という構図。

### 技術的な原因は「無い」ことを確認した（2026-09-16）

| 確認したこと | 結果 |
|---|---|
| `robots.txt` | `Allow: /` のみ。`Sitemap:` も正しい |
| 公開ページの `<meta name="robots">` | 無し（`public` のページは `robotsFor()` が `undefined` を返す）。`/tools/saitei-chingin/`・`/games/2048/` の実HTMLで確認 |
| `X-Robots-Tag` ヘッダー | 無し（本番のレスポンスヘッダーを確認） |
| CloudFront の地域制限・WAF | 本サイトの distribution は `geo_restriction = none`、WAF 無し（hasokon-infra `modules/static-site/main.tf`）。WAF が付いているのは旧 `roulette.` の distribution のみ |
| Googlebot の UA で取得 | PC・スマホ両方の Googlebot UA で 200、通常 UA とバイト数が同一（クローキング無し） |
| canonical | 全ページ自己参照（監査の `userCanonical` で確認） |
| サイトマップ | 4本とも 200・整形式、Search Console 側もエラー 0 |
| トップページ | 登録済み・09-13 にクロール。**Google はサイトに来ている** |

つまり「Google が取りに来られない」のではなく、**「取りに来たうえで載せない」**。
30件の「Crawled - currently not indexed」がそれを直接示している。

### 考えられる原因（確度順）

1. **サイト単位の品質判定（最有力）。** hasokon.com は Google から見ると 08-08 に生まれた
   新しいサイトで、そこへ **08-08〜08-23 の2週間に 17回リリース（v1.2.2〜v1.15.0。
   タグの作成日で数えた）し、80ページ超を一気に載せた**。Google はこの型を「大量生成されたページ」として
   サイトごと低く評価することがある（2024年3月以降の「scaled content abuse」の扱い）。
   その場合の症状がまさに「トップだけ登録・下層は Crawled - not indexed / unknown・
   サイトマップは読むが登録 0」。
   加えて、**近い作りのページが多い**（ルーレット用途別 `/tools/r/*` 10本＋`/tools/guide/*` 6本は
   同じアプリ＋本文 1,200字前後、ゲームは本文 3,000字前後で大半がUI）ことが判定を悪くしうる。
2. **手動による対策（スパム判定）。** 症状は 1 と区別がつかない。**API では確認できず、
   Search Console の画面「手動による対策」「セキュリティの問題」でしか分からない。**
   これが出ていれば、コードをいくら直しても再審査リクエストを通すまで戻らない。
3. **アドレス変更の副作用。** 08-12 にアドレス変更ツールを使ったが、旧プロパティ側の表示も
   同時に消えており、評価の引き継ぎが起きていない。`/tools/shobyo-teate/` は統合前（08-07）の
   クロール結果のまま止まっている。単独では説明しきれないが、1 を悪化させている可能性はある。

## 提案する仕様

### まず運営者がやること（画面作業。15分。**これが済むまでコード側は着手しない**）

1. **Search Console（`https://hasokon.com/`）→ 「セキュリティと手動による対策」の2画面を開く。**
   何か出ていれば、その内容をこのファイル末尾「経過」に貼る。**出ていた場合は下記 A〜D より先に
   再審査リクエストが最優先**（内容によって直すものが変わるので、ここで止めて相談）。
2. **「ページのインデックス登録」レポート**で「登録されなかった理由」の内訳を控える
   （「クロール済み - インデックス未登録」「検出 - インデックス未登録」「重複」の件数）。
   APIの 30 / 91 と画面が食い違っていたら、その差もメモする。
3. **URL検査 → 「インデックス登録をリクエスト」を、Bing で需要が実証されている順に 1日 10件**。
   優先順：`/tools/saitei-chingin/`（10月改定で今が旬）・`/tools/tabako-zei-neage/`・
   `/tools/yoikuhi-keisan/`・`/tools/shuzei-kaisei/`・`/tools/hebon-romaji/`・`/tools/hankaku-zenkaku/`・
   `/tools/hatarakizon/`・`/tools/`・`/games/`・`/games/2048/`・`/games/block-puzzle/`・`/learn/toshi/`。
   翌日以降に残りを回す（APIでは代替できない。Indexing API は求人・ライブ配信のページ専用）
4. **Bing Webmaster Tools** に `hasokon.com` が登録済みか確認し、未登録なら登録して
   サイトマップを送る（Bing が命綱なので、こちらは守る。IndexNow は別提案
   [indexnow.md](./indexnow.md)（#206 で起票中））
5. **公開（`stage: 'public'` への昇格）を 2〜4週間止める提案。** `preview` までの実装は
   続けてよい（サイトマップに載らない）。理由：1 の判定なら、ページを増やすほど悪化する。
   1 か 2 かが分かり、登録数が増え始めるのを見てから昇格を再開する。
   **これは運営者の判断事項**なので、ここでは提案に留める。
   停止を採る場合は、CLAUDE.md の「フラグは腐る」（状態行に「いつ `public` にするか」を書く）と
   整合させるため、**公開待ちの仕様書（例：#202 育児休業給付金、#203 タイピング練習）の
   `**状態**：` 行に「`public` は google-index-recovery.md の解除判断後」と書く**。
   解除の判断（下記の判定条件を満たした日）はこのファイルの「経過」に残し、そのときに
   各仕様書の状態行も戻す。これが無いと停止が黙って続き、誰も解除の判断をしなくなる

### コード側（運営者の確認のあとに実施。触るファイルまで書く）

**A. 監査スクリプトの内訳出力（`scripts/gsc-canonical-audit.mjs`）**
- 現状は「未登録（unindexed）」を1つの数にまとめているが、**「Crawled - not indexed」と
  「unknown」は意味が違う**（前者は Google の判断、後者は未発見）。`coverageState` ごとの件数と
  URL 一覧を出力に足し、`--out` の JSON にも残す
- README に「復旧の判定は『登録 1 → 増加』を見る」と書く。判定条件：
  **登録（indexed）が 4週連続で増える**こと、および Search Console の表示が 1日 10 を超えること
- 週1回回すための GitHub Actions（`.github/workflows/gsc-audit.yml`、`schedule` + `workflow_dispatch`）。
  Secret `GOOGLE_SERVICE_ACCOUNT_JSON` を repo に登録する必要がある（運営者作業）。
  結果は Actions のログと artifact に残し、コミットはしない

**B. 近い作りのページを絞る（`tools/app/r/[slug]/page.tsx`・`tools/app/guide/[slug]/page.tsx`・`tools/app/sitemap.ts`）**
- ルーレット用途別 10本・ガイド 6本の計 16本は、直近28日で Google 表示 0・Bing 着地も
  `/tools/group/` の 1件のみ。**サイト全体の登録が戻るまで `noindex` にし、サイトマップから外す**
  （ページは残す。ルーレット本体からのリンクもそのまま）
- `robotsFor()` はツール単位なので、この2ルート用に `robots: { index: false, follow: true }` を
  `generateMetadata` で直接返す。`tools/tests/stage.test.ts` の対象外なので、専用テストを1本足す
- 登録が戻ったあとに `index` へ戻すかは、そのときの登録数で決める（戻す判断もこのファイルに追記）

**C. 運営者情報を 1か所に（`home/about.html` 新設、`tools/app/about/`・`games/app/about/` は `noindex` にして誘導）**
- いま「運営者情報」は `/tools/about/` と `/games/about/` の2枚で、**どちらも Google に unknown**。
  ホームの footer からも `/tools/about/` に飛ばしている。**learn の footer には「運営者情報」の
  リンク自体が無い**（`/privacy.html` と `/tools/contact/` のみ）
- YMYL（税・社会保険）のページが多いサイトで、運営者ページが登録されていないのは品質判定に
  効く。ルート直下に 1枚置き、`sitemap-home.xml` に足す
- footer は **home / tools / games が「付け替え」、learn は「新規追加」**。learn は unknown 39件で
  最大のブロックなので、ここが抜けると効果が薄れる
- **既存2枚（`/tools/about/`・`/games/about/`）は `robots: { index: false, follow: true }` にし、
  サイトマップから外す。** 本文を短くして `/about.html` へのリンクだけ置く。
  `noindex` にしないと、B で減らそうとしている「近い作りの薄いページ」を自分で2枚増やすことになる。
  `canonical` を `/about.html` に向ける案は採らない（内容が違うページへの canonical は
  Google が無視することが多く、結果が読めない）。301 も採らない（`home/` は素の静的HTMLで
  CloudFront 関数の変更が要る）
- `home/about.html` は `privacy.html` と同じ骨組み・同じスマホ幅の見え方に揃える
  （home はビルド無しで CSS を共有していない）
- **既存2枚を `noindex` にしたあとも、そこを指す導線が footer 以外に3か所残る。** 同じPRで
  すべて `/about.html` へ付け替える（`noindex` のページへ案内し続けない）：
  - `home/llms.txt` の「運営者情報」（`/tools/about/`）と「ゲームの運営者情報」（`/games/about/`）の
    2行を、`/about.html` の1行に統合する（`scripts/test/llms-txt.test.mjs` は about を固定ページ
    として除外しているので、テストの追加は不要）
  - `home/privacy.html` の本文と footer にある `/tools/about/` へのリンク（2か所）。
    「footer の付け替え（home）」は `index.html` だけでなく `privacy.html` も含む
  - `games/app/about/page.tsx` の「計算ツール側の運営者情報」（`/tools/about/` へのリンク）。
    `noindex` 同士で相互にリンクする形を残さない

**D. 統合前のまま止まっている 1件（`/tools/shobyo-teate/`）**
- 運営者作業 3 の「インデックス登録をリクエスト」に含める。それで直らなければ、
  旧プロパティ `https://tool.hasokon.com/` 側で同 URL を検査し、301 が認識されているか見る

### やる順番

```
運営者 1〜4（当日）→ 結果を「経過」に追記
  ├ 手動対策あり → 再審査が最優先。A〜D は内容に合わせて組み替える
  └ 手動対策なし → A（監視）→ B・C（同じ週）→ 2週間後に再計測 → 5 の解除を判断
```

## 期待される効果

| 効果 | 測り方 |
|---|---|
| Google の登録が 1件 → 増え始める（最初の目標：30件の「Crawled - not indexed」が減る） | `scripts/gsc-canonical-audit.mjs` の週次結果（A） |
| Search Console の表示が 1日 0 → 2桁に戻る（08-12〜16 の水準） | Search Analytics API の日別表示 |
| Bing で実証済みの需要（最低賃金・たばこ税・養育費）が Google でも取れる | GA4 の google/organic の着地ページ |
| 手動対策の有無が分かり、無駄なコード変更を避けられる | 運営者作業 1 の結果 |

**効果が出ない場合の見切り**：運営者作業 3 で登録リクエストした 12 URL が、**2週間たっても
「Crawled - not indexed」のまま**なら、原因 1 がほぼ確定。そのときはページ単位の本文を厚くする
（各ツールに「計算の根拠」「よくある質問」の固定セクションを足す）方向へ切り替える。
これは別の仕様書で起票する。

## 工数の見積り

| 作業 | 消費トークン（目安） |
|---|---|
| 運営者の画面作業 1〜4 | 0（人手 15分＋登録リクエスト 1日 10件×2日） |
| A. 監査スクリプトの内訳出力＋テスト＋週次 workflow | 40k |
| B. 16ページの noindex・サイトマップ除外＋テスト | 30k |
| C. `home/about.html` 新設、footer の付け替え（home / tools / games）と新規追加（learn）、既存2枚の noindex＋サイトマップ除外＋テスト、`home-nav` テスト更新 | 50k |
| D. 1件の再検査 | 5k |
| **合計** | **約125k** |

## 実装者への申し送り

- **B の `noindex` は「まだ公開していないもの」ではなく、一度公開したものを引っ込める操作**なので、
  CLAUDE.md の「引っ込めるのは別の作業」に当たる。戻す条件（登録数の閾値）は上に書いたとおり。
  **実施日と戻した日を「経過」に必ず残す**こと
- C の `home/about.html` は `privacy.html` と同じ骨組み・同じスマホ幅の見え方に揃える
  （home はビルド無しで CSS を共有していない）
- A の workflow に要る Secret `GOOGLE_SERVICE_ACCOUNT_JSON` の登録は運営者作業。
  `.github/workflows/gsc-audit.yml` を足す PR の説明に、登録手順（Settings → Secrets and
  variables → Actions、値はサービスアカウントの JSON をそのまま）を書くこと
- コミットは `docs:` ではなく `feat:` / `chore:`（`scripts/`・`tools/`・`games/`・`learn/`・`home/` を触るため）

## やらないこと

- **ドメイン統合を戻す（旧サブドメインを復活させる）。** 旧URLの表示もすでに消えており、
  戻しても評価は戻らない。二度目の移転でさらに悪化する
- **Indexing API での一括登録。** 対象が求人（JobPosting）・ライブ配信（BroadcastEvent）に
  限られており、規約外の利用はスパム判定の材料になる
- **ページを増やして「厚みを出す」。** 原因 1 なら逆効果。増やす前に減らす（B）
- **サイトマップの `lastmod` を毎回更新する。** 更新していないページの `lastmod` を動かすと
  Google が `lastmod` 自体を無視するようになる（`tools/app/sitemap.ts` のコメントどおり）
- **Google 以外の対策の中止。** Bing・ChatGPT（`llms.txt`）経由の流入は伸びている（直近28日で
  chatgpt.com から 34 セッション）。こちらは続ける

## 経過

- 2026-09-16：起票。上記の計測値を取得（URL検査 123件・Search Analytics・GA4・Sitemaps API）
- 2026-09-16：企画レビュー（#204）で、既存 about 2枚の扱い（`noindex`）・learn の footer は新規追加・
  `public` 停止時は公開待ち仕様書の状態行に書く運用、を反映。リリース数を 17回（v1.2.2〜v1.15.0）に訂正
- 2026-09-16：企画レビュー（#209）で、C の実装時に `home/llms.txt`・`home/privacy.html`・
  `games/app/about/` に残る `/tools/about/`・`/games/about/` への導線も `/about.html` へ付け替えることを追記
- 2026-09-16：**A を実施（#211）。** `scripts/gsc-canonical-audit.mjs` に `coverageState` 別の
  件数・URL一覧を足し（`--out` のJSONには `coverageByState`）、
  `.github/workflows/gsc-audit.yml` で毎週月曜 09:00 JST に回すようにした。
  判定条件は `scripts/README.md` に書いた。
  **Secret `GOOGLE_SERVICE_ACCOUNT_JSON` の登録は運営者作業**（未登録のうちは警告を出して飛ばす。
  登録手順は `scripts/README.md`）。**B・D はここでは触っていない。** B（16ページの `noindex`）は
  公開中のページを検索から引っ込める後戻りしにくい変更なので、運営者作業 1〜2 の結果を待った
- 2026-09-17：**C を実施。** `home/about.html` を新設して `sitemap-home.xml` に追加、
  footer は home / tools / games を付け替え・learn に新規追加、既存2枚
  （`/tools/about/`・`/games/about/`）を `noindex, follow` にしてサイトマップから外した。
  導線は上に挙げた3か所に加え、**仕様書に無かった2か所**（`tools/app/page.tsx` のリード文と、
  全ツールページ下部の `tools/app/ToolMeta.tsx`）と `PUBLISHER.mainEntityOfPage` も
  `/about.html` へ付け替えた。**`noindex` にした日は 2026-09-17**（戻す判断はこの「経過」に追記する）
- 2026-09-17：**運営者作業 1〜3 を実施**（Chrome の Search Console 画面、プロパティ `https://hasokon.com/`）。
  - **1. 手動による対策・セキュリティの問題：どちらも「問題は検出されませんでした」。**
    原因 2（手動対策）は消えた。残るのは原因 1（サイト単位の品質判定）と 3（アドレス変更の副作用）
  - **2. 「ページのインデックス登録」レポート（画面の最終更新 2026/09/04）**：登録済み **8**・未登録 **60**。
    未登録の理由内訳：クロール済み - インデックス未登録 **24**／検出 - インデックス未登録 **34**／
    ページにリダイレクトがあります 1／重複（Google が別の正規 URL を選択）1。
    登録済み 8 件は `/`・`/tools/koko-jugyoryo/`・`/games/block-puzzle/`・`/tools/warikan/`・
    `/tools/hebon-romaji/`・`/tools/privacy/`・`/tools/group/`・`/games/solitaire/`
    （最終クロール 08/11〜08/26）。
    **API（09-16 の 1 / 30 / 91）との差**：画面は 09/04 で止まっている。画面で「登録済み」の
    `hebon-romaji`・`block-puzzle` は、URL 検査のライブ結果では「クロール済み - インデックス未登録」
    だった。つまり **09/04 以降にさらに落ちている**。画面が数えるのは Google が「認識している」
    68 URL だけで、API の unknown 91 の大半は画面に出ない
  - **3. インデックス登録をリクエスト：13 件送信**（割り当て超過にはならなかった）。送信時の状態：

    | URL | URL 検査の結果（ライブ） | 前回のクロール |
    |---|---|---|
    | `/tools/saitei-chingin/` | URL が Google に認識されていません | — |
    | `/tools/tabako-zei-neage/` | クロール済み - インデックス未登録 | 08/16 |
    | `/tools/yoikuhi-keisan/` | 認識されていません | — |
    | `/tools/shuzei-kaisei/` | 認識されていません | — |
    | `/tools/hebon-romaji/` | クロール済み - 未登録（参照元は `tool.hasokon.com` の旧URL） | 08/21 |
    | `/tools/hankaku-zenkaku/` | 認識されていません | — |
    | `/tools/hatarakizon/` | クロール済み - 未登録 | 08/22 |
    | `/tools/` | クロール済み - 未登録（参照元 `/tools/nenshu-kabe/`） | 09/05 |
    | `/games/` | クロール済み - 未登録 | 09/05 |
    | `/games/2048/` | 認識されていません | — |
    | `/games/block-puzzle/` | クロール済み - 未登録（サイトマップ欄「一時的な処理エラー」） | 08/22 |
    | `/learn/toshi/` | 認識されていません（参照元サイトマップなし） | — |
    | `/tools/shobyo-teate/`（D） | 重複・Google が別の正規 URL を選択 | 08/08 |

    **Bing で流入のある 3 本（最低賃金・養育費・酒税）が「認識されていません」**。Google はこれらの
    URL の存在自体を知らない。2 週間後（10-01 ごろ）に同じ 13 件を URL 検査 API で再計測する
  - **4. Bing Webmaster Tools：未確認。** AI エージェントの Chrome ではサインインしていない状態で、
    認証情報の入力は運営者にしか行えない。運営者が `hasokon.com` の登録とサイトマップ送信を確認する
  - **5.（`public` 昇格の一時停止）**：**運営者の最終判断は未**。企画レビュー（#204）が同意したのは
    「停止を採る場合の運用」（公開待ち仕様書の状態行に書く）であって、停止そのものは仕様書どおり
    運営者の判断事項のまま。運営者が採用したら、この行に「運営者が採用（日付）」と書き換える。
    それまでは #218・#220 など新規ツールの提案は「`public` は本ファイルの解除判断後」と書いて
    `preview` までで止める運用で進める。
    **（#209 で決めた、#202 育児休業給付金・#203 タイピング練習の `**状態**：` 行への
    「`public` は google-index-recovery.md の解除判断後」の追記は別PRで行う約束で、未実施）**
  - **新しい発見：サイトマップ index の子が Google に読まれていない。**
    Search Console の「サイトマップ」で `/sitemap.xml`（インデックス）は 09/15 に「成功しました」だが、
    **「読み込まれたサイトマップ」が 0 件・検出されたページ数 0**。Google が読んでいるのは 08/14 に
    個別送信した `/tools/sitemap.xml`（56）と `/games/sitemap.xml`（26）だけで、
    **`/learn/sitemap.xml`（39 URL）と `/sitemap-home.xml` は一度も読まれていない**。
    learn の unknown 39 件、`/learn/toshi/` の「参照元サイトマップなし」と一致する。
    実体の `https://hasokon.com/sitemap.xml` は 4 本の `<sitemap>` を正しく列挙しており（curl で確認）、
    ファイル側の問題ではない。**次の手：Search Console から `/learn/sitemap.xml` と
    `/sitemap-home.xml` を個別に送信する**（運営者の判断待ち。送信するだけで戻せる）。
    A の週次監査には、index の子サイトマップが読まれているかの確認も足す
- 2026-09-24：**サイトマップ 2 本の個別送信と、登録リクエスト 2 回目 10 件を実施**
  （運営者の承認のもと、Chrome の Search Console 画面、プロパティ `https://hasokon.com/`）。
  - **計測**：検索パフォーマンスの直近 7 日（09-15〜09-21）は **クリック 0・表示 0**。
    09-17 の登録リクエストから 1 週間で、表示はまだ戻っていない
  - **サイトマップ**：`/learn/sitemap.xml` を送信 → 即日「成功しました」**検出 39**。
    `/sitemap-home.xml` を送信 → 「成功しました」検出 2（最終読み込みは 09/09 の古い版。
    `/about.html` を含む現行 3 URL は次回読み込みで反映される見込み）。
    **learn の 39 URL が初めて Google に届いた**
  - **登録リクエスト 10 件**（送信時の URL 検査の状態）：

    | URL | 状態 | 前回のクロール |
    |---|---|---|
    | `/learn/` | 認識されていません | — |
    | `/about.html` | 検出 - インデックス未登録（参照元 `sitemap-home.xml`） | — |
    | `/tools/nenshu-kabe/` | クロール済み - 未登録（サイトマップ欄「一時的な処理エラー」） | 08/18 |
    | `/tools/nenmatsu-chosei/` | 認識されていません | — |
    | `/tools/tedori-keisan/` | 認識されていません | — |
    | `/tools/furusato-nozei/` | クロール済み - 未登録（参照元 `/tools/group/`） | 08/22 |
    | `/tools/ideco/` | 認識されていません | — |
    | `/tools/kogaku-ryoyohi/` | 認識されていません | — |
    | `/tools/zangyodai-keisan/` | 認識されていません | — |
    | `/tools/nenrei-keisan/` | クロール済み - 未登録（参照元 `/tools/`） | 08/22 |

    `/tools/nenmatsu-chosei/` は操作の都合で 2 回送信になった（害はない）。
    **`/tools/sitemap.xml` に載っているのに「参照元サイトマップが検出されませんでした」の URL が多い**
    （Google は tools のサイトマップを 09/13 に読んでいるのに、個々の URL と結び付いていない）。
    10-01 ごろの再計測で、09-17 の 13 件と合わせて 23 件を見る
  - **4. Bing Webmaster Tools**：09-24 の時点では AI エージェントの Chrome は未サインイン
    （`/webmasters/home` が紹介ページへ転送）。**2026-09-25、運営者がサインインして所有権確認ファイル
    `BingSiteAuth.xml` を取得し、#249 で `home/` に設置した。** `home/` はビルド工程が無く、
    本番に出るのは `v*` タグのリリースなので、**v1.20.0（2026-09-25 起動）で本番反映**。
    そのあと運営者が Bing Webmaster Tools の画面で確認を完了し、`https://hasokon.com/sitemap.xml` を送信する
  - **サイトマップ送信は [sitemap-discovery-audit.md](./sitemap-discovery-audit.md) の C そのもの。**
    同ファイルの状態行と「経過」も更新した。C の完了は **09-28（月）の週次監査で最初に確認し、10-05（月）で確定**（送信後 1 週間の基準）。見るのは
    `/learn/sitemap.xml`・`/sitemap-home.xml` に `known: true` と `lastDownloaded` が入り、
    終了コード 1 が消えるかで見る。A（robots.txt）は 09-19 に単独で本番に出ていて
    その 5 日間の効果はほぼゼロ（#245 の計測で learn の unknown 39 → 38）なので、
    **10-01 以降に learn の unknown が動いたら C に帰属できる**
  - **この送信で、#245 の B の指標はベースラインを失った。** #245 は B（サイトマップ index に
    `lastmod` を入れる）の効果を「`/sitemap-home.xml` の `lastDownloaded` が 09-08 から動くか」で
    測る約束だったが、09-24 に手で送信したので、以後 `lastDownloaded` が動いても送信のせいか
    `lastmod` のせいか区別できない。#245 側で測りかたを差し替える
  - **降り口（10-01 の再計測で決める）**：09-17 の 13 件と 09-24 の 10 件、計 23 件を URL 検査 API で
    再計測し、**`unknown` と `Crawled - currently not indexed` がどちらも動かなければ、
    登録リクエストの 3 回目はやらない。** 以降はサイトマップ・送信系の手当てを止め、次のどれかに移る
    （**どれに移るかは運営者判断待ち**）：
    ① 品質判定側（B の 16 ページ `noindex`、「見切り」に書いた各ツールの本文を厚くする別仕様書）／
    ② 4 の Bing Webmaster Tools（GA4 の 90 日・`sessionSource` で最大の流入元：bing 240 セッション＝全体 約 672 の約 36%、検索エンジン経由〔bing 240・google 119・search.google.com 11〕に絞ると約 65%。#246 の実測）／③ 5 の `public` 昇格停止の最終判断。
    ここまでの実績：登録リクエストは 2 回（計 23 件）、Search Console の表示は 0 → 0、
    `Submitted and indexed` は 1 → 1、`Crawled - currently not indexed` は 30 → 36
- 2026-09-25：**運営者作業 4（Bing Webmaster Tools）を完了。** `home/BingSiteAuth.xml`（#249）を
  v1.20.0 で本番に出し、`https://hasokon.com/BingSiteAuth.xml` が 200 を返すことを確認。
  運営者の承認のもと AI エージェントが Chrome で操作し、hasokon.com のダッシュボードが開ける
  （所有権の確認が通っている）ことを確かめたうえで、「サイトマップ」から
  `https://hasokon.com/sitemap.xml` を送信した（送信時点で登録サイトマップは 0 本、送信後は「Processing」）。
  検索パフォーマンスは「48 時間後に確認」の表示で、データはまだ無い。
  **初回計測は 09-28（月）の週次監査で一緒に取り、ここに残す**（検索パフォーマンス〔表示・
  クリック・着地ページ〕とサイトマップの「URLs discovered」）。48 時間の経過が 09-27〔日〕なので
  その翌日にあたる。**「09-27 以降」と開いたままにすると、画面作業なので誰も取りに行かない**
  （運営者作業 5 の「これが無いと停止が黙って続き、誰も解除の判断をしなくなる」と同じ）。
  比較の起点は**送信前の bing 240 セッション**（GA4 の 90 日・`sessionSource`。#246 の実測）。
  ただし**この送信は流入を増やすためではなく発見経路を通すためのもの**なので、
  セッションが増えなくても失敗ではない。IndexNow の受信状況は Bing Webmaster Tools の
  画面では確認できなかった（紹介ページのみ）
- 2026-09-25：**Search Console の画面を一通り確認**（運営者の承認のもと AI エージェントが Chrome で操作）。
  **登録リクエストは今回は出していない**（理由は 1 つ目）。
  - **09-17 に登録リクエストした URL は、同日（09-17）に Google がクロールしたうえで
    「クロール済み - インデックス未登録」になっている。** 「ページのインデックス登録」→
    「クロール済み - インデックス未登録」（30 件）の例に、`/tools/saitei-chingin/`・`tabako-zei-neage`・
    `yoikuhi-keisan`・`shuzei-kaisei`・`hankaku-zenkaku`・`hatarakizon`・`/tools/`・`/games/`・
    `/games/2048/`・`/learn/toshi/` が並び、前回のクロールはすべて 2026/09/17。
    **リクエストは効いていて Google は取りに来るが、取ったうえで載せない。** 原因 1（サイト単位の
    品質判定）をさらに強く裏づける。登録リクエストを増やしても「クロール済み - 未登録」が増えるだけなので、
    **3 回目は 10-01 の再計測を待たずに見送る**（上の「降り口」を前倒しで適用）
  - この 30 件の「修正を検証」は 08-27 に開始、**09-05 に「失敗しました」**。
    「検出 - インデックス未登録」（47 件、前回のクロールはすべて「該当なし」）の検証は 09-05 開始で「開始」のまま。
    **内容を変えないまま検証をやり直しても同じ結果になる**ので、再検証は B など中身を変えたあとに回す
  - サイトマップ：`/sitemap-home.xml` が 09-24 に読み直されて**検出 3**（`/about.html` 入り）、
    `/learn/sitemap.xml` は 09-24 に読まれて**検出 39**。C は効いている
  - **クロールの統計情報（90 日）**：リクエスト 964 件、200 が 96%、平均応答 272 ms、
    ホストの問題なし。目的別は「更新」95%・「検出」5%。**技術的なクロールの障害は無い**
  - **新しい発見：404 の中身（21 件）に、`/tools/`・`/games/` の抜けた URL がある。**
    `https://hasokon.com/yoikuhi-keisan/`・`/hatarakizon/`・`/shobyo-teate/`・`/kosodate-shienkin/`・
    `/bosai-bichiku-keisan/`・`/hebon-romaji/`・`/interval-timer/`・`/speed/` など、
    **08-11〜08-17 に集中**（ほかに `/games/favicon.ico`・`/tools/favicon.ico`）。
    旧サブドメインの 301 は正しく `/tools/…`・`/games/…` を指している（curl で確認）ので、
    これは **アドレス変更ツール（08-12）が「`tool.hasokon.com/X` → `hasokon.com/X`」と
    同じパスを推測した結果**と見るのが自然
  - **アドレス変更は 3 本とも「このサイトは現在移行中です」**（`tool.`・`game.`・`roulette.` → `hasokon.com`）。
    公式ヘルプ（[アドレス変更ツール](https://support.google.com/webmasters/answer/9370220)）は
    **「複数のサイトを 1 か所にまとめる移転は避ける。A・B・C をすべて D に移すと、混乱して
    トラフィックを失うことがある」**としており、hasokon.com はまさにこの形。
    申請は **180 日以内なら取り消せる**（08-12 申請なので 2027-02 上旬まで）。
    **取り消すかは運営者判断待ち**（301 はそのまま残すので、取り消しても転送は失われない。
    ただし旧 URL の評価の引き継ぎはすでに消えているので、取り消しで戻るものも期待しにくい）。
    原因 3 はこれで「単独では説明しきれない」から「**設定が公式の推奨から外れている**」に格上げ
