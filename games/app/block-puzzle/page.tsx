import type { Metadata } from 'next';
import Link from 'next/link';
import { games, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

const title = 'ブロックパズル 無料｜ブラウザですぐ遊べる8×8の配置パズル';
const description =
  '無料のブロックパズル。8×8の盤面に配られたピースを置いて、揃った行と列を消していく配置パズルです。時間制限なし。インストール不要・登録不要でブラウザからすぐ遊べます。スマホ対応・ベストスコア保存。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/block-puzzle/` },
};

const faq = [
  {
    q: '無料で遊べますか？',
    a: 'すべて無料です。会員登録もインストールも不要で、ブラウザだけで遊べます。',
  },
  {
    q: 'ピースは回転できますか？',
    a: '回転はできません。配られた向きのまま置く遊びです。どこにでも置けてしまうと、置き場所を考える楽しさがなくなるためです。',
  },
  {
    q: '時間制限はありますか？',
    a: 'ありません。ブロックが落ちてくることもないので、じっくり考えてから置けます。',
  },
  {
    q: 'いつ終わりですか？',
    a: '手元にある3つのピースが、どれも盤面のどこにも置けなくなったら終了です。1つでも置ける場所が残っていれば続きます。',
  },
  {
    q: '得点はどう決まりますか？',
    a: '置いたマスの数と、消した行・列の本数で決まります。一度に複数の行・列を消したときと、続けて消し続けたときにはボーナスが付きます。',
  },
  {
    q: 'ベストスコアは保存されますか？',
    a: 'お使いのブラウザに保存されます（サーバーには送信されません）。別の端末やブラウザには引き継がれません。',
  },
];

const trail = breadcrumbFor('block-puzzle');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'ブロックパズル',
      url: `${SITE_URL}/block-puzzle/`,
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

      <h1>ブロックパズル</h1>
      <p className="lead">
        8×8の盤面に、配られた3つのピースを置いていくパズル。
        <strong>行か列が埋まると消えて</strong>、また置けるようになります。時間制限も落下もないので、じっくり考えて遊べます。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>盤面の下に、ピースが3つ配られます</li>
        <li>ピースを盤面へドラッグして、空いているマスに置きます（軽くタップして選んでから、置きたい場所をタップしてもかまいません）</li>
        <li>行または列が8マスすべて埋まると、その行・列が消えて得点が入ります</li>
        <li>3つとも置き切ると、次の3つが配られます</li>
        <li>3つのどれも置ける場所がなくなったら終了です</li>
      </ol>

      <h2>コツ</h2>
      <ul>
        <li>
          <strong>大きいピースが入る場所を空けておく</strong>のがいちばん大事です。3×3の四角や5マスの棒が来ても置けるよう、まとまった空きを1か所は残しておきます
        </li>
        <li>
          盤面の真ん中から埋めず、<strong>端や角から詰めていく</strong>と、大きな空きがつながったまま残ります
        </li>
        <li>
          1マスだけの飛び地を作らないようにします。1マスのピースは滅多に来ないので、ぽつんと空いた穴はそのまま盤面を狭くします
        </li>
        <li>
          消せる行が1本できても、<strong>すぐ消さずに次の3つを見てから</strong>のほうが得なことがあります。同時に消すほど点が伸びます
        </li>
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
          .filter((g) => g.ready && g.slug !== 'block-puzzle')
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
