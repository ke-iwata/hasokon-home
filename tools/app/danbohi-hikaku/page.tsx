import type { Metadata } from 'next';
import Link from 'next/link';
import { robotsFor, SITE_URL } from '@/lib/registry';
import AdUnit from '@/app/AdUnit';
import { breadcrumbFor, breadcrumbList, PUBLISHER_REF, toolUpdatedAt } from '@/lib/jsonld';
import Breadcrumb from '@/app/Breadcrumb';
import RelatedTools from '@/app/RelatedTools';
import ToolMeta from '@/app/ToolMeta';
import { DEFAULT_UNIT_PRICE } from '@/lib/aircon-denkidai';
import {
  SHIEN_CHECKED_ON,
  SHIEN_PERIODS,
  SHIEN_SOURCE_URL,
  formatYearMonth,
  shienPeriodLabel,
  shienPhase,
} from '@/lib/denki-gas-shien';
import { FUEL_PRICES, formatDateJa } from '@/lib/gasoline-dai';
import {
  CITY_GAS_13A_MJ_PER_M3,
  HEAT_VALUE_SOURCE,
  KEROSENE_MJ_PER_L,
  LPG_MJ_PER_KG,
  LPG_M3_PER_KG,
  LPG_MJ_PER_M3,
  calcRow,
  formatNum,
  formatYen,
  gasM3PerHour,
  heatUnitTable,
  perLiterFrom18L,
  type Prices,
} from '@/lib/danbohi-hikaku';
import Calculator from './Calculator';

// ここから下の文はビルドした日の内容で固まる（静的書き出し）。期間を書いた言い回しにして「現在」「今月」と書かない。
// 支援の段階はビルド日で書き分ける。2027-03-01 と 2027-05-01 の後に tools を再リリースして差し替える
// （docs/features/danbohi-hikaku.md「季節が終わったあと」）
const phase = shienPhase(new Date());
const period = shienPeriodLabel();
const peak = SHIEN_PERIODS.reduce((a, b) => (b.lowVoltageYenPerKwh > a.lowVoltageYenPerKwh ? b : a));
const lastUsage = SHIEN_PERIODS[SHIEN_PERIODS.length - 1].usageMonth;

const title = '暖房費 比較 計算機｜エアコン・灯油・ガス・電気ストーブの1時間・1か月の額';
const description =
  phase === 'active'
    ? `エアコン・石油ファンヒーター・ガスファンヒーター（都市ガス／LPガス）・電気ストーブ・こたつの暖房費を、カタログの値と自分の単価で1時間・1日・1か月で比較。灯油は都道府県の店頭価格（資源エネルギー庁）、電気・都市ガスは${period}の値引きを使用月で反映。`
    : 'エアコン・石油ファンヒーター・ガスファンヒーター（都市ガス／LPガス）・電気ストーブ・こたつの暖房費を、カタログの値と自分の単価で1時間・1日・1か月で比較。灯油は都道府県の店頭価格（資源エネルギー庁）を既定に。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/danbohi-hikaku/` },
  robots: robotsFor('danbohi-hikaku'),
};

// 本文の例（額は lib から作る。手で書かない）
const examplePrices: Prices = {
  electricity: DEFAULT_UNIT_PRICE,
  kerosenePerLiter: perLiterFrom18L(FUEL_PRICES.kerosene18L),
  cityGas: null,
  lpg: null,
  cityGasMj: CITY_GAS_13A_MJ_PER_M3,
  lpgMj: LPG_MJ_PER_M3,
};
const exUsage = { hoursPerDay: 8, daysPerMonth: 30, usageMonth: null };
const exFan = calcRow({ kind: 'kerosene', litersPerHour: 0.25, watt: 10 }, examplePrices, exUsage);
const fanElecMonth = exFan.ok ? exFan.electricityMonthAfter : 0;
const keroPerL = perLiterFrom18L(FUEL_PRICES.kerosene18L);
const heatTable = heatUnitTable(examplePrices, null, 3);
const heatOf = (label: string) => heatTable.find((h) => h.label === label)?.yenPerKwhHeat ?? 0;

