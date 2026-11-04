import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import { BISHOP, KING, KNIGHT, PAWN, QUEEN, ROOK } from '@/lib/chess';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import GameIcon from '@/app/GameIcon';
import Game from './Game';
import { PieceShape, PIECE_NAME } from './Pieces';

// 「チェス」は伝統ゲームの一般名称。市販品・アプリ・サービスの名称は表示名にも title にも使わない
// （docs/features/game-chess.md の着手条件 1。J-PlatPat の確認は運営者のタスクで、済むまで `wip`）。
// 本文と図は自分の言葉と自作の SVG で書く（ルールは保護されないが、解説の文と図には著作権がある）
const title = 'チェス 無料｜CPU対戦（かんたん・ふつう・つよい）と今日の1手詰め';
const description =
  '登録なしでブラウザで遊べるチェス。CPUは3段階、白・黒を選べます。駒をタップすると動ける先が光るので、駒の動き方を覚えていなくても指せます。日替わりの「今日の1手詰め」は全員同じ問題。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/chess/` },
  robots: robotsFor('chess'),
};

const faq = [
  {
    q: 'キャスリングできないのはなぜ？',
    a: 'キャスリングには条件が5つあります。キングとそのルークがまだ一度も動いていないこと、間のマスが空いていること、いまチェックされていないこと、キングが通るマスと着地するマスが相手の駒に狙われていないことです。1つでも欠けると、キングの動ける先にキャスリングのマスが出ません。',
  },
  {
    q: 'アンパッサンとは？',
    a: '相手のポーンが最初の1手で2マス進み、自分のポーンの真横に並んだとき、その直後の1手に限って、1マスだけ進んだものとみなして斜めに取れる特別な取り方です。次の手まで待つと取れなくなります。',
  },
  {
    q: 'ポーンが端に着いたら？',
    a: 'いちばん奥の段に着いたポーンは、クイーン・ルーク・ビショップ・ナイトのどれかに必ず成ります（プロモーション）。このページでは行き先のマスの上に4つの駒が並ぶので、タップで選びます。ほとんどの場合はクイーンが最も強い選択です。',
  },
  {
    q: 'ステイルメイトは勝ち？',
    a: '勝ちではなく引き分けです。手番の側がチェックされていないのに、ルール上動かせる手が1つも無い状態をステイルメイトといいます。駒が大きく勝っている側がうっかり相手を動けなくすると引き分けになるので、終盤は気をつけましょう。',
  },
  {
    q: "CPUの『つよい』はどれくらい強い？",
    a: '「つよい」は1手につき0.4秒まで、深さを少しずつ増やしながら数手先を読み、取り合いは最後まで確かめます。駒の損得とマスの良し悪しで局面を評価する自作の読みで、初級から中級の人が考えて指せば勝てる強さを目安にしています。「ふつう」は3手先まで、「かんたん」は1手だけを見て乱数で選びます。',
  },
  {
    q: '今日の1手詰めの答えは？',
    a: '1手で相手のキングをチェックメイトにする手が、ちょうど1つだけある局面が出ます。外れた手を指すと正解の手を矢印で示すので、答えを知りたいときは一度指してみてください。問題は日付ごとに全員同じで、記録（連続日数）は最初の1回で付きます。',
  },
];

const trail = breadcrumbFor('chess');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'チェス',
      url: `${SITE_URL}/chess/`,
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

/**
 * 駒の動き方の図（自作の SVG）。5×5 の盤の中央に駒を置き、動ける先に点を打つ。
 * `ray` は走り駒（盤の端まで進める）。ポーンは前に 1 マス（最初だけ 2 マス）と斜め前の取り
 */
type Diagram = { kind: number; steps: [number, number][]; ray: boolean; captures?: [number, number][] };

