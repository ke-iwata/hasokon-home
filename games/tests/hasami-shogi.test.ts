import { describe, expect, it } from 'vitest';
import {
  applyMove,
  capturingMoves,
  CELLS,
  chooseMove,
  DEFAULT_RULES,
  destinations,
  EMPTY,
  evaluate,
  GOTE,
  indexOf,
  initialState,
  legalMoves,
  MOVE_LIMIT,
  positionKey,
  resign,
  search,
  SENTE,
  threatened,
  undoIndex,
  type HasamiState,
  type Player,
  type Rules,
} from '@/lib/hasami-shogi';

/**
 * はさみ将棋のテスト。
 * 仕様: docs/features/game-hasami-shogi.md の「テスト」の 10 ケースを #1〜#10 として固定する。
 *
 * 局面は文字列で書く（`x` = 先手、`o` = 後手、`.` = 空き。上が行 0）。
 */

function board(rows: readonly string[]): Int8Array {
  const b = new Int8Array(CELLS);
  rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      b[indexOf(r, c)] = ch === 'x' ? SENTE : ch === 'o' ? GOTE : EMPTY;
    });
  });
  return b;
}

function stateOf(rows: readonly string[], turn: Player = SENTE, rules: Rules = DEFAULT_RULES): HasamiState {
  const b = board(rows);
  return { ...initialState(rules), board: b, turn, seen: { [positionKey(b, turn)]: 1 } };
}

const at = indexOf;

describe('初期配置と動き', () => {
  it('先手は下の一段目、後手は上の一段目に 9 枚ずつ', () => {
    const s = initialState();
    for (let c = 0; c < 9; c += 1) {
      expect(s.board[at(8, c)]).toBe(SENTE);
      expect(s.board[at(0, c)]).toBe(GOTE);
    }
    expect([...s.board].filter((v) => v !== EMPTY)).toHaveLength(18);
    expect(s.turn).toBe(SENTE);
  });

  it('縦横に何マスでも動けて、駒は飛び越えない。斜めは不可', () => {
    const s = stateOf([
      '.........',
      '.........',
      '....o....',
      '.........',
      '..x.x....',
      '.........',
      '.........',
      '.........',
      '.........',
    ]);
    const to = destinations(s.board, at(4, 4)).sort((a, b) => a - b);
    expect(to).toEqual(
      [at(3, 4), at(4, 3), at(4, 5), at(4, 6), at(4, 7), at(4, 8), at(5, 4), at(6, 4), at(7, 4), at(8, 4)].sort(
        (a, b) => a - b,
      ),
    );
    expect(to).not.toContain(at(3, 3));
  });

  it('初期局面の合法手は、1 枚につき縦に 7 マス（左右は隣の駒でふさがっている）', () => {
    expect(legalMoves(initialState().board, SENTE)).toHaveLength(9 * 7);
  });

  it('手番でない駒・動けない先には指せない（局面はそのまま）', () => {
    const s = initialState();
    expect(applyMove(s, { from: at(0, 0), to: at(1, 0) })).toBe(s);
    expect(applyMove(s, { from: at(8, 0), to: at(7, 1) })).toBe(s);
  });
});

