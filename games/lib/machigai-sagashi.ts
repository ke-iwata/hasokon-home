/**
 * 間違い探しのロジック（純関数）。
 *
 * 仕様: docs/features/game-machigai-sagashi.md
 *
 * 絵は**幾何図形をシードから並べて作る**（既存のイラスト・写真は使わない）。
 * 1 マスに 1 個まで図形を置き、右の絵にだけ違いを注入する。
 *
 * - 座標系は viewBox 320×240（4:3）。左右の絵は同じ座標系なので、
 *   どちらの絵をタップしても同じ座標で `hitTest` に渡せばよい
 * - 違いを付けるマスは**互いに隣接しない**（チェビシェフ距離 2 以上）。
 *   生成側の制約で、作ってから弾いて作り直す作りにはしない
 * - 色だけの違いはカタログに 1 種しかなく、種類は重複させないので、1 枚に最大 1 つ
 */

import { dailySeed, mulberry32, type DateKey } from './daily';

// ---- 座標系と格子 ----

export const VIEW_W = 320;
export const VIEW_H = 240;

/**
 * 当たり判定の円の最小半径（指のタップ領域。直径 44px 以上）。
 *
 * 仕様書は「横幅いっぱい（約 358px）で直径 44px」から 20 としていたが、実測ではカードの余白で
 * 390 幅でも絵は 336〜356px、横向きの小型端末（667×375）では横並びで約 300px になる。
 * **絵の幅の下限 `MIN_PICTURE_PX`（294px）でも 44px を割らない 24** にしている
 * （隣接しないマス同士は中心が 128・120 以上離れ、半径は最大でも 36 なので、円は重ならないまま）
 */
export const MIN_HIT_RADIUS = 24;
/**
 * 絵の表示幅の下限（px）。`app/globals.css` の `.ms-pic` の下限と同じ値にする。
 * **320px 幅の端末は対象外**（絵がカードに収まる 286px になり、円の直径は約 43px）
 */
export const MIN_PICTURE_PX = 294;
/** 当たり判定の円は「図形の大きさ + この値」 */
export const HIT_MARGIN = 12;

/** ヒント 1 回のペナルティ（記録の timeMs に足す） */
export const HINT_PENALTY_MS = 15_000;
/** ヒントボタンが出るまでの経過時間 */
export const HINT_AFTER_MS = 60_000;
/** 誤タップがこの回数続いたら、1 度だけ注意を出す */
export const MISS_STREAK_NOTE = 3;

// ---- 図形 ----

export type ShapeKind =
  | 'circle'
  | 'square'
  | 'triangle'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'star'
  | 'cross'
  | 'arrow'
  | 'crescent'
  | 'wave';

export const SHAPE_KINDS: readonly ShapeKind[] = [
  'circle',
  'square',
  'triangle',
  'diamond',
  'pentagon',
  'hexagon',
  'star',
  'cross',
  'arrow',
  'crescent',
  'wave',
];

/**
 * 回転の違いを付けられる形と、そのとき回す角度。
 * 回しても同じに見える形（円・正方形・十字・六角形・ひし形・波線）は入れない
 */
const ROTATE_DELTA: Partial<Record<ShapeKind, number>> = {
  triangle: 180,
  pentagon: 180,
  star: 180,
  arrow: 180,
  crescent: 180,
};

export type Pattern = 'none' | 'stripe' | 'dots';

/**
 * 色。互いに明度・色相が離れたものだけを使う。
 * **色だけで見分ける違いは 1 枚に 1 つまで**（色覚多様性。仕様書）
 */
export const COLORS: readonly string[] = ['#e4572e', '#f2b134', '#2a9d5c', '#2f6fd0', '#8a4fbf', '#4a4a4a'];

export interface Shape {
  /** 格子のマス（行 × 列数 + 列） */
  cell: number;
  kind: ShapeKind;
  x: number;
  y: number;
  /** 外接円の半径（図形はこの円に収まる） */
  size: number;
  /** 回転（度） */
  rotation: number;
  color: number;
  pattern: Pattern;
}

