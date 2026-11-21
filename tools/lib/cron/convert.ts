/**
 * タイムゾーンの書き換えと、環境ごとの書き方（仕様: docs/features/cron-shiki-checker.md の「出力」5）
 *
 * 日本時間（+9:00）と UTC の差は9時間ちょうどなので、分・秒は変わらず、時だけがずれる。
 * 日付をまたぐ時刻（日本時間の 0:00〜8:59）は、日・曜日を1日ずらす。
 * 1つの式で表せないとき（前月の末日・範囲をまたぐ）は、2行に分けるか、書けない理由を返す。
 */
import { daysInMonth } from '@/lib/date-parts';
import { DOW_NAMES, dowToNative } from './parse';
import { stepOf } from './describe';
import type { CronSpec } from './types';

/** 書き換えの結果。specs が2つなら2行に分ける */
export type ShiftResult = { ok: true; specs: CronSpec[] } | { ok: false; reason: string };

function clone(spec: CronSpec): CronSpec {
  return {
    ...spec,
    seconds: [...spec.seconds],
    minutes: [...spec.minutes],
    hours: [...spec.hours],
    months: [...spec.months],
    years: spec.years ? [...spec.years] : null,
    dom: { ...spec.dom, values: [...spec.dom.values], last: [...spec.dom.last], nearest: [...spec.dom.nearest] },
    dow: { ...spec.dow, values: [...spec.dow.values], last: [...spec.dow.last], nth: spec.dow.nth.map((x) => ({ ...x })) },
  };
}

const sortNum = (a: number, b: number) => a - b;
const allMonths = (s: CronSpec) => s.months.length === 12;

/** 日付の条件を1日ずらす（delta = -1 で前日、+1 で翌日） */
function shiftDays(spec: CronSpec, delta: -1 | 1): ShiftResult {
  const out = clone(spec);
  const dateFree = spec.dom.any && spec.dow.any && allMonths(spec) && !spec.years;
  if (dateFree) return { ok: true, specs: [out] };
  if (spec.years) return { ok: false, reason: '年を指定した式は、日付をまたぐ書き換えに対応していません' };

  let monthShift = 0;
  if (!spec.dow.any) {
    if (spec.dow.last.length > 0 || spec.dow.nth.length > 0) {
      return { ok: false, reason: '「第◯◯曜」「最終◯曜」は1日ずらすと別の週に当たることがあり、1つの式では書けません' };
    }
    out.dow.values = spec.dow.values.map((d) => (d + delta + 7) % 7).sort(sortNum);
  }
  if (!spec.dom.any) {
    const d = spec.dom;
    if (d.nearest.length > 0 || d.lastWeekday) {
      return { ok: false, reason: '「◯日に近い平日」「最終平日」は1日ずらすと別の日になることがあり、1つの式では書けません' };
    }
    const plainOnly = d.last.length === 0;
    if (delta === -1) {
      if (plainOnly && d.values.every((v) => v >= 2 && v <= 28)) {
        out.dom.values = d.values.map((v) => v - 1);
      } else if (plainOnly && d.values.length === 1 && d.values[0] === 1) {
        out.dom.values = [];
        out.dom.last = [0];
        monthShift = -1;
      } else if (d.values.length === 0 && d.last.length === 1) {
        out.dom.last = [d.last[0] + 1];
      } else {
        return { ok: false, reason: '1日と2〜28日以外の日が混ざっていて、1日前にずらすと月によって日付が変わります' };
      }
    } else {
      if (plainOnly && d.values.every((v) => v >= 1 && v <= 27)) {
        out.dom.values = d.values.map((v) => v + 1);
      } else if (d.values.length === 0 && d.last.length === 1 && d.last[0] === 0) {
        out.dom.last = [];
        out.dom.values = [1];
        monthShift = 1;
      } else {
        return { ok: false, reason: '28日以降の日が混ざっていて、1日後にずらすと月によって日付が変わります' };
      }
    }
  }
  if (!allMonths(spec)) {
    if (monthShift === 0 && spec.dom.any) {
      return { ok: false, reason: '月を指定した式で曜日・毎日の条件を1日ずらすと、月の変わり目で月が変わるため1つの式では書けません' };
    }
    if (monthShift === 0 && spec.mode === 'or') {
      return { ok: false, reason: '月を指定した式で、日と曜日の両方を1日ずらすと1つの式では書けません' };
    }
    if (monthShift !== 0) {
      if (spec.mode === 'or') return { ok: false, reason: '月を指定した式で、日と曜日の両方を1日ずらすと1つの式では書けません' };
      out.months = spec.months.map((m) => ((m - 1 + monthShift + 12) % 12) + 1).sort(sortNum);
    }
  }
  return { ok: true, specs: [out] };
}

