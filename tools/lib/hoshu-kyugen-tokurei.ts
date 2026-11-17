/**
 * 報酬急減の特例改定 判定・保険料計算機の計算ロジック。
 *
 * 仕様: docs/features/hoshu-kyugen-tokurei.md
 *
 * 療養・育児・介護と仕事を両立するための就労調整（所定労働時間の短縮・時間外労働の抑制など）で
 * 報酬が急減したとき、2027-01-01 から「報酬減となった初月の翌月から」標準報酬月額を改定できる
 * 特例（保険者算定の特例）に当たるかを判定し、下がる保険料と、引き換えに減る年金・手当金を出す。
 *
 * ■ このファイルが新しく持つのは「特例の要件」と判定だけ
 * - 等級表・厚生年金の上限：lib/shaho-grades.ts（`GRADES`・`pensionCapAt()`）
 * - 料率：lib/shaho-ryoritsu.ts（協会けんぽ47支部・介護・厚生年金）と
 *   lib/kosodate-shienkin.ts の `FISCAL_YEARS`（支援金。年度の引き方は taishokugo-kenko-hoken の `shienkinFor`）
 * - 傷病手当金・出産手当金の日額：lib/kenpo-daily-amount.ts
 *
 * ■ 一次情報（2026-11-13 に確認）
 * - 厚生労働省 保険局保険課長ほか通知「療養、育児又は介護により報酬が急減した者についての
 *   健康保険法及び厚生年金保険法の標準報酬月額の保険者算定の特例について」
 *   （保保発0731第4号・年年発0731第1号・年管管発0731第7号、令和8年7月31日）
 *   https://www.mhlw.go.jp/content/001731743.pdf
 * - 厚生年金保険法26条（3歳に満たない子を養育する被保険者等の標準報酬月額の特例）
 *   https://laws.e-gov.go.jp/law/329AC0000000115
 *
 * 【データ更新箇所】特例の要件（下の定数）。日本年金機構の Q&A が出たら
 * `TOKUREI_EFFECTIVE_FROM` の扱い（2026年中に始まった就労調整）と、健保・厚年の等級の数え方を見直す。
 */

import { compareDate, type DateParts } from '@/lib/date-parts';
import { dailyFromStandard } from '@/lib/kenpo-daily-amount';
import { GRADES, pensionCapAt, roundPremium } from '@/lib/shaho-grades';
import {
  KAIGO_RATE,
  KYOKAI_HEALTH_RATE_TABLES,
  PENSION_RATE,
  type Prefecture,
} from '@/lib/shaho-ryoritsu';
import {
  addMonthsYm,
  fiscalYearOfYm,
  shienkinFor,
  type ShienkinMark,
  type YearMonth,
} from '@/lib/taishokugo-kenko-hoken';

export { addMonthsYm, type YearMonth };

// ================================================================ 特例の要件（定数）

/** 特例の適用開始日（通知「第3 適用期日」）。報酬減となった初月がこの月以降のときだけ対象として扱う */
export const TOKUREI_EFFECTIVE_FROM = '2027-01-01';

/** 初月の支払基礎日数の下限（一般）。17日未満は対象外 */
export const MIN_BASE_DAYS = 17;

/** 初月の支払基礎日数の下限（短時間労働者＝4分の3基準を満たさない者）。11日未満は対象外 */
export const MIN_BASE_DAYS_SHORT = 11;

/** 従前から何等級以上下がれば対象か */
export const MIN_GRADE_DROP = 2;

/** 減った状態が続く見込みの月数（以上） */
export const MIN_LASTING_MONTHS = 3;

/** 初月を含めた被保険者期間がこの月数未満なら対象外 */
export const MIN_INSURED_MONTHS = 3;

/** 老齢厚生年金の報酬比例部分の乗率（2003年4月以後の期間。1000分の5.481） */
export const PENSION_ACCRUAL_RATE = 5.481 / 1000;

/** 「特例の月数」（年金・手当金の減少を数える月数）の既定 */
export const DEFAULT_TOKUREI_MONTHS = 12;

/** 定時決定で改定される月（9月分から） */
const TEIJI_MONTH = 9;

