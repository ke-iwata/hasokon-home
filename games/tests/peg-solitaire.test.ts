import { describe, expect, it } from 'vitest';
import {
  applyJump,
  bitOf,
  BOARDS,
  canJump,
  countMoves,
  DAILY_FALLBACKS,
  DAILY_VERSION,
  dailyPuzzle,
  ENGLISH_CENTER,
  ENGLISH_MIN_MOVES,
  firstMoveDeadEnds,
  fromPegs,
  hasPeg,
  hint,
  initialState,
  isDoomed,
  isOver,
  KNOWN_ENGLISH_SOLUTION,
  legalJumps,
  NO_SELECTION,
  pegsOf,
  remaining,
  reverseScramble,
  selectionAfterJump,
  shareText,
  solve,
  stateKey,
  tap,
  TRIANGLE_INNER,
  withPeg,
  type Jump,
  type PegState,
} from '@/lib/peg-solitaire';
import { dailySeed, mulberry32 } from '@/lib/daily';

const E = BOARDS.english;
const T = BOARDS.triangle;

/** 英国式の行・列から穴の番号 */
function at(r: number, c: number): number {
  const i = E.coords.findIndex((p) => p.r === r && p.c === c);
  if (i < 0) throw new Error(`no hole ${r},${c}`);
  return i;
}

function jumpOf(from: number, to: number, board = E): Jump {
  const j = board.jumpsFrom[from].find((x) => x.to === to);
  if (!j) throw new Error(`no jump ${from}->${to}`);
  return j;
}

function play(board: typeof E, s: PegState, path: readonly Jump[]): PegState {
  return path.reduce((acc, j) => applyJump(board, acc, j).state, s);
}

describe('盤', () => {
  it('英国式は 33 穴・中央が 16・最後の穴（番号 32）が右下の腕の端', () => {
    expect(E.holes).toBe(33);
    expect(E.coords[ENGLISH_CENTER]).toEqual({ r: 3, c: 3 });
    expect(E.coords[32]).toEqual({ r: 6, c: 4 });
    expect(remaining(initialState(E))).toBe(32);
  });

  it('三角は 15 穴で、角を 1 つ空けて 14 本から始める', () => {
    expect(T.holes).toBe(15);
    expect(remaining(initialState(T))).toBe(14);
    expect(hasPeg(initialState(T), 0)).toBe(false);
  });
});

describe('跳ぶ判定', () => {
  it('跳べるのは「隣が駒・その向こうが空」のときだけ', () => {
    const c = ENGLISH_CENTER;
    // 中央の右 2 つ（3,5）から中央へ
    const j = jumpOf(at(3, 5), c);
    expect(j.over).toBe(at(3, 4));
    expect(canJump(initialState(E), j)).toBe(true);
    // 隣が空なら跳べない
    expect(canJump(withPeg(initialState(E), at(3, 4), false), j)).toBe(false);
    // 行き先が埋まっていれば跳べない
    expect(canJump(withPeg(initialState(E), c, true), j)).toBe(false);
  });

  it('英国式の初期局面で跳べるのは中央へ向かう 4 手だけ（斜めは無い）', () => {
    const js = legalJumps(E, initialState(E));
    expect(js).toHaveLength(4);
    expect(js.every((j) => j.to === ENGLISH_CENTER)).toBe(true);
    for (const j of E.jumps) {
      const a = E.coords[j.from];
      const b = E.coords[j.to];
      expect(a.r === b.r || a.c === b.c).toBe(true);
    }
  });

  it('三角盤は 6 方向に跳べる', () => {
    // 中ほどの穴（行 4 の中央 = 12）から：左・右・上の 2 方向（真上と左上）
    const dirs = new Set<string>();
    for (const j of T.jumps) {
      const a = T.coords[j.from];
      const b = T.coords[j.to];
      dirs.add(`${(b.r - a.r) / 2},${(b.c - a.c) / 2}`);
    }
    expect([...dirs].sort()).toEqual(['-1,-1', '-1,0', '0,-1', '0,1', '1,0', '1,1'].sort());
    // 角の空きへは、2 方向から跳び込める
    expect(legalJumps(T, initialState(T)).map((j) => j.to)).toEqual([0, 0]);
  });

  it('跳べない手を applyJump に渡すと投げる', () => {
    expect(() => applyJump(E, initialState(E), jumpOf(at(0, 2), at(2, 2)))).toThrow();
  });

  it('どの局面でも「駒の数 ＝ 初期の駒 − 跳んだ回数」（乱数を固定して 1,000 局）', () => {
    const rng = mulberry32(42);
    for (let g = 0; g < 1000; g++) {
      const board = g % 2 === 0 ? E : T;
      let s = initialState(board);
      const start = remaining(s);
      let n = 0;
      for (;;) {
        const js = legalJumps(board, s);
        if (js.length === 0) break;
        s = applyJump(board, s, js[Math.floor(rng() * js.length)]).state;
        n++;
        expect(remaining(s)).toBe(start - n);
      }
      expect(isOver(board, s)).toBe(true);
    }
  });
});

