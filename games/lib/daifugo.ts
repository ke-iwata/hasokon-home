/**
 * 大富豪のロジック（札・役・場の進行・CPU）
 *
 * 仕様: docs/features/game-daifugo.md
 *
 * 「大富豪（大貧民）」は日本の伝統的なトランプ遊びの一般名称で、ルールも名称も
 * パブリックドメイン。商標の問題は無い（games/CLAUDE.md の名称の約束）。
 *
 * ## 設計
 *
 * - 札は `lib/cards.ts` の `Suit` / `Rank` を使うが、**ジョーカーが要る**ので
 *   `Card` はそのまま使わず、判別可能なユニオン（`DCard`）を別に持つ
 * - 札の強さは「3 が最弱・2 が最強」の並びに変換した **strength（1〜13）** で扱う。
 *   ランクのまま比較すると 3 と 2 の扱いで条件分岐が散らばるため
 * - 状態はすべてイミュータブル。`applyPlay` / `applyPass` は新しい局面を返す
 *   （リバーシ・五目並べと同じ約束。履歴を持つ画面側が壊れない）
 * - 乱数は注入できる（`seededRng` でテストから固定する）
 *
 * ## v1で入れないもの
 *
 * - オンライン対人戦（静的サイトの方針。仕様書の「やらないこと」）
 * - 上がり札の禁止（2・ジョーカーで上がれない等）。説明コストが利益を上回る
 * - 階段革命（5枚以上の階段での革命）。革命は「同じ数字4枚以上」だけにする
 * - カード交換で強い側が渡す札を選ぶこと。**弱い札から自動で渡す**
 *   （選ばせると1画面ぶんの手順が増えるわりに、勝敗への影響が小さい）
 */

import { RANK_LABEL, SUIT_SYMBOL, SUITS, type Rank, type Suit } from './cards';

// ---------------------------------------------------------------- 札

/** 数札。`joker: false` で判別する */
export interface NormalCard {
  id: number;
  joker: false;
  suit: Suit;
  rank: Rank;
}

/** ジョーカー。スートも数字も持たない */
export interface JokerCard {
  id: number;
  joker: true;
}

export type DCard = NormalCard | JokerCard;

/** 卓につく人数。1人 ＋ CPU3人 */
export const PLAYER_COUNT = 4;
/** 1試合の回戦数。通算点で最終の階級を決める */
export const ROUNDS = 5;
/** ジョーカーの枚数 */
export const JOKER_COUNT = 2;

/** ジョーカーの強さ。数札の最大（2＝13）より上 */
export const JOKER_STRENGTH = 14;
/** 数札の強さの上限（2）。階段はこの範囲に収まる */
export const MAX_STRENGTH = 13;

/**
 * 数字を「3が最弱・2が最強」の強さに直す。
 * 3→1, 4→2, ... K→11, A→12, 2→13。
 */
export function rankStrength(rank: Rank): number {
  if (rank === 1) return 12; // A
  if (rank === 2) return 13; // 2
  return rank - 2; // 3〜K
}

/** 強さから数字に戻す（階段の表示・8切りの判定に使う） */
export function strengthRank(strength: number): Rank {
  if (strength === 12) return 1;
  if (strength === 13) return 2;
  return (strength + 2) as Rank;
}

export function strengthOf(card: DCard): number {
  return card.joker ? JOKER_STRENGTH : rankStrength(card.rank);
}

/** 8切りの8、11バックのJ。強さに直した値を1か所で持つ */
export const EIGHT_STRENGTH = rankStrength(8);
export const JACK_STRENGTH = rankStrength(11);

/** 読み上げ・aria-label 用の表示名 */
export function cardLabel(card: DCard): string {
  return card.joker ? 'ジョーカー' : `${SUIT_SYMBOL[card.suit]}${RANK_LABEL[card.rank]}`;
}

/** 54枚（52枚＋ジョーカー2枚）の山。id は 0 から通し番号 */
export function makeDaifugoDeck(): DCard[] {
  const cards: DCard[] = [];
  let id = 0;
  for (const suit of SUITS) {
    for (let rank = 1 as Rank; rank <= 13; rank = (rank + 1) as Rank) {
      cards.push({ id: id++, joker: false, suit, rank });
    }
  }
  for (let i = 0; i < JOKER_COUNT; i += 1) cards.push({ id: id++, joker: true });
  return cards;
}

