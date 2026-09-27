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
  EXTENDED_EXCLUSION,
  GENERAL_BRACKETS,
  PERIOD_ROWS,
  SETTLEMENT_SPECIAL_DEDUCTION,
  SPECIAL_BRACKETS,
  giftTax,
  settlementTax,
  type Bracket,
} from '@/lib/zoyozei-keisan';
import Calculator from './Calculator';

const title = '贈与税 計算機・生前贈与加算チェッカー（2027年1月から加算期間が延長）';
const description =
  '2027年1月1日以後の相続から、相続税に足し戻す生前贈与の期間が3年から段階的に7年へ延びます。贈与日と相続開始日（想定）を入れると、その贈与が加算されるか・延長4年分（100万円の枠）に当たるかを判定。暦年課税の贈与税（一般・特例税率）と相続時精算課税の税額も計算できます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/zoyozei-keisan/` },
  robots: robotsFor('zoyozei-keisan'),
};

const yen = (n: number) => `${Math.round(n).toLocaleString('ja-JP')}円`;
const man = (n: number) => `${(n / 10_000).toLocaleString('ja-JP')}万円`;

/** '2026-09-27' → '2026年9月27日' */
const ja = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}年${m}月${d}日`;
};

/** 速算表の行ラベル（「200万円以下」「4,500万円超」） */
const bracketLabel = (brackets: readonly Bracket[], i: number) =>
  brackets[i].upTo === Infinity ? `${man(brackets[i - 1].upTo)}超` : `${man(brackets[i].upTo)}以下`;

// 本文の例はロジックから出す（手で額を書かない）
const EX_SPECIAL = giftTax(5_000_000, { lineal: true, adultOn0101: true });
const EX_GENERAL = giftTax(5_000_000, { lineal: false, adultOn0101: true });
const EX_MIXED = giftTax(5_000_000, { lineal: true, adultOn0101: true, linealAmount: 3_000_000 });
const EX_SETTLEMENT = settlementTax(5_000_000);

const faq = [
  {
    q: '2026年中の贈与は、2027年以降の相続で加算されますか？',
    a: `相続開始日で決まります。2027年1月1日〜2030年12月31日の相続では「2024年1月1日から相続開始日まで」の贈与がすべて加算の対象になるので、2026年中の贈与も加算されます。2031年1月1日以後の相続では「相続開始前7年以内」の贈与が対象です。相続開始前3年より前の分（延長された4年分）は、合計から${man(EXTENDED_EXCLUSION)}までは加算されません（国税庁 No.4161）。`,
  },
  {
    q: '2026年中に贈与すると、2027年以降に贈与するより有利ですか？',
    a: '扱いは変わりません。加算期間を7年に延ばす改正は2024年1月1日以後の贈与すべてにすでに適用されていて、加算されるかどうかは贈与日ではなく相続開始日で決まります。2026年12月の贈与と2027年1月の贈与は、同じ日に相続が起きれば同じ扱いです。',
  },
  {
    q: '100万円の枠は1年あたりですか？',
    a: `いいえ。延長された4年分（相続開始前3年超〜7年以内）に受けた贈与の合計から、総額で${man(EXTENDED_EXCLUSION)}までが加算されません。1年ごとに${man(EXTENDED_EXCLUSION)}ではありません。相続開始前3年以内の贈与にはこの枠は使えず、全額が加算されます。`,
  },
  {
    q: '相続時精算課税の110万円は加算されますか？',
    a: '加算されません。2024年1月1日以後の精算課税の贈与は、年110万円の基礎控除を超えた部分だけが相続時に加算されます。暦年課税の3〜7年の加算も受けないので、年110万円以内の精算課税の贈与は、贈与した時期に関係なく相続税の計算に入りません（国税庁 No.4103）。',
  },
  {
    q: '孫への贈与は加算されますか？',
    a: '加算の対象は「相続や遺贈などで財産を取得した人」です（国税庁 No.4161）。相続人でない孫が何も取得しなければ、原則として加算されません。ただし、遺言で財産を受け取った（遺贈を受けた）孫や、生命保険金などのみなし相続財産を受け取った孫は「相続等により財産を取得した人」に当たり、加算の対象になります。',
  },
  {
    q: '父と叔父の両方から贈与を受けた年の贈与税は？',
    a: `一般税率と特例税率を按分します（国税庁 No.4408）。たとえば18歳以上の人が父から300万円、叔父から200万円を受けた場合、合計500万円を一般税率で計算した${yen(EX_GENERAL.tax)}のうち200/500と、特例税率で計算した${yen(EX_SPECIAL.tax)}のうち300/500を足して、贈与税は${yen(EX_MIXED.tax)}です。`,
  },
];

const trail = breadcrumbFor('zoyozei-keisan');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '贈与税 計算機・生前贈与加算チェッカー',
      url: `${SITE_URL}/zoyozei-keisan/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('zoyozei-keisan'),
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

      <h1>贈与税 計算機・生前贈与加算チェッカー</h1>
      <p className="lead">
        2027年1月1日以後の相続から、相続税に足し戻す生前贈与の期間が<strong>3年から段階的に7年へ</strong>
        延びます。贈与日と相続開始日（想定）を入れると、その贈与が加算されるかを日付で判定します。
        贈与税（暦年課税）と相続時精算課税の税額も同じ画面で出せます。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>生前贈与の加算期間は、相続開始日で決まる</h2>
      <p>
        亡くなった人から生前に暦年課税で受けた贈与は、一定の期間内のものが相続税の課税価格に加算されます。
        令和5年度税制改正でこの期間が3年から7年に延びましたが、一気に7年になるのではなく、
        <strong>相続開始日によって次のように段階的に伸びます</strong>（国税庁 No.4161）。
      </p>
      <table>
        <thead>
          <tr>
            <th>相続開始日</th>
            <th>加算する贈与（暦年課税）</th>
          </tr>
        </thead>
        <tbody>
          {(['3y', 'from-2024-01-01', '7y'] as const).map((k) => (
            <tr key={k}>
              <td style={{ textAlign: 'left' }}>{PERIOD_ROWS[k].inheritance}</td>
              <td style={{ textAlign: 'left' }}>{PERIOD_ROWS[k].period}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul>
        <li>
          「相続開始前3年以内」は、亡くなった日から遡って3年前の日（応当日）から亡くなった日までです。
          110万円以下で贈与税がかからなかった贈与も、亡くなった年の贈与も加算されます
        </li>
        <li>
          延長された4年分（相続開始前3年超〜7年以内）の贈与は、<strong>その合計から{man(EXTENDED_EXCLUSION)}まで</strong>
          は加算されません。この枠が実際に効くのは2027年1月2日以後の相続からです
        </li>
        <li>加算された贈与に対応する贈与税は、相続税から差し引かれます（二重に課税はされません）</li>
      </ul>

      <h2>「2026年中に駆け込むと得」ではない</h2>
      <p>
        延長のルールは<strong>2024年1月1日以後の贈与すべてにすでに適用</strong>されています。
        加算されるかどうかを決めるのは贈与日ではなく相続開始日なので、2026年12月に贈与しても2027年1月に贈与しても、
        同じ日に相続が起きれば扱いは同じです。変わるのは、相続開始日が2027年以後になったときに加算される贈与の範囲で、
        旧ルールなら3年を過ぎれば外れた2026年の贈与も、2027〜2030年の相続では加算されます。
        上のチェッカーで相続開始日を空欄にすると、相続開始年ごとの早見表でこれを確かめられます。
      </p>

      <h2>贈与税の計算（暦年課税）</h2>
      <p>
        1月1日〜12月31日に受けた贈与の合計から基礎控除110万円を引き、残りに速算表の税率を掛けて控除額を引きます（国税庁 No.4408）。
        贈与を受けた年の1月1日に<strong>18歳以上</strong>の人が<strong>父母・祖父母など直系尊属</strong>
        から受けた贈与は「特例税率」、それ以外（配偶者・兄弟・おじおば・他人からの贈与、18歳未満の子や孫への贈与）は「一般税率」です。
      </p>
      <table>
        <thead>
          <tr>
            <th>基礎控除後の課税価格</th>
            <th>一般税率／控除額</th>
          </tr>
        </thead>
        <tbody>
          {GENERAL_BRACKETS.map((b, i) => (
            <tr key={b.upTo}>
              <td style={{ textAlign: 'left' }}>{bracketLabel(GENERAL_BRACKETS, i)}</td>
              <td>
                {Math.round(b.rate * 100)}%／{b.deduction === 0 ? '—' : man(b.deduction)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <table>
        <thead>
          <tr>
            <th>基礎控除後の課税価格</th>
            <th>特例税率／控除額</th>
          </tr>
        </thead>
        <tbody>
          {SPECIAL_BRACKETS.map((b, i) => (
            <tr key={b.upTo}>
              <td style={{ textAlign: 'left' }}>{bracketLabel(SPECIAL_BRACKETS, i)}</td>
              <td>
                {Math.round(b.rate * 100)}%／{b.deduction === 0 ? '—' : man(b.deduction)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        たとえば500万円の贈与は、基礎控除後の{man(EX_SPECIAL.taxable)}に速算表を当てて、特例税率なら
        <strong>{yen(EX_SPECIAL.tax)}</strong>、一般税率なら<strong>{yen(EX_GENERAL.tax)}</strong>です。
      </p>

      <h2>相続時精算課税を選んだ場合</h2>
      <p>
        60歳以上の父母・祖父母から18歳以上の子・孫への贈与では、相続時精算課税を選べます（国税庁 No.4103）。
        2024年1月1日以後の贈与から<strong>年110万円の基礎控除</strong>
        （暦年課税の110万円とは別枠）ができ、基礎控除後の額から特別控除（累計{man(SETTLEMENT_SPECIAL_DEDUCTION)}
        まで）を引いて、残りに一律20%がかかります。
        相続時に加算されるのは<strong>基礎控除を超えた部分だけ</strong>で、暦年課税のような3〜7年の区切りはありません。
        500万円なら、この年の贈与税は{yen(EX_SETTLEMENT.tax)}（特別控除の範囲内）で、相続時に{yen(EX_SETTLEMENT.afterBasic)}
        が加算されます。一度選ぶと、その贈与者からの贈与は暦年課税に戻せません。
      </p>
      <p>
        暦年課税と精算課税のどちらが向くかは、財産の総額・家族構成・将来の相続税率によって変わります。
        このページでは両方の数字を並べるところまでにしています。
      </p>

      <h2>この計算に乗らない贈与</h2>
      <p>
        次の非課税の特例や控除を使う贈与は、上の計算とは別に扱われます。いずれも適用期限・要件が細かいので、国税庁の各ページで確認してください
        （{ja(DATA_CHECKED_AT)}時点）。
      </p>
      <ul>
        <li>住宅取得等資金の非課税（直系尊属から。2026年12月31日までの贈与が対象。No.4508）</li>
        <li>結婚・子育て資金の一括贈与の非課税（2027年3月31日まで。No.4511）</li>
        <li>教育資金の一括贈与の非課税（2026年3月31日で終了。それまでに適用を受けた分は引き続き適用。No.4510）</li>
        <li>贈与税の配偶者控除（婚姻期間20年以上の夫婦間の居住用不動産など。No.4452）</li>
      </ul>
      <p>
        相続税そのものの計算（基礎控除・法定相続分・配偶者の税額軽減など）はこのページでは行いません。
        最終的な判断は、税務署または税理士に確認してください。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="zoyozei-keisan" />

      <PublicToolLink slug="taishokukin-tedori">
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          もらう側の税金：<ToolLink slug="taishokukin-tedori">退職金 手取り計算機</ToolLink>
        </p>
      </PublicToolLink>

      <ToolMeta slug="zoyozei-keisan" ymyl>
        出典：
        <a
          href="https://www.nta.go.jp/taxes/shiraberu/taxanswer/sozoku/4161.htm"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          国税庁 No.4161「贈与財産の加算と税額控除（暦年課税）」
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
          href="https://laws.e-gov.go.jp/law/325AC0000000073"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          相続税法（e-Gov 法令検索）
        </a>
        19条・21条の5・21条の7・21条の11の2にもとづき作成。制度データの最終確認日は{ja(DATA_CHECKED_AT)}です。
      </ToolMeta>
    </>
  );
}
