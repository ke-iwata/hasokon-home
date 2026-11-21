/**
 * 福笑いの顔のデータ（5種）。
 *
 * 仕様: docs/features/game-fukuwarai.md の「権利」
 *
 * **絵はすべてこのファイルで描き起こした自前の SVG**。市販の福笑いの型紙・アプリの絵・
 * フリー素材集の絵は写していない・なぞっていない。「おかめ」「ひょっとこ」は一般名称で、
 * 特定のキャラクターや企業マスコットには似せていない。
 *
 * ## 座標の約束
 *
 * - 顔はすべて同じ `viewBox`（`VIEW_W` × `VIEW_H`）で描く。採点もこの座標系で行う
 *   （画面の px で計算しないので、端末の大きさで点数が変わらない）
 * - パーツの絵（`els`）は**パーツの中心を原点**にして描く。置いた位置は
 *   `translate(x y) rotate(θ)` で動かす。正しい向きは 0°
 * - 右側のパーツ（`browR` / `eyeR`）は、左側の絵を**鏡に映して**使う（`mirror: true`）。
 *   左右を取り違えて置くと見た目が少し逆向きになるのは、このため（減点はしない）
 * - `box` は**輪郭の外接矩形**（角・耳・髪は含めない、顔そのもの）。
 *   位置のずれはこの幅 `box.w` で割り、この矩形の外に置いたパーツは 0 点
 *
 * 色は紙の上の絵なので直書きしている（明暗テーマでも紙の色は変えない）。
 */

/** 顔の座標系（SVG の viewBox）。採点はすべてこの座標で行う */
export const VIEW_W = 300;
export const VIEW_H = 360;

/** パーツの種類。L / R は**画面の左右**（顔の持ち主の左右ではない） */
export type PartKind = 'browL' | 'browR' | 'eyeL' | 'eyeR' | 'nose' | 'mouth';

export const PART_KINDS: readonly PartKind[] = ['browL', 'browR', 'eyeL', 'eyeR', 'nose', 'mouth'];

/** 1本のパス。`fill` を省くと塗らない（線だけ） */
export interface SvgEl {
  d: string;
  fill?: string;
  stroke?: string;
  /** 線の太さ（SVG 座標） */
  sw?: number;
  /** 不透明度（ほお紅など） */
  opacity?: number;
}

export interface PartArt {
  /** 正しい中心（SVG 座標） */
  x: number;
  y: number;
  /** 原点を中心に描いた絵 */
  els: readonly SvgEl[];
  /** 左右反転して描く（右側のパーツ） */
  mirror?: boolean;
}

export interface FaceDef {
  id: FaceId;
  name: string;
  /** 輪郭の外接矩形（採点の基準） */
  box: { x: number; y: number; w: number; h: number };
  /** 輪郭・髪・角・耳など、最初から紙に描いてある部分（順に重ねる） */
  outline: readonly SvgEl[];
  /** まゆ・目・鼻・口の6枚（正しい位置と絵） */
  parts: Readonly<Record<PartKind, PartArt>>;
}

export type FaceId = 'okame' | 'hyottoko' | 'oni' | 'daruma' | 'neko';

export const FACE_IDS: readonly FaceId[] = ['okame', 'hyottoko', 'oni', 'daruma', 'neko'];

