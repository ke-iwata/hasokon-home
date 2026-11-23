import { describe, expect, it } from 'vitest';
import {
  allFormats,
  formatHex,
  formatHsl,
  formatOklch,
  formatRgb,
  hexForQuery,
  hslToRgb,
  hsvToRgb,
  rgbToCmyk,
  rgbToHsl,
  rgbToHsv,
  round8,
  type Rgba,
} from '@/lib/color/convert';
import {
  DEFAULT_BG,
  DEFAULT_FG,
  parseColor,
  parseQueryHex,
  readColorQuery,
} from '@/lib/color/parse';
import {
  contrastOf,
  contrastRatio,
  formatRatio,
  judge,
  nearestPassing,
  pickNearer,
  relativeLuminance,
} from '@/lib/color/contrast';
import { simulate, VISION_LABELS, VISION_TYPES } from '@/lib/color/vision';
import { deltaE2000, nearestNames, NAMED_COLORS, rgbToLab } from '@/lib/color/names';
import { CSS_NAMED_COLORS } from '@/lib/color/css-names';
import { JIS_COLOR_NAMES } from '@/lib/color/jis-names';

// 仕様: docs/features/color-code-contrast.md

const rgba = (hex: string): Rgba => {
  const p = parseColor(hex);
  if (!p.ok) throw new Error(hex);
  return p.color;
};

describe('コントラスト比', () => {
  it('黒と白で 21 : 1、同じ色で 1 : 1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 10);
    expect(contrastRatio('#3366cc', '#3366cc')).toBe(1);
    expect(formatRatio(21)).toBe('21.00');
  });

  it('境目の定番：#777777 と白は 4.48 で AA 不合格、#767676 と白は 4.54 で合格', () => {
    const r777 = contrastRatio('#777777', '#ffffff');
    const r767 = contrastRatio('#767676', '#ffffff');
    expect(formatRatio(r777)).toBe('4.48');
    expect(formatRatio(r767)).toBe('4.54');
    const aa = (r: number) => judge(r).find((j) => j.target === 'normal' && j.level === 'AA')!.pass;
    expect(aa(r777)).toBe(false);
    expect(aa(r767)).toBe(true);
  });

  it('判定は丸める前の値で行い、しきい値をまたぐ切り上げはしない（4.499 を 4.50 と出さない）', () => {
    expect(formatRatio(4.499)).toBe('4.49');
    expect(formatRatio(4.4951)).toBe('4.49');
    expect(formatRatio(6.996)).toBe('6.99');
    expect(formatRatio(2.999)).toBe('2.99');
    expect(formatRatio(4.5)).toBe('4.50');
    expect(formatRatio(4.506)).toBe('4.51');
    expect(formatRatio(4.4776)).toBe('4.48');
    const j = judge(4.4999);
    expect(j.find((x) => x.target === 'normal' && x.level === 'AA')!.pass).toBe(false);
    expect(j.find((x) => x.target === 'large' && x.level === 'AAA')!.pass).toBe(false);
    expect(j.find((x) => x.target === 'large' && x.level === 'AA')!.pass).toBe(true);
    expect(j.find((x) => x.target === 'ui')!.pass).toBe(true);
  });

  it('判定表は 通常 4.5／7、大きな文字 3／4.5、UI 部品 3（AA のみ）', () => {
    const rows = judge(1).map((j) => `${j.target}-${j.level}-${j.min}`);
    expect(rows).toEqual(['normal-AA-4.5', 'normal-AAA-7', 'large-AA-3', 'large-AAA-4.5', 'ui-AA-3']);
  });

  it('相対輝度は WCAG 2.2 の式（8bit では 0.03928 の旧式と同じ値）', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 12);
    expect(relativeLuminance('#000000')).toBe(0);
    // 0.03928 と 0.04045 の間に入る 8bit の値は無い（10/255 = 0.0392、11/255 = 0.0431）
    const old = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    for (let v = 0; v < 256; v++) {
      const hex = `#${v.toString(16).padStart(2, '0').repeat(3)}`;
      expect(relativeLuminance(hex)).toBeCloseTo(old(v / 255), 12);
    }
  });

  it('透明度つきの文字色は背景に合成してから比を出す', () => {
    // 白の上の 50% の赤。不透明度は HEX と同じ 1/255 刻み（50% → 128/255）にそろえてから合成する
    const r = contrastOf(rgba('rgb(255 0 0 / 50%)'), DEFAULT_BG);
    const a = 128 / 255;
    const g = 255 * (1 - a);
    const expected = contrastRatio({ r: 255, g, b: g }, { r: 255, g: 255, b: 255 });
    expect(r).toBeCloseTo(expected, 12);
    expect(r).toBeLessThan(contrastRatio('#ff0000', '#ffffff'));
    // 透明度 0 の文字は背景と同じ色に見える
    expect(contrastOf(rgba('#00000000'), DEFAULT_BG)).toBe(1);
  });
});

