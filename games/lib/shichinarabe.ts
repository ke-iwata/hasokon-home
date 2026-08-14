/**
 * 七並べのロジック（場・手札・パス・失格・CPU）
 *
 * 仕様: docs/features/game-shichinarabe.md
 *
 * 「七並べ」（Sevens / Fan Tan）は伝統的なトランプ遊びの一般名称で、ルールにも
 * 名称にも権利者がいない。商標の問題は無い（games/CLAUDE.md の名称の約束）。
 *
 * ## 設計
 *
 * - 札は `lib/cards.ts` の `Card` をそのまま使う。ジョーカーを使わないので
 *   大富豪（`lib/daifugo.ts`）のような専用の型は要らない
 * - 場は「スート×ランクが置かれているか」の真偽値の表（`Board`）で持つ。
 *   端（low/high）の数値2つで持つ形にすると、失格者の手札をまとめて開くときに
 *   飛び地ができて表せない。**表で持てば飛び地も素直に書ける**
 * - 状態はすべてイミュータブル。`applyPlay` / `applyPass` は新しい局面を返す
 *   （大富豪・リバーシと同じ約束）
 * - 乱数は注入できる（`seededRng` でテストから固定する）
 *
 * ## v1で入れないもの（仕様書の「やらないこと」）
 *
 * - ジョーカー入り・どぼん等のローカルルール。パス3回・トンネルのみ
 * - オンライン対人戦。CPU対戦だけ
 * - 大富豪とのUIの共通化。2本目なので素直に別々に持つ
 */

import {
  makeDeck,
  RANK_LABEL,
  shuffle,
  SUITS,
  SUIT_SYMBOL,
  type Card,
  type Rank,
  type Suit,
} from './cards';

// ---------------------------------------------------------------- 定数

/** 卓につく人数。1人 ＋ CPU3人 */
export const PLAYER_COUNT = 4;
/** 1試合の回戦数。通算点で総合成績を決める */
export const ROUNDS = 5;
/** 最初に場に並ぶ数字 */
export const START_RANK = 7 as Rank;
/**
 * パスできる回数。4回目のパスで失格になる。
 * 「3回まで」は七並べのいちばん一般的な取り決め（仕様書のルール初版）
 */
export const PASS_LIMIT = 3;

/** 順位の表示名。大富豪と違って階級名は使わない */
export const PLACE_LABELS = ['1位', '2位', '3位', '4位'] as const;
/** 通算点。1位から 3・2・1・0 点（大富豪と揃えてある） */
export const PLACE_POINTS = [3, 2, 1, 0] as const;

/** 読み上げ・aria-label 用の表示名 */
export function cardLabel(card: Card): string {
  return `${SUIT_SYMBOL[card.suit]}${RANK_LABEL[card.rank]}`;
}

// ---------------------------------------------------------------- ルール

/** ローカルルールの ON/OFF。初版はトンネルだけ */
export interface Rules {
  /** AとKをつなげる（Kの隣にAを置ける・Aの隣にKを置ける） */
  tunnel: boolean;
}

export const DEFAULT_RULES: Rules = {
  tunnel: false,
};

/** 設定パネルと解説ページの単一の情報源 */
export const RULE_LABELS: { key: keyof Rules; label: string; note: string }[] = [
  {
    key: 'tunnel',
    label: 'トンネル',
    note: 'AとKがつながります（例: ♠K を置いたあと ♠A を出せる）。OFFのときは A が下端、K が上端で行き止まりです',
  },
];

// ---------------------------------------------------------------- 場

/** 場に置かれた札。`board[suit][rank]` が true なら置かれている（添字0は使わない） */
export type Board = Record<Suit, boolean[]>;

export function emptyBoard(): Board {
  return {
    spade: Array(14).fill(false),
    heart: Array(14).fill(false),
    diamond: Array(14).fill(false),
    club: Array(14).fill(false),
  };
}

