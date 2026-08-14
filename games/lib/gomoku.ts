/**
 * 五目並べのロジック（盤面・勝敗判定・CPU）
 *
 * 仕様: docs/features/game-gomoku.md
 *
 * 「五目並べ」は伝統ゲームの一般名称で、商標の問題は無い
 * （games/CLAUDE.md の名称の約束。競技ルールの「連珠」は名乗らない）。
 *
 * 盤面は Int8Array(169)。index = row * 13 + col。
 * リバーシ（lib/reversi.ts）と同じ形にしてあり、符号（1=黒 / -1=白）で
 * 手番を持つのも同じ理由（評価も探索も手番非依存に書けるため）。
 *
 * ## v1で入れないもの（仕様書の「やらないこと」）
 *
 * - 禁じ手（三三・四四・長連）。カジュアル層には説明コストが利益を上回る。
 *   長連を禁じないので、**5つ以上並べば勝ち**として扱う
 * - 盤サイズの選択。13×13 固定（スマホでマスが潰れない上限）
 */

/** 盤の一辺。スマホの画面幅で1マスが潰れない上限として13にした */
export const SIZE = 13;
/** マスの総数（13×13＝169） */
export const CELLS = SIZE * SIZE;
/** 勝ちに必要な並びの長さ */
export const WIN_LENGTH = 5;

export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = -1;

/** 1=黒（先手） / -1=白。符号で持つのは評価を手番非依存に書くため */
export type Player = typeof BLACK | typeof WHITE;
export type Board = Int8Array;

/** 走査の番兵。盤の外を表す（EMPTY とも石とも違う値であれば何でもよい） */
const OUTSIDE = 2;

export function opponent(player: Player): Player {
  return -player as Player;
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

export function inBoard(row: number, col: number): boolean {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

/**
 * 並びを数える4方向（行,列の増分）。
 * 逆向きは同じ直線を2度数えることになるので、横・縦・右下がり・右上がりの4つで足りる。
 */
export const AXES: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/** 盤の中心（天元）。空の盤に打つ最初の1手 */
export const CENTER = indexOf((SIZE - 1) / 2, (SIZE - 1) / 2);

export function emptyBoard(): Board {
  return new Int8Array(CELLS);
}

// ---- 並び（連）----

/** sq を含む一続きの石。`openEnds` は両端のうち空きマスに接している数（0〜2） */
export interface Run {
  /** 並びの長さ（sq を含む） */
  length: number;
  /** 伸ばせる端の数。0なら両端が塞がっていて、その並びはもう5つにならない */
  openEnds: number;
  /** 並びを構成するマス（昇順ではなく、方向に沿った順） */
  cells: number[];
}

/**
 * sq に player の石があるものとして、方向 axis の連を数える。
 *
 * **sq が空きマスでも数える。** 「ここに打ったらどうなるか」を、
 * 盤面を書き換えずに調べたい場面（CPUの手の評価・勝ち手の判定）が多いため。
 */
export function runAt(
  board: Board,
  sq: number,
  player: Player,
  axis: readonly [number, number],
): Run {
  const [dr, dc] = axis;
  const cells = [sq];
  let openEnds = 0;

  for (const sign of [1, -1]) {
    let r = rowOf(sq) + dr * sign;
    let c = colOf(sq) + dc * sign;
    while (inBoard(r, c) && board[indexOf(r, c)] === player) {
      if (sign === 1) cells.push(indexOf(r, c));
      else cells.unshift(indexOf(r, c));
      r += dr * sign;
      c += dc * sign;
    }
    if (inBoard(r, c) && board[indexOf(r, c)] === EMPTY) openEnds += 1;
  }

  return { length: cells.length, openEnds, cells };
}

/**
 * sq に player が打ったときに揃う5連（勝ち筋）のマス。揃わなければ null。
 * 長連（6つ以上）も勝ちとして扱う（禁じ手を入れていないため）。
 */
export function winningLine(board: Board, player: Player, sq: number): number[] | null {
  if (sq < 0 || sq >= CELLS) return null;
  for (const axis of AXES) {
    const run = runAt(board, sq, player, axis);
    if (run.length >= WIN_LENGTH) return run.cells;
  }
  return null;
}

/** sq に打つと勝てるか */
export function winsAt(board: Board, player: Player, sq: number): boolean {
  return winningLine(board, player, sq) !== null;
}

// ---- 評価 ----

/**
 * 並びの価値。「長さ × 開放度（伸ばせる端の数）」を表にしたもの。
 *
 * 活四（両端が空いた4）は防ぎようが無いので、四（片端だけ空いた4）より
 * 1桁大きく取る。活三は「放置すると次に活四になる」ので、四に近い重みにする。
 * 両端が塞がった並びは5つにならないので0（長さ4でも価値が無い）。
 */
export const SHAPE_VALUE = {
  five: 1_000_000,
  /** 活四（両端空き）。この形を作られたら負け */
  openFour: 100_000,
  /** 四（片端空き）。相手は必ず受けなければならない */
  four: 10_000,
  /** 活三（両端空き）。放置すると活四になる */
  openThree: 8_000,
  /** 眠三（片端空き） */
  three: 500,
  openTwo: 300,
  two: 30,
  openOne: 4,
  one: 1,
} as const;

/** 長さと開放度から並びの価値を引く */
export function shapeValue(length: number, openEnds: number): number {
  if (length >= WIN_LENGTH) return SHAPE_VALUE.five;
  // 両端が塞がった並びはもう5つにならないので、長さに関係なく価値が無い
  if (openEnds === 0) return 0;
  const open = openEnds === 2;
  if (length === 4) return open ? SHAPE_VALUE.openFour : SHAPE_VALUE.four;
  if (length === 3) return open ? SHAPE_VALUE.openThree : SHAPE_VALUE.three;
  if (length === 2) return open ? SHAPE_VALUE.openTwo : SHAPE_VALUE.two;
  return open ? SHAPE_VALUE.openOne : SHAPE_VALUE.one;
}

/**
 * 盤上の直線（長さ5以上のものだけ）。行・列・右下がり・右上がりで60本。
 *
 * 長さ4以下の対角線は5つ並べようが無いので持たない。
 * 全体の評価はこの表を1周するだけで済む（169マス×4方向＝676回の参照）。
 */
function buildLines(): number[][] {
  const lines: number[][] = [];
  const seen = new Set<number>();
  for (const [dr, dc] of AXES) {
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        // 直線の始点だけを拾う（1つ手前が盤の外なら始点）
        if (inBoard(r - dr, c - dc)) continue;
        const line: number[] = [];
        let rr = r;
        let cc = c;
        while (inBoard(rr, cc)) {
          line.push(indexOf(rr, cc));
          rr += dr;
          cc += dc;
        }
        if (line.length < WIN_LENGTH) continue;
        // 同じ直線を2度入れない（横と縦は始点が重ならないが、念のため）
        const key = line[0] * CELLS + line[line.length - 1];
        if (seen.has(key)) continue;
        seen.add(key);
        lines.push(line);
      }
    }
  }
  return lines;
}

