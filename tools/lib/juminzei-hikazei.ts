/**
 * 住民税 非課税 判定ロジック（令和8年度・令和9年度）
 *
 * 仕様: docs/features/juminzei-hikazei-hantei.md
 *
 * 前年の収入（給与・公的年金）と扶養人数・級地から、その年度の住民税が
 *   - 均等割も所得割もかからない（'none'）
 *   - 所得割はかからないが、均等割はかかる（'kintowari'）
 *   - かかる（'taxed'）
 * のどれになるかを出す。税額そのものは計算しない（tedori-keisan の領分）。
 *
 * ■ 判定の式（e-Gov 法令API で現行条文を確認。2026-10-06）
 *
 * 1. 生活扶助を受けている人・障害者／未成年者／寡婦／ひとり親で前年の合計所得金額が
 *    135万円以下の人は、均等割も所得割もかからない
 *    （地方税法 24条の5 第1項・295条1項 1号・2号）
 * 2. 均等割は、前年の合計所得金額が条例で定める額以下ならかからない（地方税法 295条3項）。
 *    条例の額の基準は施行令 47条の3：
 *      基本額 × (同一生計配偶者・扶養親族の数 + 1) + 10万円
 *      （配偶者・扶養親族があるときは、さらに加算額）
 *    基本額は 35万円、加算額は 21万円に、**生活保護の級地ごとの率**を掛けた額を参酌して定める。
 *    率は地方税法施行規則 9条の21 第2項で 1級地 1.0・2級地 0.9・3級地 0.8。
 *    → 1級地 35万・21万／2級地 31.5万・18.9万／3級地 28万・16.8万
 * 3. 所得割は、前年の**総所得金額等**が次の額以下ならかからない（地方税法 附則3条の3 第4項。
 *    道府県民税は同 第1項）：
 *      35万円 × (同一生計配偶者・扶養親族の数 + 1) + 10万円
 *      （配偶者・扶養親族があるときは、さらに 32万円）
 *    こちらは**級地によらない**全国共通の額。
 *
 * どちらも**所得控除を引く前**の金額で比べる。医療費控除・ふるさと納税・社会保険料控除で
 * 所得割の額が0円になっても、それは「非課税」ではない（#340 レビュー）。
 * 本ツールが所得控除の入力欄を持たないのはこのため。
 *
 * 人数（n − 1）に数えるのは「年齢16歳未満の者」と「控除対象扶養親族」（附則3条の3・
 * 施行令47条の3 の括弧書き）。**16歳未満の子は扶養控除が無いので年末調整の扶養控除の欄に
 * 書かないが、ここでは数える**。0人と入れる誤入力がいちばん起きやすい。
 *
 * ■ 年度と所得の年
 * 住民税の年度は所得の年の翌年度。令和9年度（2027年度）は2026年の収入で決まる。
 * 住民税の総所得金額は所得税法の例によって算定する（地方税法 313条）ので、
 * 令和9年度の給与所得控除は所得税の令和8年分と同じ表（最低保障74万円 = 本則69万円 +
 * 令和8・9年分の特例5万円）、令和8年度は令和7年分の表（最低保障65万円）になる。
 * 表そのものは lib/furusato-nozei.ts（令和8年分）と lib/nenmatsu-chosei.ts（令和7年分）
 * から import して、ここには持たない。
 *
 * ■ 給与所得の端数（所得税法 28条4項・別表第五）
 * 給与収入660万円未満は、別表第五の「年末調整等のための給与所得控除後の給与等の金額の表」
 * で給与所得が決まる。給与所得控除が最低保障額を超える帯（令和8年分は220万円以上・
 * 令和7年分は190万円以上）では**収入を4,000円単位に切り捨てた額**に控除の式を当てる。
 * 境目の目安表（大阪市の「204万3,999円」「205万9,999円」）はこの切り捨てで出る数字で、
 * 切り捨てないと境目が数千円ずれる。
 *
 * ■ 年齢の基準日
 * - 公的年金等控除の「65歳以上」：所得の年の12月31日の現況（所得税法 85条。
 *   租税特別措置法 41条の15の3）
 * - 未成年者：賦課期日（その年度の1月1日）の現況（地方税法 39条・318条）
 * 年齢計算ニ関スル法律により、誕生日の前日の終了時（24時）に1つ年をとるので、
 * 「その日の現況」は**その日の翌日の満年齢**で見る（ageAt は誕生日の当日に増える流儀）。
 * 結果、令和9年度は 65歳以上＝1962年1月1日以前の生まれ、
 * 未成年＝2009年1月3日以降の生まれ。
 *
 * 【データ更新箇所】
 * - 年度を足すときは NENDO_RULES に1行。給与所得控除・所得税の基礎控除の関数を差し替える
 * - 非課税限度額（35万円・21万円・32万円・10万円・135万円）が改正されたら LIMIT_* を直す
 * - 公的年金等控除の表は PENSION_TABLE_*（令和2年分以後、改正なし）
 */

