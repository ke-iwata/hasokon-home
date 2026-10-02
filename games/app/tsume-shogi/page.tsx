import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

/*
 * 本文・FAQ・description に他団体・他サイト名（将棋の団体・個別の詰将棋サイト・アプリ名）を出さない
 * （仕様書の「ページ構成」。競合の比較は仕様書の中だけ）
 */

const title = '詰将棋 1手詰・3手詰｜無料・毎日1問・自動生成で無限に解ける';
const description =
  '無料の詰将棋。1手詰・3手詰をプログラムで自動生成するので何問でも解けます。毎日変わる「今日の1問」（3手詰）は全員同じ問題で、解いた秒数と連続日数を記録。答えは必ず1通り（初手）。合駒・二歩・打ち歩詰めのルールつき。インストール不要でスマホからもすぐ遊べます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/tsume-shogi/` },
  robots: robotsFor('tsume-shogi'),
};

const faq = [
  {
    q: '玉方の持ち駒は？',
    a: '盤の上と、あなた（攻方）の持ち駒と、玉を除いた「残り全部」です。駒の種類ごとに、上限（歩18・香4・桂4・銀4・金4・角2・飛2）から盤上と攻方の持ち駒の枚数を引いた数を持っています。合駒に使えるので、離れたところから飛・角・香で王手をしても、間に駒を打たれて詰みません。',
  },
  {
    q: '成らずで詰めてもいい？',
    a: 'いいです。成れるときは「成」と「不成」の両方を指せます。3手目はどちらでも詰めば正解です。初手については、成と不成の両方で詰む局面は「答えが2つある」ことになるので、問題として出していません。',
  },
  {
    q: '打ち歩詰めとは？',
    a: '持ち駒の歩を打って玉を詰ませることです。将棋のルールで禁止されています。指すと「打ち歩詰めです」と出てやり直しになります。盤上の歩を動かして詰ませる（突き歩詰め）のは問題ありません。',
  },
  {
    q: '答えが2つあるように見える',
    a: '答えが1通りに決まっているのは初手だけです。3手詰の3手目は、その局面で詰む手ならどれでも正解にしています（最終手の別解は詰将棋でも許される慣例です）。初手で別の手が詰むように見えるときは、玉方の持ち駒の合駒や、玉が駒を取って逃げる手を確かめてください。',
  },
  {
    q: '「今日の1問」とは何ですか？',
    a: '日付から作る、その日だけの3手詰です。同じ日に開いた人には全員同じ問題が出ます。サーバーは使っておらず、お使いの端末の日付（ローカル日付）から問題を組み立てています。',
  },
  {
    q: '問題はどうやって作っていますか？',
    a: '玉の近くに駒をランダムに置き、プログラムで詰みを探して「手数ちょうど・初手が1通り」の局面だけを出しています。他の人が作った作品は使っていません。合駒が絡む形（離れた飛・角・香での王手）は、作意に入れないようにしています。',
  },
  {
    q: '記録は保存されますか？',
    a: '1手詰・3手詰・今日の1問ごとに、ベストタイムと正解回数をお使いのブラウザへ保存します（サーバーには送信しません）。今日の1問は連続日数も保存します。3回間違えて「答えを見る」を押したときは、タイムを記録しません。',
  },
];

const trail = breadcrumbFor('tsume-shogi');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: '詰将棋（1手詰・3手詰）',
      url: `${SITE_URL}/tsume-shogi/`,
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

      <h1>詰将棋（1手詰・3手詰）</h1>
      {/* リード文は2行に収める（3行にすると盤が画面の外へ出る） */}
      <p className="lead">
        <strong>王手の連続</strong>で玉を詰ませる。問題は自動生成で何問でも、
        <strong>今日の1問</strong>は全員同じ3手詰です。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊びかた</h2>
      <p>
        あなたは<strong>攻方</strong>（盤の下側・先手）です。駒か持ち駒を押すと動ける先に印が付き、
        印のマスを押すと指します。成れるときは「成」「不成」を選びます。
        1手詰は1手で、3手詰は「王手 → 玉方の応手 → 王手」の3手で詰ませると正解です。
      </p>

      <h2>ルール</h2>
      <ol>
        <li>
          攻方が先手で、<strong>王手の連続</strong>で玉方の玉を詰ませます。王手でない手は指せますが不正解で、
          「王手ではありません」と出てやり直しになります
        </li>
        <li>
          玉方は王手を<strong>必ず外し</strong>、<strong>いちばん長く逃げる手</strong>を選びます
          （同じ長さの手が複数あるときは、毎回同じ手を選びます）
        </li>
        <li>
          攻方の持ち駒は問題で決まっています。<strong>玉方の持ち駒は「残り全部」</strong>で、合駒に使えます
        </li>
        <li>
          <strong>二歩</strong>（同じ筋に歩を2枚）・<strong>打ち歩詰め</strong>・行き所のない駒
          （1段目の歩・香、1〜2段目の桂）は禁止です。成れるときは成・不成のどちらも指せます
        </li>
        <li>
          <strong>余詰はありません</strong>。1手詰は詰む初手がちょうど1つ、3手詰は3手で詰む初手がちょうど1つで、
          1手で詰む手はありません。<strong>3手目は詰む手ならどれでも正解</strong>です
        </li>
        <li>
          <strong>合駒</strong>で外れる王手は詰みになりません。このサイトの問題は、合駒が出る形
          （玉から2マス以上離れた飛・角・香の王手）を作意に入れていません
        </li>
        <li>
          攻方の玉は盤に置きません。駒の数は種類ごとに上限（歩18・香4・桂4・銀4・金4・角2・飛2）を守り、
          成駒は元の駒として数えます
        </li>
      </ol>
      <p>
        3回間違えると「答えを見る」が押せます（そのときはタイムを記録しません）。
        PCでは盤をクリックしてから、矢印キーでマスを移動し、Enterで選べます。
      </p>

      <h2>詰将棋とは</h2>
      <p>
        将棋の終盤だけを切り出した<strong>パズル</strong>です。攻める側が王手をかけ続けて、
        決められた手数ちょうどで玉を詰ませます。このサイトでは<strong>1手詰</strong>（30秒〜1分）と
        <strong>3手詰</strong>（1〜3分）を、プログラムで作って確かめた問題で出しています。
        駒は漢字1文字で描き、成駒は字も色も変えています（と・杏＝成香・圭＝成桂・全＝成銀・馬・龍）。
      </p>

      <h2>今日の1問と連続日数</h2>
      <p>
        「今日の1問」は<strong>日付から組み立てる、その日だけの3手詰</strong>です。
        同じ日に開いた人には全員同じ問題が出て、解いた秒数を同じ条件で比べられます。
        正解すると<strong>連続日数</strong>が1つ増え、1日空けると1に戻ります。
        連続日数はお使いの端末のブラウザにだけ残ります（別の端末やブラウザでは引き継げません）。
      </p>

      <h2>コツ</h2>
      <ul>
        <li>
          まず<strong>玉の逃げ道</strong>を数えます。王手をかけたあと、逃げ道がすべてふさがっているかを確かめます
        </li>
        <li>
          打った駒は<strong>玉に取られないか</strong>（味方の駒の利き＝紐が付いているか）を見ます。
          紐の無い駒は玉が取って逃げます
        </li>
        <li>
          3手詰は<strong>捨て駒</strong>で玉を逃げにくい場所へおびき出す形が多くあります。
          1手目に駒を取られても、3手目で詰めば正解です
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
          .filter((g) => g.slug !== 'tsume-shogi')
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
