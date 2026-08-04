/**
 * リバーシの盤面ロジックとCPU
 *
 * 盤面は長さ64の配列（0 = 空き、1 = 黒、2 = 白）。index = row * 8 + col。
 * 黒が先手。
 *
 * CPUは「マスの価値表 + 返せる石の数」で手を選ぶ単純な評価。
 * 角を最重視し、角の隣（C打ち・X打ち）を避けるという定石だけ持たせている。
 * 探索はしないので強くはないが、無料ゲームの相手としては十分に振る舞う。
 *
 * ※「オセロ」は登録商標のため、このサイトでは使わない。
 *   一般名称の「リバーシ」で統一すること。
 */

export type Cell = 0 | 1 | 2;
export type ReversiBoard = Cell[];
export type Player = 1 | 2;

/** 8方向の移動量 [dRow, dCol] */
const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

/** 初期配置（中央に黒白2つずつ） */
export function initialBoard(): ReversiBoard {
  const b: ReversiBoard = new Array(64).fill(0);
  b[27] = 2; // d4 白
  b[28] = 1; // e4 黒
  b[35] = 1; // d5 黒
  b[36] = 2; // e5 白
  return b;
}

export const opponent = (p: Player): Player => (p === 1 ? 2 : 1);

/**
 * その手で裏返る石の一覧。空配列なら打てない手。
 * 8方向それぞれに「相手の石が1つ以上続き、その先に自分の石」があれば挟める。
 */
export function flipsFor(board: ReversiBoard, index: number, player: Player): number[] {
  if (board[index] !== 0) return [];
  const row = Math.floor(index / 8);
  const col = index % 8;
  const flips: number[] = [];
  for (const [dr, dc] of DIRECTIONS) {
    const line: number[] = [];
    let r = row + dr;
    let c = col + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const i = r * 8 + c;
      if (board[i] === opponent(player)) {
        line.push(i);
      } else if (board[i] === player) {
        if (line.length > 0) flips.push(...line);
        break;
      } else {
        break; // 空きマスに当たったら挟めない
      }
      r += dr;
      c += dc;
    }
  }
  return flips;
}

/** 打てる手の一覧 */
export function legalMoves(board: ReversiBoard, player: Player): number[] {
  const moves: number[] = [];
  for (let i = 0; i < 64; i += 1) {
    if (flipsFor(board, i, player).length > 0) moves.push(i);
  }
  return moves;
}

/** 手を打った後の盤面を返す（元の盤面は変更しない）。打てない手なら null */
export function applyMove(board: ReversiBoard, index: number, player: Player): ReversiBoard | null {
  const flips = flipsFor(board, index, player);
  if (flips.length === 0) return null;
  const next = [...board] as ReversiBoard;
  next[index] = player;
  for (const i of flips) next[i] = player;
  return next;
}

/** 石の数 */
export function countStones(board: ReversiBoard): { black: number; white: number } {
  let black = 0;
  let white = 0;
  for (const c of board) {
    if (c === 1) black += 1;
    else if (c === 2) white += 1;
  }
  return { black, white };
}

/** 両者とも打てなければ終局 */
export function isGameOver(board: ReversiBoard): boolean {
  return legalMoves(board, 1).length === 0 && legalMoves(board, 2).length === 0;
}

/**
 * マスの価値表。角が最も高く、角の隣（C打ち・X打ち）は低い。
 * リバーシの定石として広く知られている一般的な重み付け。
 */
const WEIGHTS: readonly number[] = [
  120, -20, 20, 5, 5, 20, -20, 120,
  -20, -40, -5, -5, -5, -5, -40, -20,
  20, -5, 15, 3, 3, 15, -5, 20,
  5, -5, 3, 3, 3, 3, -5, 5,
  5, -5, 3, 3, 3, 3, -5, 5,
  20, -5, 15, 3, 3, 15, -5, 20,
  -20, -40, -5, -5, -5, -5, -40, -20,
  120, -20, 20, 5, 5, 20, -20, 120,
];

/**
 * CPUの手を選ぶ。「置くマスの価値 + 返せる石の数」が最大の手。
 * 同点の場合は先に見つかったほうを選ぶ（盤面の左上から順）。
 *
 * @returns 打つマスの index。打てる手がなければ null（パス）
 */
export function cpuMove(board: ReversiBoard, player: Player): number | null {
  const moves = legalMoves(board, player);
  if (moves.length === 0) return null;
  let best = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const score = WEIGHTS[m] + flipsFor(board, m, player).length;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}
