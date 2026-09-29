import { describe, expect, it } from 'vitest';
import {
  CELLS,
  chainMultiplier,
  collapse,
  createBoard,
  DAILY_MOVES,
  DAILY_VARIANT,
  dailyRng,
  findMatches,
  groupPoints,
  hasAnyMove,
  isAdjacent,
  isOver,
  isValidMove,
  KINDS,
  newGame,
  playMove,
  resolve,
  shareText,
  shuffle,
  SIZE,
  variantOf,
  type Board,
  type GameState,
  type Rng,
} from '@/lib/match3';
import { mulberry32 } from '@/lib/daily';

const at = (r: number, c: number) => r * SIZE + c;

/**
 * どこも3つ並ばず、手も無い盤。3×3 のタイルを敷き詰めたもの（探索で見つけた固定の盤）。
 * 同じ種類がどの2×3・3×2の窓にも2つ入らないので、1回の入れ替えでは3つそろわない
 */
const TILE = [0, 5, 4, 4, 3, 2, 5, 2, 1];
const NO_MOVE_BOARD: Board = Array.from({ length: CELLS }, (_, i) => TILE[(Math.floor(i / SIZE) % 3) * 3 + ((i % SIZE) % 3)]);

/**
 * 3つ並んでいない土台。行ごとに種類をずらした縞（どこも3つ並ばない）。
 * テストではここに並びを書き込む
 */
function base(): Board {
  return Array.from({ length: CELLS }, (_, i) => {
    const r = Math.floor(i / SIZE);
    const c = i % SIZE;
    return (Math.floor(c / 2) + r * 2 + (r % 2)) % KINDS;
  });
}

/** 固定の値を順に返す乱数（最後まで来たら先頭に戻る） */
function seq(values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length];
}

/** 呼ばれた回数を数える乱数（補充が何個分の乱数を消費したかを見る） */
function counting(rng: Rng): Rng & { count: number } {
  const f = (() => {
    f.count++;
    return rng();
  }) as Rng & { count: number };
  f.count = 0;
  return f;
}

/** 全マスが埋まっていて、種類が 0〜5 に収まっている */
function assertFull(board: Board) {
  expect(board).toHaveLength(CELLS);
  // expect を64回呼ぶと遅いので、外れたマスだけを集めて1回で比べる
  const bad = board.filter((k) => !Number.isInteger(k) || k < 0 || k >= KINDS);
  expect(bad).toEqual([]);
}

describe('土台（テスト用の盤）', () => {
  it('base() は3つ並ばない', () => {
    expect(findMatches(base())).toEqual([]);
  });

  it('NO_MOVE_BOARD は3つ並ばず、手も無い', () => {
    expect(findMatches(NO_MOVE_BOARD)).toEqual([]);
    expect(hasAnyMove(NO_MOVE_BOARD)).toBe(false);
  });
});

describe('createBoard', () => {
  it('初期盤面に3連が無く、手が1つ以上ある（シード1,000個）', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const board = createBoard(mulberry32(seed));
      assertFull(board);
      expect(findMatches(board)).toEqual([]);
      expect(hasAnyMove(board)).toBe(true);
    }
  });

  it('同じシードなら同じ盤面', () => {
    expect(createBoard(mulberry32(42))).toEqual(createBoard(mulberry32(42)));
    expect(createBoard(mulberry32(42))).not.toEqual(createBoard(mulberry32(43)));
  });

  it('今日の1盤面は日付で決まる（同じ日は同じ、別の日は別）', () => {
    const a = newGame('daily', dailyRng('2026-09-29'));
    const b = newGame('daily', dailyRng('2026-09-29'));
    const c = newGame('daily', dailyRng('2026-09-30'));
    expect(a.board).toEqual(b.board);
    expect(a.board).not.toEqual(c.board);
    expect(a.movesLeft).toBe(DAILY_MOVES);
  });

  it('エンドレスは手数無制限', () => {
    const g = newGame('endless', mulberry32(1));
    expect(g.movesLeft).toBeNull();
    expect(isOver(g)).toBe(false);
  });
});

