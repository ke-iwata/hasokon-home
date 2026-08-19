/**
 * 色水ソート（ウォーターソート型パズル）のロジック
 *
 * 仕様: docs/features/game-color-sort.md
 *
 * ## 持ち方
 *
 * 盤面は「試験管の配列」だけ。試験管は色番号の配列で、**先頭が底・末尾がいちばん上**。
 * 注ぐのは末尾からなので、`push` / `splice` がそのまま「注ぐ」になる。
 * 色は番号（0始まり）で持ち、見た目の色と名前は `app/color-sort/Game.tsx` が決める
 * （ロジックは何色かを知らなくてよい）。
 *
 * ## 出題（ここが肝）
 *
 * ランダムに色を配って「解けるかどうか」を後から探索すると、むずかしい盤面では
 * 探索が跳ね上がる。そこで**クリア状態から逆向きに注ぎ戻して**盤面を作る。
 * 逆にたどった手を逆順に並べたものがそのまま解になるので、
 * **生成された盤面は必ず解ける**（`generatePuzzle` は解も返す。テストで固定する）。
 *
 * 逆操作にできる手は2種類しかない。どちらも「その手を forward で指すと
 * いまの盤面になる」ことが条件で、`reverseMoves` のコメントに条件を書いてある。
 * ここを緩めると「戻せたはずの手」が実は合法でなく、解が成立しなくなる。
 */

/** 試験管1本に入る色水の段数。ジャンル標準の4段 */
export const TUBE_HEIGHT = 4;

/** 色。0始まりの番号で持つ（見た目の色は Game.tsx の PALETTE が決める） */
export type Color = number;

/** 試験管。**先頭が底、末尾がいちばん上** */
export type Tube = Color[];

/** 盤面。試験管の並び。index がそのまま試験管の番号 */
export type Board = Tube[];

/** 1手（`from` の上の色水を `to` に注ぐ） */
export interface Move {
  from: number;
  to: number;
}

/**
 * 難易度。色数と空の試験管の本数だけで決める。
 *
 * `shuffle` は生成時に逆向きにたどる手数。多いほど元の並びから遠ざかるが、
 * 逆操作の候補が尽きれば途中で止まるので、上限として置いている。
 */
export const DIFFICULTIES = {
  easy: { label: 'かんたん', colors: 5, empty: 2, shuffle: 60 },
  normal: { label: 'ふつう', colors: 8, empty: 2, shuffle: 120 },
  hard: { label: 'むずかしい', colors: 12, empty: 2, shuffle: 200 },
} as const;

export type Difficulty = keyof typeof DIFFICULTIES;

/** 乱数。テストで結果を固定できるよう、関数を差し替えられる形にしている */
export type Rng = () => number;

/** その難易度の試験管の本数（色の数 ＋ 空の本数） */
export function tubeCount(difficulty: Difficulty): number {
  const { colors, empty } = DIFFICULTIES[difficulty];
  return colors + empty;
}

/** いちばん上の色。空なら null */
export function topColor(tube: Tube): Color | null {
  return tube.length === 0 ? null : tube[tube.length - 1];
}

/** いちばん上から続く同じ色の段数（空なら0）。まとめて注げる量の上限 */
export function topRun(tube: Tube): number {
  if (tube.length === 0) return 0;
  const color = tube[tube.length - 1];
  let run = 1;
  while (run < tube.length && tube[tube.length - 1 - run] === color) run += 1;
  return run;
}

/** その試験管は完成しているか（空か、同じ色で満杯か） */
export function isTubeDone(tube: Tube): boolean {
  return tube.length === 0 || (tube.length === TUBE_HEIGHT && topRun(tube) === TUBE_HEIGHT);
}

/** 全部の試験管が「空」か「同色で満杯」になったらクリア */
export function isSolved(board: Board): boolean {
  return board.every(isTubeDone);
}

/**
 * `from` から `to` へ注げるか。
 * 注ぎ先が空か、いちばん上の色が同じで、まだ空きがあるときだけ注げる。
 */
export function canPour(board: Board, from: number, to: number): boolean {
  if (from === to) return false;
  const source = board[from];
  const target = board[to];
  if (source === undefined || target === undefined) return false;
  if (source.length === 0) return false;
  if (target.length >= TUBE_HEIGHT) return false;
  const top = topColor(target);
  return top === null || top === topColor(source);
}

/** 実際に注がれる段数。注げないときは0 */
export function pourAmount(board: Board, from: number, to: number): number {
  if (!canPour(board, from, to)) return 0;
  return Math.min(topRun(board[from]), TUBE_HEIGHT - board[to].length);
}

/**
 * 注ぐ。連続する同色はまとめて動き、注ぎ先の空きぶんで止まる。
 *
 * **注げないときは受け取った盤面をそのまま返す**（同じ参照）。
 * 呼ぶ側は参照が変わったかどうかで「手が進んだか」を判定でき、
 * 空振りのタップで「もどす」の履歴が伸びない。
 */
export function pour(board: Board, from: number, to: number): Board {
  const amount = pourAmount(board, from, to);
  if (amount === 0) return board;
  const next = board.map((tube) => [...tube]);
  const moved = next[from].splice(next[from].length - amount, amount);
  next[to].push(...moved);
  return next;
}

