import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';
import { MODES } from '@/lib/suji-hitofude';

/**
 * 盤の大きさは**設定から引く**（ページの文言に数字を書き写さない）。
 * モードを足したり大きさを変えたりしたときに、解説だけが古い数字で残るのを防ぐ。
 */
const sizes = `${MODES.easy.size}×${MODES.easy.size}〜${MODES.hard.size}×${MODES.hard.size}`;
const dailySize = `${MODES.daily.size}×${MODES.daily.size}`;

const title = '数字つなぎ一筆書き — 数字を順につないで全マスを一筆書き。毎日変わる今日の1問つき';
// 「LinkedIn の Zip と同じルール」への言及は description の1回にとどめる（仕様書の「名称と権利」。
// 名称の使用ではなく言及。ページ本文・見出しには書かない）
const description = `無料の一筆書きパズル「数字つなぎ一筆書き」。1から順に数字をたどり、全マスを1本の道で通ります（LinkedInのZipと同じルール）。${sizes}の3段階と、毎日変わる「今日の1問」（${dailySize}）つき。答えは必ず1通り。インストール不要でスマホからもすぐ遊べます。`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/suji-hitofude/` },
  robots: robotsFor('suji-hitofude'),
};

const faq = [
  {
    q: 'どんなルールですか？',
    a: '「1」のマスから始めて、番号を1, 2, 3…と小さい順にたどる1本の道を引きます。道は上下左右にだけ進み、すべてのマスをちょうど1回ずつ通って、最後の番号で終わります。むずかしいでは、太い線（壁）のところは通れません。',
  },
  {
    q: 'スマホでも遊べますか？',
    a: '遊べます。「1」のマスから指を離さずになぞると道が伸び、1つ前のマスに戻ると道が縮みます。指を離しても道は残るので、道の先端からなぞると続きを引けます。インストールも会員登録も不要です。',
  },
  {
    q: '間違えたらどうなりますか？',
    a: '番号を飛ばす・壁を越える・通ったマスに戻る動きは、その場で止まって道が伸びません。ペナルティはありません。「もどす」で1マスずつ、「最初から」で全部消せます。',
  },
  {
    q: '「今日の1問」とは何ですか？',
    a: '日付から作る、その日だけの問題です。同じ日に開いた人には全員同じ盤面が出ます。サーバーは使っておらず、お使いの端末の日付（ローカル日付）から問題を組み立てています。',
  },
  {
    q: '連続日数はどこに保存されますか？',
    a: 'お使いの端末のブラウザに保存しています。サーバーには送信していないので、別の端末やブラウザでは引き継げません。ブラウザのデータを削除したときや、プライベートブラウズで遊んだときも残りません。',
  },
  {
    q: 'ヒント機能はありますか？',
    a: 'ありません。道を自分で見つけるのがこの種のパズルの中身だからです。正解かどうかも途中では教えません。全マスを通って最後の番号に着いた時点で、自動でクリアになります。',
  },
  {
    q: '出てくる問題は必ず解けますか？',
    a: '解けます。問題は作るたびにソルバーで解の数を数えていて、道が1通りに決まるものだけを出しています。',
  },
  {
    q: '記録は保存されますか？',
    a: 'ベストタイムとクリア回数が、難易度ごとにお使いのブラウザへ保存されます（サーバーには送信されません）。「今日の1問」はこれに加えて連続日数を保存します。',
  },
];

const trail = breadcrumbFor('suji-hitofude');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: '数字つなぎ一筆書き',
      url: `${SITE_URL}/suji-hitofude/`,
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

      <h1>数字つなぎ一筆書き</h1>
      {/* リード文は2行に収める（3行にすると盤が画面の外へ出る） */}
      <p className="lead">
        1から<strong>数字を順に</strong>たどり、<strong>全マスを一筆書き</strong>。
        答えは必ず1通りです。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊びかた</h2>
      <ol>
        <li>
          <strong>「1」のマスから</strong>指（マウス）を離さずになぞると、道が伸びます
        </li>
        <li>
          番号を<strong>1, 2, 3…と小さい順に</strong>通ります。道は上下左右にだけ進めます（斜めは不可）
        </li>
        <li>
          <strong>すべてのマスをちょうど1回ずつ</strong>通り、<strong>最後の番号</strong>で終わるとクリアです
        </li>
        <li>
          <strong>1つ前のマスに戻ると道が縮みます</strong>。指を離しても道は残り、
          道の先端からなぞると続きを引けます
        </li>
        <li>
          むずかしいでは、マスの間の<strong>太い線（壁）</strong>を越えられません
        </li>
      </ol>
      <p>
        番号を飛ばす・壁を越える・通ったマスに戻る動きは<strong>その場で止まります</strong>
        （ペナルティはありません）。「もどす」で1マスずつ、「最初から」で全部消せます。
        PCでは盤をクリックしてから矢印キーでも道を伸ばせます。
        ベストタイムとクリア回数は難易度ごとに保存されます。
      </p>

      <h2>数字つなぎ一筆書きとは</h2>
      <p>
        番号をヒントに、盤のすべてのマスを1本の道で通る<strong>数字つなぎ</strong>の一筆書きパズルです。
        計算はいっさい要らず、「このマスはこの向きからしか入れない」という
        <strong>行き止まりの見きわめ</strong>だけで道が決まっていきます。
        盤は{sizes}の3段階で、このサイトの問題は作るたびに
        <strong>道が1通りに決まることを確かめて</strong>から出しています。
      </p>

      <h2>今日の1問と連続日数</h2>
      <p>
        「今日の1問」は<strong>日付から組み立てる、その日だけの問題</strong>（{dailySize}）です。
        同じ日に開いた人には全員同じ盤面が出ます。クリアすると
        <strong>連続日数</strong>が1つ増え、1日空けると1に戻ります。
        サーバーもアカウントも使っていないので、
        <strong>連続日数はお使いの端末のブラウザにだけ残ります</strong>。
        別の端末やブラウザでは引き継げず、プライベートブラウズでは保存されません。
        クリア後の「結果をコピー」で共有できる文面には、
        <strong>道の形（答え）は入りません</strong>。
      </p>

      <h2>コツ</h2>
      <ul>
        <li>
          <strong>角と端のマスから考える</strong>のが基本です。角のマスは出入り口が2つしかないので、
          通り道がほぼ決まります
        </li>
        <li>
          道を引いたあと、<strong>出入り口が1つしか残っていないマス</strong>ができたら、
          そこは最後の番号でない限り行き止まりです。1つ前に戻って別の向きを試します
        </li>
        <li>
          <strong>残りのマスが2つに分かれたら</strong>、その道は失敗です。一筆書きでは、
          分かれた両方を通ることはできません
        </li>
        <li>
          次の番号が遠いときは、<strong>途中でどのマスを拾っていくか</strong>を先に考えます。
          番号のあいだで通り残したマスは、あとから取りに戻れません
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
          .filter((g) => g.slug !== 'suji-hitofude')
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
