import type { Metadata } from 'next';
import Link from 'next/link';
import { games, SITE_URL } from '@/lib/registry';
import { breadcrumbFor, breadcrumbList } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

const title = 'マインスイーパー 無料｜初級・中級・上級をブラウザで';
const description =
  '無料のマインスイーパー。初級9×9から上級99地雷まで、ブラウザですぐ遊べます。最初のクリックで爆発しない安心設計。スマホは旗モードで快適に遊べます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/minesweeper/` },
};

const faq = [
  { q: '最初のクリックで負けることはありますか？', a: 'ありません。地雷は最初にクリックしたマスとその周囲を避けて配置されるので、初手は必ず安全で、周囲が開けます。' },
  { q: 'スマホで旗はどう立てますか？', a: '「旗モード」ボタンをONにすると、タップで旗の上げ下げになります。開けたいときはOFFに戻してください。' },
  { q: '数字をタップすると周りが開くのはなぜ？', a: '旗の数がその数字と一致しているとき、残りの閉じたマスを一括で開ける機能です（本家のコード操作と同じ）。旗の位置が間違っていると地雷を踏むので注意してください。' },
];

const trail = breadcrumbFor('minesweeper');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'マインスイーパー',
      url: `${SITE_URL}/minesweeper/`,
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

      <h1>マインスイーパー</h1>
      <p className="lead">
        数字をヒントに地雷の場所を推理する定番パズル。<strong>最初のクリックで爆発しない</strong>ようになっているので、安心して始められます。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>マスを開けると数字が出ます。数字は「周囲8マスにある地雷の数」です</li>
        <li>地雷だと思うマスには旗を立てます（PCは右クリック、スマホは旗モード）</li>
        <li>地雷以外のマスをすべて開ければクリアです</li>
      </ol>
      <h2>コツ</h2>
      <ul>
        <li>「1」の周りに閉じたマスが1つだけなら、そこは確実に地雷です</li>
        <li>数字のぶんだけ旗を立て終わったら、その数字をタップすると残りをまとめて開けられます（時短の基本テクニック）</li>
        <li>確定できるマスから順に処理し、どうしても確率になる場面だけ賭けましょう</li>
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
          .filter((g) => g.ready && g.slug !== 'minesweeper')
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
