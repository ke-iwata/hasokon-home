'use client';

import { useState } from 'react';
import {
  MEDICAL_CAP,
  MEDICAL_THRESHOLD_FIXED,
  MEDICAL_THRESHOLD_PIVOT,
  SELF_MED_CAP,
  SELF_MED_THRESHOLD,
  calcIryohiKojo,
  type DeductionPlan,
  type IryohiResult,
} from '@/lib/iryohi-kojo';

const yen = (v: number) => `${Math.round(v).toLocaleString('ja-JP')}円`;
const man = (v: number) => `${(v / 10_000).toLocaleString('ja-JP')}万円`;

/**
 * 制度1つ分のカード。
 *
 * **2制度を横並びの表にしない**（幅390pxで最も崩れやすい形）。
 * 縦積みのカード2枚＋差額の1行を既定のレイアウトにしている
 * （docs/features/iryohi-kojo-keisan.md）。
 */
function PlanCard({ plan, best }: { plan: DeductionPlan; best: boolean }) {
  return (
    <div
      className="panel"
      style={best ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : undefined}
    >
      <strong>
        {plan.label}
        {best && (
          <span className="chip" style={{ marginLeft: 8 }}>
            こちらが得
          </span>
        )}
      </strong>

      {!plan.available ? (
        <p className="hint" style={{ marginBottom: 0 }}>
          健康診断・予防接種などの「一定の取組」を受けた年でないと使えません。上のチェックを入れると計算します。
        </p>
      ) : plan.deduction === 0 ? (
        <p className="hint" style={{ marginBottom: 0 }}>
          {plan.netExpenses === 0
            ? '支出が入力されていません。'
            : `控除は0円です。足切りの${yen(plan.threshold)}まであと${yen(plan.shortfall)}。`}
        </p>
      ) : (
        <>
          <dl className="kv">
            <div>
              <dt>控除額（所得から引ける額）</dt>
              <dd>{yen(plan.deduction)}</dd>
            </div>
            <div>
              <dt>所得税の還付（申告の1〜2か月後）</dt>
              <dd>{yen(plan.incomeTaxRefund)}</dd>
            </div>
            <div>
              <dt>住民税の軽減（翌年度6月から）</dt>
              <dd>{yen(plan.residentSaving)}</dd>
            </div>
            <div>
              <dt>戻る額の合計</dt>
              <dd style={{ color: 'var(--accent)' }}>{yen(plan.total)}</dd>
            </div>
          </dl>
          <p className="hint" style={{ marginBottom: 0 }}>
            {yen(plan.netExpenses)} − 足切り {yen(plan.threshold)}
            {plan.kind === 'medical' &&
              (plan.thresholdBasis === 'rate'
                ? '（総所得金額等の5%。10万円より小さいのでこちらを使います）'
                : '（総所得金額等の5%が10万円以上なので10万円）')}
            {plan.capped && ` ／ 上限${man(plan.kind === 'medical' ? MEDICAL_CAP : SELF_MED_CAP)}で頭打ち`}
          </p>
        </>
      )}
    </div>
  );
}

/** 得なほうの制度の結果（両方0円なら null） */
function betterPlan(r: IryohiResult): DeductionPlan | null {
  if (r.better === 'medical' || r.better === 'tie') return r.medical;
  if (r.better === 'selfMedication') return r.selfMedication;
  return null;
}

