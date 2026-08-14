import { describe, expect, it } from 'vitest';
import { seededRng, type Card, type Rank, type Suit } from '@/lib/cards';
import {
  activePlayers,
  applyPass,
  applyPlay,
  beyond,
  canPlace,
  cardLabel,
  chooseCpuPlay,
  CPU_STYLES,
  dealCards,
  diamondSevenHolder,
  emptyBoard,
  finishRound,
  isLegalPlay,
  makeSevensDeck,
  matchStandings,
  neighbors,
  newMatch,
  placeOf,
  playableCards,
  playCost,
  PLACE_POINTS,
  PLAYER_COUNT,
  PASS_LIMIT,
  ROUNDS,
  sortHand,
  standings,
  startNextRound,
  startRound,
  styleOf,
  type RoundState,
  type Rules,
} from '@/lib/shichinarabe';

/**
 * 七並べ（docs/features/game-shichinarabe.md）のテスト。
 *
 * 見張っているのは仕様書のルール初版そのもの：
 * 7が自動で場に出ること・隣にしか出せないこと・パスは3回まで（4回目で失格）・
 * 失格者の手札が場に開くこと・勝ち抜け順と5回戦の通算点。
 */

const RULES: Rules = { tunnel: false };
const TUNNEL: Rules = { tunnel: true };

let nextId = 1000;

/** テスト用に1枚作る。id は Reactのkeyにしか使わないので通し番号でよい */
function card(suit: Suit, rank: Rank): Card {
  return { suit, rank, faceUp: true, id: nextId++ };
}

/** 4人の手札を「スートと数字の組」で書ける薄い糖衣 */
function hands(spec: [Suit, Rank][][]): Card[][] {
  return spec.map((cards) => cards.map(([s, r]) => card(s, r)));
}

/** 手札の中から目当ての1枚を取り出す */
function pick(state: RoundState, player: number, suit: Suit, rank: Rank): Card {
  const found = state.hands[player].find((c) => c.suit === suit && c.rank === rank);
  if (!found) throw new Error(`手札に無い: ${suit}${rank}`);
  return found;
}

describe('デックと配り', () => {
  it('ジョーカー無しの52枚を作る（重複なし）', () => {
    const deck = makeSevensDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((c) => `${c.suit}-${c.rank}`)).size).toBe(52);
    expect(deck.every((c) => c.faceUp)).toBe(true);
  });

  it('4人にちょうど13枚ずつ配る', () => {
    const dealt = dealCards(makeSevensDeck());
    expect(dealt).toHaveLength(PLAYER_COUNT);
    expect(dealt.map((h) => h.length)).toEqual([13, 13, 13, 13]);
    expect(new Set(dealt.flat().map((c) => c.id)).size).toBe(52);
  });

  it('手札はスート順・数字順に並ぶ', () => {
    const sorted = sortHand([card('club', 3), card('spade', 5), card('spade', 2)]);
    expect(sorted.map((c) => `${c.suit}${c.rank}`)).toEqual(['spade2', 'spade5', 'club3']);
  });

  it('♦7 を持っている人が親になる（無ければ0番）', () => {
    const dealt = hands([
      [['spade', 3]],
      [['diamond', 7]],
      [['club', 9]],
      [['heart', 2]],
    ]);
    expect(diamondSevenHolder(dealt)).toBe(1);
    expect(diamondSevenHolder(hands([[['spade', 3]]]))).toBe(0);
  });
});

