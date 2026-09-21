/**
 * 星置きパズル（スターバトル系）のロジック
 *
 * 仕様: docs/features/game-hoshioki-puzzle.md
 *
 * ## ルール
 *
 * - N×N の盤が N 個の連結した領域に分かれている
 * - 各行・各列・各領域に星をちょうど1つ置く
 * - 星どうしは**斜めを含めて隣接しない**
 * - 解は1通り（生成時にソルバーで一意性を保証する）
 *
 * ## 生成の順番
 *
 * 1. 星の配置を決める（各行・各列に1つ・上下の行で列が2つ以上離れている）
 * 2. 星を種に領域を育てて、N 個の連結領域に分ける
 * 3. 総当たりのソルバーで解の個数を数え、**1通りでなければ 2 からやり直す**
 * 4. 「推論の段数」で難易度を測り、モードの範囲に入るまで 2〜3 を繰り返す
 *
 * **打ち切りは試行回数で決め、壁時計の時間では決めない。**
 * 時間で打ち切ると、同じ日付でも端末によって盤面が変わり、
 * 日替わりが「全員同じ問題」でなくなる。上限を超えたときは
 * **難易度の条件だけを緩め、一意解の条件は緩めない**。
 *
 * ## 乱数
 *
 * 乱数はすべて引数で受け取る（`lib/daily.ts` の `mulberry32`）。
 * このファイルから `Math.random()` を呼ばないこと。
 */

import { dailySeed, localDateKey, mulberry32, type DateKey } from './daily';

/** 乱数。`[0, 1)` を返す */
export type Rng = () => number;

/** マスの印。空 → ×（候補消し）→ ★ の順に切り替わる */
export const EMPTY = 0;
export const CROSS = 1;
export const STAR = 2;
export type Mark = typeof EMPTY | typeof CROSS | typeof STAR;

/** 盤面（出題）。星の位置（`solution`）は答えなので画面には出さない */
export interface Puzzle {
  /** 1辺のマス数 */
  size: number;
  /** 各マスの領域ID（0 以上 size 未満）。長さは size × size */
  regions: number[];
  /** 解（星のマスの添字。行の順に並ぶ）。一意であることは生成時に確かめている */
  solution: number[];
  /** 推論の段数から出した難易度の目安（大きいほど難しい） */
  score: number;
}

/** 難易度のモード。`daily` は「今日の1問」 */
export type Mode = 'easy' | 'normal' | 'hard' | 'daily';

/**
 * モードの設定。
 *
 * `minScore` / `maxScore` は「推論の段数」（`analyze` の `score`）の範囲。
 * **範囲に入らなくても一意解であれば出す**（`maxAttempts` を超えたとき）。
 */
export interface ModeDef {
  label: string;
  size: number;
  minScore: number;
  maxScore: number;
  /** 難易度の条件を満たすまで作り直す回数の上限（時間ではなく回数で打ち切る） */
  maxAttempts: number;
}

/**
 * しきい値は **`analyze` を直したあと（#242 のレビュー指摘）に測り直した値**。
 * 実測の分布（各サイズ 200面・9×9 は 40面。`generate` に難易度の条件を付けずに作った）：
 *
 * | | 最小 | p10 | p25 | p50 | p75 | p90 | 最大 |
 * |---|---|---|---|---|---|---|---|
 * | 5×5 | 3 | 10 | 13 | 16 | 18 | 19 | 24 |
 * | 7×7 | 2 | 10 | 15 | 19 | 23 | 26 | 31 |
 * | 9×9 | 9 | 14 | 20 | 24 | 27 | 30 | 46 |
 *
 * **点数はサイズをまたいで比べられない**（盤が大きいほど段数が増える）。
 * モードの差はまず大きさが作っていて、ここで削っているのは各サイズの両端だけ。
 * 狭くしすぎると作り直しの回数が増えるので、**採用率がおおむね半分以上**になる幅にしてある。
 */
