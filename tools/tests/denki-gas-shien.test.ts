import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  OTHER_MONTH,
  SHIEN_ARCHIVED_FROM,
  SHIEN_ENDED_FROM,
  SHIEN_PERIODS,
  addMonths,
  billingMonthFor,
  billingMonthOptions,
  defaultBillingMonth,
  defaultUsageMonth,
  discountFor,
  electricityDiscountYen,
  shienPeriodLabel,
  shienPhase,
  toYearMonth,
  unitPriceAfterShien,
  usageMonthForBilling,
  usageMonthOptions,
} from '@/lib/denki-gas-shien';
import {
  HEATING_PRESETS,
  SETTING_TEMP_SAVING,
  TATAMI_PRESETS,
  calcAirconCost,
  defaultModeFor,
  presetsFor,
  settingTempSavingYen,
} from '@/lib/aircon-denkidai';

// 仕様: docs/features/aircon-denkidai-fuyu-hojo.md
// 日付はすべて差し込む（今日の日付で分岐するテストにしない。元日・3月に落ちる検査を増やさないため）

describe('SHIEN_PERIODS（資源エネルギー庁「電気・ガス料金支援」2026-11-13 確認）', () => {
  it('2026-12 使用分は低圧 1.0円/kWh・高圧 0.5円・都市ガス 4.0円/㎥', () => {
    expect(SHIEN_PERIODS[0]).toEqual({
      usageMonth: '2026-12',
      lowVoltageYenPerKwh: 1.0,
      highVoltageYenPerKwh: 0.5,
      cityGasYenPerM3: 4.0,
    });
  });

  it('2027-01・02 使用分は低圧 4.5円/kWh・高圧 2.3円・都市ガス 18.0円/㎥', () => {
    for (const m of ['2027-01', '2027-02']) {
      expect(SHIEN_PERIODS.find((p) => p.usageMonth === m)).toEqual({
        usageMonth: m,
        lowVoltageYenPerKwh: 4.5,
        highVoltageYenPerKwh: 2.3,
        cityGasYenPerM3: 18.0,
      });
    }
  });

  it('使用月は昇順に、ひと月ずつ並ぶ（延長したら末尾に1行足す）', () => {
    for (let i = 1; i < SHIEN_PERIODS.length; i++) {
      expect(SHIEN_PERIODS[i].usageMonth).toBe(addMonths(SHIEN_PERIODS[i - 1].usageMonth, 1));
    }
  });

  it('終了の境目は最後の使用月の翌月1日', () => {
    const last = SHIEN_PERIODS[SHIEN_PERIODS.length - 1].usageMonth;
    expect(SHIEN_ENDED_FROM).toBe(`${addMonths(last, 1)}-01`);
    expect(SHIEN_ARCHIVED_FROM > SHIEN_ENDED_FROM).toBe(true);
  });
});

describe('discountFor（使用月の値引き単価）', () => {
  it('2026-12 は 1.0円、2027-01 は 4.5円', () => {
    expect(discountFor('2026-12')).toEqual({ lowVoltage: 1.0, cityGas: 4.0 });
    expect(discountFor('2027-01')).toEqual({ lowVoltage: 4.5, cityGas: 18.0 });
  });

  it('期間の外（2026-11・2027-03・その他）は null', () => {
    expect(discountFor('2026-11')).toBeNull();
    expect(discountFor('2027-03')).toBeNull();
    expect(discountFor(OTHER_MONTH)).toBeNull();
  });
});

describe('値引き後のエアコン電気代（仕様書「確かめること」）', () => {
  const base = { watt: 660, hoursPerDay: 8, daysPerMonth: 30 };

  it('2026-12・単価31円・660W×8h×30日 → 単価30円で計算した額', () => {
    expect(unitPriceAfterShien(31, '2026-12')).toBe(30);
    const r = calcAirconCost({ ...base, unitPrice: unitPriceAfterShien(31, '2026-12') });
    // 0.66 × 8 × 30 × 30 = 4,752円
    expect(r.perMonth).toBeCloseTo(4_752, 6);
  });

  it('2027-01 は値引き 4.5円 → 単価 26.5円', () => {
    expect(unitPriceAfterShien(31, '2027-01')).toBe(26.5);
    const r = calcAirconCost({ ...base, unitPrice: 26.5 });
    expect(Math.round(r.perMonth)).toBe(4_198); // 0.66 × 240 × 26.5 = 4,197.6
  });

  it('2027-03 は値引きなし（入力単価のまま）', () => {
    expect(unitPriceAfterShien(31, '2027-03')).toBe(31);
  });

  it('入力単価が値引きより小さくても 0 未満にしない', () => {
    expect(unitPriceAfterShien(3, '2027-01')).toBe(0);
  });
});

describe('electricityDiscountYen（検針票の使用量からの値引き額）', () => {
  it('260kWh・2027-01 使用分 → 1,170円（大手電力の発表と一致）', () => {
    expect(electricityDiscountYen(260, '2027-01')).toBe(1_170);
  });

  it('260kWh・2026-12 使用分 → 260円', () => {
    expect(electricityDiscountYen(260, '2026-12')).toBe(260);
  });

  it('端数の出る使用量でも二進小数の誤差を出さない（333kWh × 4.5円 = 1,498.5円）', () => {
    expect(electricityDiscountYen(333, '2027-02')).toBe(1_498.5);
  });

  it('期間の外・負の使用量は 0円', () => {
    expect(electricityDiscountYen(260, '2027-03')).toBe(0);
    expect(electricityDiscountYen(-10, '2027-01')).toBe(0);
  });
});

