/**
 * 賞与（ボーナス）手取り計算機
 *
 * 仕様: docs/features/shoyo-tedori-keisan.md
 *
 * ■ 月給の手取りと計算の仕組みが違うところ
 * - 社会保険料は「標準賞与額」（1,000円未満切り捨て）に料率を掛ける。上限は
 *   健康保険・介護・子ども・子育て支援金が**年度累計573万円**、厚生年金が**1か月150万円**
 * - 雇用保険だけは標準賞与額を使わない。実際の賞与額（切り捨てなし・上限なし）に率を掛ける
 * - 所得税は「賞与に対する源泉徴収税額の算出率の表」で、**前月の給与**（社会保険料等控除後）と
 *   扶養親族等の数から率を引き、（賞与 − 社会保険料）× 率。1円未満切り捨て
 * - **住民税は引かれない**（前年所得ぶんが毎月の給与から特別徴収されるため）
 *
 * ■ 前月の社会保険料は「標準報酬月額（等級）× 率」で求める
 * 額面 × 率で求めると、控除後の給与が算出率の表の行の境目をまたいで
 * 適用率が1段ずれることがある（企画レビュー 2026-09-26 の指摘）。
 * 雇用保険だけは額面 × 率（標準報酬月額を使わない保険料なので）。
 *
 * ■ 月額表で計算する特例（初版は計算しない）
 * 前月に給与が無い・前月の給与が前月の社会保険料以下・
 * 賞与（社会保険料控除後）が前月の給与（同）の10倍を超える場合は、算出率の表ではなく
 * 月額表で計算する（算出率の表の備考4・No.2523）。判定だけして金額は出さない。
 *
 * ■ 一次情報
 * - 国税庁 タックスアンサー No.2523「賞与に対する源泉徴収」
 *   https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2523.htm
 * - 算出率の表は lib/shoyo-gensen-table.ts
 * - 日本年金機構「賞与支払届・標準賞与額」
 *   https://www.nenkin.go.jp/service/kounen/hokenryo/hoshu/20150515-01.html
 * - 国税庁「令和8年度税制改正による所得税の基礎控除の引上げ等について」
 *   https://www.nta.go.jp/users/gensen/2026kiso/index.htm
 *
 * 【データ更新箇所】このファイルに料率・上限・表は**持たない**。
 * 社保の率は lib/shaho-ryoritsu.ts、標準賞与額の上限は lib/shaho-grades.ts
 * （`PENSION_BONUS_CAP`）と lib/kosodate-shienkin.ts（`BONUS_CAP_YEARLY`）、
 * 算出率の表は lib/shoyo-gensen-table.ts（令和9年分への差し替えは2027年夏賞与の前）。
 */

import { BONUS_CAP_YEARLY } from '@/lib/kosodate-shienkin';
import {
  PENSION_BONUS_CAP,
  pensionStandardMonthly,
  roundPremium,
  standardMonthly,
} from '@/lib/shaho-grades';
import {
  EMPLOYMENT_RATE,
  HEALTH_RATE,
  KAIGO_RATE,
  PENSION_RATE,
  SHIENKIN_RATE,
} from '@/lib/shaho-ryoritsu';
import { lookupRate, type RateRow } from '@/lib/shoyo-gensen-table';
import { WITHHOLDING_TABLE_EFFECTIVE_ON } from '@/lib/tedori-keisan';

export interface ShoyoInput {
  /** 賞与の額面（円） */
  bonus: number;
  /** 前月の給与の額面（円）。`noPrevSalary` のときは見ない */
  prevSalary: number;
  /** 前月に給与が無かった */
  noPrevSalary?: boolean;
  /** 扶養親族等の数（甲欄。7以上は「7人以上」） */
  dependents: number;
  /** 扶養控除等申告書を出していない（乙欄） */
  otsu?: boolean;
  /** 40〜64歳（介護保険料がかかる） */
  kaigo?: boolean;
  /** 今年度（4月〜）に既に受け取った賞与の額面の累計（円）。健康保険の573万円上限の判定用 */
  priorBonusThisFiscalYear?: number;
}

