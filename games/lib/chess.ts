/**
 * チェスのロジック（純関数のみ）。
 *
 * 仕様: docs/features/game-chess.md
 *
 * ## 盤の持ち方
 *
 * 64 マスの配列（`Int8Array`）。添字は `row * 8 + col` で、**row 0 が 8 段目（黒の陣）**、
 * col 0 が a 筋。画面の上から下へ並べた順なので、白番の盤はそのまま描ける。
 * 駒は白が正（1 ポーン・2 ナイト・3 ビショップ・4 ルーク・5 クイーン・6 キング）、黒が負。
 *
 * ## 決定性
 *
 * 乱数はすべて引数で受け取る（`Math.random` を直に呼ばない）。今日の 1 手詰めの生成は
 * 時間による打ち切りを使わない（端末の速さで局面が変わってしまうため）。
 */

import { mulberry32 } from './daily';
import { FALLBACK_PUZZLES } from './chess-puzzles';

// ---------------------------------------------------------------- 型と定数

export type Color = 'w' | 'b';

export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

/** プロモーションで選べる駒（クイーン・ルーク・ビショップ・ナイトの順） */
export const PROMO_PIECES = [QUEEN, ROOK, BISHOP, KNIGHT] as const;
export type PromoPiece = (typeof PROMO_PIECES)[number];

/** キャスリング権のビット */
const WK = 1;
const WQ = 2;
const BK = 4;
const BQ = 8;

/** 指し手の印 */
export const FLAG_CAPTURE = 1;
export const FLAG_EP = 2;
export const FLAG_CASTLE = 4;
export const FLAG_DOUBLE = 8;
export const FLAG_PROMO = 16;

export interface ChessState {
  /** 64 マス。row 0 が 8 段目 */
  readonly board: Int8Array;
  readonly turn: Color;
  /** キャスリング権（WK=1・WQ=2・BK=4・BQ=8） */
  readonly castling: number;
  /** アンパッサンで取れる行き先のマス（直前に 2 マス進んだポーンの通過マス）。無ければ -1 */
  readonly ep: number;
  /** 50 手ルールの数（ポーンの移動・取りで 0 に戻る。半手で数える） */
  readonly halfmove: number;
  /** 手数（黒が指すと 1 増える） */
  readonly fullmove: number;
}

export interface Move {
  from: number;
  to: number;
  /** 動かした駒（符号つき） */
  piece: number;
  /** 取った駒（符号つき。無ければ 0）。アンパッサンでも入る */
  captured: number;
  /** 成った駒の種類（2〜5）。成らなければ 0 */
  promo: number;
  flags: number;
}

export type Status =
  | 'play'
  | 'check'
  | 'checkmate'
  | 'stalemate'
  | 'draw-repetition'
  | 'draw-50'
  | 'draw-material';

export type Level = 'easy' | 'normal' | 'hard';

export const LEVELS: Record<Level, { label: string }> = {
  easy: { label: 'かんたん' },
  normal: { label: 'ふつう' },
  hard: { label: 'つよい' },
};

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// ---------------------------------------------------------------- マスの名前

export const rowOf = (sq: number) => sq >> 3;
export const colOf = (sq: number) => sq & 7;

/** `e4` などの名前 */
export function squareName(sq: number): string {
  return 'abcdefgh'[colOf(sq)] + String(8 - rowOf(sq));
}

/** `e4` → 添字。読めなければ -1 */
export function parseSquare(name: string): number {
  if (!/^[a-h][1-8]$/.test(name)) return -1;
  return (8 - Number(name[1])) * 8 + (name.charCodeAt(0) - 97);
}

export const colorOf = (piece: number): Color => (piece > 0 ? 'w' : 'b');
export const opposite = (c: Color): Color => (c === 'w' ? 'b' : 'w');

// ---------------------------------------------------------------- 行き先の表（起動時に1回だけ作る）

function targetsFrom(deltas: readonly [number, number][]): number[][] {
  const out: number[][] = [];
  for (let sq = 0; sq < 64; sq++) {
    const r = rowOf(sq);
    const c = colOf(sq);
    const list: number[] = [];
    for (const [dr, dc] of deltas) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) list.push(nr * 8 + nc);
    }
    out.push(list);
  }
  return out;
}

const KNIGHT_TARGETS = targetsFrom([
  [-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1],
]);
const KING_TARGETS = targetsFrom([
  [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1],
]);

const ORTHO: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAG: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

/** RAYS[sq] = 向きごとのマスの並び（近い順） */
function raysFrom(dirs: [number, number][]): number[][][] {
  const out: number[][][] = [];
  for (let sq = 0; sq < 64; sq++) {
    const list: number[][] = [];
    for (const [dr, dc] of dirs) {
      const ray: number[] = [];
      let r = rowOf(sq) + dr;
      let c = colOf(sq) + dc;
      while (r >= 0 && r < 8 && c >= 0 && c < 8) {
        ray.push(r * 8 + c);
        r += dr;
        c += dc;
      }
      list.push(ray);
    }
    out.push(list);
  }
  return out;
}

