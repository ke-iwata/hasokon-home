/**
 * タイピング練習の進行（1ラウンド60秒）
 *
 * 仕様: docs/features/game-typing.md
 *
 * 1打ごとの判定は `lib/typing-romaji.ts`、出題語彙は `lib/typing-words.ts`。
 * ここはその2つを束ねて「60秒のラウンド」にする純関数だけを置く。
 *
 * ## 時刻を状態に持たない
 *
 * 残り時間は `Game.tsx` が測って `remainingMs` として渡す。
 * ここに `Date.now()` を持ち込むと、テストのたびに時計を固める必要が出るうえ、
 * 「タブが裏に回っていた時間」の扱いが状態の中に紛れ込む
 * （`docs/features/mobile-one-screen.md` の「演出を状態に持たせない」と同じ考え）。
 */

import {
  initialProgress,
  isTypingKey,
  segment,
  typeChar,
  type Chunk,
  type Progress,
} from './typing-romaji';
import { LEVELS, WORDS, type Level } from './typing-words';

export type { Level } from './typing-words';

/** 1ラウンドの長さ（ミリ秒）。仕様の「60秒で何文字打てたか」 */
export const ROUND_MS = 60_000;

/** 局面。`ready`（開始待ち）→ `playing`（60秒）→ `finished`（結果） */
export type Status = 'ready' | 'playing' | 'finished';

export interface TypingState {
  level: Level;
  status: Status;
  /** 出題順に並べた語（シャッフル済み）。60秒で使い切らない長さを用意する */
  queue: string[];
  /** いま出している語の位置 */
  index: number;
  /** いま出している語の打鍵単位 */
  chunks: Chunk[];
  /** いま出している語をどこまで打てたか */
  progress: Progress;
  /** 正しく打てた打鍵の数（KPMのもと） */
  hits: number;
  /** 打ち間違えた数（正確率のもと） */
  misses: number;
  /** 打ち切った語の数 */
  cleared: number;
}

/** 1ラウンドの結果 */
export interface TypingResult {
  /** 1分あたりの打鍵数 */
  kpm: number;
  /** 正確率（%） */
  accuracy: number;
  /** 打ち切った語の数 */
  cleared: number;
  /** 正しく打てた打鍵の数 */
  hits: number;
  /** 打ち間違えた数 */
  misses: number;
}

/** 乱数。テストから固定したものを渡せるようにする（他のゲームと同じ約束） */
export type Rng = () => number;

/** 出題の候補として並べる語数の上限。60秒で使い切ることはない */
const QUEUE_SIZE = 60;

/** レベルとして正しい値か（保存された設定を読み戻すときに使う） */
export function isLevel(value: unknown): value is Level {
  return typeof value === 'string' && (LEVELS as string[]).includes(value);
}

/** 配列をシャッフルした新しい配列を返す（元の配列は変えない） */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 出題の並びを作る。**同じ語が続けて出ないようにシャッフルしてから切る** */
export function makeQueue(level: Level, rng: Rng = Math.random): string[] {
  return shuffle(WORDS[level], rng).slice(0, QUEUE_SIZE);
}

/** 開始待ちの状態を作る */
export function createGame(level: Level, rng: Rng = Math.random): TypingState {
  return gameWith(level, makeQueue(level, rng));
}

/**
 * 並べ替えずに（語彙リストの先頭から）出題する状態を作る。
 *
 * **静的書き出しのHTMLと、ブラウザでの最初の描画を一致させるために要る。**
 * `createGame` は乱数で並べ替えるので、これを最初の状態に使うと
 * サーバーが書いたお題とブラウザが選ぶお題が食い違い、hydration が壊れる
 * （実測：サーバー「かわ」・ブラウザ「すいか」）。
 * 最初はこれで描き、マウント後に `createGame` で並べ替える。
 */
export function orderedGame(level: Level): TypingState {
  return gameWith(level, WORDS[level].slice(0, QUEUE_SIZE));
}

