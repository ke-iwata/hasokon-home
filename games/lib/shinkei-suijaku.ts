/**
 * 神経衰弱のロジック（場・めくり・判定・CPUの記憶）
 *
 * 仕様: docs/features/game-shinkei-suijaku.md
 *
 * 「神経衰弱」（Concentration / Memory）は伝統的なトランプ遊びの一般名称で、
 * ルールにも名称にも権利者がいない。商標の問題は無い（games/CLAUDE.md の名称の約束）。
 *
 * ## 設計
 *
 * - 札は `lib/cards.ts` の `Card` をそのまま使い、絵柄も `app/_cards/CardView` を再利用する
 * - **位置（配列の添字）が札の同一性**。場の札は最後まで動かないので、
 *   `id` には配列の添字をそのまま入れてある（Reactのkeyに使う）
 * - 組は**同じ数字（ランク）どうし**。1つのランクは4枚あるので最大2組まで作れる
 * - 状態はすべてイミュータブル。`applyFlip` / `resolve` は新しい局面を返す
 *   （大富豪・七並べ・リバーシと同じ約束）
 * - **2枚めくった直後は判定を持ち越す**（`judge`）。取る／裏へ戻すのは `resolve` の仕事で、
 *   画面は好きな長さだけ2枚を見せてから呼べる（仕様の「約1秒見せて裏返す」）
 * - 乱数は注入できる（`seededRng` でテストから固定する）
 *
 * ## CPU
 *
 * 強さは**公開された札を覚えている確率**だけで表す（`MEMORY_RATE`）。
 * 完全記憶にしないのは、めくった札を必ず取り返されると理不尽になるため（仕様書）。
 * CPUは相手の手札のような隠し情報を見ない。**一度でも表になった札**しか覚えない。
 *
 * ## v1で入れないもの（仕様書の「やらないこと」）
 *
 * - オンライン対戦・同一端末での2人プレイ（CPU対戦で代替）
 * - 絵札のテーマ替え。SVGトランプ1種で開始する
 */

import { RANK_LABEL, SUITS, SUIT_SYMBOL, shuffle, type Card, type Rank, type Suit } from './cards';

// ---------------------------------------------------------------- 設定

/** 遊び方。ひとりでタイムアタック、またはCPUと交互にめくる */
export type Mode = 'solo' | 'cpu';

/** 場に並べる枚数。すべて偶数で、組数は半分 */
export const SIZES = [12, 20, 28, 52] as const;
export type Size = (typeof SIZES)[number];

/** CPUの強さ */
export type CpuLevel = 'easy' | 'normal' | 'hard';
export const CPU_LEVELS: readonly CpuLevel[] = ['easy', 'normal', 'hard'];

/**
 * 表になった札をCPUが覚えている確率。
 *
 * 完全記憶（1.0）にしないのは、こちらがめくった札をすべて取り返されて
 * 勝ち目が無くなるため。「強」でも1割は忘れる（仕様書の数値そのまま）。
 */
export const MEMORY_RATE: Record<CpuLevel, number> = {
  easy: 0.3,
  normal: 0.6,
  hard: 0.9,
};

export const MODE_LABELS: Record<Mode, string> = {
  solo: 'ひとりで',
  cpu: 'CPU対戦',
};

export const LEVEL_LABELS: Record<CpuLevel, string> = {
  easy: '弱',
  normal: '普通',
  hard: '強',
};

/** 難易度の説明。設定パネルと解説ページの単一の情報源 */
export const LEVEL_NOTES: Record<CpuLevel, string> = {
  easy: `表になった札を約${Math.round(MEMORY_RATE.easy * 100)}%しか覚えていません。まず勝てます`,
  normal: `表になった札を約${Math.round(MEMORY_RATE.normal * 100)}%覚えています。取りこぼしもある互角の相手`,
  hard: `表になった札を約${Math.round(MEMORY_RATE.hard * 100)}%覚えています。めくった札はほぼ取り返されます`,
};

/** 枚数の表示名（「12枚（6組）」） */
export function sizeLabel(size: Size): string {
  return `${size}枚（${size / 2}組）`;
}

/**
 * 場を並べる列数。
 *
 * 1枚の幅が細くなりすぎないように選んである。52枚を13列にすると
 * スマホ（360px幅）で1枚が25px程度になり、数字もスートも読めない
 * （七並べで場をカードの絵にするのをやめたのと同じ理由）。
 * 52枚だけは割り切れないので、最後の行が7枚になる。
 */
export const COLUMNS: Record<Size, number> = {
  12: 4,
  20: 5,
  28: 7,
  52: 9,
};

export interface Options {
  mode: Mode;
  size: Size;
  level: CpuLevel;
}

export const DEFAULT_OPTIONS: Options = {
  mode: 'solo',
  size: 20,
  level: 'normal',
};

/** 席番号。CPU対戦では0が人間・1がCPU、ひとりでは0だけ */
export const HUMAN = 0;
export const CPU = 1;

