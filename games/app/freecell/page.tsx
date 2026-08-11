import type { Metadata } from 'next';
import Link from 'next/link';
import { games, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

const title = 'フリーセル 無料｜ブラウザですぐ遊べるトランプパズル';
const description =
  '無料のフリーセル。52枚すべてが最初から表向きで、運の要素がほとんどない実力型のトランプパズルです。タップするだけの簡単操作で、複数枚もまとめて移動。インストール不要・登録不要でブラウザからすぐ遊べます。スマホ対応。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/freecell/` },
};

const faq = [
  {
    q: 'フリーセルはどんなゲーム？',
    a: '52枚のトランプを4つのホームセルにスートごとAからKまで積み上げる一人遊びです。最初からすべての札が表向きで配られるため、運の要素がほとんどなく、手順を考えるほど勝てる実力型のパズルになっています。左上の4つの「フリーセル」に札を1枚ずつ一時的に避けられるのが最大の特徴です。',
  },
  {
    q: '必ず解けますか？',
    a: 'ほとんどの配りは解けますが、まれに配られた時点で解けない配置もあります。このゲームでは動かせる手が1つも無くなった時点でその旨を表示するので、「もどす」で戻すか「新しく配る」でやり直してください。',
  },
  {
    q: '複数枚まとめて動かすには？',
    a: '空いているフリーセルと空の列の数で、一度に動かせる枚数が決まります。「(空きフリーセル数 + 1) × 2 の (空き列数) 乗」枚までまとめて動かせます。たとえばフリーセルが2つ空いて空列が1つあれば、3 × 2 = 6枚まで一度に運べます。動かしたい並びの一番上の札をタップして、置きたい列をタップしてください。',
  },
  {
    q: 'スマホで遊べますか？',
    a: '遊べます。ドラッグは不要で、動かしたい札をタップして選び、置きたい場所をタップするだけです。同じ札をもう一度タップすると、いちばん良い場所へ自動で移動します。',
  },
  {
    q: '同じ配りをもう一度遊べますか？',
    a: '遊べます。盤面の下に「配り番号」が表示されているので、「同じ配りをもう一度」を押すと同じ並びで最初からやり直せます。',
  },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'フリーセル',
      url: `${SITE_URL}/freecell/`,
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

      <h1>フリーセル</h1>
      <p className="lead">
        最初から<strong>52枚すべてが見えている</strong>、運にほとんど左右されないトランプパズル。タップで選んでタップで置くだけの簡単操作で、まとめて動かせる枚数も自動で計算します。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>右上の4つのホームセルに、スートごとにAから順にKまで積み上げれば勝ちです</li>
        <li>場札は「赤黒交互に、1つ小さい数字」の順に重ねます（黒7の上に赤6）。空いた列にはどの札でも置けます</li>
        <li>左上の4つのフリーセルには、札を1枚ずつ一時的に避けておけます</li>
        <li>動かしたい札をタップして選び、置きたい場所をタップします。同じ札をもう一度タップすると自動で移動します</li>
        <li>一度に動かせる枚数は<strong>（空きフリーセル数 + 1）× 2 の（空き列数）乗</strong>です。空きが多いほど大きなかたまりを運べます</li>
      </ol>

      <h2>コツ</h2>
      <ul>
        <li>
          <strong>フリーセルは埋めるほど身動きが取れなくなります。</strong>
          4つ全部を使うのは、その先の手順が最後まで見えているときだけにしましょう
        </li>
        <li>
          <strong>空の列はフリーセルより強い置き場です。</strong>
          一度に動かせる枚数が倍になるので、早めに1列空けられると一気に楽になります
        </li>
        <li>Aと2は見つけ次第すぐホームセルへ。3以降は場札で使う可能性を考えてから上げましょう</li>
        <li>
          深いところに埋まっているAを掘り出す手順を、動かす前に最後まで数えるのが上達の近道です。迷ったら「もどす」で何手でも戻せます
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
          .filter((g) => g.ready && g.slug !== 'freecell')
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
