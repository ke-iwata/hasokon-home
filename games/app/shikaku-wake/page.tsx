import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';
import { mulberry32 } from '@/lib/daily';
import { assignColors, generateFor, MODES } from '@/lib/shikaku-wake';

/**
 * 盤の大きさは**設定から引く**（ページの文言に数字を書き写さない）。
 * 段階を足したり大きさを変えたりしたときに、解説だけが古い数字で残るのを防ぐ。
 */
const sizes = `${MODES.easy.size}×${MODES.easy.size}〜${MODES.hard.size}×${MODES.hard.size}`;
const dailySize = `${MODES.daily.size}×${MODES.daily.size}`;

/**
 * 遊び方の図の例題。**生成器の出力から固定で 1 つ選ぶ**（他の本・サイトの問題を写さない）。
 * 種を変えると図が変わるだけで、ゲームの盤には影響しない
 */
const EXAMPLE_SEED = 20261016;
const example = generateFor('easy', mulberry32(EXAMPLE_SEED)).puzzle;
const exampleColors = assignColors(example.solution);

// 作品名（「四角に切れ」「Shikaku」「Patches」）は title・description・本文のどこにも書かない（仕様書の「権利面の確認」）
const title = '四角わけパズル｜数字の広さの長方形に区切る無料ロジックパズル（今日の1問）';
const description = `盤を長方形に切り分けるロジックパズル。どの四角にも数字が1つ、数字はその四角のマス数。2つのマスをタップするだけで四角が引けます。${sizes}の3段階と毎日変わる今日の1問。答えは必ず1通り。登録不要・無料。`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/shikaku-wake/` },
  robots: robotsFor('shikaku-wake'),
};

const faq = [
  {
    q: 'どんなルールですか？',
    a: '盤全体を、縦横の線に沿った長方形（正方形も含みます）に隙間も重なりもなく切り分けます。どの四角にも数字がちょうど1つ入り、その数字が四角のマス数になります。全部のマスが四角に入り、すべての四角が決まりを満たすとクリアです。',
  },
  {
    q: '必ず解けますか？',
    a: '解けます。問題は作るたびにソルバーで答えの数を数えていて、区切り方が1通りに決まるものだけを出しています。',
  },
  {
    q: '当てずっぽうは要りますか？',
    a: '要りません。「この数字はこの形しか置けない」「このマスはこの数字しか届かない」といった推理だけで最後まで解ける盤だけを出しています。',
  },
  {
    q: 'スマホでも遊べますか？',
    a: '遊べます。四角の角にしたいマスを1回タップし、反対側の角のマスをもう1回タップすると四角が引けます。細かくなぞる必要はありません（なぞっても引けます）。インストールも会員登録も不要です。',
  },
  {
    q: '今日の1問はいつ変わりますか？',
    a: 'お使いの端末の日付が変わる0時に変わります。日付から作る問題なので、同じ日に開いた人には全員同じ盤面が出ます。サーバーは使っていません。',
  },
  {
    q: '間違えたらどうなりますか？',
    a: '引いた瞬間にはとがめません。考えながら仮に置いてかまいません。「チェック」を押すと、決まりに合わない四角に×の印が付きます（正解は教えません）。「もどす」で1手ずつ戻せます。',
  },
  {
    q: '途中でページを閉じたらどうなりますか？',
    a: '引いた四角はお使いの端末のブラウザに保存していて、同じブラウザで開き直すと続きから遊べます。答えは保存していません。',
  },
  {
    q: '記録は保存されますか？',
    a: 'ベストタイムとクリア回数が、段階ごとにお使いのブラウザへ保存されます（サーバーには送信されません）。「今日の1問」はこれに加えて連続日数を保存します。今日の1問の記録は、その日の初回のクリアだけです。',
  },
];

const trail = breadcrumbFor('shikaku-wake');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: '四角わけパズル',
      url: `${SITE_URL}/shikaku-wake/`,
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

/** 遊び方の図（5×5 の例題と、その区切り） */
function ExampleFigure() {
  const n = example.size;
  return (
    <svg
      className="sw-example"
      viewBox={`-0.1 -0.1 ${n + 0.2} ${n + 0.2}`}
      role="img"
      aria-label={`${n}×${n}の例題と、その区切り方`}
    >
      {example.solution.map((r, i) => (
        <rect
          key={`f${i}`}
          className={`sw-r${exampleColors[i]}`}
          x={r.c0}
          y={r.r0}
          width={r.c1 - r.c0 + 1}
          height={r.r1 - r.r0 + 1}
        />
      ))}
      {Array.from({ length: n + 1 }, (_, i) => (
        <g key={`g${i}`} className="sw-example-grid">
          <line x1={0} y1={i} x2={n} y2={i} />
          <line x1={i} y1={0} x2={i} y2={n} />
        </g>
      ))}
      {example.solution.map((r, i) => (
        <rect
          key={`e${i}`}
          className="sw-edge"
          x={r.c0 + 0.06}
          y={r.r0 + 0.06}
          width={r.c1 - r.c0 + 1 - 0.12}
          height={r.r1 - r.r0 + 1 - 0.12}
          rx={0.12}
        />
      ))}
      {example.clues.map((v, cell) =>
        v > 0 ? (
          <text
            key={`n${cell}`}
            className="sw-example-num"
            x={(cell % n) + 0.5}
            y={Math.floor(cell / n) + 0.5}
          >
            {v}
          </text>
        ) : null,
      )}
    </svg>
  );
}

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>四角わけパズル</h1>
      {/* リード文は2行に収める（3行にすると盤が画面の外へ出る） */}
      <p className="lead">
        盤を<strong>長方形に切り分ける</strong>パズル。どの四角にも数字が1つ、
        <strong>数字はその四角のマス数</strong>です。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊びかた</h2>
      <ol>
        <li>
          盤全体を、<strong>縦横の線に沿った長方形</strong>（正方形も含む）に、隙間も重なりもなく切り分けます
        </li>
        <li>
          どの四角にも<strong>数字がちょうど1つ</strong>入ります
        </li>
        <li>
          数字は、その四角の<strong>マス数</strong>です（「6」なら 2×3・3×2・1×6・6×1 のどれか）
        </li>
        <li>
          四角は、<strong>角にしたいマスを1回タップし、反対側の角のマスをもう1回タップ</strong>すると引けます。
          指やマウスでなぞっても引けます
        </li>
        <li>
          同じマスを2回タップすると1マスの四角です。<strong>四角の中のマスを2回タップするとその四角が消えます</strong>
          （四角の中に1マスの四角を作るときは、先にその四角を消します）
        </li>
      </ol>
      <p>
        新しく引いた四角が前の四角と重なると、前の方が消えて置き換わります。
        「もどす」を1回押せば、置き換えで消えた四角もまとめて元に戻ります。
        PCでは盤をクリックしてから、矢印キーで動き、SpaceかEnterで角を置いてもう一度で四角を引けます
        （Deleteで消す、Escで角の取り消し、Zでもどす）。
      </p>

      <figure className="sw-example-wrap">
        <ExampleFigure />
        <figcaption>
          例題（{example.size}×{example.size}）の答え。どの四角にも数字が1つで、数字が四角のマス数になっています。
        </figcaption>
      </figure>

      <h2>解き方のコツ</h2>
      <ul>
        <li>
          <strong>数字の大きい、盤の角や端にある数字から</strong>考えます。端に寄った大きい数字は、
          はみ出さない置き方が少なく形がすぐ決まります
        </li>
        <li>
          <strong>置き方が1つしか無い数字から</strong>決めていきます。ほかの数字を含んでしまう置き方は使えないので、
          まわりに数字が多いほど候補は減ります
        </li>
        <li>
          <strong>1と2は形がほぼ決まります</strong>。1はそのマスだけ、2は縦か横の2マスです。
          逆に、どの数字からも届かないマスが残りそうなら、そのマスに届く数字の形が決まります
        </li>
      </ul>

      <h2>今日の1問と連続日数</h2>
      <p>
        「今日の1問」は<strong>日付から組み立てる、その日だけの問題</strong>（{dailySize}）です。
        同じ日に開いた人には全員同じ盤面が出ます。クリアすると
        <strong>連続日数</strong>が1つ増え、1日空けると1に戻ります。
        サーバーもアカウントも使っていないので、
        <strong>連続日数はお使いの端末のブラウザにだけ残ります</strong>。
        クリア後の「結果をコピー」で共有できる文面には、
        <strong>盤の区切り（答え）は入りません</strong>。
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
          .filter((g) => g.slug !== 'shikaku-wake')
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
