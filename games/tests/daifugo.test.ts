import { describe, expect, it } from 'vitest';
import {
  applyPass,
  applyPlay,
  canBeat,
  cardLabel,
  chooseCpuPlay,
  classify,
  dealCards,
  DEFAULT_RULES,
  diamondThreeHolder,
  enumeratePlays,
  exchangeCards,
  finishRound,
  isLegalPlay,
  isReversed,
  JOKER_STRENGTH,
  legalPlays,
  LEVELS,
  makeDaifugoDeck,
  matchStandings,
  newMatch,
  placeOf,
  PLAYER_COUNT,
  RANK_POINTS,
  rankStrength,
  ROUNDS,
  shuffleCards,
  sortHand,
  standings,
  startNextRound,
  startRound,
  strengthOf,
  strengthRank,
  type DCard,
  type JokerCard,
  type Level,
  type NormalCard,
  type RoundState,
  type Rules,
} from '@/lib/daifugo';
import { seededRng } from '@/lib/cards';
import type { Rank, Suit } from '@/lib/cards';

/**
 * 大富豪（docs/features/game-daifugo.md）のテスト。
 *
 * 札は `N('spade', 5)` / `J()` で作る。id は作った順の通し番号で、
 * 同じ札でも別の id になるので「持っていない札を出す」のような検査もできる。
 */

let seq = 0;
const N = (suit: Suit, rank: Rank): NormalCard => ({ id: (seq += 1), joker: false, suit, rank });
const J = (): JokerCard => ({ id: (seq += 1), joker: true });

/** 手札4人ぶんから局面を作る。既定は8切り・革命・縛りON */
const round = (hands: DCard[][], over: Partial<RoundState> = {}): RoundState => {
  const rules: Rules = { ...DEFAULT_RULES, ...(over.rules ?? {}) };
  return { ...startRound(hands, 0, rules), ...over, rules };
};

/** 4人ぶんの空の手札に、指定した人の手札だけを差し込む */
const hands = (spec: Record<number, DCard[]>): DCard[][] =>
  Array.from({ length: PLAYER_COUNT }, (_, i) => spec[i] ?? []);

const ALL_LEVELS = Object.keys(LEVELS) as Level[];
const rng = () => seededRng(20260814);

describe('札と強さ', () => {
  it('3が最弱で2が最強。ジョーカーはさらに上', () => {
    expect(rankStrength(3)).toBe(1);
    expect(rankStrength(13)).toBe(11); // K
    expect(rankStrength(1)).toBe(12); // A
    expect(rankStrength(2)).toBe(13); // 2
    expect(strengthOf(J())).toBe(JOKER_STRENGTH);
    expect(JOKER_STRENGTH).toBeGreaterThan(rankStrength(2));
  });

  it('強さから数字へ戻せる（8切り・11バックの判定に使う）', () => {
    for (let s = 1; s <= 13; s += 1) expect(rankStrength(strengthRank(s))).toBe(s);
  });

  it('山は54枚（52枚＋ジョーカー2枚）で、idが重複しない', () => {
    const deck = makeDaifugoDeck();
    expect(deck).toHaveLength(54);
    expect(deck.filter((c) => c.joker)).toHaveLength(2);
    expect(new Set(deck.map((c) => c.id)).size).toBe(54);
  });

  it('4人に配ると14・14・13・13枚になる（54枚は割り切れない）', () => {
    const dealt = dealCards(makeDaifugoDeck());
    expect(dealt.map((h) => h.length)).toEqual([14, 14, 13, 13]);
    expect(dealt.flat()).toHaveLength(54);
    expect(new Set(dealt.flat().map((c) => c.id)).size).toBe(54);
  });

  it('同じ乱数なら同じ配り方になる（再現できる）', () => {
    const a = shuffleCards(makeDaifugoDeck(), rng()).map((c) => c.id);
    const b = shuffleCards(makeDaifugoDeck(), rng()).map((c) => c.id);
    expect(a).toEqual(b);
    expect(a).not.toEqual(makeDaifugoDeck().map((c) => c.id));
  });

  it('手札は弱い順に並ぶ', () => {
    const sorted = sortHand([N('spade', 2), J(), N('heart', 3), N('club', 1)]);
    expect(sorted.map(strengthOf)).toEqual([1, 12, 13, JOKER_STRENGTH]);
  });

  it('♦3 を持っている人が1回戦の親になる', () => {
    const three = N('diamond', 3);
    expect(diamondThreeHolder(hands({ 2: [three, N('spade', 5)] }))).toBe(2);
    // 誰も持っていなければ0番（配り方が変わっても落とさない）
    expect(diamondThreeHolder(hands({ 0: [N('spade', 5)] }))).toBe(0);
  });

  it('表示名はスート記号つき。ジョーカーだけ別扱い', () => {
    expect(cardLabel(N('spade', 1))).toBe('♠︎A');
    expect(cardLabel(J())).toBe('ジョーカー');
  });
});

