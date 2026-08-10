import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 開発中にLAN内のスマホから動作確認するための許可リスト。
  // これがないと dev サーバーが localhost 以外からのJS読み込みをブロックし、
  // ページは表示されるのにゲームが一切動かない状態になる。本番ビルドには影響しない
  allowedDevOrigins: ['hasokon.local', 'kentaronomacbook-air.local', '192.168.3.15'],
  // hasokon.com/games/ 配下で配信する（ドメイン統合。旧 game.hasokon.com は301）
  basePath: '/games',
  // S3 + CloudFront で配信するため完全静的エクスポート
  output: 'export',
  // /tool-name/ 形式のURLで index.html を出力（S3配信と相性が良い）
  trailingSlash: true,
  // 静的エクスポートでは next/image の最適化サーバーが使えないため無効化
  images: { unoptimized: true },
};

export default nextConfig;
