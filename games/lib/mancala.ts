/**
 * マンカラ（カラハ）のロジック
 *
 * 仕様: docs/features/game-mancala.md
 *
 * ルールは日本レクリエーション協会のルール表「カラハ」に合わせる（1 人 6 穴・各 4 個・計 48 個）。
 *
 * ## 盤の並び（14 マス）
 *
 * ```
 *          12 11 10  9  8  7        ← CPU の穴（CPU から見て左から 7..12）
 *   13                         6    ← 左が CPU のゴール、右が自分のゴール
 *           0  1  2  3  4  5        ← 自分の穴（左から 0..5）
 * ```
 *
 * 石は添字の昇順（＝反時計回り）に 1 個ずつ置く。穴 `i` の向かいは `12 - i`。
 *
 * ## 撒く・取るは 2 つの関数に分ける
 *
 * 演出（石が 1 個ずつ進む）のための `sowPath` と、撒いた後の状態を返す `applyMove` は別の関数にする
 * （games/CLAUDE.md 画面の約束 8）。`applyMove` は**終局の精算（`finish`）をしない**。
 * 今日の 1 手番は精算しない数え方をするので、精算は呼ぶ側が決める。
 *
 * ## CPU
 *
 * - やさしい：乱数。ただし「もう 1 回」になる手があれば 50% でそれを選ぶ
 * - ふつう：深さ 4 の αβ 探索。評価はゴールの差
 * - つよい：反復深化の αβ 探索を `deadlineMs`（既定 150ms）で打ち切る。評価はゴールの差に自陣の石を小さく足す
 *
 * 探索では「もう 1 回」を同じ手番の続きとして扱い、深さを使わない。同点の手は左の穴（その人から見て）を選ぶ。
 */

import { mulberry32 } from './daily';

export type Side = 'me' | 'cpu';

export type Level = 'easy' | 'normal' | 'hard';

export const LEVEL_ORDER: readonly Level[] = ['easy', 'normal', 'hard'];

export const LEVEL_LABEL: Record<Level, string> = {
  easy: 'やさしい',
  normal: 'ふつう',
  hard: 'つよい',
};

export type Mode = 'cpu' | 'daily';

export const MODE_ORDER: readonly Mode[] = ['cpu', 'daily'];

export const MODE_LABEL: Record<Mode, string> = {
  cpu: 'CPUと対戦',
  daily: '今日の1手番',
};

/** 1 人の穴の数 */
export const PITS = 6;
/** 初めに 1 穴へ入れる石の数（協会のルール表どおり 4 個に固定） */
export const SEEDS_PER_PIT = 4;
/** 石の総数 */
export const TOTAL_STONES = PITS * 2 * SEEDS_PER_PIT;
/** 自分のゴールの添字 */
export const MY_STORE = 6;
/** CPU のゴールの添字 */
export const CPU_STORE = 13;

export interface MancalaState {
  /** 14 マス（穴 12 ＋ ゴール 2）の石の数。並びはファイル冒頭の図 */
  pits: number[];
  /** 手番 */
  turn: Side;
}

export interface MoveResult {
  state: MancalaState;
  /** 最後の石が自分のゴールで止まり、続けて撒ける */
  extraTurn: boolean;
  /** 横取りでゴールに入れた石の数（向かいの石＋最後の 1 個）。取れなければ 0 */
  captured: number;
  /** 撒いた結果、どちらかの陣地が空になった（精算は `finish` で行う） */
  gameOver: boolean;
}

/** 記録の変種キー（`lib/records.ts`） */
export function variantOf(mode: Mode, level: Level): string {
  return mode === 'daily' ? 'daily' : `cpu-${level}`;
}

export function storeOf(side: Side): number {
  return side === 'me' ? MY_STORE : CPU_STORE;
}

export function other(side: Side): Side {
  return side === 'me' ? 'cpu' : 'me';
}

