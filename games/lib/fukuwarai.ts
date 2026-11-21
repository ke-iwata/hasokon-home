/**
 * 福笑いのロジック（純関数）。
 *
 * 仕様: docs/features/game-fukuwarai.md
 *
 * 採点・難易度ごとの見え方・置き場の並べ方・日替わり・記録の区分・画像の中身を持つ。
 * 画面（`app/fukuwarai/Game.tsx`）は入力と描画だけで、ここを呼ぶ。
 *
 * **座標はすべて SVG の座標系**（`lib/fukuwarai-faces.ts` の `VIEW_W` × `VIEW_H`）。
 * 画面の px からは `toSvgPoint` で直してから渡す。端末の大きさで点数が変わらないようにするため。
 */

import { dailySeed, mulberry32, type DateKey } from './daily';
import {
  FACE_IDS,
  FACES,
  PART_KINDS,
  VIEW_H,
  VIEW_W,
  type FaceDef,
  type FaceId,
  type PartKind,
  type SvgEl,
} from './fukuwarai-faces';

export { FACE_IDS, FACES, PART_KINDS, VIEW_H, VIEW_W };
export type { FaceDef, FaceId, PartKind, SvgEl };

// ---------------------------------------------------------------- 名前と重み

export const PART_LABEL: Readonly<Record<PartKind, string>> = {
  browL: 'まゆ（左）',
  browR: 'まゆ（右）',
  eyeL: '目（左）',
  eyeR: '目（右）',
  nose: '鼻',
  mouth: '口',
};

/** 目と口のずれが顔の印象を一番変えるので重く、まゆと鼻は軽く */
export const PART_WEIGHT: Readonly<Record<PartKind, number>> = {
  browL: 0.8,
  browR: 0.8,
  eyeL: 1.2,
  eyeR: 1.2,
  nose: 0.8,
  mouth: 1.2,
};

/** 位置のずれが顔幅のこの割合に達したら位置のスコアは 0 */
export const POSITION_LIMIT = 0.25;
/** 角度のずれがこの度数に達したら角度のスコアは 0 */
export const ANGLE_LIMIT = 45;
export const POSITION_SHARE = 0.8;
export const ANGLE_SHARE = 0.2;

/** はじめに完成形を見せる時間 */
export const PREVIEW_MS = 3000;
/** 置き場で1回に回す角度 */
export const ROTATE_STEP = 15;
/** 置き場のパーツの最初の傾き（±この度数まで） */
export const TRAY_TILT = 30;

// ---------------------------------------------------------------- 置いた位置と採点

/** 置いたパーツの位置と向き（SVG 座標・度） */
export interface Placement {
  x: number;
  y: number;
  rotation: number;
}

export type Placements = Partial<Record<PartKind, Placement>>;

/** 角度を −180〜180 に直す（180 と −180 は同じ向き） */
export function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}

/** 輪郭の外接矩形の中か（縁の上は中とみなす） */
export function insideFace(face: FaceDef, p: { x: number; y: number }): boolean {
  const { x, y, w, h } = face.box;
  return p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;
}

export interface PartScore {
  /** 位置のスコア 0〜1 */
  position: number;
  /** 角度のスコア 0〜1 */
  angle: number;
  /** パーツのスコア 0〜1（`0.8 × 位置 + 0.2 × 角度`） */
  score: number;
}

const ZERO: PartScore = { position: 0, angle: 0, score: 0 };

/**
 * 1枚のパーツを、`target` の正しい位置と比べて採点する。
 *
 * - 位置のずれ `d` は正しい中心との距離を**顔の幅で割った値**
 * - 位置 `p = max(0, 1 − d / 0.25)`、角度 `a = max(0, 1 − |θ| / 45°)`
 * - **顔の外（輪郭の外接矩形の外）に置いたら 0 点**
 * - **位置が顔幅の 25% 以上ずれたら（`p = 0`）、角度が合っていてもそのパーツは 0 点**
 *   （仕様書の「確かめること」2。遠く離れた場所で向きだけ合っていても点にしない）
 */
export function scorePart(face: FaceDef, target: PartKind, placed: Placement | undefined): PartScore {
  if (!placed || !insideFace(face, placed)) return ZERO;
  const goal = face.parts[target];
  const d = Math.hypot(placed.x - goal.x, placed.y - goal.y) / face.box.w;
  const position = Math.max(0, 1 - d / POSITION_LIMIT);
  if (position === 0) return ZERO;
  const angle = Math.max(0, 1 - Math.abs(normalizeAngle(placed.rotation)) / ANGLE_LIMIT);
  return { position, angle, score: POSITION_SHARE * position + ANGLE_SHARE * angle };
}

