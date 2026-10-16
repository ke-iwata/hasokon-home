import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@/lib/daily';
import { applyResult } from '@/lib/records';
import {
  analyze,
  assignColors,
  cellsOf,
  clearAll,
  clearResult,
  countSolutions,
  DAILY_GENERATOR_VERSION,
  DAILY_VARIANT,
  dailyPuzzle,
  EMPTY_BOARD,
  generate,
  generateFor,
  IDLE,
  isSatisfied,
  isSolved,
  MAX_ONES,
  maxAreaFor,
  MODE_ORDER,
  MODES,
  parseProgress,
  PROGRESS_KEY,
  readProgress,
  writeProgress,
  placeRect,
  pointerStep,
  previewRect,
  rectArea,
  rectFrom,
  rectsOverlap,
  rectsTouch,
  removeAt,
  restoreRects,
  sameRect,
  shareText,
  solve,
  undo,
  variantOf,
  violations,
  type BoardState,
  type InputEvent,
  type InputState,
  type Puzzle,
  type Rect,
} from '@/lib/shikaku-wake';

/**
 * 四角わけパズルのテスト。
 *
 * 仕様: docs/features/game-shikaku-wake.md の「テスト」
 */

const rect = (r0: number, c0: number, r1: number, c1: number): Rect => ({ r0, c0, r1, c1 });

/**
 * 手で作った 5×5（一意解）。
 *
 * ```
 * 5 . . . .     A A A A A
 * . . . . 6     B B C C C
 * 8 . . . .     B B C C C
 * . . . . .     B B D D D
 * . . 6 . .     B B D D D
 * ```
 */
const HAND: Pick<Puzzle, 'size' | 'clues'> = (() => {
  const clues = new Array<number>(25).fill(0);
  clues[0] = 5;
  clues[1 * 5 + 4] = 6;
  clues[2 * 5 + 0] = 8;
  clues[4 * 5 + 2] = 6;
  return { size: 5, clues };
})();
const HAND_ANSWER = [rect(0, 0, 0, 4), rect(1, 0, 4, 1), rect(1, 2, 2, 4), rect(3, 2, 4, 4)];

/** 対角線に 5 を並べた 5×5。行に分けても列に分けても解ける（別解あり） */
const DIAGONAL: Pick<Puzzle, 'size' | 'clues'> = (() => {
  const clues = new Array<number>(25).fill(0);
  for (let i = 0; i < 5; i++) clues[i * 5 + i] = 5;
  return { size: 5, clues };
})();

/** 区切りの不変条件：全マスをちょうど 1 回覆い、各四角に数字が 1 つでマス数どおり */
function checkPuzzle(p: Puzzle) {
  expect(isSolved(p, p.solution)).toBe(true);
  const clueCount = p.clues.filter((v) => v > 0).length;
  expect(p.solution).toHaveLength(clueCount);
  for (const r of p.solution) expect(rectArea(r)).toBeLessThanOrEqual(maxAreaFor(p.size));
  expect(p.clues.filter((v) => v === 1).length).toBeLessThanOrEqual(MAX_ONES);
}

describe('ルールの判定', () => {
  it('正しい区切りはクリア（並び順にはよらない）', () => {
    expect(isSolved(HAND, HAND_ANSWER)).toBe(true);
    expect(isSolved(HAND, HAND_ANSWER.slice().reverse())).toBe(true);
    expect(violations(HAND, HAND_ANSWER)).toEqual([]);
  });

  it('数字を 2 つ含む四角は不正', () => {
    const rects = [rect(0, 0, 2, 1), rect(0, 2, 0, 4), rect(1, 2, 2, 4), rect(3, 0, 4, 4)];
    expect(isSatisfied(HAND, rects[0])).toBe(false);
    expect(isSolved(HAND, rects)).toBe(false);
    expect(violations(HAND, rects)).toContain(0);
  });

  it('数字を含まない四角は不正', () => {
    const r = rect(3, 0, 4, 1);
    expect(isSatisfied(HAND, r)).toBe(false);
  });

  it('面積が数字と違う四角は不正', () => {
    const rects = [rect(0, 0, 0, 3), rect(1, 0, 4, 1), rect(1, 2, 2, 4), rect(3, 2, 4, 4)];
    expect(isSatisfied(HAND, rects[0])).toBe(false);
    expect(isSolved(HAND, rects)).toBe(false);
  });

  it('隙間が残ればクリアにならない（違反の印は付かない）', () => {
    const rects = HAND_ANSWER.slice(0, 3);
    expect(violations(HAND, rects)).toEqual([]);
    expect(isSolved(HAND, rects)).toBe(false);
  });

  it('盤からはみ出す四角は不正', () => {
    const rects = [rect(0, 0, 0, 5), ...HAND_ANSWER.slice(1)];
    expect(isSatisfied(HAND, rects[0])).toBe(false);
    expect(isSolved(HAND, rects)).toBe(false);
  });

  it('重なった四角はどちらも違反', () => {
    const rects = [...HAND_ANSWER, rect(0, 0, 0, 4)];
    expect(isSolved(HAND, rects)).toBe(false);
    expect(violations(HAND, rects)).toEqual([0, 4]);
  });
});

