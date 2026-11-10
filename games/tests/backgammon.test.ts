import { describe, expect, it } from 'vitest';
import {
  BAR,
  canEndTurn,
  canUndo,
  cryptoDie,
  destinations,
  dieFromRng,
  endTurn,
  initialCheckers,
  legalMoves,
  newGame,
  nextSteps,
  OFF,
  openingRoll,
  pipCount,
  playStep,
  positionKey,
  REJECT_FROM,
  roll,
  stepsForDie,
  undoStep,
  winPoints,
  type BgState,
  type Checkers,
  type Die,
} from '@/lib/backgammon';
import { seededRng } from '@/lib/cards';

/**
 * バックギャモンのロジックのテスト（docs/features/game-backgammon.md の「テスト」）
 */

/** 駒の配置を作る（指定の無い場所は 0。番号はその側から見たもの） */
function mk(at: Record<number, number>): Checkers {
  const c = new Array<number>(26).fill(0);
  for (const [k, v] of Object.entries(at)) c[Number(k)] = v;
  return c;
}

/** 側 0 の手番で、決まった目を振った局面 */
function rolled(me: Checkers, opp: Checkers, dice: [number, number]): BgState {
  const seq = [...dice];
  let i = 0;
  const base: BgState = {
    pts: [me, opp],
    turn: 0,
    phase: 'roll',
    dice: null,
    opening: null,
    turnStart: null,
    played: [],
    required: 0,
    winner: null,
    points: 0,
  };
  return roll(base, () => seq[i++] as Die);
}

const fromTo = (s: { from: number; to: number }) => `${s.from}>${s.to}`;

describe('盤', () => {
  it('初期配置のピップカウントは両者 167', () => {
    const g = newGame(dieFromRng(seededRng(1)));
    expect(pipCount(g.pts[0])).toBe(167);
    expect(pipCount(g.pts[1])).toBe(167);
  });

  it('初期配置は 15 個', () => {
    expect(initialCheckers().reduce((a, b) => a + b, 0)).toBe(15);
  });
});

