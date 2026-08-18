import { describe, expect, it } from 'vitest';
import { type Card, type Suit } from '@/lib/cards';
import {
  canDraw,
  canTake,
  clearRate,
  colOf,
  connects,
  coversOf,
  deal,
  draw,
  hasAnyMove,
  hint,
  isExposed,
  isLost,
  isWon,
  newSeed,
  PEAKS,
  remaining,
  reveal,
  ROWS,
  ROW_SIZES,
  rowOf,
  rowStart,
  STOCK_SIZE,
  TABLEAU_SIZE,
  take,
  takableIndices,
  wasteTop,
  xOf,
  type TriPeaksState,
} from '@/lib/tripeaks';

const card = (suit: Suit, rank: number, faceUp = true): Card => ({
  suit,
  rank: rank as Card['rank'],
  faceUp,
  id: suit.charCodeAt(0) * 100 + rank,
});

/** 場が空の状態。テストごとに必要な札だけ置く */
const empty = (): TriPeaksState => ({
  tableau: Array<Card | null>(TABLEAU_SIZE).fill(null),
  stock: [],
  waste: [],
  chain: 0,
  maxChain: 0,
  moves: 0,
  seed: 1,
});

/** `tableau[index] = card` を置いた状態を作る */
const withCards = (entries: [number, Card][], base: TriPeaksState = empty()): TriPeaksState => {
  const tableau = [...base.tableau];
  for (const [i, c] of entries) tableau[i] = c;
  return { ...base, tableau };
};

/** 最下段の先頭の通し番号（18） */
const BOTTOM = rowStart(ROWS - 1);

describe('山型の座標', () => {
  it('3ピーク・4段で28枚。山札は23枚', () => {
    expect(PEAKS).toBe(3);
    expect(ROWS).toBe(4);
    expect(ROW_SIZES).toEqual([3, 6, 9, 10]);
    expect(TABLEAU_SIZE).toBe(28);
    expect(STOCK_SIZE).toBe(23);
    // 場28 + 捨て札1 + 山札23 = 52
    expect(TABLEAU_SIZE + 1 + STOCK_SIZE).toBe(52);
    expect(rowStart(ROWS)).toBe(TABLEAU_SIZE);
  });

  it('通し番号から段と段内の位置が出る', () => {
    expect([rowOf(0), colOf(0)]).toEqual([0, 0]);
    expect([rowOf(2), colOf(2)]).toEqual([0, 2]);
    expect([rowOf(3), colOf(3)]).toEqual([1, 0]);
    expect([rowOf(8), colOf(8)]).toEqual([1, 5]);
    expect([rowOf(9), colOf(9)]).toEqual([2, 0]);
    expect([rowOf(17), colOf(17)]).toEqual([2, 8]);
    expect([rowOf(18), colOf(18)]).toEqual([3, 0]);
    expect([rowOf(27), colOf(27)]).toEqual([3, 9]);
  });

  it('場の外の通し番号は段を持たない', () => {
    expect(rowOf(-1)).toBe(-1);
    expect(rowOf(TABLEAU_SIZE)).toBe(-1);
    expect(coversOf(TABLEAU_SIZE)).toEqual([]);
  });

  it('覆っているのは真下の2枚。最下段は覆われない', () => {
    // 頂点（ピーク0）は2段目の左2枚を覆う
    expect(coversOf(0)).toEqual([3, 4]);
    expect(coversOf(1)).toEqual([5, 6]);
    expect(coversOf(2)).toEqual([7, 8]);
    // 2段目の2枚は、そのピークの3枚のうち隣り合う2枚を覆う
    expect(coversOf(3)).toEqual([9, 10]);
    expect(coversOf(4)).toEqual([10, 11]);
    expect(coversOf(8)).toEqual([16, 17]);
    // 3段目は最下段の隣り合う2枚。ピークの境目では最下段を共有する
    expect(coversOf(9)).toEqual([18, 19]);
    expect(coversOf(11)).toEqual([20, 21]);
    expect(coversOf(12)).toEqual([21, 22]);
    expect(coversOf(17)).toEqual([26, 27]);
    for (let i = BOTTOM; i < TABLEAU_SIZE; i += 1) {
      expect(coversOf(i)).toEqual([]);
    }
  });

  it('覆いの参照はすべて場の中に収まる', () => {
    for (let i = 0; i < TABLEAU_SIZE; i += 1) {
      for (const j of coversOf(i)) {
        expect(j).toBeGreaterThan(i);
        expect(j).toBeLessThan(TABLEAU_SIZE);
        // 覆うのは必ず1つ下の段
        expect(rowOf(j)).toBe(rowOf(i) + 1);
      }
    }
  });

  it('最下段の10枚は、必ずどれかの札に覆われている', () => {
    const covered = new Set(
      Array.from({ length: TABLEAU_SIZE }, (_, i) => coversOf(i)).flat(),
    );
    for (let i = BOTTOM; i < TABLEAU_SIZE; i += 1) expect(covered.has(i)).toBe(true);
  });

  it('横位置は、覆う2枚のちょうど中間に来る', () => {
    for (let i = 0; i < TABLEAU_SIZE; i += 1) {
      const under = coversOf(i);
      if (under.length === 0) continue;
      expect(xOf(i)).toBeCloseTo((xOf(under[0]) + xOf(under[1])) / 2, 6);
    }
  });

  it('最下段は札1枚ぶんずつ隣り合い、盤の幅は札10枚ぶん', () => {
    for (let i = BOTTOM; i < TABLEAU_SIZE - 1; i += 1) {
      expect(xOf(i + 1) - xOf(i)).toBeCloseTo(1, 6);
    }
    expect(xOf(BOTTOM)).toBeCloseTo(0.5, 6);
    expect(xOf(TABLEAU_SIZE - 1)).toBeCloseTo(9.5, 6);
  });

  it('ピークの頂点3つは3枚ぶんずつ離れて並ぶ', () => {
    expect([xOf(0), xOf(1), xOf(2)]).toEqual([2, 5, 8]);
  });
});

