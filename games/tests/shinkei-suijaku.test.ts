import { describe, expect, it } from 'vitest';
import { seededRng, type Card } from '@/lib/cards';
import {
  applyFlip,
  canFlip,
  chooseCpuFlip,
  COLUMNS,
  CPU,
  CPU_LEVELS,
  DEFAULT_OPTIONS,
  HUMAN,
  knownPair,
  knownPositions,
  makeCards,
  MEMORY_RATE,
  newGame,
  openPositions,
  outcome,
  playerCount,
  remaining,
  resolve,
  sizeLabel,
  SIZES,
  takenPairs,
  variantOf,
  type MemoryState,
  type Options,
  type Size,
} from '@/lib/shinkei-suijaku';

/**
 * 神経衰弱（docs/features/game-shinkei-suijaku.md）のテスト。
 *
 * 見張っているのは、仕様書に書いてある取り決めそのもの:
 * 組は同じ数字・当たったら連続手番・はずれたら裏へ戻して手番交代・
 * CPUは「表になった札」しか覚えず強さは記憶率だけで決まること。
 */

/** 常に同じ値を返す乱数（確率の分岐を固定する） */
const constRng = (value: number) => () => value;

/** その局面から、指定した数字の札がある位置 */
function positionsOfRank(state: MemoryState, rank: number): number[] {
  return state.cards
    .map((c, i) => ({ c, i }))
    .filter(({ c, i }) => c.rank === rank && state.taken[i] === null)
    .map(({ i }) => i);
}

/** いま場に残っている組（同じ数字の2枚）をひと組さがす */
function anyPair(state: MemoryState): [number, number] {
  const open = openPositions(state);
  for (let i = 0; i < open.length; i += 1) {
    for (let j = i + 1; j < open.length; j += 1) {
      if (state.cards[open[i]].rank === state.cards[open[j]].rank) return [open[i], open[j]];
    }
  }
  throw new Error('場に組が残っていない');
}

/** いま場に残っている「組にならない2枚」をさがす */
function anyMiss(state: MemoryState): [number, number] {
  const open = openPositions(state);
  for (let i = 0; i < open.length; i += 1) {
    for (let j = i + 1; j < open.length; j += 1) {
      if (state.cards[open[i]].rank !== state.cards[open[j]].rank) return [open[i], open[j]];
    }
  }
  throw new Error('場にはずれの組み合わせが無い');
}

/** 2枚めくって判定まで進める（後始末は resolve に任せる） */
function flipTwo(state: MemoryState, a: number, b: number, rng = constRng(1)): MemoryState {
  return applyFlip(applyFlip(state, a, rng), b, rng);
}

const key = (card: Card) => `${card.suit}-${card.rank}`;

// ---------------------------------------------------------------- 場を作る

describe('makeCards', () => {
  it('指定した枚数ちょうどを作る', () => {
    for (const size of SIZES) {
      expect(makeCards(size, seededRng(1)).length).toBe(size);
    }
  });

  it('同じ札（スート×数字）を二度使わない', () => {
    for (const size of SIZES) {
      const cards = makeCards(size, seededRng(size));
      expect(new Set(cards.map(key)).size).toBe(size);
    }
  });

  it('どの数字も必ず偶数枚（＝余る札が出ない）', () => {
    for (const size of SIZES) {
      const counts = new Map<number, number>();
      for (const card of makeCards(size, seededRng(size + 7))) {
        counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
      }
      for (const [rank, n] of counts) {
        expect(n % 2, `数字 ${rank} が ${n} 枚`).toBe(0);
      }
    }
  });

  it('12枚なら6つの別々の数字（同じ数字が4枚並ばない）', () => {
    const cards = makeCards(12, seededRng(3));
    expect(new Set(cards.map((c) => c.rank)).size).toBe(6);
  });

  it('52枚は13の数字が4枚ずつ（＝26組）', () => {
    const cards = makeCards(52, seededRng(5));
    const counts = new Map<number, number>();
    for (const card of cards) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
    expect(counts.size).toBe(13);
    expect([...counts.values()].every((n) => n === 4)).toBe(true);
  });

  it('全部裏向きで、id は場の位置と一致する（Reactのkeyに使う）', () => {
    const cards = makeCards(20, seededRng(9));
    expect(cards.every((c) => !c.faceUp)).toBe(true);
    expect(cards.map((c) => c.id)).toEqual(cards.map((_, i) => i));
  });

  it('乱数が同じなら同じ並びになる（テストで再現できる）', () => {
    expect(makeCards(20, seededRng(42)).map(key)).toEqual(makeCards(20, seededRng(42)).map(key));
  });

  it('乱数が違えば並びも変わる', () => {
    expect(makeCards(28, seededRng(1)).map(key)).not.toEqual(makeCards(28, seededRng(2)).map(key));
  });
});

