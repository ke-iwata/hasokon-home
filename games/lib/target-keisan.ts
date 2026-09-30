/**
 * ターゲット計算パズル（6 つの数と四則演算で目標の数をつくる）のロジック
 *
 * 仕様: docs/features/game-target-keisan.md
 *
 * ## ルール
 *
 * - 6 つの数（小さい数 1〜10 から 4 つ、大きい数 25・50・75・100 から 2 つ）と、目標の数（101〜999）が出る
 * - 数を 2 つ選んで `＋ − × ÷` でつなぐと、2 つが消えて結果が 1 つ残る。
 *   **途中の結果は正の整数だけ**（引いて 0 以下・割り切れない割り算は弾く）
 * - 各数は 1 回しか使えない。全部使う必要は無い
 * - 目標ぴったりでクリア。ぴったりにならなければ「これで答える」で、盤面にある数のうち
 *   目標にいちばん近いものを答えにして、差で ★ をつける
 *
 * ## 生成
 *
 * 到達できる値を**部分集合 DP**で求める（`solve`）。部分集合 S の数を全部使ってできる値の集合を
 * S ごとに持ち、互いに素な 2 つの部分集合の値どうしを 4 演算で結んで併合する。
 * S の数を全部使った値の手数は常に |S|−1 なので、**値を含む最小の部分集合の大きさ − 1 が最小手数**。
 * 目標は到達できると確かめた値からしか引かない（「作れない」問題は出ない）。
 *
 * ## 乱数
 *
 * 乱数はすべて引数で受け取る（`lib/daily.ts` の `mulberry32`）。
 * このファイルから `Math.random()` を呼ばないこと。
 */

import { dailySeed, localDateKey, mulberry32, type DateKey } from './daily';

/** 乱数。`[0, 1)` を返す */
export type Rng = () => number;

export type Op = '+' | '-' | '*' | '/';

export const OPS: readonly Op[] = ['+', '-', '*', '/'];

/** 画面に出す演算の記号 */
export const OP_LABEL: Record<Op, string> = { '+': '＋', '-': '−', '*': '×', '/': '÷' };

/** 小さい数の山（1〜10 が各 2 枚）。原型と同じく、同じ数が 2 つ出ることがある */
export const SMALL_DECK: readonly number[] = Array.from({ length: 20 }, (_, i) => (i % 10) + 1);

/** 大きい数（重複なしで 2 つ引く） */
export const LARGE_NUMBERS: readonly number[] = [25, 50, 75, 100];

export const SMALL_COUNT = 4;
export const LARGE_COUNT = 2;

/** 目標の範囲 */
export const TARGET_MIN = 101;
export const TARGET_MAX = 999;

/**
 * 途中の値の上限。これを超える値は捨てる（DP の値の数を抑えるため）。
 * 作れると確かめた目標しか出さないので、打ち切っても作れない目標は出ない
 * （難易度の判定がわずかに厳しくなるだけ）
 */
export const VALUE_LIMIT = 100_000;

export type Difficulty = 'easy' | 'normal' | 'hard';

/** 難易度のモード。`daily` は「今日の 3 問」 */
export type Mode = Difficulty | 'daily';

export interface DifficultyDef {
  label: string;
  /** 最小手数の範囲（両端を含む） */
  minSteps: number;
  maxSteps: number;
}

/** 仕様書「生成」の 3. のとおり */
export const DIFFICULTIES: Record<Difficulty, DifficultyDef> = {
  easy: { label: 'やさしい', minSteps: 1, maxSteps: 2 },
  normal: { label: 'ふつう', minSteps: 3, maxSteps: 3 },
  hard: { label: 'むずかしい', minSteps: 4, maxSteps: 5 },
};

export const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'normal', 'hard'];

export const MODE_LABEL: Record<Mode, string> = {
  easy: DIFFICULTIES.easy.label,
  normal: DIFFICULTIES.normal.label,
  hard: DIFFICULTIES.hard.label,
  daily: '今日の3問',
};

