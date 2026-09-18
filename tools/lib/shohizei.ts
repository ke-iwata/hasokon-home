/**
 * 消費税の計算ロジック（税込⇔税抜・税率表・2027年4月の食料品1%）
 *
 * 仕様: docs/features/shohizei-keisan-shokuryohin-1percent.md
 *
 * **このファイルが消費税率の一次情報**で、割引・パーセント計算
 * （`waribiki-percent.ts`）はここから税率を import する。
 * 「税率は10%と8%の2つ」という前提が 2027年4月の1%で崩れるため、
 * 数字を1か所に集めてある（同じ数字を2か所に置かない）。
 *
 * 純関数のみで DOM/React には依存しない。無効な入力には `null` を返し、
 * 呼び出し側で「入れてください」の表示に落とす。
 */
import { roundBy, type Rounding } from './rounding';

export type { Rounding, RoundingOption } from './rounding';
export { ROUNDINGS, roundBy } from './rounding';

/* ===================================================================
   【データ更新箇所】税率と、2027年4月の「食料品1%」の状態

   税率そのものは法改正で動く。ここの定数と `FOOD_RATE_2027.status`
   だけを直せば、計算機・早見表・判定チェッカー・page.tsx の本文と
   title / description まで揃って追従する。
   状態を変えるたびに `TAX_UPDATED_AT` / `DATA_CHECKED_AT` も直すこと。
   =================================================================== */

/**
 * 税率は**整数のパーセント**で持つ（`0.10` のような小数を正としない）。
 *
 * 税込から税抜に戻すときに `1100 / 1.1` を計算すると、二進小数の誤差で
 * `999.9999999999999` になり、**切り捨てで税抜が999円になる**
 * （実際にこれで1円ずれる不具合を作った）。整数で持って
 * `1100 × 100 ÷ 110` と掛けてから割れば、ちょうど1000円になる。
 * 小数の `TAX_RATE_*` は表示と外部（割引計算機）向けにここから導く。
 */
export const TAX_PERCENT_STANDARD = 10;
export const TAX_PERCENT_REDUCED = 8;
export const TAX_PERCENT_FOOD_2027 = 1;

/** 標準税率（消費税＋地方消費税の合計） */
export const TAX_RATE_STANDARD = TAX_PERCENT_STANDARD / 100;

/** 軽減税率（飲食料品・定期購読の新聞など） */
export const TAX_RATE_REDUCED = TAX_PERCENT_REDUCED / 100;

/**
 * 2027年4月からの飲食料品の税率。
 * **法案が成立するまでは「予定」**（`FOOD_RATE_2027.status` を見ること）。
 */
export const TAX_RATE_FOOD_2027 = TAX_PERCENT_FOOD_2027 / 100;

/**
 * 現行の消費税率が施行された日。
 * 2019-10-01 の税率引き上げ（8% → 10%）以降は改定されていない。
 */
export const TAX_UPDATED_AT = '2019-10-01';

/** このファイルのデータを一次資料と突き合わせた日 */
export const DATA_CHECKED_AT = '2026-09-18';

/**
 * 「食料品1%」の法案の状態。
 *
 * `'cabinet-decision'`（閣議決定・法案未成立）→ `'enacted'`（成立）
 * → `'in-force'`（施行）と進む。否決・撤回されたら `'withdrawn'`。
 * **UI の「成立前です」の印と、1%を出すかどうかは、この値だけを見る。**
 */
export type BillStatus = 'cabinet-decision' | 'enacted' | 'in-force' | 'withdrawn';

export const FOOD_RATE_2027 = {
  rate: TAX_RATE_FOOD_2027,
  from: '2027-04-01',
  to: '2029-03-31',
  /**
   * 法案が否決・修正されたらここを直す。UI の印はこの値だけを見る。
   * `'withdrawn'` にすると C（軽減額の計算）が消え、A・B は 8%/10% の2税率に戻る。
   */
  status: 'cabinet-decision' as BillStatus,
  decidedOn: '2026-08-05',
  /**
   * 一次資料。閣議決定文書の原本 URL が見つかればそれに差し替える
   * （報道記事の URL は数か月で消えるので出典には使わない）。
   */
  source: 'https://www.kantei.go.jp/jp/105/statement/2026/0730kaiken.html',
} as const;

