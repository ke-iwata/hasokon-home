import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { DEFENSE_START_YEAR } from '@/lib/boei-tokubetsu-shotokuzei';
import { calcHoshu, combinedRatePercent, INCOME_TAX, withholding, type HoshuOptions } from '@/lib/gensen-hoshu';
import Calculator from './Calculator';

const title = '報酬の源泉徴収税額 計算（10.21%・20.42%）｜請求額⇄振込額、消費税・100万円超・2027年からの内訳';
const description =
  '原稿料・講演料・デザイン料・士業の報酬から源泉徴収税額（10.21%、100万円超の部分は20.42%）と差引の振込額を計算。手取りから請求額の逆算、消費税を区分する／しないの差、司法書士の1万円控除、2027年1月からの内訳（防衛特別所得税1%＋復興特別所得税1.1%）まで。請求書の書き方をコピーできます。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/gensen-hoshu/` },
  robots: robotsFor('gensen-hoshu'),
};

const yen = (v: number) => `${v.toLocaleString('ja-JP')}円`;
const man = (v: number) => `${(v / 10_000).toLocaleString('ja-JP')}万円`;

/** 本文の例はすべて lib から作る（額を手で書かない。docs/features/thin-tool-content.md） */
const base: HoshuOptions = { taxMode: 'exclusive', kind: 'normal', paidOn: `${DEFENSE_START_YEAR}-01-15` };
const r10 = combinedRatePercent(INCOME_TAX.basePermille, DEFENSE_START_YEAR);
const r20 = combinedRatePercent(INCOME_TAX.overPermille, DEFENSE_START_YEAR);
const ex = calcHoshu(110_000, base);
const exUnsep = calcHoshu(ex.gross, { ...base, taxMode: 'inclusiveUnseparated' });
const ex120 = withholding(1_200_000);
const exShiho = withholding(50_000, 'shihoshoshi');
const TABLE_FEES = [10_000, 30_000, 50_000, 100_000, 300_000, 500_000, 1_000_000, 1_500_000, 2_000_000];

const Q_2795 = 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2795.htm';
const Q_2798 = 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2798.htm';
const Q_2792 = 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2792.htm';
const Q_NTA_QA = 'https://www.nta.go.jp/publication/pamph/pdf/0026005-024_03.pdf';
const Q_ZEIGAKUHYO = 'https://www.nta.go.jp/publication/pamph/gensen/zeigakuhyo2027/01.htm';
const Q_EGOV = 'https://laws.e-gov.go.jp/law/340AC0000000033';
const Q_EGOV_REI = 'https://laws.e-gov.go.jp/law/340CO0000000096';

const faq = [
  {
    q: 'インボイス（適格請求書）を出すと、源泉徴収の計算は変わりますか？',
    a: '変わりません。国税庁は、請求書等で報酬の額と消費税等の額が明確に区分されていれば報酬の額だけを源泉徴収の対象としてよいとしていて、インボイス制度の開始後もこの取扱いは変わらないと明記しています。インボイスは消費税の額を書く書類なので、ふつうは区分して書くことになり、税抜の報酬額に源泉します。',
  },
  {
    q: '源泉徴収した税金はいつまでに納めますか？',
    a: '原則として、支払った月の翌月10日までに納めます。原稿料・講演料など（タックスアンサー No.2795）は納期の特例の対象になりません。弁護士・税理士・司法書士などの報酬（No.2798）は、支払う側が納期の特例を受けていれば、1〜6月の支払分を7月10日、7〜12月の支払分を翌年1月20日に納めます。',
  },
  {
    q: '支払調書はどう書きますか？',
    a: '「報酬、料金、契約金及び賞金の支払調書」の源泉徴収税額の欄には、所得税・防衛特別所得税・復興特別所得税の合計額を書きます（国税庁 Q&A Q16）。2027年以後も欄は1つで、内訳を分けて書く必要はありません。',
  },
  {
    q: '源泉徴収された分は、確定申告で戻ってきますか？',
    a: '受け取った側は、源泉徴収された税額を確定申告で精算します。1年の所得税（復興特別所得税・2027年以後は防衛特別所得税も含む）が源泉徴収された合計より少なければ、差額が還付されます。多ければ不足分を納めます。',
  },
  {
    q: '振込手数料を差し引いて振り込むとき、源泉はどうなりますか？',
    a: '源泉徴収税額は報酬の額から計算し、振込手数料を引く前の額で決まります。手数料を受け取る側の負担にする取り決めなら、差引の振込額からさらに手数料を引いて振り込みます。手数料を差し引いた額を元に源泉を計算し直す必要はありません。',
  },
];