/** 出題の並びから開始待ちの状態を作る */
function gameWith(level: Level, queue: string[]): TypingState {
  return {
    level,
    status: 'ready',
    queue,
    index: 0,
    chunks: segment(queue[0]),
    progress: initialProgress(),
    hits: 0,
    misses: 0,
    cleared: 0,
  };
}

/** ラウンドを始める。開始待ち以外では何もしない */
export function startRound(state: TypingState): TypingState {
  if (state.status !== 'ready') return state;
  return { ...state, status: 'playing' };
}

/** 60秒が来た（またはやめた）。結果の画面へ移る */
export function finishRound(state: TypingState): TypingState {
  if (state.status !== 'playing') return state;
  return { ...state, status: 'finished' };
}

/** いま出している語 */
export function currentWord(state: TypingState): string {
  return state.queue[state.index] ?? '';
}

/**
 * 1打ぶん進める。
 *
 * - 正しければ `hits` が増え、語を打ち切ったら次の語へ進む
 * - 間違いは `misses` が増えるだけで**進まない**（仕様の「その場で赤くなる」）
 * - 遊んでいないあいだ（`ready` / `finished`）は数えない
 *
 * 語を使い切ったら並びを作り直して出し続ける（60秒では起きないが、
 * 打ち切ったときに出題が空になるのを避ける）。
 */
export function pressKey(state: TypingState, key: string, rng: Rng = Math.random): TypingState {
  if (state.status !== 'playing') return state;
  if (!isTypingKey(key)) return state;

  const outcome = typeChar(state.chunks, state.progress, key);
  if (!outcome.ok) return { ...state, misses: state.misses + 1 };

  const hits = state.hits + 1;
  if (!outcome.done) return { ...state, hits, progress: outcome.progress };

  // 語を打ち切った。次の語へ
  const nextIndex = state.index + 1;
  const queue = nextIndex < state.queue.length ? state.queue : makeQueue(state.level, rng);
  const index = nextIndex < state.queue.length ? nextIndex : 0;
  return {
    ...state,
    hits,
    cleared: state.cleared + 1,
    queue,
    index,
    chunks: segment(queue[index]),
    progress: initialProgress(),
  };
}

/** レベルを変える。ラウンド中は変えない（数え方が混ざるため） */
export function changeLevel(
  state: TypingState,
  level: Level,
  rng: Rng = Math.random,
): TypingState {
  if (state.status === 'playing' || level === state.level) return state;
  return createGame(level, rng);
}

/**
 * KPM（1分あたりの打鍵数）。
 *
 * 割る時間はラウンドの長さ（60秒）で固定する。**経過時間で割らない**：
 * 開始直後に1打だけして数字を見ると、KPMが数千に跳ねてしまう。
 * 途中でやめた場合も「60秒でこれだけ打てた」として同じ土俵に乗せる。
 */
export function kpm(hits: number, roundMs: number = ROUND_MS): number {
  if (roundMs <= 0) return 0;
  return Math.round(hits / (roundMs / 60_000));
}

/** 正確率（%）。1打も打っていなければ100（「正確率0%」と出さないため） */
export function accuracy(hits: number, misses: number): number {
  const total = hits + misses;
  if (total === 0) return 100;
  return Math.round((hits / total) * 100);
}

/** ラウンドの結果を出す */
export function resultOf(state: TypingState, roundMs: number = ROUND_MS): TypingResult {
  return {
    kpm: kpm(state.hits, roundMs),
    accuracy: accuracy(state.hits, state.misses),
    cleared: state.cleared,
    hits: state.hits,
    misses: state.misses,
  };
}

/**
 * 記録に残すスコア。**KPMをそのまま使う**。
 *
 * `lib/records.ts` の `bestScore` は「大きいほうが良い」1つの数しか持てないので、
 * 速さ（KPM）を主にし、正確率は画面の結果にだけ出す。
 * 正確率もベストにすると「1打だけ正しく打って100%」が最高記録になってしまう。
 */
export function scoreOf(result: TypingResult): number {
  return result.kpm;
}
