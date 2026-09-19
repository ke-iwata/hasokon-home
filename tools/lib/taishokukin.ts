/**
 * 退職金の税金・手取り 計算ロジック（退職所得控除の「10年ルール」対応）
 *
 * 仕様: docs/features/taishokukin-tedori.md
 *
 * 退職金は給与とは別の計算をする。
 *
 *   退職所得控除を引く → 残りの2分の1 → 他の所得と分けて課税（分離課税）
 *
 * ■ 2026年からの「10年ルール」（施行令70条1項2号ロ）
 * 令和7年度税制改正により、**iDeCo（確定拠出年金）の一時金を先に受け取ってから
 * 退職金を受け取る場合の重複排除期間が「5年 → 10年」に延びた**。
 * 前の一時金の支払年が退職金の支払年の**前年以前9年内**なら、
 * 重なりに対応する控除額が差し引かれる（従来は4年内）。
 *
 * **ただし9年内で判定するのは、一時金と退職金の「両方」が2026年以後のときだけ。**
 * 条文は対象の一時金を「令和八年一月一日以後に支払を受けたものに限り」と限定しており、
 * 2025年以前に受け取った一時金は同号イの4年内のままになる（`lookbackYearsFor()`）。
 * したがって**新ルールで答えが変わる最初の人は「2026年に一時金 → 2031年に退職金」**で、
 * それより前の退職では旧ルールと同じ結果になる。
 *
 * ■ 重複期間の短縮（施行令70条2項）
 * **前の一時金の額が、その当時の退職所得控除額に満たなかった場合、
 * 「掛金期間の初日から（一時金の額に応じた年数）を経過した日の前日まで」の期間が
 * 前の勤続期間等とみなされる。**
 * これは**年数の上限ではなく期間**なので、`min(みなし年数, 実際の重複年数)` にすると、
 * 掛金期間が勤続期間より前に始まっている人（転職前からiDeCoに入っていた人）で
 * 引きすぎる。みなし期間と勤続期間の重なりを改めて取ること。
 * 例：掛金15年・一時金200万円なら、みなし勤続期間は掛金開始から5年ぶん（200万 ÷ 40万）。
 * その5年が勤続期間と重なっていれば 40万円 × 5年 ＝ 200万円 を差し引く。
 *
 * ■ 同じ年に受け取った場合は対象外
 * 施行令70条1項2号は「その年の**前年以前**」なので、同年内の退職手当等は
 * 69条1項3号の**通算**（額も期間も合算する）という別の計算になる。
 * 本ツールは扱わず、画面で断る。
 *
 * ■ 端数処理（一次情報のとおり。ここは仕様書の記述より法令・国税庁の様式を優先した）
 * - 勤続年数：1年未満の端数は**切り上げ**（所得税法施行令 第69条）
 * - 課税退職所得金額：1,000円未満**切捨て**
 * - 所得税：速算表で求めた額に102.1%を乗じ、**1円未満切捨て**
 *   （国税庁「退職所得の源泉徴収税額の速算表」の注記。100円未満切捨てではない）
 * - 住民税：市町村民税6%・道府県民税4%を**それぞれ100円未満切捨て**
 *   （地方税法 第20条の4の2第3項の100円未満切捨てを、同条第8項が
 *   市町村民税と道府県民税を「それぞれ一の地方税とみなす」と定めているため。
 *   合算してから丸めると100円ずれる）
 * - 重複年数：1年未満**切捨て**（施行令70条3項）。みなし勤続年数も切捨て（同条2項）
 *
 * ■ 一次情報（2026-09-16 取得）
 * - 国税庁 タックスアンサー No.1420「退職金を受け取ったとき（退職所得）」
 *   https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1420.htm
 * - 国税庁 タックスアンサー No.2732「退職手当等に対する源泉徴収」
 *   https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2732.htm
 * - 所得税法 第30条・第89条・第201条、同施行令 第69条〜第71条の2
 *   （**第69条・第70条は e-Gov 法令API で現行条文を取得して突き合わせた**）
 * - 地方税法 第50条の2（道府県民税の退職所得の課税の特例）・第328条（市町村民税）、
 *   第20条の4の2（課税標準額・税額等の端数計算）
 *
 * ■ このツールで計算しないもの（仕様書の「やらないこと」）
 * - 退職金を先に受け取り、iDeCo一時金を後で受け取るケース（19年ルール）。解説のみ
 * - 年金形式（分割受取）との比較
 * - 企業型DC・中退共・小規模企業共済との通算（同じ年に受けた退職手当等は
 *   利用者に合計して入れてもらう）
 *
 * 【データ更新箇所】
 * - 速算表・復興特別所得税・住民税率は lib/furusato-nozei.ts から import している。
 *   税制改正のときはあちらを直す（このファイルには持たない）
 * - 復興特別所得税は2037年分まで。終了したら RECONSTRUCTION_RATE の扱いを見直す
 * - 重複排除の年数が動いたら LOOKBACK_YEARS_FROM_2026 / LOOKBACK_YEARS_BEFORE_2026
 */

