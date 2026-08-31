/**
 * 医療費控除・セルフメディケーション税制 計算ロジック（令和8年分＝2026年1月〜12月の支払い）
 *
 * 仕様: docs/features/iryohi-kojo-keisan.md
 *
 * 「いくら控除できるか」ではなく「**いくら戻るか**」と「**どちらが得か**」を出すためのもの。
 * 医療費控除は年末調整では手続きできず、給与所得者でも確定申告が要る数少ない控除で、
 * 「申告するかどうか自分で決める」ための金額がいちばん知りたい情報になる。
 *
 * ■ 2つの制度は選択適用（併用できない）
 *
 * | | 医療費控除（所得税法73条） | セルフメディケーション税制（措置法41条の17の2） |
 * |---|---|---|
 * | 控除額 | （支払医療費 − 補填額）−（10万円 と 総所得金額等×5% の小さい方） | 対象OTC医薬品の購入額 − 1.2万円 |
 * | 上限 | 200万円 | 8.8万円 |
 * | 要件 | 生計を一にする家族分を合算できる | 健康診断・予防接種等の「一定の取組」が必要 |
 * | 適用期限 | 恒久 | 2026年12月31日（延長は令和9年度税制改正待ち） |
 *
 * ■ 分母を2つ持っていること（このファイルでいちばん間違えやすい点）
 *
 * - **足切りの5%の分母は「総所得金額等」**（給与所得控除を引いたあと・所得控除を引く前）
 * - **税率の適用対象は「課税所得」**（総所得金額等から社会保険料控除・基礎控除などを引いたあと）
 *
 * この2つは別の値で、混同すると低所得帯の答えが壊れる。総所得金額等200万円
 * （給与収入だと約297万円）未満の人は足切りが10万円ではなく総所得×5%になり、
 * **医療費が10万円以下でも控除できる**——これが「10万円を超えないと無理」という
 * 最頻の誤解を解く本ツールの売りなので、ここを課税所得で計算すると売りが逆に嘘になる。
 * `tests/iryohi-kojo.test.ts` に境界（給与収入297万円前後）のテストを置いてある。
 *
 * ■ 還付額は「控除額 × 限界税率」で出さない
 *
 * 控除額が税率ブラケットをまたぐと過大になる。たとえば課税所得335万円（税率20%）の人が
 * 40万円の控除を受けると、下の10%帯に落ちる20万円分は10%でしか減らない。
 * そこで `lib/nenmatsu-chosei.ts` の `calcYearTax()` を**控除を入れる前と後で2回呼び、
 * 年税額（復興特別所得税1.021込み・100円未満切捨て）の差**を還付額としている。
 * 限界税率は「あなたの税率は20%」という説明の表示にだけ使う。
 *
 * ■ 戻り方が2段構えであること
 *
 * - **所得税**は確定申告の1〜2か月後に還付される（現金が戻る）
 * - **住民税**は翌年度（6月からの1年分）の税額が控除額の約10%ぶん安くなる（戻らず、減る）
 *
 * 「10万円戻る」ではなく「控除額が10万円で、戻るのはその2〜5割。しかも一部は来年の住民税」。
 * 住民税側は所得割の税率10%で概算し、**課税標準を超えて減ることはない**ように
 * 控除の前後で課税標準を出して差を取っている（低所得帯で軽減額を過大に出さないため）。
 * 調整控除・所得割の非課税判定・均等割は扱っていない（「概算」の範囲）。
 *
 * ■ 対象外（docs/features/iryohi-kojo-keisan.md の「やらないこと」）
 * 確定申告書の作成・医療費の明細管理・対象品目の検索。
 * 所得は**給与収入のみ**を受け付ける（年金・事業所得だけの方には対応していない）。
 *
 * ■ 一次情報
 * - 国税庁 タックスアンサー No.1120「医療費を支払ったとき（医療費控除）」
 *   https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1120.htm
 * - 国税庁 タックスアンサー No.1129「セルフメディケーション税制（医療費控除の特例）」
 *   https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1129.htm
 * - 厚生労働省「セルフメディケーション税制について」（対象品目・適用期限）
 *   https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000124853.html
 * - 所得税法73条／租税特別措置法41条の17の2
 *
 * 【データ更新箇所】足切り額・上限額・適用期限は下の定数にまとめてある。
 * 給与所得控除・基礎控除・所得税の速算表・復興特別所得税の率は
 * lib/furusato-nozei.ts のものを再利用しているので、そちらを直せばここにも効く。
 */

