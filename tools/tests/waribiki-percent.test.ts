import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROUNDING,
  DEFAULT_TAX_MODE,
  LOOKUP_PRICES,
  LOOKUP_RATES,
  LOOKUP_TABLE,
  ROUNDINGS,
  TAX_RATES,
  TAX_RATE_REDUCED,
  TAX_RATE_STANDARD,
  TAX_UPDATED_AT,
  applyDiscount,
  effectiveRate,
  formatPercent,
  formatYen,
  hasAtMostTwoDecimals,
  isValidPrice,
  isValidRate,
  lookupTable,
  percentChange,
  percentOf,
  percentOfExact,
  percentOfRounded,
  percentRatio,
  reverseDiscount,
  roundBy,
  roundFraction,
  taxRate,
  TOO_MANY_DECIMALS_MESSAGE,
  type Rounding,
} from '@/lib/waribiki-percent';

/**
 * 割引・パーセント計算のテスト。
 *
 * 仕様: docs/features/waribiki-percent-keisan.md
 *
 * 見張っているのは4つ。
 *
 * 1. **端数処理の3方式が境界で狙い通り効くこと**（切り捨て/四捨五入/切り上げ）。
 *    このツールの独自性の第一なので、境界値をピン留めする
 * 2. **二重割引が「和」ではなく「残率の積」で計算されていること**。
 *    30% + 20% = 50% と誤って足し算しないこと（44%が正）
 * 3. **税込／税抜モードで2段階の丸めが独立に効くこと**。
 *    税抜モードでは「割引後の税抜」と「割引後の税込」の両方に、
 *    選択した同じ方式が1回ずつ掛かる
 * 4. **早見表の値が計算機と完全に一致すること**（手書きしていない）
 */

describe('端数処理（roundBy）', () => {
  it('選べる方式は仕様どおり3つ（既定は四捨五入）', () => {
    expect(ROUNDINGS.map((r) => r.id)).toEqual(['floor', 'round', 'ceil']);
    expect(DEFAULT_ROUNDING).toBe('round');
  });

  it('境界値（0.5・1.5・2.5）が方式ごとに違う', () => {
    // 「レジと合わない」への答えなので、境界で3方式が確実に分かれる
    const cases: [number, Record<Rounding, number>][] = [
      [0.5, { floor: 0, round: 1, ceil: 1 }],
      [1.5, { floor: 1, round: 2, ceil: 2 }],
      [2.5, { floor: 2, round: 3, ceil: 3 }],
      [0.4, { floor: 0, round: 0, ceil: 1 }],
      [0.6, { floor: 0, round: 1, ceil: 1 }],
      [10, { floor: 10, round: 10, ceil: 10 }],
    ];
    for (const [value, expected] of cases) {
      for (const rounding of ['floor', 'round', 'ceil'] as Rounding[]) {
        expect(roundBy(value, rounding), `${value} @ ${rounding}`).toBe(expected[rounding]);
      }
    }
  });

  it('二進小数の誤差で境界がブレない（2.5・0.5の四捨五入が上に丸まる）', () => {
    // 素の Math.round は 2.5 → 2 になる実装があるが、
    // ここでは Number.EPSILON を足して 2.5 → 3、0.5 → 1 に揃える
    expect(roundBy(2.5, 'round')).toBe(3);
    expect(roundBy(0.5, 'round')).toBe(1);
    // 0.1 + 0.2 = 0.30000000000000004 も 0 に落とさない
    expect(roundBy(0.1 + 0.2, 'ceil')).toBe(1);
  });

  it('非有限数は NaN', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      for (const rounding of ['floor', 'round', 'ceil'] as Rounding[]) {
        expect(Number.isNaN(roundBy(bad, rounding))).toBe(true);
      }
    }
  });
});

describe('入力の妥当性', () => {
  it('割引率は 0〜100 の有限数', () => {
    for (const good of [0, 0.5, 10, 50, 99.9, 100]) expect(isValidRate(good)).toBe(true);
    for (const bad of [-0.001, -1, 100.01, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isValidRate(bad)).toBe(false);
    }
  });

  it('値段は 0以上の有限数', () => {
    for (const good of [0, 1, 100, 12345.67]) expect(isValidPrice(good)).toBe(true);
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(isValidPrice(bad)).toBe(false);
    }
  });
});

