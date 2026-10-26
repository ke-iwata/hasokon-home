import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';
import { SEEDS_PER_PIT, TOTAL_STONES } from '@/lib/mancala';

/**
 * 「マンカラ・カラハ」の並び（市販の盤の商品名）と、日本レクリエーション協会の変種の名前は使わない
 * （docs/features/game-mancala.md の着手条件 2）。協会のルール表は出典として名前と URL を示すだけにし、
 * 本文と図は自分の言葉と自作の SVG で書く。
 *
 * 先手の有利の「何個差か」は、出典の論文で確かめられなかったので書かない（仕様書の「先手の有利」）。
 */

const title = 'マンカラ 無料｜CPU対戦（やさしい・ふつう・つよい）と今日の1手番';
const description =
  '石を反時計回りに配ってゴールに集める伝統の「マンカラ（カラハ）」。CPU対戦は3段階、先手・後手は交互。日替わりの「今日の1手番」は全員同じ局面。穴をタップするだけで、登録なしでブラウザで遊べます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/mancala/` },
  robots: robotsFor('mancala'),
};

const faq = [
  {
    q: '向かいが空のときは取れる？',
    a: '取れません。最後の石が自分の陣地の空の穴で止まっても、向かいの穴に石が無ければ横取りにはならず、最後の1個はその穴に残って相手の番になります。',
  },
  {
    q: '石が13個以上のときは？',
    a: '盤を一周します。相手のゴールは飛ばし、取り出した元の穴にも1個置いて先へ進みます。一周して自分の陣地の空の穴で止まれば、横取りもできます。',
  },
  {
    q: '最後に残った石は誰のもの？',
    a: 'どちらかの陣地の穴がすべて空になった時点で終わり、残っている石はその陣地の持ち主のゴールに入ります。そのうえでゴールの石が多いほうの勝ちです。',
  },
  {
    q: '先手と後手どちらが有利？',
    a: `1穴${SEEDS_PER_PIT}個で始めるカラハは、両者が最善を尽くすと先手が勝つことが知られています。そのためCPU対戦では、先手・後手を1局ごとに入れ替えています（選び直すこともできます）。`,
  },
  {
    q: '今日の1手番の答えは？',
    a: '日付から決まる局面で、1回の手番（「もう1回」の続きを含む）で自分のゴールに入れられる最大の数を、全部の撒き順を調べて出しています。届かなかったときは、最大に届く撒き順を1つ表示します。同じ日に開いた人には全員同じ局面が出ます。',
  },
  {
    q: '記録はどこに保存されますか？',
    a: 'お使いの端末のブラウザに保存しています。サーバーには送信していないので、別の端末やブラウザでは引き継げません。',
  },
  {
    q: 'キーボードでも遊べますか？',
    a: '遊べます。1〜6のキーで、自分の穴を左から順に選んで撒けます。',
  },
];

const trail = breadcrumbFor('mancala');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'マンカラ',
      url: `${SITE_URL}/mancala/`,
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