describe('deal', () => {
  const s = deal(1);

  it('場28枚・山札23枚・捨て札1枚', () => {
    expect(s.tableau.filter(Boolean)).toHaveLength(TABLEAU_SIZE);
    expect(s.stock).toHaveLength(STOCK_SIZE);
    expect(s.waste).toHaveLength(1);
    expect(s.chain).toBe(0);
    expect(s.maxChain).toBe(0);
    expect(s.moves).toBe(0);
  });

  it('52枚がすべて重複なく使われる', () => {
    const ids = [
      ...s.tableau.map((c) => c?.id),
      ...s.stock.map((c) => c.id),
      ...s.waste.map((c) => c.id),
    ];
    expect(new Set(ids).size).toBe(52);
    expect(ids).toHaveLength(52);
  });

  it('表向きは最下段の10枚だけ。上の18枚は裏向き', () => {
    const faceUp = s.tableau.filter((c) => c?.faceUp);
    expect(faceUp).toHaveLength(ROW_SIZES[ROWS - 1]);
    for (let i = 0; i < TABLEAU_SIZE; i += 1) {
      expect(s.tableau[i]?.faceUp).toBe(i >= BOTTOM);
    }
  });

  it('山札は裏向き、捨て札は表向き', () => {
    expect(s.stock.every((c) => !c.faceUp)).toBe(true);
    expect(wasteTop(s)?.faceUp).toBe(true);
  });

  it('同じシードなら同じ配り、違うシードなら別の配り', () => {
    expect(deal(1).tableau.map((c) => c?.id)).toEqual(s.tableau.map((c) => c?.id));
    expect(deal(2).tableau.map((c) => c?.id)).not.toEqual(s.tableau.map((c) => c?.id));
    expect(deal(7).seed).toBe(7);
  });

  it('最初に触れるのは最下段の10枚だけ', () => {
    const open = Array.from({ length: TABLEAU_SIZE }, (_, i) => i).filter((i) =>
      isExposed(s.tableau, i),
    );
    expect(open).toEqual(Array.from({ length: 10 }, (_, i) => BOTTOM + i));
  });

  it('newSeed は1以上の整数', () => {
    expect(newSeed(() => 0)).toBe(1);
    expect(newSeed(() => 0.5)).toBe(500_001);
  });
});

