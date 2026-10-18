import { describe, expect, it } from 'vitest';
import { seededRng, type Card, type Rank, type Suit } from '@/lib/cards';
import { applyResult, applyStart, type RecordEntry } from '@/lib/records';
import {
  afterReveal,
  call,
  cpuChoosePlay,
  cpuDecideCall,
  deal,
  eligibleCallers,
  firstCaller,
  handLayout,
  hypergeomAtLeast,
  isFinished,
  nextRank,
  pass,
  pickOfRank,
  play,
  publicView,
  resultFor,
  splitRows,
  truthProbability,
  visiblePerCard,
  type DoubtState,
  type Level,
  type PublicView,
} from '@/lib/doubt';

/**
 * ダウトのテスト。仕様: docs/features/game-doubt.md「テスト」
 */

let nextId = 9000;
function c(rank: Rank, suit: Suit = 'spade'): Card {
  nextId += 1;
  return { suit, rank, faceUp: true, id: nextId };
}

/** 手札を指定して局面を作る。席 0 から rank の宣言 */
function stateOf(hands: Card[][], rank: Rank = 1, turn = 0, extra: Partial<DoubtState> = {}): DoubtState {
  return {
    ...deal(seededRng(1)),
    hands,
    rank,
    turn,
    ...extra,
  };
}

/** 52 枚がどこかに 1 枚ずつあること（手札＋場札） */
function allCards(s: DoubtState): number[] {
  return [...s.hands.flat(), ...s.pile].map((x) => x.id).sort((a, b) => a - b);
}

describe('配り', () => {
  it('13 枚ずつ、52 枚が重複なく配られる', () => {
    const s = deal(seededRng(42));
    expect(s.hands.map((h) => h.length)).toEqual([13, 13, 13, 13]);
    const ids = s.hands.flat().map((x) => x.id);
    expect(new Set(ids).size).toBe(52);
    expect(s.rank).toBe(1);
    expect(s.phase).toBe('play');
  });

  it('同じ種なら同じ配り', () => {
    expect(deal(seededRng(7)).hands).toEqual(deal(seededRng(7)).hands);
  });
});

describe('宣言の進行', () => {
  it('A → … → K → A', () => {
    const seq: Rank[] = [];
    let r: Rank = 1;
    for (let i = 0; i < 14; i += 1) {
      seq.push(r);
      r = nextRank(r);
    }
    expect(seq).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1]);
  });

  it('誰も言わなければ場札は積まれたまま次の人・次の数へ', () => {
    const s0 = deal(seededRng(3));
    const s1 = play(s0, 0, [s0.hands[0][0]]);
    expect(s1.phase).toBe('calling');
    const s2 = pass(s1);
    expect(s2.turn).toBe(1);
    expect(s2.rank).toBe(2);
    expect(s2.pile).toHaveLength(1);
    expect(allCards(s2)).toEqual(allCards(s0));
  });

  it('引き取りのあとも宣言の数は進む', () => {
    const s0 = stateOf([[c(5), c(9)], [c(2)], [c(3)], [c(4)]], 1, 0);
    const s1 = play(s0, 0, [s0.hands[0][0]]); // A と言って 5（ウソ）
    const s2 = afterReveal(call(s1, 1));
    expect(s2.rank).toBe(2);
    expect(s2.turn).toBe(1);
  });

  it('1〜4 枚の範囲外・持っていない札・手番でない人は出せない', () => {
    const s0 = deal(seededRng(5));
    expect(play(s0, 0, [])).toBe(s0);
    expect(play(s0, 0, s0.hands[0].slice(0, 5))).toBe(s0);
    expect(play(s0, 0, [s0.hands[1][0]])).toBe(s0);
    expect(play(s0, 1, [s0.hands[1][0]])).toBe(s0);
  });
});

