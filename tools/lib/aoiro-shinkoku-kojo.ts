/**
 * 青色申告特別控除 判定（令和9年分から）
 *
 * 仕様: docs/features/aoiro-shinkoku-tokubetsu-kojo-r9.md
 *
 * ■ 改正の内容（所得税法等の一部を改正する法律・令和8年法律第12号。附則1条5号ロで 2027-01-01 施行、
 *   附則33条で「令和九年分以後の所得税について適用し、令和八年分以前の所得税については、なお従前の例による」）
 * 令和9年分以後の租税特別措置法25条の2：
 *   1項 10万円（青色申告の基本。4項の適用を受ける年分を除く）
 *   2項 1項は、不動産所得・事業所得を生ずべき「事業」を営む人（67条1項＝現金主義の特例の人を除く）で、
 *       前々年分の不動産所得・事業所得の**いずれか**の総収入金額が1,000万円を超え、
 *       かつ「4項に規定する場合」（＝正規の簿記で記帳している場合）に当たらないときは適用しない → **0円**
 *   4項 正規の簿記（複式簿記）で記帳（67条1項の人を除く）→ 65万円
 *   5項 4項に当たる人が、優良な電子帳簿（1号）またはデジタルシームレス保存（2号）→ 75万円
 *   7項 4項（したがって5項も）は、確定申告書と貸借対照表・損益計算書を**期限までに e-Tax で送信**した場合に限る
 * 令和8年分まで（改正前）は、正規の簿記なら書面申告でも55万円、e-Tax または優良な電子帳簿で65万円。
 *
 * ■ 一次確認の結果（e-Gov 法令API、2026-10-14 取得。仕様書の「一次確認」1〜3）
 * 1. 改正後の25条の2（版 332AC0000000026_20270101_508AC0000000012）は上の1項〜7項のとおりで、
 *    国税庁リーフレットの4区分（75万・65万・10万・0円）と一致する。
 *    - 0円の要件にある「4項に規定する場合に該当しない」は、4項の前段（正規の簿記で記帳している場合）を指す。
 *      **複式簿記で書面申告・期限後申告**の人は 4項の場合に当たる（e-Tax の7項で65万円が外れるだけ）ので、
 *      前々年1,000万円超でも0円ではなく10万円（リーフレットの「簡易簿記で1,000万円超は0円」と一致）
 *    - 現金主義の特例（所得税法67条1項）の人は2項からも4項からも除かれる → 前々年がいくらでも**10万円**
 *    - 「不動産所得を生ずべき事業」なので、事業的規模でない（業務的規模の）不動産所得は2項の判定に入らず、
 *      4項の65万円も事業的規模が要る → 業務的規模は複式簿記でも1,000万円超でも10万円（リーフレット※1）
 * 2. 住民税：地方税法313条2項が総所得金額を「所得税法その他の所得税に関する法令の規定による…計算の例」で
 *    算定するとしており、地方税法の側に25条の2の別の定めは無い。令和9年分の所得 → **令和10年度**の住民税に同じ額で効く
 * 3. 両方の所得がある人は、控除を不動産所得から順に引く（3項・6項）。前々年1,000万円は「いずれか」で判定（2項1号・2号）。
 *    控除額はどの区分でも、控除前の所得（不動産所得＋事業所得）の合計が上限（1項2号・4項2号）
 *
 * ■ 税額の目安
 * 所得税は令和8年分・令和9年分それぞれの課税所得で速算表を通しで計算し（限界税率×差額で済ませない）、
 * 復興特別所得税を含めて ×1.021。住民税は所得割10%。給与所得などほかの所得は課税所得に足す
 * （副業の人は、給与の分で税率の帯が上がる）。「ほかの所得控除の合計」は利用者の入力のまま。
 *
 * 【データ更新箇所】控除額が改正されたら DEDUCTION_R9 / DEDUCTION_R8 と PRIOR_REVENUE_LIMIT。
 * 所得税の速算表は lib/furusato-nozei.ts の `incomeTaxAmount()`（ここには持たない）。
 */

import { RECONSTRUCTION_RATE, RESIDENT_RATE, incomeTaxAmount } from '@/lib/furusato-nozei';

/** データ全体の最終確認日 'YYYY-MM-DD' */
export const DATA_CHECKED_AT = '2026-10-14';

/** 新しい区分が始まる年分（令和9年分）と、住民税で効く年度（令和10年度） */
export const FIRST_TAX_YEAR = 2027;
export const FIRST_RESIDENT_FISCAL_YEAR = 2028;

