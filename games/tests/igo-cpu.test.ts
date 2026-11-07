import { describe, expect, it } from 'vitest';
import {
  BLACK,
  boardOf,
  EMPTY,
  initialState,
  isLegal,
  pass,
  play,
  PASS,
  pointAt,
  positionHash,
  WHITE,
  type BoardSize,
  type IgoState,
  type Level,
  type Mode,
  type Player,
} from '@/lib/igo';
import { attackWins, chooseMove, defendWins, ISHITORI_DEPTH, PLAYOUTS } from '@/lib/igo-cpu';

function fromDiagram(rows: string[], turn: Player = BLACK): IgoState {
  const size = rows.length as BoardSize;
  const cells = rows.join('').split('').map((ch) => (ch === 'X' ? BLACK : ch === 'O' ? WHITE : EMPTY));
  const base = initialState(size, 0);
  return { ...base, cells, turn, seen: [positionHash(size, cells, turn)] };
}

function move(state: IgoState, mode: Mode, level: Level, seed = 1, playouts?: number) {
  return chooseMove({ state, mode, level, target: 1, seed, playouts });
}

/** 黒の手番で、白 1 子（4の三）がアタリ。取る点は 5の三 */
const captureRows = [
  '.........',
  '...X.....',
  '..XO.....',
  '...X.....',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
];

/** 黒の手番で、黒 1 子（4の三）がアタリ。逃げる点は 5の三（そこから呼吸点が増える） */
const escapeRows = [
  '.........',
  '...O.....',
  '..OX.....',
  '...O.....',
  '.........',
  '.........',
  '......X..',
  '.........',
  '.........',
];

describe('CPU の段階と回数', () => {
  it('対局の回数は ふつう 3,000・つよい 20,000、石取りの読みは 2 手・4 手（仕様書の表）', () => {
    expect(PLAYOUTS).toEqual({ normal: 3000, hard: 20000 });
    expect(ISHITORI_DEPTH).toEqual({ normal: 2, hard: 4 });
  });

  it('プレイアウトの回数の上限で打ち切る（時刻は測らない）', () => {
    const s = initialState(9);
    expect(move(s, 'taikyoku', 'normal', 1, 200).playouts).toBe(200);
    expect(move(s, 'taikyoku', 'hard', 1, 350).playouts).toBe(350);
  });

  it('同じ局面・同じ種なら同じ手（どの段階・モードでも）', () => {
    const s = fromDiagram(escapeRows);
    for (const level of ['easy', 'normal', 'hard'] as Level[]) {
      for (const mode of ['ishitori', 'taikyoku'] as Mode[]) {
        const n = mode === 'taikyoku' && level !== 'easy' ? 300 : undefined;
        expect(move(s, mode, level, 42, n).move).toBe(move(s, mode, level, 42, n).move);
      }
    }
  }, 60000);

  it('返す手はいつも合法（スーパーコウまで）かパス', () => {
    let s = initialState(6);
    for (let k = 0; k < 30; k++) {
      const m = chooseMove({ state: s, mode: 'ishitori', level: k % 2 ? 'normal' : 'easy', target: 5, seed: k });
      if (m.move === PASS) {
        s = pass(s);
        continue;
      }
      expect(isLegal(s, m.move)).toBe(true);
      s = play(s, m.move);
    }
  });
});