import { basicDeductionIncomeTax, salaryDeduction } from '@/lib/furusato-nozei';
import { basicDeductionIncomeTaxR7, salaryDeductionR7 } from '@/lib/nenmatsu-chosei';
import { ageAt, type DateParts } from '@/lib/nenrei';

// ---------------------------------------------------------------- 定数

/** 非課税限度額の基本額（地方税法 附則3条の3・施行令47条の3。1級地の額） */
export const LIMIT_BASE = 350_000;
/** 均等割の加算額（施行令47条の3 第3号。1級地の額） */
export const LIMIT_KINTOWARI_ADD = 210_000;
/** 所得割の加算額（地方税法 附則3条の3。級地によらない） */
export const LIMIT_SHOTOKUWARI_ADD = 320_000;
/** 令和3年度から足されている10万円（給与所得控除・公的年金等控除の10万円引下げに合わせたもの） */
export const LIMIT_EXTRA = 100_000;
/** 障害者・未成年者・寡婦・ひとり親の非課税の上限（合計所得金額。地方税法 295条1項2号） */
export const SPECIAL_LIMIT = 1_350_000;

/** 級地。'unknown' は1級地で判定し、2・3級地なら変わる幅を別に出す */
export type Kyuchi = 1 | 2 | 3;

/** 級地ごとの率（地方税法施行規則 9条の21 第2項） */
export const KYUCHI_RATE: Record<Kyuchi, number> = { 1: 1.0, 2: 0.9, 3: 0.8 };

/** 扶養人数の上限（入力欄）。0〜6 */
export const MAX_DEPENDENTS = 6;

/**
 * 収入の上限（入力欄）。公的年金等控除は「公的年金等以外の合計所得金額」が
 * 1,000万円を超えると減るが、その帯は本ツールの客層では起きないので入力で弾く
 * （給与1,000万円の給与所得は805万円で、1,000万円に届かない）
 */
export const MAX_INCOME = 10_000_000;

/** 別表第五の切り捨て単位（給与収入660万円未満） */
const TABLE5_UNIT = 4_000;
const TABLE5_UPPER = 6_600_000;

export type Nendo = 'R8' | 'R9';

export interface NendoRule {
  /** 表示名 例: 「令和9年度」 */
  label: string;
  /** 西暦の年度（＝賦課期日の年） */
  fiscalYear: number;
  /** 所得の年（前年） */
  incomeYear: number;
  /** 所得の年の所得税の表示名 例: 「令和8年分」 */
  incomeYearLabel: string;
  /** 給与所得控除（所得の年の表） */
  salaryDeduction: (income: number) => number;
  /** 給与所得控除の最低保障額 */
  salaryMin: number;
  /** 最低保障額が終わる給与収入（ここから別表第五の4,000円の切り捨てが効く） */
  salaryMinUntil: number;
  /** 所得の年の所得税の基礎控除（「所得税はかからないのに住民税はかかる帯」の説明用） */
  basicDeductionIncomeTax: (totalIncome: number) => number;
  /** 同一生計配偶者・扶養親族の所得要件（合計所得金額）と、給与だけの場合の年収 */
  dependentIncomeMax: number;
  dependentSalaryMax: number;
}

/** 【データ更新箇所】年度ごとの定数 */
export const NENDO_RULES: Record<Nendo, NendoRule> = {
  R8: {
    label: '令和8年度',
    fiscalYear: 2026,
    incomeYear: 2025,
    incomeYearLabel: '令和7年分',
    salaryDeduction: salaryDeductionR7,
    salaryMin: 650_000,
    salaryMinUntil: 1_900_000,
    basicDeductionIncomeTax: basicDeductionIncomeTaxR7,
    dependentIncomeMax: 580_000,
    dependentSalaryMax: 1_230_000,
  },
  R9: {
    label: '令和9年度',
    fiscalYear: 2027,
    incomeYear: 2026,
    incomeYearLabel: '令和8年分',
    // 令和9・10年度は最低保障 74万円（本則69万円 + 特例5万円）
    salaryDeduction,
    salaryMin: 740_000,
    salaryMinUntil: 2_200_000,
    basicDeductionIncomeTax,
    // 令和9・10年度は58万円 → 62万円（給与収入136万円以下）
    dependentIncomeMax: 620_000,
    dependentSalaryMax: 1_360_000,
  },
};