describe('合法手と目の使い方の決まり', () => {
  it('2つの目を両方使える局面で、片方しか使わない手は含まれない', () => {
    // 自分 13 と 24、目は 6-5。相手は 18 と 2 をふさぐ。
    // 13→8（5）を先に指すと 6 が使えなくなるので、それは選べない
    const me = mk({ 13: 1, 24: 1, [OFF]: 13 });
    const opp = mk({ [25 - 18]: 2, [25 - 2]: 2 });
    const state = rolled(me, opp, [6, 5]);
    expect(state.required).toBe(2);
    expect(stepsForDie(me, opp, 5).map(fromTo)).toContain('13>8');
    expect(nextSteps(state).map(fromTo)).not.toContain('13>8');
    for (const m of legalMoves(me, opp, [6, 5])) expect(m.steps).toHaveLength(2);
  });

  it('片方しか使えないなら、大きいほうが使えるときは大きいほうだけ', () => {
    // 自分 10 だけ。相手が 2 をふさぐので 6 と 2 は続けて使えない
    const me = mk({ 10: 1, [OFF]: 14 });
    const opp = mk({ [25 - 2]: 2 });
    const state = rolled(me, opp, [6, 2]);
    expect(state.required).toBe(1);
    expect(nextSteps(state).map((s) => s.die)).toEqual([6]);
    const moves = legalMoves(me, opp, [6, 2]);
    expect(moves).toHaveLength(1);
    expect(moves[0].steps[0].die).toBe(6);
  });

  it('大きいほうが使えなければ小さいほう', () => {
    const me = mk({ 10: 1, [OFF]: 14 });
    const opp = mk({ [25 - 4]: 2, [25 - 2]: 2 });
    const state = rolled(me, opp, [6, 2]);
    expect(state.required).toBe(1);
    expect(nextSteps(state).map(fromTo)).toEqual(['10>8']);
  });

  it('ゾロ目は4回使える', () => {
    const state = rolled(initialCheckers(), initialCheckers(), [6, 6]);
    expect(state.required).toBe(4);
    for (const m of legalMoves(initialCheckers(), initialCheckers(), [6, 6])) expect(m.steps).toHaveLength(4);
  });

  it('ゾロ目で途中までしか使えない局面', () => {
    // 13 の 1 個だけ。4 のゾロ目で 9 → 5 と進むが、1 がふさがっていて 3 回目が使えない
    const me = mk({ 13: 1, [OFF]: 14 });
    const opp = mk({ [25 - 1]: 2 });
    const state = rolled(me, opp, [4, 4]);
    expect(state.required).toBe(2);
    let s = playStep(state, nextSteps(state)[0]);
    s = playStep(s, nextSteps(s)[0]);
    expect(nextSteps(s)).toEqual([]);
    expect(canEndTurn(s)).toBe(true);
  });

  it('バーに駒があるとき、エンター以外の手は含まれない', () => {
    const me = initialCheckers();
    me[6]--;
    me[BAR] = 1;
    const opp = initialCheckers();
    const state = rolled(me, opp, [3, 1]);
    const first = nextSteps(state);
    expect(first.length).toBeGreaterThan(0);
    for (const s of first) expect(s.from).toBe(BAR);
    for (const m of legalMoves(me, opp, [3, 1])) expect(m.steps[0].from).toBe(BAR);
  });

  it('相手の駒が2個以上のポイントに止まる手は含まれない', () => {
    const me = initialCheckers();
    const opp = initialCheckers();
    for (const d of [1, 2, 3, 4, 5, 6]) {
      for (const s of stepsForDie(me, opp, d)) {
        if (s.to >= 1) expect(opp[25 - s.to]).toBeLessThan(2);
      }
    }
    // 24 から 5 の目：自分から見た 19 は相手の 6（5 個）なのでふさがっている
    expect(stepsForDie(me, opp, 5).map(fromTo)).not.toContain('24>19');
  });

  it('全駒がインナーボードに無いと上げられない', () => {
    const me = mk({ 7: 1, 5: 2, [OFF]: 12 });
    expect(stepsForDie(me, mk({}), 5).some((s) => s.to === OFF)).toBe(false);
  });

  it('目より大きいポイントに駒が無いときだけ、遠い駒を上げられる', () => {
    const me = mk({ 4: 1, 2: 1, [OFF]: 13 });
    const six = stepsForDie(me, mk({}), 6).filter((s) => s.to === OFF).map((s) => s.from);
    expect(six).toEqual([4]);
    const me2 = mk({ 5: 1, 3: 1, [OFF]: 13 });
    const five = stepsForDie(me2, mk({}), 5).filter((s) => s.to === OFF).map((s) => s.from);
    expect(five).toEqual([5]);
    // 4 の目：5 に駒があるので 3 からは上げられない（3→OFF は 4 が要るのでちょうどでもない）
    expect(stepsForDie(me2, mk({}), 4).filter((s) => s.to === OFF)).toEqual([]);
  });
});

describe('打つ・エンター', () => {
  it('打ったブロットはバーへ行き、相手のピップカウントが正しく増える', () => {
    const me = initialCheckers();
    // 相手のブロット：相手から見て 20（自分から見て 5）
    const opp = mk({ 20: 1, 6: 14 });
    const before = pipCount(opp);
    const state = rolled(me, opp, [1, 3]);
    const hit = nextSteps(state).find((s) => s.from === 6 && s.to === 5);
    expect(hit?.hit).toBe(true);
    const after = playStep(state, hit!);
    expect(after.pts[1][BAR]).toBe(1);
    expect(after.pts[1][20]).toBe(0);
    expect(pipCount(after.pts[1]) - before).toBe(25 - 20);
  });

  it('ベアオフ中に打たれたら、エンターしてインナーボードに戻すまで上げられない', () => {
    const me = mk({ [BAR]: 1, 3: 4, 2: 4, [OFF]: 6 });
    const opp = mk({ 24: 2, [OFF]: 13 });
    const state = rolled(me, opp, [6, 5]);
    const all = legalMoves(me, opp, [6, 5]);
    for (const m of all) for (const s of m.steps) expect(s.to).not.toBe(OFF);
    for (const s of nextSteps(state)) expect(s.to).not.toBe(OFF);
  });
});

