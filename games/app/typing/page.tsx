import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

const title = 'タイピング練習 無料｜ブラウザでできるローマ字入力の60秒トレーニング';
const description =
  '無料のタイピング練習。ひらがなのお題をローマ字で打ち、60秒でKPM（1分あたりの打鍵数）と正確率を測ります。やさしい・ふつう・むずかしいの3段階。shi と si、cha と tya のどちらの打ち方でも判定されます。登録不要、ブラウザだけで練習できます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/typing/` },
  robots: robotsFor('typing'),
};

const faq = [
  {
    q: 'スマホでも遊べますか？',
    a: 'ローマ字入力の練習なので、画面のキーボード（ソフトキーボード）では練習になりません。タッチだけの端末で開くと、その案内とキーボードの要らないゲームへの入口を出しています。外付けキーボードをつないだタブレットなら、キーを押した時点でそのまま遊べます。',
  },
  {
    q: 'ローマ字の打ち方は決まっていますか？',
    a: '決まっていません。ヘボン式（shi・chi・tsu・fu・ja）と訓令式（si・ti・tu・hu・zya）のどちらでも正しく判定します。「ちゃ」は cha でも tya でも構いません。画面のローマ字の見本は、打ち始めた表記に合わせて切り替わるので、途中で見本と食い違うことはありません。',
  },
  {
    q: '「ん」は n を1回打つのですか、2回ですか？',
    a: '次の文字によります。「ほんき」のように次が子音なら honki と n 1打で構いません（honnki と2打でも通ります）。次が母音・な行・や行のときは、読み分けができないので nn が必要です（「かんな」は kannna、「ほんや」は honnya）。語の最後の「ん」も nn（または xn）で打ち切ってください。',
  },
  {
    q: '小さい「っ」はどう打ちますか？',
    a: '次の子音を重ねます（「きっぷ」→ kippu、「がっこう」→ gakkou）。「まっちゃ」のように次が ch のときは matcha でも maccha でも mattya でも通ります。xtu・ltu と打って「っ」だけを入力する書き方も受け付けます。',
  },
  {
    q: 'KPM とは何ですか？',
    a: '1分あたりに正しく打てたキーの数です。1ラウンドは60秒なので、そのあいだに正しく打てた打鍵の数がそのまま KPM になります。日本語のローマ字入力では、150 KPM あたりが日常的にパソコンを使う人の目安、300 KPM を超えると速いほうです。',
  },
  {
    q: '打ち間違えるとどうなりますか？',
    a: 'その場で赤くなり、先に進みません。正しいキーを押すまで同じ位置で待つので、間違えた文字を消す必要はありません。ミスの数は正確率に反映されます。',
  },
  {
    q: '記録は保存されますか？',
    a: '難易度ごとに、ベストのKPM・ベストの正確率・プレイ回数をお使いのブラウザに保存します（サーバーには送信されません）。ブラウザのデータを削除すると消えます。',
  },
  {
    q: '途中でやめたいときは？',
    a: 'Esc キーか「やり直す」ボタンで、いつでも最初の状態に戻せます。',
  },
];