/** モードの並び順（画面のボタンもこの順に出す） */
export const MODE_ORDER: Mode[] = ['daily', 'easy', 'normal', 'hard'];

/**
 * 日替わりの生成手順の版。
 *
 * **生成の手順（数の引き方・DP・目標の選び方）を変えたら上げる。**
 * シードは日付と版から作るので、上げると当日の問題も変わる。
 * そのため記録の区分（`DAILY_VARIANT`）も版つきにして一緒に変わるようにする（数字つなぎと同じ形）。
 */
export const DAILY_GENERATOR_VERSION = 1;

/** 記録の区分（`lib/records.ts` の variant） */
export const DAILY_VARIANT = `daily-v${DAILY_GENERATOR_VERSION}`;

/** 記録の区分名。日替わりだけ版を持つ */
export function variantOf(mode: Mode): string {
  return mode === 'daily' ? DAILY_VARIANT : mode;
}

// ---- 計算 ----

/**
 * `a op b` を計算する。**正の整数にならなければ null**（弾く）。
 * 並び順は選んだ順（`3 − 5` は 0 以下なので弾く。入れ替えはしない）。
 */
export function applyOp(a: number, op: Op, b: number): number | null {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b > 0 ? a - b : null;
    case '*':
      return a * b;
    case '/':
      return b !== 0 && a % b === 0 ? a / b : null;
  }
}

/** 弾いた理由（画面の案内の 1 行） */
export function invalidReason(a: number, op: Op, b: number): string | null {
  if (applyOp(a, op, b) !== null) return null;
  if (op === '-') return '引き算は答えが1以上のときだけ';
  return '割り算は割り切れるときだけ';
}

// ---- 数の抽選 ----

/** 配列から重複なしで `count` 個を引く（元の配列は変えない） */
function drawFrom(pool: readonly number[], count: number, rng: Rng): number[] {
  const rest = [...pool];
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const k = Math.floor(rng() * rest.length);
    out.push(rest[k]);
    rest.splice(k, 1);
  }
  return out;
}

/** 6 つの数を引く。小さい数 4 つ（昇順）→ 大きい数 2 つ（昇順）の並び */
export function drawNumbers(rng: Rng): number[] {
  const small = drawFrom(SMALL_DECK, SMALL_COUNT, rng).sort((a, b) => a - b);
  const large = drawFrom(LARGE_NUMBERS, LARGE_COUNT, rng).sort((a, b) => a - b);
  return [...small, ...large];
}

// ---- 部分集合 DP ----

export interface Solved {
  numbers: number[];
  /** `reach[mask]` ＝ mask の数を**全部**使ってできる値 */
  reach: Set<number>[];
  /** 到達できる値 → 最小手数 */
  minSteps: Map<number, number>;
}

function popcount(n: number): number {
  let c = 0;
  for (let x = n; x; x &= x - 1) c++;
  return c;
}

