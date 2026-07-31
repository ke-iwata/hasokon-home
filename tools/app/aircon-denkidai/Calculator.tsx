'use client';

import { useState } from 'react';
import { TATAMI_PRESETS, calcAirconCost } from '@/lib/aircon-denkidai';

/** 1円未満がある場合は小数1桁、なければ整数で表示 */
const fmtYen = (yen: number) => {
  const rounded1 = Math.round(yen * 10) / 10;
  return Number.isInteger(rounded1)
    ? `${rounded1.toLocaleString('ja-JP')}円`
    : `${rounded1.toLocaleString('ja-JP', { minimumFractionDigits: 1 })}円`;
};

export default function Calculator() {
  const [watt, setWatt] = useState('660');
  const [hoursPerDay, setHoursPerDay] = useState('8');
  const [unitPrice, setUnitPrice] = useState('31');
  const [daysPerMonth, setDaysPerMonth] = useState('30');
  const [preset, setPreset] = useState('');

  const r = calcAirconCost({
    watt: Number(watt) || 0,
    hoursPerDay: Number(hoursPerDay) || 0,
    unitPrice: Number(unitPrice) || 0,
    daysPerMonth: Number(daysPerMonth) || 0,
  });

  const onPresetChange = (value: string) => {
    setPreset(value);
    const p = TATAMI_PRESETS.find((t) => String(t.tatami) === value);
    if (p) setWatt(String(p.watt));
  };

  return (
    <div className="card">
      <div style={{ display: 'grid', gap: 14 }}>
        <label>
          部屋の広さから選ぶ（冷房時の目安）
          <select value={preset} onChange={(e) => onPresetChange(e.target.value)}>
            <option value="">選択しない（消費電力を直接入力）</option>
            {TATAMI_PRESETS.map((p) => (
              <option key={p.tatami} value={p.tatami}>
                {p.tatami}畳用（約{p.watt}W）
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

      <div
        style={{
          marginTop: 18,
          padding: '14px 16px',
          background: '#eef2ff',
          borderRadius: 10,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>1ヶ月あたりの電気代</div>
        <div style={{ fontSize: '1.7rem', fontWeight: 800, color: 'var(--brand)' }}>
          約{Math.round(r.perMonth).toLocaleString('ja-JP')}円
        </div>
      </div>

      <table>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>1時間あたり</td>
            <td>{fmtYen(r.perHour)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>1日あたり（{Number(hoursPerDay) || 0}時間）</td>
            <td>{fmtYen(r.perDay)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>
              1ヶ月あたり（{Number(daysPerMonth) || 0}日）
            </td>
            <td>
              <strong>{Math.round(r.perMonth).toLocaleString('ja-JP')}円</strong>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="note">
        本計算は定格消費電力で動き続けた場合の目安です。実際のエアコンはインバーター制御により消費電力が常に変動し、
        設定温度・外気温・部屋の断熱性能によって電気代は大きく変わります。
      </div>
    </div>
  );
}
