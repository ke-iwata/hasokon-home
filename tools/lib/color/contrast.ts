/**
 * コントラスト比と WCAG 2.2 の判定、「合格する一番近い色」（純関数のみ）。
 *
 * - 相対輝度は WCAG 2.2 の式（sRGB の線形化のしきい値 0.04045。8bit の入力では旧来の 0.03928 と結果が同じ）
 *   https://www.w3.org/TR/WCAG22/#dfn-relative-luminance
 * - コントラスト比は (L1 + 0.05) / (L2 + 0.05)
 *   https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio
 * - **判定は丸める前の値で行う。** 4.499 を「4.50」と表示して合格にしない（`formatRatio`）
 * - 透明度つきの色は、下の色に合成してから比を出す（背景色の透明度は白い地に合成する）
 *
 * サイト自身の配色テスト（tests/link-contrast.test.ts）もこの式を使う。
 *
 * 仕様: docs/features/color-code-contrast.md
 */
import { hslToRgb, linearRgb, rgbToHsl, round8, type Hsl, type Rgb, type Rgba } from './convert';
import { parseColor } from './parse';

/** 相対輝度（0〜1）。HEX の文字列も受け付ける（配色テストから使うため） */
export function relativeLuminance(c: Rgb | string): number {
  const [r, g, b] = linearRgb(typeof c === 'string' ? toRgba(c) : c);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function toRgba(s: string): Rgba {
  const p = parseColor(s);
  if (!p.ok) throw new Error(`色として読めません: ${s}`);
  return p.color;
}

/** 上の色（不透明度つき）を下の色に重ねた結果（sRGB の値でそのまま混ぜる。ブラウザの描画と同じ） */
export function composite(top: Rgba, bottom: Rgb): Rgba {
  const a = top.a;
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    a: 1,
  };
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };

/**
 * 画面に出す HEX（`#rrggbbaa`）と同じ 8bit の色にそろえる。RGB は 0〜255 の整数、不透明度は 1/255 刻み。
 *
 * `hsl(0 0% 46.5%)` のような小数を含む入力を浮動小数のまま測ると、画面の HEX（#777777・4.48 で不合格）と
 * 判定（4.51 で合格）が食い違う。コピー・URL・ブラウザの描画はどれも 8bit なので、比もそれで出す
 */
export function quantize(c: Rgba): Rgba {
  return { ...round8(c), a: Math.round(Math.min(1, Math.max(0, c.a)) * 255) / 255 };
}

/**
 * 背景色は白い地に、文字色は背景色に合成して、実際に見える2色にする。
 * 合成の前に、どちらも 8bit の色（`quantize`）にそろえる
 */
export function visiblePair(fg: Rgba, bg: Rgba): { fg: Rgba; bg: Rgba } {
  const [f, b] = [quantize(fg), quantize(bg)];
  const bgSeen = b.a < 1 ? composite(b, WHITE) : { ...b, a: 1 };
  const fgSeen = f.a < 1 ? composite(f, bgSeen) : { ...f, a: 1 };
  return { fg: fgSeen, bg: bgSeen };
}

