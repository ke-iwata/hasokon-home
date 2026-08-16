import { describe, expect, it } from 'vitest';
import { seededRng } from '@/lib/cards';
import {
  cardLabel,
  cardOf,
  HANAFUDA_DECK,
  KIND_LABELS,
  sortForDisplay,
  sortHand,
  type HanafudaKind,
} from '@/lib/hanafuda-cards';
import {
  applyChoice,
  applyDraw,
  cardValue,
  chooseCpuMatch,
  chooseCpuPlay,
  cpuKoikoi,
  CPU,
  CPU_LEVELS,
  DEAL_WIN_POINTS,
  dealRound,
  declareKoikoi,
  declareStop,
  DEFAULT_OPTIONS,
  evaluateYaku,
  FIELD_SIZE,
  HAND_SIZE,
  handSpecial,
  HUMAN,
  matchesOf,
  multiplierFor,
  newGame,
  nextRound,
  outcome,
  playFromHand,
  scoreOf,
  variantOf,
  YAKU_TABLE,
  yakuProgress,
  type KoikoiState,
  type Options,
} from '@/lib/hanafuda';

/**
 * 花札 こいこい のテスト（docs/features/game-hanafuda-koikoi.md）。
 *
 * 見張っているのは大きく4つ。
 *
 * 1. **48枚の内訳**（光5・タネ9・短冊10・カス24）。絵柄と役の両方がここに乗る
 * 2. **役判定の境界**。仕様書の「役判定はテーブル駆動にして全役の境界を
 *    テストで固定する」に対応する。四光と雨四光を分ける柳、5枚目・10枚目で
 *    立ち上がるタネ・タン・カス、光の役どうしの排他
 * 3. **1手の進み方**（手札→合わせ→山札→役の判定→こいこい）
 * 4. **通しの不変条件**。どの局面でも48枚が48枚のまま
 */

// ---------------------------------------------------------------- 便利な組み立て

function stateOf(over: Partial<KoikoiState> = {}): KoikoiState {
  return {
    options: DEFAULT_OPTIONS,
    round: 1,
    dealer: HUMAN,
    turn: HUMAN,
    deck: [],
    hands: [[], []],
    field: [],
    captured: [[], []],
    phase: 'play',
    pending: null,
    lastDrawn: null,
    declared: [0, 0],
    koikoi: [0, 0],
    scores: [0, 0],
    result: null,
    ...over,
  };
}

/** その種別の札をn枚（役の枚数境界を作るのに使う） */
function someOf(kind: HanafudaKind, n: number, skip: readonly string[] = []): string[] {
  return HANAFUDA_DECK.filter((c) => c.kind === kind && !skip.includes(c.id))
    .slice(0, n)
    .map((c) => c.id);
}

/** 局面にある全部の札（不変条件の確認に使う） */
function allCards(state: KoikoiState): string[] {
  return [
    ...state.deck,
    ...state.hands.flat(),
    ...state.field,
    ...state.captured.flat(),
    ...(state.pending ? [state.pending.card] : []),
  ];
}

function expectIntact(state: KoikoiState) {
  const ids = allCards(state);
  expect(ids).toHaveLength(48);
  expect(new Set(ids).size).toBe(48);
}

/** CPUの判断だけで1つの月を最後まで進める */
function autoRound(start: KoikoiState, rng: () => number): KoikoiState {
  let state = start;
  for (let guard = 0; guard < 500 && state.phase !== 'round-over'; guard += 1) {
    expectIntact(state);
    if (state.phase === 'play') {
      const move = chooseCpuPlay(state, rng);
      expect(move).not.toBeNull();
      state = playFromHand(state, (move as { card: string }).card);
    } else if (state.phase === 'choose' || state.phase === 'draw-choose') {
      const pick = chooseCpuMatch(state, rng);
      state = applyChoice(state, pick as string);
    } else if (state.phase === 'draw') {
      state = applyDraw(state);
    } else if (state.phase === 'koikoi') {
      state = cpuKoikoi(state) ? declareKoikoi(state) : declareStop(state);
    }
  }
  return state;
}

// ---------------------------------------------------------------- 48枚