describe('使用月と請求月（請求書ではひと月ずれる）', () => {
  it('2026-12 使用分は 2027-01 の請求、2027-02 使用分は 2027-03 の請求', () => {
    expect(billingMonthFor('2026-12')).toBe('2027-01');
    expect(billingMonthFor('2027-02')).toBe('2027-03');
  });

  it('請求月から使用月に戻せる（年またぎも）', () => {
    expect(usageMonthForBilling('2027-01')).toBe('2026-12');
    for (const m of usageMonthOptions()) expect(usageMonthForBilling(billingMonthFor(m))).toBe(m);
  });

  it('使用月の選択肢は期間の前後1か月まで（2026-11〜2027-03）', () => {
    expect(usageMonthOptions()).toEqual(['2026-11', '2026-12', '2027-01', '2027-02', '2027-03']);
    expect(billingMonthOptions()).toEqual(['2026-12', '2027-01', '2027-02', '2027-03', '2027-04']);
  });

  it('既定の月は開いた日の月。選択肢に無ければ「上記以外」', () => {
    expect(defaultUsageMonth('2027-01-20')).toBe('2027-01');
    expect(defaultUsageMonth('2026-08-01')).toBe(OTHER_MONTH);
    expect(defaultBillingMonth('2027-04-03')).toBe('2027-04');
    expect(defaultBillingMonth('2027-06-01')).toBe(OTHER_MONTH);
  });

  it('Date はその環境の現地時刻の月で読む', () => {
    expect(toYearMonth(new Date(2026, 11, 31, 23, 59))).toBe('2026-12');
  });
});

describe('shienPhase（開いた日の出し分け）', () => {
  it('〜2027-02-28 は期間中', () => {
    expect(shienPhase('2026-11-13')).toBe('active');
    expect(shienPhase('2027-02-28')).toBe('active');
  });

  it('2027-03-01〜04-30 は「終了」の言い回し', () => {
    expect(shienPhase('2027-03-01')).toBe('ended');
    expect(shienPhase('2027-03-15')).toBe('ended');
    expect(shienPhase('2027-04-30')).toBe('ended');
  });

  it('2027-05-01〜 は節を畳む', () => {
    expect(shienPhase('2027-05-01')).toBe('archived');
    expect(shienPhase(new Date(2027, 4, 1))).toBe('archived');
  });

  it('期間を書いた言い回しは「2026年12月〜2027年2月使用分」', () => {
    expect(shienPeriodLabel()).toBe('2026年12月〜2027年2月使用分');
  });
});

describe('冷房／暖房', () => {
  it('既定は 11〜3月が暖房、4〜10月が冷房', () => {
    expect(defaultModeFor(new Date(2026, 10, 1))).toBe('heating');
    expect(defaultModeFor(new Date(2027, 0, 15))).toBe('heating');
    expect(defaultModeFor(new Date(2027, 2, 31))).toBe('heating');
    expect(defaultModeFor(new Date(2027, 3, 1))).toBe('cooling');
    expect(defaultModeFor(new Date(2026, 9, 31))).toBe('cooling');
  });

  it('暖房のプリセットはダイキン Eシリーズ 2026年モデルの暖房の定格消費電力', () => {
    expect(HEATING_PRESETS.map((p) => [p.tatami, p.watt])).toEqual([
      [6, 470],
      [8, 635],
      [10, 890],
      [14, 1410],
      [18, 1880],
    ]);
    for (const p of HEATING_PRESETS) expect(p.maxWatt).toBeGreaterThan(p.watt);
  });

  it('冷房と暖房で同じ畳数がそろい、presetsFor で切り替わる', () => {
    expect(HEATING_PRESETS.map((p) => p.tatami)).toEqual(TATAMI_PRESETS.map((p) => p.tatami));
    expect(presetsFor('heating')).toBe(HEATING_PRESETS);
    expect(presetsFor('cooling')).toBe(TATAMI_PRESETS);
  });

  it('6畳の暖房 470W × 31円 → 1時間 14.57円', () => {
    const r = calcAirconCost({ watt: 470, hoursPerDay: 1, unitPrice: 31, daysPerMonth: 1 });
    expect(r.perHour).toBeCloseTo(14.57, 6);
  });

  it('設定温度1℃の省エネ効果（家庭の省エネ徹底ガイド）は冷房と暖房で書き分ける', () => {
    expect(SETTING_TEMP_SAVING.cooling.kwhPerYear).toBe(30.24);
    expect(SETTING_TEMP_SAVING.heating.kwhPerYear).toBe(53.08);
    expect(settingTempSavingYen('cooling', 31)).toBe(937);
    expect(settingTempSavingYen('heating', 31)).toBe(1_645);
  });
});

describe('ビルドで固まる文に「現在」「今月」「いま」を書かない', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const page = readFileSync(`${root}app/aircon-denkidai/page.tsx`, 'utf-8');
  const section = readFileSync(`${root}app/aircon-denkidai/ShienSection.tsx`, 'utf-8');

  it('page.tsx と支援の節のソースに、期日を前提にした語が無い', () => {
    for (const src of [page, section]) {
      // コメント行は除く（「現在」「今月」と書かない、という注意書きがあるため）
      const code = src
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join('\n');
      expect(code).not.toMatch(/現在|今月|いま[、の]|今年/);
    }
  });

  it('「1度で約10%」の出典の無い文が残っていない', () => {
    expect(page).not.toMatch(/約10%/);
  });

  it('支援の節は useState の初期値に日付を使わない（ハイドレーションの食い違いを避ける）', () => {
    for (const src of [section, readFileSync(`${root}app/aircon-denkidai/Calculator.tsx`, 'utf-8')]) {
      expect(src).not.toMatch(/useState[^;]*new Date\(/);
      expect(src).toMatch(/useEffect\(/);
    }
  });
});
