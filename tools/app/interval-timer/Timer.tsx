'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  beepsBetween,
  buildSchedule,
  clampSettings,
  formatTime,
  LIMITS,
  positionAt,
  PRESETS,
  sameSettings,
  totalDurationSec,
  type BeepKind,
  type PhaseType,
  type TimerSettings,
} from '@/lib/interval-timer';
import { trackToolUse } from '@/lib/analytics';

type Status = 'idle' | 'running' | 'paused' | 'done';

/** 入力欄の生の文字列。数値化とクランプは settings の導出時にまとめて行う */
type InputValues = Record<keyof TimerSettings, string>;

/** フェーズごとの表示（ラベルと色）。休憩は緑、トレーニングは赤系で直感的に */
const PHASE_VIEW: Record<PhaseType | 'done', { label: string; bg: string; fg: string }> = {
  prepare: { label: '準備', bg: 'var(--info-soft)', fg: 'var(--info-fg)' },
  work: { label: 'トレーニング', bg: 'var(--danger-soft)', fg: 'var(--danger-fg)' },
  rest: { label: '休憩', bg: 'var(--ok-soft)', fg: 'var(--ok-fg)' },
  done: { label: '完了！', bg: 'var(--accent-soft)', fg: 'var(--accent)' },
};

const FIELDS: { key: keyof TimerSettings; label: string; unit: string }[] = [
  { key: 'prepareSec', label: '準備', unit: '秒' },
  { key: 'workSec', label: 'トレーニング', unit: '秒' },
  { key: 'restSec', label: '休憩', unit: '秒' },
  { key: 'sets', label: 'セット数', unit: '回' },
];

/** 音の種類 → [周波数Hz, 長さms] */
const BEEP_SOUND: Record<BeepKind, [number, number]> = {
  'work-start': [880, 400],
  'rest-start': [660, 400],
  countdown: [440, 120],
  finish: [880, 600],
};

const toInputs = (s: TimerSettings): InputValues => ({
  prepareSec: String(s.prepareSec),
  workSec: String(s.workSec),
  restSec: String(s.restSec),
  sets: String(s.sets),
});

// 実行中は毎秒レンダーされるため、静的なスタイルはモジュール定数にして
// レンダーごとの再生成を避ける
const BTN_BASE: React.CSSProperties = {
  padding: '12px 28px',
  borderRadius: 999,
  fontSize: '1.05rem',
  fontWeight: 600,
  cursor: 'pointer',
};
const BTN_PRIMARY: React.CSSProperties = {
  ...BTN_BASE,
  border: 'none',
  background: 'var(--accent)',
  color: 'var(--on-accent)',
};
const BTN_SECONDARY: React.CSSProperties = {
  ...BTN_BASE,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
};
const PRESET_ROW: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  marginBottom: 14,
};
const FIELDS_GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: 12,
  marginBottom: 16,
};
const FIELD_LABEL: React.CSSProperties = { fontSize: '0.9rem', color: 'var(--muted)' };
const FIELD_INPUT_ROW: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginTop: 4,
};
const BIG_NUM_BASE: React.CSSProperties = {
  fontSize: 'clamp(3.5rem, 18vw, 6rem)',
  fontWeight: 800,
  lineHeight: 1.1,
  fontVariantNumeric: 'tabular-nums',
};
const SUB_TEXT: React.CSSProperties = { fontSize: '1rem', color: 'var(--muted)', marginTop: 4 };
const PROGRESS_TRACK: React.CSSProperties = {
  height: 6,
  borderRadius: 999,
  background: 'rgb(15 23 42 / 0.08)',
  marginTop: 16,
  overflow: 'hidden',
};
const CONTROLS_ROW: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  justifyContent: 'center',
  alignItems: 'center',
  flexWrap: 'wrap',
};

// Screen Wake Lock API。型定義が環境により無いので最小限を自前で持つ
interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

