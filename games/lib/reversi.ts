/**
 * リバーシのロジック（盤面・合法手・裏返し・パス・終局判定・CPU）
 *
 * 「オセロ」は株式会社オセロの登録商標なので、名称には使わない
 * （games/CLAUDE.md の商標の約束 / docs/features/game-reversi.md）。
 * ルール（8×8・挟んで裏返す・打てなければパス）はアイデアであって著作物ではない。
 *
 * 盤面は Int8Array(64)。index = row * 8 + col。
 * ビットボードは使わない（JSで64bitを扱うと BigInt になり、この規模では
 * 速くならないうえ読めなくなる）。外部ライブラリも使わずこのファイルに閉じる。
 */

export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = -1;

/** 1=黒 / -1=白。符号で持つのは、評価も探索も手番非依存（ネガマックス）に書くため */
export type Player = typeof BLACK | typeof WHITE;
export type Board = Int8Array;

export function opponent(player: Player): Player {
  return -player as Player;
}

/** 8方向（行,列の増分）。DIRS・STEPS はこの並びを共有する */
const DELTAS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

/** index の増分。[-9, -8, -7, -1, 1, 7, 8, 9] */
export const DIRS: readonly number[] = DELTAS.map(([dr, dc]) => dr * 8 + dc);

/**
 * STEPS[sq][d] = 方向 d に、盤からはみ出さずに進める最大歩数。
 *
 * 1次元配列のまま `i % 8` で端を判定すると、8方向×走査箇所のどこかで
 * 必ず書き忘れて「盤の右端から左端へ折り返す」バグになる。
 * 歩数を先に配っておけば、走査は `for (s < STEPS[sq][d])` だけで済み、
 * 端の判定そのものが要らなくなる（このゲームで一番出やすいバグを構造で潰す）。
 */
function buildSteps(): Int8Array[] {
  const room = (delta: number, pos: number): number =>
    delta < 0 ? pos : delta > 0 ? 7 - pos : 7;
  const table: Int8Array[] = [];
  for (let sq = 0; sq < 64; sq += 1) {
    const r = sq >> 3;
    const c = sq & 7;
    const row = new Int8Array(8);
    for (let d = 0; d < 8; d += 1) {
      const [dr, dc] = DELTAS[d];
      row[d] = Math.min(room(dr, r), room(dc, c));
    }
    table.push(row);
  }
  return table;
}

/** モジュール読み込み時に1回だけ作る */
export const STEPS: readonly Int8Array[] = buildSteps();

// ---- 盤面 ----

/** 中央4石の初期配置（白 d4・e5、黒 e4・d5）。先手は必ず黒 */
export function initialBoard(): Board {
  const board = new Int8Array(64);
  board[27] = WHITE;
  board[28] = BLACK;
  board[35] = BLACK;
  board[36] = WHITE;
  return board;
}

/**
 * sq に player が打ったときに裏返る石の index。
 * 打てない場所（空きでない・1つも裏返らない）では空配列を返す。
 */
export function flipsAt(board: Board, player: Player, sq: number): number[] {
  if (sq < 0 || sq > 63 || board[sq] !== EMPTY) return [];
  const foe = -player;
  const out: number[] = [];
  for (let d = 0; d < 8; d += 1) {
    const steps = STEPS[sq][d];
    const step = DIRS[d];
    let i = sq;
    let run = 0;
    for (let s = 0; s < steps; s += 1) {
      i += step;
      const v = board[i];
      if (v === foe) {
        run += 1;
        continue;
      }
      // 自分の石で挟めたときだけ、間に挟まった相手の石を裏返す。
      // 空き（EMPTY）に当たった時点でこの方向は打ち切り
      if (v === player && run > 0) {
        for (let k = 1; k <= run; k += 1) out.push(sq + step * k);
      }
      break;
    }
  }
  return out;
}

export function isLegalMove(board: Board, player: Player, sq: number): boolean {
  return flipsAt(board, player, sq).length > 0;
}

/** 合法手の index（昇順） */
export function legalMoves(board: Board, player: Player): number[] {
  const out: number[] = [];
  for (let sq = 0; sq < 64; sq += 1) {
    if (board[sq] === EMPTY && flipsAt(board, player, sq).length > 0) out.push(sq);
  }
  return out;
}

