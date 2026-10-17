/**
 * 橋かけパズル（数字の書かれた島どうしを縦横の橋でつなぐロジックパズル）
 *
 * 仕様: docs/features/game-hashi-kake.md
 *
 * ## ルール
 *
 * 1. 縦か横に隣り合う（間に別の島が無い）2 島の間に 0・1・2 本の橋を架ける
 * 2. 橋はまっすぐで、他の橋や島と交差しない
 * 3. 各島の数字は、その島から出る橋の本数の合計
 * 4. 最後に全部の島が橋で 1 つにつながる
 *
 * **クリアの判定はルールで行い、用意した答えとの一致では見ない**（`isSolved`）。
 *
 * ## 生成（`generate`）
 *
 * 1. 答えから作る：島を 1 つ置き、既存の島から縦横にまっすぐ伸ばした先（2 マス目以降）に新しい島を置いて橋を架ける。
 *    作り方からして全体は必ず 1 つにつながる。**島どうしは縦横に隣り合わせない**（仕様の 1′）
 * 2. 余力で、隣り合うのに橋の無い島どうしにも 1〜2 本を足す（ループを作る）
 * 3. 島の数字 = 出る橋の本数の合計
 * 4. ソルバーで解の数を 2 まで数え、1 でなければ捨てる
 * 5. 推論だけで解き切れることを確かめ（`analyze`）、難易度の点数が段階の範囲に入るまで回す
 *
 * **打ち切りは試行回数で決め、壁時計で決めない**（時間で切ると端末ごとに今日の盤が変わる）。
 * 上限を超えたら**難易度の条件だけを緩める**（一意解・推論で解ける、は緩めない）。
 *
 * ## 遊ぶがわ
 *
 * 橋の切り替え（`toggleBridge` / `clearAll` / `undo`）・島の 2 回タップ（`tapIsland`）・
 * 当たり判定（`hitTest`）を純関数で持つ。`Game.tsx` は入力と描画だけ。
 */

import { dailySeed, localDateKey, mulberry32, type DateKey } from './daily';
import type { PlayResult } from './records';

/** 乱数。`[0, 1)` を返す */
export type Rng = () => number;

/** 島。`n` は出る橋の本数の合計（1〜8） */
export interface Island {
  r: number;
  c: number;
  n: number;
}

/**
 * 橋を架けられる 2 島の組（帯）。`a < b`（島の添字）。
 * 横の帯は `a` が左、縦の帯は `a` が上。`cells` は間の空きマス（盤の添字）
 */
export interface Edge {
  a: number;
  b: number;
  horizontal: boolean;
  cells: number[];
}

/** 盤面（出題）。`solution` は答えなので画面には出さない（判定にも使わない） */
export interface Puzzle {
  size: number;
  /** 島（行優先の順） */
  islands: Island[];
  /** 帯（`edgesOf` の順） */
  edges: Edge[];
  /** 帯ごとの答えの本数 */
  solution: number[];
}

/** 判定に要るだけの盤（答えなし） */
export type PuzzleShape = Pick<Puzzle, 'size' | 'islands' | 'edges'>;

/** 難易度のモード。`daily` は「今日の1問」 */
export type Mode = 'easy' | 'normal' | 'hard' | 'daily';

export interface ModeDef {
  label: string;
  size: number;
  /** 島の数の範囲 */
  minIslands: number;
  maxIslands: number;
  /** 難易度の点数（`analyze` の `score`）の範囲。両端を含む */
  minScore: number;
  maxScore: number;
  /** 使ってよい最も重い推論の段 */
  maxLevel: Level;
  /** 必ず使う推論の段（むずかしいは段 4＝連結）。無ければ 0 */
  needLevel: Level | 0;
  /** 段階の範囲に入る盤が出るまで作り直す回数の上限（時間ではなく回数で打ち切る） */
  maxAttempts: number;
}

/**
 * 仕様書「段階と盤の大きさ」の表のとおり。
 *
 * 点数の範囲は実測で決めた（games/docs/DECISIONS.md の 2026-10-17）。
 * 段階どうしで**範囲を重ねない**（`tests/hashi-kake.test.ts` が見張る）
 */
export const MODES: Record<Mode, ModeDef> = {
  easy: {
    label: 'かんたん',
    size: 7,
    minIslands: 8,
    maxIslands: 12,
    minScore: 0,
    maxScore: 14,
    maxLevel: 2,
    needLevel: 0,
    maxAttempts: 30,
  },
  normal: {
    label: 'ふつう',
    size: 9,
    minIslands: 14,
    maxIslands: 20,
    minScore: 18,
    maxScore: 40,
    maxLevel: 3,
    needLevel: 0,
    maxAttempts: 30,
  },
  hard: {
    label: 'むずかしい',
    size: 11,
    minIslands: 22,
    maxIslands: 30,
    minScore: 45,
    maxScore: 9999,
    maxLevel: 4,
    needLevel: 4,
    maxAttempts: 60,
  },
  daily: {
    label: '今日の1問',
    size: 9,
    minIslands: 14,
    maxIslands: 20,
    minScore: 18,
    maxScore: 40,
    maxLevel: 3,
    needLevel: 0,
    maxAttempts: 30,
  },
};

