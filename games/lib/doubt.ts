/**
 * ダウト（4 人・CPU 3 人）のロジック。純関数だけで、画面は `app/doubt/Game.tsx`。
 *
 * 仕様: docs/features/game-doubt.md
 *
 * - 席は 0（あなた）→ 1 → 2 → 3 の順に出す（時計回り）
 * - 宣言の数は A → 2 → … → K → A と順番で決まる。手番の人は 1〜4 枚を伏せて出す（パスは無い）
 * - 1 手は「出す（`play`）」→「ダウトを受ける（`call` か `pass`）」→「表にした札を見せたあと次へ（`afterReveal`）」に
 *   割ってある。表にした札を画面に見せてから引き取らせるため（games/CLAUDE.md 8）
 * - **CPU は伏せ札を見ない。** CPU の判断は `publicView` が返す `PublicView` だけを引数に取り、
 *   その型に伏せ札（場札・今出した札の中身・ほかの人の手札）を入れていない
 */

import { makeDeck, shuffle, type Card, type Rank } from './cards';

export const PLAYER_COUNT = 4;
export const DECK_SIZE = 52;
/** 1 回に出せる枚数の上限（当サイトのルール。仕様書「1 回に 1〜4 枚」） */
export const MAX_PLAY = 4;
/** 同じ数の札の枚数（4 スート） */
export const SUIT_COUNT = 4;

export type Level = 'easy' | 'normal' | 'hard';
export type Phase = 'play' | 'calling' | 'reveal' | 'finished';
/** 1 位が決まったら終わるか、4 位まで続けるか */
export type Until = 'first' | 'all';

export const LEVELS: Record<Level, { label: string }> = {
  easy: { label: 'よわい' },
  normal: { label: 'ふつう' },
  hard: { label: 'つよい' },
};

export const UNTILS: Record<Until, { label: string }> = {
  first: { label: '1位まで' },
  all: { label: '最後まで' },
};

/**
 * CPU のしきい値（段ごとの定数。games/docs/DECISIONS.md に理由を書いた）。
 *
 * - `EASY_CALL_RATE`：よわい が疑う確率（伏せ札の中身にも確率にもよらない）
 * - `CALL_BELOW`：ふつう・つよい は「宣言どおりそろっている見込み」がこれを下回ったら言う。
 *   **0 に近い値にしてある。** 4 人とも CPU の 200 局を回すと、0.03〜0.5 で言わせた段はどれも
 *   よわい（無作為に 15%）に負けた。言い損ねの損（場札を全部引き取る）は言った人ひとりが負い、
 *   当てた得はほかの 2 人にも分かれるため。確率 0（自分の手札だけで必ずウソと分かる）がいちばん効く
 * - `HARD_CAUTION_PER_CARD`：つよい は場札 1 枚ごとにしきい値をこれだけ下げる（引き取りの損が大きいほど慎重）
 * - `MIX_RATE`：正直な札にウソを 1 枚混ぜる確率
 */
export const EASY_CALL_RATE = 0.15;
export const CALL_BELOW: Record<Exclude<Level, 'easy'>, number> = { normal: 0.005, hard: 0.01 };
export const HARD_CAUTION_PER_CARD = 0.0005;
export const MIX_RATE: Record<Exclude<Level, 'easy'>, number> = { normal: 0.05, hard: 0.1 };
/** つよい：ほかの人の手札がこれ以下なら、正直な札だけを出す（ダウトされる手を減らす） */
export const HARD_THREAT = 3;
/** つよい：正直な札を出したあとの残りがこれ以下なら、残りもまとめて出して上がりに行く */
export const HARD_BOLD = 1;

/** いま場に出ていて、ダウトを待っている 1 手（伏せ札の中身を持つのは状態だけ） */
export interface Played {
  player: number;
  rank: Rank;
  cards: Card[];
}

/** ダウトの結果。表にした札は 1.5 秒見せてから `afterReveal` で引き取らせる */
export interface Reveal {
  caller: number;
  player: number;
  rank: Rank;
  /** 表にした札（今出した分だけ） */
  cards: Card[];
  /** 出した札が全部宣言どおりだったか */
  truthful: boolean;
  /** 場札を引き取る人（正直なら言った人、ウソなら出した人） */
  taker: number;
  /** 引き取る枚数（場札全部） */
  taken: number;
}

