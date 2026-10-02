/**
 * 詰将棋（1手詰・3手詰）のロジック
 *
 * 仕様: docs/features/game-tsume-shogi.md
 *
 * ## 盤の座標
 *
 * 内部では 0〜80 の添字（`row * 9 + col`）。**row 0 が一段目（玉方の陣の奥）、col 0 が９筋**。
 * つまり画面の左上が「９一」、右下が「１九」で、将棋の慣例どおり右上が「１一」になる。
 * 表示の変換は `toLabel` だけが持つ（左右を間違えると全問が鏡になるので、テストで押さえている）。
 *
 * ## 手番
 *
 * 攻方（`'A'`。プレイヤー・先手）は上（row 0）へ向かって進み、玉方（`'D'`）は下へ進む。
 * 攻方の玉は盤に置かない（通常の詰将棋どおり）。
 *
 * ## 持ち駒
 *
 * 攻方の持ち駒は問題で指定する。**玉方の持ち駒は盤面から導出する**
 * （駒の種類ごとに「上限 − 盤上 − 攻方の持ち駒」。`deriveDefenderHand`）。手で持たない。
 *
 * ## 合駒
 *
 * 合駒で外れる王手は詰みにならない（判定は `legalMoves` に任せる）。生成側では、
 * 玉から 2 マス以上離れた飛・角・香の王手を作意に入れない（無駄合いの判定を避けるため）。
 *
 * 純関数のみ。乱数は `generate` に注入する。
 */

import { dailySeed, mulberry32, type DateKey } from './daily';

// ---- 型 ----

export type Piece = 'K' | 'R' | 'B' | 'G' | 'S' | 'N' | 'L' | 'P' | '+R' | '+B' | '+S' | '+N' | '+L' | '+P';
/** 持ち駒にできる駒（成駒は元の駒に戻り、玉は持たない） */
export type HandPiece = 'R' | 'B' | 'G' | 'S' | 'N' | 'L' | 'P';
/** 攻方（A）・玉方（D） */
export type Side = 'A' | 'D';

export interface Square {
  piece: Piece;
  side: Side;
}

export type Hand = Record<HandPiece, number>;

export interface Board {
  cells: (Square | null)[];
  attackerHand: Hand;
  defenderHand: Hand;
}

export interface Move {
  /** 動かす元の添字。持ち駒を打つときは null */
  from: number | null;
  to: number;
  /** 動かす駒（成る前）。打つときは持ち駒の種類 */
  piece: Piece;
  /** 成るかどうか */
  promote: boolean;
}

export interface Problem {
  board: Board;
  moves: 1 | 3;
  /** 作意（3 手詰は 初手・玉方の応手・3 手目）。3 手目は詰む手ならどれでも正解 */
  solution: Move[];
  /** この問題を作った種（日替わりの再現と、試行の打ち切りで進めた先の確認に使う） */
  seed: number;
}

export type Verdict = 'mate' | 'not-check' | 'escapable' | 'illegal' | 'continue';

/** 指せない理由。UI の 1 行に使う */
export type IllegalReason = 'uchifuzume' | 'nifu' | 'dead-piece' | 'self-check' | 'not-a-move';

// ---- 定数 ----

export const SIZE = 9;
export const CELLS = SIZE * SIZE;

/** 持ち駒の並び（表示とループの順） */
export const HAND_ORDER: readonly HandPiece[] = ['R', 'B', 'G', 'S', 'N', 'L', 'P'];

/**
 * 駒の種類ごとの上限（ルール 7）。成駒は元の駒として数える。
 * 玉は 2 だが、攻方の玉は盤に置かないので計算から除く（玉方の玉 1 枚だけを数える）
 */
export const PIECE_LIMIT: Record<HandPiece | 'K', number> = {
  P: 18,
  L: 4,
  N: 4,
  S: 4,
  G: 4,
  B: 2,
  R: 2,
  K: 2,
};

const PROMOTE: Partial<Record<Piece, Piece>> = {
  R: '+R',
  B: '+B',
  S: '+S',
  N: '+N',
  L: '+L',
  P: '+P',
};

/** 盤の駒の字（漢字 1 文字）。成駒は字も変える（色だけに頼らない） */
export const PIECE_CHAR: Record<Piece, string> = {
  K: '玉',
  R: '飛',
  B: '角',
  G: '金',
  S: '銀',
  N: '桂',
  L: '香',
  P: '歩',
  '+R': '龍',
  '+B': '馬',
  '+S': '全',
  '+N': '圭',
  '+L': '杏',
  '+P': 'と',
};