import {
  RESIDENT_RATE,
  basicDeductionResidentTax,
  estimateSocialInsurance,
  incomeTaxRate,
} from '@/lib/furusato-nozei';
import { RULES_R8, calcYearTax, type NenmatsuInput } from '@/lib/nenmatsu-chosei';

/** 医療費控除の足切り額（定額側）。総所得金額等×5% と比べて小さいほうを使う */
export const MEDICAL_THRESHOLD_FIXED = 100_000;

/** 医療費控除の足切り額（割合側）。分母は**総所得金額等**であって課税所得ではない */
export const MEDICAL_THRESHOLD_RATE = 0.05;

/** 総所得金額等がこの額未満だと、足切りが10万円ではなく総所得×5%になる */
export const MEDICAL_THRESHOLD_PIVOT = MEDICAL_THRESHOLD_FIXED / MEDICAL_THRESHOLD_RATE;

/** 医療費控除の上限（所得税・住民税とも） */
export const MEDICAL_CAP = 2_000_000;

/** セルフメディケーション税制の足切り額 */
export const SELF_MED_THRESHOLD = 12_000;

/** セルフメディケーション税制の上限 */
export const SELF_MED_CAP = 88_000;

/**
 * セルフメディケーション税制の適用期限（この日までの購入分）。
 *
 * 5年延長された現行の期限で、**延長されるかどうかは令和9年度税制改正の議論待ち**。
 * 画面では「今年で終わり」と断定せず「現時点の期限は2026年12月31日」と書くこと
 * （延長された瞬間に嘘になる文言を置かない）。
 *
 * 【データ更新箇所】税制改正大綱で延長が決まったらこの2つを直す。
 */
export const SELF_MED_EXPIRES_AT = '2026-12-31';

/** 上の期限を最後に確認した日 */
export const SELF_MED_CHECKED_AT = '2026-08-31';

/** 還付申告でさかのぼれる年数（申告し忘れたとき） */
export const REFUND_CLAIM_YEARS = 5;

export interface IryohiInput {
  /** 給与収入（額面・賞与込み・年間・円） */
  income: number;
  /** 社会保険料の年間合計（円）。null なら年収から推計する */
  socialInsurance: number | null;
  /** 40〜64歳（介護保険料がかかる）。社会保険料を推計するときだけ使う */
  kaigo: boolean;
  /** その年に支払った医療費の合計（円）。生計を一にする家族の分を合算してよい */
  medicalExpenses: number;
  /** 保険金・高額療養費・出産育児一時金などで補填される金額（円） */
  compensation: number;
  /** セルフメディケーション税制の対象OTC医薬品の年間購入額（円） */
  otcExpenses: number;
  /** 健康診断・予防接種などの「一定の取組」を受けたか（セルフメディケーション税制の要件） */
  healthCheck: boolean;
}

/** どちらの制度か */
export type PlanKind = 'medical' | 'selfMedication';

/** 足切り額がどちらで決まったか。セルフメディケーション税制は常に 'fixed' */
export type ThresholdBasis = 'fixed' | 'rate';

/** 片方の制度の計算結果 */
export interface DeductionPlan {
  kind: PlanKind;
  /** 表示名 */
  label: string;
  /** 制度を使えるか（セルフメディケーション税制は「一定の取組」が要件） */
  available: boolean;
  /** 控除の対象になる支出（医療費なら補填額を引いたあと。0円未満にはしない） */
  netExpenses: number;
  /** 足切り額 */
  threshold: number;
  /** 足切り額がどちらで決まったか */
  thresholdBasis: ThresholdBasis;
  /** 上限で切られたか */
  capped: boolean;
  /** 所得控除の額 */
  deduction: number;
  /** 所得税の還付額（控除の前後で年税額を計算した差。復興特別所得税込み） */
  incomeTaxRefund: number;
  /** 住民税の軽減額（翌年度・6月からの1年分） */
  residentSaving: number;
  /** 所得税の還付＋住民税の軽減 */
  total: number;
  /**
   * 控除が始まるまであといくら支出が要るか（円）。
   * 足切りを超えていれば0。駆け込みで買うかどうかの判断に使う
   */
  shortfall: number;
}

