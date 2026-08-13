/**
 * 年末調整 還付金 計算ロジック（令和8年分＝2026年1月〜12月に支払われた給与）
 *
 * 年末調整で戻ってくる金額は、次の引き算で決まる。
 *
 *   還付額 ＝ 1〜12月に源泉徴収された所得税の累計 − 正しい年税額（年調年税額）
 *
 * 利用者は前者を給与明細で持っているが、後者は自力で出せない。
 * このロジックは**後者を計算して差額を出す**ことに絞っている。
 *
 * ■ 年調年税額の求め方（国税庁「年末調整のしかた」の順序）
 *   1. 給与収入 − 給与所得控除 ＝ 給与所得控除後の金額
 *   2. − 所得控除の合計（社会保険料・生命保険料・地震保険料・小規模企業共済等掛金・
 *      配偶者控除／配偶者特別控除・扶養控除・特定親族特別控除・基礎控除）
 *      ＝ 課税給与所得金額（1,000円未満切捨て）
 *   3. 速算表で算出所得税額を出す
 *   4. − 住宅借入金等特別控除 ＝ 年調所得税額（0円未満にはしない）
 *   5. × 102.1%（復興特別所得税）＝ 年調年税額（100円未満切捨て）
 *
 * 住宅ローン控除を4で引くのは**税額控除**だからで、所得控除（2）とは働き方が違う。
 * 引ききれなかった分は所得税からは戻らず、翌年の住民税から引かれる
 * （lib/furusato-nozei.ts の applyHousingLoan がその配分を持っている）。
 *
 * ■ 令和8年分がこの計算機の主題である理由
 * 令和8年分は基礎控除が最大104万円（本則62万円 + 特例加算42万円）、
 * 給与所得控除の最低保障額が74万円。特例加算42万円は**令和8年・9年分だけの時限措置**で、
 * 令和8年分の年末調整は「この規模の減税が初めて年税額に効く年末調整」になる。
 * そこで令和7年分の控除額で計算した年税額も同時に出し、差額を「改正の効果」として見せる。
 *
 * ■ 令和8年12月1日施行 —— 毎月の源泉徴収に改正は入っていない（この計算機の要）
 *
 * 上の改正（基礎控除の引上げ・給与所得控除の最低保障額の引上げ・扶養親族等の
 * 所得要件の改正）は **令和8年12月1日に施行**され、令和8年分以後の所得税に適用される。
 * 国税庁が明記しているとおり、
 *
 *   「令和8年11月までの給与等の源泉徴収事務に変更は生じません。」
 *   「令和8年12月に行う年末調整の際に、引上げ後の基礎控除額及び改正後の
 *     『年末調整等のための給与所得控除後の給与等の金額の表』に基づいて1年間の税額を
 *     計算し、**改正前の「源泉徴収税額表」によって計算した源泉徴収税額との精算**を行います。」
 *   （令和8年4月「源泉所得税の改正のあらまし」2ページ／
 *     令和8年度税制改正Ｑ＆Ａ Ｑ１－１）
 *
 * つまり1〜11月の源泉徴収は**改正前（令和7年分）の控除額のまま**行われており、
 * 令和8年度改正による減税は**まるごと12月の年末調整で精算される**。
 * 「源泉徴収税額表」そのものの改正は令和9年1月1日施行で、令和8年中は使われない。
 *
 * これが「令和8年分の年末調整では例年より大きな還付が広く出る」根拠であり、
 * 推計モード（estimateWithheld）が **RULES_R7**（改正前の控除額）で計算する理由でもある。
 * RULES_R7 は「令和7年分の控除額」であると同時に「令和8年11月までの源泉徴収の基礎」でもある。
 *
 * ■ それでも実額入力を主にする理由
 * 月次の源泉徴収は月額表・賞与の算出率表で月ごとに計算されるため、賞与の配分や
 * 昇給・欠勤による変動で年額とはずれる。この計算機は月額表を実装していないので、
 * **給与明細の実額を主たる入力**にしてそのずれを回避する。
 * 推計モードは明細が手元にない人向けの補助で、上記に加えて
 * 「扶養控除等申告書で申告した控除だけが毎月反映されていた」という前提を置く
 * （生命保険料控除・地震保険料控除・小規模企業共済等掛金控除・住宅ローン控除は
 * 年末調整で初めて効く）。結果には必ず「概算」と明示すること。
 *
 * ■ 対象外
 * 住民税は年末調整の対象外（翌年6月から給与天引きで精算される）。
 * 障害者控除・寡婦控除・ひとり親控除・勤労学生控除、給与以外の所得、
 * 医療費控除・ふるさと納税（確定申告が必要なもの）には対応していない。
 *
 * ■ 一次情報（2026-08-12 に原文を確認済み）
 * - 国税庁「令和8年度税制改正による所得税の基礎控除の引上げ等について」
 *   https://www.nta.go.jp/users/gensen/2026kiso/index.htm
 * - 国税庁「令和8年4月 源泉所得税の改正のあらまし」
 *   https://www.nta.go.jp/publication/pamph/gensen/2026kaisei.pdf
 *   → 1ページ: 基礎控除・給与所得控除の改正後の表／2ページ: 扶養親族等の所得要件、
 *     配偶者特別控除額・特定親族特別控除額の表、令和8年の源泉徴収事務における留意事項
 * - 国税庁「令和8年度税制改正（所得税の基礎控除の引上げ等関係）Ｑ＆Ａ」（令和8年5月）
 *   https://www.nta.go.jp/users/gensen/2026kiso/pdf/0026005-024.pdf
 *   → Ｑ１－１: 改正の適用時期／Ｑ３－１: 年調年税額を計算する上での注意点
 * - 国税庁「年末調整のしかた」 https://www.nta.go.jp/publication/pamph/gensen/nencho.htm
 * - 所得税法等の一部を改正する法律（令和8年法律第12号。2026年3月31日成立公布）
 *
 * 【確認済みの数値】上記あらまし1〜2ページの表と、このファイル・lib/furusato-nozei.ts の
 * 定数が一致していることを確認した（2026-08-12）。
 * - 給与所得控除の最低保障額 74万円（改正前65万円）
 * - 基礎控除（令和8・9年分）: 合計所得489万円以下 104万円 /
 *   489万円超655万円以下 67万円 / 655万円超2,350万円以下 62万円
 *   （本則62万円に、42万円・5万円の加算。令和10年分以後は132万円以下の99万円のみ残る）
 * - 扶養親族・同一生計配偶者の所得要件 62万円以下（給与収入136万円以下。改正前58万円）
 * - 特定親族 62万円超123万円以下（給与収入136万円超197万円以下）
 * - 配偶者特別控除の対象 62万円超133万円以下（給与収入136万円超207万円以下）
 * - 配偶者特別控除額・特定親族特別控除額の表（SPOUSE_SPECIAL_TABLE /
 *   SPECIAL_RELATIVE_TABLE）はあらまし2ページの表と完全一致
 *
 * 【データ更新箇所】税制改正があったら RULES_R8 / RULES_R7 の控除額と、
 * SPOUSE_SPECIAL_TABLE / SPECIAL_RELATIVE_TABLE / DEPENDENT_DEDUCTION の金額を更新する。
 * 所得税の速算表と給与所得控除（令和8年分）・復興特別所得税の率は
 * lib/furusato-nozei.ts のものを再利用しているので、そちらを直せば両方に効く。
 */

