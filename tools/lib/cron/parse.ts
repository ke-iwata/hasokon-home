/**
 * cron 式の解析（仕様: docs/features/cron-shiki-checker.md の「計算」）
 *
 * 方言ごとの文法でフィールドを読み、値の集合（CronSpec）に展開する。
 * 誤りは「何番目（どのフィールド）の何が悪いか」を位置つきで返す。
 *
 * 曜日の数字は方言ごとに読みが違う。ここで 0=日曜〜6=土曜に直してから外へ出す：
 * - crontab（Vixie）・Spring：0 と 7 が日曜、1=月曜
 * - Quartz・AWS：1=日曜〜7=土曜
 */
import {
  FIELD_NAMES,
  FIELD_ORDER,
  type CronSpec,
  type DomSpec,
  type DowSpec,
  type FieldKind,
  type Grammar,
  type ParseError,
} from './types';

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DOW_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** 文法ごとの曜日の数字の範囲（方言の数字のまま） */
const DOW_RANGE: Record<Grammar, [number, number]> = {
  cron5: [0, 7],
  spring: [0, 7],
  quartz: [1, 7],
  aws: [1, 7],
};

/** 方言の曜日の数字 → 0=日曜〜6=土曜 */
export function dowFromNative(n: number, grammar: Grammar): number {
  if (grammar === 'quartz' || grammar === 'aws') return n - 1;
  return n % 7;
}

/** 0=日曜〜6=土曜 → 方言の曜日の数字 */
export function dowToNative(dow: number, grammar: Grammar): number {
  if (grammar === 'quartz' || grammar === 'aws') return dow + 1;
  return dow;
}

const RANGES: Record<Exclude<FieldKind, 'dow'>, [number, number]> = {
  second: [0, 59],
  minute: [0, 59],
  hour: [0, 23],
  dom: [1, 31],
  month: [1, 12],
  year: [1970, 2199],
};

function rangeOf(kind: FieldKind, grammar: Grammar): [number, number] {
  return kind === 'dow' ? DOW_RANGE[grammar] : RANGES[kind];
}

/** 「3 番目（日）」 */
export function fieldLabel(position: number, kind: FieldKind): string {
  return `${position} 番目（${FIELD_NAMES[kind]}）`;
}

class FieldError extends Error {}

function fail(message: string): never {
  throw new FieldError(message);
}

/** 数字か名前（JAN・MON）を、方言の数字にする */
function atom(token: string, kind: FieldKind, grammar: Grammar): number {
  const upper = token.toUpperCase();
  if (kind === 'month') {
    const i = MONTH_NAMES.indexOf(upper);
    if (i >= 0) return i + 1;
  }
  if (kind === 'dow') {
    const i = DOW_NAMES.indexOf(upper);
    if (i >= 0) return dowToNative(i, grammar);
  }
  if (!/^\d+$/.test(token)) fail(`\`${token}\` は読めません`);
  const n = Number(token);
  const [min, max] = rangeOf(kind, grammar);
  if (n < min || n > max) fail(`\`${token}\` は ${min}〜${max} の範囲外です`);
  return n;
}

/** `*`・`a`・`a-b`・`*\/s`・`a/s`・`a-b/s` のカンマ区切りを、方言の数字の集合に展開する */
function expandList(text: string, kind: FieldKind, grammar: Grammar): number[] {
  const [min, max] = rangeOf(kind, grammar);
  const out = new Set<number>();
  for (const item of text.split(',')) {
    if (item === '') fail('カンマの前後が空です');
    const [base, stepText, extra] = item.split('/');
    if (extra !== undefined) fail(`\`${item}\` の / が多すぎます`);
    let step = 1;
    if (stepText !== undefined) {
      if (!/^\d+$/.test(stepText) || Number(stepText) === 0) fail(`\`${item}\` の / のあとは 1 以上の数にします`);
      step = Number(stepText);
    }
    let from: number;
    let to: number;
    if (base === '*') {
      from = min;
      to = max;
    } else if (base.includes('-')) {
      const parts = base.split('-');
      if (parts.length !== 2 || parts[0] === '' || parts[1] === '') fail(`\`${item}\` の範囲が読めません`);
      from = atom(parts[0], kind, grammar);
      to = atom(parts[1], kind, grammar);
      if (from > to) fail(`\`${item}\` は始まりが終わりより大きい範囲です`);
    } else {
      from = atom(base, kind, grammar);
      // `5/15` は Quartz の書き方（5 から 15 ごと）。単独の数字は 1 つだけ
      to = stepText !== undefined ? max : from;
    }
    for (let v = from; v <= to; v += step) out.add(v);
  }
  return [...out].sort((a, b) => a - b);
}

function uniqSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function emptyDom(): DomSpec {
  return { any: false, star: false, values: [], last: [], nearest: [], lastWeekday: false };
}

function emptyDow(): DowSpec {
  return { any: false, star: false, values: [], last: [], nth: [] };
}

/** `?`・`L`・`W`・`#` を受け付ける文法か */
function hasSpecials(grammar: Grammar): boolean {
  return grammar !== 'cron5';
}

function parseDom(text: string, grammar: Grammar): DomSpec {
  const dom = emptyDom();
  dom.star = text.startsWith('*');
  if (text === '*' || text === '?') {
    if (text === '?' && !hasSpecials(grammar)) fail('`?` は使えません（crontab では `*` と書きます）');
    dom.any = true;
    return dom;
  }
  const upper = text.toUpperCase();
  if (/[LW]/.test(upper)) {
    if (!hasSpecials(grammar)) fail(`\`${text}\`：L・W は crontab では使えません`);
    if (upper === 'L') {
      dom.last = [0];
      return dom;
    }
    if (upper === 'LW') {
      dom.lastWeekday = true;
      return dom;
    }
    const lastOffset = /^L-(\d+)$/.exec(upper);
    if (lastOffset) {
      if (grammar === 'aws') fail(`\`${text}\`：AWS では L-n は使えません`);
      const n = Number(lastOffset[1]);
      if (n > 30) fail(`\`${text}\` の n は 30 までです`);
      dom.last = [n];
      return dom;
    }
    const near = /^(\d+)W$/.exec(upper);
    if (near) {
      const n = Number(near[1]);
      if (n < 1 || n > 31) fail(`\`${text}\` の日は 1〜31 です`);
      dom.nearest = [n];
      return dom;
    }
    fail(`\`${text}\` は読めません（L・W はほかの値と並べられません）`);
  }
  dom.values = expandList(text, 'dom', grammar);
  return dom;
}

function parseDow(text: string, grammar: Grammar): DowSpec {
  const dow = emptyDow();
  dow.star = text.startsWith('*');
  if (text === '*' || text === '?') {
    if (text === '?' && !hasSpecials(grammar)) fail('`?` は使えません（crontab では `*` と書きます）');
    dow.any = true;
    return dow;
  }
  const upper = text.toUpperCase();
  // 曜日の名前（SUN〜SAT）に L は含まれないので、L があれば特別な書き方
  if (upper.includes('#') || upper.includes('L')) {
    if (!hasSpecials(grammar)) fail(`\`${text}\`：L・# は crontab では使えません`);
    if (upper === 'L') {
      // 曜日の L だけは「週の最後の日」＝土曜
      dow.values = [6];
      return dow;
    }
    const nth = /^([0-9]|[A-Z]{3})#(\d)$/.exec(upper);
    if (nth) {
      const d = dowFromNative(atom(nth[1], 'dow', grammar), grammar);
      const n = Number(nth[2]);
      if (n < 1 || n > 5) fail(`\`${text}\` の # のあとは 1〜5 です`);
      dow.nth = [{ dow: d, n }];
      return dow;
    }
    const last = /^([0-9]|[A-Z]{3})L$/.exec(upper);
    if (last) {
      dow.last = [dowFromNative(atom(last[1], 'dow', grammar), grammar)];
      return dow;
    }
    fail(`\`${text}\` は読めません（L・# はほかの値と並べられません）`);
  }
  dow.values = uniqSorted(expandList(text, 'dow', grammar).map((n) => dowFromNative(n, grammar)));
  return dow;
}

