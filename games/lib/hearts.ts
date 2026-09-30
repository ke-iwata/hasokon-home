/**
 * ハーツ（4人・CPU 3人のトリックテイキング）のロジック。純関数だけで、画面は `app/hearts/Game.tsx`。
 *
 * 仕様: docs/features/game-hearts.md
 *
 * - 席は 0（あなた）→ 1（CPU 左）→ 2（CPU 正面）→ 3（CPU 右）の順に出す（時計回り）
 * - 1 トリックは「出す（`playCard`）」と「取る（`collectTrick`）」の 2 手に割ってある。
 *   4 枚そろったところを画面に見せてから取るため（games/CLAUDE.md 8）
 * - ハート 1 点・♠Q 13 点。1 人で 26 点すべてを取ったら、その人は 0 点で他の 3 人に 26 点ずつ
 */

import { makeDeck, shuffle, type Card, type Rank, type Suit } from './cards';

export const PLAYER_COUNT = 4;
export const HAND_SIZE = 13;
export const PASS_COUNT = 3;
/** 誰かがこの点に達した局で試合が終わる */
export const MATCH_POINTS = 100;
/** 1 局の点の合計（ハート 13 枚＋♠Q 13 点）。1 人で全部取るとシュートザムーン */
export const MOON_POINTS = 26;

export type PassDirection = 'left' | 'right' | 'across' | 'none';
export type Phase = 'passing' | 'playing' | 'roundEnd' | 'matchEnd';
/** 試合の長さ。1 局で終えるか、誰かが 100 点に達するまでか */
export type MatchLength = 'one' | 'hundred';
/** CPU の強さ。違いは「シュートザムーンを止めに行くか」だけ */
export type Level = 'normal' | 'strong';

export const LEVELS: Record<Level, { label: string }> = {
  normal: { label: 'ふつう' },
  strong: { label: 'つよい' },
};

export const LENGTHS: Record<MatchLength, { label: string }> = {
  one: { label: '1局で終える' },
  hundred: { label: '100点まで' },
};

/** 左・右・向かいが、席番号をいくつ進めた先か */
const PASS_OFFSET: Record<PassDirection, number> = { left: 1, right: 3, across: 2, none: 0 };

export interface Play {
  player: number;
  card: Card;
}

export interface RoundState {
  hands: Card[][];
  /** いまのトリックに出た札（出した順）。4 枚そろったら `collectTrick` で取る */
  trick: Play[];
  /** 次に出す人。トリックが 4 枚そろって取る前は -1（誰の番でもない） */
  turn: number;
  /** 取り終えたトリックの数（0〜13） */
  tricksPlayed: number;
  heartsBroken: boolean;
  /** 各人が取ったトリックの札 */
  taken: Card[][];
  /** パスで受け取った札（パス無しの局は空） */
  received: Card[][];
}

export interface MatchState {
  phase: Phase;
  length: MatchLength;
  level: Level;
  /** 何局目か（0 始まり）。パスの向きはここから決まる */
  roundIndex: number;
  round: RoundState;
  /** 試合の累計点（終わった局までの合計） */
  totals: number[];
  /** 直前に終わった局の点（シュートザムーンの置き換え後）。局の途中は 0 のまま */
  lastRoundScores: number[];
  /** 直前に終わった局でシュートザムーンを決めた人（いなければ null） */
  lastMoon: number | null;
  /** この試合でシュートザムーンを決めた回数（席ごと）。記録の bestScore に使う */
  moonCounts: number[];
}

/** A を最強（14）にした強さ */
export function strength(rank: Rank): number {
  return rank === 1 ? 14 : rank;
}

export function isPointCard(card: Card): boolean {
  return card.suit === 'heart' || isQueenOfSpades(card);
}

export function isQueenOfSpades(card: Card): boolean {
  return card.suit === 'spade' && card.rank === 12;
}

export function isTwoOfClubs(card: Card): boolean {
  return card.suit === 'club' && card.rank === 2;
}