describe('役の判定（classify）', () => {
  it('単騎・ペア・3枚・4枚は「同じ数字の組」', () => {
    expect(classify([N('spade', 5)])).toMatchObject({ kind: 'group', count: 1, strength: 3 });
    expect(classify([N('spade', 5), N('heart', 5)])).toMatchObject({ kind: 'group', count: 2 });
    const four = classify([N('spade', 5), N('heart', 5), N('club', 5), N('diamond', 5)]);
    expect(four).toMatchObject({ kind: 'group', count: 4 });
  });

  it('数字が違う2枚は役にならない', () => {
    expect(classify([N('spade', 5), N('heart', 6)])).toBeNull();
  });

  it('同じスートの3枚以上の連番は階段。強さはいちばん弱い札', () => {
    const play = classify([N('spade', 5), N('spade', 6), N('spade', 7)]);
    expect(play).toMatchObject({ kind: 'sequence', count: 3, strength: rankStrength(5) });
    expect(play!.suits).toEqual(['spade']);
  });

  it('スートが混ざった連番は階段にならない', () => {
    expect(classify([N('spade', 5), N('heart', 6), N('spade', 7)])).toBeNull();
  });

  it('2枚の連番は階段にならない（3枚から）', () => {
    expect(classify([N('spade', 5), N('spade', 6)])).toBeNull();
  });

  it('連番になっていなければ階段にならない', () => {
    expect(classify([N('spade', 5), N('spade', 6), N('spade', 9)])).toBeNull();
  });

  it('階段は 3 から 2 までつながる（A・2 をまたげる）', () => {
    // K・A・2 は強さ 11・12・13 の連番
    const play = classify([N('spade', 13), N('spade', 1), N('spade', 2)]);
    expect(play).toMatchObject({ kind: 'sequence', strength: rankStrength(13) });
    // 2 の上には何も無いので、2・3・4 のような折り返しは階段にならない
    expect(classify([N('spade', 2), N('spade', 3), N('spade', 4)])).toBeNull();
  });

  it('ジョーカーは足りない札の代わりになる（穴を埋める）', () => {
    const play = classify([N('spade', 5), J(), N('spade', 7)]);
    expect(play).toMatchObject({ kind: 'sequence', count: 3, strength: rankStrength(5) });
    expect(play!.suits).toEqual(['spade']);
  });

  it('ジョーカーは階段を上へ伸ばす（いちばん弱い札が起点）', () => {
    const play = classify([N('spade', 5), N('spade', 6), J()]);
    // 5・6・7 と読む（4・5・6 とは読まない。仕様の decide 規則）
    expect(play!.strength).toBe(rankStrength(5));
  });

  it('2 を超えるときだけ起点を下げる', () => {
    // A・2・ジョーカー は 2 の上に伸ばせないので K・A・2 と読む
    const play = classify([N('spade', 1), N('spade', 2), J()]);
    expect(play!.strength).toBe(rankStrength(13));
  });

  it('ジョーカーが足りなければ階段にならない', () => {
    expect(classify([N('spade', 5), J(), N('spade', 9)])).toBeNull();
  });

  it('同じ数字の組として読めるほうを優先する', () => {
    // ジョーカー2枚＋♠5 は「5の3枚」。階段（3・4・5 など）とは読まない
    expect(classify([J(), J(), N('spade', 5)])).toMatchObject({
      kind: 'group',
      strength: rankStrength(5),
    });
  });

  it('ジョーカーだけの役は最強。3枚以上は成立しない', () => {
    expect(classify([J()])).toMatchObject({ strength: JOKER_STRENGTH, allJokers: true });
    expect(classify([J(), J()])).toMatchObject({ count: 2, allJokers: true });
    expect(classify([J(), J(), J()])).toBeNull();
  });

  it('8とJを含むかを持つ（8切り・11バックの判定）', () => {
    expect(classify([N('spade', 8)])!.hasEight).toBe(true);
    expect(classify([N('spade', 7), N('spade', 8), N('spade', 9)])!.hasEight).toBe(true);
    // 階段の穴をジョーカーで埋めた8も8として扱う
    expect(classify([N('spade', 7), J(), N('spade', 9)])!.hasEight).toBe(true);
    expect(classify([N('spade', 11)])!.hasJack).toBe(true);
    // ジョーカーだけの役は数字を持たないので、どちらにもならない
    expect(classify([J()])!.hasEight).toBe(false);
    expect(classify([J()])!.hasJack).toBe(false);
  });

  it('空・重複した札は役にならない（壊れた選択で落ちない）', () => {
    expect(classify([])).toBeNull();
    const same = N('spade', 5);
    expect(classify([same, same])).toBeNull();
  });
});

