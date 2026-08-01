import type { Metadata } from 'next';
import Link from 'next/link';
import AdUnit from '@/app/AdUnit';
import ToolClient from '@/app/_roulette/ToolClient';
import { SITE_URL } from '@/lib/registry';

const title = 'サイコロ・乱数ツール | 好きな範囲の数字をランダムに出す';
const description =
  'サイコロを振ったり、好きな範囲の数字をランダムに出せる無料ツール。個数や範囲を自由に変えられます。登録もアプリも不要、スマホ対応。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/dice/` },
};

const faq = [
    {
      "q": "ボードゲームやくじ引きに",
      "a": "サイコロが手元にないとき、なくしたときの代わりに使えます。2個以上を同時に振ることもできます。範囲指定にすれば「1〜100」「0〜9」のような数を出せます。番号決めや当選番号の抽選に使えます。"
    },
    {
      "q": "重複しない番号がほしいとき",
      "a": "同じ数字を出したくない場合は、ルーレットに数字を入れて「全員に一巡」を選ぶと、重複せずに番号を配れます。"
    }
  ];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'サイコロ',
      url: `${SITE_URL}/dice/`,
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

      <h1>サイコロ</h1>
      <p className="lead">サイコロを振るか、好きな範囲の数字を出します。個数も範囲も自由に変えられます。</p>

      <ToolClient tool="dice" />

      <AdUnit position="below-tool" />

      <h2>ボードゲームやくじ引きに</h2>
      <p>サイコロが手元にないとき、なくしたときの代わりに使えます。2個以上を同時に振ることもできます。</p>
      <p>範囲指定にすれば「1〜100」「0〜9」のような数を出せます。番号決めや当選番号の抽選に使えます。</p>
      <h2>重複しない番号がほしいとき</h2>
      <p>同じ数字を出したくない場合は、ルーレットに数字を入れて「全員に一巡」を選ぶと、重複せずに番号を配れます。</p>

      <AdUnit position="below-faq" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        関連ツール：<Link href="/roulette/">ルーレット</Link>
        ／
        <Link href="/group/">グループ分け</Link>／
        <Link href="/amida/">あみだくじ</Link>／
        <Link href="/tournament/">トーナメント表</Link>
      </p>
    </>
  );
}
