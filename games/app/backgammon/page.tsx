import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import GameIcon from '@/app/GameIcon';
import Game from './Game';

// 「バックギャモン」は古くからある盤上遊戯の一般名。運営者の J-PlatPat 確認待ち（registry の stage は wip）。
// 他社のアプリ名・サイト名は本文・FAQ・metadata に出さない（docs/features/game-backgammon.md の「やらないこと」）
const title = 'バックギャモン 無料｜CPU対戦（かんたん・ふつう・つよい）・ルール解説';
const description =
  '無料のバックギャモン。サイコロ2個の目で15個の駒を回し、先に全部上げきったほうが勝ち。CPUは かんたん・ふつう・つよい の3段階、1台で2人対戦も。動かせる駒と行き先が光り、目を両方使う決まりは自動で守られます。初期配置の図つきのルール解説。インストール不要・登録不要。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/backgammon/` },
  robots: robotsFor('backgammon'),
};

const faq = [
  {
    q: 'ゾロ目はどう動かす？',
    a: '同じ目が2つ出たら（ゾロ目）、その目を4回使えます。たとえば 3 のゾロ目なら、3 つ進む動きを4回。1つの駒を 12 進めても、4つの駒を 3 ずつ進めても、組み合わせてもかまいません。',
  },
  {
    q: '動かせないときは？',
    a: '2つの目を両方使える手があるなら、両方使わなければなりません。片方しか使えないなら、使える限り大きいほうの目を使います。どちらの目も使えないときはパスで、「動かせる手がありません」と出て自動で相手の番になります。この盤では決まりを自動で守るので、決まりに反する手は光りません。',
  },
  {
    q: 'ギャモンとは？',
    a: '相手が1個も駒を上げていないうちに、自分が15個すべてを上げきって勝つことです。ふつうの勝ちが1点のところ、ギャモンは2点。さらに相手の駒がバーか、勝った側のインナーボードに残っていればバックギャモンで3点になります。',
  },
  {
    q: 'バーの駒はどこに入る？',
    a: '打たれてバーに置かれた駒は、相手のインナーボード（自分から見て 19〜24 のポイント）に入れ直します（エンター）。出た目の数のポイントに入り、1 の目なら 24、6 の目なら 19 です。相手の駒が2個以上あるポイントには入れません。バーに駒があるうちは、ほかの駒を動かせません。',
  },
];

const trail = breadcrumbFor('backgammon');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'バックギャモン',
      url: `${SITE_URL}/backgammon/`,
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

