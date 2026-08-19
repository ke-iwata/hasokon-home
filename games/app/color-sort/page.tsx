import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

const title = '色水ソート（水の並べ替えパズル）無料｜ブラウザですぐ遊べる';
const description =
  '無料の色水ソートパズル。色水を試験管の間で注ぎ替えて、同じ色を1本にそろえるだけの簡単ルール。かんたん・ふつう・むずかしいの3段階で、時間制限はありません。タップ2回だけの操作で、インストール不要でブラウザからすぐ遊べます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/color-sort/` },
  robots: robotsFor('color-sort'),
};

const faq = [
  {
    q: 'スマホでも遊べますか？',
    a: '遊べます。操作はタップ2回だけです。注ぎ元の試験管をタップして持ち上げ、注ぎ先の試験管をタップすると色水が移ります。ドラッグやスワイプは使いません。インストールも会員登録も不要です。',
  },
  {
    q: 'どうすればクリアですか？',
    a: 'すべての試験管が「空」か「同じ色で4段そろっている」状態になればクリアです。色が混ざった試験管が1本でも残っているあいだは続きます。',
  },
  {
    q: '注げないことがあるのはなぜですか？',
    a: '注げるのは、注ぎ先が空のときか、注ぎ先のいちばん上の色が同じときだけです。違う色の上には注げません。また、注ぎ先が4段まで埋まっている場合も注げません。上に続いている同じ色はまとめて動き、注ぎ先の空きぶんで止まります。',
  },
  {
    q: '手詰まりになったらどうすればいいですか？',
    a: '「もどす」で直前の手から順に30手までさかのぼれます。それでも戻しきれないときは「最初から」を押すと、同じ問題を配られたときの並びに戻せます。問題そのものを変えたいときは「新しい問題」を押してください。',
  },
  {
    q: '解けない問題が出ることはありますか？',
    a: 'ありません。問題はクリア状態から逆向きに注ぎ戻して作っているので、必ず解ける並びだけが出ます（手順をそのまま逆にたどれば必ずそろいます）。',
  },
  {
    q: '色の見分けがつきにくいのですが',
    a: '「模様をつける」にチェックを入れると、色ごとに違う模様（縞・点・輪など）が重なって表示されます。色の違いだけに頼らずに見分けられます。',
  },
  {
    q: '記録は保存されますか？',
    a: 'クリア回数・最少手数・連続クリアの最高記録が、難易度ごとにお使いのブラウザへ保存されます（サーバーには送信されません）。ブラウザのデータを削除すると消えます。',
  },
];

const trail = breadcrumbFor('color-sort');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: '色水ソート',
      url: `${SITE_URL}/color-sort/`,
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

      <h1>色水ソート</h1>
      {/* リード文は2行に収める（3行にすると盤が画面の外へ出る） */}
      <p className="lead">
        色水を試験管に注ぎ分けて、<strong>同じ色を1本にそろえる</strong>パズル。
        時間制限はありません。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>動かしたい色水が入った試験管をタップします（持ち上がります）</li>
        <li>注ぎたい先の試験管をタップすると、いちばん上の色水がそこへ移ります</li>
        <li>
          注げるのは<strong>空の試験管か、いちばん上が同じ色の試験管だけ</strong>です。
          上に続いている同じ色はまとめて動きます
        </li>
        <li>すべての試験管が「空」か「同じ色で4段」になればクリアです</li>
        <li>選び直したいときは、持ち上がっている試験管をもう一度タップします</li>
      </ol>
      <p>
        手が詰まったら<strong>「もどす」で30手前までさかのぼれます</strong>。
        同じ問題をやり直すなら「最初から」、別の問題に移るなら「新しい問題」を押してください。
        問題はクリア状態から逆向きに作っているので、
        <strong>出てくる問題は必ず解けます</strong>。
        クリア回数・最少手数・連続クリアは難易度ごとにブラウザへ保存されます。
      </p>

      <h2>コツ</h2>
      <ul>
        <li>
          <strong>空の試験管はできるだけ空のまま残す</strong>のが基本です。空きは
          「一時的な置き場」なので、埋めてしまうと動かせる手が一気に減ります
        </li>
        <li>
          注ぐ前に<strong>まとめて動く量を数える</strong>こと。3段そろっている色を
          空きが1段しかない試験管へ注ぐと、2段が取り残されて分断が増えます
        </li>
        <li>
          <strong>あと1段で完成する試験管を優先</strong>します。1本そろえば
          その試験管はもう触らなくてよくなり、実質的に場が1本ぶん広くなります
        </li>
        <li>
          いちばん上に1段だけ乗っている「じゃまな色」を先にどけると、
          その下の色がまとめて動かせるようになることが多いです
        </li>
        <li>
          むずかしい（12色）では、序盤に色を散らかさないこと。
          迷ったら注がずに、他に確実な手がないかを先に探します
        </li>
      </ul>

      <h2>色水ソートというパズルについて</h2>
      <p>
        色のついた水を試験管の間で注ぎ替えて色ごとにそろえるパズルは、
        2021年ごろからスマートフォンの無料パズルとして広まり、いまも定番として
        遊ばれ続けています。ルールは「同じ色の上か空の試験管にだけ注げる」の
        1つだけで、覚えることがほとんどありません。それでいて、
        どの順で注ぐかで手詰まりにも一気に完成にもなるため、
        考えすぎずに手を動かしているうちに整っていく感覚が持ち味です。
        このページの色水ソートも、レベル制や制限時間、救済アイテムのような
        余計な仕掛けを足さず、注ぐ・もどす・やり直すだけの構成にしてあります。
        並べ替えのルール自体は特定の誰かのものではない一般的なパズルで、
        試験管の絵柄と配色はこのサイトで描き起こしたものです。
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
          .filter((g) => g.slug !== 'color-sort')
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
