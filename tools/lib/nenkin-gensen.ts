/**
 * 年金の源泉徴収税額（令和8年12月の精算・2027年以後の1回あたりの額）
 *
 * 仕様: docs/features/nenkin-gensen-12gatsu-seisan.md
 *
 * 日本年金機構が2か月ごとに支払う老齢年金から引かれる所得税（復興・防衛特別所得税を含む）を、
 *   ①令和8年2〜10月の各回（改正前の基礎的控除額）
 *   ②令和8年12月の精算（改正後の基礎的控除額で1年分を計算し直し、徴収済みの5回分と相殺）
 *   ③令和9年（2027年）以後の各回
 * の3つで出す。
 *
 * ■ 計算式（機構 FAQ「申告書を提出した場合の源泉徴収税額は、どのように計算するのですか。」）
 *   源泉徴収税額 ＝（年金支給額 − 社会保険料 − 各種控除額）× 5.105%（1円未満切捨て）
 *   各種控除額は「月割控除額 × 支払月数（2）」。基礎的控除額（公的年金等控除＋基礎控除相当）と
 *   人的控除（配偶者・扶養・障害者・寡婦・ひとり親）の月割額を足したもの。
 *   **扶養親族等申告書を出していないと人的控除が引かれず、基礎的控除額だけ**になる
 *   （機構 FAQ「扶養親族等申告書を提出しなかった場合はどうなるのですか。」。税率は同じ）。
 *
 * ■ 基礎的控除額（一次確認：2026-10-12）
 *   国税庁「令和8年度税制改正（基礎控除の引上げ等関係）Q&A」Q5-1 の表と、
 *   国税庁「令和8年4月 源泉所得税の改正のあらまし」⑷イの表（令和9年分の欄）、
 *   日本年金機構「令和8年度税制改正による公的年金等に係る主な改正事項」1.(1) の表を突き合わせた。
 *   - 令和8年12月の精算時：月割額×25%＋110,000円（最低 65歳以上180,000円・65歳未満140,000円）。
 *     年金額で分かれない。**国税庁のあらましは「上記イの表の令和9年分の欄の基礎的控除額を用いて」精算**
 *     と書いているので、精算時と2027年の各回は同じ値（機構 FAQ の令和9年分の基礎控除とも一致）
 *   - 令和8年の各月の年金支払時（2〜10月）：国税庁 Q&A では「(参考)令和8年の各月の年金支払時」の欄。
 *     令和7年度改正後の値で、242万円以下（65歳未満は213万円以下）なら ×25%＋105,000円
 *     （最低175,000円／130,000円）、超えると ×25%＋100,000円（最低165,000円／125,000円）。
 *     **仕様書の「改正前＝×25%＋65,000円」は令和7年分の各月（令和7年度改正の前）の値で、
 *     令和8年の2〜11月には使われていない**（機構「令和7年度税制改正による所得税の基礎控除の見直し等」）
 *   - 令和10年分以後は242万円超で ×25%＋75,000円 に変わるが、本ツールは扱わない
 *
 * ■ 精算（国税庁 Q&A Q5-1・機構 1.(1)）
 *   12月の税額 ＝ 精算時の控除で計算した1年分（2・4・6・8・10・12月の6回分）− 2〜10月の5回分の徴収済み額。
 *   0未満なら12月の税額は0円で、その絶対値を還付（12月の年金と一緒に振り込まれる）。
 *
 * ■ 税率
 *   5.105%（所得税5%×102.1%）。令和8年は復興特別所得税2.1%、令和9年からは防衛特別所得税1%＋
 *   復興特別所得税1.1%で、合計は変わらない（lib/boei-tokubetsu-shotokuzei.ts）。
 *   1,000分の1単位の整数で掛けて、浮動小数の誤差で1円ずれないようにしている。
 *
 * 【データ更新箇所】基礎的控除額の表（BASIC_*）・人的控除の月割額（PERSONAL_*）・
 * 源泉徴収の対象外の線（EXEMPT_*）・税率（TAX_RATE_PER_100K）。
 */

