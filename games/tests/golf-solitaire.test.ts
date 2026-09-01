import { describe, expect, it } from 'vitest';
import { type Card, type Suit } from '@/lib/cards';
import {
  canDraw,
  canPick,
  clearRate,
  COLUMN_SIZE,
  COLUMNS,
  connects,
  deal,
  draw,
  frontCard,
  hasAnyMove,
  hint,
  isCleared,
  isLost,
  isPoorDeal,
  newSeed,
  pick,
  pickableColumns,
  remaining,
  STOCK_SIZE,
  TABLEAU_SIZE,
  VARIANT_LABEL,
  VARIANT_NOTE,
  VARIANTS,
  wasteTop,
  wrapsIn,
  type GolfState,
  type GolfVariant,
} from '@/lib/golf-solitaire';

/**
 * ゴルフソリティアのテスト。
 *
 * 仕様: docs/features/game-golf-solitaire.md
 *
 * トライピークスと芯が同じルールなので、**違うところ**（列の手前しか取れない・
 * KとAが既定ではつながらない・捨て札が空から始まる）を重点的に見る。
 */

const card = (suit: Suit, rank: number, faceUp = true): Card => ({
  suit,
  rank: rank as Card['rank'],
  faceUp,
  id: suit.charCodeAt(0) * 100 + rank,
});

/** 場が空の状態。テストごとに必要な列だけ置く */
const empty = (variant: GolfVariant = 'standard'): GolfState => ({
  columns: Array.from({ length: COLUMNS }, () => []),
  stock: [],
  waste: [],
  chain: 0,
  maxChain: 0,
  moves: 0,
  seed: 1,
  variant,
});

/** `columns[col] = cards` を置いた状態を作る */
const withColumns = (
  entries: [number, Card[]][],
  base: GolfState = empty(),
): GolfState => {
  const columns = base.columns.map((c) => [...c]);
  for (const [i, cards] of entries) columns[i] = cards;
  return { ...base, columns };
};

/** 捨て札の一番上を置いた状態を作る */
const withWaste = (s: GolfState, top: Card): GolfState => ({ ...s, waste: [top] });

describe('盤の大きさ', () => {
  it('7列×5枚で35枚。山札は17枚', () => {
    expect(COLUMNS).toBe(7);
    expect(COLUMN_SIZE).toBe(5);
    expect(TABLEAU_SIZE).toBe(35);
    expect(STOCK_SIZE).toBe(17);
    // **捨て札は空から始まる**ので、場35 + 山札17 でちょうど52枚になる
    expect(TABLEAU_SIZE + STOCK_SIZE).toBe(52);
  });

  it('区分は2つで、どちらにも短い名前と説明がある', () => {
    expect(VARIANTS).toEqual(['standard', 'wrap']);
    for (const v of VARIANTS) {
      expect(VARIANT_LABEL[v].length).toBeGreaterThan(0);
      expect(VARIANT_NOTE[v].length).toBeGreaterThan(0);
    }
  });

  /**
   * 案内は `.gf-legend`（幅320pxで2行ぶん・`overflow: hidden`）に収まる長さで持つ。
   * 実測で1行あたり約13文字なので26文字が上限。**伸ばすと文の途中で切れる**
   */
  it('案内は幅320pxの2行に収まる長さ', () => {
    for (const v of VARIANTS) {
      expect(VARIANT_NOTE[v].length, `${v}: 案内が長すぎる`).toBeLessThanOrEqual(26);
    }
    // セグメントは2つ並べて幅320pxの1行に収める
    for (const v of VARIANTS) {
      expect(VARIANT_LABEL[v].length).toBeLessThanOrEqual(6);
    }
  });

  it('ラップを使うのは wrap の区分だけ', () => {
    expect(wrapsIn('standard')).toBe(false);
    expect(wrapsIn('wrap')).toBe(true);
  });
});

