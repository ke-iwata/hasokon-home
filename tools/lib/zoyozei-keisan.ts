/**
 * 贈与税 計算機・生前贈与加算チェッカー
 *
 * 仕様: docs/features/zoyozei-keisan.md
 *
 * 主役は「相続開始日 × 贈与日 → 相続税の課税価格に加算されるか」の判定（加算チェッカー）。
 * 令和5年度税制改正で加算期間が 3 年から 7 年に延び、**相続開始日で段階的に**切り替わる。
 * 決まるのは贈与日ではなく相続開始日なので、「2026 年内に駆け込めば有利」にはならない。
 *
 * 出典（2026-09-27 取得。いずれも [令和8年4月1日現在法令等]）:
 * - 国税庁 タックスアンサー No.4161「贈与財産の加算と税額控除（暦年課税）」
 *   https://www.nta.go.jp/taxes/shiraberu/taxanswer/sozoku/4161.htm
 * - 国税庁 タックスアンサー No.4408「贈与税の計算と税率（暦年課税）」
 *   https://www.nta.go.jp/taxes/shiraberu/taxanswer/zoyo/4408.htm
 * - 国税庁 タックスアンサー No.4103「相続時精算課税の選択」
 *   https://www.nta.go.jp/taxes/shiraberu/taxanswer/sozoku/4103.htm
 * - 相続税法 19 条・21 条の 5・21 条の 7・21 条の 11 の 2、租税特別措置法 70 条の 2 の 4・70 条の 2 の 5
 *
 * 端数：課税価格は 1,000 円未満切捨て（国税通則法 118 条 1 項）、税額は 100 円未満切捨て（同 119 条 1 項）。
 */

import { compareDate, daysInMonth, formatDate, parseDate, type DateParts } from '@/lib/date-parts';

// ─────────────────────────────────────────────
// 【データ更新箇所】税制改正で変わる値はここだけ
// ─────────────────────────────────────────────

/** 制度データの最終確認日（国税庁 No.4161・No.4408・No.4103 を突き合わせた日） */
export const DATA_CHECKED_AT = '2026-09-27';

/** 暦年課税の基礎控除（相続税法 21 条の 5・措法 70 条の 2 の 4）。精算課税の基礎控除も同額（別枠） */
export const BASIC_DEDUCTION = 1_100_000;

/** 延長された 4 年分（相続開始前 3 年超〜7 年以内）の贈与から、合計で加算しない額（相続税法 19 条 1 項かっこ書） */
export const EXTENDED_EXCLUSION = 1_000_000;

/** 相続時精算課税の特別控除（累計の限度額。相続税法 21 条の 12） */
export const SETTLEMENT_SPECIAL_DEDUCTION = 25_000_000;

/** 相続時精算課税の税率（一律 20%。相続税法 21 条の 13） */
export const SETTLEMENT_RATE = 0.2;

/**
 * 加算期間の切り替え（No.4161 の表。令5改正法附則19）
 * - start: この日以後の相続開始から「2024-01-01 から相続開始日まで」になる
 * - full7y: この日以後の相続開始から「相続開始前 7 年以内」になる
 * - anchor: 経過期間中の加算の起点（改正後のルールが適用される最初の贈与日）
 */
export const TRANSITION = { start: '2027-01-01', full7y: '2031-01-01', anchor: '2024-01-01' } as const;

/** 改正前の加算期間（年） */
export const OLD_YEARS = 3;
/** 改正後の加算期間（年） */
export const NEW_YEARS = 7;

/** 速算表の 1 行。`upTo` は基礎控除後の課税価格の上限（円・以下）。最後の行は Infinity */
export interface Bracket {
  upTo: number;
  rate: number;
  deduction: number;
}

/** 一般贈与財産用（一般税率）。No.4408 */
export const GENERAL_BRACKETS: readonly Bracket[] = [
  { upTo: 2_000_000, rate: 0.1, deduction: 0 },
  { upTo: 3_000_000, rate: 0.15, deduction: 100_000 },
  { upTo: 4_000_000, rate: 0.2, deduction: 250_000 },
  { upTo: 6_000_000, rate: 0.3, deduction: 650_000 },
  { upTo: 10_000_000, rate: 0.4, deduction: 1_250_000 },
  { upTo: 15_000_000, rate: 0.45, deduction: 1_750_000 },
  { upTo: 30_000_000, rate: 0.5, deduction: 2_500_000 },
  { upTo: Infinity, rate: 0.55, deduction: 4_000_000 },
];