describe('場に出せるか（canBeat）', () => {
  const field = (cards: DCard[], over: Partial<RoundState> = {}): RoundState =>
    round(hands({}), { field: classify(cards), ...over });

  it('場が空なら何でも出せる', () => {
    expect(canBeat(round(hands({})), classify([N('spade', 3)])!)).toBe(true);
  });

  it('強い札なら出せる。同じ・弱いは出せない', () => {
    const s = field([N('spade', 7)]);
    expect(canBeat(s, classify([N('heart', 9)])!)).toBe(true);
    expect(canBeat(s, classify([N('heart', 7)])!)).toBe(false);
    expect(canBeat(s, classify([N('heart', 5)])!)).toBe(false);
  });

  it('枚数と種類が同じでなければ出せない', () => {
    const s = field([N('spade', 7), N('heart', 7)]);
    expect(canBeat(s, classify([N('club', 9)])!)).toBe(false);
    expect(canBeat(s, classify([N('club', 9), N('diamond', 9)])!)).toBe(true);
    // 同じ3枚でも、組と階段は別の役
    const seqField = field([N('spade', 5), N('spade', 6), N('spade', 7)]);
    expect(canBeat(seqField, classify([N('club', 9), N('diamond', 9), N('heart', 9)])!)).toBe(false);
    expect(canBeat(seqField, classify([N('club', 6), N('club', 7), N('club', 8)])!)).toBe(true);
  });

  it('ジョーカー単騎はどの札より強い', () => {
    expect(canBeat(field([N('spade', 2)]), classify([J()])!)).toBe(true);
    expect(canBeat(field([J()]), classify([N('spade', 2)])!)).toBe(false);
  });

  it('革命中は強さが逆転する。ただしジョーカーは最強のまま', () => {
    const s = field([N('spade', 7)], { revolution: true });
    expect(isReversed(s)).toBe(true);
    expect(canBeat(s, classify([N('heart', 5)])!)).toBe(true);
    expect(canBeat(s, classify([N('heart', 9)])!)).toBe(false);
    expect(canBeat(s, classify([J()])!)).toBe(true);
  });

  it('革命と11バックが重なると打ち消し合う', () => {
    const s = field([N('spade', 7)], { revolution: true, jackBack: true });
    expect(isReversed(s)).toBe(false);
    expect(canBeat(s, classify([N('heart', 9)])!)).toBe(true);
  });

  it('縛り中はそのスートしか出せない（ジョーカーは何にでもなる）', () => {
    const s = field([N('spade', 7)], { lock: ['spade'] });
    expect(canBeat(s, classify([N('spade', 9)])!)).toBe(true);
    expect(canBeat(s, classify([N('heart', 9)])!)).toBe(false);
    expect(canBeat(s, classify([J()])!)).toBe(true);
  });

  it('スペ3返しはルールONのときだけ効く', () => {
    const on = field([J()], { rules: { ...DEFAULT_RULES, spadeThree: true } });
    expect(canBeat(on, classify([N('spade', 3)])!)).toBe(true);
    // ♦3 では返せない
    expect(canBeat(on, classify([N('diamond', 3)])!)).toBe(false);
    const off = field([J()]);
    expect(canBeat(off, classify([N('spade', 3)])!)).toBe(false);
  });
});

describe('着手（applyPlay）', () => {
  it('出した札が手札から減り、手番が次に回る', () => {
    const five = N('spade', 5);
    const s = round(hands({ 0: [five, N('heart', 9)], 1: [N('club', 6)] }));
    const next = applyPlay(s, [five]);
    expect(next.hands[0]).toHaveLength(1);
    expect(next.field!.strength).toBe(rankStrength(5));
    expect(next.turn).toBe(1);
    expect(next.leader).toBe(0);
    // 元の局面は書き換わらない
    expect(s.hands[0]).toHaveLength(2);
  });

  it('持っていない札・成立しない役は出せない', () => {
    const s = round(hands({ 0: [N('spade', 5)], 1: [N('club', 6)] }));
    expect(applyPlay(s, [N('heart', 9)])).toBe(s);
    expect(isLegalPlay(s, [N('heart', 9)])).toBe(false);
    expect(applyPlay(s, [])).toBe(s);
  });

  it('場より弱い札は出せない', () => {
    const weak = N('spade', 5);
    const s = round(hands({ 0: [N('heart', 9)], 1: [weak] }), {
      field: classify([N('heart', 9)]),
      turn: 1,
      leader: 0,
    });
    expect(applyPlay(s, [weak])).toBe(s);
  });

  it('8切りで場が流れ、同じ人が続けて出す', () => {
    const eight = N('spade', 8);
    const s = round(hands({ 0: [eight, N('heart', 9)], 1: [N('club', 10)], 2: [N('club', 11)] }));
    const next = applyPlay(s, [eight]);
    expect(next.field).toBeNull();
    expect(next.turn).toBe(0);
    expect(next.leader).toBe(0);
    expect(next.events.map((e) => e.kind)).toContain('eight-cut');
  });

  it('8切りOFFなら普通に手番が回る', () => {
    const eight = N('spade', 8);
    const s = round(hands({ 0: [eight, N('heart', 9)], 1: [N('club', 10)] }), {
      rules: { ...DEFAULT_RULES, eightCut: false },
    });
    const next = applyPlay(s, [eight]);
    expect(next.field).not.toBeNull();
    expect(next.turn).toBe(1);
  });

  it('同じ数字4枚で革命。もう一度出すと元に戻る', () => {
    const four = [N('spade', 5), N('heart', 5), N('club', 5), N('diamond', 5)];
    const s = round(hands({ 0: [...four, N('heart', 9)], 1: [N('club', 10)] }));
    const next = applyPlay(s, four);
    expect(next.revolution).toBe(true);
    expect(next.events.map((e) => e.kind)).toContain('revolution');

    const back = [N('spade', 6), N('heart', 6), N('club', 6), N('diamond', 6)];
    const s2 = round(hands({ 0: [...back, N('heart', 9)] }), { revolution: true });
    const next2 = applyPlay(s2, back);
    expect(next2.revolution).toBe(false);
    expect(next2.events.map((e) => e.kind)).toContain('counter-revolution');
  });

  it('革命OFFなら4枚出しても逆転しない', () => {
    const four = [N('spade', 5), N('heart', 5), N('club', 5), N('diamond', 5)];
    const s = round(hands({ 0: [...four, N('heart', 9)] }), {
      rules: { ...DEFAULT_RULES, revolution: false },
    });
    expect(applyPlay(s, four).revolution).toBe(false);
  });

  it('同じスート構成が続くと縛りが成立し、以後はそのスートだけになる', () => {
    const a = N('spade', 5);
    const b = N('spade', 9);
    const queen = N('heart', 12);
    const s = round(hands({ 0: [a], 1: [b, N('heart', 11)], 2: [queen] }));
    const afterFirst = applyPlay(s, [a]);
    expect(afterFirst.lock).toBeNull();

    const locked = applyPlay(afterFirst, [b]);
    expect(locked.lock).toEqual(['spade']);
    expect(locked.events.map((e) => e.kind)).toContain('lock');
    // ♥のQは強いが、縛りのせいで出せない（スートを外せば出せる）
    expect(locked.turn).toBe(2);
    expect(isLegalPlay(locked, [queen])).toBe(false);
    expect(isLegalPlay({ ...locked, lock: null }, [queen])).toBe(true);
  });

  it('縛りOFFなら成立しない', () => {
    const a = N('spade', 5);
    const b = N('spade', 9);
    const s = round(hands({ 0: [a], 1: [b] }), {
      rules: { ...DEFAULT_RULES, suitLock: false },
    });
    expect(applyPlay(applyPlay(s, [a]), [b]).lock).toBeNull();
  });

  it('11バックONだとJでその場だけ逆転し、場が流れると戻る', () => {
    const jack = N('spade', 11);
    const queen = N('club', 12);
    const four = N('club', 4);
    const s = round(hands({ 0: [jack, N('heart', 3)], 1: [queen], 2: [four] }), {
      rules: { ...DEFAULT_RULES, jackBack: true },
    });
    const next = applyPlay(s, [jack]);
    expect(next.jackBack).toBe(true);
    // 逆転しているのでQは出せず、4なら出せる
    expect(isLegalPlay(next, [queen])).toBe(false);
    expect(isLegalPlay({ ...next, turn: 2 }, [four])).toBe(true);

    // 全員パスで場が流れたら11バックは解ける
    const cleared = applyPass(applyPass(applyPass(next)));
    expect(cleared.jackBack).toBe(false);
    expect(cleared.field).toBeNull();
  });

  it('スペ3返しでジョーカー単騎を流せる', () => {
    const joker = J();
    const three = N('spade', 3);
    const s = round(hands({ 0: [joker, N('heart', 9)], 1: [three, N('club', 10)] }), {
      rules: { ...DEFAULT_RULES, spadeThree: true },
    });
    const played = applyPlay(s, [joker]);
    expect(played.turn).toBe(1);
    const returned = applyPlay(played, [three]);
    expect(returned.field).toBeNull();
    expect(returned.turn).toBe(1);
    expect(returned.events.map((e) => e.kind)).toContain('spade-three');
  });
});

