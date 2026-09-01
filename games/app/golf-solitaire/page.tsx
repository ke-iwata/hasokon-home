import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

const title = 'ゴルフソリティア 無料｜残り札を減らすトランプの一人遊び';
const description =
  '無料のゴルフソリティア。7列×5枚の場札から、捨て札と1つ違いの札を1枚ずつ取り除くソリティアです。ゴルフの打数のように「残り何枚か」を競います。KとAはつながらない標準ルールと、つなげるルールを切り替え可能。インストール不要・登録不要、スマホ対応で1ゲーム2〜3分。';

export const metadata: Metadata = {
  title,
  description,
  robots: robotsFor('golf-solitaire'),
  alternates: { canonical: `${SITE_URL}/golf-solitaire/` },
};

const faq = [
  {
    q: 'ゴルフソリティアはどんなゲーム？',
    a: '7列×5枚に並べた35枚のトランプから、捨て札の一番上と数字が1つ違いの札を取り除いていく一人遊びです。取れるのは各列のいちばん手前（下端）の1枚だけ。取った札がそのまま新しい捨て札になるので、つながる限り続けて取れます。場札を全部取り除ければクリアです。',
  },
  {
    q: 'なぜ「ゴルフ」という名前なのですか？',
    a: 'スポーツのゴルフが打数の少なさを競うように、このソリティアは「場に残った札の少なさ」を成績にするからです。取り切れなくても「残り8枚」「残り3枚」と結果が付くので、1回ごとにスコアが出るゲームとして遊べます。この画面でも、終わったときの残り枚数と、これまでの最少残り枚数を記録しています。',
  },
  {
    q: '最初に捨て札が置かれていないのはなぜ？',
    a: 'それがゴルフの配り方だからです。52枚を場札35枚と山札17枚でちょうど使い切るので、最初から捨て札に置く札がありません。ですから最初の1手は必ず山札をめくることになります。トライピークスは最初から捨て札が1枚出ていますが、ゴルフは逆の作法です。',
  },
  {
    q: 'AとKはつながりますか？',
    a: '標準ルールではつながりません。Kまで来ると連鎖はそこで止まります（もっとも広く遊ばれている形です）。画面上部の切り替えで「A↔Kつなぐ」を選ぶと、K→A→2 のように輪でつながるルールになり、ぐっと易しくなります。記録はルールごとに別々に保存されます。',
  },
  {
    q: '必ずクリアできますか？',
    a: 'できません。ゴルフは配りによって取り切れないものが多く、標準ルールでのクリア率は数％程度と言われています。だからこそ「残り何枚まで減らせたか」が成績になります。取り切れなくても失敗ではないので、残り枚数を減らすことを目標にしてください。配りが偏っていても、そのまま結果として成立します。',
  },
  {
    q: '山札は引き直せますか？',
    a: '引き直せません。山札は17枚を1周するだけで、使い切ったあとは取れる札があるあいだだけ続きます。取れる札も山札も無くなったら、その配りはそこで終わりです。「もどす」で何手でも戻せるので、分岐をやり直して残り枚数を詰めることはできます。',
  },
  {
    q: '連鎖（チェーン）とは何ですか？',
    a: '山札をめくらずに続けて取った枚数のことです。1枚取るごとに1つ増え、山札をめくると0に戻ります。この配りでの最長連鎖は画面上部に、これまでの最長連鎖は記録の帯に出ます。長い連鎖を作れるほど山札の消費が減り、残り枚数も減っていきます。',
  },
  {
    q: 'スマホで遊べますか？',
    a: '遊べます。操作は取りたい札をタップするだけで、ドラッグも長押しも要りません。1ゲーム2〜3分で終わるので、待ち時間にも向いています。',
  },
  {
    q: '記録は残りますか？',
    a: 'プレイ回数・クリア回数と、最少残り枚数・最長連鎖がこの端末のブラウザに保存されます。最少残り枚数と最長連鎖は、クリアできなかった配りのぶんも残ります。同じ配りをもう一度遊びたいときは、山札の横の「配り番号」を見て「同じ配りをもう一度」を押してください。',
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
        7列×5枚の場札から、<strong>捨て札と1つ違いの札</strong>
        を手前から1枚ずつ取り除くソリティア。ゴルフの打数と同じで、
        <strong>残り札が少ないほど好成績</strong>。1ゲーム2〜3分の短い一人遊びです。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>
          <strong>最初の1手は山札めくり</strong>です（配りはじめの捨て札はありません）
        </li>
        <li>捨て札の一番上と<strong>数字が1つ違い</strong>の場札をタップすると取れます（7なら6と8）</li>
        <li>
          取れるのは<strong>各列のいちばん手前（下端）の1枚</strong>だけです。取ると奥の札が手前になります
        </li>
        <li>取った札が新しい捨て札になるので、つながる限り<strong>連鎖</strong>が続きます</li>
        <li>取れる札が無くなったら山札をタップして1枚めくります（連鎖はそこで途切れます）</li>
        <li>
          標準ルールでは<strong>KとAはつながりません</strong>（Kで連鎖が止まります）。画面上部で「A↔Kつなぐ」に切り替えられます
        </li>
        <li>
          場札35枚を全部取り除けばクリア。取り切れなくても<strong>残った枚数がそのまま成績</strong>になります。山札は17枚で、引き直しはありません
        </li>
      </ol>

      <h2>コツ</h2>
      <ul>
        <li>
          <strong>長い列から崩す。</strong>
          7列を平らに減らすほうが、次に取れる札の候補を多く保てます。1列だけ深追いすると、
          残りの列が5枚のまま手詰まりになりがちです
        </li>
        <li>
          <strong>めくる前に連鎖を設計する。</strong>
          場は全部表向きなので、「この札からこう続く」と2〜3手先まで読めます。
          山札17枚をどう使うかがそのまま残り枚数に効きます
        </li>
        <li>
          <strong>KとAは詰まりの元。</strong>
          標準ルールではKで連鎖が止まり、Aは2としかつながりません。
          手前に出てきたら早めに処理して、列の底に埋めないようにします
        </li>
        <li>
          <strong>同じ数字が2列に見えているときは、長いほうを先に取る。</strong>
          短い列は最後の詰めに残しておくと、終盤の1枚が拾いやすくなります
        </li>
        <li>行き詰まっても「もどす」で何手でも戻せます。分岐を試して残り枚数を詰めましょう</li>
      </ul>

      <h2>ゴルフソリティアの由来</h2>
      <p>
        ゴルフ（Golf Solitaire）は19世紀から遊ばれている伝統的なトランプの一人遊びで、ルールにも名称にも権利者はいません。名前の由来は、スポーツのゴルフが打数の少なさを競うのと同じように、
        <strong>場に残った札の少なさを目指す</strong>
        遊び方にあります。取り切れれば「ホールインワン」ですが、それは滅多に起きないので、ふつうは「今回は残り何枚だったか」を数えて遊びます。
      </p>
      <p>
        同じ「1つ違いでつなげて消す」系統の<Link href="/tripeaks/">トライピークス</Link>
        は、このゴルフの並べ方を3つの山にしたものだと言われています。このサイトには他にも、定番の
        <Link href="/solitaire/">ソリティア（クロンダイク）</Link>、8組を揃える
        <Link href="/spider/">スパイダーソリティア</Link>、全部の札が最初から見えている
        <Link href="/freecell/">フリーセル</Link>、足して13になる2枚を取る
        <Link href="/pyramid-solitaire/">ピラミッドソリティア</Link>
        があります。並べ替えて積み上げる系（クロンダイク・スパイダー・フリーセル）と、消して崩す系（ピラミッド・トライピークス・ゴルフ）で遊び味がはっきり違うので、気分に合わせて選んでください。
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
