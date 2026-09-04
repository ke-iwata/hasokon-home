import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type Card, type Suit } from '@/lib/cards';
import {
  bestRemaining,
  canDraw,
  canPick,
  COLUMNS,
  COLUMN_SIZE,
  connects,
  deal,
  draw,
  frontOf,
  hasAnyMove,
  hint,
  isCleared,
  isStuck,
  newSeed,
  pick,
  pickableColumns,
  remaining,
  STOCK_SIZE,
  TABLEAU_SIZE,
  wasteTop,
  type GolfState,
} from '@/lib/golf-solitaire';
import {
  allHintRowMessages,
  HINT_ROW_MAX_WIDTH,
  stuckMessage,
  textWidth,
} from '@/app/golf-solitaire/messages';

/**
 * ゴルフソリティアのテスト（仕様: docs/features/game-golf-solitaire.md）。
 *
 * とくに見張っているのは、仕様書が「流用元との差分」として名指しした2点。
 * どちらもトライピークスをそのまま持ってくると**逆になる**。
 *
 * 1. **±1判定のラップは既定 off**（AとKはつながらない）
 * 2. **配りはじめの捨て札は置かない**（最初の1手は必ず山札めくり）
 */

const card = (suit: Suit, rank: number, faceUp = true): Card => ({
  suit,
  rank: rank as Card['rank'],
  faceUp,
  id: suit.charCodeAt(0) * 100 + rank,
});

/** 場が空の状態。テストごとに必要な札だけ置く */
const empty = (wrap = false): GolfState => ({
  columns: Array.from({ length: COLUMNS }, () => [] as Card[]),
  stock: [],
  waste: [],
  chain: 0,
  maxChain: 0,
  moves: 0,
  seed: 1,
  wrap,
});

/** 列ごとの札を置いた状態を作る */
const withColumns = (entries: [number, Card[]][], base: GolfState = empty()): GolfState => {
  const columns = base.columns.map((pile) => [...pile]);
  for (const [col, cards] of entries) columns[col] = cards;
  return { ...base, columns };
};

/** すべての札（場・山札・捨て札）を集める */
const allCards = (s: GolfState): Card[] => [...s.columns.flat(), ...s.stock, ...s.waste];

describe('配り', () => {
  const s = deal(12345);

  it('7列×5枚の35枚、山札17枚、捨て札は0枚', () => {
    expect(COLUMNS).toBe(7);
    expect(COLUMN_SIZE).toBe(5);
    expect(TABLEAU_SIZE).toBe(35);
    expect(STOCK_SIZE).toBe(17);
    expect(s.columns).toHaveLength(7);
    for (const pile of s.columns) expect(pile).toHaveLength(5);
    expect(s.stock).toHaveLength(17);
    // 35 + 17 = 52。**捨て札に回す52枚目が無い**（トライピークスとの差分）
    expect(TABLEAU_SIZE + STOCK_SIZE).toBe(52);
  });

  it('配りはじめの捨て札は置かない（最初の1手は必ず山札めくり）', () => {
    expect(s.waste).toEqual([]);
    expect(wasteTop(s)).toBeNull();
    expect(hasAnyMove(s)).toBe(false);
    expect(pickableColumns(s)).toEqual([]);
    expect(canDraw(s)).toBe(true);
  });

  it('52枚がすべて重複なく使われる', () => {
    const cards = allCards(s);
    expect(cards).toHaveLength(52);
    expect(new Set(cards.map((c) => c.id)).size).toBe(52);
  });

  it('場札は全部表向き。山札は裏向き', () => {
    for (const pile of s.columns) {
      for (const c of pile) expect(c.faceUp).toBe(true);
    }
    for (const c of s.stock) expect(c.faceUp).toBe(false);
  });

  it('同じシードなら同じ配り、違うシードなら別の配り', () => {
    expect(deal(12345).columns).toEqual(s.columns);
    expect(deal(999).columns).not.toEqual(s.columns);
  });

  it('ラップ（A↔K）は既定で off。指定すれば on になる', () => {
    expect(deal(1).wrap).toBe(false);
    expect(deal(1, true).wrap).toBe(true);
  });

  it('進行の数え方は0から始まる', () => {
    expect([s.chain, s.maxChain, s.moves]).toEqual([0, 0, 0]);
    expect(remaining(s)).toBe(35);
    expect(isCleared(s)).toBe(false);
    expect(isStuck(s)).toBe(false);
  });

  it('newSeed は1以上の整数', () => {
    expect(newSeed(() => 0)).toBe(1);
    expect(newSeed(() => 0.5)).toBe(500001);
    expect(Number.isInteger(newSeed())).toBe(true);
  });
});