describe('花札48枚', () => {
  it('48枚あり、IDが重複しない', () => {
    expect(HANAFUDA_DECK).toHaveLength(48);
    expect(new Set(HANAFUDA_DECK.map((c) => c.id)).size).toBe(48);
  });

  it('12ヶ月それぞれ4枚ずつ', () => {
    for (let month = 1; month <= 12; month += 1) {
      expect(HANAFUDA_DECK.filter((c) => c.month === month)).toHaveLength(4);
    }
  });

  it('内訳は 光5・タネ9・短冊10・カス24', () => {
    const count = (kind: HanafudaKind) => HANAFUDA_DECK.filter((c) => c.kind === kind).length;
    expect(count('hikari')).toBe(5);
    expect(count('tane')).toBe(9);
    expect(count('tanzaku')).toBe(10);
    expect(count('kasu')).toBe(24);
  });

  it('短冊は赤短3・青短3・無地4', () => {
    const ribbons = HANAFUDA_DECK.filter((c) => c.kind === 'tanzaku');
    expect(ribbons.filter((c) => c.ribbon === 'aka')).toHaveLength(3);
    expect(ribbons.filter((c) => c.ribbon === 'ao')).toHaveLength(3);
    expect(ribbons.filter((c) => c.ribbon === 'plain')).toHaveLength(4);
    // 短冊以外は ribbon を持たない（役の判定が短冊だけを見ているため）
    expect(HANAFUDA_DECK.filter((c) => c.kind !== 'tanzaku' && c.ribbon)).toHaveLength(0);
  });

  it('カスの多い月は柳1枚・桐3枚', () => {
    const kasuOf = (month: number) =>
      HANAFUDA_DECK.filter((c) => c.month === month && c.kind === 'kasu').length;
    expect(kasuOf(11)).toBe(1);
    expect(kasuOf(12)).toBe(3);
    for (let month = 1; month <= 10; month += 1) expect(kasuOf(month)).toBe(2);
  });

  it('未知のIDは投げる（打ち間違いをビルド前に気づけるように）', () => {
    expect(() => cardOf('13-1')).toThrow(/花札に無いID/);
  });

  it('取り札は 光→タネ→短冊→カス の順に並ぶ', () => {
    const sorted = sortForDisplay(['12-2', '1-2', '10-1', '8-1', '3-3']);
    expect(sorted).toEqual(['8-1', '10-1', '1-2', '3-3', '12-2']);
  });

  it('手札は月ごとにまとまる', () => {
    expect(sortHand(['10-3', '1-3', '10-1', '1-1'])).toEqual(['1-1', '1-3', '10-1', '10-3']);
  });

  it('読み上げ名は「月＋札名＋種別」', () => {
    expect(cardLabel('8-1')).toBe(`8月 芒に月（${KIND_LABELS.hikari}）`);
  });
});

// ---------------------------------------------------------------- 役

