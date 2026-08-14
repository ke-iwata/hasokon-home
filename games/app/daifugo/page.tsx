import type { Metadata } from 'next';
import Link from 'next/link';
import { games, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

// 「大富豪（大貧民）」は日本の伝統的なトランプ遊びの一般名称で、ルールも名称も
// パブリックドメイン。商標の問題は無い（2026-08-14 時点で確認。
// docs/features/game-daifugo.md の「権利面が完全にクリーン」）
const title = '大富豪 無料｜CPU対戦（8切り・革命・縛り）';
const description =
  '無料の大富豪（大貧民）。CPU3人と5回戦を戦って通算点で階級を決めます。8切り・革命・縛りは標準で有効、都落ち・11バック・スペ3返しは設定で切り替え。CPUの強さは かんたん・ふつう・つよい の3段階。インストール不要・登録不要でスマホ対応。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/daifugo/` },
};

const faq = [
  {
    q: '大富豪のルールは？',
    a: '配られた札を順番に出していき、いちばん早く手札を無くした人が大富豪になります。場に出ている役より強い役でなければ出せず、出せない（出したくない）ときはパスします。自分以外の全員がパスすると場が流れ、最後に出した人から新しい役を出せます。このページは1人＋CPU3人の4人戦で、5回戦の通算点で最終の階級（大富豪・富豪・貧民・大貧民）が決まります。',
  },
  {
    q: '札の強さの順番は？',
    a: '弱いほうから 3・4・5・6・7・8・9・10・J・Q・K・A・2 の順で、ジョーカー2枚がいちばん強い札です。ジョーカーは革命中でも最強のままで、返せるのは「スペ3返し」をONにしたときの ♠3 だけです。',
  },
  {
    q: 'どんな役が出せますか？',
    a: '同じ数字の組（1枚・2枚・3枚・4枚）と、同じスートの3枚以上の連番（階段）です。ジョーカーは足りない札の代わりになり、組の枚数を増やしたり、階段の穴を埋めたりできます。場に出ている役と同じ種類・同じ枚数でなければ出せません。',
  },
  {
    q: '8切り・革命・縛りとは？',
    a: '8切りは8を含む役を出すと場がすぐ流れ、同じ人がもう一度出せるルールです。革命は同じ数字を4枚出すと札の強さが上下逆転するルールで、もう一度4枚出されると元に戻ります（革命返し）。縛りは、同じ場で直前と同じスートの構成が続いたとき、その場ではそのスートしか出せなくなるルールです。この3つは標準で有効です。',
  },
  {
    q: '都落ち・11バック・スペ3返しも使えますか？',
    a: '使えます。ゲーム画面の「ローカルルール」を開くと切り替えられます。都落ちは、前回の大富豪が1位で上がれなかった時点で大貧民に落ちるルール。11バックはJを含む役を出すとその場だけ強さが逆転するルール。スペ3返しはジョーカー1枚に ♠3 の1枚で返して場を流せるルールです。地域差が大きいルールなので初期値はOFFにしてあります。',
  },
  {
    q: 'カード交換はどうなりますか？',
    a: '2回戦目からは前の回戦の階級に応じて交換します。大貧民は大富豪へ最も強い2枚、貧民は富豪へ最も強い1枚を渡し、大富豪と富豪はお返しに最も弱い札を同じ枚数だけ渡します。渡す札は自動で選ばれるので、手番が止まることはありません。',
  },
  {
    q: 'CPUの強さはどのくらいですか？',
    a: '「かんたん」は出せる役から深く考えずに選ぶので、序盤から2やジョーカーを切ってしまいます。「ふつう」は弱い役から順に出し、切り札は最後まで取っておきます。「つよい」はそれに加えて、同じ数字の組を崩さない・8切りで続けて出す・手札が多いうちは切り札を使わず見送る、といった判断をします。どの強さでも上がれる手は必ず出します。',
  },
  {
    q: '記録は残りますか？',
    a: 'CPUの強さごとに、大富豪になった回数・試合数・最高の通算点が残ります。記録はお使いの端末のブラウザにだけ保存され、サーバーには送られません。ブラウザのデータを削除すると消えます。',
  },
];

const trail = breadcrumbFor('daifugo');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: '大富豪',
      url: `${SITE_URL}/daifugo/`,
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

      <h1>大富豪</h1>
      <p className="lead">
        CPU3人と<strong>5回戦を戦って通算点で階級を決める</strong>
        定番のトランプゲーム。8切り・革命・縛りは標準で有効、都落ち・11バック・スペ3返しは設定で切り替えられます。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>手札の札をタップ（クリック）して選び、「出す」を押します</li>
        <li>
          出せるのは<strong>同じ数字の組</strong>（1〜4枚）か、
          <strong>同じスートの3枚以上の連番</strong>（階段）です
        </li>
        <li>場に役があるときは、同じ種類・同じ枚数で、より強い役しか出せません</li>
        <li>出せない（出したくない）ときは「パス」。自分以外が全員パスすると場が流れます</li>
        <li>手札を先に無くすほど上の階級になり、5回戦の通算点で最終順位が決まります</li>
      </ol>

      <h2>札の強さ</h2>
      <p>
        弱いほうから <strong>3・4・5・6・7・8・9・10・J・Q・K・A・2</strong>、
        そしていちばん強いのがジョーカー（2枚）です。3がいちばん弱く2が強いところだけ、
        ふつうのトランプゲームと違います。革命中はこの順番が上下そっくり逆になりますが、
        <strong>ジョーカーだけは革命中でも最強のまま</strong>です。
      </p>

      <h2>コツ</h2>
      <ul>
        <li>
          <strong>弱い札から出す。</strong>
          2やジョーカーは終盤に場を取り返すための切り札です。序盤に切ってしまうと、
          最後の1枚を出せずに残ってしまいます
        </li>
        <li>
          <strong>組を崩さない。</strong>
          同じ数字を2枚持っているなら、1枚だけ出すよりペアで出すほうが手札が早く減ります。
          4枚そろっているなら革命の切り札になります
        </li>
        <li>
          <strong>8は場を流す札。</strong>
          8切りを使うと自分がもう一度出せるので、
          <strong>そのあとに弱い札をまとめて捨てられる場面</strong>まで取っておくと効きます
        </li>
        <li>
          <strong>弱い札だらけになったら革命を狙う。</strong>
          3や4ばかりが残ったときは、同じ数字を4枚そろえて革命を起こせば一気に最強の手札になります
        </li>
        <li>
          <strong>上がる直前は縛りに注意。</strong>
          縛りが成立するとスートが限定されるので、
          残り札のスートが偏っていると上がれなくなることがあります
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
          .filter((g) => g.ready && g.slug !== 'daifugo')
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
