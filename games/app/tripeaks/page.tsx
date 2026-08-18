import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

const title = 'トライピークス 無料｜1つ違いでつなげるソリティア';
const description =
  '無料のトライピークス（スリーピークス）。3つの山に積んだ28枚から、捨て札と1つ違いの札をタップして取り除くソリティアです。AはKにも2にもつながり、続けて取るほど連鎖が伸びます。インストール不要・登録不要、スマホ対応で1ゲーム2〜3分。';

export const metadata: Metadata = {
  title,
  description,
  robots: robotsFor('tripeaks'),
  alternates: { canonical: `${SITE_URL}/tripeaks/` },
};

const faq = [
  {
    q: 'トライピークスはどんなゲーム？',
    a: '3つの山（ピーク）の形に並べた28枚のトランプから、捨て札の一番上と数字が1つ違いの札を取り除いていく一人遊びです。取った札がそのまま新しい捨て札になるので、つながる限り何枚でも続けて取れます。場札28枚を全部取り除けばクリアです。',
  },
  {
    q: 'どの札が取れますか？',
    a: '上に他の札が乗っていない札（真下の2枚が両方とも無くなった札）のうち、捨て札の一番上と数字が1つ違いのものです。たとえば捨て札が7なら6と8が取れます。取れない札はうすく表示され、タップすると小さく揺れて知らせます。',
  },
  {
    q: 'AとKはつながりますか？',
    a: 'つながります。A（1）はK（13）にも2にもつながるので、K→A→2 のように輪でつながっていると考えてください。この「ラップ」があるおかげで、K と A の多い場面でも連鎖を伸ばせます。',
  },
  {
    q: '連鎖（チェーン）とは何ですか？',
    a: '山札をめくらずに続けて取った枚数のことです。1枚取るごとに1つ増え、山札をめくると0に戻ります。この配りでの最長連鎖は画面上部に、これまでの最長連鎖は記録の帯に出ます。長い連鎖を狙うのがトライピークスのいちばんの楽しみです。',
  },
  {
    q: '山札は引き直せますか？',
    a: '引き直せません。トライピークスの標準ルールでは山札は23枚を1周するだけで、使い切ったら取れる札があるあいだだけ続きます。取れる札も山札も無くなったら、その配りは行き止まりです。「もどす」で何手でも戻せます。',
  },
  {
    q: '必ずクリアできますか？',
    a: 'できません。配りによっては最後まで取り切れないものがあります。ただし手順の選び方でクリアできる配りは多いので、行き詰まったら「もどす」で分岐をやり直すか、「新しく配る」で別の配りを試してください。',
  },
  {
    q: 'スマホで遊べますか？',
    a: '遊べます。操作は取りたい札をタップするだけで、ドラッグも長押しも要りません。1ゲーム2〜3分で終わるので、待ち時間にも向いています。',
  },
  {
    q: '記録は残りますか？',
    a: 'クリア回数・クリア率と、これまでの最長連鎖がこの端末のブラウザに保存されます。最長連鎖はクリアできなかった配りのぶんも残ります。同じ配りをもう一度遊びたいときは、山札の横の「配り番号」を見て「同じ配りをもう一度」を押してください。',
  },
];

const trail = breadcrumbFor('tripeaks');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'トライピークス',
      url: `${SITE_URL}/tripeaks/`,
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

      <h1>トライピークス</h1>
      <p className="lead">
        3つの山に積んだ28枚から、<strong>捨て札と1つ違いの札</strong>
        をタップして取り除くソリティア。AはKにも2にもつながります。続けて取るほど連鎖が伸びる、テンポのよい一人遊びです。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>捨て札の一番上と<strong>数字が1つ違い</strong>の場札をタップすると取れます（7なら6と8）</li>
        <li>
          <strong>AはKにも2にも</strong>つながります（…Q・K・A・2・3…と輪でつながっています）
        </li>
        <li>取れるのは、上に他の札が乗っていない札だけです。真下の2枚が無くなると裏札は自動でめくれます</li>
        <li>取った札が新しい捨て札になるので、つながる限り<strong>連鎖</strong>が続きます</li>
        <li>取れる札が無くなったら山札をタップして1枚めくります（連鎖はそこで途切れます）</li>
        <li>場札28枚を全部取り除けばクリアです。山札は23枚で、引き直しはありません</li>
      </ol>

      <h2>コツ</h2>
      <ul>
        <li>
          <strong>裏札が多いピークから崩す。</strong>
          裏札は取れる札の候補になっていないので、早く開けるほど後半の選択肢が増えます
        </li>
        <li>
          <strong>同じ数字が2枚見えているときは、上の段を先に取る。</strong>
          下の段は残しても他の札の邪魔になりにくく、あとの「つなぎ」として使えます
        </li>
        <li>
          <strong>連鎖は設計してから始める。</strong>
          めくる前に「この札からこう続く」と2〜3手先まで見えていれば、山札の消費を大きく減らせます
        </li>
        <li>
          <strong>1つのピークだけを深追いしない。</strong>
          3つの山を平らに崩すほうが、取れる札の候補が常に多い状態を保てます
        </li>
        <li>行き詰まっても「もどす」で何手でも戻せます。分岐を試して、通る手順を探しましょう</li>
      </ul>

      <h2>トライピークスの由来</h2>
      <p>
        トライピークス（Tri Peaks / Three Peaks）は1989年に考案されたとされる比較的新しいソリティアで、ゴルフ（Golf）という古いソリティアの並べ方を3つの山にしたものです。クロンダイク（いわゆる「ソリティア」）やスパイダー、フリーセルが「札を並べ替えて積み上げる」ゲームなのに対し、トライピークスはピラミッドと同じ「消して崩す」側のゲームです。ただしピラミッドが「合計13の2枚」を探すのに対し、こちらは「1つ違いを長くつなげる」ので、遊び味ははっきり違います。ルールにも名称にも権利者はいません。
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
          .filter((g) => g.slug !== 'tripeaks')
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
