import type { Metadata } from 'next';
import { BONUS_CAP_YEARLY } from '@/lib/kosodate-shienkin';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import Calculator from './Calculator';
import {
  CONFIRMED_ROWS,
  CONFIRMED_YEAR,
  HAS_UNCONFIRMED_TREND,
  TREND_MONTHLY_INCOME,
  TOP_STANDARD_MONTHLY,
  TREND_ROWS,
} from './tables';

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
    a: '被用者保険（会社員・公務員）の場合、「標準報酬月額 × 支援金率 ÷ 2」で計算されます。式と年収別の金額は本ページの「計算の仕組み」「年収別の負担額の早見表」をご覧ください。',
  },
  {
    q: 'なぜ「独身税」と呼ばれているのですか？',
    a: '正式名称は「子ども・子育て支援金」で、独身者だけでなく子育て世帯を含む全ての医療保険加入者が負担します。児童手当などの給付を受けない独身者・子どものいない世帯にとっては負担のみが発生するため、通称として「独身税」と呼ばれるようになりました。',
  },
  {
    q: '今後、負担額は増えますか？',
    a: '支援金の総額は2026年度から2028年度にかけて段階的に引き上げられる計画です。年度ごとの料率と月額の見込みは「年度ごとの負担額の推移」に出しています。',
  },
  {
    q: '扶養している家族の分も取られますか？',
    a: '被用者保険では取られません。支援金は被保険者本人の標準報酬月額・標準賞与額に料率をかけて計算するため、配偶者や子どもを被扶養者にしていても負担額は変わりません。これは健康保険料の決まり方と同じ仕組みです。ただし国民健康保険は世帯の加入者数に応じた部分があるため、扶養の考え方が異なります。',
  },
  {
    q: '賞与（ボーナス）からも取られますか？',
    a: '取られます。賞与は1,000円未満を切り捨てた「標準賞与額」に同じ料率をかけ、労使折半した額が徴収されます。標準賞与額には年度累計573万円の上限があり、それを超える部分からは徴収されません。本ツールでは年間賞与を入力すると賞与分も合わせて計算します。',
  },
  {
    q: '支払わない・免除される方法はありますか？',
    a: '医療保険料と一体で徴収されるため、医療保険の加入者である限り原則として拒否できません。産前産後休業・育児休業中の保険料免除など、健康保険料の免除制度が適用される場合は支援金も免除されます。',
  },
];

