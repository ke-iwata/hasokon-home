import { describe, expect, it } from 'vitest';
import {
  canPour,
  DIFFICULTIES,
  generatePuzzle,
  hasUsefulMove,
  isSolved,
  isStuck,
  isTubeDone,
  isUsefulMove,
  pour,
  pourAmount,
  solvedBoard,
  topColor,
  topRun,
  TUBE_HEIGHT,
  tubeCount,
  type Board,
  type Difficulty,
} from '@/lib/color-sort';

/**
 * 色水ソートのテスト（docs/features/game-color-sort.md の「テスト」）。
 *
 * 見張るのは4つ:
 *   1. 注げる条件（空・同色・満杯・自分自身）
 *   2. まとめて移動（連続する同色は一度に動き、空きぶんで止まる）
 *   3. クリア判定と行き止まりの判定
 *   4. **逆操作で作った盤面が必ず解けること**（出題の肝）
 */

/** 種を渡せる乱数（mulberry32）。生成を毎回同じにして落ちたときに追えるようにする */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIFFICULTY_KEYS = Object.keys(DIFFICULTIES) as Difficulty[];

describe('試験管の見かた', () => {
  it('いちばん上の色。空なら null', () => {
    expect(topColor([])).toBeNull();
    expect(topColor([0, 1, 2])).toBe(2);
  });

  it('上から続く同色の段数を数える（配列の先頭が底）', () => {
    expect(topRun([])).toBe(0);
    expect(topRun([1, 0, 0, 0])).toBe(3);
    expect(topRun([0, 0, 0, 1])).toBe(1);
    expect(topRun([2, 2, 2, 2])).toBe(4);
  });

  it('完成しているのは「空」か「同色で満杯」だけ', () => {
    expect(isTubeDone([])).toBe(true);
    expect(isTubeDone([3, 3, 3, 3])).toBe(true);
    // 同じ色でも満杯でなければ完成ではない（他の試験管に残りがある）
    expect(isTubeDone([3, 3, 3])).toBe(false);
    expect(isTubeDone([3, 3, 3, 4])).toBe(false);
  });
});

describe('注げる条件', () => {
  const board: Board = [
    [0, 0, 0], // 0: 赤3段
    [1], // 1: 青1段
    [0], // 2: 赤1段
    [], // 3: 空
    [2, 2, 2, 2], // 4: 満杯
  ];

  it('空の試験管へは注げる', () => {
    expect(canPour(board, 0, 3)).toBe(true);
  });

  it('いちばん上が同じ色なら注げる', () => {
    expect(canPour(board, 0, 2)).toBe(true);
  });

  it('違う色の上には注げない', () => {
    expect(canPour(board, 0, 1)).toBe(false);
  });

  it('満杯の試験管へは注げない（同じ色でも）', () => {
    expect(canPour(board, 4, 4)).toBe(false);
    expect(canPour([[2], [2, 2, 2, 2]], 0, 1)).toBe(false);
  });

  it('空の試験管からは注げない', () => {
    expect(canPour(board, 3, 1)).toBe(false);
  });

  it('自分自身へは注げない', () => {
    expect(canPour(board, 0, 0)).toBe(false);
  });

  it('範囲の外を指しても落ちない', () => {
    expect(canPour(board, 0, 9)).toBe(false);
    expect(canPour(board, -1, 0)).toBe(false);
  });
});

describe('注ぐ（まとめて移動）', () => {
  it('連続する同色はまとめて動く', () => {
    const board: Board = [[1, 0, 0, 0], []];
    expect(pourAmount(board, 0, 1)).toBe(3);
    expect(pour(board, 0, 1)).toEqual([[1], [0, 0, 0]]);
  });

  it('注ぎ先の空きぶんで止まり、残りは元に残る', () => {
    const board: Board = [[0, 0, 0, 0], [1, 1]];
    // 4段あるが空きは2段ぶん。色が違うので、そもそも注げない
    expect(pourAmount(board, 0, 1)).toBe(0);
    const same: Board = [[0, 0, 0, 0], [0, 0]];
    expect(pourAmount(same, 0, 1)).toBe(2);
    expect(pour(same, 0, 1)).toEqual([[0, 0], [0, 0, 0, 0]]);
  });

  it('上の色だけが動く（下の違う色は残る）', () => {
    const board: Board = [[2, 1, 1], []];
    expect(pour(board, 0, 1)).toEqual([[2], [1, 1]]);
  });

  it('注げないときは受け取った盤面をそのまま返す（同じ参照）', () => {
    const board: Board = [[0], [1]];
    expect(pour(board, 0, 1)).toBe(board);
  });

  it('元の盤面を書き換えない', () => {
    const board: Board = [[0, 0], []];
    const next = pour(board, 0, 1);
    expect(board).toEqual([[0, 0], []]);
    expect(next).toEqual([[], [0, 0]]);
  });
});

describe('クリア判定', () => {
  it('全部が「空」か「同色で満杯」ならクリア', () => {
    expect(isSolved([[0, 0, 0, 0], [1, 1, 1, 1], []])).toBe(true);
  });

  it('1本でも混ざっていればクリアではない', () => {
    expect(isSolved([[0, 0, 0, 1], [1, 1, 1, 0], []])).toBe(false);
  });

  it('同じ色でも4段そろっていなければクリアではない', () => {
    expect(isSolved([[0, 0, 0], [0], []])).toBe(false);
  });

  it('クリア状態の盤面は色ごとに満杯＋空が並ぶ', () => {
    expect(solvedBoard(2, 1)).toEqual([[0, 0, 0, 0], [1, 1, 1, 1], []]);
    expect(isSolved(solvedBoard(3, 2))).toBe(true);
  });
});

