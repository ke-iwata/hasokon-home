import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import AdUnit from '@/app/AdUnit';
import RouletteApp from '@/app/_roulette/RouletteApp';
import { SITE_URL } from '@/lib/registry';
import PRESETS from '@/lib/roulette/presets.json';

interface Preset {
  slug: string;
  name: string;
  title: string;
  description: string;
  lead: string;
  guide: string | null;
  items: { emoji: string; text: string }[];
}

const presets = PRESETS as Preset[];

const bySlug = (slug: string) => presets.find((p) => p.slug === slug);

// output: 'export' では、動的ルートの一覧を静的に列挙する必要がある
export function generateStaticParams() {
  return presets.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = bySlug(slug);
  if (!p) return {};
  return {
    title: p.title,
    description: p.description,
    alternates: { canonical: `${SITE_URL}/r/${p.slug}/` },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const preset = bySlug(slug);
  if (!preset) notFound();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: preset.name,
    url: `${SITE_URL}/r/${preset.slug}/`,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY' },
    description: preset.description,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <h1>{preset.name}</h1>
      <p className="lead">{preset.lead}</p>

      <RouletteApp preset={preset} />

      <AdUnit position="below-tool" />

      <h2>候補は自由に書き換えられます</h2>
      <p>
        あらかじめ候補が入った状態で開きますが、要らないものは消して、必要なものを足せます。
        書き換えた内容はこの端末に保存され、次に開いたときも残ります。
        <Link href="/roulette/">項目を空から作る</Link>こともできます。
      </p>

      {preset.guide && (
        <p>
          詳しい使い方は<Link href={`/guide/${preset.guide}/`}>解説ページ</Link>をご覧ください。
        </p>
      )}

      <AdUnit position="below-faq" />

      <h2>ほかの用途のルーレット</h2>
      <ul>
        {presets
          .filter((p) => p.slug !== preset.slug)
          .map((p) => (
            <li key={p.slug}>
              <Link href={`/r/${p.slug}/`}>{p.name}</Link>
            </li>
          ))}
      </ul>
    </>
  );
}
