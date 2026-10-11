import { describe, expect, it } from 'vitest';
import { dailySeed, mulberry32 } from '@/lib/daily';
import {
  append,
  APPENDS,
  canPair,
  canUseNineCols,
  cellLabel,
  colsOf,
  collapseRows,
  DAILY_PLAYED_KEY,
  dailyBoard,
  FALLBACK_BOARD,
  generate,
  GENERATE_MAX_TRIES,
  hintPair,
  HINT_PENALTY_MS,
  INITIAL_COUNT,
  isCleared,
  isFirstDailyPlay,
  isLinked,
  isMatch,
  isStuck,
  legalPairs,
  makeBoard,
  MAX_INITIAL_PAIRS,
  MIN_INITIAL_PAIRS,
  moveCursor,
  NINE_COLS_MIN_WIDTH,
  partnersOf,
  readDailyPlayed,
  remaining,
  removePair,
  shareText,
  solve,
  SOLVE_NODE_LIMIT,
  totalTimeMs,
  variantOf,
  VERSION,
  writeDailyPlayed,
  type Board,
  type Move,
} from '@/lib/suji-keshi';

/** 文字列から盤を作る（`.` は消えたマス、`1`〜`9` は数字）。列数は 1 行目の長さ */
function parse(rows: string[], appendsLeft = APPENDS): Board {
  const cols = rows[0].length;
  const cells = rows
    .join('')
    .split('')
    .map((ch) => (ch === '.' ? null : Number(ch)));
  return { cols, cells, appendsLeft };
}

/** 盤を文字列の行に戻す（テストの期待値を読みやすくするため） */
function show(board: Board): string[] {
  const out: string[] = [];
  for (let i = 0; i < board.cells.length; i += board.cols) {
    out.push(
      board.cells
        .slice(i, i + board.cols)
        .map((v) => (v === null ? '.' : String(v)))
        .join(''),
    );
  }
  return out;
}

/** 手順をなぞって盤を進める（途中で消せない組があれば失敗させる） */
function replay(board: Board, moves: readonly Move[]): Board {
  let b = board;
  for (const m of moves) {
    if (m.type === 'append') {
      expect(b.appendsLeft).toBeGreaterThan(0);
      b = append(b);
    } else {
      const next = removePair(b, m.a, m.b);
      expect(next).not.toBeNull();
      b = next as Board;
    }
  }
  return b;
}

describe('組になる数（isMatch）', () => {
  it('同じ数か、足して 10', () => {
    expect(isMatch(3, 3)).toBe(true);
    expect(isMatch(3, 7)).toBe(true);
    expect(isMatch(5, 5)).toBe(true);
    expect(isMatch(1, 9)).toBe(true);
    expect(isMatch(3, 4)).toBe(false);
    expect(isMatch(5, 4)).toBe(false);
  });
});

describe('消せる組（legalPairs）', () => {
  it('横に隣り合う', () => {
    const b = parse(['19']);
    expect(legalPairs(b)).toEqual([[0, 1]]);
  });

  it('縦に並ぶ', () => {
    const b = parse(['1.2', '9.4']);
    expect(legalPairs(b)).toEqual([[0, 3]]);
  });

  it('斜め（右下）に並ぶ', () => {
    const b = parse(['1.2', '.9.']);
    expect(legalPairs(b)).toEqual([[0, 4]]);
  });

  it('斜め（左下）に並ぶ', () => {
    const b = parse(['..1', '29.']);
    expect(legalPairs(b)).toEqual([[2, 4]]);
  });

  it('読む順で行をまたぐ（行の終わりと次の行の始め）', () => {
    const b = parse(['2..3', '7...']);
    expect(legalPairs(b)).toEqual([[3, 4]]);
    // 縦・斜めには並んでいない
    expect(isLinked(b, 3, 4)).toBe(true);
  });

  it('間に消えたマスしか無ければ、離れていても消せる（横・縦・斜め・読む順）', () => {
    expect(canPair(parse(['1...9']), 0, 4)).toBe(true);
    expect(canPair(parse(['1.2', '...', '9.4']), 0, 6)).toBe(true);
    expect(canPair(parse(['1..', '...', '..9']), 0, 8)).toBe(true);
    // 読む順で、行の途中から 2 行先まで消えたマスだけ
    expect(canPair(parse(['2.3', '...', '7..']), 2, 6)).toBe(true);
  });

  it('間に残ったマスがあると消せない', () => {
    const row = parse(['159']);
    expect(canPair(row, 0, 2)).toBe(false);
    expect(legalPairs(row)).toEqual([]);
    const col = parse(['1', '5', '9']);
    expect(canPair(col, 0, 2)).toBe(false);
    const diag = parse(['1..', '.5.', '..9']);
    expect(canPair(diag, 0, 8)).toBe(false);
  });

  it('消えたマスとは組めない・同じマスとは組めない', () => {
    const b = parse(['1.9']);
    expect(canPair(b, 0, 1)).toBe(false);
    expect(canPair(b, 0, 0)).toBe(false);
  });

  it('同じ組を二度数えない（読む順と斜めが同じ相手を指すとき）', () => {
    const b = parse(['..1', '.9.']);
    expect(legalPairs(b)).toEqual([[2, 4]]);
  });

  it('組める位置（partnersOf）は前後どちらの向きも拾う', () => {
    const b = parse(['3.7', '.3.']);
    expect(partnersOf(b, 4).sort((x, y) => x - y)).toEqual([0, 2]);
  });
});

