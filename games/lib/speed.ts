/**
 * スピードのロジック（配り・場札・台札・手詰まりの合図・CPU）
 *
 * 仕様: docs/features/game-speed.md
 *
 * 「スピード」（Speed / Spit）は伝統的なトランプ2人遊びの一般名称で、ルールにも
 * 名称にも権利者がいない。商標の問題は無い（games/CLAUDE.md の名称の約束）。
 *
 * ## 設計
 *
 * - 札は `lib/cards.ts` の `Card` をそのまま使い、絵柄も `app/_cards/CardView` を再利用する
 * - 状態はすべてイミュータブル。`applyPlay` / `applyFlip` は新しい局面を返す
 *   （大富豪・七並べ・神経衰弱と同じ約束）
 * - **手番が無い。** サイト初のリアルタイム面なので、`turn` を持たない代わりに
 *   「その札をいま出せるか」（`playableTargets`）だけで進行を決める。
 *   人間の操作もCPUのタイマーも、同じ `applyPlay` を通す
 * - **`applyPlay` は不正な手を黙って捨てる**（同じ局面を返す）。リアルタイムでは
 *   人間のタップとCPUのタイマーが同じ台札を同時に狙うので、後から来たほうが
 *   自然に弾かれる形にしてある（画面側で調停しない）
 * - **場札は4枠固定**。出すと `null` になり、山札があればその場で補充する。
 *   枠を詰めないのは、指を置いた位置の札が入れ替わって誤タップになるのを防ぐため
 * - 乱数は注入できる（`seededRng` でテストから固定する）
 *
 * ## CPU
 *
 * 強さは**反応の速さ**（`cpuDelay`）と**見落とし率**（`MISS_RATE`）の2つで表す。
 * 最強でも 0.5 秒は待つ（仕様の「人間らしい遅延を残し、理不尽さを避ける」）。
 * CPUは相手の山札のような隠し情報を見ない。見るのは公開されている台札と自分の場札だけ。
 *
 * ## v1で入れないもの（仕様書の「やらないこと」）
 *
 * - オンライン対戦
 * - 同一端末での対人2人プレイ（両者が同時に手を動かすため1画面では成立しない）
 * - ジョーカー入りなどのローカルルール
 */

import { makeDeck, RANK_LABEL, shuffle, SUIT_SYMBOL, type Card, type Rank } from './cards';

// ---------------------------------------------------------------- 設定

/** CPUの強さ */
export type CpuLevel = 'easy' | 'normal' | 'hard';
export const CPU_LEVELS: readonly CpuLevel[] = ['easy', 'normal', 'hard'];

export const LEVEL_LABELS: Record<CpuLevel, string> = {
  easy: '弱',
  normal: '普通',
  hard: '強',
};

/**
 * CPUが「出せる札を見つけてから出すまで」の遅延（ミリ秒）。
 *
 * この幅から毎回引き直す（`cpuDelay`）。**強でも 0.5 秒は待つ**のは、
 * 出せる札が現れた瞬間に必ず先を越されると人間側に勝ち目が無くなるため（仕様書）。
 * 反射のゲームなので、ここが実質そのまま難易度になる。
 */
export const DELAY_MS: Record<CpuLevel, { min: number; max: number }> = {
  easy: { min: 1600, max: 2600 },
  normal: { min: 900, max: 1600 },
  hard: { min: 500, max: 900 },
};

/**
 * 1回の判断で、出せる札を見落とす確率。
 *
 * 遅延だけで強さを作ると「必ず一定間隔で正確に出す機械」になり、
 * 弱くしても不自然な相手になる。人間が見落とすのと同じように取りこぼさせる。
 */
export const MISS_RATE: Record<CpuLevel, number> = {
  easy: 0.5,
  normal: 0.3,
  hard: 0.15,
};

