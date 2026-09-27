/**
 * ブラックジャック（CPU のディーラーと 1 対 1 で遊ぶトランプ）のロジック。
 *
 * 仕様: docs/features/game-blackjack.md
 *
 * すべて純関数で、画面（app/blackjack/Game.tsx）は入力と描画・間（ms）だけを持つ。
 *
 * ## ルール（仕様書「ルール」の 1〜10）
 *
 * - 52 枚 × 1 デッキ。**1 局ごとに山を作り直してシャッフルする**（カウンティングの余地を作らない）
 * - A は 1 または 11、絵札は 10
 * - ヒット／スタンド／ダブルダウン（最初の 2 枚のみ）／スプリット（同ランク・1 回まで）。
 *   インシュランス・サレンダー・スプリット後のダブル（DAS）は持たない
 * - ディーラーは 17 以上で止まる。ソフト 17 で引くかどうかは設定（`hitSoft17`）
 * - ディーラーのアップカードが A か 10 のときは、プレイヤーの行動前に伏せ札を確かめる（ピーク）。
 *   ブラックジャックならその場で局を終え、失うのは最初の賭け金だけ
 * - ブラックジャックは 3:2、通常の勝ちは 1:1、引き分けは戻し。スプリット後の A＋10 は 21（1:1）
 *
 * ## チップの持ち方
 *
 * `chips` は**卓に出していない手持ち**。配るときに賭け金を差し引き、ダブル・スプリットの追加分も
 * その場で引く。精算で「賭け金＋勝ち分」を戻す。こうしておくと「手持ちが足りないならダブル不可」が
 * `chips >= bet` の比較だけで書ける。
 *
 * チップは点数であって現金ではない（購入・換金・回復は持たない）。
 */

import { makeDeck, shuffle, type Card } from './cards';
import { applyResult, type Improved, type RecordEntry } from './records';

/** 局面。表示の出し分けはこれで決める（games/CLAUDE.md 7） */
export type Phase = 'betting' | 'player' | 'dealer' | 'settled';

export interface Rules {
  /** ソフト 17 でディーラーが引くか（既定は引かない＝スタンド） */
  hitSoft17: boolean;
}

export const DEFAULT_RULES: Rules = { hitSoft17: false };

/** 賭け金の 3 段階 */
export const BETS = [10, 25, 50] as const;
export type Bet = (typeof BETS)[number];

/** 最初の所持チップ */
export const START_CHIPS = 1000;

/**
 * 1 手の枠が「重ね幅を詰めずに」並べる枚数。これを超えたら画面側が重ね幅を詰める
 * （仕様書「手の枠の高さと札の重ね方を先に固定する」）
 */
export const FRAME_CARDS = 6;

export interface Hand {
  cards: Card[];
  /** この手に賭けている額（ダブルすると 2 倍になる） */
  bet: number;
  /** ダブルダウンした手（1 枚だけ引いて終わる） */
  doubled: boolean;
  /** 行動を終えた手（スタンド・バースト・ダブル・21 到達・スプリットした A） */
  done: boolean;
  /** スプリットでできた手。A＋10 でもブラックジャックにしない */
  fromSplit: boolean;
}

export type HandOutcome = 'blackjack' | 'win' | 'push' | 'loss';

export interface HandResult {
  outcome: HandOutcome;
  /** 収支（勝てば正、負ければ負。引き分けは 0） */
  payout: number;
}

export interface Settlement {
  hands: HandResult[];
  /** 局全体の収支（手ごとの合計） */
  net: number;
  /** 局全体の勝敗。収支の正負で決める（スプリットは合算して 1 局の結果） */
  outcome: 'win' | 'loss' | 'draw';
  /** ディーラーのピークでブラックジャックが見つかり、プレイヤーの行動前に終わった局 */
  dealerPeekBlackjack: boolean;
}

