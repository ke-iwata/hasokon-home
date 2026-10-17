import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@/lib/daily';
import { applyResult } from '@/lib/records';
import {
  analyze,
  bandRect,
  clearAll,
  clearResult,
  componentCount,
  countSolutions,
  DAILY_GENERATOR_VERSION,
  DAILY_VARIANT,
  dailyPuzzle,
  edgeBetween,
  edgeLabel,
  edgesOf,
  emptyBoard,
  generate,
  generateFor,
  hitTest,
  HIT_MAX_PX,
  isSolved,
  islandAria,
  MODE_ORDER,
  MODES,
  parseProgress,
  PROGRESS_KEY,
  readProgress,
  restoreCounts,
  shareText,
  solve,
  tapIsland,
  toggleBridge,
  toggleEdge,
  undo,
  variantOf,
  violations,
  writeProgress,
  type HitRect,
  type Island,
  type Mode,
  type Puzzle,
  type PuzzleShape,
} from '@/lib/hashi-kake';

/**
 * 橋かけパズルのテスト。
 *
 * 仕様: docs/features/game-hashi-kake.md の「テスト」
 */

function shape(size: number, pts: [number, number, number][]): PuzzleShape {
  const islands: Island[] = pts.map(([r, c, n]) => ({ r, c, n }));
  return { size, islands, edges: edgesOf(size, islands) };
}

/** 帯ごとの本数を「島 a–島 b: 本数」で書く（帯の並び順に頼らない） */
function countsOf(p: PuzzleShape, bridges: [number, number, number][]): number[] {
  const counts = p.edges.map(() => 0);
  for (const [a, b, n] of bridges) {
    const k = edgeBetween(p, a, b);
    if (k < 0) throw new Error(`帯が無い: ${a}-${b}`);
    counts[k] = n;
  }
  return counts;
}

/**
 * 手で作った 7×7（一意解。段 1・2 だけで解ける）。
 *
 * ```
 * 2 . . 4 = = 3      島 0 1 2
 * ‖     ‖     |
 * 5 = = 5 . . 2      島 3 4 5
 * |     |     |
 * 1 . . 3 = = 3      島 6 7 8
 * ```
 */
const HAND = shape(7, [
  [0, 0, 2],
  [0, 3, 4],
  [0, 6, 3],
  [3, 0, 5],
  [3, 3, 5],
  [3, 6, 2],
  [6, 0, 1],
  [6, 3, 3],
  [6, 6, 3],
]);
const HAND_ANSWER = countsOf(HAND, [
  [0, 3, 2],
  [1, 2, 2],
  [1, 4, 2],
  [2, 5, 1],
  [3, 4, 2],
  [3, 6, 1],
  [4, 7, 1],
  [5, 8, 1],
  [7, 8, 2],
]);

/** 2×2 に島を置き、どれも 3。縦と横のどちらに 2 本を架けても解ける（別解あり） */
const SQUARE_33 = shape(7, [
  [1, 1, 3],
  [1, 4, 3],
  [4, 1, 3],
  [4, 4, 3],
]);

/** 同じ 2×2 で 4・3・3・2。左上の 4 から全部が決まる（一意解） */
const SQUARE_4332 = shape(7, [
  [1, 1, 4],
  [1, 4, 3],
  [4, 1, 3],
  [4, 4, 2],
]);

/** 縦の帯と横の帯が (2,2) で交わる盤（島はどれも 1） */
const CROSS = shape(5, [
  [0, 2, 1],
  [2, 0, 1],
  [2, 4, 1],
  [4, 2, 1],
]);

