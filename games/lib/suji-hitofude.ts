/**
 * ひとふでナンバー（数字を順にたどって全マスを一筆書きする純ロジックパズル）のロジック
 *
 * 仕様: docs/features/game-suji-hitofude.md
 *
 * ## ルール
 *
 * - N×N の盤のいくつかのマスに番号（1, 2, 3, …）が置いてある
 * - **1 から始めて番号を昇順にたどる 1 本の道**を縦横に引く（斜め不可）
 * - **すべてのマスをちょうど 1 回ずつ通り**、最後の番号で終わる
 * - むずかしいでは、マスとマスの間に**壁**があり、そこは通れない
 * - 解は 1 通り（生成時にソルバーで一意性を保証する）
 *
 * ## 生成の順番
 *
 * 1. 蛇行（ブストロフェドン）で全マスを埋めた道から始め、**バックビット法**で
 *    道の端をつなぎ替えてランダムにする（全マスを通る道が常に得られる）
 * 2. 道の始点を 1、終点を最後の番号にし、途中に等間隔＋乱れで番号を置く
 * 3. （むずかしい）道が通っていないマス境界から壁を選ぶ（道は壊れない）
 * 4. ソルバーで解を数え、**2 通り以上なら番号を 1 つ足して**数え直す
 *
 * **打ち切りは試行回数（探索の節点数・作り直しの回数）で決め、時間では決めない。**
 * 時間で打ち切ると、同じ日付でも端末によって盤面が変わり、
 * 日替わりが「全員同じ問題」でなくなる（星置きの #242 と同じ方針）。
 *
 * ## 乱数
 *
 * 乱数はすべて引数で受け取る（`lib/daily.ts` の `mulberry32`）。
 * このファイルから `Math.random()` を呼ばないこと。
 */

import { dailySeed, localDateKey, mulberry32, type DateKey } from './daily';

/** 乱数。`[0, 1)` を返す */
export type Rng = () => number;

/** 盤面（出題）。道（`solution`）は答えなので画面には出さない */
export interface Puzzle {
  /** 1辺のマス数 */
  size: number;
  /** 各マスの番号（0 は番号なし）。長さは size × size */
  numbers: number[];
  /** 壁のあるマス境界（`edgeKey` の値）。昇順 */
  walls: number[];
  /** 解（通るマスの添字を道の順に）。一意であることは生成時に確かめている */
  solution: number[];
}

/** 難易度のモード。`daily` は「今日の1問」 */
export type Mode = 'easy' | 'normal' | 'hard' | 'daily';

export interface ModeDef {
  label: string;
  size: number;
  /** 最初に置く番号の数の範囲（一意にならなければ上限を超えて足すことがある） */
  minNumbers: number;
  maxNumbers: number;
  /** 壁の本数の範囲（0 なら壁なし） */
  minWalls: number;
  maxWalls: number;
  /** 番号が上限に収まる盤面が出るまで作り直す回数の上限（時間ではなく回数で打ち切る） */
  maxAttempts: number;
}

/** 仕様書「サイズと難易度」の表のとおり */
export const MODES: Record<Mode, ModeDef> = {
  easy: { label: 'かんたん', size: 5, minNumbers: 6, maxNumbers: 8, minWalls: 0, maxWalls: 0, maxAttempts: 12 },
  normal: { label: 'ふつう', size: 6, minNumbers: 7, maxNumbers: 10, minWalls: 0, maxWalls: 0, maxAttempts: 12 },
  hard: { label: 'むずかしい', size: 7, minNumbers: 8, maxNumbers: 12, minWalls: 4, maxWalls: 8, maxAttempts: 12 },
  daily: { label: '今日の1問', size: 6, minNumbers: 7, maxNumbers: 10, minWalls: 0, maxWalls: 0, maxAttempts: 12 },
};

