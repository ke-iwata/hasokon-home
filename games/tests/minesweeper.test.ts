import { describe, expect, it } from 'vitest';
import {
  chord,
  emptyState,
  isFresh,
  minesLeft,
  MS_LEVELS,
  neighbors,
  placeMines,
  reveal,
  toggleFlag,
  type MsState,
} from '@/lib/minesweeper';

/** テスト用: 地雷を指定位置に置いた小盤面を作る */
function boardWith(width: number, height: number, mineAt: number[]): MsState {
  const s: MsState = {
    width,
    height,
    mines: mineAt.length,
    cells: Array.from({ length: width * height }, (_, i) => ({
      mine: mineAt.includes(i),
      count: 0,
      revealed: false,
      flagged: false,
    })),
    status: 'playing',
    exploded: null,
  };
  for (let i = 0; i < s.cells.length; i += 1) {
    s.cells[i].count = neighbors(i, width, height).filter((n) => s.cells[n].mine).length;
  }
  return s;
}

describe('neighbors', () => {
  it('中央は8マス', () => {
    expect(neighbors(4, 3, 3).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
  });

  it('角は3マス', () => {
    expect(neighbors(0, 3, 3).sort((a, b) => a - b)).toEqual([1, 3, 4]);
  });

  it('辺は5マス', () => {
    expect(neighbors(1, 3, 3)).toHaveLength(5);
  });
});

describe('placeMines', () => {
  it('指定数の地雷が置かれ、countが正しい', () => {
    const s = placeMines(emptyState('easy'), 0, () => 0.5);
    expect(s.cells.filter((c) => c.mine)).toHaveLength(MS_LEVELS.easy.mines);
    for (let i = 0; i < s.cells.length; i += 1) {
      const expected = neighbors(i, s.width, s.height).filter((n) => s.cells[n].mine).length;
      expect(s.cells[i].count).toBe(expected);
    }
  });

  it('最初に開けるマスとその周囲には地雷が置かれない', () => {
    // 何度乱数を変えても安全域に地雷がないこと
    for (const seed of [0.1, 0.35, 0.7, 0.99]) {
      const s = placeMines(emptyState('easy'), 40, () => seed); // 40 = 中央付近
      const safe = new Set([40, ...neighbors(40, s.width, s.height)]);
      for (const i of safe) expect(s.cells[i].mine).toBe(false);
    }
  });

  it('isFresh は配置前だけ true', () => {
    const s = emptyState('easy');
    expect(isFresh(s)).toBe(true);
    expect(isFresh(placeMines(s, 0))).toBe(false);
  });
});

describe('reveal', () => {
  // 3x3、右下だけ地雷:
  //  0 0 0
  //  0 1 1
  //  0 1 *
  const base = () => boardWith(3, 3, [8]);

  it('count=0 のマスを開けると連鎖して開く', () => {
    const s = reveal(base(), 0); // 左上（count=0）
    // 地雷以外がすべて開いて勝利になる
    expect(s.cells[8].revealed).toBe(false);
    expect(s.cells.filter((c) => c.revealed)).toHaveLength(8);
    expect(s.status).toBe('won');
  });

  it('数字マスを開けてもそのマスだけ', () => {
    const s = reveal(base(), 4); // 中央（count=1）
    expect(s.cells.filter((c) => c.revealed)).toHaveLength(1);
    expect(s.status).toBe('playing');
  });

  it('地雷を踏むと負けて全地雷が表示される', () => {
    const s = reveal(base(), 8);
    expect(s.status).toBe('lost');
    expect(s.exploded).toBe(8);
    expect(s.cells[8].revealed).toBe(true);
  });

  it('旗の立ったマスは開かない', () => {
    const s = reveal(toggleFlag(base(), 8), 8);
    expect(s.status).toBe('playing');
    expect(s.cells[8].revealed).toBe(false);
  });

  it('終了後は何も起きない', () => {
    const lost = reveal(base(), 8);
    expect(reveal(lost, 0)).toBe(lost);
  });
});

describe('toggleFlag / minesLeft', () => {
  it('旗の上げ下げで残り地雷数が変わる', () => {
    let s = base3x3();
    expect(minesLeft(s)).toBe(1);
    s = toggleFlag(s, 0);
    expect(s.cells[0].flagged).toBe(true);
    expect(minesLeft(s)).toBe(0);
    s = toggleFlag(s, 0);
    expect(minesLeft(s)).toBe(1);
  });

  function base3x3() {
    return boardWith(3, 3, [8]);
  }

  it('開いたマスには旗を立てられない', () => {
    let s = base3x3();
    s = reveal(s, 4);
    expect(toggleFlag(s, 4).cells[4].flagged).toBe(false);
  });
});

describe('chord', () => {
  // 3x3、右下が地雷。中央(4)は count=1
  it('旗が数字と一致していれば周囲を一括で開ける', () => {
    let s = boardWith(3, 3, [8]);
    s = reveal(s, 4); // 中央を開く
    s = toggleFlag(s, 8); // 正しい位置に旗
    s = chord(s, 4);
    expect(s.status).toBe('won');
  });

  it('旗の位置が間違っていると地雷を踏む', () => {
    let s = boardWith(3, 3, [8]);
    s = reveal(s, 4);
    s = toggleFlag(s, 7); // 間違った位置に旗
    s = chord(s, 4);
    expect(s.status).toBe('lost');
  });

  it('旗の数が一致しなければ何もしない', () => {
    let s = boardWith(3, 3, [8]);
    s = reveal(s, 4);
    const after = chord(s, 4); // 旗0本 ≠ count1
    expect(after.cells.filter((c) => c.revealed)).toHaveLength(1);
  });
});

describe('実戦フロー', () => {
  it('初手 → 配置 → 開けるの流れで初手安全が成り立つ', () => {
    let s = emptyState('easy');
    const first = 40;
    s = placeMines(s, first, Math.random);
    s = reveal(s, first);
    expect(s.status).not.toBe('lost'); // 初手では絶対に負けない
    expect(s.cells[first].revealed).toBe(true);
  });
});
