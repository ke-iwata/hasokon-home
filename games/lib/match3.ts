/**
 * マッチ3パズル（隣と入れ替えて同じ形を3つそろえて消す）のロジック
 *
 * 仕様: docs/features/game-match3.md
 *
 * ## 盤の持ち方
 *
 * 8×8 の64マスを1次元の配列で持つ（添字 = 行 × 8 + 列。行0が上端）。
 * 値はピースの種類 0〜5。**どの段でも64マスがすべて埋まっている**
 * （消えたマスは同じ段のうちに落下と補充で埋め戻すので、空きは外に出ない）。
 *
 * ## 乱数は受け取る
 *
 * 「今日の1盤面」は `mulberry32(日付シード)` を渡し、**初期盤面・補充・シャッフルを
 * すべて同じ乱数列から取る**。同じ日に同じ手順を踏めば同じ盤面になる
 * （補充は入れ替えの手順しだいで変わるので、「全員同じ条件」なのは最初の盤面と乱数列まで）。
 * **補充は乱数を消費する順番を決めてある**：列ごと左から、各列は下から。
 *
 * ## 画面との分担
 *
 * `resolve` は消滅 → 落下 → 補充 → 再判定を、並ぶものが無くなるまで繰り返し、
 * **段ごとの結果を配列で返す**。`Game.tsx` はそれを1段ずつ間を置いて描く
 * （games/CLAUDE.md「途中の状態を見せたいなら局面を分ける」）。
 * 消える光り方などの演出はここに持たない（`Game.tsx` の ref に置く）。
 */

import { dailySeed, mulberry32, type DateKey } from './daily';

/** 乱数。`[0, 1)` を返す */
export type Rng = () => number;

/** 盤の一辺 */
export const SIZE = 8;
/** マスの数 */
export const CELLS = SIZE * SIZE;
/** ピースの種類の数（6種・8×8固定。難易度のパラメータは持たない） */
export const KINDS = 6;
/** 今日の1盤面の手数 */
export const DAILY_MOVES = 30;

/** 盤面。長さ64、値は 0〜5 */
export type Board = number[];

export type Mode = 'daily' | 'endless';

/**
 * 日替わりの生成手順の版。
 *
 * **生成・補充・シャッフルの手順を変えたら上げる。** 上げないと、同じ日の盤面が
 * 黙って変わり、変わる前の「今日のベスト」と比べてしまう。
 * 記録の区分（`DAILY_VARIANT`）も版つきにして、旧版のベストを引き継がない（星置きと同じ形）。
 */
export const DAILY_GENERATOR_VERSION = 1;

/** 記録の区分（`lib/records.ts` の variant） */
export const DAILY_VARIANT = `daily-v${DAILY_GENERATOR_VERSION}`;
export const ENDLESS_VARIANT = 'endless';

export function variantOf(mode: Mode): string {
  return mode === 'daily' ? DAILY_VARIANT : ENDLESS_VARIANT;
}

/** その日の乱数列。初期盤面・補充・シャッフルはすべてここから取る */
export function dailyRng(key: DateKey): Rng {
  return mulberry32(dailySeed(key, DAILY_GENERATOR_VERSION));
}

// ---- 盤の形 ----

export function rowOf(cell: number): number {
  return Math.floor(cell / SIZE);
}

export function colOf(cell: number): number {
  return cell % SIZE;
}

/** 上下左右に隣り合っているか */
export function isAdjacent(a: number, b: number): boolean {
  if (a < 0 || b < 0 || a >= CELLS || b >= CELLS) return false;
  const dr = Math.abs(rowOf(a) - rowOf(b));
  const dc = Math.abs(colOf(a) - colOf(b));
  return dr + dc === 1;
}

function pick(rng: Rng, n: number): number {
  // rng が 1 を返しても範囲を外れないように丸める
  return Math.min(n - 1, Math.floor(rng() * n));
}

// ---- 生成 ----

/** 生成・シャッフルのやり直しの上限（まず届かない。届いたら作り直しに切り替える） */
const MAX_TRIES = 100;

/**
 * 3つ並んでいる箇所の無い盤を1枚作る（手があるかは見ない）。
 *
 * **下の行から、各行は左から**置く。置くたびに左2つ・下2つを見て、
 * そこと3つ並ぶ種類を候補から外す（外すのは最大2種なので、候補は必ず残る）。
 */
