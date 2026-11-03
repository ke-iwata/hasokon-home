import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  calcYukyu,
  dutyDeadline,
  dutyStart,
  expiresOn,
  formatShortDate,
  grantDateAt,
  grantDates,
  grantDays,
  isProportional,
  reformAnswer,
  tenureShort,
  validateYukyu,
  weeklyFromAnnual,
  type WeeklyDays,
  type YukyuInput,
} from '@/lib/yukyu-fuyo';
import { tools } from '@/lib/registry';

/**
 * 有給休暇 付与日数 計算機のテスト。
 * 仕様: docs/features/yukyu-fuyo-nissu.md の「テスト」
 */

const base: YukyuInput = {
  hireDate: '2026-04-01',
  weekly: 5,
  over30h: false,
  today: '2026-11-03',
};

describe('付与日数の表（労基法39条2項・施行規則24条の3）', () => {
  it('通常：2026-04-01 入社 → 2026-10-01 に 10 日、以後 1 年ごとに 11・12・14・16・18・20 日', () => {
    const dates = grantDates('2026-04-01', '2034-12-31');
    expect(dates.slice(0, 8)).toEqual([
      '2026-10-01',
      '2027-10-01',
      '2028-10-01',
      '2029-10-01',
      '2030-10-01',
      '2031-10-01',
      '2032-10-01',
      '2033-10-01',
    ]);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 20].map((n) => grantDays(n, 5, false))).toEqual([
      10, 11, 12, 14, 16, 18, 20, 20, 20,
    ]);
  });

  // 表の値の写し間違いを落とす（厚生労働省の表をそのまま写した期待値）
  const PROPORTIONAL: Array<[WeeklyDays, number[]]> = [
    [4, [7, 8, 9, 10, 12, 13, 15]],
    [3, [5, 6, 6, 8, 9, 10, 11]],
    [2, [3, 4, 4, 5, 6, 6, 7]],
    [1, [1, 2, 2, 2, 3, 3, 3]],
  ];
  for (const [weekly, expected] of PROPORTIONAL) {
    it(`比例付与：週 ${weekly} 日の 7 列`, () => {
      expect([0, 1, 2, 3, 4, 5, 6].map((n) => grantDays(n, weekly, false))).toEqual(expected);
      // 6 年 6 か月以上は最後の列のまま
      expect(grantDays(10, weekly, false)).toBe(expected[6]);
    });
  }

  it('週 4 日でも週 30 時間以上なら通常の表', () => {
    expect(isProportional(4, true)).toBe(false);
    expect([0, 3, 6].map((n) => grantDays(n, 4, true))).toEqual([10, 14, 20]);
    expect(isProportional(4, false)).toBe(true);
    expect(isProportional(5, false)).toBe(false);
  });

  it('年の所定労働日数の境目：216 日 → 週 4 日・217 日 → 通常・48 日 → 週 1 日・47 日 → 付与なし', () => {
    expect(weeklyFromAnnual(216)).toBe(4);
    expect(weeklyFromAnnual(217)).toBe(5);
    expect(weeklyFromAnnual(169)).toBe(4);
    expect(weeklyFromAnnual(168)).toBe(3);
    expect(weeklyFromAnnual(121)).toBe(3);
    expect(weeklyFromAnnual(120)).toBe(2);
    expect(weeklyFromAnnual(73)).toBe(2);
    expect(weeklyFromAnnual(72)).toBe(1);
    expect(weeklyFromAnnual(48)).toBe(1);
    expect(weeklyFromAnnual(47)).toBeNull();
    expect(validateYukyu({ ...base, weekly: 'annual', annualDays: 47 })).toBe('no-grant');
    expect(calcYukyu({ ...base, weekly: 'annual', annualDays: 217 }).proportional).toBe(false);
    expect(calcYukyu({ ...base, weekly: 'annual', annualDays: 216 }).nextGrant.days).toBe(8);
  });
});

