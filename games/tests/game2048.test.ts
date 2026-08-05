import { describe, expect, it } from 'vitest';
import {
  canMove,
  hasWon,
  newBoard,
  slide,
  slideLine,
  spawn,
  type Board2048,
} from '@/lib/game2048';

describe('slideLine', () => {
  it('左に詰める', () => {
    expect(slideLine([0, 2, 0, 4]).line).toEqual([2, 4, 0, 0]);
  });

  it('同じ数字は合体してスコアになる', () => {
    const r = slideLine([2, 2, 0, 0]);
    expect(r.line).toEqual([4, 0, 0, 0]);
    expect(r.gained).toBe(4);
  });

  it('1回のスライドで二重合体しない', () => {
    // [2,2,4] → [4,4]（[8]にはならない）。本家仕様
    expect(slideLine([2, 2, 4, 0]).line).toEqual([4, 4, 0, 0]);
    // [4,4,4,4] → [8,8]
    const r = slideLine([4, 4, 4, 4]);
    expect(r.line).toEqual([8, 8, 0, 0]);
    expect(r.gained).toBe(16);
  });

  it('離れた同じ数字も詰めてから合体する', () => {
    expect(slideLine([2, 0, 0, 2]).line).toEqual([4, 0, 0, 0]);
  });

  it('違う数字は合体しない', () => {
    expect(slideLine([2, 4, 2, 4]).line).toEqual([2, 4, 2, 4]);
  });
});

describe('slide', () => {
  // 見やすいように4x4で書く
  const board: Board2048 = [
    2, 0, 0, 2,
    0, 4, 4, 0,
    8, 0, 0, 0,
    0, 0, 0, 8,
  ];

  it('left: 各行が左に詰まる', () => {
    const r = slide(board, 'left');
    expect(r.board).toEqual([
      4, 0, 0, 0,
      8, 0, 0, 0,
      8, 0, 0, 0,
      8, 0, 0, 0,
    ]);
    expect(r.gained).toBe(12); // 2+2=4 と 4+4=8
    expect(r.moved).toBe(true);
  });

  it('right: 各行が右に詰まる', () => {
    const r = slide(board, 'right');
    expect(r.board).toEqual([
      0, 0, 0, 4,
      0, 0, 0, 8,
      0, 0, 0, 8,
      0, 0, 0, 8,
    ]);
  });

  it('up: 各列が上に詰まる（8と8は合体して16）', () => {
    const r = slide(board, 'up');
    expect(r.board).toEqual([
      2, 4, 4, 2,
      8, 0, 0, 8,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]);
    expect(r.gained).toBe(0); // 縦方向に同じ数字は並んでいない
  });

  it('down: 8と8が同じ列なら合体する', () => {
    const b: Board2048 = [
      8, 0, 0, 0,
      8, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ];
    const r = slide(b, 'down');
    expect(r.board[12]).toBe(16);
    expect(r.gained).toBe(16);
  });

  it('動きがなければ moved=false', () => {
    const b: Board2048 = [
      2, 4, 8, 16,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ];
    expect(slide(b, 'up').moved).toBe(false); // すでに上に詰まっている
    expect(slide(b, 'left').moved).toBe(false); // 行内も左詰め済みで合体もない
    expect(slide(b, 'down').moved).toBe(true);
  });
});

describe('spawn', () => {
  it('空きマスに1枚だけ湧く', () => {
    const b = new Array(16).fill(0);
    const next = spawn(b, () => 0.5);
    expect(next.filter((v) => v !== 0)).toHaveLength(1);
  });

  it('90%で2、10%で4', () => {
    const b = new Array(16).fill(0);
    expect(spawn(b, () => 0.5).find((v) => v !== 0)).toBe(2);
    expect(spawn(b, () => 0.95).find((v) => v !== 0)).toBe(4);
  });

  it('満杯なら何もしない', () => {
    const full = new Array(16).fill(2);
    expect(spawn(full, () => 0.5)).toEqual(full);
  });

  it('元の盤面は変更しない', () => {
    const b = new Array(16).fill(0);
    spawn(b, () => 0.5);
    expect(b.every((v) => v === 0)).toBe(true);
  });
});

describe('canMove / hasWon', () => {
  it('空きがあれば動ける', () => {
    const b = new Array(16).fill(2);
    b[0] = 0;
    expect(canMove(b)).toBe(true);
  });

  it('満杯でも隣に同じ数字があれば動ける', () => {
    const b: Board2048 = [
      2, 4, 2, 4,
      4, 2, 4, 2,
      2, 4, 2, 4,
      4, 2, 2, 4, // ここに 2,2 が隣接
    ];
    expect(canMove(b)).toBe(true);
  });

  it('市松模様で満杯なら動けない', () => {
    const b: Board2048 = [
      2, 4, 2, 4,
      4, 2, 4, 2,
      2, 4, 2, 4,
      4, 2, 4, 2,
    ];
    expect(canMove(b)).toBe(false);
  });

  it('2048ができたら勝利', () => {
    const b = new Array(16).fill(0);
    expect(hasWon(b)).toBe(false);
    b[3] = 2048;
    expect(hasWon(b)).toBe(true);
  });
});

describe('newBoard', () => {
  it('タイル2枚でスタート', () => {
    const b = newBoard(() => 0.3);
    expect(b.filter((v) => v !== 0)).toHaveLength(2);
  });
});
