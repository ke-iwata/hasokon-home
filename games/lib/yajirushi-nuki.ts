/**
 * 矢印ぬきのロジック
 *
 * 仕様: docs/features/game-yajirushi-nuki.md
 *
 * ## ルール
 *
 * - N×N の盤のマスに、上下左右のどれかを向いた矢印が 1 本ずつ（空きマスもある）
 * - 矢印をタップすると向きの方向へまっすぐ進む。**進路（盤の端までの列・行）に
 *   他の矢印が無ければ抜けて消える**。あればぶつかって元に戻り、ミス 1
 * - 全部抜けたらクリア。ハートは 3 つで、0 になったらその面は負け
 *
 * ## 遊び手が考えること（設計の前提）
 *
 * 1 本抜いても、ほかの矢印の進路は**空くだけで塞がらない**。だから「いま抜ける矢印を
 * どれか抜く」を繰り返せば必ず解け、詰むことは無い。遊び手が考えるのは順番ではなく
 * **いま抜ける 1 本を見つけること**で、難しさは「同時に抜ける矢印がどれだけ少ないか」で決まる。
 * これを生成の制約（`DIFFICULTIES`）にして、`solveOrder` で解いて測る。
 *
 * ## 生成（逆順に置く）
 *
 * 空の盤に、**進路が空いている位置にだけ**矢印を 1 本ずつ置いていく。置いた逆順に抜けば
 * 必ず解けるので、可解性の探索は要らない。置く位置は「すでに置いた矢印の進路上」を優先する
 * （後から置く＝先に抜く矢印ほど他を塞がない位置に偏り、初手で抜ける本数が増えやすいため）。
 *
 * **打ち切りは試行回数で決め、壁時計の時間では決めない**（日替わりの決定論を壊さないため）。
 *
 * ## 乱数
 *
 * 乱数はすべて引数で受け取る（`lib/daily.ts` の `mulberry32`）。
 * このファイルから `Math.random()` を呼ばないこと。
 */

import { dailySeed, localDateKey, mulberry32, type DateKey } from './daily';

/** 乱数。`[0, 1)` を返す */
export type Rng = () => number;

/** 矢印の向き */
export type Dir = 'up' | 'down' | 'left' | 'right';

export const DIRS: readonly Dir[] = ['up', 'right', 'down', 'left'];

/** マスの添字（行の順。`row * size + col`） */
export type Cell = number;

/** 盤面。`cells[i]` が null なら空きマス */
export interface Board {
  size: number;
  cells: readonly (Dir | null)[];
}

/** 難易度。`daily` は「今日の 1 面」（ふつう 7×7 固定） */
export type Mode = 'easy' | 'normal' | 'hard' | 'daily';

export const MODE_ORDER: readonly Mode[] = ['daily', 'easy', 'normal', 'hard'];

export const MODE_LABEL: Record<Mode, string> = {
  daily: '今日の1面',
  easy: 'かんたん',
  normal: 'ふつう',
  hard: 'むずかしい',
};

/** 難しさの制約。数値は仕様書の表と同じ（変えたら仕様書の表も直す） */
export interface Difficulty {
  size: number;
  /** 矢印の本数（両端を含む） */
  minArrows: number;
  maxArrows: number;
  /** 初手で抜ける本数の上限 */
  maxInitial: number;
  /** 途中で同時に抜ける本数の最大の上限 */
  maxSimultaneous: number;
}

export type Level = Exclude<Mode, 'daily'>;

export const DIFFICULTIES: Record<Level, Difficulty> = {
  easy: { size: 5, minArrows: 14, maxArrows: 18, maxInitial: 6, maxSimultaneous: 8 },
  normal: { size: 7, minArrows: 30, maxArrows: 38, maxInitial: 4, maxSimultaneous: 6 },
  hard: { size: 9, minArrows: 52, maxArrows: 64, maxInitial: 3, maxSimultaneous: 5 },
};

/** 難しさの条件を満たすまで作り直す回数の上限（時間ではなく回数で打ち切る） */
export const MAX_ATTEMPTS = 200;

/** ハートの数 */
export const HEARTS = 3;

/** ヒント 1 回でタイムに足す時間（ms）。表示のタイマーと記録を同じ値にする */
export const HINT_PENALTY_MS = 15_000;

/**
 * 日替わりの生成手順の版。
 *
 * **生成の手順（置き方・難しさの測り方・制約）を変えたら上げる。**
 * 上げないと、同じ日付なのに盤面が変わる。上げたときは記録側のキー（`DAILY_VARIANT`）も変わる。
 */
export const VERSION = 1;

/** 記録の区分（`lib/records.ts` の variant） */
export const DAILY_VARIANT = `daily-v${VERSION}`;

