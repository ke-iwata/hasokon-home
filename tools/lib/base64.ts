/**
 * Base64 エンコード・デコードの純関数。
 *
 * 仕様: docs/features/base64-henkan.md
 *
 * - **`atob()` / `btoa()` を使わない。** どちらも Latin-1 しか扱えず、日本語で例外か文字化けになる。
 *   Base64 ⇔ バイト列（`Uint8Array`）は自前の表で変換し、文字との間は `TextDecoder` / `TextEncoder` で行う
 * - 文字コードの判別・採点は `lib/charset-guess.ts`（URLデコードと共有）。**判別の式をここに書かない**
 * - 通信しない。DOM・React に依存しない
 */

import {
  CHARSET_LABELS,
  CHARSET_TRACK,
  decoder,
  guessCharsetOfBytes,
  type Charset,
  type CharsetGuess,
} from './charset-guess';
import { INVISIBLE_CHARS } from './invisible-chars';
import { MAX_AUTO_CHARS } from './url-decode';
import { JST_OFFSET_MS, formatJa, wallClockAt } from './unix-jikan';

export { CHARSET_LABELS, MAX_AUTO_CHARS };
export type { Charset, CharsetGuess };

// ---------------------------------------------------------------------------
// 上限
// ---------------------------------------------------------------------------

/** 入力が止まってから変換するまで（ms） */
export const DEBOUNCE_MS = 200;
/** 貼り付けで受ける上限（5MB のファイルの data URI ≒ 約 700 万文字が入る大きさ） */
export const MAX_PASTE_CHARS = 8_000_000;
/** エンコードするファイルの上限（それ以上は画面が固まるため断る） */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export type InputSizeMode = 'auto' | 'button' | 'too-large';

/** 入力の長さで、自動で変換するか・ボタンにするか・断るかを決める（デコード・エンコードの両方に効く） */
export function inputSizeMode(length: number): InputSizeMode {
  if (length > MAX_PASTE_CHARS) return 'too-large';
  if (length > MAX_AUTO_CHARS) return 'button';
  return 'auto';
}

export const TOO_LARGE_MESSAGE = `大きすぎます（貼り付けは ${MAX_PASTE_CHARS.toLocaleString('ja-JP')} 文字まで）`;
export const NEEDS_BUTTON_MESSAGE = '長いので『変換』を押してください';

// ---------------------------------------------------------------------------
// Base64 ⇔ バイト列
// ---------------------------------------------------------------------------

const STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const URL_SAFE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** 文字 → 6ビットの値。標準（+/）と base64url（-_）の両方を受ける */
const VALUE = new Map<string, number>();
for (let i = 0; i < 64; i++) {
  VALUE.set(STD[i], i);
  VALUE.set(URL_SAFE[i], i);
}

export type Base64Variant = 'base64' | 'base64url';

export type DecodeBytesResult =
  | {
      ok: true;
      bytes: Uint8Array;
      /** 補った `=` の数（標準 Base64 で末尾の `=` が欠けていたとき） */
      padded: number;
      variant: Base64Variant;
    }
  | {
      ok: false;
      message: string;
      /** 不正な文字の位置（入力の何文字目。1 始まり）。長さの問題なら undefined */
      position?: number;
    };

/** 空白・改行（76 文字ごとの折り返しなど。RFC 2045）を数えない */
const isSpace = (ch: string) => /\s/.test(ch);

/**
 * Base64（標準・base64url のどちらも）をバイト列に戻す。
 * 空白・改行は読み飛ばす。不正な文字は**入力の何文字目か**を返す
 */
