/**
 * 数字けしのロジック
 *
 * 仕様: docs/features/game-suji-keshi.md
 *
 * ## ルール
 *
 * - 盤は横 `cols` 列（ふつうは 6）。数字は 1〜9 で、初期は `INITIAL_COUNT` 個
 * - 2 つのマスを選び、**同じ数**か**足して 10** なら消える（消えたマスは枠だけ残る）
 * - 消せる位置は 2 通り。どちらも**間に消えたマスしか無ければ、離れていてもよい**
 *   1. 縦・横・斜めに並ぶ
 *   2. 読む順（左上から右へ、行の終わりの次は次の行の始め）で前後になる
 * - 1 行がすべて消えたら、その行は詰めて消える
 * - 「書き足す」：残っている数字を読む順のまま盤の後ろに書き足す（1 面に `APPENDS` 回まで）
 * - 盤が空になればクリア。消せる組が無く、書き足しも残っていなければ負け
 *
 * ## 生成
 *
 * 種から数字を並べ、初手の組の数が `MIN_INITIAL_PAIRS`〜`MAX_INITIAL_PAIRS` のものだけ採り、
 * **`solve` で書き足し `APPENDS` 回以内にクリアできると確かめてから出す**。
 * 打ち切りは**探索したノードの数と試行回数**で決め、壁時計の時間では決めない
 * （時間で打ち切ると端末の速さで今日の 1 面が変わってしまう）。
 *
 * ## 乱数
 *
 * 乱数はすべて引数で受け取る（`lib/daily.ts` の `mulberry32`）。
 * このファイルから `Math.random()` を呼ばないこと。
 */

import { dailySeed, localDateKey, mulberry32, type DateKey } from './daily';

/** 乱数。`[0, 1)` を返す */
export type Rng = () => number;

/** マスの添字（読む順。`row * cols + col`） */
export type Cell = number;

/** 盤面。`cells[i]` が null なら消えたマス */
export interface Board {
  cols: number;
  cells: readonly (number | null)[];
  /** 残りの書き足し回数 */
  appendsLeft: number;
}

/** 遊びかた。`daily` は今日の 1 面（6 列固定） */
export type Mode = 'daily' | '6col' | '9col';

export const MODE_ORDER: readonly Mode[] = ['daily', '6col', '9col'];

export const MODE_LABEL: Record<Mode, string> = {
  daily: '今日の1面',
  '6col': '6列',
  '9col': '9列',
};

/** 列数。今日の 1 面は全員同じ盤にするので 6 列に固定 */
export function colsOf(mode: Mode): number {
  return mode === '9col' ? 9 : 6;
}

/** 記録の区分（`lib/records.ts` の variant）。列数が変わると消せる組が変わるので分ける */
export function variantOf(mode: Mode): string {
  return mode;
}

/** 初期の数字の数（6 列 × 5 行） */
export const INITIAL_COUNT = 30;

/** 1 面に書き足せる回数 */
export const APPENDS = 4;

/** 初手で消せる組の数の範囲（両端を含む。難しさの調整点） */
export const MIN_INITIAL_PAIRS = 3;
export const MAX_INITIAL_PAIRS = 8;

/**
 * `solve` が探索するノード数の既定の上限（時間ではなく数で打ち切る）。
 * 仕様書の起票時の値は 200,000。実測（日付 2,000 日ぶんの今日の 1 面）で、200,000 だと
 * 解けない盤に当たった試行 1 回で 200ms を超える日があったので 50,000 に詰めた
 * （50,000 で全日が 1〜2 回目の試行で通り、固定の盤に落ちた日は無かった）
 */
export const SOLVE_NODE_LIMIT = 50_000;

/** 解けると確かめられるまで作り直す回数の上限 */
export const GENERATE_MAX_TRIES = 50;

/** 1 回の試行で、初手の組の数が範囲に入る並びを引き直す回数の上限 */
const LAYOUT_MAX_DRAWS = 200;

/** ヒント 1 回でタイムに足す時間（ms）。表示のタイマーと記録を同じ値にする */
export const HINT_PENALTY_MS = 15_000;

