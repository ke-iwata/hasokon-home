import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

const title = 'ゴルフソリティア 無料｜1つ違いで7列を消すトランプ一人遊び';
const description =
  '無料のゴルフソリティア。7列×5枚の場札から、捨て札と数字が1つ違いの札をタップして取り除くトランプの一人遊びです。全部の札が最初から見えていて、1プレイ2〜3分。AとKをつなげるルールも選べます。インストール不要・登録不要、スマホ対応。';

export const metadata: Metadata = {
  title,
  description,
  robots: robotsFor('golf-solitaire'),
  alternates: { canonical: `${SITE_URL}/golf-solitaire/` },
};

const faq = [
  {
    q: 'ゴルフソリティアはどんなゲーム？',
    a: '7列×5枚に並べた35枚のトランプから、捨て札の一番上と数字が1つ違いの札を取り除いていく一人遊びです。取れるのは各列のいちばん手前（下端）の1枚だけ。取った札がそのまま新しい捨て札になるので、つながる限り何枚でも続けて取れます。場札35枚を全部取り除けばクリアです。',
  },
  {
    q: 'どの札が取れますか？',
    a: '各列のいちばん手前の1枚のうち、捨て札の一番上と数字が1つ違いのものです。たとえば捨て札が7なら6と8が取れます。スート（マーク）は関係ありません。取れない札はうすく表示され、タップすると小さく揺れて知らせます。',
  },
  {
    q: 'AとKはつながりますか？',
    a: '既定ではつながりません。Kの次はQしか無く、Aの次は2しか無いので、Kは連鎖の行き止まりになります。これがゴルフでいちばん広く遊ばれている形です。画面上部の切り替えで「A↔Kつなぐ」を選ぶと、K→A→2 と輪でつながるやさしいルールになります。記録はルールごとに分けて残ります。',
  },
  {
    q: 'なぜ最初に山札をめくるところから始まるのですか？',
    a: '場札35枚と山札17枚でトランプ52枚をちょうど使い切るので、配った時点では捨て札がまだ空だからです。山札を1枚めくると捨て札ができ、そこから1つ違いの札をつないでいきます。',
  },
  {
    q: '連鎖（チェーン）とは何ですか？',
    a: '山札をめくらずに続けて取った枚数のことです。1枚取るごとに1つ増え、山札をめくると0に戻ります。この配りでの最長連鎖は画面上部に、これまでの最長連鎖は記録の帯に出ます。山札は17枚しかないので、長い連鎖を作れるかどうかがそのまま勝敗になります。',
  },
  {
    q: '山札は引き直せますか？',
    a: '引き直せません。ゴルフの標準ルールでは山札は17枚を1周するだけです。使い切ったあとは取れる札があるあいだだけ続き、取れる札も無くなったらその配りは行き止まりです。「もどす」で何手でも戻せます。',
  },
  {
    q: '必ずクリアできますか？',
    a: 'できません。ゴルフは場札が最初から全部見えているぶん配りの運が大きく、取り切れない配りが普通にあります（クリアできるのは体感で1割前後）。1プレイが短いので、行き詰まったら「もどす」で分岐をやり直すか、「新しく配る」で次の配りに進んでください。',
  },
  {
    q: 'スマホで遊べますか？',
    a: '遊べます。操作は取りたい列をタップするだけで、ドラッグも長押しも要りません。列のどこを押しても手前の1枚を取りにいきます。1ゲーム2〜3分で終わるので、待ち時間にも向いています。',
  },
  {
    q: '記録は残りますか？',
    a: 'クリア回数・クリア率と、これまでの最長連鎖がこの端末のブラウザに保存されます。「Kで止まる」と「A↔Kつなぐ」は難しさが違うので、記録は別々に残ります。最長連鎖はクリアできなかった配りのぶんも残ります。同じ配りをもう一度遊びたいときは、山札の横の配り番号を見て「同じ配りをもう一度」を押してください。',
  },
];

