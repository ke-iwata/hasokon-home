import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';
import { ENGLISH_MIN_MOVES, SOLVER_MAX_PEGS } from '@/lib/peg-solitaire';

/**
 * 英語圏の市販品・アプリの名前は、名称・title・description・keywords・本文のどれにも書かない
 * （docs/features/game-peg-solitaire.md の着手条件 2）。本文と図は自分の言葉と自作の SVG で書く。
 */

const title = 'ペグ・ソリティア 無料｜今日の1問と英国式33穴・三角15穴';
const description =
  '隣の駒を縦か横に飛び越えて取り、最後に1本だけ残す一人用パズル「ペグ・ソリティア」。毎日かわる今日の1問は必ず解ける局面。英国式33穴の最短は18手。ヒントと待ったつきで、登録なしでブラウザで遊べます。';

export const metadata: Metadata = {
  title,
  description,
  keywords: ['ペグ・ソリティア', 'ペグソリティア', 'ソリテア', '駒とび', '一人遊び', '脳トレ'],
  alternates: { canonical: `${SITE_URL}/peg-solitaire/` },
  robots: robotsFor('peg-solitaire'),
};

const faq = [
  {
    q: '斜めには跳べる？',
    a: '英国式33穴と今日の1問では跳べません。縦か横だけです。三角15穴は盤の形が三角なので、辺に沿った3本の線の両向き（6方向）に跳べます。',
  },
  {
    q: '最短は何手？',
    a: `英国式33穴を中央から始めて中央に1本残す場合、同じ駒で続けて跳んだ分を1手と数えると、最短は${ENGLISH_MIN_MOVES}手です。1912年にE. Bergholtが${ENGLISH_MIN_MOVES}手の解を見つけ、1964年にJ. Beasleyがそれより短くできないことを示しました。`,
  },
  {
    q: '解けない局面はある？',
    a: 'あります。途中で駒が離ればなれになると、もう1本残しには届きません。このページでは駒が16本以下になると、届かなくなった瞬間に盤の下でお知らせします（待ったで戻れます）。今日の1問は終わりから逆にたどって作っているので、最初の局面は必ず解けます。',
  },
  {
    q: 'ヒントを使うと記録はどうなる？',
    a: 'クリアの回数は数えますが、手数のベスト（最少手数）は更新しません。ヒントを使わずにクリアした回だけが最少手数の記録になります。',
  },
  {
    q: 'ヒントどおりに打ったのに印の穴に残らないのは？',
    a: 'ヒントは「どこでもよいので1本残しに届く手」を選んでいるためです。クリア（残り1本）には届きますが、印の穴（◎）に残す完全クリアになるとは限りません。',
  },
  {
    q: 'トランプのソリティアとの違いは？',
    a: 'トランプのソリティア（クロンダイク）は札を並べ替える一人遊びで、このペグ・ソリティアは盤の上の駒を跳ばして減らす一人遊びです。どちらも「ひとりで遊ぶ」という意味のソリティアから名前が来ています。',
  },
  {
    q: '記録はどこに保存されますか？',
    a: 'お使いの端末のブラウザに保存しています。サーバーには送信していないので、別の端末やブラウザでは引き継げません。',
  },
];

const trail = breadcrumbFor('peg-solitaire');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'ペグ・ソリティア',
      url: `${SITE_URL}/peg-solitaire/`,
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

