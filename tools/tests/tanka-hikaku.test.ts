import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TAX,
  defaultName,
  discountOrderNote,
  effectivePrice,
  formatChange,
  formatQty,
  formatUnitPrice,
  isPriceError,
  itemCountBucket,
  parseLooseNumber,
  parsePack,
  perLabel,
  rank,
  rankedOnly,
  shrinkflation,
  taxChoices,
  taxPercent,
  toBase,
  unitPrice,
  type ItemInput,
  type PriceResult,
} from '@/lib/tanka-hikaku';
import { TAX_PERCENT_REDUCED, TAX_PERCENT_STANDARD } from '@/lib/shohizei';

/**
 * 単価比較 計算機のテスト。
 *
 * 仕様: docs/features/tanka-hikaku.md の「確かめること」1〜5・8 と、
 * 割引・ポイントの掛け方の例をそのまま入れている（6・9 は画面の確認）。
 */

function ok(r: ReturnType<typeof effectivePrice>): PriceResult {
  if (isPriceError(r)) throw new Error(`エラーになった: ${r.error}`);
  return r;
}

const item = (over: Partial<ItemInput>): ItemInput => ({
  price: 100,
  tax: 'inclusive',
  qty: 100,
  unit: 'g',
  ...over,
});

describe('toBase（確かめること1）', () => {
  it('1.5kg = 1500g、0.5L = 500ml', () => {
    expect(toBase(1.5, 'kg')).toMatchObject({ kind: 'mass', base: 1500, baseUnit: 'g', group: 'mass' });
    expect(toBase(0.5, 'L')).toMatchObject({ kind: 'volume', base: 500, baseUnit: 'ml', group: 'volume' });
  });

  it('350ml×6×2 = 4200ml', () => {
    expect(toBase(350, 'ml', [6, 2])?.base).toBe(4200);
  });

  it('数の系統は単位ごとに別の組（個と枚は比べない）', () => {
    expect(toBase(10, '個')).toMatchObject({ kind: 'count', base: 10, baseUnit: '個', group: 'count:個' });
    expect(toBase(10, '枚')?.group).toBe('count:枚');
  });

  it('小数の誤差を出さない（0.1kg×3 = 300g）', () => {
    expect(toBase(0.1, 'kg', [3])?.base).toBe(300);
  });

  it('0・負・NaN の量や入り数は null', () => {
    expect(toBase(0, 'g')).toBeNull();
    expect(toBase(-1, 'g')).toBeNull();
    expect(toBase(Number.NaN, 'g')).toBeNull();
    expect(toBase(100, 'g', [0])).toBeNull();
    expect(toBase(100, 'g', [Number.NaN])).toBeNull();
  });
});

describe('税の扱い', () => {
  it('既定は税込', () => {
    expect(DEFAULT_TAX).toBe('inclusive');
  });

  it('税率は shohizei の定数から引く', () => {
    expect(taxPercent('reduced')).toBe(TAX_PERCENT_REDUCED);
    expect(taxPercent('standard')).toBe(TAX_PERCENT_STANDARD);
    expect(taxPercent('inclusive')).toBe(0);
  });

  it('飲食料品1%は 2027-04-01 からの期間だけ並ぶ（日付で出し分ける）', () => {
    expect(taxChoices('2026-11-19').map((t) => t.id)).toEqual(['inclusive', 'reduced', 'standard']);
    expect(taxChoices('2027-03-31').map((t) => t.id)).not.toContain('food-2027');
    expect(taxChoices('2027-04-01').map((t) => t.id)).toContain('food-2027');
    expect(taxChoices('2029-04-01').map((t) => t.id)).not.toContain('food-2027');
  });

  it('税抜 8% 298円 → 税込 321円（切り捨て）で比べる（確かめること3）', () => {
    const r = ok(effectivePrice(298, 'reduced'));
    expect(r.pay).toBe(321);
    expect(unitPrice(item({ price: 298, tax: 'reduced', qty: 100 }), 'small')).toBe(321);
  });

  it('税込で割引が無ければ、0.1円単位の値段もそのまま使う', () => {
    expect(ok(effectivePrice(12.5, 'inclusive')).pay).toBe(12.5);
  });
});