/**
 * 生成の手順の版。
 *
 * **生成の手順（並べ方・初手の組の範囲・`SOLVE_NODE_LIMIT`・`GENERATE_MAX_TRIES`）を変えたら上げる。**
 * 上げないと、同じ日付なのに今日の 1 面が黙って別の盤になる。
 */
export const VERSION = 1;

/**
 * 検査済みの固定の盤（6 列）。生成が試行回数を使い切って 1 枚も検査を通らなかったときだけ出す。
 * `solve` で書き足し `APPENDS` 回以内にクリアできることはテストが確かめる
 */
export const FALLBACK_BOARD: Board = {
  cols: 6,
  // 1 行目から読む順に。どの行も同じ数か足して 10 の組を含み、書き足し無しでも消し切れる
  cells: [
    1, 9, 2, 8, 3, 7,
    4, 6, 5, 5, 6, 4,
    7, 3, 8, 2, 9, 1,
    2, 2, 3, 3, 4, 4,
    6, 6, 7, 7, 8, 8,
  ],
  appendsLeft: APPENDS,
};

/** 2 つの数が組になるか（同じ数か、足して 10） */
export function isMatch(x: number, y: number): boolean {
  return x === y || x + y === 10;
}

/** 新しい盤（書き足しは `APPENDS` 回） */
export function makeBoard(cols: number, values: readonly number[], appendsLeft = APPENDS): Board {
  return { cols, cells: values.slice(), appendsLeft };
}

export function remaining(board: Board): number {
  let n = 0;
  for (const v of board.cells) if (v !== null) n++;
  return n;
}

export function isCleared(board: Board): boolean {
  return remaining(board) === 0;
}

export function rowCount(board: Board): number {
  return Math.ceil(board.cells.length / board.cols);
}

/** 縦・斜め（下・右下・左下）の向き。横は読む順に含まれるので要らない */
const LINES: readonly (readonly [number, number])[] = [
  [1, 0],
  [1, 1],
  [1, -1],
];

/**
 * `a` から先（読む順で後ろ）にある、`a` と位置の条件を満たすマス。
 * 読む順で次に残っているマス 1 つと、縦・斜め 3 方向でそれぞれ最初に残っているマス。
 * 重なりは除く
 */
function forwardNeighbors(board: Board, a: Cell): Cell[] {
  const { cols, cells } = board;
  const out: Cell[] = [];
  for (let i = a + 1; i < cells.length; i++) {
    if (cells[i] !== null) {
      out.push(i);
      break;
    }
  }
  const r0 = Math.floor(a / cols);
  const c0 = a % cols;
  for (const [dr, dc] of LINES) {
    let r = r0 + dr;
    let c = c0 + dc;
    while (c >= 0 && c < cols) {
      const i = r * cols + c;
      if (i >= cells.length) break;
      if (cells[i] !== null) {
        if (!out.includes(i)) out.push(i);
        break;
      }
      r += dr;
      c += dc;
    }
  }
  return out;
}

/** `a` と `b` が位置の条件を満たすか（数は見ない）。どちらかが消えたマスなら false */
export function isLinked(board: Board, a: Cell, b: Cell): boolean {
  if (a === b) return false;
  const [x, y] = a < b ? [a, b] : [b, a];
  if (board.cells[x] == null || board.cells[y] == null) return false;
  return forwardNeighbors(board, x).includes(y);
}

/** `a` と `b` を消せるか（位置の条件と、同じ数か足して 10） */
export function canPair(board: Board, a: Cell, b: Cell): boolean {
  if (!isLinked(board, a, b)) return false;
  return isMatch(board.cells[a] as number, board.cells[b] as number);
}

/** いま消せる組の一覧。`[小さい添字, 大きい添字]` を、小さい添字の順に */
export function legalPairs(board: Board): [Cell, Cell][] {
  const out: [Cell, Cell][] = [];
  const { cells } = board;
  for (let a = 0; a < cells.length; a++) {
    const va = cells[a];
    if (va === null) continue;
    for (const b of forwardNeighbors(board, a)) {
      if (isMatch(va, cells[b] as number)) out.push([a, b]);
    }
  }
  return out;
}

