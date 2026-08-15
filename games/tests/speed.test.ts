import { describe, expect, it } from 'vitest';
import { seededRng, type Card, type Rank, type Suit } from '@/lib/cards';
import {
  applyFlip,
  applyPlay,
  canPlay,
  chooseCpuPlay,
  connects,
  CPU,
  CPU_LEVELS,
  cpuDelay,
  DEAL_SIZE,
  DEFAULT_OPTIONS,
  DELAY_MS,
  HAND_SIZE,
  HUMAN,
  isDeadlock,
  isStuck,
  LEVEL_LABELS,
  LEVEL_NOTES,
  MISS_RATE,
  newGame,
  outcome,
  PILE_COUNT,
  pileTop,
  playableMoves,
  playableTargets,
  remainingCards,
  variantOf,
  type SpeedState,
} from '@/lib/speed';

/**
 * スピード（docs/features/game-speed.md）のテスト。
 *
 * 見張っているのは、仕様書に書いてある取り決めそのもの:
 * 各自26枚・場札4枚・台札2枚、連続する数字（AとKもつながる）だけ出せる、
 * 出したら補充する、双方出せなくなったら山札から1枚ずつめくる、
 * 先に出し切ったほうの勝ち、CPUは反応の速さと見落とし率だけで強さが決まること。
 *
 * リアルタイム面なので、**先を越された手を黙って捨てる**ことも見張っている。
 */

/** 常に同じ値を返す乱数（確率の分岐を固定する） */
const constRng = (value: number) => () => value;

const card = (rank: Rank, suit: Suit = 'spade'): Card => ({ rank, suit, faceUp: true, id: rank });

/**
 * 局面を手で組み立てる。台札・場札・山札だけを指定して、あとは既定値。
 * 進行の分岐を狙って作るために使う（配り直して当たりを待つと不安定になる）。
 */
function makeState(patch: {
  /** 台札の一番上の札。下に重なった札はテストでは使わないので持たせない */
  piles?: (Card | null)[];
  hands?: (Card | null)[][];
  stocks?: Card[][];
  started?: boolean;
}): SpeedState {
  const tops = patch.piles ?? [card(7), card(7, 'heart')];
  return {
    level: 'normal',
    piles: tops.map((top) => (top ? [top] : [])),
    stocks: patch.stocks ?? [[], []],
    hands: patch.hands ?? [
      [null, null, null, null],
      [null, null, null, null],
    ],
    played: [0, 0],
    started: patch.started ?? true,
    finished: false,
    winner: null,
    deadlocked: false,
  };
}

const key = (c: Card) => `${c.suit}-${c.rank}`;

/** 台札の一番上（下に重なった札は遊びに関係しない） */
const topOf = (state: SpeedState, pile: number) => pileTop(state, pile);

/** 局面にあるすべての札（山札・場札・台札） */
function allCards(state: SpeedState): Card[] {
  return [
    ...state.stocks.flat(),
    ...state.hands.flat().filter((c): c is Card => c !== null),
    ...state.piles.flat(),
  ];
}

// ---------------------------------------------------------------- 配り

describe('newGame', () => {
  const state = newGame(DEFAULT_OPTIONS, seededRng(1));

  it('52枚を2人で26枚ずつに分ける（同じ札は1枚だけ）', () => {
    const cards = allCards(state);
    expect(cards).toHaveLength(52);
    expect(new Set(cards.map(key)).size).toBe(52);
    for (const player of [HUMAN, CPU]) {
      expect(remainingCards(state, player)).toBe(DEAL_SIZE);
    }
  });

  it('場札は4枚、山札は22枚、台札はまだ置かない', () => {
    for (const player of [HUMAN, CPU]) {
      expect(state.hands[player]).toHaveLength(HAND_SIZE);
      expect(state.hands[player].every((c) => c !== null)).toBe(true);
      expect(state.stocks[player]).toHaveLength(DEAL_SIZE - HAND_SIZE);
    }
    expect(state.piles).toEqual([[], []]);
    expect(state.piles).toHaveLength(PILE_COUNT);
  });

  it('場札は表向き（両者に見えている）', () => {
    for (const player of [HUMAN, CPU]) {
      expect(state.hands[player].every((c) => c?.faceUp)).toBe(true);
    }
  });

  it('始まる前は出せる札が無く、手詰まりにもならない', () => {
    expect(state.started).toBe(false);
    expect(canPlay(state, HUMAN)).toBe(false);
    expect(isStuck(state)).toBe(false);
    expect(outcome(state)).toBeNull();
  });

  it('乱数を固定すれば同じ配りになる（テストの再現性）', () => {
    const again = newGame(DEFAULT_OPTIONS, seededRng(1));
    expect(again.hands.flat().map((c) => c && key(c))).toEqual(
      state.hands.flat().map((c) => c && key(c)),
    );
  });
});

