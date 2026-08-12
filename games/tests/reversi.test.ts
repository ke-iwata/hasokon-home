import { describe, expect, it } from 'vitest';
import {
  applyMove,
  BLACK,
  CORNERS,
  chooseMove,
  discDiff,
  DIRS,
  EMPTY,
  evaluate,
  flipsAt,
  initialBoard,
  initialState,
  isLegalMove,
  leader,
  legalMoves,
  LEVELS,
  MOBILITY_VALUE,
  mobilityScore,
  opponent,
  positionScore,
  score,
  search,
  SQUARE_VALUE,
  stableCount,
  STABLE_VALUE,
  STEPS,
  undoIndex,
  weightsFor,
  WEIGHTS,
  WHITE,
  X_SQUARES,
  type Player,
  type ReversiState,
} from '@/lib/reversi';
import { seededRng } from '@/lib/cards';

/**
 * 盤面を絵で書く。'B'=黒 / 'W'=白 / '.'=空き。
 * リバーシのテストは「どこが裏返るか」が読めないと意味がないので、
 * index の羅列ではなく8行の文字列で書く。
 */
const put = (...rows: string[]): Int8Array => {
  expect(rows).toHaveLength(8);
  const board = new Int8Array(64);
  rows.forEach((row, r) => {
    expect(row).toHaveLength(8);
    [...row].forEach((ch, c) => {
      board[r * 8 + c] = ch === 'B' ? BLACK : ch === 'W' ? WHITE : EMPTY;
    });
  });
  return board;
};

const state = (turn: Player, ...rows: string[]): ReversiState => ({
  board: put(...rows),
  turn,
  finished: false,
  last: null,
  passed: false,
});

const draw = (board: Int8Array): string[] => {
  const rows: string[] = [];
  for (let r = 0; r < 8; r += 1) {
    let line = '';
    for (let c = 0; c < 8; c += 1) {
      const v = board[r * 8 + c];
      line += v === BLACK ? 'B' : v === WHITE ? 'W' : '.';
    }
    rows.push(line);
  }
  return rows;
};

/** 白黒を入れ替えた盤面。手番非依存（ネガマックス）の確認に使う */
const swapColors = (board: Int8Array): Int8Array => board.map((v) => -v) as Int8Array;

/**
 * now() の呼び出し回数を時計にする偽時計。
 * 実時計だと読める深さが実行環境の速さで変わり、テストが落ちたり落ちなかったりする。
 * 呼び出し回数で切ると、同じ入力なら必ず同じ深さ・同じ手になる。
 */
const fakeClock = () => {
  let t = 0;
  return () => (t += 1);
};

/** 全力で読ませる（偽時計で深さ上限まで到達する予算） */
const FULL = 20000;

/**
 * どちらも指せない盤面。白は角の1石だけで、角から伸びる3方向が黒で埋まっている。
 * 白は自分の石から伸びる先に空きが無く、黒は角を挟めない
 */
const STUCK = put(
  'WBBBBBBB',
  'BB......',
  'B.B.....',
  'B..B....',
  'B...B...',
  'B....B..',
  'B.....B.',
  'B......B',
);

/** 手順を順に指す */
const play = (moves: readonly number[]): ReversiState[] => {
  const history = [initialState()];
  for (const m of moves) {
    const next = applyMove(history[history.length - 1], m);
    expect(next).not.toBe(history[history.length - 1]);
    history.push(next);
  }
  return history;
};

describe('STEPS（端の折り返し防止）', () => {
  it('方向の並びは [-9, -8, -7, -1, 1, 7, 8, 9]', () => {
    expect([...DIRS]).toEqual([-9, -8, -7, -1, 1, 7, 8, 9]);
  });

  it('中央のマスはどの方向にも進める', () => {
    // 27 = 3行3列。上下左右に3〜4マスずつ余裕がある
    expect([...STEPS[27]]).toEqual([3, 3, 3, 3, 4, 3, 4, 4]);
  });

  it('角からは盤の内側にしか進めない', () => {
    expect([...STEPS[0]]).toEqual([0, 0, 0, 0, 7, 0, 7, 7]);
    expect([...STEPS[63]]).toEqual([7, 7, 0, 7, 0, 0, 0, 0]);
  });

  it('左端のマスは左方向に0歩（右端へ折り返さない）', () => {
    for (const sq of [8, 16, 24, 32, 40, 48]) {
      expect(STEPS[sq][DIRS.indexOf(-1)]).toBe(0);
      expect(STEPS[sq][DIRS.indexOf(-9)]).toBe(0);
      expect(STEPS[sq][DIRS.indexOf(7)]).toBe(0);
    }
  });
});

