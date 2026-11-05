/**
 * UNIX時間・Excel シリアル値 変換（仕様: docs/features/unix-jikan-excel-serial.md）
 *
 * - **利用者の PC のタイムゾーンに依存しない。** 日本時間は UTC+9 固定で、
 *   `+9h` を足した `Date` の UTC の各部（getUTC*）を読む。`getHours()` などの
 *   ローカルタイムの関数と `Intl` のタイムゾーンは使わない
 * - UNIX時間は 1970-01-01T00:00:00Z からの経過秒（POSIX の定義どおり、うるう秒は数えない）
 * - ナノ秒（19 桁）は倍精度の浮動小数では整数部の下の桁が落ちるので、BigInt で割る
 * - Excel のシリアル値には**タイムゾーンが無い**（セルに入っている見たままの日時）。
 *   UNIX時間と同じ `Date` の道具で組み立てるが、「UTC の各部 = 見たままの日時」として扱う
 */

import { toWareki } from './nenrei';

// ---------------------------------------------------------------------------
// 定数（判定の閾値はテストで固定している）
// ---------------------------------------------------------------------------

/** 入力が止まってから計算するまでの待ち（ms） */
export const DEBOUNCE_MS = 150;

/** 日本時間の UTC からのずれ。日本は 1952 年以降サマータイムが無いので固定 */
export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

const DAY_MS = 86_400_000;

/** 整数部の絶対値がこれ未満なら秒 */
export const SEC_BELOW = 100_000_000_000; // 1e11
/** 整数部の絶対値がこれ未満ならミリ秒 */
export const MS_BELOW = 100_000_000_000_000; // 1e14
/** 整数部の絶対値がこれ未満ならマイクロ秒（以上はナノ秒） */
export const US_BELOW = 100_000_000_000_000_000n; // 1e17

/**
 * `0 < 値 < EXCEL_DETECT_BELOW`（整数部が 6 桁以下）なら Excel のシリアル値を第一候補にする。
 * Excel の上限 9999-12-31 は 2958465 だが、7 桁は秒として読むほうが実務で多い
 */
export const EXCEL_DETECT_BELOW = 1_000_000;

/** Excel（1900 年基準）で表せる最後の日 9999-12-31 のシリアル値 */
export const EXCEL_MAX_SERIAL = 2_958_465;

/** 1900 年基準と 1904 年基準の差（日） */
export const EXCEL_1904_OFFSET_DAYS = 1462;

/** Excel だけにある日付（存在しない 1900-02-29）のシリアル値 */
export const EXCEL_PHANTOM_SERIAL = 60;

/** JavaScript の `Date` が表せる範囲（±8.64e15 ミリ秒） */
export const DATE_LIMIT_MS = 8.64e15;

/** 32 ビットの符号付き整数で表せる最後の秒（2038-01-19 03:14:07 UTC） */
export const Y2038_LAST_SECOND = 2_147_483_647;

/** 2038 年問題の一言を添える範囲（±この秒数） */
export const Y2038_NEAR_SECONDS = 86_400;

/** ログ欄の上限（UTF-8 のバイト数） */
export const LOG_MAX_BYTES = 1_000_000;

/** ログ欄で拾う範囲（UTC）。この外は ID・電話番号などの誤検出とみなす */
export const LOG_RANGE_FROM_MS = Date.UTC(2000, 0, 1);
export const LOG_RANGE_UNTIL_MS = Date.UTC(2101, 0, 1); // 2100-12-31 の終わりまで

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

/** 数字の読み方 */
export type Unit = 'sec' | 'ms' | 'us' | 'ns' | 'excel';

export const UNITS: Unit[] = ['sec', 'ms', 'us', 'ns', 'excel'];

export const UNIT_LABELS: Record<Unit, string> = {
  sec: 'UNIX時間（秒）',
  ms: 'ミリ秒',
  us: 'マイクロ秒',
  ns: 'ナノ秒',
  excel: 'Excel のシリアル値',
};

/** 1 秒 = 10^UNIT_EXPONENT[unit] 単位 */
const UNIT_EXPONENT: Record<Exclude<Unit, 'excel'>, number> = { sec: 0, ms: 3, us: 6, ns: 9 };

/** 入力を読んだ結果（符号・整数部・小数部の数字の並び） */
export interface ParsedNumber {
  negative: boolean;
  intDigits: string;
  fracDigits: string;
  /** 元の値（Excel のシリアル値の計算用。倍精度で足りる範囲だけで使う） */
  value: number;
}

