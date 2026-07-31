import { describe, expect, it } from 'vitest';
import { TAIKI_DAYS, calcShobyoTeate } from '@/lib/shobyo-teate';

describe('calcShobyoTeate（日額の計算）', () => {
  it('標準報酬月額30万円 → 標準報酬日額10,000円 → 日額6,667円', () => {
    // 300,000 ÷ 30 = 10,000円 → × 2/3 = 6,666.67 → 四捨五入で6,667円
    const r = calcShobyoTeate({ monthlyIncome: 300_000, restDays: 30 });
    expect(r.standardMonthly).toBe(300_000);
    expect(r.standardDaily).toBe(10_000);
    expect(r.dailyAmount).toBe(6_667);
  });

  it('標準報酬日額は10円未満四捨五入（10円単位）になる', () => {
    // 月収20万円 → 標準報酬月額200,000 → ÷30 = 6,666.67 → 6,670円
    const r = calcShobyoTeate({ monthlyIncome: 200_000, restDays: 30 });
    expect(r.standardMonthly).toBe(200_000);
    expect(r.standardDaily).toBe(6_670);
    // 6,670 × 2/3 = 4,446.67 → 4,447円
    expect(r.dailyAmount).toBe(4_447);
  });

  it('等級表で丸めてから計算する: 月収31万円 → 標準報酬月額32万円', () => {
    const r = calcShobyoTeate({ monthlyIncome: 310_000, restDays: 30 });
    expect(r.standardMonthly).toBe(320_000);
    // 320,000 ÷ 30 = 10,666.67 → 10,670円 → × 2/3 = 7,113.33 → 7,113円
    expect(r.standardDaily).toBe(10_670);
    expect(r.dailyAmount).toBe(7_113);
  });

  it('月額目安は日額×30', () => {
    const r = calcShobyoTeate({ monthlyIncome: 300_000, restDays: 30 });
    expect(r.monthlyEstimate).toBe(6_667 * 30);
  });
});

describe('calcShobyoTeate（待期3日間と支給対象日数）', () => {
  it('休業3日以下は待期期間のみで支給0円', () => {
    for (const restDays of [0, 1, 2, 3]) {
      const r = calcShobyoTeate({ monthlyIncome: 300_000, restDays });
      expect(r.payableDays).toBe(0);
      expect(r.total).toBe(0);
    }
  });

  it('休業4日目から支給される（境界値）', () => {
    const r = calcShobyoTeate({ monthlyIncome: 300_000, restDays: 4 });
    expect(r.payableDays).toBe(1);
    expect(r.total).toBe(6_667);
  });

  it('休業30日 → 支給対象27日分', () => {
    const r = calcShobyoTeate({ monthlyIncome: 300_000, restDays: 30 });
    expect(r.payableDays).toBe(30 - TAIKI_DAYS);
    expect(r.payableDays).toBe(27);
    expect(r.total).toBe(6_667 * 27);
  });

  it('休業日数の小数は切り捨てて扱う', () => {
    const r = calcShobyoTeate({ monthlyIncome: 300_000, restDays: 4.9 });
    expect(r.payableDays).toBe(1);
  });
});

describe('calcShobyoTeate（不正な入力）', () => {
  it('負の月収は0として扱い、最低等級で計算する', () => {
    const r = calcShobyoTeate({ monthlyIncome: -100, restDays: 30 });
    expect(r.standardMonthly).toBe(58_000); // 1等級
    // 58,000 ÷ 30 = 1,933.33 → 1,930円 → × 2/3 = 1,286.67 → 1,287円
    expect(r.standardDaily).toBe(1_930);
    expect(r.dailyAmount).toBe(1_287);
  });

  it('負の休業日数は0として扱う', () => {
    const r = calcShobyoTeate({ monthlyIncome: 300_000, restDays: -5 });
    expect(r.payableDays).toBe(0);
    expect(r.total).toBe(0);
  });
});
