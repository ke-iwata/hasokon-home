import { describe, expect, it } from 'vitest';
import { seededRng, type Card, type Suit } from '@/lib/cards';
import {
  autoMoveSpider,
  canDropSpider,
  dealRow,
  dealSpider,
  isMovableRun,
  isSpiderWon,
  moveSpider,
  SPIDER_LEVELS,
  type SpiderState,
} from '@/lib/spider';

const card = (suit: Suit, rank: number, faceUp = true): Card => ({
  suit,
  rank: rank as Card['rank'],
  faceUp,
  id: Math.floor(Math.random() * 1e9),
});

const empty = (): SpiderState => ({
  tableau: Array.from({ length: 10 }, () => []),
  stock: [],
  completed: 0,
  moves: 0,
  level: 'one',
});

describe('dealSpider', () => {
  for (const level of ['one', 'two', 'four'] as const) {
    it(`${SPIDER_LEVELS[level].label}: 10列に54枚、山札50枚、計104枚`, () => {
      const s = dealSpider(level, seededRng(1));
      const counts = s.tableau.map((p) => p.length);
      expect(counts).toEqual([6, 6, 6, 6, 5, 5, 5, 5, 5, 5]);
      expect(s.stock).toHaveLength(50);
      // 各列の一番下だけ表
      s.tableau.forEach((pile) => {
        pile.forEach((c, i) => expect(c.faceUp).toBe(i === pile.length - 1));
      });
    });
  }

  it('1スートはスペードだけ、枚数は104枚のまま', () => {
    const s = dealSpider('one', seededRng(2));
    const all = [...s.stock, ...s.tableau.flat()];
    expect(all).toHaveLength(104);
    expect(all.every((c) => c.suit === 'spade')).toBe(true);
  });
});

describe('isMovableRun', () => {
  it('同スート降順の表向き並びだけ動かせる', () => {
    const pile = [card('spade', 9), card('spade', 8), card('spade', 7)];
    expect(isMovableRun(pile, 0)).toBe(true);
    expect(isMovableRun(pile, 1)).toBe(true);
  });

  it('スートが混ざると動かせない', () => {
    const pile = [card('spade', 9), card('heart', 8)];
    expect(isMovableRun(pile, 0)).toBe(false);
    expect(isMovableRun(pile, 1)).toBe(true); // 末尾1枚は常に可
  });

  it('裏向きを含むと動かせない', () => {
    const pile = [card('spade', 9, false), card('spade', 8)];
    expect(isMovableRun(pile, 0)).toBe(false);
  });
});

describe('canDropSpider', () => {
  it('1つ大きいランクならスート不問', () => {
    expect(canDropSpider(card('spade', 5), card('heart', 6))).toBe(true);
    expect(canDropSpider(card('spade', 5), card('spade', 6))).toBe(true);
    expect(canDropSpider(card('spade', 5), card('spade', 5))).toBe(false);
  });

  it('空列には何でも置ける', () => {
    expect(canDropSpider(card('spade', 5), undefined)).toBe(true);
  });
});

describe('moveSpider', () => {
  it('移動すると元の列の裏札が表になる', () => {
    const s = empty();
    s.tableau[0] = [card('spade', 12, false), card('spade', 5)];
    s.tableau[1] = [card('heart', 6)];
    const next = moveSpider(s, 0, 1, 1)!;
    expect(next.tableau[1].map((c) => c.rank)).toEqual([6, 5]);
    expect(next.tableau[0][0].faceUp).toBe(true);
  });

  it('K→Aの同スート13枚が揃うと自動で回収される', () => {
    const s = empty();
    // 列0に K..2 の12枚、列1に A。Aを列0に移動すると完成する
    s.tableau[0] = Array.from({ length: 12 }, (_, i) => card('spade', 13 - i));
    s.tableau[1] = [card('spade', 1)];
    const next = moveSpider(s, 1, 0, 0)!;
    expect(next.completed).toBe(1);
    expect(next.tableau[0]).toHaveLength(0); // 13枚が場から消える
  });

  it('8組完成で勝ち', () => {
    const s = empty();
    expect(isSpiderWon({ ...s, completed: 8 })).toBe(true);
    expect(isSpiderWon({ ...s, completed: 7 })).toBe(false);
  });
});

describe('dealRow', () => {
  it('全列に1枚ずつ表向きに配られる', () => {
    const s = dealSpider('one', seededRng(3));
    const next = dealRow(s)!;
    expect(next.stock).toHaveLength(40);
    next.tableau.forEach((pile, i) => {
      expect(pile).toHaveLength(s.tableau[i].length + 1);
      expect(pile[pile.length - 1].faceUp).toBe(true);
    });
  });

  it('空列があると配れない', () => {
    const s = dealSpider('one', seededRng(4));
    const withEmpty = { ...s, tableau: s.tableau.map((p, i) => (i === 0 ? [] : p)) };
    expect(dealRow(withEmpty)).toBeNull();
  });

  it('山札が空なら配れない', () => {
    const s = { ...dealSpider('one', seededRng(5)), stock: [] };
    expect(dealRow(s)).toBeNull();
  });
});

describe('autoMoveSpider', () => {
  it('同スートで続く列を優先する', () => {
    const s = empty();
    s.tableau[0] = [card('spade', 5)];
    s.tableau[1] = [card('heart', 6)]; // ランクは合うが別スート
    s.tableau[2] = [card('spade', 6)]; // 同スート → こちらを選ぶべき
    const next = autoMoveSpider(s, 0, 0)!;
    expect(next.tableau[2].map((c) => c.rank)).toEqual([6, 5]);
    expect(next.tableau[1]).toHaveLength(1);
  });

  it('置ける列がなければ空列に置く', () => {
    const s = empty();
    s.tableau[0] = [card('spade', 5), card('spade', 4)];
    s.tableau[1] = [card('heart', 2)];
    // 4の行き先: 5の上には置けない（同ランク-1は3）。空列2〜9へ
    const next = autoMoveSpider(s, 0, 1)!;
    expect(next.tableau.filter((p) => p.length > 0).length).toBe(3);
  });

  it('動かせない並びは null', () => {
    const s = empty();
    s.tableau[0] = [card('spade', 5, false), card('heart', 4)];
    expect(autoMoveSpider(s, 0, 0)).toBeNull();
  });
});
