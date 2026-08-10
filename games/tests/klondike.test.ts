import { describe, expect, it } from 'vitest';
import { seededRng, type Card, type Suit } from '@/lib/cards';
import {
  autoMoveFromTableau,
  autoMoveFromWaste,
  canStackFoundation,
  canStackTableau,
  deal,
  drawStock,
  isWon,
  tableauToFoundation,
  tableauToTableau,
  wasteToFoundation,
  type KlondikeState,
} from '@/lib/klondike';

const card = (suit: Suit, rank: number, faceUp = true): Card => ({
  suit,
  rank: rank as Card['rank'],
  faceUp,
  id: suit.charCodeAt(0) * 100 + rank,
});

/** 空の状態を作ってテストごとに必要な札だけ置く */
const empty = (): KlondikeState => ({
  stock: [],
  waste: [],
  foundations: { spade: [], heart: [], diamond: [], club: [] },
  tableau: [[], [], [], [], [], [], []],
  moves: 0,
});

describe('deal', () => {
  const s = deal(seededRng(1));

  it('場札は7列で1,2,...,7枚。各列の一番下だけ表', () => {
    s.tableau.forEach((pile, col) => {
      expect(pile).toHaveLength(col + 1);
      pile.forEach((c, i) => expect(c.faceUp).toBe(i === col));
    });
  });

  it('山札は24枚で全部裏。合計52枚', () => {
    expect(s.stock).toHaveLength(24);
    expect(s.stock.every((c) => !c.faceUp)).toBe(true);
    const total = s.stock.length + s.tableau.reduce((a, p) => a + p.length, 0);
    expect(total).toBe(52);
  });

  it('52枚のIDに重複がない', () => {
    const ids = [...s.stock, ...s.tableau.flat()].map((c) => c.id);
    expect(new Set(ids).size).toBe(52);
  });
});

describe('drawStock', () => {
  it('1枚めくって waste へ', () => {
    const s = deal(seededRng(2));
    const next = drawStock(s);
    expect(next.stock).toHaveLength(23);
    expect(next.waste).toHaveLength(1);
    expect(next.waste[0].faceUp).toBe(true);
  });

  it('山札が空になったら waste を裏返して戻す（順序も逆転する）', () => {
    let s = empty();
    s = { ...s, waste: [card('spade', 1), card('heart', 2), card('club', 3)] };
    const next = drawStock(s);
    expect(next.stock.map((c) => c.rank)).toEqual([3, 2, 1]);
    expect(next.stock.every((c) => !c.faceUp)).toBe(true);
    expect(next.waste).toHaveLength(0);
    // もう1回めくると、元のwasteの先頭（最初にめくった札）が再び出てくる
    expect(drawStock(next).waste[0].rank).toBe(1);
  });

  it('山札もwasteも空なら何もしない', () => {
    const s = empty();
    expect(drawStock(s)).toBe(s);
  });
});

describe('canStackTableau / canStackFoundation', () => {
  it('場札: 色違いで1つ小さい札だけ乗る', () => {
    expect(canStackTableau(card('heart', 5), card('spade', 6))).toBe(true);
    expect(canStackTableau(card('diamond', 5), card('heart', 6))).toBe(false); // 同色
    expect(canStackTableau(card('heart', 4), card('spade', 6))).toBe(false); // 2つ小さい
  });

  it('場札: 空列にはKだけ', () => {
    expect(canStackTableau(card('heart', 13), undefined)).toBe(true);
    expect(canStackTableau(card('heart', 12), undefined)).toBe(false);
  });

  it('裏向きの札には乗せられない', () => {
    expect(canStackTableau(card('heart', 5), card('spade', 6, false))).toBe(false);
  });

  it('組札: 空にはA、以降は同スートで昇順', () => {
    let s = empty();
    expect(canStackFoundation(card('spade', 1), s)).toBe(true);
    expect(canStackFoundation(card('spade', 2), s)).toBe(false);
    s = { ...s, foundations: { ...s.foundations, spade: [card('spade', 1)] } };
    expect(canStackFoundation(card('spade', 2), s)).toBe(true);
    expect(canStackFoundation(card('heart', 2), s)).toBe(false); // 別スートの山には積めない
  });
});

