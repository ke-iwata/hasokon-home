/**
 * 日数計算・期日計算のロジック
 *
 * 仕様: docs/features/nissu-keisan.md
 *
 * 扱うのは次の3つ。すべて純関数で、DOM・React・現在時刻に依存しない
 * （「今日」は呼び出し側から渡す）。
 *
 * 1. 日数計算（日付A→日付B）— 経過日数・週数・月数・年月日の内訳・曜日
 * 2. 期日計算（○日後・○日前）— 暦日で数える
 * 3. 営業日計算（○営業日後・期間内の営業日数）— 土日と祝日を除く
 *
 * 日付そのものの扱い（うるう年・月末・日数の差）は `lib/date-parts.ts` にある。
 */

import {
  addDays,
  addMonths,
  compareDate,
  daysBetween,
  formatDate,
  isWeekend,
  weekdayLabel,
  type DateParts,
} from './date-parts';

export type { DateParts } from './date-parts';

// ---------------------------------------------------------------- 祝日データ

/** 祝日1日分 */
export interface Holiday {
  /** 'YYYY-MM-DD' */
  date: string;
  /** 祝日の名称（'振替休日' / '国民の休日' を含む） */
  name: string;
}

/**
 * 【データ更新箇所】国民の祝日（内閣府「国民の祝日について」の一覧が正）。
 *
 * https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html で配布されている
 * CSV（syukujitsu.csv）と同じ内容を写している。振替休日・国民の休日も
 * その名前のまま1行として含む（CSVがそうなっているのに合わせた）。
 *
 * **確定済みの年しか持たない。** 祝日は毎年2月ごろに翌年分が官報で公示され、
 * 春分の日・秋分の日は国立天文台の暦要項で確定する。未公示の年を式で
 * 推測して載せると、営業日計算が静かに間違う。範囲外の日付を渡された
 * ときは概算にせず「祝日データの範囲外」として計算を断る（`inHolidayRange`）。
 *
 * **更新のしかた**：翌年分が公示されたら、内閣府CSVの該当年をそのまま写して
 * 末尾に足し、`HOLIDAY_LAST_YEAR` と `HOLIDAY_UPDATED_AT` を直す。
 * `tests/nissu-keisan.test.ts` が祝日法の規則（ハッピーマンデー・振替休日・
 * 国民の休日・春分秋分の近似式）と突き合わせるので、写し間違いはそこで落ちる。
 */
