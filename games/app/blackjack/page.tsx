import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';
import { BETS, START_CHIPS } from '@/lib/blackjack';

// ブラックジャックのルールは公有で、ゲーム名も一般名として流通している。
// 同名の著名な漫画があるので、**それを連想させる見た目（黒いコートの人物・配色など）は使わない**。
// 名称と slug は運営者の J-PlatPat 確認（第9類・第41類）で確定させる約束
// （docs/features/game-blackjack.md の状態行）。
// チップは購入・換金・回復の無い仮想の点数で、本文でも「練習」「ルールを覚える」の語で書く
const title = 'ブラックジャック（トランプ）無料｜ディーラーと1対1でルールを覚える';
const description =
  '無料で遊べるトランプの「ブラックジャック」。合計を21に近づけて、CPUのディーラーと1対1で勝負します。ヒット・スタンド・ダブルダウン・スプリットに対応し、ソフト17でディーラーが引くかどうかも選べます。チップは点数だけで、お金は一切かかりません。インストール不要・登録不要でスマホ対応、成績と最高チップはこの端末に保存されます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/blackjack/` },
  robots: robotsFor('blackjack'),
};

const betList = BETS.join('・');
const startChips = START_CHIPS.toLocaleString('ja-JP');

const faq = [
  {
    q: 'A（エース）は1と11のどちらですか？',
    a: 'どちらにも数えられます。合計が21を超えない範囲で11として数え、超えてしまうなら1として数えます。画面ではAを含む手の合計を「7 / 17」のように2つ並べて出しています（1と数えた値／11と数えた値）。11と数えられる手を「ソフト」、そうでない手を「ハード」と呼びます。',
  },
  {
    q: 'ディーラーが17で止まるのはなぜですか？',
    a: 'ディーラーには自分で選ぶ余地がなく、「16以下なら必ず引く、17以上なら必ず止まる」という決まった手順で動くのがブラックジャックの約束です。プレイヤーだけが引くか止まるかを選べるので、その判断を練習するゲームになっています。Aを11と数えた17（ソフト17）で引くかどうかは地域によって違うため、設定で切り替えられます。',
  },
  {
    q: 'ダブルダウン・スプリットとは何ですか？',
    a: 'ダブルダウンは、最初の2枚のときに賭け金を2倍にして、あと1枚だけ引いて止まる選択です。スプリットは、同じ数字の2枚が配られたときに2つの手に分け、それぞれに同じ額を賭けて別々に勝負する選択です。スプリットは1回まで、分けたあとのダブルダウンはできません。Aを分けたときは1枚ずつしか配られず、Aと10点札になっても21（1倍の勝ち）として扱います。',
  },
  {
    q: 'チップとは何ですか？お金はかかりますか？',
    a: `チップはこのページの中だけの点数で、お金ではありません。${startChips}枚から始まり、購入・換金・景品との交換はできません。広告を見て増やすような仕組みもありません。なくなったら「はじめから」で${startChips}枚に戻ります。`,
  },
  {
    q: 'ブラックジャックの配当はいくらですか？',
    a: `最初の2枚でAと10点札（10・J・Q・K）がそろう「ブラックジャック」は賭け金の1.5倍（3:2）、ふつうの勝ちは1倍（1:1）、引き分けは賭け金が戻ります。賭け金は${betList}の3段階で、25を賭けて3:2のときは端数を切り捨てて37になります。`,
  },
  {
    q: 'ディーラーが最初にブラックジャックを確かめるのはなぜですか？',
    a: 'ディーラーのアップカード（表の札）がAか10点札のときは、プレイヤーが行動する前に伏せ札を確かめます。ブラックジャックならその場で勝負が終わり、プレイヤーが失うのは最初の賭け金だけです（ダブルダウンやスプリットで足したぶんは失いません）。プレイヤーもブラックジャックなら引き分けです。',
  },
  {
    q: '記録は残りますか？',
    a: 'ソフト17の設定ごとに、勝ち・負け・引き分けの数と最高チップが残ります。記録はお使いの端末のブラウザにだけ保存され、サーバーには送られません。ブラウザのデータを削除すると消えます。',
  },
];

