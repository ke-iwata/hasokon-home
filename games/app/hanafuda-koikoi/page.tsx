import type { Metadata } from 'next';
import Link from 'next/link';
import { games, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';
import { CPU_LEVELS, DOUBLE_AT, HAND_SIZE, LEVEL_LABELS, LEVEL_NOTES, YAKU_TABLE } from '@/lib/hanafuda';

// 花札のルールも伝統的な絵柄（松に鶴・芒に月など）もパブリックドメインで、権利者は
// いない。特定メーカーの製品の絵柄は模写せず、48枚とも自前のSVGで描き起こしている。
// ゲーム名も一般名称の「花札 こいこい」だけを使う（2026-08-15 時点で確認。
// docs/features/game-hanafuda-koikoi.md）
const title = '花札 こいこい 無料｜CPU対戦・役一覧つき';
const description =
  '無料で遊べる花札の「こいこい」。場札と同じ月の札を合わせて取り、五光・赤短・猪鹿蝶などの役をつくります。CPUとの対戦は強さ3段階、6ヶ月戦と12ヶ月戦を選べます。48枚の札はすべてオリジナルのSVG。役の一覧と「あと何枚で役になるか」の案内つきで、初めてでも遊びながら覚えられます。インストール不要・登録不要でスマホ対応、成績はこの端末に保存されます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/hanafuda-koikoi/` },
};

const faq = [
  {
    q: 'こいこいのルールは？',
    a: `花札48枚（12ヶ月×4枚）を使う2人用の遊びです。手札${HAND_SIZE}枚・場札${HAND_SIZE}枚を配り、残りが山札になります。手番では、場札と同じ月の手札を出して2枚とももらい、続けて山札を1枚めくって同じように合わせます。役ができたら「あがる」か「こいこい」を選び、あがった時点の役の合計が点数（文）になります。`,
  },
  {
    q: '「こいこい」とは何ですか？',
    a: '役ができたときに「まだ続ける」と宣言することです。こいこいをすると、その時点の点数を超える役ができるまであがれなくなります。そのかわり、より大きな役をねらえます。ただし、こいこいをしたあとに相手が上がると、相手の点数が2倍になります（こいこい返し）。',
  },
  {
    q: '点数はどう決まりますか？',
    a: `あがった時点で成立している役の合計が素点です。合計が${DOUBLE_AT}文以上なら2倍、相手がこいこいをしていたらさらに2倍になります（両方なら4倍）。このサイトでは勝ったほうに文を足すだけで、負けたほうから引くことはしません。`,
  },
  {
    q: '光の役（五光・四光・三光）の違いは？',
    a: '光は5枚（松に鶴・桜に幕・芒に月・柳に小野道風・桐に鳳凰）あります。5枚そろえば五光で10文。4枚のときは、柳（小野道風）を含まなければ四光で8文、含むと雨四光で7文です。3枚のときは柳を含まない場合だけ三光で5文になります。柳を含む光3枚は役になりません。光の役は同時には成立せず、いちばん高いものだけを数えます。',
  },
  {
    q: '花見酒・月見酒は入っていますか？',
    a: '初期設定では入っています。地域や家庭で採否の分かれるローカルルールなので、盤面の上のチェックで外せます。外すと「菊に盃」はタネ札として数えるだけになります。',
  },
  {
    q: '手四・くっつきとは？',
    a: '配られた手札だけで決まる役です。同じ月の札が4枚そろっていれば「手四」、同じ月2枚の組が4つあれば「くっつき」で、どちらも6文でその月が終わります。まれにしか起きませんが、起きたときはそのまま次の月へ進みます。',
  },
  {
    q: 'CPUの強さはどう違いますか？',
    a:
      'CPUは「取る札の価値の見かた」と「こいこいの判断」で強さを変えています。' +
      CPU_LEVELS.map((level) => `「${LEVEL_LABELS[level]}」は${LEVEL_NOTES[level]}`).join('、') +
      '。CPUはあなたの手札も山札の中身も見ていません。見ているのは場札と、おたがいの取り札だけです。',
  },
  {
    q: '札の月が分かりません',
    a: '札の右上に月数を出しています（初期設定でオン）。伝統的な札には無い表示なので、草木で見分けられるようになったら盤面の上のチェックで外せます。手札は月ごとにまとまるよう自動で並び替わり、出せる札は枠が光ります。',
  },
  {
    q: '賭けの要素はありますか？',
    a: 'ありません。点数は「文」というゲーム内の表示だけで、お金のやりとりや換金の要素は一切入れていません。',
  },
  {
    q: '記録は残りますか？',
    a: '残ります。CPUの強さと月数の組み合わせごとに、勝敗と最高の文が残ります。記録はお使いの端末のブラウザにだけ保存され、サーバーには送られません。ブラウザのデータを削除すると消えます。',
  },
];