/** 難易度の説明。設定パネルと解説ページの単一の情報源 */
export const LEVEL_NOTES: Record<CpuLevel, string> = {
  easy: `出せる札に気づくまで${(DELAY_MS.easy.min / 1000).toFixed(1)}〜${(DELAY_MS.easy.max / 1000).toFixed(1)}秒かかり、半分は見落とします。まず勝てます`,
  normal: `出せる札に気づくまで${(DELAY_MS.normal.min / 1000).toFixed(1)}〜${(DELAY_MS.normal.max / 1000).toFixed(1)}秒。取りこぼしもある互角の相手`,
  hard: `出せる札に気づくまで${(DELAY_MS.hard.min / 1000).toFixed(1)}〜${(DELAY_MS.hard.max / 1000).toFixed(1)}秒。ほとんど見落としません`,
};

/** 席番号。0が人間・1がCPU。台札も同じ番号で「どちら側の台札か」を表す */
export const HUMAN = 0;
export const CPU = 1;

/** 場札の枚数（標準ルール） */
export const HAND_SIZE = 4;

/** 台札の数。左が人間側、右がCPU側 */
export const PILE_COUNT = 2;

/** 1人に配る枚数。52枚を2人で分ける */
export const DEAL_SIZE = 26;

export interface Options {
  level: CpuLevel;
}

export const DEFAULT_OPTIONS: Options = { level: 'normal' };

/** 記録の区分。強さごとに別の記録として持つ（仕様の `cpu-{強さ}`） */
export function variantOf(options: Options): string {
  return `cpu-${options.level}`;
}

/** 読み上げ・aria-label 用の表示名 */
export function cardLabel(card: Card): string {
  return `${SUIT_SYMBOL[card.suit]}${RANK_LABEL[card.rank]}`;
}

// ---------------------------------------------------------------- 局面

export interface SpeedState {
  level: CpuLevel;
  /**
   * 台札（中央の2つ）。末尾が一番上で、空なら合図の前。
   * 添字は「どちら側の台札か」＝手詰まりのときにめくる山札の持ち主（0が人間側）。
   *
   * 遊びに要るのは一番上だけだが、**下に重なった札も捨てずに持つ**。
   * 52枚が常に52枚であることを局面だけで確かめられるようにするため
   * （`tests/speed.test.ts` の通しテストがこれを見張っている）。
   */
  piles: Card[][];
  /** 各自の山札。末尾が次にめくる札 */
  stocks: Card[][];
  /** 各自の場札。4枠固定で、出した枠は補充されるまで null */
  hands: (Card | null)[][];
  /** 出した枚数（表示用） */
  played: number[];
  /** 合図（台札のめくり）を済ませて対戦が始まっているか */
  started: boolean;
  finished: boolean;
  /** 勝った人。引き分けなら null */
  winner: number | null;
  /** 山札が尽きて手詰まりのまま決着したか（表示の文言を変えるため） */
  deadlocked: boolean;
}

/**
 * 新しい局面を作る。
 *
 * 52枚を26枚ずつに分け、各自 場札4枚 ＋ 山札22枚 にする。
 * 台札はまだ置かない。**最初の台札も「合図で山札から1枚ずつ」で置く**
 * （`applyFlip`）ので、本物と同じく双方が同時にスタートできる。
 * 台札を置いた時点で山札は21枚になり、26 = 場札4 ＋ 山札21 ＋ 台札1 になる。
 */
export function newGame(
  options: Options = DEFAULT_OPTIONS,
  rng: () => number = Math.random,
): SpeedState {
  const deck = shuffle(makeDeck(), rng);
  const halves = [deck.slice(0, DEAL_SIZE), deck.slice(DEAL_SIZE)];
  return {
    level: options.level,
    piles: Array.from({ length: PILE_COUNT }, () => []),
    // 末尾から引くので、場札に配るのも末尾から
    stocks: halves.map((half) => half.slice(0, DEAL_SIZE - HAND_SIZE)),
    hands: halves.map((half) =>
      half.slice(DEAL_SIZE - HAND_SIZE).map((card) => ({ ...card, faceUp: true })),
    ),
    played: [0, 0],
    started: false,
    finished: false,
    winner: null,
    deadlocked: false,
  };
}

