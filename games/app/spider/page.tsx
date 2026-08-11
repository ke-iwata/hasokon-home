import type { Metadata } from 'next';
import Link from 'next/link';
import { games, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

const title = 'スパイダーソリティア 無料｜1スートから4スートまで';
const description =
  '無料のスパイダーソリティア。初心者向けの1スートから上級の4スートまで難易度を選べます。タップで自動移動の簡単操作。インストール不要でブラウザからすぐ。スマホ対応。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/spider/` },
};

const faq = [
  { q: '難易度の違いは？', a: 'スートの種類の数です。1スート（スペードのみ）は初心者向け、2スート（スペードとハート）は中級、4スートは上級です。枚数はどれも104枚（2デック）です。' },
  { q: '別のスートの上に重ねられますか？', a: '重ねられます。ただし、まとめて動かせるのは同じスートで連続した並びだけなので、別スートに重ねた札はほどくのに手間がかかります。' },
  { q: '「配る」が押せないのはなぜ？', a: '空の列があるときは配れないルールです。どこかの札を空列に移動して、全列を埋めてから配ってください。' },
  { q: '失敗したら戻せますか？', a: '「もどす」ボタンで直近30手まで戻せます。' },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'スパイダーソリティア',
      url: `${SITE_URL}/spider/`,
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
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <h1>スパイダーソリティア</h1>
      <p className="lead">
        KからAまで同じスートで並べて場から取り除いていく、やり応えのあるソリティア。<strong>タップで選んでタップで置く</strong>簡単操作。1スートなら初心者でもクリアできます。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>ルール</h2>
      <ol>
        <li>場札の中で「1つ小さい数字」の札の上に重ねられます（スートは問いません）</li>
        <li>ただし<strong>まとめて動かせるのは同じスートで連続した並びだけ</strong>です</li>
        <li>KからAまで同じスートで13枚並ぶと自動で回収されます。8組そろえば勝ちです</li>
        <li>手詰まりになったら「配る」で山札から全列に1枚ずつ配ります（空列があると配れません）</li>
      </ol>
      <h2>コツ</h2>
      <ul>
        <li>できるだけ<strong>同じスートでつなげる</strong>ことを優先しましょう。別スートに重ねると、その下の札はしばらく使えなくなります</li>
        <li>空列は最強の作業場です。1列空けられると一気に整理が進みます</li>
        <li>「配る」の前に、できる移動を全部済ませておきましょう。配ると各列の並びが崩れます</li>
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
          .filter((g) => g.ready && g.slug !== 'spider')
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