export const MODES: Record<Mode, ModeDef> = {
  easy: { label: 'かんたん', size: 5, minScore: 0, maxScore: 15, maxAttempts: 30 },
  normal: { label: 'ふつう', size: 7, minScore: 10, maxScore: 26, maxAttempts: 30 },
  // 9×9 は大きさそのものが難しさなので、点数の下限だけを置いて上は開けてある
  // （上を締めると、条件に合う盤面が見つかるまで作り直し続けることになる）
  hard: { label: 'むずかしい', size: 9, minScore: 14, maxScore: Infinity, maxAttempts: 30 },
  daily: { label: '今日の1問', size: 7, minScore: 10, maxScore: 26, maxAttempts: 30 },
};

/** モードの並び順（画面のボタンもこの順に出す） */
export const MODE_ORDER: Mode[] = ['easy', 'normal', 'hard', 'daily'];

/**
 * 日替わりの生成手順の版。
 *
 * **生成の手順（星の置き方・領域の育て方・難易度の測り方）を変えたら上げる。**
 * 上げないと、同じ日付なのに盤面が変わり、
 * 「昨日の続き」で入った人に別の問題が出る。
 * 上げたときは記録側のキー（`DAILY_VARIANT`）も変える。
 */
export const DAILY_GENERATOR_VERSION = 1;

/** 記録の区分（`lib/records.ts` の variant）。難易度と日替わりをこれで分ける */
export const DAILY_VARIANT = `daily-v${DAILY_GENERATOR_VERSION}`;

/** 記録の区分名。日替わりだけ版を持つ（生成手順を変えたら記録も分ける） */
export function variantOf(mode: Mode): string {
  return mode === 'daily' ? DAILY_VARIANT : mode;
}

/** マスの添字から行・列 */
export function rowOf(index: number, size: number): number {
  return Math.floor(index / size);
}
export function colOf(index: number, size: number): number {
  return index % size;
}

/** 斜めを含めた周囲8マスの添字 */
export function neighborsOf(index: number, size: number): number[] {
  const r = rowOf(index, size);
  const c = colOf(index, size);
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      out.push(nr * size + nc);
    }
  }
  return out;
}

/** 上下左右のマスの添字（領域の連結はこの4方向で見る） */
export function orthogonalOf(index: number, size: number): number[] {
  const r = rowOf(index, size);
  const c = colOf(index, size);
  const out: number[] = [];
  if (r > 0) out.push(index - size);
  if (r < size - 1) out.push(index + size);
  if (c > 0) out.push(index - 1);
  if (c < size - 1) out.push(index + 1);
  return out;
}

/** 配列から1つ選ぶ（乱数は注入されたものだけを使う） */
function pick<T>(items: T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length) % items.length];
}