describe('パスと場の流れ', () => {
  it('場が空のときはパスできない', () => {
    const s = round(hands({ 0: [N('spade', 5)] }));
    expect(applyPass(s)).toBe(s);
  });

  it('他が全員パスしたら場が流れ、出した人から再開する', () => {
    const s = round(
      hands({
        0: [N('spade', 5), N('heart', 6)],
        1: [N('club', 3)],
        2: [N('club', 4)],
        3: [N('diamond', 4)],
      }),
    );
    const played = applyPlay(s, [s.hands[0][0]]);
    const p1 = applyPass(played);
    expect(p1.turn).toBe(2);
    const p2 = applyPass(p1);
    expect(p2.turn).toBe(3);
    const p3 = applyPass(p2);
    expect(p3.field).toBeNull();
    expect(p3.turn).toBe(0);
    expect(p3.passed.every((p) => !p)).toBe(true);
    expect(p3.lock).toBeNull();
  });

  it('パスした人はその場では飛ばされる', () => {
    const s = round(
      hands({
        0: [N('spade', 5), N('heart', 6)],
        1: [N('club', 7)],
        2: [N('club', 9), N('club', 10)],
        3: [N('diamond', 11)],
      }),
    );
    const played = applyPlay(s, [s.hands[0][0]]);
    const passed1 = applyPass(played); // P1がパス
    const p2 = applyPlay(passed1, [passed1.hands[2][0]]); // P2が9を出す
    expect(p2.turn).toBe(3);
    const p3 = applyPlay(p2, [p2.hands[3][0]]); // P3がJを出す
    // P1はパス済みなので飛ばされてP0に戻る
    expect(p3.turn).toBe(0);
  });
});

