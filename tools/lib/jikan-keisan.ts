/**
 * 時間計算（勤務時間・時間の足し算・10進数変換）のロジック。純関数のみ。
 *
 * 仕様: docs/features/jikan-keisan.md
 *
 * 出典（2026-11-18 に e-Gov 法令API で本文を確認）：
 * - 労働基準法 第32条 — 「休憩時間を除き一日について八時間を超えて」
 * - 労働基準法 第34条第1項 — 「労働時間が六時間を超える場合においては少くとも四十五分、
 *   八時間を超える場合においては少くとも一時間の休憩時間」。
 *   ここでいう労働時間は32条と同じく休憩を除いた時間なので、**実働**で判定する
 *   （仕様書「決めること 2」。実働 6時間ちょうどは「超える」に当たらない）
 * - 労働基準法 第37条第4項 — 午後10時から午前5時まで（深夜）
 * - 昭和63年3月14日 基発第150号 (1) — 1か月の時間外・休日・深夜業それぞれの時間数の合計の
 *   30分未満切り捨て・30分以上切り上げ。**実働の合計・1日ごとの値には当てない**。
 *   規則は `zangyodai.ts` の `roundHoursSimplified` を import して使う（同じ規則を2か所に書かない）
 *
 * 約束：
 * - 時間はすべて**整数の秒**で持つ。小数の時間は入力時に秒へ直し、表示のときだけ戻す
 * - 時給の額は `秒 × 時給` を整数で持ち、`÷ 3600` は表示のときだけ。**切り捨ての値は作らない**
 */

import { convertWidth } from './hankaku-zenkaku';
import { roundHoursSimplified } from './zangyodai';

export const MINUTE = 60;
export const HOUR = 3600;
export const DAY = 86400;

/** 1行で受け付ける拘束時間の上限（これを超えるのは入力の誤りとみなす） */
export const MAX_SPAN_SEC = 36 * HOUR;
/** 25時表記で受け付ける時刻の上限（29:59） */
export const MAX_CLOCK_SEC = 30 * HOUR - MINUTE;
/** 一度に貼り付けて読む行数の上限 */
export const MAX_ROWS = 100;

/** 深夜（労基法37条4項）：22:00〜翌5:00。1日の始まりからの秒で [22h, 29h) */
export const NIGHT_START = 22 * HOUR;
export const NIGHT_END = 29 * HOUR;

/** 法定労働時間（労基法32条2項） */
export const STATUTORY_DAY_SEC = 8 * HOUR;

/** 休憩の最低限（労基法34条1項）。実働がこれを「超える」と必要 */
export const BREAK_RULES = [
  { overSec: 8 * HOUR, minBreakSec: 60 * MINUTE },
  { overSec: 6 * HOUR, minBreakSec: 45 * MINUTE },
] as const;

// ---------------------------------------------------------------------------
// 入力の正規化と解釈
// ---------------------------------------------------------------------------

/** 全角の数字・記号を半角にし、空白を詰め、マイナス記号の揺れを `-` に揃える */
export function normalize(input: string): string {
  return convertWidth(input, 'toHalf', { kana: false })
    .replace(/[−–—‐ー]/g, '-')
    .replace(/[：]/g, ':')
    .replace(/\s+/g, '')
    .trim();
}

/**
 * 時刻（出勤・退勤）を「その日の 0:00 からの秒」に直す。
 * `9:00`・`9:00:00`・`900`・`0900`・`9`・`9時`・`9時30分`・`９：００` を受け付ける。
 * `24:00`〜`29:59` の25時表記も受け付ける（翌日の時刻として読む）。
 * 読めなければ null。
 */
