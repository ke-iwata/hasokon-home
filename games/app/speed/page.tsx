import type { Metadata } from 'next';
import Link from 'next/link';
import { games, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';
import { CPU_LEVELS, HAND_SIZE, LEVEL_LABELS, LEVEL_NOTES } from '@/lib/speed';

// 「スピード」（Speed / Spit）は伝統的なトランプ2人遊びの一般名称で、ルールにも
// 名称にも権利者がいない。商標の問題は無い（2026-08-15 時点で確認。
// docs/features/game-speed.md）
const title = 'スピード（トランプ）無料｜CPU対戦・強さ3段階';
const description =
  '無料で遊べるトランプの「スピード」。台札とつながる数字の札を、相手と同時に出し合って先に出し切ったほうの勝ちです。CPUとの対戦は強さ3段階。タップだけで出せてドラッグは不要、1ゲーム1〜2分。インストール不要・登録不要でスマホ対応、勝敗とベストタイムはこの端末に保存されます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/speed/` },
};

const faq = [
  {
    q: 'スピードのルールは？',
    a: `トランプ52枚を2人で26枚ずつ分け、${HAND_SIZE}枚を場札として表に持ちます。中央には台札が2つあり、台札の数字と連続する数字（1つ上か1つ下）の札を場札から出せます。出したらすぐ山札から場札を補充します。手番は無く、2人が同時に出し合います。山札と場札をすべて出し切ったほうの勝ちです。`,
  },
  {
    q: 'AとKはつながりますか？',
    a: 'つながります。A（1）の次はK（13）、Kの次はAとして扱う標準ルールです。つまり数字は輪になっていて、A の上に出せるのは 2 と K、K の上に出せるのは Q と A です。',
  },
  {
    q: 'スート（マーク）は関係ありますか？',
    a: '関係ありません。♠♥♦♣ は見ずに、数字が1つ違い（またはAとK）であれば出せます。',
  },
  {
    q: 'どうやって札を出しますか？',
    a: '出したい場札をタップするだけです。出せる台札が1つだけなら、そのままそこへ出ます。2つとも出せるときだけ、光っている台札をタップして出し先を選びます。ドラッグは要りません。',
  },
  {
    q: 'おたがい出せなくなったらどうなりますか？',
    a: '自動で台札をめくり直します。双方とも出せる札が1枚も無くなると「せーの！」の合図が出て、少し置いてから、おたがいの山札から1枚ずつ台札に重ねて再開します。手詰まりかどうかの判断はゲーム側が行うので、めくるタイミングを計る必要はありません。',
  },
  {
    q: 'CPUの強さはどう違いますか？',
    a:
      'CPUは「出せる札に気づくまでの時間」と「見落とす確率」で強さを変えています。' +
      CPU_LEVELS.map((level) => `「${LEVEL_LABELS[level]}」は${LEVEL_NOTES[level]}`).join('、') +
      '。いちばん強い設定でも、出せる札が現れた瞬間に反応することはありません。人間に反応できない速さにすると、勝ち目のない相手になってしまうためです。',
  },
  {
    q: 'CPUはズルをしていませんか？',
    a: 'していません。CPUが見ているのは、中央の台札と自分の場札だけです。あなたの山札の中身も、次に出す札も見ていません。',
  },
  {
    q: '山札が先に無くなったらどうなりますか？',
    a: '残った場札だけで続けます。台札をめくり直す場面では、山札が残っているほうがその札を出します。どちらの山札も無くなり、しかも双方が出せなくなったときは、残り枚数の少ないほうの勝ち（同じなら引き分け）としています。',
  },
  {
    q: '1人で遊べますか？　2人で遊べますか？',
    a: 'CPU対戦だけを用意しています。スピードは2人が同時に手を動かすゲームなので、1台の端末を2人で分け合うと手が交錯してしまいます。オンライン対戦も用意していません。',
  },
  {
    q: '記録は残りますか？',
    a: '残ります。CPUの強さごとに勝敗と、勝ったときのベストタイムが残ります。記録はお使いの端末のブラウザにだけ保存され、サーバーには送られません。ブラウザのデータを削除すると消えます。',
  },
];

const trail = breadcrumbFor('speed');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'スピード（トランプ）',
      url: `${SITE_URL}/speed/`,
      gamePlatform: 'Web Browser',
      applicationCategory: 'Game',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 1 },
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

      <h1>スピード</h1>
      <p className="lead">
        台札と<strong>1つ違いの数字</strong>を、相手と同時に出し合うトランプの定番。
        手番の交代を待たないので、速く見つけて速く出したほうが勝ちます。CPUの強さは3段階です。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>「はじめる」を押すと、おたがいの山札から1枚ずつ中央の台札に置かれます</li>
        <li>
          自分の場札{HAND_SIZE}枚のうち、<strong>台札と1つ違いの数字</strong>
          の札をタップすると出せます（AとKもつながります）
        </li>
        <li>出すと山札から自動で補充されます。手番はありません。相手と同時に出し合います</li>
        <li>2つの台札のどちらにも出せるときは、光っている台札をタップして出し先を選びます</li>
        <li>双方とも出せなくなったら「せーの！」で台札をめくり直し、そのまま続きます</li>
        <li>
          <strong>山札と場札を先に出し切ったほうの勝ち</strong>です
        </li>
      </ol>

      <h2>CPUの強さ</h2>
      <p>
        CPUの強さは、<strong>出せる札に気づくまでの時間</strong>と
        <strong>見落とす確率</strong>の2つで決めています。反射のゲームなので、
        読みの深さではなく反応そのものが強さになります。
      </p>
      <table>
        <thead>
          <tr>
            <th>強さ</th>
            <th>反応</th>
          </tr>
        </thead>
        <tbody>
          {/* 説明は lib/speed.ts の LEVEL_NOTES から作る。
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
          <strong>場札は端から出す。</strong>
          どれを出しても同じに見えますが、端の枠から出していくと補充された新しい札が
          いつも同じ位置に来るので、目で追う場所が減ります
        </li>
        <li>
          <strong>台札は2つとも見る。</strong>
          片方に集中すると、もう片方に出せる札を持ったまま止まります。
          2枚の数字を「上下1つずつ」で覚えておくと、場札を見た瞬間に判断できます
        </li>
        <li>
          <strong>出せる札が2枚あるときは、先に出しにくいほうを出す。</strong>
          同じ札がどちらの台札にも出せる場面では、次に補充される札のことは考えず、
          とにかく先に出したほうが得です。速さがそのまま差になります
        </li>
        <li>
          <strong>AとKのつながりを忘れない。</strong>
          いちばん見落としやすいのがここです。Aの上にKを、Kの上にAを出せます
        </li>
        <li>
          <strong>手詰まりのあとが勝負どころ。</strong>
          めくり直した直後は、双方の場札に出せる札が一気に増えます。
          めくられる瞬間に自分の場札を見ておくと、先に反応できます
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
        {games
          .filter((g) => g.ready && g.slug !== 'speed')
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
