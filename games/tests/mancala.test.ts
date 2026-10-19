import { describe, expect, it } from 'vitest';
import {
  applyMove,
  bestTurn,
  cpuMove,
  CPU_STORE,
  DAILY_VERSION,
  dailyCandidate,
  dailyPuzzle,
  DAILY_MIN_SOWS,
  DAILY_RELAXED_SOWS,
  FALLBACK_PUZZLES,
  finish,
  HARD_BUDGET_MS,
  initialState,
  isOver,
  legalMoves,
  MY_STORE,
  opposite,
  outcomeOf,
  playTurn,
  previewMove,
  readDailyProgress,
  shareText,
  sowPath,
  sowRaw,
  TOTAL_STONES,
  variantOf,
  writeDailyProgress,
  type Level,
  type MancalaState,
} from '@/lib/mancala';
import { dailySeed, mulberry32 } from '@/lib/daily';

/**
 * マンカラ（カラハ）のロジックのテスト。
 *
 * 仕様: docs/features/game-mancala.md の「テスト」
 */

const total = (s: MancalaState) => s.pits.reduce((a, b) => a + b, 0);

/** 盤を手で作る（自分の穴 0..5・自分のゴール・CPU の穴 7..12・CPU のゴール） */
function board(me: number[], myStore: number, cpu: number[], cpuStore: number, turn: 'me' | 'cpu' = 'me'): MancalaState {
  return { pits: [...me, myStore, ...cpu, cpuStore], turn };
}

describe('撒く', () => {
  it('初期局面は各穴 4 個・計 48 個', () => {
    const s = initialState('me');
    expect(total(s)).toBe(TOTAL_STONES);
    expect(TOTAL_STONES).toBe(48);
    expect(legalMoves(s)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(legalMoves(initialState('cpu'))).toEqual([7, 8, 9, 10, 11, 12]);
  });

  it('右隣から反時計回りに 1 個ずつ置く', () => {
    const s = initialState('me');
    expect(sowPath(s, 0)).toEqual([1, 2, 3, 4]);
    const r = applyMove(s, 0);
    expect(r.state.pits.slice(0, 7)).toEqual([0, 5, 5, 5, 5, 4, 0]);
    expect(r.state.turn).toBe('cpu');
  });

  it('13 個以上で一周するとき、相手のゴールを飛ばし、元の穴にも石を置く', () => {
    const s = board([0, 0, 13, 0, 0, 0], 0, [1, 1, 1, 1, 1, 1], 0);
    const path = sowPath(s, 2);
    expect(path).toHaveLength(13);
    expect(path).not.toContain(CPU_STORE);
    // 3..6・7..12（13 は飛ばす）・0..2 の 13 マス。最後は元の穴
    expect(path).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 0, 1, 2]);
    const r = applyMove(s, 2);
    expect(r.state.pits[CPU_STORE]).toBe(0);
    expect(total(r.state)).toBe(total(s));
  });

  it('CPU が撒くときは自分のゴールを飛ばす', () => {
    const s = board([1, 1, 1, 1, 1, 1], 0, [0, 0, 0, 0, 0, 14], 0, 'cpu');
    expect(sowPath(s, 12)).not.toContain(MY_STORE);
  });

  it('撒けない穴（空・相手の穴）は例外', () => {
    const s = board([0, 1, 1, 1, 1, 1], 0, [1, 1, 1, 1, 1, 1], 0);
    expect(() => applyMove(s, 0)).toThrow();
    expect(() => applyMove(s, 7)).toThrow();
  });
});

describe('もう 1 回', () => {
  it('最後の石が自分のゴールで止まれば、続けて撒ける', () => {
    const r = applyMove(initialState('me'), 2);
    expect(r.extraTurn).toBe(true);
    expect(r.state.turn).toBe('me');
  });

  it('2 回以上の連鎖も続けられる', () => {
    // 右端の 1 個 → その左の 2 個 → ……とつなげる
    const s = board([0, 0, 0, 3, 2, 1], 0, [1, 1, 1, 1, 1, 1], 0);
    let r = applyMove(s, 5);
    expect(r.extraTurn).toBe(true);
    r = applyMove(r.state, 4);
    expect(r.extraTurn).toBe(true);
    expect(r.state.turn).toBe('me');
    expect(r.state.pits[MY_STORE]).toBe(2);
  });

  it('CPU も自分のゴールで止まればもう 1 回', () => {
    const s = board([1, 1, 1, 1, 1, 1], 0, [1, 0, 0, 0, 0, 1], 0, 'cpu');
    const r = applyMove(s, 12);
    expect(r.extraTurn).toBe(true);
    expect(r.state.turn).toBe('cpu');
  });
});

