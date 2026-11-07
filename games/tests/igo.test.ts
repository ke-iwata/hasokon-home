import { describe, expect, it } from 'vitest';
import {
  applyMove,
  atariStones,
  beginAction,
  BLACK,
  bothPassed,
  decideCount,
  EMPTY,
  estimateDead,
  handicapPoints,
  hasLegalMove,
  illegalReason,
  initialState,
  isLegal,
  ishitoriRemaining,
  ishitoriResult,
  isOver,
  KOMI,
  legalMoves,
  MAX_RESUMES,
  marginLabel,
  pass,
  play,
  pointAt,
  pointLabel,
  positionHash,
  recordVariant,
  scoreGame,
  scoreSentence,
  starPoints,
  toggleDead,
  undoIndex,
  WHITE,
  type BoardSize,
  type IgoState,
  type Player,
} from '@/lib/igo';
import { mulberry32 } from '@/lib/daily';

/**
 * 図から局面を作る。`X` 黒・`O` 白・`.` 空き。`turn` は次に打つ側。
 * 履歴（スーパーコウ）はこの局面からはじまる。
 */
function fromDiagram(rows: string[], turn: Player = BLACK, handicap = 0): IgoState {
  const size = rows.length as BoardSize;
  const cells = rows.join('').split('').map((ch) => (ch === 'X' ? BLACK : ch === 'O' ? WHITE : EMPTY));
  const base = initialState(size, 0);
  return { ...base, cells, turn, handicap, seen: [positionHash(size, cells, turn)] };
}

/** 「横・縦」（1 始まり）で打つ */
function at(s: IgoState, col: number, row: number): IgoState {
  return play(s, pointAt(s.size, col, row));
}

describe('座標', () => {
  it('横を算用数字・縦を漢数字で「5の三」と書く（横は左から、縦は上から）', () => {
    expect(pointLabel(9, pointAt(9, 5, 3))).toBe('5の三');
    expect(pointLabel(9, 0)).toBe('1の一');
    expect(pointLabel(9, 80)).toBe('9の九');
    expect(pointLabel(6, pointAt(6, 6, 1))).toBe('6の一');
    expect(pointLabel(9, -1)).toBe('パス');
  });

  it('星は9路に5か所（3-3・7-7・3-7・7-3・天元）、6路は無し', () => {
    expect(starPoints(6)).toEqual([]);
    expect(starPoints(9).map((p) => pointLabel(9, p)).sort()).toEqual(
      ['3の三', '7の三', '3の七', '7の七', '5の五'].sort(),
    );
  });
});

describe('取り', () => {
  it('1子を4方から囲むと取れて、あげはまに数える', () => {
    let s = fromDiagram(['......', '..O...', '.OXO..', '......', '......', '......'], WHITE);
    s = at(s, 3, 4);
    expect(s.cells[pointAt(6, 3, 3)]).toBe(EMPTY);
    expect(s.captures[WHITE]).toBe(1);
    expect(s.lastCaptured).toEqual([pointAt(6, 3, 3)]);
  });

  it('2子のかたまりを取る', () => {
    let s = fromDiagram(['......', '.OO...', 'OXX...', '.OO...', '......', '......'], WHITE);
    s = at(s, 4, 3);
    expect(s.captures[WHITE]).toBe(2);
    expect(s.cells[pointAt(6, 2, 3)]).toBe(EMPTY);
    expect(s.cells[pointAt(6, 3, 3)]).toBe(EMPTY);
  });

  it('端の石は 3 方、隅の石は 2 方で取れる', () => {
    let edge = fromDiagram(['O.....', 'XO....', '......', '......', '......', '......'], WHITE);
    edge = at(edge, 1, 3);
    expect(edge.captures[WHITE]).toBe(1);
    let corner = fromDiagram(['XO....', '......', '......', '......', '......', '......'], WHITE);
    corner = at(corner, 1, 2);
    expect(corner.captures[WHITE]).toBe(1);
    expect(corner.cells[0]).toBe(EMPTY);
  });

  it('アタリ（呼吸点が 1 つ）の石を見つける', () => {
    const s = fromDiagram(['......', '..O...', '.OX...', '..O...', '......', '......']);
    expect(atariStones(s)).toEqual([pointAt(6, 3, 3)]);
  });
});

