'use client';

import { useEffect, useState } from 'react';
import {
  type AirconMode,
  HEATING_PRESETS,
  MODE_LABEL,
  calcAirconCost,
  defaultModeFor,
  presetsFor,
} from '@/lib/aircon-denkidai';
import {
  OTHER_MONTH,
  defaultUsageMonth,
  discountFor,
  formatYearMonth,
  unitPriceAfterShien,
  usageMonthOptions,
} from '@/lib/denki-gas-shien';
import { trackToolUse } from '@/lib/analytics';

/** 1円未満がある場合は小数1桁、なければ整数で表示 */
const fmtYen = (yen: number) => {
  const rounded1 = Math.round(yen * 10) / 10;
  return Number.isInteger(rounded1)
    ? `${rounded1.toLocaleString('ja-JP')}円`
    : `${rounded1.toLocaleString('ja-JP', { minimumFractionDigits: 1 })}円`;
};

const choiceStyle = (on: boolean) => ({
  padding: '8px 0',
  fontWeight: on ? 700 : 400,
  background: on ? 'var(--accent-soft)' : undefined,
});

const MODES: AirconMode[] = ['cooling', 'heating'];
const MONTH_OPTIONS = usageMonthOptions();

export default function Calculator() {
  // 冷房／暖房と使用月の既定は「開いた日」で決まる。静的書き出しなので、初期描画は日付に依らない既定
  // （冷房・「上記以外の月」）で描き、マウント後に差し替える（ハイドレーションの食い違いを避ける）
  const [mode, setMode] = useState<AirconMode>('cooling');
  const [usageMonth, setUsageMonth] = useState<string>(OTHER_MONTH);
  const [watt, setWatt] = useState('660');
  const [hoursPerDay, setHoursPerDay] = useState('8');
  const [unitPrice, setUnitPrice] = useState('31');
  const [daysPerMonth, setDaysPerMonth] = useState('30');
  const [preset, setPreset] = useState('');

  useEffect(() => {
    const today = new Date();
    setMode(defaultModeFor(today));
    setUsageMonth(defaultUsageMonth(today));
  }, []);

  const base = {
    watt: Number(watt) || 0,
    hoursPerDay: Number(hoursPerDay) || 0,
    daysPerMonth: Number(daysPerMonth) || 0,
  };
  const price = Number(unitPrice) || 0;
  const r = calcAirconCost({ ...base, unitPrice: price });
  const discount = discountFor(usageMonth);
  const after = discount
    ? calcAirconCost({ ...base, unitPrice: unitPriceAfterShien(price, usageMonth) })
    : null;

  const presets = presetsFor(mode);
  const heatingPreset = HEATING_PRESETS.find((p) => String(p.tatami) === preset);

  const onModeChange = (m: AirconMode) => {
    setMode(m);
    // 畳数を選んでいるときは、同じ畳数の運転の種類の値に差し替える
    const p = presetsFor(m).find((t) => String(t.tatami) === preset);
    if (p) setWatt(String(p.watt));
    trackToolUse('aircon-denkidai', `mode-${m}`);
  };

  const onPresetChange = (value: string) => {
    setPreset(value);
    const p = presets.find((t) => String(t.tatami) === value);
    if (p) setWatt(String(p.watt));
    if (p) trackToolUse('aircon-denkidai', 'preset');
  };

  return (
    <div className="card">
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          <div className="field" style={{ marginBottom: 0 }} role="group" aria-label="運転">
            <span className="field-label" style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>運転</span>
            <div className="field-row" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => onModeChange(m)}
                  style={choiceStyle(mode === m)}
                >
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
          </div>
          <label>
            使用月（電気代の支援）
            <select
              value={usageMonth}
              onChange={(e) => {
                setUsageMonth(e.target.value);
                trackToolUse('aircon-denkidai', 'usage-month');
              }}
            >
              {MONTH_OPTIONS.map((m) => {
                const d = discountFor(m);
                return (
                  <option key={m} value={m}>
                    {formatYearMonth(m)}使用分{d ? `（値引き ${d.lowVoltage.toFixed(1)}円/kWh）` : '（値引きなし）'}
                  </option>
                );
              })}
              <option value={OTHER_MONTH}>上記以外の月（値引きなし）</option>
            </select>
          </label>
        </div>
        <label>
          部屋の広さから選ぶ（{MODE_LABEL[mode]}時の目安）
          <select value={preset} onChange={(e) => onPresetChange(e.target.value)}>
            <option value="">選択しない（消費電力を直接入力）</option>
            {presets.map((p) => (
              <option key={p.tatami} value={p.tatami}>
                {p.tatami}畳用（約{p.watt.toLocaleString('ja-JP')}W）
              </option>
            ))}
          </select>
        </label>
        <label>
          消費電力（W）
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={10}
            value={watt}
            onChange={(e) => {
              setWatt(e.target.value);
              setPreset('');
            }}
          />
        </label>
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr' }}>
          <label>
            1日の使用時間（h）
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={24}
              step={1}
              value={hoursPerDay}
              onChange={(e) => setHoursPerDay(e.target.value)}
            />
          </label>
          <label>
            月の使用日数（日）
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={31}
              step={1}
              value={daysPerMonth}
              onChange={(e) => setDaysPerMonth(e.target.value)}
            />
          </label>
        </div>
        <label>
          電気料金単価（円/kWh）
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={1}
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
          />
        </label>
      </div>

      <div className="panel" style={{ marginTop: 18, textAlign: 'center' }}>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
          1ヶ月あたりの電気代（{MODE_LABEL[mode]}）
        </div>
        <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, color: 'var(--accent)' }}>
          約{Math.round(r.perMonth).toLocaleString('ja-JP')}円
        </div>
        {after && discount && (
          <div style={{ fontSize: 'var(--fs-sm)', marginTop: 4 }}>
            補助の値引き後：<strong>約{Math.round(after.perMonth).toLocaleString('ja-JP')}円／月</strong>
            （値引き −{Math.round(r.perMonth - after.perMonth).toLocaleString('ja-JP')}円）
          </div>
        )}
      </div>

      <table>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>1時間あたり</td>
            <td>{fmtYen(r.perHour)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>1日あたり（{base.hoursPerDay}時間）</td>
            <td>{fmtYen(r.perDay)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>1ヶ月あたり（{base.daysPerMonth}日）</td>
            <td>
              <strong>{Math.round(r.perMonth).toLocaleString('ja-JP')}円</strong>
            </td>
          </tr>
          {after && discount && (
            <tr>
              <td style={{ textAlign: 'left' }}>
                補助の値引き後（{formatYearMonth(usageMonth)}使用分・単価 {price}円 − {discount.lowVoltage.toFixed(1)}円）
              </td>
              <td>
                <strong>{Math.round(after.perMonth).toLocaleString('ja-JP')}円</strong>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {mode === 'heating' && (
        <p className="hint">
          暖房は外気温が低いほど消費電力が増え、定格より大きくなることがあります
          {heatingPreset
            ? `（この${heatingPreset.tatami}畳用の機種は最大${heatingPreset.maxWatt.toLocaleString('ja-JP')}W）`
            : ''}
          。
        </p>
      )}

      <div className="note">
        本計算は定格消費電力で動き続けた場合の目安です。実際のエアコンはインバーター制御により消費電力が常に変動し、設定温度・外気温・部屋の断熱性能によって電気代は大きく変わります。補助の値引きは電気（低圧）の使用量 1kWh あたりの額を単価から引いて計算しています。
      </div>
    </div>
  );
}
