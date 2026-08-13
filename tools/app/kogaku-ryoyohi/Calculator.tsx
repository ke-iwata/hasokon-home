'use client';

import { useEffect, useState } from 'react';
import {
  type AgeGroup,
  type CopayPercent,
  bracketsFor,
  calcKogakuRyoyohi,
  toYm,
} from '@/lib/kogaku-ryoyohi';

const fmtYen = (yen: number) => `${yen.toLocaleString('ja-JP')}円`;

/** '2026-08' → '2026年8月'（0埋めを落とす） */
const fmtMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return `${y}年${m}月`;
};

const AGE_GROUPS: { value: AgeGroup; label: string }[] = [
  { value: 'under70', label: '70歳未満' },
  { value: 'over70', label: '70歳以上' },
];

const COPAY_PERCENTS: { value: CopayPercent; label: string }[] = [
  { value: 30, label: '3割' },
  { value: 20, label: '2割' },
  { value: 10, label: '1割' },
];

/**
 * @param buildMonth ビルド時点の暦月（'YYYY-MM'）。静的書き出しなので、サーバ描画と
 *   ハイドレーション直後はこの固定値を初期値にし（一致しないとReactが警告を出す）、
 *   マウント後に「画面を開いた月」へ差し替える。7月にビルドしたHTMLを8月に開いたとき、
 *   改正前の限度額のまま表示されるのを防ぐため（lib/nenshu-kabe.ts と同じ考え方）
 */