export interface DoubtState {
  hands: Card[][];
  /** 場札（伏せたまま積まれた札。今出した分を含む）。画面には枚数だけ出す */
  pile: Card[];
  /** 次に出す人（`calling` / `reveal` のあいだは今出した人のまま） */
  turn: number;
  /** 次に宣言する数（`calling` / `reveal` のあいだは今の宣言の数） */
  rank: Rank;
  phase: Phase;
  current: Played | null;
  reveal: Reveal | null;
  /** 上がった順 */
  finished: number[];
  until: Until;
  /** 各人の直前の宣言（席に出す） */
  declared: ({ rank: Rank; count: number } | null)[];
  /**
   * ダウトで表になって引き取られた札を、引き取った人ごと・数ごとに数えたもの（公開の情報）。
   * `known[player][rank]`。本人がその数を宣言して出したら、その枚数だけ減らす
   */
  known: number[][];
}

/** その人から見える情報だけ。**伏せ札（場札・今出した札・ほかの人の手札）は持たない** */
export interface PublicView {
  viewer: number;
  /** 自分の手札 */
  hand: Card[];
  handCounts: number[];
  pileCount: number;
  rank: Rank;
  turn: number;
  phase: Phase;
  /** 今出た 1 手の「誰が・何を・何枚」だけ（中身は無い） */
  current: { player: number; rank: Rank; count: number } | null;
  finished: number[];
  declared: ({ rank: Rank; count: number } | null)[];
  known: number[][];
}

export function nextRank(rank: Rank): Rank {
  return (rank === 13 ? 1 : rank + 1) as Rank;
}

/** 時計回りで次の席 */
export function nextSeat(seat: number): number {
  return (seat + 1) % PLAYER_COUNT;
}

function sortHand(hand: Card[]): Card[] {
  const suitOrder = { spade: 0, heart: 1, diamond: 2, club: 3 } as const;
  return [...hand].sort((a, b) => a.rank - b.rank || suitOrder[a.suit] - suitOrder[b.suit]);
}

function emptyKnown(): number[][] {
  return Array.from({ length: PLAYER_COUNT }, () => Array<number>(14).fill(0));
}

/** 52 枚を 13 枚ずつ配る。`first` から A を出す */
export function deal(rng: () => number = Math.random, until: Until = 'first', first = 0): DoubtState {
  const deck = shuffle(makeDeck(), rng).map((c) => ({ ...c, faceUp: true }));
  const hands = Array.from({ length: PLAYER_COUNT }, (_, p) => sortHand(deck.filter((_, i) => i % PLAYER_COUNT === p)));
  return {
    hands,
    pile: [],
    turn: first,
    rank: 1,
    phase: 'play',
    current: null,
    reveal: null,
    finished: [],
    until,
    declared: Array(PLAYER_COUNT).fill(null),
    known: emptyKnown(),
  };
}

/** まだ上がっていない人（手札が 0 枚でも、ダウトの結果待ちの人は含む） */
export function activePlayers(state: DoubtState): number[] {
  return Array.from({ length: PLAYER_COUNT }, (_, p) => p).filter((p) => !state.finished.includes(p));
}

/** 今の 1 手にダウトと言える人（出した人以外で、まだ上がっていない人） */
export function eligibleCallers(state: DoubtState): number[] {
  if (state.phase !== 'calling' || !state.current) return [];
  const player = state.current.player;
  return activePlayers(state).filter((p) => p !== player);
}

/** 複数人が言ったら、出した人から見て時計回りで近い人が優先 */
export function firstCaller(player: number, callers: readonly number[]): number | null {
  for (let step = 1; step < PLAYER_COUNT; step += 1) {
    const seat = (player + step) % PLAYER_COUNT;
    if (callers.includes(seat)) return seat;
  }
  return null;
}

/** 手番の人が 1〜4 枚を伏せて出す。出せない形なら状態をそのまま返す */
export function play(state: DoubtState, playerId: number, cards: readonly Card[]): DoubtState {
  if (state.phase !== 'play' || state.turn !== playerId) return state;
  if (cards.length < 1 || cards.length > MAX_PLAY) return state;
  const ids = new Set(cards.map((c) => c.id));
  if (ids.size !== cards.length) return state;
  const hand = state.hands[playerId];
  if (!cards.every((c) => hand.some((h) => h.id === c.id))) return state;
  const played = hand.filter((c) => ids.has(c.id));
  const hands = state.hands.map((h, p) => (p === playerId ? h.filter((c) => !ids.has(c.id)) : h));
  const declared = [...state.declared];
  declared[playerId] = { rank: state.rank, count: played.length };
  return {
    ...state,
    hands,
    pile: [...state.pile, ...played],
    phase: 'calling',
    current: { player: playerId, rank: state.rank, cards: played },
    reveal: null,
    declared,
  };
}

