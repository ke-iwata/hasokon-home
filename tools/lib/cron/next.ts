/**
 * 次の実行日時の探索（仕様: docs/features/cron-shiki-checker.md の「計算」）
 *
 * - 1分ずつ回さず、年→月→日→時→分（→秒）の順で次の候補へ飛ばす
 * - 探すのは開始から 5 年先まで。飛んだ回数（ステップ数）を数えて返す
 * - タイムゾーンは UTC と Asia/Tokyo（+9:00 固定）だけ。式の「壁時計」を UTC の Date で表して計算する
 */
import { daysInMonth } from '@/lib/date-parts';
import { HOLIDAY_FIRST_YEAR, HOLIDAY_LAST_YEAR, holidayName } from '@/lib/nissu-keisan';
import type { CronSpec, Zone } from './types';

export const JST_OFFSET_MS = 9 * 3600_000;
/** 探す上限（年） */
export const HORIZON_YEARS = 5;
/** 念のための打ち切り（正しい式ならここまで来ない） */
const MAX_STEPS = 100_000;

export function zoneOffsetMs(zone: Zone): number {
  return zone === 'Asia/Tokyo' ? JST_OFFSET_MS : 0;
}

/** 0=日曜〜6=土曜 */
export function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** 「15W」：その日に近い平日（月をまたがない。Quartz の決まり） */
export function nearestWeekday(year: number, month: number, n: number): number {
  const dim = daysInMonth(year, month);
  const target = Math.min(n, dim);
  const wd = weekdayOf(year, month, target);
  if (wd === 6) return target === 1 ? 3 : target - 1;
  if (wd === 0) return target === dim ? target - 2 : target + 1;
  return target;
}

/** 「LW」：その月の最終平日 */
export function lastWeekdayOfMonth(year: number, month: number): number {
  let d = daysInMonth(year, month);
  while (weekdayOf(year, month, d) === 0 || weekdayOf(year, month, d) === 6) d--;
  return d;
}

function domMatches(spec: CronSpec, y: number, m: number, d: number): boolean {
  const dom = spec.dom;
  if (dom.any) return true;
  if (dom.values.includes(d)) return true;
  const dim = daysInMonth(y, m);
  if (dom.last.some((off) => d === dim - off)) return true;
  if (dom.nearest.some((n) => d === nearestWeekday(y, m, n))) return true;
  if (dom.lastWeekday && d === lastWeekdayOfMonth(y, m)) return true;
  return false;
}

function dowMatches(spec: CronSpec, y: number, m: number, d: number): boolean {
  const dow = spec.dow;
  if (dow.any) return true;
  const wd = weekdayOf(y, m, d);
  if (dow.values.includes(wd)) return true;
  if (dow.last.includes(wd) && d + 7 > daysInMonth(y, m)) return true;
  if (dow.nth.some((x) => x.dow === wd && Math.ceil(d / 7) === x.n)) return true;
  return false;
}

/** その日が日・曜日の条件に当てはまるか（月・年は見ない） */
export function dayMatches(spec: CronSpec, y: number, m: number, d: number): boolean {
  if (spec.mode === 'or') return domMatches(spec, y, m, d) || dowMatches(spec, y, m, d);
  return domMatches(spec, y, m, d) && dowMatches(spec, y, m, d);
}

function nextIn(values: number[], from: number): number | undefined {
  return values.find((v) => v >= from);
}

export interface NextResult {
  /** 実行日時（UTC のミリ秒） */
  runs: number[];
  /** 候補へ飛んだ回数 */
  steps: number;
  /** 上限（5 年）までに count 件そろわなかった */
  exhausted: boolean;
}

/**
 * fromMs より**後**の実行日時を count 件探す。
 * @param zone 式のタイムゾーン（式の時刻をどの時計で読むか）
 */