describe('取れる石を取る・アタリから逃げる', () => {
  it('石取り（ふつう・つよい）：取れる石は必ず取る', () => {
    const s = fromDiagram(captureRows);
    for (const level of ['normal', 'hard'] as Level[]) {
      expect(move(s, 'ishitori', level).move).toBe(pointAt(9, 5, 3));
    }
  });

  it('対局（ふつう・つよい）：アタリの石を逃げる', () => {
    const s = fromDiagram(escapeRows);
    expect(move(s, 'taikyoku', 'normal', 3).move).toBe(pointAt(9, 5, 3));
    expect(move(s, 'taikyoku', 'hard', 3, 3000).move).toBe(pointAt(9, 5, 3));
  });

  it('対局（ふつう・つよい）：取れる石を取る', () => {
    const s = fromDiagram(captureRows);
    expect(move(s, 'taikyoku', 'normal', 3).move).toBe(pointAt(9, 5, 3));
    expect(move(s, 'taikyoku', 'hard', 3, 3000).move).toBe(pointAt(9, 5, 3));
  });

  it('石取り（ふつう・つよい）：アタリの石を逃げる', () => {
    const s = fromDiagram(escapeRows);
    for (const level of ['normal', 'hard'] as Level[]) {
      expect(move(s, 'ishitori', level).move).toBe(pointAt(9, 5, 3));
    }
  });

  it('かんたん：取れる石を 7 割前後で取る（乱数）', () => {
    const s = fromDiagram(captureRows);
    let took = 0;
    for (let seed = 0; seed < 200; seed++) if (move(s, 'ishitori', 'easy', seed).move === pointAt(9, 5, 3)) took++;
    expect(took).toBeGreaterThan(110);
    expect(took).toBeLessThan(175);
  });

  it('かんたん：アタリを 5 割前後で逃げる（乱数）', () => {
    const s = fromDiagram(escapeRows);
    let ran = 0;
    for (let seed = 0; seed < 200; seed++) if (move(s, 'ishitori', 'easy', seed).move === pointAt(9, 5, 3)) ran++;
    expect(ran).toBeGreaterThan(60);
    expect(ran).toBeLessThan(140);
  });

  it('かんたん（対局）：1 線には打たない', () => {
    const s = initialState(9);
    for (let seed = 0; seed < 40; seed++) {
      const p = move(s, 'taikyoku', 'easy', seed).move;
      const r = Math.floor(p / 9);
      const c = p % 9;
      expect(r > 0 && r < 8 && c > 0 && c < 8).toBe(true);
    }
  });
});

describe('シチョウを読む（ふつう以上）', () => {
  // 白 5の五 を、黒 5の四・4の五・6の六 で追う。逃げ道は上（6の二の方）と左下（2の六の方）の 2 本
  const ladder = [
    '.........',
    '.........',
    '.........',
    '....X....',
    '...XO....',
    '.....X...',
    '.........',
    '.........',
    '.........',
  ];
  const target = pointAt(9, 5, 5);
  const withWhite = (pts: [number, number][]) => {
    const rows = [...ladder];
    for (const [c, r] of pts) rows[r - 1] = rows[r - 1].slice(0, c - 1) + 'O' + rows[r - 1].slice(c);
    return fromDiagram(rows);
  };

  it('シチョウ：行く手に白の石が無ければ、攻める側が取れる', () => {
    const b = boardOf(fromDiagram(ladder));
    expect(attackWins(b, b.toIndex(target))).toBe(true);
  });

  it('シチョウあたり：両方の逃げ道に白の石があれば取れない（片方だけなら取れる）', () => {
    const one = boardOf(withWhite([[6, 2]]));
    expect(attackWins(one, one.toIndex(target))).toBe(true);
    const both = boardOf(withWhite([[6, 2], [2, 6]]));
    expect(attackWins(both, both.toIndex(target))).toBe(false);
  });

  it('呼吸点 3 の石は、シチョウでは取れない', () => {
    const rows = [...ladder];
    rows[3] = '.........';
    const b = boardOf(fromDiagram(rows));
    expect(attackWins(b, b.toIndex(target), undefined, 0)).toBe(false);
  });

  for (const level of ['normal', 'hard'] as Level[]) {
    it(`石取り（${level}）：シチョウで取れる石をアタリにして追う`, () => {
      const s = fromDiagram(ladder);
      const m = move(s, 'ishitori', level).move;
      const b = boardOf(s);
      b.play(b.toIndex(m), BLACK);
      expect(b.libertyCount(b.toIndex(target))).toBe(1);
      expect(defendWins(b, b.toIndex(target))).toBe(false);
    });
  }

});