describe('33 番目の穴（番号 32。hi 側）', () => {
  it('bitOf は 32 以降を hi に置く', () => {
    expect(bitOf(31)).toEqual({ word: 'lo', mask: 0x80000000 });
    expect(bitOf(32)).toEqual({ word: 'hi', mask: 1 });
    const s = fromPegs([0, 32]);
    expect(s).toEqual({ lo: 1, hi: 1 });
    expect(hasPeg(s, 32)).toBe(true);
    expect(hasPeg(s, 0)).toBe(true);
    expect(remaining(s)).toBe(2);
  });

  it('番号 32 の駒が跳ぶ', () => {
    const s = fromPegs([32, at(5, 4)]);
    const r = applyJump(E, s, jumpOf(32, at(4, 4)));
    expect(pegsOf(E, r.state)).toEqual([at(4, 4)]);
    expect(r.state.hi).toBe(0);
  });

  it('番号 32 は越えられない隅の穴なので、取られる跳びは盤に無い（取る側としては 31 を取る）', () => {
    // (6,4) の両隣は (6,3) と (5,4) だけ。反対側に穴が無いので、32 を越える跳びは作られない
    expect(E.jumps.filter((j) => j.over === 32)).toHaveLength(0);
    const s = fromPegs([32, 31]);
    const r = applyJump(E, s, jumpOf(32, 30));
    expect(pegsOf(E, r.state)).toEqual([30]);
    expect(r.over).toBe(31);
    expect(r.state.hi).toBe(0);
  });

  it('番号 32 の駒は、ほかの駒が跳んでも消えない（lo と hi の取り違えが無い）', () => {
    // lo の 0 番が動き 1 番が消えるとき、hi の 1 ビット目（= 32）を消していないか
    const s = fromPegs([0, 1, 32]);
    const r = applyJump(E, s, jumpOf(0, 2));
    expect(hasPeg(r.state, 32)).toBe(true);
    expect(remaining(r.state)).toBe(2);
  });

  it('番号 32 が行き先になる', () => {
    const s = fromPegs([30, 31]);
    const r = applyJump(E, s, jumpOf(30, 32));
    expect(pegsOf(E, r.state)).toEqual([32]);
    expect(r.state).toEqual({ lo: 0, hi: 1 });
  });

  it('メモのキーは lo / hi の違う局面で衝突しない', () => {
    const a = fromPegs([0]); // lo=1, hi=0
    const b = fromPegs([32]); // lo=0, hi=1
    expect(stateKey(a)).not.toBe(stateKey(b));
    expect(stateKey(fromPegs([31]))).toBe(2 ** 31);
    expect(stateKey(fromPegs([31, 32]))).toBe(2 ** 32 + 2 ** 31);
    expect(stateKey(initialState(E))).toBe(2 ** 33 - 1 - 2 ** ENGLISH_CENTER);
  });

  it('解き手が 32 を含む局面を解ける', () => {
    const r2 = solve(E, fromPegs([31, 32]), { goal: 30 });
    expect(r2).toEqual([jumpOf(32, 30)]);
  });
});

