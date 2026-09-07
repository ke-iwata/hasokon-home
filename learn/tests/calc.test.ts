import { describe, expect, it } from 'vitest';
import {
  compound,
  exactDoublingYears,
  futureValueOfSeries,
  manText,
  netRate,
  ruleOf72,
  series,
  simple,
  sweepBook,
  toMan,
} from '@/lib/calc';

/**
 * 期待値は独立に計算して確かめたもの。
 * **実装から生成した値をそのまま期待値にしない**（それでは何も見張れない）。
 */

describe('単利と複利', () => {
  it('1年目は単利と複利が同じ', () => {
    expect(simple(100, 0.03, 1)).toBeCloseTo(103, 10);
    expect(compound(100, 0.03, 1)).toBeCloseTo(103, 10);
  });

  it('元本100万円・年利3%の複利', () => {
    // 100 × 1.03^n
    expect(compound(100, 0.03, 10)).toBeCloseTo(134.39163793441222, 8);
    expect(compound(100, 0.03, 20)).toBeCloseTo(180.61112346694148, 8);
    expect(compound(100, 0.03, 30)).toBeCloseTo(242.72624711896623, 8);
    expect(compound(100, 0.03, 40)).toBeCloseTo(326.2037791999078, 8);
  });

  it('単利は年数に比例する', () => {
    expect(simple(100, 0.03, 40)).toBeCloseTo(220, 10);
    expect(simple(100, 0.03, 20) - 100).toBeCloseTo((simple(100, 0.03, 40) - 100) / 2, 10);
  });

  it('複利と単利の差は、後半の10年ほど大きくなる（本文の主張）', () => {
    const gap = (y: number) => compound(100, 0.03, y) - simple(100, 0.03, y);
    const first = gap(10) - gap(0);
    const last = gap(40) - gap(30);
    expect(last).toBeGreaterThan(first * 10);
  });

  it('0年目は元本のまま', () => {
    expect(compound(100, 0.05, 0)).toBe(100);
    expect(simple(100, 0.05, 0)).toBe(100);
  });

  it('利回り0%なら増えない', () => {
    expect(compound(100, 0, 30)).toBe(100);
    expect(simple(100, 0, 30)).toBe(100);
  });
});

describe('72の法則', () => {
  it('年利3%なら24年、6%なら12年', () => {
    expect(ruleOf72(3)).toBe(24);
    expect(ruleOf72(6)).toBe(12);
  });

  it('正確な年数とのずれは1年以内（近似として使える範囲）', () => {
    for (const p of [3, 5, 6, 8, 10]) {
      const diff = Math.abs(ruleOf72(p) - exactDoublingYears(p / 100));
      expect(diff, `年利${p}%`).toBeLessThan(1);
    }
  });

  it('正確な年数の定義どおり、その年数で2倍になる', () => {
    const years = exactDoublingYears(0.05);
    expect(compound(100, 0.05, years)).toBeCloseTo(200, 8);
  });

  it('年利4.8%を30年で約4倍（本文の例）', () => {
    expect(compound(1, 0.048, 30)).toBeCloseTo(4.0816, 3);
  });
});

describe('信託報酬', () => {
  it('実質利回りは差し引き', () => {
    expect(netRate(0.05, 0.015)).toBeCloseTo(0.035, 10);
  });

  it('元本100万円・リターン5%から信託報酬を引いた30年後', () => {
    expect(compound(100, netRate(0.05, 0.001), 30)).toBeCloseTo(420.02, 1);
    expect(compound(100, netRate(0.05, 0.005), 30)).toBeCloseTo(374.53, 1);
    expect(compound(100, netRate(0.05, 0.015), 30)).toBeCloseTo(280.68, 1);
  });

  it('0.1%と1.5%の30年後の差は元本と同じ規模（本文の主張）', () => {
    const diff =
      compound(100, netRate(0.05, 0.001), 30) - compound(100, netRate(0.05, 0.015), 30);
    expect(diff).toBeGreaterThan(100);
    expect(diff).toBeLessThan(180);
  });
});