describe('割引・ポイントの掛け方（確かめること4・8）', () => {
  it('税込 321円・30円引き・20%引き → 232円', () => {
    const r = ok(effectivePrice(321, 'inclusive', { yenOff: 30, percentOff: 20 }));
    expect(r.pay).toBe(232);
  });

  it('税抜 8% 298円・30円引き・20%引き → 231円（途中で丸めない）', () => {
    // 途中で丸めると 268 → 214 → 231.12 → 231 で同じに見えるので、途中の丸めで変わる例も見る
    const r = ok(effectivePrice(298, 'reduced', { yenOff: 30, percentOff: 20 }));
    expect(r.pay).toBe(231);
    // 税抜 10% 199円・15%引き：169.15 → ×1.1 = 186.065 → 186。途中で 169 に丸めると 185.9 → 185
    expect(ok(effectivePrice(199, 'standard', { percentOff: 15 })).pay).toBe(186);
  });

  it('円引きが先に掛かる（%引きが先なら 321×0.8−30 = 226.8 → 226 になる）', () => {
    const r = ok(effectivePrice(321, 'inclusive', { percentOff: 20, yenOff: 30 }));
    expect(r.pay).toBe(232);
    expect(r.pay).not.toBe(226);
  });

  it('結果に割引の順序を書く', () => {
    expect(discountOrderNote({ yenOff: 30, percentOff: 20 })).toBe('30円引きのあと20%引きで計算');
    expect(discountOrderNote({ percentOff: 20 })).toBe('20%引きで計算');
    expect(discountOrderNote({ yenOff: 30 })).toBe('30円引きで計算');
    expect(discountOrderNote({})).toBeNull();
    expect(discountOrderNote({ yenOff: 0, percentOff: 0, pointPercent: 5 })).toBeNull();
  });

  it('ポイント 5% は税込の支払額 232円に掛けて 11ポイント・実質 221円', () => {
    const r = ok(effectivePrice(321, 'inclusive', { yenOff: 30, percentOff: 20, pointPercent: 5 }));
    expect(r).toMatchObject({ pay: 232, points: 11, effective: 221 });
  });

  it('ポイントは支払う額に含めない', () => {
    const r = ok(effectivePrice(1000, 'inclusive', { pointPercent: 10 }));
    expect(r.pay).toBe(1000);
    expect(r.effective).toBe(900);
  });

  it('浮動小数の誤差で1円ずれない（1000円の80%引き = 200円）', () => {
    expect(ok(effectivePrice(1000, 'inclusive', { percentOff: 80 })).pay).toBe(200);
  });

  it('範囲外は理由を返す', () => {
    expect(effectivePrice(0, 'inclusive')).toEqual({ error: 'price' });
    expect(effectivePrice(Number.NaN, 'inclusive')).toEqual({ error: 'price' });
    expect(effectivePrice(100, 'inclusive', { yenOff: 100 })).toEqual({ error: 'yen-off' });
    expect(effectivePrice(100, 'inclusive', { percentOff: 100 })).toEqual({ error: 'percent-off' });
    expect(effectivePrice(100, 'inclusive', { pointPercent: -1 })).toEqual({ error: 'point' });
  });
});