/** 遊び方の図（自作）。左が跳ぶ前、右が跳んだ後 */
function RuleFigure() {
  const hole = (cx: number, peg: 'peg' | 'move' | 'none', key: string) => (
    <g key={key}>
      <circle cx={cx} cy="50" r="15" fill="var(--cell-closed)" />
      {peg !== 'none' && <circle cx={cx} cy="50" r="11" fill={peg === 'move' ? 'var(--accent)' : 'var(--text)'} />}
    </g>
  );
  return (
    <svg
      className="pg-figure"
      viewBox="0 0 340 100"
      role="img"
      aria-label="跳ぶ前と後の図。左の駒が隣の駒を飛び越えて右の空いた穴へ移り、飛び越えられた駒は取り除かれる"
    >
      {hole(30, 'move', 'a0')}
      {hole(70, 'peg', 'a1')}
      {hole(110, 'none', 'a2')}
      <path d="M30 28 Q70 0 108 26" fill="none" stroke="var(--accent)" strokeWidth="2" markerEnd="url(#pg-arrow)" />
      <text x="70" y="90" textAnchor="middle" fontSize="12" fill="var(--muted)">跳ぶ前</text>
      <text x="170" y="56" textAnchor="middle" fontSize="20" fill="var(--muted)">→</text>
      {hole(230, 'none', 'b0')}
      {hole(270, 'none', 'b1')}
      {hole(310, 'move', 'b2')}
      <text x="270" y="90" textAnchor="middle" fontSize="12" fill="var(--muted)">跳んだ後（間の駒を取る）</text>
      <defs>
        <marker id="pg-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
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

      <h1>ペグ・ソリティア</h1>
      <p className="lead">
        隣の駒を<strong>縦か横に飛び越えて取り</strong>、最後に1本だけ残す一人用のパズルです。
        トランプのソリティアは<Link href="/solitaire/">こちら</Link>。
      </p>

      <Game />

      <h2>遊びかた</h2>
      <RuleFigure />
      <ol>
        <li>駒を1つ押すと、跳べる先の穴が光ります</li>
        <li>
          光った穴を押すと、駒が<strong>隣の駒を飛び越えて</strong>その穴へ移り、飛び越えられた駒は取り除かれます。
          隣が駒で、その向こうが空いているときだけ跳べます。駒を光った穴へドラッグしても跳べます
        </li>
        <li>
          跳んだ駒がまだ跳べるときは、続けて同じ駒で跳べます。<strong>同じ駒で続けて跳んだ分は1手</strong>と数えます
        </li>
        <li>
          跳べる手がなくなったら終わりです。<strong>残り1本ならクリア</strong>、◎の印の穴に残せば<strong>完全クリア</strong>です
        </li>
        <li>
          <strong>待った</strong>は何回でも使えます。<strong>ヒント</strong>は駒が{SOLVER_MAX_PEGS}本以下になると、1本残しに届く手を1つ光らせます
        </li>
      </ol>

      <AdUnit position="below-tool" />

      <h2>3つの盤</h2>
      <ul>
        <li>
          <strong>今日の1問</strong>：英国式の盤の上に、駒10〜14本の途中の局面が出ます。日付で決まり、同じ日はだれでも同じ問題です。
          ゴールの穴に1本だけある盤から逆にたどって作っているので、<strong>必ず解けます</strong>。
          ただし最初に打てる手の半分以上は行き止まりになる局面だけを選んでいます
        </li>
        <li>
          <strong>英国式33穴</strong>：十字形の盤で、中央だけを空けて32本から始めます。中央に1本残すのが定番の目標で、
          <strong>最短は{ENGLISH_MIN_MOVES}手</strong>です
        </li>
        <li>
          <strong>三角15穴</strong>：1辺5穴の三角の盤で、上の角を空けて14本から始めます。辺に沿って6方向に跳べます。
          駒が少ないので、初めての人や子どもの入口に向いています
        </li>
      </ul>

      <h2>コツ</h2>
      <ul>
        <li>
          <strong>端に駒を残さない</strong>。盤の角や腕の先の駒は、自分から跳ぶしか取り除く方法がありません。
          早めに内側へ連れてきます
        </li>
        <li>
          <strong>「3本のかたまりを1本にする」型</strong>を探します。かたまった3本は、となりの駒を使って続けて跳ぶと、
          まとめて1本に減らせることがあります。跳ぶ順を先に数えてから打つと、行き止まりを避けられます
        </li>
        <li>駒が離ればなれになると取れなくなります。中央に駒を寄せるように減らしていきます</li>
      </ul>

      <h2>ヨーロッパ式37穴を入れていない理由</h2>
      <p>
        英国式の盤の四隅に1穴ずつ足したヨーロッパ式37穴もありますが、縦横だけに跳ぶルールで<strong>中央を空けて始めると、
        1本残しにはできない</strong>ことが証明されています。盤の穴を3種類に塗り分けると、どう跳んでも各種類の駒の数の偶奇の関係が
        変わらないためです。解けない盤を選択肢に置くと、詰まった人に理由を説明できないので、このページでは入れていません。
      </p>

      <h2>ペグ・ソリティアの由来</h2>
      <p>
        記録に残るもっとも古い例は、17世紀末のフランス・ルイ14世の宮廷です。1697年8月のフランスの雑誌『メルキュール・ギャラン』が、
        盤とルールと問題を載せたのが、印刷物で知られる最初の紹介とされています。その10年ほど後に作られた版画（クロード・オーギュスト・ベレー作）には、
        盤をかたわらに置いたスービーズ公妃が描かれています。英国式33穴の最短{ENGLISH_MIN_MOVES}手は、1912年にE. Bergholtが見つけ、
        1964年にJ. Beasleyがそれより短くできないことを示しました。
      </p>
      <p className="note">
        出典：
        <a href="https://en.wikipedia.org/wiki/Peg_solitaire" rel="noopener" target="_blank">
          Wikipedia「Peg solitaire」（英語）
        </a>
        ・J. D. Beasley『The Ins and Outs of Peg Solitaire』（Oxford University Press, 1985）・
        E. R. Berlekamp, J. H. Conway, R. K. Guy『Winning Ways for your Mathematical Plays』第4巻（第2版）
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
          .filter((g) => g.slug !== 'peg-solitaire')
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