/** 0..n-1 をシャッフルした配列 */
function shuffledRange(n: number, rng: Rng): number[] {
  const out = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 星の配置を決める。
 *
 * 各行に1つ・各列に1つなので**列の並べ替え**になり、
 * 斜めの隣接を禁じる条件は「隣り合う行の列が2つ以上離れている」に落ちる
 * （2行以上離れた星は、どう置いても隣接しない）。
 *
 * 行ごとに候補をシャッフルしながら深さ優先で探す。
 * N ≥ 4 なら必ず見つかる（N ≤ 3 は条件を満たす並べ方が無く null を返す）。
 */
export function placeStars(size: number, rng: Rng): number[] | null {
  const cols: number[] = [];
  const used = new Array<boolean>(size).fill(false);

  const step = (row: number): boolean => {
    if (row === size) return true;
    for (const c of shuffledRange(size, rng)) {
      if (used[c]) continue;
      if (row > 0 && Math.abs(c - cols[row - 1]) <= 1) continue;
      used[c] = true;
      cols.push(c);
      if (step(row + 1)) return true;
      cols.pop();
      used[c] = false;
    }
    return false;
  };

  if (!step(0)) return null;
  return cols.map((c, r) => r * size + c);
}

/**
 * 星を種にして領域を育てる。
 *
 * **いちばん小さい領域から伸ばす**ので、大きさがだいたいそろう。
 * 上下左右にだけ伸ばすため、どの領域も連結になる。
 * 盤はつながっているので、空きマスが残っているかぎり
 * 「空きに隣接した領域」が必ず1つ以上ある（無限には回らない）。
 */
export function growRegions(size: number, stars: number[], rng: Rng): number[] {
  const total = size * size;
  const regions = new Array<number>(total).fill(-1);
  stars.forEach((index, id) => {
    regions[index] = id;
  });
  const counts = new Array<number>(size).fill(1);
  let remaining = total - stars.length;

  while (remaining > 0) {
    // 空きに隣接している領域のうち、いちばん小さいものを選ぶ
    let best: number[] = [];
    let bestCount = Infinity;
    for (let id = 0; id < size; id++) {
      if (counts[id] > bestCount) continue;
      const open = openCells(regions, id, size);
      if (open.length === 0) continue;
      if (counts[id] < bestCount) {
        bestCount = counts[id];
        best = [id];
      } else {
        best.push(id);
      }
    }
    const id = pick(best, rng);
    const open = openCells(regions, id, size);
    regions[pick(open, rng)] = id;
    counts[id]++;
    remaining--;
  }
  return regions;
}

/** その領域に隣接している空きマス（重複なし） */
function openCells(regions: number[], id: number, size: number): number[] {
  const out = new Set<number>();
  for (let i = 0; i < regions.length; i++) {
    if (regions[i] !== id) continue;
    for (const n of orthogonalOf(i, size)) {
      if (regions[n] === -1) out.add(n);
    }
  }
  return [...out];
}

/**
 * 解をすべて（`limit` 件まで）求める。
 *
 * 行ごとに星の列を選ぶ深さ優先探索。列・領域は使用済みを持ち、
 * 隣接は「1つ前の行の列」とだけ比べれば足りる
 * （2行以上離れた星は、どう置いても隣接しない）。
 * 星は N 個で領域も N 個なので、**領域の重複を禁じるだけで
 * 「各領域にちょうど1つ」が満たされる**。
 */
export function findSolutions(puzzleRegions: number[], size: number, limit = 2): number[][] {
  const usedCol = new Array<boolean>(size).fill(false);
  const usedRegion = new Array<boolean>(size).fill(false);
  const current: number[] = [];
  const found: number[][] = [];

  const step = (row: number, prevCol: number): void => {
    if (found.length >= limit) return;
    if (row === size) {
      found.push([...current]);
      return;
    }
    for (let c = 0; c < size; c++) {
      if (usedCol[c]) continue;
      if (prevCol >= 0 && Math.abs(c - prevCol) <= 1) continue;
      const region = puzzleRegions[row * size + c];
      if (usedRegion[region]) continue;
      usedCol[c] = true;
      usedRegion[region] = true;
      current.push(row * size + c);
      step(row + 1, c);
      current.pop();
      usedCol[c] = false;
      usedRegion[region] = false;
      if (found.length >= limit) return;
    }
  };

  step(0, -1);
  return found;
}

/** 解の個数（`limit` に達したら打ち切る） */
export function countSolutions(puzzleRegions: number[], size: number, limit = 2): number {
  return findSolutions(puzzleRegions, size, limit).length;
}

/** その領域のマス数 */
function regionSize(regions: number[], id: number): number {
  let n = 0;
  for (const v of regions) if (v === id) n++;
  return n;
}

/** その領域から1マス抜いても連結のままか */
function staysConnected(regions: number[], size: number, id: number, removed: number): boolean {
  const cells = new Set<number>();
  for (let i = 0; i < regions.length; i++) if (regions[i] === id && i !== removed) cells.add(i);
  if (cells.size === 0) return false;
  const start = [...cells][0];
  const seen = new Set<number>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const cell = queue.pop() as number;
    for (const n of orthogonalOf(cell, size)) {
      if (!cells.has(n) || seen.has(n)) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  return seen.size === cells.size;
}

/**
 * 領域の境目をずらして、**余分な解を1つずつ潰す**。
 *
 * でたらめに育てた領域が一意解になることはまず無い（7×7 で 300回試して 0件だった）。
 * そこで、別解 S2 を1つ見つけ、**S2 が星を置いているマスを隣の領域へ移す**。
 * すると S2 では移した先の領域に星が2つ、元の領域に星が0つになるので**S2 は解でなくなる**。
 * 用意した解 S1 の星は動かさないので、**S1 はそのまま解であり続ける**。
 *
 * 連結でなくなる移動はしない（領域は必ずひとつながり）。
 * 決まった回数で一意にならなければ諦めて null を返し、呼び手が育て直す。
 */
function refineToUnique(
  size: number,
  stars: number[],
  grown: number[],
  rng: Rng,
  maxSteps = 60,
): number[] | null {
  const regions = [...grown];
  const starSet = new Set(stars);

  for (let step = 0; step < maxSteps; step++) {
    const solutions = findSolutions(regions, size, 2);
    if (solutions.length === 1) return regions;
    // 用意した解があるので 0 にはならないが、念のため諦める
    if (solutions.length === 0) return null;

    const other = solutions.find((s) => s.some((cell) => !starSet.has(cell)));
    if (!other) return null;

    // 動かせる候補（別解の星のうち、用意した解の星ではないマス）
    const moves: { cell: number; to: number }[] = [];
    for (const cell of other) {
      if (starSet.has(cell)) continue;
      const from = regions[cell];
      if (regionSize(regions, from) < 2) continue;
      if (!staysConnected(regions, size, from, cell)) continue;
      for (const n of orthogonalOf(cell, size)) {
        if (regions[n] !== from) moves.push({ cell, to: regions[n] });
      }
    }
    if (moves.length === 0) return null;
    const move = pick(moves, rng);
    regions[move.cell] = move.to;
  }
  return null;
}

/** 推論のあと（難易度の目安） */
export interface Analysis {
  /** 推論だけで解き切れたか。false なら当てずっぽうが要る＝出題しない */
  solved: boolean;
  /** 推論を回した回数（段数） */
  rounds: number;
  /** 段ごとの使用回数。添字は `TECHNIQUES` の並び（重いものほど後ろ） */
  used: number[];
  /** 難易度の目安。段数に、重い推論のぶんを足したもの（大きいほど難しい） */
  score: number;
}

/**
 * 使う推論と、その重さ。
 *
 * 上から順に試し、**進んだ時点でその段を1回使ったと数える**。
 * 重いものほど人にとって見つけにくいので、難易度への効きも大きくしてある。
 */
const TECHNIQUES = [
  { name: '候補が1つ', weight: 0 },
  { name: '行・列と領域の1対1', weight: 2 },
  { name: '行・列と領域の複数対応', weight: 4 },
  { name: '置いたら詰む', weight: 8 },
] as const;

/** 推論の途中の状態。`candidate` は「まだ星を置ける可能性がある」マス */
interface Board {
  candidate: boolean[];
  placed: boolean[];
  stars: number;
}

function cloneBoard(board: Board): Board {
  return { candidate: [...board.candidate], placed: [...board.placed], stars: board.stars };
}

/** 単位（行・列・領域）ごとのマスの添字。推論はすべてこの単位の上で行う */
function unitsOf(puzzleRegions: number[], size: number): number[][] {
  const units: number[][] = [];
  for (let r = 0; r < size; r++) units.push(Array.from({ length: size }, (_, c) => r * size + c));
  for (let c = 0; c < size; c++) units.push(Array.from({ length: size }, (_, r) => r * size + c));
  for (let id = 0; id < size; id++) {
    units.push(puzzleRegions.map((v, i) => (v === id ? i : -1)).filter((i) => i >= 0));
  }
  return units;
}

/** そのマスに星を置いて、同じ行・列・領域と周囲8マスから候補を消す */
function placeStar(board: Board, puzzleRegions: number[], size: number, index: number): void {
  board.placed[index] = true;
  board.stars++;
  const row = rowOf(index, size);
  const col = colOf(index, size);
  const region = puzzleRegions[index];
  for (let i = 0; i < puzzleRegions.length; i++) {
    if (i === index) continue;
    if (rowOf(i, size) === row || colOf(i, size) === col || puzzleRegions[i] === region) {
      board.candidate[i] = false;
    }
  }
  for (const n of neighborsOf(index, size)) board.candidate[n] = false;
}

/** その単位の、まだ星を置いていない候補マス */
function openOf(board: Board, unit: number[]): number[] {
  return unit.filter((i) => board.candidate[i] && !board.placed[i]);
}

/**
 * 「候補が1つしかない単位に星を置く」を進めるだけ進める。
 *
 * 戻り値が `'contradiction'` なのは、星の無い単位の候補が尽きたとき
 * （その置き方はありえない）。
 */
function basicFill(
  board: Board,
  puzzleRegions: number[],
  size: number,
  units: number[][],
): { rounds: number; state: 'solved' | 'stuck' | 'contradiction' } {
  let rounds = 0;
  for (;;) {
    let progressed = false;
    for (const unit of units) {
      if (unit.some((i) => board.placed[i])) continue;
      const open = openOf(board, unit);
      if (open.length === 0) return { rounds, state: 'contradiction' };
      if (open.length === 1) {
        placeStar(board, puzzleRegions, size, open[0]);
        progressed = true;
      }
    }
    if (!progressed) return { rounds, state: board.stars === size ? 'solved' : 'stuck' };
    rounds++;
    if (board.stars === size) return { rounds, state: 'solved' };
  }
}

/** 渡した並びから k 個を選ぶ組み合わせをすべて作る（k は 3 までしか使わない） */
function combinations<T>(items: T[], k: number): T[][] {
  const out: T[][] = [];
  const build = (start: number, current: T[]) => {
    if (current.length === k) {
      out.push([...current]);
      return;
    }
    for (let i = start; i < items.length; i++) build(i + 1, [...current, items[i]]);
  };
  build(0, []);
  return out;
}

/**
 * 行・列と領域の対応から候補を削る。
 *
 * k 個の領域の候補がちょうど k 本の行に収まっていれば、
 * **その k 本の行の星はすべてその領域のどれか**なので、
 * 行に残った他の領域のマスは候補から消える（逆向きも同じ）。
 * k = 1 は「領域が1行に収まっている」場合で、人がいちばんよく使う形。
 *
 * **星が確定済みの単位は組に入れない。** 確定済みの領域は候補マスを1つも持たない
 * （`placeStar` が同じ領域の候補を落とす）ので、**行を1本も使わないのに k には数えられる**。
 * すると「k 本の行を k 個の領域が占める」が成り立っていないのに成立と見なし、
 * **真の解の星を候補から消してしまう**（#242 のレビュー指摘。5×5・7×7 で約11%の盤面が該当した）。
 * ここで弾いているのは、そのまま「まだ星を置いていない単位だけで数える」という意味。
 */
function eliminateByPairing(
  board: Board,
  puzzleRegions: number[],
  size: number,
  k: number,
): boolean {
  const open: number[] = [];
  for (let i = 0; i < puzzleRegions.length; i++) {
    if (board.candidate[i] && !board.placed[i]) open.push(i);
  }
  let changed = false;

  const drop = (cells: number[]) => {
    for (const i of cells) {
      if (!board.candidate[i] || board.placed[i]) continue;
      board.candidate[i] = false;
      changed = true;
    }
  };

  /** まだ星を置いていない（＝候補マスを持っている）領域だけ */
  const liveRegions = [...new Set(open.map((i) => puzzleRegions[i]))];

  for (const lineOf of [rowOf, colOf]) {
    /** まだ星を置いていない行（列）だけ */
    const liveLines = [...new Set(open.map((i) => lineOf(i, size)))];

    // 領域 → 行（列）の向き
    for (const ids of combinations(liveRegions, k)) {
      const cells = open.filter((i) => ids.includes(puzzleRegions[i]));
      const lines = new Set(cells.map((i) => lineOf(i, size)));
      if (lines.size !== k) continue;
      drop(open.filter((i) => lines.has(lineOf(i, size)) && !ids.includes(puzzleRegions[i])));
    }
    // 行（列）→ 領域の向き
    for (const lines of combinations(liveLines, k)) {
      const cells = open.filter((i) => lines.includes(lineOf(i, size)));
      const ids = new Set(cells.map((i) => puzzleRegions[i]));
      if (ids.size !== k) continue;
      drop(open.filter((i) => ids.has(puzzleRegions[i]) && !lines.includes(lineOf(i, size))));
    }
  }
  return changed;
}

/**
 * 「ここに置くと詰む」マスを候補から外す。
 *
 * 候補を1つ仮に星にして基本の推論だけ回し、
 * **星の無い単位の候補が尽きたら**その置き方はありえない。
 * 人も「ここに置くとこの領域が置けなくなる」と読むので、推論の一種として数える。
 */
function eliminateByContradiction(
  board: Board,
  puzzleRegions: number[],
  size: number,
  units: number[][],
): boolean {
  let changed = false;
  for (let i = 0; i < puzzleRegions.length; i++) {
    if (!board.candidate[i] || board.placed[i]) continue;
    const trial = cloneBoard(board);
    placeStar(trial, puzzleRegions, size, i);
    if (basicFill(trial, puzzleRegions, size, units).state === 'contradiction') {
      board.candidate[i] = false;
      changed = true;
    }
  }
  return changed;
}

/**
 * 人が解く手順をなぞって難易度を測る。
 *
 * 軽い推論から順に試し、進んだらまた軽いほうへ戻る（人もそう解く）。
 * どの推論でも進まなくなったら、そこから先は当てずっぽうなので
 * `solved: false` を返す。**そういう盤面は出題しない**。
 */
export function analyze(puzzleRegions: number[], size: number): Analysis {
  const total = size * size;
  const board: Board = {
    candidate: new Array<boolean>(total).fill(true),
    placed: new Array<boolean>(total).fill(false),
    stars: 0,
  };
  const units = unitsOf(puzzleRegions, size);
  const used = TECHNIQUES.map(() => 0);
  let rounds = 0;

  const result = (solved: boolean): Analysis => ({
    solved,
    rounds,
    used,
    score: rounds + used.reduce((sum, n, i) => sum + n * TECHNIQUES[i].weight, 0),
  });

  for (;;) {
    const basic = basicFill(board, puzzleRegions, size, units);
    rounds += basic.rounds;
    if (basic.state === 'solved') {
      used[0]++;
      return result(true);
    }
    if (basic.state === 'contradiction') return result(false);
    if (basic.rounds > 0) used[0]++;

    if (eliminateByPairing(board, puzzleRegions, size, 1)) {
      used[1]++;
      rounds++;
      continue;
    }
    if (
      eliminateByPairing(board, puzzleRegions, size, 2) ||
      eliminateByPairing(board, puzzleRegions, size, 3)
    ) {
      used[2]++;
      rounds++;
      continue;
    }
    if (eliminateByContradiction(board, puzzleRegions, size, units)) {
      used[3]++;
      rounds++;
      continue;
    }
    return result(false);
  }
}

/** 生成の結果。`relaxed` は「難易度の条件を緩めて返した」かどうか */
export interface Generated {
  puzzle: Puzzle;
  /** 実際に作り直した回数 */
  attempts: number;
  /** 難易度の範囲に入らないまま打ち切ったか（一意解であることは必ず満たす） */
  relaxed: boolean;
}

/**
 * 一意解の盤面を1つ作る。**一意になるまで作り直す**（ここは打ち切らない）。
 *
 * 育てた領域をそのまま使うのではなく、`refineToUnique` で別解を潰していく。
 * 潰し切れなければ育て直し、それでも駄目なら星の配置から作り直す。
 * 星の配置は N ≥ 4 で必ず存在するので、この関数が戻らないことはない。
 */
function uniqueBoard(size: number, rng: Rng): { regions: number[]; solution: number[] } {
  for (;;) {
    const stars = placeStars(size, rng);
    if (!stars) throw new Error(`星を置けない大きさです: ${size}（4以上にしてください）`);
    // 同じ星の配置のまま領域だけ育て直すほうが安いので、何度か試してから星に戻る
    for (let i = 0; i < 8; i++) {
      const grown = growRegions(size, stars, rng);
      const regions = refineToUnique(size, stars, grown, rng);
      if (regions) return { regions, solution: stars };
    }
  }
}

/**
 * 盤面を作る。
 *
 * **一意解は必ず満たす。** 難易度の範囲に入る盤面が `maxAttempts` 回で
 * 見つからなければ、**いちばん範囲に近かったものを返す**（`relaxed: true`）。
 * 壁時計で打ち切らないので、非力な端末でも同じ日付なら同じ盤面が出る。
 */
export function generate(
  size: number,
  rng: Rng,
  options: { minScore?: number; maxScore?: number; maxAttempts?: number } = {},
): Generated {
  const minScore = options.minScore ?? 0;
  const maxScore = options.maxScore ?? Infinity;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 40);

  let best: Puzzle | null = null;
  let bestRank = Infinity;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { regions, solution } = uniqueBoard(size, rng);
    const result = analyze(regions, size);
    const puzzle: Puzzle = { size, regions, solution, score: result.score };
    const gap =
      Math.max(0, minScore - result.score) + Math.max(0, result.score - maxScore);
    if (result.solved && gap === 0) return { puzzle, attempts: attempt, relaxed: false };
    // 推論だけで解けない盤面は当てずっぽうを強いるので、範囲外よりさらに後回しにする。
    // それでも控えとして取っておくのは、**必ず一意解の盤面を返すため**
    const rank = (result.solved ? 0 : 1000) + gap;
    if (rank < bestRank) {
      bestRank = rank;
      best = puzzle;
    }
  }

  // 控えが必ずある（ループは最低1回まわり、一意解の盤面を1つ作っている）
  return { puzzle: best as Puzzle, attempts: maxAttempts, relaxed: true };
}