describe('同じ局面になる手は1つにまとめる', () => {
  // 相手の駒は自分から見た 22 にだけ置き、24 の駒の行き先をふさがない
  const openOpp = () => mk({ [25 - 22]: 15 });

  it('6-1 の 24→18→17 と 24→23→17 は1つの合法手', () => {
    const me = initialCheckers();
    const opp = openOpp();
    const moves = legalMoves(me, opp, [6, 1]);
    const keys = moves.map((m) => positionKey(m.me, m.opp));
    expect(new Set(keys).size).toBe(keys.length);
    const to17 = moves.filter((m) => m.me[17] === 1 && m.me[24] === 1);
    expect(to17).toHaveLength(1);
  });

  it('候補の光らせ方でも行き先は重複しない（2つの目を合わせた行き先も1つ）', () => {
    const state = rolled(initialCheckers(), openOpp(), [6, 1]);
    const d = destinations(state, 24);
    expect([...d.keys()].sort((a, b) => a - b)).toEqual([17, 18, 23]);
    expect(d.get(17)).toHaveLength(2);
  });

  it('途中で止まれない合わせ技は候補に出ない', () => {
    // 24 から 6-5：18 も 19 もふさがっていれば 13 には届かない
    const opp = initialCheckers();
    opp[25 - 18] = 2;
    const state = rolled(initialCheckers(), opp, [6, 5]);
    expect(destinations(state, 24).has(13)).toBe(false);
  });
});

describe('1手戻す・手番を渡す', () => {
  it('振ったあとの手は何手でも戻せ、振った目は変わらない', () => {
    const start = rolled(initialCheckers(), initialCheckers(), [3, 1]);
    let s = playStep(start, nextSteps(start)[0]);
    s = playStep(s, nextSteps(s)[0]);
    expect(canEndTurn(s)).toBe(true);
    expect(canUndo(s)).toBe(true);
    s = undoStep(s);
    s = undoStep(s);
    expect(s.pts).toEqual(start.pts);
    expect(s.dice).toEqual([3, 1]);
    expect(s.played).toEqual([]);
    expect(canUndo(s)).toBe(false);
  });

  it('「確認してから渡す」では最後の1手も戻せる', () => {
    const start = rolled(initialCheckers(), initialCheckers(), [3, 1]);
    let s = playStep(start, nextSteps(start)[0], false);
    s = playStep(s, nextSteps(s)[0], false);
    expect(s.turn).toBe(0);
    expect(canUndo(s)).toBe(true);
    expect(endTurn(s).turn).toBe(1);
  });

  it('「自動で渡す」では最後の1手を置いた瞬間に手番が渡り、戻せない', () => {
    const start = rolled(initialCheckers(), initialCheckers(), [3, 1]);
    let s = playStep(start, nextSteps(start)[0], true);
    expect(s.turn).toBe(0);
    s = playStep(s, nextSteps(s)[0], true);
    expect(s.turn).toBe(1);
    expect(s.phase).toBe('roll');
    expect(canUndo(s)).toBe(false);
    expect(undoStep(s)).toBe(s);
  });

  it('目を使い切るまでは手番を終えられない', () => {
    const start = rolled(initialCheckers(), initialCheckers(), [3, 1]);
    expect(canEndTurn(start)).toBe(false);
    expect(endTurn(start)).toBe(start);
  });

  it('使える手が1つも無ければ、そのまま手番を終えられる（パス）', () => {
    const me = mk({ [BAR]: 1, 6: 14 });
    const opp = mk({ 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, [OFF]: 3 });
    const state = rolled(me, opp, [6, 5]);
    expect(state.required).toBe(0);
    expect(canEndTurn(state)).toBe(true);
    expect(endTurn(state).turn).toBe(1);
  });
});