const DIAGRAMS: Diagram[] = [
  { kind: KING, steps: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]], ray: false },
  { kind: QUEEN, steps: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]], ray: true },
  { kind: ROOK, steps: [[-1, 0], [1, 0], [0, -1], [0, 1]], ray: true },
  { kind: BISHOP, steps: [[-1, -1], [-1, 1], [1, -1], [1, 1]], ray: true },
  { kind: KNIGHT, steps: [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]], ray: false },
  { kind: PAWN, steps: [[-1, 0], [-2, 0]], ray: false, captures: [[-1, -1], [-1, 1]] },
];

const MOVE_TEXT: Record<number, string> = {
  [KING]: 'まわりの8マスのどこへでも1マスだけ。取られるマスへは動けません',
  [QUEEN]: '縦・横・斜めに、ほかの駒にぶつかるまで何マスでも',
  [ROOK]: '縦・横に、ほかの駒にぶつかるまで何マスでも',
  [BISHOP]: '斜めに、ほかの駒にぶつかるまで何マスでも。ずっと同じ色のマスを進みます',
  [KNIGHT]: '縦横に2マス進んで横へ1マス（L字）。間の駒を飛び越せる唯一の駒です',
  [PAWN]: '前に1マス（最初の1手だけ2マスも可）。取るときだけ斜め前に1マス。後ろには戻れません',
};