/** モードの設定で盤面を作る */
export function generateFor(mode: Mode, rng: Rng): Generated {
  const def = MODES[mode];
  return generate(def.size, rng, {
    minScore: def.minScore,
    maxScore: def.maxScore,
    maxAttempts: def.maxAttempts,
  });
}

/**
 * 「今日の1問」。日付キーから決まるので、同じ日なら誰が開いても同じ盤面。
 *
 * 日付は端末のローカル日付（`localDateKey`）。連続日数の判定も同じ日付を使う。
 */
export function dailyPuzzle(key: DateKey = localDateKey()): Puzzle {
  const rng = mulberry32(dailySeed(key, DAILY_GENERATOR_VERSION));
  return generateFor('daily', rng).puzzle;
}

// ---- 遊ぶがわ（画面から使う純関数） ----

/** タップの状態遷移。空 → × → ★ → 空 */
export function cycleMark(mark: Mark): Mark {
  if (mark === EMPTY) return CROSS;
  if (mark === CROSS) return STAR;
  return EMPTY;
}

/** 空の盤（印なし） */
export function emptyMarks(size: number): Mark[] {
  return new Array<Mark>(size * size).fill(EMPTY);
}

/**
 * 星を置いたときに自動で × を入れるマス。
 *
 * 同じ行・列・領域と、周囲8マス。**すでに星が置いてあるマスは含めない**
 * （置いた星を自動で消してしまわないため。矛盾はそのまま赤く出す）。
 */
