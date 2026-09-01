import { describe, expect, it } from 'vitest';
import { type Card, type Suit } from '@/lib/cards';
import {
  canDraw,
  canPick,
  clearRate,
  COLS,
  COL_SIZE,
  connects,
  deal,
  draw,
  frontOf,
  hasAnyMove,
  hint,
  isBadDeal,
  isCleared,
  isLost,
  newSeed,
  pick,
  pickableColumns,
  remaining,
  STOCK_SIZE,
  TABLEAU_SIZE,
  variantOf,
  wasteTop,
  WRAP_VARIANT,
  type GolfState,
} from '@/lib/golf-solitaire';

/**
 * ゴルフソリティアのテスト。
 *
 * 仕様: docs/features/game-golf-solitaire.md
 *
 * 見張っているのは4つ。
 * 1. 配りが 7列×5枚＋山札17枚で52枚を使い切り、シードから再現できること
 * 2. ±1のつながり（**A↔K は既定でつながらない**。`wrap` のときだけつながる）
 * 3. 取る・めくるで連鎖と最長連鎖がどう動くか
 * 4. クリア・詰みの境界（山札が尽きた瞬間に負けにしない、など）
 */

const card = (suit: Suit, rank: number, faceUp = true): Card => ({
  suit,
  rank: rank as Card['rank'],
  faceUp,
  id: suit.charCodeAt(0) * 100 + rank,
});

/** 場が空の状態。テストごとに必要な列だけ差し替える */
const empty = (over: Partial<GolfState> = {}): GolfState => ({
  tableau: Array.from({ length: COLS }, () => [] as Card[]),
  stock: [],
  waste: [],
  chain: 0,
  maxChain: 0,
  moves: 0,
  seed: 1,
  wrap: false,
  ...over,
});

/** 列を指定して置いた状態を作る */
const withColumns = (entries: [number, Card[]][], over: Partial<GolfState> = {}): GolfState => {
  const base = empty(over);
  const tableau = base.tableau.map((c) => [...c]);
  for (const [col, cards] of entries) tableau[col] = cards;
  return { ...base, tableau };
};

describe('配り', () => {
  it('7列×5枚の35枚と山札17枚で、52枚をちょうど使い切る', () => {
    expect(COLS).toBe(7);
    expect(COL_SIZE).toBe(5);
    expect(TABLEAU_SIZE).toBe(35);
    expect(STOCK_SIZE).toBe(17);
    expect(TABLEAU_SIZE + STOCK_SIZE).toBe(52);
  });

  it('配ると場が7列×5枚、山札17枚、捨て札は空', () => {
    const s = deal(1234);
    expect(s.tableau).toHaveLength(COLS);
    for (const column of s.tableau) expect(column).toHaveLength(COL_SIZE);
    expect(s.stock).toHaveLength(STOCK_SIZE);
    // 52枚目まで場と山札で使うので、配りはじめの捨て札は無い（最初の1手は必ずめくり）
    expect(s.waste).toEqual([]);
    expect(remaining(s)).toBe(TABLEAU_SIZE);
  });

  it('場札は全部表向き、山札は裏向き', () => {
    const s = deal(77);
    for (const column of s.tableau) {
      for (const c of column) expect(c.faceUp).toBe(true);
    }
    for (const c of s.stock) expect(c.faceUp).toBe(false);
  });

  it('52枚がちょうど1枚ずつ使われる（重複も欠けもない）', () => {
    const s = deal(2026);
    const ids = [...s.tableau.flat(), ...s.stock].map((c) => c.id);
    expect(ids).toHaveLength(52);
    expect(new Set(ids).size).toBe(52);
  });

  it('同じシードからは同じ配りになる（「同じ配りをもう一度」が成り立つ）', () => {
    const a = deal(4242);
    const b = deal(4242);
    expect(b).toEqual(a);
  });

  it('シードが違えば配りも違う', () => {
    const a = deal(1).tableau.flat().map((c) => c.id);
    const b = deal(2).tableau.flat().map((c) => c.id);
    expect(b).not.toEqual(a);
  });

  it('wrap は状態に持ち回る（既定は false）', () => {
    expect(deal(5).wrap).toBe(false);
    expect(deal(5, true).wrap).toBe(true);
    // ルールが違うだけで配り自体は同じ（同じ配りで両方のルールを試せる）
    expect(deal(5, true).tableau).toEqual(deal(5).tableau);
  });

  it('配った盤面はどれも「配り直したい配置」ではない', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      expect(isBadDeal(deal(seed).tableau), `seed=${seed}`).toBe(false);
    }
  });

  it('newSeed は1以上の整数を返す', () => {
    expect(newSeed(() => 0)).toBe(1);
    expect(newSeed(() => 0.5)).toBe(500_001);
    expect(Number.isInteger(newSeed())).toBe(true);
  });
});

