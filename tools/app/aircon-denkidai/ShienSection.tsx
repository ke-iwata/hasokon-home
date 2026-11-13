'use client';

import { useEffect, useState } from 'react';
import {
  OTHER_MONTH,
  SHIEN_CHECKED_ON,
  SHIEN_PERIODS,
  SHIEN_SOURCE_URL,
  type ShienPhase,
  addMonths,
  billingMonthFor,
  billingMonthOptions,
  defaultBillingMonth,
  defaultUsageMonth,
  electricityDiscountYen,
  formatYearMonth,
  shienPeriodLabel,
  shienPhase,
  usageMonthForBilling,
  usageMonthOptions,
} from '@/lib/denki-gas-shien';
import { trackToolUse } from '@/lib/analytics';

type View = 'usage' | 'billing';

const choiceStyle = (on: boolean) => ({
  padding: '8px 0',
  fontWeight: on ? 700 : 400,
  background: on ? 'var(--accent-soft)' : undefined,
});

const yen = (n: number) => `${n.toLocaleString('ja-JP', { maximumFractionDigits: 1 })}円`;

/**
 * 電気・ガス料金支援の節（表と「請求でいくら引かれるか」の計算）。
 * 文はビルドで固まるので、期間を書いた言い回しだけにする（「現在」「今月」と書かない）。
 * 段階（期間中・終了後・畳む）と月の既定は、開いた日でマウント後に決める
 */