/** 手の読み上げ・棋譜に使う名前 */
export const PIECE_NAME: Record<Piece, string> = {
  K: '玉',
  R: '飛',
  B: '角',
  G: '金',
  S: '銀',
  N: '桂',
  L: '香',
  P: '歩',
  '+R': '龍',
  '+B': '馬',
  '+S': '成銀',
  '+N': '成桂',
  '+L': '成香',
  '+P': 'と',
};

const FILE_CHARS = '９８７６５４３２１';
const RANK_CHARS = '一二三四五六七八九';

// ---- 座標 ----

export function rowOf(i: number): number {
  return Math.floor(i / SIZE);
}

export function colOf(i: number): number {
  return i % SIZE;
}

export function indexOf(row: number, col: number): number {
  return row * SIZE + col;
}

/** 添字 → 「５二」の形。`toLabel(0) === '９一'`、`toLabel(80) === '１九'` */
export function toLabel(i: number): string {
  return `${FILE_CHARS[colOf(i)]}${RANK_CHARS[rowOf(i)]}`;
}

/** 筋（1〜9）・段（1〜9）→ 添字。テストと問題の手書きに使う */
export function sq(file: number, rank: number): number {
  return indexOf(rank - 1, 9 - file);
}

// ---- 駒の性質 ----

export function baseOf(piece: Piece): HandPiece | 'K' {
  return (piece.startsWith('+') ? piece.slice(1) : piece) as HandPiece | 'K';
}

export function canPromote(piece: Piece): boolean {
  return PROMOTE[piece] !== undefined;
}

export function promoted(piece: Piece): Piece {
  return PROMOTE[piece] ?? piece;
}

/** 敵陣（成れる 3 段）か */
function inZone(i: number, side: Side): boolean {
  const r = rowOf(i);
  return side === 'A' ? r <= 2 : r >= 6;
}

/** その段に置くと、この駒はもう動けないか（行き所のない駒） */
function isDeadSquare(piece: Piece, to: number, side: Side): boolean {
  const r = rowOf(to);
  const depth = side === 'A' ? r : SIZE - 1 - r; // 敵陣の奥から何段目（0 が最奥）
  if (piece === 'P' || piece === 'L') return depth === 0;
  if (piece === 'N') return depth <= 1;
  return false;
}

type Step = readonly [number, number]; // [drow（攻方の向き）, dcol]

const GOLD_STEPS: readonly Step[] = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, 0],
];
const KING_STEPS: readonly Step[] = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];
const ORTHO: readonly Step[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
const DIAG: readonly Step[] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

/** 1 マスずつの動き（step）と、走る動き（slide）。向きは攻方基準 */
const MOVES: Record<Piece, { step: readonly Step[]; slide: readonly Step[] }> = {
  K: { step: KING_STEPS, slide: [] },
  G: { step: GOLD_STEPS, slide: [] },
  S: {
    step: [
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [1, -1],
      [1, 1],
    ],
    slide: [],
  },
  N: {
    step: [
      [-2, -1],
      [-2, 1],
    ],
    slide: [],
  },
  L: { step: [], slide: [[-1, 0]] },
  P: { step: [[-1, 0]], slide: [] },
  R: { step: [], slide: ORTHO },
  B: { step: [], slide: DIAG },
  '+R': { step: DIAG, slide: ORTHO },
  '+B': { step: ORTHO, slide: DIAG },
  '+S': { step: GOLD_STEPS, slide: [] },
  '+N': { step: GOLD_STEPS, slide: [] },
  '+L': { step: GOLD_STEPS, slide: [] },
  '+P': { step: GOLD_STEPS, slide: [] },
};

/** `from` の駒が利いているマス（味方の駒の上も含む。取れるかどうかは呼び出し側） */
export function attacksFrom(cells: (Square | null)[], from: number): number[] {
  const s = cells[from];
  if (!s) return [];
  const r0 = rowOf(from);
  const c0 = colOf(from);
  const out: number[] = [];
  const def = MOVES[s.piece];
  for (const [dr, dc] of def.step) {
    // 玉方は向きを反転する（攻方基準の表を共有する）
    const rr = r0 + (s.side === 'A' ? dr : -dr);
    const cc = c0 + (s.side === 'A' ? dc : -dc);
    if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) continue;
    out.push(indexOf(rr, cc));
  }
  for (const [dr, dc] of def.slide) {
    const sr = s.side === 'A' ? dr : -dr;
    const sc = s.side === 'A' ? dc : -dc;
    let rr = r0 + sr;
    let cc = c0 + sc;
    while (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE) {
      const i = indexOf(rr, cc);
      out.push(i);
      if (cells[i]) break;
      rr += sr;
      cc += sc;
    }
  }
  return out;
}

/**
 * `from` に置いた `piece`（`side` の駒）が `target` に利いているか。配列を作らずに調べる
 * （探索の大半がここなので、`attacksFrom` を経由しない）
 */
