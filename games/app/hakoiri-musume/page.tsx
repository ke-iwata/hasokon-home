import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';
import { levelById, levelsOf } from '@/lib/hakoiri-musume';

/**
 * 最短手数は**盤面データから引く**（ページの文言に数字を書き写さない）。
 * 数え方を変えたりデータを差し替えたりしたときに、解説だけが古い数字のまま残るのを防ぐ。
 */
const standardMinMoves = levelById('standard').minMoves;
const levelCount = levelsOf('easy').length + levelsOf('standard').length + levelsOf('hard').length;

const title = '箱入り娘（スライドパズル）無料｜ブラウザですぐ遊べる';
const description = `無料の箱入り娘（スライドブロックパズル）。4×5の盤で駒を滑らせ、大きな「娘」を下の出口まで運びます。伝統的な標準配置のほか、やさしい配置とむずかしい配置をあわせて全${levelCount}面。最短手数つきで、1手もどす・最初からも使えます。インストール不要でスマホからもすぐ遊べます。`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/hakoiri-musume/` },
  robots: robotsFor('hakoiri-musume'),
};

const faq = [
  {
    q: 'スマホでも遊べますか？',
    a: '遊べます。動かしたい駒を指ではらう（スワイプする）と、空いているところまで滑ります。はらうのが難しいときは、駒をタップして選んでから行き先の空きマスをタップしても動かせます。インストールも会員登録も不要です。',
  },
  {
    q: 'どうすればクリアですか？',
    a: '大きな「娘」の駒（2×2）を、盤の下の中央にある出口まで下ろせばクリアです。ほかの駒がどこにあっても、娘さえ出口に着けば終わりです。',
  },
  {
    q: '手数はどう数えますか？',
    a: '駒1つを1回動かして1手です。1回はらって何マス滑っても1手のままですが、方向を変えるたびに1手増えます（下へ動かしてから右へ動かすのは2手）。',
  },
  {
    q: '標準配置は何手で解けますか？',
    a: `このゲームの数え方（1方向への移動を1手）では最短${standardMinMoves}手です。パズルの文献でよく見る「81手」は、駒ごとに数えて角を曲がる移動も1手とする別の数え方の値なので、この画面に出る手数とは一致しません。`,
  },
  {
    q: '出てくる配置は必ず解けますか？',
    a: '解けます。すべての配置は、実装時に総当たりの探索（幅優先探索）で娘が出口に着くことを確かめてあり、その最短手数を画面に出しています。解けない配置は入っていません。',
  },
  {
    q: 'ヒント機能はありますか？',
    a: 'ありません。次の1手を光らせると、自分で解く楽しさが無くなってしまうためです。かわりに「1手もどす」が手数の制限なく使えるので、行き詰まったら戻ってやり直してください。',
  },
  {
    q: '記録は保存されますか？',
    a: 'クリア回数・最少手数・ベストタイムが、レベルごとにお使いのブラウザへ保存されます（サーバーには送信されません）。ブラウザのデータを削除すると消えます。',
  },
];

const trail = breadcrumbFor('hakoiri-musume');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: '箱入り娘',
      url: `${SITE_URL}/hakoiri-musume/`,
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

      <h1>箱入り娘</h1>
      {/* リード文は2行に収める（3行にすると盤が画面の外へ出る） */}
      <p className="lead">
        駒を滑らせて、大きな<strong>「娘」を下の出口まで運ぶ</strong>パズル。
        時間制限はありません。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊びかた</h2>
      <ol>
        <li>動かしたい駒を、動かしたい方向へ指ではらいます（PCではドラッグ）</li>
        <li>
          駒は<strong>空いているところまで滑ります</strong>。何マス滑っても1手です
        </li>
        <li>
          はらうのが難しいときは、<strong>駒をタップして選び、行き先の空きマスをタップ</strong>
          しても動かせます
        </li>
        <li>駒は跳び越せません。回転もしません（縦長の駒は縦長のままです）</li>
        <li>
          <strong>「娘」を盤の下の出口（太い線のところ）まで下ろせばクリア</strong>です
        </li>
      </ol>
      <p>
        行き詰まったら<strong>「1手もどす」</strong>で何手でもさかのぼれます。
        同じ配置をやり直すなら「最初から」を押してください。
        手数の右に出る「最短」は、その配置を解くのに最低限かかる手数です。
        クリア回数・最少手数・ベストタイムはレベルごとにブラウザへ保存されます。
      </p>

      <h2>箱入り娘とは</h2>
      <p>
        4×5の箱に10個の駒を詰め、駒を滑らせて大きな駒を外に出すスライドブロックパズルです。
        よく似たパズルの特許は1900年代のはじめに出願されていて、
        日本では1930年代ごろから「箱入り娘」の名で親しまれてきました。
        中国では「華容道」の名で古くから遊ばれています。ルールそのものは
        100年以上前からある公有のもので、木のおもちゃとしても数多く作られてきました。
        駒には伝統的に「娘」「父」「母」「番頭」「丁稚」といった呼び名がついていますが、
        遊ぶうえで区別する必要があるのは娘だけなので、
        このページでは<strong>娘だけに文字を入れ、ほかの駒は形と色で分けています</strong>。
      </p>

      <h2>標準配置の最短手数</h2>
      <p>
        伝統的な標準配置（娘が上の中央、縦長の駒が両脇、その下に横長の駒、
        下に小さい駒が4つ）は、<strong>このゲームの数え方で最短{standardMinMoves}手</strong>です。
        パズルの文献では「81手」とされることが多いのですが、これは
        <strong>駒ごとに数え、角を曲がる移動も1手に含める</strong>数え方の値で、
        数え方が違うぶん手数も変わります（Martin Gardner「Scientific American」1964年2月号、
        ウィキペディア日本語版「箱入り娘 (パズル)」）。
        このゲームでは<strong>1方向への移動を1手</strong>と数えます。
        1回はらって3マス滑っても1手、下に動かしてから右に動かせば2手です。
        画面に出る最短手数は、どれも実装時に総当たりの探索で求めた値です。
      </p>

      <h2>コツ</h2>
      <ul>
        <li>
          <strong>娘の下に横長の駒を通す</strong>のが基本の形です。横長の駒は横には
          動かしやすいので、娘の前を横切らせてから縦長の駒で押し下げます
        </li>
        <li>
          <strong>小さい駒は角に集める</strong>と、空き2マスが縦か横に並びやすくなります。
          空きが並んでいるほど大きな駒を動かせます
        </li>
        <li>
          空き2マスを<strong>娘の進みたい側にそろえる</strong>こと。空きが盤の左右に
          離れていると、娘も横長の駒も1マスも動けません
        </li>
        <li>
          手詰まりに見えても、たいていは<strong>縦長の駒の上下の入れ替え</strong>で
          空きの場所を移せます。娘を動かすのは最後で構いません
        </li>
        <li>
          むずかしい配置は100手前後かかります。行きつ戻りつが前提なので、
          「1手もどす」で気軽に試してください
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
          .filter((g) => g.slug !== 'hakoiri-musume')
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
