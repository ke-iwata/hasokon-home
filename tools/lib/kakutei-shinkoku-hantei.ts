/**
 * 確定申告が必要か 判定（令和8年分＝2026年の所得）
 *
 * 仕様: docs/features/kakutei-shinkoku-hitsuyo-hantei.md
 *
 * 答えを3つに分けて返す。フローチャート型の診断は 1 だけを答えて 2・3 を落としがちなので、
 * ここではかならず3つを別々に出す。
 *
 *   1. 所得税の確定申告が要るか（所得税法120条・121条）
 *   2. 申告義務が無くても、申告すれば戻る可能性があるか（還付申告。翌年1月1日から5年間）
 *   3. 所得税の申告をしない場合に、住民税の申告が要るか（地方税法317条の2）
 *
 * ■ 一次確認（2026-10-11）
 * - 国税庁 タックスアンサー No.1900「給与所得者で確定申告が必要な人」〔令和8年4月1日現在法令等〕
 *   … 2,000万円・1か所で20万円・2か所で20万円（150万円の注）・源泉徴収義務の無い者からの給与・
 *   「所得金額の合計額に含まれない所得」（特定口座の源泉徴収あり等）。仕様書の表と同じ
 * - No.1900 の質疑応答「確定申告を要しない場合の意義」… 還付申告をするなら20万円以下の所得も併せて書く
 * - No.1600「公的年金等の課税関係」〔令和8年4月1日現在法令等〕… 収入400万円以下かつ年金以外の所得20万円以下で
 *   申告不要。源泉徴収されない年金（外国の年金など）がある人はこの制度を使えない。
 *   「住民税の申告が必要な場合があります」（注2）
 * - No.1910「中途退職で年末調整を受けていないとき」… 翌年1月1日から5年間、還付申告ができる
 *
 * ■ この判定でやらないこと（仕様書「やらないこと」）
 * - 税額・還付額の計算（要否と「次にどのツールで計算するか」まで）
 * - 120条の判定は「課税所得 > 0 か」の概算だけで見る。配当控除などの税額控除・予定納税は対象外
 * - 2か所給与の150万円の注は、社会保険料控除などを引く前の給与収入で見る（引ける控除を聞かないので、
 *   不要な人を「要」と出す側に倒れる。申告漏れの側には倒れない）
 *
 * 【データ更新箇所】年分を上げるときは TAX_YEAR と下の閾値（一次確認の差分）だけ。
 * 給与所得控除・基礎控除は lib/furusato-nozei.ts のものを使っているので、ここには持たない。
 */

import {
  basicDeductionIncomeTax,
  basicDeductionResidentTax,
  salaryIncome,
} from '@/lib/furusato-nozei';
import { isBusinessDay } from '@/lib/nissu-keisan';

// ---------------------------------------------------------------- 制度データ

/** 判定の対象の年分（この年の所得を翌年に申告する） */
export const TAX_YEAR = 2026;

/** 一次情報（国税庁 No.1900・No.1600・No.1910）を最後に確かめた日 */
export const DATA_CHECKED_AT = '2026-10-11';

/** 給与の収入がこれを超えると、年末調整の対象外で申告が要る（No.1900 の1） */
export const SALARY_LIMIT = 20_000_000;

/** 給与・年金以外の所得がこれを超えると申告が要る（所法121①・③） */
export const OTHER_INCOME_LIMIT = 200_000;

/** 2か所給与の注：給与収入（− 一部の所得控除）がこれ以下なら不要（No.1900 の3の注） */
export const TWO_SALARIES_EXEMPT_LIMIT = 1_500_000;

/** 公的年金等の収入がこれ以下なら申告不要（No.1600） */
export const PENSION_LIMIT = 4_000_000;

/**
 * 公的年金等控除（令和2年分以後・公的年金等以外の合計所得 1,000万円以下の表）。
 * 年齢は12月31日時点で65歳以上かどうか。No.1600「公的年金等に係る雑所得の速算表」
 */
export function pensionDeduction(income: number, over65: boolean): number {
  if (income <= 0) return 0;
  const minimum = over65 ? 1_100_000 : 600_000;
  let d: number;
  if (income <= 4_100_000) d = income * 0.25 + 275_000;
  else if (income <= 7_700_000) d = income * 0.15 + 685_000;
  else if (income <= 10_000_000) d = income * 0.05 + 1_455_000;
  else d = 1_955_000;
  return Math.min(income, Math.max(minimum, d));
}