describe('手数', () => {
  it('同じ駒で 3 回跳んだら 1 手、別の駒をはさむと 2 手', () => {
    const a = { from: 0, over: 1, to: 2 };
    const b = { from: 2, over: 5, to: 10 };
    const c = { from: 10, over: 11, to: 12 };
    expect(countMoves([a, b, c])).toBe(1);
    const other = { from: 20, over: 21, to: 22 };
    expect(countMoves([a, other, { from: 22, over: 15, to: 8 }])).toBe(2);
    expect(countMoves([a, other, { from: 2, over: 9, to: 16 }])).toBe(3);
    expect(countMoves([])).toBe(0);
  });
});

describe('英国式の既知の 18 手', () => {
  it('再生すると中央に 1 本残り、countMoves が 18', () => {
    const s = play(E, initialState(E), KNOWN_ENGLISH_SOLUTION);
    expect(pegsOf(E, s)).toEqual([ENGLISH_CENTER]);
    expect(KNOWN_ENGLISH_SOLUTION).toHaveLength(31);
    expect(countMoves(KNOWN_ENGLISH_SOLUTION)).toBe(ENGLISH_MIN_MOVES);
    expect(ENGLISH_MIN_MOVES).toBe(18);
  });

  it('手順をたどっている間は、ヒントがその次の手を返す（駒が 17 本以上でも）', () => {
    let s = initialState(E);
    for (let i = 0; i < KNOWN_ENGLISH_SOLUTION.length; i++) {
      const h = hint('english', s, KNOWN_ENGLISH_SOLUTION.slice(0, i));
      expect(h).toEqual({ kind: 'jump', jump: KNOWN_ENGLISH_SOLUTION[i] });
      s = applyJump(E, s, KNOWN_ENGLISH_SOLUTION[i]).state;
    }
  });

  it('手順から外れて駒が 17 本以上なら「あと◯本」', () => {
    const first = legalJumps(E, initialState(E)).find((j) => j.from !== KNOWN_ENGLISH_SOLUTION[0].from)!;
    const s = applyJump(E, initialState(E), first).state;
    expect(hint('english', s, [first])).toEqual({ kind: 'too-many', need: 31 - 16 });
  });

  it('今日の 1 問（同じ英国式の盤）では、既知の手順をヒントに使わない', () => {
    expect(hint('daily', initialState(E), [])).toEqual({ kind: 'too-many', need: 16 });
  });
});

describe('解き手のゴール', () => {
  // ゴールの穴以外にだけ 1 本残せる局面：(3,1)(3,2) の 2 本。(3,1) が (3,2) を越えて (3,3) へ、で 1 本残る。
  // 逆向き（(3,2) が (3,1) を越えて (3,0)）でも残せるので、どこでも 1 本は届く。(0,2) には届かない
  const s = fromPegs([at(3, 1), at(3, 2)]);
  const goal = at(0, 2);

  it('ヒント（どこでも 1 本）は出るが、日替わりの判定（ゴールの穴で 1 本）では届かない側に数える', () => {
    const h = hint('daily', s, []);
    expect(h.kind).toBe('jump');
    expect(solve(E, s, { goal })).toBeNull();
    // 最初の手（2 つ）は、どちらもゴールの穴に届かない
    expect(firstMoveDeadEnds(E, s, goal)).toEqual({ dead: 2, total: 2 });
  });

  it('詰みの予告（どこでも 1 本）は出ない', () => {
    expect(isDoomed(E, s)).toBe(false);
    // 離れた 2 本は詰み
    expect(isDoomed(E, fromPegs([at(0, 2), at(6, 4)]))).toBe(true);
  });

  it('駒が 17 本以上なら詰みの予告は出さない（解き手を呼ばない）', () => {
    const many = fromPegs(Array.from({ length: 17 }, (_, i) => i));
    expect(isDoomed(E, many)).toBe(false);
  });
});

