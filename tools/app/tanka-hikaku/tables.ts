import {
  effectivePrice,
  formatChange,
  formatUnitPrice,
  isPriceError,
  shrinkflation,
  toBase,
  unitPrice,
} from '@/lib/tanka-hikaku';

/**
 * 本文の例の数字。本文に額を手で書かないよう、lib の関数を呼んで作る
 * （docs/features/thin-tool-content.md）。仕様: docs/features/tanka-hikaku.md
 */

function pay(...args: Parameters<typeof effectivePrice>) {
  const r = effectivePrice(...args);
  if (isPriceError(r)) throw new Error(`本文の例が計算できない: ${r.error}`);
  return r;
}

/** 税抜 8% 298円 → 税込 */
export const TAX_EXAMPLE = pay(298, 'reduced').pay;

/** 割引の例（30円引き・20%引き） */
export const DISCOUNT_INCLUSIVE = pay(321, 'inclusive', { yenOff: 30, percentOff: 20 }).pay;
export const DISCOUNT_EXCLUSIVE = pay(298, 'reduced', { yenOff: 30, percentOff: 20 }).pay;
/** %引きを先に掛けたら（このツールはしない順序） */
export const DISCOUNT_PERCENT_FIRST = Math.floor(321 * 0.8 - 30);

/** ポイントの例（支払額 232円・5%） */
const POINT = pay(321, 'inclusive', { yenOff: 30, percentOff: 20, pointPercent: 5 });
export const POINT_EXAMPLE = { points: POINT.points, effective: POINT.effective };

/** 100g あたりと 1kg あたり（1kg 498円） */
const BIG = { price: 498, tax: 'inclusive' as const, qty: 1, unit: 'kg' as const };
export const PER_100G = formatUnitPrice(unitPrice(BIG, 'small') as number);
export const PER_1KG = formatUnitPrice(unitPrice(BIG, 'large') as number);

/** 入り数の例 */
export const PACK_TOTAL = toBase(350, 'ml', [6, 2])?.base as number;

/** 実質値上げの例 */
export const SHRINK = formatChange(
  (shrinkflation({ price: 198, qty: 200, unit: 'g' }, { price: 198, qty: 180, unit: 'g' }) ?? { unitPct: NaN }).unitPct,
);
export const RAISE = formatChange(
  (shrinkflation({ price: 198, qty: 200, unit: 'g' }, { price: 218, qty: 200, unit: 'g' }) ?? { unitPct: NaN }).unitPct,
);
