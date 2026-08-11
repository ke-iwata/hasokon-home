/**
 * フリーセルのロジック
 *
 * 一般的なルール:
 * - 52枚1組。最初から全カードが表向きで配られる（運の要素がほぼ無い）
 * - 場札は8列。左4列に7枚ずつ、右4列に6枚ずつ（7×4 + 6×4 = 52）
 * - フリーセル4つ。カードを1枚ずつ一時的に置ける
 * - ホームセル（組札）4つ。同じスートをA→Kの順に積む
 * - 場札は「色違いで1つ小さいランク」の上に置ける。空列にはどのカードも置ける
 * - 52枚すべてがホームセルに乗れば勝ち
 *
 * 複数枚移動（スーパームーブ）:
 *   一度に動かせる枚数 = (空きフリーセル数 + 1) × 2 ^ (空き列数)
 * 実際には1枚ずつの移動の連続だが、ここでは枚数の上限だけを見て一度に動かす。
 * 移動先が空列の場合、その列は「空き列数」に数えない。
 *
 * 状態はすべて不変値として扱い、操作は新しい状態を返す（klondike.ts と同じ方針）。
 */

import { isRed, makeDeck, seededRng, shuffle, SUITS, type Card, type Suit } from './cards';

export const FREE_COUNT = 4;
export const TABLEAU_COLS = 8;

export interface FreecellState {
  /** フリーセル4つ。空きは null */
  free: (Card | null)[];
  /** ホームセル。スートごとにAから積む（末尾が一番上） */
  foundations: Record<Suit, Card[]>;
  /** 場札8列（末尾が一番下＝手前の札） */
  tableau: Card[][];
  /** 経過手数 */
  moves: number;
  /** 配りを再現するためのシード番号（画面に出す） */
  seed: number;
}

/** 移動元。場札は cardIndex から末尾までをまとめて動かす */
export type Source =
  | { kind: 'free'; index: number }
  | { kind: 'tableau'; col: number; cardIndex: number };

/** 移動先。ホームセルは札のスートで行き先が決まるので位置を持たない */
export type Target =
  | { kind: 'free'; index: number }
  | { kind: 'foundation' }
  | { kind: 'tableau'; col: number };

/**
 * 新しいシード番号を作る。
 * マイクロソフト版のゲーム番号（1〜32000）とは互換性が無い自前の番号で、
 * 同じ番号を渡せば同じ配りになることだけを保証する。
 */
export function newSeed(rng: () => number = Math.random): number {
  return Math.floor(rng() * 1_000_000) + 1;
}

export function deal(seed: number = newSeed()): FreecellState {
  // フリーセルは最初から全部表向き
  const deck = shuffle(makeDeck(1), seededRng(seed)).map((c) => ({ ...c, faceUp: true }));
  const tableau: Card[][] = [];
  let pos = 0;
  for (let col = 0; col < TABLEAU_COLS; col += 1) {
    const count = col < 4 ? 7 : 6;
    tableau.push(deck.slice(pos, pos + count));
    pos += count;
  }
  return {
    free: Array<Card | null>(FREE_COUNT).fill(null),
    foundations: { spade: [], heart: [], diamond: [], club: [] },
    tableau,
    moves: 0,
    seed,
  };
}

/** 場札に置けるか（色違いで1つ小さい。空列にはどの札でも置ける） */
export function canStack(moving: Card, target: Card | undefined): boolean {
  if (!target) return true;
  return isRed(moving.suit) !== isRed(target.suit) && moving.rank === target.rank - 1;
}

/** ホームセルに置けるか（同スートで1つ大きい。空ならAのみ） */
export function canStackFoundation(moving: Card, s: FreecellState): boolean {
  const pile = s.foundations[moving.suit];
  return pile.length === 0 ? moving.rank === 1 : pile[pile.length - 1].rank === moving.rank - 1;
}

/** pile の cardIndex から末尾までが「色違い・降順に連続した並び」か */
export function isMovableRun(pile: Card[], cardIndex: number): boolean {
  if (cardIndex < 0 || cardIndex >= pile.length) return false;
  for (let i = cardIndex + 1; i < pile.length; i += 1) {
    if (!canStack(pile[i], pile[i - 1])) return false;
  }
  return true;
}

/**
 * 一度に動かせる最大枚数。
 * @param toCol 移動先の列。そこが空列なら「空き列数」から除く
 */
export function maxMovable(s: FreecellState, toCol?: number): number {
  const freeCells = s.free.filter((c) => c === null).length;
  let emptyCols = s.tableau.filter((p) => p.length === 0).length;
  if (toCol !== undefined && s.tableau[toCol]?.length === 0) emptyCols -= 1;
  return (freeCells + 1) * 2 ** emptyCols;
}

/** 移動元の札（場札なら並び全部）。動かせない指定なら null */
function pickUp(s: FreecellState, from: Source): Card[] | null {
  if (from.kind === 'free') {
    const c = s.free[from.index];
    return c ? [c] : null;
  }
  const pile = s.tableau[from.col];
  if (!pile || !isMovableRun(pile, from.cardIndex)) return null;
  return pile.slice(from.cardIndex);
}

