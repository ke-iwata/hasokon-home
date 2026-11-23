/**
 * 貼った色の文字列を読む（形式は自動で判定する）。純関数のみ。
 *
 * 読める形：
 * - HEX：`#rgb`・`#rgba`・`#rrggbb`・`#rrggbbaa`（`#` 無しも可）
 * - `rgb()`・`rgba()`：カンマ区切りとスペース区切り（`rgb(255 0 0 / 50%)`）の両方。数値と % の両方
 * - `255, 0, 0` のように数を3つ（または4つ目に不透明度）並べたもの → RGB として読む
 * - `hsl()`・`hsla()`：角度は deg・turn・rad・grad・単位なし
 * - CMYK：`cmyk(0%, 50%, 100%, 0%)`・`device-cmyk(...)`・`C0 M50 Y100 K0`（0〜100 または %、0〜1 の小数）
 * - CSS の色名（`rebeccapurple` など。大文字小文字は問わない）
 *
 * 仕様: docs/features/color-code-contrast.md
 */
import { cmykToRgb, hslToRgb, type Rgba } from './convert';
import { CSS_NAMED_COLORS } from './css-names';

export type InputFormat = 'hex' | 'rgb' | 'hsl' | 'cmyk' | 'name';

export const INPUT_FORMAT_LABELS: Record<InputFormat, string> = {
  hex: 'HEX',
  rgb: 'RGB',
  hsl: 'HSL',
  cmyk: 'CMYK',
  name: 'CSS の色名',
};

export type ParseResult =
  | { ok: true; color: Rgba; format: InputFormat; hasAlpha: boolean }
  | { ok: false; reason: 'empty' | 'unknown' | 'range' };

