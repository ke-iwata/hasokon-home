/**
 * ヨットのロジック（出目・役の判定・スコア表・CPU）
 *
 * 仕様: docs/features/game-yacht.md
 *
 * ## 名称について
 *
 * このゲームは**パブリックドメインの伝統ゲーム名「ヨット（Yacht）」**で出す。
 * 同型のボードゲームの商品名は他社の登録商標なので、`title` / `description` /
 * `h1` / slug には使わない（games/CLAUDE.md の名称の約束、仕様書の「権利面」）。
 * ルール自体は著作権・商標の保護対象ではないので、上段ボーナスを含めて踏襲してよい。
 *
 * ## 設計
 *
 * - 状態はすべてイミュータブル。`rollDice` / `toggleHold` / `scoreCategory` は
 *   新しい局面を返す（他のゲームと同じ約束）
 * - 乱数は注入できる（`seededRng` でテストから固定する）
 * - **途中の状態は局面を分けて見せる。** CPUの「キープを決める」と「振る」は
 *   `setHold` と `rollDice` の2手に割れていて、画面側があいだの間（ms）を持つ
 *   （games/CLAUDE.md の「状態と表示」8）
 *
 * ## 手番について
 *
 * ヨットは**相手の手が自分の手に一切影響しない**。同じ回数だけ振って、
 * それぞれのスコア表を埋めるだけなので、先攻・後攻の選択は置かない（仕様書で確定）。
 * 交互に手番が回るのは、CPUが考えている様子を見せるための演出上の都合でしかない。
 *
 * ## CPU
 *
 * 強さは2段階。どちらも「1手先の期待値」で決める（残りの振り直しを全部読む
 * 動的計画法までは要らない。仕様書の「たまに負ける強さで十分」）。
 *
 * - `easy`（かんたん）＝ 目先の点数がいちばん高い役を取る貪欲。さらに一定の割合で
 *   でたらめに選ぶ（`EASY_NOISE`）
 * - `hard`（つよい）＝ 上段ボーナス（63点で+35点）の進み具合に重みを乗せる。
 *   **貪欲なだけだと上段を捨ててボーナスを落とす**（仕様書の指摘）ので、
 *   上段の1点を「35/63点ぶんの価値がある」として評価に足す
 */

// ---------------------------------------------------------------- 基本の定数

/** 乱数（`Math.random` と同じ形）。テストからは `seededRng` を渡す */
export type Rng = () => number;

/** サイコロの数 */
export const DICE_COUNT = 5;
/** 1手番で振れる回数 */
export const ROLLS_PER_TURN = 3;
/** サイコロの面 */
export const FACES = 6;

/** 上段ボーナスの条件（上段6役の合計） */
export const UPPER_TARGET = 63;
/** 上段ボーナスの点数 */
export const UPPER_BONUS = 35;

/** ヨット（同じ目が5つ）の点数 */
export const YACHT_SCORE = 50;
/** S・ストレート（4つ連続）の点数 */
export const S_STRAIGHT_SCORE = 15;
/** L・ストレート（5つ連続）の点数 */
export const L_STRAIGHT_SCORE = 30;

// ---------------------------------------------------------------- 役

/** スコア表の1行（役） */
export type Category =
  | 'aces'
  | 'twos'
  | 'threes'
  | 'fours'
  | 'fives'
  | 'sixes'
  | 'choice'
  | 'fourDice'
  | 'fullHouse'
  | 'sStraight'
  | 'lStraight'
  | 'yacht';

/** 上段（エース〜シックス）。合計が `UPPER_TARGET` 以上でボーナス */
export const UPPER_CATEGORIES = ['aces', 'twos', 'threes', 'fours', 'fives', 'sixes'] as const;

/** 下段（役で点が決まるほう） */
export const LOWER_CATEGORIES = [
  'choice',
  'fourDice',
  'fullHouse',
  'sStraight',
  'lStraight',
  'yacht',
] as const;

/** スコア表の全12行。**手番の数もこれと同じ**（1手番で1行ずつ埋まる） */
export const CATEGORIES: readonly Category[] = [...UPPER_CATEGORIES, ...LOWER_CATEGORIES];

/** 1ゲームの手番数（＝役の数） */
export const ROUNDS = CATEGORIES.length;

/** 上段の役に対応する目（エース＝1）。下段は持たない */
export const UPPER_FACE: Record<(typeof UPPER_CATEGORIES)[number], number> = {
  aces: 1,
  twos: 2,
  threes: 3,
  fours: 4,
  fives: 5,
  sixes: 6,
};

