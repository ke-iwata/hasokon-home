import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  beginAction,
  canPlay,
  cellsOf,
  CELLS,
  COLS,
  cpuMove,
  dropRow,
  EASY_BLOCK_RATE,
  FROM_KEY,
  fromMoves,
  initialBoard,
  isWinningMove,
  legalColumns,
  LEVEL_DEPTH,
  markFromReversi,
  NODE_LIMIT,
  outcomeOf,
  play,
  ROWS,
  search,
  sideToMove,
  threatColumns,
  undoCount,
  winLine,
  winnerOf,
  WINDOWS,
} from '@/lib/yonmoku-narabe';
import { games } from '@/lib/registry';

/** 42 マスが埋まって引き分けになる手順（乱数の対局から拾ったもの。途中で誰も 4 つ並ばない） */
const DRAW_MOVES = [
  2, 3, 1, 2, 2, 0, 4, 0, 0, 0, 6, 0, 3, 1, 6, 3, 6, 6, 5, 0, 2, 6, 1, 2, 3, 3, 2, 5, 5, 4, 6, 4, 4, 5, 4, 1, 4, 5, 1, 5,
  1, 3,
];

describe('盤と合法手', () => {
  it('初期盤は 7 列すべてに落とせ、先手の番', () => {
    const b = initialBoard();
    expect(legalColumns(b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(sideToMove(b)).toBe(1);
    expect(outcomeOf(b)).toBe('playing');
  });

  it('コマは列のいちばん下の空きに落ちる', () => {
    let b = initialBoard();
    expect(dropRow(b, 3)).toBe(ROWS - 1);
    b = play(b, 3);
    expect(dropRow(b, 3)).toBe(ROWS - 2);
    b = play(b, 3);
    const cells = cellsOf(b);
    expect(cells[(ROWS - 1) * COLS + 3]).toBe(1);
    expect(cells[(ROWS - 2) * COLS + 3]).toBe(2);
    expect(cells.filter((v) => v !== 0)).toHaveLength(2);
  });

  it('満杯の列には落とせない', () => {
    const b = fromMoves([0, 0, 0, 0, 0, 0]);
    expect(canPlay(b, 0)).toBe(false);
    expect(dropRow(b, 0)).toBe(-1);
    expect(legalColumns(b)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(() => play(b, 0)).toThrow();
    expect(() => play(b, 7)).toThrow();
    expect(() => play(b, -1)).toThrow();
  });

  it('窓は 69 本（横 24・縦 21・斜め 24）', () => {
    expect(WINDOWS).toHaveLength(69);
  });
});

describe('勝敗判定', () => {
  it('縦に 4 つ', () => {
    const b = fromMoves([0, 1, 0, 1, 0, 1, 0]);
    expect(outcomeOf(b)).toBe('win');
    expect(winnerOf(b)).toBe(1);
    const w = winLine(cellsOf(b));
    expect(w?.side).toBe(1);
    expect(w?.line.map((i) => i % COLS)).toEqual([0, 0, 0, 0]);
  });

  it('横に 4 つ', () => {
    const b = fromMoves([0, 0, 1, 1, 2, 2, 3]);
    expect(winnerOf(b)).toBe(1);
    expect(winLine(cellsOf(b))?.line).toEqual([35, 36, 37, 38]);
  });

  it('右上がりの斜めに 4 つ', () => {
    // 先手：0,1,2,3 を下から 1,2,3,4 段目に
    const b = fromMoves([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
    expect(winnerOf(b)).toBe(1);
    expect(winLine(cellsOf(b))?.side).toBe(1);
  });

  it('右下がりの斜めに 4 つ（後手の勝ち）', () => {
    // 後手：6,5,4,3 を下から 1,2,3,4 段目に
    const b = fromMoves([0, 6, 5, 5, 4, 4, 0, 4, 3, 3, 3, 3]);
    expect(outcomeOf(b)).toBe('win');
    expect(winnerOf(b)).toBe(2);
    expect(winLine(cellsOf(b))?.side).toBe(2);
  });

  it('3 つでは勝ちにならない。端を回り込んだ並びも数えない', () => {
    expect(outcomeOf(fromMoves([0, 1, 0, 1, 0]))).toBe('playing');
    // 列 4,5,6 の最下段と、列 0 の 2 段目（ビットでは隣だが盤では離れている）
    const b = fromMoves([4, 0, 5, 1, 6, 1, 0]);
    expect(outcomeOf(b)).toBe('playing');
    expect(winLine(cellsOf(b))).toBeNull();
  });

  it('42 マスが埋まって誰も並ばなければ引き分け', () => {
    expect(DRAW_MOVES.length).toBe(CELLS);
    let b = initialBoard();
    DRAW_MOVES.forEach((c, i) => {
      b = play(b, c);
      expect(outcomeOf(b)).toBe(i === CELLS - 1 ? 'draw' : 'playing');
    });
    expect(b.moves).toBe(CELLS);
    expect(legalColumns(b)).toEqual([]);
    expect(winLine(cellsOf(b))).toBeNull();
  });

  it('ビットボードの判定とマス目の判定が、ランダムな局で一致する', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let g = 0; g < 200; g += 1) {
      let b = initialBoard();
      while (outcomeOf(b) === 'playing') {
        const legal = legalColumns(b);
        b = play(b, legal[Math.floor(rand() * legal.length)]);
        const byCells = winLine(cellsOf(b));
        expect(byCells !== null).toBe(outcomeOf(b) === 'win');
      }
    }
  });
});

describe('1 手もどす', () => {
  it('対面モードは 1 手ぶん', () => {
    expect(undoCount(0, null)).toBe(0);
    expect(undoCount(5, null)).toBe(1);
  });

  it('CPU 対戦は自分の直前の手まで（CPU の手も一緒に 2 手）', () => {
    // 自分が先手：先・後・先・後 の 4 手のあと → 2 手
    expect(undoCount(4, 1)).toBe(2);
    // 自分の手で決着した直後（3 手目が自分）→ 1 手
    expect(undoCount(3, 1)).toBe(1);
    // 自分が後手で、CPU が 1 手だけ指した → 戻せない
    expect(undoCount(1, 2)).toBe(0);
    expect(undoCount(3, 2)).toBe(2);
  });
});

describe('CPU', () => {
  /** 先手が下段に 0,1,2 と並べ、後手の番（後手は 3 か…で防ぐ） */
  const threatBoard = () => fromMoves([0, 6, 1, 6, 2]);
  /** 後手の番で、後手に即勝ちがある（列 6 に 3 つ） */
  const winBoard = () => fromMoves([0, 6, 1, 6, 0, 6, 1]);

  it('即防ぎの列を見つける', () => {
    expect(threatColumns(threatBoard())).toEqual([3]);
    expect(isWinningMove(winBoard(), 6)).toBe(true);
  });

  it('どの強さも即勝ちがあれば必ず打つ', () => {
    for (const lv of ['easy', 'normal', 'hard'] as const) {
      expect(cpuMove(winBoard(), lv, () => 0.99)).toBe(6);
    }
  });

  it('即勝ちは即防ぎより優先する', () => {
    // 後手の番：先手は下段 0,1,2（列 3 で勝ち）、後手は列 6 に 3 つ（列 6 で勝ち）
    const b = fromMoves([0, 6, 1, 6, 2, 6]);
    // ここは先手の番なので、先手は列 3 で勝つ
    expect(cpuMove(b, 'normal')).toBe(3);
  });

  it('ふつう・つよいは即防ぎを必ず打つ', () => {
    expect(cpuMove(threatBoard(), 'normal')).toBe(3);
    expect(cpuMove(threatBoard(), 'hard')).toBe(3);
  });

  it('かんたんは 6 割の確率で防ぐ（乱数が下なら防ぎ、上なら防がないことがある）', () => {
    expect(EASY_BLOCK_RATE).toBe(0.6);
    expect(cpuMove(threatBoard(), 'easy', () => 0.1)).toBe(3);
    // 防がないときは中央寄りのランダム（乱数 0.99 → 右端の列）
    expect(cpuMove(threatBoard(), 'easy', () => 0.99)).toBe(6);
  });

  it('読みの深さはかんたん 1・ふつう 4・つよい 8', () => {
    expect(LEVEL_DEPTH).toEqual({ easy: 1, normal: 4, hard: 8 });
    const b = fromMoves([3, 3]);
    expect(search(b, LEVEL_DEPTH.normal).depth).toBe(4);
    expect(search(b, LEVEL_DEPTH.hard, { tt: true, iterative: true }).depth).toBeGreaterThanOrEqual(1);
  });

  it('ノード数の上限は 20 万で、超えたら打ち切って読み切れた深さの手を返す', () => {
    expect(NODE_LIMIT).toBe(200_000);
    const b = initialBoard();
    const full = search(b, LEVEL_DEPTH.hard, { tt: true, iterative: true });
    expect(full.nodes).toBeLessThanOrEqual(NODE_LIMIT);
    expect(canPlay(b, full.move)).toBe(true);

    const cut = search(b, LEVEL_DEPTH.hard, { tt: true, iterative: true, maxNodes: 300 });
    expect(cut.aborted).toBe(true);
    expect(cut.nodes).toBe(300);
    expect(cut.depth).toBeLessThan(LEVEL_DEPTH.hard);
    expect(cut.depth).toBeGreaterThanOrEqual(1);
    expect(canPlay(b, cut.move)).toBe(true);
  });

  it('つよいは 2 手先の両取り（下段の両側が空いた 3 つ並び）を作らせない', () => {
    // 先手が下段 2,3 に並べ、後手の番。後手が離れた所に置くと、先手は 1 か 4 で両側の空いた 3 つ並びを作れる
    const b = fromMoves([3, 6, 2]);
    const m = cpuMove(b, 'hard');
    expect([1, 4]).toContain(m);
  });

  it('ふつう・つよいは、相手の勝ちの真下（2 段目の脅威の下）に置かない', () => {
    // 先手が 2 段目の列 0・1・2 に並べ、列 3 は空。後手が列 3 に置くと、先手がその上に落として勝つ
    const b = fromMoves([1, 0, 0, 2, 2, 6, 1]);
    expect(sideToMove(b)).toBe(2);
    expect(threatColumns(b)).toEqual([]);
    expect(cpuMove(b, 'normal')).not.toBe(3);
    expect(cpuMove(b, 'hard')).not.toBe(3);
  });
});

describe('計測（リバーシ経由の印）', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  };

  it('印があれば最初の 1 局だけ -from-reversi を付けて消す', () => {
    const s = memory();
    markFromReversi(s);
    expect(s.getItem(FROM_KEY)).toBe('reversi');
    expect(beginAction('hard', s)).toBe('begin-hard-from-reversi');
    expect(s.getItem(FROM_KEY)).toBeNull();
    expect(beginAction('hard', s)).toBe('begin-hard');
    expect(beginAction('pvp', s)).toBe('begin-pvp');
  });

  it('ストレージが使えなくても落ちない', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    expect(() => markFromReversi(broken)).not.toThrow();
    expect(beginAction('easy', broken)).toBe('begin-easy');
    expect(beginAction('normal', null)).toBe('begin-normal');
  });
});

describe('名称（仕様書の着手条件 2）', () => {
  // 米国の商品名を、表示名・title・description・keywords・slug・本文のどこにも書かない
  const banned = [/コネクト\s*フォー/, /connect\s*(four|4)/i];
  const files = ['app/yonmoku-narabe/page.tsx', 'app/yonmoku-narabe/Game.tsx', 'lib/yonmoku-narabe.ts'];

  it('ページ・画面・ロジックに商品名が無い', () => {
    for (const f of files) {
      const src = readFileSync(join(__dirname, '..', f), 'utf8');
      for (const re of banned) expect(src, `${f} に ${re}`).not.toMatch(re);
    }
  });

  it('registry の項目に商品名が無く、まだ wip', () => {
    const g = games.find((x) => x.slug === 'yonmoku-narabe');
    expect(g).toBeDefined();
    expect(g?.stage).toBe('wip');
    const text = JSON.stringify(g);
    for (const re of banned) expect(text).not.toMatch(re);
  });
});