export interface Score {
  black: number;
  white: number;
  empty: number;
}

export function score(board: Board): Score {
  let black = 0;
  let white = 0;
  for (let i = 0; i < 64; i += 1) {
    if (board[i] === BLACK) black += 1;
    else if (board[i] === WHITE) white += 1;
  }
  return { black, white, empty: 64 - black - white };
}

/** 石数の多いほう。同数は 0（引き分け） */
export function leader(board: Board): Player | 0 {
  const { black, white } = score(board);
  if (black > white) return BLACK;
  if (white > black) return WHITE;
  return 0;
}

// ---- 局面 ----

export interface ReversiState {
  board: Board;
  /** 手番。finished のときは意味を持たない */
  turn: Player;
  finished: boolean;
  /** 直前に打たれたマス（盤面のハイライト用）。開始直後は null */
  last: number | null;
  /** 直前の着手のあと、相手が打てずにパスしたか（表示用） */
  passed: boolean;
}

export function initialState(): ReversiState {
  return { board: initialBoard(), turn: BLACK, finished: false, last: null, passed: false };
}

/**
 * sq に着手した次の局面を返す。打てない場所なら元の局面をそのまま返す。
 *
 * パスは自動で処理する。相手に合法手が無く自分にあれば手番は自分のまま
 * （passed=true）、どちらにも無ければ終局。
 * 片方の石が0になった場合も、双方に合法手が無くなるのでここで終局になる。
 */
export function applyMove(state: ReversiState, sq: number): ReversiState {
  if (state.finished) return state;
  const flipped = flipsAt(state.board, state.turn, sq);
  if (flipped.length === 0) return state;

  const board = Int8Array.from(state.board);
  board[sq] = state.turn;
  for (const i of flipped) board[i] = state.turn;

  const foe = opponent(state.turn);
  if (legalMoves(board, foe).length > 0) {
    return { board, turn: foe, finished: false, last: sq, passed: false };
  }
  if (legalMoves(board, state.turn).length > 0) {
    return { board, turn: state.turn, finished: false, last: sq, passed: true };
  }
  return { board, turn: foe, finished: true, last: sq, passed: false };
}

/**
 * 「もどす」の戻り先を履歴（先頭が対局開始、末尾が現在）から探す。
 *
 * 手数は数えない。「1手戻す＝自分とCPUの2手を戻す」は、
 * 自分が白のとき（開始直後はCPUの1手しか指されていない）にも、
 * CPUがパスしたとき（CPUの着手が0手）にも破綻する。パスは普通に起きる。
 *
 * 規則は「直前の『自分が着手できる手番だった局面』まで戻す」。
 * それが無いとき（自分が白で、CPUの初手だけが指された局面など）は対局開始まで戻す。
 * 現在が対局開始そのものなら戻り先は無い（null。ボタンを無効にする）。
 */
export function undoIndex(history: readonly ReversiState[], human: Player): number | null {
  for (let i = history.length - 2; i >= 1; i -= 1) {
    const s = history[i];
    if (!s.finished && s.turn === human && legalMoves(s.board, s.turn).length > 0) return i;
  }
  return history.length >= 2 ? 0 : null;
}

// ---- 評価 ----

/**
 * マス目の重み。角が最大、角の斜め隣（X打ち）が大きな負。
 * 角を渡す手の危険をここで表す。テストから参照できるよう定数にまとめる。
 */
export const SQUARE_VALUE = {
  corner: 120,
  /** 角の斜め隣。ここに打つと角を渡しやすい */
  x: -40,
  /** 角の縦横の隣 */
  c: -20,
  edge: 10,
  inner: 0,
} as const;

/** 着手可能数1手あたりの価値。リバーシで一番効く指標 */
export const MOBILITY_VALUE = 5;
/** 確定石1個あたりの価値 */
export const STABLE_VALUE = 15;

export const CORNERS: readonly number[] = [0, 7, 56, 63];

/** 角の斜め隣（X打ち）のマス。角が空いているうちは大きな負 */
export const X_SQUARES: readonly number[] = [9, 14, 49, 54];

