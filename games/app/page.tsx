import type { Metadata } from 'next';
import Link from 'next/link';
import { games, SITE_NAME, SITE_URL } from '@/lib/registry';
import { breadcrumbList, breadcrumbTrail } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import GameIcon from '@/app/GameIcon';

/**
 * 自己参照canonical（docs/features/self-canonical-coverage.md）。
 * title / description は layout.tsx の既定値をそのまま使いたいので書かない
 * （title.template が '%s' なので、ここに title を書くと title.default が消える）。
 */
export const metadata: Metadata = {
  alternates: { canonical: `${SITE_URL}/` },
};

// 一覧ページ自身は2段（ホーム ＞ 無料ミニゲーム集）。ここが階層の中間になる
const trail = breadcrumbTrail();

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#publisher`,
      name: SITE_NAME,
      url: SITE_URL,
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      inLanguage: 'ja',
      publisher: { '@id': `${SITE_URL}/#publisher` },
    },
    breadcrumbList(trail),
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Breadcrumb trail={trail} />

      <h1>ブラウザですぐ遊べる無料ミニゲーム</h1>
      <p className="lead">
        インストール不要・登録不要。開いたらすぐ遊べます。スマホでもPCでも。
      </p>
      <div className="game-grid">
        {games
          .filter((g) => g.ready)
          .map((g) => (
            <Link key={g.slug} className="game-card" href={`/${g.slug}/`}>
              <div className="icon" aria-hidden="true">
                <GameIcon name={g.icon} />
              </div>
              <div className="name">{g.name}</div>
              <div className="desc">{g.description}</div>
            </Link>
          ))}
      </div>
    </>
  );
}