export function playerCount(mode: Mode): number {
  return mode === 'cpu' ? 2 : 1;
}

/** 読み上げ・aria-label 用の表示名 */
export function cardLabel(card: Card): string {
  return `${SUIT_SYMBOL[card.suit]}${RANK_LABEL[card.rank]}`;
}

/** 記録の区分。遊び方・枚数・（CPU対戦なら）強さごとに別の記録として持つ */
export function variantOf(options: Options): string {
  return options.mode === 'solo'
    ? `solo-${options.size}`
    : `cpu-${options.size}-${options.level}`;
}

// ---------------------------------------------------------------- 場を作る

const ALL_RANKS: readonly Rank[] = Array.from({ length: 13 }, (_, i) => (i + 1) as Rank);

/**
 * 場に並べる札を作る。
 *
 * 組は同じ数字どうし。1つのランクには4枚あるので、
 * **1周目に先頭2枚・2周目に残り2枚**を組にすれば、同じ札（スート×ランク）を
 * 二度使わずに最大26組（52枚）まで作れる。
 *
 * 12枚なら6つの別々の数字、52枚なら全13ランクが4枚ずつ並ぶ。
 * 4枚並んだ数字はどの2枚を合わせても組になる（本物の神経衰弱と同じ）。
 */
export function makeCards(size: Size, rng: () => number = Math.random): Card[] {
  const ranks = shuffle(ALL_RANKS, rng);
  // ランクごとのスートの並びは先に1回だけ決める。周回ごとに引き直すと
  // 同じ札が2度出てしまう
  const suitOrder = new Map<Rank, Suit[]>(ranks.map((rank) => [rank, shuffle(SUITS, rng)]));

  const cards: Card[] = [];
  for (let round = 0; round < 2 && cards.length < size; round += 1) {
    for (const rank of ranks) {
      if (cards.length >= size) break;
      const suits = suitOrder.get(rank) as Suit[];
      cards.push(
        { suit: suits[round * 2], rank, faceUp: false, id: 0 },
        { suit: suits[round * 2 + 1], rank, faceUp: false, id: 0 },
      );
    }
  }

  // 並べ替えてから、位置をそのまま id にする（場の札は最後まで動かない）
  return shuffle(cards, rng).map((card, i) => ({ ...card, id: i }));
}

// ---------------------------------------------------------------- 局面

/** 2枚めくった直後の判定。`resolve` を呼ぶまで持ち越す */
export type Judge = 'hit' | 'miss';

export interface MemoryState {
  mode: Mode;
  size: Size;
  level: CpuLevel;
  /** 場の札。添字が位置で、`faceUp` はいま表になっているか */
  cards: Card[];
  /** 取った人。まだ場に残っていれば null */
  taken: (number | null)[];
  /** いま表にしている位置（0〜2個） */
  flipped: number[];
  /** 手番。ひとりでは常に HUMAN */
  turn: number;
  /** 取った組の数 */
  pairs: number[];
  /** 手数（2枚めくって1手） */
  moves: number;
  /** CPUが覚えている位置。表になったときに `MEMORY_RATE` の確率で増える */
  cpuKnown: number[];
  /** めくった2枚の判定。null なら判定待ちではない */
  judge: Judge | null;
  finished: boolean;
}

/**
 * @param first 最初の手番（CPU対戦の「先攻／後攻」設定）。
 *   ひとりで遊ぶときは指定に関わらず HUMAN
 */
export function newGame(
  options: Options = DEFAULT_OPTIONS,
  rng: () => number = Math.random,
  first: number = HUMAN,
): MemoryState {
  const cards = makeCards(options.size, rng);
  return {
    mode: options.mode,
    size: options.size,
    level: options.level,
    cards,
    taken: cards.map(() => null),
    flipped: [],
    turn: options.mode === 'cpu' ? first : HUMAN,
    pairs: Array.from({ length: playerCount(options.mode) }, () => 0),
    moves: 0,
    cpuKnown: [],
    judge: null,
    finished: false,
  };
}

/** まだ場に残っていて、いま表になっていない位置 */
export function openPositions(state: MemoryState): number[] {
  const out: number[] = [];
  for (let i = 0; i < state.cards.length; i += 1) {
    if (state.taken[i] === null && !state.flipped.includes(i)) out.push(i);
  }
  return out;
}

/** 場に残っている枚数 */
export function remaining(state: MemoryState): number {
  return state.taken.filter((t) => t === null).length;
}

/** 取られた組の合計 */
export function takenPairs(state: MemoryState): number {
  return state.pairs.reduce((a, b) => a + b, 0);
}

/** その位置をいまめくれるか。判定待ちのあいだは1枚もめくれない */
export function canFlip(state: MemoryState, pos: number): boolean {
  if (state.finished || state.judge !== null) return false;
  if (!Number.isInteger(pos) || pos < 0 || pos >= state.cards.length) return false;
  if (state.taken[pos] !== null) return false;
  if (state.flipped.includes(pos)) return false;
  return state.flipped.length < 2;
}