/**
 * 今の 1 手が場を離れた（通った・表にされた）あと、出した本人の追跡の枚数を宣言の枚数ぶん減らす。
 * 引き取った札を宣言どおりに出したかもしれないため。**出したその 1 手への判断には効かせない**
 * （効かせると「本人が引き取った札を正直に出した」ときの見込みが基本形と同じになる）
 */
function forgetPlayed(known: number[][], played: Played): number[][] {
  const next = known.map((row) => [...row]);
  next[played.player][played.rank] = Math.max(0, next[played.player][played.rank] - played.cards.length);
  return next;
}

/** 今の 1 手が全部宣言どおりか */
export function isTruthful(played: Played): boolean {
  return played.cards.every((c) => c.rank === played.rank);
}

/** `callerId` がダウトと言った。札を表にして `reveal` の局面へ（引き取りは `afterReveal`） */
export function call(state: DoubtState, callerId: number): DoubtState {
  if (!eligibleCallers(state).includes(callerId) || !state.current) return state;
  const current = state.current;
  const truthful = isTruthful(current);
  return {
    ...state,
    phase: 'reveal',
    reveal: {
      caller: callerId,
      player: current.player,
      rank: current.rank,
      cards: current.cards,
      truthful,
      taker: truthful ? callerId : current.player,
      taken: state.pile.length,
    },
  };
}

/** 次の手番へ進める（宣言の数は引き取りのあとも進む） */
function advance(state: DoubtState): DoubtState {
  const player = state.current ? state.current.player : state.turn;
  const finished = [...state.finished];
  if (state.hands[player].length === 0 && !finished.includes(player)) finished.push(player);
  const left = Array.from({ length: PLAYER_COUNT }, (_, p) => p).filter((p) => !finished.includes(p));
  const over = state.until === 'first' ? finished.length >= 1 : left.length <= 1;
  if (over) {
    return { ...state, finished: state.until === 'all' ? [...finished, ...left] : finished, phase: 'finished', current: null };
  }
  let turn = nextSeat(player);
  while (finished.includes(turn)) turn = nextSeat(turn);
  return { ...state, finished, turn, rank: nextRank(state.rank), phase: 'play', current: null };
}

/** 誰もダウトと言わなかった。場札は積まれたまま次の手番へ */
export function pass(state: DoubtState): DoubtState {
  if (state.phase !== 'calling') return state;
  const known = state.current ? forgetPlayed(state.known, state.current) : state.known;
  return advance({ ...state, reveal: null, known });
}

/** 表にした札を見せ終えた。引き取る人が場札を全部取り、次の手番へ */
export function afterReveal(state: DoubtState): DoubtState {
  if (state.phase !== 'reveal' || !state.reveal) return state;
  const { taker, cards } = state.reveal;
  const hands = state.hands.map((h, p) => (p === taker ? sortHand([...h, ...state.pile]) : h));
  const known = state.current ? forgetPlayed(state.known, state.current) : state.known.map((row) => [...row]);
  for (const c of cards) known[taker][c.rank] += 1;
  return advance({ ...state, hands, pile: [], known });
}

export function isFinished(state: DoubtState): boolean {
  return state.phase === 'finished';
}

/** その人から見える情報だけを返す（CPU の判断と画面の両方がこれを使う） */
export function publicView(state: DoubtState, viewerId: number): PublicView {
  return {
    viewer: viewerId,
    hand: state.hands[viewerId].map((c) => ({ ...c })),
    handCounts: state.hands.map((h) => h.length),
    pileCount: state.pile.length,
    rank: state.rank,
    turn: state.turn,
    phase: state.phase,
    current: state.current
      ? { player: state.current.player, rank: state.current.rank, count: state.current.cards.length }
      : null,
    finished: [...state.finished],
    declared: state.declared.map((d) => (d ? { ...d } : null)),
    known: state.known.map((row) => [...row]),
  };
}

// ---- 確率 ----

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  const m = Math.min(k, n - k);
  for (let i = 1; i <= m; i += 1) r = (r * (n - m + i)) / i;
  return r;
}

/** N 枚（当たり r 枚）から h 枚を無作為に取ったとき、当たりが k 枚以上入る確率（超幾何分布） */
export function hypergeomAtLeast(N: number, r: number, h: number, k: number): number {
  if (k <= 0) return 1;
  if (r < k || h < k) return 0;
  const total = choose(N, h);
  if (total === 0) return 0;
  let p = 0;
  for (let x = k; x <= Math.min(r, h); x += 1) p += choose(r, x) * choose(N - r, h - x);
  return Math.min(1, p / total);
}

