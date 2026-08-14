import type { Metadata } from 'next';
import Link from 'next/link';
import { games, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';
import { CPU_STYLES, DEFAULT_RULES, PASS_LIMIT, RULE_LABELS } from '@/lib/shichinarabe';

// 七並べ（Sevens / Fan Tan）は伝統的トランプゲームの一般名称で、ルールにも名称にも
// 権利者がいない。商標の問題は無い（2026-08-14 時点で確認。
// docs/features/game-shichinarabe.md の「権利関係が無害」）
const title = '七並べ 無料｜CPU3人と対戦（パス3回・トンネル対応）';
const description =
  '無料の七並べ（Sevens）。CPU3人と5回戦を戦って通算点で総合順位を決めます。パスは3回まで、4回目で失格して手札が場に開くルール。AとKをつなぐトンネルは設定で切り替えられます。CPUは「せっかち・しんちょう・いじわる」の3つの性格で打ち回しが変わります。インストール不要・登録不要でスマホ対応。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/shichinarabe/` },
};

const faq = [
  {
    q: '七並べのルールは？',
    a: '配られた手札のうち7は最初に全員が場に出し、そこから順番に、場に出ている札の隣の数字を出していきます（♠7 が出ていれば ♠6 と ♠8 が出せます）。出せない、または出したくないときはパスします。手札を先に出し切った人から勝ち抜けで、このページは1人＋CPU3人の4人戦、5回戦の通算点（1位から3・2・1・0点）で総合順位が決まります。',
  },
  {
    q: 'パスは何回まで？',
    a: `${PASS_LIMIT}回までです。${PASS_LIMIT + 1}回目のパスをすると失格になり、そのとき持っていた手札はすべて場に開かれます。開いた札のぶんだけ他の人が出せる札が一気に増えるので、失格は自分が負けるだけでなく場を大きく動かします。失格した人は勝ち抜けた人より下の順位で、失格どうしなら残り枚数が少なかったほうが上になります。`,
  },
  {
    q: '出せる札があるのにパスできますか？',
    a: 'できます。ここが七並べの駆け引きです。たとえば ♠8 を持っていて、♠9 から ♠K を相手が持っていそうなときは、出さずに止めておくと相手の手が止まります。ただしパスの回数は限られているので、止めすぎると自分が失格します。',
  },
  {
    q: 'トンネルとは？',
    a: 'AとKをつなげて輪にするローカルルールです。ONにすると ♠K が場にあるとき ♠A を出せる（逆も同じ）ようになり、行き止まりが減ってゲームが速く終わります。OFFのときは A が下端・K が上端で行き止まりです。ゲーム画面の「ローカルルール」から切り替えられます（初期値はOFF）。',
  },
  {
    q: '最後に残った1人はどうなりますか？',
    a: '勝ち抜けと失格で3人が抜けて残り1人になった時点で、その回戦は終わります。残った人は勝ち抜けた人のいちばん下の順位になり、手札は持ったままです。1人だけで続けても順位は変わらないので、待ち時間をなくすためにそこで終えています。',
  },
  {
    q: '7以外の札から始めることはできますか？',
    a: 'できません。7は手札に来た時点で自動的に場に出ます。7を抱えて場を止めるローカルルールもありますが、初めての人に分かりにくく待ち時間も長くなるので、このページでは採用していません。',
  },
  {
    q: 'CPUの強さは選べますか？',
    a: '段階では選べませんが、CPU3人にそれぞれ違う性格を付けてあります。' +
      CPU_STYLES.map((s) => `「${s.label}」は${s.note}`).join('、') +
      '。七並べは出せる札が各スート1枚ずつに限られるため、強さを段階にするより性格の差のほうが打ち回しの違いとして分かりやすくなります。',
  },
  {
    q: 'CPUは手札を見ていませんか？',
    a: '見ていません。CPUが判断に使うのは「場に出ている札」と「自分の手札」だけです。場にも自分の手札にも無い札は誰かが持っている、という公開情報だけから、その札を出すと相手をどれだけ助けるかを見積もっています。',
  },
  {
    q: '記録は残りますか？',
    a: 'ルール（標準・トンネルあり）ごとに、1位になった回数・試合数・最高の通算点が残ります。記録はお使いの端末のブラウザにだけ保存され、サーバーには送られません。ブラウザのデータを削除すると消えます。',
  },
];