/** 制度データを最後に一次情報と突き合わせた日 */
export const DATA_CHECKED_AT = '2026-11-13';

// ================================================================ 入力

export type Reason = 'ryoyo-honnin' | 'ryoyo-kazoku' | 'ikuji' | 'kaigo';

export const REASON_LABELS: Readonly<Record<Reason, string>> = {
  'ryoyo-honnin': '療養（本人の治療など）',
  'ryoyo-kazoku': '療養（家族の治療に伴う看護）',
  ikuji: '育児（小学校就学前の子）',
  kaigo: '介護（要介護・要支援の家族）',
};

/**
 * 就労調整の中身。通常の随時改定と比べるときの相手が変わる。
 * - `jitan`：所定労働時間の短縮など、固定的賃金（基本給・手当の単価）が変わる → 比較相手は随時改定（4か月目から）
 * - `zangyo`：時間外労働の抑制だけで、固定的賃金は変わらない → 随時改定は起きず、比較相手は次の定時決定（9月分から）
 */
export type Adjustment = 'jitan' | 'zangyo';

export interface TokureiInput {
  reason: Reason;
  /** 育児のとき：子の生年月日 */
  childBirth?: DateParts | null;
  /** 介護のとき：家族が要介護・要支援の認定を受けているか */
  kaigoNintei?: boolean;
  /** 従前の標準報酬月額（健康保険）。等級表に無い額なら報酬月額として等級を引く */
  formerStandard: number;
  /**
   * 従前の報酬月額（分かるときだけ）。健保50級・厚年の最上位等級の「2等級として扱う」特則の判定に使う。
   * 「月の報酬の目安」から従前の等級を出したときはその額。
   */
  formerPay?: number | null;
  /** 報酬減となった初月に受けた報酬の総額（残業代・通勤手当を含む） */
  firstMonthPay: number;
  /** 報酬減となった初月 'YYYY-MM' */
  firstMonth: YearMonth;
  /** 初月の支払基礎日数 */
  baseDays: number;
  /** 短時間労働者（4分の3基準を満たさない）か */
  shortTime: boolean;
  /** 減った状態が3か月以上続く見込みか */
  lastsThreeMonths: boolean;
  /** 初月の翌月に退職（資格喪失）するか */
  retiresNextMonth: boolean;
  /** 初月を含めた被保険者期間が3か月未満か */
  insuredUnder3Months: boolean;
  adjustment: Adjustment;
  /** 年齢（40〜64歳なら介護保険料を含める） */
  age: number;
  /** 協会けんぽの都道府県。`null` なら健康保険組合（`kumiaiHealthRate` を使う） */
  prefecture: Prefecture | null;
  /** 健康保険組合の健康保険料率（全額・労使合計。例 0.095）。介護・支援金は含めない */
  kumiaiHealthRate?: number;
  /** 特例の月数（年金・手当金の減少を数える。既定12） */
  tokureiMonths: number;
  /**
   * 育児で3歳未満のとき：養育を始めた月の前月の標準報酬月額（厚生年金。養育特例の基準）。
   * 未入力なら従前の額と同じとみなす
   */
  ikujiBaseStandard?: number | null;
}

// ================================================================ 等級

/** [等級, 標準報酬月額, 報酬月額下限（以上）, 報酬月額上限（未満）] */
export type GradeRow = readonly [number, number, number, number];

/** 健康保険の等級表（1〜50級）。shaho-grades.ts の GRADES そのもの */
export const healthGrades = (): ReadonlyArray<GradeRow> => GRADES;

/**
 * その月（'YYYY-MM'）の厚生年金の等級表。健康保険の等級表から、標準報酬月額が
 * 88,000円〜その月の上限（`pensionCapAt`）の行を取り出して1級から振り直す。
 * 1級は報酬月額の下限を0に、最上位の級は上限を無限大にする。
 */
