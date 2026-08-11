import { describe, expect, it } from 'vitest';
import { type Card, type Suit } from '@/lib/cards';
import {
  autoMove,
  canStack,
  canStackFoundation,
  deal,
  FREE_COUNT,
  hasAnyMove,
  isMovableRun,
  isWon,
  maxMovable,
  move,
  newSeed,
  TABLEAU_COLS,
  type FreecellState,
} from '@/lib/freecell';

const card = (suit: Suit, rank: number): Card => ({
  suit,
  rank: rank as Card['rank'],
  faceUp: true,
  id: suit.charCodeAt(0) * 100 + rank,
});

/** 空の状態を作ってテストごとに必要な札だけ置く */
const empty = (): FreecellState => ({
  free: [null, null, null, null],
  foundations: { spade: [], heart: [], diamond: [], club: [] },
  tableau: [[], [], [], [], [], [], [], []],
  moves: 0,
  seed: 1,
});

describe('deal', () => {
  const s = deal(1);

  it('場札は8列。左4列が7枚、右4列が6枚', () => {
    expect(s.tableau).toHaveLength(TABLEAU_COLS);
    s.tableau.forEach((pile, col) => {
      expect(pile).toHaveLength(col < 4 ? 7 : 6);
    });
  });

  it('52枚すべてが場札にあり、全部表向きでIDに重複がない', () => {
    const all = s.tableau.flat();
    expect(all).toHaveLength(52);
    expect(all.every((c) => c.faceUp)).toBe(true);
    expect(new Set(all.map((c) => c.id)).size).toBe(52);
  });

  it('フリーセルは4つとも空で、ホームセルも空', () => {
    expect(s.free).toHaveLength(FREE_COUNT);
    expect(s.free.every((c) => c === null)).toBe(true);
    expect(Object.values(s.foundations).every((p) => p.length === 0)).toBe(true);
    expect(s.moves).toBe(0);
  });

  it('同じシードなら同じ配り、違うシードなら違う配り', () => {
    const ids = (st: FreecellState) => st.tableau.flat().map((c) => c.id).join(',');
    expect(ids(deal(1))).toBe(ids(s));
    expect(ids(deal(2))).not.toBe(ids(s));
    expect(deal(7).seed).toBe(7);
  });

  it('newSeed は1以上の整数を返す', () => {
    expect(newSeed(() => 0)).toBe(1);
    expect(newSeed(() => 0.5)).toBe(500001);
    expect(Number.isInteger(newSeed())).toBe(true);
  });
});

describe('canStack', () => {
  it('色違いで1つ小さいランクなら置ける', () => {
    expect(canStack(card('heart', 6), card('spade', 7))).toBe(true);
    expect(canStack(card('spade', 6), card('diamond', 7))).toBe(true);
  });

  it('同じ色・ランク違いは置けない', () => {
    expect(canStack(card('heart', 6), card('diamond', 7))).toBe(false);
    expect(canStack(card('heart', 5), card('spade', 7))).toBe(false);
    expect(canStack(card('heart', 8), card('spade', 7))).toBe(false);
  });

  it('空列にはどのカードも置ける（クロンダイクと違いKに限らない）', () => {
    expect(canStack(card('heart', 6), undefined)).toBe(true);
    expect(canStack(card('spade', 13), undefined)).toBe(true);
  });
});

describe('canStackFoundation', () => {
  it('空ならAだけ、以降は同スートで1つ大きい札', () => {
    const s = empty();
    expect(canStackFoundation(card('spade', 1), s)).toBe(true);
    expect(canStackFoundation(card('spade', 2), s)).toBe(false);

    const withAce: FreecellState = {
      ...s,
      foundations: { ...s.foundations, spade: [card('spade', 1)] },
    };
    expect(canStackFoundation(card('spade', 2), withAce)).toBe(true);
    expect(canStackFoundation(card('spade', 3), withAce)).toBe(false);
    // スートごとに独立している
    expect(canStackFoundation(card('heart', 2), withAce)).toBe(false);
  });
});

describe('isMovableRun', () => {
  const pile = [card('club', 10), card('heart', 9), card('spade', 8), card('diamond', 7)];

  it('色違い降順に連続していれば true', () => {
    expect(isMovableRun(pile, 1)).toBe(true);
    expect(isMovableRun(pile, 3)).toBe(true);
    expect(isMovableRun(pile, 0)).toBe(true);
  });

  it('並びが途切れていれば false', () => {
    const broken = [card('club', 10), card('spade', 9)];
    expect(isMovableRun(broken, 0)).toBe(false);
    expect(isMovableRun(broken, 1)).toBe(true);
  });

  it('範囲外は false', () => {
    expect(isMovableRun(pile, -1)).toBe(false);
    expect(isMovableRun(pile, 4)).toBe(false);
  });
});