import {
  RECONSTRUCTION_RATE,
  applyHousingLoan,
  basicDeductionIncomeTax,
  estimateSocialInsurance,
  incomeTaxAmount,
  salaryDeduction,
  type HousingLoanResult,
  type HousingLoanTier,
} from '@/lib/furusato-nozei';

export type { HousingLoanTier };

/** 配偶者の区分。elderly は70歳以上（老人控除対象配偶者） */
export type SpouseKind = 'none' | 'general' | 'elderly';

/** 課税給与所得金額は1,000円未満を切り捨てる */
const floorTo1000 = (v: number) => Math.max(0, Math.floor(v / 1000) * 1000);

/** 年調年税額は100円未満を切り捨てる */
const floorTo100 = (v: number) => Math.max(0, Math.floor(v / 100) * 100);

/**
 * 扶養控除（1人あたり・所得税）。
 * 令和8年度改正でも金額は変わっていない（変わったのは所得要件のほう）。
 */
export const DEPENDENT_DEDUCTION = {
  /** 一般の控除対象扶養親族（16〜18歳・23〜69歳） */
  general: 380_000,
  /** 特定扶養親族（19〜22歳） */
  specific: 630_000,
  /** 老人扶養親族（70歳以上・同居老親等を除く） */
  elderly: 480_000,
} as const;