describe('上がりと順位', () => {
  it('手札が無くなったら上がり。残り1人になったら決着', () => {
    const s = round(
      hands({ 0: [N('spade', 5)], 1: [N('club', 7)], 2: [N('club', 9)], 3: [N('diamond', 11)] }),
    );
    let next = applyPlay(s, s.hands[0][0] ? [s.hands[0][0]] : []);
    expect(next.out).toEqual([0]);
    next = applyPlay(next, [next.hands[1][0]]);
    next = applyPlay(next, [next.hands[2][0]]);
    // 3人が上がった時点で残りは1人なので決着
    expect(next.finished).toBe(true);
    expect(standings(next)).toEqual([0, 1, 2, 3]);
  });

  it('上がった人を飛ばして手番が回る', () => {
    const s = round(
      hands({ 0: [N('spade', 5)], 1: [N('club', 7), N('club', 8)], 2: [N('club', 9)] }),
    );
    const out = applyPlay(s, [s.hands[0][0]]);
    expect(out.turn).toBe(1);
    const p1 = applyPass(out);
    const p2 = applyPass(p1);
    // 上がった0番は飛ばされ、場を出した0番も居ないので次の生き残りから
    expect(p2.field).toBeNull();
    expect(p2.turn).toBe(1);
  });

  it('都落ちONだと、前回の大富豪が1位を逃した瞬間に最下位が確定する', () => {
    const s = round(
      hands({
        0: [N('spade', 5)],
        1: [N('club', 7), N('club', 8)],
        2: [N('club', 9)],
        3: [N('diamond', 11)],
      }),
      { rules: { ...DEFAULT_RULES, cityFall: true }, previousTop: 1 },
    );
    const next = applyPlay(s, [s.hands[0][0]]);
    expect(next.dropped).toBe(1);
    expect(next.hands[1]).toEqual([]);
    expect(next.events.map((e) => e.kind)).toContain('city-fall');
  });

  it('都落ちOFFなら落ちない', () => {
    const s = round(
      hands({ 0: [N('spade', 5)], 1: [N('club', 7), N('club', 8)], 2: [N('club', 9)] }),
      { previousTop: 1 },
    );
    expect(applyPlay(s, [s.hands[0][0]]).dropped).toBeNull();
  });

  it('前回の大富豪が1位で上がれば都落ちしない', () => {
    const s = round(
      hands({ 0: [N('spade', 5)], 1: [N('club', 7), N('club', 8)], 2: [N('club', 9)] }),
      { rules: { ...DEFAULT_RULES, cityFall: true }, previousTop: 0 },
    );
    expect(applyPlay(s, [s.hands[0][0]]).dropped).toBeNull();
  });

  it('都落ちした人は順位の最後に置かれる', () => {
    const s = round(
      hands({
        0: [N('spade', 5)],
        1: [N('club', 7), N('club', 8)],
        2: [N('club', 9)],
        3: [N('diamond', 11)],
      }),
      { rules: { ...DEFAULT_RULES, cityFall: true }, previousTop: 1 },
    );
    let next = applyPlay(s, [s.hands[0][0]]); // P0が上がり、P1が都落ち
    next = applyPlay(next, [next.hands[2][0]]);
    expect(next.finished).toBe(true);
    expect(standings(next)).toEqual([0, 2, 3, 1]);
  });
});