/**
 * 重みテーブルを作る。`filled` に入れた角は「もう埋まっている」ものとして扱い、
 * その角の斜め隣（X）・縦横の隣（C）の減点を外す。
 *
 * X・C の減点は「角を相手に渡してしまう危険」を表したもので、
 * 角が埋まればその危険は無くなる。固定の表のまま減点し続けると、
 * 角を取る手が「X の石を自分のものにする手」として減点され、
 * **角を取れる場面で角を取らなくなる**（素の表では序中盤の4割で見送った）。
 */
function buildWeights(filled: readonly boolean[]): Int16Array {
  const w = new Int16Array(64);
  for (let sq = 0; sq < 64; sq += 1) {
    const r = sq >> 3;
    const c = sq & 7;
    w[sq] = r === 0 || r === 7 || c === 0 || c === 7 ? SQUARE_VALUE.edge : SQUARE_VALUE.inner;
  }
  CORNERS.forEach((corner, k) => {
    const dr = corner >> 3 === 0 ? 1 : -1;
    const dc = (corner & 7) === 0 ? 1 : -1;
    w[corner] = SQUARE_VALUE.corner;
    if (filled[k]) return;
    w[corner + dr * 8] = SQUARE_VALUE.c;
    w[corner + dc] = SQUARE_VALUE.c;
    w[corner + dr * 8 + dc] = SQUARE_VALUE.x;
  });
  return w;
}

/** 角の埋まり方は4隅の16通りしかないので、読み込み時に全部作っておく */
const WEIGHT_TABLES: readonly Int16Array[] = Array.from({ length: 16 }, (_, mask) =>
  buildWeights(CORNERS.map((_c, k) => (mask & (1 << k)) !== 0)),
);

/** 4隅がすべて空いているときの重み。手の並べ替えと表示に使う */
export const WEIGHTS: Readonly<Int16Array> = WEIGHT_TABLES[0];

/** その盤面で使う重みテーブル（埋まっている角の X・C 減点を外したもの） */
export function weightsFor(board: Board): Int16Array {
  let mask = 0;
  for (let k = 0; k < 4; k += 1) {
    if (board[CORNERS[k]] !== EMPTY) mask |= 1 << k;
  }
  return WEIGHT_TABLES[mask];
}

/** 重みテーブルだけの評価。「ふつう」が使う */
export function positionScore(board: Board, player: Player): number {
  const w = weightsFor(board);
  let sum = 0;
  for (let i = 0; i < 64; i += 1) {
    if (board[i] === player) sum += w[i];
    else if (board[i] !== EMPTY) sum -= w[i];
  }
  return sum;
}

/**
 * 確定石（もう裏返らない石）の数。
 * 角から辺沿いに連続して伸びた石だけを数える近似で、終盤に効く。
 * 重みテーブルだけだと辺を取りすぎて負けるので、これで補う。
 */
export function stableCount(board: Board, player: Player): number {
  const stable = new Set<number>();
  const edges: number[][] = [
    [0, 1, 2, 3, 4, 5, 6, 7],
    [56, 57, 58, 59, 60, 61, 62, 63],
    [0, 8, 16, 24, 32, 40, 48, 56],
    [7, 15, 23, 31, 39, 47, 55, 63],
  ];
  for (const line of edges) {
    // 辺の両端（=角）から内側へ、自分の石が続くあいだ数える
    for (const seq of [line, [...line].reverse()]) {
      for (const sq of seq) {
        if (board[sq] !== player) break;
        stable.add(sq);
      }
    }
  }
  return stable.size;
}

export function mobilityScore(board: Board, player: Player): number {
  const mine = legalMoves(board, player).length;
  const theirs = legalMoves(board, opponent(player)).length;
  return (mine - theirs) * MOBILITY_VALUE;
}

/**
 * 「つよい」が使う評価。重みテーブル + 着手可能数 + 確定石の合算。
 *
 * **石の数は入れない。** 序盤〜中盤で石を増やすのはむしろ悪手で、
 * 「石を多く取る＝強い」と評価させると初心者より弱いCPUになる。
 * 石数を見るのは終盤の読み切りに入ってからだけ（discDiff）。
 *
 * 手番非依存: evaluate(b, BLACK) === -evaluate(b, WHITE)。
 */
export function evaluate(board: Board, player: Player): number {
  const stable = stableCount(board, player) - stableCount(board, opponent(player));
  return positionScore(board, player) + mobilityScore(board, player) + stable * STABLE_VALUE;
}