describe('ソルバー', () => {
  it('手で作った 5×5 は解が 1 つで、それが答え', () => {
    const r = solve(HAND, 5);
    expect(r.count).toBe(1);
    const sol = r.solutions[0];
    expect(HAND_ANSWER.every((a) => sol.some((s) => sameRect(a, s)))).toBe(true);
  });

  it('別解のある盤では 2 を返し、limit で打ち切る', () => {
    expect(countSolutions(DIAGONAL, 2)).toBe(2);
    expect(countSolutions(DIAGONAL, 1)).toBe(1);
    // 行に分けるか列に分けるかの 2 通りだけ
    expect(countSolutions(DIAGONAL, 100)).toBe(2);
  });

  it('一意解の盤の数字を 1 つ動かすと別解が出る', () => {
    // 5 を (0,0) (1,1) (2,2) (3,3) (4,0) に置くと、(4,0) の列は (0,0) を含むので横に分けるしかない（1 通り）。
    // (4,0) を (4,4) へ動かすと対角線になり、縦に分けても解ける
    const clues = new Array<number>(25).fill(0);
    for (const c of [0, 6, 12, 18, 20]) clues[c] = 5;
    expect(countSolutions({ size: 5, clues }, 2)).toBe(1);
    clues[20] = 0;
    clues[24] = 5;
    expect(countSolutions({ size: 5, clues }, 2)).toBe(2);
  });

  it('面積の合計が盤と合わなければ解は 0', () => {
    const clues = HAND.clues.slice();
    clues[0] = 4;
    expect(countSolutions({ size: 5, clues })).toBe(0);
    expect(analyze({ size: 5, clues }).solved).toBe(false);
  });

  it('推論は手で作った盤を解き切り、別解のある盤は解き切れない', () => {
    expect(analyze(HAND).solved).toBe(true);
    expect(analyze(DIAGONAL).solved).toBe(false);
  });
});

describe('生成', () => {
  const cases: [keyof typeof MODES, number][] = [
    ['easy', 100],
    ['normal', 100],
    ['hard', 30],
  ];
  for (const [mode, n] of cases) {
    it(`${MODES[mode].label}：固定の種 ${n} 件がすべて一意解・推論だけで解ける・数字の数と上限が範囲内`, () => {
      const def = MODES[mode];
      for (let seed = 1; seed <= n; seed++) {
        const { puzzle, analysis } = generateFor(mode, mulberry32(seed));
        expect(puzzle.size).toBe(def.size);
        checkPuzzle(puzzle);
        const clueCount = puzzle.clues.filter((v) => v > 0).length;
        expect(clueCount).toBeGreaterThanOrEqual(def.minClues);
        expect(clueCount).toBeLessThanOrEqual(def.maxClues);
        expect(countSolutions(puzzle, 2)).toBe(1);
        expect(analysis.solved).toBe(true);
        expect(analyze(puzzle).solved).toBe(true);
      }
    });
  }

  it('同じ種なら同じ盤（Math.random を使わない）', () => {
    const a = generateFor('normal', mulberry32(42)).puzzle;
    const b = generateFor('normal', mulberry32(42)).puzzle;
    expect(a).toEqual(b);
  });
});

