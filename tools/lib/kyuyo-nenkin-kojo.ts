/**
 * 給与と年金の控除 280万円上限 計算機（令和9年分＝2027年の収入から）
 *
 * 仕様: docs/features/kyuyo-nenkin-kojo-280man.md
 *
 * ■ 改正の内容（所得税法等の一部を改正する法律・令和8年法律第12号。2027-01-01施行）
 * 所得税法35条5項（新設）：
 *   その年中の給与所得控除額（28条2項）と公的年金等控除額（35条4項）の合計額が
 *   **280万円を超える場合**には、公的年金等控除額は、同項により計算した額から
 *   **その超える部分の金額を控除した金額**とする。
 * 削られるのは**年金の控除だけ**で、給与所得控除は削らない。給与だけ・年金だけの人は関係ない。
 *
 * ■ 一次確認の結果（e-Gov 法令API、2026-10-11 取得。仕様書の「一次確認」1〜6）
 * 1. 上限と比べる給与所得控除額は「28条2項に規定する給与所得控除額」＝**28条3項の式の額**。
 *    660万円未満の給与所得を4,000円刻みで決める別表第五（28条4項）は給与所得の額の決め方で、
 *    控除額の定義ではない。よって `salaryDeduction()` の式で測る
 * 2. 住民税：地方税法32条2項・313条2項が総所得金額を「所得税法…の計算の例により算定する」と
 *    しているので、同じ上限が**前年の所得に対して**かかる。2027年の所得 → **2028年度（令和10年度）分**の住民税
 * 3. 所得金額調整控除（租税特別措置法**41条の3の11**第2項。旧41条の3の3）：比べる「公的年金等に係る
 *    雑所得の金額」は、**35条5項の適用が無いものとして計算した金額**（同条4項6号）。つまり上限で
 *    削る前の年金の雑所得で判定し、削ったあとの給与所得から引く。
 *    公的年金等控除の表を選ぶ「年金以外の合計所得」は年金収入が無いものとして計算するので、
 *    調整控除（年金があることが要件）を引く前の給与所得を使う（lib/nenkin-kojo.ts）
 * 4. 公的年金等控除は lib/nenkin-kojo.ts（65歳以上の判定は12月31日時点）
 * 5. 給与所得控除は lib/furusato-nozei.ts の `salaryDeduction()`（令和8・9年分。二重に持たない）
 * 6. 所得税の基礎控除の特例（租税特別措置法41条の16の2第1項1号）は**令和8年分・令和9年分**が同じ額
 *    （489万円以下 +42万円、655万円以下 +5万円）。`basicDeductionIncomeTax()` がそのまま使える
 *
 * ■ 税額の目安
 * 所得控除は**基礎控除だけ**で計算する（社会保険料控除などがあれば課税所得はもっと小さい）。
 * 基礎控除は**改正前・改正後それぞれの合計所得で取り直す**（489万円・655万円の段差をまたぐと、
 * 増える所得税が「削られた控除 × 税率」より大きくなる）。
 * 2027年分の所得税は復興特別所得税1.1%＋防衛特別所得税1%で合計2.1%（`RECONSTRUCTION_RATE` の1.021と同じ）。
 *
 * ■ 年金の控除が年金収入を上回る人（65歳以上で年金110万円未満など）
 * 条文上の公的年金等控除額は最低額（110万円など）のままだが、収入を超える部分は所得に効かない。
 * `publicPensionDeduction()` は控除を年金収入で頭打ちにして返すので、ここでの「削られる額」は
 * **所得が実際に増える分**になる（例：65歳以上・年金100万円は、条文どおりなら給与630万円超から
 * 削られ始めるが、700万円までは控除が年金額を下回らず税額は変わらない。本ツールの線は700万円）。
 *
 * 【データ更新箇所】上限額が改正されたら CAP。控除額そのものは lib/nenkin-kojo.ts・lib/furusato-nozei.ts。
 */

import {
  BASIC_DEDUCTION_DIFF,
  RECONSTRUCTION_RATE,
  RESIDENT_RATE,
  adjustmentDeduction,
  basicDeductionIncomeTax,
  basicDeductionResidentTax,
  incomeTaxAmount,
  salaryIncome,
} from '@/lib/furusato-nozei';
import { pensionIncome, publicPensionDeduction } from '@/lib/nenkin-kojo';