/** `status` の日本語表示 */
export const BILL_STATUS_LABEL: Record<BillStatus, string> = {
  'cabinet-decision': '閣議決定済み・法案未成立',
  enacted: '成立',
  'in-force': '施行済み',
  withdrawn: '成立せず',
};

/**
 * 1% がまだ「予定」か。
 *
 * `title` / `description` に「（予定）」を入れるかどうか、画面に
 * 「成立前です」の印を出すかどうかを、すべてこの1つの関数で決める。
 * 検索結果のスニペットには画面の印が見えないので、
 * **文字列としての「予定」を title / description に必ず含める**
 * （`tests/shohizei.test.ts` が見張っている）。
 */
export function isFoodRatePending(status: BillStatus = FOOD_RATE_2027.status): boolean {
  return status === 'cabinet-decision';
}

/** 1% を画面に出してよいか（撤回されたら出さない） */
export function isFoodRateShown(status: BillStatus = FOOD_RATE_2027.status): boolean {
  return status !== 'withdrawn';
}

/**
 * 1% の脇に添える印。`null` のときは印を出さない。
 *
 * 「決定」「確定」とは書かない（閣議決定は条文ではない）。
 */
export function foodRateBadge(status: BillStatus = FOOD_RATE_2027.status): string | null {
  switch (status) {
    case 'cabinet-decision':
      return `閣議決定済み（${formatDate(FOOD_RATE_2027.decidedOn)}）。法案は臨時国会で審議中。成立前です`;
    case 'enacted':
      return '法案成立。施行は2027年4月1日';
    case 'in-force':
      return null;
    case 'withdrawn':
      return '法案は成立しませんでした';
  }
}

/* ===================================================================
   税率の選択肢
   =================================================================== */

export type TaxRateId = 'standard' | 'reduced' | 'food-2027';

export interface TaxRateOption {
  id: TaxRateId;
  label: string;
  /** **整数のパーセント（10 / 8 / 1）。計算に使うのはこちら。** */
  percent: number;
  /** 小数（0.10 / 0.08 / 0.01）。表示と外部向け */
  rate: number;
  /** パーセント表記（画面出力用） */
  percentLabel: string;
  /** 法案未成立の税率か（印を出すかどうか） */
  pending: boolean;
}

/**
 * 選べる税率。**1% は法案が撤回されたら並びから消える。**
 *
 * `pending` はその時点の `status` から導くので、成立したら
 * `FOOD_RATE_2027.status` を直すだけで印が消える。
 */
export function taxRates(status: BillStatus = FOOD_RATE_2027.status): TaxRateOption[] {
  const base: TaxRateOption[] = [
    {
      id: 'standard',
      label: '10%（標準税率）',
      percent: TAX_PERCENT_STANDARD,
      rate: TAX_RATE_STANDARD,
      percentLabel: '10%',
      pending: false,
    },
    {
      id: 'reduced',
      label: '8%（軽減税率・飲食料品等）',
      percent: TAX_PERCENT_REDUCED,
      rate: TAX_RATE_REDUCED,
      percentLabel: '8%',
      pending: false,
    },
  ];
  if (!isFoodRateShown(status)) return base;
  return [
    ...base,
    {
      id: 'food-2027',
      label: isFoodRatePending(status)
        ? '1%（2027年4月〜・飲食料品／予定）'
        : '1%（2027年4月〜・飲食料品）',
      percent: TAX_PERCENT_FOOD_2027,
      rate: TAX_RATE_FOOD_2027,
      percentLabel: '1%',
      pending: isFoodRatePending(status),
    },
  ];
}

/** 既定の税率の並び（静的HTMLに焼き込む用） */
export const TAX_RATES: TaxRateOption[] = taxRates();

export function taxRate(id: TaxRateId, status: BillStatus = FOOD_RATE_2027.status): TaxRateOption {
  const found = taxRates(status).find((r) => r.id === id);
  if (!found) throw new Error(`いま使える税率IDではありません: ${id}`);
  return found;
}

/**
 * 消費税の既定の丸めは**切り捨て**。
 *
 * 割引計算機（`waribiki-percent.ts` の `DEFAULT_ROUNDING` ＝ 四捨五入）とは
 * **わざと違う値にしてある**。消費税額の1円未満の処理は事業者の任意で、
 * 実務では切り捨てがもっとも多いため。同じ `roundBy()` を使うからといって
 * 既定まで共有しないこと。
 */
