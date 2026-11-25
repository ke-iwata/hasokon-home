import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@/lib/daily';
import {
  canMove,
  cellFromPoint,
  dailyMaze,
  dirFromKey,
  E,
  generate,
  generateLevel,
  goal,
  grabCell,
  initialPath,
  isValidPath,
  LEVELS,
  levelOf,
  N,
  neighbor,
  passageCount,
  reachableCount,
  reachedGoal,
  routePathData,
  S,
  scrollToShow,
  solve,
  step,
  traceTo,
  variantOf,
  W,
  wallPathData,
  type Maze,
} from '@/lib/meiro';
import { games } from '@/lib/registry';

/**
 * 迷路のテスト。仕様: docs/features/game-meiro.md の「テスト」
 */

/** 壁が両側で食い違っていないか（片側だけ消えた壁は描画となぞりの判定がずれる） */
function wallsConsistent(maze: Maze): boolean {
  for (let i = 0; i < maze.walls.length; i++) {
    for (const [d, o] of [
      [N, S],
      [E, W],
      [S, N],
      [W, E],
    ] as const) {
      const n = neighbor(maze, i, d);
      if (n === null) {
        // 外周の壁は必ず立っている
        if ((maze.walls[i] & d) === 0) return false;
      } else if (((maze.walls[i] & d) === 0) !== ((maze.walls[n] & o) === 0)) {
        return false;
      }
    }
  }
  return true;
}

/** 3×3 の手作りの迷路。0→1→2→5→4→3→6→7→8 の1本道（S 字） */
function snake3(): Maze {
  const all = N | E | S | W;
  const walls = new Array(9).fill(all);
  const m: Maze = { w: 3, h: 3, walls };
  const open = (a: number, b: number) => {
    for (const d of [N, E, S, W] as const) {
      if (neighbor(m, a, d) === b) {
        walls[a] &= ~d;
        const o = d === N ? S : d === S ? N : d === E ? W : E;
        walls[b] &= ~o;
      }
    }
  };
  [
    [0, 1],
    [1, 2],
    [2, 5],
    [5, 4],
    [4, 3],
    [3, 6],
    [6, 7],
    [7, 8],
  ].forEach(([a, b]) => open(a, b));
  return m;
}

describe('段階', () => {
  it('5段階：ようじ 5×5・かんたん 8×8・ふつう 12×12・むずかしい 20×20・おにむず 30×30', () => {
    expect(LEVELS.map((l) => [l.id, l.label, l.size])).toEqual([
      ['youji', 'ようじ', 5],
      ['kantan', 'かんたん', 8],
      ['futsu', 'ふつう', 12],
      ['muzukashii', 'むずかしい', 20],
      ['onimuzu', 'おにむず', 30],
    ]);
  });

  it('levelOf は知らない段階で落ちる', () => {
    expect(() => levelOf('nope' as never)).toThrow();
  });

  it('記録の区分はフリーと今日の1面で分かれる', () => {
    expect(variantOf('futsu', false)).toBe('futsu');
    expect(variantOf('futsu', true)).toBe('daily-futsu');
  });
});

describe('生成（完全迷路）', () => {
  for (const level of LEVELS) {
    it(`${level.label}（${level.size}×${level.size}）：シード100個で全マスが届き、辺の数 = マス数 − 1`, () => {
      for (let seed = 1; seed <= 100; seed++) {
        const maze = generateLevel(level.id, mulberry32(seed));
        const cells = level.size * level.size;
        expect(maze.walls.length).toBe(cells);
        expect(reachableCount(maze)).toBe(cells);
        expect(passageCount(maze)).toBe(cells - 1);
        expect(wallsConsistent(maze)).toBe(true);
      }
    });
  }

  it('深さ優先も Wilson 法も、長方形でも完全迷路になる', () => {
    for (const algo of ['dfs', 'wilson'] as const) {
      for (let seed = 1; seed <= 30; seed++) {
        const maze = generate(7, 4, algo, mulberry32(seed));
        expect(reachableCount(maze)).toBe(28);
        expect(passageCount(maze)).toBe(27);
        expect(wallsConsistent(maze)).toBe(true);
      }
    }
  });

  it('1×1 の迷路は道が無く、スタート＝ゴール', () => {
    const maze = generate(1, 1, 'wilson', mulberry32(3));
    expect(passageCount(maze)).toBe(0);
    expect(solve(maze)).toEqual([0]);
  });

  it('同じシードで同じ迷路、違うシードで違う迷路', () => {
    for (const level of LEVELS) {
      const a = generateLevel(level.id, mulberry32(42));
      const b = generateLevel(level.id, mulberry32(42));
      const c = generateLevel(level.id, mulberry32(43));
      expect(a).toEqual(b);
      expect(a.walls).not.toEqual(c.walls);
    }
  });

  it('Math.random を呼ばない（乱数は注入する）', () => {
    const src = readFileSync(new URL('../lib/meiro.ts', import.meta.url), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/Math\.random/);
  });
});

