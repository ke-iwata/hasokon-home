import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

const title = 'スパイダーソリティア 無料｜1スートから4スートまで';
const description =
  '無料のスパイダーソリティア。初心者向けの1スートから上級の4スートまで難易度を選べます。タップで自動移動の簡単操作。インストール不要でブラウザからすぐ。スマホ対応。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/spider/` },
  robots: robotsFor('spider'),
};

const faq = [
  { q: '難易度の違いは？', a: 'スートの種類の数です。1スート（スペードのみ）は初心者向け、2スート（スペードとハート）は中級、4スートは上級です。枚数はどれも104枚（2デック）で、配り方も同じです。' },
  { q: '別のスートの上に重ねられますか？', a: '重ねられます。ただし、まとめて動かせるのは同じスートで連続した並びだけなので、別スートに重ねた札はほどくのに手間がかかります。' },
  { q: '「配る」が押せないのはなぜ？', a: '空の列があるときは配れないルールです。どこかの札を空列に移動して、全列を埋めてから配ってください。' },
  { q: '「配る」は何回できますか？', a: '5回です。山札は50枚あり、1回配るごとに10列へ1枚ずつ置かれます。5回配り切ったあとは、場にある札だけで8組を完成させることになります。残り回数はボタンに表示されます。' },
  { q: '完成した組はどうなりますか？', a: 'KからAまで同じスートで13枚並ぶと、その並びは自動で場から回収され、画面の「完成」の数が増えます。8組回収すればクリアです。' },
  { q: '失敗したら戻せますか？', a: '「もどす」ボタンで直近30手まで戻せます。' },
  { q: '記録は残りますか？', a: '難易度（スート数）ごとに、ベストタイム・最少手数・クリア回数とプレイ回数が残ります。記録はお使いの端末のブラウザにだけ保存され、サーバーには送られません。' },
];

const trail = breadcrumbFor('spider');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'スパイダーソリティア',
      url: `${SITE_URL}/spider/`,
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

      <h1>スパイダーソリティア</h1>
      <p className="lead">
        KからAまで同じスートで並べて場から取り除いていく、やり応えのあるソリティア。<strong>タップで選んでタップで置く</strong>簡単操作。1スートなら初心者でもクリアできます。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>ルール</h2>
      <p>
        トランプ2組104枚を使います。場札は10列で、左の4列に6枚、右の6列に5枚ずつ配られ、
        各列のいちばん手前の1枚だけが表向きです。残りの50枚は山札になり、
        手詰まりのときに10列へ1枚ずつ配ります。
      </p>
      <ol>
        <li>場札の中で「1つ小さい数字」の札の上に重ねられます（スートは問いません）</li>
        <li>ただし<strong>まとめて動かせるのは同じスートで連続した並びだけ</strong>です</li>
        <li>KからAまで同じスートで13枚並ぶと自動で回収されます。8組そろえば勝ちです</li>
        <li>手詰まりになったら「配る」で山札から全列に1枚ずつ配ります（空列があると配れません）</li>
      </ol>
      <p>
        操作はタップ（クリック）だけです。動かしたい並びをタップして選び、行き先の列を
        タップします。<strong>同じ札をもう一度タップすると自動で移動</strong>し、行き先は
        「同じスートで続けられる列 → 数字だけ合う列 → 空列」の順で選ばれます。
        「もどす」で直近30手まで戻せるので、試しに動かしながら考えることもできます。
      </p>
      <h2>コツ</h2>
      <ul>
        <li>できるだけ<strong>同じスートでつなげる</strong>ことを優先しましょう。別スートに重ねると、その下の札はしばらく使えなくなります</li>
        <li>まずは<strong>裏向きの札を表にする</strong>ことを優先します。配られた枚数が5枚と少ない右側の列のほうが早く掘り切れるので、空列を作る狙い目です</li>
        <li>空列は最強の作業場です。別スートの上に乗って動けなくなった並びを一時的に退避させたり、行き場のない大きい札の置き場にしたりと、1列空くだけで整理が一気に進みます</li>
        <li>Kはどの札の上にも置けません。Kが列をふさいでいるときは空列へ移す以外に動かす方法がないので、後回しにしすぎないようにしましょう</li>
        <li>「配る」の前に、できる移動を全部済ませておきましょう。配ると各列のいちばん手前に無関係な札が1枚ずつ乗り、せっかく整えた並びが崩れます</li>
        <li>4スートでは完璧を求めすぎないこと。別スートへの重ねも織り交ぜてまず裏札を開き、あとから並びを組み直すのが現実的です</li>
      </ul>

      <h2>難易度の選び方</h2>
      <p>
        1スートはスートの組み合わせを気にする場面がなく、手順に慣れれば高い確率で
        クリアできます。初めての方はまず1スートで「同じスートの並びを育てて回収する」
        感覚をつかむのがおすすめです。2スートからは「別のスートに重ねるかどうか」の
        判断が加わって難しさが一段上がり、4スートは1回のクリアに数十分かかることも
        珍しくない上級者向けです。記録は難易度ごとに分かれて残るので、
        段階的に挑戦してみてください。
      </p>

      <h2>スパイダーソリティアの由来</h2>
      <p>
        スパイダーソリティアは古くから遊ばれてきたソリティア（トランプの一人遊び）の
        一種で、完成させる8つの組をクモの8本の脚に見立てたのが名前の由来とされています。
        パソコンの標準ゲームとして収録されたことをきっかけに、世界的な定番になりました。
        1組52枚で遊ぶ<Link href="/solitaire/">ソリティア（クロンダイク）</Link>に比べて
        使う札が2倍あり、1ゲームにかかる時間も長い、じっくり考える型のソリティアです。
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
          .filter((g) => g.slug !== 'spider')
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