/** モジュール読み込み時に1回だけ作る */
export const LINES: readonly (readonly number[])[] = buildLines();

/**
 * player の並びの価値の合計。盤上のすべての直線を1周して数える。
 * 相手の石は数えない（`evaluate` が両者ぶんを引き算する）。
 */
export function shapeScore(board: Board, player: Player): number {
  let sum = 0;
  for (const line of LINES) {
    let run = 0;
    let openStart = false;
    for (let i = 0; i <= line.length; i += 1) {
      // 直線の終わりは番兵。盤の外は「塞がっている」扱いになる
      const v = i < line.length ? board[line[i]] : OUTSIDE;
      if (v === player) {
        if (run === 0) openStart = i > 0 && board[line[i - 1]] === EMPTY;
        run += 1;
        continue;
      }
      if (run > 0) {
        sum += shapeValue(run, (openStart ? 1 : 0) + (v === EMPTY ? 1 : 0));
        run = 0;
      }
    }
  }
  return sum;
}

/**
 * 中央寄りの石をわずかに高く見る。中心から遠いほど0に近づく。
 *
 * 五目並べは盤の端に寄るほど並びを作れる方向が減るので、他の条件が同じなら
 * 中央のほうが良い。並びの価値（数百〜）に対してごく小さい重みにしてあり、
 * **序盤にどこへ打つかを決めるだけの働き**をする。
 */
export function centerScore(board: Board, player: Player): number {
  const mid = (SIZE - 1) / 2;
  let sum = 0;
  for (let sq = 0; sq < CELLS; sq += 1) {
    const v = board[sq];
    if (v === EMPTY) continue;
    const dist = Math.max(Math.abs(rowOf(sq) - mid), Math.abs(colOf(sq) - mid));
    sum += (v === player ? 1 : -1) * (mid - dist);
  }
  return sum;
}

/**
 * 盤面の評価。自分の並び − 相手の並び（＋中央寄りのわずかな加点）。
 *
 * 手番非依存: evaluate(b, BLACK) === -evaluate(b, WHITE)。
 * リバーシと同じく、ネガマックスがそのまま書けるようにするための約束。
 */
