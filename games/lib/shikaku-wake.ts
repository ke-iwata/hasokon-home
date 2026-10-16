/**
 * 四角わけパズル（盤を数字どおりのマス数の長方形に切り分けるロジックパズル）
 *
 * 仕様: docs/features/game-shikaku-wake.md
 *
 * ## ルール
 *
 * N×N の盤を、縦横の線に沿った長方形（正方形を含む）に隙間も重なりも無く切り分ける。
 * どの長方形も数字をちょうど 1 つ含み、その数字が長方形のマス数。
 * **クリアの判定はルールで行い、用意した答えとの一致では見ない**（`isSolved`）。
 *
 * ## 生成（`generate`）
 *
 * 1. 答えの区切りを先に作る（1×1 から始め、隣どうしを「併合しても長方形・上限マス数以内」の組から選んで併合）
 * 2. 各四角の 1 マスに数字を置く
 * 3. ソルバーで解を 2 つまで数える（`countSolutions`）
 * 4. 別解が出たら、別解で形の変わった数字を同じ四角の別のマスへ動かして 3 に戻る（別解潰し）
 * 5. 推論だけで解き切れることを確かめ（`analyze`）、難易度の点数が段階の範囲に入るまで回す
 *
 * **打ち切りは試行回数で決め、壁時計で決めない**（時間で切ると端末ごとに今日の盤が変わる）。
 * 上限を超えたら**難易度の条件だけを緩める**（一意解・推論で解ける、は緩めない）。
 *
 * ## 遊ぶがわ
 *
 * 四角の置き方（`placeRect` / `removeAt` / `clearAll` / `undo`）と、
 * 指・マウス・キーの入力の状態（`pointerStep`）を純関数で持つ。`Game.tsx` は入力と描画だけ。
 */

import { dailySeed, localDateKey, mulberry32, type DateKey } from './daily';
import type { PlayResult } from './records';

/** 乱数。`[0, 1)` を返す */
export type Rng = () => number;

