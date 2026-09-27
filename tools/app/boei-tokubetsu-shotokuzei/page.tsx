import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import {
  DEFENSE_START_YEAR,
  EXTENDED_YEARS,
  PHASES,
  RECONSTRUCTION_LAST_YEAR_AFTER,
  RECONSTRUCTION_LAST_YEAR_BEFORE,
  hayamihyo,
} from '@/lib/boei-tokubetsu-shotokuzei';
import Calculator from './Calculator';

const title = '防衛特別所得税 計算機・早見表｜2027年から所得税額の1%、手取りはいくら変わる？';
const description =
  '2027年1月から始まる防衛特別所得税（所得税額の1%）を年収から計算。同時に復興特別所得税が2.1%→1.1%に下がるため、2027年の手取りは変わりません。一方で2038年以降は新たな負担が続き、防衛特別所得税には終わりの定めがありません。年収300万〜1,500万円の早見表つき。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/boei-tokubetsu-shotokuzei/` },
  robots: robotsFor('boei-tokubetsu-shotokuzei'),
};

const yen = (v: number) => `${v.toLocaleString('ja-JP')}円`;
const manInt = (v: number) => `${Math.round(v / 10_000).toLocaleString('ja-JP')}万円`;
/** 千分率 → 「2.1%」 */
const pct = (permille: number) => (permille === 0 ? '—' : `${permille / 10}%`);

const table = hayamihyo();
const row500 = table.find((r) => r.gross === 5_000_000);

const Q_NTA_QA = 'https://www.nta.go.jp/publication/pamph/pdf/0026005-024_03.pdf';
const Q_ZEIGAKUHYO = 'https://www.nta.go.jp/publication/pamph/gensen/zeigakuhyo2027/01.htm';

const faq = [
  {
    q: '防衛特別所得税はいつから、いくらかかりますか？',
    a: `${DEFENSE_START_YEAR}年（令和9年）1月1日以後に生ずる所得から、所得税額（基準所得税額）の1%がかかります。給与なら2027年1月以後に支給される分からです。所得税を納めている人すべてが対象で、所得税がかからない人にはかかりません。${row500 ? `会社員・独身・扶養なしなら、年収500万円で年${yen(row500.defenseTax)}ほどです。` : ''}`,
  },
  {
    q: '2027年から手取りは減りますか？',
    a: `防衛特別所得税のせいで手取りが減ることはありません。防衛特別所得税（1%）の創設と同時に、復興特別所得税が2.1%から1.1%に引き下げられるため、所得税額に上乗せされる合計は改正前後とも2.1%（所得税額 × 102.1%）で変わりません。国税庁のQ&Aも「合計税率（2.1%）に変更はありません」と明記しています。`,
  },
  {
    q: '2027年1月から給与明細はどう変わりますか？',
    a: '給与から天引きされる所得税は、2027年1月支給分から「令和9年分 源泉徴収税額表」で計算されます。この税額表は所得税・防衛特別所得税・復興特別所得税を併せて源泉徴収するための表ですが、付加税の合計は102.1%のままなので、防衛特別所得税の創設による天引き額の変化はありません。ただし令和9年分の税額表には令和8年度改正の基礎控除の引上げ等も織り込まれているため、天引き額そのものは2026年と変わることがあります。それは防衛特別所得税ではなく、基礎控除の引上げ（減税）によるものです。給与明細の欄は「所得税」のまま、3つの税の合計額が記載されます。',
  },
  {
    q: '実際に負担が増えるのは、いつ・誰ですか？',
    a: `所得税を納めている人の負担が、${RECONSTRUCTION_LAST_YEAR_BEFORE + 1}年から増えます。改正前の復興特別所得税は${RECONSTRUCTION_LAST_YEAR_BEFORE}年で終わる予定でしたが、改正で${RECONSTRUCTION_LAST_YEAR_AFTER}年まで${EXTENDED_YEARS}年延長されました。そのため${RECONSTRUCTION_LAST_YEAR_BEFORE + 1}〜${RECONSTRUCTION_LAST_YEAR_AFTER}年は所得税額の2.1%（復興1.1%＋防衛1%）、${RECONSTRUCTION_LAST_YEAR_AFTER + 1}年以降も防衛特別所得税の1%が、改正前にはなかった負担として生じます。`,
  },
  {
    q: '防衛特別所得税に終わりはありますか？',
    a: '法律上の終わりの年は決まっていません。課税期間は「令和9年以後の当分の間」とされています。復興特別所得税のように「◯年まで」という期限がないため、このツールが出す「2038〜2047年の10年分の合計」は下限で、2048年以降も法律が変わらない限り毎年1%が続きます。',
  },
  {
    q: '住宅ローン控除を受けていると、防衛特別所得税はどうなりますか？',
    a: '少なくなります。防衛特別所得税は、住宅ローン控除などの税額控除を差し引いたあとの所得税額（基準所得税額）に1%を掛けて計算します。国税庁のQ&Aでも、年末調整の年税額は「算出所得税額から住宅借入金等特別控除額を控除した後の税額」に102.1%を掛けると説明されています。住宅ローン控除で所得税がゼロになっている人は、防衛特別所得税もゼロです。',
  },
  {
    q: '年末調整や確定申告で、防衛特別所得税を別に計算する必要はありますか？',
    a: 'ありません。年末調整は所得税・防衛特別所得税・復興特別所得税の合計額で行い、年税額は所得税額に102.1%を掛けて100円未満を切り捨てます。この求め方は令和8年分と令和9年分で変わりません。源泉徴収票の「源泉徴収税額」の欄にも3つの合計額が記載されます。',
  },
];