/** モードの並び順（画面のボタンもこの順に出す） */
export const MODE_ORDER: Mode[] = ['easy', 'normal', 'hard', 'daily'];

/**
 * 日替わりの生成手順の版。
 *
 * **生成の手順（道の作り方・番号の置き方・一意性の判定）を変えたら上げる。**
 * シードは日付と版から作る（`dailySeed(key, version)`）ので、**上げると当日の問題も変わる**。
 * そのため記録の区分（`DAILY_VARIANT`）も版つきにして一緒に変わるようにし、
 * 別の版の問題のタイムが同じ区分に混ざらないようにしている（星置きと同じ形）。
 */
export const DAILY_GENERATOR_VERSION = 1;

/** 記録の区分（`lib/records.ts` の variant）。難易度と日替わりをこれで分ける */
export const DAILY_VARIANT = `daily-v${DAILY_GENERATOR_VERSION}`;

/** 記録の区分名。日替わりだけ版を持つ（生成手順を変えたら記録も分ける） */
export function variantOf(mode: Mode): string {
  return mode === 'daily' ? DAILY_VARIANT : mode;
}

// ---- 盤の形 ----

export function rowOf(index: number, size: number): number {
  return Math.floor(index / size);
}
export function colOf(index: number, size: number): number {
  return index % size;
}

/** 上下左右の隣（盤の外は含めない） */
export function orthogonalOf(index: number, size: number): number[] {
  const r = rowOf(index, size);
  const c = colOf(index, size);
  const out: number[] = [];
  if (r > 0) out.push(index - size);
  if (c < size - 1) out.push(index + 1);
  if (r < size - 1) out.push(index + size);
  if (c > 0) out.push(index - 1);
  return out;
}

export function isAdjacent(a: number, b: number, size: number): boolean {
  const dr = Math.abs(rowOf(a, size) - rowOf(b, size));
  const dc = Math.abs(colOf(a, size) - colOf(b, size));
  return dr + dc === 1;
}

/** 隣り合う 2 マスの境界を表す数（向きによらず同じ値） */
export function edgeKey(a: number, b: number, size: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return lo * size * size + hi;
}

/** 2 マスの間に壁があるか */
export function hasWall(puzzle: Puzzle, a: number, b: number): boolean {
  return puzzle.walls.includes(edgeKey(a, b, puzzle.size));
}

/** 壁の位置（画面の線を引くため）。`a` の右か下に壁がある */
export function wallSegments(puzzle: Puzzle): { cell: number; side: 'right' | 'bottom' }[] {
  const n = puzzle.size * puzzle.size;
  return puzzle.walls.map((key) => {
    const lo = Math.floor(key / n);
    const hi = key % n;
    return { cell: lo, side: hi === lo + 1 ? 'right' : 'bottom' };
  });
}

/** 最後の番号 */
export function lastNumber(puzzle: Puzzle): number {
  let max = 0;
  for (const v of puzzle.numbers) if (v > max) max = v;
  return max;
}

// ---- 生成 ----

/** 蛇行（ブストロフェドン）で全マスを通る道 */
export function serpentinePath(size: number): number[] {
  const path: number[] = [];
  for (let r = 0; r < size; r++) {
    for (let k = 0; k < size; k++) {
      const c = r % 2 === 0 ? k : size - 1 - k;
      path.push(r * size + c);
    }
  }
  return path;
}

/**
 * バックビット法で道をランダムにする。
 *
 * 道の端の 1 つを選び、その隣（道の上で隣ではないマス）へつなぐ。
 * すると道が 1 か所で輪になるので、輪の中で端に近い側の辺を切って開く。
 * **どの手でも「全マスを 1 回ずつ通る道」のまま**なので、打ち切りが要らない。
 */