describe('横取り', () => {
  it('自分の空の穴で止まり、向かいに石があれば、向かいの石と最後の 1 個をゴールに入れる', () => {
    const s = board([1, 0, 0, 0, 0, 1], 0, [1, 1, 1, 1, 5, 1], 0);
    // 穴 0 の 1 個 → 穴 1（空）。向かいは 11（5 個）
    expect(opposite(1)).toBe(11);
    const r = applyMove(s, 0);
    expect(r.captured).toBe(6);
    expect(r.state.pits[MY_STORE]).toBe(6);
    expect(r.state.pits[1]).toBe(0);
    expect(r.state.pits[11]).toBe(0);
    expect(r.state.turn).toBe('cpu');
  });

  it('向かいが空なら取れず、最後の 1 個は穴に残って相手の番', () => {
    const s = board([1, 0, 0, 0, 0, 1], 0, [1, 1, 1, 1, 0, 1], 0);
    const r = applyMove(s, 0);
    expect(r.captured).toBe(0);
    expect(r.state.pits[1]).toBe(1);
    expect(r.state.pits[MY_STORE]).toBe(0);
    expect(r.state.turn).toBe('cpu');
  });

  it('相手の陣地の空の穴で止まっても取れない', () => {
    const s = board([0, 0, 0, 0, 0, 2], 0, [0, 1, 1, 1, 1, 1], 0);
    const r = applyMove(s, 5);
    expect(r.captured).toBe(0);
    expect(r.state.pits[7]).toBe(1);
  });

  it('一周して自分の空の穴に戻った場合も取れる（13 個で元の穴に止まる）', () => {
    const s = board([0, 0, 13, 0, 0, 0], 0, [1, 1, 1, 1, 1, 1], 0);
    // 13 個：3,4,5,6,7..12,0,1,2 で元の穴（撒く前に空にした穴）に止まる
    const path = sowPath(s, 2);
    expect(path[path.length - 1]).toBe(2);
    const r = applyMove(s, 2);
    expect(r.captured).toBe(1 + 2); // 向かい（10）の 1＋1 個 と最後の 1 個
    expect(r.state.pits[2]).toBe(0);
    expect(r.state.pits[10]).toBe(0);
    expect(total(r.state)).toBe(total(s));
  });

  it('CPU の横取りは CPU のゴールに入る', () => {
    const s = board([3, 1, 1, 1, 1, 1], 0, [1, 0, 1, 1, 1, 1], 0, 'cpu');
    const r = applyMove(s, 7);
    expect(r.captured).toBe(1 + 1);
    expect(r.state.pits[CPU_STORE]).toBe(2);
    expect(r.state.pits[opposite(8)]).toBe(0);
  });
});

describe('終局', () => {
  it('どちらかの陣地が空になったら終わり、残った石は持ち主のゴールへ', () => {
    const s = board([0, 0, 0, 0, 0, 1], 10, [2, 2, 2, 2, 2, 2], 25);
    const r = applyMove(s, 5);
    expect(r.gameOver).toBe(true);
    expect(r.extraTurn).toBe(false);
    const done = finish(r.state);
    expect(done.pits[MY_STORE]).toBe(11);
    expect(done.pits[CPU_STORE]).toBe(37);
    expect(isOver(done)).toBe(true);
    expect(outcomeOf(done)).toBe('loss');
  });

  it('24 対 24 の引き分けがある', () => {
    const s = board([0, 0, 0, 0, 0, 1], 23, [1, 0, 0, 0, 0, 0], 23);
    const done = finish(applyMove(s, 5).state);
    expect(done.pits[MY_STORE]).toBe(24);
    expect(done.pits[CPU_STORE]).toBe(24);
    expect(outcomeOf(done)).toBe('draw');
  });

  it('どの局面でも石が 48 個のまま（乱数を固定して 1,000 局）', () => {
    const rng = mulberry32(2026);
    for (let g = 0; g < 1000; g++) {
      let s = initialState(g % 2 === 0 ? 'me' : 'cpu');
      while (!isOver(s)) {
        const moves = legalMoves(s);
        s = applyMove(s, moves[Math.floor(rng() * moves.length)]).state;
        expect(total(s)).toBe(48);
      }
      expect(total(finish(s))).toBe(48);
    }
  });
});