/** モードの並び順（画面のボタンもこの順に出す） */
export const MODE_ORDER: Mode[] = ['daily', 'easy', 'normal', 'hard'];

/**
 * 日替わりの生成手順の版。
 *
 * **生成の手順（島の置き方・一意性と推論の判定・点数の範囲）を変えたら上げる。**
 * シードは日付と版から作る（`dailySeed(key, version)`）ので、上げると当日の問題も変わる。
 * そのため記録の区分（`DAILY_VARIANT`）も版つきにして一緒に変える
 */
export const DAILY_GENERATOR_VERSION = 1;

/** 記録の区分（`lib/records.ts` の variant）。難易度と日替わりをこれで分ける */
export const DAILY_VARIANT = `daily-v${DAILY_GENERATOR_VERSION}`;

/** 記録の区分名。日替わりだけ版を持つ */
export function variantOf(mode: Mode): string {
  return mode === 'daily' ? DAILY_VARIANT : mode;
}

// ---- 盤の道具 ----

/**
 * 島の並びから帯を作る。各島から右と下へ伸ばし、最初に当たった島との組を 1 つの帯にする。
 * 帯の順は「左上の島から行優先、同じ島なら右 → 下」（Tab の順もこれ）
 */
export function edgesOf(size: number, islands: Island[]): Edge[] {
  const at = new Map<number, number>();
  islands.forEach((s, i) => at.set(s.r * size + s.c, i));
  const order = islands.map((_, i) => i).sort((x, y) => islands[x].r - islands[y].r || islands[x].c - islands[y].c);
  const edges: Edge[] = [];
  for (const i of order) {
    const s = islands[i];
    for (const [dr, dc] of [
      [0, 1],
      [1, 0],
    ] as const) {
      const cells: number[] = [];
      let r = s.r + dr;
      let c = s.c + dc;
      while (r < size && c < size) {
        const j = at.get(r * size + c);
        if (j !== undefined) {
          edges.push({ a: Math.min(i, j), b: Math.max(i, j), horizontal: dr === 0, cells });
          break;
        }
        cells.push(r * size + c);
        r += dr;
        c += dc;
      }
    }
  }
  return edges;
}

/** 島を行優先に並べ替えて盤を作る（答えは帯ごとの本数に直す） */
function shapeOf(size: number, islands: Island[]): PuzzleShape {
  const sorted = islands.slice().sort((x, y) => x.r - y.r || x.c - y.c);
  return { size, islands: sorted, edges: edgesOf(size, sorted) };
}

/** 2 つの帯が交差するか（縦と横で、間の空きマスを共有する） */
export function edgesCross(e: Edge, f: Edge): boolean {
  if (e.horizontal === f.horizontal) return false;
  return e.cells.some((c) => f.cells.includes(c));
}

/** 帯ごとに、交差する帯の添字 */
export function crossingsOf(edges: Edge[]): number[][] {
  return edges.map((e, i) => edges.map((f, j) => (i !== j && edgesCross(e, f) ? j : -1)).filter((j) => j >= 0));
}

/** 島ごとに、そこから出る帯の添字 */
export function incidentOf(puzzle: PuzzleShape): number[][] {
  const out: number[][] = puzzle.islands.map(() => []);
  puzzle.edges.forEach((e, k) => {
    out[e.a].push(k);
    out[e.b].push(k);
  });
  return out;
}

/** 2 島の間の帯の添字（無ければ -1） */
export function edgeBetween(puzzle: PuzzleShape, a: number, b: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return puzzle.edges.findIndex((e) => e.a === lo && e.b === hi);
}

/** 島ごとの、いま架かっている橋の本数の合計 */
export function degrees(puzzle: PuzzleShape, counts: number[]): number[] {
  const deg = puzzle.islands.map(() => 0);
  puzzle.edges.forEach((e, k) => {
    deg[e.a] += counts[k] ?? 0;
    deg[e.b] += counts[k] ?? 0;
  });
  return deg;
}

/** 橋（本数 > 0）でつながった島の集まりの数 */
export function componentCount(puzzle: PuzzleShape, counts: number[]): number {
  const parent = puzzle.islands.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  puzzle.edges.forEach((e, k) => {
    if ((counts[k] ?? 0) > 0) parent[find(e.a)] = find(e.b);
  });
  return new Set(puzzle.islands.map((_, i) => find(i))).size;
}

// ---- ルールの判定 ----

/**
 * 決まり違反（「チェック」で印を付ける）。数字を超えた島と、交差している帯。
 * **足りない島は印を付けない**（途中の盤では足りないのが普通）。答えとの比較もしない
 */
export function violations(puzzle: PuzzleShape, counts: number[]): { islands: number[]; edges: number[] } {
  const deg = degrees(puzzle, counts);
  const islands = puzzle.islands.map((s, i) => (deg[i] > s.n ? i : -1)).filter((i) => i >= 0);
  const cross = crossingsOf(puzzle.edges);
  const edges = puzzle.edges
    .map((_, k) => ((counts[k] ?? 0) > 0 && cross[k].some((j) => (counts[j] ?? 0) > 0) ? k : -1))
    .filter((k) => k >= 0);
  return { islands, edges };
}