describe('findMatches', () => {
  it('横3', () => {
    const b = base();
    b[at(3, 2)] = b[at(3, 3)] = b[at(3, 4)] = 9;
    const groups = findMatches(b);
    expect(groups).toEqual([{ kind: 9, cells: [at(3, 2), at(3, 3), at(3, 4)] }]);
  });

  it('縦3', () => {
    const b = base();
    b[at(1, 5)] = b[at(2, 5)] = b[at(3, 5)] = 9;
    expect(findMatches(b)).toEqual([{ kind: 9, cells: [at(1, 5), at(2, 5), at(3, 5)] }]);
  });

  it('十字は1グループ（5個）', () => {
    const b = base();
    for (const [r, c] of [
      [2, 3],
      [3, 2],
      [3, 3],
      [3, 4],
      [4, 3],
    ]) {
      b[at(r, c)] = 9;
    }
    const groups = findMatches(b);
    expect(groups).toHaveLength(1);
    expect(groups[0].cells).toHaveLength(5);
  });

  it('L字は1グループ（5個）', () => {
    const b = base();
    for (const [r, c] of [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [2, 2],
    ]) {
      b[at(r, c)] = 9;
    }
    const groups = findMatches(b);
    expect(groups).toHaveLength(1);
    expect(groups[0].cells).toEqual([at(0, 0), at(1, 0), at(2, 0), at(2, 1), at(2, 2)]);
  });

  it('4連・5連', () => {
    const b = base();
    for (let c = 0; c < 4; c++) b[at(6, c)] = 9;
    for (let r = 0; r < 5; r++) b[at(r, 7)] = 8;
    const groups = findMatches(b);
    expect(groups.map((g) => g.cells.length).sort()).toEqual([4, 5]);
  });

  it('同時2か所（同じ種類でも、マスを共有しなければ別のグループ）', () => {
    const b = base();
    b[at(0, 0)] = b[at(0, 1)] = b[at(0, 2)] = 9;
    b[at(5, 5)] = b[at(6, 5)] = b[at(7, 5)] = 9;
    const groups = findMatches(b);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.cells.length === 3)).toBe(true);
  });
});

describe('入れ替えの判定', () => {
  it('隣（上下左右）だけが入れ替えられる', () => {
    expect(isAdjacent(at(3, 3), at(3, 4))).toBe(true);
    expect(isAdjacent(at(3, 3), at(4, 3))).toBe(true);
    expect(isAdjacent(at(3, 3), at(4, 4))).toBe(false);
    // 行の端から次の行の頭へは隣ではない
    expect(isAdjacent(at(0, 7), at(1, 0))).toBe(false);
  });

  it('並ぶ入れ替えだけが有効', () => {
    const b = base();
    b[at(3, 0)] = b[at(3, 1)] = 9;
    b[at(4, 2)] = 9;
    expect(isValidMove(b, at(3, 2), at(4, 2))).toBe(true);
    expect(isValidMove(b, at(0, 0), at(0, 1))).toBe(false);
  });
});

describe('得点', () => {
  it('3つ30点・4つ60点・5つ以上100点', () => {
    expect(groupPoints(3)).toBe(30);
    expect(groupPoints(4)).toBe(60);
    expect(groupPoints(5)).toBe(100);
    expect(groupPoints(7)).toBe(100);
  });

  it('連鎖1段ごとに倍率 +0.5', () => {
    expect(chainMultiplier(1)).toBe(1);
    expect(chainMultiplier(2)).toBe(1.5);
    expect(chainMultiplier(3)).toBe(2);
  });
});