describe('自殺手', () => {
  it('呼吸点が 0 になり相手も取れない手は打てない', () => {
    const s = fromDiagram(['.O....', 'O.....', '......', '......', '......', '......'], BLACK);
    expect(illegalReason(s, 0)).toBe('suicide');
    expect(isLegal(s, 0)).toBe(false);
    expect(() => play(s, 0)).toThrow();
  });

  it('相手の石を取れるなら、呼吸点の無い点にも打てる', () => {
    // 白 1の二 は呼吸点が 1の一 だけ。黒が 1の一 に打つと、黒の石も呼吸点 0 だが白を取れる
    const s = fromDiagram(['.OX...', 'OX....', 'X.....', '......', '......', '......'], BLACK);
    expect(illegalReason(s, 0)).toBe(null);
    const t = play(s, 0);
    expect(t.captures[BLACK]).toBe(2);
    expect(t.cells[0]).toBe(BLACK);
  });

  it('石のある交点には打てない', () => {
    const s = fromDiagram(['X.....', '......', '......', '......', '......', '......'], WHITE);
    expect(illegalReason(s, 0)).toBe('occupied');
  });
});

describe('コウ（同じ盤面に戻る手の禁止）', () => {
  // . X O .
  // X O . O
  // . X O .
  const ko = ['.XO...', 'XO.O..', '.XO...', '......', '......', '......'];

  it('1子を取られた直後に、すぐ取り返す手は打てない。1手ほかに打てば取り返せる', () => {
    let s = fromDiagram(ko, BLACK);
    s = at(s, 3, 2); // 黒がコウを取る（白 2の二 を取る）
    expect(s.captures[BLACK]).toBe(1);
    const retake = pointAt(6, 2, 2);
    expect(illegalReason(s, retake)).toBe('ko');
    // 白はほかに打つ（コウ立て）、黒も受ける
    s = at(s, 6, 6);
    s = at(s, 6, 5);
    expect(illegalReason(s, retake)).toBe(null);
    s = play(s, retake);
    expect(s.captures[WHITE]).toBe(1);
  });

  it('パスをはさめば同じ盤面でも手番が同じでなければ打てる（手番を含めて比べる）', () => {
    let s = fromDiagram(ko, BLACK);
    s = at(s, 3, 2);
    s = pass(s); // 白パス
    s = pass(s); // 黒パス → 両者パス
    expect(bothPassed(s)).toBe(true);
  });

  it('legalMoves にコウの取り返しは入らない', () => {
    let s = fromDiagram(ko, BLACK);
    s = at(s, 3, 2);
    expect(legalMoves(s)).not.toContain(pointAt(6, 2, 2));
  });
});

describe('パスと終局', () => {
  it('両者が続けてパスしたら終局（対局）', () => {
    let s = initialState(9);
    s = pass(s);
    expect(isOver(s, 'taikyoku', 1)).toBe(false);
    s = at(s, 5, 5);
    s = pass(s);
    expect(bothPassed(s)).toBe(false);
    s = pass(s);
    expect(isOver(s, 'taikyoku', 1)).toBe(true);
  });

  it('石取り：決めた数を先に取ったほうの勝ち（1・3・5つ）', () => {
    const s = { ...initialState(6), captures: [0, 3, 1] as [number, number, number] };
    expect(ishitoriResult(s, 1)).toBe(BLACK);
    expect(ishitoriResult(s, 3)).toBe(BLACK);
    expect(ishitoriResult(s, 5)).toBe(null);
    expect(ishitoriRemaining(s, 5, BLACK)).toBe(2);
    expect(ishitoriRemaining(s, 5, WHITE)).toBe(4);
    const w = { ...s, captures: [0, 2, 5] as [number, number, number] };
    expect(ishitoriResult(w, 5)).toBe(WHITE);
  });

  it('石取り：両者パスで終わり、取った数が多いほうの勝ち・同じなら引き分け', () => {
    let s = initialState(6);
    s = pass(pass(s));
    expect(ishitoriResult(s, 3)).toBe(0);
    let t = { ...initialState(6), captures: [0, 2, 1] as [number, number, number] };
    t = pass(pass(t));
    expect(ishitoriResult(t, 3)).toBe(BLACK);
    let u = { ...initialState(6), captures: [0, 0, 1] as [number, number, number] };
    u = pass(pass(u));
    expect(ishitoriResult(u, 3)).toBe(WHITE);
  });

  it('打てる手が無いときは hasLegalMove が false（画面が自動でパスにする）', () => {
    // 盤を黒で埋め、2つの眼だけ空ける。白はどこにも打てない
    const rows = ['.XXXXX', 'XXXXXX', 'XXXXXX', 'XXXXXX', 'XXXXX.', 'XXXXXX'];
    const s = fromDiagram(rows, WHITE);
    expect(hasLegalMove(s)).toBe(false);
    expect(legalMoves(s)).toEqual([]);
    expect(hasLegalMove({ ...s, turn: BLACK })).toBe(true);
  });
});

