import { describe, expect, it } from 'vitest';
import {
  applyPlacement,
  canPlace,
  canPlaceAnywhere,
  CELL_POINT,
  clearLines,
  COMBO_POINT,
  deal,
  fullLines,
  gainFor,
  HAND_SIZE,
  idx,
  isGameOver,
  LINE_POINT,
  newBoard,
  normalize,
  PIECES,
  pickPiece,
  place,
  placementCells,
  rotate90,
  SIZE,
  type Board,
  type Piece,
} from '@/lib/block-puzzle';

/**
 * ブロックパズル（docs/features/game-block-puzzle.md）のロジックのテスト。
 *
 * 見張っているのは、遊べなくなる壊れ方（置けない場所に置ける／消えるべき行が
 * 消えない／置ける手が残っているのに終了になる）と、得点の配分。
 */

/** テスト用のピースを作る。`rows` の `#` が埋まるマス */
function pieceOf(rows: string[], color = 1): Piece {
  const cells: [number, number][] = [];
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (row[c] === '#') cells.push([r, c]);
  });
  return {
    id: 'test',
    cells,
    width: Math.max(...cells.map(([, c]) => c)) + 1,
    height: Math.max(...cells.map(([r]) => r)) + 1,
    color,
  };
}

const DOT = pieceOf(['#']);
const SQUARE2 = pieceOf(['##', '##']);
const LINE5 = pieceOf(['#####']);

/** 指定のマスだけ埋まった盤面 */
function boardWith(cells: number[]): Board {
  const b = newBoard();
  for (const i of cells) b[i] = 1;
  return b;
}

/** 行 r をまるごと埋める（`except` の列だけ空けておく） */
function fillRow(board: Board, r: number, except: number[] = []): Board {
  const next = [...board];
  for (let c = 0; c < SIZE; c++) if (!except.includes(c)) next[idx(r, c)] = 1;
  return next;
}

/** 列 c をまるごと埋める（`except` の行だけ空けておく） */
function fillCol(board: Board, c: number, except: number[] = []): Board {
  const next = [...board];
  for (let r = 0; r < SIZE; r++) if (!except.includes(r)) next[idx(r, c)] = 1;
  return next;
}

describe('盤面の基本', () => {
  it('8×8の空盤面から始まる', () => {
    const b = newBoard();
    expect(SIZE).toBe(8);
    expect(b).toHaveLength(64);
    expect(b.every((v) => v === 0)).toBe(true);
  });

  it('idx は 行×8+列', () => {
    expect(idx(0, 0)).toBe(0);
    expect(idx(3, 5)).toBe(29);
    expect(idx(7, 7)).toBe(63);
  });
});

describe('形の正規化と回転', () => {
  it('normalize は左上に寄せて並び順も揃える', () => {
    expect(normalize([[2, 3], [1, 3], [1, 4]])).toEqual([[0, 0], [0, 1], [1, 0]]);
  });

  it('rotate90 を4回で元に戻る', () => {
    const l = pieceOf(['#.', '#.', '##']).cells;
    expect(rotate90(rotate90(rotate90(rotate90(l))))).toEqual(normalize(l));
  });

  it('rotate90 は時計回り（縦のL字が横になる）', () => {
    // ##      ##
    // #.  →  .#   （左下の角が左上へ回る）
    expect(rotate90(pieceOf(['##', '#.']).cells)).toEqual(normalize(pieceOf(['##', '.#']).cells));
  });

  it('回転で同じになる形は候補に重複して入らない', () => {
    const keys = PIECES.map((p) => p.cells.map(([r, c]) => `${r},${c}`).join(' '));
    expect(new Set(keys).size).toBe(keys.length);
    // 1×1・2×2・3×3 は回してもひとつ
    expect(PIECES.filter((p) => p.width === 1 && p.height === 1)).toHaveLength(1);
    expect(PIECES.filter((p) => p.width === 2 && p.height === 2 && p.cells.length === 4)).toHaveLength(1);
  });

  it('候補はどれも1〜9マスで、盤面に収まる大きさ', () => {
    for (const p of PIECES) {
      expect(p.cells.length).toBeGreaterThanOrEqual(1);
      expect(p.cells.length).toBeLessThanOrEqual(9);
      expect(p.width).toBeLessThanOrEqual(SIZE);
      expect(p.height).toBeLessThanOrEqual(SIZE);
      // width / height は cells と食い違っていない
      expect(p.width).toBe(Math.max(...p.cells.map(([, c]) => c)) + 1);
      expect(p.height).toBe(Math.max(...p.cells.map(([r]) => r)) + 1);
    }
  });

  it('空の盤面にはどの候補も置ける（配られた瞬間に詰まない）', () => {
    for (const p of PIECES) expect(canPlaceAnywhere(newBoard(), p)).toBe(true);
  });
});