/** 自分の石数 − 相手の石数。終盤の読み切りだけで使う */
export function discDiff(board: Board, player: Player): number {
  const { black, white } = score(board);
  return player === BLACK ? black - white : white - black;
}

// ---- CPU ----

export const LEVELS = {
  easy: { label: 'かんたん' },
  normal: { label: 'ふつう' },
  hard: { label: 'つよい' },
} as const;

export type Level = keyof typeof LEVELS;

/** 思考時間の上限（ms）。深さではなく時間で切る（端末差でフリーズして見えないように） */
export const DEFAULT_BUDGET_MS = 800;
/** 「つよい」の反復深化の上限 */
export const MAX_DEPTH = 6;
/** 空きマスがこれ以下になったら、評価関数を捨てて最終石数を読み切る */
export const ENDGAME_EMPTIES = 10;

/** 終局を評価値に落とすときの下駄。読み切りの勝ち負けが評価値に埋もれないようにする */
const WIN_SCORE = 100000;

interface SearchCtx {
  now: () => number;
  /** この時刻を過ぎたら打ち切る。深さ1の探索中は Infinity にして必ず完了させる */
  deadline: number;
  aborted: boolean;
  nodes: number;
}

const defaultNow = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

/**
 * 手の並べ替え。αβの刈り効率はここでほぼ決まる。
 * 重みの降順に並べると、角が先頭・角の斜め隣が最後になる。
 */
function ordered(moves: readonly number[]): number[] {
  return [...moves].sort((a, b) => WEIGHTS[b] - WEIGHTS[a]);
}

function timeUp(ctx: SearchCtx): boolean {
  if (ctx.aborted) return true;
  // now() の呼び出し自体を減らすため、数ノードに1回だけ見る
  if ((ctx.nodes & 7) === 0 && ctx.now() >= ctx.deadline) ctx.aborted = true;
  return ctx.aborted;
}

function terminalScore(board: Board, player: Player): number {
  const diff = discDiff(board, player);
  return diff > 0 ? WIN_SCORE + diff : diff < 0 ? -WIN_SCORE + diff : 0;
}

/** ネガマックス + αβ枝刈り。手番非依存なので、CPUが黒でも白でも同じ関数が動く */
function negamax(
  board: Board,
  player: Player,
  depth: number,
  alpha: number,
  beta: number,
  endgame: boolean,
  ctx: SearchCtx,
): number {
  ctx.nodes += 1;
  if (timeUp(ctx)) return 0;

  const moves = legalMoves(board, player);
  if (moves.length === 0) {
    // 打てないならパス。双方打てなければ終局
    if (legalMoves(board, opponent(player)).length === 0) return terminalScore(board, player);
    return -negamax(board, opponent(player), depth, -beta, -alpha, endgame, ctx);
  }
  if (depth === 0) return endgame ? discDiff(board, player) : evaluate(board, player);

  let best = -Infinity;
  let a = alpha;
  for (const sq of ordered(moves)) {
    const flipped = flipsAt(board, player, sq);
    board[sq] = player;
    for (const i of flipped) board[i] = player;
    const value = -negamax(board, opponent(player), depth - 1, -beta, -a, endgame, ctx);
    board[sq] = EMPTY;
    for (const i of flipped) board[i] = -player;

    if (ctx.aborted) return 0;
    if (value > best) best = value;
    if (best > a) a = best;
    if (a >= beta) break;
  }
  return best;
}

/** 深さを固定した1回ぶんの探索。打ち切られたら null（その深さの結果は捨てる） */
function searchAtDepth(
  board: Board,
  player: Player,
  moves: readonly number[],
  depth: number,
  endgame: boolean,
  ctx: SearchCtx,
): { best: number[]; score: number } | null {
  let best: number[] = [];
  let bestScore = -Infinity;
  for (const sq of moves) {
    // 相手側の窓の上限を「最善値ちょうど」ではなく1つ緩める。
    // ちょうどにすると、枝刈りで打ち切られた手が最善値と同じ値を返すことがあり、
    // 実際には劣る手が同点として混ざる（評価値はすべて整数なので1で足りる）
    const beta = bestScore === -Infinity ? Infinity : -(bestScore - 1);
    const flipped = flipsAt(board, player, sq);
    board[sq] = player;
    for (const i of flipped) board[i] = player;
    const value = -negamax(board, opponent(player), depth - 1, -Infinity, beta, endgame, ctx);
    board[sq] = EMPTY;
    for (const i of flipped) board[i] = -player;

    if (ctx.aborted) return null;
    if (value > bestScore) {
      bestScore = value;
      best = [sq];
    } else if (value === bestScore) {
      best.push(sq);
    }
  }
  return { best, score: bestScore };
}