/** 壁時計の各部（タイムゾーンを当てたあとの年月日・時分秒） */
export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  /** 0 = 日曜 */
  weekday: number;
}

export interface UnixResult {
  kind: 'unix';
  unit: Exclude<Unit, 'excel'>;
  /** UNIX時間（ミリ秒。ミリ秒より細かい桁は切り捨て＝過去側に丸める） */
  epochMs: number;
  /** ミリ秒より細かい桁を切り捨てたか */
  truncated: boolean;
  /** ミリ秒まで表示するか（ミリ秒以下の単位・小数つきの秒） */
  showMs: boolean;
  jst: WallClock;
  utc: WallClock;
}

export interface ExcelResult {
  kind: 'excel';
  base: 1900 | 1904;
  /** 見たままの日時 */
  wall: WallClock;
}

/** Excel の 60（1900-02-29。Excel だけにある日付） */
export interface ExcelPhantomResult {
  kind: 'excel-phantom';
  base: 1900;
  /** 小数部の時刻（hh:mm:ss） */
  time: string;
}

/** 1 未満のシリアル値（日付の部分が 0 で、時刻だけ） */
export interface ExcelTimeOnlyResult {
  kind: 'excel-time-only';
  time: string;
}

export interface ConvertError {
  kind: 'error';
  message: string;
}

export type ConvertResult =
  | UnixResult
  | ExcelResult
  | ExcelPhantomResult
  | ExcelTimeOnlyResult
  | ConvertError;

// ---------------------------------------------------------------------------
// 入力の読み取りと判定
// ---------------------------------------------------------------------------

/** 全角の数字・記号を半角に。桁区切りのカンマ・アンダースコア・空白は取り除く */
function normalizeInput(raw: string): string {
  return raw
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[．。]/g, '.')
    .replace(/[－−ー]/g, '-')
    .replace(/[＋]/g, '+')
    .replace(/[\s,，_'"]/g, '');
}

/** 数字として読めなければ null */
export function parseNumberInput(raw: string): ParsedNumber | null {
  const s = normalizeInput(raw);
  const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m) return null;
  const intDigits = (m[2] ?? '').replace(/^0+(?=\d)/, '');
  const fracDigits = (m[3] ?? '').replace(/0+$/, '');
  if (intDigits === '' && (m[3] ?? '') === '') return null;
  const value = Number(`${m[1]}${intDigits || '0'}.${fracDigits || '0'}`);
  const isZero = /^0*$/.test(intDigits) && fracDigits === '';
  return { negative: m[1] === '-' && !isZero, intDigits: intDigits || '0', fracDigits, value };
}

/**
 * 自動の判定。**整数部の絶対値の桁だけで決める**（小数かどうかでは決めない）。
 * `0 < 値 < 1000000` は Excel のシリアル値を第一候補にする
 */
export function detectUnit(parsed: ParsedNumber): Unit {
  const absInt = BigInt(parsed.intDigits);
  if (!parsed.negative && parsed.value > 0 && absInt < BigInt(EXCEL_DETECT_BELOW)) return 'excel';
  if (absInt < BigInt(SEC_BELOW)) return 'sec';
  if (absInt < BigInt(MS_BELOW)) return 'ms';
  if (absInt < US_BELOW) return 'us';
  return 'ns';
}

// ---------------------------------------------------------------------------
// 壁時計
// ---------------------------------------------------------------------------

/** UNIX時間（ミリ秒）にずれを足して、UTC の各部を読む */
export function wallClockAt(epochMs: number, offsetMs: number): WallClock {
  const d = new Date(epochMs + offsetMs);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    millisecond: d.getUTCMilliseconds(),
    weekday: d.getUTCDay(),
  };
}

