# IndexNow を本番デプロイに組み込む（Bing 経由の流入を守り、更新を即日反映させる）

**状態**：実装済み（2026-09-16）。鍵ファイルは `home/bd59c05dafed335478f48aefb1c0ec57.txt`。
**初回の送信は次の `v*` リリースまで起きない**ので、それまでに運営者が
Bing Webmaster Tools の登録（下記 4）を済ませる。
**対象**：`.github/workflows/deploy.yml`（本番デプロイのジョブ）・`home/`（鍵ファイル 1枚）・
`scripts/`（送信スクリプト＋テスト、`scripts/lib/sitemap.mjs` に `lastmod` を拾う関数を1本）・
`CLAUDE.md`「home/ の注意」（鍵ファイルの1行）
**起票**：2026-09-16
**関連**：[google-index-recovery.md](./google-index-recovery.md)（#204 で起票中。Google 側の復旧。
**本提案は Google には効かない**。Google は IndexNow に参加していない）

---

## 背景と根拠

### 計測値（2026-09-16 取得、GA4 プロパティ 548154955）

直近28日（08-19〜09-15）の検索エンジン別オーガニック流入：

| 参照元 | セッション | ユーザー |
|---|---|---|
| **bing / organic** | **154** | **140** |
| google / organic | 45 | 2 |

週次では bing が W36 54 → W37 69 と伸びており、**いまサイトの検索流入の 8割弱は Bing**
（Google の登録が消えている間の命綱）。Bing の着地ページは
`/tools/saitei-chingin/` 59・`/tools/tabako-zei-neage/` 25・`/tools/yoikuhi-keisan/` 12・
`/tools/hebon-romaji/` 9・`/tools/shuzei-kaisei/` 9・`/tools/hankaku-zenkaku/` 6。

### 何が足りないか

- Bing がいつ再クロールするかはサイトマップ任せ。**最低賃金の追補（09-09）のように
  「その日のうちに正しい数字に変わってほしい」更新**が、Bing 側にいつ届くか分からない
- Bing Webmaster Tools の登録状況を、このリポジトリからは確認できない（運営者作業）
- 新しく `public` にしたページが Bing に載るまでの時間も、いまは計測していない

### IndexNow とは

Bing・Yandex・Naver・Seznam・Yep が共同で受け付ける「このURLが更新された」の通知プロトコル
（ https://www.indexnow.org/ ）。サイト側は鍵ファイルをドメイン直下に置き、
`https://api.indexnow.org/indexnow` に URL の一覧を POST するだけ。1回 10,000 URL まで、
無料、認証はその鍵ファイルのみ。**1つのエンドポイントに送れば参加エンジン全部に共有される**。
**「変更した URL の通知」であって、変わっていない URL を繰り返し送ることは推奨されていない**。

## 提案する仕様

### 1. 鍵ファイル（`home/<key>.txt`）

- 32文字の英数字（`openssl rand -hex 16`）を鍵にし、`home/<key>.txt` に鍵そのものを書く。
  `home/` は `aws s3 sync --delete` でバケット直下に同期されるので
  `https://hasokon.com/<key>.txt` で配信される
  （**サイトの成果物なので `home/` に置いてよい**。CLAUDE.md の「成果物以外を置かない」に反しない）
- **鍵はこのファイルにしか書かない。** `deploy.yml` や Secrets に同じ値を複製しない
  （2か所がずれた瞬間に全送信が 403 になり、しかも下記のとおり終了コード 0 なので誰も
  気づかない。送信スクリプトは**このファイルから鍵を読む**）
- 鍵は秘密ではない（URL を知っていれば誰でも読める設計）。**ただし鍵を知る第三者が
  他人の URL を送ることはできない**（送れるのは鍵ファイルが置かれたホストの URL だけ）。
  ローテーションはファイルを差し替える（名前も中身も変える）だけ
- `sitemap-home.xml` / `llms.txt` には載せない（サイトの案内に出す類のものではない）
- `test.hasokon.com` にも同じファイルが配られるが、Basic 認証の裏なので害はない
- **CLAUDE.md「home/ の注意」に1行足す**：「`<32桁>.txt` は IndexNow の鍵ファイル。消さない。
  仕様は docs/features/indexnow.md」。用途不明の1枚があると、次に `home/` を整理する人が消す