export function variantOf(mode: Mode): string {
  return mode === 'daily' ? DAILY_VARIANT : mode;
}

/** 今日の 1 面は「ふつう」の盤 */
export function levelOf(mode: Mode): Level {
  return mode === 'daily' ? 'normal' : mode;
}

const STEP: Record<Dir, readonly [number, number]> = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
};

export const DIR_LABEL: Record<Dir, string> = {
  up: '上向き',
  down: '下向き',
  left: '左向き',
  right: '右向き',
};

/** 空の盤 */
export function emptyBoard(size: number): Board {
  return { size, cells: Array<Dir | null>(size * size).fill(null) };
}

/** `cell` から `dir` の方向へ盤の端までのマス（`cell` 自身は含まない。近い順） */
export function pathOf(size: number, cell: Cell, dir: Dir): Cell[] {
  const [dr, dc] = STEP[dir];
  const out: Cell[] = [];
  let r = Math.floor(cell / size) + dr;
  let c = (cell % size) + dc;
  while (r >= 0 && r < size && c >= 0 && c < size) {
    out.push(r * size + c);
    r += dr;
    c += dc;
  }
  return out;
}

/**
 * `cell` の矢印がぶつかる相手（進路上でいちばん近い矢印）。抜けられるなら null。
 * 画面の「ぶつかる相手まで進んで戻る」演出にも使う
 */
export function blockerOf(board: Board, cell: Cell): Cell | null {
  const dir = board.cells[cell];
  if (!dir) return null;
  for (const p of pathOf(board.size, cell, dir)) {
    if (board.cells[p] !== null) return p;
  }
  return null;
}

/** 進路上に矢印が無いか（`cell` が空きマスなら false） */
export function canEscape(board: Board, cell: Cell): boolean {
  return board.cells[cell] !== null && blockerOf(board, cell) === null;
}

/** いま抜ける矢印の一覧（添字の小さい順） */
export function escapable(board: Board): Cell[] {
  const out: Cell[] = [];
  for (let i = 0; i < board.cells.length; i++) if (canEscape(board, i)) out.push(i);
  return out;
}

export function arrowCount(board: Board): number {
  let n = 0;
  for (const d of board.cells) if (d !== null) n++;
  return n;
}

export function isCleared(board: Board): boolean {
  return arrowCount(board) === 0;
}

/** `cell` の矢印を取り除いた盤（元の盤は変えない） */
export function removeArrow(board: Board, cell: Cell): Board {
  const cells = board.cells.slice();
  cells[cell] = null;
  return { size: board.size, cells };
}

/**
 * 貪欲に解く：いま抜ける矢印のうち添字の最も小さいものを抜く、を繰り返す。
 * 全部抜けたら抜いた順を返す。途中で抜けるものが無くなったら、そこまでの順を返す
 * （生成した盤では起きない。テストで確かめる）
 */
export function solveOrder(board: Board): Cell[] {
  let b = board;
  const order: Cell[] = [];
  for (;;) {
    const free = escapable(b);
    if (free.length === 0) return order;
    order.push(free[0]);
    b = removeArrow(b, free[0]);
  }
}

/** 難しさの実測値 */
export interface Measure {
  arrows: number;
  /** 初手で抜ける本数 */
  initial: number;
  /** `solveOrder` の順に抜いたとき、途中で同時に抜ける本数の最大（初手を含む） */
  maxSimultaneous: number;
  /** 全部抜けたか */
  solvable: boolean;
}

export function measure(board: Board): Measure {
  let b = board;
  const arrows = arrowCount(board);
  const initial = escapable(b).length;
  let maxSimultaneous = initial;
  let removed = 0;
  for (;;) {
    const free = escapable(b);
    if (free.length === 0) break;
    if (free.length > maxSimultaneous) maxSimultaneous = free.length;
    b = removeArrow(b, free[0]);
    removed++;
  }
  return { arrows, initial, maxSimultaneous, solvable: removed === arrows };
}

/** 制約からどれだけ外れているか（0 なら満たしている）。打ち切り時に「最も近い」盤を選ぶのに使う */
export function violation(m: Measure, d: Difficulty): number {
  return (
    Math.max(0, d.minArrows - m.arrows) +
    Math.max(0, m.arrows - d.maxArrows) +
    Math.max(0, m.initial - d.maxInitial) +
    Math.max(0, m.maxSimultaneous - d.maxSimultaneous) +
    (m.solvable ? 0 : 1000)
  );
}

function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

/** 置いた 1 本 */
export interface Placement {
  cell: Cell;
  dir: Dir;
}