function copyBoard(board: Board): Board {
  return {
    spade: [...board.spade],
    heart: [...board.heart],
    diamond: [...board.diamond],
    club: [...board.club],
  };
}

export function isPlaced(board: Board, suit: Suit, rank: Rank): boolean {
  return board[suit][rank];
}

/**
 * その数字の隣（場につながる位置）。
 * トンネルONのときだけ A と K が隣どうしになる。
 */
export function neighbors(rank: Rank, tunnel: boolean): Rank[] {
  const list: Rank[] = [];
  if (rank > 1) list.push((rank - 1) as Rank);
  if (rank < 13) list.push((rank + 1) as Rank);
  if (tunnel && rank === 1) list.push(13);
  if (tunnel && rank === 13) list.push(1);
  return list;
}

/**
 * その札を場に置けるか。
 *
 * 隣がすでに置かれていれば置ける。7から連続した並びだけでなく、
 * 失格者の手札を開いてできた飛び地の隣にも置ける（実際の七並べと同じ）。
 */
export function canPlace(board: Board, card: Card, tunnel: boolean): boolean {
  if (isPlaced(board, card.suit, card.rank)) return false;
  return neighbors(card.rank, tunnel).some((r) => board[card.suit][r]);
}

// ---------------------------------------------------------------- 札

/** 52枚（ジョーカー無し）を表向きで作る */
export function makeSevensDeck(): Card[] {
  return makeDeck(1).map((card) => ({ ...card, faceUp: true }));
}

