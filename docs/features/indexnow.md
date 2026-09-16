# IndexNow を本番デプロイに組み込む（Bing 経由の流入を守り、更新を即日反映させる）

**状態**：提案（2026-09-16 起票、未実装）。
**対象**：`.github/workflows/deploy.yml`（本番デプロイのジョブ）・`home/`（鍵ファイル 1枚）・
`scripts/`（送信スクリプト＋テスト）
**起票**：2026-09-16
**関連**：[google-index-recovery.md](./google-index-recovery.md)（Google 側の復旧。**本提案は
Google には効かない**。Google は IndexNow に参加していない）

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

## 提案する仕様

### 1. 鍵ファイル（`home/<key>.txt`）

- 32文字の英数字（`openssl rand -hex 16`）を鍵にし、`home/<key>.txt` に鍵そのものを書く。
  `home/` はバケット直下に同期されるので `https://hasokon.com/<key>.txt` で配信される
  （**サイトの成果物なので `home/` に置いてよい**。CLAUDE.md の「成果物以外を置かない」に反しない）
- 鍵は秘密ではない（URL を知っていれば誰でも読める設計）。**ただし鍵を知る第三者が
  他人の URL を送ることはできない**（送れるのは鍵ファイルが置かれたホストの URL だけ）
- GitHub Secrets には入れない。リポジトリにそのまま置く（ローテーションはファイルを
  差し替えるだけ）

### 2. 送信スクリプト（`scripts/indexnow-submit.mjs`）

```
node scripts/indexnow-submit.mjs --sitemap https://hasokon.com/sitemap.xml --key <key> [--dry-run]
```

- `scripts/gsc-canonical-audit.mjs` と同じ `collectUrls()` でサイトマップ index を辿り、
  全 URL（現在 123件）を 1 リクエストで送る。**差分を計算しない**（IndexNow 側が重複を
  無視するので、全件送るのがいちばん単純で壊れにくい）
- レスポンス 200 / 202 を成功とし、それ以外はログに出して**終了コード 0 で終える**
  （デプロイを失敗させない。通知は「あれば嬉しい」であって必須ではない）
- 依存パッケージなし（`fetch` のみ）。`scripts/test/indexnow-submit.test.mjs` で
  リクエスト本文（`host` / `key` / `keyLocation` / `urlList`）と失敗時の扱いをテスト

### 3. デプロイへの組み込み（`.github/workflows/deploy.yml`）

- **本番（`v*` タグ）のデプロイジョブの最後**、CloudFront の無効化のあとに 1 ステップ足す。
  テスト環境（main）では送らない（`test.hasokon.com` は Basic 認証で、送っても無意味）
- `continue-on-error: true`。デプロイの成否に影響させない

### 4. 運営者作業（画面）

- **Bing Webmaster Tools に `hasokon.com` を登録し、サイトマップを送る**（未登録なら）。
  IndexNow の受付状況は Webmaster Tools の「IndexNow」画面で見える
- 登録は Search Console からのインポートで数分（Google 側の所有権をそのまま使える）

## 期待される効果

| 効果 | 測り方 |
|---|---|
| 更新したページが Bing に翌日までに反映される（現状は不明） | Bing Webmaster Tools の「IndexNow」画面の受付数と、`bing/organic` の着地ページの更新反映 |
| 新しく `public` にしたページが Bing に載るまでの時間が短くなる | GA4 で `bing/organic` の初着地日 − リリース日 |
| Google の復旧を待つ間、Bing 側の流入を落とさない | GA4 `bing/organic` の週次セッション（現在 50〜70） |

## 工数の見積り

| 作業 | 消費トークン（目安） |
|---|---|
| 鍵ファイル・送信スクリプト・テスト | 20k |
| `deploy.yml` の 1 ステップと動作確認（`--dry-run`） | 10k |
| **合計** | **約30k** |

運営者作業：Bing Webmaster Tools の登録 5分。

## やらないこと

- **Google への通知。** Google は IndexNow に参加していない。Indexing API は用途限定
  （[google-index-recovery.md](./google-index-recovery.md) の「やらないこと」）
- **差分（変更したURLだけ）を送る。** ビルドの差分検出が要り、壊れると送り漏れになる。
  全件送っても 123 URL で上限の 1% 未満
- **テスト環境からの送信。** Basic 認証の裏なので意味がない
- **鍵の Secrets 管理。** 公開前提のプロトコルで、Secrets にすると鍵ファイルの配信と二重管理になる
