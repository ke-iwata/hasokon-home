import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';
import { COLS, ROWS } from '@/lib/yonmoku-narabe';

/**
 * 四目並べ（落とし込み）。仕様: docs/features/game-yonmoku-narabe.md
 *
 * 米国の玩具会社の商品名は、title・h1・description・本文のどこにも書かない（仕様書の着手条件 2）。
 * 名前とslug は運営者の J-PlatPat 確認が済むまで仮で、`stage: 'wip'` のまま止める。
 */

const title = '四目並べ 無料｜CPU対戦（かんたん・ふつう・つよい）と2人対戦';
const description =
  '縦6×横7の盤に上からコマを落とし、縦・横・斜めに4つ並べたら勝ちの「四目並べ」。CPU対戦は3段階、1台を交互に使う2人対戦もできます。列をタップするだけ、登録なしでブラウザで遊べます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/yonmoku-narabe/` },
  robots: robotsFor('yonmoku-narabe'),
};

const faq = [
  {
    q: '先手が有利？',
    a: 'はい。コンピューターで調べ尽くされていて、先手が中央の列から正しく指し続ければ必ず勝てることが知られています。そのためCPU対戦では、先手・後手を1局ごとに入れ替えています。「つよい」でも読みの深さで止めているので、工夫すれば後手でも勝てます。',
  },
  {
    q: '斜めも数える？',
    a: '数えます。縦・横に加えて、右上がり・右下がりの斜めに4つ続けて並べても勝ちです。5つ以上並んでも勝ちになります。',
  },
  {
    q: 'CPUに勝つコツは？',
    a: 'まず中央の列にコマを集めます（中央を通る並びがいちばん多いため）。次に、あと1つで4つになるマスを「上下に2つ重ねて」作ると、相手が下を塞いでも、そのすぐ上で勝てます。反対に、相手があと1つで勝てるマスの真下には置かないようにします。',
  },
];

const trail = breadcrumbFor('yonmoku-narabe');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: '四目並べ',
      url: `${SITE_URL}/yonmoku-narabe/`,
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

      <h1>四目並べ</h1>
      <p className="lead">
        列を選んで上からコマを落とし、<strong>縦・横・斜めに4つ</strong>並べたら勝ち。1局2〜5分で終わる盤のゲームです。
      </p>

      <Game />

      <h2>遊びかた</h2>
      <ol>
        <li>
          盤は縦{ROWS}×横{COLS}。列を押すと、コマがその列の<strong>いちばん下の空き</strong>に落ちます
        </li>
        <li>
          縦・横・斜めのどれかに自分のコマを<strong>4つ</strong>続けて並べたら勝ちです
        </li>
        <li>{ROWS * COLS}マスが全部埋まっても誰も並ばなければ引き分けです</li>
      </ol>

      <AdUnit position="below-tool" />

      <h2>モードと操作</h2>
      <ul>
        <li>
          <strong>CPUと対戦</strong>：かんたん・ふつう・つよいの3段階。強さごとに勝・敗・分が残ります。
          先手（黒）・後手（白）は1局ごとに入れ替わります
        </li>
        <li>
          <strong>2人で対戦</strong>：1台を交互に使って指します。先手が黒、後手が白です（記録は付けません）
        </li>
        <li>
          <strong>1手もどす</strong>：CPU対戦では自分の直前の手まで（あいだのCPUの手も一緒に）、2人で対戦では1手ぶん戻します
        </li>
        <li>
          <strong>投了</strong>：その局を負けにして終えます。続けて遊ぶときは「もう1局」
        </li>
        <li>
          スマホは列のどこを押してもその列に落ちます。パソコンはマウスを乗せた列の上にコマの影が出て、
          キーボードの ←→ で列を選び、Enter か Space で落とせます
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
          .filter((g) => g.slug !== 'yonmoku-narabe')
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