export function base64ToBytes(input: string): DecodeBytesResult {
  const values: number[] = [];
  let pad = 0;
  let padStart = -1;
  let hasStd = false;
  let hasUrl = false;
  let pos = 0;
  for (const ch of input) {
    pos += 1;
    if (isSpace(ch)) continue;
    if (ch === '=') {
      if (pad === 0) padStart = pos;
      pad += 1;
      continue;
    }
    const v = VALUE.get(ch);
    if (v === undefined || pad > 0) {
      const shown = pad > 0 && v !== undefined ? '=' : ch;
      const at = pad > 0 && v !== undefined ? padStart : pos;
      return {
        ok: false,
        message:
          pad > 0 && v !== undefined
            ? `${at}文字目の「=」より後ろに文字があります（= は末尾にだけ付きます）`
            : `${at}文字目の「${printable(shown)}」は Base64 に使えない文字です`,
        position: at,
      };
    }
    if (ch === '+' || ch === '/') hasStd = true;
    if (ch === '-' || ch === '_') hasUrl = true;
    values.push(v);
  }
  if (hasStd && hasUrl) {
    return { ok: false, message: '標準 Base64 の「+ /」と base64url の「- _」が混ざっています' };
  }
  const rest = values.length % 4;
  if (rest === 1) {
    return { ok: false, message: `長さが合いません（Base64 の文字が ${values.length} 文字で、最後の1文字が余っています）` };
  }
  const expectedPad = rest === 0 ? 0 : 4 - rest;
  if (pad > expectedPad) {
    return { ok: false, message: `末尾の「=」が多すぎます（${pad} 個。この長さなら ${expectedPad} 個）`, position: padStart };
  }
  const out = new Uint8Array(Math.floor((values.length * 6) / 8));
  let o = 0;
  for (let i = 0; i < values.length; i += 4) {
    const a = values[i];
    const b = values[i + 1];
    const c = values[i + 2] ?? 0;
    const d = values[i + 3] ?? 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    out[o++] = (n >> 16) & 0xff;
    if (i + 2 < values.length) out[o++] = (n >> 8) & 0xff;
    if (i + 3 < values.length) out[o++] = n & 0xff;
  }
  const variant: Base64Variant = hasUrl ? 'base64url' : 'base64';
  // base64url は `=` を付けないのが普通なので「補った」とは言わない
  const padded = variant === 'base64' && pad < expectedPad ? expectedPad - pad : 0;
  return { ok: true, bytes: out, padded, variant };
}

export type EncodeFormat = 'base64' | 'base64url' | 'mime76';

export const ENCODE_FORMAT_LABELS: Record<EncodeFormat, string> = {
  base64: '標準 Base64',
  base64url: 'base64url（= 無し）',
  mime76: '76 文字で折り返す（メール本文用）',
};

/** バイト列 → Base64 */
export function bytesToBase64(bytes: ArrayLike<number>, format: EncodeFormat = 'base64'): string {
  const table = format === 'base64url' ? URL_SAFE : STD;
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += table[(n >> 18) & 63] + table[(n >> 12) & 63];
    out += i + 1 < bytes.length ? table[(n >> 6) & 63] : format === 'base64url' ? '' : '=';
    out += i + 2 < bytes.length ? table[n & 63] : format === 'base64url' ? '' : '=';
  }
  if (format === 'mime76') return (out.match(/.{1,76}/g) ?? []).join('\n');
  return out;
}

const utf8Encoder = new TextEncoder();

/** 改行を CRLF にそろえる（すでに CRLF のところは二重にしない） */
export function toCrlf(text: string): string {
  return text.replace(/\r?\n/g, '\r\n');
}

/**
 * 文字を UTF-8 のバイト列にしてから Base64 にする。
 * 入力の改行は**そのまま**（`\r\n` を勝手に変えない）。crlf のときだけ CRLF にそろえる
 */
export function encodeText(text: string, opts: { format?: EncodeFormat; crlf?: boolean } = {}): { output: string; bytes: number } {
  const src = opts.crlf ? toCrlf(text) : text;
  const bytes = utf8Encoder.encode(src);
  return { output: bytesToBase64(bytes, opts.format ?? 'base64'), bytes: bytes.length };
}

/** `data:<type>;base64,<…>` */
export function toDataUri(bytes: ArrayLike<number>, mime: string): string {
  return `data:${mime || 'application/octet-stream'};base64,${bytesToBase64(bytes, 'base64')}`;
}

// ---------------------------------------------------------------------------
// 判定
// ---------------------------------------------------------------------------

export type Format = 'base64' | 'base64url' | 'mime' | 'jwt' | 'datauri' | 'encode';

export const FORMAT_LABELS: Record<Format, string> = {
  base64: '標準 Base64',
  base64url: 'base64url',
  mime: 'メールの MIME エンコード（encoded-word）',
  jwt: 'JWT',
  datauri: 'data: URI',
  encode: 'ふつうの文字',
};

