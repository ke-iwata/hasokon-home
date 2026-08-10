/**
 * ソリティア（クロンダイク）のロジック
 *
 * 一般的なルール:
 * - 場札は7列。左からn列目にn枚配り、各列の一番下だけ表向き
 * - 場札は「色違い・1つ小さいランク」の上にだけ重ねられる（表向きの連続列ごと移動可）
 * - 空いた列にはKだけ置ける
 * - 組札（右上の4山）はスートごとにAから昇順に積む。4山すべてKまで積めば勝ち
 * - 山札は1枚めくり・無限に回せる（最も遊ばれている設定）
 *
 * 状態はすべて不変値として扱い、操作は新しい状態を返す。
 * UIは「タップで自動移動」を前提に、bestMoveFor で移動先を決める。
 */

import { isRed, makeDeck, shuffle, type Card, type Suit } from './cards';

export interface KlondikeState {
  /** 山札（裏向きの束。末尾がめくる位置） */
  stock: Card[];
  /** めくった札（末尾が一番上＝使える札） */
  waste: Card[];
  /** 組札。スートごとにAから積む（末尾が一番上） */
  foundations: Record<Suit, Card[]>;
  /** 場札7列（末尾が一番下＝手前の札） */
  tableau: Card[][];
  /** 経過手数（スコア代わり） */
  moves: number;
}

/** 場札の移動元の指定。列と、その列の何枚目からか（そこから下をまとめて動かす） */
export interface TableauFrom {
  col: number;
  /** tableau[col] の index。ここから末尾までを移動する */
  cardIndex: number;
}

export function deal(rng: () => number = Math.random): KlondikeState {
  const deck = shuffle(makeDeck(1), rng);
  const tableau: Card[][] = [];
  let pos = 0;
  for (let col = 0; col < 7; col += 1) {
    const pile = deck.slice(pos, pos + col + 1).map((c, i) => ({
      ...c,
      faceUp: i === col, // 一番下だけ表
    }));
    tableau.push(pile);
    pos += col + 1;
  }
  return {
    stock: deck.slice(pos).map((c) => ({ ...c, faceUp: false })),
    waste: [],
    foundations: { spade: [], heart: [], diamond: [], club: [] },
    tableau,
    moves: 0,
  };
}

/** 山札を1枚めくる。空なら waste を裏返して山札に戻す（周回制限なし） */
export function drawStock(s: KlondikeState): KlondikeState {
  if (s.stock.length > 0) {
    const stock = [...s.stock];
    const card = { ...stock.pop()!, faceUp: true };
    return { ...s, stock, waste: [...s.waste, card], moves: s.moves + 1 };
  }
  if (s.waste.length === 0) return s;
  return {
    ...s,
    stock: [...s.waste].reverse().map((c) => ({ ...c, faceUp: false })),
    waste: [],
    moves: s.moves + 1,
  };
}

/** 場札の上に置けるか（色違いで1つ小さい。空列にはKのみ） */
export function canStackTableau(moving: Card, target: Card | undefined): boolean {
  if (!target) return moving.rank === 13;
  return target.faceUp && isRed(moving.suit) !== isRed(target.suit) && moving.rank === target.rank - 1;
}

/** 組札に置けるか（同スートで1つ大きい。空ならAのみ） */
export function canStackFoundation(moving: Card, s: KlondikeState): boolean {
  const pile = s.foundations[moving.suit];
  return pile.length === 0 ? moving.rank === 1 : pile[pile.length - 1].rank === moving.rank - 1;
}

/** 列の一番下が裏向きなら表にする（移動後の後処理） */
function flipTop(pile: Card[]): Card[] {
  if (pile.length === 0) return pile;
  const last = pile[pile.length - 1];
  if (last.faceUp) return pile;
  return [...pile.slice(0, -1), { ...last, faceUp: true }];
}

/** waste の一番上を場札 col へ */
export function wasteToTableau(s: KlondikeState, col: number): KlondikeState | null {
  const card = s.waste[s.waste.length - 1];
  if (!card) return null;
  const target = s.tableau[col];
  if (!canStackTableau(card, target[target.length - 1])) return null;
  const tableau = s.tableau.map((p, i) => (i === col ? [...p, card] : p));
  return { ...s, waste: s.waste.slice(0, -1), tableau, moves: s.moves + 1 };
}

/** waste の一番上を組札へ */
export function wasteToFoundation(s: KlondikeState): KlondikeState | null {
  const card = s.waste[s.waste.length - 1];
  if (!card || !canStackFoundation(card, s)) return null;
  return {
    ...s,
    waste: s.waste.slice(0, -1),
    foundations: { ...s.foundations, [card.suit]: [...s.foundations[card.suit], card] },
    moves: s.moves + 1,
  };
}

/** 場札から場札へ（cardIndex から下をまとめて移動） */
export function tableauToTableau(
  s: KlondikeState,
  from: TableauFrom,
  toCol: number,
): KlondikeState | null {
  if (from.col === toCol) return null;
  const pile = s.tableau[from.col];
  const movingTop = pile[from.cardIndex];
  if (!movingTop || !movingTop.faceUp) return null;
  const target = s.tableau[toCol];
  if (!canStackTableau(movingTop, target[target.length - 1])) return null;
  const moving = pile.slice(from.cardIndex);
  const tableau = s.tableau.map((p, i) => {
    if (i === from.col) return flipTop(p.slice(0, from.cardIndex));
    if (i === toCol) return [...p, ...moving];
    return p;
  });
  return { ...s, tableau, moves: s.moves + 1 };
}

/** 場札の一番下の1枚を組札へ */
export function tableauToFoundation(s: KlondikeState, col: number): KlondikeState | null {
  const pile = s.tableau[col];
  const card = pile[pile.length - 1];
  if (!card || !card.faceUp || !canStackFoundation(card, s)) return null;
  const tableau = s.tableau.map((p, i) => (i === col ? flipTop(p.slice(0, -1)) : p));
  return {
    ...s,
    tableau,
    foundations: { ...s.foundations, [card.suit]: [...s.foundations[card.suit], card] },
    moves: s.moves + 1,
  };
}

export function isWon(s: KlondikeState): boolean {
  return Object.values(s.foundations).every((p) => p.length === 13);
}

/**
 * タップされた札の「一番よい移動」を実行する。
 * 優先順: 組札 > 場札。見つからなければ null。
 * UIはこれを呼ぶだけでよく、ドラッグ&ドロップが要らなくなる。
 */
export function autoMoveFromWaste(s: KlondikeState): KlondikeState | null {
  const toFoundation = wasteToFoundation(s);
  if (toFoundation) return toFoundation;
  for (let col = 0; col < 7; col += 1) {
    const r = wasteToTableau(s, col);
    if (r) return r;
  }
  return null;
}

export function autoMoveFromTableau(s: KlondikeState, from: TableauFrom): KlondikeState | null {
  const pile = s.tableau[from.col];
  // 一番下の1枚なら組札を最優先で試す
  if (from.cardIndex === pile.length - 1) {
    const r = tableauToFoundation(s, from.col);
    if (r) return r;
  }
  // 次に他の場札へ。空列への移動は後回しにする（Kの無駄動きを減らす）
  const cols = [...Array(7).keys()].filter((c) => c !== from.col);
  const nonEmptyFirst = [
    ...cols.filter((c) => s.tableau[c].length > 0),
    ...cols.filter((c) => s.tableau[c].length === 0),
  ];
  for (const col of nonEmptyFirst) {
    const r = tableauToTableau(s, from, col);
    if (r) return r;
  }
  return null;
}
