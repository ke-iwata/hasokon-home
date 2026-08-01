import type { Metadata } from 'next';
import Link from 'next/link';
import AdUnit from '@/app/AdUnit';
import ToolClient from '@/app/_roulette/ToolClient';
import { SITE_URL } from '@/lib/registry';

const title = 'あみだくじ作成ツール | 線をたどって結果を決める';
const description =
  '参加者と結果を入れるだけで、あみだくじを自動で作れる無料ツール。線をたどるアニメーションで結果を確認できます。登録不要・印刷にも対応。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/amida/` },
};

const faq = [
    {
      "q": "ルーレットとの使い分け",
      "a": "あみだくじは「全員に1つずつ割り当てる」ための道具です。誰が何を引くかを一度に決めたいときに向いています。ひとつだけ選びたいときはルーレット、順番に決めたいときはルーレットの「全員に一巡」が便利です。"
    },
    {
      "q": "結果を隠したまま進める",
      "a": "線をたどるアニメーションが終わるまで結果は伏せられているので、一人ずつ順番に引く進め方ができます。全員ぶんをまとめて見たいときは「すべて表示」を押してください。"
    }
  ];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'あみだくじ',
      url: `${SITE_URL}/amida/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY' },
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

      <h1>あみだくじ</h1>
      <p className="lead">参加者と当たりを入れると、あみだくじを自動で作ります。名前を選ぶと線をたどって結果が出ます。</p>

      <ToolClient tool="amida" />

      <AdUnit position="below-tool" />

      <h2>ルーレットとの使い分け</h2>
      <p>あみだくじは「全員に1つずつ割り当てる」ための道具です。誰が何を引くかを一度に決めたいときに向いています。</p>
      <p>ひとつだけ選びたいときはルーレット、順番に決めたいときはルーレットの「全員に一巡」が便利です。</p>
      <h2>結果を隠したまま進める</h2>
      <p>線をたどるアニメーションが終わるまで結果は伏せられているので、一人ずつ順番に引く進め方ができます。</p>
      <p>全員ぶんをまとめて見たいときは「すべて表示」を押してください。</p>

      <AdUnit position="below-faq" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        関連ツール：<Link href="/roulette/">ルーレット</Link>
        ／
        <Link href="/group/">グループ分け</Link>／
        <Link href="/dice/">サイコロ</Link>／
        <Link href="/tournament/">トーナメント表</Link>
      </p>
    </>
  );
}
