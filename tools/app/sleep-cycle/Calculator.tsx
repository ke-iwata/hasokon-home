'use client';

import { useState } from 'react';
import {
  bedTimesForWake,
  formatDuration,
  formatDurationRange,
  minutesToTime,
  napPlans,
  timeToMinutes,
  wakeTimesForBed,
} from '@/lib/sleep-cycle';
import { trackToolUse } from '@/lib/analytics';

type Mode = 'wake' | 'bed' | 'nap';

/** 仮眠モードの初期値（昼休みの想定）。切り替えた時点で現在時刻に差し替える */
const NAP_DEFAULT_TIME = '13:00';

const MODE_LABELS: Record<Mode, string> = {
  wake: '起きたい時刻',
  bed: '布団に入る時刻',
  nap: '仮眠を始める時刻',
};

/** 結果カードの枠線・背景（おすすめだけ色を付ける） */
function cardStyle(recommended: boolean): React.CSSProperties {
  return {
    border: '1px solid var(--border)',
    borderLeft: `4px solid ${recommended ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: 10,
    padding: '10px 14px',
    background: recommended ? 'var(--accent-soft)' : 'var(--surface)',
  };
}

function RecommendedBadge() {
  return (
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
  );
}

export default function Calculator() {
  const [mode, setMode] = useState<Mode>('wake');
  // 夜の睡眠（起床逆算・就寝順算）と仮眠では適切な初期値が違うので、時刻は別に持つ
  const [time, setTime] = useState('07:00');
  const [napTime, setNapTime] = useState(NAP_DEFAULT_TIME);
  const [fallAsleep, setFallAsleep] = useState('15');

  const isNap = mode === 'nap';
  const currentTime = isNap ? napTime : time;
  const setCurrentTime = isNap ? setNapTime : setTime;

  const baseMinutes = timeToMinutes(currentTime);
  const fall = Math.max(0, Number(fallAsleep) || 0);
  const valid = !Number.isNaN(baseMinutes);

  function changeMode(next: Mode) {
    // 仮眠は「今から寝る」使い方が中心なので、切り替え時に現在時刻を入れておく
    // （描画時ではなくクリック時なので、静的書き出しとハイドレーションに影響しない）
    if (next === 'nap') {
      const now = new Date();
      setNapTime(minutesToTime(now.getHours() * 60 + now.getMinutes()));
    }
    setMode(next);
    trackToolUse('sleep-cycle', next);
  }

  const cycleResults =
    valid && !isNap
      ? mode === 'wake'
        ? [...bedTimesForWake(baseMinutes, fall)].reverse()
        : wakeTimesForBed(baseMinutes, fall)
      : [];
  const naps = valid && isNap ? napPlans(baseMinutes, fall) : [];

  return (
    <div className="card">
      <div style={{ display: 'grid', gap: 14 }}>
        <label>
          モード
          <select value={mode} onChange={(e) => changeMode(e.target.value as Mode)}>
            <option value="wake">起きたい時刻から就寝時刻を逆算</option>
            <option value="bed">今から寝る場合の起床時刻</option>
            <option value="nap">仮眠・昼寝の時間（何分寝るか）</option>
          </select>
        </label>
        <label>
          {MODE_LABELS[mode]}
          <input
            type="time"
            value={currentTime}
            onChange={(e) => setCurrentTime(e.target.value)}
          />
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

      {!valid ? (
        <p style={{ marginTop: 18, fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
          時刻を入力してください。
        </p>
      ) : isNap ? (
        <div style={{ marginTop: 18 }}>
          <p style={{ margin: '0 0 8px', fontSize: 'var(--fs-md)' }}>
            <strong>{minutesToTime(baseMinutes)}</strong> から仮眠するなら、この時刻に起床：
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            {naps.map((n) => (
              <div key={n.id} style={cardStyle(n.recommended)}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    flexWrap: 'wrap',
                    gap: 4,
                  }}
                >
                  <span>
                    <strong style={{ fontSize: 'var(--fs-lg)' }}>
                      {minutesToTime(n.wakeMinutes)}
                      {n.wakeMinutesEnd !== n.wakeMinutes && `〜${minutesToTime(n.wakeMinutesEnd)}`}
                    </strong>
                    {n.recommended && <RecommendedBadge />}
                  </span>
                  <span style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>
                    {n.label}・仮眠{formatDurationRange(n.minNapMinutes, n.maxNapMinutes)}
                  </span>
                </div>
                <p
                  style={{
                    margin: '6px 0 0',
                    fontSize: 'var(--fs-sm)',
                    color: 'var(--muted)',
                  }}
                >
                  {n.note}（横になってから起きるまで
                  {formatDurationRange(n.minTotalMinutes, n.maxTotalMinutes)}）
                </p>
              </div>
            ))}
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
            ※ 仮眠の長さは入眠時間（{fall}分）を除いた、実際に眠っている時間の目安です。
          </p>
        </div>
      ) : (
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
            {cycleResults.map((r) => (
              <div
                key={r.cycles}
                style={{
                  ...cardStyle(r.recommended),
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  flexWrap: 'wrap',
                  gap: 4,
                }}
              >
                <span>
                  <strong style={{ fontSize: 'var(--fs-lg)' }}>{minutesToTime(r.minutes)}</strong>
                  {r.recommended && <RecommendedBadge />}
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
      )}
    </div>
  );
}
