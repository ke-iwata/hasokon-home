import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  bmiAtLeast,
  bmiTenths,
  calcBmi,
  CHILD_COEFFICIENTS,
  childObesity,
  distanceToRangeTenths,
  formatTenths,
  INFANT_MESSAGE,
  jassoClass,
  jassoClassOfTenths,
  normalWeightRange,
  quickTableRow,
  standardWeightTenths,
  targetBandFor,
  targetBandRangeLabel,
  targetSentence,
  type AdultResult,
} from '@/lib/bmi';
import { bandLayout, boxOf, NARROW_WIDTH } from '@/lib/bmi-band';
import { tools } from '@/lib/registry';

/**
 * BMI・適正体重 計算機のテスト。
 * 仕様: docs/features/bmi-tekisei-taiju.md「テスト」
 */

const adult = (heightCm: number, weightKg: number, age: number | null = null) => {
  const r = calcBmi({ heightCm, weightKg, age, sex: null });
  if (r.kind !== 'adult') throw new Error(`adult でない: ${r.kind}`);
  return r;
};

/** 丸める前の BMI が [lo, hi) に入る (h10, w10) を1組探す（整数の有理数比較で） */
function findPair(lo: number, hi: number): { h10: number; w10: number } {
  for (let h10 = 1000; h10 <= 2500; h10++) {
    for (let w10 = 100; w10 <= 3000; w10++) {
      const n = w10 * 1e6;
      const d = h10 * h10;
      // BMI = n / d / 10。lo ≤ BMI < hi を 10000 倍した整数で比べる
      if (n * 1000 >= Math.round(lo * 10000) * d && n * 1000 < Math.round(hi * 10000) * d) {
        return { h10, w10 };
      }
    }
  }
  throw new Error(`見つからない: ${lo}〜${hi}`);
}

describe('BMI の境目（整数で判定する）', () => {
  it.each([
    [18.49, 18.5, 'underweight'],
    [18.5, 18.5001, 'normal'],
    [24.99, 25.0, 'normal'],
    [25.0, 25.0001, 'obese1'],
    [29.99, 30.0, 'obese1'],
    [30.0, 30.0001, 'obese2'],
    [34.99, 35.0, 'obese2'],
    [35.0, 35.0001, 'obese3'],
    [39.99, 40.0, 'obese3'],
    [40.0, 40.0001, 'obese4'],
  ] as const)('BMI %s〜%s は %s', (lo, hi, id) => {
    const { h10, w10 } = findPair(lo, hi);
    expect(jassoClass(h10, w10).id).toBe(id);
  });

  it('18.4999 → 低体重・24.9999 → 普通体重（境目のすぐ下）', () => {
    const a = findPair(18.4999, 18.5);
    expect(jassoClass(a.h10, a.w10).id).toBe('underweight');
    const b = findPair(24.9999, 25);
    expect(jassoClass(b.h10, b.w10).id).toBe('normal');
  });

  it('160cm・64kg はちょうど 25.0・肥満（1度）（浮動小数だと 24.999… で誤判定する例）', () => {
    expect(64 / (1.6 * 1.6)).toBeLessThan(25); // 浮動小数の落とし穴そのもの
    const r = adult(160, 64);
    expect(formatTenths(r.bmiTenths)).toBe('25.0');
    expect(r.jasso.label).toBe('肥満（1度）');
  });

  it('160cm・63.9kg は 24.9・普通体重', () => {
    const r = adult(160, 63.9);
    expect(formatTenths(r.bmiTenths)).toBe('24.9');
    expect(r.jasso.label).toBe('普通体重');
  });

  it('bmiAtLeast は W×10⁶ ≥ (t×10)×H² そのもの', () => {
    expect(bmiAtLeast(1600, 640, 250)).toBe(true);
    expect(bmiAtLeast(1600, 639, 250)).toBe(false);
  });
});