describe('行を詰める', () => {
  it('1 行がすべて消えたら、その行は詰めて消える', () => {
    const b = parse(['3.5', '19.', '.7.']);
    const next = removePair(b, 3, 4) as Board;
    expect(show(next)).toEqual(['3.5', '.7.']);
  });

  it('詰めたあとも読む順・縦・斜めの隣が正しい', () => {
    const b = parse(['3.5', '19.', '.7.']);
    // 詰める前は 3 と 7 は斜めに並んでいない（間の行に 9 がある）
    expect(canPair(b, 0, 7)).toBe(false);
    const next = removePair(b, 3, 4) as Board;
    // 詰めたら右下の隣になる
    expect(legalPairs(next)).toEqual([[0, 4]]);
    // 読む順の隣も、詰めた盤の添字で数える
    expect(isLinked(next, 2, 4)).toBe(true);
  });

  it('最後の途中までの行も、残りが無ければ消える', () => {
    const next = collapseRows({ cols: 3, cells: [1, 2, 3, null], appendsLeft: 0 });
    expect(next.cells).toEqual([1, 2, 3]);
  });

  it('消せない組なら null を返し、元の盤は変えない', () => {
    const b = parse(['159']);
    expect(removePair(b, 0, 2)).toBeNull();
    expect(show(b)).toEqual(['159']);
  });
});

describe('書き足す（append）', () => {
  it('残りを読む順のまま盤の後ろに足し、回数を 1 減らす', () => {
    const b = parse(['1.2', '.34'], 2);
    const next = append(b);
    expect(next.cells).toEqual([1, null, 2, null, 3, 4, 1, 2, 3, 4]);
    expect(next.appendsLeft).toBe(1);
    // 元の盤は変えない
    expect(b.cells).toHaveLength(6);
    expect(b.appendsLeft).toBe(2);
  });

  it('途中までの最後の行の続きから書き足す', () => {
    const next = append({ cols: 2, cells: [1, 2, 3], appendsLeft: 1 });
    expect(show(next)).toEqual(['12', '31', '23']);
  });

  it('0 回なら何もしない', () => {
    const b = parse(['12'], 0);
    expect(append(b)).toBe(b);
  });

  it('空の盤には書き足さない', () => {
    const b: Board = { cols: 6, cells: [], appendsLeft: 3 };
    expect(append(b)).toBe(b);
  });
});

describe('終わりの判定', () => {
  it('盤が空ならクリア', () => {
    expect(isCleared({ cols: 6, cells: [], appendsLeft: 4 })).toBe(true);
    expect(isCleared(parse(['..']))).toBe(true);
    expect(isCleared(parse(['.1']))).toBe(false);
  });

  it('消せる組が無く、書き足しも残っていなければ負け', () => {
    expect(isStuck(parse(['12'], 0))).toBe(true);
    expect(isStuck(parse(['12'], 1))).toBe(false);
    expect(isStuck(parse(['19'], 0))).toBe(false);
  });

  it('1 組ずつ消して盤が空になる', () => {
    let b = parse(['19', '55']);
    b = removePair(b, 0, 1) as Board;
    expect(show(b)).toEqual(['55']);
    b = removePair(b, 0, 1) as Board;
    expect(isCleared(b)).toBe(true);
    expect(remaining(b)).toBe(0);
  });
});