/** 左右の取り違えを許すパーツの組（目・まゆだけ。鼻・口は対象外） */
export const MIRROR_PAIRS: readonly (readonly [PartKind, PartKind])[] = [
  ['browL', 'browR'],
  ['eyeL', 'eyeR'],
];

export interface FaceScore {
  /** 100 点満点（整数） */
  total: number;
  /** パーツごとの採点（入れ替えたほうが高ければ、入れ替えて採点した値） */
  parts: Record<PartKind, PartScore>;
  /** 左右を入れ替えて採点した組（結果の画面で「左右が逆でした」と出すため） */
  swapped: PartKind[];
}

/**
 * 顔全体を採点する。
 *
 * 目・まゆは**そのまま採点したものと、左右を入れ替えて採点したものの高いほう**をとる
 * （遊ぶ人は左右を区別できない。入れ替えると見た目は少し逆向きになるが、減点しない）。
 */
export function scoreFace(face: FaceDef, placements: Placements): FaceScore {
  const parts = {} as Record<PartKind, PartScore>;
  const swapped: PartKind[] = [];
  for (const kind of PART_KINDS) parts[kind] = scorePart(face, kind, placements[kind]);
  for (const [a, b] of MIRROR_PAIRS) {
    const crossA = scorePart(face, a, placements[b]);
    const crossB = scorePart(face, b, placements[a]);
    if (crossA.score + crossB.score > parts[a].score + parts[b].score) {
      parts[a] = crossB; // 左のパーツは右の位置で採点された
      parts[b] = crossA;
      swapped.push(a, b);
    }
  }
  let sum = 0;
  let weights = 0;
  for (const kind of PART_KINDS) {
    sum += PART_WEIGHT[kind] * parts[kind].score;
    weights += PART_WEIGHT[kind];
  }
  return { total: Math.round((100 * sum) / weights), parts, swapped };
}

/** 点数のひと言（5段階） */
export function verdict(total: number): string {
  if (total >= 90) return 'ほぼ完ぺき！';
  if (total >= 75) return 'よくできました';
  if (total >= 55) return 'なかなかの福顔';
  if (total >= 35) return 'ちょっとふしぎな顔';
  return 'これは大笑い';
}

/**
 * 画面の位置（clientX / clientY）を SVG の座標に直す。
 *
 * `rect` は SVG 要素の `getBoundingClientRect()`。既定の `preserveAspectRatio`
 * （`xMidYMid meet`）どおり、縦横比が違うときの余白も差し引く。
 * **採点はこの値で行うので、表示の大きさを変えても点は変わらない。**
 */
export function toSvgPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  const scale = Math.min(rect.width / VIEW_W, rect.height / VIEW_H);
  const offX = (rect.width - VIEW_W * scale) / 2;
  const offY = (rect.height - VIEW_H * scale) / 2;
  return { x: (clientX - rect.left - offX) / scale, y: (clientY - rect.top - offY) / scale };
}

/** SVG の座標系の中か（顔の紙の上に落としたか） */
export function insideView(p: { x: number; y: number }): boolean {
  return p.x >= 0 && p.x <= VIEW_W && p.y >= 0 && p.y <= VIEW_H;
}

// ---------------------------------------------------------------- 難易度ごとの見え方

export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];
export const DIFFICULTY_LABEL: Readonly<Record<Difficulty, string>> = {
  easy: 'かんたん',
  normal: 'ふつう',
  hard: 'むずかしい',
};

export interface Visibility {
  /** はじめの3秒に正解の顔を見せる */
  preview: boolean;
  /** 3秒のあとの輪郭 */
  outline: 'solid' | 'faint' | 'none';
  /** 置き場の中のパーツ（向きを回すところ） */
  tray: boolean;
  /** 置き場を出てからドラッグ中のパーツ */
  dragging: boolean;
  /** 置いたパーツ */
  placed: boolean;
  /** 顔の上のマウスのカーソル */
  cursor: 'normal' | 'none';
  /** キーボードの照準 */
  aim: 'cross-part' | 'cross' | 'none';
  /** スクリーンリーダーへの読み上げ */
  speech: 'rough-place' | 'count-only';
  /** 置いた数（6 枚中 ◯ 枚） */
  count: boolean;
}

