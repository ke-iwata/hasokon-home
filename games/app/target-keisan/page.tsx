import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';
import { DIFFICULTIES, LARGE_NUMBERS, TARGET_MAX, TARGET_MIN } from '@/lib/target-keisan';

/**
 * 数の構成・目標の範囲・難易度の手数は**設定から引く**（ページの文言に数字を書き写さない）。
 *
 * 「Countdown」（英国の番組名）と「Digits」（他社のゲーム名）は、表示名・本文のどこにも書かない
 * （docs/features/game-target-keisan.md の「名称と権利」）。原型への言及は
 * 「英国のクイズ番組の数字ラウンド」にとどめる。
 */
const large = LARGE_NUMBERS.join('・');
const range = `${TARGET_MIN}〜${TARGET_MAX}`;
const steps = (d: keyof typeof DIFFICULTIES) => {
  const { minSteps, maxSteps } = DIFFICULTIES[d];
  return minSteps === maxSteps ? `${minSteps}手` : `${minSteps}〜${maxSteps}手`;
};

const title = 'ターゲット計算パズル — 6 つの数と四則演算で目標の数をつくる。毎日 3 問の今日の 1 問つき';
const description = `無料の計算パズル「ターゲット計算パズル」。6つの数を足す・引く・掛ける・割るでつないで、${range}の目標の数をつくります。やさしい・ふつう・むずかしいの3段階と、毎日変わる「今日の3問」つき。インストール不要でスマホからもすぐ遊べます。`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/target-keisan/` },
  robots: robotsFor('target-keisan'),
};

const faq = [
  {
    q: 'どんなルールですか？',
    a: `6つの数のうち2つを選び、＋ − × ÷ のどれかでつなぐと、2つが消えて計算の結果が1つ残ります。これをくり返して、目標の数（${range}）ちょうどをつくります。各数は1回しか使えませんが、全部使う必要はありません。`,
  },
  {
    q: '途中の計算に決まりはありますか？',
    a: '途中の結果は正の整数だけです。引いて0以下になる引き算と、割り切れない割り算はできません。分数・負の数・べき乗も使いません。',
  },
  {
    q: 'ぴったりにならないときはどうなりますか？',
    a: '「これで答える」を押すと、盤にある数（元の数と途中の結果）のうち目標にいちばん近いものが答えになります。ぴったりで★3つ、差が1〜5で★2つ、6〜10で★1つです（このサイト独自の基準です）。答えたあとに解答例を1つ出します。',
  },
  {
    q: '出てくる問題は必ず解けますか？',
    a: '解けます。6つの数から作れる値をすべて計算で求め、その中から目標を選んでいます。作り方が何通りあってもかまいません。',
  },
  {
    q: '「今日の3問」とは何ですか？',
    a: '日付から作る、その日だけの3問（やさしい・ふつう・むずかしい）です。同じ日に開いた人には全員同じ問題が出ます。1問ずつ答えたら次へ進み、やり直しはできません。',
  },
  {
    q: '連続日数はどこに保存されますか？',
    a: 'お使いの端末のブラウザに保存しています。サーバーには送信していないので、別の端末やブラウザでは引き継げません。',
  },
  {
    q: 'キーボードでも遊べますか？',
    a: '遊べます。矢印キーかTabで数のタイルを移動し、Space・Enterで選びます。＋ − * / のキーで演算を選び、Backspaceで1つ戻します。',
  },
];

const trail = breadcrumbFor('target-keisan');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'ターゲット計算パズル',
      url: `${SITE_URL}/target-keisan/`,
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

      <h1>ターゲット計算パズル</h1>
      {/* リード文は2行に収める（3行にするとタイルが画面の外へ出る） */}
      <p className="lead">
        6つの数を<strong>四則演算（＋ − × ÷）</strong>でつないで、<strong>目標の数</strong>をつくる計算パズルです。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊びかた</h2>
      <ol>
        <li>
          数を1つ選び、<strong>演算（＋ − × ÷）</strong>を選び、もう1つ数を選びます
        </li>
        <li>
          2つの数が消えて、<strong>計算の結果</strong>が1つ残ります。結果もまた計算に使えます
        </li>
        <li>
          <strong>目標の数ちょうど</strong>ができたらクリアです（自動で答えになります）
        </li>
        <li>
          ぴったりにならないときは「これで答える」で、盤にある数のうち
          <strong>目標にいちばん近いもの</strong>が答えになります
        </li>
      </ol>
      <p>
        <strong>途中の結果は正の整数だけ</strong>です（引いて0以下・割り切れない割り算はできません）。
        各数は1回しか使えず、全部使う必要はありません。「もどす」で1手ずつ、「最初から」で全部戻せます。
        PCでは矢印キーでタイルを移動してSpace・Enterで選び、＋ − * / のキーで演算、Backspaceで戻せます。
      </p>

      <h2>ターゲット計算パズルとは</h2>
      <p>
        6つの数は、小さい数（1〜10）から4つと、大きい数（{large}）から2つ。目標は{range}です。
        原型は英国のクイズ番組の数字ラウンドで、40年以上遊ばれてきた計算パズルです。
        このサイトの問題は、6つの数から作れる値をすべて計算で求めてから目標を選んでいるので、
        <strong>必ず作れます</strong>。難易度は目標をつくるのに要る最短の手数で決めていて、
        やさしいは{steps('easy')}、ふつうは{steps('normal')}、むずかしいは{steps('hard')}です。
      </p>

      <h2>★のつけかた</h2>
      <p>
        ぴったりで<strong>★★★</strong>、差が1〜5で<strong>★★</strong>、差が6〜10で<strong>★</strong>、
        それより離れると★はつきません（このサイト独自の基準です）。
        答えたあとには、ぴったりでもそうでなくても<strong>解答例</strong>を1つ出します。
      </p>

      <h2>今日の1問と連続日数</h2>
      <p>
        「今日の3問」は<strong>日付から組み立てる、その日だけの3問</strong>（やさしい・ふつう・むずかしい）です。
        同じ日に開いた人には全員同じ問題が出ます。1問ずつ答えたら次へ進み、やり直しはできません。
        3問を答えると<strong>連続日数</strong>が1つ増え、1日空けると1に戻ります。
        連続日数はお使いの端末のブラウザにだけ残ります。
        「結果をコピー」で共有できる文面は★と連続日数だけで、<strong>式（答え）は入りません</strong>。
      </p>

      <h2>コツ</h2>
      <ul>
        <li>
          まず<strong>大きい数を掛けて目標の近くまで行き</strong>、残りを小さい数で足し引きして合わせます
        </li>
        <li>
          目標が25や50の倍数に近いときは、<strong>その倍数をつくってから差を埋める</strong>と早いです
        </li>
        <li>
          小さい数どうしを先に足したり掛けたりして、<strong>掛ける数をつくる</strong>手もあります
        </li>
        <li>ぴったりが見つからなくても、近い数で答えれば★がつきます</li>
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
          .filter((g) => g.slug !== 'target-keisan')
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
