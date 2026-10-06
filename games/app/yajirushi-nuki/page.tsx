import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';
import { DIFFICULTIES, HEARTS, HINT_PENALTY_MS } from '@/lib/yajirushi-nuki';

/**
 * 数（盤の大きさ・ハート・ヒントの秒数）は**設定から引く**（ページの文言に数字を書き写さない）。
 *
 * 説明では「順番を考える」とは書かず、「抜ける矢印を見つける」と書く
 * （1 本抜いても他の進路は空くだけなので、遊び手が考えるのは順番ではない。仕様書の「設計の前提」）。
 * 海外アプリの名前は出さない（「話題の矢印パズル」のように一般名で書く）。
 */
const { easy, normal, hard } = DIFFICULTIES;
const penalty = HINT_PENALTY_MS / 1000;

const title = '矢印ぬき — 抜ける矢印を見つけてタップする無料パズル。毎日変わる今日の1面つき';
const description = `無料の矢印パズル「矢印ぬき」。盤の矢印をタップすると向いている方向へ抜けていきます。いま抜けられる矢印を見つけて、全部抜けばクリア。ぶつけるとハートが減ります（${HEARTS}つ）。今日の1面は全員同じ盤で、ミスの数とタイムを競えます。かんたん${easy.size}×${easy.size}〜むずかしい${hard.size}×${hard.size}。インストール不要でスマホからもすぐ遊べます。`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/yajirushi-nuki/` },
  robots: robotsFor('yajirushi-nuki'),
};

const faq = [
  {
    q: 'どんなゲームですか？',
    a: '盤に並んだ矢印をタップして、盤の外へ抜いていくパズルです。矢印は向いている方向へまっすぐ進み、進む先に別の矢印が無ければ抜けて消えます。いま抜けられる矢印を見つけて、全部抜けばクリアです。',
  },
  {
    q: '詰むことはありますか？',
    a: '詰むことはありません。1本抜いても、ほかの矢印の進む先は空くだけで塞がることはないので、いま抜けられる矢印をどれか抜いていけば必ず全部抜けます。考えるのは「どれが抜けられるか」を見つけることです。盤は抜ける順番から逆に組み立てて作っているので、必ず解けます。',
  },
  {
    q: 'ぶつかるとどうなりますか？',
    a: `進む先に別の矢印があると、ぶつかって元の場所に戻り、ハートが1つ減ります（ミス1）。ハートは${HEARTS}つで、なくなるとその面は終わりです。同じ盤でやり直すか、新しい盤で遊べます。`,
  },
  {
    q: 'ヒントは何回使えますか？',
    a: `回数の制限はありません。押すと、いま抜けられる矢印が1本光ります。ヒント1回につき、タイムに${penalty}秒が足されます。`,
  },
  {
    q: '今日の1面は何回でも遊べますか？',
    a: `今日の1面（ふつう${normal.size}×${normal.size}）は何回でも遊べますが、記録になるのはその日の1回目だけです。2回目からは盤を覚えた状態なので練習（記録なし）として扱います。`,
  },
  {
    q: '記録や連続日数はどこに保存されますか？',
    a: 'ベストタイムとクリア回数が、難易度ごとにお使いの端末のブラウザへ保存されます（サーバーには送信しません）。今日の1面はこれに加えて連続日数を保存します。ミスの数は結果の画面と共有の文面に出すだけで、保存はしません。別の端末やブラウザでは引き継げません。',
  },
];

const trail = breadcrumbFor('yajirushi-nuki');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: '矢印ぬき',
      url: `${SITE_URL}/yajirushi-nuki/`,
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

      <h1>矢印ぬき</h1>
      {/* リード文は1行に収める（盤を1画面に入れるため） */}
      <p className="lead">
        <strong>抜けられる矢印</strong>を見つけて全部抜こう。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊びかた</h2>
      <ol>
        <li>
          矢印をタップすると、<strong>向いている方向へまっすぐ進みます</strong>
        </li>
        <li>
          進む先（盤の端まで）に別の矢印が無ければ、<strong>盤の外へ抜けて消えます</strong>
        </li>
        <li>
          進む先に矢印があると<strong>ぶつかって戻り、ハートが1つ減ります</strong>（ハートは{HEARTS}つ）
        </li>
        <li>
          <strong>全部抜けたらクリア</strong>。ミスの数とタイムが出ます
        </li>
      </ol>
      <p>
        PCでは、矢印キーでマスを選び、Enter キーか Space キーで抜けます
        （読み上げは「3行4列、右向き」のように位置と向きだけで、抜けられるかどうかは読みません）。
      </p>

      <h2>抜ける矢印の見つけかた</h2>
      <ul>
        <li>
          まず<strong>盤の外側の列</strong>を見ます。外を向いている矢印は、進む先に何も無いので抜けられます
        </li>
        <li>
          矢印の先を<strong>盤の端まで目でたどり</strong>、途中に別の矢印が1本でもあれば抜けられません
        </li>
        <li>
          1本抜くと、その矢印が塞いでいた矢印が抜けられるようになります。<strong>いま抜いた矢印の列と行</strong>をもう一度見ると、次の1本が見つかりやすくなります
        </li>
      </ul>

      <h2>難易度と今日の1面</h2>
      <p>
        盤は<strong>かんたん{easy.size}×{easy.size}（矢印{easy.minArrows}〜{easy.maxArrows}本）</strong>・
        <strong>ふつう{normal.size}×{normal.size}（{normal.minArrows}〜{normal.maxArrows}本）</strong>・
        <strong>むずかしい{hard.size}×{hard.size}（{hard.minArrows}〜{hard.maxArrows}本）</strong>の3段階です。
        難しいほど、同じ時に抜けられる矢印が少なくなるように盤を作っています（むずかしいは最初に抜けられる矢印が{hard.maxInitial}本以下）。
      </p>
      <p>
        「今日の1面」は<strong>日付から組み立てる、その日だけの盤</strong>（ふつう{normal.size}×{normal.size}）です。
        同じ日に開いた人には全員同じ盤が出るので、ミスの数とタイムをそのまま比べられます。
        記録になるのは<strong>その日の1回目だけ</strong>で、クリアすると<strong>連続日数</strong>が1つ増えます。
        クリア後の「結果をコピー」で共有できる文面には、<strong>盤面は入りません</strong>（日付・ミスの数・タイムだけ）。
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
          .filter((g) => g.slug !== 'yajirushi-nuki')
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