describe('初期配置', () => {
  it('中央4石。黒 e4・d5 / 白 d4・e5', () => {
    expect(draw(initialBoard())).toEqual([
      '........',
      '........',
      '........',
      '...WB...',
      '...BW...',
      '........',
      '........',
      '........',
    ]);
    expect(score(initialBoard())).toEqual({ black: 2, white: 2, empty: 60 });
  });

  it('先手は黒。黒の初手は4通り', () => {
    const s = initialState();
    expect(s.turn).toBe(BLACK);
    expect(legalMoves(s.board, BLACK)).toEqual([19, 26, 37, 44]);
  });

  it('白の初手も4通り（黒とは別の4か所）', () => {
    expect(legalMoves(initialBoard(), WHITE)).toEqual([20, 29, 34, 43]);
  });
});

describe('裏返し', () => {
  it('8方向すべてで裏返る', () => {
    // 36 の周囲8マスが白、そのさらに外側8マスが黒
    const board = put(
      '........',
      '........',
      '..B.B.B.',
      '...WWW..',
      '..BW.WB.',
      '...WWW..',
      '..B.B.B.',
      '........',
    );
    expect(flipsAt(board, BLACK, 36).sort((a, b) => a - b)).toEqual([
      27, 28, 29, 35, 37, 43, 44, 45,
    ]);
  });

  it('盤の端で折り返さない（横）', () => {
    // 8（2行目の左端）の左隣は「1行目の右端」ではない
    const board = put(
      '......WB',
      '........',
      '........',
      '...WB...',
      '...BW...',
      '........',
      '........',
      '........',
    );
    expect(flipsAt(board, BLACK, 8)).toEqual([]);
    expect(legalMoves(board, BLACK)).not.toContain(8);
  });

  it('盤の端で折り返さない（斜め）', () => {
    // 15（2行目の右端）から左下（+7）に進むと 22 だが、23→24 の折り返しも起きない
    const board = put(
      '........',
      '.......B',
      'W.......',
      '.B.WB...',
      '...BW...',
      '........',
      '........',
      '........',
    );
    // 16（3行目の左端）は白。ここから右上(-7)に進むと 9 で、23 には行かない
    expect(flipsAt(board, BLACK, 23)).toEqual([]);
    expect(flipsAt(board, BLACK, 24)).toEqual([]);
  });

  it('自分の石を飛び越えて裏返さない', () => {
    const board = put(
      'B.......',
      '........',
      '........',
      '...WB...',
      '...BW...',
      '........',
      '........',
      '........',
    );
    // 1行目: 空き . 黒 → 黒を飛び越えた先の白は関係ない
    const line = put(
      '.BWWB...',
      '........',
      '........',
      '...WB...',
      '...BW...',
      '........',
      '........',
      '........',
    );
    expect(flipsAt(line, BLACK, 0)).toEqual([]);
    expect(board[0]).toBe(BLACK);
  });

  it('空きマスを挟んでいたら裏返らない', () => {
    const board = put(
      '.WW.B...',
      '........',
      '........',
      '...WB...',
      '...BW...',
      '........',
      '........',
      '........',
    );
    expect(flipsAt(board, BLACK, 0)).toEqual([]);
  });

  it('すでに石があるマスには打てない', () => {
    const board = initialBoard();
    expect(flipsAt(board, BLACK, 27)).toEqual([]);
    expect(isLegalMove(board, BLACK, 27)).toBe(false);
  });

  it('盤の外の index を渡しても落ちない', () => {
    expect(flipsAt(initialBoard(), BLACK, -1)).toEqual([]);
    expect(flipsAt(initialBoard(), BLACK, 64)).toEqual([]);
  });
});