export function parseClock(input: string): number | null {
  const s = normalize(input);
  if (s === '') return null;
  let h: number;
  let m = 0;
  let sec = 0;
  let mt: RegExpMatchArray | null;
  if ((mt = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/))) {
    h = Number(mt[1]);
    m = Number(mt[2]);
    sec = mt[3] ? Number(mt[3]) : 0;
  } else if ((mt = s.match(/^(\d{1,2})時(?:(\d{1,2})分?)?$/))) {
    h = Number(mt[1]);
    m = mt[2] ? Number(mt[2]) : 0;
  } else if ((mt = s.match(/^(\d{1,2})$/))) {
    h = Number(mt[1]);
  } else if ((mt = s.match(/^(\d{1,2})(\d{2})$/))) {
    // テンキーだけで打つ形：900 → 9:00、1730 → 17:30
    h = Number(mt[1]);
    m = Number(mt[2]);
  } else {
    return null;
  }
  if (m >= 60 || sec >= 60) return null;
  const total = h * HOUR + m * MINUTE + sec;
  if (total > MAX_CLOCK_SEC) return null;
  return total;
}

/**
 * 休憩を秒に直す。空は 0。
 * - `60`・`45` のような1〜2桁の数は**分**
 * - `100`・`130` のような3〜4桁の数は `h:mm`（テンキーだけで打つ形。100 → 1:00）
 * - `1:00`・`1:00:00`・`45分`・`1時間`・`1時間30分`・`1.5時間` も受け付ける
 */
export function parseBreak(input: string): number | null {
  const s = normalize(input);
  if (s === '') return 0;
  let mt: RegExpMatchArray | null;
  if ((mt = s.match(/^(\d{1,2})$/))) return Number(mt[1]) * MINUTE;
  if ((mt = s.match(/^(\d{1,2})(\d{2})$/))) {
    const m = Number(mt[2]);
    return m < 60 ? Number(mt[1]) * HOUR + m * MINUTE : null;
  }
  return parseDuration(s);
}

/**
 * 休憩を3〜4桁の数（`120` → 1:20）として `h:mm` で読んだか。
 * 「120分」のつもりで打つと実働が多く出るので、画面で読み方を見せるために使う
 */
export function breakReadAsHm(input: string): boolean {
  const s = normalize(input);
  return /^\d{3,4}$/.test(s) && parseBreak(s) !== null;
}

/** `1.5` のような10進数の文字列を「×unit 秒」の整数に直す（二進小数を経由しない） */
function decimalToSec(whole: string, frac: string | undefined, unit: number): number {
  const w = Number(whole) * unit;
  if (!frac) return w;
  const den = 10 ** frac.length;
  return w + Math.round((Number(frac) * unit) / den);
}

/**
 * 時間の長さ（符号なし）を秒に直す。
 * `h:mm`・`h:mm:ss`・`90分`・`1.5時間`・`1時間30分`・`30秒`・単位のない数（時間として読む）。
 */
