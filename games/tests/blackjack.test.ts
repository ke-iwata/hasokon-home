import { describe, expect, it } from 'vitest';
import { seededRng, type Card, type Rank, type Suit } from '@/lib/cards';
import { applyStart, type RecordEntry } from '@/lib/records';
import {
  applyHandRecord,
  BETS,
  blackjackPayout,
  canBet,
  canDouble,
  canHit,
  canSplit,
  cardsInPlay,
  deal,
  dealerPeeks,
  dealerPlay,
  dealerShouldHit,
  dealerStep,
  dealFrom,
  doubleDown,
  handValue,
  hit,
  isBroke,
  newSession,
  nextRound,
  setBet,
  setRules,
  split,
  stand,
  START_CHIPS,
  totalLabel,
  variantOf,
  type BlackjackState,
} from '@/lib/blackjack';

let nextId = 1000;
function c(rank: Rank, suit: Suit = 'spade'): Card {
  nextId += 1;
  return { rank, suit, faceUp: true, id: nextId };
}

/**
 * 配る順（P, D表, P, D伏せ）に並べた山を作る。後ろは 2 で埋める
 * （ヒットやディーラーの引きで使う札は、テストごとに明示して先頭側に置く）
 */
function deckOf(ranks: Rank[], filler: Rank = 2): Card[] {
  return [...ranks.map((r) => c(r)), ...Array.from({ length: 20 }, () => c(filler, 'club'))];
}

function dealt(ranks: Rank[], opts: { bet?: 10 | 25 | 50; chips?: number; hitSoft17?: boolean } = {}): BlackjackState {
  let s = newSession({ hitSoft17: opts.hitSoft17 ?? false });
  if (opts.chips !== undefined) s = { ...s, chips: opts.chips };
  if (opts.bet) s = setBet(s, opts.bet);
  return dealFrom(s, deckOf(ranks));
}

describe('handValue', () => {
  it('A を 2 枚でソフト 12', () => {
    const v = handValue([c(1), c(1)]);
    expect(v.hard).toBe(2);
    expect(v.soft).toBe(12);
    expect(v.best).toBe(12);
    expect(v.isBust).toBe(false);
    expect(v.isBlackjack).toBe(false);
  });

  it('絵札は 10', () => {
    expect(handValue([c(11), c(12), c(13)]).hard).toBe(30);
    expect(handValue([c(13), c(5)]).best).toBe(15);
  });

  it('A+10 は 2 枚の 21 でブラックジャック、3 枚の 21 はブラックジャックでない', () => {
    expect(handValue([c(1), c(13)]).isBlackjack).toBe(true);
    const three = handValue([c(7), c(7), c(7)]);
    expect(three.best).toBe(21);
    expect(three.isBlackjack).toBe(false);
    const softThree = handValue([c(1), c(5), c(5)]);
    expect(softThree.best).toBe(21);
    expect(softThree.isBlackjack).toBe(false);
  });

  it('A を 11 にすると超えるときはハードで数える', () => {
    const v = handValue([c(1), c(9), c(5)]);
    expect(v.soft).toBeNull();
    expect(v.best).toBe(15);
  });

  it('22 以上でバースト', () => {
    expect(handValue([c(10), c(9), c(3)]).isBust).toBe(true);
    expect(handValue([c(10), c(9), c(2)]).isBust).toBe(false);
  });

  it('ソフトの合計は 2 値で表示する（21 ちょうどは 1 値）', () => {
    expect(totalLabel([c(1), c(6)])).toBe('7 / 17');
    expect(totalLabel([c(1), c(13)])).toBe('21');
    expect(totalLabel([c(10), c(6)])).toBe('16');
    expect(totalLabel([])).toBe('');
  });
});

