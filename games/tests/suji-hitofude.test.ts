import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@/lib/daily';
import {
  backbite,
  BLOCKED_MESSAGE,
  blockedReason,
  canGrab,
  countSolutions,
  DAILY_GENERATOR_VERSION,
  DAILY_VARIANT,
  dailyPuzzle,
  dragTo,
  edgeKey,
  generateFor,
  isAdjacent,
  isSolved,
  lastNumber,
  MODES,
  nextNumber,
  numbersFrom,
  placeNumberPositions,
  placeWalls,
  serpentinePath,
  shareText,
  solve,
  step,
  variantOf,
  wallSegments,
  type Mode,
  type Puzzle,
} from '@/lib/suji-hitofude';

/**
 * ひとふでナンバーのテスト。
 *
 * 仕様: docs/features/game-suji-hitofude.md の「テスト」
 */

/** 全マスを 1 回ずつ、縦横の隣へ進む道か */
function isHamiltonian(path: number[], size: number): boolean {
  if (path.length !== size * size || new Set(path).size !== path.length) return false;
  for (let i = 1; i < path.length; i++) if (!isAdjacent(path[i - 1], path[i], size)) return false;
  return true;
}

/** 番号が道の順に 1, 2, 3, … と並んでいるか */
function numbersAscend(puzzle: Puzzle): boolean {
  const seq = puzzle.solution.map((c) => puzzle.numbers[c]).filter((v) => v > 0);
  return seq.every((v, i) => v === i + 1);
}

describe('道の作り方（バックビット法）', () => {
  it('蛇行の道は全マスを 1 回ずつ通る', () => {
    for (const size of [1, 2, 5, 6, 7]) expect(isHamiltonian(serpentinePath(size), size)).toBe(true);
  });

  it('つなぎ替えを何回しても全マスを 1 回ずつ通る道のまま', () => {
    const rng = mulberry32(7);
    let path = serpentinePath(6);
    for (let i = 0; i < 50; i++) {
      path = backbite(path, 6, rng, 20);
      expect(isHamiltonian(path, 6)).toBe(true);
    }
  });

  it('つなぎ替えると蛇行とは別の道になる', () => {
    const path = backbite(serpentinePath(6), 6, mulberry32(1), 36 * 30);
    expect(path).not.toEqual(serpentinePath(6));
  });
});

describe('番号と壁の置き方', () => {
  it('番号は道の始点と終点に必ず置き、数をそろえる', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 50; i++) {
      const pos = placeNumberPositions(36, 8, rng);
      expect(pos).toHaveLength(8);
      expect(pos[0]).toBe(0);
      expect(pos[pos.length - 1]).toBe(35);
      expect(new Set(pos).size).toBe(8);
    }
  });

  it('壁は道が通る境界には置かない', () => {
    const rng = mulberry32(5);
    const path = backbite(serpentinePath(7), 7, rng, 1000);
    const walls = placeWalls(path, 7, 8, rng);
    expect(walls).toHaveLength(8);
    for (let i = 1; i < path.length; i++) {
      expect(walls).not.toContain(edgeKey(path[i - 1], path[i], 7));
    }
  });

  it('壁の線は右か下の辺として引ける', () => {
    const puzzle: Puzzle = {
      size: 3,
      numbers: new Array(9).fill(0),
      walls: [edgeKey(0, 1, 3), edgeKey(4, 7, 3)],
      solution: [],
    };
    expect(wallSegments(puzzle)).toEqual([
      { cell: 0, side: 'right' },
      { cell: 4, side: 'bottom' },
    ]);
  });
});

describe('ソルバー', () => {
  it('既知の 2 解の盤で 2 を返し、番号を足すと 1 になる', () => {
    // 3×3 は市松に塗ると 5 マスと 4 マスなので、全マスを通る道の両端は多いほうの色
    // （角と中央）でないといけない。上の中（1）から始める盤は解が無い
    const size = 3;
    const odd = new Array(9).fill(0);
    odd[1] = 1;
    odd[7] = 2;
    expect(countSolutions({ size, numbers: odd, walls: [] })).toBe(0);
    // 1 を左上（0）、最後を右下（8）にすると、対角線で折り返した 2 通りがある
    const corner = new Array(9).fill(0);
    corner[0] = 1;
    corner[8] = 2;
    expect(countSolutions({ size, numbers: corner, walls: [] })).toBe(2);
    expect(solve({ size, numbers: corner, walls: [] }, 10).count).toBe(2);
    // 2 通りは 0→1→2→5→4→3→6→7→8 と 0→3→6→7→4→1→2→5→8。
    // 上の中（1）を 2、左の中（3）を 3 にすると、前者だけが番号の順を守る
    const fixed = [...corner];
    fixed[1] = 2;
    fixed[3] = 3;
    fixed[8] = 4;
    expect(countSolutions({ size, numbers: fixed, walls: [] })).toBe(1);
    expect(solve({ size, numbers: fixed, walls: [] }).solutions[0]).toEqual([0, 1, 2, 5, 4, 3, 6, 7, 8]);
  });

  it('壁で 2 解の片方を塞ぐと 1 解になる', () => {
    const size = 3;
    const corner = new Array(9).fill(0);
    corner[0] = 1;
    corner[8] = 2;
    // 0→3 を塞ぐと「0→1→2→5→4→3→6→7→8」だけになる
    expect(countSolutions({ size, numbers: corner, walls: [edgeKey(0, 3, size)] })).toBe(1);
  });

  it('解けない盤は 0 を返す', () => {
    const numbers = new Array(9).fill(0);
    numbers[0] = 1;
    numbers[1] = 2; // 最後の番号をいきなり踏むしかない
    expect(countSolutions({ size: 3, numbers, walls: [] })).toBe(0);
  });
});