describe('表示（小数第2位以下を切り捨て）', () => {
  it('170cm・63.6kg は BMI 22.0（22.006… の切り捨て）、標準体重 63.6kg（63.58 の四捨五入）', () => {
    const r = adult(170, 63.6);
    expect(formatTenths(r.bmiTenths)).toBe('22.0');
    expect(formatTenths(r.standardWeightTenths)).toBe('63.6');
  });

  it('BMI 24.95 → 表示 24.9・普通体重／18.49 → 表示 18.4・低体重', () => {
    const a = findPair(24.95, 24.96);
    expect(formatTenths(bmiTenths(a.h10, a.w10))).toBe('24.9');
    expect(jassoClass(a.h10, a.w10).label).toBe('普通体重');
    const b = findPair(18.49, 18.5);
    expect(formatTenths(bmiTenths(b.h10, b.w10))).toBe('18.4');
    expect(jassoClass(b.h10, b.w10).label).toBe('低体重');
  });

  it('表示した BMI の区分と判定はいつも一致する（身長 140〜200cm × 体重 30〜150kg の全組み合わせ）', () => {
    for (let h10 = 1400; h10 <= 2000; h10 += 3) {
      for (let w10 = 300; w10 <= 1500; w10++) {
        const shown = jassoClassOfTenths(bmiTenths(h10, w10)).id;
        if (shown !== jassoClass(h10, w10).id) {
          throw new Error(`${h10 / 10}cm ${w10 / 10}kg で表示と判定が食い違う`);
        }
      }
    }
  });

  it('formatTenths は負の数も符号つきで書く', () => {
    expect(formatTenths(-203)).toBe('−20.3');
    expect(formatTenths(5)).toBe('0.5');
  });
});

describe('標準体重・普通体重の幅', () => {
  it('170cm は「53.5kg〜72.2kg まで」', () => {
    const r = normalWeightRange(1700);
    expect(formatTenths(r.minTenths)).toBe('53.5');
    expect(formatTenths(r.maxTenths)).toBe('72.2');
  });

  it('上端がちょうど小数1桁になる身長（200cm で 25×4＝100.0kg）は「99.9kg まで」', () => {
    expect(formatTenths(normalWeightRange(2000).maxTenths)).toBe('99.9');
  });

  it('幅の端は表示した値ちょうどで普通体重に入り、0.1kg 外は入らない（100〜250cm）', () => {
    for (let h10 = 1000; h10 <= 2500; h10++) {
      const { minTenths, maxTenths } = normalWeightRange(h10);
      expect(jassoClass(h10, minTenths).id).toBe('normal');
      expect(jassoClass(h10, maxTenths).id).toBe('normal');
      expect(jassoClass(h10, minTenths - 1).id).toBe('underweight');
      expect(jassoClass(h10, maxTenths + 1).id).toBe('obese1');
    }
  });

  it('「あと ◯kg」はその分だけ変えると必ず幅に入る（身長 150〜200cm の全組み合わせ）', () => {
    for (let h10 = 1500; h10 <= 2000; h10++) {
      const range = normalWeightRange(h10);
      for (let w10 = 100; w10 <= 3000; w10 += 7) {
        const d = distanceToRangeTenths(w10, range);
        expect(jassoClass(h10, w10 + d).id).toBe('normal');
        if (d !== 0) {
          // 1つ手前（0.1kg 少なく変えた値）では入らない＝切り上げすぎていない
          const short = w10 + d - Math.sign(d);
          expect(jassoClass(h10, short).id).not.toBe('normal');
        }
      }
    }
  });

  it('幅の中なら差は 0', () => {
    expect(adult(170, 60).toNormalTenths).toBe(0);
  });

  it('標準体重は四捨五入（境目の判定には使わない）', () => {
    // 160cm: 2.56 × 22 = 56.32 → 56.3
    expect(formatTenths(standardWeightTenths(1600))).toBe('56.3');
    // 150cm: 2.25 × 22 = 49.5 → 49.5
    expect(formatTenths(standardWeightTenths(1500))).toBe('49.5');
  });
});

