/**
 * 源泉徴収票の検算（令和8年分）
 *
 * 仕様: docs/features/gensen-choshuhyo-kenzan.md
 *
 * 手元の源泉徴収票の4つの数字（支払金額・給与所得控除後の金額・所得控除の額の合計額・
 * 源泉徴収税額）から、票の計算が年末調整の順序どおりに合っているかを1行ずつ確かめる。
 *
 * ■ 新しい税率表を持たない
 * 別表第五（給与所得控除後の金額の表）・基礎控除・速算表・復興特別所得税の率は、
 * すべて lib/nenmatsu-chosei.ts（RULES_R8 / RULES_R7）と lib/furusato-nozei.ts のものを呼ぶ。
 * 年末調整の計算機（結果の予想）とこのツール（結果の検算）が同じ関数を2方向から使うので、
 * 片方の誤りがもう片方で見つかる。
 *
 * ■ 年税額の計算順（国税庁「年末調整のしかた」）
 *   1. 支払金額 → 別表第五 → 給与所得控除後の金額（− 所得金額調整控除）
 *   2. 給与所得控除後の金額 − 所得控除の額の合計額 ＝ 課税給与所得金額（1,000円未満切捨て）
 *   3. 速算表 → 算出所得税額
 *   4. − 住宅借入金等特別控除 ＝ 年調所得税額（0円未満にしない）
 *   5. × 102.1% ＝ 年調年税額（100円未満切捨て）＝ 票の「源泉徴収税額」
 *
 * 2〜5 は**票に書かれた数字をそのまま**使う（1が合わなくても2以降が連鎖して ✗ にならない）。
 *
 * ■ 住宅ローン控除は票の額をそのまま引く
 * 票の「住宅借入金等特別控除の額」は年末調整で**所得税から実際に引いた額**（住民税へ回る分を
 * 振り分けたあと）。lib/furusato-nozei.ts の applyHousingLoan は通さない（通すと二重に計算する）。
 *
 * ■ 入力はどこにも送らない
 * 計算は端末内だけ。金額を URL（クエリ・フラグメント）にも載せない
 * （lib/analytics.ts の page_view が page_location に URL を丸ごと渡すため）。
 *
 * 【データ更新箇所】年分を切り替えるときは TAX_YEAR と CURRENT_RULES / PREVIOUS_RULES、
 * 本文の改正点（REFORM_POINTS）を直す（docs/features/nenmatagi-2027-rollover.md と同じ段取り）。
 */

import { RECONSTRUCTION_RATE, incomeTaxAmount } from '@/lib/furusato-nozei';
import { convertWidth } from '@/lib/hankaku-zenkaku';
import { RULES_R7, RULES_R8, type YearRules } from '@/lib/nenmatsu-chosei';

/** このツールが検算する年分。title・本文の「令和8年分」はここから組み立てる */
export const TAX_YEAR = {
  /** 表示名 */
  label: '令和8年分',
  /** 西暦（交付期限の説明に使う） */
  year: 2026,
  /** 比較に使う前年の表示名 */
  previousLabel: '令和7年分',
} as const;

/** 検算に使う年分の控除（令和8年分） */
export const CURRENT_RULES: YearRules = RULES_R8;
/** 「去年の制度なら」の比較に使う控除（令和7年分） */
export const PREVIOUS_RULES: YearRules = RULES_R7;

/** 令和8年分で変わったところ（本文と「各欄の意味」で使う） */
export const REFORM_POINTS = {
  basicDeductionBefore: 580_000,
  basicDeductionAfterMax: 1_040_000,
  salaryDeductionMinBefore: 650_000,
  salaryDeductionMinAfter: 740_000,
} as const;

/** 確定申告が必要になる給与の額（給与の収入金額が2,000万円を超える人は年末調整の対象外） */
export const KAKUTEI_SALARY_LIMIT = 20_000_000;

/** 課税給与所得金額は1,000円未満を切り捨てる */
const floorTo1000 = (v: number) => Math.max(0, Math.floor(v / 1000) * 1000);
/** 年調年税額は100円未満を切り捨てる */
const floorTo100 = (v: number) => Math.max(0, Math.floor(v / 100) * 100);

/**
 * 源泉徴収票から写した金額の文字列を円の整数にする。
 * 全角数字・カンマ（全角・半角）・「円」「¥」・空白を受け付ける。
 * 空欄は null。数字として読めないもの・負の数も null（入力途中の扱いにする）。
 */