/** 給与所得控除額と公的年金等控除額の合計の上限（所得税法35条5項）。【データ更新箇所】 */
export const CAP = 2_800_000;

/** 上限が始まる年分（令和9年分）。住民税は翌年度分（令和10年度）から */
export const FIRST_TAX_YEAR = 2027;
export const FIRST_RESIDENT_FISCAL_YEAR = 2028;

/** 所得金額調整控除（租税特別措置法41条の3の11第2項）の各上限と控除の起点 */
const ADJUSTMENT_UNIT = 100_000;

/** 線（上限にかかり始める給与）を探す範囲と刻み */
const THRESHOLD_SEARCH_MAX = 30_000_000;
const THRESHOLD_STEP = 10_000;

export interface KojoInput {
  /** 給与の年収（額面・円） */
  salary: number;
  /** 公的年金等の収入金額（年額・円） */
  pension: number;
  /** その年の12月31日時点で65歳以上か */
  age65: boolean;
  /** 年金・給与以外の所得（円。ふだんは0） */
  otherIncome: number;
}

/** 改正前（上限なし）／改正後（上限あり）のどちらか一方の計算結果 */
export interface KojoSide {
  /** 給与所得控除額 */
  salaryDeduction: number;
  /** 公的年金等控除額 */
  pensionDeduction: number;
  /** 控除の合計 */
  totalDeduction: number;
  /** 給与所得（所得金額調整控除の前） */
  salaryIncome: number;
  /** 公的年金等に係る雑所得 */
  pensionIncome: number;
  /** 所得金額調整控除（給与と年金の両方がある人の最大10万円） */
  adjustment: number;
  /** 合計所得金額 */
  totalIncome: number;
  /** 所得税の基礎控除 */
  basicDeduction: number;
  /** 所得税の課税所得（基礎控除だけを引いた目安。1,000円未満切捨て） */
  taxableIncome: number;
  /** 所得税（復興特別所得税・防衛特別所得税を含む目安） */
  incomeTax: number;
  /** 住民税の課税所得（基礎控除だけを引いた目安） */
  residentTaxable: number;
  /** 住民税所得割（調整控除の後。目安） */
  residentTax: number;
}

export interface KojoResult {
  before: KojoSide;
  after: KojoSide;
  /** 上限で削られる公的年金等控除の額（0なら上限にかからない） */
  cut: number;
  /** 給与と年金の両方がある（＝上限の対象になりうる）か */
  eligible: boolean;
  /** 2027年分の所得税で増える額 */
  incomeTaxIncrease: number;
  /** 2028年度の住民税で増える額 */
  residentTaxIncrease: number;
}

/** 給与所得控除額（28条3項の式）。収入 − 給与所得 なので整数になる */
function salaryDeductionOf(salary: number): number {
  if (!(salary > 0)) return 0;
  return salary - salaryIncome(salary);
}

/**
 * 上限で削る額（所得税法35条5項）。合計が280万円を超える部分。
 * 公的年金等控除額より多くは削れない。
 */
export function capAdjustment(salaryDeduction: number, pensionDeduction: number): number {
  const excess = salaryDeduction + pensionDeduction - CAP;
  return Math.max(0, Math.min(pensionDeduction, excess));
}

/**
 * 所得金額調整控除（租税特別措置法41条の3の11第2項）。
 * 給与所得と年金の雑所得（**上限で削る前**の額。同条4項6号）をそれぞれ10万円で頭打ちにして足し、10万円を引く。
 */
function incomeAdjustment(salaryIncomeAmount: number, pensionIncomeBeforeCap: number): number {
  if (salaryIncomeAmount <= 0 || pensionIncomeBeforeCap <= 0) return 0;
  const v =
    Math.min(salaryIncomeAmount, ADJUSTMENT_UNIT) +
    Math.min(pensionIncomeBeforeCap, ADJUSTMENT_UNIT) -
    ADJUSTMENT_UNIT;
  return Math.max(0, v);
}

/** 課税所得の1,000円未満切捨て */
const floor1000 = (v: number) => Math.max(0, Math.floor(v / 1000) * 1000);

