/**
 * 囲碁（6路・9路）のルール。純関数と、探索用の速い盤（`Board`）。
 *
 * 仕様: docs/features/game-igo.md
 *
 * ## 2つの盤の持ち方
 *
 * - **画面とテストが触るのは `IgoState`**（`cells` は `size*size` の素の配列。`r*size+c`）。
 *   1手ごとに新しい状態を返す純関数で進める（「1手もどす」は履歴を切るだけ）
 * - **探索（`lib/igo-cpu.ts`）とルールの中身は `Board`**。番兵つきの1次元配列で、
 *   石のかたまり（連）ごとに「擬似呼吸点」の数・座標の和・座標の二乗の和を持つ。
 *   呼吸点が 0 か・ちょうど 1 つ（アタリ）かが、盤を舐めずに O(1) で分かる
 *   （和² ＝ 数 × 二乗の和 のとき、数えた呼吸点がすべて同じ点）。
 *   プレイアウトを1手あたり数千回回すので、ここが遅いと「つよい」が待たされる
 *
 * ## コウ
 *
 * 仕様のとおり**スーパーコウ（手番を含めた同形反復の禁止）**。盤面の Zobrist ハッシュを
 * 履歴に持ち、打った後の盤面＋次の手番が過去と同じになる手を禁じる。
 * 探索の中（プレイアウト）では単純なコウ（直前に1子を取られた点に、すぐ1子を取り返す手）
 * だけを見る。CPU が最後に選ぶ手は `isLegal` でスーパーコウまで確かめる。
 */

export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
/** 盤の外（番兵） */
const EDGE = 3;

export type Player = typeof BLACK | typeof WHITE;
export type Cell = typeof EMPTY | Player;
export type BoardSize = 6 | 9;
export type Mode = 'ishitori' | 'taikyoku';

/** パス（`IgoState.last` と CPU の返す手で使う） */
export const PASS = -1;
/** まだ1手も打っていない */
export const NONE = -2;

export const SIZES: readonly BoardSize[] = [6, 9];
/** 石取りで勝ちになる取った数 */
export const ISHITORI_TARGETS = [1, 3, 5] as const;
export type IshitoriTarget = (typeof ISHITORI_TARGETS)[number];
/** 対局の置き石（0 は互先） */
export const HANDICAPS = [0, 2, 3, 4, 5] as const;
export type Handicap = (typeof HANDICAPS)[number];

/** 互先のコミ（白に足す）。日本式・9路 */
export const KOMI = 6.5;
/** 置き石のときのコミ */
export const HANDICAP_KOMI = 0.5;

export function opponent(p: Player): Player {
  return p === BLACK ? WHITE : BLACK;
}

export function komiFor(handicap: number): number {
  return handicap > 0 ? HANDICAP_KOMI : KOMI;
}

// ---------------------------------------------------------------------------
// 座標
// ---------------------------------------------------------------------------

const KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

/**
 * 交点の呼び名。**横を算用数字・縦を漢数字**で「横の数の縦の数」（例「5の三」）。
 * 新聞の囲碁欄・棋書と同じ形で、横は左から 1〜、縦は上から 一〜。
 */
export function pointLabel(size: number, p: number): string {
  if (p === PASS) return 'パス';
  const r = Math.floor(p / size);
  const c = p % size;
  return `${c + 1}の${KANJI[r]}`;
}

/** 盤の縁に描く横の数（1〜）・縦の数（一〜） */
export function columnLabels(size: number): string[] {
  return Array.from({ length: size }, (_, i) => String(i + 1));
}

export function rowLabels(size: number): string[] {
  return KANJI.slice(0, size);
}

/** 横の数・縦の数（どちらも 1 始まり）から交点の番号 */
export function pointAt(size: number, col: number, row: number): number {
  return (row - 1) * size + (col - 1);
}

/** 星。6路は無し、9路は 3-3・7-7・3-7・7-3・天元（5-5） */
export function starPoints(size: number): number[] {
  if (size !== 9) return [];
  return [pointAt(9, 3, 3), pointAt(9, 7, 3), pointAt(9, 3, 7), pointAt(9, 7, 7), pointAt(9, 5, 5)];
}

/**
 * 置き石の位置（9路）。2 子は右上と左下、3 子は＋右下、4 子は四隅、5 子は＋天元。
 * 置き石のある対局は白から打つ。
 */
