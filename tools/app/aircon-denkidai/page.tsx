import type { Metadata } from 'next';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import {
  DEFAULT_UNIT_PRICE,
  HEATING_PRESETS,
  HEATING_PRESETS_SOURCE,
  SETTING_TEMP_SAVING,
  SETTING_TEMP_SAVING_SOURCE,
  calcAirconCost,
  settingTempSavingYen,
} from '@/lib/aircon-denkidai';
import {
  SHIEN_CHECKED_ON,
  SHIEN_PERIODS,
  SHIEN_SOURCE_URL,
  billingMonthFor,
  formatYearMonth,
  shienPeriodLabel,
  unitPriceAfterShien,
} from '@/lib/denki-gas-shien';
import Calculator from './Calculator';
import ShienSection from './ShienSection';

// ここから下の文はビルドした日の内容で固まる（静的書き出し）。
// 期間を書いた言い回しにして、「現在」「今月」「いま」と書かない（docs/features/aircon-denkidai-fuyu-hojo.md の D）。
// 2027-05-01 の後の再リリースで、説明文から「電気代の補助」を外す

const title = 'エアコン電気代 計算機｜冷房・暖房の1時間・1日・1ヶ月分と電気代の補助の値引き';
const description = `エアコンの消費電力と使用時間から、冷房・暖房の電気代を1時間・1日・1ヶ月あたりで自動計算。6畳〜18畳の畳数プリセット付き。${shienPeriodLabel()}の電気代の補助（電気・ガス料金支援。低圧 1.0円／4.5円/kWh）の値引き後の額と、検針票の使用量から値引き額も出せます。`;