/** その人の穴の添字（その人から見て左から） */
export function pitsOf(side: Side): number[] {
  const base = side === 'me' ? 0 : 7;
  return Array.from({ length: PITS }, (_, i) => base + i);
}

/** 穴の持ち主（ゴールは持ち主のある穴ではないので null） */
export function ownerOf(index: number): Side | null {
  if (index >= 0 && index < MY_STORE) return 'me';
  if (index > MY_STORE && index < CPU_STORE) return 'cpu';
  return null;
}

/** 向かいの穴 */
export function opposite(pit: number): number {
  return 12 - pit;
}

export function initialState(first: Side): MancalaState {
  const pits = Array.from({ length: 14 }, (_, i) => (i === MY_STORE || i === CPU_STORE ? 0 : SEEDS_PER_PIT));
  return { pits, turn: first };
}

/** 石のある、手番の人の穴 */
export function legalMoves(state: MancalaState): number[] {
  return pitsOf(state.turn).filter((i) => state.pits[i] > 0);
}

/** その陣地の穴に残っている石の数 */
export function sideStones(pits: readonly number[], side: Side): number {
  return pitsOf(side).reduce((sum, i) => sum + pits[i], 0);
}

/**
 * 石が通るマスの列（演出用）。撒く穴の石の数と同じ長さ。
 * 相手のゴールは飛ばし、13 個以上で一周したときは元の穴にも置く。
 */
export function sowPath(state: MancalaState, pit: number): number[] {
  const skip = storeOf(other(state.turn));
  const path: number[] = [];
  let at = pit;
  for (let n = state.pits[pit]; n > 0; n--) {
    at = (at + 1) % 14;
    if (at === skip) at = (at + 1) % 14;
    path.push(at);
  }
  return path;
}

/** 撒いた後の状態。`pit` は手番の人の石のある穴でなければならない */
export function applyMove(state: MancalaState, pit: number): MoveResult {
  const side = state.turn;
  if (ownerOf(pit) !== side || state.pits[pit] === 0) {
    throw new Error(`撒けない穴です: ${pit}`);
  }
  const path = sowPath(state, pit);
  const pits = state.pits.slice();
  pits[pit] = 0;
  for (const at of path) pits[at] += 1;

  const last = path[path.length - 1];
  const store = storeOf(side);
  let captured = 0;
  // 横取り：自分の陣地の、撒く前は空だった穴（＝いま 1 個）で止まり、向かいに石があるとき
  if (ownerOf(last) === side && pits[last] === 1 && pits[opposite(last)] > 0) {
    captured = pits[opposite(last)] + 1;
    pits[store] += captured;
    pits[last] = 0;
    pits[opposite(last)] = 0;
  }
  const extraTurn = last === store;
  const gameOver = sideStones(pits, 'me') === 0 || sideStones(pits, 'cpu') === 0;
  return {
    state: { pits, turn: extraTurn || gameOver ? side : other(side) },
    extraTurn: extraTurn && !gameOver,
    captured,
    gameOver,
  };
}

/** 終局の精算：残っている石を、その陣地の持ち主のゴールへ */
export function finish(state: MancalaState): MancalaState {
  const pits = state.pits.slice();
  for (const side of ['me', 'cpu'] as const) {
    for (const i of pitsOf(side)) {
      pits[storeOf(side)] += pits[i];
      pits[i] = 0;
    }
  }
  return { pits, turn: state.turn };
}

export function isOver(state: MancalaState): boolean {
  return sideStones(state.pits, 'me') === 0 || sideStones(state.pits, 'cpu') === 0;
}

/** 精算後の盤の勝敗（自分から見て） */
export function outcomeOf(finished: MancalaState): 'win' | 'loss' | 'draw' {
  const d = finished.pits[MY_STORE] - finished.pits[CPU_STORE];
  return d > 0 ? 'win' : d < 0 ? 'loss' : 'draw';
}

