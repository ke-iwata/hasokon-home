import { describe, expect, it } from 'vitest';
import { dailySeed, mulberry32 } from '@/lib/daily';
import {
  analyze,
  autoCrossTargets,
  borderOf,
  countSolutions,
  CROSS,
  cycleMark,
  DAILY_GENERATOR_VERSION,
  dailyPuzzle,
  emptyMarks,
  EMPTY,
  findConflicts,
  findSolutions,
  generate,
  generateFor,
  growRegions,
  isSolved,
  MODE_ORDER,
  MODES,
  neighborsOf,
  orthogonalOf,
  placeStars,
  shareText,
  STAR,
  variantOf,
  type Mark,
  type Mode,
  type Puzzle,
} from '@/lib/hoshioki-puzzle';

/**
 * 星置きパズルのテスト。
 *
 * 仕様: docs/features/game-hoshioki-puzzle.md
 *
 * ここで守りたいのは3つ。
 *
 * 1. **出す問題が必ず解ける**（一意解・領域は連結・領域数 = N）
 * 2. **日替わりが端末によって変わらない**（同じ日付なら同じ盤面）
 * 3. **答えを漏らさない**（共有の文面に星の位置を入れない）
 */

/** テストで作る盤の数。**CI で現実的な時間で終わる数にしてある**（仕様書に書き戻した値） */
const SAMPLES: Record<number, number> = { 5: 300, 7: 200, 9: 20 };