/** 特例贈与財産用（特例税率）。18 歳以上が直系尊属から受けた贈与。No.4408 */
export const SPECIAL_BRACKETS: readonly Bracket[] = [
  { upTo: 2_000_000, rate: 0.1, deduction: 0 },
  { upTo: 4_000_000, rate: 0.15, deduction: 100_000 },
  { upTo: 6_000_000, rate: 0.2, deduction: 300_000 },
  { upTo: 10_000_000, rate: 0.3, deduction: 900_000 },
  { upTo: 15_000_000, rate: 0.4, deduction: 1_900_000 },
  { upTo: 30_000_000, rate: 0.45, deduction: 2_650_000 },
  { upTo: 45_000_000, rate: 0.5, deduction: 4_150_000 },
  { upTo: Infinity, rate: 0.55, deduction: 6_400_000 },
];

// ─────────────────────────────────────────────
// 日付
// ─────────────────────────────────────────────

const TRANSITION_START = parseDate(TRANSITION.start)!;
const TRANSITION_FULL7Y = parseDate(TRANSITION.full7y)!;
const TRANSITION_ANCHOR = parseDate(TRANSITION.anchor)!;

/**
 * n 年前（n が負なら n 年後）の応当日。応当日が無い（2 月 29 日 → 平年）ときはその月の末日（2 月 28 日）。
 *
 * No.4161 の「死亡の日から遡って 3 年前の日から死亡の日までの間」の「3 年前の日」に使う。
 * 応当日の無い月は末日に寄せる（民法 143 条 2 項ただし書と同じ扱い）
 */
export function yearsBefore(date: DateParts, n: number): DateParts {
  const year = date.year - n;
  return { year, month: date.month, day: Math.min(date.day, daysInMonth(year, date.month)) };
}

/** 翌日 */
function nextDay(d: DateParts): DateParts {
  if (d.day < daysInMonth(d.year, d.month)) return { ...d, day: d.day + 1 };
  if (d.month < 12) return { year: d.year, month: d.month + 1, day: 1 };
  return { year: d.year + 1, month: 1, day: 1 };
}

/** 前日 */
function prevDay(d: DateParts): DateParts {
  if (d.day > 1) return { ...d, day: d.day - 1 };
  if (d.month > 1) return { year: d.year, month: d.month - 1, day: daysInMonth(d.year, d.month - 1) };
  return { year: d.year - 1, month: 12, day: 31 };
}

// ─────────────────────────────────────────────
// 加算チェッカー
// ─────────────────────────────────────────────

/** 加算期間の種類（No.4161 の表の 3 行） */
export type PeriodKind = '3y' | 'from-2024-01-01' | '7y';

export interface AdditionPeriod {
  kind: PeriodKind;
  /** 加算期間の初日（この日を含む）。終わりは相続開始日（を含む） */
  from: DateParts;
}

/** No.4161 の表の各行の文言（画面の「根拠の行」に出す） */
export const PERIOD_ROWS: Record<PeriodKind, { inheritance: string; period: string }> = {
  '3y': { inheritance: '〜2026年12月31日', period: '相続開始前3年以内' },
  'from-2024-01-01': {
    inheritance: '2027年1月1日〜2030年12月31日',
    period: '2024年1月1日から相続開始日まで',
  },
  '7y': { inheritance: '2031年1月1日〜', period: '相続開始前7年以内' },
};

/**
 * 相続開始日 → 加算期間（No.4161 の表）
 *
 * - 〜2026-12-31：相続開始前 3 年以内（3 年前の応当日から）
 * - 2027-01-01〜2030-12-31：2024-01-01 から相続開始日まで
 * - 2031-01-01〜：相続開始前 7 年以内（7 年前の応当日から）
 */
