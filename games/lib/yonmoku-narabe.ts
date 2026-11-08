/**
 * 四目並べ（落とし込み）のロジック。
 *
 * 仕様: docs/features/game-yonmoku-narabe.md
 *
 * 縦 6 × 横 7 の盤。列を選ぶとコマがその列のいちばん下の空きに落ち、
 * 縦・横・斜めに 4 つ並べたら勝ち。42 マスが埋まって誰も並ばなければ引き分け。
 *
 * 画面（`app/yonmoku-narabe/Game.tsx`）は入力と描画だけを持ち、
 * 盤・合法手・勝敗判定・CPU の探索はすべてここ（純関数）が持つ。
 *
 * ## 盤の持ち方（ビットボード）
 *
 * 盤は **2 本の整数**で持つ。`mask`＝コマがあるマス、`cur`＝いま指す側のコマ。
 * 列 c・下から h 段目のマスを `c * 7 + h` ビット目に置き、各列の 7 段目（h = 6）は
 * 番兵として空けておく（横・斜めの判定で隣の列へ回り込まないため）。全部で 49 ビット。
 *
 * JavaScript のビット演算は 32 ビットまでなので、49 ビットの値は
 * 上下 2 つに割って AND を取る（`and53`）。シフトは 2 の累乗の掛け算・割り算で行う。
 * 局面の鍵は `cur + mask`（どちらの手番かも含めて 1 局面に 1 つ。53 ビットに収まる）。
 *
 * ## CPU（3 段階）
 *
 * | 強さ | 中身 |
 * |---|---|
 * | かんたん | 即勝ちがあれば打つ。相手の即勝ちは 6 割の確率で防ぐ。それ以外は中央寄りのランダム（読み 1 手） |
 * | ふつう | 即勝ち・即防ぎは必ず。αβ 4 手読み＋評価 |
 * | つよい | 即勝ち・即防ぎは必ず。αβ 8 手読み（反復深化）＋手の並べ替え（中央から）＋置換表 |
 *
 * **速さは時刻ではなく探索するノード数で縛る**（上限 20 万）。上限に達したら、
 * 読み切れた深さまでの最善手を返す。テストで時刻を測らないのは、CI の機械の速さで結果が変わるため。
 */

export const ROWS = 6;
export const COLS = 7;
export const CELLS = ROWS * COLS;
/** 1 列ぶんのビット数（6 段＋番兵 1） */
const H1 = ROWS + 1;

/** 0 = 空き・1 = 先手（黒）・2 = 後手（白） */
export type Cell = 0 | 1 | 2;
/** 先手（黒）か後手（白）か */
export type Side = 1 | 2;

export interface Board {
  /** いま指す側のコマ */
  readonly cur: number;
  /** コマがあるマス */
  readonly mask: number;
  /** ここまでに指した手の数（偶数なら先手の番） */
  readonly moves: number;
}

// ---- 49 ビット整数の演算 ----

const TWO32 = 4294967296;

function and53(a: number, b: number): number {
  const ah = Math.floor(a / TWO32);
  const bh = Math.floor(b / TWO32);
  return (ah & bh) * TWO32 + (((a >>> 0) & (b >>> 0)) >>> 0);
}

function xor53(a: number, b: number): number {
  const ah = Math.floor(a / TWO32);
  const bh = Math.floor(b / TWO32);
  return (ah ^ bh) * TWO32 + (((a >>> 0) ^ (b >>> 0)) >>> 0);
}

function or53(a: number, b: number): number {
  const ah = Math.floor(a / TWO32);
  const bh = Math.floor(b / TWO32);
  return (ah | bh) * TWO32 + (((a >>> 0) | (b >>> 0)) >>> 0);
}

/** 右シフト（2 の累乗で割って切り捨て） */
function shr(a: number, n: number): number {
  return Math.floor(a / 2 ** n);
}

const bit = (i: number) => 2 ** i;
const BOTTOM: number[] = Array.from({ length: COLS }, (_, c) => bit(c * H1));
const TOP: number[] = Array.from({ length: COLS }, (_, c) => bit(c * H1 + ROWS - 1));

/** 4 つ並んでいるか（`p` は片方のコマ） */
export function aligned(p: number): boolean {
  // 縦 1・横 7・斜め 6 と 8
  for (const s of [1, H1, H1 - 1, H1 + 1]) {
    const m = and53(p, shr(p, s));
    if (and53(m, shr(m, 2 * s)) !== 0) return true;
  }
  return false;
}

// ---- 盤 ----

export function initialBoard(): Board {
  return { cur: 0, mask: 0, moves: 0 };
}

/** いま指す側（先手＝1・後手＝2） */
export function sideToMove(b: Board): Side {
  return b.moves % 2 === 0 ? 1 : 2;
}