describe('つながりの判定', () => {
  it('ランクが±1でつながる', () => {
    expect(connects(7, 6)).toBe(true);
    expect(connects(7, 8)).toBe(true);
    expect(connects(7, 7)).toBe(false);
    expect(connects(7, 9)).toBe(false);
  });

  /**
   * **ここがトライピークスとの決定的な差**。
   * `lib/tripeaks.ts` の `connects` は常に true を返す組み合わせ。
   */
  it('既定では A と K はつながらない（Kで連鎖が止まる）', () => {
    expect(connects(1, 13)).toBe(false);
    expect(connects(13, 1)).toBe(false);
    // 2とAは既定でもつながる（ただの±1）
    expect(connects(1, 2)).toBe(true);
  });

  it('wrap を on にしたときだけ A と K がつながる', () => {
    expect(connects(1, 13, true)).toBe(true);
    expect(connects(13, 1, true)).toBe(true);
    // ラップで増えるのは差12だけ。他は変わらない
    expect(connects(2, 13, true)).toBe(false);
    expect(connects(7, 9, true)).toBe(false);
  });
});

describe('取れる札', () => {
  const base = withColumns([
    [0, [card('spade', 5), card('heart', 9)]],
    [1, [card('club', 4)]],
    [2, [card('diamond', 13)]],
  ]);

  it('取れるのは各列の手前（末尾）の1枚だけ', () => {
    expect(frontOf(base, 0)).toEqual(card('heart', 9));
    const s = { ...base, waste: [card('spade', 10)] };
    // 手前は9なので取れる
    expect(canPick(s, 0)).toBe(true);
    // 奥の5は10とつながらないし、そもそも手前ではない
    const s5 = { ...base, waste: [card('spade', 6)] };
    expect(canPick(s5, 0)).toBe(false);
  });

  it('捨て札が無ければ何も取れない', () => {
    expect(canPick(base, 0)).toBe(false);
    expect(pickableColumns(base)).toEqual([]);
    expect(hasAnyMove(base)).toBe(false);
  });

  it('空の列と場の外は取れない', () => {
    const s = { ...base, waste: [card('spade', 10)] };
    expect(frontOf(s, 6)).toBeNull();
    expect(canPick(s, 6)).toBe(false);
    expect(canPick(s, -1)).toBe(false);
    expect(canPick(s, COLUMNS)).toBe(false);
  });

  it('取れる列を左から順に挙げる', () => {
    const s = withColumns(
      [
        [0, [card('heart', 5)]],
        [1, [card('club', 9)]],
        [3, [card('spade', 5)]],
      ],
      { ...empty(), waste: [card('diamond', 6)] },
    );
    expect(pickableColumns(s)).toEqual([0, 3]);
    expect(hasAnyMove(s)).toBe(true);
  });

  it('K の隣の A は既定では取れず、wrap を on にすると取れる', () => {
    const s = withColumns([[0, [card('heart', 1)]]], {
      ...empty(),
      waste: [card('spade', 13)],
    });
    expect(canPick(s, 0)).toBe(false);
    expect(canPick({ ...s, wrap: true }, 0)).toBe(true);
  });
});

describe('ヒント', () => {
  it('取れる列のうち、残り枚数がいちばん多い列を返す', () => {
    const s = withColumns(
      [
        [0, [card('heart', 5)]],
        [1, [card('club', 5)]],
        [2, [card('spade', 2), card('diamond', 3), card('heart', 5)]],
      ],
      { ...empty(), waste: [card('spade', 6)] },
    );
    expect(hint(s)).toBe(2);
  });

  it('枚数が並んだら左の列を返す', () => {
    const s = withColumns(
      [
        [2, [card('heart', 5)]],
        [4, [card('club', 5)]],
      ],
      { ...empty(), waste: [card('spade', 6)] },
    );
    expect(hint(s)).toBe(2);
  });

  it('取れる札が無ければ null', () => {
    expect(hint(empty())).toBeNull();
  });
});

