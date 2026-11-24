import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import GameIcon from '@/app/GameIcon';
import Game from './Game';

const title = '15パズル（スライドパズル）無料｜3×3・4×4・5×5・写真で遊べる';
const description =
  '無料の15パズル（スライドパズル）。空きマスに数字の板をすべらせて1から順に並べます。3×3・4×4・5×5の3つの大きさと、全員が同じ盤を解く「今日の1面」、自分の写真で遊べる絵合わせつき。3×3は最短手数とヒントを表示。必ず解ける盤だけを配ります。インストール不要でスマホからもすぐ遊べます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/15-puzzle/` },
  robots: robotsFor('15-puzzle'),
};

const faq = [
  {
    q: '最短手数は何手ですか？',
    a: '3×3（8パズル）はどの盤でも最短31手以内で解けることが知られていて、このゲームでは配った盤ごとの最短手数を開始時に出しています。4×4（15パズル）はどの盤も80手以内で解けることが確かめられていますが、盤ごとの最短を求めるのに時間がかかるため、このゲームでは表示していません。',
  },
  {
    q: '写真は送信されますか？',
    a: '送信されません。選んだ写真はお使いの端末のブラウザの中だけで切り分けて使い、サーバーへの送信も保存もしません。ページを閉じたり別の写真を選んだりすると、前の写真は捨てられます。',
  },
  {
    q: '解けない盤は出ますか？',
    a: '出ません。15パズルには、どう動かしても完成しない並べ方が全体のちょうど半分あります。このゲームは配る前に解けるかどうかを計算で確かめ、解ける盤だけを出しています。',
  },
  {
    q: '手数はどう数えますか？',
    a: '動いた板の枚数で数えます。空きと同じ行や列の遠い板を押すと、あいだの板がまとめてすべりますが、そのときは動いた枚数ぶん（3枚なら3手）増えます。1枚ずつ動かしたのと同じ数になるので、最短手数とそのまま比べられます。',
  },
];

const trail = breadcrumbFor('15-puzzle');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: '15パズル',
      url: `${SITE_URL}/15-puzzle/`,
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

      <h1>15パズル</h1>
      {/* リード文は1行に収める（2行にすると盤が画面の外へ出る） */}
      <p className="lead">板をすべらせて、1から順に並べるパズル。</p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊びかた</h2>
      <ol>
        <li>空きマスの隣の板を押す（タップ・クリック）と、その板が空きへすべります</li>
        <li>
          <strong>空きと同じ行・列の遠い板を押すと、あいだの板がまとめてすべります</strong>。
          手数は動いた板の枚数で数えます
        </li>
        <li>板を空きの方へ指ではらって（スワイプして）も動かせます</li>
        <li>
          左上から 1, 2, 3 … と並び、<strong>右下が空けば完成</strong>です
        </li>
      </ol>
      <p>
        大きさは<strong>3×3（かんたん）・4×4（ふつう）・5×5（むずかしい）</strong>から選べます。
        <strong>今日の1面</strong>は日付で決まる4×4の盤で、同じ日なら誰が開いても同じ盤です。
        クリアすると手数と時間を共有できます（盤そのものは載せません）。
        <strong>写真</strong>を選ぶと、自分の写真を切り分けた絵合わせになります。
        写真は端末の中だけで使い、送信も保存もしません。
        3×3では開始時に<strong>最短手数</strong>を出し、
        <strong>ヒント</strong>を押すと最短の次の一手が光ります。
        4×4・5×5のヒントは「上の段から順に揃える」解き方に沿った一手で、最短とは限りません。
      </p>
      <p>
        キーボードでは矢印キーで動かせます。← を押すと空きの右の板が左へ入ります
        （向きは「画面の見かた」で反転できます）。
        「完成図」を押しているあいだは、完成した形が重なって見えます。
        記録（クリア回数・最少手数・ベストタイム・今日の1面の連続日数）は大きさごとにブラウザへ保存されます。
      </p>

      <h2>コツ</h2>
      <ul>
        <li>
          <strong>上の段から順に揃え、揃えた段はもう崩さない</strong>のが基本です。
          4×4なら上の段 → 左の列 → 残りの3×3、の順に片づけます
        </li>
        <li>
          <strong>段の最後の2枚は2枚まとめて入れます</strong>。たとえば上の段の 3 と 4 は、
          3 を右上の角に、4 をその真下に縦に並べておき、空きを 3 の左に回してから、
          3 を左へ・4 を上へと続けて入れます。
          1枚ずつ入れようとすると、最後の1枚のために揃えた板を崩すことになります
        </li>
        <li>
          最後に残った2段×3列は、空きをぐるぐる回して板の順番を入れ替えるつもりで動かします
        </li>
        <li>迷ったら「もどす」は何回でも使えます</li>
      </ul>

      <h2>なぜ解けない並べ方があるのか</h2>
      <p>
        板を1から順に読んでいったとき、
        <strong>「大きい数が小さい数より前にある組」の数</strong>（転倒数といいます）を数えてみます。
        板を左右に動かしても、読む順番は変わらないのでこの数は変わりません。
        上下に動かすと、板が何枚かを飛び越すので数が変わりますが、
        4×4では<strong>増えるか減るかの数が必ず奇数</strong>になり、同時に空きの段も1つ変わります。
        つまり「転倒数」と「空きのある段」を合わせた偶数・奇数は、どう動かしても変わりません。
      </p>
      <p>
        完成形と偶数・奇数が食い違う並べ方は、どれだけ動かしても完成しません。
        完成形から 14 と 15 だけを入れ替えた盤がその代表です。並べ方全体のちょうど半分がこの
        「解けない側」に入っていて、このゲームでは配る前に計算で確かめ、解ける盤だけを出しています。
      </p>

      <h2>15パズルの歴史</h2>
      <p>
        15パズルは1870年代の米国で生まれ、1880年ごろに米国からヨーロッパまで大流行しました。
        考案したのはニューヨーク州の郵便局長だった
        <strong>ノイズ・チャップマン（Noyes Chapman）</strong>とされています。
        パズル作家サム・ロイドが考案し、14 と 15 を入れ替えた盤を解いた人に懸賞金を出した、
        という話が広く知られていますが、<strong>これは後年の創作で、史実ではないとされています</strong>
        （Jerry Slocum・Dic Sonneveld『The 15 Puzzle: How It Drove the World Crazy』Slocum Puzzle Foundation、2006年）。
        そもそもその盤は上の理由で解けないので、懸賞金を払う人はいなかったことになります。
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
          .filter((g) => g.slug !== '15-puzzle')
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