export interface BonusPremiums {
  /** 標準賞与額（1,000円未満切り捨て・上限前） */
  standardBonus: number;
  /** 健康保険・介護・支援金の計算に使った標準賞与額（年度累計573万円で頭打ち） */
  healthStandardBonus: number;
  /** 厚生年金の計算に使った標準賞与額（150万円で頭打ち） */
  pensionStandardBonus: number;
  health: number;
  kaigo: number;
  shienkin: number;
  pension: number;
  employment: number;
  total: number;
  /** 健康保険の年度累計上限に当たった */
  healthCapped: boolean;
  /** 厚生年金の150万円上限に当たった */
  pensionCapped: boolean;
}

export interface PrevMonth {
  /** 前月の給与の額面 */
  gross: number;
  /** 健康保険の標準報酬月額 */
  standardMonthly: number;
  /** 前月の社会保険料（標準報酬月額 × 率。雇用保険だけ額面 × 率） */
  social: number;
  /** 前月の社会保険料等控除後の給与等の金額（算出率の表を引く値） */
  afterSocial: number;
}

/** 算出率の表ではなく月額表で計算する場合の理由 */
export type SpecialCase = 'no-prev-salary' | 'over-10x';

export interface ShoyoResult {
  bonus: number;
  premiums: BonusPremiums;
  /** 前月に給与が無いときは null */
  prev: PrevMonth | null;
  /** 月額表で計算する特例に当たるとき。このとき rate / incomeTax / net は null */
  special: SpecialCase | null;
  /** 適用した算出率の表の行 */
  rate: RateRow | null;
  /** 源泉所得税（復興特別所得税込み） */
  incomeTax: number | null;
  /** 住民税（賞与からは引かれないので常に0） */
  residentTax: 0;
  /** 手取り */
  net: number | null;
}

/** 標準賞与額（1,000円未満切り捨て） */
export function standardBonusOf(bonus: number): number {
  return Math.floor(Math.max(0, bonus) / 1000) * 1000;
}

/**
 * 賞与にかかる社会保険料（本人負担）。
 * 各保険料をそれぞれ `roundPremium`（50銭以下切り捨て・50銭超切り上げ）で丸める。
 */
export function bonusPremiums(
  bonus: number,
  kaigo = false,
  priorBonusThisFiscalYear = 0,
): BonusPremiums {
  const b = Math.max(0, bonus);
  const standardBonus = standardBonusOf(b);
  // 年度累計の上限は標準賞与額の累計で見る。既に受け取った分も1回ごとに1,000円未満を切り捨てるが、
  // 回数ごとの額は入力に無いので累計を1回分として切り捨てる（差は最大999円）
  const remaining = Math.max(0, BONUS_CAP_YEARLY - standardBonusOf(priorBonusThisFiscalYear));
  const healthStandardBonus = Math.min(standardBonus, remaining);
  const pensionStandardBonus = Math.min(standardBonus, PENSION_BONUS_CAP);

  const health = roundPremium(healthStandardBonus * HEALTH_RATE);
  const kaigoPremium = kaigo ? roundPremium(healthStandardBonus * KAIGO_RATE) : 0;
  const shienkin = roundPremium(healthStandardBonus * SHIENKIN_RATE);
  const pension = roundPremium(pensionStandardBonus * PENSION_RATE);
  // 雇用保険は標準賞与額を使わない（切り捨てなし・上限なし）
  const employment = roundPremium(b * EMPLOYMENT_RATE);

  return {
    standardBonus,
    healthStandardBonus,
    pensionStandardBonus,
    health,
    kaigo: kaigoPremium,
    shienkin,
    pension,
    employment,
    total: health + kaigoPremium + shienkin + pension + employment,
    healthCapped: healthStandardBonus < standardBonus,
    pensionCapped: pensionStandardBonus < standardBonus,
  };
}

/**
 * 前月の給与（額面）から、前月の社会保険料と控除後の給与を求める。
 * 健康保険・介護・支援金・厚生年金は**標準報酬月額（等級）× 率**。額面 × 率では求めない
 * （算出率の表の行の境目で率が1段ずれるため）。雇用保険だけは額面 × 率。
 */
