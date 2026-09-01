import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

const title = 'ゴルフソリティア 無料｜1つ違いで7列を崩すトランプの一人遊び';
const description =
  '無料のゴルフソリティア（Golf Solitaire）。7列×5枚の場札から、捨て札と数字が1つ違いの札を手前から取り除いていくトランプの一人遊びです。続けて取るほど連鎖が伸び、1ゲーム2〜3分。インストール不要・登録不要、スマホ対応。KとAをつなげるルールも選べます。';

export const metadata: Metadata = {
  title,
  description,
  robots: robotsFor('golf-solitaire'),
  alternates: { canonical: `${SITE_URL}/golf-solitaire/` },
};

const faq = [
  {
    q: 'ゴルフソリティアはどんなゲーム？',
    a: '7列×5枚の35枚を全部表向きに並べ、捨て札の一番上と数字が1つ違いの札を取り除いていく一人遊びです。取れるのは各列のいちばん手前（下端）の1枚だけ。場札35枚を全部取り除ければクリアです。1ゲーム2〜3分で終わります。',
  },
  {
    q: 'どの札が取れますか？',
    a: '各列の手前の1枚のうち、捨て札の一番上と数字が1つ違いのものです。たとえば捨て札が7なら6と8が取れます。スートは関係ありません。取れない札はうすく表示され、タップすると小さく揺れて知らせます。',
  },
  {
    q: 'KとAはつながりますか？',
    a: '「標準」ルールではつながりません。Kまで来ると連鎖はそこで止まり、山札をめくり直すことになります。これがゴルフでもっとも広く遊ばれている形です。上の「A↔Kあり」を選ぶと、AはKにも2にもつながる輪のルールになり、ぐっと易しくなります。',
  },
  {
    q: '連鎖（チェーン）とは何ですか？',
    a: '山札をめくらずに続けて取った枚数のことです。1枚取るごとに1つ増え、山札をめくると0に戻ります。この配りでの最長連鎖は画面上部に、これまでの最長連鎖は記録の帯に出ます。連鎖はルールの区分ごとに別々に記録されます。',
  },
  {
    q: '山札は何枚ですか？引き直せますか？',
    a: '山札は17枚で、引き直しはありません。捨て札は最初は空なので、まず山札を1枚めくってから始めます。使い切ったあとは、取れる札があるあいだだけ続きます。',
  },
  {
    q: '必ずクリアできますか？',
    a: 'できません。ゴルフは盤面がすべて見えているぶん、配りによっては手順を尽くしても取り切れないものがあります。行き詰まったら「もどす」で分岐をやり直すか、「新しく配る」で別の配りを試してください。手が付けようのない配りだけは、配るときに自動で弾いています。',
  },
  {
    q: 'トライピークスとどう違いますか？',
    a: '「捨て札と1つ違いの札を取る」という芯は同じですが、場の形と難しさが違います。トライピークスは山型で裏向きの札があり、AとKもつながります。ゴルフは35枚が全部見えているかわりに、取れるのは各列の手前の1枚だけで、標準ルールではKで連鎖が止まります。先を読む余地が大きいのがゴルフです。',
  },
  {
    q: '記録は残りますか？',
    a: 'クリア回数・クリア率と、これまでの最長連鎖がこの端末のブラウザに保存されます。「標準」と「A↔Kあり」は別々に記録されます。同じ配りをもう一度遊びたいときは、山札の横の配り番号を見て「同じ配りをもう一度」を押してください。',
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
        を手前から取り除くトランプの一人遊び。全部の札が見えているので、先を読むほど連鎖が伸びます。1ゲーム2〜3分。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>まず<strong>山札をタップして1枚めくる</strong>と、それが最初の捨て札になります</li>
        <li>捨て札の一番上と<strong>数字が1つ違い</strong>の場札をタップすると取れます（7なら6と8）。スートは関係ありません</li>
        <li>取れるのは<strong>各列のいちばん手前（下端）の1枚だけ</strong>です。その札を取ると、1つ奥の札が手前になります</li>
        <li>取った札が新しい捨て札になるので、つながる限り<strong>連鎖</strong>が続きます</li>
        <li>取れる札が無くなったら山札をめくります（連鎖はそこで途切れます）。山札は17枚で、引き直しはありません</li>
        <li>
          標準ルールでは<strong>KとAはつながりません</strong>（Kで連鎖が止まります）。上の「A↔Kあり」を選ぶと輪でつながります
        </li>
        <li>場札35枚を全部取り除けばクリアです</li>
      </ol>

      <h2>コツ</h2>
      <ul>
        <li>
          <strong>札は全部見えている。先に道筋を引く。</strong>
          めくる前に「この列のこの札から、こう続く」と数手先まで並べてから動かすと、山札の減り方がまるで変わります
        </li>
        <li>
          <strong>深い列から崩す。</strong>
          残り枚数の多い列は最後まで残ると詰みの原因になります。同じ数字がどちらでも取れるときは、奥の深い列のほうを取りましょう
        </li>
        <li>
          <strong>Kの下に何があるかを見ておく。</strong>
          標準ルールではKで連鎖が止まるので、Kは「山札をめくる直前に片づける札」です。Kを取ったあとに続きが無いなら、順番を入れ替えられないか考えます
        </li>
        <li>
          <strong>同じ数字が2枚以上手前に出たら片方を残す。</strong>
          あとで戻ってくるための「つなぎ」になります。両方まとめて取ると、連鎖の折り返しが利かなくなります
        </li>
        <li>行き詰まっても「もどす」で何手でも戻せます。分岐を試して、通る手順を探しましょう</li>
      </ul>

      <h2>ゴルフソリティアの由来</h2>
      <p>
        ゴルフ（Golf Solitaire）は19世紀から遊ばれている伝統的なトランプの一人遊びで、ルールにも名称にも権利者はいません。名前はスポーツのゴルフから来ていて、
        <strong>打数（＝取り切れずに場に残った札の枚数）を少なくするほど良い</strong>
        という数え方をするのが由来です。1ホールごとに残り枚数を足していき、18ホールぶんの合計で競う遊び方も昔から知られています。
      </p>
      <p>
        並べ方の系統としては「消して崩す」側のソリティアで、
        <Link href="/tripeaks/">トライピークス</Link>
        はこのゴルフの場札を3つの山型にしたものです。合計13の2枚を探す
        <Link href="/pyramid-solitaire/">ピラミッドソリティア</Link>
        や、札を並べ替えて積み上げる<Link href="/solitaire/">クロンダイク</Link>・
        <Link href="/spider/">スパイダーソリティア</Link>・
        <Link href="/freecell/">フリーセル</Link>
        とは遊び味がはっきり違うので、気分を変えたいときに向いています。
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