/**
 * 配偶者控除（所得税）。本人の合計所得金額900万円超で3段階に減り、1,000万円超で0。
 * 添字は本人の所得区分（0: 900万円以下 / 1: 950万円以下 / 2: 1,000万円以下）。
 */
const SPOUSE_DEDUCTION: Record<'general' | 'elderly', [number, number, number]> = {
  general: [380_000, 260_000, 130_000],
  elderly: [480_000, 320_000, 160_000],
};

/**
 * 配偶者特別控除（所得税）。配偶者の合計所得金額の区分ごとに、
 * 本人の所得区分（上と同じ3段階）の控除額を並べたもの。
 * 表の刻みは令和7年分・令和8年分で共通で、変わったのは下限（配偶者控除との境目）だけ。
 */
const SPOUSE_SPECIAL_TABLE: { upTo: number; amounts: [number, number, number] }[] = [
  { upTo: 950_000, amounts: [380_000, 260_000, 130_000] },
  { upTo: 1_000_000, amounts: [360_000, 240_000, 120_000] },
  { upTo: 1_050_000, amounts: [310_000, 210_000, 110_000] },
  { upTo: 1_100_000, amounts: [260_000, 180_000, 90_000] },
  { upTo: 1_150_000, amounts: [210_000, 140_000, 70_000] },
  { upTo: 1_200_000, amounts: [160_000, 110_000, 60_000] },
  { upTo: 1_250_000, amounts: [110_000, 80_000, 40_000] },
  { upTo: 1_300_000, amounts: [60_000, 40_000, 20_000] },
  { upTo: 1_330_000, amounts: [30_000, 20_000, 10_000] },
];

/**
 * 特定親族特別控除（19〜22歳の親族。令和7年分で創設）。
 * 扶養控除（特定扶養親族63万円）から外れたあと、いきなり0にならないよう
 * 段階的に減らすための控除。本人の所得による区分はない。
 */
const SPECIAL_RELATIVE_TABLE: { upTo: number; amount: number }[] = [
  { upTo: 850_000, amount: 630_000 },
  { upTo: 900_000, amount: 610_000 },
  { upTo: 950_000, amount: 510_000 },
  { upTo: 1_000_000, amount: 410_000 },
  { upTo: 1_050_000, amount: 310_000 },
  { upTo: 1_100_000, amount: 210_000 },
  { upTo: 1_150_000, amount: 110_000 },
  { upTo: 1_200_000, amount: 60_000 },
  { upTo: 1_230_000, amount: 30_000 },
];

/**
 * 年分ごとに変わる部分をまとめたもの。
 * 「令和7年分の控除額で計算したらいくらだったか」を同じ計算式で出すために、
 * 年分の違いをこの1箇所に閉じ込めている。
 */
export interface YearRules {
  /** 表示用の年分（'令和8年分'） */
  label: string;
  /** 給与所得控除 */
  salaryDeduction: (income: number) => number;
  /** 基礎控除（所得税） */
  basicDeduction: (totalIncome: number) => number;
  /** 配偶者控除の対象になる配偶者の合計所得金額の上限 */
  spouseLimit: number;
  /**
   * 特定親族特別控除の下限（配偶者控除と同じく、ここまでは扶養控除の対象）。
   * この額以下の親族は「特定扶養親族」として人数に数える。
   */
  specialRelativeLower: number;
}