export function evaluate(board: Board, player: Player): number {
  return (
    shapeScore(board, player) - shapeScore(board, opponent(player)) + centerScore(board, player)
  );
}

/**
 * sq に打ったときにできる並びの価値（sq を通る4方向だけを見る）。
 *
 * 盤面全体の `evaluate` より2桁安いので、候補手の並べ替えと
 * 「ふつう」以下の手選びはこちらを使う。
 */
export function pointScore(board: Board, sq: number, player: Player): number {
  let sum = 0;
  for (const axis of AXES) {
    const run = runAt(board, sq, player, axis);
    sum += shapeValue(run.length, run.openEnds);
  }
  return sum;
}

/**
 * 候補手の点数。「そこに自分が打つ価値」＋「そこに相手が打つ価値（＝防ぐ価値）」。
 *
 * 相手ぶんを少しだけ軽くしている（10:9）。同じ価値なら攻めるほうを選ぶためで、
 * 攻めと守りが完全に同点だと、CPUが受けだけを続けて一生勝ちにいかなくなる。
 */
export function moveScore(board: Board, sq: number, player: Player): number {
  return pointScore(board, sq, player) * 10 + pointScore(board, sq, opponent(player)) * 9;
}

// ---- 局面 ----

export interface GomokuState {
  board: Board;
  /** 手番。finished のときは意味を持たない */
  turn: Player;
  finished: boolean;
  /** 勝者。引き分け（盤が埋まった）は 0、対局中は null */
  winner: Player | 0 | null;
  /** 勝ちが決まった並びのマス（盤面のハイライト用） */
  line: readonly number[];
  /** 直前に打たれたマス。開始直後は null */
  last: number | null;
  /** ここまでに打たれた石の数 */
  placed: number;
}

/** 対局開始の局面。`first` は先手（既定は黒） */
export function initialState(first: Player = BLACK): GomokuState {
  return {
    board: emptyBoard(),
    turn: first,
    finished: false,
    winner: null,
    line: [],
    last: null,
    placed: 0,
  };
}

/** そこに打てるか（空きマスで、対局が続いていること） */
export function isLegalMove(state: GomokuState, sq: number): boolean {
  if (state.finished) return false;
  if (sq < 0 || sq >= CELLS) return false;
  return state.board[sq] === EMPTY;
}

/** 空いているマス（昇順） */
export function emptyCells(board: Board): number[] {
  const out: number[] = [];
  for (let sq = 0; sq < CELLS; sq += 1) {
    if (board[sq] === EMPTY) out.push(sq);
  }
  return out;
}

/**
 * sq に着手した次の局面を返す。打てない場所なら元の局面をそのまま返す。
 *
 * 五目並べにはパスが無いので、着手のたびに手番が必ず入れ替わる。
 * 5つ並んだら即終局、盤が埋まったら引き分け。
 */
export function applyMove(state: GomokuState, sq: number): GomokuState {
  if (!isLegalMove(state, sq)) return state;

  const board = Int8Array.from(state.board);
  board[sq] = state.turn;
  const placed = state.placed + 1;
  const line = winningLine(state.board, state.turn, sq);

  if (line) {
    return { board, turn: state.turn, finished: true, winner: state.turn, line, last: sq, placed };
  }
  if (placed === CELLS) {
    return { board, turn: state.turn, finished: true, winner: 0, line: [], last: sq, placed };
  }
  return {
    board,
    turn: opponent(state.turn),
    finished: false,
    winner: null,
    line: [],
    last: sq,
    placed,
  };
}

/** 投了する。`player` が投げるので、勝者は相手になる */
export function resign(state: GomokuState, player: Player): GomokuState {
  if (state.finished) return state;
  return { ...state, finished: true, winner: opponent(player), line: [] };
}

/**
 * 「待った」の戻り先を履歴（先頭が対局開始、末尾が現在）から探す。
 *
 * リバーシ（lib/reversi.ts の undoIndex）と同じ規則で、手数は数えない。
 * 「1手戻す＝2手戻す」と決め打つと、自分が後手のとき（開始直後はCPUの1手しか
 * 指されていない）に破綻するため。
 *
 * 規則は「直前の『自分の手番だった局面』まで戻す」。
 * それが無ければ対局開始まで戻す。現在が対局開始そのものなら戻り先は無い（null）。
 */
export function undoIndex(history: readonly GomokuState[], human: Player): number | null {
  for (let i = history.length - 2; i >= 1; i -= 1) {
    const s = history[i];
    if (!s.finished && s.turn === human) return i;
  }
  return history.length >= 2 ? 0 : null;
}

