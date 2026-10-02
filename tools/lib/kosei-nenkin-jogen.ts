/**
 * 厚生年金 標準報酬月額 上限引き上げ 計算機
 *
 * 仕様: docs/features/kosei-nenkin-hyojun-hoshu-jogen.md
 *
 * 令和7年法律第74号で、厚生年金の標準報酬月額の上限が 65万 → 68万（2027-09）→ 71万（2028-09）
 * → 75万円（2029-09）と段階的に上がる。月給（報酬月額）から、各段階の本人負担と増加額、
 * 将来の老齢厚生年金（報酬比例部分）の増加の目安を出す。
 *
 * 一次情報:
 * - 厚生労働省「厚生年金等の標準報酬月額の上限の段階的引上げについて」
 *   https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000147284_00024.html
 * - 日本年金機構「厚生年金保険料額表」（現行32等級・料率18.3%）
 * - 日本年金機構「老齢厚生年金の年金額」（平成15年4月以後 5.481/1000）
 *
 * 制度データは持たない。上限の段階は `shaho-grades.ts` の `PENSION_CAP_STAGES`、
 * 料率は `shaho-ryoritsu.ts` の `PENSION_RATE`、給付乗率は `hatarakizon.ts` の `PENSION_ACCRUAL_RATE`。
 */

import { PENSION_ACCRUAL_RATE } from './hatarakizon';
import {
  GRADES,
  PENSION_CAP_STAGES,
  PENSION_STANDARD_MIN,
  pensionCapAt,
  roundPremium,
  standardMonthly,
} from './shaho-grades';
import { PENSION_RATE } from './shaho-ryoritsu';

export { pensionCapAt };

/** 健康保険の等級から厚生年金の等級を出す差（健保4等級 88,000円 ＝ 厚生年金1等級） */
const HEALTH_TO_PENSION_GRADE_OFFSET = 3;

/** 最初の引き上げの施行日。年金の増加はここから数える */
export const FIRST_RAISE_FROM = PENSION_CAP_STAGES[1].effectiveFrom as string;

/** 引き上げの影響を受ける報酬月額の下限（66.5万円。健保36等級の下限） */
export const AFFECTED_FROM = (() => {
  const row = GRADES.find((g) => g[1] === PENSION_CAP_STAGES[1].cap);
  if (!row) throw new Error('PENSION_CAP_STAGES の上限が GRADES にありません');
  return row[2];
})();

/** 年齢を入れないときに年金の増加を数える月数（10年） */
export const DEFAULT_MONTHS = 120;

/** 年金の増加を数える終わりの年齢（仕様：60 歳まで） */
export const END_AGE = 60;

/** 住民税の所得割（社会保険料控除で戻る分の目安に使う） */
export const RESIDENT_TAX_RATE = 0.1;

/** 任意入力の所得税率の選択肢（速算表の税率。復興特別所得税は含めない） */
export const INCOME_TAX_RATES = [0.05, 0.1, 0.2, 0.23, 0.33, 0.4, 0.45] as const;

/** その日に効いている厚生年金の標準報酬月額（健保の等級を引いて、下限・その日の上限で丸める） */
export function standardMonthlyAt(salary: number, date: string): number {
  const std = standardMonthly(Math.max(0, salary));
  return Math.min(pensionCapAt(date), Math.max(PENSION_STANDARD_MIN, std));
}

/** 標準報酬月額から厚生年金の等級を出す */
export function pensionGradeOf(standard: number): number {
  const row = GRADES.find((g) => g[1] === standard);
  if (!row) throw new Error(`標準報酬月額 ${standard} が GRADES にありません`);
  return row[0] - HEALTH_TO_PENSION_GRADE_OFFSET;
}

/**
 * 本人負担の厚生年金保険料（月額）。50銭以下切捨て・50銭超切上げ（保険料額表と同じ）。
 * 料率を掛けた値は二進小数で 0.4999… のようにずれうるので、銭の単位で丸めてから端数処理する。
 */
export function employeePremium(standard: number): number {
  const sen = Math.round(standard * PENSION_RATE * 100);
  return roundPremium(sen / 100);
}

export interface StagePoint {
  /** 施行日（現行は null） */
  effectiveFrom: string | null;
  /** 保険料が控除される最初の給与の月 'YYYY-MM'（施行月の翌月。現行は null） */
  deductedFrom: string | null;
  /** その段階の上限 */
  cap: number;
  /** その月給の標準報酬月額 */
  standard: number;
  /** 厚生年金の等級 */
  grade: number;
  /** 本人負担（月額） */
  employee: number;
  /** 会社負担（月額。本人と同額） */
  employer: number;
  /** 現行からの本人負担の増加（月額） */
  diff: number;
}

