/**
 * 睡眠サイクル計算ロジック
 *
 * 睡眠は約90分の「睡眠サイクル」（ノンレム睡眠＋レム睡眠のセット）を
 * 繰り返すとされ、サイクルの切れ目（眠りが浅いタイミング）に起床すると
 * 目覚めが良いといわれる。ここでは 3〜6 サイクル
 * （4.5時間 / 6時間 / 7.5時間 / 9時間）の候補を計算する。
 *
 * 夜の睡眠に加えて、90分サイクルに乗せない「仮眠（昼寝）」の提案も扱う
 * （ファイル後半の NAP_PLANS / napPlans）。
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
 * 分数を「X時間Y分」の日本語表記にする
 * （Y=0 のときは「X時間」、1時間未満は「Y分」）
 */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}分`;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

/**
 * 分数の幅を日本語表記にする（下限と上限が同じなら幅なしの表記）
 * 例: (15, 20) → 「15〜20分」 / (30, 30) → 「30分」
 */
export function formatDurationRange(minMinutes: number, maxMinutes: number): string {
  if (minMinutes === maxMinutes) return formatDuration(minMinutes);
  // どちらも1時間未満なら「15〜20分」と単位をまとめる
  if (maxMinutes < 60) return `${minMinutes}〜${maxMinutes}分`;
  return `${formatDuration(minMinutes)}〜${formatDuration(maxMinutes)}`;
}

/* ------------------------------------------------------------------ *
 * 仮眠（昼寝）モード
 *
 * 夜の睡眠と違い、仮眠は90分サイクルに合わせる必要がない。
 * 深い眠り（ノンレム睡眠の段階3）に入る前に起きられる15〜20分程度が
 * 基本形で、それを超えると起き抜けのだるさ（睡眠慣性）が出やすくなる。
 * 90分は1サイクル分で、深い眠りを抜けてから起きられる代わりに
 * 夜の寝つきに影響しやすい。
 *
 * 出典：厚生労働省「健康づくりのための睡眠ガイド2023」ほか一般的な知見。
 * 医学的助言ではなく目安の提示にとどめる。
 * ------------------------------------------------------------------ */

/** 仮眠プランの識別子 */
export type NapPlanId = 'short' | 'lunch' | 'cycle';

/** 仮眠プランの定義（時刻に依存しない部分） */
export interface NapPlanDef {
  id: NapPlanId;
  /** 実際に眠っている時間の下限（分） */
  minNapMinutes: number;
  /** 実際に眠っている時間の上限（分）。下限と同じなら幅なし */
  maxNapMinutes: number;
  /** 見出しラベル */
  label: string;
  /** 補足（だるさ・夜の睡眠への影響などの注意書き） */
  note: string;
  /** 基本としておすすめするプランか（15〜20分のみ true） */
  recommended: boolean;
}

/** 仮眠プランの計算結果（起床時刻つき） */
export interface NapPlanResult extends NapPlanDef {
  /** 起床時刻の下限（0〜1439 の分） */
  wakeMinutes: number;
  /** 起床時刻の上限（0〜1439 の分）。幅がなければ wakeMinutes と同じ */
  wakeMinutesEnd: number;
  /** 横になってから起きるまでの合計時間の下限（入眠時間込み・分） */
  minTotalMinutes: number;
  /** 合計時間の上限（入眠時間込み・分） */
  maxTotalMinutes: number;
}

/**
 * 提案する仮眠の長さ（短い順）
 *
 * 【データ更新箇所】長さの目安を見直すときはここだけを直す。
 */
export const NAP_PLANS: readonly NapPlanDef[] = [
  {
    id: 'short',
    minNapMinutes: 15,
    maxNapMinutes: 20,
    label: '短い仮眠',
    note: '深い眠りに入る前に起きられるので、目覚めた後のだるさが残りにくい基本形です。',
    recommended: true,
  },
  {
    id: 'lunch',
    minNapMinutes: 30,
    maxNapMinutes: 30,
    label: '昼休みに収まる上限',
    note: '30分を超えると深い眠りに入りやすく、起き抜けのだるさ（睡眠慣性）が出やすくなります。',
    recommended: false,
  },
  {
    id: 'cycle',
    minNapMinutes: CYCLE_MINUTES,
    maxNapMinutes: CYCLE_MINUTES,
    label: '1サイクル',
    note: '睡眠サイクル1周分。夜の寝つきに影響しやすいので、夕方以降は避けるのが無難です。',
    recommended: false,
  },
];

/**
 * 仮眠モード: 横になる時刻から、各プランの起床時刻を求める
 *
 * 起床時刻 = 開始時刻 + 入眠時間 + 仮眠の長さ（日またぎも正規化）
 *
 * @param startMinutes 仮眠を始める（横になる）時刻。0〜1439 の分
 * @param fallAsleepMinutes 入眠にかかる時間（分）
 * @returns 仮眠の短い順のプラン
 */
export function napPlans(
  startMinutes: number,
  fallAsleepMinutes: number
): NapPlanResult[] {
  const start = normalizeMinutes(startMinutes);
  const fall = Math.max(0, fallAsleepMinutes);
  return NAP_PLANS.map((plan) => ({
    ...plan,
    wakeMinutes: normalizeMinutes(start + fall + plan.minNapMinutes),
    wakeMinutesEnd: normalizeMinutes(start + fall + plan.maxNapMinutes),
    minTotalMinutes: fall + plan.minNapMinutes,
    maxTotalMinutes: fall + plan.maxNapMinutes,
  }));
}
