'use client';

import { useState } from 'react';
import { calcShienkin } from '@/lib/kosodate-shienkin';

const fmt = (n: number) => n.toLocaleString('ja-JP');

export default function Calculator() {
  const [monthly, setMonthly] = useState('300000');
  const [bonus, setBonus] = useState('0');

  const monthlyNum = Number(monthly) || 0;
  const bonusNum = Number(bonus) || 0;
  const results = calcShienkin(monthlyNum, bonusNum);
  const hasBonus = bonusNum > 0;

  return (
    <div className="card">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label>
          月収（額面・円）
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={10000}
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
          />
        </label>
        <label>
          年間賞与（額面・円）
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={100000}
            value={bonus}
            onChange={(e) => setBonus(e.target.value)}
          />
        </label>
      </div>
      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', margin: '8px 0 0' }}>
        ※ 交通費等を含む額面の月収を入力してください（手取りではありません）
      </p>

      <p style={{ margin: '16px 0 4px', fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
        標準報酬月額 {fmt(results[0].standardMonthly)}円として計算
      </p>
      <table>
        <thead>
          <tr>
            <th>年度</th>
            <th>毎月の天引き</th>
            {hasBonus && <th>賞与から（年）</th>}
            <th>年間合計</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.fiscalYear}>
              <td>
                {r.fiscalYear}年度
                <br />
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)' }}>{r.status}</span>
              </td>
              <td>
                <strong style={{ fontSize: 'var(--fs-lg)', color: 'var(--accent)' }}>
                  {fmt(r.monthly)}円
                </strong>
              </td>
              {hasBonus && <td>{fmt(r.bonus)}円</td>}
              <td>{fmt(r.yearly)}円</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