describe('割引（applyDiscount）', () => {
  it('よく引かれる「1,000円の30%オフ」= 700円', () => {
    const r = applyDiscount({ price: 1000, rates: [30], rounding: 'round' });
    expect(r?.discounted).toBe(700);
    expect(r?.saved).toBe(300);
    // 1 − (1 − 0.30) = 0.30 で二進小数の誤差が出るので、生の割引率は toBeCloseTo で受ける
    expect(r?.effectiveRate).toBeCloseTo(30, 10);
    expect(r?.taxMode).toBe('inclusive');
  });

  it('丸め方を変えると答えが変わる（3,980円の40%オフ）', () => {
    // 3980 × 0.6 = 2388 ちょうどなので丸めで動かない → 端数の出る例で確かめる
    // 1,235円の33%オフ → 1235 × 0.67 = 827.45
    const inputs: Rounding[] = ['floor', 'round', 'ceil'];
    const results = inputs.map(
      (r) => applyDiscount({ price: 1235, rates: [33], rounding: r })?.discounted,
    );
    expect(results).toEqual([827, 827, 828]);
  });

  it('元の値段が0なら答えも0', () => {
    const r = applyDiscount({ price: 0, rates: [30], rounding: 'round' });
    expect(r?.discounted).toBe(0);
    expect(r?.saved).toBe(0);
  });

  it('割引率が0なら値段はそのまま', () => {
    const r = applyDiscount({ price: 1000, rates: [0], rounding: 'round' });
    expect(r?.discounted).toBe(1000);
    expect(r?.saved).toBe(0);
    expect(r?.effectiveRate).toBe(0);
  });

  it('割引率が100なら0円になる（不正入力ではない）', () => {
    const r = applyDiscount({ price: 3980, rates: [100], rounding: 'round' });
    expect(r?.discounted).toBe(0);
    expect(r?.saved).toBe(3980);
  });

  it('無効な入力は null', () => {
    expect(applyDiscount({ price: -1, rates: [30], rounding: 'round' })).toBeNull();
    expect(applyDiscount({ price: Number.NaN, rates: [30], rounding: 'round' })).toBeNull();
    expect(applyDiscount({ price: 100, rates: [101], rounding: 'round' })).toBeNull();
    expect(applyDiscount({ price: 100, rates: [-1], rounding: 'round' })).toBeNull();
  });
});

describe('二重割引', () => {
  it('30%オフ→さらに20%オフ は 50%ではなく 44%', () => {
    expect(effectiveRate([30, 20])).toBeCloseTo(44, 10);
  });

  it('applyDiscount にも二重割引が反映される', () => {
    // 1,000円 → 30% → 700 → 20% → 560
    const r = applyDiscount({ price: 1000, rates: [30, 20], rounding: 'round' });
    expect(r?.discounted).toBe(560);
    expect(r?.saved).toBe(440);
    expect(r?.effectiveRate).toBeCloseTo(44, 10);
  });

  it('順番を入れ替えても結果は同じ', () => {
    const a = applyDiscount({ price: 1000, rates: [30, 20], rounding: 'round' });
    const b = applyDiscount({ price: 1000, rates: [20, 30], rounding: 'round' });
    expect(a?.discounted).toBe(b?.discounted);
    expect(a?.effectiveRate).toBeCloseTo(b?.effectiveRate as number, 10);
  });

  it('3段重ねも積で計算する（20%→10%→5% = 31.6%オフ）', () => {
    expect(effectiveRate([20, 10, 5])).toBeCloseTo(31.6, 10);
  });

  it('空配列なら割引0', () => {
    expect(effectiveRate([])).toBe(0);
  });
});