function hits(cells: (Square | null)[], from: number, piece: Piece, side: Side, target: number): boolean {
  const dr = rowOf(target) - rowOf(from);
  const dc = colOf(target) - colOf(from);
  if (dr === 0 && dc === 0) return false;
  const def = MOVES[piece];
  // 速い打ち切り：1 マス・桂の跳びより遠く、しかも縦横斜めのどれにも乗っていなければ利かない
  const far = Math.abs(dr) > 2 || Math.abs(dc) > 2;
  if (far && (def.slide.length === 0 || !(dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc)))) return false;
  // 玉方は向きを反転して、攻方基準の表と比べる
  const ar = side === 'A' ? dr : -dr;
  const ac = side === 'A' ? dc : -dc;
  for (const [sr, sc] of def.step) if (sr === ar && sc === ac) return true;
  for (const [sr, sc] of def.slide) {
    // 同じ向きの直線上にあるか（k 倍）
    const k = sr !== 0 ? ar / sr : ac / sc;
    if (!Number.isInteger(k) || k <= 0) continue;
    if (sr * k !== ar || sc * k !== ac) continue;
    // 間に駒が無いか
    const stepR = side === 'A' ? sr : -sr;
    const stepC = side === 'A' ? sc : -sc;
    let blocked = false;
    for (let j = 1; j < k; j++) {
      if (cells[from + (stepR * SIZE + stepC) * j]) {
        blocked = true;
        break;
      }
    }
    if (!blocked) return true;
  }
  return false;
}

/** 2 つのマスが同じ段・筋・斜めの上にあるか */
function aligned(a: number, b: number): boolean {
  const dr = rowOf(a) - rowOf(b);
  const dc = colOf(a) - colOf(b);
  return dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc);
}

/** `target` に `by` 側の駒が利いているか */
export function isAttacked(cells: (Square | null)[], target: number, by: Side): boolean {
  for (let i = 0; i < CELLS; i++) {
    const s = cells[i];
    if (s && s.side === by && hits(cells, i, s.piece, s.side, target)) return true;
  }
  return false;
}

/** `target` に利いている `by` 側の駒の添字（王手をかけている駒を探すのに使う） */
export function attackersOf(cells: (Square | null)[], target: number, by: Side): number[] {
  const out: number[] = [];
  for (let i = 0; i < CELLS; i++) {
    const s = cells[i];
    if (s && s.side === by && hits(cells, i, s.piece, s.side, target)) out.push(i);
  }
  return out;
}

export function kingSquare(board: Board, side: Side): number {
  return board.cells.findIndex((s) => s !== null && s.side === side && s.piece === 'K');
}

/** `side` の玉に王手がかかっているか。攻方は玉を置かないので常に false */
export function isCheck(board: Board, side: Side): boolean {
  const k = kingSquare(board, side);
  if (k < 0) return false;
  return isAttacked(board.cells, k, side === 'A' ? 'D' : 'A');
}

function opponent(side: Side): Side {
  return side === 'A' ? 'D' : 'A';
}

// ---- 持ち駒 ----

export function emptyHand(): Hand {
  return { R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 };
}

/** 盤上の駒を種類ごとに数える（成駒は元の駒で。玉も数える） */
export function countOnBoard(cells: (Square | null)[]): Record<HandPiece | 'K', number> {
  const n: Record<HandPiece | 'K', number> = { R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0, K: 0 };
  for (const s of cells) if (s) n[baseOf(s.piece)]++;
  return n;
}

/**
 * 玉方の持ち駒＝「残り駒全部」（ルール 3・7）。
 * **種類ごとに**「上限 − 盤上 − 攻方の持ち駒」。総数 40 枚から引くと歩 19 枚のような不正な状態を作れる
 */
export function deriveDefenderHand(cells: (Square | null)[], attackerHand: Hand): Hand {
  const onBoard = countOnBoard(cells);
  const h = emptyHand();
  for (const p of HAND_ORDER) h[p] = PIECE_LIMIT[p] - onBoard[p] - attackerHand[p];
  return h;
}

/** 盤と攻方の持ち駒から Board を作る（玉方の持ち駒は導出） */
export function makeBoard(cells: (Square | null)[], attackerHand: Partial<Hand> = {}): Board {
  const ah = { ...emptyHand(), ...attackerHand };
  return { cells: cells.slice(), attackerHand: ah, defenderHand: deriveDefenderHand(cells, ah) };
}

/** 駒の数が種類ごとに上限以内で、玉方の持ち駒がどれも負でないか */
export function piecesWithinLimits(board: Board): boolean {
  const onBoard = countOnBoard(board.cells);
  if (onBoard.K > 1) return false; // 盤に置く玉は玉方の 1 枚だけ
  for (const p of HAND_ORDER) {
    if (board.defenderHand[p] < 0 || board.attackerHand[p] < 0) return false;
    if (onBoard[p] + board.attackerHand[p] + board.defenderHand[p] > PIECE_LIMIT[p]) return false;
  }
  return true;
}

