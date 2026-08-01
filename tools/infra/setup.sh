#!/usr/bin/env bash
#
# hasokon tools - AWS配信基盤の構築
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

DOMAIN="${DOMAIN:-tool.hasokon.com}"
PARENT_DOMAIN="${PARENT_DOMAIN:-hasokon.com}"
BUCKET="${BUCKET:-tool-hasokon-com}"
REPO="${REPO:-ke-iwata/hasokon-tools}"
REGION="${REGION:-ap-northeast-1}"

CERT_STACK="hasokon-tools-certificate"
SITE_STACK="hasokon-tools-site"

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

# OIDCプロバイダが既にあるなら作らせない（重複作成はエラーになる）
if aws iam list-open-id-connect-providers \
     --query "OpenIDConnectProviderList[?contains(Arn, 'token.actions.githubusercontent.com')] | [0]" \
     --output text | grep -q arn; then
  create_oidc=false
  echo "GitHub OIDCプロバイダ: 既存のものを使う"
else
  create_oidc=true
  echo "GitHub OIDCプロバイダ: 新規作成する"
fi

# ---------------------------------------------------------------- 1. 証明書（us-east-1）

info "1/3 ACM証明書を作成しています（us-east-1）"
echo "DNS検証のレコードは自動で作られます。数分かかることがあります。"

aws cloudformation deploy \
  --region us-east-1 \
  --stack-name "${CERT_STACK}" \
  --template-file "${here}/certificate.yaml" \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
    "DomainName=${DOMAIN}" \
    "HostedZoneId=${zone_id}"

cert_arn="$(aws cloudformation describe-stacks \
  --region us-east-1 \
  --stack-name "${CERT_STACK}" \
  --query "Stacks[0].Outputs[?OutputKey=='CertificateArn'].OutputValue | [0]" \
  --output text)"
echo "証明書: ${cert_arn}"

# ---------------------------------------------------------------- 2. サイト本体

info "2/3 S3・CloudFront・DNS・IAMロールを作成しています（${REGION}）"
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
    "CreateGitHubOIDCProvider=${create_oidc}"

get_output() {
  aws cloudformation describe-stacks \
    --region "${REGION}" \
    --stack-name "${SITE_STACK}" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue | [0]" \
    --output text
}

bucket="$(get_output BucketName)"
dist_id="$(get_output DistributionId)"
role_arn="$(get_output DeployRoleArn)"
dist_domain="$(get_output DistributionDomainName)"

# ---------------------------------------------------------------- 3. GitHub Secrets

info "3/3 GitHub Secrets を設定しています（${REPO}）"

gh secret set AWS_DEPLOY_ROLE_ARN         --repo "${REPO}" --body "${role_arn}"
gh secret set S3_BUCKET                   --repo "${REPO}" --body "${bucket}"
gh secret set CLOUDFRONT_DISTRIBUTION_ID  --repo "${REPO}" --body "${dist_id}"

echo "設定しました:"
gh secret list --repo "${REPO}"

# ---------------------------------------------------------------- 完了

info "構築が完了しました"
cat <<EOF
  バケット          : ${bucket}
  ディストリビューション: ${dist_id}
  デプロイロール    : ${role_arn}
  CloudFrontドメイン: ${dist_domain}
  公開URL           : https://${DOMAIN}/

次にやること:
  1. main にpushするとGitHub Actionsがデプロイします
       git push origin main
  2. 反映を確認
       curl -I https://${DOMAIN}/
EOF