describe('小数を含む色は、画面の HEX と同じ 8bit の色で判定する（#547 のレビュー）', () => {
  const aaNormal = (r: number) => judge(r).find((j) => j.target === 'normal' && j.level === 'AA')!.pass;

  it.each(['hsl(0 0% 46.5%)', 'rgb(118.6 118.6 118.6)'])('%s（画面では #777777）は #777777 と同じ比で AA 不合格', (input) => {
    const c = rgba(input);
    expect(formatHex(c)).toBe('#777777');
    const r = contrastOf(c, DEFAULT_BG);
    expect(r).toBe(contrastOf(rgba('#777777'), DEFAULT_BG));
    expect(formatRatio(r)).toBe('4.48');
    expect(aaNormal(r)).toBe(false);
  });

  it('背景側・不透明度も 8bit にそろえる', () => {
    expect(contrastOf(DEFAULT_FG, rgba('rgb(254.6 254.6 254.6)'))).toBe(contrastOf(DEFAULT_FG, DEFAULT_BG));
    expect(contrastOf({ r: 0, g: 0, b: 0, a: 0.5 }, DEFAULT_BG)).toBe(contrastOf(rgba('#00000080'), DEFAULT_BG));
  });

  it('nearestPassing も 8bit の背景で確かめる（提案の比 = 画面で測り直した比）', () => {
    const bg = rgba('hsl(0 0% 46.5%)');
    const s = nearestPassing(rgba('#ffffff'), bg, 4.5);
    if (s) expect(s.ratio).toBe(contrastOf(s.color, bg));
    expect(nearestPassing(rgba('#ffffff'), bg, 7)).toBeNull();
  });
});

describe('形式の自動判定', () => {
  it.each([
    ['fff', 'hex', [255, 255, 255, 1]],
    ['#FFFFFF', 'hex', [255, 255, 255, 1]],
    ['#1a1a1a80', 'hex', [26, 26, 26, 128 / 255]],
    ['rgb(255 255 255 / 50%)', 'rgb', [255, 255, 255, 0.5]],
    ['rgba(255, 0, 0, 0.25)', 'rgb', [255, 0, 0, 0.25]],
    ['rgb(100%, 0%, 0%)', 'rgb', [255, 0, 0, 1]],
    ['255, 128, 0', 'rgb', [255, 128, 0, 1]],
    ['hsl(0 0% 100%)', 'hsl', [255, 255, 255, 1]],
    ['hsl(120, 100%, 25%)', 'hsl', [0, 127.5, 0, 1]],
    ['hsl(0.5turn 100% 50%)', 'hsl', [0, 255, 255, 1]],
    ['cmyk(0%, 100%, 100%, 0%)', 'cmyk', [255, 0, 0, 1]],
    ['C0 M0 Y0 K100', 'cmyk', [0, 0, 0, 1]],
    ['device-cmyk(0 0 0 0.5)', 'cmyk', [127.5, 127.5, 127.5, 1]],
    ['rebeccapurple', 'name', [102, 51, 153, 1]],
    ['RebeccaPurple;', 'name', [102, 51, 153, 1]],
    ['　＃ＦＦＦ　', 'hex', [255, 255, 255, 1]],
  ] as const)('%s → %s', (input, format, [r, g, b, a]) => {
    const p = parseColor(input);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.format).toBe(format);
    expect(p.color.r).toBeCloseTo(r, 9);
    expect(p.color.g).toBeCloseTo(g, 9);
    expect(p.color.b).toBeCloseTo(b, 9);
    expect(p.color.a).toBeCloseTo(a, 9);
  });

  it.each(['', '   ', '#12345', 'rgb(1, 2)', 'hsl(0 0% 120%)', 'rgb(300 0 0)', 'notacolor', 'cmyk(0, 0, 0)'])(
    '読めないもの：%j',
    (input) => {
      expect(parseColor(input).ok).toBe(false);
    },
  );
});