/** Fisher–Yates。`lib/cards.ts` の shuffle と同じだが、札の型が違うので別に持つ */
export function shuffleCards<T>(cards: readonly T[], rng: () => number = Math.random): T[] {
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 弱い順に並べる。同じ強さはスートで安定させる（表示がちらつかないように） */
export function sortHand(cards: readonly DCard[]): DCard[] {
  const suitOrder = (c: DCard) => (c.joker ? 9 : SUITS.indexOf(c.suit));
  return [...cards].sort((a, b) => strengthOf(a) - strengthOf(b) || suitOrder(a) - suitOrder(b));
}

/**
 * 山を人数ぶんに配る。54枚は4人で割り切れないので、先頭2人が14枚になる。
 * 実際の大富豪と同じで、枚数の差はそのまま受け入れる。
 */
export function dealCards(deck: readonly DCard[], playerCount = PLAYER_COUNT): DCard[][] {
  const hands: DCard[][] = Array.from({ length: playerCount }, () => []);
  deck.forEach((card, i) => hands[i % playerCount].push(card));
  return hands.map(sortHand);
}

// ---------------------------------------------------------------- 役

/** 役の種類。単騎とペアはどちらも「同じ数字の組」なのでまとめる */
export type PlayKind = 'group' | 'sequence';

export interface Play {
  kind: PlayKind;
  cards: DCard[];
  /** 枚数。場の役と一致していなければ出せない */
  count: number;
  /** 比較に使う強さ。組は数字の強さ、階段はいちばん弱い札の強さ */
  strength: number;
  /** 縛りの判定に使うスート（昇順・重複なし）。ジョーカーは持たない */
  suits: Suit[];
  /** ジョーカーだけの役。革命中でも最強として扱う */
  allJokers: boolean;
  /** 8を含む（8切り） */
  hasEight: boolean;
  /** Jを含む（11バック） */
  hasJack: boolean;
  /** ジョーカー1枚だけの単騎（スペ3返しの対象） */
  jokerSingle: boolean;
  /** ♠3 の単騎（スペ3返しの札） */
  spadeThreeSingle: boolean;
}

/** 同じ id の札が混ざっていないか（画面から壊れた選択が来ても落ちないように） */
function hasDuplicateIds(cards: readonly DCard[]): boolean {
  return new Set(cards.map((c) => c.id)).size !== cards.length;
}

function makePlay(
  kind: PlayKind,
  cards: readonly DCard[],
  strength: number,
  covered: readonly number[],
): Play {
  const naturals = cards.filter((c): c is NormalCard => !c.joker);
  const suits = [...new Set(naturals.map((c) => c.suit))].sort(
    (a, b) => SUITS.indexOf(a) - SUITS.indexOf(b),
  );
  const single = cards.length === 1;
  const only = single ? cards[0] : null;
  return {
    kind,
    cards: [...cards],
    count: cards.length,
    strength,
    suits,
    allJokers: naturals.length === 0,
    // ジョーカーだけの役は数字を持たないので、8切りにも11バックにもならない
    hasEight: naturals.length > 0 && covered.includes(EIGHT_STRENGTH),
    hasJack: naturals.length > 0 && covered.includes(JACK_STRENGTH),
    jokerSingle: single && only!.joker,
    spadeThreeSingle: single && !only!.joker && only!.suit === 'spade' && only!.rank === 3,
  };
}

/**
 * 選んだ札が役として成立するかを判定する。成立しなければ null。
 *
 * ## 同じ札の組み合わせが2通りに読めるとき
 *
 * `[♠5, ♠6, ジョーカー]` は「5・6・7の階段」とも「4・5・6の階段」とも読める。
 * **判定は1通りに決め打つ**（下記の規則）。プレイヤーに選ばせると、
 * 同じ選択から複数の役が出てきて画面が複雑になるわりに使う場面が少ない。
 *
 * 1. 「同じ数字の組」に読めるならそちらを優先する
 *    （`[ジョーカー, ジョーカー, ♠5]` は 5 の3枚組。階段としては読まない）
 * 2. 階段は**いちばん弱い札を起点**にし、足りない札はジョーカーで上へ伸ばす。
 *    ただし 2（強さ13）を超えるときだけ、収まるように起点を下げる
 */
export function classify(cards: readonly DCard[]): Play | null {
  if (cards.length === 0 || hasDuplicateIds(cards)) return null;

  const naturals = cards.filter((c): c is NormalCard => !c.joker);
  const jokers = cards.length - naturals.length;

  // ジョーカーだけ。山に2枚しかないので3枚以上は成立しない
  if (naturals.length === 0) {
    if (cards.length > JOKER_COUNT) return null;
    return makePlay('group', cards, JOKER_STRENGTH, []);
  }

  // 同じ数字の組（単騎・ペア・3枚・4枚）。1つの数字は4枚しかないので4枚まで
  const ranks = new Set(naturals.map((c) => c.rank));
  const suits = new Set(naturals.map((c) => c.suit));
  if (ranks.size === 1 && suits.size === naturals.length && cards.length <= 4) {
    const strength = rankStrength(naturals[0].rank);
    return makePlay('group', cards, strength, [strength]);
  }

  // 階段（同じスートの3枚以上の連番）
  if (cards.length < 3) return null;
  if (suits.size !== 1) return null;
  const strengths = naturals.map((c) => rankStrength(c.rank));
  if (new Set(strengths).size !== strengths.length) return null;

  const low = Math.min(...strengths);
  const high = Math.max(...strengths);
  const len = cards.length;
  // 端から端までが枚数に収まらなければ、ジョーカーを足しても連番にならない
  if (high - low + 1 > len) return null;
  // 起点はいちばん弱い札。2（13）を超えてしまうときだけ下げる
  const start = Math.min(low, MAX_STRENGTH - len + 1);
  if (start < 1) return null;

  const covered = Array.from({ length: len }, (_, i) => start + i);
  // 数え漏れの保険。ジョーカーの枚数と穴の数は必ず一致する
  if (len - naturals.length !== jokers) return null;

  return makePlay('sequence', cards, start, covered);
}

// ---------------------------------------------------------------- 場

/** ローカルルールの ON/OFF。初期値は「8切り・革命・縛りON、その他OFF」 */
export interface Rules {
  /** 8を含む役を出すと場が流れ、同じ人がもう一度出す */
  eightCut: boolean;
  /** 同じ数字4枚以上で強さが逆転する */
  revolution: boolean;
  /** 同じスートの構成が続いたら、その場はそのスートしか出せない */
  suitLock: boolean;
  /** 前回の大富豪が1位で上がれなかったら、その場で大貧民に落ちる */
  cityFall: boolean;
  /** Jを含む役を出すと、その場のあいだだけ強さが逆転する */
  jackBack: boolean;
  /** ジョーカー単騎に ♠3 単騎で返せる */
  spadeThree: boolean;
}

export const DEFAULT_RULES: Rules = {
  eightCut: true,
  revolution: true,
  suitLock: true,
  cityFall: false,
  jackBack: false,
  spadeThree: false,
};

/** 設定パネルに出す並びと表示名。ここが画面の単一の情報源 */
export const RULE_LABELS: { key: keyof Rules; label: string; note: string }[] = [
  { key: 'eightCut', label: '8切り', note: '8を含む役を出すと場が流れ、続けて出せます' },
  { key: 'revolution', label: '革命', note: '同じ数字4枚以上で強さが逆転します' },
  { key: 'suitLock', label: '縛り', note: '同じスートが続くと、その場はそのスートだけになります' },
  { key: 'cityFall', label: '都落ち', note: '前回の大富豪が1位で上がれないと大貧民に落ちます' },
  { key: 'jackBack', label: '11バック', note: 'Jを含む役を出すと、その場だけ強さが逆転します' },
  { key: 'spadeThree', label: 'スペ3返し', note: 'ジョーカー単騎に ♠3 で返せます' },
];

/** 4人戦の階級。平民は出てこない */
export const RANK_LABELS = ['大富豪', '富豪', '貧民', '大貧民'] as const;
/** 通算点。1位から 3・2・1・0 点 */
export const RANK_POINTS = [3, 2, 1, 0] as const;
/** 階級ごとのカード交換の枚数 */
export const EXCHANGE_COUNTS = [2, 1, 1, 2] as const;

/** 場に起きた出来事。画面の実況に出す */
export type EventKind =
  | 'revolution'
  | 'counter-revolution'
  | 'eight-cut'
  | 'jack-back'
  | 'lock'
  | 'spade-three'
  | 'clear'
  | 'out'
  | 'city-fall';

export interface GameEvent {
  kind: EventKind;
  player: number;
}

export interface RoundState {
  rules: Rules;
  hands: DCard[][];
  /** 手番。決着後は意味を持たない */
  turn: number;
  /** 場に出ている役。誰も出していなければ null */
  field: Play | null;
  /** 場に最後に出した人。場が流れたらこの人から始まる */
  leader: number;
  /** この場でパスした人 */
  passed: boolean[];
  /** 革命中（場が流れても続く） */
  revolution: boolean;
  /** 11バック中（場が流れたら解ける） */
  jackBack: boolean;
  /** 縛り中のスート。null なら縛りなし（場が流れたら解ける） */
  lock: Suit[] | null;
  /** 上がった順のプレイヤー番号 */
  out: number[];
  /** 都落ちで最下位が確定した人 */
  dropped: number | null;
  /** 前回の大富豪。都落ちの判定に使う（1回戦は null） */
  previousTop: number | null;
  finished: boolean;
  /** 直前の着手で起きたこと */
  events: GameEvent[];
}

/** その回戦の順位（上位から）。決着していなければ out の順そのまま */
export function standings(state: RoundState): number[] {
  return state.dropped === null ? [...state.out] : [...state.out, state.dropped];
}

/** まだ札を持っていて、都落ちもしていない人 */
export function activePlayers(state: RoundState): number[] {
  const out: number[] = [];
  for (let i = 0; i < state.hands.length; i += 1) {
    if (i !== state.dropped && state.hands[i].length > 0) out.push(i);
  }
  return out;
}

/**
 * 回戦を始める。`first` は最初に出す人。
 * 1回戦は ♦3 を持っている人、2回戦以降は前回の大貧民から始める。
 */
export function startRound(
  hands: DCard[][],
  first: number,
  rules: Rules = DEFAULT_RULES,
  previousTop: number | null = null,
): RoundState {
  return {
    rules,
    hands: hands.map(sortHand),
    turn: first,
    field: null,
    leader: first,
    passed: hands.map(() => false),
    revolution: false,
    jackBack: false,
    lock: null,
    out: [],
    dropped: null,
    previousTop,
    finished: false,
    events: [],
  };
}

/** ♦3 を持っている人。1回戦の親を決める（無ければ0番） */
export function diamondThreeHolder(hands: readonly DCard[][]): number {
  const found = hands.findIndex((hand) =>
    hand.some((c) => !c.joker && c.suit === 'diamond' && c.rank === 3),
  );
  return found < 0 ? 0 : found;
}

/** いま強さが逆転しているか（革命と11バックは重ねがけで打ち消し合う） */
export function isReversed(state: Pick<RoundState, 'revolution' | 'jackBack'>): boolean {
  return state.revolution !== state.jackBack;
}

/**
 * その役を場に出せるか。
 *
 * 場が空なら何でも出せる（縛りは場が流れたときに解ける）。
 * 場に役があるときは、**種類と枚数が同じ**で、強さが上（革命中は下）であること。
 */
export function canBeat(state: RoundState, play: Play): boolean {
  const field = state.field;
  if (!field) return true;

  // スペ3返し。ジョーカー単騎にだけ、♠3 単騎で返せる（種類も強さも見ない）
  if (state.rules.spadeThree && field.jokerSingle && play.spadeThreeSingle) return true;

  if (play.kind !== field.kind || play.count !== field.count) return false;
  // 縛り中は、そのスートに収まる役しか出せない（ジョーカーは何のスートにもなる）
  if (state.lock && !play.suits.every((s) => state.lock!.includes(s))) return false;

  // ジョーカーだけの役は革命中でも最強のまま。返せるのはスペ3返しだけ
  if (play.allJokers !== field.allJokers) return play.allJokers;

  return isReversed(state) ? play.strength < field.strength : play.strength > field.strength;
}

/** 2つのスートの並びが同じ構成か（縛りの成立判定） */
function sameSuits(a: readonly Suit[], b: readonly Suit[]): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i]);
}