export const HOLIDAYS: Holiday[] = [
  // 2024年（令和6年）
  { date: '2024-01-01', name: '元日' },
  { date: '2024-01-08', name: '成人の日' },
  { date: '2024-02-11', name: '建国記念の日' },
  { date: '2024-02-12', name: '振替休日' },
  { date: '2024-02-23', name: '天皇誕生日' },
  { date: '2024-03-20', name: '春分の日' },
  { date: '2024-04-29', name: '昭和の日' },
  { date: '2024-05-03', name: '憲法記念日' },
  { date: '2024-05-04', name: 'みどりの日' },
  { date: '2024-05-05', name: 'こどもの日' },
  { date: '2024-05-06', name: '振替休日' },
  { date: '2024-07-15', name: '海の日' },
  { date: '2024-08-11', name: '山の日' },
  { date: '2024-08-12', name: '振替休日' },
  { date: '2024-09-16', name: '敬老の日' },
  { date: '2024-09-22', name: '秋分の日' },
  { date: '2024-09-23', name: '振替休日' },
  { date: '2024-10-14', name: 'スポーツの日' },
  { date: '2024-11-03', name: '文化の日' },
  { date: '2024-11-04', name: '振替休日' },
  { date: '2024-11-23', name: '勤労感謝の日' },

  // 2025年（令和7年）
  { date: '2025-01-01', name: '元日' },
  { date: '2025-01-13', name: '成人の日' },
  { date: '2025-02-11', name: '建国記念の日' },
  { date: '2025-02-23', name: '天皇誕生日' },
  { date: '2025-02-24', name: '振替休日' },
  { date: '2025-03-20', name: '春分の日' },
  { date: '2025-04-29', name: '昭和の日' },
  { date: '2025-05-03', name: '憲法記念日' },
  { date: '2025-05-04', name: 'みどりの日' },
  { date: '2025-05-05', name: 'こどもの日' },
  { date: '2025-05-06', name: '振替休日' },
  { date: '2025-07-21', name: '海の日' },
  { date: '2025-08-11', name: '山の日' },
  { date: '2025-09-15', name: '敬老の日' },
  { date: '2025-09-23', name: '秋分の日' },
  { date: '2025-10-13', name: 'スポーツの日' },
  { date: '2025-11-03', name: '文化の日' },
  { date: '2025-11-23', name: '勤労感謝の日' },
  { date: '2025-11-24', name: '振替休日' },

  // 2026年（令和8年）
  { date: '2026-01-01', name: '元日' },
  { date: '2026-01-12', name: '成人の日' },
  { date: '2026-02-11', name: '建国記念の日' },
  { date: '2026-02-23', name: '天皇誕生日' },
  { date: '2026-03-20', name: '春分の日' },
  { date: '2026-04-29', name: '昭和の日' },
  { date: '2026-05-03', name: '憲法記念日' },
  { date: '2026-05-04', name: 'みどりの日' },
  { date: '2026-05-05', name: 'こどもの日' },
  { date: '2026-05-06', name: '振替休日' },
  { date: '2026-07-20', name: '海の日' },
  { date: '2026-08-11', name: '山の日' },
  { date: '2026-09-21', name: '敬老の日' },
  { date: '2026-09-22', name: '国民の休日' },
  { date: '2026-09-23', name: '秋分の日' },
  { date: '2026-10-12', name: 'スポーツの日' },
  { date: '2026-11-03', name: '文化の日' },
  { date: '2026-11-23', name: '勤労感謝の日' },

  // 2027年（令和9年）
  { date: '2027-01-01', name: '元日' },
  { date: '2027-01-11', name: '成人の日' },
  { date: '2027-02-11', name: '建国記念の日' },
  { date: '2027-02-23', name: '天皇誕生日' },
  { date: '2027-03-21', name: '春分の日' },
  { date: '2027-03-22', name: '振替休日' },
  { date: '2027-04-29', name: '昭和の日' },
  { date: '2027-05-03', name: '憲法記念日' },
  { date: '2027-05-04', name: 'みどりの日' },
  { date: '2027-05-05', name: 'こどもの日' },
  { date: '2027-07-19', name: '海の日' },
  { date: '2027-08-11', name: '山の日' },
  { date: '2027-09-20', name: '敬老の日' },
  { date: '2027-09-23', name: '秋分の日' },
  { date: '2027-10-11', name: 'スポーツの日' },
  { date: '2027-11-03', name: '文化の日' },
  { date: '2027-11-23', name: '勤労感謝の日' },
];

/** 【データ更新箇所】祝日データが揃っている最初の年（この年の1月1日から） */
export const HOLIDAY_FIRST_YEAR = 2024;

/** 【データ更新箇所】祝日データが揃っている最後の年（この年の12月31日まで） */
export const HOLIDAY_LAST_YEAR = 2027;

/** 【データ更新箇所】祝日データを内閣府の一覧と突き合わせた日 */
export const HOLIDAY_UPDATED_AT = '2026-08-15';

/** 日付（'YYYY-MM-DD'）→ 祝日名。祝日でなければ undefined */
const HOLIDAY_BY_DATE: Map<string, string> = new Map(HOLIDAYS.map((h) => [h.date, h.name]));

/** その日の祝日名。祝日でなければ null */
export function holidayName(parts: DateParts): string | null {
  return HOLIDAY_BY_DATE.get(formatDate(parts)) ?? null;
}

/** 祝日か（振替休日・国民の休日を含む） */
export function isHoliday(parts: DateParts): boolean {
  return HOLIDAY_BY_DATE.has(formatDate(parts));
}

/** 祝日データが揃っている範囲内の日付か */
export function inHolidayRange(parts: DateParts): boolean {
  return parts.year >= HOLIDAY_FIRST_YEAR && parts.year <= HOLIDAY_LAST_YEAR;
}

/** 営業日（土日でも祝日でもない日）か。範囲外の日は判定できないので呼ぶ前に確かめること */
export function isBusinessDay(parts: DateParts): boolean {
  return !isWeekend(parts) && !isHoliday(parts);
}

/** その年の祝日（ページの一覧表示用） */
export function holidaysIn(year: number): Holiday[] {
  const prefix = `${year}-`;
  return HOLIDAYS.filter((h) => h.date.startsWith(prefix));
}