describe('pick（取る・連鎖）', () => {
  const base = withColumns(
    [
      [0, [card('spade', 2), card('heart', 5)]],
      [1, [card('club', 6)]],
      [2, [card('diamond', 13)]],
    ],
    { ...empty(), waste: [card('spade', 4)] },
  );

  it('取った札が新しい捨て札になり、連鎖と手数が1増える', () => {
    const next = pick(base, 0)!;
    expect(next.columns[0]).toEqual([card('spade', 2)]);
    expect(wasteTop(next)).toEqual(card('heart', 5));
    expect(next.chain).toBe(1);
    expect(next.maxChain).toBe(1);
    expect(next.moves).toBe(1);
    expect(remaining(next)).toBe(remaining(base) - 1);
  });

  it('つながる限り連鎖が伸びる', () => {
    const a = pick(base, 0)!; // 4 → 5
    const b = pick(a, 1)!; // 5 → 6
    expect(b.chain).toBe(2);
    expect(b.maxChain).toBe(2);
    expect(b.moves).toBe(2);
    expect(remaining(b)).toBe(2);
  });

  it('取れない列を指定すると null で、状態は変わらない', () => {
    expect(pick(base, 2)).toBeNull();
    expect(pick(base, 6)).toBeNull();
    expect(pick(empty(), 0)).toBeNull();
  });

  it('取っても他の列は変わらない（配列を作り直しても中身は同じ）', () => {
    const next = pick(base, 0)!;
    expect(next.columns[1]).toEqual(base.columns[1]);
    expect(next.columns[2]).toEqual(base.columns[2]);
    // 元の状態を壊していない
    expect(base.columns[0]).toHaveLength(2);
    expect(base.waste).toHaveLength(1);
  });
});

describe('山札', () => {
  const base: GolfState = {
    ...empty(),
    stock: [card('club', 9, false), card('heart', 3, false)],
    waste: [card('spade', 7)],
    chain: 4,
    maxChain: 4,
  };

  it('めくると末尾の1枚が表向きで捨て札の一番上へ', () => {
    const next = draw(base)!;
    expect(wasteTop(next)).toEqual(card('heart', 3));
    expect(next.stock).toHaveLength(1);
  });

  it('めくると連鎖は途切れるが、最長連鎖は残る', () => {
    const next = draw(base)!;
    expect(next.chain).toBe(0);
    expect(next.maxChain).toBe(4);
  });

  it('めくっても場札は減らないし、手数も増えない', () => {
    const s = withColumns([[0, [card('spade', 2)]]], base);
    const next = draw(s)!;
    expect(remaining(next)).toBe(remaining(s));
    expect(next.moves).toBe(s.moves);
  });

  it('山札が空ならめくれない（引き直しは無い）', () => {
    const s = { ...base, stock: [] };
    expect(canDraw(s)).toBe(false);
    expect(draw(s)).toBeNull();
  });

  it('配った順に出てくる', () => {
    let s = deal(777);
    const order = [...s.stock].reverse().map((c) => c.id);
    const drawn: number[] = [];
    while (canDraw(s)) {
      s = draw(s)!;
      drawn.push(wasteTop(s)!.id);
    }
    expect(drawn).toEqual(order);
  });
});

describe('終わりの判定', () => {
  it('場札が無くなったらクリア', () => {
    const s = { ...empty(), stock: [card('club', 9, false)] };
    expect(remaining(s)).toBe(0);
    expect(isCleared(s)).toBe(true);
    expect(isStuck(s)).toBe(false);
  });

  it('取れる札が無く、山札も尽きたら終了', () => {
    const s = withColumns([[0, [card('spade', 5)]]], {
      ...empty(),
      waste: [card('heart', 9)],
    });
    expect(isCleared(s)).toBe(false);
    expect(isStuck(s)).toBe(true);
  });

  it('山札が残っていれば終了ではない', () => {
    const s = withColumns([[0, [card('spade', 5)]]], {
      ...empty(),
      stock: [card('club', 9, false)],
      waste: [card('heart', 9)],
    });
    expect(isStuck(s)).toBe(false);
  });

  it('取れる札があれば終了ではない', () => {
    const s = withColumns([[0, [card('spade', 8)]]], {
      ...empty(),
      waste: [card('heart', 9)],
    });
    expect(isStuck(s)).toBe(false);
  });

  it('配った直後は、捨て札が無くても山札があるので終了ではない', () => {
    const s = deal(4242);
    expect(hasAnyMove(s)).toBe(false);
    expect(isStuck(s)).toBe(false);
  });
});