export const DEFAULT_TAX_ROUNDING: Rounding = 'floor';

/* ===================================================================
   A. 税込 ⇔ 税抜 計算
   =================================================================== */

/** 入力した金額が税込か税抜か */
export type PriceMode = 'inclusive' | 'exclusive';

export const DEFAULT_PRICE_MODE: PriceMode = 'inclusive';

export interface TaxBreakdownInput {
  /** 入力した金額（円、0以上） */
  amount: number;
  /** その金額が税込か税抜か */
  mode: PriceMode;
  rateId: TaxRateId;
  rounding?: Rounding;
}

export interface TaxBreakdown {
  /** 税抜（本体）価格（円、整数） */
  excluding: number;
  /** 消費税額（円、整数）。必ず `including - excluding` と一致する */
  tax: number;
  /** 税込価格（円、整数） */
  including: number;
  rateId: TaxRateId;
  /** 使った税率（小数） */
  rate: number;
  rounding: Rounding;
}

/** 金額の入力が使えるか（0以上の有限数） */
export function isValidPrice(price: number): boolean {
  return Number.isFinite(price) && price >= 0;
}

/**
 * 税込・消費税額・税抜の3つを同時に出す。
 *
 * 税抜入力: excluding = 入力（整数に丸める）
 *           including = round(excluding × (1 + 税率))
 * 税込入力: including = 入力（整数に丸める）
 *           excluding = round(including ÷ (1 + 税率))
 *
 * どちらの向きでも **`tax` は「税込 − 税抜」で定義する**。
 * 「本体 × 税率」を別に丸めると、画面に並べた3つの数が1円合わないことがある。
 *
 * 丸めは1回だけ掛ける（2段階に掛けると入力そのものが動く）。
 *
 * **計算は整数のパーセントで行う。** `amount / 1.1` と書くと
 * `1100 / 1.1 = 999.9999999999999` になり、切り捨てで税抜が999円になってしまう。
 * `amount × 100 ÷ 110` の順で計算すれば、ちょうど1000円になる。
 */
export function taxBreakdown(input: TaxBreakdownInput): TaxBreakdown | null {
  if (!isValidPrice(input.amount)) return null;
  const option = taxRates().find((r) => r.id === input.rateId);
  if (!option) return null;

  const rounding: Rounding = input.rounding ?? DEFAULT_TAX_ROUNDING;
  const rate = option.rate;
  // (1 + 税率) を「(100 + パーセント) / 100」の分数として扱う
  const withTax = 100 + option.percent;

  if (input.mode === 'exclusive') {
    const excluding = roundBy(input.amount, rounding);
    const including = roundBy((input.amount * withTax) / 100, rounding);
    return {
      excluding,
      tax: including - excluding,
      including,
      rateId: input.rateId,
      rate,
      rounding,
    };
  }

  const including = roundBy(input.amount, rounding);
  const excluding = roundBy((input.amount * 100) / withTax, rounding);
  return { excluding, tax: including - excluding, including, rateId: input.rateId, rate, rounding };
}

/**
 * 同じ金額を3税率（10% / 8% / 1%）で並べる。
 *
 * 「この税込1,080円の品は1%なら1,010円」を出すための横並び。
 * 1% が撤回されたら2件になる（`taxRates()` が並びを決める）。
 */
export function compareRates(
  amount: number,
  mode: PriceMode,
  rounding: Rounding = DEFAULT_TAX_ROUNDING,
): TaxBreakdown[] {
  return taxRates()
    .map((r) => taxBreakdown({ amount, mode, rateId: r.id, rounding }))
    .filter((r): r is TaxBreakdown => r !== null);
}

/* ===================================================================
   早見表（税抜 100〜10,000円 × 3税率の税込額）
   =================================================================== */

/** 早見表に並べる税抜価格（円） */
export const LOOKUP_PRICES: number[] = [
  100, 200, 300, 500, 800, 1000, 1500, 2000, 3000, 5000, 8000, 10000,
];

export interface LookupRow {
  /** 税抜価格（円） */
  excluding: number;
  /** 税率IDごとの税込額 */
  including: { rateId: TaxRateId; including: number; tax: number }[];
}