/** 改正法。出典の表記に使う（lib/invoice-nozeigaku.ts の LAW_R8_KAISEI と同じ法律） */
export const LAW = '所得税法等の一部を改正する法律（令和8年法律第12号）';

/** 12月の精算が行われる年金支払日（2026-12-15）。本文の時制の切り替えに使う */
export const SETTLEMENT_PAYMENT_ON = '2026-12-15';

/** 精算の対象の年分 */
export const SETTLEMENT_YEAR = 2026;

/** 年6回払い（偶数月）。1回あたりの支払は2か月分 */
export const PAYMENTS_PER_YEAR = 6;
export const MONTHS_PER_PAYMENT = 2;
/** 精算の前に改正前の控除で引かれた回数（2・4・6・8・10月） */
export const PAYMENTS_BEFORE_SETTLEMENT = 5;

/** 合計税率 5.105% を 100,000 分率の整数で持つ（5,105 / 100,000）。【データ更新箇所】 */
const TAX_RATE_PER_100K = 5_105;
export const TAX_RATE = TAX_RATE_PER_100K / 100_000;

type BasicRule = { rate: number; add: number; min: number };

/**
 * 基礎的控除額（月割）の表。`rate` は年金の月割額に掛ける率、`add` は定額、`min` は最低額。
 * 【データ更新箇所】
 */
const BASIC_2026_MONTHLY: Record<'over65' | 'under65', { upTo: number; low: BasicRule; high: BasicRule }> = {
  // 242万円以下／超（「２階部分のみの場合には163万円」の線は扱わない。画面で断る）
  over65: {
    upTo: 2_420_000,
    low: { rate: 0.25, add: 105_000, min: 175_000 },
    high: { rate: 0.25, add: 100_000, min: 165_000 },
  },
  under65: {
    upTo: 2_130_000,
    low: { rate: 0.25, add: 105_000, min: 130_000 },
    high: { rate: 0.25, add: 100_000, min: 125_000 },
  },
};

/** 令和8年12月の精算時＝令和9年分の各回（年金額で分かれない）。【データ更新箇所】 */
const BASIC_SETTLEMENT_AND_2027: Record<'over65' | 'under65', BasicRule> = {
  over65: { rate: 0.25, add: 110_000, min: 180_000 },
  under65: { rate: 0.25, add: 110_000, min: 140_000 },
};

/**
 * 源泉徴収の対象とならない年金額（この額**未満**なら源泉徴収されない）。【データ更新箇所】
 * 2026 は令和8年11月までの線（令和7年度改正後）、2027 は令和9年分の線。
 */
export const EXEMPT_BELOW = {
  2026: { over65: 2_050_000, under65: 1_550_000 },
  2027: { over65: 2_140_000, under65: 1_640_000 },
} as const;

/** 人的控除の月割額（機構「年金にかかる源泉徴収税額」の各種控除額）。【データ更新箇所】 */
export const PERSONAL_MONTHLY = {
  spouse: 32_500,
  spouseElderly: 40_000,
  dependent: 32_500,
  dependentSpecific: 52_500,
  dependentElderly: 40_000,
  disabled: 22_500,
  disabledSpecial: 35_000,
  widow: 22_500,
} as const;

/** ひとり親の月割額。令和9年1月1日以後に支払う年金から32,500円（改正前30,000円）。【データ更新箇所】 */
export const SINGLE_PARENT_MONTHLY = { 2026: 30_000, 2027: 32_500 } as const;

export type Spouse = 'none' | 'general' | 'elderly';
export type Disability = 'none' | 'general' | 'special';
export type WidowStatus = 'none' | 'widow' | 'singleParent';

