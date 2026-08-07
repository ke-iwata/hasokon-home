import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // S3 + CloudFront で配信するため完全静的エクスポート
  // hasokon.com/tools/ 配下で配信する（ドメイン統合。旧 tool.hasokon.com は301）
  basePath: '/tools',
  output: 'export',
  // /tool-name/ 形式のURLで index.html を出力（S3配信と相性が良い）
  trailingSlash: true,
  // 静的エクスポートでは next/image の最適化サーバーが使えないため無効化
  images: { unoptimized: true },
};

export default nextConfig;
