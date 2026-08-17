import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';
import { CPU_LEVELS, LEVEL_LABELS, LEVEL_NOTES, sizeLabel, SIZES } from '@/lib/shinkei-suijaku';

// 「神経衰弱」（Concentration / Memory）は伝統的なトランプ遊びの一般名称で、ルールにも
// 名称にも権利者がいない。商標の問題は無い（2026-08-14 時点で確認。
// docs/features/game-shinkei-suijaku.md）
const title = '神経衰弱 無料｜ひとりでタイムアタック・CPU対戦';
const description =
  '無料の神経衰弱（メモリーゲーム）。めくった2枚が同じ数字ならもらえて、そのままもう一度めくれます。ひとりで遊ぶタイムアタックと、CPUとの対戦（強さ3段階）を用意。枚数は12枚・20枚・28枚・52枚から選べます。インストール不要・登録不要でスマホ対応、ベスト記録はこの端末に保存されます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/shinkei-suijaku/` },
  robots: robotsFor('shinkei-suijaku'),
};

const faq = [
  {
    q: '神経衰弱のルールは？',
    a: '裏向きに並べた札から2枚を選んでめくり、同じ数字（AとA、7と7など）ならその2枚をもらえます。もらえたときはそのまま続けてもう一度めくれます。違う数字なら裏に戻して次の人の番です。場の札が無くなったら終わりで、CPU対戦は取った組の数が多いほうの勝ちです。',
  },
  {
    q: '同じ数字ならスートが違ってもそろいますか？',
    a: 'そろいます。スート（♠♥♦♣）は見ずに、数字だけで組になります。52枚を選んだときは同じ数字が4枚並ぶので、そのうちどの2枚を合わせても組になります。',
  },
  {
    q: '枚数は何枚から選べますか？',
    a: `${SIZES.map((s) => sizeLabel(s)).join('・')}の4段階です。少ない枚数は覚える札が少なく、お子さんや久しぶりに遊ぶ方に向いています。52枚はトランプ1組をまるごと使う本格的な広さです。`,
  },
  {
    q: 'CPUの強さはどう違いますか？',
    a:
      'CPUは一度でも表になった札を「覚えている確率」で強さを変えています。' +
      CPU_LEVELS.map((level) => `「${LEVEL_LABELS[level]}」は${LEVEL_NOTES[level]}`).join('、') +
      '。いちばん強い設定でも完全記憶にはしていません。すべて覚えられてしまうと、こちらがめくった札を必ず取り返されて勝ち目が無くなるためです。',
  },
  {
    q: 'CPUはズルをしていませんか？',
    a: 'していません。CPUが知っているのは、あなたかCPU自身がめくって一度でも表になった札だけです。裏のままの札の中身は見ていないので、序盤はあてずっぽうにめくります。',
  },
  {
    q: 'はずれた2枚が裏に戻るのが遅い（早い）です',
    a: 'はずれた札はおよそ1秒だけ表のままにしています。覚える前に消えてしまわないための間ですが、待ちたくないときは画面のどこかをタップすればすぐ裏に戻ります。',
  },
  {
    q: '記録は残りますか？',
    a: '残ります。ひとりで遊ぶときは枚数ごとにベストタイムと最少手数、CPU対戦では枚数と強さの組み合わせごとに勝敗が残ります。記録はお使いの端末のブラウザにだけ保存され、サーバーには送られません。ブラウザのデータを削除すると消えます。',
  },
  {
    q: '2人で遊べますか？',
    a: 'いまはひとり用とCPU対戦だけです。同じ端末を交代で使う2人プレイやオンライン対戦は用意していません。CPU対戦の強さを「強」にすると、手強い相手との勝負に近い緊張感になります。',
  },
];

const trail = breadcrumbFor('shinkei-suijaku');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: '神経衰弱',
      url: `${SITE_URL}/shinkei-suijaku/`,
      gamePlatform: 'Web Browser',
      applicationCategory: 'Game',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 2 },
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

      <h1>神経衰弱</h1>
      <p className="lead">
        めくった2枚が<strong>同じ数字ならもらえて、そのままもう一度めくれる</strong>定番のカードゲーム。
        ひとりで遊ぶタイムアタックと、強さ3段階のCPU対戦を用意しました。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>裏向きの札を1枚タップしてめくります</li>
        <li>もう1枚めくって、<strong>数字が同じならその2枚がもらえます</strong>（スートは関係ありません）</li>
        <li>そろったときは<strong>続けてもう一度めくれます</strong>。連続で当てるほど差がつきます</li>
        <li>違う数字なら約1秒表示してから裏に戻ります（画面タップですぐ戻せます）</li>
        <li>場の札が無くなったら終わり。CPU対戦は取った組が多いほうの勝ちです</li>
      </ol>

      <h2>枚数の選び方</h2>
      <table>
        <thead>
          <tr>
            <th>枚数</th>
            <th>組数</th>
            <th>向いている人</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>12枚</strong>
            </td>
            <td>6組</td>
            <td>お子さんと一緒に。数分で終わります</td>
          </tr>
          <tr>
            <td>
              <strong>20枚</strong>
            </td>
            <td>10組</td>
            <td>ちょうどよい長さ。初期値はこれです</td>
          </tr>
          <tr>
            <td>
              <strong>28枚</strong>
            </td>
            <td>14組</td>
            <td>覚える量が一気に増えて手ごたえが出ます</td>
          </tr>
          <tr>
            <td>
              <strong>52枚</strong>
            </td>
            <td>26組</td>
            <td>トランプ1組をまるごと。同じ数字が4枚並びます</td>
          </tr>
        </tbody>
      </table>

      <h2>CPUの強さ</h2>
      <p>
        CPUの強さは、<strong>一度でも表になった札を覚えている確率</strong>だけで決まります。
        裏のままの札は見ていないので、序盤はあてずっぽうにめくります。
      </p>
      <table>
        <thead>
          <tr>
            <th>強さ</th>
            <th>打ち回し</th>
          </tr>
        </thead>
        <tbody>
          {/* 説明は lib/shinkei-suijaku.ts の LEVEL_NOTES から作る。
              2か所に書くと片方だけ直して食い違うため */}
          {CPU_LEVELS.map((level) => (
            <tr key={level}>
              <td>
                <strong>{LEVEL_LABELS[level]}</strong>
              </td>
              <td>{LEVEL_NOTES[level]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>コツ</h2>
      <ul>
        <li>
          <strong>場所と数字をセットで覚える。</strong>
          「7があった」だけでは足りません。「左上から2番目に7」のように、
          位置と結びつけて覚えると思い出しやすくなります
        </li>
        <li>
          <strong>知らない札を先にめくる。</strong>
          1枚目は、まだ一度も表になっていない札を選ぶのが得です。
          外れても新しい情報が1枚増えるので、次の番につながります
        </li>
        <li>
          <strong>そろえられる組は先に取る。</strong>
          場所を覚えている組をあとに回すと、相手に取られるか自分が忘れます。
          確実に取れるものから取って、連続手番を伸ばしましょう
        </li>
        <li>
          <strong>CPU対戦では「めくらされる」ことに気をつける。</strong>
          自分がめくった札はCPUにも見えています。当てられそうにない場面では、
          すでに表になった札を組み合わせて情報を増やさない選び方も有効です
        </li>
        <li>
          <strong>52枚は同じ数字が4枚。</strong>
          1枚見つければ、残り3枚のどれと合わせても組になります。
          少ない枚数より当たりやすい場面が多いので、思い切ってめくって構いません
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
          .filter((g) => g.slug !== 'shinkei-suijaku')
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