const shienFaq =
  phase === 'active'
    ? `電気・都市ガスには${period}の値引き（電気・ガス料金支援）がありますが、灯油には別の制度（燃料油価格の激変緩和措置）があり、値引きは店頭価格にすでに入っています。なので灯油の単価から支援の額を引く必要はありません。LP ガス（プロパン）は国の電気・ガス料金支援の対象外です。この計算機では、使用月を選ぶと電気・都市ガスの行にだけ値引きを反映します（${formatYearMonth(peak.usageMonth)}使用分は電気 ${peak.lowVoltageYenPerKwh.toFixed(1)}円/kWh・都市ガス ${peak.cityGasYenPerM3.toFixed(1)}円/㎥）。お住まいの自治体が独自に LP ガス・灯油を支援していることもあるので、自治体の案内も見てください。`
    : phase === 'ended'
      ? `電気・都市ガスの${period}の値引き（電気・ガス料金支援）は終わりました（最後の${formatYearMonth(lastUsage)}使用分は3〜4月の請求書に載ることがあります）。灯油には別の制度（燃料油価格の激変緩和措置）があり、値引きは店頭価格に入っています。LP ガスは国の支援の対象外でした。`
      : '灯油には燃料油価格の激変緩和措置があり、値引きは店頭価格に入っています。灯油の単価から別に引く必要はありません。電気・ガスの単価は請求書の値を入れてください。';

const faq = [
  {
    q: 'エアコンと灯油（石油ファンヒーター）はどちらが安い？',
    a: `単価と外気温で入れ替わります。熱 1 kWh あたりで比べると、灯油（${formatYen(FUEL_PRICES.kerosene18L)}円/18L）は約${formatNum(heatOf('灯油'))}円、電気をそのまま熱にするヒーターは${DEFAULT_UNIT_PRICE}円、エアコンは COP が 3 なら約${formatNum(heatOf('電気（エアコン）'))}円です。ただしエアコンの COP は外気温が下がるほど小さくなり、寒冷地や真冬の朝は灯油と逆転することがあります。この計算機で、お使いの機種のカタログの値と自分の単価に入れ替えて比べてください。`,
  },
  {
    q: '石油ファンヒーターの電気代はいくら？',
    a: `送風などの消費電力（カタログの値）× 時間 × 電気の単価です。燃焼中 10 W の機種を 1 日 8 時間・30 日使うと、${DEFAULT_UNIT_PRICE}円/kWh で月約${formatYen(fanElecMonth)}円です。点火のときだけ数百 W を使う機種があるので、こまめに消したり点けたりすると少し増えます。石油ストーブ（電源を使わない形）は 0 円です。`,
  },
  {
    q: 'ガスファンヒーターの「kW」を「㎥」にするには？',
    a: `カタログのガス消費量（kW）× 3.6 ÷ 発熱量（MJ/㎥）で、1 時間の㎥になります。都市ガス 13A（${CITY_GAS_13A_MJ_PER_M3} MJ/㎥）なら 2.5 kW は ${formatNum(gasM3PerHour(2.5, CITY_GAS_13A_MJ_PER_M3), 2)}㎥/h、LP ガス（約${LPG_MJ_PER_M3} MJ/㎥）なら約${formatNum(gasM3PerHour(2.5, LPG_MJ_PER_M3), 3)}㎥/h です。これに請求書の単位料金（円/㎥）を掛けるとガス代になります。地域によって標準熱量が違う都市ガスがあるので、計算機の「詳しい設定」で変えられます。`,
  },
  {
    q:
      phase === 'archived'
        ? '灯油にも燃料の補助はある？'
        : `電気代・ガス代の補助（${period}）は灯油にもある？`,
    a: shienFaq,
  },
  {
    q: '灯油ストーブ・ファンヒーターを安全に使うには？',
    a: '1 時間に 1〜2 回、数分の換気をしてください（換気を怠ると一酸化炭素中毒のおそれがあります）。給油は必ず火を消してから、火の気のないところで行い、給油口のふたが閉まっていることを確かめてからタンクを戻します。ガソリンを誤って給油すると火災になるので、灯油は専用の容器に入れ、ガソリンとは別の場所に置いてください。製品評価技術基盤機構（NITE）がストーブ・ファンヒーターの事故の注意を出しています。',
  },
];

