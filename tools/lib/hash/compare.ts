/**
 * 「比べる値」欄の読み取り・一致の判定・不一致の原因探し。
 *
 * 仕様: docs/features/hash-keisan.md「一致の確認」
 *
 * - 貼った値の長さでアルゴリズムを決める（32＝MD5・40＝SHA-1・64＝SHA-256・96＝SHA-384・128＝SHA-512）。
 *   大文字小文字・空白・`:` 区切りは無視。SRI の `sha384-…`（Base64）も受ける
 * - `SHA256SUMS` 形式（`値␣␣ファイル名`／`値␣*ファイル名`）と
 *   BSD 形式（`SHA256 (ファイル名) = 値`。`shasum --tag`・macOS の `sha256`・`openssl dgst`）を読む
 * - 文字列が合わないときは、改行・BOM・文字コード・前後の空白を**有限の一覧**で試して、
 *   当たったものを1つだけ返す（変える箇所が少ない順）
 */
import { DIGEST_BYTES, fromBase64, hashBytes, type Algorithm } from './digest';
import {
  encodeWith,
  firstNonShiftJis,
  shapeText,
  type NewlineMode,
  type TextCharset,
  type TextOptions,
  type TrailingMode,
} from './text';

const BY_HEX_LENGTH: Record<number, Algorithm> = { 32: 'md5', 40: 'sha1', 64: 'sha256', 96: 'sha384', 128: 'sha512' };

