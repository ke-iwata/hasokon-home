import { describe, expect, it } from 'vitest';
import {
  applyMove,
  canMove,
  clampDiscs,
  clearResult,
  DISC_COUNTS,
  firstMoveTarget,
  initialPegs,
  isPerfect,
  isSolved,
  MAX_DISCS,
  MIN_DISCS,
  minMoves,
  minMovesFrom,
  movesOf,
  nextOptimalMove,
  optimalSolution,
  pegFromKey,
  play,
  recordVariant,
  restart,
  startGame,
  tap,
  undo,
  type Peg,
  type Pegs,
} from '@/lib/hanoi';
import { applyResult, entryOf, recordResult, recordStart, type RecordStorage } from '@/lib/records';

/** 決まった種から 0〜1 を返す乱数（テストを毎回同じにする） */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** 合法手を k 手ランダムに打った局面 */
function randomPosition(n: number, k: number, random: () => number): Pegs {
  let pegs = initialPegs(n);
  for (let i = 0; i < k; i++) {
    const legal: [Peg, Peg][] = [];
    for (const from of [0, 1, 2] as Peg[]) {
      for (const to of [0, 1, 2] as Peg[]) if (canMove(pegs, from, to)) legal.push([from, to]);
    }
    const [from, to] = legal[Math.floor(random() * legal.length)];
    pegs = applyMove(pegs, from, to) as Pegs;
  }
  return pegs;
}

/** 幅優先探索で求めた最短手数（式の検算用。小さい n だけ） */
function bfsDistance(start: Pegs): number {
  const key = (p: Pegs) => p.map((s) => s.join(',')).join('|');
  const seen = new Set([key(start)]);
  let frontier: Pegs[] = [start];
  for (let depth = 0; frontier.length > 0; depth++) {
    const next: Pegs[] = [];
    for (const p of frontier) {
      if (isSolved(p)) return depth;
      for (const from of [0, 1, 2] as Peg[]) {
        for (const to of [0, 1, 2] as Peg[]) {
          const q = applyMove(p, from, to);
          if (q && !seen.has(key(q))) {
            seen.add(key(q));
            next.push(q);
          }
        }
      }
    }
    frontier = next;
  }
  return -1;
}

describe('始めの局面と枚数', () => {
  it('選べる枚数は 3〜8', () => {
    expect(DISC_COUNTS).toEqual([3, 4, 5, 6, 7, 8]);
    expect(MIN_DISCS).toBe(3);
    expect(MAX_DISCS).toBe(8);
  });

  it('枚数は範囲に丸める', () => {
    expect(clampDiscs(1)).toBe(3);
    expect(clampDiscs(12)).toBe(8);
    expect(clampDiscs(Number.NaN)).toBe(4);
  });

  it('左の柱に大きい順に重なっている', () => {
    expect(initialPegs(4)).toEqual([[4, 3, 2, 1], [], []]);
    expect(isSolved(initialPegs(4))).toBe(false);
  });

  it('最少手数は 2ⁿ−1（7・15・31・63・127・255）', () => {
    expect(DISC_COUNTS.map(minMoves)).toEqual([7, 15, 31, 63, 127, 255]);
  });
});

describe('合法手', () => {
  it('大きい円盤を小さい円盤の上に置く手は拒否される', () => {
    // 1 を中へ → 2 を中（1 の上）へは置けない
    const pegs = applyMove(initialPegs(3), 0, 1) as Pegs;
    expect(canMove(pegs, 0, 1)).toBe(false);
    expect(applyMove(pegs, 0, 1)).toBeNull();
    // 状態は変わらない
    const s = play(play(startGame(3), 0, 1), 0, 1);
    expect(movesOf(s)).toBe(1);
    expect(s.pegs).toEqual([[3, 2], [1], []]);
  });

  it('空の柱からは動かせない・同じ柱へは動かせない', () => {
    const pegs = initialPegs(3);
    expect(canMove(pegs, 1, 2)).toBe(false);
    expect(canMove(pegs, 0, 0)).toBe(false);
  });

  it('動かせるのはいちばん上の1枚だけ', () => {
    const pegs = applyMove(initialPegs(3), 0, 2) as Pegs;
    expect(pegs).toEqual([[3, 2], [], [1]]);
  });
});