const ORTHO_RAYS = raysFrom(ORTHO);
const DIAG_RAYS = raysFrom(DIAG);

// ---------------------------------------------------------------- FEN

const FEN_PIECES = ' pnbrqk';

export function fromFen(fen: string): ChessState {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) throw new Error(`FEN が読めません: ${fen}`);
  const rows = parts[0].split('/');
  if (rows.length !== 8) throw new Error(`FEN の段が 8 つではありません: ${fen}`);
  const board = new Int8Array(64);
  rows.forEach((row, r) => {
    let c = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        c += Number(ch);
      } else {
        const kind = FEN_PIECES.indexOf(ch.toLowerCase());
        if (kind <= 0 || c > 7) throw new Error(`FEN の駒が読めません: ${fen}`);
        board[r * 8 + c] = ch === ch.toUpperCase() ? kind : -kind;
        c++;
      }
    }
    if (c !== 8) throw new Error(`FEN の段の長さが 8 ではありません: ${fen}`);
  });
  const turn = parts[1] === 'b' ? 'b' : 'w';
  let castling = 0;
  if (parts[2].includes('K')) castling |= WK;
  if (parts[2].includes('Q')) castling |= WQ;
  if (parts[2].includes('k')) castling |= BK;
  if (parts[2].includes('q')) castling |= BQ;
  const ep = parts[3] === '-' ? -1 : parseSquare(parts[3]);
  return {
    board,
    turn,
    castling,
    ep,
    halfmove: Number(parts[4] ?? 0) || 0,
    fullmove: Number(parts[5] ?? 1) || 1,
  };
}

function placementOf(board: Int8Array): string {
  const rows: string[] = [];
  for (let r = 0; r < 8; r++) {
    let row = '';
    let empty = 0;
    for (let c = 0; c < 8; c++) {
      const p = board[r * 8 + c];
      if (p === 0) {
        empty++;
        continue;
      }
      if (empty) row += String(empty);
      empty = 0;
      const ch = FEN_PIECES[Math.abs(p)];
      row += p > 0 ? ch.toUpperCase() : ch;
    }
    if (empty) row += String(empty);
    rows.push(row);
  }
  return rows.join('/');
}

function castlingText(castling: number): string {
  const s = (castling & WK ? 'K' : '') + (castling & WQ ? 'Q' : '') + (castling & BK ? 'k' : '') + (castling & BQ ? 'q' : '');
  return s || '-';
}

export function toFen(state: ChessState): string {
  return [
    placementOf(state.board),
    state.turn,
    castlingText(state.castling),
    state.ep < 0 ? '-' : squareName(state.ep),
    String(state.halfmove),
    String(state.fullmove),
  ].join(' ');
}

export function initialState(): ChessState {
  return fromFen(START_FEN);
}

// ---------------------------------------------------------------- 攻撃の判定

/** `sq` が `by` 側の駒に当たっているか */
export function isAttacked(board: Int8Array, sq: number, by: Color): boolean {
  const s = by === 'w' ? 1 : -1;
  const r = rowOf(sq);
  const c = colOf(sq);
  // ポーン：白は上（row が小さいほう）へ進むので、sq を攻めている白ポーンは 1 段下にいる
  const pr = by === 'w' ? r + 1 : r - 1;
  if (pr >= 0 && pr < 8) {
    if (c > 0 && board[pr * 8 + c - 1] === s * PAWN) return true;
    if (c < 7 && board[pr * 8 + c + 1] === s * PAWN) return true;
  }
  for (const t of KNIGHT_TARGETS[sq]) if (board[t] === s * KNIGHT) return true;
  for (const t of KING_TARGETS[sq]) if (board[t] === s * KING) return true;
  for (const ray of ORTHO_RAYS[sq]) {
    for (const t of ray) {
      const p = board[t];
      if (p === 0) continue;
      if (p === s * ROOK || p === s * QUEEN) return true;
      break;
    }
  }
  for (const ray of DIAG_RAYS[sq]) {
    for (const t of ray) {
      const p = board[t];
      if (p === 0) continue;
      if (p === s * BISHOP || p === s * QUEEN) return true;
      break;
    }
  }
  return false;
}

function kingSquare(board: Int8Array, color: Color): number {
  const k = color === 'w' ? KING : -KING;
  for (let i = 0; i < 64; i++) if (board[i] === k) return i;
  return -1;
}

/** 手番側がチェックされているか */
export function inCheck(state: ChessState): boolean {
  const k = kingSquare(state.board, state.turn);
  return k >= 0 && isAttacked(state.board, k, opposite(state.turn));
}

