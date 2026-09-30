import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';
import {
  LIMIT_LABEL,
  LIMIT_MAX,
  LIMIT_MIN,
  START_WAGE_MAX,
  START_WAGE_MIN,
  formatRate,
  hayamiRows,
  monthlyAmount,
} from '@/lib/ikuji-jitan-kyufu';
import Calculator from './Calculator';

/**
 * 本文の額・率は手で書かず、lib の関数から出す（例①〜③と早見表）。
 * 限度額が8月1日に改定されたとき、本文だけ古い額のまま残らないようにするため。
 */
const title = '育児時短就業給付金 計算機｜時短勤務でいくらもらえる？10%・逓減・上限を厚労省の式で';
const description =
  '育児時短就業給付金（2歳未満の子のための時短勤務で月給の10%）がいくらもらえるかを計算。時短前の90%を超えたときの逓減（9,000 ÷ 賃金率 − 90）、支給限度額484,121円、最低限度額2,562円まで厚労省の式どおりに出し、子が2歳になるまでの支給対象月と合計の目安を表示します。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/ikuji-jitan-kyufu/` },
  robots: robotsFor('ikuji-jitan-kyufu'),
};

const yen = (v: number) => `${v.toLocaleString('ja-JP')}円`;

/** パンフレットの計算例①〜③（開始時賃金月額・支給対象月の賃金） */
const EXAMPLES = [
  { label: '①', start: 300_000, paid: 200_000 },
  { label: '②', start: 300_000, paid: 280_000 },
  { label: '③', start: START_WAGE_MAX, paid: 445_000 },
].map((e) => ({ ...e, r: monthlyAmount(e.paid, e.start) }));

const EXAMPLE_REASON: Record<string, string> = {
  base: '90%以下 → 10%',
  taper: '90%超100%未満 → 逓減',
  cap: '10%だと支給限度額を超える → 限度額 − 賃金',
};

const faq = [
  {
    q: '育児時短就業給付金の10%はいつまでもらえますか？',
    a: '子が2歳に達する日の前日の属する月までです。2歳に達する日は2歳の誕生日の前日なので、「2歳の誕生日の前々日の属する月まで」と覚えると確実です。たとえば4月1日生まれなら、2歳に達する日は3月31日、その前日は3月30日なので3月分までです。ほかに、産前産後休業・育児休業・介護休業を始めた場合や、別の子について時短を始めた場合もそこで終わります。',
  },
  {
    q: '時短前の90%を超えるとなぜ給付が減るのですか？',
    a: '「時短後の賃金 ＋ 給付」が時短前の賃金を超えないようにするためです。時短後の賃金が時短前（開始時賃金月額）の90%を超えて100%未満のときは、支給率が「9,000 ÷ 賃金率 − 90」に下がり、100%以上だと支給されません。たとえば時短前300,000円で時短後280,000円（賃金率93.33%）なら、支給率は6.43%で18,004円です。',
  },
  {
    q: '育休から続けて時短に入る場合、時短前の賃金はどうなりますか？',
    a: '育児休業給付の休業開始時賃金日額 × 30日が、そのまま時短の開始時賃金月額になります。育休の前の6か月の賃金で決まるので、この計算機には「育休前の月給」を入れてください。育休の終了日と時短の開始日の間が14日以内なら「引き続き」の扱いで、受給資格（12か月の完全月）も改めて見られません。育休から復帰した月は、月の途中からの時短でもその月から支給対象月に数えます（その月の賃金は日割りで低くなります）。',
  },
  {
    q: '賞与や通勤手当のまとめ払いは賃金に含めますか？',
    a: '賞与や臨時に支払われた賃金は含めません。残業代・通勤手当などの毎月の手当は含めた総支給額で見ます。3か月・6か月分の通勤手当をまとめて支払う場合は、ハローワークの扱い（按分するかどうか）を勤務先で確認してください。',
  },
  {
    q: '育児時短就業給付金に所得税や社会保険料はかかりますか？',
    a: 'かかりません。雇用保険の給付は非課税で、社会保険料の算定にも入りません。そのため「時短後の月給の手取り ＋ 給付」が、時短中の実際の手取りの目安になります。',
  },
  {
    q: '申請は誰がしますか？',
    a: '原則として勤務先（事業主）がハローワークに申請します（本人が申請することもできます）。初回は、時短の開始日の翌月から4か月以内に申請します。以後は原則2か月ごとにまとめて申請します。',
  },
  {
    q: '2人目の子で時短を始めたらどうなりますか？',
    a: '別の子について育児時短就業を始めると、前の子の支給対象月はその前の月の末日で終わり、以後は新しい子について支給されます。2人目の産前産後休業や育児休業を始めた場合も、その前日で前の子の時短の給付は終わります。',
  },
];

