import { describe, expect, it } from 'vitest';
import {
  accumulate,
  AFFECTED_FROM,
  breakEvenYears,
  employeePremium,
  isAffected,
  monthsUntilEndAge,
  netCostWithTax,
  pensionCapAt,
  pensionGain,
  pensionGradeOf,
  premiumDiff,
  standardMonthlyAt,
} from '@/lib/kosei-nenkin-jogen';
import { PENSION_STANDARD_MAX, pensionStandardMonthly } from '@/lib/shaho-grades';
import { HAYAMIHYO_ROWS } from '@/app/kosei-nenkin-jogen/tables';

/**
 * 仕様: docs/features/kosei-nenkin-hyojun-hoshu-jogen.md
 * 金額は仕様書「背景と根拠」の表（厚労省の改正概要と日本年金機構の保険料額表から導いた値）。
 */

describe('pensionCapAt（施行日つきの上限）', () => {
  it('施行日の前日までは前の段階、当日から次の段階', () => {
    expect(pensionCapAt('2026-04-01')).toBe(650_000);
    expect(pensionCapAt('2027-08-31')).toBe(650_000);
    expect(pensionCapAt('2027-09-01')).toBe(680_000);
    expect(pensionCapAt('2028-08-31')).toBe(680_000);
    expect(pensionCapAt('2028-09-01')).toBe(710_000);
    expect(pensionCapAt('2029-08-31')).toBe(710_000);
    expect(pensionCapAt('2029-09-01')).toBe(750_000);
    expect(pensionCapAt('2040-01-01')).toBe(750_000);
  });

  it('現行の上限は既存の PENSION_STANDARD_MAX と一致する（置き換えまでの間ずれない）', () => {
    expect(pensionCapAt('2026-09-29')).toBe(PENSION_STANDARD_MAX);
  });
});

describe('standardMonthlyAt・等級', () => {
  it('現行は既存の pensionStandardMonthly と同じ', () => {
    for (const s of [50_000, 300_000, 634_999, 635_000, 700_000, 1_500_000]) {
      expect(standardMonthlyAt(s, '2026-09-29')).toBe(pensionStandardMonthly(s));
    }
  });

  it('境目は 66.5万・69.5万・73万円（健保 GRADES 36〜38 等級）', () => {
    const d = '2029-09-01';
    expect(standardMonthlyAt(664_999, d)).toBe(650_000);
    expect(standardMonthlyAt(665_000, d)).toBe(680_000);
    expect(standardMonthlyAt(694_999, d)).toBe(680_000);
    expect(standardMonthlyAt(695_000, d)).toBe(710_000);
    expect(standardMonthlyAt(729_999, d)).toBe(710_000);
    expect(standardMonthlyAt(730_000, d)).toBe(750_000);
    expect(standardMonthlyAt(2_000_000, d)).toBe(750_000);
  });

  it('等級は 32 → 33 → 34 → 35', () => {
    expect(pensionGradeOf(88_000)).toBe(1);
    expect(pensionGradeOf(650_000)).toBe(32);
    expect(pensionGradeOf(680_000)).toBe(33);
    expect(pensionGradeOf(710_000)).toBe(34);
    expect(pensionGradeOf(750_000)).toBe(35);
  });

  it('対象は報酬月額 66.5万円以上', () => {
    expect(AFFECTED_FROM).toBe(665_000);
    expect(isAffected(664_999)).toBe(false);
    expect(isAffected(665_000)).toBe(true);
  });
});

describe('employeePremium（本人負担）', () => {
  it('保険料額表の値（18.3% の半分）', () => {
    expect(employeePremium(650_000)).toBe(59_475);
    expect(employeePremium(680_000)).toBe(62_220);
    expect(employeePremium(710_000)).toBe(64_965);
    expect(employeePremium(750_000)).toBe(68_625);
  });

  it('全等級で整数演算（× 915 ÷ 10000）と一致する（二進小数の誤差で1円落ちない）', () => {
    for (const std of [88_000, 98_000, 104_000, 300_000, 650_000, 680_000, 710_000, 750_000]) {
      expect(employeePremium(std)).toBe((std * 915) / 10_000);
    }
  });
});