import {
  RECONSTRUCTION_RATE,
  incomeTaxAmount,
  incomeTaxRate,
} from '@/lib/furusato-nozei';

/** 一次情報を確認した日 */
export const DATA_CHECKED_AT = '2026-09-18';

/** 勤続20年以下の1年あたりの退職所得控除額 */
export const DEDUCTION_PER_YEAR = 400_000;

/** 退職所得控除額の最低保障額（勤続2年以下でもここまでは引ける） */
export const DEDUCTION_MIN = 800_000;

/** 勤続20年までの累計（40万円 × 20年） */
export const DEDUCTION_BASE_20Y = 8_000_000;

/** 勤続20年を超える部分の1年あたりの退職所得控除額 */
export const DEDUCTION_PER_YEAR_OVER_20Y = 700_000;

/** 20年の境目。ここを超えると1年あたりの控除額が70万円になる */
export const DEDUCTION_TURNING_YEARS = 20;

/** 障害者になったことが直接の原因で退職したときの加算額 */
export const DISABILITY_ADD = 1_000_000;

/** 短期退職手当等・特定役員退職手当等の境目（この年数以下が対象） */
export const SHORT_TERM_YEARS = 5;

/** 短期退職手当等で2分の1が使える上限（控除後の額のうち300万円まで） */
export const SHORT_TERM_HALF_CAP = 3_000_000;

/** 住民税（市町村民税）の税率 */
export const CITY_TAX_RATE = 0.06;

/** 住民税（道府県民税）の税率 */
export const PREF_TAX_RATE = 0.04;

/**
 * 「退職所得の受給に関する申告書」を出していないときの源泉徴収率。
 * 退職手当等の**収入金額そのもの**に掛かる（退職所得控除も2分の1も使われない）。
 * 20% + 復興特別所得税（20% × 2.1%）＝ 20.42%。
 */
export const NO_DECLARATION_RATE = 0.2042;

/**
 * 10年ルールが適用される最初の年（令和8年1月1日）。
 * **一時金と退職金の両方**がこの年以後のときだけ9年内で判定する（`lookbackYearsFor()`）。
 */
export const TEN_YEAR_RULE_FROM = 2026;

/** 一時金・退職金とも2026年以後：前年以前9年内なら重複排除の対象（施行令70条1項2号ロ） */
export const LOOKBACK_YEARS_FROM_2026 = 9;

/** それ以外：従来の「前年以前4年内」（同号イ） */
export const LOOKBACK_YEARS_BEFORE_2026 = 4;

/** 退職の区分 */
export type RetirementKind =
  /** 一般（役員等以外） */
  | 'general'
  /** 役員等（法人の役員・国会議員・地方議会議員・国家公務員・地方公務員） */
  | 'officer'
  /** 障害者になったことが直接の原因で退職した場合（控除額に100万円加算） */
  | 'disability';

/** 年月（1月は month = 1） */
export interface YearMonth {
  year: number;
  month: number;
}

/** 勤続期間の指定。年月の直接入力か、入社〜退職の期間か */
export type ServiceInput =
  | { years: number; months: number }
  | { from: YearMonth; to: YearMonth };

/** 先に受け取ったiDeCo等の一時金 */
export interface PriorLumpSum {
  /** 受け取った年（西暦） */
  year: number;
  /** 受け取った一時金の額（円） */
  amount: number;
  /** 掛金を払っていた期間の開始 */
  from: YearMonth;
  /** 掛金を払っていた期間の終了 */
  to: YearMonth;
}