describe('maxMovable', () => {
  it('(空きフリーセル+1) × 2^(空き列数)', () => {
    const s = empty();
    // フリーセル4空き・場札8列すべて空 → (4+1) × 2^8
    expect(maxMovable(s)).toBe(5 * 256);

    const filled: FreecellState = {
      ...s,
      free: [card('spade', 5), null, null, null],
      tableau: [[card('club', 3)], [card('club', 4)], [], [], [], [], [], []].map((p) => p as Card[]),
    };
    // 空きフリーセル3・空き列6 → 4 × 64
    expect(maxMovable(filled)).toBe(4 * 64);
  });

  it('移動先が空列ならその列は空き列に数えない', () => {
    const s: FreecellState = {
      ...empty(),
      free: [card('spade', 5), card('heart', 5), card('diamond', 5), null],
      tableau: [[card('club', 3)], [], [], [], [], [], [], []].map((p) => p as Card[]),
    };
    // 空きフリーセル1・空き列7 → 2 × 128
    expect(maxMovable(s)).toBe(2 * 128);
    // 空列(1)へ移すなら空き列は6として数える → 2 × 64
    expect(maxMovable(s, 1)).toBe(2 * 64);
    // 移動先が空でなければ引かない
    expect(maxMovable(s, 0)).toBe(2 * 128);
  });

  it('空きが無ければ1枚だけ', () => {
    const s: FreecellState = {
      ...empty(),
      free: [card('spade', 5), card('heart', 5), card('diamond', 5), card('club', 5)],
      tableau: Array.from({ length: 8 }, (_, i) => [card('spade', ((i % 13) + 1) as number)]),
    };
    expect(maxMovable(s)).toBe(1);
  });
});

