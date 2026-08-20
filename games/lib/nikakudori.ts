/**
 * 二角取り（麻雀牌のペア消しパズル）のロジック
 *
 * 仕様: docs/features/game-nikakudori.md
 *
 * 盤面は「1層の格子」で、同じ絵柄の2枚を**曲がり角2回以内（直線3本以内）**で
 * 結べる経路が空きマス上にあるとき、2枚とも消せる。経路は**盤の外を含めて**通れる。
 *
 * 3つの本体：
 *
 * 1. **経路探索（`findPath`）** — 2枚の間に「直線3本以内」で辿れる経路があるかを判定
 *    し、あるなら経路の角の座標を返す（描画で線を引くのに使う）
 * 2. **必ずクリアできる配り方（`deal`）** — 空の盤から**逆再生で**2枚ずつ「合う組」を
 *    置いていく。置くときに「そのマス2つの間に空きマス経由の経路が立つ」ことを確かめる。
 *    play で消す順は生成の逆になり、消すたびに経路が必ず立つ
 * 3. **詰み検出（`deadlocked`）** — 場に残った牌に、消せる組が1つも無い状態
 *
 * 牌は数牌27＋字牌7の**34種のみ**を使い、花牌・季節牌は入れない
 * （麻雀ソリティアで使っていた bonus 牌は「同組ならどれとでも合う」特殊ルールが
 * このゲームと合わないため。仕様書の「使う牌」）。
 *
 * 座標は 1マス＝整数1 の格子。盤の外周を「常に空き」として辿れる仕様のため、
 * `findPath` は grid の外に出た座標も空きマスとして扱う（無限に外へ出られる）。
 */

import { STANDARD_FACES } from './mahjong-tiles';

/** テストで結果を固定するための注入可能な乱数 */
export type Rng = () => number;

/** 難易度。盤の広さと使う絵柄の種類数だけが違う */
export type Level = 'small' | 'medium' | 'large';

export interface LevelDef {
  label: string;
  cols: number;
  rows: number;
  /** 使う絵柄の種類数。牌数 = kinds × 4（各絵柄4枚ずつで必ず偶数枚になる） */
  kinds: number;
}

/**
 * 3段階の難易度。
 * 牌数はすべて偶数、しかも4の倍数（各絵柄を4枚ずつ入れるため）。
 * スマホの狭い画面では `small` を既定にする（`Game.tsx`）。
 */
export const LEVELS: Record<Level, LevelDef> = {
  small: { label: '小 10×6', cols: 10, rows: 6, kinds: 15 },
  medium: { label: '中 12×7', cols: 12, rows: 7, kinds: 21 },
  large: { label: '標準 14×8', cols: 14, rows: 8, kinds: 28 },
};

export const DEFAULT_LEVEL: Level = 'small';

/** マスの2次元座標 */
export interface Point {
  r: number;
  c: number;
}

/** 経路。始点・角・終点を順に並べる（描画側が polyline としてつなぐ） */
export type Path = Point[];

function idxOf(cols: number, r: number, c: number): number {
  return r * cols + c;
}

/**
 * (r, c) が空きマスとして通れるか。
 *
 * - endpoints（始点・終点）は「通れる」ものとして扱う（端点で切れないため）
 * - **盤の外は常に通れる**（盤外経由の経路を許すため）
 * - それ以外は faces[idx] が null（＝牌が無い）ときだけ通れる
 */
function passable(
  faces: readonly (string | null)[],
  cols: number,
  rows: number,
  r: number,
  c: number,
  endpoints: readonly Point[],
): boolean {
  if (endpoints.some((p) => p.r === r && p.c === c)) return true;
  if (r < 0 || r >= rows || c < 0 || c >= cols) return true;
  return faces[idxOf(cols, r, c)] === null;
}

/** 2点が同じ座標か */
function samePoint(a: Point, b: Point): boolean {
  return a.r === b.r && a.c === b.c;
}

