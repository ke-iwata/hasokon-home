import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';
import {
  DATA_CHECKED_AT,
  FLOOR_AREA,
  INCOME_LIMITS,
  LIMITS,
  MEASURE,
  SETTLEMENT_IRREVOCABLE_NOTE,
  periodMessage,
  rekinenAfterExclusion,
  settlementAfterExclusion,
} from '@/lib/jutaku-shutoku-shikin';
import Calculator from './Calculator';

const title = '住宅取得等資金の贈与税 非課税 判定・計算機（2026年12月31日まで・1,000万円／500万円）';
const description =
  '父母・祖父母から住宅資金の贈与を受けると、省エネ等住宅なら1,000万円、それ以外は500万円まで贈与税が非課税です（2026年12月31日までの贈与。延長は未定）。贈与額・住宅の性能・床面積・所得から、使えるか・いくら非課税か・残りの贈与税（暦年課税と相続時精算課税）・申告の期限を出します。';

export const metadata: Metadata = {
  title,
  description,
  // 仕様書の keywords（ToolDef に欄が無いので、ページの metadata に置く）
  keywords: ['住宅取得等資金', '非課税 1000万', '省エネ等住宅', '2026年12月31日', '直系尊属'],
  alternates: { canonical: `${SITE_URL}/jutaku-shutoku-shikin/` },
  robots: robotsFor('jutaku-shutoku-shikin'),
};

const yen = (n: number) => `${Math.round(n).toLocaleString('ja-JP')}円`;
const man = (n: number) => `${(n / 10_000).toLocaleString('ja-JP')}万円`;

