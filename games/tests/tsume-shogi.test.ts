import { describe, expect, it } from 'vitest';
import {
  apply,
  applyAs,
  attacksFrom,
  candidateMoves,
  CELLS,
  cellLabel,
  dailyProblem,
  defenderReply,
  deriveDefenderHand,
  emptyHand,
  formatMove,
  generateFromSeed,
  generate,
  illegalReason,
  isCheck,
  isDistantSliderCheck,
  isMate,
  isValidPosition,
  judge,
  legalMoves,
  makeBoard,
  PIECE_LIMIT,
  piecesWithinLimits,
  solve,
  sq,
  toLabel,
  verify,
  type Board,
  type Hand,
  type Move,
  type Piece,
  type Problem,
  type Side,
  type Square,
} from '@/lib/tsume-shogi';
import { mulberry32 } from '@/lib/daily';

/**
 * 詰将棋（1手詰・3手詰）のテスト。
 *
 * 仕様: docs/features/game-tsume-shogi.md の「テスト」
 *
 * 局面は `sq(筋, 段)` で書く（`sq(5, 1)` が「５一」）。期待値の局面はどれも手で盤に並べて確かめた。
 */

type Placement = [file: number, rank: number, piece: Piece, side: Side];

function board(placements: Placement[], hand: Partial<Hand> = {}): Board {
  const cells: (Square | null)[] = new Array(CELLS).fill(null);
  for (const [f, r, piece, side] of placements) cells[sq(f, r)] = { piece, side };
  return makeBoard(cells, hand);
}

function drop(piece: Piece, file: number, rank: number): Move {
  return { from: null, to: sq(file, rank), piece, promote: false };
}

function mv(b: Board, from: [number, number], to: [number, number], promote = false): Move {
  const s = b.cells[sq(...from)];
  if (!s) throw new Error('駒がありません');
  return { from: sq(...from), to: sq(...to), piece: s.piece, promote };
}

function labels(squares: number[]): string[] {
  return squares.map(toLabel).sort();
}

describe('座標の表示変換', () => {
  it('左上が９一、右下が１九（右上が１一）', () => {
    expect(toLabel(0)).toBe('９一');
    expect(toLabel(8)).toBe('１一');
    expect(toLabel(80)).toBe('１九');
    expect(toLabel(sq(5, 5))).toBe('５五');
    expect(toLabel(sq(3, 7))).toBe('３七');
  });

  it('マスの読み上げは「３三 歩」の形', () => {
    const b = board([
      [3, 3, 'P', 'A'],
      [5, 1, 'K', 'D'],
    ]);
    expect(cellLabel(b, sq(3, 3))).toBe('３三 歩');
    expect(cellLabel(b, sq(5, 1))).toBe('５一 玉方の玉');
  });
});