const trail = breadcrumbFor('boei-tokubetsu-shotokuzei');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '防衛特別所得税 計算機・早見表',
      url: `${SITE_URL}/boei-tokubetsu-shotokuzei/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('boei-tokubetsu-shotokuzei'),
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

      <h1>防衛特別所得税 計算機・早見表</h1>
      <p className="lead">
        {DEFENSE_START_YEAR}年1月から始まる<strong>防衛特別所得税</strong>
        （所得税額の1%）を年収から計算します。同時に復興特別所得税が2.1%→1.1%に下がるため、
        <strong>{DEFENSE_START_YEAR}年の手取りは変わりません</strong>
        。そのかわり、改正前なら終わっていた{RECONSTRUCTION_LAST_YEAR_BEFORE + 1}年以降の負担が新たに生じます。
      </p>

      <Calculator buildDate={new Date().toISOString()} />

      <AdUnit position="below-tool" />

      <h2>防衛特別所得税とは</h2>
      <p>
        令和8年度税制改正で創設された、所得税に上乗せされる税です。防衛力強化の財源を確保するための特別措置法（防衛財確法・令和5年法律第69号）に、所得税法等の一部を改正する法律（令和8年法律第12号）で加えられ、令和9年1月1日に施行されます。改正の中身は次の3つです。
      </p>
      <ul>
        <li>
          <strong>防衛特別所得税の創設</strong> —
          令和9年（{DEFENSE_START_YEAR}年）分以後、所得税額の<strong>1%</strong>。課税期間は「当分の間」で、
          <strong>終わりの年が決まっていません</strong>
        </li>
        <li>
          <strong>復興特別所得税の引下げ</strong> — 所得税額の2.1% → <strong>1.1%</strong>
        </li>
        <li>
          <strong>復興特別所得税の延長</strong> — 令和19年（{RECONSTRUCTION_LAST_YEAR_BEFORE}年）まで → 令和29年（
          {RECONSTRUCTION_LAST_YEAR_AFTER}年）まで、<strong>{EXTENDED_YEARS}年延長</strong>
        </li>
      </ul>
      <p>
        1%＋1.1%で、付加税の合計は改正前と同じ2.1%です。つまり
        <strong>「増税」と報じられても、{DEFENSE_START_YEAR}年〜{RECONSTRUCTION_LAST_YEAR_BEFORE}年の負担は1円も変わりません</strong>
        。負担が変わるのは、改正前なら復興特別所得税が終わっていた{RECONSTRUCTION_LAST_YEAR_BEFORE + 1}年以降です。
      </p>

      <h2>付加税の税率はいつ・どう変わるか</h2>
      <p>所得税額に上乗せされる付加税の税率です（改正前の法律のままだった場合との比較）。</p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>期間</th>
              <th>復興特別</th>
              <th>防衛特別</th>
              <th>合計（改正後）</th>
              <th>合計（改正前）</th>
            </tr>
          </thead>
          <tbody>
            {PHASES.map((p) => (
              <tr key={p.id} style={{ whiteSpace: 'nowrap' }}>
                <th scope="row">{p.label}</th>
                <td>{pct(p.after.reconstruction)}</td>
                <td>{pct(p.after.defense)}</td>
                <td>
                  <strong>{pct(p.after.total)}</strong>
                </td>
                <td>{pct(p.before.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        {RECONSTRUCTION_LAST_YEAR_AFTER + 1}
        年以降の防衛特別所得税1%には終わりの定めがありません（「当分の間」）。
      </p>

      <h2>年収別の早見表</h2>
      <p>
        会社員（協会けんぽ・40歳未満・独身・扶養なし・各種控除なし）の目安です。
        社会保険料は年収から概算し、令和9年分の控除（基礎控除・給与所得控除は令和8年分と同じ）で所得税額を出しています。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>年収（額面）</th>
              <th>防衛特別所得税（年額）</th>
              <th>{DEFENSE_START_YEAR}年の手取りの変化</th>
              <th>
                {RECONSTRUCTION_LAST_YEAR_BEFORE + 1}〜{RECONSTRUCTION_LAST_YEAR_AFTER}年の負担増（年額）
              </th>
              <th>{RECONSTRUCTION_LAST_YEAR_AFTER + 1}年以降の負担増（年額）</th>
            </tr>
          </thead>
          <tbody>
            {/* 5列あるので、狭い画面では金額が桁の途中で折り返す。
                折り返さずに親の overflow-x でスクロールさせる */}
            {table.map((row) => (
              <tr key={row.gross} style={{ whiteSpace: 'nowrap' }}>
                <th scope="row">{manInt(row.gross)}</th>
                <td>{yen(row.defenseTax)}</td>
                <td>{row.change2027 === 0 ? '±0円' : yen(row.change2027)}</td>
                <td>+{yen(row.annual2038)}</td>
                <td>+{yen(row.annual2048)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        同じ年収・同じ控除が続いた場合の目安です。将来の年の額は、その年の控除や税率が今と同じだと置いて出しています。
        {RECONSTRUCTION_LAST_YEAR_BEFORE + 1}〜{RECONSTRUCTION_LAST_YEAR_AFTER}
        年の負担増を{EXTENDED_YEARS}年分足した額は<strong>下限</strong>で、
        {RECONSTRUCTION_LAST_YEAR_AFTER + 1}年以降も防衛特別所得税の1%が続きます。
      </p>

      <h2>計算式と法的根拠</h2>
      <ol>
        <li>給与収入 − 給与所得控除 ＝ 給与所得</li>
        <li>給与所得 − 所得控除（社会保険料控除・基礎控除・扶養控除など）＝ 課税所得（1,000円未満切捨て）</li>
        <li>課税所得 × 税率 − 控除額（速算表）＝ 所得税額</li>
        <li>
          所得税額 − 税額控除（住宅ローン控除など）＝ <strong>基準所得税額</strong>
        </li>
        <li>
          基準所得税額 × 1% ＝ 防衛特別所得税、× 1.1% ＝ 復興特別所得税。
          <strong>端数は3つの税の合計額で計算</strong>し、年税額は 基準所得税額 × 102.1%（100円未満切捨て）
        </li>
      </ol>
      <p>
        防衛特別所得税と復興特別所得税は<strong>同じ基準所得税額</strong>
        に掛かります。防衛財確法5条の6は基準所得税額を、復興財確法と同じく「所得税法その他の所得税の税額の計算に関する法令の規定により計算した所得税の額」と定めていて、税率は5条の9で「百分の一」、課税は5条の5で「当分の間」とされています。国税庁のQ&Aは、年末調整の年税額を「算出所得税額から住宅借入金等特別控除額を控除した後の税額」×102.1%とし、令和8年分と令和9年分で求め方に変更はないとしています。そのため、住宅ローン控除がある人でも「差し引きゼロ」は崩れません。
      </p>
      <p>
        給与の源泉徴収では、
        <a href={Q_ZEIGAKUHYO} target="_blank" rel="noopener noreferrer">
          令和9年分 源泉徴収税額表
        </a>
        が「所得税、防衛特別所得税及び復興特別所得税を併せて源泉徴収する際に使用するもの」として公表されています。
        同じ冊子の電算機計算の特例（令和8年4月30日財務省告示第128号）では、税額の算式が「課税給与所得金額 × 5.105%」「× 10.210%」…と、
        <strong>所得税の税率 × 102.1%</strong>
        になっていて、合計2.1%が改正前と同じであることが税額表からも確認できます。
      </p>

      <h2>このツールが扱わないこと</h2>
      <ul>
        <li>
          <strong>住民税・社会保険料を含めた手取りの計算</strong> —
          防衛特別所得税は所得税にだけ上乗せされ、住民税には関係しません。手取り全体は{' '}
          <Link href="/tedori-keisan/">手取り計算機</Link> で計算できます
        </li>
        <li>
          <strong>細かい控除</strong> —
          配偶者控除・生命保険料控除・iDeCo・住宅ローン控除などは入れていません。これらがある人は防衛特別所得税も少なくなります
        </li>
        <li>
          <strong>給与以外の所得</strong> —
          事業所得・不動産所得・株式の配当や譲渡益にかかる所得税にも防衛特別所得税は上乗せされますが、このツールは給与所得だけを計算します
        </li>
        <li>
          <strong>法人税・たばこ税</strong> —
          防衛財源にはほかに法人税の付加税とたばこ税の引上げがありますが、個人の所得税とは別の税です
        </li>
      </ul>

      <h2>関連する計算</h2>
      <ul>
        <li>
          <Link href="/tabako-zei-neage/">たばこ値上げ早見表・負担額計算</Link> —
          防衛財源のもう1本。たばこ税は2027年4月から3回に分けて上がります
        </li>
        <li>
          <Link href="/tedori-keisan/">手取り計算機</Link> —
          年収から手取りと、2026年の基礎控除引上げで増える額を出します
        </li>
        <li>
          <Link href="/nenmatsu-chosei/">年末調整 還付金 計算機</Link> —
          控除を細かく入れて所得税額を出せます
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

      <RelatedTools current="boei-tokubetsu-shotokuzei" />

      <ToolMeta slug="boei-tokubetsu-shotokuzei" ymyl>
        本ツールの金額は概算の目安であり、税額を保証するものではありません。制度の内容は
        <a href={Q_NTA_QA} target="_blank" rel="noopener noreferrer">
          国税庁「防衛特別所得税及び復興特別所得税（源泉徴収関係）Ｑ＆Ａ」（令和8年5月）
        </a>
        、
        <a href={Q_ZEIGAKUHYO} target="_blank" rel="noopener noreferrer">
          国税庁「令和9年分 源泉徴収税額表」
        </a>
        、
        <a
          href="https://www.nta.go.jp/users/gensen/2026kiso/index.htm"
          target="_blank"
          rel="noopener noreferrer"
        >
          国税庁「令和8年度税制改正による所得税の基礎控除の引上げ等について」
        </a>
        によります。
      </ToolMeta>
    </>
  );
}
