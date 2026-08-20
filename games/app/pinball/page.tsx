import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

const title = 'ピンボール 無料｜ブラウザで遊べる懐かしのテーブル';
const description =
  '無料のピンボール。プランジャーで球を打ち出し、左右のフリッパーで打ち返して、バンパー・的・スピナー・吸い込みホール・天井のレーンで点を稼ぐ定番アクション。インストール不要でブラウザからすぐ遊べます。スマホは画面の左右をタップして操作。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/pinball/` },
  robots: robotsFor('pinball'),
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
    a: '丸いバンパーは100点、左に階段状に並ぶ3つの的は250点です。盤面の右にある紫色の吸い込みホールに入ると500点で、球をしばらく抱えたあと上へ撃ち出されます。天井の3つのレーンは通るたびに50点。打ち出しの通路にあるスピナー（回転板）は、回っているあいだ半回転ごとに60点が入ります。フリッパーの上のピンク色の斜面（スリングショット）も、勢いよく当たると10点です。',
  },
  {
    q: '倍率はどうすれば上がりますか？',
    a: '上げ方は2つあります。左の3つの的をすべて倒すか、天井の3つのレーンをすべて通すかで、それぞれボーナス1000点と倍率+1が入ります（最大5倍）。どちらも倍率が上がると元に戻るので、繰り返し狙えます。ただし球を落とすと倍率は1に戻ります。',
  },
  {
    q: 'スピナーはどうすれば回りますか？',
    a: '打ち出した球が通路を上るときに必ず通ります。強く打ち出すほど長く回り、回っているあいだずっと点が入り続けます。プランジャーを長く押してから離すのが、いちばん簡単な稼ぎ方です。',
  },
  {
    q: '球が吸い込まれて出てこなくなりました',
    a: 'まんなかの紫色のホールは球を0.7秒ほど抱えてから、上のバンパーへ向けて自動で撃ち出します。縁の光る輪が残り時間なので、なくなると出てきます。抱えているあいだは球を失いません。',
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
        <strong>左の的を全部倒すか、左の周回レーンを回して天井のレーンをそろえると倍率が上がります</strong>。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>台を押し続けてから離すと、右の通路から球が打ち出されます（長く押すほど強く）</li>
        <li>球が落ちてきたら、台の<strong>左半分をタップすると左のフリッパー</strong>、右半分で右のフリッパーが上がります</li>
        <li>丸いバンパーは100点、左の階段状の的は250点、右の吸い込みホールは500点</li>
        <li>的を3つ全部倒すか、天井の3つのレーンを全部通すと、ボーナス1000点で倍率が1つ上がります（最大5倍）</li>
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
        <li>
          <strong>左へ打ち上げると台をぐるりと回ります。</strong>左の壁ぎわの通路
          （周回レーン）に入った球は、上を通って反対側から降りてきます。
          途中の天井のレーンを3つ通せば倍率が上がるので、狙う価値のある一撃です
        </li>
        <li>
          <strong>打ち出しは強いほど得です。</strong>通路の途中にあるスピナー（回転板）は、
          強く打つほど長く回り、回っているあいだずっと点が入ります
        </li>
        <li>
          まんなかの<strong>吸い込みホール</strong>は、入ると球を少し抱えてから上へ撃ち出します。
          そのあいだ球を失わないので、落ちそうなときの逃げ道にもなります
        </li>
        <li>
          倍率を上げる道は2つあります。<strong>左の的3つ</strong>と<strong>天井のレーン3つ</strong>で、
          レーンは左の周回レーンの中にあります。左へ強く打ち上げると、球が台をぐるりと回って3つとも通ります
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
        このページのピンボールは、左の周回レーン・右の戻りレーン・バンパー・的・
        スピナー・吸い込みホール・天井のレーンで組んだオリジナルの台です。
        特定の製品の盤面や意匠は使っていません。
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
        {publicGames
          .filter((g) => g.slug !== 'pinball')
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