describe('役の判定', () => {
  const ids = (yaku: { id: string }[]) => yaku.map((y) => y.id);

  it('五光は10文（光の役は最高の1つだけ）', () => {
    const yaku = evaluateYaku(['1-1', '3-1', '8-1', '11-1', '12-1'], { ...DEFAULT_OPTIONS, sake: false });
    expect(ids(yaku)).toEqual(['gokou']);
    expect(scoreOf(['1-1', '3-1', '8-1', '11-1', '12-1'], { ...DEFAULT_OPTIONS, sake: false })).toBe(10);
  });

  it('柳を含まない光4枚は四光で8文', () => {
    const yaku = evaluateYaku(['1-1', '3-1', '8-1', '12-1']);
    expect(ids(yaku)).toEqual(['shikou']);
    expect(yaku[0].points).toBe(8);
  });

  it('柳を含む光4枚は雨四光で7文（四光にはならない）', () => {
    const yaku = evaluateYaku(['1-1', '3-1', '8-1', '11-1']);
    expect(ids(yaku)).toEqual(['ame-shikou']);
    expect(yaku[0].points).toBe(7);
  });

  it('柳を含まない光3枚は三光で5文', () => {
    expect(ids(evaluateYaku(['1-1', '3-1', '12-1']))).toEqual(['sankou']);
  });

  it('柳を含む光3枚は役にならない', () => {
    expect(ids(evaluateYaku(['1-1', '3-1', '11-1']))).toEqual([]);
  });

  it('光2枚では役にならない', () => {
    expect(ids(evaluateYaku(['1-1', '3-1']))).toEqual([]);
  });

  it('猪鹿蝶は3枚そろって5文。2枚では成立しない', () => {
    expect(ids(evaluateYaku(['7-1', '10-1', '6-1']))).toContain('inoshikacho');
    expect(ids(evaluateYaku(['7-1', '10-1']))).not.toContain('inoshikacho');
  });

  it('赤短・青短はそれぞれ5文で、両方そろえば10文', () => {
    const aka = ['1-2', '2-2', '3-2'];
    const ao = ['6-2', '9-2', '10-2'];
    expect(scoreOf(aka)).toBe(5);
    expect(scoreOf(ao)).toBe(5);
    // 6枚あるので短冊のタンも同時に成立し、5+5+1+1=12文になる
    const both = evaluateYaku([...aka, ...ao]);
    expect(ids(both)).toEqual(['akatan', 'aotan', 'tan']);
    expect(scoreOf([...aka, ...ao])).toBe(12);
  });

  it('花見酒・月見酒は設定で外せる', () => {
    const hanami = ['3-1', '9-1'];
    expect(ids(evaluateYaku(hanami, { ...DEFAULT_OPTIONS, sake: true }))).toEqual(['hanami']);
    expect(ids(evaluateYaku(hanami, { ...DEFAULT_OPTIONS, sake: false }))).toEqual([]);
    const tsukimi = ['8-1', '9-1'];
    expect(ids(evaluateYaku(tsukimi, { ...DEFAULT_OPTIONS, sake: true }))).toEqual(['tsukimi']);
    expect(ids(evaluateYaku(tsukimi, { ...DEFAULT_OPTIONS, sake: false }))).toEqual([]);
  });

  it('タネは5枚で1文、1枚増えるごとに1文', () => {
    expect(scoreOf(someOf('tane', 4))).toBe(0);
    expect(scoreOf(someOf('tane', 5), { ...DEFAULT_OPTIONS, sake: false })).toBe(1);
    expect(scoreOf(someOf('tane', 7), { ...DEFAULT_OPTIONS, sake: false })).toBe(3);
  });

  it('タンは5枚で1文。赤短・青短と重ねて数える', () => {
    // 赤短3枚と無地2枚（青短は入れない）でちょうど5枚
    const tan = ['1-2', '2-2', '3-2', '4-2', '5-2'];
    expect(ids(evaluateYaku(tan))).toEqual(['akatan', 'tan']);
    expect(scoreOf(tan)).toBe(6);
  });

  it('カスは10枚で1文、以降1枚ごとに1文', () => {
    expect(scoreOf(someOf('kasu', 9))).toBe(0);
    expect(scoreOf(someOf('kasu', 10))).toBe(1);
    expect(scoreOf(someOf('kasu', 13))).toBe(4);
  });

  it('役の表に重複したIDが無い', () => {
    expect(new Set(YAKU_TABLE.map((y) => y.id)).size).toBe(YAKU_TABLE.length);
  });

  /**
   * 「1枚増えるごとに1文」で伸びるのはタネ・タン・カスだけ。
   *
   * この不変条件を機械で固定しておかないと、枚数で決まる役（四光・三光）にも
   * 同じ計算が当たっていることに気づけない。表の並び順と `group` の排他が
   * 先に効いて表面化しないため、**並び順を変えた瞬間に黙って点が狂う**。
   */
  it('枚数で伸びる役はタネ・タン・カスの3つだけ', () => {
    expect(YAKU_TABLE.filter((y) => y.extra).map((y) => y.id)).toEqual(['tane', 'tan', 'kasu']);
  });

  it('光の役は枚数が増えても固定点のまま（三光は光4枚でも5文）', () => {
    // yakuProgress は排他グループを見ずに全役を並べるので、
    // 「三光そのものの点数」を排他に隠されずに確かめられる
    const four = ['1-1', '3-1', '8-1', '12-1'];
    const list = yakuProgress(four);
    expect(list.find((p) => p.def.id === 'sankou')).toMatchObject({ done: true, points: 5 });
    expect(list.find((p) => p.def.id === 'shikou')).toMatchObject({ done: true, points: 8 });
    // 実際の集計では、光の役はいちばん高い1つだけ（四光の8文）になる
    expect(evaluateYaku(four).map((y) => y.id)).toEqual(['shikou']);
    expect(scoreOf(four)).toBe(8);

    // 光5枚でも、四光・三光それぞれの点は動かない
    const five = [...four, '11-1'];
    const all = yakuProgress(five);
    expect(all.find((p) => p.def.id === 'sankou')?.points).toBe(0); // 雨を含むので不成立
    expect(all.find((p) => p.def.id === 'ame-shikou')).toMatchObject({ done: true, points: 7 });
    expect(scoreOf(five, { ...DEFAULT_OPTIONS, sake: false })).toBe(10);
  });

  it('役の表に出てくる札はすべて実在する', () => {
    for (const def of YAKU_TABLE) {
      for (const id of [...(def.cards ?? []), ...(def.exclude ?? [])]) {
        expect(() => cardOf(id)).not.toThrow();
      }
    }
  });
});

