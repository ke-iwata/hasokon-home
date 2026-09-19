import { describe, expect, it } from 'vitest';
import {
  currentStreak,
  dailySeed,
  isDateKey,
  localDateKey,
  mulberry32,
  nextStreak,
  previousDateKey,
} from '@/lib/daily';

/**
 * 日替わり基盤のテスト。
 *
 * 仕様: docs/features/game-hoshioki-puzzle.md の「日替わり基盤の持ち主を決める」
 *
 * **「今日」はローカル日付**で、シードと連続日数が同じ日付の取り方をしていること、
 * **同じ種から同じ数列が出る**ことの2つが要。
 */

describe('日付キー', () => {
  it('ローカル日付をそのまま使う（UTCを経由しない）', () => {
    // 日本時間（UTC+9）の 0時台。UTC に直すと前日になってしまう時刻
    const midnightJst = new Date(2026, 8, 19, 0, 30, 0);
    expect(localDateKey(midnightJst)).toBe('2026-09-19');
    // 月・日は0埋め
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('前日を返す（月またぎ・年またぎ・うるう年）', () => {
    expect(previousDateKey('2026-09-19')).toBe('2026-09-18');
    expect(previousDateKey('2026-09-01')).toBe('2026-08-31');
    expect(previousDateKey('2026-01-01')).toBe('2025-12-31');
    expect(previousDateKey('2026-03-01')).toBe('2026-02-28');
    expect(previousDateKey('2028-03-01')).toBe('2028-02-29');
  });

  it('形の検査（壊れた記録を読み込まないため）', () => {
    expect(isDateKey('2026-09-19')).toBe(true);
    expect(isDateKey('2026-2-3')).toBe(false);
    expect(isDateKey('2026-13-01')).toBe(false);
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(isDateKey('2028-02-29')).toBe(true);
    expect(isDateKey(20260919)).toBe(false);
    expect(isDateKey(undefined)).toBe(false);
  });
});

describe('シードと乱数', () => {
  it('同じ日付・同じ版なら同じ種', () => {
    expect(dailySeed('2026-09-19', 1)).toBe(dailySeed('2026-09-19', 1));
  });

  it('日付が1日違えば種も違う', () => {
    expect(dailySeed('2026-09-19', 1)).not.toBe(dailySeed('2026-09-20', 1));
  });

  it('生成手順の版が違えば種も違う', () => {
    expect(dailySeed('2026-09-19', 1)).not.toBe(dailySeed('2026-09-19', 2));
  });

  it('同じ種からは同じ数列が出る', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('0以上1未満を返す', () => {
    const rng = mulberry32(dailySeed('2026-09-19', 1));
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('連続日数', () => {
  it('前日にクリアしていれば増える', () => {
    expect(nextStreak('2026-09-18', '2026-09-19', 3)).toBe(4);
  });

  it('1日空くと1に戻る', () => {
    expect(nextStreak('2026-09-17', '2026-09-19', 9)).toBe(1);
  });

  it('同じ日に2回クリアしても増えない', () => {
    expect(nextStreak('2026-09-19', '2026-09-19', 3)).toBe(3);
  });

  it('記録が無ければ1から始まる（streak を持たない旧記録も同じ）', () => {
    expect(nextStreak(undefined, '2026-09-19', undefined)).toBe(1);
    expect(nextStreak(undefined, '2026-09-19', 5)).toBe(1);
    expect(nextStreak('2026-09-18', '2026-09-19', undefined)).toBe(1);
  });

  it('月をまたいでも続く', () => {
    expect(nextStreak('2026-08-31', '2026-09-01', 10)).toBe(11);
  });

  it('連日クリアで積み上がる', () => {
    const days = ['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'];
    let last: string | undefined;
    let streak: number | undefined;
    for (const day of days) {
      streak = nextStreak(last, day, streak);
      last = day;
    }
    expect(streak).toBe(4);
    // 1日空けると振り出しに戻る
    expect(nextStreak(last, '2026-09-20', streak)).toBe(1);
  });
});

describe('いま生きている連続日数（表示用）', () => {
  it('今日か昨日クリアしていれば、その値', () => {
    expect(currentStreak('2026-09-19', '2026-09-19', 4)).toBe(4);
    expect(currentStreak('2026-09-18', '2026-09-19', 4)).toBe(4);
  });

  it('2日以上空いていれば0に見せる（記録そのものは書き換えない）', () => {
    expect(currentStreak('2026-09-16', '2026-09-19', 4)).toBe(0);
  });

  it('記録が無ければ0（streak を持たない旧記録でも落ちない）', () => {
    expect(currentStreak(undefined, '2026-09-19', undefined)).toBe(0);
    expect(currentStreak('2026-09-19', '2026-09-19', undefined)).toBe(0);
  });
});