/** 選んだ札をその人が持っているか */
function ownsAll(hand: readonly DCard[], cards: readonly DCard[]): boolean {
  const ids = new Set(hand.map((c) => c.id));
  return cards.every((c) => ids.has(c.id));
}

/** その札の組を、いまの手番で出せるか */
export function isLegalPlay(state: RoundState, cards: readonly DCard[]): boolean {
  if (state.finished) return false;
  if (!ownsAll(state.hands[state.turn], cards)) return false;
  const play = classify(cards);
  return play !== null && canBeat(state, play);
}

/** 場が流れた状態にする。次に出す人は `next` */
function clearField(state: RoundState, next: number, events: GameEvent[]): RoundState {
  return {
    ...state,
    field: null,
    leader: next,
    turn: next,
    passed: state.passed.map(() => false),
    jackBack: false,
    lock: null,
    events,
  };
}

/** `from` の次に手番が回る人。誰もいなければ from を返す */
function nextActive(state: RoundState, from: number): number {
  const count = state.hands.length;
  for (let step = 1; step <= count; step += 1) {
    const i = (from + step) % count;
    if (i !== state.dropped && state.hands[i].length > 0) return i;
  }
  return from;
}

/**
 * `from` の次に、この場でまだパスしていない人。いなければ null。
 * **`from` 自身は数えない**（一周して戻ってきたら「他は全員パス」で場が流れる）。
 */