describe('生成（100 盤 × 3 サイズ）', () => {
  const modes: Mode[] = ['easy', 'normal', 'hard'];
  for (const mode of modes) {
    it(`${MODES[mode].label}（${MODES[mode].size}×${MODES[mode].size}）はすべて一意解で、道が全マスを通り、番号が昇順`, () => {
      const rng = mulberry32(20260927 + mode.length);
      const def = MODES[mode];
      for (let i = 0; i < 100; i++) {
        const { puzzle } = generateFor(mode, rng);
        expect(puzzle.size).toBe(def.size);
        expect(isHamiltonian(puzzle.solution, def.size)).toBe(true);
        expect(numbersAscend(puzzle)).toBe(true);
        expect(puzzle.numbers[puzzle.solution[0]]).toBe(1);
        expect(puzzle.numbers[puzzle.solution[puzzle.solution.length - 1]]).toBe(lastNumber(puzzle));
        expect(lastNumber(puzzle)).toBeGreaterThanOrEqual(def.minNumbers);
        expect(countSolutions(puzzle)).toBe(1);
        expect(isSolved(puzzle, puzzle.solution)).toBe(true);
        if (def.maxWalls > 0) {
          expect(puzzle.walls.length).toBeGreaterThanOrEqual(def.minWalls);
          expect(puzzle.walls.length).toBeLessThanOrEqual(def.maxWalls);
        } else {
          expect(puzzle.walls).toEqual([]);
        }
      }
    });
  }

  it('番号の数はおおむねモードの範囲に収まる（上限を超えるのは一意にするため足したときだけ）', () => {
    const rng = mulberry32(11);
    let within = 0;
    for (let i = 0; i < 50; i++) {
      const g = generateFor('normal', rng);
      if (!g.relaxed) {
        within++;
        expect(lastNumber(g.puzzle)).toBeLessThanOrEqual(MODES.normal.maxNumbers);
      }
    }
    expect(within).toBeGreaterThanOrEqual(40);
  });
});

describe('今日の1問', () => {
  it('同じ日付キーからは同じ盤面（決定論）', () => {
    expect(dailyPuzzle('2026-09-27')).toEqual(dailyPuzzle('2026-09-27'));
  });

  it('日付が変われば違う盤面', () => {
    expect(dailyPuzzle('2026-09-28')).not.toEqual(dailyPuzzle('2026-09-27'));
  });

  it('ふつう相当（6×6・壁なし）で一意解', () => {
    const puzzle = dailyPuzzle('2026-09-27');
    expect(puzzle.size).toBe(MODES.normal.size);
    expect(puzzle.walls).toEqual([]);
    expect(countSolutions(puzzle)).toBe(1);
  });

  it('記録の区分は版つき（星置きと同じ daily-v{版}）', () => {
    expect(DAILY_VARIANT).toBe(`daily-v${DAILY_GENERATOR_VERSION}`);
    expect(variantOf('daily')).toBe(DAILY_VARIANT);
    expect(variantOf('easy')).toBe('easy');
    expect(variantOf('hard')).toBe('hard');
  });
});