describe('難易度', () => {
  it('かんたん < ふつう < むずかしい の点数の範囲が重ならない', () => {
    expect(MODES.easy.maxScore).toBeLessThan(MODES.normal.minScore);
    expect(MODES.normal.maxScore).toBeLessThan(MODES.hard.minScore);
    for (const m of MODE_ORDER) expect(MODES[m].minScore).toBeLessThanOrEqual(MODES[m].maxScore);
  });

  it('緩めずに返した盤の点数は、その段階の範囲に入る', () => {
    for (const mode of ['easy', 'normal', 'hard'] as const) {
      for (let seed = 1; seed <= 20; seed++) {
        const g = generateFor(mode, mulberry32(seed * 31));
        if (g.relaxed) continue;
        expect(g.analysis.score).toBeGreaterThanOrEqual(MODES[mode].minScore);
        expect(g.analysis.score).toBeLessThanOrEqual(MODES[mode].maxScore);
      }
    }
  });

  it('今日の1問はふつうと同じ大きさ・同じ範囲', () => {
    expect(MODES.daily.size).toBe(MODES.normal.size);
    expect(MODES.daily.minScore).toBe(MODES.normal.minScore);
    expect(MODES.daily.maxScore).toBe(MODES.normal.maxScore);
  });
});

describe('日替わり', () => {
  it('同じ日付なら同じ盤・日付が違えば違う盤', () => {
    expect(dailyPuzzle('2026-10-16')).toEqual(dailyPuzzle('2026-10-16'));
    expect(dailyPuzzle('2026-10-16').clues).not.toEqual(dailyPuzzle('2026-10-17').clues);
  });

  it('今日の1問も一意解・推論で解ける', () => {
    for (const key of ['2026-10-16', '2026-12-31', '2027-01-01', '2028-02-29']) {
      const p = dailyPuzzle(key);
      expect(p.size).toBe(MODES.daily.size);
      checkPuzzle(p);
      expect(countSolutions(p, 2)).toBe(1);
      expect(analyze(p).solved).toBe(true);
    }
  });

  it('試行の上限を 1 にしても一意解の盤が返る（難易度だけが緩む）', () => {
    // 範囲を誰も入れないほど高くして、必ず緩める道を通す
    const def = { ...MODES.normal, minScore: 100000, maxScore: 100001, maxAttempts: 1 };
    for (let seed = 1; seed <= 10; seed++) {
      const g = generate(def, mulberry32(seed));
      expect(g.relaxed).toBe(true);
      expect(g.attempts).toBe(1);
      checkPuzzle(g.puzzle);
      expect(countSolutions(g.puzzle, 2)).toBe(1);
      expect(g.analysis.solved).toBe(true);
    }
  });

  it('記録の区分は版つき（生成を変えたら記録も分かれる）', () => {
    expect(DAILY_VARIANT).toBe(`daily-v${DAILY_GENERATOR_VERSION}`);
    expect(variantOf('daily')).toBe(DAILY_VARIANT);
    expect(variantOf('easy')).toBe('easy');
    expect(variantOf('normal')).toBe('normal');
    expect(variantOf('hard')).toBe('hard');
  });
});