export function handicapPoints(handicap: number): number[] {
  const ur = pointAt(9, 7, 3);
  const ll = pointAt(9, 3, 7);
  const lr = pointAt(9, 7, 7);
  const ul = pointAt(9, 3, 3);
  const center = pointAt(9, 5, 5);
  switch (handicap) {
    case 2:
      return [ur, ll];
    case 3:
      return [ur, ll, lr];
    case 4:
      return [ur, ll, lr, ul];
    case 5:
      return [ur, ll, lr, ul, center];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Zobrist ハッシュ（スーパーコウ）
// ---------------------------------------------------------------------------

/** 固定の種の擬似乱数（mulberry32。lib/daily.ts と同じ作り）。ハッシュは端末をまたいで同じ値になる */
function seeded(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/** 盤の大きさごとに、点×色の乱数を2本（合わせて64ビット）持つ */
const zobristCache = new Map<number, { a: Uint32Array; b: Uint32Array; turnA: number; turnB: number }>();

function zobrist(size: number) {
  let z = zobristCache.get(size);
  if (!z) {
    const next = seeded(0x1960 + size);
    const a = new Uint32Array(size * size * 2);
    const b = new Uint32Array(size * size * 2);
    for (let i = 0; i < a.length; i++) {
      a[i] = next();
      b[i] = next();
    }
    z = { a, b, turnA: next(), turnB: next() };
    zobristCache.set(size, z);
  }
  return z;
}

/** 盤面＋次の手番のハッシュ（文字列。履歴の比較に使う） */
export function positionHash(size: number, cells: ArrayLike<number>, turn: Player): string {
  const z = zobrist(size);
  let ha = 0;
  let hb = 0;
  for (let p = 0; p < size * size; p++) {
    const v = cells[p];
    if (v === BLACK || v === WHITE) {
      const k = p * 2 + (v - 1);
      ha ^= z.a[k];
      hb ^= z.b[k];
    }
  }
  if (turn === WHITE) {
    ha ^= z.turnA;
    hb ^= z.turnB;
  }
  return `${(ha >>> 0).toString(36)}.${(hb >>> 0).toString(36)}`;
}

// ---------------------------------------------------------------------------
// 速い盤（探索とルールの中身）
// ---------------------------------------------------------------------------

/**
 * 番兵つきの盤。添字は `(r+1)*(size+2)+(c+1)`。
 *
 * 連（縦横につながった同じ色の石）は、代表の点（`head`）と、石をつなぐ輪（`next`）で持つ。
 * 呼吸点は「石と空点の隣り合い」の数（擬似呼吸点）で数える。同じ空点に2つの石が
 * 隣り合っていれば2と数えるが、0 かどうか・1つの点だけかどうかは正しく分かる。
 */
export class Board {
  readonly size: number;
  readonly stride: number;
  readonly color: Int8Array;
  readonly head: Int16Array;
  readonly next: Int16Array;
  /** 連ごと（代表の点で引く）の擬似呼吸点の数・座標の和・二乗の和・石の数 */
  readonly libs: Int32Array;
  readonly libSum: Int32Array;
  readonly libSq: Float64Array;
  readonly stones: Int16Array;
  /** 単純なコウで打てない点（無ければ 0） */
  ko = 0;
  /** あげはま。`captured[BLACK]` は黒が取った白石の数 */
  readonly captured = [0, 0, 0];
  /** 盤の上の点（番兵を除く）の添字 */
  readonly points: Int16Array;
  readonly dirs: readonly number[];

  constructor(size: number) {
    this.size = size;
    this.stride = size + 2;
    const n = this.stride * this.stride;
    this.color = new Int8Array(n).fill(EDGE);
    this.head = new Int16Array(n);
    this.next = new Int16Array(n);
    this.libs = new Int32Array(n);
    this.libSum = new Int32Array(n);
    this.libSq = new Float64Array(n);
    this.stones = new Int16Array(n);
    this.points = new Int16Array(size * size);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const i = (r + 1) * this.stride + c + 1;
        this.color[i] = EMPTY;
        this.points[r * size + c] = i;
      }
    }
    this.dirs = [-this.stride, 1, this.stride, -1];
  }

  static fromCells(size: number, cells: ArrayLike<number>, ko = -1): Board {
    const b = new Board(size);
    for (let p = 0; p < size * size; p++) {
      const v = cells[p];
      if (v === BLACK || v === WHITE) b.place(b.points[p], v as Player);
    }
    b.ko = ko >= 0 ? b.points[ko] : 0;
    return b;
  }

  clone(): Board {
    const b = Object.create(Board.prototype) as Board;
    const w = b as unknown as Record<string, unknown>;
    w.size = this.size;
    w.stride = this.stride;
    w.color = this.color.slice();
    w.head = this.head.slice();
    w.next = this.next.slice();
    w.libs = this.libs.slice();
    w.libSum = this.libSum.slice();
    w.libSq = this.libSq.slice();
    w.stones = this.stones.slice();
    w.ko = this.ko;
    w.captured = this.captured.slice();
    w.points = this.points;
    w.dirs = this.dirs;
    return b;
  }

  /** 盤の添字 → 画面の交点の番号（`r*size+c`） */
  toPoint(i: number): number {
    return (Math.floor(i / this.stride) - 1) * this.size + ((i % this.stride) - 1);
  }

  /** 画面の交点の番号 → 盤の添字 */
  toIndex(p: number): number {
    return this.points[p];
  }

  cells(): number[] {
    const out = new Array<number>(this.size * this.size);
    for (let p = 0; p < out.length; p++) out[p] = this.color[this.points[p]];
    return out;
  }

  private addLib(h: number, lib: number) {
    this.libs[h]++;
    this.libSum[h] += lib;
    this.libSq[h] += lib * lib;
  }

  private removeLib(h: number, lib: number) {
    this.libs[h]--;
    this.libSum[h] -= lib;
    this.libSq[h] -= lib * lib;
  }

  /** 連の呼吸点がちょうど1つ（アタリ）か */
  inAtari(i: number): boolean {
    const h = this.head[i];
    const n = this.libs[h];
    if (n === 0) return false;
    const s = this.libSum[h];
    return s * s === n * this.libSq[h];
  }

  /** アタリの連の、ただ1つの呼吸点 */
  atariLib(i: number): number {
    const h = this.head[i];
    return this.libSum[h] / this.libs[h];
  }

  /** 連の呼吸点（重複なし）。探索の外で使う（遅い） */
  libertiesOf(i: number): number[] {
    const out = new Set<number>();
    let s = i;
    do {
      for (const d of this.dirs) if (this.color[s + d] === EMPTY) out.add(s + d);
      s = this.next[s];
    } while (s !== i);
    return [...out];
  }

  /** 連の呼吸点の数（重複なし）。4 以上は 4 で打ち切る（戦術の読み用） */
  libertyCount(i: number, cap = 99): number {
    const seen: number[] = [];
    let s = i;
    do {
      for (const d of this.dirs) {
        const q = s + d;
        if (this.color[q] === EMPTY && !seen.includes(q)) {
          seen.push(q);
          if (seen.length >= cap) return cap;
        }
      }
      s = this.next[s];
    } while (s !== i);
    return seen.length;
  }

  stonesOf(i: number): number[] {
    const out: number[] = [];
    let s = i;
    do {
      out.push(s);
      s = this.next[s];
    } while (s !== i);
    return out;
  }

  /**
   * 置いてよいか（空点・単純なコウでない・自殺手でない）。スーパーコウは見ない。
   */
  isLegal(i: number, c: Player): boolean {
    if (this.color[i] !== EMPTY || i === this.ko) return false;
    return !this.isSuicide(i, c);
  }

  /** 打った石の連の呼吸点が 0 になり、相手の石も取れない手 */
  isSuicide(i: number, c: Player): boolean {
    const o = opponent(c);
    for (const d of this.dirs) {
      const q = i + d;
      const v = this.color[q];
      if (v === EMPTY) return false;
      if (v === c && !this.inAtari(q)) return false;
      if (v === o && this.inAtari(q)) return false;
    }
    return true;
  }

  /** 自分の眼（4方が自分の石か盤外で、斜めに相手の石が多すぎない点）。プレイアウトで眼をつぶさないため */
  isEyeOf(i: number, c: Player): boolean {
    if (this.color[i] !== EMPTY) return false;
    for (const d of this.dirs) {
      const v = this.color[i + d];
      if (v !== c && v !== EDGE) return false;
    }
    const s = this.stride;
    let bad = 0;
    let edge = 0;
    for (const d of [-s - 1, -s + 1, s - 1, s + 1]) {
      const v = this.color[i + d];
      if (v === EDGE) edge = 1;
      else if (v !== c && v !== EMPTY) bad++;
      else if (v === EMPTY) {
        // 斜めの空点は、相手がそこに打てるなら半分だけ危ない。簡単のため数えない
      }
    }
    return bad + edge < 2;
  }

  /**
   * 石を置く（合法かどうかは呼ぶ側が確かめる）。取った石の数を返す。
   * `removed` を渡すと、取った石の添字をそこに足す。
   */
  play(i: number, c: Player, removed?: number[]): number {
    this.place(i, c);
    const o = opponent(c);
    let total = 0;
    let lastCaptured = 0;
    for (const d of this.dirs) {
      const q = i + d;
      if (this.color[q] === o && this.libs[this.head[q]] === 0) {
        const n = this.capture(this.head[q], removed);
        total += n;
        lastCaptured = q;
      }
    }
    this.captured[c] += total;
    // 単純なコウ：1子を取り、打った石が1子のままアタリなら、取られた点にすぐは打てない
    const h = this.head[i];
    this.ko = total === 1 && this.stones[h] === 1 && this.inAtari(i) ? lastCaptured : 0;
    return total;
  }

  /** 石を置いて、隣の連とつなぎ、呼吸点を付け替える（取りはしない） */
  private place(i: number, c: Player) {
    this.color[i] = c;
    this.head[i] = i;
    this.next[i] = i;
    this.libs[i] = 0;
    this.libSum[i] = 0;
    this.libSq[i] = 0;
    this.stones[i] = 1;
    for (const d of this.dirs) {
      const q = i + d;
      const v = this.color[q];
      if (v === EMPTY) this.addLib(i, q);
      else if (v === BLACK || v === WHITE) this.removeLib(this.head[q], i);
    }
    for (const d of this.dirs) {
      const q = i + d;
      if (this.color[q] === c && this.head[q] !== this.head[i]) this.merge(this.head[i], this.head[q]);
    }
  }

  private merge(a: number, b: number) {
    // 小さいほうを大きいほうへ付け替える
    if (this.stones[a] < this.stones[b]) {
      const t = a;
      a = b;
      b = t;
    }
    let s = b;
    do {
      this.head[s] = a;
      s = this.next[s];
    } while (s !== b);
    const na = this.next[a];
    this.next[a] = this.next[b];
    this.next[b] = na;
    this.libs[a] += this.libs[b];
    this.libSum[a] += this.libSum[b];
    this.libSq[a] += this.libSq[b];
    this.stones[a] += this.stones[b];
  }

  private capture(h: number, removed?: number[]): number {
    const list = this.stonesOf(h);
    for (const s of list) this.color[s] = EMPTY;
    for (const s of list) {
      removed?.push(s);
      for (const d of this.dirs) {
        const q = s + d;
        const v = this.color[q];
        if (v === BLACK || v === WHITE) this.addLib(this.head[q], s);
      }
    }
    return list.length;
  }
}

// ---------------------------------------------------------------------------
// 画面・テストが使う状態
// ---------------------------------------------------------------------------

export interface IgoState {
  size: BoardSize;
  /** `size*size`。0 空き・1 黒・2 白 */
  cells: number[];
  turn: Player;
  /** あげはま。`captures[BLACK]` は黒が取った白石の数（添字 0 は使わない） */
  captures: [number, number, number];
  /** 続けてパスした回数 */
  passes: number;
  /** 直前の手（交点の番号・`PASS`・`NONE`） */
  last: number;
  /** 直前の手で取られた石の点（画面で消える演出に使う） */
  lastCaptured: number[];
  /** 単純なコウで打てない点（-1 なら無し） */
  ko: number;
  /** これまでの局面のハッシュ（盤面＋次の手番）。スーパーコウの判定に使う */
  seen: string[];
  /** 打った手数（パスも含む） */
  moves: number;
  handicap: number;
}

export function initialState(size: BoardSize = 9, handicap = 0): IgoState {
  const cells = new Array<number>(size * size).fill(EMPTY);
  const h = size === 9 ? handicap : 0;
  for (const p of handicapPoints(h)) cells[p] = BLACK;
  const turn: Player = h >= 2 ? WHITE : BLACK;
  return {
    size,
    cells,
    turn,
    captures: [0, 0, 0],
    passes: 0,
    last: NONE,
    lastCaptured: [],
    ko: -1,
    seen: [positionHash(size, cells, turn)],
    moves: 0,
    handicap: h,
  };
}

export function boardOf(state: IgoState): Board {
  return Board.fromCells(state.size, state.cells, state.ko);
}

export type IllegalReason = 'occupied' | 'suicide' | 'ko';

/** 打てない理由（打てるなら null） */
export function illegalReason(state: IgoState, p: number): IllegalReason | null {
  if (p < 0 || p >= state.cells.length || state.cells[p] !== EMPTY) return 'occupied';
  const b = boardOf(state);
  const i = b.toIndex(p);
  if (b.isSuicide(i, state.turn)) return 'suicide';
  b.play(i, state.turn);
  const hash = positionHash(state.size, b.cells(), opponent(state.turn));
  if (state.seen.includes(hash)) return 'ko';
  return null;
}

export function isLegal(state: IgoState, p: number): boolean {
  return illegalReason(state, p) === null;
}

export const ILLEGAL_MESSAGE: Record<IllegalReason, string> = {
  occupied: 'そこにはもう石があります',
  suicide: 'そこには打てません（自分の石が取られる形です）',
  ko: 'そこには打てません（同じ盤面に戻る手です。コウ）',
};

/** 手番の側が打てる交点の一覧（空点のうち、自殺手にも同形反復にも当たらない手） */
export function legalMoves(state: IgoState): number[] {
  const out: number[] = [];
  for (let p = 0; p < state.cells.length; p++) {
    if (state.cells[p] === EMPTY && isLegal(state, p)) out.push(p);
  }
  return out;
}

export function hasLegalMove(state: IgoState): boolean {
  for (let p = 0; p < state.cells.length; p++) {
    if (state.cells[p] === EMPTY && isLegal(state, p)) return true;
  }
  return false;
}

/** 石を打つ。打てない手なら例外（画面は `illegalReason` で先に確かめる） */
export function play(state: IgoState, p: number): IgoState {
  const reason = illegalReason(state, p);
  if (reason) throw new Error(`illegal move ${p}: ${reason}`);
  const b = boardOf(state);
  const removed: number[] = [];
  const n = b.play(b.toIndex(p), state.turn, removed);
  const cells = b.cells();
  const next = opponent(state.turn);
  const captures: [number, number, number] = [...state.captures];
  captures[state.turn] += n;
  return {
    ...state,
    cells,
    turn: next,
    captures,
    passes: 0,
    last: p,
    lastCaptured: removed.map((i) => b.toPoint(i)),
    ko: b.ko ? b.toPoint(b.ko) : -1,
    seen: [...state.seen, positionHash(state.size, cells, next)],
    moves: state.moves + 1,
  };
}

export function pass(state: IgoState): IgoState {
  const next = opponent(state.turn);
  return {
    ...state,
    turn: next,
    passes: state.passes + 1,
    last: PASS,
    lastCaptured: [],
    ko: -1,
    seen: [...state.seen, positionHash(state.size, state.cells, next)],
    moves: state.moves + 1,
  };
}

/** 交点を打つかパスか、どちらでも（CPU の手を当てるのに使う） */
export function applyMove(state: IgoState, move: number): IgoState {
  return move === PASS ? pass(state) : play(state, move);
}

/** 両者が続けてパスした */
export function bothPassed(state: IgoState): boolean {
  return state.passes >= 2;
}

// ---------------------------------------------------------------------------
// かたまり・アタリ
// ---------------------------------------------------------------------------

/** 縦横でつながった同じ色の石（交点の番号）。空点なら空配列 */
export function groupAt(state: { size: number; cells: number[] }, p: number): number[] {
  const v = state.cells[p];
  if (v !== BLACK && v !== WHITE) return [];
  const n = state.size;
  const seen = new Set<number>([p]);
  const stack = [p];
  while (stack.length) {
    const q = stack.pop() as number;
    for (const r of neighbors(n, q)) {
      if (!seen.has(r) && state.cells[r] === v) {
        seen.add(r);
        stack.push(r);
      }
    }
  }
  return [...seen].sort((a, b) => a - b);
}

export function neighbors(size: number, p: number): number[] {
  const r = Math.floor(p / size);
  const c = p % size;
  const out: number[] = [];
  if (r > 0) out.push(p - size);
  if (c < size - 1) out.push(p + 1);
  if (r < size - 1) out.push(p + size);
  if (c > 0) out.push(p - 1);
  return out;
}

export function libertiesOf(state: { size: number; cells: number[] }, p: number): number[] {
  const set = new Set<number>();
  for (const q of groupAt(state, p)) {
    for (const r of neighbors(state.size, q)) if (state.cells[r] === EMPTY) set.add(r);
  }
  return [...set].sort((a, b) => a - b);
}

/** アタリ（呼吸点が1つ）になっている石の点（赤い縁取りと「アタリ」の札を出す） */
export function atariStones(state: { size: number; cells: number[] }): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (let p = 0; p < state.cells.length; p++) {
    if (state.cells[p] === EMPTY || seen.has(p)) continue;
    const g = groupAt(state, p);
    g.forEach((q) => seen.add(q));
    if (libertiesOf(state, p).length === 1) out.push(...g);
  }
  return out.sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// 石取りの勝敗
// ---------------------------------------------------------------------------

export type Winner = Player | 0;

/**
 * 石取りの決着。決まっていなければ null。
 * (a) 決めた数を先に取ったほうの勝ち
 * (b) 両者が続けてパスしたら、取った数が多いほうの勝ち。同じなら引き分け（0）
 */
export function ishitoriResult(state: IgoState, target: number): Winner | null {
  if (state.captures[BLACK] >= target) return BLACK;
  if (state.captures[WHITE] >= target) return WHITE;
  if (bothPassed(state)) {
    const d = state.captures[BLACK] - state.captures[WHITE];
    return d > 0 ? BLACK : d < 0 ? WHITE : 0;
  }
  return null;
}

/** 石取りで「あと何個取れば勝ち」か */
export function ishitoriRemaining(state: IgoState, target: number, p: Player): number {
  return Math.max(0, target - state.captures[p]);
}

// ---------------------------------------------------------------------------
// 地の数え方（日本式）
// ---------------------------------------------------------------------------

/** 地の図の各交点：黒の地・白の地・ダメ・石（生き） */
export type Owner = 'black' | 'white' | 'dame' | 'stone';

export interface Score {
  /** 黒の地（交点の数） */
  blackTerritory: number;
  whiteTerritory: number;
  /** 黒が取った白石（あげはま＋死に石） */
  blackPrisoners: number;
  whitePrisoners: number;
  /** 黒・白のそれぞれから取った死に石の数（内訳） */
  deadBlack: number;
  deadWhite: number;
  komi: number;
  black: number;
  /** コミ込み */
  white: number;
  /** 勝った色。コミに半目があるので引き分けは無い */
  winner: Player;
  /** 差（目。半目を含む） */
  margin: number;
  /** 交点ごとの持ち主 */
  owners: Owner[];
  /** ダメの数 */
  dame: number;
}

/**
 * 日本式の数え方。死に石を取り除いてから、その色の石だけに囲まれた空点を地として数える。
 * - 黒 ＝ 黒の地 ＋ 白から取った石（あげはま＋死に石）
 * - 白 ＝ 白の地 ＋ 黒から取った石（あげはま＋死に石）＋ コミ
 */
export function scoreGame(state: IgoState, dead: ReadonlySet<number> | readonly number[]): Score {
  const deadSet = new Set(dead);
  const n = state.size;
  const cells = state.cells.map((v, p) => (deadSet.has(p) ? EMPTY : v));
  let deadBlack = 0;
  let deadWhite = 0;
  for (const p of deadSet) {
    if (state.cells[p] === BLACK) deadBlack++;
    else if (state.cells[p] === WHITE) deadWhite++;
  }
  const owners: Owner[] = cells.map((v) => (v === EMPTY ? 'dame' : 'stone'));
  const visited = new Uint8Array(cells.length);
  let blackTerritory = 0;
  let whiteTerritory = 0;
  let dame = 0;
  for (let p = 0; p < cells.length; p++) {
    if (cells[p] !== EMPTY || visited[p]) continue;
    const region: number[] = [];
    let touches = 0;
    const stack = [p];
    visited[p] = 1;
    while (stack.length) {
      const q = stack.pop() as number;
      region.push(q);
      for (const r of neighbors(n, q)) {
        const v = cells[r];
        if (v === EMPTY) {
          if (!visited[r]) {
            visited[r] = 1;
            stack.push(r);
          }
        } else touches |= v;
      }
    }
    const owner: Owner = touches === BLACK ? 'black' : touches === WHITE ? 'white' : 'dame';
    for (const q of region) owners[q] = owner;
    if (owner === 'black') blackTerritory += region.length;
    else if (owner === 'white') whiteTerritory += region.length;
    else dame += region.length;
  }
  const komi = komiFor(state.handicap);
  const blackPrisoners = state.captures[BLACK] + deadWhite;
  const whitePrisoners = state.captures[WHITE] + deadBlack;
  const black = blackTerritory + blackPrisoners;
  const white = whiteTerritory + whitePrisoners + komi;
  const winner: Player = black > white ? BLACK : WHITE;
  return {
    blackTerritory,
    whiteTerritory,
    blackPrisoners,
    whitePrisoners,
    deadBlack,
    deadWhite,
    komi,
    black,
    white,
    winner,
    margin: Math.abs(black - white),
    owners,
    dame,
  };
}

/** 「4目半」「半目」の形 */
export function marginLabel(margin: number): string {
  const whole = Math.floor(margin);
  const half = margin - whole >= 0.5;
  if (whole === 0) return half ? '半目' : '0目';
  return `${whole}目${half ? '半' : ''}`;
}

/** 「黒 23 目・白 21 目＋コミ 6.5 ＝ 27.5 目 → 白の 4 目半勝ち」 */
export function scoreSentence(s: Score): string {
  const whiteBase = s.white - s.komi;
  const who = s.winner === BLACK ? '黒' : '白';
  return `黒 ${s.black} 目・白 ${whiteBase} 目＋コミ ${s.komi} ＝ ${s.white} 目 → ${who}の${marginLabel(s.margin)}勝ち`;
}

// ---------------------------------------------------------------------------
// 終局：死に石の候補と、CPU と意見が分かれたとき
// ---------------------------------------------------------------------------

/** 再開できるのは1局に2回まで（3回目は候補のとおりに数える） */
export const MAX_RESUMES = 2;

export type CountDecision =
  | { action: 'count'; dead: number[]; recorded: boolean }
  | { action: 'resume' };

function sameSet(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

/**
 * 「この形で数える」を押したときの決め方。
 *
 * - 対面：どちらがタップしてもよく、そのまま数える（記録は付けない）
 * - CPU 対戦：候補のとおりなら数えて記録する。**候補と違う直し方なら再開**
 *   （死活で意見が分かれたら実際に打って確かめる）。ただし再開は2回まで。
 *   3回目は直しを捨てて**候補のとおりに数える**（記録は付く）。
 *   プレイヤーが直しただけの勝ちは記録に入らない
 */
export function decideCount(opts: {
  vsCpu: boolean;
  candidates: readonly number[];
  chosen: readonly number[];
  resumes: number;
}): CountDecision {
  if (!opts.vsCpu) return { action: 'count', dead: [...opts.chosen], recorded: false };
  if (sameSet(opts.candidates, opts.chosen)) {
    return { action: 'count', dead: [...opts.candidates], recorded: true };
  }
  if (opts.resumes < MAX_RESUMES) return { action: 'resume' };
  return { action: 'count', dead: [...opts.candidates], recorded: true };
}

/** 死に石の候補のタップ：そのかたまりの「死に／生き」を切り替える */
export function toggleDead(state: IgoState, dead: readonly number[], p: number): number[] {
  const g = groupAt(state, p);
  if (g.length === 0) return [...dead];
  const set = new Set(dead);
  const isDead = set.has(p);
  for (const q of g) {
    if (isDead) set.delete(q);
    else set.add(q);
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * 対局が終わった局面か。
 * - 石取り：決着がついた（取った数か両者パス）
 * - 対局：両者パス（このあと数える画面へ）
 */
export function isOver(state: IgoState, mode: Mode, target: number): boolean {
  if (mode === 'ishitori') return ishitoriResult(state, target) !== null;
  return bothPassed(state);
}

/** 「1手もどす」で戻る手数。CPU 対戦は自分と CPU の2手、対面は1手 */
export function undoSteps(vsCpu: boolean): number {
  return vsCpu ? 2 : 1;
}

/**
 * 「1手もどす」の戻り先（履歴の添字）。戻れなければ null。
 * CPU 対戦では、自分の手番の局面まで戻す（置き石で白から始まる局面も考える）。
 */
export function undoIndex(history: readonly IgoState[], human: Player | null): number | null {
  if (history.length <= 1) return null;
  if (human === null) return history.length - 2;
  for (let i = history.length - 2; i >= 0; i--) {
    if (history[i].turn === human) return i;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 計測の action
// ---------------------------------------------------------------------------

export type Level = 'easy' | 'normal' | 'hard';
export const LEVELS: Record<Level, { label: string }> = {
  easy: { label: 'かんたん' },
  normal: { label: 'ふつう' },
  hard: { label: 'つよい' },
};

/** `begin-ishitori-6-easy`・`begin-taikyoku-9-hard`・対面は `begin-pvp-ishitori-6` */
export function beginAction(mode: Mode, size: number, level: Level | null): string {
  return level ? `begin-${mode}-${size}-${level}` : `begin-pvp-${mode}-${size}`;
}

/** 記録の区分（モード × 盤 × 強さ。置き石つきは別に数える） */
export function recordVariant(mode: Mode, size: number, level: Level, handicap: number): string {
  return `${mode}-${size}-${level}${handicap > 0 ? '-handicap' : ''}`;
}

/** リバーシの対局後の画面から来た印（URL パラメータは付けない） */
export const FROM_REVERSI_KEY = 'igo-from';

/** リバーシ側で、囲碁へのリンクを押したときに印を置く（`public` にする PR でリンクを足す） */
export function markFromReversi(): void {
  try {
    sessionStorage.setItem(FROM_REVERSI_KEY, 'reversi');
  } catch {
    // 印が置けなくても遊べる
  }
}

/** 印があれば消して true（最初の1局の `begin-*` にだけ `-from-reversi` を付ける） */
export function takeFromReversi(): boolean {
  try {
    if (sessionStorage.getItem(FROM_REVERSI_KEY) !== 'reversi') return false;
    sessionStorage.removeItem(FROM_REVERSI_KEY);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// プレイアウト（CPU の探索と、死に石の候補の両方で使う）
// ---------------------------------------------------------------------------

/**
 * 盤が終わるまで両者に打たせる（軽い方針つき）。打った手は `onMove` に渡す。
 *
 * 方針：直前の手のまわりで (1) 取れる相手の石は取る (2) アタリの自分の石は逃げる。
 * それ以外は空点からランダム。**自分の眼はつぶさない**（つぶすと生きた石まで死んでしまい、
 * 数えた結果が当てにならない）。両者が続けてパスするか、手数の上限で終わる。
 */
export function playout(
  b: Board,
  turn: Player,
  rng: () => number,
  passesSoFar = 0,
  onMove?: (i: number, c: Player) => void,
): void {
  const pts = b.points;
  const n = pts.length;
  let passes = passesSoFar;
  let last = 0;
  const limit = n * 3;
  for (let m = 0; m < limit && passes < 2; m++) {
    let move = 0;
    if (last) move = tacticalReply(b, last, turn);
    if (!move) {
      const start = (rng() * n) | 0;
      for (let k = 0; k < n; k++) {
        const i = pts[(start + k) % n];
        if (b.color[i] !== EMPTY || i === b.ko) continue;
        if (b.isEyeOf(i, turn)) continue;
        if (b.isSuicide(i, turn)) continue;
        move = i;
        break;
      }
    }
    if (move) {
      b.play(move, turn);
      onMove?.(move, turn);
      passes = 0;
      last = move;
    } else {
      passes++;
      last = 0;
    }
    turn = opponent(turn);
  }
}

/** 直前の手 `last` のまわりで、取れる石を取る・アタリを逃げる手（無ければ 0） */
function tacticalReply(b: Board, last: number, turn: Player): number {
  const o = opponent(turn);
  // 打たれた石そのものがアタリなら取る
  if (b.color[last] === o && b.inAtari(last)) {
    const lib = b.atariLib(last);
    if (b.isLegal(lib, turn)) return lib;
  }
  for (const d of b.dirs) {
    const q = last + d;
    if (b.color[q] === turn && b.inAtari(q)) {
      const lib = b.atariLib(q);
      // 逃げた先も呼吸点が1つしかないなら逃げない（無駄に石を増やす）
      if (b.isLegal(lib, turn) && escapeGains(b, lib, turn)) return lib;
    }
  }
  return 0;
}

/** そこに打てば呼吸点が2つ以上になるか（隣の空点の数と、取れる相手の石で見積もる） */
function escapeGains(b: Board, i: number, c: Player): boolean {
  let empties = 0;
  for (const d of b.dirs) {
    const q = i + d;
    const v = b.color[q];
    if (v === EMPTY) empties++;
    else if (v === c && !b.inAtari(q)) return true;
    else if (v === opponent(c) && b.inAtari(q)) return true;
  }
  return empties >= 2;
}

/** プレイアウトの終わった盤の、交点ごとの持ち主（石か、4方を1色だけに囲まれた空点） */
export function areaOwners(b: Board): Int8Array {
  const out = new Int8Array(b.points.length);
  for (let p = 0; p < b.points.length; p++) {
    const i = b.points[p];
    const v = b.color[i];
    if (v === BLACK || v === WHITE) {
      out[p] = v;
      continue;
    }
    let touch = 0;
    for (const d of b.dirs) {
      const w = b.color[i + d];
      if (w === BLACK || w === WHITE) touch |= w;
    }
    out[p] = touch === BLACK || touch === WHITE ? touch : 0;
  }
  return out;
}

/** 死に石の候補を推すときのプレイアウトの回数 */
export const DEAD_PLAYOUTS = 400;
/** かたまりが相手の色になった割合がこれを超えたら死に石の候補 */
export const DEAD_THRESHOLD = 0.7;

/**
 * 交点ごとの「黒になった割合」（0〜1）。白は 1 − 割合 ではなく、別に数える。
 */
export function ownership(
  state: IgoState,
  rng: () => number,
  playouts = DEAD_PLAYOUTS,
): { black: Float64Array; white: Float64Array } {
  const base = boardOf(state);
  const n = state.cells.length;
  const black = new Float64Array(n);
  const white = new Float64Array(n);
  for (let k = 0; k < playouts; k++) {
    const b = base.clone();
    b.ko = 0;
    playout(b, state.turn, rng);
    const own = areaOwners(b);
    for (let p = 0; p < n; p++) {
      if (own[p] === BLACK) black[p]++;
      else if (own[p] === WHITE) white[p]++;
    }
  }
  for (let p = 0; p < n; p++) {
    black[p] /= playouts;
    white[p] /= playouts;
  }
  return { black, white };
}

/**
 * 死に石の候補。プレイアウトを回し、かたまりの石が平均で 7 割を超えて
 * 相手の色になっていれば候補にする。**推すだけで、決めるのはプレイヤー**。
 */
export function estimateDead(state: IgoState, rng: () => number, playouts = DEAD_PLAYOUTS): number[] {
  const own = ownership(state, rng, playouts);
  const seen = new Set<number>();
  const dead: number[] = [];
  for (let p = 0; p < state.cells.length; p++) {
    const v = state.cells[p];
    if (v === EMPTY || seen.has(p)) continue;
    const g = groupAt(state, p);
    g.forEach((q) => seen.add(q));
    const other = v === BLACK ? own.white : own.black;
    const avg = g.reduce((s, q) => s + other[q], 0) / g.length;
    if (avg > DEAD_THRESHOLD) dead.push(...g);
  }
  return dead.sort((a, b) => a - b);
}
