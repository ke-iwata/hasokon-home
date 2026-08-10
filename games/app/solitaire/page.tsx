import type { Metadata } from 'next';
import Link from 'next/link';
import { games, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import Game from './Game';

const title = 'ソリティア 無料｜クロンダイクをブラウザですぐ';
const description =
  '無料のソリティア（クロンダイク）。タップするだけで札が自動で移動する簡単操作。インストール不要・登録不要でブラウザからすぐ遊べます。もどす機能つき。スマホ対応。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/solitaire/` },
};

const faq = [
  { q: '操作方法は？', a: '動かしたい札をタップして選択し、置きたい場所（列や組札）をタップします。同じ札をもう一度タップすると、いちばん良い場所へ自動で移動します。山札はタップでめくります。' },
  { q: '山札は何回でも回せますか？', a: '回せます。1枚めくりで、めくり切ったら山に戻して何周でも使えます（いちばん一般的なルールです）。' },
  { q: '失敗したら戻せますか？', a: '「もどす」ボタンで直近30手まで戻せます。' },
  { q: '必ずクリアできますか？', a: '配り方によってはクリア不可能な局面もあります。詰んだら「新しいゲーム」で配り直してください。' },
];

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
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <h1>ソリティア</h1>
      <p className="lead">
        世界でいちばん遊ばれているトランプの一人遊び。<strong>タップで選んでタップで置くだけ</strong>の簡単操作。同じ札を2回タップすれば自動で最適な場所へ移動します。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>ルール</h2>
      <ol>
        <li>右上の4つの組札に、スートごとにAから順にKまで積み上げれば勝ちです</li>
        <li>場札は「赤黒交互に、1つ小さい数字」の順でしか重ねられません（黒7の上に赤6）</li>
        <li>空いた列にはKだけ置けます。山札をめくって使える札を増やしましょう</li>
      </ol>
      <h2>コツ</h2>
      <ul>
        <li>まず<strong>裏向きの札が多い列（右側の列）から掘り起こす</strong>のが基本です</li>
        <li>Aと2は見つけ次第すぐ組札へ。3以降は場札で使う可能性を考えてから上げましょう</li>
        <li>空列を作ってもKがないと活かせません。どのKを持ってくるか決めてから空けましょう</li>
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
          .filter((g) => g.ready && g.slug !== 'solitaire')
          .map((g) => (
            <Link key={g.slug} className="game-card" href={`/${g.slug}/`}>
              <div className="icon" aria-hidden="true">
                {g.icon}
              </div>
              <div className="name">{g.name}</div>
              <div className="desc">{g.description}</div>
            </Link>
          ))}
      </div>
    </>
  );
}
