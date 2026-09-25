import type { Metadata } from 'next';
import {
  calcShienkin,
  EXAMPLE_STANDARD_MONTHLY,
  FISCAL_YEARS,
  shienkinHayamihyo,
} from '@/lib/kosodate-shienkin';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import Calculator from './Calculator';

const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`;
const man = (n: number) => `${(n / 10_000).toLocaleString('ja-JP')}万円`;

// 本文とFAQの金額・率は計算機と同じデータから出す（手で書くと率の改定で本文だけ古くなる）
const hayamihyo = shienkinHayamihyo();
const example = calcShienkin(EXAMPLE_STANDARD_MONTHLY);
const current = FISCAL_YEARS.find((y) => y.fiscalYear === hayamihyo.fiscalYear)!;
const pct = (rate: number, digits: number) => `${(rate * 100).toFixed(digits)}%`;

const title = '子ども・子育て支援金 計算機｜月いくら引かれる？【2026年】';
const description =
  '「独身税」とも呼ばれる子ども・子育て支援金が給与からいくら天引きされるかを無料で計算。月収と賞与を入れるだけで2026・2027・2028年度の負担額がわかります。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/kosodate-shienkin/` },
  robots: robotsFor('kosodate-shienkin'),
};

const faq = [
  {
    q: '子ども・子育て支援金はいつから引かれますか？',
    a: '2026年（令和8年）4月分の保険料から徴収が始まりました。給与天引きは会社の徴収方法により2026年4月または5月支給分からです。健康保険料と合わせて徴収されるため、給与明細では健康保険料の内訳として表示される場合があります。',
  },
  {
    q: '支援金の計算方法は？',
    a: `会社員・公務員は「標準報酬月額 × 支援金率 ÷ 2」で、${hayamihyo.fiscalYear}年度の本人負担は${pct(current.rate / 2, 3)}です。賞与からも同じ率で引かれます。式と年収別の早見表は、このページの「計算の仕組み」にまとめています。`,
  },
  {
    q: 'なぜ「独身税」と呼ばれているのですか？',
    a: '正式名称は「子ども・子育て支援金」で、独身者だけでなく子育て世帯を含む全ての医療保険加入者が負担します。児童手当などの給付を受けない独身者・子どものいない世帯にとっては負担のみが発生するため、通称として「独身税」と呼ばれるようになりました。',
  },
  {
    q: '今後、負担額は増えますか？',
    a: '増える見込みです。支援金の総額は2028年度まで段階的に引き上げられる計画で、年度ごとの率と月額の例は「計算の仕組み」の表にあります。2027年度以降の率はまだ確定していません。',
  },
  {
    q: '扶養家族がいると、その分も支援金が増えますか？',
    a: '会社員・公務員の健康保険では増えません。支援金は本人の標準報酬月額と賞与だけで決まり、扶養家族（被扶養者）の人数は計算に入らないためです。国民健康保険は世帯や個人の所得などで決まるので、仕組みが異なります。',
  },
  {
    q: '支払わない・免除される方法はありますか？',
    a: '医療保険料と一体で徴収されるため、医療保険の加入者である限り原則として拒否できません。産前産後休業・育児休業中の保険料免除など、健康保険料の免除制度が適用される場合は支援金も免除されます。',
  },
];