describe('操作の純関数', () => {
  const N = 5;
  const at = (r: number, c: number) => r * N + c;
  const place = (s: BoardState, a: [number, number], b: [number, number]) => placeRect(s, at(...a), at(...b), N);

  it('2 点を対角とする四角を引く（どちらの角から引いても同じ）', () => {
    const s = place(EMPTY_BOARD, [3, 4], [1, 2]);
    expect(s.rects).toEqual([rect(1, 2, 3, 4)]);
    expect(rectFrom(at(1, 2), at(3, 4), N)).toEqual(rect(1, 2, 3, 4));
  });

  it('重なった既存の四角を消して新しい方を置く（重ねたままにしない）', () => {
    let s = place(EMPTY_BOARD, [0, 0], [0, 1]);
    s = place(s, [2, 2], [2, 3]);
    s = place(s, [4, 4], [4, 4]);
    s = place(s, [0, 1], [2, 2]);
    expect(s.rects).toHaveLength(2);
    expect(s.rects).toContainEqual(rect(4, 4, 4, 4));
    expect(s.rects).toContainEqual(rect(0, 1, 2, 2));
    for (let i = 0; i < s.rects.length; i++)
      for (let j = i + 1; j < s.rects.length; j++) expect(rectsOverlap(s.rects[i], s.rects[j])).toBe(false);
  });

  it('同じマスを 2 回：四角の外なら 1×1、四角の中ならその四角を消す', () => {
    let s = place(EMPTY_BOARD, [2, 2], [2, 2]);
    expect(s.rects).toEqual([rect(2, 2, 2, 2)]);
    s = place(s, [0, 0], [1, 1]);
    s = place(s, [1, 0], [1, 0]);
    expect(s.rects).toEqual([rect(2, 2, 2, 2)]);
    expect(s.history[s.history.length - 1]).toEqual({ placed: null, removed: [rect(0, 0, 1, 1)] });
  });

  it('undo は 1 手ずつ戻る', () => {
    let s = place(EMPTY_BOARD, [0, 0], [0, 1]);
    s = place(s, [2, 0], [3, 0]);
    s = undo(s);
    expect(s.rects).toEqual([rect(0, 0, 0, 1)]);
    s = undo(s);
    expect(s).toEqual(EMPTY_BOARD);
    expect(undo(s)).toBe(s);
  });

  it('undo の置き換え：既存の 2 枚と重なる四角を置いて 1 回もどすと、消えた 2 枚が両方戻る', () => {
    let s = place(EMPTY_BOARD, [0, 0], [1, 1]);
    s = place(s, [0, 3], [1, 4]);
    const before = s.rects.slice();
    s = place(s, [1, 0], [1, 4]);
    expect(s.rects).toEqual([rect(1, 0, 1, 4)]);
    s = undo(s);
    expect(s.rects).toHaveLength(2);
    for (const r of before) expect(s.rects).toContainEqual(r);
  });

  it('「最初から」のあと undo 1 回で全部戻る', () => {
    let s = place(EMPTY_BOARD, [0, 0], [1, 1]);
    s = place(s, [3, 3], [4, 4]);
    s = place(s, [2, 2], [2, 2]);
    const before = s.rects.slice();
    s = clearAll(s);
    expect(s.rects).toEqual([]);
    s = undo(s);
    expect(s.rects).toHaveLength(3);
    for (const r of before) expect(s.rects).toContainEqual(r);
    expect(clearAll(EMPTY_BOARD)).toBe(EMPTY_BOARD);
  });

  it('Delete（removeAt）はカーソル下の四角を消し、1 手として戻せる', () => {
    let s = place(EMPTY_BOARD, [0, 0], [1, 1]);
    expect(removeAt(s, at(4, 4), N)).toBe(s);
    s = removeAt(s, at(1, 0), N);
    expect(s.rects).toEqual([]);
    s = undo(s);
    expect(s.rects).toEqual([rect(0, 0, 1, 1)]);
  });
});