/** 既定の年度（2026年の収入で決まる、来年6月からの住民税） */
export const DEFAULT_NENDO: Nendo = 'R9';

// ---------------------------------------------------------------- 所得

const clampIncome = (v: number) =>
  Number.isFinite(v) ? Math.min(MAX_INCOME, Math.max(0, Math.floor(v))) : 0;

/**
 * 給与所得（給与収入 − 給与所得控除）。660万円未満は別表第五の4,000円単位の切り捨てを入れる。
 */
export function kyuyoShotoku(income: number, nendo: Nendo): number {
  const rule = NENDO_RULES[nendo];
  const i = clampIncome(income);
  if (i <= 0) return 0;
  const base =
    i >= rule.salaryMinUntil && i < TABLE5_UPPER ? Math.floor(i / TABLE5_UNIT) * TABLE5_UNIT : i;
  return Math.max(0, Math.floor(base - rule.salaryDeduction(base)));
}

/**
 * 公的年金等控除（公的年金等以外の合計所得金額が1,000万円以下の場合。所得税法 35条4項・
 * 租税特別措置法 41条の15の3）。
 */
export function nenkinKojo(pension: number, over65: boolean): number {
  const p = clampIncome(pension);
  if (p <= 0) return 0;
  if (over65 && p <= 3_300_000) return Math.min(p, 1_100_000);
  if (!over65 && p <= 1_300_000) return Math.min(p, 600_000);
  if (p <= 4_100_000) return Math.floor(p * 0.25 + 275_000);
  if (p <= 7_700_000) return Math.floor(p * 0.15 + 685_000);
  if (p <= 10_000_000) return Math.floor(p * 0.05 + 1_455_000);
  return 1_955_000;
}

/** 公的年金等に係る雑所得 */
export function nenkinShotoku(pension: number, over65: boolean): number {
  const p = clampIncome(pension);
  return Math.max(0, p - nenkinKojo(p, over65));
}

/**
 * 所得金額調整控除（給与と公的年金の両方がある場合。租税特別措置法 41条の3の11 第2項）。
 * （給与所得（10万円まで） ＋ 年金の雑所得（10万円まで）） − 10万円。給与所得から引く。
 */
export function shotokuChoseiKojo(kyuyo: number, nenkin: number): number {
  if (kyuyo <= 0 || nenkin <= 0) return 0;
  return Math.max(0, Math.min(kyuyo, 100_000) + Math.min(nenkin, 100_000) - 100_000);
}

// ---------------------------------------------------------------- 限度額

export interface Limits {
  /** 均等割の非課税限度額（合計所得金額） */
  kintowari: number;
  /** 所得割の非課税限度額（総所得金額等） */
  shotokuwari: number;
}

/**
 * 非課税限度額。dependents は同一生計配偶者・扶養親族（16歳未満の子を含む）の人数。
 * 均等割の額は条例で定めるもので、ここに出すのは施行令の基準どおりに定めた場合の額。
 */
export function limits({ dependents, kyuchi }: { dependents: number; kyuchi: Kyuchi }): Limits {
  const d = Math.min(MAX_DEPENDENTS, Math.max(0, Math.floor(dependents) || 0));
  const n = d + 1;
  const rate = KYUCHI_RATE[kyuchi];
  // 円未満が出ない率（1.0・0.9・0.8）だが、小数の誤差を避けて四捨五入で整数に戻す
  const base = Math.round(LIMIT_BASE * rate);
  const add = Math.round(LIMIT_KINTOWARI_ADD * rate);
  return {
    kintowari: base * n + LIMIT_EXTRA + (d > 0 ? add : 0),
    shotokuwari: LIMIT_BASE * n + LIMIT_EXTRA + (d > 0 ? LIMIT_SHOTOKUWARI_ADD : 0),
  };
}

// ---------------------------------------------------------------- 判定

export interface PersonInput {
  /** 給与収入（年額・額面・円） */
  salary: number;
  /** 公的年金等の収入（年額・円） */
  pension: number;
  /** 所得の年の12月31日時点で65歳以上か */
  over65: boolean;
  /** 同一生計配偶者・扶養親族の人数（16歳未満の子を含む） */
  dependents: number;
  /** 障害者・未成年者・寡婦・ひとり親のいずれかに当たるか */
  special: boolean;
}

export interface JudgeInput extends PersonInput {
  nendo: Nendo;
  kyuchi: Kyuchi;
}

/** 'none' 均等割も所得割もかからない／'kintowari' 所得割はかからないが均等割はかかる／'taxed' かかる */
export type Status = 'none' | 'kintowari' | 'taxed';

