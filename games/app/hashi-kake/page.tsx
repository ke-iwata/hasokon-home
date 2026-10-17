import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';
import { mulberry32 } from '@/lib/daily';
import { generateFor, MODES } from '@/lib/hashi-kake';

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
const EXAMPLE_SEED = 20261017;
const example = generateFor('easy', mulberry32(EXAMPLE_SEED)).puzzle;

// 作品名（「橋をかけろ」「Hashiwokakero」・各アプリの商品名）は title・description・本文のどこにも書かない（仕様書の着手条件 2）
const title = '橋かけパズル｜島を数字の本数の橋でつなぐ無料ロジックパズル（今日の1問）';
const description = `島どうしを縦横の橋でつなぐロジックパズル。島の数字はそこから出る橋の本数、橋は2本まで・交差なし、最後に全部の島がつながればクリア。島の間をタップするだけで遊べます。${sizes}の3段階と毎日変わる今日の1問。答えは必ず1通り。登録不要・無料。`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/hashi-kake/` },
  robots: robotsFor('hashi-kake'),
};

const faq = [
  {
    q: 'どんなルールですか？',
    a: '橋で島をつなぐパズルです。数字の書かれた島どうしを、縦か横のまっすぐな橋でつなぎます。2つの島の間に架けられる橋は2本まで、橋はほかの橋や島と交差できません。島の数字はその島から出る橋の本数の合計です。最後に全部の島が橋で1つにつながればクリアです。',
  },
  {
    q: '必ず解けますか？',
    a: '解けます。問題は作るたびにソルバーで答えの数を数えていて、橋の架け方が1通りに決まるものだけを出しています。',
  },
  {
    q: '当てずっぽうは要りますか？',
    a: '要りません。「この島はこの本数しか架けられない」「ここに架けると交差して隣の島の本数が足りなくなる」「ここをつながないと島の集まりが孤立する」といった推理だけで最後まで解ける盤だけを出しています。',
  },
  {
    q: 'スマホでも遊べますか？',
    a: '遊べます。島と島の間をタップするたびに橋が0→1→2→0本と切り替わります。間が細くて押しにくいときは、島を1つタップしてから相手の島をタップしても架けられます。インストールも会員登録も不要です。',
  },
  {
    q: '今日の1問はいつ変わりますか？',
    a: 'お使いの端末の日付が変わる0時に変わります。日付から作る問題なので、同じ日に開いた人には全員同じ盤面が出ます。サーバーは使っていません。',
  },
  {
    q: '間違えたらどうなりますか？',
    a: '架けた瞬間にはとがめません。考えながら仮に架けてかまいません。「チェック」を押すと、数字を超えた島に×の印が付きます（正解は教えません）。「もどす」で1手ずつ戻せます。',
  },
  {
    q: '途中でページを閉じたらどうなりますか？',
    a: '架けた橋はお使いの端末のブラウザに保存していて、同じブラウザで開き直すと続きから遊べます。答えは保存していません。',
  },
  {
    q: '記録は保存されますか？',
    a: 'ベストタイムとクリア回数が、段階ごとにお使いのブラウザへ保存されます（サーバーには送信されません）。「今日の1問」はこれに加えて連続日数を保存します。今日の1問の記録は、その日の初回のクリアだけです。',
  },
];

const trail = breadcrumbFor('hashi-kake');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: '橋かけパズル',
      url: `${SITE_URL}/hashi-kake/`,
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

/** 遊び方の図（7×7 の例題と、その答え） */
function ExampleFigure() {
  const n = example.size;
  return (
    <svg className="hk-example" viewBox={`0 0 ${n} ${n}`} role="img" aria-label={`${n}×${n}の例題と、その答えの橋`}>
      {example.edges.map((e, k) => {
        const count = example.solution[k];
        if (count === 0) return null;
        const a = example.islands[e.a];
        const b = example.islands[e.b];
        const offs = count === 1 ? [0] : [-0.11, 0.11];
        return (
          <g key={`b${k}`} className="hk-bridge">
            {offs.map((o) =>
              e.horizontal ? (
                <line key={o} x1={a.c + 0.5} y1={a.r + 0.5 + o} x2={b.c + 0.5} y2={b.r + 0.5 + o} />
              ) : (
                <line key={o} x1={a.c + 0.5 + o} y1={a.r + 0.5} x2={b.c + 0.5 + o} y2={b.r + 0.5} />
              ),
            )}
          </g>
        );
      })}
      {example.islands.map((s, i) => (
        <g key={`i${i}`} className="hk-island ok">
          <circle cx={s.c + 0.5} cy={s.r + 0.5} r={0.4} />
          <text x={s.c + 0.5} y={s.r + 0.53}>
            {s.n}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>橋かけパズル</h1>
      {/* リード文は2行に収める（3行にすると盤が画面の外へ出る） */}
      <p className="lead">
        島どうしを<strong>数字の本数の橋</strong>でつなぐパズル。最後に<strong>全部の島が1つにつながれば</strong>クリアです。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊びかた</h2>
      <ol>
        <li>
          盤には<strong>数字の書かれた島</strong>が散らばっています
        </li>
        <li>
          縦か横に隣り合う（間に別の島が無い）2つの島の間に、<strong>0・1・2本</strong>の橋を架けます
        </li>
        <li>
          橋は<strong>まっすぐ</strong>で、<strong>ほかの橋や島と交差できません</strong>
        </li>
        <li>
          島の数字は、その島から出る<strong>橋の本数の合計</strong>です
        </li>
        <li>
          最後に<strong>全部の島が橋で1つにつながる</strong>とクリアです
        </li>
      </ol>
      <p>
        <strong>島と島の間をタップ</strong>するたびに、橋が 0→1→2→0 本と切り替わります。
        間が細くて押しにくいときは、<strong>島を1つタップしてから相手の島をタップ</strong>しても架けられます
        （相手の島をもう一度タップで2本目）。PCやタブレットでは、島から隣の島へなぞっても架けられます。
        スマホで 11×11 が押しにくいときは、かんたん（{MODES.easy.size}×{MODES.easy.size}）やふつう（
        {MODES.normal.size}×{MODES.normal.size}）を選んでください。
        キーボードでは Tab で島と島の間を順に移り、SpaceかEnterで本数を切り替えます（Zでもどす）。
      </p>

      <figure className="hk-example-wrap">
        <ExampleFigure />
        <figcaption>
          例題（{example.size}×{example.size}）の答え。どの島も数字の本数の橋が出ていて、全部の島が1つにつながっています。
        </figcaption>
      </figure>

      <h2>解き方のコツ</h2>
      <ul>
        <li>
          <strong>数字の大きい島、盤の角や端の島から</strong>考えます。角の島は相手が2つまでなので、
          「4」なら両方に2本ずつ、と本数がすぐ決まります
        </li>
        <li>
          <strong>「相手の数 × 2 − 1」なら全部に1本</strong>。相手が2つで「3」の島は、片方に2本架けてももう片方に1本は要るので、
          両方に少なくとも1本ずつ架けられます
        </li>
        <li>
          <strong>孤立しそうな島の集まりを先に見ます</strong>。「1」と「1」を結ぶと2つの島だけで閉じてしまうので、
          ほかの島が残っている間は結べません。逆に、そこを架けないと全体がつながらない橋は必ず架かります
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
        <strong>盤の橋（答え）は入りません</strong>。
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
          .filter((g) => g.slug !== 'hashi-kake')
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