/**
 * 2点間の直線経路が通れるか（端点は除いて、途中のマスがすべて空き）。
 * a と b は同じ行または同じ列にあることが前提。
 */
function straightClear(
  faces: readonly (string | null)[],
  cols: number,
  rows: number,
  a: Point,
  b: Point,
  endpoints: readonly Point[],
): boolean {
  if (a.r === b.r) {
    const [lo, hi] = a.c < b.c ? [a.c + 1, b.c - 1] : [b.c + 1, a.c - 1];
    for (let c = lo; c <= hi; c++) {
      if (!passable(faces, cols, rows, a.r, c, endpoints)) return false;
    }
    return true;
  }
  if (a.c === b.c) {
    const [lo, hi] = a.r < b.r ? [a.r + 1, b.r - 1] : [b.r + 1, a.r - 1];
    for (let r = lo; r <= hi; r++) {
      if (!passable(faces, cols, rows, r, a.c, endpoints)) return false;
    }
    return true;
  }
  return false;
}

/**
 * 直線 a→corner が通れて、かつ corner 自身も通れる（端点扱いではない曲がり角）ことを確かめる。
 */
function segmentAndCornerClear(
  faces: readonly (string | null)[],
  cols: number,
  rows: number,
  a: Point,
  corner: Point,
  endpoints: readonly Point[],
): boolean {
  if (!straightClear(faces, cols, rows, a, corner, endpoints)) return false;
  return passable(faces, cols, rows, corner.r, corner.c, endpoints);
}

/**
 * 経路探索。a と b の間を、**曲がり角2回以内（直線3本以内）**で結べる経路を返す。
 *
 * 返るのは経路の**角の座標を順に並べたもの**（始点 a に始まり、途中に0〜2個の角、
 * 終点 b で終わる）。無ければ null。描画側はこの点列を polyline としてつなぐ。
 *
 * **盤の外を通ってよい**（仕様書「盤外を含めて直線3本以内」）。実装は
 * 中央の行・列を -1..rows / -1..cols の範囲で走査すれば足りる。
 * 盤の外は常に空きなので、−1（あるいは行数）より遠くを通っても結果は変わらない
 * （−1 の行に到達できるなら、−100 の行にも到達できる）。
 */
export function findPath(
  faces: readonly (string | null)[],
  cols: number,
  rows: number,
  a: Point,
  b: Point,
): Path | null {
  if (samePoint(a, b)) return null;
  const endpoints: Point[] = [a, b];

  // 曲がり角0：まっすぐ
  if ((a.r === b.r || a.c === b.c) && straightClear(faces, cols, rows, a, b, endpoints)) {
    return [a, b];
  }

  // 曲がり角1：L字。角は (a.r, b.c) か (b.r, a.c) のどちらか
  for (const corner of [
    { r: a.r, c: b.c },
    { r: b.r, c: a.c },
  ]) {
    if (samePoint(corner, a) || samePoint(corner, b)) continue;
    if (
      passable(faces, cols, rows, corner.r, corner.c, endpoints) &&
      straightClear(faces, cols, rows, a, corner, endpoints) &&
      straightClear(faces, cols, rows, corner, b, endpoints)
    ) {
      return [a, corner, b];
    }
  }

  // 曲がり角2：コの字（中央の水平線または垂直線）
  // 中央が行 r：a→(r, a.c)→(r, b.c)→b
  for (let r = -1; r <= rows; r++) {
    if (r === a.r || r === b.r) continue;
    const c1: Point = { r, c: a.c };
    const c2: Point = { r, c: b.c };
    if (
      segmentAndCornerClear(faces, cols, rows, a, c1, endpoints) &&
      straightClear(faces, cols, rows, c1, c2, endpoints) &&
      passable(faces, cols, rows, c2.r, c2.c, endpoints) &&
      straightClear(faces, cols, rows, c2, b, endpoints)
    ) {
      return [a, c1, c2, b];
    }
  }
  // 中央が列 c：a→(a.r, c)→(b.r, c)→b
  for (let c = -1; c <= cols; c++) {
    if (c === a.c || c === b.c) continue;
    const c1: Point = { r: a.r, c };
    const c2: Point = { r: b.r, c };
    if (
      segmentAndCornerClear(faces, cols, rows, a, c1, endpoints) &&
      straightClear(faces, cols, rows, c1, c2, endpoints) &&
      passable(faces, cols, rows, c2.r, c2.c, endpoints) &&
      straightClear(faces, cols, rows, c2, b, endpoints)
    ) {
      return [a, c1, c2, b];
    }
  }

  return null;
}

