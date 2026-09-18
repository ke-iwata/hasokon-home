import { describe, expect, it } from 'vitest';
import {
  applyMove,
  BOARD_H,
  BOARD_W,
  boardErrors,
  boardKey,
  DEFAULT_LEVEL_ID,
  daughterOf,
  directionFromDelta,
  EXIT_X,
  EXIT_Y,
  isCleared,
  legalMoves,
  LEVELS,
  levelBoard,
  levelById,
  levelsOf,
  maxSlide,
  minMovesOf,
  moveToward,
  parseLayout,
  PIECE_COUNT,
  pieceAt,
  play,
  restart,
  slide,
  solve,
  startLevel,
  toLayout,
  undo,
  type Board,
  type Level,
  type PlayState,
} from '@/lib/hakoiri-musume';
import { applyResult } from '@/lib/records';

/**
 * 箱入り娘のテスト。
 *
 * 仕様: docs/features/game-hakoiri-musume.md
 *
 * **最短手数は「ソルバーの結果と盤面データが一致すること」だけを見る。**
 * 文献の81手のような確定値をここに書き写さない（あれは「角を曲がる移動も1手」という
 * 別の数え方の値で、この実装の数え方とは一致しない）。
 */

/** 標準配置（伝統的な並び） */
const standard = levelById('standard');

/** 娘が出口にいる（クリアした）配置 */
const CLEARED_LAYOUT = ['TWWT', 'TSST', 'SS..', 'TDDT', 'TDDT'];

/** 娘の真下が空いていて、あと1手でクリアできる配置 */
const ONE_MOVE_LAYOUT = ['TWWT', 'TSST', 'SDDS', 'TDDT', 'T..T'];

/** 空きが縦に2マス並んでいて、小駒が「左 → 上」と回り込める配置 */
const CORNER_LAYOUT = ['DDST', 'DD.T', 'TT.S', 'TTTS', 'WWTS'];

/**
 * どう動かしても娘が出口に着かない配置。
 * 手はまだ残っているので、「動けない」と「解けない」は別のことだと分かる
 */
const UNSOLVABLE_LAYOUT = ['DDTT', 'DDTT', 'WWTS', 'SSTT', 'S..T'];