/** 部分集合 DP。`limit` を超える値は捨てる */
export function solve(numbers: readonly number[], limit = VALUE_LIMIT): Solved {
  const n = numbers.length;
  const full = (1 << n) - 1;
  const reach: Set<number>[] = Array.from({ length: full + 1 }, () => new Set<number>());
  // 小さい部分集合から順に埋める（mask の昇順なら部分集合は必ず先に埋まっている）
  for (let mask = 1; mask <= full; mask++) {
    if (popcount(mask) === 1) {
      const v = numbers[Math.log2(mask)];
      if (v <= limit) reach[mask].add(v);
      continue;
    }
    const out = reach[mask];
    // 分割 {sub, rest} は片方の向きだけ見る（引き算・割り算は両向きを試す）
    const low = mask & -mask;
    for (let sub = (mask - 1) & mask; sub > 0; sub = (sub - 1) & mask) {
      if (!(sub & low)) continue;
      const rest = mask ^ sub;
      if (rest === 0) continue;
      const A = reach[sub];
      const B = reach[rest];
      for (const a of A) {
        for (const b of B) {
          const s = a + b;
          if (s <= limit) out.add(s);
          const p = a * b;
          if (p <= limit) out.add(p);
          if (a > b) out.add(a - b);
          else if (b > a) out.add(b - a);
          if (a % b === 0) out.add(a / b);
          if (b % a === 0) out.add(b / a);
        }
      }
    }
  }
  // 最小手数：値を含む最小の部分集合の大きさ − 1
  const masks = Array.from({ length: full }, (_, i) => i + 1).sort((x, y) => popcount(x) - popcount(y));
  const minSteps = new Map<number, number>();
  for (const mask of masks) {
    const steps = popcount(mask) - 1;
    for (const v of reach[mask]) if (!minSteps.has(v)) minSteps.set(v, steps);
  }
  return { numbers: [...numbers], reach, minSteps };
}

/** 解答例の 1 手 */
export interface SolutionStep {
  a: number;
  op: Op;
  b: number;
  result: number;
}

/**
 * `target` の作り方を 1 つ復元する（最小手数のもの）。作れなければ null。
 *
 * DP は経路を持たないので、最小の部分集合から「2 つに割って、両側で作れる値の組」を探し直す。
 */
export function solutionFor(solved: Solved, target: number): SolutionStep[] | null {
  const steps = solved.minSteps.get(target);
  if (steps === undefined) return null;
  const full = solved.reach.length - 1;
  for (let mask = 1; mask <= full; mask++) {
    if (popcount(mask) === steps + 1 && solved.reach[mask].has(target)) {
      return build(solved, mask, target);
    }
  }
  return null;
}

function build(solved: Solved, mask: number, target: number): SolutionStep[] {
  if (popcount(mask) === 1) return [];
  const { reach } = solved;
  const low = mask & -mask;
  for (let sub = (mask - 1) & mask; sub > 0; sub = (sub - 1) & mask) {
    if (!(sub & low)) continue;
    const rest = mask ^ sub;
    for (const a of reach[sub]) {
      for (const b of reach[rest]) {
        // 大きいほうを左に置く（引き算・割り算を正の整数で書くため）
        const [x, y, xm, ym] = a >= b ? [a, b, sub, rest] : [b, a, rest, sub];
        for (const op of OPS) {
          if (applyOp(x, op, y) === target) {
            return [...build(solved, xm, x), ...build(solved, ym, y), { a: x, op, b: y, result: target }];
          }
        }
      }
    }
  }
  // reach[mask] に target があるなら、どこかの分割で必ず見つかる
  throw new Error(`解答例を復元できません: ${target}`);
}

/** 解答例の 1 手を式にする（`100 ＋ 25 ＝ 125`） */
export function formatStep(step: SolutionStep): string {
  return `${step.a} ${OP_LABEL[step.op]} ${step.b} ＝ ${step.result}`;
}

// ---- 生成 ----

export interface Puzzle {
  numbers: number[];
  target: number;
  difficulty: Difficulty;
  /** 目標の最小手数 */
  minSteps: number;
  /** 解答例（最小手数）。答えたあとにだけ出す */
  solution: SolutionStep[];
}

/** 数を引き直す回数の上限（時間ではなく回数で打ち切る。日替わりが端末で変わらないように） */
export const MAX_ATTEMPTS = 40;

/** その数で、難易度に合う目標の候補（昇順） */
export function targetsFor(solved: Solved, difficulty: Difficulty): number[] {
  const { minSteps, maxSteps } = DIFFICULTIES[difficulty];
  const out: number[] = [];
  for (let t = TARGET_MIN; t <= TARGET_MAX; t++) {
    const s = solved.minSteps.get(t);
    if (s !== undefined && s >= minSteps && s <= maxSteps) out.push(t);
  }
  return out;
}