const rectsOverlap = (a: HitRect, b: HitRect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('ルールの判定', () => {
  it('手で作った盤の答えでクリア', () => {
    expect(isSolved(HAND, HAND_ANSWER)).toBe(true);
    expect(violations(HAND, HAND_ANSWER)).toEqual({ islands: [], edges: [] });
  });

  it('数字を超えた島は違反、足りない島はクリアにならない（違反の印は付けない）', () => {
    const over = HAND_ANSWER.slice();
    over[edgeBetween(HAND, 5, 8)] = 2; // 島 5（2）と島 8（3）が 1 本ずつ多い
    expect(isSolved(HAND, over)).toBe(false);
    expect(violations(HAND, over).islands).toEqual([5, 8]);

    const short = HAND_ANSWER.slice();
    short[edgeBetween(HAND, 7, 8)] = 1;
    expect(isSolved(HAND, short)).toBe(false);
    expect(violations(HAND, short).islands).toEqual([]);
  });

  it('交差している橋は違反（クリアにもならない）', () => {
    const counts = countsOf(CROSS, [
      [0, 3, 1],
      [1, 2, 1],
    ]);
    expect(violations(CROSS, counts).edges.sort()).toEqual([edgeBetween(CROSS, 0, 3), edgeBetween(CROSS, 1, 2)].sort());
    expect(isSolved(CROSS, counts)).toBe(false);
  });

  it('本数は合っているが 2 つに分かれる盤はクリアにならない', () => {
    const p = shape(5, [
      [0, 0, 1],
      [0, 3, 1],
      [3, 0, 1],
      [3, 3, 1],
    ]);
    const counts = countsOf(p, [
      [0, 1, 1],
      [2, 3, 1],
    ]);
    expect(violations(p, counts)).toEqual({ islands: [], edges: [] });
    expect(componentCount(p, counts)).toBe(2);
    expect(isSolved(p, counts)).toBe(false);
  });

  it('帯は間に島の無い縦横の隣どうしだけ（3 つ並んだ島の両端は帯にならない）', () => {
    const p = shape(7, [
      [0, 0, 1],
      [0, 3, 2],
      [0, 6, 1],
    ]);
    expect(p.edges.map((e) => [e.a, e.b])).toEqual([
      [0, 1],
      [1, 2],
    ]);
    expect(edgeBetween(p, 0, 2)).toBe(-1);
  });
});

describe('ソルバー', () => {
  it('手で作った 7×7 の一意解の盤で解が 1 つ（答えと同じ）', () => {
    const { count, solutions } = solve(HAND, 2);
    expect(count).toBe(1);
    expect(solutions[0]).toEqual(HAND_ANSWER);
  });

  it('別解のある盤で 2 を返す・数字を変えて一意にすると 1', () => {
    expect(countSolutions(SQUARE_33, 2)).toBe(2);
    expect(countSolutions(SQUARE_4332, 2)).toBe(1);
  });

  it('つながらない答えは解に数えない', () => {
    // 1 ばかりの 4 島は、2 本ずつの組に分かれるしかない → 解なし
    const p = shape(5, [
      [0, 0, 1],
      [0, 3, 1],
      [3, 0, 1],
      [3, 3, 1],
    ]);
    expect(countSolutions(p, 2)).toBe(0);
  });

  it('推論だけで解ける盤は analyze が解き切る・別解のある盤は解き切れない', () => {
    const hand = analyze(HAND);
    expect(hand.solved).toBe(true);
    expect(hand.maxLevel).toBeLessThanOrEqual(2);
    expect(analyze(SQUARE_33).solved).toBe(false);
  });

  it('連結の推理（段 4）：その本数にすると島の集まりが閉じて孤立するなら、その本数にしない', () => {
    // 1 — 2
    // |    |      左上 1 と左下 1 を結ぶと 2 島だけで閉じる → 左上 1 は右の 2 へ
    // 1 — 2
    const p = shape(7, [
      [0, 0, 1],
      [0, 3, 2],
      [3, 0, 1],
      [3, 3, 2],
    ]);
    expect(countSolutions(p, 2)).toBe(1);
    const a = analyze(p);
    expect(a.solved).toBe(true);
    expect(a.uses[4]).toBeGreaterThan(0);
    expect(solve(p, 1).solutions[0]).toEqual(
      countsOf(p, [
        [0, 1, 1],
        [1, 3, 1],
        [2, 3, 1],
      ]),
    );
  });
});

describe('生成', () => {
  const cases: { mode: Exclude<Mode, 'daily'>; n: number }[] = [
    { mode: 'easy', n: 100 },
    { mode: 'normal', n: 100 },
    { mode: 'hard', n: 30 },
  ];
  for (const { mode, n } of cases) {
    it(`${MODES[mode].label}（${MODES[mode].size}×${MODES[mode].size}）：固定の種 ${n} 件が全部、一意解・推論で解ける・島の数が範囲内・島が縦横に隣り合わない`, () => {
      const def = MODES[mode];
      for (let s = 1; s <= n; s++) {
        const { puzzle, analysis } = generateFor(mode, mulberry32(s * 7919 + 13));
        expect(puzzle.size).toBe(def.size);
        expect(countSolutions(puzzle, 2)).toBe(1);
        expect(analysis.solved).toBe(true);
        expect(isSolved(puzzle, puzzle.solution)).toBe(true);
        expect(puzzle.islands.length).toBeGreaterThanOrEqual(def.minIslands);
        expect(puzzle.islands.length).toBeLessThanOrEqual(def.maxIslands);
        for (const s1 of puzzle.islands) {
          expect(s1.n).toBeGreaterThanOrEqual(1);
          expect(s1.n).toBeLessThanOrEqual(8);
          for (const s2 of puzzle.islands) {
            const d = Math.abs(s1.r - s2.r) + Math.abs(s1.c - s2.c);
            expect(d === 1, `島 (${s1.r},${s1.c}) と (${s2.r},${s2.c}) が隣り合う（種 ${s}）`).toBe(false);
          }
        }
        // 帯には必ず空きマスが 1 つ以上ある（押せる長さが残る）
        for (const e of puzzle.edges) expect(e.cells.length).toBeGreaterThanOrEqual(1);
      }
    }, 120_000);
  }

  it('1 盤の生成は 300ms 以内（11×11 も）', () => {
    for (let s = 1; s <= 10; s++) {
      const t0 = performance.now();
      generateFor('hard', mulberry32(s));
      expect(performance.now() - t0).toBeLessThan(300);
    }
  });
});

describe('難易度', () => {
  it('かんたん < ふつう < むずかしい の点数の範囲が重ならない', () => {
    expect(MODES.easy.maxScore).toBeLessThan(MODES.normal.minScore);
    expect(MODES.normal.maxScore).toBeLessThan(MODES.hard.minScore);
    expect(MODES.daily).toMatchObject({ size: MODES.normal.size, minScore: MODES.normal.minScore, maxScore: MODES.normal.maxScore });
  });

  it('作った盤は段階の範囲に入る（かんたんは段 2 まで・ふつうは段 3 まで・むずかしいは段 4 を使う）', () => {
    for (let s = 1; s <= 30; s++) {
      for (const mode of ['easy', 'normal', 'hard'] as const) {
        const { analysis, relaxed } = generateFor(mode, mulberry32(s * 31 + 7));
        expect(relaxed, `${mode} 種 ${s}`).toBe(false);
        expect(analysis.score).toBeGreaterThanOrEqual(MODES[mode].minScore);
        expect(analysis.score).toBeLessThanOrEqual(MODES[mode].maxScore);
        expect(analysis.maxLevel).toBeLessThanOrEqual(MODES[mode].maxLevel);
        if (mode === 'hard') expect(analysis.uses[4]).toBeGreaterThan(0);
      }
    }
  }, 120_000);

  it('試行の上限を 1 にしても一意解・推論で解ける盤が返る（緩めるのは難易度だけ）', () => {
    for (let s = 1; s <= 20; s++) {
      const g = generate({ ...MODES.hard, maxAttempts: 1, minScore: 99999 }, mulberry32(s));
      expect(g.relaxed).toBe(true);
      expect(g.analysis.solved).toBe(true);
      expect(countSolutions(g.puzzle, 2)).toBe(1);
    }
  });
});

describe('日替わり', () => {
  it('同じ日付で同じ盤・日付が違えば違う盤', () => {
    const a = dailyPuzzle('2026-10-17');
    const b = dailyPuzzle('2026-10-17');
    const c = dailyPuzzle('2026-10-18');
    expect(a).toEqual(b);
    expect(JSON.stringify(a.islands)).not.toBe(JSON.stringify(c.islands));
    expect(a.size).toBe(MODES.daily.size);
    expect(countSolutions(a, 2)).toBe(1);
  });

  it('記録の区分は版つき', () => {
    expect(DAILY_VARIANT).toBe(`daily-v${DAILY_GENERATOR_VERSION}`);
    expect(variantOf('daily')).toBe('daily-v1');
    expect(MODE_ORDER.filter((m) => m !== 'daily').map(variantOf)).toEqual(['easy', 'normal', 'hard']);
  });
});

describe('操作の純関数', () => {
  it('toggleBridge が 0 → 1 → 2 → 0 と回る', () => {
    let s = emptyBoard(HAND);
    const k = edgeBetween(HAND, 0, 1);
    for (const want of [1, 2, 0, 1]) {
      s = toggleBridge(HAND, s, 0, 1).state;
      expect(s.counts[k]).toBe(want);
    }
    // 島の順を逆にしても同じ帯
    s = toggleBridge(HAND, s, 1, 0).state;
    expect(s.counts[k]).toBe(2);
  });

  it('帯の無い 2 島は変わらない', () => {
    const s = emptyBoard(HAND);
    expect(toggleBridge(HAND, s, 0, 8).state).toBe(s);
  });

  it('架けると交差する帯は変わらず、交差相手を返す', () => {
    const v = edgeBetween(CROSS, 0, 3);
    const h = edgeBetween(CROSS, 1, 2);
    const s1 = toggleEdge(CROSS, emptyBoard(CROSS), v).state;
    const r = toggleEdge(CROSS, s1, h);
    expect(r.state).toBe(s1);
    expect(r.blockedBy).toEqual([v]);
    // 既に架かっている帯の 1 → 2 → 0 は交差相手があっても妨げない（そもそも交差相手は 0 本）
    const s2 = toggleEdge(CROSS, s1, v).state;
    expect(s2.counts[v]).toBe(2);
  });

  it('undo が 1 手ずつ戻る・「最初から」も 1 手でもどせる', () => {
    let s = emptyBoard(HAND);
    s = toggleBridge(HAND, s, 0, 1).state;
    s = toggleBridge(HAND, s, 0, 1).state;
    s = toggleBridge(HAND, s, 3, 4).state;
    const before = s.counts.slice();
    s = clearAll(s);
    expect(s.counts.every((v) => v === 0)).toBe(true);
    s = undo(s);
    expect(s.counts).toEqual(before);
    s = undo(s);
    expect(s.counts[edgeBetween(HAND, 3, 4)]).toBe(0);
    expect(s.counts[edgeBetween(HAND, 0, 1)]).toBe(2);
    s = undo(undo(s));
    expect(s.counts.every((v) => v === 0)).toBe(true);
    expect(undo(s)).toBe(s);
    expect(clearAll(s)).toBe(s);
  });
});

describe('島の 2 回タップ', () => {
  const play = (taps: number[]) => {
    let selected: number | null = null;
    let state = emptyBoard(HAND);
    for (const t of taps) {
      const r = tapIsland(HAND, selected, t);
      selected = r.selected;
      if (r.toggle >= 0) state = toggleEdge(HAND, state, r.toggle).state;
    }
    return { selected, state };
  };

  it('A → B で A–B が 1 本（A は選ばれたまま）', () => {
    const { selected, state } = play([0, 1]);
    expect(state.counts[edgeBetween(HAND, 0, 1)]).toBe(1);
    expect(selected).toBe(0);
  });

  it('A → B → B で 2 本', () => {
    expect(play([0, 1, 1]).state.counts[edgeBetween(HAND, 0, 1)]).toBe(2);
  });

  it('A → C（帯でつながらない島）で選択が C に移り、本数は変わらない', () => {
    const { selected, state } = play([0, 8]);
    expect(selected).toBe(8);
    expect(state.counts.every((v) => v === 0)).toBe(true);
  });

  it('同じ島をもう一度で選択を外す', () => {
    expect(play([0, 0]).selected).toBeNull();
  });
});

describe('当たり判定（hitTest）', () => {
  const cellPx = 27;
  const at = (row: number, col: number, dx = 0.5, dy = 0.5) => ({ x: (col + dx) * cellPx, y: (row + dy) * cellPx });

  /** 11×11。3 行目と 4 行目に平行な横の帯（列 2〜4 で並ぶ） */
  const PARALLEL = shape(11, [
    [3, 0, 1],
    [3, 5, 1],
    [4, 1, 1],
    [4, 6, 1],
  ]);

  it('平行に隣り合う 2 本の帯の境目を押すと、近い方だけが返る', () => {
    const top = edgeBetween(PARALLEL, 0, 1);
    const bottom = edgeBetween(PARALLEL, 2, 3);
    const counts = PARALLEL.edges.map(() => 0);
    expect(hitTest(PARALLEL, counts, { x: 3.5 * cellPx, y: 4 * cellPx - 0.5 }, cellPx)).toEqual({ kind: 'edge', edge: top });
    expect(hitTest(PARALLEL, counts, { x: 3.5 * cellPx, y: 4 * cellPx + 0.5 }, cellPx)).toEqual({
      kind: 'edge',
      edge: bottom,
    });
    // 帯の太さは min(44, cellPx) なので、隣の帯の矩形とは重ならない
    expect(rectsOverlap(bandRect(PARALLEL, top, cellPx), bandRect(PARALLEL, bottom, cellPx))).toBe(false);
  });

  /** 横の帯（5 行目）と縦の帯（2 列目）が (5,2) で交わる */
  const X = shape(11, [
    [3, 2, 1],
    [5, 0, 1],
    [5, 4, 1],
    [7, 2, 1],
  ]);
  const h = edgeBetween(X, 1, 2);
  const v = edgeBetween(X, 0, 3);

  it('両方 0 本の交点では帯が返らない', () => {
    expect(hitTest(X, X.edges.map(() => 0), at(5, 2), cellPx)).toBeNull();
    // 交点でないマスでは、それぞれの帯が返る
    expect(hitTest(X, X.edges.map(() => 0), at(5, 1), cellPx)).toEqual({ kind: 'edge', edge: h });
    expect(hitTest(X, X.edges.map(() => 0), at(4, 2), cellPx)).toEqual({ kind: 'edge', edge: v });
  });

  it('片方が架かっている交点では、架かっている方が返る', () => {
    const counts = X.edges.map(() => 0);
    counts[h] = 1;
    expect(hitTest(X, counts, at(5, 2), cellPx)).toEqual({ kind: 'edge', edge: h });
    const counts2 = X.edges.map(() => 0);
    counts2[v] = 2;
    expect(hitTest(X, counts2, at(5, 2), cellPx)).toEqual({ kind: 'edge', edge: v });
  });

  it('島のマスの中は（隅でも）常に島が返る', () => {
    const counts = X.edges.map(() => 1);
    for (const [dx, dy] of [
      [0.01, 0.01],
      [0.5, 0.5],
      [0.99, 0.99],
    ]) {
      expect(hitTest(X, counts, at(5, 0, dx, dy), cellPx)).toEqual({ kind: 'island', island: 1 });
    }
  });

  it('盤の外・帯の無い空きマスは何も返さない', () => {
    const counts = X.edges.map(() => 0);
    expect(hitTest(X, counts, { x: -1, y: 10 }, cellPx)).toBeNull();
    expect(hitTest(X, counts, at(0, 10), cellPx)).toBeNull();
  });

  it('マスが大きい盤では帯の太さが 44px に抑えられ、外れた所は何も返さない', () => {
    const big = 60;
    const counts = X.edges.map(() => 0);
    expect(bandRect(X, h, big).h).toBe(HIT_MAX_PX);
    expect(hitTest(X, counts, { x: 1.5 * big, y: 5 * big + 2 }, big)).toBeNull();
    expect(hitTest(X, counts, { x: 1.5 * big, y: 5.5 * big }, big)).toEqual({ kind: 'edge', edge: h });
  });

  it('11×11・cellPx = 27 の生成盤で、平行な帯どうし・帯と島のマスが重ならない', () => {
    for (let s = 1; s <= 10; s++) {
      const { puzzle } = generateFor('hard', mulberry32(s * 101));
      const bands = puzzle.edges.map((_, k) => bandRect(puzzle, k, cellPx));
      const isles = puzzle.islands.map((i) => ({ x: i.c * cellPx, y: i.r * cellPx, w: cellPx, h: cellPx }));
      bands.forEach((a, i) => {
        bands.forEach((b, j) => {
          if (i >= j || puzzle.edges[i].horizontal !== puzzle.edges[j].horizontal) return;
          expect(rectsOverlap(a, b), `帯 ${i} と ${j}（種 ${s}）`).toBe(false);
        });
        isles.forEach((r) => expect(rectsOverlap(a, r)).toBe(false));
      });
    }
  });
});

describe('読み上げ', () => {
  it('帯は 2 島の位置と数字、いまの本数を読む', () => {
    expect(edgeLabel(HAND, edgeBetween(HAND, 0, 1), 1)).toBe('1行1列の島(2)と1行4列の島(4)の間、いま1本');
  });

  it('島は数字・本数・残り', () => {
    expect(islandAria({ r: 2, c: 1, n: 4 }, 3)).toBe('3行2列、数字4、橋3本、あと1本');
    expect(islandAria({ r: 0, c: 0, n: 2 }, 2)).toBe('1行1列、数字2、橋2本、ちょうど');
    expect(islandAria({ r: 0, c: 0, n: 2 }, 3)).toBe('1行1列、数字2、橋3本、1本多い');
  });
});

describe('途中経過の保存', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
  };

  it('段階ごとに書いて読める・null で消える・ほかの段階は残る', () => {
    const st = memory();
    writeProgress(st, 'daily', { dateKey: '2026-10-17', counts: [0, 1, 2] });
    writeProgress(st, 'easy', { seed: 42, counts: [1] });
    expect(readProgress(st)).toEqual({
      daily: { dateKey: '2026-10-17', counts: [0, 1, 2] },
      easy: { seed: 42, counts: [1] },
    });
    writeProgress(st, 'daily', null);
    expect(readProgress(st)).toEqual({ easy: { seed: 42, counts: [1] } });
    expect([...st.data.keys()]).toEqual([PROGRESS_KEY]);
  });

  it('壊れた値・範囲外の本数は捨てる', () => {
    expect(parseProgress('not json')).toEqual({});
    expect(parseProgress('null')).toEqual({});
    expect(parseProgress(JSON.stringify({ easy: { counts: [3] }, hard: { counts: [0, 1] } }))).toEqual({
      hard: { counts: [0, 1] },
    });
    expect(readProgress(null)).toEqual({});
  });

  it('戻すときは帯の数が合わなければ空・交差する橋は先の方だけ残す', () => {
    expect(restoreCounts(HAND, [1, 2])).toEqual(HAND.edges.map(() => 0));
    const v = edgeBetween(CROSS, 0, 3);
    const h = edgeBetween(CROSS, 1, 2);
    const saved = CROSS.edges.map(() => 1);
    const out = restoreCounts(CROSS, saved);
    expect(out[Math.min(v, h)]).toBe(1);
    expect(out[Math.max(v, h)]).toBe(0);
  });
});