export interface TaishokukinInput {
  /** 退職金の額（額面。同じ年に複数から受けるなら合計） */
  amount: number;
  /** 勤続期間 */
  service: ServiceInput;
  /** 退職の区分 */
  kind: RetirementKind;
  /**
   * 退職金の支払を受ける年（西暦）。10年ルールの判定に使う。
   * 省略時は勤続期間の終了年（期間で指定していない場合は TEN_YEAR_RULE_FROM）。
   */
  paymentYear?: number;
  /** 先に受け取ったiDeCo等の一時金。無ければ省略 */
  prior?: PriorLumpSum;
  /** 「退職所得の受給に関する申告書」を勤務先に提出したか */
  declarationSubmitted: boolean;
}

/** 10年ルール（重複期間の控除）の内訳 */
export interface OverlapDetail {
  /** 重複排除の対象になったか（一時金の支払年が「前年以前n年内」か） */
  applies: boolean;
  /**
   * 判定に使った年数。
   * **一時金と退職金の両方が2026年以後**のときだけ9、それ以外は4
   * （施行令70条1項2号ロ「令和八年一月一日以後に支払を受けたものに限り」）。
   */
  lookbackYears: number;
  /** 退職金の支払年 − 一時金の支払年 */
  gapYears: number;
  /**
   * 同じ年に受け取った（gapYears === 0）。
   * 施行令70条1項2号は「その年の**前年以前**」なので、同年内はこの条文の対象外で、
   * 69条1項3号の**通算**（一時金の額も収入に足し、期間を合算する）という別の計算になる。
   * 本ツールでは扱えないので、画面で断る。
   */
  sameYear: boolean;
  /** 一時金のほうが後（逆順）。19年ルールの領分で、本ツールでは扱わない */
  reverseOrder: boolean;
  /** 掛金期間と勤続期間が「短縮前に」重なっていた月数 */
  overlapMonths: number;
  /** 同・年数（1年未満切捨て） */
  actualOverlapYears: number;
  /** 掛金期間の年数（1年未満切上げ） */
  contributionYears: number;
  /** 一時金を受けた当時の退職所得控除額（掛金期間で計算） */
  deductionAtThatTime: number;
  /** 一時金の額から導いた「みなし勤続年数」（1年未満切捨て） */
  deemedYears: number;
  /** 重複期間の短縮（施行令70条2項）が効いたか */
  shortened: boolean;
  /**
   * 「前の勤続期間等」とみなす期間。短縮が効いたときは
   * **掛金期間の初日から みなし勤続年数 ぶん**の期間になる（年数の上限ではない）。
   * 短縮が効かなければ掛金期間そのもの。
   */
  priorPeriod?: { from: YearMonth; to: YearMonth };
  /** 「前の勤続期間等」と勤続期間が重なった月数（＝実際に差し引く対象） */
  deductibleMonths: number;
  /** 実際に差し引く対象となった重複年数（1年未満切捨て。施行令70条3項） */
  years: number;
  /** 差し引く控除額 */
  amount: number;
  /**
   * 勤続期間を「年・月」で指定したため重なりを計算できなかった。
   * このとき重複年数は0として扱う（画面は期間入力に切り替えるので通常は起きない）。
   */
  indeterminate: boolean;
}

/** 退職所得控除の内訳 */
export interface DeductionBreakdown {
  /** 勤続年数だけで計算した額（障害加算を含まない） */
  base: number;
  /** 障害者退職の加算額 */
  disabilityAdd: number;
  /** 10年ルールで差し引いた額 */
  overlapDeduct: number;
  /** 差引後の退職所得控除額（0円未満にはしない） */
  total: number;
  /** 画面に出す式（例：「40万円 × 12年 ＝ 480万円」） */
  formula: string;
  /** 10年ルールの内訳。一時金の入力が無ければ undefined */
  overlap?: OverlapDetail;
}

/** 2分の1課税の適用のしかた */
export type HalfRule =
  /** 通常どおり2分の1 */
  | 'full'
  /** 特定役員退職手当等（役員等で勤続5年以下）。2分の1なし */
  | 'none'
  /** 短期退職手当等（一般で勤続5年以下）。300万円を超える部分だけ2分の1なし */
  | 'partial';

/** 申告書を出していないときの源泉徴収と精算 */
export interface WithholdingDetail {
  /** 退職金 × 20.42% で源泉徴収される所得税 */
  incomeTaxWithheld: number;
  /** 確定申告で戻る額（マイナスなら追加で納める額） */
  refund: number;
  /** 振り込まれる額（退職金 − 源泉徴収される所得税 − 住民税） */
  netAtPayment: number;
}