describe('変換', () => {
  it('6 形式の表示', () => {
    const f = Object.fromEntries(allFormats(rgba('#3366cc')).map((x) => [x.key, x.value]));
    expect(f.hex).toBe('#3366cc');
    expect(f.rgb).toBe('rgb(51 102 204)');
    expect(f.hsl).toBe('hsl(220 60% 50%)');
    expect(f.hsv).toBe('hsv(220 75% 80%)');
    expect(f.cmyk).toBe('cmyk(75% 50% 0% 20%)');
    expect(f.oklch).toMatch(/^oklch\(\d+(\.\d)?% 0\.\d{1,3} \d+(\.\d)?\)$/);
  });

  it('HSL の表示は H 整数・S と L は小数1桁（内部は丸めない）', () => {
    expect(formatHsl(rgba('#4e5965'))).toBe('hsl(211 12.8% 35.1%)');
    const hsl = rgbToHsl(rgba('#4e5965'));
    expect(hsl.s * 1000 % 1).not.toBe(0); // 浮動小数のまま持っている
  });

  it('透明度つきの表示', () => {
    const c = rgba('#ff000080');
    expect(formatHex(c)).toBe('#ff000080');
    expect(formatRgb(c)).toBe('rgb(255 0 0 / 50.2%)');
    expect(formatOklch(rgba('#000000'))).toBe('oklch(0% 0 0)');
    expect(formatOklch(rgba('#ffffff'))).toBe('oklch(100% 0 0)');
  });

  it('oklch は CSS Color 4 の例と一致する（赤 #ff0000 ≒ oklch(62.8% 0.258 29.2)）', () => {
    expect(formatOklch(rgba('#ff0000'))).toBe('oklch(62.8% 0.258 29.2)');
  });

  it('CMYK は K を先に取る簡易変換', () => {
    expect(rgbToCmyk({ r: 0, g: 0, b: 0 })).toEqual({ c: 0, m: 0, y: 0, k: 1 });
    const w = rgbToCmyk({ r: 255, g: 255, b: 255 });
    expect([w.c, w.m, w.y, w.k]).toEqual([0, 0, 0, 0]);
  });

  /** 種を固定した乱数（mulberry32） */
  function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const roundTripColors: Rgba[] = [];
  for (let i = 0; i < 4096; i++) {
    const [r, g, b] = [(i >> 8) & 15, (i >> 4) & 15, i & 15].map((n) => n * 17);
    roundTripColors.push({ r, g, b, a: 1 });
  }
  const rand = rng(20261123);
  for (let i = 0; i < 10000; i++) {
    const n = Math.floor(rand() * 0x1000000);
    roundTripColors.push({ r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 });
  }

  it('HEX → HSL（丸めない）→ HEX の往復で値が変わらない（短い HEX 4,096 色＋乱数 10,000 色）', () => {
    const bad = roundTripColors.filter((c) => formatHex(round8({ ...hslToRgb(rgbToHsl(c)), a: 1 })) !== formatHex(c));
    expect(bad).toEqual([]);
  });

  it('HEX → HSV → HEX の往復も変わらない', () => {
    const bad = roundTripColors.filter((c) => formatHex(round8({ ...hsvToRgb(rgbToHsv(c)), a: 1 })) !== formatHex(c));
    expect(bad).toEqual([]);
  });

  it('CMYK の文字列を読み戻しても同じ HEX になる（% を丸めない値で）', () => {
    for (const c of roundTripColors.slice(0, 500)) {
      const k = rgbToCmyk(c);
      const back = parseColor(`cmyk(${k.c * 100}%, ${k.m * 100}%, ${k.y * 100}%, ${k.k * 100}%)`);
      expect(back.ok && formatHex(back.color)).toBe(formatHex(c));
    }
  });
});

