#!/usr/bin/env bash
#
# hasokon games - AWS配信基盤の構築
#
#   ./infra/setup.sh
#
# 証明書スタック（us-east-1）→ サイトスタック（ap-northeast-1）の順に作り、
# 最後に GitHub Secrets を設定する。何度実行しても同じ結果になる（差分だけ更新される）。
#
# SSO（aws configure sso）を使っていて default プロファイルが無い場合は、
# 必ずプロファイルを指定すること:
#
#   PROFILE=developer ./infra/setup.sh
#
# 前提: AWS CLI v2 で認証済み、gh CLI でログイン済み。

set -euo pipefail

# 使用するAWSプロファイル。未指定なら AWS_PROFILE、それも無ければ default が使われる
PROFILE="${PROFILE:-${AWS_PROFILE:-}}"

DOMAIN="${DOMAIN:-game.hasokon.com}"
TEST_DOMAIN="${TEST_DOMAIN:-game.test.hasokon.com}"
PARENT_DOMAIN="${PARENT_DOMAIN:-hasokon.com}"
BUCKET="${BUCKET:-game-hasokon-com}"
TEST_BUCKET="${TEST_BUCKET:-${BUCKET}-test}"
REPO="${REPO:-ke-iwata/hasokon-games}"
REGION="${REGION:-ap-northeast-1}"
# テスト環境のBasic認証（user:pass）。閲覧ゲートであり機密用途ではない。
# 変えるときは BASIC_AUTH="user:pass" ./infra/setup.sh で再実行すれば反映される
BASIC_AUTH="${BASIC_AUTH:-hasokon:preview2026}"

CERT_STACK="hasokon-games-certificate"
SITE_STACK="hasokon-games-site"
TEST_CERT_STACK="${CERT_STACK}-test"
TEST_SITE_STACK="${SITE_STACK}-test"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

info() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m警告: %s\033[0m\n' "$1"; }
die()  { printf '\033[1;31mエラー: %s\033[0m\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------- 事前チェック

info "前提条件を確認しています"

command -v aws >/dev/null || die "AWS CLI がありません。 brew install awscli で入れてください"
command -v gh  >/dev/null || die "gh CLI がありません。 brew install gh で入れてください"

# 以降の aws コマンドすべてに効かせる
if [ -n "${PROFILE}" ]; then
  export AWS_PROFILE="${PROFILE}"
fi

if ! account="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)"; then
  profiles="$(aws configure list-profiles 2>/dev/null | tr '\n' ' ')"
  die "AWSの認証に失敗しました（プロファイル: ${PROFILE:-default}）。

  SSOのセッションが切れている場合:
    aws sso login --profile ${PROFILE:-<プロファイル名>}

  プロファイルを指定していない場合（default が無い環境ではこれが原因）:
    PROFILE=<プロファイル名> ./infra/setup.sh

  利用可能なプロファイル: ${profiles:-（なし）}"
fi

echo "AWSアカウント : ${account}"
echo "プロファイル  : ${PROFILE:-default}"
echo "デプロイ先    : ${DOMAIN} (${REGION})"

gh auth status >/dev/null 2>&1 || die "gh にログインしていません。 gh auth login を実行してください"

# 親ドメインのホストゾーンIDを引く
zone_id="$(aws route53 list-hosted-zones-by-name \
  --dns-name "${PARENT_DOMAIN}." \
  --query "HostedZones[?Name=='${PARENT_DOMAIN}.'].Id | [0]" \
  --output text | sed 's|/hostedzone/||')"
[ -n "${zone_id}" ] && [ "${zone_id}" != "None" ] \
  || die "${PARENT_DOMAIN} のRoute 53ホストゾーンが見つかりません"
echo "ホストゾーンID: ${zone_id}"

# GitHubのOIDCエンドポイントのルート証明書からサムプリントを取得する。
# 古い値のままだとトークン検証に失敗するため、毎回実際の証明書から取り直す
# openssl s_client は正常時も非ゼロで終わることがあり、pipefail と組み合わせると
# スクリプトごと止まってしまうため、各段で明示的に失敗を吸収する
oidc_host=token.actions.githubusercontent.com
cert_chain="$(openssl s_client -servername "${oidc_host}" -showcerts \
  -connect "${oidc_host}:443" </dev/null 2>/dev/null || true)"
# チェーンの最後の証明書＝ルートCA
root_cert="$(printf '%s' "${cert_chain}" | awk '
  /-----BEGIN CERTIFICATE-----/ { buf = "" }
  { buf = buf $0 ORS }
  /-----END CERTIFICATE-----/   { last = buf }
  END { printf "%s", last }' || true)"
thumbprint="$(printf '%s' "${root_cert}" \
  | openssl x509 -outform DER 2>/dev/null \
  | openssl dgst -sha1 2>/dev/null \
  | sed 's/.*[= ]//' | tr 'A-Z' 'a-z' || true)"
[ ${#thumbprint} -eq 40 ] \
  || die "GitHubのOIDC証明書からサムプリントを取得できませんでした（取得値: ${thumbprint:-空}）"
echo "OIDCサムプリント: ${thumbprint}"

# OIDCプロバイダを このスタックで作るかどうかを決める。
#
# 「存在するなら作らない」だけで判定してはいけない。前回このスタックが作った
# プロバイダを検出して条件がfalseになり、次の更新でCloudFormationが
# 自分の管理下のリソースとして削除してしまう（実際にそれで認証が壊れた）。
# まずスタックの管理下にあるかを見て、管理下なら維持する。
if aws cloudformation describe-stack-resource \
     --stack-name "${SITE_STACK}" --region "${REGION}" \
     --logical-resource-id GitHubOIDCProvider >/dev/null 2>&1; then
  create_oidc=true
  echo "GitHub OIDCプロバイダ: このスタックの管理下（維持）"
elif aws iam list-open-id-connect-providers \
       --query "OpenIDConnectProviderList[?contains(Arn, 'token.actions.githubusercontent.com')] | [0]" \
       --output text | grep -q arn; then
  create_oidc=false
  echo "GitHub OIDCプロバイダ: スタック管理外の既存のものを使う"
else
  create_oidc=true
  echo "GitHub OIDCプロバイダ: 新規作成する"
fi

# ---------------------------------------------------------------- 1. 証明書（us-east-1）

info "1/5 ACM証明書を作成しています（us-east-1・本番）"
echo "DNS検証のレコードは自動で作られます。数分かかることがあります。"

deploy_cert() { # stack domain
  aws cloudformation deploy \
    --region us-east-1 \
    --stack-name "$1" \
    --template-file "${here}/certificate.yaml" \
    --no-fail-on-empty-changeset \
    --parameter-overrides \
      "DomainName=$2" \
      "HostedZoneId=${zone_id}"
  aws cloudformation describe-stacks \
    --region us-east-1 \
    --stack-name "$1" \
    --query "Stacks[0].Outputs[?OutputKey=='CertificateArn'].OutputValue | [0]" \
    --output text
}

cert_arn="$(deploy_cert "${CERT_STACK}" "${DOMAIN}" | tail -1)"
echo "証明書（本番）: ${cert_arn}"

info "2/5 ACM証明書を作成しています（us-east-1・テスト）"
test_cert_arn="$(deploy_cert "${TEST_CERT_STACK}" "${TEST_DOMAIN}" | tail -1)"
echo "証明書（テスト）: ${test_cert_arn}"

# ---------------------------------------------------------------- 2. サイト本体

info "3/5 本番のS3・CloudFront・DNS・IAMロールを作成しています（${REGION}）"
echo "CloudFrontの配信開始まで10〜20分かかることがあります。"

aws cloudformation deploy \
  --region "${REGION}" \
  --stack-name "${SITE_STACK}" \
  --template-file "${here}/site.yaml" \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
    "DomainName=${DOMAIN}" \
    "BucketName=${BUCKET}" \
    "HostedZoneId=${zone_id}" \
    "CertificateArn=${cert_arn}" \
    "GitHubRepository=${REPO}" \
    "OIDCThumbprint=${thumbprint}" \
    "CreateGitHubOIDCProvider=${create_oidc}" \
    "CreateDeployRole=true" \
    "ExtraDeployBucketName=${TEST_BUCKET}" \
    "BasicAuthString=" \
    "RedirectTo=${REDIRECT_TO:-}"

# ---------------------------------------------------------------- 4. テスト環境

info "4/5 テスト環境（${TEST_DOMAIN}・Basic認証つき）を作成しています"

# Authorization ヘッダの期待値（Basic base64(user:pass)）
auth_string="Basic $(printf '%s' "${BASIC_AUTH}" | base64)"

# テストスタックはロールもOIDCプロバイダも作らない（本番スタックのものを共用）
aws cloudformation deploy \
  --region "${REGION}" \
  --stack-name "${TEST_SITE_STACK}" \
  --template-file "${here}/site.yaml" \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
    "DomainName=${TEST_DOMAIN}" \
    "BucketName=${TEST_BUCKET}" \
    "HostedZoneId=${zone_id}" \
    "CertificateArn=${test_cert_arn}" \
    "GitHubRepository=${REPO}" \
    "OIDCThumbprint=${thumbprint}" \
    "CreateGitHubOIDCProvider=false" \
    "CreateDeployRole=false" \
    "ExtraDeployBucketName=" \
    "BasicAuthString=${auth_string}" \
    "RedirectTo=${TEST_REDIRECT_TO:-}"

get_output() { # stack key
  aws cloudformation describe-stacks \
    --region "${REGION}" \
    --stack-name "$1" \
    --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue | [0]" \
    --output text
}

role_arn="$(get_output "${SITE_STACK}" DeployRoleArn)"
dist_domain="$(get_output "${SITE_STACK}" DistributionDomainName)"

# ドメイン統合後のデプロイ先は hasokon.com 本体（hasokon-home-site スタック）。
# バケットは prefix 配下に同期し、無効化も本体の配信に対して行う
bucket="hasokon-com"
test_bucket="hasokon-com-test"
dist_id="$(get_output hasokon-home-site DistributionId)"
test_dist_id="$(get_output hasokon-home-site-test DistributionId)"
[ -n "${dist_id}" ] && [ "${dist_id}" != "None" ] \
  || die "hasokon-home-site スタックが見つかりません。先に hasokon-home の setup.sh を実行してください"

# ---------------------------------------------------------------- 5. GitHub Secrets

info "5/5 GitHub Secrets を設定しています（${REPO}）"

gh secret set AWS_DEPLOY_ROLE_ARN              --repo "${REPO}" --body "${role_arn}"
gh secret set S3_BUCKET                        --repo "${REPO}" --body "${bucket}"
gh secret set CLOUDFRONT_DISTRIBUTION_ID       --repo "${REPO}" --body "${dist_id}"
gh secret set TEST_S3_BUCKET                   --repo "${REPO}" --body "${test_bucket}"
gh secret set TEST_CLOUDFRONT_DISTRIBUTION_ID  --repo "${REPO}" --body "${test_dist_id}"

echo "設定しました:"
gh secret list --repo "${REPO}"

# ---------------------------------------------------------------- 完了

info "構築が完了しました"
cat <<EOF
  本番バケット      : ${bucket}
  本番配信          : ${dist_id}（https://${DOMAIN}/）
  テストバケット    : ${test_bucket}
  テスト配信        : ${test_dist_id}（https://${TEST_DOMAIN}/）
  テストBasic認証   : ${BASIC_AUTH}
  デプロイロール    : ${role_arn}

デプロイの流れ:
  - main にマージ         → テスト環境（https://${TEST_DOMAIN}/）
  - v* タグをpush          → 本番（https://${DOMAIN}/）
      git tag v1.0.0 && git push origin v1.0.0

テスト環境の確認:
  curl -I -u '${BASIC_AUTH}' https://${TEST_DOMAIN}/
EOF