/** Fisher–Yates（cards.ts / mahjong-solitaire.ts と同じ形） */
function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 難易度から使う牌の多重集合を作る。
 * 34種を乱数で並べ、先頭から `kinds` 種を採って**各4枚ずつ**入れる。
 * 4枚ずつなので必ず偶数枚。
 */
export function buildPool(level: Level, rng: Rng = Math.random): string[] {
  const { kinds } = LEVELS[level];
  const chosen = shuffled(STANDARD_FACES, rng).slice(0, kinds);
  return chosen.flatMap((face) => [face.id, face.id, face.id, face.id]);
}

/** 何回まで配り直しを試すか（1回でも決まるのがふつう） */
const DEAL_ATTEMPTS = 200;

/** 4方向。上下左右の並び */
const NEIGHBOR_DELTAS: readonly [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/**
 * `cell` の上下左右で `remaining` に残っている隣接マス。
 * 「そのマスと今すぐ組める＝組めば必ず0曲がりで消せる」候補の一覧。
 */
function emptyNeighbors(
  cell: number,
  cols: number,
  rows: number,
  remaining: Set<number>,
): number[] {
  const r = Math.floor(cell / cols);
  const c = cell % cols;
  const out: number[] = [];
  for (const [dr, dc] of NEIGHBOR_DELTAS) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
    const nId = nr * cols + nc;
    if (remaining.has(nId)) out.push(nId);
  }
  return out;
}

/**
 * 場に残ったマスに「合う組」を1組ずつ置いていく順番を作る。
 *
 * 空の状態から始めて、毎回2マスを採って埋める。ここで採った順は、そのまま
 * **逆順の消し順**として使える。（逆順で play するとき、消す2枚を置いた以降の牌は
 * すでに存在しているが、消す2枚は端点なので邪魔しない。ゆえに play 時にも同じ
 * 経路が立つ）
 *
 * 選び方は「**残り空きマスの隣接数（degree）が最小のマスから貪欲に組む**」。
 * 相手は、そのマスの隣のうち周囲がまだ広い方（＝この一手で他を孤立させにくい方）を
 * 選ぶ。degree が 1 のマスは唯一の隣と今すぐ組まないと次のターンに孤立してしまうので、
 * 自然と最優先で組まれる。ドミノ敷き詰めの近似解として実測でほぼ確実に成功する。
 *
 * それでも隣接が1つも見つからないとき（残り空きが飛び地になった場合）は
 * `findPath` で経路が立つ任意の2マスを総当たりで救う（O(N²)。稀にしか通らない）。
 */