const trail = breadcrumbFor('shichinarabe');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: '七並べ',
      url: `${SITE_URL}/shichinarabe/`,
      gamePlatform: 'Web Browser',
      applicationCategory: 'Game',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      numberOfPlayers: { '@type': 'QuantitativeValue', value: 4 },
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

      <h1>七並べ</h1>
      <p className="lead">
        CPU3人と<strong>5回戦を戦って通算点で順位を決める</strong>トランプの定番。
        パスは3回まで、4回目で失格して手札が場に開きます。AとKをつなぐトンネルも切り替えられます。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>配られた手札のうち、7は自動で場に出ます（4枚とも場に並びます）</li>
        <li>
          自分の番になったら、<strong>場にある札の隣の数字</strong>をタップして出します
          （♠7 が場にあれば ♠6 と ♠8 が出せます）
        </li>
        <li>出せない、または出したくないときは「パス」。パスは3回までです</li>
        <li>
          4回目のパスで<strong>失格</strong>。手札はすべて場に開かれ、その回戦は下位が確定します
        </li>
        <li>手札を先に出し切った人から勝ち抜け。5回戦の通算点で総合順位が決まります</li>
      </ol>

      <h2>ローカルルール</h2>
      <p>
        七並べは地域や仲間内でルールが違うゲームです。このページでは下のルールを切り替えられます
        （ゲームの「ローカルルール」を開いて設定します）。
        <strong>切り替えると試合が最初からやり直しになります。</strong>
      </p>
      <table>
        <thead>
          <tr>
            <th>ルール</th>
            <th>内容</th>
            <th>初期値</th>
          </tr>
        </thead>
        <tbody>
          {/* 設定パネルと同じ lib/shichinarabe.ts の RULE_LABELS から作る。
              説明を2か所に書くと、片方だけ直して食い違うため */}
          {RULE_LABELS.map(({ key, label, note }) => (
            <tr key={key}>
              <td>
                <strong>{label}</strong>
              </td>
              <td>{note}</td>
              <td>{DEFAULT_RULES[key] ? 'ON' : 'OFF'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>CPUの3人の性格</h2>
      <p>
        CPUには強さの段階ではなく、<strong>止め札をどこまで抱えるか</strong>の性格を付けてあります。
        七並べは出せる札が各スート1枚ずつに限られるので、
        読みの深さより「止めるか出すか」の差のほうが打ち回しの違いとして表れます。
      </p>
      <table>
        <thead>
          <tr>
            <th>性格</th>
            <th>打ち回し</th>
          </tr>
        </thead>
        <tbody>
          {CPU_STYLES.map((s) => (
            <tr key={s.id}>
              <td>
                <strong>{s.label}</strong>
              </td>
              <td>{s.note}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>コツ</h2>
      <ul>
        <li>
          <strong>端の札から出す。</strong>
          A や K に近い札は、出しても相手に渡る札がほとんどありません。
          逆に6や8を出すと、その先の札を持っている人が一気に楽になります
        </li>
        <li>
          <strong>つながっている札は強い。</strong>
          ♠9・♠10・♠J のように続けて持っていれば、出しても次に出るのは自分の札です。
          安心して出せる並びから減らしていきましょう
        </li>
        <li>
          <strong>止め札は「パスの残り回数」と相談する。</strong>
          相手を止められる札を抱えるほど有利ですが、パスは3回まで。
          止めた結果、自分が出せる札を作れずに失格しては元も子もありません
        </li>
        <li>
          <strong>誰かが残り1〜2枚なら止めない。</strong>
          上がられてしまえば止めた意味はありません。
          その場面では自分の手札を減らして、2位・3位を確保するほうが通算点で得です
        </li>
        <li>
          <strong>失格者が出たあとがチャンス。</strong>
          開いた札の隣が一斉に出せるようになります。
          自分が抱えていた札がつながる並びを覚えておくと、まとめて減らせます
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
          .filter((g) => g.ready && g.slug !== 'shichinarabe')
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
