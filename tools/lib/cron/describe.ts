/**
 * cron 式の日本語の読み下しとフィールドの内訳（仕様: docs/features/cron-shiki-checker.md の「出力」1・3）
 *
 * 例：`30 9 * * 1-5` →「月曜〜金曜の 9:30」
 *     `*\/15 9-18 * * *` →「9時台〜18時台の、0・15・30・45分」
 */
import { FIELD_NAMES, FIELD_ORDER, type CronSpec, type FieldKind, type Grammar } from './types';

export const DOW_JA = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜'];

const pad = (n: number) => String(n).padStart(2, '0');

/** 連続する3つ以上を「a〜b」にまとめ、ほかは「・」でつなぐ */
export function compress(values: number[], fmt: (v: number) => string = String): string {
  const parts: string[] = [];
  let i = 0;
  while (i < values.length) {
    let j = i;
    while (j + 1 < values.length && values[j + 1] === values[j] + 1) j++;
    if (j - i >= 2) {
      parts.push(`${fmt(values[i])}〜${fmt(values[j])}`);
    } else {
      for (let k = i; k <= j; k++) parts.push(fmt(values[k]));
    }
    i = j + 1;
  }
  return parts.join('・');
}

/** 等差（a, a+d, a+2d…）で、範囲の終わりまで続いているときの差 d。そうでなければ null */
export function stepOf(values: number[], max: number): number | null {
  if (values.length < 3) return null;
  const d = values[1] - values[0];
  if (d <= 1) return null;
  for (let i = 2; i < values.length; i++) if (values[i] - values[i - 1] !== d) return null;
  return values[values.length - 1] + d > max ? d : null;
}

function isAll(values: number[], min: number, max: number): boolean {
  return values.length === max - min + 1;
}

/** 曜日を月曜はじまりで並べる（「土曜・日曜」と読むため） */
function dowSorted(values: number[]): number[] {
  return [...values].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
}

function dowList(values: number[]): string {
  const mondayFirst = dowSorted(values).map((d) => (d + 6) % 7);
  return compress(mondayFirst, (v) => DOW_JA[(v + 1) % 7]);
}

function minuteText(minutes: number[]): string {
  if (isAll(minutes, 0, 59)) return '毎分';
  const step = stepOf(minutes, 59);
  if (step && minutes[0] === 0 && minutes.length > 6) return `${step}分ごと`;
  return `${compress(minutes)}分`;
}

function secondText(seconds: number[]): string {
  if (isAll(seconds, 0, 59)) return '毎秒';
  const step = stepOf(seconds, 59);
  if (step && seconds[0] === 0) return `${step}秒ごと`;
  return `${compress(seconds)}秒`;
}

function timeText(spec: CronSpec): { text: string; exact: boolean } {
  const { hours, minutes, seconds } = spec;
  const defaultSec = seconds.length === 1 && seconds[0] === 0;
  if (hours.length * minutes.length <= 4 && seconds.length === 1 && hours.length < 24) {
    const times: string[] = [];
    for (const h of hours) {
      for (const m of minutes) times.push(`${h}:${pad(m)}${defaultSec ? '' : `:${pad(seconds[0])}`}`);
    }
    return { text: times.join('・'), exact: true };
  }
  let text: string;
  const allHours = isAll(hours, 0, 23);
  if (allHours) {
    const step = stepOf(minutes, 59);
    if (isAll(minutes, 0, 59)) text = '毎分';
    else if (minutes.length === 1) text = `毎時 ${minutes[0]}分`;
    else if (step && minutes[0] === 0) text = `${step}分ごと`;
    else text = `毎時 ${compress(minutes)}分`;
  } else {
    const hStep = stepOf(hours, 23);
    const hourText =
      hStep && hours[0] === 0 && hours.length > 3 ? `${hStep}時間ごと（${compress(hours, (h) => `${h}時`)}）` : compress(hours, (h) => `${h}時台`);
    if (isAll(minutes, 0, 59)) text = `${hourText}の毎分`;
    else if (minutes.length === 1 && !(hStep && hours[0] === 0 && hours.length > 3)) text = `${compress(hours, (h) => `${h}時`)}の毎時${minutes[0]}分`;
    else text = `${hourText}の、${minuteText(minutes)}`;
  }
  if (!defaultSec) text = text === '毎分' ? secondText(seconds) : `${text}の ${secondText(seconds)}`;
  return { text, exact: false };
}

function domText(spec: CronSpec): string {
  const dom = spec.dom;
  const parts: string[] = [];
  if (dom.values.length > 0) {
    const step = stepOf(dom.values, 31);
    if (step === 2 && dom.values[0] === 1) parts.push('奇数日');
    else if (step === 2 && dom.values[0] === 2) parts.push('偶数日');
    else if (step && dom.values.length > 4) parts.push(`${dom.values[0]}日から${step}日ごと`);
    else parts.push(`${compress(dom.values)}日`);
  }
  for (const off of dom.last) parts.push(off === 0 ? '末日' : `末日の${off}日前`);
  for (const n of dom.nearest) parts.push(`${n}日に近い平日`);
  if (dom.lastWeekday) parts.push('最終平日');
  return parts.join('・');
}

