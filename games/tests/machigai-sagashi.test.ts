import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cellCenter,
  cellDistance,
  cellLabel,
  COLORS,
  DAILY_VARIANT,
  dailyPuzzle,
  DIFFICULTIES,
  focusCells,
  generateScene,
  HINT_PENALTY_MS,
  hintAvailable,
  hintTarget,
  hitCell,
  hitTest,
  injectDifferences,
  makePuzzle,
  MIN_HIT_RADIUS,
  MIN_PICTURE_PX,
  shapePath,
  SHAPE_KINDS,
  shareText,
  totalTimeMs,
  variantOf,
  VIEW_H,
  VIEW_W,
  type Difficulty,
  type Puzzle,
  type Shape,
} from '@/lib/machigai-sagashi';

const LEVELS: Difficulty[] = ['easy', 'normal', 'hard'];
/** 盤面の性質は種を変えて広く確かめる */
const SEEDS = Array.from({ length: 150 }, (_, i) => (i * 2654435761) | 0);

function eachPuzzle(fn: (p: Puzzle, level: Difficulty, seed: number) => void) {
  for (const level of LEVELS) for (const seed of SEEDS) fn(makePuzzle(seed, level), level, seed);
}

function byCell(shapes: Shape[]) {
  return new Map(shapes.map((s) => [s.cell, s]));
}

describe('generateScene / makePuzzle', () => {
  it('同じシードからは同じ盤面（決定論）', () => {
    for (const level of LEVELS) {
      expect(makePuzzle(12345, level)).toEqual(makePuzzle(12345, level));
    }
    expect(dailyPuzzle('2026-10-01')).toEqual(dailyPuzzle('2026-10-01'));
  });

  it('シードが違えば盤面も違う', () => {
    expect(makePuzzle(1, 'normal')).not.toEqual(makePuzzle(2, 'normal'));
    expect(dailyPuzzle('2026-10-01')).not.toEqual(dailyPuzzle('2026-10-02'));
  });

  it('図形の数は難易度どおり（やさしい 12・ふつう 20・むずかしい 25）、1 マスに 1 個まで', () => {
    for (const level of LEVELS) {
      for (const seed of SEEDS.slice(0, 50)) {
        const scene = generateScene(seed, level);
        expect(scene.shapes).toHaveLength(DIFFICULTIES[level].shapes);
        expect(new Set(scene.shapes.map((s) => s.cell)).size).toBe(scene.shapes.length);
      }
    }
  });

  it('日替わりは 20 個・違い 5 で固定', () => {
    const p = dailyPuzzle('2026-10-01');
    expect(p.left.shapes).toHaveLength(20);
    expect(p.differences).toHaveLength(5);
  });

  it('違いの数は難易度どおり（やさしい 3・ふつう 5・むずかしい 5）', () => {
    eachPuzzle((p, level) => expect(p.differences).toHaveLength(DIFFICULTIES[level].differences));
  });

  it('図形は絵の中に収まる', () => {
    eachPuzzle((p) => {
      for (const s of [...p.left.shapes, ...p.right.shapes]) {
        expect(s.x - s.size).toBeGreaterThanOrEqual(0);
        expect(s.y - s.size).toBeGreaterThanOrEqual(0);
        expect(s.x + s.size).toBeLessThanOrEqual(VIEW_W);
        expect(s.y + s.size).toBeLessThanOrEqual(VIEW_H);
      }
    });
  });

  it('図形同士は最小距離を保つ（左右どちらの絵でも重ならない）', () => {
    eachPuzzle((p) => {
      for (const shapes of [p.left.shapes, p.right.shapes]) {
        for (let i = 0; i < shapes.length; i++) {
          for (let j = i + 1; j < shapes.length; j++) {
            const a = shapes[i];
            const b = shapes[j];
            expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.size + b.size + 2);
          }
        }
      }
    });
  }, 30_000);

  it('左の絵（元の盤面）は違いの注入で書き換わらない', () => {
    const scene = generateScene(7, 'normal');
    const copy = structuredClone(scene);
    injectDifferences(scene, 7, 5);
    expect(scene).toEqual(copy);
  });
});