describe('枚数と列数', () => {
  it('どの枚数も偶数で、列数が決まっている', () => {
    for (const size of SIZES) {
      expect(size % 2).toBe(0);
      expect(COLUMNS[size]).toBeGreaterThan(0);
    }
  });

  it('列数を増やしすぎない（1枚が細くなってスマホで読めなくなる）', () => {
    for (const size of SIZES) {
      expect(COLUMNS[size]).toBeLessThanOrEqual(9);
    }
  });

  it('枚数の表示は「12枚（6組）」の形', () => {
    expect(sizeLabel(12)).toBe('12枚（6組）');
    expect(sizeLabel(52)).toBe('52枚（26組）');
  });
});

// ---------------------------------------------------------------- めくる

describe('newGame', () => {
  it('全部が裏向き・誰も取っていない状態から始まる', () => {
    const state = newGame({ mode: 'solo', size: 20, level: 'normal' }, seededRng(1));
    expect(state.cards).toHaveLength(20);
    expect(remaining(state)).toBe(20);
    expect(state.flipped).toEqual([]);
    expect(state.moves).toBe(0);
    expect(state.judge).toBeNull();
    expect(state.finished).toBe(false);
    expect(state.turn).toBe(HUMAN);
  });

  it('ひとりでは席が1つ、CPU対戦では2つ', () => {
    expect(playerCount('solo')).toBe(1);
    expect(playerCount('cpu')).toBe(2);
    expect(newGame({ ...DEFAULT_OPTIONS, mode: 'solo' }, seededRng(1)).pairs).toEqual([0]);
    expect(newGame({ ...DEFAULT_OPTIONS, mode: 'cpu' }, seededRng(1)).pairs).toEqual([0, 0]);
  });
});

