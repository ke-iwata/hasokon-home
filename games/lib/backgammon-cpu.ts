/**
 * バックギャモンの CPU（純関数。画面からは Web Worker で呼ぶ）
 *
 * 仕様: docs/features/game-backgammon.md の「CPU」
 *
 * | 強さ | 考え方 |
 * |---|---|
 * | かんたん | 合法手から無作為。ただし「打てるブロットを打つ」「上げられる駒を上げる」だけは優先 |
 * | ふつう | 1手読み：合法手ごとの局面を評価関数で比べる |
 * | つよい | 2手読み：相手の 21 通りの目の期待値で比べる（expectimax）。1手読みの上位 8 手だけ読む |
 *
 * **評価関数は自前で書き、重みも自前で決めている**（他の作品のコード・重み・局面データは使わない）。
 * 見ているのは、ピップカウントの差・ブロットと打たれる目の数・作ったポイント・
 * プライム・バーの駒・上げた駒の数。
 */

import { seededRng } from './cards';
import {
  applyStep,
  BAR,
  CHECKERS,
  legalMoves,
  OFF,
  pipCount,
  type Checkers,
  type Move,
  type Step,
} from './backgammon';

export type Level = 'easy' | 'normal' | 'hard';

export const LEVELS: Record<Level, { label: string }> = {
  easy: { label: 'かんたん' },
  normal: { label: 'ふつう' },
  hard: { label: 'つよい' },
};

export interface CpuRequest {
  /** CPU の駒（CPU から見た番号） */
  me: Checkers;
  /** 相手の駒（相手から見た番号） */
  opp: Checkers;
  /** 振った2つの目 */
  dice: [number, number];
  level: Level;
  /** かんたんの無作為の種 */
  seed: number;
  /** つよいの思考時間の上限（ms）。超えたら残りの候補は1手読みの順のまま */
  budgetMs?: number;
}

/** 相手の 21 通りの目（ゾロ目 1/36・それ以外 2/36） */
export const ROLLS: { dice: [number, number]; p: number }[] = (() => {
  const out: { dice: [number, number]; p: number }[] = [];
  for (let a = 1; a <= 6; a++) {
    for (let b = a; b <= 6; b++) out.push({ dice: [a, b], p: a === b ? 1 / 36 : 2 / 36 });
  }
  return out;
})();

/** つよいが2手読みする候補の数 */
export const HARD_BREADTH = 8;
/** つよいの思考時間の上限（ms。cpu-speed.md の「1秒以内」） */
export const HARD_BUDGET_MS = 900;

// ---------------------------------------------------------------- 評価関数

/** 作ったポイントの値（自分から見た番号）。インナーボードと 7 ポイントを重く */
const POINT_VALUE = [0, 2, 3, 4, 5, 6, 6, 5, 3, 1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5, 2.5, 2.5, 2, 1.5, 1];

/** 自分の駒の相手から見た位置に、相手の駒（相手の番号 j）から届く距離を数える */
function opponentReaches(opp: Checkers): number[] {
  // 相手の駒が、自分の番号でいうとどこにいるか（相手のバーは自分の 0 の外側）
  const at: number[] = [];
  for (let j = 1; j <= 25; j++) if (opp[j] > 0) at.push(25 - j);
  return at;
}

/**
 * 自分のブロット t を相手が打てる目の組の数（36 通りのうち）。
 * 直接（1つの目）と間接（2つの目の和・ゾロ目の倍数）を数え、途中が相手にとって
 * 止まれない（自分の駒が2個以上）なら外す
 */
function shotsOn(t: number, oppAt: number[], me: Checkers): number {
  let count = 0;
  for (let a = 1; a <= 6; a++) {
    for (let b = 1; b <= 6; b++) {
      let hit = false;
      for (const q of oppAt) {
        const dist = t - q;
        if (dist <= 0) continue;
        if (a === b) {
          for (let k = 1; k <= 4 && !hit; k++) {
            if (a * k !== dist) continue;
            let ok = true;
            for (let m = 1; m < k; m++) if (me[q + a * m] >= 2) ok = false;
            if (ok) hit = true;
          }
        } else if (dist === a || dist === b) {
          hit = true;
        } else if (dist === a + b) {
          if (me[q + a] < 2 || me[q + b] < 2) hit = true;
        }
        if (hit) break;
      }
      if (hit) count++;
    }
  }
  return count;
}

/** 相手と接触しているか（まだすれ違っていない駒があるか） */
export function hasContact(me: Checkers, opp: Checkers): boolean {
  let myBack = 0;
  for (let i = 25; i >= 1; i--) {
    if (me[i] > 0) {
      myBack = i;
      break;
    }
  }
  let oppFront = 26;
  for (let j = 25; j >= 1; j--) {
    if (opp[j] > 0) {
      oppFront = 25 - j;
      break;
    }
  }
  return oppFront < myBack;
}

