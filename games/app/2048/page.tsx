import type { Metadata } from 'next';
import Link from 'next/link';
import { games, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import Game from './Game';

const title = '2048 無料｜ブラウザですぐ遊べるスライドパズル';
const description =
  '無料の2048。スワイプで同じ数字を合体させて2048を目指すパズルゲーム。インストール不要・登録不要でブラウザからすぐ遊べます。スマホ対応・ベストスコア保存。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/2048/` },
};

const faq = [
  { q: '無料で遊べますか？', a: 'すべて無料です。会員登録もインストールも不要で、ブラウザだけで遊べます。' },
  { q: '2048を作ったら終わりですか？', a: '2048達成後もそのまま続けられます。4096、8192とさらに大きなタイルに挑戦してください。' },
  { q: 'ベストスコアは保存されますか？', a: 'お使いのブラウザに保存されます（サーバーには送信されません）。別の端末やブラウザには引き継がれません。' },
  { q: '同じ数字が3つ並んでいたらどうなりますか？', a: '動かした方向の先にある2つだけが合体します。1回のスライドで同じタイルが2度合体することはありません。' },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: '2048',
      url: `${SITE_URL}/2048/`,
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

      <h1>2048</h1>
      <p className="lead">
        同じ数字をスライドで合体させて、<strong>2048のタイル</strong>を目指すパズル。シンプルなのに、やめどきが見つかりません。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>遊び方</h2>
      <ol>
        <li>スワイプ（PCは矢印キー）で、盤面のタイル全部が同じ方向にスライドします</li>
        <li>同じ数字がぶつかると合体して2倍になります（2+2=4、4+4=8…）</li>
        <li>1回動かすたびに新しいタイルが湧きます。動かせなくなったら終了です</li>
      </ol>
      <h2>コツ</h2>
      <ul>
        <li><strong>いちばん大きいタイルを角に固定</strong>するのが定石です。角に置いたら、その角から動かさない方向だけで操作します</li>
        <li>使う方向を3方向に制限しましょう。4方向すべて使うと大きいタイルが中央に流れて詰みやすくなります</li>
        <li>大きい順に階段状（蛇行）に並べると、連鎖的に合体できます</li>
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
          .filter((g) => g.ready && g.slug !== '2048')
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