describe('合格する一番近い色（nearestPassing）', () => {
  const samples: [string, string, number][] = [
    ['#777777', '#ffffff', 4.5],
    ['#3399ff', '#ffffff', 4.5],
    ['#ff6600', '#ffffff', 4.5],
    ['#ff6600', '#ffffff', 7],
    ['#cc3366', '#222222', 4.5],
    ['#66aa33', '#f3f1ed', 3],
    ['#88aacc', '#4466aa', 4.5],
    ['#e0e0ff', '#aaaacc', 3],
    ['#3366cc80', '#ffffff', 3],
  ];

  it.each(samples)('文字 %s・背景 %s・目標 %s：返す色は必ず目標以上で、H・S は元のまま', (fg, bg, target) => {
    const f = rgba(fg);
    const s = nearestPassing(f, rgba(bg), target);
    expect(s).not.toBeNull();
    if (!s) return;
    expect(contrastOf(s.color, rgba(bg))).toBeGreaterThanOrEqual(target);
    expect(s.ratio).toBeGreaterThanOrEqual(target);
    const h0 = rgbToHsl(f);
    expect(s.hsl.h).toBe(h0.h);
    expect(s.hsl.s).toBe(h0.s);
    expect(s.color.a).toBe(f.a);
    // 8bit に丸めた後の色相も、ほぼ元のまま（丸めの分だけずれる）
    const h1 = rgbToHsl(s.color);
    if (h0.s > 0.2 && h1.l > 0.08 && h1.l < 0.92) {
      const d = Math.abs(((h1.h - h0.h + 540) % 360) - 180);
      expect(d).toBeLessThan(4);
    }
  });

  it('#777777 を白に対して AA にすると #767676 前後（暗くする側）', () => {
    const s = nearestPassing(rgba('#777777'), DEFAULT_BG, 4.5)!;
    expect(s.direction).toBe('darker');
    expect(formatHex(s.color)).toBe('#767676');
  });

  it('一番近い：わずかに明るい（暗い）色でも届くなら、そこで止まる', () => {
    const s = nearestPassing(rgba('#777777'), DEFAULT_BG, 4.5)!;
    // 1段だけ明るい #787878 は届かない（＝ #767676 が境目）
    expect(contrastRatio('#787878', '#ffffff')).toBeLessThan(4.5);
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(rgbToHsl(s.color).l).toBeCloseTo(0x76 / 255, 6);
  });

  it('届かない組み合わせは null（背景 #777777・文字は無彩色・目標 7）', () => {
    // 白にしても 4.48、黒にしても 4.69
    expect(contrastRatio('#ffffff', '#777777')).toBeLessThan(7);
    expect(contrastRatio('#000000', '#777777')).toBeLessThan(7);
    expect(nearestPassing(rgba('#888888'), rgba('#777777'), 7)).toBeNull();
    expect(nearestPassing(rgba('#000000'), rgba('#777777'), 7)).toBeNull();
    expect(nearestPassing(rgba('#ffffff'), rgba('#777777'), 7)).toBeNull();
  });

  it('明るい側にしか解が無い組み合わせ：明るくして見つける', () => {
    // 背景 #333333 は暗いので、暗い側（黒）では 4.5 に届かない
    expect(contrastRatio('#000000', '#333333')).toBeLessThan(4.5);
    const s = nearestPassing(rgba('#555555'), rgba('#333333'), 4.5)!;
    expect(s.direction).toBe('lighter');
    expect(contrastRatio(s.color, rgba('#333333'))).toBeGreaterThanOrEqual(4.5);
  });

  it('暗い側にしか解が無い組み合わせ：暗くして見つける', () => {
    // 背景 #dddddd は明るいので、明るい側（白）では 4.5 に届かない
    expect(contrastRatio('#ffffff', '#dddddd')).toBeLessThan(4.5);
    const s = nearestPassing(rgba('#bbbbbb'), rgba('#dddddd'), 4.5)!;
    expect(s.direction).toBe('darker');
    expect(contrastRatio(s.color, rgba('#dddddd'))).toBeGreaterThanOrEqual(4.5);
  });

  it('両側に解があれば元の明度に近いほう。差が同じなら暗い側を優先する', () => {
    expect(pickNearer(0.5, 0.6, 0.3)).toBe('lighter');
    expect(pickNearer(0.5, 0.8, 0.4)).toBe('darker');
    expect(pickNearer(0.5, 0.75, 0.25)).toBe('darker'); // 同じ差
    expect(pickNearer(0.5, null, 0.1)).toBe('darker');
    expect(pickNearer(0.5, 0.9, null)).toBe('lighter');
    expect(pickNearer(0.5, null, null)).toBeNull();

    // 実際の色で：背景 #777777・文字も同じ灰色・目標 3 は両側に解がある。
    // L を細かく走査して両側の境目を出し、近いほうを選んでいるか確かめる
    const bg = rgba('#777777');
    const l0 = rgbToHsl(bg).l;
    const passes = (l: number) => contrastRatio(round8({ ...hslToRgb({ h: 0, s: 0, l }), a: 1 }), bg) >= 3;
    let up = l0;
    while (!passes(up)) up += 1e-4;
    let down = l0;
    while (!passes(down)) down -= 1e-4;
    const s = nearestPassing(rgba('#777777'), bg, 3)!;
    expect(s.direction).toBe(up - l0 < l0 - down ? 'lighter' : 'darker');
    expect(Math.abs(s.hsl.l - (s.direction === 'lighter' ? up : down))).toBeLessThan(2e-4);
    expect(contrastRatio(s.color, bg)).toBeGreaterThanOrEqual(3);
  });

  it('透明度つきの文字で、透明度のせいで届かないときは null（50% の黒でも白地で 3.95）', () => {
    expect(contrastOf(rgba('#00000080'), DEFAULT_BG)).toBeLessThan(4.5);
    expect(nearestPassing(rgba('#3366cc80'), DEFAULT_BG, 4.5)).toBeNull();
  });

  it('すでに届いているなら元の色をそのまま返す', () => {
    const s = nearestPassing(rgba('#1a1a1a'), DEFAULT_BG, 4.5)!;
    expect(formatHex(s.color)).toBe('#1a1a1a');
  });
});

