/**
 * BMI 計算機の「判定の帯」の配置（純関数）。
 *
 * 仕様: docs/features/bmi-tekisei-taiju.md「画面」
 *
 * - 帯の両端は BMI 15〜42 で打ち切る。範囲外の値は端に印を寄せ、印の横に実際の数値を出す
 * - 色だけで区別させない（区分の文字を必ず書く）
 * - 狭い幅（480px 未満）では区分名を帯の中に書かず、帯の下に上下2段で交互に置き、
 *   肥満は「1度」〜「4度」に縮める。35〜40・40〜42 の区間には引き出し線を付ける
 * - 年代の目標範囲は帯の**上**に細い括弧で、「今ここ」の印と数値は帯の**下**に置く
 *
 * 描画（SVG）は app/bmi/BmiBand.tsx。ここは座標を決めるだけにして、
 * 文字どうしが重ならないことをテストで確かめられるようにしている。
 */
import { formatTenths, JASSO_CLASSES } from './bmi';

export const BAND_MIN_TENTHS = 150;
export const BAND_MAX_TENTHS = 420;
/** これより狭い幅では区分名を帯の下に出す */
export const NARROW_WIDTH = 480;

export const FONT = 12;
const PAD = 8;
const BRACKET_LABEL_Y = 12;
const BRACKET_Y = 20;
export const BAND_TOP = 26;
export const BAND_HEIGHT = 28;
const BAND_BOTTOM = BAND_TOP + BAND_HEIGHT;
const TICK_Y = BAND_BOTTOM + 14;
const ROW1_Y = BAND_BOTTOM + 32;
const ROW2_Y = BAND_BOTTOM + 48;

export interface TextBox {
  x: number;
  y: number;
  text: string;
  anchor: 'start' | 'middle' | 'end';
}

export interface BandSegment {
  id: string;
  x1: number;
  x2: number;
  label: TextBox;
  /** 帯の外に名前を置いたときの引き出し線 */
  leader: { x: number; y1: number; y2: number } | null;
  inside: boolean;
}

export interface BandLayout {
  width: number;
  height: number;
  narrow: boolean;
  segments: BandSegment[];
  ticks: TextBox[];
  marker: { x: number; label: TextBox; clamped: boolean };
  bracket: { x1: number; x2: number; label: TextBox } | null;
}

/** 文字の幅の見積り（和文は1字＝1em、数字・記号は 0.6em） */
export function textWidth(text: string, size = FONT): number {
  let w = 0;
  for (const ch of text) w += /[\u0000-ÿ]/.test(ch) ? 0.6 : 1;
  return w * size;
}

/** 文字の外接矩形（重なりのテスト用） */
export function boxOf(t: TextBox, size = FONT): { x1: number; x2: number; y1: number; y2: number } {
  const w = textWidth(t.text, size);
  const x1 = t.anchor === 'start' ? t.x : t.anchor === 'end' ? t.x - w : t.x - w / 2;
  return { x1, x2: x1 + w, y1: t.y - size, y2: t.y + 2 };
}

/** 中央揃えの文字を、はみ出さないよう端で寄せる */
function clampedText(x: number, y: number, text: string, width: number): TextBox {
  const w = textWidth(text);
  if (x - w / 2 < PAD / 2) return { x: PAD / 2, y, text, anchor: 'start' };
  if (x + w / 2 > width - PAD / 2) return { x: width - PAD / 2, y, text, anchor: 'end' };
  return { x, y, text, anchor: 'middle' };
}

export function bandLayout(
  width: number,
  bmiTenths: number,
  target: { lowerTenths: number; upperTenths: number; label: string } | null = null,
): BandLayout {
  const narrow = width < NARROW_WIDTH;
  const inner = width - PAD * 2;
  const xOf = (t: number) => {
    const c = Math.min(Math.max(t, BAND_MIN_TENTHS), BAND_MAX_TENTHS);
    return PAD + ((c - BAND_MIN_TENTHS) / (BAND_MAX_TENTHS - BAND_MIN_TENTHS)) * inner;
  };

  const bounds = JASSO_CLASSES.map((c, i) => ({
    c,
    from: Math.max(c.fromTenths, BAND_MIN_TENTHS),
    to: JASSO_CLASSES[i + 1]?.fromTenths ?? BAND_MAX_TENTHS,
  }));

  let rowsUsed = 0;
  const segments: BandSegment[] = bounds.map(({ c, from, to }, i) => {
    const x1 = xOf(from);
    const x2 = xOf(to);
    const cx = (x1 + x2) / 2;
    const segW = x2 - x1;
    if (!narrow) {
      // 広い幅：入る名前で帯の中に書く（正式名 → 縮めた名）。入らなければ下の段へ
      for (const text of [c.label, c.short]) {
        if (textWidth(text) + 6 <= segW) {
          return {
            id: c.id,
            x1,
            x2,
            inside: true,
            leader: null,
            label: { x: cx, y: BAND_TOP + BAND_HEIGHT / 2 + FONT / 2 - 1, text, anchor: 'middle' },
          };
        }
      }
    }
    // 狭い幅（または帯に入らない区間）：上下2段に交互に置く
    const y = i % 2 === 0 ? ROW1_Y : ROW2_Y;
    rowsUsed = Math.max(rowsUsed, i % 2 === 0 ? 1 : 2);
    const needsLeader = narrow ? c.fromTenths >= 350 : true;
    return {
      id: c.id,
      x1,
      x2,
      inside: false,
      leader: needsLeader ? { x: cx, y1: BAND_BOTTOM, y2: y - FONT } : null,
      label: clampedText(cx, y, c.short, width),
    };
  });

  const ticks: TextBox[] = JASSO_CLASSES.slice(1).map((c) => ({
    x: xOf(c.fromTenths),
    y: TICK_Y,
    text: formatTenths(c.fromTenths).replace(/\.0$/, ''),
    anchor: 'middle',
  }));

  const labelsBottom = rowsUsed === 2 ? ROW2_Y : rowsUsed === 1 ? ROW1_Y : TICK_Y;
  const markerY = labelsBottom + 26;
  const clamped = bmiTenths < BAND_MIN_TENTHS || bmiTenths > BAND_MAX_TENTHS;
  const mx = xOf(bmiTenths);
  const marker = {
    x: mx,
    clamped,
    label: clampedText(mx, markerY, `今ここ ${formatTenths(bmiTenths)}`, width),
  };

  const bracket = target
    ? {
        x1: xOf(target.lowerTenths),
        x2: xOf(target.upperTenths),
        label: clampedText(
          (xOf(target.lowerTenths) + xOf(target.upperTenths)) / 2,
          BRACKET_LABEL_Y,
          target.label,
          width,
        ),
      }
    : null;

  return { width, height: markerY + 8, narrow, segments, ticks, marker, bracket };
}

export { BRACKET_Y, BAND_BOTTOM };