/** クリアか。全部の島の本数が数字どおり・交差なし・全体が 1 つにつながる */
export function isSolved(puzzle: PuzzleShape, counts: number[]): boolean {
  if (counts.length !== puzzle.edges.length) return false;
  if (counts.some((v) => v < 0 || v > 2)) return false;
  const deg = degrees(puzzle, counts);
  if (puzzle.islands.some((s, i) => deg[i] !== s.n)) return false;
  if (violations(puzzle, counts).edges.length > 0) return false;
  return componentCount(puzzle, counts) === 1;
}

// ---- 候補の幅（ソルバーと推論で共用） ----

/** 帯ごとの本数の幅 `[lo, hi]`。初期値は「2 本まで・どちらかの島の数字まで」 */
function initialBounds(puzzle: PuzzleShape): { lo: number[]; hi: number[] } {
  const lo = puzzle.edges.map(() => 0);
  const hi = puzzle.edges.map((e) => Math.min(2, puzzle.islands[e.a].n, puzzle.islands[e.b].n));
  return { lo, hi };
}

/** 本数 > 0 になりうる帯（`hi > 0`）だけで、全部の島がつながりうるか */
function canConnect(puzzle: PuzzleShape, hi: number[]): boolean {
  return componentCount(puzzle, hi) === 1;
}

/**
 * 島の数字からの幅の絞り込み（数え上げ）と、架かった橋による交差の除外を、変わらなくなるまで回す。
 * 矛盾したら false
 */
function propagate(
  puzzle: PuzzleShape,
  inc: number[][],
  cross: number[][],
  lo: number[],
  hi: number[],
): boolean {
  let changed = true;
  while (changed) {
    changed = false;
    for (let k = 0; k < lo.length; k++) {
      if (lo[k] > hi[k]) return false;
      if (lo[k] > 0) {
        for (const j of cross[k]) {
          if (lo[j] > 0) return false;
          if (hi[j] > 0) {
            hi[j] = 0;
            changed = true;
          }
        }
      }
    }
    for (let i = 0; i < puzzle.islands.length; i++) {
      const n = puzzle.islands[i].n;
      let sumLo = 0;
      let sumHi = 0;
      for (const k of inc[i]) {
        sumLo += lo[k];
        sumHi += hi[k];
      }
      if (sumLo > n || sumHi < n) return false;
      for (const k of inc[i]) {
        const newLo = Math.max(lo[k], n - (sumHi - hi[k]));
        const newHi = Math.min(hi[k], n - (sumLo - lo[k]));
        if (newLo !== lo[k] || newHi !== hi[k]) {
          if (newLo > newHi) return false;
          sumLo += newLo - lo[k];
          sumHi += newHi - hi[k];
          lo[k] = newLo;
          hi[k] = newHi;
          changed = true;
        }
      }
    }
  }
  return true;
}

// ---- ソルバー ----

export interface SolveResult {
  /** 見つけた解の数（`limit` で打ち切る） */
  count: number;
  /** 見つけた解（帯ごとの本数。最大 `limit` 個） */
  solutions: number[][];
}

/**
 * 解を `limit` 個まで探す。幅の絞り込み（`propagate`）＋ バックトラック。
 * 決まっていない帯のうち幅の狭いものから決め、`hi > 0` の帯だけで全体がつながらなくなったら戻る
 */
export function solve(puzzle: PuzzleShape, limit = 2): SolveResult {
  const inc = incidentOf(puzzle);
  const cross = crossingsOf(puzzle.edges);
  const solutions: number[][] = [];
  const { lo, hi } = initialBounds(puzzle);

  const rec = (lo: number[], hi: number[]): void => {
    if (solutions.length >= limit) return;
    if (!propagate(puzzle, inc, cross, lo, hi)) return;
    if (!canConnect(puzzle, hi)) return;
    let best = -1;
    let bestWidth = Infinity;
    for (let k = 0; k < lo.length; k++) {
      const w = hi[k] - lo[k];
      if (w > 0 && w < bestWidth) {
        bestWidth = w;
        best = k;
        if (w === 1) break;
      }
    }
    if (best === -1) {
      if (componentCount(puzzle, lo) === 1) solutions.push(lo.slice());
      return;
    }
    // 多い本数から試す（答えに早く当たりやすい。数を数えるだけなので順は結果に影響しない）
    for (let v = hi[best]; v >= lo[best]; v--) {
      const nlo = lo.slice();
      const nhi = hi.slice();
      nlo[best] = v;
      nhi[best] = v;
      rec(nlo, nhi);
      if (solutions.length >= limit) return;
    }
  };
  rec(lo, hi);
  return { count: solutions.length, solutions };
}

/** 解の数を `limit` まで数える */
export function countSolutions(puzzle: PuzzleShape, limit = 2): number {
  return solve(puzzle, limit).count;
}