export function autoCrossTargets(puzzle: Puzzle, index: number, marks: Mark[]): number[] {
  const { size, regions } = puzzle;
  const row = rowOf(index, size);
  const col = colOf(index, size);
  const region = regions[index];
  const targets = new Set<number>();
  for (let i = 0; i < size * size; i++) {
    if (i === index) continue;
    if (rowOf(i, size) === row || colOf(i, size) === col || regions[i] === region) targets.add(i);
  }
  for (const n of neighborsOf(index, size)) targets.add(n);
  return [...targets].filter((i) => marks[i] === EMPTY);
}

/**
 * 矛盾しているマス（同じ行・列・領域に2つ、または隣接している星）。
 *
 * **答えは教えない。** 「置いた星が正解と違う」ことは伝えず、
 * ルールに反している置き方だけを赤くする。
 */
export function findConflicts(puzzle: Puzzle, marks: Mark[]): Set<number> {
  const { size, regions } = puzzle;
  const stars: number[] = [];
  for (let i = 0; i < marks.length; i++) if (marks[i] === STAR) stars.push(i);

  const conflicts = new Set<number>();
  const flagDuplicates = (keyOf: (index: number) => number) => {
    const groups = new Map<number, number[]>();
    for (const i of stars) {
      const key = keyOf(i);
      groups.set(key, [...(groups.get(key) ?? []), i]);
    }
    for (const group of groups.values()) {
      if (group.length > 1) for (const i of group) conflicts.add(i);
    }
  };
  flagDuplicates((i) => rowOf(i, size));
  flagDuplicates((i) => colOf(i, size));
  flagDuplicates((i) => regions[i]);

  const starSet = new Set(stars);
  for (const i of stars) {
    for (const n of neighborsOf(i, size)) {
      if (starSet.has(n)) {
        conflicts.add(i);
        conflicts.add(n);
      }
    }
  }
  return conflicts;
}