/** 公的年金等に係る雑所得 */
export function pensionIncome(income: number, over65: boolean): number {
  return Math.max(0, Math.floor(income - pensionDeduction(income, over65)));
}

// ---------------------------------------------------------------- 期日

/** 'YYYY-MM-DD' を作る */
function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 土日祝なら翌日以降の最初の平日へ（国税通則法10条2項） */
function rollForward(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month - 1, day));
  while (
    !isBusinessDay({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() })
  ) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** 確定申告期間の初日（翌年2月16日） */
export function filingStart(taxYear = TAX_YEAR): string {
  return ymd(taxYear + 1, 2, 16);
}

/** 確定申告の期限（翌年3月15日。土日祝なら翌平日） */
export function filingDeadline(taxYear = TAX_YEAR): string {
  return rollForward(taxYear + 1, 3, 15);
}

/** 還付申告を出せる最初の日（翌年1月1日） */
export function refundStart(taxYear = TAX_YEAR): string {
  return ymd(taxYear + 1, 1, 1);
}

/** 還付申告を出せる最後の日（翌年1月1日から5年間＝5年後の12月31日） */
export function refundDeadline(taxYear = TAX_YEAR): string {
  return ymd(taxYear + 5, 12, 31);
}

// ---------------------------------------------------------------- 入力

/** 収入の種類（質問1） */
export interface IncomeKinds {
  salary: boolean;
  pension: boolean;
  business: boolean;
  realEstate: boolean;
  side: boolean;
  stocks: boolean;
}

/** 戻るかもしれないもの（質問5） */
export interface RefundChecks {
  /** 医療費が10万円（または総所得金額等の5%）を超えた */
  medical: boolean;
  /** ふるさと納税で、6団体以上に寄附した・またはワンストップ特例の申請を出していない */
  furusato: boolean;
  /** ふるさと納税のワンストップ特例の申請書を出した寄附がある */
  onestopApplied: boolean;
  /** 住宅ローン控除の1年目 */
  housingLoanFirst: boolean;
  /** セルフメディケーション税制 */
  selfMedication: boolean;
  /** 災害・盗難にあった（雑損控除） */
  disaster: boolean;
  /** 退職金で「退職所得の受給に関する申告書」を出していない（20.42%で源泉徴収されている） */
  retirementNoDeclaration: boolean;
}

export interface HanteiInput {
  kinds: IncomeKinds;
  /** 給与を受けた勤務先が2か所以上か */
  salaryTwoOrMore: boolean;
  /** 主たる勤務先で年末調整を受けたか（年の途中で退職して再就職していない＝false） */
  yearEndAdjusted: boolean;
  /** 給与の年収（2か所以上なら年末調整を受けた勤務先の分） */
  salaryMain: number;
  /** 2か所以上のとき、年末調整されなかった給与の年収 */
  salarySub: number;
  /** 公的年金等の収入（年額） */
  pensionAnnual: number;
  /** 12月31日時点で65歳以上か（公的年金等控除の区分） */
  over65: boolean;
  /** 源泉徴収されていない年金（外国の年金など）がある */
  unwithheldPension: boolean;
  /**
   * 給与・年金以外の**所得**の合計（収入 − 経費）。
   * 特定口座（源泉徴収あり）の利益など、申告しないことを選べるものは入れない（No.1900）
   */
  otherIncome: number;
  refund: RefundChecks;
}

export const EMPTY_REFUND: RefundChecks = {
  medical: false,
  furusato: false,
  onestopApplied: false,
  housingLoanFirst: false,
  selfMedication: false,
  disaster: false,
  retirementNoDeclaration: false,
};

export const NO_KINDS: IncomeKinds = {
  salary: false,
  pension: false,
  business: false,
  realEstate: false,
  side: false,
  stocks: false,
};

// ---------------------------------------------------------------- 出力

/**
 * 所得税の判定の理由（仕様書の表の行）。文面は page 側で ID から引く。
 * `-over-` / `two-salaries` / `no-withholding-pension` / `business-tax-due` は「要る」側、
 * それ以外は「要らない」側の理由
 */