describe('ディーラーの固定ルール', () => {
  it('16 以下は引き、ハード 17 以上は止まる', () => {
    const rules = { hitSoft17: false };
    expect(dealerShouldHit([c(10), c(6)], rules)).toBe(true);
    expect(dealerShouldHit([c(10), c(7)], rules)).toBe(false);
    expect(dealerShouldHit([c(10), c(7)], { hitSoft17: true })).toBe(false);
  });

  it('ソフト 17 は既定で止まり、設定でヒットする', () => {
    expect(dealerShouldHit([c(1), c(6)], { hitSoft17: false })).toBe(false);
    expect(dealerShouldHit([c(1), c(6)], { hitSoft17: true })).toBe(true);
    // ソフト 18 はどちらでも止まる
    expect(dealerShouldHit([c(1), c(7)], { hitSoft17: true })).toBe(false);
  });

  it('A と 10 点札のときだけピークする', () => {
    expect(dealerPeeks(c(1))).toBe(true);
    expect(dealerPeeks(c(10))).toBe(true);
    expect(dealerPeeks(c(12))).toBe(true);
    expect(dealerPeeks(c(9))).toBe(false);
  });

  it('ソフト 17 ヒットの設定では、ディーラーが A+6 から引く', () => {
    // P: 10, 8 / D: A, 6（伏せ）→ 次の 4 を引いてハード 21 で止まる
    let s = dealt([10, 1, 8, 6, 4], { hitSoft17: true });
    s = dealerPlay(stand(s));
    expect(s.dealer.map((x) => x.rank)).toEqual([1, 6, 4]);
    expect(s.settlement?.outcome).toBe('loss');

    let s17 = dealt([10, 1, 8, 6, 4]);
    s17 = dealerPlay(stand(s17));
    expect(s17.dealer).toHaveLength(2);
    expect(s17.settlement?.outcome).toBe('win');
  });
});

describe('配る', () => {
  it('2 枚ずつ配り、ディーラーの 2 枚目は伏せる。賭け金は手持ちから引く', () => {
    const s = dealt([10, 9, 7, 8]);
    expect(s.phase).toBe('player');
    expect(s.hands[0].cards.map((x) => x.rank)).toEqual([10, 7]);
    expect(s.dealer.map((x) => x.rank)).toEqual([9, 8]);
    expect(s.dealer[0].faceUp).toBe(true);
    expect(s.dealer[1].faceUp).toBe(false);
    expect(s.chips).toBe(START_CHIPS - 10);
    expect(s.round).toBe(1);
  });

  it('乱数で配っても 52 枚がどこかに必ずある（毎局新しい山）', () => {
    const rng = seededRng(42);
    let s = newSession();
    for (let i = 0; i < 30; i += 1) {
      s = deal(s, rng);
      expect(cardsInPlay(s)).toBe(52);
      const ids = new Set([...s.deck, ...s.dealer, ...s.hands.flatMap((h) => h.cards)].map((x) => x.id));
      expect(ids.size).toBe(52);
      while (s.phase === 'player') s = stand(s);
      s = dealerPlay(s);
      expect(s.phase).toBe('settled');
      expect(cardsInPlay(s)).toBe(52);
      s = nextRound(s);
    }
  });

  it('プレイヤーだけがブラックジャックなら即精算で 3:2', () => {
    const s = dealt([1, 9, 13, 8], { bet: 50 });
    expect(s.phase).toBe('settled');
    expect(s.settlement?.hands[0]).toEqual({ outcome: 'blackjack', payout: 75 });
    expect(s.chips).toBe(START_CHIPS + 75);
    expect(s.dealer.every((x) => x.faceUp)).toBe(true);
  });

  it('3:2 の端数は切り捨てる（賭け金 25 → 37）', () => {
    expect(blackjackPayout(10)).toBe(15);
    expect(blackjackPayout(25)).toBe(37);
    expect(blackjackPayout(50)).toBe(75);
    const s = dealt([1, 9, 13, 8], { bet: 25 });
    expect(s.chips).toBe(START_CHIPS + 37);
  });

  it('プレイヤーとディーラーが同時にブラックジャックなら引き分け（戻し）', () => {
    const s = dealt([1, 1, 13, 12]);
    expect(s.phase).toBe('settled');
    expect(s.settlement?.hands[0].outcome).toBe('push');
    expect(s.settlement?.outcome).toBe('draw');
    expect(s.chips).toBe(START_CHIPS);
  });

  it('アップカード A でディーラー BJ なら、行動前に局が終わり最初の賭け金だけ失う', () => {
    const s = dealt([10, 1, 9, 13], { bet: 25 });
    expect(s.phase).toBe('settled');
    expect(s.settlement?.dealerPeekBlackjack).toBe(true);
    expect(s.settlement?.net).toBe(-25);
    expect(s.chips).toBe(START_CHIPS - 25);
    // 行動はもうできない
    expect(canHit(s)).toBe(false);
    expect(canDouble(s)).toBe(false);
  });

  it('アップカード 10 でディーラー BJ でも同じ（スプリットできる手でも行動前に終わる）', () => {
    const s = dealt([8, 13, 8, 1]);
    expect(s.phase).toBe('settled');
    expect(s.hands).toHaveLength(1);
    expect(s.settlement?.net).toBe(-10);
  });

  it('アップカードが 9 なら伏せ札を確かめない（伏せたまま手番へ）', () => {
    const s = dealt([10, 9, 7, 1]);
    expect(s.phase).toBe('player');
    expect(s.dealer[1].faceUp).toBe(false);
  });
});

