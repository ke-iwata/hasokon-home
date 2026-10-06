import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@/lib/daily';
import {
  arrowCount,
  blockerOf,
  boardFrom,
  canEscape,
  cellLabel,
  dailyBoard,
  DIFFICULTIES,
  emptyBoard,
  escapable,
  generate,
  generateFor,
  hintCell,
  HEARTS,
  HINT_PENALTY_MS,
  isCleared,
  isFirstDailyPlay,
  isLost,
  measure,
  moveCursor,
  pathOf,
  readDailyPlayed,
  writeDailyPlayed,
  DAILY_PLAYED_KEY,
  placeArrows,
  removeArrow,
  shareText,
  solveOrder,
  startPlay,
  tapArrow,
  totalTimeMs,
  variantOf,
  violation,
  type Board,
  type Dir,
  type Level,
} from '@/lib/yajirushi-nuki';

/** 文字列から盤を作る（`.` は空き、`^ v < >` は矢印）。テストを読みやすくするため */
function parse(rows: string[]): Board {
  const size = rows.length;
  const map: Record<string, Dir | null> = { '.': null, '^': 'up', v: 'down', '<': 'left', '>': 'right' };
  return { size, cells: rows.join('').split('').map((ch) => map[ch]) };
}

describe('進路と抜けられるかどうか（canEscape）', () => {
  it('進路に矢印があると抜けられない', () => {
    const b = parse(['>.v', '...', '...']);
    expect(canEscape(b, 0)).toBe(false);
    expect(blockerOf(b, 0)).toBe(2);
  });

  it('進路に矢印が無ければ抜けられる（盤の内側から）', () => {
    const b = parse(['...', '.>.', 'v..']);
    expect(canEscape(b, 4)).toBe(true);
    expect(blockerOf(b, 4)).toBeNull();
  });

  it('盤の端で外を向いている矢印は抜けられる（進路の長さ 0）', () => {
    const b = parse(['^>.', '<..', '..>']);
    expect(pathOf(3, 0, 'up')).toEqual([]);
    expect(canEscape(b, 0)).toBe(true);
    expect(canEscape(b, 3)).toBe(true);
    expect(canEscape(b, 8)).toBe(true);
    // 右向きの (0,1) の先は空いている
    expect(canEscape(b, 1)).toBe(true);
  });

  it('空きマスは抜けられない', () => {
    expect(canEscape(emptyBoard(3), 4)).toBe(false);
  });

  it('進路は近い順に盤の端まで', () => {
    expect(pathOf(4, 5, 'right')).toEqual([6, 7]);
    expect(pathOf(4, 5, 'down')).toEqual([9, 13]);
    expect(pathOf(4, 5, 'left')).toEqual([4]);
    expect(pathOf(4, 5, 'up')).toEqual([1]);
  });
});

describe('タップ（tapArrow）', () => {
  it('ぶつかったら盤面は変わらずミスだけ 1 増える（ハートが 1 減る）', () => {
    const b = parse(['>.v', '...', '...']);
    const s0 = startPlay(b);
    const { state, outcome, blocker } = tapArrow(s0, 0);
    expect(outcome).toBe('blocked');
    expect(blocker).toBe(2);
    expect(state.board).toBe(b);
    expect(state.board.cells).toEqual(b.cells);
    expect(state.misses).toBe(1);
    expect(state.hearts).toBe(HEARTS - 1);
  });

  it('抜けられたら盤から消え、ミスは増えない', () => {
    const b = parse(['>.v', '...', '...']);
    const { state, outcome } = tapArrow(startPlay(b), 2);
    expect(outcome).toBe('escaped');
    expect(state.board.cells[2]).toBeNull();
    expect(state.misses).toBe(0);
    expect(arrowCount(state.board)).toBe(1);
  });

  it('空きマスのタップは何もしない', () => {
    const s0 = startPlay(parse(['>..', '...', '...']));
    const { state, outcome } = tapArrow(s0, 4);
    expect(outcome).toBe('ignored');
    expect(state).toBe(s0);
  });

  it(`ハートが ${HEARTS} 回のミスでなくなると負けで、以後のタップは効かない`, () => {
    let s = startPlay(parse(['>.v', '...', '...']));
    for (let i = 0; i < HEARTS; i++) s = tapArrow(s, 0).state;
    expect(isLost(s)).toBe(true);
    expect(s.misses).toBe(HEARTS);
    const after = tapArrow(s, 2);
    expect(after.outcome).toBe('ignored');
  });

  it('全部抜けたらクリア', () => {
    let s = startPlay(parse(['>.v', '...', '...']));
    s = tapArrow(s, 2).state;
    s = tapArrow(s, 0).state;
    expect(isCleared(s.board)).toBe(true);
    expect(isLost(s)).toBe(false);
  });
});

