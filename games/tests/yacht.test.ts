import { describe, expect, it } from 'vitest';
import { seededRng } from '@/lib/cards';
import {
  bestCategory,
  bonusIncentive,
  bonusReachable,
  canRoll,
  canScore,
  CATEGORIES,
  CATEGORY_LABEL,
  chooseCategory,
  chooseHold,
  DICE_COUNT,
  emptySheet,
  expectedAfterReroll,
  faceCounts,
  FACES,
  hasRolled,
  initialState,
  isSheetFull,
  isUpper,
  L_STRAIGHT_SCORE,
  LEVELS,
  LOWER_CATEGORIES,
  lowerSubtotal,
  openCategories,
  outcomeOf,
  pipSum,
  ROLLS_PER_TURN,
  ROUNDS,
  rollDice,
  rollOutcomes,
  S_STRAIGHT_SCORE,
  scoreCategory,
  scoreFor,
  setHold,
  toggleHold,
  totalScore,
  UPPER_BONUS,
  UPPER_CATEGORIES,
  UPPER_TARGET,
  upperBonus,
  upperRemainingMax,
  upperSubtotal,
  YACHT_SCORE,
  type Category,
  type Level,
  type Sheet,
  type YachtState,
} from '@/lib/yacht';

/**
 * ヨットのテスト（docs/features/game-yacht.md）。
 *
 * 見張るのは3つ。
 * 1. 役の点数（境界値。1つ足りない・1つ多い出目で0点になること）
 * 2. 進行（振る・キープ・記入・終局と、不正な手が黙って捨てられること）
 * 3. CPU（記入済みの役を選ばない・強いほうが上段ボーナスを狙う）
 */

/** 出目の並びは役に関係しないので、テストからは素の配列で渡す */
const dice = (...faces: number[]): number[] => faces;

/** 指定した役だけ埋めたスコア表を作る */
function sheetWith(filled: Partial<Record<Category, number>>): Sheet {
  return { ...emptySheet(), ...filled };
}

/** 手番を進める（テストの下ごしらえ用。振ってから記入する） */
function playTurn(state: YachtState, category: Category, rng = seededRng(1)): YachtState {
  return scoreCategory(rollDice(state, rng), category);
}