function ratioOfLuminance(l1: number, l2: number): number {
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** コントラスト比（1〜21）。HEX の文字列も受け付ける */
export function contrastRatio(a: Rgb | string, b: Rgb | string): number {
  return ratioOfLuminance(relativeLuminance(a), relativeLuminance(b));
}

/** 文字色（透明度つき可）と背景色のコントラスト比。8bit にそろえた色で測る（画面の HEX と同じ色） */
export function contrastOf(fg: Rgba, bg: Rgba): number {
  const v = visiblePair(fg, bg);
  return contrastRatio(v.fg, v.bg);
}

/** 判定のしきい値 */
const THRESHOLDS = [3, 4.5, 7] as const;

/**
 * 比を小数2桁で表示する。**しきい値（3・4.5・7）をまたいで切り上がるときだけ切り捨てる**
 * （4.499 を 4.50 と表示すると、不合格なのに基準ちょうどに見えるため）。それ以外は四捨五入
 */
export function formatRatio(ratio: number): string {
  let v = Math.round(ratio * 100) / 100;
  for (const t of THRESHOLDS) {
    if (ratio < t && v >= t) v = t - 0.01;
  }
  return v.toFixed(2);
}

export type Level = 'AA' | 'AAA';
export type Target = 'normal' | 'large' | 'ui';

export interface Criterion {
  target: Target;
  level: Level;
  min: number;
  /** 達成基準の番号 */
  sc: string;
}

/** WCAG 2.2 の判定表（1.4.3・1.4.6・1.4.11） */
export const CRITERIA: readonly Criterion[] = [
  { target: 'normal', level: 'AA', min: 4.5, sc: '1.4.3' },
  { target: 'normal', level: 'AAA', min: 7, sc: '1.4.6' },
  { target: 'large', level: 'AA', min: 3, sc: '1.4.3' },
  { target: 'large', level: 'AAA', min: 4.5, sc: '1.4.6' },
  { target: 'ui', level: 'AA', min: 3, sc: '1.4.11' },
];

export const TARGET_LABELS: Record<Target, string> = {
  normal: '通常の文字',
  large: '大きな文字（24px 以上、または太字 18.66px 以上）',
  ui: 'アイコン・ボタンの枠など',
};

export interface Judgement extends Criterion {
  pass: boolean;
}

/** 丸める前の比で判定する */
export function judge(ratio: number): Judgement[] {
  return CRITERIA.map((c) => ({ ...c, pass: ratio >= c.min }));
}

/* ------------------------------------------------------------------ */
/* 合格する一番近い色                                                 */
/* ------------------------------------------------------------------ */

export interface Suggestion {
  /** 8bit に丸めた提案の色（不透明度は元の色のまま） */
  color: Rgba;
  /** 提案の色の HSL（H・S は元の色と同じ。L だけ動かしている） */
  hsl: Hsl;
  /** 元の色より明るくしたか暗くしたか */
  direction: 'lighter' | 'darker';
  /** 提案の色での比（丸める前） */
  ratio: number;
}

const ITERATIONS = 40;

/**
 * `moving` の色相・彩度（HSL の H・S）を保ったまま明度 L だけを動かして、
 * `fixed` とのコントラスト比が `target` 以上になる**一番近い色**を探す。
 *
 * - 明るくする側と暗くする側の両方を二分探索し、届くもののうち元の L に近いほうを返す
 *   （L の差が同じなら暗い側を優先する）
 * - どちらに動かしても届かなければ null
 * - 比は 8bit に丸めた色で確かめる（提案した HEX をそのまま使って合格するように）
 * - `moving` が透明度つきなら、透明度はそのままで、`fixed` に合成した色で比を出す
 *   （`fixed` 側の透明度は白い地に合成する）
 * - すでに届いているなら、`moving` をそのまま返す
 */
export function nearestPassing(moving: Rgba, fixed: Rgba, target: number): Suggestion | null {
  const hsl = rgbToHsl(moving);
  const fixedQ = quantize(fixed);
  const fixedSeen = fixedQ.a < 1 ? composite(fixedQ, WHITE) : fixedQ;
  const fixedLum = relativeLuminance(fixedSeen);
  const colorAt = (l: number): Rgba => quantize({ ...hslToRgb({ h: hsl.h, s: hsl.s, l }), a: moving.a });
  const lumAt = (l: number): number => {
    const c = colorAt(l);
    return relativeLuminance(c.a < 1 ? composite(c, fixedSeen) : c);
  };
  const ratioAt = (l: number) => ratioOfLuminance(lumAt(l), fixedLum);
  const make = (l: number, direction: Suggestion['direction']): Suggestion => ({
    color: colorAt(l),
    hsl: { h: hsl.h, s: hsl.s, l },
    direction,
    ratio: ratioAt(l),
  });

  const l0 = hsl.l;
  if (ratioAt(l0) >= target) return make(l0, 'lighter');

  // 輝度は L について単調に増える（8bit に丸めても減らない）。
  // 明るい側：fixed より明るく、比が target 以上になるのに要る輝度
  const needHi = target * (fixedLum + 0.05) - 0.05;
  // 暗い側：fixed より暗く、比が target 以上になるのに許される輝度
  const needLo = (fixedLum + 0.05) / target - 0.05;

  let lighter: number | null = null;
  if (lumAt(1) >= needHi) {
    let lo = l0;
    let hi = 1;
    for (let i = 0; i < ITERATIONS; i++) {
      const mid = (lo + hi) / 2;
      if (lumAt(mid) >= needHi) hi = mid;
      else lo = mid;
    }
    if (ratioAt(hi) >= target) lighter = hi;
  }

  let darker: number | null = null;
  if (needLo >= 0 && lumAt(0) <= needLo) {
    let lo = 0;
    let hi = l0;
    for (let i = 0; i < ITERATIONS; i++) {
      const mid = (lo + hi) / 2;
      if (lumAt(mid) <= needLo) lo = mid;
      else hi = mid;
    }
    if (ratioAt(lo) >= target) darker = lo;
  }

  const pick = pickNearer(l0, lighter, darker);
  return pick === null ? null : make(pick === 'lighter' ? (lighter as number) : (darker as number), pick);
}

/**
 * 明るい側・暗い側の候補（L）のうち、元の L に近いほう。**差が同じなら暗い側**。
 * どちらも無ければ null
 */
export function pickNearer(l0: number, lighter: number | null, darker: number | null): Suggestion['direction'] | null {
  if (lighter === null && darker === null) return null;
  if (lighter === null) return 'darker';
  if (darker === null) return 'lighter';
  return lighter - l0 < l0 - darker - 1e-12 ? 'lighter' : 'darker';
}