describe('取り（仕様書のテスト #1〜#5・#7・#8）', () => {
  it('#1 自・相・（空）で、空に自分が動くと相手 1 枚を取る', () => {
    const s = stateOf([
      '.........',
      '.........',
      '.........',
      '.........',
      'xo.......',
      '..x......',
      '.........',
      '.........',
      '.........',
    ]);
    const next = applyMove(s, { from: at(5, 2), to: at(4, 2) });
    expect(next.board[at(4, 1)]).toBe(EMPTY);
    expect(next.captured.sente).toBe(1);
    expect(next.last?.captured).toEqual([at(4, 1)]);
    expect(next.last?.partners.sort((a, b) => a - b)).toEqual([at(4, 0), at(4, 2)]);
  });

  it('#2 自・相・相・（空）で、空に自分が動くと相手 2 枚を取る', () => {
    const s = stateOf([
      '.........',
      '.........',
      '.........',
      '.........',
      'xoo......',
      '...x.....',
      '.........',
      '.........',
      '.........',
    ]);
    const next = applyMove(s, { from: at(5, 3), to: at(4, 3) });
    expect(next.board[at(4, 1)]).toBe(EMPTY);
    expect(next.board[at(4, 2)]).toBe(EMPTY);
    expect(next.captured.sente).toBe(2);
  });

  it('途中に空きがあると取れない（自・相・空・自）', () => {
    const s = stateOf([
      '.........',
      '.........',
      '.........',
      '.........',
      'xo.......',
      '...x.....',
      '.........',
      '.........',
      '.........',
    ]);
    const next = applyMove(s, { from: at(5, 3), to: at(4, 3) });
    expect(next.captured.sente).toBe(0);
    expect(next.board[at(4, 1)]).toBe(GOTE);
  });

  it('#3 相・（空）・相 の空に自分から入っても取られない（ルール 4）', () => {
    const s = stateOf([
      '.........',
      '.........',
      '.........',
      '.........',
      'o.o......',
      '.x.......',
      '.........',
      '.........',
      '.........',
    ]);
    const next = applyMove(s, { from: at(5, 1), to: at(4, 1) });
    expect(next.board[at(4, 1)]).toBe(SENTE);
    expect(next.captured.gote).toBe(0);
    // 相手がほかの駒を動かしても、入った駒は取られない（取りは動かした駒のまわりだけを見る）
    const after = applyMove(next, { from: at(4, 0), to: at(3, 0) });
    expect(after.board[at(4, 1)]).toBe(SENTE);
  });

  it('#4 隅の相手の駒の隣 2 マスをふさぐと取る（隅取り「あり」）。「なし」なら取らない', () => {
    const rows = [
      'ox.......',
      '.........',
      '.x.......',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    ];
    const move = { from: at(2, 1), to: at(2, 0) };
    // まず 1 段上がって隣に来る（2,0 → 1,0 は縦の移動）
    const s = stateOf(rows);
    const step = applyMove(s, move);
    expect(step.captured.sente).toBe(0);
    const withCorner = applyMove({ ...step, turn: SENTE }, { from: at(2, 0), to: at(1, 0) });
    expect(withCorner.board[at(0, 0)]).toBe(EMPTY);
    expect(withCorner.captured.sente).toBe(1);
    expect(withCorner.last?.partners.sort((a, b) => a - b)).toEqual([at(0, 1), at(1, 0)]);

    const noCornerRules: Rules = { ...DEFAULT_RULES, corner: false };
    const s2 = stateOf(rows, SENTE, noCornerRules);
    const step2 = applyMove(s2, move);
    const without = applyMove({ ...step2, turn: SENTE }, { from: at(2, 0), to: at(1, 0) });
    expect(without.board[at(0, 0)]).toBe(GOTE);
    expect(without.captured.sente).toBe(0);
  });

  it('隅取りは 4 隅どれでも効く', () => {
    const s = stateOf([
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '........x',
      '......x.o',
    ]);
    const next = applyMove(s, { from: at(8, 6), to: at(8, 7) });
    expect(next.board[at(8, 8)]).toBe(EMPTY);
    expect(next.captured.sente).toBe(1);
  });

  it('#5 縦と横の 2 方向を同時にはさむ手は両方取る', () => {
    const s = stateOf([
      '.........',
      '.........',
      '....x....',
      '....o....',
      '..xo.....',
      '....x....',
      '.........',
      '.........',
      '.........',
    ]);
    // (4,4) に入ると、上の o(3,4) を x(2,4) と、左の o(4,3) を x(4,2) とではさむ
    const next = applyMove(s, { from: at(5, 4), to: at(4, 4) });
    expect(next.board[at(3, 4)]).toBe(EMPTY);
    expect(next.board[at(4, 3)]).toBe(EMPTY);
    expect(next.captured.sente).toBe(2);
  });

  it('#7 相手 2 枚がふさいでいる隅にいる自分の駒は、相手がふさぎ以外の駒を動かしても取られない（ルール 4 は隅取りにも効く）', () => {
    // 縦横の動きでは、2 枚でふさがれた隅へ「入る」手そのものは指せない（通り道が隣の 2 マスしか無い）。
    // そこで「自分の駒が隅にいて、相手 2 枚がすでにふさいでいる」局面を組み、取られないことを確かめる。
    // 取りは動かした駒のまわりだけを見るので、ふさぎの駒が動いていなければ隅取りは起きない
    const s = stateOf(
      [
        'xo.......',
        'o........',
        '.........',
        '.........',
        '.........',
        '.........',
        '......o..',
        '.........',
        '.........',
      ],
      GOTE,
    );
    const quiet = applyMove(s, { from: at(6, 6), to: at(6, 7) });
    expect(quiet.board[at(0, 0)]).toBe(SENTE);
    expect(quiet.captured.gote).toBe(0);
  });

  it('#7 片側を相手がふさいだ隅に自分から入った手では取られない', () => {
    const s = stateOf([
      '.o.......',
      '.........',
      '.........',
      '.........',
      'x........',
      '.........',
      '.........',
      '.........',
      '.........',
    ]);
    const entered = applyMove(s, { from: at(4, 0), to: at(0, 0) });
    expect(entered.board[at(0, 0)]).toBe(SENTE);
    expect(entered.captured.gote).toBe(0);
  });

  it('#8 自・相・（盤の端）の形（隅ではない端）では取れない', () => {
    // (4,8) の o を、左に来た x(4,7) と右の盤の端ではさむ形。端は自分の駒の代わりにならない
    const s = stateOf([
      '.........',
      '.........',
      '.........',
      '.........',
      '........o',
      '.......x.',
      '.........',
      '.........',
      '.........',
    ]);
    const next = applyMove(s, { from: at(5, 7), to: at(4, 7) });
    expect(next.board[at(4, 8)]).toBe(GOTE);
    expect(next.captured.sente).toBe(0);
  });
});