export function pensionGrades(ym: YearMonth): ReadonlyArray<GradeRow> {
  const cap = pensionCapAt(`${ym}-01`);
  const rows = GRADES.filter((g) => g[1] >= 88_000 && g[1] <= cap);
  return rows.map((g, i) => [
    i + 1,
    g[1],
    i === 0 ? 0 : g[2],
    i === rows.length - 1 ? Number.MAX_SAFE_INTEGER : g[3],
  ]);
}

/** 報酬月額から等級表の行を引く */
export function rowOfPay(table: ReadonlyArray<GradeRow>, pay: number): GradeRow {
  for (const g of table) if (pay >= g[2] && pay < g[3]) return g;
  return table[table.length - 1];
}

/**
 * 標準報酬月額から等級表の行を引く。等級表にちょうど同じ額が無ければ、報酬月額とみなして引く
 * （`exact: false`）。厚生年金で上限を超える額・下限を下回る額は、上限・下限の級に丸める。
 */
export function rowOfStandard(
  table: ReadonlyArray<GradeRow>,
  standard: number,
): { row: GradeRow; exact: boolean } {
  const hit = table.find((g) => g[1] === standard);
  if (hit) return { row: hit, exact: true };
  const top = table[table.length - 1];
  if (standard > top[1]) return { row: top, exact: true };
  if (standard < table[0][1]) return { row: table[0], exact: true };
  return { row: rowOfPay(table, standard), exact: false };
}

/**
 * 「2等級として扱う」特則のしきい値（通知の※2）。**固定値で持たない**：
 * - 最上位：最上位の級の報酬月額の下限 ＋ 1等級ぶんの幅（最上位と1つ下の標準報酬月額の差）
 *   健保50級なら 1,355,000 + 60,000 = 1,415,000、厚年32級なら 635,000 + 30,000 = 665,000
 * - 第2級：1級の報酬月額の上限 − 1等級ぶんの幅（2級と1級の標準報酬月額の差）
 *   健保なら 63,000 − 10,000 = 53,000、厚年なら 93,000 − 10,000 = 83,000
 */
export function specialThresholds(table: ReadonlyArray<GradeRow>): { top: number; bottom: number } {
  const n = table.length;
  const top = table[n - 1][2] + (table[n - 1][1] - table[n - 2][1]);
  const bottom = table[0][3] - (table[1][1] - table[0][1]);
  return { top, bottom };
}

/**
 * 従前の級から、初月の報酬総額の級へ何等級下がったか（特則を含めた数え方）。
 * - 従前が最上位の級で、従前の報酬月額が特則のしきい値以上 → 1つ下の級以下へ下がれば +1（＝2等級として扱う）
 * - 従前が第2級で、初月の報酬が特則のしきい値未満 → 1級へ下がれば +1
 */
export function gradeDrop(
  table: ReadonlyArray<GradeRow>,
  formerRow: GradeRow,
  formerPay: number | null,
  newPay: number,
): { newRow: GradeRow; drop: number; special: boolean } {
  const newRow = rowOfPay(table, newPay);
  const raw = formerRow[0] - newRow[0];
  const th = specialThresholds(table);
  const topGrade = table[table.length - 1][0];
  let special = false;
  if (raw >= 1 && formerRow[0] === topGrade && formerPay !== null && formerPay >= th.top) special = true;
  if (raw === 1 && formerRow[0] === 2 && newPay < th.bottom) special = true;
  return { newRow, drop: raw + (special ? 1 : 0), special };
}

// ================================================================ 子の年齢

const pad = (n: number) => String(n).padStart(2, '0');
const ymOfDate = (d: DateParts): YearMonth => `${d.year}-${pad(d.month)}`;
const firstDayOf = (ym: YearMonth): DateParts => {
  const [y, m] = ym.split('-').map(Number);
  return { year: y, month: m, day: 1 };
};

/**
 * 就学前（「6歳に達する日以後の最初の3月31日」まで）の最後の日。
 * 年齢は誕生日の前日に達するので、4月1日生まれは前の年度の3月31日に6歳に達し、早生まれ側になる。
 */
