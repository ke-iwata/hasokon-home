import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@/lib/daily';
import {
  boardKey,
  dailyBoard,
  deal,
  distances3,
  hint,
  inversions,
  isNearSolved,
  isSolvable,
  isSolved,
  optimalHint,
  optimalMoves,
  play,
  restart,
  shareText,
  slide,
  slidesToward,
  solvedBoard,
  startPlay,
  tileForDirection,
  undo,
  variantOf,
} from '@/lib/fifteen';
import { entryOf, loadRecords, recordResult, type RecordStorage } from '@/lib/records';

/**
 * 15パズルのテスト。仕様: docs/features/game-15-puzzle.md の「テスト」
 */

function fakeStorage(): RecordStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

/** 完成形の 14 と 15（3×3 なら 7 と 8）を入れ替えた、解けない盤 */
function swappedLastTwo(n: number): number[] {
  const b = solvedBoard(n);
  const last = n * n - 1;
  [b[last - 2], b[last - 1]] = [b[last - 1], b[last - 2]];
  return b;
}

describe('解けるかの判定', () => {
  it('完成形は解ける', () => {
    for (const n of [3, 4, 5]) expect(isSolvable(solvedBoard(n))).toBe(true);
  });

  it('14 と 15 を入れ替えた「14-15パズル」は解けない（4×4）', () => {
    const b = swappedLastTwo(4);
    expect(b.slice(-3)).toEqual([15, 14, 0]);
    expect(inversions(b)).toBe(1);
    expect(isSolvable(b)).toBe(false);
  });

  it('3×3 で 7 と 8 を入れ替えた盤は解けない', () => {
    expect(isSolvable(swappedLastTwo(3))).toBe(false);
    expect(isSolvable(swappedLastTwo(5))).toBe(false);
  });

  it('偶数の盤では空きの行も数に入る（空きを1段上げると、解けない並びが解けるのではなく偶奇が変わる）', () => {
    // 完成形から空きを上に1つ動かした盤（1手）は解ける
    const moved = slide(solvedBoard(4), 11)!.board;
    expect(isSolvable(moved)).toBe(true);
    // 同じ盤で空き以外の2枚を入れ替えると解けない
    const broken = moved.slice();
    [broken[0], broken[1]] = [broken[1], broken[0]];
    expect(isSolvable(broken)).toBe(false);
  });

  it('解けるかの判定は 3×3 の幅優先探索と一致する', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 300; i++) {
      const b = solvedBoard(3);
      for (let j = b.length - 1; j > 0; j--) {
        const k = Math.floor(rng() * (j + 1));
        [b[j], b[k]] = [b[k], b[j]];
      }
      expect(isSolvable(b)).toBe(optimalMoves(b) !== null);
    }
  });
});

describe('配り方', () => {
  it('配った盤は 1,000 回とも解ける判定になり、完成形にも完成5手以内にもならない', () => {
    for (const n of [3, 4, 5]) {
      const rng = mulberry32(n * 1000 + 7);
      for (let i = 0; i < 1000; i++) {
        const b = deal(n, rng);
        expect(b).toHaveLength(n * n);
        expect([...b].sort((x, y) => x - y)).toEqual([...Array(n * n).keys()]);
        expect(isSolvable(b)).toBe(true);
        expect(isSolved(b)).toBe(false);
        expect(isNearSolved(b)).toBe(false);
      }
    }
  });

  it('完成から5手以内の盤は「近すぎる」と判定する（6手目以降は対象外）', () => {
    // 空きを左へ5つ…は4×4では3つまでなので、左3・上2で5手
    let b = solvedBoard(4);
    for (const idx of [14, 13, 12, 8, 4]) b = slide(b, idx)!.board;
    expect(isNearSolved(b)).toBe(true);
    b = slide(b, 0)!.board; // 6手目
    expect(isNearSolved(b)).toBe(false);
    expect(isNearSolved(solvedBoard(4))).toBe(true);
  });

  it('3×3 では完成から5手以内の盤が実際に配られない（最短手数が6以上）', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 300; i++) expect(optimalMoves(deal(3, rng))!).toBeGreaterThan(5);
  });

  it('同じ乱数からは同じ盤', () => {
    expect(deal(4, mulberry32(9))).toEqual(deal(4, mulberry32(9)));
  });
});