// 暖房の例：6畳用の暖房の定格消費電力で、1日8時間・30日
const HEAT6 = HEATING_PRESETS.find((p) => p.tatami === 6)!;
const heat6 = calcAirconCost({ watt: HEAT6.watt, hoursPerDay: 8, unitPrice: DEFAULT_UNIT_PRICE, daysPerMonth: 30 });
const PEAK = SHIEN_PERIODS.find((p) => p.lowVoltageYenPerKwh === Math.max(...SHIEN_PERIODS.map((x) => x.lowVoltageYenPerKwh)))!;
const heat6Shien = calcAirconCost({
  watt: HEAT6.watt,
  hoursPerDay: 8,
  unitPrice: unitPriceAfterShien(DEFAULT_UNIT_PRICE, PEAK.usageMonth),
  daysPerMonth: 30,
});
const fmt1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString('ja-JP', { maximumFractionDigits: 1 });
const fmt0 = (n: number) => Math.round(n).toLocaleString('ja-JP');
const shienRates = SHIEN_PERIODS.map(
  (p) => `${formatYearMonth(p.usageMonth)}使用分は${p.lowVoltageYenPerKwh.toFixed(1)}円/kWh`,
).join('、');
const firstUsage = SHIEN_PERIODS[0].usageMonth;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/aircon-denkidai/` },
  robots: robotsFor('aircon-denkidai'),
};

const faq = [
  {
    q: 'エアコンの暖房は1時間いくらですか？',
    a: `6畳用のエアコン（暖房の定格消費電力${HEAT6.watt}W）なら、${HEAT6.watt / 1000}kW × ${DEFAULT_UNIT_PRICE}円 = 1時間あたり約${fmt1(heat6.perHour)}円です。1日8時間・30日使うと約${fmt0(heat6.perMonth)}円/月になります。暖房は外気温が低いほど消費電力が増え、運転を始めた直後や真冬の朝は定格を超えることがあります（この機種は最大${HEAT6.maxWatt.toLocaleString('ja-JP')}W）。`,
  },
  {
    q: '電気代の補助（電気・ガス料金支援）はいつから・いくらですか？',
    a: `政府の電気・ガス料金支援で、${shienPeriodLabel()}の電気・都市ガスの料金が値引きされます。電気（低圧・一般家庭）の値引きは、${shienRates}です。「${formatYearMonth(firstUsage)}使用分」は原則${formatYearMonth(firstUsage)}中の検針日から翌月の検針日までの使用分なので、値引きが載るのは原則${formatYearMonth(billingMonthFor(firstUsage))}の請求からです。申請は不要で、電力会社が料金から自動で差し引きます。たとえば6畳用のエアコンの暖房を1日8時間・30日使うと、${formatYearMonth(PEAK.usageMonth)}使用分では約${fmt0(heat6.perMonth)}円が約${fmt0(heat6Shien.perMonth)}円になります（値引き約${fmt0(heat6.perMonth - heat6Shien.perMonth)}円）。`,
  },
  {
    q: 'エアコンはつけっぱなしとこまめに消すの、どちらが得ですか？',
    a: '外出が30分〜1時間程度の短時間ならつけっぱなしのほうが得なことが多いです。エアコンは起動直後に部屋を設定温度まで冷やす（暖める）ときに最も電力を使うため、短時間で入り切りを繰り返すとかえって電気代がかさみます。数時間以上の外出なら消したほうが節約になります。',
  },
  {
    q: '冷房と暖房では電気代はどちらが高いですか？',
    a: '一般に暖房のほうが高くなります。冷房は室温と設定温度の差が数度程度なのに対し、冬の暖房は外気温との差が大きく（例: 外気5度→室温20度）、その分多くの電力を消費するためです。カタログの定格消費電力は機種によって冷房と暖房のどちらが大きいかが違いますが、暖房は外気温が下がるほど消費電力が増え、真冬の朝や運転を始めた直後は定格を超えて運転することがあります。',
  },
  {
    q: 'エアコンの電気代を下げるコツはありますか？',
    a: `設定温度を控えめにする（冷房は高め・暖房は低め）のがいちばん効きます。${SETTING_TEMP_SAVING_SOURCE}の試算では、2.2kWのエアコンを1日9時間使う場合、${SETTING_TEMP_SAVING.cooling.condition}すると年間${SETTING_TEMP_SAVING.cooling.kwhPerYear}kWh（約${settingTempSavingYen('cooling').toLocaleString('ja-JP')}円）、${SETTING_TEMP_SAVING.heating.condition}すると年間${SETTING_TEMP_SAVING.heating.kwhPerYear}kWh（約${settingTempSavingYen('heating').toLocaleString('ja-JP')}円）の省エネになります（${DEFAULT_UNIT_PRICE}円/kWhで換算）。ほかに、フィルターを2週間に1回掃除する、室外機の周りに物を置かない、サーキュレーターで空気を循環させる、風量は「自動」にする、といった方法が効果的です。10年以上前の機種なら買い替えで大幅に安くなることもあります。`,
  },
  {
    q: '自分の電気料金単価はどうやって調べればいいですか？',
    a: '電力会社の検針票（電気ご使用量のお知らせ）やWeb会員ページで、契約プランの1kWhあたりの料金を確認できます。多くのプランは使用量に応じた3段階料金で、燃料費調整額や再エネ賦課金も加わります。ざっくり計算するなら、月の請求額を使用量（kWh)で割ると実質単価がわかります。',
  },
];

const trail = breadcrumbFor('aircon-denkidai');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'エアコン電気代 計算機',
      url: `${SITE_URL}/aircon-denkidai/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('aircon-denkidai'),
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

      <h1>エアコン電気代 計算機</h1>
      <p className="lead">
        エアコンの消費電力と使用時間から、冷房・暖房の1時間・1日・1ヶ月あたりの電気代の目安を計算します。部屋の広さ（畳数）から消費電力を選べます。使用月を選ぶと、{shienPeriodLabel()}の電気代の補助（電気・ガス料金支援）の値引き後の額も出ます。
      </p>

      <Calculator />

      <ShienSection />

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
        暖房の例：6畳用のエアコン（暖房の定格消費電力{HEAT6.watt}W）を1日8時間使うと、
        {HEAT6.watt / 1000}kW × 8h × {DEFAULT_UNIT_PRICE}円 = 約{fmt0(heat6.perDay)}円/日、30日で約
        {fmt0(heat6.perMonth)}円/月です。{formatYearMonth(PEAK.usageMonth)}使用分なら、電気・ガス料金支援の値引き（
        {PEAK.lowVoltageYenPerKwh.toFixed(1)}円/kWh）を引いた単価
        {unitPriceAfterShien(DEFAULT_UNIT_PRICE, PEAK.usageMonth)}円で約{fmt0(heat6Shien.perMonth)}円/月になります。
      </p>
      <p>
        単価のデフォルト31円/kWhは、全国家庭電気製品公正取引協議会が定める「電力料金目安単価」（2022年7月改定）です。実際の単価は契約している電力会社・プランや燃料費調整額によって異なるため、検針票などで確認して入力するとより正確になります。
      </p>

      <h2>実際の電気代は「定格×時間」よりも安くなることが多い</h2>
      <p>
        カタログに書かれている消費電力（定格消費電力）は、フルパワーで運転したときの値です。実際のエアコンはインバーター制御によって出力を細かく調整しており、部屋が設定温度に達したあとは定格の数分の一の電力で運転します。そのため、つけ始めは計算値に近く、安定運転中はずっと安くなるのが普通です。逆に、猛暑日や真冬など外気温との差が大きい日、断熱性の低い部屋では消費電力が増えます。本ツールの結果は「定格で動き続けた場合の上限に近い目安」として使ってください。
      </p>

      <div className="note">
        計算結果は目安です。実際の電気代は機種・設定温度・外気温・部屋の断熱性能・契約プラン（段階料金・燃料費調整額・再エネ賦課金）によって変わります。畳数プリセットの消費電力は、冷房は主要メーカーの冷房時の定格消費電力の目安、暖房はメーカーの公表する暖房時の定格消費電力です。
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

      <ToolMeta slug="aircon-denkidai" ymyl>
        電気料金の目安単価31円/kWhは、公益社団法人 全国家庭電気製品公正取引協議会が定める
        <a
          href="https://www.eftc.or.jp/qa/"
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          「電力料金目安単価」（令和4年7月22日改定）
        </a>
        にもとづきます。畳数別の消費電力は、冷房は主要メーカーの冷房時の定格消費電力の目安、暖房は
        <a href={HEATING_PRESETS_SOURCE.url} target="_blank" rel="nofollow noopener noreferrer">
          {HEATING_PRESETS_SOURCE.label}
        </a>
        の暖房の定格消費電力（{HEATING_PRESETS_SOURCE.checkedOn}確認）です。電気・ガス料金支援の値引き単価は
        <a href={SHIEN_SOURCE_URL} target="_blank" rel="nofollow noopener noreferrer">
          資源エネルギー庁「電気・ガス料金支援」
        </a>
        （{SHIEN_CHECKED_ON}確認）、設定温度1℃の省エネ効果は{SETTING_TEMP_SAVING_SOURCE}（2017）によります。
      </ToolMeta>
    </>
  );
}
