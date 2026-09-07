import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // `next dev` が CLAUDE.md に自前の案内ブロックを追記してくるのを止める。
  // tools / games の CLAUDE.md にも入っていないので揃える（入れておくと、
  // dev を回した人と回していない人で毎回そこだけ差分が出る）
  agentRules: false,
  // hasokon.com/learn/ 配下で配信する（tools=/tools, games=/games と同じ形）
  basePath: '/learn',
  // S3 + CloudFront で配信するため完全静的エクスポート
  output: 'export',
  // /chapter-name/ 形式のURLで index.html を出力（S3配信と相性が良い）
  trailingSlash: true,
  // 静的エクスポートでは next/image の最適化サーバーが使えないため無効化
  images: { unoptimized: true },
};

export default nextConfig;