const trail = breadcrumbFor('golf-solitaire');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'ゴルフソリティア',
      url: `${SITE_URL}/golf-solitaire/`,
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

      <h1>ゴルフソリティア</h1>
      <p className="lead">
        7列×5枚に並べた35枚から、<strong>捨て札と1つ違いの札</strong>
        をタップして取り除くソリティア。札はすべて表向きで、1プレイ2〜3分。AとKをつなげるルールも選べます。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>まず山札をタップして1枚めくります。それが最初の捨て札になります</li>
        <li>
          捨て札の一番上と<strong>数字が1つ違い</strong>の場札をタップすると取れます（7なら6と8）。
          スートは関係ありません
        </li>
        <li>取れるのは<strong>各列のいちばん手前（下端）の1枚だけ</strong>です。列のどこを押しても手前の札を取ります</li>
        <li>取った札が新しい捨て札になるので、つながる限り<strong>連鎖</strong>が続きます</li>
        <li>取れる札が無くなったら山札をタップして1枚めくります（連鎖はそこで途切れます）</li>
        <li>
          既定では<strong>AとKはつながりません</strong>（Kで行き止まり）。
          画面上部で「A↔Kつなぐ」に切り替えるとやさしくなります
        </li>
        <li>場札35枚を全部取り除けばクリアです。山札は17枚で、引き直しはありません</li>
      </ol>

      <h2>コツ</h2>
      <ul>
        <li>
          <strong>枚数の多い列から削る。</strong>
          1列でも残れば負けなので、厚い列を放っておくと最後に必ず足りなくなります。同じ数字が2列に見えているなら、厚いほうから取ります
        </li>
        <li>
          <strong>めくる前に連鎖を設計する。</strong>
          山札は17枚しかありません。「この札から何枚つながるか」を数えてから取り始めると、めくる回数を大きく減らせます
        </li>
        <li>
          <strong>Kのそばを早めにほどく。</strong>
          既定のルールではKは連鎖の行き止まりです。Kが列の奥に埋まっていると最後まで残りやすいので、Qが見えているうちに手前へ出しておきます
        </li>
        <li>
          <strong>同じ数字が並んだ列は後回しにしない。</strong>
          6・6と続く列は1回の連鎖では1枚しか減りません。捨て札が5や7のうちに片方を取り、残りは別の機会に回します
        </li>
        <li>行き詰まっても「もどす」で何手でも戻せます。分岐を試して、通る手順を探しましょう</li>
      </ul>

      <h2>ゴルフソリティアの由来</h2>
      <p>
        ゴルフ（Golf Solitaire）は19世紀から遊ばれている伝統的なトランプの一人遊びで、ルールにも名称にも権利者はいません。名前は、スポーツのゴルフが打数の少なさを競うのと同じく、
        <strong>残った札の枚数（＝スコア）が少ないほど良い</strong>
        とする数え方から来ています。全部取り切れれば「ホールインワン」というわけです。もともと1ディールを1ホールと見なして9ホール・18ホール続けて合計を競う遊び方があり、1プレイが短いのはそのためです。
      </p>
      <p>
        並べ方が「場札を1枚ずつ、捨て札と1つ違いでつないで取る」形なので、
        <Link href="/tripeaks/">トライピークス</Link>
        は実はこのゴルフの並べ方を3つの山にしたものです。
      </p>

      <h2>他のソリティアと比べると</h2>
      <ul>
        <li>
          <Link href="/solitaire/">ソリティア（クロンダイク）</Link>
          ・<Link href="/spider/">スパイダーソリティア</Link>
          ・<Link href="/freecell/">フリーセル</Link>
          は、札を並べ替えて<strong>積み上げる</strong>タイプ。じっくり考える時間が長めです
        </li>
        <li>
          <Link href="/pyramid-solitaire/">ピラミッドソリティア</Link>
          ・<Link href="/tripeaks/">トライピークス</Link>
          とこのゴルフは、札を<strong>消して崩す</strong>タイプ。ピラミッドは「合計13の2枚」、トライピークスとゴルフは「1つ違いを長くつなぐ」ゲームです
        </li>
        <li>
          そのなかでもゴルフは<strong>最短</strong>です。裏向きの札が1枚も無く、山札も17枚しかないので、迷う場面が少なく2〜3分で決着します
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
          .filter((g) => g.slug !== 'golf-solitaire')
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