/**
 * 今の 1 手が宣言どおりそろっている見込み（`view.viewer` から見て）。
 *
 * - **N**：その人から見えていない札 ＝ 52 − 自分の手札（ほかの 2 人の手札＋伏せた場札＋出した人の出す前の手札）
 * - **r**：宣言の数 4 枚から、**自分の手札にある枚数だけ**を除いた残り
 * - **h**：出した人の出す前の手札の枚数、**k**：宣言の枚数
 * - つよい だけ：出した本人が引き取った宣言の数の札 c 枚を「その人の手にある見込みが高い当たり」として、
 *   k' = max(0, k − c) について残りで出す（c 枚は N・h・r からも除く）。ほかの人が引き取った札は r に残す
 */
export function truthProbability(view: PublicView, level: Level): number {
  const cur = view.current;
  if (!cur) return 1;
  const mine = view.hand.filter((c) => c.rank === cur.rank).length;
  const N = DECK_SIZE - view.hand.length;
  const r = SUIT_COUNT - mine;
  const h = view.handCounts[cur.player] + cur.count;
  const k = cur.count;
  if (level !== 'hard') return hypergeomAtLeast(N, r, h, k);
  const c = Math.min(view.known[cur.player]?.[cur.rank] ?? 0, r, h);
  return hypergeomAtLeast(N - c, r - c, h - c, Math.max(0, k - c));
}

/** CPU がダウトと言うか。`view.current` が今の 1 手 */
export function cpuDecideCall(view: PublicView, level: Level, rng: () => number = Math.random): boolean {
  const cur = view.current;
  if (!cur || cur.player === view.viewer || view.finished.includes(view.viewer)) return false;
  if (level === 'easy') return rng() < EASY_CALL_RATE;
  const p = truthProbability(view, level);
  if (p <= 0) return true;
  if (level === 'hard') {
    // この 1 手で手札を出し切る（通せば上がられる）相手は必ず疑う
    if (view.handCounts[cur.player] === 0) return true;
    return p < Math.max(0, CALL_BELOW.hard - HARD_CAUTION_PER_CARD * view.pileCount);
  }
  return p < CALL_BELOW.normal;
}

/**
 * 自分の手番で、その数を次に宣言するまでに何回手番が回るか（大きいほど当分いらない札）。
 * 宣言の数は全員で 1 つずつ進むので、自分に回ってくるのは R, R+n, R+2n …（n はまだ上がっていない人数）
 */
export function turnsUntil(rank: Rank, from: Rank, players: number): number {
  for (let j = 1; j <= 13; j += 1) {
    if ((from - 1 + players * j) % 13 === rank - 1) return j;
  }
  return 13;
}

/** ウソに使う札を n 枚選ぶ。自分に当分回ってこない数から出す（よわい は無作為） */
function lieCards(hand: readonly Card[], rank: Rank, n: number, level: Level, players: number, rng: () => number): Card[] {
  const pool = hand.filter((c) => c.rank !== rank);
  if (level === 'easy') return shuffle(pool, rng).slice(0, n);
  return [...pool]
    .sort((a, b) => turnsUntil(b.rank, rank, players) - turnsUntil(a.rank, rank, players) || a.id - b.id)
    .slice(0, n);
}

/** CPU が出す札（1〜4 枚）。`view` は自分から見える情報 */
export function cpuChoosePlay(
  hand: readonly Card[],
  rank: Rank,
  view: PublicView,
  level: Level,
  rng: () => number = Math.random,
): Card[] {
  const honest = hand.filter((c) => c.rank === rank).slice(0, MAX_PLAY);
  const players = PLAYER_COUNT - view.finished.length;
  const lie = (n: number) => lieCards(hand, rank, n, level, players, rng);
  if (level === 'easy') return honest.length > 0 ? honest : lie(1);

  const others = view.handCounts.filter((n, p) => p !== view.viewer && !view.finished.includes(p));
  const threatened = level === 'hard' && others.some((n) => n <= HARD_THREAT);
  const room = MAX_PLAY - honest.length;
  const rest = hand.length - honest.length;

  // 持っていなければウソをつくしかない（1 枚だけ）
  if (honest.length === 0) return lie(1);
  if (threatened || room === 0 || rest === 0) return honest;
  if (level === 'hard' && rest <= HARD_BOLD && rest <= room) {
    // 上がりが近い：残りもまとめて混ぜて、この 1 手で出し切りに行く
    return [...honest, ...lie(rest)];
  }
  if (rng() < MIX_RATE[level]) return [...honest, ...lie(1)];
  return honest;
}