export function preschoolEnd(birth: DateParts): DateParts {
  // 6歳に達する日 = 6回目の誕生日の前日。4/1 生まれは 3/31、それ以外の4月〜12月生まれは翌年度
  const reachYear = birth.year + 6;
  const reachesBeforeApril = birth.month < 4 || (birth.month === 4 && birth.day === 1);
  return { year: reachesBeforeApril ? reachYear : reachYear + 1, month: 3, day: 31 };
}

/** 初月（の1日）に、子が小学校就学前か */
export function isPreschoolIn(birth: DateParts, ym: YearMonth): boolean {
  return compareDate(firstDayOf(ym), preschoolEnd(birth)) <= 0;
}

/**
 * 養育特例（厚年法26条）が効く最後の月。「3歳に達したとき」（3回目の誕生日の前日）の
 * 翌日が属する月の前月まで＝3回目の誕生日の属する月の前月まで。
 */
export function ikujiTokureiLastMonth(birth: DateParts): YearMonth {
  return addMonthsYm(`${birth.year + 3}-${pad(birth.month)}`, -1);
}

/** 月 `ym` に、子が3歳未満（養育特例が効く月）か */
export function isUnder3In(birth: DateParts, ym: YearMonth): boolean {
  return ym <= ikujiTokureiLastMonth(birth) && ym >= ymOfDate(birth);
}

// ================================================================ 早まる月数

export interface Acceleration {
  /** 特例で改定される月（初月の翌月） */
  tokureiFrom: YearMonth;
  /** 特例を使わないときに下がる月（随時改定または定時決定） */
  normalFrom: YearMonth;
  /** 比較相手 */
  normalKind: 'zuiji' | 'teiji';
  /** 早く下がる月（tokureiFrom 〜 normalFrom の前月） */
  months: YearMonth[];
  /**
   * 比較相手の定時決定が、その年の定時決定の対象外（特例改定が7〜9月）なので翌年になったか
   */
  teijiSkipped: boolean;
  /** 初月が5月：その年の定時決定（4〜6月の平均）に減る前の4月の報酬が混ざる */
  teijiMixed: boolean;
}

/**
 * 特例による改定が、通常の改定より何か月早まるか（仕様「早まる月数の式」）。
 * - 時短など（固定的賃金の変動あり）：随時改定は初月から4か月目（M+3）→ 早まるのは M+1・M+2 の2か月
 * - 残業の抑制だけ：比較相手は次の定時決定（9月分から）。M+1 が1〜6月ならその年の9月、
 *   7〜9月（特例改定がその年の定時決定の対象外になる）・10〜12月なら翌年の9月
 */
export function acceleration(firstMonth: YearMonth, adjustment: Adjustment): Acceleration {
  const tokureiFrom = addMonthsYm(firstMonth, 1);
  const [y, n] = tokureiFrom.split('-').map(Number);
  const firstMonthNum = Number(firstMonth.split('-')[1]);
  let normalFrom: YearMonth;
  let teijiSkipped = false;
  if (adjustment === 'jitan') {
    normalFrom = addMonthsYm(firstMonth, 3);
  } else if (n <= 6) {
    normalFrom = `${y}-${pad(TEIJI_MONTH)}`;
  } else {
    normalFrom = `${y + 1}-${pad(TEIJI_MONTH)}`;
    teijiSkipped = n <= TEIJI_MONTH;
  }
  const months: YearMonth[] = [];
  for (let m = tokureiFrom; m < normalFrom; m = addMonthsYm(m, 1)) months.push(m);
  return {
    tokureiFrom,
    normalFrom,
    normalKind: adjustment === 'jitan' ? 'zuiji' : 'teiji',
    months,
    teijiSkipped,
    teijiMixed: adjustment === 'zangyo' && firstMonthNum === 5,
  };
}

// ================================================================ 料率と保険料

export interface MonthRates {
  /** 健康保険（全額） */
  health: number;
  /** 介護保険（全額。40〜64歳のみ） */
  kaigo: number;
  /** 子ども・子育て支援金（全額） */
  shienkin: number;
  /** 厚生年金（全額） */
  pension: number;
  /** 協会けんぽの料率表に無い年度で、直近の年度の料率を使ったか */
  healthSubstituted: boolean;
  /** 支援金の率が確定していない（見込み・政府試算）か、表に無い年度で代用したか */
  shienkinMark: ShienkinMark;
  shienkinSubstituted: boolean;
}