const trail = breadcrumbFor('hanafuda-koikoi');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: '花札 こいこい',
      url: `${SITE_URL}/hanafuda-koikoi/`,
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

      <h1>花札 こいこい</h1>
      <p className="lead">
        場札と<strong>同じ月</strong>の札を合わせて取り、役をつくる日本の伝統的なカードゲーム。
        CPUの強さは3段階、6ヶ月戦と12ヶ月戦を選べます。48枚の札はすべてオリジナルの描き起こしです。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>
          手札{HAND_SIZE}枚・場札{HAND_SIZE}枚が配られます。残りの24枚が山札です
        </li>
        <li>
          手札から<strong>場札と同じ月の札</strong>をタップすると、その2枚がもらえます。
          同じ月が場に無ければ、出した札はそのまま場に残ります
        </li>
        <li>
          続けて<strong>山札が1枚めくられます</strong>。こちらも同じ月の場札があればもらえます
        </li>
        <li>
          取り札で<strong>役</strong>ができたら、その場で<strong>あがる</strong>か、
          もっと大きな役をねらって<strong>こいこい</strong>するかを選びます
        </li>
        <li>
          あがった人に役の合計（文）が入り、その月は終わりです。
          だれもあがらないまま手札が尽きたら流局で、点は動きません
        </li>
        <li>決めた月数を戦い、文の多いほうが勝ちです</li>
      </ol>

      <h2>役の一覧</h2>
      <p>
        取り札の組み合わせでできる役と点数です。光の役（五光・四光・雨四光・三光）は
        <strong>いちばん高いものだけ</strong>を数えます。タネ・タン・カスは、
        規定の枚数を超えると1枚ごとに1文ずつ増えます。
      </p>
      <table>
        <thead>
          <tr>
            <th>役</th>
            <th>内容</th>
            <th>点数</th>
          </tr>
        </thead>
        <tbody>
          {/* 役と点数は lib/hanafuda.ts の YAKU_TABLE から作る。
              2か所に書くと片方だけ直して食い違うため */}
          {YAKU_TABLE.map((y) => (
            <tr key={y.id}>
              <td>
                <strong>{y.name}</strong>
              </td>
              <td>
                {y.note}
                {y.optional && '（設定で外せます）'}
              </td>
              <td>{y.points}文</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        このほかに、配られた手札だけで決まる<strong>手四</strong>（同じ月が4枚）と
        <strong>くっつき</strong>（同じ月2枚の組が4つ）があり、どちらも6文です。
        合計が{DOUBLE_AT}文以上なら点数は2倍、相手がこいこいをしていたらさらに2倍になります。
      </p>

      <h2>CPUの強さ</h2>
      <table>
        <thead>
          <tr>
            <th>強さ</th>
            <th>打ち方</th>
          </tr>
        </thead>
        <tbody>
          {/* 説明は lib/hanafuda.ts の LEVEL_NOTES から作る */}
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
          <strong>光札は最優先で取る。</strong>
          光は5枚しかなく、3枚そろえば5文、4枚で7〜8文になります。
          光が場に出たら、多少ほかを捨ててでも合わせに行く価値があります
        </li>
        <li>
          <strong>短冊は色をそろえる。</strong>
          赤短（松・梅・桜）と青短（牡丹・菊・紅葉）はそれぞれ3枚で5文。
          2枚そろったら、残り1枚が場に出た瞬間に取れるよう同じ月の札を手札に温存します
        </li>
        <li>
          <strong>相手の取り札を見る。</strong>
          取り札は公開情報です。相手の光や短冊が2枚まで進んでいたら、
          その月の札を場に置かないだけで役を止められます
        </li>
        <li>
          <strong>こいこいは手札の残りで決める。</strong>
          手札が残り1〜2枚では、こいこいをしても伸びしろがありません。
          逆に序盤の小さな役なら、続けたほうが期待値は高くなります
        </li>
        <li>
          <strong>カスも侮らない。</strong>
          カスは24枚あり、10枚で1文、以降1枚ごとに1文増えます。
          桐の3枚（12月）を含め、取れるカスを黙々と集めるだけでも点になります
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

      {/* 札の絵柄は CC BY-SA 4.0。帰属表示はライセンスの義務なので消さないこと
          （出典の詳細は app/_hanafuda/CardFace.tsx の冒頭コメント） */}
      <p className="hf-credit">
        札の絵柄:{' '}
        <a
          href="https://commons.wikimedia.org/wiki/Category:SVG_Hanafuda_with_green_plants"
          target="_blank"
          rel="noopener noreferrer"
        >
          Louie Mantia 作の花札セット
        </a>
        （
        <a
          href="https://creativecommons.org/licenses/by-sa/4.0/deed.ja"
          target="_blank"
          rel="noopener noreferrer"
        >
          CC BY-SA 4.0
        </a>
        ）を、配信用に縮小して使用しています。
      </p>

      <h2>他のゲーム</h2>
      <div className="game-grid">
        {games
          .filter((g) => g.ready && g.slug !== 'hanafuda-koikoi')
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