export type ParseResult = { ok: true; spec: CronSpec; fields: string[] } | { ok: false; errors: ParseError[] };

/** 文法ごとのフィールドの数（Quartz は年が省略できるので 6 か 7） */
export function fieldCountOk(grammar: Grammar, count: number): boolean {
  if (grammar === 'cron5') return count === 5;
  if (grammar === 'quartz') return count === 6 || count === 7;
  return count === 6;
}

function expectedCountText(grammar: Grammar): string {
  if (grammar === 'cron5') return '5 つ';
  if (grammar === 'quartz') return '6 つか 7 つ';
  return '6 つ';
}

/**
 * フィールドの配列を、指定した文法で解析する。
 * `?` の置ける位置・日と曜日の片方を `?` にする決まりも、ここで確かめる。
 */
export function parseFields(fields: string[], grammar: Grammar): ParseResult {
  if (!fieldCountOk(grammar, fields.length)) {
    return {
      ok: false,
      errors: [{ position: 0, message: `フィールドの数が ${fields.length} つです（${expectedCountText(grammar)}必要です）` }],
    };
  }
  const order = FIELD_ORDER[grammar];
  const errors: ParseError[] = [];
  const spec: CronSpec = {
    seconds: [0],
    minutes: [],
    hours: [],
    dom: emptyDom(),
    months: [],
    dow: emptyDow(),
    years: null,
    mode: 'and',
  };
  fields.forEach((text, i) => {
    const kind = order[i];
    const position = i + 1;
    try {
      if (text === '?' && kind !== 'dom' && kind !== 'dow') fail('`?` は日か曜日にだけ書けます');
      switch (kind) {
        case 'second':
          spec.seconds = expandList(text, kind, grammar);
          break;
        case 'minute':
          spec.minutes = expandList(text, kind, grammar);
          break;
        case 'hour':
          spec.hours = expandList(text, kind, grammar);
          break;
        case 'month':
          spec.months = expandList(text, kind, grammar);
          break;
        case 'year':
          spec.years = text === '*' ? null : expandList(text, kind, grammar);
          break;
        case 'dom':
          spec.dom = parseDom(text, grammar);
          break;
        case 'dow':
          spec.dow = parseDow(text, grammar);
          break;
      }
    } catch (e) {
      if (!(e instanceof FieldError)) throw e;
      errors.push({ position, message: `${fieldLabel(position, kind)}の${e.message}` });
    }
  });
  if (errors.length > 0) return { ok: false, errors };

  const domIndex = order.indexOf('dom');
  const dowIndex = order.indexOf('dow');
  const domQ = fields[domIndex] === '?';
  const dowQ = fields[dowIndex] === '?';
  if (grammar === 'aws' || grammar === 'quartz') {
    const who = grammar === 'aws' ? 'AWS' : 'Quartz';
    if (domQ && dowQ) {
      return {
        ok: false,
        errors: [{ position: dowIndex + 1, message: `${who} では日（${domIndex + 1} 番目）と曜日（${dowIndex + 1} 番目）の両方を ? にはできません` }],
      };
    }
    if (!domQ && !dowQ) {
      return {
        ok: false,
        errors: [{ position: dowIndex + 1, message: `${who} では日（${domIndex + 1} 番目）か曜日（${dowIndex + 1} 番目）のどちらかを ? にします` }],
      };
    }
  }
  // Vixie cron：両方とも `*` で始まらないときだけ OR（どちらかに当てはまれば動く）
  if (grammar === 'cron5' && !spec.dom.star && !spec.dow.star) spec.mode = 'or';
  return { ok: true, spec, fields };
}

/** 式を空白で区切る（連続する空白・タブも1つとみなす） */
export function splitFields(expr: string): string[] {
  const t = expr.trim();
  return t === '' ? [] : t.split(/\s+/);
}

/** crontab のマクロ */
export const MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

export { DOW_NAMES, MONTH_NAMES };