describe('盤面データ（parseLayout）', () => {
  it('文字の絵から駒を組み立てられる', () => {
    const board = parseLayout(['TDDT', 'TDDT', 'TWWT', 'TSST', 'S..S']);
    expect(board).toHaveLength(10);
    const counts = board.reduce<Record<string, number>>((acc, piece) => {
      acc[piece.kind] = (acc[piece.kind] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual(PIECE_COUNT);
    const daughter = daughterOf(board);
    expect(daughter).toMatchObject({ kind: 'daughter', x: 1, y: 0 });
  });

  it('盤面 → 文字の絵 → 盤面 で元に戻る', () => {
    for (const level of LEVELS) {
      expect(toLayout(levelBoard(level))).toEqual([...level.layout]);
    }
  });

  it('駒の大きさに満たない書き方は投げる（データの書き損じに気づけるように）', () => {
    // 娘（2×2）が1マスしかない
    expect(() => parseLayout(['D...', 'TDDT', 'TWWT', 'TSST', 'S..S'])).toThrow();
    // 行数が足りない
    expect(() => parseLayout(['TDDT', 'TDDT'])).toThrow();
    // 知らない文字
    expect(() => parseLayout(['XDDT', 'TDDT', 'TWWT', 'TSST', 'S..S'])).toThrow();
  });

  it('id はレベルごとに一意で、同じレベルなら毎回同じになる', () => {
    const ids = levelBoard(standard).map((piece) => piece.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(levelBoard(standard).map((p) => p.id)).toEqual(ids);
  });
});

describe('駒の動き', () => {
  const board = levelBoard(standard);

  it('空いているマスへしか動かない（ふさがっていれば盤面はそのまま）', () => {
    // 標準配置の娘は上下左右すべてふさがっている
    const daughter = daughterOf(board) as NonNullable<ReturnType<typeof daughterOf>>;
    for (const dir of ['up', 'down', 'left', 'right'] as const) {
      expect(maxSlide(board, daughter.id, dir)).toBe(0);
      expect(slide(board, daughter.id, dir, 1)).toBe(board);
    }
  });

  it('盤の外へは出ない', () => {
    // 左下の小駒。左と下は盤の縁
    const corner = pieceAt(board, 0, BOARD_H - 1) as NonNullable<ReturnType<typeof pieceAt>>;
    expect(maxSlide(board, corner.id, 'left')).toBe(0);
    expect(maxSlide(board, corner.id, 'down')).toBe(0);
    expect(slide(board, corner.id, 'left', 1)).toBe(board);
  });

  it('動かした結果、駒が重ならない（どのレベルのどの手でも）', () => {
    for (const level of LEVELS) {
      const start = levelBoard(level);
      for (const move of legalMoves(start)) {
        expect(boardErrors(applyMove(start, move)), `${level.id}: ${move.id} ${move.dir}`).toEqual(
          [],
        );
      }
    }
  });

  it('空きが続くかぎり複数マス動き、その先へは動かせない', () => {
    // 右下の小駒は左へ2マス（空き2マス）動ける
    const corner = pieceAt(board, BOARD_W - 1, BOARD_H - 1) as NonNullable<
      ReturnType<typeof pieceAt>
    >;
    expect(maxSlide(board, corner.id, 'left')).toBe(2);
    expect(slide(board, corner.id, 'left', 3)).toBe(board);
    const moved = slide(board, corner.id, 'left', 2);
    expect(pieceAt(moved, 1, BOARD_H - 1)?.id).toBe(corner.id);
    expect(pieceAt(moved, BOARD_W - 1, BOARD_H - 1)).toBeNull();
  });

  it('0マス・負の数・小数は動かない', () => {
    const corner = pieceAt(board, BOARD_W - 1, BOARD_H - 1) as NonNullable<
      ReturnType<typeof pieceAt>
    >;
    for (const steps of [0, -1, 1.5]) {
      expect(slide(board, corner.id, 'left', steps)).toBe(board);
    }
  });
});

describe('クリア判定', () => {
  /** 娘が出口（下辺の中央）にいる盤面 */
  const clearedBoard = parseLayout(CLEARED_LAYOUT);
  /** そこから娘が1マスだけ上にいる盤面 */
  const almostBoard = parseLayout(ONE_MOVE_LAYOUT);

  it('娘が出口に着いたときだけクリア', () => {
    expect(isCleared(levelBoard(standard))).toBe(false);
    expect(isCleared(almostBoard)).toBe(false);
    expect(isCleared(clearedBoard)).toBe(true);
  });

  it('出口は下辺の中央（娘の左上が EXIT）', () => {
    const daughter = daughterOf(clearedBoard) as NonNullable<ReturnType<typeof daughterOf>>;
    expect({ x: daughter.x, y: daughter.y }).toEqual({ x: EXIT_X, y: EXIT_Y });
    // 出口の1つ上ではまだクリアではない
    const above = daughterOf(almostBoard) as NonNullable<ReturnType<typeof daughterOf>>;
    expect({ x: above.x, y: above.y }).toEqual({ x: EXIT_X, y: EXIT_Y - 1 });
  });

  it('全レベルの初期配置はまだクリアしていない', () => {
    for (const level of LEVELS) {
      expect(isCleared(levelBoard(level)), level.id).toBe(false);
    }
  });
});

describe('手数の数え方', () => {
  const board = levelBoard(standard);

  /**
   * **1マス動かすのも複数マス動かすのも同じ1手。**
   * ここが崩れると、盤面データの最短手数もページの解説もいっせいに嘘になる。
   */
  it('1方向に到達できる位置ごとに1手として並ぶ', () => {
    const corner = pieceAt(board, BOARD_W - 1, BOARD_H - 1) as NonNullable<
      ReturnType<typeof pieceAt>
    >;
    const left = legalMoves(board).filter((m) => m.id === corner.id && m.dir === 'left');
    expect(left.map((m) => m.steps)).toEqual([1, 2]);
  });

  it('2マス動かしても手数は1しか増えない', () => {
    const corner = pieceAt(board, BOARD_W - 1, BOARD_H - 1) as NonNullable<
      ReturnType<typeof pieceAt>
    >;
    const one = play(startLevel(standard), corner.id, 'left', 1);
    const two = play(startLevel(standard), corner.id, 'left', 2);
    expect(one.moves).toBe(1);
    expect(two.moves).toBe(1);
    // 同じ1手でも行き先は違う（まとめて動いている）
    expect(boardKey(one.board)).not.toBe(boardKey(two.board));
  });

  /**
   * スワイプは一方向なので、**角を曲がる移動は1手にならない**。
   * 文献の「81手」はここを1手と数える別の定義の値（仕様書の「手数の数え方」）。
   */
  it('角を曲がる移動は2手になる（左へ1マス → 上へ1マス）', () => {
    const corner = parseLayout(CORNER_LAYOUT);
    const small = pieceAt(corner, 3, 2) as NonNullable<ReturnType<typeof pieceAt>>;
    // 1手では (2, 1) へ行けない（斜めの手は存在しない）
    expect(
      legalMoves(corner).some((move) => {
        const moved = applyMove(corner, move);
        return pieceAt(moved, 2, 1)?.id === small.id;
      }),
    ).toBe(false);

    let state: PlayState = {
      ...startLevel(standard),
      initial: corner,
      board: corner,
      history: [],
      moves: 0,
    };
    state = play(state, small.id, 'left', 1);
    state = play(state, small.id, 'up', 1);
    expect(pieceAt(state.board, 2, 1)?.id).toBe(small.id);
    expect(state.moves).toBe(2);
  });

  it('動かせない操作では手数も履歴も増えない', () => {
    const state = startLevel(standard);
    const daughter = daughterOf(state.board) as NonNullable<ReturnType<typeof daughterOf>>;
    expect(play(state, daughter.id, 'down', 1)).toBe(state);
    expect(play(state, 'いない駒', 'down', 1)).toBe(state);
  });
});

describe('ソルバー', () => {
  it('娘の真下が空いていれば1手でクリアできる', () => {
    const board = parseLayout(ONE_MOVE_LAYOUT);
    const solution = solve(board);
    expect(solution?.minMoves).toBe(1);
    expect(solution?.moves).toEqual([{ id: daughterOf(board)?.id, dir: 'down', steps: 1 }]);
  });

  /**
   * 娘を出口へ運べない配置は、盤面データに入れてはいけない。
   * （65,880通りの置き方のうち11,926通りは、どう動かしても娘が出口に着かない）
   */
  it('解けない盤面は null', () => {
    const board = parseLayout(UNSOLVABLE_LAYOUT);
    expect(boardErrors(board)).toEqual([]);
    expect(legalMoves(board).length).toBeGreaterThan(0);
    expect(minMovesOf(board)).toBeNull();
  });

  it('返した手順をそのまま指すとクリアでき、手数は最短手数と一致する', () => {
    const level = levelById('easy-1');
    const solution = solve(levelBoard(level));
    expect(solution).not.toBeNull();
    let board: Board = levelBoard(level);
    for (const move of (solution as NonNullable<typeof solution>).moves) {
      const next = applyMove(board, move);
      expect(next, '手順に合法でない手が混ざっている').not.toBe(board);
      board = next;
    }
    expect(isCleared(board)).toBe(true);
    expect((solution as NonNullable<typeof solution>).moves).toHaveLength(
      (solution as NonNullable<typeof solution>).minMoves,
    );
  });

  it('すでにクリアしている盤面は0手', () => {
    expect(solve(parseLayout(CLEARED_LAYOUT))?.minMoves).toBe(0);
  });
});

describe('出題（LEVELS）', () => {
  it('はじめて3面・標準1面・むずかしい6面の10面ある', () => {
    expect(LEVELS).toHaveLength(10);
    expect(levelsOf('easy')).toHaveLength(3);
    expect(levelsOf('standard')).toHaveLength(1);
    expect(levelsOf('hard')).toHaveLength(6);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
  });

  it('既定のレベルは registry にある', () => {
    expect(levelById(DEFAULT_LEVEL_ID).group).toBe('easy');
  });

  it('知らないレベルは投げる', () => {
    expect(() => levelById('hard-7')).toThrow(/レベル/);
  });

  it('駒の種類と数はどの面も同じで、重なりもはみ出しも無い', () => {
    for (const level of LEVELS) {
      expect(boardErrors(levelBoard(level)), level.id).toEqual([]);
    }
  });

  /**
   * **盤面データの最短手数は、ソルバーが出した値と一致すること。**
   * 手で数えた値や文献の値を書き写すと、ここで落ちる。
   */
  it.each(LEVELS.map((level) => [level.id, level] as [string, Level]))(
    '%s は解けて、minMoves がソルバーの値と一致する',
    (_id, level) => {
      const solution = solve(levelBoard(level));
      expect(solution, `${level.id}: 解けない盤面はデータに入れない`).not.toBeNull();
      expect((solution as NonNullable<typeof solution>).minMoves).toBe(level.minMoves);
    },
    30_000,
  );

  it('「はじめて」は20手以内、「むずかしい」は標準配置より手数が多い', () => {
    for (const level of levelsOf('easy')) {
      expect(level.minMoves, level.id).toBeLessThanOrEqual(20);
    }
    for (const level of levelsOf('hard')) {
      expect(level.minMoves, level.id).toBeGreaterThan(standard.minMoves);
    }
  });
});

describe('もどす・最初から', () => {
  it('もどすと直前の盤面に戻る', () => {
    const state = startLevel(standard);
    const corner = pieceAt(state.board, BOARD_W - 1, BOARD_H - 1) as NonNullable<
      ReturnType<typeof pieceAt>
    >;
    const moved = play(state, corner.id, 'left', 2);
    const back = undo(moved);
    expect(boardKey(back.board)).toBe(boardKey(state.board));
    expect(back.moves).toBe(0);
    expect(back.history).toHaveLength(0);
  });

  it('履歴は無制限（何手でもさかのぼれる）', () => {
    let state = startLevel(standard);
    const corner = pieceAt(state.board, BOARD_W - 1, BOARD_H - 1) as NonNullable<
      ReturnType<typeof pieceAt>
    >;
    // 小駒を左右に往復させて40手積む
    for (let i = 0; i < 20; i += 1) {
      state = play(state, corner.id, 'left', 2);
      state = play(state, corner.id, 'right', 2);
    }
    expect(state.moves).toBe(40);
    for (let i = 0; i < 40; i += 1) state = undo(state);
    expect(state.moves).toBe(0);
    expect(boardKey(state.board)).toBe(boardKey(levelBoard(standard)));
    // これ以上もどせない
    expect(undo(state)).toBe(state);
  });

  it('最初からで初期配置に戻る', () => {
    let state = startLevel(standard);
    const corner = pieceAt(state.board, BOARD_W - 1, BOARD_H - 1) as NonNullable<
      ReturnType<typeof pieceAt>
    >;
    state = play(state, corner.id, 'left', 1);
    state = play(state, corner.id, 'up', 1);
    const fresh = restart(state);
    expect(boardKey(fresh.board)).toBe(boardKey(levelBoard(standard)));
    expect(fresh.moves).toBe(0);
    expect(fresh.history).toHaveLength(0);
  });
});

describe('入力の解釈', () => {
  it('指の動きは、離した位置ではなく動かした方向で決まる', () => {
    expect(directionFromDelta(40, 10)).toBe('right');
    expect(directionFromDelta(-40, 10)).toBe('left');
    expect(directionFromDelta(10, 40)).toBe('down');
    expect(directionFromDelta(-10, -40)).toBe('up');
  });

  it('ごく小さな動きは「はらった」とみなさない（タップとして扱う）', () => {
    expect(directionFromDelta(3, 4)).toBeNull();
    expect(directionFromDelta(0, 0)).toBeNull();
  });

  it('駒を選んで空きマスをタップすると、その向きの手になる', () => {
    const board = levelBoard(standard);
    const corner = pieceAt(board, BOARD_W - 1, BOARD_H - 1) as NonNullable<
      ReturnType<typeof pieceAt>
    >;
    expect(moveToward(board, corner.id, 2, BOARD_H - 1)).toEqual({
      id: corner.id,
      dir: 'left',
      steps: 1,
    });
    expect(moveToward(board, corner.id, 1, BOARD_H - 1)).toEqual({
      id: corner.id,
      dir: 'left',
      steps: 2,
    });
  });

  it('届かないマスをタップしたら、行けるところまで（1マスも行けなければ何もしない）', () => {
    const board = levelBoard(standard);
    const corner = pieceAt(board, BOARD_W - 1, BOARD_H - 1) as NonNullable<
      ReturnType<typeof pieceAt>
    >;
    // 左端まではふさがっているので、行けるだけ（2マス）の手になる
    expect(moveToward(board, corner.id, 0, BOARD_H - 1)?.steps).toBe(2);
    // 斜めのマスは筋が違う
    expect(moveToward(board, corner.id, 1, 0)).toBeNull();
    // 動かせない駒は null
    const daughter = daughterOf(board) as NonNullable<ReturnType<typeof daughterOf>>;
    expect(moveToward(board, daughter.id, 1, BOARD_H - 1)).toBeNull();
  });
});

describe('記録（lib/records.ts）', () => {
  it('クリア時に手数を渡すと、少ないほうで bestMoves が更新される', () => {
    const first = applyResult({}, { outcome: 'win', moves: 120 });
    expect(first.entry.bestMoves).toBe(120);
    expect(first.improved.moves).toBe(true);

    const worse = applyResult(first.entry, { outcome: 'win', moves: 150 });
    expect(worse.entry.bestMoves).toBe(120);
    expect(worse.improved.moves).toBe(false);

    const better = applyResult(worse.entry, { outcome: 'win', moves: 95 });
    expect(better.entry.bestMoves).toBe(95);
    expect(better.improved.moves).toBe(true);
    expect(better.entry.wins).toBe(3);
  });
});