export function canPlay(b: Board, col: number): boolean {
  return Number.isInteger(col) && col >= 0 && col < COLS && and53(b.mask, TOP[col]) === 0;
}

export function legalColumns(b: Board): number[] {
  const out: number[] = [];
  for (let c = 0; c < COLS; c += 1) if (canPlay(b, c)) out.push(c);
  return out;
}

/** その列に落としたコマが止まる段（上から数えた行。0 が最上段）。満杯なら -1 */
export function dropRow(b: Board, col: number): number {
  if (!canPlay(b, col)) return -1;
  let h = 0;
  while (and53(b.mask, bit(col * H1 + h)) !== 0) h += 1;
  return ROWS - 1 - h;
}

/** 列にコマを落とす。満杯の列・範囲外の列は例外 */
export function play(b: Board, col: number): Board {
  if (!canPlay(b, col)) throw new Error(`column ${col} is full or out of range`);
  const cur = xor53(b.cur, b.mask);
  const mask = or53(b.mask, b.mask + BOTTOM[col]);
  return { cur, mask, moves: b.moves + 1 };
}

/** その列に落とすと、いま指す側が 4 つ並ぶか */
export function isWinningMove(b: Board, col: number): boolean {
  if (!canPlay(b, col)) return false;
  const pos = or53(b.cur, and53(b.mask + BOTTOM[col], columnMask(col)));
  return aligned(pos);
}

function columnMask(col: number): number {
  return ((1 << ROWS) - 1) * bit(col * H1);
}

/** 直前に指した側が 4 つ並べたか */
export function lastMoverWon(b: Board): boolean {
  // `cur` は次に指す側なので、直前に指した側は mask ^ cur
  return aligned(xor53(b.cur, b.mask));
}

export type Outcome = 'playing' | 'win' | 'draw';

/** 局の状態。`win` は直前に指した側の勝ち */
export function outcomeOf(b: Board): Outcome {
  if (lastMoverWon(b)) return 'win';
  if (b.moves >= CELLS) return 'draw';
  return 'playing';
}

/** 勝った側（決着していなければ null） */
export function winnerOf(b: Board): Side | null {
  if (!lastMoverWon(b)) return null;
  return b.moves % 2 === 1 ? 1 : 2;
}

/** 指した列の並びから盤を作る */
export function fromMoves(cols: readonly number[]): Board {
  let b = initialBoard();
  for (const c of cols) b = play(b, c);
  return b;
}

/** 画面用のマス目（上の行から、左の列から。`r * 7 + c`） */
export function cellsOf(b: Board): Cell[] {
  const first = b.moves % 2 === 0 ? b.cur : xor53(b.cur, b.mask);
  const out: Cell[] = new Array(CELLS).fill(0);
  for (let c = 0; c < COLS; c += 1) {
    for (let h = 0; h < ROWS; h += 1) {
      const m = bit(c * H1 + h);
      if (and53(b.mask, m) === 0) continue;
      out[(ROWS - 1 - h) * COLS + c] = and53(first, m) !== 0 ? 1 : 2;
    }
  }
  return out;
}

/** 4 つ並びの窓（マス目の番号 `r * 7 + c` の 4 つ組）。横 24・縦 21・斜め 12＋12 の 69 本 */
export const WINDOWS: readonly (readonly number[])[] = (() => {
  const out: number[][] = [];
  const at = (r: number, c: number) => r * COLS + c;
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (c + 3 < COLS) out.push([0, 1, 2, 3].map((k) => at(r, c + k)));
      if (r + 3 < ROWS) out.push([0, 1, 2, 3].map((k) => at(r + k, c)));
      if (r + 3 < ROWS && c + 3 < COLS) out.push([0, 1, 2, 3].map((k) => at(r + k, c + k)));
      if (r + 3 < ROWS && c - 3 >= 0) out.push([0, 1, 2, 3].map((k) => at(r + k, c - k)));
    }
  }
  return out;
})();

/**
 * 並んだ 4 つのマス（光らせる用）。マス目から直接探すので、ビットボードの判定と独立に確かめられる。
 * 5 つ以上並んだときも、最初に見つかった 4 つを返す
 */
export function winLine(cells: readonly Cell[]): { side: Side; line: number[] } | null {
  for (const w of WINDOWS) {
    const v = cells[w[0]];
    if (v !== 0 && w.every((i) => cells[i] === v)) return { side: v, line: [...w] };
  }
  return null;
}

// ---- 1 手もどす ----

/**
 * 「1 手もどす」で戻す手の数。
 *
 * - 対面モード：1 手
 * - CPU 対戦：自分の直前の手まで（あいだの CPU の手も一緒に）。最後の手が CPU なら 2 手、
 *   自分の手で決着した直後なら 1 手。自分がまだ 1 手も指していなければ 0（戻せない）
 *
 * @param movesLen ここまでの手数
 * @param human CPU 対戦での自分の側（対面モードは null）
 */