// ---- 手の生成 ----

function hasUnpromotedPawnOnFile(cells: (Square | null)[], col: number, side: Side): boolean {
  for (let r = 0; r < SIZE; r++) {
    const s = cells[indexOf(r, col)];
    if (s && s.side === side && s.piece === 'P') return true;
  }
  return false;
}

function handOf(board: Board, side: Side): Hand {
  return side === 'A' ? board.attackerHand : board.defenderHand;
}

/**
 * 盤上の駒を動かす手と打つ手を並べる（添字の順。盤の駒が先、打つ手が後）。
 * 行き所のない駒は除く。二歩・打ち歩詰め・自玉の王手放置はここでは除かない
 * （`dropSquares` を渡すと、打つ先をその集合に絞る。合駒の候補だけを作るのに使う）
 */
function pseudoMoves(board: Board, side: Side, dropSquares?: readonly number[]): Move[] {
  const out: Move[] = [];
  const { cells } = board;
  for (let from = 0; from < CELLS; from++) {
    const s = cells[from];
    if (!s || s.side !== side) continue;
    for (const to of attacksFrom(cells, from)) {
      const t = cells[to];
      if (t && t.side === side) continue;
      const mayPromote = canPromote(s.piece) && (inZone(from, side) || inZone(to, side));
      if (mayPromote) out.push({ from, to, piece: s.piece, promote: true });
      if (!isDeadSquare(s.piece, to, side)) out.push({ from, to, piece: s.piece, promote: false });
    }
  }
  const hand = handOf(board, side);
  const targets = dropSquares ?? Array.from({ length: CELLS }, (_, i) => i);
  for (const p of HAND_ORDER) {
    if (hand[p] <= 0) continue;
    for (const to of targets) {
      if (cells[to]) continue;
      if (isDeadSquare(p, to, side)) continue;
      out.push({ from: null, to, piece: p, promote: false });
    }
  }
  return out;
}

/** 手を指した後の盤。合法かどうかは見ない */
export function apply(board: Board, move: Move): Board {
  if (move.from === null) return applyAs(board, move, sideOfDrop(board, move));
  const cells = board.cells.slice();
  const attackerHand = { ...board.attackerHand };
  const defenderHand = { ...board.defenderHand };
  {
    const s = cells[move.from];
    if (!s) return board;
    const side = s.side;
    const captured = cells[move.to];
    if (captured) {
      const base = baseOf(captured.piece);
      if (base !== 'K') (side === 'A' ? attackerHand : defenderHand)[base]++;
    }
    cells[move.from] = null;
    cells[move.to] = { piece: move.promote ? promoted(s.piece) : s.piece, side };
  }
  return { cells, attackerHand, defenderHand };
}

/**
 * 打つ手は手番を持たないので、どちらの持ち駒から打つかを決める（攻方の持ち駒にあれば攻方）。
 * 玉方も同じ種類を持っていることが多いので、手番が分かっている所では `applyAs` を使う
 */
function sideOfDrop(board: Board, move: Move): Side {
  return board.attackerHand[move.piece as HandPiece] > 0 ? 'A' : 'D';
}

/** 手番を明示して指す（打つ手で、両者が同じ種類を持っているときの取り違えを防ぐ） */
export function applyAs(board: Board, move: Move, side: Side): Board {
  if (move.from !== null) return apply(board, move);
  const cells = board.cells.slice();
  const attackerHand = { ...board.attackerHand };
  const defenderHand = { ...board.defenderHand };
  (side === 'A' ? attackerHand : defenderHand)[move.piece as HandPiece]--;
  cells[move.to] = { piece: move.piece, side };
  return { cells, attackerHand, defenderHand };
}

/** 王手をかけている駒が 1 つで、それが離れた走り駒なら、間のマス（合駒の候補）を返す */
function interposeSquares(board: Board, side: Side): number[] {
  const k = kingSquare(board, side);
  if (k < 0) return [];
  const checkers = attackersOf(board.cells, k, opponent(side));
  if (checkers.length !== 1) return [];
  const c = checkers[0];
  const dr = Math.sign(rowOf(k) - rowOf(c));
  const dc = Math.sign(colOf(k) - colOf(c));
  const out: number[] = [];
  let r = rowOf(c) + dr;
  let col = colOf(c) + dc;
  while (indexOf(r, col) !== k) {
    // 桂は跳ぶので間が無い。一直線上でなければ合駒はできない
    if (r < 0 || r >= SIZE || col < 0 || col >= SIZE) return [];
    out.push(indexOf(r, col));
    r += dr;
    col += dc;
    if (out.length > SIZE) return [];
  }
  return out;
}