function pairOrder(
  cols: number,
  rows: number,
  slots: readonly number[],
  rng: Rng,
): [number, number][] | null {
  const N = cols * rows;
  const faces = new Array<string | null>(N).fill(null);
  // 対象外のマス（シャッフルで場から消えている牌の位置）は「塞がっている」扱い
  const inScope = new Set(slots);
  for (let i = 0; i < N; i++) {
    if (!inScope.has(i)) faces[i] = 'X';
  }

  const remaining = new Set(slots);
  const order: [number, number][] = [];
  const pointOfId = (id: number): Point => ({ r: Math.floor(id / cols), c: id % cols });

  while (remaining.size > 0) {
    const empties = shuffled(Array.from(remaining), rng);
    let picked: [number, number] | null = null;

    // 隣接数が最小のマスを探す（同点は乱数順で先に来た方が勝つ）
    let minDeg = 5;
    let minCell = -1;
    for (const cell of empties) {
      const deg = emptyNeighbors(cell, cols, rows, remaining).length;
      if (deg < minDeg && deg > 0) {
        minDeg = deg;
        minCell = cell;
        if (minDeg === 1) break; // これ以上小さくならない
      }
    }

    if (minCell !== -1) {
      const neighbors = emptyNeighbors(minCell, cols, rows, remaining);
      // 相手も周囲が広い（＝一緒に消えたときに他を孤立させにくい）ほうを選ぶ。
      // 乱数を混ぜて偏りを避ける
      const scored = shuffled(neighbors, rng).map((n) => ({
        n,
        deg: emptyNeighbors(n, cols, rows, remaining).length,
      }));
      scored.sort((a, b) => b.deg - a.deg);
      picked = [minCell, scored[0].n];
    }

    // 隣接がまったく無いとき（残り空きが飛び地になった場合）は経路探索で救う
    if (!picked) {
      for (let i = 0; i < empties.length && !picked; i++) {
        for (let j = i + 1; j < empties.length && !picked; j++) {
          const a = pointOfId(empties[i]);
          const b = pointOfId(empties[j]);
          if (findPath(faces, cols, rows, a, b)) picked = [empties[i], empties[j]];
        }
      }
    }

    if (!picked) return null;

    faces[picked[0]] = 'X';
    faces[picked[1]] = 'X';
    remaining.delete(picked[0]);
    remaining.delete(picked[1]);
    order.push(picked);
  }
  // 配置した順（早い＝play で最後に消える）を、play で消す順に直す
  return order.reverse();
}

/** 多重集合を「同じ絵柄2枚ずつ」の組に分ける。花牌・季節牌は入っていない前提 */
function pairUpFaces(pool: readonly string[], rng: Rng): [string, string][] {
  const byFace = new Map<string, string[]>();
  for (const id of pool) {
    const list = byFace.get(id);
    if (list) list.push(id);
    else byFace.set(id, [id]);
  }
  const pairs: [string, string][] = [];
  for (const [face, list] of byFace) {
    if (list.length % 2 !== 0) {
      throw new Error(`合う2枚に分けられません: ${face} が ${list.length} 枚`);
    }
    for (let i = 0; i < list.length; i += 2) pairs.push([list[i], list[i + 1]]);
  }
  return shuffled(pairs, rng);
}

export interface Arrangement {
  /** マスID → 絵柄ID。場に無いマスは null */
  faces: (string | null)[];
  /** 必ず消せる消し順（play で消す順そのまま。テストがこの順で全消しを確かめる） */
  solution: [number, number][];
}

/**
 * 指定マスに絵柄を配る。**必ずクリアできる配置になる。**
 *
 * @param cols/rows 盤の広さ
 * @param slots 配る対象のマス（新規配りは全マス。シャッフルは残っているマスだけ）
 * @param pool  配る絵柄（枚数は slots と同じ）
 */
export function arrange(
  cols: number,
  rows: number,
  slots: readonly number[],
  pool: readonly string[],
  rng: Rng = Math.random,
): Arrangement {
  if (slots.length !== pool.length) {
    throw new Error(`マスと牌の数が合いません: ${slots.length} !== ${pool.length}`);
  }
  const N = cols * rows;

  for (let attempt = 0; attempt < DEAL_ATTEMPTS; attempt++) {
    const order = pairOrder(cols, rows, slots, rng);
    if (!order) continue;

    const facePairs = pairUpFaces(pool, rng);
    const faces = new Array<string | null>(N).fill(null);
    order.forEach(([a, b], i) => {
      faces[a] = facePairs[i][0];
      faces[b] = facePairs[i][1];
    });
    return { faces, solution: order };
  }
  throw new Error('クリアできる配置を作れませんでした');
}

