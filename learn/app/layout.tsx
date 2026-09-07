import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { ADSENSE_CLIENT, isAdsEnabled } from '@/lib/adsense';
import { GA_MEASUREMENT_ID, isAnalyticsEnabled } from '@/lib/analytics';
import Analytics from './Analytics';
import { COPYRIGHT_HOLDER, OGP_IMAGE, SITE_NAME, SITE_URL } from '@/lib/curriculum';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME}｜hasokon.com`,
    template: '%s',
  },
  description:
    'hasokon.com の学習ページ。仕組みそのものを理解するための読み物を分野ごとに置いています。記述の根拠は一次資料へのリンクつきで明示しています。',
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'ja_JP',
    // 【注意】ページ側で openGraph を書くと、この images ごと差し替わる
    images: [OGP_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    images: [OGP_IMAGE.url],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        {/* AdSense本体。構成は tools / games と揃えてある（生タグでheadに置く） */}
        {isAdsEnabled() && (
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
            crossOrigin="anonymous"
          />
        )}
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
              📘 <span>{SITE_NAME}</span>
            </Link>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="inner">
            <p>
              一般的・客観的な情報提供を目的とした教育コンテンツです。
              特定の銘柄・商品の推奨や売買時期の助言は行いません。
            </p>
            <p>
              <Link href="/">目次</Link>
              {/* プライバシーポリシー・お問い合わせは同じドメインの tools 側にある
                  （basePath の外なので <a> で絶対パスへ飛ばす） */}
              <a href="/tools/privacy/">プライバシーポリシー</a>
              <a href="/tools/contact/">お問い合わせ</a>
              <a href="/">hasokon.com</a>
            </p>
            <p>© 2026 {COPYRIGHT_HOLDER} All rights reserved.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
