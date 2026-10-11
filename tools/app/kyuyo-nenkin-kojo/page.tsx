import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';
import Calculator from './Calculator';
import { MOF_EXAMPLE, THRESHOLD_ROWS } from './tables';

const title = '給与と年金の控除 280万円上限 計算機｜2027年分から 働きながら年金の税金はいくら増える？';
const description =
  '2027年分（令和9年分）から、給与所得控除と公的年金等控除の合計が280万円を超えると、超えた分だけ年金の控除が削られます。給与と年金の年額・年齢を入れると、削られる控除と増える所得税・住民税の目安、上限にかかり始める給与を計算します。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/kyuyo-nenkin-kojo/` },
  robots: robotsFor('kyuyo-nenkin-kojo'),
};

const man = (v: number) => `${(Math.round(v / 1000) / 10).toLocaleString('ja-JP')}万円`;

const faq = [
  {
    q: '年金だけの人も影響がありますか？',
    a: '影響はありません。280万円の上限は、同じ年に給与の収入と公的年金等の収入の両方がある人だけにかかります。年金だけの人、給与だけの人の控除はこれまでと同じです。',
  },
  {
    q: '給与所得控除も減りますか？',
    a: '減りません。給与所得控除と公的年金等控除の合計が280万円を超えたとき、超えた部分を差し引くのは公的年金等控除のほうだけです（所得税法35条5項）。給与所得控除は改正前と同じ額のままです。',
  },
  {
    q: 'いつの税金から変わりますか？',
    a: '所得税は2027年分（令和9年分）からで、2027年1〜12月の給与と年金が対象です。確定申告は2028年2〜3月になります。住民税は前年の所得で計算するので、2027年の所得にかかる2028年度（令和10年度）分からです。所得税と住民税でかかる年がずれます。',
  },
  {
    q: '在職老齢年金で止まる額と合わせるといくらになりますか？',
    a: '在職老齢年金は「賃金と年金の月額の合計が基準額を超えると、年金そのものの一部が止まる」仕組みで、この280万円の上限は「年金にかかる税金が増える」仕組みです。別々に計算され、両方にかかる人もいます。止まる額は在職老齢年金 計算機で出し、このツールの増える税額と足して考えてください。',
  },
];

