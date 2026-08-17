/**
 * ピラミッドソリティアのロジック
 *
 * 仕様: docs/features/game-pyramid-solitaire.md
 *
 * 一般的なルール:
 * - 52枚1組。28枚をピラミッド状（1〜7枚の7段）に配り、残り24枚が山札
 * - **合計が13になる2枚**を取り除く（A=1・J=11・Q=12・K=13）。
 *   Kは1枚で13なので単独で取り除ける
 * - 取れるのは**他の札に覆われていない札**だけ。ピラミッドの札は
 *   真下の2枚が両方とも無くなってはじめて取れるようになる
 * - 山札は1枚ずつめくって捨て札へ。捨て札の一番上はピラミッドの札と組にできる
 * - 山札を使い切ったら、捨て札を裏返して山札に戻せる（引き直しは2回まで＝計3周）
 * - ピラミッドを全部取り除けたら勝ち。引き直しも尽きて手が無くなったら負け
 *
 * このリポジトリで決めたこと:
 * - **捨て札どうしは組にできない**（捨て札の一番上と、その下の札を組にする変種がある）。
 *   仕様書が挙げているのは「捨て札の一番上はピラミッドの札と組にできる」だけで、
 *   捨て札どうしを許すと山札の周回だけで解けてしまい、ピラミッドを崩す面白さが薄れる
 * - **山札は自動でめくらない**（仕様の「テンポは1人用なので本人に委ねる」）。
 *   ロジック側は `draw` / `redeal` を分けて持ち、UIが押されたときだけ呼ぶ
 *
 * 状態はすべて不変値として扱い、操作は新しい状態を返す（freecell.ts と同じ方針）。
 */

import { makeDeck, seededRng, shuffle, type Card } from './cards';

/** ピラミッドの段数 */
export const ROWS = 7;
/** ピラミッドに並ぶ枚数（1+2+…+7） */
export const PYRAMID_SIZE = (ROWS * (ROWS + 1)) / 2;
/** 山札の枚数（52 - 28） */
export const STOCK_SIZE = 52 - PYRAMID_SIZE;
/** 山札を引き直せる回数。一般的なルールと同じ2回（＝デックを3周できる） */
export const MAX_REDEALS = 2;
/** 組にする合計。Kが1枚で成立するのはランクが13だから */
export const TARGET = 13;

/**
 * 取り札の位置。
 * ピラミッドは0〜27の通し番号（上の段から左→右）、捨て札は一番上の1枚だけを指す。
 */
export type Spot = { kind: 'pyramid'; index: number } | { kind: 'waste' };

export interface PyramidState {
  /** ピラミッドの28マス。取り除いたマスは null（位置は詰めない） */
  pyramid: (Card | null)[];
  /** 山札。**末尾が次にめくる1枚**（pop で取り出す） */
  stock: Card[];
  /** 捨て札。末尾が一番上 */
  waste: Card[];
  /** 残りの引き直し回数 */
  redeals: number;
  /** 選択中の札。組の1枚目 */
  selected: Spot | null;
  /** 取り除いた回数（Kの単独取りも1手）。表示と記録に使う */
  moves: number;
  /** 配りを再現するためのシード番号（画面に出す） */
  seed: number;
}

/** 段（0始まり）の先頭の通し番号 */
export function rowStart(row: number): number {
  return (row * (row + 1)) / 2;
}

/** 通し番号から段を求める */
export function rowOf(index: number): number {
  let row = 0;
  while (rowStart(row + 1) <= index) row += 1;
  return row;
}

/** 通し番号から段内の位置を求める */
export function colOf(index: number): number {
  return index - rowStart(rowOf(index));
}

/**
 * 真下で覆っている2枚の通し番号。最下段は覆われないので空。
 * ピラミッドは1段ごとに半マスずらして積むため、(row, col) の下は
 * (row+1, col) と (row+1, col+1) の2枚になる。
 */
export function coversOf(index: number): number[] {
  const row = rowOf(index);
  if (row >= ROWS - 1) return [];
  const col = colOf(index);
  const next = rowStart(row + 1);
  return [next + col, next + col + 1];
}

/** 新しいシード番号を作る（freecell と同じく自前の番号） */
export function newSeed(rng: () => number = Math.random): number {
  return Math.floor(rng() * 1_000_000) + 1;
}