export interface IryohiResult {
  /**
   * 総所得金額等（給与所得控除後・所得控除前）。
   * **足切りの5%の分母**。課税所得と取り違えないこと
   */
  totalIncome: number;
  /**
   * 課税所得（所得控除後・1,000円未満切捨て）。控除を入れる前の値。
   * **税率が決まる値**で、足切りの分母ではない
   */
  taxableIncome: number;
  /**
   * 限界税率（所得税・復興特別所得税を含まない）。
   * **説明の表示にだけ使う。控除額に掛けて還付額を出してはいけない**
   * （ブラケットをまたぐ控除で過大になる）
   */
  marginalRate: number;
  /** 社会保険料（入力値または推計値） */
  socialInsurance: number;
  socialInsuranceEstimated: boolean;
  /** 控除を入れる前の年税額（所得税・復興特別所得税込み） */
  yearTaxBefore: number;
  medical: DeductionPlan;
  selfMedication: DeductionPlan;
  /** どちらが得か。どちらも0円なら 'none'、同額なら 'tie' */
  better: PlanKind | 'none' | 'tie';
  /** 得なほうと、そうでないほうの戻る額の差（円） */
  difference: number;
}

/**
 * 医療費控除の足切り額。
 *
 * **分母は総所得金額等**（給与所得控除を引いたあと・所得控除を引く前）。
 * 総所得金額等が200万円未満なら10万円ではなく5%になり、医療費が10万円以下でも控除できる。
 * 5%の端数は円未満を切り捨てる。
 */
export function medicalThreshold(totalIncome: number): {
  threshold: number;
  basis: ThresholdBasis;
} {
  const rate = Math.floor(Math.max(0, totalIncome) * MEDICAL_THRESHOLD_RATE);
  return rate < MEDICAL_THRESHOLD_FIXED
    ? { threshold: rate, basis: 'rate' }
    : { threshold: MEDICAL_THRESHOLD_FIXED, basis: 'fixed' };
}

/** 医療費控除の控除額（（医療費 − 補填額）− 足切り、0〜200万円） */
export function medicalDeduction(
  medicalExpenses: number,
  compensation: number,
  totalIncome: number,
): number {
  const net = Math.max(0, medicalExpenses - Math.max(0, compensation));
  const { threshold } = medicalThreshold(totalIncome);
  return Math.min(MEDICAL_CAP, Math.max(0, net - threshold));
}

/** セルフメディケーション税制の控除額（購入額 − 1.2万円、0〜8.8万円） */
export function selfMedicationDeduction(otcExpenses: number): number {
  return Math.min(SELF_MED_CAP, Math.max(0, otcExpenses - SELF_MED_THRESHOLD));
}

/** 給与収入だけの人の `NenmatsuInput`（このツールは家族構成・保険料控除を受け取らない） */
function toNenmatsuInput(input: IryohiInput): NenmatsuInput {
  return {
    income: Math.max(0, input.income),
    withheld: null,
    socialInsurance: input.socialInsurance,
    kaigo: input.kaigo,
    spouse: 'none',
    spouseIncome: 0,
    dependentsGeneral: 0,
    dependentsSpecific: 0,
    dependentsElderly: 0,
    specialRelativeIncomes: [],
    lifeInsurance: 0,
    earthquakeInsurance: 0,
    smallEnterpriseMutualAid: 0,
    housingLoanCredit: 0,
    housingLoanTier: 'rate5',
  };
}

/**
 * 住民税所得割の課税標準（概算）。
 *
 * 総所得金額等から社会保険料控除と住民税の基礎控除（43万円）を引いただけの粗い値。
 * 配偶者控除・扶養控除・調整控除は扱っていない。
 * **軽減額が課税標準を超えないようにする**ためのもので、税額そのものは出していない。
 */
function residentTaxBase(totalIncome: number, socialInsurance: number): number {
  return Math.max(0, totalIncome - socialInsurance - basicDeductionResidentTax(totalIncome));
}

/**
 * 住民税の軽減額（翌年度・概算）。
 *
 * 所得割の税率10%を掛けるだけだが、**課税標準を超える控除は効かない**ので
 * 控除の前後で課税標準を出して差を取っている。
 * 総所得金額等が低い人に「控除額×10%」をそのまま出すと軽減額が過大になるため。
 */
