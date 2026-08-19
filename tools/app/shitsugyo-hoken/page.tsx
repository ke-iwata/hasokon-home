import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import {
  BENEFIT_DAILY_MIN,
  BENEFIT_RATE_RULES,
  RATE_TABLE_LABEL,
  TAPER_FROM,
  WAGE_DAILY_MIN,
} from '@/lib/shitsugyo-hoken';
import Calculator from './Calculator';

const title = '失業保険（基本手当）計算機｜いくら・いつからもらえるかを自動計算';
const description =
  '失業保険（雇用保険の基本手当）がいくらもらえるかを、令和8年8月1日改定の日額で計算。月給・年齢・加入期間・離職理由を入れると、基本手当日額・所定給付日数・総額と、待期7日と給付制限を踏まえた「いつから支給対象になるか」が分かります。自己都合の給付制限は2ヶ月ではなく原則1ヶ月です。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/shitsugyo-hoken/` },
  robots: robotsFor('shitsugyo-hoken'),
};

const yen = (v: number) => `${v.toLocaleString('ja-JP')}円`;

const faq = [
  {
    q: '失業保険はいくらもらえますか？',
    a: '1日あたりの「基本手当日額」は、退職前6ヶ月の賃金総額（額面・賞与を除く）を180で割った「賃金日額」の50〜80%（60〜64歳は45〜80%）です。賃金が低い人ほど割合が高くなります。令和8年8月1日からの基本手当日額の上限は30歳未満7,450円、30〜44歳8,270円、45〜59歳9,110円、60〜64歳7,830円で、下限は年齢に関係なく2,562円です。総額は「基本手当日額×所定給付日数」が目安になります。',
  },
  {
    q: '自己都合で辞めると2ヶ月もらえないのですか？',
    a: 'いいえ。それは旧制度です。令和7年（2025年）4月1日以降の離職では、正当な理由がない自己都合退職の給付制限は原則1ヶ月に短縮されました。ただし離職日から遡って5年間に2回以上、正当な理由なく自己都合退職して受給資格決定を受けている場合は3ヶ月、自分の重大な責任による解雇（重責解雇）も3ヶ月です。',
  },
  {
    q: '給付制限を短くする方法はありますか？',
    a: '令和7年4月1日以降に受講を開始した教育訓練（教育訓練給付の対象講座、公共職業訓練、短期訓練受講費の対象となる訓練など）を、離職日前1年以内に受けた場合、または離職後に受けている場合は、給付制限そのものが解除されます。待期7日の満了後から基本手当の支給対象になります。ハローワークへの申し出が必要で、申し出には期限があるので早めに相談してください。なお重責解雇はこの取扱いの対象外です。',
  },
  {
    q: '何日分もらえますか（所定給付日数）？',
    a: '離職理由・年齢・雇用保険に入っていた期間で決まります。自己都合や定年などの一般の離職者は加入10年未満で90日、10年以上20年未満で120日、20年以上で150日です。倒産・解雇などの特定受給資格者は年齢によって90〜330日と長くなり、最長は45〜59歳で加入20年以上の330日です。就職困難者は150〜360日です。',
  },
  {
    q: 'いつから振り込まれますか？',
    a: 'ハローワークで求職の申込みをした日（受給資格決定日）から7日間は待期期間で、離職理由にかかわらず支給されません。会社都合や正当な理由のある自己都合なら待期の翌日から支給対象になります。自己都合の場合はさらに給付制限（原則1ヶ月）があります。失業の認定は4週間ごとで、実際の振込は認定日からおおむね1週間後です。',
  },
  {
    q: '賞与（ボーナス）や手取りは計算に入りますか？',
    a: '賃金日額の計算に使うのは、毎月きまって支払われた賃金の「額面」です。税金や社会保険料を引く前の金額で、残業代や通勤手当は含めます。3ヶ月を超える期間ごとに支払われる賃金（賞与・ボーナス）は含めません。手取りで計算すると基本手当日額を低く見積もることになります。',
  },
  {
    q: '受け取れる期間に期限はありますか？',
    a: '受給期間は離職日の翌日から原則1年です。所定給付日数が残っていても、この1年を過ぎると支給は打ち切られます。給付制限が3ヶ月あって所定給付日数が330日といった場合は1年に収まらないことがあるので、離職後は早めに手続きしてください。病気・けが・出産・育児・介護などですぐに働けないときは、受給期間を最長3年まで延長できる制度があります。',
  },
];