export interface TaishokukinResult {
  /** 勤続年数（1年未満切上げ後） */
  serviceYears: number;
  /** 勤続期間の月数。年・月で指定したときはその換算値 */
  serviceMonths: number;
  /** 退職所得控除の内訳 */
  deduction: DeductionBreakdown;
  /** 控除を引いた後の額（0円未満にはしない） */
  afterDeduction: number;
  /** 2分の1課税の適用のしかた */
  halfRule: HalfRule;
  /** 課税退職所得金額（1,000円未満切捨て） */
  taxableIncome: number;
  /** 速算表の税率 */
  taxRate: number;
  /** 所得税（復興特別所得税を含まない） */
  incomeTaxBase: number;
  /** 復興特別所得税 */
  reconstructionTax: number;
  /** 所得税（復興特別所得税込み） */
  incomeTax: number;
  /** 市町村民税 */
  cityTax: number;
  /** 道府県民税 */
  prefTax: number;
  /** 住民税の合計 */
  residentTax: number;
  /** 税金の合計 */
  totalTax: number;
  /** 手取り（確定申告まで済ませた後の最終的な額） */
  net: number;
  /** 手取りが退職金に占める割合（0〜1） */
  netRate: number;
  /** 申告書を出していないときの源泉徴収と精算。出していれば undefined */
  withholding?: WithholdingDetail;
}

/** 年月を通し月数に直す（大小比較と差の計算に使う） */
function monthIndex(ym: YearMonth): number {
  return ym.year * 12 + (ym.month - 1);
}

/**
 * 期間の月数（両端を含む）。
 * 2010年4月〜2020年3月は120か月（＝ちょうど10年）。
 * 終わりが始まりより前なら0。
 */
export function monthsInPeriod(from: YearMonth, to: YearMonth): number {
  return Math.max(0, monthIndex(to) - monthIndex(from) + 1);
}

/**
 * 2つの期間が重なる月数（両端を含む）。重なりが無ければ0。
 *
 * 利用者に「重複年数」を聞かないための関数。
 * 掛金期間と勤続期間を入れてもらい、重なりはこちらで出す。
 */
export function overlapMonths(
  a: { from: YearMonth; to: YearMonth },
  b: { from: YearMonth; to: YearMonth },
): number {
  const start = Math.max(monthIndex(a.from), monthIndex(b.from));
  const end = Math.min(monthIndex(a.to), monthIndex(b.to));
  return Math.max(0, end - start + 1);
}

/** 勤続年数（1年未満の端数は切り上げ。所得税法施行令 第69条） */
export function serviceYearsFromMonths(months: number): number {
  return Math.ceil(Math.max(0, months) / 12);
}

/**
 * 退職所得控除額を勤続年数から求める。
 *
 * - 20年以下：40万円 × 勤続年数（最低80万円）
 * - 20年超：800万円 + 70万円 ×（勤続年数 − 20年）
 *
 * @param years 勤続年数（切り上げ済み）
 * @param withMinimum 最低保障額（80万円）を効かせるか。
 *   重複期間ぶんの差引額を出すときは効かせない（引きすぎになるため）
 */
export function retirementDeduction(years: number, withMinimum = true): number {
  const y = Math.max(0, Math.floor(years));
  const raw =
    y <= DEDUCTION_TURNING_YEARS
      ? DEDUCTION_PER_YEAR * y
      : DEDUCTION_BASE_20Y + DEDUCTION_PER_YEAR_OVER_20Y * (y - DEDUCTION_TURNING_YEARS);
  return withMinimum ? Math.max(DEDUCTION_MIN, raw) : raw;
}

/**
 * 前の一時金の額から「みなし勤続年数」を求める（所得税法施行令 第70条）。
 *
 * 退職所得控除額の算式を逆に解いたもの。1年未満は切り捨てる。
 * - 800万円以下：収入金額 ÷ 40万円
 * - 800万円超：（収入金額 − 800万円）÷ 70万円 + 20年
 */
export function deemedServiceYears(amount: number): number {
  if (amount <= 0) return 0;
  if (amount <= DEDUCTION_BASE_20Y) return Math.floor(amount / DEDUCTION_PER_YEAR);
  return (
    Math.floor((amount - DEDUCTION_BASE_20Y) / DEDUCTION_PER_YEAR_OVER_20Y) +
    DEDUCTION_TURNING_YEARS
  );
}

