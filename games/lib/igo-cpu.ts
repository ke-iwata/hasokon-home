/**
 * 囲碁の CPU（3段階）。Web Worker（app/igo/cpu.worker.ts）から呼ぶ。
 *
 * 仕様: docs/features/game-igo.md の「CPU」
 *
 * | 強さ | 石取り | 対局（9路） |
 * |---|---|---|
 * | かんたん | 取れる石を7割で取る・アタリを5割で逃げる・あとは相手の石の近くにランダム | 同じ考え方＋1線を避ける。終盤はパスが早い |
 * | ふつう | 取る・取られるを2手先まで読む（シチョウ・ゲタの形を含む） | MCTS・1手あたり 3,000 回 |
 * | つよい | 同じ読みを4手先まで | MCTS＋RAVE・1手あたり 20,000 回 |
 *
 * - **速さはプレイアウトの回数で縛る**（時刻で縛らない。テストも回数で見る）。
 *   回数は全端末で同じ（端末で変えると同じ「つよい」でも強さが変わる）
 * - 乱数は種を固定できる（`lib/daily.ts` の mulberry32）。同じ局面・同じ種なら同じ手
 * - 最後に選ぶ手は `isLegal` でスーパーコウまで確かめる
 */
import { mulberry32 } from '@/lib/daily';
import {
  BLACK,
  Board,
  EMPTY,
  PASS,
  WHITE,
  areaOwners,
  boardOf,
  bothPassed,
  estimateDead,
  isLegal,
  komiFor,
  opponent,
  playout,
  scoreGame,
  type IgoState,
  type Level,
  type Mode,
  type Player,
} from '@/lib/igo';

/** 対局（MCTS）のプレイアウトの回数（1手あたり） */
export const PLAYOUTS: Record<Exclude<Level, 'easy'>, number> = {
  normal: 3000,
  hard: 20000,
};

/** 石取りの読みの深さ（手） */
export const ISHITORI_DEPTH: Record<Exclude<Level, 'easy'>, number> = {
  normal: 2,
  hard: 4,
};

export interface CpuRequest {
  state: IgoState;
  mode: Mode;
  level: Level;
  /** 石取りの勝ちの数 */
  target: number;
  seed: number;
  /** テスト用：プレイアウトの回数を上書きする */
  playouts?: number;
}

export interface CpuResult {
  move: number;
  /** 回したプレイアウトの回数（MCTS のときだけ。上限で打ち切ったことの確認に使う） */
  playouts: number;
}

export function chooseMove(req: CpuRequest): CpuResult {
  const rng = mulberry32(req.seed);
  const { state } = req;
  if (bothPassed(state)) return { move: PASS, playouts: 0 };
  let result: CpuResult;
  if (req.level === 'easy') {
    result = { move: easyMove(state, req.mode, rng), playouts: 0 };
  } else if (req.mode === 'ishitori') {
    result = { move: ishitoriMove(state, req.target, ISHITORI_DEPTH[req.level], rng), playouts: 0 };
  } else {
    const urgent = urgentMove(state);
    result =
      urgent !== null
        ? { move: urgent, playouts: 0 }
        : mctsMove(state, req.playouts ?? PLAYOUTS[req.level], req.level === 'hard', rng);
  }
  if (result.move !== PASS && !isLegal(state, result.move)) result.move = fallbackMove(state, rng);
  return result;
}

/** 選んだ手がスーパーコウで打てなかったとき。打てる手からランダム（眼はつぶさない）、無ければパス */
function fallbackMove(state: IgoState, rng: () => number): number {
  const b = boardOf(state);
  const cands: number[] = [];
  for (let p = 0; p < state.cells.length; p++) {
    if (state.cells[p] !== EMPTY) continue;
    if (b.isEyeOf(b.toIndex(p), state.turn)) continue;
    if (isLegal(state, p)) cands.push(p);
  }
  return cands.length ? cands[(rng() * cands.length) | 0] : PASS;
}