/** 令和9年分以後の控除額（租税特別措置法25条の2）。【データ更新箇所】 */
export const DEDUCTION_R9 = {
  /** 5項：65万円の要件＋優良な電子帳簿 or デジタルシームレス保存 */
  top: 750_000,
  /** 4項・7項：正規の簿記＋期限内の e-Tax */
  etax: 650_000,
  /** 1項：上のどれにも当たらない青色申告 */
  basic: 100_000,
  /** 2項：簡易簿記などで前々年の収入が1,000万円超 */
  none: 0,
} as const;

/** 令和8年分まで（改正前）の控除額。【データ更新箇所】 */
export const DEDUCTION_R8 = {
  etax: 650_000,
  paper: 550_000,
  basic: 100_000,
} as const;

/** 前々年分の総収入金額の線（「超える」と0円の判定に入る）。【データ更新箇所】 */
export const PRIOR_REVENUE_LIMIT = 10_000_000;

/** 所得の種類 */
export type IncomeKind =
  /** 事業所得 */
  | 'business'
  /** 不動産所得（事業的規模＝5棟10室が目安） */
  | 'realEstateBusiness'
  /** 不動産所得（業務的規模＝事業的規模に満たない） */
  | 'realEstateSmall'
  /** 事業所得と不動産所得（事業的規模）の両方 */
  | 'both';

/** 帳簿の付け方 */
export type Bookkeeping = 'double' | 'simple';

/** 令和9年分の申告の方法 */
export type FilingR9 = 'etax' | 'paper' | 'late';

/** 電子帳簿（e-Tax・複式簿記のときだけ聞く） */
export type EBook = 'yuryo' | 'seamless' | 'none' | 'unknown';

/** 令和8年分（今年）の申告の方法 */
export type FilingR8 = 'etax' | 'paper' | 'yuryo';

export interface AoiroInput {
  kind: IncomeKind;
  bookkeeping: Bookkeeping;
  /** 現金主義による所得計算の特例（所得税法67条1項）を受けているか */
  cashBasis: boolean;
  filingR9: FilingR9;
  eBook: EBook;
  /** 前々年分（令和9年分なら2025年分）の事業・不動産のどちらかの収入金額が1,000万円を超えるか */
  priorRevenueOver: boolean;
  filingR8: FilingR8;
  /** 任意：青色申告特別控除を引く前の所得（不動産所得＋事業所得。円） */
  incomeBeforeDeduction?: number;
  /** 任意：事業・不動産以外の所得（給与所得など。収入ではなく所得。円）。課税所得に足す */
  otherIncome?: number;
  /** 任意：ほかの所得控除の合計（基礎控除・社会保険料控除など。円） */
  otherDeductions?: number;
}

/** 判定の理由（画面の1文はこれから作る） */
export type ReasonR9 =
  | 'top'
  | 'etax'
  | 'etaxUnknownEBook'
  | 'paper'
  | 'late'
  | 'simple'
  | 'simpleOver'
  | 'cashBasis'
  | 'realEstateSmall';

/** 前々年の収入が線を超えるか（「超える」なので1,000万円ちょうどは超えない） */
export function isOverPriorRevenueLimit(revenue: number): boolean {
  return revenue > PRIOR_REVENUE_LIMIT;
}

/** 正規の簿記の区分（65万円・75万円）に乗りうるか。業務的規模・現金主義・簡易簿記は乗らない */
function canUseDoubleEntryTier(input: Pick<AoiroInput, 'kind' | 'bookkeeping' | 'cashBasis'>) {
  return input.kind !== 'realEstateSmall' && !input.cashBasis && input.bookkeeping === 'double';
}

/** 令和8年分の申告の方法を聞くか（複式簿記で、現金主義の特例でなく、業務的規模でないときだけ） */
export function asksFilingR8(input: Pick<AoiroInput, 'kind' | 'bookkeeping' | 'cashBasis'>) {
  return canUseDoubleEntryTier(input);
}

/** 電子帳簿を聞くか（e-Tax・複式簿記のときだけ） */
export function asksEBook(
  input: Pick<AoiroInput, 'kind' | 'bookkeeping' | 'cashBasis' | 'filingR9'>,
) {
  return canUseDoubleEntryTier(input) && input.filingR9 === 'etax';
}

