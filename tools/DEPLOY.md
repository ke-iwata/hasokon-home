# デプロイ手順（AWS S3 + CloudFront）

`main` にpushすると GitHub Actions がテスト → ビルド → S3同期 → CloudFrontキャッシュ削除まで自動で行います。
そのために **最初に一度だけ** AWS側の構築が必要です。

構築内容は `infra/` の CloudFormation テンプレートに書いてあります。
コンソールで手作業するのではなく、**スクリプト1本で構築する**方式にしています。

---

## 一度だけの構築

### 前提

- AWS CLI v2 で認証済み
- `gh` CLI でログイン済み（`gh auth status`）
- `hasokon.com` が **Route 53** で管理されていること

SSO を使う場合はセッションを更新しておきます。

```bash
aws sso login --profile developer
```

### 実行に必要な権限

`infra/setup-policy.json` が構築に必要な権限一式です。
IAMロールやOIDCプロバイダを作るため、**読み取り専用や一般的な開発者権限では足りません**。

IAM Identity Center を使っている場合は、権限セットのインラインポリシーとして貼り付けます。

```
IAM Identity Center → 権限セット → 該当の権限セット → インラインポリシー → 編集
```

IAMユーザー／ロールに直接付ける場合はこちらです。

```bash
aws iam put-role-policy \
  --role-name <ロール名> \
  --policy-name hasokon-tools-setup \
  --policy-document file://infra/setup-policy.json
```

構築が終わったあとの通常運用（`git push` によるデプロイ）にこの権限は不要です。
デプロイは GitHub Actions が `site.yaml` で作られる専用ロールで行うため、
**構築が済んだらこのポリシーは外して構いません**。

ドメインを変える場合は、ポリシー内のホストゾーンID（`Z0020019D48V35ZUBWTD`）と
バケット名（`tool-hasokon-com`）も合わせて書き換えてください。

### 実行

**`default` プロファイルが無い環境では `PROFILE` の指定が必須です。**
SSO（`aws configure sso --profile developer`）で運用している場合は次のようになります。

```bash
PROFILE=developer ./infra/setup.sh
```

`default` プロファイルがある場合や `AWS_PROFILE` を設定済みの場合は、そのまま実行できます。

```bash
./infra/setup.sh
```

これだけで以下がすべて作られ、GitHub Secrets の登録まで終わります。

| 作られるもの | 内容 |
|---|---|
| ACM証明書 | `tool.hasokon.com` 用（us-east-1）。DNS検証レコードも自動作成 |
| S3バケット | `tool-hasokon-com`。パブリックアクセスは全ブロック |
| CloudFront | OAC経由でS3を参照。HTTP→HTTPSリダイレクト、HTTP/3、IPv6有効 |
| CloudFront Function | `/warikan/` → `/warikan/index.html` のURL書き換え |
| カスタムエラーページ | 403/404 → `/404.html`（ステータス404で返す） |
| Route 53 レコード | `tool.hasokon.com` のA/AAAAエイリアス |
| IAMロール | GitHub Actions用（OIDC・長期キー不要） |
| GitHub Secrets | `AWS_DEPLOY_ROLE_ARN` / `S3_BUCKET` / `CLOUDFRONT_DISTRIBUTION_ID` |

証明書のDNS検証で数分、CloudFrontの配信開始で10〜20分ほどかかります。

ドメインやバケット名を変える場合は環境変数で上書きできます。

```bash
DOMAIN=tool.example.com BUCKET=my-bucket REPO=user/repo PROFILE=developer ./infra/setup.sh
```

### 設定を変更したいとき

`infra/site.yaml` を編集して `./infra/setup.sh` を再実行すれば差分だけ更新されます。
何度実行しても同じ結果になるので、安全に流し直せます。

---

## デプロイ

```bash
git push origin main
```

Actions タブで進行状況を確認できます。手動実行は Actions → Deploy → Run workflow から。

### デプロイの流れ

ワークフローは意図的に2段階でS3に同期しています。

1. **ハッシュ付きアセット**（`_next/static/*`）を先に、1年間のimmutableキャッシュで上げる
2. **HTMLなど**を後から、キャッシュさせない設定で上げる（`--delete` で不要なファイルを削除）

