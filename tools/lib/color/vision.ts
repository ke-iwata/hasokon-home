/**
 * 色の見え方のちがい（近似）。純関数のみ。
 *
 * - P型（1型2色覚）・D型（2型2色覚）：Viénot, Brettel & Mollon (1999)
 *   "Digital video colourmaps for checking the legibility of displays by dichromats" の方法。
 *   線形 RGB での 3×3 行列（libDaltonLens と同じ係数）
 * - T型（3型2色覚）：Brettel, Viénot & Mollon (1997)
 *   "Computerized simulation of color appearance for dichromats" の2平面の方法
 * - モノクロ：相対輝度（WCAG の式）を灰色にしたもの
 *
 * **シミュレーションは目安で、見え方には個人差がある。診断ではない。**
 * 画面の言葉づかいは「異常」「障害」を使わない（仕様書のとおり）。
 *
 * 仕様: docs/features/color-code-contrast.md
 */
import { fromLinearRgb, linearRgb, type Rgb, type Rgba } from './convert';

export type VisionType = 'protan' | 'deutan' | 'tritan' | 'mono';

export const VISION_TYPES: readonly VisionType[] = ['protan', 'deutan', 'tritan', 'mono'];

export const VISION_LABELS: Record<VisionType, string> = {
  protan: 'P型（1型2色覚）',
  deutan: 'D型（2型2色覚）',
  tritan: 'T型（3型2色覚）',
  mono: 'モノクロ',
};

type M3 = readonly [number, number, number, number, number, number, number, number, number];

/** Viénot 1999（線形 RGB） */
const PROTAN: M3 = [0.11238, 0.88762, 0.0, 0.11238, 0.88762, -0.0, 0.00401, -0.00401, 1.0];
const DEUTAN: M3 = [0.29275, 0.70725, 0.0, 0.29275, 0.70725, -0.0, -0.02234, 0.02234, 1.0];

/** Brettel 1997 の T型。分ける平面の法線で2つの行列を使い分ける */
const TRITAN_1: M3 = [1.01277, 0.13548, -0.14826, -0.01243, 0.86812, 0.14431, 0.07589, 0.805, 0.11911];
const TRITAN_2: M3 = [0.93678, 0.18979, -0.12657, 0.06154, 0.81526, 0.1232, -0.37562, 1.12767, 0.24796];
const TRITAN_NORMAL = [0.03901, -0.02788, -0.01113] as const;

function apply(m: M3, [r, g, b]: readonly number[]): [number, number, number] {
  return [m[0] * r + m[1] * g + m[2] * b, m[3] * r + m[4] * g + m[5] * b, m[6] * r + m[7] * g + m[8] * b];
}

/** 色の見え方を近似した色（透明度はそのまま） */
export function simulate(c: Rgba, type: VisionType): Rgba {
  const lin = linearRgb(c);
  let out: readonly number[];
  if (type === 'mono') {
    const y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    out = [y, y, y];
  } else if (type === 'protan') {
    out = apply(PROTAN, lin);
  } else if (type === 'deutan') {
    out = apply(DEUTAN, lin);
  } else {
    const side = lin[0] * TRITAN_NORMAL[0] + lin[1] * TRITAN_NORMAL[1] + lin[2] * TRITAN_NORMAL[2];
    out = apply(side >= 0 ? TRITAN_1 : TRITAN_2, lin);
  }
  const rgb: Rgb = fromLinearRgb(out);
  return { ...rgb, a: c.a };
}