describe('積立', () => {
  it('毎月3万円・年利5%（月複利）', () => {
    expect(futureValueOfSeries(3, 0.05, 10)).toBeCloseTo(465.84, 1);
    expect(futureValueOfSeries(3, 0.05, 20)).toBeCloseTo(1233.1, 1);
    expect(futureValueOfSeries(3, 0.05, 30)).toBeCloseTo(2496.8, 1);
  });

  it('利回り0%なら積み立てた元本のまま', () => {
    expect(futureValueOfSeries(3, 0, 10)).toBeCloseTo(360, 10);
  });

  it('必ず元本を上回る（利回りが正なら）', () => {
    for (const y of [1, 10, 30]) {
      expect(futureValueOfSeries(3, 0.05, y)).toBeGreaterThan(3 * y * 12);
    }
  });

  it('運用益の比率は年数とともに上がる（本文の主張）', () => {
    const ratio = (y: number) => {
      const fv = futureValueOfSeries(3, 0.05, y);
      return (fv - 3 * y * 12) / fv;
    };
    expect(ratio(10)).toBeLessThan(ratio(20));
    expect(ratio(20)).toBeLessThan(ratio(30));
  });
});

describe('図の系列', () => {
  it('0年目から指定年まで、両端を含む', () => {
    const s = series(30, (y) => y);
    expect(s[0]).toEqual({ year: 0, value: 0 });
    expect(s[s.length - 1]).toEqual({ year: 30, value: 30 });
    expect(s).toHaveLength(31);
  });

  it('刻みが割り切れなくても終端は必ず入る（線が途中で切れない）', () => {
    const s = series(10, (y) => y, 3);
    expect(s[s.length - 1].year).toBe(10);
  });
});

describe('成行が板を食う', () => {
  const book = [
    { price: 1000, qty: 100 },
    { price: 1050, qty: 200 },
    { price: 1200, qty: 500 },
  ];

  it('本文の例：800株の平均取得単価は1,137.5円', () => {
    const r = sweepBook(book, 800);
    expect(r.filled).toBe(800);
    expect(r.cost).toBe(910000);
    expect(r.average).toBeCloseTo(1137.5, 6);
  });

  it('いちばん上の段だけで足りるなら、その値段で約定する', () => {
    const r = sweepBook(book, 100);
    expect(r.average).toBe(1000);
    expect(r.fills).toEqual([{ price: 1000, qty: 100 }]);
  });

  it('板の厚みを超えたぶんは約定しない', () => {
    const r = sweepBook(book, 5000);
    expect(r.filled).toBe(800);
    expect(r.average).toBeCloseTo(1137.5, 6);
  });

  it('平均取得単価は必ず最良気配以上になる（成行は不利な方向にしか滑らない）', () => {
    for (const want of [50, 100, 150, 300, 800]) {
      expect(sweepBook(book, want).average).toBeGreaterThanOrEqual(1000);
    }
  });

  it('約定した数量の合計は filled と一致する', () => {
    const r = sweepBook(book, 450);
    expect(r.fills.reduce((s, f) => s + f.qty, 0)).toBe(r.filled);
  });
});

describe('表示の書式', () => {
  it('小数第1位を必ず出す（表の桁が揃うようにするため）', () => {
    expect(manText(103)).toBe('103.0');
    expect(manText(134.39163793441222)).toBe('134.4');
    expect(manText(420.0234)).toBe('420.0');
  });

  it('3桁区切りを入れる', () => {
    expect(manText(2496.8)).toBe('2,496.8');
    expect(manText(1233.06)).toBe('1,233.1');
  });

  it('toMan は小数第1位に丸めた数値を返す', () => {
    expect(toMan(134.39163793441222)).toBe(134.4);
    expect(toMan(0)).toBe(0);
  });
});