describe('決着と点数', () => {
  it('相手が1個でも上げていれば 1 点', () => {
    expect(winPoints(mk({ [OFF]: 1, 20: 14 }))).toBe(1);
  });

  it('相手が1個も上げていなければギャモン（2点）', () => {
    expect(winPoints(mk({ 18: 15 }))).toBe(2);
    expect(winPoints(mk({ 7: 15 }))).toBe(2);
  });

  it('さらに相手の駒が勝者のインナーボードかバーに残ればバックギャモン（3点）', () => {
    expect(winPoints(mk({ 18: 14, 19: 1 }))).toBe(3);
    expect(winPoints(mk({ 1: 14, [BAR]: 1 }))).toBe(3);
  });

  it('15個目を上げた瞬間に決着する', () => {
    const me = mk({ 2: 1, [OFF]: 14 });
    const opp = mk({ 18: 15 });
    const state = rolled(me, opp, [2, 1]);
    const s = playStep(state, nextSteps(state).find((x) => x.to === OFF)!);
    expect(s.phase).toBe('done');
    expect(s.winner).toBe(0);
    expect(s.points).toBe(2);
  });
});

describe('先手決め', () => {
  it('同じ目なら振り直し、大きいほうが先手になる', () => {
    const seq: Die[] = [4, 4, 2, 5];
    let i = 0;
    const r = openingRoll(() => seq[i++]);
    expect(r.dice).toEqual([2, 5]);
    expect(r.first).toBe(1);
  });

  it('最初の「振る」は先手決めの2つの目を使う', () => {
    const seq: Die[] = [6, 1, 3, 3];
    let i = 0;
    const die = () => seq[i++];
    const g = newGame(die);
    expect(g.turn).toBe(0);
    const r = roll(g, die);
    expect(r.dice).toEqual([6, 1]);
    expect(r.opening).toBeNull();
  });
});

describe('サイコロ', () => {
  it('cryptoDie の 60,000 回の出目の偏りがカイ二乗検定の範囲内', () => {
    const counts = [0, 0, 0, 0, 0, 0];
    const n = 60000;
    for (let k = 0; k < n; k++) counts[cryptoDie() - 1]++;
    const e = n / 6;
    const chi = counts.reduce((a, c) => a + ((c - e) * (c - e)) / e, 0);
    // 自由度 5 の上側 0.1% 点は 20.52
    expect(chi).toBeLessThan(20.52);
  });

  it('棄却の境目（2³² − 4 以上）は引き直しになる', () => {
    expect(REJECT_FROM).toBe(2 ** 32 - 4);
    const xs = [2 ** 32 - 4, 2 ** 32 - 1, 2 ** 32 - 5];
    let used = 0;
    const v = cryptoDie(() => xs[used++]);
    expect(used).toBe(3);
    expect(v).toBe(((2 ** 32 - 5) % 6) + 1);
    // 境目のすぐ下は受け入れる
    let used2 = 0;
    cryptoDie(() => {
      used2++;
      return 2 ** 32 - 5;
    });
    expect(used2).toBe(1);
  });

  it('dieFromRng(seededRng) で同じ出目の列が再現できる', () => {
    const a = dieFromRng(seededRng(42));
    const b = dieFromRng(seededRng(42));
    const xs = Array.from({ length: 50 }, () => a());
    const ys = Array.from({ length: 50 }, () => b());
    expect(xs).toEqual(ys);
    for (const x of xs) expect(x >= 1 && x <= 6).toBe(true);
  });
});
