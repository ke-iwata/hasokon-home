/**
 * ノノグラム（数字から絵を描くパズル）のロジック
 *
 * 盤面は長さ size*size の配列で持つ（index = row * size + col）。
 * 状態は EMPTY（未確定）/ FILLED（塗り）/ MARKED（×印）の3つ。
 *
 * 出題は乱数生成ではなく `lib/nonogram/puzzles.json` に手で描いた絵を持つ。
 * ランダムな塗りつぶしからヒントを作ると「解けるが絵にならない」ため、
 * このパズルの価値（解けたら絵が出る）が消えるという判断（docs/features/game-nonogram.md）。
 *
 * 出題データが唯一解であることは `countSolutions()` で検証する。
 * ナンプレ（lib/nanpre.ts）と同じ約束で、唯一解でない問題は
 * 「論理だけでは解けない」＝当てずっぽうを強いる悪問になるため出さない。
 * 全問の検証は tests/nonogram.test.ts が行うので、
 * puzzles.json に問題を足すだけで検証も一覧も出題も付いてくる。
 *
 * ※「ピクロス」（任天堂）「お絵かきロジック」（世界文化社）などは登録商標のため使わない。
 *   一般名称の「ノノグラム」で統一すること。
 */

import puzzlesJson from './nonogram/puzzles.json';

/** マスの状態 */
export const EMPTY = 0;
export const FILLED = 1;
export const MARKED = 2;
export type Cell = typeof EMPTY | typeof FILLED | typeof MARKED;

export type Board = Cell[];

/** 難易度。盤面サイズだけが変わる（20×20以上はモバイルで押し分けられないので作らない） */
export const LEVELS = {
  easy: { label: 'かんたん', size: 5 },
  normal: { label: 'ふつう', size: 10 },
  hard: { label: 'むずかしい', size: 15 },
} as const;

export type Level = keyof typeof LEVELS;

export const LEVEL_ORDER: Level[] = ['easy', 'normal', 'hard'];

export interface Puzzle {
  /** 一意なID。localStorage の「解いた問題」の記録に使う */
  id: string;
  /** 盤面の一辺（正方形のみ） */
  size: number;
  /** 完成する絵の名前。クリアするまでは伏せる */
  title: string;
  level: Level;
  /** 各行を '0'（空白）と '1'（塗り）で表し、行を空白区切りで並べたもの */
  cells: string;
}

/** 行・列ごとのヒント（連続して塗るマスの数） */
export interface Hints {
  rows: number[][];
  cols: number[][];
}

/** 乱数。テストで結果を固定できるよう、関数を差し替えられる形にしている */
export type Rng = () => number;

/** 出題データ。JSON に1件足せば一覧・出題・テストのすべてに載る */
export const PUZZLES: Puzzle[] = puzzlesJson as Puzzle[];

/**
 * `cells` 文字列を 0/1 の配列に開く。
 * 壊れたデータを黙って通すと「解けない問題」になるため、形の不正はここで落とす。
 */
export function parseCells(cells: string, size: number): number[] {
  const rows = cells.trim().split(/\s+/);
  if (rows.length !== size) {
    throw new Error(`行数が size と合わない: ${rows.length} !== ${size}`);
  }
  const out: number[] = [];
  for (const row of rows) {
    if (row.length !== size) throw new Error(`行の長さが size と合わない: "${row}"`);
    for (const ch of row) {
      if (ch !== '0' && ch !== '1') throw new Error(`0 と 1 以外が入っている: "${row}"`);
      out.push(ch === '1' ? 1 : 0);
    }
  }
  return out;
}

/**
 * 1本の線（0/1の並び）から連続する塗りの数を取り出す。
 * 塗りが1つもない線は `[0]` を返す（表示もヒントの比較も「0」で統一するため）。
 */
export function runsOf(line: readonly number[]): number[] {
  const runs: number[] = [];
  let run = 0;
  for (const v of line) {
    if (v === 1) {
      run += 1;
    } else if (run > 0) {
      runs.push(run);
      run = 0;
    }
  }
  if (run > 0) runs.push(run);
  return runs.length > 0 ? runs : [0];
}

/** 完成図（0/1の配列）から行・列のヒントを導く */
export function deriveHints(solution: readonly number[], size: number): Hints {
  const rows: number[][] = [];
  const cols: number[][] = [];
  for (let r = 0; r < size; r += 1) {
    rows.push(runsOf(solution.slice(r * size, r * size + size)));
  }
  for (let c = 0; c < size; c += 1) {
    const line: number[] = [];
    for (let r = 0; r < size; r += 1) line.push(solution[r * size + c]);
    cols.push(runsOf(line));
  }
  return { rows, cols };
}

