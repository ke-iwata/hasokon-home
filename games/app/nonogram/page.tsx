import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

// 「ピクロス」（任天堂）「お絵かきロジック」（世界文化社）「イラストロジック」は
// いずれも他社の登録商標。タイトル・見出し・meta title には入れない。
// 検索流入のために商標を名前に使うのは割に合わないという判断
// （docs/features/game-nonogram.md の「権利関係」）
const title = 'ノノグラム 無料｜数字から絵を描くお絵かきパズル';
const description =
  '無料のノノグラム（数字ロジックパズル）。行と列の数字をヒントにマスを塗ると絵が浮かび上がります。5×5・10×10・15×15の全30問、答えはすべて1通り。なぞって連続塗り・もどす機能つきで、インストール不要・登録不要。スマホ対応。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/nonogram/` },
  robots: robotsFor('nonogram'),
};

const faq = [
  {
    q: 'ノノグラムはどんなパズル？',
    a: '行と列の端に並ぶ数字をヒントに、塗るマスを論理だけで決めていくパズルです。数字は「その行（列）で連続して塗るマスの数」を左から（上から）順に表しています。すべて正しく塗ると絵が浮かび上がります。お絵かきロジック・ピクロスなどの名前で呼ばれることもある、同じルールのパズルです。',
  },
  {
    q: '答えが2通りになることはありますか？',
    a: 'ありません。出題している30問はすべて、答えが1通りしかないことをプログラムで検証してから収録しています。当てずっぽうを強いられる場面はないので、必ず論理だけで解き切れます。',
  },
  {
    q: '何問ありますか？',
    a: '5×5・10×10・15×15が10問ずつ、合わせて30問です。一度解いた問題はブラウザに記録され、その難易度を解き切るまで同じ問題は出題されません。',
  },
  {
    q: 'スマホで遊べますか？',
    a: '遊べます。タップで塗り、そのままなぞると縦か横に続けて塗れます。斜めに指がぶれても一直線に固定されるので、行がずれることはありません。「×印モード」に切り替えると、塗らないと決めたマスに印を付けられます。',
  },
  {
    q: '×印は何のためにありますか？',
    a: '「ここは絶対に塗らない」と確定したマスに付ける目印です。塗るマスと同じくらい、塗らないマスを確定させることが解く手がかりになります。付けなくてもクリア判定には影響しません。',
  },
];

const trail = breadcrumbFor('nonogram');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'ノノグラム',
      url: `${SITE_URL}/nonogram/`,
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

      <h1>ノノグラム</h1>
      <p className="lead">
        数字をヒントにマスを塗っていくと、<strong>最後に絵が浮かび上がる</strong>お絵かきパズル。全30問、答えはすべて1通りなので、運に頼らず論理だけで解き切れます。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>行の左・列の上に並ぶ数字は、その行（列）で<strong>連続して塗るマスの数</strong>です</li>
        <li>数字が2つ以上あるときは、その順番どおりに並び、かたまりの間は1マス以上空きます</li>
        <li>マスを押すと塗れます。そのままなぞると、縦か横にまとめて塗れます</li>
        <li>塗らないと決めたマスには×印を付けられます（PCは右クリック、スマホは「×印モード」）</li>
        <li>すべての数字どおりに塗れたらクリアです。絵の名前が表示されます</li>
      </ol>

      <h2>コツ</h2>
      <ul>
        <li>
          <strong>端から考えるのが基本です。</strong>
          10マスの行に「8」とあれば、左端から数えても右端から数えても塗られる真ん中の6マスは確定します
        </li>
        <li>数字の合計＋かたまりの間の空きが幅ちょうどになる行・列は、そのまま全部確定します。まずそこから埋めましょう</li>
        <li>
          <strong>塗れないマスに×印を付けると一気に進みます。</strong>
          「塗れない」が確定すると、その両側のかたまりの置き場所が狭まるためです
        </li>
        <li>行と列を交互に見直します。片方で確定したマスが、もう片方の手がかりになります</li>
        <li>満たし終えた行・列の数字は薄くなるので、まだ手つかずの場所が一目で分かります</li>
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
          .filter((g) => g.slug !== 'nonogram')
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
