'use client';

import { useState } from 'react';
import {
  bedTimesForWake,
  formatDuration,
  minutesToTime,
  timeToMinutes,
  wakeTimesForBed,
} from '@/lib/sleep-cycle';

type Mode = 'wake' | 'bed';

export default function Calculator() {
  const [mode, setMode] = useState<Mode>('wake');
  const [time, setTime] = useState('07:00');
  const [fallAsleep, setFallAsleep] = useState('15');

  const baseMinutes = timeToMinutes(time);
  const fall = Math.max(0, Number(fallAsleep) || 0);
  const valid = !Number.isNaN(baseMinutes);

  const results = valid
    ? mode === 'wake'
      ? [...bedTimesForWake(baseMinutes, fall)].reverse()
      : wakeTimesForBed(baseMinutes, fall)
    : [];

  return (
    <div className="card">
      <div style={{ display: 'grid', gap: 14 }}>
        <label>
          モード
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="wake">起きたい時刻から就寝時刻を逆算</option>
            <option value="bed">今から寝る場合の起床時刻</option>
          </select>
        </label>
        <label>
          {mode === 'wake' ? '起きたい時刻' : '布団に入る時刻'}
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label>
          入眠にかかる時間（分）
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={5}
            value={fallAsleep}
            onChange={(e) => setFallAsleep(e.target.value)}
          />
        </label>
      </div>

      {valid ? (
        <div style={{ marginTop: 18 }}>
          <p style={{ margin: '0 0 8px', fontSize: 'var(--fs-md)' }}>
            {mode === 'wake' ? (
              <>
                <strong>{minutesToTime(baseMinutes)}</strong> に起きるなら、この時刻に布団へ：
              </>
            ) : (
              <>
                <strong>{minutesToTime(baseMinutes)}</strong> に布団に入るなら、この時刻に起床：
              </>
            )}
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            {results.map((r) => (
              <div
                key={r.cycles}
                style={{
                  border: '1px solid var(--border)',
                  borderLeft: `4px solid ${r.recommended ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 10,
                  padding: '10px 14px',
                  background: r.recommended ? 'var(--accent-soft)' : 'var(--surface)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  flexWrap: 'wrap',
                  gap: 4,
                }}
              >
                <span>
                  <strong style={{ fontSize: 'var(--fs-lg)' }}>{minutesToTime(r.minutes)}</strong>
                  {r.recommended && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 'var(--fs-xs)',
                        color: 'var(--on-accent)',
                        background: 'var(--accent)',
                        borderRadius: 999,
                        padding: '2px 10px',
                        fontWeight: 600,
                        verticalAlign: 'middle',
                      }}
                    >
                      おすすめ
                    </span>
                  )}
                </span>
                <span style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>
                  {r.cycles}サイクル・睡眠{formatDuration(r.sleepMinutes)}
                </span>
              </div>
            ))}
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
            ※ 睡眠時間は入眠時間（{fall}分）を除いた、実際に眠っている時間の目安です。
          </p>
        </div>
      ) : (
        <p style={{ marginTop: 18, fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
          時刻を入力してください。
        </p>
      )}
    </div>
  );
}