export interface NenkinGensenInput {
  /** 令和8年12月31日時点で65歳以上か */
  age65: boolean;
  /** 年金の年額（円） */
  annualPension: number;
  /** 1回あたり（2か月分）の社会保険料（介護保険料・国保／後期高齢者医療保険料の特別徴収。円） */
  socialInsurancePerPayment: number;
  /** 扶養親族等申告書を出しているか。出していなければ人的控除を引かない */
  submitted: boolean;
  spouse: Spouse;
  /** 控除対象扶養親族の人数（16歳以上。一般・特定〔19〜22歳〕・老人〔70歳以上〕） */
  dependents: { general: number; specific: number; elderly: number };
  /** 本人の障害者控除 */
  disability: Disability;
  /** 本人の寡婦・ひとり親 */
  widow: WidowStatus;
}

const ageKey = (age65: boolean) => (age65 ? 'over65' : 'under65');

const nonNeg = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
const count = (v: number) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/** 1回あたりの支払額（年額 ÷ 6。1円未満切捨て） */
export function paymentAmount(annualPension: number): number {
  return Math.floor(nonNeg(annualPension) / PAYMENTS_PER_YEAR);
}

/** 公的年金等の月割額（1回あたりの支払額 ÷ 2） */
export function monthlyPension(annualPension: number): number {
  return paymentAmount(annualPension) / MONTHS_PER_PAYMENT;
}

function applyRule(rule: BasicRule, monthly: number): number {
  return Math.max(rule.min, Math.floor(monthly * rule.rate) + rule.add);
}

/** 令和8年2〜10月（改正前）の基礎的控除額（月割） */
export function monthlyDeductionBefore(age65: boolean, annualPension: number): number {
  const t = BASIC_2026_MONTHLY[ageKey(age65)];
  const rule = nonNeg(annualPension) <= t.upTo ? t.low : t.high;
  return applyRule(rule, monthlyPension(annualPension));
}

/** 令和8年12月の精算時の基礎的控除額（月割） */
export function monthlyDeductionSettlement(age65: boolean, annualPension: number): number {
  return applyRule(BASIC_SETTLEMENT_AND_2027[ageKey(age65)], monthlyPension(annualPension));
}

/** 令和9年（2027年）以後の各回の基礎的控除額（月割）。精算時と同じ表（国税庁あらまし⑷） */
export function monthlyDeductionAfter(age65: boolean, annualPension: number): number {
  return monthlyDeductionSettlement(age65, annualPension);
}

/** 人的控除の月割額の合計。申告書を出していなければ0 */
export function personalMonthly(input: NenkinGensenInput, year: 2026 | 2027): number {
  if (!input.submitted) return 0;
  const p = PERSONAL_MONTHLY;
  const spouse = input.spouse === 'general' ? p.spouse : input.spouse === 'elderly' ? p.spouseElderly : 0;
  const deps =
    count(input.dependents.general) * p.dependent +
    count(input.dependents.specific) * p.dependentSpecific +
    count(input.dependents.elderly) * p.dependentElderly;
  const disability =
    input.disability === 'general' ? p.disabled : input.disability === 'special' ? p.disabledSpecial : 0;
  const widow =
    input.widow === 'widow' ? p.widow : input.widow === 'singleParent' ? SINGLE_PARENT_MONTHLY[year] : 0;
  return spouse + deps + disability + widow;
}

/**
 * 1回あたりの源泉徴収税額。
 * (支払額 − 社会保険料 − 控除の月割 × 月数) × 5.105%、1円未満切捨て、0未満は0。
 */
export function taxPerPayment(
  payment: number,
  socialInsurance: number,
  monthlyDeductions: number,
  months = MONTHS_PER_PAYMENT,
): number {
  const base = Math.floor(nonNeg(payment) - nonNeg(socialInsurance) - nonNeg(monthlyDeductions) * months);
  if (base <= 0) return 0;
  return Math.floor((base * TAX_RATE_PER_100K) / 100_000);
}

export interface SettlementResult {
  /** 精算時の控除で計算した1年分（6回分）の税額 */
  annualTaxAtSettlement: number;
  /** 2〜10月の5回で徴収済みの額 */
  withheldFebToOct: number;
  /** 12月の支払で引かれる税額（0以上） */
  decemberTax: number;
  /** 12月に戻る額（0以上） */
  refund: number;
}