/** スート順・数字順に並べる。手札の表示がちらつかないように安定させる */
export function sortHand(cards: readonly Card[]): Card[] {
  return [...cards].sort(
    (a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || a.rank - b.rank,
  );
}

/** 52枚を4人にちょうど13枚ずつ配る */
export function dealCards(deck: readonly Card[], playerCount = PLAYER_COUNT): Card[][] {
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  deck.forEach((card, i) => hands[i % playerCount].push(card));
  return hands.map(sortHand);
}

/** ♦7 を持っている人。その回戦の親になる（無ければ0番） */
export function diamondSevenHolder(hands: readonly Card[][]): number {
  const found = hands.findIndex((hand) =>
    hand.some((c) => c.suit === 'diamond' && c.rank === START_RANK),
  );
  return found < 0 ? 0 : found;
}

// ---------------------------------------------------------------- 局面

/** 場に起きた出来事。画面の実況に出す */
export type EventKind = 'place' | 'pass' | 'eliminate' | 'out';

export interface GameEvent {
  kind: EventKind;
  player: number;
}

/** 失格した人と、失格した時点の残り枚数（順位のつけ方に使う） */
export interface Eliminated {
  player: number;
  left: number;
}

export interface RoundState {
  rules: Rules;
  hands: Card[][];
  board: Board;
  /** 手番。決着後は意味を持たない */
  turn: number;
  /** 使ったパスの数。PASS_LIMIT を超えると失格 */
  passes: number[];
  /** 勝ち抜けた順のプレイヤー番号（最後に残った1人もここに入る） */
  out: number[];
  /** 失格した順 */
  eliminated: Eliminated[];
  finished: boolean;
  /** 直前の着手で起きたこと */
  events: GameEvent[];
  /** 直前に置かれた札（画面で光らせる） */
  last: { suit: Suit; rank: Rank } | null;
}

/**
 * 回戦を始める。**全員の7が自動で場に出る**（七並べの決まり）。
 * 親は ♦7 を持っていた人。
 */
export function startRound(hands: Card[][], rules: Rules = DEFAULT_RULES): RoundState {
  const board = emptyBoard();
  const first = diamondSevenHolder(hands);
  const rest = hands.map((hand) => {
    for (const card of hand) {
      if (card.rank === START_RANK) board[card.suit][card.rank] = true;
    }
    return sortHand(hand.filter((c) => c.rank !== START_RANK));
  });
  return {
    rules,
    hands: rest,
    board,
    turn: first,
    passes: rest.map(() => 0),
    out: [],
    eliminated: [],
    finished: false,
    events: [],
    last: null,
  };
}

/** まだ手札を持っていて、勝ち抜けても失格してもいない人 */
export function activePlayers(state: RoundState): number[] {
  const done = new Set([...state.out, ...state.eliminated.map((e) => e.player)]);
  return Array.from({ length: state.hands.length }, (_, i) => i).filter((i) => !done.has(i));
}

/**
 * その回戦の順位（上位から）。
 *
 * 勝ち抜けた人が上で、失格した人はその下。失格どうしは
 * **失格した時点の残り枚数が少ないほうが上**（同数なら後から失格したほうが上）。
 */
export function standings(state: RoundState): number[] {
  const losers = state.eliminated
    .map((e, order) => ({ ...e, order }))
    .sort((a, b) => a.left - b.left || b.order - a.order)
    .map((e) => e.player);
  return [...state.out, ...losers];
}

/** その人がいま場に出せる札 */
export function playableCards(state: RoundState, player: number): Card[] {
  return state.hands[player].filter((card) => canPlace(state.board, card, state.rules.tunnel));
}

/** その札をいま出せるか（手番・手札にあること・場につながること） */
export function isLegalPlay(state: RoundState, card: Card): boolean {
  if (state.finished) return false;
  if (!state.hands[state.turn].some((c) => c.id === card.id)) return false;
  return canPlace(state.board, card, state.rules.tunnel);
}

/** 手番を次の人へ回す。勝ち抜け・失格した人は飛ばす */
function nextTurn(state: RoundState, from: number): number {
  const active = activePlayers(state);
  if (active.length === 0) return from;
  for (let step = 1; step <= state.hands.length; step += 1) {
    const seat = (from + step) % state.hands.length;
    if (active.includes(seat)) return seat;
  }
  return from;
}

/**
 * 決着したかを見て、必要なら最後の1人を順位に入れる。
 *
 * 残り1人になった時点で勝負はついている（その人は自動的に最下位の勝ち抜け扱い）。
 * 手札が残っていても、続けさせても順位は変わらないので回戦を終える。
 */
function settle(state: RoundState): RoundState {
  const active = activePlayers(state);
  if (active.length > 1) return state;
  if (active.length === 1) {
    return { ...state, out: [...state.out, active[0]], finished: true };
  }
  return { ...state, finished: true };
}

/** 札を1枚置く */
export function applyPlay(state: RoundState, card: Card): RoundState {
  if (!isLegalPlay(state, card)) return state;
  const player = state.turn;
  const board = copyBoard(state.board);
  board[card.suit][card.rank] = true;
  const hands = state.hands.map((hand, i) =>
    i === player ? hand.filter((c) => c.id !== card.id) : hand,
  );
  const events: GameEvent[] = [{ kind: 'place', player }];
  const out = [...state.out];
  if (hands[player].length === 0) {
    out.push(player);
    events.push({ kind: 'out', player });
  }
  const next = settle({
    ...state,
    hands,
    board,
    out,
    events,
    last: { suit: card.suit, rank: card.rank },
  });
  return next.finished ? next : { ...next, turn: nextTurn(next, player) };
}

/**
 * パスする。
 *
 * PASS_LIMIT を超えたら失格。**失格した人の手札はすべて場に開く**ので、
 * 止まっていた並びが一気につながる（ここが七並べの山場）。
 */
export function applyPass(state: RoundState): RoundState {
  if (state.finished) return state;
  const player = state.turn;
  const passes = [...state.passes];
  passes[player] += 1;

  if (passes[player] <= PASS_LIMIT) {
    const next = { ...state, passes, events: [{ kind: 'pass' as const, player }], last: null };
    return { ...next, turn: nextTurn(next, player) };
  }

  // 4回目のパス＝失格。手札を全部場に開いて、順位を確定させる
  const board = copyBoard(state.board);
  for (const card of state.hands[player]) board[card.suit][card.rank] = true;
  const left = state.hands[player].length;
  const hands = state.hands.map((hand, i) => (i === player ? [] : hand));
  const next = settle({
    ...state,
    hands,
    board,
    passes,
    eliminated: [...state.eliminated, { player, left }],
    events: [{ kind: 'eliminate', player }],
    last: null,
  });
  return next.finished ? next : { ...next, turn: nextTurn(next, player) };
}

// ---------------------------------------------------------------- CPU

/**
 * 「止め札」の評価に使う、その札より外側（7から遠い側）の数字。
 * トンネルONのときは K の外側に A、A の外側に K がつながる。
 */
export function beyond(rank: Rank, tunnel: boolean): Rank[] {
  const list: Rank[] = [];
  if (rank === START_RANK) return list;
  if (rank > START_RANK) {
    for (let r = rank + 1; r <= 13; r += 1) list.push(r as Rank);
    if (tunnel) list.push(1 as Rank);
  } else {
    for (let r = rank - 1; r >= 1; r -= 1) list.push(r as Rank);
    if (tunnel) list.push(13 as Rank);
  }
  return list;
}

/**
 * その札を出したときの損得。**小さいほど気持ちよく出せる手**。
 *
 * - 外側にある「自分が持っていない札」の数だけ、相手を助けることになる（＋）
 * - 外側が自分の札で続いているなら、出しても自分の番が続く形なので割引（−）
 *
 * 相手の手札は見ない。場に無く自分も持っていない札＝誰かが持っている札、
 * という**公開情報だけ**から見積もる（カンニングしないための約束）。
 */
export function playCost(state: RoundState, player: number, card: Card): number {
  const mine = new Set(state.hands[player].map((c) => `${c.suit}-${c.rank}`));
  const outer = beyond(card.rank, state.rules.tunnel);
  let opens = 0;
  for (const rank of outer) {
    if (state.board[card.suit][rank]) continue;
    if (!mine.has(`${card.suit}-${rank}`)) opens += 1;
  }
  // 外側が自分の札で何枚続いているか（続くほど出しても場を渡さない）
  let chain = 0;
  for (const rank of outer) {
    if (!mine.has(`${card.suit}-${rank}`)) break;
    chain += 1;
  }
  return opens - chain * 2;
}

/**
 * CPUの性格。3人に別々の性格を割り当てて、同じ卓でも打ち回しが変わるようにする。
 *
 * 大富豪のような「強さ3段階」は付けていない。七並べは選べる手が
 * 各スート1枚ずつに限られるため、強さを段階にしても差が出にくく、
 * **止め札をいつまで止めるか**の性格差のほうが遊びとして分かりやすい
 * （仕様書「CPU」の方針）。
 */
export interface CpuStyle {
  id: string;
  label: string;
  note: string;
  /** これ以上「相手を助ける」手しか無いときはパスで止める（大きいほど止めない） */
  holdAt: number;
  /** 温存しておきたいパスの数（失格しないための保険） */
  keepPasses: number;
}

export const CPU_STYLES: readonly CpuStyle[] = [
  {
    id: 'hasty',
    label: 'せっかち',
    note: '出せる札はためらわずに出す。パスは出せないときだけ',
    holdAt: Number.POSITIVE_INFINITY,
    keepPasses: 0,
  },
  {
    id: 'steady',
    label: 'しんちょう',
    note: '相手を助ける手は少し止める。パスは1回ぶん残しておく',
    holdAt: 4,
    keepPasses: 1,
  },
  {
    id: 'blocker',
    label: 'いじわる',
    note: '止め札をぎりぎりまで抱えて、パスも使い切る',
    holdAt: 2,
    keepPasses: 0,
  },
] as const;

/** 席ごとの性格。0番はプレイヤーなので使わない */
export function styleOf(player: number): CpuStyle {
  return CPU_STYLES[(player - 1 + CPU_STYLES.length) % CPU_STYLES.length];
}

export interface CpuOptions {
  rng?: () => number;
}

/**
 * CPUの着手を選ぶ。パスするときは null。
 *
 * - 出せる札が無ければパス（強制）
 * - 出せば上がれるなら必ず出す
 * - 誰かの手札が残り2枚以下なら止めずに出す（止めても間に合わない）
 * - それ以外は損得（`playCost`）がいちばん小さい手。
 *   その手すら損なら、性格に応じてパスで止める
 */
export function chooseCpuPlay(
  state: RoundState,
  style: CpuStyle,
  opts: CpuOptions = {},
): Card | null {
  const rng = opts.rng ?? Math.random;
  const player = state.turn;
  const playable = playableCards(state, player);
  if (playable.length === 0) return null;

  const hand = state.hands[player];
  // 出せば上がれる手は必ず出す
  if (hand.length === 1) return playable[0];

  const scored = playable
    .map((card) => ({ card, cost: playCost(state, player, card) }))
    .sort((a, b) => a.cost - b.cost);
  // 同じ損得の手が並んだときだけ、どれを選ぶかを乱数で散らす
  const best = scored.filter((s) => s.cost === scored[0].cost);
  const pick = best[Math.min(best.length - 1, Math.floor(rng() * best.length))];

  const rush = activePlayers(state).some((i) => i !== player && state.hands[i].length <= 2);
  const passesLeft = PASS_LIMIT - state.passes[player];
  if (!rush && pick.cost >= style.holdAt && passesLeft > style.keepPasses) return null;

  return pick.card;
}

// ---------------------------------------------------------------- 試合

export interface MatchState {
  rules: Rules;
  /** 1〜ROUNDS */
  round: number;
  /** 通算点 */
  scores: number[];
  /** 前回の順位（上位から並んだプレイヤー番号）。1回戦の前は空 */
  lastStandings: number[];
  /** その回戦の局面 */
  state: RoundState;
  /** ROUNDS 回戦ぶんが終わった */
  finished: boolean;
}

/** 新しい試合を始める（1回戦を配る） */
export function newMatch(rules: Rules, rng: () => number = Math.random): MatchState {
  const hands = dealCards(shuffle(makeSevensDeck(), rng));
  return {
    rules,
    round: 1,
    scores: Array.from({ length: PLAYER_COUNT }, () => 0),
    lastStandings: [],
    state: startRound(hands, rules),
    finished: false,
  };
}

/** 回戦が終わったときの得点を足して、順位を控える */
export function finishRound(match: MatchState): MatchState {
  if (!match.state.finished) return match;
  const order = standings(match.state);
  const scores = [...match.scores];
  order.forEach((player, place) => {
    scores[player] += PLACE_POINTS[Math.min(place, PLACE_POINTS.length - 1)];
  });
  return {
    ...match,
    scores,
    lastStandings: order,
    finished: match.round >= ROUNDS,
  };
}

/** 次の回戦を始める。配り直して、また ♦7 の人から */
export function startNextRound(match: MatchState, rng: () => number = Math.random): MatchState {
  if (match.finished) return match;
  const hands = dealCards(shuffle(makeSevensDeck(), rng));
  return {
    ...match,
    round: match.round + 1,
    state: startRound(hands, match.rules),
  };
}

/**
 * 通算点から総合順位を決める。同点は前回の順位が上のほうを上に置く
 * （大富豪と同じ決め方）。
 */
export function matchStandings(match: MatchState): number[] {
  const tieBreak = (player: number) => {
    const place = match.lastStandings.indexOf(player);
    return place < 0 ? PLAYER_COUNT : place;
  };
  return Array.from({ length: PLAYER_COUNT }, (_, i) => i).sort(
    (a, b) => match.scores[b] - match.scores[a] || tieBreak(a) - tieBreak(b),
  );
}

/** そのプレイヤーの総合順位（0が1位） */
export function placeOf(match: MatchState, player: number): number {
  return matchStandings(match).indexOf(player);
}