export interface Scene {
  cols: number;
  rows: number;
  /** マスの中心と配置のゆれの幅など、生成の条件 */
  difficulty: Difficulty;
  shapes: Shape[];
}

// ---- 難易度 ----

export type Difficulty = 'easy' | 'normal' | 'hard';
export type Mode = Difficulty | 'daily';

interface DifficultyDef {
  label: string;
  cols: number;
  rows: number;
  /** 置く図形の数 */
  shapes: number;
  /** 違いの数 */
  differences: number;
  minSize: number;
  maxSize: number;
  /** マスの中心からのゆれ（± 座標単位） */
  jitter: number;
  /** 位置ずらしの量（座標単位） */
  shift: number;
}

/**
 * 5×4 の格子（1 マス 64×60）に置く。むずかしいだけ 25 個を置くため 5×5（1 マス 64×48）にして、
 * 図形と違いを小さめにする。
 */
export const DIFFICULTIES: Record<Difficulty, DifficultyDef> = {
  easy: { label: 'やさしい', cols: 5, rows: 4, shapes: 12, differences: 3, minSize: 13, maxSize: 19, jitter: 6, shift: 9 },
  normal: { label: 'ふつう', cols: 5, rows: 4, shapes: 20, differences: 5, minSize: 12, maxSize: 19, jitter: 6, shift: 8 },
  hard: { label: 'むずかしい', cols: 5, rows: 5, shapes: 25, differences: 5, minSize: 9, maxSize: 14, jitter: 4, shift: 6 },
};

export const MODE_ORDER: Mode[] = ['daily', 'easy', 'normal', 'hard'];

export const MODE_LABEL: Record<Mode, string> = {
  daily: '今日の1枚',
  easy: DIFFICULTIES.easy.label,
  normal: DIFFICULTIES.normal.label,
  hard: DIFFICULTIES.hard.label,
};

/** 日替わりは固定（20 個・違い 5） */
export const DAILY_DIFFICULTY: Difficulty = 'normal';

/**
 * 日替わりの生成手順の版。**生成の手順を変えたら上げる**
 * （上げないと、過去の「今日の1枚」が黙って別の絵になり、記録の区分も混ざる）
 */
export const DAILY_VERSION = 1;
export const DAILY_VARIANT = `daily-v${DAILY_VERSION}`;

/** 記録の区分。日替わりは `daily-v1`、エンドレスは `endless-{difficulty}` */
export function variantOf(mode: Mode): string {
  return mode === 'daily' ? DAILY_VARIANT : `endless-${mode}`;
}

export function difficultyOf(mode: Mode): Difficulty {
  return mode === 'daily' ? DAILY_DIFFICULTY : mode;
}

// ---- 格子 ----

export function cellWidth(scene: Pick<Scene, 'cols'>): number {
  return VIEW_W / scene.cols;
}
export function cellHeight(scene: Pick<Scene, 'rows'>): number {
  return VIEW_H / scene.rows;
}
export function cellCenter(scene: Pick<Scene, 'cols' | 'rows'>, cell: number): { x: number; y: number } {
  const c = cell % scene.cols;
  const r = Math.floor(cell / scene.cols);
  return { x: (c + 0.5) * cellWidth(scene), y: (r + 0.5) * cellHeight(scene) };
}

/** 2 マスのチェビシェフ距離（縦・横・斜めに隣り合えば 1） */
export function cellDistance(cols: number, a: number, b: number): number {
  return Math.max(Math.abs((a % cols) - (b % cols)), Math.abs(Math.floor(a / cols) - Math.floor(b / cols)));
}

/** キーボード・読み上げ用のマスの名前。**位置だけ**を言い、色・形・有無は言わない */
export function cellLabel(cols: number, cell: number): string {
  return `${Math.floor(cell / cols) + 1}行${(cell % cols) + 1}列`;
}