describe('今日の1面', () => {
  it('同じ日なら同じ迷路、違う日なら違う迷路', () => {
    for (const level of LEVELS) {
      expect(dailyMaze(level.id, '2026-12-20')).toEqual(dailyMaze(level.id, '2026-12-20'));
      expect(dailyMaze(level.id, '2026-12-20').walls).not.toEqual(
        dailyMaze(level.id, '2026-12-21').walls,
      );
    }
  });

  it('今日の1面も完全迷路', () => {
    for (const level of LEVELS) {
      const maze = dailyMaze(level.id, '2027-01-01');
      expect(passageCount(maze)).toBe(level.size * level.size - 1);
      expect(reachableCount(maze)).toBe(level.size * level.size);
    }
  });

  it('同じ日の段階ごとに別の乱数列（5×5 と 8×8 で同じ形にならない）', () => {
    // 段階の番号を種に混ぜていること。混ぜていないと、かんたんの左上5×5がようじと同じ掘り順になる
    const youji = dailyMaze('youji', '2026-12-24');
    const kantan = dailyMaze('kantan', '2026-12-24');
    const corner = (m: Maze) =>
      Array.from({ length: 25 }, (_, i) => m.walls[Math.floor(i / 5) * m.w + (i % 5)] & (E | S));
    expect(corner(youji)).not.toEqual(corner(kantan));
  });
});

describe('solve（答えの道）', () => {
  it('スタートからゴールまで、隣り合う通れるマスだけでできている', () => {
    for (const level of LEVELS) {
      for (let seed = 1; seed <= 20; seed++) {
        const maze = generateLevel(level.id, mulberry32(seed));
        const path = solve(maze);
        expect(path[0]).toBe(0);
        expect(path[path.length - 1]).toBe(goal(maze));
        expect(isValidPath(maze, path)).toBe(true);
      }
    }
  });

  it('手作りの S 字迷路の答え', () => {
    expect(solve(snake3())).toEqual([0, 1, 2, 5, 4, 3, 6, 7, 8]);
  });

  it('ゴールに届かない盤（完全迷路でない）なら空', () => {
    const maze: Maze = { w: 2, h: 1, walls: [N | E | S | W, N | E | S | W] };
    expect(solve(maze)).toEqual([]);
  });
});

describe('canMove（壁の判定）', () => {
  const maze = snake3();
  it('壁の無い隣へは動ける（両方向）', () => {
    expect(canMove(maze, 0, 1)).toBe(true);
    expect(canMove(maze, 1, 0)).toBe(true);
    expect(canMove(maze, 2, 5)).toBe(true);
  });
  it('壁の向こうを拒む', () => {
    expect(canMove(maze, 0, 3)).toBe(false);
    expect(canMove(maze, 1, 4)).toBe(false);
  });
  it('隣でない・斜め・盤の外を拒む', () => {
    expect(canMove(maze, 0, 2)).toBe(false);
    expect(canMove(maze, 0, 4)).toBe(false);
    expect(canMove(maze, 2, 3)).toBe(false); // 行の端から次の行の頭へ折り返さない
    expect(canMove(maze, 0, -1)).toBe(false);
    expect(canMove(maze, 8, 9)).toBe(false);
  });
});

describe('なぞる（traceTo）', () => {
  const maze = snake3();

  it('隣の通れるマスへ伸び、壁の向こうへは伸びない', () => {
    let p = traceTo(maze, initialPath(maze), 1);
    expect(p).toEqual([0, 1]);
    p = traceTo(maze, p, 4); // 1 と 4 のあいだは壁
    expect(p).toEqual([0, 1]);
  });

  it('来た道を戻ると線が消える', () => {
    const p = traceTo(maze, [0, 1, 2, 5, 4], 1);
    expect(p).toEqual([0, 1]);
    expect(traceTo(maze, [0, 1, 2], 2)).toEqual([0, 1, 2]);
  });

  it('同じ行・列で壁が無ければ飛ばしたマスもまとめて伸ばす', () => {
    expect(traceTo(maze, [0], 2)).toEqual([0, 1, 2]);
    // 途中に壁があれば伸ばさない
    expect(traceTo(maze, [0, 1, 2, 5, 4, 3], 6)).toEqual([0, 1, 2, 5, 4, 3, 6]);
    expect(traceTo(maze, [0, 1], 7)).toEqual([0, 1]);
  });

  it('斜め・離れたマスへは伸びない（ずるができない）', () => {
    expect(traceTo(maze, [0], 4)).toEqual([0]);
    expect(traceTo(maze, [0], 8)).toEqual([0]);
    expect(traceTo(maze, [0], 99)).toEqual([0]);
  });

  it('答えの道をそのままなぞればゴールに着く', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const m = generateLevel('futsu', mulberry32(seed));
      let p: readonly number[] = initialPath(m);
      for (const cell of solve(m).slice(1)) p = traceTo(m, p, cell);
      expect(reachedGoal(m, p)).toBe(true);
      expect(isValidPath(m, p)).toBe(true);
    }
  });

  it('ランダムになぞっても道はいつも正しい（壁を通らず、同じマスを2度通らない）', () => {
    const rng = mulberry32(7);
    const m = generateLevel('muzukashii', mulberry32(11));
    let p: readonly number[] = initialPath(m);
    for (let i = 0; i < 3000; i++) {
      p = traceTo(m, p, Math.floor(rng() * m.walls.length));
      expect(isValidPath(m, p)).toBe(true);
    }
  });
});

