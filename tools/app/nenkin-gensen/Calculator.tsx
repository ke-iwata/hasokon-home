'use client';

import { useState } from 'react';
import {
  EXEMPT_BELOW,
  calc,
  type Disability,
  type Spouse,
  type WidowStatus,
} from '@/lib/nenkin-gensen';

const yen = (v: number) => `${Math.round(v).toLocaleString('ja-JP')}円`;
/** 円 → 「214万円」。線のような区切りのいい額は万円で見せる */
const man = (v: number) => `${(Math.round(v / 1000) / 10).toLocaleString('ja-JP')}万円`;

export default function Calculator() {
  // 既定値は「65歳以上・年金240万円・社会保険料1回2万円」。開いた瞬間に「12月は0円で戻る」が出る
  const [age65, setAge65] = useState(true);
  const [annual, setAnnual] = useState('2400000');
  const [social, setSocial] = useState('20000');
  const [submitted, setSubmitted] = useState(true);
  const [spouse, setSpouse] = useState<Spouse>('none');
  const [depGeneral, setDepGeneral] = useState('0');
  const [depSpecific, setDepSpecific] = useState('0');
  const [depElderly, setDepElderly] = useState('0');
  const [disability, setDisability] = useState<Disability>('none');
  const [widow, setWidow] = useState<WidowStatus>('none');

  const r = calc({
    age65,
    annualPension: Number(annual) || 0,
    socialInsurancePerPayment: Number(social) || 0,
    submitted,
    spouse,
    dependents: {
      general: Number(depGeneral) || 0,
      specific: Number(depSpecific) || 0,
      elderly: Number(depElderly) || 0,
    },
    disability,
    widow,
  });

  const exemptLine = EXEMPT_BELOW[2027][age65 ? 'over65' : 'under65'];
  const overpaid = r.withheldFebToOct - r.perPaymentSettlement * 5;
  const noTaxAtAll = r.perPaymentBefore === 0 && r.perPaymentSettlement === 0;

  return (
    <div className="card">
      <div className="field">
        <span className="field-label">2026年12月31日の年齢</span>
        <div className="field-row" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[true, false].map((v) => (
            <button
              key={String(v)}
              type="button"
              aria-pressed={age65 === v}
              onClick={() => setAge65(v)}
              style={{
                padding: '8px 0',
                fontWeight: age65 === v ? 700 : 400,
                background: age65 === v ? 'var(--accent-soft)' : undefined,
              }}
            >
              {v ? '65歳以上' : '65歳未満'}
            </button>
          ))}
        </div>
      </div>

      <div className="field-row">
        <label>
          年金の年額（円）
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={10000}
            value={annual}
            onChange={(e) => setAnnual(e.target.value)}
          />
        </label>
        <label>
          社会保険料（1回・円）
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            value={social}
            onChange={(e) => setSocial(e.target.value)}
          />
        </label>
      </div>
      <p className="hint" style={{ marginTop: 4 }}>
        年額は老齢基礎年金＋老齢厚生年金（年金振込通知書・源泉徴収票の「支払金額」）。社会保険料は通知書の介護保険料と国保／後期高齢者医療保険料の合計（分からなければ0）
      </p>

      <div className="field-row" style={{ marginTop: 10 }}>
        <label>
          扶養親族等申告書
          <select value={submitted ? 'yes' : 'no'} onChange={(e) => setSubmitted(e.target.value === 'yes')}>
            <option value="yes">出している</option>
            <option value="no">出していない</option>
          </select>
        </label>
        <label>
          配偶者
          <select value={spouse} onChange={(e) => setSpouse(e.target.value as Spouse)}>
            <option value="none">控除なし</option>
            <option value="general">控除対象配偶者</option>
            <option value="elderly">老人控除対象配偶者（70歳以上）</option>
          </select>
        </label>
      </div>

      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)' }}>
          扶養親族・障害者・寡婦／ひとり親（該当する方だけ）
        </summary>
        <div className="field-row" style={{ marginTop: 8 }}>
          <label>
            一般の扶養（16〜18・23〜69歳）
            <input type="number" inputMode="numeric" min={0} value={depGeneral} onChange={(e) => setDepGeneral(e.target.value)} />
          </label>
          <label>
            特定扶養（19〜22歳）
            <input type="number" inputMode="numeric" min={0} value={depSpecific} onChange={(e) => setDepSpecific(e.target.value)} />
          </label>
          <label>
            老人扶養（70歳以上）
            <input type="number" inputMode="numeric" min={0} value={depElderly} onChange={(e) => setDepElderly(e.target.value)} />
          </label>
          <label>
            本人の障害者控除
            <select value={disability} onChange={(e) => setDisability(e.target.value as Disability)}>
              <option value="none">なし</option>
              <option value="general">障害者</option>
              <option value="special">特別障害者</option>
            </select>
          </label>
          <label>
            寡婦・ひとり親
            <select value={widow} onChange={(e) => setWidow(e.target.value as WidowStatus)}>
              <option value="none">なし</option>
              <option value="widow">寡婦</option>
              <option value="singleParent">ひとり親</option>
            </select>
          </label>
        </div>
        <p className="hint" style={{ marginTop: 6 }}>
          扶養の人数は申告書に書いた人だけ。年齢は2026年12月31日時点
        </p>
      </details>

      <div className="panel" style={{ lineHeight: 1.7 }}>
        {r.exempt2027 && (
          <p style={{ margin: '0 0 6px', fontWeight: 700 }}>
            2027年からは年金から所得税が引かれなくなります（年金{man(exemptLine)}未満）。
          </p>
        )}
        {noTaxAtAll ? (
          <p style={{ margin: 0 }}>
            2026年は2〜10月も12月も<strong>所得税は0円</strong>で、12月の精算で戻るお金もありません。
          </p>
        ) : r.refund > 0 ? (
          <p style={{ margin: 0 }}>
            12月の年金では<strong>所得税0円</strong>、さらに
            <strong style={{ fontSize: 'var(--fs-lg)', color: 'var(--accent)' }}> {yen(r.refund)} が戻ります</strong>
            （年金と一緒に振り込まれます。10月まで1回 {yen(r.perPaymentBefore)}）。
          </p>
        ) : (
          <p style={{ margin: 0 }}>
            12月の年金では、所得税が
            <strong style={{ fontSize: 'var(--fs-lg)', color: 'var(--accent)' }}> {yen(r.decemberTax)}</strong>
            （10月まで1回 {yen(r.perPaymentBefore)}）。差額 <strong>{yen(Math.max(0, overpaid))}</strong>{' '}
            の取りすぎが12月に精算されます。
          </p>
        )}
      </div>

      <h3 style={{ marginTop: 22 }}>1回あたりの所得税（2か月分の年金 {yen(r.payment)}）</h3>
      <table>
        <thead>
          <tr>
            <th></th>
            <th>2〜10月（改正前の控除）</th>
            <th>12月の精算で使う1回分</th>
            <th>2027年2月以後</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>控除の月割</td>
            <td>{yen(r.monthlyDeduction.before)}</td>
            <td>{yen(r.monthlyDeduction.settlement)}</td>
            <td>{yen(r.monthlyDeduction.after2027)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>所得税（1回）</td>
            <td>{yen(r.perPaymentBefore)}</td>
            <td>{yen(r.perPaymentSettlement)}</td>
            <td>
              <strong>{r.exempt2027 ? '0円（対象外）' : yen(r.perPayment2027)}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ marginTop: 22 }}>12月の精算</h3>
      <table>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>改正後の控除で計算した1年分（6回分）</td>
            <td>{yen(r.annualTaxAtSettlement)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>2〜10月の5回で引かれた額</td>
            <td>− {yen(r.withheldFebToOct)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>＝ 12月に引かれる所得税</td>
            <td>
              <strong>{yen(r.decemberTax)}</strong>
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>＝ 12月に戻る額</td>
            <td>
              <strong>{yen(r.refund)}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ marginTop: 22 }}>扶養親族等申告書を出さないと</h3>
      <p className="hint" style={{ fontSize: 'var(--fs-sm)' }}>
        {!submitted
          ? '出していないので、配偶者・扶養などの控除は引かれていません（基礎控除だけを引いて 5.105%）。出すと、該当する控除の分だけ1回あたりの税額が下がります。'
          : r.withoutFormIncrease > 0
            ? `2027年以後の1回あたりの所得税は ${yen(r.perPayment2027WithoutForm)}（出した場合より ${yen(r.withoutFormIncrease)} 多い）。基礎控除は引かれますが、配偶者・扶養などの控除が引かれなくなります。`
            : '配偶者・扶養などの控除に当てはまらないので、出さなくても1回あたりの税額は変わりません（税率も同じ 5.105%）。'}
      </p>

      <h3 style={{ marginTop: 22 }}>確定申告が要るかもしれない方</h3>
      <ul style={{ fontSize: 'var(--fs-sm)' }}>
        <li>2026年分で新たに扶養の要件（合計所得62万円以下）を満たした配偶者・扶養親族がいる（12月の精算には入りません）</li>
        <li>医療費控除・社会保険料控除（口座振替の分）・生命保険料控除などを受けたい</li>
        <li>年金以外の所得が20万円を超える、または複数の年金を受けている</li>
      </ul>
      <p className="hint">当てはまるかの判定はしていません。条件を並べているだけです。</p>

      <div className="note">
        本計算は目安です。正確な金額は日本年金機構から届く12月の「支払通知書」で確認してください（問い合わせはねんきんダイヤル）。
        年額を1つ入れる設計なので、2月払い（前年度の額）と4月改定後の額の違いや、年度の途中での介護保険料・国保／後期高齢者医療保険料の変更は反映していません。
        複数の公的年金（共済年金・企業年金など）を受けている場合は支払者ごとに別々に計算されます。この計算は日本年金機構が支払う年金1つ分です。
      </div>
    </div>
  );
}
