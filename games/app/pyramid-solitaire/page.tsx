import type { Metadata } from 'next';
import Link from 'next/link';
import { games, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

const title = 'ピラミッドソリティア 無料｜13を作って崩すトランプゲーム';
const description =
  '無料のピラミッドソリティア。7段に積んだ28枚から、足して13になる2枚（KとA＋Q、J＋2など）を取り除いてピラミッドを崩す一人遊びです。Kは1枚で取れます。タップだけの簡単操作で、インストール不要・登録不要。スマホ対応で1ゲーム3〜5分。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/pyramid-solitaire/` },
};

const faq = [
  {
    q: 'ピラミッドソリティアはどんなゲーム？',
    a: '7段のピラミッド状に並べた28枚のトランプから、足して13になる2枚を選んで取り除いていく一人遊びです。A（1）とQ（12）、2とJ（11）、3と10、4と9、5と8、6と7が組になり、K（13）は1枚だけで取り除けます。ピラミッドを全部なくせばクリアです。',
  },
  {
    q: 'どの札が取れますか？',
    a: '上に他の札が乗っていない札（真下の2枚が両方とも無くなった札）と、捨て札の一番上の札です。取れない札はうすく表示され、タップすると小さく揺れて知らせます。捨て札の一番上はピラミッドの札と組にできます。',
  },
  {
    q: 'J・Q・Kはいくつとして数えますか？',
    a: 'A＝1、2〜10はその数字、J＝11、Q＝12、K＝13です。K は1枚で13になるので、相手を探さずそのままタップするだけで取り除けます。盤面の下にも同じ早見を常に出しています。',
  },
  {
    q: '山札は何回まで引き直せますか？',
    a: '2回までです（デックを3周できます）。山札を1枚ずつめくって捨て札に置き、使い切ったら「引き直す」で捨て札を裏返して山札に戻せます。引き直しが尽きて取れる組も無くなると、その配りは行き止まりです。',
  },
  {
    q: '必ずクリアできますか？',
    a: 'できません。ピラミッドソリティアは配りによって解けないものがあり、一般に運の要素が大きいゲームです。「もどす」で何手でも戻せるので、行き詰まったら別の手順を試すか、「新しく配る」でやり直してください。',
  },
  {
    q: 'スマホで遊べますか？',
    a: '遊べます。操作はタップだけで、ドラッグは要りません。1枚目をタップして選び、足して13になる相手をタップすると2枚とも消えます。1ゲーム3〜5分なので、待ち時間にも向いています。',
  },
  {
    q: '記録は残りますか？',
    a: 'クリアタイムのベストと、プレイ数・クリア数がこの端末のブラウザに保存されます。同じ配りをもう一度遊びたいときは、盤面の下の「配り番号」を使って「同じ配りをもう一度」を押してください。',
  },
];

const trail = breadcrumbFor('pyramid-solitaire');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'ピラミッドソリティア',
      url: `${SITE_URL}/pyramid-solitaire/`,
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

      <h1>ピラミッドソリティア</h1>
      <p className="lead">
        7段に積んだ28枚から、<strong>足して13になる2枚</strong>
        を取り除いてピラミッドを崩すトランプの一人遊び。Kは1枚で取れます。ルールが1つだけなので、はじめてでもすぐ遊べます。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>
          合計が<strong>13</strong>になる2枚をタップすると、2枚とも取り除けます（A＋Q、2＋J、3＋10、4＋9、5＋8、6＋7）
        </li>
        <li>
          <strong>K は1枚で13</strong>なので、タップするだけで取り除けます
        </li>
        <li>取れるのは、上に他の札が乗っていない札だけです。真下の2枚が両方とも無くなると取れるようになります</li>
        <li>手が無くなったら山札を1枚めくり、捨て札の一番上をピラミッドの札と組にします</li>
        <li>山札を使い切ったら「引き直す」で捨て札を山札に戻せます（引き直しは2回まで）</li>
        <li>ピラミッドの28枚を全部取り除けばクリアです</li>
      </ol>

      <h2>コツ</h2>
      <ul>
        <li>
          <strong>K は見つけ次第すぐ取る。</strong>
          相手が要らないので取り遅れる理由がなく、下の段のKを残すと上の札がいつまでも開きません
        </li>
        <li>
          <strong>ピラミッドの2枚で組めるなら、そちらを優先する。</strong>
          捨て札を使う組はいつでも作れますが、ピラミッドどうしの組は一度に2枚崩せます
        </li>
        <li>
          <strong>山札は1周目で使い切らない。</strong>
          引き直せるのは2回までです。めくる前に盤面で組めないかを一度見渡すと、周回の余裕が残ります
        </li>
        <li>
          <strong>同じ数字が2枚以上見えているときは、どちらを使うか考える。</strong>
          深い段の札を開けるほうを選ぶと、あとの選択肢が増えます
        </li>
        <li>行き詰まっても「もどす」で何手でも戻せます。分岐を試して、通る手順を探しましょう</li>
      </ul>

      <h2>ピラミッドソリティアの由来</h2>
      <p>
        ピラミッド（Pyramid）は19世紀のヨーロッパで遊ばれていた記録が残る古いソリティアの一種で、ルールにも名称にも権利者はいません。同じトランプ1組で遊ぶクロンダイク（いわゆる「ソリティア」）やスパイダー、フリーセルが「札を並べ替えて積み上げる」ゲームなのに対し、ピラミッドは「消して崩す」側のゲームです。手順の見通しより、どの組から取るかの選択が勝敗を決めます。
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
        {games
          .filter((g) => g.ready && g.slug !== 'pyramid-solitaire')
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
