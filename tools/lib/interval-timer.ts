/**
 * インターバルタイマー（トレーニング用）の計算ロジック。
 *
 * 「準備 → (トレーニング → 休憩) × セット数」という時間割を組み立て、
 * 経過秒数から現在のフェーズと残り時間を求める。純関数のみで、
 * 実際の時刻管理（開始時刻・一時停止）はUI側が持つ。
 *
 * タバタ式（20秒運動+10秒休憩×8セット）は立命館大学・田畑泉教授の
 * 研究に由来する広く知られたプロトコル。プリセットとして収録している。
 */

export interface TimerSettings {
  /** 開始前の準備時間（秒）。0で省略 */
  prepareSec: number;
  /** トレーニング時間（秒） */
  workSec: number;
  /** 休憩時間（秒）。0で省略 */
  restSec: number;
  /** セット数（トレーニングの回数） */
  sets: number;
}

/** 設定値の下限・上限。UIの入力もこれでクランプする */
export const LIMITS = {
  prepareSec: { min: 0, max: 300 },
  workSec: { min: 5, max: 3600 },
  restSec: { min: 0, max: 3600 },
  sets: { min: 1, max: 99 },
} as const;

export type PhaseType = 'prepare' | 'work' | 'rest';

export interface Phase {
  type: PhaseType;
  /** このフェーズが属するセット番号（1始まり）。prepare は 0 */
  set: number;
  /** スケジュール先頭からの開始秒 */
  startSec: number;
  durationSec: number;
}

/** 経過秒数から求めた現在位置 */
export interface TimerPosition {
  /** 完了後は null */
  phase: Phase | null;
  /** 完了後は schedule.length */
  phaseIndex: number;
  /** 現フェーズの残り秒（切り上げ。完了後は 0） */
  remainingSec: number;
  done: boolean;
}

export interface Preset {
  key: string;
  name: string;
  description: string;
  settings: TimerSettings;
}

/** よく使われるプロトコルのプリセット */
export const PRESETS: Preset[] = [
  {
    key: 'tabata',
    name: 'タバタ式',
    description: '20秒運動 + 10秒休憩 × 8セット（計4分）',
    settings: { prepareSec: 10, workSec: 20, restSec: 10, sets: 8 },
  },
  {
    key: 'hiit3030',
    name: 'HIIT 30-30',
    description: '30秒運動 + 30秒休憩 × 10セット',
    settings: { prepareSec: 10, workSec: 30, restSec: 30, sets: 10 },
  },
  {
    key: 'kintore',
    name: '筋トレ休憩',
    description: '40秒運動 + 90秒休憩 × 5セット',
    settings: { prepareSec: 10, workSec: 40, restSec: 90, sets: 5 },
  },
];

/** 整数化して LIMITS の範囲に収める */
export function clampSettings(s: TimerSettings): TimerSettings {
  const clamp = (v: number, key: keyof typeof LIMITS): number => {
    const { min, max } = LIMITS[key];
    if (Number.isNaN(v)) return min;
    // ±Infinity は Math.min/max がそのまま上限・下限に収める
    return Math.min(max, Math.max(min, Math.round(v)));
  };
  return {
    prepareSec: clamp(s.prepareSec, 'prepareSec'),
    workSec: clamp(s.workSec, 'workSec'),
    restSec: clamp(s.restSec, 'restSec'),
    sets: clamp(s.sets, 'sets'),
  };
}

/**
 * 設定から時間割を組み立てる。
 * 最終セットの後ろに休憩は付けない（トレーニングで終わる）。
 */
export function buildSchedule(settings: TimerSettings): Phase[] {
  const s = clampSettings(settings);
  const phases: Phase[] = [];
  let t = 0;
  const push = (type: PhaseType, set: number, durationSec: number) => {
    phases.push({ type, set, startSec: t, durationSec });
    t += durationSec;
  };
  if (s.prepareSec > 0) push('prepare', 0, s.prepareSec);
  for (let i = 1; i <= s.sets; i++) {
    push('work', i, s.workSec);
    if (s.restSec > 0 && i < s.sets) push('rest', i, s.restSec);
  }
  return phases;
}

/** スケジュール全体の長さ（秒） */
export function totalDurationSec(schedule: Phase[]): number {
  if (schedule.length === 0) return 0;
  const last = schedule[schedule.length - 1];
  return last.startSec + last.durationSec;
}

/**
 * 経過秒数（小数可）から現在のフェーズを求める。
 * フェーズの開始時刻ちょうどはそのフェーズに含まれる。
 */
export function positionAt(schedule: Phase[], elapsedSec: number): TimerPosition {
  const total = totalDurationSec(schedule);
  if (elapsedSec >= total || schedule.length === 0) {
    return { phase: null, phaseIndex: schedule.length, remainingSec: 0, done: true };
  }
  const e = Math.max(0, elapsedSec);
  for (let i = 0; i < schedule.length; i++) {
    const p = schedule[i];
    if (e < p.startSec + p.durationSec) {
      return {
        phase: p,
        phaseIndex: i,
        remainingSec: Math.ceil(p.startSec + p.durationSec - e),
        done: false,
      };
    }
  }
  // e < total なので到達しないが、型のための保険
  return { phase: null, phaseIndex: schedule.length, remainingSec: 0, done: true };
}

/** 2つの設定が同じ値か（プリセットの選択状態の表示に使う） */
export function sameSettings(a: TimerSettings, b: TimerSettings): boolean {
  return (
    a.prepareSec === b.prepareSec &&
    a.workSec === b.workSec &&
    a.restSec === b.restSec &&
    a.sets === b.sets
  );
}

export type BeepKind = 'work-start' | 'rest-start' | 'countdown' | 'finish';

/**
 * 経過秒が prevSec → nowSec に進んだときに鳴らすべき音を返す。
 *
 * tick の間隔に依存させないための設計。バックグラウンドのタブでは
 * setInterval が1秒以上に間引かれるため、「境界の直後に tick が来る」
 * 前提で判定すると切り替え音を取りこぼす。フェーズ番号の変化で見れば、
 * どれだけ遅れて呼ばれても現在のフェーズの開始音は必ず1回返る。
 */
export function beepsBetween(
  schedule: Phase[],
  prevSec: number,
  nowSec: number,
): BeepKind[] {
  const prev = positionAt(schedule, prevSec);
  const now = positionAt(schedule, nowSec);
  if (now.done) return prev.done ? [] : ['finish'];
  if (now.phaseIndex !== prev.phaseIndex) {
    return [now.phase?.type === 'work' ? 'work-start' : 'rest-start'];
  }
  if (now.remainingSec !== prev.remainingSec && now.remainingSec <= 3) {
    return ['countdown'];
  }
  return [];
}

/** 秒 → 「M:SS」表記（1時間以上は「H:MM:SS」） */
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}
