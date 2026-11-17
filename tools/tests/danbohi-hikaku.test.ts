import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CITY_GAS_13A_MJ_PER_M3,
  LPG_MJ_PER_M3,
  airconWattEstimate,
  calcRow,
  convertKeroseneUnit,
  defaultKerosene18L,
  gasM3PerHour,
  heatUnitTable,
  heaterDefaultUsageMonth,
  heaterUsageMonthOptions,
  isPriceStale,
  parsePrice,
  perLiterFrom18L,
  priceDateNotes,
  rankRows,
  type HeaterRow,
  type Prices,
  type RowResult,
  type Usage,
} from '@/lib/danbohi-hikaku';
import { FUEL_PRICES, KEROSENE_BY_PREF } from '@/lib/gasoline-dai';
import { SHIEN_ENDED_FROM, SHIEN_PERIODS, addMonths } from '@/lib/denki-gas-shien';
import { tools } from '@/lib/registry';

/** 仕様: docs/features/danbohi-hikaku.md の「計算の約束」と「確認のチェックリスト」 */

const prices = (over: Partial<Prices> = {}): Prices => ({
  electricity: 31,
  kerosenePerLiter: perLiterFrom18L(2563),
  cityGas: null,
  lpg: null,
  cityGasMj: CITY_GAS_13A_MJ_PER_M3,
  lpgMj: LPG_MJ_PER_M3,
  ...over,
});

const usage = (over: Partial<Usage> = {}): Usage => ({ hoursPerDay: 8, daysPerMonth: 30, usageMonth: null, ...over });

function ok(r: RowResult) {
  if (!r.ok) throw new Error(`単価が足りない: ${r.missing.join(',')}`);
  return r;
}

const keroseneRow: HeaterRow = { kind: 'kerosene', litersPerHour: 0.25, watt: 10 };
const airconRow: HeaterRow = { kind: 'aircon', watt: 470 };

describe('灯油（約束 1・3・7）', () => {
  it('0.25 L/h・2,563 円/18L・送風 10 W・31 円/kWh・8 時間×30 日 → 1 か月 8,618 円', () => {
    // 2,563 ÷ 18 × 0.25 ＝ 35.597… 円/h、送風 10 ÷ 1000 × 31 ＝ 0.31 円/h、計 35.907… 円/h
    const r = ok(calcRow(keroseneRow, prices(), usage()));
    expect(r.hourly.fuel).toBeCloseTo(35.5972, 3);
    expect(r.hourly.electricity).toBeCloseTo(0.31, 10);
    expect(r.hourly.total).toBeCloseTo(35.9072, 3);
    // × 8 × 30 ＝ 8,617.73… → 丸めは最後に一度だけ
    expect(r.perMonth).toBe(8618);
    // 1 日の額（丸めた 287 円）× 30 ＝ 8,610 円ではない
    expect(r.perMonth).not.toBe(Math.round(r.hourly.total * 8) * 30);
    expect(r.perHour).toBe(36);
    expect(r.perDay).toBe(287);
  });

  it('単位を切り替えると欄の値も換算する（2580 → 143.3 → 2579）', () => {
    const perL = convertKeroseneUnit('2580', '18L', '1L');
    expect(perL).toBe('143.3');
    const back = convertKeroseneUnit(perL, '1L', '18L');
    expect(back).toBe('2579');
    // 換算後の額は切り替え前とほぼ同じ（18 倍にならない）。差は 1L の単価を小数第1位に丸めた分だけ
    // （最大 0.05 円/L × 0.25 L/h × 240 時間 ＝ 3 円）
    const before = ok(calcRow(keroseneRow, prices({ kerosenePerLiter: perLiterFrom18L(2580) }), usage()));
    const after = ok(calcRow(keroseneRow, prices({ kerosenePerLiter: Number(perL) }), usage()));
    expect(Math.abs(after.perMonth - before.perMonth)).toBeLessThanOrEqual(3);
  });

  it('単位の換算：空欄は空欄のまま、同じ単位なら変えない', () => {
    expect(convertKeroseneUnit('', '18L', '1L')).toBe('');
    expect(convertKeroseneUnit('2580', '18L', '18L')).toBe('2580');
  });

  it('18L の値を ÷ 18 して円/L', () => {
    expect(perLiterFrom18L(1800)).toBe(100);
  });

  it('送風の電気代を内訳に分けて出す', () => {
    const r = ok(calcRow(keroseneRow, prices(), usage()));
    expect(r.electricityMonthAfter).toBe(Math.round(0.31 * 240));
    expect(r.fuelMonthAfter).toBe(Math.round(35.5972 * 240));
  });

  it('石油ストーブ（送風 0 W）は電気の単価が空でも計算できる', () => {
    const r = calcRow({ kind: 'kerosene', litersPerHour: 0.25, watt: 0 }, prices({ electricity: null }), usage());
    expect(r.ok).toBe(true);
  });
});