describe('tableauToTableau', () => {
  it('表向きの連続列をまとめて移動し、残った裏札が表になる', () => {
    let s = empty();
    s.tableau[0] = [card('club', 9, false), card('spade', 6), card('heart', 5), card('club', 4)];
    s.tableau[1] = [card('heart', 7)];
    const next = tableauToTableau(s, { col: 0, cardIndex: 1 }, 1)!;
    expect(next.tableau[1].map((c) => c.rank)).toEqual([7, 6, 5, 4]);
    expect(next.tableau[0]).toHaveLength(1);
    expect(next.tableau[0][0].faceUp).toBe(true); // 裏だったclub9が表になる
  });

  it('裏向きの札からは動かせない', () => {
    const s = empty();
    s.tableau[0] = [card('spade', 6, false), card('heart', 5)];
    expect(tableauToTableau(s, { col: 0, cardIndex: 0 }, 1)).toBeNull();
  });

  it('置けない場所には移動できない', () => {
    const s = empty();
    s.tableau[0] = [card('heart', 5)];
    s.tableau[1] = [card('spade', 9)];
    expect(tableauToTableau(s, { col: 0, cardIndex: 0 }, 1)).toBeNull();
  });
});

describe('組札への移動と勝利', () => {
  it('場札からAを組札へ。列の次の札が表になる', () => {
    const s = empty();
    s.tableau[0] = [card('heart', 2, false), card('spade', 1)];
    const next = tableauToFoundation(s, 0)!;
    expect(next.foundations.spade).toHaveLength(1);
    expect(next.tableau[0][0].faceUp).toBe(true);
  });

  it('wasteから組札へ', () => {
    let s = empty();
    s = { ...s, waste: [card('spade', 1)] };
    const next = wasteToFoundation(s)!;
    expect(next.foundations.spade.map((c) => c.rank)).toEqual([1]);
    expect(next.waste).toHaveLength(0);
  });

  it('全組札が13枚で勝ち', () => {
    const s = empty();
    for (const suit of ['spade', 'heart', 'diamond', 'club'] as const) {
      s.foundations[suit] = Array.from({ length: 13 }, (_, i) => card(suit, i + 1));
    }
    expect(isWon(s)).toBe(true);
  });
});

describe('自動移動（タップ操作の中身）', () => {
  it('組札に置ける札は組札を優先する', () => {
    let s = empty();
    s.tableau[0] = [card('spade', 1)];
    s.tableau[1] = [card('heart', 2)]; // 場札にも置ける状況
    const next = autoMoveFromTableau(s, { col: 0, cardIndex: 0 })!;
    expect(next.foundations.spade).toHaveLength(1); // 場札ではなく組札へ
  });

  it('組札に置けなければ場札の置ける列へ', () => {
    const s = empty();
    s.tableau[0] = [card('heart', 5)];
    s.tableau[1] = [card('spade', 6)];
    const next = autoMoveFromTableau(s, { col: 0, cardIndex: 0 })!;
    expect(next.tableau[1].map((c) => c.rank)).toEqual([6, 5]);
  });

  it('どこにも置けなければ null', () => {
    const s = empty();
    s.tableau[0] = [card('heart', 5)];
    expect(autoMoveFromTableau(s, { col: 0, cardIndex: 0 })).toBeNull();
  });

  it('wasteからの自動移動も組札優先', () => {
    let s = empty();
    s = { ...s, waste: [card('spade', 1)], foundations: { ...s.foundations } };
    const next = autoMoveFromWaste(s)!;
    expect(next.foundations.spade).toHaveLength(1);
  });
});