export function nextRuns(spec: CronSpec, fromMs: number, zone: Zone, count = 10): NextResult {
  const offset = zoneOffsetMs(zone);
  const hasSeconds = !(spec.seconds.length === 1 && spec.seconds[0] === 0);
  const unit = hasSeconds ? 1000 : 60_000;
  // 壁時計で、fromMs の次の単位（秒か分）から探す
  let t = Math.floor((fromMs + offset) / unit) * unit + unit;
  const start = new Date(t);
  const limit = Date.UTC(
    start.getUTCFullYear() + HORIZON_YEARS,
    start.getUTCMonth(),
    start.getUTCDate(),
    start.getUTCHours(),
    start.getUTCMinutes(),
    start.getUTCSeconds(),
  );
  const runs: number[] = [];
  let steps = 0;
  while (runs.length < count) {
    if (t > limit || steps >= MAX_STEPS) return { runs, steps, exhausted: true };
    steps++;
    const dt = new Date(t);
    const y = dt.getUTCFullYear();
    const mo = dt.getUTCMonth() + 1;
    const d = dt.getUTCDate();
    const h = dt.getUTCHours();
    const mi = dt.getUTCMinutes();
    const s = dt.getUTCSeconds();

    if (spec.years && !spec.years.includes(y)) {
      const ny = spec.years.find((v) => v > y);
      if (ny === undefined) return { runs, steps, exhausted: true };
      t = Date.UTC(ny, 0, 1);
      continue;
    }
    if (!spec.months.includes(mo)) {
      const nm = spec.months.find((v) => v > mo);
      t = nm === undefined ? Date.UTC(y + 1, spec.months[0] - 1, 1) : Date.UTC(y, nm - 1, 1);
      continue;
    }
    if (!dayMatches(spec, y, mo, d)) {
      const dim = daysInMonth(y, mo);
      let nd = d + 1;
      while (nd <= dim && !dayMatches(spec, y, mo, nd)) nd++;
      t = nd <= dim ? Date.UTC(y, mo - 1, nd) : Date.UTC(y, mo, 1);
      continue;
    }
    const nh = nextIn(spec.hours, h);
    if (nh === undefined) {
      t = Date.UTC(y, mo - 1, d + 1);
      continue;
    }
    if (nh !== h) {
      t = Date.UTC(y, mo - 1, d, nh);
      continue;
    }
    const nmi = nextIn(spec.minutes, mi);
    if (nmi === undefined) {
      t = Date.UTC(y, mo - 1, d, h + 1);
      continue;
    }
    if (nmi !== mi) {
      t = Date.UTC(y, mo - 1, d, h, nmi);
      continue;
    }
    const ns = nextIn(spec.seconds, s);
    if (ns === undefined) {
      t = Date.UTC(y, mo - 1, d, h, mi + 1);
      continue;
    }
    if (ns !== s) {
      t = Date.UTC(y, mo - 1, d, h, mi, ns);
      continue;
    }
    runs.push(t - offset);
    t += unit;
  }
  return { runs, steps, exhausted: false };
}

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

export interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

export function wallTime(ms: number, zone: Zone): WallTime {
  const dt = new Date(ms + zoneOffsetMs(zone));
  return {
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth() + 1,
    day: dt.getUTCDate(),
    hour: dt.getUTCHours(),
    minute: dt.getUTCMinutes(),
    second: dt.getUTCSeconds(),
    weekday: dt.getUTCDay(),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 「2026-12-28（月）9:30」。秒が 0 でなければ秒も */
export function formatWall(w: WallTime, withSeconds = false): string {
  const time = `${w.hour}:${pad(w.minute)}${withSeconds ? `:${pad(w.second)}` : ''}`;
  return `${w.year}-${pad(w.month)}-${pad(w.day)}（${WEEKDAYS_JA[w.weekday]}）${time}`;
}

/** 日本時間の壁時計の ms（`Date.UTC` の形）→ UTC ms */
export function jstToMs(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): number {
  return Date.UTC(year, month - 1, day, hour, minute, second) - JST_OFFSET_MS;
}

/** 祝日の印 */
export type HolidayMark =
  | { kind: 'none' }
  | { kind: 'holiday'; name: string }
  /** 祝日の表（nissu-keisan）の範囲外 */
  | { kind: 'out-of-range' };

export interface RunRow {
  ms: number;
  jst: string;
  utc: string;
  holiday: HolidayMark;
  /** 年末年始（12/29〜1/3） */
  yearEnd: boolean;
}

/** 日本時間の日付で祝日・年末年始の印を付ける */
export function runRow(ms: number, withSeconds = false): RunRow {
  const j = wallTime(ms, 'Asia/Tokyo');
  let holiday: HolidayMark = { kind: 'none' };
  if (j.year < HOLIDAY_FIRST_YEAR || j.year > HOLIDAY_LAST_YEAR) {
    holiday = { kind: 'out-of-range' };
  } else {
    const name = holidayName({ year: j.year, month: j.month, day: j.day });
    if (name) holiday = { kind: 'holiday', name };
  }
  return {
    ms,
    jst: formatWall(j, withSeconds),
    utc: formatWall(wallTime(ms, 'UTC'), withSeconds),
    holiday,
    yearEnd: (j.month === 12 && j.day >= 29) || (j.month === 1 && j.day <= 3),
  };
}

export { HOLIDAY_LAST_YEAR };
