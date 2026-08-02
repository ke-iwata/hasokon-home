import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import RelatedTools from '@/app/RelatedTools';
import Calculator from './Calculator';

const title = 'エアコン電気代 計算機｜1時間・1日・1ヶ月分をすぐ計算';
const description =
  'エアコンの消費電力と使用時間から電気代を自動計算。6畳〜18畳の畳数プリセット付きで、1時間・1日・1ヶ月あたりの電気代の目安がすぐわかります。単価は目安単価31円/kWh対応。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/aircon-denkidai/` },
};

const faq = [
  {
    q: 'エアコンはつけっぱなしとこまめに消すの、どちらが得ですか？',
    a: '外出が30分〜1時間程度の短時間ならつけっぱなしのほうが得なことが多いです。エアコンは起動直後に部屋を設定温度まで冷やす（暖める）ときに最も電力を使うため、短時間で入り切りを繰り返すとかえって電気代がかさみます。数時間以上の外出なら消したほうが節約になります。',
  },
  {
    q: '冷房と暖房では電気代はどちらが高いですか？',
    a: '一般に暖房のほうが高くなります。冷房は室温と設定温度の差が数度程度なのに対し、冬の暖房は外気温との差が大きく（例: 外気5度→室温20度）、その分多くの電力を消費するためです。同じ機種でも暖房時の定格消費電力は冷房時より大きいのが普通です。',
  },
  {
    q: 'エアコンの電気代を下げるコツはありますか？',
    a: '設定温度を控えめにする（冷房は高め・暖房は低め、1度の変更で約10%の省エネ）、フィルターを2週間に1回掃除する、室外機の周りに物を置かない、サーキュレーターで空気を循環させる、風量は「自動」にする、といった方法が効果的です。10年以上前の機種なら買い替えで大幅に安くなることもあります。',
  },
  {
    q: '自分の電気料金単価はどうやって調べればいいですか？',
    a: '電力会社の検針票（電気ご使用量のお知らせ）やWeb会員ページで、契約プランの1kWhあたりの料金を確認できます。多くのプランは使用量に応じた3段階料金で、燃料費調整額や再エネ賦課金も加わります。ざっくり計算するなら、月の請求額を使用量（kWh)で割ると実質単価がわかります。',
  },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'エアコン電気代 計算機',
      url: `${SITE_URL}/aircon-denkidai/`,
      applicationCategory: 'UtilitiesApplication',
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

      <h1>エアコン電気代 計算機</h1>
      <p className="lead">
        エアコンの消費電力と使用時間から、1時間・1日・1ヶ月あたりの電気代の目安を計算します。部屋の広さ（畳数）から消費電力を選ぶこともできます。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      <h2>エアコンの電気代の計算方法</h2>
      <p>電気代は次の式で計算できます。</p>
      <p>
        <strong>電気代（円） = 消費電力（W） ÷ 1000 × 使用時間（h） × 電気料金単価（円/kWh）</strong>
      </p>
      <p>
        たとえば消費電力660Wのエアコンを1日8時間使うと、0.66kW × 8h × 31円 =
        約164円/日、30日で約4,910円/月になります。
      </p>
      <p>
        単価のデフォルト31円/kWhは、全国家庭電気製品公正取引協議会が定める「電力料金目安単価」（2022年7月改定）です。実際の単価は契約している電力会社・プランや燃料費調整額によって異なるため、検針票などで確認して入力するとより正確になります。
      </p>

      <h2>実際の電気代は「定格×時間」よりも安くなることが多い</h2>
      <p>
        カタログに書かれている消費電力（定格消費電力）は、フルパワーで運転したときの値です。実際のエアコンはインバーター制御によって出力を細かく調整しており、部屋が設定温度に達したあとは定格の数分の一の電力で運転します。そのため、つけ始めは計算値に近く、安定運転中はずっと安くなるのが普通です。逆に、猛暑日や真冬など外気温との差が大きい日、断熱性の低い部屋では消費電力が増えます。本ツールの結果は「定格で動き続けた場合の上限に近い目安」として使ってください。
      </p>

      <div className="note">
        計算結果は目安です。実際の電気代は機種・設定温度・外気温・部屋の断熱性能・契約プラン（段階料金・燃料費調整額・再エネ賦課金）によって変わります。畳数プリセットの消費電力は主要メーカーの冷房時の定格消費電力の目安であり、暖房時はこれより大きくなるのが一般的です。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <AdUnit position="below-faq" />

      <RelatedTools current="aircon-denkidai" />
    </>
  );
}