// ---- CPU ----

export const LEVELS = {
  easy: { label: 'かんたん' },
  normal: { label: 'ふつう' },
  hard: { label: 'つよい' },
} as const;

export type Level = keyof typeof LEVELS;

/** 候補手にするマスの範囲。すでにある石からこのマス数以内だけを見る */
export const CANDIDATE_RADIUS = 2;
/** 「つよい」が1つの局面で読む候補手の数 */
export const HARD_WIDTH = 8;
/** 「つよい」の反復深化の上限 */
export const MAX_DEPTH = 4;
/** 思考時間の上限（ms）。深さではなく時間で切る（端末差でフリーズして見えないように） */
export const DEFAULT_BUDGET_MS = 400;

/** 終局を評価値に落とすときの下駄 */
const WIN_SCORE = 10_000_000;

/**
 * 候補手。すでに置かれた石の近く（CANDIDATE_RADIUS マス以内）の空きマスだけ。
 *
 * 169マスを全部見ると「つよい」の読みが数十倍遅くなるうえ、石から遠いマスは
 * 並びに絡まないので読む価値が無い。石が1つも無ければ天元だけを返す。
 */
export function candidates(board: Board, radius: number = CANDIDATE_RADIUS): number[] {
  const out: number[] = [];
  let hasStone = false;
  for (let sq = 0; sq < CELLS; sq += 1) {
    if (board[sq] !== EMPTY) {
      hasStone = true;
      break;
    }
  }
  if (!hasStone) return [CENTER];

  for (let sq = 0; sq < CELLS; sq += 1) {
    if (board[sq] !== EMPTY) continue;
    const r = rowOf(sq);
    const c = colOf(sq);
    let near = false;
    for (let dr = -radius; dr <= radius && !near; dr += 1) {
      for (let dc = -radius; dc <= radius; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (inBoard(rr, cc) && board[indexOf(rr, cc)] !== EMPTY) {
          near = true;
          break;
        }
      }
    }
    if (near) out.push(sq);
  }
  return out;
}

/** 打つと勝てるマス（複数あれば全部） */
export function winningMoves(board: Board, player: Player, moves: readonly number[]): number[] {
  return moves.filter((sq) => winsAt(board, player, sq));
}

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

function timeUp(ctx: SearchCtx): boolean {
  if (ctx.aborted) return true;
  // now() の呼び出し自体を減らすため、数ノードに1回だけ見る
  if ((ctx.nodes & 7) === 0 && ctx.now() >= ctx.deadline) ctx.aborted = true;
  return ctx.aborted;
}

