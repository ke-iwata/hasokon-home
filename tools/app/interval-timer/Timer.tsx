'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildSchedule,
  clampSettings,
  formatTime,
  LIMITS,
  positionAt,
  PRESETS,
  totalDurationSec,
  type PhaseType,
  type TimerSettings,
} from '@/lib/interval-timer';
import { trackToolUse } from '@/lib/analytics';

type Status = 'idle' | 'running' | 'paused' | 'done';

/** フェーズごとの表示（ラベルと色）。休憩は緑、トレーニングは赤系で直感的に */
const PHASE_VIEW: Record<PhaseType | 'done', { label: string; bg: string; fg: string }> = {
  prepare: { label: '準備', bg: '#eff6ff', fg: '#1d4ed8' },
  work: { label: 'トレーニング', bg: '#fef2f2', fg: '#dc2626' },
  rest: { label: '休憩', bg: '#f0fdf4', fg: '#16a34a' },
  done: { label: '完了！', bg: '#eef2ff', fg: 'var(--brand)' },
};

const FIELDS: { key: keyof TimerSettings; label: string; unit: string }[] = [
  { key: 'prepareSec', label: '準備', unit: '秒' },
  { key: 'workSec', label: 'トレーニング', unit: '秒' },
  { key: 'restSec', label: '休憩', unit: '秒' },
  { key: 'sets', label: 'セット数', unit: '回' },
];

// Screen Wake Lock API。型定義が環境により無いので最小限を自前で持つ
interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