describe('駒の動き（14 種）', () => {
  const at55 = (piece: Piece, side: Side = 'A') => attacksFrom(board([[5, 5, piece, side]]).cells, sq(5, 5));

  it('玉は 8 方向に 1 マス', () => {
    expect(labels(at55('K'))).toEqual(labels([sq(4, 4), sq(5, 4), sq(6, 4), sq(4, 5), sq(6, 5), sq(4, 6), sq(5, 6), sq(6, 6)]));
  });

  it('金は前・斜め前・横・後ろ（斜め後ろには行けない）', () => {
    expect(labels(at55('G'))).toEqual(labels([sq(4, 4), sq(5, 4), sq(6, 4), sq(4, 5), sq(6, 5), sq(5, 6)]));
  });

  it('成銀・成桂・成香・と は金と同じ動き', () => {
    const gold = labels(at55('G'));
    for (const p of ['+S', '+N', '+L', '+P'] as Piece[]) expect(labels(at55(p))).toEqual(gold);
  });

  it('銀は前と斜め 4 方向', () => {
    expect(labels(at55('S'))).toEqual(labels([sq(4, 4), sq(5, 4), sq(6, 4), sq(4, 6), sq(6, 6)]));
  });

  it('桂は 2 つ前の左右へ跳ぶ（間の駒を飛び越える）', () => {
    const b = board([
      [5, 5, 'N', 'A'],
      [5, 4, 'P', 'D'],
      [4, 4, 'P', 'D'],
    ]);
    expect(labels(attacksFrom(b.cells, sq(5, 5)))).toEqual(labels([sq(4, 3), sq(6, 3)]));
  });

  it('香は前へまっすぐ、駒に当たるまで', () => {
    expect(labels(at55('L'))).toEqual(labels([sq(5, 4), sq(5, 3), sq(5, 2), sq(5, 1)]));
    const b = board([
      [5, 5, 'L', 'A'],
      [5, 3, 'P', 'D'],
    ]);
    expect(labels(attacksFrom(b.cells, sq(5, 5)))).toEqual(labels([sq(5, 4), sq(5, 3)]));
  });

  it('歩は前に 1 マス', () => {
    expect(labels(at55('P'))).toEqual([toLabel(sq(5, 4))]);
  });

  it('飛は縦横に走る（16 マス）、角は斜めに走る（16 マス）', () => {
    expect(at55('R')).toHaveLength(16);
    expect(at55('B')).toHaveLength(16);
    expect(at55('R')).toContain(sq(5, 9));
    expect(at55('B')).toContain(sq(1, 1));
  });

  it('龍は飛の動き＋斜め 1 マス、馬は角の動き＋縦横 1 マス', () => {
    expect(at55('+R')).toHaveLength(20);
    expect(at55('+R')).toContain(sq(4, 4));
    expect(at55('+R')).not.toContain(sq(3, 3));
    expect(at55('+B')).toHaveLength(20);
    expect(at55('+B')).toContain(sq(5, 4));
    expect(at55('+B')).not.toContain(sq(5, 3));
  });

  it('玉方の駒は向きが反対（歩は下へ、香は下へ走る）', () => {
    expect(labels(at55('P', 'D'))).toEqual([toLabel(sq(5, 6))]);
    expect(labels(at55('L', 'D'))).toEqual(labels([sq(5, 6), sq(5, 7), sq(5, 8), sq(5, 9)]));
    expect(labels(at55('N', 'D'))).toEqual(labels([sq(4, 7), sq(6, 7)]));
  });

  it('盤の端で切れる', () => {
    const b = board([[1, 1, 'K', 'A']]);
    expect(labels(attacksFrom(b.cells, sq(1, 1)))).toEqual(labels([sq(2, 1), sq(1, 2), sq(2, 2)]));
    const n = board([[9, 3, 'N', 'A']]);
    expect(labels(attacksFrom(n.cells, sq(9, 3)))).toEqual([toLabel(sq(8, 1))]);
  });
});

describe('成り', () => {
  it('敵陣に入るときは成・不成の両方を手にする', () => {
    const b = board([
      [5, 4, 'S', 'A'],
      [9, 9, 'K', 'D'],
    ]);
    const to53 = legalMoves(b, 'A').filter((m) => m.from === sq(5, 4) && m.to === sq(5, 3));
    expect(to53.map((m) => m.promote).sort()).toEqual([false, true]);
  });

  it('敵陣の外どうしの移動では成れない', () => {
    const b = board([
      [5, 6, 'S', 'A'],
      [9, 9, 'K', 'D'],
    ]);
    expect(legalMoves(b, 'A').filter((m) => m.from === sq(5, 6)).every((m) => !m.promote)).toBe(true);
  });

  it('金・玉・成駒は成れない', () => {
    const b = board([
      [5, 4, 'G', 'A'],
      [4, 4, '+P', 'A'],
      [9, 9, 'K', 'D'],
    ]);
    expect(legalMoves(b, 'A').every((m) => !m.promote)).toBe(true);
  });

  it('成ると駒が変わる', () => {
    const b = board([
      [2, 4, 'R', 'A'],
      [9, 9, 'K', 'D'],
    ]);
    const after = apply(b, mv(b, [2, 4], [2, 2], true));
    expect(after.cells[sq(2, 2)]).toEqual({ piece: '+R', side: 'A' });
  });
});