// ---- 推論（当てずっぽうなしで解けるか・難易度） ----

/** 推論の段。重いほど難しい */
export type Level = 1 | 2 | 3 | 4;

/** 段ごとの重み（難易度の点数に足す） */
export const LEVEL_WEIGHT: Record<Level, number> = { 1: 1, 2: 2, 3: 4, 4: 6 };

export interface Analysis {
  /** 推論だけで解き切れたか */
  solved: boolean;
  /** 使った最も重い段（何もせずに済めば 0） */
  maxLevel: Level | 0;
  /** 段ごとの使った回数 */
  uses: Record<Level, number>;
  /** 難易度の点数（Σ 段の重み × 回数） */
  score: number;
}

/**
 * 推論だけで解き切れるかを確かめ、難易度の点数を付ける。使う推論は 4 段：
 *
 * - 段 1：島の残り本数がちょうど埋まる（全部の相手に架けられるだけ架ける／もう架けない）。
 *   架かった橋と交差する帯を外すのもここ
 * - 段 2：島の残り本数と相手の受け入れ幅から、一部の帯の下限か上限が決まる（数字 3・相手 2 → 両方に 1 本以上）
 * - 段 3：その帯に架けると、交差で外れる帯のせいで**別の島**の本数が足りなくなるなら、その帯には架けない
 * - 段 4（連結）：その帯に架けないと全体がつながらないなら架ける／その本数にすると島の集まりが閉じて孤立するなら、その本数にしない
 *
 * 段 1・2 は**どの島から見ても**当てる（相手の島の数字から決まる橋は相手の島の段 1・2 で決まる）。
 * 毎回**いちばん軽い段から**試し、進んだら段 1 に戻る（人が解く順に近い）。
 */
export function analyze(puzzle: PuzzleShape): Analysis {
  const inc = incidentOf(puzzle);
  const cross = crossingsOf(puzzle.edges);
  const { lo, hi } = initialBounds(puzzle);
  const uses: Record<Level, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let maxLevel: Level | 0 = 0;
  const use = (level: Level) => {
    uses[level]++;
    if (level > maxLevel) maxLevel = level;
  };
  const islands = puzzle.islands;

  /** 架かった橋と交差する帯を外す（段 1 に数える） */
  const crossOut = (): boolean => {
    for (let k = 0; k < lo.length; k++) {
      if (lo[k] === 0) continue;
      let changed = false;
      for (const j of cross[k]) {
        if (hi[j] > 0) {
          hi[j] = 0;
          changed = true;
        }
      }
      if (changed) {
        use(1);
        return true;
      }
    }
    return false;
  };

  const sums = (i: number) => {
    let sLo = 0;
    let sHi = 0;
    for (const k of inc[i]) {
      sLo += lo[k];
      sHi += hi[k];
    }
    return { sLo, sHi };
  };

  const step1 = (): boolean => {
    if (crossOut()) return true;
    for (let i = 0; i < islands.length; i++) {
      const { sLo, sHi } = sums(i);
      const open = inc[i].filter((k) => lo[k] < hi[k]);
      if (open.length === 0) continue;
      if (sHi === islands[i].n) {
        for (const k of open) lo[k] = hi[k];
        use(1);
        return true;
      }
      if (sLo === islands[i].n) {
        for (const k of open) hi[k] = lo[k];
        use(1);
        return true;
      }
    }
    return false;
  };

  const step2 = (): boolean => {
    for (let i = 0; i < islands.length; i++) {
      const n = islands[i].n;
      const { sLo, sHi } = sums(i);
      let changed = false;
      for (const k of inc[i]) {
        const newLo = Math.max(lo[k], n - (sHi - hi[k]));
        const newHi = Math.min(hi[k], n - (sLo - lo[k]));
        if (newLo !== lo[k] || newHi !== hi[k]) {
          lo[k] = newLo;
          hi[k] = newHi;
          changed = true;
          break;
        }
      }
      if (changed) {
        use(2);
        return true;
      }
    }
    return false;
  };

  const step3 = (): boolean => {
    for (let k = 0; k < lo.length; k++) {
      if (lo[k] > 0 || hi[k] === 0) continue;
      // k に架けると、交差する帯は全部 0 本になる
      const blocked = new Set(cross[k].filter((j) => hi[j] > 0));
      if (blocked.size === 0) continue;
      const touched = new Set<number>();
      for (const j of blocked) {
        touched.add(puzzle.edges[j].a);
        touched.add(puzzle.edges[j].b);
      }
      for (const i of touched) {
        if (i === puzzle.edges[k].a || i === puzzle.edges[k].b) continue;
        let cap = 0;
        for (const f of inc[i]) if (!blocked.has(f)) cap += hi[f];
        if (cap < islands[i].n) {
          hi[k] = 0;
          use(3);
          return true;
        }
      }
    }
    return false;
  };

  /** 本数の下限だけで島の集まりを作り、閉じている（どの島も数字を使い切った）集まりがあるか */
  const closedSmall = (l: number[]): boolean => {
    const parent = islands.map((_, i) => i);
    const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    puzzle.edges.forEach((e, k) => {
      if (l[k] > 0) parent[find(e.a)] = find(e.b);
    });
    const groups = new Map<number, number[]>();
    islands.forEach((_, i) => {
      const r = find(i);
      groups.set(r, [...(groups.get(r) ?? []), i]);
    });
    if (groups.size === 1) return false;
    for (const members of groups.values()) {
      const full = members.every((i) => inc[i].reduce((s, k) => s + l[k], 0) === islands[i].n);
      if (full) return true;
    }
    return false;
  };

  const step4 = (): boolean => {
    // 架けないと全体がつながらない帯には、少なくとも 1 本
    for (let k = 0; k < lo.length; k++) {
      if (lo[k] > 0 || hi[k] === 0) continue;
      const without = hi.slice();
      without[k] = 0;
      if (!canConnect(puzzle, without)) {
        lo[k] = 1;
        use(4);
        return true;
      }
    }
    // その本数にすると島の集まりが閉じて孤立するなら、その本数にしない
    for (let k = 0; k < lo.length; k++) {
      if (hi[k] <= lo[k]) continue;
      const trial = lo.slice();
      trial[k] = hi[k];
      if (closedSmall(trial)) {
        hi[k] -= 1;
        use(4);
        return true;
      }
    }
    return false;
  };

  const done = () => lo.every((v, k) => v === hi[k]);
  const consistent = () => lo.every((v, k) => v <= hi[k]);

  for (let guard = 0; guard < 10000 && !done() && consistent(); guard++) {
    if (step1() || step2() || step3() || step4()) continue;
    break;
  }
  const solved = done() && consistent() && isSolved(puzzle, lo);
  const score = (Object.keys(uses) as unknown as Level[]).reduce(
    (s, l) => s + LEVEL_WEIGHT[Number(l) as Level] * uses[Number(l) as Level],
    0,
  );
  return { solved, maxLevel, uses, score };
}