export interface BlackjackState {
  phase: Phase;
  /** 卓に出していない手持ちのチップ */
  chips: number;
  /** 次の局（いまの局）の最初の賭け金 */
  bet: Bet;
  rules: Rules;
  /** 残りの山。先頭から引く */
  deck: Card[];
  /** ディーラーの札。2 枚目（伏せ札）は公開まで faceUp: false */
  dealer: Card[];
  /** プレイヤーの手。スプリットすると 2 つになる */
  hands: Hand[];
  /** いま行動している手の番号 */
  active: number;
  /** 精算の結果（phase が settled のときだけ） */
  settlement: Settlement | null;
  /** 何局目か（配るたびに 1 増える）。記録を 1 局 1 回にするための目印 */
  round: number;
}

// ---- 手の評価 ----

/** 札 1 枚の点数（A は 1 として数える。11 にするかは handValue が決める） */
export function cardPoint(card: Card): number {
  return card.rank >= 10 ? 10 : card.rank;
}

export interface HandValue {
  /** A をすべて 1 と数えた合計 */
  hard: number;
  /** A を 1 枚だけ 11 と数えて 21 以下に収まるときの合計。収まらなければ null */
  soft: number | null;
  /** 使う合計（soft があれば soft） */
  best: number;
  isBust: boolean;
  /** 2 枚で 21。スプリット後の手かどうかは見ない（`isNatural` を使う） */
  isBlackjack: boolean;
}

export function handValue(cards: readonly Card[]): HandValue {
  const hard = cards.reduce((sum, c) => sum + cardPoint(c), 0);
  const hasAce = cards.some((c) => c.rank === 1);
  const soft = hasAce && hard + 10 <= 21 ? hard + 10 : null;
  const best = soft ?? hard;
  return {
    hard,
    soft,
    best,
    isBust: hard > 21,
    isBlackjack: cards.length === 2 && best === 21,
  };
}

/** 本物のブラックジャック（配られた 2 枚で 21。スプリット後の手は除く） */
export function isNatural(hand: Hand): boolean {
  return !hand.fromSplit && handValue(hand.cards).isBlackjack;
}

/**
 * 合計の表示。ソフトなら「7 / 17」の 2 値で出す（仕様書「画面・操作」）。
 * ソフトの値が 21 ちょうどなら 2 値にせず 21 だけ出す（迷う余地がない）
 */
export function totalLabel(cards: readonly Card[]): string {
  if (cards.length === 0) return '';
  const v = handValue(cards);
  if (v.soft !== null && v.soft !== 21) return `${v.hard} / ${v.soft}`;
  return String(v.best);
}

/** 表を向いている札だけの合計（伏せ札のあるディーラーの表示用） */
export function visibleCards(cards: readonly Card[]): Card[] {
  return cards.filter((c) => c.faceUp);
}

/** ディーラーが次の 1 枚を引くか */
export function dealerShouldHit(cards: readonly Card[], rules: Rules): boolean {
  const v = handValue(cards);
  if (v.best < 17) return true;
  return v.best === 17 && v.soft !== null && rules.hitSoft17;
}

/** ピーク（伏せ札の確認）をするアップカードか。A と 10 点札（10・J・Q・K） */
export function dealerPeeks(upcard: Card): boolean {
  return upcard.rank === 1 || cardPoint(upcard) === 10;
}

// ---- 局の進行 ----

/** 最初の状態（所持チップ 1,000・賭け金 10） */
export function newSession(rules: Rules = DEFAULT_RULES): BlackjackState {
  return {
    phase: 'betting',
    chips: START_CHIPS,
    bet: BETS[0],
    rules,
    deck: [],
    dealer: [],
    hands: [],
    active: 0,
    settlement: null,
    round: 0,
  };
}

/** 次の局を配れるだけのチップがあるか（最小の賭け金に届かなければ「はじめから」） */
export function isBroke(state: BlackjackState): boolean {
  return state.chips < BETS[0];
}

/** いまの手持ちで選べる賭け金か */
export function canBet(state: BlackjackState, bet: Bet): boolean {
  return state.phase !== 'player' && state.phase !== 'dealer' && bet <= state.chips;
}

/** 賭け金を選ぶ。局の途中と、手持ちが足りない額は受け付けない */
export function setBet(state: BlackjackState, bet: Bet): BlackjackState {
  if (!canBet(state, bet)) return state;
  return { ...state, bet };
}