const ENCODED_WORD_RE = /=\?([^?\s]+)\?([BbQq])\?([^?\s]*)\?=/g;
const JWT_RE = /^eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;
const DATA_URI_RE = /^data:([^,;]*)((?:;[^,;]*)*);base64,/i;
const STD_ONLY_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const URL_ONLY_RE = /^[A-Za-z0-9_-]+={0,2}$/;

export interface Detection {
  format: Format;
  /** 画面に出す「◯◯として読みました」 */
  reason: string;
  /** 英数字だけで、Base64 とも、ふつうの言葉とも読める（判定 7） */
  plainAlnum: boolean;
}

/** 前後の空白・改行・行の中の折り返しを取り除いた形 */
export function compact(input: string): string {
  return input.replace(/\s+/g, '');
}

/** 貼った中身から向きと形式を決める（判定の約束 1〜6） */
export function detect(input: string): Detection | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const make = (format: Format, plainAlnum = false): Detection => ({
    format,
    reason: format === 'encode' ? 'Base64 ではないので、エンコードしました' : `${FORMAT_LABELS[format]}として読みました`,
    plainAlnum,
  });
  ENCODED_WORD_RE.lastIndex = 0;
  if (ENCODED_WORD_RE.test(trimmed)) return make('mime');
  const c = compact(trimmed);
  if (JWT_RE.test(c)) return make('jwt');
  if (DATA_URI_RE.test(c)) return make('datauri');
  const body = c.replace(/=+$/, '');
  const rest = body.length % 4;
  if (STD_ONLY_RE.test(c) && rest !== 1) {
    const plainAlnum = /^[A-Za-z0-9]+$/.test(c);
    // 英数字だけで長さが 4 の倍数でないもの（hello など）は言葉として扱う。+ / = があれば Base64
    if (c.length % 4 === 0 || !plainAlnum) return make('base64', plainAlnum);
  }
  if (URL_ONLY_RE.test(c) && /[-_]/.test(c) && rest !== 1) return make('base64url');
  return make('encode');
}

// ---------------------------------------------------------------------------
// バイト列 → 文字
// ---------------------------------------------------------------------------

/** 先頭のバイトから推定したファイルの種類 */
export interface Sniffed {
  label: string;
  mime: string;
  ext: string;
}

const MAGIC: readonly { bytes: (number | null)[]; sniffed: Sniffed }[] = [
  { bytes: [0x25, 0x50, 0x44, 0x46], sniffed: { label: 'PDF', mime: 'application/pdf', ext: 'pdf' } },
  { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], sniffed: { label: 'PNG 画像', mime: 'image/png', ext: 'png' } },
  { bytes: [0xff, 0xd8, 0xff], sniffed: { label: 'JPEG 画像', mime: 'image/jpeg', ext: 'jpg' } },
  { bytes: [0x47, 0x49, 0x46, 0x38], sniffed: { label: 'GIF 画像', mime: 'image/gif', ext: 'gif' } },
  {
    bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50],
    sniffed: { label: 'WebP 画像', mime: 'image/webp', ext: 'webp' },
  },
  { bytes: [0x50, 0x4b, 0x03, 0x04], sniffed: { label: 'ZIP（Word・Excel の .docx・.xlsx も）', mime: 'application/zip', ext: 'zip' } },
  { bytes: [0x1f, 0x8b], sniffed: { label: 'gzip', mime: 'application/gzip', ext: 'gz' } },
];

/** 先頭のバイトから種類を推定する（`%PDF` → PDF など）。分からなければ null */
export function sniff(bytes: ArrayLike<number>): Sniffed | null {
  for (const m of MAGIC) {
    if (bytes.length < m.bytes.length) continue;
    if (m.bytes.every((b, i) => b === null || bytes[i] === b)) return m.sniffed;
  }
  return null;
}

/** 改行・タブ以外の制御文字 */
const isControl = (cp: number) => (cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) || (cp >= 0x7f && cp < 0xa0);

/** 文字として読めたか（制御文字が多い・読めないバイトが混ざるものは文字にしない） */
function readable(text: string): boolean {
  let control = 0;
  let count = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    count += 1;
    if (cp === 0 || cp === 0xfffd) return false;
    if (isControl(cp)) control += 1;
  }
  return count === 0 || control / count < 0.1;
}