/** 1 問を作る */
export function generate(difficulty: Difficulty, rng: Rng): Puzzle {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const numbers = drawNumbers(rng);
    const solved = solve(numbers);
    const candidates = targetsFor(solved, difficulty);
    if (candidates.length === 0) continue;
    const target = candidates[Math.floor(rng() * candidates.length)];
    const solution = solutionFor(solved, target) as SolutionStep[];
    return { numbers, target, difficulty, minSteps: solution.length, solution };
  }
  // ここまで来ることは実質ない（どの難易度もほぼ毎回候補がある）。固定の問題で返す
  const numbers = [1, 2, 3, 4, 25, 100];
  const solved = solve(numbers);
  const target = targetsFor(solved, difficulty)[0];
  const solution = solutionFor(solved, target) as SolutionStep[];
  return { numbers, target, difficulty, minSteps: solution.length, solution };
}

/** 今日の 3 問（やさしい・ふつう・むずかしい）。3 問は**それぞれ別の 6 つの数**を引く */
export function dailyPuzzles(key: DateKey = localDateKey()): Puzzle[] {
  const rng = mulberry32(dailySeed(key, DAILY_GENERATOR_VERSION));
  return DIFFICULTY_ORDER.map((d) => generate(d, rng));
}

// ---- 盤面の操作 ----

/** 盤のタイル。計算で消えた場所は null（枠は残して盤を動かさない） */
export type Slot = number | null;

/** 式の履歴の 1 行 */
export type Move = SolutionStep;

export interface Board {
  slots: Slot[];
  moves: Move[];
}

export function initialBoard(numbers: readonly number[]): Board {
  return { slots: [...numbers], moves: [] };
}

/**
 * タイル `i` と `j` を `op` でつなぐ。結果は `j` の場所に残り、`i` は空く。
 * 弾くときは null。
 */
export function combine(board: Board, i: number, op: Op, j: number): Board | null {
  if (i === j) return null;
  const a = board.slots[i];
  const b = board.slots[j];
  if (a == null || b == null) return null;
  const result = applyOp(a, op, b);
  if (result === null) return null;
  const slots = [...board.slots];
  slots[i] = null;
  slots[j] = result;
  return { slots, moves: [...board.moves, { a, op, b, result }] };
}

export function values(board: Board): number[] {
  return board.slots.filter((v): v is number => v !== null);
}

export function isExact(board: Board, target: number): boolean {
  return values(board).includes(target);
}

/** 盤面にある数のうち目標にいちばん近いもの（同じ差なら小さいほう） */
export function closestValue(board: Board, target: number): number {
  let best = Number.NaN;
  for (const v of values(board)) {
    const d = Math.abs(v - target);
    const bd = Math.abs(best - target);
    if (Number.isNaN(best) || d < bd || (d === bd && v < best)) best = v;
  }
  return best;
}

/** ★ の数。**当サイト独自の基準**：ぴったり 3、差 1〜5 で 2、差 6〜10 で 1、差 11 以上は 0 */
export function starsFor(diff: number): number {
  const d = Math.abs(diff);
  if (d === 0) return 3;
  if (d <= 5) return 2;
  if (d <= 10) return 1;
  return 0;
}

/** ★★☆ の形 */
export function starText(stars: number): string {
  return '★'.repeat(stars) + '☆'.repeat(3 - stars);
}

/**
 * 今日の 3 問の結果を共有する文面。**式は入れない**（ネタバレになる）。
 */
export function shareText(params: { dateKey: DateKey; stars: number[]; streak?: number; url: string }): string {
  const { dateKey, stars, streak, url } = params;
  const head = `ターゲット計算パズル 今日の3問（${dateKey}）${stars.map(starText).join(' ')}`;
  const line = streak && streak > 1 ? `${head} ／ 連続${streak}日` : head;
  return [line, url].join('\n');
}