/** ソフト 17 の設定を変える。**局の途中は変えない**（仕様書「画面・操作」） */
export function setRules(state: BlackjackState, rules: Rules): BlackjackState {
  if (state.phase === 'player' || state.phase === 'dealer') return state;
  return { ...state, rules };
}

/** 精算後の卓を片付けて、賭け金を選ぶ局面に戻す */
export function nextRound(state: BlackjackState): BlackjackState {
  if (state.phase !== 'settled') return state;
  // 手持ちが減って、選んでいた賭け金に届かなくなったら、届く最大の段に下げる
  const affordable = [...BETS].reverse().find((b) => b <= state.chips) ?? BETS[0];
  return {
    ...state,
    phase: 'betting',
    bet: state.bet <= state.chips ? state.bet : affordable,
    deck: [],
    dealer: [],
    hands: [],
    active: 0,
    settlement: null,
  };
}

function draw(deck: Card[], faceUp = true): [Card, Card[]] {
  const [top, ...rest] = deck;
  if (!top) throw new Error('山札が尽きました');
  return [{ ...top, faceUp }, rest];
}

/** 1 局ぶんの山（52 枚を毎局シャッフルし直す） */
export function freshDeck(rng: () => number = Math.random): Card[] {
  return shuffle(makeDeck(1), rng);
}

/** 乱数で山を作って配る */
export function deal(state: BlackjackState, rng: () => number = Math.random): BlackjackState {
  return dealFrom(state, freshDeck(rng));
}

/**
 * 決まった並びの山から配る（テストで札を指定するため）。
 * 配る順はプレイヤー → ディーラー（表）→ プレイヤー → ディーラー（伏せ）。
 *
 * 配り終えたら、ディーラーのアップカードが A／10 ならピークし、
 * ブラックジャックならその場で精算する。プレイヤーだけがブラックジャックなら、
 * 行動の余地が無いので同じくその場で精算する（3:2）。
 */
export function dealFrom(state: BlackjackState, deck: readonly Card[]): BlackjackState {
  if (state.phase !== 'betting' && state.phase !== 'settled') return state;
  const base = state.phase === 'settled' ? nextRound(state) : state;
  if (base.bet > base.chips) return base;

  let rest = [...deck];
  let p1: Card, d1: Card, p2: Card, d2: Card;
  [p1, rest] = draw(rest);
  [d1, rest] = draw(rest);
  [p2, rest] = draw(rest);
  [d2, rest] = draw(rest, false);

  const hand: Hand = { cards: [p1, p2], bet: base.bet, doubled: false, done: false, fromSplit: false };
  let next: BlackjackState = {
    ...base,
    phase: 'player',
    chips: base.chips - base.bet,
    deck: rest,
    dealer: [d1, d2],
    hands: [hand],
    active: 0,
    settlement: null,
    round: base.round + 1,
  };

  const dealerBJ = dealerPeeks(d1) && handValue([d1, d2]).isBlackjack;
  if (dealerBJ || isNatural(hand)) {
    next = settle({ ...next, dealer: revealAll(next.dealer) }, dealerBJ);
  }
  return next;
}

function revealAll(cards: readonly Card[]): Card[] {
  return cards.map((c) => (c.faceUp ? c : { ...c, faceUp: true }));
}

function activeHand(state: BlackjackState): Hand | null {
  if (state.phase !== 'player') return null;
  return state.hands[state.active] ?? null;
}

export function canHit(state: BlackjackState): boolean {
  const hand = activeHand(state);
  return hand !== null && !hand.done;
}

export function canStand(state: BlackjackState): boolean {
  return canHit(state);
}

/** ダブルダウン：最初の 2 枚のときだけ。スプリット後は不可（DAS なし）。手持ちが賭け金に届くこと */
export function canDouble(state: BlackjackState): boolean {
  const hand = activeHand(state);
  return (
    hand !== null &&
    !hand.done &&
    hand.cards.length === 2 &&
    !hand.fromSplit &&
    state.chips >= hand.bet
  );
}

