import { describe, expect, it } from 'vitest';
import { type Card, type Suit } from '@/lib/cards';
import {
  availableMoves,
  availableSpots,
  canDraw,
  canPair,
  canRedeal,
  cardAt,
  colOf,
  coversOf,
  deal,
  draw,
  hasAnyMove,
  hint,
  isAvailable,
  isExposed,
  isLost,
  isSingle,
  isWon,
  MAX_REDEALS,
  newSeed,
  PYRAMID_SIZE,
  redeal,
  remaining,
  removePair,
  ROWS,
  rowOf,
  rowStart,
  STOCK_SIZE,
  sameSpot,
  tap,
  type PyramidState,
  type Spot,
} from '@/lib/pyramid-solitaire';

const card = (suit: Suit, rank: number): Card => ({
  suit,
  rank: rank as Card['rank'],
  faceUp: true,
  id: suit.charCodeAt(0) * 100 + rank,
});

/** ピラミッドが空の状態。テストごとに必要な札だけ置く */
const empty = (): PyramidState => ({
  pyramid: Array<Card | null>(PYRAMID_SIZE).fill(null),
  stock: [],
  waste: [],
  redeals: MAX_REDEALS,
  selected: null,
  moves: 0,
  seed: 1,
});

/** `pyramid[index] = card` を置いた状態を作る */
const withCards = (entries: [number, Card][], base: PyramidState = empty()): PyramidState => {
  const pyramid = [...base.pyramid];
  for (const [i, c] of entries) pyramid[i] = c;
  return { ...base, pyramid };
};

const at = (index: number): Spot => ({ kind: 'pyramid', index });
const WASTE: Spot = { kind: 'waste' };

describe('ピラミッドの座標', () => {
  it('7段で28枚', () => {
    expect(ROWS).toBe(7);
    expect(PYRAMID_SIZE).toBe(28);
    expect(STOCK_SIZE).toBe(24);
    expect(rowStart(ROWS)).toBe(PYRAMID_SIZE);
  });

  it('通し番号から段と段内の位置が出る', () => {
    expect([rowOf(0), colOf(0)]).toEqual([0, 0]);
    expect([rowOf(1), colOf(1)]).toEqual([1, 0]);
    expect([rowOf(2), colOf(2)]).toEqual([1, 1]);
    expect([rowOf(20), colOf(20)]).toEqual([5, 5]);
    expect([rowOf(27), colOf(27)]).toEqual([6, 6]);
  });

  it('覆っているのは真下の2枚。最下段は覆われない', () => {
    expect(coversOf(0)).toEqual([1, 2]);
    expect(coversOf(1)).toEqual([3, 4]);
    expect(coversOf(2)).toEqual([4, 5]);
    // 最下段（21〜27）の下は無い
    for (let i = rowStart(ROWS - 1); i < PYRAMID_SIZE; i += 1) {
      expect(coversOf(i)).toEqual([]);
    }
  });

  it('段の枚数の合計が28枚になる', () => {
    let total = 0;
    for (let r = 0; r < ROWS; r += 1) total += rowStart(r + 1) - rowStart(r);
    expect(total).toBe(PYRAMID_SIZE);
  });
});

describe('deal', () => {
  const s = deal(1);

  it('ピラミッド28枚・山札24枚・捨て札なし', () => {
    expect(s.pyramid.filter(Boolean)).toHaveLength(PYRAMID_SIZE);
    expect(s.stock).toHaveLength(STOCK_SIZE);
    expect(s.waste).toHaveLength(0);
    expect(s.redeals).toBe(MAX_REDEALS);
    expect(s.selected).toBeNull();
    expect(s.moves).toBe(0);
  });

  it('52枚がすべて重複なく使われる', () => {
    const ids = [...s.pyramid.map((c) => c?.id), ...s.stock.map((c) => c.id)];
    expect(new Set(ids).size).toBe(52);
    expect(ids).toHaveLength(52);
  });

  it('ピラミッドは表向き、山札は裏向き', () => {
    expect(s.pyramid.every((c) => c?.faceUp)).toBe(true);
    expect(s.stock.every((c) => !c.faceUp)).toBe(true);
  });

  it('同じシードなら同じ配り、違うシードなら別の配り', () => {
    expect(deal(1).pyramid.map((c) => c?.id)).toEqual(s.pyramid.map((c) => c?.id));
    expect(deal(2).pyramid.map((c) => c?.id)).not.toEqual(s.pyramid.map((c) => c?.id));
    expect(deal(7).seed).toBe(7);
  });

  it('最下段の7枚だけが最初から取れる', () => {
    const spots = availableSpots(s);
    expect(spots).toHaveLength(ROWS);
    expect(spots.map((sp) => (sp.kind === 'pyramid' ? sp.index : -1))).toEqual([
      21, 22, 23, 24, 25, 26, 27,
    ]);
  });

  it('newSeed は1以上の整数', () => {
    expect(newSeed(() => 0)).toBe(1);
    expect(newSeed(() => 0.5)).toBe(500_001);
  });
});

