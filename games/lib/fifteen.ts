/**
 * 15パズル（スライドパズル）のロジック。純関数のみ。
 *
 * 仕様: docs/features/game-15-puzzle.md
 *
 * ## 盤の表し方
 *
 * 盤は長さ N² の配列で、左上から右へ・上から下へ並べる。`0` が空きマス、
 * 1〜N²−1 が板。完成形は `[1, 2, …, N²−1, 0]`（右下が空き）。
 *
 * ## 手数の数え方
 *
 * 空きと同じ行・列の板を押すと、その板と空きのあいだの板がまとめてすべる。
 * **手数はすべった板の枚数で数える**（1枚ずつ動かしたのと同じ数になる）。
 * この数え方なら、3×3 の最短手数（1枚ずつの幅優先探索の深さ）とそのまま比べられる。
 */

import { dailySeed, mulberry32, type DateKey } from './daily';

/** 選べる盤の大きさ */
export const SIZES = [3, 4, 5] as const;
export type Size = (typeof SIZES)[number];

/** 盤（`0` が空き） */
export type Board = readonly number[];

/** 板が動く向き（キーボード・スワイプ） */
export type Direction = 'up' | 'down' | 'left' | 'right';

export const SIZE_LABELS: Record<Size, string> = {
  3: '3×3（かんたん）',
  4: '4×4（ふつう）',
  5: '5×5（むずかしい）',
};

/** 記録の区分（docs/features/game-records.md の variant） */
export type Variant = '3x3' | '4x4' | '5x5' | 'daily';

export function variantOf(size: Size, daily: boolean): Variant {
  return daily ? 'daily' : (`${size}x${size}` as Variant);
}

/** 今日の1面の大きさ */
export const DAILY_SIZE: Size = 4;

/**
 * 今日の1面の生成手順の版。**配り方を変えたら上げる**
 * （上げないと、同じ日付の盤が端末の版によって食い違う）。
 */
export const DAILY_VERSION = 1;

/** 完成から何手以内の盤を「近すぎる」として配り直すか */
export const NEAR_SOLVED_DEPTH = 5;

export function sizeOfBoard(board: Board): number {
  return Math.round(Math.sqrt(board.length));
}

/** 完成形 */
export function solvedBoard(n: number): number[] {
  return Array.from({ length: n * n }, (_, i) => (i === n * n - 1 ? 0 : i + 1));
}

export function isSolved(board: Board): boolean {
  const last = board.length - 1;
  for (let i = 0; i < last; i++) if (board[i] !== i + 1) return false;
  return board[last] === 0;
}

/** 空きを除いた並びの転倒数 */
export function inversions(board: Board): number {
  const tiles = board.filter((v) => v !== 0);
  let count = 0;
  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) if (tiles[i] > tiles[j]) count++;
  }
  return count;
}

/**
 * 解けるかの判定。
 *
 * - N が奇数：転倒数が偶数なら解ける
 * - N が偶数：転倒数＋空きマスの行（下から数えて1始まり）が奇数なら解ける
 */
export function isSolvable(board: Board): boolean {
  const n = sizeOfBoard(board);
  const inv = inversions(board);
  if (n % 2 === 1) return inv % 2 === 0;
  const blankRowFromBottom = n - Math.floor(board.indexOf(0) / n);
  return (inv + blankRowFromBottom) % 2 === 1;
}

/** 盤を文字列にする（集合・表のキー） */
export function boardKey(board: Board): string {
  return board.join(',');
}

/** 空きに隣り合うマス（＝1枚だけ動かせる板の位置） */
export function neighbors(index: number, n: number): number[] {
  const r = Math.floor(index / n);
  const c = index % n;
  const out: number[] = [];
  if (r > 0) out.push(index - n);
  if (r < n - 1) out.push(index + n);
  if (c > 0) out.push(index - 1);
  if (c < n - 1) out.push(index + 1);
  return out;
}

const nearSolvedCache = new Map<number, Set<string>>();

/**
 * 完成形から深さ `NEAR_SOLVED_DEPTH` までに届く盤の集合（完成形を含む）。
 * 直前の手を戻す枝は除く（戻っても同じ盤が既に入っている）。
 */
