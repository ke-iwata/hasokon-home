/**
 * 迷路（めいろ）のロジック。純関数だけ。
 *
 * 仕様: docs/features/game-meiro.md
 *
 * ## 迷路の持ち方
 *
 * マスは左上から行優先の番号（`r * w + c`）。各マスは**壁の有無のビット**を持つ
 * （`N`=上・`E`=右・`S`=下・`W`=左。立っていれば壁がある）。
 * 隣り合う2マスの壁は両側に同じ向きで立てる（片側だけ消すことはない）。
 *
 * ## 完全迷路
 *
 * 生成は**乱数つき深さ優先（穴掘り法）**か **Wilson 法**。どちらも
 * 「すべてのマスがつながり、どの2マスの間の道もちょうど1本」（＝全域木）になる。
 * スタートは左上、ゴールは右下。**必ず解けて、答えは1本**。
 *
 * - 深さ優先は長い1本道ができやすく、分かれ道が少ない → 小さい段（子ども向け）
 * - Wilson 法は全域木を一様に選ぶので偏りが少なく、行き止まりが多い → 大きい段（おとな向け）
 *
 * 乱数は注入する（`Math.random()` を直に呼ばない）。今日の1面は `lib/daily.ts` の
 * `mulberry32(dailySeed(...))` を渡す。
 */

import { dailySeed, mulberry32, type DateKey } from './daily';

export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

export type Dir = typeof N | typeof E | typeof S | typeof W;

export const DIRS: readonly Dir[] = [N, E, S, W];

const OPPOSITE: Record<Dir, Dir> = { [N]: S, [E]: W, [S]: N, [W]: E } as Record<Dir, Dir>;
const DR: Record<Dir, number> = { [N]: -1, [E]: 0, [S]: 1, [W]: 0 } as Record<Dir, number>;
const DC: Record<Dir, number> = { [N]: 0, [E]: 1, [S]: 0, [W]: -1 } as Record<Dir, number>;

export interface Maze {
  /** 横のマス数 */
  w: number;
  /** 縦のマス数 */
  h: number;
  /** マスごとの壁のビット（`N | E | S | W`） */
  walls: number[];
}

export type Algorithm = 'dfs' | 'wilson';

export type LevelId = 'youji' | 'kantan' | 'futsu' | 'muzukashii' | 'onimuzu';

export interface Level {
  id: LevelId;
  label: string;
  /** 一辺のマス数 */
  size: number;
  /** 目安（画面と本文に出す） */
  target: string;
  algorithm: Algorithm;
}

/** 5段階。並び順は画面のボタンの順 */
export const LEVELS: readonly Level[] = [
  { id: 'youji', label: 'ようじ', size: 5, target: '3〜5歳', algorithm: 'dfs' },
  { id: 'kantan', label: 'かんたん', size: 8, target: '小学校低学年', algorithm: 'dfs' },
  { id: 'futsu', label: 'ふつう', size: 12, target: '小学校高学年', algorithm: 'wilson' },
  { id: 'muzukashii', label: 'むずかしい', size: 20, target: '中学生〜おとな', algorithm: 'wilson' },
  { id: 'onimuzu', label: 'おにむず', size: 30, target: 'おとな', algorithm: 'wilson' },
];

export function levelOf(id: LevelId): Level {
  const level = LEVELS.find((l) => l.id === id);
  if (!level) throw new Error(`unknown level: ${id}`);
  return level;
}

/**
 * 今日の1面の生成手順の版。**生成方式（深さ優先／Wilson 法）や大きさを変えたら、
 * 同じPRで上げる**（上げないと、変えた日に端末ごとに違う迷路が出る）
 */
export const DAILY_VERSION = 1;

/** 記録の区分。フリーは段階の id、今日の1面は `daily-<段階>` */
export function variantOf(level: LevelId, daily: boolean): string {
  return daily ? `daily-${level}` : level;
}

export function start(_maze: Maze): number {
  return 0;
}

export function goal(maze: Maze): number {
  return maze.w * maze.h - 1;
}

