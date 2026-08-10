import type { Metadata } from 'next';
import Link from 'next/link';
import AdUnit from '@/app/AdUnit';
import { PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import ToolClient from '@/app/_roulette/ToolClient';
import { SITE_URL } from '@/lib/registry';

const title = 'グループ分けツール｜班分け・チーム分けをランダムに';
const description =
  '名前を入れるだけで、班分け・チーム分けをランダムに作れる無料ツール。人数を揃えて自動で振り分けます。登録不要・アプリ不要でスマホからも使えます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/group/` },
};

const faq = [
    {
      "q": "人数が割り切れないときは",
      "a": "端数は先頭のグループから1人ずつ多く配ります。たとえば10人を3グループなら、4人・3人・3人になります。「1グループあたりの人数」で指定することもできます。5人ずつと決めれば、必要なグループ数が自動で決まります。"
    },
    {
      "q": "納得感のある分け方にするために",
      "a": "画面を全員が見える場所に出してから作ると、結果が受け入れられやすくなります。気に入らない結果が出たら「もう一度分ける」で作り直せます。ただし、やり直しを繰り返すと公平さの根拠が薄れるので、回数を先に決めておくのがおすすめです。"
    }
  ];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'グループ分け',
      url: `${SITE_URL}/group/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('group'),
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

      <h1>グループ分け</h1>
      <p className="lead">名前を入れて、いくつのグループに分けるかを決めるだけ。人数は自動で均等に振り分けます。</p>

      <ToolClient tool="group" />

      <AdUnit position="below-tool" />

      <h2>人数が割り切れないときは</h2>
      <p>端数は先頭のグループから1人ずつ多く配ります。たとえば10人を3グループなら、4人・3人・3人になります。</p>
      <p>「1グループあたりの人数」で指定することもできます。5人ずつと決めれば、必要なグループ数が自動で決まります。</p>
      <h2>納得感のある分け方にするために</h2>
      <p>画面を全員が見える場所に出してから作ると、結果が受け入れられやすくなります。</p>
      <p>気に入らない結果が出たら「もう一度分ける」で作り直せます。ただし、やり直しを繰り返すと公平さの根拠が薄れるので、回数を先に決めておくのがおすすめです。</p>

      <AdUnit position="below-faq" />

      <RelatedTools current="group" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        関連ツール：<Link href="/roulette/">ルーレット</Link>
        ／
        <Link href="/dice/">サイコロ</Link>
      </p>

      <ToolMeta slug="group" />
    </>
  );
}