export function nearSolvedSet(n: number): Set<string> {
  const cached = nearSolvedCache.get(n);
  if (cached) return cached;
  const set = new Set<string>();
  const walk = (board: number[], blank: number, prevBlank: number, depth: number) => {
    set.add(boardKey(board));
    if (depth === NEAR_SOLVED_DEPTH) return;
    for (const next of neighbors(blank, n)) {
      if (next === prevBlank) continue;
      const b = board.slice();
      b[blank] = b[next];
      b[next] = 0;
      walk(b, next, blank, depth + 1);
    }
  };
  walk(solvedBoard(n), n * n - 1, -1, 0);
  nearSolvedCache.set(n, set);
  return set;
}

/** 完成から `NEAR_SOLVED_DEPTH` 手以内の盤か（完成形も含む） */
export function isNearSolved(board: Board): boolean {
  return nearSolvedSet(sizeOfBoard(board)).has(boardKey(board));
}

/**
 * 盤を配る。**必ず解ける盤だけ**を返す。
 *
 * ランダムな置換を作り、解けなければ空き以外の2枚を入れ替えて直す
 * （ランダムに動かして崩す方式は、手数の少ない盤に偏るので使わない）。
 * 完成形・完成から5手以内の盤は配り直す。
 *
 * 乱数は注入する（`Math.random` を直に呼ばない。今日の1面が端末ごとに変わるため）。
 */
export function deal(n: number, rng: () => number): number[] {
  for (;;) {
    const board = solvedBoard(n);
    for (let i = board.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [board[i], board[j]] = [board[j], board[i]];
    }
    if (!isSolvable(board)) {
      // 空き以外の2枚を入れ替えると転倒数の偶奇が変わる（空きの位置は変わらない）
      const [a, b] = board
        .map((v, i) => (v === 0 ? -1 : i))
        .filter((i) => i >= 0)
        .slice(0, 2);
      [board[a], board[b]] = [board[b], board[a]];
    }
    if (!isNearSolved(board)) return board;
  }
}

/** 今日の1面。同じ日付なら全員が同じ盤（4×4） */
export function dailyBoard(key: DateKey): number[] {
  return deal(DAILY_SIZE, mulberry32(dailySeed(key, DAILY_VERSION)));
}

/**
 * 板を押す。空きと同じ行・列の板なら、その板と空きのあいだの板がまとめてすべる。
 * 動かせなければ `null`。`moved` はすべった板の枚数（＝増える手数）。
 */
export function slide(board: Board, index: number): { board: number[]; moved: number } | null {
  const n = sizeOfBoard(board);
  const blank = board.indexOf(0);
  if (index < 0 || index >= board.length || index === blank) return null;
  const br = Math.floor(blank / n);
  const bc = blank % n;
  const tr = Math.floor(index / n);
  const tc = index % n;
  let step: number;
  if (br === tr) step = tc > bc ? 1 : -1;
  else if (bc === tc) step = tr > br ? n : -n;
  else return null;
  const next = board.slice();
  let hole = blank;
  let moved = 0;
  while (hole !== index) {
    next[hole] = next[hole + step];
    hole += step;
    moved++;
  }
  next[index] = 0;
  return { board: next, moved };
}

/** 板 `index` を向き `dir` に動かすと空きに向かうか（スワイプの判定） */
export function slidesToward(board: Board, index: number, dir: Direction): boolean {
  const n = sizeOfBoard(board);
  const blank = board.indexOf(0);
  if (index === blank) return false;
  const br = Math.floor(blank / n);
  const bc = blank % n;
  const tr = Math.floor(index / n);
  const tc = index % n;
  switch (dir) {
    case 'left':
      return tr === br && bc < tc;
    case 'right':
      return tr === br && bc > tc;
    case 'up':
      return tc === bc && br < tr;
    case 'down':
      return tc === bc && br > tr;
  }
}

/**
 * 向き `dir` に1枚動かすとき、押す板の位置（空きの隣）。無ければ `null`。
 *
 * 既定（`inverted = false`）では `dir` は**板が動く向き**：← で空きの右の板が左へ。
 * `inverted = true` では `dir` は**空きが動く向き**：← で空きの左の板が右へ。
 */
export function tileForDirection(board: Board, dir: Direction, inverted = false): number | null {
  const n = sizeOfBoard(board);
  const blank = board.indexOf(0);
  const r = Math.floor(blank / n);
  const c = blank % n;
  const d = inverted ? OPPOSITE[dir] : dir;
  switch (d) {
    case 'left':
      return c < n - 1 ? blank + 1 : null;
    case 'right':
      return c > 0 ? blank - 1 : null;
    case 'up':
      return r < n - 1 ? blank + n : null;
    case 'down':
      return r > 0 ? blank - n : null;
  }
}