/**
 * 式の時刻を hours 時間ずらす（日本時間 → UTC は -9、UTC → 日本時間は +9）。
 * 日付をまたぐ時刻とまたがない時刻が混ざっていて、日付の条件があるときは2行に分ける。
 */
export function shiftZone(spec: CronSpec, hours: -9 | 9): ShiftResult {
  const shifted = (h: number) => (h + hours + 24) % 24;
  const crosses = (h: number) => h + hours < 0 || h + hours >= 24;
  const stay = spec.hours.filter((h) => !crosses(h));
  const cross = spec.hours.filter(crosses);

  const dateFree = spec.dom.any && spec.dow.any && allMonths(spec) && !spec.years;
  if (dateFree || cross.length === 0) {
    const out = clone(spec);
    out.hours = spec.hours.map(shifted).sort(sortNum);
    return { ok: true, specs: [out] };
  }
  const moved = shiftDays(spec, hours < 0 ? -1 : 1);
  if (!moved.ok) return moved;
  const crossSpec = moved.specs[0];
  crossSpec.hours = cross.map(shifted).sort(sortNum);
  if (stay.length === 0) return { ok: true, specs: [crossSpec] };
  const staySpec = clone(spec);
  staySpec.hours = stay.map(shifted).sort(sortNum);
  return { ok: true, specs: [staySpec, crossSpec] };
}

/** 値の集合を cron の書き方にする（全部なら `*`、等差なら `*\/n`、連続は `a-b`） */
export function formatValues(values: number[], min: number, max: number, name?: (v: number) => string): string {
  const show = name ?? String;
  if (values.length === max - min + 1) return '*';
  const step = stepOf(values, max);
  if (step && !name) {
    if (values[0] === min) return `*/${step}`;
    if (values[0] < min + step) return `${values[0]}-${max}/${step}`;
  }
  const parts: string[] = [];
  let i = 0;
  while (i < values.length) {
    let j = i;
    while (j + 1 < values.length && values[j + 1] === values[j] + 1) j++;
    if (j - i >= 2) parts.push(`${show(values[i])}-${show(values[j])}`);
    else for (let k = i; k <= j; k++) parts.push(show(values[k]));
    i = j + 1;
  }
  return parts.join(',');
}

export type FormatResult = { ok: true; lines: string[] } | { ok: false; reason: string };

/** crontab・GitHub Actions・Kubernetes の5フィールドの式にする */
export function toCron5(spec: CronSpec): FormatResult {
  if (!(spec.seconds.length === 1 && spec.seconds[0] === 0)) return { ok: false, reason: '5 フィールドの cron には秒を書けません' };
  if (spec.years) return { ok: false, reason: '5 フィールドの cron には年を書けません' };
  const d = spec.dom;
  if (d.last.length > 0) {
    return { ok: false, reason: '前月の末日（L）に当たり、crontab・GitHub Actions では1行で書けません（L が使えないため）' };
  }
  if (d.nearest.length > 0 || d.lastWeekday) return { ok: false, reason: '「W」（近い平日）は crontab では書けません' };
  if (spec.dow.last.length > 0 || spec.dow.nth.length > 0) return { ok: false, reason: '「第◯◯曜」「最終◯曜」は crontab では書けません' };
  const dom = d.any ? '*' : formatValues(d.values, 1, 31);
  const dow = spec.dow.any ? '*' : formatValues(spec.dow.values, 0, 6);
  const domStar = dom.startsWith('*');
  const dowStar = dow.startsWith('*');
  if (spec.mode === 'or' && (domStar || dowStar)) return { ok: false, reason: '日と曜日の OR を crontab の書き方で表せません' };
  if (spec.mode === 'and' && !domStar && !dowStar) {
    // 両方を指定すると crontab では OR になってしまう
    return { ok: false, reason: '日と曜日の両方に当てはまる日（AND）は crontab では書けません（両方を書くと OR になります）' };
  }
  const line = [
    formatValues(spec.minutes, 0, 59),
    formatValues(spec.hours, 0, 23),
    dom,
    formatValues(spec.months, 1, 12),
    dow,
  ].join(' ');
  return { ok: true, lines: [line] };
}