/** 自玉に王手がかからないか（攻方は玉が無いので常に true） */
function keepsKingSafe(after: Board, side: Side): boolean {
  return !isCheck(after, side);
}

/**
 * `side` に合法手が 1 つでもあるか（詰みの判定）。打ち歩詰めの検査はしない
 * （ここを呼ぶのは「攻方が指した後の玉方」だけで、玉方の歩打ちが攻方を詰ますことは無い）
 */
function hasAnyLegalMove(board: Board, side: Side): boolean {
  // まず玉が逃げられるかを見る（いちばん多い受けで、盤を写さずに調べられる）
  const k = kingSquare(board, side);
  if (k >= 0) {
    const without = board.cells.slice();
    without[k] = null; // 玉が抜けたあとの筋を走り駒が通る
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = rowOf(k) + dr;
        const c = colOf(k) + dc;
        if ((dr === 0 && dc === 0) || r < 0 || r >= SIZE || c < 0 || c >= SIZE) continue;
        const to = indexOf(r, c);
        const t = without[to];
        if (t && t.side === side) continue;
        // 取る駒は自分のマスに利かないので、そのまま調べてよい
        if (!isAttacked(without, to, opponent(side))) return true;
      }
    }
  }
  const inCheck = isCheck(board, side);
  const drops = inCheck ? interposeSquares(board, side) : undefined;
  for (const m of pseudoMoves(board, side, drops)) {
    if (m.from === k) continue; // 玉の手は上で調べた
    if (m.from === null && m.piece === 'P' && hasUnpromotedPawnOnFile(board.cells, colOf(m.to), side)) continue;
    if (keepsKingSafe(applyAs(board, m, side), side)) return true;
  }
  return false;
}

/** 打ち歩詰めか（歩を打って相手の玉が詰む）。歩を**動かして**の詰みは対象外 */
function isUchifuzume(board: Board, move: Move, side: Side): boolean {
  if (move.from !== null || move.piece !== 'P') return false;
  const after = applyAs(board, move, side);
  const opp = opponent(side);
  return isCheck(after, opp) && !hasAnyLegalMove(after, opp);
}

/**
 * 指せない理由。指せる手なら null。
 * UI はハイライトに打ち歩詰め・二歩の打ちも含めて出し、指したときにここで理由を出す
 */
export function illegalReason(board: Board, move: Move, side: Side): IllegalReason | null {
  const known = pseudoMoves(board, side).some(
    (m) => m.from === move.from && m.to === move.to && m.piece === move.piece && m.promote === move.promote,
  );
  if (!known) {
    if (move.from === null && board.cells[move.to] === null && handOf(board, side)[move.piece as HandPiece] > 0) {
      if (isDeadSquare(move.piece, move.to, side)) return 'dead-piece';
    }
    if (move.from !== null && !move.promote && isDeadSquare(move.piece, move.to, side)) return 'dead-piece';
    return 'not-a-move';
  }
  if (move.from === null && move.piece === 'P' && hasUnpromotedPawnOnFile(board.cells, colOf(move.to), side)) {
    return 'nifu';
  }
  if (!keepsKingSafe(applyAs(board, move, side), side)) return 'self-check';
  if (isUchifuzume(board, move, side)) return 'uchifuzume';
  return null;
}

/** 合法手（二歩・打ち歩詰め・行き所なし・自玉の王手放置を除く）。添字の順で決定的 */
export function legalMoves(board: Board, side: Side): Move[] {
  const inCheck = isCheck(board, side);
  const drops = inCheck ? interposeSquares(board, side) : undefined;
  return pseudoMoves(board, side, drops).filter((m) => {
    if (m.from === null && m.piece === 'P' && hasUnpromotedPawnOnFile(board.cells, colOf(m.to), side)) return false;
    if (!keepsKingSafe(applyAs(board, m, side), side)) return false;
    if (isUchifuzume(board, m, side)) return false;
    return true;
  });
}

/**
 * 画面でハイライトに出す手（合法手＋打ち歩詰め・二歩の打ち）。
 * 指せないことを指したあとに理由つきで知らせるため（ルール 1 の「指してから判定する」）
 */
export function candidateMoves(board: Board, side: Side): Move[] {
  return pseudoMoves(board, side).filter((m) => keepsKingSafe(applyAs(board, m, side), side));
}