export type Reason =
  | 'salary-over-20m'
  | 'salary-other-income-over-200k'
  | 'salary-other-income-under-200k'
  | 'two-salaries'
  | 'two-salaries-under-limit'
  | 'pension-over-4m'
  | 'pension-other-income-over-200k'
  | 'pension-under-4m'
  | 'no-withholding-pension'
  | 'business-tax-due'
  | 'no-tax-due'
  | 'no-income';

/** 戻るかもしれないもの */
export type RefundHint =
  | 'medical'
  | 'self-medication'
  | 'furusato'
  | 'housing-loan-first'
  | 'retired-no-adjustment'
  | 'retirement-no-declaration'
  | 'disaster';

/** 結果に添える注記 */
export type Note =
  /** 還付申告をするなら、20万円以下の副業などの所得も含める（No.1900 質疑応答） */
  | 'refund-include-other-income'
  /** 確定申告をするとワンストップ特例は無効になる。全部の寄附を申告書に書く */
  | 'onestop-invalid'
  /** 年金だけの人：源泉徴収票に載らない控除（医療費・社会保険料など）を住民税に効かせるなら申告が要る */
  | 'pension-resident-deductions'
  /** 2か所給与の150万円の注は、社会保険料控除などを引く前の給与で見ている */
  | 'two-salaries-gross';

export type IncomeTaxAnswer = 'required' | 'notRequired' | 'notRequiredButRefund';
export type ResidentTaxAnswer = 'required' | 'notRequired' | 'unknown';

export interface HanteiResult {
  incomeTax: IncomeTaxAnswer;
  reasons: Reason[];
  refundHints: RefundHint[];
  notes: Note[];
  /** 所得税の確定申告（還付申告を含む）をしない場合に、住民税の申告が要るか */
  residentTax: ResidentTaxAnswer;
  /** 概算の合計所得金額（理由の説明用） */
  totalIncome: number;
}

/** 還付の行き先のツール（公開済みかどうかは page 側で PublicToolLink に任せる） */
export const REFUND_HINT_TOOL: Record<RefundHint, string | null> = {
  medical: 'iryohi-kojo',
  'self-medication': 'iryohi-kojo',
  furusato: 'furusato-nozei',
  'housing-loan-first': 'jutaku-loan-kojo',
  'retired-no-adjustment': 'nenmatsu-chosei',
  'retirement-no-declaration': 'taishokukin-tedori',
  disaster: null,
};

/** 理由が「申告が要る」側か */
export function isRequiredReason(r: Reason): boolean {
  return (
    r === 'salary-over-20m' ||
    r === 'salary-other-income-over-200k' ||
    r === 'two-salaries' ||
    r === 'pension-over-4m' ||
    r === 'pension-other-income-over-200k' ||
    r === 'no-withholding-pension' ||
    r === 'business-tax-due'
  );
}