export default function Timer() {
  const [inputs, setInputs] = useState<InputValues>(() => toInputs(PRESETS[0].settings));
  const [status, setStatus] = useState<Status>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [soundOn, setSoundOn] = useState(true);

  // 実時刻ベースで経過を計算する（setIntervalの積算はズレるため）。
  // startEpoch = 直近の再開時刻、accumulated = それ以前の累積
  const startEpochRef = useRef(0);
  const accumulatedRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  // 取得は非同期なので、awaitの間に一時停止/リセットされたことを検知する世代番号
  const wakeLockGenRef = useRef(0);
  const prevSecRef = useRef(0);
  const renderKeyRef = useRef('');
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneHandledRef = useRef(false);
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  // 入力欄は文字列のまま持ち、計算も表示もクランプ後の値から導く。
  // 「入力欄の生の値」と「実際に動く時間」が画面上で食い違わないようにするため
  const settings = useMemo(
    () =>
      clampSettings({
        prepareSec: Number(inputs.prepareSec),
        workSec: Number(inputs.workSec),
        restSec: Number(inputs.restSec),
        sets: Number(inputs.sets),
      }),
    [inputs],
  );
  const schedule = useMemo(() => buildSchedule(settings), [settings]);
  const total = totalDurationSec(schedule);
  const pos = positionAt(schedule, elapsedMs / 1000);
  const running = status === 'running';

  /** 短いビープ音。外部音源を使わずWeb Audioで生成する */
  const beep = (kind: BeepKind) => {
    const ctx = audioCtxRef.current;
    if (!ctx || !soundOnRef.current) return;
    const [freq, durationMs] = BEEP_SOUND[kind];
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
    const gen = ++wakeLockGenRef.current;
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
      };
      const sentinel = await nav.wakeLock?.request('screen');
      if (!sentinel) return;
      if (gen !== wakeLockGenRef.current) {
        // 取得を待つ間に一時停止/リセットされていた。保持せず即座に手放す
        sentinel.release().catch(() => undefined);
        return;
      }
      wakeLockRef.current = sentinel;
    } catch {
      // 非対応・省電力モードなどでは黙って諦める（タイマー自体は動く）
    }
  };

  const releaseWakeLock = () => {
    wakeLockGenRef.current++;
    wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
  };

  const clearFinishTimer = () => {
    if (finishTimerRef.current !== null) {
      clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
  };

  // バックグラウンドから戻ったときにWake Lockを取り直す
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && running) acquireWakeLock();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [running]);

  // ページ遷移などでアンマウントされたら、画面スリープ抑止と音を確実に手放す
  useEffect(
    () => () => {
      releaseWakeLock();
      clearFinishTimer();
      audioCtxRef.current?.close().catch(() => undefined);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const elapsed = accumulatedRef.current + (Date.now() - startEpochRef.current);
      const sec = elapsed / 1000;

      // 鳴らすべき音は前回tickからの進み方でlibが決める。
      // バックグラウンドでtickが間引かれても切り替え音を取りこぼさない
      for (const kind of beepsBetween(schedule, prevSecRef.current, sec)) beep(kind);
      prevSecRef.current = sec;

      const p = positionAt(schedule, sec);
      if (p.done) {
        if (!doneHandledRef.current) {
          doneHandledRef.current = true;
          // 終了音の2回目。IDを持ってreset/unmountで止められるようにする
          finishTimerRef.current = setTimeout(() => beep('finish'), 350);
          setStatus('done');
          setElapsedMs(elapsed);
          releaseWakeLock();
        }
        return;
      }
      // 見た目は秒単位でしか変わらないので、変わったときだけ再レンダーする
      const key = `${p.phaseIndex}:${p.remainingSec}`;
      if (key !== renderKeyRef.current) {
        renderKeyRef.current = key;
        setElapsedMs(elapsed);
      }
    }, 100);
    return () => clearInterval(id);
    // scheduleは実行中に変わらない（入力欄はidle時のみ表示）
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
    prevSecRef.current = 0;
    renderKeyRef.current = '';
    doneHandledRef.current = false;
    setElapsedMs(0);
    setStatus('running');
    acquireWakeLock();
    trackToolUse('interval-timer', 'start');
  };

  const pause = () => {
    const elapsed = accumulatedRef.current + (Date.now() - startEpochRef.current);
    accumulatedRef.current = elapsed;
    setElapsedMs(elapsed);
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
    prevSecRef.current = 0;
    renderKeyRef.current = '';
    doneHandledRef.current = false;
    clearFinishTimer();
    setElapsedMs(0);
    setStatus('idle');
    releaseWakeLock();
  };

  // アイドル中は常に中立の色。開始後は現在フェーズの色
  const view =
    status === 'idle'
      ? PHASE_VIEW.prepare
      : pos.done
        ? PHASE_VIEW.done
        : PHASE_VIEW[pos.phase?.type ?? 'prepare'];
  const showSettings = status === 'idle';
  const progress = total > 0 ? Math.min(1, elapsedMs / 1000 / total) : 0;

  return (
    <div className="card">
      {showSettings && (
        <>
          <div style={PRESET_ROW}>
            {PRESETS.map((p) => {
              const active = sameSettings(p.settings, settings);
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setInputs(toInputs(p.settings))}
                  aria-pressed={active}
                  title={p.description}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 999,
                    border: active ? '2px solid var(--brand)' : '1px solid var(--border)',
                    background: active ? 'var(--accent-soft)' : 'var(--surface)',
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  {p.name}
                </button>
              );
            })}
          </div>

          <div style={FIELDS_GRID}>
            {FIELDS.map((f) => (
              <label key={f.key} style={FIELD_LABEL}>
                {f.label}
                <span style={FIELD_INPUT_ROW}>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={LIMITS[f.key].min}
                    max={LIMITS[f.key].max}
                    value={inputs[f.key]}
                    onChange={(e) =>
                      setInputs((v) => ({ ...v, [f.key]: e.target.value }))
                    }
                    onBlur={() => setInputs(toInputs(settings))}
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
        <div style={{ ...BIG_NUM_BASE, color: view.fg }}>
          {status === 'idle'
            ? formatTime(settings.workSec)
            : pos.done
              ? '0:00'
              : formatTime(pos.remainingSec)}
        </div>
        {status !== 'idle' && (
          <div style={SUB_TEXT}>
            {pos.done
              ? `${settings.sets}セット おつかれさまでした`
              : pos.phase?.type === 'prepare'
                ? 'まもなく開始'
                : `セット ${pos.phase?.set} / ${settings.sets}`}
          </div>
        )}
        {/* 全体の進み具合。数字だけだと先の長さが分からないため */}
        <div style={PROGRESS_TRACK}>
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

      <div style={CONTROLS_ROW}>
        {status === 'idle' && (
          <button type="button" onClick={start} style={BTN_PRIMARY}>
            スタート
          </button>
        )}
        {status === 'running' && (
          <button type="button" onClick={pause} style={BTN_SECONDARY}>
            一時停止
          </button>
        )}
        {status === 'paused' && (
          <button type="button" onClick={resume} style={BTN_PRIMARY}>
            再開
          </button>
        )}
        {status !== 'idle' && (
          <button type="button" onClick={reset} style={BTN_SECONDARY}>
            リセット
          </button>
        )}
        <button
          type="button"
          onClick={() => setSoundOn((v) => !v)}
          aria-pressed={soundOn}
          aria-label={soundOn ? '音を消す' : '音を出す'}
          style={{ ...BTN_SECONDARY, padding: '12px 16px' }}
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
