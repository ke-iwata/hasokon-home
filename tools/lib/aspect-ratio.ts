/**
 * アスペクト比計算ロジック
 *
 * 幅・高さ(px)から最簡分数の比を求め、よく使う比率との一致・近似を判定する。
 * すべて純関数。無効な入力（0以下・非有限数）は null を返す。
 */

/** 比（幅:高さ） */
export interface Ratio {
  w: number;
  h: number;
}

/** よく使う比率との照合結果 */
export interface CommonRatioMatch {
  /** 最も近い比率 例: {w:16, h:9} */
  ratio: Ratio;
  /** ラベル 例: '16:9' */
  label: string;
  /** 完全一致（ぴったり）か */
  exact: boolean;
  /** 比率の値のずれ（%）。exact のときは 0 */
  diffPercent: number;
}

/** よく使う比率の一覧（照合順） */
export const COMMON_RATIOS: Ratio[] = [
  { w: 16, h: 9 },
  { w: 4, h: 3 },
  { w: 3, h: 2 },
  { w: 21, h: 9 },
  { w: 1, h: 1 },
  { w: 9, h: 16 },
  { w: 2, h: 1 },
  { w: 5, h: 4 },
];

/**
 * 最大公約数（ユークリッドの互除法）。gcd(a, 0) = a、gcd(0, 0) = 0
 */
export function gcd(a: number, b: number): number {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y !== 0) {
    [x, y] = [y, x % y];
  }
  return x;
}

/**
 * 幅と高さを最簡分数の比にする。
 *
 * @returns 例: simplify(1920, 1080) → {w:16, h:9}。無効な入力は null
 */
export function simplify(w: number, h: number): Ratio | null {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  const iw = Math.round(w);
  const ih = Math.round(h);
  if (iw <= 0 || ih <= 0) return null;
  const g = gcd(iw, ih);
  return { w: iw / g, h: ih / g };
}

/**
 * よく使う比率（16:9, 4:3, 3:2, 21:9, 1:1, 9:16, 2:1, 5:4）のうち最も近いものを返す。
 * 値が完全に一致する場合は exact: true（ぴったり）。無効な入力は null
 */
export function nearestCommonRatio(w: number, h: number): CommonRatioMatch | null {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  const value = w / h;
  let best: CommonRatioMatch | null = null;
  for (const r of COMMON_RATIOS) {
    const rv = r.w / r.h;
    const diffPercent = (Math.abs(value - rv) / rv) * 100;
    if (best === null || diffPercent < best.diffPercent) {
      best = {
        ratio: r,
        label: `${r.w}:${r.h}`,
        exact: diffPercent === 0,
        diffPercent,
      };
    }
  }
  return best;
}

/**
 * 比率を保ったまま幅を newW に変えたときの高さ（四捨五入）を返す。
 * 元の幅・高さが無効、または newW が負・非有限なら null
 */
export function scaleByWidth(w: number, h: number, newW: number): number | null {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  if (!Number.isFinite(newW) || newW < 0) return null;
  return Math.round((newW * h) / w);
}

/**
 * 比率を保ったまま高さを newH に変えたときの幅（四捨五入）を返す。
 * 元の幅・高さが無効、または newH が負・非有限なら null
 */
export function scaleByHeight(w: number, h: number, newH: number): number | null {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  if (!Number.isFinite(newH) || newH < 0) return null;
  return Math.round((newH * w) / h);
}

/** 逆引き早見表の1行（幅から高さを引く） */
export interface LookupRow {
  /** 幅(px) */
  width: number;
  /** その比率での高さ(px。四捨五入) */
  height: number;
  /** 高さが整数で割り切れる（四捨五入していない）か */
  exact: boolean;
}

/** 逆引き早見表 */
export interface LookupTable {
  /** 比（幅:高さ） */
  ratio: Ratio;
  /** ラベル 例: '16:9' */
  label: string;
  rows: LookupRow[];
}

/**
 * 16:9 の逆引き早見表で使う幅。動画・モニター・書き出しでよく使う値。
 * 9:16（縦動画）は同じ行を縦横読み替えて使う（1280x720 → 720x1280）。
 */
export const LOOKUP_WIDTHS_16_9: number[] = [
  640, 854, 960, 1280, 1366, 1600, 1920, 2560, 3840,
];

/** 4:3・3:2・21:9 の簡易表で使う幅（行数を絞る） */
export const LOOKUP_WIDTHS_COMPACT: number[] = [640, 1280, 1600, 1920, 3840];

/**
 * 比率と幅の一覧から逆引き早見表を作る。
 *
 * 高さは `scaleByWidth()` で求めるので、計算機の結果と表の値が食い違うことはない。
 * 静的な表として書き出す用途で、比率は不変のためビルド時に1度だけ評価される。
 */
export function lookupTable(ratio: Ratio, widths: number[]): LookupTable {
  const rows = widths.map((width) => {
    const height = scaleByWidth(ratio.w, ratio.h, width);
    if (height === null) throw new Error(`逆引き表を作れない値です: ${ratio.w}:${ratio.h} 幅${width}`);
    return {
      width,
      height,
      exact: (width * ratio.h) % ratio.w === 0,
    };
  });
  return { ratio, label: `${ratio.w}:${ratio.h}`, rows };
}

/** 16:9（9:16は縦横読み替え）の逆引き早見表 */
export const LOOKUP_16_9: LookupTable = lookupTable({ w: 16, h: 9 }, LOOKUP_WIDTHS_16_9);

/** 4:3・3:2・21:9 の簡易逆引き表 */
export const LOOKUP_COMPACT: LookupTable[] = [
  lookupTable({ w: 4, h: 3 }, LOOKUP_WIDTHS_COMPACT),
  lookupTable({ w: 3, h: 2 }, LOOKUP_WIDTHS_COMPACT),
  lookupTable({ w: 21, h: 9 }, LOOKUP_WIDTHS_COMPACT),
];