/** 予告（PC でマウスを乗せたとき・スマホで撒いたあとの 1 行）に使う、その手の結果 */
export interface MovePreview {
  /** 最後の石が止まるマス */
  last: number;
  extraTurn: boolean;
  captured: number;
}

export function previewMove(state: MancalaState, pit: number): MovePreview {
  const path = sowPath(state, pit);
  const r = applyMove(state, pit);
  return { last: path[path.length - 1], extraTurn: r.extraTurn, captured: r.captured };
}

// ---------------------------------------------------------------------------
// CPU
// ---------------------------------------------------------------------------

/** ふつうの探索の深さ */
export const NORMAL_DEPTH = 4;
/** つよいの 1 手の持ち時間（ms） */
export const HARD_BUDGET_MS = 150;
/**
 * つよいの反復深化の深さの上限。時間で打ち切るので実質は上限なし
 * （盤が読み切れて深さを上げても変わらなくなったときに止めるための安全弁）。
 * 「つよい」が強すぎたときに回すつまみの 2 番目（仕様書）はここを 10 → 8 → 6 と下げる
 */
export const HARD_MAX_DEPTH = 40;
/** つよいの評価で、自陣に残る石に掛ける重み */
export const HARD_SIDE_WEIGHT = 0.25;

class Timeout extends Error {}

/**
 * 探索の中は速さのため、`MancalaState` を作らず 14 マスの配列をその場で書き換える
 * （`applyMove` と同じ規則。食い違いは `tests/mancala.test.ts` が `applyMove` と突き合わせて見張る）。
 * 手番の人は 0（自分）・1（CPU）
 */
const EXTRA = 1;
const CAPTURED = 2;
const OVER = 4;

/** 撒く（`p` を書き換える）。戻り値は EXTRA / CAPTURED / OVER の組み合わせ */
export function sowRaw(p: number[], who: 0 | 1, pit: number): number {
  const store = who === 0 ? MY_STORE : CPU_STORE;
  const skip = who === 0 ? CPU_STORE : MY_STORE;
  let n = p[pit];
  p[pit] = 0;
  let at = pit;
  while (n > 0) {
    at = at === 13 ? 0 : at + 1;
    if (at === skip) at = at === 13 ? 0 : at + 1;
    p[at] += 1;
    n--;
  }
  let flags = 0;
  const lo = who === 0 ? 0 : 7;
  if (at >= lo && at < lo + PITS && p[at] === 1 && p[12 - at] > 0) {
    p[store] += p[12 - at] + 1;
    p[at] = 0;
    p[12 - at] = 0;
    flags |= CAPTURED;
  }
  const mine = p[0] + p[1] + p[2] + p[3] + p[4] + p[5];
  const theirs = p[7] + p[8] + p[9] + p[10] + p[11] + p[12];
  if (mine === 0 || theirs === 0) flags |= OVER;
  else if (at === store) flags |= EXTRA;
  return flags;
}

interface SearchOptions {
  /** 評価に自陣の石を足す重み（ふつうは 0） */
  sideWeight: number;
  deadline: number;
  now: () => number;
}

let nodeCounter = 0;

/** 評価（`me` から見て）。終局は精算した盤のゴールの差を大きく効かせる（読み切った勝ちを取りこぼさない） */
function evaluate(p: readonly number[], me: 0 | 1, over: boolean, weight: number): number {
  const mySide = p[0] + p[1] + p[2] + p[3] + p[4] + p[5];
  const cpuSide = p[7] + p[8] + p[9] + p[10] + p[11] + p[12];
  if (over) {
    const d = p[MY_STORE] + mySide - (p[CPU_STORE] + cpuSide);
    return (me === 0 ? d : -d) * 1000;
  }
  const d = p[MY_STORE] - p[CPU_STORE];
  return me === 0 ? d + weight * mySide : -d + weight * cpuSide;
}