describe('着手と進行', () => {
  it('打つと石が置かれ、挟んだ石が裏返り、手番が相手に移る', () => {
    const next = applyMove(initialState(), 19);
    expect(draw(next.board)).toEqual([
      '........',
      '........',
      '...B....',
      '...BB...',
      '...BW...',
      '........',
      '........',
      '........',
    ]);
    expect(next.turn).toBe(WHITE);
    expect(next.last).toBe(19);
    expect(next.passed).toBe(false);
  });

  it('打てない場所に打とうとしても局面は変わらない', () => {
    const s = initialState();
    expect(applyMove(s, 0)).toBe(s);
    expect(applyMove(s, 27)).toBe(s);
  });

  it('元の局面は書き換わらない（履歴が壊れない）', () => {
    const s = initialState();
    const before = draw(s.board);
    applyMove(s, 19);
    expect(draw(s.board)).toEqual(before);
  });

  it('相手に打てる手が無ければパスして手番が戻る', () => {
    // 8手目（白の着手）のあと、黒に合法手が無くなる
    const history = play([19, 18, 44, 11, 3, 4, 9, 2]);
    const passed = history[history.length - 1];
    expect(passed.passed).toBe(true);
    expect(passed.turn).toBe(WHITE);
    expect(passed.finished).toBe(false);
    expect(legalMoves(passed.board, BLACK)).toEqual([]);
    expect(legalMoves(passed.board, WHITE).length).toBeGreaterThan(0);
  });

  it('双方に打てる手が無ければ終局する', () => {
    // 盤が埋まる前でも、どちらも打てなくなればそこで終わり。
    // 白は角に1石だけ。角から伸びる3方向はすべて黒で埋まっていて打つ先が無く、
    // 黒は角を挟めない（角は挟めるマスが無い）ので、どちらも指せない
    expect(legalMoves(STUCK, BLACK)).toEqual([]);
    expect(legalMoves(STUCK, WHITE)).toEqual([]);
  });

  it('石が0になった側が出たら即終局（全滅）', () => {
    const history = play([44, 45, 46, 43, 26, 34, 42, 52, 60]);
    const last = history[history.length - 1];
    expect(last.finished).toBe(true);
    expect(score(last.board)).toEqual({ black: 13, white: 0, empty: 51 });
    expect(leader(last.board)).toBe(BLACK);
  });

  it('石数と勝敗', () => {
    expect(leader(initialBoard())).toBe(0);
    expect(discDiff(initialBoard(), BLACK)).toBe(0);
    const board = put(
      'BBB.....',
      '.W......',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
    );
    expect(score(board)).toEqual({ black: 3, white: 1, empty: 60 });
    expect(leader(board)).toBe(BLACK);
    expect(discDiff(board, WHITE)).toBe(-2);
  });

  it('終局まで指すと盤が埋まるか双方が打てなくなる', () => {
    const rng = seededRng(42);
    let s = initialState();
    let plies = 0;
    while (!s.finished) {
      const moves = legalMoves(s.board, s.turn);
      expect(moves.length).toBeGreaterThan(0);
      s = applyMove(s, moves[Math.floor(rng() * moves.length)]);
      plies += 1;
      expect(plies).toBeLessThanOrEqual(60);
    }
    const both = legalMoves(s.board, BLACK).length + legalMoves(s.board, WHITE).length;
    expect(both).toBe(0);
  });
});

describe('もどす（undoIndex）', () => {
  it('自分が黒のとき、直前の自分の手だけを取り消す', () => {
    // 黒 → 白 → 黒 → 白 と進んだあと。戻り先は「3手目（黒）を打つ直前」
    const history = play([19, 18, 44, 11]);
    expect(undoIndex(history, BLACK)).toBe(2);
    expect(history[2].turn).toBe(BLACK);
  });

  it('自分が白で、CPUの初手だけが指された局面から戻すと初期配置に戻る', () => {
    // 「1手戻す＝2手戻す」の実装だと、初期配置より前へ行こうとして壊れる
    const history = play([19]);
    expect(undoIndex(history, WHITE)).toBe(0);
    expect(draw(history[0].board)).toEqual(draw(initialBoard()));
  });

  it('CPUがパスした直後に戻すと、自分の手が1つだけ取り消される', () => {
    // 白（プレイヤー）が8手目を打ったところで黒（CPU）がパスし、手番が白に戻る
    const history = play([19, 18, 44, 11, 3, 4, 9, 2]);
    const current = history[history.length - 1];
    expect(current.passed).toBe(true);
    expect(current.turn).toBe(WHITE);

    const target = undoIndex(history, WHITE);
    // 手数で2手戻す実装だと 6 になり、白の手が2つ消える
    expect(target).toBe(7);
    expect(history[7].turn).toBe(WHITE);
    // 取り消されるのは8手目（白の着手）だけ
    expect(score(history[7].board).empty).toBe(score(current.board).empty + 1);
  });

  it('戻る先が無ければ null（ボタンを無効にする）', () => {
    expect(undoIndex([initialState()], BLACK)).toBeNull();
    expect(undoIndex([], BLACK)).toBeNull();
  });

  it('終局した局面は戻り先に選ばない', () => {
    const history = play([44, 45, 46, 43, 26, 34, 42, 52, 60]);
    const target = undoIndex(history, BLACK);
    expect(target).not.toBeNull();
    expect(history[target as number].finished).toBe(false);
  });
});