describe('探索用の撒き方（sowRaw）', () => {
  it('applyMove と同じ盤・同じ「もう 1 回」・横取り・終局になる（乱数を固定して 300 局）', () => {
    const rng = mulberry32(77);
    for (let g = 0; g < 300; g++) {
      let s = initialState(g % 2 === 0 ? 'me' : 'cpu');
      while (!isOver(s)) {
        const moves = legalMoves(s);
        const pit = moves[Math.floor(rng() * moves.length)];
        const r = applyMove(s, pit);
        const raw = s.pits.slice();
        const f = sowRaw(raw, s.turn === 'me' ? 0 : 1, pit);
        expect(raw).toEqual(r.state.pits);
        expect(Boolean(f & 1)).toBe(r.extraTurn);
        expect(Boolean(f & 2)).toBe(r.captured > 0);
        expect(Boolean(f & 4)).toBe(r.gameOver);
        s = r.state;
      }
    }
  });
});

describe('予告', () => {
  it('最後の石が止まるマスと、もう 1 回・横取りを返す', () => {
    expect(previewMove(initialState('me'), 2)).toEqual({ last: MY_STORE, extraTurn: true, captured: 0 });
    const s = board([1, 0, 0, 0, 0, 1], 0, [1, 1, 1, 1, 5, 1], 0);
    expect(previewMove(s, 0)).toEqual({ last: 1, extraTurn: false, captured: 6 });
  });
});

/** 2 つの CPU を戦わせる。`opening` 手は乱数で進めて、決定的な CPU どうしでも局を散らす */
function match(
  me: (s: MancalaState) => number,
  cpu: (s: MancalaState) => number,
  first: 'me' | 'cpu',
  rng: () => number,
  opening = 0,
): 'win' | 'loss' | 'draw' {
  let s = initialState(first);
  for (let ply = 0; !isOver(s); ply++) {
    const moves = legalMoves(s);
    const pit = ply < opening ? moves[Math.floor(rng() * moves.length)] : s.turn === 'me' ? me(s) : cpu(s);
    expect(moves).toContain(pit);
    s = applyMove(s, pit).state;
  }
  return outcomeOf(finish(s));
}

/** テストの「つよい」は時間ではなく深さで打ち切る（CI の速さで結果が変わらないように） */
const HARD_TEST_DEPTH = 6;

/**
 * 盤をどちらの手番でも「自分」から見られるように裏返す。
 * `cpuMove` は手番の人から見て読むので、CPU 側の手は盤の添字を 7 ずらせば自分の手と同じになる
 */
function asLevel(level: Level, rng: () => number) {
  return (s: MancalaState) =>
    cpuMove(s, level, rng, level === 'hard' ? Infinity : undefined, level === 'hard' ? { maxDepth: HARD_TEST_DEPTH } : {});
}

