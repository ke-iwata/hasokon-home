import { describe, expect, it } from 'vitest';
import {
  bedTimesForWake,
  CYCLE_MINUTES,
  formatDuration,
  formatDurationRange,
  minutesToTime,
  NAP_PLANS,
  napPlans,
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

  it('1時間未満は「Y分」にする（仮眠の長さの表示で使う）', () => {
    expect(formatDuration(15)).toBe('15分');
    expect(formatDuration(30)).toBe('30分');
    expect(formatDuration(0)).toBe('0分');
    expect(formatDuration(59)).toBe('59分');
    expect(formatDuration(60)).toBe('1時間');
  });
});

describe('formatDurationRange', () => {
  it('下限と上限が同じなら幅なしの表記になる', () => {
    expect(formatDurationRange(30, 30)).toBe('30分');
    expect(formatDurationRange(90, 90)).toBe('1時間30分');
  });

  it('どちらも1時間未満なら単位をまとめる', () => {
    expect(formatDurationRange(15, 20)).toBe('15〜20分');
  });

  it('上限が1時間以上なら両側とも「X時間Y分」表記にする', () => {
    expect(formatDurationRange(45, 90)).toBe('45分〜1時間30分');
  });
});

describe('NAP_PLANS（仮眠プランの定義）', () => {
  it('短い順に 15〜20分 / 30分 / 90分 の3案を持つ', () => {
    expect(NAP_PLANS.map((p) => p.id)).toEqual(['short', 'lunch', 'cycle']);
    expect(NAP_PLANS.map((p) => [p.minNapMinutes, p.maxNapMinutes])).toEqual([
      [15, 20],
      [30, 30],
      [90, 90],
    ]);
  });

  it('1サイクルの案は CYCLE_MINUTES と一致する（90分の定義を二重に持たない）', () => {
    const cycle = NAP_PLANS.find((p) => p.id === 'cycle')!;
    expect(cycle.minNapMinutes).toBe(CYCLE_MINUTES);
  });

  it('おすすめは短い仮眠（15〜20分）だけ', () => {
    expect(NAP_PLANS.filter((p) => p.recommended).map((p) => p.id)).toEqual(['short']);
  });

  it('すべての案に注意書きが付いている', () => {
    for (const plan of NAP_PLANS) {
      expect(plan.label.length).toBeGreaterThan(0);
      expect(plan.note.length).toBeGreaterThan(0);
    }
  });
});

describe('napPlans（仮眠モード）', () => {
  it('13:00開始・入眠15分 → 15〜20分の仮眠は13:30〜13:35に起床', () => {
    const short = napPlans(timeToMinutes('13:00'), 15).find((p) => p.id === 'short')!;
    expect(minutesToTime(short.wakeMinutes)).toBe('13:30');
    expect(minutesToTime(short.wakeMinutesEnd)).toBe('13:35');
    expect(short.recommended).toBe(true);
  });

  it('13:00開始・入眠15分 → 30分・90分の案の起床時刻', () => {
    const plans = napPlans(timeToMinutes('13:00'), 15);
    const lunch = plans.find((p) => p.id === 'lunch')!;
    const cycle = plans.find((p) => p.id === 'cycle')!;
    expect(minutesToTime(lunch.wakeMinutes)).toBe('13:45');
    expect(minutesToTime(cycle.wakeMinutes)).toBe('14:45');
  });

  it('幅のない案は起床時刻の上限と下限が同じ', () => {
    for (const plan of napPlans(timeToMinutes('13:00'), 15)) {
      if (plan.minNapMinutes === plan.maxNapMinutes) {
        expect(plan.wakeMinutesEnd).toBe(plan.wakeMinutes);
      } else {
        expect(plan.wakeMinutesEnd).not.toBe(plan.wakeMinutes);
      }
    }
  });

  it('合計時間には入眠時間が含まれる（仮眠の長さ自体は入眠時間を含まない）', () => {
    const short = napPlans(timeToMinutes('13:00'), 15).find((p) => p.id === 'short')!;
    expect(short.minNapMinutes).toBe(15);
    expect(short.minTotalMinutes).toBe(30);
    expect(short.maxTotalMinutes).toBe(35);
  });

  it('入眠時間0分なら開始時刻からそのまま仮眠が始まる', () => {
    const short = napPlans(timeToMinutes('13:00'), 0).find((p) => p.id === 'short')!;
    expect(minutesToTime(short.wakeMinutes)).toBe('13:15');
    expect(short.minTotalMinutes).toBe(15);
  });

  it('入眠時間が負でも0として扱う', () => {
    const negative = napPlans(timeToMinutes('13:00'), -30);
    const zero = napPlans(timeToMinutes('13:00'), 0);
    expect(negative).toEqual(zero);
  });

  it('日またぎ: 23:50開始・入眠15分 → 30分の仮眠は00:35に起床', () => {
    const lunch = napPlans(timeToMinutes('23:50'), 15).find((p) => p.id === 'lunch')!;
    expect(minutesToTime(lunch.wakeMinutes)).toBe('00:35');
  });

  it('開始時刻が範囲外でも正規化して扱う', () => {
    expect(napPlans(1440, 0)).toEqual(napPlans(0, 0));
  });

  it('NAP_PLANS と同じ数・同じ順で返る', () => {
    expect(napPlans(timeToMinutes('13:00'), 15).map((p) => p.id)).toEqual(
      NAP_PLANS.map((p) => p.id)
    );
  });
});