const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`;

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
      <p>
        標準報酬月額は月収そのものではなく、報酬月額を等級表のきりのよい額に当てはめたものです。
        {CONFIRMED_YEAR.fiscalYear}年度（{CONFIRMED_YEAR.era}）の支援金率は
        {(CONFIRMED_YEAR.rate * 100).toFixed(2)}%で、労使折半のため本人負担率は
        {((CONFIRMED_YEAR.rate / 2) * 100).toFixed(3)}%です。賞与からも、1,000円未満を切り捨てた
        「標準賞与額」に同じ料率をかけた額の半分が徴収されます（標準賞与額は年度累計
        {Math.round(BONUS_CAP_YEARLY / 10_000).toLocaleString('ja-JP')}万円が上限）。
      </p>
      <div className="note">
        実際の給与では健康保険料と合算して端数処理されるため、表示額と±1円程度の差が出ることがあります。
      </div>

      <h2>年収別の負担額の早見表</h2>
      <p>
        {CONFIRMED_YEAR.fiscalYear}年度（{CONFIRMED_YEAR.era}・料率
        {(CONFIRMED_YEAR.rate * 100).toFixed(2)}%）の本人負担分です。年収は月収×12で、賞与は含めていません。
      </p>
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
          {CONFIRMED_ROWS.map((r) => (
            <tr key={r.yearlyIncome}>
              <td>{Math.round(r.yearlyIncome / 10_000).toLocaleString('ja-JP')}万円</td>
              <td>{yen(r.standardMonthly)}</td>
              <td>{yen(r.monthly)}</td>
              <td>{yen(r.yearly)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="note">
        この表は代表的な等級だけを並べたものです。健康保険の標準報酬月額の等級は
        {yen(TOP_STANDARD_MONTHLY)}
        まであるので、表の最後の行が上限ではありません（厚生年金の上限とは範囲が違います）。表に無い月収や、賞与がある場合は計算機でご確認ください。
      </div>

      <h2>年度ごとの負担額の推移</h2>
      <p>
        標準報酬月額{yen(TREND_MONTHLY_INCOME)}
        （年収{Math.round((TREND_MONTHLY_INCOME * 12) / 10_000)}万円の目安）の方1人を例にした、年度ごとの本人負担額です。
      </p>
      <table>
        <thead>
          <tr>
            <th>年度</th>
            <th>支援金率</th>
            <th>月額</th>
          </tr>
        </thead>
        <tbody>
          {TREND_ROWS.map((r) => (
            <tr key={r.fiscalYear}>
              <td>
                {r.era}（{r.fiscalYear}年度）
              </td>
              <td>
                {r.ratePercent.toFixed(2)}%（{r.status}）
              </td>
              <td>{yen(r.monthly)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {HAS_UNCONFIRMED_TREND && (
        <div className="note">
          <strong>
            「見込み」「政府試算」と書いた年度の料率は未確定の推計です。
          </strong>
          支援金の総額を段階的に引き上げる政府の計画・試算から逆算した値で、確定した料率ではありません。確定しだい本ページのデータを更新します。
        </div>
      )}

      <h2>加入している保険で決まり方が違う</h2>
      <p>
        支援金は医療保険の保険料と一体で集められるため、
        <strong>どの医療保険に入っているかで決まり方が変わります</strong>（<a href="https://www.cfa.go.jp/policies/kodomokosodateshienkinseido" target="_blank" rel="nofollow noopener noreferrer">
          こども家庭庁「子ども・子育て支援金制度について」
        </a>）。
      </p>
      <ul>
        <li>
          <strong>被用者保険（健康保険・共済）</strong> —
          「標準報酬月額・標準賞与額 × 料率」を労使で折半します。料率は全国一律で、上の早見表がこれにあたります
        </li>
        <li>
          <strong>国民健康保険</strong> —
          市区町村が、所得に応じた部分と世帯の加入者数に応じた部分を組み合わせて決めます。同じ所得でも自治体によって額が変わります
        </li>
        <li>
          <strong>後期高齢者医療制度</strong> —
          都道府県ごとの広域連合が決めます。こちらも地域差があります
        </li>
      </ul>
      <p>
        <strong>このツールが出せるのは被用者保険の本人負担分だけです。</strong>
        国民健康保険・後期高齢者医療制度の額は自治体・広域連合ごとに違うため計算していません。金額は、お住まいの市区町村から届く保険料の決定通知書か、自治体の保険料の案内でご確認ください。
      </p>

      <h2>集めたお金の使い道</h2>
      <p>
        <a href="https://www.cfa.go.jp/policies/kodomokosodateshienkinseido" target="_blank" rel="nofollow noopener noreferrer">
          こども家庭庁の資料
        </a>では、支援金は「こども・子育て支援加速化プラン」の財源にあてるとされています。充当先として挙げられているのは次のような給付です。
      </p>
      <ul>
        <li>児童手当の拡充（所得制限の撤廃・支給期間の高校生年代までの延長・第3子以降の加算）</li>
        <li>妊娠・出産時の経済的支援（出産・子育て応援給付金）</li>
        <li>こども誰でも通園制度</li>
        <li>育児期の働き方の支援（育児時短就業給付、出生後休業支援給付）</li>
      </ul>
      <p>
        使い道は資料に書かれている範囲を並べたものです。個々の給付の要件や金額は、それぞれの制度の一次情報をご確認ください。
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
        ほか公的資料にもとづき作成。料率・使い道は同資料に記載の範囲によります。
      </ToolMeta>
    </>
  );
}