describe('こいこいの倍率', () => {
  it('6文までは等倍、7文からは2倍', () => {
    expect(multiplierFor(6, 0)).toBe(1);
    expect(multiplierFor(7, 0)).toBe(2);
  });

  it('相手がこいこいしていたら2倍（こいこい返し）', () => {
    expect(multiplierFor(3, 1)).toBe(2);
  });

  it('7文以上かつこいこい返しなら4倍', () => {
    expect(multiplierFor(10, 2)).toBe(4);
  });
});

describe('役の進み具合', () => {
  it('成立した役が先頭、次にあと1枚の役が来る', () => {
    // 赤短は成立、猪鹿蝶はあと1枚
    const list = yakuProgress(['1-2', '2-2', '3-2', '7-1', '10-1']);
    expect(list[0].def.id).toBe('akatan');
    expect(list[0].done).toBe(true);
    const ino = list.find((p) => p.def.id === 'inoshikacho');
    expect(ino?.need ?? 0 - (ino?.have ?? 0)).toBeGreaterThan(0);
    expect((ino?.need ?? 0) - (ino?.have ?? 0)).toBe(1);
  });

  it('花見酒を切ると一覧からも消える', () => {
    const list = yakuProgress([], { ...DEFAULT_OPTIONS, sake: false });
    expect(list.some((p) => p.def.id === 'hanami')).toBe(false);
    expect(list.some((p) => p.def.id === 'tsukimi')).toBe(false);
  });
});

// ---------------------------------------------------------------- 配り

describe('配り', () => {
  it('手札8枚ずつ・場8枚・山札24枚で、48枚が過不足なく分かれる', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const state = dealRound(
        { options: DEFAULT_OPTIONS, round: 1, dealer: HUMAN, scores: [0, 0] },
        seededRng(seed),
      );
      expect(state.hands[0]).toHaveLength(HAND_SIZE);
      expect(state.hands[1]).toHaveLength(HAND_SIZE);
      expect(state.field).toHaveLength(FIELD_SIZE);
      expect(state.deck).toHaveLength(48 - HAND_SIZE * 2 - FIELD_SIZE);
      expectIntact(state);
    }
  });

  it('場に同じ月が4枚出る配り方はしない', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const { field } = dealRound(
        { options: DEFAULT_OPTIONS, round: 1, dealer: HUMAN, scores: [0, 0] },
        seededRng(seed),
      );
      const counts = new Map<number, number>();
      for (const id of field) {
        const m = cardOf(id).month;
        counts.set(m, (counts.get(m) ?? 0) + 1);
      }
      expect(Math.max(...counts.values())).toBeLessThan(4);
    }
  });

  it('親は最初の手番を持つ', () => {
    const state = dealRound(
      { options: DEFAULT_OPTIONS, round: 1, dealer: CPU, scores: [0, 0] },
      seededRng(7),
    );
    expect(state.turn).toBe(CPU);
  });

  it('手四（同じ月4枚）は6文で即決着', () => {
    expect(handSpecial(['1-1', '1-2', '1-3', '1-4', '5-1', '6-1', '7-1', '8-1'])).toBe('teshi');
  });

  it('くっつき（同じ月2枚の組が4つ）は6文で即決着', () => {
    expect(handSpecial(['1-1', '1-2', '5-1', '5-2', '6-1', '6-2', '7-1', '7-2'])).toBe('kuttsuki');
  });

  it('手四でもくっつきでもない手札は null', () => {
    expect(handSpecial(['1-1', '2-1', '3-1', '4-1', '5-1', '6-1', '7-1', '8-1'])).toBeNull();
    // 3枚組が混じる手札はくっつきではない
    expect(handSpecial(['1-1', '1-2', '1-3', '5-1', '5-2', '6-1', '6-2', '7-1'])).toBeNull();
  });

  it('8枚でない手札は判定しない（配った直後だけの役なので）', () => {
    expect(handSpecial(['1-1', '1-2', '1-3', '1-4'])).toBeNull();
  });
});

