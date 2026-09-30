import { describe, expect, it } from 'vitest';
import { seededRng, type Card, type Rank, type Suit } from '@/lib/cards';
import { applyResult, applyStart, type RecordEntry } from '@/lib/records';
import {
  chooseCpuCard,
  chooseCpuPass,
  collectTrick,
  dealRound,
  exchange,
  isMatchOver,
  legalCards,
  matchCollect,
  matchPlay,
  moonShooter,
  moonThreat,
  newMatch,
  newRound,
  nextRound,
  passDirection,
  passSource,
  passTarget,
  playCard,
  ranking,
  scoreRound,
  submitPass,
  trickWinner,
  type MatchState,
  type RoundState,
} from '@/lib/hearts';

let nextId = 5000;
function c(suit: Suit, rank: Rank): Card {
  nextId += 1;
  return { suit, rank, faceUp: true, id: nextId };
}
const S = (r: Rank) => c('spade', r);
const H = (r: Rank) => c('heart', r);
const D = (r: Rank) => c('diamond', r);
const C = (r: Rank) => c('club', r);

/** 手札とトリックの途中から局面を作る */
function roundOf(
  hands: Card[][],
  opts: Partial<Pick<RoundState, 'trick' | 'turn' | 'tricksPlayed' | 'heartsBroken' | 'taken'>> = {},
): RoundState {
  return {
    hands,
    trick: opts.trick ?? [],
    turn: opts.turn ?? 0,
    tricksPlayed: opts.tricksPlayed ?? 1,
    heartsBroken: opts.heartsBroken ?? false,
    taken: opts.taken ?? hands.map(() => []),
    received: hands.map(() => []),
  };
}

const ids = (cards: Card[]) => cards.map((x) => x.id).sort((a, b) => a - b);

describe('配る', () => {
  it('52枚を13枚ずつ、重複なく配る', () => {
    const hands = dealRound(seededRng(1));
    expect(hands).toHaveLength(4);
    for (const h of hands) expect(h).toHaveLength(13);
    const all = hands.flat();
    expect(new Set(all.map((x) => `${x.suit}${x.rank}`)).size).toBe(52);
  });

  it('局は♣2を持つ人のリードで始まる', () => {
    const hands = dealRound(seededRng(2));
    const r = newRound(hands);
    expect(r.hands[r.turn].some((x) => x.suit === 'club' && x.rank === 2)).toBe(true);
  });
});

describe('パス', () => {
  it('向きは 左 → 右 → 向かい → パス無し の4局で1周する', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(passDirection)).toEqual([
      'left', 'right', 'across', 'none', 'left', 'right', 'across', 'none',
    ]);
  });

  it('左は次の席（CPU 左）、右は前の席（CPU 右）、向かいは2つ先', () => {
    expect(passTarget(0, 'left')).toBe(1);
    expect(passTarget(0, 'right')).toBe(3);
    expect(passTarget(0, 'across')).toBe(2);
    expect(passSource(0, 'left')).toBe(3);
    expect(passSource(0, 'right')).toBe(1);
    expect(passSource(0, 'across')).toBe(2);
  });

  it('3枚ずつ渡し合い、全員13枚のまま・52枚がそろう', () => {
    const hands = dealRound(seededRng(3));
    const picks = hands.map((h) => h.slice(0, 3));
    const { hands: after, received } = exchange(hands, picks, 'left');
    for (const h of after) expect(h).toHaveLength(13);
    expect(ids(after.flat())).toEqual(ids(hands.flat()));
    expect(ids(received[1])).toEqual(ids(picks[0]));
    expect(ids(received[0])).toEqual(ids(picks[3]));
    for (const x of picks[0]) expect(after[1].some((y) => y.id === x.id)).toBe(true);
  });

  it('パス無しの局は手札が変わらない', () => {
    const hands = dealRound(seededRng(4));
    const { hands: after } = exchange(hands, hands.map((h) => h.slice(0, 3)), 'none');
    expect(after.map(ids)).toEqual(hands.map(ids));
  });

  it('CPU は♠Q・♠A・♠K と高いハートから渡す', () => {
    const hand = [S(12), S(1), H(13), H(2), C(3), C(4), D(5), D(6), D(7), D(8), D(9), C(10), C(11)];
    const pick = chooseCpuPass(hand);
    expect(pick.map((x) => `${x.suit}${x.rank}`).sort()).toEqual(['heart13', 'spade1', 'spade12'].sort());
  });

  it('♠Q を持っていて♠が4枚以上なら♠Q は守る', () => {
    const hand = [S(12), S(2), S(3), S(4), H(13), H(12), H(11), C(3), C(4), D(5), D(6), D(7), D(8)];
    const pick = chooseCpuPass(hand);
    expect(pick.some((x) => x.suit === 'spade' && x.rank === 12)).toBe(false);
    expect(pick.map((x) => x.rank).sort()).toEqual([11, 12, 13]);
  });
});