const trail = breadcrumbFor('blackjack');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'ブラックジャック（トランプ）',
      url: `${SITE_URL}/blackjack/`,
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

      <h1>ブラックジャック</h1>
      <p className="lead">
        配られた札の<strong>合計を21に近づける</strong>トランプの定番。
        CPUのディーラーと1対1で、ヒット・スタンド・ダブルダウン・スプリットの判断を練習できます。
        チップは点数だけで、お金はかかりません。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>
          賭け金（{betList}）を選んで「配る」を押します。チップは{startChips}枚から始まります
        </li>
        <li>
          あなたとディーラーに2枚ずつ配られます。ディーラーの2枚目は伏せてあります
        </li>
        <li>
          <strong>ヒット</strong>で1枚引き、<strong>スタンド</strong>で止まります。
          21を超える（バースト）とその時点で負けです
        </li>
        <li>
          最初の2枚のときは<strong>ダブルダウン</strong>（賭け金を2倍にして1枚だけ引く）、
          同じ数字の2枚なら<strong>スプリット</strong>（2つの手に分ける）も選べます
        </li>
        <li>
          止まったら、ディーラーが伏せ札をめくり、<strong>17以上になるまで引きます</strong>
        </li>
        <li>
          21を超えずにディーラーより21に近ければ勝ちです。最初の2枚で21の
          「ブラックジャック」は<strong>3:2</strong>、ふつうの勝ちは1:1、同じ合計なら引き分けです
        </li>
      </ol>

      <h2>札の数え方</h2>
      <table>
        <thead>
          <tr>
            <th>札</th>
            <th>数え方</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>2〜10</td>
            <td>書いてある数字のまま</td>
          </tr>
          <tr>
            <td>J・Q・K（絵札）</td>
            <td>10</td>
          </tr>
          <tr>
            <td>A</td>
            <td>1 または 11（21を超えないほうを自動で使います）</td>
          </tr>
        </tbody>
      </table>

      <h2>このページのルール</h2>
      <ul>
        <li>52枚のトランプを1組だけ使い、1回ごとに切り直します</li>
        <li>
          ディーラーは17以上で止まります。<strong>ソフト17</strong>（Aを11と数えた17）で
          止まるか引くかは、画面の設定で選べます（勝負の途中は変えられません）
        </li>
        <li>スプリットは1回まで、分けたあとのダブルダウンはできません</li>
        <li>インシュランス（保険）とサレンダー（降参）はありません</li>
        <li>
          ディーラーのアップカードがAか10点札のときは、先に伏せ札を確かめ、
          ブラックジャックならその場で勝負が終わります（失うのは最初の賭け金だけ）
        </li>
      </ul>

      <h2>コツ</h2>
      <ul>
        <li>
          <strong>ディーラーの表の札を見る。</strong>
          ディーラーの表が2〜6のときは、ディーラーが引いているうちに21を超えやすい場面です。
          自分の合計が12〜16でも、無理に引かずに止まる考え方があります
        </li>
        <li>
          <strong>11はダブルダウンの好機。</strong>
          次に10点札が来る見込みが大きいので、賭け金を2倍にする価値があります
        </li>
        <li>
          <strong>Aの2枚と8の2枚は分ける。</strong>
          Aの2枚は合計2（または12）で扱いにくく、8の2枚は16でいちばん苦しい合計です。
          分けるとそれぞれ良い手になりやすくなります
        </li>
        <li>
          <strong>10の2枚は分けない。</strong>
          20はそれだけで強い合計です
        </li>
      </ul>
      <p>
        どれも「その場面でよく選ばれる考え方」で、毎回の結果を約束するものではありません。
        札は1回ごとに切り直すので、前の勝負の札を覚えても有利にはなりません。
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
          .filter((g) => g.slug !== 'blackjack')
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