describe('最短手順', () => {
  for (const n of DISC_COUNTS) {
    it(`${n}枚：長さが 2ⁿ−1 で、どの手も合法、最後が完成`, () => {
      const solution = optimalSolution(n);
      expect(solution).toHaveLength(minMoves(n));
      let pegs = initialPegs(n);
      for (const m of solution) {
        expect(isSolved(pegs)).toBe(false);
        const next = applyMove(pegs, m.from, m.to);
        expect(next, `${m.from}->${m.to}`).not.toBeNull();
        pegs = next as Pegs;
      }
      expect(isSolved(pegs)).toBe(true);
      expect(pegs[2]).toEqual(initialPegs(n)[0]);
    });
  }

  it('1手目の行き先は、枚数が奇数なら右・偶数なら中（FAQ の答え）', () => {
    for (const n of DISC_COUNTS) {
      expect(optimalSolution(n)[0]).toEqual({ from: 0, to: firstMoveTarget(n) });
      expect(nextOptimalMove(initialPegs(n))).toEqual({ from: 0, to: firstMoveTarget(n) });
    }
    expect(firstMoveTarget(3)).toBe(2);
    expect(firstMoveTarget(4)).toBe(1);
  });

  it('始めの局面からの最短手数は 2ⁿ−1、完成なら 0 で次の1手は無い', () => {
    for (const n of DISC_COUNTS) expect(minMovesFrom(initialPegs(n))).toBe(minMoves(n));
    const done: Pegs = [[], [], [3, 2, 1]];
    expect(minMovesFrom(done)).toBe(0);
    expect(nextOptimalMove(done)).toBeNull();
  });
});

describe('ヒント（任意の局面からの最短の次の1手）', () => {
  it('ランダムに 0〜200 手打った局面から次の1手を繰り返すと完成し、手数が式と一致する', () => {
    const random = rng(20261108);
    for (let trial = 0; trial < 120; trial++) {
      const n = DISC_COUNTS[trial % DISC_COUNTS.length];
      const k = Math.floor(random() * 201);
      let pegs = randomPosition(n, k, random);
      const expected = minMovesFrom(pegs);
      let steps = 0;
      while (!isSolved(pegs)) {
        const m = nextOptimalMove(pegs);
        expect(m).not.toBeNull();
        const next = applyMove(pegs, (m as { from: Peg }).from, (m as { to: Peg }).to);
        expect(next, '次の1手は必ず合法').not.toBeNull();
        pegs = next as Pegs;
        steps++;
        // 1手ごとに残りが1つずつ減る（最短であることの確認）
        expect(minMovesFrom(pegs)).toBe(expected - steps);
      }
      expect(steps).toBe(expected);
    }
  });

  it('最短手数の式は、総当たり（幅優先探索）の最短と一致する（3〜4枚）', () => {
    const random = rng(7);
    for (let trial = 0; trial < 40; trial++) {
      const n = trial % 2 === 0 ? 3 : 4;
      const pegs = randomPosition(n, Math.floor(random() * 60), random);
      expect(minMovesFrom(pegs)).toBe(bfsDistance(pegs));
    }
  });
});

