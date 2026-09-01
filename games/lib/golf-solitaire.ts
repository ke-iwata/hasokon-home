/**
 * ゴルフソリティアのロジック
 *
 * 仕様: docs/features/game-golf-solitaire.md
 *
 * 一般的なルール:
 * - 52枚1組。35枚を**7列×5枚**に配り、**全部表向き**にする。
 *   取れるのは各列のいちばん手前（下端）の1枚だけ
 * - 捨て札の一番上と**ランクが±1**の場札を取れる（スートは問わない）。
 *   取った札が新しい捨て札になり、続けて取れれば**連鎖**になる
 * - 取れる札がなければ山札（17枚）から1枚めくって捨て札にする（連鎖は途切れる）
 * - 場札35枚を全部取れたら勝ち。山札が尽き、取れる札も無くなったら負け
 *
 * このリポジトリで決めたこと:
 * - **A と K は既定ではつながらない**（K で連鎖が止まる、最も広く遊ばれている形）。
 *   `wrap` を立てると A↔K もつながる（仕様書の「提案する仕様」5）。
 *   トライピークス（`lib/tripeaks.ts`）は常にラップありなので、`connects` は
 *   共通化せず、こちらは第3引数で切り替える
 * - **配りはじめの捨て札は置かない。** 35 + 17 = 52 でちょうど使い切る配り方
 *   （仕様書の「山札（17枚）」）なので、捨て札に回せる52枚目が無い。
 *   最初の1手は必ず「山札をめくる」になる
 * - **クリア可能性は保証しない**（盤面が完全公開情報なので、ゴルフでは配りが
 *   詰んでいることが普通にある）。理不尽な配置だけ `isBadDeal` で弾く
 * - 連鎖はこの配りのあいだの最長（`maxChain`）も持つ。記録に残すのは
 *   クリアの有無と最長連鎖で、画面側が `_records` に渡す
 *
 * 状態はすべて不変値として扱い、操作は新しい状態を返す
 * （tripeaks.ts・pyramid-solitaire.ts と同じ方針）。
 */

import { makeDeck, seededRng, shuffle, type Card } from './cards';

/** 場の列数 */
export const COLS = 7;
/** 1列あたりの枚数 */
export const COL_SIZE = 5;
/** 場に並ぶ枚数（7列×5枚） */
export const TABLEAU_SIZE = COLS * COL_SIZE;
/** 山札の枚数（52 - 35）。捨て札は最初は空なので、ちょうど使い切る */
export const STOCK_SIZE = 52 - TABLEAU_SIZE;

/** 配り直しを試す上限。ここに達したらその配りをそのまま使う（無限には回さない） */
const MAX_REDEAL = 10;

/** 新しいシード番号を作る（tripeaks・pyramid-solitaire と同じ自前の番号） */
export function newSeed(rng: () => number = Math.random): number {
  return Math.floor(rng() * 1_000_000) + 1;
}

export interface GolfState {
  /** 場の7列。**各列の末尾が手前**（取れる1枚）。取り切った列は空配列 */
  tableau: Card[][];
  /** 山札。**末尾が次にめくる1枚**（pop で取り出す） */
  stock: Card[];
  /** 捨て札。末尾が一番上。配りはじめは空 */
  waste: Card[];
  /** いま続いている連鎖の数（山札をめくると0に戻る） */
  chain: number;
  /** この配りで出した最長の連鎖。記録に残すのはこちら */
  maxChain: number;
  /** 取った回数。表示と「1手でも動かしたか」の判定に使う */
  moves: number;
  /** 配りを再現するためのシード番号（画面に出す） */
  seed: number;
  /** A↔K をつなげるか。既定は false（K で連鎖が止まる） */
  wrap: boolean;
}

/**
 * 2枚のランクがつながるか。**±1**。
 * `wrap` を立てたときだけ A(1) と K(13) もつながる（差は12）。
 */
export function connects(a: number, b: number, wrap = false): boolean {
  const diff = Math.abs(a - b);
  return diff === 1 || (wrap && diff === 12);
}

/**
 * 配り直したい配置か（仕様書の「軽いガード」）。
 *
 * ゴルフは**クリアできない配りが普通にある**ゲームなので、解けることは保証しない。
 * ここで弾くのは「遊ぶ前から選択肢が無い」と分かる2つだけにしてある。
 *
 * 1. 同じ数字の4枚が全部1つの列に固まっている（仕様書に挙がっている例）。
 *    その数字は1回しか使えず、列も5枚中4枚が同じ数字で死ぬ
 * 2. 手前の7枚（最初に取れる候補）の数字が4種類未満。開幕から札のつなぎ先が
 *    ほとんど無く、山札を空撃ちするだけの立ち上がりになる
 */
export function isBadDeal(columns: readonly (readonly Card[])[]): boolean {
  for (const column of columns) {
    const counts = new Map<number, number>();
    for (const card of column) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
    for (const n of counts.values()) if (n >= 4) return true;
  }
  const fronts = new Set(
    columns.map((column) => column[column.length - 1]?.rank).filter((r) => r !== undefined),
  );
  return fronts.size < 4;
}

/**
 * 配る。同じシードからは必ず同じ配りになる（「同じ配りをもう一度」で使う）。
 *
 * `isBadDeal` に当たったら**同じ乱数の続きで**混ぜ直す。シードから決まる
 * 手順なので、配り直しが起きても再現性は保たれる。
 */