const trail = breadcrumbFor('shitsugyo-hoken');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '失業保険（基本手当）計算機',
      url: `${SITE_URL}/shitsugyo-hoken/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('shitsugyo-hoken'),
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

      <h1>失業保険（基本手当）計算機</h1>
      <p className="lead">
        退職したら失業保険（雇用保険の基本手当）がいくら・いつからもらえるかを計算します。
        月給・年齢・加入期間・離職理由を入れるだけで、基本手当日額と所定給付日数、総額の目安、
        待期7日と給付制限を踏まえた支給開始日までが分かります。日額は
        <strong>令和8年8月1日改定</strong>の額に対応しています。
      </p>

      <Calculator buildDate={new Date().toISOString()} />

      <AdUnit position="below-tool" />

      <h2>令和8年8月1日から基本手当日額の上限・下限が上がりました</h2>
      <p>
        賃金日額と基本手当日額の上限額・下限額は、毎月勤労統計の平均定期給与額の増減に応じて
        <strong>毎年8月1日に改定</strong>されます。令和8年度分は令和8年7月31日の官報で公布され、
        8月1日から適用されています。
      </p>
      <table>
        <thead>
          <tr>
            <th>離職時の年齢</th>
            <th>賃金日額の上限額</th>
            <th>基本手当日額の上限額（{RATE_TABLE_LABEL}）</th>
          </tr>
        </thead>
        <tbody>
          {BENEFIT_RATE_RULES.map((rule) => (
            <tr key={rule.band}>
              <td>{rule.label}</td>
              <td>{yen(rule.wageDailyMax)}</td>
              <td>
                <strong>{yen(rule.benefitDailyMax)}</strong>
              </td>
            </tr>
          ))}
          <tr>
            <td>下限（全年齢）</td>
            <td>{yen(WAGE_DAILY_MIN)}</td>
            <td>
              <strong>{yen(BENEFIT_DAILY_MIN)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        給付率は賃金日額が{yen(TAPER_FROM)}
        未満なら80%で、そこから上限に向かって50%（60〜64歳は45%）まで少しずつ下がります。
        <strong>賃金が高い人ほど、額面に対してもらえる割合は小さくなります。</strong>
      </p>

      <h2>「自己都合は2ヶ月もらえない」は旧制度です</h2>
      <p>
        正当な理由がない自己都合退職には、待期7日のあとに「給付制限」があります。この期間は
        以前は原則2ヶ月（さらに前は3ヶ月）でしたが、<strong>令和7年（2025年）4月1日以降の離職
        については原則1ヶ月</strong>に短縮されました。まだ「2ヶ月」「3ヶ月」と書いたままの
        解説記事や計算機が多いので注意してください。
      </p>
      <ul>
        <li>会社都合（倒産・解雇・退職勧奨・雇止め）・正当な理由のある自己都合 … 給付制限なし</li>
        <li>正当な理由がない自己都合（原則） … <strong>1ヶ月</strong></li>
        <li>離職日から遡って5年間に2回以上、自己都合退職で受給資格決定を受けた場合 … 3ヶ月</li>
        <li>自分の重大な責任による解雇（重責解雇） … 3ヶ月</li>
      </ul>
      <p>
        さらに、令和7年4月1日以降に受講を開始した<strong>教育訓練等を受けると給付制限が解除</strong>
        されます。離職日前1年以内に受けた場合も、離職後に受け始めた場合も対象で、待期の満了後から
        基本手当を受け取れます。対象は教育訓練給付の対象講座・公共職業訓練・短期訓練受講費の
        対象となる訓練などです。<strong>重責解雇はこの取扱いの対象外</strong>で、ハローワークへの
        申し出にも期限があるので、受講を考えている段階で相談しておくと確実です。
      </p>

      <h2>基本手当日額はこう決まる</h2>
      <ol>
        <li>
          <strong>賃金日額</strong> = 退職前6ヶ月に毎月きまって支払われた賃金の合計 ÷ 180日。
          額面で計算し、賞与（3ヶ月を超える期間ごとに支払われる賃金）は含めません
        </li>
        <li>年齢区分ごとの上限額・下限額に収める（上の表）</li>
        <li>
          <strong>基本手当日額</strong> = 賃金日額 × 給付率（50〜80%、60〜64歳は45〜80%）。
          1円未満は切り捨て
        </li>
        <li>
          <strong>総額の目安</strong> = 基本手当日額 × 所定給付日数
        </li>
      </ol>

      <h2>所定給付日数（何日分もらえるか）</h2>
      <p>離職理由・年齢・雇用保険に入っていた期間（被保険者であった期間）で決まります。</p>

      <h3>自己都合・定年など（一般の受給資格者）</h3>
      <table>
        <thead>
          <tr>
            <th>加入期間</th>
            <th>10年未満</th>
            <th>10年以上20年未満</th>
            <th>20年以上</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>全年齢</td>
            <td>90日</td>
            <td>120日</td>
            <td>150日</td>
          </tr>
        </tbody>
      </table>

      <h3>倒産・解雇など（特定受給資格者・一部の特定理由離職者）</h3>
      <table>
        <thead>
          <tr>
            <th>年齢＼加入期間</th>
            <th>1年未満</th>
            <th>1〜5年</th>
            <th>5〜10年</th>
            <th>10〜20年</th>
            <th>20年以上</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>30歳未満</td>
            <td>90日</td>
            <td>90日</td>
            <td>120日</td>
            <td>180日</td>
            <td>―</td>
          </tr>
          <tr>
            <td>30〜34歳</td>
            <td>90日</td>
            <td>120日</td>
            <td>180日</td>
            <td>210日</td>
            <td>240日</td>
          </tr>
          <tr>
            <td>35〜44歳</td>
            <td>90日</td>
            <td>150日</td>
            <td>180日</td>
            <td>240日</td>
            <td>270日</td>
          </tr>
          <tr>
            <td>45〜59歳</td>
            <td>90日</td>
            <td>180日</td>
            <td>240日</td>
            <td>270日</td>
            <td>330日</td>
          </tr>
          <tr>
            <td>60〜64歳</td>
            <td>90日</td>
            <td>150日</td>
            <td>180日</td>
            <td>210日</td>
            <td>240日</td>
          </tr>
        </tbody>
      </table>
      <p>
        就職困難者（障害者手帳をお持ちの方など）は、加入1年未満で150日、1年以上なら45歳未満300日・
        45〜64歳360日です。
      </p>

      <div className="note">
        受給資格の有無はハローワークが決定します。自己都合などの一般の離職では原則
        「離職前2年間に被保険者期間12ヶ月以上」、倒産・解雇などでは「離職前1年間に6ヶ月以上」が
        必要です。この計算機は受給できる前提での金額の目安を出すもので、資格の判定はしません。
        また、65歳以上での離職は基本手当ではなく高年齢求職者給付金（一時金）になります。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="shitsugyo-hoken" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        関連ツール：<Link href="/shobyo-teate/">傷病手当金 計算機</Link>／
        <Link href="/nenshu-kabe/">年収の壁 計算機</Link>／
        <Link href="/saitei-chingin/">最低賃金 早見表・チェッカー</Link>
      </p>

      <ToolMeta slug="shitsugyo-hoken" ymyl>
        出典：
        <a
          href="https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000160564_00050.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          厚生労働省「令和8年8月1日からの基本手当日額等の適用について」
        </a>
        （参考1「基本手当日額の計算式及び金額」）、
        <a
          href="https://www.hellowork.mhlw.go.jp/insurance/insurance_benefitdays.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          ハローワークインターネットサービス「基本手当の所定給付日数」
        </a>
        、
        <a
          href="https://www.mhlw.go.jp/content/001441564.pdf"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          厚生労働省「令和7年4月以降に教育訓練等を受ける場合、給付制限が解除され、基本手当を受給できます」
        </a>
        にもとづき作成（2026年8月19日確認）。基本手当日額の上限・下限は毎年8月1日に改定されます。
      </ToolMeta>
    </>
  );
}