function nextInTrick(state: RoundState, from: number): number | null {
  const count = state.hands.length;
  for (let step = 1; step < count; step += 1) {
    const i = (from + step) % count;
    if (i === state.dropped || state.hands[i].length === 0) continue;
    if (!state.passed[i]) return i;
  }
  return null;
}

/** 決着（残り1人以下）していれば、最後の1人を順位に足して終える */
function settle(state: RoundState): RoundState {
  const rest = activePlayers(state);
  if (rest.length > 1) return state;
  return {
    ...state,
    out: rest.length === 1 ? [...state.out, rest[0]] : state.out,
    hands: state.hands.map((hand, i) => (rest.includes(i) ? [] : hand)),
    finished: true,
    field: null,
  };
}

/**
 * 札を出す。出せない組み合わせなら元の局面をそのまま返す。
 *
 * 処理の順番は「役の効果 → 上がりの判定 → 場を流すか手番を進めるか」。
 * 8切りで上がった人は続けて出せないので、次の人から新しい場になる。
 */
export function applyPlay(state: RoundState, cards: readonly DCard[]): RoundState {
  if (!isLegalPlay(state, cards)) return state;
  const play = classify(cards)!;
  const me = state.turn;
  const events: GameEvent[] = [];

  const ids = new Set(cards.map((c) => c.id));
  const hands = state.hands.map((hand, i) => (i === me ? hand.filter((c) => !ids.has(c.id)) : hand));

  // 縛り。同じ場で直前と同じスート構成が続いたら成立し、その場のあいだ続く
  let lock = state.lock;
  if (state.rules.suitLock && !lock && state.field && play.suits.length > 0) {
    if (sameSuits(state.field.suits, play.suits)) {
      lock = play.suits;
      events.push({ kind: 'lock', player: me });
    }
  }

  // 革命。同じ数字4枚以上で逆転し、もう一度出されると元に戻る（革命返し）
  let revolution = state.revolution;
  if (state.rules.revolution && play.kind === 'group' && play.count >= 4) {
    revolution = !revolution;
    events.push({ kind: revolution ? 'revolution' : 'counter-revolution', player: me });
  }

  // 11バック。その場のあいだだけ逆転する
  let jackBack = state.jackBack;
  if (state.rules.jackBack && play.hasJack) {
    jackBack = true;
    events.push({ kind: 'jack-back', player: me });
  }

  let next: RoundState = {
    ...state,
    hands,
    field: play,
    leader: me,
    lock,
    revolution,
    jackBack,
    events,
  };

  // 上がり
  const wentOut = hands[me].length === 0;
  if (wentOut) {
    next = { ...next, out: [...next.out, me] };
    events.push({ kind: 'out', player: me });
    next = applyCityFall(next, me, events);
  }

  const cut = state.rules.eightCut && play.hasEight;
  const spadeCut = state.rules.spadeThree && play.spadeThreeSingle && state.field?.jokerSingle;
  if (cut) events.push({ kind: 'eight-cut', player: me });
  if (spadeCut) events.push({ kind: 'spade-three', player: me });

  if (cut || spadeCut) {
    // 場が流れる。上がっていなければ同じ人が続けて出す
    const lead = wentOut ? nextActive(next, me) : me;
    return settle(clearField(next, lead, events));
  }

  const settled = settle(next);
  if (settled.finished) return { ...settled, events };

  const following = nextInTrick(settled, me);
  if (following === null) {
    // 自分以外が全員パス済み（＝上がって抜けた場合も含む）。場が流れる
    const lead = wentOut ? nextActive(settled, me) : me;
    events.push({ kind: 'clear', player: lead });
    return clearField(settled, lead, events);
  }
  return { ...settled, turn: following, events };
}