describe('出せる札（legalCards）', () => {
  it('最初のトリックのリードは♣2だけ', () => {
    const two = C(2);
    const r = roundOf([[two, C(5), S(3)], [], [], []], { tricksPlayed: 0 });
    expect(ids(legalCards(r, 0))).toEqual([two.id]);
  });

  it('番でない人は何も出せない', () => {
    const r = roundOf([[C(5)], [C(6)], [], []], { turn: 0 });
    expect(legalCards(r, 1)).toEqual([]);
  });

  it('台札のスートがあればそれしか出せない（フォロー義務）', () => {
    const lead = { player: 3, card: D(5) };
    const d9 = D(9);
    const r = roundOf([[d9, S(12), H(3)], [], [], []], { trick: [lead], turn: 0 });
    expect(ids(legalCards(r, 0))).toEqual([d9.id]);
  });

  it('台札のスートが無ければ何でも出せる', () => {
    const lead = { player: 3, card: D(5) };
    const hand = [S(12), H(3), C(4)];
    const r = roundOf([hand, [], [], []], { trick: [lead], turn: 0 });
    expect(ids(legalCards(r, 0))).toEqual(ids(hand));
  });

  it('最初のトリックに♣が無ければ、点札（ハート・♠Q）以外を出す', () => {
    const lead = { player: 3, card: C(2) };
    const d = D(10);
    const s = S(5);
    const r = roundOf([[S(12), H(13), d, s], [], [], []], { trick: [lead], turn: 0, tricksPlayed: 0 });
    expect(ids(legalCards(r, 0))).toEqual(ids([d, s]));
  });

  it('最初のトリックでも、ハートと♠Q しか無ければそれを出せる', () => {
    const lead = { player: 3, card: C(2) };
    const hand = [S(12), H(13), H(2)];
    const r = roundOf([hand, [], [], []], { trick: [lead], turn: 0, tricksPlayed: 0 });
    expect(ids(legalCards(r, 0))).toEqual(ids(hand));
  });

  it('ハートが割れる前はハートでリードできない', () => {
    const s = S(3);
    const r = roundOf([[s, H(5), H(6)], [], [], []], { heartsBroken: false });
    expect(ids(legalCards(r, 0))).toEqual([s.id]);
  });

  it('ハートしか無ければ、割れる前でもハートでリードできる', () => {
    const hand = [H(5), H(6)];
    const r = roundOf([hand, [], [], []], { heartsBroken: false });
    expect(ids(legalCards(r, 0))).toEqual(ids(hand));
  });

  it('ハートが割れたあとはハートでもリードできる', () => {
    const hand = [S(3), H(5)];
    const r = roundOf([hand, [], [], []], { heartsBroken: true });
    expect(ids(legalCards(r, 0))).toEqual(ids(hand));
  });
});

describe('トリックの進行', () => {
  it('ディスカードでハートを出すとハートが割れる', () => {
    const r0 = roundOf([[D(3)], [H(9)], [D(4)], [D(5)]], { turn: 0 });
    const r1 = playCard(r0, 0, r0.hands[0][0]);
    expect(r1.heartsBroken).toBe(false);
    const r2 = playCard(r1, 1, r1.hands[1][0]);
    expect(r2.heartsBroken).toBe(true);
  });

  it('♠Q を出してもハートは割れない', () => {
    const r0 = roundOf([[D(3)], [S(12)], [D(4)], [D(5)]], { turn: 0 });
    const r1 = playCard(playCard(r0, 0, r0.hands[0][0]), 1, r0.hands[1][0]);
    expect(r1.heartsBroken).toBe(false);
  });

  it('出せない札を出すと例外になる', () => {
    const r = roundOf([[D(3), S(4)], [], [], []], { trick: [{ player: 3, card: D(5) }], turn: 0 });
    expect(() => playCard(r, 0, r.hands[0][1])).toThrow();
  });

  it('台札のスートの最強札が取る（A > K > … > 2）。別スートは強くても取れない', () => {
    expect(trickWinner([
      { player: 0, card: D(10) },
      { player: 1, card: D(1) },
      { player: 2, card: D(13) },
      { player: 3, card: S(1) },
    ])).toBe(1);
    expect(trickWinner([
      { player: 2, card: C(3) },
      { player: 3, card: C(2) },
      { player: 0, card: H(1) },
      { player: 1, card: D(1) },
    ])).toBe(2);
  });

  it('4枚そろうと番は -1 になり、取ると勝った人が次をリードする', () => {
    let r = roundOf([[D(3), C(9)], [D(1), C(8)], [D(4), C(7)], [H(2), C(6)]], { turn: 0 });
    r = playCard(r, 0, r.hands[0][0]);
    r = playCard(r, 1, r.hands[1][0]);
    r = playCard(r, 2, r.hands[2][0]);
    r = playCard(r, 3, r.hands[3][0]);
    expect(r.turn).toBe(-1);
    expect(legalCards(r, 0)).toEqual([]);
    const after = collectTrick(r);
    expect(after.turn).toBe(1);
    expect(after.trick).toEqual([]);
    expect(after.tricksPlayed).toBe(2);
    expect(after.taken[1]).toHaveLength(4);
  });
});