describe('入力の状態表（pointerStep）', () => {
  const run = (start: InputState, events: InputEvent[]) => {
    let state = start;
    const places: { a: number; b: number }[] = [];
    for (const e of events) {
      const out = pointerStep(state, e);
      state = out.state;
      if (out.place) places.push(out.place);
    }
    return { state, places };
  };

  it('角なし：押すだけでは何もしない（起点を覚える）', () => {
    expect(pointerStep(IDLE, { type: 'down', cell: 3 })).toEqual({ state: { kind: 'pressIdle', origin: 3 }, place: null });
  });

  it('角なしから押して、動かさずに同じマスで離すと角を置く', () => {
    expect(run(IDLE, [{ type: 'down', cell: 3 }, { type: 'up', cell: 3 }])).toEqual({
      state: { kind: 'corner', a: 3 },
      places: [],
    });
  });

  it('角なしから押して、別のマスで離すとなぞり（X–Y の四角）', () => {
    expect(
      run(IDLE, [{ type: 'down', cell: 3 }, { type: 'move', cell: 8 }, { type: 'move', cell: 9 }, { type: 'up', cell: 9 }]),
    ).toEqual({ state: IDLE, places: [{ a: 3, b: 9 }] });
  });

  it('角なしから押して、盤の外で離す・pointercancel は何もしない', () => {
    expect(run(IDLE, [{ type: 'down', cell: 3 }, { type: 'up', cell: null }])).toEqual({ state: IDLE, places: [] });
    expect(run(IDLE, [{ type: 'down', cell: 3 }, { type: 'cancel' }])).toEqual({ state: IDLE, places: [] });
  });

  it('角ありで押すと「角ありから押している」になる（押したマスはどこでもよい）', () => {
    expect(pointerStep({ kind: 'corner', a: 3 }, { type: 'down', cell: 3 }).state).toEqual({ kind: 'pressCorner', a: 3 });
    expect(pointerStep({ kind: 'corner', a: 3 }, { type: 'down', cell: 20 }).state).toEqual({ kind: 'pressCorner', a: 3 });
  });

  it('角 A → B で押して動かす → C で離すと A–C の四角（B–C のなぞりにはならない）', () => {
    const A = 0;
    const B = 7;
    const C = 18;
    const r = run({ kind: 'corner', a: A }, [{ type: 'down', cell: B }, { type: 'move', cell: 12 }, { type: 'up', cell: C }]);
    expect(r).toEqual({ state: IDLE, places: [{ a: A, b: C }] });
  });

  it('2 点タップ：角と同じマスで離すと A–A（1×1／その四角を消す）', () => {
    expect(run({ kind: 'corner', a: 6 }, [{ type: 'down', cell: 6 }, { type: 'up', cell: 6 }])).toEqual({
      state: IDLE,
      places: [{ a: 6, b: 6 }],
    });
  });

  it('角ありから押して、盤の外で離す・pointercancel しても角は残る', () => {
    expect(run({ kind: 'corner', a: 6 }, [{ type: 'down', cell: 7 }, { type: 'up', cell: null }])).toEqual({
      state: { kind: 'corner', a: 6 },
      places: [],
    });
    expect(run({ kind: 'corner', a: 6 }, [{ type: 'down', cell: 7 }, { type: 'cancel' }])).toEqual({
      state: { kind: 'corner', a: 6 },
      places: [],
    });
  });

  it('角あり：盤の外・「やめる」・Esc で角を取り消す', () => {
    expect(pointerStep({ kind: 'corner', a: 6 }, { type: 'dismiss' })).toEqual({ state: IDLE, place: null });
  });

  it('キーボード：Space／Enter で角を置き、もう一度で確定', () => {
    expect(run(IDLE, [{ type: 'key', cell: 2 }])).toEqual({ state: { kind: 'corner', a: 2 }, places: [] });
    expect(run(IDLE, [{ type: 'key', cell: 2 }, { type: 'key', cell: 14 }])).toEqual({
      state: IDLE,
      places: [{ a: 2, b: 14 }],
    });
  });

  it('予定の四角：角があれば角と指の位置、なぞりなら起点と指の位置', () => {
    expect(previewRect(IDLE, 6, 5)).toBeNull();
    expect(previewRect({ kind: 'corner', a: 0 }, 6, 5)).toEqual(rect(0, 0, 1, 1));
    expect(previewRect({ kind: 'pressCorner', a: 24 }, 18, 5)).toEqual(rect(3, 3, 4, 4));
    expect(previewRect({ kind: 'pressIdle', origin: 4 }, 0, 5)).toEqual(rect(0, 0, 0, 4));
    expect(previewRect({ kind: 'corner', a: 0 }, null, 5)).toBeNull();
  });
});

describe('塗りの色', () => {
  it('隣り合う四角は同じ色にならない（生成した盤で）', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { solution } = generateFor('hard', mulberry32(seed)).puzzle;
      const colors = assignColors(solution);
      for (const c of colors) expect(c).toBeGreaterThanOrEqual(0);
      for (const c of colors) expect(c).toBeLessThan(6);
      for (let i = 0; i < solution.length; i++)
        for (let j = i + 1; j < solution.length; j++)
          if (rectsTouch(solution[i], solution[j])) expect(colors[i]).not.toBe(colors[j]);
    }
  });

  it('角だけで接するのは隣ではない', () => {
    expect(rectsTouch(rect(0, 0, 0, 0), rect(1, 1, 1, 1))).toBe(false);
    expect(rectsTouch(rect(0, 0, 0, 0), rect(0, 1, 0, 1))).toBe(true);
  });
});