describe('勝敗（仕様書のテスト #6・#9・#10）', () => {
  const nearFive = (rules: Rules = DEFAULT_RULES): HasamiState => ({
    ...stateOf(
      [
        '....ooooo',
        '.........',
        '.........',
        '.........',
        'xo.......',
        '..x......',
        '.........',
        '.........',
        '....xxxxx',
      ],
      SENTE,
      rules,
    ),
    captured: { sente: 4, gote: 0 },
  });

  it('#6 5 枚目を取った手で勝ち（勝ちの枚数 5 のとき）', () => {
    const next = applyMove(nearFive(), { from: at(5, 2), to: at(4, 2) });
    expect(next.captured.sente).toBe(5);
    expect(next.finished).toBe(true);
    expect(next.winner).toBe(SENTE);
    expect(next.reason).toBe('captures');
  });

  it('勝ちの枚数「全部」では 5 枚目では終わらず、9 枚目で勝ち', () => {
    const rules: Rules = { ...DEFAULT_RULES, win: 'all' };
    const next = applyMove(nearFive(rules), { from: at(5, 2), to: at(4, 2) });
    expect(next.finished).toBe(false);
    const last = stateOf(
      ['.........', '.........', '.........', '.........', 'xo.......', '..x......', '.........', '.........', '.........'],
      SENTE,
      rules,
    );
    const won = applyMove({ ...last, captured: { sente: 8, gote: 3 } }, { from: at(5, 2), to: at(4, 2) });
    expect(won.finished).toBe(true);
    expect(won.winner).toBe(SENTE);
  });

  it('勝ちの枚数「3枚差」は、差が 3 になった手で勝ち', () => {
    const rules: Rules = { ...DEFAULT_RULES, win: 'diff3' };
    const base = nearFive(rules);
    const two = applyMove({ ...base, captured: { sente: 3, gote: 2 } }, { from: at(5, 2), to: at(4, 2) });
    expect(two.finished).toBe(false);
    const three = applyMove({ ...base, captured: { sente: 4, gote: 2 } }, { from: at(5, 2), to: at(4, 2) });
    expect(three.finished).toBe(true);
    expect(three.winner).toBe(SENTE);
  });

  it('#9 200 手目を指し終えたら、取った枚数が多いほうの勝ち／同数なら引き分け', () => {
    const s = initialState();
    const at199 = { ...s, ply: MOVE_LIMIT - 1 };
    const more = applyMove({ ...at199, captured: { sente: 2, gote: 1 } }, { from: at(8, 0), to: at(7, 0) });
    expect(more.ply).toBe(MOVE_LIMIT);
    expect(more.finished).toBe(true);
    expect(more.reason).toBe('limit');
    expect(more.winner).toBe(SENTE);

    const fewer = applyMove({ ...at199, captured: { sente: 1, gote: 3 } }, { from: at(8, 0), to: at(7, 0) });
    expect(fewer.winner).toBe(GOTE);

    const even = applyMove({ ...at199, captured: { sente: 2, gote: 2 } }, { from: at(8, 0), to: at(7, 0) });
    expect(even.finished).toBe(true);
    expect(even.winner).toBe(0);

    const before = applyMove({ ...s, ply: MOVE_LIMIT - 2 }, { from: at(8, 0), to: at(7, 0) });
    expect(before.finished).toBe(false);
  });

  it('#10 駒の配置と手番が同じ局面が 4 回目で引き分け。配置が同じでも手番が違えば数えない', () => {
    // 双方が 1 枚ずつ行って戻るのを繰り返す。初期局面（先手番）が 1・3・5・7 手目のあとで…ではなく、
    // 4 手で 1 周して初期局面（先手番）に戻る。1 回目は対局の始まり
    const cycle = [
      { from: at(8, 0), to: at(7, 0) },
      { from: at(0, 8), to: at(1, 8) },
      { from: at(7, 0), to: at(8, 0) },
      { from: at(1, 8), to: at(0, 8) },
    ];
    let s = initialState();
    const start = positionKey(s.board, SENTE);
    for (let lap = 1; lap <= 3; lap += 1) {
      for (const [i, m] of cycle.entries()) {
        s = applyMove(s, m);
        const last = lap === 3 && i === cycle.length - 1;
        expect(s.finished).toBe(last);
      }
    }
    expect(s.seen[start]).toBe(4);
    expect(s.reason).toBe('repetition');
    expect(s.winner).toBe(0);
  });

  it('#10 手番だけが違う同じ配置は、別の局面として数える', () => {
    const s = initialState();
    const b = s.board;
    expect(positionKey(b, SENTE)).not.toBe(positionKey(b, GOTE));
    // 後手番で初期配置になる局面を 3 回作っても（先手番の初期局面は 1 回のまま）終わらない
    const seen = { [positionKey(b, SENTE)]: 1, [positionKey(b, GOTE)]: 3 };
    // 1 手指して戻ると、先手番の初期配置が 2 回目になるだけ
    let t: HasamiState = { ...s, seen };
    t = applyMove(t, { from: at(8, 0), to: at(7, 0) });
    t = applyMove(t, { from: at(0, 8), to: at(1, 8) });
    t = applyMove(t, { from: at(7, 0), to: at(8, 0) });
    t = applyMove(t, { from: at(1, 8), to: at(0, 8) });
    expect(t.finished).toBe(false);
    expect(t.seen[positionKey(b, SENTE)]).toBe(2);
  });

  it('動ける手が無くなった側が出たら、取った枚数で決める', () => {
    // 後手の駒は隅の 1 枚だけで、隣 2 マスを先手がふさいでいる（隅取り「なし」なので取られずに残る）
    const rules: Rules = { corner: false, win: 'all' };
    const s = stateOf(
      ['o........', '.........', 'x........', '.........', '.........', '.........', '.........', '.........', '.x.......'],
      SENTE,
      rules,
    );
    const step = applyMove({ ...s, captured: { sente: 8, gote: 0 } }, { from: at(2, 0), to: at(1, 0) });
    expect(step.finished).toBe(false);
    const stuck = applyMove({ ...step, turn: SENTE }, { from: at(8, 1), to: at(0, 1) });
    expect(stuck.finished).toBe(true);
    expect(stuck.reason).toBe('stuck');
    expect(stuck.winner).toBe(SENTE);
  });

  it('投了した側の負け', () => {
    const s = resign(initialState(), SENTE);
    expect(s.finished).toBe(true);
    expect(s.winner).toBe(GOTE);
    expect(s.reason).toBe('resign');
  });
});

