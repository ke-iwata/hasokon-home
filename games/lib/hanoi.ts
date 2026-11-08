/**
 * ハノイの塔のロジック（純関数）。
 *
 * 仕様: docs/features/game-hanoi-no-to.md
 *
 * 円盤は大きさの番号（1 がいちばん小さく、n がいちばん大きい）で表す。
 * 柱は 0（左）・1（中）・2（右）。柱ごとの配列は**下から上**の順で、末尾が一番上。
 * 画面の都合（持ち上げ表示・光り・自動再生の間）はここに持たない（games/CLAUDE.md の画面の約束9）。
 */

/** 柱の番号（0 = 左・1 = 中・2 = 右） */
export type Peg = 0 | 1 | 2;

/** 柱3本ぶんの円盤。各配列は下から上の順（末尾がいちばん上） */
export type Pegs = readonly [readonly number[], readonly number[], readonly number[]];

/** 1手。`from` の柱のいちばん上の1枚を `to` の柱へ移す */
export interface Move {
  from: Peg;
  to: Peg;
}

export const MIN_DISCS = 3;
export const MAX_DISCS = 8;
export const DEFAULT_DISCS = 4;

/** 選べる枚数（3〜8） */
export const DISC_COUNTS: readonly number[] = Array.from(
  { length: MAX_DISCS - MIN_DISCS + 1 },
  (_, i) => MIN_DISCS + i,
);

/** 完成させる柱（右） */
export const GOAL_PEG: Peg = 2;

export const PEGS: readonly Peg[] = [0, 1, 2];

/** 柱の呼び名（読み上げ・ヒントの文言） */
export const PEG_NAMES: Record<Peg, string> = { 0: '左', 1: '中', 2: '右' };

/** 3〜8 の範囲に丸める（URL や保存値から来た数を信用しない） */
export function clampDiscs(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_DISCS;
  return Math.min(MAX_DISCS, Math.max(MIN_DISCS, Math.round(n)));
}

/** n 枚の最少手数 2ⁿ−1 */
export function minMoves(n: number): number {
  return 2 ** n - 1;
}

/** 始めの局面：左の柱に n 枚が大きい順に重なっている */
export function initialPegs(n: number): Pegs {
  const discs = Array.from({ length: n }, (_, i) => n - i);
  return [discs, [], []];
}

/** 柱のいちばん上の円盤（無ければ null） */
export function topOf(pegs: Pegs, peg: Peg): number | null {
  const stack = pegs[peg];
  return stack.length === 0 ? null : stack[stack.length - 1];
}

/** 合法手か。動かす円盤があり、置く先が空か、置く先の一番上がそれより大きいこと */
export function canMove(pegs: Pegs, from: Peg, to: Peg): boolean {
  if (from === to) return false;
  const disc = topOf(pegs, from);
  if (disc === null) return false;
  const under = topOf(pegs, to);
  return under === null || under > disc;
}

/** 1手を打った局面。合法でなければ null（局面は変えない） */
export function applyMove(pegs: Pegs, from: Peg, to: Peg): Pegs | null {
  if (!canMove(pegs, from, to)) return null;
  const next = [pegs[0].slice(), pegs[1].slice(), pegs[2].slice()] as [
    number[],
    number[],
    number[],
  ];
  const disc = next[from].pop() as number;
  next[to].push(disc);
  return next;
}

/** 円盤の総数 */
export function discCount(pegs: Pegs): number {
  return pegs[0].length + pegs[1].length + pegs[2].length;
}

/** 完成：全部が右の柱にある */
export function isSolved(pegs: Pegs): boolean {
  return pegs[GOAL_PEG].length === discCount(pegs) && discCount(pegs) > 0;
}

/** 円盤ごとの柱（添字が円盤の大きさ。0 番は使わない） */
function positions(pegs: Pegs): Peg[] {
  const pos: Peg[] = new Array(discCount(pegs) + 1).fill(0);
  for (const peg of PEGS) for (const disc of pegs[peg]) pos[disc] = peg;
  return pos;
}

/** 3本のうち、a でも b でもない柱 */
function otherPeg(a: Peg, b: Peg): Peg {
  return (3 - a - b) as Peg;
}

/**
 * 任意の局面から、右の柱に全部を移す最短の手数。
 *
 * 大きい円盤から順に「どこへ行くべきか」を決める。いちばん大きい円盤の行き先は右。
 * 円盤 d が行き先にもういれば、d−1 の行き先も同じ。いなければ d を動かす前に
 * 1〜d−1 を3本目の柱へどけておく必要があり（2^(d−1)−1 手）、d を動かす1手と合わせて
 * 2^(d−1) 手かかる。d−1 の行き先はその3本目になる。局面の探索は要らない（O(n)）。
 */
export function minMovesFrom(pegs: Pegs): number {
  const n = discCount(pegs);
  const pos = positions(pegs);
  let target: Peg = GOAL_PEG;
  let total = 0;
  for (let d = n; d >= 1; d--) {
    if (pos[d] === target) continue;
    total += 2 ** (d - 1);
    target = otherPeg(pos[d], target);
  }
  return total;
}