describe('覆いとめくり', () => {
  it('真下の2枚が両方無くなってはじめて取れる', () => {
    const base = withCards([
      [0, card('spade', 5, false)],
      [3, card('heart', 8)],
      [4, card('club', 9)],
    ]);
    expect(isExposed(base.tableau, 0)).toBe(false);

    const oneLeft = base.tableau.map((c, i) => (i === 3 ? null : c));
    expect(isExposed(oneLeft, 0)).toBe(false);

    const bothGone = base.tableau.map((c, i) => (i === 3 || i === 4 ? null : c));
    expect(isExposed(bothGone, 0)).toBe(true);
  });

  it('札の無いマスは「取れる」にはならない', () => {
    expect(isExposed(empty().tableau, 27)).toBe(false);
  });

  it('覆いが取れた裏札は自動でめくれる。覆われたままの札はめくれない', () => {
    const before = withCards([
      [0, card('spade', 5, false)],
      [3, card('heart', 8, false)],
      [9, card('club', 9, false)],
      [10, card('diamond', 2, false)],
    ]).tableau;
    const after = reveal(before);
    // 3 は真下（9・10）が残っているのでまだ裏。0 も 3 が残っているので裏
    expect(after[3]?.faceUp).toBe(false);
    expect(after[0]?.faceUp).toBe(false);
    // 9・10 は最下段なので覆われず、めくれる
    expect(after[9]?.faceUp).toBe(true);
    expect(after[10]?.faceUp).toBe(true);
  });

  it('一度表になった札は裏に戻らない', () => {
    const t = withCards([[0, card('spade', 5)], [3, card('heart', 8)]]).tableau;
    expect(reveal(t)[0]?.faceUp).toBe(true);
  });
});

describe('つながりの判定', () => {
  it('ランクが±1でつながる', () => {
    expect(connects(5, 6)).toBe(true);
    expect(connects(6, 5)).toBe(true);
    expect(connects(5, 7)).toBe(false);
    expect(connects(5, 5)).toBe(false);
  });

  it('AとK、Aと2もつながる（ラップあり）', () => {
    expect(connects(1, 13)).toBe(true);
    expect(connects(13, 1)).toBe(true);
    expect(connects(1, 2)).toBe(true);
    expect(connects(12, 13)).toBe(true);
    // K と 2 のように、ラップをまたいで2つ離れた組はつながらない
    expect(connects(13, 2)).toBe(false);
    expect(connects(12, 1)).toBe(false);
  });

  it('捨て札が無ければ何も取れない', () => {
    const s = withCards([[27, card('spade', 5)]]);
    expect(canTake(s, 27)).toBe(false);
  });

  it('覆われた札は、つながっていても取れない', () => {
    const s = {
      ...withCards([
        [0, card('spade', 5)],
        [3, card('heart', 8)],
        [4, card('club', 9)],
      ]),
      waste: [card('diamond', 6)],
    };
    expect(canTake(s, 0)).toBe(false);
    expect(canTake(s, 99)).toBe(false);
  });

  it('取れる札を上の段から順に挙げる', () => {
    const s = {
      ...withCards([
        [9, card('spade', 6)],
        [18, card('heart', 4)],
        [19, card('club', 6)],
        [20, card('diamond', 9)],
      ]),
      waste: [card('spade', 5)],
    };
    // 9 は 18・19 に覆われているので取れない。4 と 6 が取れる
    expect(takableIndices(s)).toEqual([18, 19]);
    expect(hint(s)).toBe(18);
  });

  it('取れる札が無ければ hint は null', () => {
    const s = { ...withCards([[27, card('spade', 9)]]), waste: [card('heart', 5)] };
    expect(hasAnyMove(s)).toBe(false);
    expect(hint(s)).toBeNull();
  });
});