const awsDowName = (d: number) => DOW_NAMES[d];

/** AWS の `cron(分 時 日 月 曜日 年)` にする。日と曜日の OR は2つに分ける */
export function toAws(spec: CronSpec): FormatResult {
  if (!(spec.seconds.length === 1 && spec.seconds[0] === 0)) return { ok: false, reason: 'AWS の cron には秒を書けません' };
  if (spec.mode === 'or') {
    const domOnly = clone(spec);
    domOnly.mode = 'and';
    domOnly.dow = { any: true, star: true, values: [], last: [], nth: [] };
    const dowOnly = clone(spec);
    dowOnly.mode = 'and';
    dowOnly.dom = { any: true, star: true, values: [], last: [], nearest: [], lastWeekday: false };
    const a = toAws(domOnly);
    const b = toAws(dowOnly);
    if (!a.ok) return a;
    if (!b.ok) return b;
    return { ok: true, lines: [...a.lines, ...b.lines] };
  }
  if (!spec.dom.any && !spec.dow.any) {
    return { ok: false, reason: 'AWS では日と曜日を同時に指定できません（どちらかを ? にします）' };
  }
  const d = spec.dom;
  if (d.last.some((x) => x > 0)) return { ok: false, reason: 'AWS では「末日の◯日前」（L-n）を書けません' };
  let dom: string;
  if (d.any) dom = spec.dow.any ? '*' : '?';
  else if (d.last.length > 0) dom = 'L';
  else if (d.lastWeekday) dom = 'LW';
  else if (d.nearest.length > 0) dom = `${d.nearest[0]}W`;
  else dom = formatValues(d.values, 1, 31);
  let dow: string;
  const w = spec.dow;
  if (w.any) dow = '?';
  else if (w.nth.length > 0) dow = `${dowToNative(w.nth[0].dow, 'aws')}#${w.nth[0].n}`;
  else if (w.last.length > 0) dow = `${dowToNative(w.last[0], 'aws')}L`;
  else dow = formatValues(w.values, 0, 6, awsDowName);
  const year = spec.years ? formatValues(spec.years, 1970, 2199) : '*';
  const line = `cron(${[formatValues(spec.minutes, 0, 59), formatValues(spec.hours, 0, 23), dom, formatValues(spec.months, 1, 12), dow, year].join(' ')})`;
  return { ok: true, lines: [line] };
}

/** 環境ごとの書き方の1ブロック */
export interface EnvBlock {
  id: 'github-tz' | 'github-utc' | 'aws-scheduler' | 'aws-rule' | 'kubernetes';
  title: string;
  /** どんなときに使うか */
  note: string;
  /** そのまま貼れる形（YAML など）。書けないときは null */
  code: string | null;
  /** 式だけ（コピーのボタン用） */
  expressions: string[];
  /** 書けない理由 */
  reason?: string;
}

function mapLines(results: FormatResult[]): FormatResult {
  const lines: string[] = [];
  for (const r of results) {
    if (!r.ok) return r;
    lines.push(...r.lines);
  }
  return { ok: true, lines };
}

function formatAll(shift: ShiftResult, fmt: (s: CronSpec) => FormatResult): FormatResult {
  if (!shift.ok) return { ok: false, reason: shift.reason };
  return mapLines(shift.specs.map(fmt));
}

