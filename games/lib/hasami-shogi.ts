/**
 * はさみ将棋のロジック（盤・合法手・取り・勝敗・評価・探索）。
 *
 * 仕様: docs/features/game-hasami-shogi.md
 *
 * すべて純関数。画面（`app/hasami-shogi/Game.tsx`）は入力と描画だけを持つ。
 * 乱数と時計は注入できる形にして、CPU の手と打ち切りをテストで固定できるようにする
 * （リバーシ・五目並べと同じ約束）。
 *
 * 盤の添字は `行 * 9 + 列`。行 0 が上（後手の陣）、行 8 が下（先手の陣）。
 */

export const SIZE = 9;
export const CELLS = SIZE * SIZE;

export const EMPTY = 0;
/** 先手（駒は「歩」） */
export const SENTE = 1;
/** 後手（駒は「と」） */
export const GOTE = -1;

export type Player = typeof SENTE | typeof GOTE;
export type Board = Int8Array;

/** 1 人ぶんの駒の数 */
export const PIECES = SIZE;
/** この手数を指し終えたら打ち切って、取った枚数で決める（ルール 6） */
export const MOVE_LIMIT = 200;
/** 同じ局面（配置と手番）がこの回数出たら引き分け（ルール 7） */
export const REPETITION_LIMIT = 4;

export function opponent(player: Player): Player {
  return player === SENTE ? GOTE : SENTE;
}

export function rowOf(sq: number): number {
  return Math.floor(sq / SIZE);
}

export function colOf(sq: number): number {
  return sq % SIZE;
}

export function indexOf(row: number, col: number): number {
  return row * SIZE + col;
}

