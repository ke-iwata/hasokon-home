import { describe, expect, it, vi } from 'vitest';
import {
  applyMove,
  cpuMove,
  dailyPuzzle,
  endEvent,
  fromFen,
  initialState,
  insufficientMaterial,
  isPuzzle,
  legalMoves,
  mateInOne,
  outcomeOf,
  parseSquare,
  perft,
  positionKey,
  PUZZLE_VERSION,
  settleGame,
  status,
  toFen,
  toSan,
  type ChessState,
  type Level,
  type Move,
} from '@/lib/chess';
import { FALLBACK_PUZZLES } from '@/lib/chess-puzzles';
import { dailySeed, mulberry32 } from '@/lib/daily';

/** SAN で 1 手指す（テストの読みやすさのため） */
function play(state: ChessState, san: string): ChessState {
  const legal = legalMoves(state);
  const m = legal.find((x) => toSan(state, x, legal).replace(/[+#]$/, '') === san.replace(/[+#]$/, ''));
  if (!m) throw new Error(`指せない手: ${san}（${toFen(state)}）`);
  return applyMove(state, m);
}

function playAll(state: ChessState, sans: string[]): ChessState {
  return sans.reduce(play, state);
}

function find(state: ChessState, from: string, to: string): Move | undefined {
  return legalMoves(state).find((m) => m.from === parseSquare(from) && m.to === parseSquare(to));
}

describe('指し手の生成（perft。chessprogramming wiki の Perft Results の公開値）', () => {
  it('初期局面：深さ 1〜4 が 20 / 400 / 8,902 / 197,281', () => {
    const s = initialState();
    expect([1, 2, 3, 4].map((d) => perft(s, d))).toEqual([20, 400, 8902, 197281]);
  });

  it('Kiwipete（キャスリング・アンパッサン・プロモーション）：48 / 2,039 / 97,862', () => {
    const s = fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    expect([1, 2, 3].map((d) => perft(s, d))).toEqual([48, 2039, 97862]);
  });

  it('Position 3（ピンとアンパッサン）：14 / 191 / 2,812', () => {
    const s = fromFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
    expect([1, 2, 3].map((d) => perft(s, d))).toEqual([14, 191, 2812]);
  });

  it('Position 4（プロモーション・チェック）：6 / 264 / 9,467', () => {
    const s = fromFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1');
    expect([1, 2, 3].map((d) => perft(s, d))).toEqual([6, 264, 9467]);
  });

  it('Position 5：44 / 1,486 / 62,379', () => {
    const s = fromFen('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8');
    expect([1, 2, 3].map((d) => perft(s, d))).toEqual([44, 1486, 62379]);
  });
});

describe('FEN', () => {
  it('読み書きが往復で一致する', () => {
    for (const fen of [
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
      'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2',
      '8/8/8/8/8/8/8/K6k b - - 37 80',
      ...FALLBACK_PUZZLES,
    ]) {
      expect(toFen(fromFen(fen))).toBe(fen);
    }
  });

  it('指すと手番・手数・50 手の数が進む', () => {
    const s = play(initialState(), 'e4');
    expect(toFen(s)).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
    const t = play(s, 'Nf6');
    expect(toFen(t)).toBe('rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2');
  });

  it('applyMove は元の状態を書き換えない', () => {
    const s = initialState();
    const before = toFen(s);
    play(s, 'e4');
    expect(toFen(s)).toBe(before);
  });
});

describe('キャスリング', () => {
  const base = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';

  it('条件がそろえば両側にできる', () => {
    const s = fromFen(base);
    expect(find(s, 'e1', 'g1')).toBeDefined();
    expect(find(s, 'e1', 'c1')).toBeDefined();
    const after = applyMove(s, find(s, 'e1', 'g1') as Move);
    expect(toFen(after).split(' ')[0]).toBe('r3k2r/8/8/8/8/8/8/R4RK1');
    expect(toFen(after).split(' ')[2]).toBe('kq');
  });

  it('通過するマスが攻撃されていると不可（反対側はできる）', () => {
    expect(find(fromFen('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1'), 'e1', 'g1')).toBeDefined();
    // f7 の黒ルークが f1 を狙う
    const attacked = fromFen('4k3/5r2/8/8/8/8/8/R3K2R w KQ - 0 1');
    expect(find(attacked, 'e1', 'g1')).toBeUndefined();
    expect(find(attacked, 'e1', 'c1')).toBeDefined();
  });

  it('チェック中は不可', () => {
    const s = fromFen('4k3/4r3/8/8/8/8/8/R3K2R w KQ - 0 1');
    expect(status(s)).toBe('check');
    expect(find(s, 'e1', 'g1')).toBeUndefined();
    expect(find(s, 'e1', 'c1')).toBeUndefined();
  });

  it('ルークが動いた後は（戻っても）その側は不可', () => {
    let s = fromFen('4k3/p7/8/8/8/8/8/R3K2R w KQ - 0 1');
    s = playAll(s, ['Rh2', 'a6', 'Rh1', 'a5']);
    expect(find(s, 'e1', 'g1')).toBeUndefined();
    expect(find(s, 'e1', 'c1')).toBeDefined();
  });

  it('キングが動いた後は両側とも不可', () => {
    let s = fromFen('4k3/p7/8/8/8/8/8/R3K2R w KQ - 0 1');
    s = playAll(s, ['Kd1', 'a6', 'Ke1', 'a5']);
    expect(find(s, 'e1', 'g1')).toBeUndefined();
    expect(find(s, 'e1', 'c1')).toBeUndefined();
  });
});

describe('アンパッサン', () => {
  it('2 マス進んだ直後の 1 回だけ取れる', () => {
    let s = fromFen('4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1');
    s = play(s, 'd5');
    const ep = find(s, 'e5', 'd6');
    expect(ep).toBeDefined();
    const taken = applyMove(s, ep as Move);
    expect(toFen(taken).split(' ')[0]).toBe('4k3/8/3P4/8/8/8/8/4K3');
    // 1 手あいだを置くと取れない
    const later = playAll(s, ['Kd2', 'Ke7']);
    expect(find(later, 'e5', 'd6')).toBeUndefined();
  });

  it('取るとキングがピンで開く局面では不可', () => {
    // 白キング a5・黒ルーク h5 の間に白 b5・黒 c5（c7-c5 の直後）
    const s = fromFen('4k3/8/8/KPp4r/8/8/8/8 w - c6 0 2');
    expect(find(s, 'b5', 'c6')).toBeUndefined();
    expect(find(s, 'b5', 'b6')).toBeDefined();
  });
});

describe('プロモーション', () => {
  it('4 種類から選べる', () => {
    const s = fromFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    const promos = legalMoves(s).filter((m) => m.from === parseSquare('a7'));
    expect(promos.map((m) => m.promo).sort()).toEqual([2, 3, 4, 5]);
    expect(toSan(s, promos.find((m) => m.promo === 5) as Move)).toBe('a8=Q+');
  });
});

describe('表記（SAN）', () => {
  it('Nf3・exd5・O-O・曖昧さの解消', () => {
    const s = initialState();
    expect(toSan(s, find(s, 'g1', 'f3') as Move)).toBe('Nf3');
    const t = playAll(s, ['e4', 'd5']);
    expect(toSan(t, find(t, 'e4', 'd5') as Move)).toBe('exd5');
    const c = fromFen('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
    expect(toSan(c, find(c, 'e1', 'g1') as Move)).toBe('O-O');
    const d = fromFen('4k3/8/8/8/8/8/4K3/R6R w - - 0 1');
    expect(toSan(d, find(d, 'a1', 'd1') as Move)).toBe('Rad1');
    const e = fromFen('4k3/8/8/8/R7/8/4K3/R7 w - - 0 1');
    expect(toSan(e, find(e, 'a1', 'a2') as Move)).toBe('R1a2');
  });
});

describe('終局', () => {
  it('フールズメイト（4 手）でチェックメイト', () => {
    const s = playAll(initialState(), ['f3', 'e5', 'g4', 'Qh4']);
    expect(status(s)).toBe('checkmate');
    expect(outcomeOf('checkmate', s.turn, 'w')).toBe('loss');
    expect(outcomeOf('checkmate', s.turn, 'b')).toBe('win');
  });

  it('ステイルメイト', () => {
    const s = fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(status(s)).toBe('stalemate');
    expect(outcomeOf('stalemate', s.turn, 'w')).toBe('draw');
  });

  it('同一局面 3 回で引き分け', () => {
    let s = initialState();
    const history = [positionKey(s)];
    for (const san of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) {
      s = play(s, san);
      history.push(positionKey(s));
      if (history.length < 9) expect(status(s, history)).toBe('play');
    }
    expect(status(s, history)).toBe('draw-repetition');
  });

  it('アンパッサンで取れないなら、2 マス進んだ直後も同じ局面として数える', () => {
    const a = play(initialState(), 'e4');
    const b = fromFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    expect(positionKey(a)).toBe(positionKey(b));
    // 取れるときは別の局面
    const c = fromFen('4k3/8/8/1Pp4r/8/8/8/K7 w - c6 0 2');
    const d = fromFen(toFen(c).replace(' c6 ', ' - '));
    expect(positionKey(c)).not.toBe(positionKey(d));
  });

  it('50 手（100 半手）で引き分け。チェックメイトは優先', () => {
    expect(status(fromFen('4k3/8/8/8/8/8/8/R3K3 w - - 100 80'))).toBe('draw-50');
    expect(status(fromFen('4k3/8/8/8/8/8/8/R3K3 w - - 99 80'))).toBe('play');
    expect(status(fromFen('R3k3/8/4K3/8/8/8/8/8 b - - 100 80'))).toBe('checkmate');
  });

  it('駒不足：K 対 K、K+B 対 K、K+N 対 K、同色マスのビショップだけ', () => {
    const board = (fen: string) => fromFen(`${fen} w - - 0 1`).board;
    expect(insufficientMaterial(board('4k3/8/8/8/8/8/8/4K3'))).toBe(true);
    expect(insufficientMaterial(board('4k3/8/8/8/8/8/8/2B1K3'))).toBe(true);
    expect(insufficientMaterial(board('4k3/8/8/8/8/8/8/1N2K3'))).toBe(true);
    // c1（黒マス）と f8（黒マス）
    expect(insufficientMaterial(board('4kb2/8/8/8/8/8/8/2B1K3'))).toBe(true);
    // 違う色のビショップ・ナイト 2 枚・ポーンは駒不足ではない
    expect(insufficientMaterial(board('4k1b1/8/8/8/8/8/8/2B1K3'))).toBe(false);
    expect(insufficientMaterial(board('4k3/8/8/8/8/8/8/1NN1K3'))).toBe(false);
    expect(insufficientMaterial(board('4k3/8/8/8/8/8/P7/4K3'))).toBe(false);
    expect(status(fromFen('4k3/8/8/8/8/8/8/2B1K3 w - - 0 1'))).toBe('draw-material');
  });
});

describe('CPU', () => {
  const levels: Level[] = ['easy', 'normal', 'hard'];

  it('合法手だけを指す（数局面で）', () => {
    const fens = [
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
      '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
    ];
    for (const fen of fens) {
      const s = fromFen(fen);
      const legal = legalMoves(s);
      for (const level of levels) {
        const m = cpuMove(s, level, mulberry32(1), { maxDepth: 2, deadlineMs: Infinity });
        expect(m).not.toBeNull();
        expect(legal.some((x) => x.from === m?.from && x.to === m?.to && x.promo === m?.promo)).toBe(true);
      }
    }
  });

  it('乱数を固定すれば同じ手を返す', () => {
    const s = fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    for (const level of levels) {
      const a = cpuMove(s, level, mulberry32(7), { maxDepth: 2, deadlineMs: Infinity });
      const b = cpuMove(s, level, mulberry32(7), { maxDepth: 2, deadlineMs: Infinity });
      expect(a).toEqual(b);
    }
  });

  it('初手は e4・d4・Nf3・c4 のどれか（乱数で散る）', () => {
    const s = initialState();
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const m = cpuMove(s, 'hard', mulberry32(seed)) as Move;
      seen.add(toSan(s, m));
    }
    expect([...seen].sort()).toEqual(['Nf3', 'c4', 'd4', 'e4']);
  });

  it('メイト・イン・ワンがある局面で「ふつう」「つよい」は必ず指す', () => {
    for (const fen of FALLBACK_PUZZLES.slice(0, 10)) {
      const s = fromFen(fen);
      const [answer] = mateInOne(s);
      for (const level of ['normal', 'hard'] as Level[]) {
        const m = cpuMove(s, level, mulberry32(3), { maxDepth: 2, deadlineMs: Infinity }) as Move;
        expect(m.from === answer.from && m.to === answer.to && m.promo === answer.promo).toBe(true);
      }
    }
  });

  it('「つよい」は持ち時間で打ち切る（時計を差し替えて確かめる）', () => {
    let t = 0;
    const now = () => (t += 50);
    const s = fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    const m = cpuMove(s, 'hard', mulberry32(1), { deadlineMs: 400, now });
    expect(m).not.toBeNull();
  });

  it('「つよい」が「かんたん」に 20 局中 18 局以上勝つ（白黒半々・乱数固定・深さ 3）', () => {
    let wins = 0;
    for (let g = 0; g < 20; g++) {
      const strong = g % 2 === 0 ? 'w' : 'b';
      const rng = mulberry32(1000 + g);
      let s = initialState();
      const history = [positionKey(s)];
      let st = status(s, history);
      for (let ply = 0; ply < 300 && (st === 'play' || st === 'check'); ply++) {
        const level: Level = s.turn === strong ? 'hard' : 'easy';
        const m = cpuMove(s, level, rng, { maxDepth: 3, deadlineMs: Infinity }) as Move;
        s = applyMove(s, m);
        history.push(positionKey(s));
        st = status(s, history);
      }
      if (st === 'checkmate' && s.turn !== strong) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(18);
  }, 120_000);
});

describe('今日の 1 手詰め', () => {
  it('同じ seed なら同じ局面（時刻を動かしても一致する）', () => {
    const seed = dailySeed('2026-11-03', PUZZLE_VERSION);
    const a = dailyPuzzle(seed);
    const spy = vi.spyOn(Date, 'now').mockReturnValue(1e13);
    const perf = vi.spyOn(performance, 'now').mockReturnValue(1e9);
    const b = dailyPuzzle(seed);
    spy.mockRestore();
    perf.mockRestore();
    expect(toFen(b.state)).toBe(toFen(a.state));
    expect(b.answer).toEqual(a.answer);
  });

  it('2026-11-01 から 200 日分：メイトの手がちょうど 1 つ・予備に落ちる日は 10 日以下', () => {
    let fallback = 0;
    for (let d = 0; d < 200; d++) {
      const key = new Date(Date.UTC(2026, 10, 1 + d)).toISOString().slice(0, 10);
      const p = dailyPuzzle(dailySeed(key, PUZZLE_VERSION));
      if (p.fallback) fallback++;
      expect(isPuzzle(p.state)).toBe(true);
      const mates = mateInOne(p.state);
      expect(mates).toHaveLength(1);
      expect(mates[0]).toEqual(p.answer);
    }
    expect(fallback).toBeLessThanOrEqual(10);
  }, 60_000);

  it('予備の 30 局面はすべて「ちょうど 1 つ」を満たし、重なりが無い', () => {
    expect(FALLBACK_PUZZLES).toHaveLength(30);
    expect(new Set(FALLBACK_PUZZLES).size).toBe(30);
    for (const fen of FALLBACK_PUZZLES) {
      expect(isPuzzle(fromFen(fen))).toBe(true);
    }
  });

  it('作れない日は予備から選ぶ（予備の局面の答えも 1 つ）', () => {
    // 予備だけを渡して、生成が失敗したときの選び方を確かめる
    const p = dailyPuzzle(dailySeed('2026-11-03', PUZZLE_VERSION), FALLBACK_PUZZLES);
    expect(mateInOne(p.state)).toHaveLength(1);
  });
});

describe('1 手もどすと記録', () => {
  it('もどしを使った対局は記録の関数を呼ばない', () => {
    const finish = vi.fn();
    expect(settleGame({ outcome: 'win', level: 'hard', undoUsed: true, humanMoves: 30 }, finish)).toBe(false);
    expect(finish).not.toHaveBeenCalled();
  });

  it('使っていなければ、勝ちは手数つきで、負け・引き分けは手数なしで渡す', () => {
    const finish = vi.fn();
    settleGame({ outcome: 'win', level: 'easy', undoUsed: false, humanMoves: 21 }, finish);
    settleGame({ outcome: 'loss', level: 'normal', undoUsed: false, humanMoves: 40 }, finish);
    expect(finish).toHaveBeenNthCalledWith(1, { outcome: 'win', moves: 21 }, 'cpu-easy');
    expect(finish).toHaveBeenNthCalledWith(2, { outcome: 'loss' }, 'cpu-normal');
  });

  it('計測のイベント名はもどしの有無で分ける', () => {
    expect(endEvent('win', 'hard', false)).toBe('win-hard');
    expect(endEvent('loss', 'easy', true)).toBe('lose-easy-undo');
    expect(endEvent('draw', 'normal', false)).toBe('draw-normal');
  });
});