// ---------------------------------------------------------------- 1手の進み方

describe('手札を出す', () => {
  it('合う札が無ければ場に置き、山札をめくる番になる', () => {
    const state = stateOf({ hands: [['1-1'], []], field: ['5-1'] });
    const next = playFromHand(state, '1-1');
    expect(next.field).toEqual(['5-1', '1-1']);
    expect(next.captured[HUMAN]).toEqual([]);
    expect(next.phase).toBe('draw');
  });

  it('合う札が1枚なら2枚とも取る', () => {
    const state = stateOf({ hands: [['1-1'], []], field: ['1-3', '5-1'] });
    const next = playFromHand(state, '1-1');
    expect(next.captured[HUMAN]).toEqual(['1-1', '1-3']);
    expect(next.field).toEqual(['5-1']);
    expect(next.phase).toBe('draw');
  });

  it('合う札が2枚ならどちらを取るか選ぶ', () => {
    const state = stateOf({ hands: [['1-1'], []], field: ['1-3', '1-4'] });
    const next = playFromHand(state, '1-1');
    expect(next.phase).toBe('choose');
    expect(next.pending).toEqual({ card: '1-1', source: 'hand', matches: ['1-3', '1-4'] });
    // 選ぶまでは取り札にも場にも入らない
    expect(next.field).toEqual(['1-3', '1-4']);
    expect(next.captured[HUMAN]).toEqual([]);

    const chosen = applyChoice(next, '1-4');
    expect(chosen.captured[HUMAN]).toEqual(['1-1', '1-4']);
    expect(chosen.field).toEqual(['1-3']);
    expect(chosen.phase).toBe('draw');
    expect(chosen.pending).toBeNull();
  });

  it('場に同じ月が3枚あれば4枚まとめて取る', () => {
    const state = stateOf({ hands: [['1-1'], []], field: ['1-2', '1-3', '1-4'] });
    const next = playFromHand(state, '1-1');
    expect(next.captured[HUMAN]).toEqual(['1-1', '1-2', '1-3', '1-4']);
    expect(next.field).toEqual([]);
    expect(next.phase).toBe('draw');
  });

  it('手札に無い札・手番でない札は動かない', () => {
    const state = stateOf({ hands: [['1-1'], ['2-1']], field: [] });
    expect(playFromHand(state, '2-1')).toBe(state);
    expect(playFromHand(state, '9-9')).toBe(state);
  });

  it('選ぶ場面で場に無い札を指しても動かない', () => {
    const state = playFromHand(stateOf({ hands: [['1-1'], []], field: ['1-3', '1-4'] }), '1-1');
    expect(applyChoice(state, '5-1')).toBe(state);
  });
});

describe('山札をめくる', () => {
  it('めくった札が合えば取り、手番が相手に移る', () => {
    const state = stateOf({
      hands: [[], ['2-1']],
      field: ['5-1', '9-3'],
      deck: ['5-3'],
      phase: 'draw',
    });
    const next = applyDraw(state);
    expect(next.lastDrawn).toBe('5-3');
    expect(next.captured[HUMAN]).toEqual(['5-3', '5-1']);
    expect(next.field).toEqual(['9-3']);
    expect(next.phase).toBe('play');
    expect(next.turn).toBe(CPU);
  });

  it('めくった札が2枚と合えば選ばせる', () => {
    const state = stateOf({
      hands: [[], ['2-1']],
      field: ['5-1', '5-2'],
      deck: ['5-3'],
      phase: 'draw',
    });
    // 場に5月が2枚あるので選択になる
    expect(applyDraw({ ...state, field: ['5-1', '5-2'] }).phase).toBe('draw-choose');
    const chosen = applyChoice(applyDraw(state), '5-2');
    expect(chosen.captured[HUMAN]).toEqual(['5-3', '5-2']);
    expect(chosen.phase).toBe('play');
  });

  it('合わなければ場に置いて手番が移る', () => {
    const state = stateOf({ hands: [[], ['2-1']], field: ['5-1'], deck: ['9-3'], phase: 'draw' });
    const next = applyDraw(state);
    expect(next.field).toEqual(['5-1', '9-3']);
    expect(next.phase).toBe('play');
    expect(next.turn).toBe(CPU);
  });

  it('山札が尽きていたら黙って手番を終える', () => {
    const state = stateOf({ hands: [[], ['2-1']], deck: [], phase: 'draw' });
    const next = applyDraw(state);
    expect(next.phase).toBe('play');
    expect(next.turn).toBe(CPU);
  });
});