describe('置き石', () => {
  it('9路の星に置き、白から打つ。コミは半目', () => {
    for (const h of [2, 3, 4, 5]) {
      const s = initialState(9, h);
      expect(s.cells.filter((v) => v === BLACK)).toHaveLength(h);
      expect(s.turn).toBe(WHITE);
      for (const p of handicapPoints(h)) expect(starPoints(9)).toContain(p);
      expect(scoreGame(s, []).komi).toBe(0.5);
    }
    expect(handicapPoints(2).map((p) => pointLabel(9, p))).toEqual(['7の三', '3の七']);
    expect(handicapPoints(5)).toContain(pointAt(9, 5, 5));
    const even = initialState(9, 0);
    expect(even.turn).toBe(BLACK);
    expect(scoreGame(even, []).komi).toBe(KOMI);
  });
});

describe('地の数え方（日本式）', () => {
  // 9路を縦に分けた形：左 4 列が黒の地、右が白の地
  const split = [
    '...XO....',
    '...XO....',
    '...XO....',
    '...XO....',
    '...XO....',
    '...XO....',
    '...XO....',
    '...XO....',
    '...XO....',
  ];

  it('その色の石だけに囲まれた空点を地として数え、白にコミ 6.5 を足す', () => {
    const s = fromDiagram(split);
    const sc = scoreGame(s, []);
    expect(sc.blackTerritory).toBe(27);
    expect(sc.whiteTerritory).toBe(36);
    expect(sc.black).toBe(27);
    expect(sc.white).toBe(42.5);
    expect(sc.winner).toBe(WHITE);
    expect(sc.margin).toBe(15.5);
    expect(sc.dame).toBe(0);
  });

  it('あげはまと死に石を、取った側に足す（死に石の点は相手の地になる）', () => {
    const rows = [...split];
    rows[4] = '...XO..X.'; // 白の地の中に黒の死に石
    const base = fromDiagram(rows);
    const s = { ...base, captures: [0, 2, 1] as [number, number, number] };
    const dead = [pointAt(9, 8, 5)];
    const sc = scoreGame(s, dead);
    expect(sc.deadBlack).toBe(1);
    expect(sc.whiteTerritory).toBe(36); // 死に石を除いた点も白の地
    expect(sc.whitePrisoners).toBe(1 + 1); // あげはま 1 ＋ 死に石 1
    expect(sc.blackPrisoners).toBe(2);
    expect(sc.black).toBe(27 + 2);
    expect(sc.white).toBe(36 + 2 + 6.5);
    expect(scoreSentence(sc)).toBe('黒 29 目・白 38 目＋コミ 6.5 ＝ 44.5 目 → 白の15目半勝ち');
  });

  it('両方の色に接する空点はダメ（誰の地にもならない）', () => {
    const rows = [...split];
    rows[0] = '...X.O...';
    const sc = scoreGame(fromDiagram(rows), []);
    expect(sc.dame).toBe(1);
    expect(sc.owners[pointAt(9, 5, 1)]).toBe('dame');
  });

  it('差の書き方（半目・4目半）', () => {
    expect(marginLabel(0.5)).toBe('半目');
    expect(marginLabel(4.5)).toBe('4目半');
    expect(marginLabel(3)).toBe('3目');
  });
});