/** `a` と組める位置（1 つ目を選んだときに薄く示す先） */
export function partnersOf(board: Board, a: Cell): Cell[] {
  const out: Cell[] = [];
  for (let b = 0; b < board.cells.length; b++) if (b !== a && canPair(board, a, b)) out.push(b);
  return out;
}

/** すべて消えた行を詰める（最後の途中までの行も、残りが無ければ消える） */
export function collapseRows(board: Board): Board {
  const { cols, cells } = board;
  const out: (number | null)[] = [];
  let changed = false;
  for (let start = 0; start < cells.length; start += cols) {
    const row = cells.slice(start, start + cols);
    if (row.every((v) => v === null)) {
      changed = true;
      continue;
    }
    out.push(...row);
  }
  return changed ? { ...board, cells: out } : board;
}

/**
 * `a` と `b` を消し、空になった行を詰めた盤。消せない組なら null（元の盤は変えない）。
 * 行を詰めると添字がずれるので、画面は消したあとの盤から描き直す
 */
export function removePair(board: Board, a: Cell, b: Cell): Board | null {
  if (!canPair(board, a, b)) return null;
  const cells = board.cells.slice();
  cells[a] = null;
  cells[b] = null;
  return collapseRows({ ...board, cells });
}

/**
 * 残っている数字を読む順のまま盤の後ろに書き足し、回数を 1 減らす。
 * 回数が 0、または盤が空なら何もしない（同じ盤を返す）
 */
export function append(board: Board): Board {
  if (board.appendsLeft <= 0 || isCleared(board)) return board;
  const rest = board.cells.filter((v): v is number => v !== null);
  return { ...board, cells: [...board.cells, ...rest], appendsLeft: board.appendsLeft - 1 };
}

/** 消せる組が無く、書き足しも残っていない（盤は空でない） */
export function isStuck(board: Board): boolean {
  return !isCleared(board) && board.appendsLeft <= 0 && legalPairs(board).length === 0;
}

/** 組ごとの数の偶奇（1・9 / 2・8 / 3・7 / 4・6 / 5）。1 組消すと同じ組から 2 つ減る */
const GROUP: readonly number[] = [0, 1, 2, 3, 4, 5, 4, 3, 2, 1];

/** 書き足しが残っていないのに、どれかの組の数が奇数（もう空にできない） */
function oddGroupLeft(board: Board): boolean {
  if (board.appendsLeft > 0) return false;
  let parity = 0;
  for (const v of board.cells) if (v !== null) parity ^= 1 << GROUP[v];
  return parity !== 0;
}

/** 盤面のハッシュ（枝刈り用） */
function keyOf(board: Board): string {
  let s = String(board.appendsLeft);
  for (const v of board.cells) s += v === null ? '0' : String(v);
  return s;
}

/** 1 手。組を消すか、書き足すか */
export type Move = { type: 'pair'; a: Cell; b: Cell } | { type: 'append' };

export interface SolveResult {
  /** 書き足し `appendsLeft` 回以内にクリアできると確かめたか */
  solved: boolean;
  /** 探索したノードの数（`limit` を超えない） */
  nodes: number;
  /** 見つけた手順（解けなければ空） */
  moves: Move[];
  /** 見つけた手順で書き足した回数 */
  appendsUsed: number;
}

/**
 * 深さ優先で解く。盤面のハッシュで同じ局面を二度調べない。
 *
 * - 子は「組を消す」（小さい添字の順）を先に、「書き足す」を最後に試す
 * - 書き足しが残っていないのに、どれかの組（1・9 など）の数が奇数なら枝を切る
 * - **探索したノードの数が `limit` に達したら打ち切る**（時間は見ない。決定論のため）
 */
