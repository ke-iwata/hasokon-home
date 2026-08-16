import type { Metadata } from 'next';
import Link from 'next/link';
import { games, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

const title = '2048 無料｜ブラウザですぐ遊べるスライドパズル';
const description =
  '無料の2048。スワイプで同じ数字を合体させて2048を目指すパズルゲーム。インストール不要・登録不要でブラウザからすぐ遊べます。スマホ対応・ベストスコア保存。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/2048/` },
};

const faq = [
  { q: '無料で遊べますか？', a: 'すべて無料です。会員登録もインストールも不要で、ブラウザだけで遊べます。' },
  { q: '2048を作ったら終わりですか？', a: '2048達成後もそのまま続けられます。4096、8192とさらに大きなタイルに挑戦してください。ゲームオーバーになるのは、どの方向にも動かせなくなったときだけです。' },
  { q: '新しいタイルはどこから出てきますか？', a: 'タイルが動いたスライドのあとに、空いているマスのどれかへランダムに1枚湧きます。数字は90%の確率で2、10%の確率で4です（元祖の2048と同じ確率です）。' },
  { q: '同じ数字が3つ並んでいたらどうなりますか？', a: '動かした方向の先にある2つだけが合体します。1回のスライドで同じタイルが2度合体することはありません。たとえば「2・2・4」を左に寄せると「4・4」で止まり、「8」にはなりません。' },
  { q: 'スコアはどう増えますか？', a: '合体してできたタイルの数字がそのまま加算されます。2と2を合わせて4を作れば4点、1024同士で2048を作ればその1手だけで2048点入ります。大きい合体ほど一気にスコアが伸びます。' },
  { q: 'ベストスコアは保存されますか？', a: 'ベストスコアとプレイ回数がお使いのブラウザに保存されます（サーバーには送信されません）。別の端末やブラウザには引き継がれず、ブラウザのデータを削除すると消えます。' },
];

const trail = breadcrumbFor('2048');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: '2048',
      url: `${SITE_URL}/2048/`,
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

      <h1>2048</h1>
      <p className="lead">
        同じ数字をスライドで合体させて、<strong>2048のタイル</strong>を目指すパズル。シンプルなのに、やめどきが見つかりません。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>スワイプ（PCは矢印キー）で、盤面のタイル全部が同じ方向にスライドします</li>
        <li>同じ数字がぶつかると合体して2倍になります（2+2=4、4+4=8…）</li>
        <li>タイルが1枚でも動いたスライドのあとには、空きマスに新しいタイルが湧きます</li>
        <li>1枚も動かない方向へのスライドは無効で、新しいタイルも湧きません</li>
        <li>16マスすべてが埋まり、どの方向にも動かせなくなったら終了です</li>
      </ol>
      <p>
        スコアは合体でできたタイルの数字の合計で増えていき、ベストスコアは
        ブラウザに保存されます。2048を作るとクリアの表示が出ますが、
        そのまま4096・8192を目指して続けられます。
      </p>
      <h2>コツ</h2>
      <ul>
        <li><strong>いちばん大きいタイルを角に固定</strong>するのが定石です。角に置いたら、その角から動かさない方向だけで操作します</li>
        <li>使う方向を3方向に制限しましょう。たとえば左下の角に固定するなら「上」は原則押さない、と決めます。4方向すべて使うと大きいタイルが中央に流れて詰みやすくなります</li>
        <li>大きい順に階段状（蛇行）に並べると、連鎖的に合体できます。端の1列に「512・256・128・64」のように並べておけば、64をもう1つ作った瞬間に一気に1024までつながります</li>
        <li>大きいタイルを置いている端の列（行）は、常にタイルで埋めておきましょう。空きがあると、直角方向に動かしたときに大きいタイルが角からずれてしまいます</li>
        <li>新しいタイルがどこに湧くかは選べません。盤面が混んできたら、1手ごとに「この方向に動かすとどこが空くか」を確かめてから動かす慎重さが、最後の伸びを左右します</li>
      </ul>

      <h2>2048というゲームの由来</h2>
      <p>
        2048は2014年に無料のWebゲームとして公開され、シンプルなルールと手軽さで
        瞬く間に世界中へ広まったパズルです。元祖のプログラムはオープンソース
        （MITライセンス）で公開されていて、ルール自体に権利は主張されておらず、
        それ以前からあったスライド合体型パズルの流れをくんでいます。
        盤面に並ぶ「2・4・8…」の数字はすべて2のべき乗で、2048は2を11回
        かけ合わせた数です。2048のタイル1枚は「2」のタイル1,024枚ぶんに相当し、
        小さな合体の積み重ねだけがゴールにつながります。
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
          .filter((g) => g.ready && g.slug !== '2048')
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