describe('役の点数', () => {
  it('上段はその目だけを数える', () => {
    expect(scoreFor('aces', dice(1, 1, 3, 4, 5))).toBe(2);
    expect(scoreFor('fours', dice(4, 4, 4, 1, 2))).toBe(12);
    expect(scoreFor('sixes', dice(6, 6, 6, 6, 6))).toBe(30);
    // その目が1つも無ければ0点
    expect(scoreFor('twos', dice(1, 3, 4, 5, 6))).toBe(0);
  });

  it('チョイスは5個の目の合計', () => {
    expect(scoreFor('choice', dice(1, 2, 3, 4, 5))).toBe(15);
    expect(scoreFor('choice', dice(6, 6, 6, 6, 6))).toBe(30);
  });

  it('フォーダイスは同じ目が4つ以上のときだけ、目の合計が入る', () => {
    expect(scoreFor('fourDice', dice(3, 3, 3, 3, 6))).toBe(18);
    // 5つそろっていても「4つ以上」なので入る
    expect(scoreFor('fourDice', dice(3, 3, 3, 3, 3))).toBe(15);
    // 3つでは足りない
    expect(scoreFor('fourDice', dice(3, 3, 3, 6, 6))).toBe(0);
  });

  it('フルハウスは3つ＋2つのときだけ。5つそろいは役にしない（ヨットで取る）', () => {
    expect(scoreFor('fullHouse', dice(2, 2, 2, 5, 5))).toBe(16);
    expect(scoreFor('fullHouse', dice(5, 5, 2, 2, 2))).toBe(16);
    expect(scoreFor('fullHouse', dice(2, 2, 2, 2, 5))).toBe(0);
    expect(scoreFor('fullHouse', dice(4, 4, 4, 4, 4))).toBe(0);
    expect(scoreFor('fullHouse', dice(1, 2, 3, 4, 5))).toBe(0);
  });

  it('S・ストレートは4つ連続で15点', () => {
    expect(scoreFor('sStraight', dice(1, 2, 3, 4, 4))).toBe(S_STRAIGHT_SCORE);
    expect(scoreFor('sStraight', dice(3, 4, 5, 6, 1))).toBe(S_STRAIGHT_SCORE);
    // 5つ連続は4つ連続も含む
    expect(scoreFor('sStraight', dice(2, 3, 4, 5, 6))).toBe(S_STRAIGHT_SCORE);
    // 3つしか続かない
    expect(scoreFor('sStraight', dice(1, 2, 3, 5, 5))).toBe(0);
  });

  it('L・ストレートは5つ連続で30点', () => {
    expect(scoreFor('lStraight', dice(1, 2, 3, 4, 5))).toBe(L_STRAIGHT_SCORE);
    expect(scoreFor('lStraight', dice(6, 5, 4, 3, 2))).toBe(L_STRAIGHT_SCORE);
    // 1つ足りない（4つ連続まで）
    expect(scoreFor('lStraight', dice(1, 2, 3, 4, 6))).toBe(0);
  });

  it('ヨットは同じ目が5つで50点', () => {
    expect(scoreFor('yacht', dice(4, 4, 4, 4, 4))).toBe(YACHT_SCORE);
    expect(scoreFor('yacht', dice(4, 4, 4, 4, 5))).toBe(0);
  });

  it('目の数え方と合計（faceCounts / pipSum）', () => {
    expect(faceCounts(dice(1, 1, 6, 6, 6)).slice(1)).toEqual([2, 0, 0, 0, 0, 3]);
    expect(pipSum(dice(1, 1, 6, 6, 6))).toBe(20);
  });

  it('12役すべてに点数が付く（役を足したらここが落ちる）', () => {
    expect(CATEGORIES).toHaveLength(12);
    expect(ROUNDS).toBe(CATEGORIES.length);
    for (const category of CATEGORIES) {
      expect(typeof scoreFor(category, dice(1, 2, 3, 4, 5))).toBe('number');
      expect(CATEGORY_LABEL[category].length).toBeGreaterThan(0);
    }
  });

  it('上段と下段の分類が食い違わない', () => {
    for (const category of UPPER_CATEGORIES) expect(isUpper(category)).toBe(true);
    for (const category of LOWER_CATEGORIES) expect(isUpper(category)).toBe(false);
  });
});

describe('スコア表の集計', () => {
  it('上段の合計が63点以上でボーナス35点', () => {
    const just = sheetWith({ aces: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 });
    expect(upperSubtotal(just)).toBe(UPPER_TARGET);
    expect(upperBonus(just)).toBe(UPPER_BONUS);

    const short = sheetWith({ aces: 2, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 });
    expect(upperSubtotal(short)).toBe(UPPER_TARGET - 1);
    expect(upperBonus(short)).toBe(0);
  });

  it('合計は 上段＋ボーナス＋下段', () => {
    const sheet = sheetWith({
      aces: 3,
      twos: 6,
      threes: 9,
      fours: 12,
      fives: 15,
      sixes: 18,
      yacht: YACHT_SCORE,
    });
    expect(lowerSubtotal(sheet)).toBe(YACHT_SCORE);
    expect(totalScore(sheet)).toBe(UPPER_TARGET + UPPER_BONUS + YACHT_SCORE);
  });

  it('上段ボーナスに届かなくなったら bonusReachable が false になる', () => {
    const empty = emptySheet();
    expect(upperRemainingMax(empty)).toBe(5 * (1 + 2 + 3 + 4 + 5 + 6));
    expect(bonusReachable(empty)).toBe(true);

    // 上段を全部0点で埋めたら、もう届かない
    const wasted = sheetWith({ aces: 0, twos: 0, threes: 0, fours: 0, fives: 0, sixes: 0 });
    expect(upperRemainingMax(wasted)).toBe(0);
    expect(bonusReachable(wasted)).toBe(false);
  });

  it('空の表は12役ぶん空いていて、埋めると減る', () => {
    expect(openCategories(emptySheet())).toHaveLength(12);
    expect(isSheetFull(emptySheet())).toBe(false);
    const full = sheetWith(Object.fromEntries(CATEGORIES.map((c) => [c, 0])));
    expect(openCategories(full)).toHaveLength(0);
    expect(isSheetFull(full)).toBe(true);
  });
});