export function prevMonthOf(prevSalary: number, kaigo = false): PrevMonth {
  const gross = Math.max(0, prevSalary);
  const std = standardMonthly(gross);
  const pensionStd = pensionStandardMonthly(gross);
  const social =
    roundPremium(std * HEALTH_RATE) +
    (kaigo ? roundPremium(std * KAIGO_RATE) : 0) +
    roundPremium(std * SHIENKIN_RATE) +
    roundPremium(pensionStd * PENSION_RATE) +
    roundPremium(gross * EMPLOYMENT_RATE);
  return { gross, standardMonthly: std, social, afterSocial: gross - social };
}

/** 源泉所得税 =（賞与 − 社会保険料）× 算出率、1円未満切り捨て */
export function withholdingTax(bonusAfterSocial: number, rateMilli: number): number {
  // 率は千分の1パーセント単位の整数（2042 = 2.042%）。整数のまま掛けて最後に割る
  return Math.floor((Math.max(0, bonusAfterSocial) * rateMilli) / 100_000);
}

export function calcShoyo(input: ShoyoInput): ShoyoResult {
  const bonus = Math.max(0, input.bonus);
  const kaigo = input.kaigo ?? false;
  const premiums = bonusPremiums(bonus, kaigo, input.priorBonusThisFiscalYear ?? 0);
  const bonusAfterSocial = bonus - premiums.total;

  const noPrev = input.noPrevSalary || input.prevSalary <= 0;
  const prev = noPrev ? null : prevMonthOf(input.prevSalary, kaigo);

  let special: SpecialCase | null = null;
  if (prev === null || prev.afterSocial <= 0) special = 'no-prev-salary';
  else if (bonusAfterSocial > prev.afterSocial * 10) special = 'over-10x';

  if (special !== null) {
    return { bonus, premiums, prev, special, rate: null, incomeTax: null, residentTax: 0, net: null };
  }

  const rate = lookupRate(prev!.afterSocial, input.dependents, input.otsu ?? false);
  const incomeTax = withholdingTax(bonusAfterSocial, rate.rateMilli);
  return {
    bonus,
    premiums,
    prev,
    special: null,
    rate,
    incomeTax,
    residentTax: 0,
    net: bonus - premiums.total - incomeTax,
  };
}

/** 率を画面に出す文字列（2042 → 「2.042%」） */
export function rateLabel(rateMilli: number): string {
  return `${(rateMilli / 1000).toFixed(3)}%`;
}

/**
 * 結果の下に出す年末調整の注記の種類。
 *
 * 令和8年度改正（基礎控除の引上げ）は2026-12-01施行だが、源泉徴収税額表の改正は
 * 2027-01-01施行で、12月に支払う賞与も改正前の表で源泉徴収される。
 * **比べる日付は `WITHHOLDING_TABLE_EFFECTIVE_ON`（2027-01-01）であって `REFORM_EFFECTIVE_ON` ではない。**
 * 後者で切ると、この注記がいちばん要る12月に消える（企画レビュー 2026-09-26 の指摘）。
 *
 * @param today 'YYYY-MM-DD'
 */
export function yearEndNoteKind(today: string): 'r8-year-end-adjustment' | 'r9-table' {
  return today < WITHHOLDING_TABLE_EFFECTIVE_ON ? 'r8-year-end-adjustment' : 'r9-table';
}

/** 早見表の前提：前月の給与（額面） */
export const TABLE_PREV_SALARY = 300_000;

/** 早見表の賞与額（20万〜200万円） */
export const TABLE_BONUSES: readonly number[] = [
  200_000, 300_000, 400_000, 500_000, 600_000, 700_000, 800_000, 1_000_000, 1_200_000, 1_500_000,
  2_000_000,
];

/** 早見表の扶養親族等の数 */
export const TABLE_DEPENDENTS: readonly number[] = [0, 1, 2];

export interface ShoyoTableRow {
  bonus: number;
  /** 扶養 0・1・2人の手取り。月額表の特例に当たるときは null */
  nets: (number | null)[];
}

/** 早見表：賞与 × 扶養 0〜2人（前月の給与 30万円・40歳未満・今年度初の賞与） */
export function shoyoTable(): ShoyoTableRow[] {
  return TABLE_BONUSES.map((bonus) => ({
    bonus,
    nets: TABLE_DEPENDENTS.map(
      (dependents) => calcShoyo({ bonus, prevSalary: TABLE_PREV_SALARY, dependents }).net,
    ),
  }));
}
