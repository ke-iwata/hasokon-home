import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import { EMPLOYMENT_RATE, HEALTH_RATE, PENSION_RATE, ratePercent } from '@/lib/shaho-ryoritsu';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { TABLE_YEAR_LABEL } from '@/lib/shoyo-gensen-table';
import { shoyoTable, TABLE_DEPENDENTS, TABLE_PREV_SALARY } from '@/lib/shoyo-tedori';
import Calculator from './Calculator';

const title = '賞与（ボーナス）手取り計算機｜前月の給与と扶養の数で所得税の率を自動判定';
const description =
  '賞与（ボーナス）の額面と前月の給与を入れるだけで手取りが分かります。「賞与に対する源泉徴収税額の算出率の表」（令和8年分）で所得税の率を引き、健康保険・厚生年金・雇用保険・子ども・子育て支援金の内訳と、標準賞与額の上限、住民税が引かれない理由まで表示。賞与20万〜200万円の早見表つき。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/shoyo-tedori/` },
  robots: robotsFor('shoyo-tedori'),
};

const yen = (v: number) => `${v.toLocaleString('ja-JP')}円`;
const manInt = (v: number) => `${Math.round(v / 10_000).toLocaleString('ja-JP')}万円`;

const table = shoyoTable();

const NTA_2523 = 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2523.htm';
const NTA_TABLE_2026 = 'https://www.nta.go.jp/publication/pamph/gensen/zeigakuhyo2026/data/15-16.pdf';
const NTA_TABLE_2027 = 'https://www.nta.go.jp/publication/pamph/gensen/zeigakuhyo2027/01.htm';

const faq = [
  {
    q: '賞与から住民税が引かれないのはなぜですか？',
    a: '会社員の住民税は、前年の所得にもとづく年税額を6月から翌年5月までの12回に分けて、毎月の給与から天引き（特別徴収）する仕組みだからです。賞与の分の住民税も前年の所得に含めて計算され、毎月の給与からの天引きに入っています。そのため賞与の明細には住民税の欄が無いか、0円になっています。',
  },
  {
    q: '所得税の率が前月の給与で決まるのはなぜですか？',
    a: '国税庁の「賞与に対する源泉徴収税額の算出率の表」は、前月の給与から社会保険料を引いた額と扶養親族等の数で率を引く形になっているからです。前月の給与が多いほど年収も多いと見込んで、累進課税に近い率を先に当てる考え方です。同じ賞与の額でも、前月に残業代が多かった人は率が高くなることがあります。最終的な年税額は年末調整で精算されるので、ここでの率は「仮の天引き」です。',
  },
  {
    q: '賞与の手取りが月給より少なく感じるのはなぜですか？',
    a: '賞与には住民税がかからない一方で、社会保険料は毎月の給与とほぼ同じ率（健康保険・厚生年金・雇用保険・子ども・子育て支援金で額面のおよそ15%）で引かれ、所得税も前月の給与で決まる率で引かれるからです。前月の給与が多い人ほど所得税の率が上がり、賞与の手取り率は下がります。額面の8割前後が目安です。',
  },
  {
    q: '賞与で多めに引かれた所得税は年末調整で戻りますか？',
    a: '戻ることがあります。賞与の源泉徴収は前月の給与から見込んだ仮の率で、1年分の所得税は12月の年末調整で確定します。賞与で引かれた額が年税額より多ければ差額が戻ります。2026年は令和8年度改正（基礎控除の引上げ）の減税分も、12月の年末調整でまとめて精算されます。戻る金額は年末調整 還付金 計算機で計算できます。',
  },
  {
    q: '2027年の算出率の表はいつ変わりますか？',
    a: '2027年1月1日以後に支払われる賞与から、令和9年分の算出率の表に切り替わります。国税庁は令和9年分の源泉徴収税額表を既に公表しています。このツールは令和8年分の表で計算しているので、2027年の夏賞与の前に表を差し替えます。',
  },
];