/** 候補手を点数の高い順に並べ、上位 width 手だけ残す */
function ordered(board: Board, player: Player, moves: readonly number[], width: number): number[] {
  return [...moves]
    .map((sq) => ({ sq, value: moveScore(board, sq, player) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, width)
    .map((m) => m.sq);
}

/**
 * ネガマックス + αβ枝刈り。手番非依存なので、CPUが黒でも白でも同じ関数が動く。
 *
 * 勝ちが見つかったらそこで打ち切る（`WIN_SCORE + depth`）。残り深さを足すのは、
 * **同じ勝ちなら手数の短いほうを選ばせる**ため。これが無いと、勝ちが見えていても
 * 「何手か後でも勝てる」手と同点になり、詰めきらずに逃げられることがある。
 */
function negamax(
  board: Board,
  player: Player,
  depth: number,
  alpha: number,
  beta: number,
  ctx: SearchCtx,
): number {
  ctx.nodes += 1;
  if (timeUp(ctx)) return 0;
  if (depth === 0) return evaluate(board, player);

  const moves = candidates(board);
  if (moves.length === 0) return 0; // 盤が埋まった＝引き分け

  let best = -Infinity;
  let a = alpha;
  for (const sq of ordered(board, player, moves, HARD_WIDTH)) {
    if (winsAt(board, player, sq)) return WIN_SCORE + depth;

    board[sq] = player;
    const value = -negamax(board, opponent(player), depth - 1, -beta, -a, ctx);
    board[sq] = EMPTY;

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
  ctx: SearchCtx,
): { best: number[]; score: number } | null {
  let best: number[] = [];
  let bestScore = -Infinity;
  for (const sq of moves) {
    // 相手側の窓の上限を1つ緩める。ちょうどにすると、枝刈りで打ち切られた手が
    // 最善値と同じ値を返すことがあり、実際には劣る手が同点として混ざる
    const beta = bestScore === -Infinity ? Infinity : -(bestScore - 1);
    board[sq] = player;
    const value = -negamax(board, opponent(player), depth - 1, -Infinity, beta, ctx);
    board[sq] = EMPTY;

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
  /** 同点の手のばらしに使う */
  rng?: () => number;
}

export interface SearchResult {
  /** 選んだマス。打てるマスが無ければ -1 */
  move: number;
  /** 完了した最大の読みの深さ（読まない段階は0） */
  depth: number;
  /** 探索したノード数 */
  nodes: number;
}

/**
 * CPU の着手を選ぶ。
 *
 * 時計（now）を注入できるのは rng と同じ理由で、打ち切りと再現性を
 * テストで固定するため（lib/reversi.ts と同じ約束）。
 */
export function chooseMove(state: GomokuState, level: Level, opts: ChooseOptions = {}): number {
  return search(state, level, opts).move;
}

/**
 * chooseMove の中身。読んだ深さとノード数も返す（テスト用）。
 *
 * ## 3段階の作り分け
 *
 * リバーシと同じく、**深さだけを変えて弱くしない**。深さで弱くすると
 * 「たまに変な手を打つ強いCPU」になり、人間には理解できない負け方に見える。
 * 見る項目を減らすほうが「守りが甘い」という分かる弱さになる。
 *
 * - かんたん: 自分の並びだけを見る。相手の三も四も気にしない
 * - ふつう: 自分と相手の並びを見る（1手先の静的評価だけ。読みは無し）
 * - つよい: 上位候補だけを反復深化で読む
 *
 * ただし**どの段階も「即勝ち」と「5連の防ぎ」だけは必ず正確に打つ**。
 * ここを外すと、かんたんでも「5つ並べるだけの作業」になって対局にならない。
 */
export function search(state: GomokuState, level: Level, opts: ChooseOptions = {}): SearchResult {
  const rng = opts.rng ?? Math.random;
  const player = state.turn;
  const board = Int8Array.from(state.board);
  const moves = candidates(board);
  if (state.finished || moves.length === 0) return { move: -1, depth: 0, nodes: 0 };

  // 1. 自分が勝てるならそこに打つ
  const mine = winningMoves(board, player, moves);
  if (mine.length > 0) return { move: pick(mine, rng), depth: 1, nodes: moves.length };

  // 2. 相手の5連は必ず止める（複数あればもう受け切れないが、いちばん先に見つけた所を防ぐ）
  const theirs = winningMoves(board, opponent(player), moves);
  if (theirs.length > 0) return { move: pick(theirs, rng), depth: 1, nodes: moves.length };

  // 3. かんたん: 自分の並びだけで選ぶ。相手の活三・活四は見えていない
  if (level === 'easy') {
    return {
      move: bestBy(moves, (sq) => pointScore(board, sq, player), rng),
      depth: 0,
      nodes: moves.length,
    };
  }

  // 4. ふつう: 自分と相手の並びを見る。読まないので、二手先の両取りには気づかない
  if (level === 'normal') {
    return {
      move: bestBy(moves, (sq) => moveScore(board, sq, player), rng),
      depth: 1,
      nodes: moves.length,
    };
  }

  // 5. つよい: 反復深化 + ネガマックス + αβ。時間で打ち切る
  const ctx: SearchCtx = {
    now: opts.now ?? defaultNow,
    deadline: Infinity,
    aborted: false,
    nodes: 0,
  };
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const start = ctx.now();
  const rootMoves = ordered(board, player, moves, HARD_WIDTH);

  let result: SearchResult = { move: rootMoves[0], depth: 0, nodes: 0 };
  for (let depth = 1; depth <= MAX_DEPTH; depth += 1) {
    // 深さ1だけは必ず完了させる（budgetMs: 0 でも手を返せるように）
    ctx.deadline = depth === 1 ? Infinity : start + budgetMs;
    const found = searchAtDepth(board, player, rootMoves, depth, ctx);
    // 打ち切った深さの結果は捨てる。途中まで読んだ「最善手」には平気で悪手が混ざる
    if (!found) break;
    result = { move: pick(found.best, rng), depth, nodes: ctx.nodes };
  }
  return { ...result, nodes: ctx.nodes };
}

/** 点数がいちばん高い手を選ぶ。同点は rng でばらす（毎回同じ対局にならないように） */
function bestBy(
  moves: readonly number[],
  value: (sq: number) => number,
  rng: () => number,
): number {
  let best: number[] = [];
  let bestScore = -Infinity;
  for (const sq of moves) {
    const v = value(sq);
    if (v > bestScore) {
      bestScore = v;
      best = [sq];
    } else if (v === bestScore) {
      best.push(sq);
    }
  }
  return pick(best, rng);
}