/**
 * 早見表を作る。既定の丸め（切り捨て）で1回だけ計算する。
 *
 * 手書きの表を持たず `taxBreakdown()` を通すのは、税率や丸めを直したときに
 * 表だけ古いままになるのを避けるため。
 */
export function lookupTable(
  prices: number[] = LOOKUP_PRICES,
  rounding: Rounding = DEFAULT_TAX_ROUNDING,
): LookupRow[] {
  return prices.map((excluding) => ({
    excluding,
    including: taxRates().map((r) => {
      const result = taxBreakdown({ amount: excluding, mode: 'exclusive', rateId: r.id, rounding });
      if (result === null) throw new Error(`早見表に使えない金額です: ${excluding}円`);
      return { rateId: r.id, including: result.including, tax: result.tax };
    }),
  }));
}

/** 早見表の実体（静的HTMLに焼き込む） */
export const LOOKUP_TABLE: LookupRow[] = lookupTable();

/* ===================================================================
   C. 食料品1%でいくら安くなるか（2027年4月〜）
   =================================================================== */

/**
 * 税込額に対する軽減の割合。
 *
 * いまの税込8%の価格が、そのまま税込1%に置き換わると仮定したときの下がり幅。
 *   1 − 1.01 / 1.08 ≒ 0.064815（約6.48%）
 *
 * **これは「最大でこれだけ」の目安**。便乗値上げ・値下げの遅れは織り込まない
 * （読み手に断るのは画面側の責任。ここでは数字だけを出す）。
 */
export const FOOD_RELIEF_RATIO =
  1 - (100 + TAX_PERCENT_FOOD_2027) / (100 + TAX_PERCENT_REDUCED);

/** 1% が適用される月数（2027-04 〜 2029-03 の2年間） */
export const FOOD_RELIEF_MONTHS = 24;

export interface FoodReliefResult {
  /** 1か月の軽減額（円、整数） */
  monthly: number;
  /** 1年の軽減額（円）。`monthly × 12` で出す */
  yearly: number;
  /** 期間の通算（円）。`monthly × FOOD_RELIEF_MONTHS` */
  total: number;
  /** 使った割合（小数） */
  ratio: number;
  months: number;
}

/**
 * 1か月の食費（外食・酒類を除く、税込）から軽減額を出す。
 *
 * 年・通算は「丸めた月額 × 月数」で出す。生の値を別に丸めると、
 * 画面に並べた月額と年額が「12倍になっていない」ように見える。
 */
export function foodRelief(monthlyFoodIncludingTax: number): FoodReliefResult | null {
  if (!isValidPrice(monthlyFoodIncludingTax)) return null;
  const monthly = Math.round(monthlyFoodIncludingTax * FOOD_RELIEF_RATIO);
  return {
    monthly,
    yearly: monthly * 12,
    total: monthly * FOOD_RELIEF_MONTHS,
    ratio: FOOD_RELIEF_RATIO,
    months: FOOD_RELIEF_MONTHS,
  };
}

/** 軽減額の早見表に並べる月の食費（円） */
export const RELIEF_LOOKUP_MONTHLY: number[] = [
  30000, 40000, 50000, 60000, 70000, 80000, 90000, 100000, 120000, 150000,
];

export interface ReliefLookupRow {
  monthlyFood: number;
  relief: FoodReliefResult;
}

export function reliefLookupTable(amounts: number[] = RELIEF_LOOKUP_MONTHLY): ReliefLookupRow[] {
  return amounts.map((monthlyFood) => {
    const relief = foodRelief(monthlyFood);
    if (relief === null) throw new Error(`早見表に使えない食費です: ${monthlyFood}円`);
    return { monthlyFood, relief };
  });
}

export const RELIEF_LOOKUP_TABLE: ReliefLookupRow[] = reliefLookupTable();

/* ===================================================================
   【データ更新箇所】食費のプリセット（総務省 家計調査）

   毎年2月上旬に前年の「平均」が公表される（例: 2025年平均は2026-02-06）。
   `食料 − 外食 − 酒類` が 1% の対象に近い範囲なので、その3つを写して引く。
   年・表番号・公表日を必ず一緒に直すこと。
   =================================================================== */

