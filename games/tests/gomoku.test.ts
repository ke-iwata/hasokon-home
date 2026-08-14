import { describe, expect, it } from 'vitest';
import {
  AXES,
  applyMove,
  BLACK,
  candidates,
  CELLS,
  CENTER,
  centerScore,
  chooseMove,
  emptyBoard,
  emptyCells,
  evaluate,
  indexOf,
  initialState,
  isLegalMove,
  LEVELS,
  LINES,
  MAX_DEPTH,
  moveScore,
  opponent,
  pointScore,
  resign,
  runAt,
  search,
  shapeScore,
  SHAPE_VALUE,
  shapeValue,
  SIZE,
  undoIndex,
  WHITE,
  winningLine,
  winningMoves,
  winsAt,
  WIN_LENGTH,
  type Board,
  type GomokuState,
  type Level,
  type Player,
} from '@/lib/gomoku';
import { seededRng } from '@/lib/cards';

/**
 * 五目並べ（docs/features/game-gomoku.md）のテスト。
 *
 * リバーシ（tests/reversi.test.ts）と同じく、盤面は index の羅列ではなく
 * 13行の文字列で書く。「どこが並んでいるか」が読めないとテストの意味がないため。
 * 'B'=黒 / 'W'=白 / '.'=空き。
 */

/** 13文字ぶんの空行 */
const E = '.'.repeat(SIZE);

/** 13行の絵から盤面を作る。行が足りなければ空行で埋める */
const put = (rows: Record<number, string>): Board => {
  const board = emptyBoard();
  for (const [key, spec] of Object.entries(rows)) {
    const r = Number(key);
    expect(spec).toHaveLength(SIZE);
    [...spec].forEach((ch, c) => {
      board[indexOf(r, c)] = ch === 'B' ? BLACK : ch === 'W' ? WHITE : 0;
    });
  }
  return board;
};

const state = (turn: Player, rows: Record<number, string>): GomokuState => ({
  ...initialState(turn),
  board: put(rows),
  placed: countStones(put(rows)),
});

function countStones(board: Board): number {
  let n = 0;
  for (let i = 0; i < CELLS; i += 1) if (board[i] !== 0) n += 1;
  return n;
}

const draw = (board: Board): string[] => {
  const rows: string[] = [];
  for (let r = 0; r < SIZE; r += 1) {
    let line = '';
    for (let c = 0; c < SIZE; c += 1) {
      const v = board[indexOf(r, c)];
      line += v === BLACK ? 'B' : v === WHITE ? 'W' : '.';
    }
    rows.push(line);
  }
  return rows;
};

const ALL_LEVELS = Object.keys(LEVELS) as Level[];

/** テストで使う固定の乱数（同点の手のばらしが毎回同じになる） */
const rng = () => seededRng(20260814);

describe('盤面の定数', () => {
  it('13×13＝169マス、5つ並べたら勝ち', () => {
    expect(SIZE).toBe(13);
    expect(CELLS).toBe(169);
    expect(WIN_LENGTH).toBe(5);
  });

  it('天元は盤の中心（7行7列目）', () => {
    expect(CENTER).toBe(indexOf(6, 6));
  });

  it('数える方向は4つ（逆向きは同じ直線なので数えない）', () => {
    expect(AXES).toHaveLength(4);
  });

  it('直線は60本。どれも長さ5以上（5つ並べようが無い対角線は持たない）', () => {
    expect(LINES).toHaveLength(60);
    for (const line of LINES) expect(line.length).toBeGreaterThanOrEqual(WIN_LENGTH);
  });

  it('すべてのマスが4方向それぞれちょうど1本の直線に属する（数え漏れ・二重計上が無い）', () => {
    const count = new Int8Array(CELLS);
    for (const line of LINES) for (const sq of line) count[sq] += 1;
    // 中央は4方向すべて。端のマスは長さ5未満の対角線に乗るぶんだけ本数が減る
    expect(count[CENTER]).toBe(4);
    // 左上の隅は 行・列・右下がりの対角線（長さ13）の3本。右上がりは長さ1なので持たない
    expect(count[indexOf(0, 0)]).toBe(3);
    // 行と列は必ず、対角線は少なくとも片方が長さ5以上あるので、どのマスも3本以上
    expect(Math.min(...count)).toBe(3);
    expect(Math.max(...count)).toBe(4);
  });
});

