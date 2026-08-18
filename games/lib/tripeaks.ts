/**
 * トライピークスのロジック
 *
 * 仕様: docs/features/game-tripeaks.md
 *
 * 一般的なルール:
 * - 52枚1組。28枚を山型の3つのピーク（3枚・6枚・9枚・10枚の4段）に配る。
 *   最下段の10枚だけが表向きで、上の18枚は裏向き
 * - 残り24枚のうち1枚を捨て札に置き、23枚が山札
 * - 捨て札の一番上と**ランクが±1**の場札を取れる。取った札が新しい捨て札になり、
 *   続けて取れれば**連鎖**になる（AとK、AとBの2もつながる＝ラップあり）
 * - 覆っていた2枚が両方なくなった裏札は自動でめくれる
 * - 山札をタップすると1枚めくって捨て札になる（連鎖は途切れる）
 * - 場札28枚を全部取れたら勝ち。山札が尽き、取れる札も無くなったら負け
 *
 * このリポジトリで決めたこと:
 * - **山札の引き直しは無い**（トライピークスの標準ルール。ピラミッドの
 *   `redeal` に当たるものは持たない）。仕様書の「標準ルールのみ」に従う
 * - **ワイルドカードは入れない**（仕様書の「やらないこと」）
 * - 連鎖はこの配りのあいだの最長（`maxChain`）も持つ。記録に残すのは
 *   クリアの有無と最長連鎖で、画面側が `_records` に渡す
 *
 * 状態はすべて不変値として扱い、操作は新しい状態を返す
 * （pyramid-solitaire.ts と同じ方針）。
 */

import { makeDeck, seededRng, shuffle, type Card } from './cards';

/** ピークの数 */
export const PEAKS = 3;
/** 上から順の各段の枚数。3つのピークが下でつながって最下段は10枚になる */
export const ROW_SIZES: readonly number[] = [3, 6, 9, 10];
/** 段数 */
export const ROWS = ROW_SIZES.length;
/** 場に並ぶ枚数（3+6+9+10） */
export const TABLEAU_SIZE = ROW_SIZES.reduce((a, b) => a + b, 0);
/** 山札の枚数（52 - 28 - 捨て札の1枚） */
export const STOCK_SIZE = 52 - TABLEAU_SIZE - 1;

/** 段（0始まり）の先頭の通し番号 */
export function rowStart(row: number): number {
  let total = 0;
  for (let r = 0; r < row; r += 1) total += ROW_SIZES[r] ?? 0;
  return total;
}

/** 通し番号から段を求める（場の外は -1） */
export function rowOf(index: number): number {
  if (index < 0 || index >= TABLEAU_SIZE) return -1;
  let row = 0;
  while (rowStart(row + 1) <= index) row += 1;
  return row;
}

/** 通し番号から段内の位置を求める */
export function colOf(index: number): number {
  return index - rowStart(rowOf(index));
}

/**
 * 札の中心の横位置（札1枚の幅を1とした座標）。**画面の配置もここから作る**
 * （app/tripeaks/Game.tsx の cardStyle）。
 *
 * 最下段の10枚を 0.5, 1.5, … 9.5 に置き、上の段は覆う2枚の中間に置く。
 * ピークk（0〜2）の3枚目の段は 1+3k から、2枚目の段は 1.5+3k から、
 * 頂点は 2+3k に来る。
 */
export function xOf(index: number): number {
  const row = rowOf(index);
  const col = colOf(index);
  if (row === 0) return 2 + 3 * col;
  if (row === 1) return 1.5 + 3 * Math.floor(col / 2) + (col % 2);
  if (row === 2) return 1 + 3 * Math.floor(col / 3) + (col % 3);
  return 0.5 + col;
}

/**
 * 真下で覆っている2枚の通し番号。最下段は覆われないので空。
 *
 * 段ごとに半マスずれて積むので、覆う2枚は「その札の左下と右下」になる。
 * ピークが分かれているぶん、下の段の通し番号はピークごとに3枚ずつずれる。
 */
export function coversOf(index: number): number[] {
  const row = rowOf(index);
  if (row < 0 || row >= ROWS - 1) return [];
  const col = colOf(index);
  const next = rowStart(row + 1);
  if (row === 0) return [next + 2 * col, next + 2 * col + 1];
  if (row === 1) {
    // ピークkの2枚（col = 2k, 2k+1）は、そのピークの3枚（3k..3k+2）のうち隣り合う2枚を覆う
    const peak = Math.floor(col / 2);
    const base = next + 3 * peak + (col % 2);
    return [base, base + 1];
  }
  // 3段目は最下段の10枚のうち隣り合う2枚を覆う（ピークをまたいで共有する）
  const peak = Math.floor(col / 3);
  const base = next + 3 * peak + (col % 3);
  return [base, base + 1];
}

/** 新しいシード番号を作る（pyramid-solitaire と同じ自前の番号） */
export function newSeed(rng: () => number = Math.random): number {
  return Math.floor(rng() * 1_000_000) + 1;
}

export interface TriPeaksState {
  /** 場の28マス。取り除いたマスは null（位置は詰めない） */
  tableau: (Card | null)[];
  /** 山札。**末尾が次にめくる1枚**（pop で取り出す） */
  stock: Card[];
  /** 捨て札。末尾が一番上 */
  waste: Card[];
  /** いま続いている連鎖の数（山札をめくると0に戻る） */
  chain: number;
  /** この配りで出した最長の連鎖。記録に残すのはこちら */
  maxChain: number;
  /** 取った回数。表示と「1手でも動かしたか」の判定に使う */
  moves: number;
  /** 配りを再現するためのシード番号（画面に出す） */
  seed: number;
}