export function backbite(path: number[], size: number, rng: Rng, steps: number): number[] {
  let p = [...path];
  const pos = new Int32Array(size * size);
  const reindex = () => {
    for (let i = 0; i < p.length; i++) pos[p[i]] = i;
  };
  reindex();
  for (let s = 0; s < steps; s++) {
    const fromStart = rng() < 0.5;
    if (fromStart) {
      p.reverse();
      reindex();
    }
    const end = p[p.length - 1];
    const neighbors = orthogonalOf(end, size);
    const target = neighbors[Math.floor(rng() * neighbors.length)];
    const i = pos[target];
    // 道の上で隣（ひとつ手前）のマスとはつなぎ直せない
    if (i === p.length - 2) continue;
    // p[0..i] + reverse(p[i+1..])：end と target がつながり、p[i]-p[i+1] が切れる
    p = [...p.slice(0, i + 1), ...p.slice(i + 1).reverse()];
    for (let k = i + 1; k < p.length; k++) pos[p[k]] = k;
  }
  return p;
}

/** 道の位置（何歩目か）から番号の盤を作る。位置は昇順でなくてよい */
export function numbersFrom(path: number[], positions: number[], size: number): number[] {
  const numbers = new Array<number>(size * size).fill(0);
  const sorted = [...new Set(positions)].sort((a, b) => a - b);
  sorted.forEach((p, k) => {
    numbers[path[p]] = k + 1;
  });
  return numbers;
}

/**
 * 番号を置く位置（道の何歩目か）。始点と終点は必ず含める。
 * 途中は等間隔に並べ、それぞれを間隔の 1/3 ほど乱してずらす。
 */
export function placeNumberPositions(length: number, count: number, rng: Rng): number[] {
  const k = Math.max(2, Math.min(count, length));
  const positions = new Set<number>([0, length - 1]);
  const gap = (length - 1) / (k - 1);
  for (let j = 1; j < k - 1; j++) {
    const jitter = Math.round((rng() - 0.5) * (gap * 2) / 3);
    const p = Math.min(length - 2, Math.max(1, Math.round(j * gap) + jitter));
    positions.add(p);
  }
  // 乱したせいで重なったぶんは、空いている位置で埋める（数を揃える）
  for (let p = 1; positions.size < k && p < length - 1; p++) positions.add(p);
  return [...positions].sort((a, b) => a - b);
}

/** 道が通っていないマス境界から壁を選ぶ（道は壊れない） */
export function placeWalls(path: number[], size: number, count: number, rng: Rng): number[] {
  const used = new Set<number>();
  for (let i = 1; i < path.length; i++) used.add(edgeKey(path[i - 1], path[i], size));
  const candidates: number[] = [];
  for (let cell = 0; cell < size * size; cell++) {
    for (const n of orthogonalOf(cell, size)) {
      if (n > cell && !used.has(edgeKey(cell, n, size))) candidates.push(edgeKey(cell, n, size));
    }
  }
  // Fisher–Yates の先頭だけ
  const picked: number[] = [];
  for (let i = 0; i < count && i < candidates.length; i++) {
    const j = i + Math.floor(rng() * (candidates.length - i));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    picked.push(candidates[i]);
  }
  return picked.sort((a, b) => a - b);
}

// ---- ソルバー ----

/** 解の探索結果。`exhausted` は節点数の上限で打ち切った（＝一意と言い切れない） */
export interface SolveResult {
  count: number;
  solutions: number[][];
  exhausted: boolean;
}

/** 1 回の探索で調べる節点数の上限。**時間ではなく回数**で打ち切る */
export const DEFAULT_NODE_LIMIT = 400_000;

/**
 * 解を数える（`limit` 個見つけたら打ち切り）。
 *
 * 深さ優先で道を伸ばし、次の 3 つで枝を刈る。
 * - 番号は昇順にしか踏めない。最後の番号は全マスを通った最後にしか踏めない
 * - **未訪問のマスが道の先端から 1 つながりでなければ戻る**
 * - **次の番号まで、まだ踏めないマス（それより大きい番号）を避けて届かなければ戻る**
 * - 出入り口が 1 つしか無い未訪問のマス（行き止まり）が最後の番号以外にあれば戻る
 */
