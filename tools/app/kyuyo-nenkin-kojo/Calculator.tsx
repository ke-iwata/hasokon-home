'use client';

import { useState } from 'react';
import {
  CAP,
  FIRST_RESIDENT_FISCAL_YEAR,
  FIRST_TAX_YEAR,
  calc,
  thresholdSalary,
  thresholdSalaryYen,
} from '@/lib/kyuyo-nenkin-kojo';

const yen = (v: number) => `${Math.round(v).toLocaleString('ja-JP')}円`;
/** 円 → 「630万円」。線や控除の合計のような額は万円で見せる */
const man = (v: number) => `${(Math.round(v / 1000) / 10).toLocaleString('ja-JP')}万円`;

export default function Calculator() {
  // 既定値は財務省の例（給与900万円・年金200万円・65歳以上）。開いた瞬間に「削られる」側が出る
  const [salary, setSalary] = useState('9000000');
  const [pension, setPension] = useState('2000000');
  const [age65, setAge65] = useState(true);
  const [otherIncome, setOtherIncome] = useState('0');

  const input = {
    salary: Number(salary) || 0,
    pension: Number(pension) || 0,
    age65,
    otherIncome: Number(otherIncome) || 0,
  };
  const r = calc(input);
  const lineInput = { pension: input.pension, age65, otherIncome: input.otherIncome };
  const line = thresholdSalary(lineInput);
  const lineYen = thresholdSalaryYen(lineInput);
  const hit = r.cut > 0;
  // 「あと給与◯万円まで」は1円単位の線から1万円単位で切り捨てて出す（切り上げると線を越える）
  const headroomMan =
    !hit && lineYen !== null && lineYen > input.salary
      ? Math.floor((lineYen - input.salary) / 10_000)
      : null;

  return (
    <div className="card">
      <div style={{ display: 'grid', gap: 14 }}>
        <label>
          給与の年収（額面・円）
          <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
            {FIRST_TAX_YEAR}年中の給与・賞与の合計（源泉徴収票の「支払金額」）
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={10000}
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
          />
        </label>

        <label>
          公的年金の年額（円）
          <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
            老齢基礎年金＋老齢厚生年金＋企業年金の合計（公的年金等の源泉徴収票の「支払金額」）
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={10000}
            value={pension}
            onChange={(e) => setPension(e.target.value)}
          />
        </label>

        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{FIRST_TAX_YEAR}年12月31日の年齢</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 'var(--fs-sm)' }}>
            <label style={{ fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="radio"
                name="age65"
                checked={age65}
                onChange={() => setAge65(true)}
                style={{ width: 'auto' }}
              />
              65歳以上
            </label>
            <label style={{ fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="radio"
                name="age65"
                checked={!age65}
                onChange={() => setAge65(false)}
                style={{ width: 'auto' }}
              />
              65歳未満
            </label>
          </div>
          <p className="hint" style={{ marginTop: 6 }}>
            1963年1月1日以前に生まれた方は「65歳以上」です
          </p>
        </div>

        <details>
          <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)' }}>
            年金・給与以外の所得がある（ふだんは不要）
          </summary>
          <label style={{ marginTop: 8, display: 'block' }}>
            年金・給与以外の所得（円）
            <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
              事業所得・不動産所得など（収入ではなく経費を引いた所得）
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={10000}
              value={otherIncome}
              onChange={(e) => setOtherIncome(e.target.value)}
            />
          </label>
        </details>
      </div>

      <div className="panel" style={{ marginTop: 18, textAlign: 'center', lineHeight: 1.7 }}>
        {!r.eligible ? (
          <div>
            <strong>給与と年金の両方がある方だけ</strong>が対象です。給与だけ・年金だけなら
            280万円の上限には<strong>かかりません</strong>。
          </div>
        ) : hit ? (
          <>
            <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
              年金の控除が削られる額
            </div>
            <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, color: '#b45309' }}>
              {yen(r.cut)}
            </div>
            <div style={{ fontSize: 'var(--fs-sm)' }}>
              <strong>{FIRST_TAX_YEAR}年分の所得税で約{yen(r.incomeTaxIncrease)}</strong>、
              <strong>
                {FIRST_RESIDENT_FISCAL_YEAR}年度の住民税で約{yen(r.residentTaxIncrease)}
              </strong>
              増えます（目安）
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
              控除の合計 {man(r.before.totalDeduction)}（上限 {man(CAP)}）
            </div>
            <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, color: 'var(--accent)' }}>
              かかりません
            </div>
            <div style={{ fontSize: 'var(--fs-sm)' }}>
              {headroomMan !== null
                ? `あと給与 ${headroomMan.toLocaleString('ja-JP')}万円まではかかりません`
                : line === null
                  ? 'この年金額なら、給与をいくら増やしてもかかりません'
                  : ''}
            </div>
          </>
        )}
      </div>

      {r.eligible && hit && (
        <p className="hint" style={{ marginTop: 8 }}>
          所得税は{FIRST_TAX_YEAR}年分（確定申告は{FIRST_TAX_YEAR + 1}年2〜3月）、住民税は
          {FIRST_RESIDENT_FISCAL_YEAR}年度分（{FIRST_RESIDENT_FISCAL_YEAR}年6月から）で、
          <strong>かかる年がずれる</strong>ので合算していません。
        </p>
      )}

      <h3 style={{ marginTop: 22 }}>改正前と改正後の内訳</h3>
      <table>
        <thead>
          <tr>
            <th></th>
            <th>改正前</th>
            <th>改正後</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>給与所得控除</td>
            <td>{yen(r.before.salaryDeduction)}</td>
            <td>{yen(r.after.salaryDeduction)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>公的年金等控除</td>
            <td>{yen(r.before.pensionDeduction)}</td>
            <td>
              <strong>{yen(r.after.pensionDeduction)}</strong>
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>控除の合計（上限 {man(CAP)}）</td>
            <td>{yen(r.before.totalDeduction)}</td>
            <td>{yen(r.after.totalDeduction)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>削られる額</td>
            <td>―</td>
            <td>{hit ? `− ${yen(r.cut)}` : '0円'}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>所得金額調整控除</td>
            <td>{yen(r.before.adjustment)}</td>
            <td>{yen(r.after.adjustment)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>合計所得金額</td>
            <td>{yen(r.before.totalIncome)}</td>
            <td>
              <strong>{yen(r.after.totalIncome)}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ marginTop: 22 }}>増える税額の目安</h3>
      <table>
        <thead>
          <tr>
            <th></th>
            <th>改正前</th>
            <th>改正後</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>所得税の基礎控除</td>
            <td>{yen(r.before.basicDeduction)}</td>
            <td>{yen(r.after.basicDeduction)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>所得税（{FIRST_TAX_YEAR}年分）</td>
            <td>{yen(r.before.incomeTax)}</td>
            <td>{yen(r.after.incomeTax)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>住民税所得割（{FIRST_RESIDENT_FISCAL_YEAR}年度）</td>
            <td>{yen(r.before.residentTax)}</td>
            <td>{yen(r.after.residentTax)}</td>
          </tr>
        </tbody>
      </table>
      <p className="hint" style={{ marginTop: 8 }}>
        所得控除は<strong>基礎控除だけ</strong>で計算した目安です。社会保険料控除・配偶者控除などがあれば
        課税所得は小さくなり、増える額も変わります。基礎控除は改正前・改正後それぞれの合計所得で取り直しています
        （合計所得489万円・655万円の段差をまたぐと、削られた額×税率より大きく増えます）。
        所得税には復興特別所得税・防衛特別所得税（合計2.1%）を含めています。
      </p>

      {r.eligible && line !== null && (
        <p className="hint">
          上限にかかり始める給与：<strong>約{man(line)}</strong>
          （この年金額・年齢・その他の所得のまま給与を増やしたとき）
        </p>
      )}

      <div className="note">
        合計所得金額が増えると、介護保険料の段階や医療費の窓口負担の割合が変わることがあります（このツールでは計算しません）。
      </div>
    </div>
  );
}