export default function Calculator() {
  const [income, setIncome] = useState('5000000');
  const [medicalExpenses, setMedicalExpenses] = useState('300000');
  const [compensation, setCompensation] = useState('0');
  const [otcExpenses, setOtcExpenses] = useState('0');
  const [healthCheck, setHealthCheck] = useState(false);
  const [socialInsurance, setSocialInsurance] = useState('');
  const [kaigo, setKaigo] = useState(false);

  const r = calcIryohiKojo({
    income: Number(income) || 0,
    socialInsurance: socialInsurance.trim() === '' ? null : Number(socialInsurance) || 0,
    kaigo,
    medicalExpenses: Number(medicalExpenses) || 0,
    compensation: Number(compensation) || 0,
    otcExpenses: Number(otcExpenses) || 0,
    healthCheck,
  });

  const best = betterPlan(r);

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="income">年収（給与収入・額面・賞与込み・円）</label>
        <input
          id="income"
          type="number"
          inputMode="numeric"
          min={0}
          step={100000}
          value={income}
          onChange={(e) => setIncome(e.target.value)}
        />
        <p className="hint">
          源泉徴収票の「支払金額」。手取りではなく額面です。
          給与のほかに所得がある方・年金や事業所得だけの方は、この計算機の対象外です。
        </p>
      </div>

      <div className="field">
        <label htmlFor="medical">1年間に払った医療費の合計（円）</label>
        <input
          id="medical"
          type="number"
          inputMode="numeric"
          min={0}
          step={10000}
          value={medicalExpenses}
          onChange={(e) => setMedicalExpenses(e.target.value)}
        />
        <p className="hint">
          1月1日〜12月31日に実際に<strong>支払った</strong>額。生計を一にする家族の分を合算できます。
          通院の電車・バス代も含められます。下のOTC医薬品の購入額も、治療のためのものならここに含めて構いません。
        </p>
      </div>

      <div className="field">
        <label htmlFor="compensation">保険金などで補填される金額（円）</label>
        <input
          id="compensation"
          type="number"
          inputMode="numeric"
          min={0}
          step={10000}
          value={compensation}
          onChange={(e) => setCompensation(e.target.value)}
        />
        <p className="hint">
          生命保険の入院給付金、健康保険の高額療養費・出産育児一時金など。無ければ0のままで構いません。
        </p>
      </div>

      <div className="field">
        <label htmlFor="otc">セルフメディケーション税制の対象OTC医薬品の購入額（円）</label>
        <input
          id="otc"
          type="number"
          inputMode="numeric"
          min={0}
          step={1000}
          value={otcExpenses}
          onChange={(e) => setOtcExpenses(e.target.value)}
        />
        <p className="hint">
          対象商品はレシートに★などの印が付きます。使わない場合は0のままで構いません。
        </p>
      </div>

      <label
        className="field"
        style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontWeight: 400 }}
      >
        <input
          type="checkbox"
          checked={healthCheck}
          onChange={(e) => setHealthCheck(e.target.checked)}
          style={{ width: 'auto', marginTop: 3 }}
        />
        <span className="hint">
          その年に健康診断・人間ドック・予防接種・がん検診などを受けた
          <br />
          セルフメディケーション税制を使うための要件（「一定の取組」）です
        </span>
      </label>

      <details className="field">
        <summary style={{ cursor: 'pointer' }}>社会保険料を入力する（任意）</summary>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="shaho">社会保険料の年間合計（円）</label>
          <input
            id="shaho"
            type="number"
            inputMode="numeric"
            min={0}
            step={10000}
            value={socialInsurance}
            onChange={(e) => setSocialInsurance(e.target.value)}
            placeholder={`空欄なら年収から推計（${yen(r.socialInsurance)}）`}
          />
          <p className="hint">源泉徴収票の「社会保険料等の金額」。入れるほど結果が実額に近づきます。</p>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
          <input
            type="checkbox"
            checked={kaigo}
            onChange={(e) => setKaigo(e.target.checked)}
            style={{ width: 'auto' }}
          />
          <span className="hint">40〜64歳（介護保険料がかかる。推計するときだけ使います）</span>
        </label>
      </details>

      <div className="panel">
        <div className="metric">
          <span className="value">{Math.round(best?.total ?? 0).toLocaleString('ja-JP')}</span>
          <span className="unit">円</span>
          <span className="label">
            {best ? `が${best.label}で戻る額の概算` : 'どちらの制度も控除額が0円です'}
          </span>
        </div>
        <p className="hint">
          {best ? (
            <>
              所得税の還付 {yen(best.incomeTaxRefund)}（申告の1〜2か月後に振り込み）＋ 住民税の軽減{' '}
              {yen(best.residentSaving)}（翌年度6月からの税額が安くなる）。
              <strong>控除額 {yen(best.deduction)} がそのまま戻るわけではありません。</strong>
            </>
          ) : (
            <>
              医療費は足切りの{yen(r.medical.threshold)}まであと{yen(r.medical.shortfall)}、
              セルフメディケーション税制は{yen(SELF_MED_THRESHOLD)}まであと
              {yen(r.selfMedication.shortfall)}です。
            </>
          )}
        </p>
      </div>

      <PlanCard plan={r.medical} best={r.better === 'medical' || r.better === 'tie'} />
      <PlanCard plan={r.selfMedication} best={r.better === 'selfMedication'} />

      <div className="panel quiet">
        <p className="hint" style={{ margin: 0 }}>
          {r.better === 'none' ? (
            <>
              どちらの制度も足切りに届いていません。医療費控除は
              <strong>（医療費 − 補填額）が{yen(r.medical.threshold)}を超えた分</strong>、
              セルフメディケーション税制は
              <strong>対象OTC医薬品の購入額が{yen(SELF_MED_THRESHOLD)}を超えた分</strong>が控除になります。
            </>
          ) : r.better === 'tie' ? (
            <>
              2つの制度は<strong>どちらか一方しか使えません</strong>（選択適用）。
              いまの入力では戻る額が同じです。
            </>
          ) : (
            <>
              2つの制度は<strong>どちらか一方しか使えません</strong>（選択適用）。
              {best?.label}のほうが<strong>{yen(r.difference)}</strong>多く戻ります。
            </>
          )}
        </p>
      </div>

      <div className="panel quiet">
        <strong>計算の内訳</strong>
        <dl className="kv">
          <div>
            <dt>総所得金額等（足切りの5%の分母）</dt>
            <dd>{yen(r.totalIncome)}</dd>
          </div>
          <div>
            <dt>課税所得（税率が決まる額・控除前）</dt>
            <dd>{yen(r.taxableIncome)}</dd>
          </div>
          <div>
            <dt>あなたの所得税率</dt>
            <dd>{Math.round(r.marginalRate * 100)}%</dd>
          </div>
          <div>
            <dt>社会保険料{r.socialInsuranceEstimated && '（推計）'}</dt>
            <dd>{yen(r.socialInsurance)}</dd>
          </div>
        </dl>
        <p className="hint" style={{ marginBottom: 0 }}>
          足切りの5%は<strong>総所得金額等</strong>（給与所得控除を引いたあと・所得控除を引く前）が分母で、
          税率が決まる<strong>課税所得</strong>とは別の値です。
          {r.medical.thresholdBasis === 'rate' && (
            <>
              {' '}
              総所得金額等が{man(MEDICAL_THRESHOLD_PIVOT)}未満なので、足切りは
              {man(MEDICAL_THRESHOLD_FIXED)}ではなく{yen(r.medical.threshold)}
              です。<strong>医療費が10万円以下でも控除できます。</strong>
            </>
          )}{' '}
          所得税の還付額は「控除額×税率」ではなく、
          <strong>控除を入れる前と後で1年分の所得税を計算し直した差</strong>です（復興特別所得税を含む）。
          控除が税率の境目をまたぐと、税率を掛けるだけの計算より小さくなります。
        </p>
      </div>

      <div className="note">
        <strong>この結果は概算です。</strong>
        本人が給与所得者で、配偶者控除・扶養控除・生命保険料控除などを考えない前提で計算しています。
        {r.socialInsuranceEstimated && (
          <>社会保険料も年収からの推計（{yen(r.socialInsurance)}）を使っています。</>
        )}
        住民税は所得割の税率10%で見積もった目安で、調整控除・均等割・非課税の判定は含みません。
        実際の還付額は源泉徴収票の金額と他の控除で変わります。
        正確な額は国税庁の確定申告書等作成コーナーか税務署でご確認ください。
      </div>
    </div>
  );
}