describe('今日の1面', () => {
  it('同じ日付からは同じ盤、別の日付からは別の盤', () => {
    expect(dailyBoard('2026-12-24')).toEqual(dailyBoard('2026-12-24'));
    expect(dailyBoard('2026-12-24')).not.toEqual(dailyBoard('2026-12-25'));
  });

  it('4×4 で解けて、完成形でない', () => {
    const b = dailyBoard('2026-12-31');
    expect(b).toHaveLength(16);
    expect(isSolvable(b)).toBe(true);
    expect(isSolved(b)).toBe(false);
  });

  it('共有テキストは手数・時間・連続日数だけを載せ、盤そのものは載せない', () => {
    const text = shareText({
      dateKey: '2026-12-24',
      moves: 123,
      timeMs: 161_000,
      streak: 3,
      url: 'https://hasokon.com/games/15-puzzle/',
    });
    expect(text).toContain('2026-12-24');
    expect(text).toContain('123手 2:41');
    expect(text).toContain('連続 3日');
    const board = dailyBoard('2026-12-24');
    expect(text).not.toContain(boardKey(board));
  });
});

describe('移動', () => {
  it('空きに隣り合う板は1枚動き、手数が1増える', () => {
    const r = slide(solvedBoard(4), 14)!;
    expect(r.moved).toBe(1);
    expect(r.board[15]).toBe(15);
    expect(r.board[14]).toBe(0);
  });

  it('同じ行の遠い板を押すと、あいだの板がまとめてすべり、手数が枚数ぶん増える', () => {
    const s = slide(solvedBoard(4), 12)!; // 空き(15)と同じ段の左端
    expect(s.moved).toBe(3);
    expect(s.board.slice(12)).toEqual([0, 13, 14, 15]);
  });

  it('同じ列の遠い板を押すと、あいだの板がまとめてすべる', () => {
    const s = slide(solvedBoard(5), 4)!; // 空き(24)と同じ列の最上段
    expect(s.moved).toBe(4);
    expect([4, 9, 14, 19, 24].map((i) => s.board[i])).toEqual([0, 5, 10, 15, 20]);
  });

  it('空きと違う行・列の板、空きそのものは動かせない（手数も履歴も増えない）', () => {
    const s0 = startPlay(slide(solvedBoard(4), 14)!.board);
    expect(slide(s0.board, 0)).toBeNull();
    expect(slide(s0.board, 14)).toBeNull();
    expect(play(s0, 0)).toBe(s0);
  });

  it('完成した盤では押しても動かない（クリア後に手数が増えない）', () => {
    const s = startPlay(solvedBoard(4));
    expect(play(s, 14)).toBe(s);
  });

  it('もどすで元の盤と手数に戻る。やり直しで配った盤の最初に戻る', () => {
    const s0 = startPlay(deal(4, mulberry32(1)));
    const blank = s0.board.indexOf(0);
    const row = Math.floor(blank / 4);
    const far = row * 4 + (blank % 4 === 0 ? 3 : 0);
    const s1 = play(s0, far);
    expect(s1.moves).toBeGreaterThan(0);
    const s2 = play(s1, tileForDirection(s1.board, 'up') ?? tileForDirection(s1.board, 'down')!);
    const back = undo(s2);
    expect(back.board).toEqual(s1.board);
    expect(back.moves).toBe(s1.moves);
    const first = undo(back);
    expect(first.board).toEqual(s0.board);
    expect(first.moves).toBe(0);
    expect(undo(first)).toBe(first);
    expect(restart(s2).board).toEqual(s0.board);
    expect(restart(s2).moves).toBe(0);
  });

  it('矢印キーは「空きに板を入れる向き」。← で空きの右の板が左へ。反転すると逆', () => {
    const b = slide(slide(solvedBoard(4), 14)!.board, 10)!.board; // 空きを (2,2) へ
    const blank = b.indexOf(0);
    expect(blank).toBe(10);
    expect(tileForDirection(b, 'left')).toBe(11);
    expect(tileForDirection(b, 'right')).toBe(9);
    expect(tileForDirection(b, 'up')).toBe(14);
    expect(tileForDirection(b, 'down')).toBe(6);
    expect(tileForDirection(b, 'left', true)).toBe(9);
    expect(tileForDirection(b, 'up', true)).toBe(6);
    // 盤の端では動かせる板が無い
    expect(tileForDirection(solvedBoard(4), 'left')).toBeNull();
    expect(tileForDirection(solvedBoard(4), 'up')).toBeNull();
  });

  it('スワイプは空きに向かう向きのときだけ', () => {
    const b = solvedBoard(4); // 空きは右下
    expect(slidesToward(b, 12, 'right')).toBe(true);
    expect(slidesToward(b, 12, 'left')).toBe(false);
    expect(slidesToward(b, 3, 'down')).toBe(true);
    expect(slidesToward(b, 0, 'right')).toBe(false);
  });
});