/** 休みの理由。営業日でない日を説明するために使う */
export type NonBusinessReason = '土曜' | '日曜' | string;

/** 営業日計算で飛ばした日 */
export interface SkippedDay {
  date: DateParts;
  /** '土曜' '日曜' '海の日' など */
  reason: NonBusinessReason;
}

/** 営業日でない理由。営業日なら null */
export function nonBusinessReason(parts: DateParts): NonBusinessReason | null {
  const holiday = holidayName(parts);
  if (holiday) return holiday;
  const label = weekdayLabel(parts);
  if (label === '土') return '土曜';
  if (label === '日') return '日曜';
  return null;
}

// ---------------------------------------------------------------- 日数計算

/** 「◯週と△日」のような内訳 */
export interface WeeksAndDays {
  weeks: number;
  days: number;
}

/** 「◯か月と△日」のような内訳 */
export interface MonthsAndDays {
  months: number;
  days: number;
}

/** 「◯年△か月□日」の内訳 */
export interface YearsMonthsDays {
  years: number;
  months: number;
  days: number;
}

/** 日数 → 週数と端数 */
export function weeksAndDays(days: number): WeeksAndDays {
  return { weeks: Math.floor(days / 7), days: days % 7 };
}

/**
 * from から to までの月数と端数の日数。
 *
 * 月をまたぐ数え方は「応当日まで来たら1か月」。応当日が無い月は末日に寄せるので、
 * 1月31日から2月28日（平年）はちょうど1か月、3月1日は1か月と1日になる。
 *
 * @param from to 以前の日付
 */
export function monthsAndDays(from: DateParts, to: DateParts): MonthsAndDays {
  let months = (to.year - from.year) * 12 + (to.month - from.month);
  if (compareDate(addMonths(from, months), to) > 0) months -= 1;
  return { months, days: daysBetween(addMonths(from, months), to) };
}

/** from から to までを年・月・日に分ける */
export function yearsMonthsDays(from: DateParts, to: DateParts): YearsMonthsDays {
  const { months, days } = monthsAndDays(from, to);
  return { years: Math.floor(months / 12), months: months % 12, days };
}

/** 期間内の営業日数。祝日データの範囲外なら null */
export interface BusinessDaysInRange {
  /** 開始日・終了日の両方を含めて数えた営業日数 */
  count: number;
  /** 土日の日数 */
  weekends: number;
  /** 祝日（振替休日・国民の休日を含む。土日と重なる日は数えない）の日数 */
  holidays: number;
}

/**
 * from から to までに含まれる営業日数（**両端を含む**）。
 *
 * 「この期間に何営業日あるか」を数えるためのもので、期日計算の
 * 「◯営業日後」（初日を数えない）とは数え方が違う。
 *
 * @returns 祝日データの範囲外の日を含むときは null
 */
export function businessDaysBetween(from: DateParts, to: DateParts): BusinessDaysInRange | null {
  if (compareDate(from, to) > 0) return null;
  if (!inHolidayRange(from) || !inHolidayRange(to)) return null;

  let count = 0;
  let weekends = 0;
  let holidays = 0;
  for (let cur = from; compareDate(cur, to) <= 0; cur = addDays(cur, 1)) {
    if (isWeekend(cur)) weekends += 1;
    else if (isHoliday(cur)) holidays += 1;
    else count += 1;
  }
  return { count, weekends, holidays };
}

/** 日数計算の結果 */
export interface DurationResult {
  from: DateParts;
  to: DateParts;
  /** 初日を含まない日数（民法140条の初日不算入。単純な日付の差） */
  days: number;
  /** 初日を含む日数（days + 1） */
  daysInclusive: number;
  /** 初日不算入の日数を週で表したもの */
  weeks: WeeksAndDays;
  /** 月数と端数の日数 */
  months: MonthsAndDays;
  /** 年・月・日の内訳 */
  ymd: YearsMonthsDays;
  /** 開始日の曜日（'金' など） */
  fromWeekday: string;
  /** 終了日の曜日 */
  toWeekday: string;
  /** 開始日が祝日ならその名前 */
  fromHoliday: string | null;
  /** 終了日が祝日ならその名前 */
  toHoliday: string | null;
  /** 両端を含む営業日数。祝日データの範囲外なら null */
  business: BusinessDaysInRange | null;
}