// ---------------------------------------------------------------- 指し手の生成

function push(list: Move[], from: number, to: number, piece: number, captured: number, flags: number) {
  list.push({ from, to, piece, captured, promo: 0, flags });
}

function pushPawn(list: Move[], from: number, to: number, piece: number, captured: number, flags: number) {
  const r = rowOf(to);
  if (r === 0 || r === 7) {
    for (const promo of PROMO_PIECES) {
      list.push({ from, to, piece, captured, promo, flags: flags | FLAG_PROMO });
    }
  } else {
    push(list, from, to, piece, captured, flags);
  }
}

/** 疑似合法手（自分のキングが取られる手を含む）。`capturesOnly` は静止探索用 */
function pseudoMoves(state: ChessState, capturesOnly = false): Move[] {
  const { board, turn } = state;
  const s = turn === 'w' ? 1 : -1;
  const list: Move[] = [];
  for (let from = 0; from < 64; from++) {
    const p = board[from];
    if (p === 0 || (p > 0) !== (s > 0)) continue;
    const kind = p * s;
    const r = rowOf(from);
    const c = colOf(from);
    if (kind === PAWN) {
      const dir = -s; // 白は row が減る向き
      const nr = r + dir;
      if (nr < 0 || nr > 7) continue;
      const one = nr * 8 + c;
      if (!capturesOnly || nr === 0 || nr === 7) {
        if (board[one] === 0) {
          pushPawn(list, from, one, p, 0, 0);
          const startRow = s > 0 ? 6 : 1;
          if (!capturesOnly && r === startRow && board[one + dir * 8] === 0) {
            push(list, from, one + dir * 8, p, 0, FLAG_DOUBLE);
          }
        }
      }
      for (const dc of [-1, 1]) {
        const nc = c + dc;
        if (nc < 0 || nc > 7) continue;
        const to = nr * 8 + nc;
        const t = board[to];
        if (t !== 0 && (t > 0) !== (s > 0)) {
          pushPawn(list, from, to, p, t, FLAG_CAPTURE);
        } else if (to === state.ep && t === 0) {
          push(list, from, to, p, -s * PAWN, FLAG_CAPTURE | FLAG_EP);
        }
      }
      continue;
    }
    if (kind === KNIGHT || kind === KING) {
      const table = kind === KNIGHT ? KNIGHT_TARGETS : KING_TARGETS;
      for (const to of table[from]) {
        const t = board[to];
        if (t === 0) {
          if (!capturesOnly) push(list, from, to, p, 0, 0);
        } else if ((t > 0) !== (s > 0)) {
          push(list, from, to, p, t, FLAG_CAPTURE);
        }
      }
      if (kind === KING && !capturesOnly) castleMoves(state, from, p, list);
      continue;
    }
    const rays: number[][] = [];
    if (kind === ROOK || kind === QUEEN) rays.push(...ORTHO_RAYS[from]);
    if (kind === BISHOP || kind === QUEEN) rays.push(...DIAG_RAYS[from]);
    for (const ray of rays) {
      for (const to of ray) {
        const t = board[to];
        if (t === 0) {
          if (!capturesOnly) push(list, from, to, p, 0, 0);
          continue;
        }
        if ((t > 0) !== (s > 0)) push(list, from, to, p, t, FLAG_CAPTURE);
        break;
      }
    }
  }
  return list;
}

/**
 * キャスリング。条件：キングとルークが未移動（キャスリング権）・間が空いている・
 * チェック中でない・キングが通るマスと着地マスが攻撃されていない
 */
function castleMoves(state: ChessState, from: number, piece: number, list: Move[]) {
  const { board, turn, castling } = state;
  const white = turn === 'w';
  const home = white ? 60 : 4; // e1 / e8
  if (from !== home) return;
  const enemy = opposite(turn);
  const rook = white ? ROOK : -ROOK;
  const kingSide = white ? WK : BK;
  const queenSide = white ? WQ : BQ;
  if (!(castling & (kingSide | queenSide))) return;
  if (isAttacked(board, home, enemy)) return;
  if (
    castling & kingSide &&
    board[home + 1] === 0 &&
    board[home + 2] === 0 &&
    board[home + 3] === rook &&
    !isAttacked(board, home + 1, enemy) &&
    !isAttacked(board, home + 2, enemy)
  ) {
    push(list, home, home + 2, piece, 0, FLAG_CASTLE);
  }
  if (
    castling & queenSide &&
    board[home - 1] === 0 &&
    board[home - 2] === 0 &&
    board[home - 3] === 0 &&
    board[home - 4] === rook &&
    !isAttacked(board, home - 1, enemy) &&
    !isAttacked(board, home - 2, enemy)
  ) {
    push(list, home, home - 2, piece, 0, FLAG_CASTLE);
  }
}