/** 初期配置の図（自分から見て 24 に 2・13 に 5・8 に 3・6 に 5）。盤は手前が自分 */
function SetupDiagram() {
  const col = (n: number) => (n <= 12 ? 12 - n : n - 13);
  const x = (c: number) => (c < 6 ? 6 + c * 24 : 168 + (c - 6) * 24);
  // [自分から見た番号, 自分の駒の数, 相手の駒の数]
  const setup: [number, number, number][] = [
    [24, 2, 0],
    [13, 5, 0],
    [8, 3, 0],
    [6, 5, 0],
    [1, 0, 2],
    [12, 0, 5],
    [17, 0, 3],
    [19, 0, 5],
  ];
  const items: React.ReactNode[] = [];
  for (let n = 1; n <= 24; n++) {
    const c = col(n);
    const top = n >= 13;
    const bx = x(c);
    items.push(
      <polygon
        key={`t${n}`}
        points={top ? `${bx},6 ${bx + 24},6 ${bx + 12},104` : `${bx},234 ${bx + 24},234 ${bx + 12},136`}
        className={`bg-tri ${c % 2 === 0 ? 'a' : 'b'}`}
      />,
    );
    items.push(
      <text key={`l${n}`} x={bx + 12} y={top ? 117 : 130} textAnchor="middle" className="bg-label">
        {n}
      </text>,
    );
  }
  for (const [n, mine, theirs] of setup) {
    const c = col(n);
    const top = n >= 13;
    const count = mine || theirs;
    for (let k = 0; k < count; k++) {
      const cy = top ? 16 + k * 19.5 : 224 - k * 19.5;
      items.push(
        <circle key={`c${n}-${k}`} cx={x(c) + 12} cy={cy} r="9.5" className={`bg-checker ${mine ? 'side0' : 'side1'}`} />,
      );
    }
  }
  return (
    <svg
      className="bg-diagram"
      viewBox="0 0 330 240"
      role="img"
      aria-label="初期配置。手前が自分（塗りの駒）。自分の駒は 24 に 2 個・13 に 5 個・8 に 3 個・6 に 5 個。相手の駒（白地）はその向かい側に同じ形"
    >
      <rect x="0" y="0" width="330" height="240" rx="6" className="bg-felt" />
      <rect x="150" y="0" width="18" height="240" className="bg-barcol" />
      {items}
    </svg>
  );
}

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>バックギャモン</h1>
      <p className="lead">
        サイコロ2個の目で15個の駒を盤の向こう側へ回し、<strong>先に全部を上げきったほうが勝ち</strong>。
        CPUは かんたん・ふつう・つよい の3段階、1台で2人対戦もできます。1局 5〜15分。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <SetupDiagram />
      <ol>
        <li>
          盤は 24 のポイント（三角形の列）。各自 15 個の駒を、図の初期配置から始めます。
          自分の駒は 24 → 1 の向きに進み、1〜6 が自分のインナーボードです
        </li>
        <li>
          先手決めでは互いに1個ずつ振り、大きい目を出したほうが<strong>その2つの目で</strong>最初の手を指します
          （同じ目なら振り直し）
        </li>
        <li>
          サイコロ2個の目のぶん、駒を進めます。2つの目は別々の駒に使っても、1つの駒に続けて使ってもかまいません。
          <strong>ゾロ目は同じ目を4回</strong>使えます
        </li>
        <li>
          相手の駒が<strong>2個以上</strong>あるポイントには止まれません。1個だけ（ブロット）なら止まって打てます（ヒット）。
          打たれた駒はバーに置かれます
        </li>
        <li>
          バーに駒があるうちは、それを相手のインナーボードに入れ直す（エンター）まで、ほかの駒を動かせません
        </li>
        <li>
          15 個すべてが自分のインナーボードに入ったら、駒を盤の外へ上げられます（ベアオフ）。
          目より大きい数のポイントに駒が無ければ、いちばん遠い駒を上げられます。
          ベアオフの途中で打たれたら、その駒がインナーボードに戻るまで上げられません
        </li>
      </ol>
      <p>
        画面上部の<strong>ピップカウント</strong>は、上がりまでに必要な目の合計です（初期配置は両者 167）。
        小さいほうが競走では有利で、どちらが勝っているかの目安になります。
      </p>

      <h2>ギャモンとバックギャモン</h2>
      <ul>
        <li>ふつうの勝ちは 1 点</li>
        <li>
          <strong>ギャモン</strong>（2点）：負けた側が1個も駒を上げていない
        </li>
        <li>
          <strong>バックギャモン</strong>（3点）：さらに、負けた側の駒がバーか勝った側のインナーボードに残っている
        </li>
      </ul>
      <p>このページは1局ずつの勝負で、ダブリングキューブ（賭け点を倍にする道具）とマッチ（○点先取）は使いません。</p>

      <h2>初心者の3つのコツ</h2>
      <ol>
        <li>
          <strong>ブロットを残さない。</strong>1個だけの駒は打たれるとバーからやり直しです。なるべく2個ずつで動かします
        </li>
        <li>
          <strong>インナーボードにポイントを作る。</strong>自分のインナーボードに2個以上の駒のポイントが増えるほど、
          打った相手の駒が入り直しにくくなります
        </li>
        <li>
          <strong>最初の 6-1 は 7 ポイントを作る。</strong>13 から 6、8 から 1 動かして 7 に2個そろえると、
          6・7・8 と並んだ壁ができ、相手の奥の駒が逃げにくくなります
        </li>
      </ol>

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
          .filter((g) => g.slug !== 'backgammon')
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
