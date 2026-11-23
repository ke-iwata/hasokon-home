/**
 * 近い色の名前（CSS の色名と JIS 慣用色名）。純関数のみ。
 *
 * - 色差は CIEDE2000（CIE 142-2001。実装の確かめは Sharma, Wu & Dalal (2005) の検証用データ）
 * - CIELAB は sRGB（D65）から。白色点は D65
 * - JIS 慣用色名の HEX は**近似**（lib/color/jis-names.ts。マンセル値からの換算）
 *
 * 仕様: docs/features/color-code-contrast.md
 */
import { linearRgb, type Rgb } from './convert';
import { CSS_NAMED_COLORS } from './css-names';
import { JIS_COLOR_NAMES } from './jis-names';

export interface Lab {
  L: number;
  a: number;
  b: number;
}

const D65 = [0.95047, 1, 1.08883] as const;

export function rgbToLab(c: Rgb): Lab {
  const [r, g, b] = linearRgb(c);
  const xyz = [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    0.0193339 * r + 0.119192 * g + 0.9503041 * b,
  ];
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [fx, fy, fz] = xyz.map((v, i) => f(v / D65[i]));
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

/** CIEDE2000 の色差（kL = kC = kH = 1） */
export function deltaE2000(x: Lab, y: Lab): number {
  const C1 = Math.hypot(x.a, x.b);
  const C2 = Math.hypot(y.a, y.b);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const a1 = (1 + G) * x.a;
  const a2 = (1 + G) * y.a;
  const c1 = Math.hypot(a1, x.b);
  const c2 = Math.hypot(a2, y.b);
  const hue = (b: number, a: number) => {
    if (a === 0 && b === 0) return 0;
    const h = deg(Math.atan2(b, a));
    return h < 0 ? h + 360 : h;
  };
  const h1 = hue(x.b, a1);
  const h2 = hue(y.b, a2);

  const dL = y.L - x.L;
  const dC = c2 - c1;
  let dh = 0;
  if (c1 * c2 !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin(rad(dh / 2));

  const Lbar = (x.L + y.L) / 2;
  const cbar = (c1 + c2) / 2;
  let hbar = h1 + h2;
  if (c1 * c2 !== 0) {
    if (Math.abs(h1 - h2) <= 180) hbar = (h1 + h2) / 2;
    else hbar = h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
  }
  const T =
    1 -
    0.17 * Math.cos(rad(hbar - 30)) +
    0.24 * Math.cos(rad(2 * hbar)) +
    0.32 * Math.cos(rad(3 * hbar + 6)) -
    0.2 * Math.cos(rad(4 * hbar - 63));
  const dTheta = 30 * Math.exp(-(((hbar - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(cbar ** 7 / (cbar ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbar - 50) ** 2) / Math.sqrt(20 + (Lbar - 50) ** 2);
  const Sc = 1 + 0.045 * cbar;
  const Sh = 1 + 0.015 * cbar * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}

export interface NamedColor {
  /** 表示名。CSS の別名（gray / grey など）は「 / 」でつなぐ */
  name: string;
  /** `#` 無しの 6 桁 */
  hex: string;
  source: 'css' | 'jis';
  /** JIS 慣用色名の代表的なマンセル値 */
  munsell?: string;
}

function hexToRgb(h: string): Rgb {
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

/** CSS の色名は同じ値の別名をまとめる（gray / grey、aqua / cyan など） */
function cssEntries(): NamedColor[] {
  const byHex = new Map<string, string[]>();
  for (const [name, hex] of Object.entries(CSS_NAMED_COLORS)) {
    byHex.set(hex, [...(byHex.get(hex) ?? []), name]);
  }
  return [...byHex].map(([hex, names]) => ({ name: names.join(' / '), hex, source: 'css' as const }));
}

/** 近さを比べる対象の一覧（CSS の色名＋JIS 慣用色名） */
export const NAMED_COLORS: readonly NamedColor[] = [
  ...cssEntries(),
  ...JIS_COLOR_NAMES.map(([name, munsell, hex]) => ({ name, hex, source: 'jis' as const, munsell })),
];

const LABS = NAMED_COLORS.map((n) => rgbToLab(hexToRgb(n.hex)));

/** 色差（CIEDE2000）が小さい順に `count` 個 */
export function nearestNames(c: Rgb, count = 3): (NamedColor & { deltaE: number })[] {
  const lab = rgbToLab(c);
  return NAMED_COLORS.map((n, i) => ({ ...n, deltaE: deltaE2000(lab, LABS[i]) }))
    .sort((p, q) => p.deltaE - q.deltaE)
    .slice(0, count);
}