describe('配置の可否', () => {
  const empty = newBoard();

  it('空盤面には置ける', () => {
    expect(canPlace(empty, SQUARE2, 0, 0)).toBe(true);
    expect(canPlace(empty, SQUARE2, 6, 6)).toBe(true);
  });

  it('盤からはみ出す位置には置けない', () => {
    expect(canPlace(empty, SQUARE2, 7, 0)).toBe(false); // 下にはみ出す
    expect(canPlace(empty, SQUARE2, 0, 7)).toBe(false); // 右にはみ出す
    expect(canPlace(empty, LINE5, 0, 4)).toBe(false); // 5マスの横棒は列4から入らない
    expect(canPlace(empty, LINE5, 0, 3)).toBe(true);
  });

  it('負の位置は置けない（引き算で回り込ませない）', () => {
    expect(canPlace(empty, DOT, -1, 0)).toBe(false);
    expect(canPlace(empty, DOT, 0, -1)).toBe(false);
  });

  it('埋まっているマスと1マスでも重なったら置けない', () => {
    const b = boardWith([idx(1, 1)]);
    expect(canPlace(b, SQUARE2, 0, 0)).toBe(false);
    expect(canPlace(b, SQUARE2, 2, 2)).toBe(true);
  });

  it('凹んだ隙間にぴったり入る形は置ける', () => {
    // 行0の列1だけ空いていて、そこに1マスのピースが入る
    const b = fillRow(newBoard(), 0, [1]);
    expect(canPlace(b, DOT, 0, 1)).toBe(true);
    expect(canPlace(b, DOT, 0, 2)).toBe(false);
  });

  it('placementCells は埋まる盤面のindexを返す', () => {
    expect(placementCells(SQUARE2, 1, 2)).toEqual([idx(1, 2), idx(1, 3), idx(2, 2), idx(2, 3)]);
  });
});

describe('配置', () => {
  it('置いたマスに色が入り、元の盤面は変わらない', () => {
    const before = newBoard();
    const after = place(before, pieceOf(['##'], 3), 2, 2);
    expect(after[idx(2, 2)]).toBe(3);
    expect(after[idx(2, 3)]).toBe(3);
    expect(after.filter((v) => v !== 0)).toHaveLength(2);
    expect(before.every((v) => v === 0)).toBe(true);
  });

  it('置けない位置は投げる（黙って無視しない）', () => {
    expect(() => place(newBoard(), SQUARE2, 7, 7)).toThrow();
    expect(() => place(boardWith([idx(0, 0)]), DOT, 0, 0)).toThrow();
  });
});

describe('行・列の消去', () => {
  it('埋まった行を見つける', () => {
    const b = fillRow(newBoard(), 3);
    expect(fullLines(b)).toEqual({ rows: [3], cols: [] });
  });

  it('1マスでも空いていたら消えない', () => {
    const b = fillRow(newBoard(), 3, [5]);
    expect(fullLines(b)).toEqual({ rows: [], cols: [] });
  });

  it('埋まった列を見つける', () => {
    const b = fillCol(newBoard(), 6);
    expect(fullLines(b)).toEqual({ rows: [], cols: [6] });
  });

  it('行と列が同時に埋まったら両方消える', () => {
    let b = fillRow(newBoard(), 0, [0]);
    b = fillCol(b, 0);
    expect(fullLines(b)).toEqual({ rows: [0], cols: [0] });

    const cleared = clearLines(b, { rows: [0], cols: [0] });
    for (let c = 0; c < SIZE; c++) expect(cleared[idx(0, c)]).toBe(0);
    for (let r = 0; r < SIZE; r++) expect(cleared[idx(r, 0)]).toBe(0);
  });

  it('消えるのは揃った行・列だけで、他のマスは残る', () => {
    let b = fillRow(newBoard(), 4);
    b = [...b];
    b[idx(6, 6)] = 2;
    const cleared = clearLines(b, { rows: [4], cols: [] });
    for (let c = 0; c < SIZE; c++) expect(cleared[idx(4, c)]).toBe(0);
    expect(cleared[idx(6, 6)]).toBe(2);
  });
});

describe('得点', () => {
  it('置いただけならマス数ぶん', () => {
    expect(gainFor(4, 0, 0)).toBe(4 * CELL_POINT);
  });

  it('1本消しは基準点、まとめて消すほど1本あたりが上がる', () => {
    expect(gainFor(1, 1, 1)).toBe(1 + LINE_POINT); // 10
    expect(gainFor(1, 2, 1)).toBe(1 + LINE_POINT * 3); // 30
    expect(gainFor(1, 3, 1)).toBe(1 + LINE_POINT * 6); // 60
  });

  it('連続で消すと上乗せが付く（1手目は上乗せ無し）', () => {
    const first = gainFor(1, 1, 1);
    const second = gainFor(1, 1, 2);
    const third = gainFor(1, 1, 3);
    expect(second - first).toBe(COMBO_POINT);
    expect(third - second).toBe(COMBO_POINT);
  });

  it('消せなかった手には連続消しの上乗せが付かない', () => {
    expect(gainFor(3, 0, 0)).toBe(3);
  });
});

