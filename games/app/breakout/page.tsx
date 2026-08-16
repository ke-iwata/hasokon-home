import type { Metadata } from 'next';
import Link from 'next/link';
import { games, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

const title = 'ブロック崩し 無料｜ブラウザですぐ遊べる定番アクション';
const description =
  '無料のブロック崩し。マウスやタッチでパドルを操作してブロックを消していく定番アクションゲーム。インストール不要でブラウザからすぐ遊べます。スマホ対応。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/breakout/` },
};

const faq = [
  { q: 'スマホでも遊べますか？', a: '遊べます。画面を指でなぞるとパドルが付いてきます。パドルの下に指を置くための余白があるので、指でパドルが隠れません。誤ってページがスクロールしないよう、ゲーム画面内の操作は固定されています。' },
  { q: '得点の仕組みは？', a: 'ブロックの行ごとに点数が違います。いちばん下の行が10点で、上の行ほど高くなり、最上段は50点です。奥にあって当てにくいブロックほど高得点になっています。' },
  { q: '難易度は変わりますか？', a: '面が進むごとに球のスピードが上がり、2面目からは上2行が2回当てないと消えないブロックになります。固いブロックは半透明で表示され、1回当てると通常の色に変わります。' },
  { q: '残機がなくなったらどうなりますか？', a: '球を落とすと残機が1つ減り、3つすべてなくなるとゲームオーバーです。スコアは面をまたいで合計され、ゲームオーバーになった時点の合計がそのゲームの成績になります。' },
  { q: '球の飛ぶ方向は変えられますか？', a: '変えられます。パドルのどこで受けるかで反射の角度が決まり、中央で受けるとほぼ真上に、端で受けるほど横方向に飛びます。狙った場所へ球を送るための基本テクニックです。' },
  { q: 'スコアは保存されますか？', a: 'ベストスコアとプレイ回数がお使いのブラウザに保存されます（サーバーには送信されません）。ブラウザのデータを削除すると消えます。' },
];

const trail = breadcrumbFor('breakout');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'ブロック崩し',
      url: `${SITE_URL}/breakout/`,
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

      <h1>ブロック崩し</h1>
      <p className="lead">
        パドルで球を打ち返してブロックを消していく定番アクション。<strong>面が進むごとに球が速く</strong>なります。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>画面をタップ（クリック）すると、球が斜め上に打ち出されてスタートします</li>
        <li>マウスや指を左右に動かしてパドルを操作し、球を落とさないように打ち返します</li>
        <li>ブロックは5行×10列。すべて消すと次の面に進み、球が少しずつ速くなります</li>
        <li>2面目からは、上2行が2回当てないと消えない固いブロック（半透明で表示）になります</li>
        <li>球を落とすと残機が1つ減ります。残機は3つで、なくなるとゲームオーバーです</li>
      </ol>
      <p>
        パドルはゲーム画面のどこを触っても動かせます。パドルの下には指を置くための
        余白を取ってあるので、スマホでも指でパドルが隠れません。反射の角度は
        <strong>パドルのどの位置で受けたか</strong>で決まり、中央ならほぼ真上に、
        端に寄るほど横向きに飛びます。スコアは面をまたいで合計され、
        ベストスコアはブラウザに保存されます。
      </p>
      <h2>コツ</h2>
      <ul>
        <li>パドルの<strong>端に当てるほど球は横に飛びます</strong>。角度を付けたいときは端で、安定させたいときは中央で受けましょう</li>
        <li>下の行ほど点が低く、上の行ほど高得点です（10点〜50点）。端の列から崩して<strong>ブロックの裏へ球を通す</strong>と、天井との間で球が跳ね回り、高得点の上段を一気に削れます</li>
        <li>2面目以降の固いブロックは、機会があるうちに1発当てておきましょう。終盤まで残すと、速くなった球で2回当てる羽目になります</li>
        <li>球が速い面ほど、球を目で追いかけるより落下点を予測して先に置いておく操作が有効です。「壁に当たった球は入って来たのと同じ角度で跳ね返る」と覚えておくと、軌道を読みやすくなります</li>
        <li>残りが数個になったら慌てないこと。無理に角度を付けて狙うより、確実に打ち返し続けるほうが結果的に早く終わります</li>
      </ul>

      <h2>ブロック崩しの由来</h2>
      <p>
        ブロック崩しは1970年代にアーケードゲームとして生まれたジャンルで、
        ボールとパドルだけで遊ぶ初期のテレビゲームから発展したものです。
        画面いっぱいのブロックが少しずつ消えていく気持ちよさはそのままに、
        アイテムや多彩なステージ構成を加えた派生作品が数多く作られ、
        今もパズルとアクションの中間に位置する定番ジャンルとして遊ばれ続けています。
        このページのブロック崩しは、パドルと球とブロックだけの最も基本的な構成で、
        短い時間でもさっと遊べるようにしたものです。
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
        {games
          .filter((g) => g.ready && g.slug !== 'breakout')
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
