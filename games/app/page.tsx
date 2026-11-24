import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGamesByGenre, SITE_NAME, SITE_URL } from '@/lib/registry';
import { breadcrumbList, breadcrumbTrail, genreItemLists } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import GamePreview from '@/app/GamePreview';

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

// ジャンルごとの見出しと目次（docs/features/games-ichiran-genre.md）。publicGames を通している
const sections = publicGamesByGenre();

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
    ...genreItemLists(),
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
      <p className="lead">
        ソリティア・ナンプレ・リバーシ・花札などの定番を、課金なしでそのまま遊べます。各ページに遊び方とコツ、よくある質問を載せています。ベストスコアなどの記録は、お使いのブラウザ内にだけ保存されます。
      </p>
      {/* ジャンルへ飛ぶ目次。href は registry の GENRES の key から作る（日本語の見出しから作らない） */}
      <nav className="genre-nav" aria-label="ジャンル">
        {sections.map((section) => (
          <a key={section.key} href={`#${section.key}`}>
            {section.label}
            <span className="count">{section.games.length}</span>
          </a>
        ))}
      </nav>

      {/* カードの絵は「遊んでいる最中の画面」（app/GamePreview.tsx）。幅いっぱいに置くので、
          タイル用の .icon の大きさをインラインで上書きしている。
          列の数と説明の切り方は globals.css の .genre-section（スマホは2列・名前だけ）。
          **a.game-card > div.icon > svg の並びは変えない**（scripts/sync-home-card-art.mjs がホームへ写している）。
          ほかのページの「他のゲーム」は小さいタイル（GameIcon）のまま。docs/features/card-illustrations.md */}
      {sections.map((section) => (
        <section key={section.key} id={section.key} className="genre-section">
          <div className="section-title">
            <h2>{section.label}</h2>
            <span className="count">{section.games.length}本</span>
          </div>
          <div className="game-grid">
            {section.games.map((g) => (
              <Link key={g.slug} className="game-card" href={`/${g.slug}/`}>
                <div className="icon" aria-hidden="true" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 12, overflow: 'hidden' }}>
                  <GamePreview slug={g.slug} />
                </div>
                <div className="name">{g.name}</div>
                <div className="desc">{g.description}</div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
