# インフラは hasokon-infra に移行しました

AWSリソース（S3 / CloudFront / Route53 / ACM / IAM）はTerraformで
[hasokon-infra](https://github.com/ke-iwata/hasokon-infra) にて一元管理しています。

このリポジトリのCIが使うGitHub Secrets（デプロイロール・バケット・配信ID）も
hasokon-infra の `terraform output github_secrets` が正です。
