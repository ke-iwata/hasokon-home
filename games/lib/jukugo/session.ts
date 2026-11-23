/**
 * 解いている途中の状態（試した字・ヒントの数）・記録の区分・結果の共有文
 *
 * 仕様: docs/features/game-jukugo-anaume.md の「解いたあと」「記録」
 */

import type { DateKey } from '@/lib/daily';
import { isCorrect, TIER_LABEL, type Puzzle, type Tier } from './generate';

/** モード。きょうの1問（日替わり）・れんしゅう */
export type Mode = 'daily' | 'practice';
export const MODE_ORDER: readonly Mode[] = ['daily', 'practice'];
export const MODE_LABEL: Record<Mode, string> = { daily: 'きょうの1問', practice: 'れんしゅう' };

/** 解き方。4択（既定）・読みで入れる */
export type InputMethod = 'choice' | 'reading';

/** 記録の区分（モード×段）。`lib/records.ts` の variant に渡す */
export function variantOf(mode: Mode, tier: Tier): string {
  return `${mode}-${tier}`;
}

/** 1問ぶんの途中経過 */
export interface Attempt {
  /** 試した字（順番どおり。最後が正解なら解けている） */
  tries: string[];
  /** 使ったヒントの数（0〜2） */
  hints: number;
  /** 「答えを見る」を押した */
  revealed: boolean;
}

export const EMPTY_ATTEMPT: Attempt = { tries: [], hints: 0, revealed: false };

/** 解けたか（答えか別解を選んだ） */
export function isSolved(p: Puzzle, a: Attempt): boolean {
  return a.tries.some((c) => isCorrect(p, c));
}

/** 終わったか（解けた・答えを見た） */
export function isFinished(p: Puzzle, a: Attempt): boolean {
  return a.revealed || isSolved(p, a);
}

/**
 * 字を1つ試す。終わった問題・同じ字の2度目は何もしない（試した回数を増やさない）。
 */
export function tryChar(p: Puzzle, a: Attempt, ch: string): Attempt {
  if (isFinished(p, a) || a.tries.includes(ch)) return a;
  return { ...a, tries: [...a.tries, ch] };
}

/** 何回目で正解したか（解けていなければ null） */
export function solvedOnTry(p: Puzzle, a: Attempt): number | null {
  const i = a.tries.findIndex((c) => isCorrect(p, c));
  return i < 0 ? null : i + 1;
}

/** 試した回数ぶんの ❌…⭕（答えを見たときは最後が 👀） */
export function attemptEmoji(p: Puzzle, a: Attempt): string {
  const marks: string[] = a.tries.map((c) => (isCorrect(p, c) ? '⭕' : '❌'));
  if (a.revealed && !isSolved(p, a)) marks.push('👀');
  return marks.join('');
}

/**
 * きょうの1問の共有文。**答えの字・盤の4字は入れない**（ネタばらしになる）。
 *
 * 1行目「熟語パズル 11/23 小学生 1回目で正解・ヒント0・連続3日」、2行目に ❌…⭕、3行目に URL。
 */
export function shareText(params: {
  dateKey: DateKey;
  puzzle: Puzzle;
  attempt: Attempt;
  streak?: number;
  url: string;
}): string {
  const { dateKey, puzzle, attempt, streak, url } = params;
  const label = `${dateKey.slice(5, 7)}/${dateKey.slice(8, 10)}`;
  const n = solvedOnTry(puzzle, attempt);
  const result = n === null ? '答えを見た' : `${n}回目で正解`;
  const tail = n !== null && streak ? `・連続${streak}日` : '';
  const head = `熟語パズル ${label} ${TIER_LABEL[puzzle.tier]} ${result}・ヒント${attempt.hints}${tail}`;
  return [head, attemptEmoji(puzzle, attempt), url].join('\n');
}

/** きょうの1問の途中経過を置くキー（途中経過なので `lib/records.ts` とは別に持つ） */
export const DAILY_PROGRESS_KEY = 'jukugo-puzzle:daily';

/** `localStorage` のうち、ここで使う部分だけ（テストでは差し替える） */
export interface ProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * 保存の形。**答えは保存しない**（日付と段から `dailyPuzzle()` で作り直す）。
 * 段ごとに、試した字・ヒントの数・答えを見たか。
 */
interface DailyProgress {
  dateKey: DateKey;
  tiers: Partial<Record<Tier, Attempt>>;
}

function sanitizeAttempt(value: unknown): Attempt {
  if (!value || typeof value !== 'object') return EMPTY_ATTEMPT;
  const v = value as Partial<Attempt>;
  const tries = Array.isArray(v.tries) ? v.tries.filter((c): c is string => typeof c === 'string' && c.length <= 2) : [];
  const hints = typeof v.hints === 'number' && v.hints >= 0 ? Math.min(2, Math.floor(v.hints)) : 0;
  return { tries: [...new Set(tries)].slice(0, 20), hints, revealed: v.revealed === true };
}

function readAll(storage: ProgressStorage | null, today: DateKey): DailyProgress {
  try {
    const raw = storage?.getItem(DAILY_PROGRESS_KEY);
    if (!raw) return { dateKey: today, tiers: {} };
    const data = JSON.parse(raw) as Partial<DailyProgress>;
    if (data.dateKey !== today || !data.tiers || typeof data.tiers !== 'object') return { dateKey: today, tiers: {} };
    return { dateKey: today, tiers: data.tiers };
  } catch {
    return { dateKey: today, tiers: {} };
  }
}

/** 保存してある途中経過を読む。今日のものでない・壊れている・読めないときは空 */
export function readDailyAttempt(storage: ProgressStorage | null, today: DateKey, tier: Tier): Attempt {
  return sanitizeAttempt(readAll(storage, today).tiers[tier]);
}

/** 途中経過を書く。書けなくても遊べるので、失敗は黙って捨てる */
export function writeDailyAttempt(storage: ProgressStorage | null, today: DateKey, tier: Tier, attempt: Attempt): void {
  try {
    const all = readAll(storage, today);
    all.tiers[tier] = attempt;
    storage?.setItem(DAILY_PROGRESS_KEY, JSON.stringify(all));
  } catch {
    // 保存できない環境（プライベートブラウズなど）
  }
}
