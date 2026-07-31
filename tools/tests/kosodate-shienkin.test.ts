import { describe, expect, it } from 'vitest';
import {
  BONUS_CAP_YEARLY,
  GRADES,
  calcShienkin,
  roundPremium,
  standardMonthly,
} from '@/lib/kosodate-shienkin';

describe('standardMonthly（標準報酬月額の等級判定）', () => {
  it('等級表の境界値を正しく判定する', () => {
    expect(standardMonthly(0)).toBe(58_000); // 1等級
    expect(standardMonthly(62_999)).toBe(58_000);
    expect(standardMonthly(63_000)).toBe(68_000); // 2等級（下限は「以上」）
    expect(standardMonthly(194_999)).toBe(190_000); // 16等級
    expect(standardMonthly(195_000)).toBe(200_000); // 17等級
    expect(standardMonthly(300_000)).toBe(300_000); // 22等級
    expect(standardMonthly(310_000)).toBe(320_000); // 23等級
    expect(standardMonthly(1_354_999)).toBe(1_330_000); // 49等級
    expect(standardMonthly(1_355_000)).toBe(1_390_000); // 50等級（上限なし）
    expect(standardMonthly(10_000_000)).toBe(1_390_000);
  });

  it('等級表が連続している（隙間・重複がない）', () => {
    for (let i = 1; i < GRADES.length; i++) {
      expect(GRADES[i][2]).toBe(GRADES[i - 1][3]); // 前の上限 = 次の下限
    }
  });
});

describe('roundPremium（50銭以下切り捨て・50銭超切り上げ）', () => {
  it('端数処理のルールに従う', () => {
    expect(roundPremium(471.5)).toBe(471); // ちょうど50銭 → 切り捨て
    expect(roundPremium(471.51)).toBe(472); // 50銭超 → 切り上げ
    expect(roundPremium(471.49)).toBe(471);
    expect(roundPremium(345)).toBe(345);
  });
});

describe('calcShienkin（本人負担額）', () => {
  it('一次資料の例と一致する: 標準報酬月額30万円 → 2026年度 月345円', () => {
    // 300,000 × 0.23% ÷ 2 = 345円（こども家庭庁・給与計算各社の解説例と一致）
    const r = calcShienkin(300_000)[0];
    expect(r.fiscalYear).toBe(2026);
    expect(r.standardMonthly).toBe(300_000);
    expect(r.monthly).toBe(345);
    expect(r.bonus).toBe(0);
    expect(r.yearly).toBe(345 * 12);
  });

  it('一次資料の例と一致する: 標準報酬月額50万円 → 2026年度 月575円', () => {
    expect(calcShienkin(500_000)[0].monthly).toBe(575);
  });

  it('2028年度は0.4%（本人0.2%）で計算される: 標準報酬30万円 → 月600円', () => {
    const r = calcShienkin(300_000)[2];
    expect(r.fiscalYear).toBe(2028);
    expect(r.monthly).toBe(600);
  });

  it('賞与からも徴収される: 年間賞与100万円 → 2026年度 1,150円', () => {
    // 1,000,000 × 0.23% ÷ 2 = 1,150円
    const r = calcShienkin(300_000, 1_000_000)[0];
    expect(r.bonus).toBe(1_150);
    expect(r.yearly).toBe(345 * 12 + 1_150);
  });

  it('賞与は1,000円未満切り捨てで計算される', () => {
    const withFraction = calcShienkin(300_000, 1_000_999)[0];
    const without = calcShienkin(300_000, 1_000_000)[0];
    expect(withFraction.bonus).toBe(without.bonus);
  });

  it('賞与は年度上限573万円でキャップされる', () => {
    const capped = calcShienkin(300_000, 10_000_000)[0];
    const atCap = calcShienkin(300_000, BONUS_CAP_YEARLY)[0];
    expect(capped.bonus).toBe(atCap.bonus);
    // 5,730,000 × 0.23% ÷ 2 = 6,589.5 → 50銭ちょうど → 6,589円
    expect(capped.bonus).toBe(6_589);
  });

  it('負の入力は0として扱う', () => {
    const r = calcShienkin(-100, -100)[0];
    expect(r.standardMonthly).toBe(58_000); // 最低等級
    expect(r.bonus).toBe(0);
  });

  it('3年度分の結果を返し、負担は年々増える', () => {
    const rs = calcShienkin(400_000);
    expect(rs).toHaveLength(3);
    expect(rs[0].monthly).toBeLessThan(rs[1].monthly);
    expect(rs[1].monthly).toBeLessThan(rs[2].monthly);
  });
});
