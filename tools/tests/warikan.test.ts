import { describe, expect, it } from 'vitest';
import { calcWarikan, type WarikanInput } from '@/lib/warikan';

const base: WarikanInput = {
  total: 25000,
  people: 5,
  roundUnit: 100,
  mode: 'kanji-less',
};

describe('calcWarikan（基本ケース）', () => {
  it('25000円・5人・100円丸め切り上げ → 全員5000円ぴったり', () => {
    const r = calcWarikan(base);
    expect(r.perPerson).toBe(5000);
    expect(r.kanji).toBe(5000);
    expect(r.collected).toBe(25000);
  });

  it('23456円・5人・100円切り上げ → 参加者4700円×4 + 幹事4656円', () => {
    const r = calcWarikan({ ...base, total: 23456 });
    expect(r.perPerson).toBe(4700);
    expect(r.kanji).toBe(4656);
    expect(r.collected).toBe(23456);
  });

  it('23456円・5人・100円切り捨て（幹事が端数を負担）→ 参加者4600円×4 + 幹事5056円', () => {
    const r = calcWarikan({ ...base, total: 23456, mode: 'kanji-more' });
    expect(r.perPerson).toBe(4600);
    expect(r.kanji).toBe(5056);
    expect(r.collected).toBe(23456);
  });

  it('均等モード: 23456円・5人 → 参加者4691円×4 + 幹事4692円', () => {
    const r = calcWarikan({ ...base, total: 23456, mode: 'equal' });
    expect(r.perPerson).toBe(4691);
    expect(r.kanji).toBe(4692);
    expect(r.collected).toBe(23456);
  });

  it('切り上げで集めすぎた場合、幹事はマイナス（お釣り）になる', () => {
    // 100円・3人・500円切り上げ → 参加者500円×2 = 1000円で 900円のお釣り
    const r = calcWarikan({ total: 100, people: 3, roundUnit: 500, mode: 'kanji-less' });
    expect(r.perPerson).toBe(500);
    expect(r.kanji).toBe(-900);
    expect(r.collected).toBe(100);
  });
});

describe('calcWarikan（検算: 集金合計は常に合計と一致）', () => {
  const totals = [0, 1, 100, 999, 12345, 23456, 25000, 100001];
  const peoples = [1, 2, 3, 5, 7, 12];
  const units = [1, 10, 100, 500, 1000];
  const modes: WarikanInput['mode'][] = ['kanji-more', 'kanji-less', 'equal'];

  it('全組み合わせで perPerson×(人数−1) + kanji === total', () => {
    for (const total of totals) {
      for (const people of peoples) {
        for (const roundUnit of units) {
          for (const mode of modes) {
            const r = calcWarikan({ total, people, roundUnit, mode });
            expect(r.collected).toBe(total);
            expect(r.perPerson * (people - 1) + r.kanji).toBe(total);
          }
        }
      }
    }
  });
});

describe('calcWarikan（エッジケース）', () => {
  it('1人の場合は幹事が全額', () => {
    const r = calcWarikan({ ...base, people: 1 });
    expect(r.kanji).toBe(25000);
    expect(r.collected).toBe(25000);
  });

  it('割り切れる場合はどのモードでも全員同額', () => {
    for (const mode of ['kanji-more', 'kanji-less', 'equal'] as const) {
      const r = calcWarikan({ total: 30000, people: 6, roundUnit: 100, mode });
      expect(r.perPerson).toBe(5000);
      expect(r.kanji).toBe(5000);
    }
  });

  it('0円の場合は全員0円', () => {
    const r = calcWarikan({ ...base, total: 0 });
    expect(r.perPerson).toBe(0);
    expect(r.kanji).toBe(0);
    expect(r.collected).toBe(0);
  });

  it('不正入力は補正される（負の合計→0、人数0→1、丸め単位0→1）', () => {
    expect(calcWarikan({ total: -100, people: 5, roundUnit: 100, mode: 'equal' }).collected).toBe(0);
    expect(calcWarikan({ total: 1000, people: 0, roundUnit: 100, mode: 'equal' }).kanji).toBe(1000);
    const r = calcWarikan({ total: 1000, people: 3, roundUnit: 0, mode: 'kanji-less' });
    expect(r.perPerson).toBe(334);
    expect(r.collected).toBe(1000);
  });
});