export const CATEGORY_LABEL: Record<Category, string> = {
  aces: 'エース',
  twos: 'デュース',
  threes: 'トレイ',
  fours: 'フォー',
  fives: 'ファイブ',
  sixes: 'シックス',
  choice: 'チョイス',
  fourDice: 'フォーダイス',
  fullHouse: 'フルハウス',
  sStraight: 'S・ストレート',
  lStraight: 'L・ストレート',
  yacht: 'ヨット',
};

/** 役の説明（画面の「遊び方」と、行の読み上げに使う） */
export const CATEGORY_HINT: Record<Category, string> = {
  aces: '1の目の合計',
  twos: '2の目の合計',
  threes: '3の目の合計',
  fours: '4の目の合計',
  fives: '5の目の合計',
  sixes: '6の目の合計',
  choice: '5個の目の合計',
  fourDice: '同じ目が4つ以上で、5個の目の合計',
  fullHouse: '同じ目3つ＋別の同じ目2つで、5個の目の合計',
  sStraight: '4つ連続で15点',
  lStraight: '5つ連続で30点',
  yacht: '同じ目が5つで50点',
};

/** 上段の役かどうか */
export function isUpper(category: Category): category is (typeof UPPER_CATEGORIES)[number] {
  return category in UPPER_FACE;
}

// ---------------------------------------------------------------- 役の判定

/** 目ごとの個数。添字は目そのもの（`counts[6]` が6の個数。`counts[0]` は使わない） */
export function faceCounts(dice: readonly number[]): number[] {
  const counts = new Array<number>(FACES + 1).fill(0);
  for (const die of dice) {
    if (die >= 1 && die <= FACES) counts[die] += 1;
  }
  return counts;
}

/** 5個の目の合計 */
export function pipSum(dice: readonly number[]): number {
  return dice.reduce((sum, die) => sum + die, 0);
}

