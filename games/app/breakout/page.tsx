import type { Metadata } from 'next';
import Link from 'next/link';
import { games, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import Game from './Game';
import GameIcon from '@/app/GameIcon';

const title = 'ブロック崩し 無料｜ブラウザですぐ遊べる定番アクション';
const description =
  '無料のブロック崩し。マウスやタッチでパドルを操作してブロックを消していく定番アクションゲーム。インストール不要でブラウザからすぐ遊べます。スマホ対応。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/breakout/` },
};

const faq = [
  { q: 'スマホでも遊べますか？', a: '遊べます。画面を指でなぞるとパドルが付いてきます。誤ってページがスクロールしないよう、ゲーム画面内の操作は固定されています。' },
  { q: 'スコアは保存されますか？', a: '現在は保存機能はありません。ページを閉じるとリセットされます。' },
  { q: '難易度は変わりますか？', a: '面が進むごとに球のスピードが上がり、2面目からは2回当てないと消えないブロックが登場します。' },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'ブロック崩し',
      url: `${SITE_URL}/breakout/`,
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

      <h1>ブロック崩し</h1>
      <p className="lead">
        パドルで球を打ち返してブロックを消していく定番アクション。<strong>面が進むごとに球が速く</strong>なります。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>画面をタップ（クリック）してスタート</li>
        <li>マウスや指を左右に動かしてパドルを操作し、球を落とさないように打ち返します</li>
        <li>ブロックをすべて消すと次の面へ。球は少しずつ速くなり、固いブロックも登場します</li>
      </ol>
      <h2>コツ</h2>
      <ul>
        <li>パドルの<strong>端に当てるほど球は横に飛びます</strong>。角度を付けたいときは端で、安定させたいときは中央で受けましょう</li>
        <li>下の行ほど点が低く、上の行ほど高得点です。上の行に球を送り込むと一気に稼げます</li>
        <li>残機は3つ。球が落ちそうなときは、あわてず落下点に先回りするのがコツです</li>
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
          .filter((g) => g.ready && g.slug !== 'breakout')
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