const NUM = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?`;

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function expandHex(h: string): string {
  return h.length <= 4 ? [...h].map((c) => c + c).join('') : h;
}

/** `rrggbb` / `rrggbbaa`（展開済み）→ 色 */
function hexToRgba(h: string): Rgba {
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
}

/** 関数の中身を、区切り（カンマ・空白・/）で分ける。不透明度の位置も返す */
function splitArgs(body: string): { parts: string[]; alpha: string | null } | null {
  const s = body.trim();
  if (s === '') return null;
  if (s.includes(',')) {
    if (s.includes('/')) return null;
    const parts = s.split(',').map((p) => p.trim());
    if (parts.some((p) => p === '' || /\s/.test(p))) return null;
    if (parts.length === 4) return { parts: parts.slice(0, 3), alpha: parts[3] };
    return { parts, alpha: null };
  }
  const [main, alpha, ...rest] = s.split('/').map((p) => p.trim());
  if (rest.length > 0 || alpha === '') return null;
  const parts = main.split(/\s+/);
  if (alpha === undefined && parts.length === 4) return { parts: parts.slice(0, 3), alpha: parts[3] };
  return { parts, alpha: alpha ?? null };
}

const NUM_ONLY = new RegExp(`^${NUM}$`, 'i');
const PERCENT = new RegExp(`^(${NUM})%$`, 'i');

/** 数か % を読む。% は `percentScale` 倍（rgb なら 255、不透明度なら 1） */
function readNumber(p: string, percentScale: number): number | null {
  const pm = PERCENT.exec(p);
  if (pm) return (Number(pm[1]) / 100) * percentScale;
  if (NUM_ONLY.test(p)) return Number(p);
  return null;
}

function readAlpha(p: string | null): number | null {
  if (p === null) return 1;
  const v = readNumber(p, 1);
  if (v === null) return null;
  return Math.min(1, Math.max(0, v));
}

const HUE_RE = new RegExp(`^(${NUM})(deg|turn|rad|grad)?$`, 'i');

function readHue(p: string): number | null {
  const m = HUE_RE.exec(p);
  if (!m) return null;
  const v = Number(m[1]);
  switch ((m[2] ?? 'deg').toLowerCase()) {
    case 'turn':
      return v * 360;
    case 'rad':
      return (v * 180) / Math.PI;
    case 'grad':
      return v * 0.9;
    default:
      return v;
  }
}

function inRange(...xs: number[]): boolean {
  return xs.every((x) => Number.isFinite(x));
}

function parseRgb(body: string): ParseResult {
  const a = splitArgs(body);
  if (!a || a.parts.length !== 3) return { ok: false, reason: 'unknown' };
  const [r, g, b] = a.parts.map((p) => readNumber(p, 255));
  const alpha = readAlpha(a.alpha);
  if (r === null || g === null || b === null || alpha === null) return { ok: false, reason: 'unknown' };
  if (!inRange(r, g, b) || [r, g, b].some((x) => x < 0 || x > 255)) return { ok: false, reason: 'range' };
  return { ok: true, color: { r, g, b, a: alpha }, format: 'rgb', hasAlpha: a.alpha !== null };
}

function parseHsl(body: string): ParseResult {
  const a = splitArgs(body);
  if (!a || a.parts.length !== 3) return { ok: false, reason: 'unknown' };
  const h = readHue(a.parts[0]);
  // S・L は % が正式。% が無い数（hsl(0 0 100)）も 0〜100 として読む
  const s = readNumber(a.parts[1].endsWith('%') ? a.parts[1] : `${a.parts[1]}%`, 1);
  const l = readNumber(a.parts[2].endsWith('%') ? a.parts[2] : `${a.parts[2]}%`, 1);
  const alpha = readAlpha(a.alpha);
  if (h === null || s === null || l === null || alpha === null) return { ok: false, reason: 'unknown' };
  if (!inRange(h, s, l) || s < 0 || s > 1 || l < 0 || l > 1) return { ok: false, reason: 'range' };
  return { ok: true, color: { ...hslToRgb({ h, s, l }), a: alpha }, format: 'hsl', hasAlpha: a.alpha !== null };
}

/** CMYK の1成分。% か 0〜100 の数。全成分が 1 以下の小数なら 0〜1 として読む（呼び出し側で判断） */
function parseCmykParts(parts: string[]): ParseResult {
  if (parts.length !== 4) return { ok: false, reason: 'unknown' };
  const raw = parts.map((p) => ({ v: readNumber(p, 100), pct: p.endsWith('%') }));
  if (raw.some((x) => x.v === null)) return { ok: false, reason: 'unknown' };
  const vals = raw.map((x) => x.v as number);
  // 0〜1 の小数だけで書いたもの（0.2, 0, 0, 0.5）は 0〜1 の書き方とみなす
  const unit = raw.every((x) => !x.pct) && vals.every((v) => v <= 1) && vals.some((v) => v > 0 && v < 1);
  const [c, m, y, k] = vals.map((v) => (unit ? v : v / 100));
  if (!inRange(c, m, y, k) || [c, m, y, k].some((v) => v < 0 || v > 1)) return { ok: false, reason: 'range' };
  return { ok: true, color: { ...cmykToRgb({ c, m, y, k }), a: 1 }, format: 'cmyk', hasAlpha: false };
}

const FUNC_RE = /^([a-z-]+)\(\s*(.*?)\s*\)$/is;
const CMYK_LETTERS_RE = new RegExp(
  `^c\\s*[:=]?\\s*(${NUM}%?)[\\s,]*m\\s*[:=]?\\s*(${NUM}%?)[\\s,]*y\\s*[:=]?\\s*(${NUM}%?)[\\s,]*k\\s*[:=]?\\s*(${NUM}%?)$`,
  'i',
);
const BARE_NUMBERS_RE = new RegExp(`^${NUM}%?(?:\\s*[,\\s]\\s*${NUM}%?){2,3}$`, 'i');

/**
 * 色の文字列を読む。形式は自動で判定する。
 * 前後の空白・末尾のセミコロン（CSS からのコピー）・全角のカンマや空白は許す。
 */
export function parseColor(input: string): ParseResult {
  const s = input
    .normalize('NFKC') // 全角の英数字・記号（＃ＦＦＦ、（、））を半角に
    .trim()
    .replace(/;$/, '')
    .trim();
  if (s === '') return { ok: false, reason: 'empty' };

  const hex = HEX_RE.exec(s);
  if (hex) {
    const h = expandHex(hex[1].toLowerCase());
    return { ok: true, color: hexToRgba(h), format: 'hex', hasAlpha: h.length === 8 };
  }

  const fn = FUNC_RE.exec(s);
  if (fn) {
    const name = fn[1].toLowerCase();
    if (name === 'rgb' || name === 'rgba') return parseRgb(fn[2]);
    if (name === 'hsl' || name === 'hsla') return parseHsl(fn[2]);
    if (name === 'cmyk' || name === 'device-cmyk') {
      const a = splitArgs(fn[2]);
      if (!a) return { ok: false, reason: 'unknown' };
      // splitArgs は4つ目を不透明度として分けるので、CMYK では K に戻す（device-cmyk の / 不透明度は使わない）
      return parseCmykParts(a.parts.length === 3 && a.alpha !== null ? [...a.parts, a.alpha] : a.parts);
    }
    return { ok: false, reason: 'unknown' };
  }

  const letters = CMYK_LETTERS_RE.exec(s);
  if (letters) return parseCmykParts(letters.slice(1, 5));

  if (BARE_NUMBERS_RE.test(s)) return parseRgb(s);

  const named = CSS_NAMED_COLORS[s.toLowerCase()];
  if (named) return { ok: true, color: hexToRgba(named), format: 'name', hasAlpha: false };

  return { ok: false, reason: 'unknown' };
}

/* ------------------------------------------------------------------ */
/* URL のクエリ（?c= / ?fg=&bg=）                                       */
/* ------------------------------------------------------------------ */

const QUERY_HEX_RE = /^[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;

/** クエリの値（`#` 無しの 6 桁または 8 桁の HEX）を読む。それ以外は null（例外は投げない） */
export function parseQueryHex(value: string | null | undefined): Rgba | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().replace(/^#/, '');
  return QUERY_HEX_RE.test(v) ? hexToRgba(v.toLowerCase()) : null;
}

export const DEFAULT_FG: Rgba = { r: 0x1a, g: 0x1a, b: 0x1a, a: 1 };
export const DEFAULT_BG: Rgba = { r: 0xff, g: 0xff, b: 0xff, a: 1 };

export type ToolTab = 'convert' | 'contrast';

export interface ColorQuery {
  tab: ToolTab;
  /** 変換タブの色 */
  c: Rgba;
  fg: Rgba;
  bg: Rgba;
}

/**
 * `location.search` からタブと色を読む。
 * **不正な値は何も言わずに既定値に戻す**（共有 URL の途中切れで画面が壊れて見えないように）。
 */
export function readColorQuery(search: string): ColorQuery {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    params = new URLSearchParams();
  }
  const fg = parseQueryHex(params.get('fg'));
  const bg = parseQueryHex(params.get('bg'));
  const c = parseQueryHex(params.get('c'));
  const tab: ToolTab = params.has('fg') || params.has('bg') ? 'contrast' : 'convert';
  return { tab, c: c ?? DEFAULT_FG, fg: fg ?? DEFAULT_FG, bg: bg ?? DEFAULT_BG };
}
