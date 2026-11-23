import { contrastRatio, formatRatio, judge, nearestPassing } from '@/lib/color/contrast';
import { formatHex } from '@/lib/color/convert';
import { parseColor } from '@/lib/color/parse';

/**
 * 本文の例。lib の関数を呼んで作る（本文に比や判定を手で書かないため。docs/features/thin-tool-content.md）
 */

const rgba = (s: string) => {
  const p = parseColor(s);
  if (!p.ok) throw new Error(s);
  return p.color;
};

/** 白い背景に対する灰色の比（境目の定番） */
export const GRAY_ON_WHITE = ['#595959', '#767676', '#777777', '#949494', '#aaaaaa'].map((fg) => {
  const ratio = contrastRatio(fg, '#ffffff');
  const j = judge(ratio);
  return {
    fg,
    ratio: formatRatio(ratio),
    normalAA: j.find((x) => x.target === 'normal' && x.level === 'AA')!.pass,
    normalAAA: j.find((x) => x.target === 'normal' && x.level === 'AAA')!.pass,
    largeAA: j.find((x) => x.target === 'large' && x.level === 'AA')!.pass,
  };
});

/** #777777 の背景：白でも黒でも AAA の 7 に届かない例 */
export const MID_GRAY = {
  bg: '#777777',
  white: formatRatio(contrastRatio('#ffffff', '#777777')),
  black: formatRatio(contrastRatio('#000000', '#777777')),
  reachable: nearestPassing(rgba('#ffffff'), rgba('#777777'), 7) !== null,
};

/** 白い背景で #777777 を AA に届かせる、一番近い色 */
export const NEAREST_777 = formatHex(nearestPassing(rgba('#777777'), rgba('#ffffff'), 4.5)!.color);