describe('年代別の目標 BMI（食事摂取基準 2025年版）', () => {
  it('64 歳と 65 歳で下限が 20.0 → 21.5 に切り替わる', () => {
    expect(targetBandFor(64)?.lowerTenths).toBe(200);
    expect(targetBandFor(65)?.lowerTenths).toBe(215);
  });

  it('表の値（18〜49 18.5〜24.9／50〜64 20.0〜24.9／65〜74・75以上 21.5〜24.9）', () => {
    expect(targetBandRangeLabel(targetBandFor(18)!)).toBe('18.5〜24.9');
    expect(targetBandRangeLabel(targetBandFor(49)!)).toBe('18.5〜24.9');
    expect(targetBandRangeLabel(targetBandFor(50)!)).toBe('20.0〜24.9');
    expect(targetBandRangeLabel(targetBandFor(74)!)).toBe('21.5〜24.9');
    expect(targetBandRangeLabel(targetBandFor(90)!)).toBe('21.5〜24.9');
  });

  it('上限の 24.9 は「25.0 未満」として判定する（表示 24.9 は目標の中）', () => {
    const r = adult(160, 63.9, 40);
    expect(r.target?.status).toBe('within');
    expect(adult(160, 64, 40).target?.status).toBe('above');
  });

  it('普通体重でも 65 歳以上の目標より低めなら、両方を言葉で書く', () => {
    // 170cm・58kg → BMI 20.0（普通体重）。65歳の下限 21.5 より低い
    const r = adult(170, 58, 70);
    expect(r.jasso.label).toBe('普通体重');
    expect(r.target?.status).toBe('below');
    expect(targetSentence(r)).toBe(
      '日本肥満学会の判定は普通体重ですが、65〜74歳の目標（21.5〜24.9）より低めです。',
    );
  });

  it('年齢が空欄なら目標の見直しは出さない', () => {
    const r: AdultResult = adult(170, 58);
    expect(r.target).toBeNull();
    expect(targetSentence(r)).toBeNull();
  });
});

