import type { Metadata } from 'next';
import Link from 'next/link';
import { games, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

const title = 'ピンボール 無料｜ブラウザで遊べる懐かしのテーブル';
const description =
  '無料のピンボール。プランジャーで球を打ち出し、左右のフリッパーで打ち返してバンパーと的で点を稼ぐ定番アクション。インストール不要でブラウザからすぐ遊べます。スマホは画面の左右をタップして操作。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/pinball/` },
};

const faq = [
  {
    q: 'スマホでも遊べますか？',
    a: '遊べます。台の左半分をタップすると左フリッパー、右半分をタップすると右フリッパーが上がります。両手の親指をそのまま置いて遊べる配置です。打ち出しの前は、台のどこを押しても押している長さだけプランジャーが引かれます。',
  },
  {
    q: 'キーボードでも操作できますか？',
    a: 'できます。左フリッパーは ← または Z、右フリッパーは → または X、打ち出しはスペースキーです。スペースを押している長さで打ち出しの強さが決まります。台の下にある「◀ 左」「右 ▶」のボタンを押しているあいだもフリッパーが上がります。',
  },
  {
    q: '得点の仕組みは？',
    a: '丸いバンパーに当たると100点、横に並ぶ4つの的に当たると250点です。的を4つすべて倒すとボーナス1000点が入り、得点の倍率が1つ上がって的が元に戻ります。倍率は最大5倍まで上がります。フリッパーの上にあるピンク色の斜面（スリングショット）も、勢いよく当たると10点入ります。',
  },
  {
    q: '倍率はどうすれば上がりますか？',
    a: '横に並ぶ4つの的をすべて倒すたびに1つ上がります（最大5倍）。ただし球を落とすと1に戻り、的も元に戻ります。高得点を狙うなら、倍率を上げてからバンパーに球を送り込むのが基本です。',
  },
  {
    q: '球はいくつありますか？',
    a: '3つです。フリッパーのあいだを抜けて下に落ちると1つ減り、すべて失うとゲームオーバーです。スコアは3球ぶんの合計になります。',
  },
  {
    q: '打ち出しの強さは変えられますか？',
    a: '変えられます。押している時間が長いほど強く打ち出されます。ただし弱く打っても台の上まで届くようにしてあるので、打ち出しに失敗して球が戻ってきてしまうことはありません。強さで球が盤面に入る位置が変わります。',
  },
  {
    q: 'スコアは保存されますか？',
    a: 'ベストスコアとプレイ回数がお使いのブラウザに保存されます（サーバーには送信されません）。ブラウザのデータを削除すると消えます。',
  },
];

const trail = breadcrumbFor('pinball');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'ピンボール',
      url: `${SITE_URL}/pinball/`,
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

      <h1>ピンボール</h1>
      <p className="lead">
        球を打ち出して、左右のフリッパーで落とさないように打ち返す定番アクション。
        <strong>的を4つ全部倒すと得点の倍率が上がります</strong>。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>台を押し続けてから離すと、右の通路から球が打ち出されます（長く押すほど強く）</li>
        <li>球が落ちてきたら、台の<strong>左半分をタップすると左のフリッパー</strong>、右半分で右のフリッパーが上がります</li>
        <li>丸いバンパーは100点、横に並ぶ4つの的は250点。的を全部倒すとボーナス1000点で倍率が1つ上がります</li>
        <li>フリッパーのあいだを抜けて球が落ちると1つ減ります。球は3つで、なくなるとゲームオーバーです</li>
        <li>球を落とすと倍率は1に戻り、的も元に戻ります</li>
      </ol>
      <p>
        キーボードでも遊べます。左フリッパーは <strong>←</strong> または Z、右フリッパーは
        <strong> →</strong> または X、打ち出しは<strong>スペース</strong>キーです。
        台の下にある「◀ 左」「右 ▶」のボタンは、押しているあいだフリッパーが上がります。
        ベストスコアはブラウザに保存されます。
      </p>

      <h2>コツ</h2>
      <ul>
        <li>
          フリッパーは<strong>球が来る直前に振る</strong>のが基本です。先に上げて待つと、
          上がりきったフリッパーは球を弾くだけで飛びません。振り上げる勢いがそのまま球に乗ります
        </li>
        <li>
          <strong>先端で受けるほど強く遠くへ飛びます。</strong>支点の近くは打ち返す力が弱いので、
          台の奥（バンパーのあたり）まで球を送りたいときは先の方で当てましょう
        </li>
        <li>
          倍率を上げてからバンパーに送り込むのが高得点の近道です。倍率5倍ならバンパー1回が500点、
          的1つで1250点になります
        </li>
        <li>
          球が速く落ちてきて間に合わないときは、無理に振らずに<strong>反対側のフリッパーで受ける</strong>
          つもりで待つほうが助かることがあります。両方同時に上げるのは、球が真ん中に来たときだけにしましょう
        </li>
        <li>
          フリッパーの上のピンク色の斜面は当たると跳ね返します。ここに当てて球を盤面へ戻すのも手です
        </li>
      </ul>

      <h2>ピンボールについて</h2>
      <p>
        ピンボールは、傾いた台の上で金属の球を打ち返し、バンパーや的に当てて得点を競う遊びです。
        19世紀のテーブルゲームから発展し、20世紀半ばにフリッパーが付いたことで
        「運任せ」から「腕前を競うゲーム」に変わりました。
        のちにパソコンにも標準で付属するようになり、遊んだ記憶のある人も多いジャンルです。
      </p>
      <p>
        このページのピンボールは、プランジャー・フリッパー・バンパー・的という
        最小限の構成で作ったオリジナルの台です。特定の製品の盤面や意匠は使っていません。
        物理はブラウザの中だけで計算していて、サーバーとのやりとりはありません。
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
          .filter((g) => g.ready && g.slug !== 'pinball')
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