describe('連（runAt）', () => {
  it('空きマスでも「そこに置いたら」として数える', () => {
    const board = put({ 6: '....BBB......' });
    const run = runAt(board, indexOf(6, 7), BLACK, [0, 1]);
    expect(run.length).toBe(4);
    expect(run.openEnds).toBe(2);
    expect(run.cells).toEqual([indexOf(6, 4), indexOf(6, 5), indexOf(6, 6), indexOf(6, 7)]);
  });

  it('端が相手の石なら開放度が減る', () => {
    const board = put({ 6: '...WBBB......' });
    const run = runAt(board, indexOf(6, 7), BLACK, [0, 1]);
    expect(run.length).toBe(4);
    expect(run.openEnds).toBe(1);
  });

  it('盤の端は塞がっているものとして数える（折り返さない）', () => {
    const board = put({ 6: 'BBBB.........' });
    const run = runAt(board, indexOf(6, 0), BLACK, [0, 1]);
    expect(run.length).toBe(4);
    expect(run.openEnds).toBe(1);
  });

  it('行をまたいで折り返さない', () => {
    // 6行目の右端と7行目の左端は index が隣り合うが、同じ横の並びではない
    const board = put({ 6: '..........BBB', 7: 'BB...........' });
    const run = runAt(board, indexOf(6, 12), BLACK, [0, 1]);
    expect(run.length).toBe(3);
    expect(run.cells.every((sq) => Math.floor(sq / SIZE) === 6)).toBe(true);
  });

  it('縦・斜めも数える', () => {
    const board = put({ 3: '.....B.......', 4: '.....B.......', 5: '.....B.......' });
    expect(runAt(board, indexOf(6, 5), BLACK, [1, 0]).length).toBe(4);

    const diag = put({ 3: '...B.........', 4: '....B........', 5: '.....B.......' });
    expect(runAt(diag, indexOf(6, 6), BLACK, [1, 1]).length).toBe(4);

    const anti = put({ 3: '.........B...', 4: '........B....', 5: '.......B.....' });
    expect(runAt(anti, indexOf(6, 6), BLACK, [1, -1]).length).toBe(4);
  });
});

describe('勝ち筋（winningLine）', () => {
  it('横・縦・右下がり・右上がりのどれでも5つで勝ち', () => {
    const across = put({ 6: '....BBBB.....' });
    expect(winningLine(across, BLACK, indexOf(6, 8))).toHaveLength(5);

    const down = put({ 2: '....B........', 3: '....B........', 4: '....B........', 5: '....B........' });
    expect(winningLine(down, BLACK, indexOf(6, 4))).toHaveLength(5);

    const diag = put({ 2: '..B..........', 3: '...B.........', 4: '....B........', 5: '.....B.......' });
    expect(winningLine(diag, BLACK, indexOf(6, 6))).toHaveLength(5);

    const anti = put({ 2: '..........B..', 3: '.........B...', 4: '........B....', 5: '.......B.....' });
    expect(winningLine(anti, BLACK, indexOf(6, 6))).toHaveLength(5);
  });

  it('4つでは勝ちにならない', () => {
    const board = put({ 6: '....BBB......' });
    expect(winningLine(board, BLACK, indexOf(6, 7))).toBeNull();
    expect(winsAt(board, BLACK, indexOf(6, 7))).toBe(false);
  });

  it('あいだに相手の石が入っていたら勝ちにならない', () => {
    const board = put({ 6: '..BB.WBB.....' });
    expect(winsAt(board, BLACK, indexOf(6, 4))).toBe(false);
  });

  it('長連（6つ以上）も勝ち。禁じ手を入れていないため', () => {
    const board = put({ 6: '..BBB.BB.....' });
    const line = winningLine(board, BLACK, indexOf(6, 5));
    expect(line).not.toBeNull();
    // 3つと2つのあいだを埋めて6連。5でちょうど止める必要は無い
    expect(line).toHaveLength(6);
  });

  it('盤の外の index を渡しても落ちない', () => {
    const board = emptyBoard();
    expect(winningLine(board, BLACK, -1)).toBeNull();
    expect(winningLine(board, BLACK, CELLS)).toBeNull();
  });
});