const trail = breadcrumbFor('kyuyo-nenkin-kojo');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '給与と年金の控除 280万円上限 計算機',
      url: `${SITE_URL}/kyuyo-nenkin-kojo/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('kyuyo-nenkin-kojo'),
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

      <h1>給与と年金の控除 280万円上限 計算機</h1>
      <p className="lead">
        2027年分（令和9年分）から、<strong>給与所得控除と公的年金等控除の合計が280万円を超えると、
        超えた分だけ年金の控除が削られます</strong>。給与と年金の年額を入れると、削られる控除と、
        増える所得税・住民税の目安、上限にかかり始める給与を計算します。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>対象は給与と年金の両方がある人だけ</h2>
      <p>
        令和8年度税制改正（所得税法等の一部を改正する法律・<strong>令和8年法律第12号</strong>）で、
        所得税法35条に5項が加わりました。同じ年に<strong>給与の収入と公的年金等の収入の両方がある人</strong>
        について、給与所得控除額と公的年金等控除額の合計が280万円を超えるときは、
        超える部分を公的年金等控除額から差し引きます。給与だけの人、年金だけの人は関係ありません。
      </p>
      <p>
        財務省の例では、65歳以上で給与{man(9_000_000)}・年金{man(2_000_000)}の人は、
        給与所得控除{man(MOF_EXAMPLE.before.salaryDeduction)}＋公的年金等控除
        {man(MOF_EXAMPLE.before.pensionDeduction)}＝{man(MOF_EXAMPLE.before.totalDeduction)}です。
        280万円を超える<strong>{man(MOF_EXAMPLE.cut)}</strong>を年金の控除から差し引き、
        公的年金等控除は{man(MOF_EXAMPLE.after.pensionDeduction)}になります。
      </p>

      <h2>削られるのは年金の控除だけ</h2>
      <p>
        給与所得控除は改正前と同じ額のままで、差し引かれるのは公的年金等控除だけです。
        削られた分だけ年金の雑所得が増え、合計所得金額も増えます。
        所得税・住民税は増えた所得に税率をかけた分だけ増えるのが基本ですが、
        所得税の基礎控除は合計所得489万円・655万円を境に段で小さくなるので、
        この線をまたぐと<strong>削られた額×税率より大きく</strong>増えることがあります。
        本ツールは改正前・改正後それぞれの合計所得で基礎控除を取り直して計算しています。
      </p>
      <p>
        給与と年金の両方がある人に最大10万円引かれる<strong>所得金額調整控除</strong>は、
        上限で削る前の年金の雑所得で判定します（租税特別措置法41条の3の11第4項6号）。
        削られたことで調整控除が増えたり減ったりはしません。
      </p>

      <h2>どこから上限にかかるか（年金額ごとの給与の線）</h2>
      <p>
        給与以外の所得がない場合に、上限にかかり始める給与収入の目安です（万円未満は切り上げ）。
        年金が多いほど年金の控除が大きくなるので、線は下がります。65歳未満で年金が少ない人は、
        給与所得控除の上限（195万円）と足しても280万円に届かず、給与がいくらでもかかりません。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ whiteSpace: 'nowrap' }}>
          <thead>
            <tr>
              <th>公的年金の年額</th>
              <th>65歳以上</th>
              <th>65歳未満</th>
            </tr>
          </thead>
          <tbody>
            {THRESHOLD_ROWS.map((row) => (
              <tr key={row.pension}>
                <td>{man(row.pension)}</td>
                <td>{row.over65 === null ? 'かからない' : `給与 ${man(row.over65)}超`}</td>
                <td>{row.under65 === null ? 'かからない' : `給与 ${man(row.under65)}超`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        年齢はその年の12月31日時点で判定します。給与所得が1,000万円を超えると年金の控除の表が変わるため、
        給与がとても多い人は表の値と違う結果になることがあります（計算機は入力どおりに計算します）。
      </p>

      <h2>在職老齢年金とは別の仕組み</h2>
      <p>
        「働くと年金が減る」という話には2つあります。<strong>在職老齢年金</strong>は、
        賃金と老齢厚生年金の月額の合計が基準額を超えると<strong>年金そのものの一部が止まる</strong>仕組みです。
        この280万円の上限は、年金の額は変わらず、<strong>年金にかかる税金が増える</strong>仕組みです。
        両方にかかる人もいます。
      </p>
      <PublicToolLink slug="zaishoku-rorei-nenkin">
        <p>
          止まる年金の額は
          <ToolLink slug="zaishoku-rorei-nenkin">在職老齢年金 計算機</ToolLink>
          で計算できます。
        </p>
      </PublicToolLink>

      <div className="note">
        本ツールの計算は目安です。所得控除は基礎控除だけで計算しているため、社会保険料控除や配偶者控除などがある方は、
        実際の税額や増える額はもっと小さくなります。確定申告の税額は、源泉徴収票の金額とすべての所得控除をもとに計算してください。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="kyuyo-nenkin-kojo" />

      <ToolMeta slug="kyuyo-nenkin-kojo" ymyl>
        出典：
        <a
          href="https://www.mof.go.jp/tax_policy/tax_reform/outline/fy2026/08taikou_gaiyou.htm"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          財務省「令和8年度税制改正の大綱の概要」
        </a>
        ／
        <a
          href="https://laws.e-gov.go.jp/law/340AC0000000033"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          e-Gov法令検索「所得税法」（35条4項・5項、28条）
        </a>
        ／
        <a
          href="https://laws.e-gov.go.jp/law/332AC0000000026"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          e-Gov法令検索「租税特別措置法」（41条の3の11・41条の15の3・41条の16の2）
        </a>
        ／
        <a
          href="https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1600.htm"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          国税庁 No.1600「公的年金等の課税関係」
        </a>
        にもとづき作成。上限は令和9年分（2027年）以後の所得税と、令和10年度（2028年度）以後の住民税に適用されます。
      </ToolMeta>
    </>
  );
}
