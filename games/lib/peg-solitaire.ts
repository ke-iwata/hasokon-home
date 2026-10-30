/**
 * ペグ・ソリティア（駒とび）のロジック（純関数のみ）。
 *
 * 仕様: docs/features/game-peg-solitaire.md
 *
 * ## 盤の状態は 32 ビット×2 の組 `{ lo, hi }`
 *
 * JavaScript のビット演算（`<<` `&` `|` `>>>`）は 32 ビットに切り詰めるので、33 穴を 1 つの数の
 * ビット列にすると 33 番目の穴（`1 << 32` は `1`）で黙って壊れる。穴 0〜31 を `lo`、32 以降を `hi` に置き、
 * **穴の番号からビットを引くのは `bitOf` だけ**にする（ほかの場所でシフトを書かない）。
 * `lo` は演算のたびに `>>> 0` で符号なしに戻す。メモのキーは `hi * 2 ** 32 + lo`（算術で作る）。
 * `bigint` は探索の内側で遅いので使わない。
 *
 * ## 解き手に渡すゴール
 *
 * ヒントと詰みの予告は「どこでも 1 本」（`goal` なし）、今日の 1 問の成立と難しさの判定は
 * 「ゴールの穴で 1 本」（`goal` あり）。
 */

import { mulberry32 } from '@/lib/daily';

// ---------------------------------------------------------------------------
// 盤

export type BoardId = 'english' | 'triangle';
export type Variant = 'daily' | 'english' | 'triangle';

export const VARIANT_ORDER: readonly Variant[] = ['daily', 'english', 'triangle'];
export const VARIANT_LABEL: Record<Variant, string> = {
  daily: '今日の1問',
  english: '英国式33穴',
  triangle: '三角15穴',
};

/** 跳ぶ 1 回。`from` の駒が `over` の駒を飛び越えて `to` の穴へ */
export interface Jump {
  from: number;
  over: number;
  to: number;
}

export interface Board {
  id: BoardId;
  /** 穴の数 */
  holes: number;
  /** 各穴の行・列（三角盤は行 r に r+1 個。列は行の中の位置） */
  coords: readonly { r: number; c: number }[];
  /** 盤の行数・列数（描画の格子） */
  rows: number;
  cols: number;
  /** 盤の上で起こりうる跳びのすべて（駒の有無は見ない） */
  jumps: readonly Jump[];
  /** 穴ごとの「そこから跳ぶ」跳び */
  jumpsFrom: readonly (readonly Jump[])[];
  /** 初期の空き穴 */
  start: number;
  /** 完全クリアの印の穴（定番盤は初期の空き穴と同じ） */
  goal: number;
}

function makeBoard(
  id: BoardId,
  coords: { r: number; c: number }[],
  dirs: readonly [number, number][],
  rows: number,
  cols: number,
  start: number,
  goal: number,
): Board {
  const at = new Map<string, number>();
  coords.forEach((p, i) => at.set(`${p.r},${p.c}`, i));
  const jumps: Jump[] = [];
  const jumpsFrom: Jump[][] = coords.map(() => []);
  coords.forEach((p, from) => {
    for (const [dr, dc] of dirs) {
      const over = at.get(`${p.r + dr},${p.c + dc}`);
      const to = at.get(`${p.r + 2 * dr},${p.c + 2 * dc}`);
      if (over === undefined || to === undefined) continue;
      const j = { from, over, to };
      jumps.push(j);
      jumpsFrom[from].push(j);
    }
  });
  return { id, holes: coords.length, coords, rows, cols, jumps, jumpsFrom, start, goal };
}

const ORTHO: readonly [number, number][] = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
];

/** 三角盤の 6 方向（辺に沿った 3 本の線の両向き。行 r・列 c で、(1,1) と (-1,-1) が斜めの辺） */
const TRI: readonly [number, number][] = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
  [1, 1],
  [-1, -1],
];

function englishCoords(): { r: number; c: number }[] {
  const out: { r: number; c: number }[] = [];
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      if ((r < 2 || r > 4) && (c < 2 || c > 4)) continue;
      out.push({ r, c });
    }
  }
  return out;
}

function triangleCoords(): { r: number; c: number }[] {
  const out: { r: number; c: number }[] = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c <= r; c++) out.push({ r, c });
  return out;
}

/** 英国式 33 穴の中央（行 3・列 3） */
export const ENGLISH_CENTER = 16;