/** 難易度を1つ選んで配る。**必ずクリアできる配置になる** */
export function deal(level: Level, rng: Rng = Math.random): Arrangement {
  const { cols, rows } = LEVELS[level];
  const N = cols * rows;
  const slots = Array.from({ length: N }, (_, i) => i);
  const pool = buildPool(level, rng);
  return arrange(cols, rows, slots, pool, rng);
}

/**
 * 消したときに `removed` に積む1組ぶんの情報。
 *
 * 絵柄も一緒に持たせるのは undo（もどす）で戻すため。faces には空き（null）に
 * するとき絵柄が消えるので、戻せるように別で覚えておく。同じ絵柄の2枚なので id は1つで足りる。
 */
export interface RemovedPair {
  a: number;
  b: number;
  face: string;
}

/** 盤面の状態。手番の概念が無いのでこれだけ */
export interface NikakudoriState {
  level: Level;
  cols: number;
  rows: number;
  /** マスID → 絵柄ID。空きマスは null */
  faces: (string | null)[];
  /** 消した組を消した順に。もどす（undo）に使う */
  removed: RemovedPair[];
  /** 選択中のマス。未選択は null */
  selected: number | null;
  /** シャッフル回数（成績に記録） */
  shuffles: number;
  /** ヒント回数（成績に記録） */
  hints: number;
}

export function newGame(level: Level = DEFAULT_LEVEL, rng: Rng = Math.random): NikakudoriState {
  const { cols, rows } = LEVELS[level];
  const { faces } = deal(level, rng);
  return {
    level,
    cols,
    rows,
    faces,
    removed: [],
    selected: null,
    shuffles: 0,
    hints: 0,
  };
}

/** 場に残っている枚数 */
export function remaining(state: NikakudoriState): number {
  return state.faces.reduce((n, f) => (f === null ? n : n + 1), 0);
}

/** 全部消したか */
export function cleared(state: NikakudoriState): boolean {
  return state.faces.every((f) => f === null);
}

/** 場に残っているマスID */
export function presentSlots(state: NikakudoriState): number[] {
  return state.faces.flatMap((f, i) => (f === null ? [] : [i]));
}

/** マスIDを座標に */
export function pointOf(cols: number, slot: number): Point {
  return { r: Math.floor(slot / cols), c: slot % cols };
}

/**
 * いま消せる組をすべて返す。
 * ヒント・詰み検出の両方がこれを使う（判定を2か所に書かないため）。
 */
export function availableMatches(state: NikakudoriState): [number, number][] {
  const slots = presentSlots(state);
  const out: [number, number][] = [];
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i];
      const b = slots[j];
      if (state.faces[a] !== state.faces[b]) continue;
      if (findPath(state.faces, state.cols, state.rows, pointOf(state.cols, a), pointOf(state.cols, b))) {
        out.push([a, b]);
      }
    }
  }
  return out;
}

/** 詰み。まだ牌が残っているのに、消せる組が1つも無い */
export function deadlocked(state: NikakudoriState): boolean {
  return !cleared(state) && availableMatches(state).length === 0;
}

/**
 * ヒント。消せる組を1つ返す（無ければ null）。
 * 毎回同じ組を出すと「押しても何も進まない」に見えるので、乱数で選ぶ。
 */
export function hint(state: NikakudoriState, rng: Rng = Math.random): [number, number] | null {
  const matches = availableMatches(state);
  if (matches.length === 0) return null;
  return matches[Math.floor(rng() * matches.length)];
}

/** ヒントを1回使ったことを記録に反映（`hints` を1増やす） */
export function markHint(state: NikakudoriState): NikakudoriState {
  return { ...state, hints: state.hints + 1 };
}

/**
 * 消せる2枚を指定して消す。合わない・経路が立たないなら null。
 * `tap` から呼ばれるが、外からも使える（テストで直接消したいときに）。
 */