describe('最少残り枚数（記録の器）', () => {
  /**
   * `lib/records.ts` の `bestMoves` は0を保存できない（`positive()` が落とす）ので、
   * クリアぶんは `wins` から復元する。仕様書「スコアと成功の見せ方」の約束。
   */
  it('1回でもクリアしていれば0枚', () => {
    expect(bestRemaining(1, 12)).toBe(0);
    expect(bestRemaining(3, undefined)).toBe(0);
  });

  it('クリアが無ければ保存された最少残り枚数', () => {
    expect(bestRemaining(0, 12)).toBe(12);
  });

  it('まだ記録が無ければ null（「残り0枚」と誤って出さない）', () => {
    expect(bestRemaining(0, undefined)).toBeNull();
  });
});

describe('通しで遊ぶ（不変条件）', () => {
  it('どの手を打っても、52枚は場・山札・捨て札のどこかにある', () => {
    for (const seed of [1, 2, 3, 101, 5150]) {
      let s = deal(seed);
      for (let step = 0; step < 200; step += 1) {
        const cards = allCards(s);
        expect(cards).toHaveLength(52);
        expect(new Set(cards.map((c) => c.id)).size).toBe(52);
        const col = hint(s);
        const next = col === null ? draw(s) : pick(s, col);
        if (!next) break;
        s = next;
      }
      expect(isCleared(s) || isStuck(s)).toBe(true);
    }
  });

  it('ヒント通りに取り続けても、手前でない札は絶対に消えない', () => {
    let s = deal(31337);
    // 各列の奥から数えた並びは、末尾から削られるだけで前は変わらない
    const heads = s.columns.map((pile) => pile.map((c) => c.id));
    for (let step = 0; step < 200; step += 1) {
      const col = hint(s);
      const next = col === null ? draw(s) : pick(s, col);
      if (!next) break;
      s = next;
      for (const [i, pile] of s.columns.entries()) {
        expect(pile.map((c) => c.id)).toEqual(heads[i].slice(0, pile.length));
      }
    }
  });

  it('連鎖は取るたびに1ずつ増え、めくると0に戻る。最長連鎖はそれを下回らない', () => {
    let s = deal(2468);
    let previous = 0;
    for (let step = 0; step < 200; step += 1) {
      const col = hint(s);
      const next = col === null ? draw(s) : pick(s, col);
      if (!next) break;
      expect(next.chain).toBe(col === null ? 0 : previous + 1);
      expect(next.maxChain).toBeGreaterThanOrEqual(next.chain);
      expect(next.maxChain).toBeGreaterThanOrEqual(s.maxChain);
      previous = next.chain;
      s = next;
    }
  });

  /**
   * ラップは**取れる手を増やすだけ**の設定なので、どの局面でも
   * 「既定で取れる列」は「ラップありで取れる列」に必ず含まれる。
   * （結果の残り枚数までは比べない。取る順で変わるので、そこは定理にならない）
   */
  it('ラップを on にすると、どの局面でも取れる列は減らない', () => {
    let s = deal(2026);
    for (let step = 0; step < 200; step += 1) {
      const plain = pickableColumns(s);
      const wrapped = pickableColumns({ ...s, wrap: true });
      expect(wrapped).toEqual(expect.arrayContaining(plain));
      const col = hint(s);
      const next = col === null ? draw(s) : pick(s, col);
      if (!next) break;
      s = next;
    }
  });
});

/**
 * 盤の寸法は `app/golf-solitaire/Game.tsx` の `STEP`（重なりの深さ）と
 * `app/globals.css` の `.gf-board`（隙間・縦横比・幅の下限）に**分かれて**書いてある。
 * games/CLAUDE.md が繰り返し警告しているとおり、**片方だけ直すと黙ってずれる**
 * （盤の高さが中身と合わなくなる／押す先が44pxを割る）ので、ここで突き合わせる。
 */