describe('take（取る・連鎖）', () => {
  const chained = (): TriPeaksState => ({
    ...withCards([
      [25, card('spade', 6)],
      [26, card('heart', 7)],
      [27, card('club', 9)],
    ]),
    waste: [card('diamond', 5)],
  });

  it('取った札が新しい捨て札になり、連鎖が1増える', () => {
    const s = take(chained(), 25)!;
    expect(s.tableau[25]).toBeNull();
    expect(wasteTop(s)?.rank).toBe(6);
    expect(s.chain).toBe(1);
    expect(s.maxChain).toBe(1);
    expect(s.moves).toBe(1);
    expect(remaining(s)).toBe(2);
  });

  it('つながる限り連鎖が伸びる', () => {
    let s = take(chained(), 25)!;
    s = take(s, 26)!;
    expect(s.chain).toBe(2);
    expect(s.maxChain).toBe(2);
    // 7 の次に 9 は取れない
    expect(take(s, 27)).toBeNull();
  });

  it('取れない札を指定すると null で、状態は変わらない', () => {
    const s = chained();
    expect(take(s, 27)).toBeNull();
    expect(take(s, 0)).toBeNull();
    expect(take(s, 24)).toBeNull();
    expect(s.tableau.filter(Boolean)).toHaveLength(3);
  });

  it('取ると、上の札の覆いが取れてめくれる', () => {
    const s = {
      ...withCards([
        [9, card('spade', 4, false)],
        [18, card('heart', 6)],
        [19, card('club', 7)],
      ]),
      waste: [card('diamond', 5)],
    };
    const after = take(take(s, 18)!, 19)!;
    expect(after.tableau[9]?.faceUp).toBe(true);
    expect(isExposed(after.tableau, 9)).toBe(true);
    // めくれた札は、つながっていれば続けて取れる（6→7→…ではなく 7 の次の 8 ではない）
    expect(canTake(after, 9)).toBe(false);
    expect(take({ ...after, waste: [card('spade', 5)] }, 9)).not.toBeNull();
  });
});

describe('山札', () => {
  const stocked = (): TriPeaksState => ({
    ...withCards([[27, card('spade', 9)]]),
    stock: [card('spade', 3, false), card('heart', 2, false), card('club', 1, false)],
    waste: [card('diamond', 5)],
    chain: 4,
    maxChain: 4,
  });

  it('めくると末尾の1枚が表向きで捨て札の一番上へ', () => {
    const s = draw(stocked())!;
    expect(s.stock).toHaveLength(2);
    expect(wasteTop(s)?.rank).toBe(1);
    expect(wasteTop(s)?.faceUp).toBe(true);
  });

  it('めくると連鎖は途切れるが、最長連鎖は残る', () => {
    const s = draw(stocked())!;
    expect(s.chain).toBe(0);
    expect(s.maxChain).toBe(4);
  });

  it('めくっても場札は減らないし、手数も増えない', () => {
    const s = draw(stocked())!;
    expect(remaining(s)).toBe(1);
    expect(s.moves).toBe(0);
  });

  it('山札が空ならめくれない（引き直しは無い）', () => {
    const s = { ...stocked(), stock: [] };
    expect(canDraw(s)).toBe(false);
    expect(draw(s)).toBeNull();
  });

  it('配った順に出てくる', () => {
    let s = deal(3);
    const order: number[] = [];
    while (canDraw(s)) {
      s = draw(s)!;
      order.push(wasteTop(s)!.id);
    }
    expect(order).toEqual(deal(3).stock.map((c) => c.id).reverse());
  });
});