export function parseYen(raw: string): number | null {
  const half = convertWidth(raw, 'toHalf', { kana: false });
  const s = half.replace(/[,\s円¥￥、]/g, '');
  if (s === '') return null;
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

export interface GensenInput {
  /** 支払金額 */
  payment: number;
  /** 給与所得控除後の金額（調整控除後） */
  salaryIncome: number;
  /** 所得控除の額の合計額 */
  deductionTotal: number;
  /** 源泉徴収税額 */
  withheldTax: number;
  /** 住宅借入金等特別控除の額（任意） */
  housingLoanCredit?: number | null;
  /** 基礎控除の額（任意） */
  basicDeduction?: number | null;
  /** 所得金額調整控除額（任意） */
  adjustmentDeduction?: number | null;
  /** 社会保険料等の金額（任意） */
  socialInsurance?: number | null;
  /** 生命保険料の控除額（任意） */
  lifeInsurance?: number | null;
  /** 地震保険料の控除額（任意） */
  earthquakeInsurance?: number | null;
  /** 摘要欄に「年調未済」の印がある */
  notAdjusted?: boolean;
  /** 種別欄が「乙欄」 */
  otsu?: boolean;
}

/** 一致しないときの「よくある理由」 */
export type MismatchReason = 'adjustment-deduction' | 'previous-employer' | 'not-adjusted';

export const MISMATCH_REASON_TEXT: Record<MismatchReason, string> = {
  'adjustment-deduction':
    '所得金額調整控除（23歳未満の扶養親族や特別障害者がいる・給与と年金の両方がある、など）を受けている。票の「所得金額調整控除額」の欄に額があれば、それを入れて確かめてください',
  'previous-employer':
    '年の途中で入社し、前の勤務先の給与と源泉徴収税額を合算して年末調整している（支払金額・源泉徴収税額に前職分が入る）。前職の源泉徴収票を提出していないと合算されません',
  'not-adjusted':
    '年末調整をしていない（摘要欄に「年調未済」とある、12月より前に退職した、など）。この場合の源泉徴収税額は毎月引かれた額の合計で、年税額とは一致しません',
};

/** 4つの欄の検算の1行 */
export interface CheckLine {
  /** 票の数字と一致したか。課税給与所得金額は票に欄が無いので null（計算の途中経過） */
  ok: boolean | null;
  /** 計算した値 */
  expected: number;
  /** 票の値（課税給与所得金額は null） */
  actual: number | null;
}

export interface GensenBreakdown {
  /** 基礎控除（入力があればその額、無ければ合計所得から推定） */
  basicDeduction: number;
  /** 基礎控除を推定したか */
  basicDeductionEstimated: boolean;
  /** 社会保険料等（入力があれば） */
  socialInsurance: number | null;
  /** 生命保険料の控除額（入力があれば） */
  lifeInsurance: number | null;
  /** 地震保険料の控除額（入力があれば） */
  earthquakeInsurance: number | null;
  /** 所得控除の合計から、上の内訳を引いた残り（配偶者・扶養・iDeCo など） */
  others: number;
}

export interface PreviousYearComparison {
  /** 令和7年分の制度で計算した年税額（概算） */
  yearTax: number;
  /** 令和7年分の制度との差（プラスなら去年の制度のほうが多い） */
  difference: number;
  /** 令和7年分の基礎控除（比較に使った額） */
  basicDeduction: number;
  /** 令和7年分の給与所得控除後の金額（比較に使った額） */
  salaryIncome: number;
}

export type GensenResult =
  | {
      /** 年調未済・乙欄：検算をせず確定申告の判定へ案内する */
      status: 'skipped';
      reason: 'not-adjusted' | 'otsu';
      recommendKakutei: true;
    }
  | {
      status: 'checked';
      /** 支払金額 → 給与所得控除後の金額 */
      salaryIncome: CheckLine & { adjustmentDeduction: number };
      /** 課税給与所得金額（票の数字から出した途中経過） */
      taxableIncome: CheckLine;
      /** 算出所得税額（速算表） */
      calculatedTax: number;
      /** 引いた住宅借入金等特別控除（算出所得税額を超えた分は引かない） */
      housingLoanCredit: number;
      /** 年調所得税額 */
      adjustedTax: number;
      /** 年調年税額 → 源泉徴収税額 */
      yearTax: CheckLine;
      /** 2つの検算がどちらも一致したか */
      allOk: boolean;
      /** 一致しないときの理由の候補（最大3つ） */
      reasons: MismatchReason[];
      /** 所得控除の額の合計額の内訳 */
      breakdown: GensenBreakdown;
      /** 令和7年分の制度との比較（基礎控除と給与所得控除だけを差し替えた概算） */
      previous: PreviousYearComparison;
      /** 確定申告を強く案内するか（給与2,000万円超） */
      recommendKakutei: boolean;
    };

/** 票の数字から年調年税額を出す（住宅ローン控除は票の額をそのまま引く） */
function yearTaxFrom(salaryIncome: number, deductionTotal: number, housingLoanCredit: number) {
  const taxableIncome = floorTo1000(salaryIncome - deductionTotal);
  const calculatedTax = incomeTaxAmount(taxableIncome);
  const credit = Math.min(Math.max(0, housingLoanCredit), calculatedTax);
  const adjustedTax = Math.max(0, calculatedTax - credit);
  const yearTax = floorTo100(adjustedTax * RECONSTRUCTION_RATE);
  return { taxableIncome, calculatedTax, credit, adjustedTax, yearTax };
}

const nz = (v: number | null | undefined) => Math.max(0, Math.floor(v ?? 0));

/**
 * 源泉徴収票を検算する。
 *
 * @returns 年調未済・乙欄なら status: 'skipped'。それ以外は各欄の検算・内訳・令和7年比
 */
export function checkGensenChoshuhyo(input: GensenInput): GensenResult {
  if (input.notAdjusted) return { status: 'skipped', reason: 'not-adjusted', recommendKakutei: true };
  if (input.otsu) return { status: 'skipped', reason: 'otsu', recommendKakutei: true };

  const payment = nz(input.payment);
  const salaryIncome = nz(input.salaryIncome);
  const deductionTotal = nz(input.deductionTotal);
  const withheldTax = nz(input.withheldTax);
  const adjustment = nz(input.adjustmentDeduction);
  const housingLoan = nz(input.housingLoanCredit);

  // 1. 支払金額 → 給与所得控除後の金額（別表第五。660万円未満は表、以上は式）
  const tableIncome = CURRENT_RULES.salaryIncome(payment);
  const expectedSalaryIncome = Math.max(0, tableIncome - adjustment);
  const salaryOk = expectedSalaryIncome === salaryIncome;

  // 2〜5. 票の数字をそのまま使って年税額を出す
  const t = yearTaxFrom(salaryIncome, deductionTotal, housingLoan);
  const taxOk = t.yearTax === withheldTax;
  const allOk = salaryOk && taxOk;

  const reasons: MismatchReason[] = [];
  if (!allOk) {
    // 給与所得控除後の金額が表より小さく、調整控除を入れていないなら、それが一番ありそう
    if (!salaryOk && adjustment === 0 && salaryIncome < tableIncome) {
      reasons.push('adjustment-deduction');
    }
    reasons.push('previous-employer', 'not-adjusted');
    if (!reasons.includes('adjustment-deduction')) reasons.push('adjustment-deduction');
  }

  // 所得控除の額の合計額の内訳
  const basicEstimated = input.basicDeduction == null;
  const basic = basicEstimated
    ? CURRENT_RULES.basicDeduction(salaryIncome)
    : nz(input.basicDeduction);
  const social = input.socialInsurance == null ? null : nz(input.socialInsurance);
  const life = input.lifeInsurance == null ? null : nz(input.lifeInsurance);
  const quake = input.earthquakeInsurance == null ? null : nz(input.earthquakeInsurance);
  const others = deductionTotal - basic - (social ?? 0) - (life ?? 0) - (quake ?? 0);

  // 令和7年分の制度なら：基礎控除と給与所得控除の2つだけを差し替える
  const prevSalaryIncome = Math.max(
    0,
    salaryIncome + (PREVIOUS_RULES.salaryIncome(payment) - tableIncome),
  );
  const prevBasic = PREVIOUS_RULES.basicDeduction(prevSalaryIncome);
  const prevDeductionTotal = Math.max(0, deductionTotal - basic + prevBasic);
  const prev = yearTaxFrom(prevSalaryIncome, prevDeductionTotal, housingLoan);

  return {
    status: 'checked',
    salaryIncome: {
      ok: salaryOk,
      expected: expectedSalaryIncome,
      actual: salaryIncome,
      adjustmentDeduction: adjustment,
    },
    taxableIncome: { ok: null, expected: t.taxableIncome, actual: null },
    calculatedTax: t.calculatedTax,
    housingLoanCredit: t.credit,
    adjustedTax: t.adjustedTax,
    yearTax: { ok: taxOk, expected: t.yearTax, actual: withheldTax },
    allOk,
    reasons: reasons.slice(0, 3),
    breakdown: {
      basicDeduction: basic,
      basicDeductionEstimated: basicEstimated,
      socialInsurance: social,
      lifeInsurance: life,
      earthquakeInsurance: quake,
      others,
    },
    previous: {
      yearTax: prev.yearTax,
      difference: prev.yearTax - t.yearTax,
      basicDeduction: prevBasic,
      salaryIncome: prevSalaryIncome,
    },
    recommendKakutei: payment > KAKUTEI_SALARY_LIMIT,
  };
}

/** 基礎控除の段（「各欄の意味」の説明に使う）。令和8年分の段の上限を返す */
export function basicDeductionBandLabel(totalIncome: number): string {
  if (totalIncome <= 4_890_000) return '合計所得489万円以下';
  if (totalIncome <= 6_550_000) return '合計所得489万円超655万円以下';
  if (totalIncome <= 23_500_000) return '合計所得655万円超2,350万円以下';
  return '合計所得2,350万円超';
}