const trail = breadcrumbFor('danbohi-hikaku');

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: '暖房費 比較 計算機',
      url: `${SITE_URL}/danbohi-hikaku/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ja',
      isAccessibleForFree: true,
      dateModified: toolUpdatedAt('danbohi-hikaku'),
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

      <h1>暖房費 比較 計算機</h1>
      <p className="lead">
        エアコン・石油ファンヒーター・ガスファンヒーター・電気ストーブ・こたつを最大4台並べ、カタログの値（灯油 L/h・ガス kW・消費電力 W）と自分の単価から、1時間・1日・1か月の暖房費を出していちばん安いものに印をつけます。灯油は{formatDateJa(FUEL_PRICES.asOf)}調査の都道府県の店頭価格が既定です。
      </p>

      <Calculator />

      <AdUnit position="below-tool" />

      {phase === 'archived' ? (
        <>
          <h2>単価は請求書の値を入れる</h2>
          <p>
            電気・ガスの単価は会社と契約で違います。電気は検針票の電力量料金（円/kWh。燃料費調整額・再エネ賦課金を含めた実質の単価なら、請求額 ÷ 使用量）、ガスは単位料金（円/㎥）を入れてください。灯油は激変緩和措置の値引きが店頭価格に入っているので、そのまま入れます。
          </p>
        </>
      ) : (
        <>
          <h2>なぜ答えが月で変わるのか（支援の月）</h2>
          <p>
            {phase === 'active'
              ? `${period}は、電気（低圧）と都市ガスの料金が国の電気・ガス料金支援で値引きされます。値引きは使用月ごとに違い（${SHIEN_PERIODS.map((p) => `${formatYearMonth(p.usageMonth)}使用分は電気 ${p.lowVoltageYenPerKwh.toFixed(1)}円/kWh・都市ガス ${p.cityGasYenPerM3.toFixed(1)}円/㎥`).join('、')}）、灯油と LP ガスには乗りません。そのため「エアコンと灯油のどちらが安いか」は、同じ機器でも使う月で差が動きます。値引きは請求書（検針票）では使用月の翌月に載るので、使用月と請求月を取り違えないでください。`
              : `${period}の電気・都市ガスの値引き（電気・ガス料金支援）は終わりました（最後の分は3〜4月の請求書に載ることがあります）。いまの計算は値引きのない単価だけで比べています。`}
          </p>
          <p>
            灯油には別の制度（燃料油価格の激変緩和措置）があり、値引きはガソリンスタンドの店頭価格にすでに入っています。灯油の単価から支援の額を引くと二重に引くことになるので、この計算機では引きません。
          </p>
        </>
      )}

      <h2>熱 1 kWh あたりの単価の読み方</h2>
      <p>
        燃料ごとに「熱 1 kWh（3.6 MJ）を作るのにかかる額」を出すと、機器を決める前に燃料どうしを比べられます。灯油は 3.6 ÷ {KEROSENE_MJ_PER_L}（MJ/L）× 円/L、都市ガスは 3.6 ÷ {CITY_GAS_13A_MJ_PER_M3} × 円/㎥、LP ガスは 3.6 ÷ 約{LPG_MJ_PER_M3} × 円/㎥、電気ヒーターは 1 × 円/kWh、エアコンは 1 ÷ COP × 円/kWh です。
        たとえば灯油 {formatYen(FUEL_PRICES.kerosene18L)}円/18L（{formatNum(keroPerL)}円/L）なら約{formatNum(heatOf('灯油'))}円、電気 {DEFAULT_UNIT_PRICE}円/kWh のヒーターは {DEFAULT_UNIT_PRICE}円、COP 3 のエアコンなら約{formatNum(heatOf('電気（エアコン）'))}円です。
      </p>
      <p>
        この表は燃焼器具の効率（排気で逃げる熱）を入れていません。部屋に排気を出す開放式のファンヒーター・ストーブはほぼ 100% ですが、排気を屋外に出す FF 式は 80〜90% 台と機種で割れます。実際の額は、計算機の「機器を並べる」でカタログの値どうしを比べてください。
      </p>

      <h2>寒冷地でエアコンの目安が甘くなる理由</h2>
      <p>
        エアコンは外の空気から熱をくみ上げるので、外気温が下がるほど効率（COP）が下がり、同じ暖かさに多くの電気を使います。外気温が 0℃ 前後になると室外機に霜がつき、溶かすための霜取り運転でも電気を使います。カタログの APF は年間の平均的な条件の値なので、「暖房能力 ÷ APF」の目安は寒冷地や真冬の朝には少なめに出ます。寒い地域では、カタログの「低温暖房能力」や寒冷地向けの機種の値も見てください。
      </p>

      <div className="note">
        計算結果は目安です。実際の暖房費は設定温度・外気温・部屋の断熱・使い方で変わります。部屋の広さから必要な暖房能力を推定する計算はしていないので、機種はカタログの「◯畳向け」で選んでください。
      </div>

      <h2>よくある質問</h2>
      {faq.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <p>
        エアコンの冷房・暖房の電気代を詳しく出すなら <Link href="/aircon-denkidai/">エアコン電気代 計算機</Link>。
      </p>

      <AdUnit position="below-faq" />

      <RelatedTools current="danbohi-hikaku" />

      <ToolMeta slug="danbohi-hikaku" ymyl>
        灯油の店頭価格は
        <a href={FUEL_PRICES.sourceUrl} target="_blank" rel="nofollow noopener noreferrer">
          {FUEL_PRICES.source}
        </a>
        （{formatDateJa(FUEL_PRICES.asOf)}調査・全国と都道府県別・18L・消費税込み）、電気の目安単価 {DEFAULT_UNIT_PRICE}円/kWh は
        <a href="https://www.eftc.or.jp/qa/" target="_blank" rel="nofollow noopener noreferrer">
          全国家庭電気製品公正取引協議会「電力料金目安単価」
        </a>
        （令和4年7月22日改定）、電気・都市ガスの値引き単価は
        <a href={SHIEN_SOURCE_URL} target="_blank" rel="nofollow noopener noreferrer">
          資源エネルギー庁「電気・ガス料金支援」
        </a>
        （{SHIEN_CHECKED_ON}確認）によります。灯油・LP ガスの発熱量は
        <a href={HEAT_VALUE_SOURCE.url} target="_blank" rel="nofollow noopener noreferrer">
          {HEAT_VALUE_SOURCE.label}
        </a>
        （灯油 {KEROSENE_MJ_PER_L} MJ/L・LP ガス {LPG_MJ_PER_KG} MJ/kg を 1 kg あたり {LPG_M3_PER_KG}㎥ で換算）、都市ガス 13A は大手都市ガス各社の標準熱量 {CITY_GAS_13A_MJ_PER_M3} MJ/㎥ です。安全な使い方は
        <a href="https://www.nite.go.jp/jiko/" target="_blank" rel="nofollow noopener noreferrer">
          製品評価技術基盤機構（NITE）の製品事故の情報
        </a>
        によります。
      </ToolMeta>
    </>
  );
}