const trail = breadcrumbFor('gensen-hoshu');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '報酬の源泉徴収税額 計算',
      url: `${SITE_URL}/gensen-hoshu/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('gensen-hoshu'),
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

      <h1>報酬の源泉徴収税額 計算（10.21%・20.42%）</h1>
      <p className="lead">
        報酬から<strong>源泉徴収税額</strong>と<strong>振込額</strong>を出します（手取りからの逆算も）。
        給与ではなく報酬の側の計算です（給与は <Link href="/gensen-choshuhyo/">源泉徴収票の検算</Link> へ）。
      </p>

      <Calculator buildDate={new Date().toISOString()} />

      <AdUnit position="below-tool" />

      <h2>源泉徴収の計算のしかた</h2>
      <ul>
        <li>
          1回に支払う額が{man(INCOME_TAX.threshold)}以下：<strong>支払額 × {r10}%</strong>
        </li>
        <li>
          {man(INCOME_TAX.threshold)}を超える部分：<strong>× {r20}%</strong>
          （{man(INCOME_TAX.threshold)}までは {r10}%）
        </li>
        <li>
          司法書士・土地家屋調査士・海事代理士：<strong>（支払額 − {yen(INCOME_TAX.shihoshoshiDeduction)}）× {r10}%</strong>
        </li>
        <li>1円未満の端数は切り捨て</li>
      </ul>
      <p>
        たとえば120万円なら、100万円までが {r10}%・残りの20万円が {r20}% で {yen(ex120)}、司法書士への5万円なら {yen(exShiho)}{' '}
        です。{r10}% は所得税の10%に、所得税額の2.1%の付加税を足した率（10% × 102.1%）です。
      </p>
      <p className="note">
        {man(INCOME_TAX.threshold)}は<strong>同じ人に1回に支払う額</strong>で判定します。月ごとの支払なら、その月に払う額で見ます。
      </p>

      <h2>早見表（税抜の報酬額・消費税は区分して記載）</h2>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>報酬（税抜）</th>
              <th>消費税（10%）</th>
              <th>源泉徴収税額</th>
              <th>差引の振込額</th>
            </tr>
          </thead>
          <tbody>
            {TABLE_FEES.map((fee) => {
              const row = calcHoshu(fee, base);
              return (
                <tr key={fee} style={{ whiteSpace: 'nowrap' }}>
                  <th scope="row">{yen(fee)}</th>
                  <td>{yen(row.consumptionTax)}</td>
                  <td>{yen(row.withholding)}</td>
                  <td>{yen(row.net)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>消費税を分けて書くと源泉が減る</h2>
      <p>
        報酬の額と消費税の額を請求書で<strong>はっきり分けて書いていれば、報酬の額だけに源泉</strong>
        してよいことになっています（タックスアンサー No.2795）。分けていなければ税込額が対象です。
        税抜{yen(ex.fee)}の仕事なら、分けて書くと源泉は {yen(ex.withholding)}、税込{yen(exUnsep.gross)}
        のまま書くと {yen(exUnsep.withholding)} で、{yen(exUnsep.withholding - ex.withholding)} の差が出ます。
      </p>
      <p className="note">
        消費税率は10%で計算しています。報酬・料金に8%の軽減税率が当たる場面はまずありませんが、8%のときは「税込」で入れれば計算できます。
      </p>

      <h2>{DEFENSE_START_YEAR}年1月から何が変わるか — 率は同じ、内訳が変わる</h2>
      <p>
        {DEFENSE_START_YEAR}年（令和9年）1月1日以後に生ずる所得からは、所得税を源泉徴収するときに
        <strong>防衛特別所得税（所得税額の1%）</strong>を併せて徴収し、<strong>復興特別所得税は2.1% → 1.1%</strong>
        に下がります。合計は2.1%のままなので、<strong>報酬の源泉は{DEFENSE_START_YEAR}年以後も {r10}%（100万円超の部分は {r20}%）</strong>
        です（国税庁 Q&A Q5）。
      </p>
      <p>
        変わるのは呼び方です。これまでの「所得税及び復興特別所得税」が「所得税、防衛特別所得税及び復興特別所得税」になります。
        請求書や支払調書の注記に「復興特別所得税を含む」と書いていたなら、2027年分からは書き方を見直しましょう。
        納付書・支払調書には3つの合計額を1つの欄に書きます。
      </p>
      <p className="note">
        12月分の請求書を1月に払う場合、このツールは<strong>支払日</strong>（源泉徴収する日）で内訳を分けます。
        報酬・料金をどの日で判定するかは国税庁の説明を確認中ですが、<strong>源泉徴収税額（合計）はどちらでも同じ</strong>です。
        給与の側の同じ改正は <Link href="/boei-tokubetsu-shotokuzei/">防衛特別所得税 計算機</Link> で扱っています。
      </p>

      <h2>源泉徴収が必要な報酬・不要な報酬</h2>
      <p>源泉徴収が必要なのは、<strong>個人に</strong>次のような報酬を払う場合です（タックスアンサー No.2792）。</p>
      <ul>
        <li>原稿料・講演料・デザイン料・イラスト料・翻訳料など</li>
        <li>弁護士・税理士・公認会計士・社会保険労務士・司法書士など、特定の資格を持つ人への報酬</li>
        <li>モデル・プロスポーツ選手・芸能人の出演料など</li>
      </ul>
      <p>次の場合は、原則として源泉徴収はいりません。</p>
      <ul>
        <li>
          <strong>法人に払う場合</strong>（株式会社・税理士法人など）。一部の例外（馬主に払う競馬の賞金など）を除きます
        </li>
        <li>
          <strong>支払う側が源泉徴収義務者でない個人</strong>の場合（給与を払っていない個人や、常時2人以下の家事使用人だけに給与を払っている個人）
        </li>
      </ul>
      <p className="note">
        このツールは外交員報酬・ホステス等の報酬・契約金・賞金・非居住者への支払は扱っていません（控除や税率が違います）。
      </p>

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

      <RelatedTools current="gensen-hoshu" />

      <ToolMeta slug="gensen-hoshu" ymyl>
        本ツールは一般的な計算方法による目安で、個別の税務相談に当たるものではありません。実際の取扱いは税務署・税理士にご確認ください。制度の内容は
        <a href={Q_2795} target="_blank" rel="noopener noreferrer">
          国税庁 タックスアンサー No.2795
        </a>
        、
        <a href={Q_2798} target="_blank" rel="noopener noreferrer">
          No.2798
        </a>
        、
        <a href={Q_2792} target="_blank" rel="noopener noreferrer">
          No.2792
        </a>
        、
        <a href={Q_NTA_QA} target="_blank" rel="noopener noreferrer">
          国税庁「防衛特別所得税及び復興特別所得税（源泉徴収関係）Ｑ＆Ａ」（令和8年5月）
        </a>
        、
        <a href={Q_ZEIGAKUHYO} target="_blank" rel="noopener noreferrer">
          国税庁「令和9年分 源泉徴収税額表」
        </a>
        、
        <a href={Q_EGOV} target="_blank" rel="noopener noreferrer">
          e-Gov 法令検索 所得税法（204条・205条）
        </a>
        、
        <a href={Q_EGOV_REI} target="_blank" rel="noopener noreferrer">
          所得税法施行令（322条）
        </a>
        によります。
      </ToolMeta>
    </>
  );
}