/** キャスリング権を消すマス（キング・ルークの初期位置） */
function castleMask(sq: number): number {
  switch (sq) {
    case 60:
      return WK | WQ;
    case 63:
      return WK;
    case 56:
      return WQ;
    case 4:
      return BK | BQ;
    case 7:
      return BK;
    case 0:
      return BQ;
    default:
      return 0;
  }
}

/**
 * 1 手指した新しい状態を返す（元は書き換えない）。
 * 合法かどうかは見ない（`legalMoves` が返した手を渡すこと）
 */
export function applyMove(state: ChessState, move: Move): ChessState {
  const board = state.board.slice();
  const s = state.turn === 'w' ? 1 : -1;
  board[move.from] = 0;
  board[move.to] = move.promo ? move.promo * s : move.piece;
  if (move.flags & FLAG_EP) {
    // 取られるポーンは行き先の 1 段うしろ（自分から見て）にいる
    board[move.to + s * 8] = 0;
  }
  if (move.flags & FLAG_CASTLE) {
    if (move.to > move.from) {
      board[move.from + 1] = board[move.from + 3];
      board[move.from + 3] = 0;
    } else {
      board[move.from - 1] = board[move.from - 4];
      board[move.from - 4] = 0;
    }
  }
  const castling = state.castling & ~castleMask(move.from) & ~castleMask(move.to);
  const ep = move.flags & FLAG_DOUBLE ? (move.from + move.to) / 2 : -1;
  const reset = Math.abs(move.piece) === PAWN || move.captured !== 0;
  return {
    board,
    turn: opposite(state.turn),
    castling,
    ep,
    halfmove: reset ? 0 : state.halfmove + 1,
    fullmove: state.turn === 'b' ? state.fullmove + 1 : state.fullmove,
  };
}

/** 指したあと自分のキングが取られないか */
function leavesKingSafe(state: ChessState, move: Move): ChessState | null {
  const next = applyMove(state, move);
  const k = Math.abs(move.piece) === KING ? move.to : kingSquare(next.board, state.turn);
  if (k >= 0 && isAttacked(next.board, k, next.turn)) return null;
  return next;
}

/** 合法手の一覧 */
export function legalMoves(state: ChessState): Move[] {
  return pseudoMoves(state).filter((m) => leavesKingSafe(state, m) !== null);
}

/** 合法手が 1 つでもあるか（全部作らずに早く抜ける） */
export function hasLegalMove(state: ChessState): boolean {
  for (const m of pseudoMoves(state)) if (leavesKingSafe(state, m)) return true;
  return false;
}

/** 合法手の数を総当たりで数える（指し手生成の検証用。chessprogramming wiki の Perft Results と比べる） */
export function perft(state: ChessState, depth: number): number {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of pseudoMoves(state)) {
    const next = leavesKingSafe(state, m);
    if (!next) continue;
    n += depth === 1 ? 1 : perft(next, depth - 1);
  }
  return n;
}

/** 同じ手か（from・to・成り駒が同じ） */
export function sameMove(a: Pick<Move, 'from' | 'to' | 'promo'>, b: Pick<Move, 'from' | 'to' | 'promo'>): boolean {
  return a.from === b.from && a.to === b.to && (a.promo || 0) === (b.promo || 0);
}

// ---------------------------------------------------------------- 終局の判定

/**
 * 同一局面のキー（FEN の前 4 項目）。
 *
 * **アンパッサンのマスは、実際にアンパッサンで取れる合法手があるときだけ入れる**
 * （FIDE 競技規則 9.2。2 マス進んだだけで入れると、同じ局面を別のものと数えてしまう）
 */
export function positionKey(state: ChessState): string {
  let ep = '-';
  if (state.ep >= 0) {
    const canTake = legalMoves(state).some((m) => m.flags & FLAG_EP);
    if (canTake) ep = squareName(state.ep);
  }
  return `${placementOf(state.board)} ${state.turn} ${castlingText(state.castling)} ${ep}`;
}

/** 駒不足（どちらもチェックメイトにできない）：K 対 K、K+B 対 K、K+N 対 K、ビショップが全部同じ色のマス */
export function insufficientMaterial(board: Int8Array): boolean {
  let knights = 0;
  const bishopColors = new Set<number>();
  let bishops = 0;
  for (let sq = 0; sq < 64; sq++) {
    const kind = Math.abs(board[sq]);
    if (kind === 0 || kind === KING) continue;
    if (kind === KNIGHT) knights++;
    else if (kind === BISHOP) {
      bishops++;
      bishopColors.add((rowOf(sq) + colOf(sq)) & 1);
    } else return false; // ポーン・ルーク・クイーンが残っていれば詰ませられる
  }
  if (knights === 0 && bishops === 0) return true;
  if (knights === 1 && bishops === 0) return true;
  if (knights === 0 && bishopColors.size === 1) return true;
  return false;
}