describe('出せる手の数え上げ', () => {
  it('同じ数字の組と階段をどちらも見つける', () => {
    const hand = [N('spade', 5), N('heart', 5), N('spade', 6), N('spade', 7)];
    const plays = enumeratePlays(hand);
    const kinds = plays.map((p) => `${p.kind}:${p.count}`);
    expect(kinds).toContain('group:1');
    expect(kinds).toContain('group:2');
    expect(kinds).toContain('sequence:3');
  });

  it('同じ札の集合を二重に数えない', () => {
    const hand = [N('spade', 5), N('spade', 6), J()];
    const keys = enumeratePlays(hand).map((p) =>
      p.cards
        .map((c) => c.id)
        .sort((a, b) => a - b)
        .join(','),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('ジョーカーだけの階段は作らない', () => {
    const plays = enumeratePlays([J(), J(), N('spade', 5)]);
    expect(plays.every((p) => p.kind === 'group')).toBe(true);
  });

  it('組は4枚まで（ジョーカーを足しても5枚にならない）', () => {
    const hand = [N('spade', 5), N('heart', 5), N('club', 5), N('diamond', 5), J(), J()];
    const groups = enumeratePlays(hand).filter((p) => p.kind === 'group');
    expect(Math.max(...groups.map((p) => p.count))).toBe(4);
  });

  it('legalPlays は場に出せる役だけを返す', () => {
    const s = round(hands({ 0: [N('spade', 5), N('heart', 9), N('club', 2)] }), {
      field: classify([N('diamond', 10)]),
    });
    const plays = legalPlays(s);
    expect(plays.map((p) => p.strength)).toEqual([rankStrength(2)]);
    for (const play of plays) expect(isLegalPlay(s, play.cards)).toBe(true);
  });

  it('決着した局面では何も返さない', () => {
    const s = round(hands({ 0: [N('spade', 5)] }), { finished: true });
    expect(legalPlays(s)).toEqual([]);
  });
});

describe('CPU', () => {
  it('3段階ある', () => {
    expect(ALL_LEVELS).toEqual(['easy', 'normal', 'hard']);
    expect(Object.values(LEVELS).map((l) => l.label)).toEqual(['かんたん', 'ふつう', 'つよい']);
  });

  it('出せる役が無ければパス（null）を返す', () => {
    const s = round(hands({ 0: [N('spade', 3)] }), { field: classify([N('diamond', 2)]) });
    for (const level of ALL_LEVELS) {
      expect(chooseCpuPlay(s, level, { rng: rng() })).toBeNull();
    }
  });

  it('返す役は必ず出せる手になっている', () => {
    const s = round(hands({ 0: [N('spade', 5), N('heart', 5), N('club', 9), J()] }), {
      field: classify([N('diamond', 4), N('diamond', 4)] as DCard[]) ?? null,
    });
    for (const level of ALL_LEVELS) {
      const cards = chooseCpuPlay(s, level, { rng: rng() });
      if (cards === null) continue;
      expect(isLegalPlay(s, cards)).toBe(true);
    }
  });

  it('どの段階でも上がれる手は必ず出す', () => {
    const s = round(hands({ 0: [N('spade', 9), N('heart', 9)] }), {
      field: classify([N('diamond', 4), N('club', 4)]),
    });
    for (const level of ALL_LEVELS) {
      const cards = chooseCpuPlay(s, level, { rng: rng() });
      expect(cards).toHaveLength(2);
      expect(applyPlay(s, cards!).out).toEqual([0]);
    }
  });

  it('ふつうは弱い役から出す（切り札を先に切らない）', () => {
    const s = round(hands({ 0: [N('spade', 5), N('heart', 9), N('club', 2), J()] }));
    const cards = chooseCpuPlay(s, 'normal', { rng: rng() })!;
    expect(cards.some((c) => c.joker || (!c.joker && c.rank === 2))).toBe(false);
  });

  it('つよいは手札が多いうちに2やジョーカーを切らない（見送る）', () => {
    // 場は2。返せるのはジョーカーだけだが、手札はまだ多いので温存する
    const s = round(
      hands({
        0: [J(), N('spade', 5), N('heart', 6), N('club', 7), N('diamond', 9), N('spade', 10)],
        1: [N('club', 3), N('club', 4), N('club', 5), N('club', 6)],
      }),
      { field: classify([N('diamond', 2)]) },
    );
    expect(chooseCpuPlay(s, 'hard', { rng: rng() })).toBeNull();
    // ふつうは温存を知らないので出してしまう
    expect(chooseCpuPlay(s, 'normal', { rng: rng() })).not.toBeNull();
  });

  it('つよいは誰かが上がりそうなら切り札でも止めにいく', () => {
    const s = round(
      hands({
        0: [J(), N('spade', 5), N('heart', 6), N('club', 7), N('diamond', 9), N('spade', 10)],
        1: [N('club', 3)],
      }),
      { field: classify([N('diamond', 2)]) },
    );
    expect(chooseCpuPlay(s, 'hard', { rng: rng() })).not.toBeNull();
  });

  it('CPUだけで回戦を最後まで指し切れる', () => {
    const r = rng();
    let state = startRound(dealCards(shuffleCards(makeDaifugoDeck(), r)), 0);
    // 54枚しかないので、進行が止まらなければこの回数で必ず決着する
    for (let i = 0; i < 500 && !state.finished; i += 1) {
      const cards = chooseCpuPlay(state, i % 2 === 0 ? 'hard' : 'normal', { rng: r });
      state = cards === null ? applyPass(state) : applyPlay(state, cards);
    }
    expect(state.finished).toBe(true);
    expect(standings(state)).toHaveLength(PLAYER_COUNT);
    expect(new Set(standings(state)).size).toBe(PLAYER_COUNT);
  });

  it('すべてのローカルルールをONにしても指し切れる', () => {
    const r = seededRng(99);
    const rules: Rules = {
      eightCut: true,
      revolution: true,
      suitLock: true,
      sequence: true,
      cityFall: true,
      jackBack: true,
      spadeThree: true,
      fiveSkip: true,
      nineReverse: true,
    };
    let state = startRound(dealCards(shuffleCards(makeDaifugoDeck(), r)), 0, rules, 1);
    for (let i = 0; i < 500 && !state.finished; i += 1) {
      const cards = chooseCpuPlay(state, 'hard', { rng: r });
      state = cards === null ? applyPass(state) : applyPlay(state, cards);
    }
    expect(state.finished).toBe(true);
    expect(new Set(standings(state)).size).toBe(PLAYER_COUNT);
  });
});

describe('カード交換', () => {
  it('大貧民は強い2枚、大富豪は弱い2枚を渡す', () => {
    const rich = sortHand([N('spade', 3), N('heart', 4), N('club', 13)]);
    const poor = sortHand([N('diamond', 5), N('spade', 2), J()]);
    const dealt = [rich, [], [], poor];
    const { hands: after, log } = exchangeCards(dealt, [0, 1, 2, 3]);

    // 大貧民の最強2枚（2 とジョーカー）が大富豪へ
    expect(after[0].map(strengthOf)).toContain(JOKER_STRENGTH);
    expect(after[0].map(strengthOf)).toContain(rankStrength(2));
    // 大富豪の最弱2枚（3・4）が大貧民へ
    expect(after[3].map(strengthOf)).toEqual([rankStrength(3), rankStrength(4), rankStrength(5)]);
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({ from: 3, to: 0 });
  });

  it('枚数は変わらない', () => {
    const dealt = dealCards(shuffleCards(makeDaifugoDeck(), rng()));
    const before = dealt.map((h) => h.length);
    const { hands: after } = exchangeCards(dealt, [1, 0, 3, 2]);
    expect(after.map((h) => h.length)).toEqual(before);
    expect(new Set(after.flat().map((c) => c.id)).size).toBe(54);
  });

  it('富豪と貧民は1枚ずつ交換する', () => {
    const fugo = sortHand([N('spade', 3), N('heart', 10)]);
    const hinmin = sortHand([N('diamond', 6), N('club', 2)]);
    const { hands: after } = exchangeCards([[], fugo, hinmin, []], [0, 1, 2, 3]);
    expect(after[1].map(strengthOf)).toContain(rankStrength(2));
    expect(after[2].map(strengthOf)).toContain(rankStrength(3));
  });
});

describe('試合（5回戦）', () => {
  it('1回戦は ♦3 を持っている人から始まる', () => {
    const match = newMatch('normal', DEFAULT_RULES, rng());
    expect(match.round).toBe(1);
    expect(match.scores).toEqual([0, 0, 0, 0]);
    expect(match.state.hands[match.state.turn].some((c) => !c.joker && c.suit === 'diamond' && c.rank === 3)).toBe(true);
  });

  it('順位に応じて 3・2・1・0 点が入る', () => {
    const match = newMatch('normal', DEFAULT_RULES, rng());
    const done = finishRound({
      ...match,
      state: { ...match.state, out: [2, 0, 1, 3], finished: true },
    });
    expect(done.scores[2]).toBe(RANK_POINTS[0]);
    expect(done.scores[0]).toBe(RANK_POINTS[1]);
    expect(done.scores[1]).toBe(RANK_POINTS[2]);
    expect(done.scores[3]).toBe(RANK_POINTS[3]);
    expect(done.lastStandings).toEqual([2, 0, 1, 3]);
  });

  it('次の回戦は前回の大貧民が親になり、都落ちの基準に前回の大富豪が入る', () => {
    const match = finishRound({
      ...newMatch('normal', DEFAULT_RULES, rng()),
      state: { ...newMatch('normal', DEFAULT_RULES, rng()).state, out: [2, 0, 1, 3], finished: true },
    });
    const next = startNextRound(match, rng());
    expect(next.round).toBe(2);
    expect(next.state.turn).toBe(3);
    expect(next.state.previousTop).toBe(2);
    expect(next.exchange).toHaveLength(4);
    expect(next.state.hands.flat()).toHaveLength(54);
  });

  it('5回戦で終わり、それ以上は進まない', () => {
    let match = newMatch('normal', DEFAULT_RULES, rng());
    for (let i = 0; i < ROUNDS; i += 1) {
      match = finishRound({ ...match, state: { ...match.state, out: [0, 1, 2, 3], finished: true } });
      if (!match.finished) match = startNextRound(match, rng());
    }
    expect(match.round).toBe(ROUNDS);
    expect(match.finished).toBe(true);
    expect(startNextRound(match, rng())).toBe(match);
    expect(match.scores[0]).toBe(RANK_POINTS[0] * ROUNDS);
  });

  it('通算点で最終の階級が決まる', () => {
    const match = { ...newMatch('normal', DEFAULT_RULES, rng()), scores: [5, 9, 2, 7] };
    expect(matchStandings(match)).toEqual([1, 3, 0, 2]);
    expect(placeOf(match, 1)).toBe(0);
    expect(placeOf(match, 2)).toBe(3);
  });

  it('同点は前回の順位が上のほうを上に置く', () => {
    const match = {
      ...newMatch('normal', DEFAULT_RULES, rng()),
      scores: [6, 6, 1, 1],
      lastStandings: [1, 0, 3, 2],
    };
    expect(matchStandings(match).slice(0, 2)).toEqual([1, 0]);
  });

  it('CPU4人で5回戦を通しても破綻しない', () => {
    const r = seededRng(4242);
    let match = newMatch('hard', DEFAULT_RULES, r);
    for (let round = 0; round < ROUNDS; round += 1) {
      for (let i = 0; i < 500 && !match.state.finished; i += 1) {
        const cards = chooseCpuPlay(match.state, 'normal', { rng: r });
        match = {
          ...match,
          state: cards === null ? applyPass(match.state) : applyPlay(match.state, cards),
        };
      }
      expect(match.state.finished).toBe(true);
      match = finishRound(match);
      if (!match.finished) match = startNextRound(match, r);
    }
    expect(match.finished).toBe(true);
    const total = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);
    expect(total(match.scores)).toBe(total(RANK_POINTS) * ROUNDS);
    expect(new Set(matchStandings(match)).size).toBe(PLAYER_COUNT);
  });
});

describe('5飛ばし', () => {
  it('OFFなら次の人の番になる', () => {
    const state = round(hands({ 0: [N('spade', 5)], 1: [N('club', 6)], 2: [N('heart', 7)], 3: [N('club', 9)] }), {
      rules: { ...DEFAULT_RULES, fiveSkip: false },
    });
    expect(applyPlay(state, [state.hands[0][0]]).turn).toBe(1);
  });

  it('1枚出すと次の1人を飛ばす', () => {
    const state = round(hands({ 0: [N('spade', 5)], 1: [N('club', 6)], 2: [N('heart', 7)], 3: [N('club', 9)] }), {
      rules: { ...DEFAULT_RULES, fiveSkip: true },
    });
    const next = applyPlay(state, [state.hands[0][0]]);
    expect(next.turn).toBe(2);
    expect(next.events.some((e) => e.kind === 'five-skip')).toBe(true);
  });

  it('2枚出すと2人ぶん飛ばす', () => {
    const state = round(
      hands({
        0: [N('spade', 5), N('heart', 5)],
        1: [N('club', 6), N('diamond', 6)],
        2: [N('heart', 7), N('spade', 7)],
        3: [N('club', 9), N('spade', 9)],
      }),
      { rules: { ...DEFAULT_RULES, fiveSkip: true } },
    );
    expect(applyPlay(state, state.hands[0]).turn).toBe(3);
  });

  it('飛ばしても自分の番には戻らない（4人戦で3人ぶん飛ばしたとき）', () => {
    const state = round(
      hands({
        0: [N('spade', 5), N('heart', 5), N('club', 5)],
        1: [N('club', 6), N('diamond', 6), N('spade', 6)],
        2: [N('heart', 7), N('spade', 7), N('club', 7)],
        3: [N('club', 9), N('spade', 9), N('heart', 9)],
      }),
      { rules: { ...DEFAULT_RULES, fiveSkip: true } },
    );
    const next = applyPlay(state, state.hands[0]);
    expect(next.turn).not.toBe(0);
  });

  it('ジョーカーだけの役は5飛ばしにならない', () => {
    const state = round(hands({ 0: [J()], 1: [N('club', 6)], 2: [N('heart', 7)], 3: [N('club', 9)] }), {
      rules: { ...DEFAULT_RULES, fiveSkip: true },
    });
    expect(applyPlay(state, state.hands[0]).turn).toBe(1);
  });
});

describe('9リバース', () => {
  it('OFFなら向きは変わらない', () => {
    const state = round(hands({ 0: [N('spade', 9)], 1: [N('club', 10)], 2: [N('heart', 11)], 3: [N('club', 12)] }), {
      rules: { ...DEFAULT_RULES, nineReverse: false },
    });
    const next = applyPlay(state, state.hands[0]);
    expect(next.direction).toBe(1);
    expect(next.turn).toBe(1);
  });

  it('9を出すと逆回りになり、手番が前の席へ回る', () => {
    const state = round(hands({ 0: [N('spade', 9)], 1: [N('club', 10)], 2: [N('heart', 11)], 3: [N('club', 12)] }), {
      rules: { ...DEFAULT_RULES, nineReverse: true },
    });
    const next = applyPlay(state, state.hands[0]);
    expect(next.direction).toBe(-1);
    expect(next.turn).toBe(3);
    expect(next.events.some((e) => e.kind === 'nine-reverse')).toBe(true);
  });

  it('もう一度9が出ると元の向きに戻る', () => {
    const first = round(
      hands({ 0: [N('spade', 9)], 1: [N('club', 10)], 2: [N('heart', 11)], 3: [N('club', 9), N('spade', 3)] }),
      { rules: { ...DEFAULT_RULES, nineReverse: true } },
    );
    const afterFirst = applyPlay(first, first.hands[0]);
    expect(afterFirst.direction).toBe(-1);

    // 同じ数字は場に勝てないので、場が流れて3の番になった状態から出す
    const cleared: RoundState = {
      ...afterFirst,
      field: null,
      passed: afterFirst.passed.map(() => false),
      turn: 3,
      leader: 3,
    };
    // 手札は強さ順に並べ替えられるので、添字ではなく数字で9を探す
    const nine = cleared.hands[3].find((c) => !c.joker && c.rank === 9)!;
    const afterSecond = applyPlay(cleared, [nine]);
    expect(afterSecond.direction).toBe(1);
  });

  it('場が流れても向きは戻らない（その回戦のあいだ続く）', () => {
    const state = round(hands({ 0: [N('spade', 9)], 1: [N('club', 10)], 2: [N('heart', 11)], 3: [N('club', 12)] }), {
      rules: { ...DEFAULT_RULES, nineReverse: true, eightCut: true },
    });
    let next = applyPlay(state, state.hands[0]);
    // 全員パスさせて場を流す
    for (let i = 0; i < PLAYER_COUNT && next.field; i += 1) next = applyPass(next);
    expect(next.direction).toBe(-1);
  });
});

describe('階段のON/OFF', () => {
  const seqHand = [N('spade', 4), N('spade', 5), N('spade', 6)];

  it('ONなら階段を出せる', () => {
    const state = round(hands({ 0: seqHand }), { rules: { ...DEFAULT_RULES, sequence: true } });
    expect(isLegalPlay(state, state.hands[0])).toBe(true);
  });

  it('OFFなら階段は出せない', () => {
    const state = round(hands({ 0: seqHand }), { rules: { ...DEFAULT_RULES, sequence: false } });
    expect(isLegalPlay(state, state.hands[0])).toBe(false);
  });

  it('OFFでも同じ数字の組は出せる', () => {
    const state = round(hands({ 0: [N('spade', 4), N('heart', 4)] }), {
      rules: { ...DEFAULT_RULES, sequence: false },
    });
    expect(isLegalPlay(state, state.hands[0])).toBe(true);
  });

  it('OFFのときCPUの候補にも階段が出てこない', () => {
    const state = round(hands({ 0: seqHand }), { rules: { ...DEFAULT_RULES, sequence: false } });
    expect(legalPlays(state).every((p) => p.kind !== 'sequence')).toBe(true);
  });
});

describe('ローカルルールを全部ONにしても破綻しない', () => {
  it('CPU4人で5回戦を通せる', () => {
    const all: Rules = {
      eightCut: true,
      revolution: true,
      suitLock: true,
      sequence: true,
      cityFall: true,
      jackBack: true,
      spadeThree: true,
      fiveSkip: true,
      nineReverse: true,
    };
    const r = seededRng(777);
    let match = newMatch('hard', all, r);
    for (let roundNo = 0; roundNo < 5; roundNo += 1) {
      for (let i = 0; i < 800 && !match.state.finished; i += 1) {
        const cards = chooseCpuPlay(match.state, 'normal', { rng: r });
        match = {
          ...match,
          state: cards === null ? applyPass(match.state) : applyPlay(match.state, cards),
        };
      }
      expect(match.state.finished).toBe(true);
      match = finishRound(match);
      if (!match.finished) match = startNextRound(match, r);
    }
    expect(match.finished).toBe(true);
  });
});