describe('配り直しの軽いガード（isBadDeal）', () => {
  /** 手前の7枚が7種類ぶんの数字になる、ふつうの配置 */
  const fine = (): Card[][] =>
    Array.from({ length: COLS }, (_, col) =>
      Array.from({ length: COL_SIZE }, (_, i) => card('spade', ((col + i * 3) % 13) + 1)),
    );

  it('ふつうの配置は弾かない', () => {
    expect(isBadDeal(fine())).toBe(false);
  });

  it('同じ数字4枚が1つの列に固まっていたら弾く', () => {
    const columns = fine();
    columns[2] = [card('spade', 7), card('heart', 7), card('diamond', 7), card('club', 7), card('spade', 2)];
    expect(isBadDeal(columns)).toBe(true);
  });

  it('同じ数字が3枚までなら弾かない', () => {
    const columns = fine();
    columns[2] = [card('spade', 7), card('heart', 7), card('diamond', 7), card('club', 4), card('spade', 2)];
    expect(isBadDeal(columns)).toBe(false);
  });

  it('手前の7枚の数字が4種類未満なら弾く（開幕からつなぎ先が無い）', () => {
    const columns = fine();
    // 手前（末尾）を 5・5・5・5・6・6・6 の3種類にする
    for (let col = 0; col < COLS; col += 1) {
      columns[col][COL_SIZE - 1] = card('spade', col < 4 ? 5 : 6);
    }
    expect(isBadDeal(columns)).toBe(true);
  });

  it('手前の7枚が4種類あれば弾かない', () => {
    const columns = fine();
    for (let col = 0; col < COLS; col += 1) {
      columns[col][COL_SIZE - 1] = card('spade', [3, 3, 3, 3, 5, 7, 9][col]);
    }
    expect(isBadDeal(columns)).toBe(false);
  });
});

describe('つながり（connects）', () => {
  it('±1でつながる', () => {
    expect(connects(7, 6)).toBe(true);
    expect(connects(7, 8)).toBe(true);
    expect(connects(7, 7)).toBe(false);
    expect(connects(7, 9)).toBe(false);
  });

  it('既定では A と K はつながらない（K で止まる）', () => {
    expect(connects(1, 13)).toBe(false);
    expect(connects(13, 1)).toBe(false);
    // K につながるのは Q だけ、A につながるのは2だけ
    expect(connects(13, 12)).toBe(true);
    expect(connects(1, 2)).toBe(true);
  });

  it('wrap を立てると A と K もつながる', () => {
    expect(connects(1, 13, true)).toBe(true);
    expect(connects(13, 1, true)).toBe(true);
    // 差12以外が増えたりはしない
    expect(connects(2, 13, true)).toBe(false);
  });
});

