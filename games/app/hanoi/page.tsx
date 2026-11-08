import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import GameIcon from '@/app/GameIcon';
import Game from './Game';
import { DISC_COUNTS, minMoves } from '@/lib/hanoi';

/**
 * 最少手数の表は `lib/hanoi.ts` の式から作る（ページに数字を書き写さない）。
 *
 * 仕様: docs/features/game-hanoi-no-to.md
 */
const title = 'ハノイの塔 無料｜最少手数のヒント・自動再生つきでブラウザですぐ遊べる';
const description =
  '無料のハノイの塔。3本の柱の円盤を、小さい円盤の上に大きい円盤を置かずに右の柱へ移す一人用パズルです。円盤は3〜8枚。最少手数（2ⁿ−1）との比較、最短の1手だけを見るヒント、最短手順の自動再生つき。インストール不要でスマホからもすぐ遊べます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/hanoi/` },
  robots: robotsFor('hanoi'),
};

const faq = [
  {
    q: '何枚から難しいですか？',
    a: '3枚（最少7手）と4枚（最少15手）は数分で解けます。5枚（31手）から先は、同じ動きのくり返しに気づけるかどうかで手数が大きく変わります。6枚（63手）以上は手順の規則が分かっていても、途中で今どこを動かしているか見失いやすくなります。',
  },
  {
    q: '最少手数は何手ですか？',
    a: '円盤が n 枚なら 2ⁿ−1 手です。3枚で7手、4枚で15手、5枚で31手、6枚で63手、7枚で127手、8枚で255手。1枚増えるごとに、ほぼ2倍になります。',
  },
  {
    q: '1枚目はどこに動かせばいいですか？',
    a: '最少手数で解くなら、枚数が奇数のときは右の柱へ、偶数のときは中の柱へ、いちばん小さい円盤を動かします。逆に動かすと、最後にいちばん大きい円盤を右へ動かすときに、ほかの円盤が邪魔になって遠回りになります。',
  },
];

const trail = breadcrumbFor('hanoi');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'ハノイの塔',
      url: `${SITE_URL}/hanoi/`,
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

      <h1>ハノイの塔</h1>
      <p className="lead">
        左の柱の円盤を、<strong>小さい円盤の上に大きい円盤を置かずに</strong>右の柱へ移すパズル。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>最少手数は 2ⁿ−1</h2>
      <p>
        円盤が n 枚なら、最少手数は <strong>2ⁿ−1 手</strong>です。
      </p>
      <table className="hno-table">
        <thead>
          <tr>
            <th scope="col">円盤</th>
            {DISC_COUNTS.map((n) => (
              <th key={n} scope="col">
                {n}枚
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">最少手数</th>
            {DISC_COUNTS.map((n) => (
              <td key={n}>{minMoves(n)}</td>
            ))}
          </tr>
        </tbody>
      </table>

      <h2>遊びかた</h2>
      <ol>
        <li>始めは左の柱に円盤が大きい順に重なっています。枚数は3〜8枚から選べます</li>
        <li>
          <strong>円盤を取る柱をタップし、次に置く柱をタップ</strong>します。
          円盤をつまんで置く柱まで<strong>ドラッグ</strong>しても動かせます
        </li>
        <li>1手で動かせるのは、柱の<strong>いちばん上の1枚だけ</strong>です</li>
        <li>
          <strong>小さい円盤の上に大きい円盤は置けません</strong>（置けない柱は一瞬赤く縁取られます）
        </li>
        <li>
          <strong>全部を右の柱に移せば完成</strong>です。かかった手数と最少手数を並べて出します
        </li>
      </ol>
      <p>
        まちがえたら<strong>「1手戻す」</strong>で何手でもさかのぼれます。
        <strong>「ヒント」</strong>は、いまの局面から最短で完成させる手の最初の1手だけを、
        取る柱と置く柱を光らせて示します。<strong>「自動再生」</strong>は最初の局面から最短の手順を
        0.4秒に1手ずつ見せます（一時停止・1手送りもできます）。
        ヒントを使った回と自動再生を見たあとの1回は、クリア回数だけを記録し、
        最少手数とベストタイムは更新しません。記録は枚数ごとにブラウザへ保存されます。
        キーボードでは 1・2・3 で柱を選び、Z で1手戻します。
      </p>

      <h2>最少手数の理由</h2>
      <p>
        いちばん大きい円盤を右へ動かすには、その上の n−1 枚を全部、中の柱にどけておく必要があります。
        n−1 枚をどけるのに最少で 2ⁿ⁻¹−1 手、大きい円盤を動かすのに1手、
        どけた n−1 枚を大きい円盤の上へ戻すのにまた 2ⁿ⁻¹−1 手かかるので、合わせて 2ⁿ−1 手です。
      </p>

      <h2>ハノイの塔とは</h2>
      <p>
        1883年にフランスの数学者エドゥアール・リュカが発表したパズルです。
        同じ手順を小さい形でくり返して大きい形を解く「再帰」の例としてよく取り上げられ、
        自動再生で見ると、n 枚の手順の中に n−1 枚の手順が2回入っていることが目で分かります。
      </p>

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
        {publicGames
          .filter((g) => g.slug !== 'hanoi')
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