function fillWithoutMatches(rng: Rng): Board {
  const board: Board = new Array(CELLS).fill(0);
  for (let r = SIZE - 1; r >= 0; r--) {
    for (let c = 0; c < SIZE; c++) {
      const banned = new Set<number>();
      if (c >= 2 && board[r * SIZE + c - 1] === board[r * SIZE + c - 2]) {
        banned.add(board[r * SIZE + c - 1]);
      }
      if (r <= SIZE - 3 && board[(r + 1) * SIZE + c] === board[(r + 2) * SIZE + c]) {
        banned.add(board[(r + 1) * SIZE + c]);
      }
      const candidates: number[] = [];
      for (let k = 0; k < KINDS; k++) if (!banned.has(k)) candidates.push(k);
      board[r * SIZE + c] = candidates[pick(rng, candidates.length)];
    }
  }
  return board;
}

/**
 * 最初の盤面。**3つ並んでいる箇所が無く、入れ替えられる手が1つ以上ある。**
 * 手が無ければ作り直す（上限つき。6種・8×8 で届くことはまず無い）。
 */
export function createBoard(rng: Rng): Board {
  let board = fillWithoutMatches(rng);
  for (let i = 1; i < MAX_TRIES && !hasAnyMove(board); i++) board = fillWithoutMatches(rng);
  return board;
}

// ---- 判定 ----

/** そろった1かたまり。十字・L字は縦と横を結合して1つにする */
export interface MatchGroup {
  kind: number;
  /** 添字の昇順 */
  cells: number[];
}

/**
 * 縦横の3連以上をすべて返す。
 *
 * 同じマスを共有する並び（十字・L字・T字）は結合して1グループ。
 * 得点は個数で決まるので、結合しないと十字が「3つ×2」に割れて点が変わる。
 * 共有しない並びは、同じ種類でも別のグループ（同時2か所）。
 */
export function findMatches(board: Board): MatchGroup[] {
  const runs: number[][] = [];
  // 横
  for (let r = 0; r < SIZE; r++) {
    let start = 0;
    for (let c = 1; c <= SIZE; c++) {
      if (c < SIZE && board[r * SIZE + c] === board[r * SIZE + start]) continue;
      if (c - start >= 3) {
        const run: number[] = [];
        for (let x = start; x < c; x++) run.push(r * SIZE + x);
        runs.push(run);
      }
      start = c;
    }
  }
  // 縦
  for (let c = 0; c < SIZE; c++) {
    let start = 0;
    for (let r = 1; r <= SIZE; r++) {
      if (r < SIZE && board[r * SIZE + c] === board[start * SIZE + c]) continue;
      if (r - start >= 3) {
        const run: number[] = [];
        for (let y = start; y < r; y++) run.push(y * SIZE + c);
        runs.push(run);
      }
      start = r;
    }
  }
  if (runs.length === 0) return [];

  // マスを共有する並びを結合する（union-find）
  const parent = runs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owner = new Map<number, number>();
  runs.forEach((run, i) => {
    for (const cell of run) {
      const other = owner.get(cell);
      if (other === undefined) owner.set(cell, i);
      else parent[find(i)] = find(other);
    }
  });
  const merged = new Map<number, Set<number>>();
  runs.forEach((run, i) => {
    const root = find(i);
    const set = merged.get(root) ?? new Set<number>();
    for (const cell of run) set.add(cell);
    merged.set(root, set);
  });
  return [...merged.values()]
    .map((set) => {
      const cells = [...set].sort((a, b) => a - b);
      return { kind: board[cells[0]], cells };
    })
    .sort((a, b) => a.cells[0] - b.cells[0]);
}

/** 2マスを入れ替えた盤（元の盤は変えない） */
export function swap(board: Board, a: number, b: number): Board {
  const next = board.slice();
  next[a] = board[b];
  next[b] = board[a];
  return next;
}