describe('resolve（消滅・落下・補充）', () => {
  it('上のピースが順番を保って下に詰まり、空いた上端に補充される', () => {
    const b = base();
    const col = [0, 1, 2, 3, 4, 5, 0, 1].map((k, r) => k + 10 * (r + 1)); // 見分けやすい値
    for (let r = 0; r < SIZE; r++) b[at(r, 0)] = col[r];
    const next = collapse(b, new Set([at(5, 0), at(6, 0)]), seq([0.0, 0.5]));
    // 行0〜4の5個が2つ下がって行2〜6へ、行7はそのまま
    expect([2, 3, 4, 5, 6, 7].map((r) => next[at(r, 0)])).toEqual([col[0], col[1], col[2], col[3], col[4], col[7]]);
    // 補充は下から：行1が1つ目の乱数（0.0 → 0）、行0が2つ目（0.5 → 3）
    expect(next[at(1, 0)]).toBe(0);
    expect(next[at(0, 0)]).toBe(3);
  });

  it('補充は列ごとに左から乱数を消費する', () => {
    const b = base();
    const values = [0.0, 1 / 6, 2 / 6];
    const next = collapse(b, new Set([at(4, 1), at(2, 5), at(7, 6)]), seq(values));
    expect(next[at(0, 1)]).toBe(0);
    expect(next[at(0, 5)]).toBe(1);
    expect(next[at(0, 6)]).toBe(2);
  });

  it('消えた数だけ乱数を消費する', () => {
    const b = base();
    b[at(3, 2)] = b[at(3, 3)] = b[at(3, 4)] = 9;
    const rng = counting(mulberry32(7));
    const steps = resolve(b, rng);
    const total = steps.reduce((n, s) => n + s.cleared.length, 0);
    expect(rng.count).toBe(total);
  });

  it('連鎖の段数と倍率', () => {
    const b = base();
    // 1段目：行7の横3（列1〜3）と、列3の縦3（行5〜7）が行7列3を共有 → 1グループ（5個）
    b[at(7, 1)] = b[at(7, 2)] = b[at(7, 3)] = 9;
    b[at(6, 3)] = b[at(5, 3)] = 9;
    // 消えたあと行7に落ちてくる3つ：列1・2は行6から、列3は行4から
    b[at(6, 1)] = b[at(6, 2)] = b[at(4, 3)] = 8;
    const first = findMatches(b);
    expect(first).toHaveLength(1);
    expect(first[0].cells).toHaveLength(5);

    const steps = resolve(b, mulberry32(3));
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps[0].chain).toBe(1);
    expect(steps[0].points).toBe(100);
    expect([1, 2, 3].map((c) => steps[0].board[at(7, c)])).toEqual([8, 8, 8]);
    expect(steps[1].chain).toBe(2);
    const base2 = steps[1].groups.reduce((sum, g) => sum + groupPoints(g.cells.length), 0);
    expect(steps[1].points).toBe(Math.round(base2 * 1.5));
    // 最後の段のあとは並んでいない
    expect(findMatches(steps[steps.length - 1].board)).toEqual([]);
  });

  it('不変条件：どの段でも64マスがすべて埋まり、種類は 0〜5', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = mulberry32(seed);
      let state = newGame('endless', rng);
      for (let turn = 0; turn < 20; turn++) {
        const move = firstMove(state.board);
        if (!move) break;
        const r = playMove(state, move[0], move[1], rng);
        expect(r.valid).toBe(true);
        for (const s of r.steps) assertFull(s.board);
        assertFull(r.state.board);
        expect(findMatches(r.state.board)).toEqual([]);
        state = r.state;
      }
    }
  });
});

/** 盤で最初に見つかる有効な手 */
function firstMove(board: Board): [number, number] | null {
  for (let cell = 0; cell < CELLS; cell++) {
    if (cell % SIZE < SIZE - 1 && isValidMove(board, cell, cell + 1)) return [cell, cell + 1];
    if (cell < CELLS - SIZE && isValidMove(board, cell, cell + SIZE)) return [cell, cell + SIZE];
  }
  return null;
}