describe('ガス（約束 2）', () => {
  it('2.5 kW・13A・45 MJ/㎥ → 0.2 ㎥/h', () => {
    expect(gasM3PerHour(2.5, 45)).toBeCloseTo(0.2, 10);
  });

  it('LP ガスの発熱量は約 99〜100 MJ/㎥（50.12 MJ/kg ÷ 0.502 ㎥/kg）', () => {
    expect(LPG_MJ_PER_M3).toBeGreaterThanOrEqual(99);
    expect(LPG_MJ_PER_M3).toBeLessThanOrEqual(100);
  });

  it('発熱量を変えると㎥が変わる（地域で標準熱量が違う都市ガス）', () => {
    const r = ok(
      calcRow({ kind: 'gas', gasKw: 2.5, gasType: 'city13A', watt: 0 }, prices({ cityGas: 150, cityGasMj: 41.8605 }), usage()),
    );
    expect(r.m3PerHour).toBeCloseTo(0.215, 3);
  });

  it('ガス 2.5 kW・150 円/㎥・送風 10 W → 1 時間 30.31 円', () => {
    const r = ok(calcRow({ kind: 'gas', gasKw: 2.5, gasType: 'city13A', watt: 10 }, prices({ cityGas: 150 }), usage()));
    expect(r.hourly.total).toBeCloseTo(30.31, 10);
    expect(r.perMonth).toBe(Math.round(30.31 * 240));
  });
});

describe('支援の値引き（約束 4・5）', () => {
  const jan = '2027-01';

  it('2027-01 使用分は電気の行だけ 4.5 円/kWh 引かれ、灯油の燃料代は引かれない', () => {
    const a = ok(calcRow(airconRow, prices(), usage({ usageMonth: jan })));
    // 0.47 × (31 − 4.5) × 240
    expect(a.perMonthAfter).toBe(Math.round(0.47 * 26.5 * 240));
    expect(a.discountMonth).toBe(a.perMonth - a.perMonthAfter);
    expect(a.shien).toBe('discounted');

    const k = ok(calcRow({ ...keroseneRow, watt: 0 }, prices(), usage({ usageMonth: jan })));
    expect(k.discountMonth).toBe(0);
    expect(k.shien).toBe('not-covered');
    expect(k.hourlyAfter.fuel).toBe(k.hourly.fuel);
  });

  it('都市ガスは使用月の値引き（2027-01 は 18 円/㎥）、LP ガスは引かない', () => {
    const city = ok(calcRow({ kind: 'gas', gasKw: 2.5, gasType: 'city13A', watt: 0 }, prices({ cityGas: 150 }), usage({ usageMonth: jan })));
    expect(city.hourlyAfter.fuel).toBeCloseTo(0.2 * 132, 10);
    expect(city.shien).toBe('discounted');
    const lpg = ok(calcRow({ kind: 'gas', gasKw: 2.5, gasType: 'lpg', watt: 0 }, prices({ lpg: 700 }), usage({ usageMonth: jan })));
    expect(lpg.discountMonth).toBe(0);
    expect(lpg.shien).toBe('not-covered');
  });

  it('2027-03 以降の使用月は値引きが出ない', () => {
    const last = SHIEN_PERIODS[SHIEN_PERIODS.length - 1].usageMonth;
    for (const m of [addMonths(last, 1), addMonths(last, 2)]) {
      const r = ok(calcRow(airconRow, prices(), usage({ usageMonth: m })));
      expect(r.discountMonth).toBe(0);
      expect(r.shien).toBe('none-month');
    }
  });
});