describe('プレイヤーの行動', () => {
  it('ヒットで 1 枚増え、バーストしたら負けが確定する（ディーラーが後でバーストしても覆らない）', () => {
    // P: 10, 6 / D: 10, 6（伏せ）/ ヒットで 10 → 26 バースト。ディーラーは引かない
    let s = dealt([10, 10, 6, 6, 10, 10]);
    s = hit(s);
    expect(handValue(s.hands[0].cards).isBust).toBe(true);
    expect(s.phase).toBe('dealer');
    s = dealerPlay(s);
    // 全手バーストなのでディーラーは 16 のまま引かない
    expect(s.dealer).toHaveLength(2);
    expect(s.settlement?.hands[0].outcome).toBe('loss');
    expect(s.chips).toBe(START_CHIPS - 10);
  });

  it('プレイヤーとディーラーが両方バーストしても負け', () => {
    const base = dealt([10, 10, 6, 6, 10]);
    const busted = hit(base);
    // ディーラーの手を 22 以上にしても結果は変わらない
    const forced = dealerStep({
      ...dealerStep(busted),
      dealer: [c(10), c(6), c(10)],
    });
    expect(forced.settlement?.hands[0].outcome).toBe('loss');
  });

  it('21 に届いたら自動で終える', () => {
    let s = dealt([10, 9, 6, 8, 5]);
    s = hit(s);
    expect(handValue(s.hands[0].cards).best).toBe(21);
    expect(s.phase).toBe('dealer');
  });

  it('スタンドでディーラーの番。ディーラーは伏せ札をめくってから引く', () => {
    let s = dealt([10, 5, 9, 6, 10]);
    s = stand(s);
    expect(s.phase).toBe('dealer');
    s = dealerStep(s);
    expect(s.dealer[1].faceUp).toBe(true);
    expect(s.dealer).toHaveLength(2);
    s = dealerStep(s);
    expect(s.dealer).toHaveLength(3);
    s = dealerStep(s);
    expect(s.phase).toBe('settled');
    // ディーラー 5+6+10=21 対 19
    expect(s.settlement?.outcome).toBe('loss');
  });

  it('ディーラーがバーストしたら勝ち（1:1）', () => {
    let s = dealt([10, 10, 8, 6, 10], { bet: 50 });
    s = dealerPlay(stand(s));
    expect(s.settlement?.hands[0]).toEqual({ outcome: 'win', payout: 50 });
    expect(s.chips).toBe(START_CHIPS + 50);
  });

  it('同点は引き分けで戻し', () => {
    let s = dealt([10, 10, 10, 10]);
    s = dealerPlay(stand(s));
    expect(s.settlement?.outcome).toBe('draw');
    expect(s.chips).toBe(START_CHIPS);
  });

  it('ダブルダウンは 1 枚だけ引いて終わり、賭け金が 2 倍になる', () => {
    let s = dealt([6, 10, 5, 7, 2, 10], { bet: 25 });
    expect(canDouble(s)).toBe(true);
    s = doubleDown(s);
    expect(s.hands[0].cards).toHaveLength(3);
    expect(s.hands[0].bet).toBe(50);
    expect(s.hands[0].doubled).toBe(true);
    expect(s.chips).toBe(START_CHIPS - 50);
    expect(s.phase).toBe('dealer');
    // P: 13 対 D: 17 → 50 を失う
    s = dealerPlay(s);
    expect(s.settlement?.net).toBe(-50);
    expect(s.chips).toBe(START_CHIPS - 50);
  });

  it('ダブルダウンは最初の 2 枚のときだけ', () => {
    let s = dealt([2, 10, 3, 7, 2]);
    s = hit(s);
    expect(s.phase).toBe('player');
    expect(canDouble(s)).toBe(false);
    expect(doubleDown(s)).toBe(s);
  });

  it('チップが足りないとダブル・スプリットできない', () => {
    // 手持ち 10 で賭け金 10 → 配ったあと手持ち 0
    const s = dealt([8, 9, 8, 7], { chips: 10 });
    expect(s.chips).toBe(0);
    expect(canDouble(s)).toBe(false);
    expect(canSplit(s)).toBe(false);
    expect(split(s)).toBe(s);
  });
});