/**
 * 都落ち。前回の大富豪が1位で上がれなかったら、その場で大貧民が確定する。
 *
 * `previousTop` は前回の大富豪。1回戦や、ルールがOFFのときは何もしない。
 */
function applyCityFall(state: RoundState, whoWentOut: number, events: GameEvent[]): RoundState {
  if (!state.rules.cityFall) return state;
  const top = state.previousTop;
  if (top === null) return state;
  // 1位が確定した瞬間だけ見る
  if (state.out.length !== 1 || state.out[0] === top) return state;
  if (whoWentOut === top || state.dropped !== null) return state;
  if (state.hands[top].length === 0) return state;
  events.push({ kind: 'city-fall', player: top });
  return { ...state, dropped: top, hands: state.hands.map((h, i) => (i === top ? [] : h)) };
}

/** パスする。この場ではもう出せない */
export function applyPass(state: RoundState): RoundState {
  if (state.finished) return state;
  // 場が空のときはパスできない（誰も出さないと場が進まなくなる）
  if (!state.field) return state;

  const me = state.turn;
  const passed = state.passed.map((p, i) => (i === me ? true : p));
  const next: RoundState = { ...state, passed, events: [] };

  const following = nextInTrick(next, me);
  if (following === null || following === next.leader) {
    // 場に出した人まで戻ってきた＝他は全員パス。場が流れる
    const lead = next.hands[next.leader].length > 0 ? next.leader : nextActive(next, next.leader);
    return clearField(next, lead, [{ kind: 'clear', player: lead }]);
  }
  return { ...next, turn: following };
}