describe('覆いの判定', () => {
  it('真下の2枚が両方無くなってはじめて取れる', () => {
    const base = withCards([
      [0, card('spade', 5)],
      [1, card('heart', 8)],
      [2, card('club', 9)],
    ]);
    expect(isExposed(base.pyramid, 0)).toBe(false);

    // 片方だけ無くなってもまだ取れない
    const oneLeft = base.pyramid.map((c, i) => (i === 1 ? null : c));
    expect(isExposed(oneLeft, 0)).toBe(false);

    const bothGone = base.pyramid.map((c, i) => (i === 1 || i === 2 ? null : c));
    expect(isExposed(bothGone, 0)).toBe(true);
  });

  it('札の無いマスは「取れる」にはならない', () => {
    expect(isExposed(empty().pyramid, 27)).toBe(false);
  });

  it('捨て札は一番上だけが触れる', () => {
    const s = { ...empty(), waste: [card('spade', 3), card('heart', 4)] };
    expect(isAvailable(s, WASTE)).toBe(true);
    expect(cardAt(s, WASTE)?.rank).toBe(4);
    expect(isAvailable(empty(), WASTE)).toBe(false);
  });

  it('sameSpot は種類と番号の両方で見る', () => {
    expect(sameSpot(at(3), at(3))).toBe(true);
    expect(sameSpot(at(3), at(4))).toBe(false);
    expect(sameSpot(WASTE, WASTE)).toBe(true);
    expect(sameSpot(WASTE, at(3))).toBe(false);
  });
});

describe('組の判定', () => {
  it('合計13の2枚だけが組になる', () => {
    const s = withCards([
      [21, card('spade', 9)],
      [22, card('heart', 4)],
      [23, card('club', 5)],
    ]);
    expect(canPair(s, at(21), at(22))).toBe(true); // 9 + 4
    expect(canPair(s, at(21), at(23))).toBe(false); // 9 + 5
  });

  it('AとQ、2とJも組になる', () => {
    const s = withCards([
      [21, card('spade', 1)],
      [22, card('heart', 12)],
      [23, card('club', 2)],
      [24, card('diamond', 11)],
    ]);
    expect(canPair(s, at(21), at(22))).toBe(true);
    expect(canPair(s, at(23), at(24))).toBe(true);
  });

  it('Kは1枚で13なので単独で取れる', () => {
    expect(isSingle(card('spade', 13))).toBe(true);
    expect(isSingle(card('spade', 12))).toBe(false);
  });

  it('覆われている札は組にできない', () => {
    const s = withCards([
      [0, card('spade', 9)],
      [1, card('heart', 4)],
      [2, card('club', 2)],
      [21, card('diamond', 4)],
    ]);
    expect(canPair(s, at(0), at(21))).toBe(false);
  });

  it('同じ札どうしは組にならない', () => {
    const s = withCards([[21, card('spade', 6)]]);
    expect(canPair(s, at(21), at(21))).toBe(false);
  });

  it('捨て札の一番上はピラミッドの札と組める', () => {
    const s = { ...withCards([[21, card('spade', 6)]]), waste: [card('heart', 7)] };
    expect(canPair(s, at(21), WASTE)).toBe(true);
  });
});

describe('removePair', () => {
  it('組を取り除くと両方が消えて手数が1増える', () => {
    const s = withCards([
      [21, card('spade', 9)],
      [22, card('heart', 4)],
    ]);
    const next = removePair(s, [at(21), at(22)]);
    expect(next).not.toBeNull();
    expect(next!.pyramid[21]).toBeNull();
    expect(next!.pyramid[22]).toBeNull();
    expect(next!.moves).toBe(1);
  });

  it('捨て札の札を使うと捨て札が1枚減る', () => {
    const s = { ...withCards([[21, card('spade', 6)]]), waste: [card('club', 2), card('heart', 7)] };
    const next = removePair(s, [at(21), WASTE]);
    expect(next!.waste.map((c) => c.rank)).toEqual([2]);
    expect(next!.pyramid[21]).toBeNull();
  });

  it('Kは1枚指定で取り除ける', () => {
    const s = withCards([[21, card('spade', 13)]]);
    const next = removePair(s, [at(21)]);
    expect(next!.pyramid[21]).toBeNull();
  });

  it('K以外の1枚指定・合計が13でない組・覆われた札は null', () => {
    const s = withCards([
      [0, card('spade', 9)],
      [1, card('heart', 4)],
      [2, card('club', 5)],
      [21, card('diamond', 4)],
    ]);
    expect(removePair(s, [at(21)])).toBeNull();
    expect(removePair(s, [at(1), at(2)])).toBeNull(); // 4 + 5
    expect(removePair(s, [at(0), at(21)])).toBeNull(); // 0 は覆われている
    expect(removePair(s, [])).toBeNull();
    expect(removePair(s, [at(1), at(2), at(21)])).toBeNull();
  });

  it('取り除くと、上の札が取れるようになる', () => {
    const s = withCards([
      [0, card('spade', 5)],
      [1, card('heart', 9)],
      [2, card('club', 4)],
    ]);
    const next = removePair(s, [at(1), at(2)]);
    expect(isExposed(next!.pyramid, 0)).toBe(true);
  });
});

