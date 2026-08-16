import type { Metadata } from 'next';
import Link from 'next/link';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import ToolClient from '@/app/_roulette/ToolClient';
import { SITE_URL } from '@/lib/registry';

const title = 'サイコロを振る｜1〜10個をまとめて振れる無料ツール';
const description =
  'サイコロをブラウザで振れる無料ツール。1〜10個まで同時に振れて合計も出ます。登録もアプリも不要で、スマホからそのまま使えます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/dice/` },
};

const faq = [
  {
    q: '出た目に偏りはありませんか？',
    a: '出た目は振るたびにブラウザの乱数で決めており、1〜6のどの目も同じ確率（6分の1）で出ます。直前に出た目が次の結果に影響することもありません。「3回続けて6が出たから次は出にくい」と感じるのは錯覚で、次に6が出る確率はやはり6分の1のままです。',
  },
  {
    q: '一度に何個まで振れますか？',
    a: '1〜10個まで同時に振れます。個数のボタンを選んで「振る」を押すだけで、2個以上のときは合計も自動で表示されるので、すごろくのように2個の合計で進むゲームでも足し算の必要がありません。',
  },
  {
    q: '8面や20面のサイコロは振れますか？',
    a: 'このツールで振れるのは6面のサイコロだけです。8面・20面のような多面ダイスや、6より大きい数のランダムが必要な場合は、ルーレットの「まとめて入力」に「1〜20」のように入れると、その範囲の数字ルーレットとして代用できます。',
  },
  {
    q: '同じ目が続けて出るのは故障ですか？',
    a: '故障ではありません。毎回独立に目を決めているため、同じ目が2回、3回と続くことは確率的に普通に起こります。もし同じ番号を2回出したくない用途（順番決めやくじ引きなど）であれば、サイコロではなくルーレットで当たった候補を除きながら回すほうが向いています。',
  },
  {
    q: '結果を共有できますか？',
    a: '振ったあとに表示される「画像にして共有」ボタンで、出目（2個以上なら合計）を画像にしてSNSやチャットアプリに送れます。離れた相手とオンラインで遊んでいて、振った結果を証拠として見せたいときに便利です。',
  },
  {
    q: 'アプリのインストールや会員登録は必要ですか？',
    a: '不要です。ブラウザだけで動き、スマートフォン・タブレット・パソコンのどれからでも同じように使えます。利用は無料です。',
  },
];

const trail = breadcrumbFor('dice');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'サイコロ',
      url: `${SITE_URL}/dice/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('dice'),
      publisher: PUBLISHER_REF,
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

      <h1>サイコロ</h1>
      <p className="lead">サイコロが手元にないときに。1〜10個まで同時に振れて、合計も出ます。</p>

      <ToolClient tool="dice" />

      <AdUnit position="below-tool" />

      <h2>ボードゲームやくじ引きに</h2>
      <p>
        サイコロが手元にないとき、なくしたときの代わりに使えます。すごろく・ボードゲーム・パーティーゲームのお供として、スマホをテーブルに置いてそのまま回せます。個数は1〜10個から選べて、2個以上を同時に振ると合計も表示されるので、2個の合計で駒を進めるタイプのゲームでもそのまま使えます。
      </p>
      <p>
        出た目は毎回ブラウザの乱数で決めており、どの目も同じ確率で出ます。実物のサイコロと違って、テーブルから転がり落ちたり、傾いて止まって振り直しになったりすることがないのも地味な利点です。振った結果は「画像にして共有」でそのまま相手に送れるので、オンライン越しの遊びでも公平に使えます。
      </p>
      <h2>2個の合計は「7」がいちばん出やすい</h2>
      <p>
        サイコロを2個振ったときの合計は2〜12ですが、どの合計も同じ確率で出るわけではありません。出目の組み合わせは全部で36通りあり、合計7になる組み合わせは（1と6、2と5、3と4、4と3、5と2、6と1）の6通りで確率は6分の1。いっぽう合計2（1と1）や合計12（6と6）は1通りずつしかなく、確率は36分の1です。
      </p>
      <p>
        このツールは合計を自動で表示するので、実際に何十回も振って「7のまわりに結果が集まる」ことを確かめる、といった確率の学習・実験にも使えます。ボードゲームで7のマスに罠を置く戦略が強い理由も、この分布から説明できます。
      </p>
      <h2>重複しない番号がほしいとき</h2>
      <p>
        サイコロは毎回独立に目を決めるため、同じ目が続けて出ることがあります。順番決めやくじ引きのように同じ番号を2回出したくない場合は、ルーレットに数字を入れて、当たった数字を「これを除いてまわす」で外しながら回すと、重複せずに番号を配れます。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="dice" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        関連ツール：<Link href="/roulette/">ルーレット</Link>
        ／
        <Link href="/group/">グループ分け</Link>
      </p>

      <ToolMeta slug="dice" />
    </>
  );
}
