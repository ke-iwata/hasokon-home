import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { ADSENSE_CLIENT, isAdsEnabled } from '@/lib/adsense';
import { GA_MEASUREMENT_ID, isAnalyticsEnabled } from '@/lib/analytics';
import Analytics from './Analytics';
import { COPYRIGHT_HOLDER, SITE_NAME, SITE_URL } from '@/lib/registry';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME}｜ナンプレ・リバーシ・ブロック崩しをブラウザで`,
    // 検索結果に出るのは全角30字前後。認知がつくまでサイト名の接尾辞は付けない
    // （hasokon-tools と同じ判断）
    template: '%s',
  },
  description:
    'インストール不要・登録不要でそのまま遊べる無料ミニゲーム集。ナンプレ・リバーシ・ブロック崩しをブラウザだけで。',
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'ja_JP',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        {/*
          AdSense本体。next/script ではなく生のscriptタグをheadに置く
          （afterInteractive だと静的HTMLにpreloadしか出ず、審査で検出されない可能性がある。
          hasokon-tools と同じ判断）。lib/adsense.ts が未設定の間は出力しない。
        */}
        {isAdsEnabled() && (
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
            crossOrigin="anonymous"
          />
        )}
        {/* GA4本体。初期化は app/Analytics.tsx（インラインscriptを置くとAdSenseとの
            ハイドレーション競合が起きるため。hasokon-tools と同じ判断） */}
        {isAnalyticsEnabled() && (
          <script
            async
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          />
        )}
      </head>
      <body>
        <Analytics />
        <header className="site-header">
          <div className="inner">
            <Link className="brand" href="/">
              🎮 <span>{SITE_NAME}</span>
            </Link>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="inner">
            <p>
              すべてブラウザ内で動作します。スコアなどのデータがサーバーに送信されることはありません。
            </p>
            <p>
              <Link href="/">ゲーム一覧</Link>
              <Link href="/privacy/">プライバシーポリシー</Link>
              <Link href="/contact/">お問い合わせ</Link>
              <a href="https://tool.hasokon.com/" rel="noopener">
                計算ツール集
              </a>
            </p>
            <p>© 2026 {COPYRIGHT_HOLDER} All rights reserved.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
