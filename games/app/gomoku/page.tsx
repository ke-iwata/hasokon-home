import type { Metadata } from 'next';
import Link from 'next/link';
import { games, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

// 「五目並べ」は伝統ゲームの一般名称で、商標の問題は無い（2026-08-14 時点で確認）。
// 競技ルールの名称である「連珠」は、禁じ手を実装していない以上名乗らない
// （docs/features/game-gomoku.md の「権利関係」）
const title = '五目並べ 無料｜CPU対戦（かんたん・ふつう・つよい）';
const description =
  '無料の五目並べ。13×13の盤で先に5つ並べたほうが勝ちの定番ボードゲームをCPU相手に遊べます。強さは かんたん・ふつう・つよい の3段階、先手は1局ごとに入れ替わります。待った・投了つき。インストール不要・登録不要でスマホ対応。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/gomoku/` },
};

const faq = [
  {
    q: '五目並べのルールは？',
    a: '交互に石を置いていき、縦・横・斜めのいずれかに自分の石を先に5つ並べたほうが勝ちです。一度置いた石は動かず、裏返ることもありません。盤がすべて埋まっても5つ並ばなければ引き分けです。このページの盤は13×13で、先に打つのは黒です。',
  },
  {
    q: '三三などの禁じ手はありますか？',
    a: 'このページでは禁じ手は無く、どこにでも打てます。競技として遊ばれる「連珠」では、先手（黒）だけが三三・四四・長連を打てないという禁じ手のルールがありますが、覚えることが増えるぶんカジュアルに遊ぶには重いため入れていません。先手が有利にならないよう、代わりに1局ごとに先手・後手が入れ替わります。',
  },
  {
    q: '強くなるコツは？',
    a: '両端が空いた3つの並び（活三）を作るのが基本です。放置すると両端どちらからでも4つになるため、相手は必ず受けなければなりません。さらに強いのは、1手で活三を2つ同時に作る「両取り」で、相手は片方しか止められません。守るときは、相手の3つが両端とも空くのを作らせないよう、早めに片側を止めます。',
  },
  {
    q: '先手と後手はどちらが有利ですか？',
    a: '禁じ手の無い五目並べは先手（黒）が有利とされています。このページでは1局ごとに先手・後手が自動で入れ替わるので、続けて遊ぶかぎり有利・不利は平らになります。',
  },
  {
    q: 'CPUの強さはどのくらいですか？',
    a: '「かんたん」は自分の並びだけを見て打つので、相手の3つや4つを見落とします。ルールを覚えるのに向いています。「ふつう」は自分と相手の並びの両方を見て、危ない並びは止めてきます。「つよい」は数手先まで読み、両取りのような仕掛けも見つけます。どの強さでも、5つ並ぶ手だけは必ず打ち、必ず止めます。',
  },
  {
    q: '打ち直しはできますか？',
    a: 'できます。「待った」を押すと、自分が打つ直前の局面まで戻ります。あいだのCPUの手も一緒に戻るので、手番がずれることはありません。',
  },
  {
    q: '記録は残りますか？',
    a: 'CPUの強さごとに勝敗と勝率が残ります。記録はお使いの端末のブラウザにだけ保存され、サーバーには送られません。ブラウザのデータを削除すると消えます。',
  },
];

const trail = breadcrumbFor('gomoku');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: '五目並べ',
      url: `${SITE_URL}/gomoku/`,
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

      <h1>五目並べ</h1>
      <p className="lead">
        縦・横・斜めのどれかに<strong>先に5つ並べたほうが勝ち</strong>
        の定番ボードゲーム。CPUの強さは3段階、先手は1局ごとに入れ替わります。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>空いているマスをタップ（クリック）すると、そこに石が置かれます</li>
        <li>縦・横・斜めのいずれかに自分の石が5つ並んだら勝ちです</li>
        <li>置いた石は動かず、裏返ることもありません</li>
        <li>禁じ手はありません。三三も四四も打てます</li>
        <li>盤（13×13）がすべて埋まって5つ並ばなければ引き分けです</li>
      </ol>

      <h2>コツ</h2>
      <ul>
        <li>
          <strong>両端が空いた3つ（活三）を作る。</strong>
          放置すれば両端どちらからでも4つになるので、相手は必ず受けることになります
        </li>
        <li>
          <strong>いちばん強い攻めは「両取り」。</strong>
          1手で活三を2つ同時に作ると、相手は片方しか止められません。石を2つ並べるときは、
          あとで別の方向にも伸ばせる場所を選びます
        </li>
        <li>
          <strong>守りは早めに片側を止める。</strong>
          相手の3つが両端とも空いてからでは遅いことが多いので、2つ並んだ段階で
          伸びる方向を塞いでおきます
        </li>
        <li>
          盤の端は並べられる方向が減るぶん不利になります。序盤は中央付近で戦うのが基本です
        </li>
        <li>
          受けてばかりでは勝てません。相手の手を止めるときも、
          <strong>止めながら自分の並びが伸びる場所</strong>を選びます
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
          .filter((g) => g.ready && g.slug !== 'gomoku')
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