/** 'YYYY-MM-DD' の翌月 'YYYY-MM' */
function nextMonth(date: string): string {
  const [y, m] = date.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** 現行・2027-09・2028-09・2029-09 の4時点の本人負担と差額 */
export function premiumDiff(salary: number): StagePoint[] {
  const base = employeePremium(standardMonthlyAt(salary, '2000-01-01'));
  return PENSION_CAP_STAGES.map((stage) => {
    const date = stage.effectiveFrom ?? '2000-01-01';
    const standard = standardMonthlyAt(salary, date);
    const employee = employeePremium(standard);
    return {
      effectiveFrom: stage.effectiveFrom ?? null,
      deductedFrom: stage.effectiveFrom ? nextMonth(stage.effectiveFrom) : null,
      cap: stage.cap,
      standard,
      grade: pensionGradeOf(standard),
      employee,
      employer: employee,
      diff: employee - base,
    };
  });
}

/** 引き上げの影響を受けるか（報酬月額 66.5万円以上） */
export function isAffected(salary: number): boolean {
  return salary >= AFFECTED_FROM;
}

/** 'YYYY-MM' / 'YYYY-MM-DD' → 通し月番号 */
function monthIndex(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return y * 12 + (m - 1);
}

/** 通し月番号 → 'YYYY-MM' */
function formatMonthIndex(idx: number): string {
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

/**
 * 保険料・年金の増加を数え始める月 'YYYY-MM'。最初の引き上げ（2027-09）と `today` の月の遅いほう。
 * 施行後に開いたとき、過ぎた月を数えないため（#294 レビュー）。
 *
 * @param today 'YYYY-MM-DD'。既定値を持たない（呼ぶ側が決める）
 */
export function countStartMonth(today: string): string {
  return formatMonthIndex(Math.max(monthIndex(FIRST_RAISE_FROM), monthIndex(today)));
}

export interface Accumulation {
  /** 数えた月数 */
  months: number;
  /** 本人負担の増加の累計 */
  premiumTotal: number;
  /** 老齢厚生年金（報酬比例部分）の増加（年額） */
  pensionPerYear: number;
  /** 同（月額） */
  pensionPerMonth: number;
}

/**
 * `startMonth` から `months` か月払ったときの、保険料の増加累計と年金の増加。
 * 3段階の途中は月ごとに上限を切り替える（段階込み）。
 * 年金は「上限の差 × 5.481/1000 × 月数」。再評価・マクロ経済スライドは入れない目安。
 *
 * @param startMonth 数え始める月 'YYYY-MM'。画面では `countStartMonth(today)` を渡す。
 *   既定値を持たない（`pensionCapAt` と同じ約束。施行後に開いたとき過ぎた月を積まないため）
 */
export function accumulate(salary: number, months: number, startMonth: string): Accumulation {
  const n = Math.max(0, Math.floor(months));
  const start = monthIndex(startMonth);
  const baseStd = standardMonthlyAt(salary, '2000-01-01');
  const basePremium = employeePremium(baseStd);
  let premiumTotal = 0;
  let stdDiffTotal = 0;
  for (let i = 0; i < n; i++) {
    const std = standardMonthlyAt(salary, `${formatMonthIndex(start + i)}-01`);
    premiumTotal += employeePremium(std) - basePremium;
    stdDiffTotal += std - baseStd;
  }
  const pensionPerYear = Math.round(stdDiffTotal * PENSION_ACCRUAL_RATE);
  return {
    months: n,
    premiumTotal,
    pensionPerYear,
    pensionPerMonth: Math.round(pensionPerYear / 12),
  };
}

/** 年金の増加（年額・月額）。`accumulate` の年金側だけ */
export function pensionGain(
  salary: number,
  months: number,
  startMonth: string,
): { perYear: number; perMonth: number } {
  const a = accumulate(salary, months, startMonth);
  return { perYear: a.pensionPerYear, perMonth: a.pensionPerMonth };
}

/**
 * 保険料の増加累計 ÷ 年金の増加年額（年）。年金が増えないときは null。
 * 「得・損」の判断ではなく、2つの数字の比の説明に使う。
 */
export function breakEvenYears(premiumTotal: number, pensionPerYear: number): number | null {
  if (pensionPerYear <= 0) return null;
  return premiumTotal / pensionPerYear;
}

/**
 * 社会保険料控除で所得税・住民税が戻る分を引いた、実質の負担増（月額の目安）。
 * 所得税率（復興特別所得税を含めない）＋住民税10%を掛けて引くだけ。
 */
export function netCostWithTax(diff: number, incomeTaxRate: number): number {
  return Math.round(diff * (1 - incomeTaxRate - RESIDENT_TAX_RATE));
}

/**
 * いまの年齢から、`countStartMonth(today)` 以後 60 歳になるまでに払う月数の目安。
 * 誕生日を聞かないので、`today` 時点でちょうどその年齢になったとして数える。年齢の端数は切り捨てる。
 *
 * @param today 'YYYY-MM-DD'。既定値を持たない（呼ぶ側が決める）
 */
export function monthsUntilEndAge(age: number, today: string): number {
  const endIdx = monthIndex(today) + (END_AGE - Math.floor(age)) * 12;
  return Math.max(0, endIdx - monthIndex(countStartMonth(today)));
}

/** 'YYYY-MM' → '2027年10月' */
export function formatMonthJa(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${y}年${m}月`;
}