describe('違いの注入', () => {
  it('違いは別々のマスに付き、種類も重複しない', () => {
    eachPuzzle((p) => {
      expect(new Set(p.differences.map((d) => d.cell)).size).toBe(p.differences.length);
      expect(new Set(p.differences.map((d) => d.kind)).size).toBe(p.differences.length);
    });
  });

  it('色だけの違いは 1 枚に最大 1 つ', () => {
    eachPuzzle((p) => {
      expect(p.differences.filter((d) => d.kind === 'color').length).toBeLessThanOrEqual(1);
    });
  });

  it('違いを付けたマスだけが左右で違い、ほかのマスは同じ', () => {
    eachPuzzle((p) => {
      const l = byCell(p.left.shapes);
      const r = byCell(p.right.shapes);
      const diffCells = new Set(p.differences.map((d) => d.cell));
      for (let cell = 0; cell < p.left.cols * p.left.rows; cell++) {
        if (diffCells.has(cell)) expect(r.get(cell)).not.toEqual(l.get(cell));
        else expect(r.get(cell)).toEqual(l.get(cell));
      }
    });
  });

  it('違いの種類どおりの変化だけが起きる（色の違いは色だけ・ほかの違いは色を変えない）', () => {
    eachPuzzle((p) => {
      const l = byCell(p.left.shapes);
      const r = byCell(p.right.shapes);
      for (const d of p.differences) {
        const a = l.get(d.cell);
        const b = r.get(d.cell);
        if (d.kind === 'add') {
          expect(a).toBeUndefined();
          expect(b).toBeDefined();
          continue;
        }
        if (d.kind === 'remove') {
          expect(a).toBeDefined();
          expect(b).toBeUndefined();
          continue;
        }
        expect(a && b).toBeTruthy();
        const changed = (Object.keys(a!) as (keyof Shape)[]).filter((k) => a![k] !== b![k]);
        const expected = {
          color: ['color'],
          size: ['size'],
          rotate: ['rotation'],
          pattern: ['pattern'],
          move: ['x', 'y'],
        }[d.kind];
        expect(changed.length).toBeGreaterThan(0);
        for (const k of changed) expect(expected).toContain(k);
        if (d.kind === 'color') expect(COLORS[b!.color]).not.toBe(COLORS[a!.color]);
        if (d.kind === 'size') expect(Math.abs(b!.size / a!.size - 1)).toBeGreaterThanOrEqual(0.15);
      }
    });
  });

  it('違いの 5 マスは互いに隣接しない（縦・横・斜めとも。チェビシェフ距離 2 以上）', () => {
    eachPuzzle((p) => {
      const ds = p.differences;
      for (let i = 0; i < ds.length; i++) {
        for (let j = i + 1; j < ds.length; j++) {
          expect(cellDistance(p.left.cols, ds[i].cell, ds[j].cell)).toBeGreaterThanOrEqual(2);
        }
      }
    });
  });

  it('その帰結として、当たり判定の円は重ならない', () => {
    eachPuzzle((p) => {
      const ds = p.differences;
      for (let i = 0; i < ds.length; i++) {
        for (let j = i + 1; j < ds.length; j++) {
          expect(Math.hypot(ds[i].x - ds[j].x, ds[i].y - ds[j].y)).toBeGreaterThan(ds[i].radius + ds[j].radius);
        }
      }
    });
  });

  it('当たり判定の半径は 20 以上で、図形の大きさ + 12 以上', () => {
    eachPuzzle((p) => {
      const l = byCell(p.left.shapes);
      const r = byCell(p.right.shapes);
      for (const d of p.differences) {
        expect(d.radius).toBeGreaterThanOrEqual(MIN_HIT_RADIUS);
        const sizes = [l.get(d.cell)?.size ?? 0, r.get(d.cell)?.size ?? 0];
        expect(d.radius).toBeGreaterThanOrEqual(Math.max(...sizes) + 12);
      }
    });
  });

  it('スマホの横幅いっぱい（約 358px・倍率 1.12）で円の直径が 44px 以上', () => {
    expect(MIN_HIT_RADIUS * 2 * (358 / VIEW_W)).toBeGreaterThanOrEqual(44);
  });

  it('絵の幅の下限（CSS と同じ値）でも円の直径が 44px 以上', () => {
    expect(MIN_HIT_RADIUS * 2 * (MIN_PICTURE_PX / VIEW_W)).toBeGreaterThanOrEqual(44);
    const css = readFileSync(join(__dirname, '../app/globals.css'), 'utf8');
    const floors = [...css.matchAll(/\.ms-pic,\s*\.ms-loading\s*\{[^}]*max-width:\s*max\((\d+)px/g)].map((m) => Number(m[1]));
    expect(floors.length).toBeGreaterThan(0);
    for (const px of floors) expect(px).toBe(MIN_PICTURE_PX);
  });

  it('違いの円は、変化した図形を覆う（左右どちらの図形の中心も円の中）', () => {
    eachPuzzle((p) => {
      const l = byCell(p.left.shapes);
      const r = byCell(p.right.shapes);
      for (const d of p.differences) {
        for (const s of [l.get(d.cell), r.get(d.cell)]) {
          if (!s) continue;
          expect(Math.hypot(s.x - d.x, s.y - d.y)).toBeLessThanOrEqual(d.radius);
        }
      }
    });
  });

  it('全部の種類の違いが、どこかの盤面で使われる', () => {
    const kinds = new Set<string>();
    eachPuzzle((p) => p.differences.forEach((d) => kinds.add(d.kind)));
    expect([...kinds].sort()).toEqual(['add', 'color', 'move', 'pattern', 'remove', 'rotate', 'size']);
  });
});

describe('hitTest / hitCell', () => {
  const p = makePuzzle(2026, 'normal');

  it('違いの中心をタップすると、その違いが返る', () => {
    p.differences.forEach((d, i) => expect(hitTest({ x: d.x, y: d.y }, p.differences)).toBe(i));
  });

  it('左右どちらの絵の座標でも同じ違いを返す（右の絵の図形の位置でも当たる）', () => {
    const l = byCell(p.left.shapes);
    const r = byCell(p.right.shapes);
    p.differences.forEach((d, i) => {
      const a = l.get(d.cell);
      const b = r.get(d.cell);
      if (a) expect(hitTest({ x: a.x, y: a.y }, p.differences)).toBe(i);
      if (b) expect(hitTest({ x: b.x, y: b.y }, p.differences)).toBe(i);
    });
  });

  it('円の縁の内側は当たり、外は外れ', () => {
    const d = p.differences[0];
    expect(hitTest({ x: d.x + d.radius - 0.5, y: d.y }, p.differences)).toBe(0);
    expect(hitTest({ x: d.x + d.radius + 0.5, y: d.y }, p.differences)).not.toBe(0);
  });

  it('違いの無い所は外れ', () => {
    const diffCells = new Set(p.differences.map((d) => d.cell));
    const other = p.left.shapes.find((s) => !diffCells.has(s.cell) && p.differences.every((d) => Math.hypot(s.x - d.x, s.y - d.y) > d.radius))!;
    expect(hitTest({ x: other.x, y: other.y }, p.differences)).toBeNull();
  });

  it('既に見つけた違いは無視する', () => {
    const d = p.differences[1];
    expect(hitTest({ x: d.x, y: d.y }, p.differences, new Set([1]))).toBeNull();
  });

  it('キーボードはマスで選ぶ。違いのマスなら当たり、見つけ済みなら外れ', () => {
    const d = p.differences[2];
    expect(hitCell(d.cell, p.differences)).toBe(2);
    expect(hitCell(d.cell, p.differences, new Set([2]))).toBeNull();
    const plain = p.left.shapes.find((s) => !p.differences.some((x) => x.cell === s.cell))!;
    expect(hitCell(plain.cell, p.differences)).toBeNull();
  });
});

describe('キーボード・読み上げ', () => {
  it('辿るマスは左右の図形のマスの和集合（消失・増加のマスも入る）', () => {
    eachPuzzle((p) => {
      const cells = focusCells(p);
      for (const s of [...p.left.shapes, ...p.right.shapes]) expect(cells).toContain(s.cell);
      for (const d of p.differences) expect(cells).toContain(d.cell);
      expect(cells).toEqual([...cells].sort((a, b) => a - b));
      expect(new Set(cells).size).toBe(cells.length);
    });
  });

  it('マスの名前は位置だけ（色・形を言わない）', () => {
    expect(cellLabel(5, 0)).toBe('1行1列');
    expect(cellLabel(5, 11)).toBe('3行2列');
    for (let cell = 0; cell < 25; cell++) expect(cellLabel(5, cell)).toMatch(/^\d+行\d+列$/);
  });

  it('マスの中心は格子どおり', () => {
    expect(cellCenter({ cols: 5, rows: 4 }, 0)).toEqual({ x: 32, y: 30 });
    expect(cellCenter({ cols: 5, rows: 4 }, 19)).toEqual({ x: 288, y: 210 });
  });
});

describe('ヒントとタイム', () => {
  it('60 秒でヒントが出る', () => {
    expect(hintAvailable(59_999)).toBe(false);
    expect(hintAvailable(60_000)).toBe(true);
  });

  it('ヒントのペナルティ（1 回 +15 秒）が timeMs に乗る', () => {
    expect(HINT_PENALTY_MS).toBe(15_000);
    expect(totalTimeMs(80_000, 0)).toBe(80_000);
    expect(totalTimeMs(80_000, 2)).toBe(110_000);
  });

  it('ヒントは未発見のうち最初の 1 つ。全部見つけたら無し', () => {
    const p = makePuzzle(5, 'normal');
    expect(hintTarget(p.differences, new Set())).toBe(0);
    expect(hintTarget(p.differences, new Set([0, 1]))).toBe(2);
    expect(hintTarget(p.differences, new Set([0, 1, 2, 3, 4]))).toBeNull();
  });
});

describe('記録の区分・共有・描画', () => {
  it('区分は日替わりが daily-v1、エンドレスが endless-{difficulty}', () => {
    expect(DAILY_VARIANT).toBe('daily-v1');
    expect(variantOf('daily')).toBe('daily-v1');
    expect(variantOf('easy')).toBe('endless-easy');
    expect(variantOf('normal')).toBe('endless-normal');
    expect(variantOf('hard')).toBe('endless-hard');
  });

  it('共有文は時間と日付だけ（違いの場所・種類を入れない）', () => {
    const text = shareText({ mode: 'daily', timeMs: 95_000, hints: 1, dateKey: '2026-10-01', streak: 3, url: 'https://hasokon.com/games/machigai-sagashi/' });
    expect(text).toBe('間違い探し 今日の1枚（2026-10-01）1:35 ／ ヒント1回 ／ 連続3日\nhttps://hasokon.com/games/machigai-sagashi/');
    expect(text).not.toMatch(/行|列|色|形/);
    expect(shareText({ mode: 'hard', timeMs: 61_000, hints: 0, url: 'u' })).toBe('間違い探し むずかしい 1:01\nu');
  });

  it('どの形も path を返す', () => {
    for (const kind of SHAPE_KINDS) expect(shapePath(kind, 15)).toMatch(/^M /);
  });
});