describe('premiumDiff（4時点）', () => {
  const cases: [number, number[]][] = [
    // 仕様書の表: 報酬月額 → [現行, 2027-09, 2028-09, 2029-09] の増加
    [600_000, [0, 0, 0, 0]],
    [650_000, [0, 0, 0, 0]],
    [670_000, [0, 2_745, 2_745, 2_745]],
    [700_000, [0, 2_745, 5_490, 5_490]],
    [730_000, [0, 2_745, 5_490, 9_150]],
    [800_000, [0, 2_745, 5_490, 9_150]],
    [1_000_000, [0, 2_745, 5_490, 9_150]],
  ];
  it.each(cases)('月給 %i 円', (salary, diffs) => {
    expect(premiumDiff(salary).map((p) => p.diff)).toEqual(diffs);
  });

  it('本人負担・会社負担・控除される給与月', () => {
    const r = premiumDiff(800_000);
    expect(r.map((p) => p.employee)).toEqual([59_475, 62_220, 64_965, 68_625]);
    expect(r.every((p) => p.employer === p.employee)).toBe(true);
    expect(r.map((p) => p.deductedFrom)).toEqual([null, '2027-10', '2028-10', '2029-10']);
    expect(r.map((p) => p.grade)).toEqual([32, 33, 34, 35]);
  });
});

describe('accumulate（保険料の増加累計と年金の増加）', () => {
  it('73万円以上で10年: 保険料 約98万円・年金 年 約5.9万円・比 17 年前後（仕様書の値）', () => {
    const a = accumulate(730_000, 120);
    expect(a.premiumTotal).toBe(2_745 * 12 + 5_490 * 12 + 9_150 * 96);
    expect(a.premiumTotal).toBe(977_220);
    // (3万×12 ＋ 6万×12 ＋ 10万×96) × 5.481/1000
    expect(a.pensionPerYear).toBe(Math.round(10_680_000 * 5.481 / 1000));
    expect(a.pensionPerYear).toBe(58_537);
    expect(a.pensionPerMonth).toBe(4_878);
    const years = breakEvenYears(a.premiumTotal, a.pensionPerYear) as number;
    expect(years).toBeGreaterThan(16);
    expect(years).toBeLessThan(18);
  });

  it('75万円で1か月払うごとに 65万円のときより年額 548 円（段階が終わったあと）', () => {
    const before = accumulate(730_000, 24);
    const after = accumulate(730_000, 25);
    // 10万円 × 5.481/1000 = 548.1 円。年額は合計してから円に丸めるので差は 548〜549
    expect(after.pensionPerYear - before.pensionPerYear).toBeGreaterThanOrEqual(548);
    expect(after.pensionPerYear - before.pensionPerYear).toBeLessThanOrEqual(549);
  });

  it('67万円は 2027-09 の段で止まる', () => {
    const a = accumulate(670_000, 120);
    expect(a.premiumTotal).toBe(2_745 * 120);
    expect(pensionGain(670_000, 120).perYear).toBe(Math.round(30_000 * 120 * 5.481 / 1000));
  });

  it('対象外なら 0・比は出さない', () => {
    const a = accumulate(600_000, 120);
    expect(a).toEqual({ months: 120, premiumTotal: 0, pensionPerYear: 0, pensionPerMonth: 0 });
    expect(breakEvenYears(0, 0)).toBeNull();
  });

  it('月数 0 や負は 0 か月', () => {
    expect(accumulate(800_000, 0).premiumTotal).toBe(0);
    expect(accumulate(800_000, -5).months).toBe(0);
  });
});

describe('netCostWithTax', () => {
  it('所得税率＋住民税10%の分を引く', () => {
    expect(netCostWithTax(9_150, 0.2)).toBe(Math.round(9_150 * 0.7));
    expect(netCostWithTax(9_150, 0.33)).toBe(Math.round(9_150 * 0.57));
    expect(netCostWithTax(0, 0.2)).toBe(0);
  });
});

describe('monthsUntilEndAge（60 歳まで）', () => {
  it('施行前に数えると 2027-09 から数える', () => {
    // 2026-09 に 50 歳 → 60 歳は 2036-09。2027-09 から 108 か月
    expect(monthsUntilEndAge(50, '2026-09-29')).toBe(108);
  });

  it('施行後に数えると今月から数える', () => {
    expect(monthsUntilEndAge(55, '2030-01-15')).toBe(60);
  });

  it('60 歳以上や施行前に 60 歳になる人は 0', () => {
    expect(monthsUntilEndAge(60, '2026-09-29')).toBe(0);
    expect(monthsUntilEndAge(59, '2026-09-29')).toBe(0);
    expect(monthsUntilEndAge(70, '2026-09-29')).toBe(0);
  });
});

describe('早見表（tables.ts）', () => {
  it('6行 × 4時点で、計算機と同じ値', () => {
    expect(HAYAMIHYO_ROWS.map((r) => r.salary)).toEqual([
      650_000, 670_000, 700_000, 730_000, 800_000, 1_000_000,
    ]);
    for (const row of HAYAMIHYO_ROWS) {
      expect(row.points).toEqual(premiumDiff(row.salary));
    }
  });
});