describe('ダウトの判定', () => {
  it('全部正直 → 言った人が場札を全部引き取る', () => {
    const s0 = stateOf([[c(1), c(1, 'heart'), c(9)], [c(2)], [c(3)], [c(4)]], 1, 0, { pile: [c(8), c(10)] });
    const s1 = play(s0, 0, s0.hands[0].slice(0, 2));
    const s2 = call(s1, 2);
    expect(s2.phase).toBe('reveal');
    expect(s2.reveal).toMatchObject({ truthful: true, taker: 2, caller: 2, taken: 4 });
    const s3 = afterReveal(s2);
    expect(s3.hands[2]).toHaveLength(5);
    expect(s3.pile).toHaveLength(0);
  });

  it('1 枚でも違う → 出した人が引き取る', () => {
    const s0 = stateOf([[c(1), c(6), c(9)], [c(2)], [c(3)], [c(4)]], 1, 0, { pile: [c(8)] });
    const s1 = play(s0, 0, s0.hands[0].slice(0, 2)); // A と 6 を「A が 2 枚」
    const s3 = afterReveal(call(s1, 3));
    expect(s3.hands[0]).toHaveLength(4);
    expect(s3.hands[3]).toHaveLength(1);
  });

  it('複数が言ったら、出した人から見て時計回りで近い人', () => {
    expect(firstCaller(0, [3, 2])).toBe(2);
    expect(firstCaller(0, [3, 1])).toBe(1);
    expect(firstCaller(2, [0, 1])).toBe(0);
    expect(firstCaller(3, [0, 2])).toBe(0);
    expect(firstCaller(1, [])).toBeNull();
  });

  it('同時ダウト：自分（0）と CPU が両方言ったら、時計回りで近いほう', () => {
    // CPU 1 が出した → 次は 2、3、0 の順。あなた（0）と CPU 3 が言ったら CPU 3
    expect(firstCaller(1, [0, 3])).toBe(3);
    // CPU 3 が出した → 次は 0。あなたが優先
    expect(firstCaller(3, [0, 2])).toBe(0);
  });

  it('出した人と上がった人はダウトと言えない', () => {
    const s0 = stateOf([[c(1), c(9)], [c(2)], [], [c(4)]], 1, 0, { finished: [2], until: 'all' });
    const s1 = play(s0, 0, [s0.hands[0][0]]);
    expect(eligibleCallers(s1)).toEqual([1, 3]);
    expect(call(s1, 0)).toBe(s1);
    expect(call(s1, 2)).toBe(s1);
  });
});

describe('上がり', () => {
  it('最後の札でダウトされ、ウソなら引き取って続行', () => {
    const s0 = stateOf([[c(5)], [c(2), c(3)], [c(3)], [c(4)]], 1, 0);
    const s1 = play(s0, 0, s0.hands[0]);
    const s2 = afterReveal(call(s1, 1));
    expect(isFinished(s2)).toBe(false);
    expect(s2.hands[0]).toHaveLength(1);
    expect(s2.finished).toEqual([]);
  });

  it('最後の札でダウトされ、正直なら上がり（1 位で終わり）', () => {
    const s0 = stateOf([[c(1)], [c(2), c(3)], [c(3)], [c(4)]], 1, 0);
    const s2 = afterReveal(call(play(s0, 0, s0.hands[0]), 1));
    expect(isFinished(s2)).toBe(true);
    expect(s2.finished).toEqual([0]);
  });

  it('誰も言わなければ上がり', () => {
    const s0 = stateOf([[c(7)], [c(2), c(3)], [c(3)], [c(4)]], 1, 0);
    const s2 = pass(play(s0, 0, s0.hands[0]));
    expect(s2.finished).toEqual([0]);
    expect(isFinished(s2)).toBe(true);
  });

  it('「最後まで」なら、上がった人を飛ばして続ける', () => {
    const s0 = stateOf([[c(7)], [c(2), c(3)], [c(3)], [c(4)]], 1, 0, { until: 'all' });
    const s2 = pass(play(s0, 0, s0.hands[0]));
    expect(isFinished(s2)).toBe(false);
    expect(s2.turn).toBe(1);
    const s3 = pass(play(s2, 1, [s2.hands[1][0]]));
    expect(s3.turn).toBe(2);
    expect(s3.rank).toBe(3);
  });
});

describe('CPU は伏せ札を見ない', () => {
  it('publicView に場札・今出した札の中身・ほかの人の手札が入らない', () => {
    const s0 = deal(seededRng(11));
    const s1 = play(s0, 0, s0.hands[0].slice(0, 2));
    const view = publicView(s1, 1);
    const hidden = new Set([...s1.pile, ...s1.hands[0], ...s1.hands[2], ...s1.hands[3]].map((x) => x.id));
    const json = JSON.stringify(view);
    for (const id of hidden) expect(json).not.toMatch(new RegExp(`"id":${id}[,}]`));
    expect(view.current).toEqual({ player: 0, rank: 1, count: 2 });
    expect(Object.keys(view)).not.toContain('pile');
    expect(view.hand.map((x) => x.id)).toEqual(s1.hands[1].map((x) => x.id));
  });

  it('型でも：PublicView に pile・hands が無い', () => {
    type HasPile = 'pile' extends keyof PublicView ? true : false;
    type HasHands = 'hands' extends keyof PublicView ? true : false;
    type HasCards = 'cards' extends keyof NonNullable<PublicView['current']> ? true : false;
    const checks: [HasPile, HasHands, HasCards] = [false, false, false];
    expect(checks).toEqual([false, false, false]);
  });
});