describe('子ども（5〜17歳）の肥満度', () => {
  /** 日本学校保健会マニュアル（平成27年度改訂）の表。文部科学省の資料と突き合わせた値 */
  const MANUAL: [number, number, number, number, number][] = [
    [5, 0.386, 23.699, 0.377, 22.75],
    [6, 0.461, 32.382, 0.458, 32.079],
    [7, 0.513, 38.878, 0.508, 38.367],
    [8, 0.592, 48.804, 0.561, 45.006],
    [9, 0.687, 61.39, 0.652, 56.992],
    [10, 0.752, 70.461, 0.73, 68.091],
    [11, 0.782, 75.106, 0.803, 78.846],
    [12, 0.783, 75.642, 0.796, 76.934],
    [13, 0.815, 81.348, 0.655, 54.234],
    [14, 0.832, 83.695, 0.594, 43.264],
    [15, 0.766, 70.989, 0.56, 37.002],
    [16, 0.656, 51.822, 0.578, 39.057],
    [17, 0.672, 53.642, 0.598, 42.339],
  ];

  it('係数表の 26 行が出典の値と一致する', () => {
    expect(Object.keys(CHILD_COEFFICIENTS.male)).toHaveLength(13);
    expect(Object.keys(CHILD_COEFFICIENTS.female)).toHaveLength(13);
    for (const [age, ma, mb, fa, fb] of MANUAL) {
      expect(CHILD_COEFFICIENTS.male[age]).toEqual({ a: ma, b: mb });
      expect(CHILD_COEFFICIENTS.female[age]).toEqual({ a: fa, b: fb });
    }
  });

  // 10歳男子・140.0cm：標準体重 = 0.752×140 − 70.461 = 34.819kg
  const STD = 0.752 * 140 - 70.461;

  it('身長別標準体重は a × 身長 − b', () => {
    const r = childObesity(1400, 350, 10, 'male')!;
    expect(formatTenths(r.standardWeightTenths)).toBe('34.8');
  });

  it('+19.9% → ふつう・+20.0% → 軽度肥満・−20.0% → やせ の境目', () => {
    // 体重は小数1桁なので、境目をまたぐ最小の体重を探して比べる
    const w20 = Math.ceil(STD * 1.2 * 10); // +20% 以上になる最小の体重×10
    expect(childObesity(1400, w20, 10, 'male')!.label).toBe('軽度肥満');
    expect(childObesity(1400, w20 - 1, 10, 'male')!.label).toBe('ふつう');
    const wm20 = Math.floor(STD * 0.8 * 10); // −20% 以下になる最大の体重×10
    expect(childObesity(1400, wm20, 10, 'male')!.label).toBe('やせ');
    expect(childObesity(1400, wm20 + 1, 10, 'male')!.label).toBe('ふつう');
  });

  it('ちょうど +20.0%・−20.0% になる体重で判定が境目に乗る（全年齢・男女から探す）', () => {
    // 標準体重(1/10000kg 単位) = a×1000 × 身長×10 − b×1000 × 10。
    // ×1.2・×0.8 がちょうど 0.1kg 単位になる組み合わせだけを拾う
    let plus = 0;
    let minus = 0;
    for (const sex of ['male', 'female'] as const) {
      for (const [age, c] of Object.entries(CHILD_COEFFICIENTS[sex])) {
        for (let h10 = 1000; h10 <= 1900; h10++) {
          const std = Math.round(c.a * 1000) * h10 - Math.round(c.b * 1000) * 10;
          if (std <= 0) continue;
          if ((std * 12) % 10000 === 0) {
            const r = childObesity(h10, (std * 12) / 10000, Number(age), sex)!;
            expect(r.degreeTenths).toBe(200);
            expect(r.label).toBe('軽度肥満');
            plus++;
          }
          if ((std * 8) % 10000 === 0) {
            const r = childObesity(h10, (std * 8) / 10000, Number(age), sex)!;
            expect(r.degreeTenths).toBe(-200);
            expect(r.label).toBe('やせ');
            minus++;
          }
        }
      }
    }
    expect(plus).toBeGreaterThan(0);
    expect(minus).toBeGreaterThan(0);
  });

  it('+30%・+50%・−30% の区分', () => {
    expect(childObesity(1400, Math.ceil(STD * 1.3 * 10), 10, 'male')!.label).toBe('中等度肥満');
    expect(childObesity(1400, Math.ceil(STD * 1.5 * 10), 10, 'male')!.label).toBe('高度肥満');
    expect(childObesity(1400, Math.floor(STD * 0.7 * 10), 10, 'male')!.label).toBe('高度やせ');
  });

  it('表示した肥満度と判定が食い違わない（0 に向けて切り捨て）', () => {
    for (let w10 = 200; w10 <= 600; w10++) {
      const r = childObesity(1400, w10, 10, 'male')!;
      const d = r.degreeTenths;
      const expected =
        d >= 500 ? '高度肥満' : d >= 300 ? '中等度肥満' : d >= 200 ? '軽度肥満' : d <= -300 ? '高度やせ' : d <= -200 ? 'やせ' : 'ふつう';
      expect(r.label, `${w10 / 10}kg 肥満度 ${formatTenths(d)}`).toBe(expected);
    }
  });

  it('5 歳と 17 歳は肥満度、18 歳は BMI で判定する', () => {
    expect(calcBmi({ heightCm: 110, weightKg: 19, age: 5, sex: 'female' }).kind).toBe('child');
    expect(calcBmi({ heightCm: 170, weightKg: 60, age: 17, sex: 'male' }).kind).toBe('child');
    expect(calcBmi({ heightCm: 170, weightKg: 60, age: 18, sex: 'male' }).kind).toBe('adult');
  });

  it('5〜17歳で性別が無いときは判定せず、性別を求める', () => {
    expect(calcBmi({ heightCm: 140, weightKg: 35, age: 10, sex: null }).kind).toBe('needSex');
  });
});

