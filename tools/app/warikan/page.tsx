import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import Calculator from './Calculator';

const title = '割り勘計算機｜一人あたりいくら？端数の調整も選べる';
const description =
  '飲み会の合計金額と人数を入れるだけで一人あたりの支払額を計算。端数の丸め単位（10円・100円・500円・1000円）と幹事の負担方法（多め・少なめ・均等）を選べる無料の割り勘計算ツールです。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/warikan/` },
};

const faq = [
  {
    q: '「幹事が端数を負担」と「幹事が端数を得」はどう使い分けますか？',
    a: '幹事がお店の予約や集金の手間を引き受けている場合は、参加者が切り上げで少し多めに払い、幹事の負担を軽くする「幹事が端数を得」がよく使われます。逆に、上司や主催者として幹事が多めに払いたい場面では、参加者を切り捨てにする「幹事が端数を負担」を選びます。迷ったら、金額差が小さくなる100円単位から試すのがおすすめです。',
  },
  {
    q: '割り勘の端数はどうするのがスマートですか？',
    a: '現金で集める場合は、小銭のやり取りを減らすために100円または500円単位に丸めるのが定番です。切り上げで集めすぎたお釣りは、二次会の足しにする・幹事の手間賃にする・次回に繰り越すなど、事前に扱いを一言伝えておくとトラブルになりません。このツールの検算表示で「集金合計が合計金額と一致しているか」を確認してから声をかけると確実です。',
  },
  {
    q: 'PayPayなどの送金アプリで割り勘するときのコツは？',
    a: '送金アプリなら1円単位でやり取りできるため、丸めずに「均等（1円単位）」モードを使うのがおすすめです。表示された一人あたりの金額をそのままグループチャットに貼り付けて請求すれば、端数のもめごとがありません。1円単位の余りは幹事が負担する計算になっているので、集金額が合計を超えることもありません。',
  },
  {
    q: '幹事も含めて人数に入れるのですか？',
    a: 'はい。このツールの「人数」は幹事を含めた参加者全員の数です。たとえば5人と入力すると、幹事以外の4人が同じ金額を支払い、残額を幹事が支払う計算になります。幹事が支払い額ゼロ（おごられる側）のケースを計算したい場合は、人数を1人減らして全員を参加者として計算してください。',
  },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '割り勘計算機',
      url: `${SITE_URL}/warikan/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('warikan'),
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
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <h1>割り勘計算機</h1>
      <p className="lead">
        飲み会の合計金額と人数を入れるだけで、一人あたりの支払額を計算します。端数の丸め単位と、幹事が多めに払うか少なめに払うかも選べます。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>このツールの計算方法</h2>
      <p>
        一人あたりの金額（合計 ÷ 人数）を、選んだ丸め単位で切り捨てまたは切り上げたものを「参加者（幹事以外）の支払額」とし、残りを幹事が支払う仕組みです。どのモードでも「参加者の支払額 ×（人数 − 1）+ 幹事の支払額 = 合計金額」が必ず成り立つように計算しているので、集金額が合わなくなる心配がありません。
      </p>
      <ul>
        <li>
          <strong>幹事が端数を負担</strong>: 参加者は切り捨てでキリのいい金額を払い、不足分を幹事が多めに支払います。
        </li>
        <li>
          <strong>幹事が端数を得</strong>: 参加者は切り上げで少し多めに払い、幹事の支払いは少なくなります。集めすぎた場合は「お釣り」として表示します。
        </li>
        <li>
          <strong>均等（1円単位）</strong>: 全員ほぼ同額（1円単位）で、割り切れない余りだけを幹事が負担します。
          PayPayなどの送金アプリでの割り勘に向いています。
        </li>
      </ul>

      <div className="note">
        表示される金額は計算上の目安です。実際の集金・精算の方法（端数やお釣りの扱いなど）は、参加者間で事前に合意のうえご利用ください。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="warikan" />

      <ToolMeta slug="warikan" />
    </>
  );
}