export function parseDuration(input: string): number | null {
  const s = normalize(input).replace(/hours?|hrs?|h$/i, '時間').replace(/(min|m)$/i, '分');
  if (s === '') return null;
  let mt: RegExpMatchArray | null;
  if ((mt = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/))) {
    const m = Number(mt[2]);
    const sec = mt[3] ? Number(mt[3]) : 0;
    if (m >= 60 || sec >= 60) return null;
    return Number(mt[1]) * HOUR + m * MINUTE + sec;
  }
  if ((mt = s.match(/^(\d+)(?:\.(\d+))?$/))) return decimalToSec(mt[1], mt[2], HOUR);
  // 「1時間30分」「1.5時間」「90分」「45秒」と、その組み合わせ
  mt = s.match(/^(?:(\d+)(?:\.(\d+))?時間)?(?:(\d+)(?:\.(\d+))?分)?(?:(\d+)秒)?$/);
  if (mt && (mt[1] !== undefined || mt[3] !== undefined || mt[5] !== undefined)) {
    let total = 0;
    if (mt[1] !== undefined) total += decimalToSec(mt[1], mt[2], HOUR);
    if (mt[3] !== undefined) total += decimalToSec(mt[3], mt[4], MINUTE);
    if (mt[5] !== undefined) total += Number(mt[5]);
    return total;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 表示
// ---------------------------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * 秒を `h:mm` で。24時間を超えても日に繰り上げない（`168:45`）。
 * 秒の端数があるときだけ `h:mm:ss`。負の値は `−0:25` のように符号をつける。
 */
export function formatHm(sec: number, withSeconds: 'auto' | 'never' | 'always' = 'auto'): string {
  const sign = sec < 0 ? '−' : '';
  const a = Math.abs(sec);
  const h = Math.floor(a / HOUR);
  const m = Math.floor((a % HOUR) / MINUTE);
  const s = a % MINUTE;
  const showSec = withSeconds === 'always' || (withSeconds === 'auto' && s !== 0);
  return `${sign}${h}:${pad2(m)}${showSec ? `:${pad2(s)}` : ''}`;
}

/** 秒 → 10進数の時間（表示用。小数第 digits 位で四捨五入した文字列） */
export function formatDecimalHours(sec: number, digits = 2): string {
  const sign = sec < 0 ? '-' : '';
  const a = Math.abs(sec);
  // 整数で丸める：a / 3600 を 10^digits 倍して四捨五入
  const scale = 10 ** digits;
  const num = a * scale;
  let q = Math.floor(num / HOUR);
  if ((num - q * HOUR) * 2 >= HOUR) q += 1;
  const whole = Math.floor(q / scale);
  const frac = String(q % scale).padStart(digits, '0');
  return `${sign}${whole}${digits > 0 ? `.${frac}` : ''}`;
}

/** 秒 → 「◯日と◯時間◯分」（24時間ごとに日へ繰り上げる。足し算の結果の読み方の1つ） */
export function formatDaysHm(sec: number): string {
  const sign = sec < 0 ? '−' : '';
  const a = Math.abs(sec);
  const d = Math.floor(a / DAY);
  const rest = a % DAY;
  const h = Math.floor(rest / HOUR);
  const m = Math.floor((rest % HOUR) / MINUTE);
  const s = rest % MINUTE;
  const hm = `${h}時間${m}分${s ? `${s}秒` : ''}`;
  return `${sign}${d > 0 ? `${d}日と` : ''}${hm}`;
}

/** 秒 → 分（整数。秒は切り捨て） */
export const toWholeMinutes = (sec: number): number => Math.trunc(sec / MINUTE);

// ---------------------------------------------------------------------------
// A. 勤務時間
// ---------------------------------------------------------------------------

export interface WorkInput {
  start: string;
  end: string;
  /** 分（`60`）・`h:mm`（`1:00`）など。空は0 */
  breakTime: string;
}

export type WorkError =
  | 'start'
  | 'end'
  | 'break'
  | 'span-too-long'
  | 'break-too-long';

export const WORK_ERROR_TEXT: Record<WorkError, string> = {
  start: '出勤の時刻が読めません（例 9:00・900）',
  end: '退勤の時刻が読めません（例 18:00・1800・26:00）',
  break: '休憩が読めません（例 60・1:00・45分）',
  'span-too-long': '36時間を超える勤務は1行で受け付けません。日を分けて入れてください',
  'break-too-long': '休憩が拘束時間以上になっています',
};

export interface WorkDay {
  /** 出勤・退勤（その日の 0:00 からの秒。退勤は日またぎなら 24時間以上） */
  startSec: number;
  endSec: number;
  breakSec: number;
  /** 退勤が翌日（日またぎ・25時表記を含む） */
  overnight: boolean;
  /** 拘束時間（退勤 − 出勤） */
  spanSec: number;
  /** 実働（拘束 − 休憩） */
  workSec: number;
  /** 深夜帯（22〜5時）にかかる拘束 */
  nightSpanSec: number;
  /** 深夜帯の実働の最小（休憩を全部深夜帯に取った） */
  nightMinSec: number;
  /** 深夜帯の実働の最大（休憩を全部深夜帯の外で取った） */
  nightMaxSec: number;
  /** 8時間を超えた実働（労基法32条の目安） */
  over8Sec: number;
  /** 休憩の不足（労基法34条の目安）。足りていれば null */
  breakShortage: { requiredSec: number; shortSec: number } | null;
}

/** 区間 [a1, a2) と [b1, b2) の重なり（秒） */
const overlap = (a1: number, a2: number, b1: number, b2: number) =>
  Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));

/** 勤務 [start, end) と深夜帯の重なり。前日・当日・翌日の [22:00, 29:00) を見る */
export function nightOverlapSec(startSec: number, endSec: number): number {
  let total = 0;
  for (const offset of [-DAY, 0, DAY]) {
    total += overlap(startSec, endSec, NIGHT_START + offset, NIGHT_END + offset);
  }
  return total;
}