describe('スプリット', () => {
  it('同ランクだけ分けられる（K と Q は分けない）', () => {
    expect(canSplit(dealt([8, 9, 8, 7]))).toBe(true);
    expect(canSplit(dealt([13, 9, 12, 7]))).toBe(false);
  });

  it('2 手に分けて 1 枚ずつ配り、手ごとに精算する', () => {
    // P: 8, 8 / D: 10, 7 / 分けて 3 と 10 → 11 と 18
    let s = dealt([8, 10, 8, 7, 3, 10], { bet: 25 });
    s = split(s);
    expect(s.hands).toHaveLength(2);
    expect(s.hands.map((h) => h.cards.map((x) => x.rank))).toEqual([[8, 3], [8, 10]]);
    expect(s.chips).toBe(START_CHIPS - 50);
    expect(s.active).toBe(0);
    // 1 手目：ヒットで 2 → 13、スタンド
    s = stand(hit({ ...s, deck: [c(2), ...s.deck] }));
    expect(s.active).toBe(1);
    s = stand(s);
    s = dealerPlay(s);
    // 13 は負け、18 は勝ち（D 17）→ 収支 0 で引き分け扱い
    expect(s.settlement?.hands.map((h) => h.outcome)).toEqual(['loss', 'win']);
    expect(s.settlement?.net).toBe(0);
    expect(s.settlement?.outcome).toBe('draw');
    expect(s.chips).toBe(START_CHIPS);
  });

  it('スプリットは 1 回まで', () => {
    let s = dealt([8, 10, 8, 7, 8, 8]);
    s = split(s);
    expect(s.hands[0].cards.map((x) => x.rank)).toEqual([8, 8]);
    expect(canSplit(s)).toBe(false);
  });

  it('スプリット後はダブルできない（DAS なし）', () => {
    let s = dealt([5, 10, 5, 7, 6, 6]);
    s = split(s);
    expect(s.hands[0].cards).toHaveLength(2);
    expect(canDouble(s)).toBe(false);
  });

  it('A を分けたら 1 枚ずつで終わり、A+10 は 21 扱い（3:2 にならない）', () => {
    // P: A, A / D: 10, 7 / 分けて K と 9 → 21 と 20
    let s = dealt([1, 10, 1, 7, 13, 9], { bet: 50 });
    s = split(s);
    expect(s.hands.every((h) => h.done)).toBe(true);
    expect(s.hands.every((h) => h.cards.length === 2)).toBe(true);
    expect(s.phase).toBe('dealer');
    s = dealerPlay(s);
    expect(s.settlement?.hands).toEqual([
      { outcome: 'win', payout: 50 },
      { outcome: 'win', payout: 50 },
    ]);
    expect(s.chips).toBe(START_CHIPS + 100);
  });
});