export interface Segment {
  text: string;
  /** 見えない文字の呼び名（印を付けて描く） */
  invisible?: string;
  /** 画面に出す印 */
  mark?: string;
}

const INVISIBLE_MARKED = new Map(
  INVISIBLE_CHARS.filter((c) => c.char !== '\t' && c.char !== '　').map((c) => [c.char, c] as const),
);

/** 見えない文字（ゼロ幅スペース・BOM・制御文字）に印を付ける（デコードの約束 9） */
export function markInvisible(text: string): Segment[] {
  const out: Segment[] = [];
  let plain = '';
  const flush = () => {
    if (plain) out.push({ text: plain });
    plain = '';
  };
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const known = INVISIBLE_MARKED.get(ch);
    if (known) {
      flush();
      out.push({ text: ch, invisible: known.name, mark: known.mark });
    } else if (isControl(cp)) {
      flush();
      const hex = cp.toString(16).toUpperCase().padStart(2, '0');
      out.push({ text: ch, invisible: `制御文字（U+00${hex}）`, mark: `[${hex}]` });
    } else plain += ch;
  }
  flush();
  return out;
}

export interface TextOutput {
  kind: 'text';
  text: string;
  segments: Segment[];
  charset: Charset;
  guess: CharsetGuess;
  /** 見えない文字の呼び名（重複なし） */
  invisibles: string[];
}

export interface BinaryOutput {
  kind: 'binary';
  sniffed: Sniffed | null;
}

/**
 * バイト列を文字にする。charset を渡さなければ自動で判別する。
 * 文字にならない（PDF・ZIP・制御文字だらけ）ものは binary を返す
 */
export function bytesToText(bytes: Uint8Array, charset?: Charset): TextOutput | BinaryOutput {
  const guess = guessCharsetOfBytes(bytes);
  const sniffed = sniff(bytes);
  if (!charset && sniffed) return { kind: 'binary', sniffed };
  const cs = charset ?? guess.charset;
  if (!charset && guess.unreadable) return { kind: 'binary', sniffed: null };
  // ignoreBOM：先頭の BOM を黙って消さず、印を付ける
  const text = decoder(cs, false).decode(bytes);
  if (!charset && !readable(text)) return { kind: 'binary', sniffed: null };
  const segments = markInvisible(text);
  const invisibles = [...new Set(segments.filter((s) => s.invisible).map((s) => s.invisible!))];
  return { kind: 'text', text, segments, charset: cs, guess, invisibles };
}

/**
 * 英数字だけの短い入力（test・abcd）をデコードした結果が、意味のある文字か（判定 7）。
 * UTF-8（か ISO-2022-JP）として読めて見えない文字が無い、なら意味がある
 */
export function looksMeaningful(bytes: Uint8Array): boolean {
  if (sniff(bytes)) return true;
  const out = bytesToText(bytes);
  if (out.kind !== 'text') return false;
  if (out.invisibles.length > 0) return false;
  // Shift_JIS・EUC-JP は2〜3バイトの偶然でも「読めて」しまう（test → EUC-JP の「給-」）ので、
  // 短い英数字では意味があるとみなさない（両方を並べるだけなので、本当に Shift_JIS でも結果は見える）
  return out.guess.asciiOnly || out.charset === 'utf-8' || out.charset === 'iso-2022-jp';
}

// ---------------------------------------------------------------------------
// MIME encoded-word（RFC 2047）
// ---------------------------------------------------------------------------

/** encoded-word の charset 名 → TextDecoder に渡す名前。大文字小文字は区別しない */
function normalizeCharset(name: string): string {
  // RFC 2231 の言語の指定（UTF-8*ja）は外す
  const n = name.split('*')[0].toLowerCase();
  if (n === 'utf8') return 'utf-8';
  if (['sjis', 'x-sjis', 'shift-jis', 'cp932', 'windows-31j', 'ms_kanji'].includes(n)) return 'shift_jis';
  return n;
}

function makeDecoder(label: string): TextDecoder | null {
  try {
    return new TextDecoder(label, { ignoreBOM: true });
  } catch {
    return null;
  }
}