/** '2026-10-01' → '2026年10月1日' */
const ja = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}年${m}月${d}日`;
};

// 本文の例はロジックから出す（手で額を書かない）。仕様書の計算例：1,500 万円・省エネ等住宅
const EX_AMOUNT = 15_000_000;
const EX_REKINEN = rekinenAfterExclusion(EX_AMOUNT, LIMITS.energySaving);
const EX_SEISAN = settlementAfterExclusion(EX_AMOUNT, LIMITS.energySaving);

const faq = [
  {
    q: '2027年以後も延長されますか？',
    a: `${ja(MEASURE.to)}までの贈与が対象で、${ja(DATA_CHECKED_AT)}時点で延長は決まっていません。${periodMessage('after-undecided')} 過去は期限のたびに延長されてきましたが、限度額は縮んできました（1,500万円 → 1,000万円）。このページでは延長の見通しは書きません。`,
  },
  {
    q: '夫婦でそれぞれ自分の親から受けるとどうなりますか？',
    a: `限度額は受贈者ごとです（国税庁 No.4508）。夫と妻がそれぞれ自分の父母・祖父母から受け、それぞれが要件を満たせば、各自が${man(LIMITS.energySaving)}（省エネ等住宅以外は${man(LIMITS.other)}）まで非課税にできます。受け取った資金は自分の持分の取得に充てるので、登記の持分と資金の出どころをそろえます。配偶者の父母は直系尊属に当たらないため、義理の親からの贈与はこの特例を使えません。`,
  },
  {
    q: '頭金ではなく、住宅ローンの返済に充ててもよいですか？',
    a: '非課税になるのは、住宅の新築・取得・増改築の対価に充てた資金です。すでに住んでいる住宅のローンを返す資金は、原則としてこの特例の対象になりません（国税庁 No.4508 の質疑応答）。新築・取得の時期と贈与・支払いの順番で扱いが変わるので、税務署に確認してください。',
  },
  {
    q: '税額が0円なら申告しなくてよいですか？',
    a: '申告が要ります。非課税の特例は、贈与を受けた年の翌年2月1日〜3月15日に贈与税の申告書と添付書類（戸籍謄本・契約書の写しなど）を出して初めて適用されます。申告をしないと、非課税にならずに贈与税がかかります。',
  },
  {
    q: '年末に贈与を受けて、引渡しが翌年になっても使えますか？',
    a: '贈与を受けた年の翌年3月15日までに引渡しを受け（新築・取得・増改築を済ませ）、同日までに住む（または同日後遅滞なく住むことが確実）ことが要件です。2026年中の贈与なら2027年3月15日までです。建売・分譲マンションは引渡しが同日までに済む必要があります。',
  },
];

const trail = breadcrumbFor('jutaku-shutoku-shikin');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '住宅取得等資金の贈与税 非課税 判定・計算機',
      url: `${SITE_URL}/jutaku-shutoku-shikin/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('jutaku-shutoku-shikin'),
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumb trail={trail} />

      <h1>住宅取得等資金の贈与税 非課税 判定・計算機</h1>
      <p className="lead">
        父母・祖父母から住宅資金の贈与を受けると、省エネ等住宅なら<strong>{man(LIMITS.energySaving)}</strong>、
        それ以外は<strong>{man(LIMITS.other)}</strong>まで贈与税が非課税です。対象は<strong>{ja(MEASURE.to)}までの贈与</strong>
        で、延長はまだ決まっていません。使えるか・いくら非課税か・残りの贈与税・申告の期限を1画面で出します。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>要件</h2>
      <p>受贈者・住宅・手続きの3つにまたがります（国税庁 No.4508。{ja(DATA_CHECKED_AT)}確認）。</p>
      <table>
        <thead>
          <tr>
            <th>系統</th>
            <th>要件</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>受贈者</td>
            <td style={{ textAlign: 'left' }}>
              贈与者の直系卑属（子・孫）／贈与の年の1月1日に18歳以上／贈与の年の合計所得金額が{man(INCOME_LIMITS.normal)}以下
              （床面積{FLOOR_AREA.min}㎡以上{FLOOR_AREA.smallBelow}㎡未満なら{man(INCOME_LIMITS.small)}以下）／
              翌年3月15日までに資金の全額を充てて新築・取得・増改築を済ませ、同日までに住む
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>住宅</td>
            <td style={{ textAlign: 'left' }}>
              床面積{FLOOR_AREA.min}㎡以上{FLOOR_AREA.max}㎡以下／2分の1以上が居住用／中古は昭和57年以降の建築か耐震基準に適合
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>手続き</td>
            <td style={{ textAlign: 'left' }}>
              <strong>税額が0円でも</strong>、翌年2月1日〜3月15日に贈与税の申告をする
            </td>
          </tr>
        </tbody>
      </table>

      <h2>省エネ等住宅とは</h2>
      <p>
        限度額が{man(LIMITS.energySaving)}になる「省エネ等住宅」は、次のいずれかを満たす住宅です。
      </p>
      <ul>
        <li>
          新築等：<strong>断熱等性能等級5以上かつ一次エネルギー消費量等級6以上</strong>／耐震等級2以上または免震建築物／
          高齢者等配慮対策等級3以上（2023年12月31日までに建築確認を受けたものなどは、断熱等級4以上または一次エネ等級4以上でよい）
        </li>
        <li>既存住宅：断熱等性能等級4以上または一次エネルギー消費量等級4以上／耐震等級2以上または免震建築物／高齢者等配慮対策等級3以上</li>
      </ul>
      <p>
        満たすことは、住宅性能証明書・建設住宅性能評価書の写し・長期優良住宅や低炭素住宅の認定通知書などで証明し、申告書に添えます。
        どの証明書が使えるかは住宅の種類で変わるので、国税庁の案内で確かめてください。証明書が無いと限度額は{man(LIMITS.other)}です。
      </p>

      <h2>暦年課税と相続時精算課税のどちらで受けるか</h2>
      <p>
        非課税分を超えた部分には、ふつうの贈与税（暦年課税）か相続時精算課税のどちらかがかかります。
        たとえば{man(EX_AMOUNT)}を省エネ等住宅の資金として受けると、非課税分{man(EX_REKINEN.exclusion)}を引いた
        {man(EX_REKINEN.afterExclusion)}が残ります。
      </p>
      <ul>
        <li>
          暦年課税：基礎控除110万円を引いた{man(EX_REKINEN.taxable)}に特例税率を当てて、贈与税は<strong>{yen(EX_REKINEN.tax)}</strong>
        </li>
        <li>
          相続時精算課税（初めて使う場合）：基礎控除後の{man(EX_SEISAN.settlement.afterBasic)}は特別控除2,500万円の内側で、
          贈与税は<strong>{yen(EX_SEISAN.tax)}</strong>（残りの特別控除{man(EX_SEISAN.settlement.specialDeductionLeft)}）。
          この{man(EX_SEISAN.settlement.afterBasic)}は相続のときに相続財産に加算されます
        </li>
      </ul>
      <p>
        住宅取得等資金の贈与なら、贈与者が60歳未満でも相続時精算課税を選べます（措法70条の3・国税庁 No.4503）。
        {SETTLEMENT_IRREVOCABLE_NOTE}
        どちらが向くかは財産の総額・家族構成・将来の相続税で変わるため、このページでは差額を並べるところまでにしています。
      </p>
      <PublicToolLink slug="zoyozei-keisan">
        <p>
          ほかの贈与と合わせた贈与税や、相続税への加算は
          <ToolLink slug="zoyozei-keisan">贈与税 計算機・生前贈与加算チェッカー</ToolLink>で確かめられます。
        </p>
      </PublicToolLink>

      <h2>申告を忘れると</h2>
      <p>
        この特例は、<strong>翌年2月1日〜3月15日に贈与税の申告書を出して初めて適用</strong>されます。
        税額が0円になる場合でも申告が要り、出さないと非課税にならず、贈与額全体に贈与税がかかります。
        申告書には戸籍謄本・新築や取得の契約書の写し・登記事項証明書など（省エネ等住宅なら性能の証明書も）を添えます。
        3月15日が土日祝なら、申告の期限は翌開庁日です。
      </p>
      <p>
        個別の判断（親からの借入れとの区別・共有名義の持分・リフォームの範囲など）は、税務署または税理士に確認してください。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="jutaku-shutoku-shikin" />

      <PublicToolLink slug="jutaku-loan-kojo">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          ローンを組むなら：<ToolLink slug="jutaku-loan-kojo">住宅ローン控除 計算機</ToolLink>
        </p>
      </PublicToolLink>

      <ToolMeta slug="jutaku-shutoku-shikin" ymyl>
        出典：
        <a
          href="https://www.nta.go.jp/taxes/shiraberu/taxanswer/sozoku/4508.htm"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          国税庁 No.4508「直系尊属から住宅取得等資金の贈与を受けた場合の非課税」
        </a>
        ／
        <a
          href="https://www.nta.go.jp/taxes/shiraberu/taxanswer/sozoku/4503.htm"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          No.4503「住宅取得等資金の贈与を受けた場合の相続時精算課税選択の特例」
        </a>
        ／
        <a
          href="https://www.nta.go.jp/taxes/shiraberu/taxanswer/zoyo/4408.htm"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          No.4408「贈与税の計算と税率（暦年課税）」
        </a>
        ／
        <a
          href="https://www.nta.go.jp/taxes/shiraberu/taxanswer/sozoku/4103.htm"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          No.4103「相続時精算課税の選択」
        </a>
        ／
        <a
          href="https://laws.e-gov.go.jp/law/332AC0000000026"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          租税特別措置法（e-Gov 法令検索）
        </a>
        70条の2・70条の3にもとづき作成。制度データの最終確認日は{ja(DATA_CHECKED_AT)}です。
      </ToolMeta>
    </>
  );
}