describe('単調性（設計の前提）', () => {
  it('1 本抜いたあとに、それまで抜けた矢印が抜けなくなることは無い', () => {
    for (let seed = 0; seed < 100; seed++) {
      const level: Level = (['easy', 'normal', 'hard'] as const)[seed % 3];
      let board = boardFrom(DIFFICULTIES[level].size, placeArrows(DIFFICULTIES[level].size, DIFFICULTIES[level].maxArrows, mulberry32(seed)));
      while (!isCleared(board)) {
        const before = escapable(board);
        expect(before.length).toBeGreaterThan(0);
        const removed = before[before.length - 1];
        board = removeArrow(board, removed);
        const after = new Set(escapable(board));
        for (const c of before) if (c !== removed) expect(after.has(c)).toBe(true);
      }
    }
  });
});

describe('生成', () => {
  it('置いた順のどこで切っても、逆順に抜けば全部抜ける', () => {
    const placements = placeArrows(7, 38, mulberry32(42));
    for (let n = 1; n <= placements.length; n++) {
      let b = boardFrom(7, placements, n);
      for (let i = n - 1; i >= 0; i--) {
        expect(canEscape(b, placements[i].cell)).toBe(true);
        b = removeArrow(b, placements[i].cell);
      }
      expect(isCleared(b)).toBe(true);
    }
  });

  it('generate(size) は大きさに合った難易度の盤を返す', () => {
    expect(generate(5, mulberry32(1)).size).toBe(5);
    expect(generate(7, mulberry32(1)).size).toBe(7);
    expect(generate(9, mulberry32(1)).size).toBe(9);
    expect(() => generate(6, mulberry32(1))).toThrow();
  });

  it('同じ種なら同じ盤', () => {
    expect(generateFor('hard', mulberry32(7)).board).toEqual(generateFor('hard', mulberry32(7)).board);
  });

  /**
   * 1,000 個の種で、`solveOrder`（貪欲に抜ける矢印を抜くだけ）で必ず全部抜けること・
   * 難しさの表の制約（本数・初手・途中の同時に抜ける本数）を満たさない割合が 5% 未満であること
   */
  for (const level of ['easy', 'normal', 'hard'] as const) {
    it(
      `${level}：1,000 個の種で必ず解け、表の制約を満たさない割合が 5% 未満`,
      () => {
        const d = DIFFICULTIES[level];
        let misses = 0;
        for (let seed = 0; seed < 1000; seed++) {
          const board = generate(d.size, mulberry32(seed * 2654435761));
          const order = solveOrder(board);
          expect(order.length).toBe(arrowCount(board));
          let b = board;
          for (const c of order) b = removeArrow(b, c);
          expect(isCleared(b)).toBe(true);
          if (violation(measure(board), d) > 0) misses++;
        }
        expect(misses / 1000).toBeLessThan(0.05);
      },
      120_000,
    );
  }

  it('measure は初手で抜ける本数と途中の最大を数える', () => {
    // 右端の列が上向きで縦に並び、左はそれぞれ右向き：初手で抜けるのは右上の 1 本だけ
    const b = parse(['>>^', '>>^', '>>^']);
    const m = measure(b);
    expect(m).toEqual({ arrows: 9, initial: 1, maxSimultaneous: 2, solvable: true });
    expect(violation(m, { size: 3, minArrows: 9, maxArrows: 9, maxInitial: 1, maxSimultaneous: 2 })).toBe(0);
    expect(violation(m, { size: 3, minArrows: 9, maxArrows: 9, maxInitial: 1, maxSimultaneous: 1 })).toBe(1);
  });

  it('解けない盤（向かい合わせ）は measure で solvable が false', () => {
    const b = parse(['><.', '...', '...']);
    expect(solveOrder(b)).toEqual([]);
    expect(measure(b).solvable).toBe(false);
  });
});

