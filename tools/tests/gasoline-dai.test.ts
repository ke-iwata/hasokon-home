import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FUEL_PRICES,
  PRICE_RISE,
  ZANTEI_NOTE,
  acceptsOneDecimal,
  calcMonthly,
  calcTrip,
  formatLiters,
  highOctaneGap,
  monthlyDetailLines,
  priceAsOfLabel,
  tripCopyText,
  zanteiTaxPerLiter,
  type MonthlyInput,
  type TripInput,
} from '@/lib/gasoline-dai';
import { tools } from '@/lib/registry';

/** 仕様: docs/features/gasoline-dai-keisan.md の「テスト」 */

const trip = (over: Partial<TripInput> = {}): TripInput => ({
  distanceKm: '120',
  roundTrip: true,
  kmPerLiter: '15',
  pricePerLiter: '170.1',
  extraYen: '',
  people: 1,
  driverExempt: false,
  ...over,
});

const monthly = (over: Partial<MonthlyInput> = {}): MonthlyInput => ({
  monthlyKm: '400',
  kmPerLiter: '15',
  pricePerLiter: '170.1',
  fuel: 'regular',
  priceRise: PRICE_RISE.default,
  ...over,
});

function ok<T extends { ok: boolean }>(r: T | { ok: false; problems: string[] }): T {
  if (!r.ok) throw new Error(`結果が出ていない: ${(r as { problems: string[] }).problems.join(' / ')}`);
  return r as T;
}

const source = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

describe('1回のドライブ', () => {
  it('往復 240 km・15 km/L・170.1 円 → 16.0 L・2,722 円', () => {
    const r = ok(calcTrip(trip()));
    expect(r.km).toBe(240);
    expect(formatLiters(r.liters)).toBe('16.0');
    expect(r.fuelYen).toBe(2722); // 2,721.6 を四捨五入
  });

  it('往復をオフにすると片道の距離のまま', () => {
    const r = ok(calcTrip(trip({ roundTrip: false })));
    expect(r.km).toBe(120);
    expect(r.fuelYen).toBe(1361); // 1,360.8
  });

  it('割り勘：合計 5,722 円・4 人 → 1,431 円・集めすぎ 2 円', () => {
    const r = ok(calcTrip(trip({ extraYen: '3000', people: 4 })));
    expect(r.totalYen).toBe(5722);
    expect(r.payers).toBe(4);
    expect(r.perPersonYen).toBe(1431);
    expect(r.overCollectedYen).toBe(2);
  });

  it('運転者を除く（3 人で割る）→ 1,908 円・集めすぎ 2 円', () => {
    const r = ok(calcTrip(trip({ extraYen: '3000', people: 4, driverExempt: true })));
    expect(r.payers).toBe(3);
    expect(r.perPersonYen).toBe(1908);
    expect(r.overCollectedYen).toBe(2);
  });

  it('1人のときは「運転者を除く」が効かない（0 人で割らない）', () => {
    const r = ok(calcTrip(trip({ driverExempt: true })));
    expect(r.payers).toBe(1);
    expect(r.perPersonYen).toBe(r.totalYen);
  });

  it('割り切れるときは集めすぎ 0 円', () => {
    const r = ok(calcTrip(trip({ extraYen: '3278', people: 2 }))); // 2,722 + 3,278 = 6,000
    expect(r.perPersonYen).toBe(3000);
    expect(r.overCollectedYen).toBe(0);
  });

  it('端数：給油量の表示は丸めるが、金額は丸める前の値から出す', () => {
    const r = ok(calcTrip(trip({ distanceKm: '100.3', roundTrip: false, kmPerLiter: '13.5' })));
    expect(formatLiters(r.liters)).toBe('7.4');
    expect(r.fuelYen).toBe(1264); // 100.3 ÷ 13.5 × 170.1 ＝ 1,263.78
    // 丸めた 7.4 L から出すと 1,259 円になってしまう
    expect(Math.round(7.4 * 170.1)).not.toBe(r.fuelYen);
  });

  it('連絡用のコピーの文（仕様書の例）', () => {
    const input = trip({ extraYen: '3000', people: 4 });
    expect(tripCopyText(input, ok(calcTrip(input)))).toBe(
      '往復 240 km・燃費 15 km/L・170.1 円/L → ガソリン代 2,722 円＋高速代など 3,000 円＝5,722 円、4 人で 1 人 1,431 円',
    );
  });

  it('連絡用のコピーの文：運転者を除く・高速代なし・1人', () => {
    const exempt = trip({ people: 4, driverExempt: true });
    expect(tripCopyText(exempt, ok(calcTrip(exempt)))).toBe(
      '往復 240 km・燃費 15 km/L・170.1 円/L → ガソリン代 2,722 円、4 人（運転する人を除く 3 人）で 1 人 908 円',
    );
    const solo = trip();
    expect(tripCopyText(solo, ok(calcTrip(solo)))).toBe('往復 240 km・燃費 15 km/L・170.1 円/L → ガソリン代 2,722 円');
  });
});

