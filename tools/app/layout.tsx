import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { SITE_NAME, SITE_URL } from '@/lib/registry';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME}｜無料の計算・変換ツール集`,
    template: `%s｜${SITE_NAME}`,
  },
  description:
    '子ども・子育て支援金計算機など、暮らしと仕事に役立つ無料のWebツール集。すべてブラウザ内で完結し、入力データは送信されません。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
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