describe('評価', () => {
  it('重みは 角 > 辺 > その他 > 角の隣 > 角の斜め隣 の順', () => {
    expect(WEIGHTS[0]).toBe(SQUARE_VALUE.corner);
    expect(WEIGHTS[9]).toBe(SQUARE_VALUE.x);
    expect(WEIGHTS[1]).toBe(SQUARE_VALUE.c);
    expect(WEIGHTS[8]).toBe(SQUARE_VALUE.c);
    expect(WEIGHTS[3]).toBe(SQUARE_VALUE.edge);
    expect(WEIGHTS[27]).toBe(SQUARE_VALUE.inner);
    for (const sq of X_SQUARES) expect(WEIGHTS[sq]).toBe(SQUARE_VALUE.x);
    for (const sq of CORNERS) expect(WEIGHTS[sq]).toBe(SQUARE_VALUE.corner);
  });

  it('角が埋まると、その角の斜め隣・隣の減点が消える', () => {
    // 角を渡す危険が無くなるため。減点を残すと「角を取ると自分の点が下がる」ことになる
    const board = initialBoard();
    expect(weightsFor(board)[9]).toBe(SQUARE_VALUE.x);
    board[0] = BLACK;
    expect(weightsFor(board)[9]).toBe(SQUARE_VALUE.inner);
    expect(weightsFor(board)[1]).toBe(SQUARE_VALUE.edge);
    // 他の角の減点はそのまま
    expect(weightsFor(board)[54]).toBe(SQUARE_VALUE.x);
  });

  it('評価は手番非依存（ネガマックス）', () => {
    const board = put(
      'B..WWW..',
      '.B.WWWW.',
      '.BBBWWWB',
      '.W.WWWWW',
      '..WWWWWW',
      '.BBBWBBW',
      '..B..W.W',
      '....B.W.',
    );
    expect(evaluate(board, BLACK)).toBe(-evaluate(board, WHITE));
    expect(positionScore(board, BLACK)).toBe(-positionScore(board, WHITE));
    expect(mobilityScore(board, BLACK)).toBe(-mobilityScore(board, WHITE));
    // 白黒を入れ替えた盤面は、色を入れ替えても同じ評価になる
    expect(evaluate(swapColors(board), WHITE)).toBe(evaluate(board, BLACK));
  });

  it('着手可能数の差が評価に入る', () => {
    const board = initialBoard();
    expect(mobilityScore(board, BLACK)).toBe(0);
    const after = applyMove(initialState(), 19);
    expect(mobilityScore(after.board, WHITE)).toBe(
      (legalMoves(after.board, WHITE).length - legalMoves(after.board, BLACK).length) *
        MOBILITY_VALUE,
    );
  });

  it('確定石は角から辺に連続した石だけを数える', () => {
    const board = put(
      'BBB.B...',
      'B.......',
      'B.......',
      '........',
      '........',
      '........',
      '........',
      '.......W',
    );
    // 上辺は 0,1,2 まで（4 は 3 が空いているので確定ではない）。左辺は 0,8,16
    expect(stableCount(board, BLACK)).toBe(5);
    expect(stableCount(board, WHITE)).toBe(1);
  });

  it('石の数そのものは評価に入らない', () => {
    // 中央（重み0）の石をいくら増やしても重みテーブルの評価は動かない。
    // 序盤〜中盤で石を増やすのはむしろ悪手なので、石数を見てはいけない
    const few = initialBoard();
    const many = put(
      '........',
      '........',
      '........',
      '..BWBB..',
      '..BBWB..',
      '........',
      '........',
      '........',
    );
    expect(discDiff(few, BLACK)).toBe(0);
    expect(discDiff(many, BLACK)).toBe(4);
    expect(positionScore(few, BLACK)).toBe(0);
    expect(positionScore(many, BLACK)).toBe(0);
  });

  it('角を持っているほうが高く評価される', () => {
    const empty = put(
      '........',
      '........',
      '........',
      '...WB...',
      '...BW...',
      '........',
      '........',
      '........',
    );
    const withCorner = put(
      'B.......',
      '........',
      '........',
      '...WB...',
      '...BW...',
      '........',
      '........',
      '........',
    );
    expect(positionScore(withCorner, BLACK) - positionScore(empty, BLACK)).toBe(
      SQUARE_VALUE.corner,
    );
    expect(evaluate(withCorner, BLACK)).toBeGreaterThan(
      evaluate(empty, BLACK) + STABLE_VALUE,
    );
  });
});