describe('場に置ける条件', () => {
  it('7は最初から場にあり、隣の6と8だけが置ける', () => {
    const board = emptyBoard();
    board.spade[7] = true;
    expect(canPlace(board, card('spade', 6), false)).toBe(true);
    expect(canPlace(board, card('spade', 8), false)).toBe(true);
    expect(canPlace(board, card('spade', 5), false)).toBe(false);
    expect(canPlace(board, card('spade', 9), false)).toBe(false);
    // スートが違えばつながらない
    expect(canPlace(board, card('heart', 6), false)).toBe(false);
  });

  it('すでに置かれている札は置けない', () => {
    const board = emptyBoard();
    board.spade[7] = true;
    expect(canPlace(board, card('spade', 7), false)).toBe(false);
  });

  it('トンネルOFFでは A と K がつながらない', () => {
    const board = emptyBoard();
    board.spade[13] = true;
    expect(canPlace(board, card('spade', 1), false)).toBe(false);
    expect(neighbors(1, false)).toEqual([2]);
    expect(neighbors(13, false)).toEqual([12]);
  });

  it('トンネルONでは K の隣に A、A の隣に K を置ける', () => {
    const board = emptyBoard();
    board.spade[13] = true;
    expect(canPlace(board, card('spade', 1), true)).toBe(true);
    expect(neighbors(1, true)).toEqual([2, 13]);
    expect(neighbors(13, true)).toEqual([12, 1]);
  });

  it('飛び地の隣にも置ける（失格者の手札が開いたあとの状態）', () => {
    const board = emptyBoard();
    board.spade[7] = true;
    board.spade[11] = true; // 失格者が開いた ♠J
    expect(canPlace(board, card('spade', 10), false)).toBe(true);
    expect(canPlace(board, card('spade', 12), false)).toBe(true);
    expect(canPlace(board, card('spade', 9), false)).toBe(false);
  });
});

describe('回戦の開始', () => {
  const state = startRound(
    hands([
      [['spade', 7], ['spade', 8]],
      [['heart', 7], ['heart', 6]],
      [['diamond', 7], ['club', 9]],
      [['club', 7], ['club', 8]],
    ]),
    RULES,
  );

  it('全員の7が場に出て、手札から抜ける', () => {
    for (const suit of ['spade', 'heart', 'diamond', 'club'] as Suit[]) {
      expect(state.board[suit][7]).toBe(true);
    }
    expect(state.hands.flat().some((c) => c.rank === 7)).toBe(false);
    expect(state.hands.map((h) => h.length)).toEqual([1, 1, 1, 1]);
  });

  it('♦7 を持っていた人の番から始まり、パスは0回', () => {
    expect(state.turn).toBe(2);
    expect(state.passes).toEqual([0, 0, 0, 0]);
    expect(state.finished).toBe(false);
    expect(activePlayers(state)).toEqual([0, 1, 2, 3]);
  });
});

describe('札を出す', () => {
  const base = startRound(
    hands([
      [['spade', 7], ['spade', 8], ['spade', 9]],
      [['heart', 7], ['heart', 6], ['heart', 5]],
      [['diamond', 7], ['diamond', 8], ['diamond', 9]],
      [['club', 7], ['club', 6], ['club', 5]],
    ]),
    RULES,
  );

  it('場につながる札だけ出せる', () => {
    expect(playableCards(base, 2).map(cardLabel)).toEqual(['♦︎8']);
    expect(isLegalPlay(base, pick(base, 2, 'diamond', 8))).toBe(true);
    expect(isLegalPlay(base, pick(base, 2, 'diamond', 9))).toBe(false);
  });

  it('他人の手札の札は出せない（手番の人の札だけ）', () => {
    expect(isLegalPlay(base, pick(base, 0, 'spade', 8))).toBe(false);
  });

  it('出すと場に乗り、手札から減り、次の人の番になる', () => {
    const next = applyPlay(base, pick(base, 2, 'diamond', 8));
    expect(next.board.diamond[8]).toBe(true);
    expect(next.hands[2]).toHaveLength(1);
    expect(next.turn).toBe(3);
    expect(next.last).toEqual({ suit: 'diamond', rank: 8 });
    expect(next.events).toEqual([{ kind: 'place', player: 2 }]);
  });

  it('出せない札を渡しても局面は動かない', () => {
    expect(applyPlay(base, pick(base, 2, 'diamond', 9))).toBe(base);
  });

  it('元の局面は書き換わらない（イミュータブル）', () => {
    applyPlay(base, pick(base, 2, 'diamond', 8));
    expect(base.board.diamond[8]).toBe(false);
    expect(base.hands[2]).toHaveLength(2);
  });
});