describe('途中経過の保存', () => {
  it('壊れた値は空として読む', () => {
    expect(parseProgress(null)).toEqual({});
    expect(parseProgress('{')).toEqual({});
    expect(parseProgress('[]')).toEqual({});
    expect(parseProgress('{"easy":{"rects":[{"r0":"x"}]}}')).toEqual({});
  });

  it('保存した形を読み戻せる（答えは保存しない）', () => {
    const saved = { daily: { dateKey: '2026-10-16', rects: [rect(0, 0, 1, 1)] }, easy: { seed: 12, rects: [] } };
    expect(parseProgress(JSON.stringify(saved))).toEqual(saved);
  });

  it('段階ごとに書き、ほかの段階の保存は残す。null で消す', () => {
    const map = new Map<string, string>();
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
    writeProgress(storage, 'daily', { dateKey: '2026-10-16', rects: [rect(0, 0, 0, 1)] });
    writeProgress(storage, 'hard', { seed: 5, rects: [] });
    expect(readProgress(storage)).toEqual({
      daily: { dateKey: '2026-10-16', rects: [rect(0, 0, 0, 1)] },
      hard: { seed: 5, rects: [] },
    });
    writeProgress(storage, 'daily', null);
    expect(readProgress(storage)).toEqual({ hard: { seed: 5, rects: [] } });
    expect(map.has(PROGRESS_KEY)).toBe(true);
    // 保存先が無い・投げるときも落ちない
    expect(readProgress(null)).toEqual({});
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(readProgress(broken)).toEqual({});
    expect(() => writeProgress(broken, 'easy', { seed: 1, rects: [] })).not.toThrow();
  });

  it('盤に収まらない・重なる四角は戻さない', () => {
    expect(restoreRects([rect(0, 0, 1, 1), rect(1, 1, 2, 2), rect(4, 4, 5, 5), rect(3, 3, 3, 3)], 5)).toEqual([
      rect(0, 0, 1, 1),
      rect(3, 3, 3, 3),
    ]);
  });
});

describe('記録', () => {
  it('クリアの結果に moves が入らない（bestMoves が作られない）', () => {
    for (const mode of MODE_ORDER) {
      const result = clearResult(mode, 90_000, '2026-10-16');
      expect(result).not.toHaveProperty('moves');
      expect(result.outcome).toBe('win');
      const { entry } = applyResult({ plays: 1, wins: 0 } as never, result);
      expect(entry.bestMoves).toBeUndefined();
      expect(entry.bestTimeMs).toBe(90_000);
    }
  });

  it('今日の1問だけが連続日数の日付を渡す', () => {
    expect(clearResult('daily', 1000, '2026-10-16').clearedOn).toBe('2026-10-16');
    expect(clearResult('easy', 1000, '2026-10-16').clearedOn).toBeUndefined();
  });
});

describe('共有の文面', () => {
  it('盤の区切りを入れない（日付・大きさ・時間・連続日数・URL だけ）', () => {
    const p = dailyPuzzle('2026-10-16');
    const text = shareText({
      mode: 'daily',
      size: p.size,
      timeMs: 161_000,
      dateKey: '2026-10-16',
      streak: 3,
      url: 'https://hasokon.com/games/shikaku-wake/',
    });
    expect(text).toBe('四角わけパズル 今日の1問（2026-10-16・7×7）2:41 ／ 連続3日\nhttps://hasokon.com/games/shikaku-wake/');
    // 盤の数字の並びが入っていない
    expect(text).not.toMatch(/[■□▢🟥🟦]/u);
  });

  it('練習は段階名と大きさ', () => {
    expect(shareText({ mode: 'hard', size: 9, timeMs: 5_000, url: 'u' })).toBe('四角わけパズル むずかしい（9×9）0:05\nu');
  });
});

describe('速さ', () => {
  it('9×9 の生成 1 盤が閾値以内（実測の最大 約 26ms の 3 倍 ＋ 遅い CI の余裕）', () => {
    let worst = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const t = performance.now();
      generateFor('hard', mulberry32(seed));
      worst = Math.max(worst, performance.now() - t);
    }
    expect(worst).toBeLessThan(300);
  });
});

describe('道具', () => {
  it('cellsOf は四角のマスを行の順に返す', () => {
    expect(cellsOf(rect(1, 1, 2, 2), 5)).toEqual([6, 7, 11, 12]);
  });
});