describe('deal', () => {
  const s = deal(12345);

  it('場は7列×5枚で全部表向き', () => {
    expect(s.columns).toHaveLength(COLUMNS);
    for (const column of s.columns) {
      expect(column).toHaveLength(COLUMN_SIZE);
      for (const c of column) expect(c.faceUp).toBe(true);
    }
    expect(remaining(s)).toBe(TABLEAU_SIZE);
  });

  it('山札は17枚で裏向き、捨て札は空', () => {
    expect(s.stock).toHaveLength(STOCK_SIZE);
    for (const c of s.stock) expect(c.faceUp).toBe(false);
    expect(s.waste).toEqual([]);
    expect(wasteTop(s)).toBeNull();
  });

  it('52枚がすべて重複なく使われる', () => {
    const all = [...s.columns.flat(), ...s.stock];
    expect(all).toHaveLength(52);
    expect(new Set(all.map((c) => c.id)).size).toBe(52);
    for (let rank = 1; rank <= 13; rank += 1) {
      expect(all.filter((c) => c.rank === rank)).toHaveLength(4);
    }
  });

  it('同じシードなら同じ配り、違うシードなら別の配り', () => {
    const ids = (x: GolfState) => x.columns.flat().map((c) => c.id);
    expect(ids(deal(777))).toEqual(ids(deal(777)));
    expect(ids(deal(777))).not.toEqual(ids(deal(778)));
  });

  it('区分は配りに影響しない（同じシードなら盤面は同じ）', () => {
    const ids = (x: GolfState) => x.columns.flat().map((c) => c.id);
    expect(ids(deal(555, 'wrap'))).toEqual(ids(deal(555, 'standard')));
    expect(deal(555, 'wrap').variant).toBe('wrap');
    expect(deal(555).variant).toBe('standard');
  });

  it('捨て札が空のあいだは1枚も取れない（まず山札をめくる）', () => {
    expect(hasAnyMove(s)).toBe(false);
    expect(pickableColumns(s)).toEqual([]);
    expect(hint(s)).toBeNull();
    // 山札が残っているので詰みではない
    expect(isLost(s)).toBe(false);
    expect(canDraw(s)).toBe(true);
  });

  it('newSeed は1以上の整数', () => {
    expect(newSeed(() => 0)).toBe(1);
    expect(newSeed(() => 0.999999)).toBe(1_000_000);
    expect(Number.isInteger(newSeed())).toBe(true);
  });
});

describe('配り直しのガード', () => {
  it('同じ数字が4枚1列に固まった配りは弾く', () => {
    const bad = [
      [card('spade', 5), card('heart', 5), card('diamond', 5), card('club', 5), card('spade', 9)],
      [card('heart', 2)],
    ];
    expect(isPoorDeal(bad)).toBe(true);
  });

  it('同じ数字が3枚までなら弾かない', () => {
    const ok = [
      [card('spade', 5), card('heart', 5), card('diamond', 5), card('club', 9), card('spade', 2)],
      [card('heart', 3)],
      [card('club', 7)],
    ];
    expect(isPoorDeal(ok)).toBe(false);
  });

  it('手前の札が2種類しかない配りは弾く', () => {
    // 奥は同じ札でよい（見るのは各列の手前の1枚だけ）
    const fronts = (ranks: number[]) => ranks.map((r) => [card('spade', 1), card('heart', r)]);
    // 7列すべての手前が3か4しかない
    expect(isPoorDeal(fronts([3, 4, 3, 4, 3, 4, 3]))).toBe(true);
    expect(isPoorDeal(fronts([3, 4, 5, 4, 3, 4, 3]))).toBe(false);
  });

  it('空の場は弾かない（クリア済みの盤面をガードに掛けない）', () => {
    expect(isPoorDeal([[], [], []])).toBe(false);
  });

  it('実際に配った盤面はガードを通り抜けている', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      expect(isPoorDeal(deal(seed).columns), `seed=${seed}`).toBe(false);
    }
  });
});

describe('つながりの判定', () => {
  it('ランクが±1でつながる', () => {
    expect(connects(7, 8)).toBe(true);
    expect(connects(8, 7)).toBe(true);
    expect(connects(7, 7)).toBe(false);
    expect(connects(7, 9)).toBe(false);
  });

  it('既定ではKとAはつながらない（Kで連鎖が止まる）', () => {
    expect(connects(13, 1)).toBe(false);
    expect(connects(1, 13)).toBe(false);
    // Aの隣は2だけ、Kの隣はQだけ
    expect(connects(1, 2)).toBe(true);
    expect(connects(13, 12)).toBe(true);
  });

  it('wrap ではKとAもつながる', () => {
    expect(connects(13, 1, true)).toBe(true);
    expect(connects(1, 13, true)).toBe(true);
    // ラップを入れても、離れた数字がつながるようになったりはしない
    expect(connects(1, 12, true)).toBe(false);
    expect(connects(2, 13, true)).toBe(false);
  });
});