/** スプリット：同ランクの 2 枚で、まだ分けていない（1 回まで）。手持ちが賭け金に届くこと */
export function canSplit(state: BlackjackState): boolean {
  const hand = activeHand(state);
  return (
    hand !== null &&
    !hand.done &&
    state.hands.length === 1 &&
    hand.cards.length === 2 &&
    hand.cards[0].rank === hand.cards[1].rank &&
    state.chips >= hand.bet
  );
}

/** 行動を終えた手を記録して、次の手へ。全部終わったらディーラーの番 */
function advance(state: BlackjackState): BlackjackState {
  const nextIndex = state.hands.findIndex((h) => !h.done);
  if (nextIndex >= 0) return { ...state, active: nextIndex };
  return { ...state, phase: 'dealer' };
}

function replaceHand(state: BlackjackState, index: number, hand: Hand): Hand[] {
  return state.hands.map((h, i) => (i === index ? hand : h));
}

/** 21 に届いた・超えた手は自動で終える（それ以上の選択が無い） */
function finishIfOver(hand: Hand): Hand {
  const v = handValue(hand.cards);
  return v.isBust || v.best === 21 ? { ...hand, done: true } : hand;
}

export function hit(state: BlackjackState): BlackjackState {
  if (!canHit(state)) return state;
  const hand = state.hands[state.active];
  const [card, deck] = draw(state.deck);
  const updated = finishIfOver({ ...hand, cards: [...hand.cards, card] });
  return advance({ ...state, deck, hands: replaceHand(state, state.active, updated) });
}

export function stand(state: BlackjackState): BlackjackState {
  if (!canStand(state)) return state;
  const hand = state.hands[state.active];
  return advance({ ...state, hands: replaceHand(state, state.active, { ...hand, done: true }) });
}

/** 賭け金を倍にして、1 枚だけ引いて終える */
export function doubleDown(state: BlackjackState): BlackjackState {
  if (!canDouble(state)) return state;
  const hand = state.hands[state.active];
  const [card, deck] = draw(state.deck);
  const updated: Hand = {
    ...hand,
    cards: [...hand.cards, card],
    bet: hand.bet * 2,
    doubled: true,
    done: true,
  };
  return advance({
    ...state,
    chips: state.chips - hand.bet,
    deck,
    hands: replaceHand(state, state.active, updated),
  });
}

/**
 * 2 つの手に分け、それぞれに 1 枚ずつ配る。
 * **A を分けたときは 1 枚ずつで終わり**（それ以上引けない）。A＋10 になっても 21 扱い
 */
export function split(state: BlackjackState): BlackjackState {
  if (!canSplit(state)) return state;
  const hand = state.hands[0];
  const aces = hand.cards[0].rank === 1;
  let deck = state.deck;
  let c1: Card, c2: Card;
  [c1, deck] = draw(deck);
  [c2, deck] = draw(deck);
  const make = (first: Card, second: Card): Hand => {
    const h: Hand = {
      cards: [first, second],
      bet: hand.bet,
      doubled: false,
      done: aces,
      fromSplit: true,
    };
    return aces ? h : finishIfOver(h);
  };
  const hands = [make(hand.cards[0], c1), make(hand.cards[1], c2)];
  return advance({ ...state, chips: state.chips - hand.bet, deck, hands, active: 0 });
}

/**
 * ディーラーの 1 手ぶんを進める（画面が 1 手ごとに間を置くため）。
 *
 * 1. 伏せ札があればめくる
 * 2. プレイヤーの手が全部バーストしていれば、引かずに精算（ディーラーが後でバーストしても覆らない）
 * 3. 引く条件なら 1 枚引く
 * 4. 止まったら精算
 */
export function dealerStep(state: BlackjackState): BlackjackState {
  if (state.phase !== 'dealer') return state;
  if (state.dealer.some((c) => !c.faceUp)) {
    return { ...state, dealer: revealAll(state.dealer) };
  }
  const allBust = state.hands.every((h) => handValue(h.cards).isBust);
  if (!allBust && dealerShouldHit(state.dealer, state.rules)) {
    const [card, deck] = draw(state.deck);
    return { ...state, deck, dealer: [...state.dealer, card] };
  }
  return settle(state, false);
}

