/**
 * ゴルフソリティアのロジック
 *
 * 仕様: docs/features/game-golf-solitaire.md
 *
 * 一般的なルール:
 * - 52枚1組。**35枚を7列×5枚、全部表向き**に配る
 * - 各列の**いちばん手前（下端）の1枚**だけが取れる
 * - 捨て札の一番上と**ランクが±1**の札を場から取れる（スートは問わない）。
 *   取った札が新しい捨て札になるので、続けて取れれば**連鎖**になる
 * - 取れる札が無ければ山札（17枚）から1枚めくって捨て札にする（連鎖は途切れる）
 * - 場札35枚を全部取り切ればクリア。山札が尽きて手が無くなったら終了
 *
 * このリポジトリで決めたこと:
 * - **AとKは既定ではつながらない**（Kで連鎖が止まる、最も広く遊ばれている形）。
 *   仕様書どおり「A↔Kをつなげる」を区分（`variant`）として用意し、
 *   記録もその区分ごとに分けて持つ
 * - **山札は17枚で、捨て札は空から始まる**（52 − 35 ＝ 17。仕様書の枚数どおり）。
 *   トライピークスは配った時点で1枚を捨て札に置くが、こちらは
 *   最初の1枚も本人がめくる。`hasAnyMove` は捨て札が無いあいだ false を返す
 * - **山札の引き直しは無い**（トライピークスと同じ）
 * - 盤面が完全公開情報なので、**配りは「クリア可能性」を保証しない**
 *   （仕様書の「実装の要点」）。理不尽な配りだけ `isPoorDeal` で弾く
 * - 連鎖はこの配りのあいだの最長（`maxChain`）も持つ。記録に残すのは
 *   クリアの有無と最長連鎖で、画面側が `_records` に渡す
 *
 * 状態はすべて不変値として扱い、操作は新しい状態を返す
 * （tripeaks.ts / pyramid-solitaire.ts と同じ方針）。
 */

import { makeDeck, seededRng, shuffle, type Card } from './cards';

/** 場の列数 */
export const COLUMNS = 7;
/** 1列の枚数 */
export const COLUMN_SIZE = 5;
/** 場に並ぶ枚数（7×5） */
export const TABLEAU_SIZE = COLUMNS * COLUMN_SIZE;
/** 山札の枚数（52 − 35）。**捨て札は空から始まる**ので1枚引かない */
export const STOCK_SIZE = 52 - TABLEAU_SIZE;

/**
 * ルールの区分。**記録の区分（variant）としてもこの文字列をそのまま使う**
 * ので、値を変えると過去の記録と切り離される（`lib/records.ts`）。
 */
export type GolfVariant = 'standard' | 'wrap';

/** 区分の選択肢。画面のセグメントはこの順で並べる */
export const VARIANTS: readonly GolfVariant[] = ['standard', 'wrap'];

/** セグメントに出す短い名前（幅320pxの端末で2つ並べても1行に収まる長さ） */
export const VARIANT_LABEL: Record<GolfVariant, string> = {
  standard: '標準',
  wrap: 'A↔Kあり',
};

/**
 * 山札の横に常時出す案内。
 *
 * **`.gf-legend` の高さ（幅320pxの端末で2行ぶん）に収まる長さにすること。**
 * あふれると `overflow: hidden` で文の途中が切れる（実測で1行あたり約13文字）。
 * 「Kで連鎖が止まる」といった詳しい話はページの「遊び方」とFAQに書く。
 */
export const VARIANT_NOTE: Record<GolfVariant, string> = {
  standard: '1つ違いで取れる。KとAはつながりません',
  wrap: '1つ違いで取れる。AはKにも2にもつながります',
};

/** 配り直しの上限。ガードが当たり続けても必ず止まるようにする */
export const MAX_REDEALS = 8;

export interface GolfState {
  /** 場の7列。**各列の末尾が手前＝取れる1枚**。空になった列は空配列で残す */
  columns: Card[][];
  /** 山札。**末尾が次にめくる1枚**（pop で取り出す） */
  stock: Card[];
  /** 捨て札。末尾が一番上。**配った直後は空** */
  waste: Card[];
  /** いま続いている連鎖の数（山札をめくると0に戻る） */
  chain: number;
  /** この配りで出した最長の連鎖。記録に残すのはこちら */
  maxChain: number;
  /** 取った回数。表示と「1手でも動かしたか」の判定に使う */
  moves: number;
  /** 配りを再現するためのシード番号（画面に出す） */
  seed: number;
  /** ルールの区分。`deal` のあとに変えない（変えるときは配り直す） */
  variant: GolfVariant;
}

/** 新しいシード番号を作る（tripeaks / pyramid-solitaire と同じ自前の番号） */
export function newSeed(rng: () => number = Math.random): number {
  return Math.floor(rng() * 1_000_000) + 1;
}

/**
 * 2枚のランクがつながるか。
 *
 * 既定は**±1だけ**で、KとAはつながらない（`wrap` が false）。
 * `wrap` が true のときは A(1) と K(13) の差12もつながりとして数える
 * （トライピークスの `connects` と同じ扱いになる）。
 */