describe('点', () => {
  it('ハート1点・♠Q 13点', () => {
    const taken = [[H(2), H(3), S(12)], [H(4)], [D(5)], []];
    expect(scoreRound(taken)).toEqual([15, 1, 0, 0]);
  });

  it('シュートザムーン：1人で26点なら、その人は0点で他の3人に26点', () => {
    const hearts = ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as Rank[]).map(H);
    const taken = [[D(2)], [...hearts, S(12)], [C(3)], []];
    expect(moonShooter(taken)).toBe(1);
    expect(scoreRound(taken)).toEqual([26, 0, 26, 26]);
  });

  it('100点に達したら試合終了', () => {
    expect(isMatchOver([99, 50, 20, 10])).toBe(false);
    expect(isMatchOver([100, 50, 20, 10])).toBe(true);
  });

  it('順位は点の少ない順で、同点は同順位', () => {
    expect(ranking([10, 30, 10, 50])).toEqual([0, 2, 0, 3]);
    expect(ranking([26, 26, 26, 0])).toEqual([1, 1, 1, 0]);
  });
});

/** 全員を CPU にして 1 局を最後まで進める */
function playOutRound(m: MatchState): MatchState {
  let match = m;
  let guard = 0;
  while (match.phase === 'playing') {
    guard += 1;
    if (guard > 100) throw new Error('終わらない');
    const r = match.round;
    if (r.trick.length === 4) {
      match = matchCollect(match);
      continue;
    }
    const card = chooseCpuCard(r, r.turn, match.level);
    match = matchPlay(match, r.turn, card);
  }
  return match;
}

describe('試合', () => {
  it('1局目はパスから始まり、渡すと♣2の人の番になる', () => {
    const m = newMatch('hundred', 'normal', seededRng(10));
    expect(m.phase).toBe('passing');
    const pick = m.round.hands[0].slice(0, 3);
    const after = submitPass(m, pick);
    expect(after.phase).toBe('playing');
    expect(after.round.received[0]).toHaveLength(3);
    for (const x of pick) expect(after.round.hands[1].some((y) => y.id === x.id)).toBe(true);
    const r = after.round;
    expect(r.hands[r.turn].some((x) => x.suit === 'club' && x.rank === 2)).toBe(true);
  });

  it('1局モードは1局で試合が終わる', () => {
    let m = newMatch('one', 'normal', seededRng(11));
    m = submitPass(m, m.round.hands[0].slice(0, 3));
    m = playOutRound(m);
    expect(m.phase).toBe('matchEnd');
    expect(m.totals.reduce((a, b) => a + b, 0) % 26).toBe(0);
  });

  it('100点までの試合は誰かが100点に達した局で終わり、4局目はパス無しで始まる', () => {
    const rng = seededRng(12);
    let m = newMatch('hundred', 'strong', rng);
    let rounds = 0;
    while (m.phase !== 'matchEnd') {
      rounds += 1;
      expect(rounds).toBeLessThan(40);
      expect(m.phase).toBe(m.roundIndex % 4 === 3 ? 'playing' : 'passing');
      if (m.phase === 'passing') m = submitPass(m, chooseCpuPass(m.round.hands[0]));
      m = playOutRound(m);
      if (m.phase === 'roundEnd') {
        expect(isMatchOver(m.totals)).toBe(false);
        m = nextRound(m, rng);
      }
    }
    expect(isMatchOver(m.totals)).toBe(true);
  });

  it('CPU の選ぶ札が legalCards の外に出ない（1,000局の乱数試行で0件）', () => {
    const rng = seededRng(2026);
    let violations = 0;
    for (let game = 0; game < 1000; game += 1) {
      const level = game % 2 === 0 ? 'normal' : 'strong';
      let m = newMatch('one', level, rng);
      if (m.phase === 'passing') m = submitPass(m, chooseCpuPass(m.round.hands[0]));
      while (m.phase === 'playing') {
        const r = m.round;
        if (r.trick.length === 4) {
          m = matchCollect(m);
          continue;
        }
        const card = chooseCpuCard(r, r.turn, level);
        if (!legalCards(r, r.turn).some((x) => x.id === card.id)) violations += 1;
        m = matchPlay(m, r.turn, card);
      }
      // 1局の点の合計は 26（ムーンなら 78）
      const sum = m.totals.reduce((a, b) => a + b, 0);
      expect(sum === 26 || sum === 78).toBe(true);
    }
    expect(violations).toBe(0);
  });
});