describe('判定しないとき', () => {
  it('0〜4 歳は乳幼児の注記を出して判定しない', () => {
    for (const age of [0, 1, 4]) {
      const r = calcBmi({ heightCm: 90, weightKg: 13, age, sex: 'male' });
      expect(r).toEqual({ kind: 'infant', message: INFANT_MESSAGE });
    }
    expect(INFANT_MESSAGE).toContain('母子健康手帳の発育曲線');
  });

  it.each([
    [99.9, 60],
    [250.1, 60],
    [170, 9.9],
    [170, 300.1],
    [Number.NaN, 60],
  ])('身長 %s・体重 %s は範囲外で判定を返さない', (h, w) => {
    expect(calcBmi({ heightCm: h, weightKg: w, age: null, sex: null }).kind).toBe('invalid');
  });

  it('範囲の端（100.0cm・250.0cm・10.0kg・300.0kg）は判定する', () => {
    expect(calcBmi({ heightCm: 100, weightKg: 10, age: null, sex: null }).kind).toBe('adult');
    expect(calcBmi({ heightCm: 250, weightKg: 300, age: null, sex: null }).kind).toBe('adult');
  });

  it('年齢が整数でない・範囲外なら判定を返さない', () => {
    expect(calcBmi({ heightCm: 170, weightKg: 60, age: 30.5, sex: null }).kind).toBe('invalid');
    expect(calcBmi({ heightCm: 170, weightKg: 60, age: 121, sex: null }).kind).toBe('invalid');
  });
});

describe('早見表', () => {
  it('170cm の行は 53.5／63.6／72.2kg', () => {
    const r = quickTableRow(170);
    expect([r.lowerTenths, r.standardTenths, r.upperTenths].map(formatTenths)).toEqual([
      '53.5',
      '63.6',
      '72.2',
    ]);
  });
});

describe('判定の帯（配置）', () => {
  const overlap = (a: ReturnType<typeof boxOf>, b: ReturnType<typeof boxOf>) =>
    a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

  const target = { lowerTenths: 215, upperTenths: 250, label: '65〜74歳の目標 21.5〜24.9' };

  it.each([320, 343, 360, 375, 414, 479, 480, 560, 720])('幅 %ipx で文字どうしが重ならず、はみ出さない', (w) => {
    for (const bmi of [120, 150, 184, 220, 251, 348, 405, 473]) {
      const L = bandLayout(w, bmi, target);
      const texts = [...L.segments.map((s) => s.label), ...L.ticks, L.marker.label, L.bracket!.label];
      const boxes = texts.map((t) => boxOf(t));
      for (let i = 0; i < boxes.length; i++) {
        expect(boxes[i].x1, `${texts[i].text} が左にはみ出す`).toBeGreaterThanOrEqual(0);
        expect(boxes[i].x2, `${texts[i].text} が右にはみ出す`).toBeLessThanOrEqual(w);
        for (let j = i + 1; j < boxes.length; j++) {
          expect(overlap(boxes[i], boxes[j]), `${w}px で「${texts[i].text}」と「${texts[j].text}」が重なる`).toBe(false);
        }
      }
      // 区分名は帯の中か、帯の下（目標の括弧は帯の上）
      for (const s of L.segments) {
        if (!s.inside) expect(s.label.y).toBeGreaterThan(54);
      }
      expect(L.bracket!.label.y).toBeLessThan(26);
      expect(L.marker.label.y).toBeGreaterThan(54);
    }
  });

  it('480px 未満は区分名を帯の中に書かず、肥満は「1度」〜「4度」に縮め、35〜40・40〜42 に引き出し線', () => {
    const L = bandLayout(NARROW_WIDTH - 1, 220, null);
    expect(L.narrow).toBe(true);
    expect(L.segments.every((s) => !s.inside)).toBe(true);
    expect(L.segments.filter((s) => s.id.startsWith('obese')).map((s) => s.label.text)).toEqual([
      '1度',
      '2度',
      '3度',
      '4度',
    ]);
    expect(L.segments.filter((s) => s.leader).map((s) => s.id)).toEqual(['obese3', 'obese4']);
    // 上下2段に交互
    const ys = L.segments.map((s) => s.label.y);
    expect(ys[0]).not.toBe(ys[1]);
    expect(ys[0]).toBe(ys[2]);
  });

  it('範囲外の値は端に印を寄せ、実際の数値を出す', () => {
    const L = bandLayout(560, 473, null);
    expect(L.marker.clamped).toBe(true);
    expect(L.marker.x).toBeCloseTo(560 - 8);
    expect(L.marker.label.text).toBe('今ここ 47.3');
    const low = bandLayout(560, 120, null);
    expect(low.marker.x).toBeCloseTo(8);
    expect(low.marker.label.text).toBe('今ここ 12.0');
  });
});

