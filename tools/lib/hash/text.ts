/**
 * 文字列 → バイト列（ハッシュ値を出す前の形）。
 *
 * 仕様: docs/features/hash-keisan.md「入力」「計算の約束」
 *
 * 同じ見た目の文字列でも、文字コード・BOM・改行コード・末尾の改行でバイト列が変わり、
 * ハッシュ値は全く別になる。ここで決めた順（前後の空白 → 改行コード → 末尾の改行 → 文字コード）で
 * 組み立て、不一致の原因探し（compare.ts）も同じ関数を通す。
 *
 * Shift_JIS の表は `lib/url-decode.ts` の `reverseTable('shift_jis')` を使う
 * （WHATWG の encoder と同じ選び方。同じ表を2つ持たない）。
 */
import { reverseTable } from '@/lib/url-decode';

export type TextCharset = 'utf-8' | 'utf-8-bom' | 'shift_jis';
export type NewlineMode = 'keep' | 'lf' | 'crlf';
/** keep＝そのまま／lf・crlf＝末尾に1つ足す（echo と同じ）／strip＝末尾の改行を外す */
export type TrailingMode = 'keep' | 'lf' | 'crlf' | 'strip';

export const TEXT_CHARSET_LABELS: Record<TextCharset, string> = {
  'utf-8': 'UTF-8',
  'utf-8-bom': 'UTF-8（BOM つき）',
  shift_jis: 'Shift_JIS',
};

export const NEWLINE_LABELS: Record<NewlineMode, string> = {
  keep: 'そのまま',
  lf: 'LF にそろえる',
  crlf: 'CRLF にそろえる',
};

export interface TextOptions {
  charset: TextCharset;
  newline: NewlineMode;
  trailing: TrailingMode;
  trim: boolean;
}

export const DEFAULT_TEXT_OPTIONS: TextOptions = { charset: 'utf-8', newline: 'keep', trailing: 'keep', trim: false };

const utf8 = new TextEncoder();
const BOM = [0xef, 0xbb, 0xbf];

export type EncodeResult =
  | { ok: true; bytes: Uint8Array }
  /** その文字コードに無い文字がある。position は 1 から数えた文字目（コードポイント単位） */
  | { ok: false; position: number; char: string };

/** 改行・空白の加工だけ（文字コードにする前） */
export function shapeText(text: string, opts: Pick<TextOptions, 'newline' | 'trailing' | 'trim'>): string {
  let s = opts.trim ? text.trim() : text;
  if (opts.newline === 'lf') s = s.replace(/\r\n?/g, '\n');
  else if (opts.newline === 'crlf') s = s.replace(/\r\n?|\n/g, '\r\n');
  if (opts.trailing === 'lf') s += '\n';
  else if (opts.trailing === 'crlf') s += '\r\n';
  else if (opts.trailing === 'strip') s = s.replace(/(\r\n|\r|\n)+$/, '');
  return s;
}

/**
 * Shift_JIS のバイト列に。表に無い文字（絵文字・𠮷 など）があれば、最初の1つの位置を返す。
 * ASCII はそのまま 1 バイト（WHATWG の encoder と同じ）。U+2212 − は U+FF0D － と同じに扱う。
 */
export function encodeShiftJis(text: string): EncodeResult {
  const table = reverseTable('shift_jis');
  const out: number[] = [];
  let pos = 0;
  for (const ch of text) {
    pos++;
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) {
      out.push(cp);
      continue;
    }
    const bytes = table.get(cp === 0x2212 ? '－' : ch);
    if (!bytes) return { ok: false, position: pos, char: ch };
    for (const b of bytes) out.push(b);
  }
  return { ok: true, bytes: Uint8Array.from(out) };
}

/** Shift_JIS に無い最初の文字（無ければ null） */
export function firstNonShiftJis(text: string): { position: number; char: string } | null {
  const r = encodeShiftJis(text);
  return r.ok ? null : { position: r.position, char: r.char };
}

export function encodeWith(text: string, charset: TextCharset): EncodeResult {
  if (charset === 'shift_jis') return encodeShiftJis(text);
  const body = utf8.encode(text);
  if (charset === 'utf-8') return { ok: true, bytes: body };
  const out = new Uint8Array(body.length + 3);
  out.set(BOM, 0);
  out.set(body, 3);
  return { ok: true, bytes: out };
}

/** 画面の切り替えどおりにバイト列を作る */
export function textToBytes(text: string, opts: TextOptions): EncodeResult {
  return encodeWith(shapeText(text, opts), opts.charset);
}