export function additionPeriod(inheritanceDate: DateParts): AdditionPeriod {
  if (compareDate(inheritanceDate, TRANSITION_START) < 0) {
    return { kind: '3y', from: yearsBefore(inheritanceDate, OLD_YEARS) };
  }
  if (compareDate(inheritanceDate, TRANSITION_FULL7Y) < 0) {
    return { kind: 'from-2024-01-01', from: TRANSITION_ANCHOR };
  }
  return { kind: '7y', from: yearsBefore(inheritanceDate, NEW_YEARS) };
}

/**
 * 暦年課税の贈与 1 回分の区分。
 * - `not-added`：加算されない（加算期間の外。相続開始日より後の贈与もここ）
 * - `within-3y`：相続開始前 3 年以内。全額加算（110 万円以下の贈与も加算される）
 * - `extended-4y`：延長された 4 年分（3 年超〜7 年以内）。合計 100 万円までは加算しない
 */
export type GiftClass = 'not-added' | 'within-3y' | 'extended-4y';

export const GIFT_CLASS_LABELS: Record<GiftClass, string> = {
  'not-added': '対象外',
  'within-3y': '3年以内',
  'extended-4y': '延長4年分',
};

/**
 * 贈与日と相続開始日から、暦年課税の贈与が相続税の課税価格に加算されるかを判定する。
 *
 * 「相続開始前 3 年以内」は No.4161 の「死亡の日から遡って 3 年前の日から死亡の日までの間」で、
 * **3 年前の応当日を含む**。
 */
export function classifyGift(giftDate: DateParts, inheritanceDate: DateParts): GiftClass {
  if (compareDate(giftDate, inheritanceDate) > 0) return 'not-added';
  const { from } = additionPeriod(inheritanceDate);
  if (compareDate(giftDate, from) < 0) return 'not-added';
  if (compareDate(giftDate, yearsBefore(inheritanceDate, OLD_YEARS)) >= 0) return 'within-3y';
  return 'extended-4y';
}

/**
 * 1 回分の贈与について、相続税の課税価格に加算される額の幅。
 *
 * 延長 4 年分の 100 万円の枠は**延長期間内の贈与の合計**に対して効くので、1 回分の贈与からは
 * 確定しない。`max` は枠をほかの贈与で使い切った場合、`min` はこの贈与に枠を全部使えた場合。
 */
export function addedAmountRange(amount: number, cls: GiftClass): { min: number; max: number } {
  const a = Math.max(0, Math.floor(amount) || 0);
  if (cls === 'not-added') return { min: 0, max: 0 };
  if (cls === 'within-3y') return { min: a, max: a };
  return { min: Math.max(0, a - EXTENDED_EXCLUSION), max: a };
}

/** 早見表の 1 区間（同じ相続開始年のうち、判定が同じ日の範囲） */
export interface HayamiSegment {
  /** この区間の初日（相続開始日） */
  from: DateParts;
  /** この区間の末日（相続開始日） */
  to: DateParts;
  cls: GiftClass;
  kind: PeriodKind;
}

export interface HayamiRow {
  year: number;
  /** 年のうちで判定が変わる日ごとに分けた区間。1 つなら年を通して同じ */
  segments: HayamiSegment[];
}

/** 早見表で動かす相続開始年（仕様書「画面」） */
export const HAYAMI_YEARS = { from: 2026, to: 2034 } as const;

/**
 * 贈与日を固定して、相続開始日を年ごとに動かした早見表。
 *
 * 判定が年の途中で変わる（贈与日の 3 年後・7 年後の応当日、2027-01-01・2031-01-01 の切り替え）ので、
 * 各年を「判定が同じ区間」に分けて返す。相続開始日が贈与日より前の区間は含めない。
 */
