import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import AdUnit from '@/app/AdUnit';
import { SITE_URL } from '@/lib/registry';
import { PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import ToolMeta from '@/app/ToolMeta';
import GUIDES from '@/lib/roulette/guides.json';
import PRESETS from '@/lib/roulette/presets.json';

type Block =
  | { type: 'h2' | 'p'; text?: string; items?: string[] }
  | { type: 'ol' | 'ul'; items?: string[]; text?: string };

interface Guide {
  slug: string;
  title: string;
  description: string;
  heading: string;
  lead: string;
  blocks: Block[];
}

const guides = GUIDES as Guide[];
const presets = PRESETS as { slug: string; name: string; guide: string | null }[];

const bySlug = (slug: string) => guides.find((g) => g.slug === slug);

// output: 'export' では、動的ルートの一覧を静的に列挙する必要がある
export function generateStaticParams() {
  return guides.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const g = bySlug(slug);
  if (!g) return {};
  return {
    title: g.title,
    description: g.description,
    alternates: { canonical: `${SITE_URL}/guide/${g.slug}/` },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = bySlug(slug);
  if (!guide) notFound();

  // この解説に対応するプリセット（あれば直接開けるようにする）
  const preset = presets.find((p) => p.guide === guide.slug);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: guide.heading,
    description: guide.description,
    url: `${SITE_URL}/guide/${guide.slug}/`,
    inLanguage: 'ja',
    dateModified: toolUpdatedAt('roulette'),
    author: PUBLISHER_REF,
    publisher: PUBLISHER_REF,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <h1>{guide.heading}</h1>
      <p className="lead">{guide.lead}</p>

      <p>
        <Link href={preset ? `/r/${preset.slug}/` : '/roulette/'}>
          {preset ? `${preset.name}を開く` : 'ルーレットを開く'}
        </Link>
      </p>

      <AdUnit position="below-tool" />

      {guide.blocks.map((b, i) => {
        if (b.type === 'h2') return <h2 key={i}>{b.text}</h2>;
        if (b.type === 'p') return <p key={i}>{b.text}</p>;
        const list = (b.items ?? []).map((x, j) => <li key={j}>{x}</li>);
        return b.type === 'ol' ? <ol key={i}>{list}</ol> : <ul key={i}>{list}</ul>;
      })}

      <AdUnit position="below-faq" />

      <h2>ほかの使い方</h2>
      <ul>
        {guides
          .filter((g) => g.slug !== guide.slug)
          .map((g) => (
            <li key={g.slug}>
              <Link href={`/guide/${g.slug}/`}>{g.heading}</Link>
            </li>
          ))}
      </ul>

      <ToolMeta slug="roulette" />
    </>
  );
}