describe('取れる札', () => {
  it('取れるのは列の手前（末尾）の1枚だけ', () => {
    const s = withWaste(
      withColumns([[0, [card('spade', 8), card('heart', 3)]]]),
      card('club', 9),
    );
    // 手前は3。奥の8は捨て札の9と1つ違いだが取れない
    expect(frontCard(s, 0)).toEqual(card('heart', 3));
    expect(canPick(s, 0)).toBe(false);

    const next = withWaste(s, card('club', 2));
    expect(canPick(next, 0)).toBe(true);
  });

  it('空の列は取れない', () => {
    const s = withWaste(empty(), card('club', 5));
    expect(frontCard(s, 3)).toBeNull();
    expect(canPick(s, 3)).toBe(false);
  });

  it('場の外の列番号を渡しても落ちない', () => {
    const s = withWaste(empty(), card('club', 5));
    expect(frontCard(s, COLUMNS)).toBeNull();
    expect(canPick(s, -1)).toBe(false);
  });

  it('捨て札が無ければ何も取れない', () => {
    const s = withColumns([[0, [card('spade', 5)]]]);
    expect(canPick(s, 0)).toBe(false);
  });

  it('スートは問わない', () => {
    for (const suit of ['spade', 'heart', 'diamond', 'club'] as Suit[]) {
      const s = withWaste(withColumns([[0, [card(suit, 4)]]]), card('spade', 5));
      expect(canPick(s, 0)).toBe(true);
    }
  });

  it('標準ではKの次にAを取れないが、wrap では取れる', () => {
    const std = withWaste(withColumns([[0, [card('spade', 1)]]]), card('heart', 13));
    expect(canPick(std, 0)).toBe(false);

    const wrap = withWaste(
      withColumns([[0, [card('spade', 1)]]], empty('wrap')),
      card('heart', 13),
    );
    expect(canPick(wrap, 0)).toBe(true);
  });

  it('取れる列を左から順に挙げる', () => {
    const s = withWaste(
      withColumns([
        [0, [card('spade', 5)]],
        [2, [card('heart', 7)]],
        [5, [card('club', 5)]],
      ]),
      card('diamond', 6),
    );
    expect(pickableColumns(s)).toEqual([0, 2, 5]);
    expect(hasAnyMove(s)).toBe(true);
  });
});

describe('ヒント', () => {
  it('残り枚数がいちばん多い列を返す', () => {
    const s = withWaste(
      withColumns([
        [0, [card('spade', 5)]],
        [3, [card('heart', 2), card('heart', 9), card('club', 5)]],
        [6, [card('diamond', 4), card('diamond', 5)]],
      ]),
      card('club', 6),
    );
    expect(pickableColumns(s)).toEqual([0, 3, 6]);
    expect(hint(s)).toBe(3);
  });

  it('枚数が同じなら左の列（返す手は決定的）', () => {
    const s = withWaste(
      withColumns([
        [2, [card('spade', 9), card('spade', 5)]],
        [4, [card('heart', 9), card('heart', 5)]],
      ]),
      card('club', 6),
    );
    expect(hint(s)).toBe(2);
    expect(hint(s)).toBe(2);
  });

  it('取れる札が無ければ null', () => {
    const s = withWaste(withColumns([[0, [card('spade', 9)]]]), card('club', 2));
    expect(hint(s)).toBeNull();
  });
});