/** 盤で最初に見つかる「並ばない」隣どうし */
function invalidMove(board: Board): [number, number] {
  for (let cell = 0; cell < CELLS - 1; cell++) {
    if (cell % SIZE < SIZE - 1 && !isValidMove(board, cell, cell + 1)) return [cell, cell + 1];
  }
  throw new Error('並ばない手が無い');
}

describe('shuffle', () => {
  it('手が無い盤を、種類の分布を保って手のある盤にする', () => {
    const next = shuffle(NO_MOVE_BOARD, mulberry32(11));
    expect(hasAnyMove(next)).toBe(true);
    expect(findMatches(next)).toEqual([]);
    expect([...next].sort()).toEqual([...NO_MOVE_BOARD].sort());
  });

  it('同じ乱数列なら同じ結果（日替わりの決定論）', () => {
    expect(shuffle(NO_MOVE_BOARD, mulberry32(5))).toEqual(shuffle(NO_MOVE_BOARD, mulberry32(5)));
  });
});

describe('playMove（1局の進行）', () => {
  it('並ばない入れ替えは手数を減らさず、盤も変えない', () => {
    const state = newGame('daily', dailyRng('2026-09-29'));
    const [a, b] = invalidMove(state.board);
    const r = playMove(state, a, b, mulberry32(1));
    expect(r.valid).toBe(false);
    expect(r.state).toBe(state);
    expect(r.state.movesLeft).toBe(DAILY_MOVES);
    // 往復の動きを描くため、入れ替えた盤は返す
    expect(r.swapped[a]).toBe(state.board[b]);
  });

  it('並んで消えた入れ替えだけ手数が1減り、得点が入る', () => {
    const rng = dailyRng('2026-09-29');
    const state = newGame('daily', rng);
    const [a, b] = firstMove(state.board)!;
    const r = playMove(state, a, b, rng);
    expect(r.valid).toBe(true);
    expect(r.state.movesLeft).toBe(DAILY_MOVES - 1);
    expect(r.state.score).toBe(r.steps.reduce((s, x) => s + x.points, 0));
    expect(r.state.score).toBeGreaterThanOrEqual(30);
    expect(r.state.maxChain).toBe(r.steps.length);
  });

  it('手が無くなったら並べ替える。並べ替えで手数は減らさない', () => {
    // 手の無い盤の上端に1手だけ仕込む。行0の列0〜2が消えて、補充で元の値に戻ると
    // 盤はちょうど NO_MOVE_BOARD に戻る（＝手が無くなる）
    const board = NO_MOVE_BOARD.slice();
    board[at(0, 0)] = board[at(0, 1)] = 9;
    board[at(1, 2)] = 9;
    // 入れ替えで行1列2へ降りる値は、NO_MOVE_BOARD の行1列2と同じにしておく
    board[at(0, 2)] = NO_MOVE_BOARD[at(1, 2)];
    expect(findMatches(board)).toEqual([]);
    const move: [number, number] = [at(0, 2), at(1, 2)];
    expect(isValidMove(board, ...move)).toBe(true);

    // 補充（列ごと左から・下から）に、もとの行0の値が入るように乱数を選ぶ
    const refill = [0, 1, 2].map((c) => (NO_MOVE_BOARD[at(0, c)] + 0.5) / KINDS);
    const state: GameState = {
      mode: 'daily',
      board,
      movesLeft: 10,
      score: 0,
      cleared: 0,
      maxChain: 0,
      shuffles: 0,
    };
    const r = playMove(state, move[0], move[1], seqThen(refill, 99));
    expect(r.valid).toBe(true);
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0].board).toEqual(NO_MOVE_BOARD);
    expect(r.shuffled).not.toBeNull();
    expect(hasAnyMove(r.state.board)).toBe(true);
    expect([...r.state.board].sort()).toEqual([...NO_MOVE_BOARD].sort());
    expect(r.state.shuffles).toBe(1);
    // 手数は「並んで消えた1手」のぶんだけ減る（並べ替えでは減らない）
    expect(r.state.movesLeft).toBe(9);
    // 同じ乱数列・同じ手順なら、並べ替えも含めて同じ盤
    const again = playMove({ ...state, board: board.slice() }, move[0], move[1], seqThen(refill, 99));
    expect(again.state.board).toEqual(r.state.board);
  });

  it('最後の1手のあとは手が無くても並べ替えない（もう指さないため）', () => {
    const board = NO_MOVE_BOARD.slice();
    board[at(0, 0)] = board[at(0, 1)] = 9;
    board[at(1, 2)] = 9;
    board[at(0, 2)] = NO_MOVE_BOARD[at(1, 2)];
    const refill = [0, 1, 2].map((c) => (NO_MOVE_BOARD[at(0, c)] + 0.5) / KINDS);
    const state: GameState = { mode: 'daily', board, movesLeft: 1, score: 0, cleared: 0, maxChain: 0, shuffles: 0 };
    const r = playMove(state, at(0, 2), at(1, 2), seqThen(refill, 99));
    expect(r.state.movesLeft).toBe(0);
    expect(isOver(r.state)).toBe(true);
    expect(r.shuffled).toBeNull();
  });

  it('同じシード・同じ手順なら同じ盤面（今日の1盤面を30手遊び切る）', () => {
    const play = () => {
      const rng = dailyRng('2026-09-29');
      let state = newGame('daily', rng);
      const boards: Board[] = [];
      while (!isOver(state)) {
        const move = firstMove(state.board);
        expect(move).not.toBeNull();
        // 並ばない入れ替えも挟む（手数も乱数も消費しないこと）
        const bad = invalidMove(state.board);
        const miss = playMove(state, bad[0], bad[1], rng);
        expect(miss.state.movesLeft).toBe(state.movesLeft);
        state = playMove(state, move![0], move![1], rng).state;
        boards.push(state.board);
      }
      return { state, boards };
    };
    const a = play();
    const b = play();
    expect(a.boards).toEqual(b.boards);
    expect(a.state.score).toBe(b.state.score);
    expect(a.state.movesLeft).toBe(0);
  });

  it('手数を使い切ったら、それ以上は指せない', () => {
    const rng = mulberry32(9);
    const state: GameState = { ...newGame('daily', rng), movesLeft: 0 };
    const move = firstMove(state.board)!;
    const r = playMove(state, move[0], move[1], rng);
    expect(r.valid).toBe(false);
    expect(r.state).toBe(state);
  });
});