/** ヒントが「塗りなし」を表すか（`[0]` と `[]` の両方を許す） */
function isEmptyHint(hints: readonly number[]): boolean {
  return hints.length === 0 || (hints.length === 1 && hints[0] === 0);
}

/**
 * ヒントを満たす1本の線の並べ方をすべて列挙する（ビットマスク。bit i = i番目のマス）。
 *
 * 幅15で最も多い場合でも500通り弱なので、全列挙して構わない。
 */
export function linePatterns(hints: readonly number[], width: number): number[] {
  if (isEmptyHint(hints)) return [0];
  const out: number[] = [];
  // idx番目のブロックを start 以降に置く。
  // 残りのブロックとその間の空白のぶんだけ末尾を空けておく必要がある
  const rest: number[] = new Array(hints.length).fill(0);
  for (let i = hints.length - 1; i >= 0; i -= 1) {
    rest[i] = hints[i] + (i + 1 < hints.length ? rest[i + 1] + 1 : 0);
  }
  const place = (idx: number, start: number, mask: number) => {
    if (idx === hints.length) {
      out.push(mask);
      return;
    }
    const last = width - rest[idx];
    for (let pos = start; pos <= last; pos += 1) {
      let m = mask;
      for (let k = 0; k < hints[idx]; k += 1) m |= 1 << (pos + k);
      place(idx + 1, pos + hints[idx] + 1, m);
    }
  };
  place(0, 0, 0);
  return out;
}

/**
 * 候補の並べ方すべてに共通するビット。
 * `one` は全候補で塗り、`zero` は全候補で空白のマス（＝その線だけで確定するマス）。
 */
function agreed(patterns: readonly number[], width: number): { one: number; zero: number } {
  let and = -1;
  let or = 0;
  for (const p of patterns) {
    and &= p;
    or |= p;
  }
  const mask = (1 << width) - 1;
  return { one: and & mask, zero: ~or & mask };
}

/**
 * ヒントを満たす盤面が何通りあるかを数える（最大 limit まで）。
 *
 * 唯一解の判定には「2通り以上あるか」さえ分かればよいので、
 * ナンプレの `countSolutions()` と同じく limit=2 で打ち切る。
 *
 * 行と列それぞれの「並べ方の候補」を持ち、
 *   1. 片側で確定したマスを使ってもう片側の候補を削る（人間が解くときの線ごとの推理と同じ）
 *   2. これ以上削れなくなったら、候補が最も少ない行で場合分けする
 * を繰り返す。1だけで解けてしまう問題が大半なので、15×15でも数msで終わる。
 */
export function countSolutions(hints: Hints, size: number, limit = 2): number {
  // 行と列で塗るマスの総数が食い違っていれば、その時点で解なし
  const sum = (hs: number[][]) => hs.reduce((a, h) => a + h.reduce((x, y) => x + y, 0), 0);
  if (sum(hints.rows) !== sum(hints.cols)) return 0;

  let count = 0;

  /** 確定したマスを行と列の間で伝播させ、候補を削れるだけ削る。矛盾したら false */
  const narrow = (rows: number[][], cols: number[][]): boolean => {
    for (let changed = true; changed; ) {
      changed = false;
      // from 側で確定したマスを使って to 側の候補を削る。
      // 行→列と列→行はビットの向きが入れ替わるだけなので、同じ処理を2回使う
      const push = (from: number[][], to: number[][]): boolean => {
        for (let i = 0; i < size; i += 1) {
          const { one, zero } = agreed(from[i], size);
          for (let j = 0; j < size; j += 1) {
            const bit = (one >> j) & 1 ? 1 : (zero >> j) & 1 ? 0 : -1;
            if (bit < 0) continue;
            const before = to[j].length;
            to[j] = to[j].filter((m) => ((m >> i) & 1) === bit);
            if (to[j].length === 0) return false;
            if (to[j].length !== before) changed = true;
          }
        }
        return true;
      };
      if (!push(rows, cols) || !push(cols, rows)) return false;
    }
    return true;
  };

  /** @returns limit に達したら true（呼び出し側は探索を打ち切る） */
  const solve = (rows: number[][], cols: number[][]): boolean => {
    if (!narrow(rows, cols)) return false;
    // 候補が2通り以上ある行のうち、いちばん少ないものを場合分けの対象にする
    let target = -1;
    let min = Infinity;
    for (let r = 0; r < size; r += 1) {
      if (rows[r].length > 1 && rows[r].length < min) {
        min = rows[r].length;
        target = r;
      }
    }
    if (target === -1) {
      // 全行が1通りに定まった。列と矛盾しないことは narrow が保証している
      count += 1;
      return count >= limit;
    }
    for (const pattern of rows[target]) {
      const nextRows = rows.map((a) => [...a]);
      nextRows[target] = [pattern];
      if (solve(nextRows, cols.map((a) => [...a]))) return true;
    }
    return false;
  };

  solve(
    hints.rows.map((h) => linePatterns(h, size)),
    hints.cols.map((h) => linePatterns(h, size)),
  );
  return count;
}