/** 移動を実行する。ルール上できない移動なら null */
export function move(s: FreecellState, from: Source, to: Target): FreecellState | null {
  if (from.kind === 'tableau' && to.kind === 'tableau' && from.col === to.col) return null;
  if (from.kind === 'free' && to.kind === 'free' && from.index === to.index) return null;

  const moving = pickUp(s, from);
  if (!moving) return null;

  if (to.kind === 'free') {
    // 空きは null。範囲外の index なら undefined なので、どちらも弾かれる
    if (moving.length !== 1 || s.free[to.index] !== null) return null;
  } else if (to.kind === 'foundation') {
    if (moving.length !== 1 || !canStackFoundation(moving[0], s)) return null;
  } else {
    const target = s.tableau[to.col];
    if (!target) return null;
    if (!canStack(moving[0], target[target.length - 1])) return null;
    // 空き（フリーセル・空列）は移動前の状態で数える
    if (moving.length > maxMovable(s, to.col)) return null;
  }

  // 取り除く
  const free = [...s.free];
  let tableau = s.tableau;
  if (from.kind === 'free') free[from.index] = null;
  else tableau = tableau.map((p, i) => (i === from.col ? p.slice(0, from.cardIndex) : p));

  // 置く
  let foundations = s.foundations;
  if (to.kind === 'free') {
    free[to.index] = moving[0];
  } else if (to.kind === 'foundation') {
    const suit = moving[0].suit;
    foundations = { ...foundations, [suit]: [...foundations[suit], moving[0]] };
  } else {
    tableau = tableau.map((p, i) => (i === to.col ? [...p, ...moving] : p));
  }

  return { ...s, free, foundations, tableau, moves: s.moves + 1 };
}

/**
 * タップされた札の「一番よい移動」を実行する。
 * 優先順: ホームセル > 他の場札（空列は後回し）> フリーセル。
 * UIはこれを呼ぶだけでよく、ドラッグ&ドロップが要らなくなる。
 */
export function autoMove(s: FreecellState, from: Source): FreecellState | null {
  const toFoundation = move(s, from, { kind: 'foundation' });
  if (toFoundation) return toFoundation;

  // 空列への移動は後回しにする（空列は貴重なので無駄に埋めない）
  const cols = s.tableau
    .map((_, i) => i)
    .filter((c) => !(from.kind === 'tableau' && c === from.col));
  const nonEmptyFirst = [
    ...cols.filter((c) => s.tableau[c].length > 0),
    ...cols.filter((c) => s.tableau[c].length === 0),
  ];
  for (const col of nonEmptyFirst) {
    const r = move(s, from, { kind: 'tableau', col });
    if (r) return r;
  }

  // 最後の手段としてフリーセルへ逃がす（フリーセルからフリーセルは動かさない）
  if (from.kind === 'tableau') {
    const index = s.free.findIndex((c) => c === null);
    if (index >= 0) {
      const r = move(s, from, { kind: 'free', index });
      if (r) return r;
    }
  }
  return null;
}

export function isWon(s: FreecellState): boolean {
  return SUITS.every((suit) => s.foundations[suit].length === 13);
}

/**
 * 動かせる手が1つでもあるか（詰み検出）。
 * 解けるかどうかの探索はしない。「もう1手も動かせない」ことだけを見る。
 */
export function hasAnyMove(s: FreecellState): boolean {
  const cardsInTableau = s.tableau.some((p) => p.length > 0);

  // フリーセルに空きがあれば、場札の札をそこへ逃がせる
  if (s.free.some((c) => c === null) && cardsInTableau) return true;

  // 空列があれば、他の列かフリーセルから何か持って来られる
  if (s.tableau.some((p) => p.length === 0)) {
    if (s.free.some((c) => c !== null)) return true;
    if (cardsInTableau) return true;
  }

  // フリーセルの札の行き先
  for (const c of s.free) {
    if (!c) continue;
    if (canStackFoundation(c, s)) return true;
    if (s.tableau.some((p) => p.length > 0 && canStack(c, p[p.length - 1]))) return true;
  }

  // 場札の札の行き先
  const limit = maxMovable(s);
  for (let col = 0; col < s.tableau.length; col += 1) {
    const pile = s.tableau[col];
    if (pile.length === 0) continue;
    if (canStackFoundation(pile[pile.length - 1], s)) return true;
    // 末尾から並びを伸ばしながら、動かせる長さの範囲で行き先を探す
    for (let i = pile.length - 1; i >= 0 && pile.length - i <= limit; i -= 1) {
      if (!isMovableRun(pile, i)) break;
      const head = pile[i];
      for (let to = 0; to < s.tableau.length; to += 1) {
        if (to === col) continue;
        const t = s.tableau[to];
        if (t.length > 0 && canStack(head, t[t.length - 1])) return true;
      }
    }
  }
  return false;
}
