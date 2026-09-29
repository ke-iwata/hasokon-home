import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@/lib/daily';
import {
  applyOp,
  closestValue,
  combine,
  DAILY_VARIANT,
  dailyPuzzles,
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  drawNumbers,
  generate,
  initialBoard,
  isExact,
  LARGE_NUMBERS,
  shareText,
  solutionFor,
  solve,
  starsFor,
  TARGET_MAX,
  TARGET_MIN,
  variantOf,
  VALUE_LIMIT,
  type Op,
} from '@/lib/target-keisan';

/**
 * ターゲット計算パズルのテスト。
 *
 * 仕様: docs/features/game-target-keisan.md の「テスト」
 */

/** 総当たり（再帰）。値 → 最小手数。途中値の上限は DP と同じにする */
function bruteForce(numbers: number[], limit = VALUE_LIMIT): Map<number, number> {
  const best = new Map<number, number>();
  const note = (v: number, ops: number) => {
    const cur = best.get(v);
    if (cur === undefined || ops < cur) best.set(v, ops);
  };
  const seen = new Set<string>();
  const rec = (items: { v: number; ops: number }[]) => {
    const key = items
      .map((x) => `${x.v}:${x.ops}`)
      .sort()
      .join(',');
    if (seen.has(key)) return;
    seen.add(key);
    for (const x of items) note(x.v, x.ops);
    for (let i = 0; i < items.length; i++) {
      for (let j = 0; j < items.length; j++) {
        if (i === j) continue;
        for (const op of ['+', '-', '*', '/'] as Op[]) {
          // 足し算・掛け算は向きを問わないので片方だけ
          if ((op === '+' || op === '*') && j < i) continue;
          const r = applyOp(items[i].v, op, items[j].v);
          if (r === null || r > limit) continue;
          const rest = items.filter((_, k) => k !== i && k !== j);
          rec([...rest, { v: r, ops: items[i].ops + items[j].ops + 1 }]);
        }
      }
    }
  };
  rec(numbers.filter((v) => v <= limit).map((v) => ({ v, ops: 0 })));
  return best;
}

describe('計算（途中結果は正の整数だけ）', () => {
  it('3 − 5 と 7 ÷ 2 は無効、8 ÷ 4 は有効', () => {
    expect(applyOp(3, '-', 5)).toBeNull();
    expect(applyOp(7, '/', 2)).toBeNull();
    expect(applyOp(8, '/', 4)).toBe(2);
  });

  it('引いて 0 になるのも無効', () => {
    expect(applyOp(5, '-', 5)).toBeNull();
  });

  it('足し算・掛け算はそのまま', () => {
    expect(applyOp(25, '+', 4)).toBe(29);
    expect(applyOp(25, '*', 4)).toBe(100);
  });
});

describe('部分集合 DP', () => {
  it('{1,2,3,4,5,6} で 720 は 4 手（6×5×4×3×2）、7 は 1 手', () => {
    const s = solve([1, 2, 3, 4, 5, 6]);
    expect(s.minSteps.get(720)).toBe(4);
    expect(s.minSteps.get(7)).toBe(1);
  });

  it('元の数は 0 手', () => {
    const s = solve([1, 2, 3, 4, 5, 6]);
    expect(s.minSteps.get(6)).toBe(0);
  });

  it('{25,50,75,100,3,6} で 340 は到達不能、101〜999 の到達不能は 68 個、997 は 4 手', () => {
    const s = solve([25, 50, 75, 100, 3, 6]);
    expect(s.minSteps.has(340)).toBe(false);
    let unreachable = 0;
    for (let t = TARGET_MIN; t <= TARGET_MAX; t++) if (!s.minSteps.has(t)) unreachable++;
    expect(unreachable).toBe(68);
    expect(s.minSteps.get(997)).toBe(4);
  });

  it('総当たり（再帰）と到達できる値・最小手数が一致する（固定シード 5 個）', () => {
    for (const seed of [1, 2, 3, 42, 20260929]) {
      const numbers = drawNumbers(mulberry32(seed));
      const dp = solve(numbers).minSteps;
      const bf = bruteForce(numbers);
      expect([...dp.keys()].sort((a, b) => a - b), `seed ${seed}`).toEqual([...bf.keys()].sort((a, b) => a - b));
      for (const [v, steps] of bf) expect(dp.get(v), `seed ${seed} / ${v}`).toBe(steps);
    }
  }, 60_000);

  it('解答例は元の数だけを 1 回ずつ使い、目標で終わる', () => {
    const numbers = [25, 50, 75, 100, 3, 6];
    const s = solve(numbers);
    const sol = solutionFor(s, 997);
    expect(sol).not.toBeNull();
    expect(sol).toHaveLength(4);
    // 解答例をそのまま盤で再生できる
    let board = initialBoard(numbers);
    for (const step of sol!) {
      const i = board.slots.findIndex((v) => v === step.a);
      const j = board.slots.findIndex((v, k) => v === step.b && k !== i);
      const next = combine(board, i, step.op, j);
      expect(next).not.toBeNull();
      board = next!;
    }
    expect(isExact(board, 997)).toBe(true);
  });

  it('作れない値の解答例は null', () => {
    expect(solutionFor(solve([25, 50, 75, 100, 3, 6]), 340)).toBeNull();
  });
});

