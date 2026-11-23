/**
 * 色の表し方の相互変換（純関数のみ）。
 *
 * - **内部では丸めない。** RGB は 0〜255 の浮動小数、HSL・HSV は H（0〜360）・S・L・V（0〜1）の
 *   浮動小数で持ち、表示するときだけ丸める（`format*`）。HEX → HSL → 明度を動かす → HEX の連鎖は
 *   すべて丸める前の値で行う
 * - CMYK は**簡易変換（ICC プロファイルなし）**。印刷所に入稿する色の変換には使えない
 * - oklch は CSS Color Module Level 4 の OKLab（Björn Ottosson, 2020）の式
 *
 * 仕様: docs/features/color-code-contrast.md
 */

/** 0〜255（浮動小数可）の RGB と、0〜1 の不透明度 */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export type Rgb = Omit<Rgba, 'a'>;

/** H は 0〜360、S・L は 0〜1 */
export interface Hsl {
  h: number;
  s: number;
  l: number;
}

/** H は 0〜360、S・V は 0〜1 */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

/** 0〜1 */
export interface Cmyk {
  c: number;
  m: number;
  y: number;
  k: number;
}

/** L は 0〜1、C は 0〜（sRGB では 0.37 前後まで）、H は 0〜360 */
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const clamp255 = (x: number) => clamp(x, 0, 255);

/** 0〜255 の整数に丸める（HEX・RGB の表示と、8bit の色として扱うとき） */
export function round8(c: Rgba): Rgba {
  return { r: Math.round(clamp255(c.r)), g: Math.round(clamp255(c.g)), b: Math.round(clamp255(c.b)), a: c.a };
}

function hueOf(r: number, g: number, b: number, max: number, d: number): number {
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: hueOf(R, G, B, max, d), s: clamp(s, 0, 1), l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const C = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const X = C * (1 - Math.abs((hp % 2) - 1));
  let [r, g, b] = [0, 0, 0];
  if (hp < 1) [r, g, b] = [C, X, 0];
  else if (hp < 2) [r, g, b] = [X, C, 0];
  else if (hp < 3) [r, g, b] = [0, C, X];
  else if (hp < 4) [r, g, b] = [0, X, C];
  else if (hp < 5) [r, g, b] = [X, 0, C];
  else [r, g, b] = [C, 0, X];
  const m = l - C / 2;
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const d = max - Math.min(R, G, B);
  return { h: hueOf(R, G, B, max, d), s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const l = v * (1 - s / 2);
  const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
  return hslToRgb({ h, s: sl, l });
}

/** 簡易変換（ICC プロファイルなし）。K を先に取り出す一般的な式 */
export function rgbToCmyk({ r, g, b }: Rgb): Cmyk {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const k = 1 - Math.max(R, G, B);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 1 };
  return { c: (1 - R - k) / (1 - k), m: (1 - G - k) / (1 - k), y: (1 - B - k) / (1 - k), k };
}

export function cmykToRgb({ c, m, y, k }: Cmyk): Rgb {
  return { r: 255 * (1 - c) * (1 - k), g: 255 * (1 - m) * (1 - k), b: 255 * (1 - y) * (1 - k) };
}

/** sRGB の 0〜1 の値を線形にする（WCAG 2.2 の式。しきい値 0.04045） */
export function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** 線形の 0〜1 を sRGB の 0〜1 に戻す */
export function fromLinear(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** RGB（0〜255）→ 線形 RGB（0〜1） */
export function linearRgb({ r, g, b }: Rgb): [number, number, number] {
  return [toLinear(r / 255), toLinear(g / 255), toLinear(b / 255)];
}

/** 線形 RGB（0〜1）→ RGB（0〜255、範囲外は切り詰め） */
export function fromLinearRgb([r, g, b]: readonly number[]): Rgb {
  return {
    r: clamp255(fromLinear(clamp(r, 0, 1)) * 255),
    g: clamp255(fromLinear(clamp(g, 0, 1)) * 255),
    b: clamp255(fromLinear(clamp(b, 0, 1)) * 255),
  };
}

export function rgbToOklch(c: Rgb): Oklch {
  const [r, g, b] = linearRgb(c);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c: C, h: C < 1e-6 ? 0 : h };
}

/* ------------------------------------------------------------------ */
/* 表示（ここでだけ丸める）                                            */
/* ------------------------------------------------------------------ */

/** 小数 `digits` 桁に丸め、末尾の 0 を落とす（12.50 → 12.5、100.0 → 100） */
export function fmt(x: number, digits: number): string {
  const v = Number(x.toFixed(digits));
  return String(Object.is(v, -0) ? 0 : v);
}

const hex2 = (n: number) => Math.round(clamp255(n)).toString(16).padStart(2, '0');

/** `#rrggbb`。不透明でなければ `#rrggbbaa` */
export function formatHex(c: Rgba, withAlpha = c.a < 1): string {
  const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
  return withAlpha ? `${base}${hex2(c.a * 255)}` : base;
}

/** URL のクエリに書く形（`#` 無し・6 桁または 8 桁） */
export function hexForQuery(c: Rgba): string {
  return formatHex(c).slice(1);
}

const alphaPart = (a: number) => (a < 1 ? ` / ${fmt(a * 100, 1)}%` : '');

export function formatRgb(c: Rgba): string {
  const q = round8(c);
  return `rgb(${q.r} ${q.g} ${q.b}${alphaPart(c.a)})`;
}

/** H は整数、S・L は小数1桁（例 `hsl(210 12.5% 34.9%)`） */
export function formatHsl(c: Rgba): string {
  const { h, s, l } = rgbToHsl(c);
  return `hsl(${Math.round(h) % 360} ${fmt(s * 100, 1)}% ${fmt(l * 100, 1)}%${alphaPart(c.a)})`;
}

/** CSS には無い形なので、関数名の形にそろえて書くだけ */
export function formatHsv(c: Rgba): string {
  const { h, s, v } = rgbToHsv(c);
  return `hsv(${Math.round(h) % 360} ${fmt(s * 100, 1)}% ${fmt(v * 100, 1)}%)`;
}

export function formatCmyk(c: Rgba): string {
  const { c: C, m, y, k } = rgbToCmyk(c);
  return `cmyk(${fmt(C * 100, 0)}% ${fmt(m * 100, 0)}% ${fmt(y * 100, 0)}% ${fmt(k * 100, 0)}%)`;
}

export function formatOklch(c: Rgba): string {
  const { l, c: C, h } = rgbToOklch(c);
  return `oklch(${fmt(l * 100, 1)}% ${fmt(C, 3)} ${fmt(h, 1)}${alphaPart(c.a)})`;
}

export type FormatKey = 'hex' | 'rgb' | 'hsl' | 'hsv' | 'cmyk' | 'oklch';

/** 変換結果の6行（画面の並び順） */
export function allFormats(c: Rgba): { key: FormatKey; label: string; value: string }[] {
  return [
    { key: 'hex', label: 'HEX', value: formatHex(c) },
    { key: 'rgb', label: 'RGB', value: formatRgb(c) },
    { key: 'hsl', label: 'HSL', value: formatHsl(c) },
    { key: 'hsv', label: 'HSV', value: formatHsv(c) },
    { key: 'cmyk', label: 'CMYK', value: formatCmyk(c) },
    { key: 'oklch', label: 'OKLCH', value: formatOklch(c) },
  ];
}