/**
 * 環境ごとの書き方。
 * @param spec 解析した式
 * @param zone 式を書いたタイムゾーン（日本時間のつもりで書いたか、UTC で書いたか）
 * @param originalCron5 crontab 系の式をそのまま貼った場合の元の文字列（GitHub の timezone つきでは式を変えない）
 */
export function environments(spec: CronSpec, zone: 'Asia/Tokyo' | 'UTC', originalCron5?: string): EnvBlock[] {
  const jst: ShiftResult = zone === 'Asia/Tokyo' ? { ok: true, specs: [spec] } : shiftZone(spec, 9);
  const utc: ShiftResult = zone === 'UTC' ? { ok: true, specs: [spec] } : shiftZone(spec, -9);

  const jstCron5: FormatResult =
    zone === 'Asia/Tokyo' && originalCron5 ? { ok: true, lines: [originalCron5] } : formatAll(jst, toCron5);
  const utcCron5: FormatResult = zone === 'UTC' && originalCron5 ? { ok: true, lines: [originalCron5] } : formatAll(utc, toCron5);
  const jstAws = formatAll(jst, toAws);
  const utcAws = formatAll(utc, toAws);

  const yamlSchedule = (lines: string[], tz: boolean) =>
    ['on:', '  schedule:', ...lines.flatMap((l) => [`    - cron: "${l}"`, ...(tz ? ['      timezone: "Asia/Tokyo"'] : [])])].join('\n');

  const block = (
    id: EnvBlock['id'],
    title: string,
    note: string,
    r: FormatResult,
    code: (lines: string[]) => string,
  ): EnvBlock =>
    r.ok
      ? { id, title, note, code: code(r.lines), expressions: r.lines }
      : { id, title, note, code: null, expressions: [], reason: r.reason };

  return [
    block(
      'github-tz',
      'GitHub Actions（timezone を書く）',
      '式は日本時間のまま、timezone: "Asia/Tokyo" を cron: の隣に足します（2026年3月から）。',
      jstCron5,
      (lines) => yamlSchedule(lines, true),
    ),
    block(
      'github-utc',
      'GitHub Actions（UTC に直す）',
      'timezone を使えないとき：既存のワークフローを変えずに直したい・timezone に未対応の GitHub Enterprise Server。',
      utcCron5,
      (lines) => yamlSchedule(lines, false),
    ),
    block(
      'aws-scheduler',
      'AWS EventBridge Scheduler',
      'ScheduleExpressionTimezone で日本時間を指定します（指定しないと UTC）。',
      jstAws,
      (lines) => lines.map((l) => `ScheduleExpression: "${l}"\nScheduleExpressionTimezone: "Asia/Tokyo"`).join('\n---\n'),
    ),
    block(
      'aws-rule',
      'AWS EventBridge ルール',
      'ルールは UTC 固定なので、UTC に直した式を書きます。2行のときはルールを2つ作ります。',
      utcAws,
      (lines) => lines.map((l) => `ScheduleExpression: "${l}"`).join('\n'),
    ),
    block(
      'kubernetes',
      'Kubernetes CronJob',
      'spec.timeZone を指定します（指定しないとコントローラーのタイムゾーン）。',
      jstCron5,
      (lines) => lines.map((l) => ['spec:', `  schedule: "${l}"`, '  timeZone: "Asia/Tokyo"'].join('\n')).join('\n---\n'),
    ),
  ];
}

/** その月に一度も当てはまらない日（31日・2/30 など）がある月 */
export function monthsWithoutDay(spec: CronSpec): number[] {
  if (spec.dom.any || spec.dom.values.length === 0 || spec.dom.last.length > 0 || spec.dom.nearest.length > 0 || spec.dom.lastWeekday) {
    return [];
  }
  if (spec.mode === 'or') return [];
  const minDay = spec.dom.values[0];
  // うるう年の2月（29日）も数える
  return spec.months.filter((m) => minDay > (m === 2 ? 29 : daysInMonth(2025, m)));
}