describe('進行', () => {
  it('最初は自分の番で、まだ振っていない', () => {
    const state = initialState();
    expect(state.turn).toBe('human');
    expect(state.round).toBe(1);
    expect(state.rollsLeft).toBe(ROLLS_PER_TURN);
    expect(hasRolled(state)).toBe(false);
    expect(canScore(state)).toBe(false);
    expect(canRoll(state)).toBe(true);
    expect(state.dice).toHaveLength(DICE_COUNT);
  });

  it('振ると出目が1〜6になり、振れる回数が減る', () => {
    const rng = seededRng(20260821);
    let state = rollDice(initialState(), rng);
    expect(state.rollsLeft).toBe(ROLLS_PER_TURN - 1);
    expect(hasRolled(state)).toBe(true);
    for (const face of state.dice) {
      expect(face).toBeGreaterThanOrEqual(1);
      expect(face).toBeLessThanOrEqual(FACES);
    }
    state = rollDice(state, rng);
    state = rollDice(state, rng);
    expect(state.rollsLeft).toBe(0);
    // 4回目は振れない（同じ局面が返る）
    expect(rollDice(state, rng)).toBe(state);
    expect(canRoll(state)).toBe(false);
  });

  it('キープしたサイコロは振り直しても目が変わらない', () => {
    const rng = seededRng(7);
    const rolled = rollDice(initialState(), rng);
    const held = setHold(rolled, [true, true, false, false, false]);
    const again = rollDice(held, rng);
    expect(again.dice.slice(0, 2)).toEqual(rolled.dice.slice(0, 2));
  });

  it('1回目は全部振り直す（前の手番のキープを引きずらない）', () => {
    const rng = () => 0.99; // 常に6が出る
    const first = rollDice(initialState(), rng);
    expect(first.dice).toEqual([6, 6, 6, 6, 6]);
    const scored = scoreCategory(first, 'yacht');
    expect(scored.held.every((h) => !h)).toBe(true);
    // 次の手番の1回目は、キープの状態にかかわらず5個とも振られる
    const next = rollDice({ ...scored, turn: 'human', held: [true, true, true, true, true] }, () => 0);
    expect(next.dice).toEqual([1, 1, 1, 1, 1]);
  });

  it('キープは振る前と振り切ったあとには切り替わらない', () => {
    const start = initialState();
    expect(toggleHold(start, 0)).toBe(start);

    const rng = seededRng(3);
    let state = rollDice(start, rng);
    state = toggleHold(state, 0);
    expect(state.held[0]).toBe(true);
    state = toggleHold(state, 0);
    expect(state.held[0]).toBe(false);
    // 範囲外の指定は無視する
    expect(toggleHold(state, DICE_COUNT)).toBe(state);

    const spent = rollDice(rollDice(state, rng), rng);
    expect(spent.rollsLeft).toBe(0);
    expect(toggleHold(spent, 0)).toBe(spent);
  });

  it('全部キープしていると振れない（振っても何も変わらないため）', () => {
    const rolled = rollDice(initialState(), seededRng(11));
    const allHeld = setHold(rolled, [true, true, true, true, true]);
    expect(canRoll(allHeld)).toBe(false);
    expect(rollDice(allHeld, seededRng(12))).toBe(allHeld);
  });

  it('振る前には記入できない', () => {
    const start = initialState();
    expect(scoreCategory(start, 'choice')).toBe(start);
  });

  it('記入すると点が入り、手番がCPUに渡る', () => {
    const rolled = rollDice(initialState(), () => 0.99);
    const scored = scoreCategory(rolled, 'sixes');
    expect(scored.sheets.human.sixes).toBe(30);
    expect(scored.turn).toBe('cpu');
    expect(scored.round).toBe(1);
    expect(scored.rollsLeft).toBe(ROLLS_PER_TURN);
    expect(scored.last).toEqual({ side: 'human', category: 'sixes', points: 30 });
  });

  it('CPUが記入すると次の巡に進む', () => {
    let state = playTurn(initialState(), 'choice');
    state = playTurn(state, 'choice');
    expect(state.turn).toBe('human');
    expect(state.round).toBe(2);
    expect(state.sheets.cpu.choice).not.toBeNull();
  });

  it('記入済みの役には書き直せない', () => {
    const scored = playTurn(initialState(), 'choice');
    const cpuRolled = rollDice(scored, seededRng(5));
    // CPU側の表はまだ空なので書ける
    expect(scoreCategory(cpuRolled, 'choice').sheets.cpu.choice).not.toBeNull();
    // 自分の番に戻して同じ役を狙うと、局面は動かない
    const again = rollDice({ ...scored, turn: 'human' }, seededRng(6));
    expect(scoreCategory(again, 'choice')).toBe(again);
  });

  it('役にならない出目でも0点で記入できる（捨てる役が要るため）', () => {
    const rolled = rollDice(initialState(), () => 0); // 1が5つ
    const scored = scoreCategory(rolled, 'lStraight');
    expect(scored.sheets.human.lStraight).toBe(0);
  });

  it('24手番（12役×2人）で終局し、勝ち負けが決まる', () => {
    const rng = seededRng(20260821);
    let state = initialState();
    for (let i = 0; i < ROUNDS * 2; i += 1) {
      expect(state.finished).toBe(false);
      const sheet = state.sheets[state.turn];
      state = scoreCategory(rollDice(state, rng), openCategories(sheet)[0]);
    }
    expect(state.finished).toBe(true);
    expect(state.round).toBe(ROUNDS);
    expect(isSheetFull(state.sheets.human)).toBe(true);
    expect(isSheetFull(state.sheets.cpu)).toBe(true);
    expect(['win', 'loss', 'draw']).toContain(outcomeOf(state));
    // 終局後は何をしても動かない
    expect(rollDice(state, rng)).toBe(state);
    expect(scoreCategory(state, 'choice')).toBe(state);
  });

  it('終局していないあいだは勝敗が決まらない', () => {
    expect(outcomeOf(initialState())).toBeNull();
  });

  it('合計点が高いほうが勝ち', () => {
    const win: YachtState = {
      ...initialState(),
      finished: true,
      sheets: { human: sheetWith({ choice: 20 }), cpu: sheetWith({ choice: 10 }) },
    };
    expect(outcomeOf(win)).toBe('win');
    expect(outcomeOf({ ...win, sheets: { human: sheetWith({}), cpu: sheetWith({ choice: 1 }) } })).toBe(
      'loss',
    );
    expect(outcomeOf({ ...win, sheets: { human: sheetWith({}), cpu: sheetWith({}) } })).toBe('draw');
  });
});