/** いちばん長い連続の長さ（S・L ストレートの判定に使う） */
function longestRun(counts: readonly number[]): number {
  let best = 0;
  let run = 0;
  for (let face = 1; face <= FACES; face += 1) {
    run = counts[face] > 0 ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/**
 * その出目をその役に記入したときの点数。
 *
 * **役にならない出目でも記入はできて、そのときは0点**（どの役も埋めなければ
 * ならないので、点にならない出目の捨て場所が要る）。
 */
export function scoreFor(category: Category, dice: readonly number[]): number {
  const counts = faceCounts(dice);
  if (isUpper(category)) {
    const face = UPPER_FACE[category];
    return counts[face] * face;
  }
  switch (category) {
    case 'choice':
      return pipSum(dice);
    case 'fourDice':
      return counts.some((count) => count >= 4) ? pipSum(dice) : 0;
    case 'fullHouse':
      // 3つ＋2つのときだけ。同じ目が5つは「ヨット」で取るので、ここでは役にしない
      return counts.includes(3) && counts.includes(2) ? pipSum(dice) : 0;
    case 'sStraight':
      return longestRun(counts) >= 4 ? S_STRAIGHT_SCORE : 0;
    case 'lStraight':
      return longestRun(counts) >= 5 ? L_STRAIGHT_SCORE : 0;
    case 'yacht':
      return counts.some((count) => count === DICE_COUNT) ? YACHT_SCORE : 0;
  }
}

// ---------------------------------------------------------------- スコア表

/** スコア表。`null` はまだ記入していない役 */
export type Sheet = Record<Category, number | null>;

/** 空のスコア表 */
export function emptySheet(): Sheet {
  return Object.fromEntries(CATEGORIES.map((category) => [category, null])) as Sheet;
}

/** まだ記入していない役 */
export function openCategories(sheet: Sheet): Category[] {
  return CATEGORIES.filter((category) => sheet[category] === null);
}

/** 全部埋まったか */
export function isSheetFull(sheet: Sheet): boolean {
  return openCategories(sheet).length === 0;
}

/** 上段の小計（記入済みだけ） */
export function upperSubtotal(sheet: Sheet): number {
  return UPPER_CATEGORIES.reduce((sum, category) => sum + (sheet[category] ?? 0), 0);
}

/** 上段ボーナス。小計が `UPPER_TARGET` 以上なら `UPPER_BONUS`、届かなければ0 */
export function upperBonus(sheet: Sheet): number {
  return upperSubtotal(sheet) >= UPPER_TARGET ? UPPER_BONUS : 0;
}

/** 下段の小計（記入済みだけ） */
export function lowerSubtotal(sheet: Sheet): number {
  return LOWER_CATEGORIES.reduce((sum, category) => sum + (sheet[category] ?? 0), 0);
}

/** 合計点（上段＋ボーナス＋下段） */
export function totalScore(sheet: Sheet): number {
  return upperSubtotal(sheet) + upperBonus(sheet) + lowerSubtotal(sheet);
}

/** 上段で残っている役から、まだ足せる最大の点数（5個そろえたときの合計） */
export function upperRemainingMax(sheet: Sheet): number {
  return UPPER_CATEGORIES.filter((category) => sheet[category] === null).reduce(
    (sum, category) => sum + DICE_COUNT * UPPER_FACE[category],
    0,
  );
}

/** 上段ボーナスにまだ手が届くか（確定済みなら true のまま） */
export function bonusReachable(sheet: Sheet): boolean {
  return upperSubtotal(sheet) + upperRemainingMax(sheet) >= UPPER_TARGET;
}

// ---------------------------------------------------------------- 局面

/** 対戦の側 */
export type Side = 'human' | 'cpu';

/** 直前に記入した内容（画面の知らせに使う。演出ではなく手の記録） */
export interface ScoreEvent {
  side: Side;
  category: Category;
  points: number;
}

export interface YachtState {
  /** 何巡目か（1〜`ROUNDS`）。両者が1行ずつ埋めて1巡 */
  round: number;
  /** いまの手番 */
  turn: Side;
  /** いまの出目（振る前は初期値のまま。`hasRolled` で見分ける） */
  dice: number[];
  /** キープしているサイコロ */
  held: boolean[];
  /** この手番で残っている振れる回数 */
  rollsLeft: number;
  sheets: Record<Side, Sheet>;
  finished: boolean;
  last: ScoreEvent | null;
}

export function initialState(): YachtState {
  return {
    round: 1,
    turn: 'human',
    dice: new Array<number>(DICE_COUNT).fill(1),
    held: new Array<boolean>(DICE_COUNT).fill(false),
    rollsLeft: ROLLS_PER_TURN,
    sheets: { human: emptySheet(), cpu: emptySheet() },
    finished: false,
    last: null,
  };
}

/** この手番でもう振ったか（＝いまの出目に意味があるか） */
export function hasRolled(state: YachtState): boolean {
  return state.rollsLeft < ROLLS_PER_TURN;
}

/** 記入できるか（1回でも振ってあれば記入できる） */
export function canScore(state: YachtState): boolean {
  return !state.finished && hasRolled(state);
}

/** まだ振れるか。**全部キープしているときは振れない**（振っても何も変わらないため） */
export function canRoll(state: YachtState): boolean {
  if (state.finished || state.rollsLeft <= 0) return false;
  return !hasRolled(state) || state.held.some((held) => !held);
}

function rollOne(rng: Rng): number {
  return Math.min(FACES, Math.floor(rng() * FACES) + 1);
}

/**
 * サイコロを振る。1回目は5個とも振り、2回目以降はキープしていないものだけ振る。
 * 振れない局面（振り切った・全部キープ）では同じ局面を返す。
 */
export function rollDice(state: YachtState, rng: Rng = Math.random): YachtState {
  if (!canRoll(state)) return state;
  const first = !hasRolled(state);
  const held = first ? new Array<boolean>(DICE_COUNT).fill(false) : state.held;
  return {
    ...state,
    dice: state.dice.map((die, i) => (!first && held[i] ? die : rollOne(rng))),
    held: [...held],
    rollsLeft: state.rollsLeft - 1,
  };
}

/** キープを切り替える。振る前と振り切ったあとは効かない（変えても意味がないため） */
export function toggleHold(state: YachtState, index: number): YachtState {
  if (state.finished || !hasRolled(state) || state.rollsLeft <= 0) return state;
  if (index < 0 || index >= state.dice.length) return state;
  return { ...state, held: state.held.map((held, i) => (i === index ? !held : held)) };
}

/** キープをまとめて置く（CPUが「キープを決めた」ところを見せるのに使う） */
export function setHold(state: YachtState, mask: readonly boolean[]): YachtState {
  if (state.finished || !hasRolled(state) || state.rollsLeft <= 0) return state;
  return { ...state, held: state.dice.map((_, i) => mask[i] === true) };
}

/**
 * いまの出目を役に記入して手番を渡す。
 * 記入済みの役・振る前・終局後は同じ局面を返す（不正な手は黙って捨てる）。
 */
export function scoreCategory(state: YachtState, category: Category): YachtState {
  if (!canScore(state)) return state;
  const side = state.turn;
  if (state.sheets[side][category] !== null) return state;

  const points = scoreFor(category, state.dice);
  const sheets: Record<Side, Sheet> = {
    ...state.sheets,
    [side]: { ...state.sheets[side], [category]: points },
  };
  const finished = isSheetFull(sheets.human) && isSheetFull(sheets.cpu);
  const nextSide: Side = side === 'human' ? 'cpu' : 'human';

  return {
    round: side === 'cpu' && !finished ? state.round + 1 : state.round,
    turn: finished ? side : nextSide,
    dice: state.dice,
    held: new Array<boolean>(DICE_COUNT).fill(false),
    rollsLeft: finished ? 0 : ROLLS_PER_TURN,
    sheets,
    finished,
    last: { side, category, points },
  };
}

/** 勝ち負け（自分から見て）。終局していなければ null */
export function outcomeOf(state: YachtState): 'win' | 'loss' | 'draw' | null {
  if (!state.finished) return null;
  const mine = totalScore(state.sheets.human);
  const theirs = totalScore(state.sheets.cpu);
  if (mine > theirs) return 'win';
  if (mine < theirs) return 'loss';
  return 'draw';
}

// ---------------------------------------------------------------- CPU

export const LEVELS = {
  easy: { label: 'かんたん' },
  hard: { label: 'つよい' },
} as const;

export type Level = keyof typeof LEVELS;

/** 「かんたん」がでたらめに決める割合。ここが強さの差の半分（残りは上段ボーナスの重み） */
export const EASY_NOISE = 0.3;

/**
 * 同点のときにどの役を捨てるかを決めるための、役の「これから狙えば取れそうな点」。
 *
 * 厳密な期待値ではなく、**0点を書き込む先を選ぶための順序**でしかない
 * （小さいほうから捨てる）。エースとヨットが捨て場所になりやすいのは、
 * 取れても点が小さい／そもそも滅多に出ない、という実際の遊び方と合っている。
 */
const CATEGORY_POTENTIAL: Record<Category, number> = {
  aces: 2,
  twos: 4,
  threes: 6,
  fours: 8,
  fives: 10,
  sixes: 12,
  choice: 22,
  fourDice: 6,
  fullHouse: 8,
  sStraight: 8,
  lStraight: 5,
  yacht: 2,
};

/**
 * 上段の役に記入したときの、上段ボーナスぶんの上乗せ。
 *
 * 上段は63点で+35点なので、**上段の1点はおよそ 35/63 点ぶん余分な価値がある**。
 * ボーナスが確定済み（もう63点に届いている）か、残りの役では届かないときは0。
 *
 * これが無いと、序盤に「シックス18点」より「チョイス20点」を選ぶような、
 * 目先だけ得で終盤に35点を落とす打ち方になる（仕様書の指摘）。
 */
export function bonusIncentive(category: Category, points: number, sheet: Sheet): number {
  if (!isUpper(category)) return 0;
  const need = UPPER_TARGET - upperSubtotal(sheet);
  if (need <= 0) return 0;
  if (!bonusReachable(sheet)) return 0;
  return (UPPER_BONUS * Math.min(points, need)) / UPPER_TARGET;
}

/** その役に記入したときの評価値。`easy` は点数そのまま、`hard` は上段ボーナスを加味する */
export function categoryValue(
  category: Category,
  dice: readonly number[],
  sheet: Sheet,
  level: Level,
): number {
  const points = scoreFor(category, dice);
  return level === 'easy' ? points : points + bonusIncentive(category, points, sheet);
}

/** その出目でいちばん評価値が高い役。同点なら「これから狙える点」が小さいほうを選ぶ */
export function bestCategory(dice: readonly number[], sheet: Sheet, level: Level): Category {
  const open = openCategories(sheet);
  if (open.length === 0) {
    throw new Error('記入できる役が残っていません（スコア表が埋まっています）');
  }
  let best = open[0];
  let bestValue = categoryValue(best, dice, sheet, level);
  for (const category of open.slice(1)) {
    const value = categoryValue(category, dice, sheet, level);
    const tie = Math.abs(value - bestValue) < 1e-9;
    if (value > bestValue + 1e-9 || (tie && CATEGORY_POTENTIAL[category] < CATEGORY_POTENTIAL[best])) {
      best = category;
      bestValue = value;
    }
  }
  return best;
}

/** その出目で取れる評価値の最大（振り直しの期待値を出すのに使う） */
function bestValue(dice: readonly number[], sheet: Sheet, level: Level): number {
  let best = 0;
  for (const category of CATEGORIES) {
    if (sheet[category] !== null) continue;
    const value = categoryValue(category, dice, sheet, level);
    if (value > best) best = value;
  }
  return best;
}

/** k個振ったときの出目（並び順は区別しない）とその確率 */
export interface DiceOutcome {
  faces: number[];
  p: number;
}

const outcomeCache = new Map<number, DiceOutcome[]>();

function factorial(n: number): number {
  let out = 1;
  for (let i = 2; i <= n; i += 1) out *= i;
  return out;
}

/**
 * k個のサイコロを振ったときに出うる目と、その確率。
 *
 * 6^k 通りを1つずつ数えると k=5 で7776通りになるが、**並び順は役に関係しない**ので
 * 昇順の組み合わせ（k=5 なら252通り）だけを、並べ方の数を確率にして持てば足りる。
 * 結果は使い回す（32通りのキープ × これを毎回作り直すと無駄が大きい）。
 */
export function rollOutcomes(k: number): DiceOutcome[] {
  if (k <= 0) return [{ faces: [], p: 1 }];
  const cached = outcomeCache.get(k);
  if (cached) return cached;

  const outcomes: DiceOutcome[] = [];
  const total = FACES ** k;
  const faces: number[] = [];
  const walk = (from: number): void => {
    if (faces.length === k) {
      const counts = faceCounts(faces);
      const ways = counts.reduce((acc, count) => acc / factorial(count), factorial(k));
      outcomes.push({ faces: [...faces], p: ways / total });
      return;
    }
    for (let face = from; face <= FACES; face += 1) {
      faces.push(face);
      walk(face);
      faces.pop();
    }
  };
  walk(1);

  outcomeCache.set(k, outcomes);
  return outcomes;
}

/** キープを決めたときの、振り直したあとの評価値の期待値 */
export function expectedAfterReroll(
  kept: readonly number[],
  rerollCount: number,
  sheet: Sheet,
  level: Level,
): number {
  let sum = 0;
  for (const outcome of rollOutcomes(rerollCount)) {
    sum += outcome.p * bestValue([...kept, ...outcome.faces], sheet, level);
  }
  return sum;
}

/**
 * CPUがキープするサイコロを決める。
 *
 * 32通り（2^5）のキープをすべて試し、振り直したあとの評価値の期待値が
 * いちばん高いものを選ぶ。**読むのは1回ぶんの振り直しまで**で、
 * 「残り2回をどう使うか」までは読まない（仕様書の「たまに負ける強さで十分」）。
 *
 * 全部キープが返ったら「これ以上振らない」という意味になる
 * （振っても出目が変わらないので、画面側はそのまま記入へ進める）。
 */
export function chooseHold(
  dice: readonly number[],
  rollsLeft: number,
  sheet: Sheet,
  level: Level,
  rng: Rng = Math.random,
): boolean[] {
  const size = dice.length;
  if (rollsLeft <= 0) return dice.map(() => true);
  // 「かんたん」はときどきでたらめにキープする（強さの差をここでも作る）
  if (level === 'easy' && rng() < EASY_NOISE) return dice.map(() => rng() < 0.5);

  let best = dice.map(() => true);
  let bestExpected = -Infinity;
  let bestKeptCount = -1;
  for (let mask = 0; mask < 1 << size; mask += 1) {
    const hold = dice.map((_, i) => (mask & (1 << i)) !== 0);
    const kept = dice.filter((_, i) => hold[i]);
    const expected = expectedAfterReroll(kept, size - kept.length, sheet, level);
    const tie = Math.abs(expected - bestExpected) < 1e-9;
    // 同じ期待値なら振らないほうを選ぶ（無駄に振り直して見せない）
    if (expected > bestExpected + 1e-9 || (tie && kept.length > bestKeptCount)) {
      best = hold;
      bestExpected = expected;
      bestKeptCount = kept.length;
    }
  }
  return best;
}

/** CPUが記入する役を決める。「かんたん」はときどきでたらめに選ぶ */
export function chooseCategory(
  dice: readonly number[],
  sheet: Sheet,
  level: Level,
  rng: Rng = Math.random,
): Category {
  const open = openCategories(sheet);
  if (open.length === 0) {
    throw new Error('記入できる役が残っていません（スコア表が埋まっています）');
  }
  if (level === 'easy' && rng() < EASY_NOISE) {
    return open[Math.min(open.length - 1, Math.floor(rng() * open.length))];
  }
  return bestCategory(dice, sheet, level);
}