/** 16進の桁数 → アルゴリズム */
export function algorithmForHexLength(len: number): Algorithm | null {
  return BY_HEX_LENGTH[len] ?? null;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export interface Expected {
  algorithm: Algorithm;
  bytes: Uint8Array;
}

export interface SumsEntry extends Expected {
  filename: string;
}

export type ParsedExpected =
  | { kind: 'empty' }
  | { kind: 'single'; expected: Expected }
  | { kind: 'list'; entries: SumsEntry[] }
  | { kind: 'invalid'; message: string };

/** 1つの値（16進か SRI）。読めなければ null */
export function parseSingleValue(raw: string): Expected | null {
  const s = raw.trim();
  const sri = /^(sha256|sha384|sha512)-([A-Za-z0-9+/_-]+={0,2})$/i.exec(s);
  if (sri) {
    const algorithm = sri[1].toLowerCase() as Algorithm;
    const bytes = fromBase64(sri[2]);
    if (bytes && bytes.length === DIGEST_BYTES[algorithm]) return { algorithm, bytes };
    return null;
  }
  const hex = s.replace(/[\s:]/g, '');
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
  const algorithm = algorithmForHexLength(hex.length);
  if (!algorithm) return null;
  return { algorithm, bytes: hexToBytes(hex.toLowerCase()) };
}

/** BSD 形式の名前（SHA256・SHA2-256・SHA-256・MD5 …）→ アルゴリズム */
function algorithmFromName(name: string): Algorithm | null {
  const n = name.toUpperCase().replace(/^SHA2-/, 'SHA').replace(/-/g, '');
  const map: Record<string, Algorithm> = { MD5: 'md5', SHA1: 'sha1', SHA256: 'sha256', SHA384: 'sha384', SHA512: 'sha512' };
  return map[n] ?? null;
}

const GNU_LINE = /^\\?([0-9a-fA-F]+) [ *](.+)$/;
const BSD_LINE = /^([A-Za-z0-9-]+) ?\((.+)\) ?= ?([0-9a-fA-F]+)$/;

/** 1行を SHA256SUMS／BSD 形式として読む。読めなければ null */
export function parseSumsLine(line: string): SumsEntry | null {
  const s = line.replace(/\r$/, '').trim();
  const bsd = BSD_LINE.exec(s);
  if (bsd) {
    const algorithm = algorithmFromName(bsd[1]);
    const hex = bsd[3];
    if (!algorithm || hex.length !== DIGEST_BYTES[algorithm] * 2) return null;
    return { algorithm, bytes: hexToBytes(hex.toLowerCase()), filename: bsd[2] };
  }
  const gnu = GNU_LINE.exec(s);
  if (gnu) {
    const algorithm = algorithmForHexLength(gnu[1].length);
    if (!algorithm) return null;
    return { algorithm, bytes: hexToBytes(gnu[1].toLowerCase()), filename: gnu[2] };
  }
  return null;
}

/** 「比べる値」欄を読む */
export function parseExpected(input: string): ParsedExpected {
  const trimmed = input.trim();
  if (!trimmed) return { kind: 'empty' };
  // 1行で「値␣␣ファイル名」として読めるなら一覧の行を優先する。
  // 先に1つの値として読むと、MD5 の行のファイル名が16進8文字（例: `<md5>  deadbeef`）のとき、
  // 空白を除いてつないだ 40 桁を SHA-1 と読み違えるため
  if (!/\r?\n/.test(trimmed)) {
    const line = parseSumsLine(trimmed);
    if (line) return { kind: 'list', entries: [line] };
  }
  const single = parseSingleValue(trimmed);
  if (single) return { kind: 'single', expected: single };
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const entries = lines.map(parseSumsLine).filter((e): e is SumsEntry => e !== null);
  if (entries.length > 0) return { kind: 'list', entries };
  return {
    kind: 'invalid',
    message:
      'ハッシュ値として読めませんでした。16進の 32・40・64・96・128 桁（MD5・SHA-1・SHA-256・SHA-384・SHA-512）か、sha384-… の形、「値␣␣ファイル名」の行を貼ってください。',
  };
}

/** ファイル名で SHA256SUMS の行を探す（パスの前の部分は無視。大文字小文字は区別して、無ければ区別せずに） */
export function findEntry(entries: SumsEntry[], filename: string): SumsEntry[] {
  const base = (p: string) => p.replace(/^.*[\\/]/, '').replace(/^\.\//, '');
  const exact = entries.filter((e) => base(e.filename) === filename);
  if (exact.length) return exact;
  return entries.filter((e) => base(e.filename).toLowerCase() === filename.toLowerCase());
}

// ---------------------------------------------------------------------------
// 不一致の原因探し（文字列タブ）
// ---------------------------------------------------------------------------

export type HintKind = 'trailing-newline' | 'crlf' | 'bom' | 'sjis' | 'trim';

export interface Hint {
  options: TextOptions;
  /** 変えた箇所（変える箇所が少ない順に選ばれる） */
  kinds: HintKind[];
  /** 画面に出す文。例：「末尾に改行を1つ足すと一致します」 */
  message: string;
  /** 補足（echo の案内など） */
  note?: string;
}

const TRAILING: TrailingMode[] = ['keep', 'lf', 'crlf', 'strip'];
const NEWLINES: NewlineMode[] = ['keep', 'lf', 'crlf'];
const CHARSETS: TextCharset[] = ['utf-8', 'utf-8-bom', 'shift_jis'];

/**
 * 試す組み合わせの一覧（固定）。末尾の改行4 × 改行コード3 × 文字コード（UTF-8／BOMつき／Shift_JIS）3 × 前後の空白2
 * ＝ 72 通り（BOM は UTF-8 のときだけなので、仕様の上限 96 通りに収まる）
 */
export function candidateOptions(): TextOptions[] {
  const list: TextOptions[] = [];
  for (const trim of [false, true])
    for (const charset of CHARSETS)
      for (const newline of NEWLINES)
        for (const trailing of TRAILING) list.push({ charset, newline, trailing, trim });
  return list;
}

function changedKinds(from: TextOptions, to: TextOptions): HintKind[] {
  const kinds: HintKind[] = [];
  if (from.trailing !== to.trailing) kinds.push('trailing-newline');
  if (from.newline !== to.newline) kinds.push('crlf');
  const fromSjis = from.charset === 'shift_jis';
  const toSjis = to.charset === 'shift_jis';
  if (fromSjis !== toSjis) kinds.push('sjis');
  else if (from.charset !== to.charset) kinds.push('bom');
  if (from.trim !== to.trim) kinds.push('trim');
  return kinds;
}

/** 変える箇所の数（文字コードを UTF-8 BOM つき ⇔ Shift_JIS に変えるのは BOM と文字コードの2つ） */
function cost(from: TextOptions, to: TextOptions): number {
  let n = changedKinds(from, to).length;
  if ((from.charset === 'utf-8-bom' && to.charset === 'shift_jis') || (from.charset === 'shift_jis' && to.charset === 'utf-8-bom')) n++;
  return n;
}

function describe(from: TextOptions, to: TextOptions): { parts: string[]; note?: string } {
  const parts: string[] = [];
  let note: string | undefined;
  if (from.trailing !== to.trailing) {
    if (to.trailing === 'lf') {
      parts.push('末尾に改行を1つ足す');
      note = 'echo で作った値ではありませんか？ echo は末尾に改行を足します。echo -n（PowerShell では -NoNewline）を使うと改行が入りません。';
    } else if (to.trailing === 'crlf') parts.push('末尾に改行（CRLF）を1つ足す');
    else if (to.trailing === 'strip') parts.push('末尾の改行を外す');
    else parts.push('「末尾の改行」の加工をやめる');
  }
  if (from.newline !== to.newline) {
    if (to.newline === 'lf') parts.push('改行を LF（Mac・Linux の改行）にそろえる');
    else if (to.newline === 'crlf') parts.push('改行を CRLF（Windows の改行）にそろえる');
    else parts.push('改行コードをそのままにする');
  }
  if (from.charset !== to.charset) {
    if (to.charset === 'shift_jis') parts.push('文字コードを Shift_JIS にする');
    else if (from.charset === 'shift_jis') parts.push(to.charset === 'utf-8' ? '文字コードを UTF-8 にする' : '文字コードを UTF-8（BOM つき）にする');
    else if (to.charset === 'utf-8-bom') parts.push('先頭に BOM を付ける');
    else parts.push('先頭の BOM を外す');
  }
  if (from.trim !== to.trim) parts.push(to.trim ? '前後の空白・改行を外す' : '前後の空白を外さない');
  return { parts, note };
}

/** 原因探しをする文字列の長さの上限（72 通り計算するので、長すぎる文字列では試さない） */
export const HINT_MAX_CHARS = 200_000;

/**
 * 今の切り替え（current）で合わなかったとき、ほかの組み合わせを試して当たったものを1つ返す。
 * 比べるのは expected のアルゴリズムだけ。Shift_JIS に無い文字があれば Shift_JIS は候補から外す。
 */
export function findHint(text: string, current: TextOptions, expected: Expected): Hint | null {
  if (text.length > HINT_MAX_CHARS) return null;
  const sjisOk = firstNonShiftJis(text) === null;
  let best: { options: TextOptions; cost: number } | null = null;
  for (const options of candidateOptions()) {
    if (options.charset === 'shift_jis' && !sjisOk) continue;
    const c = cost(current, options);
    if (c === 0) continue;
    if (best && c >= best.cost) continue;
    const enc = encodeWith(shapeText(text, options), options.charset);
    if (!enc.ok) continue;
    if (bytesEqual(hashBytes(expected.algorithm, enc.bytes), expected.bytes)) best = { options, cost: c };
  }
  if (!best) return null;
  const { parts, note } = describe(current, best.options);
  return {
    options: best.options,
    kinds: changedKinds(current, best.options),
    message: `${parts.join('、')}と一致します`,
    note,
  };
}