describe('rank（確かめること2）', () => {
  it('100g あたりの安い順に並べ、いちばん安い行に印を付ける', () => {
    const rows = rank(
      [
        item({ name: '大袋', price: 498, qty: 1, unit: 'kg' }),
        item({ name: '小袋', price: 198, qty: 300, unit: 'g' }),
      ],
      'small',
    );
    const r = rankedOnly(rows);
    expect(r.map((x) => x.name)).toEqual(['大袋', '小袋']);
    expect(r[0]).toMatchObject({ rank: 1, cheapest: true, perLabel: '100g' });
    expect(r[0].unitPrice).toBeCloseTo(49.8, 10);
    expect(r[1].unitPrice).toBeCloseTo(66, 10);
    expect(r[1].diffYen).toBeCloseTo(16.2, 10);
    expect(r[1].diffPercent).toBeCloseTo(32.53, 1);
    expect(r[1].cheapest).toBe(false);
  });

  it('同じ値段で買える量：小袋の 198円なら大袋は 397g（切り捨て）', () => {
    const r = rankedOnly(
      rank([item({ price: 498, qty: 1, unit: 'kg' }), item({ price: 198, qty: 300, unit: 'g' })], 'small'),
    );
    expect(r[1].sameMoneyQty).toBeCloseTo((198 / 498) * 1000, 10);
    expect(formatQty(r[1].sameMoneyQty as number, 'g')).toBe('397g');
    expect(r[0].sameMoneyQty).toBeUndefined();
  });

  it('1kg あたりに切り替えると単価が10倍', () => {
    const r = rankedOnly(rank([item({ price: 498, qty: 1, unit: 'kg' }), item({ price: 198, qty: 300, unit: 'g' })], 'large'));
    expect(r[0].unitPrice).toBeCloseTo(498, 10);
    expect(r[0].perLabel).toBe('1kg');
  });

  it('g と ml の行が混ざったら、少ないほうの行を順位から外して理由を出す', () => {
    const rows = rank(
      [
        item({ price: 200, qty: 500, unit: 'ml' }),
        item({ price: 300, qty: 1, unit: 'L' }),
        item({ price: 150, qty: 400, unit: 'g' }),
      ],
      'small',
    );
    expect(rows[2].status).toBe('mismatch');
    expect(rows[2].message).toContain('単位が違います');
    expect(rows[2].rank).toBeUndefined();
    expect(rankedOnly(rows).map((r) => r.index)).toEqual([1, 0]);
  });

  it('「個」と「枚」が混ざったときも外れる（数の系統は同じ単位どうしだけ）', () => {
    const rows = rank(
      [item({ price: 300, qty: 10, unit: '個' }), item({ price: 200, qty: 5, unit: '枚' })],
      'small',
    );
    // 同数のときは上の行の組で比べる
    expect(rows[0].status).toBe('ranked');
    expect(rows[1].status).toBe('mismatch');
    expect(rows[1].message).toContain('単位が違います');
  });

  it('数の系統は 1個 / 10個あたり', () => {
    const r = rankedOnly(rank([item({ price: 300, qty: 10, unit: '個' }), item({ price: 250, qty: 8, unit: '個' })], 'small'));
    expect(r[0].perLabel).toBe('1個');
    expect(r[0].unitPrice).toBeCloseTo(30, 10);
    expect(perLabel('count', '個', 'large')).toBe('10個');
  });

  it('入り数を掛けて比べる（350ml×6×2 と 500ml×24）', () => {
    const r = rankedOnly(
      rank(
        [
          item({ name: '6缶×2', price: 2280, qty: 350, unit: 'ml', packs: [6, 2] }),
          item({ name: 'ケース', price: 3480, qty: 500, unit: 'ml', packs: [24] }),
        ],
        'small',
      ),
    );
    expect(r.map((x) => x.name)).toEqual(['ケース', '6缶×2']);
    expect(r[1].quantity?.base).toBe(4200);
  });

  it('ポイント込みの実質単価で順位を付ける（支払額の単価も持つ）', () => {
    const r = rankedOnly(
      rank(
        [
          item({ name: 'A', price: 1000, qty: 1000 }),
          item({ name: 'B', price: 1050, qty: 1000, discounts: { pointPercent: 10 } }),
        ],
        'small',
      ),
    );
    expect(r[0].name).toBe('B');
    expect(r[0].unitPrice).toBeCloseTo(105, 10);
    expect(r[0].effectiveUnitPrice).toBeCloseTo(94.5, 10);
  });

  it('差が 0.1% 未満なら「ほぼ同じ」', () => {
    const r = rankedOnly(rank([item({ price: 10000, qty: 100 }), item({ price: 10005, qty: 100 })], 'small'));
    expect(r[1].nearlySame).toBe(true);
    const r2 = rankedOnly(rank([item({ price: 1000, qty: 100 }), item({ price: 1002, qty: 100 })], 'small'));
    expect(r2[1].nearlySame).toBe(false);
  });

  it('同じ単価なら入力の並び順', () => {
    const r = rankedOnly(rank([item({ name: 'X', price: 200, qty: 200 }), item({ name: 'Y', price: 100, qty: 100 })], 'small'));
    expect(r.map((x) => x.name)).toEqual(['X', 'Y']);
  });

  it('値段・量の無い行は invalid として外す。名前の欄が空なら A・B・C', () => {
    const rows = rank([item({ price: Number.NaN }), item({ qty: Number.NaN }), item({})], 'small');
    expect(rows[0]).toMatchObject({ status: 'invalid', name: 'A' });
    expect(rows[1]).toMatchObject({ status: 'invalid', name: 'B' });
    expect(rows[2]).toMatchObject({ status: 'ranked', name: 'C', rank: 1, cheapest: true });
    expect(defaultName(26)).toBe('27品目');
  });

  it('8品でも並べられる', () => {
    const items = Array.from({ length: 8 }, (_, i) => item({ price: 100 + i * 10, qty: 100 }));
    const r = rankedOnly(rank(items, 'small'));
    expect(r).toHaveLength(8);
    expect(r[0].index).toBe(0);
    expect(r[7].index).toBe(7);
  });
});