// ---------------------------------------------------------------- 出せる手

/** n個から k個を選ぶ組み合わせ（手札は最大14枚なので素直に再帰でよい） */
function combinations<T>(items: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > items.length) return [];
  const [head, ...rest] = items;
  return [...combinations(rest, k - 1).map((c) => [head, ...c]), ...combinations(rest, k)];
}

/**
 * 手札から作れる役をすべて数え上げる。
 *
 * 2^14 通りの部分集合を総当たりせず、**同じ数字の組**と**同じスートの階段**を
 * それぞれ組み立てる。同じ札の集合が2通りの窓から出てくることがあるので
 * （`[♠5, ♠6, ジョーカー]` は 4-5-6 の窓と 5-6-7 の窓の両方に現れる）、
 * 札のidで重複を落としてから `classify` に1通りへ decide させる。
 */
export function enumeratePlays(hand: readonly DCard[]): Play[] {
  const jokers = hand.filter((c) => c.joker);
  const naturals = hand.filter((c): c is NormalCard => !c.joker);
  const seen = new Set<string>();
  const plays: Play[] = [];

  const add = (cards: readonly DCard[]) => {
    const key = cards
      .map((c) => c.id)
      .sort((a, b) => a - b)
      .join(',');
    if (seen.has(key)) return;
    seen.add(key);
    const play = classify(cards);
    if (play) plays.push(play);
  };

  // 同じ数字の組（ジョーカーで枚数を足せる）。1つの数字は4枚まで
  const byRank = new Map<Rank, NormalCard[]>();
  for (const card of naturals) {
    const list = byRank.get(card.rank) ?? [];
    list.push(card);
    byRank.set(card.rank, list);
  }
  for (const list of byRank.values()) {
    for (let k = 1; k <= list.length; k += 1) {
      for (const combo of combinations(list, k)) {
        for (let j = 0; j + k <= 4 && j <= jokers.length; j += 1) {
          add([...combo, ...jokers.slice(0, j)]);
        }
      }
    }
  }
  // ジョーカーだけの組（単騎とペア）
  for (let j = 1; j <= jokers.length; j += 1) add(jokers.slice(0, j));

  // 階段。スートごとに、長さ3以上の窓を走らせる
  for (const suit of SUITS) {
    const bySuit = new Map<number, NormalCard>();
    for (const card of naturals) {
      if (card.suit === suit) bySuit.set(rankStrength(card.rank), card);
    }
    if (bySuit.size === 0) continue;
    for (let len = 3; len <= MAX_STRENGTH; len += 1) {
      for (let start = 1; start + len - 1 <= MAX_STRENGTH; start += 1) {
        const cards: DCard[] = [];
        let holes = 0;
        for (let s = start; s < start + len; s += 1) {
          const card = bySuit.get(s);
          if (card) cards.push(card);
          else holes += 1;
        }
        // 札が1枚も無い窓（ジョーカーだけの階段）は作らない
        if (cards.length === 0 || holes > jokers.length) continue;
        add([...cards, ...jokers.slice(0, holes)]);
      }
    }
  }

  return plays;
}