export function solve(board: Board, limit: number = SOLVE_NODE_LIMIT): SolveResult {
  const seen = new Set<string>();
  const path: Move[] = [];
  let nodes = 0;
  let aborted = false;

  const dfs = (b: Board): boolean => {
    if (isCleared(b)) return true;
    if (nodes >= limit) {
      aborted = true;
      return false;
    }
    nodes++;
    if (oddGroupLeft(b)) return false;
    const key = keyOf(b);
    if (seen.has(key)) return false;
    seen.add(key);
    for (const [a, c] of legalPairs(b)) {
      const next = removePair(b, a, c) as Board;
      path.push({ type: 'pair', a, b: c });
      if (dfs(next)) return true;
      path.pop();
      if (aborted) return false;
    }
    if (b.appendsLeft > 0) {
      path.push({ type: 'append' });
      if (dfs(append(b))) return true;
      path.pop();
    }
    return false;
  };

  const solved = dfs(board);
  return {
    solved,
    nodes,
    moves: solved ? path.slice() : [],
    appendsUsed: solved ? path.filter((m) => m.type === 'append').length : 0,
  };
}

/**
 * 数字を 1 つずつ並べる。各マスで「後ろ向きの隣（読む順の前・上・左上・右上）と組になる数」を
 * 引くかどうかを乱数で決める（そのままの一様乱数だと初手の組が 20 前後になり、すぐ消し切れてしまう）
 */
function layout(cols: number, count: number, rng: Rng): number[] {
  const values: number[] = [];
  // 1 マスあたり組になる数を引く確率。初手の組がおよそ範囲の中ほど（5〜6 組）になる値
  const pairChance = 0.18;
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const back: number[] = [];
    if (i > 0) back.push(values[i - 1]);
    for (const dc of [0, -1, 1]) {
      const cc = c + dc;
      if (r > 0 && cc >= 0 && cc < cols) back.push(values[(r - 1) * cols + cc]);
    }
    const pairing: number[] = [];
    const other: number[] = [];
    for (let v = 1; v <= 9; v++) (back.some((x) => isMatch(v, x)) ? pairing : other).push(v);
    const pool = other.length === 0 || (pairing.length > 0 && rng() < pairChance) ? pairing : other;
    values.push(pool[Math.floor(rng() * pool.length)]);
  }
  return values;
}

/** 初手の組の数が範囲に入る盤を 1 枚引く（`LAYOUT_MAX_DRAWS` 回で入らなければ最後の盤） */
function drawBoard(cols: number, rng: Rng): Board {
  let board = makeBoard(cols, layout(cols, INITIAL_COUNT, rng));
  for (let i = 1; i < LAYOUT_MAX_DRAWS; i++) {
    const n = legalPairs(board).length;
    if (n >= MIN_INITIAL_PAIRS && n <= MAX_INITIAL_PAIRS) break;
    board = makeBoard(cols, layout(cols, INITIAL_COUNT, rng));
  }
  return board;
}

export interface Generated {
  board: Board;
  /** 何回目の試行で採ったか（1 始まり。固定の盤なら 0） */
  tries: number;
  /** `solve` で確かめた結果（固定の盤なら、その盤を解いた結果） */
  check: SolveResult;
  /** 固定の盤（`FALLBACK_BOARD`）を出したか */
  fallback: boolean;
}

/**
 * 解けると確かめられるまで作り直す。`GENERATE_MAX_TRIES` 回で 1 枚も通らなければ `FALLBACK_BOARD`
 * （6 列）を出す。9 列で使い切ったときも固定の盤は 6 列なので、列数は固定の盤に従う。
 * 同じ乱数の列なら必ず同じ盤（決定論）
 */
export function generate(cols: number, rng: Rng, limit: number = SOLVE_NODE_LIMIT): Generated {
  for (let tries = 1; tries <= GENERATE_MAX_TRIES; tries++) {
    const board = drawBoard(cols, rng);
    const check = solve(board, limit);
    if (check.solved) return { board, tries, check, fallback: false };
  }
  return { board: FALLBACK_BOARD, tries: 0, check: solve(FALLBACK_BOARD, limit), fallback: true };
}

/** 今日の 1 面（6 列）。同じ日付・同じ `VERSION` なら必ず同じ盤 */
export function dailyBoard(key: DateKey = localDateKey()): Board {
  return generate(6, mulberry32(dailySeed(key, VERSION))).board;
}

