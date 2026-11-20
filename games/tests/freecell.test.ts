import { describe, expect, it } from 'vitest';
import { type Card, type Suit } from '@/lib/cards';
import {
  autoMove,
  autoPlay,
  canStack,
  canStackFoundation,
  deal,
  findHint,
  finishAll,
  FREE_COUNT,
  hasAnyMove,
  isMovableRun,
  isSafeToFoundation,
  isTriviallySolvable,
  isWon,
  maxMovable,
  move,
  newSeed,
  TABLEAU_COLS,
  type FreecellState,
  type Source,
  type Target,
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

// ---- 遊びやすさ（docs/features/freecell-asobiyasusa.md） ----

/** A から n までのホーム */
const home = (suit: Suit, n: number): Card[] => Array.from({ length: n }, (_, i) => card(suit, i + 1));

/** 札が52枚そろっていて重複が無いか（自動送りのあとも崩れない） */
function expectIntact(s: FreecellState) {
  const all = [
    ...s.free.filter((c): c is Card => c !== null),
    ...Object.values(s.foundations).flat(),
    ...s.tableau.flat(),
  ];
  expect(all).toHaveLength(52);
  expect(new Set(all.map((c) => c.id)).size).toBe(52);
}

/** ヒントどおりに進めつつ自動送りをかける。動いた1枚ずつ（利用者の手＋自動送り）を記録する */
function playWithHints(seed: number, limit = 150) {
  let s = deal(seed);
  let prev: FreecellState | null = null;
  const prims: { from: Source; to: Target }[] = [];
  for (let i = 0; i < limit && !isWon(s); i += 1) {
    const h = findHint(s, prev);
    if (!h) break;
    const next = move(s, h.from, h.to);
    expect(next).not.toBeNull();
    prims.push(h);
    const a = autoPlay(next!);
    a.steps.forEach((st) => prims.push({ from: st.from, to: { kind: 'foundation' } }));
    expectIntact(a.state);
    prev = s;
    s = a.state;
  }
  return { state: s, prims };
}

describe('isSafeToFoundation', () => {
  it('A・2 はホームに置ければ常に安全', () => {
    const s = empty();
    expect(isSafeToFoundation(card('heart', 1), s)).toBe(true);
    s.foundations.heart = home('heart', 1);
    expect(isSafeToFoundation(card('heart', 2), s)).toBe(true);
  });

  it('ホームに置けない札は安全でない', () => {
    expect(isSafeToFoundation(card('heart', 2), empty())).toBe(false);
  });

  it('赤の5は、黒の2スートのホームがどちらも4以上なら安全、片方が3なら安全でない', () => {
    const s = empty();
    s.foundations.heart = home('heart', 4);
    s.foundations.spade = home('spade', 4);
    s.foundations.club = home('club', 4);
    expect(isSafeToFoundation(card('heart', 5), s)).toBe(true);
    s.foundations.club = home('club', 3);
    expect(isSafeToFoundation(card('heart', 5), s)).toBe(false);
  });

  it('同じ色のスートのホームは見ない', () => {
    const s = empty();
    s.foundations.spade = home('spade', 2);
    s.foundations.heart = home('heart', 2);
    s.foundations.diamond = home('diamond', 2);
    // 黒の3：赤の2スートが2以上なので安全（クラブのホームが空でも関係ない）
    expect(isSafeToFoundation(card('spade', 3), s)).toBe(true);
  });
});

describe('autoPlay', () => {
  it('安全な札を送れなくなるまで送り、1枚＝1手で数える', () => {
    const s = empty();
    s.tableau[0] = [card('spade', 9), card('heart', 2), card('heart', 1)];
    s.free[0] = card('spade', 1);
    s.tableau[1] = [card('club', 5)];
    const a = autoPlay(s);
    expect(a.steps.map((st) => `${st.card.suit}${st.card.rank}`)).toEqual(['spade1', 'heart1', 'heart2']);
    expect(a.state.moves).toBe(s.moves + 3);
    expect(a.state.free[0]).toBeNull();
    expect(a.state.tableau[0]).toEqual([card('spade', 9)]);
    // 黒の5は送らない（赤のホームが4に届いていない）
    expect(a.state.tableau[1]).toEqual([card('club', 5)]);
  });

  it('送る札が無ければそのまま', () => {
    const s = deal(1);
    const blocked = { ...s, tableau: s.tableau.map((p) => p.filter((c) => c.rank > 2)) };
    const a = autoPlay(blocked);
    expect(a.steps).toHaveLength(0);
    expect(a.state).toBe(blocked);
  });

  it('自動送りのあとも札は52枚・重複なし', () => {
    for (const seed of [1, 2, 3, 42]) playWithHints(seed);
  });

  it('「もどす」1回で、利用者の手＋自動送りの前に戻る（履歴には利用者の手の前だけを積む）', () => {
    const s = empty();
    s.tableau[0] = [card('heart', 1), card('spade', 8)];
    s.tableau[1] = [card('diamond', 9)];
    s.tableau[2] = [card('club', 1)];
    s.tableau[3] = [card('club', 2)];
    const history: FreecellState[] = [];
    // 利用者の手：黒8を赤9へ。すると赤A が出て、自動で送られる
    const next = move(s, { kind: 'tableau', col: 0, cardIndex: 1 }, { kind: 'tableau', col: 1 })!;
    history.push(s);
    const a = autoPlay(next);
    expect(a.steps.length).toBeGreaterThan(0);
    expect(a.state.foundations.heart).toHaveLength(1);
    const undone = history.pop();
    expect(undone).toBe(s);
    expect(history).toHaveLength(0);
  });

  it('自動送りがオンでもオフでも、同じ手順ならクリア時の手数は同じ', () => {
    for (const seed of [1, 7]) {
      const on = playWithHints(seed);
      // 同じ1枚ずつを手で運ぶ（自動送りなし）
      let off = deal(seed);
      for (const p of on.prims) {
        const r = move(off, p.from, p.to);
        expect(r).not.toBeNull();
        off = r!;
      }
      expect(off).toEqual(on.state);
      expect(off.moves).toBe(on.prims.length);
    }
    // 片づけまで含めた最後：一気の片づけも手で運んだのと同じ手数
    const s = sortedLayout();
    const f = finishAll(s);
    expect(isWon(f.state)).toBe(true);
    expect(f.state.moves).toBe(52);
  });
});

/** 52枚を数字の大きい順に8列へ配った盤（どの列も奥から手前へ小さくなる。同じ数字も続く） */
function sortedLayout(): FreecellState {
  const s = empty();
  const deck = deal(3).tableau.flat().sort((a, b) => b.rank - a.rank);
  deck.forEach((c, i) => s.tableau[i % 8].push(c));
  return s;
}

describe('isTriviallySolvable', () => {
  it('同じ数字が続く列・数字が飛ぶ列でも真', () => {
    const s = empty();
    s.tableau[0] = [card('spade', 8), card('heart', 8), card('club', 5)];
    s.tableau[1] = [card('diamond', 13), card('spade', 2)];
    expect(isTriviallySolvable(s)).toBe(true);
  });

  it('フリーセルに札があっても真', () => {
    const s = empty();
    s.tableau[0] = [card('spade', 8), card('heart', 3)];
    s.free[2] = card('club', 13);
    expect(isTriviallySolvable(s)).toBe(true);
  });

  it('奥より手前が大きい列が1つでもあれば偽', () => {
    const s = empty();
    s.tableau[0] = [card('spade', 8), card('heart', 3)];
    s.tableau[5] = [card('club', 4), card('diamond', 5)];
    expect(isTriviallySolvable(s)).toBe(false);
    expect(isTriviallySolvable(deal(1))).toBe(false);
  });

  it('真の局面で全部送ると isWon', () => {
    const s = sortedLayout();
    expect(isTriviallySolvable(s)).toBe(true);
    const f = finishAll(s);
    expect(f.steps).toHaveLength(52);
    expect(isWon(f.state)).toBe(true);
    expectIntact(f.state);
  });

  it('フリーセルに札がある局面でも全部片づく', () => {
    const s = sortedLayout();
    // 一番手前の札を1枚フリーセルへ
    const col = s.tableau.findIndex((p) => p.length > 0);
    const c = s.tableau[col][s.tableau[col].length - 1];
    s.tableau[col] = s.tableau[col].slice(0, -1);
    s.free[0] = c;
    const f = finishAll(s);
    expect(isWon(f.state)).toBe(true);
  });
});

describe('findHint', () => {
  it('安全な札のホーム送りがあれば、それを選ぶ', () => {
    const s = empty();
    s.tableau[0] = [card('spade', 7)];
    s.tableau[1] = [card('heart', 6)];
    s.tableau[2] = [card('heart', 1)];
    expect(findHint(s)).toEqual({ from: { kind: 'tableau', col: 2, cardIndex: 0 }, to: { kind: 'foundation' } });
  });

  it('安全でないホーム送りは、列から列への手より後に選ぶ', () => {
    const s = empty();
    s.foundations.heart = home('heart', 4);
    s.foundations.spade = home('spade', 2);
    s.foundations.club = home('club', 2);
    s.tableau[0] = [card('heart', 5)];
    s.tableau[1] = [card('spade', 9)];
    s.tableau[2] = [card('heart', 8)];
    expect(findHint(s)).toEqual({ from: { kind: 'tableau', col: 2, cardIndex: 0 }, to: { kind: 'tableau', col: 1 } });
    // 列から列への手が無ければ、空き列・フリーセルへ逃がすより先にホームへ
    s.tableau[2] = [card('club', 9)];
    expect(findHint(s)).toEqual({ from: { kind: 'tableau', col: 0, cardIndex: 0 }, to: { kind: 'foundation' } });
  });

  it('埋もれた A・2 を掘る手を、ただの列から列より先に選ぶ', () => {
    const s = empty();
    s.tableau[0] = [card('spade', 13), card('heart', 1), card('club', 6)];
    s.tableau[1] = [card('diamond', 7)];
    s.tableau[2] = [card('spade', 10)];
    s.tableau[3] = [card('heart', 9)];
    expect(findHint(s)).toEqual({ from: { kind: 'tableau', col: 0, cardIndex: 2 }, to: { kind: 'tableau', col: 1 } });
  });

  it('同じ順位なら動かす枚数が多い手', () => {
    const s = empty();
    s.tableau[0] = [card('club', 13), card('heart', 9), card('spade', 8)];
    s.tableau[1] = [card('spade', 10)];
    s.tableau[2] = [card('diamond', 13), card('club', 9)];
    s.tableau[3] = [card('heart', 10)];
    // 赤9・黒8 の2枚を黒10へ（1枚だけの 黒8→？ や 黒9→赤10 より先）
    expect(findHint(s)).toEqual({ from: { kind: 'tableau', col: 0, cardIndex: 1 }, to: { kind: 'tableau', col: 1 } });
  });

  it('直前の手をそのまま戻すだけの手は選ばない', () => {
    const before = empty();
    before.tableau[0] = [card('spade', 13)];
    before.tableau[1] = [card('heart', 12)];
    const after = move(before, { kind: 'tableau', col: 1, cardIndex: 0 }, { kind: 'tableau', col: 0 })!;
    const back = { from: { kind: 'tableau', col: 0, cardIndex: 1 }, to: { kind: 'tableau', col: 1 } };
    const h = findHint(after, before);
    expect(h).not.toBeNull();
    expect(h).not.toEqual(back);
  });

  it('返す手は必ず move() で通る', () => {
    for (const seed of [1, 2, 3, 4, 5, 99, 12345]) {
      let s = deal(seed);
      for (let i = 0; i < 40; i += 1) {
        const h = findHint(s);
        if (!h) break;
        const r = move(s, h.from, h.to);
        expect(r).not.toBeNull();
        s = autoPlay(r!).state;
      }
    }
  });

  it('手が無い局面では null', () => {
    const s = empty();
    s.free = [card('spade', 9), card('heart', 9), card('diamond', 9), card('club', 9)];
    s.tableau = [
      [card('spade', 13)],
      [card('heart', 13)],
      [card('diamond', 13)],
      [card('club', 13)],
      [card('spade', 11)],
      [card('heart', 11)],
      [card('diamond', 11)],
      [card('club', 11)],
    ];
    expect(hasAnyMove(s)).toBe(false);
    expect(findHint(s)).toBeNull();
  });
});