export default function Timer() {
  const [settings, setSettings] = useState<TimerSettings>(PRESETS[0].settings);
  const [status, setStatus] = useState<Status>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [soundOn, setSoundOn] = useState(true);

  // 実時刻ベースで経過を計算する（setIntervalの積算はズレるため）。
  // startEpoch = 直近の再開時刻、accumulated = それ以前の累積
  const startEpochRef = useRef(0);
  const accumulatedRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const lastBeepRef = useRef<string>('');
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  const schedule = useMemo(() => buildSchedule(settings), [settings]);
  const total = totalDurationSec(schedule);
  const pos = positionAt(schedule, elapsedMs / 1000);
  const running = status === 'running';

  /** 短いビープ音。externalな音源を使わずWeb Audioで生成する */
  const beep = (freq: number, durationMs: number) => {
    const ctx = audioCtxRef.current;
    if (!ctx || !soundOnRef.current) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
  };

  const acquireWakeLock = async () => {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
      };
      wakeLockRef.current = (await nav.wakeLock?.request('screen')) ?? null;
    } catch {
      // 非対応・省電力モードなどでは黙って諦める（タイマー自体は動く）
    }
  };

  const releaseWakeLock = () => {
    wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
  };

  // バックグラウンドから戻ったときにWake Lockを取り直す
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && running) acquireWakeLock();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      const elapsed = accumulatedRef.current + (Date.now() - startEpochRef.current);
      setElapsedMs(elapsed);

      const p = positionAt(schedule, elapsed / 1000);
      if (p.done) {
        // 終了音（長め2回）
        beep(880, 600);
        setTimeout(() => beep(880, 600), 350);
        setStatus('done');
        releaseWakeLock();
        return;
      }
      // カウントダウン3秒前からビープ、フェーズ切り替わりで高音。
      // 同じ秒に二重に鳴らさないようフェーズ+残り秒をキーにする
      const key = `${p.phaseIndex}:${p.remainingSec}`;
      if (key !== lastBeepRef.current) {
        lastBeepRef.current = key;
        const phaseJustStarted =
          p.phase && elapsed / 1000 - p.phase.startSec < 0.5 && p.phaseIndex > 0;
        if (phaseJustStarted) beep(p.phase?.type === 'work' ? 880 : 660, 400);
        else if (p.remainingSec <= 3) beep(440, 120);
      }
    }, 100);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // scheduleは開始後に変わらない（実行中は入力を無効化している）
  }, [running, schedule]);

  const start = () => {
    // AudioContextはユーザー操作の中で作らないと音が出ない（自動再生制限）
    if (!audioCtxRef.current) {
      const Ctor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) audioCtxRef.current = new Ctor();
    }
    audioCtxRef.current?.resume().catch(() => undefined);
    accumulatedRef.current = 0;
    startEpochRef.current = Date.now();
    lastBeepRef.current = '';
    setElapsedMs(0);
    setStatus('running');
    acquireWakeLock();
    trackToolUse('interval-timer', 'start');
  };

  const pause = () => {
    accumulatedRef.current += Date.now() - startEpochRef.current;
    setStatus('paused');
    releaseWakeLock();
  };

  const resume = () => {
    audioCtxRef.current?.resume().catch(() => undefined);
    startEpochRef.current = Date.now();
    setStatus('running');
    acquireWakeLock();
  };

  const reset = () => {
    accumulatedRef.current = 0;
    setElapsedMs(0);
    setStatus('idle');
    releaseWakeLock();
  };

  const setField = (key: keyof TimerSettings, value: number) => {
    setSettings((s) => ({ ...s, [key]: value }));
  };

  const view = pos.done ? PHASE_VIEW.done : PHASE_VIEW[pos.phase?.type ?? 'prepare'];
  const showSettings = status === 'idle';
  const progress = total > 0 ? Math.min(1, elapsedMs / 1000 / total) : 0;

  const btnStyle = (primary: boolean): React.CSSProperties => ({
    padding: '12px 28px',
    borderRadius: 999,
    border: primary ? 'none' : '1px solid var(--border)',
    background: primary ? 'var(--brand)' : 'var(--surface)',
    color: primary ? '#fff' : 'var(--text)',
    fontSize: '1.05rem',
    fontWeight: 600,
    cursor: 'pointer',
  });

  return (
    <div className="card">
      {showSettings && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {PRESETS.map((p) => {
              const active = JSON.stringify(p.settings) === JSON.stringify(settings);
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setSettings(p.settings)}
                  aria-pressed={active}
                  title={p.description}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 999,
                    border: active ? '2px solid var(--brand)' : '1px solid var(--border)',
                    background: active ? '#eef2ff' : 'var(--surface)',
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  {p.name}
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: 12,
              marginBottom: 16,
            }}
          >
            {FIELDS.map((f) => (
              <label key={f.key} style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
                {f.label}
                <span
                  style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}
                >
                  <input
                    type="number"
                    inputMode="numeric"
                    min={LIMITS[f.key].min}
                    max={LIMITS[f.key].max}
                    value={settings[f.key]}
                    onChange={(e) => setField(f.key, Number(e.target.value))}
                    onBlur={() => setSettings((s) => clampSettings(s))}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      fontSize: '1.1rem',
                      color: 'var(--text)',
                    }}
                  />
                  {f.unit}
                </span>
              </label>
            ))}
          </div>
        </>
      )}

      <div
        role="timer"
        aria-live="off"
        style={{
          background: view.bg,
          borderRadius: 12,
          padding: '28px 16px',
          textAlign: 'center',
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: view.fg }}>
          {status === 'idle' ? `合計 ${formatTime(total)}` : view.label}
        </div>
        <div
          style={{
            fontSize: 'clamp(3.5rem, 18vw, 6rem)',
            fontWeight: 800,
            lineHeight: 1.1,
            fontVariantNumeric: 'tabular-nums',
            color: view.fg,
          }}
        >
          {status === 'idle'
            ? formatTime(settings.workSec)
            : pos.done
              ? '0:00'
              : formatTime(pos.remainingSec)}
        </div>
        {status !== 'idle' && (
          <div style={{ fontSize: '1rem', color: 'var(--muted)', marginTop: 4 }}>
            {pos.done
              ? `${settings.sets}セット おつかれさまでした`
              : pos.phase?.type === 'prepare'
                ? 'まもなく開始'
                : `セット ${pos.phase?.set} / ${settings.sets}`}
          </div>
        )}
        {/* 全体の進み具合。数字だけだと先の長さが分からないため */}
        <div
          style={{
            height: 6,
            borderRadius: 999,
            background: 'rgb(15 23 42 / 0.08)',
            marginTop: 16,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress * 100}%`,
              background: view.fg,
              transition: 'width 0.2s linear',
            }}
          />
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 10,
          justifyContent: 'center',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        {status === 'idle' && (
          <button type="button" onClick={start} style={btnStyle(true)}>
            スタート
          </button>
        )}
        {status === 'running' && (
          <button type="button" onClick={pause} style={btnStyle(false)}>
            一時停止
          </button>
        )}
        {status === 'paused' && (
          <button type="button" onClick={resume} style={btnStyle(true)}>
            再開
          </button>
        )}
        {(status === 'running' || status === 'paused' || status === 'done') && (
          <button type="button" onClick={reset} style={btnStyle(false)}>
            リセット
          </button>
        )}
        <button
          type="button"
          onClick={() => setSoundOn((v) => !v)}
          aria-pressed={soundOn}
          aria-label={soundOn ? '音を消す' : '音を出す'}
          style={{ ...btnStyle(false), padding: '12px 16px' }}
        >
          {soundOn ? '🔊' : '🔇'}
        </button>
      </div>

      <p className="note" style={{ marginTop: 14, marginBottom: 0 }}>
        カウントダウン残り3秒からビープ音が鳴ります。iPhoneのサイレントスイッチが
        オンだと音は鳴りません。実行中は画面がスリープしないようにします（対応ブラウザのみ）。
      </p>
    </div>
  );
}