describe('禁手', () => {
  it('二歩：同じ筋に不成の歩があると歩を打てない（と金は数えない）', () => {
    const b = board(
      [
        [3, 7, 'P', 'A'],
        [9, 1, 'K', 'D'],
      ],
      { P: 1 },
    );
    expect(legalMoves(b, 'A').some((m) => m.from === null && m.to === sq(3, 4))).toBe(false);
    expect(illegalReason(b, drop('P', 3, 4), 'A')).toBe('nifu');
    expect(legalMoves(b, 'A').some((m) => m.from === null && m.to === sq(4, 4))).toBe(true);

    const tokin = board(
      [
        [3, 7, '+P', 'A'],
        [9, 1, 'K', 'D'],
      ],
      { P: 1 },
    );
    expect(illegalReason(tokin, drop('P', 3, 4), 'A')).toBeNull();
  });

  it('1 段目に歩・香、1〜2 段目に桂は打てない', () => {
    const b = board([[9, 9, 'K', 'D']], { P: 1, L: 1, N: 1 });
    const drops = legalMoves(b, 'A').filter((m) => m.from === null);
    const rankOf = (m: Move) => Math.floor(m.to / 9) + 1;
    expect(drops.filter((m) => m.piece === 'P').some((m) => rankOf(m) === 1)).toBe(false);
    expect(drops.filter((m) => m.piece === 'L').some((m) => rankOf(m) === 1)).toBe(false);
    expect(drops.filter((m) => m.piece === 'N').some((m) => rankOf(m) <= 2)).toBe(false);
    expect(drops.filter((m) => m.piece === 'N').some((m) => rankOf(m) === 3)).toBe(true);
    expect(illegalReason(b, drop('N', 5, 2), 'A')).toBe('dead-piece');
  });

  it('行き所のない駒は不成で進めない（成る手だけが残る）', () => {
    const b = board([
      [5, 2, 'P', 'A'],
      [3, 3, 'N', 'A'],
      [1, 2, 'L', 'A'],
      [9, 9, 'K', 'D'],
    ]);
    const moves = legalMoves(b, 'A');
    const pawn = moves.filter((m) => m.from === sq(5, 2));
    expect(pawn).toEqual([{ from: sq(5, 2), to: sq(5, 1), piece: 'P', promote: true }]);
    expect(moves.filter((m) => m.from === sq(3, 3)).every((m) => m.promote)).toBe(true);
    expect(moves.filter((m) => m.from === sq(1, 2)).every((m) => m.promote)).toBe(true);
  });

  // 玉 １一。攻方 金 ３二（２一・２二に利く）・香 １五（１二に紐）。歩を １二 に打つと詰む形
  const uchifu = () =>
    board(
      [
        [1, 1, 'K', 'D'],
        [3, 2, 'G', 'A'],
        [1, 5, 'L', 'A'],
      ],
      { P: 1 },
    );

  it('打ち歩詰め：歩を打って詰みになる手は合法手から除かれ、理由が返る', () => {
    const b = uchifu();
    expect(legalMoves(b, 'A').some((m) => m.from === null && m.piece === 'P' && m.to === sq(1, 2))).toBe(false);
    expect(illegalReason(b, drop('P', 1, 2), 'A')).toBe('uchifuzume');
    // 画面のハイライトには出す（指してから理由を出すため）
    expect(candidateMoves(b, 'A').some((m) => m.from === null && m.piece === 'P' && m.to === sq(1, 2))).toBe(true);
    // 詰みでない歩打ちの王手は指せる（香の紐を外すと玉で取れる）
    const loose = board(
      [
        [1, 1, 'K', 'D'],
        [3, 2, 'G', 'A'],
      ],
      { P: 1 },
    );
    expect(illegalReason(loose, drop('P', 1, 2), 'A')).toBeNull();
  });

  it('歩を動かしての詰み（突き歩詰め）は合法', () => {
    const b = board([
      [1, 1, 'K', 'D'],
      [3, 2, 'G', 'A'],
      [1, 3, 'P', 'A'],
      [1, 5, 'L', 'A'],
    ]);
    const push = mv(b, [1, 3], [1, 2]);
    expect(illegalReason(b, push, 'A')).toBeNull();
    expect(isMate(applyAs(b, push, 'A'))).toBe(true);
  });

  it('玉方は自玉に王手がかかる手を指せない', () => {
    const b = board([
      [5, 1, 'K', 'D'],
      [5, 9, 'R', 'A'],
      [5, 3, 'G', 'D'],
    ]);
    // ５三の金は飛車の利きを止めているので、５筋から外れられない（５二・５四だけ）
    const goldMoves = legalMoves(b, 'D').filter((m) => m.from === sq(5, 3));
    expect(labels(goldMoves.map((m) => m.to))).toEqual(labels([sq(5, 2), sq(5, 4)]));
  });
});

