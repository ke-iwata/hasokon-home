import type { Metadata } from 'next';
import Link from 'next/link';
import { games, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import Game from './Game';

const title = 'リバーシ 無料｜コンピュータと対戦できるブラウザゲーム';
const description =
  '無料のリバーシ。コンピュータと1人で対戦できます。インストール不要・登録不要でブラウザからすぐ遊べます。打てる場所のガイド表示つき。スマホ対応。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/reversi/` },
};

const faq = [
  { q: 'コンピュータの強さはどれくらいですか？', a: '角を重視する定石を知っている初級〜中級レベルです。先を読む探索はしないので、定石を覚えれば勝てるようになります。' },
  { q: '2人で対戦できますか？', a: '現在はコンピュータ対戦のみです。' },
  { q: 'パスはどうなりますか？', a: '打てる場所がない場合は自動的にパスになり、メッセージでお知らせします。' },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'VideoGame',
      name: 'リバーシ',
      url: `${SITE_URL}/reversi/`,
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

      <h1>リバーシ</h1>
      <p className="lead">
        相手の石を挟んでひっくり返す定番ボードゲーム。<strong>コンピュータとすぐに対戦</strong>できます。あなたが黒の先手です。
      </p>

      <Game />

      <AdUnit position="below-tool" />

      <h2>ルール</h2>
      <ol>
        <li>自分の石で相手の石をタテ・ヨコ・ナナメに挟むと、挟んだ石がすべて自分の色になります</li>
        <li>相手の石を1つも返せない場所には打てません。打てる場所は黄色い点で示されます</li>
        <li>どちらも打てなくなったら終了。石が多いほうの勝ちです</li>
      </ol>
      <h2>コツ</h2>
      <ul>
        <li><strong>角はひっくり返されない</strong>最強のマスです。角が取れる機会は逃さないこと</li>
        <li>逆に角のナナメ内側（X打ち）は、相手に角を献上しやすい危険なマスです</li>
        <li>序盤は石を多く取りすぎないほうが、終盤の選択肢が広がります</li>
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
          .filter((g) => g.ready && g.slug !== 'reversi')
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