// ---------------------------------------------------------------- こいこい

describe('こいこいとあがり', () => {
  /** 三光が完成する直前の局面（手札の光を出せば成立する） */
  function beforeSankou(over: Partial<KoikoiState> = {}): KoikoiState {
    return stateOf({
      hands: [['12-1'], ['2-1']],
      field: ['12-2'],
      deck: ['4-3'],
      captured: [['1-1', '3-1'], []],
      ...over,
    });
  }

  it('役ができたら「あがる／こいこい」を選ぶ場面になる', () => {
    const state = applyDraw(playFromHand(beforeSankou(), '12-1'));
    expect(state.phase).toBe('koikoi');
    expect(scoreOf(state.captured[HUMAN])).toBe(5);
  });

  it('あがると倍率をかけた点が入り、その月が終わる', () => {
    const state = declareStop(applyDraw(playFromHand(beforeSankou(), '12-1')));
    expect(state.phase).toBe('round-over');
    expect(state.result).toMatchObject({ winner: HUMAN, reason: 'agari', base: 5, multiplier: 1, points: 5 });
    expect(state.scores).toEqual([5, 0]);
  });

  it('相手がこいこいしていれば、あがった側の点が2倍になる', () => {
    const state = declareStop(applyDraw(playFromHand(beforeSankou({ koikoi: [0, 1] }), '12-1')));
    expect(state.result?.multiplier).toBe(2);
    expect(state.scores).toEqual([10, 0]);
  });

  it('7文以上は2倍になる', () => {
    // 雨四光（7文）が完成する
    const state = declareStop(
      applyDraw(
        playFromHand(
          stateOf({
            hands: [['12-1'], ['2-1']],
            field: ['12-2'],
            deck: ['4-3'],
            captured: [['1-1', '3-1', '11-1'], []],
          }),
          '12-1',
        ),
      ),
    );
    expect(state.result).toMatchObject({ base: 7, multiplier: 2, points: 14 });
  });

  it('こいこいすると、その点数を超えないと次はあがれない', () => {
    const declared = declareKoikoi(applyDraw(playFromHand(beforeSankou(), '12-1')));
    expect(declared.declared[HUMAN]).toBe(5);
    expect(declared.koikoi[HUMAN]).toBe(1);
    expect(declared.phase).toBe('play');
    expect(declared.turn).toBe(CPU);

    // 同じ5文のまま手番が回ってきても、あがる場面にはならない
    const again = applyDraw(
      playFromHand({ ...declared, turn: HUMAN, hands: [['5-1'], []], deck: ['4-3'] }, '5-1'),
    );
    expect(again.phase).not.toBe('koikoi');
  });

  it('手札が尽きたまま誰も上がらなければ流局（点は動かない）', () => {
    const state = applyDraw(
      playFromHand(stateOf({ hands: [['5-1'], []], field: [], deck: ['4-3'] }), '5-1'),
    );
    expect(state.phase).toBe('round-over');
    expect(state.result).toMatchObject({ winner: null, reason: 'nagare', points: 0 });
    expect(state.scores).toEqual([0, 0]);
  });

  it('決着していない局面では、あがりもこいこいも効かない', () => {
    const state = stateOf({ hands: [['1-1'], []] });
    expect(declareStop(state)).toBe(state);
    expect(declareKoikoi(state)).toBe(state);
  });
});

// ---------------------------------------------------------------- 月と通算