describe('数の抽選', () => {
  it('小さい数 4 つ（1〜10、同じ数は 2 つまで）と大きい数 2 つ（重複なし）', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const ns = drawNumbers(rng);
      expect(ns).toHaveLength(6);
      const small = ns.slice(0, 4);
      const large = ns.slice(4);
      for (const v of small) expect(v >= 1 && v <= 10).toBe(true);
      for (const v of small) expect(small.filter((x) => x === v).length).toBeLessThanOrEqual(2);
      for (const v of large) expect(LARGE_NUMBERS).toContain(v);
      expect(new Set(large).size).toBe(2);
    }
  });
});

describe('生成', () => {
  it('100 回 × 3 難易度で、目標が到達可能・最小手数が難易度の範囲内', () => {
    const rng = mulberry32(12345);
    for (const d of DIFFICULTY_ORDER) {
      const { minSteps, maxSteps } = DIFFICULTIES[d];
      for (let i = 0; i < 100; i++) {
        const p = generate(d, rng);
        expect(p.target).toBeGreaterThanOrEqual(TARGET_MIN);
        expect(p.target).toBeLessThanOrEqual(TARGET_MAX);
        const steps = solve(p.numbers).minSteps.get(p.target);
        expect(steps).toBeDefined();
        expect(steps).toBe(p.minSteps);
        expect(steps!).toBeGreaterThanOrEqual(minSteps);
        expect(steps!).toBeLessThanOrEqual(maxSteps);
        expect(p.solution).toHaveLength(p.minSteps);
        expect(p.solution[p.solution.length - 1].result).toBe(p.target);
      }
    }
  }, 60_000);

  it('同じ日付キーからは同じ 3 問、日付が変われば違う', () => {
    const a = dailyPuzzles('2026-09-28');
    const b = dailyPuzzles('2026-09-28');
    const c = dailyPuzzles('2026-09-29');
    expect(a).toEqual(b);
    expect(a.map((p) => [p.numbers, p.target])).not.toEqual(c.map((p) => [p.numbers, p.target]));
  });

  it('今日の 3 問はやさしい・ふつう・むずかしいの順で、それぞれ別の 6 つの数', () => {
    const ps = dailyPuzzles('2026-09-28');
    expect(ps.map((p) => p.difficulty)).toEqual(['easy', 'normal', 'hard']);
    const sets = ps.map((p) => p.numbers.join(','));
    // 引き直しなので偶然の一致はありうるが、同じ数で目標だけ変えてはいない（生成を毎回引く）
    expect(new Set(sets).size).toBeGreaterThan(1);
  });

  it('生成 3 問で 500 ms 以内', () => {
    const started = performance.now();
    dailyPuzzles('2026-10-01');
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('記録の区分は日替わりだけ版つき', () => {
    expect(DAILY_VARIANT).toBe('daily-v1');
    expect(variantOf('daily')).toBe('daily-v1');
    expect(variantOf('hard')).toBe('hard');
  });
});

describe('盤面の操作', () => {
  it('2 つをつなぐと 2 つ目の場所に結果が残り、1 つ目は空く', () => {
    const b = combine(initialBoard([1, 2, 3, 4, 25, 100]), 4, '*', 3)!;
    expect(b.slots).toEqual([1, 2, 3, 100, null, 100]);
    expect(b.moves).toEqual([{ a: 25, op: '*', b: 4, result: 100 }]);
  });

  it('弾く計算・同じタイル・空いた枠は null', () => {
    const b0 = initialBoard([3, 5, 7, 2, 25, 100]);
    expect(combine(b0, 0, '-', 1)).toBeNull();
    expect(combine(b0, 2, '/', 3)).toBeNull();
    expect(combine(b0, 0, '+', 0)).toBeNull();
    const b1 = combine(b0, 0, '+', 1)!;
    expect(combine(b1, 0, '+', 2)).toBeNull();
  });

  it('いちばん近い数は盤面にある数（元の数と途中結果）から選ぶ', () => {
    const b0 = initialBoard([1, 2, 3, 4, 25, 100]);
    expect(closestValue(b0, 130)).toBe(100);
    const b1 = combine(b0, 4, '+', 5)!; // 125
    expect(closestValue(b1, 130)).toBe(125);
    expect(isExact(b1, 125)).toBe(true);
  });

  it('同じ差なら小さいほう', () => {
    expect(closestValue(initialBoard([90, 110]), 100)).toBe(90);
  });
});

describe('採点（★）', () => {
  it('ぴったり ★★★、差 1〜5 で ★★、6〜10 で ★、11 以上は無し', () => {
    expect(starsFor(0)).toBe(3);
    expect(starsFor(1)).toBe(2);
    expect(starsFor(-5)).toBe(2);
    expect(starsFor(6)).toBe(1);
    expect(starsFor(10)).toBe(1);
    expect(starsFor(11)).toBe(0);
  });
});

describe('結果コピー', () => {
  it('日付・★・連続日数・URL だけで、式は入れない', () => {
    const text = shareText({
      dateKey: '2026-09-28',
      stars: [3, 2, 3],
      streak: 4,
      url: 'https://hasokon.com/games/target-keisan/',
    });
    expect(text).toBe(
      'ターゲット計算パズル 今日の3問（2026-09-28）★★★ ★★☆ ★★★ ／ 連続4日\nhttps://hasokon.com/games/target-keisan/',
    );
    expect(text).not.toMatch(/[＋−×÷=＝]/);
  });

  it('連続 1 日のときは連続を書かない', () => {
    expect(shareText({ dateKey: '2026-09-28', stars: [0, 1, 3], streak: 1, url: 'u' })).toBe(
      'ターゲット計算パズル 今日の3問（2026-09-28）☆☆☆ ★☆☆ ★★★\nu',
    );
  });
});