/** 0未満・NaN を 0 に */
function amount(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

// ---------------------------------------------------------------- 判定

export function judge(input: HanteiInput): HanteiResult {
  const k = input.kinds;
  const hasSalary = k.salary;
  const hasPension = k.pension;
  const hasOther = k.business || k.realEstate || k.side || k.stocks;

  const salaryMain = hasSalary ? amount(input.salaryMain) : 0;
  const salarySub = hasSalary && input.salaryTwoOrMore ? amount(input.salarySub) : 0;
  const salaryTotal = salaryMain + salarySub;
  const pensionAnnual = hasPension ? amount(input.pensionAnnual) : 0;
  const other = hasOther ? amount(input.otherIncome) : 0;

  const salaryInc = salaryIncome(salaryTotal);
  const pensionInc = pensionIncome(pensionAnnual, input.over65);
  const totalIncome = salaryInc + pensionInc + other;

  // 120条：基礎控除を引いても課税所得が残るか（概算。税額控除・社会保険料控除は見ない）
  const taxDue = totalIncome - basicDeductionIncomeTax(totalIncome) > 0;

  const reasons: Reason[] = [];
  const unwithheld = hasPension && input.unwithheldPension;

  if (!hasSalary && !hasPension && other === 0) {
    reasons.push('no-income');
  } else {
    // 給与（No.1900）。年金の雑所得は「給与所得・退職所得以外の所得」に入る
    if (hasSalary) {
      const nonSalary = other + pensionInc;
      if (salaryTotal > SALARY_LIMIT) {
        reasons.push('salary-over-20m');
      } else if (input.salaryTwoOrMore) {
        const exempt = salaryTotal <= TWO_SALARIES_EXEMPT_LIMIT && nonSalary <= OTHER_INCOME_LIMIT;
        if (!exempt && salarySub + nonSalary > OTHER_INCOME_LIMIT) reasons.push('two-salaries');
        else reasons.push('two-salaries-under-limit');
      } else if (nonSalary > OTHER_INCOME_LIMIT) {
        reasons.push('salary-other-income-over-200k');
      } else {
        reasons.push('salary-other-income-under-200k');
      }
    }
    // 公的年金等（No.1600）。給与所得は「公的年金等に係る雑所得以外の所得」に入る
    if (hasPension) {
      const nonPension = other + salaryInc;
      if (pensionAnnual > PENSION_LIMIT) reasons.push('pension-over-4m');
      if (nonPension > OTHER_INCOME_LIMIT) reasons.push('pension-other-income-over-200k');
      if (unwithheld) reasons.push('no-withholding-pension');
      if (pensionAnnual <= PENSION_LIMIT && nonPension <= OTHER_INCOME_LIMIT && !unwithheld) {
        reasons.push('pension-under-4m');
      }
    }
    // 給与も年金も無い（事業・不動産・副業だけ）：120条そのもの
    if (!hasSalary && !hasPension && taxDue) reasons.push('business-tax-due');
  }

  // 121条の特例に当てはまらなくても、所得税額が出なければ120条の申告義務は無い
  let required = reasons.some(isRequiredReason);
  if (!taxDue && (required || (!hasSalary && !hasPension && other > 0))) {
    reasons.push('no-tax-due');
    required = false;
  }

  // 還付申告
  const r = input.refund;
  const refundHints: RefundHint[] = [];
  if (r.medical) refundHints.push('medical');
  if (r.selfMedication) refundHints.push('self-medication');
  if (r.furusato) refundHints.push('furusato');
  if (r.housingLoanFirst) refundHints.push('housing-loan-first');
  if (hasSalary && !input.yearEndAdjusted) refundHints.push('retired-no-adjustment');
  if (r.retirementNoDeclaration) refundHints.push('retirement-no-declaration');
  if (r.disaster) refundHints.push('disaster');

  const incomeTax: IncomeTaxAnswer = required
    ? 'required'
    : refundHints.length > 0
      ? 'notRequiredButRefund'
      : 'notRequired';

  const notes: Note[] = [];
  if (incomeTax === 'notRequiredButRefund' && other > 0) notes.push('refund-include-other-income');
  if (r.onestopApplied && incomeTax !== 'notRequired') notes.push('onestop-invalid');
  // 2か所給与で、150万円の注から外れたのが給与の額だけのとき。控除を引けば不要になる人がいる
  if (
    reasons.includes('two-salaries') &&
    salaryTotal > TWO_SALARIES_EXEMPT_LIMIT &&
    other + pensionInc <= OTHER_INCOME_LIMIT
  ) {
    notes.push('two-salaries-gross');
  }

  // 住民税：所得税の申告（還付申告を含む）をしない場合
  let residentTax: ResidentTaxAnswer;
  if (incomeTax === 'required') {
    residentTax = 'notRequired'; // 所得税の申告書の内容が市区町村に回る
  } else if (other > 0) {
    // 所得税の20万円の特例は住民税に無い。給与・年金のある人は額にかかわらず要る
    if (hasSalary || hasPension) residentTax = 'required';
    else residentTax = other > basicDeductionResidentTax(other) ? 'required' : 'unknown';
  } else if (unwithheld) {
    residentTax = 'required'; // 源泉徴収されない年金は市区町村に支払報告が届かない
  } else {
    residentTax = 'notRequired';
  }
  if (hasPension && !hasSalary && other === 0 && incomeTax !== 'required' && residentTax === 'notRequired') {
    notes.push('pension-resident-deductions');
  }

  return { incomeTax, reasons, refundHints, notes, residentTax, totalIncome };
}
