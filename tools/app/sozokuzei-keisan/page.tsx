import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';
import {
  BASIC_FIXED,
  BASIC_PER_HEIR,
  BRACKETS,
  DATA_CHECKED_AT,
  DISCLAIMER,
  INSURANCE_EXEMPT_PER_HEIR,
  MINOR_PER_YEAR,
  SPOUSE_RELIEF_FLOOR,
  applyFraction,
  civilShares,
  perHeirTax,
  type Person,
} from '@/lib/sozokuzei-keisan';
import Calculator from './Calculator';

const title = '相続税 計算機 — 基礎控除・法定相続人の数・配偶者の税額軽減・1人ずつの納付額';
const description =
  '遺産額と相続人の構成から、基礎控除（3,000万円＋600万円×法定相続人）・相続税の総額・1人ずつの納付額を計算。養子の数の上限、放棄した人、死亡保険金の非課税枠、2割加算、未成年者控除まで。加算する生前贈与の額も入れられます（判定は贈与税の計算機）。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/sozokuzei-keisan/` },
  robots: robotsFor('sozokuzei-keisan'),
};

const yen = (n: number) => `${Math.round(n).toLocaleString('ja-JP')}円`;
const man = (n: number) => `${(n / 10_000).toLocaleString('ja-JP')}万円`;

/** '2026-10-15' → '2026年10月15日' */
const ja = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}年${m}月${d}日`;
};

const bracketLabel = (i: number) =>
  BRACKETS[i].upTo === Infinity ? `${man(BRACKETS[i - 1].upTo)}超` : `${man(BRACKETS[i].upTo)}以下`;

// 本文の例はロジックから出す（手で額を書かない）。遺産 1 億円・配偶者＋子 2 人・法定相続分どおり
const EX_DATE = { year: 2026, month: 10, day: 15 };
const EX_PEOPLE: Person[] = [
  { id: 's', relation: 'spouse' },
  { id: 'c1', relation: 'child' },
  { id: 'c2', relation: 'child' },
];
const EX_SHARES = civilShares(EX_PEOPLE);
const EX = perHeirTax({
  people: EX_PEOPLE,
  inputs: EX_PEOPLE.map((person) => ({ person, acquired: applyFraction(100_000_000, EX_SHARES.get(person.id)!) })),
  inheritanceDate: EX_DATE,
})!;
const EX_CHILD = EX.acquirers.find((a) => a.person.id === 'c1')!;

const faq = [
  {
    q: '相続税は誰にかかる？',
    a: `亡くなった人から相続や遺贈（遺言・死亡保険金を含む）で財産を取得した人にかかります。ただし、取得した全員の課税価格の合計が基礎控除（${man(BASIC_FIXED)}＋${man(BASIC_PER_HEIR)}×法定相続人の数）以下なら、相続税はかかりません（国税庁 No.4152）。`,
  },
  {
    q: '申告は必要？（0円でも要る場合）',
    a: `課税価格の合計が基礎控除を超えるときは申告が必要です。配偶者の税額軽減や小規模宅地等の特例は、使って税額が0円になっても申告が要件です（No.4158）。小規模宅地等の特例を使って評価額が基礎控除以下になった場合も、申告しないと特例は使えません。`,
  },
  {
    q: '孫養子は2割加算？',
    a: '孫を養子にした場合（孫養子）は、相続税額の2割加算の対象です。一親等の血族には、亡くなった人の直系卑属が養子になっている場合を含まないためです。ただし、子が先に亡くなっていて孫が代襲して相続人になっている場合は、2割加算はかかりません（相続税法18条・No.4157）。',
  },
  {
    q: '死亡保険金はいくらまで非課税？',
    a: `${man(INSURANCE_EXEMPT_PER_HEIR)}×法定相続人の数までです。相続人が受け取った保険金の合計がこの額を超えるときは、受取額に応じて按分します。相続を放棄した人や相続人でない人が受け取った保険金には、この非課税枠はありません（No.4114）。死亡退職金にも同じ額の枠が別にあります（No.4117）。`,
  },
  {
    q: '申告期限はいつ？',
    a: '相続の開始があったことを知った日（通常は亡くなった日）の翌日から10か月以内です。期限の日が土日・祝日・年末に当たるときは、その翌日（休みが続けばさらに翌日）が期限になります。上の計算機は、相続開始日を知った日とみなして期限を出しています。',
  },
];

const trail = breadcrumbFor('sozokuzei-keisan');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '相続税 計算機',
      url: `${SITE_URL}/sozokuzei-keisan/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('sozokuzei-keisan'),
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

