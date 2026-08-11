import { describe, expect, it } from 'vitest';
import {
  cellsBetween,
  countSolutions,
  deriveHints,
  EMPTY,
  emptyBoard,
  FILLED,
  isSolved,
  LEVELS,
  linePatterns,
  loadPuzzle,
  MARKED,
  nextCell,
  paint,
  parseCells,
  pickPuzzle,
  PUZZLES,
  runsOf,
  satisfiedLines,
  unsolved,
  type Board,
  type Level,
} from '@/lib/nonogram';

/** 完成図の文字列（'.' と '#'）を 0/1 の配列にする。テストの見た目を絵に近づけるため */
const art = (...rows: string[]): { solution: number[]; size: number } => {
  const size = rows.length;
  const solution = rows.flatMap((r) => [...r].map((ch) => (ch === '#' ? 1 : 0)));
  return { solution, size };
};

/** 完成図をそのまま塗った盤面 */
const filledBoard = (solution: readonly number[]): Board =>
  solution.map((v) => (v === 1 ? FILLED : EMPTY));

describe('runsOf', () => {
  it('連続する塗りの数を左から順に返す', () => {
    expect(runsOf([1, 1, 0, 1, 0, 0, 1, 1, 1])).toEqual([2, 1, 3]);
    expect(runsOf([1, 1, 1])).toEqual([3]);
  });

  it('塗りが1つもない線は [0]', () => {
    expect(runsOf([0, 0, 0])).toEqual([0]);
  });
});

describe('parseCells', () => {
  it('行を空白区切りで読む', () => {
    expect(parseCells('01 10', 2)).toEqual([0, 1, 1, 0]);
  });

  it('行数・行の長さ・使える文字が違えば例外', () => {
    expect(() => parseCells('01 10 11', 2)).toThrow();
    expect(() => parseCells('010 10', 2)).toThrow();
    expect(() => parseCells('0x 10', 2)).toThrow();
  });
});

describe('deriveHints', () => {
  it('行と列のヒントを導く', () => {
    const { solution, size } = art('##.', '.#.', '#.#');
    expect(deriveHints(solution, size)).toEqual({
      rows: [[2], [1], [1, 1]],
      cols: [[1, 1], [2], [1]],
    });
  });

  it('塗りのない行・列は [0] になる', () => {
    const { solution, size } = art('...', '...', '...');
    expect(deriveHints(solution, size).rows).toEqual([[0], [0], [0]]);
  });
});

describe('linePatterns', () => {
  it('ヒントを満たす並べ方をすべて挙げる', () => {
    // 幅3に「1」は3通り
    expect(linePatterns([1], 3).sort((a, b) => a - b)).toEqual([0b001, 0b010, 0b100]);
    // 幅4に「1,1」は3通り（間は必ず1マス以上空く）
    expect(linePatterns([1, 1], 4).sort((a, b) => a - b)).toEqual([0b0101, 0b1001, 0b1010]);
  });

  it('ぴったり収まるヒントは1通り', () => {
    expect(linePatterns([2, 1], 4)).toEqual([0b1011]);
  });

  it('塗りなしは「すべて空白」の1通り', () => {
    expect(linePatterns([0], 5)).toEqual([0]);
    expect(linePatterns([], 5)).toEqual([0]);
  });
});

describe('countSolutions', () => {
  it('唯一解の問題は1を返す', () => {
    const { solution, size } = art('##.', '.#.', '#.#');
    expect(countSolutions(deriveHints(solution, size), size)).toBe(1);
  });

  it('複数解の問題は limit で打ち切る', () => {
    // 対角線だけの絵は、鏡写しの並びでも同じヒントになるため一意に決まらない
    const { solution, size } = art('#..', '.#.', '..#');
    expect(countSolutions(deriveHints(solution, size), size)).toBe(2);
    expect(countSolutions(deriveHints(solution, size), size, 5)).toBeGreaterThan(1);
  });

  it('行と列で塗るマスの数が食い違えば解なし', () => {
    expect(countSolutions({ rows: [[2], [0]], cols: [[1], [0]] }, 2)).toBe(0);
  });

  it('すべて空白の盤面も1通りとして数える', () => {
    expect(countSolutions({ rows: [[0], [0]], cols: [[0], [0]] }, 2)).toBe(1);
  });
});

describe('出題データ（puzzles.json）', () => {
  it('難易度ごとに10問ずつ、合わせて30問ある', () => {
    expect(PUZZLES).toHaveLength(30);
    for (const level of Object.keys(LEVELS) as Level[]) {
      expect(PUZZLES.filter((p) => p.level === level)).toHaveLength(10);
    }
  });

  it('IDが重複していない', () => {
    expect(new Set(PUZZLES.map((p) => p.id)).size).toBe(PUZZLES.length);
  });

  // これが「あとから問題を足す」運用の安全網。
  // 唯一解でない絵は当てずっぽうを強いる悪問になるので、必ずここで落とす
  it.each(PUZZLES.map((p) => [p.id, p] as const))('%s は唯一解で、形も正しい', (_id, puzzle) => {
    const { solution, hints } = loadPuzzle(puzzle);
    expect(LEVELS[puzzle.level].size).toBe(puzzle.size);
    expect(solution).toHaveLength(puzzle.size * puzzle.size);
    // 全マス空白・全マス塗りつぶしは絵にならない
    expect(solution.some((v) => v === 1)).toBe(true);
    expect(solution.some((v) => v === 0)).toBe(true);
    expect(countSolutions(hints, puzzle.size)).toBe(1);
  });

  it('答えを塗った盤面はクリア判定になる', () => {
    for (const puzzle of PUZZLES) {
      const { solution } = loadPuzzle(puzzle);
      expect(isSolved(filledBoard(solution), solution)).toBe(true);
    }
  });
});