describe('取る（canPick / pick）', () => {
  it('捨て札が空のあいだは1枚も取れない', () => {
    const s = withColumns([[0, [card('spade', 5)]]]);
    expect(wasteTop(s)).toBeNull();
    expect(canPick(s, 0)).toBe(false);
    expect(hasAnyMove(s)).toBe(false);
    expect(pick(s, 0)).toBeNull();
  });

  it('取れるのは各列の手前の1枚だけ', () => {
    const s = withColumns([[0, [card('spade', 6), card('heart', 9)]]], {
      waste: [card('club', 5)],
    });
    // 手前は9。5とはつながらないので取れない（奥の6は取れる札ではない）
    expect(frontOf(s, 0)).toEqual(card('heart', 9));
    expect(canPick(s, 0)).toBe(false);
  });

  it('捨て札と1つ違いなら取れて、捨て札が入れ替わる', () => {
    const s = withColumns([[0, [card('spade', 6), card('heart', 4)]]], {
      waste: [card('club', 5)],
    });
    const next = pick(s, 0)!;
    expect(next.tableau[0]).toEqual([card('spade', 6)]);
    expect(wasteTop(next)).toEqual(card('heart', 4));
    expect(next.moves).toBe(1);
    expect(remaining(next)).toBe(1);
  });

  it('スートは問わない', () => {
    for (const suit of ['spade', 'heart', 'diamond', 'club'] as Suit[]) {
      const s = withColumns([[0, [card(suit, 4)]]], { waste: [card('spade', 5)] });
      expect(canPick(s, 0)).toBe(true);
    }
  });

  it('空の列からは取れない', () => {
    const s = withColumns([], { waste: [card('spade', 5)] });
    expect(frontOf(s, 3)).toBeNull();
    expect(canPick(s, 3)).toBe(false);
    expect(pickableColumns(s)).toEqual([]);
  });

  it('列の外を指しても落ちない', () => {
    const s = withColumns([[0, [card('spade', 4)]]], { waste: [card('spade', 5)] });
    expect(frontOf(s, -1)).toBeNull();
    expect(canPick(s, COLS)).toBe(false);
    expect(pick(s, COLS)).toBeNull();
  });

  it('A と K は既定では取れず、wrap のときだけ取れる', () => {
    const base = withColumns([[0, [card('spade', 1)]]], { waste: [card('heart', 13)] });
    expect(canPick(base, 0)).toBe(false);
    expect(canPick({ ...base, wrap: true }, 0)).toBe(true);
  });

  it('元の状態は書き換わらない（不変値として扱う）', () => {
    const s = withColumns([[0, [card('spade', 4)]]], { waste: [card('spade', 5)] });
    const before = structuredClone(s);
    pick(s, 0);
    expect(s).toEqual(before);
  });
});

describe('連鎖', () => {
  it('続けて取ると伸び、最長も更新される', () => {
    let s: GolfState = withColumns(
      [
        [0, [card('spade', 4)]],
        [1, [card('heart', 3)]],
        [2, [card('club', 2)]],
      ],
      { waste: [card('diamond', 5)] },
    );
    s = pick(s, 0)!;
    expect([s.chain, s.maxChain]).toEqual([1, 1]);
    s = pick(s, 1)!;
    s = pick(s, 2)!;
    expect([s.chain, s.maxChain]).toEqual([3, 3]);
  });

  it('山札をめくると連鎖は0に戻るが、最長は残る', () => {
    let s: GolfState = withColumns([[0, [card('spade', 4)]]], {
      waste: [card('diamond', 5)],
      stock: [card('club', 10, false)],
    });
    s = pick(s, 0)!;
    expect(s.chain).toBe(1);
    s = draw(s)!;
    expect(s.chain).toBe(0);
    expect(s.maxChain).toBe(1);
    // めくりは「取った回数」には数えない
    expect(s.moves).toBe(1);
  });
});