function side(
  input: KojoInput,
  salaryDed: number,
  pensionDed: number,
  pensionIncomeBeforeCap: number,
): KojoSide {
  const salaryInc = salaryIncome(Math.max(0, input.salary));
  const pensionInc = pensionIncome(Math.max(0, input.pension), pensionDed);
  const adjustment = incomeAdjustment(salaryInc, pensionIncomeBeforeCap);
  const other = Math.max(0, input.otherIncome);
  const totalIncome = salaryInc - adjustment + pensionInc + other;

  const basicDeduction = basicDeductionIncomeTax(totalIncome);
  const taxableIncome = floor1000(totalIncome - basicDeduction);
  const incomeTax = Math.floor(incomeTaxAmount(taxableIncome) * RECONSTRUCTION_RATE);

  const residentTaxable = floor1000(totalIncome - basicDeductionResidentTax(totalIncome));
  const residentGross = Math.floor(residentTaxable * RESIDENT_RATE);
  const residentTax = Math.max(
    0,
    residentGross - adjustmentDeduction(residentTaxable, BASIC_DEDUCTION_DIFF, totalIncome),
  );

  return {
    salaryDeduction: salaryDed,
    pensionDeduction: pensionDed,
    totalDeduction: salaryDed + pensionDed,
    salaryIncome: salaryInc,
    pensionIncome: pensionInc,
    adjustment,
    totalIncome,
    basicDeduction,
    taxableIncome,
    incomeTax,
    residentTaxable,
    residentTax,
  };
}

/** 改正前（上限なし）と改正後（上限あり）の所得と税額 */
export function calc(input: KojoInput): KojoResult {
  const salary = Math.max(0, input.salary || 0);
  const pension = Math.max(0, input.pension || 0);
  const other = Math.max(0, input.otherIncome || 0);
  const normalized: KojoInput = { salary, pension, age65: input.age65, otherIncome: other };

  const salaryDed = salaryDeductionOf(salary);
  // 表を選ぶ「年金以外の合計所得」には給与所得を含める（入力欄の「その他の所得」だけではない）
  const pensionDedBefore = publicPensionDeduction(
    input.age65,
    pension,
    salaryIncome(salary) + other,
  );
  const eligible = salary > 0 && pension > 0;
  const cut = eligible ? capAdjustment(salaryDed, pensionDedBefore) : 0;
  const pensionIncomeBeforeCap = pensionIncome(pension, pensionDedBefore);

  const before = side(normalized, salaryDed, pensionDedBefore, pensionIncomeBeforeCap);
  const after = side(normalized, salaryDed, pensionDedBefore - cut, pensionIncomeBeforeCap);

  return {
    before,
    after,
    cut,
    eligible,
    incomeTaxIncrease: after.incomeTax - before.incomeTax,
    residentTaxIncrease: after.residentTax - before.residentTax,
  };
}

/** 給与 `salary` のときに上限で削られる額 */
function cutAt(input: Omit<KojoInput, 'salary'>, salary: number): number {
  return calc({ ...input, salary }).cut;
}

/**
 * 上限にかかり始める給与収入（円・1円単位）。
 * この額までは削られる額が0で、1円でも超えると削られる。給与をいくら増やしてもかからなければ null。
 *
 * 給与が増えると年金以外の合計所得の区分が上がって年金の控除が下がるため、削られる額は
 * 給与に対して単調ではない（いったんかかって、さらに給与が増えるとまた外れることがある）。
 * そこで1万円刻みで**最初に**かかる額を探し、その手前の1万円の中で二分探索する。
 */
export function thresholdSalaryYen(input: Omit<KojoInput, 'salary'>): number | null {
  if (!(input.pension > 0)) return null;
  for (let s = THRESHOLD_STEP; s <= THRESHOLD_SEARCH_MAX; s += THRESHOLD_STEP) {
    if (cutAt(input, s) <= 0) continue;
    let lo = s - THRESHOLD_STEP; // 削られない
    let hi = s; // 削られる
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (cutAt(input, mid) > 0) hi = mid;
      else lo = mid;
    }
    return lo;
  }
  return null;
}

/**
 * 上限にかかり始める給与収入を**万円単位に切り上げた**額（円）。画面の「給与 約○○万円を超えるとかかります」。
 * 65歳以上・年金200万円なら 6,300,000。1円単位の線は画面に出さない（仕様書「1円単位の線と4,000円刻み」）。
 */
export function thresholdSalary(input: Omit<KojoInput, 'salary'>): number | null {
  const yen = thresholdSalaryYen(input);
  if (yen === null) return null;
  return Math.ceil(yen / THRESHOLD_STEP) * THRESHOLD_STEP;
}