function MoveDiagram({ d }: { d: Diagram }) {
  const N = 5;
  const c = 2;
  const pawnStart = d.kind === PAWN;
  const row = pawnStart ? 3 : c;
  const dots: { r: number; col: number; capture: boolean }[] = [];
  for (const [dr, dc] of d.steps) {
    let r = row + dr;
    let col = c + dc;
    while (r >= 0 && r < N && col >= 0 && col < N) {
      dots.push({ r, col, capture: false });
      if (!d.ray) break;
      r += dr;
      col += dc;
    }
  }
  for (const [dr, dc] of d.captures ?? []) dots.push({ r: row + dr, col: c + dc, capture: true });
  return (
    <svg className="ch-diagram" viewBox={`0 0 ${N} ${N}`} role="img" aria-label={`${PIECE_NAME[d.kind]}の動き方`}>
      {Array.from({ length: N * N }, (_, i) => (
        <rect
          key={i}
          className={`ch-sq ${(Math.floor(i / N) + (i % N)) % 2 === 1 ? 'dark' : 'light'}`}
          x={i % N}
          y={Math.floor(i / N)}
          width={1}
          height={1}
        />
      ))}
      {dots.map((p) =>
        p.capture ? (
          <circle key={`${p.r}-${p.col}`} className="ch-ring" cx={p.col + 0.5} cy={p.r + 0.5} r={0.42} />
        ) : (
          <circle key={`${p.r}-${p.col}`} className="ch-dot" cx={p.col + 0.5} cy={p.r + 0.5} r={0.16} />
        ),
      )}
      <g transform={`translate(${c} ${row}) scale(0.01)`}>
        <PieceShape piece={d.kind} />
      </g>
    </svg>
  );
}

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>チェス</h1>
      <p className="lead">
        CPUと指すチェス。<strong>駒をタップすると動ける先が光る</strong>ので、駒の動き方を覚えていなくても1局指し切れます。日替わりの「今日の1手詰め」つき。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>「CPU対戦」で強さ（かんたん・ふつう・つよい）と色（白は先手・黒は後手）を選び、スタートを押します</li>
        <li>自分の駒をタップすると、動ける先に丸（取れる先は輪）が出ます。行き先をタップすると指せます。PCではドラッグでも動かせます</li>
        <li>相手のキングを、どこへ逃げても取られる状態（チェックメイト）にしたほうの勝ちです</li>
        <li>「1手もどす」は自分の手とCPUの手を1組戻します。何回でも使えますが、使った対局は戦績に残りません。「投了」で負けを認めて終われます</li>
        <li>「今日の1手詰め」は、1手でチェックメイトにする手を当てる日替わりの問題です。全員同じ問題で、連続日数が記録されます</li>
      </ol>

      <h2>駒の動き方</h2>
      <p>白と黒が同じ16個の駒（キング1・クイーン1・ルーク2・ビショップ2・ナイト2・ポーン8）を持って始めます。白が先に指します。</p>
      <div className="ch-diagrams">
        {DIAGRAMS.map((d) => (
          <figure key={d.kind} className="ch-diagram-fig">
            <MoveDiagram d={d} />
            <figcaption>
              <strong>{PIECE_NAME[d.kind]}</strong>：{MOVE_TEXT[d.kind]}
            </figcaption>
          </figure>
        ))}
      </div>

      <h2>特別な3つの動き</h2>
      <h3>キャスリング</h3>
      <p>
        キングを横に2マス動かし、その側のルークをキングの反対側の隣へ移す、1手で2つの駒を動かす手です。キングを隅へ守りに入れ、ルークを中央へ出せます。
        キングとそのルークが一度も動いていない・間が空いている・いまチェックされていない・キングが通るマスと着地するマスが狙われていない、のすべてがそろったときだけできます。
        このページではキングをタップすると、2マス横にキャスリングの行き先が出ます。
      </p>
      <h3>アンパッサン</h3>
      <p>
        相手のポーンが最初の1手で2マス進んで自分のポーンの真横に来たとき、直後の1手に限り、1マスだけ進んだものとして斜め前に取れます。次の手まで待つと権利は消えます。
      </p>
      <h3>プロモーション（昇格）</h3>
      <p>
        ポーンがいちばん奥の段まで進むと、クイーン・ルーク・ビショップ・ナイトのどれかに成ります。行き先のマスの上に4つの駒が縦に並ぶので、タップで選びます。
      </p>

      <h2>チェック・チェックメイト・ステイルメイトの違い</h2>
      <ul>
        <li>
          <strong>チェック</strong>：キングが相手の駒に狙われている状態。次の手で必ず逃げるか、間に駒を置くか、狙っている駒を取らなければいけません（盤ではキングのマスが赤く縁取られます）
        </li>
        <li>
          <strong>チェックメイト</strong>：チェックされていて、どう指してもそれを外せない状態。チェックメイトにしたほうの勝ちです
        </li>
        <li>
          <strong>ステイルメイト</strong>：チェックされていないのに、ルール上動かせる手が1つも無い状態。勝ちではなく<strong>引き分け</strong>です
        </li>
      </ul>

      <h2>引き分けになる場合</h2>
      <ul>
        <li>ステイルメイト</li>
        <li>同じ局面（駒の配置・手番・キャスリングとアンパッサンの権利）が3回現れたとき</li>
        <li>50手ルール：双方50手ずつ、ポーンの移動も駒の取りも無かったとき</li>
        <li>駒不足：キング同士だけ、キング＋ビショップ1つ対キング、キング＋ナイト1つ対キングなど、どちらもチェックメイトにできない駒しか残っていないとき</li>
      </ul>
      <p>
        国際チェス連盟（FIDE）の競技規則では、同一局面3回と50手ルールは対局者が申し出て引き分けにするものですが、CPU対戦では申し出の操作を置かず、自動で引き分けにしています。
      </p>

      <h2>チェスの由来</h2>
      <p>
        チェスの祖先は、6世紀ごろのインドの盤上遊戯「チャトランガ」と考えられています。ペルシャを経てイスラム世界に広まり、10世紀ごろまでにヨーロッパへ伝わりました。
        クイーンとビショップが今のように遠くまで動けるようになったのは15世紀末のヨーロッパで、ここで現在のルールの骨組みができました。
        国際的な競技団体は1924年に設立された国際チェス連盟（FIDE）で、日本では日本チェス連盟が普及と大会の運営をしています。
      </p>
      <p className="note">
        出典：Encyclopaedia Britannica「chess」（https://www.britannica.com/topic/chess）／FIDE「About FIDE」（https://www.fide.com/）／日本チェス連盟（https://japanchess.org/）
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
          .filter((g) => g.slug !== 'chess')
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