describe('王手の判定', () => {
  it('飛・角・香の遠くからの王手', () => {
    expect(isCheck(board([[5, 1, 'K', 'D'], [5, 9, 'R', 'A']]), 'D')).toBe(true);
    expect(isCheck(board([[5, 1, 'K', 'D'], [1, 5, 'B', 'A']]), 'D')).toBe(true);
    expect(isCheck(board([[5, 1, 'K', 'D'], [5, 9, 'L', 'A']]), 'D')).toBe(true);
  });

  it('間に駒があると王手でない（敵味方どちらの駒でも）', () => {
    expect(isCheck(board([[5, 1, 'K', 'D'], [5, 9, 'R', 'A'], [5, 5, 'P', 'A']]), 'D')).toBe(false);
    expect(isCheck(board([[5, 1, 'K', 'D'], [1, 5, 'B', 'A'], [3, 3, 'S', 'D']]), 'D')).toBe(false);
  });

  it('攻方には玉が無いので、攻方への王手は無い', () => {
    expect(isCheck(board([[5, 1, 'K', 'D'], [5, 2, 'G', 'D']]), 'A')).toBe(false);
  });

  it('合駒で王手が外れる（玉方の持ち駒を間に打てる）', () => {
    // 玉 １一。攻方 飛 １九・金 ３二（２一・２二を押さえる）。玉は逃げられないが、間に打てるので詰みではない
    const b = board([
      [1, 1, 'K', 'D'],
      [1, 9, 'R', 'A'],
      [3, 2, 'G', 'A'],
    ]);
    expect(isCheck(b, 'D')).toBe(true);
    const replies = legalMoves(b, 'D');
    expect(replies.length).toBeGreaterThan(0);
    expect(replies.every((m) => m.from === null)).toBe(true);
    expect(isMate(b)).toBe(false);
    expect(isDistantSliderCheck(b)).toBe(true);
  });
});

describe('玉方の持ち駒（種類ごとに上限から引く）', () => {
  it('盤上と攻方の持ち駒を種類ごとに引く。成駒は元の駒で数える。玉は持ち駒にならない', () => {
    const b = board(
      [
        [5, 1, 'K', 'D'],
        [5, 3, '+P', 'A'],
        [4, 3, 'P', 'A'],
        [6, 3, '+R', 'A'],
      ],
      { G: 1, P: 1 },
    );
    expect(b.defenderHand).toEqual({ R: 1, B: 2, G: 3, S: 4, N: 4, L: 4, P: 15 });
    expect(piecesWithinLimits(b)).toBe(true);
  });

  it('上限を超える配置は不正（飛 3 枚・歩 19 枚）', () => {
    expect(piecesWithinLimits(board([[5, 1, 'K', 'D'], [1, 9, 'R', 'A'], [2, 9, 'R', 'A']], { R: 1 }))).toBe(false);
    expect(deriveDefenderHand([], { ...emptyHand(), P: PIECE_LIMIT.P }).P).toBe(0);
  });

  it('駒を取ると取った側の持ち駒になり、総数は変わらない', () => {
    const b = board([
      [5, 1, 'K', 'D'],
      [5, 2, 'G', 'A'],
    ]);
    const after = applyAs(b, mv(b, [5, 1], [5, 2]), 'D');
    expect(after.defenderHand.G).toBe(b.defenderHand.G + 1);
    expect(after.defenderHand).toEqual(deriveDefenderHand(after.cells, after.attackerHand));
  });
});

// 頭金：玉 ５一、攻方 歩 ５三、持ち駒 金 → ５二金打のみ
const atamaKin = () =>
  board(
    [
      [5, 1, 'K', 'D'],
      [5, 3, 'P', 'A'],
    ],
    { G: 1 },
  );

