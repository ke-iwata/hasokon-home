import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

// 「ヨット（Yacht）」はパブリックドメインの伝統ゲーム名。同型のボードゲームの
// 商品名は他社の登録商標なので、title / description / h1 / slug には使わない。
// 本文で「その名でも知られる」と事実として触れるのは可（docs/features/game-yacht.md の「権利面」）
const title = 'ヨット 無料｜サイコロの役作りゲーム（CPU対戦）';
const description =
  '無料のヨット（サイコロの役作りゲーム）。5個のサイコロを3回まで振って、フルハウスやストレートなど12の役を埋めていきます。CPU対戦は かんたん・つよい の2段階。上段ボーナスつきの定番ルール。インストール不要・登録不要でスマホ対応。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/yacht/` },
  robots: robotsFor('yacht'),
};

const faq = [
  {
    q: 'ヨットのルールは？',
    a: '5個のサイコロを1手番に3回まで振って、出た目で役を作り、スコア表の12の役を1つずつ埋めていくゲームです。1回振るごとに残したいサイコロをキープでき、キープしなかったものだけを振り直せます。3回振り終える前でも、いつでも記入して手番を終えられます。12手番で表がすべて埋まり、合計点の高いほうが勝ちです。',
  },
  {
    q: '役と点数の一覧は？',
    a: 'エース〜シックスは、その目だけの合計（例：4が3つなら12点）。チョイスは5個の目の合計。フォーダイスは同じ目が4つ以上あれば5個の目の合計。フルハウスは同じ目3つと別の同じ目2つで5個の目の合計。S・ストレートは4つ連続で15点、L・ストレートは5つ連続で30点、ヨット（同じ目が5つ）は50点です。',
  },
  {
    q: '上段ボーナスとは？',
    a: 'エース〜シックスの上段6役の合計が63点以上になると、ボーナスとして35点が加算されます。63点は「どの目も3個ずつ揃えた」ときの点数なので、上段は3個そろえるのが目安です。1つの役で3個を割ったら、別の役で4個そろえて取り返す、という考え方になります。',
  },
  {
    q: '役にならない出目のときはどうしますか？',
    a: 'どの役にも0点で記入できます。12手番で必ず12の役が埋まるので、点にならない出目は「捨てる役」を選ぶことになります。捨てるなら、点数の小さいエースや、狙って出しにくいヨットが候補です。上段ボーナスを狙っているときは、上段を捨てるとボーナスが遠のく点に注意してください。',
  },
  {
    q: '強くなるコツは？',
    a: 'まず上段ボーナスの35点を意識します。上段は各役3個そろえれば63点ちょうどなので、4個そろった役の貯金で、少ない役の不足を埋めます。序盤は点の大きいシックス・ファイブを優先し、チョイスやヨットは「他に書く場所がないとき」の受け皿として最後まで残しておくと、詰まりにくくなります。',
  },
  {
    q: 'CPUの強さはどのくらいですか？',
    a: '「かんたん」は目先の点数がいちばん高い役を取るだけで、ときどきでたらめな選び方もします。上段ボーナスを狙わないので取りこぼしが多く、ルールを覚えるのに向いています。「つよい」は振り直しごとに期待値を計算し、上段ボーナスまでの進み具合も加味して選びます。',
  },
  {
    q: '記録は残りますか？',
    a: 'CPUの強さごとに、ベストスコア・平均点・遊んだ回数が残ります。記録はお使いの端末のブラウザにだけ保存され、サーバーには送られません。ブラウザのデータを削除すると消えます。',
  },
  {
    q: '「ヤッツィー」と同じゲームですか？',
    a: 'サイコロ5個で役を作る同じ系統の遊びで、ヤッツィーの名でも知られています。ヤッツィーは特定の会社の商品名（登録商標）なので、このページではパブリックドメインの伝統的なゲーム名である「ヨット」を使っています。役名も、フルハウス・ストレートといった一般的な呼び名で表記しています。',
  },
];

const trail = breadcrumbFor('yacht');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'ヨット',
      url: `${SITE_URL}/yacht/`,
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

      <h1>ヨット</h1>
      <p className="lead">
        5個のサイコロを<strong>3回まで振って役を作る</strong>
        定番のダイスゲーム。12の役を埋めて、合計点の高いほうが勝ちです。CPUの強さは2段階。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>「サイコロを振る」を押すと、5個のサイコロが振られます</li>
        <li>残したいサイコロをタップ（クリック）するとキープになります</li>
        <li>キープしなかったサイコロだけを振り直せます。1手番で振れるのは3回までです</li>
        <li>スコア表の役を押すと、その時点の出目で点数が確定して手番が終わります</li>
        <li>役にならない出目でも記入できます（そのときは0点です）</li>
        <li>12手番で全部の役が埋まり、合計点の高いほうが勝ちです</li>
      </ol>

      <h2>役と点数</h2>
      <table>
        <thead>
          <tr>
            <th>役</th>
            <th>条件</th>
            <th>点数</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>エース〜シックス</td>
            <td>その目だけを数える</td>
            <td>その目の合計（4が3つなら12点）</td>
          </tr>
          <tr>
            <td>上段ボーナス</td>
            <td>エース〜シックスの合計が63点以上</td>
            <td>+35点</td>
          </tr>
          <tr>
            <td>チョイス</td>
            <td>条件なし</td>
            <td>5個の目の合計</td>
          </tr>
          <tr>
            <td>フォーダイス</td>
            <td>同じ目が4つ以上</td>
            <td>5個の目の合計</td>
          </tr>
          <tr>
            <td>フルハウス</td>
            <td>同じ目3つ＋別の同じ目2つ</td>
            <td>5個の目の合計</td>
          </tr>
          <tr>
            <td>S・ストレート</td>
            <td>4つ連続（1-2-3-4 など）</td>
            <td>15点</td>
          </tr>
          <tr>
            <td>L・ストレート</td>
            <td>5つ連続（1-2-3-4-5 / 2-3-4-5-6）</td>
            <td>30点</td>
          </tr>
          <tr>
            <td>ヨット</td>
            <td>同じ目が5つ</td>
            <td>50点</td>
          </tr>
        </tbody>
      </table>

      <h2>コツ</h2>
      <ul>
        <li>
          <strong>まず上段ボーナスの35点を狙う。</strong>
          エース〜シックスをそれぞれ3個ずつそろえると、ちょうど63点でボーナスの条件を満たします。
          4個そろった役の貯金で、そろわなかった役の不足を埋めていきます
        </li>
        <li>
          <strong>点の大きい目から片づける。</strong>
          同じ「3個」でもシックスは18点、エースは3点です。序盤の振り直しは、
          大きい目をそろえるほうに寄せたほうが上段の合計が伸びます
        </li>
        <li>
          <strong>チョイスは最後まで残す。</strong>
          どんな出目でも合計点がそのまま入るので、どこにも書けない手の受け皿になります。
          逆に序盤で使ってしまうと、後半に0点を書く役が増えます
        </li>
        <li>
          <strong>ストレート狙いは早めに見切る。</strong>
          2-3-4-5 のように両端どちらが来てもよい形なら、残り1個は2回の振り直しで約56%入ります。
          1-2-3-4 のように片側しか使えない形だと約31%まで落ちるので、
          3つしかそろっていない段階から5つ連続を狙うのは分が悪い勝負です
        </li>
        <li>
          <strong>捨てるならエースかヨット。</strong>
          エースは最大でも5点、ヨットは狙って出るものではありません。
          ただし上段ボーナスを狙っている最中は、エースを捨てるとボーナスが遠のきます
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
          .filter((g) => g.slug !== 'yacht')
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