export default function ShienSection() {
  // 初期描画は日付に依らない（期間中の言い回し・「上記以外の月」）。マウント後に開いた日で差し替える
  const [phase, setPhase] = useState<ShienPhase>('active');
  const [view, setView] = useState<View>('usage');
  const [usageMonth, setUsageMonth] = useState<string>(OTHER_MONTH);
  const [billingMonth, setBillingMonth] = useState<string>(OTHER_MONTH);
  const [kwh, setKwh] = useState('260');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const today = new Date();
    setPhase(shienPhase(today));
    setUsageMonth(defaultUsageMonth(today));
    setBillingMonth(defaultBillingMonth(today));
    // スマホでは折りたたみ、広い画面では開いておく
    setOpen(window.matchMedia('(min-width: 720px)').matches);
  }, []);

  if (phase === 'archived') return null;

  const targetUsage = view === 'usage' ? usageMonth : billingMonth === OTHER_MONTH ? OTHER_MONTH : usageMonthForBilling(billingMonth);
  const amount = electricityDiscountYen(Number(kwh) || 0, targetUsage);
  const period = SHIEN_PERIODS.find((p) => p.usageMonth === targetUsage);
  const lastUsage = SHIEN_PERIODS[SHIEN_PERIODS.length - 1].usageMonth;

  return (
    <section>
      <h2>電気・ガス料金支援の値引き（{shienPeriodLabel()}）</h2>
      {phase === 'ended' ? (
        <p>
          政府の電気・ガス料金支援は<strong>{formatYearMonth(lastUsage)}使用分で終了</strong>しました。
          最後の使用月の値引きは、検針日によって{formatYearMonth(billingMonthFor(lastUsage))}
          〜{formatYearMonth(billingMonthFor(billingMonthFor(lastUsage)))}の請求書まで載ることがあります。
        </p>
      ) : (
        <p>
          経済産業省 資源エネルギー庁の「電気・ガス料金支援」で、{shienPeriodLabel()}の電気・都市ガスの料金が、使用量に応じて値引きされます。
          <strong>申請は不要</strong>で、電力会社・ガス会社が毎月の料金から自動で差し引きます。
        </p>
      )}

      <table>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>使用月</th>
            <th>電気 低圧（家庭）</th>
            <th>電気 高圧（企業）</th>
            <th>都市ガス</th>
          </tr>
        </thead>
        <tbody>
          {SHIEN_PERIODS.map((p) => (
            <tr key={p.usageMonth}>
              <td style={{ textAlign: 'left' }}>{formatYearMonth(p.usageMonth)}使用分</td>
              <td>{p.lowVoltageYenPerKwh.toFixed(1)}円/kWh</td>
              <td>{p.highVoltageYenPerKwh.toFixed(1)}円/kWh</td>
              <td>{p.cityGasYenPerM3.toFixed(1)}円/㎥</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        「12月使用分」は、原則として12月中の検針日から1月中の検針日までの使用分です（請求書では翌月に載ります）。
        {formatYearMonth(addMonths(lastUsage, 1))}使用分は、この公表（{shienPeriodLabel()}）に入っていません。LPガス（プロパン）は対象外です。
        出典：
        <a href={SHIEN_SOURCE_URL} target="_blank" rel="nofollow noopener noreferrer">
          資源エネルギー庁「電気・ガス料金支援」
        </a>
        （{SHIEN_CHECKED_ON}確認）
      </p>

      <details
        className="card"
        open={open}
        onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>
          検針票の使用量（kWh）から、電気の値引き額を計算する
        </summary>
        <div style={{ display: 'grid', gap: 14, marginTop: 12 }}>
          <label>
            電気の使用量（kWh・検針票の「ご使用量」）
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={kwh}
              onChange={(e) => setKwh(e.target.value)}
              onBlur={() => trackToolUse('aircon-denkidai', 'shien-bill')}
            />
          </label>
          <div className="field" style={{ marginBottom: 0 }}>
            <span className="field-label" style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>月の見方</span>
            <div className="field-row" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button type="button" aria-pressed={view === 'usage'} onClick={() => setView('usage')} style={choiceStyle(view === 'usage')}>
                使用月で見る
              </button>
              <button type="button" aria-pressed={view === 'billing'} onClick={() => setView('billing')} style={choiceStyle(view === 'billing')}>
                請求月で見る
              </button>
            </div>
          </div>
          {view === 'usage' ? (
            <label>
              使用月
              <select value={usageMonth} onChange={(e) => setUsageMonth(e.target.value)}>
                {usageMonthOptions().map((m) => (
                  <option key={m} value={m}>
                    {formatYearMonth(m)}使用分
                  </option>
                ))}
                <option value={OTHER_MONTH}>上記以外の月</option>
              </select>
            </label>
          ) : (
            <label>
              請求（検針票）の月
              <select value={billingMonth} onChange={(e) => setBillingMonth(e.target.value)}>
                {billingMonthOptions().map((m) => (
                  <option key={m} value={m}>
                    {formatYearMonth(m)}の請求
                  </option>
                ))}
                <option value={OTHER_MONTH}>上記以外の月</option>
              </select>
            </label>
          )}
        </div>

        <div className="panel" style={{ textAlign: 'center' }}>
          {period ? (
            <>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>電気の値引き額</div>
              <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, color: 'var(--accent)' }}>{yen(amount)}</div>
              <div style={{ fontSize: 'var(--fs-sm)' }}>
                {(Number(kwh) || 0).toLocaleString('ja-JP')}kWh × {period.lowVoltageYenPerKwh.toFixed(1)}円 ＝ {yen(amount)}
              </div>
              <div style={{ fontSize: 'var(--fs-sm)', marginTop: 6 }}>
                {view === 'usage'
                  ? `この値引きが載る請求書は、原則 ${formatYearMonth(billingMonthFor(targetUsage))}分です。`
                  : `${formatYearMonth(billingMonth)}の請求に載るのは、原則 ${formatYearMonth(targetUsage)}使用分の値引きです。`}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 'var(--fs-sm)' }}>
              {view === 'usage' ? 'この使用月' : 'この請求月'}には、電気・ガス料金支援の値引きはありません（対象は{shienPeriodLabel()}）。
            </div>
          )}
        </div>
        {view === 'billing' && (
          <p className="hint">
            検針日によって、使用月と請求月が1か月ずれることがあります。正確には検針票の「ご使用期間」を確かめてください。
          </p>
        )}
        <p className="hint">
          値引きを受けるための申請は不要です。値引きを理由に個人情報や手数料を求める電話・メールは詐欺の可能性があるので、応じないでください。
          都市ガスは、使用量（㎥）に上の表の単価を掛けると値引き額の目安になります。
        </p>
      </details>
    </section>
  );
}