describe('キーボード（step）', () => {
  const maze = snake3();

  it('矢印キーの向き', () => {
    expect(dirFromKey('ArrowUp')).toBe(N);
    expect(dirFromKey('ArrowRight')).toBe(E);
    expect(dirFromKey('ArrowDown')).toBe(S);
    expect(dirFromKey('ArrowLeft')).toBe(W);
    expect(dirFromKey('a')).toBeNull();
  });

  it('1マスずつ進み、壁なら動かない、来た向きなら戻る', () => {
    let p = step(maze, [0], E);
    expect(p).toEqual([0, 1]);
    expect(step(maze, p, S)).toBe(p); // 壁
    expect(step(maze, p, N)).toBe(p); // 盤の外
    p = step(maze, p, W);
    expect(p).toEqual([0]);
  });

  it('すいすいモードは一本道をゴールまで進む', () => {
    expect(step(maze, [0], E, true)).toEqual([0, 1, 2, 5, 4, 3, 6, 7, 8]);
  });

  it('すいすいモードで戻るとスタートまで戻る（一本道なので）', () => {
    expect(step(maze, [0, 1, 2, 5, 4], E, true)).toEqual([0]);
  });

  it('すいすいモードは分かれ道で止まる', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const m = generateLevel('futsu', mulberry32(seed));
      const p = step(m, initialPath(m), (m.walls[0] & E) === 0 ? E : S, true);
      const head = p[p.length - 1];
      const openCount = [N, E, S, W].filter((d) => (m.walls[head] & d) === 0).length;
      expect(isValidPath(m, p)).toBe(true);
      expect(head === goal(m) || openCount !== 2).toBe(true);
    }
  });
});

describe('描画', () => {
  it('壁の線は、横・縦に続く壁を1本にまとめる（30×30 でも本数を抑える）', () => {
    const m = generateLevel('onimuzu', mulberry32(5));
    const segments = (wallPathData(m).match(/M/g) ?? []).length;
    // 壁の単位辺は外周を含めて数百本以上あるが、まとめれば大幅に減る
    let unit = 0;
    for (let i = 0; i < m.walls.length; i++) {
      if (m.walls[i] & N) unit++;
      if (m.walls[i] & W) unit++;
    }
    expect(segments).toBeLessThan(unit);
    expect(segments).toBeGreaterThan(0);
  });

  it('入口（左上の左辺）と出口（右下の右辺）は開いている', () => {
    const m = snake3();
    const d = wallPathData(m);
    // 左辺の縦線は y=1 から始まる（0〜1 は入口）
    expect(d).toContain('M0 1V3');
    // 右辺の縦線は y=2 で終わる（2〜3 は出口）
    expect(d).toContain('M3 0V2');
    // 上辺・下辺は全部壁
    expect(d).toContain('M0 0H3');
    expect(d).toContain('M0 3H3');
  });

  it('道の線はマスの中心を結ぶ', () => {
    expect(routePathData({ w: 3 }, [0, 1, 4])).toBe('M0.5 0.5L1.5 0.5L1.5 1.5');
  });
});