/** 令和9年分の区分（所得の上限をかける前の額）と理由 */
export function tierR9(input: AoiroInput): { amount: number; reason: ReasonR9 } {
  // 2項は「事業」を営む人が対象。業務的規模の不動産所得だけなら0円にもならず、4項の65万円にも乗らない
  if (input.kind === 'realEstateSmall') return { amount: DEDUCTION_R9.basic, reason: 'realEstateSmall' };
  // 67条1項の人は2項からも4項からも除かれる
  if (input.cashBasis) return { amount: DEDUCTION_R9.basic, reason: 'cashBasis' };
  if (input.bookkeeping === 'simple') {
    return input.priorRevenueOver
      ? { amount: DEDUCTION_R9.none, reason: 'simpleOver' }
      : { amount: DEDUCTION_R9.basic, reason: 'simple' };
  }
  // ここから正規の簿記（4項の場合）。前々年がいくらでも2項の0円には当たらない
  if (input.filingR9 === 'late') return { amount: DEDUCTION_R9.basic, reason: 'late' };
  if (input.filingR9 === 'paper') return { amount: DEDUCTION_R9.basic, reason: 'paper' };
  if (input.eBook === 'yuryo' || input.eBook === 'seamless') {
    return { amount: DEDUCTION_R9.top, reason: 'top' };
  }
  return {
    amount: DEDUCTION_R9.etax,
    reason: input.eBook === 'unknown' ? 'etaxUnknownEBook' : 'etax',
  };
}

/** 令和8年分（改正前）の区分（所得の上限をかける前の額） */
export function tierR8(input: AoiroInput): number {
  if (!canUseDoubleEntryTier(input)) return DEDUCTION_R8.basic;
  return input.filingR8 === 'paper' ? DEDUCTION_R8.paper : DEDUCTION_R8.etax;
}

/** 控除は控除前の所得が上限（25条の2第1項2号・4項2号）。所得を入れていなければ区分の額のまま */
export function capByIncome(amount: number, income: number | undefined): number {
  if (income === undefined || !Number.isFinite(income)) return amount;
  return Math.max(0, Math.min(amount, Math.floor(income)));
}

/** 課税所得の1,000円未満切捨て */
const floor1000 = (v: number) => Math.max(0, Math.floor(v / 1000) * 1000);

export interface TaxSide {
  /** 課税所得（1,000円未満切捨て） */
  taxableIncome: number;
  /** 所得税（復興特別所得税を含む） */
  incomeTax: number;
  /** 住民税所得割（10%） */
  residentTax: number;
}

/**
 * 控除額 `deduction` のときの税額の目安。
 * `income` は青色申告特別控除を引く前の事業・不動産の所得、`otherIncome` は給与所得などほかの所得
 */
export function taxFor(
  income: number,
  otherDeductions: number,
  deduction: number,
  otherIncome = 0,
): TaxSide {
  const taxableIncome = floor1000(
    income + Math.max(0, otherIncome) - deduction - Math.max(0, otherDeductions),
  );
  return {
    taxableIncome,
    incomeTax: Math.floor(incomeTaxAmount(taxableIncome) * RECONSTRUCTION_RATE),
    residentTax: Math.floor(taxableIncome * RESIDENT_RATE),
  };
}

export interface TaxDiff {
  before: TaxSide;
  after: TaxSide;
  /** 所得税の増減（＋なら増える） */
  incomeTax: number;
  /** 住民税の増減（＋なら増える） */
  residentTax: number;
  /** 合計の増減 */
  total: number;
}

/** 控除が `fromDeduction` から `toDeduction` に変わったときの税額の増減 */
export function taxDiff(
  income: number,
  otherDeductions: number,
  fromDeduction: number,
  toDeduction: number,
  otherIncome = 0,
): TaxDiff {
  const before = taxFor(income, otherDeductions, fromDeduction, otherIncome);
  const after = taxFor(income, otherDeductions, toDeduction, otherIncome);
  const incomeTax = after.incomeTax - before.incomeTax;
  const residentTax = after.residentTax - before.residentTax;
  return { before, after, incomeTax, residentTax, total: incomeTax + residentTax };
}

/** 「1つ上の区分に上がるには」の1行 */
export interface Upgrade {
  /** 何をすれば */
  action: 'etax' | 'eBook' | 'doubleEntry' | 'stopCashBasis';
  /** 上がった先の控除額（所得の上限をかけた後） */
  amount: number;
  /** 今の答えから増える控除 */
  gain: number;
  /** 税額で減る目安（所得を入れたときだけ。＋なら税が減る） */
  taxSaving?: number;
  /** 優良な電子帳簿を課税期間の最初から付ける必要がある（年の途中からでは間に合わない） */
  needsFromJan1: boolean;
}

export interface AoiroResult {
  r9: number;
  r8: number;
  reason: ReasonR9;
  /** 令和9年分 − 令和8年分（マイナスなら減る） */
  change: number;
  /** 所得を入れて、上限で区分の額より小さくなったか */
  cappedByIncome: boolean;
  /** 任意入力があるときだけ：令和8年分 → 令和9年分の税額の増減 */
  tax?: TaxDiff;
  upgrades: Upgrade[];
}