/** 遊び方の図（自作）。下が自分の列で、石は反時計回りに進む */
function RuleFigure() {
  const pit = (cx: number, cy: number, n: number, key: string) => (
    <g key={key}>
      <circle cx={cx} cy={cy} r="15" fill="var(--cell-open)" stroke="var(--border)" />
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize="13" fill="var(--text)">
        {n}
      </text>
    </g>
  );
  const xs = [70, 110, 150, 190, 230, 270];
  return (
    <svg className="mc-figure" viewBox="0 0 340 130" role="img" aria-label="マンカラの盤の図。下の列が自分の穴で右端が自分のゴール。石は下の列を左から右へ、自分のゴール、上の列を右から左へと反時計回りに進む">
      <rect x="4" y="20" width="32" height="90" rx="14" fill="none" stroke="var(--border)" />
      <rect x="304" y="20" width="32" height="90" rx="14" fill="none" stroke="var(--accent)" strokeWidth="2" />
      <text x="20" y="70" textAnchor="middle" fontSize="11" fill="var(--muted)">相手</text>
      <text x="320" y="70" textAnchor="middle" fontSize="11" fill="var(--accent)">自分</text>
      {xs.map((x, i) => pit(x, 40, SEEDS_PER_PIT, `t${i}`))}
      {xs.map((x, i) => pit(x, 90, SEEDS_PER_PIT, `b${i}`))}
      <path d="M60 118 H290 Q300 118 300 105" fill="none" stroke="var(--accent)" strokeWidth="1.5" markerEnd="url(#mc-arrow)" />
      <path d="M300 25 Q300 12 290 12 H50" fill="none" stroke="var(--accent)" strokeWidth="1.5" markerEnd="url(#mc-arrow)" />
      <defs>
        <marker id="mc-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--accent)" />
        </marker>
      </defs>
    </svg>
  );
}

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>マンカラ</h1>
      <p className="lead">
        穴の石を<strong>反時計回りに1個ずつ</strong>配って、自分のゴールに多く集めたほうが勝ち。伝統の石まき遊び「カラハ」です。
      </p>

      <Game />

      <h2>遊びかた</h2>
      <RuleFigure />
      <ol>
        <li>
          盤には1人6つの穴と、両端にゴールが1つずつあります。下の列が<strong>あなたの穴</strong>、右（スマホでは下の帯）が
          <strong>あなたのゴール</strong>です。はじめは各穴に{SEEDS_PER_PIT}個、全部で{TOTAL_STONES}個の石が入っています
        </li>
        <li>
          自分の穴を1つ押すと、中の石を全部取って、<strong>右隣から反時計回りに1個ずつ</strong>置いていきます。
          自分のゴールには入れ、相手のゴールは飛ばします
        </li>
        <li>
          最後の石が<strong>自分のゴール</strong>で止まったら「もう1回」。続けてもう一度撒けます
        </li>
        <li>
          最後の石が<strong>自分の陣地の空の穴</strong>で止まり、向かいの穴に石があれば「横取り」。
          向かいの石と最後の1個を自分のゴールに入れます
        </li>
        <li>
          どちらかの陣地の穴が全部空になったら終わり。残った石はその陣地の持ち主のゴールに入り、ゴールの石が多いほうの勝ちです
        </li>
      </ol>

      <AdUnit position="below-tool" />

      <h2>「もう1回」と「横取り」のコツ</h2>
      <ul>
        <li>
          ゴールまでの距離と石の数が同じ穴は、撒けば<strong>ちょうどゴールで止まる</strong>（右端の穴なら1個、その左なら2個…）。
          まずこれを探すと、1回の手番で何度も撒けます
        </li>
        <li>「もう1回」をつなぐときは、右側の穴から先に撒くと、左の穴の石の数がずれずに残ります</li>
        <li>
          相手の穴に石がたまっていたら、その向かいの<strong>自分の空の穴</strong>で止まる手が無いか探します。
          反対に、自分の大きな山の向かいが相手の空の穴になっていたら、狙われていないか気をつけます
        </li>
        <li>終わりが近づいたら、自分の陣地に石を残しておくと、終局のときにその石が自分の得点になります</li>
      </ul>

      <h2>先手の有利</h2>
      <p>
        1穴{SEEDS_PER_PIT}個で始めるカラハは、コンピューターで調べ尽くされていて、
        両者が最善を尽くすと<strong>先手が勝つ</strong>ことが知られています。
        このページのCPU対戦では、最初の1局をあなたの先手にし、そのあとは1局ごとに先手・後手を入れ替えます。
      </p>

      <h2>モード</h2>
      <ul>
        <li>
          <strong>CPUと対戦</strong>：やさしい・ふつう・つよいの3段階。強さごとに戦績が残ります
        </li>
        <li>
          <strong>今日の1手番</strong>：日付から決まる途中の局面で、1回の手番（「もう1回」の続きを含む）で
          自分のゴールに最大何個入れられるかに挑みます。最大に届くには「もう1回」を2回以上つなぐ必要があり、
          届けばクリアで連続日数が残ります
        </li>
      </ul>

      <h2>マンカラの由来</h2>
      <p>
        マンカラは、アフリカ・中東・アジアに広く伝わる「石（豆）まき」型の遊びの総称で、紀元前にさかのぼるとされます。
        名前はアラビア語の「動く（naqala）」に由来するといわれます。カラハはその一種で、日本では日本レクリエーション協会が普及を進めています。
        このページのルールは協会のルール表「カラハ」に合わせています。
      </p>
      <p className="note">
        出典：
        <a href="https://recreation.or.jp/WP_ORJP/wp-content/uploads/mancala_kalah.pdf" rel="noopener" target="_blank">
          公益財団法人 日本レクリエーション協会「マンカラ カラハ」ルール表（PDF）
        </a>
        ・
        <a href="https://ja.wikipedia.org/wiki/%E3%83%9E%E3%83%B3%E3%82%AB%E3%83%A9" rel="noopener" target="_blank">
          Wikipedia「マンカラ」
        </a>
        ・
        <a href="https://en.wikipedia.org/wiki/Kalah" rel="noopener" target="_blank">
          Wikipedia「Kalah」（英語）
        </a>
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
          .filter((g) => g.slug !== 'mancala')
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