export function deal(seed: number = newSeed()): PyramidState {
  // ピラミッドの札はすべて表向き（覆われていても数字は見える）
  const deck = shuffle(makeDeck(1), seededRng(seed)).map((c) => ({ ...c, faceUp: true }));
  return {
    pyramid: deck.slice(0, PYRAMID_SIZE),
    // 末尾からめくるので、配った順の逆に持つ（先に配った札が先に出る）
    stock: deck.slice(PYRAMID_SIZE).map((c) => ({ ...c, faceUp: false })).reverse(),
    waste: [],
    redeals: MAX_REDEALS,
    selected: null,
    moves: 0,
    seed,
  };
}

/** その位置の札（無ければ null） */
export function cardAt(s: PyramidState, spot: Spot): Card | null {
  if (spot.kind === 'waste') return s.waste[s.waste.length - 1] ?? null;
  return s.pyramid[spot.index] ?? null;
}

/** ピラミッドの札が覆われていないか（札が無い位置は false） */
export function isExposed(pyramid: readonly (Card | null)[], index: number): boolean {
  if (!pyramid[index]) return false;
  return coversOf(index).every((i) => pyramid[i] === null);
}

/** いま触れる札か（ピラミッドは覆われていない札、捨て札は一番上） */
export function isAvailable(s: PyramidState, spot: Spot): boolean {
  if (spot.kind === 'waste') return s.waste.length > 0;
  return isExposed(s.pyramid, spot.index);
}

/** 同じ位置を指しているか */
export function sameSpot(a: Spot, b: Spot): boolean {
  if (a.kind === 'waste' || b.kind === 'waste') return a.kind === b.kind;
  return a.index === b.index;
}

/** 1枚で取り除ける札か（K＝13） */
export function isSingle(card: Card): boolean {
  return card.rank === TARGET;
}

/** 触れる2枚で、合計がちょうど13になるか */
export function canPair(s: PyramidState, a: Spot, b: Spot): boolean {
  if (sameSpot(a, b)) return false;
  if (!isAvailable(s, a) || !isAvailable(s, b)) return false;
  const ca = cardAt(s, a);
  const cb = cardAt(s, b);
  if (!ca || !cb) return false;
  return ca.rank + cb.rank === TARGET;
}

/** いま触れる位置をすべて挙げる（ピラミッド＋捨て札の一番上） */
export function availableSpots(s: PyramidState): Spot[] {
  const spots: Spot[] = [];
  for (let i = 0; i < PYRAMID_SIZE; i += 1) {
    if (isExposed(s.pyramid, i)) spots.push({ kind: 'pyramid', index: i });
  }
  if (s.waste.length > 0) spots.push({ kind: 'waste' });
  return spots;
}

/**
 * いま取り除ける組をすべて挙げる。
 * Kは単独なので1要素、それ以外は2要素の配列で返す。
 */
export function availableMoves(s: PyramidState): Spot[][] {
  const spots = availableSpots(s);
  const moves: Spot[][] = [];
  for (let i = 0; i < spots.length; i += 1) {
    const card = cardAt(s, spots[i]);
    if (!card) continue;
    if (isSingle(card)) {
      moves.push([spots[i]]);
      continue;
    }
    for (let j = i + 1; j < spots.length; j += 1) {
      if (canPair(s, spots[i], spots[j])) moves.push([spots[i], spots[j]]);
    }
  }
  return moves;
}

/** 取り除ける組が1つでもあるか */
export function hasAnyMove(s: PyramidState): boolean {
  return availableMoves(s).length > 0;
}

/** ヒント。取り除ける組を1つ返す（無ければ null） */
export function hint(s: PyramidState): Spot[] | null {
  return availableMoves(s)[0] ?? null;
}

/** 指定した位置の札を取り除いた状態を作る（ルールの確認はしない内部関数） */
function removeSpots(s: PyramidState, spots: Spot[]): PyramidState {
  let pyramid = s.pyramid;
  let waste = s.waste;
  for (const spot of spots) {
    if (spot.kind === 'waste') waste = waste.slice(0, -1);
    else pyramid = pyramid.map((c, i) => (i === spot.index ? null : c));
  }
  return { ...s, pyramid, waste, selected: null, moves: s.moves + 1 };
}

