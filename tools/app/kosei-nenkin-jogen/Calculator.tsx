'use client';

import { useEffect, useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import {
  accumulate,
  AFFECTED_FROM,
  breakEvenYears,
  DEFAULT_MONTHS,
  END_AGE,
  formatMonthJa,
  INCOME_TAX_RATES,
  isAffected,
  monthsUntilEndAge,
  netCostWithTax,
  premiumDiff,
  type StagePoint,
} from '@/lib/kosei-nenkin-jogen';

const yen = (n: number) => `${Math.round(n).toLocaleString('ja-JP')}円`;
const man = (n: number) => `${(n / 10_000).toLocaleString('ja-JP')}万円`;

const SALARY_MIN = 500_000;
const SALARY_MAX = 1_200_000;
const SALARY_STEP = 5_000;

const toToday = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * 厚生年金 上限引き上げの計算UI。ロジックは lib/kosei-nenkin-jogen.ts の純関数。
 *
 * 必須は月給の1つ。年齢・所得税率は `<details>` に畳む。
 *
 * @param buildDate ビルド時刻（ISO文字列）。年齢から月数を出すときの「今日」は、サーバ描画と
 *   ハイドレーション直後はこの固定値、マウント後に画面を開いた日へ差し替える（shoyo-tedori と同じ）。
 */
export default function Calculator({ buildDate }: { buildDate: string }) {
  const [salaryText, setSalaryText] = useState('750000');
  const [ageText, setAgeText] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [today, setToday] = useState(() => toToday(new Date(buildDate)));

  useEffect(() => {
    setToday(toToday(new Date()));
  }, []);

  const salary = Math.max(0, Number(salaryText) || 0);
  const sliderValue = Math.min(SALARY_MAX, Math.max(SALARY_MIN, salary));
  const age = ageText === '' ? null : Number(ageText);
  const validAge = age !== null && Number.isFinite(age) && age >= 15 && age < 100;

  return (
    <div className="card">
      <div style={{ display: 'grid', gap: 14 }}>
        <label>
          月給（報酬月額・円）
          <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
            基本給に残業代・通勤手当などの手当を足した総支給額。賞与は含めません
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={SALARY_STEP}
            value={salaryText}
            onChange={(e) => setSalaryText(e.target.value)}
            onBlur={() => trackToolUse('kosei-nenkin-jogen', 'salary')}
          />
          <input
            type="range"
            aria-label="月給のスライダー"
            min={SALARY_MIN}
            max={SALARY_MAX}
            step={SALARY_STEP}
            value={sliderValue}
            onChange={(e) => setSalaryText(e.target.value)}
            onPointerUp={() => trackToolUse('kosei-nenkin-jogen', 'salary')}
            style={{ width: '100%', marginTop: 8 }}
          />
        </label>
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)', fontWeight: 600 }}>
            詳しく（年齢・所得税率）
          </summary>
          <label style={{ display: 'block', marginTop: 10 }}>
            いまの年齢
            <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
              年金の増加を「{END_AGE}歳まで払った場合」で出します。空欄なら10年続いた場合で出します
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={15}
              max={99}
              value={ageText}
              onChange={(e) => setAgeText(e.target.value)}
            />
          </label>
          <label style={{ display: 'block', marginTop: 10 }}>
            所得税率
            <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
              保険料は社会保険料控除になるので、所得税と住民税（10%）の分だけ実質の負担が軽くなります
            </span>
            <select value={taxRate} onChange={(e) => setTaxRate(e.target.value)}>
              <option value="">選ばない</option>
              {INCOME_TAX_RATES.map((r) => (
                <option key={r} value={String(r)}>
                  {Math.round(r * 100)}%
                </option>
              ))}
            </select>
          </label>
        </details>
      </div>

      {salary <= 0 ? (
        <div className="note" style={{ marginTop: 18 }}>月給を入力すると結果が出ます。</div>
      ) : (
        <Results
          salary={salary}
          months={validAge ? monthsUntilEndAge(age as number, today) : DEFAULT_MONTHS}
          ageGiven={validAge}
          taxRate={taxRate === '' ? null : Number(taxRate)}
        />
      )}
    </div>
  );
}

