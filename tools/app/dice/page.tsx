import type { Metadata } from 'next';
import Link from 'next/link';
import AdUnit from '@/app/AdUnit';
import { PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import ToolClient from '@/app/_roulette/ToolClient';
import { SITE_URL } from '@/lib/registry';

const title = 'サイコロを振る｜1〜10個をまとめて振れる無料ツール';
const description =
  'サイコロをブラウザで振れる無料ツール。1〜10個まで同時に振れて合計も出ます。登録もアプリも不要で、スマホからそのまま使えます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/dice/` },
};

const faq = [
    {
      "q": "ボードゲームやくじ引きに",
      "a": "サイコロが手元にないとき、なくしたときの代わりに使えます。2個以上を同時に振ることもできます。出た目は毎回ブラウザの乱数で決めており、どの目も同じ確率で出ます。"
    },
    {
      "q": "重複しない番号がほしいとき",
      "a": "サイコロは同じ目が続けて出ることがあります。重複させたくない場合は、ルーレットに数字を入れて、当たった数字を「これを除いてまわす」で外しながら回すと、重複せずに番号を配れます。"
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
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('dice'),
      publisher: PUBLISHER_REF,
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
      <p className="lead">サイコロが手元にないときに。1〜10個まで同時に振れて、合計も出ます。</p>

      <ToolClient tool="dice" />

      <AdUnit position="below-tool" />

      <h2>ボードゲームやくじ引きに</h2>
      <p>サイコロが手元にないとき、なくしたときの代わりに使えます。2個以上を同時に振ることもできます。</p>
      <p>出た目は毎回ブラウザの乱数で決めており、どの目も同じ確率で出ます。</p>
      <h2>重複しない番号がほしいとき</h2>
      <p>サイコロは同じ目が続けて出ることがあります。重複させたくない場合は、ルーレットに数字を入れて、当たった数字を「これを除いてまわす」で外しながら回すと、重複せずに番号を配れます。</p>

      <AdUnit position="below-faq" />

      <RelatedTools current="dice" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        関連ツール：<Link href="/roulette/">ルーレット</Link>
        ／
        <Link href="/group/">グループ分け</Link>
      </p>

      <ToolMeta slug="dice" />
    </>
  );
}