/** 王手になる攻方の合法手 */
export function checkingMoves(board: Board): Move[] {
  const king = kingSquare(board, 'D');
  if (king < 0) return [];
  const out: Move[] = [];
  for (const m of pseudoMoves(board, 'A')) {
    if (m.from === null) {
      // 打つ手は他の駒の利きを開かないので、打った駒が玉に利くかだけを見ればよい（探索の速さのため）
      if (!hits(board.cells, m.to, m.piece, 'A', king)) continue;
      if (m.piece === 'P' && hasUnpromotedPawnOnFile(board.cells, colOf(m.to), 'A')) continue;
      if (m.piece === 'P' && isUchifuzume(board, m, 'A')) continue;
      out.push(m);
      continue;
    }
    // 盤の駒を動かす手は、空いた筋から利きが通る（開き王手）ことがある。動かす元が玉と同じ筋・段・斜めに
    // 無ければ開き王手は起きないので、動かした駒が玉に利くかだけを見る（探索の速さのため）
    const piece = m.promote ? promoted(m.piece) : m.piece;
    if (!aligned(m.from, king)) {
      if (hits(board.cells, m.to, piece, 'A', king)) out.push(m);
      continue;
    }
    if (isCheck(applyAs(board, m, 'A'), 'D')) out.push(m);
  }
  return out;
}

/** 玉方が詰んでいるか（王手がかかっていて、合法手が無い） */
export function isMate(board: Board): boolean {
  return isCheck(board, 'D') && !hasAnyLegalMove(board, 'D');
}

/** 攻方に 1 手で詰ます手があるか（最初に見つけたものを返す） */
function mateInOne(board: Board): Move | null {
  for (const m of checkingMoves(board)) if (isMate(applyAs(board, m, 'A'))) return m;
  return null;
}

/** 玉方の合法手（王手を受けている前提。合駒は間のマスだけ） */
function defenderMoves(board: Board): Move[] {
  return legalMoves(board, 'D');
}

// ---- 探索 ----

/**
 * 作意候補の列挙（余詰の検出に使う）。
 *
 * - `maxPly` 1：1 手で詰む初手それぞれについて `[初手]`
 * - `maxPly` 3：3 手以内で詰む初手それぞれについて、1 手で詰むなら `[初手]`、
 *   そうでなければ `[初手, 玉方の応手（defenderReply）, 3 手目（詰む手の最初の 1 つ）]`
 *
 * 初手ごとに 1 本だけ返す（3 手目の余詰は許容するので数えない。ルール 5）
 */
export function solve(board: Board, maxPly: 1 | 3): { solutions: Move[][] } {
  const solutions: Move[][] = [];
  for (const m1 of checkingMoves(board)) {
    const b1 = applyAs(board, m1, 'A');
    const replies = defenderMoves(b1);
    if (replies.length === 0) {
      solutions.push([m1]);
      continue;
    }
    if (maxPly === 1) continue;
    if (replies.every((r) => mateInOne(applyAs(b1, r, 'D')) !== null)) {
      const reply = defenderReply(b1);
      const m3 = mateInOne(applyAs(b1, reply, 'D'));
      if (m3) solutions.push([m1, reply, m3]);
    }
  }
  return { solutions };
}

/**
 * 玉方の応手。**最も長く逃げる手**を選ぶ（ルール 2）：
 * 次に 1 手で詰まない応手があればそれ、どれも 1 手で詰むならどれでも同じ長さ。
 * 同じ長さの応手が複数あるときは**添字の順で最初のもの**（盤の駒を動かす手が先、打つ手が後）。
 * 日替わりで全員が同じ応手を見るため、乱数は使わない
 */
export function defenderReply(board: Board): Move {
  const replies = defenderMoves(board);
  if (replies.length === 0) throw new Error('玉方に指せる手がありません（詰んでいます）');
  const escape = replies.find((r) => mateInOne(applyAs(board, r, 'D')) === null);
  return escape ?? replies[0];
}

/**
 * 攻方の手を判定する。
 *
 * - `board` はいまの局面（省略すると問題の初期局面）、`ply` はこの手が何手目か（1 か 3）
 * - 最終手（1 手詰の 1 手目・3 手詰の 3 手目）は、指したあとの局面が詰みなら `'mate'`。
 *   **`solution` とは照合しない**（3 手目の余詰は許容。ルール 5）
 * - 3 手詰の 1 手目は、玉方のどの応手にも 1 手で詰ませられるなら `'continue'`
 */
export function judge(problem: Problem, move: Move, board: Board = problem.board, ply: 1 | 3 = 1): Verdict {
  if (illegalReason(board, move, 'A') !== null) return 'illegal';
  const after = applyAs(board, move, 'A');
  if (!isCheck(after, 'D')) return 'not-check';
  const replies = defenderMoves(after);
  if (replies.length === 0) return 'mate';
  if (ply === problem.moves) return 'escapable';
  return replies.every((r) => mateInOne(applyAs(after, r, 'D')) !== null) ? 'continue' : 'escapable';
}

// ---- 表示 ----