describe('入力の精度（距離・燃費は小数 1 桁まで）', () => {
  it.each(['', '100', '100.', '100.2', '0.5', '13.5'])('「%s」は入力できる', (t) => {
    expect(acceptsOneDecimal(t)).toBe(true);
  });
  it.each(['100.25', '13.55', '-1', '1e3', 'abc', '1.2.3'])('「%s」は入力できない', (t) => {
    expect(acceptsOneDecimal(t)).toBe(false);
  });
  it('画面の距離・燃費の欄はこの判定を通す', () => {
    const calc = source('../app/gasoline-dai/Calculator.tsx');
    expect(calc).toContain('acceptsOneDecimal');
  });
});

describe('不正な入力では結果を出さず、欠けている欄の名前を出す', () => {
  it('燃費 0', () => {
    const r = calcTrip(trip({ kmPerLiter: '0' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join()).toContain('燃費');
  });
  it('負の距離', () => {
    const r = calcTrip(trip({ distanceKm: '-10' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join()).toContain('距離');
  });
  it('空欄（距離・燃費・単価）は 3 つとも名前が出る', () => {
    const r = calcTrip(trip({ distanceKm: '', kmPerLiter: '', pricePerLiter: '' }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const text = r.problems.join();
      for (const name of ['距離', '燃費', '単価']) expect(text).toContain(name);
    }
  });
  it('毎月：走行距離が空欄・燃費が負', () => {
    const r = calcMonthly(monthly({ monthlyKm: '', kmPerLiter: '-3' }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problems.join()).toContain('毎月の走行距離');
      expect(r.problems.join()).toContain('燃費');
    }
  });
});

describe('毎月・1年', () => {
  it('月 400 km・15 km/L・170.1 円 → 月 4,536 円・年 54,432 円', () => {
    const r = ok(calcMonthly(monthly()));
    expect(r.monthYen).toBe(4536);
    expect(r.yearYen).toBe(4536 * 12);
  });

  it('単価が ＋5 円なら 月 ＋133 円・年 ＋1,596 円', () => {
    const r = ok(calcMonthly(monthly()));
    expect(r.priceRise).toBe(5);
    expect(r.riseMonthYen).toBe(133); // 26.67 L × 5 円
    expect(r.riseYearYen).toBe(133 * 12);
  });

  it('上がり幅は 1〜20 円に収める', () => {
    expect(ok(calcMonthly(monthly({ priceRise: 0 }))).priceRise).toBe(1);
    expect(ok(calcMonthly(monthly({ priceRise: 99 }))).priceRise).toBe(20);
  });

  it('暫定税率の分の税：ガソリン → 年 320 L × 27.61 ＝ 8,835 円相当', () => {
    const r = ok(calcMonthly(monthly()));
    expect(r.litersPerYear).toBeCloseTo(320, 10);
    expect(r.zanteiPerLiter).toBe(27.61);
    expect(r.zanteiYearYen).toBe(8835);
  });

  it('ハイオクはガソリンと同じ 27.61 円/L、軽油は消費税をかけない 17.1 円/L', () => {
    expect(zanteiTaxPerLiter('regular')).toBe(27.61);
    expect(zanteiTaxPerLiter('highOctane')).toBe(27.61);
    expect(zanteiTaxPerLiter('diesel')).toBe(17.1);
    const d = ok(calcMonthly(monthly({ fuel: 'diesel', pricePerLiter: String(FUEL_PRICES.diesel) })));
    expect(d.zanteiYearYen).toBe(Math.round(320 * 17.1)); // 5,472
  });

  it('結果の行に「店頭価格がこの額だけ下がったとは限りません」の注記が出て、「軽くなった」は出ない', () => {
    const lines = monthlyDetailLines(ok(calcMonthly(monthly())));
    const zantei = lines.find((l) => l.label.startsWith('暫定税率の分の税'));
    expect(zantei?.value).toBe('年 8,835 円相当');
    expect(zantei?.note).toContain('店頭価格がこの額だけ下がったとは限りません');
    const all = lines.map((l) => `${l.label}${l.value}${l.note ?? ''}`).join();
    expect(all).not.toContain('軽くなった');
  });

  it('画面・本文に「軽くなった」と書かず、注記は ZANTEI_NOTE を使う', () => {
    const calc = source('../app/gasoline-dai/Calculator.tsx');
    const page = source('../app/gasoline-dai/page.tsx');
    for (const s of [calc, page]) expect(s).not.toContain('軽くなった');
    expect(calc).toContain('monthlyDetailLines');
    expect(ZANTEI_NOTE).toContain('店頭価格がこの額だけ下がったとは限りません');
  });
});

describe('単価の既定値と日付', () => {
  it('既定の単価なら asOf の日付が出る', () => {
    const label = priceAsOfLabel('regular', String(FUEL_PRICES.regular));
    expect(label).toContain('2026年10月26日時点の全国平均');
    expect(label).toContain('資源エネルギー庁');
  });
  it('油種ごとの既定値でも日付が出る', () => {
    expect(priceAsOfLabel('highOctane', String(FUEL_PRICES.highOctane))).not.toBeNull();
    expect(priceAsOfLabel('diesel', String(FUEL_PRICES.diesel))).not.toBeNull();
  });
  it('書き換えたら日付の表示が消える', () => {
    expect(priceAsOfLabel('regular', '175')).toBeNull();
    expect(priceAsOfLabel('regular', '')).toBeNull();
    // 別の油種の既定値のままでも、その油種の日付ではない
    expect(priceAsOfLabel('diesel', String(FUEL_PRICES.regular))).toBeNull();
  });
  it('画面は単価の横に priceAsOfLabel を出す', () => {
    expect(source('../app/gasoline-dai/Calculator.tsx')).toContain('priceAsOfLabel(');
  });
  it('ハイオクとレギュラーの差', () => {
    expect(highOctaneGap()).toBe(10.9);
  });
  it('asOf は ISO の日付で、registry の updatedAt より後ではない', () => {
    expect(FUEL_PRICES.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const entry = tools.find((t) => t.slug === 'gasoline-dai');
    expect(entry).toBeDefined();
    expect(FUEL_PRICES.asOf <= (entry?.updatedAt ?? '')).toBe(true);
  });
});

describe('補助の縮小の日程をコードに持たない', () => {
  it('lib に 12 月の日付・基準価格を書かない', () => {
    const lib = source('../lib/gasoline-dai.ts');
    expect(lib).not.toMatch(/12-0?3\b|12-10|12-17|基準価格\s*[:=]/);
  });
  it('title に「12月の値上げ」の括弧を付けない（一次情報で日程が取れていないため）', () => {
    const page = source('../app/gasoline-dai/page.tsx');
    const title = page.match(/const title =\s*'([^']+)'/)?.[1] ?? '';
    expect(title).toBe('ガソリン代 計算機｜距離と燃費から往復・割り勘・月の燃料費');
  });
});