describe('着手と進行', () => {
  it('先手は黒。打つと手番が入れ替わる（パスは無い）', () => {
    const first = initialState();
    expect(first.turn).toBe(BLACK);
    expect(first.placed).toBe(0);

    const next = applyMove(first, CENTER);
    expect(next.board[CENTER]).toBe(BLACK);
    expect(next.turn).toBe(WHITE);
    expect(next.last).toBe(CENTER);
    expect(next.placed).toBe(1);
    expect(next.finished).toBe(false);
  });

  it('先手を白から始めることもできる（1局ごとに入れ替えるため）', () => {
    expect(initialState(WHITE).turn).toBe(WHITE);
  });

  it('元の局面は書き換わらない（履歴が壊れない）', () => {
    const first = initialState();
    applyMove(first, CENTER);
    expect(first.board[CENTER]).toBe(0);
    expect(first.placed).toBe(0);
  });

  it('石のあるマスには打てない', () => {
    const s = applyMove(initialState(), CENTER);
    expect(isLegalMove(s, CENTER)).toBe(false);
    expect(applyMove(s, CENTER)).toBe(s);
  });

  it('盤の外には打てない', () => {
    const s = initialState();
    expect(isLegalMove(s, -1)).toBe(false);
    expect(isLegalMove(s, CELLS)).toBe(false);
    expect(applyMove(s, CELLS)).toBe(s);
  });

  it('5つ並んだら終局。勝った並びのマスを持つ', () => {
    const s = state(BLACK, { 6: '....BBBB.....' });
    const next = applyMove(s, indexOf(6, 8));
    expect(next.finished).toBe(true);
    expect(next.winner).toBe(BLACK);
    expect([...next.line].sort((a, b) => a - b)).toEqual([
      indexOf(6, 4),
      indexOf(6, 5),
      indexOf(6, 6),
      indexOf(6, 7),
      indexOf(6, 8),
    ]);
    // 終局後は手番が動かない（勝者を表示するため turn はそのまま）
    expect(next.turn).toBe(BLACK);
  });

  it('終局した局面には打てない', () => {
    const done = applyMove(state(BLACK, { 6: '....BBBB.....' }), indexOf(6, 8));
    expect(applyMove(done, CENTER)).toBe(done);
  });

  it('盤が埋まったら引き分け', () => {
    /**
     * 4マス周期（BBWW）で塗ると、縦・横・斜めのどこにも3つ以上並ばない盤になる。
     * 実際の対局でここまで来ることはまずないが、引き分けの経路は塞がない。
     * 石数の偏りは対局の進行としては起こり得ないが、判定の確認には関係しない。
     */
    const board = emptyBoard();
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        board[indexOf(r, c)] = (c + 2 * r) % 4 < 2 ? BLACK : WHITE;
      }
    }
    const lastSq = CELLS - 1;
    const turn: Player = board[lastSq] as Player;
    board[lastSq] = 0;

    const full: GomokuState = { ...initialState(turn), board, placed: CELLS - 1 };
    const next = applyMove(full, lastSq);
    expect(next.finished).toBe(true);
    expect(next.winner).toBe(0);
    expect(next.line).toEqual([]);
    expect(emptyCells(next.board)).toEqual([]);
  });

  it('投了すると相手の勝ちになる', () => {
    const s = applyMove(initialState(), CENTER);
    const done = resign(s, BLACK);
    expect(done.finished).toBe(true);
    expect(done.winner).toBe(WHITE);
    // 終局後の投了は何も変えない
    expect(resign(done, WHITE)).toBe(done);
  });
});

describe('待った（undoIndex）', () => {
  const play = (human: Player, squares: number[]): GomokuState[] => {
    const history = [initialState(human)];
    for (const sq of squares) history.push(applyMove(history[history.length - 1], sq));
    return history;
  };

  it('自分が先手のとき、自分とCPUの2手を取り消す', () => {
    const history = play(BLACK, [CENTER, CENTER + 1, CENTER + SIZE]);
    // 現在（4件目）の1つ前はCPUの手のあと。戻り先は「自分の手番だった局面」
    const target = undoIndex(history, BLACK);
    expect(target).toBe(2);
    expect(history[target as number].turn).toBe(BLACK);
  });

  it('自分が後手で、CPUの初手だけが指された局面から戻すと対局開始に戻る', () => {
    const history = play(BLACK, [CENTER]);
    expect(undoIndex(history, WHITE)).toBe(0);
  });

  it('戻る先が無ければ null（ボタンを無効にする）', () => {
    expect(undoIndex([initialState()], BLACK)).toBeNull();
  });

  it('終局した局面は戻り先に選ばない', () => {
    const history = [state(BLACK, { 6: '....BBBB.....' })];
    history.push(applyMove(history[0], indexOf(6, 8)));
    // 直前（index 0）は自分の手番なのでそこへ戻る
    expect(undoIndex(history, BLACK)).toBe(0);
  });
});

