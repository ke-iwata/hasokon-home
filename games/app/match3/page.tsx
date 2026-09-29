import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';
import { DAILY_MOVES, KINDS, SIZE } from '@/lib/match3';

/**
 * 盤の大きさ・手数・種類は**設定から引く**（ページの文言に数字を書き写さない）。
 * 設定を変えたときに、解説だけが古い数字で残るのを防ぐ。
 * ただし registry の `keywords`（「8×8」「30手」）は本文にそのまま書いてある必要がある
 * （`tests/llms.test.ts`）ので、リード文と「とは」の節だけは数字を直に書き、
 * 設定と食い違わないことを `tests/match3.test.ts` で見張っている。
 */
const board = `${SIZE}×${SIZE}`;
const moves = `${DAILY_MOVES}手`;

const title = 'マッチ3パズル｜入れ替えて3つそろえる無料パズル・今日の盤面で30手のスコア勝負';
const description = `無料のマッチ3パズル。隣どうしのピースを入れ替えて、同じ形を縦か横に3つ以上そろえて消します。${board}の盤に${KINDS}種の図形。「今日の1盤面」は全員同じ盤で${moves}のスコアを競い、手数無制限のエンドレスも遊べます。インストール不要でスマホからもすぐ遊べます。`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/match3/` },
  robots: robotsFor('match3'),
};

const faq = [
  {
    q: 'どんなルールですか？',
    a: `隣どうし（上下左右）のピースを1回入れ替えて、同じ形を縦か横に3つ以上並べると消えます。消えた列には上からピースが落ち、空いた上端に新しいピースが補充されます。補充されたピースでまた並ぶと「連鎖」です。得点は3つで30点・4つで60点・5つ以上で100点で、連鎖するごとに倍率が0.5ずつ上がります。`,
  },
  {
    q: 'スマホでも遊べますか？',
    a: '遊べます。1つ目のピースをタップしてから隣のピースをタップするか、1つ目に触れたまま隣へなぞると入れ替わります。PCではクリック→クリックかドラッグです。インストールも会員登録も不要です。',
  },
  {
    q: 'そろわない入れ替えをしたらどうなりますか？',
    a: `ピースは元の位置に戻り、手数は減りません。誤タップで1手損することはありません。手数が減るのは、入れ替えて実際に消えたときだけです。`,
  },
  {
    q: '「今日の1盤面」とは何ですか？',
    a: `日付から作る、その日だけの盤面です。同じ日に開いた人には全員同じ盤が出て、${moves}でどれだけ点を取れるかを競います。同じ日なら何度でもやり直せて、その日のベストが残ります。サーバーは使っておらず、お使いの端末の日付（ローカル日付）から盤を組み立てています。`,
  },
  {
    q: '全員まったく同じ条件ですか？',
    a: '同じなのは最初の盤面と、補充されるピースを決める乱数の並びまでです。補充されるピースは入れ替えの手順しだいで変わるので、違う手を指せばその先の盤は変わります。同じ日に同じ手順を踏めば、同じ盤面になります。',
  },
  {
    q: '入れ替えられる手が無くなったら？',
    a: 'ピースの種類の数はそのままに、自動で並べ替えます。並べ替えで手数は減りません。今日の1盤面では並べ替えも日付の乱数の続きで決まるので、同じ手順を踏んだ人は同じ盤になります。',
  },
  {
    q: 'ヒント機能はありますか？',
    a: 'ありません。どこを入れ替えるかを探すのがこのパズルの中身だからです。入れ替えられる手が1つも無くなったときだけ、「並べ替えます」とお知らせします。',
  },
  {
    q: '記録はどこに保存されますか？',
    a: '今日の1盤面は「今日のベスト」と連続日数、エンドレスはベストスコアを、お使いの端末のブラウザに保存します。サーバーには送信していないので、別の端末やブラウザでは引き継げません。ブラウザのデータを削除したときや、プライベートブラウズで遊んだときも残りません。',
  },
];

const trail = breadcrumbFor('match3');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'マッチ3パズル',
      url: `${SITE_URL}/match3/`,
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

      <h1>マッチ3パズル</h1>
      {/* リード文は1〜2行に収める（増やすと盤が画面の外へ出る） */}
      <p className="lead">
        隣と<strong>入れ替えて</strong>、同じ形を<strong>3つそろえて</strong>消す。今日の盤面で30手のスコア勝負。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊びかた</h2>
      <ol>
        <li>
          隣どうし（上下左右）のピースを<strong>タップ→タップ</strong>か<strong>スワイプ</strong>で入れ替えます
        </li>
        <li>
          縦か横に<strong>同じ形が3つ以上</strong>並ぶと消えます。十字やL字にそろえると、まとめて1つのかたまりとして数えます
        </li>
        <li>
          消えた列には上からピースが落ち、空いた上端に新しいピースが入ります。そこでまた並ぶと<strong>連鎖</strong>です
        </li>
        <li>
          「今日の1盤面」は<strong>{moves}</strong>を使い切ったところで終わりです。エンドレスは手数無制限で、好きなところで終えられます
        </li>
      </ol>
      <p>
        得点は3つで30点・4つで60点・5つ以上で100点。連鎖するごとに倍率が0.5ずつ上がります（2連鎖目は1.5倍、3連鎖目は2倍）。
        そろわない入れ替えは元に戻り、<strong>手数は減りません</strong>。
        入れ替えられる手が無くなったら、自動で並べ替えます（手数は減りません）。
      </p>

      <h2>マッチ3パズルとは</h2>
      <p>
        隣のピースを入れ替えて同じ種類を3つ以上そろえる「マッチ3」は、スマホのパズルでいちばん大きなジャンルの1つです。
        このサイトでは、8×8の盤に<strong>円・四角・三角・ひし形・星・六角形の{KINDS}種</strong>を並べています。
        <strong>色と形が1対1に対応している</strong>ので、色の見分けにくさがあっても形で遊べます。
      </p>

      <h2>日替わりの「今日の1盤面」と連続日数</h2>
      <p>
        「今日の1盤面」は<strong>日付から組み立てる、その日だけの盤</strong>です。同じ日に開いた人には全員同じ盤が出ます。
        ただし<strong>全員同じなのは、最初の盤面と補充の乱数の並びまで</strong>で、補充されるピースは入れ替えの手順しだいで変わります
        （同じ手順を踏めば同じ盤面になります）。
        同じ日なら何度でもやり直せて、<strong>その日のベスト</strong>が残ります。{moves}を遊び切ると<strong>連続日数</strong>が1つ増え、
        1日空けると1に戻ります。記録はお使いの端末のブラウザにだけ残ります。
        終わったあとの「結果をコピー」で、日付・点数・最大連鎖を共有できます。
      </p>

      <h2>コツ</h2>
      <ul>
        <li>
          <strong>下の段で消すと連鎖しやすい</strong>のが基本です。下で消すほど上のピースがまとめて落ち、落ちた先でまた並ぶ機会が増えます
        </li>
        <li>
          <strong>4つ・5つ</strong>を狙えるときは狙います。3つを2回より、5つを1回のほうが手数あたりの点が高くなります
        </li>
        <li>
          十字やL字にそろうと、縦と横をまとめて1つのかたまりとして数えます。5つ以上になれば100点です
        </li>
        <li>
          手数に限りがある今日の1盤面では、<strong>消せる手が複数あるときほど、どれが連鎖を生むか</strong>を落ちる先まで見てから選びます
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
          .filter((g) => g.slug !== 'match3')
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