function inBoard(row: number, col: number): boolean {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

const DIRS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

export const CORNERS: readonly number[] = [0, SIZE - 1, CELLS - SIZE, CELLS - 1];

/** 隅ごとの、ふさぐ 2 マス */
const CORNER_GUARDS: Readonly<Record<number, readonly [number, number]>> = {
  [CORNERS[0]]: [indexOf(0, 1), indexOf(1, 0)],
  [CORNERS[1]]: [indexOf(0, SIZE - 2), indexOf(1, SIZE - 1)],
  [CORNERS[2]]: [indexOf(SIZE - 2, 0), indexOf(SIZE - 1, 1)],
  [CORNERS[3]]: [indexOf(SIZE - 2, SIZE - 1), indexOf(SIZE - 1, SIZE - 2)],
};

/** 勝ちの枚数（ルール 5） */
export type WinRule = 'five' | 'all' | 'diff3';

export interface Rules {
  /** 隅取り（隅の駒を隣の 2 マスでふさいで取る） */
  corner: boolean;
  win: WinRule;
}

export const DEFAULT_RULES: Rules = { corner: true, win: 'five' };

export const WIN_RULES: Record<WinRule, { label: string }> = {
  five: { label: '5枚' },
  all: { label: '全部' },
  diff3: { label: '3枚差' },
};

export function initialBoard(): Board {
  const board = new Int8Array(CELLS);
  for (let c = 0; c < SIZE; c += 1) {
    board[indexOf(0, c)] = GOTE;
    board[indexOf(SIZE - 1, c)] = SENTE;
  }
  return board;
}

export interface Move {
  from: number;
  to: number;
}

/** その駒が動ける先（縦横に何マスでも。駒は飛び越えない） */
export function destinations(board: Board, from: number): number[] {
  const out: number[] = [];
  const r0 = rowOf(from);
  const c0 = colOf(from);
  for (const [dr, dc] of DIRS) {
    let r = r0 + dr;
    let c = c0 + dc;
    while (inBoard(r, c) && board[indexOf(r, c)] === EMPTY) {
      out.push(indexOf(r, c));
      r += dr;
      c += dc;
    }
  }
  return out;
}

export function legalMoves(board: Board, player: Player): Move[] {
  const out: Move[] = [];
  for (let from = 0; from < CELLS; from += 1) {
    if (board[from] !== player) continue;
    for (const to of destinations(board, from)) out.push({ from, to });
  }
  return out;
}

export interface Capture {
  /** 取られる駒のマス */
  captured: number[];
  /** はさんだ側の駒のマス（動かした駒を含む）。取られた瞬間に光らせる */
  partners: number[];
}

/**
 * `player` の駒が `to` に来た盤で、取れる駒を数える。盤はすでに動かした後のもの。
 *
 * 取りは**動かした駒のまわりだけ**を見る。だから、自分から相手の間に入った駒は
 * 取られない（ルール 4）。盤の端は自分の駒の代わりにならない（ルール 3）。
 */
function capturesAt(board: Board, player: Player, to: number, rules: Rules): Capture {
  const captured: number[] = [];
  const partners: number[] = [];
  const enemy = opponent(player);
  const r0 = rowOf(to);
  const c0 = colOf(to);
  for (const [dr, dc] of DIRS) {
    const line: number[] = [];
    let r = r0 + dr;
    let c = c0 + dc;
    while (inBoard(r, c) && board[indexOf(r, c)] === enemy) {
      line.push(indexOf(r, c));
      r += dr;
      c += dc;
    }
    if (line.length > 0 && inBoard(r, c) && board[indexOf(r, c)] === player) {
      captured.push(...line);
      partners.push(indexOf(r, c));
    }
  }
  if (rules.corner) {
    for (const corner of CORNERS) {
      if (board[corner] !== enemy || captured.includes(corner)) continue;
      const [a, b] = CORNER_GUARDS[corner];
      if ((a === to || b === to) && board[a] === player && board[b] === player) {
        captured.push(corner);
        partners.push(a === to ? b : a);
      }
    }
  }
  if (captured.length > 0) partners.push(to);
  return { captured, partners: [...new Set(partners)] };
}

/** その手で取れる駒（盤は変えない。一時的に動かして、元に戻す） */
export function capturesFor(board: Board, move: Move, rules: Rules): Capture {
  const player = board[move.from] as Player;
  board[move.from] = EMPTY;
  board[move.to] = player;
  const cap = capturesAt(board, player, move.to, rules);
  board[move.to] = EMPTY;
  board[move.from] = player;
  return cap;
}

/**
 * `player` が次に指せる手のうち、相手の駒を取れる手だけを、取れる駒つきで返す。
 *
 * 取れる手は「相手の駒の隣の空きマス」に動く手に限られる（隅取りのふさぎのマスも隅の隣）。
 * 全部の合法手を試すと評価関数が重すぎて「つよい」が 2 手先までしか読めなかったので、
 * 相手の駒の隣の空きマスから縦横に見て、最初に当たった自分の駒だけを試す。
 */
export function capturingMoves(board: Board, player: Player, rules: Rules): (Move & { captured: number[] })[] {
  const enemy = opponent(player);
  const out: (Move & { captured: number[] })[] = [];
  const seen = new Uint8Array(CELLS);
  for (let e = 0; e < CELLS; e += 1) {
    if (board[e] !== enemy) continue;
    const er = rowOf(e);
    const ec = colOf(e);
    for (const [dr, dc] of DIRS) {
      const r = er + dr;
      const c = ec + dc;
      if (!inBoard(r, c)) continue;
      const to = indexOf(r, c);
      if (board[to] !== EMPTY || seen[to]) continue;
      seen[to] = 1;
      for (const [sr, sc] of DIRS) {
        let rr = r + sr;
        let cc = c + sc;
        while (inBoard(rr, cc) && board[indexOf(rr, cc)] === EMPTY) {
          rr += sr;
          cc += sc;
        }
        if (!inBoard(rr, cc) || board[indexOf(rr, cc)] !== player) continue;
        const move = { from: indexOf(rr, cc), to };
        const { captured } = capturesFor(board, move, rules);
        if (captured.length > 0) out.push({ ...move, captured });
      }
    }
  }
  return out;
}

export type EndReason = 'captures' | 'limit' | 'repetition' | 'stuck' | 'resign';

export interface Captured {
  /** 先手が取った枚数 */
  sente: number;
  /** 後手が取った枚数 */
  gote: number;
}

export interface HasamiState {
  board: Board;
  turn: Player;
  /** 指し終えた手数 */
  ply: number;
  captured: Captured;
  /** 局面（配置と手番）ごとの出た回数。千日手の判定に使う */
  seen: Readonly<Record<string, number>>;
  /** 直前の手。画面で動いた駒と取った駒を光らせる */
  last: (Move & Capture) | null;
  finished: boolean;
  /** 勝った側。引き分けは 0。対局中は null */
  winner: Player | 0 | null;
  reason: EndReason | null;
  rules: Rules;
}

/** 千日手の「同じ局面」。駒の配置と手番の両方（取った枚数は配置から決まるので見ない） */
export function positionKey(board: Board, turn: Player): string {
  let s = turn === SENTE ? 's' : 'g';
  for (let i = 0; i < CELLS; i += 1) s += board[i] === SENTE ? 'x' : board[i] === GOTE ? 'o' : '.';
  return s;
}

export function initialState(rules: Rules = DEFAULT_RULES): HasamiState {
  const board = initialBoard();
  return {
    board,
    turn: SENTE,
    ply: 0,
    captured: { sente: 0, gote: 0 },
    seen: { [positionKey(board, SENTE)]: 1 },
    last: null,
    finished: false,
    winner: null,
    reason: null,
    rules,
  };
}

export function capturedBy(captured: Captured, player: Player): number {
  return player === SENTE ? captured.sente : captured.gote;
}

/** 取った枚数だけで勝ちが決まったか（ルール 5） */
export function wonByCaptures(mine: number, theirs: number, win: WinRule): boolean {
  if (win === 'five') return mine >= 5;
  if (win === 'all') return mine >= PIECES;
  return mine - theirs >= 3;
}

/** 取った枚数が多いほうの勝ち・同数なら引き分け（200 手・動けないとき） */
function judgeByCount(captured: Captured): Player | 0 {
  return captured.sente > captured.gote ? SENTE : captured.gote > captured.sente ? GOTE : 0;
}

export function isLegal(state: HasamiState, move: Move): boolean {
  if (state.finished || state.board[move.from] !== state.turn) return false;
  return destinations(state.board, move.from).includes(move.to);
}

/** 1 手指す。指せない手なら局面をそのまま返す */
export function applyMove(state: HasamiState, move: Move): HasamiState {
  if (!isLegal(state, move)) return state;
  const player = state.turn;
  const board = Int8Array.from(state.board);
  board[move.from] = EMPTY;
  board[move.to] = player;
  const cap = capturesAt(board, player, move.to, state.rules);
  for (const sq of cap.captured) board[sq] = EMPTY;

  const captured: Captured = {
    sente: state.captured.sente + (player === SENTE ? cap.captured.length : 0),
    gote: state.captured.gote + (player === GOTE ? cap.captured.length : 0),
  };
  const turn = opponent(player);
  const ply = state.ply + 1;
  const key = positionKey(board, turn);
  const count = (state.seen[key] ?? 0) + 1;
  const next: HasamiState = {
    board,
    turn,
    ply,
    captured,
    seen: { ...state.seen, [key]: count },
    last: { ...move, ...cap },
    finished: false,
    winner: null,
    reason: null,
    rules: state.rules,
  };

  if (wonByCaptures(capturedBy(captured, player), capturedBy(captured, turn), state.rules.win)) {
    return { ...next, finished: true, winner: player, reason: 'captures' };
  }
  if (ply >= MOVE_LIMIT) return { ...next, finished: true, winner: judgeByCount(captured), reason: 'limit' };
  if (count >= REPETITION_LIMIT) return { ...next, finished: true, winner: 0, reason: 'repetition' };
  if (legalMoves(board, turn).length === 0) {
    return { ...next, finished: true, winner: judgeByCount(captured), reason: 'stuck' };
  }
  return next;
}

/** 投了。投了した側の負け */
export function resign(state: HasamiState, player: Player): HasamiState {
  if (state.finished) return state;
  return { ...state, finished: true, winner: opponent(player), reason: 'resign' };
}

/**
 * 「待った」で戻る先（履歴の添字）。自分が最後に指す直前の局面。
 * あいだの CPU の手も一緒に戻る。戻れなければ null
 */
export function undoIndex(history: readonly HasamiState[], human: Player): number | null {
  for (let i = history.length - 2; i >= 0; i -= 1) {
    if (history[i].turn === human && !history[i].finished) return i;
  }
  return null;
}

// ---- 評価と探索 ----

export const LEVELS = {
  easy: { label: 'かんたん' },
  normal: { label: 'ふつう' },
  hard: { label: 'つよい' },
} as const;

export type Level = keyof typeof LEVELS;

/** 取った枚数の差 1 枚あたり */
export const CAPTURE_VALUE = 100;
/** 相手の次の手で取られる自分の駒 1 枚あたり（減点） */
export const THREATENED_VALUE = 30;
/** 相手の駒をはさめる手 1 つあたり */
export const ATTACK_VALUE = 5;

/** つよいの読みの上限 */
export const MAX_DEPTH = 4;
/** つよいの思考時間の上限（ms）。読み終えた最深の結果を指す */
export const DEFAULT_BUDGET_MS = 1000;
/** かんたんで、取れる手を無視してでたらめに指す割合 */
export const EASY_RANDOM_RATE = 0.4;

const WIN_SCORE = 100000;

/** 相手の次の手で取られる `player` の駒のマス */
export function threatened(board: Board, player: Player, rules: Rules): Set<number> {
  const out = new Set<number>();
  for (const m of capturingMoves(board, opponent(player), rules)) for (const sq of m.captured) out.add(sq);
  return out;
}

// 評価関数は探索の末端で何万回も呼ぶので、配列を作らずに数える版を別に持つ
// （`capturingMoves` / `threatened` と同じ数え方。テストで突き合わせている）
const scanSeen = new Uint8Array(CELLS);
const scanMark = new Uint8Array(CELLS);

/** `player` の駒が `to` に来た盤で取れる駒の数。`mark` があれば取れる駒のマスに印をつける */
function countCapturesAt(board: Board, player: Player, to: number, rules: Rules, mark: Uint8Array | null): number {
  const enemy = opponent(player);
  const r0 = rowOf(to);
  const c0 = colOf(to);
  let n = 0;
  for (const [dr, dc] of DIRS) {
    let r = r0 + dr;
    let c = c0 + dc;
    let len = 0;
    while (inBoard(r, c) && board[indexOf(r, c)] === enemy) {
      len += 1;
      r += dr;
      c += dc;
    }
    if (len > 0 && inBoard(r, c) && board[indexOf(r, c)] === player) {
      n += len;
      if (mark) for (let k = 1; k <= len; k += 1) mark[indexOf(r0 + dr * k, c0 + dc * k)] = 1;
    }
  }
  if (rules.corner) {
    for (const corner of CORNERS) {
      if (board[corner] !== enemy) continue;
      const [a, b] = CORNER_GUARDS[corner];
      if ((a === to || b === to) && board[a] === player && board[b] === player) {
        // 縦横のはさみですでに数えた隅は数えない
        if (mark ? !mark[corner] : true) n += 1;
        if (mark) mark[corner] = 1;
      }
    }
  }
  return n;
}

/** `player` の取れる手の数を数え、`mark` に取れる相手の駒の印をつける */
function scanCaptures(board: Board, player: Player, rules: Rules, mark: Uint8Array | null): number {
  const enemy = opponent(player);
  scanSeen.fill(0);
  let moves = 0;
  for (let e = 0; e < CELLS; e += 1) {
    if (board[e] !== enemy) continue;
    const er = rowOf(e);
    const ec = colOf(e);
    for (const [dr, dc] of DIRS) {
      const r = er + dr;
      const c = ec + dc;
      if (!inBoard(r, c)) continue;
      const to = indexOf(r, c);
      if (board[to] !== EMPTY || scanSeen[to]) continue;
      scanSeen[to] = 1;
      for (const [sr, sc] of DIRS) {
        let rr = r + sr;
        let cc = c + sc;
        while (inBoard(rr, cc) && board[indexOf(rr, cc)] === EMPTY) {
          rr += sr;
          cc += sc;
        }
        if (!inBoard(rr, cc)) continue;
        const from = indexOf(rr, cc);
        if (board[from] !== player) continue;
        board[from] = EMPTY;
        board[to] = player;
        const n = countCapturesAt(board, player, to, rules, mark);
        board[to] = EMPTY;
        board[from] = player;
        if (n > 0) moves += 1;
      }
    }
  }
  return moves;
}

/**
 * `player` から見た局面の評価（仕様書の「実装メモ」）：
 * 取った枚数の差 ×100 − はさまれそうな自分の駒 ×30 ＋ 相手の駒をはさめる手の数 ×5
 */
export function evaluate(board: Board, player: Player, captured: Captured, rules: Rules): number {
  const diff = capturedBy(captured, player) - capturedBy(captured, opponent(player));
  scanMark.fill(0);
  scanCaptures(board, opponent(player), rules, scanMark);
  let threats = 0;
  for (let i = 0; i < CELLS; i += 1) threats += scanMark[i];
  const attacks = scanCaptures(board, player, rules, null);
  return diff * CAPTURE_VALUE - threats * THREATENED_VALUE + attacks * ATTACK_VALUE;
}

interface SearchCtx {
  now: () => number;
  deadline: number;
  aborted: boolean;
  nodes: number;
  rules: Rules;
  /** 枝刈りを起こした静かな手（取らない手）の点。取らない手どうしの並べ替えに使う */
  history: Int32Array;
}

const defaultNow = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

function timeUp(ctx: SearchCtx): boolean {
  if (ctx.aborted) return true;
  if ((ctx.nodes & 15) === 0 && ctx.now() >= ctx.deadline) ctx.aborted = true;
  return ctx.aborted;
}

interface Scored {
  move: Move;
  captured: number[];
}

/**
 * 取る手を先に（取る枚数の多い順）並べる。αβの刈りはここでほぼ決まる。
 * 取らない手は、これまでの探索で枝刈りを起こした回数（history）の多い順
 */
function orderedMoves(board: Board, player: Player, rules: Rules, history: Int32Array | null = null): Scored[] {
  const takes = capturingMoves(board, player, rules)
    .sort((a, b) => b.captured.length - a.captured.length)
    .map((m) => ({ move: { from: m.from, to: m.to }, captured: m.captured }));
  const taken = new Set(takes.map((t) => t.move.from * CELLS + t.move.to));
  const quiet = legalMoves(board, player).filter((m) => !taken.has(m.from * CELLS + m.to));
  if (history) quiet.sort((a, b) => history[b.from * CELLS + b.to] - history[a.from * CELLS + a.to]);
  return [...takes, ...quiet.map((move) => ({ move, captured: [] as number[] }))];
}

function addCaptured(captured: Captured, player: Player, n: number): Captured {
  return player === SENTE ? { sente: captured.sente + n, gote: captured.gote } : { sente: captured.sente, gote: captured.gote + n };
}

function make(board: Board, player: Player, s: Scored): void {
  board[s.move.from] = EMPTY;
  board[s.move.to] = player;
  for (const sq of s.captured) board[sq] = EMPTY;
}

function unmake(board: Board, player: Player, s: Scored): void {
  for (const sq of s.captured) board[sq] = opponent(player);
  board[s.move.to] = EMPTY;
  board[s.move.from] = player;
}

/** ネガマックス + αβ。手番非依存なので、CPU が先手でも後手でも同じ関数が動く */
function negamax(
  board: Board,
  player: Player,
  captured: Captured,
  depth: number,
  alpha: number,
  beta: number,
  ctx: SearchCtx,
): number {
  ctx.nodes += 1;
  if (timeUp(ctx)) return 0;
  if (depth === 0) return evaluate(board, player, captured, ctx.rules);

  const moves = orderedMoves(board, player, ctx.rules, ctx.history);
  if (moves.length === 0) {
    const diff = capturedBy(captured, player) - capturedBy(captured, opponent(player));
    return diff > 0 ? WIN_SCORE : diff < 0 ? -WIN_SCORE : 0;
  }

  let best = -Infinity;
  let a = alpha;
  for (const s of moves) {
    const nextCaptured = addCaptured(captured, player, s.captured.length);
    let value: number;
    if (
      s.captured.length > 0 &&
      wonByCaptures(capturedBy(nextCaptured, player), capturedBy(nextCaptured, opponent(player)), ctx.rules.win)
    ) {
      // 早く勝つほうを選ぶように、残りの深さを足す
      value = WIN_SCORE + depth;
    } else {
      make(board, player, s);
      if (best === -Infinity) {
        value = -negamax(board, opponent(player), nextCaptured, depth - 1, -beta, -a, ctx);
      } else {
        // 2 手目からは「最善を超えるか」だけを狭い窓で確かめ、超えたときだけ読み直す（PVS）
        value = -negamax(board, opponent(player), nextCaptured, depth - 1, -a - 1, -a, ctx);
        if (value > a && value < beta && !ctx.aborted) {
          value = -negamax(board, opponent(player), nextCaptured, depth - 1, -beta, -a, ctx);
        }
      }
      unmake(board, player, s);
    }
    if (ctx.aborted) return 0;
    if (value > best) best = value;
    if (best > a) a = best;
    if (a >= beta) {
      if (s.captured.length === 0) ctx.history[s.move.from * CELLS + s.move.to] += depth * depth;
      break;
    }
  }
  return best;
}

function searchAtDepth(
  state: HasamiState,
  moves: readonly Scored[],
  depth: number,
  ctx: SearchCtx,
): { best: Move[]; score: number; scores: number[] } | null {
  const board = Int8Array.from(state.board);
  const player = state.turn;
  let best: Move[] = [];
  let bestScore = -Infinity;
  const scores: number[] = [];
  for (const s of moves) {
    const nextCaptured = addCaptured(state.captured, player, s.captured.length);
    let value: number;
    if (
      s.captured.length > 0 &&
      wonByCaptures(capturedBy(nextCaptured, player), capturedBy(nextCaptured, opponent(player)), ctx.rules.win)
    ) {
      value = WIN_SCORE + depth;
    } else {
      // 窓の上限は最善値より 1 だけ緩める（同点の手に劣る手が混ざらないように。リバーシと同じ）
      const beta = bestScore === -Infinity ? Infinity : -(bestScore - 1);
      make(board, player, s);
      value = -negamax(board, opponent(player), nextCaptured, depth - 1, -Infinity, beta, ctx);
      unmake(board, player, s);
    }
    if (ctx.aborted) return null;
    scores.push(value);
    if (value > bestScore) {
      bestScore = value;
      best = [s.move];
    } else if (value === bestScore) {
      best.push(s.move);
    }
  }
  return { best, score: bestScore, scores };
}

export interface ChooseOptions {
  budgetMs?: number;
  now?: () => number;
  rng?: () => number;
}

export interface SearchResult {
  /** 選んだ手。指せる手が無ければ null */
  move: Move | null;
  /** 読み終えた最深の深さ（かんたんは 1） */
  depth: number;
  nodes: number;
}

export function chooseMove(state: HasamiState, level: Level, opts: ChooseOptions = {}): Move | null {
  return search(state, level, opts).move;
}

/**
 * CPU の手を選ぶ。
 *
 * - かんたん：1 手先だけ見て、いちばん多く取れる手。ただし 4 割はでたらめに指す
 * - ふつう：2 手先（自分の手と相手の応手）まで評価関数で読む
 * - つよい：反復深化で 4 手先まで。時間の上限で打ち切って、読み終えた最深の結果を指す
 */
export function search(state: HasamiState, level: Level, opts: ChooseOptions = {}): SearchResult {
  const rng = opts.rng ?? Math.random;
  if (state.finished) return { move: null, depth: 0, nodes: 0 };
  const moves = orderedMoves(state.board, state.turn, state.rules);
  if (moves.length === 0) return { move: null, depth: 0, nodes: 0 };

  if (level === 'easy') {
    if (rng() < EASY_RANDOM_RATE) return { move: pick(moves, rng).move, depth: 1, nodes: moves.length };
    const most = moves[0].captured.length;
    const best = moves.filter((s) => s.captured.length === most).map((s) => s.move);
    return { move: pick(best, rng), depth: 1, nodes: moves.length };
  }

  const ctx: SearchCtx = {
    now: opts.now ?? defaultNow,
    deadline: Infinity,
    aborted: false,
    nodes: 0,
    rules: state.rules,
    history: new Int32Array(CELLS * CELLS),
  };

  if (level === 'normal') {
    const found = searchAtDepth(state, moves, 2, ctx);
    return { move: found ? pick(found.best, rng) : moves[0].move, depth: 2, nodes: ctx.nodes };
  }

  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const start = ctx.now();
  let result: SearchResult = { move: moves[0].move, depth: 0, nodes: 0 };
  let order: Scored[] = moves;
  for (let depth = 1; depth <= MAX_DEPTH; depth += 1) {
    // 深さ 1 だけは必ず読み終える（時間が 0 でも指せるように）
    ctx.deadline = depth === 1 ? Infinity : start + budgetMs;
    const found = searchAtDepth(state, order, depth, ctx);
    // 打ち切った深さの結果は捨てる（途中までの「最善手」には悪手が混ざる）
    if (!found) break;
    result = { move: pick(found.best, rng), depth, nodes: ctx.nodes };
    // 次の深さは、いまの深さで良かった手から読む（αβがよく刈れる）
    const ranked = order.map((s, i) => ({ s, v: found.scores[i] }));
    ranked.sort((a, b) => b.v - a.v);
    order = ranked.map((r) => r.s);
    // 勝ちを読み切ったら、それ以上読まない
    if (found.score >= WIN_SCORE) break;
  }
  return { ...result, nodes: ctx.nodes };
}