describe('並びの評価', () => {
  it('活四 > 四 > 活三 > 眠三 > 活二 の順に価値がある', () => {
    expect(SHAPE_VALUE.openFour).toBeGreaterThan(SHAPE_VALUE.four);
    expect(SHAPE_VALUE.four).toBeGreaterThan(SHAPE_VALUE.openThree);
    expect(SHAPE_VALUE.openThree).toBeGreaterThan(SHAPE_VALUE.three);
    expect(SHAPE_VALUE.three).toBeGreaterThan(SHAPE_VALUE.openTwo);
    expect(SHAPE_VALUE.five).toBeGreaterThan(SHAPE_VALUE.openFour * 5);
  });

  it('両端が塞がれた並びは、長さ4でも価値が無い', () => {
    expect(shapeValue(4, 0)).toBe(0);
    expect(shapeValue(3, 0)).toBe(0);
  });

  it('5つ以上は端が塞がっていても勝ち（長連も勝ちのため）', () => {
    expect(shapeValue(5, 0)).toBe(SHAPE_VALUE.five);
    expect(shapeValue(6, 0)).toBe(SHAPE_VALUE.five);
  });

  it('shapeScore は自分の並びだけを数える', () => {
    const board = put({ 6: '....BBB...WW.' });
    expect(shapeScore(board, BLACK)).toBeGreaterThan(shapeScore(board, WHITE));
    // 黒の活三ぶんが入っている
    expect(shapeScore(board, BLACK)).toBeGreaterThanOrEqual(SHAPE_VALUE.openThree);
  });

  it('両端を塞がれた三は、活三よりずっと低く見る', () => {
    const open = put({ 6: '....BBB......' });
    const closed = put({ 6: '...WBBBW.....' });
    expect(shapeScore(open, BLACK)).toBeGreaterThan(shapeScore(closed, BLACK));
  });

  it('中央のほうが端よりわずかに高い', () => {
    const middle = put({ 6: '......B......' });
    const corner = put({ 0: 'B............' });
    expect(centerScore(middle, BLACK)).toBeGreaterThan(centerScore(corner, BLACK));
    expect(centerScore(corner, BLACK)).toBe(0);
  });

  it('評価は手番非依存（ネガマックス）', () => {
    const board = put({ 5: '...WW........', 6: '....BBB......', 7: '..W..........' });
    expect(evaluate(board, BLACK)).toBe(-evaluate(board, WHITE));
    expect(centerScore(board, BLACK)).toBe(-centerScore(board, WHITE));
  });

  it('pointScore は「そこに打ったらできる並び」を見る', () => {
    const board = put({ 6: '....BBB......' });
    const extend = pointScore(board, indexOf(6, 7), BLACK);
    const away = pointScore(board, indexOf(0, 0), BLACK);
    expect(extend).toBeGreaterThanOrEqual(SHAPE_VALUE.openFour);
    expect(extend).toBeGreaterThan(away);
  });

  it('moveScore は「防ぐ価値」も足す（相手の活三の端が高くなる）', () => {
    const board = put({ 6: '....WWW......' });
    const block = moveScore(board, indexOf(6, 7), BLACK);
    const away = moveScore(board, indexOf(4, 4), BLACK);
    expect(block).toBeGreaterThan(away);
  });
});

describe('候補手（candidates）', () => {
  it('石が無ければ天元だけ', () => {
    expect(candidates(emptyBoard())).toEqual([CENTER]);
  });

  it('石の近くの空きマスだけを返す（169マス全部は見ない）', () => {
    const board = put({ 6: '......B......' });
    const moves = candidates(board);
    // 5×5 の範囲から石のマスを除いた24マス
    expect(moves).toHaveLength(24);
    expect(moves).not.toContain(CENTER);
    expect(moves).toContain(indexOf(4, 4));
    expect(moves).not.toContain(indexOf(3, 6));
  });

  it('盤の端でも折り返さない', () => {
    const board = put({ 0: 'B............' });
    const moves = candidates(board);
    expect(moves.every((sq) => Math.floor(sq / SIZE) <= 2 && sq % SIZE <= 2)).toBe(true);
  });

  it('埋まった盤では候補が無い', () => {
    const board = emptyBoard();
    board.fill(BLACK);
    expect(candidates(board)).toEqual([]);
  });
});

