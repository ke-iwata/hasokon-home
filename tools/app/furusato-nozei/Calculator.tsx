'use client';

import { useState } from 'react';
import {
  calcFurusato,
  type HousingLoanTier,
  type SpouseType,
} from '@/lib/furusato-nozei';

const yen = (v: number) => `${Math.round(v).toLocaleString('ja-JP')}円`;
const manToYen = (v: string) => (Number(v) || 0) * 10_000;

const SPOUSES: { value: SpouseType; label: string }[] = [
  { value: 'none', label: 'なし（共働き・独身）' },
  { value: 'general', label: 'あり（配偶者控除の対象）' },
  { value: 'elderly', label: 'あり・70歳以上' },
];

/** 扶養親族の人数を選ぶ小さなセレクト */
function CountSelect({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label style={{ fontSize: '0.85rem' }}>
      {label}
      <span style={{ display: 'block', color: 'var(--muted)', fontWeight: 400, fontSize: '0.75rem' }}>
        {hint}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ marginTop: 4, fontSize: '0.95rem' }}
      >
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {n}人
          </option>
        ))}
      </select>
    </label>
  );
}

/** 控除の内訳の1行 */
function Row({
  label,
  value,
  sub,
  strong,
}: {
  label: React.ReactNode;
  value: string;
  sub?: string;
  strong?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 12,
        padding: '7px 0',
        borderBottom: '1px solid var(--border)',
        fontSize: strong ? '1rem' : '0.9rem',
        fontWeight: strong ? 700 : 400,
      }}
    >
      <span>
        {label}
        {sub && (
          <span style={{ display: 'block', color: 'var(--muted)', fontSize: '0.75rem', fontWeight: 400 }}>
            {sub}
          </span>
        )}
      </span>
      <span style={{ whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}

export default function Calculator() {
  const [incomeMan, setIncomeMan] = useState('500');
  const [spouse, setSpouse] = useState<SpouseType>('none');
  const [depGeneral, setDepGeneral] = useState(0);
  const [depSpecific, setDepSpecific] = useState(0);
  const [depElderly, setDepElderly] = useState(0);
  const [useEstimate, setUseEstimate] = useState(true);
  const [socialMan, setSocialMan] = useState('');
  const [kaigo, setKaigo] = useState(false);
  const [otherIncomeTaxMan, setOtherIncomeTaxMan] = useState('');
  const [otherResidentTaxMan, setOtherResidentTaxMan] = useState('');
  const [donationInput, setDonationInput] = useState('');
  const [onestop, setOnestop] = useState(false);
  const [loanMan, setLoanMan] = useState('');
  const [loanTier, setLoanTier] = useState<HousingLoanTier>('rate5');

  const r = calcFurusato({
    income: manToYen(incomeMan),
    socialInsurance: useEstimate ? null : manToYen(socialMan),
    kaigo,
    spouse,
    dependentsGeneral: depGeneral,
    dependentsSpecific: depSpecific,
    dependentsElderly: depElderly,
    otherDeductionsIncomeTax: manToYen(otherIncomeTaxMan),
    otherDeductionsResidentTax: manToYen(otherResidentTaxMan),
    donation: Number(donationInput) || 0,
    onestop,
    housingLoanCredit: manToYen(loanMan),
    housingLoanTier: loanTier,
  });
  const b = r.breakdown;
  const usingLimit = !donationInput || Number(donationInput) <= 0;

  return (
    <div className="card">
      <div style={{ display: 'grid', gap: 14 }}>
        <label>
          給与収入（額面・万円）
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={10}
            value={incomeMan}
            onChange={(e) => setIncomeMan(e.target.value)}
          />
        </label>

        <label>
          配偶者
          <select value={spouse} onChange={(e) => setSpouse(e.target.value as SpouseType)}>
            {SPOUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
          <CountSelect label="扶養親族" hint="16〜18歳・23〜69歳" value={depGeneral} onChange={setDepGeneral} />
          <CountSelect label="うち19〜22歳" hint="特定扶養親族" value={depSpecific} onChange={setDepSpecific} />
          <CountSelect label="うち70歳以上" hint="老人扶養親族" value={depElderly} onChange={setDepElderly} />
        </div>
        <p style={{ margin: '-6px 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
          16歳未満の子どもは扶養控除の対象外なので、人数に含めないでください。
        </p>

        <div>
          <label style={{ fontWeight: 400, display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: '0.9rem' }}>
            <input
              type="checkbox"
              checked={!useEstimate}
              onChange={(e) => setUseEstimate(!e.target.checked)}
              style={{ width: 'auto', marginTop: 3 }}
            />
            社会保険料を自分で入力する（源泉徴収票の「社会保険料等の金額」）
          </label>
          {useEstimate ? (
            <label style={{ fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.9rem', marginTop: 8 }}>
              <input
                type="checkbox"
                checked={kaigo}
                onChange={(e) => setKaigo(e.target.checked)}
                style={{ width: 'auto' }}
              />
              40〜64歳（介護保険料がかかる）
            </label>
          ) : (
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={socialMan}
              onChange={(e) => setSocialMan(e.target.value)}
              placeholder="例: 73（万円）"
              style={{ marginTop: 8 }}
              aria-label="社会保険料（万円）"
            />
          )}
        </div>

        <label>
          寄付額（円・空欄なら上限額いっぱい）
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            value={donationInput}
            onChange={(e) => setDonationInput(e.target.value)}
            placeholder={`空欄なら ${r.limit.toLocaleString('ja-JP')} 円で計算`}
          />
        </label>

        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: '0.9rem' }}>
          <label style={{ fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={onestop}
              onChange={(e) => setOnestop(e.target.checked)}
              style={{ width: 'auto' }}
            />
            ワンストップ特例を使う（確定申告をしない）
          </label>
        </div>

        <details>
          <summary style={{ cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600 }}>
            住宅ローン控除を使っている
          </summary>
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            <label style={{ fontSize: '0.85rem' }}>
              住宅ローン控除額（年間・万円）
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={loanMan}
                onChange={(e) => setLoanMan(e.target.value)}
                placeholder="例: 20（万円）"
              />
            </label>
            <label style={{ fontSize: '0.85rem' }}>
              入居した時期
              <select
                value={loanTier}
                onChange={(e) => setLoanTier(e.target.value as HousingLoanTier)}
              >
                <option value="rate5">令和4年（2022年）1月以降</option>
                <option value="rate7">平成28年〜令和3年（2016〜2021年）</option>
              </select>
            </label>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)' }}>
              控除額は源泉徴収票の「住宅借入金等特別控除の額」、または年末残高 ×
              控除率で確認できます。入居時期で住民税から引ける上限が変わります。
            </p>
          </div>
        </details>

        <details>
          <summary style={{ cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600 }}>
            その他の所得控除を入れる（生命保険料控除・医療費控除・iDeCoなど）
          </summary>
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            <label style={{ fontSize: '0.85rem' }}>
              所得税の控除額（万円）
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={otherIncomeTaxMan}
                onChange={(e) => setOtherIncomeTaxMan(e.target.value)}
                placeholder="0"
              />
            </label>
            <label style={{ fontSize: '0.85rem' }}>
              住民税の控除額（万円）
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={otherResidentTaxMan}
                onChange={(e) => setOtherResidentTaxMan(e.target.value)}
                placeholder="0"
              />
            </label>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)' }}>
              生命保険料控除は所得税が最大12万円・住民税が最大7万円というように、同じ控除でも住民税のほうが上限が低いものがあります。源泉徴収票や住民税決定通知書の額を入れてください。
            </p>
          </div>
        </details>
      </div>

      {/* 結果 */}
      <div
        style={{
          marginTop: 20,
          padding: '16px 18px',
          background: 'var(--accent-soft)',
          borderRadius: 12,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 600 }}>
          自己負担2,000円で寄付できる上限額
        </div>
        <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent)', lineHeight: 1.3 }}>
          {r.limit.toLocaleString('ja-JP')}
          <span style={{ fontSize: '1rem', marginLeft: 2 }}>円</span>
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
          住民税の所得割額 {yen(r.residentTax.incomeLevy)} をもとに計算しています
        </div>
      </div>

      <h3 style={{ fontSize: '1rem', margin: '22px 0 2px' }}>
        {yen(b.donation)} 寄付したときの内訳
      </h3>
      <p style={{ margin: '0 0 8px', fontSize: '0.8rem', color: 'var(--muted)' }}>
        {usingLimit
          ? '寄付額が空欄なので、上限額いっぱいで計算しています。'
          : '寄付額の欄に入れた金額で計算しています。'}
        {onestop ? 'ワンストップ特例（住民税からまとめて控除）。' : '確定申告する場合。'}
      </p>

      <div>
        {!onestop && (
          <Row
            label="所得税から控除"
            sub="確定申告の1〜2ヶ月後に、指定口座へ還付されます"
            value={yen(b.fromIncomeTax)}
          />
        )}
        <Row
          label="住民税から控除（基本分）"
          sub="（寄付額 − 2,000円）× 10%"
          value={yen(b.residentBasic)}
        />
        <Row
          label="住民税から控除（特例分）"
          sub={`（寄付額 − 2,000円）×（90% − 所得税率${(r.incomeTax.rate * 100).toFixed(0)}% × 1.021）`}
          value={yen(b.residentSpecial)}
        />
        {onestop && (
          <Row
            label="住民税から控除（申告特例控除分）"
            sub="ワンストップ特例では、所得税から引かれるはずの分も住民税から引かれます"
            value={yen(b.residentOnestop)}
          />
        )}
        <Row
          label="住民税から控除される合計"
          sub="翌年6月からの1年間、毎月の住民税が安くなります"
          value={yen(b.residentTotal)}
        />
        <Row label="控除の合計" value={yen(b.total)} strong />
        {b.housingLoanLoss > 0 && (
          <Row
            label="住宅ローン控除が使えなくなる分"
            sub="確定申告で課税所得が下がり、引ききれなくなった額。戻ってこないので自己負担になります"
            value={`− ${yen(b.housingLoanLoss)}`}
          />
        )}
        <Row
          label="実質の自己負担額"
          sub={
            b.outOfPocket <= 2_100
              ? '制度上の自己負担2,000円（端数を含む）'
              : b.specialCapped
                ? '上限を超えた分は自己負担になります'
                : '住宅ローン控除が使えなくなった分を含みます'
          }
          value={yen(b.outOfPocket)}
          strong
        />
      </div>

      {b.specialCapped && b.donation > 0 && (
        <div className="note" style={{ marginTop: 14 }}>
          <strong>上限額を超えています。</strong>
          特例分が住民税所得割額の20%（{yen(Math.floor(r.residentTax.incomeLevy * 0.2))}）で頭打ちになったため、超えた分はほとんど戻ってきません。自己負担は {yen(b.outOfPocket)} です。上限額の {yen(r.limit)} 以内に収めることをおすすめします。
        </div>
      )}

      {r.onestopAdvantage > 0 && (
        <div className="note" style={{ marginTop: 14 }}>
          <strong>ワンストップ特例を使うと {yen(r.onestopAdvantage)} 得します。</strong>
          確定申告をすると寄附金控除で課税所得が下がり、住宅ローン控除を引ききれなくなります。ワンストップ特例なら課税所得が下がらないため、住宅ローン控除をそのまま使えます。寄付先が5自治体以内で、他に確定申告の必要がなければワンストップ特例をおすすめします。
        </div>
      )}

      {r.housingLoan && (
        <details style={{ marginTop: 14 }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600 }}>
            住宅ローン控除の内訳を見る
          </summary>
          <table style={{ marginTop: 10, fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>　</th>
                <th>寄付しない場合</th>
                <th>この寄付をした場合</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th style={{ textAlign: 'left' }}>所得税から</th>
                <td>{yen(r.housingLoanBase!.fromIncomeTax)}</td>
                <td>{yen(r.housingLoan.fromIncomeTax)}</td>
              </tr>
              <tr>
                <th style={{ textAlign: 'left' }}>住民税から</th>
                <td>{yen(r.housingLoanBase!.fromResidentTax)}</td>
                <td>{yen(r.housingLoan.fromResidentTax)}</td>
              </tr>
              <tr>
                <th style={{ textAlign: 'left' }}>住民税から引ける上限</th>
                <td>{yen(r.housingLoanBase!.residentCap)}</td>
                <td>{yen(r.housingLoan.residentCap)}</td>
              </tr>
              <tr>
                <th style={{ textAlign: 'left' }}>実際に使えた額</th>
                <td>{yen(r.housingLoanBase!.used)}</td>
                <td>{yen(r.housingLoan.used)}</td>
              </tr>
              <tr>
                <th style={{ textAlign: 'left' }}>使えず切り捨てになる額</th>
                <td>{yen(r.housingLoanBase!.wasted)}</td>
                <td>{yen(r.housingLoan.wasted)}</td>
              </tr>
            </tbody>
          </table>
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 8 }}>
            住宅ローン控除はまず所得税から引き、引ききれない分だけを住民税から引けます。住民税側には上限（所得税の課税総所得金額等の
            {loanTier === 'rate7' ? '7%・最高136,500円' : '5%・最高97,500円'}
            ）があり、それも超えた分は切り捨てになります。
          </p>
        </details>
      )}

      {r.limit === 0 && (
        <div className="note" style={{ marginTop: 14 }}>
          住民税の所得割がかからないため、ふるさと納税をしても控除は受けられません（寄付額はすべて自己負担になります）。
        </div>
      )}

      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600 }}>
          計算の途中経過を見る
        </summary>
        <table style={{ marginTop: 10, fontSize: '0.85rem' }}>
          <tbody>
            <tr>
              <th style={{ textAlign: 'left' }}>給与収入</th>
              <td>{yen(manToYen(incomeMan))}</td>
            </tr>
            <tr>
              <th style={{ textAlign: 'left' }}>− 給与所得控除</th>
              <td>{yen(r.salaryDeduction)}</td>
            </tr>
            <tr>
              <th style={{ textAlign: 'left' }}>＝ 合計所得金額</th>
              <td>{yen(r.totalIncome)}</td>
            </tr>
            <tr>
              <th style={{ textAlign: 'left' }}>
                社会保険料{r.socialInsuranceEstimated ? '（概算）' : ''}
              </th>
              <td>{yen(r.socialInsurance)}</td>
            </tr>
            <tr>
              <th style={{ textAlign: 'left' }}>基礎控除（所得税 / 住民税）</th>
              <td>
                {yen(r.incomeTax.basicDeduction)} / {yen(r.residentTax.basicDeduction)}
              </td>
            </tr>
            <tr>
              <th style={{ textAlign: 'left' }}>所得控除の合計（所得税 / 住民税）</th>
              <td>
                {yen(r.incomeTax.deductionTotal)} / {yen(r.residentTax.deductionTotal)}
              </td>
            </tr>
            <tr>
              <th style={{ textAlign: 'left' }}>課税所得（所得税 / 住民税）</th>
              <td>
                {yen(r.incomeTax.taxableIncome)} / {yen(r.residentTax.taxableIncome)}
              </td>
            </tr>
            <tr>
              <th style={{ textAlign: 'left' }}>所得税率</th>
              <td>{(r.incomeTax.rate * 100).toFixed(0)}%</td>
            </tr>
            <tr>
              <th style={{ textAlign: 'left' }}>調整控除</th>
              <td>{yen(r.residentTax.adjustment)}</td>
            </tr>
            <tr>
              <th style={{ textAlign: 'left' }}>住民税の所得割額</th>
              <td>{yen(r.residentTax.incomeLevy)}</td>
            </tr>
          </tbody>
        </table>
        {r.socialInsuranceEstimated && (
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 8 }}>
            社会保険料は健康保険4.99%・厚生年金9.15%・雇用保険0.55%（本人負担分）で概算しています。厚生年金には上限があるため、高収入ほど負担率は下がります。正確に出したい場合は源泉徴収票の「社会保険料等の金額」を入力してください。
          </p>
        )}
      </details>
    </div>
  );
}