/** 場に残っている枚数（山札＋場札）。0になった人の勝ち */
export function remainingCards(state: SpeedState, player: number): number {
  return state.stocks[player].length + state.hands[player].filter((c) => c !== null).length;
}

/**
 * その2枚の数字がつながっているか。
 *
 * 差が1、または A（1）と K（13）。13を法にした隣り合わせなので、
 * 差が 1 か 12 のときにつながる（標準ルール）。
 */
export function connects(a: Rank, b: Rank): boolean {
  const diff = Math.abs(a - b);
  return diff === 1 || diff === 12;
}

/** 台札の一番上の札。まだ1枚も置いていなければ null */
export function pileTop(state: SpeedState, pile: number): Card | null {
  const stack = state.piles[pile];
  if (!stack || stack.length === 0) return null;
  return stack[stack.length - 1];
}

/**
 * その場札を出せる台札の番号。出せなければ空。
 *
 * 台札がまだ空（合図の前）なら、どこにも出せない。
 */
export function playableTargets(state: SpeedState, player: number, slot: number): number[] {
  const card = state.hands[player]?.[slot];
  if (!card || !state.started || state.finished) return [];
  const out: number[] = [];
  for (let pile = 0; pile < state.piles.length; pile += 1) {
    const top = pileTop(state, pile);
    if (top && connects(card.rank, top.rank)) out.push(pile);
  }
  return out;
}

/** その人がいま出せる手（場札の枠と台札の組み合わせ）をすべて挙げる */
export function playableMoves(state: SpeedState, player: number): { slot: number; pile: number }[] {
  const out: { slot: number; pile: number }[] = [];
  for (let slot = 0; slot < HAND_SIZE; slot += 1) {
    for (const pile of playableTargets(state, player, slot)) out.push({ slot, pile });
  }
  return out;
}

/** その人がいま1枚でも出せるか */
export function canPlay(state: SpeedState, player: number): boolean {
  return playableMoves(state, player).length > 0;
}

/**
 * 双方とも出せない（手詰まり）か。
 *
 * 判定は**局面だけ**で決まる。CPUが見落としているあいだは手詰まりではない
 * （人間が出せる札を残しているので、勝手に台札がめくられては困る）。
 */
export function isStuck(state: SpeedState): boolean {
  if (!state.started || state.finished) return false;
  return !canPlay(state, HUMAN) && !canPlay(state, CPU);
}

/** 合図で台札にめくれる山札が1枚も残っていない（＝これ以上進めない） */
export function isDeadlock(state: SpeedState): boolean {
  return isStuck(state) && state.stocks.every((stock) => stock.length === 0);
}

/** 山札の末尾から1枚引く。無ければ null */
function draw(stock: Card[]): { card: Card | null; rest: Card[] } {
  if (stock.length === 0) return { card: null, rest: stock };
  return { card: { ...stock[stock.length - 1], faceUp: true }, rest: stock.slice(0, -1) };
}

/**
 * 手詰まりの合図。**最初のスタートもこれ**（台札が空の状態から始める）。
 *
 * 台札には持ち主の山札からめくる。**持ち主の山札が尽きていたら相手の山札から出す**
 * （標準ルール。片方が場札だけになっても対戦を続けられるようにするため）。
 *
 * どちらの山札にも札が無ければ、これ以上進めない。残り枚数の少ないほうの勝ちとし、
 * 同じなら引き分けにする（`deadlocked`）。仕様書に書かれていない場面だが、
 * 画面が固まる以外の選択肢が無いので局面の側で決着させている。
 */