export function connects(a: number, b: number, wrap = false): boolean {
  const diff = Math.abs(a - b);
  return diff === 1 || (wrap && diff === 12);
}

/** その区分でラップ（A↔K）を使うか */
export function wrapsIn(variant: GolfVariant): boolean {
  return variant === 'wrap';
}

/**
 * 配りの良し悪しの軽いガード。**クリア可能性は見ない**（完全公開情報なので
 * 解いて確かめることはできるが、仕様書どおり保証はしない）。
 *
 * ここで弾くのは「見るからに理不尽」な2つだけ:
 *
 * 1. **同じ数字の4枚が1列に固まっている。** その数字は列の奥に詰まり、
 *    連鎖のつなぎとして最後まで使えない
 * 2. **手前の7枚に数字が2種類しか無い。** 出だしの選択肢が無く、
 *    山札を何枚もめくるところから始まってしまう
 *
 * どちらも滅多に起きない（そのぶん配りの分布をほとんど歪めない）。
 */
export function isPoorDeal(columns: readonly (readonly Card[])[]): boolean {
  for (const column of columns) {
    const counts = new Map<number, number>();
    for (const card of column) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
    for (const n of counts.values()) if (n >= 4) return true;
  }
  const fronts = new Set(
    columns.map((column) => column[column.length - 1]?.rank).filter((r) => r !== undefined),
  );
  return fronts.size > 0 && fronts.size <= 2;
}

/** 混ぜた52枚の先頭35枚を7列×5枚に配る（1枚目が奥、5枚目が手前） */
function toColumns(cards: readonly Card[]): Card[][] {
  const columns: Card[][] = Array.from({ length: COLUMNS }, () => []);
  for (let i = 0; i < TABLEAU_SIZE; i += 1) {
    // 実際の配り方と同じく、1周ずつ各列に1枚ずつ置く
    columns[i % COLUMNS].push({ ...cards[i], faceUp: true });
  }
  return columns;
}

/**
 * 配る。同じシード・同じ区分なら必ず同じ配りになる
 * （配り直しのガードも同じ乱数列から続けて引くので再現できる）。
 */
export function deal(seed: number = newSeed(), variant: GolfVariant = 'standard'): GolfState {
  const rng = seededRng(seed);
  let cards = shuffle(makeDeck(1), rng);
  let columns = toColumns(cards);
  for (let attempt = 0; attempt < MAX_REDEALS && isPoorDeal(columns); attempt += 1) {
    cards = shuffle(makeDeck(1), rng);
    columns = toColumns(cards);
  }
  return {
    columns,
    // 末尾からめくるので、配った順の逆に持つ（先に配った札が先に出る）
    stock: cards
      .slice(TABLEAU_SIZE)
      .map((c) => ({ ...c, faceUp: false }))
      .reverse(),
    waste: [],
    chain: 0,
    maxChain: 0,
    moves: 0,
    seed,
    variant,
  };
}

/** 捨て札の一番上（まだ1枚もめくっていなければ null） */
export function wasteTop(s: GolfState): Card | null {
  return s.waste[s.waste.length - 1] ?? null;
}

/** その列の手前の1枚（空の列は null） */
export function frontCard(s: GolfState, column: number): Card | null {
  const pile = s.columns[column];
  if (!pile || pile.length === 0) return null;
  return pile[pile.length - 1];
}

/** その列の手前の札を取れるか（捨て札の一番上と±1） */
export function canPick(s: GolfState, column: number): boolean {
  const card = frontCard(s, column);
  const top = wasteTop(s);
  if (!card || !top) return false;
  return connects(card.rank, top.rank, wrapsIn(s.variant));
}

/** いま取れる列の番号をすべて挙げる */
export function pickableColumns(s: GolfState): number[] {
  const out: number[] = [];
  for (let c = 0; c < COLUMNS; c += 1) {
    if (canPick(s, c)) out.push(c);
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
 * 同じ条件なら**残り枚数がいちばん多い列**を返す。深い列は後半ほど崩しにくく、
 * 早く減らすほど「手前に見えている数字」の種類が増える。
 * 枚数が同じなら左の列（番号の小さいほう）にして、返す手を決定的にする。
 */
export function hint(s: GolfState): number | null {
  let best: number | null = null;
  for (const c of pickableColumns(s)) {
    if (best === null || s.columns[c].length > s.columns[best].length) best = c;
  }
  return best;
}

/**
 * 列の手前の札を1枚取って捨て札に置く。ルール上取れないなら null。
 * 連鎖が1増える。
 */
export function pick(s: GolfState, column: number): GolfState | null {
  if (!canPick(s, column)) return null;
  const card = frontCard(s, column)!;
  const chain = s.chain + 1;
  return {
    ...s,
    columns: s.columns.map((pile, c) => (c === column ? pile.slice(0, -1) : pile)),
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
  return s.columns.reduce((total, pile) => total + pile.length, 0);
}

/** 場札を全部取れたらクリア */
export function isCleared(s: GolfState): boolean {
  return remaining(s) === 0;
}

/**
 * 詰み。取れる札が無く、めくることもできない状態。
 * 引き直しが無いぶん、ピラミッドより判定は単純になる。
 */
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