export interface ChooseOptions {
  /** 思考時間の上限（ms） */
  budgetMs?: number;
  /** 現在時刻。テストでは偽の時計を渡す */
  now?: () => number;
  /** かんたんの手選び・同点の手のばらしに使う */
  rng?: () => number;
}

export interface SearchResult {
  /** 選んだマス。合法手が無ければ -1 */
  move: number;
  /** 完了した最大の読みの深さ（かんたんは0） */
  depth: number;
  /** 探索したノード数 */
  nodes: number;
}

/**
 * CPU の着手を選ぶ。
 *
 * 時計（now）を注入できるのは rng と同じ理由で、打ち切りと再現性を
 * テストで固定するため（lib/cards.ts の shuffle(cards, rng) と同じ約束）。
 */
export function chooseMove(state: ReversiState, level: Level, opts: ChooseOptions = {}): number {
  return search(state, level, opts).move;
}

/**
 * chooseMove の中身。読んだ深さとノード数も返す（テスト用）。
 *
 * 3段階は「同じ探索の深さ違い」にしない。深さだけで弱くすると、人間には
 * 「たまに変な手を打つ強いCPU」に見える。評価する項目を減らすほうが、
 * 辺を取りすぎる・角を渡すといった「理解できる負け方」をする。
 */
export function search(
  state: ReversiState,
  level: Level,
  opts: ChooseOptions = {},
): SearchResult {
  const rng = opts.rng ?? Math.random;
  const moves = legalMoves(state.board, state.turn);
  if (moves.length === 0) return { move: -1, depth: 0, nodes: 0 };

  // かんたん: 探索なし。角を避けもしないので初心者が勝てる
  if (level === 'easy') return { move: pick(moves, rng), depth: 0, nodes: moves.length };

  const board = Int8Array.from(state.board);
  const player = state.turn;

  // ふつう: 深さ1・重みテーブルだけ。mobility も確定石も見ない。
  // 「目先の良い手」を打つので、角は取るが角を渡す手も打つ
  if (level === 'normal') {
    let best: number[] = [];
    let bestScore = -Infinity;
    for (const sq of moves) {
      const flipped = flipsAt(board, player, sq);
      board[sq] = player;
      for (const i of flipped) board[i] = player;
      const value = positionScore(board, player);
      board[sq] = EMPTY;
      for (const i of flipped) board[i] = -player;

      if (value > bestScore) {
        bestScore = value;
        best = [sq];
      } else if (value === bestScore) {
        best.push(sq);
      }
    }
    return { move: pick(best, rng), depth: 1, nodes: moves.length };
  }

  // つよい: 反復深化 + ネガマックス + αβ。時間で打ち切る
  const empty = score(board).empty;
  const endgame = empty <= ENDGAME_EMPTIES;
  const maxDepth = endgame ? empty : MAX_DEPTH;
  const ctx: SearchCtx = { now: opts.now ?? defaultNow, deadline: Infinity, aborted: false, nodes: 0 };
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const start = ctx.now();
  const rootMoves = ordered(moves);

  let result: SearchResult = { move: rootMoves[0], depth: 0, nodes: 0 };
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    // 深さ1だけは必ず完了させる（budgetMs: 0 でも合法手を返せるように）
    ctx.deadline = depth === 1 ? Infinity : start + budgetMs;
    const found = searchAtDepth(board, player, rootMoves, depth, endgame, ctx);
    // 打ち切った深さの結果は捨てる。途中まで読んだ「最善手」には平気で悪手が混ざる
    if (!found) break;
    result = { move: pick(found.best, rng), depth, nodes: ctx.nodes };
  }
  return { ...result, nodes: ctx.nodes };
}