この順序でないと、新しいHTMLがまだ存在しないJSを参照する瞬間ができてしまいます。
また1段階目で `--delete` しないのは、**古いHTMLをキャッシュしている利用者が直後にJSを404にされるのを防ぐ**ためです。

使われなくなったハッシュ付きファイルはS3に残り続けますが、1ビルドあたり数百KB程度なので保管料は無視できます。
**`_next/static/` にライフサイクルの有効期限を設定してはいけません。**
S3のライフサイクルはオブジェクトの作成日からの経過日数で削除するため、
配信中のアセットかどうかを区別できません。期限を付けると、更新のない期間が続いただけで
現役のJSが消えてサイトが壊れます。整理が必要になったら手動で削除してください。

---

## 動作確認

```bash
# トップページ
curl -I https://tool.hasokon.com/

# サブディレクトリのURL書き換え（200が返ること）
curl -I https://tool.hasokon.com/warikan/

# 存在しないURLは404（200やS3のXMLエラーが返らないこと）
curl -I https://tool.hasokon.com/nonexistent/

# sitemap と ads.txt
curl -s https://tool.hasokon.com/sitemap.xml | head -5
curl -s https://tool.hasokon.com/ads.txt
```

DNSを切り替える前に確認したい場合は、`infra/setup.sh` が出力する
CloudFrontのドメイン名（`dxxxx.cloudfront.net`）に直接アクセスしてください。

---

## 公開後にやること

### Google Search Console

1. https://search.google.com/search-console でドメインプロパティを追加
2. DNS のTXTレコードで所有権を確認
3. サイトマップを送信: `https://tool.hasokon.com/sitemap.xml`
4. 主要ページを「URL検査」からインデックス登録リクエスト

### AdSense（公開2〜4週間後）

1. https://adsense.google.com でサイトを追加
2. `lib/adsense.ts` の `ADSENSE_CLIENT` に `ca-pub-` から始まるIDを設定してデプロイ
   （審査用のコードが `<head>` に入り、`/ads.txt` も自動で出力される）
3. 合格したら広告ユニットを2つ作り、`AD_SLOTS` にスロットIDを設定

設定箇所は `lib/adsense.ts` の1ファイルだけです。詳細は CLAUDE.md の「AdSense」を参照してください。

---

## 運用

| 頻度 | 作業 |
|---|---|
| 毎年3〜4月 | `lib/kosodate-shienkin.ts` の `FISCAL_YEARS` の料率を確定値に更新 |
| 税制改正時 | `lib/nenshu-kabe.ts` の `WALL_DEFS` の金額を更新 |
| 2026年10月 | 106万円の壁の賃金要件が撤廃されるため文言を見直す |
| 電気代改定時 | `lib/aircon-denkidai.ts` の単価目安を更新 |
| 月1回 | Search Console でクエリを確認、伸びているものがあれば該当ページを強化 |

新しいツールを足すときは CLAUDE.md の「ツールの追加手順」を参照してください。
`lib/registry.ts` に登録すればトップ一覧とsitemapに自動反映されます。

---

## 困ったとき

| 症状 | 原因と対処 |
|---|---|
| `The config profile (default) could not be found` | `PROFILE=developer ./infra/setup.sh` のようにプロファイルを指定する |
| `Token has expired` / SSO関連のエラー | `aws sso login --profile developer` でセッションを更新する |
| 全ページ403 | CloudFront Function が関連付いていない。`infra/setup.sh` を再実行する |
| 存在しないURLでXMLが出る | カスタムエラーレスポンスが未設定。同上 |
| Actionsが `npm ci` で失敗 | `package-lock.json` がコミットされているか確認する |
| Actionsが認証で失敗 | Secretsの3つが登録されているか（`gh secret list`）、ロールの信頼ポリシーのリポジトリ名が合っているか確認する |
| 更新が反映されない | CloudFrontのキャッシュ。ワークフローが invalidation まで実行できているか確認する |
| スタック作成が `AlreadyExists` で失敗 | OIDCプロバイダが既にある。`infra/setup.sh` は自動判定するが、手動実行時は `CreateGitHubOIDCProvider=false` を渡す |