### 2. 送信スクリプト（`scripts/indexnow-submit.mjs`）

```
node scripts/indexnow-submit.mjs \
  --key-file home/<key>.txt \
  --before /tmp/sitemaps-before/ \
  --after /tmp/sitemaps-after/ \
  --sitemap https://hasokon.com/sitemap.xml \
  [--dry-run]
```

- **`lastmod` が動いた URL だけ送る。** デプロイジョブの先頭（S3 同期の前）で本番の
  sitemap 4本（`sitemap-home.xml` / `tools/sitemap.xml` / `games/sitemap.xml` / `learn/sitemap.xml`）を
  `--before` のディレクトリに取っておき、**いま同期する sitemap（`--after`）**と
  `<loc>` ＋ `<lastmod>` で突き合わせる。**新規の URL、または `lastmod` が変わった URL** が送信対象。
  **「後」側を配信中の sitemap から HTTP で取ってはいけない**（#212 のレビュー指摘）。
  CloudFront の無効化が終わる前に取りに行くとデプロイ前と同じものが返り、差分が 0 件になって
  **黙って送り漏れる**。無効化の完了待ちは権限不足やタイムアウトで飛びうるので、
  差分の判定をそこに依存させない。
  `lastmod` は既に `lib/registry.ts` の `updatedAt` から出している（毎ビルドで動かさない運用。
  `tools/app/sitemap.ts` のコメント）ので、**差分は既存の「内容を変えたら `updatedAt` を上げる」
  運用にそのまま乗る**。ビルド側の差分検出は要らない
- **前の sitemap が取れなかった（初回・取得失敗）ときは全件送る。** 送り漏れ側には倒さない
- URL の収集は `scripts/lib/sitemap.mjs` の `collectUrls()`（`gsc-canonical-audit.mjs` が
  import しているのと同じもの）。`<lastmod>` も要るので、`parseLocs()` の隣に
  `parseEntries()`（`{ loc, lastmod }` の配列を返す）を1本足し、テストは
  `scripts/test/sitemap.test.mjs` に相乗りさせる
- 鍵は `--key-file` から読む。**鍵ファイルの中身＝ファイル名（拡張子を除く）** でなければ
  エラーにする（IndexNow の検証はこの一致を見るため）
- `host` / `key` / `keyLocation`（`https://hasokon.com/<key>.txt`）/ `urlList` を JSON で POST。
  レスポンス 200 / 202 を成功とし、それ以外はログに出して**終了コード 0 で終える**
  （デプロイを失敗させない。通知は「あれば嬉しい」であって必須ではない）。
  **失敗時は GitHub Actions の `::warning::` 注釈を出す**（終了コード 0 でも Actions の画面で見える）。
  送信対象が 0 件なら POST しない
- 依存パッケージなし（`fetch` のみ）。**テストはネットワークを使わない**（`scripts/README.md` の約束）。
  `gsc-canonical-audit.mjs` と同じく `main(argv, deps)` で `fetch` と `readFile` を差し替えられる形にし、
  `scripts/test/indexnow-submit.test.mjs` で次を固定する：
  - 差分の抽出（新規 / `lastmod` 変更 / 変更なし / 前の sitemap 無しなら全件）
  - リクエスト本文（`host` / `key` / `keyLocation` / `urlList`）
  - 鍵ファイルの中身＝ファイル名の検査
  - 失敗時に `::warning::` を出し、終了コードは 0

### 3. デプロイへの組み込み（`.github/workflows/deploy.yml`）

- **本番（`v*` タグ）のジョブだけ**、3ステップを足す。テスト環境（main）では送らない
  （`test.hasokon.com` は Basic 認証で、送っても無意味）
  1. S3 同期の前：本番の sitemap 4本を `curl` で `--before` のディレクトリに保存（失敗しても続行）
  2. `download-artifact` のあと：いま同期する sitemap 4本を `--after` のディレクトリにコピーする
     （`home/sitemap-home.xml` と `{tools,games,learn}-out/sitemap.xml`）
  3. `CloudFrontのキャッシュを削除` のあと：**`aws cloudfront wait invalidation-completed`** で
     無効化の完了を待つ（`create-invalidation` は非同期で、完了まで数分かかる。直後に通知すると
     Bing が古い HTML を取り直す）。待てなかったときは `::warning::` を1行出す
     （`cloudfront:GetInvalidation` の権限不足に気づけるように）
  4. 送信：`node scripts/indexnow-submit.mjs --key-file home/<key>.txt --before … --after … `。
     `continue-on-error: true`
