import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import GameIcon from '@/app/GameIcon';
import Game from './Game';
import {
  ANGLE_LIMIT,
  FACE_IDS,
  FACES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  POSITION_LIMIT,
  PREVIEW_MS,
  ROTATE_STEP,
} from '@/lib/fukuwarai';

/**
 * 福笑い。仕様: docs/features/game-fukuwarai.md
 *
 * 数（秒数・人数・採点の閾値）は**設定から引く**（ページの文言に数字を書き写さない）。
 * 由来の節は、仕様書の約束どおり**出典が取れるまで書かない**（言い伝えを出典なしで書かない）。
 */

const faceNames = FACE_IDS.map((id) => FACES[id].name).join('・');
const previewSec = PREVIEW_MS / 1000;
const positionPct = Math.round(POSITION_LIMIT * 100);

const title = '福笑い 無料｜お正月の目かくし遊び・家族で順番に（インストール不要）';
const description =
  '目かくしで、まゆ・目・鼻・口を置いて顔を作るお正月の遊び。スマホでもPCでも、インストールなしですぐ遊べます。家族で順番に遊べるモード・点数・できた顔の画像保存つき。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/fukuwarai/` },
  robots: robotsFor('fukuwarai'),
};

const faq = [
  {
    q: '無料ですか？',
    a: '無料です。登録もインストールも要りません。ブラウザでページを開けばすぐ遊べます。',
  },
  {
    q: 'スマホで遊べますか？',
    a: 'スマホでもタブレットでもPCでも遊べます。スマホはパーツを指でドラッグするか、パーツをタップで選んでから顔の上をタップして置きます。回すときは「↺」「↻」のボタンを使います。',
  },
  {
    q: '印刷して遊べますか？',
    a: 'いまは印刷用の型紙はありません。できた顔は「画像で保存」で端末に保存できます（画像はどこにも送信しません）。',
  },
  {
    q: '点数はどうやって決まりますか？',
    a: `パーツごとに、正しい場所からのずれ（8割）と向きのずれ（2割）で点を付け、6枚の点を合わせて100点満点にします。顔の幅の${positionPct}%ずれたパーツと、顔の外に置いたパーツは0点、向きは${ANGLE_LIMIT}度ずれると向きの点が0になります。目と口は顔の印象を大きく変えるので、まゆと鼻より重く数えます。`,
  },
  {
    q: '左右を逆に置いたらどうなりますか？',
    a: '左右を逆に置いても点は下がりません（見た目はちょっと変になります）。左右の目・まゆは鏡に映した形なので、入れ替えると目じりやまゆ尻が内側を向きます。それも福笑いの楽しみとして、減点しません。鼻と口は入れ替えの対象ではありません。',
  },
  {
    q: '家族で遊ぶときの名前は保存されますか？',
    a: '保存しません。名前はこの画面の中だけで使い、ページを読み込み直すと消えます。画像に名前を入れるのも、「画像に名前を入れる」を選んだときだけです。',
  },
  {
    q: '記録はどこに保存されますか？',
    a: 'ベスト点が、顔の種類と難易度ごとにお使いの端末のブラウザへ保存されます（サーバーには送信しません）。今日のお題はその日のベストと連続日数を保存します。',
  },
];

const trail = breadcrumbFor('fukuwarai');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: '福笑い',
      url: `${SITE_URL}/fukuwarai/`,
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

      <h1>福笑い</h1>
      <p className="lead">目かくしで顔のパーツを置いて、どんな顔になるか笑おう。</p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊びかた</h2>
      <ol>
        <li>
          お題の顔（{faceNames}）と難易度を選んで「はじめる」を押します。「今日のお題」は全員同じ顔・同じ並びです
        </li>
        <li>
          <strong>正解の顔が{previewSec}秒だけ見えます</strong>。どこに何があるかをおぼえてください
        </li>
        <li>
          顔が消えたら、下（PCでは右）の置き場にある<strong>まゆ・目・鼻・口の6枚</strong>を、ドラッグか
          「タップで選んでから顔の上をタップ」で置きます。<strong>ふつう・むずかしいでは、置いたパーツは見えません</strong>
        </li>
        <li>
          パーツは最初から少し傾いています。置き場の中で選んで、ホイール・Q/Eキー・「↺」「↻」のボタンで{ROTATE_STEP}度ずつ回せます（置き場を出たら回せません）
        </li>
        <li>
          6枚置いたら<strong>「めかくしを とる」</strong>。できた顔と点数が出ます。「正解の顔を重ねる」で正しい位置も見られます
        </li>
      </ol>
      <p>
        キーボードだけでも遊べます。Tab キーでパーツを選び、矢印キーで顔の上の照準を動かし（Shift で大きく）、Enter キーで置きます。
        C キーで照準を顔のまんなかに戻せます。
      </p>

      <h2>難易度のちがい</h2>
      <ul>
        <li>
          <strong>かんたん</strong>：顔の輪郭がはっきり残り、置いたパーツも見えます。小さい子向け
        </li>
        <li>
          <strong>ふつう</strong>：輪郭がうっすら残ります。置き場を出たパーツは見えません（紙の福笑いと同じ）
        </li>
        <li>
          <strong>むずかしい</strong>：輪郭も消えて、真っ白な紙の上に置きます。顔の上ではマウスのカーソルも消えます
        </li>
      </ul>
      <p>記録は難易度ごとに分けてあります（かんたんは置いたパーツが見えるので、ふつうと同じ表には混ぜません）。</p>

      <h2>家族で順番に遊ぶ</h2>
      <p>
        「家族で順番に」を選び、{MIN_PLAYERS}〜{MAX_PLAYERS}人の名前（空欄なら「1ばん」「2ばん」…）を入れて遊びます。
        1人終わるごとに「次は ◯◯ さん。スマホを渡してね」の画面になり、<strong>前の人の顔は伏せてあります</strong>。
        全員終わると<strong>みんなの顔が並び</strong>、点数の順位と、点数とは別に「いちばん笑えた顔」を選んで<strong>大賞</strong>の札を付けられます。
      </p>
      <ul>
        <li>お正月の帰省で、スマホを回して順番に遊ぶのにちょうどいい長さです（1人30秒〜1分）</li>
        <li>小さい子は「かんたん」、大人は「むずかしい」と、難易度を変えて遊ぶのもおすすめです</li>
        <li>
          できた顔は「画像で保存」で端末に保存できます。<strong>名前は、選んだときだけ画像に入ります</strong>
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
          .filter((g) => g.slug !== 'fukuwarai')
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
