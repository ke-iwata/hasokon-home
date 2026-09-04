/**
 * ゴルフソリティアのロジック
 *
 * 仕様: docs/features/game-golf-solitaire.md
 *
 * 一般的なルール:
 * - 52枚1組。**7列×5枚（35枚）を全部表向き**に配り、各列の手前の1枚だけ取れる
 * - 残り17枚が山札。**配りはじめの捨て札は置かない**（最初の1手は必ず山札めくり）。
 *   35＋17でちょうど52枚を使い切るので、捨て札に回す52枚目が無い
 * - 捨て札の一番上と**ランクが±1**の場札を取れる。取った札が新しい捨て札になり、
 *   続けて取れれば**連鎖**になる
 * - 取れる札が無ければ山札を1枚めくる（連鎖は途切れる）
 * - 場札35枚を全部取れたらクリア。山札が尽きて取れる札も無くなったら終了
 *
 * このリポジトリで決めたこと:
 * - **A と K は既定ではつながらない**（Kで連鎖が止まる、最も一般的なルール）。
 *   下敷きにした `lib/tripeaks.ts` の `connects` は**ラップあり（AとKがつながる）で
 *   このゴルフとは逆**なので、判定に `wrap` フラグを持たせて**既定 off** にしてある。
 *   `wrap` が on のときだけトライピークスと同じ判定になる（仕様書「流用元との差分」）
 * - **配り直しのガードは入れない**（クリア可能性を保証しない）。盤が完全公開情報なので、
 *   配りを検閲すると「引きが弱かった」のか「手順が悪かった」のかの手応えが濁る。
 *   理不尽な配りは「残り枚数がスコア」の設計で吸収する（仕様書「実装の要点」）
 * - **山札の引き直しは無い**（ピラミッドの `redeal` に当たるものは持たない）
 *
 * 状態はすべて不変値として扱い、操作は新しい状態を返す
 * （tripeaks.ts / pyramid-solitaire.ts と同じ方針）。
 */

import { makeDeck, seededRng, shuffle, type Card } from './cards';

/** 場の列数 */
export const COLUMNS = 7;
/** 1列に配る枚数 */
export const COLUMN_SIZE = 5;
/** 場に並ぶ枚数（7×5） */
export const TABLEAU_SIZE = COLUMNS * COLUMN_SIZE;
/** 山札の枚数（52 - 35。**捨て札の初期1枚は引かない**） */
export const STOCK_SIZE = 52 - TABLEAU_SIZE;

/** 新しいシード番号を作る（tripeaks / pyramid-solitaire と同じ自前の番号） */
export function newSeed(rng: () => number = Math.random): number {
  return Math.floor(rng() * 1_000_000) + 1;
}

export interface GolfState {
  /** 場の7列。各列は**奥→手前**の順で、末尾の1枚だけが取れる */
  columns: Card[][];
  /** 山札。**末尾が次にめくる1枚**（pop で取り出す） */
  stock: Card[];
  /** 捨て札。末尾が一番上。**配りはじめは空**（最初の1手は必ず山札めくり） */
  waste: Card[];
  /** いま続いている連鎖の数（山札をめくると0に戻る） */
  chain: number;
  /** この配りで出した最長の連鎖。記録に残すのはこちら */
  maxChain: number;
  /** 取った回数。表示と「1手でも動かしたか」の判定に使う */
  moves: number;
  /** 配りを再現するためのシード番号（画面に出す） */
  seed: number;
  /** A↔K をつなげるか。**既定は false**（Kで連鎖が止まる標準ルール） */
  wrap: boolean;
}

export function deal(seed: number = newSeed(), wrap = false): GolfState {
  const deck = shuffle(makeDeck(1), seededRng(seed));
  const columns: Card[][] = [];
  for (let col = 0; col < COLUMNS; col += 1) {
    columns.push(
      deck
        .slice(col * COLUMN_SIZE, (col + 1) * COLUMN_SIZE)
        // 場札は**全部表向き**。裏札はこのゲームには無い
        .map((c) => ({ ...c, faceUp: true })),
    );
  }
  return {
    columns,
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

/** 捨て札の一番上（配りはじめや、まだ1枚もめくっていなければ null） */
export function wasteTop(s: GolfState): Card | null {
  return s.waste[s.waste.length - 1] ?? null;
}

/** その列の手前の1枚（空の列は null） */
export function frontOf(s: GolfState, col: number): Card | null {
  const pile = s.columns[col];
  if (!pile || pile.length === 0) return null;
  return pile[pile.length - 1];
}

/**
 * 2枚のランクがつながるか。**±1のみ**が既定。
 *
 * `wrap` が true のときだけ A(1) と K(13)（差12）もつながる。
 * **トライピークスの `connects` は常にラップありなので、そのまま流用しないこと**
 * （仕様書「流用元との差分」）。
 */
export function connects(a: number, b: number, wrap = false): boolean {
  const diff = Math.abs(a - b);
  return diff === 1 || (wrap && diff === 12);
}

/** その列の手前の札を取れるか（捨て札の一番上と±1） */
export function canPick(s: GolfState, col: number): boolean {
  const card = frontOf(s, col);
  const top = wasteTop(s);
  if (!card || !top) return false;
  return connects(card.rank, top.rank, s.wrap);
}

/** いま取れる列の番号をすべて挙げる */
export function pickableColumns(s: GolfState): number[] {
  const out: number[] = [];
  for (let col = 0; col < COLUMNS; col += 1) {
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
 * 同じ条件なら**残り枚数がいちばん多い列**を返す。長い列は後回しにするほど
 * 崩しづらくなるので、平らに崩すのがゴルフの定石（ページの「コツ」と同じ向き）。
 * 枚数が並んだときは左の列を返す。
 */
export function hint(s: GolfState): number | null {
  let best: number | null = null;
  for (const col of pickableColumns(s)) {
    if (best === null || s.columns[col].length > s.columns[best].length) best = col;
  }
  return best;
}

/**
 * 列の手前の札を1枚取って捨て札に置く。ルール上取れないなら null。
 * 連鎖が1増える。
 */
export function pick(s: GolfState, col: number): GolfState | null {
  if (!canPick(s, col)) return null;
  const card = frontOf(s, col)!;
  const chain = s.chain + 1;
  return {
    ...s,
    columns: s.columns.map((pile, i) => (i === col ? pile.slice(0, -1) : pile)),
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

/** 場に残っている枚数。**このゲームの主なスコア**（少ないほど良い） */
export function remaining(s: GolfState): number {
  return s.columns.reduce((total, pile) => total + pile.length, 0);
}

/** 場札を全部取れたらクリア */
export function isCleared(s: GolfState): boolean {
  return remaining(s) === 0;
}

/** 終了。取れる札が無く、めくることもできない状態（クリアは含まない） */
export function isStuck(s: GolfState): boolean {
  if (isCleared(s)) return false;
  return !hasAnyMove(s) && !canDraw(s);
}

/**
 * 記録に出す「最少残り枚数」。無ければ null。
 *
 * **`lib/records.ts` の `bestMoves` は `positive()` を通るので0を保存できない**
 * （書けても再読み込みで消える）。そこで `bestMoves` には
 * **クリアできなかった配りの最少残り枚数だけ**を入れ、
 * 1回でもクリアしていれば最少は定義上0として扱う（仕様書「スコアと成功の見せ方」）。
 * ゴルフ1本の都合で共有モジュールに0を許す項目を足すことはしない。
 */
export function bestRemaining(wins: number, bestMoves: number | undefined): number | null {
  if (wins > 0) return 0;
  return bestMoves ?? null;
}