/** `from` から `dir` へ1マス進んだ先。盤の外なら `null` */
export function neighbor(maze: Pick<Maze, 'w' | 'h'>, from: number, dir: Dir): number | null {
  const r = Math.floor(from / maze.w) + DR[dir];
  const c = (from % maze.w) + DC[dir];
  if (r < 0 || c < 0 || r >= maze.h || c >= maze.w) return null;
  return r * maze.w + c;
}

/** 隣り合う2マスの向き（`from` から見た `to`）。隣でなければ `null` */
export function dirBetween(maze: Pick<Maze, 'w' | 'h'>, from: number, to: number): Dir | null {
  for (const d of DIRS) if (neighbor(maze, from, d) === to) return d;
  return null;
}

/** 壁の判定。隣り合っていて、あいだに壁が無ければ true */
export function canMove(maze: Maze, from: number, to: number): boolean {
  if (from < 0 || to < 0 || from >= maze.walls.length || to >= maze.walls.length) return false;
  const d = dirBetween(maze, from, to);
  return d !== null && (maze.walls[from] & d) === 0;
}

/** 壁がすべて立った（道の無い）盤 */
function closed(w: number, h: number): Maze {
  return { w, h, walls: new Array<number>(w * h).fill(N | E | S | W) };
}

/** `a` と `b`（隣り合う）のあいだの壁を両側から消す */
function carve(maze: Maze, a: number, b: number): void {
  const d = dirBetween(maze, a, b);
  if (d === null) throw new Error('not adjacent');
  maze.walls[a] &= ~d;
  maze.walls[b] &= ~OPPOSITE[d];
}

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

/** 乱数つき深さ優先（穴掘り法）。再帰を使わずスタックで回す（30×30 でも溢れない） */
export function generateDfs(w: number, h: number, rng: () => number): Maze {
  const maze = closed(w, h);
  const seen = new Array<boolean>(w * h).fill(false);
  const stack = [0];
  seen[0] = true;
  while (stack.length > 0) {
    const cur = stack[stack.length - 1];
    const next = DIRS.map((d) => neighbor(maze, cur, d)).filter(
      (n): n is number => n !== null && !seen[n],
    );
    if (next.length === 0) {
      stack.pop();
      continue;
    }
    const n = pick(next, rng);
    carve(maze, cur, n);
    seen[n] = true;
    stack.push(n);
  }
  return maze;
}

/**
 * Wilson 法（ループを消したランダムウォーク）。全域木を一様に選ぶ。
 *
 * まだ木に入っていないマスから歩き始め、木に当たるまで歩く。歩いた跡は
 * 「そのマスから最後に出た向き」だけを覚えるので、ループは自然に消える。
 */
export function generateWilson(w: number, h: number, rng: () => number): Maze {
  const maze = closed(w, h);
  const total = w * h;
  const inTree = new Array<boolean>(total).fill(false);
  inTree[Math.floor(rng() * total) % total] = true;
  const nextOf = new Array<number>(total).fill(-1);
  for (let s = 0; s < total; s++) {
    if (inTree[s]) continue;
    // 木に当たるまで歩く
    let cur = s;
    while (!inTree[cur]) {
      const options = DIRS.map((d) => neighbor(maze, cur, d)).filter((n): n is number => n !== null);
      const n = pick(options, rng);
      nextOf[cur] = n;
      cur = n;
    }
    // 覚えた向きどおりにたどって木につなぐ
    cur = s;
    while (!inTree[cur]) {
      carve(maze, cur, nextOf[cur]);
      inTree[cur] = true;
      cur = nextOf[cur];
    }
  }
  return maze;
}

export function generate(w: number, h: number, algorithm: Algorithm, rng: () => number): Maze {
  return algorithm === 'dfs' ? generateDfs(w, h, rng) : generateWilson(w, h, rng);
}

/** 段階に合わせた迷路 */
export function generateLevel(level: LevelId, rng: () => number): Maze {
  const l = levelOf(level);
  return generate(l.size, l.size, l.algorithm, rng);
}

/**
 * 今日の1面。段階ごとに1面、同じ日なら誰が開いても同じ迷路。
 * 段階の番号を種に混ぜて、段階ごとに別の乱数列にする
 */