describe('パスと失格', () => {
  /** 0番だけが手詰まりになる盤面。1〜3番は出せる札を持っている */
  function stuck(): RoundState {
    return startRound(
      hands([
        [['spade', 7], ['spade', 1], ['spade', 2]],
        [['heart', 7], ['heart', 6], ['heart', 5]],
        [['diamond', 7], ['diamond', 6], ['diamond', 5]],
        [['club', 7], ['club', 6], ['club', 5]],
      ]),
      RULES,
    );
  }

  it('パスすると回数が増えて次の人へ回る', () => {
    let state = stuck();
    expect(state.turn).toBe(2);
    state = applyPass(state);
    expect(state.passes[2]).toBe(1);
    expect(state.turn).toBe(3);
    expect(state.events).toEqual([{ kind: 'pass', player: 2 }]);
  });

  it(`${PASS_LIMIT}回まではパスでき、${PASS_LIMIT + 1}回目で失格になる`, () => {
    let state = stuck();
    // 0番の番まで回してから、0番だけがパスを重ねる状況を作る
    const passUntilEliminated = () => {
      for (let i = 0; i < 40 && state.eliminated.length === 0 && !state.finished; i += 1) {
        state = applyPass(state);
      }
    };
    passUntilEliminated();
    expect(state.eliminated).toHaveLength(1);
    // 誰が最初に失格しても、失格した人のパスは PASS_LIMIT + 1 回
    const loser = state.eliminated[0].player;
    expect(state.passes[loser]).toBe(PASS_LIMIT + 1);
  });

  it('失格した人の手札はすべて場に開き、手札が空になる', () => {
    let state = stuck();
    let loser = -1;
    for (let i = 0; i < 40 && state.eliminated.length === 0; i += 1) {
      state = applyPass(state);
      if (state.eliminated.length === 1) loser = state.eliminated[0].player;
    }
    expect(loser).toBeGreaterThanOrEqual(0);
    expect(state.hands[loser]).toEqual([]);
    expect(state.eliminated[0].left).toBe(2);
    expect(activePlayers(state)).not.toContain(loser);
  });

  it('失格者が開いた札で、止まっていた並びがつながる', () => {
    // 0番は ♠A・♠2 を抱えたまま失格する。開けば ♠3 が出せるようになる
    let state = startRound(
      hands([
        [['spade', 7], ['spade', 1], ['spade', 2]],
        [['heart', 7], ['spade', 3], ['heart', 6]],
        [['diamond', 7], ['diamond', 6], ['diamond', 5]],
        [['club', 7], ['club', 6], ['club', 5]],
      ]),
      RULES,
    );
    expect(canPlace(state.board, card('spade', 3), false)).toBe(false);
    for (let i = 0; i < 40 && !state.eliminated.some((e) => e.player === 0); i += 1) {
      state = applyPass(state);
    }
    expect(state.board.spade[2]).toBe(true);
    expect(canPlace(state.board, card('spade', 3), false)).toBe(true);
  });
});

describe('勝ち抜けと順位', () => {
  it('手札を出し切った人から勝ち抜け、残り1人になったら回戦が終わる', () => {
    let state = startRound(
      hands([
        [['spade', 7], ['spade', 8]],
        [['heart', 7], ['heart', 8]],
        [['diamond', 7], ['diamond', 8]],
        [['club', 7], ['club', 8], ['club', 9]],
      ]),
      RULES,
    );
    expect(state.turn).toBe(2);
    state = applyPlay(state, pick(state, 2, 'diamond', 8)); // 2番が上がり
    expect(state.out).toEqual([2]);
    expect(state.finished).toBe(false);
    state = applyPlay(state, pick(state, 3, 'club', 8));
    state = applyPlay(state, pick(state, 0, 'spade', 8)); // 0番が上がり
    state = applyPlay(state, pick(state, 1, 'heart', 8)); // 1番が上がり → 残るは3番だけ
    expect(state.finished).toBe(true);
    // 最後に残った人は、勝ち抜けの列のいちばん後ろに入る
    expect(standings(state)).toEqual([2, 0, 1, 3]);
  });

  it('失格した人は勝ち抜けた人より下で、残り枚数が少ないほうが上', () => {
    const state: RoundState = {
      ...startRound(hands([[['spade', 7]], [['heart', 7]], [['diamond', 7]], [['club', 7]]]), RULES),
      out: [1],
      eliminated: [
        { player: 0, left: 5 },
        { player: 3, left: 2 },
      ],
      finished: true,
    };
    expect(standings(state)).toEqual([1, 3, 0]);
  });
});