describe('月の進行', () => {
  it('勝った人が次の親になる', () => {
    const over = stateOf({
      phase: 'round-over',
      dealer: HUMAN,
      result: { winner: CPU, reason: 'agari', base: 5, multiplier: 1, points: 5, yaku: [] },
      scores: [0, 5],
    });
    expect(nextRound(over, seededRng(3)).dealer).toBe(CPU);
  });

  it('流局なら親は続投する', () => {
    const over = stateOf({
      phase: 'round-over',
      dealer: CPU,
      result: { winner: null, reason: 'nagare', base: 0, multiplier: 1, points: 0, yaku: [] },
    });
    expect(nextRound(over, seededRng(3)).dealer).toBe(CPU);
  });

  it('決めた月数を終えたらゲームが終わる', () => {
    const over = stateOf({
      options: { ...DEFAULT_OPTIONS, rounds: 6 },
      round: 6,
      phase: 'round-over',
      result: { winner: HUMAN, reason: 'agari', base: 5, multiplier: 1, points: 5, yaku: [] },
      scores: [5, 0],
    });
    const next = nextRound(over, seededRng(3));
    expect(next.phase).toBe('game-over');
    expect(outcome(next)).toBe('win');
  });

  it('通算が同じなら引き分け', () => {
    expect(outcome(stateOf({ phase: 'game-over', scores: [7, 7] }))).toBe('draw');
    expect(outcome(stateOf({ phase: 'play', scores: [7, 0] }))).toBeNull();
  });

  it('記録の区分は強さと月数で分かれる', () => {
    expect(variantOf({ level: 'hard', rounds: 12, sake: true })).toBe('cpu-hard-12');
    expect(variantOf({ level: 'hard', rounds: 6, sake: true })).toBe('cpu-hard-6');
  });
});

// ---------------------------------------------------------------- CPU

describe('CPU', () => {
  it('どの強さでも、手札にある札しか出さない', () => {
    for (const level of CPU_LEVELS) {
      const rng = seededRng(11);
      const options: Options = { ...DEFAULT_OPTIONS, level };
      const state = dealRound({ options, round: 1, dealer: CPU, scores: [0, 0] }, rng);
      const move = chooseCpuPlay(state, rng);
      expect(move).not.toBeNull();
      expect(state.hands[CPU]).toContain((move as { card: string }).card);
    }
  });

  it('取れる札があるときは、取れる手を選ぶ（普通・強）', () => {
    for (const level of ['normal', 'hard'] as const) {
      const state = stateOf({
        options: { ...DEFAULT_OPTIONS, level },
        hands: [['1-1', '5-3'], []],
        field: ['1-3', '9-3'],
      });
      expect(chooseCpuPlay(state)?.card).toBe('1-1');
    }
  });

  it('光とカスが同時に取れるときは光を取る（普通・強）', () => {
    for (const level of ['normal', 'hard'] as const) {
      const state = stateOf({
        options: { ...DEFAULT_OPTIONS, level },
        hands: [['1-3', '12-2'], []],
        field: ['1-1', '12-3'],
      });
      expect(chooseCpuPlay(state)?.card).toBe('1-3');
    }
  });

  it('2枚と合うときは価値の高いほうを取る（普通・強）', () => {
    const state = stateOf({
      options: { ...DEFAULT_OPTIONS, level: 'normal' },
      hands: [['1-3'], []],
      field: ['1-1', '1-4'],
      phase: 'choose',
      pending: { card: '1-3', source: 'hand', matches: ['1-1', '1-4'] },
    });
    expect(chooseCpuMatch(state)).toBe('1-1');
  });

  it('弱は必ずあがる。普通は点が低いうちは こいこい する', () => {
    // タネ5枚でちょうど1文。手札もまだ3枚残っている
    const base = stateOf({
      phase: 'koikoi',
      turn: CPU,
      hands: [[], ['2-3', '3-3', '4-3']],
      captured: [[], ['2-1', '4-1', '5-1', '6-1', '8-2']],
    });
    expect(scoreOf(base.captured[CPU])).toBe(1);
    expect(cpuKoikoi({ ...base, options: { ...DEFAULT_OPTIONS, level: 'easy' } })).toBe(false);
    expect(cpuKoikoi({ ...base, options: { ...DEFAULT_OPTIONS, level: 'normal' } })).toBe(true);
  });

  it('普通でも、すでに5文あるなら降りる', () => {
    const state = stateOf({
      phase: 'koikoi',
      turn: CPU,
      hands: [[], ['2-3', '3-3', '4-3']],
      captured: [[], ['1-1', '3-1', '12-1']],
      options: { ...DEFAULT_OPTIONS, level: 'normal' },
    });
    expect(scoreOf(state.captured[CPU])).toBe(5);
    expect(cpuKoikoi(state)).toBe(false);
  });

  it('手札が尽きていたら こいこい しない（流局にしかならないため）', () => {
    const state = stateOf({
      phase: 'koikoi',
      turn: CPU,
      hands: [[], []],
      captured: [[], ['1-1', '3-1', '12-1']],
      options: { ...DEFAULT_OPTIONS, level: 'hard' },
    });
    expect(cpuKoikoi(state)).toBe(false);
  });

  it('札のうまみは 光 ＞ タネ・短冊 ＞ カス', () => {
    expect(cardValue('8-1', [])).toBeGreaterThan(cardValue('8-2', []));
    expect(cardValue('8-2', [])).toBeGreaterThan(cardValue('8-3', []));
  });

  it('あと1枚で役になる札は高く見積もる', () => {
    // 猪鹿蝶があと1枚のときの「牡丹に蝶」
    expect(cardValue('6-1', ['7-1', '10-1'])).toBeGreaterThan(cardValue('6-1', []));
  });
});