describe('1手ぶんの進行（applyPlacement）', () => {
  it('置いて揃えば消えて、得点が入る', () => {
    const b = fillRow(newBoard(), 0, [7]);
    const r = applyPlacement(b, DOT, 0, 7);
    expect(r.cleared).toBe(1);
    expect(r.clearedRows).toEqual([0]);
    expect(r.clearedCols).toEqual([]);
    expect(r.board.every((v) => v === 0)).toBe(true);
    expect(r.gained).toBe(gainFor(1, 1, 1));
    expect(r.combo).toBe(1);
  });

  it('揃わなければ盤面に残り、連続消しは0に戻る', () => {
    const r = applyPlacement(newBoard(), SQUARE2, 3, 3, 4);
    expect(r.cleared).toBe(0);
    expect(r.combo).toBe(0);
    expect(r.board.filter((v) => v !== 0)).toHaveLength(4);
    expect(r.gained).toBe(4 * CELL_POINT);
  });

  it('行と列を同時に埋めると2本ぶんの同時消しになる', () => {
    // 行0を列0以外、列0を行0以外まで埋めておき、交点(0,0)に1マス置く
    let b = fillRow(newBoard(), 0, [0]);
    b = fillCol(b, 0, [0]);
    const r = applyPlacement(b, DOT, 0, 0);
    expect(r.cleared).toBe(2);
    expect(r.clearedRows).toEqual([0]);
    expect(r.clearedCols).toEqual([0]);
    expect(r.gained).toBe(gainFor(1, 2, 1));
  });

  it('連続して消すと combo が積み上がる', () => {
    let board = fillRow(newBoard(), 0, [7]);
    board = fillRow(board, 1, [7]);
    let combo = 0;

    const first = applyPlacement(board, DOT, 0, 7, combo);
    expect(first.cleared).toBe(1);
    combo = first.combo;
    expect(combo).toBe(1);

    const second = applyPlacement(first.board, DOT, 1, 7, combo);
    expect(second.cleared).toBe(1);
    expect(second.combo).toBe(2);
    // 2手目のほうが連続消しの上乗せぶん高い
    expect(second.gained).toBeGreaterThan(first.gained);
  });
});

describe('終了判定', () => {
  it('空の盤面では終わらない', () => {
    expect(isGameOver(newBoard(), [SQUARE2, LINE5, DOT])).toBe(false);
  });

  it('手持ちのどれも置けなければ終了', () => {
    // 市松模様。1マスのピース以外はどこにも置けない
    const b = newBoard();
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) if ((r + c) % 2 === 0) b[idx(r, c)] = 1;
    }
    expect(canPlaceAnywhere(b, DOT)).toBe(true);
    expect(isGameOver(b, [SQUARE2, LINE5])).toBe(true);
    // 1つでも置ければ終了ではない
    expect(isGameOver(b, [SQUARE2, DOT])).toBe(false);
  });

  it('全部埋まったら1マスのピースも置けず終了', () => {
    const b = new Array<number>(SIZE * SIZE).fill(1);
    expect(isGameOver(b, [DOT])).toBe(true);
  });

  it('手持ちが空のときは終了ではない（次の3つが配られる）', () => {
    expect(isGameOver(new Array<number>(SIZE * SIZE).fill(1), [])).toBe(false);
  });
});

describe('配り札', () => {
  it('一度に3つ配る', () => {
    expect(deal(() => 0.5)).toHaveLength(HAND_SIZE);
  });

  it('同じ乱数なら同じピースになる（テストで固定できる）', () => {
    expect(pickPiece(() => 0).id).toBe(pickPiece(() => 0).id);
    expect(deal(() => 0.25).map((p) => p.id)).toEqual(deal(() => 0.25).map((p) => p.id));
  });

  it('乱数が 0〜1 のどこでも候補のどれかを返す', () => {
    for (let i = 0; i <= 20; i++) {
      const p = pickPiece(() => i / 20);
      expect(PIECES.some((q) => q.id === p.id)).toBe(true);
    }
  });

  it('十分に回せば候補が一通り出る（重み0で永久に出ない形が無い）', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(pickPiece(() => i / 2000).id);
    expect(seen.size).toBe(PIECES.length);
  });
});