describe('付与日・時効・年5日の期限の数え方', () => {
  it('月末の入社：2026-08-31 入社の 6 か月は 2027-02-28 に満了し、付与は翌日の 2027-03-01', () => {
    expect(grantDateAt('2026-08-31', 0)).toBe('2027-03-01');
    // 2 回目以降も同じ数え方（応当日の無い月だけ翌月 1 日）
    expect(grantDateAt('2026-08-31', 1)).toBe('2028-03-01');
    expect(grantDateAt('2026-08-30', 0)).toBe('2027-03-01');
    // うるう年は 2/29 が応当日の前日になる
    expect(grantDateAt('2027-08-30', 0)).toBe('2028-03-01');
    expect(grantDateAt('2027-08-29', 0)).toBe('2028-02-29');
    expect(grantDateAt('2026-08-29', 0)).toBe('2027-03-01');
  });

  it('時効：2026-10-01 付与 → 2028-09-30 まで使える', () => {
    expect(expiresOn('2026-10-01')).toBe('2028-09-30');
  });

  it('2/29 付与の 2 年後（応当日が無い）は 2/28 まで、年 5 日の期限も同じ数え方', () => {
    expect(expiresOn('2028-02-29')).toBe('2030-02-28');
    expect(dutyDeadline('2028-02-29')).toBe('2029-02-28');
    expect(dutyDeadline('2026-10-01')).toBe('2027-09-30');
    expect(expiresOn('2027-03-01')).toBe('2029-02-28');
  });

  it('入社日が基準日より後は「入社前」', () => {
    expect(validateYukyu({ ...base, hireDate: '2026-12-01' })).toBe('before-hire');
    expect(validateYukyu({ ...base, hireDate: '' })).toBe('invalid-hire');
    expect(validateYukyu({ ...base, usedSinceGrant: -1 })).toBe('invalid-days');
    expect(() => calcYukyu({ ...base, hireDate: '2026-12-01' })).toThrow();
  });

  it('最初の付与の前は、次の付与だけを出す', () => {
    const r = calcYukyu({ ...base, today: '2026-09-30' });
    expect(r.beforeFirstGrant).toBe(true);
    expect(r.nextGrant).toEqual({ n: 0, date: '2026-10-01', days: 10 });
    expect(r.current).toBeNull();
    expect(r.balance).toBe(0);
    expect(r.fiveDayDuty.applies).toBe(false);
  });
});

describe('年5日の取得義務（39条7項）', () => {
  it('10 日付与は対象・7 日付与は対象外', () => {
    const r10 = calcYukyu(base);
    expect(r10.fiveDayDuty).toEqual({
      applies: true,
      deadline: '2027-09-30',
      remaining: 5,
    });
    const r7 = calcYukyu({ ...base, weekly: 4 });
    expect(r7.current?.days).toBe(7);
    expect(r7.fiveDayDuty.applies).toBe(false);
  });

  it('週 4 日は 4 回目（n=3・3 年 6 か月・10 日）、週 3 日は 6 回目（n=5・5 年 6 か月）から', () => {
    expect(dutyStart('2026-04-01', 4, false)).toEqual({
      n: 3,
      date: '2029-10-01',
      days: 10,
    });
    expect(dutyStart('2026-04-01', 3, false)).toEqual({
      n: 5,
      date: '2031-10-01',
      days: 10,
    });
    expect(dutyStart('2026-04-01', 2, false)).toBeNull();
    expect(dutyStart('2026-04-01', 1, false)).toBeNull();
    // 通常の表は最初から対象なので「始まる年」は出さない
    expect(dutyStart('2026-04-01', 5, false)).toBeNull();
    expect(dutyStart('2026-04-01', 4, true)).toBeNull();
    // 週 4 日の人が 3 年 6 か月を過ぎると義務の対象
    const r = calcYukyu({ ...base, weekly: 4, today: '2029-10-01' });
    expect(r.current?.days).toBe(10);
    expect(r.fiveDayDuty.applies).toBe(true);
  });

  it('繰越 3 日を先に使って 3 日取った人（今回分は未使用）は、義務の残りが 2 日（繰越分から取った日も数える）', () => {
    const r = calcYukyu({
      ...base,
      today: '2027-11-03',
      carriedAtGrant: 3,
      usedSinceGrant: 3,
    });
    expect(r.current?.days).toBe(11);
    expect(r.carried?.remaining).toBe(0);
    expect(r.current?.remaining).toBe(11);
    expect(r.fiveDayDuty).toEqual({
      applies: true,
      deadline: '2028-09-30',
      remaining: 2,
    });
  });

  it('5 日以上取っていれば残りは 0（負にしない）', () => {
    expect(calcYukyu({ ...base, usedSinceGrant: 7 }).fiveDayDuty.remaining).toBe(0);
  });
});