/**
 * 令和7年分の給与所得控除。最低保障額65万円で、190万円で「収入×30% + 8万円」とつながる。
 * 令和8年分（最低保障74万円・境目220万円）との差が「改正の効果」の一部になる。
 */
export function salaryDeductionR7(income: number): number {
  if (income <= 0) return 0;
  if (income <= 1_900_000) return Math.min(income, 650_000);
  if (income <= 3_600_000) return income * 0.3 + 80_000;
  if (income <= 6_600_000) return income * 0.2 + 440_000;
  if (income <= 8_500_000) return income * 0.1 + 1_100_000;
  return 1_950_000;
}

/**
 * 令和7年分の所得税の基礎控除。
 * 本則58万円に、合計所得金額に応じた特例加算（令和7年・8年分の時限措置）が乗る形だった。
 */
export function basicDeductionIncomeTaxR7(totalIncome: number): number {
  if (totalIncome <= 1_320_000) return 950_000;
  if (totalIncome <= 3_360_000) return 880_000;
  if (totalIncome <= 4_890_000) return 680_000;
  if (totalIncome <= 6_550_000) return 630_000;
  if (totalIncome <= 23_500_000) return 580_000;
  if (totalIncome <= 24_000_000) return 480_000;
  if (totalIncome <= 24_500_000) return 320_000;
  if (totalIncome <= 25_000_000) return 160_000;
  return 0;
}

/** 令和8年分（この計算機の本体） */
export const RULES_R8: YearRules = {
  label: '令和8年分',
  salaryDeduction,
  basicDeduction: basicDeductionIncomeTax,
  // 給与収入136万円（= 給与所得控除74万 + 62万）まで配偶者控除の対象
  spouseLimit: 620_000,
  specialRelativeLower: 620_000,
};

/**
 * 改正前（令和7年分）の控除額。
 *
 * 2つの役割を持つ。
 * 1. 「令和7年分の控除額で計算した場合」との比較（＝改正の効果）
 * 2. **令和8年1〜11月の源泉徴収の基礎**。令和8年度改正は令和8年12月1日施行で、
 *    11月までの源泉徴収事務には反映されていない（ファイル冒頭の一次情報を参照）。
 *    このため estimateWithheld() はこちらの控除額で源泉徴収累計を推計する
 */
export const RULES_R7: YearRules = {
  label: '令和7年分',
  salaryDeduction: salaryDeductionR7,
  basicDeduction: basicDeductionIncomeTaxR7,
  // 給与収入123万円（= 給与所得控除65万 + 58万）まで配偶者控除の対象だった
  spouseLimit: 580_000,
  specialRelativeLower: 580_000,
};

export interface NenmatsuInput {
  /** 給与収入（額面・賞与込み・年間・円） */
  income: number;
  /**
   * 1〜12月に源泉徴収された所得税の累計（円）。
   * null なら estimateWithheld() で推計する（結果は概算になる）
   */
  withheld: number | null;
  /** 社会保険料の年間合計（円）。null なら年収から推計する */
  socialInsurance: number | null;
  /** 40〜64歳（介護保険料がかかる）。社会保険料を推計するときだけ使う */
  kaigo: boolean;
  spouse: SpouseKind;
  /** 配偶者の給与収入（額面・年間・円） */
  spouseIncome: number;
  /** 一般の控除対象扶養親族の人数（16〜18歳・23〜69歳） */
  dependentsGeneral: number;
  /** 特定扶養親族の人数（19〜22歳。給与収入が扶養控除の範囲に収まっている人） */
  dependentsSpecific: number;
  /** 老人扶養親族の人数（70歳以上） */
  dependentsElderly: number;
  /**
   * 19〜22歳の親族のうち、給与収入が扶養控除の範囲を超えた人の年収（円）の一覧。
   * 特定親族特別控除の対象になる
   */
  specialRelativeIncomes: number[];
  /** 生命保険料控除の額（円）。申告書で計算した額をそのまま受け取る */
  lifeInsurance: number;
  /** 地震保険料控除の額（円） */
  earthquakeInsurance: number;
  /** 小規模企業共済等掛金控除（iDeCo・企業型DCのマッチング拠出など・円） */
  smallEnterpriseMutualAid: number;
  /** 住宅借入金等特別控除の額（年間・円）。税額控除 */
  housingLoanCredit: number;
  /** 住宅ローン控除の住民税側の限度額の区分 */
  housingLoanTier: HousingLoanTier;
}