/** 協会けんぽの料率は3月分から変わるので、1・2月分は前の年の表で引く */
function kyokaiFiscalYearOf(ym: YearMonth): number {
  const [y, m] = ym.split('-').map(Number);
  return m >= 3 ? y : y - 1;
}

/** その月分の料率（全額・労使合計）を組み立てる */
export function ratesFor(
  ym: YearMonth,
  opts: { prefecture: Prefecture | null; kumiaiHealthRate?: number; age: number },
): MonthRates {
  let health: number;
  let healthSubstituted = false;
  if (opts.prefecture === null) {
    health = Math.max(0, opts.kumiaiHealthRate ?? 0);
  } else {
    const fy = kyokaiFiscalYearOf(ym);
    const sorted = [...KYOKAI_HEALTH_RATE_TABLES].sort((a, b) => a.fiscalYear - b.fiscalYear);
    let table = sorted.find((t) => t.fiscalYear === fy);
    if (!table) {
      const before = sorted.filter((t) => t.fiscalYear < fy);
      table = before.length > 0 ? before[before.length - 1] : sorted[0];
      healthSubstituted = true;
    }
    health = table.rates[opts.prefecture];
  }
  const s = shienkinFor(fiscalYearOfYm(ym));
  const kaigo = opts.age >= 40 && opts.age < 65 ? Math.round(KAIGO_RATE * 2 * 10_000) / 10_000 : 0;
  return {
    health,
    kaigo,
    shienkin: s.rate,
    pension: Math.round(PENSION_RATE * 2 * 10_000) / 10_000,
    healthSubstituted,
    shienkinMark: s.mark,
    shienkinSubstituted: s.substituted,
  };
}

export interface Premiums {
  health: number;
  kaigo: number;
  shienkin: number;
  pension: number;
  total: number;
}

/**
 * 本人負担（折半）の保険料。保険料ごとに 50銭以下切り捨て・50銭超切り上げ。
 * 実際の給与では健康保険・介護・支援金を合算して端数処理するので±1円ずれることがある。
 */
export function employeePremiums(healthStd: number, pensionStd: number, r: MonthRates): Premiums {
  const health = roundPremium((healthStd * r.health) / 2);
  const kaigo = roundPremium((healthStd * r.kaigo) / 2);
  const shienkin = roundPremium((healthStd * r.shienkin) / 2);
  const pension = roundPremium((pensionStd * r.pension) / 2);
  return { health, kaigo, shienkin, pension, total: health + kaigo + shienkin + pension };
}

/** 事業主負担の目安（全額を円に丸めて本人分を引いた残り） */
export function employerPremiums(healthStd: number, pensionStd: number, r: MonthRates): Premiums {
  const e = employeePremiums(healthStd, pensionStd, r);
  const health = Math.round(healthStd * r.health) - e.health;
  const kaigo = Math.round(healthStd * r.kaigo) - e.kaigo;
  const shienkin = Math.round(healthStd * r.shienkin) - e.shienkin;
  const pension = Math.round(pensionStd * r.pension) - e.pension;
  return { health, kaigo, shienkin, pension, total: health + kaigo + shienkin + pension };
}

// ================================================================ 判定

export type RejectCode =
  | 'before-effective'
  | 'reason-ikuji-age'
  | 'reason-ikuji-birth'
  | 'reason-kaigo-nintei'
  | 'zero-pay'
  | 'base-days'
  | 'grade-drop'
  | 'lasting'
  | 'retire'
  | 'insured-period';

export interface Reject {
  code: RejectCode;
  message: string;
}

export interface MonthPremiumRow {
  ym: YearMonth;
  before: Premiums;
  after: Premiums;
  employerBefore: Premiums;
  employerAfter: Premiums;
  /** 本人分の差額（改定前 − 改定後） */
  diff: number;
  rates: MonthRates;
}