// 3 手詰：玉 １一、攻方 金 ３一・金 １四、持ち駒 金 2 → ２一金打 １二玉 １一金打（２三金打でも詰む）
const threeMate = () =>
  board(
    [
      [1, 1, 'K', 'D'],
      [3, 1, 'G', 'A'],
      [1, 4, 'G', 'A'],
    ],
    { G: 2 },
  );

function problemOf(b: Board, moves: 1 | 3): Problem {
  const solution = verify(b, moves);
  if (!solution) throw new Error('問題の条件を満たしていません');
  return { board: b, moves, solution, seed: 0 };
}

describe('solve', () => {
  it('頭金の 1 手詰は ５二金打 だけ（４一・６一の金打は詰まない）', () => {
    const b = atamaKin();
    const { solutions } = solve(b, 1);
    expect(solutions).toHaveLength(1);
    expect(formatMove(b, solutions[0][0])).toBe('５二金打');
    expect(isMate(applyAs(b, drop('G', 4, 1), 'A'))).toBe(false);
    expect(isMate(applyAs(b, drop('G', 6, 1), 'A'))).toBe(false);
    expect(verify(b, 1)).not.toBeNull();
  });

  it('既知の 3 手詰：２一金打 １二玉 １一金打', () => {
    const b = threeMate();
    expect(solve(b, 1).solutions).toHaveLength(0);
    const { solutions } = solve(b, 3);
    expect(solutions).toHaveLength(1);
    const [m1, reply, m3] = solutions[0];
    expect(formatMove(b, m1)).toBe('２一金打');
    const b1 = applyAs(b, m1, 'A');
    expect(formatMove(b1, reply)).toBe('１二玉');
    const b2 = applyAs(b1, reply, 'D');
    expect(isMate(applyAs(b2, m3, 'A'))).toBe(true);
    expect(verify(b, 3)).not.toBeNull();
  });

  it('余詰のある局面では solutions が 2 本返る（４三の金でも６三の金でも ５二金 で詰む）', () => {
    const b = board([
      [5, 1, 'K', 'D'],
      [4, 3, 'G', 'A'],
      [6, 3, 'G', 'A'],
    ]);
    const { solutions } = solve(b, 1);
    expect(solutions).toHaveLength(2);
    expect(solutions.map((s) => s[0].from).sort()).toEqual([sq(6, 3), sq(4, 3)].sort());
    expect(solutions.every((s) => s[0].to === sq(5, 2))).toBe(true);
    expect(verify(b, 1)).toBeNull();
  });

  it('1 手で詰む局面は 3 手詰の問題にならない', () => {
    expect(verify(atamaKin(), 3)).toBeNull();
  });

  it('離れた飛車の王手で詰む 1 手詰は作らない（合駒が利かない形でも）', () => {
    // 玉 １一。攻方 金 ２三、持ち駒 飛。１五から飛を打つ王手は、間（１二〜１四）に合駒ができる
    const b = board(
      [
        [1, 1, 'K', 'D'],
        [2, 3, 'G', 'A'],
      ],
      { R: 1 },
    );
    const far = applyAs(b, drop('R', 1, 5), 'A');
    expect(isDistantSliderCheck(far)).toBe(true);
    expect(isMate(far)).toBe(false);
  });
});

describe('judge', () => {
  it('1 手詰：正解は mate、王手でない手は not-check、逃げられる王手は escapable、打ち歩詰めは illegal', () => {
    const p = problemOf(atamaKin(), 1);
    expect(judge(p, drop('G', 5, 2))).toBe('mate');
    expect(judge(p, drop('G', 9, 9))).toBe('not-check');
    expect(judge(p, drop('G', 4, 1))).toBe('escapable');
    expect(judge(p, drop('R', 5, 2))).toBe('illegal'); // 持っていない駒
  });

  it('3 手詰：作意の初手は continue、3 手目は solution[2] 以外でも詰めば mate', () => {
    const p = problemOf(threeMate(), 3);
    expect(judge(p, drop('G', 2, 1), p.board, 1)).toBe('continue');
    const b1 = applyAs(p.board, drop('G', 2, 1), 'A');
    const b2 = applyAs(b1, defenderReply(b1), 'D');
    expect(judge(p, drop('G', 1, 1), b2, 3)).toBe('mate');
    // 作意（１一金打）とは別の詰み（２三金打）も正解
    expect(judge(p, drop('G', 2, 3), b2, 3)).toBe('mate');
    // 3 手目で逃げられる王手は escapable、王手でなければ not-check
    expect(judge(p, mv(b2, [1, 4], [1, 3]), b2, 3)).toBe('escapable'); // 紐が外れて玉で取れる
    expect(judge(p, drop('G', 9, 9), b2, 3)).toBe('not-check');
  });

  it('3 手詰：詰まない初手の王手は escapable', () => {
    const p = problemOf(threeMate(), 3);
    expect(judge(p, drop('G', 1, 2), p.board, 1)).toBe('escapable');
    expect(judge(p, drop('G', 2, 2), p.board, 1)).toBe('escapable');
  });
});

