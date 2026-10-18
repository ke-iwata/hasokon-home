import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

// 「ダウト」はトランプ遊びの一般名（docs/features/game-doubt.md の「名称と権利」）。
// 英語圏の同種の遊びの名称は使わない
const title = 'ダウト｜トランプのダウトをCPUと無料で（ブラウザ・登録不要）';
const description =
  'A・2・3…Kの順に札を伏せて出し、ウソだと思ったら『ダウト！』。CPU3人と遊ぶトランプのダウト。1〜4枚を出す・ウソを見抜く読み合いを、スマホでもパソコンでもタップだけで。CPUは3段階。登録不要・無料。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/doubt/` },
  robots: robotsFor('doubt'),
};

const faq = [
  {
    q: 'パスはできますか？',
    a: 'できません。自分の番には必ず 1〜4 枚を出します。宣言する数の札を持っていなければ、別の札を出してウソをつくしかありません。ここがダウトのいちばんの山場です。',
  },
  {
    q: '同時にダウトと言ったらどうなりますか？',
    a: '出した人から見て時計回りで近い人のダウトになります。あなたが「ダウト！」を押したときに、時計回りでより近い CPU も言っていたら、その CPU のダウトとして扱い、「CPU 1 が先にダウト！」と出します。',
  },
  {
    q: 'CPU はズルをしますか？',
    a: 'しません。CPU は伏せて出された札の中身を見ていません。使うのは自分の手札・ダウトで表になった札・みんなの手札の枚数・場札の枚数だけです。「ふつう」「つよい」は、自分の手札から見て宣言どおりそろう見込みを計算して疑います。',
  },
  {
    q: '何人で遊べますか？',
    a: 'あなたと CPU 3 人の 4 人で遊びます。52 枚（ジョーカーなし）を 13 枚ずつ配ります。人どうしのオンライン対戦はありません。',
  },
  {
    q: '1 枚ずつ出すルールで遊べますか？',
    a: 'このゲームは 1 回に 1〜4 枚です。毎手の判断（本物だけを出すか、ウソを混ぜるか）が増え、引き取りで手札が多くなっても終盤まで手数が持つためです。1 枚だけ出すこともできるので、自分は 1 枚ずつ出して遊ぶこともできます。',
  },
  {
    q: '記録は残りますか？',
    a: 'CPU の強さ（よわい・ふつう・つよい）ごとに、遊んだ回数・勝ち（1 位）・負け・最速の勝ちの時間が残ります。記録はお使いの端末のブラウザにだけ保存され、サーバーには送られません。',
  },
];

const trail = breadcrumbFor('doubt');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'ダウト（トランプ）',
      url: `${SITE_URL}/doubt/`,
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

      <h1>ダウト</h1>
      <p className="lead">
        A・2・3…K の順に札を<strong>伏せて</strong>出し、ウソだと思ったら「<strong>ダウト！</strong>」。
        CPU 3 人と遊ぶトランプの読み合い（CPU対戦）です。手札が先に無くなった人の勝ち。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>ダウトのルール</h2>
      <ol>
        <li>4 人（あなた＋CPU 3 人）に、ジョーカーなしの 52 枚を 13 枚ずつ配ります</li>
        <li>
          あなたから時計回りに出します。<strong>宣言する数は A → 2 → … → K → A と 1 つずつ進みます</strong>
          （出す人が選ぶのではなく、順番で決まります）
        </li>
        <li>
          自分の番には手札から札を伏せて出し、「7 が 2 枚」のように宣言します。
          宣言した数の札でなくてもかまいません（ウソ）。<strong>パスはできません</strong>
        </li>
        <li>
          出したあと、ほかの人は「ダウト」と言えます。札を表にして、
          <strong>全部宣言どおりなら言った人が</strong>、<strong>1 枚でも違えば出した人が</strong>、場札を全部引き取ります。
          誰も言わなければ、場札は積まれたまま次の人へ進みます
        </li>
        <li>引き取りのあとも、宣言する数はそのまま次に進みます</li>
        <li>
          手札が 0 枚になった人が上がりです。最後の札を出した番でダウトされ、ウソだったら引き取って続けます
        </li>
        <li>1 位が決まったら終わりです。設定で「最後まで」を選ぶと、4 位まで続けます</li>
      </ol>

      <h2>このページのルール</h2>
      <ul>
        <li>
          <strong>当サイトでは 1 回に 1〜4 枚出せます。</strong>
          「1 枚ずつ伏せて出す」と説明されることも多いルールですが、複数枚を出せる遊び方も広く遊ばれていて、
          毎手の判断が増えるのでこちらにしています
        </li>
        <li>複数の人が同時にダウトと言ったら、出した人から見て時計回りで近い人のダウトになります</li>
        <li>
          CPU の強さは 3 段階です。よわい はときどき当てずっぽうに疑い、ふつう・つよい は
          自分の手札から見て「宣言どおりそろう見込み」を計算して疑います。つよい は、ダウトで表になって
          誰かが引き取った札も覚えています。どの強さでも、伏せた札の中身は見ていません
        </li>
        <li>
          CPU が出したあとの「ダウト！」「通す」は、押さなければ 3 秒で「通す」になります
          （CPU の速さに合わせて変わります。「ゆっくり」と、動きを減らす設定の端末では時間切れになりません）
        </li>
      </ul>

      <h2>勝つコツ 3 つ</h2>
      <ul>
        <li>
          <strong>持っていない数が来る前に、正直な札を残しておく。</strong>
          自分の番に回ってくる数は 4 つおき（A の次は 5、その次は 9…）です。
          ウソに使うのは、当分回ってこない数の札にしましょう
        </li>
        <li>
          <strong>相手の手札が少ないときは疑う。</strong>
          最後の札を通してしまうと、その人の上がりです。手札を出し切ろうとしている手は、思い切ってダウト
        </li>
        <li>
          <strong>場札が多いときは、引き取りの損が大きい。</strong>
          外れたら全部引き取るので、場札が積み上がっているときほど慎重に。
          自分の手札に宣言の数が 3〜4 枚あるときは、相手の宣言がウソだと確実に分かることがあります
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
          .filter((g) => g.slug !== 'doubt')
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
