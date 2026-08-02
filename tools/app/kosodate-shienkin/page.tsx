import type { Metadata } from 'next';
import { FISCAL_YEARS } from '@/lib/kosodate-shienkin';
import { SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import RelatedTools from '@/app/RelatedTools';
import Calculator from './Calculator';

const title = '子ども・子育て支援金 計算機｜月いくら引かれる？【2026年】';
const description =
  '「独身税」とも呼ばれる子ども・子育て支援金が給与からいくら天引きされるかを無料で計算。月収と賞与を入れるだけで2026・2027・2028年度の負担額がわかります。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/kosodate-shienkin/` },
};

const faq = [
  {
    q: '子ども・子育て支援金はいつから引かれますか？',
    a: '2026年（令和8年）4月分の保険料から徴収が始まりました。給与天引きは会社の徴収方法により2026年4月または5月支給分からです。健康保険料と合わせて徴収されるため、給与明細では健康保険料の内訳として表示される場合があります。',
  },
  {
    q: '支援金の計算方法は？',
    a: '被用者保険（会社員・公務員）の場合、「標準報酬月額 × 支援金率」で計算されます。2026年度の支援金率は全国一律0.23%で、労使折半のため本人負担はその半分（0.115%）です。賞与からも「標準賞与額 × 支援金率」の半分が徴収されます。',
  },
  {
    q: 'なぜ「独身税」と呼ばれているのですか？',
    a: '正式名称は「子ども・子育て支援金」で、独身者だけでなく子育て世帯を含む全ての医療保険加入者が負担します。児童手当などの給付を受けない独身者・子どものいない世帯にとっては負担のみが発生するため、通称として「独身税」と呼ばれるようになりました。',
  },
  {
    q: '今後、負担額は増えますか？',
    a: '増えます。支援金の総額は2026年度6,000億円 → 2027年度8,000億円 → 2028年度1兆円と段階的に引き上げられる計画で、政府試算では2028年度の支援金率は0.4%（本人負担0.2%）程度になる見込みです。',
  },
  {
    q: '支払わない・免除される方法はありますか？',
    a: '医療保険料と一体で徴収されるため、医療保険の加入者である限り原則として拒否できません。産前産後休業・育児休業中の保険料免除など、健康保険料の免除制度が適用される場合は支援金も免除されます。',
  },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '子ども・子育て支援金 計算機',
      url: `${SITE_URL}/kosodate-shienkin/`,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
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
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

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
          background: '#eef2ff',
          padding: 12,
          borderRadius: 10,
        }}
      >
        標準報酬月額 × 支援金率 ÷ 2（労使折半） ＝ 毎月の本人負担額
      </p>
      <table>
        <thead>
          <tr>
            <th>年度</th>
            <th>支援金率</th>
            <th>本人負担率</th>
            <th>状態</th>
          </tr>
        </thead>
        <tbody>
          {FISCAL_YEARS.map((y) => (
            <tr key={y.fiscalYear}>
              <td>
                {y.era}（{y.fiscalYear}年度）
              </td>
              <td>{(y.rate * 100).toFixed(2)}%</td>
              <td>{((y.rate / 2) * 100).toFixed(3)}%</td>
              <td>{y.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="note">
        2027年度・2028年度の率は政府の計画・試算にもとづく見込み値です。確定次第、本ページのデータを更新します。実際の給与では健康保険料と合算して端数処理されるため、表示額と±1円程度の差が出ることがあります。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="kosodate-shienkin" />

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        出典：
        <a
          href="https://www.cfa.go.jp/policies/kodomokosodateshienkinseido"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          こども家庭庁「子ども・子育て支援金制度について」
        </a>
        ほか公的資料にもとづき作成（最終更新：2026年7月）。
      </p>
    </>
  );
}