export function dailyMaze(level: LevelId, key: DateKey): Maze {
  const index = LEVELS.findIndex((l) => l.id === level);
  const seed = dailySeed(key, DAILY_VERSION) ^ Math.imul(index + 1, 0x27d4eb2d);
  return generateLevel(level, mulberry32(seed));
}

/** 通れる向き（壁の無い向き）の隣のマス */
export function openNeighbors(maze: Maze, cell: number): number[] {
  return DIRS.filter((d) => (maze.walls[cell] & d) === 0)
    .map((d) => neighbor(maze, cell, d))
    .filter((n): n is number => n !== null);
}

/** 道（壁の無い辺）の数。完全迷路ならマス数 − 1 */
export function passageCount(maze: Maze): number {
  let count = 0;
  for (let i = 0; i < maze.walls.length; i++) {
    // 右と下だけ数えれば、どの辺も1回ずつになる
    if ((maze.walls[i] & E) === 0 && neighbor(maze, i, E) !== null) count++;
    if ((maze.walls[i] & S) === 0 && neighbor(maze, i, S) !== null) count++;
  }
  return count;
}

/** `from` からの幅優先。各マスの1つ前のマス（届かなければ -1、出発点は自分） */
function bfs(maze: Maze, from: number): number[] {
  const prev = new Array<number>(maze.walls.length).fill(-1);
  prev[from] = from;
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    for (const n of openNeighbors(maze, cur)) {
      if (prev[n] !== -1) continue;
      prev[n] = cur;
      queue.push(n);
    }
  }
  return prev;
}

/** スタートから届くマスの数 */
export function reachableCount(maze: Maze): number {
  return bfs(maze, start(maze)).filter((p) => p !== -1).length;
}

/** 答えの道（スタートからゴールまでのマスの並び）。届かなければ空 */
export function solve(maze: Maze): number[] {
  const prev = bfs(maze, start(maze));
  const g = goal(maze);
  if (prev[g] === -1) return [];
  const path = [g];
  while (path[path.length - 1] !== start(maze)) path.push(prev[path[path.length - 1]]);
  return path.reverse();
}

// ---------------------------------------------------------------------------
// なぞる
// ---------------------------------------------------------------------------

/** 道（なぞった線）。スタートから始まり、隣り合う通れるマスだけでできている */
export type Path = readonly number[];

export function initialPath(maze: Maze): number[] {
  return [start(maze)];
}

/**
 * 指・マウスが `cell` に来たときの道。
 *
 * - 道の上のマスに戻ったら、そこまで線を消す（来た道を戻ると線が消える）
 * - 先端の隣で壁が無ければ1マス伸ばす
 * - 先端と同じ行・列で、あいだを壁なしで通れるなら、まとめて伸ばす
 *   （速くなぞるとマスを飛ばして指が届くため）
 * - それ以外（壁の向こう・斜め・離れたマス）は伸ばさない。**ずるができない**
 */
export function traceTo(maze: Maze, path: Path, cell: number): Path {
  if (cell < 0 || cell >= maze.walls.length) return path;
  const at = path.indexOf(cell);
  if (at !== -1) return at === path.length - 1 ? path : path.slice(0, at + 1);
  const head = path[path.length - 1];
  const hr = Math.floor(head / maze.w);
  const hc = head % maze.w;
  const r = Math.floor(cell / maze.w);
  const c = cell % maze.w;
  if (hr !== r && hc !== c) return path;
  const dir: Dir = hr === r ? (c > hc ? E : W) : r > hr ? S : N;
  const next = [...path];
  let cur = head;
  while (cur !== cell) {
    const n = neighbor(maze, cur, dir);
    if (n === null || !canMove(maze, cur, n) || next.includes(n)) return path;
    next.push(n);
    cur = n;
  }
  return next;
}

/**
 * キーボードで1マス進む。来た道の向きなら1マス戻る。壁なら動かない。
 *
 * `auto`（すいすいモード）のときは、分かれ道・行き止まり・ゴールに着くまで
 * 一本道を自動で進む（戻るときも分かれ道まで戻る）。
 */