describe('CPU の判断', () => {
  it('ディスカードは♠Q から捨てる', () => {
    const q = S(12);
    const r = roundOf([[q, H(13), D(9)], [], [], []], {
      trick: [{ player: 3, card: C(5) }],
      turn: 0,
    });
    expect(chooseCpuCard(r, 0, 'normal').id).toBe(q.id);
  });

  it('♠Q が無ければ高いハートを捨てる', () => {
    const h = H(13);
    const r = roundOf([[H(2), h, D(9)], [], [], []], { trick: [{ player: 3, card: C(5) }], turn: 0 });
    expect(chooseCpuCard(r, 0, 'normal').id).toBe(h.id);
  });

  it('フォローは取らずに済む最も高い札（♠K の下なら♠Q を押しつける）', () => {
    const q = S(12);
    const r = roundOf([[S(2), q, S(1)], [], [], []], {
      trick: [{ player: 2, card: S(13) }],
      turn: 0,
    });
    expect(chooseCpuCard(r, 0, 'normal').id).toBe(q.id);
  });

  it('取らずに済む札が無ければ最も低い札', () => {
    const low = D(11);
    const r = roundOf([[low, D(13)], [], [], []], {
      trick: [{ player: 2, card: D(3) }],
      turn: 0,
    });
    expect(chooseCpuCard(r, 0, 'normal').id).toBe(low.id);
  });

  it('最後の手番で点が乗っていないなら高い札を処理する', () => {
    const high = D(13);
    const r = roundOf([[D(2), high], [], [], []], {
      trick: [
        { player: 1, card: D(5) },
        { player: 2, card: D(9) },
        { player: 3, card: C(4) },
      ],
      turn: 0,
    });
    expect(chooseCpuCard(r, 0, 'normal').id).toBe(high.id);
  });

  it('♠Q を持っていなければ、ハートが割れる前は低い♠でリードする', () => {
    const low = S(3);
    const r = roundOf([[low, S(1), D(2)], [], [], []], { turn: 0 });
    expect(chooseCpuCard(r, 0, 'normal').id).toBe(low.id);
  });

  it('それ以外は最も枚数の少ないスートの低い札でリードする', () => {
    const d = D(9);
    const r = roundOf([[S(12), S(2), C(4), C(5), d], [], [], []], { turn: 0 });
    expect(chooseCpuCard(r, 0, 'normal').id).toBe(d.id);
  });

  it('「つよい」は、点が1人に偏ったら点入りのトリックを横取りしてシュートザムーンを止める', () => {
    const hearts = ([2, 3, 4, 5, 6, 7, 8, 9] as Rank[]).map(H);
    const win = H(13);
    const r = roundOf([[H(11), win], [], [], []], {
      trick: [{ player: 2, card: H(12) }, { player: 3, card: H(10) }],
      turn: 0,
      heartsBroken: true,
      taken: [[], [], hearts, []],
    });
    expect(moonThreat(r, 0)).toBe(2);
    expect(chooseCpuCard(r, 0, 'strong').id).toBe(win.id);
    // 「ふつう」は止めに行かず、取らずに済む札を出す
    expect(chooseCpuCard(r, 0, 'normal').rank).toBe(11);
  });
});

describe('記録（records.ts の既存項目だけを使う）', () => {
  it('bestScore は1試合のシュートザムーン回数の最多で、0回では更新しない', () => {
    let entry: RecordEntry = applyStart({});
    const first = applyResult(entry, { outcome: 'win', score: 0 });
    expect(first.improved.score).toBe(false);
    entry = first.entry;
    const second = applyResult(applyStart(entry), { outcome: 'loss', score: 2 });
    expect(second.improved.score).toBe(true);
    expect(second.entry.bestScore).toBe(2);
    const third = applyResult(applyStart(second.entry), { outcome: 'win', score: 1 });
    expect(third.improved.score).toBe(false);
    expect(third.entry.bestScore).toBe(2);
    expect(third.entry.wins).toBe(2);
    expect(third.entry.losses).toBe(1);
  });
});
