import type { Metadata } from 'next';
import Link from 'next/link';
import { games, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

const title = 'ナンプレ 無料｜ブラウザですぐ遊べる数字パズル';
const description =
  '無料のナンプレ（ナンバープレース）。インストール不要でブラウザからすぐ遊べます。かんたん・ふつう・むずかしいの3段階で、答えは必ず1通り。スマホ対応。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/nanpre/` },
};

const faq = [
  { q: '無料で遊べますか？', a: 'すべて無料です。会員登録もアプリのインストールも不要で、ブラウザだけで遊べます。' },
  { q: '問題は何問ありますか？', a: '「新しい問題」を押すたびにその場で生成するので、実質無制限です。生成した問題はコンピュータが検証しており、答えが必ず1通りになっています。' },
  { q: '途中で保存できますか？', a: '現在は保存機能はありません。ページを閉じると盤面はリセットされます。' },
];

const trail = breadcrumbFor('nanpre');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'ナンプレ',
      url: `${SITE_URL}/nanpre/`,
      gamePlatform: 'Web Browser',
      applicationCategory: 'Game',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY' },
      publisher: { '@id': `${SITE_URL}/#publisher` },
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
    breadcrumbList(trail),
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumb trail={trail} />

      <h1>ナンプレ</h1>
      <p className="lead">
        定番の数字パズルをブラウザで。<strong>答えは必ず1通り</strong>になるように作られた問題を、その場で無限に生成します。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>空いているマスをタップして選び、下の数字ボタン（またはキーボード）で入力します</li>
        <li>タテ・ヨコの各列と、太線で区切られた3×3のブロックに、1〜9を1つずつ入れます</li>
        <li>同じ数字が重複すると赤く表示されます。すべて正しく埋まればクリアです</li>
      </ol>
      <h2>コツ</h2>
      <ul>
        <li>まず「その数字が置ける場所が1つしかない」マスを探します。9が8個埋まっていれば残り1個の場所は確定です</li>
        <li>行き詰まったら、候補が2つに絞れているマスを覚えておき、片方で進めてみるのも手です</li>
        <li>むずかしいモードはヒントが26個まで減ります。じっくり考える人向けです</li>
      </ul>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <h2>他のゲーム</h2>
      <div className="game-grid">
        {games
          .filter((g) => g.ready && g.slug !== 'nanpre')
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