// ---- 生成 ----

function intBetween(min: number, max: number, rng: Rng): number {
  return min + Math.floor(rng() * (max - min + 1));
}

const DIRS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

/**
 * 答えの島と橋を作る（`size` の盤に `target` 個の島）。島を置けなくなったら null。
 *
 * - 新しい島は、既存の島から縦横にまっすぐ伸ばした **2 マス目以降**に置く（間に空きマスを 1 つ以上）
 * - 置く先の縦横の隣に島があってはいけない（仕様の 1′。帯と島の当たり判定を重ねない）
 * - 伸ばす途中のマスに、島・既存の橋があってはいけない（交差しない）
 */
export function layout(
  size: number,
  target: number,
  rng: Rng,
): { islands: Island[]; bridges: { a: number; b: number; count: number }[] } | null {
  const isle = new Map<number, number>();
  const bridgeCell = new Uint8Array(size * size);
  const pos: { r: number; c: number }[] = [];
  const bridges: { a: number; b: number; count: number }[] = [];
  const put = (r: number, c: number) => {
    isle.set(r * size + c, pos.length);
    pos.push({ r, c });
  };
  const inside = (r: number, c: number) => r >= 0 && c >= 0 && r < size && c < size;
  const nearIsland = (r: number, c: number) =>
    DIRS.some(([dr, dc]) => inside(r + dr, c + dc) && isle.has((r + dr) * size + (c + dc)));

  put(intBetween(0, size - 1, rng), intBetween(0, size - 1, rng));
  let fails = 0;
  while (pos.length < target) {
    if (fails > 400) return null;
    const from = Math.floor(rng() * pos.length);
    const [dr, dc] = DIRS[Math.floor(rng() * 4)];
    const { r, c } = pos[from];
    // 伸ばせる先（2 マス目以降で、途中が空いている間）を集める
    const options: number[] = [];
    let path: number[] = [];
    for (let d = 1; ; d++) {
      const nr = r + dr * d;
      const nc = c + dc * d;
      if (!inside(nr, nc)) break;
      const cell = nr * size + nc;
      if (isle.has(cell) || bridgeCell[cell]) break;
      if (d >= 2 && !nearIsland(nr, nc)) options.push(d);
      path = [...path, cell];
    }
    if (options.length === 0) {
      fails++;
      continue;
    }
    // 短めの橋を好む（盤に島を詰め込みやすい）
    const d = options[Math.min(options.length - 1, Math.floor(rng() * rng() * options.length))];
    const nr = r + dr * d;
    const nc = c + dc * d;
    for (let s = 1; s < d; s++) bridgeCell[(r + dr * s) * size + (c + dc * s)] = 1;
    put(nr, nc);
    bridges.push({ a: from, b: pos.length - 1, count: rng() < 0.5 ? 1 : 2 });
    fails = 0;
  }
  const islands = pos.map((p) => ({ r: p.r, c: p.c, n: 0 }));
  return { islands, bridges };
}

/** 生成の結果。`relaxed` は「難易度の範囲に入らないまま返した」かどうか */
export interface Generated {
  puzzle: Puzzle;
  analysis: Analysis;
  /** 一意解・推論で解ける盤を作れた回数（範囲外も含む） */
  attempts: number;
  relaxed: boolean;
}