export interface FoodBudgetPreset {
  id: string;
  label: string;
  /** 月あたりの金額（円、税込） */
  monthly: number;
  /** どこから引いた数字か（画面に出す） */
  basis: string;
  /**
   * ボタンのラベルに金額を添えるか。
   * 「月3万円」のような丸い金額はラベル自身が金額なので添えない
   * （同じ数字を2回書くことになり、390px で全ボタンが2行に折れる）。
   */
  showAmount?: boolean;
}

/**
 * 家計調査の出どころ。
 *
 * **二人以上の世帯は「家計の概要」の表Ⅰ－１－１に食料の内訳（外食・酒類）が
 * 載っているが、単身世帯は10大費目（表Ⅱ－１－２の食料 49,321円）までで、
 * 外食・酒類の内訳が概要に無い。**単身世帯のプリセットを入れるには
 * e-Stat の詳細結果表（単身世帯・年）から内訳を取る必要があるので、
 * いまは丸い金額のプリセットで代用している（推計値を平均として出さない）。
 */
export const KAKEI_CHOSA = {
  year: 2025,
  label: '総務省「家計調査（家計収支編）2025年（令和7年）平均」',
  table: '表Ⅰ－１－１（消費支出の費目別対前年増減率・二人以上の世帯）',
  publishedOn: '2026-02-06',
  url: 'https://www.stat.go.jp/data/kakei/2025np/index.html',
  /** 二人以上の世帯・1か月平均（円） */
  twoOrMore: { food: 94895, eatingOut: 16563, alcohol: 3784 },
} as const;

/** 家計調査の「食料」から外食・酒類を引いた額（＝1%の対象に近い範囲） */
export const KAKEI_TWO_OR_MORE_AT_HOME =
  KAKEI_CHOSA.twoOrMore.food - KAKEI_CHOSA.twoOrMore.eatingOut - KAKEI_CHOSA.twoOrMore.alcohol;

export const FOOD_BUDGET_PRESETS: FoodBudgetPreset[] = [
  {
    id: 'two-or-more',
    label: '2人以上の世帯の平均',
    monthly: KAKEI_TWO_OR_MORE_AT_HOME,
    basis: `${KAKEI_CHOSA.year}年平均の「食料」${KAKEI_CHOSA.twoOrMore.food.toLocaleString('ja-JP')}円から外食${KAKEI_CHOSA.twoOrMore.eatingOut.toLocaleString('ja-JP')}円・酒類${KAKEI_CHOSA.twoOrMore.alcohol.toLocaleString('ja-JP')}円を引いた額`,
    showAmount: true,
  },
  { id: 'm30000', label: '月3万円', monthly: 30000, basis: '目安の金額' },
  { id: 'm50000', label: '月5万円', monthly: 50000, basis: '目安の金額' },
  { id: 'm100000', label: '月10万円', monthly: 100000, basis: '目安の金額' },
];

/** 既定のプリセット（計算機の初期値） */
export const DEFAULT_FOOD_BUDGET = KAKEI_TWO_OR_MORE_AT_HOME;

/* ===================================================================
   出典（ページ本文に載せるのは一次情報のみ）
   =================================================================== */

export const SOURCE_NTA_KEIGEN = {
  label: '国税庁「消費税の軽減税率制度について」',
  url: 'https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/index.htm',
} as const;

export const SOURCE_NTA_QA = {
  label: '国税庁「消費税の軽減税率制度に関するQ&A（個別事例編）」令和8年4月改訂',
  url: 'https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/qa_03.htm',
} as const;

export const SOURCE_KANTEI = {
  label: '首相官邸「内閣総理大臣記者会見」（2026年7月30日）',
  url: FOOD_RATE_2027.source,
} as const;

export const SOURCE_KAKEI_CHOSA = {
  label: KAKEI_CHOSA.label,
  url: KAKEI_CHOSA.url,
} as const;

/* ===================================================================
   表示ヘルパ
   =================================================================== */

/** 円表示（3桁区切り＋「円」） */
export function formatYen(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${Math.round(value).toLocaleString('ja-JP')}円`;
}

/** '2026-08-05' → '2026年8月5日' */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

/** 割合をパーセント表記にする（既定は小数2桁） */
export function formatPercent(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}