// ---------------------------------------------------------------------------
// かんたん
// ---------------------------------------------------------------------------

/** 盤の端（1線）か */
function onFirstLine(size: number, p: number): boolean {
  const r = Math.floor(p / size);
  const c = p % size;
  return r === 0 || c === 0 || r === size - 1 || c === size - 1;
}

function easyMove(state: IgoState, mode: Mode, rng: () => number): number {
  const b = boardOf(state);
  const me = state.turn;
  const o = opponent(me);
  const legal = (i: number) => b.isLegal(i, me) && isLegal(state, b.toPoint(i));
  // 取れる石があれば 7 割で取る（いちばん大きいかたまり）
  let bestCap = 0;
  let bestCapSize = 0;
  const seen = new Set<number>();
  for (const i of b.points) {
    if (b.color[i] !== o || seen.has(b.head[i])) continue;
    seen.add(b.head[i]);
    if (b.inAtari(i)) {
      const lib = b.atariLib(i);
      const n = b.stones[b.head[i]];
      if (n > bestCapSize && legal(lib)) {
        bestCap = lib;
        bestCapSize = n;
      }
    }
  }
  if (bestCap && rng() < 0.7) return b.toPoint(bestCap);
  // 自分のアタリを 5 割で逃げる
  seen.clear();
  for (const i of b.points) {
    if (b.color[i] !== me || seen.has(b.head[i])) continue;
    seen.add(b.head[i]);
    if (b.inAtari(i)) {
      const lib = b.atariLib(i);
      if (legal(lib) && rng() < 0.5) return b.toPoint(lib);
    }
  }
  // 終盤はパスが早い（対局のとき）：空点が盤の 3 割を切ったら、相手がパスした直後はパス
  const empties = state.cells.filter((v) => v === EMPTY).length;
  if (mode === 'taikyoku' && state.passes > 0 && empties < state.cells.length * 0.45) return PASS;
  if (mode === 'taikyoku' && empties < state.cells.length * 0.25) return PASS;
  // それ以外は相手の石の近く（2 マス以内）にランダム。対局では 1 線を避ける
  const near: number[] = [];
  const any: number[] = [];
  for (const i of b.points) {
    if (b.color[i] !== EMPTY || b.isEyeOf(i, me) || !legal(i)) continue;
    const p = b.toPoint(i);
    if (mode === 'taikyoku' && onFirstLine(state.size, p)) continue;
    any.push(p);
    if (nearColor(b, i, o, 2)) near.push(p);
  }
  const pool = near.length ? near : any;
  if (pool.length === 0) return PASS;
  return pool[(rng() * pool.length) | 0];
}