/**
 * 組を取り除く。ルール上できない指定なら null。
 * `spots` は1枚（K）か2枚（合計13）。
 */
export function removePair(s: PyramidState, spots: Spot[]): PyramidState | null {
  if (spots.length === 1) {
    const card = cardAt(s, spots[0]);
    if (!card || !isAvailable(s, spots[0]) || !isSingle(card)) return null;
    return removeSpots(s, spots);
  }
  if (spots.length !== 2) return null;
  if (!canPair(s, spots[0], spots[1])) return null;
  return removeSpots(s, spots);
}

/** タップの結果。UIは `effect` で演出（選択の見た目・揺れ）を出し分ける */
export interface TapResult {
  state: PyramidState;
  effect: 'select' | 'deselect' | 'remove' | 'invalid';
}

/**
 * 札をタップしたときの処理をまとめる。
 *
 * - 覆われている札・空きマスをタップ → `invalid`（画面では短い揺れ）
 * - K → その場で単独で取り除く（選択の手間を省く）
 * - 未選択 → 選択する
 * - 選択中の札をもう一度 → 選択を外す
 * - 合計13になる相手 → 2枚とも取り除く
 * - 合計13にならない相手 → `invalid`。**選択はタップした札に移す**
 *   （選び直しにもう1タップ要らないほうが速い。freecell の置き直しと同じ考え方）
 */
export function tap(s: PyramidState, spot: Spot): TapResult {
  if (!isAvailable(s, spot)) return { state: s, effect: 'invalid' };

  const card = cardAt(s, spot);
  if (!card) return { state: s, effect: 'invalid' };

  if (isSingle(card)) {
    const next = removePair(s, [spot]);
    return next ? { state: next, effect: 'remove' } : { state: s, effect: 'invalid' };
  }

  if (!s.selected) return { state: { ...s, selected: spot }, effect: 'select' };

  if (sameSpot(s.selected, spot)) return { state: { ...s, selected: null }, effect: 'deselect' };

  const paired = removePair(s, [s.selected, spot]);
  if (paired) return { state: paired, effect: 'remove' };

  return { state: { ...s, selected: spot }, effect: 'invalid' };
}

/** 山札をめくれるか */
export function canDraw(s: PyramidState): boolean {
  return s.stock.length > 0;
}

/** 山札が尽きたあと、捨て札を戻せるか */
export function canRedeal(s: PyramidState): boolean {
  return s.stock.length === 0 && s.waste.length > 0 && s.redeals > 0;
}

/**
 * 山札を1枚めくって捨て札へ。めくれなければ null。
 * **選択は外す**（山札をめくったあとも前の選択が残っていると、
 * 出てきた札と勝手に組んだように見えるため）。
 */
export function draw(s: PyramidState): PyramidState | null {
  if (!canDraw(s)) return null;
  const stock = s.stock.slice(0, -1);
  const drawn = s.stock[s.stock.length - 1];
  return { ...s, stock, waste: [...s.waste, { ...drawn, faceUp: true }], selected: null };
}

/**
 * 捨て札を裏返して山札に戻す（引き直し）。できなければ null。
 */
export function redeal(s: PyramidState): PyramidState | null {
  if (!canRedeal(s)) return null;
  return {
    ...s,
    // 捨て札の山をそのまま裏返して置き直す＝**一番下の札（最初にめくった札）が
    // 次にめくる札に戻る**。stock は末尾からめくるので、waste を反転させる
    stock: [...s.waste].reverse().map((c) => ({ ...c, faceUp: false })),
    waste: [],
    redeals: s.redeals - 1,
    selected: null,
  };
}

/** ピラミッドに残っている枚数 */
export function remaining(s: PyramidState): number {
  return s.pyramid.filter((c) => c !== null).length;
}

/** ピラミッドを全部取り除けたら勝ち */
export function isWon(s: PyramidState): boolean {
  return remaining(s) === 0;
}

/**
 * 詰み。取れる組が無く、めくることも引き直すこともできない状態。
 * 「解けるかどうか」の探索はしない（この局面から先へ進めないことだけを見る）。
 */
export function isLost(s: PyramidState): boolean {
  if (isWon(s)) return false;
  return !hasAnyMove(s) && !canDraw(s) && !canRedeal(s);
}