/** ある年分の控除額で計算した年税額（と、その途中経過） */
export interface YearTax {
  /** 年分の表示名 */
  label: string;
  /** 給与所得控除 */
  salaryDeduction: number;
  /** 給与所得控除後の金額（＝合計所得金額。給与のみの場合） */
  totalIncome: number;
  /** 社会保険料控除 */
  socialInsurance: number;
  /** 基礎控除 */
  basicDeduction: number;
  /** 配偶者控除・配偶者特別控除 */
  spouseDeduction: number;
  /** 配偶者特別控除として計算されたか（配偶者控除ではなく） */
  spouseIsSpecial: boolean;
  /** 扶養控除の合計 */
  dependentDeduction: number;
  /** 特定親族特別控除の合計 */
  specialRelativeDeduction: number;
  /** 生命保険料控除 + 地震保険料控除 + 小規模企業共済等掛金控除 */
  insuranceDeduction: number;
  /** 所得控除の合計 */
  deductionTotal: number;
  /** 課税給与所得金額（1,000円未満切捨て） */
  taxableIncome: number;
  /** 算出所得税額（住宅ローン控除を引く前・復興特別所得税を含まない） */
  calculatedTax: number;
  /** 住宅ローン控除の使われ方。利用していなければ null */
  housingLoan: HousingLoanResult | null;
  /** 年調所得税額（算出所得税額 − 住宅ローン控除。0円未満にはしない） */
  adjustedTax: number;
  /** 年調年税額（年調所得税額 × 102.1%・100円未満切捨て） */
  yearTax: number;
}

export interface NenmatsuResult {
  /** 令和8年分の控除額で計算した年税額（これが正しい年税額） */
  current: YearTax;
  /** 令和7年分の控除額で計算した場合の年税額（比較用） */
  previous: YearTax;
  /**
   * 改正による減税額（previous.yearTax − current.yearTax）。
   * 今年の還付が大きい理由を金額で示すためのもの
   */
  reformSaving: number;
  /** 社会保険料（入力値または推計値） */
  socialInsurance: number;
  socialInsuranceEstimated: boolean;
  /** 源泉徴収税額の累計（入力値または推計値） */
  withheld: number;
  withheldEstimated: boolean;
  /** 源泉徴収累計 − 年調年税額。プラスなら還付、マイナスなら追徴 */
  difference: number;
  /** 還付額（追徴のときは0） */
  refund: number;
  /** 不足額＝追徴される額（還付のときは0） */
  shortfall: number;
  /** どこかに推計値を使っているか。true なら結果に「概算」と明示する */
  estimated: boolean;
}

/** 本人の合計所得金額から配偶者控除の区分（0〜2）を求める。1,000万円超は対象外 */
function spouseTier(totalIncome: number): 0 | 1 | 2 | null {
  if (totalIncome > 10_000_000) return null;
  if (totalIncome <= 9_000_000) return 0;
  if (totalIncome <= 9_500_000) return 1;
  return 2;
}

/** 給与収入から給与所得（＝給与のみの人の合計所得金額）を求める */
function incomeToTotal(income: number, rules: YearRules): number {
  const i = Math.max(0, income);
  return Math.max(0, Math.floor(i - rules.salaryDeduction(i)));
}

