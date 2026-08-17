import type { Metadata } from 'next';
import Link from 'next/link';
import { publicGames, robotsFor, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

const title = 'ソリティア 無料｜クロンダイクをブラウザですぐ';
const description =
  '無料のソリティア（クロンダイク）。タップするだけで札が自動で移動する簡単操作。インストール不要・登録不要でブラウザからすぐ遊べます。もどす機能つき。スマホ対応。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/solitaire/` },
  robots: robotsFor('solitaire'),
};

const faq = [
  { q: '操作方法は？', a: '動かしたい札をタップして選択し、置きたい場所（列や組札）をタップします。同じ札をもう一度タップすると、組札を最優先にいちばん良い場所へ自動で移動します。山札はタップでめくります。ドラッグ操作は不要なので、スマホでも遊びやすくなっています。' },
  { q: '山札は何回でも回せますか？', a: '回せます。1枚めくりで、めくり切ったら山に戻して何周でも使えます（いちばん一般的なルールです）。3枚めくりや周回制限つきのルールには現在対応していません。' },
  { q: '失敗したら戻せますか？', a: '「もどす」ボタンで直近30手まで戻せます。もどした回数によるペナルティはありません。' },
  { q: '必ずクリアできますか？', a: '配り方によってはクリア不可能な局面もあります。1枚めくり・周回無制限は比較的クリアしやすい設定ですが、それでも詰む配置は一定の割合で発生します。詰んだら「新しいゲーム」で配り直してください。' },
  { q: '記録は残りますか？', a: 'ベストタイム・最少手数・クリア回数とプレイ回数が残ります。記録はお使いの端末のブラウザにだけ保存され、サーバーには送られません。ブラウザのデータを削除すると消えます。' },
  { q: 'タイムはいつから計測されますか？', a: '最初の1手を動かした時点から計測が始まります。配られた盤面をじっくり眺めてから始めても、タイムには影響しません。' },
];

const trail = breadcrumbFor('solitaire');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'ソリティア',
      url: `${SITE_URL}/solitaire/`,
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

      <h1>ソリティア</h1>
      <p className="lead">
        世界でいちばん遊ばれているトランプの一人遊び。<strong>タップで選んでタップで置くだけ</strong>の簡単操作。同じ札を2回タップすれば自動で最適な場所へ移動します。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>ルール</h2>
      <p>
        使うのはジョーカーを除く1組52枚です。場札は7列で、左からn列目にn枚ずつ配られ、
        各列のいちばん手前の1枚だけが表向きになっています。残りの24枚が山札です。
      </p>
      <ol>
        <li>右上の4つの組札に、スートごとにAから順にKまで積み上げれば勝ちです</li>
        <li>場札は「赤黒交互に、1つ小さい数字」の順でしか重ねられません（黒7の上に赤6）</li>
        <li>表向きで正しくつながっている並びは、途中からまとめて別の列へ動かせます</li>
        <li>空いた列にはKだけ（Kから始まる並びだけ）置けます</li>
        <li>山札はタップで1枚ずつめくり、めくり切ったら山に戻して何周でも回せます</li>
      </ol>
      <p>
        このページの操作はタップ（クリック）だけで完結します。動かしたい札をタップして選び、
        行き先の列や組札をタップ。<strong>同じ札をもう一度タップすると、組札を最優先に
        いちばん良い場所へ自動で移動</strong>するので、ドラッグの細かい操作は要りません。
        失敗しても「もどす」で直近30手まで戻せます。
      </p>
      <h2>コツ</h2>
      <ul>
        <li>まず<strong>裏向きの札が多い列（右側の列）から掘り起こす</strong>のが基本です。裏の札を1枚でも多く表にすることが、選択肢を増やす近道です</li>
        <li>Aと2は見つけ次第すぐ組札へ。3以降は場札で使う可能性を考えてから上げましょう。たとえば赤の3を早々に上げてしまうと、黒の2を場札で受ける場所がなくなります</li>
        <li>組札への上げすぎに注意。1つのスートだけ先行して積むと、場札の移動に必要な中間の数字が足りなくなります。4つの組札をなるべく均等に育てるのが安全です</li>
        <li>空列を作ってもKがないと活かせません。どのKを持ってくるか決めてから空けましょう。同じKでも赤か黒かで、その上に乗せられるQが変わります</li>
        <li>山札を一周めくって中身を把握してから本格的に動かすのも有効です。どの札がどの順で出てくるか分かると、手の計画がぐっと立てやすくなります</li>
      </ul>

      <h2>ソリティアとクロンダイクの由来</h2>
      <p>
        ソリティアは英語で「一人遊び」を意味する言葉で、本来はトランプの一人遊び全般を
        指します。その中の1種目がこのページの「クロンダイク」で、名前は19世紀末の
        ゴールドラッシュで知られるカナダのクロンダイク地方に由来するといわれています。
        1990年代にパソコンのOSに標準ゲームとして収録されたことで世界中に広まり、
        日本では「ソリティア」といえばこのクロンダイクを指すことがほとんどになりました。
      </p>
      <p>
        クロンダイクには、山札を3枚ずつめくる設定や、山札を回せる回数に制限を設ける
        設定などのバリエーションがありますが、このページでは最も広く遊ばれている
        「1枚めくり・周回無制限」を採用しています。同じソリティアの仲間としては、
        2組104枚を使う<Link href="/spider/">スパイダーソリティア</Link>や、
        すべての札が最初から表向きの<Link href="/freecell/">フリーセル</Link>も
        このサイトで遊べます。
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
          .filter((g) => g.slug !== 'solitaire')
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