export function solve(
  puzzle: Pick<Puzzle, 'size' | 'numbers' | 'walls'>,
  limit = 2,
  nodeLimit = DEFAULT_NODE_LIMIT,
): SolveResult {
  const { size, numbers } = puzzle;
  const total = size * size;
  const wallSet = new Set(puzzle.walls);
  const adj: number[][] = [];
  for (let i = 0; i < total; i++) {
    adj.push(orthogonalOf(i, size).filter((n) => !wallSet.has(edgeKey(i, n, size))));
  }
  let last = 0;
  const cellOf: number[] = [];
  for (let i = 0; i < total; i++) {
    const v = numbers[i];
    if (v > 0) {
      cellOf[v] = i;
      if (v > last) last = v;
    }
  }
  const result: SolveResult = { count: 0, solutions: [], exhausted: false };
  if (last < 1 || cellOf[1] === undefined) return result;
  const endCell = cellOf[last];

  const visited = new Uint8Array(total);
  const path: number[] = [];
  const queue = new Int32Array(total);
  const seen = new Uint8Array(total);
  let nodes = 0;

  /** 先端 `head` から先がまだ成り立ちうるか */
  const feasible = (head: number, next: number, remaining: number): boolean => {
    if (remaining === 0) return true;
    // 行き止まり：出入り口（未訪問の隣と先端）が 2 未満の未訪問マスは、最後の番号でなければ詰み
    for (let u = 0; u < total; u++) {
      if (visited[u]) continue;
      let avail = 0;
      for (const n of adj[u]) if (!visited[n] || n === head) avail++;
      if (u !== endCell && avail < 2) return false;
      if (avail < 1) return false;
    }
    // つながり：先端から未訪問のマスがすべて届くか
    seen.fill(0);
    let qh = 0;
    let qt = 0;
    let reached = 0;
    for (const n of adj[head]) {
      if (!visited[n] && !seen[n]) {
        seen[n] = 1;
        queue[qt++] = n;
      }
    }
    while (qh < qt) {
      const u = queue[qh++];
      reached++;
      for (const n of adj[u]) {
        if (!visited[n] && !seen[n]) {
          seen[n] = 1;
          queue[qt++] = n;
        }
      }
    }
    if (reached !== remaining) return false;
    // 次の番号へ、それより大きい番号を踏まずに届くか
    const target = cellOf[next];
    if (target === undefined) return true;
    seen.fill(0);
    qh = 0;
    qt = 0;
    queue[qt++] = head;
    seen[head] = 1;
    while (qh < qt) {
      const u = queue[qh++];
      if (u === target) return true;
      for (const n of adj[u]) {
        if (visited[n] || seen[n]) continue;
        if (numbers[n] > next) continue;
        seen[n] = 1;
        queue[qt++] = n;
      }
    }
    return false;
  };

  const dfs = (head: number, next: number): void => {
    if (result.count >= limit || result.exhausted) return;
    if (++nodes > nodeLimit) {
      result.exhausted = true;
      return;
    }
    if (path.length === total) {
      if (head === endCell) {
        result.count++;
        result.solutions.push([...path]);
      }
      return;
    }
    for (const n of adj[head]) {
      if (visited[n]) continue;
      const v = numbers[n];
      if (v > 0 && v !== next) continue;
      if (n === endCell && path.length + 1 !== total) continue;
      visited[n] = 1;
      path.push(n);
      const nextNext = v > 0 ? next + 1 : next;
      if (feasible(n, nextNext, total - path.length)) dfs(n, nextNext);
      path.pop();
      visited[n] = 0;
      if (result.count >= limit || result.exhausted) return;
    }
  };

  const start = cellOf[1];
  visited[start] = 1;
  path.push(start);
  if (total === 1) {
    result.count = 1;
    result.solutions.push([start]);
    return result;
  }
  if (feasible(start, 2, total - 1)) dfs(start, 2);
  return result;
}