/** いまの手番で出せる役 */
export function legalPlays(state: RoundState): Play[] {
  if (state.finished) return [];
  return enumeratePlays(state.hands[state.turn]).filter((play) => canBeat(state, play));
}

// ---------------------------------------------------------------- CPU

export const LEVELS = {
  easy: { label: 'かんたん' },
  normal: { label: 'ふつう' },
  hard: { label: 'つよい' },
} as const;

export type Level = keyof typeof LEVELS;

/** 温存したい札か（2・ジョーカー）。序盤に切ると終盤で場を取れなくなる */
function isPremium(card: DCard): boolean {
  return card.joker || card.rank === 2;
}

/**
 * 役の使いにくさ。小さいほど「気持ちよく出せる手」。
 *
 * 「つよい」と「ふつう」で見る項目を変える（五目並べ・リバーシと同じ考え方）。
 * 深く読ませて弱くするのではなく、**見る項目を減らして弱くする**ほうが
 * 人間に分かる弱さになる。
 */
function playCost(play: Play, hand: readonly DCard[], level: Level): number {
  // 基本は「弱い役から出す」。強さがそのままコスト
  let cost = play.strength;

  // 枚数を減らせる役はうれしい。1枚あたり少し引く
  cost -= (play.count - 1) * 1.5;

  // ジョーカーは代わりが利かない。**枚数を稼ぐためだけに足すのは損**なので、
  // 枚数の割引を打ち消せるだけの重みを「ふつう」にも入れる
  cost += play.cards.filter((c) => c.joker).length * 8;

  if (level === 'hard') {
    // 2も終盤の切り札。手札が多いうちほど出し惜しむ
    const premium = play.cards.filter((c) => !c.joker && c.rank === 2).length;
    cost += premium * (hand.length >= 5 ? 12 : 3);

    // 組を崩さない。同じ数字を複数持っているのに1枚だけ出すのは損
    const only = play.count === 1 ? play.cards[0] : null;
    if (play.kind === 'group' && only && !only.joker) {
      const sameRank = hand.filter((c) => !c.joker && c.rank === only.rank).length;
      if (sameRank > 1) cost += 6;
    }

    // 8切りは「場を流してもう一度出せる」ので、手札が残っているほど価値がある
    if (play.hasEight && hand.length > play.count) cost -= 8;
  }

  // 上がれる手は無条件で最優先
  if (play.count === hand.length) cost -= 1000;

  return cost;
}

export interface CpuOptions {
  rng?: () => number;
}

/**
 * CPUの着手を選ぶ。パスするときは null。
 *
 * - かんたん: 出せる役から適当に選ぶ。切り札も階段も考えずに出す
 * - ふつう: いちばん弱い役から出す。ジョーカーは他に手が無いときだけ
 * - つよい: ふつうに加えて、切り札の温存・組の維持・8切りの利用を見る。
 *   自分が損をするだけの場面ではパスして場を流させる
 *
 * どの段階も**上がれる手は必ず出す**。ここを外すと対局にならない。
 */
export function chooseCpuPlay(
  state: RoundState,
  level: Level,
  opts: CpuOptions = {},
): DCard[] | null {
  const rng = opts.rng ?? Math.random;
  const plays = legalPlays(state);
  if (plays.length === 0) return null;

  const hand = state.hands[state.turn];

  // 上がれる手があれば必ず出す（どの強さでも共通）
  const finisher = plays.filter((p) => p.count === hand.length);
  if (finisher.length > 0) {
    return finisher.sort((a, b) => a.strength - b.strength)[0].cards;
  }

  if (level === 'easy') {
    return plays[Math.min(plays.length - 1, Math.floor(rng() * plays.length))].cards;
  }

  const scored = plays
    .map((play) => ({ play, cost: playCost(play, hand, level) }))
    .sort((a, b) => a.cost - b.cost);
  const best = scored[0];

  // つよいだけ、場に出す価値が無ければ見送る。
  // 誰かの手札が残り少ないときは、通してしまうほうが損なので必ず出す
  if (level === 'hard' && state.field) {
    const rush = state.hands.some((h, i) => i !== state.turn && h.length > 0 && h.length <= 2);
    const wasteful = best.play.cards.some(isPremium) && hand.length >= 5;
    if (wasteful && !rush) return null;
  }

  return best.play.cards;
}

// ---------------------------------------------------------------- 試合

