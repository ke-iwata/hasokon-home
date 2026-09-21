'use client';

import { useEffect, useState } from 'react';
import { formatDate, formatJa, parseDate, addDays } from '@/lib/date-parts';
import { parseHandoffQuery } from '@/lib/shussan-yoteibi';
import { trackToolUse } from '@/lib/analytics';
import {
  AFTER_DAYS,
  BEFORE_DAYS_MULTIPLE,
  BEFORE_DAYS_SINGLE,
  SHORT_TENURE_CAP,
  calcShussanTeate,
} from '@/lib/shussan-teate';

const yen = (n: number) => `${Math.round(n).toLocaleString('ja-JP')}円`;

/**
 * 出産手当金・出産育児一時金の計算UI。
 *
 * **スマホで入力が7つ縦に並ぶと結果が1画面に入らない**ので、必須の4つを上に置き、
 * 任意の3つは `<details>`（詳しい条件）に畳む（iryohi-kojo / furusato-nozei と同じ型）。
 * ロジックは持たせない（すべて lib/shussan-teate.ts の純関数）。
 */
export default function Calculator() {
  const [dueDate, setDueDate] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [fetusCount, setFetusCount] = useState('1');
  const [monthlyIncome, setMonthlyIncome] = useState('300000');
  const [under12Months, setUnder12Months] = useState(false);
  const [salary, setSalary] = useState('');
  const [obstetricCompensation, setObstetricCompensation] = useState(true);

  /**
   * 出産予定日 計算機からの引き継ぎ（`?due=YYYY-MM-DD&babies=1`）を初期値として読む。
   *
   * **`useSearchParams` は使わない。** 静的エクスポートでは Suspense 境界とページの
   * CSR 化を招くため、マウント後に `window.location.search` を読む。
   * 不正な値は `parseHandoffQuery()` が捨てるので、その場合は既定値のまま動く
   */
  useEffect(() => {
    const handoff = parseHandoffQuery(window.location.search);
    if (handoff.dueDate) setDueDate(formatDate(handoff.dueDate));
    if (handoff.fetusCount) setFetusCount(String(Math.min(3, handoff.fetusCount)));
  }, []);

  const due = parseDate(dueDate);
  const birth = parseDate(birthDate);
  const r = due
    ? calcShussanTeate({
        dueDate: due,
        birthDate: birth ?? undefined,
        fetusCount: Number(fetusCount) || 1,
        monthlyIncome: Number(monthlyIncome) || 0,
        under12Months,
        salaryDuringLeave: Number(salary) || 0,
        obstetricCompensation,
      })
    : null;

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="shussan-due">出産予定日</label>
        <input
          id="shussan-due"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          onBlur={() => trackToolUse('shussan-teate', 'due-date')}
        />
      </div>

      <div className="field">
        <label htmlFor="shussan-birth">実際の出産日（わかれば）</label>
        <input
          id="shussan-birth"
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
        />
        <p className="hint">
          空欄なら予定日どおりに生まれたものとして計算します。
          <strong>出産後に入れ直すと確定額が出ます。</strong>
        </p>
      </div>

      <div className="field">
        <label htmlFor="shussan-fetus">赤ちゃんの人数</label>
        <select
          id="shussan-fetus"
          value={fetusCount}
          onChange={(e) => setFetusCount(e.target.value)}
        >
          <option value="1">1人（単胎）</option>
          <option value="2">2人（双子）</option>
          <option value="3">3人（三つ子）</option>
        </select>
        <p className="hint">
          多胎妊娠は産前が{BEFORE_DAYS_SINGLE}日から{BEFORE_DAYS_MULTIPLE}
          日に延び、出産育児一時金は人数分になります。
        </p>
      </div>

      <div className="field">
        <label htmlFor="shussan-income">月給（額面・円）</label>
        <input
          id="shussan-income"
          type="number"
          inputMode="numeric"
          min={0}
          step={10000}
          value={monthlyIncome}
          onChange={(e) => setMonthlyIncome(e.target.value)}
          onBlur={() => trackToolUse('shussan-teate', 'income')}
        />
        <p className="hint">
          産休に入る前12か月のおおよその平均。標準報酬月額の等級に丸めて計算します。
        </p>
      </div>

      <details className="field">
        <summary style={{ cursor: 'pointer' }}>詳しい条件（任意）</summary>

        <label
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
            fontWeight: 400,
            marginTop: 12,
          }}
        >
          <input
            type="checkbox"
            checked={under12Months}
            onChange={(e) => setUnder12Months(e.target.checked)}
            style={{ width: 'auto', marginTop: 3 }}
          />
          <span className="hint">
            健康保険の加入期間が12か月未満（標準報酬月額は{yen(SHORT_TENURE_CAP)}が上限になります）
          </span>
        </label>

        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="shussan-salary">産休中に会社から出る給与（月額・円）</label>
          <input
            id="shussan-salary"
            type="number"
            inputMode="numeric"
            min={0}
            step={10000}
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
            placeholder="出ないなら空欄のまま"
          />
          <p className="hint">
            給与が出る場合、その日額が出産手当金の日額より少なければ差額が支給されます。
          </p>
        </div>

        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontWeight: 400 }}>
          <input
            type="checkbox"
            checked={obstetricCompensation}
            onChange={(e) => setObstetricCompensation(e.target.checked)}
            style={{ width: 'auto', marginTop: 3 }}
          />
          <span className="hint">
            産科医療補償制度に加入している医療機関で出産する（大半の分娩機関が加入しています。
            わからなければチェックしたままで構いません）
          </span>
        </label>
      </details>

      {r === null ? (
        <div className="panel quiet">
          <p className="hint" style={{ margin: 0 }}>
            出産予定日を入れると、産前産後の支給期間ともらえる額が出ます。
          </p>
        </div>
      ) : (
        <>
          <div className="panel" style={{ textAlign: 'center' }}>
            <div className="metric">
              <span className="value">{Math.round(r.total).toLocaleString('ja-JP')}</span>
              <span className="unit">円</span>
              <span className="label">
                が産休でもらえる額の目安（出産手当金 {yen(r.allowanceTotal)} ＋ 出産育児一時金{' '}
                {yen(r.lumpSumTotal)}）
              </span>
            </div>
            {!r.birthDateGiven && (
              <p className="hint" style={{ margin: 0 }}>
                予定日どおりに生まれた場合の見込みです。
              </p>
            )}
            {r.fullyOffset && (
              <p className="hint" style={{ margin: 0, color: '#b45309' }}>
                会社から出る給与の日額（{yen(r.salaryDaily)}）が出産手当金の日額（
                {yen(r.dailyAmount)}）以上のため、出産手当金は支給されません。
              </p>
            )}
          </div>

          <table>
            <tbody>
              <tr>
                <td style={{ textAlign: 'left' }}>支給期間</td>
                <td>
                  {formatJa(r.startDate)} 〜 {formatJa(r.endDate)}
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)', display: 'block' }}>
                    産前{r.multiple ? BEFORE_DAYS_MULTIPLE : BEFORE_DAYS_SINGLE}日
                    {r.overdueDays > 0 && ` ＋ 予定日超過${r.overdueDays}日`} ＋ 産後{AFTER_DAYS}日 ＝
                    合計{r.totalDays}日
                  </span>
                </td>
              </tr>
              {r.earlyDays > 0 && (
                <tr>
                  <td style={{ textAlign: 'left' }}>
                    予定日基準で産休に入っていた場合
                    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)', display: 'block' }}>
                      産前休業は予定日を基準に請求するのが一般的です
                    </span>
                  </td>
                  <td>
                    {yen(r.allowanceTotalIfLeaveFromDue)}
                    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)', display: 'block' }}>
                      {formatJa(r.leaveFromDue)}から産休なら、{formatJa(r.startDate)}〜
                      {formatJa(addDays(r.leaveFromDue, -1))}の{r.earlyDays}日間は出勤日なので支給されず、
                      産前{r.beforeDaysIfLeaveFromDue}日・合計{r.totalDaysIfLeaveFromDue}日分になります
                    </span>
                  </td>
                </tr>
              )}
              <tr>
                <td style={{ textAlign: 'left' }}>標準報酬月額</td>
                <td>
                  {yen(r.standardMonthly)}
                  {r.capped && (
                    <span style={{ fontSize: 'var(--fs-xs)', color: '#b45309', display: 'block' }}>
                      加入12か月未満のため上限を適用
                    </span>
                  )}
                </td>
              </tr>
              <tr>
                <td style={{ textAlign: 'left' }}>出産手当金の日額（標準報酬日額×2/3）</td>
                <td>
                  <strong>{yen(r.dailyAmount)}</strong>
                  {r.salaryAdjusted && (
                    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)', display: 'block' }}>
                      給与日額 {yen(r.salaryDaily)} を差し引いて {yen(r.payableDaily)} を支給（差額支給）
                    </span>
                  )}
                </td>
              </tr>
              <tr>
                <td style={{ textAlign: 'left' }}>出産手当金の総額（{r.totalDays}日分）</td>
                <td>{yen(r.allowanceTotal)}</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'left' }}>
                  出産育児一時金{r.multiple && `（${yen(r.lumpSumPerChild)} × ${r.fetusCount}人）`}
                </td>
                <td>{yen(r.lumpSumTotal)}</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'left' }}>育児休業に入れる日（産後{AFTER_DAYS}日の翌日）</td>
                <td>{formatJa(r.childcareLeaveFrom)}</td>
              </tr>
            </tbody>
          </table>

          <div className="note">
            産前{r.multiple ? BEFORE_DAYS_MULTIPLE : BEFORE_DAYS_SINGLE}日
            （多胎{BEFORE_DAYS_MULTIPLE}日）<strong>をフルに休んだ場合</strong>の額です。出産手当金は
            「会社を休んで給与が支払われなかった日」に対して支給されるため、産前に働いた日があるとその分は減ります。
            給与との差額を出すときの「給与日額＝月額÷30」は本サイトの換算で、実際の申請では事業主が証明する日額が使われます。
            出産育児一時金は直接支払制度を使うと、健康保険から医療機関へ直接支払われ、出産費用との差額だけを受け取る形になります。
            なお<strong>出産手当金・出産育児一時金には税金がかかりません</strong>（健康保険法62条）。
            産前産後休業中の健康保険・厚生年金保険の保険料も、本人・会社ともに免除されます。
          </div>
        </>
      )}
    </div>
  );
}
