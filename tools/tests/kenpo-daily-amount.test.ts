import { describe, expect, it } from 'vitest';
import { SHORT_TENURE_CAP, kenpoDailyAmount } from '@/lib/kenpo-daily-amount';
import { calcShobyoTeate } from '@/lib/shobyo-teate';
import { calcShussanTeate } from '@/lib/shussan-teate';
import { parseDate } from '@/lib/date-parts';

/**
 * 日額の計算は傷病手当金と出産手当金で同一（健康保険法102条2項が99条2項を準用）。
 * 切り出したあとも2ツールが同じ数字を返すことを見張る。
 */
describe('kenpoDailyAmount', () => {
  it('標準報酬月額30万円 → 標準報酬日額10,000円 → 日額6,667円', () => {
    const r = kenpoDailyAmount(300_000);
    expect(r.standardMonthly).toBe(300_000);
    expect(r.standardDaily).toBe(10_000);
    expect(r.dailyAmount).toBe(6_667);
    expect(r.capped).toBe(false);
  });

  it('標準報酬日額は10円未満四捨五入（10円単位）になる', () => {
    const r = kenpoDailyAmount(200_000);
    expect(r.standardDaily).toBe(6_670);
    expect(r.dailyAmount).toBe(4_447);
  });

  it('等級表で丸めてから計算する: 月収31万円 → 標準報酬月額32万円', () => {
    expect(kenpoDailyAmount(310_000).standardMonthly).toBe(320_000);
  });

  it('被保険者期間12ヶ月未満は32万円が上限（日額7,113円で頭打ち）', () => {
    const r = kenpoDailyAmount(800_000, true);
    expect(r.capped).toBe(true);
    expect(r.standardMonthly).toBe(SHORT_TENURE_CAP);
    expect(r.dailyAmount).toBe(7_113);
  });

  it('上限より低い月収では12ヶ月未満でも上限は当たらない', () => {
    const r = kenpoDailyAmount(200_000, true);
    expect(r.capped).toBe(false);
    expect(r.standardMonthly).toBe(200_000);
  });

  it('マイナスの月収は0として扱う', () => {
    expect(kenpoDailyAmount(-100_000).dailyAmount).toBe(kenpoDailyAmount(0).dailyAmount);
  });
});

describe('傷病手当金と出産手当金の日額が一致する（同じ関数を通っている）', () => {
  const due = parseDate('2026-10-01')!;

  for (const [income, under12] of [
    [300_000, false],
    [200_000, false],
    [410_000, false],
    [800_000, true],
  ] as const) {
    it(`月収${income.toLocaleString('ja-JP')}円 / 12ヶ月未満=${under12}`, () => {
      const shobyo = calcShobyoTeate({ monthlyIncome: income, restDays: 60, under12Months: under12 });
      const shussan = calcShussanTeate({ dueDate: due, monthlyIncome: income, under12Months: under12 })!;
      expect(shussan.dailyAmount).toBe(shobyo.dailyAmount);
      expect(shussan.standardDaily).toBe(shobyo.standardDaily);
      expect(shussan.standardMonthly).toBe(shobyo.standardMonthly);
      expect(shussan.capped).toBe(shobyo.capped);
    });
  }
});