/**
 * 仕様書の「難易度ごとの見え方」の表を、そのまま設定にしたもの。
 * 画面はこの値だけを見て出し分ける（`tests/fukuwarai.test.ts` が表とのずれを落とす）。
 */
export const VISIBILITY: Readonly<Record<Difficulty, Visibility>> = {
  easy: {
    preview: true,
    outline: 'solid',
    tray: true,
    dragging: true,
    placed: true,
    cursor: 'normal',
    aim: 'cross-part',
    speech: 'rough-place',
    count: true,
  },
  normal: {
    preview: true,
    outline: 'faint',
    tray: true,
    dragging: false,
    placed: false,
    cursor: 'normal',
    aim: 'cross',
    speech: 'count-only',
    count: true,
  },
  hard: {
    preview: true,
    outline: 'none',
    tray: true,
    dragging: false,
    placed: false,
    cursor: 'none',
    aim: 'none',
    speech: 'count-only',
    count: true,
  },
};

/**
 * かんたんの読み上げに使う「大まかな場所」（顔の外接矩形を3×3に分ける）。
 * ふつう・むずかしいでは使わない（座標・場所は読み上げない）。
 */
export function roughArea(face: FaceDef, p: { x: number; y: number }): string {
  if (!insideFace(face, p)) return '顔の外';
  const { x, y, w, h } = face.box;
  const col = Math.min(2, Math.floor(((p.x - x) / w) * 3));
  const row = Math.min(2, Math.floor(((p.y - y) / h) * 3));
  const v = ['上', 'まんなか', '下'][row];
  const s = ['左', 'まんなか', '右'][col];
  if (v === 'まんなか' && s === 'まんなか') return '顔のまんなか';
  if (v === 'まんなか') return `顔の${s}`;
  if (s === 'まんなか') return `顔の${v}`;
  return `顔の${s}${v}`;
}

/** 読み上げの文（難易度で中身を変える） */
export function placedSpeech(
  difficulty: Difficulty,
  face: FaceDef,
  kind: PartKind,
  at: { x: number; y: number },
  placedCount: number,
): string {
  const head = `${PART_LABEL[kind]}を置きました（${PART_KINDS.length}枚中${placedCount}枚）`;
  if (VISIBILITY[difficulty].speech === 'rough-place') return `${head}。${roughArea(face, at)}`;
  return head;
}

// ---------------------------------------------------------------- 置き場・回転・キーボード

export interface TrayPart {
  kind: PartKind;
  rotation: number;
}

/** 置き場の並び。シャッフルした順・ランダムな向き（±30°、整数）。乱数は注入する */
export function makeTray(rng: () => number): TrayPart[] {
  const kinds = [...PART_KINDS];
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  return kinds.map((kind) => ({ kind, rotation: Math.round(rng() * TRAY_TILT * 2 - TRAY_TILT) }));
}

/** 置き場の中で回す（`dir` は +1 で時計回り）。−180〜180 に収める */
export function rotate(rotation: number, dir: 1 | -1): number {
  return normalizeAngle(rotation + dir * ROTATE_STEP);
}

/** キーボードの照準の動き（SVG 座標）。`Shift` で大きく */
export const AIM_STEP = 5;
export const AIM_STEP_BIG = 25;

/** 照準の初期位置（顔の中心）。むずかしいの `C` キーもここへ戻す */
export function aimHome(face: FaceDef): { x: number; y: number } {
  return { x: face.box.x + face.box.w / 2, y: face.box.y + face.box.h / 2 };
}

export function moveAim(
  aim: { x: number; y: number },
  key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight',
  big: boolean,
): { x: number; y: number } {
  const step = big ? AIM_STEP_BIG : AIM_STEP;
  const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
  const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
  return {
    x: Math.min(VIEW_W, Math.max(0, aim.x + dx)),
    y: Math.min(VIEW_H, Math.max(0, aim.y + dy)),
  };
}

// ---------------------------------------------------------------- 日替わり・記録

/** 日替わりの生成手順の版。**手順を変えたら上げる**（過去の今日のお題が変わらないように） */
export const DAILY_VERSION = 1;
/** 「今日のお題」の難易度。全員が同じ条件で比べられるよう ふつう に固定 */
export const DAILY_DIFFICULTY: Difficulty = 'normal';

export interface DailySetup {
  faceId: FaceId;
  tray: TrayPart[];
}