describe('使用月のボタン（季節が終わったあと）', () => {
  it('支援の期間中は 2026-12〜2027-03 のボタン、11 月以前に開いたら既定は 2026-12', () => {
    expect(heaterUsageMonthOptions('2026-11-17')).toEqual(['2026-12', '2027-01', '2027-02', '2027-03']);
    expect(heaterDefaultUsageMonth('2026-11-17')).toBe('2026-12');
    expect(heaterDefaultUsageMonth('2027-01-01')).toBe('2027-01');
    expect(heaterDefaultUsageMonth('2027-02-28')).toBe('2027-02');
  });

  it('SHIEN_ENDED_FROM 以降はボタンを出さず、既定は値引きなし', () => {
    // 日付は差し込む（今日の日付に依らない。元日・3/1 に落ちない）
    expect(heaterUsageMonthOptions(SHIEN_ENDED_FROM)).toEqual([]);
    expect(heaterDefaultUsageMonth(SHIEN_ENDED_FROM)).toBeNull();
    expect(heaterDefaultUsageMonth('2027-06-01')).toBeNull();
  });
});

describe('いちばん安い（約束 8・10）', () => {
  it('安い行に印、差額はその行を基準に', () => {
    const rs = [calcRow(airconRow, prices(), usage()), calcRow(keroseneRow, prices(), usage())];
    const rank = rankRows(rs);
    const a = ok(rs[0]);
    const k = ok(rs[1]);
    expect(rank.cheapest).toEqual([0]);
    expect(rank.moreThanCheapest).toEqual([null, k.perMonthAfter - a.perMonthAfter]);
    expect(rank.cheapestSaves).toBe(k.perMonthAfter - a.perMonthAfter);
  });

  it('同額なら両方に印', () => {
    const rs = [calcRow(airconRow, prices(), usage()), calcRow({ kind: 'electric', watt: 470 }, prices(), usage())];
    expect(rankRows(rs).cheapest).toEqual([0, 1]);
    expect(rankRows(rs).cheapestSaves).toBeNull();
  });

  it('行が 1 つなら印は出さない', () => {
    expect(rankRows([calcRow(airconRow, prices(), usage())]).cheapest).toEqual([]);
  });

  it('ガスの単価が空の行は「単価なし」になり、判定から外れる（0 円として扱わない）', () => {
    const gas = calcRow({ kind: 'gas', gasKw: 2.5, gasType: 'city13A', watt: 10 }, prices(), usage());
    expect(gas.ok).toBe(false);
    if (!gas.ok) expect(gas.missing).toEqual(['cityGas']);
    const rs = [gas, calcRow(airconRow, prices(), usage()), calcRow(keroseneRow, prices(), usage())];
    const rank = rankRows(rs);
    expect(rank.cheapest).toEqual([1]);
    expect(rank.moreThanCheapest[0]).toBeNull();
  });

  it('全部の行が空なら印を出さない', () => {
    const p = prices({ electricity: null, kerosenePerLiter: null });
    expect(rankRows([calcRow(airconRow, p, usage()), calcRow(keroseneRow, p, usage())]).cheapest).toEqual([]);
  });

  it('単価の欄：空欄は null、0 は 0', () => {
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('  ')).toBeNull();
    expect(parsePrice('0')).toBe(0);
    expect(parsePrice('abc')).toBeNull();
  });
});

describe('熱 1 kWh あたりの表（約束 11）', () => {
  it('単価のない燃料・COP が空のエアコンの行は出さない', () => {
    const labels = heatUnitTable(prices(), null, null).map((r) => r.label);
    expect(labels).toEqual(['灯油', '電気（ヒーター）']);
  });

  it('式どおり：灯油 3.6 ÷ 36.6 × 円/L、都市ガス 3.6 ÷ 45 × 円/㎥、エアコン ÷ COP', () => {
    const t = heatUnitTable(prices({ kerosenePerLiter: 140, cityGas: 150, lpg: 700 }), null, 3);
    const by = Object.fromEntries(t.map((r) => [r.label, r.yenPerKwhHeat]));
    expect(by['灯油']).toBeCloseTo((3.6 / 36.6) * 140, 10);
    expect(by['都市ガス']).toBeCloseTo(12, 10);
    expect(by['LP ガス']).toBeCloseTo((3.6 / LPG_MJ_PER_M3) * 700, 10);
    expect(by['電気（エアコン）']).toBeCloseTo(31 / 3, 10);
  });
});

