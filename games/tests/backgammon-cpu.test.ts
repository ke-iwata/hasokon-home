import { describe, expect, it } from 'vitest';
import {
  dieFromRng,
  initialCheckers,
  legalMoves,
  OFF,
  positionKey,
  type Checkers,
} from '@/lib/backgammon';
import { applySteps, chooseMove, evaluate, HARD_BUDGET_MS, type Level } from '@/lib/backgammon-cpu';
import { seededRng } from '@/lib/cards';

/**
 * バックギャモンの CPU のテスト（docs/features/game-backgammon.md の「テスト」）
 */

/** 無作為の自己対局で局面を集める（固定シード） */
function randomPositions(count: number, seed: number): { me: Checkers; opp: Checkers; dice: [number, number] }[] {
  const rng = seededRng(seed);
  const die = dieFromRng(rng);
  const out: { me: Checkers; opp: Checkers; dice: [number, number] }[] = [];
  while (out.length < count) {
    let pts: [Checkers, Checkers] = [initialCheckers(), initialCheckers()];
    let turn = 0;
    for (let ply = 0; ply < 200 && out.length < count; ply++) {
      const dice: [number, number] = [die(), die()];
      const me = pts[turn];
      const opp = pts[1 - turn];
      out.push({ me, opp, dice });
      const moves = legalMoves(me, opp, dice);
      const m = moves[Math.floor(rng() * moves.length)];
      pts = turn === 0 ? [m.me, m.opp] : [m.opp, m.me];
      if (m.me[OFF] === 15) break;
      turn = 1 - turn;
    }
  }
  return out;
}

/** 1局を最後まで指す。勝った側（0 か 1）を返す */
function playGame(levels: [Level, Level], seed: number): 0 | 1 {
  const rng = seededRng(seed);
  const die = dieFromRng(rng);
  let pts: [Checkers, Checkers] = [initialCheckers(), initialCheckers()];
  let turn: 0 | 1 = seed % 2 === 0 ? 0 : 1;
  for (let ply = 0; ply < 1000; ply++) {
    const dice: [number, number] = [die(), die()];
    const steps = chooseMove({
      me: pts[turn],
      opp: pts[1 - turn],
      dice,
      level: levels[turn],
      seed: Math.floor(rng() * 1e9),
      // 思考時間で手が変わらないように（再現できるように）上限を外す
      budgetMs: Infinity,
    });
    const [m, o] = applySteps(pts[turn], pts[1 - turn], steps);
    pts = turn === 0 ? [m, o] : [o, m];
    if (m[OFF] === 15) return turn;
    turn = turn === 0 ? 1 : 0;
  }
  throw new Error('終わらない');
}

describe('バックギャモンの CPU', () => {
  const positions = randomPositions(1000, 7);

  for (const level of ['easy', 'normal', 'hard'] as Level[]) {
    it(`${level}：どの局面でも合法手しか返さない（ランダム局面 1,000 個）`, () => {
      positions.forEach(({ me, opp, dice }, i) => {
        const legal = new Set(legalMoves(me, opp, dice).map((m) => positionKey(m.me, m.opp)));
        const steps = chooseMove({ me, opp, dice, level, seed: i });
        const [m, o] = applySteps(me, opp, steps);
        expect(legal.has(positionKey(m, o)), `局面 ${i}`).toBe(true);
      });
    }, 120_000);
  }

  it('つよいの1手は思考時間の上限内に返る', () => {
    let worst = 0;
    for (const { me, opp, dice } of positions.slice(0, 60)) {
      const t = performance.now();
      chooseMove({ me, opp, dice, level: 'hard', seed: 1 });
      worst = Math.max(worst, performance.now() - t);
    }
    expect(worst).toBeLessThan(HARD_BUDGET_MS + 100);
  }, 60_000);

  it('CPU の読みは同じ局面を2回評価しない（合法手に同じ局面が無い）', () => {
    for (const { me, opp, dice } of positions.slice(0, 300)) {
      const keys = legalMoves(me, opp, dice).map((m) => positionKey(m.me, m.opp));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('打たれる危険のあるブロットより、安全な形を高く見る', () => {
    // 初期配置から 3-1 で 5 ポイントを作る手（8→5・6→5）は、ブロットを2つ作る手（13→10・13→12）より良い
    const me = initialCheckers();
    const opp = initialCheckers();
    const make5 = applySteps(me, opp, [
      { from: 8, to: 5, die: 3, hit: false },
      { from: 6, to: 5, die: 1, hit: false },
    ]);
    const split = applySteps(me, opp, [
      { from: 13, to: 10, die: 3, hit: false },
      { from: 13, to: 12, die: 1, hit: false },
    ]);
    expect(evaluate(...make5)).toBeGreaterThan(evaluate(...split));
  });

  it('「つよい」が「かんたん」に 200 局で勝ち越す（固定シード）', () => {
    let hardWins = 0;
    for (let g = 0; g < 200; g++) {
      if (playGame(['hard', 'easy'], g + 1) === 0) hardWins++;
    }
    expect(hardWins).toBeGreaterThan(120);
  }, 300_000);
});