export interface PensionLoss {
  /** 改定前・改定後の厚生年金の標準報酬月額（特例の最初の月） */
  formerStd: number;
  newStd: number;
  /** 特例の月数 */
  months: number;
  /** 養育特例を使わない場合の老齢厚生年金の減少（年額・円） */
  withoutIkuji: number;
  /** 養育特例が効く月数（3歳未満の子の育児で、特例の月数のうち子が3歳になる前の月） */
  ikujiMonths: number;
  /** 養育特例の基準（養育を始めた前月の標準報酬月額。厚年の級に丸めた額） */
  ikujiBase: number | null;
  /** 養育特例を併せて出した場合の減少（年額・円）。養育特例が無ければ withoutIkuji と同じ */
  withIkuji: number;
}

export interface AllowanceDaily {
  /** 特例を使わなかった場合の日額 */
  without: number;
  /** 特例を使った場合（特例の月数が支給開始日以前12か月に入ったとき）の日額 */
  with: number;
  /** 平均に入る特例の月数（最大12） */
  monthsInAverage: number;
}

export interface TokureiResult {
  /** 対象になりうるか（当たらない理由が1つも無い） */
  eligible: boolean;
  rejects: Reject[];
  /** 判定に添える注記（2027年1月より前・等級表に無い額・健保の等級で判定、など） */
  notes: string[];
  health: { formerRow: GradeRow; formerExact: boolean; newRow: GradeRow; drop: number; special: boolean };
  pension: { formerRow: GradeRow; newRow: GradeRow; drop: number; special: boolean };
  accel: Acceleration;
  /** 特例の最初の月の保険料（改定前 → 改定後） */
  firstRow: MonthPremiumRow;
  /** 早く下がる月ごとの保険料 */
  rows: MonthPremiumRow[];
  /** 早く下がる分の合計（本人分） */
  acceleratedTotal: number;
  /** 早く下がる分の合計（事業主分） */
  acceleratedEmployerTotal: number;
  pensionLoss: PensionLoss;
  allowance: AllowanceDaily;
  /** 子が3歳未満（養育特例の案内を出す） */
  ikujiUnder3: boolean;
}