export function hayamiTable(
  giftDate: DateParts,
  fromYear: number = HAYAMI_YEARS.from,
  toYear: number = HAYAMI_YEARS.to,
): HayamiRow[] {
  const rows: HayamiRow[] = [];
  for (let year = fromYear; year <= toYear; year++) {
    const yearStart = { year, month: 1, day: 1 };
    const yearEnd = { year, month: 12, day: 31 };
    if (compareDate(yearEnd, giftDate) < 0) continue;
    const start = compareDate(yearStart, giftDate) < 0 ? giftDate : yearStart;

    // 判定が変わりうる日（その日から新しい判定になる）
    const candidates = [
      TRANSITION_START,
      TRANSITION_FULL7Y,
      yearsBefore(giftDate, -OLD_YEARS), // これより後の相続は 3 年超（応当日は 3 年以内に含む）
      yearsBefore(giftDate, -NEW_YEARS),
    ]
      .flatMap((d) => [d, nextDay(d)])
      .filter((d) => compareDate(d, start) > 0 && compareDate(d, yearEnd) <= 0)
      .sort(compareDate);

    const segments: HayamiSegment[] = [];
    let cur = start;
    const push = (from: DateParts, to: DateParts) => {
      const cls = classifyGift(giftDate, from);
      const kind = additionPeriod(from).kind;
      const last = segments.at(-1);
      if (last && last.cls === cls) last.to = to;
      else segments.push({ from, to, cls, kind });
    };
    for (const c of candidates) {
      if (compareDate(c, cur) <= 0) continue;
      push(cur, prevDay(c));
      cur = c;
    }
    push(cur, yearEnd);
    rows.push({ year, segments });
  }
  return rows;
}

// ─────────────────────────────────────────────
// 贈与税（暦年課税）
// ─────────────────────────────────────────────

export type TaxTable = 'general' | 'special';

/** 1,000 円未満切捨て（課税価格） */
const floor1000 = (v: number) => Math.floor(v / 1000) * 1000;
/** 100 円未満切捨て（税額） */
const floor100 = (v: number) => Math.floor(v / 100) * 100;
/** 0 以上の整数に丸める（負・NaN は 0） */
const clampAmount = (v: number) => Math.max(0, Math.floor(Number.isFinite(v) ? v : 0));

/** 基礎控除後の課税価格に当てはまる速算表の行 */
export function bracketFor(taxable: number, table: TaxTable): Bracket {
  const brackets = table === 'special' ? SPECIAL_BRACKETS : GENERAL_BRACKETS;
  return brackets.find((b) => taxable <= b.upTo)!;
}

/** 基礎控除後の課税価格 → 速算表で出した税額（端数処理前） */
export function taxOnTaxable(taxable: number, table: TaxTable): number {
  if (taxable <= 0) return 0;
  const b = bracketFor(taxable, table);
  return taxable * b.rate - b.deduction;
}

export interface GiftTaxOptions {
  /** 贈与者が直系尊属（父母・祖父母など）か */
  lineal: boolean;
  /** 受贈者が贈与を受けた年の 1 月 1 日に 18 歳以上か */
  adultOn0101: boolean;
}

export interface GiftTaxResult {
  /** その年の贈与の合計 */
  amount: number;
  /** 基礎控除後の課税価格（1,000 円未満切捨て） */
  taxable: number;
  /** 使った速算表。一般・特例が混在するときは 'mixed' */
  table: TaxTable | 'mixed';
  /** 当てはまった行（混在のときは特例側の行を `special`・一般側を `general` に入れる） */
  bracket?: Bracket;
  general?: { amount: number; fullTax: number; share: number };
  special?: { amount: number; fullTax: number; share: number };
  /** 納める贈与税（100 円未満切捨て） */
  tax: number;
  /** 実効税率（税額 ÷ 贈与の合計。0〜1） */
  effectiveRate: number;
}

/**
 * 一般贈与財産と特例贈与財産が混在する年の贈与税（No.4408 の（3））。
 *
 * ① 合計額を一般税率で計算した税額 × 一般贈与財産 ÷ 合計
 * ② 合計額を特例税率で計算した税額 × 特例贈与財産 ÷ 合計
 * ③ ① ＋ ②（100 円未満切捨て）
 *
 * どちらか一方が 0 なら、その速算表だけの計算と一致する。
 */