describe('税込／税抜モード', () => {
  it('既定は税込（`inclusive`）', () => {
    expect(DEFAULT_TAX_MODE).toBe('inclusive');
  });

  it('税込モードは税額を出さず、割引後の値段がそのまま支払額', () => {
    const r = applyDiscount({
      price: 3980,
      rates: [30],
      rounding: 'round',
      taxMode: 'inclusive',
    });
    // 3980 × 0.7 = 2786
    expect(r?.discounted).toBe(2786);
    expect(r?.discountedIncludingTax).toBeUndefined();
    expect(r?.tax).toBeUndefined();
    expect(r?.taxRateId).toBeUndefined();
  });

  it('税抜モード（10%）は「割引後の税抜 → 税込」を2段階で丸める', () => {
    const r = applyDiscount({
      price: 3980,
      rates: [30],
      rounding: 'round',
      taxMode: 'exclusive',
    });
    // 3980 × 0.7 = 2786（税抜）→ × 1.10 = 3064.6 → 3065（税込）
    expect(r?.discounted).toBe(2786);
    expect(r?.discountedIncludingTax).toBe(3065);
    expect(r?.tax).toBe(279);
    expect(r?.taxRateId).toBe('standard');
  });

  it('税抜モード（軽減8%）に切り替えられる', () => {
    const r = applyDiscount({
      price: 500,
      rates: [10],
      rounding: 'round',
      taxMode: 'exclusive',
      taxRateId: 'reduced',
    });
    // 500 × 0.9 = 450（税抜）→ × 1.08 = 486（税込）
    expect(r?.discounted).toBe(450);
    expect(r?.discountedIncludingTax).toBe(486);
    expect(r?.tax).toBe(36);
    expect(r?.taxRateId).toBe('reduced');
  });

  it('税抜モードで丸め方を変えると2段階それぞれで違いが出る', () => {
    // 1,235円の33%オフ → 税込10%
    // 生の値: 827.45（税抜）→ 910.195（税込）
    const floor = applyDiscount({
      price: 1235,
      rates: [33],
      rounding: 'floor',
      taxMode: 'exclusive',
    });
    // floor: 827（税抜）→ 827×1.10=909.7 → floor で 909
    expect(floor?.discounted).toBe(827);
    expect(floor?.discountedIncludingTax).toBe(909);

    const ceil = applyDiscount({
      price: 1235,
      rates: [33],
      rounding: 'ceil',
      taxMode: 'exclusive',
    });
    // ceil: 828（税抜）→ 828×1.10=910.8 → ceil で 911
    expect(ceil?.discounted).toBe(828);
    expect(ceil?.discountedIncludingTax).toBe(911);
  });

  it('税込額と税抜額の差が「税」として出る（差分で必ず整合する）', () => {
    const r = applyDiscount({
      price: 3980,
      rates: [30],
      rounding: 'round',
      taxMode: 'exclusive',
    });
    expect(r?.tax).toBe((r?.discountedIncludingTax as number) - (r?.discounted as number));
  });

  it('税率は定数1か所に集約されている', () => {
    expect(TAX_RATE_STANDARD).toBe(0.1);
    expect(TAX_RATE_REDUCED).toBe(0.08);
    expect(taxRate('standard').rate).toBe(TAX_RATE_STANDARD);
    expect(taxRate('reduced').rate).toBe(TAX_RATE_REDUCED);
    expect(TAX_RATES.map((r) => r.id)).toEqual(['standard', 'reduced']);
    // 施行日は2019-10-01（8%→10%）以降動いていない
    expect(TAX_UPDATED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('未知の税率IDは投げる', () => {
    expect(() => taxRate('vip' as never)).toThrow(/税率/);
  });
});

describe('割引率の逆算（reverseDiscount）', () => {
  it('1,000円 → 700円 は 30%オフ・値引き300円', () => {
    const r = reverseDiscount({ original: 1000, sale: 700 });
    expect(r?.rate).toBe(30);
    expect(r?.saved).toBe(300);
  });

  it('半額なら 50%オフ', () => {
    const r = reverseDiscount({ original: 3980, sale: 1990 });
    expect(r?.rate).toBeCloseTo(50, 10);
  });

  it('売値が同じなら 0%（値引きなし）', () => {
    const r = reverseDiscount({ original: 1000, sale: 1000 });
    expect(r?.rate).toBe(0);
    expect(r?.saved).toBe(0);
  });

  it('売値が元の値段より高いと負の値（マークアップ）', () => {
    const r = reverseDiscount({ original: 1000, sale: 1100 });
    expect(r?.rate).toBe(-10);
    expect(r?.saved).toBe(-100);
  });

  it('元の値段が0なら null（何をかけても0で意味がない）', () => {
    expect(reverseDiscount({ original: 0, sale: 0 })).toBeNull();
    expect(reverseDiscount({ original: 0, sale: 100 })).toBeNull();
  });

  it('無効な入力は null', () => {
    expect(reverseDiscount({ original: Number.NaN, sale: 100 })).toBeNull();
    expect(reverseDiscount({ original: 100, sale: -1 })).toBeNull();
  });
});

describe('パーセント計算', () => {
  it('percentOf: 1,200円 の 8% は 96', () => {
    expect(percentOf(1200, 8)).toBe(96);
  });

  it('percentOf: 0% は0、100%は同じ数', () => {
    expect(percentOf(1000, 0)).toBe(0);
    expect(percentOf(1000, 100)).toBe(1000);
  });

  it('percentRatio: 300 は 1200 の 25%', () => {
    expect(percentRatio(300, 1200)).toBe(25);
  });

  it('percentRatio: 分母が0なら null', () => {
    expect(percentRatio(100, 0)).toBeNull();
  });

  it('percentChange: 1,000 → 1,200 は +20%', () => {
    expect(percentChange(1000, 1200)).toBeCloseTo(20, 10);
  });

  it('percentChange: 1,000 → 800 は −20%', () => {
    expect(percentChange(1000, 800)).toBeCloseTo(-20, 10);
  });

  it('percentChange: 元が0なら null', () => {
    expect(percentChange(0, 100)).toBeNull();
  });

  it('無効な入力はすべて null', () => {
    for (const [a, b] of [
      [Number.NaN, 1],
      [1, Number.NaN],
      [Number.POSITIVE_INFINITY, 1],
    ] as [number, number][]) {
      expect(percentOf(a, b)).toBeNull();
      expect(percentRatio(a, b)).toBeNull();
      expect(percentChange(a, b)).toBeNull();
    }
  });
});

describe('早見表', () => {
  it('仕様どおりの価格と割引率を並べる', () => {
    expect(LOOKUP_PRICES).toEqual([100, 500, 1000, 2000, 3000, 5000, 8000, 10000]);
    expect(LOOKUP_RATES).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90]);
    expect(LOOKUP_TABLE).toHaveLength(LOOKUP_PRICES.length);
    expect(LOOKUP_TABLE[0]).toHaveLength(LOOKUP_RATES.length);
  });

  it('表の値は applyDiscount と完全に一致する（手書きしていない）', () => {
    for (const [i, price] of LOOKUP_PRICES.entries()) {
      for (const [j, rate] of LOOKUP_RATES.entries()) {
        const cell = LOOKUP_TABLE[i][j];
        const r = applyDiscount({ price, rates: [rate], rounding: DEFAULT_ROUNDING });
        expect(cell.discounted).toBe(r?.discounted);
        expect(cell.saved).toBe(r?.saved);
      }
    }
  });

  it('代表マス（1,000円 × 30%オフ = 700円）', () => {
    const i = LOOKUP_PRICES.indexOf(1000);
    const j = LOOKUP_RATES.indexOf(30);
    expect(LOOKUP_TABLE[i][j].discounted).toBe(700);
    expect(LOOKUP_TABLE[i][j].saved).toBe(300);
  });

  it('丸め方を変えると別の表が作れる（切り上げ・切り捨て）', () => {
    // 100円の30%オフ = 70 ちょうど → 全部同じになるので、端数の出る 100 × 33% で確かめる
    const rowsFloor = lookupTable([100], [33], 'floor');
    const rowsCeil = lookupTable([100], [33], 'ceil');
    // 100 × 0.67 = 67 ちょうど → 差が出ないので 350 × 33 で
    const a = lookupTable([350], [33], 'floor')[0][0];
    const b = lookupTable([350], [33], 'ceil')[0][0];
    // 350 × 0.67 = 234.5 → floor 234, ceil 235
    expect(a.discounted).toBe(234);
    expect(b.discounted).toBe(235);
    // 100 × 33 = 67 ちょうどの確認（丸めで動かない）
    expect(rowsFloor[0][0].discounted).toBe(rowsCeil[0][0].discounted);
  });

  it('負の入力はエラー（黙って空セルを作らない）', () => {
    expect(() => lookupTable([-1], [10])).toThrow(/早見表/);
  });
});

describe('表示ヘルパ', () => {
  it('formatYen: 3桁区切り＋「円」', () => {
    expect(formatYen(0)).toBe('0円');
    expect(formatYen(1000)).toBe('1,000円');
    expect(formatYen(12345)).toBe('12,345円');
  });

  it('formatYen: 非有限数はダッシュ', () => {
    expect(formatYen(Number.NaN)).toBe('—');
  });

  it('formatPercent: 整数はそのまま、端数があれば小数1桁', () => {
    expect(formatPercent(30)).toBe('30%');
    expect(formatPercent(44)).toBe('44%');
    expect(formatPercent(31.6)).toBe('31.6%');
    expect(formatPercent(31.66)).toBe('31.7%');
  });

  it('formatPercent: 非有限数はダッシュ', () => {
    expect(formatPercent(Number.NaN)).toBe('—');
  });
});

/* ===================================================================
   2026-11-06 点検 A1：浮動小数の誤差で1円ずれない
   仕様: docs/features/kokai-tool-seikaku-2026-11-06.md
   =================================================================== */
describe('浮動小数の誤差で1円ずれない（2026-11-06 点検 A1）', () => {
  it('1000円の80%オフを切り捨てると200円（199円ではない）', () => {
    expect(applyDiscount({ price: 1000, rates: [80], rounding: 'floor' })?.discounted).toBe(200);
  });
  it('1000円の70%オフを切り上げると300円（301円ではない）', () => {
    expect(applyDiscount({ price: 1000, rates: [70], rounding: 'ceil' })?.discounted).toBe(300);
  });
  it('100円の55%オフを切り捨てると45円（44円ではない）', () => {
    expect(applyDiscount({ price: 100, rates: [55], rounding: 'floor' })?.discounted).toBe(45);
  });
  it('1000円を30%オフ→さらに20%オフ、切り捨てで560円（559円ではない）', () => {
    expect(applyDiscount({ price: 1000, rates: [30, 20], rounding: 'floor' })?.discounted).toBe(560);
  });
  it('税抜100円に10%を切り上げると税込110円（111円ではない）', () => {
    const r = applyDiscount({ price: 100, rates: [0], rounding: 'ceil', taxMode: 'exclusive' });
    expect(r?.discountedIncludingTax).toBe(110);
    expect(r?.tax).toBe(10);
  });
  it('375の18.4%を切り捨てると69（68ではない）', () => {
    expect(percentOfRounded(375, 18.4, 'floor')).toBe(69);
    expect(percentOfExact(375, 18.4)).toBe('69');
  });
  it('percentOfExact は二進小数の誤差を出さない', () => {
    expect(percentOfExact(33, 12.34)).toBe('4.0722');
    expect(percentOfExact(1200, 8)).toBe('96');
    expect(percentOfExact(-50, 10)).toBe('-5');
    expect(percentOfExact(Number.NaN, 10)).toBeNull();
  });
  it('percentOfRounded は 3 方式とも正しい向きに丸める', () => {
    expect(percentOfRounded(1000, 8.5, 'floor')).toBe(85);
    expect(percentOfRounded(105, 10, 'floor')).toBe(10);
    expect(percentOfRounded(105, 10, 'round')).toBe(11);
    expect(percentOfRounded(105, 10, 'ceil')).toBe(11);
    expect(percentOfRounded(-105, 10, 'floor')).toBe(Math.floor(-10.5));
    expect(percentOfRounded(-105, 10, 'ceil')).toBe(Math.ceil(-10.5));
    expect(percentOfRounded(-105, 10, 'round')).toBe(Math.round(-10.5));
  });

  it('性質：価格1〜2,000円×割引1〜99%の総当たりで BigInt の正解と一致する', () => {
    const roundings: Rounding[] = ['floor', 'round', 'ceil'];
    const expected = (price: number, rate: number, rounding: Rounding): number => {
      const n = BigInt(price) * BigInt(100 - rate);
      const d = 100n;
      if (rounding === 'floor') return Number(n / d);
      if (rounding === 'ceil') return Number((n + d - 1n) / d);
      return Number((2n * n + d) / (2n * d));
    };
    let mismatches = 0;
    for (let price = 1; price <= 2000; price++) {
      for (let rate = 1; rate <= 99; rate++) {
        for (const rounding of roundings) {
          const got = applyDiscount({ price, rates: [rate], rounding })?.discounted;
          if (got !== expected(price, rate, rounding)) mismatches++;
        }
      }
    }
    expect(mismatches).toBe(0);
  });

  it('小数第2位までの率は判定を文字列で行う', () => {
    expect(hasAtMostTwoDecimals('33.33')).toBe(true);
    expect(hasAtMostTwoDecimals('1.1')).toBe(true);
    expect(hasAtMostTwoDecimals('30')).toBe(true);
    expect(hasAtMostTwoDecimals('')).toBe(true);
    expect(hasAtMostTwoDecimals('33.333')).toBe(false);
    expect(hasAtMostTwoDecimals('0.005')).toBe(false);
    expect(TOO_MANY_DECIMALS_MESSAGE).toContain('小数第2位まで');
  });

  it('roundFraction は分母が0以下なら例外', () => {
    expect(() => roundFraction(1n, 0n, 'floor')).toThrow();
  });
});

describe('巨大な値で例外を投げない（#467 レビュー）', () => {
  it('applyDiscount は 1e307 で throw せず null を返す', () => {
    expect(() => applyDiscount({ price: 1e307, rates: [10], rounding: 'floor' })).not.toThrow();
    expect(applyDiscount({ price: 1e307, rates: [10], rounding: 'floor' })).toBeNull();
  });
  it('percentOfRounded・percentOfExact も 1e307 で null', () => {
    expect(percentOfRounded(1e307, 10, 'floor')).toBeNull();
    expect(percentOfRounded(10, 1e307, 'floor')).toBeNull();
    expect(percentOfExact(1e307, 10)).toBeNull();
  });
  it('ふつうの大きな額（1兆円）は計算できる', () => {
    expect(applyDiscount({ price: 1e12, rates: [10], rounding: 'floor' })?.discounted).toBe(9e11);
  });
});