/** 領域が連結しているか（上下左右でひとつながり） */
function isConnected(regions: number[], size: number, id: number): boolean {
  const cells = new Set<number>();
  for (let i = 0; i < regions.length; i++) if (regions[i] === id) cells.add(i);
  if (cells.size === 0) return false;
  const start = [...cells][0];
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    const cell = queue.pop() as number;
    for (const n of orthogonalOf(cell, size)) {
      if (cells.has(n) && !seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen.size === cells.size;
}

/** 盤の約束（一意解・領域は連結・領域数 = N）をまとめて確かめる */
function expectWellFormed(puzzle: Puzzle): void {
  const { size, regions, solution } = puzzle;
  expect(regions).toHaveLength(size * size);
  const ids = new Set(regions);
  expect(ids.size).toBe(size);
  for (let id = 0; id < size; id++) expect(isConnected(regions, size, id)).toBe(true);
  expect(countSolutions(regions, size, 3)).toBe(1);
  // 用意した解が、そのまま盤の解になっている
  expect([...findSolutions(regions, size, 2)[0]].sort((a, b) => a - b)).toEqual(
    [...solution].sort((a, b) => a - b),
  );
}

/** 解の配列を印の盤に直す */
function marksOf(puzzle: Puzzle, stars: number[]): Mark[] {
  const marks = emptyMarks(puzzle.size);
  for (const i of stars) marks[i] = STAR;
  return marks;
}

describe('星の配置', () => {
  it('各行・各列に1つずつ置かれ、斜めにも隣り合わない', () => {
    const rng = mulberry32(1);
    for (const size of [5, 7, 9]) {
      for (let i = 0; i < 50; i++) {
        const stars = placeStars(size, rng);
        expect(stars).not.toBeNull();
        const list = stars as number[];
        expect(new Set(list.map((s) => Math.floor(s / size))).size).toBe(size);
        expect(new Set(list.map((s) => s % size)).size).toBe(size);
        const set = new Set(list);
        for (const s of list) {
          for (const n of neighborsOf(s, size)) expect(set.has(n)).toBe(false);
        }
      }
    }
  });

  it('条件を満たす置き方が無い大きさでは null を返す', () => {
    const rng = mulberry32(2);
    // 3×3 以下は「隣の行と2つ以上離れた列」を全行ぶん取れない
    expect(placeStars(3, rng)).toBeNull();
  });
});

describe('領域の分割', () => {
  it('全マスがどれかの領域に入り、どの領域も連結している', () => {
    const rng = mulberry32(3);
    for (const size of [5, 7, 9]) {
      const stars = placeStars(size, rng) as number[];
      const regions = growRegions(size, stars, rng);
      expect(regions.filter((r) => r < 0)).toHaveLength(0);
      expect(new Set(regions).size).toBe(size);
      for (let id = 0; id < size; id++) expect(isConnected(regions, size, id)).toBe(true);
      // 種にした星は、その領域に入ったまま
      stars.forEach((cell, id) => expect(regions[cell]).toBe(id));
    }
  });
});

describe('ソルバー', () => {
  /**
   * 手で作った 5×5。領域は行そのもの（0行目が領域0…）で、
   * 行と領域が一致しているので**星の列の並べ方**だけが自由度になる。
   */
  const rowRegions = Array.from({ length: 25 }, (_, i) => Math.floor(i / 5));

  it('既知の盤面の解をすべて見つける', () => {
    // 領域が行と同じなので、条件は「各列に1つ・隣り合う行の列が2つ以上離れている」
    // だけになる。5×5 でこれを満たす並べ方は14通り（数え上げた値。上限20で打ち切らない）
    const solutions = findSolutions(rowRegions, 5, 20);
    expect(solutions).toHaveLength(14);
    for (const stars of solutions) {
      expect(new Set(stars.map((s) => s % 5)).size).toBe(5);
      const set = new Set(stars);
      for (const s of stars) for (const n of neighborsOf(s, 5)) expect(set.has(n)).toBe(false);
    }
  });

  it('解が1通りの盤面は1、星を1つ動かすと解が無くなる', () => {
    const rng = mulberry32(4);
    const { puzzle } = generate(5, rng, { maxAttempts: 1 });
    expect(countSolutions(puzzle.regions, 5, 3)).toBe(1);

    // 星の1つを同じ行の別のマスへ動かした盤面は、ルールを満たさない
    const moved = marksOf(puzzle, puzzle.solution);
    const star = puzzle.solution[0];
    const shifted = star % 5 === 4 ? star - 1 : star + 1;
    moved[star] = EMPTY;
    moved[shifted] = STAR;
    expect(isSolved(puzzle, moved)).toBe(false);
  });

  it('解が1つも無い盤面は0を返す', () => {
    // 1行に全領域を詰めると、他の行に置ける領域が残らない
    const impossible = Array.from({ length: 25 }, (_, i) => (i < 5 ? i : 0));
    expect(countSolutions(impossible, 5, 2)).toBe(0);
  });
});

describe('生成', () => {
  for (const size of [5, 7, 9]) {
    it(`${size}×${size} を ${SAMPLES[size]} 回作って、全件が一意解・連結領域・領域数 = ${size}`, () => {
      const rng = mulberry32(100 + size);
      for (let i = 0; i < SAMPLES[size]; i++) {
        expectWellFormed(generate(size, rng, { maxAttempts: 1 }).puzzle);
      }
    });
  }

  it('難易度の範囲に入る盤面を返す（モードごと）', () => {
    for (const mode of MODE_ORDER.filter((m) => m !== 'daily')) {
      const def = MODES[mode];
      const rng = mulberry32(200);
      const { puzzle, relaxed } = generateFor(mode, rng);
      expect(puzzle.size).toBe(def.size);
      if (!relaxed) {
        expect(puzzle.score).toBeGreaterThanOrEqual(def.minScore);
        expect(puzzle.score).toBeLessThanOrEqual(def.maxScore);
      }
      expectWellFormed(puzzle);
    }
  });

  it('推論だけで最後まで解ける盤面を出す（当てずっぽうを強いない）', () => {
    for (const mode of MODE_ORDER.filter((m) => m !== 'daily')) {
      const rng = mulberry32(300);
      for (let i = 0; i < 5; i++) {
        const { puzzle } = generateFor(mode, rng);
        expect(analyze(puzzle.regions, puzzle.size).solved).toBe(true);
      }
    }
  });

  /**
   * **打ち切りは試行回数で決める**（仕様書「4'」）。
   * 上限を 1 にしても一意解の盤面が返り、緩むのは難易度の条件だけ。
   */
  it('上限回数を1にしても一意解の盤面が返る（緩むのは難易度だけ）', () => {
    const rng = mulberry32(400);
    for (let i = 0; i < 30; i++) {
      // まず満たせない難易度を指定して、必ず打ち切らせる
      const result = generate(7, rng, { minScore: 9999, maxScore: 10000, maxAttempts: 1 });
      expect(result.relaxed).toBe(true);
      expect(result.attempts).toBe(1);
      expectWellFormed(result.puzzle);
    }
  });
});

describe('今日の1問', () => {
  it('同じ日付なら何度作っても同じ盤面（100回）', () => {
    const first = dailyPuzzle('2026-09-19');
    for (let i = 0; i < 100; i++) {
      const again = dailyPuzzle('2026-09-19');
      expect(again.regions).toEqual(first.regions);
      expect(again.solution).toEqual(first.solution);
    }
  });

  it('日付が変われば盤面も変わる', () => {
    const days = ['2026-09-18', '2026-09-19', '2026-09-20', '2026-10-01', '2027-01-01'];
    const seen = new Set(days.map((d) => JSON.stringify(dailyPuzzle(d).regions)));
    expect(seen.size).toBe(days.length);
  });

  /**
   * **生成手順を変えたら `DAILY_GENERATOR_VERSION` を上げる**という約束の裏付け。
   * 版が違えば種が変わり、同じ日付でも別の盤面になる
   * （＝上げ忘れると過去の「今日の1問」が黙って変わる、ということでもある）。
   */
  it('生成手順の版を変えると、同じ日付でも盤面が変わる', () => {
    const day = '2026-09-19';
    const now = dailySeed(day, DAILY_GENERATOR_VERSION);
    const next = dailySeed(day, DAILY_GENERATOR_VERSION + 1);
    expect(now).not.toBe(next);
    const a = generateFor('daily', mulberry32(now)).puzzle;
    const b = generateFor('daily', mulberry32(next)).puzzle;
    expect(a.regions).toEqual(dailyPuzzle(day).regions);
    expect(b.regions).not.toEqual(a.regions);
  });

  it('出す盤面は一意解で、推論だけで解ける', () => {
    for (const day of ['2026-09-19', '2026-12-31', '2027-02-28']) {
      const puzzle = dailyPuzzle(day);
      expectWellFormed(puzzle);
      expect(analyze(puzzle.regions, puzzle.size).solved).toBe(true);
    }
  });

  it('記録の区分は日替わりだけ版を持つ（難易度は難易度名そのまま）', () => {
    expect(variantOf('easy')).toBe('easy');
    expect(variantOf('normal')).toBe('normal');
    expect(variantOf('hard')).toBe('hard');
    expect(variantOf('daily')).toBe(`daily-v${DAILY_GENERATOR_VERSION}`);
    // キーはゲームごとに1本で、日替わりは variant で分ける（game-records.md の約束）
    const variants = new Set(MODE_ORDER.map((m: Mode) => variantOf(m)));
    expect(variants.size).toBe(MODE_ORDER.length);
  });
});

describe('操作', () => {
  const rng = mulberry32(500);
  const puzzle = generate(5, rng, { maxAttempts: 1 }).puzzle;

  it('タップで 空 → × → ★ → 空 と切り替わる', () => {
    expect(cycleMark(EMPTY)).toBe(CROSS);
    expect(cycleMark(CROSS)).toBe(STAR);
    expect(cycleMark(STAR)).toBe(EMPTY);
  });

  it('自動×は同じ行・列・領域と周囲8マスに入る', () => {
    const marks = emptyMarks(puzzle.size);
    const index = puzzle.solution[0];
    marks[index] = STAR;
    const targets = new Set(autoCrossTargets(puzzle, index, marks));
    const row = Math.floor(index / puzzle.size);
    const col = index % puzzle.size;
    for (let i = 0; i < puzzle.size * puzzle.size; i++) {
      if (i === index) {
        expect(targets.has(i)).toBe(false);
        continue;
      }
      const sameUnit =
        Math.floor(i / puzzle.size) === row ||
        i % puzzle.size === col ||
        puzzle.regions[i] === puzzle.regions[index];
      expect(targets.has(i)).toBe(sameUnit || neighborsOf(index, puzzle.size).includes(i));
    }
  });

  it('自動×は、すでに星のあるマスを塗りつぶさない', () => {
    const marks = emptyMarks(puzzle.size);
    const [a, b] = puzzle.solution;
    marks[a] = STAR;
    marks[b] = STAR;
    expect(autoCrossTargets(puzzle, a, marks)).not.toContain(b);
  });

  it('矛盾（同じ行・列・領域に2つ、斜めを含む隣接）を見つける', () => {
    const size = puzzle.size;
    // 同じ行に2つ
    const sameRow = emptyMarks(size);
    sameRow[0] = STAR;
    sameRow[2] = STAR;
    expect(findConflicts(puzzle, sameRow)).toEqual(new Set([0, 2]));

    // 斜めの隣接（同じ行・列・領域は避けて置く）
    const diagonal = emptyMarks(size);
    const first = puzzle.solution[0];
    const below = first + size + (first % size === size - 1 ? -1 : 1);
    diagonal[first] = STAR;
    diagonal[below] = STAR;
    expect(findConflicts(puzzle, diagonal).has(first)).toBe(true);
    expect(findConflicts(puzzle, diagonal).has(below)).toBe(true);

    // 正解には矛盾が無い
    expect(findConflicts(puzzle, marksOf(puzzle, puzzle.solution)).size).toBe(0);
  });

  it('クリア判定は「星が N 個あって矛盾が無い」', () => {
    expect(isSolved(puzzle, marksOf(puzzle, puzzle.solution))).toBe(true);
    // 1つ足りない
    const short = marksOf(puzzle, puzzle.solution.slice(1));
    expect(isSolved(puzzle, short)).toBe(false);
    // ×だけではクリアにならない
    const crosses = emptyMarks(puzzle.size).map(() => CROSS as Mark);
    expect(isSolved(puzzle, crosses)).toBe(false);
  });

  it('領域の境目と盤の外周に太線が立つ', () => {
    const size = puzzle.size;
    for (let i = 0; i < size * size; i++) {
      const edge = borderOf(puzzle, i);
      expect(edge.top).toBe(i < size || puzzle.regions[i - size] !== puzzle.regions[i]);
      expect(edge.left).toBe(i % size === 0 || puzzle.regions[i - 1] !== puzzle.regions[i]);
    }
  });
});

describe('結果の共有', () => {
  const puzzle = dailyPuzzle('2026-09-19');

  it('日付・サイズ・時間・連続日数だけを載せる', () => {
    const text = shareText({
      mode: 'daily',
      size: puzzle.size,
      timeMs: 161_000,
      dateKey: '2026-09-19',
      streak: 3,
      url: 'https://hasokon.com/games/hoshioki-puzzle/',
    });
    expect(text).toContain('2026-09-19');
    expect(text).toContain(`${puzzle.size}×${puzzle.size}`);
    expect(text).toContain('2:41');
    expect(text).toContain('連続 3日');
    expect(text).toContain('https://hasokon.com/games/hoshioki-puzzle/');
  });

  /**
   * **答えを漏らさない。** 星の位置が分かる絵文字の盤面を貼ると、
   * 日替わりの答えをそのまま配ることになる（仕様書の必須点）。
   */
  it('星の位置が分かるものを一切含まない', () => {
    const text = shareText({
      mode: 'daily',
      size: puzzle.size,
      timeMs: 61_000,
      dateKey: '2026-09-19',
      streak: 2,
      url: 'https://hasokon.com/games/hoshioki-puzzle/',
    });
    // 盤面の絵（★や⬛の並び）を入れていない
    expect(text).not.toMatch(/[★☆⭐⬛⬜🟦🟨🟩🟥]/u);
    // 行・列の番号も出さない（解の座標が読めてしまう）
    for (const cell of puzzle.solution) {
      const row = Math.floor(cell / puzzle.size) + 1;
      const col = (cell % puzzle.size) + 1;
      expect(text).not.toContain(`${row}行${col}列`);
    }
    // 4行（見出し・タイム・連続・URL）しかない
    expect(text.split('\n')).toHaveLength(4);
  });

  it('難易度モードでは日付と連続日数を載せない', () => {
    const text = shareText({
      mode: 'hard',
      size: 9,
      timeMs: 600_000,
      url: 'https://hasokon.com/games/hoshioki-puzzle/',
    });
    expect(text).toContain('むずかしい');
    expect(text).not.toContain('連続');
    expect(text.split('\n')).toHaveLength(3);
  });
});