describe('確率', () => {
  it('小さな例が手で計算した値と一致する', () => {
    // N=4・当たり2・2枚取って2枚とも当たり：C(2,2)/C(4,2) = 1/6
    expect(hypergeomAtLeast(4, 2, 2, 2)).toBeCloseTo(1 / 6, 10);
    // N=5・当たり2・3枚取って1枚以上：1 − C(3,3)/C(5,3) = 1 − 1/10
    expect(hypergeomAtLeast(5, 2, 3, 1)).toBeCloseTo(0.9, 10);
    // N=6・当たり3・3枚取って2枚以上：(C(3,2)C(3,1)+C(3,3))/C(6,3) = 10/20
    expect(hypergeomAtLeast(6, 3, 3, 2)).toBeCloseTo(0.5, 10);
  });

  it('r < k で 0、k = 0 で 1', () => {
    expect(hypergeomAtLeast(40, 1, 13, 2)).toBe(0);
    expect(hypergeomAtLeast(40, 4, 13, 0)).toBe(1);
  });

  it('自分の手札は N にも r にも入らない', () => {
    // 自分（1）が 7 を 1 枚と、7 以外を 12 枚持つ。CPU 0 が 7 を 2 枚と宣言（出す前 13 枚）
    const mine = [c(7), ...Array.from({ length: 12 }, (_, i) => c(((i % 6) + 1) as Rank))];
    const view: PublicView = {
      viewer: 1,
      hand: mine,
      handCounts: [11, 13, 13, 13],
      pileCount: 2,
      rank: 7,
      turn: 0,
      phase: 'calling',
      current: { player: 0, rank: 7, count: 2 },
      finished: [],
      declared: [{ rank: 7, count: 2 }, null, null, null],
      known: Array.from({ length: 4 }, () => Array(14).fill(0)),
    };
    // N = 52 − 13 = 39、r = 4 − 1 = 3、h = 13、k = 2
    expect(truthProbability(view, 'normal')).toBeCloseTo(hypergeomAtLeast(39, 3, 13, 2), 12);
  });

  it('自分が宣言の数を 4 枚持っていれば、相手の宣言は必ずウソ → ふつう・つよい は必ずダウト', () => {
    const s0 = stateOf(
      [[c(2), c(3), c(5)], [c(1, 'spade'), c(1, 'heart'), c(1, 'diamond'), c(1, 'club'), c(9)], [c(4)], [c(6)]],
      1,
      0,
    );
    const s1 = play(s0, 0, [s0.hands[0][0]]);
    for (const level of ['normal', 'hard'] as Level[]) {
      const view = publicView(s1, 1);
      expect(truthProbability(view, level)).toBe(0);
      for (let seed = 0; seed < 20; seed += 1) expect(cpuDecideCall(view, level, seededRng(seed))).toBe(true);
    }
  });

  it('3 枚持っていて相手が 2 枚と宣言 → 必ずウソ', () => {
    const s0 = stateOf([[c(2), c(3), c(5)], [c(1, 'spade'), c(1, 'heart'), c(1, 'diamond'), c(9)], [c(4)], [c(6)]], 1, 0);
    const s1 = play(s0, 0, s0.hands[0].slice(0, 2));
    expect(truthProbability(publicView(s1, 1), 'normal')).toBe(0);
  });
});