describe('move', () => {
  it('場札からフリーセルへ1枚', () => {
    const s: FreecellState = { ...empty(), tableau: [[card('spade', 7)], [], [], [], [], [], [], []] };
    const next = move(s, { kind: 'tableau', col: 0, cardIndex: 0 }, { kind: 'free', index: 2 });
    expect(next).not.toBeNull();
    expect(next!.free[2]).toEqual(card('spade', 7));
    expect(next!.tableau[0]).toHaveLength(0);
    expect(next!.moves).toBe(1);
  });

  it('埋まっているフリーセル・範囲外の index には置けない', () => {
    const s: FreecellState = {
      ...empty(),
      free: [card('heart', 2), null, null, null],
      tableau: [[card('spade', 7)], [], [], [], [], [], [], []],
    };
    const from = { kind: 'tableau', col: 0, cardIndex: 0 } as const;
    expect(move(s, from, { kind: 'free', index: 0 })).toBeNull();
    expect(move(s, from, { kind: 'free', index: 9 })).toBeNull();
  });

  it('フリーセルには2枚以上まとめて置けない', () => {
    const s: FreecellState = {
      ...empty(),
      tableau: [[card('spade', 8), card('heart', 7)], [], [], [], [], [], [], []],
    };
    expect(move(s, { kind: 'tableau', col: 0, cardIndex: 0 }, { kind: 'free', index: 0 })).toBeNull();
  });

  it('ホームセルへはAから順にだけ積める', () => {
    const s: FreecellState = {
      ...empty(),
      tableau: [[card('spade', 1)], [card('spade', 3)], [], [], [], [], [], []],
    };
    const afterAce = move(s, { kind: 'tableau', col: 0, cardIndex: 0 }, { kind: 'foundation' });
    expect(afterAce!.foundations.spade).toHaveLength(1);
    // 2を飛ばして3は上げられない
    expect(move(afterAce!, { kind: 'tableau', col: 1, cardIndex: 0 }, { kind: 'foundation' })).toBeNull();
  });

  it('場札は色違い・1つ小さいランクにだけ置ける', () => {
    const s: FreecellState = {
      ...empty(),
      tableau: [[card('spade', 8)], [card('heart', 7)], [card('diamond', 7)], [], [], [], [], []],
    };
    expect(move(s, { kind: 'tableau', col: 1, cardIndex: 0 }, { kind: 'tableau', col: 0 })).not.toBeNull();
    // 同じ列への移動は無効
    expect(move(s, { kind: 'tableau', col: 1, cardIndex: 0 }, { kind: 'tableau', col: 1 })).toBeNull();
    // 赤7の上に赤7は置けない
    expect(move(s, { kind: 'tableau', col: 2, cardIndex: 0 }, { kind: 'tableau', col: 1 })).toBeNull();
  });

  it('並びになっていない札はまとめて動かせない', () => {
    const s: FreecellState = {
      ...empty(),
      // 黒8の下に黒7（色が同じなので並びではない）
      tableau: [[card('spade', 8), card('club', 7)], [card('heart', 9)], [], [], [], [], [], []],
    };
    expect(move(s, { kind: 'tableau', col: 0, cardIndex: 0 }, { kind: 'tableau', col: 1 })).toBeNull();
  });

  it('スーパームーブは空きの数までしか運べない', () => {
    // 空きフリーセル1・空き列0 → 一度に2枚まで
    const base: FreecellState = {
      ...empty(),
      free: [card('spade', 2), card('heart', 2), card('diamond', 2), null],
      tableau: [
        [card('club', 10), card('heart', 9), card('spade', 8)],
        [card('heart', 11)],
        [card('club', 3)],
        [card('club', 4)],
        [card('club', 5)],
        [card('club', 6)],
        [card('club', 13)],
        [card('club', 12)],
      ],
    };
    expect(maxMovable(base)).toBe(2);
    // 10から3枚は運べない
    expect(move(base, { kind: 'tableau', col: 0, cardIndex: 0 }, { kind: 'tableau', col: 1 })).toBeNull();

    // フリーセルをもう1つ空ければ3枚運べる
    const roomier: FreecellState = { ...base, free: [card('spade', 2), card('heart', 2), null, null] };
    expect(maxMovable(roomier)).toBe(3);
    const moved = move(roomier, { kind: 'tableau', col: 0, cardIndex: 0 }, { kind: 'tableau', col: 1 });
    expect(moved).not.toBeNull();
    expect(moved!.tableau[0]).toHaveLength(0);
    expect(moved!.tableau[1].map((c) => c.rank)).toEqual([11, 10, 9, 8]);
  });

  it('空列へ運ぶときはその空列を空きに数えない', () => {
    // 空きフリーセル0・空き列1 → 空列以外へは2枚、空列へは1枚
    const s: FreecellState = {
      ...empty(),
      free: [card('spade', 2), card('heart', 2), card('diamond', 2), card('club', 2)],
      tableau: [
        [card('club', 10), card('heart', 9)],
        [],
        [card('club', 3)],
        [card('club', 4)],
        [card('club', 5)],
        [card('club', 6)],
        [card('club', 13)],
        [card('club', 12)],
      ],
    };
    expect(maxMovable(s)).toBe(2);
    expect(maxMovable(s, 1)).toBe(1);
    expect(move(s, { kind: 'tableau', col: 0, cardIndex: 0 }, { kind: 'tableau', col: 1 })).toBeNull();
    // 1枚だけなら空列へ運べる
    expect(move(s, { kind: 'tableau', col: 0, cardIndex: 1 }, { kind: 'tableau', col: 1 })).not.toBeNull();
  });

  it('フリーセルから場札・ホームセルへ戻せる', () => {
    const s: FreecellState = {
      ...empty(),
      free: [card('heart', 7), card('spade', 1), null, null],
      tableau: [[card('spade', 8)], [], [], [], [], [], [], []],
    };
    const toTableau = move(s, { kind: 'free', index: 0 }, { kind: 'tableau', col: 0 });
    expect(toTableau!.free[0]).toBeNull();
    expect(toTableau!.tableau[0]).toHaveLength(2);

    const toFoundation = move(s, { kind: 'free', index: 1 }, { kind: 'foundation' });
    expect(toFoundation!.foundations.spade).toHaveLength(1);
    expect(toFoundation!.free[1]).toBeNull();

    // 同じフリーセルへの移動は無効
    expect(move(s, { kind: 'free', index: 0 }, { kind: 'free', index: 0 })).toBeNull();
    // 空のフリーセルからは何も動かせない
    expect(move(s, { kind: 'free', index: 2 }, { kind: 'tableau', col: 1 })).toBeNull();
  });

  it('元の状態を書き換えない', () => {
    const s: FreecellState = { ...empty(), tableau: [[card('spade', 1)], [], [], [], [], [], [], []] };
    const snapshot = JSON.stringify(s);
    move(s, { kind: 'tableau', col: 0, cardIndex: 0 }, { kind: 'foundation' });
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe('autoMove', () => {
  it('ホームセルを最優先する', () => {
    const s: FreecellState = {
      ...empty(),
      tableau: [[card('spade', 1)], [card('heart', 2)], [], [], [], [], [], []],
    };
    const next = autoMove(s, { kind: 'tableau', col: 0, cardIndex: 0 });
    expect(next!.foundations.spade).toHaveLength(1);
    expect(next!.tableau[0]).toHaveLength(0);
  });

  it('次に場札。空列より先に札のある列へ置く', () => {
    const s: FreecellState = {
      ...empty(),
      tableau: [[card('heart', 7)], [], [card('spade', 8)], [], [], [], [], []],
    };
    const next = autoMove(s, { kind: 'tableau', col: 0, cardIndex: 0 });
    expect(next!.tableau[2].map((c) => c.rank)).toEqual([8, 7]);
    expect(next!.tableau[1]).toHaveLength(0);
  });

  it('置き場が無ければ空列、それも無ければフリーセルへ逃がす', () => {
    const toEmptyCol: FreecellState = {
      ...empty(),
      tableau: [[card('heart', 7)], [], [], [], [], [], [], []],
    };
    expect(autoMove(toEmptyCol, { kind: 'tableau', col: 0, cardIndex: 0 })!.tableau[1]).toHaveLength(1);

    const toFree: FreecellState = {
      ...empty(),
      tableau: Array.from({ length: 8 }, (_, i) => [card(i % 2 === 0 ? 'spade' : 'heart', 13)]),
    };
    const next = autoMove(toFree, { kind: 'tableau', col: 0, cardIndex: 0 });
    expect(next!.free[0]).not.toBeNull();
    expect(next!.tableau[0]).toHaveLength(0);
  });

  it('動かせないときは null', () => {
    const s: FreecellState = {
      ...empty(),
      free: [card('spade', 9), card('heart', 9), card('diamond', 9), card('club', 9)],
      tableau: Array.from({ length: 8 }, (_, i) => [card(i % 2 === 0 ? 'spade' : 'heart', 13)]),
    };
    expect(autoMove(s, { kind: 'tableau', col: 0, cardIndex: 0 })).toBeNull();
  });
});

describe('isWon', () => {
  it('4スートともKまで積めたら勝ち', () => {
    const full = (suit: Suit) => Array.from({ length: 13 }, (_, i) => card(suit, i + 1));
    const s: FreecellState = {
      ...empty(),
      foundations: {
        spade: full('spade'),
        heart: full('heart'),
        diamond: full('diamond'),
        club: full('club'),
      },
    };
    expect(isWon(s)).toBe(true);
    expect(isWon({ ...s, foundations: { ...s.foundations, club: full('club').slice(0, 12) } })).toBe(false);
    expect(isWon(deal(1))).toBe(false);
  });
});

describe('hasAnyMove', () => {
  /** 詰み: フリーセル4つ埋まり、空列なし、どこにも置けない */
  const stuck = (): FreecellState => ({
    ...empty(),
    // 9はKにもJにも置けない（必要なのは10と12）
    free: [card('spade', 9), card('heart', 9), card('diamond', 9), card('club', 9)],
    tableau: [
      [card('spade', 13)],
      [card('heart', 13)],
      [card('diamond', 13)],
      [card('club', 13)],
      [card('spade', 11)],
      [card('heart', 11)],
      [card('diamond', 11)],
      [card('club', 11)],
    ],
  });

  it('詰んだ盤面では false', () => {
    expect(hasAnyMove(stuck())).toBe(false);
  });

  it('フリーセルが1つでも空いていれば true', () => {
    const s = stuck();
    expect(hasAnyMove({ ...s, free: [null, s.free[1], s.free[2], s.free[3]] })).toBe(true);
  });

  it('空列があれば true', () => {
    const s = stuck();
    expect(hasAnyMove({ ...s, tableau: [[], ...s.tableau.slice(1)] })).toBe(true);
  });

  it('ホームセルへ上げられる札があれば true', () => {
    const s = stuck();
    // 場札の1枚をAに差し替える
    expect(hasAnyMove({ ...s, tableau: [[card('spade', 1)], ...s.tableau.slice(1)] })).toBe(true);
    // フリーセルの1枚をAに差し替える
    expect(hasAnyMove({ ...s, free: [card('spade', 1), s.free[1], s.free[2], s.free[3]] })).toBe(true);
  });

  it('場札どうしで重ねられれば true', () => {
    const s = stuck();
    const tableau = [...s.tableau];
    tableau[0] = [card('spade', 13), card('heart', 12)];
    tableau[1] = [card('heart', 13), card('spade', 11)];
    // 黒J を 赤Q に置ける
    expect(hasAnyMove({ ...s, tableau })).toBe(true);
  });

  it('配った直後は必ず手がある', () => {
    expect(hasAnyMove(deal(1))).toBe(true);
    expect(hasAnyMove(deal(12345))).toBe(true);
  });
});
