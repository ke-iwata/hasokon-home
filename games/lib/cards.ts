/**
 * トランプの共有モデル（ソリティア・スパイダーで使う）
 *
 * カードの絵柄はUnicodeのスート記号と数字だけで自前描画する。
 * トランプのルール・スート・ランクはパブリックドメインで権利問題はない。
 */

export type Suit = 'spade' | 'heart' | 'diamond' | 'club';
/** 1=A, 11=J, 12=Q, 13=K */
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface Card {
  suit: Suit;
  rank: Rank;
  faceUp: boolean;
  /** 同一デックが複数あるとき（スパイダー）もReactのkeyにできる一意なID */
  id: number;
}

export const SUITS: readonly Suit[] = ['spade', 'heart', 'diamond', 'club'];

export const SUIT_SYMBOL: Record<Suit, string> = {
  spade: '♠',
  heart: '♥',
  diamond: '♦',
  club: '♣',
};

export const RANK_LABEL: Record<Rank, string> = {
  1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7',
  8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K',
};

export function isRed(suit: Suit): boolean {
  return suit === 'heart' || suit === 'diamond';
}

/**
 * デックを作る。
 * @param deckCount デック数（クロンダイク=1、スパイダー=2）
 * @param suits 使うスート（スパイダーの1スート/2スート用。省略で4スート）
 *   スート数を減らしても枚数は維持する（1スートなら同じスートを8組）
 */
export function makeDeck(deckCount = 1, suits: readonly Suit[] = SUITS): Card[] {
  const cards: Card[] = [];
  let id = 0;
  // 52 × deckCount 枚を、指定スートを繰り返して構成する
  const setCount = (4 / suits.length) * deckCount;
  for (let s = 0; s < setCount; s += 1) {
    for (const suit of suits) {
      for (let rank = 1 as Rank; rank <= 13; rank = (rank + 1) as Rank) {
        cards.push({ suit, rank, faceUp: false, id: id++ });
      }
    }
  }
  return cards;
}

/** Fisher–Yates。rng を注入できるのでテストで再現できる */
export function shuffle(cards: Card[], rng: () => number = Math.random): Card[] {
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** テストで使う再現可能な擬似乱数（mulberry32） */
export function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
