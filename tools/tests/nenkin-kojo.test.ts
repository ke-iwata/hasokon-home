import { describe, expect, it } from 'vitest';
import { otherIncomeTier, pensionIncome, publicPensionDeduction } from '@/lib/nenkin-kojo';

/**
 * 公的年金等控除の表（国税庁 No.1600 の6表）。
 * lib は条文（所得税法35条4項・租税特別措置法41条の15の3）の形で持っているので、
 * No.1600 の「収入 × 率 ＋ 定額」の速算式と帯の境目で突き合わせる。
 */

const MAN = 10_000;

/** No.1600 の速算式（65歳未満・年金以外の合計所得1,000万円以下） */
function nta1600Under65Tier0(a: number): number {
  if (a <= 130 * MAN) return 60 * MAN;
  if (a <= 410 * MAN) return a * 0.25 + 27.5 * MAN;
  if (a <= 770 * MAN) return a * 0.15 + 68.5 * MAN;
  if (a <= 1000 * MAN) return a * 0.05 + 145.5 * MAN;
  return 195.5 * MAN;
}

/** No.1600 の速算式（65歳以上・年金以外の合計所得1,000万円以下） */
function nta1600Over65Tier0(a: number): number {
  if (a <= 330 * MAN) return 110 * MAN;
  return nta1600Under65Tier0(a);
}

describe('公的年金等控除（No.1600 の境目）', () => {
  it('65歳未満・1,000万円以下：130万・410万・770万・1,000万円の境目', () => {
    expect(publicPensionDeduction(false, 130 * MAN, 0)).toBe(60 * MAN);
    expect(publicPensionDeduction(false, 410 * MAN, 0)).toBe(130 * MAN);
    expect(publicPensionDeduction(false, 770 * MAN, 0)).toBe(184 * MAN);
    expect(publicPensionDeduction(false, 1000 * MAN, 0)).toBe(195.5 * MAN);
    expect(publicPensionDeduction(false, 2000 * MAN, 0)).toBe(195.5 * MAN);
  });

  it('65歳以上・1,000万円以下：330万円までは110万円', () => {
    expect(publicPensionDeduction(true, 200 * MAN, 0)).toBe(110 * MAN);
    expect(publicPensionDeduction(true, 330 * MAN, 0)).toBe(110 * MAN);
    expect(publicPensionDeduction(true, 410 * MAN, 0)).toBe(130 * MAN);
  });

  it('No.1600 の速算式と1万円刻みで一致する（0〜1,100万円）', () => {
    for (let a = MAN; a <= 1100 * MAN; a += MAN) {
      expect(publicPensionDeduction(false, a, 0)).toBe(Math.min(a, Math.ceil(nta1600Under65Tier0(a))));
      expect(publicPensionDeduction(true, a, 0)).toBe(Math.min(a, Math.ceil(nta1600Over65Tier0(a))));
    }
  });

  it('年金以外の合計所得が1,000万円超・2,000万円超で10万円ずつ下がる', () => {
    expect(publicPensionDeduction(false, 130 * MAN, 1000 * MAN + 1)).toBe(50 * MAN);
    expect(publicPensionDeduction(false, 130 * MAN, 2000 * MAN + 1)).toBe(40 * MAN);
    expect(publicPensionDeduction(true, 330 * MAN, 1000 * MAN + 1)).toBe(100 * MAN);
    expect(publicPensionDeduction(true, 330 * MAN, 2000 * MAN + 1)).toBe(90 * MAN);
    expect(publicPensionDeduction(false, 410 * MAN, 1500 * MAN)).toBe(120 * MAN);
    expect(publicPensionDeduction(false, 1000 * MAN, 3000 * MAN)).toBe(175.5 * MAN);
  });

  it('区分の境目はちょうど1,000万円・2,000万円まで「以下」', () => {
    expect(otherIncomeTier(1000 * MAN)).toBe(0);
    expect(otherIncomeTier(1000 * MAN + 1)).toBe(1);
    expect(otherIncomeTier(2000 * MAN)).toBe(1);
    expect(otherIncomeTier(2000 * MAN + 1)).toBe(2);
  });

  it('控除は年金収入を超えず、雑所得はマイナスにならない', () => {
    expect(publicPensionDeduction(true, 50 * MAN, 0)).toBe(50 * MAN);
    expect(pensionIncome(50 * MAN, 50 * MAN)).toBe(0);
    expect(publicPensionDeduction(true, 0, 0)).toBe(0);
    expect(publicPensionDeduction(true, -1, 0)).toBe(0);
  });

  it('端数が出る年金額でも雑所得は整数（1円未満切捨て）', () => {
    const a = 3_000_001;
    const d = publicPensionDeduction(false, a, 0);
    expect(Number.isInteger(d)).toBe(true);
    expect(pensionIncome(a, d)).toBe(Math.floor(a * 0.75 - 27.5 * MAN));
  });
});