describe('残り（繰越＋今回−使用）', () => {
  it('繰越 3＋今回 12−使用 4 ＝ 11。繰越分から先に引く', () => {
    const r = calcYukyu({
      ...base,
      today: '2028-11-03',
      carriedAtGrant: 3,
      usedSinceGrant: 4,
    });
    expect(r.current).toMatchObject({
      grantedOn: '2028-10-01',
      days: 12,
      expiresOn: '2030-09-30',
      remaining: 11,
    });
    expect(r.carried).toEqual({
      grantedOn: '2027-10-01',
      days: 3,
      expiresOn: '2029-09-30',
      remaining: 0,
    });
    expect(r.balance).toBe(11);
  });

  it('使用が繰越と今回の合計を上回っても負にしない', () => {
    const r = calcYukyu({
      ...base,
      today: '2028-11-03',
      carriedAtGrant: 3,
      usedSinceGrant: 30,
    });
    expect(r.balance).toBe(0);
    expect(r.current?.remaining).toBe(0);
  });

  it('繰越の元は前回の付与日数を超えない（最大 20＋20＝40 日）', () => {
    const r = calcYukyu({ ...base, today: '2034-11-03', carriedAtGrant: 99 });
    expect(r.carried?.days).toBe(20);
    expect(r.balance).toBe(40);
    // 最初の付与には繰越が無い
    expect(calcYukyu({ ...base, carriedAtGrant: 5 }).carried).toBeNull();
  });

  it('0.5 日（半日単位）の取得をそのまま数える', () => {
    const r = calcYukyu({ ...base, usedSinceGrant: 2.5 });
    expect(r.balance).toBe(7.5);
    expect(r.fiveDayDuty.remaining).toBe(2.5);
  });
});

describe('付与の予定表', () => {
  it('8 回分。前回分から並べ、日付・勤続・日数・時効で消える日を持つ', () => {
    const r = calcYukyu({ ...base, today: '2028-11-03' });
    expect(r.schedule).toHaveLength(8);
    expect(r.schedule[0]).toEqual({
      n: 1,
      date: '2027-10-01',
      tenure: '1年6か月',
      days: 11,
      expiresOn: '2029-09-30',
    });
    expect(r.schedule.map((s) => s.days)).toEqual([11, 12, 14, 16, 18, 20, 20, 20]);
    const first = calcYukyu(base).schedule[0];
    expect(first.tenure).toBe('6か月');
    expect(tenureShort(0)).toBe('6か月');
    expect(tenureShort(3)).toBe('3年半');
    expect(formatShortDate(first.date)).toBe('2026/10/1');
  });
});

describe('ページ・registry', () => {
  it('registry に stage つきで入っている', () => {
    const entry = tools.find((t) => t.slug === 'yukyu-fuyo');
    expect(entry?.category).toBe('お金・社会保険');
    expect(['wip', 'preview', 'public']).toContain(entry?.stage);
  });

  it('結果を出したときに tool_use を送る', () => {
    const src = readFileSync(fileURLToPath(new URL('../app/yukyu-fuyo/Calculator.tsx', import.meta.url)), 'utf8');
    expect(src).toMatch(/const SLUG = 'yukyu-fuyo'/);
    expect(src).toMatch(/trackToolUse\(SLUG, 'result'\)/);
  });

  it('FAQ「法改正で変わりますか」は status から組み立てる', () => {
    expect(reformAnswer({ status: '検討中', checkedAt: '2026-11-03' })).toContain('法案が提出されていません');
    expect(reformAnswer({ status: '法案提出', checkedAt: '2027-02-01' })).toContain('国会に提出されています');
  });

  it('本文に民間の会社名を出さず、最低基準の注記を置く', () => {
    const page = readFileSync(fileURLToPath(new URL('../app/yukyu-fuyo/page.tsx', import.meta.url)), 'utf8');
    expect(page).not.toMatch(/jinjer|第一生命/);
    expect(page).toContain('最低基準');
  });
});
