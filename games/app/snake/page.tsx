import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

const title = 'スネーク（ヘビゲーム）無料｜ブラウザですぐ遊べる定番アーケード';
const description =
  '無料のスネーク（ヘビゲーム）。餌を食べて伸びるヘビを操作し、壁と自分の体をよけながらハイスコアを狙う定番アーケードゲーム。スマホはスワイプ、PCは矢印キーで操作。インストール不要でブラウザからすぐ遊べます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/snake/` },
  robots: robotsFor('snake'),
};

const faq = [
  { q: 'スマホでも遊べますか？', a: '遊べます。盤面を指でスワイプすると、その向きにヘビが曲がります。指を離さずに続けてスワイプすれば、そのまま次の方向へ曲がれます。ゲーム画面の中では、操作がページのスクロールに取られないようにしてあります。' },
  { q: '操作方法を教えてください', a: 'スマホは盤面のスワイプ（上下左右）、パソコンは矢印キーまたは W・A・S・D キーです。スペースキーでスタートと一時停止ができ、画面下の「一時停止」ボタンでも同じことができます。ヘビは自動で進み続けるので、指示するのは曲がる向きだけです。' },
  { q: '逆方向に曲がれないのはなぜですか？', a: 'いま進んでいる向きの真逆に曲がると、その瞬間に自分の首に当たって必ず終わってしまうためです。標準のヘビゲームと同じく、逆向きの操作は無効にしてあります。折り返したいときは、上（下）に曲がってから左（右）へ、と2回に分けて操作してください。連続で押した操作は取りこぼさずに順番に効きます。' },
  { q: '壁はすり抜けられますか？', a: 'すり抜けられません。壁に当たった時点でゲームオーバーになる標準ルールです。盤面は17×17マスで、端まで行ったら必ず曲がる必要があります。' },
  { q: 'だんだん速くなりますか？', a: '5点ごとに1マス進む間隔が少しだけ短くなります。ただし速さには上限があるので、際限なく速くなって操作できなくなることはありません。' },
  { q: 'スコアは保存されますか？', a: 'ベストスコアとプレイ回数がお使いのブラウザに保存されます（サーバーには送信されません）。ブラウザのデータを削除すると消えます。' },
];

const trail = breadcrumbFor('snake');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'スネーク',
      url: `${SITE_URL}/snake/`,
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

      <h1>スネーク（ヘビゲーム）</h1>
      {/* リード文は2行に収める（3行にすると盤が画面の外へ出る。実測） */}
      <p className="lead">
        餌を食べて伸びるヘビを操作する定番アーケード。
        <strong>壁と自分の体に当たったら終わり</strong>です。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>盤面をタップ（クリック）するか、スペースキーを押すとスタートします</li>
        <li>ヘビは自動で進み続けます。指示するのは<strong>曲がる向きだけ</strong>です</li>
        <li>スマホは盤面をスワイプ、パソコンは矢印キー（または W・A・S・D）で曲がります</li>
        <li>赤い餌を食べると体が1節伸び、スコアが1点増えます。5点ごとに少しずつ速くなります</li>
        <li>壁か自分の体に当たったらゲームオーバー。スペースキーか「一時停止」ボタンで小休止できます</li>
      </ol>
      <p>
        いま進んでいる向きの<strong>真逆には曲がれません</strong>（曲がった瞬間に自分の首に
        当たってしまうため）。折り返したいときは、いったん上下どちらかに曲がってから
        逆向きへ、と2回に分けます。素早く2回入力しても取りこぼさず、順番に効きます。
        ベストスコアとプレイ回数はお使いのブラウザに保存されます。
      </p>

      <h2>コツ</h2>
      <ul>
        <li>
          <strong>壁際を大きく周回する</strong>のが基本です。盤の真ん中を横切ると体が
          壁になって通り道が減るので、外周をなぞるように回りながら餌を拾いましょう
        </li>
        <li>
          餌へ最短距離で突っ込まないこと。<strong>食べたあとに出口があるか</strong>を
          先に見ます。行き止まりの奥にある餌は、1周してから取りに行くほうが安全です
        </li>
        <li>
          体が長くなったら、折り返しを繰り返して<strong>細かく畳む</strong>と、
          同じ広さでも長く生き延びられます。畳むときは必ず同じ向きに揃えます
        </li>
        <li>
          速くなってきたら曲がる操作を<strong>1マス手前で早めに</strong>入れます。
          入力は2つまで先に積めるので、角を曲がってすぐ折り返す動きも先に入れておけます
        </li>
        <li>
          迷ったら曲がらないこと。ヘビゲームで死ぬのはたいてい「慌てて余計に曲がったとき」です
        </li>
      </ul>

      <h2>ヘビゲームの由来</h2>
      <p>
        ヘビゲームの原型は1976年のアーケードゲーム「Blockade」に始まる、
        通った跡が壁として残るジャンルです。1970年代末から家庭用のパソコンに
        数え切れないほど移植され、1990年代末には携帯電話にプリインストールされた
        「Snake」で一気に世界中へ広まりました。小さな白黒の画面でも成立し、
        操作は4方向だけ、ルールは「食べると伸びる・当たったら終わり」だけ。
        この単純さのおかげで、いまも検索エンジンの隠し要素や学習用の題材として
        作り続けられている定番です。ルールそのものはジャンルとして公知のもので、
        このページのスネークも、余計な要素を足さない最も基本的な構成にしてあります。
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
          .filter((g) => g.slug !== 'snake')
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