/**
 * 逆順に、最大 `limit` 本まで置いていく（難しさの制約は見ない。`generateFor` が測って選ぶ）。
 * 返すのは置いた順。**どの長さで切っても、その逆順に抜けば全部抜ける盤になる**。
 *
 * 1 手ごとに「進路が空いている（位置, 向き）」の候補を全部挙げ、
 * **いま抜けられる矢印の進路上に入る（＝塞ぐ）候補**を最優先する。
 * 最後に置いた矢印ほど先に抜くので、ここで塞いでおくと初手で抜ける本数が減る。
 * 盤の端で外を向く矢印（進路の長さ 0）は後から塞げず、ずっと「初手で抜ける」側に残るので
 * なるべく置かず、進路の長い（後から塞ぐ余地の大きい）向きを選ぶ
 */
export function placeArrows(size: number, limit: number, rng: Rng): Placement[] {
  const cells: (Dir | null)[] = Array(size * size).fill(null);
  const board: Board = { size, cells };
  const placed: Placement[] = [];
  while (placed.length < limit) {
    // 各マスが、いま抜けられる矢印を何本塞ぐか（その矢印の進路は空いているので、置けば最初にぶつかる相手になる）
    const blocksFree = new Array<number>(cells.length).fill(0);
    for (let i = 0; i < cells.length; i++) {
      const dir = cells[i];
      if (!dir || blockerOf(board, i) !== null) continue;
      for (const p of pathOf(size, i, dir)) blocksFree[p]++;
    }
    let best = -Infinity;
    let candidates: Placement[] = [];
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] !== null) continue;
      for (const dir of DIRS) {
        const path = pathOf(size, i, dir);
        if (path.some((p) => cells[p] !== null)) continue;
        const score = blocksFree[i] * 10 - (path.length === 0 ? 8 : 0) + Math.min(path.length, 8);
        if (score > best) {
          best = score;
          candidates = [{ cell: i, dir }];
        } else if (score === best) {
          candidates.push({ cell: i, dir });
        }
      }
    }
    if (candidates.length === 0) break;
    const chosen = pick(candidates, rng);
    cells[chosen.cell] = chosen.dir;
    placed.push(chosen);
  }
  return placed;
}

/** 置いた順の先頭 `count` 本で盤を作る */
export function boardFrom(size: number, placements: readonly Placement[], count = placements.length): Board {
  const cells: (Dir | null)[] = Array(size * size).fill(null);
  for (const { cell, dir } of placements.slice(0, count)) cells[cell] = dir;
  return { size, cells };
}

export interface Generated {
  board: Board;
  measure: Measure;
  /** 何回目の試行で採ったか（1 始まり） */
  attempts: number;
  /** 制約を満たしたか（満たさなければ最も近い盤） */
  satisfied: boolean;
}

/**
 * 制約を満たすまで作り直す。
 *
 * 1 回の試行では本数の上限まで置き、**本数の範囲のどこで切るか**も選ぶ
 * （置くほど端に「後から塞げない矢印」が溜まり、初手で抜ける本数が増えることがあるため）。
 * 範囲の中で制約を満たす長さがあれば、そのうちの 1 つを乱数で選ぶ。
 * `MAX_ATTEMPTS` 回で満たせなければ、そこまでの候補のうち制約に最も近い盤を採る
 * （同じ種なら必ず同じ盤）
 */
export function generateFor(level: Level, rng: Rng): Generated {
  const d = DIFFICULTIES[level];
  let best: Generated | null = null;
  let bestScore = Infinity;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const placements = placeArrows(d.size, d.maxArrows, rng);
    const ok: { board: Board; measure: Measure }[] = [];
    for (let n = d.minArrows; n <= placements.length; n++) {
      const board = boardFrom(d.size, placements, n);
      const m = measure(board);
      const score = violation(m, d);
      if (score === 0) ok.push({ board, measure: m });
      else if (score < bestScore) {
        bestScore = score;
        best = { board, measure: m, attempts: attempt, satisfied: false };
      }
    }
    if (ok.length > 0) return { ...pick(ok, rng), attempts: attempt, satisfied: true };
    if (best === null) {
      // 下限まで置けなかった（起きない想定）。最も近い盤の候補として残す
      const board = boardFrom(d.size, placements);
      const m = measure(board);
      bestScore = violation(m, d);
      best = { board, measure: m, attempts: attempt, satisfied: false };
    }
  }
  return best as Generated;
}

/** 仕様書の `generate(size, rng)`。大きさから難易度を引く */
export function generate(size: number, rng: Rng): Board {
  const level = (Object.keys(DIFFICULTIES) as Level[]).find((l) => DIFFICULTIES[l].size === size);
  if (!level) throw new Error(`unsupported size: ${size}`);
  return generateFor(level, rng).board;
}

/** 今日の 1 面（ふつう 7×7）。同じ日付・同じ `VERSION` なら必ず同じ盤 */
export function dailyBoard(key: DateKey = localDateKey()): Board {
  return generateFor('normal', mulberry32(dailySeed(key, VERSION))).board;
}