describe('canFlip / applyFlip', () => {
  const base = newGame({ mode: 'solo', size: 12, level: 'normal' }, seededRng(11));

  it('1枚目をめくると表になる。手数はまだ増えない', () => {
    const next = applyFlip(base, 3, constRng(1));
    expect(next.cards[3].faceUp).toBe(true);
    expect(next.flipped).toEqual([3]);
    expect(next.moves).toBe(0);
    expect(next.judge).toBeNull();
  });

  it('2枚めくると判定が立ち、手数が1増える（2枚で1手）', () => {
    const [a, b] = anyPair(base);
    const next = flipTwo(base, a, b);
    expect(next.flipped).toEqual([a, b]);
    expect(next.moves).toBe(1);
    expect(next.judge).toBe('hit');
  });

  it('数字が違えば はずれ', () => {
    const [a, b] = anyMiss(base);
    expect(flipTwo(base, a, b).judge).toBe('miss');
  });

  it('同じ札は2度めくれない', () => {
    const one = applyFlip(base, 5, constRng(1));
    expect(canFlip(one, 5)).toBe(false);
    expect(applyFlip(one, 5, constRng(1))).toBe(one);
  });

  it('判定待ちのあいだは3枚目をめくれない', () => {
    const [a, b] = anyMiss(base);
    const two = flipTwo(base, a, b);
    const third = openPositions(two)[0];
    expect(canFlip(two, third)).toBe(false);
    expect(applyFlip(two, third, constRng(1))).toBe(two);
  });

  it('取られた札と、場に無い位置はめくれない', () => {
    const [a, b] = anyPair(base);
    const took = resolve(flipTwo(base, a, b));
    expect(canFlip(took, a)).toBe(false);
    expect(canFlip(took, -1)).toBe(false);
    expect(canFlip(took, took.cards.length)).toBe(false);
  });

  it('決着後は何もめくれない', () => {
    const done = { ...base, finished: true };
    expect(canFlip(done, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------- 判定

describe('resolve', () => {
  const base = newGame({ mode: 'cpu', size: 12, level: 'normal' }, seededRng(21));

  it('当たったら取れて、同じ人がもう一度めくる（連続手番）', () => {
    const [a, b] = anyPair(base);
    const next = resolve(flipTwo(base, a, b));
    expect(next.taken[a]).toBe(HUMAN);
    expect(next.taken[b]).toBe(HUMAN);
    expect(next.pairs).toEqual([1, 0]);
    expect(next.turn).toBe(HUMAN);
    expect(next.flipped).toEqual([]);
    expect(next.judge).toBeNull();
    expect(remaining(next)).toBe(10);
  });

  it('はずれたら裏へ戻って手番が移る', () => {
    const [a, b] = anyMiss(base);
    const next = resolve(flipTwo(base, a, b));
    expect(next.cards[a].faceUp).toBe(false);
    expect(next.cards[b].faceUp).toBe(false);
    expect(next.taken[a]).toBeNull();
    expect(next.pairs).toEqual([0, 0]);
    expect(next.turn).toBe(CPU);
    expect(next.flipped).toEqual([]);
  });

  it('ひとりでは、はずれても手番は動かない', () => {
    const solo = newGame({ mode: 'solo', size: 12, level: 'normal' }, seededRng(22));
    const [a, b] = anyMiss(solo);
    expect(resolve(flipTwo(solo, a, b)).turn).toBe(HUMAN);
  });

  it('判定待ちでなければ何もしない', () => {
    expect(resolve(base)).toBe(base);
  });

  it('取った札はCPUの記憶から外れる（場に無い札を覚えていても意味がない）', () => {
    const [a, b] = anyPair(base);
    // 記憶率100%として、めくった2枚を必ず覚えさせる
    const two = flipTwo(base, a, b, constRng(0));
    expect(two.cpuKnown).toEqual(expect.arrayContaining([a, b]));
    expect(resolve(two).cpuKnown).not.toEqual(expect.arrayContaining([a, b]));
  });

  it('最後の組を取ると決着する', () => {
    let state = newGame({ mode: 'solo', size: 12, level: 'normal' }, seededRng(23));
    for (let i = 0; i < 6; i += 1) {
      const [a, b] = anyPair(state);
      state = resolve(flipTwo(state, a, b));
    }
    expect(state.finished).toBe(true);
    expect(remaining(state)).toBe(0);
    expect(takenPairs(state)).toBe(6);
    expect(state.moves).toBe(6);
  });
});

describe('outcome', () => {
  const base = newGame({ mode: 'cpu', size: 12, level: 'normal' }, seededRng(31));

  it('決着していなければ null', () => {
    expect(outcome(base)).toBeNull();
  });

  it('ひとりでは全部そろえた時点でクリア', () => {
    const solo = newGame({ mode: 'solo', size: 12, level: 'normal' }, seededRng(32));
    expect(outcome({ ...solo, finished: true })).toBe('win');
  });

  it('CPU対戦は取った組数で勝敗が決まる', () => {
    expect(outcome({ ...base, finished: true, pairs: [4, 2] })).toBe('win');
    expect(outcome({ ...base, finished: true, pairs: [2, 4] })).toBe('loss');
    expect(outcome({ ...base, finished: true, pairs: [3, 3] })).toBe('draw');
  });
});

// ---------------------------------------------------------------- CPU

describe('CPUの記憶', () => {
  const base = newGame({ mode: 'cpu', size: 20, level: 'normal' }, seededRng(41));

  it('表になった札を、記憶率をくぐったときだけ覚える', () => {
    // rng が 0 なら必ず覚え、1 なら決して覚えない（MEMORY_RATE は 0 < r < 1）
    expect(applyFlip(base, 4, constRng(0)).cpuKnown).toEqual([4]);
    expect(applyFlip(base, 4, constRng(1)).cpuKnown).toEqual([]);
  });

  it('強さは記憶率だけで表す（弱 < 普通 < 強、完全記憶にはしない）', () => {
    const rates = CPU_LEVELS.map((level) => MEMORY_RATE[level]);
    expect(rates).toEqual([...rates].sort((a, b) => a - b));
    expect(rates[0]).toBeGreaterThan(0);
    expect(rates[rates.length - 1]).toBeLessThan(1);
  });

  it('ひとりでは記憶を持たない（CPUがいない）', () => {
    const solo = newGame({ mode: 'solo', size: 12, level: 'hard' }, seededRng(42));
    expect(applyFlip(solo, 0, constRng(0)).cpuKnown).toEqual([]);
  });

  it('自分がめくった札も、相手がめくった札も同じように覚える', () => {
    const cpuTurn = { ...base, turn: CPU };
    expect(applyFlip(cpuTurn, 7, constRng(0)).cpuKnown).toEqual([7]);
  });

  it('覚えている位置のうち、取られた札は数に入らない', () => {
    const [a, b] = anyPair(base);
    const took = resolve(flipTwo(base, a, b, constRng(0)));
    expect(knownPositions(took)).not.toContain(a);
  });
});

describe('chooseCpuFlip', () => {
  const base = newGame({ mode: 'cpu', size: 20, level: 'hard' }, seededRng(51));

  it('覚えている札だけで組が作れるなら、その1枚目をめくる', () => {
    const [a, b] = anyPair(base);
    const state = { ...base, turn: CPU, cpuKnown: [a, b] };
    expect(knownPair(state)).toEqual([a, b]);
    expect(chooseCpuFlip(state, constRng(0))).toBe(a);
  });

  it('1枚目をめくったら、同じ数字を覚えていればそれを2枚目にする', () => {
    const [a, b] = anyPair(base);
    const state = applyFlip({ ...base, turn: CPU, cpuKnown: [b] }, a, constRng(1));
    expect(chooseCpuFlip(state, constRng(0))).toBe(b);
  });

  it('組が作れないときは、まだ覚えていない札を優先してめくる', () => {
    const known = openPositions(base).slice(0, 4);
    // 覚えている4枚が組にならないよう、数字がすべて違う位置だけを選ぶ
    const distinct = openPositions(base).filter(
      (p, i, list) => list.findIndex((q) => base.cards[q].rank === base.cards[p].rank) === i,
    );
    const state = { ...base, turn: CPU, cpuKnown: distinct.slice(0, 3) };
    expect(knownPair(state)).toBeNull();
    for (const value of [0, 0.3, 0.6, 0.99]) {
      expect(state.cpuKnown).not.toContain(chooseCpuFlip(state, constRng(value)));
    }
    expect(known.length).toBeGreaterThan(0);
  });

  it('何も覚えていなくても必ず1枚めくる（場に札がある限り）', () => {
    const state = { ...base, turn: CPU };
    const pos = chooseCpuFlip(state, constRng(0.5));
    expect(pos).not.toBeNull();
    expect(canFlip(state, pos as number)).toBe(true);
  });

  it('判定待ち・決着後・場が空なら null', () => {
    const [a, b] = anyMiss(base);
    expect(chooseCpuFlip(flipTwo(base, a, b))).toBeNull();
    expect(chooseCpuFlip({ ...base, finished: true })).toBeNull();
    expect(chooseCpuFlip({ ...base, taken: base.taken.map(() => HUMAN) })).toBeNull();
  });

  it('記憶が完璧なら、覚えた組を必ず取り切る（記憶率だけが強さになっている）', () => {
    // 全部を覚えさせた状態から、CPUだけでめくり続ける
    let state: MemoryState = {
      ...base,
      turn: CPU,
      cpuKnown: base.cards.map((_, i) => i),
    };
    for (let guard = 0; guard < 200 && !state.finished; guard += 1) {
      const pos = chooseCpuFlip(state, constRng(0));
      expect(pos).not.toBeNull();
      state = applyFlip(state, pos as number, constRng(0));
      if (state.judge !== null) state = resolve(state);
    }
    expect(state.finished).toBe(true);
    // 覚えている組しか取りに行かないので、1手も外さない
    expect(state.moves).toBe(base.size / 2);
    expect(state.pairs[CPU]).toBe(base.size / 2);
  });
});

// ---------------------------------------------------------------- 通し

describe('最後まで遊べる', () => {
  const play = (options: Options, seed: number): MemoryState => {
    let state = newGame(options, seededRng(seed));
    const rng = seededRng(seed + 1000);
    for (let guard = 0; guard < 5000 && !state.finished; guard += 1) {
      if (state.judge !== null) {
        state = resolve(state);
        continue;
      }
      const pos =
        state.turn === CPU
          ? chooseCpuFlip(state, rng)
          : openPositions(state)[Math.floor(rng() * openPositions(state).length)];
      if (pos === null || pos === undefined) break;
      state = applyFlip(state, pos, rng);
    }
    return state;
  };

  it('どの枚数・どの強さでも必ず決着し、取った組の合計が全体と一致する', () => {
    for (const size of SIZES) {
      for (const mode of ['solo', 'cpu'] as const) {
        const state = play({ mode, size: size as Size, level: 'normal' }, size + (mode === 'cpu' ? 1 : 0));
        expect(state.finished, `${mode} ${size}枚が終わらない`).toBe(true);
        expect(remaining(state)).toBe(0);
        expect(takenPairs(state)).toBe(size / 2);
        expect(state.moves).toBeGreaterThanOrEqual(size / 2);
      }
    }
  });

  it('CPU対戦は必ず勝ち・負け・引き分けのどれかで終わる', () => {
    for (const level of CPU_LEVELS) {
      const state = play({ mode: 'cpu', size: 20, level }, 77);
      expect(['win', 'loss', 'draw']).toContain(outcome(state));
      expect(state.pairs[HUMAN] + state.pairs[CPU]).toBe(10);
    }
  });
});

describe('記録の区分', () => {
  it('遊び方・枚数・強さごとに別の記録として持つ', () => {
    expect(variantOf({ mode: 'solo', size: 20, level: 'normal' })).toBe('solo-20');
    // ひとりでは強さが記録に影響しない（CPUがいないため）
    expect(variantOf({ mode: 'solo', size: 20, level: 'hard' })).toBe('solo-20');
    expect(variantOf({ mode: 'cpu', size: 52, level: 'hard' })).toBe('cpu-52-hard');
  });

  it('区分が重ならない', () => {
    const keys = new Set<string>();
    for (const size of SIZES) {
      keys.add(variantOf({ mode: 'solo', size, level: 'normal' }));
      for (const level of CPU_LEVELS) keys.add(variantOf({ mode: 'cpu', size, level }));
    }
    expect(keys.size).toBe(SIZES.length * (1 + CPU_LEVELS.length));
  });
});