// ---- 乱数の小道具 ----

type Rng = () => number;

function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)];
}

function shuffle<T>(rng: Rng, list: readonly T[]): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---- 盤面の生成 ----

/** 図形の模様。波線は線なので模様を付けない */
function patternFor(rng: Rng, kind: ShapeKind): Pattern {
  if (kind === 'wave') return 'none';
  const r = rng();
  return r < 0.7 ? 'none' : r < 0.85 ? 'stripe' : 'dots';
}

/**
 * 図形を並べる。格子の各マスに 1 個まで、中心から ±jitter ゆらして置く。
 * 図形の数がマスより少ないとき（やさしい）は、置くマスをシードから選ぶ。
 */
export function generateScene(seed: number, difficulty: Difficulty): Scene {
  const def = DIFFICULTIES[difficulty];
  const rng = mulberry32(seed);
  const total = def.cols * def.rows;
  const cells = shuffle(
    rng,
    Array.from({ length: total }, (_, i) => i),
  )
    .slice(0, Math.min(def.shapes, total))
    .sort((a, b) => a - b);
  const grid = { cols: def.cols, rows: def.rows };
  const shapes = cells.map((cell): Shape => {
    const center = cellCenter(grid, cell);
    const kind = pick(rng, SHAPE_KINDS);
    return {
      cell,
      kind,
      x: center.x + randInt(rng, -def.jitter, def.jitter),
      y: center.y + randInt(rng, -def.jitter, def.jitter),
      size: randInt(rng, def.minSize, def.maxSize),
      rotation: randInt(rng, 0, 7) * 45,
      color: randInt(rng, 0, COLORS.length - 1),
      pattern: patternFor(rng, kind),
    };
  });
  return { cols: def.cols, rows: def.rows, difficulty, shapes };
}

// ---- 違いの注入 ----

/** 違いの種類（カタログ）。color だけが「色だけの違い」 */
export type DifferenceKind = 'color' | 'size' | 'rotate' | 'remove' | 'move' | 'add' | 'pattern';

export const DIFFERENCE_KINDS: readonly DifferenceKind[] = ['color', 'size', 'rotate', 'remove', 'move', 'add', 'pattern'];

export interface Difference {
  kind: DifferenceKind;
  cell: number;
  /** 当たり判定の円の中心と半径（viewBox の単位） */
  x: number;
  y: number;
  radius: number;
}

export interface Puzzle {
  left: Scene;
  right: Scene;
  differences: Difference[];
}

/** その種類の違いを、そのマスに付けられるか */
function canApply(kind: DifferenceKind, shape: Shape | undefined): boolean {
  if (kind === 'add') return shape === undefined;
  if (shape === undefined) return false;
  if (kind === 'rotate') return ROTATE_DELTA[shape.kind] !== undefined;
  if (kind === 'pattern') return shape.kind !== 'wave';
  return true;
}

/**
 * 違いを付ける (種類, マス) の組を探す。種類は重複させず、マスは互いに隣接させない。
 *
 * 深さ優先で全部を試すので、組めるなら必ず見つかる（並びはシードで散らす）。
 * 5×4・5×5 の格子は、1 行おき・1 列おきのマス（2 行 × 3 列 = 6 マス）が互いに隣接しないので、
 * 全マスに図形がある盤なら 5 つは必ず取れる。やさしい（12 個・違い 3）でも、
 * 偶数行の 6 マスか奇数行の 6 マスのどちらかに図形が 2 個以上あり（12 マスに 12 − 8 = 4 個以上）、
 * 残る 1 マスは空なら「増える」、あればほかの種類で埋まる。
 */
