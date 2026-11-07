import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

// 「囲碁」は一般名。入門の遊び方の呼び名「石取り」は運営者の J-PlatPat 確認待ち（registry の stage は wip）。
// 既存の囲碁ソフト・アプリ・団体の教材の名前、盤や石の絵、詰碁の作品は使わない（docs/features/game-igo.md）
const title = '囲碁（6路・9路）｜無料でCPU対戦・石取りから始める入門（インストール不要）';
const description =
  '無料の囲碁。6路盤の「石取り」（先に石を取ったら勝ち）から始めて、9路盤の対局（地を数えて勝敗）まで。CPUは かんたん・ふつう・つよい の3段階、2人で対面も。終局の死に石はCPUが推し、タップで直せます。インストール不要・登録不要でスマホ対応。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/igo/` },
  robots: robotsFor('igo'),
};

const faq = [
  {
    q: '囲碁のルールを1分で知りたい',
    a: '黒と白が交互に、盤の線の交わるところ（交点）に石を1つずつ置きます。相手の石のまわりの空いた交点（呼吸点）をすべて自分の石でふさぐと、その石を取れます。まずは「石取り」で、先に相手の石を1つ取ったら勝ちのルールから始めるのがおすすめです。取る・取られるの感覚がつかめれば、陣地の広さを競うふつうの対局もすぐ分かります。',
  },
  {
    q: '地の数え方は？',
    a: 'このページは日本式で数えます。終局したら、取られずに残っても助からない石（死に石）を取り除き、自分の石だけで囲んだ空いた交点（地）を数えます。そこに、対局中に取った石（あげはま）と死に石の数を足したものが自分の点数です。白にはコミを足します。中国式は盤の上に残った石と地の合計で数える方式で、9路盤ならたいてい同じ勝敗になります。',
  },
  {
    q: 'コウとは？',
    a: '1子を取り合う形で、取ったり取り返したりが永遠に続かないようにする決まりです。取られた直後に、すぐ同じ形に取り返すことはできず、ほかの場所に1手打ってからなら取り返せます。この盤では「同じ盤面に戻る手は打てない」という形で決まりを入れています。',
  },
  {
    q: '9路盤で強くなったら？',
    a: '本格的な囲碁は13路盤・19路盤で打ちます。このページは6路と9路までです。9路盤で「つよい」に勝てるようになったら、大きな盤にも挑戦してみてください。',
  },
  {
    q: 'コミとは？',
    a: '先に打つ黒が有利なので、終局のときに白の点数に足す目数です。このページの9路盤では6目半（6.5目）で、半目があるので引き分けにはなりません。置き石を置いたときのコミは半目です。',
  },
];

const trail = breadcrumbFor('igo');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: '囲碁（6路・9路）',
      url: `${SITE_URL}/igo/`,
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

      <h1>囲碁（6路・9路）</h1>
      <p className="lead">
        6路盤の<strong>石取り</strong>（先に石を取ったら勝ち）から始めて、9路盤の
        <strong>対局</strong>（地を数えて勝ち負け）まで。CPUは3段階、2人で対面もできます。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方（石取り）</h2>
      <ol>
        <li>黒から交互に、線の交わるところ（交点）に石を1つずつ打ちます</li>
        <li>相手の石のまわりの空いた交点（呼吸点）を全部ふさぐと、その石を取れます</li>
        <li>先に相手の石を取ったほうが勝ちです（1つ・3つ・5つから選べます）</li>
      </ol>
      <p>
        呼吸点が残り1つになった石は「アタリ」です。盤では赤い縁取りと札で知らせます。
        両者が続けてパスしたら、そこで終わり、取った数が多いほうの勝ちです。
      </p>

      <h2>遊び方（対局）</h2>
      <ol>
        <li>9路盤で、取る・取られるのルールは石取りと同じです</li>
        <li>
          打つところが無くなったらパスします。<strong>両者が続けてパスしたら終局</strong>です
        </li>
        <li>
          CPUが死に石の候補に × を付けます。石をタップすると、そのかたまりの「死に／生き」が切り替わります
        </li>
        <li>
          地（自分の石だけで囲んだ空いた交点）を四角で色分けし、次の式で数えます。
          <br />
          黒 ＝ 黒の地 ＋ 白から取った石（あげはま＋死に石）
          <br />
          白 ＝ 白の地 ＋ 黒から取った石（あげはま＋死に石）＋ コミ 6目半
        </li>
        <li>どちらの地でもない交点（ダメ）は灰色の点で示し、誰の地にもなりません</li>
      </ol>
      <p>
        CPU対戦で、CPUの推した死に石と違う形に直したときは「CPUと意見が分かれました」と出て、
        数える前の局面から打ち続けて確かめます（再開は1局に2回まで）。
        負けたときは、置き石を1子足して再戦できます（置き石は星に置き、白から打ちます。コミは半目）。
      </p>

      <h2>この盤のルール</h2>
      <ul>
        <li>
          <strong>自殺手は打てません。</strong>
          打った石の呼吸点が無くなり、相手の石も取れない手です（相手の石を取れるなら打てます）
        </li>
        <li>
          <strong>同じ盤面に戻る手は打てません。</strong>
          コウの取り返しもこれで防ぎます。日本の規約（三コウは無勝負など）とは、ごくまれな形で結果が変わることがあります
        </li>
        <li>石取りのモードで、打てる交点が1つも無いときは自動でパスになります</li>
        <li>
          地は「片方の色の石だけに囲まれた空いた交点」として数えます。セキ（どちらも取れずに残る形）の中の目も地に数えるので、
          日本の規約（セキの中の目は地にしない）とは、ごくまれに数え方が変わることがあります
        </li>
      </ul>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        ルールの説明は、日本棋院「日本囲碁規約」の条文（着手・取り・自殺手・コウ・終局・地の定義）を参照し、
        このページの言葉で書いています。
      </p>

      <AdUnit position="below-faq" />

      <h2>他のゲーム</h2>
      <div className="game-grid">
        {publicGames
          .filter((g) => g.slug !== 'igo')
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