/** 答えの島と橋から、盤（数字つき）と帯ごとの答えを作る。余分な橋（ループ）もここで足す */
function build(
  size: number,
  laid: { islands: Island[]; bridges: { a: number; b: number; count: number }[] },
  rng: Rng,
): Puzzle {
  // 位置で島を引けるようにしてから並べ替える
  const keyOf = (s: { r: number; c: number }) => s.r * size + s.c;
  const shape = shapeOf(size, laid.islands);
  const indexOf = new Map(shape.islands.map((s, i) => [keyOf(s), i]));
  const counts = shape.edges.map(() => 0);
  for (const b of laid.bridges) {
    const a = indexOf.get(keyOf(laid.islands[b.a]))!;
    const c = indexOf.get(keyOf(laid.islands[b.b]))!;
    counts[edgeBetween(shape, a, c)] = b.count;
  }
  // 余力で、橋の無い帯にも足す（交差しないものだけ）
  const cross = crossingsOf(shape.edges);
  shape.edges.forEach((_, k) => {
    if (counts[k] > 0 || rng() >= 0.35) return;
    if (cross[k].some((j) => counts[j] > 0)) return;
    counts[k] = rng() < 0.6 ? 1 : 2;
  });
  const deg = degrees(shape, counts);
  const islands = shape.islands.map((s, i) => ({ r: s.r, c: s.c, n: deg[i] }));
  return { size, islands, edges: shape.edges, solution: counts };
}

/**
 * 盤面を作る。**一意解と「推論だけで解ける」は必ず満たす。**
 *
 * 難易度（点数の範囲・使ってよい段・必ず使う段）を満たす盤が `maxAttempts` 回で見つからなければ、
 * それまでで範囲にいちばん近いものを返す（`relaxed: true`）。
 */
export function generate(def: Omit<ModeDef, 'label'>, rng: Rng): Generated {
  const { size } = def;
  const limit = Math.max(1, def.maxAttempts);
  let best: { puzzle: Puzzle; analysis: Analysis; distance: number } | null = null;
  let attempts = 0;
  for (;;) {
    const target = intBetween(def.minIslands, def.maxIslands, rng);
    const laid = layout(size, target, rng);
    if (!laid) continue;
    const puzzle = build(size, laid, rng);
    const analysis = analyze(puzzle);
    if (!analysis.solved) continue;
    if (countSolutions(puzzle, 2) !== 1) continue;
    attempts++;
    const scoreGap =
      analysis.score < def.minScore ? def.minScore - analysis.score : Math.max(0, analysis.score - def.maxScore);
    const levelGap =
      (analysis.maxLevel > def.maxLevel ? 100 : 0) + (def.needLevel && analysis.uses[def.needLevel] === 0 ? 100 : 0);
    const distance = scoreGap + levelGap;
    if (distance === 0) return { puzzle, analysis, attempts, relaxed: false };
    if (!best || distance < best.distance) best = { puzzle, analysis, distance };
    if (attempts >= limit) return { puzzle: best.puzzle, analysis: best.analysis, attempts, relaxed: true };
  }
}

export function generateFor(mode: Mode, rng: Rng): Generated {
  return generate(MODES[mode], rng);
}

/** 練習の盤の種。保存して、再読み込みで同じ盤を作り直す */
export function puzzleFromSeed(mode: Exclude<Mode, 'daily'>, seed: number): Puzzle {
  return generateFor(mode, mulberry32(seed)).puzzle;
}

/**
 * 「今日の1問」。日付キーと版から決まるので、同じ日なら誰が開いても同じ盤面。
 * 日付は端末のローカル日付（`localDateKey`）。連続日数の判定も同じ日付を使う。
 */
export function dailyPuzzle(key: DateKey = localDateKey()): Puzzle {
  const rng = mulberry32(dailySeed(key, DAILY_GENERATOR_VERSION));
  return generateFor('daily', rng).puzzle;
}

// ---- 遊ぶがわ：橋の架け方（画面から使う純関数） ----

export interface BoardState {
  /** 帯ごとの本数（0〜2） */
  counts: number[];
  /** 1 手前までの本数（`undo` で戻す） */
  history: number[][];
}

export function emptyBoard(puzzle: PuzzleShape): BoardState {
  return { counts: puzzle.edges.map(() => 0), history: [] };
}

/** 帯の切り替えの結果。`blockedBy` は架けられなかったときの交差相手（点滅させる） */
export interface ToggleResult {
  state: BoardState;
  blockedBy: number[];
}

/**
 * 帯 `k` の本数を 0 → 1 → 2 → 0 と切り替える。
 * **架けると交差する帯は変わらない**（`blockedBy` に交差相手を返す）
 */