describe('CPU', () => {
  it('どの強さも合法手だけを打つ', () => {
    const rng = mulberry32(5);
    for (const level of ['easy', 'normal', 'hard'] as const) {
      for (let g = 0; g < 4; g++) {
        let s = initialState(g % 2 === 0 ? 'me' : 'cpu');
        while (!isOver(s)) {
          const pit = cpuMove(s, level, rng, Infinity, { maxDepth: 4 });
          expect(legalMoves(s)).toContain(pit);
          s = applyMove(s, pit).state;
        }
      }
    }
  });

  it('乱数を固定すれば同じ手を返す', () => {
    const s = applyMove(applyMove(initialState('cpu'), 7).state, 1).state;
    for (const level of ['easy', 'normal', 'hard'] as const) {
      const a = cpuMove(s, level, mulberry32(9), Infinity, { maxDepth: 6 });
      const b = cpuMove(s, level, mulberry32(9), Infinity, { maxDepth: 6 });
      expect(a).toBe(b);
    }
  });

  it('やさしいは「もう 1 回」になる手があれば、乱数が 0.5 未満のときそれを選ぶ', () => {
    const s = initialState('me');
    // 穴 2（4 個）だけがちょうどゴールで止まる
    const seq = [0.1, 0.9];
    let i = 0;
    expect(cpuMove(s, 'easy', () => seq[i++])).toBe(2);
  });

  it('同点の手は左の穴を選ぶ', () => {
    // どの手を選んでもゴールの差が変わらない局面（全部の穴に 1 個・相手の穴も全部 1 個で、終局まで読み切れない浅さ）
    const s = board([0, 0, 0, 0, 0, 0], 20, [1, 1, 1, 1, 1, 1], 22, 'cpu');
    expect(cpuMove(s, 'normal', Math.random)).toBe(7);
  });

  it('「つよい」が「やさしい」に 100 局中 90 局以上勝つ（先手・後手を半々）', () => {
    const rng = mulberry32(42);
    let wins = 0;
    for (let g = 0; g < 100; g++) {
      if (match(asLevel('hard', rng), asLevel('easy', rng), g % 2 === 0 ? 'me' : 'cpu', rng) === 'win') wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(90);
  });

  it('「つよい」が「ふつう」に 100 局中 60 局以上勝つ（つまみを回したあとの行き過ぎの検査）', () => {
    const rng = mulberry32(43);
    let wins = 0;
    for (let g = 0; g < 100; g++) {
      // ふつうもつよいも乱数を使わないので、最初の 4 手を乱数で進めて局を散らす
      if (match(asLevel('hard', rng), asLevel('normal', rng), g % 2 === 0 ? 'me' : 'cpu', rng, 4) === 'win') wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(60);
  });

  it('「つよい」の 1 手は持ち時間（deadlineMs）で打ち切られる', () => {
    // 時計を差し替えて、1 回読むたびに 1ms 進める。CI の速さに依らず打ち切りを確かめる
    let t = 0;
    const now = () => (t += 1);
    const s = initialState('me');
    const pit = cpuMove(s, 'hard', Math.random, HARD_BUDGET_MS, { now });
    expect(legalMoves(s)).toContain(pit);
    // 打ち切ったあとは時計を読み進めない（持ち時間＋確認の 1 回ぶんまで）
    expect(t).toBeLessThanOrEqual(HARD_BUDGET_MS + 2);
  });

  it('「つよい」の 1 手が 150ms 以内（実時間。遅い CI の余裕を見て 300ms で落とす）', () => {
    const rng = mulberry32(3);
    let worst = 0;
    let s = initialState('me');
    while (!isOver(s)) {
      const start = performance.now();
      const pit = s.turn === 'me' ? cpuMove(s, 'hard', rng) : cpuMove(s, 'easy', rng);
      if (s.turn === 'me') worst = Math.max(worst, performance.now() - start);
      s = applyMove(s, pit).state;
    }
    expect(worst).toBeLessThan(HARD_BUDGET_MS * 2);
  });
});

describe('今日の 1 手番', () => {
  const seedOf = (key: string) => dailySeed(key, DAILY_VERSION);

  it('同じ日なら同じ局面、違う日なら違う局面', () => {
    expect(dailyPuzzle(seedOf('2026-10-19'))).toEqual(dailyPuzzle(seedOf('2026-10-19')));
    expect(dailyPuzzle(seedOf('2026-10-19')).state.pits).not.toEqual(dailyPuzzle(seedOf('2026-10-20')).state.pits);
  });

  it('局面は実際の対局の手順から作る（自分の手番・石は 48 個）', () => {
    for (let k = 0; k < 50; k++) {
      const s = dailyCandidate(k);
      if (!s) continue;
      expect(s.turn).toBe('me');
      expect(total(s)).toBe(48);
      expect(isOver(s)).toBe(false);
    }
  });

  /** 全通りの撒き順（連鎖を含む）を数え上げて、最大と最少の撒く回数を出す */
  function bruteForce(s: MancalaState): { best: number; minSows: number } {
    const start = s.pits[MY_STORE];
    let best = -1;
    let minSows = Infinity;
    const walk = (cur: MancalaState, sows: number) => {
      for (const pit of legalMoves(cur)) {
        const r = applyMove(cur, pit);
        if (r.extraTurn) {
          walk(r.state, sows + 1);
          continue;
        }
        const got = r.state.pits[MY_STORE] - start;
        if (got > best) {
          best = got;
          minSows = sows + 1;
        } else if (got === best) {
          minSows = Math.min(minSows, sows + 1);
        }
      }
    };
    walk(s, 0);
    return { best, minSows };
  }

  it('bestTurn の最適値と撒き順が全探索と一致する', () => {
    for (let i = 0; i < 60; i++) {
      const key = `2027-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`;
      const p = dailyPuzzle(seedOf(key));
      const brute = bruteForce(p.state);
      expect(p.best).toBe(brute.best);
      expect(p.path.length).toBe(brute.minSows);
      // 撒き順をなぞると最適値に届き、手番がそこで終わる
      const played = playTurn(p.state, p.path);
      expect(played.got).toBe(p.best);
      expect(played.done).toBe(true);
    }
  });

  it('最適値に届くには撒く回数が 3 回以上要る（緩めた日は 2 回以上）', () => {
    for (let i = 0; i < 100; i++) {
      const key = `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`;
      const p = dailyPuzzle(seedOf(key));
      expect(bruteForce(p.state).minSows).toBeGreaterThanOrEqual(p.relaxed ? DAILY_RELAXED_SOWS : DAILY_MIN_SOWS);
    }
  });

  it('手番の途中で終局しても finish() を呼ばず、ゴールに入った数だけを数える', () => {
    // 右端の 1 個でもう 1 回 → その左の 1 個で穴 5（空）に止まり、向かいが空で取れず……ではなく、
    // 自分の陣地が空になる手で終わる局面
    const s = board([0, 0, 0, 0, 0, 1], 5, [3, 3, 3, 3, 3, 3], 25);
    const r = bestTurn(s);
    expect(r).toEqual({ best: 1, path: [5] });
    // 精算すると相手の残り 18 個が CPU に入るが、1 手番の数には入れない
    const played = playTurn(s, r.path);
    expect(played.got).toBe(1);
    expect(played.state.pits[CPU_STORE]).toBe(25);
  });

  it('2026〜2028 年の全日（1,096 日）で局面が出て、予備に落ちる日が 0 日', () => {
    let relaxed = 0;
    let fallback = 0;
    const first = Date.UTC(2026, 0, 1);
    const days = (Date.UTC(2029, 0, 1) - first) / 86_400_000;
    expect(days).toBe(1096);
    for (let i = 0; i < days; i++) {
      const key = new Date(first + i * 86_400_000).toISOString().slice(0, 10);
      const p = dailyPuzzle(seedOf(key));
      expect(p.state.turn).toBe('me');
      expect(total(p.state)).toBe(48);
      expect(p.best).toBeGreaterThan(0);
      if (p.relaxed) relaxed++;
      if (p.fallback) fallback++;
    }
    // 実測では緩めた日も 0 日（2026-10-19）
    expect(relaxed).toBe(0);
    expect(fallback).toBe(0);
  });

  it('予備の局面 7 つは、どれも石 48 個・最適値に撒く回数 3 回以上', () => {
    expect(FALLBACK_PUZZLES).toHaveLength(7);
    for (const pits of FALLBACK_PUZZLES) {
      const s: MancalaState = { pits: pits.slice(), turn: 'me' };
      expect(total(s)).toBe(48);
      expect(isOver(s)).toBe(false);
      expect(bruteForce(s).minSows).toBeGreaterThanOrEqual(DAILY_MIN_SOWS);
    }
  });

  it('途中経過は日付と撒き順だけを保存し、別の日のものは読まない', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    writeDailyProgress(storage, '2026-10-19', [5, 2]);
    expect(readDailyProgress(storage, '2026-10-19')).toEqual([5, 2]);
    expect(readDailyProgress(storage, '2026-10-20')).toEqual([]);
    expect(readDailyProgress(null, '2026-10-19')).toEqual([]);
    const broken = { getItem: () => '{oops', setItem: () => {} };
    expect(readDailyProgress(broken, '2026-10-19')).toEqual([]);
  });

  it('共有文は日付と個数と URL だけ（局面は入れない）', () => {
    expect(shareText({ dateKey: '2026-10-19', got: 5, best: 7, url: 'https://hasokon.com/games/mancala/' })).toBe(
      'マンカラ 今日の1手番 2026-10-19 5/7個\nhttps://hasokon.com/games/mancala/',
    );
  });
});

describe('記録の変種キー', () => {
  it('cpu-easy / cpu-normal / cpu-hard / daily', () => {
    expect(variantOf('cpu', 'easy')).toBe('cpu-easy');
    expect(variantOf('cpu', 'normal')).toBe('cpu-normal');
    expect(variantOf('cpu', 'hard')).toBe('cpu-hard');
    expect(variantOf('daily', 'hard')).toBe('daily');
  });
});