export const BOARDS: Record<BoardId, Board> = {
  english: makeBoard('english', englishCoords(), ORTHO, 7, 7, ENGLISH_CENTER, ENGLISH_CENTER),
  // 角（上の頂点）を 1 つ空けて始め、同じ角に 1 本残すのが完全クリア
  triangle: makeBoard('triangle', triangleCoords(), TRI, 5, 5, 0, 0),
};

/** 三角 15 穴の中央の 3 穴（ここから始めると、その穴で 1 本残しには解けない） */
export const TRIANGLE_INNER = [4, 7, 8] as const;

export function boardOf(variant: Variant): Board {
  return variant === 'triangle' ? BOARDS.triangle : BOARDS.english;
}

// ---------------------------------------------------------------------------
// 状態（32 ビット×2）

export interface PegState {
  /** 穴 0〜31 */
  lo: number;
  /** 穴 32 以降 */
  hi: number;
}

/** 穴の番号から、どちらの語の何ビット目か。**シフトを書くのはここだけ** */
export function bitOf(hole: number): { word: 'lo' | 'hi'; mask: number } {
  return hole < 32 ? { word: 'lo', mask: (1 << hole) >>> 0 } : { word: 'hi', mask: (1 << (hole - 32)) >>> 0 };
}

export const EMPTY: PegState = { lo: 0, hi: 0 };

export function hasPeg(state: PegState, hole: number): boolean {
  const { word, mask } = bitOf(hole);
  return ((state[word] & mask) >>> 0) !== 0;
}

export function withPeg(state: PegState, hole: number, on: boolean): PegState {
  const { word, mask } = bitOf(hole);
  const v = on ? (state[word] | mask) >>> 0 : (state[word] & ~mask) >>> 0;
  return word === 'lo' ? { lo: v, hi: state.hi } : { lo: state.lo, hi: v };
}

export function fromPegs(pegs: Iterable<number>): PegState {
  let s = EMPTY;
  for (const h of pegs) s = withPeg(s, h, true);
  return s;
}

export function pegsOf(board: Board, state: PegState): number[] {
  const out: number[] = [];
  for (let h = 0; h < board.holes; h++) if (hasPeg(state, h)) out.push(h);
  return out;
}

/** メモのキー（53 ビットに収まる数。ビット演算ではなく算術で作る） */
export function stateKey(state: PegState): number {
  return state.hi * 2 ** 32 + state.lo;
}

function popcount32(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24) >>> 0;
}

/** 残っている駒の数 */
export function remaining(state: PegState): number {
  return popcount32(state.lo) + popcount32(state.hi);
}

/** 盤の初期局面（初期の空き穴以外に駒） */
export function initialState(board: Board): PegState {
  let s = EMPTY;
  for (let h = 0; h < board.holes; h++) if (h !== board.start) s = withPeg(s, h, true);
  return s;
}

// ---------------------------------------------------------------------------
// 跳ぶ

export function canJump(state: PegState, j: Jump): boolean {
  return hasPeg(state, j.from) && hasPeg(state, j.over) && !hasPeg(state, j.to);
}

export function legalJumps(board: Board, state: PegState): Jump[] {
  return board.jumps.filter((j) => canJump(state, j));
}

export function jumpsFromHole(board: Board, state: PegState, hole: number): Jump[] {
  return board.jumpsFrom[hole].filter((j) => canJump(state, j));
}

/** 跳んだ後の状態と、跳ぶ駒・越える駒・行き先（演出の経路は `Game.tsx` が座標から当てる） */
export function applyJump(
  board: Board,
  state: PegState,
  jump: Jump,
): { state: PegState; from: number; over: number; to: number } {
  if (!canJump(state, jump) || !board.jumpsFrom[jump.from].some((j) => j.to === jump.to)) {
    throw new Error(`跳べない手です: ${jump.from}→${jump.to}`);
  }
  let s = withPeg(state, jump.from, false);
  s = withPeg(s, jump.over, false);
  s = withPeg(s, jump.to, true);
  return { state: s, from: jump.from, over: jump.over, to: jump.to };
}

export function isOver(board: Board, state: PegState): boolean {
  return !board.jumps.some((j) => canJump(state, j));
}