const trail = breadcrumbFor('ikuji-jitan-kyufu');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '育児時短就業給付金 計算機',
      url: `${SITE_URL}/ikuji-jitan-kyufu/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('ikuji-jitan-kyufu'),
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

      <h1>育児時短就業給付金 計算機</h1>
      <p className="lead">
        2歳未満の子のために時短勤務をすると、<strong>時短中の月給の10%</strong>が雇用保険から
        支給されます。時短前と時短後の月給を入れると、90%を超えたときの逓減と
        支給限度額（{yen(LIMIT_MAX)}）まで厚生労働省の式どおりに月の支給額を出し、
        子が2歳になるまでの支給対象月と合計の目安を計算します。金額は
        <strong>{LIMIT_LABEL}</strong>の限度額に対応しています。
      </p>

      <Calculator buildDate={new Date().toISOString()} />

      <AdUnit position="below-tool" />

      <h2>支給額を決める3つの式</h2>
      <p>
        支給額は、時短後の月給（支給対象月に支払われた賃金）と、時短前の賃金から決まる
        <strong>開始時賃金月額</strong>の比で決まります。
      </p>
      <ol>
        <li>
          <strong>時短後の月給が開始時賃金月額の90%以下</strong> … 月給 × 10%
        </li>
        <li>
          <strong>90%超〜100%未満</strong> … 月給 × 支給率。支給率は
          「9,000 ÷ 賃金率 − 90」（賃金率 ＝ 月給 ÷ 開始時賃金月額 × 100。
          どちらも小数第3位を四捨五入）で、支給額の1円未満は切り捨て
        </li>
        <li>
          <strong>月給 ＋ 支給額が支給限度額（{yen(LIMIT_MAX)}）を超える</strong> …
          {yen(LIMIT_MAX)} − 月給
        </li>
      </ol>
      <p>
        月給が開始時賃金月額の100%以上のとき、月給が支給限度額以上のとき、算定した支給額が
        最低限度額（{yen(LIMIT_MIN)}）以下のときは支給されません。
        90%かどうかは<strong>率ではなく金額で</strong>判定します。
      </p>

      <h2>厚生労働省の計算例</h2>
      <table>
        <thead>
          <tr>
            <th>例</th>
            <th>開始時賃金月額</th>
            <th>時短後の月給</th>
            <th>判定</th>
            <th>支給額</th>
          </tr>
        </thead>
        <tbody>
          {EXAMPLES.map((e) => (
            <tr key={e.label}>
              <td>{e.label}</td>
              <td>{yen(e.start)}</td>
              <td>{yen(e.paid)}</td>
              <td>
                {EXAMPLE_REASON[e.r.reason]}
                {e.r.reason === 'taper' && `（${formatRate(e.r.rateHundredths)}）`}
              </td>
              <td>
                <strong>{yen(e.r.amount)}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        例③は、月給が90%（{yen(EXAMPLES[2].r.threshold90)}）以下なので本来は10% ＝{' '}
        {yen(EXAMPLES[2].r.beforeCap)}ですが、月給と足すと支給限度額を超えるため、
        {yen(LIMIT_MAX)} − {yen(EXAMPLES[2].paid)} ＝ {yen(EXAMPLES[2].r.amount)}になります。
      </p>

      <h2>賃金率ごとの支給率の早見表（90%超）</h2>
      <table>
        <thead>
          <tr>
            <th>賃金率</th>
            <th>支給率</th>
          </tr>
        </thead>
        <tbody>
          {hayamiRows().map((row) => (
            <tr key={row.wageRateH}>
              <td>{formatRate(row.wageRateH)}</td>
              <td>{formatRate(row.rateH)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        賃金率が90%以下なら支給率は10.00%、100%以上なら支給されません。
        支給率を月給に掛けた額が最低限度額（{yen(LIMIT_MIN)}）以下なら、支給されません。
      </p>

      <h2>開始時賃金月額と{LIMIT_LABEL}の限度額</h2>
      <p>
        開始時賃金月額は、時短を始める前6か月の賃金総額 ÷ 180 × 30 です。
        育児休業から引き続いて時短を始めた場合は、<strong>育児休業給付の休業開始時賃金日額 × 30</strong>
        をそのまま使います。上限・下限と支給限度額は<strong>毎年8月1日に改定</strong>されます。
      </p>
      <table>
        <thead>
          <tr>
            <th>項目</th>
            <th>額</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>開始時賃金月額の上限</td>
            <td>{yen(START_WAGE_MAX)}</td>
          </tr>
          <tr>
            <td>開始時賃金月額の下限</td>
            <td>{yen(START_WAGE_MIN)}</td>
          </tr>
          <tr>
            <td>支給限度額（月給 ＋ 支給額）</td>
            <td>{yen(LIMIT_MAX)}</td>
          </tr>
          <tr>
            <td>最低限度額（これ以下は支給なし）</td>
            <td>{yen(LIMIT_MIN)}</td>
          </tr>
        </tbody>
      </table>

      <h2>もらえる人の条件</h2>
      <ul>
        <li>
          <strong>2歳未満の子を養育するために、週の所定労働時間を短縮して働く</strong>
          雇用保険の被保険者であること
        </li>
        <li>
          育児休業給付の対象となる育児休業から引き続いて（終了日と開始日の間が14日以内）時短を
          始めたこと、<strong>または</strong>時短の開始日前2年間に賃金支払基礎日数が11日以上
          （無ければ80時間以上）の完全月が12か月以上あること
        </li>
        <li>
          支給対象月の初日から末日まで被保険者であり、育児休業給付・介護休業給付を受けていないこと
          （高年齢雇用継続給付の対象でないこと）
        </li>
      </ul>

      <div className="note">
        受給資格の有無と支給額は<strong>ハローワークが決定します</strong>。この計算機は受給できる前提で、
        毎月同じ賃金が続く場合の目安を出すもので、資格の判定はしません。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="ikuji-jitan-kyufu" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        関連ツール：<Link href="/ikuji-kyugyo-kyufu/">育児休業給付金 計算機</Link>／
        <Link href="/shussan-teate/">出産手当金 計算機</Link>／
        <Link href="/tedori-keisan/">手取り計算機</Link>
        <PublicToolLink slug="kokunen-ikuji-menjo">
          ／<ToolLink slug="kokunen-ikuji-menjo">国民年金 育児期間の保険料免除 計算機</ToolLink>
        </PublicToolLink>
      </p>

      <ToolMeta slug="ikuji-jitan-kyufu" ymyl>
        出典：
        <a
          href="https://www.mhlw.go.jp/content/11600000/001395102.pdf"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          厚生労働省・都道府県労働局・ハローワーク「育児時短就業給付の内容と支給申請手続」（2026年8月1日時点版）
        </a>
        、
        <a
          href="https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000135090_00001.html"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          厚生労働省「育児休業等給付について」
        </a>
        、
        <a
          href="https://www.mhlw.go.jp/content/001728499.pdf"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          厚生労働省「令和8年8月1日から支給限度額が変更になります」
        </a>
        にもとづき作成（2026年9月30日確認）。開始時賃金月額の上限・下限と支給限度額・最低限度額は
        毎年8月1日に改定されます。
      </ToolMeta>
    </>
  );
}