describe('実質値上げ率（確かめること5）', () => {
  it('200g 198円 → 180g 198円 = 単価 +11.1%', () => {
    const r = shrinkflation({ price: 198, qty: 200, unit: 'g' }, { price: 198, qty: 180, unit: 'g' });
    expect(formatChange(r!.unitPct)).toBe('+11.1%');
    expect(formatChange(r!.pricePct)).toBe('±0.0%');
    expect(formatChange(r!.qtyPct)).toBe('−10.0%');
  });

  it('200g 198円 → 200g 218円 = +10.1%', () => {
    const r = shrinkflation({ price: 198, qty: 200, unit: 'g' }, { price: 218, qty: 200, unit: 'g' });
    expect(formatChange(r!.unitPct)).toBe('+10.1%');
  });

  it('kg と g をまたいでも換算する（1kg → 900g）', () => {
    const r = shrinkflation({ price: 500, qty: 1, unit: 'kg' }, { price: 500, qty: 900, unit: 'g' });
    expect(r!.unitPct).toBeCloseTo((1000 / 900 - 1) * 100, 10);
  });

  it('系統が違う・値段が無いときは null', () => {
    expect(shrinkflation({ price: 198, qty: 200, unit: 'g' }, { price: 198, qty: 180, unit: 'ml' })).toBeNull();
    expect(shrinkflation({ price: 0, qty: 200, unit: 'g' }, { price: 198, qty: 180, unit: 'g' })).toBeNull();
  });
});

describe('入力の読み取りと表示', () => {
  it('全角数字・カンマ・「円」「g」を受け流す', () => {
    expect(parseLooseNumber('２９８円')).toBe(298);
    expect(parseLooseNumber('1,280')).toBe(1280);
    expect(parseLooseNumber('350ｍｌ')).toBe(350);
    expect(parseLooseNumber('１．５')).toBe(1.5);
    expect(parseLooseNumber('')).toBeNaN();
    expect(parseLooseNumber('円')).toBeNaN();
  });

  it('入り数の空欄は null（入れていない）', () => {
    expect(parsePack('')).toBeNull();
    expect(parsePack(' ')).toBeNull();
    expect(parsePack('６')).toBe(6);
  });

  it('単価は小数第2位まで（四捨五入）', () => {
    expect(formatUnitPrice(49.8)).toBe('49.80');
    expect(formatUnitPrice(66.666)).toBe('66.67');
    expect(formatUnitPrice(1234.5)).toBe('1,234.50');
  });

  it('品数の区分は 2・3・4以上', () => {
    expect(itemCountBucket(2)).toBe('2');
    expect(itemCountBucket(3)).toBe('3');
    expect(itemCountBucket(4)).toBe('4plus');
    expect(itemCountBucket(9)).toBe('4plus');
  });
});