describe('引き取った札の追跡（つよい だけ）', () => {
  /** CPU 2 が 7 を 2 枚引き取ったあと、「7 が 2 枚」と出した局面を作る */
  function pickedUpThenPlayed(taker: number) {
    const sevens = [c(7, 'spade'), c(7, 'heart')];
    // 席 0 が 7 を 2 枚出す → 席 2 がダウトして負け、引き取る（正直だったので言った人が引き取る）
    let s = stateOf(
      [
        [...sevens, c(1), c(2), c(3)],
        [c(4), c(5), c(6), c(8), c(9)],
        [c(10), c(11), c(12), c(13), c(10, 'heart')],
        [c(11, 'heart'), c(12, 'heart'), c(13, 'heart'), c(2, 'heart'), c(3, 'heart')],
      ],
      7,
      0,
    );
    s = play(s, 0, sevens);
    s = afterReveal(call(s, taker));
    expect(s.known[taker][7]).toBe(2);
    return { s, sevens };
  }

  it('引き取った 7 を数巡後に「7 が 2 枚」と正直に出す → ふつう・つよい は「必ずウソ」としない。つよい は基本形より高い', () => {
    let { s, sevens } = pickedUpThenPlayed(2);
    // 宣言の数を一巡させて、席 2 の手番で 7 が来るようにする
    s = { ...s, turn: 2, rank: 7, phase: 'play' };
    const held = s.hands[2].filter((x) => sevens.some((y) => y.id === x.id));
    s = play(s, 2, held);
    const view = publicView(s, 1);
    const base = truthProbability(view, 'normal');
    const hard = truthProbability(view, 'hard');
    expect(base).toBeGreaterThan(0);
    expect(hard).toBeGreaterThan(base);
    expect(cpuDecideCall(view, 'hard', seededRng(1))).toBe(false);
  });

  it('出した本人が宣言の数を出したら、その 1 手が場を離れたあとで追跡の枚数を減らす', () => {
    let { s } = pickedUpThenPlayed(2);
    s = { ...s, turn: 2, rank: 7, phase: 'play' };
    s = play(s, 2, [s.hands[2].find((x) => x.rank === 7) as Card]);
    // 出したその 1 手への判断にはまだ効かせない
    expect(s.known[2][7]).toBe(2);
    s = pass(s);
    expect(s.known[2][7]).toBe(1);
  });

  it('ほかの人が引き取った札：CPU 3 が引き取った 7 は、CPU 2 の「7 が 2 枚」への r から除かれない', () => {
    let { s } = pickedUpThenPlayed(3);
    // 席 2 が（持っていない）7 を 2 枚と宣言
    s = { ...s, turn: 2, rank: 7, phase: 'play' };
    s = play(s, 2, s.hands[2].slice(0, 2));
    const view = publicView(s, 1);
    expect(view.known[3][7]).toBe(2);
    const N = 52 - view.hand.length;
    const h = view.handCounts[2] + 2;
    expect(truthProbability(view, 'hard')).toBeCloseTo(hypergeomAtLeast(N, 4, h, 2), 12);
    expect(truthProbability(view, 'hard')).toBeGreaterThan(0);
  });
});

describe('CPU の出し方', () => {
  const view = (hand: Card[], counts = [13, 13, 13, 13]): PublicView => ({
    viewer: 1,
    hand,
    handCounts: counts,
    pileCount: 0,
    rank: 5,
    turn: 1,
    phase: 'play',
    current: null,
    finished: [],
    declared: [null, null, null, null],
    known: Array.from({ length: 4 }, () => Array(14).fill(0)),
  });

  it('よわい：持っていれば正直に全部、無ければ 1 枚だけウソ', () => {
    const hand = [c(5), c(5, 'heart'), c(9), c(10)];
    expect(cpuChoosePlay(hand, 5, view(hand), 'easy', seededRng(1)).map((x) => x.rank)).toEqual([5, 5]);
    const none = [c(9), c(10), c(11)];
    expect(cpuChoosePlay(none, 5, view(none), 'easy', seededRng(1))).toHaveLength(1);
  });

  it('いつも 1〜4 枚で、手札の中から出す', () => {
    const rng = seededRng(9);
    for (const level of ['easy', 'normal', 'hard'] as Level[]) {
      for (let i = 0; i < 50; i += 1) {
        const hand = deal(rng).hands[1];
        const picked = cpuChoosePlay(hand, 5, view(hand), level, rng);
        expect(picked.length).toBeGreaterThanOrEqual(1);
        expect(picked.length).toBeLessThanOrEqual(4);
        expect(picked.every((p) => hand.includes(p))).toBe(true);
        expect(new Set(picked.map((p) => p.id)).size).toBe(picked.length);
      }
    }
  });

  it('つよい：相手の手札が少ないときは正直だけ', () => {
    const hand = [c(5), c(9), c(10), c(11), c(12), c(13), c(2)];
    for (let seed = 0; seed < 20; seed += 1) {
      expect(cpuChoosePlay(hand, 5, view(hand, [2, 7, 13, 13]), 'hard', seededRng(seed)).map((x) => x.rank)).toEqual([5]);
    }
  });
});

/** CPU 4 人で 1 局。席ごとの強さを渡し、1 位の席を返す */
function simulate(levels: Level[], seed: number, first: number): number | null {
  const rng = seededRng(seed);
  let s = deal(rng, 'first', first);
  for (let step = 0; step < 4000 && !isFinished(s); step += 1) {
    const p = s.turn;
    s = play(s, p, cpuChoosePlay(s.hands[p], s.rank, publicView(s, p), levels[p], rng));
    const callers = eligibleCallers(s).filter((q) => cpuDecideCall(publicView(s, q), levels[q], rng));
    const who = firstCaller(p, callers);
    s = who === null ? pass(s) : afterReveal(call(s, who));
  }
  return isFinished(s) ? s.finished[0] : null;
}