// ---------------------------------------------------------------- つながり

describe('connects', () => {
  it('1つ違いならつながる', () => {
    expect(connects(5, 6)).toBe(true);
    expect(connects(6, 5)).toBe(true);
  });

  it('AとKもつながる（標準ルール）', () => {
    expect(connects(1, 13)).toBe(true);
    expect(connects(13, 1)).toBe(true);
  });

  it('同じ数字・2つ以上離れた数字はつながらない', () => {
    expect(connects(7, 7)).toBe(false);
    expect(connects(7, 9)).toBe(false);
    expect(connects(1, 12)).toBe(false);
  });

  it('1〜13のどの数字にも、出せる相手はちょうど2つ（輪になっている）', () => {
    for (let a = 1; a <= 13; a += 1) {
      const partners = Array.from({ length: 13 }, (_, i) => i + 1).filter((b) =>
        connects(a as Rank, b as Rank),
      );
      expect(partners, `${a} の相手が2つでない`).toHaveLength(2);
    }
  });
});

describe('playableTargets', () => {
  const state = makeState({
    piles: [card(7), card(13, 'heart')],
    hands: [[card(6), card(1, 'club'), card(9), null], [null, null, null, null]],
  });

  it('つながる台札だけを返す', () => {
    expect(playableTargets(state, HUMAN, 0)).toEqual([0]); // 6 → 7
    expect(playableTargets(state, HUMAN, 1)).toEqual([1]); // A → K
    expect(playableTargets(state, HUMAN, 2)).toEqual([]); // 9 はどちらにも出せない
  });

  it('空の枠・範囲外の枠は空を返す', () => {
    expect(playableTargets(state, HUMAN, 3)).toEqual([]);
    expect(playableTargets(state, HUMAN, 99)).toEqual([]);
  });

  it('両方の台札に出せる札は2つとも返す', () => {
    const both = makeState({
      piles: [card(7), card(9, 'heart')],
      hands: [[card(8)], [null]],
    });
    expect(playableTargets(both, HUMAN, 0)).toEqual([0, 1]);
  });

  it('始まる前（台札が空）はどこにも出せない', () => {
    const before = makeState({ piles: [null, null], hands: [[card(6)], [null]], started: false });
    expect(playableTargets(before, HUMAN, 0)).toEqual([]);
  });
});

// ---------------------------------------------------------------- 出す

