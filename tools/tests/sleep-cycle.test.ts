import { describe, expect, it } from 'vitest';
import {
  bedTimesForWake,
  formatDuration,
  minutesToTime,
  normalizeMinutes,
  timeToMinutes,
  wakeTimesForBed,
} from '@/lib/sleep-cycle';

describe('timeToMinutes / minutesToTime（変換関数）', () => {
  it('境界: 00:00 は 0、23:59 は 1439', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('23:59')).toBe(1439);
    expect(minutesToTime(0)).toBe('00:00');
    expect(minutesToTime(1439)).toBe('23:59');
  });

  it('通常の時刻を往復変換できる', () => {
    expect(timeToMinutes('07:00')).toBe(420);
    expect(minutesToTime(420)).toBe('07:00');
    expect(minutesToTime(timeToMinutes('23:15'))).toBe('23:15');
  });

  it('範囲外・不正な文字列は NaN', () => {
    expect(timeToMinutes('24:00')).toBeNaN();
    expect(timeToMinutes('12:60')).toBeNaN();
    expect(timeToMinutes('abc')).toBeNaN();
    expect(timeToMinutes('')).toBeNaN();
  });

  it('minutesToTime は範囲外の値を正規化する（1440 → 00:00、-1 → 23:59）', () => {
    expect(minutesToTime(1440)).toBe('00:00');
    expect(minutesToTime(-1)).toBe('23:59');
  });

  it('normalizeMinutes は負数・1440以上を 0〜1439 に収める', () => {
    expect(normalizeMinutes(-45)).toBe(1395);
    expect(normalizeMinutes(1500)).toBe(60);
    expect(normalizeMinutes(0)).toBe(0);
  });
});

describe('bedTimesForWake（逆算モード）', () => {
  it('07:00起床・入眠15分 → 5サイクルの就寝は23:15', () => {
    const results = bedTimesForWake(timeToMinutes('07:00'), 15);
    const rec = results.find((r) => r.recommended)!;
    expect(rec.cycles).toBe(5);
    expect(minutesToTime(rec.minutes)).toBe('23:15');
    expect(rec.sleepMinutes).toBe(450);
  });

  it('07:00起床・入眠15分 → 3〜6サイクルすべての就寝時刻が正しい', () => {
    const times = bedTimesForWake(timeToMinutes('07:00'), 15).map((r) =>
      minutesToTime(r.minutes)
    );
    expect(times).toEqual(['02:15', '00:45', '23:15', '21:45']);
  });

  it('日またぎ: 01:00起床・入眠15分 → 5サイクルの就寝は前日17:15', () => {
    const results = bedTimesForWake(timeToMinutes('01:00'), 15);
    const rec = results.find((r) => r.cycles === 5)!;
    expect(minutesToTime(rec.minutes)).toBe('17:15');
    const three = results.find((r) => r.cycles === 3)!;
    expect(minutesToTime(three.minutes)).toBe('20:15');
  });

  it('おすすめマークは5サイクルのみ', () => {
    const results = bedTimesForWake(timeToMinutes('07:00'), 15);
    expect(results.filter((r) => r.recommended).map((r) => r.cycles)).toEqual([5]);
  });
});

describe('wakeTimesForBed（順方向モード）', () => {
  it('23:00就寝・入眠15分 → 5サイクルの起床は06:45', () => {
    const results = wakeTimesForBed(timeToMinutes('23:00'), 15);
    const rec = results.find((r) => r.cycles === 5)!;
    expect(minutesToTime(rec.minutes)).toBe('06:45');
    expect(rec.sleepMinutes).toBe(450);
  });

  it('23:00就寝・入眠15分 → 3〜6サイクルすべての起床時刻が正しい（日またぎ）', () => {
    const times = wakeTimesForBed(timeToMinutes('23:00'), 15).map((r) =>
      minutesToTime(r.minutes)
    );
    expect(times).toEqual(['03:45', '05:15', '06:45', '08:15']);
  });

  it('入眠時間0分でも計算できる', () => {
    const results = wakeTimesForBed(timeToMinutes('00:00'), 0);
    expect(minutesToTime(results.find((r) => r.cycles === 3)!.minutes)).toBe('04:30');
  });
});

describe('formatDuration', () => {
  it('分数を「X時間Y分」に変換する', () => {
    expect(formatDuration(270)).toBe('4時間30分');
    expect(formatDuration(360)).toBe('6時間');
    expect(formatDuration(450)).toBe('7時間30分');
    expect(formatDuration(540)).toBe('9時間');
  });
});
