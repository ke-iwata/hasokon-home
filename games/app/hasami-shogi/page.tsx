import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

/*
 * 本文・FAQ・description に他サイト・他団体・商品名を出さない（仕様書の「やらないこと」）。
 * 「200手で打ち切り」「同じ局面4回で引き分け」は昔からの遊びに無い決まりなので、ルール欄に明記する
 * （docs/features/game-hasami-shogi.md のルール 6・7）
 */

const title = 'はさみ将棋 無料｜CPU対戦（かんたん・ふつう・つよい）・隅取りあり／なし';
const description =
  '無料のはさみ将棋。9×9の将棋盤で、縦横に何マスでも動ける駒を使い、相手の駒を自分の駒2枚ではさんで取ります。CPUの強さは かんたん・ふつう・つよい の3段階。隅取りのあり／なし、勝ちの枚数（5枚・全部・3枚差）、先手・後手を選べます。待ったつき。インストール不要・登録不要でスマホ対応。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/hasami-shogi/` },
  robots: robotsFor('hasami-shogi'),
};

const faq = [
  {
    q: '駒は斜めに動ける？',
    a: '動けません。はさみ将棋の駒は、将棋の飛車と同じように縦か横に何マスでも動けます。斜めには動けず、ほかの駒を飛び越えることもできません。1手で動かせるのは1枚だけです。',
  },
  {
    q: '自分から相手の駒の間に入ったら取られる？',
    a: '取られません。駒が取られるのは、相手が駒を動かして、はさむ形を作ったときだけです。自分から相手の駒2枚の間に入っても、その駒は取られません。隅取りでも同じです。',
  },
  {
    q: '盤の端と自分の駒ではさんでも取れる？',
    a: '取れません。盤の端は自分の駒の代わりになりません。ただし、隅取り「あり」のときは、隅にいる相手の駒を、隣の2マスを自分の駒でふさいで取れます。',
  },
  {
    q: '勝ち負けはどう決まる？',
    a: '既定では、先に相手の駒を5枚取ったほうの勝ちです。設定で「全部取ったら勝ち」「3枚差がついたら勝ち」に変えられます。200手で決着がつかないときは、取った枚数が多いほうの勝ち（同じなら引き分け）。同じ局面（駒の並びと手番が同じ）が4回出たときも引き分けです。',
  },
  {
    q: 'CPUの強さはどのくらい？',
    a: '「かんたん」は1手先だけを見て、取れる駒があれば取りますが、ときどきでたらめに指します。はさめるマスに枠が出るので、ルールを覚えるのに向いています。「ふつう」は相手の次の手まで考えます。「つよい」は4手先まで読もうとし、1秒たったら、そこまでに読み終えた深さでいちばん良い手を指します。',
  },
];

const trail = breadcrumbFor('hasami-shogi');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'はさみ将棋',
      url: `${SITE_URL}/hasami-shogi/`,
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>はさみ将棋</h1>
      <p className="lead">
        将棋盤で遊ぶ昔ながらの遊び。縦横に動く駒で、<strong>相手の駒を2枚ではさんで取ります</strong>。CPUの強さは3段階。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>ルール</h2>
      <ol>
        <li>9×9の盤を使います。あなたと CPU は、それぞれ自分の側の一段目に9枚ずつ駒を並べて始めます（先手が「歩」、後手が「と」）</li>
        <li>駒は縦か横に何マスでも動けます（飛車と同じ）。斜めには動けず、駒を飛び越えることもできません。1手で1枚動かします</li>
        <li>
          動かした結果、相手の駒を縦か横で自分の駒2枚ではさむと取れます。一列に並んだ相手の駒もまとめてはさめます。
          盤の端は自分の駒の代わりになりません
        </li>
        <li>自分から相手の駒の間に入った駒は取られません</li>
        <li>先に相手の駒を5枚取ったほうの勝ちです（設定で「全部」「3枚差」にも変えられます）</li>
        <li>
          200手で決着がつかないときは、取った枚数が多いほうの勝ち、同じなら引き分けです
          （いつまでも終わらないのを防ぐための、このページだけの決まりです）
        </li>
        <li>
          同じ局面（駒の並びと手番が同じ）が4回出たら引き分けです（千日手。本将棋の決まりを借りています）
        </li>
      </ol>

      <h2>隅取りとは</h2>
      <p>
        盤の四隅にいる相手の駒は、縦にも横にもはさめません。そこで、<strong>隅の駒の隣の2マスを自分の駒でふさぐと取れる</strong>
        ことにする遊び方が「隅取り」です。地方や家庭によってある・なしが違うので、このページでは選べるようにしています（既定は「あり」）。
        隅取りでも、自分から隅に入った駒は取られません。
      </p>

      <h2>遊び方のコツ</h2>
      <ul>
        <li>
          <strong>駒を1枚だけ前に出しすぎない。</strong>
          孤立した駒は左右や前後から簡単にはさまれます。2枚・3枚で並んで進むと取られにくくなります
        </li>
        <li>
          <strong>相手の駒の「隣の空きマス」をよく見る。</strong>
          そこに自分の駒が入れて、反対側に自分の駒があれば取れます。逆に、自分の駒の隣が空いているところは狙われます
        </li>
        <li>
          <strong>隅と端は使い方しだい。</strong>
          端の駒は片側からしかはさまれませんが、隅取りありのときの隅は、隣の2マスをふさがれると取られます
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
        {publicGames
          .filter((g) => g.slug !== 'hasami-shogi')
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