/** Q エンコード：`_` を空白、`=XX` を1バイトとして読む（RFC 2047 4.2） */
export function qDecode(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '_') out.push(0x20);
    else if (ch === '=' && /^[0-9A-Fa-f]{2}$/.test(text.slice(i + 1, i + 3))) {
      out.push(parseInt(text.slice(i + 1, i + 3), 16));
      i += 2;
    } else out.push(ch.charCodeAt(0) & 0xff);
  }
  return Uint8Array.from(out);
}

export interface MimeResult {
  kind: 'mime';
  text: string;
  segments: Segment[];
  /** 使われていた charset（表示用。重複なし） */
  charsets: string[];
  /** 読めなかった encoded-word の説明 */
  problems: string[];
}

/**
 * `=?charset?B?…?=`・`=?charset?Q?…?=` をほどく。
 * - 隣り合う encoded-word の間の空白は詰める（RFC 2047 6.2）。ふつうの文字との間の空白は残す
 * - 同じ charset が続くときはバイト列をつないでから読む（1文字が2つの word に割れていても化けない）
 */
export function decodeMime(input: string): MimeResult {
  type Word = { charset: string; bytes: Uint8Array | null; raw: string };
  const parts: (Word | string)[] = [];
  let last = 0;
  ENCODED_WORD_RE.lastIndex = 0;
  for (const m of input.matchAll(ENCODED_WORD_RE)) {
    const between = input.slice(last, m.index);
    const prev = parts[parts.length - 1];
    // 直前が encoded-word で、間が空白だけなら詰める
    if (!(prev !== undefined && typeof prev !== 'string' && /^\s*$/.test(between))) {
      if (between) parts.push(between);
    }
    const charset = normalizeCharset(m[1]);
    let bytes: Uint8Array | null;
    if (m[2] === 'B' || m[2] === 'b') {
      const r = base64ToBytes(m[3]);
      bytes = r.ok ? r.bytes : null;
    } else bytes = qDecode(m[3]);
    parts.push({ charset, bytes, raw: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < input.length) parts.push(input.slice(last));

  const problems: string[] = [];
  const charsets: string[] = [];
  let text = '';
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (typeof p === 'string') {
      text += p;
      continue;
    }
    // 同じ charset の続きをまとめる
    const chunks: Uint8Array[] = [];
    let j = i;
    let broken: Word | null = null;
    while (j < parts.length) {
      const q = parts[j];
      if (typeof q === 'string' || q.charset !== p.charset) break;
      if (!q.bytes) {
        broken = q;
        break;
      }
      chunks.push(q.bytes);
      j += 1;
    }
    if (chunks.length > 0) {
      const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let o = 0;
      for (const c of chunks) {
        all.set(c, o);
        o += c.length;
      }
      const d = makeDecoder(p.charset);
      if (d) text += d.decode(all);
      else {
        problems.push(`文字コード「${p.charset}」は読めないので、UTF-8 として読みました`);
        text += decoder('utf-8', false).decode(all);
      }
      if (!charsets.includes(p.charset)) charsets.push(p.charset);
    }
    if (broken) {
      problems.push(`「${broken.raw.slice(0, 40)}」の Base64 が壊れているので、そのまま残しました`);
      text += broken.raw;
      j += 1;
    }
    i = j - 1;
  }
  const segments = markInvisible(text);
  return { kind: 'mime', text, segments, charsets: charsets.map(charsetLabel), problems };
}

function charsetLabel(name: string): string {
  const known: Record<string, string> = { 'utf-8': 'UTF-8', shift_jis: 'Shift_JIS', 'euc-jp': 'EUC-JP', 'iso-2022-jp': 'ISO-2022-JP' };
  return known[name] ?? name.toUpperCase();
}

// ---------------------------------------------------------------------------
// JWT（RFC 7519）
// ---------------------------------------------------------------------------

/** 結果の上に必ず出す（デコードの約束 5） */
export const JWT_SIGNATURE_NOTE = '署名は検証していません。中身が読めても、本物のトークンとは限りません';

/** 日本時間に直して並べる時刻のクレーム */
export const JWT_TIME_CLAIMS = ['exp', 'iat', 'nbf'] as const;

const JWT_TIME_LABELS: Record<(typeof JWT_TIME_CLAIMS)[number], string> = {
  exp: '有効期限（exp）',
  iat: '発行（iat）',
  nbf: '使い始め（nbf）',
};

export interface JwtTime {
  claim: (typeof JWT_TIME_CLAIMS)[number];
  label: string;
  seconds: number;
  /** '2026年11月12日（木） 09:00:00'（日本時間） */
  jst: string;
  /** exp だけ。「期限切れ」／「あと◯時間◯分」。nowMs が無ければ null */
  remaining: string | null;
}

export interface JwtResult {
  kind: 'jwt';
  headerJson: string | null;
  payloadJson: string | null;
  /** header・payload が JSON として読めなかったときの説明 */
  problems: string[];
  times: JwtTime[];
  alg: string | null;
  hasSignature: boolean;
}

/** exp の残り。期限を過ぎていれば「期限切れ」 */
export function expiryNote(expSeconds: number, nowMs: number): string {
  const diff = expSeconds * 1000 - nowMs;
  if (diff <= 0) return '期限切れ';
  const minutes = Math.floor(diff / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `あと${days.toLocaleString('ja-JP')}日${hours}時間`;
  if (hours > 0) return `あと${hours}時間${mins}分`;
  if (mins > 0) return `あと${mins}分`;
  return 'あと1分未満';
}

function partToJson(part: string, name: string, problems: string[]): Record<string, unknown> | null {
  const r = base64ToBytes(part);
  if (!r.ok) {
    problems.push(`${name}の base64url が壊れています（${r.message}）`);
    return null;
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(r.bytes);
  } catch {
    problems.push(`${name}が UTF-8 の文字になりません`);
    return null;
  }
  try {
    const v = JSON.parse(text);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
    problems.push(`${name}が JSON のオブジェクトではありません`);
  } catch {
    problems.push(`${name}が JSON として読めません`);
  }
  return null;
}

/** header と payload を base64url でデコードし、JSON として整形する。署名は検証しない */
export function decodeJwt(input: string, nowMs: number | null = null): JwtResult {
  const [h = '', p = '', s = ''] = compact(input).split('.');
  const problems: string[] = [];
  const header = partToJson(h, 'ヘッダー', problems);
  const payload = partToJson(p, 'ペイロード', problems);
  const times: JwtTime[] = [];
  if (payload) {
    for (const claim of JWT_TIME_CLAIMS) {
      const v = payload[claim];
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      const ms = v * 1000;
      if (Math.abs(ms) > 8.64e15) continue;
      times.push({
        claim,
        label: JWT_TIME_LABELS[claim],
        seconds: v,
        jst: formatJa(wallClockAt(ms, JST_OFFSET_MS)),
        remaining: claim === 'exp' && nowMs !== null ? expiryNote(v, nowMs) : null,
      });
    }
  }
  return {
    kind: 'jwt',
    headerJson: header ? JSON.stringify(header, null, 2) : null,
    payloadJson: payload ? JSON.stringify(payload, null, 2) : null,
    problems,
    times,
    alg: header && typeof header.alg === 'string' ? header.alg : null,
    hasSignature: s.length > 0,
  };
}

// ---------------------------------------------------------------------------
// data: URI
// ---------------------------------------------------------------------------

/** `<img>` でプレビューしてよい種類。SVG も `<img>` だけで描く（スクリプトが動かない） */
export const PREVIEW_IMAGE_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];

export interface DataUriResult {
  kind: 'datauri';
  mime: string;
  bytes: Uint8Array;
  /** `<img>` でプレビューしてよいか（画像でないものはプレビューしない） */
  previewable: boolean;
  ext: string;
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/html': 'html',
  'application/json': 'json',
  'application/zip': 'zip',
};

export function extFor(mime: string): string {
  return EXT_BY_MIME[mime] ?? 'bin';
}

export function parseDataUri(input: string): DataUriResult | { kind: 'error'; message: string; position?: number } {
  const c = compact(input);
  const m = DATA_URI_RE.exec(c);
  if (!m) return { kind: 'error', message: 'data: URI の形になっていません' };
  const mime = (m[1] || 'text/plain').toLowerCase();
  const r = base64ToBytes(c.slice(m[0].length));
  if (!r.ok) return { kind: 'error', message: r.message };
  return { kind: 'datauri', mime, bytes: r.bytes, previewable: PREVIEW_IMAGE_TYPES.includes(mime), ext: extFor(mime) };
}

// ---------------------------------------------------------------------------
// 画面から呼ぶまとめの関数
// ---------------------------------------------------------------------------

export type Mode = 'auto' | 'decode' | 'encode';

export interface ConvertOptions {
  mode?: Mode;
  /** デコードの文字コードを手で選んだとき */
  charset?: Charset;
  encodeFormat?: EncodeFormat;
  crlf?: boolean;
  /** JWT の「あと◯時間」に使う今の時刻。マウント後にだけ渡す（ビルド時刻を焼かない） */
  nowMs?: number | null;
}

export interface DecodedBase64 {
  kind: 'decoded';
  format: 'base64' | 'base64url';
  bytes: Uint8Array;
  padded: number;
  output: TextOutput | BinaryOutput;
  /** 意味のある文字にならなかった短い英数字（判定 7）。エンコードした結果も並べる */
  alsoEncoded: string | null;
}

export interface EncodedOutput {
  kind: 'encoded';
  output: string;
  bytes: number;
}

export interface ErrorOutput {
  kind: 'error';
  message: string;
  position?: number;
}

export type ConvertResult =
  | { kind: 'empty' }
  | { kind: 'too-large' }
  | DecodedBase64
  | EncodedOutput
  | MimeResult
  | JwtResult
  | DataUriResult
  | ErrorOutput;

/** 入力を判定して変換する（画面が呼ぶ唯一の入口） */
export function convert(input: string, opts: ConvertOptions = {}): ConvertResult & { detection: Detection | null } {
  const mode = opts.mode ?? 'auto';
  const detection = detect(input);
  const done = <T extends ConvertResult>(r: T) => ({ ...r, detection });
  if (input.length > MAX_PASTE_CHARS) return done({ kind: 'too-large' });
  if (!detection) return done({ kind: 'empty' });

  const encode = (): EncodedOutput => ({ kind: 'encoded', ...encodeText(input, { format: opts.encodeFormat, crlf: opts.crlf }) });

  if (mode === 'encode' || (mode === 'auto' && detection.format === 'encode')) return done(encode());

  if (detection.format === 'mime') return done(decodeMime(input.trim()));
  if (detection.format === 'jwt') return done(decodeJwt(input, opts.nowMs ?? null));
  if (detection.format === 'datauri') return done(parseDataUri(input));

  const r = base64ToBytes(input);
  if (!r.ok) return done({ kind: 'error', message: r.message, position: r.position });
  const output = bytesToText(r.bytes, opts.charset);
  const alsoEncoded =
    mode === 'auto' && detection.plainAlnum && !opts.charset && !looksMeaningful(r.bytes) ? encode().output : null;
  return done({ kind: 'decoded', format: r.variant, bytes: r.bytes, padded: r.padded, output, alsoEncoded });
}

// ---------------------------------------------------------------------------
// 保存・計測
// ---------------------------------------------------------------------------

/**
 * 保存用の Blob の種類。中身が text/html・SVG でも、ブラウザに描かせない種類にしておく。
 * 保存は `<a download>` で落とすだけ（新しいタブで開かない・window.open しない。デコードの約束 7）
 */
export const SAVE_BLOB_TYPE = 'application/octet-stream';

/** 計測の帯（中身は送らない） */
export function bytesBand(bytes: number): string {
  if (bytes <= 1024) return 'lte1kb';
  if (bytes <= 100 * 1024) return 'lte100kb';
  return 'lte5mb';
}

/** 計測用の形式の名前（format） */
export function trackFormat(r: ConvertResult): string | null {
  switch (r.kind) {
    case 'decoded':
      return r.format;
    case 'mime':
      return 'mime';
    case 'jwt':
      return 'jwt';
    case 'datauri':
      return 'datauri';
    case 'encoded':
      return 'encode';
    default:
      return null;
  }
}

/** 計測用の文字コードの区分 */
export function trackCharsetOf(r: ConvertResult): string {
  if (r.kind === 'decoded' && r.output.kind === 'text') return CHARSET_TRACK[r.output.charset];
  if (r.kind === 'decoded') return 'binary';
  return r.kind === 'encoded' || r.kind === 'jwt' ? 'utf8' : 'na';
}

/** 1文字を画面に出せる形にする（空白・制御文字は U+XXXX） */
function printable(ch: string): string {
  const cp = ch.codePointAt(0)!;
  if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
  return ch;
}