/** ディーラーの番を最後まで進める（テストと、間を置かない場面用） */
export function dealerPlay(state: BlackjackState): BlackjackState {
  let s = state;
  // 1 デッキで 21 以下に収まる枚数は有限なので必ず止まるが、念のため上限を置く
  for (let i = 0; i < 20 && s.phase === 'dealer'; i += 1) s = dealerStep(s);
  return s;
}

/**
 * 3:2 の配当。賭け金 25 のとき 37.5 になるので、**端数は切り捨てる**
 * （チップを整数で持つため。賭け金 10・50 では端数は出ない）
 */
export function blackjackPayout(bet: number): number {
  return Math.floor((bet * 3) / 2);
}

/** 1 手の勝敗と収支 */
export function judgeHand(hand: Hand, dealer: readonly Card[]): HandResult {
  const p = handValue(hand.cards);
  const d = handValue(dealer);
  const dealerNatural = d.isBlackjack;
  // プレイヤーのバーストが先に確定する（ディーラーが後でバーストしても覆らない）
  if (p.isBust) return { outcome: 'loss', payout: -hand.bet };
  if (isNatural(hand)) {
    return dealerNatural
      ? { outcome: 'push', payout: 0 }
      : { outcome: 'blackjack', payout: blackjackPayout(hand.bet) };
  }
  if (dealerNatural) return { outcome: 'loss', payout: -hand.bet };
  if (d.isBust || p.best > d.best) return { outcome: 'win', payout: hand.bet };
  if (p.best < d.best) return { outcome: 'loss', payout: -hand.bet };
  return { outcome: 'push', payout: 0 };
}

/**
 * 精算。手ごとに勝敗を出し、「賭け金＋収支」を手持ちに戻す。
 * 局の勝敗は収支の合計の正負で決める（スプリットの 2 手は合算して 1 局）。
 */
export function settle(state: BlackjackState, dealerPeekBlackjack = false): BlackjackState {
  const dealer = revealAll(state.dealer);
  const hands = state.hands.map((h) => judgeHand(h, dealer));
  const net = hands.reduce((sum, r) => sum + r.payout, 0);
  const returned = state.hands.reduce((sum, h, i) => sum + h.bet + hands[i].payout, 0);
  return {
    ...state,
    phase: 'settled',
    dealer,
    hands: state.hands.map((h) => (h.done ? h : { ...h, done: true })),
    chips: state.chips + returned,
    settlement: {
      hands,
      net,
      outcome: net > 0 ? 'win' : net < 0 ? 'loss' : 'draw',
      dealerPeekBlackjack,
    },
  };
}

// ---- 記録 ----

/**
 * 記録の区分。ソフト 17 の扱いで期待値が変わるので混ぜない
 * （`'s17'`：スタンド／`'h17'`：ヒット）
 */
export function variantOf(rules: Rules): 's17' | 'h17' {
  return rules.hitSoft17 ? 'h17' : 's17';
}

/**
 * 1 局の精算を記録に反映する（`plays` は配ったときに `applyStart` で数える）。
 *
 * - `wins` / `losses` / `draws`：局の勝敗
 * - `bestScore`：**最高所持チップ**。精算後の手持ちが初期値 1,000 を超え、
 *   かつ前のベストを超えたときだけ更新する
 *
 * `applyResult` に `score` を渡さないのは、渡すと平均用の `scoreSum` まで積まれてしまうため
 * （所持チップは足し合わせても意味が無い）。
 */
export function applyHandRecord(
  entry: RecordEntry,
  outcome: Settlement['outcome'],
  chips: number,
): { entry: RecordEntry; improved: Improved } {
  const { entry: counted } = applyResult(entry, { outcome });
  const best = entry.bestScore ?? START_CHIPS;
  const score = chips > START_CHIPS && chips > best;
  return {
    entry: score ? { ...counted, bestScore: chips } : counted,
    improved: { time: false, score, moves: false },
  };
}

/** 札の総数の確認用（山・ディーラー・手の合計。不変条件のテストで使う） */
export function cardsInPlay(state: BlackjackState): number {
  return state.deck.length + state.dealer.length + state.hands.reduce((n, h) => n + h.cards.length, 0);
}