export function undoCount(movesLen: number, human: Side | null): number {
  if (movesLen === 0) return 0;
  if (human === null) return 1;
  // 手 i（0 始まり）を指したのは i が偶数なら先手
  const sideOf = (i: number): Side => (i % 2 === 0 ? 1 : 2);
  let n = 0;
  for (let i = movesLen - 1; i >= 0; i -= 1) {
    n += 1;
    if (sideOf(i) === human) return n;
  }
  return 0;
}

// ---- CPU ----

export type Level = 'easy' | 'normal' | 'hard';
export const LEVEL_ORDER: readonly Level[] = ['easy', 'normal', 'hard'];
export const LEVEL_LABEL: Record<Level, string> = { easy: 'かんたん', normal: 'ふつう', hard: 'つよい' };
/** 読みの深さ（手） */
export const LEVEL_DEPTH: Record<Level, number> = { easy: 1, normal: 4, hard: 8 };
/** 探索するノード数の上限。超えたら読み切れた深さまでの最善手を返す */
export const NODE_LIMIT = 200_000;
/** かんたんが相手の即勝ちを防ぐ確率 */
export const EASY_BLOCK_RATE = 0.6;

/** 手の並べ替え（中央の列から） */
export const MOVE_ORDER: readonly number[] = [3, 2, 4, 1, 5, 0, 6];

const WIN_SCORE = 1_000_000;

/** 盤の評価（いま指す側から見た値） */
export function evaluate(b: Board): number {
  const cells = cellsOf(b);
  const me: Side = sideToMove(b);
  let score = 0;
  // 中央の列のコマの数
  for (let r = 0; r < ROWS; r += 1) {
    const v = cells[r * COLS + 3];
    if (v === me) score += 6;
    else if (v !== 0) score -= 6;
  }
  for (const w of WINDOWS) {
    let mine = 0;
    let theirs = 0;
    for (const i of w) {
      if (cells[i] === me) mine += 1;
      else if (cells[i] !== 0) theirs += 1;
    }
    if (theirs === 0) score += mine === 3 ? 50 : mine === 2 ? 5 : 0;
    else if (mine === 0) score -= theirs === 3 ? 50 : theirs === 2 ? 5 : 0;
  }
  // 横の 3 つ並びで両側が空いている形（_XXX_）は、次にどちらを塞がれても勝てる
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c + 4 < COLS; c += 1) {
      const row = [0, 1, 2, 3, 4].map((k) => cells[r * COLS + c + k]);
      if (row[0] !== 0 || row[4] !== 0) continue;
      if (row[1] !== 0 && row[1] === row[2] && row[2] === row[3]) score += row[1] === me ? 200 : -200;
    }
  }
  return score;
}

/** 相手の即勝ちになる列（いま指す側が塞がなければ、次に相手が 4 つ並べる列） */
export function threatColumns(b: Board): number[] {
  // 手番を入れ替えた盤で「即勝ち」を探す（盤そのものは同じ）
  const swapped: Board = { cur: xor53(b.cur, b.mask), mask: b.mask, moves: b.moves + 1 };
  return legalColumns(b).filter((c) => isWinningMove(swapped, c));
}

export interface SearchResult {
  /** 選んだ列 */
  move: number;
  /** 読み切れた深さ */
  depth: number;
  /** 探索したノード数 */
  nodes: number;
  /** ノード数の上限で打ち切ったか */
  aborted: boolean;
}

interface TTEntry {
  depth: number;
  value: number;
  flag: 0 | 1 | 2; // 0 = ちょうど・1 = 下限・2 = 上限
  move: number;
}

class Abort extends Error {}

/**
 * αβ探索（ネガマックス）で最善の列を選ぶ。
 *
 * @param depth 読みの深さ（手）
 * @param opts.tt 置換表を使うか（つよい）
 * @param opts.iterative 1 手から順に深くするか（打ち切ったとき、読み切れた深さの手を返すため）
 * @param opts.maxNodes ノード数の上限
 */