/**
 * 配偶者控除／配偶者特別控除。
 *
 * 配偶者の合計所得金額が上限以下なら配偶者控除、超えたら配偶者特別控除に
 * 自動で切り替わる（切り替わっても控除額は同じ38万円なので、
 * 「配偶者控除の壁を超えると急に損をする」ということは起きない）。
 */
export function spouseDeductionFor({
  spouse,
  spouseIncome,
  totalIncome,
  rules,
}: {
  spouse: SpouseKind;
  /** 配偶者の給与収入（円） */
  spouseIncome: number;
  /** 本人の合計所得金額（円） */
  totalIncome: number;
  rules: YearRules;
}): { amount: number; isSpecial: boolean } {
  const tier = spouseTier(totalIncome);
  if (spouse === 'none' || tier === null) return { amount: 0, isSpecial: false };

  const spouseTotal = incomeToTotal(spouseIncome, rules);
  if (spouseTotal <= rules.spouseLimit) {
    return { amount: SPOUSE_DEDUCTION[spouse][tier], isSpecial: false };
  }
  const row = SPOUSE_SPECIAL_TABLE.find((r) => spouseTotal <= r.upTo);
  return { amount: row ? row.amounts[tier] : 0, isSpecial: true };
}

/**
 * 特定親族特別控除（19〜22歳の親族1人分）。
 * 扶養控除の範囲に収まっている親族は扶養控除（特定扶養親族63万円）の対象なので、
 * ここでは0を返す（人数のほうに数える）。
 */
export function specialRelativeDeductionFor(income: number, rules: YearRules): number {
  const total = incomeToTotal(income, rules);
  if (total <= rules.specialRelativeLower) return 0;
  return SPECIAL_RELATIVE_TABLE.find((r) => total <= r.upTo)?.amount ?? 0;
}

/**
 * 指定した年分の控除額で年調年税額を計算する。
 *
 * @param input 給与収入・家族構成・控除額
 * @param rules 年分ごとの控除（RULES_R8 / RULES_R7）
 * @param socialInsurance 社会保険料（確定済みの額）
 * @param options.skipYearEndDeductions
 *   生命保険料控除・地震保険料控除・小規模企業共済等掛金控除・住宅ローン控除を
 *   無いものとして計算する。毎月の源泉徴収額の推計に使う
 */
export function calcYearTax(
  input: NenmatsuInput,
  rules: YearRules,
  socialInsurance: number,
  options: { skipYearEndDeductions?: boolean } = {},
): YearTax {
  const skip = options.skipYearEndDeductions === true;
  const income = Math.max(0, input.income);
  const deduction = rules.salaryDeduction(income);
  const totalIncome = incomeToTotal(income, rules);

  const basic = rules.basicDeduction(totalIncome);
  const spouse = spouseDeductionFor({
    spouse: input.spouse,
    spouseIncome: input.spouseIncome,
    totalIncome,
    rules,
  });

  const dependentDeduction =
    DEPENDENT_DEDUCTION.general * Math.max(0, input.dependentsGeneral) +
    DEPENDENT_DEDUCTION.specific * Math.max(0, input.dependentsSpecific) +
    DEPENDENT_DEDUCTION.elderly * Math.max(0, input.dependentsElderly);

  const specialRelativeDeduction = input.specialRelativeIncomes.reduce(
    (sum, v) => sum + specialRelativeDeductionFor(v, rules),
    0,
  );

  // 生命保険料控除・地震保険料控除・小規模企業共済等掛金控除は、
  // 毎月の源泉徴収には反映されず年末調整で初めて効く（推計モードでは除く）
  const insuranceDeduction = skip
    ? 0
    : Math.max(0, input.lifeInsurance) +
      Math.max(0, input.earthquakeInsurance) +
      Math.max(0, input.smallEnterpriseMutualAid);

  const deductionTotal =
    socialInsurance +
    basic +
    spouse.amount +
    dependentDeduction +
    specialRelativeDeduction +
    insuranceDeduction;

  const taxableIncome = floorTo1000(totalIncome - deductionTotal);
  const calculatedTax = incomeTaxAmount(taxableIncome);

  // 住宅ローン控除は税額控除。所得税から引ききれない分は翌年の住民税に回る
  const credit = skip ? 0 : Math.max(0, input.housingLoanCredit);
  const housingLoan =
    credit > 0
      ? applyHousingLoan({
          credit,
          incomeTax: calculatedTax,
          taxableIncomeTax: taxableIncome,
          tier: input.housingLoanTier,
        })
      : null;

  const adjustedTax = Math.max(0, calculatedTax - (housingLoan?.fromIncomeTax ?? 0));
  const yearTax = floorTo100(adjustedTax * RECONSTRUCTION_RATE);

  return {
    label: rules.label,
    salaryDeduction: Math.floor(deduction),
    totalIncome,
    socialInsurance,
    basicDeduction: basic,
    spouseDeduction: spouse.amount,
    spouseIsSpecial: spouse.isSpecial,
    dependentDeduction,
    specialRelativeDeduction,
    insuranceDeduction,
    deductionTotal: Math.floor(deductionTotal),
    taxableIncome,
    calculatedTax,
    housingLoan,
    adjustedTax,
    yearTax,
  };
}