/**
 * 精算の算式だけ（1回あたりの額から）。
 * 12月の税額 ＝ 精算時の1回分 × 6 − 改正前の1回分 × 5。0未満なら還付。
 */
export function settleFromPerPayment(beforePerPayment: number, settlementPerPayment: number): SettlementResult {
  const annualTaxAtSettlement = settlementPerPayment * PAYMENTS_PER_YEAR;
  const withheldFebToOct = beforePerPayment * PAYMENTS_BEFORE_SETTLEMENT;
  const diff = annualTaxAtSettlement - withheldFebToOct;
  return {
    annualTaxAtSettlement,
    withheldFebToOct,
    decemberTax: Math.max(0, diff),
    refund: Math.max(0, -diff),
  };
}

export interface NenkinGensenResult extends SettlementResult {
  payment: number;
  /** 1回あたりの税額：2〜10月（改正前の控除） */
  perPaymentBefore: number;
  /** 1回あたりの税額：12月の精算で使う1回分（精算時の控除） */
  perPaymentSettlement: number;
  /** 1回あたりの税額：2027年2月以後 */
  perPayment2027: number;
  /** 控除の月割（基礎的控除額＋人的控除）。表示用 */
  monthlyDeduction: { before: number; settlement: number; after2027: number };
  /** 基礎的控除額の月割だけ。表示用 */
  monthlyBasic: { before: number; settlement: number; after2027: number };
  /** 2027年以後、源泉徴収の対象外（年金額が214万円／164万円未満） */
  exempt2027: boolean;
  /** 令和8年11月までの線（205万円／155万円）未満で、もともと源泉徴収されていない */
  exempt2026: boolean;
  /** 申告書を出さなかった場合の2027年以後の1回あたり（基礎控除だけ） */
  perPayment2027WithoutForm: number;
  /** 出さないことで1回あたり増える額（2027年以後） */
  withoutFormIncrease: number;
}

export function calc(input: NenkinGensenInput): NenkinGensenResult {
  const annual = nonNeg(input.annualPension);
  const payment = paymentAmount(annual);
  const social = nonNeg(input.socialInsurancePerPayment);
  const k = ageKey(input.age65);

  const exempt2026 = annual < EXEMPT_BELOW[2026][k];
  const exempt2027 = annual < EXEMPT_BELOW[2027][k];

  const monthlyBasic = {
    before: monthlyDeductionBefore(input.age65, annual),
    settlement: monthlyDeductionSettlement(input.age65, annual),
    after2027: monthlyDeductionAfter(input.age65, annual),
  };
  const monthlyDeduction = {
    before: monthlyBasic.before + personalMonthly(input, 2026),
    settlement: monthlyBasic.settlement + personalMonthly(input, 2026),
    after2027: monthlyBasic.after2027 + personalMonthly(input, 2027),
  };

  // 対象外の線より下は源泉徴収そのものが無い（式でもほぼ0になるが、線を優先する）
  const perPaymentBefore = exempt2026 ? 0 : taxPerPayment(payment, social, monthlyDeduction.before);
  const perPaymentSettlement = taxPerPayment(payment, social, monthlyDeduction.settlement);
  const perPayment2027 = exempt2027 ? 0 : taxPerPayment(payment, social, monthlyDeduction.after2027);
  const perPayment2027WithoutForm = exempt2027 ? 0 : taxPerPayment(payment, social, monthlyBasic.after2027);

  return {
    payment,
    perPaymentBefore,
    perPaymentSettlement,
    perPayment2027,
    monthlyDeduction,
    monthlyBasic,
    exempt2026,
    exempt2027,
    perPayment2027WithoutForm,
    withoutFormIncrease: perPayment2027WithoutForm - perPayment2027,
    ...settleFromPerPayment(perPaymentBefore, perPaymentSettlement),
  };
}