describe('死に石の候補と、CPU と意見が分かれたとき', () => {
  it('相手の地の中に取り残された石を候補にし、生きた石は候補にしない', () => {
    // 左に黒の地、右 3 列に白の地。白の地の中の黒 1 子は死に石
    const rows = [
      '.....XO..',
      '.....XO..',
      '.....XO..',
      '.....XO..',
      '.....XO.X',
      '.....XO..',
      '.....XO..',
      '.....XO..',
      '.....XO..',
    ];
    const s = fromDiagram(rows, BLACK);
    const dead = estimateDead(pass(pass(s)), mulberry32(1));
    expect(dead).toEqual([pointAt(9, 9, 5)]);
  });

  it('同じ種なら同じ候補', () => {
    const s = fromDiagram(['......', '.XX...', '.X.X..', '..XO..', '...O..', '......']);
    expect(estimateDead(s, mulberry32(5), 100)).toEqual(estimateDead(s, mulberry32(5), 100));
  });

  it('石をタップすると、そのかたまりの「死に／生き」が切り替わる', () => {
    const s = fromDiagram(['XX....', '......', '....OO', '......', '......', '......']);
    const d1 = toggleDead(s, [], 0);
    expect(d1).toEqual([0, 1]);
    const d2 = toggleDead(s, d1, pointAt(6, 5, 3));
    expect(d2).toEqual([0, 1, pointAt(6, 5, 3), pointAt(6, 6, 3)]);
    expect(toggleDead(s, d2, 1)).toEqual([pointAt(6, 5, 3), pointAt(6, 6, 3)]);
    expect(toggleDead(s, d2, 2)).toEqual(d2); // 空点は何もしない
  });

  it('CPU 対戦：候補のとおりなら数えて記録する', () => {
    expect(decideCount({ vsCpu: true, candidates: [3, 4], chosen: [4, 3], resumes: 0 })).toEqual({
      action: 'count',
      dead: [3, 4],
      recorded: true,
    });
  });

  it('CPU 対戦：候補と違う直し方なら再開になり、直しただけの勝ちは記録に入らない', () => {
    expect(decideCount({ vsCpu: true, candidates: [3, 4], chosen: [], resumes: 0 })).toEqual({ action: 'resume' });
    expect(decideCount({ vsCpu: true, candidates: [3, 4], chosen: [3], resumes: 1 })).toEqual({ action: 'resume' });
    // 再開は 1 局に 2 回まで。3 回目は候補のとおりに数える（直しは捨てる）
    const third = decideCount({ vsCpu: true, candidates: [3, 4], chosen: [], resumes: MAX_RESUMES });
    expect(third).toEqual({ action: 'count', dead: [3, 4], recorded: true });
  });

  it('対面：どちらが直してもそのまま数え、記録は付けない', () => {
    expect(decideCount({ vsCpu: false, candidates: [3, 4], chosen: [7], resumes: 0 })).toEqual({
      action: 'count',
      dead: [7],
      recorded: false,
    });
  });
});

describe('1手もどす', () => {
  it('CPU 対戦は自分の手番まで（自分と CPU の 2 手）、対面は 1 手', () => {
    const h0 = initialState(9);
    const h1 = applyMove(h0, 40);
    const h2 = applyMove(h1, 41);
    const history = [h0, h1, h2];
    expect(undoIndex(history, BLACK)).toBe(0);
    expect(undoIndex(history, null)).toBe(1);
    expect(undoIndex([h0], BLACK)).toBe(null);
  });

  it('置き石で白から始まる対局でも、自分（黒）の手番まで戻す', () => {
    const h0 = initialState(9, 2);
    const h1 = applyMove(h0, 40); // 白（CPU）
    const h2 = applyMove(h1, 41); // 黒（自分）
    const h3 = applyMove(h2, 42); // 白
    expect(undoIndex([h0, h1, h2, h3], BLACK)).toBe(1);
    expect(undoIndex([h0, h1], BLACK)).toBe(null);
  });
});

describe('計測と記録の区分', () => {
  it('begin の action はモード・盤・強さ（対面は pvp）', () => {
    expect(beginAction('ishitori', 6, 'easy')).toBe('begin-ishitori-6-easy');
    expect(beginAction('taikyoku', 9, 'hard')).toBe('begin-taikyoku-9-hard');
    expect(beginAction('ishitori', 9, null)).toBe('begin-pvp-ishitori-9');
  });

  it('記録はモード × 盤 × 強さ別。置き石つきは別に数える', () => {
    expect(recordVariant('ishitori', 6, 'normal', 0)).toBe('ishitori-6-normal');
    expect(recordVariant('taikyoku', 9, 'hard', 0)).toBe('taikyoku-9-hard');
    expect(recordVariant('taikyoku', 9, 'hard', 2)).toBe('taikyoku-9-hard-handicap');
  });
});