describe('isSolved', () => {
  const { solution, size } = art('##.', '.#.', '#.#');

  it('空の盤面はクリアではない', () => {
    expect(isSolved(emptyBoard(size), solution)).toBe(false);
  });

  it('×印は「塗っていない」として扱う', () => {
    const board = paint(filledBoard(solution), [2, 3, 5], MARKED);
    expect(isSolved(board, solution)).toBe(true);
  });

  it('余計なマスを塗っているとクリアではない', () => {
    expect(isSolved(paint(filledBoard(solution), [2], FILLED), solution)).toBe(false);
  });
});

describe('satisfiedLines', () => {
  const { solution, size } = art('##.', '.#.', '#.#');
  const hints = deriveHints(solution, size);

  it('空の盤面では、もともと塗りのない行・列だけが満たされている', () => {
    // この絵に「塗りなし」の行・列は無い
    const done = satisfiedLines(emptyBoard(size), hints, size);
    expect(done.rows).toEqual([false, false, false]);
    expect(done.cols).toEqual([false, false, false]);
  });

  it('完成した盤面ではすべての行・列が満たされる', () => {
    const done = satisfiedLines(filledBoard(solution), hints, size);
    expect(done.rows).toEqual([true, true, true]);
    expect(done.cols).toEqual([true, true, true]);
  });

  it('数は合っていても位置が違えば満たされない', () => {
    // 1行目を「##.」ではなく「.##」に塗ると、行のヒント[2]は満たすが列は崩れる
    const board = paint(emptyBoard(size), [1, 2], FILLED);
    const done = satisfiedLines(board, hints, size);
    expect(done.rows[0]).toBe(true);
    expect(done.cols[0]).toBe(false);
  });
});

describe('cellsBetween', () => {
  it('横になぞれば同じ行のマスを返す', () => {
    expect(cellsBetween(10, 13, 5)).toEqual([10, 11, 12, 13]);
  });

  it('逆向きになぞっても始点から終点まで返す', () => {
    expect(cellsBetween(13, 10, 5)).toEqual([13, 12, 11, 10]);
  });

  it('縦になぞれば同じ列のマスを返す', () => {
    expect(cellsBetween(1, 16, 5)).toEqual([1, 6, 11, 16]);
  });

  it('斜めにぶれても動きの大きいほうの一直線に固定する', () => {
    // 3行下・1列右へ動かしたら縦の直線
    expect(cellsBetween(0, 16, 5)).toEqual([0, 5, 10, 15]);
    // 1行下・3列右へ動かしたら横の直線
    expect(cellsBetween(0, 8, 5)).toEqual([0, 1, 2, 3]);
  });

  it('同じマスなら1マスだけ', () => {
    expect(cellsBetween(7, 7, 5)).toEqual([7]);
  });
});

describe('paint / nextCell', () => {
  it('指定したマスだけを塗り替え、元の盤面は変えない', () => {
    const board = emptyBoard(3);
    const next = paint(board, [0, 4], FILLED);
    expect(next[0]).toBe(FILLED);
    expect(next[4]).toBe(FILLED);
    expect(next[1]).toBe(EMPTY);
    expect(board.every((c) => c === EMPTY)).toBe(true);
  });

  it('塗りモードは 塗り⇄未確定、×モードは ×⇄未確定 を往復する', () => {
    expect(nextCell(EMPTY, 'fill')).toBe(FILLED);
    expect(nextCell(FILLED, 'fill')).toBe(EMPTY);
    expect(nextCell(MARKED, 'fill')).toBe(FILLED);
    expect(nextCell(EMPTY, 'mark')).toBe(MARKED);
    expect(nextCell(MARKED, 'mark')).toBe(EMPTY);
    expect(nextCell(FILLED, 'mark')).toBe(MARKED);
  });
});

describe('unsolved / pickPuzzle', () => {
  const ids = (level: Level) => PUZZLES.filter((p) => p.level === level).map((p) => p.id);

  it('解いた問題を除いた、その難易度の問題を返す', () => {
    const solved = ids('easy').slice(0, 3);
    const rest = unsolved(PUZZLES, 'easy', solved);
    expect(rest).toHaveLength(7);
    expect(rest.every((p) => !solved.includes(p.id))).toBe(true);
  });

  it('解き切ったら、その難易度の全問に戻る', () => {
    expect(unsolved(PUZZLES, 'easy', ids('easy'))).toHaveLength(10);
  });

  it('未解答の問題から出す', () => {
    const solved = ids('normal').slice(0, 9);
    const picked = pickPuzzle(PUZZLES, 'normal', solved, () => 0.99);
    expect(picked?.id).toBe(ids('normal')[9]);
  });

  it('「次の問題」でいま出ている問題は引かない', () => {
    const current = ids('hard')[0];
    // 乱数が先頭を指しても、除外したぶんだけずれる
    expect(pickPuzzle(PUZZLES, 'hard', [], () => 0, current)?.id).not.toBe(current);
  });

  it('残り1問なら、それが今の問題でも出す（出題が止まらないように）', () => {
    const solved = ids('easy').slice(0, 9);
    const last = ids('easy')[9];
    expect(pickPuzzle(PUZZLES, 'easy', solved, () => 0, last)?.id).toBe(last);
  });
});