/** 長方形。行・列はどちらも両端を含む（`r0 <= r1`・`c0 <= c1`） */
export interface Rect {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

/** 盤面（出題）。`solution` は答えなので画面には出さない（判定にも使わない） */
export interface Puzzle {
  /** 1辺のマス数 */
  size: number;
  /** 各マスの数字（0 は数字なし）。長さは size × size */
  clues: number[];
  /** 答えの区切り。一意であることは生成時に確かめている */
  solution: Rect[];
}

/** 難易度のモード。`daily` は「今日の1問」 */
export type Mode = 'easy' | 'normal' | 'hard' | 'daily';

export interface ModeDef {
  label: string;
  size: number;
  /** 数字（＝四角）の数の範囲 */
  minClues: number;
  maxClues: number;
  /** 難易度の点数（`analyze` の `score`）の範囲。両端を含む */
  minScore: number;
  maxScore: number;
  /** 段階の範囲に入る盤が出るまで作り直す回数の上限（時間ではなく回数で打ち切る） */
  maxAttempts: number;
}

/**
 * 仕様書「段階と盤の大きさ」の表のとおり。
 *
 * 点数の範囲は実測で決めた（games/docs/DECISIONS.md の 2026-10-16）。
 * 段階どうしで**範囲を重ねない**（`tests/shikaku-wake.test.ts` が見張る）
 */
export const MODES: Record<Mode, ModeDef> = {
  easy: { label: 'かんたん', size: 5, minClues: 5, maxClues: 8, minScore: 7, maxScore: 12, maxAttempts: 30 },
  normal: { label: 'ふつう', size: 7, minClues: 9, maxClues: 14, minScore: 16, maxScore: 28, maxAttempts: 30 },
  hard: { label: 'むずかしい', size: 9, minClues: 13, maxClues: 20, minScore: 34, maxScore: 9999, maxAttempts: 30 },
  daily: { label: '今日の1問', size: 7, minClues: 9, maxClues: 14, minScore: 16, maxScore: 28, maxAttempts: 30 },
};

/** モードの並び順（画面のボタンもこの順に出す） */
export const MODE_ORDER: Mode[] = ['daily', 'easy', 'normal', 'hard'];

/** 1 つの四角の最大マス数（`N + 3`。巨大な四角は推論が単調になる） */
export function maxAreaFor(size: number): number {
  return size + 3;
}

/** 数字「1」（1×1 の四角）は盤に何個まで */
export const MAX_ONES = 2;

/**
 * 日替わりの生成手順の版。
 *
 * **生成の手順（区切りの作り方・数字の置き方・一意性と推論の判定・点数の範囲）を変えたら上げる。**
 * シードは日付と版から作る（`dailySeed(key, version)`）ので、上げると当日の問題も変わる。
 * そのため記録の区分（`DAILY_VARIANT`）も版つきにして一緒に変える（数字つなぎ一筆書きと同じ形）
 */
export const DAILY_GENERATOR_VERSION = 1;

/** 記録の区分（`lib/records.ts` の variant）。難易度と日替わりをこれで分ける */
export const DAILY_VARIANT = `daily-v${DAILY_GENERATOR_VERSION}`;

/** 記録の区分名。日替わりだけ版を持つ */
export function variantOf(mode: Mode): string {
  return mode === 'daily' ? DAILY_VARIANT : mode;
}

// ---- 長方形の道具 ----

export function rowOf(index: number, size: number): number {
  return Math.floor(index / size);
}

export function colOf(index: number, size: number): number {
  return index % size;
}

/** 2 つのマスを対角とする長方形 */
export function rectFrom(a: number, b: number, size: number): Rect {
  const ra = rowOf(a, size);
  const ca = colOf(a, size);
  const rb = rowOf(b, size);
  const cb = colOf(b, size);
  return { r0: Math.min(ra, rb), c0: Math.min(ca, cb), r1: Math.max(ra, rb), c1: Math.max(ca, cb) };
}

export function rectHeight(r: Rect): number {
  return r.r1 - r.r0 + 1;
}

export function rectWidth(r: Rect): number {
  return r.c1 - r.c0 + 1;
}

export function rectArea(r: Rect): number {
  return rectHeight(r) * rectWidth(r);
}

export function rectContains(r: Rect, row: number, col: number): boolean {
  return row >= r.r0 && row <= r.r1 && col >= r.c0 && col <= r.c1;
}

export function rectContainsCell(r: Rect, cell: number, size: number): boolean {
  return rectContains(r, rowOf(cell, size), colOf(cell, size));
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.r0 <= b.r1 && b.r0 <= a.r1 && a.c0 <= b.c1 && b.c0 <= a.c1;
}

export function sameRect(a: Rect, b: Rect): boolean {
  return a.r0 === b.r0 && a.c0 === b.c0 && a.r1 === b.r1 && a.c1 === b.c1;
}

export function inBounds(r: Rect, size: number): boolean {
  return r.r0 >= 0 && r.c0 >= 0 && r.r1 < size && r.c1 < size && r.r0 <= r.r1 && r.c0 <= r.c1;
}

/** 長方形が覆うマスの添字（行の順） */
export function cellsOf(r: Rect, size: number): number[] {
  const out: number[] = [];
  for (let row = r.r0; row <= r.r1; row++) for (let col = r.c0; col <= r.c1; col++) out.push(row * size + col);
  return out;
}

/** 辺を共有している（角だけで接するのは含めない） */
export function rectsTouch(a: Rect, b: Rect): boolean {
  const rowsMeet = a.r0 <= b.r1 && b.r0 <= a.r1;
  const colsMeet = a.c0 <= b.c1 && b.c0 <= a.c1;
  return (rowsMeet && (a.c1 + 1 === b.c0 || b.c1 + 1 === a.c0)) || (colsMeet && (a.r1 + 1 === b.r0 || b.r1 + 1 === a.r0));
}

/** 長方形の中にある数字のマス */
export function cluesIn(puzzle: Pick<Puzzle, 'size' | 'clues'>, r: Rect): number[] {
  return cellsOf(r, puzzle.size).filter((c) => puzzle.clues[c] > 0);
}

// ---- ルールの判定 ----

/** その四角が「数字をちょうど 1 つ含み、マス数が数字と同じ」か（満たした数字を太字にする） */
export function isSatisfied(puzzle: Pick<Puzzle, 'size' | 'clues'>, r: Rect): boolean {
  if (!inBounds(r, puzzle.size)) return false;
  const inside = cluesIn(puzzle, r);
  return inside.length === 1 && puzzle.clues[inside[0]] === rectArea(r);
}

/**
 * 規則に反している四角の添字（「チェック」で印を付ける）。
 * 数字を 0 個・2 個以上含む・マス数が数字と違う・盤からはみ出す・他の四角と重なる。
 * **答えとの比較はしない**（答えを教えないため）
 */
export function violations(puzzle: Pick<Puzzle, 'size' | 'clues'>, rects: Rect[]): number[] {
  const out: number[] = [];
  rects.forEach((r, i) => {
    const overlapping = rects.some((o, j) => j !== i && rectsOverlap(r, o));
    if (overlapping || !isSatisfied(puzzle, r)) out.push(i);
  });
  return out;
}

/** クリアか。全マスがちょうど 1 回ずつ覆われ、全部の四角が規則を満たす */
export function isSolved(puzzle: Pick<Puzzle, 'size' | 'clues'>, rects: Rect[]): boolean {
  const { size } = puzzle;
  const covered = new Array<number>(size * size).fill(0);
  for (const r of rects) {
    if (!isSatisfied(puzzle, r)) return false;
    for (const c of cellsOf(r, size)) covered[c]++;
  }
  return covered.every((n) => n === 1);
}

// ---- ソルバー ----

/** 数字ごとの候補（その数字だけを含み、面積が合い、盤に収まる長方形） */
export interface Candidates {
  /** 数字のマスの添字（盤の順） */
  clueCells: number[];
  /** `clueCells[k]` の候補 */
  byClue: Rect[][];
}

export function candidatesFor(puzzle: Pick<Puzzle, 'size' | 'clues'>): Candidates {
  const { size, clues } = puzzle;
  const clueCells: number[] = [];
  clues.forEach((v, i) => {
    if (v > 0) clueCells.push(i);
  });
  const byClue = clueCells.map((cell) => {
    const n = clues[cell];
    const row = rowOf(cell, size);
    const col = colOf(cell, size);
    const list: Rect[] = [];
    for (let h = 1; h <= Math.min(n, size); h++) {
      if (n % h !== 0) continue;
      const w = n / h;
      if (w > size) continue;
      for (let r0 = row - h + 1; r0 <= row; r0++) {
        for (let c0 = col - w + 1; c0 <= col; c0++) {
          const r: Rect = { r0, c0, r1: r0 + h - 1, c1: c0 + w - 1 };
          if (!inBounds(r, size)) continue;
          if (cluesIn(puzzle, r).length !== 1) continue;
          list.push(r);
        }
      }
    }
    return list;
  });
  return { clueCells, byClue };
}

interface Indexed {
  size: number;
  total: number;
  /** 候補ごとの覆うマス */
  cells: number[][];
  /** 候補の持ち主（数字の番号） */
  owner: number[];
  rect: Rect[];
  /** マスごとに、そのマスを覆う候補 */
  byCell: number[][];
  clueCount: number;
}

function indexCandidates(puzzle: Pick<Puzzle, 'size' | 'clues'>, cand: Candidates = candidatesFor(puzzle)): Indexed {
  const { size } = puzzle;
  const total = size * size;
  const cells: number[][] = [];
  const owner: number[] = [];
  const rect: Rect[] = [];
  const byCell: number[][] = Array.from({ length: total }, () => []);
  cand.byClue.forEach((list, k) => {
    for (const r of list) {
      const id = rect.length;
      const cs = cellsOf(r, size);
      cells.push(cs);
      owner.push(k);
      rect.push(r);
      for (const c of cs) byCell[c].push(id);
    }
  });
  return { size, total, cells, owner, rect, byCell, clueCount: cand.clueCells.length };
}

export interface SolveResult {
  /** 見つけた解の数（`limit` で打ち切る） */
  count: number;
  /** 見つけた解（最大 `limit` 個）。四角は数字の順 */
  solutions: Rect[][];
}

/**
 * 解を `limit` 個まで探す。完全被覆のバックトラックで、
 * **覆われていないマスのうち置ける候補が最も少ないマス**から決める（候補 0 のマスで即座に戻る）。
 */
export function solve(puzzle: Pick<Puzzle, 'size' | 'clues'>, limit = 2): SolveResult {
  const idx = indexCandidates(puzzle);
  const { total, cells, owner, byCell, clueCount } = idx;
  const covered = new Uint8Array(total);
  const used = new Uint8Array(clueCount);
  const chosen: number[] = [];
  const solutions: Rect[][] = [];
  // 面積の合計が盤と合わなければ解は無い
  const sum = puzzle.clues.reduce((a, b) => a + b, 0);
  if (sum !== total || clueCount === 0) return { count: 0, solutions };

  const fits = (id: number): boolean => {
    if (used[owner[id]]) return false;
    for (const c of cells[id]) if (covered[c]) return false;
    return true;
  };

  const rec = (): void => {
    if (solutions.length >= limit) return;
    let best = -1;
    let bestCount = Infinity;
    for (let c = 0; c < total; c++) {
      if (covered[c]) continue;
      let n = 0;
      for (const id of byCell[c]) if (fits(id)) n++;
      if (n < bestCount) {
        bestCount = n;
        best = c;
        if (n <= 1) break;
      }
    }
    if (best === -1) {
      const sol = chosen.map((id) => idx.rect[id]);
      sol.sort((a, b) => a.r0 - b.r0 || a.c0 - b.c0);
      solutions.push(sol);
      return;
    }
    if (bestCount === 0) return;
    for (const id of byCell[best]) {
      if (!fits(id)) continue;
      used[owner[id]] = 1;
      for (const c of cells[id]) covered[c] = 1;
      chosen.push(id);
      rec();
      chosen.pop();
      for (const c of cells[id]) covered[c] = 0;
      used[owner[id]] = 0;
      if (solutions.length >= limit) return;
    }
  };
  rec();
  return { count: solutions.length, solutions };
}

/** 解の数を `limit` まで数える */
export function countSolutions(puzzle: Pick<Puzzle, 'size' | 'clues'>, limit = 2): number {
  return solve(puzzle, limit).count;
}

// ---- 推論（当てずっぽうなしで解けるか・難易度） ----

/** 推論の段。重いほど難しい */
export type Level = 1 | 2 | 3 | 4;

/** 段ごとの重み（難易度の点数に足す） */
export const LEVEL_WEIGHT: Record<Level, number> = { 1: 1, 2: 2, 3: 3, 4: 6 };

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
 * - 段 1：候補が 1 つしか無い数字は確定（他の数字の候補から、そのマスを使うものを外す）
 * - 段 2：あるマスを覆える候補が 1 つの数字にしか無いなら、その数字はそのマスを含む候補に絞る
 * - 段 3：ある数字の全候補が共通して覆うマスは、その数字のもの（他の数字の候補から外す）
 * - 段 4：ある候補を置くと、どこかの数字の候補か、どこかのマスを覆える候補が 0 になるなら、その候補を外す
 *
 * 毎回**いちばん軽い段から**試し、進んだら段 1 に戻る（人が解く順に近い）。
 */
export function analyze(puzzle: Pick<Puzzle, 'size' | 'clues'>): Analysis {
  const idx = indexCandidates(puzzle);
  const { total, cells, owner, byCell, clueCount } = idx;
  const alive = new Uint8Array(cells.length).fill(1);
  const byClue: number[][] = Array.from({ length: clueCount }, () => []);
  owner.forEach((k, id) => byClue[k].push(id));
  const fixed = new Uint8Array(clueCount);
  const uses: Record<Level, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let maxLevel: Level | 0 = 0;

  const aliveOf = (k: number) => byClue[k].filter((id) => alive[id]);
  /** マス c を他の数字（k 以外）が使う候補を外す。外したら true */
  const claim = (k: number, cs: number[]): boolean => {
    let changed = false;
    for (const c of cs) {
      for (const id of byCell[c]) {
        if (alive[id] && owner[id] !== k) {
          alive[id] = 0;
          changed = true;
        }
      }
    }
    return changed;
  };
  const use = (level: Level) => {
    uses[level]++;
    if (level > maxLevel) maxLevel = level;
  };

  const step1 = (): boolean => {
    for (let k = 0; k < clueCount; k++) {
      if (fixed[k]) continue;
      const list = aliveOf(k);
      if (list.length !== 1) continue;
      fixed[k] = 1;
      claim(k, cells[list[0]]);
      use(1);
      return true;
    }
    return false;
  };

  const step2 = (): boolean => {
    for (let c = 0; c < total; c++) {
      const ids = byCell[c].filter((id) => alive[id]);
      if (ids.length === 0) continue;
      const k = owner[ids[0]];
      if (!ids.every((id) => owner[id] === k)) continue;
      // k の候補のうち、このマスを含まないものを外す
      let changed = false;
      for (const id of byClue[k]) {
        if (alive[id] && !cells[id].includes(c)) {
          alive[id] = 0;
          changed = true;
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
    for (let k = 0; k < clueCount; k++) {
      if (fixed[k]) continue;
      const list = aliveOf(k);
      if (list.length === 0) continue;
      const common = cells[list[0]].filter((c) => list.every((id) => cells[id].includes(c)));
      if (claim(k, common)) {
        use(3);
        return true;
      }
    }
    return false;
  };

  /** 候補 id を置いたら行き詰まるか */
  const contradicts = (id: number): boolean => {
    const k = owner[id];
    const blocked = new Set<number>();
    for (const c of cells[id]) for (const o of byCell[c]) if (alive[o] && owner[o] !== k) blocked.add(o);
    for (let j = 0; j < clueCount; j++) {
      if (j === k) continue;
      if (!byClue[j].some((o) => alive[o] && !blocked.has(o))) return true;
    }
    const mine = new Set(cells[id]);
    for (let c = 0; c < total; c++) {
      if (mine.has(c)) continue;
      // k の他の候補は、id を置けば使えない
      if (!byCell[c].some((o) => alive[o] && owner[o] !== k && !blocked.has(o))) return true;
    }
    return false;
  };

  const step4 = (): boolean => {
    for (let k = 0; k < clueCount; k++) {
      if (fixed[k]) continue;
      const list = aliveOf(k);
      if (list.length < 2) continue;
      for (const id of list) {
        if (contradicts(id)) {
          alive[id] = 0;
          use(4);
          return true;
        }
      }
    }
    return false;
  };

  const done = () => {
    for (let k = 0; k < clueCount; k++) if (!fixed[k]) return false;
    return true;
  };

  // 盤の面積と数字の合計が合わなければ、推論以前に解けない
  const sum = puzzle.clues.reduce((a, b) => a + b, 0);
  if (sum === total && clueCount > 0) {
    // 段の上限回数は候補の数で抑えられる（毎回少なくとも 1 つ外すか確定する）
    for (let guard = 0; guard <= cells.length + clueCount && !done(); guard++) {
      if (step1() || step2() || step3() || step4()) continue;
      break;
    }
  }
  const solved = done() && byClue.every((list) => list.filter((id) => alive[id]).length === 1);
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

/**
 * 答えの区切りを作る。全マスを 1×1 から始め、隣り合う 2 つを
 * 「くっつけても長方形になり、上限マス数を超えない」組から無作為に選んで併合する。
 *
 * 小さい四角どうしの組ほど選ばれやすくする（1×1 の山や極端に大きい四角を作りにくくする）。
 * 目標の数に届く前に併合できる組が尽きたら null。
 */
export function partition(size: number, target: number, maxArea: number, rng: Rng): Rect[] | null {
  const rects: Rect[] = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) rects.push({ r0: r, c0: c, r1: r, c1: c });
  while (rects.length > target) {
    const pairs: { i: number; j: number; merged: Rect; weight: number }[] = [];
    let sum = 0;
    for (let i = 0; i < rects.length; i++) {
      const a = rects[i];
      for (let j = i + 1; j < rects.length; j++) {
        const b = rects[j];
        let merged: Rect | null = null;
        if (a.r0 === b.r0 && a.r1 === b.r1 && (a.c1 + 1 === b.c0 || b.c1 + 1 === a.c0)) {
          merged = { r0: a.r0, r1: a.r1, c0: Math.min(a.c0, b.c0), c1: Math.max(a.c1, b.c1) };
        } else if (a.c0 === b.c0 && a.c1 === b.c1 && (a.r1 + 1 === b.r0 || b.r1 + 1 === a.r0)) {
          merged = { c0: a.c0, c1: a.c1, r0: Math.min(a.r0, b.r0), r1: Math.max(a.r1, b.r1) };
        }
        if (!merged) continue;
        const area = rectArea(merged);
        if (area > maxArea) continue;
        const weight = 1 / (area * area);
        sum += weight;
        pairs.push({ i, j, merged, weight });
      }
    }
    if (pairs.length === 0) return null;
    let pick = rng() * sum;
    let chosen = pairs[pairs.length - 1];
    for (const p of pairs) {
      pick -= p.weight;
      if (pick < 0) {
        chosen = p;
        break;
      }
    }
    rects.splice(chosen.j, 1);
    rects[chosen.i] = chosen.merged;
  }
  return rects;
}

/** 区切りの各四角に、数字を置くマスを 1 つずつ選ぶ */
export function placeClues(rects: Rect[], size: number, rng: Rng): number[] {
  return rects.map((r) => {
    const cs = cellsOf(r, size);
    return cs[Math.floor(rng() * cs.length)];
  });
}

function cluesFrom(rects: Rect[], positions: number[], size: number): number[] {
  const clues = new Array<number>(size * size).fill(0);
  rects.forEach((r, i) => {
    clues[positions[i]] = rectArea(r);
  });
  return clues;
}

/**
 * 別解を潰す。2 つ目の解が出るたびに、別解で形の変わった数字を 1 つ選び、
 * 答えの同じ四角の中の別のマスへ動かす。`maxFixes` 回で一意にならなければ null
 */
export function makeUnique(
  rects: Rect[],
  positions: number[],
  size: number,
  rng: Rng,
  maxFixes = 40,
): number[] | null {
  const pos = positions.slice();
  for (let fix = 0; fix <= maxFixes; fix++) {
    const clues = cluesFrom(rects, pos, size);
    const { count, solutions } = solve({ size, clues }, 2);
    if (count === 1) return pos;
    if (count === 0) return null;
    // 答えと別解で形の違う四角（答えの側）を集め、そのどれかの数字を動かす
    const other = solutions.find((s) => !rects.every((r) => s.some((o) => sameRect(r, o)))) ?? solutions[1];
    const differing = rects
      .map((r, i) => i)
      .filter((i) => !other.some((o) => sameRect(o, rects[i])) && rectArea(rects[i]) > 1);
    if (differing.length === 0) return null;
    const i = differing[Math.floor(rng() * differing.length)];
    const choices = cellsOf(rects[i], size).filter((c) => c !== pos[i]);
    pos[i] = choices[Math.floor(rng() * choices.length)];
  }
  return null;
}

/** 生成の結果。`relaxed` は「難易度の範囲に入らないまま返した」かどうか */
export interface Generated {
  puzzle: Puzzle;
  analysis: Analysis;
  /** 一意解・推論で解ける盤を作れた回数（範囲外も含む） */
  attempts: number;
  relaxed: boolean;
}

/**
 * 盤面を作る。**一意解と「推論だけで解ける」は必ず満たす。**
 *
 * 難易度の点数が範囲に入る盤が `maxAttempts` 回で見つからなければ、
 * それまでで範囲にいちばん近いものを返す（`relaxed: true`）。
 */
export function generate(def: Omit<ModeDef, 'label'>, rng: Rng): Generated {
  const { size } = def;
  const maxArea = maxAreaFor(size);
  const limit = Math.max(1, def.maxAttempts);
  let best: { puzzle: Puzzle; analysis: Analysis; distance: number } | null = null;
  let attempts = 0;
  // 一意解・推論で解ける盤が出るまでは回し続ける（回数で緩めるのは難易度だけ）
  for (;;) {
    const target = intBetween(def.minClues, def.maxClues, rng);
    const rects = partition(size, target, maxArea, rng);
    if (!rects) continue;
    if (rects.filter((r) => rectArea(r) === 1).length > MAX_ONES) continue;
    const positions = makeUnique(rects, placeClues(rects, size, rng), size, rng);
    if (!positions) continue;
    const clues = cluesFrom(rects, positions, size);
    const analysis = analyze({ size, clues });
    if (!analysis.solved) continue;
    attempts++;
    const solution = rects.slice().sort((a, b) => a.r0 - b.r0 || a.c0 - b.c0);
    const puzzle: Puzzle = { size, clues, solution };
    const distance =
      analysis.score < def.minScore ? def.minScore - analysis.score : Math.max(0, analysis.score - def.maxScore);
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

// ---- 遊ぶがわ：四角の置き方（画面から使う純関数） ----

/** 履歴の 1 手。置いた 1 枚と、その手で消えた四角 */
export interface Move {
  placed: Rect | null;
  removed: Rect[];
}

export interface BoardState {
  rects: Rect[];
  history: Move[];
}

export const EMPTY_BOARD: BoardState = { rects: [], history: [] };

/** マスを含む四角の添字（無ければ -1） */
export function rectIndexAt(rects: Rect[], cell: number, size: number): number {
  return rects.findIndex((r) => rectContainsCell(r, cell, size));
}

/**
 * a と b を対角とする四角を引く。
 *
 * - 同じマスを 2 回（a = b）：そのマスが四角の中なら**その四角を消す**、外なら 1×1 を引く
 * - 新しい四角が既存の四角と重なったら、**重なった既存の四角を消して**新しい方を置く
 *
 * どちらも 1 手として履歴に積む（`undo` 1 回で、消えた四角ごと元に戻る）
 */
export function placeRect(state: BoardState, a: number, b: number, size: number): BoardState {
  if (a === b) {
    const i = rectIndexAt(state.rects, a, size);
    if (i >= 0) return removeAt(state, a, size);
  }
  const placed = rectFrom(a, b, size);
  const removed = state.rects.filter((r) => rectsOverlap(r, placed));
  const kept = state.rects.filter((r) => !rectsOverlap(r, placed));
  return { rects: [...kept, placed], history: [...state.history, { placed, removed }] };
}

/** マスを含む四角を消す（Delete・同じマス 2 回）。無ければ何もしない */
export function removeAt(state: BoardState, cell: number, size: number): BoardState {
  const i = rectIndexAt(state.rects, cell, size);
  if (i < 0) return state;
  const target = state.rects[i];
  return {
    rects: state.rects.filter((_, j) => j !== i),
    history: [...state.history, { placed: null, removed: [target] }],
  };
}

/** 「最初から」。全部の四角を `removed` に入れた 1 手として積む（もどせる） */
export function clearAll(state: BoardState): BoardState {
  if (state.rects.length === 0) return state;
  return { rects: [], history: [...state.history, { placed: null, removed: state.rects.slice() }] };
}

/** 1 手もどす。置いた 1 枚を外し、その手で消えた四角を全部戻す */
export function undo(state: BoardState): BoardState {
  const last = state.history[state.history.length - 1];
  if (!last) return state;
  const placed = last.placed;
  const rects = placed ? state.rects.filter((r) => !sameRect(r, placed)) : state.rects.slice();
  return { rects: [...rects, ...last.removed], history: state.history.slice(0, -1) };
}

// ---- 遊ぶがわ：入力の状態（指・マウス・キー） ----

/**
 * 入力の状態。仕様書「入力の状態と結果」の表の 4 つ。
 *
 * - `idle`：角なし
 * - `pressIdle`：角なしから押している（起点 `origin`）
 * - `corner`：角あり（`a`）
 * - `pressCorner`：角ありから押している（角 `a`）
 */
export type InputState =
  | { kind: 'idle' }
  | { kind: 'pressIdle'; origin: number }
  | { kind: 'corner'; a: number }
  | { kind: 'pressCorner'; a: number };

export const IDLE: InputState = { kind: 'idle' };

/**
 * 入力の出来事。`cell` が null は盤の外。
 *
 * - `down` / `move` / `up` / `cancel`：Pointer Events
 * - `dismiss`：盤の外・「やめる」をタップ、Esc
 * - `key`：Space／Enter（`cell` はカーソルの位置）
 */
export type InputEvent =
  | { type: 'down'; cell: number }
  | { type: 'move'; cell: number | null }
  | { type: 'up'; cell: number | null }
  | { type: 'cancel' }
  | { type: 'dismiss' }
  | { type: 'key'; cell: number };

export interface StepOutput {
  state: InputState;
  /** 四角を引く（`placeRect(a, b)`）。引かないなら null */
  place: { a: number; b: number } | null;
}

/**
 * 入力の状態を 1 つ進める（純関数）。
 *
 * **角がある間は「2 点目をどこで離すか」だけを見る**。角 A を置いたあと B で押して動かし C で離したら
 * A–C の 2 点タップになり、B–C のなぞりにはならない（押し始めが 1 マスずれても結果が変わらない）。
 */
export function pointerStep(state: InputState, event: InputEvent): StepOutput {
  const stay: StepOutput = { state, place: null };
  switch (state.kind) {
    case 'idle':
      if (event.type === 'down') return { state: { kind: 'pressIdle', origin: event.cell }, place: null };
      if (event.type === 'key') return { state: { kind: 'corner', a: event.cell }, place: null };
      return stay;
    case 'pressIdle':
      if (event.type === 'up') {
        if (event.cell === null) return { state: IDLE, place: null };
        if (event.cell === state.origin) return { state: { kind: 'corner', a: state.origin }, place: null };
        return { state: IDLE, place: { a: state.origin, b: event.cell } };
      }
      if (event.type === 'cancel' || event.type === 'dismiss') return { state: IDLE, place: null };
      return stay;
    case 'corner':
      if (event.type === 'down') return { state: { kind: 'pressCorner', a: state.a }, place: null };
      if (event.type === 'dismiss') return { state: IDLE, place: null };
      if (event.type === 'key') return { state: IDLE, place: { a: state.a, b: event.cell } };
      return stay;
    case 'pressCorner':
      if (event.type === 'up') {
        if (event.cell === null) return { state: { kind: 'corner', a: state.a }, place: null };
        return { state: IDLE, place: { a: state.a, b: event.cell } };
      }
      if (event.type === 'cancel') return { state: { kind: 'corner', a: state.a }, place: null };
      if (event.type === 'dismiss') return { state: IDLE, place: null };
      return stay;
  }
}

/** 角を置いた・押している間に薄く出す、引かれる予定の四角。`hover` は指・マウスのいるマス */
export function previewRect(state: InputState, hover: number | null, size: number): Rect | null {
  if (hover === null) return null;
  if (state.kind === 'pressIdle') return rectFrom(state.origin, hover, size);
  if (state.kind === 'corner' || state.kind === 'pressCorner') return rectFrom(state.a, hover, size);
  return null;
}

// ---- 描画の補助 ----

/** 塗りの色の数（`--sw-r0`〜`--sw-r5`） */
export const COLOR_COUNT = 6;

/**
 * 隣り合う四角が同じ色にならないよう、貪欲に色を割り当てる。
 * 6 色で足りないとき（周りに 6 枚以上の四角が接する）は、周りでいちばん使われていない色にする
 */
export function assignColors(rects: Rect[]): number[] {
  const colors: number[] = [];
  rects.forEach((r, i) => {
    const used = new Array<number>(COLOR_COUNT).fill(0);
    for (let j = 0; j < i; j++) if (rectsTouch(r, rects[j])) used[colors[j]]++;
    let pick = used.indexOf(0);
    if (pick < 0) pick = used.indexOf(Math.min(...used));
    colors.push(pick);
  });
  return colors;
}

/** 読み上げ・案内の「3 行 2 列」 */
export function cellLabel(cell: number, size: number): string {
  return `${rowOf(cell, size) + 1}行${colOf(cell, size) + 1}列`;
}

/** 「3行2列から4行4列に2×3の四角を引きました」の「2×3」（横×縦） */
export function rectShape(r: Rect): string {
  return `${rectWidth(r)}×${rectHeight(r)}`;
}

// ---- 途中経過の保存（今日の1問と各段階の「いまの盤」） ----

/** 保存の置き場所。**答えは保存しない**（盤は日付か種から作り直す） */
export const PROGRESS_KEY = 'hasokon-games:shikaku-wake:progress:v1';

export interface SavedBoard {
  /** 今日の1問なら日付、練習なら種 */
  dateKey?: DateKey;
  seed?: number;
  rects: Rect[];
}

export type Progress = Partial<Record<Mode, SavedBoard>>;

function isRect(v: unknown): v is Rect {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return ['r0', 'c0', 'r1', 'c1'].every((k) => Number.isInteger(r[k]));
}

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
    if (!Array.isArray(s.rects) || !s.rects.every(isRect)) continue;
    const saved: SavedBoard = { rects: s.rects as Rect[] };
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

/** 保存してあった四角のうち、盤に収まり互いに重ならないものだけを戻す */
export function restoreRects(saved: Rect[], size: number): Rect[] {
  const out: Rect[] = [];
  for (const r of saved) {
    if (!inBounds(r, size)) continue;
    if (out.some((o) => rectsOverlap(o, r))) continue;
    out.push({ r0: r.r0, c0: r.c0, r1: r.r1, c1: r.c1 });
  }
  return out;
}

// ---- 記録 ----

/**
 * クリアしたときに `lib/records.ts` へ渡す結果。
 *
 * **`moves`（手数）は渡さない**。引いた四角の数はクリア時に必ず数字の数と同じでベストの意味が無く、
 * 操作の総数は 2 点タップとなぞりで 1 手の重みが違い、仮置きして考える遊び方を罰するため。
 * ベストは時間と（今日の1問の）連続日数だけ
 */
export function clearResult(mode: Mode, timeMs: number, today: DateKey): PlayResult {
  return mode === 'daily' ? { outcome: 'win', timeMs, clearedOn: today } : { outcome: 'win', timeMs };
}

// ---- 共有 ----

/**
 * クリアの結果を共有する文面。**盤の区切り（答え）を入れない**。
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
      ? `四角わけパズル 今日の1問（${dateKey}・${size}×${size}）${time}`
      : `四角わけパズル ${MODES[mode].label}（${size}×${size}）${time}`;
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