/**
 * 2つの日付のあいだの日数をまとめて出す。
 *
 * @returns to が from より前のときは null（呼び出し側で入力エラーとして扱う）
 */
export function calcDuration(from: DateParts, to: DateParts): DurationResult | null {
  if (compareDate(from, to) > 0) return null;
  const days = daysBetween(from, to);
  return {
    from,
    to,
    days,
    daysInclusive: days + 1,
    weeks: weeksAndDays(days),
    months: monthsAndDays(from, to),
    ymd: yearsMonthsDays(from, to),
    fromWeekday: weekdayLabel(from),
    toWeekday: weekdayLabel(to),
    fromHoliday: holidayName(from),
    toHoliday: holidayName(to),
    business: businessDaysBetween(from, to),
  };
}

// ---------------------------------------------------------------- 期日計算

/** 期日を前に取るか後に取るか */
export type Direction = 'after' | 'before';

/** 数え方。暦日（土日祝も数える）か営業日か */
export type CountUnit = 'calendar' | 'business';

/** 期日計算の入力 */
export interface DeadlineInput {
  start: DateParts;
  /** 数える日数（0以上の整数） */
  amount: number;
  direction: Direction;
  unit: CountUnit;
}

/**
 * 一度に数えられる日数の上限。
 *
 * 営業日計算は1日ずつ進めるので、際限なく大きい値を受けると固まる。
 * 暦日側も、祝日データの範囲（4年）を大きく超える指定に意味がないので同じ上限にした。
 */
export const MAX_AMOUNT = 3650;

/** 期日計算の結果 */
export type DeadlineResult =
  | {
      ok: true;
      date: DateParts;
      weekday: string;
      /** 求まった期日が祝日ならその名前（暦日で数えたときに起こる） */
      holiday: string | null;
      /** 求まった期日が営業日か。祝日データの範囲外なら null */
      isBusinessDay: boolean | null;
      /** 営業日で数えたときに飛ばした土日・祝日 */
      skipped: SkippedDay[];
    }
  | { ok: false; message: string };

/**
 * ◯日後・◯日前（暦日）／◯営業日後・◯営業日前を求める。
 *
 * **どちらも起算日（開始日）は数えない。** 「3日後」は開始日の翌日から3日目、
 * 「3営業日後」は開始日の次の営業日を1営業日目として3つ目、という数え方
 * （民法140条の初日不算入と、実務の営業日の数え方に合わせている）。
 *
 * 営業日で数えるときは、通った日がすべて祝日データの範囲に収まっている必要がある。
 * 範囲を出たら概算にせず、理由を返して計算を断る。
 */
export function calcDeadline({ start, amount, direction, unit }: DeadlineInput): DeadlineResult {
  if (!Number.isInteger(amount) || amount < 0) {
    return { ok: false, message: '日数は0以上の整数で入力してください。' };
  }
  if (amount > MAX_AMOUNT) {
    return { ok: false, message: `日数は${MAX_AMOUNT.toLocaleString('ja-JP')}日までで入力してください。` };
  }

  const step = direction === 'after' ? 1 : -1;

  if (unit === 'calendar') {
    const date = addDays(start, amount * step);
    return {
      ok: true,
      date,
      weekday: weekdayLabel(date),
      holiday: inHolidayRange(date) ? holidayName(date) : null,
      isBusinessDay: inHolidayRange(date) ? isBusinessDay(date) : null,
      skipped: [],
    };
  }

  if (!inHolidayRange(start)) return outOfRange();

  const skipped: SkippedDay[] = [];
  let date = start;
  let left = amount;
  while (left > 0) {
    date = addDays(date, step);
    if (!inHolidayRange(date)) return outOfRange();
    const reason = nonBusinessReason(date);
    if (reason === null) left -= 1;
    else skipped.push({ date, reason });
  }

  return {
    ok: true,
    date,
    weekday: weekdayLabel(date),
    holiday: holidayName(date),
    isBusinessDay: true,
    skipped,
  };
}

/** 祝日データの範囲を外れたときの断り文句。UIでそのまま出せる文にしてある */
function outOfRange(): { ok: false; message: string } {
  return {
    ok: false,
    message: `営業日で数えられるのは${HOLIDAY_FIRST_YEAR}年1月1日〜${HOLIDAY_LAST_YEAR}年12月31日です（祝日データの範囲外は、祝日が公示されていないため概算しません）。`,
  };
}