function sameMove(a: Move, b: Move): boolean {
  return a.from === b.from && a.to === b.to && a.piece === b.piece && a.promote === b.promote;
}

export { sameMove };

/** 手の読み（「５二金打」「２三銀成」「４一玉」）。`side` は ▲△ を付けるときに使う */
export function formatMove(board: Board, move: Move, side?: Side): string {
  const mark = side === undefined ? '' : side === 'A' ? '▲' : '△';
  const name = PIECE_NAME[move.piece];
  if (move.from === null) return `${mark}${toLabel(move.to)}${name}打`;
  const s = board.cells[move.from];
  const wasPromotable = s !== null && canPromote(s.piece) && (inZone(move.from, s.side) || inZone(move.to, s.side));
  const suffix = move.promote ? '成' : wasPromotable ? '不成' : '';
  return `${mark}${toLabel(move.to)}${name}${suffix}`;
}

/** 盤のマスの読み上げ（「３三 歩」）。玉方の駒には「玉方の」を付ける */
export function cellLabel(board: Board, i: number): string {
  const s = board.cells[i];
  if (!s) return `${toLabel(i)} 空き`;
  return `${toLabel(i)} ${s.side === 'D' ? '玉方の' : ''}${PIECE_NAME[s.piece]}`;
}

// ---- 生成 ----

/**
 * 生成手順の版。**生成の手順を変えたら上げる**（上げないと、過去の「今日の1問」が
 * 黙って別の問題になる）。記録の区分（`DAILY_VARIANT`）も版つきにして旧版のベストを引き継がない
 */
export const DAILY_GENERATOR_VERSION = 1;
export const DAILY_VARIANT = `daily-v${DAILY_GENERATOR_VERSION}`;

/** 1 つの種で試す回数の上限。超えたら種を 1 つ進めて続ける（仕様書の「生成の速度の受け入れ基準」） */
export const MAX_ATTEMPTS: Record<1 | 3, number> = { 1: 300, 3: 300 };

/** 種を進める回数の上限（無限ループの保険。実測では届かない） */
const MAX_SEEDS = 1000;