export function removePair(
  state: NikakudoriState,
  a: number,
  b: number,
): { state: NikakudoriState; path: Path } | null {
  if (a === b) return null;
  const faceA = state.faces[a];
  const faceB = state.faces[b];
  if (faceA === null || faceB === null) return null;
  if (faceA !== faceB) return null;
  const path = findPath(state.faces, state.cols, state.rows, pointOf(state.cols, a), pointOf(state.cols, b));
  if (!path) return null;

  const faces = [...state.faces];
  faces[a] = null;
  faces[b] = null;
  return {
    state: {
      ...state,
      faces,
      removed: [...state.removed, { a, b, face: faceA }],
      selected: null,
    },
    path,
  };
}

/** タップの結果 */
export type TapResult = 'ignored' | 'selected' | 'deselected' | 'matched' | 'mismatched';

export interface TapOutcome {
  state: NikakudoriState;
  result: TapResult;
  /** 消せたときだけ経路を返す。UI が線を描くのに使う */
  path?: Path;
}

/**
 * 牌をタップしたときの遷移。**操作はこれ1つだけ**（同じ絵柄を2回タップで消す）。
 *
 * - 空きマスは無視する
 * - 選択中のマスをもう一度押すと選択解除
 * - 合う組で経路が立てば2枚とも消える。合わない・経路が無いときは、
 *   押したほうを新しく選択し直す（毎回選択を外すと、次の1枚を選ぶのに2回押すことになる）
 */
export function tap(state: NikakudoriState, slot: number): TapOutcome {
  if (state.faces[slot] === null) return { state, result: 'ignored' };

  if (state.selected === slot) {
    return { state: { ...state, selected: null }, result: 'deselected' };
  }
  if (state.selected === null) {
    return { state: { ...state, selected: slot }, result: 'selected' };
  }

  const removed = removePair(state, state.selected, slot);
  if (removed) {
    return { state: removed.state, result: 'matched', path: removed.path };
  }
  // 絵柄が違う／経路が立たない。選択を押したほうへ移す
  return { state: { ...state, selected: slot }, result: 'mismatched' };
}

/** もどす。直前に消した組を場に戻す。何も消していなければ何もしない */
export function undo(state: NikakudoriState): NikakudoriState {
  if (state.removed.length === 0) return state;
  const removed = [...state.removed];
  const last = removed.pop() as RemovedPair;
  const faces = [...state.faces];
  faces[last.a] = last.face;
  faces[last.b] = last.face;
  return { ...state, faces, removed, selected: null };
}

/**
 * 場に残った牌を可解に配り直す（並べ替え）。
 *
 * **並べ替えたあともクリアできることを保証する。** 残っているマスに対して
 * `arrange` を回すだけなので、詰みで押したのに詰みのまま、が起きない。
 * もどす履歴は消す（戻した先の絵柄がもう違うため、戻せると嘘になる）。
 * `shuffles` を1増やして成績に反映する。
 */
export function shuffleRemaining(state: NikakudoriState, rng: Rng = Math.random): NikakudoriState {
  const slots = presentSlots(state);
  if (slots.length === 0) return { ...state, selected: null };

  const pool = slots.map((i) => state.faces[i] as string);
  let arranged: Arrangement;
  try {
    arranged = arrange(state.cols, state.rows, slots, pool, rng);
  } catch {
    // 残った絵柄がどう並べても経路が立たない、という取り切れない残り方
    // （現実には稀だが、上下に2枚だけ、といった構成で起こりうる）。盤面は触らない
    return { ...state, selected: null, shuffles: state.shuffles + 1 };
  }
  // arrange は「対象外のマスは null」の全長配列を返すので、そのまま採用してよい
  return {
    ...state,
    faces: arranged.faces,
    removed: [],
    selected: null,
    shuffles: state.shuffles + 1,
  };
}

/** 盤の大きさ（マス数）。テスト・UI から参照する */
export function tileCount(level: Level): number {
  const { cols, rows } = LEVELS[level];
  return cols * rows;
}