export function deal(seed: number = newSeed(), wrap = false): GolfState {
  const rng = seededRng(seed);
  let deck = shuffle(makeDeck(1), rng);
  let tableau = toColumns(deck);
  for (let i = 0; i < MAX_REDEAL && isBadDeal(tableau); i += 1) {
    deck = shuffle(makeDeck(1), rng);
    tableau = toColumns(deck);
  }
  return {
    tableau,
    // 末尾からめくるので、配った順の逆に持つ（先に配った札が先に出る）
    stock: deck
      .slice(TABLEAU_SIZE)
      .map((c) => ({ ...c, faceUp: false }))
      .reverse(),
    waste: [],
    chain: 0,
    maxChain: 0,
    moves: 0,
    seed,
    wrap,
  };
}

/** 山から35枚を7列×5枚に配る（**全部表向き**） */
function toColumns(deck: readonly Card[]): Card[][] {
  return Array.from({ length: COLS }, (_, col) =>
    deck.slice(col * COL_SIZE, (col + 1) * COL_SIZE).map((c) => ({ ...c, faceUp: true })),
  );
}

/** 捨て札の一番上（無ければ null） */
export function wasteTop(s: GolfState): Card | null {
  return s.waste[s.waste.length - 1] ?? null;
}

/** その列の手前の1枚（空の列は null） */
export function frontOf(s: GolfState, col: number): Card | null {
  const column = s.tableau[col];
  if (!column) return null;
  return column[column.length - 1] ?? null;
}

/** その列の手前の札を取れるか（捨て札が空＝配りはじめは取れない） */
export function canPick(s: GolfState, col: number): boolean {
  const card = frontOf(s, col);
  const top = wasteTop(s);
  if (!card || !top) return false;
  return connects(card.rank, top.rank, s.wrap);
}

/** いま取れる列の番号をすべて挙げる */
export function pickableColumns(s: GolfState): number[] {
  const out: number[] = [];
  for (let col = 0; col < s.tableau.length; col += 1) {
    if (canPick(s, col)) out.push(col);
  }
  return out;
}

/** 取れる札が1枚でもあるか */
export function hasAnyMove(s: GolfState): boolean {
  return pickableColumns(s).length > 0;
}

/**
 * ヒント。取れる列を1つ返す（無ければ null）。
 *
 * **残り枚数がいちばん多い列**を選ぶ。ゴルフは1列でも残ると負けなので、
 * 厚い列から削るのが定石（ページの「コツ」もこれに合わせてある）。
 * 同数なら左の列。
 */
export function hint(s: GolfState): number | null {
  const cols = pickableColumns(s);
  if (cols.length === 0) return null;
  return cols.reduce((best, col) =>
    s.tableau[col].length > s.tableau[best].length ? col : best,
  );
}

/**
 * 場札を1枚取って捨て札に置く。ルール上取れないなら null。
 * 連鎖が1増える。
 */
export function pick(s: GolfState, col: number): GolfState | null {
  if (!canPick(s, col)) return null;
  const column = s.tableau[col];
  const card = column[column.length - 1];
  const chain = s.chain + 1;
  return {
    ...s,
    tableau: s.tableau.map((c, i) => (i === col ? c.slice(0, -1) : c)),
    waste: [...s.waste, { ...card, faceUp: true }],
    chain,
    maxChain: Math.max(s.maxChain, chain),
    moves: s.moves + 1,
  };
}

/** 山札をめくれるか */
export function canDraw(s: GolfState): boolean {
  return s.stock.length > 0;
}

/**
 * 山札を1枚めくって捨て札へ。めくれなければ null。
 * **連鎖は途切れる**（0に戻す。最長連鎖は残る）。
 *
 * `moves` は増やさない（「取った回数」なので）。ただし配りを1プレイとして
 * 数えるかどうかは画面側が「最初の1手」で決めるため、めくりも1手に含めて扱う。
 */
export function draw(s: GolfState): GolfState | null {
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
export function remaining(s: GolfState): number {
  return s.tableau.reduce((total, column) => total + column.length, 0);
}

/** 場札を全部取れたらクリア */
export function isCleared(s: GolfState): boolean {
  return remaining(s) === 0;
}

/** 詰み。取れる札が無く、めくることもできない状態（引き直しは無い） */
export function isLost(s: GolfState): boolean {
  if (isCleared(s)) return false;
  return !hasAnyMove(s) && !canDraw(s);
}

/**
 * クリア率（%）。まだ1回も遊んでいなければ null（「0%」と出さないため）。
 *
 * ソリティア系は途中でやめるのが普通なので、`lib/records.ts` の `winRate`
 * （勝ち負けが決まった対局だけで割る）ではなく**プレイ数で割る**
 * （tripeaks.ts の `clearRate` と同じ）。
 */
export function clearRate(wins: number, plays: number): number | null {
  if (plays <= 0) return null;
  return Math.round((Math.min(wins, plays) / plays) * 100);
}

/** 記録の区分。A↔K をつなげるかでクリア率が変わるので分けて持つ */
export const WRAP_VARIANT = 'wrap';

/** 記録の区分名（`wrap` の既定は `DEFAULT_VARIANT`＝空文字） */
export function variantOf(wrap: boolean): string {
  return wrap ? WRAP_VARIANT : '';
}