function residentSavingFor(
  deduction: number,
  totalIncome: number,
  socialInsurance: number,
): number {
  const before = residentTaxBase(totalIncome, socialInsurance);
  const after = Math.max(0, before - deduction);
  return Math.round((before - after) * RESIDENT_RATE);
}

/** 片方の制度の結果を組み立てる */
function buildPlan(args: {
  kind: PlanKind;
  label: string;
  available: boolean;
  netExpenses: number;
  threshold: number;
  thresholdBasis: ThresholdBasis;
  cap: number;
  input: IryohiInput;
  totalIncome: number;
  socialInsurance: number;
  yearTaxBefore: number;
}): DeductionPlan {
  const raw = Math.max(0, args.netExpenses - args.threshold);
  const deduction = args.available ? Math.min(args.cap, raw) : 0;

  // 還付額は「控除額 × 限界税率」ではなく、控除の前後の年税額の差で出す。
  // 控除がブラケットをまたぐと限界税率では過大になるため（ファイル冒頭を参照）
  const yearTaxAfter = calcYearTax(
    toNenmatsuInput(args.input),
    RULES_R8,
    args.socialInsurance,
    { extraDeduction: deduction },
  ).yearTax;
  const incomeTaxRefund = Math.max(0, args.yearTaxBefore - yearTaxAfter);
  const residentSaving = args.available
    ? residentSavingFor(deduction, args.totalIncome, args.socialInsurance)
    : 0;

  return {
    kind: args.kind,
    label: args.label,
    available: args.available,
    netExpenses: args.netExpenses,
    threshold: args.threshold,
    thresholdBasis: args.thresholdBasis,
    capped: args.available && raw > args.cap,
    deduction,
    incomeTaxRefund,
    residentSaving,
    total: incomeTaxRefund + residentSaving,
    // 足切りを超えていない間だけ「あといくら」を出す。超えていれば0
    shortfall: Math.max(0, args.threshold - args.netExpenses),
  };
}

/**
 * 医療費控除とセルフメディケーション税制を両方計算し、どちらが得かを判定する。
 *
 * 2つは選択適用（併用できない）なので、戻る額の大きいほうを `better` に入れる。
 * 戻る額は所得税の還付と住民税の軽減の合計で比べる（所得税だけで比べると、
 * 所得税がかからない人でどちらも0になって差が出ない）。
 */
export function calcIryohiKojo(input: IryohiInput): IryohiResult {
  const income = Math.max(0, input.income);
  const socialInsuranceEstimated = input.socialInsurance === null;
  const socialInsurance = Math.max(
    0,
    socialInsuranceEstimated
      ? estimateSocialInsurance(income, input.kaigo)
      : (input.socialInsurance ?? 0),
  );

  const base = calcYearTax(toNenmatsuInput(input), RULES_R8, socialInsurance);
  const totalIncome = base.totalIncome;
  const yearTaxBefore = base.yearTax;

  const { threshold, basis } = medicalThreshold(totalIncome);
  const medical = buildPlan({
    kind: 'medical',
    label: '医療費控除',
    available: true,
    netExpenses: Math.max(0, Math.max(0, input.medicalExpenses) - Math.max(0, input.compensation)),
    threshold,
    thresholdBasis: basis,
    cap: MEDICAL_CAP,
    input,
    totalIncome,
    socialInsurance,
    yearTaxBefore,
  });

  const selfMedication = buildPlan({
    kind: 'selfMedication',
    label: 'セルフメディケーション税制',
    // 健康診断・予防接種等の「一定の取組」を受けていない年は使えない
    available: input.healthCheck,
    netExpenses: Math.max(0, input.otcExpenses),
    threshold: SELF_MED_THRESHOLD,
    thresholdBasis: 'fixed',
    cap: SELF_MED_CAP,
    input,
    totalIncome,
    socialInsurance,
    yearTaxBefore,
  });

  const better: PlanKind | 'none' | 'tie' =
    medical.total === 0 && selfMedication.total === 0
      ? 'none'
      : medical.total > selfMedication.total
        ? 'medical'
        : medical.total < selfMedication.total
          ? 'selfMedication'
          : 'tie';

  return {
    totalIncome,
    taxableIncome: base.taxableIncome,
    marginalRate: incomeTaxRate(base.taxableIncome),
    socialInsurance,
    socialInsuranceEstimated,
    yearTaxBefore,
    medical,
    selfMedication,
    better,
    difference: Math.abs(medical.total - selfMedication.total),
  };
}