describe('今日の 1 面', () => {
  it('同じ日付・同じ VERSION で同じ盤（100 回生成して全件同じ）', () => {
    const first = dailyBoard('2026-10-04');
    for (let i = 0; i < 100; i++) expect(dailyBoard('2026-10-04')).toEqual(first);
  });

  it('ふつう 7×7 で、日付が変わると別の盤', () => {
    const a = dailyBoard('2026-10-04');
    expect(a.size).toBe(7);
    expect(dailyBoard('2026-10-05')).not.toEqual(a);
  });

  it('記録の区分は日替わりだけ版を持つ', () => {
    expect(variantOf('daily')).toBe('daily-v1');
    expect(variantOf('hard')).toBe('hard');
  });

  it('1 回目かどうか：保存値が今日なら 2 回目以降、無い・昨日・壊れた値は 1 回目', () => {
    expect(isFirstDailyPlay(null, '2026-10-04')).toBe(true);
    expect(isFirstDailyPlay('2026-10-03', '2026-10-04')).toBe(true);
    expect(isFirstDailyPlay('garbage', '2026-10-04')).toBe(true);
    expect(isFirstDailyPlay('2026-10-04', '2026-10-04')).toBe(false);
  });

  it('遊んだ日の読み書き：キーは 1 つだけで、読めない・書けない保存先でも落ちない', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    expect(readDailyPlayed(storage)).toBeNull();
    writeDailyPlayed(storage, '2026-10-04');
    writeDailyPlayed(storage, '2026-10-05');
    expect([...data.keys()]).toEqual([DAILY_PLAYED_KEY]);
    expect(readDailyPlayed(storage)).toBe('2026-10-05');
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readDailyPlayed(broken)).toBeNull();
    expect(() => writeDailyPlayed(broken, '2026-10-04')).not.toThrow();
    expect(readDailyPlayed(null)).toBeNull();
  });
});

describe('ヒント・タイム・読み上げ・共有', () => {
  it('ヒントはいま抜けられる矢印を指す', () => {
    const b = parse(['>.v', '...', '...']);
    for (let i = 0; i < 20; i++) expect(hintCell(b, mulberry32(i))).toBe(2);
    expect(hintCell(emptyBoard(3), mulberry32(0))).toBeNull();
  });

  it('ヒント 1 回につき +15 秒', () => {
    expect(HINT_PENALTY_MS).toBe(15_000);
    expect(totalTimeMs(10_000, 2)).toBe(40_000);
  });

  it('読み上げは位置と向きだけ（抜けられるかどうかは読まない）', () => {
    const b = parse(['>.v', '...', '...']);
    expect(cellLabel(b, 0)).toBe('1行1列、右向き');
    expect(cellLabel(b, 2)).toBe('1行3列、下向き');
    expect(cellLabel(b, 0)).not.toMatch(/抜け/);
  });

  it('カーソルは端で止まる', () => {
    expect(moveCursor(5, 0, 'up')).toBe(0);
    expect(moveCursor(5, 0, 'left')).toBe(0);
    expect(moveCursor(5, 0, 'right')).toBe(1);
    expect(moveCursor(5, 0, 'down')).toBe(5);
    expect(moveCursor(5, 24, 'down')).toBe(24);
  });

  it('共有文は「矢印ぬき 10/04 ミス 0・1:23」で、盤面を含めない', () => {
    const text = shareText({ mode: 'daily', misses: 0, timeMs: 83_000, dateKey: '2026-10-04', url: 'https://hasokon.com/games/yajirushi-nuki/' });
    expect(text).toBe('矢印ぬき 10/04 ミス 0・1:23\nhttps://hasokon.com/games/yajirushi-nuki/');
    expect(text).not.toMatch(/[<>^v]{2}|[↑↓←→]/);
    expect(shareText({ mode: 'hard', misses: 2, timeMs: 3_725_000, url: 'u' })).toBe('矢印ぬき むずかしい ミス 2・1:02:05\nu');
  });
});