describe('盤の寸法（Game.tsx と globals.css の突き合わせ）', () => {
  const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
  const game = read('../app/golf-solitaire/Game.tsx');
  const css = read('../app/globals.css');
  const board = css.slice(css.indexOf('.gf-board {'), css.indexOf('}', css.indexOf('.gf-board {')));

  /** 重なりの深さ（札の高さに対する、見えている部分の比） */
  const step = Number(/const STEP = ([\d.]+);/.exec(game)![1]);
  /** 列と列の隙間（盤幅に対する比） */
  const gap = Number(/gap: ([\d.]+)%;/.exec(board)![1]) / 100;
  /** CSS が使っている「盤の高さ ÷ 盤の幅」。aspect-ratio と max-width の両方に出てくる */
  const ratioFromAspect = Number(/aspect-ratio: 1000 \/ (\d+);/.exec(board)![1]) / 1000;
  const ratioFromMaxWidth = Number(/100dvh - var\(--chrome\)\) \/ ([\d.]+)\)/.exec(board)![1]);
  /** 高さから盤を縮めるときの下限 */
  const floor = Number(/max\((\d+)px,/.exec(board)![1]);

  /** 札の高さ ÷ 盤の幅（列幅 × トランプの縦横比 7/5） */
  const cardHeight = ((1 - (COLUMNS - 1) * gap) / COLUMNS) * 1.4;
  /** 盤の高さ ÷ 盤の幅（手前の札1枚 ＋ 重なった4枚の見えている部分） */
  const ratio = cardHeight * (1 + (COLUMN_SIZE - 1) * step);

  it('Game.tsx の STEP と CSS の隙間から出る縦横比が、CSS の値と一致する', () => {
    expect(ratioFromAspect).toBeCloseTo(ratio, 3);
    expect(ratioFromMaxWidth).toBeCloseTo(ratio, 3);
  });

  it('幅の下限まで縮めても、手前の札は44pxを割らない', () => {
    // games/CLAUDE.md「押す先は44pxを割らない」。手前の札は重なりに隠れないので、
    // 札1枚ぶんの高さがそのままタップ領域になる
    expect(floor * cardHeight).toBeGreaterThanOrEqual(44);
  });

  it('重なりは、隠れた札の数字が読める深さに保つ', () => {
    // 見えている帯（札の高さの STEP 倍）に、角のインデックス（札の高さの約26%）が入ること
    expect(step).toBeGreaterThanOrEqual(0.3);
    // 深くしすぎると5枚ぶんで盤が縦に伸びて、スマホで盤が画面から出る
    expect(step).toBeLessThanOrEqual(0.6);
  });
});

/**
 * 盤の上の案内（`.hint-row`）の文言の長さ。
 *
 * `.hint-row` は `height: 3em` ＋ `overflow: hidden` なので、2行に収まらない文言は
 * **画面上で黙って切れる**。切れても誰も気づかないので、目視ではなくテストで守る
 * （2026-09-01 のレビューの指摘。上限まで余裕が1.5文字しかない状態だった）。
 *
 * 上限の36は Playwright での実測値。幅320pxで37文字目からあふれ、360pxでは40、
 * 390pxでは44まで入るので、**いちばん狭い320pxが効く**。
 */
describe('盤の上の案内（.hint-row）の文言', () => {
  it('全角換算の幅を数える（ASCIIは半角なので0.5）', () => {
    expect(textWidth('あいう')).toBe(3);
    expect(textWidth('abc')).toBe(1.5);
    expect(textWidth('残り 35 枚')).toBe(5);
  });

  it('いちばん長い値を入れても、どの文言も上限に収まる', () => {
    for (const message of allHintRowMessages()) {
      expect(textWidth(message), `長すぎて2行に収まらない: ${message}`).toBeLessThanOrEqual(
        HINT_ROW_MAX_WIDTH,
      );
    }
  });

  it('連鎖・残り枚数は場札の35枚を超えないので、2桁でいちばん長くなる', () => {
    // 上の網が「いちばん長い値」を見ていることの裏取り。
    // 3桁になることはない（場札は35枚しかない）
    expect(TABLEAU_SIZE).toBe(35);
    expect(textWidth(stuckMessage(35, 35))).toBeGreaterThan(textWidth(stuckMessage(1, 1)));
  });

  /**
   * **文言は `messages.ts` に集める。** `Game.tsx` に直書きすると、
   * 上の長さの網から外れて黙って切れる側に落ちる。
   */
  it('Game.tsx は案内文を直書きせず、messages.ts から取る', () => {
    const game = readFileSync(
      fileURLToPath(new URL('../app/golf-solitaire/Game.tsx', import.meta.url)),
      'utf8',
    );
    expect(game).toContain("from './messages'");
    // setNote に文字列リテラルを渡していない（定数か null だけ）
    expect(game).not.toMatch(/setNote\(\s*['"`]./);
  });
});
