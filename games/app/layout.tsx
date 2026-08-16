import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { ADSENSE_CLIENT, isAdsEnabled } from '@/lib/adsense';
import { GA_MEASUREMENT_ID, isAnalyticsEnabled } from '@/lib/analytics';
import Analytics from './Analytics';
import { COPYRIGHT_HOLDER, OGP_IMAGE, SITE_NAME, SITE_URL } from '@/lib/registry';
import { MANIFEST_SCOPE } from './manifest';

/**
 * Google Search Console の所有権確認用トークン。
 * tool.hasokon.com と同じアカウントなのでトークンも同じ。
 * 【削除しないこと】確認後に消すと所有権の確認が外れる。
 */
const GOOGLE_SITE_VERIFICATION = 'Q3DpEEDOkoxOZDuQwfCl_kDDbsdaqLxHDJrCcJOZvnU';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  verification: { google: GOOGLE_SITE_VERIFICATION },
  title: {
    default: `${SITE_NAME}｜ナンプレ・ブロック崩しをブラウザで`,
    // 検索結果に出るのは全角30字前後。認知がつくまでサイト名の接尾辞は付けない
    // （hasokon-tools と同じ判断）
    template: '%s',
  },
  description:
    'インストール不要・登録不要でそのまま遊べる無料ミニゲーム集。ナンプレ・ブロック崩しなどをブラウザだけで。',
  // 「ホーム画面に追加」でスタンドアロン起動させるためのマニフェスト
  // （docs/features/games-pwa-manifest.md。実体は app/manifest.ts）。
  // 【注意】ルート相対のまま書くこと（Next.js は manifest を metadataBase で
  // 絶対URLに直さず、そのまま出す）。絶対URLにすると test.hasokon.com から
  // 本番のマニフェストを読みに行くことになる
  manifest: `${MANIFEST_SCOPE}manifest.webmanifest`,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'ja_JP',
    // SNSに貼られたときのサムネイル（docs/features/ogp-image.md）。
    // 【注意】ページ側で openGraph を書くと、この images ごと差し替わる
    // （Next.js のメタデータは入れ子のオブジェクトを浅く上書きするため）
    images: [OGP_IMAGE],
  },
  // og:image があっても twitter:card が無いと X ではカードが生成されない。
  // twitter は openGraph から画像を引き継がないので明示する
  twitter: {
    card: 'summary_large_image',
    images: [OGP_IMAGE.url],
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
              <Link href="/about/">運営者情報</Link>
              <Link href="/privacy/">プライバシーポリシー</Link>
              <Link href="/contact/">お問い合わせ</Link>
              <a href="/">
                hasokon.com
              </a>
            </p>
            <p>© 2026 {COPYRIGHT_HOLDER} All rights reserved.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
