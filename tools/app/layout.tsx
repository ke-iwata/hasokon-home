import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { ADSENSE_CLIENT, isAdsEnabled } from '@/lib/adsense';
import { SITE_NAME, SITE_URL } from '@/lib/registry';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME}｜無料の計算・変換ツール集`,
    template: `%s｜${SITE_NAME}`,
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
          next/script（afterInteractive）だと静的HTMLにはpreloadしか出ず、
          実際のscriptタグはハイドレーション後に差し込まれるため、
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
      </head>
      <body>
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
              計算はすべてお使いのブラウザ内で行われ、入力内容がサーバーに送信されることはありません。
              計算結果は目安です。
            </p>
            <p>
              <Link href="/">ツール一覧</Link>
              <Link href="/privacy/">プライバシーポリシー</Link>
              <Link href="/contact/">お問い合わせ</Link>
            </p>
            <p>
              © 2026 {SITE_NAME} All rights reserved.
              <br />
              本サイトのコンテンツ（文章・プログラム等）の無断転載を禁じます。
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