describe('記録と共有', () => {
  it('今日の1問はクリア日を添えて連続日数を進める・moves は渡さない', () => {
    const r = clearResult('daily', 61_000, '2026-10-17');
    expect(r).toEqual({ outcome: 'win', timeMs: 61_000, clearedOn: '2026-10-17' });
    expect('moves' in clearResult('easy', 1000, '2026-10-17')).toBe(false);
    const { entry } = applyResult({ plays: 1, wins: 0 } as never, r);
    expect(entry.streak).toBe(1);
  });

  it('共有文に盤の橋（答え）を入れない', () => {
    const p: Puzzle = generateFor('easy', mulberry32(1)).puzzle;
    const text = shareText({ mode: 'daily', size: 9, timeMs: 161_000, dateKey: '2026-10-17', streak: 3, url: 'https://hasokon.com/games/hashi-kake/' });
    expect(text).toBe('橋かけパズル 今日の1問（2026-10-17・9×9）2:41 ／ 連続3日\nhttps://hasokon.com/games/hashi-kake/');
    expect(text).not.toMatch(/[=‖|─│]/);
    expect(text).not.toContain(JSON.stringify(p.solution));
    expect(shareText({ mode: 'hard', size: 11, timeMs: 5000, url: 'u' })).toBe('橋かけパズル むずかしい（11×11）0:05\nu');
  });
});
