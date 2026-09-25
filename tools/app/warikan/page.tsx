import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import {
  modeComparison,
  unitComparison,
  WARIKAN_EXAMPLE,
  type KanjiMode,
  type WarikanResult,
} from '@/lib/warikan';
import Calculator from './Calculator';

const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`;

const MODE_LABELS: Record<KanjiMode, string> = {
  'kanji-more': '幹事が端数を負担',
  'kanji-less': '幹事が端数を得',
  equal: '均等（1円単位）',
};

/** 幹事の支払額。マイナスは集めすぎ（お釣り） */
const kanjiCell = (r: WarikanResult) => (r.kanji < 0 ? `お釣り ${yen(-r.kanji)}` : yen(r.kanji));

// 表の数字は計算機と同じ calcWarikan() から出す
const byMode = modeComparison();
const byUnit = unitComparison();
const ex = `合計${yen(WARIKAN_EXAMPLE.total)}を${WARIKAN_EXAMPLE.people}人`;

const title = '割り勘計算機｜一人あたりいくら？端数の調整も選べる';
const description =
  '飲み会の合計金額と人数を入れるだけで一人あたりの支払額を計算。端数の丸め単位（10円・100円・500円・1000円）と幹事の負担方法（多め・少なめ・均等）を選べる無料の割り勘計算ツールです。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/warikan/` },
  robots: robotsFor('warikan'),
};

const faq = [
  {
    q: '「幹事が端数を負担」と「幹事が端数を得」はどう使い分けますか？',
    a: '幹事が予約や集金の手間を引き受けているなら「幹事が端数を得」、幹事が上司や主催者として多めに払いたいなら「幹事が端数を負担」が選ばれることが多いようです。同じ例で3つを比べた表を「幹事の扱いは3通り」に載せています。',
  },
  {
    q: '割り勘の端数はどうするのがスマートですか？',
    a: '単位を大きくするほど集めやすくなる一方、幹事との差額が広がります。単位ごとの差は「丸め単位の選び方」の表で確かめられます。切り上げで集めすぎたお釣りの扱い（二次会に回す・次回に繰り越すなど）は、集める前に一言伝えておくともめずに済みます。',
  },
  {
    q: '送金アプリで割り勘するときのコツは？',
    a: '送金アプリなら1円単位でやり取りできるため、丸めずに「均等（1円単位）」モードを使うのがおすすめです。表示された一人あたりの金額をそのままグループチャットに貼り付けて請求すれば、端数のもめごとがありません。1円単位の余りは幹事が負担する計算になっているので、集金額が合計を超えることもありません。',
  },
  {
    q: '幹事も含めて人数に入れるのですか？',
    a: 'はい。このツールの「人数」は幹事を含めた参加者全員の数です。たとえば5人と入力すると、幹事以外の4人が同じ金額を支払い、残額を幹事が支払う計算になります。幹事が支払い額ゼロ（おごられる側）のケースを計算したい場合は、人数を1人減らして全員を参加者として計算してください。',
  },
];

const trail = breadcrumbFor('warikan');

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

      <h1>割り勘計算機</h1>
      <p className="lead">
        飲み会の合計金額と人数を入れるだけで、一人あたりの支払額を計算します。端数の丸め単位と、幹事が多めに払うか少なめに払うかも選べます。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>幹事の扱いは3通り</h2>
      <p>
        一人あたりの金額（合計 ÷ 人数）を、選んだ単位で切り捨てるか切り上げるかして「参加者（幹事以外）の支払額」を決め、残りを幹事が払います。
        どの扱いでも「参加者の支払額 ×（人数 − 1）+ 幹事の支払額 = 合計」が必ず成り立つので、集金額が合計とずれることはありません。
      </p>
      <p>
        {ex}（幹事を含む）で割り、{WARIKAN_EXAMPLE.roundUnit}円単位に丸めた場合で比べると、次のようになります。
      </p>
      <table>
        <thead>
          <tr>
            <th>幹事の扱い</th>
            <th>参加者1人</th>
            <th>幹事</th>
          </tr>
        </thead>
        <tbody>
          {byMode.map(({ mode, result }) => (
            <tr key={mode}>
              <th scope="row">{MODE_LABELS[mode]}</th>
              <td>{yen(result.perPerson)}</td>
              <td>{kanjiCell(result)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul>
        <li>
          <strong>幹事が端数を負担</strong>：参加者は切り捨てでキリのいい金額を払い、足りない分を幹事が多めに払います
        </li>
        <li>
          <strong>幹事が端数を得</strong>：参加者は切り上げで少し多めに払い、幹事の支払いが少なくなります。集めすぎたときは「お釣り」になります
        </li>
        <li>
          <strong>均等（1円単位）</strong>：丸めずに1円単位で割り、割り切れない余りだけを幹事が払います。丸め単位は使いません
        </li>
      </ul>

      <h2>丸め単位の選び方</h2>
      <p>
        同じ{ex}で、「幹事が端数を負担」のまま丸め単位だけを変えると、単位が大きいほど参加者の金額はキリがよくなり、
        そのぶん幹事の支払いが増えます。
      </p>
      <table>
        <thead>
          <tr>
            <th>丸め単位</th>
            <th>参加者1人</th>
            <th>幹事</th>
          </tr>
        </thead>
        <tbody>
          {byUnit.map(({ roundUnit, result }) => (
            <tr key={roundUnit}>
              <th scope="row">{yen(roundUnit)}単位</th>
              <td>{yen(result.perPerson)}</td>
              <td>{kanjiCell(result)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        現金で集めるなら、小銭のやり取りが減る100円か500円単位がよく使われます。1,000円単位は集めやすい反面、
        人数が多いと幹事との差が大きくなるので、「幹事が端数を得」（切り上げ）と組み合わせるのも手です。
      </p>

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