describe('ページ（コンプライアンス・公開の段階）', () => {
  const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
  const page = read('../app/bmi/page.tsx');
  const calc = read('../app/bmi/Calculator.tsx');
  const band = read('../app/bmi/BmiBand.tsx');

  it('registry に wip・生活・健康で1件', () => {
    const entry = tools.filter((t) => t.slug === 'bmi');
    expect(entry).toHaveLength(1);
    expect(entry[0].stage).toBe('wip');
    expect(entry[0].category).toBe('生活・健康');
  });

  it.each([
    ['page.tsx', page],
    ['Calculator.tsx', calc],
  ])('%s に減量の指示・商品・強い言葉が無い', (_n, src) => {
    for (const word of [
      'ダイエット',
      'サプリ',
      '痩せましょう',
      'やせましょう',
      '減らしましょう',
      '増やしましょう',
      '減量しましょう',
      '危険',
      '要注意',
      '異常です',
      '医薬品',
    ]) {
      expect(src.includes(word), `「${word}」がある`).toBe(false);
    }
  });

  it('判定は「目安」と書き、肥満症は医師が判断すると明記する', () => {
    expect(calc).toContain('判定の目安');
    expect(page).toContain('医師が診断する');
    expect(calc).toContain('医師が判断する');
  });

  it('赤（--danger）で煽らない', () => {
    for (const src of [calc, band]) expect(src).not.toMatch(/--danger|red|#b91c1c/);
  });

  it('GA4 に渡すのは「計算した」の1種類だけで、値を載せない', () => {
    const calls = [...calc.matchAll(/trackToolUse\(([^)]*)\)/g)].map((m) => m[1]);
    expect(calls).toEqual(["'bmi', 'calculate'"]);
  });

  it('入力欄は inputmode="decimal"（スマホで数字キーボード）', () => {
    expect(calc.match(/inputMode="decimal"/g)).toHaveLength(2);
  });

  it('FAQ は4問で、仕様書の問いを含む', () => {
    const qs = [...page.matchAll(/q: '([^']+)'/g)].map((m) => m[1]);
    expect(qs).toHaveLength(4);
    expect(qs.join()).toMatch(/BMI 22/);
    expect(qs.join()).toMatch(/何歳から/);
    expect(qs.join()).toMatch(/体脂肪/);
    expect(qs.join()).toMatch(/肥満症/);
  });

  it('出典の一覧と最終確認日を出す', () => {
    expect(page).toContain('https://www.mhlw.go.jp/content/10904750/001316461.pdf');
    expect(page).toContain('児童生徒等の健康診断マニュアル');
    expect(page).toContain('DATA_CHECKED_AT');
  });
});