describe('待った', () => {
  it('自分が最後に指す直前まで戻る（あいだの CPU の手も一緒に戻る）', () => {
    const h: HasamiState[] = [initialState()];
    h.push(applyMove(h[0], { from: at(8, 0), to: at(7, 0) }));
    h.push(applyMove(h[1], { from: at(0, 8), to: at(1, 8) }));
    expect(undoIndex(h, SENTE)).toBe(0);
    expect(undoIndex(h.slice(0, 1), SENTE)).toBeNull();
    // 後手のとき、CPU の初手だけでは戻れない
    expect(undoIndex(h.slice(0, 2), GOTE)).toBeNull();
    expect(undoIndex(h, GOTE)).toBe(1);
  });
});

describe('評価と CPU', () => {
  const capturable = stateOf([
    '....o....',
    '.........',
    '.........',
    '.........',
    'xo.......',
    '..x......',
    '.........',
    '.........',
    '........x',
  ]);

  it('はさまれそうな駒と、はさめる手を数える', () => {
    expect([...threatened(capturable.board, GOTE, DEFAULT_RULES)]).toEqual([at(4, 1)]);
    // 先手から見て：はさめる手がある（+5 以上）、取られそうな駒は無い
    expect(evaluate(capturable.board, SENTE, capturable.captured, DEFAULT_RULES)).toBeGreaterThan(0);
    expect(evaluate(capturable.board, GOTE, capturable.captured, DEFAULT_RULES)).toBeLessThan(0);
  });

  it('評価関数の速い数え方は、threatened / capturingMoves の数え方と一致する', () => {
    let s = initialState();
    let seed = 7;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 120 && !s.finished; i += 1) {
      for (const p of [SENTE, GOTE] as const) {
        const diff = s.captured[p === SENTE ? 'sente' : 'gote'] - s.captured[p === SENTE ? 'gote' : 'sente'];
        const slow =
          diff * 100 - threatened(s.board, p, s.rules).size * 30 + capturingMoves(s.board, p, s.rules).length * 5;
        expect(evaluate(s.board, p, s.captured, s.rules)).toBe(slow);
      }
      s = applyMove(s, chooseMove(s, 'easy', { rng })!);
    }
  });

  it('取った枚数の差が 1 枚で 100 点動く', () => {
    const b = board(['.........', '.........', '.........', '.........', '....x....', '.........', '.........', '.........', '....o....']);
    const even = evaluate(b, SENTE, { sente: 0, gote: 0 }, DEFAULT_RULES);
    expect(evaluate(b, SENTE, { sente: 1, gote: 0 }, DEFAULT_RULES) - even).toBe(100);
  });

  it('ふつう・つよいは、取れる駒を取る', () => {
    for (const level of ['normal', 'hard'] as const) {
      const move = chooseMove(capturable, level, { rng: () => 0 });
      const next = applyMove(capturable, move!);
      expect(next.captured.sente, level).toBe(1);
    }
  });

  it('かんたんは、でたらめでないときは一番多く取れる手を指す', () => {
    // rng が 0.99 なら「でたらめ」の分岐に入らない
    const move = chooseMove(capturable, 'easy', { rng: () => 0.99 });
    expect(applyMove(capturable, move!).captured.sente).toBe(1);
  });

  it('つよいは、取られそうな駒を逃がす（相手の次の手で取られる形を避ける）', () => {
    // 先手 x(4,1) は、後手が (4,2) に入ると o(4,0) とではさまれる。先手番
    const s = stateOf([
      '.........',
      '.........',
      '..o......',
      '.........',
      'ox.......',
      '.........',
      '.........',
      '.........',
      '........x',
    ]);
    const move = chooseMove(s, 'hard', { rng: () => 0 })!;
    const next = applyMove(s, move);
    expect(threatened(next.board, SENTE, DEFAULT_RULES).size).toBe(0);
  });

  it('つよいは時間の上限で打ち切り、読み終えた最深の結果を指す（深さ 1 は必ず読み終える）', () => {
    let t = 0;
    const now = () => (t += 1);
    const r = search(initialState(), 'hard', { budgetMs: 0, now, rng: () => 0 });
    expect(r.depth).toBe(1);
    expect(r.move).not.toBeNull();
    const full = search(capturable, 'hard', { budgetMs: 1e9, rng: () => 0 });
    expect(full.depth).toBeGreaterThanOrEqual(1);
    expect(full.depth).toBeLessThanOrEqual(4);
  });

  it('つよいは、初期局面でも 1 秒の上限を大きく超えない', () => {
    const t0 = performance.now();
    const r = search(initialState(), 'hard', { rng: () => 0 });
    expect(r.move).not.toBeNull();
    expect(performance.now() - t0).toBeLessThan(2500);
  });

  it('終わった局面・指せる手が無い局面では null', () => {
    expect(chooseMove(resign(initialState(), SENTE), 'hard')).toBeNull();
  });

  it('CPU 同士で指し続けても、必ず終局する（200 手・千日手・勝ちのどれか）', () => {
    let s = initialState();
    let seed = 1;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    while (!s.finished) {
      const move = chooseMove(s, 'easy', { rng });
      if (!move) break;
      s = applyMove(s, move);
    }
    expect(s.finished).toBe(true);
    expect(s.ply).toBeLessThanOrEqual(MOVE_LIMIT);
    // 駒の数の不変条件：盤の上の駒 + 取られた駒 = 18
    const onBoard = [...s.board].filter((v) => v !== EMPTY).length;
    expect(onBoard + s.captured.sente + s.captured.gote).toBe(18);
  });
});