/** 実働に対して必要な休憩（労基法34条1項）。実働が6時間ちょうど・8時間ちょうどは「超える」に当たらない */
export function requiredBreakSec(workSec: number): number {
  for (const r of BREAK_RULES) if (workSec > r.overSec) return r.minBreakSec;
  return 0;
}

/** 1日分を計算する。読めない入力・矛盾はエラーの種類を返す */
export function calcWorkDay(input: WorkInput): WorkDay | { error: WorkError } {
  const startSec = parseClock(input.start);
  if (startSec === null) return { error: 'start' };
  const rawEnd = parseClock(input.end);
  if (rawEnd === null) return { error: 'end' };
  const breakSec = parseBreak(input.breakTime);
  if (breakSec === null) return { error: 'break' };

  // 退勤が出勤より前（または同じ）なら翌日の退勤
  const endSec = rawEnd <= startSec ? rawEnd + DAY : rawEnd;
  const overnight = endSec >= DAY;
  const spanSec = endSec - startSec;
  if (spanSec > MAX_SPAN_SEC) return { error: 'span-too-long' };
  if (breakSec >= spanSec) return { error: 'break-too-long' };

  const workSec = spanSec - breakSec;
  const nightSpanSec = nightOverlapSec(startSec, endSec);
  const nightMinSec = Math.max(0, nightSpanSec - breakSec);
  const nightMaxSec = Math.min(nightSpanSec, workSec);
  const over8Sec = Math.max(0, workSec - STATUTORY_DAY_SEC);
  const requiredSec = requiredBreakSec(workSec);
  const breakShortage =
    breakSec < requiredSec ? { requiredSec, shortSec: requiredSec - breakSec } : null;

  return {
    startSec,
    endSec,
    breakSec,
    overnight,
    spanSec,
    workSec,
    nightSpanSec,
    nightMinSec,
    nightMaxSec,
    over8Sec,
    breakShortage,
  };
}

export const isWorkError = (r: WorkDay | { error: WorkError }): r is { error: WorkError } =>
  'error' in r;

/** 丸めの選択。`kihatsu150` は基発第150号(1)の30分未満切り捨て・以上切り上げ */
export type Rounding = 'none' | 'kihatsu150';

/**
 * 基発第150号(1)の丸めを月の合計（秒）に当てる。
 * **秒は分に切り捨ててから** ÷60 して `roundHoursSimplified` に渡す
 * （`20:29:30` のような秒の端数で切り上げ・切り捨てが入れ替わらないように）。
 */
export function roundMonthlyTotal(sec: number): number {
  const minutes = toWholeMinutes(sec);
  return roundHoursSimplified(minutes / 60) * HOUR;
}

export interface WorkTotals {
  days: number;
  spanSec: number;
  /** 実働の合計。**丸めの選択に関係なくそのまま** */
  workSec: number;
  breakSec: number;
  nightMinSec: number;
  nightMaxSec: number;
  over8Sec: number;
  /** 丸めを当てた値（`rounding: 'none'` なら上と同じ） */
  rounded: { nightMinSec: number; nightMaxSec: number; over8Sec: number };
  /** 休憩の不足の印がついた日数 */
  breakShortDays: number;
  overnightDays: number;
}

export function sumWorkDays(days: WorkDay[], rounding: Rounding = 'none'): WorkTotals {
  const t = {
    days: days.length,
    spanSec: 0,
    workSec: 0,
    breakSec: 0,
    nightMinSec: 0,
    nightMaxSec: 0,
    over8Sec: 0,
    breakShortDays: 0,
    overnightDays: 0,
  };
  for (const d of days) {
    t.spanSec += d.spanSec;
    t.workSec += d.workSec;
    t.breakSec += d.breakSec;
    t.nightMinSec += d.nightMinSec;
    t.nightMaxSec += d.nightMaxSec;
    t.over8Sec += d.over8Sec;
    if (d.breakShortage) t.breakShortDays += 1;
    if (d.overnight) t.overnightDays += 1;
  }
  const r = (x: number) => (rounding === 'kihatsu150' ? roundMonthlyTotal(x) : x);
  return {
    ...t,
    rounded: { nightMinSec: r(t.nightMinSec), nightMaxSec: r(t.nightMaxSec), over8Sec: r(t.over8Sec) },
  };
}