describe('pick（取る・連鎖）', () => {
  const base = () =>
    withWaste(
      withColumns([
        [0, [card('spade', 8), card('heart', 5)]],
        [1, [card('club', 4)]],
      ]),
      card('diamond', 6),
    );

  it('取った札が新しい捨て札になり、連鎖が1増える', () => {
    const next = pick(base(), 0)!;
    expect(next).not.toBeNull();
    expect(wasteTop(next)).toEqual(card('heart', 5));
    expect(next.columns[0]).toEqual([card('spade', 8)]);
    expect(next.chain).toBe(1);
    expect(next.maxChain).toBe(1);
    expect(next.moves).toBe(1);
    expect(remaining(next)).toBe(2);
  });

  it('取ると1つ奥の札が手前になる', () => {
    const next = pick(base(), 0)!;
    expect(frontCard(next, 0)).toEqual(card('spade', 8));
    // 捨て札は5なので、8はまだ取れない
    expect(canPick(next, 0)).toBe(false);
  });

  it('つながる限り連鎖が伸びる', () => {
    // 6 → 5 → 4 と続けて取る
    const a = pick(base(), 0)!;
    const b = pick(a, 1)!;
    expect(b.chain).toBe(2);
    expect(b.maxChain).toBe(2);
    expect(wasteTop(b)).toEqual(card('club', 4));
  });

  it('取れない列を指定すると null で、状態は変わらない', () => {
    const s = base();
    const before = JSON.stringify(s);
    expect(pick(s, 1)).toBeNull(); // 4は捨て札6と2つ違い
    expect(pick(s, 5)).toBeNull(); // 空の列
    expect(JSON.stringify(s)).toBe(before);
  });

  it('取っても山札は減らない', () => {
    const s = { ...base(), stock: [card('spade', 2, false)] };
    expect(pick(s, 0)!.stock).toHaveLength(1);
  });

  it('元の状態を書き換えない（不変値として扱う）', () => {
    const s = base();
    pick(s, 0);
    expect(s.columns[0]).toHaveLength(2);
    expect(s.waste).toHaveLength(1);
  });
});

describe('山札', () => {
  const base = (): GolfState => ({
    ...withColumns([[0, [card('spade', 8)]]]),
    stock: [card('heart', 2, false), card('club', 9, false)],
  });

  it('めくると末尾の1枚が表向きで捨て札の一番上へ', () => {
    const next = draw(base())!;
    expect(wasteTop(next)).toEqual(card('club', 9));
    expect(next.stock).toHaveLength(1);
    expect(next.waste).toHaveLength(1);
  });

  it('めくると連鎖は途切れるが、最長連鎖は残る', () => {
    const s = { ...base(), chain: 4, maxChain: 4 };
    const next = draw(s)!;
    expect(next.chain).toBe(0);
    expect(next.maxChain).toBe(4);
  });

  it('めくっても場札は減らないし、手数も増えない', () => {
    const next = draw(base())!;
    expect(remaining(next)).toBe(1);
    expect(next.moves).toBe(0);
  });

  it('山札が空ならめくれない（引き直しは無い）', () => {
    const s = { ...base(), stock: [] };
    expect(canDraw(s)).toBe(false);
    expect(draw(s)).toBeNull();
  });

  it('配った順に出てくる', () => {
    const s = deal(4242);
    const order = [...s.stock].reverse().map((c) => c.id);
    let cur = s;
    const drawn: number[] = [];
    while (canDraw(cur)) {
      cur = draw(cur)!;
      drawn.push(wasteTop(cur)!.id);
    }
    expect(drawn).toEqual(order);
    expect(drawn).toHaveLength(STOCK_SIZE);
  });
});

describe('クリアと詰みの判定', () => {
  it('場札が無くなったらクリア', () => {
    const s = withWaste(empty(), card('club', 5));
    expect(remaining(s)).toBe(0);
    expect(isCleared(s)).toBe(true);
    expect(isLost(s)).toBe(false);
  });

  it('取れる札が無く、山札も尽きたら詰み', () => {
    const s = withWaste(withColumns([[0, [card('spade', 9)]]]), card('club', 2));
    expect(isLost(s)).toBe(true);
  });

  it('山札が残っていれば詰みではない', () => {
    const s = {
      ...withWaste(withColumns([[0, [card('spade', 9)]]]), card('club', 2)),
      stock: [card('heart', 3, false)],
    };
    expect(isLost(s)).toBe(false);
  });

  it('取れる札があれば詰みではない', () => {
    const s = withWaste(withColumns([[0, [card('spade', 3)]]]), card('club', 2));
    expect(isLost(s)).toBe(false);
  });

  it('標準では詰みでも、wrap なら続けられる場面がある', () => {
    const cards: [number, Card[]][] = [[0, [card('spade', 1)]]];
    const std = withWaste(withColumns(cards), card('club', 13));
    const wrap = withWaste(withColumns(cards, empty('wrap')), card('club', 13));
    expect(isLost(std)).toBe(true);
    expect(isLost(wrap)).toBe(false);
  });
});