const OPPOSITE: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

/** 矢印キー → 向き。矢印以外は `null` */
export function directionFromKey(key: string): Direction | null {
  switch (key) {
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    case 'ArrowLeft':
      return 'left';
    case 'ArrowRight':
      return 'right';
    default:
      return null;
  }
}

/** 指の動き → 向き。動きが小さければタップとして `null` */
export function directionFromDelta(dx: number, dy: number, threshold = 16): Direction | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

// ---- 遊んでいる状態（手数・もどす・やり直し） ----

export interface PlayState {
  /** 配ったときの盤（やり直しで戻る先） */
  start: number[];
  board: number[];
  moves: number;
  /** もどす用の履歴（無制限） */
  history: { board: number[]; moves: number }[];
}

export function startPlay(board: Board): PlayState {
  return { start: board.slice(), board: board.slice(), moves: 0, history: [] };
}

/** 板を押す。動かせなければ同じ state をそのまま返す（手数も履歴も増えない） */
export function play(state: PlayState, index: number): PlayState {
  if (isSolved(state.board)) return state;
  const result = slide(state.board, index);
  if (result === null) return state;
  return {
    start: state.start,
    board: result.board,
    moves: state.moves + result.moved,
    history: [...state.history, { board: state.board, moves: state.moves }],
  };
}

export function undo(state: PlayState): PlayState {
  const prev = state.history[state.history.length - 1];
  if (!prev) return state;
  return { ...state, board: prev.board, moves: prev.moves, history: state.history.slice(0, -1) };
}

export function restart(state: PlayState): PlayState {
  return startPlay(state.start);
}

// ---- 3×3 の最短手数（完成形からの幅優先探索） ----

const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880];

/** 0〜8 の並び → 0〜9!−1 の番号（レーマー符号） */
function rank9(perm: ArrayLike<number>): number {
  let r = 0;
  for (let i = 0; i < 9; i++) {
    let smaller = 0;
    for (let j = i + 1; j < 9; j++) if (perm[j] < perm[i]) smaller++;
    r += smaller * FACT[8 - i];
  }
  return r;
}

function unrank9(r: number, out: number[]): void {
  const pool = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  for (let i = 0; i < 9; i++) {
    const f = FACT[8 - i];
    const k = Math.floor(r / f);
    r -= k * f;
    out[i] = pool.splice(k, 1)[0];
  }
}

/** 届いていない印 */
const UNREACHED = 255;
let distanceTable: Uint8Array | null = null;

/**
 * 3×3 の全配置の最短手数の表（番号 → 手数。解けない配置は `UNREACHED`）。
 * 初めて呼んだときに一度だけ作る（解ける配置は 181,440 通り）。
 */
export function distances3(): Uint8Array {
  if (distanceTable) return distanceTable;
  const table = new Uint8Array(FACT[9]).fill(UNREACHED);
  const queue = new Int32Array(FACT[9] / 2);
  const start = solvedBoard(3);
  const startRank = rank9(start);
  table[startRank] = 0;
  queue[0] = startRank;
  let head = 0;
  let tail = 1;
  const board: number[] = new Array(9);
  while (head < tail) {
    const r = queue[head++];
    unrank9(r, board);
    const d = table[r];
    const blank = board.indexOf(0);
    for (const next of NEIGHBORS_3[blank]) {
      board[blank] = board[next];
      board[next] = 0;
      const nr = rank9(board);
      if (table[nr] === UNREACHED) {
        table[nr] = d + 1;
        queue[tail++] = nr;
      }
      board[next] = board[blank];
      board[blank] = 0;
    }
  }
  distanceTable = table;
  return table;
}

const NEIGHBORS_3 = Array.from({ length: 9 }, (_, i) => neighbors(i, 3));

/** 3×3 の盤の最短手数。解けない盤は `null` */
export function optimalMoves(board: Board): number | null {
  if (board.length !== 9) return null;
  const d = distances3()[rank9(board)];
  return d === UNREACHED ? null : d;
}

/** 3×3 で最短の次の一手（押す板の位置）。完成・解けない盤は `null` */
export function optimalHint(board: Board): number | null {
  const d = optimalMoves(board);
  if (d === null || d === 0) return null;
  const blank = board.indexOf(0);
  for (const next of NEIGHBORS_3[blank]) {
    const b = board.slice();
    b[blank] = b[next];
    b[next] = 0;
    if (optimalMoves(b) === d - 1) return next;
  }
  return null;
}