/** `cell` を通る縦か横に、同じ種類が3つ以上並んでいるか */
function linedUpAt(board: Board, cell: number): boolean {
  const kind = board[cell];
  const r = rowOf(cell);
  const c = colOf(cell);
  let h = 1;
  for (let x = c - 1; x >= 0 && board[r * SIZE + x] === kind; x--) h++;
  for (let x = c + 1; x < SIZE && board[r * SIZE + x] === kind; x++) h++;
  if (h >= 3) return true;
  let v = 1;
  for (let y = r - 1; y >= 0 && board[y * SIZE + c] === kind; y--) v++;
  for (let y = r + 1; y < SIZE && board[y * SIZE + c] === kind; y++) v++;
  return v >= 3;
}

/**
 * 入れ替えると3つ以上そろう手か。
 * そろっていない盤から1回入れ替えて新しくそろうのは、動かした2マスを通る並びだけなので、
 * その2マスだけを見る（`hasAnyMove` が112通りを試すので、盤全体を見ると重い）
 */
export function isValidMove(board: Board, a: number, b: number): boolean {
  if (!isAdjacent(a, b) || board[a] === board[b]) return false;
  const next = swap(board, a, b);
  return linedUpAt(next, a) || linedUpAt(next, b);
}

/** 入れ替えられる手を1つでも持つか（手が無ければ作り直す判定に使う） */
export function hasAnyMove(board: Board): boolean {
  for (let cell = 0; cell < CELLS; cell++) {
    if (colOf(cell) < SIZE - 1 && isValidMove(board, cell, cell + 1)) return true;
    if (rowOf(cell) < SIZE - 1 && isValidMove(board, cell, cell + SIZE)) return true;
  }
  return false;
}

// ---- 得点 ----

/** 1グループの基本点（3つ 30・4つ 60・5つ以上 100） */
export function groupPoints(size: number): number {
  if (size >= 5) return 100;
  if (size === 4) return 60;
  if (size === 3) return 30;
  return 0;
}

/** 連鎖の倍率。1段目が1倍で、1連鎖ごとに +0.5 */
export function chainMultiplier(chain: number): number {
  return 1 + 0.5 * (Math.max(1, chain) - 1);
}

// ---- 消滅・落下・補充 ----

/** `resolve` の1段ぶん */
export interface Step {
  /** 何段目か（1から） */
  chain: number;
  /** この段でそろったグループ */
  groups: MatchGroup[];
  /** 消えたマス（昇順） */
  cleared: number[];
  /** この段の得点（倍率込み） */
  points: number;
  /** 落下と補充のあとの盤 */
  board: Board;
}

/**
 * 消えたマスを詰め、空いた上端を補充する。
 *
 * **落下**：各列で、残ったピースが順番を保ったまま下へ詰まる。
 * **補充**：列ごとに左から、各列は空いたマスのうち**下から**乱数を消費する。
 * 補充では3つ並ぶのを避けない（避けると連鎖が起きない）。
 */
export function collapse(board: Board, cleared: ReadonlySet<number>, rng: Rng): Board {
  const next: Board = new Array(CELLS).fill(0);
  for (let c = 0; c < SIZE; c++) {
    let write = SIZE - 1;
    for (let r = SIZE - 1; r >= 0; r--) {
      const cell = r * SIZE + c;
      if (cleared.has(cell)) continue;
      next[write * SIZE + c] = board[cell];
      write--;
    }
    for (let r = write; r >= 0; r--) next[r * SIZE + c] = pick(rng, KINDS);
  }
  return next;
}

/**
 * そろったものを消し、落とし、補充し、また判定する——を並ぶものが無くなるまで。
 * 段ごとの結果を返す（そろっていなければ空の配列）。
 */
export function resolve(board: Board, rng: Rng): Step[] {
  const steps: Step[] = [];
  let current = board;
  for (let chain = 1; ; chain++) {
    const groups = findMatches(current);
    if (groups.length === 0) break;
    const cleared = new Set<number>();
    let base = 0;
    for (const g of groups) {
      base += groupPoints(g.cells.length);
      for (const cell of g.cells) cleared.add(cell);
    }
    current = collapse(current, cleared, rng);
    steps.push({
      chain,
      groups,
      cleared: [...cleared].sort((a, b) => a - b),
      points: Math.round(base * chainMultiplier(chain)),
      board: current,
    });
  }
  return steps;
}

// ---- シャッフル ----