/**
 * 解けているか。
 *
 * 解は1通りなので「星が N 個あって矛盾が無い」＝正解。
 * `solution` と突き合わせないのは、突き合わせると
 * 答えを画面側に持ち出すことになるため（そのぶん漏れやすい）。
 */
export function isSolved(puzzle: Puzzle, marks: Mark[]): boolean {
  let stars = 0;
  for (const mark of marks) if (mark === STAR) stars++;
  if (stars !== puzzle.size) return false;
  return findConflicts(puzzle, marks).size === 0;
}

/** 置いた星の数（画面の「残り」表示に使う） */
export function starCount(marks: Mark[]): number {
  let n = 0;
  for (const mark of marks) if (mark === STAR) n++;
  return n;
}

/**
 * 領域の境界に太線を引くかどうか（上・右・下・左）。
 *
 * 盤の外周と、隣が別の領域になる辺が太線。
 * **色分けだけに頼らない**（色覚に配慮して、線でも領域を区別できるようにする）。
 */
export function borderOf(
  puzzle: Puzzle,
  index: number,
): { top: boolean; right: boolean; bottom: boolean; left: boolean } {
  const { size, regions } = puzzle;
  const r = rowOf(index, size);
  const c = colOf(index, size);
  const id = regions[index];
  return {
    top: r === 0 || regions[index - size] !== id,
    right: c === size - 1 || regions[index + 1] !== id,
    bottom: r === size - 1 || regions[index + size] !== id,
    left: c === 0 || regions[index - 1] !== id,
  };
}

/**
 * クリアの結果を共有する文面。
 *
 * **答えを入れない。** 星の位置が分かる絵文字の盤面を貼ると、
 * 日替わりの答えをそのまま配ることになる。入れるのは
 * 日付・サイズ・かかった時間・連続日数だけ。
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
      ? `星置きパズル ${dateKey} の1問（${size}×${size}）`
      : `星置きパズル ${MODES[mode].label}（${size}×${size}）`;
  const lines = [head, `クリア ${time}`];
  if (mode === 'daily' && streak && streak > 1) lines.push(`連続 ${streak}日`);
  lines.push(url);
  return lines.join('\n');
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