// --- 時給 × 実働 -----------------------------------------------------------

export interface WageAmount {
  /** 円の100倍（小数第2位まで。四捨五入）。表示は formatYen2 */
  hundredths: number;
  /** 四捨五入した円（目安） */
  yenRounded: number;
}

/** 時給（円・整数）を読む。空や不正は null */
export function parseWage(input: string): number | null {
  const s = normalize(input).replace(/[,，円]/g, '');
  if (!/^\d{1,6}$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n : null;
}

/** 整数 n を d で割って四捨五入（0以上） */
const divRound = (n: number, d: number) => {
  const q = Math.floor(n / d);
  return (n - q * d) * 2 >= d ? q + 1 : q;
};

/**
 * 実働 × 時給。`秒 × 時給` を整数で持ち、割るのは最後だけ。
 * **切り捨ての値は返さない**（ツールが「切り捨てて払ってよい」と勧めているように見えるため。仕様書 A）
 */
export function wageAmount(workSec: number, hourlyYen: number): WageAmount {
  const n = workSec * hourlyYen; // 円・秒
  return { hundredths: divRound(n, 36), yenRounded: divRound(n, HOUR) };
}

/** 円の100倍 → `8,990.67円` */
export function formatYen2(hundredths: number): string {
  const yen = Math.floor(hundredths / 100);
  const frac = String(hundredths % 100).padStart(2, '0');
  return `${yen.toLocaleString('ja-JP')}.${frac}円`;
}

export const formatYen = (yen: number): string => `${yen.toLocaleString('ja-JP')}円`;

// --- 貼り付け ---------------------------------------------------------------

export interface PastedRow {
  /** 先頭の列が日付だったときの見出し（`11/1` など） */
  label: string | null;
  start: string;
  end: string;
  breakTime: string;
}

export interface PasteResult {
  rows: PastedRow[];
  /** 読めなかった行（1始まりの行番号） */
  skipped: number[];
  /** MAX_ROWS を超えて切り捨てた行数 */
  truncated: number;
}

const DATE_CELL = /^(\d{1,4}[/.-]\d{1,2}(?:[/.-]\d{1,2})?|\d{1,2}月\d{1,2}日)(\([^)]*\))?$/;

/**
 * Excel・スプレッドシートの列（タブ・カンマ区切り）を行に分ける。
 * 2〜3列（出勤・退勤・休憩）。先頭の列が日付なら見出しとして外す。
 * 1行目が見出し（時刻として読めない）なら黙って飛ばす。
 */
export function parsePasted(text: string): PasteResult {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const rows: PastedRow[] = [];
  const skipped: number[] = [];
  let truncated = 0;
  lines.forEach((line, i) => {
    if (line.trim() === '') return;
    let cells = line.split(/\t|,|，/).map((c) => c.trim());
    let label: string | null = null;
    if (cells.length > 0 && DATE_CELL.test(normalize(cells[0]))) {
      label = cells[0];
      cells = cells.slice(1);
    }
    // 後ろの空のセルは無視
    while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
    const ok =
      cells.length >= 2 &&
      cells.length <= 3 &&
      parseClock(cells[0]) !== null &&
      parseClock(cells[1]) !== null &&
      (cells.length < 3 || parseBreak(cells[2]) !== null);
    if (!ok) {
      // 1行目の見出し（数字を含まない）は飛ばしたことにしない
      if (!(rows.length === 0 && skipped.length === 0 && !/\d/.test(normalize(line)))) skipped.push(i + 1);
      return;
    }
    if (rows.length >= MAX_ROWS) {
      truncated += 1;
      return;
    }
    rows.push({ label, start: cells[0], end: cells[1], breakTime: cells[2] ?? '' });
  });
  return { rows, skipped, truncated };
}

// --- Excel の式 -------------------------------------------------------------

