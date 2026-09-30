import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';
import { MATCH_POINTS, MOON_POINTS } from '@/lib/hearts';

// ハーツのルールは公有で、「ハーツ」は一般名（docs/features/game-hearts.md の「名称と権利」）。
// 「Windows」は Microsoft の商標なので、title・H1・description の先頭・JSON-LD の name には入れない。
// 本文で「Windows のハーツで遊んだ人向けに」と説明として使う 1 か所だけにする（#303 レビュー 6）
const title = 'ハーツ（トランプ）無料｜ハートと♠Qを避けるCPU対戦';
const description =
  '無料で遊べるトランプの「ハーツ」。CPU 3人と4人で、ハートと♠Qを取らないように1枚ずつ出していきます。パス・ハートブレイク・シュートザムーンに対応し、1局だけでも100点までの試合でも遊べます。インストール不要・登録不要でスマホ対応、成績はこの端末に保存されます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/hearts/` },
  robots: robotsFor('hearts'),
};

const faq = [
  {
    q: 'ハートブレイクとは何ですか？',
    a: 'ハートは、誰かが台札のスートを持っていなくてハートを捨てるまで、リード（トリックの最初の1枚）に使えません。ハートが初めて捨てられた瞬間を「ハートが割れる」「ハートブレイク」と呼び、それ以降は自由にハートからリードできます。手札がハートだけになったときは例外で、割れる前でもハートからリードできます。♠Qを出してもハートは割れません。',
  },
  {
    q: '♠Qはなぜ13点なのですか？',
    a: `ハーツはハート13枚（1枚1点）と♠Q（13点）の合計${MOON_POINTS}点を押しつけ合うゲームで、♠Qはハート全部と同じ重さを持つ「いちばん取りたくない札」です。♠Qを持っている人は、♠A・♠Kを持つ人のトリックに捨てたい。持っていない人は、低い♠をリードして♠Qを早く引き出したい。この駆け引きがハーツの中心です。`,
  },
  {
    q: 'シュートザムーンの条件は何ですか？',
    a: `1局の中で、ハート13枚と♠Qの${MOON_POINTS}点を1人ですべて取ることです。決めた人はその局0点で、ほかの3人に${MOON_POINTS}点ずつ入ります。1枚でもハートをほかの人に取られると成立しないので、狙うのは手札が強いときだけにしましょう。CPUの強さ「つよい」は、点が1人に偏ってくるとハートを取りに行って止めに来ます。`,
  },
  {
    q: 'パスの向きの順番は？',
    a: '局のはじめに手札から3枚を選んで渡します。向きは1局目が左（CPU 左）、2局目が右（CPU 右）、3局目が向かい（CPU 正面）、4局目はパス無しで、5局目からまた左に戻ります。受け取った札は、トリックの上の1行に出ます。',
  },
  {
    q: 'Windowsのハーツとの違いは？',
    a: `Windows のハーツで遊んだ人向けに、同じ基本ルール（パスの向き・ハートブレイク・♠Q 13点・シュートザムーン・${MATCH_POINTS}点で終了）で作っています。画面や札の絵柄は当サイトのオリジナルです。最初のトリックにハートと♠Qを出せないルールも入れています。♦Jでマイナス10点になるような派生ルールはありません。`,
  },
  {
    q: '記録は残りますか？',
    a: '「1局で終える」「100点まで」のそれぞれで、勝ち（最少点。同点を含む）の数と試合数、1試合の中でシュートザムーンを決めた回数の最多が残ります。記録はお使いの端末のブラウザにだけ保存され、サーバーには送られません。',
  },
];

const trail = breadcrumbFor('hearts');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'ハーツ（トランプ）',
      url: `${SITE_URL}/hearts/`,
      gamePlatform: 'Web Browser',
      applicationCategory: 'Game',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 1 },
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

      <h1>ハーツ</h1>
      <p className="lead">
        <strong>ハートと♠Qを取らないように</strong>1枚ずつ出していく、4人で遊ぶトランプの定番。
        CPU 3人と対戦して、点がいちばん少ない人の勝ちです。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>52枚を4人に13枚ずつ配ります（ジョーカーは使いません）</li>
        <li>
          局のはじめに<strong>パス</strong>：手札から3枚を選んで「渡す」を押します。
          向きは 左 → 右 → 向かい → パス無し の順に回ります
        </li>
        <li>♣2を持っている人が、♣2を出して最初のトリックを始めます</li>
        <li>
          ほかの人は時計回りに1枚ずつ出します。台札と同じスートを持っていれば、必ずそれを出します
          （<strong>フォロー</strong>）。持っていなければ何を捨ててもかまいません
        </li>
        <li>
          台札のスートでいちばん強い札（A が最強、2 が最弱）を出した人がトリックを取り、次を出します。
          切り札はありません
        </li>
        <li>
          13トリックで1局。取ったトリックの中のハートは1枚1点、♠Qは13点です。
          {MATCH_POINTS}点に達した人が出た局で試合が終わり、<strong>点がいちばん少ない人の勝ち</strong>です
        </li>
      </ol>

      <h2>このページのルール</h2>
      <ul>
        <li>
          <strong>ハートブレイク</strong>：誰かがハートを捨てるまで、ハートからはリードできません
          （手札がハートだけのときは例外）
        </li>
        <li>
          最初のトリックには、ハートと♠Qを出せません。
          ♣が無ければ♦や♠Q以外の♠を出し、それも無いとき（手札がハートと♠Qだけ）に限って出せます
        </li>
        <li>
          <strong>シュートザムーン</strong>：1人で{MOON_POINTS}点すべてを取ると、その人は0点、
          ほかの3人に{MOON_POINTS}点ずつ入ります
        </li>
        <li>設定で「1局で終える」を選ぶと、1局の点だけで勝ち負けを決めます</li>
        <li>同じ点の人は同じ順位です。あなたが最少点（同点を含む）なら勝ちとして記録します</li>
      </ul>

      <h2>コツ</h2>
      <ul>
        <li>
          <strong>パスでは♠A・♠K・♠Qと高いハートを手放す。</strong>
          ただし♠が4枚以上あるなら、♠Qは低い♠に守られるので持っていてもかまいません
        </li>
        <li>
          <strong>1つのスートを早く切らす。</strong>
          スートが無くなれば、そのスートのトリックで♠Qや高いハートを捨てられます
        </li>
        <li>
          <strong>♠Qを持っていないなら低い♠でリードする。</strong>
          持っている人に♠Qを出させる（誰かに取らせる）きっかけになります
        </li>
        <li>
          <strong>取らずに済む範囲でいちばん高い札を出す。</strong>
          高い札を残すと、終盤にまとめて点を取らされます
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
          .filter((g) => g.slug !== 'hearts')
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
