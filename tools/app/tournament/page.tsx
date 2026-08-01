import type { Metadata } from 'next';
import Link from 'next/link';
import AdUnit from '@/app/AdUnit';
import ToolClient from '@/app/_roulette/ToolClient';
import { SITE_URL } from '@/lib/registry';

const title = 'トーナメント表作成ツール | 対戦表をランダムに組む';
const description =
  '参加者を入れるだけでトーナメント表を自動で作れる無料ツール。組み合わせはランダム、不戦勝も自動で配置します。登録不要で印刷にも対応。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/tournament/` },
};

const faq = [
    {
      "q": "人数が2の累乗でないときは",
      "a": "4人・8人・16人でない場合は、一部の参加者が1回戦を不戦勝(シード)で通過します。誰がシードになるかもランダムに決まります。勝った人をタップしていくと、勝ち上がりを記録できます。"
    },
    {
      "q": "総当たりにしたいときは",
      "a": "総当たり戦の順番決めには、ルーレットの「全員に一巡」が使えます。対戦の順序を偏りなく決められます。"
    }
  ];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'トーナメント表',
      url: `${SITE_URL}/tournament/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY' },
      description,
    },
    {
      '@type': 'FAQPage',
      mainEntity: faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <h1>トーナメント表</h1>
      <p className="lead">参加者を入れると、組み合わせをランダムに決めてトーナメント表を作ります。</p>

      <ToolClient tool="tournament" />

      <AdUnit position="below-tool" />

      <h2>人数が2の累乗でないときは</h2>
      <p>4人・8人・16人でない場合は、一部の参加者が1回戦を不戦勝(シード)で通過します。誰がシードになるかもランダムに決まります。</p>
      <p>勝った人をタップしていくと、勝ち上がりを記録できます。</p>
      <h2>総当たりにしたいときは</h2>
      <p>総当たり戦の順番決めには、ルーレットの「全員に一巡」が使えます。対戦の順序を偏りなく決められます。</p>

      <AdUnit position="below-faq" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        関連ツール：<Link href="/roulette/">ルーレット</Link>
        ／
        <Link href="/group/">グループ分け</Link>／
        <Link href="/amida/">あみだくじ</Link>／
        <Link href="/dice/">サイコロ</Link>
      </p>
    </>
  );
}
