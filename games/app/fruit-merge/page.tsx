import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import { CHAIN_MAX, FRUITS, MAX_TIER, OVER_LIMIT } from '@/lib/fruit-merge';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

/**
 * **名前に他社の商品名を使わないこと。**「スイカゲーム」は Aladdin X 社の
 * 商標なので、title・description・h1・slug のどこにも入れない
 * （docs/features/game-fruit-merge.md の「名称・権利の注意」）。
 * 検索の受け皿は「落とす」「合体」「物理パズル」といった一般語で作る
 */
const title = 'フルーツ合体パズル 無料｜落として合体させる物理パズル';
const description =
  '無料のフルーツ合体パズル。箱に果物を落として、同じ果物どうしをぶつけると1段大きい果物になります。さくらんぼからパイナップルまで11段階。連鎖を狙って高得点を目指す物理パズルです。インストール不要でブラウザからすぐ遊べます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/fruit-merge/` },
  robots: robotsFor('fruit-merge'),
};

const biggest = FRUITS[MAX_TIER].name;
const order = FRUITS.map((f) => f.name).join(' → ');

const faq = [
  {
    q: 'スマホでも遊べますか？',
    a: '遊べます。箱の上を指でなぞって落とす場所を決め、指を離すと果物が落ちます。押している位置に縦の点線（落下予測線）が出るので、狙いをつけてから離してください。箱・スコア・次の果物の予告は、小さめの画面でも1画面に収まるようにしてあります。',
  },
  {
    q: 'キーボードでも操作できますか？',
    a: 'できます。← → で落とす場所を動かし、スペースキー（または Enter、↓）で落とします。',
  },
  {
    q: '果物は何種類ありますか？',
    a: `11種類です。小さい順に ${order} で、同じ果物どうしが触れると1つ上の果物になります。落ちてくるのは小さい方の5種類だけなので、大きい果物は合体でしか作れません。`,
  },
  {
    q: '得点の仕組みは？',
    a: `合体してできた果物が大きいほど高得点です（1つ上がるごとに1点、3点、6点…と増えていき、いちばん大きい${biggest}を作ると55点）。さらに、1回の合体が次の合体を呼ぶ「連鎖」が起きると、その回数ぶん点が倍になります（最大${CHAIN_MAX}倍）。`,
  },
  {
    q: 'いちばん大きい果物を作ったらどうなりますか？',
    a: `${biggest}どうしをぶつけると、2つとも消えてボーナスが入ります。箱の中が詰まってきたときに空きを作る唯一の手なので、大きい果物は隅ではなく取り回しやすい場所に置いておくと有利です。`,
  },
  {
    q: 'ゲームオーバーの条件は？',
    a: `箱の上のほうに引いてある線を、積み上がった果物が${OVER_LIMIT}秒こえたままだと終わりです。こえているあいだは線が点滅して警告するので、その間に合体させて山を下げられれば続けられます。落とした直後のまだ落ちている果物は数えません。`,
  },
  {
    q: '1プレイはどれくらいかかりますか？',
    a: '3分から10分ほどです。時間制限はないので、落とす場所をゆっくり考えても構いません。',
  },
  {
    q: 'スコアは保存されますか？',
    a: 'ベストスコアとプレイ回数がお使いのブラウザに保存されます（サーバーには送信されません）。ブラウザのデータを削除すると消えます。',
  },
  {
    q: '効果音は鳴りますか？',
    a: '鳴りません。このサイトのゲームはすべて無音なので、電車の中でも音を気にせず遊べます。',
  },
];

const trail = breadcrumbFor('fruit-merge');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'フルーツ合体パズル',
      url: `${SITE_URL}/fruit-merge/`,
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumb trail={trail} />

      <h1>フルーツ合体パズル</h1>
      <p className="lead">
        箱に果物を落として、<strong>同じ果物どうしをぶつけると1段大きい果物になります</strong>。
        さくらんぼから{biggest}まで11段階。連鎖をつなげて高得点を狙いましょう。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>箱の上を左右になぞって落とす場所を決め、指（マウス）を離すと果物が落ちます</li>
        <li>
          <strong>同じ果物どうしが触れると、1段大きい果物になります</strong>
          （小さい順に {order}）
        </li>
        <li>合体が次の合体を呼ぶと<strong>連鎖</strong>になり、点が最大{CHAIN_MAX}倍まで伸びます</li>
        <li>
          いちばん大きい{biggest}どうしは、合体すると<strong>2つとも消えてボーナス</strong>です
        </li>
        <li>
          箱の上の線を果物が<strong>{OVER_LIMIT}秒こえたまま</strong>だとゲームオーバー。
          こえているあいだは線が点滅して知らせます
        </li>
      </ol>
      <p>
        キーボードでも遊べます。<strong>←</strong> <strong>→</strong> で落とす場所を動かし、
        <strong>スペース</strong>キーで落とします。ベストスコアはブラウザに保存されます。
      </p>

      <h2>コツ</h2>
      <ul>
        <li>
          <strong>大きい果物は箱の下、小さい果物は上。</strong>大きいものを上に乗せると、
          その下の小さい果物にさわれなくなって合体させられません。落とす前に、
          いま持っている果物と同じものがどこにあるかを見ましょう
        </li>
        <li>
          <strong>同じ果物は端に寄せてから合体させます。</strong>まんなかで合体させると
          左右どちらにも山ができてしまい、次に落とす場所が無くなります
        </li>
        <li>
          <strong>連鎖は「1段上の果物の隣」に落とすと起きます。</strong>
          たとえば さくらんぼ 2つの隣に いちご があると、さくらんぼが合体して
          いちごになった瞬間にもう1回合体します
        </li>
        <li>
          縦の点線（落下予測線）は、<strong>いま離したらどこに落ちるか</strong>を示しています。
          山の上に落とすと転がるので、点線の輪が出た位置から左右どちらに転がりそうかも見ましょう
        </li>
        <li>
          線をこえて点滅が始まっても、まだ{OVER_LIMIT}秒あります。
          <strong>あわてて落とさず、合体できる組を探して山を下げましょう</strong>
        </li>
        <li>
          詰まってきたら<strong>{biggest}を2つ作る</strong>のが最後の手です。
          合体すると2つとも消えるので、箱に大きな空きができます
        </li>
      </ul>

      <h2>フルーツ合体パズルについて</h2>
      <p>
        「同じものを落として合体させる」タイプの物理パズルは、2023年に流行してから
        定番のジャンルになりました（このジャンルが広く知られるきっかけになった
        「スイカゲーム」は Aladdin X 社の商品名で、このページのゲームとは関係がありません）。
        ルールが1行で分かるのに、どこに落とすかで結果が変わるので、
        短い時間に何度も遊びたくなるのが特徴です。
      </p>
      <p>
        このページのフルーツ合体パズルは、果物の絵柄も物理も自前で作ったものです。
        果物は円として扱い、重力・反発・摩擦・重なりの押し戻しを
        ブラウザの中だけで計算しています。サーバーとのやりとりはありません。
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
          .filter((g) => g.slug !== 'fruit-merge')
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