/**
 * 重複排除の対象期間（前年以前n年内）。
 *
 * **9年内で判定するのは、iDeCo一時金と退職金の「両方」が2026年以後のときだけ。**
 * 施行令70条1項2号ロは対象の一時金を
 * 「令和八年一月一日**以後に支払を受けたものに限り**」と限定しており、
 * 2025年以前に受け取った一時金は同号イの**4年内**のままになる。
 * 退職金の支払年だけで9年に切り替えると、2025年以前にiDeCoを受け取って
 * 2026〜2030年に退職する人（5〜9年前のケース）で、本来は対象外のものを
 * 対象にしてしまい、税額を実際より多く出す。
 *
 * この結果、**新ルールで答えが変わる最初の人は「2026年に一時金 → 2031年に退職金」**
 * になる（1〜4年前はどちらの号でも対象なので結論が同じ）。
 *
 * @param paymentYear 退職金の支払年
 * @param priorYear 先に受け取った一時金の支払年
 */
export function lookbackYearsFor(paymentYear: number, priorYear: number): number {
  return paymentYear >= TEN_YEAR_RULE_FROM && priorYear >= TEN_YEAR_RULE_FROM
    ? LOOKBACK_YEARS_FROM_2026
    : LOOKBACK_YEARS_BEFORE_2026;
}

