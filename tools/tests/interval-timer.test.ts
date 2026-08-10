import { describe, expect, it } from 'vitest';
import {
  buildSchedule,
  clampSettings,
  formatTime,
  LIMITS,
  positionAt,
  PRESETS,
  totalDurationSec,
  type TimerSettings,
} from '@/lib/interval-timer';

const tabata: TimerSettings = { prepareSec: 10, workSec: 20, restSec: 10, sets: 8 };

describe('buildSchedule', () => {
  it('タバタ式: 準備1 + (運動8 + 休憩7) = 16フェーズ', () => {
    const schedule = buildSchedule(tabata);
    expect(schedule).toHaveLength(16);
    expect(schedule[0]).toEqual({ type: 'prepare', set: 0, startSec: 0, durationSec: 10 });
    expect(schedule[1]).toEqual({ type: 'work', set: 1, startSec: 10, durationSec: 20 });
    expect(schedule[2]).toEqual({ type: 'rest', set: 1, startSec: 30, durationSec: 10 });
    // 最後はトレーニングで終わる（休憩は付かない）
    expect(schedule[15].type).toBe('work');
    expect(schedule[15].set).toBe(8);
  });

  it('タバタ式の合計は4分（240秒 = 準備10 + 20×8 + 10×7）', () => {
    expect(totalDurationSec(buildSchedule(tabata))).toBe(240);
  });

  it('準備0秒なら準備フェーズを作らない', () => {
    const schedule = buildSchedule({ prepareSec: 0, workSec: 30, restSec: 10, sets: 3 });
    expect(schedule[0].type).toBe('work');
  });

  it('休憩0秒なら休憩フェーズを作らない', () => {
    const schedule = buildSchedule({ prepareSec: 0, workSec: 30, restSec: 0, sets: 3 });
    expect(schedule.map((p) => p.type)).toEqual(['work', 'work', 'work']);
  });

  it('1セットなら 準備 + 運動 のみ', () => {
    const schedule = buildSchedule({ prepareSec: 5, workSec: 60, restSec: 30, sets: 1 });
    expect(schedule.map((p) => p.type)).toEqual(['prepare', 'work']);
    expect(totalDurationSec(schedule)).toBe(65);
  });

  it('startSec は隙間なく連続する', () => {
    const schedule = buildSchedule(tabata);
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i].startSec).toBe(
        schedule[i - 1].startSec + schedule[i - 1].durationSec,
      );
    }
  });
});

describe('positionAt', () => {
  const schedule = buildSchedule(tabata);

  it('0秒はフェーズ先頭（準備・残り10秒）', () => {
    const pos = positionAt(schedule, 0);
    expect(pos.phase?.type).toBe('prepare');
    expect(pos.remainingSec).toBe(10);
    expect(pos.done).toBe(false);
  });

  it('フェーズ境界ちょうどは次のフェーズに入る', () => {
    const pos = positionAt(schedule, 10);
    expect(pos.phase?.type).toBe('work');
    expect(pos.phase?.set).toBe(1);
    expect(pos.remainingSec).toBe(20);
  });

  it('小数の経過秒は残りを切り上げる（10.1秒 → 残り20秒）', () => {
    expect(positionAt(schedule, 10.1).remainingSec).toBe(20);
    expect(positionAt(schedule, 29.9).remainingSec).toBe(1);
  });

  it('合計時間ちょうどで完了', () => {
    const pos = positionAt(schedule, 240);
    expect(pos.done).toBe(true);
    expect(pos.phase).toBeNull();
    expect(pos.remainingSec).toBe(0);
  });

  it('完了後の経過秒でも完了のまま', () => {
    expect(positionAt(schedule, 9999).done).toBe(true);
  });

  it('負の経過秒は先頭として扱う', () => {
    expect(positionAt(schedule, -1).phase?.type).toBe('prepare');
  });

  it('最終セットの終盤（239.5秒）は work・残り1秒', () => {
    const pos = positionAt(schedule, 239.5);
    expect(pos.phase?.type).toBe('work');
    expect(pos.phase?.set).toBe(8);
    expect(pos.remainingSec).toBe(1);
  });
});

describe('clampSettings', () => {
  it('範囲内はそのまま', () => {
    expect(clampSettings(tabata)).toEqual(tabata);
  });

  it('上限・下限に収める', () => {
    const s = clampSettings({ prepareSec: 9999, workSec: 0, restSec: -5, sets: 1000 });
    expect(s).toEqual({
      prepareSec: LIMITS.prepareSec.max,
      workSec: LIMITS.workSec.min,
      restSec: LIMITS.restSec.min,
      sets: LIMITS.sets.max,
    });
  });

  it('小数は四捨五入、NaNは下限', () => {
    const s = clampSettings({ prepareSec: 10.6, workSec: NaN, restSec: 10.4, sets: 2.5 });
    expect(s.prepareSec).toBe(11);
    expect(s.workSec).toBe(LIMITS.workSec.min);
    expect(s.restSec).toBe(10);
    expect(s.sets).toBe(3);
  });
});

describe('formatTime', () => {
  it('分:秒で表示する', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(9)).toBe('0:09');
    expect(formatTime(75)).toBe('1:15');
    expect(formatTime(600)).toBe('10:00');
  });

  it('1時間以上は時:分:秒', () => {
    expect(formatTime(3661)).toBe('1:01:01');
  });

  it('小数は切り捨て、負は0扱い', () => {
    expect(formatTime(29.9)).toBe('0:29');
    expect(formatTime(-5)).toBe('0:00');
  });
});

describe('PRESETS', () => {
  it('全プリセットが範囲内の設定を持つ', () => {
    for (const p of PRESETS) {
      expect(clampSettings(p.settings)).toEqual(p.settings);
    }
  });

  it('タバタ式は 20-10 × 8', () => {
    const t = PRESETS.find((p) => p.key === 'tabata');
    expect(t?.settings).toEqual({ prepareSec: 10, workSec: 20, restSec: 10, sets: 8 });
  });
});