const trail = breadcrumbFor('shoyo-tedori');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '賞与（ボーナス）手取り計算機',
      url: `${SITE_URL}/shoyo-tedori/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('shoyo-tedori'),
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

      <h1>賞与（ボーナス）手取り計算機</h1>
      <p className="lead">
        賞与の額面と前月の給与を入れるだけで、賞与の手取りが分かります。所得税の率は国税庁の
        <strong>「賞与に対する源泉徴収税額の算出率の表」（{TABLE_YEAR_LABEL}）</strong>
        で、前月の給与と扶養の数から自動で引きます。会社員（協会けんぽ）の目安です。
      </p>

      <Calculator buildDate={new Date().toISOString()} />

      <AdUnit position="below-tool" />

      <h2>賞与の手取りは月給と計算のしかたが違う</h2>
      <ul>
        <li>
          <strong>社会保険料は「標準賞与額」にかかる</strong> —
          賞与の額の1,000円未満を切り捨てた額に、健康保険（協会けんぽ全国平均・本人負担
          {ratePercent(HEALTH_RATE)}）・厚生年金（{ratePercent(PENSION_RATE)}
          ）・子ども・子育て支援金の率を掛けます。月給のような等級表は使いません
        </li>
        <li>
          <strong>上限は月給とは別</strong> — 厚生年金は1か月150万円、健康保険は年度（4月〜翌3月）の累計573万円で頭打ちです
        </li>
        <li>
          <strong>雇用保険料は賞与の額そのもの</strong>に{ratePercent(EMPLOYMENT_RATE)}
          （一般の事業・労働者負担）を掛けます。切り捨ても上限もありません
        </li>
        <li>
          <strong>所得税は「前月の給与」で率が決まる</strong> —
          前月の給与から社会保険料を引いた額と扶養親族等の数で算出率の表の行を引き、（賞与 −
          社会保険料）× 率 を天引きします（1円未満切り捨て）
        </li>
        <li>
          <strong>住民税は引かれない</strong> —
          前年の所得ぶんが毎月の給与から天引きされているので、賞与からは引かれません
        </li>
      </ul>

      <h2>前月の給与を入れる理由</h2>
      <p>
        算出率の表は「前月の社会保険料等控除後の給与等の金額」で行を引きます。このツールは、入力された前月の給与（額面）から
        <strong>標準報酬月額（等級）を求め、それに率を掛けて前月の社会保険料を出します</strong>
        （雇用保険だけは額面に率を掛けます）。額面にそのまま率を掛けると、控除後の給与が表の行の境目をまたいで、
        適用される率が1段ずれることがあるためです。給与明細の数字を読み取って入れる必要はありません。
      </p>
      <p>
        前月に給与が無い場合や、賞与（社会保険料を引いた額）が前月の給与（同）の10倍を超える場合は、算出率の表ではなく月額表で計算する決まりです（
        <a href={NTA_2523} target="_blank" rel="noopener noreferrer">
          国税庁 No.2523
        </a>
        ）。このツールはその場合を判定して案内だけ出し、金額は出しません。
      </p>

      <h2>賞与の手取り早見表（前月の給与 {manInt(TABLE_PREV_SALARY)}のとき）</h2>
      <p>
        <strong>前月の給与 {yen(TABLE_PREV_SALARY)}</strong>
        ・40歳未満・協会けんぽ（全国平均）・今年度はじめての賞与の場合の目安です。所得税の率は前月の給与で変わるので、前月の給与が違う方は上の計算機で確かめてください。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>賞与（額面）</th>
              {TABLE_DEPENDENTS.map((d) => (
                <th key={d}>扶養{d}人</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.map((row) => (
              <tr key={row.bonus} style={{ whiteSpace: 'nowrap' }}>
                <th scope="row">{manInt(row.bonus)}</th>
                {row.nets.map((n, i) => (
                  <td key={i}>{n === null ? '—' : yen(n)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>このツールが扱わないこと</h2>
      <ul>
        <li>
          <strong>月額表で計算する場合</strong> —
          前月に給与が無い・前月の給与の10倍を超える賞与は、判定して案内するだけです
        </li>
        <li>
          <strong>都道府県別の健康保険料率</strong> —
          協会けんぽの全国平均で計算しています。組合健保・公務員共済の方は率が違います
        </li>
        <li>
          <strong>退職金・役員賞与</strong> — 税の仕組みが別です。退職金は
          <Link href="/taishokukin-tedori/">退職金 手取り計算機</Link>をお使いください
        </li>
        <li>
          <strong>会社が負担する保険料</strong> — 本人負担分だけを出しています
        </li>
      </ul>

      <h2>関連する計算</h2>
      <ul>
        <li>
          <Link href="/tedori-keisan/">手取り計算機</Link> — 年収（額面）から年間と月あたりの手取りを出します
        </li>
        <li>
          <Link href="/nenmatsu-chosei/">年末調整 還付金 計算機</Link> —
          賞与や毎月の給与で多めに引かれた所得税が、12月にいくら戻るかを計算します
        </li>
        <li>
          <Link href="/kosodate-shienkin/">子ども・子育て支援金 計算機</Link> —
          健康保険料に上乗せされている支援金だけの金額が分かります
        </li>
        <li>
          <Link href="/hatarakizon/">社会保険 損得計算機</Link> — 社会保険料の概算と、加入したときの手取りの変化を出します
        </li>
      </ul>

      <h2>よくある質問</h2>
      <dl>
        {faq.map((f) => (
          <div key={f.q} style={{ marginBottom: 16 }}>
            <dt style={{ fontWeight: 700, marginBottom: 4 }}>{f.q}</dt>
            <dd style={{ margin: 0 }}>{f.a}</dd>
          </div>
        ))}
      </dl>

      <AdUnit position="below-faq" />

      <RelatedTools current="shoyo-tedori" />

      <ToolMeta slug="shoyo-tedori" ymyl>
        本ツールの金額は概算の目安であり、税額・保険料額を保証するものではありません。所得税の率は
        <a href={NTA_TABLE_2026} target="_blank" rel="noopener noreferrer">
          国税庁「賞与に対する源泉徴収税額の算出率の表（令和8年分）」
        </a>
        、計算のしかたは
        <a href={NTA_2523} target="_blank" rel="noopener noreferrer">
          国税庁 タックスアンサー No.2523「賞与に対する源泉徴収」
        </a>
        、標準賞与額は
        <a
          href="https://www.nenkin.go.jp/service/kounen/hokenryo/hoshu/20150515-01.html"
          target="_blank"
          rel="noopener noreferrer"
        >
          日本年金機構
        </a>
        、保険料率は
        <a
          href="https://www.kyoukaikenpo.or.jp/about/business/insurance_rate/rate_prefectures/r08/index.html"
          target="_blank"
          rel="noopener noreferrer"
        >
          全国健康保険協会「令和8年度の都道府県毎の保険料率」
        </a>
        によります。令和8年度改正の源泉徴収への影響は
        <a
          href="https://www.nta.go.jp/users/gensen/2026kiso/index.htm"
          target="_blank"
          rel="noopener noreferrer"
        >
          国税庁「令和8年度税制改正による所得税の基礎控除の引上げ等について」
        </a>
        、2027年の表は
        <a href={NTA_TABLE_2027} target="_blank" rel="noopener noreferrer">
          国税庁「令和9年分 源泉徴収税額表」
        </a>
        をご確認ください。
      </ToolMeta>
    </>
  );
}