describe('行き止まりの判定', () => {
  it('丸ごと1色を空の試験管へ移すだけの手は「意味のある手」に数えない', () => {
    // 入れ物が入れ替わるだけで盤面の形は変わらない
    const board: Board = [[0, 0], []];
    expect(canPour(board, 0, 1)).toBe(true);
    expect(isUsefulMove(board, 0, 1)).toBe(false);
    expect(hasUsefulMove(board)).toBe(false);
  });

  it('下に別の色があるなら、空へ移すのは意味のある手', () => {
    const board: Board = [[1, 0, 0], []];
    expect(isUsefulMove(board, 0, 1)).toBe(true);
  });

  it('注ぐ先が無ければ行き止まり', () => {
    // 空きがあるのは1本だけで、そこには違う色しか乗らない
    const board: Board = [
      [0, 1, 0, 1],
      [1, 0, 1, 0],
      [2, 2, 2, 2],
      [0, 1, 0, 1],
    ];
    expect(hasUsefulMove(board)).toBe(false);
    expect(isStuck(board)).toBe(true);
  });

  it('クリアしている盤面は行き止まりではない', () => {
    expect(isStuck([[0, 0, 0, 0], []])).toBe(false);
  });
});

describe('出題', () => {
  it('難易度の設定は3段階で、空の試験管がある', () => {
    expect(DIFFICULTY_KEYS).toEqual(['easy', 'normal', 'hard']);
    for (const key of DIFFICULTY_KEYS) {
      expect(DIFFICULTIES[key].empty).toBeGreaterThan(0);
      expect(DIFFICULTIES[key].colors).toBeGreaterThan(1);
      expect(tubeCount(key)).toBe(DIFFICULTIES[key].colors + DIFFICULTIES[key].empty);
    }
  });

  it('色数と本数が難易度どおりで、どの色もちょうど4段ある', () => {
    for (const key of DIFFICULTY_KEYS) {
      const { colors } = DIFFICULTIES[key];
      const { board } = generatePuzzle(key, seeded(7));
      expect(board).toHaveLength(tubeCount(key));
      for (const tube of board) expect(tube.length).toBeLessThanOrEqual(TUBE_HEIGHT);

      const counts = new Map<number, number>();
      for (const tube of board) {
        for (const color of tube) counts.set(color, (counts.get(color) ?? 0) + 1);
      }
      expect(counts.size).toBe(colors);
      for (const [, n] of counts) expect(n).toBe(TUBE_HEIGHT);
    }
  });

  it('配った盤面は最初からクリアしていない', () => {
    for (const key of DIFFICULTY_KEYS) {
      for (let seed = 1; seed <= 20; seed += 1) {
        expect(isSolved(generatePuzzle(key, seeded(seed)).board)).toBe(false);
      }
    }
  });

  /**
   * **この1件が出題の要**。逆操作で作っているので、返ってくる `solution` を
   * 順に注げば必ずクリアできるはず。1手ずつ「本当に注げる手か」も確かめる
   * （合法でない手が混ざっていたら、それは解ではない）。
   */
  it('返ってきた解の通りに注ぐと必ずクリアできる（可解性）', () => {
    for (const key of DIFFICULTY_KEYS) {
      for (let seed = 1; seed <= 30; seed += 1) {
        const { board, solution } = generatePuzzle(key, seeded(seed));
        expect(solution.length).toBeGreaterThan(0);
        let current = board;
        for (const [i, move] of solution.entries()) {
          expect(
            canPour(current, move.from, move.to),
            `${key} / seed ${seed} / ${i}手目が注げない`,
          ).toBe(true);
          const next = pour(current, move.from, move.to);
          expect(next, `${key} / seed ${seed} / ${i}手目で盤面が変わらない`).not.toBe(current);
          current = next;
        }
        expect(isSolved(current), `${key} / seed ${seed} で解ききれない`).toBe(true);
      }
    }
  });

  it('配った直後から手がある（いきなり行き止まりの盤面を出さない）', () => {
    for (const key of DIFFICULTY_KEYS) {
      for (let seed = 1; seed <= 20; seed += 1) {
        expect(isStuck(generatePuzzle(key, seeded(seed)).board)).toBe(false);
      }
    }
  });

  it('乱数が偏っていても（常に同じ候補を選んでも）作れる', () => {
    const { board, solution } = generatePuzzle('easy', () => 0);
    expect(isSolved(board)).toBe(false);
    let current = board;
    for (const move of solution) current = pour(current, move.from, move.to);
    expect(isSolved(current)).toBe(true);
  });

  it('種が同じなら同じ盤面、違えば違う盤面になる', () => {
    expect(generatePuzzle('normal', seeded(3)).board).toEqual(
      generatePuzzle('normal', seeded(3)).board,
    );
    expect(generatePuzzle('normal', seeded(3)).board).not.toEqual(
      generatePuzzle('normal', seeded(4)).board,
    );
  });
});