describe('applyPlay', () => {
  it('台札が出した札に替わり、場札は山札から補充される', () => {
    const state = makeState({
      piles: [card(7), card(2, 'heart')],
      hands: [[card(6), null, null, null], [null, null, null, null]],
      stocks: [[card(11, 'club')], []],
    });
    const next = applyPlay(state, HUMAN, 0, 0);

    expect(topOf(next, 0)?.rank).toBe(6);
    expect(next.hands[HUMAN][0]?.rank).toBe(11);
    expect(next.stocks[HUMAN]).toHaveLength(0);
    expect(next.played[HUMAN]).toBe(1);
  });

  it('補充した札は表向きになる（山札は裏で持っている）', () => {
    const state = makeState({
      hands: [[card(6), null, null, null], [null, null, null, null]],
      stocks: [[{ ...card(11, 'club'), faceUp: false }], []],
    });
    expect(applyPlay(state, HUMAN, 0, 0).hands[HUMAN][0]?.faceUp).toBe(true);
  });

  it('山札が空なら枠は空いたままになる（詰めない）', () => {
    const state = makeState({
      hands: [[card(6), card(9), null, null], [null, null, null, null]],
      stocks: [[], []],
    });
    const next = applyPlay(state, HUMAN, 0, 0);
    expect(next.hands[HUMAN][0]).toBeNull();
    // 位置の記憶が壊れないよう、残りの札は動かさない
    expect(next.hands[HUMAN][1]?.rank).toBe(9);
  });

  it('つながらない札は出せない（同じ局面が返る）', () => {
    const state = makeState({
      piles: [card(7), card(7, 'heart')],
      hands: [[card(10), null, null, null], [null, null, null, null]],
    });
    expect(applyPlay(state, HUMAN, 0, 0)).toBe(state);
  });

  it('先を越された手は黙って捨てられる（リアルタイムの調停）', () => {
    const state = makeState({
      piles: [card(7), card(3, 'heart')],
      hands: [[card(6), null, null, null], [card(8), null, null, null]],
      stocks: [[], []],
    });
    // CPUが先に 8 を出して台札が 7 → 8 に替わると、6 はもう出せない
    const taken = applyPlay(state, CPU, 0, 0);
    expect(topOf(taken, 0)?.rank).toBe(8);
    expect(applyPlay(taken, HUMAN, 0, 0)).toBe(taken);
  });

  it('空の枠・存在しない台札には出せない', () => {
    const state = makeState({ hands: [[null, null, null, null], [null, null, null, null]] });
    expect(applyPlay(state, HUMAN, 0, 0)).toBe(state);
    expect(applyPlay(state, HUMAN, 0, 5)).toBe(state);
  });

  it('相手の札・台札は動かさない', () => {
    const state = makeState({
      hands: [[card(6), null, null, null], [card(12), null, null, null]],
      stocks: [[], [card(3)]],
    });
    const next = applyPlay(state, HUMAN, 0, 0);
    expect(next.hands[CPU]).toEqual(state.hands[CPU]);
    expect(next.stocks[CPU]).toEqual(state.stocks[CPU]);
    expect(next.piles[1]).toBe(state.piles[1]);
  });

  it('元の局面を壊さない（イミュータブル）', () => {
    const state = makeState({
      hands: [[card(6), null, null, null], [null, null, null, null]],
      stocks: [[card(11)], []],
    });
    applyPlay(state, HUMAN, 0, 0);
    expect(topOf(state, 0)?.rank).toBe(7);
    expect(state.hands[HUMAN][0]?.rank).toBe(6);
    expect(state.stocks[HUMAN]).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- 決着

describe('決着', () => {
  it('山札と場札を出し切った人の勝ち', () => {
    const state = makeState({
      hands: [[card(6), null, null, null], [card(12), null, null, null]],
      stocks: [[], []],
    });
    const next = applyPlay(state, HUMAN, 0, 0);
    expect(next.finished).toBe(true);
    expect(next.winner).toBe(HUMAN);
    expect(outcome(next)).toBe('win');
    expect(remainingCards(next, HUMAN)).toBe(0);
  });

  it('CPUが出し切ったら人間から見て負け', () => {
    const state = makeState({
      hands: [[card(6), null, null, null], [card(8), null, null, null]],
      stocks: [[], []],
    });
    const next = applyPlay(state, CPU, 0, 1);
    expect(next.winner).toBe(CPU);
    expect(outcome(next)).toBe('loss');
  });

  it('決着後は出せない（余計な手が通らない）', () => {
    const done = applyPlay(
      makeState({
        hands: [[card(6), null, null, null], [card(8), null, null, null]],
        stocks: [[], []],
      }),
      HUMAN,
      0,
      0,
    );
    expect(applyPlay(done, CPU, 0, 1)).toBe(done);
    expect(chooseCpuPlay(done, constRng(1))).toBeNull();
  });

  it('決着していなければ outcome は null', () => {
    expect(outcome(makeState({}))).toBeNull();
  });
});

// ---------------------------------------------------------------- 手詰まりと合図

describe('isStuck / applyFlip', () => {
  const stuck = makeState({
    piles: [card(7), card(7, 'heart')],
    hands: [[card(10), null, null, null], [card(4), null, null, null]],
    stocks: [[card(2, 'club')], [card(5, 'diamond')]],
  });

  it('双方とも出せないときだけ手詰まりになる', () => {
    expect(canPlay(stuck, HUMAN)).toBe(false);
    expect(canPlay(stuck, CPU)).toBe(false);
    expect(isStuck(stuck)).toBe(true);
  });

  it('片方でも出せるなら手詰まりではない', () => {
    const playable = makeState({
      piles: [card(7), card(7, 'heart')],
      hands: [[card(10), null, null, null], [card(6), null, null, null]],
    });
    expect(isStuck(playable)).toBe(false);
  });

  it('合図でおたがいの山札から1枚ずつ台札に重なる', () => {
    const next = applyFlip(stuck);
    expect(topOf(next, 0)?.rank).toBe(2);
    expect(topOf(next, 1)?.rank).toBe(5);
    expect(next.stocks[HUMAN]).toHaveLength(0);
    expect(next.stocks[CPU]).toHaveLength(0);
  });

  it('めくった札は表向きになる', () => {
    const hidden = makeState({
      piles: [card(7), card(7, 'heart')],
      hands: [[card(10), null, null, null], [card(4), null, null, null]],
      stocks: [[{ ...card(2, 'club'), faceUp: false }], [{ ...card(5), faceUp: false }]],
    });
    const flipped = applyFlip(hidden);
    expect([topOf(flipped, 0), topOf(flipped, 1)].every((c) => c?.faceUp)).toBe(true);
  });

  it('手詰まりでないときの合図は何もしない', () => {
    const playable = makeState({
      hands: [[card(6), null, null, null], [null, null, null, null]],
      stocks: [[card(2)], [card(5)]],
    });
    expect(applyFlip(playable)).toBe(playable);
  });

  it('片方の山札が尽きていたら、相手の山札から台札を出す', () => {
    const state = makeState({
      piles: [card(7), card(7, 'heart')],
      hands: [[card(10), null, null, null], [card(4), null, null, null]],
      stocks: [[], [card(2, 'club'), card(5, 'diamond')]],
    });
    const next = applyFlip(state);
    expect(topOf(next, 0)).not.toBeNull();
    expect(topOf(next, 1)).not.toBeNull();
    expect(next.stocks[CPU]).toHaveLength(0);
  });

  it('開始の合図（台札が空）でも同じ関数で置ける', () => {
    const before = newGame(DEFAULT_OPTIONS, seededRng(3));
    const started = applyFlip(before);
    expect(started.started).toBe(true);
    expect(started.piles.every((stack) => stack.length === 1)).toBe(true);
    expect(started.stocks[HUMAN]).toHaveLength(DEAL_SIZE - HAND_SIZE - 1);
    // 26枚 = 場札4 ＋ 山札21 ＋ 台札1
    expect(remainingCards(started, HUMAN)).toBe(DEAL_SIZE - 1);
    expect(allCards(started)).toHaveLength(52);
  });

  it('合図で山札を出し切ったらそのまま勝ちになる', () => {
    const state = makeState({
      piles: [card(7), card(7, 'heart')],
      hands: [[null, null, null, null], [card(4), null, null, null]],
      stocks: [[card(2, 'club')], [card(5, 'diamond')]],
    });
    const next = applyFlip(state);
    expect(next.finished).toBe(true);
    expect(next.winner).toBe(HUMAN);
  });
});

describe('山札が尽きた手詰まり（仕様書に無い場面）', () => {
  const dead = makeState({
    piles: [card(7), card(7, 'heart')],
    hands: [[card(10), card(11), null, null], [card(4), null, null, null]],
    stocks: [[], []],
  });

  it('めくる札が1枚も無ければ deadlock', () => {
    expect(isStuck(dead)).toBe(true);
    expect(isDeadlock(dead)).toBe(true);
  });

  it('残り枚数の少ないほうの勝ちにして、画面を止めない', () => {
    const next = applyFlip(dead);
    expect(next.finished).toBe(true);
    expect(next.deadlocked).toBe(true);
    expect(next.winner).toBe(CPU); // 人間2枚 対 CPU1枚
    expect(outcome(next)).toBe('loss');
  });

  it('残り枚数が同じなら引き分け', () => {
    const even = makeState({
      piles: [card(7), card(7, 'heart')],
      hands: [[card(10), null, null, null], [card(4), null, null, null]],
      stocks: [[], []],
    });
    const next = applyFlip(even);
    expect(next.winner).toBeNull();
    expect(outcome(next)).toBe('draw');
  });

  it('山札が残っているうちは deadlock にしない', () => {
    const alive = makeState({
      piles: [card(7), card(7, 'heart')],
      hands: [[card(10), null, null, null], [card(4), null, null, null]],
      stocks: [[], [card(2)]],
    });
    expect(isStuck(alive)).toBe(true);
    expect(isDeadlock(alive)).toBe(false);
    expect(applyFlip(alive).finished).toBe(false);
  });
});

// ---------------------------------------------------------------- CPU

describe('chooseCpuPlay', () => {
  const state = makeState({
    piles: [card(7), card(13, 'heart')],
    hands: [[null, null, null, null], [card(6), card(9), card(1, 'club'), null]],
  });

  it('出せる手だけを選ぶ', () => {
    const moves = playableMoves(state, CPU);
    expect(moves).toEqual([
      { slot: 0, pile: 0 }, // 6 → 7
      { slot: 2, pile: 1 }, // A → K
    ]);
    const chosen = chooseCpuPlay(state, constRng(1));
    expect(moves).toContainEqual(chosen);
  });

  it('見落とせば何も出さない（局面は変わらない）', () => {
    // 0 は必ず MISS_RATE を下回るので、どの手も見落とす
    expect(chooseCpuPlay(state, constRng(0))).toBeNull();
  });

  it('出せる札が無ければ null', () => {
    const none = makeState({
      piles: [card(7), card(7, 'heart')],
      hands: [[null, null, null, null], [card(10), null, null, null]],
    });
    expect(chooseCpuPlay(none, constRng(1))).toBeNull();
  });

  it('始まる前は動かない', () => {
    expect(chooseCpuPlay(newGame(DEFAULT_OPTIONS, seededRng(1)), constRng(1))).toBeNull();
  });

  it('人間の場札は見ない（自分の場札と台札だけで決める）', () => {
    const withHuman = { ...state, hands: [[card(6), card(8), null, null], state.hands[CPU]] };
    expect(playableMoves(withHuman, CPU)).toEqual(playableMoves(state, CPU));
  });

  it('選んだ手はそのまま出せる', () => {
    const move = chooseCpuPlay(state, constRng(1));
    expect(move).not.toBeNull();
    const next = applyPlay(state, CPU, move!.slot, move!.pile);
    expect(next).not.toBe(state);
    expect(next.played[CPU]).toBe(1);
  });
});

describe('CPUの強さ', () => {
  it('強いほど反応が速く、見落としも減る（仕様の2軸）', () => {
    expect(DELAY_MS.easy.min).toBeGreaterThan(DELAY_MS.normal.min);
    expect(DELAY_MS.normal.min).toBeGreaterThan(DELAY_MS.hard.min);
    expect(MISS_RATE.easy).toBeGreaterThan(MISS_RATE.normal);
    expect(MISS_RATE.normal).toBeGreaterThan(MISS_RATE.hard);
  });

  it('最強でも人間らしい遅延を残す（理不尽にしない）', () => {
    expect(DELAY_MS.hard.min).toBeGreaterThanOrEqual(500);
    for (const level of CPU_LEVELS) {
      expect(DELAY_MS[level].max).toBeGreaterThan(DELAY_MS[level].min);
      expect(MISS_RATE[level]).toBeGreaterThan(0);
      expect(MISS_RATE[level]).toBeLessThan(1);
    }
  });

  it('cpuDelay は強さの幅に収まる', () => {
    for (const level of CPU_LEVELS) {
      const { min, max } = DELAY_MS[level];
      expect(cpuDelay(level, constRng(0))).toBe(min);
      expect(cpuDelay(level, constRng(0.999))).toBeLessThan(max);
      for (const seed of [1, 2, 3, 4, 5]) {
        const ms = cpuDelay(level, seededRng(seed));
        expect(ms).toBeGreaterThanOrEqual(min);
        expect(ms).toBeLessThanOrEqual(max);
      }
    }
  });

  it('3段階すべてにラベルと説明がある（画面と解説の単一の情報源）', () => {
    expect(CPU_LEVELS).toHaveLength(3);
    for (const level of CPU_LEVELS) {
      expect(LEVEL_LABELS[level]).toBeTruthy();
      expect(LEVEL_NOTES[level]).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------- 記録の区分

describe('variantOf', () => {
  it('強さごとに別の記録になる（仕様の cpu-{強さ}）', () => {
    expect(variantOf({ level: 'easy' })).toBe('cpu-easy');
    expect(variantOf({ level: 'hard' })).toBe('cpu-hard');
    expect(new Set(CPU_LEVELS.map((level) => variantOf({ level }))).size).toBe(CPU_LEVELS.length);
  });
});

// ---------------------------------------------------------------- 通し

describe('通しで遊ぶ', () => {
  /**
   * 人間もCPUも「出せるなら必ず出す」で最後まで進める。
   * 途中で止まらないこと・札が増減しないことを見る（進行そのものの回帰テスト）。
   */
  it('どの配りでも必ず決着し、52枚のまま増えも減りもしない', () => {
    for (const seed of [1, 2, 3, 7, 11, 23, 101]) {
      let state = applyFlip(newGame(DEFAULT_OPTIONS, seededRng(seed)));
      let guard = 0;

      while (!state.finished) {
        expect(guard += 1, `seed ${seed} が終わらない`).toBeLessThan(2000);

        const mine = playableMoves(state, HUMAN);
        const theirs = playableMoves(state, CPU);
        if (mine.length > 0) {
          state = applyPlay(state, HUMAN, mine[0].slot, mine[0].pile);
        } else if (theirs.length > 0) {
          state = applyPlay(state, CPU, theirs[0].slot, theirs[0].pile);
        } else {
          expect(isStuck(state)).toBe(true);
          state = applyFlip(state);
        }
        expect(allCards(state), `seed ${seed} で札が増減した`).toHaveLength(52);
      }

      expect(outcome(state)).not.toBeNull();
      // 出し切っての勝ちなら、勝った人の札は0枚。山札が尽きた手詰まり（deadlocked）は
      // 残り枚数の少ないほうの勝ちなので、0枚とは限らない
      if (state.deadlocked) {
        if (state.winner !== null) {
          const loser = state.winner === HUMAN ? CPU : HUMAN;
          expect(remainingCards(state, state.winner)).toBeLessThan(remainingCards(state, loser));
        }
      } else {
        expect(state.winner).not.toBeNull();
        expect(remainingCards(state, state.winner as number)).toBe(0);
      }
    }
  });

  it('CPUだけに任せても決着する（見落としがあっても止まらない）', () => {
    const rng = seededRng(42);
    let state = applyFlip(newGame({ level: 'hard' }, seededRng(9)));
    let guard = 0;

    while (!state.finished) {
      expect((guard += 1)).toBeLessThan(5000);
      const move = chooseCpuPlay(state, rng);
      if (move) {
        state = applyPlay(state, CPU, move.slot, move.pile);
      } else if (isStuck(state)) {
        state = applyFlip(state);
      } else {
        // 人間が出さないと進まない局面。人間の手を1つ進める
        const mine = playableMoves(state, HUMAN);
        if (mine.length === 0) break;
        state = applyPlay(state, HUMAN, mine[0].slot, mine[0].pile);
      }
    }
    expect(state.finished).toBe(true);
  });
});