export function search(
  b: Board,
  depth: number,
  opts: { tt?: boolean; iterative?: boolean; maxNodes?: number } = {},
): SearchResult {
  const legal = legalColumns(b);
  if (legal.length === 0) throw new Error('no legal move');
  const maxNodes = opts.maxNodes ?? NODE_LIMIT;
  const table = opts.tt ? new Map<number, TTEntry>() : null;
  let nodes = 0;

  const negamax = (node: Board, d: number, alpha: number, beta: number): number => {
    nodes += 1;
    if (nodes > maxNodes) throw new Abort();
    if (node.moves >= CELLS) return 0;
    const moves = MOVE_ORDER.filter((c) => canPlay(node, c));
    for (const c of moves) if (isWinningMove(node, c)) return WIN_SCORE - node.moves;
    if (d <= 0) return evaluate(node);

    const key = node.cur + node.mask;
    const alpha0 = alpha;
    let first = -1;
    if (table) {
      const e = table.get(key);
      if (e && e.depth >= d) {
        if (e.flag === 0) return e.value;
        if (e.flag === 1 && e.value > alpha) alpha = e.value;
        else if (e.flag === 2 && e.value < beta) beta = e.value;
        if (alpha >= beta) return e.value;
      }
      if (e) first = e.move;
    }
    const ordered = first >= 0 ? [first, ...moves.filter((c) => c !== first)] : moves;
    let best = -Infinity;
    let bestMove = ordered[0];
    for (const c of ordered) {
      const v = -negamax(play(node, c), d - 1, -beta, -alpha);
      if (v > best) {
        best = v;
        bestMove = c;
      }
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    if (table) {
      const flag: 0 | 1 | 2 = best <= alpha0 ? 2 : best >= beta ? 1 : 0;
      table.set(key, { depth: d, value: best, flag, move: bestMove });
    }
    return best;
  };

  const root = (d: number, prefer: number): number => {
    const moves = MOVE_ORDER.filter((c) => canPlay(b, c));
    const ordered = prefer >= 0 ? [prefer, ...moves.filter((c) => c !== prefer)] : moves;
    let best = -Infinity;
    let bestMove = ordered[0];
    let alpha = -Infinity;
    for (const c of ordered) {
      const v = -negamax(play(b, c), d - 1, -Infinity, -alpha);
      if (v > best) {
        best = v;
        bestMove = c;
      }
      if (v > alpha) alpha = v;
    }
    return bestMove;
  };

  let move = MOVE_ORDER.find((c) => canPlay(b, c)) as number;
  let reached = 0;
  const from = opts.iterative ? 1 : depth;
  try {
    for (let d = from; d <= depth; d += 1) {
      move = root(d, reached > 0 ? move : -1);
      reached = d;
    }
  } catch (e) {
    if (!(e instanceof Abort)) throw e;
    return { move, depth: reached, nodes: maxNodes, aborted: true };
  }
  return { move, depth: reached, nodes, aborted: false };
}

/** 中央寄りのランダム（中央 4・その隣 3・…・端 1 の重み） */
function centerRandom(cols: readonly number[], rand: () => number): number {
  const weight = (c: number) => 4 - Math.abs(c - 3);
  const total = cols.reduce((s, c) => s + weight(c), 0);
  let x = rand() * total;
  for (const c of cols) {
    x -= weight(c);
    if (x < 0) return c;
  }
  return cols[cols.length - 1];
}

/**
 * CPU の手。即勝ちがあれば必ず打つ。即防ぎは、ふつう・つよいは必ず、かんたんは 6 割。
 *
 * @param rand 乱数（テストで差し替える）
 */
export function cpuMove(b: Board, level: Level, rand: () => number = Math.random): number {
  const legal = legalColumns(b);
  if (legal.length === 0) throw new Error('no legal move');
  const win = MOVE_ORDER.find((c) => isWinningMove(b, c));
  if (win !== undefined) return win;
  const threats = threatColumns(b);
  if (level === 'easy') {
    if (threats.length > 0 && rand() < EASY_BLOCK_RATE) return threats[0];
    return centerRandom(legal, rand);
  }
  if (threats.length > 0) return threats[0];
  if (level === 'normal') return search(b, LEVEL_DEPTH.normal).move;
  return search(b, LEVEL_DEPTH.hard, { tt: true, iterative: true }).move;
}

// ---- 計測（リバーシ経由） ----

/**
 * リバーシの対局後のリンクから来たことを示す印（`sessionStorage`）。
 * 内部リンクに URL パラメータを付けない代わりに使う（仕様書の「計測」）
 */
export const FROM_KEY = 'yonmoku-from';

type SessionLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** リバーシ側でリンクを押したときに呼ぶ。使えなければ何もしない */
export function markFromReversi(storage: SessionLike | null): void {
  try {
    storage?.setItem(FROM_KEY, 'reversi');
  } catch {
    // 計測の印が置けなくても遊べる
  }
}

/**
 * 局の開始で送る `action`。印があれば `-from-reversi` を付けて印を消す
 * （そのタブで最初の 1 局だけに付く）。
 *
 * @param what 強さ（CPU 対戦）か `pvp`（対面モード）
 */
export function beginAction(what: Level | 'pvp', storage: SessionLike | null): string {
  let from = false;
  try {
    if (storage?.getItem(FROM_KEY) === 'reversi') {
      from = true;
      storage.removeItem(FROM_KEY);
    }
  } catch {
    from = false;
  }
  return `begin-${what}${from ? '-from-reversi' : ''}`;
}