/** その位置の札が覆われていないか（札が無い位置は false） */
export function isExposed(tableau: readonly (Card | null)[], index: number): boolean {
  if (!tableau[index]) return false;
  return coversOf(index).every((i) => tableau[i] === null);
}

/**
 * 覆いが取れた裏札をめくる。
 *
 * **めくる判断はここ1か所に閉じる**（deal と take の両方から通す）。
 * 表になった札を裏に戻すことはないので、`faceUp` は単調に増えるだけ。
 */
export function reveal(tableau: readonly (Card | null)[]): (Card | null)[] {
  return tableau.map((card, i) =>
    card && !card.faceUp && isExposed(tableau, i) ? { ...card, faceUp: true } : card,
  );
}

export function deal(seed: number = newSeed()): TriPeaksState {
  const deck = shuffle(makeDeck(1), seededRng(seed));
  const tableau = reveal(deck.slice(0, TABLEAU_SIZE).map((c) => ({ ...c, faceUp: false })));
  const rest = deck.slice(TABLEAU_SIZE);
  return {
    tableau,
    // 末尾からめくるので、配った順の逆に持つ（先に配った札が先に出る）
    stock: rest.slice(1).map((c) => ({ ...c, faceUp: false })).reverse(),
    waste: [{ ...rest[0], faceUp: true }],
    chain: 0,
    maxChain: 0,
    moves: 0,
    seed,
  };
}

/** 捨て札の一番上（無ければ null） */
export function wasteTop(s: TriPeaksState): Card | null {
  return s.waste[s.waste.length - 1] ?? null;
}

/**
 * 2枚のランクがつながるか。**±1で、AとKもつながる**（ラップあり）。
 * A(1) と K(13) の差は12なので、12もつながりとして数える。
 */
export function connects(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  return diff === 1 || diff === 12;
}

/** その場札を取れるか（覆われておらず、捨て札の一番上と±1） */
export function canTake(s: TriPeaksState, index: number): boolean {
  const card = s.tableau[index];
  const top = wasteTop(s);
  if (!card || !top) return false;
  if (!isExposed(s.tableau, index)) return false;
  return connects(card.rank, top.rank);
}

/** いま取れる場札の通し番号をすべて挙げる */
export function takableIndices(s: TriPeaksState): number[] {
  const out: number[] = [];
  for (let i = 0; i < TABLEAU_SIZE; i += 1) {
    if (canTake(s, i)) out.push(i);
  }
  return out;
}

/** 取れる札が1枚でもあるか */
export function hasAnyMove(s: TriPeaksState): boolean {
  return takableIndices(s).length > 0;
}

/**
 * ヒント。取れる札を1枚返す（無ければ null）。
 *
 * 同じ条件なら**上の段（裏札を開けるほう）**を返す。通し番号は上の段から
 * 振ってあるので、`takableIndices` の先頭がそのまま上の段の札になる。
 */
export function hint(s: TriPeaksState): number | null {
  return takableIndices(s)[0] ?? null;
}

/**
 * 場札を1枚取って捨て札に置く。ルール上取れないなら null。
 * 連鎖が1増え、覆いが取れた裏札は自動でめくれる。
 */
export function take(s: TriPeaksState, index: number): TriPeaksState | null {
  if (!canTake(s, index)) return null;
  const card = s.tableau[index]!;
  const tableau = reveal(s.tableau.map((c, i) => (i === index ? null : c)));
  const chain = s.chain + 1;
  return {
    ...s,
    tableau,
    waste: [...s.waste, { ...card, faceUp: true }],
    chain,
    maxChain: Math.max(s.maxChain, chain),
    moves: s.moves + 1,
  };
}

/** 山札をめくれるか */
export function canDraw(s: TriPeaksState): boolean {
  return s.stock.length > 0;
}

/**
 * 山札を1枚めくって捨て札へ。めくれなければ null。
 * **連鎖は途切れる**（0に戻す。最長連鎖は残る）。
 */
export function draw(s: TriPeaksState): TriPeaksState | null {
  if (!canDraw(s)) return null;
  const drawn = s.stock[s.stock.length - 1];
  return {
    ...s,
    stock: s.stock.slice(0, -1),
    waste: [...s.waste, { ...drawn, faceUp: true }],
    chain: 0,
  };
}

/** 場に残っている枚数 */
export function remaining(s: TriPeaksState): number {
  return s.tableau.filter((c) => c !== null).length;
}

/** 場札を全部取れたら勝ち */
export function isWon(s: TriPeaksState): boolean {
  return remaining(s) === 0;
}

/**
 * 詰み。取れる札が無く、めくることもできない状態。
 * 引き直しが無いぶん、ピラミッドより判定は単純になる。
 */
export function isLost(s: TriPeaksState): boolean {
  if (isWon(s)) return false;
  return !hasAnyMove(s) && !canDraw(s);
}

/**
 * クリア率（%）。まだ1回も遊んでいなければ null（「0%」と出さないため）。
 *
 * ソリティア系は途中でやめるのが普通なので、`lib/records.ts` の `winRate`
 * （勝ち負けが決まった対局だけで割る）ではなく**プレイ数で割る**。
 * 詰みを記録に残さない（もどすでやり直せる）ぶん、負け数は当てにできない。
 */
export function clearRate(wins: number, plays: number): number | null {
  if (plays <= 0) return null;
  return Math.round((Math.min(wins, plays) / plays) * 100);
}