describe('賭け金と設定', () => {
  it('賭け金は 3 段階で、手持ちを超える額は選べない', () => {
    expect([...BETS]).toEqual([10, 25, 50]);
    const s = { ...newSession(), chips: 30 };
    expect(canBet(s, 25)).toBe(true);
    expect(canBet(s, 50)).toBe(false);
    expect(setBet(s, 50).bet).toBe(10);
  });

  it('局の途中は賭け金もソフト 17 の設定も変えられない', () => {
    const s = dealt([10, 9, 7, 8]);
    expect(setBet(s, 50)).toBe(s);
    expect(setRules(s, { hitSoft17: true })).toBe(s);
  });

  it('精算後に次の局へ。手持ちが足りなければ届く段に下げる', () => {
    let s = dealt([10, 10, 6, 10], { bet: 50, chips: 80 });
    s = dealerPlay(stand(s));
    expect(s.chips).toBe(30);
    s = nextRound(s);
    expect(s.phase).toBe('betting');
    expect(s.bet).toBe(25);
    expect(s.hands).toHaveLength(0);
  });

  it('最小の賭け金に届かなければ「はじめから」', () => {
    expect(isBroke({ ...newSession(), chips: 9 })).toBe(true);
    expect(isBroke({ ...newSession(), chips: 10 })).toBe(false);
    let s = dealt([10, 10, 6, 10], { chips: 10 });
    s = dealerPlay(stand(s));
    expect(s.chips).toBe(0);
    expect(isBroke(s)).toBe(true);
  });

  it('記録の区分はソフト 17 の設定で分ける', () => {
    expect(variantOf({ hitSoft17: false })).toBe('s17');
    expect(variantOf({ hitSoft17: true })).toBe('h17');
  });
});

describe('記録', () => {
  it('1 局 1 プレイで plays が増え、勝敗が数えられる', () => {
    let e: RecordEntry = {};
    e = applyStart(e);
    e = applyHandRecord(e, 'win', 1010).entry;
    e = applyStart(e);
    e = applyHandRecord(e, 'loss', 1000).entry;
    e = applyStart(e);
    e = applyHandRecord(e, 'draw', 1000).entry;
    expect(e).toMatchObject({ plays: 3, wins: 1, losses: 1, draws: 1 });
  });

  it('bestScore（最高所持チップ）は 1,000 を超えたときだけ更新される', () => {
    const below = applyHandRecord({}, 'loss', 990);
    expect(below.entry.bestScore).toBeUndefined();
    expect(below.improved.score).toBe(false);

    const same = applyHandRecord({}, 'draw', 1000);
    expect(same.entry.bestScore).toBeUndefined();

    const up = applyHandRecord({}, 'win', 1025);
    expect(up.entry.bestScore).toBe(1025);
    expect(up.improved.score).toBe(true);

    const notBetter = applyHandRecord(up.entry, 'win', 1020);
    expect(notBetter.entry.bestScore).toBe(1025);
    expect(notBetter.improved.score).toBe(false);
  });

  it('平均用の scoreSum を積まない', () => {
    expect(applyHandRecord({}, 'win', 1100).entry.scoreSum).toBeUndefined();
  });
});