/**
 * 種類の分布を保ったまま並べ替える。
 * `createBoard` と同じ2条件（3つ並ばない・手が1つ以上ある）を満たすまで繰り返す。
 *
 * 分布しだいでは満たせないこともありうるので、上限に届いたら
 * `createBoard` で作り直す（分布は変わるが、遊べない盤を出すよりよい）。
 */
export function shuffle(board: Board, rng: Rng): Board {
  for (let i = 0; i < MAX_TRIES; i++) {
    const next = board.slice();
    for (let j = next.length - 1; j > 0; j--) {
      const k = pick(rng, j + 1);
      [next[j], next[k]] = [next[k], next[j]];
    }
    if (findMatches(next).length === 0 && hasAnyMove(next)) return next;
  }
  return createBoard(rng);
}

// ---- 1局の進行 ----

export interface GameState {
  mode: Mode;
  board: Board;
  /** 残り手数。エンドレスは null（無制限） */
  movesLeft: number | null;
  score: number;
  /** 消したピースの数 */
  cleared: number;
  /** 最大連鎖（1手のうちの段数の最大） */
  maxChain: number;
  /** 手が無くなって並べ替えた回数 */
  shuffles: number;
}

export function newGame(mode: Mode, rng: Rng): GameState {
  return {
    mode,
    board: createBoard(rng),
    movesLeft: mode === 'daily' ? DAILY_MOVES : null,
    score: 0,
    cleared: 0,
    maxChain: 0,
    shuffles: 0,
  };
}

/** 手数を使い切ったか（エンドレスは終わらない） */
export function isOver(state: GameState): boolean {
  return state.movesLeft !== null && state.movesLeft <= 0;
}

export interface MoveResult {
  /** 並んで消えた入れ替えか。false なら盤も手数も変わらない（元に戻る） */
  valid: boolean;
  /** 入れ替えた直後の盤（無効な手でも、往復の動きを描くために返す） */
  swapped: Board;
  steps: Step[];
  /** 手が無くなって並べ替えたときの、並べ替えたあとの盤 */
  shuffled: Board | null;
  state: GameState;
}

/**
 * 1手指す。
 *
 * - **並ばない入れ替えは手数を減らさない**（誤タップで1手損させない）
 * - 手数が減るのは「並んで消えた入れ替え」だけ
 * - 消し終えた盤に手が無ければ、同じ乱数列の続きで並べ替える。
 *   **並べ替えで手数は減らさない**（日替わりでも同じ。手数を使い切ったあとは並べ替えない）
 */
export function playMove(state: GameState, a: number, b: number, rng: Rng): MoveResult {
  const swapped = isAdjacent(a, b) ? swap(state.board, a, b) : state.board;
  if (isOver(state) || !isValidMove(state.board, a, b)) {
    return { valid: false, swapped, steps: [], shuffled: null, state };
  }
  const steps = resolve(swapped, rng);
  let board = steps[steps.length - 1].board;
  const movesLeft = state.movesLeft === null ? null : state.movesLeft - 1;
  let shuffled: Board | null = null;
  const over = movesLeft !== null && movesLeft <= 0;
  if (!over && !hasAnyMove(board)) {
    shuffled = shuffle(board, rng);
    board = shuffled;
  }
  return {
    valid: true,
    swapped,
    steps,
    shuffled,
    state: {
      ...state,
      board,
      movesLeft,
      score: state.score + steps.reduce((sum, s) => sum + s.points, 0),
      cleared: state.cleared + steps.reduce((sum, s) => sum + s.cleared.length, 0),
      maxChain: Math.max(state.maxChain, steps.length),
      shuffles: state.shuffles + (shuffled ? 1 : 0),
    },
  };
}

// ---- 共有 ----

/** 共有する文面。「マッチ3パズル 2026-09-29：1,240 点（最大 4 連鎖）」の形 */
export function shareText(params: {
  mode: Mode;
  score: number;
  maxChain: number;
  dateKey?: DateKey;
  url: string;
}): string {
  const label = params.mode === 'daily' && params.dateKey ? params.dateKey : 'エンドレス';
  const score = params.score.toLocaleString('ja-JP');
  const chain = params.maxChain >= 2 ? `（最大 ${params.maxChain} 連鎖）` : '';
  return `マッチ3パズル ${label}：${score} 点${chain}\n${params.url}`;
}