/**
 * 局面の状態。
 *
 * `history` はこれまでに現れた局面のキー（`positionKey`）の並びで、**いまの局面を含む**。
 * 3 回目が現れたら引き分け。チェックメイトは 50 手・同一局面より優先する
 */
export function status(state: ChessState, history: readonly string[] = []): Status {
  const check = inCheck(state);
  if (!hasLegalMove(state)) return check ? 'checkmate' : 'stalemate';
  if (insufficientMaterial(state.board)) return 'draw-material';
  if (history.length >= 3) {
    const key = positionKey(state);
    let n = 0;
    for (const k of history) if (k === key) n++;
    if (n >= 3) return 'draw-repetition';
  }
  if (state.halfmove >= 100) return 'draw-50';
  return check ? 'check' : 'play';
}

export function isOver(s: Status): boolean {
  return s !== 'play' && s !== 'check';
}

// ---------------------------------------------------------------- 表記（SAN）

const SAN_LETTER = ['', '', 'N', 'B', 'R', 'Q', 'K'];

/** 画面とヒントの表記（`Nf3`・`exd5`・`O-O`・`e8=Q+`） */
export function toSan(state: ChessState, move: Move, legal: Move[] = legalMoves(state)): string {
  let san: string;
  const kind = Math.abs(move.piece);
  if (move.flags & FLAG_CASTLE) {
    san = move.to > move.from ? 'O-O' : 'O-O-O';
  } else if (kind === PAWN) {
    san = move.captured ? `${'abcdefgh'[colOf(move.from)]}x${squareName(move.to)}` : squareName(move.to);
    if (move.promo) san += `=${SAN_LETTER[move.promo]}`;
  } else {
    const rivals = legal.filter(
      (m) => m.piece === move.piece && m.to === move.to && m.from !== move.from,
    );
    let dis = '';
    if (rivals.length > 0) {
      const sameFile = rivals.some((m) => colOf(m.from) === colOf(move.from));
      const sameRank = rivals.some((m) => rowOf(m.from) === rowOf(move.from));
      if (!sameFile) dis = 'abcdefgh'[colOf(move.from)];
      else if (!sameRank) dis = String(8 - rowOf(move.from));
      else dis = squareName(move.from);
    }
    san = SAN_LETTER[kind] + dis + (move.captured ? 'x' : '') + squareName(move.to);
  }
  const next = applyMove(state, move);
  if (inCheck(next)) san += hasLegalMove(next) ? '+' : '#';
  return san;
}

// ---------------------------------------------------------------- 評価

/** 駒の価値（仕様書のとおり P100・N320・B330・R500・Q900） */
export const PIECE_VALUE = [0, 100, 320, 330, 500, 900, 0];

/**
 * 駒ごとのマスの表（白から見た値。row 0 が 8 段目）。
 * **自作の値**：中央を高く、端を低くするという一般的な考えだけを使って手で決めた。
 * 他のエンジンの表は写していない
 */
function table(fn: (r: number, c: number) => number): number[] {
  const out: number[] = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) out.push(Math.round(fn(r, c)));
  return out;
}
/** 中央からの近さ（0〜3） */
const center = (r: number, c: number) => 3 - Math.max(Math.abs(r - 3.5), Math.abs(c - 3.5)) + 0.5;

const PST: number[][] = [
  [],
  // ポーン：進むほど少し良い。中央の 2 筋は早めに出す
  table((r, c) => (r === 0 || r === 7 ? 0 : (6 - r) * 6 + (c === 3 || c === 4 ? (r <= 4 ? 12 : 0) : 0))),
  // ナイト：中央ほど良い、端は大きく損
  table((r, c) => center(r, c) * 12 - 25),
  // ビショップ：中央寄りが少し良い
  table((r, c) => center(r, c) * 6 - 10),
  // ルーク：7 段目（相手の 2 段目）が良い
  table((r, c) => (r === 1 ? 15 : 0) + (c === 3 || c === 4 ? 4 : 0)),
  // クイーン：中央寄りがわずかに良い
  table((r, c) => center(r, c) * 3 - 5),
  // キング：序中盤は自陣の隅（キャスリングした位置）が良い
  table((r, c) => (r === 7 ? (c === 1 || c === 2 || c === 6 ? 25 : c === 4 ? 5 : 0) : -10 * (7 - r))),
];

/** 終盤のキング：中央へ出る */
const KING_END = table((r, c) => center(r, c) * 10 - 15);