describe('3×3 の最短手数（幅優先探索）', () => {
  it('解ける配置は 181,440 通りで、最大の最短手数は 31、完成形は 0', () => {
    const table = distances3();
    let reached = 0;
    let max = 0;
    for (const d of table) {
      if (d === 255) continue;
      reached++;
      if (d > max) max = d;
    }
    expect(reached).toBe(181440);
    expect(max).toBe(31);
    expect(optimalMoves(solvedBoard(3))).toBe(0);
  });

  it('最短手数31の既知の配置（8 6 7 / 2 5 4 / 3 _ 1）', () => {
    expect(optimalMoves([8, 6, 7, 2, 5, 4, 3, 0, 1])).toBe(31);
  });

  it('ヒントを押し続けると、ちょうど最短手数で完成する', () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 30; i++) {
      let s = startPlay(deal(3, rng));
      const best = optimalMoves(s.board)!;
      while (!isSolved(s.board)) {
        const step = optimalHint(s.board);
        expect(step).not.toBeNull();
        s = play(s, step!);
      }
      expect(s.moves).toBe(best);
    }
  });

  it('完成形と解けない盤ではヒントを出さない', () => {
    expect(optimalHint(solvedBoard(3))).toBeNull();
    expect(hint(swappedLastTwo(3))).toBeNull();
    expect(hint(swappedLastTwo(4))).toBeNull();
  });
});

describe('4×4・5×5 のヒント（人の解き方）', () => {
  it('4×4 のヒントを繰り返したどると、ランダムな盤 20 個がすべて完成する（上限 2,000 手）', () => {
    const rng = mulberry32(2026);
    for (let i = 0; i < 20; i++) {
      let s = startPlay(deal(4, rng));
      while (!isSolved(s.board) && s.moves < 2000) {
        const step = hint(s.board);
        expect(step).not.toBeNull();
        const next = play(s, step!);
        // ヒントは必ず1枚だけ動かす（空きの隣の板）
        expect(next.moves).toBe(s.moves + 1);
        s = next;
      }
      expect(isSolved(s.board)).toBe(true);
    }
  });

  it('5×5 でもヒントをたどれば完成する', () => {
    const rng = mulberry32(55);
    for (let i = 0; i < 5; i++) {
      let s = startPlay(deal(5, rng));
      while (!isSolved(s.board) && s.moves < 4000) s = play(s, hint(s.board)!);
      expect(isSolved(s.board)).toBe(true);
    }
  });
});

describe('記録の区分', () => {
  it('大きさ別と今日の1面で区分が分かれる', () => {
    expect(variantOf(3, false)).toBe('3x3');
    expect(variantOf(4, false)).toBe('4x4');
    expect(variantOf(5, false)).toBe('5x5');
    expect(variantOf(4, true)).toBe('daily');
    expect(variantOf(3, true)).toBe('daily');
  });

  it('区分ごとに保存され、daily を2日続けてクリアすると streak が 2', () => {
    const storage = fakeStorage();
    recordResult('15-puzzle', { outcome: 'win', moves: 40, timeMs: 30_000 }, '3x3', storage);
    recordResult('15-puzzle', { outcome: 'win', moves: 120, timeMs: 90_000 }, '4x4', storage);
    recordResult('15-puzzle', { outcome: 'win', moves: 300, timeMs: 400_000 }, '5x5', storage);
    recordResult(
      '15-puzzle',
      { outcome: 'win', moves: 150, timeMs: 100_000, clearedOn: '2026-12-24' },
      'daily',
      storage,
    );
    recordResult(
      '15-puzzle',
      { outcome: 'win', moves: 140, timeMs: 80_000, clearedOn: '2026-12-25' },
      'daily',
      storage,
    );
    const records = loadRecords('15-puzzle', storage);
    expect(Object.keys(records).sort()).toEqual(['3x3', '4x4', '5x5', 'daily']);
    expect(entryOf(records, '3x3').bestMoves).toBe(40);
    expect(entryOf(records, '4x4').bestMoves).toBe(120);
    expect(entryOf(records, '5x5').wins).toBe(1);
    expect(entryOf(records, '4x4').streak).toBeUndefined();
    expect(entryOf(records, 'daily').streak).toBe(2);
    expect(entryOf(records, 'daily').lastClearedOn).toBe('2026-12-25');
    expect(entryOf(records, 'daily').bestMoves).toBe(140);
  });
});