const trail = breadcrumbFor('typing');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'タイピング練習',
      url: `${SITE_URL}/typing/`,
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

      <h1>タイピング練習</h1>
      {/* リード文は2行に収める（3行にすると出題が画面の外へ出る） */}
      <p className="lead">
        ひらがなのお題をローマ字で打つ60秒トレーニング。
        <strong>KPMと正確率</strong>を測ります。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>難易度（やさしい・ふつう・むずかしい）を選んで「スタート」を押します</li>
        <li>お題のひらがなが出るので、その下のローマ字のとおりに打ちます</li>
        <li>
          正しいキーは確定して先へ進み、<strong>間違えたキーは赤くなって進みません</strong>。
          打ち直せばそのまま続けられます
        </li>
        <li>1語打ち切ると次のお題に変わります。60秒でどれだけ打てるかを競います</li>
        <li>
          終わると <strong>KPM（1分あたりの打鍵数）・正確率・打てた語数</strong>が出ます。
          Esc キーか「やり直す」でいつでも最初からやり直せます
        </li>
      </ol>
      <p>
        難易度ごとにベストのKPMとベストの正確率がお使いのブラウザに保存されるので、
        毎日数分ずつ続けると伸びが分かります。速さと正確さは引っぱり合うので、
        別々に記録しています。
      </p>

      <h2>ホームポジションから始める</h2>
      <p>
        タイピングが速くなる近道は、指の担当を決めてしまうことです。
        左手の人差し指を <strong>F</strong>、右手の人差し指を <strong>J</strong> に置きます。
        このキーには小さな突起があり、目で見なくても指先で見つけられます。
        残りの指はその左右に順に並べ、親指はスペースキーに置きます。
        これが<strong>ホームポジション</strong>で、1打ごとにここへ戻るのが基本です。
      </p>
      <p>
        各段のキーは、いちばん近いホームポジションの指で打ちます。たとえば
        Q・A・Z は左手の小指、W・S・X は左手の薬指、というように縦に近い列を
        担当します。最初は遅くて構わないので、<strong>キーボードを見ないで打つ</strong>
        ことを優先してください。見ながら打つ速さは頭打ちになりますが、
        見ないで打つ速さは練習した分だけ伸びます。
      </p>

      <h2>ローマ字の打ち方（ヘボン式と訓令式）</h2>
      <p>
        日本語のローマ字には主に2つの流儀があり、このゲームは<strong>どちらでも
        正しく判定します</strong>。パスポートなどで使われるヘボン式と、
        学校で習うことの多い訓令式です。
      </p>
      <table className="tp-table">
        <thead>
          <tr>
            <th>かな</th>
            <th>ヘボン式</th>
            <th>訓令式</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>し</td><td>shi</td><td>si</td></tr>
          <tr><td>ち</td><td>chi</td><td>ti</td></tr>
          <tr><td>つ</td><td>tsu</td><td>tu</td></tr>
          <tr><td>ふ</td><td>fu</td><td>hu</td></tr>
          <tr><td>じ</td><td>ji</td><td>zi</td></tr>
          <tr><td>しゃ</td><td>sha</td><td>sya</td></tr>
          <tr><td>ちゃ</td><td>cha</td><td>tya</td></tr>
          <tr><td>じゃ</td><td>ja</td><td>zya / jya</td></tr>
        </tbody>
      </table>
      <p>
        小さい「っ」は<strong>次の子音を重ねます</strong>（きっぷ → kippu）。
        「ん」は次が子音なら n 1打（ほんき → honki）、次が母音・な行・や行なら
        nn が要ります（かんな → kannna）。語の最後の「ん」も nn です。
        かな1文字ずつのローマ字を確かめたいときは、
        <a href="https://hasokon.com/tools/hebon-romaji/">ヘボン式ローマ字変換</a>
        に一覧表があります。
      </p>

      <h2>コツ</h2>
      <ul>
        <li>
          <strong>速さより正確さを先に</strong>。打ち間違いは進まないので、
          間違えるほど時間を損します。正確率95%を保てる速さが、いまの実力です
        </li>
        <li>
          手元を見ないこと。見た瞬間にホームポジションが崩れ、
          <strong>戻すのに時間がかかります</strong>
        </li>
        <li>
          お題は<strong>1語まるごと目に入れてから</strong>打ち始めると、
          指が先に動くようになります。1文字ずつ確認していると速さが頭打ちになります
        </li>
        <li>
          自分の打ち方でよいこと。shi でも si でも、いつも同じ打ち方に
          そろえるほうが速くなります
        </li>
        <li>
          <strong>1日1〜2ラウンド</strong>で十分です。長く続けるより、
          毎日少しずつのほうが伸びます
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
          .filter((g) => g.slug !== 'typing')
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