describe('CPU', () => {
  const rng = seededRng(7);

  it('出せる札が無ければパスする', () => {
    const state = startRound(
      hands([
        [['spade', 7], ['spade', 1]],
        [['heart', 7], ['heart', 6]],
        [['diamond', 7], ['diamond', 6]],
        [['club', 7], ['club', 6]],
      ]),
      RULES,
    );
    // 0番の番に進めてから見る
    const turn0 = { ...state, turn: 0 };
    expect(playableCards(turn0, 0)).toEqual([]);
    for (const style of CPU_STYLES) {
      expect(chooseCpuPlay(turn0, style, { rng })).toBeNull();
    }
  });

  it('出せば上がれる手はどの性格でも必ず出す', () => {
    const state = startRound(
      hands([
        [['spade', 7], ['spade', 8]],
        [['heart', 7], ['heart', 6]],
        [['diamond', 7], ['diamond', 6]],
        [['club', 7], ['club', 6]],
      ]),
      RULES,
    );
    const turn0 = { ...state, turn: 0 };
    for (const style of CPU_STYLES) {
      expect(chooseCpuPlay(turn0, style, { rng })?.rank).toBe(8);
    }
  });

  it('外側を自分で押さえている札ほど出しやすいと見積もる', () => {
    const state = startRound(
      hands([
        [['spade', 7], ['spade', 8], ['spade', 9], ['heart', 8]],
        [['heart', 7], ['heart', 6]],
        [['diamond', 7], ['diamond', 6]],
        [['club', 7], ['club', 6]],
      ]),
      RULES,
    );
    const turn0 = { ...state, turn: 0 };
    // ♠8 は外側の ♠9 を自分で持っている。♥8 は外側が全部よそなので損
    expect(playCost(turn0, 0, pick(turn0, 0, 'spade', 8))).toBeLessThan(
      playCost(turn0, 0, pick(turn0, 0, 'heart', 8)),
    );
  });

  it('「せっかち」は止めずに出し、「いじわる」は損な手をパスで止める', () => {
    // 0番の手は ♥8（外側5枚が全部よそ＝損）だけ。相手はまだ余裕がある枚数
    const state = startRound(
      hands([
        [['spade', 7], ['heart', 8], ['spade', 1], ['spade', 2], ['spade', 3]],
        [['heart', 7], ['heart', 5], ['heart', 4], ['heart', 3], ['heart', 2]],
        [['diamond', 7], ['diamond', 6], ['diamond', 5], ['diamond', 4], ['diamond', 3]],
        [['club', 7], ['club', 6], ['club', 5], ['club', 4], ['club', 3]],
      ]),
      RULES,
    );
    const turn0 = { ...state, turn: 0 };
    const hasty = CPU_STYLES.find((s) => s.id === 'hasty')!;
    const blocker = CPU_STYLES.find((s) => s.id === 'blocker')!;
    expect(chooseCpuPlay(turn0, hasty, { rng })?.rank).toBe(8);
    expect(chooseCpuPlay(turn0, blocker, { rng })).toBeNull();
  });

  it('誰かが残り2枚以下なら止めずに出す', () => {
    const state = startRound(
      hands([
        [['spade', 7], ['heart', 8], ['spade', 1], ['spade', 2], ['spade', 3]],
        [['heart', 7], ['heart', 5], ['heart', 4]],
        [['diamond', 7], ['diamond', 6], ['diamond', 5], ['diamond', 4], ['diamond', 3]],
        [['club', 7], ['club', 6], ['club', 5], ['club', 4], ['club', 3]],
      ]),
      RULES,
    );
    // 1番は7を出したあと2枚。止めても間に合わないので出す
    const turn0 = { ...state, turn: 0 };
    expect(turn0.hands[1]).toHaveLength(2);
    const blocker = CPU_STYLES.find((s) => s.id === 'blocker')!;
    expect(chooseCpuPlay(turn0, blocker, { rng })?.rank).toBe(8);
  });

  it('席ごとに違う性格が割り当てられる', () => {
    const ids = [1, 2, 3].map((seat) => styleOf(seat).id);
    expect(new Set(ids).size).toBe(3);
  });

  it('外側の数字はトンネルの有無で変わる', () => {
    expect(beyond(11, false)).toEqual([12, 13]);
    expect(beyond(11, true)).toEqual([12, 13, 1]);
    expect(beyond(3, true)).toEqual([2, 1, 13]);
    expect(beyond(7, false)).toEqual([]);
  });
});

