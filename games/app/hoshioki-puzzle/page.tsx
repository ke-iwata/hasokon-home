import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';
import { MODES } from '@/lib/hoshioki-puzzle';

/**
 * 盤の大きさは**設定から引く**（ページの文言に数字を書き写さない）。
 * モードを足したり大きさを変えたりしたときに、解説だけが古い数字で残るのを防ぐ。
 */
const sizes = `${MODES.easy.size}×${MODES.easy.size}〜${MODES.hard.size}×${MODES.hard.size}`;
const dailySize = `${MODES.daily.size}×${MODES.daily.size}`;

const title = '星置きパズル（スターバトル）無料｜ブラウザですぐ遊べる';
const description = `無料のスターバトル系パズル「星置きパズル」。各行・各列・各ブロックに星を1つずつ置き、星どうしは斜めも隣り合わないように並べます。${sizes}の3段階と、毎日変わる「今日の1問」（${dailySize}）つき。答えは必ず1通り。インストール不要でスマホからもすぐ遊べます。`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/hoshioki-puzzle/` },
  robots: robotsFor('hoshioki-puzzle'),
};

const faq = [
  {
    q: 'どんなルールですか？',
    a: '太い線で区切られた領域と、各行・各列に星をちょうど1つずつ置きます。星どうしは斜めを含めて隣り合ってはいけません。この3つを同時に満たす置き方は1通りだけです。',
  },
  {
    q: '「×」は何ですか？',
    a: '「ここには星を置かない」と自分で決めた印です。パズルの正解には関係しないメモなので、いくつ付けても消しても構いません。マスをタップするたびに 空 → × → ★ → 空 と変わります。',
  },
  {
    q: 'スマホでも遊べますか？',
    a: '遊べます。マスをタップすると印が切り替わり、長押しするといきなり星を置けます。インストールも会員登録も不要です。',
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
    a: 'ありません。自分で見つけるのがこの種のパズルの中身だからです。かわりに、ルールに反している星（同じ行・列・領域に2つ、または隣り合っている星）は赤で示します。正解かどうかは教えません。',
  },
  {
    q: '出てくる問題は必ず解けますか？',
    a: '解けます。問題は作るたびにソルバーで解の数を数えていて、答えが1通りのものだけを出しています。当てずっぽうを使わず、筋道だけで最後まで解けるかどうかも確かめています。',
  },
  {
    q: '記録は保存されますか？',
    a: 'ベストタイムとクリア回数が、難易度ごとにお使いのブラウザへ保存されます（サーバーには送信されません）。「今日の1問」はこれに加えて連続日数を保存します。',
  },
];

const trail = breadcrumbFor('hoshioki-puzzle');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: '星置きパズル',
      url: `${SITE_URL}/hoshioki-puzzle/`,
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

      {/* 「星置きパズル」は造語なので、ジャンル名（スターバトル）を h1 に併記する */}
      <h1>星置きパズル（スターバトル）</h1>
      {/* リード文は2行に収める（3行にすると盤が画面の外へ出る） */}
      <p className="lead">
        各行・各列・各ブロックに<strong>星を1つずつ</strong>。
        星どうしは斜めも隣り合いません。答えは必ず1通りです。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊びかた</h2>
      <ol>
        <li>
          太い線で区切られた<strong>領域</strong>・<strong>各行</strong>・<strong>各列</strong>に、
          星をちょうど1つずつ置きます
        </li>
        <li>
          星どうしは<strong>斜めを含めて隣り合えません</strong>（上下左右と斜めの8マス）
        </li>
        <li>マスをタップするたびに 空 → ×（置かない印）→ ★ → 空 と変わります</li>
        <li>
          <strong>PCは右クリック、スマホは長押し</strong>でいきなり星を置けます
        </li>
        <li>
          星を置くと、同じ行・列・領域と周りの8マスに<strong>自動で×が入ります</strong>
          （切ることもできます）
        </li>
      </ol>
      <p>
        行き詰まったら<strong>「もどす」</strong>で1手ずつさかのぼれます。
        <strong>「チェック」</strong>はルールに反している星があるかどうかだけを見ます
        （どこが正解かは教えません）。ベストタイムとクリア回数は難易度ごとに保存されます。
      </p>

      <h2>星置きパズルとは</h2>
      <p>
        盤を区切った領域と、行・列のそれぞれに星を1つずつ置く純粋な論理パズルです。
        2003年の世界パズル選手権で出題されて広まったもので、
        海外では「スターバトル」の名で知られています。
        数字を使わないので計算はいっさい要らず、
        「この領域はこの行にしか置けない」という<strong>消去法だけ</strong>で最後まで解けます。
        このサイトの問題は、作るたびに<strong>答えが1通りであることを確かめて</strong>から
        出していて、当てずっぽうを使わずに解き切れるかどうかも機械で確認しています。
      </p>

      <h2>今日の1問と連続日数</h2>
      <p>
        「今日の1問」は<strong>日付から組み立てる、その日だけの問題</strong>です。
        同じ日に開いた人には全員同じ盤面が出ます。クリアすると
        <strong>連続日数</strong>が1つ増え、1日空けると1に戻ります。
        サーバーもアカウントも使っていないので、
        <strong>連続日数はお使いの端末のブラウザにだけ残ります</strong>。
        別の端末やブラウザでは引き継げず、プライベートブラウズでは保存されません。
        クリア後の「結果をコピー」で共有できる文面には、
        <strong>星の位置（答え）は入りません</strong>。
      </p>

      <h2>コツ</h2>
      <ul>
        <li>
          <strong>小さい領域から手を付ける</strong>のが基本です。マスの少ない領域ほど
          置ける場所が限られていて、1マスに絞り込める可能性が高くなります
        </li>
        <li>
          <strong>1つの行（列）にすっぽり収まった領域</strong>を探します。その領域が
          行の中にしか無いなら、その行の星はその領域の中にあるので、
          行の残りのマスはすべて×です
        </li>
        <li>
          逆に、<strong>ある行の空きマスが1つの領域だけ</strong>に収まっていたら、
          その領域の星はその行にあります。領域の他の行のマスは×です
        </li>
        <li>
          星を置いたら、<strong>周りの8マスを必ず×にする</strong>こと。斜めの隣接を
          見落とすのがいちばん多い間違いです（自動で×を入れる設定を使うと防げます）
        </li>
        <li>
          手が止まったら<strong>「ここに置くとどうなるか」を1手だけ読む</strong>と
          進むことがあります。どこかの領域が置き場所を失うなら、そのマスは×です
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
          .filter((g) => g.slug !== 'hoshioki-puzzle')
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
