'use client';

import { useState } from 'react';
import { SHORT_TENURE_CAP, TAIKI_DAYS, calcShobyoTeate } from '@/lib/shobyo-teate';

const fmtYen = (yen: number) => `${yen.toLocaleString('ja-JP')}円`;

export default function Calculator() {
  const [monthlyIncome, setMonthlyIncome] = useState('300000');
  const [restDays, setRestDays] = useState('30');
  const [under12Months, setUnder12Months] = useState(false);

  const r = calcShobyoTeate({
    monthlyIncome: Number(monthlyIncome) || 0,
    restDays: Number(restDays) || 0,
    under12Months,
  });

  return (
    <div className="card">
      <div style={{ display: 'grid', gap: 14 }}>
        <label>
          直近12ヶ月の平均月収（額面・円）
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={10000}
            value={monthlyIncome}
            onChange={(e) => setMonthlyIncome(e.target.value)}
          />
        </label>
        <label>
          会社を休んだ日数（連続・土日祝を含む暦日）
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={restDays}
            onChange={(e) => setRestDays(e.target.value)}
          />
        </label>
        <label style={{ fontWeight: 400, display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 'var(--fs-sm)' }}>
          <input
            type="checkbox"
            checked={under12Months}
            onChange={(e) => setUnder12Months(e.target.checked)}
            style={{ width: 'auto', marginTop: 3 }}
          />
          <span>
            健康保険の加入期間が12ヶ月未満
            <span style={{ color: 'var(--muted)' }}>
              （標準報酬月額は{fmtYen(SHORT_TENURE_CAP)}が上限になります）
            </span>
          </span>
        </label>
      </div>

      <div
        className="panel" style={{marginTop: 18,
          textAlign: 'center'}}
      >
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
          傷病手当金の支給額（{r.payableDays}日分）
        </div>
        <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, color: 'var(--accent)' }}>
          {fmtYen(r.total)}
        </div>
        {r.payableDays === 0 && (
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
            休業が連続{TAIKI_DAYS}日以内は待期期間のため支給されません（4日目から支給）
          </div>
        )}
      </div>

      <table>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>標準報酬月額</td>
            <td>
              {fmtYen(r.standardMonthly)}
              {r.capped && (
                <span style={{ fontSize: 'var(--fs-xs)', color: '#b45309', display: 'block' }}>
                  加入12ヶ月未満のため上限を適用
                </span>
              )}
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>標準報酬日額（÷30・10円単位）</td>
            <td>{fmtYen(r.standardDaily)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>傷病手当金の日額（×2/3）</td>
            <td>
              <strong>{fmtYen(r.dailyAmount)}</strong>
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>支給対象日数（待期{TAIKI_DAYS}日を除く）</td>
            <td>{r.payableDays}日</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>1ヶ月休んだ場合の目安（日額×30）</td>
            <td>{fmtYen(r.monthlyEstimate)}</td>
          </tr>
        </tbody>
      </table>

      <div className="note">
        本計算は目安です。実際の支給額は支給開始日以前12ヶ月の各月の標準報酬月額の平均から算定され、健康保険組合によっては付加給付が上乗せされる場合があります。正確な金額は加入している健康保険（協会けんぽ・健保組合）にご確認ください。
      </div>
    </div>
  );
}