describe('色の見え方（近似）', () => {
  it('4つの見本の見出しは「異常」「障害」を使わない', () => {
    expect(VISION_TYPES).toEqual(['protan', 'deutan', 'tritan', 'mono']);
    for (const t of VISION_TYPES) expect(VISION_LABELS[t]).not.toMatch(/異常|障害/);
    expect(VISION_LABELS.protan).toBe('P型（1型2色覚）');
  });

  it.each(VISION_TYPES)('%s：白・黒・灰色は変わらない', (t) => {
    for (const hex of ['#ffffff', '#000000', '#808080', '#3c3c3c']) {
      expect(formatHex(round8(simulate(rgba(hex), t)))).toBe(hex);
    }
  });

  it('P型・D型では赤と緑の差が小さくなる', () => {
    const red = rgba('#d62728');
    const green = rgba('#2ca02c');
    const de = (a: Rgba, b: Rgba) => deltaE2000(labOf(a), labOf(b));
    const base = de(red, green);
    for (const t of ['protan', 'deutan'] as const) {
      expect(de(simulate(red, t), simulate(green, t))).toBeLessThan(base / 2);
    }
  });

  it('モノクロは相対輝度が同じ灰色', () => {
    const c = rgba('#3366cc');
    const m = simulate(c, 'mono');
    expect(m.r).toBeCloseTo(m.g, 9);
    expect(m.g).toBeCloseTo(m.b, 9);
    expect(relativeLuminance(m)).toBeCloseTo(relativeLuminance(c), 9);
  });
});

const labOf = (c: Rgba) => rgbToLab(c);

