import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';
import { DIFFICULTIES, HINT_AFTER_MS, HINT_PENALTY_MS } from '@/lib/machigai-sagashi';

/**
 * 数（図形の数・違いの数・ヒントの秒数）は**設定から引く**（ページの文言に数字を書き写さない）。
 * 難易度を変えたときに、解説だけが古い数字で残るのを防ぐ。
 */
const { easy, normal, hard } = DIFFICULTIES;
const hintAfter = HINT_AFTER_MS / 1000;
const penalty = HINT_PENALTY_MS / 1000;

const title = '間違い探し — 左右2枚の絵から5つの違いを見つける脳トレ。毎日変わる今日の1枚つき';
const description = `無料の間違い探し。左右2枚の絵を見比べて、${normal.differences}つの違いを見つける脳トレです。今日の1枚は全員同じ絵で、何秒で見つけたかを競えます。やさしい（違い${easy.differences}つ）〜むずかしい（図形${hard.shapes}個）のエンドレスつき。インストール不要でスマホからもすぐ遊べます。`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/machigai-sagashi/` },
  robots: robotsFor('machigai-sagashi'),
};

const faq = [
  {
    q: '毎日同じ絵ですか？',
    a: '「今日の1枚」は日付から作る、その日だけの絵です。同じ日に開いた人には全員同じ絵が出て、日付が変わると新しい絵になります。やさしい・ふつう・むずかしいは、遊ぶたびに新しい絵を作ります。',
  },
  {
    q: '色の違いが分かりにくいです',
    a: `色だけで見分ける違いは1枚に多くても1つにしています。残りの違いは、形の大きさ・向き・位置・模様（しま・水玉）の有無・図形が増えた／消えたで作っているので、色が見分けにくくても見つけられます。`,
  },
  {
    q: 'ヒントは何回使えますか？',
    a: `回数の制限はありません。始めてから${hintAfter}秒たつとヒントボタンが出て、押すとまだ見つけていない違いの1つの周りが光ります。ヒント1回につき、タイムに${penalty}秒が足されます。`,
  },
  {
    q: '間違えたところを押すと減点されますか？',
    a: 'されません。スマホでは指が太く、少しずれることがあるので、違わないところを押してもタイムは増えません。続けて外れたときは、違いの近くを少し大きめに押すよう案内が出ます。',
  },
  {
    q: 'どちらの絵を押せばいいですか？',
    a: '左（上）と右（下）のどちらの絵を押しても判定します。見つけた違いは両方の絵に丸が付きます。',
  },
  {
    q: 'なぜ抽象的な図形の絵なのですか？',
    a: '絵は図形をプログラムで並べて作っていて、違いも自動で付けています。イラストを描かずに毎日新しい1枚を出せるのと、既存の絵や写真の権利を気にせず遊べるのが理由です。',
  },
  {
    q: '記録や連続日数はどこに保存されますか？',
    a: 'ベストタイムとクリア回数が、難易度ごとにお使いの端末のブラウザへ保存されます（サーバーには送信しません）。今日の1枚はこれに加えて連続日数を保存します。別の端末やブラウザでは引き継げません。',
  },
];

const trail = breadcrumbFor('machigai-sagashi');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: '間違い探し',
      url: `${SITE_URL}/machigai-sagashi/`,
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

      <h1>間違い探し</h1>
      {/* リード文は1行に収める（2枚の絵を1画面に入れるため） */}
      <p className="lead">
        左右の絵の<strong>{normal.differences}つの違い</strong>を見つけよう。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊びかた</h2>
      <ol>
        <li>
          左（スマホでは上）と右（下）の<strong>2枚の絵を見比べます</strong>
        </li>
        <li>
          違うところを見つけたら、<strong>どちらかの絵のその場所を押します</strong>。当たると両方の絵に丸が付きます
        </li>
        <li>
          <strong>違いを全部見つけるとクリア</strong>。かかった時間が記録されます
        </li>
        <li>
          {hintAfter}秒たつと<strong>ヒント</strong>が使えます（1回につきタイムに+{penalty}秒）
        </li>
      </ol>
      <p>
        違わないところを押しても減点はありません。PCでは、絵の上のマスを Tab キーで順に選び、
        Enter キーでそのマスを調べられます（読み上げは「3行2列」のように位置だけで、色や形は読みません）。
      </p>

      <h2>5つの違いの種類</h2>
      <p>
        違いは<strong>色・大きさ・向き・位置・模様・図形が増えた／消えた</strong>の7種類から、
        1枚に{normal.differences}つ（やさしいは{easy.differences}つ）を別々の種類で付けています。
        <strong>色だけの違いは1枚に多くても1つ</strong>なので、色が見分けにくい人でも残りは形や位置で見つけられます。
        違いどうしは隣り合わない場所に付くので、1か所を押して2つ同時に当たることはありません。
      </p>

      <h2>今日の1枚と連続日数</h2>
      <p>
        「今日の1枚」は<strong>日付から組み立てる、その日だけの絵</strong>（図形{normal.shapes}個・違い
        {normal.differences}つ）です。同じ日に開いた人には全員同じ絵が出るので、
        <strong>何秒で見つけたか</strong>をそのまま比べられます。全部見つけると<strong>連続日数</strong>が1つ増え、
        1日空けると1に戻ります。日替わりの脳トレとして、毎日1枚の習慣にどうぞ。
        クリア後の「結果をコピー」で共有できる文面には、<strong>違いの場所は入りません</strong>（時間と日付だけ）。
      </p>

      <h2>観察力のコツ</h2>
      <ul>
        <li>
          <strong>端から順に1マスずつ</strong>見比べます。全体をぼんやり見るより、左上から右へ、1段ずつ下へ進むほうが見落としません
        </li>
        <li>
          <strong>小さい図形の大きさの違い</strong>や、<strong>向きのある図形</strong>（三角・矢印・月）の向きの違いは見落としやすいので、
          色や形が目立つ図形だけでなく、小さい図形も1つずつ確かめます
        </li>
        <li>
          片方にしか無い図形（<strong>増えた／消えた</strong>）は、空いている場所を見ると見つかります
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
          .filter((g) => g.slug !== 'machigai-sagashi')
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