/** 年月を n か月進める（負の値なら戻す） */
function addMonths(ym: YearMonth, n: number): YearMonth {
  const idx = monthIndex(ym) + n;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/** 2つの年月の早いほう */
function earlier(a: YearMonth, b: YearMonth): YearMonth {
  return monthIndex(a) <= monthIndex(b) ? a : b;
}

/** 円 → 「480万円」。控除額は必ず1万円単位なので万円で見せる */
function man(yen: number): string {
  const v = yen / 10_000;
  return `${(Number.isInteger(v) ? v : Math.round(v * 10) / 10).toLocaleString('ja-JP')}万円`;
}

/**
 * 率を整数に直しておくための係数。
 *
 * `課税所得 × 0.06` や `税額 × 1.021` は、0.06 も 1.021 も2進数で表せないため
 * 誤差が乗る。切り捨てる処理と組み合わせると、ちょうどの額で100円・1円ずれる。
 * **掛けてから割る**形にすれば、途中の値が整数のままなので誤差が出ない。
 * 率そのものの単一の情報源は import 元の定数のまま。
 */
const RECONSTRUCTION_PERMILLE = Math.round(RECONSTRUCTION_RATE * 1000); // 1021
const CITY_TAX_PERCENT = Math.round(CITY_TAX_RATE * 100); // 6
const PREF_TAX_PERCENT = Math.round(PREF_TAX_RATE * 100); // 4
const NO_DECLARATION_PER_10000 = Math.round(NO_DECLARATION_RATE * 10_000); // 2042

/** 100円未満切捨て（住民税の所得割） */
function floor100(v: number): number {
  return Math.floor(v / 100) * 100;
}

/** 1,000円未満切捨て（課税退職所得金額） */
function floor1000(v: number): number {
  return Math.floor(v / 1000) * 1000;
}

/** 勤続期間の月数と、期間が分かっているかどうかを取り出す */
function resolveService(service: ServiceInput): {
  months: number;
  period?: { from: YearMonth; to: YearMonth };
} {
  if ('from' in service) {
    return { months: monthsInPeriod(service.from, service.to), period: service };
  }
  const years = Math.max(0, Math.floor(service.years || 0));
  const months = Math.max(0, Math.floor(service.months || 0));
  return { months: years * 12 + months };
}

/** 10年ルールの内訳を組み立てる */
function buildOverlap(
  prior: PriorLumpSum,
  paymentYear: number,
  period: { from: YearMonth; to: YearMonth } | undefined,
): OverlapDetail {
  const lookbackYears = lookbackYearsFor(paymentYear, prior.year);
  const gapYears = paymentYear - prior.year;
  const sameYear = gapYears === 0;
  const reverseOrder = gapYears < 0;
  // 施行令70条1項2号は「その年の**前年以前**」なので、同年（gap 0）と逆順は対象外。
  // 同年内の退職手当等は69条1項3号の通算（額も期間も合算する）という別の計算になる
  const applies = gapYears >= 1 && gapYears <= lookbackYears;

  const contributionMonths = monthsInPeriod(prior.from, prior.to);
  const contributionYears = serviceYearsFromMonths(contributionMonths);
  const deductionAtThatTime = retirementDeduction(contributionYears);
  const deemedYears = deemedServiceYears(prior.amount);
  const shortened = prior.amount < deductionAtThatTime;

  const indeterminate = period === undefined;
  const overlapBeforeShortening = period
    ? overlapMonths({ from: prior.from, to: prior.to }, period)
    : 0;

  /*
   * 施行令70条2項の「みなし勤続期間」。
   *
   * 短縮は**年数の上限ではなく期間**で、掛金期間の
   * 「初日から（みなし勤続年数）を経過した日の前日まで」が前の勤続期間等になる。
   * `Math.min(みなし年数, 実際の重複年数)` にすると、掛金期間が勤続期間より
   * 前に始まっている人（転職前からiDeCoに入っていた人）で、
   * みなし期間と重なっていない部分まで差し引いてしまう。
   */
  const priorPeriod: { from: YearMonth; to: YearMonth } | undefined = shortened
    ? deemedYears > 0
      ? {
          from: prior.from,
          // 「のうち」なので、元の掛金期間の終わりを超えることはない
          to: earlier(addMonths(prior.from, deemedYears * 12 - 1), prior.to),
        }
      : undefined
    : { from: prior.from, to: prior.to };

  const deductibleMonths =
    period && priorPeriod ? overlapMonths(priorPeriod, period) : 0;
  // 施行令70条3項：重複している部分の期間の1年未満の端数は切り捨てる
  const years = applies ? Math.floor(deductibleMonths / 12) : 0;

  return {
    applies,
    lookbackYears,
    gapYears,
    sameYear,
    reverseOrder,
    overlapMonths: overlapBeforeShortening,
    actualOverlapYears: Math.floor(overlapBeforeShortening / 12),
    contributionYears,
    deductionAtThatTime,
    deemedYears,
    shortened,
    priorPeriod,
    deductibleMonths,
    years,
    // 重複ぶんの差引額に最低保障額（80万円）は効かせない
    amount: retirementDeduction(years, false),
    indeterminate,
  };
}

/**
 * 退職金の税金と手取りを計算する。
 *
 * 入力はすべて円単位。マイナスの入力は0として扱う。
 */
export function calcTaishokukin(input: TaishokukinInput): TaishokukinResult {
  const amount = Math.max(0, Math.floor(input.amount || 0));
  const { months, period } = resolveService(input.service);
  const serviceYears = serviceYearsFromMonths(months);
  const paymentYear = input.paymentYear ?? period?.to.year ?? TEN_YEAR_RULE_FROM;

  // --- 退職所得控除 ---
  const base = retirementDeduction(serviceYears);
  const disabilityAdd = input.kind === 'disability' ? DISABILITY_ADD : 0;
  const overlap = input.prior ? buildOverlap(input.prior, paymentYear, period) : undefined;
  const overlapDeduct = overlap?.amount ?? 0;
  const total = Math.max(0, base + disabilityAdd - overlapDeduct);

  const baseFormula =
    serviceYears <= DEDUCTION_TURNING_YEARS
      ? `${man(DEDUCTION_PER_YEAR)} × ${serviceYears}年 ＝ ${man(DEDUCTION_PER_YEAR * serviceYears)}`
      : `${man(DEDUCTION_BASE_20Y)} ＋ ${man(DEDUCTION_PER_YEAR_OVER_20Y)} ×（${serviceYears}年 − 20年）＝ ${man(base)}`;
  const parts = [
    serviceYears <= DEDUCTION_TURNING_YEARS && base === DEDUCTION_MIN
      ? `${baseFormula}（最低保障額 ${man(DEDUCTION_MIN)}）`
      : baseFormula,
  ];
  if (disabilityAdd > 0) parts.push(`＋ 障害者退職の加算 ${man(disabilityAdd)}`);
  if (overlapDeduct > 0) {
    parts.push(`− iDeCo一時金との重複 ${overlap?.years}年分 ${man(overlapDeduct)}`);
  }
  const formula = `${parts.join(' ')}${parts.length > 1 ? ` ＝ ${man(total)}` : ''}`;

  const deduction: DeductionBreakdown = {
    base,
    disabilityAdd,
    overlapDeduct,
    total,
    formula,
    overlap,
  };

  // --- 課税退職所得金額 ---
  const afterDeduction = Math.max(0, amount - total);
  const shortTerm = serviceYears <= SHORT_TERM_YEARS;
  const halfRule: HalfRule =
    shortTerm && input.kind === 'officer' ? 'none' : shortTerm ? 'partial' : 'full';

  let taxableRaw: number;
  if (halfRule === 'none') {
    // 特定役員退職手当等：2分の1なし
    taxableRaw = afterDeduction;
  } else if (halfRule === 'partial' && afterDeduction > SHORT_TERM_HALF_CAP) {
    // 短期退職手当等：300万円までは2分の1、それを超える部分は全額
    taxableRaw = SHORT_TERM_HALF_CAP / 2 + (afterDeduction - SHORT_TERM_HALF_CAP);
  } else {
    taxableRaw = afterDeduction / 2;
  }
  const taxableIncome = floor1000(taxableRaw);

  // --- 所得税（復興特別所得税込み） ---
  const taxRate = incomeTaxRate(taxableIncome);
  const incomeTaxBase = incomeTaxAmount(taxableIncome);
  // 速算表で求めた額に102.1%を乗じ、1円未満を切り捨てる（国税庁の速算表の注記）
  const incomeTax = Math.floor((incomeTaxBase * RECONSTRUCTION_PERMILLE) / 1000);
  const reconstructionTax = incomeTax - incomeTaxBase;

  // --- 住民税（現年分離課税。市町村民税6% + 道府県民税4%をそれぞれ100円未満切捨て） ---
  const cityTax = floor100((taxableIncome * CITY_TAX_PERCENT) / 100);
  const prefTax = floor100((taxableIncome * PREF_TAX_PERCENT) / 100);
  const residentTax = cityTax + prefTax;

  const totalTax = incomeTax + residentTax;
  const net = amount - totalTax;

  // --- 申告書を出していない場合 ---
  // 所得税だけが 20.42%（収入金額そのものに課税）になり、確定申告で精算する。
  // 住民税は申告書の有無にかかわらず、正しい額が特別徴収される。
  const withholding: WithholdingDetail | undefined = input.declarationSubmitted
    ? undefined
    : (() => {
        const incomeTaxWithheld = Math.floor((amount * NO_DECLARATION_PER_10000) / 10_000);
        return {
          incomeTaxWithheld,
          refund: incomeTaxWithheld - incomeTax,
          netAtPayment: amount - incomeTaxWithheld - residentTax,
        };
      })();

  return {
    serviceYears,
    serviceMonths: months,
    deduction,
    afterDeduction,
    halfRule,
    taxableIncome,
    taxRate,
    incomeTaxBase,
    reconstructionTax,
    incomeTax,
    cityTax,
    prefTax,
    residentTax,
    totalTax,
    net,
    netRate: amount > 0 ? net / amount : 1,
    withholding,
  };
}

/** 早見表の退職金の額（円） */
export const HAYAMIHYO_AMOUNTS: readonly number[] = [
  5_000_000, 7_500_000, 10_000_000, 15_000_000, 20_000_000, 25_000_000, 30_000_000,
];

/** 早見表の勤続年数 */
export const HAYAMIHYO_YEARS: readonly number[] = [10, 20, 30, 38];

/** 早見表の1マス */
export interface HayamihyoCell {
  years: number;
  /** 退職所得控除額 */
  deduction: number;
  /** 税金の合計 */
  tax: number;
  /** 手取り */
  net: number;
}

/** 早見表の1行 */
export interface HayamihyoRow {
  amount: number;
  cells: HayamihyoCell[];
}

/**
 * 早見表（一般・申告書提出済み・iDeCo一時金なしの前提）。
 *
 * 計算機とまったく同じ `calcTaishokukin()` から作るので、
 * 表と計算結果が食い違うことはない。
 */
export function hayamihyo(): HayamihyoRow[] {
  return HAYAMIHYO_AMOUNTS.map((amount) => ({
    amount,
    cells: HAYAMIHYO_YEARS.map((years) => {
      const r = calcTaishokukin({
        amount,
        service: { years, months: 0 },
        kind: 'general',
        paymentYear: TEN_YEAR_RULE_FROM,
        declarationSubmitted: true,
      });
      return { years, deduction: r.deduction.total, tax: r.totalTax, net: r.net };
    }),
  }));
}