/** 見たままの年月日・時分秒 → 「UTC として読んだ」ミリ秒（0〜99 年も 1900 年代にずらさない） */
export function wallToMs(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
): number {
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  d.setUTCHours(hour, minute, second, millisecond);
  return d.getTime();
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export function weekdayJa(w: WallClock): string {
  return WEEKDAYS[w.weekday];
}

/** ISO 8601 の年（0〜9999 は 4 桁、それ以外は符号つき 6 桁） */
function isoYear(year: number): string {
  if (year >= 0 && year <= 9999) return pad(year, 4);
  return `${year < 0 ? '-' : '+'}${pad(Math.abs(year), 6)}`;
}

/** '2026-11-05' */
export function formatYmd(w: WallClock): string {
  return `${isoYear(w.year)}-${pad(w.month)}-${pad(w.day)}`;
}

/** '09:00:00'（showMs なら '09:00:00.123'） */
export function formatHms(w: WallClock, showMs = false): string {
  const base = `${pad(w.hour)}:${pad(w.minute)}:${pad(w.second)}`;
  return showMs ? `${base}.${pad(w.millisecond, 3)}` : base;
}

/** '2026年11月5日（木） 09:00:00' */
export function formatJa(w: WallClock, showMs = false): string {
  const year = w.year <= 0 ? `紀元前${1 - w.year}年` : `${w.year}年`;
  return `${year}${w.month}月${w.day}日（${weekdayJa(w)}） ${formatHms(w, showMs)}`;
}

/** ISO 8601。suffix は '+09:00'・'Z'・''（タイムゾーンなし） */
export function formatIso(w: WallClock, showMs: boolean, suffix: string): string {
  return `${formatYmd(w)}T${formatHms(w, showMs)}${suffix}`;
}

/**
 * 和暦（'令和8年11月5日'）。`tools/lib/nenrei.ts` の `toWareki()` を使う。
 * **1873-01-01 より前は出さない**（明治5年12月2日以前は旧暦で、月日が西暦と対応しないため）
 */
export function warekiOf(w: WallClock): string | null {
  if (w.year < 1873) return null;
  const wareki = toWareki({ year: w.year, month: w.month, day: w.day });
  if (!wareki || wareki.lunisolar) return null;
  return wareki.label;
}

// ---------------------------------------------------------------------------
// 数字 → 日時
// ---------------------------------------------------------------------------

/** 10 の n 乗（BigInt） */
const pow10 = (n: number) => 10n ** BigInt(n);

/** 床関数の割り算（BigInt は 0 方向に丸めるため、負の数を過去側に寄せる） */
function floorDiv(a: bigint, b: bigint): { q: bigint; exact: boolean } {
  const q = a / b;
  const r = a % b;
  if (r === 0n) return { q, exact: true };
  return { q: a < 0n ? q - 1n : q, exact: false };
}

function convertUnix(parsed: ParsedNumber, unit: Exclude<Unit, 'excel'>): ConvertResult {
  const e = UNIT_EXPONENT[unit];
  const k = parsed.fracDigits.length;
  const magnitude = BigInt(parsed.intDigits) * pow10(k) + BigInt(parsed.fracDigits || '0');
  const signed = parsed.negative ? -magnitude : magnitude;
  // 値 = signed / 10^k 単位、1 単位 = 10^(3-e) ミリ秒
  const numerator = signed * pow10(Math.max(0, 3 - e));
  const denominator = pow10(k) * pow10(Math.max(0, e - 3));
  const { q, exact } = floorDiv(numerator, denominator);
  if (q > BigInt(DATE_LIMIT_MS) || q < -BigInt(DATE_LIMIT_MS)) {
    return {
      kind: 'error',
      message: '範囲外です（扱えるのは紀元前約27万年〜西暦275760年。JavaScript の Date の範囲）。',
    };
  }
  const epochMs = Number(q);
  return {
    kind: 'unix',
    unit,
    epochMs,
    truncated: !exact,
    showMs: unit !== 'sec' || k > 0,
    jst: wallClockAt(epochMs, JST_OFFSET_MS),
    utc: wallClockAt(epochMs, 0),
  };
}

/** 1 日に対する割合 → ミリ秒（**秒で四捨五入**。ミリ秒に直してから丸める） */
function fractionToRoundedMs(fraction: number): number {
  const ms = Math.round(fraction * DAY_MS);
  return Math.round(ms / 1000) * 1000;
}

function msToHms(msOfDay: number): string {
  const s = Math.floor(msOfDay / 1000);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/**
 * Excel のシリアル値 → 見たままの日時。
 *
 * 1900 年基準：`1` = 1900-01-01。Excel は 1900 年をうるう年として扱う（Lotus 1-2-3 互換）ので、
 * - `61` 以上は 1899-12-30 を 0 日目として日数を足す
 * - `1〜59` は 1899-12-31 を 0 日目として日数を足す
 * - `60` は「1900-02-29（Excel だけにある日付）」
 *
 * 1904 年基準（Mac の古い Excel）：`0` = 1904-01-01
 */
export function excelSerialToWall(serial: number, base: 1900 | 1904 = 1900): ConvertResult {
  if (!Number.isFinite(serial) || serial < 0) {
    return { kind: 'error', message: 'Excel のシリアル値は 0 以上の数です（負の値は Excel では日付になりません）。' };
  }
  let day = Math.floor(serial);
  let msOfDay = fractionToRoundedMs(serial - day);
  if (msOfDay >= DAY_MS) {
    // 23:59:59.5 以降は翌日の 0:00:00 に繰り上がる
    day += 1;
    msOfDay -= DAY_MS;
  }
  const max = base === 1900 ? EXCEL_MAX_SERIAL : EXCEL_MAX_SERIAL - EXCEL_1904_OFFSET_DAYS;
  if (day > max) {
    return { kind: 'error', message: 'Excel で表せる最後の日（9999年12月31日）を超えています。' };
  }
  let dayMs: number;
  if (base === 1904) {
    dayMs = wallToMs(1904, 1, 1) + day * DAY_MS;
  } else {
    if (day === 0) return { kind: 'excel-time-only', time: msToHms(msOfDay) };
    if (day === EXCEL_PHANTOM_SERIAL) {
      return { kind: 'excel-phantom', base: 1900, time: msToHms(msOfDay) };
    }
    dayMs =
      day >= EXCEL_PHANTOM_SERIAL + 1
        ? wallToMs(1899, 12, 30) + day * DAY_MS
        : wallToMs(1899, 12, 31) + day * DAY_MS;
  }
  return { kind: 'excel', base, wall: wallClockAt(dayMs + msOfDay, 0) };
}

/** 入力の文字列を、指定した読み方（省略時は自動の判定）で日時にする */
export function convertNumber(
  raw: string,
  unit?: Unit,
  options: { excelBase?: 1900 | 1904 } = {},
): { parsed: ParsedNumber; detected: Unit; unit: Unit; result: ConvertResult } | null {
  const parsed = parseNumberInput(raw);
  if (!parsed) return null;
  const detected = detectUnit(parsed);
  const use = unit ?? detected;
  const result =
    use === 'excel'
      ? excelSerialToWall(parsed.value, options.excelBase ?? 1900)
      : convertUnix(parsed, use);
  return { parsed, detected, unit: use, result };
}

// ---------------------------------------------------------------------------
// 補足の一言
// ---------------------------------------------------------------------------

/** 2038 年問題の一言。UNIX時間（秒）が 2147483647 の前後 1 日なら返す */
export function y2038Note(epochMs: number): string | null {
  const seconds = Math.floor(epochMs / 1000);
  const diff = seconds - Y2038_LAST_SECOND;
  if (Math.abs(diff) > Y2038_NEAR_SECONDS) return null;
  if (diff === 0) {
    return '32 ビットの符号付き整数で表せる最後の秒です（2038年問題）。1 秒後は 32 ビットの環境では -2147483648（1901年12月13日）に戻ります。';
  }
  if (diff < 0) {
    return `32 ビットの符号付き整数で表せる最後の秒（2147483647 = 2038年1月19日 12:14:07 日本時間）の ${(-diff).toLocaleString('ja-JP')} 秒前です（2038年問題）。`;
  }
  return `32 ビットの符号付き整数で表せる最後の秒（2147483647）を ${diff.toLocaleString('ja-JP')} 秒超えています。32 ビットで時刻を持つ環境では正しく扱えません（2038年問題）。`;
}

/** 「いまから◯日前／後」。nowMs はマウント後にだけ渡す（ビルド時刻を焼かないため） */
export function formatRelative(targetMs: number, nowMs: number): string {
  const diff = targetMs - nowMs;
  const abs = Math.abs(diff);
  const suffix = diff < 0 ? '前' : '後';
  if (abs < 1000) return 'いま';
  if (abs < 60_000) return `${Math.floor(abs / 1000)}秒${suffix}`;
  if (abs < 3_600_000) return `${Math.floor(abs / 60_000)}分${suffix}`;
  if (abs < DAY_MS) return `${Math.floor(abs / 3_600_000)}時間${suffix}`;
  return `${Math.floor(abs / DAY_MS).toLocaleString('ja-JP')}日${suffix}`;
}

// ---------------------------------------------------------------------------
// 日時 → 数字
// ---------------------------------------------------------------------------

export type Zone = 'jst' | 'utc';

export interface ToNumbersResult {
  seconds: number;
  milliseconds: number;
  /** Excel のシリアル値（1900 年基準）。表せないときは null で、理由は excelError */
  excel: number | null;
  excelError: string | null;
  iso: string;
}

/**
 * 日付（'YYYY-MM-DD'）と時刻（'HH:MM' か 'HH:MM:SS'）→ UNIX時間・ミリ秒・Excel のシリアル値・ISO 8601。
 * **Excel のシリアル値はタイムゾーンの切り替えに関わらず、入力した見たままの日時から出す**
 */
export function dateTimeToNumbers(date: string, time: string, zone: Zone): ToNumbersResult | null {
  const dm = /^(\d{4,6})-(\d{2})-(\d{2})$/.exec(date.trim());
  const tm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec((time || '00:00').trim());
  if (!dm || !tm) return null;
  const [year, month, day] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
  const [hour, minute, second] = [Number(tm[1]), Number(tm[2]), Number(tm[3] ?? '0')];
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return null;
  const wallMs = wallToMs(year, month, day, hour, minute, second);
  const check = wallClockAt(wallMs, 0);
  if (check.month !== month || check.day !== day) return null; // 2月30日など

  const offset = zone === 'jst' ? JST_OFFSET_MS : 0;
  const milliseconds = wallMs - offset;
  const w = wallClockAt(milliseconds, offset);
  return {
    seconds: Math.floor(milliseconds / 1000),
    milliseconds,
    ...wallToExcelSerial(wallMs),
    iso: formatIso(w, false, zone === 'jst' ? '+09:00' : 'Z'),
  };
}

/** 見たままの日時（UTC として読んだミリ秒）→ Excel のシリアル値（1900 年基準） */
export function wallToExcelSerial(wallMs: number): { excel: number | null; excelError: string | null } {
  if (wallMs < wallToMs(1900, 1, 1)) {
    return { excel: null, excelError: '1900年1月1日より前は Excel では表せません。' };
  }
  if (wallMs >= wallToMs(10000, 1, 1)) {
    return { excel: null, excelError: 'Excel で表せる最後の日（9999年12月31日）を超えています。' };
  }
  // 1900-03-01 より前は 1899-12-31 が 0 日目（60 の欠番を飛ばす前の側）
  const zero = wallMs < wallToMs(1900, 3, 1) ? wallToMs(1899, 12, 31) : wallToMs(1899, 12, 30);
  const days = (wallMs - zero) / DAY_MS;
  return { excel: Number(days.toFixed(10)), excelError: null };
}

/** シリアル値の表示（小数は 10 桁まで、末尾の 0 は落とす） */
export function formatSerial(serial: number): string {
  return String(Number(serial.toFixed(10)));
}

// ---------------------------------------------------------------------------
// ログ欄
// ---------------------------------------------------------------------------

/**
 * 行中の 10 桁・13 桁の数字。前後が数字・英字でなく、
 * 直前が小数点・ハイフン・スラッシュでなく、先頭が 0 でないもの
 */
const LOG_PATTERN = /(?<![0-9A-Za-z./-])([1-9]\d{9}|[1-9]\d{12})(?![0-9A-Za-z])/g;

export interface LogResult {
  ok: true;
  output: string;
  count: number;
}

export interface LogError {
  ok: false;
  message: string;
}

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * ログの中の時刻に日本時間を添える。**元の文字は一切変えない（追記だけ）**。
 * 読んだ結果が 2000-01-01〜2100-12-31（UTC）に入るものだけ添える。Excel のシリアル値は拾わない
 */
export function annotateLog(text: string): LogResult | LogError {
  if (utf8Bytes(text) > LOG_MAX_BYTES) {
    return {
      ok: false,
      message: `大きすぎます（上限 1MB）。ブラウザが固まるのを避けるため処理しません。必要な部分だけを貼ってください。`,
    };
  }
  let count = 0;
  const output = text.replace(LOG_PATTERN, (digits: string) => {
    const isMs = digits.length === 13;
    const epochMs = isMs ? Number(digits) : Number(digits) * 1000;
    if (epochMs < LOG_RANGE_FROM_MS || epochMs >= LOG_RANGE_UNTIL_MS) return digits;
    count += 1;
    const jst = wallClockAt(epochMs, JST_OFFSET_MS);
    return `${digits}［${formatYmd(jst)} ${formatHms(jst, isMs)} JST］`;
  });
  return { ok: true, output, count };
}