/** αβ（`me` から見た値の min/max）。「もう 1 回」は深さを使わない。「もう 1 回」・横取りの手を先に読む */
function alphabeta(
  p: number[],
  turn: 0 | 1,
  depth: number,
  alpha: number,
  beta: number,
  me: 0 | 1,
  opts: SearchOptions,
): number {
  if ((++nodeCounter & 255) === 0 && opts.now() > opts.deadline) throw new Timeout();
  if (depth === 0) return evaluate(p, me, false, opts.sideWeight);
  const maximize = turn === me;
  let best = maximize ? -Infinity : Infinity;
  const lo = turn === 0 ? 0 : 7;
  const kids: number[][] = [];
  const flags: number[] = [];
  for (let i = lo; i < lo + PITS; i++) {
    if (p[i] === 0) continue;
    const c = p.slice();
    const f = sowRaw(c, turn, i);
    // 「もう 1 回」・横取りを前へ（並べ替えるのは内側の節だけ。根は左から読む）
    if (f & (EXTRA | CAPTURED)) {
      kids.unshift(c);
      flags.unshift(f);
    } else {
      kids.push(c);
      flags.push(f);
    }
  }
  for (let k = 0; k < kids.length; k++) {
    const f = flags[k];
    const v =
      f & OVER
        ? evaluate(kids[k], me, true, opts.sideWeight)
        : f & EXTRA
          ? alphabeta(kids[k], turn, depth, alpha, beta, me, opts)
          : alphabeta(kids[k], turn === 0 ? 1 : 0, depth - 1, alpha, beta, me, opts);
    if (maximize) {
      if (v > best) best = v;
      if (best > alpha) alpha = best;
    } else {
      if (v < best) best = v;
      if (best < beta) beta = best;
    }
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * 根の最善手。左の穴から読み、それまでの最善を下限の窓にする（同点や下回る手は刈られて選ばれない）。
 * 値が**真に大きい**ときだけ入れ替えるので、同点は左の穴（その人から見て）になる
 */
function rootSearch(state: MancalaState, depth: number, opts: SearchOptions): number {
  const me: 0 | 1 = state.turn === 'me' ? 0 : 1;
  let bestPit = -1;
  let bestValue = -Infinity;
  for (const pit of legalMoves(state)) {
    const c = state.pits.slice();
    const f = sowRaw(c, me, pit);
    const value =
      f & OVER
        ? evaluate(c, me, true, opts.sideWeight)
        : f & EXTRA
          ? alphabeta(c, me, depth, bestValue, Infinity, me, opts)
          : alphabeta(c, me === 0 ? 1 : 0, depth - 1, bestValue, Infinity, me, opts);
    if (bestPit < 0 || value > bestValue) {
      bestPit = pit;
      bestValue = value;
    }
  }
  return bestPit;
}

export interface CpuOptions {
  /** 反復深化の深さの上限（テストで時間に依らず手を決めるために渡す） */
  maxDepth?: number;
  /** 時計（テストで差し替える） */
  now?: () => number;
}

/**
 * CPU の手。盤の状態だけを引数に取る（UI の状態を渡さない）。
 *
 * @param deadlineMs つよいの持ち時間（ms）。既定は `HARD_BUDGET_MS`
 */
export function cpuMove(
  state: MancalaState,
  level: Level,
  rng: () => number,
  deadlineMs: number = HARD_BUDGET_MS,
  options: CpuOptions = {},
): number {
  const moves = legalMoves(state);
  if (moves.length === 0) throw new Error('撒ける穴がありません');
  if (moves.length === 1) return moves[0];

  if (level === 'easy') {
    const extra = moves.filter((p) => applyMove(state, p).extraTurn);
    if (extra.length > 0 && rng() < 0.5) return extra[Math.floor(rng() * extra.length)];
    return moves[Math.floor(rng() * moves.length)];
  }

  const now = options.now ?? (() => Date.now());
  if (level === 'normal') {
    return rootSearch(state, NORMAL_DEPTH, { sideWeight: 0, deadline: Infinity, now });
  }

  const maxDepth = options.maxDepth ?? HARD_MAX_DEPTH;
  const opts: SearchOptions = { sideWeight: HARD_SIDE_WEIGHT, deadline: now() + deadlineMs, now };
  let best = moves[0];
  for (let depth = 1; depth <= maxDepth; depth++) {
    try {
      best = rootSearch(state, depth, opts);
    } catch (e) {
      if (e instanceof Timeout) break;
      throw e;
    }
    if (now() > opts.deadline) break;
  }
  return best;
}

// ---------------------------------------------------------------------------
// 今日の 1 手番
// ---------------------------------------------------------------------------

/**
 * 日替わりの作り方の版。**作り方を変えたら上げる**
 * （上げないと、過去の「今日の 1 手番」が黙って別の局面になる）
 */
export const DAILY_VERSION = 1;
/** 作り直しの上限（条件ごと） */
export const DAILY_TRIES = 200;
/** 局面を作るときに進める手数の範囲 */
export const DAILY_MIN_PLIES = 8;
export const DAILY_MAX_PLIES = 16;
/** 最適値に届くのに要る撒く回数（の下限）。見つからない日は `DAILY_RELAXED_SOWS` に緩める */
export const DAILY_MIN_SOWS = 3;
export const DAILY_RELAXED_SOWS = 2;

export interface TurnResult {
  /** 1 回の手番で自分のゴールに入れられる最大の数 */
  best: number;
  /** その最大に届く撒き順のうち、撒く回数がいちばん少ないもの（同じなら左の穴から） */
  path: number[];
}

/**
 * 1 回の手番（「もう 1 回」の連鎖を含む）の最適値と撒き順。全通りの深さ優先探索。
 * 手番の途中で終局しても `finish()` は呼ばず、ゴールに入った数だけを数える。
 */
export function bestTurn(state: MancalaState): TurnResult {
  const side = state.turn;
  const store = storeOf(side);
  const start = state.pits[store];
  const walk = (s: MancalaState): TurnResult => {
    let result: TurnResult | null = null;
    for (const pit of legalMoves(s)) {
      const r = applyMove(s, pit);
      const sub: TurnResult = r.extraTurn
        ? walk(r.state)
        : { best: r.state.pits[store] - start, path: [] };
      const cand = { best: sub.best, path: [pit, ...sub.path] };
      if (
        result === null ||
        cand.best > result.best ||
        (cand.best === result.best && cand.path.length < result.path.length)
      ) {
        result = cand;
      }
    }
    // 連鎖の途中で撒ける穴が無いことは無い（その時点で終局として止まっている）
    return result ?? { best: s.pits[store] - start, path: [] };
  };
  return walk(state);
}

/** 撒き順を進めて、ゴールに入った数と手番が終わったかを返す（今日の 1 手番の数え方） */
export function playTurn(state: MancalaState, path: readonly number[]): { state: MancalaState; got: number; done: boolean } {
  const side = state.turn;
  const store = storeOf(side);
  let s = state;
  let done = false;
  for (const pit of path) {
    if (done || s.turn !== side || ownerOf(pit) !== side || s.pits[pit] === 0) break;
    const r = applyMove(s, pit);
    s = r.state;
    if (!r.extraTurn) done = true;
  }
  return { state: s, got: s.pits[store] - state.pits[store], done };
}

export interface DailyPuzzle {
  state: MancalaState;
  best: number;
  path: number[];
  /** 撒く回数の条件を 2 回以上に緩めた日 */
  relaxed: boolean;
  /** 予備の局面から選んだ日 */
  fallback: boolean;
}

/**
 * 予備の局面（作り直しが尽きた日のためのもの）。`dailyCandidate` が実際の対局の手順から作った局面を写したもので、
 * どれも自分の手番・石は 48 個・最適値に届くには撒く回数が 3 回以上要る（`tests/mancala.test.ts` が確かめる）。
 * 2026〜2028 年の全日では一度も使われない（同じテスト）
 */
export const FALLBACK_PUZZLES: readonly (readonly number[])[] = [
  [0, 3, 0, 1, 2, 1, 10, 3, 1, 0, 2, 11, 4, 10],
  [1, 8, 4, 2, 3, 2, 6, 3, 1, 0, 0, 0, 11, 7],
  [8, 4, 2, 3, 1, 4, 4, 5, 1, 2, 1, 0, 9, 4],
  [8, 2, 7, 0, 2, 1, 5, 8, 7, 0, 0, 1, 3, 4],
  [6, 6, 1, 0, 1, 3, 5, 1, 9, 7, 0, 0, 7, 2],
  [6, 7, 5, 0, 0, 0, 12, 0, 2, 0, 5, 2, 2, 7],
  [9, 1, 4, 2, 3, 0, 7, 2, 0, 10, 4, 0, 1, 5],
];

function minSowsOk(result: TurnResult, minSows: number): boolean {
  return result.best > 0 && result.path.length >= minSows;
}

/** 種 1 つから局面を 1 つ作る。途中で終局したら null（その試行は捨てる） */
export function dailyCandidate(seed: number): MancalaState | null {
  const rng = mulberry32(seed);
  const plies = DAILY_MIN_PLIES + Math.floor(rng() * (DAILY_MAX_PLIES - DAILY_MIN_PLIES + 1));
  let s = initialState('me');
  const step = () => {
    const moves = legalMoves(s);
    const r = applyMove(s, moves[Math.floor(rng() * moves.length)]);
    s = r.state;
    return !r.gameOver;
  };
  for (let i = 0; i < plies; i++) if (!step()) return null;
  // 進めた先が CPU の手番なら、自分の手番になるまで進める
  while (s.turn !== 'me') if (!step()) return null;
  return s;
}

/** 日替わりの局面。同じ種なら同じ局面 */
export function dailyPuzzle(seed: number): DailyPuzzle {
  for (const [minSows, relaxed] of [
    [DAILY_MIN_SOWS, false],
    [DAILY_RELAXED_SOWS, true],
  ] as const) {
    for (let k = 0; k < DAILY_TRIES; k++) {
      const s = dailyCandidate((seed + k) | 0);
      if (!s) continue;
      const r = bestTurn(s);
      if (minSowsOk(r, minSows)) return { state: s, ...r, relaxed, fallback: false };
    }
  }
  const pits = FALLBACK_PUZZLES[((seed % 7) + 7) % 7].slice();
  const state: MancalaState = { pits, turn: 'me' };
  return { state, ...bestTurn(state), relaxed: false, fallback: true };
}

/** 今日の 1 手番の共有文（局面は入れない） */
export function shareText(params: { dateKey: string; got: number; best: number; url: string }): string {
  const { dateKey, got, best, url } = params;
  return `マンカラ 今日の1手番 ${dateKey} ${got}/${best}個\n${url}`;
}

/** 今日の 1 手番の途中経過を置くキー（途中経過なので `lib/records.ts` とは別に持つ） */
export const DAILY_PROGRESS_KEY = 'mancala:daily';

export interface ProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 保存してある今日の撒き順（局面は日付から作り直すので、撒いた穴の列だけを持つ） */
export function readDailyProgress(storage: ProgressStorage | null, today: string): number[] {
  try {
    const raw = storage?.getItem(DAILY_PROGRESS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as { dateKey?: unknown; path?: unknown };
    if (data.dateKey !== today || !Array.isArray(data.path)) return [];
    return data.path.filter((p): p is number => Number.isInteger(p) && p >= 0 && p < PITS);
  } catch {
    return [];
  }
}

export function writeDailyProgress(storage: ProgressStorage | null, today: string, path: readonly number[]): void {
  try {
    storage?.setItem(DAILY_PROGRESS_KEY, JSON.stringify({ dateKey: today, path }));
  } catch {
    // 書けなくても遊べる（再読み込みで手が戻らないだけ）
  }
}