describe('tap', () => {
  it('1枚目で選択、2枚目で取り除く', () => {
    const s = withCards([
      [21, card('spade', 9)],
      [22, card('heart', 4)],
    ]);
    const first = tap(s, at(21));
    expect(first.effect).toBe('select');
    expect(first.state.selected).toEqual(at(21));

    const second = tap(first.state, at(22));
    expect(second.effect).toBe('remove');
    expect(second.state.selected).toBeNull();
    expect(remaining(second.state)).toBe(0);
  });

  it('同じ札をもう一度タップすると選択が外れる', () => {
    const s = withCards([[21, card('spade', 9)]]);
    const picked = tap(s, at(21));
    const again = tap(picked.state, at(21));
    expect(again.effect).toBe('deselect');
    expect(again.state.selected).toBeNull();
  });

  it('Kはタップした瞬間に取り除かれる（選択を挟まない）', () => {
    const s = withCards([[21, card('spade', 13)]]);
    const r = tap(s, at(21));
    expect(r.effect).toBe('remove');
    expect(r.state.pyramid[21]).toBeNull();
  });

  it('合計13にならない組は invalid。選択はタップした札に移る', () => {
    const s = withCards([
      [21, card('spade', 9)],
      [22, card('heart', 5)],
    ]);
    const picked = tap(s, at(21));
    const missed = tap(picked.state, at(22));
    expect(missed.effect).toBe('invalid');
    expect(missed.state.selected).toEqual(at(22));
    expect(remaining(missed.state)).toBe(2);
  });

  it('覆われた札・空きマスのタップは invalid で状態が変わらない', () => {
    const s = withCards([
      [0, card('spade', 9)],
      [1, card('heart', 4)],
      [2, card('club', 5)],
    ]);
    expect(tap(s, at(0)).effect).toBe('invalid');
    expect(tap(s, at(0)).state).toBe(s);
    expect(tap(s, at(27)).effect).toBe('invalid');
    expect(tap(s, WASTE).effect).toBe('invalid');
  });

  it('捨て札とピラミッドの札を組める', () => {
    const s = { ...withCards([[21, card('spade', 6)]]), waste: [card('heart', 7)] };
    const picked = tap(s, WASTE);
    expect(picked.effect).toBe('select');
    const done = tap(picked.state, at(21));
    expect(done.effect).toBe('remove');
    expect(done.state.waste).toHaveLength(0);
    expect(done.state.pyramid[21]).toBeNull();
  });
});

describe('山札と引き直し', () => {
  const stocked = (): PyramidState => ({
    ...empty(),
    stock: [card('spade', 3), card('heart', 2), card('club', 1)].map((c) => ({
      ...c,
      faceUp: false,
    })),
  });

  it('めくると末尾の1枚が表向きで捨て札へ', () => {
    const s = draw(stocked())!;
    expect(s.stock).toHaveLength(2);
    expect(s.waste).toHaveLength(1);
    expect(s.waste[0].rank).toBe(1);
    expect(s.waste[0].faceUp).toBe(true);
  });

  it('めくると選択は外れる', () => {
    const s = { ...stocked(), selected: at(21) };
    expect(draw(s)!.selected).toBeNull();
  });

  it('山札が空ならめくれない', () => {
    expect(canDraw(empty())).toBe(false);
    expect(draw(empty())).toBeNull();
  });

  it('引き直すと、最初にめくった札からまた出てくる', () => {
    let s: PyramidState = stocked();
    const order: number[] = [];
    while (canDraw(s)) {
      s = draw(s)!;
      order.push(s.waste[s.waste.length - 1].rank);
    }
    expect(order).toEqual([1, 2, 3]);

    const back = redeal(s)!;
    expect(back.waste).toHaveLength(0);
    expect(back.stock).toHaveLength(3);
    expect(back.stock.every((c) => !c.faceUp)).toBe(true);
    expect(back.redeals).toBe(MAX_REDEALS - 1);

    const again: number[] = [];
    let t = back;
    while (canDraw(t)) {
      t = draw(t)!;
      again.push(t.waste[t.waste.length - 1].rank);
    }
    expect(again).toEqual(order);
  });

  it('引き直しは2回まで（デックを3周できる）', () => {
    let s: PyramidState = stocked();
    let passes = 0;
    for (;;) {
      while (canDraw(s)) s = draw(s)!;
      passes += 1;
      if (!canRedeal(s)) break;
      s = redeal(s)!;
    }
    expect(passes).toBe(MAX_REDEALS + 1);
    expect(s.redeals).toBe(0);
    expect(redeal(s)).toBeNull();
  });

  it('山札が残っているうちは引き直せない', () => {
    expect(canRedeal(stocked())).toBe(false);
    expect(redeal(stocked())).toBeNull();
  });
});