/** 日付から顔の種類と置き場の並び・向きを決める（同じ日なら全員同じ） */
export function dailySetup(key: DateKey): DailySetup {
  const rng = mulberry32(dailySeed(key, DAILY_VERSION));
  const faceId = FACE_IDS[Math.floor(rng() * FACE_IDS.length)];
  return { faceId, tray: makeTray(rng) };
}

/**
 * 記録（`lib/records.ts`）の区分。**顔の種類 × 難易度**で分ける
 * （かんたんは置いたパーツが見えて満点を取りやすいので、同じ表に混ぜない）。
 * 今日のお題は別の区分（その日のベストと連続日数）。
 */
export function recordVariant(faceId: FaceId, difficulty: Difficulty): string {
  return `${faceId}:${difficulty}`;
}
export const DAILY_VARIANT = 'daily';

// ---------------------------------------------------------------- 家族モード

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

/** 入れた名前を整える。空欄は「1ばん」「2ばん」… */
export function playerNames(raw: readonly string[], count: number): string[] {
  const n = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Math.floor(count)));
  return Array.from({ length: n }, (_, i) => {
    const name = (raw[i] ?? '').trim().slice(0, 12);
    return name === '' ? `${i + 1}ばん` : name;
  });
}

export interface FamilyEntry {
  name: string;
  placements: Placements;
  total: number;
}

/** 点数の順位（同点は同じ順位。並びは点の高い順、同点は遊んだ順） */
export function ranking(entries: readonly FamilyEntry[]): { entry: FamilyEntry; index: number; rank: number }[] {
  const sorted = entries.map((entry, index) => ({ entry, index })).sort((a, b) => b.entry.total - a.entry.total || a.index - b.index);
  return sorted.map((s) => ({ ...s, rank: 1 + sorted.filter((o) => o.entry.total > s.entry.total).length }));
}

// ---------------------------------------------------------------- 画像で保存

export interface ImageOptions {
  total: number;
  /** 家族モードの名前。`includeName` が true のときだけ画像に入る */
  playerName?: string;
  /** 名前を焼き込むか。**既定は false**（SNS に共有されうるため） */
  includeName?: boolean;
}

/** 画像保存の既定（名前を入れない） */
export const DEFAULT_IMAGE_OPTIONS = { includeName: false } as const;

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
}

function elMarkup(el: SvgEl): string {
  const attrs = [
    `d="${el.d}"`,
    `fill="${el.fill ?? 'none'}"`,
    el.stroke ? `stroke="${el.stroke}" stroke-width="${el.sw ?? 2}" stroke-linecap="round" stroke-linejoin="round"` : '',
    el.opacity !== undefined ? `opacity="${el.opacity}"` : '',
  ].filter(Boolean);
  return `<path ${attrs.join(' ')}/>`;
}

/** パーツを置く変形（画面と画像で同じものを使う） */
export function partTransform(p: Placement, mirror: boolean | undefined): string {
  return `translate(${p.x} ${p.y}) rotate(${p.rotation})${mirror ? ' scale(-1 1)' : ''}`;
}

/** 画像の下に入れる文字（顔の種類・点数。名前は選んだときだけ） */
export function imageCaption(face: FaceDef, opts: ImageOptions): string {
  const head = opts.includeName && opts.playerName ? `${opts.playerName}さんの` : '';
  return `${head}福笑い（${face.name}）${opts.total}点`;
}

/** 画像の高さ（顔の下に文字の帯を足す） */
export const IMAGE_CAPTION_H = 48;

/**
 * 保存する画像（PNG にする前の SVG）の中身。顔・置いたパーツ・点数・顔の種類だけ。
 * **名前は `includeName` を選んだときだけ入る。**
 */
export function resultSvgMarkup(face: FaceDef, placements: Placements, opts: ImageOptions): string {
  const H = VIEW_H + IMAGE_CAPTION_H;
  const parts = PART_KINDS.flatMap((kind) => {
    const p = placements[kind];
    if (!p) return [];
    const art = face.parts[kind];
    return [`<g transform="${partTransform(p, art.mirror)}">${art.els.map(elMarkup).join('')}</g>`];
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${H}" width="${VIEW_W * 2}" height="${H * 2}">`,
    `<rect width="${VIEW_W}" height="${H}" fill="#fffdf8"/>`,
    ...face.outline.map(elMarkup),
    ...parts,
    `<text x="${VIEW_W / 2}" y="${VIEW_H + 32}" text-anchor="middle" font-size="20" font-family="sans-serif" fill="#3a302b">${escapeXml(imageCaption(face, opts))}</text>`,
    '</svg>',
  ].join('');
}