describe('CPU', () => {
  it('3段階ある', () => {
    expect(ALL_LEVELS).toEqual(['easy', 'normal', 'hard']);
    expect(Object.values(LEVELS).map((l) => l.label)).toEqual(['かんたん', 'ふつう', 'つよい']);
  });

  it('終局した局面では -1 を返す', () => {
    const done = applyMove(state(BLACK, { 6: '....BBBB.....' }), indexOf(6, 8));
    for (const level of ALL_LEVELS) {
      expect(chooseMove(done, level, { rng: rng() })).toBe(-1);
    }
  });

  it('空の盤では天元に打つ', () => {
    for (const level of ALL_LEVELS) {
      expect(chooseMove(initialState(), level, { rng: rng(), budgetMs: 50 })).toBe(CENTER);
    }
  });

  it('どの段階でも必ず空きマスを返す', () => {
    const s = state(BLACK, { 5: '....WW.......', 6: '....BBB......', 7: '.....W.......' });
    for (const level of ALL_LEVELS) {
      const move = chooseMove(s, level, { rng: rng(), budgetMs: 50 });
      expect(isLegalMove(s, move)).toBe(true);
    }
  });

  it('どの段階でも即勝ちを逃さない', () => {
    // 黒の四。両端が空いているのでどちらでも勝ち
    const s = state(BLACK, { 6: '....BBBB.....', 8: '....WWW......' });
    const wins = winningMoves(s.board, BLACK, candidates(s.board));
    expect(wins).toHaveLength(2);
    for (const level of ALL_LEVELS) {
      expect(wins).toContain(chooseMove(s, level, { rng: rng(), budgetMs: 50 }));
    }
  });

  it('どの段階でも相手の5連は止める', () => {
    // 白の四。左端は黒が塞いでいるので、止める場所は9列目だけ
    const s = state(BLACK, { 6: '...BWWWW.....', 9: '....B........' });
    for (const level of ALL_LEVELS) {
      expect(chooseMove(s, level, { rng: rng(), budgetMs: 50 })).toBe(indexOf(6, 8));
    }
  });

  it('勝ちと防ぎが同時にあるときは自分の勝ちを選ぶ', () => {
    const s = state(BLACK, { 2: '....BBBB.....', 9: '...WWWW......' });
    for (const level of ALL_LEVELS) {
      const move = chooseMove(s, level, { rng: rng(), budgetMs: 50 });
      expect(winsAt(s.board, BLACK, move)).toBe(true);
    }
  });

  /**
   * 白の活三（両端が空いた3）を放置すると、次に活四を作られて受からなくなる。
   * 「かんたん」だけがこれを見ないので、初心者でも勝てる。
   */
  const openThree = { 2: '....WWW......', 9: '....BB.......' };
  const blocks = [indexOf(2, 3), indexOf(2, 7)];

  it('かんたんは相手の活三を見ていない（自分の並びだけを伸ばす）', () => {
    const s = state(BLACK, openThree);
    const move = chooseMove(s, 'easy', { rng: rng() });
    expect(blocks).not.toContain(move);
    // 自分の二を三に伸ばしている
    expect(pointScore(s.board, move, BLACK)).toBeGreaterThanOrEqual(SHAPE_VALUE.openThree);
  });

  it('ふつうは相手の活三を止める', () => {
    const s = state(BLACK, openThree);
    expect(blocks).toContain(chooseMove(s, 'normal', { rng: rng() }));
  });

  it('つよいも相手の活三を止める', () => {
    const s = state(BLACK, openThree);
    expect(blocks).toContain(chooseMove(s, 'hard', { rng: rng(), budgetMs: 200 }));
  });

  it('つよいは活四を作れる場面で作る（受からない形にする）', () => {
    const s = state(BLACK, { 6: '....BBB......', 11: '....WW.......' });
    const move = chooseMove(s, 'hard', { rng: rng(), budgetMs: 200 });
    const run = runAt(s.board, move, BLACK, [0, 1]);
    expect(run.length).toBe(4);
    expect(run.openEnds).toBe(2);
  });

  /**
   * 二手先の両取り（一手で三を2つ作り、どちらを止められても四にできる形）。
   * 「ふつう」は読まないので気づかないが、「つよい」は見つける。
   */
  it('つよいは読みの深さが1手より深くなる', () => {
    const s = state(BLACK, { 5: '.....BB......', 6: '......B......', 7: '.....W.......', 8: '....W........' });
    const result = search(s, 'hard', { rng: rng(), budgetMs: 500 });
    expect(result.depth).toBeGreaterThan(1);
    expect(result.depth).toBeLessThanOrEqual(MAX_DEPTH);
  });

  it('プレイヤーが白でも同じ強さで指す（手番非依存）', () => {
    const rows = { 6: '....BBB......', 11: '....WW.......' };
    const asBlack = chooseMove(state(BLACK, rows), 'hard', { rng: rng(), budgetMs: 200 });

    // 白黒を入れ替えた盤で白番にすると、同じマスを選ぶ
    const swapped = put(rows).map((v) => -v) as Board;
    const mirror: GomokuState = { ...initialState(WHITE), board: swapped, placed: 5 };
    const asWhite = chooseMove(mirror, 'hard', { rng: rng(), budgetMs: 200 });
    expect(asWhite).toBe(asBlack);
  });

  it('budgetMs: 0 でも手を返す（深さ1は必ず完了する）', () => {
    const s = state(BLACK, { 6: '....BBB......', 7: '.....WW......' });
    const result = search(s, 'hard', { rng: rng(), budgetMs: 0 });
    expect(isLegalMove(s, result.move)).toBe(true);
    expect(result.depth).toBe(1);
  });

  it('時計を進めると読みが浅くなる（打ち切りが効いている）', () => {
    const s = state(BLACK, { 5: '.....BB......', 6: '......B..W...', 7: '.....W.......' });
    // 呼ばれるたびに1msずつ進む偽時計。深い探索ほど now() を多く呼ぶので必ず打ち切られる
    let clock = 0;
    const now = () => (clock += 1);
    const cut = search(s, 'hard', { rng: rng(), now, budgetMs: 20 });
    const full = search(s, 'hard', { rng: rng(), now: () => 0, budgetMs: 1000 });
    expect(cut.depth).toBeLessThan(full.depth);
    expect(cut.depth).toBeGreaterThanOrEqual(1);
  });

  it('同じ盤面・同じ乱数なら同じ手を返す（再現性）', () => {
    const s = state(BLACK, { 6: '....BB.......', 7: '.....W.......' });
    for (const level of ALL_LEVELS) {
      const a = chooseMove(s, level, { rng: rng(), now: () => 0, budgetMs: 100 });
      const b = chooseMove(s, level, { rng: rng(), now: () => 0, budgetMs: 100 });
      expect(a).toBe(b);
    }
  });

  it('探索は盤面を書き換えない', () => {
    const s = state(BLACK, { 5: '....WW.......', 6: '....BBB......' });
    const before = draw(s.board);
    for (const level of ALL_LEVELS) chooseMove(s, level, { rng: rng(), budgetMs: 100 });
    expect(draw(s.board)).toEqual(before);
  });

  it('思考時間の上限を大きく超えて読み続けない', () => {
    const s = state(BLACK, { 5: '.....BB......', 6: '......BW.....', 7: '.....W.......' });
    const started = Date.now();
    chooseMove(s, 'hard', { rng: rng(), budgetMs: 100 });
    // 深さ1は必ず完了させるぶんの余裕を見て、上限の数倍まで
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('最後まで指し切れる（終局するか盤が埋まる）', () => {
    let s = initialState();
    const r = rng();
    for (let i = 0; i < CELLS && !s.finished; i += 1) {
      const move = chooseMove(s, s.turn === BLACK ? 'normal' : 'easy', { rng: r, budgetMs: 30 });
      expect(isLegalMove(s, move)).toBe(true);
      s = applyMove(s, move);
    }
    expect(s.finished).toBe(true);
    expect(s.winner === BLACK || s.winner === WHITE || s.winner === 0).toBe(true);
    if (s.winner !== 0) expect(s.line.length).toBeGreaterThanOrEqual(WIN_LENGTH);
  });

  it('つよいはふつうに勝ち越す', () => {
    // 先手を入れ替えて4局。読むぶん「つよい」が強いことを確かめる
    let hardWins = 0;
    let normalWins = 0;
    for (let game = 0; game < 4; game += 1) {
      const hard: Player = game % 2 === 0 ? BLACK : WHITE;
      let s = initialState(BLACK);
      const r = seededRng(1000 + game);
      while (!s.finished) {
        const move = chooseMove(s, s.turn === hard ? 'hard' : 'normal', { rng: r, budgetMs: 60 });
        s = applyMove(s, move);
      }
      if (s.winner === hard) hardWins += 1;
      else if (s.winner === opponent(hard)) normalWins += 1;
    }
    expect(hardWins).toBeGreaterThan(normalWins);
  });
});