describe('近い色の名前', () => {
  it('CIEDE2000：Sharma らの検証用データと一致する', () => {
    const cases: [number, number, number, number, number, number, number][] = [
      [50, 2.6772, -79.7751, 50, 0, -82.7485, 2.0425],
      [50, 3.1571, -77.2803, 50, 0, -82.7485, 2.8615],
      [50, -1.3802, -84.2814, 50, 0, -82.7485, 1.0],
      [50, 0, 0, 50, -1, 2, 2.3669],
      [50, 2.49, -0.001, 50, -2.49, 0.0009, 7.1792],
      [50, 2.5, 0, 56, -27, -3, 31.903],
      [60.2574, -34.0099, 36.2677, 60.4626, -34.1751, 39.4387, 1.2644],
      [22.7233, 20.0904, -46.694, 23.0331, 14.973, -42.5619, 2.0373],
      [90.8027, -2.0831, 1.441, 91.1528, -1.6435, 0.0447, 1.4441],
    ];
    for (const [L1, a1, b1, L2, a2, b2, e] of cases) {
      expect(deltaE2000({ L: L1, a: a1, b: b1 }, { L: L2, a: a2, b: b2 })).toBeCloseTo(e, 4);
    }
  });

  it('CSS の色名そのものを入れると、その名前が一番近い（色差 0）', () => {
    const n = nearestNames(rgba('rebeccapurple'));
    expect(n).toHaveLength(3);
    expect(n[0].name).toBe('rebeccapurple');
    expect(n[0].deltaE).toBeCloseTo(0, 9);
  });

  it('CSS の同じ値の別名はまとめる（gray / grey）', () => {
    const n = nearestNames(rgba('#808080'));
    expect(n[0].name).toBe('gray / grey');
    expect(n[0].source).toBe('css');
  });

  it('JIS 慣用色名も候補に入り、マンセル値を持つ', () => {
    const jis = NAMED_COLORS.filter((c) => c.source === 'jis');
    expect(jis.length).toBe(267);
    for (const c of jis) {
      expect(c.hex).toMatch(/^[0-9a-f]{6}$/);
      expect(c.munsell).toMatch(/^(N[\d.]+|[\d.]+(R|YR|Y|GY|G|BG|B|PB|P|RP) [\d.]+\/[\d.]+)$/);
    }
    const [name, , hex] = JIS_COLOR_NAMES.find(([n]) => n === '藍色')!;
    const n = nearestNames(rgba(`#${hex}`));
    expect(n.map((x) => x.name)).toContain(name);
  });

  it('JIS 慣用色名の換算はおおむねマンセル値の明るさの順になる（無彩色）', () => {
    const grays = JIS_COLOR_NAMES.filter(([, m]) => m.startsWith('N'))
      .map(([, m, hex]) => ({ v: Number(m.slice(1)), y: relativeLuminance(`#${hex}`) }))
      .sort((a, b) => a.v - b.v);
    for (let i = 1; i < grays.length; i++) expect(grays[i].y).toBeGreaterThanOrEqual(grays[i - 1].y);
    // N5 は相対輝度 0.19〜0.20 前後（ASTM D1535）
    const n5 = JIS_COLOR_NAMES.find(([, m]) => m === 'N5')!;
    expect(relativeLuminance(`#${n5[2]}`)).toBeGreaterThan(0.18);
    expect(relativeLuminance(`#${n5[2]}`)).toBeLessThan(0.21);
  });

  it('CSS の色名は CSS Color 4 の 148 色', () => {
    expect(Object.keys(CSS_NAMED_COLORS)).toHaveLength(148);
    expect(CSS_NAMED_COLORS.rebeccapurple).toBe('663399');
    expect(CSS_NAMED_COLORS.grey).toBe(CSS_NAMED_COLORS.gray);
  });
});

describe('URL のクエリ', () => {
  it('値は # 無しの HEX（6 桁または 8 桁）だけを書き出す', () => {
    expect(hexForQuery(rgba('#1A1A1A'))).toBe('1a1a1a');
    expect(hexForQuery(rgba('rgb(255 0 0 / 50%)'))).toBe('ff000080');
    expect(hexForQuery(rgba('#abc'))).toBe('aabbcc');
  });

  it('?c= は変換タブ、?fg=&bg= はコントラストタブ', () => {
    const c = readColorQuery('?c=3366cc');
    expect(c.tab).toBe('convert');
    expect(formatHex(c.c)).toBe('#3366cc');
    const q = readColorQuery('?fg=777777&bg=ffffff');
    expect(q.tab).toBe('contrast');
    expect(formatHex(q.fg)).toBe('#777777');
    expect(formatHex(q.bg)).toBe('#ffffff');
  });

  it.each(['?fg=zzz', '?c=12345', '?fg=fff&bg=12', '?c=%E3%81%82', '?fg=#1a1a1a1', '?bg=', '?c', '', '?fg=1234567'])(
    '不正なクエリ %j は既定値に戻り、例外を投げない',
    (search) => {
      let q!: ReturnType<typeof readColorQuery>;
      expect(() => (q = readColorQuery(search))).not.toThrow();
      const fgOk = parseQueryHex(new URLSearchParams(search).get('fg'));
      const bgOk = parseQueryHex(new URLSearchParams(search).get('bg'));
      const cOk = parseQueryHex(new URLSearchParams(search).get('c'));
      expect(fgOk ?? cOk ?? bgOk).toBeNull();
      expect(formatHex(q.fg)).toBe(formatHex(DEFAULT_FG));
      expect(formatHex(q.bg)).toBe(formatHex(DEFAULT_BG));
      expect(formatHex(q.c)).toBe(formatHex(DEFAULT_FG));
    },
  );

  it('既定値は文字 #1a1a1a・背景 #ffffff', () => {
    expect(formatHex(DEFAULT_FG)).toBe('#1a1a1a');
    expect(formatHex(DEFAULT_BG)).toBe('#ffffff');
  });

  it('片方だけ不正なら、その片方だけ既定値に戻す', () => {
    const q = readColorQuery('?fg=336699&bg=xyz');
    expect(formatHex(q.fg)).toBe('#336699');
    expect(formatHex(q.bg)).toBe('#ffffff');
  });
});