export interface MatchState {
  rules: Rules;
  level: Level;
  /** 1〜ROUNDS */
  round: number;
  /** 通算点 */
  scores: number[];
  /** 前回の順位（上位から並んだプレイヤー番号）。1回戦の前は空 */
  lastStandings: number[];
  /** その回戦の局面 */
  state: RoundState;
  /** 直前の回戦で渡した札（画面で「何を渡したか」を出す） */
  exchange: ExchangeLog[];
  /** 5回戦が終わった */
  finished: boolean;
}

export interface ExchangeLog {
  from: number;
  to: number;
  cards: DCard[];
}

/** 新しい試合を始める（1回戦を配る） */
export function newMatch(level: Level, rules: Rules, rng: () => number = Math.random): MatchState {
  const hands = dealCards(shuffleCards(makeDaifugoDeck(), rng));
  const state = startRound(hands, diamondThreeHolder(hands), rules);
  return {
    rules,
    level,
    round: 1,
    scores: Array.from({ length: PLAYER_COUNT }, () => 0),
    lastStandings: [],
    state,
    exchange: [],
    finished: false,
  };
}

/** 回戦が終わったときの得点を足して、順位を控える */
export function finishRound(match: MatchState): MatchState {
  if (!match.state.finished) return match;
  const order = standings(match.state);
  const scores = [...match.scores];
  order.forEach((player, place) => {
    scores[player] += RANK_POINTS[Math.min(place, RANK_POINTS.length - 1)];
  });
  return {
    ...match,
    scores,
    lastStandings: order,
    finished: match.round >= ROUNDS,
  };
}

/**
 * 階級によるカード交換。
 *
 * 大貧民 → 大富豪 に2枚、貧民 → 富豪 に1枚。弱い側は**いちばん強い札**を、
 * 強い側は**いちばん弱い札**を渡す（強い側に選ばせないのは仕様の「やらないこと」）。
 */
export function exchangeCards(
  hands: DCard[][],
  order: readonly number[],
): { hands: DCard[][]; log: ExchangeLog[] } {
  const next = hands.map((hand) => sortHand(hand));
  const log: ExchangeLog[] = [];
  const pairs = [
    { rich: order[0], poor: order[order.length - 1], count: EXCHANGE_COUNTS[0] },
    { rich: order[1], poor: order[order.length - 2], count: EXCHANGE_COUNTS[1] },
  ];

  for (const { rich, poor, count } of pairs) {
    if (rich === undefined || poor === undefined || rich === poor) continue;
    // 渡す枚数に足りない手札は交換しない（回戦の途中の局面を渡されても壊れないように）
    if (next[rich].length < count || next[poor].length < count) continue;
    // 貧しい側は強い札（末尾）、豊かな側は弱い札（先頭）を出す
    const fromPoor = next[poor].slice(-count);
    const fromRich = next[rich].slice(0, count);
    next[poor] = sortHand([...next[poor].slice(0, next[poor].length - count), ...fromRich]);
    next[rich] = sortHand([...next[rich].slice(count), ...fromPoor]);
    log.push({ from: poor, to: rich, cards: fromPoor });
    log.push({ from: rich, to: poor, cards: fromRich });
  }
  return { hands: next, log };
}

/**
 * 次の回戦を始める。前回の大貧民が親になり、階級どおりに札を交換する。
 */
export function startNextRound(match: MatchState, rng: () => number = Math.random): MatchState {
  if (match.finished) return match;
  const dealt = dealCards(shuffleCards(makeDaifugoDeck(), rng));
  const order = match.lastStandings;
  const ranked = order.length === PLAYER_COUNT;
  const { hands, log }: { hands: DCard[][]; log: ExchangeLog[] } = ranked
    ? exchangeCards(dealt, order)
    : { hands: dealt, log: [] };
  // 親は前回の大貧民。順位が無ければ ♦3 を持っている人
  const first = ranked ? order[order.length - 1] : diamondThreeHolder(hands);
  return {
    ...match,
    round: match.round + 1,
    state: startRound(hands, first, match.rules, ranked ? order[0] : null),
    exchange: log,
  };
}

/**
 * 通算点から最終の階級を決める。同点は前回の順位が上のほうを上に置く
 * （回戦ごとの順位が反映されるので、まったくの偶然では決まらない）。
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

/** そのプレイヤーの最終順位（0が大富豪） */
export function placeOf(match: MatchState, player: number): number {
  return matchStandings(match).indexOf(player);
}