export function giftTaxMixed(parts: { general: number; special: number }): GiftTaxResult {
  const general = clampAmount(parts.general);
  const special = clampAmount(parts.special);
  const amount = general + special;
  const taxable = floor1000(Math.max(0, amount - BASIC_DEDUCTION));
  const generalFull = taxOnTaxable(taxable, 'general');
  const specialFull = taxOnTaxable(taxable, 'special');
  const generalShare = amount > 0 ? (generalFull * general) / amount : 0;
  const specialShare = amount > 0 ? (specialFull * special) / amount : 0;
  const tax = floor100(generalShare + specialShare);
  const table: GiftTaxResult['table'] = general > 0 && special > 0 ? 'mixed' : special > 0 ? 'special' : 'general';
  return {
    amount,
    taxable,
    table,
    bracket: table === 'mixed' ? undefined : bracketFor(taxable, table),
    general: general > 0 ? { amount: general, fullTax: generalFull, share: generalShare } : undefined,
    special: special > 0 ? { amount: special, fullTax: specialFull, share: specialShare } : undefined,
    tax,
    effectiveRate: amount > 0 ? tax / amount : 0,
  };
}

/**
 * 贈与税（暦年課税）。1 年間（1 月 1 日〜12 月 31 日）に受けた贈与の合計から基礎控除 110 万円を引き、
 * 速算表を当てる（No.4408）。
 *
 * 特例税率になるのは、受贈者が贈与年の 1 月 1 日に 18 歳以上で、贈与者が直系尊属のとき。
 * 一般と特例が混在するときは `linealAmount`（合計のうち直系尊属からの額）を渡すと按分する。
 */
export function giftTax(
  amount: number,
  { lineal, adultOn0101, linealAmount }: GiftTaxOptions & { linealAmount?: number },
): GiftTaxResult {
  const total = clampAmount(amount);
  if (!adultOn0101) return giftTaxMixed({ general: total, special: 0 });
  if (linealAmount !== undefined) {
    const special = Math.min(total, clampAmount(linealAmount));
    return giftTaxMixed({ general: total - special, special });
  }
  return lineal ? giftTaxMixed({ general: 0, special: total }) : giftTaxMixed({ general: total, special: 0 });
}

// ─────────────────────────────────────────────
// 相続時精算課税
// ─────────────────────────────────────────────

export interface SettlementResult {
  amount: number;
  /** 精算課税の基礎控除後の額。**相続時に加算されるのはこの額**（2024 年以後の贈与） */
  afterBasic: number;
  /** この年に使う特別控除 */
  specialDeductionUsed: number;
  /** この年のあとに残る特別控除 */
  specialDeductionLeft: number;
  /** 20% を掛ける課税価格（1,000 円未満切捨て） */
  taxable: number;
  /** この年の贈与税（100 円未満切捨て） */
  tax: number;
}

/**
 * 相続時精算課税を選んだ場合の当年の贈与税（No.4103）。
 * 年 110 万円の基礎控除 → 特別控除（累計 2,500 万円まで）→ 一律 20%。
 *
 * @param amount その特定贈与者からの 1 年間の贈与の合計
 * @param usedSpecialDeduction 前年までに使った特別控除の累計
 */
export function settlementTax(amount: number, usedSpecialDeduction = 0): SettlementResult {
  const a = clampAmount(amount);
  const used = Math.min(SETTLEMENT_SPECIAL_DEDUCTION, clampAmount(usedSpecialDeduction));
  const afterBasic = Math.max(0, a - BASIC_DEDUCTION);
  const remaining = SETTLEMENT_SPECIAL_DEDUCTION - used;
  const specialDeductionUsed = Math.min(afterBasic, remaining);
  const taxable = floor1000(afterBasic - specialDeductionUsed);
  return {
    amount: a,
    afterBasic,
    specialDeductionUsed,
    specialDeductionLeft: remaining - specialDeductionUsed,
    taxable,
    tax: floor100(taxable * SETTLEMENT_RATE),
  };
}

// ─────────────────────────────────────────────
// 表示の補助
// ─────────────────────────────────────────────

/** DateParts → '2027年1月1日' */
export function formatJaDate(d: DateParts): string {
  return `${d.year}年${d.month}月${d.day}日`;
}

/** DateParts → '1/1'（早見表の区間用） */
export function formatMd(d: DateParts): string {
  return `${d.month}/${d.day}`;
}

export { compareDate, formatDate, parseDate };
export type { DateParts };