/** 片側の「形」の値（作ったポイント・プライム・重ねすぎ） */
function structure(c: Checkers): number {
  let v = 0;
  let run = 0;
  let bestRun = 0;
  for (let i = 1; i <= 24; i++) {
    if (c[i] >= 2) {
      v += POINT_VALUE[i];
      run++;
      if (run > bestRun) bestRun = run;
      if (c[i] > 3) v -= (c[i] - 3) * 0.6;
    } else {
      run = 0;
    }
  }
  if (bestRun >= 3) v += (bestRun - 2) * (bestRun - 2) * 2.5;
  return v;
}

/** インナーボードで作ったポイントの数 */
function homePoints(c: Checkers): number {
  let n = 0;
  for (let i = 1; i <= 6; i++) if (c[i] >= 2) n++;
  return n;
}

/**
 * 局面の値。**いま指し終えた側（me）から見て**大きいほど良い。次は相手の手番。
 */
export function evaluate(me: Checkers, opp: Checkers): number {
  if (me[OFF] === CHECKERS) return 1000;
  if (opp[OFF] === CHECKERS) return -1000;
  const myPip = pipCount(me);
  const oppPip = pipCount(opp);
  if (!hasContact(me, opp)) {
    // すれ違ったあとは競走。ピップの差と、上げた駒・インナーに入った駒
    return (oppPip - myPip) * 1.2 + (me[OFF] - opp[OFF]) * 0.5;
  }
  let v = (oppPip - myPip) * 1.0;
  v += structure(me) - structure(opp) * 0.8;
  // ブロット：打たれる目の数 × 打たれたときに失うもの
  const oppAt = opponentReaches(opp);
  let risk = 0;
  for (let t = 1; t <= 24; t++) {
    if (me[t] !== 1) continue;
    const shots = shotsOn(t, oppAt, me);
    if (shots === 0) continue;
    // 打たれるとバーに戻り 25 − t のピップを失う。相手のインナーが固いほど痛い
    risk += (shots / 36) * (25 - t + 6 + homePoints(opp) * 3);
  }
  v -= risk;
  // バーの駒。相手をバーに置いたままインナーを固めているほど良い
  v += opp[BAR] * (4 + homePoints(me) * 2.5);
  v -= me[BAR] * (4 + homePoints(opp) * 2.5);
  v += (me[OFF] - opp[OFF]) * 0.5;
  return v;
}

// ---------------------------------------------------------------- 読み

/** 1手読みの値で並べた合法手（良い順） */
export function rankMoves(me: Checkers, opp: Checkers, dice: [number, number]): { move: Move; value: number }[] {
  return legalMoves(me, opp, dice)
    .map((move) => ({ move, value: evaluate(move.me, move.opp) }))
    .sort((a, b) => b.value - a.value);
}

/**
 * 2手読み（expectimax）：相手の 21 通りの目それぞれで、相手が1手読みで最善を選んだ局面の
 * 値（自分から見た値）の期待値
 */
export function expectimax(me: Checkers, opp: Checkers): number {
  if (me[OFF] === CHECKERS) return 1000;
  let sum = 0;
  for (const r of ROLLS) {
    // 相手の手番：相手から見た [相手, 自分]
    const replies = legalMoves(opp, me, r.dice);
    let best = -Infinity;
    for (const m of replies) {
      const v = evaluate(m.me, m.opp);
      if (v > best) best = v;
    }
    sum += r.p * -best;
  }
  return sum;
}

function easyMove(moves: Move[], seed: number): Move {
  const rng = seededRng(seed);
  const eager = moves.filter((m) => m.steps.some((s) => s.hit || s.to === OFF));
  const pool = eager.length > 0 ? eager : moves;
  return pool[Math.floor(rng() * pool.length)];
}

/** CPU の手（1歩の並び）。使える手が無ければ空 */
export function chooseMove(req: CpuRequest): Step[] {
  const { me, opp, dice, level } = req;
  const moves = legalMoves(me, opp, dice);
  if (moves.length === 1) return moves[0].steps;
  if (level === 'easy') return easyMove(moves, req.seed).steps;
  const ranked = moves
    .map((move) => ({ move, value: evaluate(move.me, move.opp) }))
    .sort((a, b) => b.value - a.value);
  if (level === 'normal') return ranked[0].move.steps;

  const budget = req.budgetMs ?? HARD_BUDGET_MS;
  const started = Date.now();
  let best = ranked[0].move;
  let bestValue = -Infinity;
  for (const cand of ranked.slice(0, HARD_BREADTH)) {
    if (Date.now() - started > budget) break;
    const v = expectimax(cand.move.me, cand.move.opp);
    if (v > bestValue) {
      bestValue = v;
      best = cand.move;
    }
  }
  return best.steps;
}

/** テスト・自己対局用：手番まるごとの手を盤に当てる */
export function applySteps(me: Checkers, opp: Checkers, steps: Step[]): [Checkers, Checkers] {
  let m = me;
  let o = opp;
  for (const s of steps) [m, o] = applyStep(m, o, s);
  return [m, o];
}