/**
 * 源泉徴収税額の累計の推計。
 *
 * 2つの前提を置いている。どちらも一次情報にもとづく（ファイル冒頭を参照）。
 *
 * 1. **改正前（令和7年分）の控除額で源泉徴収されている**（RULES_R7 を使う理由）。
 *    令和8年度改正は令和8年12月1日施行で、国税庁は
 *    「令和8年11月までの給与等の源泉徴収事務に変更は生じません」と明記している。
 *    源泉徴収税額表そのものの改正は令和9年1月1日施行。
 * 2. **扶養控除等申告書で申告した控除だけが毎月反映されている**
 *    （skipYearEndDeductions）。生命保険料控除・地震保険料控除・
 *    小規模企業共済等掛金控除・住宅ローン控除は年末調整で初めて効く。
 *
 * この2つの差がそのまま12月に精算される。1が令和8年分の還付が大きい主因で、
 * 2が例年どおりの還付の主因になる。
 *
 * 実際の源泉徴収は月額表・賞与の算出率表で月ごとに計算されるため、
 * 賞与の配分や昇給・欠勤による月ごとの変動でこの値とはずれる。
 * **給与明細の「所得税」の合計を入力できるなら必ずそちらを使うこと。**
 */
export function estimateWithheld(input: NenmatsuInput, socialInsurance: number): number {
  return calcYearTax(input, RULES_R7, socialInsurance, { skipYearEndDeductions: true }).yearTax;
}

/**
 * 年末調整の還付額（または不足額）を計算する。
 *
 * @param input 給与収入・源泉徴収累計・家族構成・各種控除
 * @returns 令和8年分の年税額、令和7年分の控除額で計算した場合との差、還付額／不足額
 */
export function calcNenmatsuChosei(input: NenmatsuInput): NenmatsuResult {
  const income = Math.max(0, input.income);

  const socialInsuranceEstimated = input.socialInsurance === null;
  const socialInsurance = Math.max(
    0,
    socialInsuranceEstimated
      ? estimateSocialInsurance(income, input.kaigo)
      : (input.socialInsurance ?? 0),
  );

  const current = calcYearTax(input, RULES_R8, socialInsurance);
  const previous = calcYearTax(input, RULES_R7, socialInsurance);

  const withheldEstimated = input.withheld === null;
  const withheld = Math.max(
    0,
    withheldEstimated ? estimateWithheld(input, socialInsurance) : (input.withheld ?? 0),
  );

  const difference = withheld - current.yearTax;

  return {
    current,
    previous,
    reformSaving: previous.yearTax - current.yearTax,
    socialInsurance,
    socialInsuranceEstimated,
    withheld,
    withheldEstimated,
    difference,
    refund: Math.max(0, difference),
    shortfall: Math.max(0, -difference),
    estimated: socialInsuranceEstimated || withheldEstimated,
  };
}