/**
 * 1枚めくる。2枚目なら判定（`judge`）を立てて手数を1増やす。
 *
 * 表になった札は、CPU対戦なら**どちらがめくったかに関わらず**
 * `MEMORY_RATE` の確率でCPUの記憶に入る（人間と同じで、見た札だけ覚える）。
 */
export function applyFlip(
  state: MemoryState,
  pos: number,
  rng: () => number = Math.random,
): MemoryState {
  if (!canFlip(state, pos)) return state;

  const cards = state.cards.map((c, i) => (i === pos ? { ...c, faceUp: true } : c));
  const flipped = [...state.flipped, pos];
  const cpuKnown =
    state.mode === 'cpu' && !state.cpuKnown.includes(pos) && rng() < MEMORY_RATE[state.level]
      ? [...state.cpuKnown, pos]
      : state.cpuKnown;

  if (flipped.length < 2) return { ...state, cards, flipped, cpuKnown };

  const hit = state.cards[flipped[0]].rank === state.cards[flipped[1]].rank;
  return {
    ...state,
    cards,
    flipped,
    cpuKnown,
    moves: state.moves + 1,
    judge: hit ? 'hit' : 'miss',
  };
}

/** 手番を次の人へ。ひとりでは動かない */
function nextTurn(state: MemoryState): number {
  return (state.turn + 1) % state.pairs.length;
}

/**
 * めくった2枚の後始末。
 *
 * - 当たり：2枚を手番の人が取り、**同じ人がもう一度めくる**（連続手番・標準ルール）
 * - はずれ：2枚を裏へ戻して手番を渡す
 *
 * 判定待ちでなければ何もしない。画面は好きなタイミングで呼べるので、
 * 「約1秒見せる」も「タップで即座に」も同じ関数で書ける。
 */
export function resolve(state: MemoryState): MemoryState {
  if (state.judge === null) return state;
  const [a, b] = state.flipped;

  if (state.judge === 'miss') {
    const cards = state.cards.map((c, i) => (i === a || i === b ? { ...c, faceUp: false } : c));
    return { ...state, cards, flipped: [], judge: null, turn: nextTurn(state) };
  }

  const taken = [...state.taken];
  taken[a] = state.turn;
  taken[b] = state.turn;
  const pairs = state.pairs.map((n, i) => (i === state.turn ? n + 1 : n));
  return {
    ...state,
    taken,
    pairs,
    // 取った札はもう場に無いので、覚えていても意味がない
    cpuKnown: state.cpuKnown.filter((p) => p !== a && p !== b),
    flipped: [],
    judge: null,
    finished: taken.every((t) => t !== null),
  };
}

/**
 * 人間から見た勝敗。決着していなければ null。
 * ひとりでは全部そろえた時点で「クリア（win）」。
 */
export function outcome(state: MemoryState): 'win' | 'loss' | 'draw' | null {
  if (!state.finished) return null;
  if (state.mode === 'solo') return 'win';
  const me = state.pairs[HUMAN];
  const cpu = state.pairs[CPU];
  if (me > cpu) return 'win';
  if (me < cpu) return 'loss';
  return 'draw';
}

// ---------------------------------------------------------------- CPU

/** CPUが覚えている位置のうち、まだ場に残っていて表になっていないもの */
export function knownPositions(state: MemoryState): number[] {
  return state.cpuKnown.filter((p) => state.taken[p] === null && !state.flipped.includes(p));
}

/** 覚えている札だけで作れる組。無ければ null */
export function knownPair(state: MemoryState): [number, number] | null {
  const known = knownPositions(state);
  for (let i = 0; i < known.length; i += 1) {
    for (let j = i + 1; j < known.length; j += 1) {
      if (state.cards[known[i]].rank === state.cards[known[j]].rank) return [known[i], known[j]];
    }
  }
  return null;
}

function pickOne(list: number[], rng: () => number): number {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

/**
 * CPUが次にめくる位置。めくれる札が無ければ null。
 *
 * - 1枚目：覚えている札だけで組が作れるならそれを取りに行く。
 *   作れなければ**まだ覚えていない札**を優先してめくる（新しく覚えるため）
 * - 2枚目：1枚目と同じ数字を覚えていればそこ。無ければまた知らない札
 *
 * 記憶に無い札の中身は見ないので、強さは `MEMORY_RATE` だけで決まる。
 */
export function chooseCpuFlip(state: MemoryState, rng: () => number = Math.random): number | null {
  const open = openPositions(state);
  if (open.length === 0 || state.judge !== null || state.finished) return null;

  if (state.flipped.length === 0) {
    const pair = knownPair(state);
    if (pair) return pair[0];
  } else {
    const first = state.cards[state.flipped[0]];
    const match = knownPositions(state).find((p) => state.cards[p].rank === first.rank);
    if (match !== undefined) return match;
  }

  const known = new Set(state.cpuKnown);
  const fresh = open.filter((p) => !known.has(p));
  return pickOne(fresh.length > 0 ? fresh : open, rng);
}
