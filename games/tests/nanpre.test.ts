import { describe, expect, it } from 'vitest';
import {
  canPlace,
  countSolutions,
  DIFFICULTIES,
  findConflicts,
  generatePuzzle,
  generateSolved,
  isComplete,
  type Board,
} from '@/lib/nanpre';

/** 再現可能な擬似乱数（mulberry32）。テストを決定的にする */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 盤面が正しい完成盤か（各行・列・ブロックに1〜9が1回ずつ） */
function isValidSolved(b: Board): boolean {
  return b.every((v) => v >= 1 && v <= 9) && findConflicts(b).length === 0;
}

describe('canPlace', () => {
  const empty: Board = new Array(81).fill(0);

  it('空の盤面にはどこにでも置ける', () => {
    expect(canPlace(empty, 0, 5)).toBe(true);
    expect(canPlace(empty, 80, 9)).toBe(true);
  });

  it('同じ行にある数字は置けない', () => {
    const b = [...empty];
    b[0] = 5;
    expect(canPlace(b, 8, 5)).toBe(false); // 同じ行の右端
    expect(canPlace(b, 8, 6)).toBe(true);
  });

  it('同じ列にある数字は置けない', () => {
    const b = [...empty];
    b[0] = 5;
    expect(canPlace(b, 72, 5)).toBe(false); // 同じ列の下端
  });

  it('同じ3x3ブロックにある数字は置けない', () => {
    const b = [...empty];
    b[0] = 5;
    expect(canPlace(b, 10, 5)).toBe(false); // 左上ブロック内（row1, col1）
    expect(canPlace(b, 30, 5)).toBe(true); // ブロック外・行列も違う（row3, col3）
  });
});

describe('generateSolved', () => {
  it('正しい完成盤を作る', () => {
    expect(isValidSolved(generateSolved(seeded(1)))).toBe(true);
    expect(isValidSolved(generateSolved(seeded(2)))).toBe(true);
  });

  it('乱数が違えば違う盤面になる', () => {
    const a = generateSolved(seeded(1)).join('');
    const b = generateSolved(seeded(99)).join('');
    expect(a).not.toBe(b);
  });
});

describe('countSolutions', () => {
  it('完成盤の解は1つ', () => {
    expect(countSolutions(generateSolved(seeded(3)))).toBe(1);
  });

  it('空の盤面は複数解（limit=2 で打ち切られる）', () => {
    expect(countSolutions(new Array(81).fill(0))).toBe(2);
  });

  it('矛盾のある盤面は解なし', () => {
    const b: Board = new Array(81).fill(0);
    b[0] = 1;
    b[1] = 1; // 同じ行に1が2つ
    expect(countSolutions(b)).toBe(0);
  });
});

describe('generatePuzzle', () => {
  // 生成は確率的なので、複数のシードで性質を確認する
  for (const difficulty of ['easy', 'normal', 'hard'] as const) {
    it(`${difficulty}: 唯一解の問題を生成する`, () => {
      const { puzzle, solution } = generatePuzzle(difficulty, seeded(42));
      expect(countSolutions(puzzle)).toBe(1);
      expect(isValidSolved(solution)).toBe(true);
      // 出題の数字は答えと一致している
      for (let i = 0; i < 81; i += 1) {
        if (puzzle[i] !== 0) expect(puzzle[i]).toBe(solution[i]);
      }
    });
  }

  it('難易度が上がるほどヒントが少ない', () => {
    const rng = () => seeded(7);
    const easy = generatePuzzle('easy', rng()).puzzle.filter((v) => v !== 0).length;
    const hard = generatePuzzle('hard', rng()).puzzle.filter((v) => v !== 0).length;
    expect(easy).toBeGreaterThan(hard);
    // ヒント数は目標値の近くに収まる（掘りきれない場合があるので幅を持たせる）
    expect(easy).toBeGreaterThanOrEqual(DIFFICULTIES.easy.hints);
    expect(hard).toBeGreaterThanOrEqual(DIFFICULTIES.hard.hints);
    expect(hard).toBeLessThanOrEqual(DIFFICULTIES.hard.hints + 8);
  });
});

describe('findConflicts / isComplete', () => {
  it('重複したマスを両方報告する', () => {
    const b: Board = new Array(81).fill(0);
    b[0] = 3;
    b[4] = 3; // 同じ行
    expect(findConflicts(b).sort((x, y) => x - y)).toEqual([0, 4]);
  });

  it('完成盤は complete', () => {
    expect(isComplete(generateSolved(seeded(5)))).toBe(true);
  });

  it('空きがあれば complete ではない', () => {
    const b = generateSolved(seeded(5));
    b[40] = 0;
    expect(isComplete(b)).toBe(false);
  });

  it('埋まっていても矛盾があれば complete ではない', () => {
    const b = generateSolved(seeded(5));
    // 2マスを入れ替えて矛盾させる
    [b[0], b[1]] = [b[1], b[0]];
    expect(isComplete(b)).toBe(false);
  });
});