describe('クリア率', () => {
  it('プレイ数で割る（途中でやめた分も母数に入れる）', () => {
    expect(clearRate(1, 4)).toBe(25);
    expect(clearRate(0, 4)).toBe(0);
    expect(clearRate(3, 3)).toBe(100);
  });

  it('まだ遊んでいなければ null', () => {
    expect(clearRate(0, 0)).toBeNull();
    expect(clearRate(2, 0)).toBeNull();
  });

  it('プレイ数より多い勝ちは100%で頭打ちにする（壊れた記録が入っても崩れない）', () => {
    expect(clearRate(9, 2)).toBe(100);
  });
});

describe('通しで遊ぶ（不変条件）', () => {
  /** ヒント通りに取り、取れなければめくる。手が尽きるまで進める */
  const playOut = (start: GolfState, check?: (s: GolfState) => void): GolfState => {
    let s = start;
    for (let step = 0; step < 200; step += 1) {
      check?.(s);
      const found = hint(s);
      const next = found !== null ? pick(s, found) : draw(s);
      if (!next) return s;
      s = next;
    }
    throw new Error('手が終わらない（進行が壊れている）');
  };

  it('どの手を打っても、52枚は場・山札・捨て札のどこかにある', () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      playOut(deal(seed), (s) => {
        const all = [...s.columns.flat(), ...s.stock, ...s.waste];
        expect(all, `seed=${seed}`).toHaveLength(52);
        expect(new Set(all.map((c) => c.id)).size).toBe(52);
      });
    }
  });

  it('列は7本のまま。取った札は必ず手前から減る', () => {
    for (const seed of [7, 31, 2026]) {
      let prev: GolfState | null = null;
      playOut(deal(seed), (s) => {
        expect(s.columns).toHaveLength(COLUMNS);
        for (const column of s.columns) expect(column.length).toBeLessThanOrEqual(COLUMN_SIZE);
        if (prev) {
          // 1手で減るのは高々1枚。減った列は末尾が1枚短くなっただけ
          for (let c = 0; c < COLUMNS; c += 1) {
            const before = prev.columns[c];
            const after = s.columns[c];
            expect(before.length - after.length).toBeLessThanOrEqual(1);
            expect(after.map((x) => x.id)).toEqual(
              before.slice(0, after.length).map((x) => x.id),
            );
          }
        }
        prev = s;
      });
    }
  });

  it('連鎖は取るたびに1ずつ増え、めくると0に戻る。最長連鎖はそれを下回らない', () => {
    let s = deal(31337);
    for (let step = 0; step < 200; step += 1) {
      const found = hint(s);
      const before = s;
      const next = found !== null ? pick(s, found) : draw(s);
      if (!next) break;
      expect(next.chain).toBe(found !== null ? before.chain + 1 : 0);
      expect(next.maxChain).toBeGreaterThanOrEqual(before.maxChain);
      expect(next.maxChain).toBeGreaterThanOrEqual(next.chain);
      s = next;
    }
  });

  it('最後は必ずクリアか詰みで止まる（どちらでもない止まり方をしない）', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const end = playOut(deal(seed));
      expect(isCleared(end) || isLost(end), `seed=${seed}`).toBe(true);
    }
  });

  it('wrap のほうが取れる手は減らない（ラップは選択肢を足すだけ）', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const std = draw(deal(seed, 'standard'))!;
      const wrap = draw(deal(seed, 'wrap'))!;
      const a = pickableColumns(std);
      const b = pickableColumns(wrap);
      expect(b, `seed=${seed}`).toEqual(expect.arrayContaining(a));
    }
  });
});