function Results({
  salary,
  months,
  ageGiven,
  taxRate,
}: {
  salary: number;
  months: number;
  ageGiven: boolean;
  taxRate: number | null;
}) {
  const points = premiumDiff(salary);
  const raises = points.filter((p, i) => i > 0 && p.diff !== points[i - 1].diff);

  if (!isAffected(salary)) {
    return (
      <div className="panel" style={{ marginTop: 18 }}>
        <div className="metric">
          <span className="value" style={{ fontSize: '1.4rem' }}>
            今回の改正で変わりません
          </span>
        </div>
        <p className="hint" style={{ marginTop: 8, lineHeight: 1.7 }}>
          上限の引き上げで保険料が増えるのは、報酬月額が{man(AFFECTED_FROM)}以上の方です。月給 {yen(salary)}{' '}
          の標準報酬月額は {yen(points[0].standard)}（{points[0].grade}等級）のままで、本人負担は月{' '}
          {yen(points[0].employee)} です（料率や月給が変わらない場合）。
        </p>
      </div>
    );
  }

  const last = points[points.length - 1];
  const stopped = points.findIndex((p) => p.standard === last.standard);
  const acc = accumulate(salary, months);
  const years = breakEvenYears(acc.premiumTotal, acc.pensionPerYear);

  return (
    <>
      <div className="panel" style={{ marginTop: 18 }}>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
          月給 {yen(salary)} の、厚生年金保険料（本人負担）の増加
        </div>
        <ul style={{ margin: '8px 0 0', paddingLeft: '1.2em', lineHeight: 1.8 }}>
          {raises.map((p) => (
            <li key={p.effectiveFrom}>
              <strong>{formatMonthJa(p.deductedFrom as string)}の給与から</strong> 月{' '}
              <strong style={{ fontSize: '1.2rem' }}>+{yen(p.diff)}</strong>
            </li>
          ))}
        </ul>
        <p className="hint" style={{ marginTop: 8 }}>
          いまの月 {yen(points[0].employee)} → 最大で月 {yen(last.employee)}。会社負担も同じ額だけ増えます。
        </p>
      </div>

      <h3 style={{ marginTop: 22 }}>等級の移り変わり</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ whiteSpace: 'nowrap' }}>
          <thead>
            <tr>
              <th>時期</th>
              <th>標準報酬月額</th>
              <th>本人負担</th>
              <th>増加</th>
              {taxRate !== null && <th>実質の増加</th>}
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.effectiveFrom ?? 'current'}>
                <th scope="row" style={{ textAlign: 'left' }}>
                  {stageLabel(p)}
                </th>
                <td>
                  {man(p.standard)}（{p.grade}等級）
                </td>
                <td>{yen(p.employee)}</td>
                <td>{p.diff === 0 ? '—' : `+${yen(p.diff)}`}</td>
                {taxRate !== null && (
                  <td>{p.diff === 0 ? '—' : `+${yen(netCostWithTax(p.diff, taxRate))}`}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint" style={{ marginTop: 8, lineHeight: 1.7 }}>
        {stopped < points.length - 1
          ? `この月給では${stageLabel(points[stopped])}の${points[stopped].grade}等級で止まり、その後の引き上げでは増えません。`
          : `この月給は最後の段階（${last.grade}等級・${man(last.cap)}）まで上限に当たるので、3回とも増えます。`}
        {taxRate !== null &&
          `「実質の増加」は、社会保険料控除で所得税（${Math.round(taxRate * 100)}%）と住民税（10%）が軽くなる分を引いた目安です。`}
      </p>

      <h3 style={{ marginTop: 22 }}>将来の年金への反映</h3>
      {months === 0 ? (
        <p className="hint" style={{ lineHeight: 1.7 }}>
          2027年9月から{END_AGE}歳になるまでの期間が無いので、{END_AGE}
          歳までで数えると年金の増加は出ません。{END_AGE}
          歳以降も厚生年金に加入して働く場合は、その期間の分だけ年金が増えます。
        </p>
      ) : (
        <>
          <dl className="kv">
            <div>
              <dt>数えた期間</dt>
              <dd>
                2027年9月から{months}か月
                {ageGiven ? `（${END_AGE}歳まで）` : '（10年続いた場合）'}
              </dd>
            </div>
            <div>
              <dt>保険料の増加の累計（本人負担）</dt>
              <dd>{yen(acc.premiumTotal)}</dd>
            </div>
            <div>
              <dt>老齢厚生年金の増加（目安）</dt>
              <dd>
                年 {yen(acc.pensionPerYear)}（月 {yen(acc.pensionPerMonth)}）
              </dd>
            </div>
          </dl>
          {years !== null && (
            <p className="hint" style={{ marginTop: 8, lineHeight: 1.7 }}>
              保険料の増加の累計は、年金の増加年額の約{years.toFixed(1)}年分にあたります（累計 ÷ 年額）。
              年金額は報酬比例部分（上限の差 × 5.481/1000 × 月数）だけの目安で、賃金による再評価やマクロ経済スライドは入れていません。
            </p>
          )}
        </>
      )}
    </>
  );
}

function stageLabel(p: StagePoint): string {
  if (p.effectiveFrom === null) return '〜2027年8月';
  return `${formatMonthJa(p.effectiveFrom.slice(0, 7))}〜`;
}