describe('探索（solve）', () => {
  it('書き足しで解ける盤を、書き足しを使って解く', () => {
    // 1 と 2 は組にならない。書き足すと 1・2・1・2 で、1 と 1 が縦に並ぶ
    const b = parse(['12'], 1);
    const r = solve(b);
    expect(r.solved).toBe(true);
    expect(r.appendsUsed).toBe(1);
    expect(isCleared(replay(b, r.moves))).toBe(true);
  });

  it('書き足しが無く組が無ければ解けない', () => {
    const r = solve(parse(['12'], 0));
    expect(r.solved).toBe(false);
    expect(r.moves).toEqual([]);
  });

  it('limit のノード数を超えて探索しない（数で打ち切る）', () => {
    // 30 個の盤は、消し切るまでに少なくとも 15 手（15 ノード）要る。それより少ない上限では必ず打ち切られる
    const b = generate(6, mulberry32(7)).board;
    for (const limit of [0, 1, 5, 14]) {
      const r = solve(b, limit);
      expect(r.solved).toBe(false);
      expect(r.nodes).toBeLessThanOrEqual(limit);
    }
    // 上限が大きくても、探索したノード数は上限を超えない
    for (const limit of [100, 1000, 10_000]) {
      expect(solve(b, limit).nodes).toBeLessThanOrEqual(limit);
    }
  });

  it('既定の上限は定数（SOLVE_NODE_LIMIT）', () => {
    const r = solve(parse(['12', '34'], 0));
    expect(r.nodes).toBeLessThanOrEqual(SOLVE_NODE_LIMIT);
  });

  it('FALLBACK_BOARD は書き足し 4 回以内にクリアできる', () => {
    expect(FALLBACK_BOARD.cols).toBe(6);
    expect(FALLBACK_BOARD.appendsLeft).toBe(APPENDS);
    expect(FALLBACK_BOARD.cells).toHaveLength(INITIAL_COUNT);
    const r = solve(FALLBACK_BOARD, SOLVE_NODE_LIMIT);
    expect(r.solved).toBe(true);
    expect(r.appendsUsed).toBeLessThanOrEqual(APPENDS);
    expect(isCleared(replay(FALLBACK_BOARD, r.moves))).toBe(true);
  });
});

describe('生成（generate）', () => {
  it('1,000 個の種で、生成した盤が solve で書き足し 4 回以内にクリアできる', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const g = generate(6, mulberry32(seed));
      expect(g.board.cols).toBe(6);
      expect(g.board.appendsLeft).toBe(APPENDS);
      const r = solve(g.board);
      expect(r.solved, `seed ${seed}`).toBe(true);
      expect(r.appendsUsed).toBeLessThanOrEqual(APPENDS);
      expect(isCleared(replay(g.board, r.moves)), `seed ${seed}`).toBe(true);
    }
  });

  it('9 列でも解ける盤を出す', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const g = generate(9, mulberry32(seed));
      expect(solve(g.board).solved, `seed ${seed}`).toBe(true);
    }
  });

  it('初手の組の数が 3〜8 の範囲に入る割合が 95% 以上', () => {
    let inRange = 0;
    const n = 1000;
    for (let seed = 1; seed <= n; seed++) {
      const g = generate(6, mulberry32(seed * 31 + 7));
      const pairs = legalPairs(g.board).length;
      if (pairs >= MIN_INITIAL_PAIRS && pairs <= MAX_INITIAL_PAIRS) inRange++;
    }
    expect(inRange / n).toBeGreaterThanOrEqual(0.95);
  });

  it('初期は 30 個・1〜9 の数字', () => {
    const g = generate(6, mulberry32(42));
    expect(g.board.cells).toHaveLength(INITIAL_COUNT);
    for (const v of g.board.cells) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(9);
    }
  });

  it('同じ日付・同じ VERSION で同じ盤（100 回生成して全件同じ）', () => {
    const first = dailyBoard('2026-10-09');
    for (let i = 0; i < 100; i++) expect(dailyBoard('2026-10-09')).toEqual(first);
    expect(dailyBoard('2026-10-10')).not.toEqual(first);
    // 今日の 1 面は 6 列
    expect(first.cols).toBe(6);
    expect(first).toEqual(generate(6, mulberry32(dailySeed('2026-10-09', VERSION))).board);
  });

  it('試行回数を使い切ったら固定の盤を出す（入力が同じなら同じ結果）', () => {
    // 上限 0 では 1 枚も確かめられない（盤が空でない限り）
    const g = generate(6, mulberry32(1), 0);
    expect(g.fallback).toBe(true);
    expect(g.board).toBe(FALLBACK_BOARD);
    expect(generate(6, mulberry32(1), 0)).toEqual(g);
    expect(GENERATE_MAX_TRIES).toBe(50);
  });
});

