import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';
import { allCodes, HINT_AFTER_MOVES } from '@/lib/hit-blow';

/**
 * 商品名・テレビ番組名・市販のボードゲームの名前は、表示名・本文のどこにも書かない
 * （docs/features/game-hit-blow.md の着手条件）。原型への言及は「紙と鉛筆の数あて」にとどめる。
 * 通り数は `allCodes()` から引く（ページの文言に数字を書き写さない）。
 */
const count3 = allCodes(3).length.toLocaleString('ja-JP');
const count4 = allCodes(4).length.toLocaleString('ja-JP');

const title = 'ヒット＆ブロー（数あて）— 隠された数をヒットとブローのヒントで当てる推理ゲーム。今日の1問とCPU対戦つき';
const description =
  '無料の数あて推理ゲーム「ヒット＆ブロー」。重複なしの3〜4桁の数を、ヒット（数字も場所も合う）とブロー（数字だけ合う）のヒントで当てます。毎日変わる今日の1問と、CPUと交互に当て合う対戦（やさしい・ふつう・つよい）。インストール不要でスマホからもすぐ遊べます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/hit-blow/` },
  robots: robotsFor('hit-blow'),
};

const faq = [
  {
    q: 'どんなルールですか？',
    a: '相手が0〜9から重複なしで選んだ3桁か4桁の数を当てます。推測を出すたびに、数字も場所も合っている数（ヒット）と、数字は合っているが場所が違う数（ブロー）が返ります。全部ヒットになれば正解です。',
  },
  {
    q: '同じ数字は使えますか？',
    a: '使えません。答えにも推測にも同じ数字は1回だけです。先頭の0は使えます（0123 なども答えになります）。テンキーでは入力済みの数字が押せなくなります。',
  },
  {
    q: '「今日の1問」とは何ですか？',
    a: `日付から決まる、その日だけの4桁の数です。同じ日に開いた人には全員同じ数が出ます。手数の上限はなく、${HINT_AFTER_MOVES}手を超えると「ヒント」で残りの候補が何通りあるかを見られます。途中で再読み込みしても、それまでの手は残ります。`,
  },
  {
    q: 'CPUと対戦はどう遊びますか？',
    a: 'まずCPUに当てさせるあなたの数を決め（「おまかせ」でも可）、お互いの数を交互に当て合います。先手が当てたら、後手は同じ手数目の1手だけ打てます。後手もそこで当てたら引き分け、外したら先手の勝ちです。先手・後手は1局ごとに入れ替わり、選び直すこともできます。',
  },
  {
    q: 'CPUはずるをしていませんか？',
    a: 'していません。CPUが使えるのは、自分の推測とそこに返ってきたヒットとブローの数だけです。あなたの数はCPUの推理の計算には渡していません。CPUの数は勝敗が決まってから表示します。',
  },
  {
    q: 'CPUの強さの違いは？',
    a: '「ふつう」はこれまでのヒントと食い違わない数から選びます。「やさしい」はそれに加えて、ときどきヒントと食い違う数を出します。「つよい」は残りの候補をいちばん細かく分けられる数を選ぶので、4桁なら平均5〜6手で当ててきます。',
  },
  {
    q: '記録や連続日数はどこに保存されますか？',
    a: 'お使いの端末のブラウザに保存しています。サーバーには送信していないので、別の端末やブラウザでは引き継げません。',
  },
  {
    q: 'キーボードでも遊べますか？',
    a: '遊べます。数字キーで入力、Backspaceで1文字消し、Enterで決定です。',
  },
];

const trail = breadcrumbFor('hit-blow');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'ヒット＆ブロー',
      url: `${SITE_URL}/hit-blow/`,
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

      <h1>ヒット＆ブロー</h1>
      <p className="lead">
        隠された数を<strong>ヒット</strong>と<strong>ブロー</strong>のヒントで当てる、数あての推理ゲームです。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊びかた</h2>
      <ol>
        <li>
          テンキーで<strong>同じ数字を使わない</strong>数を入れて「決定」を押します
        </li>
        <li>
          数字も場所も合っている数が<strong>ヒット（H）</strong>、数字は合っているが場所が違う数が
          <strong>ブロー（B）</strong>として表に出ます
        </li>
        <li>
          ヒントを手がかりに推測を続け、<strong>全部ヒット</strong>になれば正解です
        </li>
      </ol>
      <p>
        たとえば答えが 1234 のとき、1243 はヒット2・ブロー2、5612 はヒット0・ブロー2 です。
        同じ数字が同じ場所にあるときはヒットだけに数え、ブローには数えません。
        「メモ」を押すと、テンキーの数字に「無い（灰）」「ある（黄）」の印を付けられます（答えには影響しません）。
      </p>

      <h2>3つのモード</h2>
      <ul>
        <li>
          <strong>今日の1問</strong>：日付から決まる4桁の数。全員同じ数で、何手で当てたかと連続日数が残ります。
          手数の上限はなく、{HINT_AFTER_MOVES}手を超えると残りの候補の数をヒントで見られます
        </li>
        <li>
          <strong>練習</strong>：3桁（{count3}通り）か4桁（{count4}通り）を選んで、何回でも遊べます
        </li>
        <li>
          <strong>CPUと対戦</strong>：お互いに4桁の数を隠して交互に当て合います。強さはやさしい・ふつう・つよいの3段階。
          先手が当てたら後手は同じ手数目の1手だけ打て、後手もそこで当てれば引き分けです
        </li>
      </ul>

      <h2>ヒット＆ブローとは</h2>
      <p>
        19世紀から紙と鉛筆で遊ばれてきた数あての推理ゲームで、日本では「数当てゲーム」の名でも、
        教材やプログラミングの演習の定番として親しまれています。
        ありうる答えは3桁で{count3}通り、4桁で{count4}通り。1手ごとのヒントで候補を絞り込んでいくので、
        運ではなく<strong>推理</strong>で手数が縮まります。
      </p>

      <h2>コツ</h2>
      <ul>
        <li>
          最初の2〜3手は<strong>数字が重ならない推測</strong>（0123 → 4567 など）を出すと、使われている数字の見当がつきます
        </li>
        <li>
          ヒット0・ブロー0 が出たら、その数字は<strong>全部「無い」</strong>。メモで灰にしておくと迷いません
        </li>
        <li>
          候補がしぼれてきたら、<strong>これまでのヒントとすべて食い違わない数</strong>だけを出すと手数が増えません
        </li>
        <li>CPUの「つよい」は残りの候補を細かく分ける数を選びます。4桁なら平均5〜6手が目安です</li>
      </ul>

      <h2>今日の1問の共有</h2>
      <p>
        今日の1問に正解すると「結果をコピー」で共有できます。手ごとにヒットを🟢、ブローを🟡、外れを⚪で並べた文面で、
        <strong>答えの数字は入りません</strong>。連続日数はお使いの端末のブラウザにだけ残ります。
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
          .filter((g) => g.slug !== 'hit-blow')
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