/** 解の個数（`limit` で打ち切り。節点数の上限に当たったら `limit` とみなす＝一意と言わない） */
export function countSolutions(puzzle: Pick<Puzzle, 'size' | 'numbers' | 'walls'>, limit = 2): number {
  const r = solve(puzzle, limit);
  return r.exhausted ? Math.max(r.count, limit) : r.count;
}

/** 道が番号の順（1 から昇順）をたどっているか（別解を潰せたかの判定に使う） */
function followsNumbers(path: number[], numbers: number[]): boolean {
  let next = 1;
  for (const cell of path) {
    const v = numbers[cell];
    if (v === 0) continue;
    if (v !== next) return false;
    next++;
  }
  return true;
}

/**
 * 別解を潰す番号を 1 つ選んで足す（道の何歩目かを返す）。
 *
 * 別解と正解が分かれたあたりから順に、そのマスに番号を置けば別解が
 * 番号の順を破るものを探す。見つからなければ、分かれた先のマスに置く
 * （それでも盤は締まるので、繰り返せば必ず一意になる）。
 */
function positionToKill(solution: number[], positions: number[], alt: number[], size: number): number {
  const taken = new Set(positions);
  let diverge = 0;
  while (diverge < solution.length && solution[diverge] === alt[diverge]) diverge++;
  for (let p = diverge; p < solution.length - 1; p++) {
    if (taken.has(p)) continue;
    if (!followsNumbers(alt, numbersFrom(solution, [...positions, p], size))) return p;
  }
  for (let p = diverge; p < solution.length - 1; p++) if (!taken.has(p)) return p;
  // ここには来ない（全マスに番号があれば解は 1 通り）
  return diverge;
}

/**
 * 決まった道・壁に番号を置き、一意になるまで足す。
 * 節点数の上限で言い切れないときは、いちばん広い番号の間に 1 つ足して締める。
 */
export function numbersForUnique(
  solution: number[],
  size: number,
  walls: number[],
  initial: number[],
): number[] {
  const positions = [...initial];
  for (;;) {
    const numbers = numbersFrom(solution, positions, size);
    const r = solve({ size, numbers, walls }, 2);
    if (!r.exhausted && r.count === 1) return positions.sort((a, b) => a - b);
    let add: number;
    if (!r.exhausted && r.count >= 2) {
      const alt = r.solutions.find((s) => s.some((c, i) => c !== solution[i])) ?? r.solutions[1];
      add = positionToKill(solution, positions, alt, size);
    } else {
      const sorted = [...positions].sort((a, b) => a - b);
      let best = 0;
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] - sorted[i - 1] > sorted[best + 1] - sorted[best]) best = i - 1;
      }
      add = Math.floor((sorted[best] + sorted[best + 1]) / 2);
    }
    positions.push(add);
  }
}

/** 生成の結果。`relaxed` は「番号の数が上限を超えたまま返した」かどうか */
export interface Generated {
  puzzle: Puzzle;
  attempts: number;
  relaxed: boolean;
}

function intBetween(min: number, max: number, rng: Rng): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/**
 * 盤面を作る。**一意解は必ず満たす。**
 *
 * 番号の数が上限に収まる盤面が `maxAttempts` 回で見つからなければ、
 * いちばん番号の少なかったものを返す（`relaxed: true`）。
 */