/** 手番側から見た評価（センチポーン） */
export function evaluate(state: ChessState): number {
  const { board } = state;
  let score = 0;
  let heavy = 0;
  for (let sq = 0; sq < 64; sq++) {
    const kind = Math.abs(board[sq]);
    if (kind === QUEEN) heavy += 2;
    else if (kind === ROOK) heavy += 1;
    else if (kind === KNIGHT || kind === BISHOP) heavy += 1;
  }
  const endgame = heavy <= 6;
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (p === 0) continue;
    const kind = Math.abs(p);
    // 黒は盤を上下に反転して白の表を引く
    const idx = p > 0 ? sq : (7 - rowOf(sq)) * 8 + colOf(sq);
    const pst = kind === KING && endgame ? KING_END[idx] : PST[kind][idx];
    const v = PIECE_VALUE[kind] + pst;
    score += p > 0 ? v : -v;
  }
  return state.turn === 'w' ? score : -score;
}

// ---------------------------------------------------------------- CPU

const MATE = 100000;

interface SearchCtx {
  now: () => number;
  deadline: number;
  aborted: boolean;
  nodes: number;
  qDepth: number;
}

/** 取り合いを先に読む（取る駒が高く、取る側が安いほど先） */
function orderMoves(moves: Move[], first?: Move | null): Move[] {
  const scored = moves.map((m) => {
    let s = 0;
    if (first && sameMove(m, first)) s = 1e6;
    else if (m.captured) s = 10 * PIECE_VALUE[Math.abs(m.captured)] - PIECE_VALUE[Math.abs(m.piece)] + 1000;
    if (m.promo) s += PIECE_VALUE[m.promo];
    return { m, s };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored.map((x) => x.m);
}

function tick(ctx: SearchCtx) {
  ctx.nodes++;
  if ((ctx.nodes & 255) === 0 && ctx.now() >= ctx.deadline) ctx.aborted = true;
}

/** 静止探索（取りだけを `ctx.qDepth` 手まで） */
function quiesce(state: ChessState, alpha: number, beta: number, qLeft: number, ctx: SearchCtx): number {
  tick(ctx);
  const stand = evaluate(state);
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  if (qLeft <= 0 || ctx.aborted) return alpha;
  for (const m of orderMoves(pseudoMoves(state, true))) {
    if (!m.captured && !m.promo) continue;
    const next = leavesKingSafe(state, m);
    if (!next) continue;
    const v = -quiesce(next, -beta, -alpha, qLeft - 1, ctx);
    if (ctx.aborted) return alpha;
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function negamax(state: ChessState, depth: number, alpha: number, beta: number, ply: number, ctx: SearchCtx): number {
  tick(ctx);
  if (ctx.aborted) return 0;
  if (state.halfmove >= 100) return 0;
  if (depth <= 0) return quiesce(state, alpha, beta, ctx.qDepth, ctx);
  let any = false;
  let best = -Infinity;
  for (const m of orderMoves(pseudoMoves(state))) {
    const next = leavesKingSafe(state, m);
    if (!next) continue;
    any = true;
    const v = -negamax(next, depth - 1, -beta, -alpha, ply + 1, ctx);
    if (ctx.aborted) return 0;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  if (!any) return inCheck(state) ? -MATE + ply : 0;
  return best;
}

/** 根の探索。手ごとの値を返す */
function searchRoot(
  state: ChessState,
  moves: Move[],
  depth: number,
  ctx: SearchCtx,
  first: Move | null,
): { move: Move; score: number } | null {
  let alpha = -Infinity;
  let best: Move | null = null;
  for (const m of orderMoves(moves, first)) {
    const next = applyMove(state, m);
    const v = -negamax(next, depth - 1, -Infinity, -alpha, 1, ctx);
    if (ctx.aborted) return null;
    if (best === null || v > alpha) {
      alpha = v;
      best = m;
    }
  }
  return best ? { move: best, score: alpha } : null;
}

/**
 * 初手の候補（定跡のデータは持たない。毎局同じにならないよう、最初の 1 手ずつだけ散らす）。
 * 白：e4・d4・Nf3・c4。黒：白の初手ごとに 2 通り
 */
const WHITE_FIRST = ['e4', 'd4', 'Nf3', 'c4'];
const BLACK_REPLY: Record<string, string[]> = {
  e4: ['e5', 'c5'],
  d4: ['d5', 'Nf6'],
  Nf3: ['d5', 'Nf6'],
  c4: ['e5', 'Nf6'],
};

function openingMove(state: ChessState, rng: () => number): Move | null {
  if (state.fullmove !== 1) return null;
  const legal = legalMoves(state);
  const pick = (names: string[]) => {
    const name = names[Math.floor(rng() * names.length)];
    return legal.find((m) => toSan(state, m, legal) === name) ?? null;
  };
  if (state.turn === 'w') {
    if (toFen(state) !== START_FEN) return null;
    return pick(WHITE_FIRST);
  }
  // 黒の 1 手目：白の初手を盤から見分ける
  const start = initialState();
  for (const name of WHITE_FIRST) {
    const sl = legalMoves(start);
    const m = sl.find((x) => toSan(start, x, sl) === name);
    if (m && placementOf(applyMove(start, m).board) === placementOf(state.board)) {
      return pick(BLACK_REPLY[name]);
    }
  }
  return null;
}

/** 「かんたん」：1 手だけ見る＋乱数。取れる駒があれば 6 割で（いちばん高い駒を）取る。それ以外は無作為 */
function easyMove(state: ChessState, legal: Move[], rng: () => number): Move {
  const captures = legal.filter((m) => m.captured);
  if (captures.length > 0 && rng() < 0.6) {
    let best = captures[0];
    for (const m of captures) {
      if (PIECE_VALUE[Math.abs(m.captured)] > PIECE_VALUE[Math.abs(best.captured)]) best = m;
    }
    return best;
  }
  return legal[Math.floor(rng() * legal.length)];
}

export interface CpuOptions {
  /** 「つよい」の 1 手の持ち時間（ms）。既定 400 */
  deadlineMs?: number;
  /** 読みの深さの上限（テストで時間ではなく深さで打ち切るため） */
  maxDepth?: number;
  /** 時計（テストで差し替える） */
  now?: () => number;
}

const defaultNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * CPU の手。合法手が無ければ null。
 *
 * - `easy`：上の `easyMove`
 * - `normal`：深さ 3 のアルファ・ベータ（静止探索は取りだけ 2 手）
 * - `hard`：反復深化で持ち時間（既定 400ms）まで。静止探索は取りだけ 4 手
 *
 * 乱数を使うのは「かんたん」と最初の 1 手だけ（乱数を固定すれば同じ手を返す）
 */
export function cpuMove(state: ChessState, level: Level, rng: () => number, opts: CpuOptions = {}): Move | null {
  const legal = legalMoves(state);
  if (legal.length === 0) return null;
  // メイト・イン・ワンは必ず指す（「ふつう」「つよい」）
  if (level !== 'easy') {
    const mates = mateInOne(state, legal);
    if (mates.length > 0) return mates[Math.floor(rng() * mates.length)];
  }
  const book = openingMove(state, rng);
  if (book) return book;
  if (level === 'easy') return easyMove(state, legal, rng);

  const now = opts.now ?? defaultNow;
  const ctx: SearchCtx = { now, deadline: Infinity, aborted: false, nodes: 0, qDepth: level === 'hard' ? 4 : 2 };
  const maxDepth = opts.maxDepth ?? (level === 'normal' ? 3 : 64);
  const start = now();
  const budget = level === 'hard' ? (opts.deadlineMs ?? 400) : Infinity;
  let best: { move: Move; score: number } | null = null;
  for (let depth = 1; depth <= maxDepth; depth++) {
    // 深さ 1 は必ず読み切る（打ち切って手が無い、を防ぐ）
    ctx.deadline = depth === 1 ? Infinity : start + budget;
    const r = searchRoot(state, legal, depth, ctx, best?.move ?? null);
    if (!r) break;
    best = r;
    if (Math.abs(r.score) >= MATE - 100) break; // 詰みを見つけたら打ち切る
    if (now() - start >= budget) break;
  }
  return best ? best.move : legal[0];
}

// ---------------------------------------------------------------- 1 手詰め

/** 1 手でチェックメイトになる手の一覧 */
export function mateInOne(state: ChessState, legal: Move[] = legalMoves(state)): Move[] {
  const out: Move[] = [];
  for (const m of legal) {
    const next = applyMove(state, m);
    if (inCheck(next) && !hasLegalMove(next)) out.push(m);
  }
  return out;
}

function pieceCount(board: Int8Array): number {
  let n = 0;
  for (let i = 0; i < 64; i++) if (board[i] !== 0) n++;
  return n;
}

/**
 * 自己対局の乱数の幅（センチポーン）。
 *
 * 評価の差（駒 1 枚 100〜900）より大きくして、**ほとんど無作為に、ただし大きな駒はやや取りにいく**
 * 指し方にしてある。実測（2026-11-01 から 200 日分）で、幅 120 だと予備に落ちる日が 26%、
 * 2000 で 4%、5000 で 2%。上手に指し合うほどキングが固く、1 手詰めの局面が現れにくい
 */
const NOISE = 5000;

/** 自己対局用の軽い指し手選び：深さ 1 の評価＋乱数（静止探索なし・時間を使わない） */
function selfPlayMove(state: ChessState, legal: Move[], rng: () => number): Move {
  let best = legal[0];
  let bestScore = -Infinity;
  for (const m of legal) {
    const next = applyMove(state, m);
    const v = -evaluate(next) + rng() * NOISE;
    if (v > bestScore) {
      bestScore = v;
      best = m;
    }
  }
  return best;
}

/** 問題として使える局面か：メイトの手がちょうど 1 つ・合法手が 15 以上・駒が 8 個以上 */
export function isPuzzle(state: ChessState): boolean {
  if (pieceCount(state.board) < 8) return false;
  const legal = legalMoves(state);
  if (legal.length < 15) return false;
  return mateInOne(state, legal).length === 1;
}

/** 生成の手順の版。**手順を変えたら上げる**（上げないと過去の問題が黙って変わる） */
export const PUZZLE_VERSION = 1;
/** 作り直しの上限 */
export const PUZZLE_TRIES = 10;
/**
 * 問題を探す範囲（半手）。20 半手目から、60 手目（120 半手）まで。
 * 仕様書の「20〜60 手」を、始まりは半手・終わりは手で読んだ範囲（60 半手で打ち切ると
 * 予備に落ちる日が 1 割を超えたため。実測）
 */
const MIN_PLY = 20;
const MAX_PLY = 120;

/** 1 回ぶんの自己対局で問題を探す。見つからなければ null */
function tryPuzzle(rng: () => number): ChessState | null {
  let state = initialState();
  for (let ply = 0; ply < MAX_PLY; ply++) {
    const legal = legalMoves(state);
    if (legal.length === 0 || state.halfmove >= 100) return null;
    if (ply >= MIN_PLY && isPuzzle(state)) return state;
    state = applyMove(state, selfPlayMove(state, legal, rng));
  }
  return isPuzzle(state) ? state : null;
}

export interface Puzzle {
  state: ChessState;
  /** 正解の手（ちょうど 1 つ） */
  answer: Move;
  /** 予備の局面から選んだか */
  fallback: boolean;
}

/**
 * 今日の 1 手詰め。`seed` は `dailySeed(today, PUZZLE_VERSION)`。
 *
 * 同じ seed からは必ず同じ局面が出る（`mulberry32` だけを使い、時刻も `Math.random` も混ぜない）。
 * 作り直しても見つからなければ予備の 30 局面から選ぶ
 */
export function dailyPuzzle(seed: number, fallbacks: readonly string[] = FALLBACK_PUZZLES): Puzzle {
  const rng = mulberry32(seed);
  for (let i = 0; i < PUZZLE_TRIES; i++) {
    const state = tryPuzzle(rng);
    if (state) return { state, answer: mateInOne(state)[0], fallback: false };
  }
  const idx = ((seed % fallbacks.length) + fallbacks.length) % fallbacks.length;
  const state = fromFen(fallbacks[idx]);
  return { state, answer: mateInOne(state)[0], fallback: true };
}

/** 予備の局面を作る道具（`scripts` やテストから使う。ページからは呼ばない） */
export function findPuzzleWith(rng: () => number): ChessState | null {
  return tryPuzzle(rng);
}

// ---------------------------------------------------------------- 終局の記録

export type Outcome = 'win' | 'loss' | 'draw';

/** 終局の状態から、人間（`human` 側）の勝ち負け。チェックメイトは手番側（詰まされた側）の負け */
export function outcomeOf(st: Status, turn: Color, human: Color): Outcome {
  if (st === 'checkmate') return turn === human ? 'loss' : 'win';
  return 'draw';
}

/** 記録の区分（`records.ts` の variant） */
export function recordVariant(level: Level): string {
  return `cpu-${level}`;
}

/** 計測のイベント名。もどしを使った対局は末尾に `-undo` */
export function endEvent(outcome: Outcome, level: Level, undoUsed: boolean): string {
  const word = outcome === 'loss' ? 'lose' : outcome;
  return `${word}-${level}${undoUsed ? '-undo' : ''}`;
}

/**
 * 1 局の終わりを記録に渡す。**「1 手もどす」を 1 回でも使った対局は渡さない**（仕様書）。
 * `finish` は `useRecords().finish`。勝ったときだけ手数（自分の手の数。小さいほど良い）を渡す。
 * 仕様書は「score（手数）」と書いているが、`records.ts` の `score` は大きいほど良いので、
 * 小さいほど良い `moves`（最少手数）に入れる（`records.ts` は改修しない）。
 * 記録に渡したら true
 */
export function settleGame(
  game: { outcome: Outcome; level: Level; undoUsed: boolean; humanMoves: number },
  finish: (result: { outcome: Outcome; moves?: number }, variant: string) => unknown,
): boolean {
  if (game.undoUsed) return false;
  finish(
    game.outcome === 'win' ? { outcome: 'win', moves: game.humanMoves } : { outcome: game.outcome },
    recordVariant(game.level),
  );
  return true;
}