describe('defenderReply', () => {
  it('逃げられる応手があれば必ずそれを選ぶ（詰む応手を選ばない）', () => {
    const b = threeMate();
    const b1 = applyAs(b, drop('G', 1, 2), 'A'); // 紐の無い金打ち。玉で取れる
    const reply = defenderReply(b1);
    const b2 = applyAs(b1, reply, 'D');
    expect(solve(b2, 1).solutions).toHaveLength(0);
  });

  it('同じ長さの応手が複数あっても毎回同じ手を返す（決定性）', () => {
    // 遠くからの飛車の王手：合駒の候補が何通りもある
    const b = board([
      [1, 1, 'K', 'D'],
      [1, 9, 'R', 'A'],
      [3, 2, 'G', 'A'],
    ]);
    const first = defenderReply(b);
    for (let i = 0; i < 5; i++) expect(defenderReply(b)).toEqual(first);
  });

  it('詰んだ局面では投げる', () => {
    const b = atamaKin();
    expect(() => defenderReply(applyAs(b, drop('G', 5, 2), 'A'))).toThrow();
  });
});

describe('generate', () => {
  it('同じ種からは同じ問題が出る（日替わりの前提）', () => {
    expect(generateFromSeed(12345, 3)).toEqual(generateFromSeed(12345, 3));
    expect(generate(mulberry32(7), 1)).toEqual(generate(mulberry32(7), 1));
    expect(dailyProblem('2026-10-02')).toEqual(dailyProblem('2026-10-02'));
    expect(dailyProblem('2026-10-02').moves).toBe(3);
  });

  it('日付が違えば別の問題になる', () => {
    expect(dailyProblem('2026-10-02').board).not.toEqual(dailyProblem('2026-10-03').board);
  });

  /**
   * 200 問（1 手詰 100・3 手詰 100）を作り、全部が条件を満たすか確かめる。
   * CI の時間を食わないよう件数は 200 に抑え、1 問あたりの試行は上限で打ち切っている
   */
  it('200 問がすべて 唯一解・手数ちょうど・駒数が種類ごとに上限以内', () => {
    const rng = mulberry32(20261002);
    for (const moves of [1, 3] as const) {
      for (let k = 0; k < 100; k++) {
        const p = generate(rng, moves);
        const b = p.board;
        expect(isValidPosition(b)).toBe(true);
        expect(piecesWithinLimits(b)).toBe(true);
        for (const n of Object.values(b.defenderHand)) expect(n).toBeGreaterThanOrEqual(0);
        expect(isCheck(b, 'D')).toBe(false);
        expect(p.solution).toHaveLength(moves);
        const one = solve(b, 1).solutions;
        if (moves === 1) {
          expect(one).toHaveLength(1);
        } else {
          expect(one).toHaveLength(0);
          expect(solve(b, 3).solutions).toHaveLength(1);
        }
        // 作意をなぞると詰む。王手はどれも離れた走り駒ではない（合駒が出ない）
        let cur = b;
        p.solution.forEach((m, i) => {
          const side: Side = i % 2 === 0 ? 'A' : 'D';
          cur = applyAs(cur, m, side);
          if (side === 'A') expect(isDistantSliderCheck(cur)).toBe(false);
        });
        expect(isMate(cur)).toBe(true);
      }
    }
  }, 30000);
});
