import type { Metadata } from 'next';
import Link from 'next/link';
import { games, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

const title = 'マインスイーパー 無料｜初級・中級・上級をブラウザで';
const description =
  '無料のマインスイーパー。初級9×9から上級99地雷まで、ブラウザですぐ遊べます。最初のクリックで爆発しない安心設計。スマホは旗モードで快適に遊べます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/minesweeper/` },
};

const faq = [
  { q: '最初のクリックで負けることはありますか？', a: 'ありません。地雷は最初にクリックしたマスとその周囲を避けて配置されるので、初手は必ず安全で、周囲がまとまって開けます。' },
  { q: '難易度の違いは？', a: '盤面の大きさと地雷の数です。初級は9×9マスに地雷10個、中級は16×16マスに40個、上級は16×30マスに99個です。上の難易度ほど盤面に対する地雷の割合も増えるので、推理の難しさも上がります。' },
  { q: 'スマホで旗はどう立てますか？', a: '「旗モード」ボタンをONにすると、タップで旗の上げ下げになります。開けたいときはOFFに戻してください。PCでは右クリックで旗を立てられます。' },
  { q: '数字をタップすると周りが開くのはなぜ？', a: '旗の数がその数字と一致しているとき、残りの閉じたマスを一括で開ける機能です（本家のコード操作と同じ）。旗の位置が間違っていると地雷を踏むので注意してください。' },
  { q: '残り地雷数の表示がマイナスになります', a: '「地雷の総数 − 立てた旗の数」を表示しているためです。地雷の数より多く旗を立てるとマイナスになります。どこかの旗が間違っている合図なので、見直してみてください。' },
  { q: '記録は残りますか？', a: '難易度ごとに、ベストタイムと勝率（勝敗数）が残ります。記録はお使いの端末のブラウザにだけ保存され、サーバーには送られません。ブラウザのデータを削除すると消えます。' },
];

const trail = breadcrumbFor('minesweeper');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'マインスイーパー',
      url: `${SITE_URL}/minesweeper/`,
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

      <h1>マインスイーパー</h1>
      <p className="lead">
        数字をヒントに地雷の場所を推理する定番パズル。<strong>最初のクリックで爆発しない</strong>ようになっているので、安心して始められます。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>マスを開けると数字が出ます。数字は「周囲8マスにある地雷の数」です</li>
        <li>周囲に地雷が1つもないマスを開けると、そのまわりのマスが自動で連鎖して開きます</li>
        <li>地雷だと思うマスには旗を立てます（PCは右クリック、スマホは旗モード）</li>
        <li>地雷以外のマスをすべて開ければクリアです。旗をすべて立てる必要はありません</li>
      </ol>
      <p>
        地雷は最初にクリックしたマスとその周囲8マスを避けて配置されるので、
        <strong>初手で爆発することはなく、必ずある程度の範囲が開きます</strong>。
        画面の上には、地雷の総数から旗の数を引いた「残り地雷数」と経過タイムが
        表示されます。難易度は初級（9×9マス・地雷10個）・中級（16×16マス・40個）・
        上級（16×30マス・99個）の3段階で、ベストタイムと勝率は難易度ごとに記録されます。
      </p>
      <h2>コツ</h2>
      <ul>
        <li><strong>「1」の周りに閉じたマスが1つだけなら、そこは確実に地雷です。</strong>逆に、数字の周囲で地雷の場所がすべて確定したら、その数字に接する残りの閉じたマスはすべて安全に開けられます</li>
        <li>壁沿いに「1・2・1」と数字が並んだら、地雷は両端の1の隣にあり、真ん中の2の隣は安全、というのが有名な定石です。「1・2・2・1」の並びなら、地雷は2つの2の隣にあります</li>
        <li>数字のぶんだけ旗を立て終わったら、その数字をタップすると残りをまとめて開けられます（時短の基本テクニック）</li>
        <li>旗は「確定した地雷」にだけ立てるのがおすすめです。あいまいな場所に立てた旗は、一括開けで地雷を踏む原因になります</li>
        <li>確定できるマスから順に処理し、どうしても確率になる場面だけ賭けましょう。行き詰まったら盤面の別の場所に目を移すと、新しい確定が見つかることがよくあります</li>
      </ul>

      <h2>マインスイーパーの由来</h2>
      <p>
        マインスイーパーは1980年代からある「地雷探し」型パズルの流れをくむゲームで、
        1990年代にパソコンのOSに標準ゲームとして収録されたことで世界中に広まりました。
        初級・中級・上級という難易度の構成も、そのころから受け継がれている伝統的な
        ものです。運の要素はゼロではありませんが、ほとんどの局面は数字だけを根拠に
        論理的に解けるため、素早さと正確さを競うタイムアタックの題材としても
        長く親しまれています。まずは初級で定石を身につけて、中級・上級へ
        進んでみてください。
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
          .filter((g) => g.ready && g.slug !== 'minesweeper')
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