describe('山札をめくる（draw）', () => {
  it('末尾からめくって表向きで捨て札に載る', () => {
    const s = empty({ stock: [card('spade', 2, false), card('heart', 9, false)] });
    const next = draw(s)!;
    expect(next.stock).toHaveLength(1);
    expect(wasteTop(next)).toEqual(card('heart', 9));
    expect(wasteTop(next)!.faceUp).toBe(true);
  });

  it('先に配った札から順に出る', () => {
    let s: GolfState = deal(999);
    const order = [...s.stock].reverse().map((c) => c.id);
    const seen: number[] = [];
    while (canDraw(s)) {
      s = draw(s)!;
      seen.push(wasteTop(s)!.id);
    }
    expect(seen).toEqual(order);
  });

  it('山札が無ければめくれない', () => {
    const s = empty();
    expect(canDraw(s)).toBe(false);
    expect(draw(s)).toBeNull();
  });
});

describe('ヒント', () => {
  it('取れる列のうち、残り枚数がいちばん多い列を返す', () => {
    const s = withColumns(
      [
        [0, [card('spade', 4)]],
        [1, [card('heart', 9), card('club', 8), card('spade', 6)]],
      ],
      { waste: [card('diamond', 5)] },
    );
    expect(pickableColumns(s)).toEqual([0, 1]);
    expect(hint(s)).toBe(1);
  });

  it('同じ枚数なら左の列', () => {
    const s = withColumns(
      [
        [2, [card('spade', 4)]],
        [5, [card('heart', 6)]],
      ],
      { waste: [card('diamond', 5)] },
    );
    expect(hint(s)).toBe(2);
  });

  it('取れる札が無ければ null', () => {
    const s = withColumns([[0, [card('spade', 9)]]], { waste: [card('diamond', 5)] });
    expect(hint(s)).toBeNull();
  });
});

describe('決着', () => {
  it('場札を全部取り切ったらクリア', () => {
    const s = withColumns([[0, [card('spade', 4)]]], { waste: [card('diamond', 5)] });
    const next = pick(s, 0)!;
    expect(isCleared(next)).toBe(true);
    expect(isLost(next)).toBe(false);
    expect(remaining(next)).toBe(0);
  });

  it('取れる札が無く山札も尽きたら詰み', () => {
    const s = withColumns([[0, [card('spade', 9)]]], { waste: [card('diamond', 5)] });
    expect(hasAnyMove(s)).toBe(false);
    expect(canDraw(s)).toBe(false);
    expect(isLost(s)).toBe(true);
  });

  it('山札が残っているうちは詰みにしない', () => {
    const s = withColumns([[0, [card('spade', 9)]]], {
      waste: [card('diamond', 5)],
      stock: [card('club', 3, false)],
    });
    expect(hasAnyMove(s)).toBe(false);
    expect(isLost(s)).toBe(false);
  });

  it('取れる札が残っているうちは詰みにしない', () => {
    const s = withColumns([[0, [card('spade', 4)]]], { waste: [card('diamond', 5)] });
    expect(isLost(s)).toBe(false);
  });

  it('クリアした状態は詰みにしない（両方 true にならない）', () => {
    const s = empty({ waste: [card('diamond', 5)] });
    expect(isCleared(s)).toBe(true);
    expect(isLost(s)).toBe(false);
  });

  it('配りはじめは、めくれるので詰みではない', () => {
    const s = deal(31);
    expect(hasAnyMove(s)).toBe(false);
    expect(isLost(s)).toBe(false);
    expect(isCleared(s)).toBe(false);
  });
});

describe('記録', () => {
  it('クリア率はプレイ数で割る', () => {
    expect(clearRate(0, 0)).toBeNull();
    expect(clearRate(1, 4)).toBe(25);
    expect(clearRate(1, 3)).toBe(33);
    // 記録が壊れていても100%を超えない
    expect(clearRate(9, 4)).toBe(100);
  });

  it('区分はルールごとに分ける（既定は空文字＝DEFAULT_VARIANT）', () => {
    expect(variantOf(false)).toBe('');
    expect(variantOf(true)).toBe(WRAP_VARIANT);
  });
});