describe('画面の座標とマス（拡大）', () => {
  const m = { w: 30, h: 30 };
  // 盤 310px → 1マス 10px、左上の半マス（5px）が余白
  it('盤の座標からマスを引く（余白は盤の外）', () => {
    expect(cellFromPoint(5, 5, 310, m)).toBe(0);
    expect(cellFromPoint(14.9, 14.9, 310, m)).toBe(0);
    expect(cellFromPoint(15, 5, 310, m)).toBe(1);
    expect(cellFromPoint(5, 15, 310, m)).toBe(30);
    expect(cellFromPoint(304.9, 304.9, 310, m)).toBe(899);
    expect(cellFromPoint(4, 10, 310, m)).toBeNull();
    expect(cellFromPoint(306, 10, 310, m)).toBeNull();
    expect(cellFromPoint(10, 10, 0, m)).toBeNull();
  });

  it('同じ指の位置でも、スクロールした分だけ指の下のマスがずれる（なぞり中に追いかけてはいけない理由）', () => {
    // 300% で盤 930px（1マス 30px）。見える範囲 310px
    const before = cellFromPoint(300 + 0, 300, 930, m);
    const view = { left: 0, top: 0, width: 310, height: 310 };
    const scrolled = scrollToShow(before as number, m, 930, view);
    expect(scrolled.top).toBeGreaterThan(0);
    const after = cellFromPoint(300 + scrolled.left, 300 + scrolled.top, 930, m);
    expect(after).not.toBe(before);
  });

  it('見えていれば動かさない。見えていなければ余白2マスぶん内側に入れる', () => {
    const view = { left: 0, top: 0, width: 310, height: 310 };
    expect(scrollToShow(31, m, 930, view)).toEqual({ left: 0, top: 0 });
    // 右下のマス（899）：中心 900px。端で止まる（盤の外へはスクロールしない）
    expect(scrollToShow(899, m, 930, view)).toEqual({ left: 620, top: 620 });
    // 左上へ戻る
    expect(scrollToShow(0, m, 930, { ...view, left: 400, top: 400 })).toEqual({ left: 0, top: 0 });
    // 中ほど：マス (r=10, c=15) の中心 x=480・y=330。余白 60px → left=230, top=80
    expect(scrollToShow(10 * 30 + 15, m, 930, view)).toEqual({ left: 230, top: 80 });
  });

  it('なぞり始め：道の上ならそのマス、先端の1マス以内なら先端、それ以外は始めない', () => {
    const maze = { w: 5 };
    const path = [0, 1, 2, 7];
    expect(grabCell(maze, path, 1)).toBe(1);
    expect(grabCell(maze, path, 12)).toBe(7); // 先端の真下
    expect(grabCell(maze, path, 13)).toBe(7); // 斜め
    expect(grabCell(maze, path, 17)).toBeNull(); // 2マス下
    expect(grabCell(maze, path, 20)).toBeNull();
  });
});

describe('ページ', () => {
  const page = readFileSync(new URL('../app/meiro/page.tsx', import.meta.url), 'utf8');
  const gameSrc = readFileSync(new URL('../app/meiro/Game.tsx', import.meta.url), 'utf8');

  it('registry に wip で載っている（公開は別PR）', () => {
    const entry = games.find((g) => g.slug === 'meiro');
    expect(entry?.genre).toBe('puzzle');
    expect(entry?.stage).not.toBe('public');
  });

  it("metadata に robots: robotsFor('meiro')", () => {
    expect(page).toContain("robots: robotsFor('meiro')");
  });

  it('印刷は既存の trackToolUse で数える（新しいイベント名を作らない）', () => {
    expect(gameSrc).toContain("trackToolUse('meiro', 'print')");
    expect(gameSrc).toContain("trackToolUse('meiro', 'print-4up')");
    expect(gameSrc).not.toMatch(/gtag\(/);
  });

  it('表示位置の自動追従は、道（path）が変わるたびには走らない（なぞり中に線が勝手に伸びた回帰）', () => {
    const follow = gameSrc.slice(gameSrc.indexOf('scrollToShow(head'));
    const deps = follow.slice(follow.indexOf('}, ['), follow.indexOf(']);') + 1);
    expect(deps).toContain('followTick');
    expect(deps).not.toMatch(/\bpath\b/);
  });

  it('FAQ は実装に合わせる（移動のボタンは無く、2本指で動かす）', () => {
    expect(page).not.toContain('矢印のボタン');
    expect(page).toContain('2本の指');
  });

  it('@page は書かない（games の全ページの印刷に効いてしまう）', () => {
    const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
    expect(css).not.toMatch(/@page\s*\{/);
  });

  it('印刷物に hasokon.com/games/meiro/ を入れる', () => {
    expect(gameSrc).toContain('hasokon.com/games/meiro/');
  });

  it('なぞり中のスクロール止めは盤面の要素だけ（ページ全体に付けない）', () => {
    const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
    const rules = [...css.matchAll(/([^{}]+)\{[^{}]*touch-action:\s*none/g)].map((m) => m[1].trim());
    const meiro = rules.filter((sel) => sel.includes('mz-'));
    expect(meiro.length).toBeGreaterThan(0);
    for (const sel of meiro) expect(sel).toMatch(/\.mz-board-svg/);
    for (const sel of rules) expect(sel).not.toMatch(/^(html|body)\b/);
  });

  it('印刷用の CSS：答えは必ず2枚目、操作部品と広告は印刷しない', () => {
    const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
    const print = css.slice(css.indexOf('@media print'));
    expect(css).toContain('@media print');
    expect(print).toMatch(/\.mz-answers[^{]*\{[^}]*break-before:\s*page/);
    expect(print).toContain("[data-print='mz-sheet']");
  });
});