/** ヒントで光らせる組（いま消せるうちの 1 組）。無ければ null（書き足すしかない） */
export function hintPair(board: Board, rng: Rng): [Cell, Cell] | null {
  const pairs = legalPairs(board);
  return pairs.length === 0 ? null : pairs[Math.floor(rng() * pairs.length)];
}

/** ヒントのペナルティを足したタイム（表示と記録の両方に使う） */
export function totalTimeMs(elapsedMs: number, hints: number): number {
  return elapsedMs + hints * HINT_PENALTY_MS;
}

/** マスの読み上げ。「3行4列、7」。消えたマスは「消えたマス」 */
export function cellLabel(board: Board, cell: Cell): string {
  const r = Math.floor(cell / board.cols) + 1;
  const c = (cell % board.cols) + 1;
  const v = board.cells[cell];
  return `${r}行${c}列、${v == null ? '消えたマス' : v}`;
}

/** キーボードのカーソル移動（盤の端と最後のマスで止まる） */
export function moveCursor(board: Board, cell: Cell, key: 'up' | 'down' | 'left' | 'right'): Cell {
  const { cols } = board;
  const last = board.cells.length - 1;
  if (last < 0) return 0;
  const c = cell % cols;
  let next = cell;
  if (key === 'left' && c > 0) next = cell - 1;
  if (key === 'right' && c < cols - 1) next = cell + 1;
  if (key === 'up' && cell - cols >= 0) next = cell - cols;
  if (key === 'down' && cell + cols <= last) next = cell + cols;
  return Math.min(next, last);
}

/**
 * 共有の文面。「数字けし 10/09 クリア・書き足し 2 回・3:12」。**盤面は入れない**（ネタバレになる）
 */
export function shareText(params: {
  mode: Mode;
  appendsUsed: number;
  timeMs: number;
  dateKey?: DateKey;
  url: string;
}): string {
  const { mode, appendsUsed, timeMs, dateKey, url } = params;
  const label =
    mode === 'daily' && dateKey ? `${dateKey.slice(5, 7)}/${dateKey.slice(8, 10)}` : MODE_LABEL[mode];
  return `数字けし ${label} クリア・書き足し ${appendsUsed} 回・${formatDuration(timeMs)}\n${url}`;
}

/** `3:12` 形式。`lib/records.ts` の `formatTime` と同じ書き方 */
function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/** 9 列を選べる幅（px）。押す先 44px ＋ 隙間で 9 列が収まるとき（`.sjk-board` の隙間 3px と同じ） */
export const NINE_COLS_MIN_WIDTH = 9 * 44 + 8 * 3;

/** 盤の枠の幅から、9 列を選べるか（面を始めるときに判定する。遊んでいる途中では変えない） */
export function canUseNineCols(boardWidth: number): boolean {
  return boardWidth >= NINE_COLS_MIN_WIDTH;
}

/**
 * 今日の 1 面を遊んだ日のキー。`records.ts` は勝ちの日しか持たないので、
 * 「今日の 1 回目か」はページ側でこのキーに今日の日付を 1 つだけ置いて判定する（矢印ぬきと同じ作法）
 */
export const DAILY_PLAYED_KEY = 'suji-keshi:daily-played';

/** `localStorage` のうち、ここで使う部分だけ（`lib/records.ts` の `browserStorage()` を渡す。テストでは差し替える） */
export interface PlayedStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 今日の 1 面が 1 回目か。保存値が今日なら 2 回目以降。読めない値は 1 回目として扱う */
export function isFirstDailyPlay(stored: string | null, today: DateKey): boolean {
  return stored !== today;
}

/** 保存されている「遊んだ日」。読めなければ null（＝1 回目として扱う） */
export function readDailyPlayed(storage: PlayedStorage | null): string | null {
  try {
    return storage?.getItem(DAILY_PLAYED_KEY) ?? null;
  } catch {
    return null;
  }
}

/** 今日を「遊んだ日」にする。書けなくても遊べる（次も 1 回目として扱われるだけ） */
export function writeDailyPlayed(storage: PlayedStorage | null, today: DateKey): void {
  try {
    storage?.setItem(DAILY_PLAYED_KEY, today);
  } catch {
    // 何もしない
  }
}
