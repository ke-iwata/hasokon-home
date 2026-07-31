# デプロイ手順（AWS S3 + CloudFront）

`main` にpushすると GitHub Actions がテスト → ビルド → S3同期 → CloudFrontキャッシュ削除まで自動で行います。
そのために **最初に一度だけ** 以下のAWS側の準備が必要です。

---

## 1. S3バケットを作成

```bash
aws s3api create-bucket \
  --bucket tool-hasokon-com \
  --region ap-northeast-1 \
  --create-bucket-configuration LocationConstraint=ap-northeast-1
```

- **パブリックアクセスはブロックしたまま**にします（CloudFront経由のみ許可するため）
- 静的ウェブサイトホスティングは**有効にしません**（OAC + CloudFront Functions を使うため）

## 2. ACM証明書を取得（**バージニア北部 us-east-1**）

CloudFrontで使う証明書は us-east-1 でないと使えません。

```bash
aws acm request-certificate \
  --domain-name tool.hasokon.com \
  --validation-method DNS \
  --region us-east-1
```

表示されたCNAMEレコードを hasokon.com のDNSに追加して検証を完了させます。

## 3. CloudFrontディストリビューションを作成

マネジメントコンソールでの設定内容:

| 項目 | 値 |
|---|---|
| オリジン | 手順1のS3バケット |
| オリジンアクセス | **Origin access control (OAC)** を新規作成 |
| ビューワープロトコル | Redirect HTTP to HTTPS |
| 代替ドメイン名 (CNAME) | `tool.hasokon.com` |
| カスタムSSL証明書 | 手順2の証明書 |
| デフォルトルートオブジェクト | `index.html` |
| キャッシュポリシー | CachingOptimized |

作成後に表示される**バケットポリシーをS3に貼り付け**ます（コンソールがコピー用に出してくれます）。

### 3-1. サブディレクトリ対応の CloudFront Function（重要）

`trailingSlash: true` で出力しているため、`/warikan/` のようなURLを
`/warikan/index.html` に内部で書き換える必要があります。
CloudFront Functions で以下を作成し、**ビューワーリクエスト**に関連付けます。

```javascript
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  } else if (!uri.includes('.')) {
    request.uri = uri + '/index.html';
  }
  return request;
}
```

## 4. DNSレコードを追加

hasokon.com のDNSに、CloudFrontのドメイン名を指すレコードを追加します。

- Route 53 の場合: `tool.hasokon.com` の **A レコード（エイリアス）** → CloudFrontディストリビューション
- 他社DNSの場合: `tool` の **CNAME** → `dxxxxxxxxxxxxx.cloudfront.net`

## 5. GitHub Actions 用のIAMロール（OIDC）

長期のアクセスキーを持たせず、GitHubから一時認証で接続します。

### 5-1. OIDCプロバイダを登録（アカウントに未登録の場合のみ）

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

### 5-2. ロールを作成

信頼ポリシー（`trust-policy.json`）— `<ACCOUNT_ID>` と GitHubユーザー名を置き換えてください:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
      },
      "StringLike": {
        "token.actions.githubusercontent.com:sub": "repo:<GITHUB_USER>/hasokon-tools:*"
      }
    }
  }]
}
```

```bash
aws iam create-role \
  --role-name hasokon-tools-deploy \
  --assume-role-policy-document file://trust-policy.json
```

権限ポリシー（`deploy-policy.json`）:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::tool-hasokon-com"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::tool-hasokon-com/*"
    },
    {
      "Effect": "Allow",
      "Action": ["cloudfront:CreateInvalidation"],
      "Resource": "arn:aws:cloudfront::<ACCOUNT_ID>:distribution/<DISTRIBUTION_ID>"
    }
  ]
}
```

```bash
aws iam put-role-policy \
  --role-name hasokon-tools-deploy \
  --policy-name deploy \
  --policy-document file://deploy-policy.json
```

## 6. GitHub Secrets を登録

リポジトリの Settings → Secrets and variables → Actions で3つ登録します。

| Secret名 | 値 |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::<ACCOUNT_ID>:role/hasokon-tools-deploy` |
| `S3_BUCKET` | `tool-hasokon-com` |
| `CLOUDFRONT_DISTRIBUTION_ID` | `E1XXXXXXXXXXXX` |

## 7. デプロイ

```bash
git push origin main
```

Actions タブで進行状況を確認できます。手動実行は Actions → Deploy → Run workflow から。

---

## 公開後にやること

### Google Search Console

1. https://search.google.com/search-console でドメインプロパティを追加
2. DNS のTXTレコードで所有権を確認
3. サイトマップを送信: `https://tool.hasokon.com/sitemap.xml`
4. 主要ページを「URL検査」からインデックス登録リクエスト

### AdSense（公開2〜4週間後）

1. https://adsense.google.com でサイトを追加
2. 審査コードを `app/layout.tsx` の `<head>` に追加してデプロイ
3. 合格後、`public/ads.txt` を作成（AdSense管理画面の1行を貼る）
4. 各ページの `className="adslot"` の位置に広告ユニットを配置
   - **計算機より上には置かない**（UX悪化 → 直帰率上昇 → 順位下落を招くため）

### お問い合わせフォーム

`app/contact/page.tsx` の `CONTACT_FORM_URL` をGoogleフォームの実URLに差し替えてください。

---

## 運用

| 頻度 | 作業 |
|---|---|
| 毎年3〜4月 | `lib/kosodate-shienkin.ts` の `FISCAL_YEARS` の料率を確定値に更新 |
| 税制改正時 | `lib/nenshu-kabe.ts` の `WALL_DEFS` の金額を更新 |
| 電気代改定時 | `lib/aircon-denkidai.ts` の単価目安を更新 |
| 月1回 | Search Console でクエリを確認、伸びているものがあれば該当ページを強化 |

新しいツールを足すときは `README.md` の「ツールの追加手順」を参照してください。
`lib/registry.ts` に登録すればトップ一覧とsitemapに自動反映されます。