export function step(maze: Maze, path: Path, dir: Dir, auto = false): Path {
  const head = path[path.length - 1];
  const target = neighbor(maze, head, dir);
  if (target === null || !canMove(maze, head, target)) return path;
  let next = traceTo(maze, path, target);
  if (!auto) return next;
  const g = goal(maze);
  const backward = next.length < path.length;
  // 一本道のあいだ進み続ける（通れる向きが2つ＝来た道と行く道しかないマス）
  for (let guard = 0; guard < maze.walls.length; guard++) {
    const cur = next[next.length - 1];
    if (cur === g || cur === start(maze)) break;
    const open = openNeighbors(maze, cur);
    if (open.length !== 2) break;
    if (backward) {
      const before = next[next.length - 2];
      const after = traceTo(maze, next, before);
      if (after === next) break;
      next = after;
    } else {
      const prev = next[next.length - 2];
      const forward = open.find((n) => n !== prev);
      if (forward === undefined) break;
      const after = traceTo(maze, next, forward);
      if (after === next) break;
      next = after;
    }
  }
  return next;
}

/** ゴールに着いたか */
export function reachedGoal(maze: Maze, path: Path): boolean {
  return path.length > 0 && path[path.length - 1] === goal(maze);
}

/** 道が正しい（スタートから始まり、隣り合う通れるマスだけで、同じマスを2度通らない） */
export function isValidPath(maze: Maze, path: Path): boolean {
  if (path.length === 0 || path[0] !== start(maze)) return false;
  if (new Set(path).size !== path.length) return false;
  for (let i = 1; i < path.length; i++) if (!canMove(maze, path[i - 1], path[i])) return false;
  return true;
}

/** 矢印キー → 向き */
export function dirFromKey(key: string): Dir | null {
  switch (key) {
    case 'ArrowUp':
      return N;
    case 'ArrowRight':
      return E;
    case 'ArrowDown':
      return S;
    case 'ArrowLeft':
      return W;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// 描画（SVG の path）
// ---------------------------------------------------------------------------

/**
 * 壁を SVG の `path` の `d` にする。座標は1マス = 1。
 *
 * 30×30 でも要素を増やさないよう、**横に続く壁・縦に続く壁を1本の線にまとめる**。
 * 外周はスタート（左上の左辺）とゴール（右下の右辺）を開けておく（入口と出口）。
 */
export function wallPathData(maze: Maze): string {
  const { w, h, walls } = maze;
  const parts: string[] = [];
  // 横線：y = 0..h。y の線上で、x ごとに壁があるかを見て、続くところをまとめる
  for (let y = 0; y <= h; y++) {
    let runStart = -1;
    for (let x = 0; x <= w; x++) {
      let wall = false;
      if (x < w) {
        if (y < h) wall = (walls[y * w + x] & N) !== 0;
        else wall = (walls[(h - 1) * w + x] & S) !== 0;
      }
      if (wall && runStart === -1) runStart = x;
      if (!wall && runStart !== -1) {
        parts.push(`M${runStart} ${y}H${x}`);
        runStart = -1;
      }
    }
  }
  // 縦線：x = 0..w
  for (let x = 0; x <= w; x++) {
    let runStart = -1;
    for (let y = 0; y <= h; y++) {
      let wall = false;
      if (y < h) {
        const isEntrance = x === 0 && y === 0;
        const isExit = x === w && y === h - 1;
        if (isEntrance || isExit) wall = false;
        else if (x < w) wall = (walls[y * w + x] & W) !== 0;
        else wall = (walls[y * w + w - 1] & E) !== 0;
      }
      if (wall && runStart === -1) runStart = y;
      if (!wall && runStart !== -1) {
        parts.push(`M${x} ${runStart}V${y}`);
        runStart = -1;
      }
    }
  }
  return parts.join('');
}

/** マスの並びを、マスの中心を結ぶ折れ線の `d` にする（座標は1マス = 1） */
export function routePathData(maze: Pick<Maze, 'w'>, path: Path): string {
  return path
    .map((cell, i) => {
      const x = (cell % maze.w) + 0.5;
      const y = Math.floor(cell / maze.w) + 0.5;
      return `${i === 0 ? 'M' : 'L'}${x} ${y}`;
    })
    .join('');
}