- 本番反映は `v*` タグなので、**初回の送信は次のリリースまで起きない**。運営者の
  Bing Webmaster Tools 登録（下記 4）はその前に済ませてもらう

### 4. 運営者作業（画面）

- **Bing Webmaster Tools に `hasokon.com` を登録し、サイトマップを送る**（未登録なら）。
  IndexNow の受付状況は Webmaster Tools の「IndexNow」画面で見える
- 登録は Search Console からのインポートで数分（Google 側の所有権をそのまま使える）

### 実装者への申し送り

- 実装 PR のコミットは `docs:` ではなく **`feat:`**（`deploy.yml`・`scripts/`・`home/`・CLAUDE.md を触るため）
- テストはネットワークを使わない（上記 2）
- 鍵は `home/<key>.txt` の1か所だけ。`deploy.yml` にも Secrets にも書かない（上記 1）

## 期待される効果

| 効果 | 測り方 |
|---|---|
| 更新したページが Bing に翌日までに反映される（現状は不明） | Bing Webmaster Tools の「IndexNow」画面の受付数と、`bing/organic` の着地ページの更新反映。**運営者が登録するまで見えないので、登録日と初回の受付数を下の「経過」に残す** |
| 新しく `public` にしたページが Bing に載るまでの時間が短くなる | GA4 で `bing/organic` の初着地日 − リリース日 |
| Google の復旧を待つ間、Bing 側の流入を落とさない | GA4 `bing/organic` の週次セッション（現在 50〜70） |
| 変わっていない URL を送らないので、通知の信号の質を保てる | 送信件数（Actions のログ）がリリースごとの `updatedAt` 更新数と一致する |

## 工数の見積り

| 作業 | 消費トークン（目安） |
|---|---|
| `parseEntries()`（`lastmod` つき）とテスト | 10k |
| 送信スクリプト（差分抽出・鍵ファイル検査・`::warning::`）とテスト | 25k |
| `deploy.yml` の3ステップ（前の sitemap 保存・無効化の完了待ち・送信）と `--dry-run` 確認 | 10k |
| 鍵ファイル・CLAUDE.md の1行 | 5k |
| **合計** | **約50k** |

運営者作業：Bing Webmaster Tools の登録 5分。

## やらないこと

- **Google への通知。** Google は IndexNow に参加していない。Indexing API は用途限定
  （[google-index-recovery.md](./google-index-recovery.md)（#204 で起票中）の「やらないこと」）
- **毎リリース全件送る。** IndexNow は変更通知で、変わっていない URL の繰り返し送信は
  推奨されていない。8月は 08-08〜08-23 の2週間で17リリースあり、全件だと 123 URL × 週数回になる。
  `lastmod` の比較で差分だけ送る（前の sitemap が無いときだけ全件）
- **ビルド側での差分検出。** sitemap の `lastmod` 比較で足りる（既存の `updatedAt` 運用に乗る）
- **テスト環境からの送信。** Basic 認証の裏なので意味がない
- **鍵の Secrets 管理。** 公開前提のプロトコルで、Secrets にすると鍵ファイルの配信と二重管理になる。
  鍵は `home/<key>.txt` の1か所だけ

## 経過

- 2026-09-16：起票。同日の企画レビュー（#206）で、差分送信・鍵の一元化・無効化の完了待ちを反映
- 2026-09-16：実装。鍵ファイル `home/bd59c05dafed335478f48aefb1c0ec57.txt`、
  送信スクリプト `scripts/indexnow-submit.mjs`、`deploy.yml` の3ステップ（本番のみ）。
  本番のサイトマップ（123 URL）に対する `--dry-run` で、差分なし 0 件・
  `lastmod` を1件動かすと1件・`--before` 無しで全件、を確認した
- （Bing Webmaster Tools の登録日・初回リリースでの送信件数と受付数をここに残す）