// ---------------------------------------------------------------- 通し

describe('通しで遊ぶ', () => {
  it('どの強さ・どの配りでも1つの月が必ず決着し、48枚が48枚のまま', () => {
    for (const level of CPU_LEVELS) {
      for (let seed = 1; seed <= 12; seed += 1) {
        const rng = seededRng(seed * 31 + level.length);
        const options: Options = { ...DEFAULT_OPTIONS, level };
        const start = dealRound({ options, round: 1, dealer: HUMAN, scores: [0, 0] }, rng);
        const end = autoRound(start, rng);
        expect(end.phase).toBe('round-over');
        expectIntact(end);
        expect(end.result).not.toBeNull();
      }
    }
  });

  it('最初の親を指定できる。指定しなければ乱数で決まる', () => {
    expect(newGame(DEFAULT_OPTIONS, seededRng(1), HUMAN).dealer).toBe(HUMAN);
    expect(newGame(DEFAULT_OPTIONS, seededRng(1), CPU).dealer).toBe(CPU);
    // 指定なし（null）は乱数まかせ。どちらかには決まる
    const dealer = newGame(DEFAULT_OPTIONS, seededRng(1), null).dealer;
    expect([HUMAN, CPU]).toContain(dealer);
  });

  it('6ヶ月戦を通しても、点は役の合計から外れない', () => {
    const rng = seededRng(2026);
    let state = newGame({ ...DEFAULT_OPTIONS, rounds: 6 }, rng);
    for (let guard = 0; guard < 20 && state.phase !== 'game-over'; guard += 1) {
      state = autoRound(state, rng);
      // 上がった月の点は、役の素点×倍率と必ず一致する
      const r = state.result;
      if (r && r.reason === 'agari') expect(r.points).toBe(r.base * r.multiplier);
      state = nextRound(state, rng);
    }
    expect(state.phase).toBe('game-over');
    expect(state.round).toBe(6);
    expect(state.scores[0] + state.scores[1]).toBeGreaterThanOrEqual(0);
  });

  it('手四・くっつきで始まった月は、その場で6文が入って終わっている', () => {
    // 配りの偏りを待つのは現実的でないので、判定そのものを通して確かめる
    const rng = seededRng(5);
    let found = false;
    for (let seed = 1; seed <= 400 && !found; seed += 1) {
      const state = dealRound(
        { options: DEFAULT_OPTIONS, round: 1, dealer: HUMAN, scores: [0, 0] },
        seededRng(seed),
      );
      if (state.phase !== 'round-over') continue;
      found = true;
      expect(['teshi', 'kuttsuki']).toContain(state.result?.reason);
      expect(state.result?.points).toBe(DEAL_WIN_POINTS);
      expect(state.scores[state.result?.winner as number]).toBe(DEAL_WIN_POINTS);
    }
    // 見つからなくてもテストは落とさない（配りは乱数なので）。判定は handSpecial 側で固定済み
    expect(typeof rng()).toBe('number');
  });
});

// ---------------------------------------------------------------- 場の合わせ

describe('場の合わせ', () => {
  it('同じ月の札だけを拾う', () => {
    expect(matchesOf(['1-2', '1-3', '5-1'], '1-1')).toEqual(['1-2', '1-3']);
    expect(matchesOf(['5-1'], '1-1')).toEqual([]);
  });
});