/**
 * 意味のある手か。
 *
 * 「丸ごと1色の試験管を空の試験管へ移すだけ」の手は、注ぐ前と後で盤面の形が
 * 変わらない（入れ物が入れ替わるだけ）。これを手として数えると、
 * 手詰まりでも延々と手があることになってしまうので、行き止まりの判定から外す。
 */
export function isUsefulMove(board: Board, from: number, to: number): boolean {
  if (!canPour(board, from, to)) return false;
  const source = board[from];
  if (board[to].length === 0 && topRun(source) === source.length) return false;
  return true;
}

/** 意味のある手が1つでも残っているか */
export function hasUsefulMove(board: Board): boolean {
  for (let from = 0; from < board.length; from += 1) {
    for (let to = 0; to < board.length; to += 1) {
      if (isUsefulMove(board, from, to)) return true;
    }
  }
  return false;
}

/** 行き止まり（クリアしておらず、意味のある手も残っていない） */
export function isStuck(board: Board): boolean {
  return !isSolved(board) && !hasUsefulMove(board);
}

/** クリア状態の盤面（各色で満杯の試験管＋空の試験管） */
export function solvedBoard(colors: number, empty: number): Board {
  const board: Board = [];
  for (let color = 0; color < colors; color += 1) {
    board.push(Array<Color>(TUBE_HEIGHT).fill(color));
  }
  for (let i = 0; i < empty; i += 1) board.push([]);
  return board;
}

/** 逆操作の候補。`s` から `d` へ `k` 段**戻す**（対応する手は `d` → `s`） */
interface Reverse {
  s: number;
  d: number;
  k: number;
}

/**
 * いまの盤面から「1手戻せる」やり方をすべて挙げる。
 *
 * 戻せるのは、**戻した先の盤面でその手を指すと、いまの盤面に戻る**ときだけ。
 * `s` のいちばん上の色を c、`s` の上から続く同色の段数を run とすると、
 * 条件は次の2つに分かれる（どちらも紙の上で確かめて実装している）。
 *
 * - **注ぎ切った手**（注ぎ先に余裕があり、上の同色をすべて注いだ）
 *   戻す先 `d` のいちばん上が c 以外（または空）であること。
 *   さらに、`k` が run と等しいときは `s` が空になること
 *   （そうでないと戻した盤面の `s` の上が c 以外になり、その手は注げない）
 * - **注ぎ先が満杯になって止まった手**
 *   `s` が満杯で、戻す先 `d` のいちばん上が c であること。
 *   この場合は途中で止まった手なので `k` は run より小さい
 *
 * どちらの場合も、戻したあとの `d` の高さが4段を超えないこと。
 */
function reverseMoves(board: Board): Reverse[] {
  const out: Reverse[] = [];
  for (let s = 0; s < board.length; s += 1) {
    const source = board[s];
    if (source.length === 0) continue;
    const color = source[source.length - 1];
    const run = topRun(source);
    for (let k = 1; k <= run; k += 1) {
      for (let d = 0; d < board.length; d += 1) {
        if (d === s) continue;
        const dest = board[d];
        if (dest.length + k > TUBE_HEIGHT) continue;
        const destTop = topColor(dest);
        if (destTop === null || destTop !== color) {
          if (k < run || k === source.length) out.push({ s, d, k });
        } else if (source.length === TUBE_HEIGHT && k < run) {
          out.push({ s, d, k });
        }
      }
    }
  }
  return out;
}

/** 逆操作を1つ適用する（`s` の上から `k` 段を `d` に戻す） */
function applyReverse(board: Board, move: Reverse): Board {
  const next = board.map((tube) => [...tube]);
  const moved = next[move.s].splice(next[move.s].length - move.k, move.k);
  next[move.d].push(...moved);
  return next;
}

/** 出題1問。`solution` の順に注げば必ずクリアできる */
export interface Puzzle {
  board: Board;
  /** 生成のときに逆向きにたどった手を、逆順に並べたもの（＝解の一例） */
  solution: Move[];
}

/** クリア状態から逆向きに注ぎ戻して1問作る */
function shuffleFromSolved(difficulty: Difficulty, rng: Rng): Puzzle {
  const { colors, empty, shuffle } = DIFFICULTIES[difficulty];
  let board = solvedBoard(colors, empty);
  const undone: Move[] = [];
  for (let i = 0; i < shuffle; i += 1) {
    const candidates = reverseMoves(board);
    if (candidates.length === 0) break;
    // rng() が 1 を返しても添字が範囲を出ないようにする
    const picked = candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))];
    board = applyReverse(board, picked);
    // 逆操作 s→d に対応する手は d→s
    undone.push({ from: picked.d, to: picked.s });
  }
  return { board, solution: [...undone].reverse() };
}

/**
 * 1問作る。**必ず解ける**（クリア状態からの逆操作で作っているため）。
 *
 * まれに逆操作が打ち消し合ってクリア状態のまま戻ってくることがあるので、
 * その場合は作り直す。乱数が定数を返すような極端な場合に備えて回数は区切る。
 */
export function generatePuzzle(difficulty: Difficulty, rng: Rng = Math.random): Puzzle {
  let puzzle = shuffleFromSolved(difficulty, rng);
  for (let attempt = 0; attempt < 10 && isSolved(puzzle.board); attempt += 1) {
    puzzle = shuffleFromSolved(difficulty, rng);
  }
  return puzzle;
}