describe('段階の差', () => {
  it('固定の種 200 局で、つよい 3 人を相手にしたとき よわい の 1 位率 < ふつう の 1 位率', () => {
    const winRate = (level: Level) => {
      let wins = 0;
      for (let i = 0; i < 200; i += 1) {
        if (simulate([level, 'hard', 'hard', 'hard'], 1000 + i, i % 4) === 0) wins += 1;
      }
      return wins / 200;
    };
    const easy = winRate('easy');
    const normal = winRate('normal');
    expect(easy).toBeLessThan(normal);
  });

  it('局はかならず終わる（4000 手以内）', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(simulate(['normal', 'easy', 'hard', 'normal'], 500 + i, 0)).not.toBeNull();
    }
  });

  it('局の途中も 52 枚がそろっている', () => {
    const rng = seededRng(77);
    let s = deal(rng);
    const all = allCards(s);
    for (let step = 0; step < 300 && !isFinished(s); step += 1) {
      const p = s.turn;
      s = play(s, p, cpuChoosePlay(s.hands[p], s.rank, publicView(s, p), 'normal', rng));
      expect(allCards(s)).toEqual(all);
      const callers = eligibleCallers(s).filter((q) => cpuDecideCall(publicView(s, q), 'normal', rng));
      const who = firstCaller(p, callers);
      s = who === null ? pass(s) : call(s, who);
      expect(allCards(s)).toEqual(all);
      s = afterReveal(s);
      expect(allCards(s)).toEqual(all);
    }
  });
});

describe('記録', () => {
  it('勝ちの局だけ timeMs を渡し、負けの局は { outcome: "loss" } だけ', () => {
    const won = { ...deal(seededRng(1)), finished: [0], phase: 'finished' as const };
    const lost = { ...deal(seededRng(1)), finished: [2], phase: 'finished' as const };
    expect(resultFor(won, 0, 61_000)).toEqual({ outcome: 'win', timeMs: 61_000 });
    expect(resultFor(lost, 0, 61_000)).toEqual({ outcome: 'loss' });
  });

  it('records.ts に通すと勝ち・負け・最速の勝ちが残る', () => {
    let e: RecordEntry = applyStart({});
    e = applyResult(e, { outcome: 'loss' }).entry;
    e = applyStart(e);
    e = applyResult(e, { outcome: 'win', timeMs: 90_000 }).entry;
    expect(e).toMatchObject({ plays: 2, wins: 1, losses: 1, bestTimeMs: 90_000 });
  });
});

describe('手札の表示の切り替え（handLayout）', () => {
  it('360px：13 枚 → 1 列、20 枚 → 2 段、30 枚 → 数のチップ', () => {
    expect(handLayout(13, 360)).toBe('row');
    expect(handLayout(20, 360)).toBe('two');
    expect(handLayout(30, 360)).toBe('chips');
  });

  it('360px で 1 枚あたり 24px を切る枚数でチップへ', () => {
    // 1 列は 13 枚まで 24px 以上
    expect(visiblePerCard(13, 360)).toBeGreaterThanOrEqual(24);
    // 2 段の片方の段が 14 枚になると 24px を切るのでチップ
    expect(visiblePerCard(14, 360)).toBeLessThan(24);
    expect(handLayout(20, 360, 14)).toBe('chips');
    expect(handLayout(26, 360, 13)).toBe('two');
  });

  it('320px では 13 枚でも 1 列だと 24px を切るので、配りたてから 2 段。768px なら 13 枚は 1 列', () => {
    expect(handLayout(13, 320)).toBe('two');
    expect(handLayout(13, 768)).toBe('row');
    expect(handLayout(13, 390)).toBe('row');
  });

  it('2 段は上が A〜7、下が 8〜K', () => {
    const [top, bottom] = splitRows([c(1), c(7), c(8), c(13)]);
    expect(top.map((x) => x.rank)).toEqual([1, 7]);
    expect(bottom.map((x) => x.rank)).toEqual([8, 13]);
  });

  it('数のチップ：同じ数のまだ選んでいない札を 1 枚返す', () => {
    const a = c(4, 'spade');
    const b = c(4, 'heart');
    expect(pickOfRank([a, b], 4, [])).toBe(a);
    expect(pickOfRank([a, b], 4, [a.id])).toBe(b);
    expect(pickOfRank([a, b], 4, [a.id, b.id])).toBeNull();
  });
});