describe('振り直しの期待値', () => {
  it('出目の確率は合計1になる', () => {
    for (let k = 0; k <= DICE_COUNT; k += 1) {
      const total = rollOutcomes(k).reduce((sum, o) => sum + o.p, 0);
      expect(total).toBeCloseTo(1, 10);
    }
  });

  it('並び順を区別しないぶんだけ通り数が減る（5個なら252通り）', () => {
    expect(rollOutcomes(0)).toHaveLength(1);
    expect(rollOutcomes(1)).toHaveLength(6);
    expect(rollOutcomes(5)).toHaveLength(252);
  });

  it('サイコロ1個の期待値は3.5（チョイスだけ空いた表で確かめる）', () => {
    const sheet = sheetWith(
      Object.fromEntries(CATEGORIES.filter((c) => c !== 'choice').map((c) => [c, 0])),
    );
    // 4個キープ（合計4点）＋1個振り直し
    expect(expectedAfterReroll([1, 1, 1, 1], 1, sheet, 'hard')).toBeCloseTo(4 + 3.5, 10);
  });
});

describe('CPU', () => {
  const levels = Object.keys(LEVELS) as Level[];

  it('強さは2段階', () => {
    expect(levels).toEqual(['easy', 'hard']);
  });

  it('記入済みの役は選ばない', () => {
    const sheet = sheetWith(
      Object.fromEntries(CATEGORIES.filter((c) => c !== 'aces').map((c) => [c, 0])),
    );
    for (const level of levels) {
      // でたらめに選ぶ側も、空いている役からしか選ばない
      for (let seed = 1; seed <= 20; seed += 1) {
        expect(chooseCategory(dice(6, 6, 6, 6, 6), sheet, level, seededRng(seed))).toBe('aces');
      }
    }
  });

  it('残り1役ならそこに書く', () => {
    const sheet = sheetWith(
      Object.fromEntries(CATEGORIES.filter((c) => c !== 'yacht').map((c) => [c, 0])),
    );
    expect(bestCategory(dice(1, 2, 3, 4, 5), sheet, 'hard')).toBe('yacht');
  });

  it('ヨットが出たらヨットに書く（50点がいちばん高い）', () => {
    for (const level of levels) {
      expect(bestCategory(dice(5, 5, 5, 5, 5), emptySheet(), level)).toBe('yacht');
    }
  });

  it('空の表が埋まっていくと、選べる役も減っていく', () => {
    let sheet = emptySheet();
    const seen = new Set<Category>();
    for (let i = 0; i < CATEGORIES.length; i += 1) {
      const category = bestCategory(dice(1, 2, 3, 4, 5), sheet, 'hard');
      expect(seen.has(category)).toBe(false);
      seen.add(category);
      sheet = { ...sheet, [category]: scoreFor(category, dice(1, 2, 3, 4, 5)) };
    }
    expect(isSheetFull(sheet)).toBe(true);
  });

  it('埋まった表で選ぼうとすると投げる（呼び出し側の間違いに気づけるように）', () => {
    const full = sheetWith(Object.fromEntries(CATEGORIES.map((c) => [c, 0])));
    expect(() => bestCategory(dice(1, 2, 3, 4, 5), full, 'hard')).toThrow(/役/);
    expect(() => chooseCategory(dice(1, 2, 3, 4, 5), full, 'hard')).toThrow(/役/);
  });

  /**
   * 仕様書の指摘そのもの。**貪欲なだけだと上段を捨ててボーナスを落とす。**
   * シックス3つ（18点）とチョイス（20点）なら、目先の点はチョイスが上だが、
   * 上段の18点はボーナス（63点で+35点）への貯金になる。
   */
  it('つよいCPUは上段ボーナスを狙う。かんたんは目先の点を取る', () => {
    // 上段は3個ずつそろえてきた（45点）ので、シックス18点でちょうど63点に届く
    const sheet = sheetWith({
      ...Object.fromEntries(LOWER_CATEGORIES.filter((c) => c !== 'choice').map((c) => [c, 0])),
      aces: 3,
      twos: 6,
      threes: 9,
      fours: 12,
      fives: 15,
    });
    expect(bonusReachable(sheet)).toBe(true);
    const hand = dice(6, 6, 6, 1, 1);
    expect(scoreFor('sixes', hand)).toBe(18);
    expect(scoreFor('choice', hand)).toBe(20);
    expect(bestCategory(hand, sheet, 'hard')).toBe('sixes');
    expect(bestCategory(hand, sheet, 'easy')).toBe('choice');
  });

  it('上段ボーナスの上乗せは、確定済み・到達不能なら効かない', () => {
    // まだ0点。上段の1点は 35/63 点ぶんの価値がある
    expect(bonusIncentive('sixes', 18, emptySheet())).toBeCloseTo((UPPER_BONUS * 18) / UPPER_TARGET);
    // 下段には効かない
    expect(bonusIncentive('choice', 30, emptySheet())).toBe(0);
    // すでに63点に届いていれば、これ以上の上乗せはない
    const done = sheetWith({ aces: 5, twos: 10, threes: 15, fours: 20, fives: 15 });
    expect(upperSubtotal(done)).toBeGreaterThanOrEqual(UPPER_TARGET);
    expect(bonusIncentive('sixes', 18, done)).toBe(0);
    // 上段を捨てて届かなくなった表では、もう狙わない
    const lost = sheetWith({ aces: 0, twos: 0, threes: 0, fours: 0, fives: 0 });
    expect(bonusReachable(lost)).toBe(false);
    expect(bonusIncentive('sixes', 18, lost)).toBe(0);
  });

  it('あと少しでボーナスのときは、必要なぶんまでしか上乗せしない', () => {
    // 上段はあと3点で63点。18点書いても、ボーナスに効くのは3点ぶん
    const almost = sheetWith({ aces: 5, twos: 10, threes: 15, fours: 20, fives: 10 });
    expect(UPPER_TARGET - upperSubtotal(almost)).toBe(3);
    expect(bonusIncentive('sixes', 18, almost)).toBeCloseTo((UPPER_BONUS * 3) / UPPER_TARGET);
  });

  it('つよいCPUはヨットの5つ目を狙ってキープする', () => {
    const hold = chooseHold(dice(4, 4, 4, 4, 2), 2, emptySheet(), 'hard');
    expect(hold).toEqual([true, true, true, true, false]);
  });

  it('L・ストレートが出そろっていたらキープして振らない', () => {
    const sheet = sheetWith(
      Object.fromEntries(CATEGORIES.filter((c) => c !== 'lStraight').map((c) => [c, 0])),
    );
    expect(chooseHold(dice(1, 2, 3, 4, 5), 2, sheet, 'hard')).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  it('振り切ったあとは全部キープが返る（もう振れないため）', () => {
    expect(chooseHold(dice(1, 2, 3, 4, 5), 0, emptySheet(), 'hard')).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  it('かんたんCPUはときどきでたらめに決める（強さの差になる）', () => {
    const rigged = () => 0; // 常に「でたらめ側」を引く乱数
    const sheet = emptySheet();
    // 0 は EASY_NOISE 未満なのででたらめ側に入り、そのあとの 0 で先頭の役を選ぶ
    expect(chooseCategory(dice(5, 5, 5, 5, 5), sheet, 'easy', rigged)).toBe(CATEGORIES[0]);
    // つよいほうは同じ乱数でもヨットを取る（乱数を見ない）
    expect(chooseCategory(dice(5, 5, 5, 5, 5), sheet, 'hard', rigged)).toBe('yacht');
  });

  it('1ゲームを通しでCPUに遊ばせても、表がきちんと埋まる', () => {
    for (const level of levels) {
      const rng = seededRng(4649);
      let state = initialState();
      let guard = 0;
      while (!state.finished && guard < 200) {
        guard += 1;
        const sheet = state.sheets[state.turn];
        if (!hasRolled(state)) {
          state = rollDice(state, rng);
          continue;
        }
        if (state.rollsLeft > 0) {
          const hold = chooseHold(state.dice, state.rollsLeft, sheet, level, rng);
          if (!hold.every(Boolean)) {
            state = rollDice(setHold(state, hold), rng);
            continue;
          }
        }
        state = scoreCategory(state, chooseCategory(state.dice, sheet, level, rng));
      }
      expect(state.finished).toBe(true);
      expect(isSheetFull(state.sheets.human)).toBe(true);
      expect(isSheetFull(state.sheets.cpu)).toBe(true);
      // まともな打ち方なら、12役でこのくらいは取れる
      expect(totalScore(state.sheets.human)).toBeGreaterThan(50);
    }
  });

  it('つよいCPUはかんたんCPUより平均点が高い', () => {
    const play = (level: Level, seed: number): number => {
      const rng = seededRng(seed);
      let sheet = emptySheet();
      for (let turn = 0; turn < ROUNDS; turn += 1) {
        let hand = [0, 0, 0, 0, 0].map(() => Math.min(FACES, Math.floor(rng() * FACES) + 1));
        for (let rollsLeft = ROLLS_PER_TURN - 1; rollsLeft > 0; rollsLeft -= 1) {
          const hold = chooseHold(hand, rollsLeft, sheet, level, rng);
          if (hold.every(Boolean)) break;
          hand = hand.map((face, i) =>
            hold[i] ? face : Math.min(FACES, Math.floor(rng() * FACES) + 1),
          );
        }
        const category = chooseCategory(hand, sheet, level, rng);
        sheet = { ...sheet, [category]: scoreFor(category, hand) };
      }
      return totalScore(sheet);
    };

    const games = 30;
    const average = (level: Level): number => {
      let sum = 0;
      for (let i = 0; i < games; i += 1) sum += play(level, 1000 + i);
      return sum / games;
    };
    expect(average('hard')).toBeGreaterThan(average('easy'));
  });
});
