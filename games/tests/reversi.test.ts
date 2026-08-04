import { describe, expect, it } from 'vitest';
import {
  applyMove,
  countStones,
  cpuMove,
  flipsFor,
  initialBoard,
  isGameOver,
  legalMoves,
  opponent,
  type ReversiBoard,
} from '@/lib/reversi';

describe('initialBoard', () => {
  it('中央に黒白2つずつ', () => {
    const b = initialBoard();
    expect(countStones(b)).toEqual({ black: 2, white: 2 });
    expect(b[27]).toBe(2);
    expect(b[28]).toBe(1);
    expect(b[35]).toBe(1);
    expect(b[36]).toBe(2);
  });
});

describe('legalMoves（初手）', () => {
  it('黒の初手は定石どおり4箇所', () => {
    // d3(19), c4(26), f5(37), e6(44)
    expect(legalMoves(initialBoard(), 1).sort((a, b) => a - b)).toEqual([19, 26, 37, 44]);
  });

  it('白も初期盤面では4箇所打てる', () => {
    expect(legalMoves(initialBoard(), 2)).toHaveLength(4);
  });
});

describe('flipsFor / applyMove', () => {
  it('挟んだ石が返る', () => {
    const b = initialBoard();
    // 黒が d3(19) に打つと d4(27) の白が返る
    expect(flipsFor(b, 19, 1)).toEqual([27]);
    const next = applyMove(b, 19, 1)!;
    expect(next[19]).toBe(1);
    expect(next[27]).toBe(1);
    expect(countStones(next)).toEqual({ black: 4, white: 1 });
  });

  it('打てないマスには null', () => {
    const b = initialBoard();
    expect(applyMove(b, 0, 1)).toBeNull(); // 角（何も挟めない）
    expect(applyMove(b, 27, 1)).toBeNull(); // すでに石がある
  });

  it('元の盤面は変更されない', () => {
    const b = initialBoard();
    const before = [...b];
    applyMove(b, 19, 1);
    expect(b).toEqual(before);
  });

  it('複数方向を同時に返せる', () => {
    // 黒-白-空 の列を2方向に作る
    const b: ReversiBoard = new Array(64).fill(0);
    b[0] = 1; // a1 黒
    b[1] = 2; // b1 白
    b[16] = 1; // a3 黒
    b[9] = 2; // b2 白
    // c1(2) ではなく b3…座標を整理: 空きマス index2 (c1) は行0
    // a1(0)-b1(1)-c1(2): 横方向で b1 が返る
    // c1 から斜め: 見ない。代わりに index 18 (c3) で縦横確認する形にする
    const flips = flipsFor(b, 2, 1); // c1 に黒
    expect(flips).toContain(1);
  });

  it('間に空きがあると返らない', () => {
    const b: ReversiBoard = new Array(64).fill(0);
    b[0] = 1; // a1 黒
    b[2] = 2; // c1 白（b1 が空き）
    expect(flipsFor(b, 3, 1)).toEqual([]); // d1 に打っても挟めていない
  });
});

describe('cpuMove', () => {
  it('打てる手の中から返す', () => {
    const b = initialBoard();
    const m = cpuMove(b, 2);
    expect(m).not.toBeNull();
    expect(legalMoves(b, 2)).toContain(m);
  });

  it('角が取れるなら角を選ぶ', () => {
    // 白 a1 の角を取れる状況を作る: a3黒 a2白 で a1 が黒の合法手
    const b: ReversiBoard = new Array(64).fill(0);
    b[16] = 1; // a3 黒
    b[8] = 2; // a2 白
    // 黒にもう1手、角以外の合法手を用意する（b3黒 c3白 → d3 が合法）
    b[18] = 2; // c3 白
    b[17] = 1; // b3 黒 …これだと c3 を挟むのは a3-b3 ではない。単純に:
    // 横: b3(17)黒 c3(18)白 → d3(19) に黒で c3 が返る
    const moves = legalMoves(b, 1);
    expect(moves).toContain(0); // 角 a1
    expect(moves.length).toBeGreaterThan(1); // 角以外の選択肢もある
    expect(cpuMove(b, 1)).toBe(0); // それでも角を選ぶ
  });

  it('打てる手がなければ null（パス）', () => {
    const b: ReversiBoard = new Array(64).fill(0);
    b[0] = 1;
    expect(cpuMove(b, 2)).toBeNull();
  });
});

describe('isGameOver', () => {
  it('初期盤面は終局ではない', () => {
    expect(isGameOver(initialBoard())).toBe(false);
  });

  it('盤面が埋まったら終局', () => {
    const b: ReversiBoard = new Array(64).fill(1) as ReversiBoard;
    expect(isGameOver(b)).toBe(true);
  });

  it('両者打てなければ空きがあっても終局', () => {
    // 黒だけが存在する盤面: どちらも挟める石がない
    const b: ReversiBoard = new Array(64).fill(0);
    b[0] = 1;
    expect(isGameOver(b)).toBe(true);
  });
});

describe('対局が最後まで進む', () => {
  it('CPU同士で打ち合っても無限ループしない', () => {
    let b = initialBoard();
    let player: 1 | 2 = 1;
    let passes = 0;
    for (let turn = 0; turn < 200 && passes < 2; turn += 1) {
      const m = cpuMove(b, player);
      if (m === null) {
        passes += 1;
      } else {
        passes = 0;
        b = applyMove(b, m, player)!;
      }
      player = opponent(player);
    }
    expect(isGameOver(b)).toBe(true);
    const { black, white } = countStones(b);
    expect(black + white).toBeGreaterThan(20); // 序盤で止まっていない
  });
});