function chooseTargets(
  rng: Rng,
  scene: Scene,
  count: number,
): { kind: DifferenceKind; cell: number }[] {
  const byCell = new Map(scene.shapes.map((s) => [s.cell, s]));
  const total = scene.cols * scene.rows;
  const cells = shuffle(
    rng,
    Array.from({ length: total }, (_, i) => i),
  );
  const kinds = shuffle(rng, DIFFERENCE_KINDS);
  const chosen: { kind: DifferenceKind; cell: number }[] = [];
  const usedKinds = new Set<DifferenceKind>();

  const dfs = (): boolean => {
    if (chosen.length === count) return true;
    for (const kind of kinds) {
      if (usedKinds.has(kind)) continue;
      for (const cell of cells) {
        if (chosen.some((c) => cellDistance(scene.cols, c.cell, cell) < 2)) continue;
        if (!canApply(kind, byCell.get(cell))) continue;
        chosen.push({ kind, cell });
        usedKinds.add(kind);
        if (dfs()) return true;
        chosen.pop();
        usedKinds.delete(kind);
      }
    }
    return false;
  };

  if (!dfs()) throw new Error('machigai-sagashi: 違いを付けるマスが選べない');
  return chosen;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function hitRadius(...sizes: number[]): number {
  return Math.max(MIN_HIT_RADIUS, Math.max(...sizes) + HIT_MARGIN);
}

/**
 * 左の絵から、違いを `count` 個付けた右の絵を作る。左の絵は書き換えない。
 * 当たり判定の円は `max(20, 図形の大きさ + 12)`（大きさは左右の大きいほう）。
 */
export function injectDifferences(scene: Scene, seed: number, count = 5): Puzzle {
  const def = DIFFICULTIES[scene.difficulty];
  // 盤面の生成と同じ種から始めると並びが揃ってしまうので、ずらしてから使う
  const rng = mulberry32((seed ^ 0x5bd1e995) | 0);
  const targets = chooseTargets(rng, scene, count);
  const right: Shape[] = scene.shapes.map((s) => ({ ...s }));
  const differences: Difference[] = [];

  for (const { kind, cell } of targets) {
    const idx = right.findIndex((s) => s.cell === cell);
    const before = idx >= 0 ? right[idx] : undefined;
    switch (kind) {
      case 'color': {
        const s = before!;
        const others = COLORS.map((_, i) => i).filter((i) => i !== s.color);
        right[idx] = { ...s, color: pick(rng, others) };
        differences.push({ kind, cell, x: s.x, y: s.y, radius: hitRadius(s.size) });
        break;
      }
      case 'size': {
        const s = before!;
        const grow = rng() < 0.5;
        const size = Math.round(s.size * (grow ? 1.25 : 0.75));
        right[idx] = { ...s, size };
        differences.push({ kind, cell, x: s.x, y: s.y, radius: hitRadius(s.size, size) });
        break;
      }
      case 'rotate': {
        const s = before!;
        right[idx] = { ...s, rotation: (s.rotation + (ROTATE_DELTA[s.kind] ?? 180)) % 360 };
        differences.push({ kind, cell, x: s.x, y: s.y, radius: hitRadius(s.size) });
        break;
      }
      case 'remove': {
        const s = before!;
        right.splice(idx, 1);
        differences.push({ kind, cell, x: s.x, y: s.y, radius: hitRadius(s.size) });
        break;
      }
      case 'move': {
        const s = before!;
        // 8 方向のどれかへ。マスの外へは出さない（隣の図形とぶつからないように）
        const dirs = shuffle(rng, [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ]);
        const center = cellCenter(scene, cell);
        let moved = { x: s.x, y: s.y };
        for (const [dx, dy] of dirs) {
          const x = s.x + dx * def.shift;
          const y = s.y + dy * def.shift;
          // マスの中心からのずれを「ゆれ + ずらし」以内に保つ（最小距離の計算の前提）
          if (Math.abs(x - center.x) <= def.shift && Math.abs(y - center.y) <= def.shift) {
            moved = { x, y };
            break;
          }
        }
        right[idx] = { ...s, ...moved };
        differences.push({
          kind,
          cell,
          x: (s.x + moved.x) / 2,
          y: (s.y + moved.y) / 2,
          radius: hitRadius(s.size),
        });
        break;
      }
      case 'add': {
        const center = cellCenter(scene, cell);
        const kindOfShape = pick(rng, SHAPE_KINDS);
        const added: Shape = {
          cell,
          kind: kindOfShape,
          x: clamp(center.x + randInt(rng, -def.jitter, def.jitter), 0, VIEW_W),
          y: clamp(center.y + randInt(rng, -def.jitter, def.jitter), 0, VIEW_H),
          size: randInt(rng, def.minSize, def.maxSize),
          rotation: randInt(rng, 0, 7) * 45,
          color: randInt(rng, 0, COLORS.length - 1),
          pattern: patternFor(rng, kindOfShape),
        };
        right.push(added);
        differences.push({ kind, cell, x: added.x, y: added.y, radius: hitRadius(added.size) });
        break;
      }
      case 'pattern': {
        const s = before!;
        const pattern: Pattern = s.pattern === 'none' ? (rng() < 0.5 ? 'stripe' : 'dots') : 'none';
        right[idx] = { ...s, pattern };
        differences.push({ kind, cell, x: s.x, y: s.y, radius: hitRadius(s.size) });
        break;
      }
    }
  }
  right.sort((a, b) => a.cell - b.cell);
  // 違いはマスの順に並べる（見つけた順の表示とは関係ない。ヒントは若い順に出す）
  differences.sort((a, b) => a.cell - b.cell);
  return { left: scene, right: { ...scene, shapes: right }, differences };
}

/** 1 枚を作る（生成 + 注入） */
export function makePuzzle(seed: number, difficulty: Difficulty): Puzzle {
  return injectDifferences(generateScene(seed, difficulty), seed, DIFFICULTIES[difficulty].differences);
}

/** 今日の1枚。日付だけから作るので、同じ日は全員同じ絵 */
export function dailyPuzzle(dateKey: DateKey): Puzzle {
  return makePuzzle(dailySeed(dateKey, DAILY_VERSION), DAILY_DIFFICULTY);
}

// ---- 当たり判定・進行 ----

/**
 * タップした点（viewBox の座標）が当たった違いの番号。外れなら null。
 * 左右の絵は同じ座標系なので、どちらの絵の座標でもそのまま渡せる。既に見つけた違いは無視する。
 */
export function hitTest(
  point: { x: number; y: number },
  differences: readonly Difference[],
  found: ReadonlySet<number> = new Set(),
): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  differences.forEach((d, i) => {
    if (found.has(i)) return;
    const dist = Math.hypot(point.x - d.x, point.y - d.y);
    if (dist <= d.radius && dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  });
  return best;
}

/** キーボード操作：そのマスの違い（未発見のもの）。無ければ null */
export function hitCell(cell: number, differences: readonly Difference[], found: ReadonlySet<number> = new Set()): number | null {
  const i = differences.findIndex((d, idx) => d.cell === cell && !found.has(idx));
  return i >= 0 ? i : null;
}

/**
 * キーボードで辿るマス。左右の絵の図形がある**マスの和集合**（若い順）。
 * 消失・増加で左右の図形の集合が違っても、和集合なら辿る対象が 1 つに定まる
 */
export function focusCells(puzzle: Puzzle): number[] {
  const set = new Set<number>();
  for (const s of puzzle.left.shapes) set.add(s.cell);
  for (const s of puzzle.right.shapes) set.add(s.cell);
  return [...set].sort((a, b) => a - b);
}

/** ヒントで光らせる違い（未発見のうち最初の 1 つ）。全部見つけていれば null */
export function hintTarget(differences: readonly Difference[], found: ReadonlySet<number>): number | null {
  const i = differences.findIndex((_, idx) => !found.has(idx));
  return i >= 0 ? i : null;
}

/** ヒントボタンを出すか（経過時間はペナルティを含まない実時間） */
export function hintAvailable(elapsedMs: number): boolean {
  return elapsedMs >= HINT_AFTER_MS;
}

/** 表示と記録に使う時間。ヒント 1 回につき +15 秒 */
export function totalTimeMs(elapsedMs: number, hints: number): number {
  return Math.max(0, elapsedMs) + Math.max(0, Math.floor(hints)) * HINT_PENALTY_MS;
}

// ---- 描画用の形（中心 0,0・外接円の半径 size に収まる） ----

function polygon(n: number, r: number, startDeg = -90): string {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((startDeg + (360 / n) * i) * Math.PI) / 180;
    pts.push(`${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}

function starPath(r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = ((-90 + 36 * i) * Math.PI) / 180;
    pts.push(`${(rr * Math.cos(a)).toFixed(2)} ${(rr * Math.sin(a)).toFixed(2)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}

/** SVG の path の `d`。波線だけは線で描く（`isStroke`） */
export function shapePath(kind: ShapeKind, s: number): string {
  const f = (v: number) => v.toFixed(2);
  switch (kind) {
    case 'circle':
      return `M ${f(-s)} 0 A ${f(s)} ${f(s)} 0 1 0 ${f(s)} 0 A ${f(s)} ${f(s)} 0 1 0 ${f(-s)} 0 Z`;
    case 'square': {
      const h = s * Math.SQRT1_2;
      return `M ${f(-h)} ${f(-h)} H ${f(h)} V ${f(h)} H ${f(-h)} Z`;
    }
    case 'triangle':
      return polygon(3, s);
    case 'diamond':
      return `M 0 ${f(-s)} L ${f(s * 0.6)} 0 L 0 ${f(s)} L ${f(-s * 0.6)} 0 Z`;
    case 'pentagon':
      return polygon(5, s);
    case 'hexagon':
      return polygon(6, s, 0);
    case 'star':
      return starPath(s);
    case 'cross': {
      const a = s * 0.7;
      const w = s * 0.25;
      return `M ${f(-w)} ${f(-a)} H ${f(w)} V ${f(-w)} H ${f(a)} V ${f(w)} H ${f(w)} V ${f(a)} H ${f(-w)} V ${f(w)} H ${f(-a)} V ${f(-w)} H ${f(-w)} Z`;
    }
    case 'arrow':
      return `M ${f(-s * 0.9)} ${f(-s * 0.3)} H 0 V ${f(-s * 0.7)} L ${f(s * 0.95)} 0 L 0 ${f(s * 0.7)} V ${f(s * 0.3)} H ${f(-s * 0.9)} Z`;
    case 'crescent':
      return `M 0 ${f(-s)} A ${f(s)} ${f(s)} 0 1 0 0 ${f(s)} A ${f(s * 1.25)} ${f(s * 1.25)} 0 0 1 0 ${f(-s)} Z`;
    case 'wave':
      return `M ${f(-s * 0.85)} 0 Q ${f(-s * 0.425)} ${f(-s * 0.6)} 0 0 T ${f(s * 0.85)} 0`;
  }
}

export function isStroke(kind: ShapeKind): boolean {
  return kind === 'wave';
}

// ---- 共有 ----

/** `2:41` 形式。`lib/records.ts` の `formatTime` と同じ書き方 */
function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/** 共有の文面。**絵のネタバレ（違いの場所・種類）は入れない**。時間と日付だけ */
export function shareText(params: {
  mode: Mode;
  timeMs: number;
  hints: number;
  dateKey?: DateKey;
  streak?: number;
  url: string;
}): string {
  const { mode, timeMs, hints, dateKey, streak, url } = params;
  const time = formatDuration(timeMs);
  const head =
    mode === 'daily' && dateKey ? `間違い探し 今日の1枚（${dateKey}）${time}` : `間違い探し ${MODE_LABEL[mode]} ${time}`;
  const parts = [head];
  if (hints > 0) parts.push(`ヒント${hints}回`);
  if (mode === 'daily' && streak && streak > 1) parts.push(`連続${streak}日`);
  return [parts.join(' ／ '), url].join('\n');
}