describe('CPU', () => {
  /** 深さ6まで読ませた「つよい」。角が絡む局面（角は4枚・最多は8枚裏返る） */
  const cornerChoice = () =>
    state(
      BLACK,
      'B..WWW..',
      '.B.WWWW.',
      '.BBBWWWB',
      '.W.WWWWW',
      '..WWWWWW',
      '.BBBWBBW',
      '..B..W.W',
      '....B.W.',
    );

  it('3段階ある', () => {
    expect(Object.keys(LEVELS)).toEqual(['easy', 'normal', 'hard']);
  });

  it('合法手が無ければ -1 を返す', () => {
    const s: ReversiState = {
      board: STUCK,
      turn: BLACK,
      finished: false,
      last: null,
      passed: false,
    };
    for (const level of ['easy', 'normal', 'hard'] as const) {
      expect(chooseMove(s, level, { rng: seededRng(1) })).toBe(-1);
    }
  });

  it('どの段階でも必ず合法手を返す', () => {
    const rng = seededRng(3);
    let s = initialState();
    let plies = 0;
    while (!s.finished && plies < 30) {
      const level = (['easy', 'normal', 'hard'] as const)[plies % 3];
      const move = chooseMove(s, level, { rng, budgetMs: 200, now: fakeClock() });
      expect(legalMoves(s.board, s.turn)).toContain(move);
      s = applyMove(s, move);
      plies += 1;
    }
  });

  it('かんたんは角も角の斜め隣も避けない（探索していない）', () => {
    // rng を変えると別の手が出る＝評価していない
    const s = cornerChoice();
    const picked = new Set(
      Array.from({ length: 30 }, (_, i) => chooseMove(s, 'easy', { rng: seededRng(i + 1) })),
    );
    expect(picked.size).toBeGreaterThan(1);
    for (const m of picked) expect(legalMoves(s.board, BLACK)).toContain(m);
  });

  it('ふつうは重みテーブルだけを見る（角は取るが読みはしない）', () => {
    const s = cornerChoice();
    const move = chooseMove(s, 'normal', { rng: seededRng(1) });
    expect(CORNERS).toContain(move);
    // 深さ1なので、重みテーブルの評価が最大の手をそのまま返している
    const best = legalMoves(s.board, BLACK)
      .map((m) => ({ m, v: positionScore(applyMove(s, m).board, BLACK) }))
      .sort((a, b) => b.v - a.v)[0].v;
    expect(positionScore(applyMove(s, move).board, BLACK)).toBe(best);
  });

  it('つよいは角を取れる場面で角を取る', () => {
    const s = cornerChoice();
    expect(legalMoves(s.board, BLACK)).toContain(7);
    const move = chooseMove(s, 'hard', { rng: seededRng(1), budgetMs: FULL, now: fakeClock() });
    expect(CORNERS).toContain(move);
  });

  it('つよいは「石は多く取れるが角ではない手」より角を選ぶ', () => {
    // 石数を評価に入れていたら、8枚裏返る手を選んで角を見送ってしまう
    const s = cornerChoice();
    const flips = (m: number) => flipsAt(s.board, BLACK, m).length;
    const greedy = legalMoves(s.board, BLACK).sort((a, b) => flips(b) - flips(a))[0];
    expect(flips(greedy)).toBe(8);
    expect(flips(7)).toBe(4);
    expect(CORNERS).not.toContain(greedy);
    expect(chooseMove(s, 'hard', { rng: seededRng(1), budgetMs: FULL, now: fakeClock() })).not.toBe(
      greedy,
    );
  });

  it('つよいは序盤に自分から角の斜め隣に置かない', () => {
    const rng = seededRng(5);
    let s = initialState();
    const played: number[] = [];
    while (!s.finished && played.length < 20) {
      const move = chooseMove(s, 'hard', { rng, budgetMs: 400, now: fakeClock() });
      played.push(move);
      s = applyMove(s, move);
    }
    expect(played).toHaveLength(20);
    expect(played.filter((m) => X_SQUARES.includes(m))).toEqual([]);
  });

  it('プレイヤーが白でも同じ強さで指す（手番非依存）', () => {
    const s = cornerChoice();
    const asBlack = chooseMove(s, 'hard', { rng: seededRng(1), budgetMs: FULL, now: fakeClock() });
    const mirrored: ReversiState = { ...s, board: swapColors(s.board), turn: WHITE };
    const asWhite = chooseMove(mirrored, 'hard', {
      rng: seededRng(1),
      budgetMs: FULL,
      now: fakeClock(),
    });
    expect(asWhite).toBe(asBlack);
    expect(opponent(mirrored.turn)).toBe(BLACK);
  });

  it('終盤（空き10以下）は最終石数を読み切る', () => {
    const s = state(
      BLACK,
      'B.WBBBBB',
      '.B.BBBW.',
      'BBBBBWBW',
      'WWWWWW.W',
      'BWBBWWBW',
      'BBWBWWB.',
      'BBBWWWBB',
      'BBWWWW..',
    );
    expect(score(s.board).empty).toBe(8);
    // 総当たりの最善は 15（最終石差 +14）。他の手は +10 / +8 / +10 にしかならない
    const exact = (st: ReversiState): number => {
      if (st.finished) return discDiff(st.board, BLACK);
      const vals = legalMoves(st.board, st.turn).map((m) => exact(applyMove(st, m)));
      return st.turn === BLACK ? Math.max(...vals) : Math.min(...vals);
    };
    const best = legalMoves(s.board, BLACK)
      .map((m) => ({ m, v: exact(applyMove(s, m)) }))
      .sort((a, b) => b.v - a.v);
    expect(best[0]).toEqual({ m: 15, v: 14 });
    expect(chooseMove(s, 'hard', { rng: seededRng(1), budgetMs: FULL, now: fakeClock() })).toBe(15);
  });

  it('budgetMs: 0 でも合法手を返す（深さ1は必ず完了する）', () => {
    const s = initialState();
    const r = search(s, 'hard', { rng: seededRng(1), budgetMs: 0, now: fakeClock() });
    expect(r.depth).toBe(1);
    expect(legalMoves(s.board, BLACK)).toContain(r.move);
  });

  it('時計を進めると探索が浅くなる（打ち切りが効いている）', () => {
    const s = cornerChoice();
    const depths = [0, 20, 100, FULL].map(
      (budgetMs) => search(s, 'hard', { rng: seededRng(1), budgetMs, now: fakeClock() }).depth,
    );
    // 予算が増えるほど深くなり、減ることはない
    expect(depths[0]).toBe(1);
    expect(depths).toEqual([...depths].sort((a, b) => a - b));
    expect(depths[3]).toBeGreaterThan(depths[0]);
    // 打ち切られた深さの結果は使わないので、深さは必ず完了した値になる
    expect(depths[3]).toBeLessThanOrEqual(6);
  });

  it('思考時間の上限を超えて読み続けない', () => {
    const s = cornerChoice();
    let calls = 0;
    const now = () => {
      calls += 1;
      return calls;
    };
    search(s, 'hard', { rng: seededRng(1), budgetMs: 50, now });
    // 深さ1のぶんを含めても、打ち切り後に読み進めていない
    expect(calls).toBeLessThan(200);
  });

  it('同じ盤面・同じ rng なら同じ手を返す（再現性）', () => {
    const s = cornerChoice();
    for (const level of ['easy', 'normal', 'hard'] as const) {
      const a = chooseMove(s, level, { rng: seededRng(7), budgetMs: FULL, now: fakeClock() });
      const b = chooseMove(s, level, { rng: seededRng(7), budgetMs: FULL, now: fakeClock() });
      expect(a).toBe(b);
    }
  });

  it('探索は盤面を書き換えない', () => {
    const s = cornerChoice();
    const before = draw(s.board);
    search(s, 'hard', { rng: seededRng(1), budgetMs: FULL, now: fakeClock() });
    expect(draw(s.board)).toEqual(before);
  });

  it(
    'つよいはふつう・かんたんに勝つ（黒番でも白番でも）',
    () => {
      for (const foe of ['easy', 'normal'] as const) {
        for (const hardColor of [BLACK, WHITE] as Player[]) {
          const rng = seededRng(hardColor === BLACK ? 1 : 2);
          let s = initialState();
          while (!s.finished) {
            const level = s.turn === hardColor ? 'hard' : foe;
            s = applyMove(s, chooseMove(s, level, { rng, budgetMs: 300, now: fakeClock() }));
          }
          expect(discDiff(s.board, hardColor)).toBeGreaterThan(0);
        }
      }
    },
    60000,
  );
});