describe('なぞる操作', () => {
  /**
   * 3×3、1 を左上・2 を右上・3 を右下。解は 0→1→2→5→4→3→6→7→8
   * 0(1) 1    2(2)
   * 3    4    5
   * 6    7    8(3)
   */
  const numbers = new Array(9).fill(0);
  numbers[0] = 1;
  numbers[2] = 2;
  numbers[8] = 3;
  const puzzle: Puzzle = { size: 3, numbers, walls: [edgeKey(3, 6, 3)], solution: [0, 1, 2, 5, 4, 3, 6, 7, 8] };

  it('道は「1」のマスからしか引き始められない', () => {
    expect(canGrab(puzzle, [], 0)).toBe(true);
    expect(canGrab(puzzle, [], 4)).toBe(false);
    expect(step(puzzle, [], 4)).toEqual({ path: [], blocked: 'start' });
    expect(step(puzzle, [], 0).path).toEqual([0]);
  });

  it('先端以外を押しても引き直せない（誤タップで道が壊れない）', () => {
    expect(canGrab(puzzle, [0, 1], 1)).toBe(true);
    expect(canGrab(puzzle, [0, 1], 0)).toBe(false);
  });

  it('1 つ前のマスに戻ると道が縮む', () => {
    expect(step(puzzle, [0, 1, 2], 1).path).toEqual([0, 1]);
    expect(step(puzzle, [0, 1], 0).path).toEqual([0]);
  });

  it('同じマスに留まっても何も変わらない', () => {
    expect(step(puzzle, [0, 1], 1)).toEqual({ path: [0, 1], blocked: null });
  });

  it('番号を飛ばすと弾く（2 より先に 3 は踏めない）', () => {
    expect(blockedReason(puzzle, [0, 1, 4, 5], 8)).toBe('order');
  });

  it('最後の番号は、ほかのマスを全部通ってからでないと踏めない', () => {
    // 2 を通ったあと、すぐ 3（右下）へ降りる
    expect(blockedReason(puzzle, [0, 1, 2, 5], 8)).toBe('last');
  });

  it('壁は越えられない', () => {
    expect(step(puzzle, [0, 1, 2, 5, 4, 3], 6)).toEqual({ path: [0, 1, 2, 5, 4, 3], blocked: 'wall' });
  });

  it('通った道には戻れない（1 つ前以外）', () => {
    expect(blockedReason(puzzle, [0, 1, 2, 5, 4, 3], 0)).toBe('visited');
  });

  it('隣でないマスには 1 歩で進めない', () => {
    expect(blockedReason(puzzle, [0], 4)).toBe('far');
  });

  it('次にたどる番号を数える', () => {
    expect(nextNumber(puzzle, [])).toBe(1);
    expect(nextNumber(puzzle, [0])).toBe(2);
    expect(nextNumber(puzzle, [0, 1, 2])).toBe(3);
  });

  it('速くなぞって間のマスが飛んでも、1 歩ずつ補って進む', () => {
    expect(dragTo(puzzle, [0], 2).path).toEqual([0, 1, 2]);
  });

  it('補って進む途中で弾かれたら、そこで止める', () => {
    // 0 → 1 → 2 → 5 と補い、最後の番号（右下）は全マスを通る前なので踏めない
    expect(dragTo(puzzle, [0], 8)).toEqual({ path: [0, 1, 2, 5], blocked: 'last' });
    // まっすぐ下は壁
    expect(dragTo(puzzle, [0, 1, 2, 5, 4, 3], 6)).toEqual({ path: [0, 1, 2, 5, 4, 3], blocked: 'wall' });
  });

  it('斜めに飛んだときは、補った 1 歩で道が縮まない順を採る', () => {
    // 2 から 4 へ：横 → 縦だと 1（1つ前）へ縮んでから降りる。縦 → 横なら 5 を通って 4 へ伸びる
    expect(dragTo(puzzle, [0, 1, 2], 4).path).toEqual([0, 1, 2, 5, 4]);
  });

  it('全マスを通って最後の番号で終わればクリア', () => {
    expect(isSolved({ ...puzzle, walls: [] }, [0, 1, 2, 5, 4, 3, 6, 7, 8])).toBe(true);
    // 壁を越えた道はクリアにしない
    expect(isSolved(puzzle, [0, 1, 2, 5, 4, 3, 6, 7, 8])).toBe(false);
    expect(isSolved(puzzle, [0, 1, 2, 5, 4])).toBe(false);
  });

  it('番号の順を破った道はクリアにしない', () => {
    const swapped = numbersFrom([0, 3, 6, 7, 4, 1, 2, 5, 8], [0, 1, 5, 8], 3);
    const p: Puzzle = { size: 3, numbers: swapped, walls: [], solution: [] };
    expect(isSolved(p, [0, 3, 6, 7, 4, 1, 2, 5, 8])).toBe(true);
    expect(isSolved(p, [0, 1, 2, 5, 4, 3, 6, 7, 8])).toBe(false);
  });
});

describe('弾いた理由の文言', () => {
  it('320px 幅の 1 行（0.75rem）に収まる 18 字以内', () => {
    for (const text of Object.values(BLOCKED_MESSAGE)) expect([...text].length).toBeLessThanOrEqual(18);
  });
});

describe('結果のコピー', () => {
  it('今日の1問は日付・タイム・連続日数と URL だけ（道の形を入れない）', () => {
    const text = shareText({
      mode: 'daily',
      size: 6,
      timeMs: 161_000,
      dateKey: '2026-09-27',
      streak: 5,
      url: 'https://hasokon.com/games/suji-hitofude/',
    });
    expect(text).toBe(
      'ひとふでナンバー 今日の1問（2026-09-27）2:41 ／ 連続5日\nhttps://hasokon.com/games/suji-hitofude/',
    );
  });

  it('連続 1 日のときは連続を書かない', () => {
    const text = shareText({ mode: 'daily', size: 6, timeMs: 61_000, dateKey: '2026-09-27', streak: 1, url: 'u' });
    expect(text).toBe('ひとふでナンバー 今日の1問（2026-09-27）1:01\nu');
  });

  it('難易度のモードではモード名と大きさ', () => {
    expect(shareText({ mode: 'hard', size: 7, timeMs: 5_000, url: 'u' })).toBe(
      'ひとふでナンバー むずかしい（7×7）0:05\nu',
    );
  });
});