const ATTACKER_POOL: readonly Piece[] = ['G', 'G', 'S', 'S', 'R', 'B', 'N', 'L', 'P', 'P', '+R', '+B', '+P'];
const DEFENDER_GUARDS: readonly Piece[] = ['G', 'S', 'P', 'N', 'L'];
const HAND_POOL: readonly HandPiece[] = ['G', 'G', 'S', 'S', 'R', 'B', 'N', 'L', 'P'];

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function randInt(rng: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** 玉の近く（チェビシェフ距離 `d` 以内）の空きマスを 1 つ選ぶ。無ければ -1 */
function nearSquare(rng: () => number, cells: (Square | null)[], king: number, d: number): number {
  const kr = rowOf(king);
  const kc = colOf(king);
  const cand: number[] = [];
  for (let r = Math.max(0, kr - d); r <= Math.min(SIZE - 1, kr + d); r++) {
    for (let c = Math.max(0, kc - d); c <= Math.min(SIZE - 1, kc + d); c++) {
      const i = indexOf(r, c);
      if (!cells[i]) cand.push(i);
    }
  }
  return cand.length === 0 ? -1 : pick(rng, cand);
}

/** 盤上の駒の置き方として正しいか（行き所のない駒・二歩・駒の数） */
export function isValidPosition(board: Board): boolean {
  if (!piecesWithinLimits(board)) return false;
  if (kingSquare(board, 'D') < 0) return false;
  const pawnCols = { A: new Set<number>(), D: new Set<number>() };
  for (let i = 0; i < CELLS; i++) {
    const s = board.cells[i];
    if (!s) continue;
    if (s.piece === 'K' && s.side === 'A') return false;
    if (isDeadSquare(s.piece, i, s.side)) return false;
    if (s.piece === 'P') {
      if (pawnCols[s.side].has(colOf(i))) return false;
      pawnCols[s.side].add(colOf(i));
    }
  }
  return true;
}

/**
 * 王手が「離れた走り駒（飛・角・香、龍・馬の走り）」によるものか。
 * 生成ではこの王手を作意に入れない（合駒・無駄合いを出さない。ルール 6）
 */
export function isDistantSliderCheck(board: Board): boolean {
  const k = kingSquare(board, 'D');
  if (k < 0) return false;
  return attackersOf(board.cells, k, 'A').some(
    (a) => Math.max(Math.abs(rowOf(a) - rowOf(k)), Math.abs(colOf(a) - colOf(k))) >= 2 && baseOf(board.cells[a]!.piece) !== 'N',
  );
}

/** ランダムな局面を 1 つ作る（検証はしない） */
function randomPosition(rng: () => number, moves: 1 | 3): Board {
  const cells: (Square | null)[] = new Array(CELLS).fill(null);
  const king = indexOf(randInt(rng, 0, 2), randInt(rng, 0, SIZE - 1));
  cells[king] = { piece: 'K', side: 'D' };
  const nAttackers = randInt(rng, 2, moves === 1 ? 3 : 4);
  for (let k = 0; k < nAttackers; k++) {
    const i = nearSquare(rng, cells, king, moves === 1 ? 2 : 3);
    if (i < 0) break;
    cells[i] = { piece: pick(rng, ATTACKER_POOL), side: 'A' };
  }
  const nGuards = randInt(rng, 0, 2);
  for (let k = 0; k < nGuards; k++) {
    const i = nearSquare(rng, cells, king, 1);
    if (i < 0) break;
    cells[i] = { piece: pick(rng, DEFENDER_GUARDS), side: 'D' };
  }
  const hand = emptyHand();
  const nHand = randInt(rng, 1, 2);
  for (let k = 0; k < nHand; k++) hand[pick(rng, HAND_POOL)]++;
  return makeBoard(cells, hand);
}

/** 問題としての条件（唯一解・手数ちょうど・合駒なし）を満たせば作意を返す */
export function verify(board: Board, moves: 1 | 3): Move[] | null {
  if (!isValidPosition(board)) return null;
  if (isCheck(board, 'D')) return null;
  const one = solve(board, 1).solutions;
  if (moves === 1) {
    if (one.length !== 1) return null;
    if (isDistantSliderCheck(applyAs(board, one[0][0], 'A'))) return null;
    return one[0];
  }
  if (one.length !== 0) return null;
  // solve(board, 3) と同じ数え方だが、2 本目の作意が見つかった時点で打ち切る（生成の速さのため）
  let found: Move | null = null;
  for (const m of checkingMoves(board)) {
    const after = applyAs(board, m, 'A');
    if (defenderMoves(after).every((r) => mateInOne(applyAs(after, r, 'D')) !== null)) {
      if (found) return null;
      found = m;
    }
  }
  if (!found) return null;
  const m1 = found;
  const b1 = applyAs(board, m1, 'A');
  const reply = defenderReply(b1);
  if (isDistantSliderCheck(b1)) return null;
  // 3 手目も合駒の利かない詰みにする（玉方のどの応手に対しても。作意の応手だけでなく）。
  // 作意の 3 手目は、離れた走り駒でない詰みのうち最初のもの
  let close: Move | null = null;
  for (const r of defenderMoves(b1)) {
    const b2 = applyAs(b1, r, 'D');
    const mates = checkingMoves(b2).filter((m) => isMate(applyAs(b2, m, 'A')));
    const near = mates.find((m) => !isDistantSliderCheck(applyAs(b2, m, 'A')));
    if (!near) return null;
    if (sameMove(r, reply)) close = near;
  }
  return close ? [m1, reply, close] : null;
}

/** 1 つの種から問題を作る。上限まで試して見つからなければ null */
function tryGenerate(seed: number, moves: 1 | 3): Problem | null {
  const rng = mulberry32(seed);
  for (let attempt = 0; attempt < MAX_ATTEMPTS[moves]; attempt++) {
    const board = randomPosition(rng, moves);
    const solution = verify(board, moves);
    if (solution) return { board, moves, solution, seed };
  }
  return null;
}

/** 種から問題を作る。上限で打ち切ったら種を 1 つ進めて続ける（同じ種からは必ず同じ問題） */
export function generateFromSeed(seed: number, moves: 1 | 3): Problem {
  for (let k = 0; k < MAX_SEEDS; k++) {
    const p = tryGenerate((seed + k) | 0, moves);
    if (p) return p;
  }
  throw new Error('問題を作れませんでした');
}

/** 唯一解・手数ちょうど・合駒なし になるまで再抽選する */
export function generate(rng: () => number, moves: 1 | 3): Problem {
  return generateFromSeed(Math.floor(rng() * 0x100000000) | 0, moves);
}

/** 今日の 1 問（3 手詰・全員同じ）。端末のローカル日付（`localDateKey`）から作る */
export function dailyProblem(key: DateKey): Problem {
  return generateFromSeed(dailySeed(key, DAILY_GENERATOR_VERSION), 3);
}

/** 指せない理由の 1 行（UI 用） */
export const ILLEGAL_MESSAGE: Record<IllegalReason, string> = {
  uchifuzume: '打ち歩詰めです。歩を打って詰ますことはできません。',
  nifu: '二歩です。同じ筋に歩は2枚置けません。',
  'dead-piece': 'その駒はそこへは置けません（行き所のない駒）。',
  'self-check': 'その手は指せません。',
  'not-a-move': 'その手は指せません。',
};