describe('取れる組の一覧とヒント', () => {
  it('触れる札の組み合わせをすべて挙げる', () => {
    const s = {
      ...withCards([
        [21, card('spade', 9)],
        [22, card('heart', 4)],
        [23, card('club', 4)],
      ]),
      waste: [card('diamond', 6)],
    };
    const moves = availableMoves(s);
    // 9+4 が2通り。6 の相手（7）は無い
    expect(moves).toHaveLength(2);
    expect(moves.every((m) => m.length === 2)).toBe(true);
  });

  it('Kは1枚の組として挙がる', () => {
    const s = withCards([[21, card('spade', 13)]]);
    expect(availableMoves(s)).toEqual([[at(21)]]);
    expect(hint(s)).toEqual([at(21)]);
  });

  it('取れる組が無ければ hint は null', () => {
    const s = withCards([
      [21, card('spade', 9)],
      [22, card('heart', 9)],
    ]);
    expect(hasAnyMove(s)).toBe(false);
    expect(hint(s)).toBeNull();
  });
});

describe('勝ち負けの判定', () => {
  it('ピラミッドが空なら勝ち', () => {
    expect(isWon(empty())).toBe(true);
    expect(isWon(withCards([[21, card('spade', 5)]]))).toBe(false);
  });

  it('取れる組も山札も引き直しも無ければ詰み', () => {
    const stuck = withCards([
      [21, card('spade', 9)],
      [22, card('heart', 9)],
    ]);
    expect(isLost({ ...stuck, redeals: 0 })).toBe(true);
  });

  it('山札が残っていれば詰みではない', () => {
    const s = {
      ...withCards([
        [21, card('spade', 9)],
        [22, card('heart', 9)],
      ]),
      stock: [card('club', 4)],
      redeals: 0,
    };
    expect(isLost(s)).toBe(false);
  });

  it('引き直せるなら詰みではない', () => {
    const s = {
      ...withCards([
        [21, card('spade', 9)],
        [22, card('heart', 9)],
      ]),
      waste: [card('club', 4)],
      redeals: 1,
    };
    expect(isLost(s)).toBe(false);
  });

  it('クリアした局面は詰みにしない', () => {
    expect(isLost({ ...empty(), redeals: 0 })).toBe(false);
  });
});

describe('通しで遊ぶ（不変条件）', () => {
  it('どの手を打っても、盤面の合計枚数は52枚から減った分だけ', () => {
    let s = deal(2026);
    let removed = 0;
    for (let guard = 0; guard < 400; guard += 1) {
      const move = hint(s);
      if (move) {
        s = removePair(s, move)!;
        removed += move.length;
      } else if (canDraw(s)) {
        s = draw(s)!;
      } else if (canRedeal(s)) {
        s = redeal(s)!;
      } else {
        break;
      }
      const total = remaining(s) + s.stock.length + s.waste.length;
      expect(total).toBe(52 - removed);
    }
    expect(isWon(s) || isLost(s)).toBe(true);
  });

  it('ヒント通りに取り続けても、覆われた札は絶対に消えない', () => {
    let s = deal(99);
    for (let guard = 0; guard < 400; guard += 1) {
      const before = s.pyramid.map((c) => c?.id ?? null);
      const move = hint(s);
      if (!move) {
        if (canDraw(s)) s = draw(s)!;
        else if (canRedeal(s)) s = redeal(s)!;
        else break;
        continue;
      }
      // 取り除く前に、その位置が本当に露出していたことを確かめる
      for (const spot of move) {
        if (spot.kind === 'pyramid') expect(isExposed(s.pyramid, spot.index)).toBe(true);
      }
      s = removePair(s, move)!;
      const after = s.pyramid.map((c) => c?.id ?? null);
      const gone = before.filter((id, i) => id !== null && after[i] === null);
      expect(gone.length).toBeLessThanOrEqual(2);
    }
  });
});