/** 遊んでいる最中の状態。ミスは盤を変えない */
export interface PlayState {
  board: Board;
  misses: number;
  hearts: number;
}

export function startPlay(board: Board): PlayState {
  return { board, misses: 0, hearts: HEARTS };
}

export type TapOutcome = 'escaped' | 'blocked' | 'ignored';

/**
 * 矢印をタップする。抜けられれば盤から消え、ぶつかれば**盤はそのまま**でミスが 1 増え、
 * ハートが 1 減る。空きマス・決着後のタップは何もしない
 */
export function tapArrow(state: PlayState, cell: Cell): { state: PlayState; outcome: TapOutcome; blocker: Cell | null } {
  if (state.hearts <= 0 || isCleared(state.board) || state.board.cells[cell] === null) {
    return { state, outcome: 'ignored', blocker: null };
  }
  const blocker = blockerOf(state.board, cell);
  if (blocker === null) {
    return { state: { ...state, board: removeArrow(state.board, cell) }, outcome: 'escaped', blocker: null };
  }
  return {
    state: { ...state, misses: state.misses + 1, hearts: state.hearts - 1 },
    outcome: 'blocked',
    blocker,
  };
}

export function isLost(state: PlayState): boolean {
  return state.hearts <= 0;
}

/** ヒントで光らせる矢印（いま抜けられるうちの 1 本）。無ければ null */
export function hintCell(board: Board, rng: Rng): Cell | null {
  const free = escapable(board);
  return free.length === 0 ? null : pick(free, rng);
}

/** ヒントのペナルティを足したタイム（表示と記録の両方に使う） */
export function totalTimeMs(elapsedMs: number, hints: number): number {
  return elapsedMs + hints * HINT_PENALTY_MS;
}

/** マスの読み上げ。**抜けられるかどうかは読まない**（答えを読み上げない） */
export function cellLabel(board: Board, cell: Cell): string {
  const r = Math.floor(cell / board.size) + 1;
  const c = (cell % board.size) + 1;
  const dir = board.cells[cell];
  return `${r}行${c}列、${dir ? DIR_LABEL[dir] : '空き'}`;
}

/** キーボードのカーソル移動（端で止まる） */
export function moveCursor(size: number, cell: Cell, dir: Dir): Cell {
  const [dr, dc] = STEP[dir];
  const r = Math.min(size - 1, Math.max(0, Math.floor(cell / size) + dr));
  const c = Math.min(size - 1, Math.max(0, (cell % size) + dc));
  return r * size + c;
}

/**
 * 共有の文面。「矢印ぬき 10/04 ミス 0・1:23」。**盤面は入れない**（ネタバレになる）
 */
export function shareText(params: {
  mode: Mode;
  misses: number;
  timeMs: number;
  dateKey?: DateKey;
  url: string;
}): string {
  const { mode, misses, timeMs, dateKey, url } = params;
  const label =
    mode === 'daily' && dateKey ? `${dateKey.slice(5, 7)}/${dateKey.slice(8, 10)}` : MODE_LABEL[mode];
  return `矢印ぬき ${label} ミス ${misses}・${formatDuration(timeMs)}\n${url}`;
}

/** `1:23` 形式。`lib/records.ts` の `formatTime` と同じ書き方 */
function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/**
 * 今日の 1 面を遊んだ日のキー。`records.ts` は勝ちの日（`lastClearedOn`）しか持たず負けの日を持たないので、
 * 「今日の 1 回目か」はページ側でこのキーに今日の日付を 1 つだけ置いて判定する（`records.ts` の型は変えない）
 */
export const DAILY_PLAYED_KEY = 'yajirushi-nuki:daily-played';

/** `localStorage` のうち、ここで使う部分だけ（`lib/records.ts` の `browserStorage()` を渡す。テストでは差し替える） */
export interface PlayedStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 今日の 1 面が 1 回目か。保存値が今日なら 2 回目以降。読めない値は 1 回目として扱う */
export function isFirstDailyPlay(stored: string | null, today: DateKey): boolean {
  return stored !== today;
}

/** 保存されている「遊んだ日」。読めなければ null（＝1 回目として扱う） */
export function readDailyPlayed(storage: PlayedStorage | null): string | null {
  try {
    return storage?.getItem(DAILY_PLAYED_KEY) ?? null;
  } catch {
    return null;
  }
}

/** 今日を「遊んだ日」にする。書けなくても遊べる（次も 1 回目として扱われるだけ） */
export function writeDailyPlayed(storage: PlayedStorage | null, today: DateKey): void {
  try {
    storage?.setItem(DAILY_PLAYED_KEY, today);
  } catch {
    // 何もしない
  }
}