/**
 * 同じ計算の Excel の式（A列=出勤・B列=退勤・C列=休憩、2行目から）。
 * C列の休憩が時刻の形（`1:00`）のときの式と、分（`60`）で入れているときの式の両方。
 */
export const EXCEL_FORMULAS = [
  { key: 'work', label: '実働（D2）', formula: '=MOD(B2-A2,1)-C2', note: '休憩を 1:00 の形で入れているとき。日またぎ（夜勤）も MOD で翌日として計算' },
  { key: 'work-minutes', label: '実働（休憩を分で入れているとき）', formula: '=MOD(B2-A2,1)-C2/1440', note: '休憩を 60 のように分で入れているなら C2 を C2/1440 に（1日＝1440分）' },
  { key: 'decimal', label: '10進数の時間（E2）', formula: '=(MOD(B2-A2,1)-C2)*24', note: 'セルの表示形式は「数値」に。8:30 が 8.5 になります' },
  { key: 'sum', label: '月の合計（表示形式）', formula: '[h]:mm', note: '合計のセルの表示形式をユーザー定義で [h]:mm に。h:mm のままだと 24時間を超えたところで 0:30 のように戻ります' },
] as const;

// ---------------------------------------------------------------------------
// B. 時間の足し算・引き算
// ---------------------------------------------------------------------------

export interface SumTerm {
  sign: 1 | -1;
  sec: number;
  text: string;
}

export interface SumResult {
  terms: SumTerm[];
  totalSec: number;
  /** 読めなかった項 */
  errors: string[];
}

/**
 * `1:30 + 0:50 − 0:15` の式を、何行でも足し引きする。
 * 行頭の `+`／`−` で足すか引くかを切り替える（無ければ足す）。1行に式を書いてもよい。
 */
export function sumDurations(text: string): SumResult {
  const terms: SumTerm[] = [];
  const errors: string[] = [];
  const src = convertWidth(text, 'toHalf', { kana: false }).replace(/[−–—‐ー]/g, '-').replace(/＋/g, '+');
  // 改行も区切りにして、記号の前で切る
  const re = /([+-]?)\s*([^+\-\n]+)/g;
  let mt: RegExpExecArray | null;
  while ((mt = re.exec(src))) {
    const body = mt[2].trim();
    if (body === '') continue;
    const sec = parseDuration(body);
    if (sec === null) {
      errors.push(body);
      continue;
    }
    terms.push({ sign: mt[1] === '-' ? -1 : 1, sec, text: body });
  }
  const totalSec = terms.reduce((a, t) => a + t.sign * t.sec, 0);
  return { terms, totalSec, errors };
}

// ---------------------------------------------------------------------------
// C. 10進数 ⇔ 時分の換算
// ---------------------------------------------------------------------------

/** `7:45` → 秒。読めなければ null */
export const hmToSec = (input: string): number | null => parseDuration(input);

/** `7.8`（時間） → 秒（二進小数を経由しない） */
export function decimalHoursToSec(input: string): number | null {
  const s = normalize(input).replace(/時間$|h$/i, '');
  const mt = s.match(/^(\d+)(?:\.(\d+))?$|^\.(\d+)$/);
  if (!mt) return null;
  if (mt[3] !== undefined) return decimalToSec('0', mt[3], HOUR);
  return decimalToSec(mt[1], mt[2], HOUR);
}

/** `465`（分） → 秒 */
export function minutesToSec(input: string): number | null {
  const s = normalize(input).replace(/分$/, '');
  const mt = s.match(/^(\d+)(?:\.(\d+))?$/);
  if (!mt) return null;
  return decimalToSec(mt[1], mt[2], MINUTE);
}

export interface HayamiRow {
  hm: string;
  minutes: number;
  decimal: string;
}

/** 早見表：stepMin 分刻みで upToMin 分まで（例：15分刻みで 0:15＝0.25 … 1:00＝1.00） */
export function hayamihyo(stepMin: number, upToMin = 60): HayamiRow[] {
  const rows: HayamiRow[] = [];
  for (let m = stepMin; m <= upToMin; m += stepMin) {
    rows.push({ hm: formatHm(m * MINUTE), minutes: m, decimal: formatDecimalHours(m * MINUTE) });
  }
  return rows;
}
