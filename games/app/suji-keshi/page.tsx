import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';
import { APPENDS, HINT_PENALTY_MS, INITIAL_COUNT } from '@/lib/suji-keshi';

/**
 * 数（書き足しの回数・初めの数字の数・ヒントの秒数）は**設定から引く**（ページの文言に数字を書き写さない）。
 *
 * 海外アプリの名前は title・description・FAQ に出さない（「話題の数字パズル」のように一般名で書く）。
 * ルールの来歴は一次資料で確かめられた範囲だけを書く（仕様書の「ルールの出どころと権利」）。
 */
const penalty = HINT_PENALTY_MS / 1000;

const title = '数字けし — 同じ数か足して10の組を消す無料の数字パズル。毎日変わる今日の1面つき';
const description = `無料の数字パズル「数字けし」。盤の数字から、同じ数か足して10になる2つを選んで消していき、盤を空にすればクリア。詰まったら残りの数字を書き足せます（${APPENDS}回まで）。今日の1面は全員同じ盤で、タイムを競えます。タップだけで遊べて、インストール不要。スマホ・iPadからもすぐ遊べます。`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/suji-keshi/` },
  robots: robotsFor('suji-keshi'),
};

const faq = [
  {
    q: 'どんなゲームですか？',
    a: '盤に並んだ数字から、同じ数か、足して10になる2つを選んで消していく数字パズルです。盤を空にすればクリアです。足し算だけで遊べるので、脳トレや計算の練習にもなります。',
  },
  {
    q: 'どの2つを消せますか？',
    a: '縦・横・斜めに並ぶ2つか、読む順（左上から右へ。行の終わりと次の行の始めもつながる）で前後になる2つです。間にあるのが消えたマスだけなら、離れていても消せます。間にまだ数字が残っていると消せません。',
  },
  {
    q: '消せる組がなくなったら？',
    a: `「書き足す」を押すと、残っている数字が読む順のまま盤の後ろに書き足されます。並びが変わるので、新しい組が見つかります。書き足しは1面に${APPENDS}回までで、使い切って消せる組もなくなると、その面は終わりです。`,
  },
  {
    q: '必ず解けますか？',
    a: `盤は、書き足し${APPENDS}回以内に空にできることをコンピューターで確かめてから出しています。ただし消す順番によっては詰まることがあるので、どの組から消すかを考えるのがこのゲームのおもしろさです。`,
  },
  {
    q: 'ヒントは何回使えますか？',
    a: `回数の制限はありません。押すと、いま消せる組が1つ光ります。ヒント1回につき、タイムに${penalty}秒が足されます。消せる組が無いときは「書き足す」のボタンが光ります（このときはタイムは足されません）。`,
  },
  {
    q: '今日の1面は何回でも遊べますか？',
    a: '今日の1面（横6列）は何回でも遊べますが、記録になるのはその日の1回目だけです。2回目からは盤を覚えた状態なので練習（記録なし）として扱います。',
  },
  {
    q: '9列で遊べますか？',
    a: 'iPad やパソコンのように画面の幅が広いときは、「9列」を選べます（スマホでは押しやすさを保つため6列だけです）。列数が変わると消せる組が変わるので、記録は6列と9列で分けています。遊んでいる途中に画面の幅が狭くなっても、その面は9列のまま続けられ、次の面から6列になります。',
  },
  {
    q: '記録や連続日数はどこに保存されますか？',
    a: 'ベストタイムとクリア回数が、今日の1面・6列・9列ごとにお使いの端末のブラウザへ保存されます（サーバーには送信しません）。今日の1面はこれに加えて連続日数を保存します。別の端末やブラウザでは引き継げません。',
  },
];

const trail = breadcrumbFor('suji-keshi');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: '数字けし',
      url: `${SITE_URL}/suji-keshi/`,
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

      <h1>数字けし</h1>
      {/* リード文は1行に収める（盤を1画面に入れるため） */}
      <p className="lead">
        <strong>同じ数</strong>か<strong>足して10</strong>の2つを消して盤を空に。
      </p>

      <Game />

      {/* 広告は盤とボタンの塊から離して置く（誤クリックを誘う配置にしない。仕様書の「広告の位置」） */}
      <AdUnit position="below-tool" />

      <h2>遊びかた</h2>
      <ol>
        <li>
          数字を2つ順にタップします。<strong>同じ数</strong>か<strong>足して10</strong>（1と9、2と8、3と7、4と6、5と5）なら消えます
        </li>
        <li>
          消せるのは<strong>縦・横・斜めに並ぶ2つ</strong>か、<strong>読む順で前後になる2つ</strong>
          （行の終わりと次の行の始めもつながります）。間に消えたマスしか無ければ、離れていても消せます
        </li>
        <li>
          1行がすべて消えると、その行は詰められます
        </li>
        <li>
          消せる組が無くなったら<strong>「書き足す」</strong>。残っている数字が読む順のまま盤の後ろに足されます（1面に{APPENDS}回まで）
        </li>
        <li>
          <strong>盤が空になったらクリア</strong>。書き足しを使い切って消せる組も無くなると、その面は終わりです
        </li>
      </ol>
      <p>
        PCでは、矢印キーでマスを選び、Enter キーか Space キーで選びます（Esc キーで選択を外します）。
        読み上げは「3行4列、7」のように位置と数だけです。
      </p>

      <h2>消し切るコツ</h2>
      <ul>
        <li>
          <strong>書き足す前に、消せる組をできるだけ消しておきます。</strong>残った数字がそのまま書き足されるので、
          少ないほど次の盤が短くなります
        </li>
        <li>
          同じ数字どうしが離れていても、<strong>間の数字を先に消せば</strong>つながります。どの組から消すかで、あとに残る並びが変わります
        </li>
        <li>
          5は5としか組めません。<strong>5が1つだけ残りそうなら</strong>、早めに書き足して相手を作る手もあります
        </li>
      </ul>

      <h2>今日の1面と記録</h2>
      <p>
        「今日の1面」は<strong>日付から組み立てる、その日だけの盤</strong>（横6列・数字{INITIAL_COUNT}個）です。
        同じ日に開いた人には全員同じ盤が出るので、タイムをそのまま比べられます。
        記録になるのは<strong>その日の1回目だけ</strong>で、クリアすると<strong>連続日数</strong>が1つ増えます。
        クリア後の「結果をコピー」で共有できる文面には、<strong>盤面は入りません</strong>（日付・書き足しの回数・タイムだけ）。
      </p>
      <p>
        盤は、書き足し{APPENDS}回以内に空にできることを確かめてから出しています。
        元になっているのは、ノートに数字を並べて書き、同じ数か足して10の組を消していく<strong>古くからある紙の数字遊び</strong>です。
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
          .filter((g) => g.slug !== 'suji-keshi')
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