export function applyFlip(state: SpeedState): SpeedState {
  if (state.finished) return state;
  if (state.started && !isStuck(state)) return state;

  if (state.started && isDeadlock(state)) {
    const mine = remainingCards(state, HUMAN);
    const theirs = remainingCards(state, CPU);
    return {
      ...state,
      finished: true,
      deadlocked: true,
      winner: mine === theirs ? null : mine < theirs ? HUMAN : CPU,
    };
  }

  const stocks = state.stocks.map((s) => [...s]);
  const piles = [...state.piles];
  for (let pile = 0; pile < piles.length; pile += 1) {
    // 持ち主の山札を先に使い、尽きていたら相手の山札から出す
    const from = stocks[pile].length > 0 ? pile : (pile + 1) % stocks.length;
    const { card, rest } = draw(stocks[from]);
    if (!card) continue;
    stocks[from] = rest;
    piles[pile] = [...piles[pile], card];
  }

  const next: SpeedState = { ...state, piles, stocks, started: true };
  // 合図で山札が尽きた人が、そのまま出し切っていることがある
  return settle(next);
}

/** 出し切った人がいれば決着させる */
function settle(state: SpeedState): SpeedState {
  if (state.finished) return state;
  for (const player of [HUMAN, CPU]) {
    if (remainingCards(state, player) === 0) {
      return { ...state, finished: true, winner: player };
    }
  }
  return state;
}

/**
 * 場札を1枚、台札へ出す。
 *
 * 出せない手（他人に先を越された・そもそもつながっていない）は**黙って捨てて
 * 同じ局面を返す**。リアルタイムなので、人間のタップとCPUのタイマーが
 * 同じ台札を同時に狙う場面が普通に起きる。先に届いたほうが通り、
 * 後から来たほうがここで弾かれる。
 *
 * 出した枠は、山札が残っていればその場で補充する（枠は詰めない）。
 */
export function applyPlay(
  state: SpeedState,
  player: number,
  slot: number,
  pile: number,
): SpeedState {
  if (!playableTargets(state, player, slot).includes(pile)) return state;

  const card = state.hands[player][slot] as Card;
  const { card: refill, rest } = draw(state.stocks[player]);

  const piles = state.piles.map((stack, i) => (i === pile ? [...stack, card] : stack));
  const stocks = state.stocks.map((s, i) => (i === player ? rest : s));
  const hands = state.hands.map((hand, i) =>
    i === player ? hand.map((c, j) => (j === slot ? refill : c)) : hand,
  );
  const played = state.played.map((n, i) => (i === player ? n + 1 : n));

  return settle({ ...state, piles, stocks, hands, played });
}

/** 人間から見た勝敗。決着していなければ null */
export function outcome(state: SpeedState): 'win' | 'loss' | 'draw' | null {
  if (!state.finished) return null;
  if (state.winner === HUMAN) return 'win';
  if (state.winner === CPU) return 'loss';
  return 'draw';
}

// ---------------------------------------------------------------- CPU

/**
 * CPUが次の判断までに置く間（ミリ秒）。
 * 強さの幅（`DELAY_MS`）から毎回引き直すので、間隔が一定にならない。
 */
export function cpuDelay(level: CpuLevel, rng: () => number = Math.random): number {
  const { min, max } = DELAY_MS[level];
  return min + rng() * (max - min);
}

/**
 * CPUが出す手。出せる札が無い、または今回は見落としたなら null。
 *
 * 出せる手を1つずつ `MISS_RATE` で見落としていき、残ったものから選ぶ。
 * 見落としても局面は変わらないので、画面側は次の間（`cpuDelay`）を置いて
 * もう一度呼べばよい（＝取りこぼしがそのまま遅れになる）。
 */
export function chooseCpuPlay(
  state: SpeedState,
  rng: () => number = Math.random,
): { slot: number; pile: number } | null {
  if (state.finished || !state.started) return null;
  const moves = playableMoves(state, CPU).filter(() => rng() >= MISS_RATE[state.level]);
  if (moves.length === 0) return null;
  return moves[Math.min(moves.length - 1, Math.floor(rng() * moves.length))];
}