describe('タップ', () => {
  const s = initialState(E);
  const right = at(3, 5);

  it('跳べる駒を押すと選ぶ。光った穴を押すと跳ぶ', () => {
    expect(tap(E, s, NO_SELECTION, right)).toEqual({ kind: 'select', hole: right });
    expect(tap(E, s, { selected: right, chain: false }, ENGLISH_CENTER)).toEqual({
      kind: 'jump',
      jump: jumpOf(right, ENGLISH_CENTER),
    });
  });

  it('跳べない駒・空の穴を押しても何もしない', () => {
    expect(tap(E, s, NO_SELECTION, at(0, 2))).toEqual({ kind: 'none' });
    expect(tap(E, s, NO_SELECTION, ENGLISH_CENTER)).toEqual({ kind: 'none' });
  });

  it('手の最初で跳べる先が 1 つだけなら、同じ駒の 2 回目のタップで跳ぶ', () => {
    expect(tap(E, s, { selected: right, chain: false }, right)).toEqual({
      kind: 'jump',
      jump: jumpOf(right, ENGLISH_CENTER),
    });
  });

  it('跳べる先が 2 つ以上なら、同じ駒の 2 回目のタップで選択を外す', () => {
    // (3,3) の駒が左右どちらにも跳べる局面
    const two = fromPegs([at(3, 3), at(3, 2), at(3, 4)]);
    expect(tap(E, two, { selected: at(3, 3), chain: false }, at(3, 3))).toEqual({ kind: 'deselect' });
  });

  it('連続跳びの最中に選んでいる駒を押すと、跳ばずに手が締まる', () => {
    // (3,1)→(3,3) と跳んだ直後、(3,3) からは (3,5) へ 1 つだけ跳べる
    const before = fromPegs([at(3, 1), at(3, 2), at(3, 4)]);
    const j = jumpOf(at(3, 1), at(3, 3));
    const after = applyJump(E, before, j).state;
    const sel = selectionAfterJump(E, after, j);
    expect(sel).toEqual({ selected: at(3, 3), chain: true });
    expect(tap(E, after, sel, at(3, 3))).toEqual({ kind: 'deselect' });
    // 光った穴を押せば続けて跳ぶ
    expect(tap(E, after, sel, at(3, 5))).toEqual({ kind: 'jump', jump: jumpOf(at(3, 3), at(3, 5)) });
  });

  it('続けて跳べなければ、跳んだあと選択を外す', () => {
    const j = jumpOf(right, ENGLISH_CENTER);
    expect(selectionAfterJump(E, applyJump(E, s, j).state, j)).toEqual(NO_SELECTION);
  });

  it('連続跳びの最中に別の跳べる駒を押すと、その駒に切り替わる', () => {
    const b = fromPegs([at(3, 1), at(3, 2), at(3, 4), at(0, 2), at(1, 2)]);
    const j = jumpOf(at(3, 1), at(3, 3));
    const after = applyJump(E, b, j).state;
    expect(tap(E, after, selectionAfterJump(E, after, j), at(0, 2))).toEqual({ kind: 'select', hole: at(0, 2) });
  });
});

describe('三角 15 穴', () => {
  it('角から始めると、同じ角で 1 本残しに解ける', () => {
    const r = solve(T, initialState(T), { goal: 0 });
    expect(Array.isArray(r)).toBe(true);
    const end = play(T, initialState(T), r as Jump[]);
    expect(pegsOf(T, end)).toEqual([0]);
  });

  it('中央の 3 穴から始めて同じ穴をゴールにすると null', () => {
    for (const h of TRIANGLE_INNER) {
      const s = fromPegs(Array.from({ length: 15 }, (_, i) => i).filter((i) => i !== h));
      expect(solve(T, s, { goal: h })).toBeNull();
    }
  });
});

describe('解き手の時間', () => {
  it('駒 16 本以下の局面で 50ms 以内に答えを返す', () => {
    // 既知の手順を 16 本になるまで進めた局面
    const s = play(E, initialState(E), KNOWN_ENGLISH_SOLUTION.slice(0, 16));
    expect(remaining(s)).toBe(16);
    const t0 = performance.now();
    const r = solve(E, s, { deadlineMs: 50 });
    expect(performance.now() - t0).toBeLessThan(200); // CI の揺れを見込む（打ち切りは deadline で確かめる）
    expect(r).not.toBe('timeout');
    expect(Array.isArray(r)).toBe(true);
  });

  it('時計を差し替えると打ち切って timeout を返す', () => {
    let t = 0;
    const now = () => (t += 100);
    // 32 本の初期局面で角をゴールにすると、探索は 512 手では終わらない
    expect(solve(E, initialState(E), { goal: 0, deadlineMs: 10, now })).toBe('timeout');
    const top = fromPegs(Array.from({ length: 16 }, (_, i) => i));
    expect(hint('daily', top, [], { deadlineMs: 10, now })).toEqual({ kind: 'timeout' });
    // 詰みの予告は時間切れなら何も出さない
    expect(isDoomed(E, top, { deadlineMs: 10, now })).toBe(false);
  });
});