export function cardPoints(card: Card): number {
  if (card.suit === 'heart') return 1;
  return isQueenOfSpades(card) ? 13 : 0;
}

const SUIT_ORDER: Record<Suit, number> = { club: 0, diamond: 1, spade: 2, heart: 3 };

/** 手札の並べ方：♣ ♦ ♠ ♥、同じスートは弱い順 */
export function sortHand(hand: readonly Card[]): Card[] {
  return [...hand].sort(
    (a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || strength(a.rank) - strength(b.rank),
  );
}

/** 52 枚を切って 13 枚ずつ配る */
export function dealRound(rng: () => number = Math.random): Card[][] {
  const deck = shuffle(makeDeck(), rng).map((c) => ({ ...c, faceUp: true }));
  return Array.from({ length: PLAYER_COUNT }, (_, i) =>
    sortHand(deck.slice(i * HAND_SIZE, (i + 1) * HAND_SIZE)),
  );
}

/** 左 → 右 → 向かい → パス無し の 4 局で 1 周 */
export function passDirection(roundIndex: number): PassDirection {
  return (['left', 'right', 'across', 'none'] as const)[roundIndex % 4];
}

/** `from` の席が渡す相手の席 */
export function passTarget(from: number, dir: PassDirection): number {
  return (from + PASS_OFFSET[dir]) % PLAYER_COUNT;
}

/** `to` の席に札を渡してくる席 */
export function passSource(to: number, dir: PassDirection): number {
  return (to + PLAYER_COUNT - PASS_OFFSET[dir]) % PLAYER_COUNT;
}

/** ♣2 を持っている席（最初のリード） */
export function twoOfClubsHolder(hands: readonly Card[][]): number {
  return hands.findIndex((h) => h.some(isTwoOfClubs));
}

/** 配った手札から局を始める（パスの前でも後でも同じ形） */
export function newRound(hands: Card[][], received: Card[][] = hands.map(() => [])): RoundState {
  const leader = twoOfClubsHolder(hands);
  return {
    hands,
    trick: [],
    turn: leader,
    tricksPlayed: 0,
    heartsBroken: false,
    taken: hands.map(() => []),
    received,
  };
}

/**
 * パスを行う。`picks[i]` は席 i が渡す 3 枚。
 * 向きが `none` のときは何もしない。
 */
export function exchange(hands: readonly Card[][], picks: readonly Card[][], dir: PassDirection): {
  hands: Card[][];
  received: Card[][];
} {
  if (dir === 'none') return { hands: hands.map((h) => [...h]), received: hands.map(() => []) };
  const received: Card[][] = hands.map(() => []);
  picks.forEach((pick, from) => {
    if (pick.length !== PASS_COUNT) throw new Error(`席${from}の渡す札が${PASS_COUNT}枚ではない`);
    for (const c of pick) {
      if (!hands[from].some((h) => h.id === c.id)) throw new Error(`席${from}の手札に無い札を渡そうとした`);
    }
    received[passTarget(from, dir)] = [...pick];
  });
  const next = hands.map((hand, i) =>
    sortHand([...hand.filter((c) => !picks[i].some((p) => p.id === c.id)), ...received[i]]),
  );
  return { hands: next, received };
}

/** 最初のトリック（まだ 1 枚も取っていない）か */
function isFirstTrick(state: RoundState): boolean {
  return state.tricksPlayed === 0;
}

/**
 * いま `player` が出せる札。フォロー義務・ハートブレイク・最初のトリックの制限をすべて含む。
 * 番でない人・4 枚そろって取る前は空。
 */
export function legalCards(state: RoundState, player: number): Card[] {
  if (state.turn !== player || state.trick.length >= PLAYER_COUNT) return [];
  const hand = state.hands[player];
  if (state.trick.length === 0) {
    // リード
    if (isFirstTrick(state)) return hand.filter(isTwoOfClubs);
    if (state.heartsBroken) return [...hand];
    const nonHearts = hand.filter((c) => c.suit !== 'heart');
    return nonHearts.length > 0 ? nonHearts : [...hand];
  }
  // フォロー
  const led = state.trick[0].card.suit;
  const follow = hand.filter((c) => c.suit === led);
  if (follow.length > 0) return follow;
  if (isFirstTrick(state)) {
    // 最初のトリックに点札は出せない。点札しか無いときだけ例外
    const safe = hand.filter((c) => !isPointCard(c));
    return safe.length > 0 ? safe : [...hand];
  }
  return [...hand];
}

export function isLegal(state: RoundState, player: number, card: Card): boolean {
  return legalCards(state, player).some((c) => c.id === card.id);
}

/** 台札のスートでいちばん強い札を出した人 */
export function trickWinner(trick: readonly Play[]): number {
  const led = trick[0].card.suit;
  let best = trick[0];
  for (const p of trick) {
    if (p.card.suit === led && strength(p.card.rank) > strength(best.card.rank)) best = p;
  }
  return best.player;
}

/** 札を 1 枚出す。4 枚目なら `turn` を -1 にして、取る（`collectTrick`）のを待つ */
export function playCard(state: RoundState, player: number, card: Card): RoundState {
  if (!isLegal(state, player, card)) throw new Error('出せない札を出そうとした');
  const hands = state.hands.map((h, i) => (i === player ? h.filter((c) => c.id !== card.id) : h));
  const trick = [...state.trick, { player, card }];
  return {
    ...state,
    hands,
    trick,
    turn: trick.length === PLAYER_COUNT ? -1 : (player + 1) % PLAYER_COUNT,
    heartsBroken: state.heartsBroken || card.suit === 'heart',
  };
}

/** 4 枚そろったトリックを、勝った人が取る。勝った人が次をリードする */
export function collectTrick(state: RoundState): RoundState {
  if (state.trick.length !== PLAYER_COUNT) throw new Error('トリックがそろっていない');
  const winner = trickWinner(state.trick);
  return {
    ...state,
    trick: [],
    turn: winner,
    tricksPlayed: state.tricksPlayed + 1,
    taken: state.taken.map((t, i) => (i === winner ? [...t, ...state.trick.map((p) => p.card)] : t)),
  };
}

export function isRoundOver(state: RoundState): boolean {
  return state.tricksPlayed === HAND_SIZE;
}

/** 取った札の点（シュートザムーンの置き換え前）。局の途中の「今局」の表示にも使う */
export function rawPoints(taken: readonly Card[][]): number[] {
  return taken.map((cards) => cards.reduce((sum, c) => sum + cardPoints(c), 0));
}

/** 1 人で 26 点すべてを取った人（いなければ null） */
export function moonShooter(taken: readonly Card[][]): number | null {
  const i = rawPoints(taken).indexOf(MOON_POINTS);
  return i >= 0 ? i : null;
}

/** 局の点。シュートザムーンなら、その人は 0 点で他の 3 人に 26 点ずつ */
export function scoreRound(taken: readonly Card[][]): number[] {
  const shooter = moonShooter(taken);
  if (shooter === null) return rawPoints(taken);
  return taken.map((_, i) => (i === shooter ? 0 : MOON_POINTS));
}

/** 誰かが 100 点に達したか */
export function isMatchOver(totals: readonly number[]): boolean {
  return totals.some((t) => t >= MATCH_POINTS);
}

/**
 * 席ごとの順位（0 が 1 位）。点の少ないほうが上で、同点は同順位
 * （例：[10, 30, 10, 50] → [0, 2, 0, 3]）。
 */
export function ranking(totals: readonly number[]): number[] {
  return totals.map((t) => totals.filter((u) => u < t).length);
}

// ---- 試合 ----

function startRound(
  base: Pick<MatchState, 'length' | 'level' | 'totals' | 'moonCounts' | 'lastRoundScores' | 'lastMoon'>,
  roundIndex: number,
  rng: () => number,
): MatchState {
  const hands = dealRound(rng);
  return {
    ...base,
    roundIndex,
    phase: passDirection(roundIndex) === 'none' ? 'playing' : 'passing',
    round: newRound(hands),
  };
}

export function newMatch(length: MatchLength, level: Level, rng: () => number = Math.random): MatchState {
  const zeros = Array.from({ length: PLAYER_COUNT }, () => 0);
  return startRound(
    { length, level, totals: zeros, moonCounts: [...zeros], lastRoundScores: [...zeros], lastMoon: null },
    0,
    rng,
  );
}

/** あなた（席 0）が選んだ 3 枚と、CPU が選ぶ 3 枚で、パスを行う */
export function submitPass(match: MatchState, humanPick: readonly Card[]): MatchState {
  if (match.phase !== 'passing') throw new Error('パスの局面ではない');
  const dir = passDirection(match.roundIndex);
  const { hands } = match.round;
  const picks = hands.map((hand, i) => (i === 0 ? [...humanPick] : chooseCpuPass(hand)));
  const result = exchange(hands, picks, dir);
  return { ...match, phase: 'playing', round: newRound(result.hands, result.received) };
}

export function matchPlay(match: MatchState, player: number, card: Card): MatchState {
  if (match.phase !== 'playing') throw new Error('札を出す局面ではない');
  return { ...match, round: playCard(match.round, player, card) };
}

/** トリックを取る。13 トリック目なら局の点を足し、試合の終わりか次の局かを決める */
export function matchCollect(match: MatchState): MatchState {
  const round = collectTrick(match.round);
  if (!isRoundOver(round)) return { ...match, round };
  const scores = scoreRound(round.taken);
  const moon = moonShooter(round.taken);
  const totals = match.totals.map((t, i) => t + scores[i]);
  const moonCounts = match.moonCounts.map((n, i) => (i === moon ? n + 1 : n));
  const over = match.length === 'one' || isMatchOver(totals);
  return {
    ...match,
    round,
    totals,
    moonCounts,
    lastRoundScores: scores,
    lastMoon: moon,
    phase: over ? 'matchEnd' : 'roundEnd',
  };
}

export function nextRound(match: MatchState, rng: () => number = Math.random): MatchState {
  if (match.phase !== 'roundEnd') throw new Error('局の終わりではない');
  return startRound(match, match.roundIndex + 1, rng);
}

// ---- CPU ----

/** パスで先に手放したい順（大きいほど先）。♠A・♠K・♠Q と高いハートを最優先 */
function passPriority(card: Card, keepQueen: boolean): number {
  if (card.suit === 'spade' && card.rank === 12) return keepQueen ? -1 : 300;
  if (card.suit === 'spade' && (card.rank === 1 || card.rank === 13)) return 200 + strength(card.rank);
  if (card.suit === 'heart') return 100 + strength(card.rank);
  return strength(card.rank);
}

/**
 * CPU が渡す 3 枚。♠A・♠K・♠Q と高いハートから渡す。
 * ♠Q を持っていて♠が 4 枚以上あるなら、♠Q は守る（他の♠で身を隠せるため）
 */
export function chooseCpuPass(hand: readonly Card[]): Card[] {
  const spades = hand.filter((c) => c.suit === 'spade').length;
  const keepQueen = spades >= 4;
  return [...hand]
    .sort((a, b) => passPriority(b, keepQueen) - passPriority(a, keepQueen) || a.id - b.id)
    .slice(0, PASS_COUNT);
}

function highest(cards: readonly Card[]): Card {
  return cards.reduce((a, b) => (strength(b.rank) > strength(a.rank) ? b : a));
}

function lowest(cards: readonly Card[]): Card {
  return cards.reduce((a, b) => (strength(b.rank) < strength(a.rank) ? b : a));
}

/** ♠Q がもう出たか（取られた札・いまのトリックのどちらかにある） */
function queenGone(state: RoundState): boolean {
  return (
    state.taken.some((t) => t.some(isQueenOfSpades)) || state.trick.some((p) => isQueenOfSpades(p.card))
  );
}

/**
 * シュートザムーンを狙っていそうな相手。点を取った人が自分以外の 1 人だけで、
 * すでに 8 点以上取っているとき（「つよい」だけが使う）
 */
export function moonThreat(state: RoundState, self: number): number | null {
  const pts = rawPoints(state.taken);
  const holders = pts.map((p, i) => (p > 0 ? i : -1)).filter((i) => i >= 0);
  if (holders.length !== 1 || holders[0] === self) return null;
  return pts[holders[0]] >= 8 ? holders[0] : null;
}

/** CPU が出す 1 枚。必ず `legalCards` の中から選ぶ */
export function chooseCpuCard(state: RoundState, player: number, level: Level): Card {
  const legal = legalCards(state, player);
  if (legal.length === 0) throw new Error('出せる札が無い');
  if (legal.length === 1) return legal[0];
  const hand = state.hands[player];
  const threat = level === 'strong' ? moonThreat(state, player) : null;

  // リード
  if (state.trick.length === 0) {
    const hasQueen = hand.some(isQueenOfSpades);
    if (!state.heartsBroken && !hasQueen && !queenGone(state)) {
      // ♠Q を持っている相手に♠を引かせる。Q より下の♠で出る
      const lowSpades = legal.filter((c) => c.suit === 'spade' && strength(c.rank) < 12);
      if (lowSpades.length > 0) return lowest(lowSpades);
    }
    // 自分が最も少ない枚数しか持たないスートの低い札（早く切らしてディスカードできるようにする）
    const count = (s: Suit) => hand.filter((c) => c.suit === s).length;
    const bySuit = [...legal].sort(
      (a, b) => count(a.suit) - count(b.suit) || strength(a.rank) - strength(b.rank),
    );
    return bySuit[0];
  }

  const led = state.trick[0].card.suit;
  const winning = state.trick
    .filter((p) => p.card.suit === led)
    .reduce((a, b) => (strength(b.card.rank) > strength(a.card.rank) ? b : a));
  const high = strength(winning.card.rank);
  const trickHasPoints = state.trick.some((p) => isPointCard(p.card));
  const last = state.trick.length === PLAYER_COUNT - 1;

  // フォロー（台札のスートがある）
  if (legal[0].suit === led) {
    const winners = legal.filter((c) => strength(c.rank) > high);
    // シュートザムーンを止める：狙っている人が取りそうな点入りのトリックを横取りする
    if (threat !== null && winning.player === threat && trickHasPoints && winners.length > 0) {
      return highest(winners);
    }
    const under = legal.filter((c) => strength(c.rank) < high);
    if (last && !trickHasPoints) {
      // 最後の手番で点が乗っていないなら、高い札をここで処理する（♠Q だけは自分で取らない）
      const safe = legal.filter((c) => !isQueenOfSpades(c));
      if (safe.length > 0) return highest(safe);
    }
    if (under.length > 0) return highest(under);
    if (last) {
      // どれを出しても取るなら、高い札を処理しておく
      const safe = legal.filter((c) => !isQueenOfSpades(c));
      if (safe.length > 0) return highest(safe);
    }
    return lowest(legal);
  }

  // ディスカード（台札のスートが無い）
  const threatWins = threat !== null && winning.player === threat;
  const pool = threatWins ? legal.filter((c) => !isPointCard(c)) : legal;
  const from = pool.length > 0 ? pool : legal;
  const queen = from.find(isQueenOfSpades);
  if (queen) return queen;
  const hearts = from.filter((c) => c.suit === 'heart');
  if (hearts.length > 0) return highest(hearts);
  const bigSpades = from.filter((c) => c.suit === 'spade' && strength(c.rank) > 12);
  if (bigSpades.length > 0) return highest(bigSpades);
  return highest(from);
}

/** 札の読み上げ用の名前（♠Q など） */
export function cardName(card: Card): string {
  const suit = { spade: '♠', heart: '♥', diamond: '♦', club: '♣' }[card.suit];
  const rank = ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' } as Record<number, string>)[card.rank] ?? String(card.rank);
  return `${suit}${rank}`;
}