describe('遊びの進行', () => {
  it('1手戻すを繰り返すと最初の局面に戻る', () => {
    const random = rng(3);
    let s = startGame(5);
    for (let i = 0; i < 50; i++) {
      const from = Math.floor(random() * 3) as Peg;
      const to = Math.floor(random() * 3) as Peg;
      s = play(s, from, to);
    }
    expect(movesOf(s)).toBeGreaterThan(0);
    while (movesOf(s) > 0) s = undo(s);
    expect(s.pegs).toEqual(initialPegs(5));
    // 手が無いときに戻しても何も起きない
    expect(undo(s)).toBe(s);
  });

  it('最初からで同じ枚数の始めの局面に戻る', () => {
    const s = play(startGame(6), 0, 1);
    const r = restart(s);
    expect(r.n).toBe(6);
    expect(r.pegs).toEqual(initialPegs(6));
    expect(movesOf(r)).toBe(0);
  });

  it('最短手順をそのまま打つと 2ⁿ−1 手で完成する', () => {
    let s = startGame(4);
    for (const m of optimalSolution(4)) s = play(s, m.from, m.to);
    expect(isSolved(s.pegs)).toBe(true);
    expect(movesOf(s)).toBe(15);
  });
});

describe('タップ2回', () => {
  const pegs = applyMove(initialPegs(3), 0, 1) as Pegs; // [[3,2],[1],[]]

  it('円盤のある柱を押すと持ち上げ、空の柱は何もしない', () => {
    expect(tap(pegs, null, 0)).toEqual({ selected: 0, move: null, rejected: null });
    expect(tap(pegs, null, 2)).toEqual({ selected: null, move: null, rejected: null });
  });

  it('同じ柱をもう一度押すと取り消し', () => {
    expect(tap(pegs, 0, 0)).toEqual({ selected: null, move: null, rejected: null });
  });

  it('置ける柱なら1手、置けない柱なら元に戻してその柱を縁取る', () => {
    expect(tap(pegs, 0, 2)).toEqual({ selected: null, move: { from: 0, to: 2 }, rejected: null });
    expect(tap(pegs, 0, 1)).toEqual({ selected: null, move: null, rejected: 1 });
  });

  it('キーボードの 1・2・3 が左・中・右', () => {
    expect(['1', '2', '3', '4', 'z'].map(pegFromKey)).toEqual([0, 1, 2, null, null]);
  });
});

describe('記録', () => {
  function memoryStorage(): RecordStorage {
    const data = new Map<string, string>();
    return {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
    };
  }

  it('variant は枚数ごとに分かれる（3〜8）', () => {
    expect(DISC_COUNTS.map(recordVariant)).toEqual(['3', '4', '5', '6', '7', '8']);
    const storage = memoryStorage();
    recordStart('hanoi', recordVariant(3), storage);
    recordResult('hanoi', clearResult({ moves: 7, timeMs: 5000, assisted: false }), recordVariant(3), storage);
    const { records } = recordResult(
      'hanoi',
      clearResult({ moves: 20, timeMs: 9000, assisted: false }),
      recordVariant(4),
      storage,
    );
    expect(entryOf(records, '3')).toMatchObject({ plays: 1, wins: 1, bestMoves: 7, bestTimeMs: 5000 });
    expect(entryOf(records, '4')).toMatchObject({ wins: 1, bestMoves: 20, bestTimeMs: 9000 });
  });

  it('ヒント・自動再生のあとの回は最少手数・最短時間を更新せず、クリア回数だけ数える', () => {
    const base = { plays: 2, wins: 1, bestMoves: 20, bestTimeMs: 60000 };
    const { entry, improved } = applyResult(base, clearResult({ moves: 15, timeMs: 1000, assisted: true }));
    expect(entry).toEqual({ plays: 2, wins: 2, bestMoves: 20, bestTimeMs: 60000 });
    expect(improved).toEqual({ time: false, score: false, moves: false });

    const fair = applyResult(base, clearResult({ moves: 15, timeMs: 1000, assisted: false }));
    expect(fair.entry).toMatchObject({ wins: 2, bestMoves: 15, bestTimeMs: 1000 });
  });

  it('「最少手数！」の印は bestMoves === 2ⁿ−1 で判定する', () => {
    expect(isPerfect(8, 255)).toBe(true);
    expect(isPerfect(8, 256)).toBe(false);
    expect(isPerfect(3, 7)).toBe(true);
    expect(isPerfect(3, undefined)).toBe(false);
  });
});
