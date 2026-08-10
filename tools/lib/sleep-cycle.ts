/**
 * 睡眠サイクル計算ロジック
 *
 * 睡眠は約90分の「睡眠サイクル」（ノンレム睡眠＋レム睡眠のセット）を
 * 繰り返すとされ、サイクルの切れ目（眠りが浅いタイミング）に起床すると
 * 目覚めが良いといわれる。ここでは 3〜6 サイクル
 * （4.5時間 / 6時間 / 7.5時間 / 9時間）の候補を計算する。
 *
 * 時刻はすべて「0時からの経過分（0〜1439）」の数値で扱い、
 * "HH:MM" 文字列との変換は timeToMinutes / minutesToTime で行う。
 */

/** 1睡眠サイクルの長さ（分） */
export const CYCLE_MINUTES = 90;

/** 提案する最小サイクル数（4.5時間） */
export const MIN_CYCLES = 3;

/** 提案する最大サイクル数（9時間） */
export const MAX_CYCLES = 6;

/** おすすめのサイクル数（5サイクル = 7.5時間） */
export const RECOMMENDED_CYCLES = 5;

/** 1日の分数 */
const DAY_MINUTES = 24 * 60;

export interface SleepCycleResult {
  /** サイクル数（3〜6） */
  cycles: number;
  /** 就寝時刻（逆算モード）または起床時刻（順方向モード）。0〜1439 の分 */
  minutes: number;
  /** 実際に眠っている時間（分）= cycles × 90 */
  sleepMinutes: number;
  /** 5サイクル（7.5時間）のおすすめ候補か */
  recommended: boolean;
}

/**
 * 分数を 0〜1439 の範囲に正規化する（日またぎ対応）
 * @param minutes 任意の分数（負数・1440以上も可）
 */
export function normalizeMinutes(minutes: number): number {
  return ((Math.round(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
}

/**
 * "HH:MM" 形式の時刻文字列を 0〜1439 の分数に変換する
 * @returns 変換結果。形式が不正、または範囲外のときは NaN
 */
export function timeToMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return NaN;
  return h * 60 + min;
}

/**
 * 0〜1439 の分数を "HH:MM" 形式の時刻文字列に変換する
 * （範囲外の値は正規化してから変換する）
 */
export function minutesToTime(minutes: number): string {
  const n = normalizeMinutes(minutes);
  const h = Math.floor(n / 60);
  const m = n % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * 逆算モード: 起きたい時刻から、各サイクル数に対応する就寝時刻を求める
 *
 * 就寝時刻 = 起床時刻 − サイクル数×90分 − 入眠時間（日またぎも正規化）
 *
 * @param wakeMinutes 起床時刻（0〜1439 の分）
 * @param fallAsleepMinutes 入眠にかかる時間（分）
 * @returns サイクル数 3〜6 の候補（サイクル数の昇順）
 */
export function bedTimesForWake(
  wakeMinutes: number,
  fallAsleepMinutes: number
): SleepCycleResult[] {
  const wake = normalizeMinutes(wakeMinutes);
  const fall = Math.max(0, fallAsleepMinutes);
  const results: SleepCycleResult[] = [];
  for (let c = MIN_CYCLES; c <= MAX_CYCLES; c++) {
    results.push({
      cycles: c,
      minutes: normalizeMinutes(wake - c * CYCLE_MINUTES - fall),
      sleepMinutes: c * CYCLE_MINUTES,
      recommended: c === RECOMMENDED_CYCLES,
    });
  }
  return results;
}

/**
 * 順方向モード: いま寝る場合の、各サイクル数に対応する起床時刻を求める
 *
 * 起床時刻 = 就寝時刻 + 入眠時間 + サイクル数×90分（日またぎも正規化）
 *
 * @param bedMinutes 就寝時刻（0〜1439 の分）
 * @param fallAsleepMinutes 入眠にかかる時間（分）
 * @returns サイクル数 3〜6 の候補（サイクル数の昇順）
 */
export function wakeTimesForBed(
  bedMinutes: number,
  fallAsleepMinutes: number
): SleepCycleResult[] {
  const bed = normalizeMinutes(bedMinutes);
  const fall = Math.max(0, fallAsleepMinutes);
  const results: SleepCycleResult[] = [];
  for (let c = MIN_CYCLES; c <= MAX_CYCLES; c++) {
    results.push({
      cycles: c,
      minutes: normalizeMinutes(bed + fall + c * CYCLE_MINUTES),
      sleepMinutes: c * CYCLE_MINUTES,
      recommended: c === RECOMMENDED_CYCLES,
    });
  }
  return results;
}

/**
 * 分数を「X時間Y分」の日本語表記にする（Y=0 のときは「X時間」）
 */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}
