import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';
import { deductedIn, ymJa } from '@/lib/hoshu-kyugen-tokurei';
import Calculator from './Calculator';
import { COMPARE_ROWS, description, EXAMPLE, EXAMPLE_INPUT, EXAMPLE_JITAN, faq, title } from './copy';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/hoshu-kyugen-tokurei/` },
  robots: robotsFor('hoshu-kyugen-tokurei'),
};

const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`;
const man = (n: number) => `${(n / 10_000).toLocaleString('ja-JP')}万円`;

const trail = breadcrumbFor('hoshu-kyugen-tokurei');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '報酬急減の特例改定 判定・保険料計算機',
      url: `${SITE_URL}/hoshu-kyugen-tokurei/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('hoshu-kyugen-tokurei'),
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

const ex = EXAMPLE;
const exPension = ex.firstRow.before.pension - ex.firstRow.after.pension;

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumb trail={trail} />

      <h1>報酬急減の特例改定 判定・保険料計算機</h1>
      <p className="lead">
        療養・育児・介護のための時短や残業の抑制で給料が下がったとき、<strong>2027年1月から</strong>
        「翌月から標準報酬月額を下げる特例」が使えます。当たるかを判定し、<strong>いつから・毎月いくら</strong>
        保険料が下がるかと、引き換えに減る年金・傷病手当金・出産手当金を並べます。
      </p>

      <Calculator buildDate={new Date().toISOString()} />

      <AdUnit position="below-tool" />

      <h2>この特例とは（2027年1月から）</h2>
      <p>
        療養・育児・介護と仕事を両立するために、所定労働時間の短縮や<strong>時間外労働の抑制</strong>
        などの就労調整をして報酬が急に減ったとき、本人が書面で同意すれば、報酬が減った初月の報酬の総額で
        <strong>その翌月から</strong>標準報酬月額を改定できる取扱いです（健康保険法44条1項・厚生年金保険法24条1項の保険者算定）。
        厚生労働省の通知（令和8年7月31日）で、2027年1月1日から適用されます。
      </p>
      <ul>
        <li>
          <strong>療養</strong>：本人の治療など、または家族の治療などに伴う看護
        </li>
        <li>
          <strong>育児</strong>：小学校就学前の子の養育
        </li>
        <li>
          <strong>介護</strong>：要介護・要支援の認定を受けた家族の介護
        </li>
      </ul>
      <p>
        要件は、急減後の報酬による標準報酬月額が<strong>従前より2等級以上低い</strong>こと、
        その状態が<strong>3か月以上続く見込み</strong>であること、本人の書面の同意があることです。
        初月の支払基礎日数が17日（短時間労働者は11日）未満、初月に全く勤務していない、初月の翌月に退職する、
        初月を含めて加入3か月未満のときは対象外です。
      </p>
      <p>
        例：東京都・協会けんぽ・35歳で、標準報酬月額{man(EXAMPLE_INPUT.formerStandard)}
        （健保{ex.health.formerRow[0]}級）の人が、残業の抑制で{ymJa(EXAMPLE_INPUT.firstMonth)}の報酬が
        {man(EXAMPLE_INPUT.firstMonthPay)}（健保{ex.health.newRow[0]}級）になると、{ex.health.drop}
        等級の低下で対象になりえます。厚生年金の本人分は月{yen(ex.firstRow.before.pension)}→{yen(ex.firstRow.after.pension)}
        （月{yen(exPension)}減）、健康保険なども合わせて月{yen(ex.firstRow.diff)}下がります。
        残業の抑制だけなら比較相手は9月分からの定時決定なので、{ymJa(ex.accel.months[0])}〜
        {ymJa(ex.accel.months[ex.accel.months.length - 1])}分の{ex.accel.months.length}か月分、
        合計{yen(ex.acceleratedTotal)}が早く下がります。引き換えに、12か月続けた場合の老齢厚生年金は
        年 約{yen(ex.pensionLoss.withoutIkuji)}減ります（生涯毎年）。
      </p>

      <h2>通常の随時改定との違い</h2>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th></th>
              <th>報酬急減の特例改定</th>
              <th>通常の随時改定</th>
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map((r) => (
              <tr key={r.item}>
                <th scope="row" style={{ textAlign: 'left' }}>
                  {r.item}
                </th>
                <td>{r.tokurei}</td>
                <td>{r.zuiji}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        時短などで固定的賃金が変わった場合も、随時改定は4か月目からなので、特例なら2か月早まります
        （初月{ymJa(EXAMPLE_INPUT.firstMonth)}なら特例は{ymJa(EXAMPLE_JITAN.accel.tokureiFrom)}分から、随時改定は
        {ymJa(EXAMPLE_JITAN.accel.normalFrom)}分から）。特例改定のあとも、定時決定（算定基礎届）は通常どおり行われます。
        保険料を翌月の給与から引く会社では、{ymJa(ex.accel.tokureiFrom)}分の保険料は
        {ymJa(deductedIn(ex.accel.tokureiFrom))}の給与から下がります。
      </p>

      <h2>同意する前に確かめること（年金・傷病手当金・出産手当金）</h2>
      <p>
        通知は、事業主が「将来の年金給付が減少すること、傷病手当金及び出産手当金に影響が生じること」を十分説明し、
        あらかじめ同意を得るよう求めています。保険料が下がるのと引き換えに、次のものが減ります。
      </p>
      <ul>
        <li>
          <strong>老齢厚生年金</strong>：報酬比例部分が「下がった標準報酬月額の差 × 5.481/1000 × 月数」だけ、生涯毎年減ります
        </li>
        <li>
          <strong>傷病手当金・出産手当金</strong>：支給開始日以前12か月の標準報酬月額の平均で決まるので、下がった月が平均に入るほど日額が減ります
          （例では日額{yen(ex.allowance.without)}→{yen(ex.allowance.with)}）
        </li>
      </ul>
      <p>
        このツールは保険料の減少と給付の減少を並べるところまでで、同意するかどうかの結論は出しません。判断は本人と事業主で行ってください。
      </p>

      <h2>3歳未満の子がいるときは養育特例を併せて</h2>
      <p>
        3歳未満の子を養育している場合は、「厚生年金保険 養育期間標準報酬月額特例申出書」を事業主を通して出すと、
        <strong>年金額は養育を始めた月の前月の標準報酬月額で計算されます</strong>（厚生年金保険法26条。
        その月に被保険者でなければ、その前1年以内で直近の月）。特例改定で保険料だけ下げて、年金は守れます。
      </p>
      <ul>
        <li>守られるのは<strong>厚生年金だけ</strong>です。傷病手当金・出産手当金は守られません</li>
        <li>みなしは「基準の額と実際の額の高いほう」なので、基準の額（養育を始めた前月の額）が従前より低いと、その差の分は減ります</li>
        <li>子が3歳になる月の前月までが対象です</li>
      </ul>

      <h2>戻すときと手続き</h2>
      <p>
        時短・残業の抑制が終わって報酬が戻り、2等級以上上がったら、事業主が速やかに届け出て、報酬が増えた初月の報酬総額で改定されます。
      </p>
      <ul>
        <li>
          <strong>事業主が出すもの</strong>：被保険者報酬月額変更届（特例改定用）と申立書兼同意書を事務センター（年金事務所）へ。
          健康保険組合に加入している場合は、健保組合にも同時に
        </li>
        <li>
          <strong>本人がすること</strong>：書面の同意（申立書兼同意書）。3歳未満の子がいれば養育期間標準報酬月額特例申出書も
        </li>
        <li>
          <strong>保存する書類</strong>：出勤簿・賃金台帳・診断書・子の年齢の証明・要介護認定の証明などを届出から2年間
        </li>
      </ul>
      <PublicToolLink slug="ikuji-jitan-kyufu">
        <p>
          育児の時短で雇用保険から出る給付は<ToolLink slug="ikuji-jitan-kyufu">育児時短就業給付の計算機</ToolLink>
          で確かめられます（特例改定とは別の制度で、両方使えます）。
        </p>
      </PublicToolLink>
      <PublicToolLink slug="shobyo-teate">
        <p>
          休んだときの給付は<ToolLink slug="shobyo-teate">傷病手当金の計算機</ToolLink>でも計算できます。
        </p>
      </PublicToolLink>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="hoshu-kyugen-tokurei" />

      <ToolMeta slug="hoshu-kyugen-tokurei" ymyl>
        出典：
        <a href="https://www.mhlw.go.jp/content/001731743.pdf" target="_blank" rel="nofollow noopener noreferrer">
          厚生労働省「療養、育児又は介護により報酬が急減した者についての健康保険法及び厚生年金保険法の標準報酬月額の保険者算定の特例について」（令和8年7月31日）
        </a>
        ／
        <a href="https://laws.e-gov.go.jp/law/329AC0000000115" target="_blank" rel="nofollow noopener noreferrer">
          e-Gov 法令検索「厚生年金保険法」（26条）
        </a>
        ／
        <a
          href="https://www.nenkin.go.jp/service/kounen/hokenryo/menjo/20150120.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          日本年金機構「養育期間の従前標準報酬月額のみなし措置」
        </a>
        ／
        <a
          href="https://www.kyoukaikenpo.or.jp/benefit/injury_and_sickness_allowance/"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          協会けんぽ「傷病手当金」
        </a>
        ／
        <a
          href="https://www.kyoukaikenpo.or.jp/benefit/childbirth/001/index.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          同「出産手当金」
        </a>
        ／
        <a
          href="https://www.kyoukaikenpo.or.jp/about/business/insurance_rate/rate_prefectures/r08/index.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          同「令和8年度の都道府県毎の保険料率」
        </a>
        にもとづき作成。等級表は日本年金機構・協会けんぽの保険料額表、子ども・子育て支援金はこども家庭庁の資料によります。
        日本年金機構の特例改定（療養等）用の案内ページは2026年11月13日時点で見つかっていません。判定は目安で、最終的には事業主・年金事務所が判断します。
      </ToolMeta>
    </>
  );
}