/** 出題データを検証して、完成図とヒントを返す。壊れていれば例外 */
export function loadPuzzle(puzzle: Puzzle): { solution: number[]; hints: Hints } {
  if (LEVELS[puzzle.level].size !== puzzle.size) {
    throw new Error(`level と size が合わない: ${puzzle.id}`);
  }
  const solution = parseCells(puzzle.cells, puzzle.size);
  return { solution, hints: deriveHints(solution, puzzle.size) };
}

/** 空の盤面 */
export function emptyBoard(size: number): Board {
  return new Array(size * size).fill(EMPTY);
}

/**
 * 完成しているか。
 * ×印と未確定はどちらも「塗っていない」として扱う（×は補助でしかない）。
 */
export function isSolved(board: readonly Cell[], solution: readonly number[]): boolean {
  if (board.length !== solution.length) return false;
  for (let i = 0; i < board.length; i += 1) {
    if ((board[i] === FILLED ? 1 : 0) !== solution[i]) return false;
  }
  return true;
}

/** 盤面の1本の線を 0/1 で取り出す（塗り = 1、×印と未確定 = 0） */
function lineOf(board: readonly Cell[], size: number, index: number, vertical: boolean): number[] {
  const line: number[] = [];
  for (let i = 0; i < size; i += 1) {
    const cell = vertical ? board[i * size + index] : board[index * size + i];
    line.push(cell === FILLED ? 1 : 0);
  }
  return line;
}

/**
 * ヒントを満たし終えた行・列。
 * 満たした側の数字を薄くして、どこまで進んだかを一目で分かるようにする。
 */
export function satisfiedLines(
  board: readonly Cell[],
  hints: Hints,
  size: number,
): { rows: boolean[]; cols: boolean[] } {
  const same = (a: readonly number[], b: readonly number[]) =>
    a.length === b.length && a.every((v, i) => v === b[i]);
  return {
    rows: hints.rows.map((h, r) => same(runsOf(lineOf(board, size, r, false)), h)),
    cols: hints.cols.map((h, c) => same(runsOf(lineOf(board, size, c, true)), h)),
  };
}

/**
 * なぞった範囲のマス。
 *
 * 斜めに指がぶれても行がずれないよう、動きの大きいほうの向きに一直線で固定する。
 */
export function cellsBetween(from: number, to: number, size: number): number[] {
  const r0 = Math.floor(from / size);
  const c0 = from % size;
  const r1 = Math.floor(to / size);
  const c1 = to % size;
  const out: number[] = [];
  if (Math.abs(r1 - r0) > Math.abs(c1 - c0)) {
    const step = r1 > r0 ? 1 : -1;
    for (let r = r0; r !== r1 + step; r += step) out.push(r * size + c0);
  } else {
    const step = c1 > c0 ? 1 : -1;
    for (let c = c0; c !== c1 + step; c += step) out.push(r0 * size + c);
  }
  return out;
}

/** 指定したマスをまとめて同じ状態にそろえた、新しい盤面を返す */
export function paint(board: readonly Cell[], indices: readonly number[], value: Cell): Board {
  const next = [...board] as Board;
  for (const i of indices) next[i] = value;
  return next;
}

/**
 * そのマスを押したときの次の状態。
 * 塗りモードなら 塗り⇄未確定、×モードなら ×⇄未確定 を往復する。
 */
export function nextCell(current: Cell, mode: 'fill' | 'mark'): Cell {
  const target: Cell = mode === 'fill' ? FILLED : MARKED;
  return current === target ? EMPTY : target;
}

/** 未解答の問題（すべて解き終えていたら、その難易度の全問を返す） */
export function unsolved(puzzles: readonly Puzzle[], level: Level, solved: readonly string[]): Puzzle[] {
  const all = puzzles.filter((p) => p.level === level);
  const rest = all.filter((p) => !solved.includes(p.id));
  return rest.length > 0 ? rest : all;
}

/**
 * 次に出す問題を選ぶ。
 * 一度解いた問題は絵を覚えてしまうので、解き切るまでは同じ問題に当たらない。
 *
 * @param exclude いま表示している問題のID（「次の問題」で同じ問題を引かないため）
 */
export function pickPuzzle(
  puzzles: readonly Puzzle[],
  level: Level,
  solved: readonly string[],
  rng: Rng = Math.random,
  exclude?: string,
): Puzzle | null {
  const candidates = unsolved(puzzles, level, solved);
  if (candidates.length === 0) return null;
  const pool = candidates.length > 1 ? candidates.filter((p) => p.id !== exclude) : candidates;
  return pool[Math.floor(rng() * pool.length)];
}