/** 楕円のパス（中心・半径） */
export function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`;
}

const INK = '#3a302b';

/** 左のパーツの絵を、右に鏡像で使う */
function pair(left: { x: number; y: number; els: readonly SvgEl[] }, rightX: number): [PartArt, PartArt] {
  return [
    { x: left.x, y: left.y, els: left.els },
    { x: rightX, y: left.y, els: left.els, mirror: true },
  ];
}

// ---------------------------------------------------------------- おかめ

const okameBrows = pair(
  { x: 112, y: 130, els: [{ d: ellipse(0, 0, 13, 7), fill: INK }] },
  188,
);
const okameEyes = pair(
  {
    x: 112,
    y: 172,
    // 目じり（画面の左＝外側）が少し下がった、笑った細い目
    els: [{ d: 'M-20 5 Q-2 -12 20 0', stroke: INK, sw: 4.5 }],
  },
  188,
);

const okame: FaceDef = {
  id: 'okame',
  name: 'おかめ',
  box: { x: 35, y: 55, w: 230, h: 270 },
  outline: [
    { d: ellipse(150, 190, 115, 135), fill: '#fdf1e4', stroke: '#7a5a48', sw: 3 },
    {
      d: 'M37 168 C34 82 96 50 150 50 C204 50 266 82 263 168 C246 118 206 98 150 114 C94 98 54 118 37 168Z',
      fill: '#2b2522',
    },
    { d: ellipse(82, 232, 24, 15), fill: '#f4a9a0', opacity: 0.75 },
    { d: ellipse(218, 232, 24, 15), fill: '#f4a9a0', opacity: 0.75 },
  ],
  parts: {
    browL: okameBrows[0],
    browR: okameBrows[1],
    eyeL: okameEyes[0],
    eyeR: okameEyes[1],
    nose: { x: 150, y: 212, els: [{ d: 'M-4 -16 Q-12 6 -2 9 Q6 11 9 4', stroke: '#7a5a48', sw: 3.5 }] },
    mouth: {
      x: 150,
      y: 262,
      els: [{ d: 'M-17 0 Q-8 -9 0 -3 Q8 -9 17 0 Q8 11 0 11 Q-8 11 -17 0Z', fill: '#d8344a' }],
    },
  },
};

// ---------------------------------------------------------------- ひょっとこ

const hyottokoBrows = pair(
  { x: 110, y: 142, els: [{ d: 'M-18 6 Q-2 -10 18 -6', stroke: '#3a2a1f', sw: 6 }] },
  190,
);

const hyottoko: FaceDef = {
  id: 'hyottoko',
  name: 'ひょっとこ',
  box: { x: 45, y: 60, w: 210, h: 260 },
  outline: [
    { d: ellipse(150, 190, 105, 130), fill: '#f2d3a8', stroke: '#6b4a2f', sw: 3 },
    // 手ぬぐいのはちまき（自前の簡単な帯）
    { d: 'M47 120 Q150 64 253 120 L256 140 Q150 86 44 140Z', fill: '#3a6fb0' },
    { d: 'M246 124 L272 108 L268 132 L276 150 L250 140Z', fill: '#3a6fb0' },
  ],
  parts: {
    browL: hyottokoBrows[0],
    browR: hyottokoBrows[1],
    // ひょっとこは左右の目の大きさが違う（左を大きく）。鏡像ではなく別の絵
    eyeL: {
      x: 110,
      y: 178,
      els: [
        { d: ellipse(0, 0, 17, 14), fill: '#ffffff', stroke: '#3a2a1f', sw: 2.5 },
        { d: ellipse(3, 1, 7, 7), fill: '#3a2a1f' },
      ],
    },
    eyeR: {
      x: 192,
      y: 182,
      els: [
        { d: ellipse(0, 0, 11, 9), fill: '#ffffff', stroke: '#3a2a1f', sw: 2.5 },
        { d: ellipse(-2, 1, 4.5, 4.5), fill: '#3a2a1f' },
      ],
    },
    nose: { x: 150, y: 220, els: [{ d: 'M-6 -18 Q-15 8 0 10 Q12 9 7 -3', stroke: '#6b4a2f', sw: 3.5 }] },
    // 口はとがらせて横に寄せる
    mouth: {
      x: 172,
      y: 266,
      els: [
        { d: ellipse(0, 0, 17, 13), fill: '#c94a3a', stroke: '#6b4a2f', sw: 2 },
        { d: ellipse(5, 0, 7, 6), fill: '#5a1d16' },
      ],
    },
  },
};

// ---------------------------------------------------------------- おに

const oniBrows = pair(
  // 内側（画面の右）が下がった、怒ったまゆ
  { x: 108, y: 150, els: [{ d: 'M-21 -9 L18 4 L15 11 L-23 -2Z', fill: '#2e2a28' }] },
  192,
);
const oniEyes = pair(
  {
    x: 110,
    y: 184,
    els: [
      { d: 'M-17 -4 Q0 -14 17 2 Q0 14 -17 -4Z', fill: '#ffd84a', stroke: '#2e2a28', sw: 2.5 },
      { d: ellipse(3, 1, 4.5, 6), fill: '#2e2a28' },
    ],
  },
  190,
);

const oni: FaceDef = {
  id: 'oni',
  name: 'おに',
  box: { x: 40, y: 67, w: 220, h: 256 },
  outline: [
    // 角は輪郭の外（box の外）に描く
    { d: 'M82 102 L66 34 L114 84Z', fill: '#f3e3b5', stroke: '#7a2618', sw: 2.5 },
    { d: 'M218 102 L234 34 L186 84Z', fill: '#f3e3b5', stroke: '#7a2618', sw: 2.5 },
    { d: ellipse(150, 195, 110, 128), fill: '#e4573f', stroke: '#7a2618', sw: 3 },
    {
      d: 'M42 172 C42 96 94 66 150 66 C206 66 258 96 258 172 C238 128 202 114 150 122 C98 114 62 128 42 172Z',
      fill: '#2e2a28',
    },
  ],
  parts: {
    browL: oniBrows[0],
    browR: oniBrows[1],
    eyeL: oniEyes[0],
    eyeR: oniEyes[1],
    nose: {
      x: 150,
      y: 222,
      els: [{ d: 'M-18 6 Q-16 -14 0 -12 Q16 -14 18 6 Q0 14 -18 6Z', fill: '#c8402c', stroke: '#7a2618', sw: 2 }],
    },
    mouth: {
      x: 150,
      y: 268,
      els: [
        { d: 'M-34 -6 Q0 16 34 -6 Q0 32 -34 -6Z', fill: '#5a1d16', stroke: '#7a2618', sw: 2 },
        { d: 'M-24 -2 L-16 0 L-21 -12Z', fill: '#ffffff' },
        { d: 'M24 -2 L16 0 L21 -12Z', fill: '#ffffff' },
      ],
    },
  },
};

// ---------------------------------------------------------------- だるま

const darumaBrows = pair(
  { x: 116, y: 142, els: [{ d: 'M-22 7 Q-6 -14 20 -2', stroke: '#2b2522', sw: 7 }] },
  184,
);
const darumaEyes = pair(
  {
    x: 118,
    y: 174,
    els: [
      { d: ellipse(0, 0, 15, 15), fill: '#ffffff', stroke: '#2b2522', sw: 3 },
      { d: ellipse(0, 0, 5, 5), fill: '#2b2522' },
    ],
  },
  182,
);

const daruma: FaceDef = {
  id: 'daruma',
  name: 'だるま',
  box: { x: 68, y: 98, w: 164, h: 184 },
  outline: [
    { d: ellipse(150, 190, 125, 140), fill: '#d63a2e', stroke: '#7a1a12', sw: 3 },
    { d: ellipse(150, 190, 82, 92), fill: '#fbefe0', stroke: '#b88a5a', sw: 2.5 },
    // 胴の飾り（自前の簡単な線）
    { d: 'M70 300 Q150 330 230 300', stroke: '#f2c14e', sw: 4 },
  ],
  parts: {
    browL: darumaBrows[0],
    browR: darumaBrows[1],
    eyeL: darumaEyes[0],
    eyeR: darumaEyes[1],
    nose: { x: 150, y: 204, els: [{ d: ellipse(0, 0, 8, 6), fill: '#f2c7a0', stroke: '#8a5a3a', sw: 2 }] },
    mouth: {
      x: 150,
      y: 240,
      els: [
        { d: 'M-30 -4 Q-15 -16 0 -6 Q15 -16 30 -4 Q15 -2 0 2 Q-15 -2 -30 -4Z', fill: '#2b2522' },
        { d: 'M-10 10 Q0 18 10 10', stroke: '#2b2522', sw: 3 },
      ],
    },
  },
};

// ---------------------------------------------------------------- ねこ

const nekoBrows = pair(
  { x: 112, y: 152, els: [{ d: 'M-11 3 Q0 -6 11 2', stroke: '#5a4a3a', sw: 4 }] },
  188,
);
const nekoEyes = pair(
  {
    x: 112,
    y: 192,
    els: [
      { d: 'M-18 3 Q0 -16 18 -3 Q0 16 -18 3Z', fill: '#8cc56a', stroke: '#3a2e24', sw: 2 },
      { d: 'M0 -10 Q4 0 0 10 Q-4 0 0 -10Z', fill: '#222222' },
    ],
  },
  188,
);

const neko: FaceDef = {
  id: 'neko',
  name: 'ねこ',
  box: { x: 32, y: 88, w: 236, h: 224 },
  outline: [
    { d: 'M52 150 L62 54 L124 104Z', fill: '#fff6e6', stroke: '#5a4a3a', sw: 3 },
    { d: 'M248 150 L238 54 L176 104Z', fill: '#fff6e6', stroke: '#5a4a3a', sw: 3 },
    { d: 'M66 132 L72 76 L108 104Z', fill: '#f6c0c4' },
    { d: 'M234 132 L228 76 L192 104Z', fill: '#f6c0c4' },
    { d: ellipse(150, 200, 118, 112), fill: '#fff6e6', stroke: '#5a4a3a', sw: 3 },
    { d: 'M138 98 L140 118 M150 96 L150 120 M162 98 L160 118', stroke: '#c9a77e', sw: 4 },
  ],
  parts: {
    browL: nekoBrows[0],
    browR: nekoBrows[1],
    eyeL: nekoEyes[0],
    eyeR: nekoEyes[1],
    nose: {
      x: 150,
      y: 230,
      els: [
        { d: 'M-9 -5 L9 -5 L0 6Z', fill: '#f29aa0', stroke: '#5a4a3a', sw: 2 },
        { d: 'M-20 2 L-48 -4 M-20 8 L-48 12 M20 2 L48 -4 M20 8 L48 12', stroke: '#5a4a3a', sw: 2 },
      ],
    },
    mouth: { x: 150, y: 252, els: [{ d: 'M-16 -4 Q-8 8 0 -2 Q8 8 16 -4', stroke: '#5a4a3a', sw: 3 }] },
  },
};

export const FACES: Readonly<Record<FaceId, FaceDef>> = { okame, hyottoko, oni, daruma, neko };

export function faceOf(id: FaceId): FaceDef {
  return FACES[id];
}