/** 決まった値を返したあと、シードつきの乱数列に切り替える */
function seqThen(values: number[], seed: number): Rng {
  const rest = mulberry32(seed);
  let i = 0;
  return () => (i < values.length ? values[i++] : rest());
}

describe('記録の区分・共有', () => {
  it('日替わりは版つきの区分、エンドレスは endless', () => {
    expect(variantOf('daily')).toBe(DAILY_VARIANT);
    expect(DAILY_VARIANT).toBe('daily-v1');
    expect(variantOf('endless')).toBe('endless');
  });

  it('共有文は「マッチ3パズル 日付：点（最大 n 連鎖）」', () => {
    const text = shareText({
      mode: 'daily',
      score: 1240,
      maxChain: 4,
      dateKey: '2026-09-29',
      url: 'https://hasokon.com/games/match3/',
    });
    expect(text).toBe('マッチ3パズル 2026-09-29：1,240 点（最大 4 連鎖）\nhttps://hasokon.com/games/match3/');
  });
});

describe('ページの文言', () => {
  it('本文に直に書いた「8×8」「30手」が設定と食い違っていない', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../app/match3/page.tsx', import.meta.url), 'utf8');
    expect(src).toContain(`${SIZE}×${SIZE}の盤`);
    expect(src).toContain(`${DAILY_MOVES}手のスコア勝負`);
  });
});