const NTA = 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/sozoku';
const SOURCES: [string, string][] = [
  ['4152', '相続税の計算'],
  ['4155', '相続税の税率'],
  ['4157', '相続税額の2割加算'],
  ['4158', '配偶者の税額の軽減'],
  ['4164', '未成年者の税額控除'],
  ['4167', '障害者の税額控除'],
  ['4114', '相続税の課税対象になる死亡保険金'],
  ['4117', '相続税の課税対象になる死亡退職金'],
  ['4132', '相続人の範囲と法定相続分'],
  ['4170', '相続人の中に養子がいるとき'],
  ['4161', '贈与財産の加算と税額控除（暦年課税）'],
];

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>相続税 計算機（法定相続人・配偶者の税額軽減・死亡保険金の非課税まで）</h1>
      <p className="lead">
        遺産の額と相続人の構成を入れると、基礎控除・相続税の総額・<strong>1人ずつの納付額</strong>を出します。
        養子の数の上限、相続を放棄した人の数え方、死亡保険金の非課税枠、配偶者の税額軽減、2割加算、未成年者控除まで、
        国税庁の手順どおりに1画面で計算します。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>相続税がかかるかは基礎控除で決まる</h2>
      <p>
        取得した人全員の課税価格の合計が、基礎控除<strong>
          {man(BASIC_FIXED)}＋{man(BASIC_PER_HEIR)}×法定相続人の数
        </strong>
        以下なら、相続税はかかりません。配偶者と子2人なら法定相続人は3人で、基礎控除は{man(EX.basic)}です。
        課税価格は、取得した財産から債務・葬式費用を引き、死亡保険金・死亡退職金の非課税枠を超える部分と、
        加算する生前贈与を足した額です（1,000円未満切捨て）。
      </p>
      <p className="hint">{DISCLAIMER}</p>

      <h2>法定相続人の数え方（養子・放棄）</h2>
      <ul>
        <li>
          <strong>相続を放棄した人も、放棄がなかったものとして数えます。</strong>
          子が全員放棄して父母が相続しても、基礎控除と相続税の総額は子の人数で出します
        </li>
        <li>
          養子は、<strong>実子がいれば1人まで、いなければ2人まで</strong>しか数えません（相続税法15条2項）。
          ただし特別養子・配偶者の実子で養子になった人・代襲相続人の孫は実子として数えます（No.4170）
        </li>
        <li>この人数は、基礎控除・死亡保険金と死亡退職金の非課税枠・相続税の総額の4つに使います</li>
      </ul>

      <h2>相続税の総額は「法定相続分で分けたと仮定」して出す</h2>
      <p>
        課税遺産総額（課税価格の合計 − 基礎控除）を、実際の分け方に関係なく<strong>法定相続分で分けたと仮定</strong>し、
        1人ずつ速算表を当てて合計したものが相続税の総額です。総額は、実際に取得した課税価格の割合で各人に按分します。
        遺産1億円を配偶者と子2人が法定相続分どおりに分けると、課税遺産総額{man(EX.total.taxableEstate)}、総額
        {yen(EX.total.total)}で、配偶者は下の軽減で0円、子は1人{yen(EX_CHILD.payable)}です。
      </p>
      <table>
        <thead>
          <tr>
            <th>法定相続分に応ずる取得金額</th>
            <th>税率／控除額</th>
          </tr>
        </thead>
        <tbody>
          {BRACKETS.map((b, i) => (
            <tr key={b.upTo}>
              <td style={{ textAlign: 'left' }}>{bracketLabel(i)}</td>
              <td>
                {Math.round(b.rate * 100)}%／{b.deduction === 0 ? '—' : man(b.deduction)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        法定相続分は、配偶者と子なら1/2ずつ、配偶者と父母なら2/3と1/3、配偶者と兄弟姉妹なら3/4と1/4です。
        同じ順位の人は均等に分け、父母の一方だけが同じ兄弟姉妹は、父母の両方が同じ兄弟姉妹の1/2です（民法900条）。
      </p>

      <h2>配偶者は 1 億 6 千万円まで</h2>
      <p>
        配偶者が実際に取得した額が、<strong>{man(SPOUSE_RELIEF_FLOOR)}</strong>
        か配偶者の法定相続分相当額の多いほうまでなら、配偶者に相続税はかかりません（配偶者の税額軽減。相続税法19条の2）。
        軽減額は「相続税の総額 × 配偶者の課税価格と上限額の少ないほう ÷ 課税価格の合計」です。
        申告期限までに分割されていない財産は対象にならず、<strong>税額が0円になっても申告が必要</strong>です。
      </p>

      <h2>2割加算になる人</h2>
      <p>
        亡くなった人の配偶者・子・父母（一親等の血族）と、代襲相続人の孫<strong>以外</strong>の人が取得した場合は、
        その人の相続税額に2割が加算されます。兄弟姉妹・甥姪、代襲でない孫養子、遺言で受け取った孫などが当たります（No.4157）。
      </p>
      <p>
        未成年者控除は18歳になるまでの年数×{man(MINOR_PER_YEAR)}（1年未満は切上げ）、障害者控除は85歳になるまでの年数×10万円（特別障害者は20万円）です。
        本人の税額から引ききれない分は扶養義務者の税額から引けますが、このツールでは引ききれない額を示すところまでにしています。
      </p>

      <h2>2027年1月から、加算する生前贈与の期間が伸び始める</h2>
      <p>
        亡くなった人から生前に暦年課税で受けた贈与は、一定期間内のものが課税価格に加算されます。
        2027年1月1日以後の相続から、この期間が3年から段階的に7年へ伸びます（No.4161）。
        加算されるかは相続開始日と贈与日で決まるので、このページでは判定せず、加算される額とその贈与税額を入れてもらう形にしています。
        <PublicToolLink slug="zoyozei-keisan">
          判定は<ToolLink slug="zoyozei-keisan">贈与税 計算機・生前贈与加算チェッカー</ToolLink>でできます。
        </PublicToolLink>
      </p>

      <h2>このツールで扱わないこと</h2>
      <ul>
        <li>財産の評価（路線価・小規模宅地等の特例・非上場株式）。評価後の正味の額を入れてください</li>
        <li>どう分けると得か・二次相続まで考えた取得割合の助言。分け方を変えたときの数字を並べるところまでです</li>
        <li>相次相続控除・外国税額控除・相続時精算課税の贈与税相当額の控除・未成年者控除などの扶養義務者への振替</li>
        <li>按分割合の端数調整（実務では全員の合計が1になるよう小数点以下2位で調整します。差は数十〜数百円です）</li>
        <li>代襲相続人でもある孫養子（2割加算がかかりません）や、甥姪の代襲相続</li>
      </ul>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="sozokuzei-keisan" />

      <PublicToolLink slug="sozoku-toki-kigen">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          相続の期限：<ToolLink slug="sozoku-toki-kigen">相続登記の期限 計算機</ToolLink>
        </p>
      </PublicToolLink>

      <ToolMeta slug="sozokuzei-keisan" ymyl>
        出典：
        {SOURCES.map(([no, name], i) => (
          <span key={no}>
            {i > 0 && '／'}
            <a href={`${NTA}/${no}.htm`} target="_blank" rel="nofollow noopener noreferrer">
              国税庁 No.{no}「{name}」
            </a>
          </span>
        ))}
        ／
        <a href="https://laws.e-gov.go.jp/law/325AC0000000073" target="_blank" rel="nofollow noopener noreferrer">
          相続税法（e-Gov 法令検索）
        </a>
        12条・15条・16条・18条・19条の2〜19条の4／
        <a href="https://laws.e-gov.go.jp/law/129AC0000000089" target="_blank" rel="nofollow noopener noreferrer">
          民法（e-Gov 法令検索）
        </a>
        900条にもとづき作成。制度データの最終確認日は{ja(DATA_CHECKED_AT)}です。
      </ToolMeta>
    </>
  );
}
