/**
 * ナンプレ（ナンバープレース）の生成・判定ロジック
 *
 * 盤面は長さ81の配列で持つ（0 = 空きマス、1〜9 = 数字）。
 * index = row * 9 + col。
 *
 * 生成の流れ:
 *   1. 空の盤面をバックトラッキングで埋めて完成盤を作る（数字の順序はシャッフル）
 *   2. マスをランダムな順で1つずつ空けていき、
 *      「解が2つ以上にならないか」を毎回確かめる。複数解になるなら戻す
 *   3. 難易度ごとのヒント数（残すマスの数）に達したら終了
 *
 * 2の唯一解チェックがあるので、出題は必ず1通りの答えしか持たない。
 * ヒント数を減らすほど掘る回数と唯一解チェックが増えるため生成は遅くなるが、
 * 難しい問題でも数十ms程度で終わる。
 *
 * ※「数独」はパズル制作会社の登録商標のため、このサイトでは使わない。
 *   一般名称の「ナンプレ」「ナンバープレース」で統一すること。
 */

export type Board = number[];

/** 難易度ごとのヒント数（最初から埋まっているマスの数） */
export const DIFFICULTIES = {
  easy: { label: 'かんたん', hints: 40 },
  normal: { label: 'ふつう', hints: 32 },
  hard: { label: 'むずかしい', hints: 26 },
} as const;

export type Difficulty = keyof typeof DIFFICULTIES;

/** 乱数。テストで結果を固定できるよう、関数を差し替えられる形にしている */
export type Rng = () => number;

const rowOf = (i: number) => Math.floor(i / 9);
const colOf = (i: number) => i % 9;
const boxOf = (i: number) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

/**
 * 各マスと同じ行・列・ブロックに属するマス（ピア）の一覧。
 * 毎回計算すると探索が桁違いに遅くなるため、モジュール読み込み時に1度だけ作る。
 */
const PEERS: number[][] = (() => {
  const peers: number[][] = [];
  for (let i = 0; i < 81; i += 1) {
    const set: number[] = [];
    for (let j = 0; j < 81; j += 1) {
      if (i === j) continue;
      if (rowOf(i) === rowOf(j) || colOf(i) === colOf(j) || boxOf(i) === boxOf(j)) set.push(j);
    }
    peers.push(set);
  }
  return peers;
})();

/** そのマスに数字を置けるか（同じ行・列・3x3ブロックに重複がないか） */
export function canPlace(board: Board, index: number, value: number): boolean {
  for (const p of PEERS[index]) {
    if (board[p] === value) return false;
  }
  return true;
}

/** そのマスに置ける数字のビットマスク（bit1〜bit9）。0なら何も置けない */
function candidateMask(board: Board, index: number): number {
  let used = 0;
  for (const p of PEERS[index]) {
    used |= 1 << board[p]; // board[p]=0 は bit0 に入り、判定に影響しない
  }
  return ~used & 0b1111111110;
}

/** ビットの数（置ける候補の個数） */
function bitCount(n: number): number {
  let c = 0;
  while (n) {
    n &= n - 1;
    c += 1;
  }
  return c;
}

/** 配列をシャッフルした新しい配列を返す（Fisher–Yates） */
function shuffled<T>(arr: readonly T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 解の個数を数える（最大 limit まで）。
 * 唯一解の判定には「2つ以上あるか」さえ分かればよいので、
 * limit=2 で打ち切って全探索を避けている。
 */
export function countSolutions(board: Board, limit = 2): number {
  const b = [...board];
  // 与えられた数字そのものに矛盾があれば解なし。
  // このチェックを飛ばすと、矛盾の証明のために残りの全マスを
  // 探索し尽くすことになり、実質終わらない
  for (let i = 0; i < 81; i += 1) {
    if (b[i] !== 0 && !canPlace(b, i, b[i])) return 0;
  }
  let count = 0;
  const solve = (): boolean => {
    // 空きマスのうち、候補が最も少ないマスから試す（探索が大幅に速くなる）
    let target = -1;
    let targetMask = 0;
    let minCount = 10;
    for (let i = 0; i < 81; i += 1) {
      if (b[i] !== 0) continue;
      const mask = candidateMask(b, i);
      if (mask === 0) return false; // 置ける数字がない＝この枝は解なし
      const n = bitCount(mask);
      if (n < minCount) {
        minCount = n;
        target = i;
        targetMask = mask;
        if (n === 1) break;
      }
    }
    if (target === -1) {
      count += 1;
      return count >= limit; // limit に達したら探索を打ち切る
    }
    for (let v = 1; v <= 9; v += 1) {
      if (!(targetMask & (1 << v))) continue;
      b[target] = v;
      if (solve()) {
        b[target] = 0;
        return true;
      }
      b[target] = 0;
    }
    return false;
  };
  solve();
  return count;
}

/** 完成盤（すべて埋まった正しい盤面）を作る */
export function generateSolved(rng: Rng = Math.random): Board {
  const b: Board = new Array(81).fill(0);
  const fill = (index: number): boolean => {
    if (index === 81) return true;
    for (const v of shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9], rng)) {
      if (canPlace(b, index, v)) {
        b[index] = v;
        if (fill(index + 1)) return true;
        b[index] = 0;
      }
    }
    return false;
  };
  fill(0);
  return b;
}

export interface Puzzle {
  /** 出題（0 = 空きマス） */
  puzzle: Board;
  /** 答え */
  solution: Board;
  difficulty: Difficulty;
}

/**
 * 唯一解の問題を生成する。
 *
 * @param difficulty 難易度（残すヒント数が変わる）
 * @param rng テスト用に乱数を注入できる
 */
export function generatePuzzle(difficulty: Difficulty, rng: Rng = Math.random): Puzzle {
  const solution = generateSolved(rng);
  const puzzle = [...solution];
  const targetHints = DIFFICULTIES[difficulty].hints;
  let hints = 81;

  // ランダムな順でマスを空けていく。空けて複数解になるなら戻す。
  // 全マスを一巡して目標に届かない場合はそこで打ち切る
  // （目標ヒント数は「そこまで掘れたら十分」の目安であり、厳密な保証ではない）
  for (const i of shuffled([...Array(81).keys()], rng)) {
    if (hints <= targetHints) break;
    const saved = puzzle[i];
    if (saved === 0) continue;
    puzzle[i] = 0;
    if (countSolutions(puzzle) !== 1) {
      puzzle[i] = saved; // 複数解になるので戻す
    } else {
      hints -= 1;
    }
  }
  return { puzzle, solution, difficulty };
}

/** 入力中の盤面に矛盾（同じ行・列・ブロックの重複）があるマスの一覧 */
export function findConflicts(board: Board): number[] {
  const bad = new Set<number>();
  for (let i = 0; i < 81; i += 1) {
    if (board[i] === 0) continue;
    if (!canPlace(board, i, board[i])) bad.add(i);
  }
  return [...bad];
}

/** 完成しているか（すべて埋まっていて矛盾がない） */
export function isComplete(board: Board): boolean {
  return board.every((v) => v !== 0) && findConflicts(board).length === 0;
}