export interface JudgeResult {
  status: Status;
  /** 均等割がかからないか */
  kintowariFree: boolean;
  /** 所得割がかからないか */
  shotokuwariFree: boolean;
  /** 障害者・未成年者・寡婦・ひとり親の135万円の基準で非課税になったか */
  bySpecial: boolean;
  /** 給与所得（所得金額調整控除の後） */
  kyuyoShotoku: number;
  /** 公的年金等に係る雑所得 */
  nenkinShotoku: number;
  /** 所得金額調整控除 */
  choseiKojo: number;
  /** 合計所得金額（＝本ツールの入力では総所得金額等と同じ） */
  totalIncome: number;
  limitKintowari: number;
  limitShotokuwari: number;
  /**
   * 均等割も所得割もかからないままでいられる給与収入の上限と、いまとの差。
   * いま均等割がかかっているなら null
   */
  maxSalaryNone: number | null;
  headroomSalary: number | null;
  /** 所得割がかからないままでいられる給与収入の上限（いま所得割がかかっているなら null） */
  maxSalaryShotokuwari: number | null;
  /** 所得の年の所得税の基礎控除（合計所得金額に応じた額） */
  basicDeductionIncomeTax: number;
  /** 合計所得金額が所得税の基礎控除以下か（ほかの所得控除を入れずに、所得税がかからないか） */
  incomeTaxFreeByBasic: boolean;
}

/** 入力を正規化する（NaN・負数・上限超えを丸める） */
function normalize(input: PersonInput): PersonInput {
  return {
    salary: clampIncome(input.salary),
    pension: clampIncome(input.pension),
    over65: input.over65,
    dependents: Math.min(MAX_DEPENDENTS, Math.max(0, Math.floor(input.dependents) || 0)),
    special: input.special,
  };
}

/** 合計所得金額と内訳 */
export function totalIncomeOf(input: PersonInput, nendo: Nendo) {
  const p = normalize(input);
  const kyuyoRaw = kyuyoShotoku(p.salary, nendo);
  const nenkin = nenkinShotoku(p.pension, p.over65);
  const chosei = shotokuChoseiKojo(kyuyoRaw, nenkin);
  const kyuyo = kyuyoRaw - chosei;
  return { kyuyo, nenkin, chosei, total: kyuyo + nenkin };
}

function statusOf(total: number, lim: Limits, special: boolean) {
  const bySpecial = special && total <= SPECIAL_LIMIT;
  const kintowariFree = bySpecial || total <= lim.kintowari;
  const shotokuwariFree = bySpecial || total <= lim.shotokuwari;
  const status: Status = kintowariFree ? 'none' : shotokuwariFree ? 'kintowari' : 'taxed';
  return { bySpecial, kintowariFree, shotokuwariFree, status };
}

/**
 * 条件を満たす最大の給与収入（または年金収入。ほかの入力は固定）。収入に対して合計所得金額は
 * 減らない（所得金額調整控除が入っても単調）ので、二分探索で引ける。
 * 0円でも満たさなければ null。
 */
