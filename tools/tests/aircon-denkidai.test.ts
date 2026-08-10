import { describe, expect, it } from 'vitest';
import { DEFAULT_UNIT_PRICE, TATAMI_PRESETS, calcAirconCost } from '@/lib/aircon-denkidai';

describe('calcAirconCost（電気代の計算）', () => {
  it('デフォルト値: 660W × 8h × 31円/kWh × 30日', () => {
    const r = calcAirconCost({ watt: 660, hoursPerDay: 8, unitPrice: 31, daysPerMonth: 30 });
    // 0.66kW × 31円 = 20.46円/時
    expect(r.perHour).toBeCloseTo(20.46, 5);
    // 20.46 × 8 = 163.68円/日
    expect(r.perDay).toBeCloseTo(163.68, 5);
    // 163.68 × 30 = 4,910.4円/月 → 表示上は約4,910円
    expect(r.perMonth).toBeCloseTo(4_910.4, 5);
    expect(Math.round(r.perMonth)).toBe(4_910);
  });

  it('6畳プリセット440W × 8h × 31円 × 30日 → 月約3,274円', () => {
    const preset = TATAMI_PRESETS.find((p) => p.tatami === 6)!;
    const r = calcAirconCost({
      watt: preset.watt,
      hoursPerDay: 8,
      unitPrice: DEFAULT_UNIT_PRICE,
      daysPerMonth: 30,
    });
    // 0.44 × 31 = 13.64円/時 × 8 = 109.12円/日 × 30 = 3,273.6円/月
    expect(r.perHour).toBeCloseTo(13.64, 5);
    expect(Math.round(r.perMonth)).toBe(3_274);
  });

  it('18畳プリセット1100W → 1時間34.1円', () => {
    const preset = TATAMI_PRESETS.find((p) => p.tatami === 18)!;
    const r = calcAirconCost({
      watt: preset.watt,
      hoursPerDay: 1,
      unitPrice: DEFAULT_UNIT_PRICE,
      daysPerMonth: 30,
    });
    expect(r.perHour).toBeCloseTo(34.1, 5);
    expect(r.perDay).toBeCloseTo(34.1, 5);
  });

  it('プリセットは5種類あり、畳数が大きいほど消費電力が大きい', () => {
    expect(TATAMI_PRESETS).toHaveLength(5);
    for (let i = 1; i < TATAMI_PRESETS.length; i++) {
      expect(TATAMI_PRESETS[i].tatami).toBeGreaterThan(TATAMI_PRESETS[i - 1].tatami);
      expect(TATAMI_PRESETS[i].watt).toBeGreaterThan(TATAMI_PRESETS[i - 1].watt);
    }
  });

  it('0の入力はすべて0円になる', () => {
    const r = calcAirconCost({ watt: 0, hoursPerDay: 8, unitPrice: 31, daysPerMonth: 30 });
    expect(r.perHour).toBe(0);
    expect(r.perDay).toBe(0);
    expect(r.perMonth).toBe(0);

    const r2 = calcAirconCost({ watt: 660, hoursPerDay: 0, unitPrice: 31, daysPerMonth: 30 });
    expect(r2.perHour).toBeCloseTo(20.46, 5); // 1時間あたりは使用時間に依存しない
    expect(r2.perDay).toBe(0);
    expect(r2.perMonth).toBe(0);
  });

  it('負の入力は0として扱う', () => {
    const r = calcAirconCost({ watt: -660, hoursPerDay: -8, unitPrice: -31, daysPerMonth: -30 });
    expect(r.perHour).toBe(0);
    expect(r.perDay).toBe(0);
    expect(r.perMonth).toBe(0);
  });
});
