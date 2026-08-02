import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { ADSENSE_CLIENT, isAdsEnabled } from '@/lib/adsense';
import { GA_MEASUREMENT_ID, isAnalyticsEnabled } from '@/lib/analytics';
import Analytics from './Analytics';
import { COPYRIGHT_HOLDER, SITE_NAME, SITE_URL } from '@/lib/registry';

/**
 * Google Search Console の所有権確認用トークン。
 * <meta name="google-site-verification"> として出力される。
 * 【削除しないこと】確認後に消すと所有権の確認が外れる。
 */
const GOOGLE_SITE_VERIFICATION = 'Q3DpEEDOkoxOZDuQwfCl_kDDbsdaqLxHDJrCcJOZvnU';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  verification: { google: GOOGLE_SITE_VERIFICATION },
  title: {
    default: `${SITE_NAME}｜年収の壁・支援金・電気代などをすぐ計算`,
    // 接尾辞にサイト名を足さない。日本語の検索結果で表示されるのは全角30字前後で、
    // 「｜無料計算ツール集」の9字はブランド認知がつくまでは keyword に回したほうがよい。
    // 認知が出てきたら `%s｜${SITE_NAME}` に戻す。
    template: '%s',
  },
  description:
    '子ども・子育て支援金計算機など、暮らしと仕事に役立つ無料のWebツール集。すべてブラウザ内で完結し、入力データは送信されません。',
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'ja_JP',
  },
  // title / description は各ページのものが openGraph に自動で引き継がれる。
  // url はここで指定すると全ページがトップのURLになってしまうため置かない
  // （正規URLは各ページの alternates.canonical が持つ）
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        {/*
          AdSense本体。next/script ではなく生のscriptタグをheadに置いている。
          next/script（afterInteractive）だと静的HTMLにはpreloadしか出ず、実際のscriptタグはハイドレーション後に差し込まれるため、
          AdSenseのサイト審査でコードを検出されない可能性がある。
          lib/adsense.ts が未設定の間は出力しない。
        */}
        {isAdsEnabled() && (
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
            crossOrigin="anonymous"
          />
        )}

        {/*
          Google Analytics 4 本体。lib/analytics.ts が未設定の間は出力しない。

          初期化（dataLayer / config）はここに書かず app/Analytics.tsx で行う。
          AdSenseが実行時に <head> へ <script> を差し込むため、インラインscriptを
          Reactの子として置くとハイドレーションで食い違い、描画がやり直しになる。
          <script async src> は React 19 が hoistable として個別に扱うので影響を受けない。
        */}
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
              {SITE_NAME}
            </Link>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="inner">
            <p>
              計算はすべてお使いのブラウザ内で行われ、入力内容がサーバーに送信されることはありません。計算結果は目安です。
            </p>
            <p>
              <Link href="/">ツール一覧</Link>
              <Link href="/privacy/">プライバシーポリシー</Link>
              <Link href="/contact/">お問い合わせ</Link>
            </p>
            <p>
              © 2026 {COPYRIGHT_HOLDER} All rights reserved.
              <br />
              本サイトのコンテンツ（文章・プログラム等）の無断転載を禁じます。
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