describe('CPUだけで回しても必ず決着する', () => {
  for (const rules of [RULES, TUNNEL]) {
    it(`トンネル${rules.tunnel ? 'ON' : 'OFF'}：4人ぶんの順位がついて終わる`, () => {
      for (let seed = 1; seed <= 30; seed += 1) {
        const rng = seededRng(seed);
        let match = newMatch(rules, rng);
        let guard = 0;
        while (!match.state.finished && guard < 500) {
          const card = chooseCpuPlay(match.state, styleOf(match.state.turn), { rng });
          match = {
            ...match,
            state: card === null ? applyPass(match.state) : applyPlay(match.state, card),
          };
          guard += 1;
        }
        expect(match.state.finished).toBe(true);
        expect(standings(match.state)).toHaveLength(PLAYER_COUNT);
        expect(new Set(standings(match.state)).size).toBe(PLAYER_COUNT);
        // 場に出た札＋失格者が開いた札で、52枚がすべて場に出るか手札に残る
        const onBoard = (['spade', 'heart', 'diamond', 'club'] as Suit[]).reduce(
          (sum, suit) => sum + match.state.board[suit].filter(Boolean).length,
          0,
        );
        expect(onBoard + match.state.hands.flat().length).toBe(52);
      }
    });
  }
});

describe('5回戦の試合', () => {
  it('回戦ごとに 3・2・1・0 点が入る', () => {
    const rng = seededRng(3);
    let match = newMatch(RULES, rng);
    while (!match.state.finished) {
      const card = chooseCpuPlay(match.state, styleOf(match.state.turn), { rng });
      match = {
        ...match,
        state: card === null ? applyPass(match.state) : applyPlay(match.state, card),
      };
    }
    match = finishRound(match);
    const order = standings(match.state);
    order.forEach((player, place) => {
      expect(match.scores[player]).toBe(PLACE_POINTS[place]);
    });
    expect(match.scores.reduce((a, b) => a + b, 0)).toBe(6);
    expect(match.finished).toBe(false);
  });

  it(`${ROUNDS}回戦を終えると試合が終わる`, () => {
    const rng = seededRng(11);
    let match = newMatch(RULES, rng);
    for (let round = 1; round <= ROUNDS; round += 1) {
      let guard = 0;
      while (!match.state.finished && guard < 500) {
        const card = chooseCpuPlay(match.state, styleOf(match.state.turn), { rng });
        match = {
          ...match,
          state: card === null ? applyPass(match.state) : applyPlay(match.state, card),
        };
        guard += 1;
      }
      match = finishRound(match);
      expect(match.round).toBe(round);
      if (round < ROUNDS) match = startNextRound(match, rng);
    }
    expect(match.finished).toBe(true);
    expect(match.scores.reduce((a, b) => a + b, 0)).toBe(6 * ROUNDS);
    expect(new Set(matchStandings(match)).size).toBe(PLAYER_COUNT);
    expect(placeOf(match, matchStandings(match)[0])).toBe(0);
  });

  it('終わった試合は次の回戦に進まない', () => {
    const rng = seededRng(5);
    const match = { ...newMatch(RULES, rng), finished: true };
    expect(startNextRound(match, rng)).toBe(match);
  });

  it('同点は前回の順位が上のほうを上に置く', () => {
    const rng = seededRng(9);
    const match = {
      ...newMatch(RULES, rng),
      scores: [3, 3, 0, 0],
      lastStandings: [1, 0, 3, 2],
    };
    expect(matchStandings(match)).toEqual([1, 0, 3, 2]);
  });
});