/** 同じ駒の連続跳び（直前の行き先から跳ぶ）を 1 手として数える */
export function countMoves(history: readonly Jump[]): number {
  let n = 0;
  for (let i = 0; i < history.length; i++) {
    if (i === 0 || history[i].from !== history[i - 1].to) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// 解き手

export interface SolveOptions {
  /** 1 本を残す穴。省略すると「どこでも 1 本」 */
  goal?: number;
  /** 打ち切るまでの時間（ms）。省略すると打ち切らない */
  deadlineMs?: number;
  /** 時計（テストで差し替える） */
  now?: () => number;
  /** 解けないと分かった局面のメモ。**同じ盤・同じ `goal` の呼び出しどうしでだけ**使い回せる */
  memo?: Set<number>;
}

/**
 * 1 本残しに届く手順を 1 つ返す。届かなければ `null`、時間切れは `'timeout'`。
 * 深さ優先の探索に、解けないと分かった局面のメモ（`Set<number>`）を付ける。
 */
export function solve(board: Board, state: PegState, opts: SolveOptions = {}): Jump[] | null | 'timeout' {
  const { goal, deadlineMs } = opts;
  const now = opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const limit = deadlineMs === undefined ? Infinity : now() + deadlineMs;
  const dead = opts.memo ?? new Set<number>();
  const path: Jump[] = [];
  let nodes = 0;
  let timedOut = false;
  const jumps = board.jumps;

  const done = (s: PegState) => remaining(s) === 1 && (goal === undefined || hasPeg(s, goal));

  const dfs = (s: PegState): boolean => {
    if (done(s)) return true;
    if (++nodes % 512 === 0 && now() > limit) {
      timedOut = true;
      return false;
    }
    const key = stateKey(s);
    if (dead.has(key)) return false;
    for (const j of jumps) {
      if (!canJump(s, j)) continue;
      let n = withPeg(s, j.from, false);
      n = withPeg(n, j.over, false);
      n = withPeg(n, j.to, true);
      path.push(j);
      if (dfs(n)) return true;
      path.pop();
      if (timedOut) return false;
    }
    dead.add(key);
    return false;
  };

  if (remaining(state) === 0) return null;
  const ok = dfs(state);
  if (ok) return path.slice();
  return timedOut ? 'timeout' : null;
}

/** 解き手を呼ぶ駒の数の上限（これより多い局面の全探索は重い） */
export const SOLVER_MAX_PEGS = 16;
/** 詰みの予告で 1 手に使ってよい時間（ms） */
export const DOOM_DEADLINE_MS = 50;
/** ヒントを探す時間の上限（ms） */
export const HINT_DEADLINE_MS = 400;

/**
 * 英国式 33 穴の中央から中央へ、18 手（連続跳びを 1 手と数える）で 1 本残しにする手順。
 * 31 回跳ぶ。手順をたどっている間のヒントにも使う（`tests/peg-solitaire.test.ts` が再生して確かめる）。
 */
export const KNOWN_ENGLISH_SOLUTION: readonly Jump[] = (
  [
    [4, 16], [7, 9], [0, 8], [15, 3], [10, 8], [12, 10], [27, 15], [20, 22], [23, 21], [21, 7], [7, 9],
    [9, 11], [2, 0], [0, 8], [8, 22], [25, 23], [23, 21], [6, 20], [20, 22], [26, 12], [12, 10], [32, 24],
    [17, 29], [30, 32], [32, 24], [5, 17], [17, 15], [15, 27], [27, 29], [29, 17], [18, 16],
  ] as const
).map(([from, to]) => {
  const j = BOARDS.english.jumpsFrom[from].find((x) => x.to === to);
  if (!j) throw new Error(`KNOWN_ENGLISH_SOLUTION に盤に無い跳び: ${from}→${to}`);
  return j;
});

/** 英国式の最短手数（Bergholt 1912・Beasley 1964） */
export const ENGLISH_MIN_MOVES = 18;

export type Hint =
  | { kind: 'jump'; jump: Jump }
  /** 駒が多すぎて解き手を呼べない。あと何本減ればよいか */
  | { kind: 'too-many'; need: number }
  /** もう 1 本残しには届かない */
  | { kind: 'none' }
  | { kind: 'timeout' };

function sameJump(a: Jump, b: Jump): boolean {
  return a.from === b.from && a.over === b.over && a.to === b.to;
}

/**
 * ヒント（ゴールは「どこでも 1 本」）。
 * 英国式で、初期局面から `KNOWN_ENGLISH_SOLUTION` をそのままたどっている間は、その次の手を返す。
 */
export function hint(
  variant: Variant,
  state: PegState,
  history: readonly Jump[],
  opts: { deadlineMs?: number; now?: () => number } = {},
): Hint {
  const board = boardOf(variant);
  if (
    variant === 'english' &&
    history.length < KNOWN_ENGLISH_SOLUTION.length &&
    history.every((j, i) => sameJump(j, KNOWN_ENGLISH_SOLUTION[i]))
  ) {
    return { kind: 'jump', jump: KNOWN_ENGLISH_SOLUTION[history.length] };
  }
  const n = remaining(state);
  if (n > SOLVER_MAX_PEGS) return { kind: 'too-many', need: n - SOLVER_MAX_PEGS };
  const r = solve(board, state, { deadlineMs: opts.deadlineMs ?? HINT_DEADLINE_MS, now: opts.now });
  if (r === 'timeout') return { kind: 'timeout' };
  if (r === null || r.length === 0) return { kind: 'none' };
  return { kind: 'jump', jump: r[0] };
}

/**
 * 詰みの予告（ゴールは「どこでも 1 本」）。
 * `true` は「もう 1 本残しに届かない」と分かったとき。駒が多い・時間切れ・まだ届くは `false`（何も出さない）。
 */
export function isDoomed(board: Board, state: PegState, opts: { deadlineMs?: number; now?: () => number } = {}): boolean {
  if (remaining(state) <= 1) return false;
  if (remaining(state) > SOLVER_MAX_PEGS) return false;
  const r = solve(board, state, { deadlineMs: opts.deadlineMs ?? DOOM_DEADLINE_MS, now: opts.now });
  return r === null;
}

// ---------------------------------------------------------------------------
// タップの解釈（`Game.tsx` は結果に従うだけ）

export interface Selection {
  /** 選んでいる駒の穴 */
  selected: number | null;
  /** 連続跳びの最中か（この駒で 1 回以上跳んだ） */
  chain: boolean;
}

export const NO_SELECTION: Selection = { selected: null, chain: false };

export type TapResult =
  | { kind: 'select'; hole: number }
  | { kind: 'deselect' }
  | { kind: 'jump'; jump: Jump }
  | { kind: 'none' };

/**
 * 穴を押したときに何をするか。
 *
 * - 光った穴（選んでいる駒の行き先）→ 跳ぶ
 * - 選んでいる駒をもう一度：手の最初で跳べる先が 1 つだけなら跳ぶ、2 つ以上なら選択を外す。
 *   **連続跳びの最中は跳ばずに選択を外す**（手を締める。同じ 2 度押しに 2 つの意味を持たせない）
 * - 別の跳べる駒 → その駒を選ぶ（連続跳びの最中なら手が切り替わる）
 */
export function tap(board: Board, state: PegState, sel: Selection, hole: number): TapResult {
  if (sel.selected !== null) {
    const from = jumpsFromHole(board, state, sel.selected);
    if (hole === sel.selected) {
      if (!sel.chain && from.length === 1) return { kind: 'jump', jump: from[0] };
      return { kind: 'deselect' };
    }
    const j = from.find((x) => x.to === hole);
    if (j) return { kind: 'jump', jump: j };
  }
  if (hasPeg(state, hole) && jumpsFromHole(board, state, hole).length > 0) return { kind: 'select', hole };
  return sel.selected === null ? { kind: 'none' } : { kind: 'deselect' };
}

/** 跳んだ直後の選択。続けて跳べるならその駒を選んだまま、跳べなければ外す */
export function selectionAfterJump(board: Board, state: PegState, jump: Jump): Selection {
  return jumpsFromHole(board, state, jump.to).length > 0 ? { selected: jump.to, chain: true } : NO_SELECTION;
}

// ---------------------------------------------------------------------------
// 今日の 1 問

/** 生成手順の版。**手順を変えたら上げる**（`dailySeed` に渡す） */
export const DAILY_VERSION = 1;
/** 逆の跳びをあてる回数の範囲（駒は 1 + この回数 = 10〜14 本） */
export const DAILY_MIN_REVERSE = 9;
export const DAILY_MAX_REVERSE = 13;
/** 作り直しの上限（厳しい条件・緩めた条件それぞれ） */
export const DAILY_MAX_TRIES = 200;

export interface DailyPuzzle {
  state: PegState;
  goal: number;
  /** 条件を緩めた日か */
  relaxed: boolean;
  /** 予備の局面に落ちた日か */
  fallback: boolean;
}

/**
 * 予備の局面 7 つ（英国式の盤。駒の穴とゴールの穴）。どの日も生成で見つからなかったときにだけ
 * `seed % 7` で選ぶ。`tests/` で 7 つすべてがゴールの穴で 1 本残しに解けることを確かめる。
 */
export const DAILY_FALLBACKS: readonly { pegs: readonly number[]; goal: number }[] = [
  { pegs: [1, 4, 8, 10, 14, 15, 17, 18, 28, 31], goal: 26 },
  { pegs: [1, 4, 5, 10, 14, 15, 18, 22, 25, 26, 28], goal: 4 },
  { pegs: [4, 5, 9, 11, 12, 14, 19, 24, 25, 28], goal: 13 },
  { pegs: [0, 7, 8, 13, 14, 15, 16, 17, 18, 23], goal: 14 },
  { pegs: [4, 7, 8, 9, 14, 16, 17, 24, 25, 31, 32], goal: 32 },
  { pegs: [1, 6, 7, 11, 15, 16, 17, 18, 19, 21, 22, 24, 25], goal: 0 },
  { pegs: [1, 3, 4, 6, 7, 15, 16, 21, 22, 23], goal: 4 },
];

/** ゴールの穴に駒 1 本の盤から、逆の跳び（空・空・駒 → 駒・駒・空）を `count` 回あてる。行き詰まったら null */
export function reverseScramble(board: Board, goal: number, count: number, rng: () => number): PegState | null {
  let s = fromPegs([goal]);
  for (let i = 0; i < count; i++) {
    const options = board.jumps.filter((j) => hasPeg(s, j.to) && !hasPeg(s, j.over) && !hasPeg(s, j.from));
    if (options.length === 0) return null;
    const j = options[Math.floor(rng() * options.length)];
    s = withPeg(s, j.to, false);
    s = withPeg(s, j.over, true);
    s = withPeg(s, j.from, true);
  }
  return s;
}

/** 最初に打てる手のうち、ゴールの穴で 1 本残しに届かない手の数と、手の総数 */
export function firstMoveDeadEnds(board: Board, state: PegState, goal: number): { dead: number; total: number } {
  const first = legalJumps(board, state);
  const memo = new Set<number>();
  let dead = 0;
  for (const j of first) {
    if (solve(board, applyJump(board, state, j).state, { goal, memo }) === null) dead++;
  }
  return { dead, total: first.length };
}

function tryDaily(seed: number, relaxed: boolean): DailyPuzzle | null {
  const board = BOARDS.english;
  for (let k = 0; k < DAILY_MAX_TRIES; k++) {
    const rng = mulberry32((seed + k) | 0);
    const goal = Math.floor(rng() * board.holes);
    const count = DAILY_MIN_REVERSE + Math.floor(rng() * (DAILY_MAX_REVERSE - DAILY_MIN_REVERSE + 1));
    const state = reverseScramble(board, goal, count, rng);
    if (!state) continue;
    const { dead, total } = firstMoveDeadEnds(board, state, goal);
    if (total === 0) continue;
    if (relaxed ? dead >= 1 : dead * 2 >= total) return { state, goal, relaxed, fallback: false };
  }
  return null;
}

/**
 * 今日の 1 問。条件に合わなければ種を `seed + k` にして最大 200 回、
 * 見つからなければ「届かない手が 1 つ以上」に緩めてもう 200 回、それでも無ければ予備から `seed % 7`。
 */
export function dailyPuzzle(seed: number): DailyPuzzle {
  const strict = tryDaily(seed, false);
  if (strict) return strict;
  const loose = tryDaily(seed, true);
  if (loose) return loose;
  const f = DAILY_FALLBACKS[((seed % DAILY_FALLBACKS.length) + DAILY_FALLBACKS.length) % DAILY_FALLBACKS.length];
  return { state: fromPegs(f.pegs), goal: f.goal, relaxed: true, fallback: true };
}

/** 共有文（局面は入れない） */
export function shareText(params: { dateKey: string; moves: number; url: string }): string {
  return `ペグ・ソリティア 今日の1問 ${params.dateKey} クリア（${params.moves}手）\n${params.url}`;
}