describe('今日の 1 問', () => {
  const seedOf = (key: string) => dailySeed(key, DAILY_VERSION);

  it('同じ日なら同じ局面', () => {
    expect(dailyPuzzle(seedOf('2026-10-21'))).toEqual(dailyPuzzle(seedOf('2026-10-21')));
    expect(dailyPuzzle(seedOf('2026-10-21'))).not.toEqual(dailyPuzzle(seedOf('2026-10-22')));
  });

  it('逆の跳びで作った局面の駒は 10〜14 本で、ゴールの穴で必ず解ける', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = mulberry32(seed);
      const goal = seed % 33;
      const count = 9 + (seed % 5);
      const s = reverseScramble(E, goal, count, rng);
      if (!s) continue;
      expect(remaining(s)).toBe(count + 1);
      const r = solve(E, s, { goal });
      expect(Array.isArray(r)).toBe(true);
      expect(pegsOf(E, play(E, s, r as Jump[]))).toEqual([goal]);
    }
  });

  it('DAILY_FALLBACKS の 7 つすべてがゴールの穴で 1 本残しに解け、最初の手の半分以上が届かない', () => {
    expect(DAILY_FALLBACKS).toHaveLength(7);
    for (const f of DAILY_FALLBACKS) {
      const s = fromPegs(f.pegs);
      expect(remaining(s)).toBeGreaterThanOrEqual(10);
      expect(remaining(s)).toBeLessThanOrEqual(14);
      const r = solve(E, s, { goal: f.goal });
      expect(Array.isArray(r)).toBe(true);
      const { dead, total } = firstMoveDeadEnds(E, s, f.goal);
      expect(dead * 2).toBeGreaterThanOrEqual(total);
    }
  });

  it(
    '2026〜2028 年の全日（1,096 日）で局面が出て、ゴールの穴で解け、予備に落ちる日が 0 日',
    () => {
      let relaxed = 0;
      let fallback = 0;
      const first = Date.UTC(2026, 0, 1);
      const days = (Date.UTC(2029, 0, 1) - first) / 86_400_000;
      expect(days).toBe(1096);
      for (let i = 0; i < days; i++) {
        const key = new Date(first + i * 86_400_000).toISOString().slice(0, 10);
        const p = dailyPuzzle(seedOf(key));
        const n = remaining(p.state);
        expect(n).toBeGreaterThanOrEqual(10);
        expect(n).toBeLessThanOrEqual(14);
        if (p.relaxed) relaxed++;
        if (p.fallback) fallback++;
        // 全日の解き直しは重いので、30 日おきに「解ける」「半分以上が届かない」を確かめる
        if (i % 30 === 0) {
          expect(Array.isArray(solve(E, p.state, { goal: p.goal }))).toBe(true);
          const { dead, total } = firstMoveDeadEnds(E, p.state, p.goal);
          expect(dead * 2).toBeGreaterThanOrEqual(total);
        }
      }
      // 実測では緩めた日も 0 日（2026-10-30）
      expect(relaxed).toBe(0);
      expect(fallback).toBe(0);
    },
    120_000,
  );

  it('共有文は日付と手数とURLだけ（局面は入れない）', () => {
    expect(shareText({ dateKey: '2026-10-21', moves: 9, url: 'https://hasokon.com/games/peg-solitaire/' })).toBe(
      'ペグ・ソリティア 今日の1問 2026-10-21 クリア（9手）\nhttps://hasokon.com/games/peg-solitaire/',
    );
  });
});