function dowText(spec: CronSpec): string {
  const dow = spec.dow;
  const parts: string[] = [];
  if (dow.values.length > 0) parts.push(dowList(dow.values));
  for (const d of dow.last) parts.push(`最終${DOW_JA[d]}`);
  for (const x of dow.nth) parts.push(`第${x.n}${DOW_JA[x.dow]}`);
  return parts.join('・');
}

/** 曜日だけの条件の読み（「毎週月曜」「月曜〜金曜」「毎月第3金曜」） */
function dowPhrase(spec: CronSpec): string {
  const t = dowText(spec);
  if (spec.dow.nth.length > 0 || spec.dow.last.length > 0) return `毎月${t}`;
  if (spec.dow.values.length === 1) return `毎週${t}`;
  return t;
}

function dateText(spec: CronSpec): string {
  const allMonths = isAll(spec.months, 1, 12);
  const monthPrefix = allMonths ? '' : `${compress(spec.months, (m) => `${m}月`)}の`;
  let body: string;
  if (spec.dom.any && spec.dow.any) {
    body = '毎日';
  } else if (spec.dow.any) {
    const plainDay = spec.dom.values.length === 1 && spec.dom.last.length === 0 && spec.dom.nearest.length === 0 && !spec.dom.lastWeekday;
    if (!allMonths && plainDay && spec.months.length === 1) {
      // 「1月の1日」ではなく「毎年1月1日」
      const years = spec.years ? `${compress(spec.years, (y) => `${y}年`)}` : '毎年';
      return `${years}${spec.months[0]}月${spec.dom.values[0]}日`;
    }
    body = allMonths ? `毎月${domText(spec)}` : domText(spec);
  } else if (spec.dom.any) {
    body = dowPhrase(spec);
  } else if (spec.mode === 'or') {
    body = `${allMonths ? '毎月' : ''}${domText(spec)}と、${dowPhrase(spec)}（どちらかに当てはまる日）`;
  } else {
    body = `${allMonths ? '毎月' : ''}${domText(spec)}のうち、${dowText(spec)}の日`;
  }
  const years = spec.years ? `${compress(spec.years, (y) => `${y}年`)}の` : '';
  return `${years}${monthPrefix}${body}`;
}

/** 日本語の読み下し */
export function describe(spec: CronSpec): string {
  const date = dateText(spec);
  const time = timeText(spec);
  if (date === '毎日') return time.exact ? `毎日 ${time.text}` : time.text;
  return `${date}の ${time.text}`;
}

export interface FieldRow {
  /** 「① 分」 */
  label: string;
  kind: FieldKind;
  /** 入力したそのままの文字 */
  text: string;
  /** 受け付けた値 */
  values: string;
}

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦'];

export function circled(i: number): string {
  return CIRCLED[i] ?? `(${i + 1})`;
}

function listOrAll(values: number[], min: number, max: number, fmt: (v: number) => string = String): string {
  if (isAll(values, min, max)) return `すべて（${fmt(min)}〜${fmt(max)}）`;
  return values.map(fmt).join(', ');
}

/** フィールドの内訳表 */
export function fieldRows(spec: CronSpec, fields: string[], grammar: Grammar): FieldRow[] {
  const order = FIELD_ORDER[grammar];
  return fields.map((text, i) => {
    const kind = order[i];
    let values: string;
    switch (kind) {
      case 'second':
        values = listOrAll(spec.seconds, 0, 59);
        break;
      case 'minute':
        values = listOrAll(spec.minutes, 0, 59);
        break;
      case 'hour':
        values = listOrAll(spec.hours, 0, 23);
        break;
      case 'month':
        values = listOrAll(spec.months, 1, 12, (m) => `${m}月`);
        break;
      case 'year':
        values = spec.years ? spec.years.join(', ') : 'すべて（毎年）';
        break;
      case 'dom':
        values = spec.dom.any ? (text === '?' ? '指定なし（?）' : 'すべて（1〜31）') : domText(spec);
        if (!spec.dom.any && spec.dom.values.length > 0 && spec.dom.values.length <= 31) {
          values = spec.dom.values.length === 31 ? 'すべて（1〜31）' : spec.dom.values.join(', ');
          const extra = domText({ ...spec, dom: { ...spec.dom, values: [] } });
          if (extra) values += `・${extra}`;
        }
        break;
      case 'dow':
        values = spec.dow.any ? (text === '?' ? '指定なし（?）' : 'すべて（日〜土）') : dowText(spec);
        break;
    }
    return { label: `${circled(i)} ${FIELD_NAMES[kind]}`, kind, text, values };
  });
}