const trail = breadcrumbFor('kosodate-shienkin');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '子ども・子育て支援金 計算機',
      url: `${SITE_URL}/kosodate-shienkin/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('kosodate-shienkin'),
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

      <h1>子ども・子育て支援金 計算機</h1>
      <p className="lead">
        2026年4月から給与天引きが始まった「子ども・子育て支援金」（通称：独身税）。月収と賞与を入力するだけで、あなたの負担額が<strong>2026〜2028年度分まで</strong>
        すぐにわかります。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>計算の仕組み</h2>
      <p>会社員・公務員（被用者保険）の場合、支援金は次の式で計算されます。</p>
      <p
        style={{
          textAlign: 'center',
          fontWeight: 600,
          background: 'var(--accent-soft)',
          padding: 12,
          borderRadius: 10,
        }}
      >
        標準報酬月額 × 支援金率 ÷ 2（労使折半） ＝ 毎月の本人負担額
      </p>

      <h3>年収別の早見表（{hayamihyo.era}・確定）</h3>
      <p>賞与なしの場合の本人負担です。賞与がある人は、賞与からも同じ率で引かれます。</p>
      <table>
        <thead>
          <tr>
            <th>年収の目安</th>
            <th>標準報酬月額</th>
            <th>月額</th>
            <th>年額</th>
          </tr>
        </thead>
        <tbody>
          {hayamihyo.rows.map((row) => (
            <tr key={row.standardMonthly}>
              <th scope="row">{man(row.standardMonthly * 12)}</th>
              <td>{man(row.standardMonthly)}</td>
              <td>{yen(row.monthly)}</td>
              <td>{yen(row.yearly)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>年度ごとの率と、標準報酬月額{man(EXAMPLE_STANDARD_MONTHLY)}の人の月額</h3>
      <table>
        <thead>
          <tr>
            <th>年度</th>
            <th>支援金率</th>
            <th>本人負担率</th>
            <th>月額の例</th>
          </tr>
        </thead>
        <tbody>
          {FISCAL_YEARS.map((y) => (
            <tr key={y.fiscalYear}>
              <th scope="row">
                {y.era}（{y.fiscalYear}年度）
              </th>
              <td>
                {pct(y.rate, 2)}
                {y.status !== '確定' && `（${y.status}）`}
              </td>
              <td>{pct(y.rate / 2, 3)}</td>
              <td>{yen(example.find((r) => r.fiscalYear === y.fiscalYear)!.monthly)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="note">
        確定しているのは{hayamihyo.era}の率だけです。「見込み」「政府試算」の年度は、政府の計画・試算にもとづく
        <strong>未確定の推計</strong>で、確定次第このページのデータを更新します。実際の給与では健康保険料と合算して端数処理されるため、表示額と±1円程度の差が出ることがあります。
      </div>

      <h2>加入している保険で決まり方が違う</h2>
      <p>支援金は医療保険の保険料と一緒に集められるので、どの医療保険に入っているかで決まり方が変わります。</p>
      <ul>
        <li>
          <strong>会社員・公務員（被用者保険）</strong>：標準報酬月額と賞与に全国一律の率をかけ、会社と半分ずつ負担します。
          このページの計算機と早見表はこの場合です
        </li>
        <li>
          <strong>自営業・フリーランスなど（国民健康保険）</strong>：お住まいの市区町村が条例で決め、世帯や個人の所得などに応じて変わります。
          <strong>このツールでは計算できません</strong>。額は市区町村から届く保険料の通知や、市区町村の案内で確かめてください
        </li>
        <li>
          <strong>75歳以上（後期高齢者医療制度）</strong>：都道府県ごとの後期高齢者医療広域連合が条例で決め、個人の所得などに応じて変わります。
          こちらも<strong>このツールでは計算できません</strong>
        </li>
      </ul>

      <h2>集めたお金の使い道</h2>
      <p>こども家庭庁は、支援金で拡充する子育て施策として次のものを挙げています。</p>
      <ul>
        <li>児童手当の拡充</li>
        <li>妊婦のための支援給付</li>
        <li>こども誰でも通園制度</li>
        <li>雇用保険の出生後休業支援給付と育児時短就業給付</li>
        <li>育児期間中の国民年金保険料の免除</li>
      </ul>
      <p>
        支援金を負担していても、受けられる給付は子どもの年齢や働き方によって変わります。
        たとえば出生後休業支援給付と育児時短就業給付は、雇用保険に入って働く親が対象です。
      </p>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="kosodate-shienkin" />

      <ToolMeta slug="kosodate-shienkin" ymyl>
        出典：
        <a
          href="https://www.cfa.go.jp/policies/kodomokosodateshienkinseido"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          こども家庭庁「子ども・子育て支援金制度について」
        </a>
        、
        <a
          href="https://www.cfa.go.jp/policies/kodomokosodateshienkin"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          同「支援金により拡充される子育て施策」
        </a>
        ほか公的資料にもとづき作成。
      </ToolMeta>
    </>
  );
}