export function toggleEdge(puzzle: PuzzleShape, state: BoardState, k: number): ToggleResult {
  const e = puzzle.edges[k];
  if (!e) return { state, blockedBy: [] };
  const now = state.counts[k] ?? 0;
  if (now === 0) {
    const blockedBy = puzzle.edges
      .map((f, j) => (j !== k && (state.counts[j] ?? 0) > 0 && edgesCross(e, f) ? j : -1))
      .filter((j) => j >= 0);
    if (blockedBy.length > 0) return { state, blockedBy };
  }
  const counts = state.counts.slice();
  counts[k] = (now + 1) % 3;
  return { state: { counts, history: [...state.history, state.counts] }, blockedBy: [] };
}

/** 島 `a` と `b` の間を切り替える（帯が無ければ何もしない） */
export function toggleBridge(puzzle: PuzzleShape, state: BoardState, a: number, b: number): ToggleResult {
  const k = edgeBetween(puzzle, a, b);
  if (k < 0) return { state, blockedBy: [] };
  return toggleEdge(puzzle, state, k);
}

/** 「最初から」。全部の橋を外した 1 手として積む（もどせる） */
export function clearAll(state: BoardState): BoardState {
  if (state.counts.every((v) => v === 0)) return state;
  return { counts: state.counts.map(() => 0), history: [...state.history, state.counts] };
}

/** 1 手もどす */
export function undo(state: BoardState): BoardState {
  const last = state.history[state.history.length - 1];
  if (!last) return state;
  return { counts: last, history: state.history.slice(0, -1) };
}

// ---- 遊ぶがわ：島の 2 回タップ ----

export interface TapResult {
  /** 選ばれている島（無ければ null） */
  selected: number | null;
  /** 切り替える帯（無ければ -1） */
  toggle: number;
}

/**
 * 島をタップしたときの選択の変わり方。
 *
 * - 何も選んでいない → その島を選ぶ
 * - 選んでいる島をもう一度 → 選択を外す
 * - 選んでいる島と帯でつながる島 → その帯を切り替える（**選択は元の島に残す**。もう一度押せば 2 本目）
 * - 帯でつながらない島 → その島を選びなおす
 */
export function tapIsland(puzzle: PuzzleShape, selected: number | null, island: number): TapResult {
  if (selected === null) return { selected: island, toggle: -1 };
  if (selected === island) return { selected: null, toggle: -1 };
  const k = edgeBetween(puzzle, selected, island);
  if (k >= 0) return { selected, toggle: k };
  return { selected: island, toggle: -1 };
}

// ---- 遊ぶがわ：当たり判定 ----

/** 押す先の最大の太さ（px） */
export const HIT_MAX_PX = 44;

/** 当たり判定の矩形（盤の左上からの px） */
export interface HitRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 帯の当たり判定の矩形。長さは間の空きマス全体、太さは `min(44px, cellPx)` で帯の中心に揃える。
 * 平行な帯どうしは中心が `cellPx` 以上離れているので、互いに重ならない
 */
export function bandRect(puzzle: PuzzleShape, k: number, cellPx: number): HitRect {
  const e = puzzle.edges[k];
  const size = puzzle.size;
  const t = Math.min(HIT_MAX_PX, cellPx);
  const first = e.cells[0];
  const r = Math.floor(first / size);
  const c = first % size;
  const len = e.cells.length * cellPx;
  if (e.horizontal) return { x: c * cellPx, y: r * cellPx + (cellPx - t) / 2, w: len, h: t };
  return { x: c * cellPx + (cellPx - t) / 2, y: r * cellPx, w: t, h: len };
}

export type Hit = { kind: 'island'; island: number } | { kind: 'edge'; edge: number } | null;

/**
 * 盤の上の点（盤の左上からの px）が何に当たるか。
 *
 * - **島**：その島のマス全体
 * - **帯**：`bandRect` の矩形
 * - **交点**（縦と横の帯が通るマス）：橋が架かっている方を取る。**両方 0 本なら何も取らない**
 *   （どちらが切り替わるか予想できないため。島の 2 回タップで選べばよい）
 */
export function hitTest(puzzle: PuzzleShape, counts: number[], point: { x: number; y: number }, cellPx: number): Hit {
  const { size } = puzzle;
  const col = Math.floor(point.x / cellPx);
  const row = Math.floor(point.y / cellPx);
  if (row < 0 || col < 0 || row >= size || col >= size) return null;
  const cell = row * size + col;
  const island = puzzle.islands.findIndex((s) => s.r === row && s.c === col);
  if (island >= 0) return { kind: 'island', island };
  const hits: number[] = [];
  puzzle.edges.forEach((e, k) => {
    if (!e.cells.includes(cell)) return;
    const b = bandRect(puzzle, k, cellPx);
    if (point.x >= b.x && point.x < b.x + b.w && point.y >= b.y && point.y < b.y + b.h) hits.push(k);
  });
  if (hits.length === 0) return null;
  if (hits.length === 1) {
    // 交点のマスで、もう一方の帯がこの点を外れているだけなら、交点として扱う
    const k = hits[0];
    const other = puzzle.edges.findIndex((f, j) => j !== k && f.cells.includes(cell));
    if (other < 0) return { kind: 'edge', edge: k };
    return (counts[k] ?? 0) > 0 ? { kind: 'edge', edge: k } : null;
  }
  const built = hits.filter((k) => (counts[k] ?? 0) > 0);
  return built.length > 0 ? { kind: 'edge', edge: built[0] } : null;
}