/** 上がった先の入力（e-Tax・複式簿記に移る・電子帳簿を付ける） */
function upgradeTargets(input: AoiroInput): { action: Upgrade['action']; next: AoiroInput }[] {
  if (input.kind === 'realEstateSmall') return []; // 業務的規模は複式簿記に移っても10万円
  if (input.cashBasis) {
    return [
      {
        action: 'stopCashBasis',
        next: { ...input, cashBasis: false, bookkeeping: 'double', filingR9: 'etax', eBook: 'none' },
      },
    ];
  }
  if (input.bookkeeping === 'simple') {
    return [
      { action: 'doubleEntry', next: { ...input, bookkeeping: 'double', filingR9: 'etax', eBook: 'none' } },
    ];
  }
  if (input.filingR9 !== 'etax') {
    return [
      { action: 'etax', next: { ...input, filingR9: 'etax', eBook: 'none' } },
      { action: 'eBook', next: { ...input, filingR9: 'etax', eBook: 'yuryo' } },
    ];
  }
  if (input.eBook !== 'yuryo' && input.eBook !== 'seamless') {
    return [{ action: 'eBook', next: { ...input, eBook: 'yuryo' } }];
  }
  return [];
}

/** 判定と差額 */
export function judge(input: AoiroInput): AoiroResult {
  const income = input.incomeBeforeDeduction;
  const hasIncome = income !== undefined && Number.isFinite(income);
  const other = Math.max(0, input.otherDeductions ?? 0);
  const otherIncome = Math.max(0, input.otherIncome ?? 0);

  const t9 = tierR9(input);
  const r9 = capByIncome(t9.amount, income);
  const r8 = capByIncome(tierR8(input), income);

  const upgrades: Upgrade[] = [];
  for (const { action, next } of upgradeTargets(input)) {
    const amount = capByIncome(tierR9(next).amount, income);
    const gain = amount - r9;
    // 所得が小さく、上がっても控除が増えない（e-Tax の段で頭打ちなら、その先の電子帳簿も出さない）
    const prev = upgrades[upgrades.length - 1];
    if (gain <= 0 || (prev && amount <= prev.amount)) continue;
    upgrades.push({
      action,
      amount,
      gain,
      taxSaving: hasIncome ? -taxDiff(income, other, r9, amount, otherIncome).total : undefined,
      needsFromJan1: next.eBook === 'yuryo',
    });
  }

  return {
    r9,
    r8,
    reason: t9.reason,
    change: r9 - r8,
    cappedByIncome: hasIncome && r9 < t9.amount,
    tax: hasIncome ? taxDiff(income, other, r8, r9, otherIncome) : undefined,
    upgrades,
  };
}

/** 一次情報へのリンク */
export interface Source {
  label: string;
  url: string;
  /** このURLで内容を確認した日 'YYYY-MM-DD' */
  checkedAt: string;
}

export const SOURCES: Source[] = [
  {
    label: '国税庁「【令和9年分確定申告から適用】75万円の青色申告特別控除を適用しましょう」（令和8年8月）',
    url: 'https://www.nta.go.jp/taxes/shiraberu/shinkoku/kojin_jigyo/0026007-003_02.pdf',
    checkedAt: DATA_CHECKED_AT,
  },
  {
    label: '国税庁「簡易簿記による10万円の青色申告特別控除を適用している皆様へ」（R8.4）',
    url: 'https://www.nta.go.jp/taxes/shiraberu/shinkoku/kojin_jigyo/0026004-012.pdf',
    checkedAt: DATA_CHECKED_AT,
  },
  {
    label: '国税庁 タックスアンサー No.2072「青色申告特別控除」',
    url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2072.htm',
    checkedAt: DATA_CHECKED_AT,
  },
  {
    label: 'e-Gov法令検索「租税特別措置法」（25条の2。令和9年1月1日施行版）',
    url: 'https://laws.e-gov.go.jp/law/332AC0000000026',
    checkedAt: DATA_CHECKED_AT,
  },
];

/** 届出書の様式（名称が令和9年3月頃に「65万」→「75万」に変わる予定なので、名前を直書きせずここへリンクする） */
export const FORM_PAGE: Source = {
  label: '国税庁「電子帳簿等保存制度特設サイト」の届出等の様式',
  url: 'https://www.nta.go.jp/law/joho-zeikaishaku/sonota/jirei/5-4.htm',
  checkedAt: DATA_CHECKED_AT,
};