export function generate(def: Omit<ModeDef, 'label'>, rng: Rng): Generated {
  const { size } = def;
  const total = size * size;
  let best: Puzzle | null = null;
  for (let attempt = 1; attempt <= Math.max(1, def.maxAttempts); attempt++) {
    const solution = backbite(serpentinePath(size), size, rng, total * 30);
    const walls =
      def.maxWalls > 0 ? placeWalls(solution, size, intBetween(def.minWalls, def.maxWalls, rng), rng) : [];
    const initial = placeNumberPositions(total, intBetween(def.minNumbers, def.minNumbers + 1, rng), rng);
    const positions = numbersForUnique(solution, size, walls, initial);
    const puzzle: Puzzle = { size, numbers: numbersFrom(solution, positions, size), walls, solution };
    if (positions.length <= def.maxNumbers) return { puzzle, attempts: attempt, relaxed: false };
    if (!best || lastNumber(puzzle) < lastNumber(best)) best = puzzle;
  }
  return { puzzle: best as Puzzle, attempts: def.maxAttempts, relaxed: true };
}

export function generateFor(mode: Mode, rng: Rng): Generated {
  return generate(MODES[mode], rng);
}

/**
 * 「今日の1問」。日付キーと版から決まるので、同じ日なら誰が開いても同じ盤面。
 * 日付は端末のローカル日付（`localDateKey`）。連続日数の判定も同じ日付を使う。
 */
export function dailyPuzzle(key: DateKey = localDateKey()): Puzzle {
  const rng = mulberry32(dailySeed(key, DAILY_GENERATOR_VERSION));
  return generateFor('daily', rng).puzzle;
}

// ---- 遊ぶがわ（画面から使う純関数） ----

/** 道を伸ばせなかった理由（画面の 1 行に出す） */
export type Blocked = 'start' | 'far' | 'wall' | 'visited' | 'order' | 'last';

/**
 * 弾いた理由の文言。**狭い画面（320px）でも 1 行に収まる長さ**にしてある
 * （画面の 1 行ぶんの枠に出すので、2 行になると切れる）
 */
export const BLOCKED_MESSAGE: Record<Blocked, string> = {
  start: '道は「1」のマスから引き始めます。',
  far: '道は縦横の隣のマスにだけ伸びます。',
  wall: '壁は通れません。',
  visited: '通ったマスには戻れません。',
  order: '番号は小さい順にたどります。',
  last: '最後の番号は全マスを通ってから。',
};

/** 次にたどる番号（道の上にある番号の数 + 1） */
export function nextNumber(puzzle: Puzzle, path: number[]): number {
  let n = 1;
  for (const cell of path) if (puzzle.numbers[cell] > 0) n++;
  return n;
}

/** `cell` へ道を 1 歩伸ばせるか。伸ばせなければ理由を返す */
export function blockedReason(puzzle: Puzzle, path: number[], cell: number): Blocked | null {
  const { size, numbers } = puzzle;
  if (path.length === 0) return numbers[cell] === 1 ? null : 'start';
  const head = path[path.length - 1];
  if (!isAdjacent(head, cell, size)) return 'far';
  if (hasWall(puzzle, head, cell)) return 'wall';
  if (path.includes(cell)) return 'visited';
  const v = numbers[cell];
  if (v > 0 && v !== nextNumber(puzzle, path)) return 'order';
  if (v > 0 && v === lastNumber(puzzle) && path.length + 1 !== size * size) return 'last';
  return null;
}

/** なぞった 1 歩の結果 */
export interface StepResult {
  path: number[];
  blocked: Blocked | null;
}

/**
 * 隣のマスへ 1 歩。**1 つ前のマスに戻ると道が縮む**（消しゴム不要）。
 * それ以外で伸ばせないときは道を変えずに理由を返す（その場で弾く）。
 */
export function step(puzzle: Puzzle, path: number[], cell: number): StepResult {
  if (path.length > 0 && path[path.length - 1] === cell) return { path, blocked: null };
  if (path.length >= 2 && path[path.length - 2] === cell) return { path: path.slice(0, -1), blocked: null };
  const blocked = blockedReason(puzzle, path, cell);
  if (blocked) return { path, blocked };
  return { path: [...path, cell], blocked: null };
}