// ---- 読み上げ ----

/** 「3行2列」 */
export function islandLabel(s: Island): string {
  return `${s.r + 1}行${s.c + 1}列`;
}

/** 帯の読み上げ（「3行2列の島(4)と3行6列の島(2)の間、いま1本」） */
export function edgeLabel(puzzle: PuzzleShape, k: number, count: number): string {
  const e = puzzle.edges[k];
  const a = puzzle.islands[e.a];
  const b = puzzle.islands[e.b];
  return `${islandLabel(a)}の島(${a.n})と${islandLabel(b)}の島(${b.n})の間、いま${count}本`;
}

/** 島の読み上げ（「数字 4、橋 3 本、あと 1 本」） */
export function islandAria(s: Island, degree: number): string {
  const rest = s.n - degree;
  const tail = rest > 0 ? `あと${rest}本` : rest === 0 ? 'ちょうど' : `${-rest}本多い`;
  return `${islandLabel(s)}、数字${s.n}、橋${degree}本、${tail}`;
}

// ---- 途中経過の保存（今日の1問と各段階の「いまの盤」） ----

/** 保存の置き場所。**答えは保存しない**（盤は日付か種から作り直す） */
export const PROGRESS_KEY = 'hasokon-games:hashi-kake:progress:v1';

export interface SavedBoard {
  /** 今日の1問なら日付、練習なら種 */
  dateKey?: DateKey;
  seed?: number;
  /** 帯ごとの本数 */
  counts: number[];
}

export type Progress = Partial<Record<Mode, SavedBoard>>;

/** 壊れた値・古い形は捨てる（例外を外へ出さない） */
export function parseProgress(raw: string | null): Progress {
  if (!raw) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof data !== 'object' || data === null) return {};
  const out: Progress = {};
  for (const mode of MODE_ORDER) {
    const v = (data as Record<string, unknown>)[mode];
    if (typeof v !== 'object' || v === null) continue;
    const s = v as Record<string, unknown>;
    if (!Array.isArray(s.counts) || !s.counts.every((n) => n === 0 || n === 1 || n === 2)) continue;
    const saved: SavedBoard = { counts: s.counts as number[] };
    if (typeof s.dateKey === 'string') saved.dateKey = s.dateKey;
    if (typeof s.seed === 'number' && Number.isFinite(s.seed)) saved.seed = s.seed;
    out[mode] = saved;
  }
  return out;
}

/** `localStorage` のうち、ここで使う部分だけ（テストでは差し替える） */
export interface ProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 保存してある途中経過を読む。読めない・壊れているときは空 */
export function readProgress(storage: ProgressStorage | null): Progress {
  try {
    return parseProgress(storage?.getItem(PROGRESS_KEY) ?? null);
  } catch {
    return {};
  }
}

/**
 * 1 つの段階の途中経過を書く（`null` なら消す）。ほかの段階の保存は残す。
 * 書けなくても遊べる（再読み込みで盤が戻らないだけ）
 */
export function writeProgress(storage: ProgressStorage | null, mode: Mode, saved: SavedBoard | null): void {
  try {
    if (!storage) return;
    const progress = readProgress(storage);
    if (saved) progress[mode] = saved;
    else delete progress[mode];
    storage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // 何もしない
  }
}

/**
 * 保存してあった本数を盤に戻す。帯の数が合わなければ（別の盤の保存）空から。
 * 交差する橋は、先に並んでいる方だけを残す
 */
export function restoreCounts(puzzle: PuzzleShape, saved: number[]): number[] {
  if (saved.length !== puzzle.edges.length) return puzzle.edges.map(() => 0);
  const counts = puzzle.edges.map(() => 0);
  saved.forEach((v, k) => {
    if (v <= 0) return;
    if (puzzle.edges.some((f, j) => counts[j] > 0 && edgesCross(puzzle.edges[k], f))) return;
    counts[k] = Math.min(2, v);
  });
  return counts;
}

// ---- 記録 ----

/**
 * クリアしたときに `lib/records.ts` へ渡す結果。
 *
 * **`moves`（手数）は渡さない**（四角わけと同じ理由：切り替えの回数は仮置きを罰するだけで、ベストの意味が無い）。
 * ベストは時間と（今日の1問の）連続日数だけ
 */
export function clearResult(mode: Mode, timeMs: number, today: DateKey): PlayResult {
  return mode === 'daily' ? { outcome: 'win', timeMs, clearedOn: today } : { outcome: 'win', timeMs };
}

// ---- 共有 ----

/**
 * クリアの結果を共有する文面。**盤の橋（答え）を入れない**。
 * 入れるのは日付・盤の大きさ・時間・連続日数と URL だけ。
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
      ? `橋かけパズル 今日の1問（${dateKey}・${size}×${size}）${time}`
      : `橋かけパズル ${MODES[mode].label}（${size}×${size}）${time}`;
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