/**
 * 任意の局面から最短で完成させる手の**最初の1手**。完成していれば null。
 *
 * `minMovesFrom` と同じく大きい円盤から行き先を決め、行き先にいない円盤のうち
 * **いちばん小さいもの**を動かす。その円盤より小さいものはすべて「どけておく柱」に
 * そろっているので、この1手は必ず合法になる。
 */
export function nextOptimalMove(pegs: Pegs): Move | null {
  const n = discCount(pegs);
  const pos = positions(pegs);
  let target: Peg = GOAL_PEG;
  let move: Move | null = null;
  for (let d = n; d >= 1; d--) {
    if (pos[d] === target) continue;
    move = { from: pos[d], to: target };
    target = otherPeg(pos[d], target);
  }
  return move;
}

/** 始めの局面から完成までの最短手順（2ⁿ−1 手）。自動再生が使う */
export function optimalSolution(n: number): Move[] {
  const moves: Move[] = [];
  const solve = (k: number, from: Peg, to: Peg) => {
    if (k === 0) return;
    const via = otherPeg(from, to);
    solve(k - 1, from, via);
    moves.push({ from, to });
    solve(k - 1, via, to);
  };
  solve(n, 0, GOAL_PEG);
  return moves;
}

/** 最短手順の1手目の行き先（FAQ の「奇数なら右、偶数なら中」） */
export function firstMoveTarget(n: number): Peg {
  return n % 2 === 1 ? 2 : 1;
}

// ---- 遊びの進行（手数・履歴） ----

export interface PlayState {
  /** 円盤の枚数 */
  n: number;
  pegs: Pegs;
  /** 打った手（1手戻すのに使う） */
  history: readonly Move[];
}

export function startGame(n: number): PlayState {
  const discs = clampDiscs(n);
  return { n: discs, pegs: initialPegs(discs), history: [] };
}

/** 手数 */
export function movesOf(state: PlayState): number {
  return state.history.length;
}

/** 1手打つ。合法でなければ同じ state をそのまま返す（手数も履歴も増えない） */
export function play(state: PlayState, from: Peg, to: Peg): PlayState {
  const pegs = applyMove(state.pegs, from, to);
  if (pegs === null) return state;
  return { ...state, pegs, history: [...state.history, { from, to }] };
}

/** 1手戻す（何手でも）。手が無ければそのまま */
export function undo(state: PlayState): PlayState {
  if (state.history.length === 0) return state;
  const last = state.history[state.history.length - 1];
  const pegs = applyMove(state.pegs, last.to, last.from);
  // 打った手の逆は必ず合法（戻した円盤の下は、打つ前と同じ円盤だから）
  if (pegs === null) return state;
  return { ...state, pegs, history: state.history.slice(0, -1) };
}

/** 最初から（同じ枚数で） */
export function restart(state: PlayState): PlayState {
  return startGame(state.n);
}

// ---- タップ2回（取る柱 → 置く柱） ----

export interface TapResult {
  /** 持ち上げている柱（無ければ null） */
  selected: Peg | null;
  /** 打つ手（あれば） */
  move: Move | null;
  /** 置けない柱を押した（柱を一瞬赤く縁取る） */
  rejected: Peg | null;
}

/**
 * 柱を押したときの扱い。
 *
 * - 何も持っていないとき：円盤のある柱なら持ち上げる。空の柱は何もしない
 * - 持っているとき：同じ柱なら取り消し。置ける柱なら1手。置けない柱なら元に戻して、その柱を赤く縁取る
 */
export function tap(pegs: Pegs, selected: Peg | null, peg: Peg): TapResult {
  if (selected === null) {
    return { selected: topOf(pegs, peg) === null ? null : peg, move: null, rejected: null };
  }
  if (selected === peg) return { selected: null, move: null, rejected: null };
  if (canMove(pegs, selected, peg)) {
    return { selected: null, move: { from: selected, to: peg }, rejected: null };
  }
  return { selected: null, move: null, rejected: peg };
}

/** キーボードの `1`・`2`・`3` を柱に。それ以外は null */
export function pegFromKey(key: string): Peg | null {
  if (key === '1') return 0;
  if (key === '2') return 1;
  if (key === '3') return 2;
  return null;
}

// ---- 記録 ----

/** 記録の区分（枚数ごと。`'3'`〜`'8'`） */
export function recordVariant(n: number): string {
  return String(clampDiscs(n));
}

/**
 * クリアした回の記録に渡す結果。
 *
 * **ヒントを1回でも使った回と、自動再生を見たあとの1回は、手数と時間を渡さない**
 * （`bestMoves`・`bestTimeMs` を更新せず、`wins` だけ数える）。`RecordEntry` に欄は足さない。
 */
export function clearResult(input: {
  moves: number;
  timeMs: number;
  assisted: boolean;
}): { outcome: 'win'; moves?: number; timeMs?: number } {
  if (input.assisted) return { outcome: 'win' };
  return { outcome: 'win', moves: input.moves, timeMs: input.timeMs };
}

/** 最少手数（2ⁿ−1）で解けたか。記録欄の印は `bestMoves` から毎回これで判定する */
export function isPerfect(n: number, moves: number | undefined): boolean {
  return moves !== undefined && moves === minMoves(n);
}