const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`;

function monthRow(
  ym: YearMonth,
  healthFormer: number,
  healthNew: number,
  input: TokureiInput,
): MonthPremiumRow {
  const r = ratesFor(ym, input);
  const table = pensionGrades(ym);
  const pFormer = rowOfStandard(table, healthFormer).row[1];
  const pNew = rowOfPay(table, input.firstMonthPay)[1];
  const before = employeePremiums(healthFormer, pFormer, r);
  const after = employeePremiums(healthNew, pNew, r);
  return {
    ym,
    before,
    after,
    employerBefore: employerPremiums(healthFormer, pFormer, r),
    employerAfter: employerPremiums(healthNew, pNew, r),
    diff: before.total - after.total,
    rates: r,
  };
}

/** 判定と結果をまとめて出す */
export function evaluate(input: TokureiInput): TokureiResult {
  const rejects: Reject[] = [];
  const notes: string[] = [];
  const M = input.firstMonth;
  const accel = acceleration(M, input.adjustment);

  // 0. 適用期日（決めること1：初月が 2027-01 以降のときだけ対象として扱う）
  if (`${M}-01` < TOKUREI_EFFECTIVE_FROM) {
    rejects.push({
      code: 'before-effective',
      message:
        '特例の適用は2027年1月1日からです。2026年中に就労調整を始めた場合、2027年1月以降の月を「報酬減となった初月」として届け出られるかは、年金事務所に確認してください。',
    });
  }

  // 1. 療養・育児・介護の範囲
  let ikujiUnder3 = false;
  if (input.reason === 'ikuji') {
    const birth = input.childBirth ?? null;
    if (!birth) {
      rejects.push({ code: 'reason-ikuji-birth', message: '育児のときは、子の生年月日を入れてください（就学前か・3歳未満かを判定します）。' });
    } else if (!isPreschoolIn(birth, M)) {
      const end = preschoolEnd(birth);
      rejects.push({
        code: 'reason-ikuji-age',
        message: `子が小学校就学前ではありません（${end.year}年3月31日で就学前の期間が終わり、${end.year}年4月に小学校に入学します）。育児の特例は就学前の子の養育が対象です。`,
      });
    } else {
      ikujiUnder3 = isUnder3In(birth, accel.tokureiFrom);
    }
  }
  if (input.reason === 'kaigo' && !input.kaigoNintei) {
    rejects.push({
      code: 'reason-kaigo-nintei',
      message: '介護の特例は、要介護・要支援の認定を受けた家族の介護が対象です。認定を受けていない場合は対象外です。',
    });
  }

  // 2. 報酬ゼロ・支払基礎日数
  if (input.firstMonthPay <= 0) {
    rejects.push({ code: 'zero-pay', message: '初月に全く勤務せず報酬がゼロの場合は対象外です。' });
  } else {
    const min = input.shortTime ? MIN_BASE_DAYS_SHORT : MIN_BASE_DAYS;
    if (input.baseDays < min) {
      rejects.push({
        code: 'base-days',
        message: `初月の支払基礎日数が${min}日未満です（${input.shortTime ? '短時間労働者は11日' : '一般の被保険者は17日'}以上が要件）。就労調整で勤務しなかった日も、所定労働日数が変わっていなければ数えます。`,
      });
    }
  }

  // 3. 2等級以上の低下（健保の等級で判定。厚年はその改定後の額を厚年の等級に当てはめる）
  const hTable = healthGrades();
  const hFormer = rowOfStandard(hTable, input.formerStandard);
  if (!hFormer.exact) {
    notes.push(
      `従前の標準報酬月額 ${yen(input.formerStandard)} は等級表にない額なので、報酬月額とみなして ${hFormer.row[0]}級（${yen(hFormer.row[1])}）で計算しました。`,
    );
  }
  const formerPay = input.formerPay ?? (hFormer.exact ? null : input.formerStandard);
  const hDrop = gradeDrop(hTable, hFormer.row, formerPay, input.firstMonthPay);
  const pTable = pensionGrades(accel.tokureiFrom);
  const pFormerRow = rowOfStandard(pTable, hFormer.row[1]).row;
  const pDrop = gradeDrop(pTable, pFormerRow, formerPay, input.firstMonthPay);
  if (input.firstMonthPay > 0 && hDrop.drop < MIN_GRADE_DROP) {
    rejects.push({
      code: 'grade-drop',
      message:
        hDrop.drop <= 0
          ? `初月の報酬 ${yen(input.firstMonthPay)} の等級（健保${hDrop.newRow[0]}級）は、従前（${hFormer.row[0]}級）より下がっていません。`
          : `初月の報酬 ${yen(input.firstMonthPay)} の等級（健保${hDrop.newRow[0]}級）は、従前（${hFormer.row[0]}級）から${hDrop.drop}等級の低下で、2等級以上に届きません。`,
    });
  }
  notes.push(
    '健康保険と厚生年金で等級の数え方が違うため（厚生年金は1〜32級）、2等級以上の低下は健康保険の等級で判定し、厚生年金は改定後の額を厚生年金の等級に当てはめています。',
  );

  // 4. 続く見込み・資格喪失・被保険者期間
  if (!input.lastsThreeMonths) {
    rejects.push({ code: 'lasting', message: '減った状態が3か月以上続く見込みでない場合は対象外です。' });
  }
  if (input.retiresNextMonth) {
    rejects.push({ code: 'retire', message: '初月の翌月に退職（資格喪失）する場合は対象外です。' });
  }
  if (input.insuredUnder3Months) {
    rejects.push({ code: 'insured-period', message: '初月を含めた被保険者期間が3か月未満の場合は対象外です。' });
  }

  // 保険料（特例の最初の月と、早く下がる月ごと）
  const healthFormer = hFormer.row[1];
  const healthNew = hDrop.newRow[1];
  const firstRow = monthRow(accel.tokureiFrom, healthFormer, healthNew, input);
  const rows = accel.months.map((ym) => monthRow(ym, healthFormer, healthNew, input));
  const acceleratedTotal = rows.reduce((a, r) => a + r.diff, 0);
  const acceleratedEmployerTotal = rows.reduce(
    (a, r) => a + r.employerBefore.total - r.employerAfter.total,
    0,
  );
  if (rows.some((r) => r.rates.healthSubstituted) || rows.some((r) => r.rates.shienkinSubstituted)) {
    notes.push('料率がまだ公表されていない月は、直近の年度の料率で計算しています。');
  }
  if (rows.some((r) => r.rates.shienkinMark !== null) || firstRow.rates.shienkinMark !== null) {
    notes.push('子ども・子育て支援金は、2027年4月分からの率が確定していないため見込みの率で計算しています。');
  }

  // 引き換えに減るもの：老齢厚生年金
  const months = Math.max(0, Math.floor(input.tokureiMonths));
  const pFormerStd = pFormerRow[1];
  const pNewStd = pDrop.newRow[1];
  const lossPerMonth = Math.max(0, pFormerStd - pNewStd);
  const withoutIkuji = Math.round(lossPerMonth * PENSION_ACCRUAL_RATE * months);
  let ikujiMonths = 0;
  let ikujiBase: number | null = null;
  let withIkuji = withoutIkuji;
  if (ikujiUnder3 && input.childBirth) {
    const last = ikujiTokureiLastMonth(input.childBirth);
    for (let i = 0, m = accel.tokureiFrom; i < months; i++, m = addMonthsYm(m, 1)) {
      if (m <= last) ikujiMonths++;
    }
    const baseInput = input.ikujiBaseStandard ?? pFormerStd;
    ikujiBase = rowOfStandard(pTable, baseInput).row[1];
    // みなしは「基準の額と実際の額の高いほう」。従前より基準が低ければ、その差の分は減る
    const protectedLoss = Math.max(0, pFormerStd - Math.max(ikujiBase, pNewStd));
    withIkuji = Math.round(
      (protectedLoss * ikujiMonths + lossPerMonth * (months - ikujiMonths)) * PENSION_ACCRUAL_RATE,
    );
  }

  // 傷病手当金・出産手当金の日額（支給開始日以前12か月の平均）
  const k = Math.min(12, months);
  const avgWith = (healthFormer * (12 - k) + healthNew * k) / 12;

  return {
    eligible: rejects.length === 0,
    rejects,
    notes,
    health: { formerRow: hFormer.row, formerExact: hFormer.exact, newRow: hDrop.newRow, drop: hDrop.drop, special: hDrop.special },
    pension: { formerRow: pFormerRow, newRow: pDrop.newRow, drop: pDrop.drop, special: pDrop.special },
    accel,
    firstRow,
    rows,
    acceleratedTotal,
    acceleratedEmployerTotal,
    pensionLoss: {
      formerStd: pFormerStd,
      newStd: pNewStd,
      months,
      withoutIkuji,
      ikujiMonths,
      ikujiBase,
      withIkuji,
    },
    allowance: {
      without: dailyFromStandard(healthFormer).dailyAmount,
      with: dailyFromStandard(avgWith).dailyAmount,
      monthsInAverage: k,
    },
    ikujiUnder3,
  };
}

// ================================================================ 表示の部品

/** '2027-02' → '2027年2月' */
export function ymJa(ym: YearMonth): string {
  const [y, m] = ym.split('-').map(Number);
  return `${y}年${m}月`;
}

/**
 * 計算機の「報酬減となった初月」の既定：今月 `thisMonth` の翌月。ただし特例の適用（2027-01）より前なら 2027-01。
 * 公開直後（2026-12）に開いた人の最初の判定が「対象外」にならないように（#500 レビュー）。
 * 2026-12 以前を選び直したときは、`evaluate` が適用期日の注記を出す
 */
export function defaultFirstMonth(thisMonth: YearMonth): YearMonth {
  const next = addMonthsYm(thisMonth, 1);
  const effective = TOKUREI_EFFECTIVE_FROM.slice(0, 7);
  return next < effective ? effective : next;
}

/** 翌月徴収のとき、その月分の保険料が引かれる給与の月 */
export const deductedIn = (ym: YearMonth): YearMonth => addMonthsYm(ym, 1);