// ---- 結果と記録 ----

/** 順位（0 始まり）。上がった順、残りは手札の少ない順 */
export function placeOf(state: DoubtState, player: number): number {
  const idx = state.finished.indexOf(player);
  if (idx >= 0) return idx;
  const rest = Array.from({ length: PLAYER_COUNT }, (_, p) => p)
    .filter((p) => !state.finished.includes(p))
    .sort((a, b) => state.hands[a].length - state.hands[b].length || a - b);
  return state.finished.length + rest.indexOf(player);
}

/** 1 局の結果を `records.ts` の形で返す。**`timeMs` は勝ったときだけ渡す** */
export function resultFor(state: DoubtState, player: number, timeMs: number): { outcome: 'win'; timeMs: number } | { outcome: 'loss' } {
  return state.finished[0] === player ? { outcome: 'win', timeMs } : { outcome: 'loss' };
}

// ---- 手札の並べ方（360px で横スクロールも縦スクロールもさせない） ----

export type HandLayout = 'row' | 'two' | 'chips';

/** 札 1 枚が見えていなければならない幅（これを切ったら数のチップに切り替える） */
export const MIN_VISIBLE_PX = 24;
/** 1 列で並べる上限・2 段で並べる上限 */
export const ROW_MAX = 13;
export const TWO_MAX = 26;

/** 画面幅から札 1 枚の幅（`.dt-slot` の clamp(38px, 9.5vw, 54px) と同じ式） */
export function slotWidth(widthPx: number): number {
  return Math.min(54, Math.max(38, widthPx * 0.095));
}

/**
 * 手札の帯に使える幅。本文は左右 16px の余白で最大 760px、カードは枠 1px と内側の余白
 * （600px 以下は 10px、広い画面は 18px）。**600px 以下では手札の帯だけカードの内側の余白に
 * はみ出させる**（`.dt-hand` の負の margin）。360px で 13 枚を 1 枚 24px 以上で並べるため
 */
export function handWidth(widthPx: number): number {
  return widthPx <= 600 ? widthPx - 32 - 2 : Math.min(widthPx, 760) - 32 - 2 - 36;
}

/** n 枚を幅 handPx に重ねて並べたときの、1 枚あたりの見える幅 */
export function visiblePerCard(n: number, widthPx: number, handPx: number = handWidth(widthPx)): number {
  const slot = slotWidth(widthPx);
  if (n <= 1) return slot;
  return Math.min(slot + 4, (handPx - slot) / (n - 1));
}

/**
 * 手札の並べ方。13 枚以下は 1 列、14〜26 枚は 2 段（A〜7 と 8〜K）、それより多いか
 * 1 枚あたりの見える幅が 24px を切るときは、数ごとにまとめた「数のチップ」。
 * `rowMax` は 2 段のときに多いほうの段の枚数（省略すると半分ずつとみなす）。
 * `handPx` は実際に測った帯の幅（画面では測った値を渡す。省略すると `handWidth` の見積もり）
 */
export function handLayout(
  count: number,
  widthPx: number,
  rowMax: number = Math.ceil(count / 2),
  handPx: number = handWidth(widthPx),
): HandLayout {
  if (count <= ROW_MAX && visiblePerCard(count, widthPx, handPx) >= MIN_VISIBLE_PX) return 'row';
  const perRow = Math.max(rowMax, Math.ceil(count / 2));
  if (count <= TWO_MAX && visiblePerCard(perRow, widthPx, handPx) >= MIN_VISIBLE_PX) return 'two';
  return 'chips';
}

/** 2 段の分け方。上の段が A〜7、下の段が 8〜K */
export function splitRows(hand: readonly Card[]): [Card[], Card[]] {
  return [hand.filter((c) => c.rank <= 7), hand.filter((c) => c.rank >= 8)];
}

/** 数のチップで 1 枚足すとき、まだ選んでいない同じ数の札を 1 枚返す（マークは勝敗に関係しないので自動） */
export function pickOfRank(hand: readonly Card[], rank: Rank, selectedIds: readonly number[]): Card | null {
  return hand.find((c) => c.rank === rank && !selectedIds.includes(c.id)) ?? null;
}