/**
 * 指が先端から離れたマスへ飛んだとき（速くなぞると間のマスの pointermove が来ない）、
 * 間のマスを 1 歩ずつ補って進む。**横 → 縦**と**縦 → 横**の両方を試し、
 * 最後まで届いたほうを採る。どちらも届く（または届かない）ときは**道が長いほう**を採る
 * （斜めに飛んだだけで、補った 1 歩が「1 つ前に戻る」になって道が縮むのを避ける）。
 */
export function dragTo(puzzle: Puzzle, path: number[], cell: number): StepResult {
  if (path.length === 0) return step(puzzle, path, cell);
  const first = walk(puzzle, path, cell, true);
  const second = walk(puzzle, path, cell, false);
  if (!first.blocked !== !second.blocked) return first.blocked ? second : first;
  return second.path.length > first.path.length ? second : first;
}

function walk(puzzle: Puzzle, path: number[], cell: number, horizontalFirst: boolean): StepResult {
  const { size } = puzzle;
  let current = path;
  const tr = rowOf(cell, size);
  const tc = colOf(cell, size);
  for (let guard = 0; guard < size * 2; guard++) {
    const head = current[current.length - 1];
    if (head === cell) return { path: current, blocked: null };
    const hr = rowOf(head, size);
    const hc = colOf(head, size);
    const horizontal = hc !== tc && (horizontalFirst || hr === tr);
    const nextCell = horizontal ? head + Math.sign(tc - hc) : head + Math.sign(tr - hr) * size;
    const r = step(puzzle, current, nextCell);
    if (r.blocked) return { path: current, blocked: r.blocked };
    current = r.path;
  }
  return { path: current, blocked: null };
}

/**
 * 押したマスから道を引き始められるか。**先端（または道が無いときの「1」）だけ**。
 * 先端以外を押しても何もしない（誤タップで道が壊れないように）。
 */
export function canGrab(puzzle: Puzzle, path: number[], cell: number): boolean {
  if (path.length === 0) return puzzle.numbers[cell] === 1;
  return path[path.length - 1] === cell;
}

/**
 * 解けているか。全マスを 1 回ずつ、隣へ・壁を越えずに・番号を昇順に通り、最後の番号で終わる。
 * `solution` と突き合わせない（答えを画面側に持ち出さないため。解は 1 通りなので同じこと）。
 */
export function isSolved(puzzle: Puzzle, path: number[]): boolean {
  const { size, numbers } = puzzle;
  const total = size * size;
  if (path.length !== total) return false;
  if (new Set(path).size !== total) return false;
  if (numbers[path[0]] !== 1) return false;
  for (let i = 1; i < total; i++) {
    if (!isAdjacent(path[i - 1], path[i], size)) return false;
    if (hasWall(puzzle, path[i - 1], path[i])) return false;
  }
  if (!followsNumbers(path, numbers)) return false;
  return numbers[path[total - 1]] === lastNumber(puzzle);
}

/**
 * クリアの結果を共有する文面。**答え（道の形）を入れない**（#232 の約束）。
 * 入れるのは日付（またはモード）・かかった時間・連続日数だけ。
 */
export function shareText(params: {
  mode: Mode;
  size: number;
  timeMs: number;
  dateKey?: DateKey;
  streak?: number;
  url: string;
}): string {
  const { mode, size, timeMs, dateKey, streak, url } = params;
  const time = formatDuration(timeMs);
  const head =
    mode === 'daily' && dateKey
      ? `ひとふでナンバー 今日の1問（${dateKey}）${time}`
      : `ひとふでナンバー ${MODES[mode].label}（${size}×${size}）${time}`;
  const line = mode === 'daily' && streak && streak > 1 ? `${head} ／ 連続${streak}日` : head;
  return [line, url].join('\n');
}

/** `2:41` 形式。`lib/records.ts` の `formatTime` と同じ書き方 */
function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}