function maxIncomeWhere(
  input: JudgeInput,
  field: 'salary' | 'pension',
  ok: (s: ReturnType<typeof statusOf>) => boolean,
) {
  const lim = limits(input);
  const test = (v: number) =>
    ok(statusOf(totalIncomeOf({ ...input, [field]: v }, input.nendo).total, lim, input.special));
  if (!test(0)) return null;
  if (test(MAX_INCOME)) return MAX_INCOME;
  let lo = 0;
  let hi = MAX_INCOME;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (test(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * 境目の収入。which = 'kintowari' なら均等割もかからない上限、'shotokuwari' なら所得割がかからない上限。
 * 早見表（app/juminzei-hikazei/tables.ts）もこれで作り、本文に額を手で書かない。
 */
export function maxIncomeFor(
  input: JudgeInput,
  field: 'salary' | 'pension',
  which: 'kintowari' | 'shotokuwari',
): number | null {
  const p = { ...input, ...normalize(input) };
  return maxIncomeWhere(p, field, (x) => (which === 'kintowari' ? x.kintowariFree : x.shotokuwariFree));
}

export function judge(input: JudgeInput): JudgeResult {
  const p = { ...input, ...normalize(input) };
  const rule = NENDO_RULES[p.nendo];
  const { kyuyo, nenkin, chosei, total } = totalIncomeOf(p, p.nendo);
  const lim = limits(p);
  const s = statusOf(total, lim, p.special);
  const maxSalaryNone = s.kintowariFree ? maxIncomeFor(p, 'salary', 'kintowari') : null;
  const maxSalaryShotokuwari = s.shotokuwariFree ? maxIncomeFor(p, 'salary', 'shotokuwari') : null;
  const basic = rule.basicDeductionIncomeTax(total);
  return {
    ...s,
    kyuyoShotoku: kyuyo,
    nenkinShotoku: nenkin,
    choseiKojo: chosei,
    totalIncome: total,
    limitKintowari: lim.kintowari,
    limitShotokuwari: lim.shotokuwari,
    maxSalaryNone,
    headroomSalary: maxSalaryNone === null ? null : maxSalaryNone - p.salary,
    maxSalaryShotokuwari,
    basicDeductionIncomeTax: basic,
    incomeTaxFreeByBasic: total <= basic,
  };
}

/**
 * 級地が分からないとき用。1〜3級地それぞれの結論を返す
 * （「1級地で判定し、2・3級地なら変わる幅を出す」）。
 */
export function judgeAllKyuchi(input: Omit<JudgeInput, 'kyuchi'>): Record<Kyuchi, JudgeResult> {
  return {
    1: judge({ ...input, kyuchi: 1 }),
    2: judge({ ...input, kyuchi: 2 }),
    3: judge({ ...input, kyuchi: 3 }),
  };
}

// ---------------------------------------------------------------- 世帯

export interface HouseholdResult {
  /** 世帯全員が均等割も所得割もかからない＝住民税非課税世帯の見込み */
  hikazeiSetai: boolean;
  members: JudgeResult[];
  /** 課税される（均等割か所得割がかかる）人の添字 */
  taxedIndexes: number[];
}

/**
 * 世帯の判定。世帯（住民票上の世帯）の全員が非課税（均等割もかからない）のときだけ
 * 住民税非課税世帯。世帯員ごとに扶養人数で限度額が決まる（親を扶養している子の限度額は
 * 子の扶養人数で決まる。#340 レビュー）。
 */
export function judgeHousehold(
  members: PersonInput[],
  { nendo, kyuchi }: { nendo: Nendo; kyuchi: Kyuchi },
): HouseholdResult {
  const results = members.map((m) => judge({ ...m, nendo, kyuchi }));
  const taxedIndexes = results.flatMap((r, i) => (r.status === 'none' ? [] : [i]));
  return {
    hikazeiSetai: results.length > 0 && taxedIndexes.length === 0,
    members: results,
    taxedIndexes,
  };
}

// ---------------------------------------------------------------- 年齢の基準日

const nextDay = ({ year, month, day }: DateParts): DateParts => {
  const d = new Date(Date.UTC(year, month - 1, day + 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
};

/**
 * 基準日の「現況」での満年齢。年齢計算ニ関スル法律により誕生日の前日の終了時に
 * 年をとるので、基準日の終了時点＝翌日の ageAt で見る。
 */
export function ageAtEndOf(birth: DateParts, base: DateParts): number {
  return ageAt(birth, nextDay(base));
}

/** 公的年金等控除の「65歳以上」か（所得の年の12月31日の現況） */
export function isOver65(birth: DateParts, nendo: Nendo): boolean {
  const y = NENDO_RULES[nendo].incomeYear;
  return ageAtEndOf(birth, { year: y, month: 12, day: 31 }) >= 65;
}

/** 未成年者（18歳未満）か（賦課期日＝その年度の1月1日の現況） */
export function isMinor(birth: DateParts, nendo: Nendo): boolean {
  const y = NENDO_RULES[nendo].fiscalYear;
  return ageAtEndOf(birth, { year: y, month: 1, day: 1 }) < 18;
}

/** 65歳以上になる生年月日の最後の日（この日以前の生まれが65歳以上） */
export function over65BornOnOrBefore(nendo: Nendo): DateParts {
  const y = NENDO_RULES[nendo].incomeYear;
  // 12月31日の終了時に65歳 ⇔ 翌年1月1日の時点で65歳 ⇔ 生まれが (y − 64) 年1月1日以前
  return { year: y - 64, month: 1, day: 1 };
}

/** 未成年者になる生年月日の最初の日（この日以降の生まれが未成年） */
export function minorBornOnOrAfter(nendo: Nendo): DateParts {
  const y = NENDO_RULES[nendo].fiscalYear;
  // 1月1日の終了時に18歳未満 ⇔ 1月2日の時点で18歳未満 ⇔ 生まれが (y − 18) 年1月3日以降
  return { year: y - 18, month: 1, day: 3 };
}

/** DateParts を「2009年1月3日」の形に */
export function fmtDate({ year, month, day }: DateParts): string {
  return `${year}年${month}月${day}日`;
}