describe('エアコンの目安（約束 6）', () => {
  it('暖房能力 ÷ APF', () => {
    expect(airconWattEstimate(2.5, 6.25)).toBeCloseTo(400, 10);
    expect(airconWattEstimate(0, 6)).toBeNull();
    expect(airconWattEstimate(2.5, 0)).toBeNull();
  });
});

describe('単価の持ち方', () => {
  it('灯油の値は FUEL_PRICES.asOf と同じ週（県の表は日付を持たない）', () => {
    expect(KEROSENE_BY_PREF).toHaveLength(47);
    expect(new Set(KEROSENE_BY_PREF.map((p) => p.pref)).size).toBe(47);
    for (const p of KEROSENE_BY_PREF) expect(Object.keys(p).sort()).toEqual(['pref', 'yen18L']);
    // 全国平均は県の値の幅に入っている（週の取り違えの粗い検出）
    const ys = KEROSENE_BY_PREF.map((p) => p.yen18L);
    expect(FUEL_PRICES.kerosene18L).toBeGreaterThanOrEqual(Math.min(...ys));
    expect(FUEL_PRICES.kerosene18L).toBeLessThanOrEqual(Math.max(...ys));
  });

  it('県を選ぶと既定の単価が差し替わる', () => {
    expect(defaultKerosene18L(null)).toBe(FUEL_PRICES.kerosene18L);
    expect(defaultKerosene18L('北海道')).toBe(KEROSENE_BY_PREF.find((p) => p.pref === '北海道')!.yen18L);
    expect(defaultKerosene18L('存在しない県')).toBe(FUEL_PRICES.kerosene18L);
  });

  it('単価の日付を結果の下に出す（約束 9）', () => {
    const notes = priceDateNotes({ pref: null, keroseneIsDefault: true, electricityIsDefault: true });
    expect(notes[0]).toContain('2026年10月26日');
    expect(notes[0]).toContain('激変緩和');
    expect(notes.join('')).toContain('31 円/kWh');
    expect(priceDateNotes({ pref: '北海道', keroseneIsDefault: true, electricityIsDefault: false })[0]).toContain('北海道');
  });

  it('asOf から 60 日を超えたら注意（ビルドは落とさない）', () => {
    expect(isPriceStale('2026-10-26', '2026-12-25')).toBe(false);
    expect(isPriceStale('2026-10-26', '2026-12-26')).toBe(true);
    if (isPriceStale(FUEL_PRICES.asOf, new Date())) {
      console.warn(`[danbohi-hikaku] FUEL_PRICES.asOf（${FUEL_PRICES.asOf}）から60日を超えています。灯油の値を最新の週に更新してください`);
    }
  });

  it('gasoline-dai.ts の更新コメントに灯油も同じ週で更新とある', () => {
    const src = readFileSync(fileURLToPath(new URL('../lib/gasoline-dai.ts', import.meta.url)), 'utf8');
    expect(src).toContain('灯油（`kerosene18L`・`KEROSENE_BY_PREF`）も同じ週で更新');
  });
});

describe('registry とページ', () => {
  const page = readFileSync(fileURLToPath(new URL('../app/danbohi-hikaku/page.tsx', import.meta.url)), 'utf8');

  it('registry に wip で載っている', () => {
    const t = tools.find((x) => x.slug === 'danbohi-hikaku');
    expect(t?.stage).toBe('wip');
    expect(t?.icon).toBe('Fire');
    expect(t?.category).toBe('生活・健康');
  });

  it('robots: robotsFor を書いている', () => {
    expect(page).toContain("robots: robotsFor('danbohi-hikaku')");
  });

  it('FAQ は 5 問', () => {
    expect((page.match(/\bq:\s/g) ?? []).length).toBe(5);
  });
});