describe('勝ち負けの判定', () => {
  it('場札が無くなったら勝ち', () => {
    expect(isWon({ ...empty(), waste: [card('spade', 5)] })).toBe(true);
    expect(isWon(withCards([[27, card('spade', 5)]]))).toBe(false);
  });

  it('取れる札が無く、山札も尽きたら詰み', () => {
    const s = { ...withCards([[27, card('spade', 9)]]), waste: [card('heart', 5)] };
    expect(isLost(s)).toBe(true);
  });

  it('山札が残っていれば詰みではない', () => {
    const s = {
      ...withCards([[27, card('spade', 9)]]),
      waste: [card('heart', 5)],
      stock: [card('club', 4, false)],
    };
    expect(isLost(s)).toBe(false);
  });

  it('取れる札があれば詰みではない', () => {
    const s = { ...withCards([[27, card('spade', 6)]]), waste: [card('heart', 5)] };
    expect(isLost(s)).toBe(false);
  });

  it('クリアした局面は詰みにしない', () => {
    expect(isLost({ ...empty(), waste: [card('spade', 5)] })).toBe(false);
  });
});

describe('クリア率', () => {
  it('プレイ数で割る（途中でやめた分も母数に入れる）', () => {
    expect(clearRate(1, 4)).toBe(25);
    expect(clearRate(1, 3)).toBe(33);
    expect(clearRate(3, 3)).toBe(100);
  });

  it('まだ遊んでいなければ null', () => {
    expect(clearRate(0, 0)).toBeNull();
    expect(clearRate(2, -1)).toBeNull();
  });

  it('プレイ数より多い勝ちは100%で頭打ちにする（壊れた記録が入っても崩れない）', () => {
    expect(clearRate(5, 2)).toBe(100);
  });
});

describe('通しで遊ぶ（不変条件）', () => {
  it('どの手を打っても、52枚は場・山札・捨て札のどこかにある', () => {
    let s = deal(2026);
    for (let guard = 0; guard < 200; guard += 1) {
      const total = remaining(s) + s.stock.length + s.waste.length;
      expect(total).toBe(52);
      const move = hint(s);
      if (move !== null) s = take(s, move)!;
      else if (canDraw(s)) s = draw(s)!;
      else break;
    }
    expect(isWon(s) || isLost(s)).toBe(true);
  });

  it('ヒント通りに取り続けても、覆われた札・裏の札は絶対に消えない', () => {
    let s = deal(99);
    for (let guard = 0; guard < 200; guard += 1) {
      const move = hint(s);
      if (move === null) {
        if (!canDraw(s)) break;
        s = draw(s)!;
        continue;
      }
      expect(isExposed(s.tableau, move)).toBe(true);
      expect(s.tableau[move]?.faceUp).toBe(true);
      const before = remaining(s);
      s = take(s, move)!;
      expect(remaining(s)).toBe(before - 1);
      // 触れる札はすべて表向き（めくり漏れがあればここで落ちる）
      for (let i = 0; i < TABLEAU_SIZE; i += 1) {
        if (isExposed(s.tableau, i)) expect(s.tableau[i]?.faceUp).toBe(true);
      }
    }
  });

  it('連鎖は取るたびに1ずつ増え、最長連鎖はそれを下回らない', () => {
    let s = deal(7);
    let last = 0;
    for (let guard = 0; guard < 200; guard += 1) {
      const move = hint(s);
      if (move !== null) {
        s = take(s, move)!;
        expect(s.chain).toBe(last + 1);
      } else if (canDraw(s)) {
        s = draw(s)!;
        expect(s.chain).toBe(0);
      } else {
        break;
      }
      expect(s.maxChain).toBeGreaterThanOrEqual(s.chain);
      last = s.chain;
    }
  });
});