function nearColor(b: Board, i: number, c: Player, dist: number): boolean {
  const s = b.stride;
  for (let dr = -dist; dr <= dist; dr++) {
    for (let dc = -dist; dc <= dist; dc++) {
      if (Math.abs(dr) + Math.abs(dc) > dist) continue;
      const q = i + dr * s + dc;
      if (q >= 0 && q < b.color.length && b.color[q] === c) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// 石取り：取る・取られるの読み（シチョウ・ゲタ）
// ---------------------------------------------------------------------------

/** シチョウを読み切る深さ（手） */
const LADDER_DEPTH = 40;

/**
 * 攻める側の手番で、`target` の連を取れるか。
 * 呼吸点 1 → 取れる。2 → どちらかの呼吸点からアタリをかけ、守る側のどの逃げ方でも
 * 取れるなら取れる（シチョウ）。3 以上 → 取れない。ただし `wide`（ゲタの読みの残り）が
 * あれば、呼吸点 3 の連にも呼吸点を詰める手を読む（伸びても呼吸点が増えない形＝ゲタ）。
 */
export function attackWins(b: Board, target: number, depth = LADDER_DEPTH, wide = 1): boolean {
  const c = b.color[target];
  if (c !== BLACK && c !== WHITE) return true;
  const libs = b.libertyCount(target, 4);
  if (libs === 1) return true;
  if (depth <= 0 || libs >= 4 || (libs === 3 && wide <= 0)) return false;
  const nextWide = libs === 3 ? wide - 1 : wide;
  const attacker = opponent(c as Player);
  for (const lib of b.libertiesOf(target)) {
    if (!b.isLegal(lib, attacker)) continue;
    const nb = b.clone();
    nb.play(lib, attacker);
    // 詰めた石がすぐ取られる形（打った石がアタリで、相手は取り返せる）は除く
    if (nb.inAtari(lib) && nb.libertyCount(target, 3) > 1) continue;
    if (!defendWins(nb, target, depth - 1, nextWide)) return true;
  }
  return false;
}

/**
 * 守る側の手番で、`target` の連が助かるか。
 * 逃げ方は「呼吸点に伸びる」と「まわりのアタリの相手の石を取る」。
 * 呼吸点 3 で `wide` が残っていれば、伸びた後もゲタで取られないかを読む。
 */
export function defendWins(b: Board, target: number, depth = LADDER_DEPTH, wide = 1): boolean {
  const c = b.color[target];
  if (c !== BLACK && c !== WHITE) return false;
  const libs = b.libertyCount(target, 4);
  if (libs >= 4 || depth <= 0) return true;
  if (libs === 3 && wide <= 0) return true;
  const me = c as Player;
  const o = opponent(me);
  const moves = new Set<number>(b.libertiesOf(target));
  // まわりのアタリの相手の石を取る手
  for (const s of b.stonesOf(target)) {
    for (const d of b.dirs) {
      const q = s + d;
      if (b.color[q] === o && b.inAtari(q)) moves.add(b.atariLib(q));
    }
  }
  for (const m of moves) {
    if (!b.isLegal(m, me)) continue;
    const nb = b.clone();
    nb.play(m, me);
    if (nb.color[target] !== me) continue;
    if (!attackWins(nb, target, depth - 1, wide)) return true;
  }
  // 呼吸点 3 なら、手を抜いても（ここに打たなくても）すぐには取られない
  if (libs === 3 && !attackWins(b, target, depth - 1, wide)) return true;
  return false;
}

const WIN = 1_000_000;

/** 局面の評価（`me` から見て）。`toMove` は次に打つ側 */
function evaluate(b: Board, me: Player, toMove: Player, target: number): number {
  const o = opponent(me);
  if (b.captured[me] >= target) return WIN;
  if (b.captured[o] >= target) return -WIN;
  let score = (b.captured[me] - b.captured[o]) * 1000;
  const seen = new Set<number>();
  for (const i of b.points) {
    const c = b.color[i];
    if (c === EMPTY) continue;
    const h = b.head[i];
    if (seen.has(h)) continue;
    seen.add(h);
    const sign = c === me ? 1 : -1;
    const n = b.stones[h];
    const libs = b.libertyCount(i, 4);
    let v = 0;
    if (libs === 1) {
      // 相手の手番でアタリなら次に取られる。自分の手番なら逃げられるかを読む
      if (c !== toMove) v = -800 * n;
      else v = defendWins(b, i, 30, 0) ? -60 : -700 * n;
    } else if (libs === 2) {
      if (c !== toMove) v = attackWins(b, i, 30, 0) ? -600 * n : -40;
      else v = defendWins(b, i, 30, 0) ? -20 : -500 * n;
    } else {
      v = libs * 6;
    }
    score += sign * v;
  }
  return score;
}

/** 読む手の候補：呼吸点の少ない連のまわり（呼吸点と、その隣）。足りなければ石の近く */
function tacticalCandidates(b: Board, me: Player, rng: () => number): number[] {
  const set = new Set<number>();
  const seen = new Set<number>();
  for (const i of b.points) {
    if (b.color[i] === EMPTY || seen.has(b.head[i])) continue;
    seen.add(b.head[i]);
    const libs = b.libertiesOf(i);
    if (libs.length > 3) continue;
    for (const l of libs) {
      set.add(l);
      // ゲタはアタリの呼吸点ではなく、その1つ外（斜め）に打つ
      if (libs.length === 2) {
        for (const d of b.dirs) if (b.color[l + d] === EMPTY) set.add(l + d);
      }
    }
  }
  const out = [...set].filter((i) => b.isLegal(i, me) && !b.isEyeOf(i, me));
  if (out.length < 6) {
    const extra: number[] = [];
    for (const i of b.points) {
      if (b.color[i] !== EMPTY || set.has(i) || !b.isLegal(i, me) || b.isEyeOf(i, me)) continue;
      if (nearColor(b, i, BLACK, 2) || nearColor(b, i, WHITE, 2)) extra.push(i);
    }
    shuffle(extra, rng);
    out.push(...extra.slice(0, 8 - out.length));
  }
  if (out.length === 0) {
    for (const i of b.points) if (b.color[i] === EMPTY && b.isLegal(i, me) && !b.isEyeOf(i, me)) out.push(i);
    shuffle(out, rng);
    return out.slice(0, 8);
  }
  return out;
}

function shuffle<T>(a: T[], rng: () => number) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
}

function negamax(
  b: Board,
  toMove: Player,
  me: Player,
  depth: number,
  alpha: number,
  beta: number,
  target: number,
  rng: () => number,
): number {
  const sign = toMove === me ? 1 : -1;
  if (b.captured[BLACK] >= target || b.captured[WHITE] >= target || depth === 0) {
    return sign * evaluate(b, me, toMove, target);
  }
  const moves = tacticalCandidates(b, toMove, rng);
  if (moves.length === 0) return sign * evaluate(b, me, toMove, target);
  let best = -Infinity;
  for (const m of moves) {
    const nb = b.clone();
    nb.play(m, toMove);
    const v = -negamax(nb, opponent(toMove), me, depth - 1, -beta, -alpha, target, rng);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function ishitoriMove(state: IgoState, target: number, depth: number, rng: () => number): number {
  const b = boardOf(state);
  const me = state.turn;
  const first = state.cells.every((v) => v === EMPTY);
  if (first) {
    // 初手は中央付近から（読む材料が無い）
    const n = state.size;
    const c = [Math.floor((n - 1) / 2), Math.ceil((n - 1) / 2)];
    return c[(rng() * 2) | 0] * n + c[(rng() * 2) | 0];
  }
  const moves = tacticalCandidates(b, me, rng).filter((i) => isLegal(state, b.toPoint(i)));
  if (moves.length === 0) return PASS;
  // 並べ替え：取る手を先に（枝刈りが効く）
  moves.sort((x, y) => captureSize(b, y, me) - captureSize(b, x, me));
  let best = -Infinity;
  let bestMoves: number[] = [];
  for (const m of moves) {
    const nb = b.clone();
    nb.play(m, me);
    const v = -negamax(nb, opponent(me), me, depth - 1, -Infinity, -best + 1, target, rng);
    if (v > best) {
      best = v;
      bestMoves = [m];
    } else if (v === best) bestMoves.push(m);
  }
  return b.toPoint(bestMoves[(rng() * bestMoves.length) | 0]);
}

function captureSize(b: Board, i: number, c: Player): number {
  const o = opponent(c);
  let n = 0;
  for (const d of b.dirs) {
    const q = i + d;
    if (b.color[q] === o && b.inAtari(q)) n += b.stones[b.head[q]];
  }
  return n;
}

// ---------------------------------------------------------------------------
// 対局：急ぐ手（取る・逃げる）
// ---------------------------------------------------------------------------

/**
 * 探索の前に見る「急ぐ手」。(1) 取れる相手の石があれば取る（大きいかたまりから）
 * (2) 自分のアタリの石を、逃げればシチョウでも取られない形なら逃げる。
 *
 * プレイアウトの勝率は、大差の局面ではどこに打っても同じに見え（石を取らない）、
 * 1 手あたり数千回では 1〜2 子の損得が誤差に埋もれる。囲碁を覚える人の相手としては、
 * 取れる石を取り・アタリから逃げる CPU のほうが分かりやすい（仕様書のテストの要件）。
 */
function urgentMove(state: IgoState): number | null {
  const b = boardOf(state);
  const me = state.turn;
  const o = opponent(me);
  let cap = 0;
  let capSize = 0;
  const seen = new Set<number>();
  for (const i of b.points) {
    const v = b.color[i];
    if (v === EMPTY || seen.has(b.head[i])) continue;
    seen.add(b.head[i]);
    if (v === o && b.inAtari(i)) {
      const lib = b.atariLib(i);
      const n = b.stones[b.head[i]];
      if (n > capSize && isLegal(state, b.toPoint(lib))) {
        cap = lib;
        capSize = n;
      }
    }
  }
  if (cap) return b.toPoint(cap);
  let esc = 0;
  let escSize = 0;
  seen.clear();
  for (const i of b.points) {
    const v = b.color[i];
    if (v !== me || seen.has(b.head[i])) continue;
    seen.add(b.head[i]);
    if (!b.inAtari(i)) continue;
    const lib = b.atariLib(i);
    const n = b.stones[b.head[i]];
    if (n <= escSize || !b.isLegal(lib, me) || !isLegal(state, b.toPoint(lib))) continue;
    const nb = b.clone();
    nb.play(lib, me);
    if (nb.libertyCount(i, 3) >= 2 && !attackWins(nb, i, LADDER_DEPTH, 0)) {
      esc = lib;
      escSize = n;
    }
  }
  return esc ? b.toPoint(esc) : null;
}

// ---------------------------------------------------------------------------
// 対局：モンテカルロ木探索（＋RAVE）
// ---------------------------------------------------------------------------

interface Node {
  /** この節に来た手（盤の添字。パスは 0） */
  move: number;
  /** この節で次に打つ側 */
  toMove: Player;
  /** 続けてパスした回数（この節の局面で） */
  passes: number;
  children: Node[] | null;
  n: number;
  /** 勝ち数（この節に来た手を打った側から見て） */
  w: number;
  /** AMAF（RAVE） */
  rn: number;
  rw: number;
  /** 先入観の勝率（取る 1・逃げる 0.9 …）。勝率が並んだときの決め手にも使う */
  p: number;
}

const UCT_C = 0.7;
/** RAVE の重みが半分になる訪問回数の目安 */
const RAVE_K = 600;

function newNode(move: number, toMove: Player, passes: number): Node {
  return { move, toMove, passes, children: null, n: 0, w: 0, rn: 0, rw: 0, p: 0.5 };
}

/** 先入観（仮の訪問回数と勝率）。少ない回数でも「取る・逃げる」を先に調べる */
const PRIOR_N = 10;

function prior(b: Board, i: number, c: Player, early: boolean): number {
  const o = opponent(c);
  let empties = 0;
  let friendSafe = false;
  for (const d of b.dirs) {
    const q = i + d;
    const v = b.color[q];
    if (v === o && b.inAtari(q)) return 1; // 取れる
    if (v === EMPTY) empties++;
    else if (v === c) {
      if (b.inAtari(q)) {
        if (escapeLike(b, i, c)) return 0.9; // アタリから逃げる
      } else if (b.libertyCount(q, 3) > 2) friendSafe = true;
    }
  }
  if (empties <= 1 && !friendSafe) return 0.15; // 自分からアタリになる手
  if (early && onFirstLine(b.size, b.toPoint(i))) return 0.3;
  return 0.5;
}

function escapeLike(b: Board, i: number, c: Player): boolean {
  let empties = 0;
  for (const d of b.dirs) if (b.color[i + d] === EMPTY) empties++;
  return empties >= 2;
}

function expand(node: Node, b: Board, rng: () => number, root: IgoState | null): void {
  const c = node.toMove;
  const kids: Node[] = [];
  let emptyCount = 0;
  for (const i of b.points) if (b.color[i] === EMPTY) emptyCount++;
  const early = emptyCount > b.points.length * 0.6;
  for (const i of b.points) {
    if (b.color[i] !== EMPTY || !b.isLegal(i, c) || b.isEyeOf(i, c)) continue;
    if (root && !isLegal(root, b.toPoint(i))) continue;
    const k = newNode(i, opponent(c), 0);
    k.p = prior(b, i, c, early);
    k.n = PRIOR_N;
    k.w = PRIOR_N * k.p;
    kids.push(k);
  }
  shuffle(kids, rng);
  const passNode = newNode(0, opponent(c), node.passes + 1);
  passNode.n = PRIOR_N;
  passNode.p = 0.3;
  passNode.w = PRIOR_N * 0.3;
  kids.push(passNode);
  node.children = kids;
}

function select(node: Node, rave: boolean): Node {
  const kids = node.children as Node[];
  const logN = Math.log(node.n + 1);
  let best = kids[0];
  let bestV = -Infinity;
  for (const k of kids) {
    let v: number;
    if (rave) {
      const q = k.n ? k.w / k.n : 0.5;
      const rq = k.rn ? k.rw / k.rn : 0.5;
      const beta = Math.sqrt(RAVE_K / (3 * k.n + RAVE_K));
      v = (1 - beta) * q + beta * rq + 0.25 * Math.sqrt(logN / (k.n + 1));
    } else {
      if (k.n === 0) return k;
      v = k.w / k.n + UCT_C * Math.sqrt(logN / k.n);
    }
    // パスは最後の手段（同じ値なら打つほうを選ぶ）
    if (k.move === 0) v -= 0.05;
    if (v > bestV) {
      bestV = v;
      best = k;
    }
  }
  return best;
}

/** 面積で数えた勝者（黒の石＋地 − 白の石＋地 − コミ） */
function areaWinner(b: Board, own: Int8Array, komi: number): Player {
  let d = 0;
  for (let p = 0; p < own.length; p++) {
    if (own[p] === BLACK) d++;
    else if (own[p] === WHITE) d--;
  }
  // 囲まれていない広い空点（探索の途中の両者パス）も数えるため、塗りつぶしで地を足す
  d += regionBalance(b);
  return d - komi > 0 ? BLACK : WHITE;
}

/** 2 つ以上の空点がつながった領域のうち、1 色だけに囲まれたものの差（`areaOwners` は 1 点の眼しか見ない） */
function regionBalance(b: Board): number {
  const seen = new Uint8Array(b.color.length);
  let d = 0;
  for (const start of b.points) {
    if (b.color[start] !== EMPTY || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    let size = 0;
    let touch = 0;
    while (stack.length) {
      const i = stack.pop() as number;
      size++;
      for (const dd of b.dirs) {
        const q = i + dd;
        const v = b.color[q];
        if (v === EMPTY && !seen[q]) {
          seen[q] = 1;
          stack.push(q);
        } else if (v === BLACK || v === WHITE) touch |= v;
      }
    }
    if (size > 1) {
      if (touch === BLACK) d += size - 1;
      else if (touch === WHITE) d -= size - 1;
    }
  }
  return d;
}

function mctsMove(state: IgoState, playouts: number, rave: boolean, rng: () => number): CpuResult {
  const base = boardOf(state);
  const komi = komiFor(state.handicap);
  const me = state.turn;
  const root = newNode(0, me, state.passes);
  expand(root, base, rng, state);
  const firstMover = new Int8Array(base.color.length);
  const path: Node[] = [];
  const pointOwn = new Float64Array(state.cells.length);

  for (let it = 0; it < playouts; it++) {
    const b = base.clone();
    path.length = 0;
    firstMover.fill(0);
    let node = root;
    path.push(node);
    // 選ぶ
    while (node.children && node.children.length && node.passes < 2) {
      const child = select(node, rave);
      const c = node.toMove;
      if (child.move) {
        if (!b.isLegal(child.move, c)) break;
        b.play(child.move, c);
        if (!firstMover[child.move]) firstMover[child.move] = c;
      }
      node = child;
      path.push(node);
    }
    // 広げる
    if (!node.children && node.passes < 2 && node.n >= 1) {
      expand(node, b, rng, null);
      const kids = node.children as Node[] | null;
      if (kids && kids.length) {
        const child = select(node, rave);
        const c = node.toMove;
        if (child.move && b.isLegal(child.move, c)) {
          b.play(child.move, c);
          if (!firstMover[child.move]) firstMover[child.move] = c;
        }
        node = child;
        path.push(node);
      }
    }
    // 打ち切りまで
    if (node.passes < 2) {
      playout(b, node.toMove, rng, node.passes, (i, c) => {
        if (!firstMover[i]) firstMover[i] = c;
      });
    }
    const own = areaOwners(b);
    const winner = areaWinner(b, own, komi);
    for (let p = 0; p < own.length; p++) if (own[p] === me) pointOwn[p]++;
    // 戻す
    for (const nd of path) {
      nd.n++;
      // nd に来た手を打ったのは nd.toMove の相手
      if (winner !== nd.toMove) nd.w++;
      if (rave && nd.children && nd.n < 4000) {
        const mover = nd.toMove;
        for (const k of nd.children) {
          if (k.move && firstMover[k.move] === mover) {
            k.rn++;
            if (winner === mover) k.rw++;
          }
        }
      }
    }
  }

  const kids = root.children as Node[];
  let best = kids[kids.length - 1];
  for (const k of kids) if (k.n > best.n) best = k;
  // 勝率がほぼ並んだら（大差で勝っている・負けている局面ではよくある）、取る・逃げる手を選ぶ。
  // 勝率だけで選ぶと、どこに打っても同じに見えて石を取らない手を打つ
  // 取る手・逃げる手は、勝率が少し劣っても（0.1 まで）選ぶ（取る手を優先）
  const bestRate = best.w / best.n;
  let pick: Node | null = null;
  for (const k of kids) {
    if (!k.move || k.p < 0.9 || k.w / k.n < bestRate - 0.1) continue;
    if (!pick || k.p > pick.p || (k.p === pick.p && k.n > pick.n)) pick = k;
  }
  if (pick) best = pick;
  if (best.move === 0) return { move: PASS, playouts };
  const rate = best.n ? best.w / best.n : 0;
  // 盤が決まっている（打つ点がもう自分か相手の地として 9 割決まっている）ならパス。
  // 自分の地に打っても目が減るだけ、相手の地に打てばあげはまを渡すだけ（日本式）
  const p = base.toPoint(best.move);
  const mine = pointOwn[p] / playouts;
  if (mine > 0.9 || mine < 0.1) {
    if (state.passes > 0 || rate > 0.9 || rate < 0.1) return { move: PASS, playouts };
  }
  return { move: p, playouts };
}

/**
 * 相手がパスした直後に、いまパスして数えたら勝てるか（死に石の候補で数える）。
 * 画面からは使わないが、テストで「CPU は負けている局面でパスしない」を見るのに使う。
 */
export function winsIfCountedNow(state: IgoState, me: Player, seed: number): boolean {
  const dead = estimateDead(state, mulberry32(seed));
  return scoreGame(state, dead).winner === me;
}
