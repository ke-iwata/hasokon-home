import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import AdUnit from '@/app/AdUnit';
import RouletteApp from '@/app/_roulette/RouletteApp';
import { SITE_URL } from '@/lib/registry';
import { breadcrumbList, breadcrumbTrail, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import ToolMeta from '@/app/ToolMeta';
import PRESETS from '@/lib/roulette/presets.json';

interface Preset {
  slug: string;
  name: string;
  title: string;
  description: string;
  lead: string;
  guide: string | null;
  items: { emoji: string; text: string }[];
  /** 用途ごとの固有の解説（h2 + 段落）。共通の定型文だけの重複ページにしないため */
  sections: { heading: string; body: string[] }[];
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

  // 用途別ルーレットは registry に無いので、名前はプリセットから取る
  const trail = breadcrumbTrail(preset.name);

  // パンくずを足すために @graph にしてある（<script> は1枚のまま）
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: preset.name,
        url: `${SITE_URL}/r/${preset.slug}/`,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Web',
        inLanguage: 'ja',
        isAccessibleForFree: true,
        dateModified: toolUpdatedAt('roulette'),
        publisher: PUBLISHER_REF,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY' },
        description: preset.description,
      },
      breadcrumbList(trail),
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumb trail={trail} />

      <h1>{preset.name}</h1>
      <p className="lead">{preset.lead}</p>

      <RouletteApp preset={preset} />

      <AdUnit position="below-tool" />

      {preset.sections.map((s) => (
        <div key={s.heading}>
          <h2>{s.heading}</h2>
          {s.body.map((text, i) => (
            <p key={i}>{text}</p>
          ))}
        </div>
      ))}

      <h2>候補は自由に書き換えられます</h2>
      <p>
        {/* プリセットの編集は保存されない（RouletteApp が preset ありのとき setStored を呼ばない）。
            「保存される」と書かないこと */}
        あらかじめ候補が入った状態で開きますが、要らないものは消して、必要なものを足せます。書き換えはこのページを開いているあいだだけ有効で、開き直すと元の候補に戻ります。自分の候補を保存して繰り返し使いたいときは、
        <Link href="/roulette/">項目を空から作るルーレット</Link>
        をご利用ください（そちらは書き換えた内容が端末に保存されます）。
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

      <ToolMeta slug="roulette" />
    </>
  );
}