export default function Calculator({ buildMonth }: { buildMonth: string }) {
  const [ageGroup, setAgeGroup] = useState<AgeGroup>('under70');
  const [bracketId, setBracketId] = useState('u70-c');
  const [medicalCost, setMedicalCost] = useState('1000000');
  const [pastCount, setPastCount] = useState('0');
  const [treatmentMonth, setTreatmentMonth] = useState(buildMonth);
  const [outpatientOnly, setOutpatientOnly] = useState(false);
  const [copayPercent, setCopayPercent] = useState<CopayPercent | ''>('');
  const [annualPaidBefore, setAnnualPaidBefore] = useState('0');
  const [lowIncomeConfirmed, setLowIncomeConfirmed] = useState(false);

  useEffect(() => {
    setTreatmentMonth(toYm(new Date()));
  }, []);

  // 診療月によって表が変わるので、選択肢もそのつど引き直す。
  // 年齢区分を切り替えた直後は前の区分IDが残るため、無ければ先頭に落とす
  const month = /^\d{4}-\d{2}$/.test(treatmentMonth) ? treatmentMonth : buildMonth;
  const brackets = bracketsFor(ageGroup, month);
  const bracket = brackets.find((b) => b.id === bracketId) ?? brackets[0];

  const r = calcKogakuRyoyohi({
    ageGroup,
    bracketId: bracket.id,
    medicalCost: Number(medicalCost) || 0,
    pastCount: Number(pastCount) || 0,
    treatmentMonth: month,
    outpatientOnly,
    copayPercent: copayPercent === '' ? undefined : copayPercent,
    annualPaidBefore: Number(annualPaidBefore) || 0,
    lowIncomeConfirmed,
  });

  const changeAgeGroup = (next: AgeGroup) => {
    setAgeGroup(next);
    setBracketId(bracketsFor(next, month)[0].id);
    setCopayPercent('');
    setOutpatientOnly(false);
    setLowIncomeConfirmed(false);
  };

  return (
    <div className="card">
      <div className="field">
        <span className="field-label">年齢区分</span>
        <div className="field-row">
          {AGE_GROUPS.map((a) => (
            <label
              key={a.value}
              style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}
            >
              <input
                type="radio"
                name="age-group"
                checked={ageGroup === a.value}
                onChange={() => changeAgeGroup(a.value)}
                style={{ width: 'auto' }}
              />
              {a.label}
            </label>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="bracket">所得区分</label>
        <select id="bracket" value={bracket.id} onChange={(e) => setBracketId(e.target.value)}>
          {brackets.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}｜{b.incomeGuide}
            </option>
          ))}
        </select>
        <p className="hint">{bracket.standard}</p>
      </div>

      <div className="field">
        <label htmlFor="medical-cost">1か月の医療費（保険適用分の10割・円）</label>
        <input
          id="medical-cost"
          type="number"
          inputMode="numeric"
          min={0}
          step={10000}
          value={medicalCost}
          onChange={(e) => setMedicalCost(e.target.value)}
        />
        <p className="hint">
          窓口で払った額ではなく、その{r.copayPercent / 10}倍にあたる医療費の総額（10割）を入れてください。
          差額ベッド代・食事代・先進医療などの保険適用外の費用は含みません。
        </p>
      </div>

      <div className="field field-row">
        <label>
          診療月
          <input
            type="month"
            value={treatmentMonth}
            onChange={(e) => setTreatmentMonth(e.target.value)}
          />
        </label>
        <label>
          直近12か月に高額療養費を受けた回数
          <select value={pastCount} onChange={(e) => setPastCount(e.target.value)}>
            <option value="0">0回</option>
            <option value="1">1回</option>
            <option value="2">2回</option>
            <option value="3">3回以上</option>
          </select>
        </label>
      </div>

      {ageGroup === 'over70' && (
        <div className="field field-row">
          <label>
            この月の受診
            <select
              value={outpatientOnly ? 'outpatient' : 'all'}
              onChange={(e) => setOutpatientOnly(e.target.value === 'outpatient')}
            >
              <option value="all">入院を含む（世帯単位）</option>
              <option value="outpatient">外来のみ（個人ごと）</option>
            </select>
          </label>
          <label>
            窓口負担割合
            <select
              value={copayPercent === '' ? bracket.copayPercent : copayPercent}
              onChange={(e) => setCopayPercent(Number(e.target.value) as CopayPercent)}
            >
              {COPAY_PERCENTS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {r.annualLimit !== null && (
        <div className="field">
          <label htmlFor="annual-paid">
            {r.annualPeriodLabel}に、この月より前に払った自己負担の累計（円）
          </label>
          <input
            id="annual-paid"
            type="number"
            inputMode="numeric"
            min={0}
            step={10000}
            value={annualPaidBefore}
            onChange={(e) => setAnnualPaidBefore(e.target.value)}
          />
          <p className="hint">
            年間上限は8月から翌年7月までの通算です。分からなければ0のままで構いません。
          </p>
        </div>
      )}

      {bracket.limit.annualLowIncome !== undefined && (
        <label
          className="field"
          style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontWeight: 400 }}
        >
          <input
            type="checkbox"
            checked={lowIncomeConfirmed}
            onChange={(e) => setLowIncomeConfirmed(e.target.checked)}
            style={{ width: 'auto', marginTop: 3 }}
          />
          <span className="hint">
            年収 約200万円以下（標準報酬月額15万円以下）と保険者に確認されている
            <br />
            年間上限が{fmtYen(bracket.limit.annualLowIncome)}
            に下がります（令和9年8月以降に償還払いで精算）
          </span>
        </label>
      )}

      <div className="panel">
        <div className="metric">
          <span className="value">{r.monthlyLimit.toLocaleString('ja-JP')}</span>
          <span className="unit">円</span>
          <span className="label">
            が{fmtMonth(r.treatmentMonth)}分の自己負担限度額
            {r.outpatientApplied && '（外来・個人ごと）'}
          </span>
        </div>
        <p className="hint">
          {r.tableLabel}の限度額表を適用（{r.bracket.name}）
          {r.multiApplied && ' ／ 多数回該当（4か月目以降）の額です'}
        </p>
      </div>

      <dl className="kv">
        <div>
          <dt>窓口で払う額（{r.copayPercent / 10}割負担）</dt>
          <dd>{fmtYen(r.copay)}</dd>
        </div>
        <div>
          <dt>実際に負担する額</dt>
          <dd>{fmtYen(r.payment)}</dd>
        </div>
        <div>
          <dt>高額療養費として戻る額</dt>
          <dd style={{ color: 'var(--accent)' }}>{fmtYen(r.refund)}</dd>
        </div>
        <div>
          <dt>多数回該当の限度額（4か月目以降）</dt>
          <dd>{r.multiLimit === null ? '適用なし' : fmtYen(r.multiLimit)}</dd>
        </div>
      </dl>

      {r.annualLimit !== null ? (
        <div className="panel quiet">
          <strong>年間上限（{r.annualPeriodLabel}）</strong>
          <dl className="kv">
            <div>
              <dt>年間上限{r.outpatientApplied && '（外来）'}</dt>
              <dd>{fmtYen(r.annualLimit)}</dd>
            </div>
            <div>
              <dt>この月までの累計</dt>
              <dd>{fmtYen(r.annualPaidTotal)}</dd>
            </div>
            <div>
              <dt>上限までの残り</dt>
              <dd>{fmtYen(r.annualRemaining ?? 0)}</dd>
            </div>
          </dl>
          <p className="hint">
            {r.annualCapReached
              ? `年間上限に達しています。${r.annualPeriodLabel}の残りの月は、この区分の医療費の自己負担がありません。`
              : `年間上限に達すると、${r.annualPeriodLabel}の残りの月は自己負担がなくなります。`}
            {r.annualReduction > 0 &&
              `この月は年間上限に達したことで、月額上限より${fmtYen(r.annualReduction)}少ない負担になります。`}
          </p>
        </div>
      ) : (
        <div className="panel quiet">
          <p className="hint" style={{ margin: 0 }}>
            年間上限（年単位の上限額）は令和8年8月診療分から新設された仕組みです。
            {fmtMonth(r.treatmentMonth)}の診療分にはまだ適用されません。
          </p>
        </div>
      )}

      {r.comparison && (
        <div className="panel quiet">
          <strong>
            {r.comparison.direction === 'before' ? '改正前と比べると' : '2026年8月からはこうなります'}
          </strong>
          <dl className="kv">
            <div>
              <dt>{r.comparison.tableLabel}の限度額</dt>
              <dd>{fmtYen(r.comparison.monthlyLimit)}</dd>
            </div>
            <div>
              <dt>差額</dt>
              <dd>
                {r.comparison.diff === 0
                  ? '同額（据え置き）'
                  : `${r.comparison.diff > 0 ? '＋' : '−'}${fmtYen(Math.abs(r.comparison.diff))}`}
              </dd>
            </div>
          </dl>
          <p className="hint">
            限度額は<strong>診療を受けた月</strong>で決まります。2026年7月以前の診療分には改正前の限度額が適用されます。
          </p>
        </div>
      )}

      <div className="note">
        本計算は本人1人・1か月・1つの医療機関分の目安です。世帯合算（同じ世帯の21,000円以上の自己負担の合算）、
        入院時の食事代・差額ベッド代・先進医療などの保険適用外の費用、健康保険組合の付加給付は含みません。
        実際の限度額と払い戻し額は、加入している健康保険（協会けんぽ・健保組合・国民健康保険・後期高齢者医療）にご確認ください。
      </div>
    </div>
  );
}