describe('画面まわりの小さな関数', () => {
  it('列数：今日の 1 面と 6 列は 6、9 列は 9。記録の区分は列数ごと', () => {
    expect(colsOf('daily')).toBe(6);
    expect(colsOf('6col')).toBe(6);
    expect(colsOf('9col')).toBe(9);
    expect(variantOf('daily')).toBe('daily');
    expect(variantOf('6col')).toBe('6col');
    expect(variantOf('9col')).toBe('9col');
  });

  it('9 列は押す先 44px で 9 列が収まる幅のときだけ選べる', () => {
    expect(NINE_COLS_MIN_WIDTH).toBeGreaterThanOrEqual(9 * 44);
    expect(canUseNineCols(288)).toBe(false);
    expect(canUseNineCols(358)).toBe(false);
    expect(canUseNineCols(700)).toBe(true);
  });

  it('320 幅でも 6 列のマスが隙間を引いて 44px 以上（288px − 隙間 3px × 5）', () => {
    expect((288 - 3 * 5) / 6).toBeGreaterThanOrEqual(44);
  });

  it('ヒントは消せる組を 1 つ返す。無ければ null', () => {
    const b = parse(['19', '23']);
    expect(hintPair(b, () => 0)).toEqual([0, 1]);
    expect(hintPair(parse(['12']), () => 0)).toBeNull();
    expect(totalTimeMs(1000, 2)).toBe(1000 + 2 * HINT_PENALTY_MS);
  });

  it('読み上げは位置と数だけ', () => {
    const b = parse(['1.', '34']);
    expect(cellLabel(b, 0)).toBe('1行1列、1');
    expect(cellLabel(b, 1)).toBe('1行2列、消えたマス');
    expect(cellLabel(b, 3)).toBe('2行2列、4');
  });

  it('カーソルは盤の端と最後のマスで止まる', () => {
    const b: Board = { cols: 3, cells: [1, 2, 3, 4], appendsLeft: 0 };
    expect(moveCursor(b, 0, 'left')).toBe(0);
    expect(moveCursor(b, 0, 'right')).toBe(1);
    expect(moveCursor(b, 2, 'right')).toBe(2);
    expect(moveCursor(b, 1, 'down')).toBe(1);
    expect(moveCursor(b, 0, 'down')).toBe(3);
    expect(moveCursor(b, 3, 'up')).toBe(0);
  });

  it('共有文は「数字けし 10/09 クリア・書き足し 2 回・3:12」（盤面を含めない）', () => {
    const text = shareText({
      mode: 'daily',
      appendsUsed: 2,
      timeMs: 192_000,
      dateKey: '2026-10-09',
      url: 'https://hasokon.com/games/suji-keshi/',
    });
    expect(text).toBe('数字けし 10/09 クリア・書き足し 2 回・3:12\nhttps://hasokon.com/games/suji-keshi/');
    expect(shareText({ mode: '9col', appendsUsed: 0, timeMs: 5000, url: 'u' })).toBe('数字けし 9列 クリア・書き足し 0 回・0:05\nu');
  });
});

describe('今日の 1 面の 1 回目', () => {
  it('保存値が今日なら 2 回目以降', () => {
    expect(isFirstDailyPlay(null, '2026-10-09')).toBe(true);
    expect(isFirstDailyPlay('2026-10-08', '2026-10-09')).toBe(true);
    expect(isFirstDailyPlay('2026-10-09', '2026-10-09')).toBe(false);
  });

  it('読み書きは suji-keshi:daily-played に今日の日付を 1 つだけ置く', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(readDailyPlayed(storage)).toBeNull();
    writeDailyPlayed(storage, '2026-10-09');
    expect(DAILY_PLAYED_KEY).toBe('suji-keshi:daily-played');
    expect(store.get('suji-keshi:daily-played')).toBe('2026-10-09');
    expect(readDailyPlayed(storage)).toBe('2026-10-09');
  });

  it('読み書きできなくても落ちない（try/catch）', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readDailyPlayed(broken)).toBeNull();
    expect(() => writeDailyPlayed(broken, '2026-10-09')).not.toThrow();
    expect(readDailyPlayed(null)).toBeNull();
  });
});