// ---- 4×4・5×5 のヒント（人の解き方。最短とは限らない） ----

/**
 * 揃える順番。上の段 → 左の列 → … と外側から片づけ、右下の3×3が残ったら
 * 最短の表で仕上げる。**各段・各列の最後の2枚は2枚まとめて**入れる
 * （1枚ずつだと最後の1枚が入らない形がある）。
 *
 * 1つの組は「位置の並び」。組の位置にすべて正しい板が来たら次の組へ進む。
 */
function solveGroups(n: number): number[][] {
  const groups: number[][] = [];
  for (let k = 0; k < n - 3; k++) {
    // 段 k の残り（列 k〜n−1）
    for (let c = k; c < n - 2; c++) groups.push([k * n + c]);
    groups.push([k * n + n - 2, k * n + n - 1]);
    // 列 k の残り（段 k+1〜n−1）
    for (let r = k + 1; r < n - 2; r++) groups.push([r * n + k]);
    groups.push([(n - 2) * n + k, (n - 1) * n + k]);
  }
  return groups;
}

/**
 * 組 `targets` の板を正しい位置へ運ぶ最初の1手を、幅優先探索で求める。
 * 動かしてよいのは `locked` 以外のマスだけ。状態は（運ぶ板の位置…, 空きの位置）。
 */
function placeStep(board: Board, n: number, targets: number[], locked: Set<number>): number | null {
  const want = targets.map((t) => t + 1);
  const start = [...want.map((v) => board.indexOf(v)), board.indexOf(0)];
  const k = targets.length;
  const key = (s: number[]) => s.join(',');
  const done = (s: number[]) => targets.every((t, i) => s[i] === t);
  if (done(start)) return null;
  // 最初の1手（空きの行き先）を状態ごとに覚えておく
  const first = new Map<string, number>([[key(start), -1]]);
  let frontier: number[][] = [start];
  while (frontier.length > 0) {
    const next: number[][] = [];
    for (const s of frontier) {
      const blank = s[k];
      const origin = first.get(key(s))!;
      for (const to of neighbors(blank, n)) {
        if (locked.has(to)) continue;
        const t = s.slice();
        for (let i = 0; i < k; i++) if (t[i] === to) t[i] = blank;
        t[k] = to;
        const tk = key(t);
        if (first.has(tk)) continue;
        const firstMove = origin === -1 ? to : origin;
        if (done(t)) return firstMove;
        first.set(tk, firstMove);
        next.push(t);
      }
    }
    frontier = next;
  }
  return null;
}

/**
 * 人の解き方に沿った次の一手（押す板の位置）。**最短とは限らない。**
 *
 * 上の段から順に揃え、右下の3×3が残ったら最短の表で仕上げる。
 * 各段階は幅優先探索の最短で進むので、ヒントをたどれば毎手その段階の残りが1つ減り、
 * 必ず完成にたどり着く。3×3 の盤では最短の一手を返す。
 */
export function hint(board: Board): number | null {
  const n = sizeOfBoard(board);
  if (isSolved(board) || !isSolvable(board)) return null;
  if (n === 3) return optimalHint(board);
  const locked = new Set<number>();
  for (const group of solveGroups(n)) {
    const placed = group.every((t) => board[t] === t + 1);
    if (!placed) return placeStep(board, n, group, locked);
    for (const t of group) locked.add(t);
  }
  // 右下の3×3だけが残っている。3×3の盤に写して最短の表を引く
  const cells: number[] = [];
  for (let r = n - 3; r < n; r++) for (let c = n - 3; c < n; c++) cells.push(r * n + c);
  const sub = cells.map((cell) => {
    const v = board[cell];
    return v === 0 ? 0 : cells.indexOf(v - 1) + 1;
  });
  const step = optimalHint(sub);
  return step === null ? null : cells[step];
}

// ---- 共有テキスト ----

/** 今日の1面の結果。**盤そのものは載せない**（手数と時間だけ） */
export function shareText(params: {
  dateKey: DateKey;
  moves: number;
  timeMs: number;
  streak?: number;
  url: string;
}): string {
  const { dateKey, moves, timeMs, streak, url } = params;
  const lines = [`15パズル ${dateKey} の1面（4×4）`, `${moves}手 ${formatDuration(timeMs)}`];
  if (streak && streak > 1) lines.push(`連続 ${streak}日`);
  lines.push(url);
  return lines.join('\n');
}

/** `2:41` 形式。`lib/records.ts` の `formatTime` と同じ書き方 */
function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}
