'use client';

import { useEffect, useState } from 'react';
import { addDays, formatDate, formatJa, parseDate } from '@/lib/date-parts';
import {
  AGE_MAX,
  AGE_MIN,
  BENEFIT_DAILY_MIN,
  CERTIFICATION_INTERVAL_DAYS,
  DEFAULT_APPLY_AFTER_DAYS,
  TENURE_BANDS,
  WAGE_DAILY_MIN,
  WAITING_DAYS,
  calcKihonTeate,
  type LeaveCategory,
  type LeaveReason,
  type TenureBand,
} from '@/lib/shitsugyo-hoken';

const fmtYen = (yen: number) => `${Math.round(yen).toLocaleString('ja-JP')}円`;

/**
 * 離職理由の選択肢。
 *
 * 所定給付日数のテーブル（`category`）と給付制限（`reason`）は別の軸だが、
 * 利用者に2つ選ばせると必ず食い違うので、実際の離職理由1つから両方を決める。
 */
const REASONS: {
  value: string;
  label: string;
  category: Exclude<LeaveCategory, 'konnan'>;
  reason: LeaveReason;
  hint?: string;
}[] = [
  {
    value: 'self',
    label: '自己都合（転職・結婚・転居など）',
    category: 'ippan',
    reason: 'self',
    hint: '待期7日のあとに給付制限（原則1ヶ月）があります。',
  },
  {
    value: 'company',
    label: '会社都合（倒産・解雇・退職勧奨・雇止めなど）',
    category: 'tokutei',
    reason: 'company',
    hint: '特定受給資格者として、所定給付日数が長くなり給付制限もありません。',
  },
  {
    value: 'justified',
    label: '正当な理由のある自己都合（病気・家族の介護・配偶者の転勤など）',
    category: 'ippan',
    reason: 'company',
    hint: '特定理由離職者にあたると給付制限はありません。所定給付日数は自己都合と同じ表です。',
  },
  {
    value: 'retirement',
    label: '定年退職・契約期間の満了（更新を希望しなかった）',
    category: 'ippan',
    reason: 'company',
    hint: '給付制限はありません。所定給付日数は自己都合と同じ表です。',
  },
  {
    value: 'grave',
    label: '重責解雇（自分の重大な責任による解雇）',
    category: 'ippan',
    reason: 'grave',
    hint: '給付制限は3ヶ月で、教育訓練等を受けても解除されません。',
  },
];

/**
 * @param buildDate ビルド時刻（ISO文字列）。静的書き出しなので、サーバ描画と
 *   ハイドレーション直後はこの固定値を初期値にし（一致しないとReactが警告を出す）、
 *   マウント後に「画面を開いた日」へ差し替える。
 */
export default function Calculator({ buildDate }: { buildDate: string }) {
  const [monthly, setMonthly] = useState('300000');
  const [age, setAge] = useState('35');
  const [tenure, setTenure] = useState<TenureBand>('y10to20');
  const [reasonKey, setReasonKey] = useState('self');
  const [konnan, setKonnan] = useState(false);
  const [pastSelfLeaves, setPastSelfLeaves] = useState('0');
  const [training, setTraining] = useState(false);
  const [leaveDate, setLeaveDate] = useState(() => isoOf(buildDate));
  const [applyDate, setApplyDate] = useState(() => isoAfter(buildDate, DEFAULT_APPLY_AFTER_DAYS));

  useEffect(() => {
    const today = new Date().toISOString();
    setLeaveDate(isoOf(today));
    setApplyDate(isoAfter(today, DEFAULT_APPLY_AFTER_DAYS));
  }, []);

  const picked = REASONS.find((r) => r.value === reasonKey) ?? REASONS[0];
  const ageNum = clamp(Number(age) || 0, 0, 120);
  const leave = parseDate(leaveDate);
  const apply = parseDate(applyDate);

  const r = calcKihonTeate({
    totalWage6m: (Number(monthly) || 0) * 6,
    age: ageNum,
    tenure,
    category: konnan ? 'konnan' : picked.category,
    reason: picked.reason,
    pastSelfLeaves: Number(pastSelfLeaves) || 0,
    training,
    leaveDate: leave ?? undefined,
    applyDate: apply ?? undefined,
  });

  const isSelf = picked.reason === 'self';
  const s = r.schedule;

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="sh-monthly">退職前6ヶ月の平均月給（額面・円）</label>
        <input
          id="sh-monthly"
          type="number"
          inputMode="numeric"
          min={0}
          step={10000}
          value={monthly}
          onChange={(e) => setMonthly(e.target.value)}
        />
        <p className="hint">
          税・社会保険料を引く前の額面です。<strong>賞与（ボーナス）は含めません。</strong>
          残業代・通勤手当は含めます。賃金総額 {fmtYen((Number(monthly) || 0) * 6)} ÷ 180日 で
          賃金日額を出します。
        </p>
      </div>

      <div className="field">
        <div className="field-row">
          <div>
            <label htmlFor="sh-age">離職時の年齢</label>
            <input
              id="sh-age"
              type="number"
              inputMode="numeric"
              min={AGE_MIN}
              max={AGE_MAX}
              step={1}
              value={age}
              onChange={(e) => setAge(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="sh-tenure">雇用保険に入っていた期間</label>
            <select
              id="sh-tenure"
              value={tenure}
              onChange={(e) => setTenure(e.target.value as TenureBand)}
            >
              {TENURE_BANDS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="hint">
          期間は「被保険者であった期間（算定基礎期間）」です。転職しても、間が1年以内で
          失業給付を受けていなければ前の会社の分と通算されます。
        </p>
      </div>

      <div className="field">
        <label htmlFor="sh-reason">離職理由</label>
        <select id="sh-reason" value={reasonKey} onChange={(e) => setReasonKey(e.target.value)}>
          {REASONS.map((x) => (
            <option key={x.value} value={x.value}>
              {x.label}
            </option>
          ))}
        </select>
        {picked.hint && <p className="hint">{picked.hint}</p>}
      </div>

      {isSelf && (
        <div className="field">
          <div className="field-row">
            <div>
              <label htmlFor="sh-past">
                過去5年の自己都合離職の回数（今回を除く）
              </label>
              <input
                id="sh-past"
                type="number"
                inputMode="numeric"
                min={0}
                max={9}
                step={1}
                value={pastSelfLeaves}
                onChange={(e) => setPastSelfLeaves(e.target.value)}
              />
            </div>
          </div>
          <p className="hint">
            正当な理由なく自己都合退職して失業給付の受給資格決定を受けた回数です。
            2回以上あると給付制限が3ヶ月になります。
          </p>
        </div>
      )}

      <div className="field">
        <label
          style={{ fontWeight: 400, display: 'flex', gap: 8, alignItems: 'flex-start' }}
        >
          <input
            type="checkbox"
            checked={training}
            onChange={(e) => setTraining(e.target.checked)}
            style={{ width: 'auto', marginTop: 3 }}
          />
          <span>
            教育訓練等を受けた（受けている）
            <span className="hint" style={{ display: 'block' }}>
              令和7年4月1日以降に受講を開始した教育訓練給付の対象講座・公共職業訓練などを、
              離職日前1年以内に受けた、または離職後に受けている場合。給付制限が解除されます。
            </span>
          </span>
        </label>
        <label
          style={{ fontWeight: 400, display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10 }}
        >
          <input
            type="checkbox"
            checked={konnan}
            onChange={(e) => setKonnan(e.target.checked)}
            style={{ width: 'auto', marginTop: 3 }}
          />
          <span>
            就職困難者にあたる
            <span className="hint" style={{ display: 'block' }}>
              障害者手帳をお持ちの方、保護観察中の方など。所定給付日数が長くなります。
            </span>
          </span>
        </label>
      </div>

      <div className="field">
        <div className="field-row">
          <div>
            <label htmlFor="sh-leave">離職日</label>
            <input
              id="sh-leave"
              type="date"
              value={leaveDate}
              onChange={(e) => setLeaveDate(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="sh-apply">ハローワークで求職の申込みをする日</label>
            <input
              id="sh-apply"
              type="date"
              value={applyDate}
              onChange={(e) => setApplyDate(e.target.value)}
            />
          </div>
        </div>
        <p className="hint">
          求職の申込みをした日が「受給資格決定日」になり、そこから待期{WAITING_DAYS}日が始まります。
        </p>
      </div>

      <div className="panel">
        <div className="metric">
          <span className="label">基本手当日額（1日あたり）</span>
          <span className="value">{fmtYen(r.benefitDaily)}</span>
        </div>
        <div className="metric" style={{ marginTop: 8 }}>
          <span className="label">
            総支給額の目安（{r.prescribed.days}日分）
          </span>
          <span className="value">{fmtYen(r.total)}</span>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          失業の認定は{CERTIFICATION_INTERVAL_DAYS}日ごとなので、1回の振込は
          {fmtYen(r.perCertification)}前後が目安です（実際の振込は認定日から1週間ほど後）。
        </p>
      </div>

      <dl className="kv" style={{ marginTop: 16 }}>
        <div>
          <dt>賃金日額（賃金総額 ÷ 180日）</dt>
          <dd>
            {fmtYen(r.wage.value)}
            {r.wage.cap === 'max' && (
              <span className="chip" style={{ marginLeft: 8 }}>
                上限適用
              </span>
            )}
            {r.wage.cap === 'min' && (
              <span className="chip" style={{ marginLeft: 8 }}>
                下限適用
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>適用された給付率</dt>
          <dd>{(r.effectiveRate * 100).toFixed(1)}%</dd>
        </div>
        <div>
          <dt>年齢区分（{r.rule.label}）の上限額</dt>
          <dd>
            賃金日額 {fmtYen(r.rule.wageDailyMax)} ／ 基本手当日額{' '}
            {fmtYen(r.rule.benefitDailyMax)}
          </dd>
        </div>
        <div>
          <dt>所定給付日数</dt>
          <dd>{r.prescribed.days}日</dd>
        </div>
        <div>
          <dt>給付制限</dt>
          <dd>{r.restriction.months === 0 ? 'なし' : `${r.restriction.months}ヶ月`}</dd>
        </div>
      </dl>

      <p className="hint" style={{ marginTop: 10 }}>{r.restriction.text}</p>

      {r.restriction.releasableByTraining && (
        <div className="note">
          <strong>教育訓練等を受けると、この給付制限は解除されます。</strong>
          令和7年4月1日以降に受講を開始した教育訓練給付の対象講座・公共職業訓練などが対象です。
          受講したら（する予定があれば）ハローワークに申し出てください。申し出には期限があります。
        </div>
      )}

      {r.wage.cap === 'max' && (
        <p className="hint">
          賃金日額が年齢区分の上限額（{fmtYen(r.rule.wageDailyMax)}）を超えているため、
          実際の月給（{fmtYen(Number(monthly) || 0)}）ではなく上限額で計算しています。
          給与が高いほど、額面に対する割合は小さくなります。
        </p>
      )}

      {r.wage.cap === 'min' && (
        <p className="hint">
          賃金日額が下限額（{fmtYen(WAGE_DAILY_MIN)}）を下回るため、下限額で計算しています。
          基本手当日額は{fmtYen(BENEFIT_DAILY_MIN)}が下限です。
        </p>
      )}

      {r.prescribed.adjusted && (
        <div className="note">
          入力の年齢と加入期間の組み合わせは、法律の表に日数の定めがありません
          （30歳未満で加入20年以上など）。日数が定められている区分まで下げて計算しています。
        </div>
      )}

      {r.eligibilityCaution && (
        <div className="note">
          自己都合などの一般の離職では、原則として<strong>離職前2年間に被保険者期間が12ヶ月以上</strong>
          必要です。加入期間が1年未満の場合、そもそも受給資格がないことがあります
          （倒産・解雇・雇止めなどでは6ヶ月以上で受給できます）。
        </div>
      )}

      {r.age65OrOver && (
        <div className="note">
          65歳以上で離職した場合は基本手当ではなく<strong>高年齢求職者給付金</strong>
          （基本手当日額の30日分または50日分の一時金）になります。この計算機の対象外です。
        </div>
      )}

      {s && (
        <>
          <h3 style={{ fontSize: '1.05rem', marginTop: 24 }}>いつから振り込まれるか</h3>
          <table>
            <tbody>
              <tr>
                <td style={{ textAlign: 'left' }}>離職日</td>
                <td>{leave ? formatJa(leave) : '—'}</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'left' }}>求職の申込み（受給資格決定日）</td>
                <td>{formatJa(s.applyDate)}</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'left' }}>待期{WAITING_DAYS}日の満了</td>
                <td>{formatJa(s.waitingEndDate)}</td>
              </tr>
              {s.restrictionStartDate && s.restrictionEndDate && (
                <tr>
                  <td style={{ textAlign: 'left' }}>
                    給付制限（{r.restriction.months}ヶ月）
                  </td>
                  <td>
                    {formatJa(s.restrictionStartDate)}〜{formatJa(s.restrictionEndDate)}
                  </td>
                </tr>
              )}
              <tr>
                <td style={{ textAlign: 'left' }}>
                  <strong>基本手当の支給対象になる最初の日</strong>
                </td>
                <td>
                  <strong>{formatJa(s.benefitStartDate)}</strong>
                </td>
              </tr>
              <tr>
                <td style={{ textAlign: 'left' }}>
                  {r.prescribed.days}日分を使い切る日（続けて受けた場合）
                </td>
                <td>{formatJa(s.benefitEndDate)}</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'left' }}>受給期間の満了日（離職日の翌日から1年）</td>
                <td>{formatJa(s.eligibilityEndDate)}</td>
              </tr>
            </tbody>
          </table>

          {!s.fitsInEligibility && (
            <div className="note">
              <strong>受給期間（1年）内に所定給付日数を使い切れません（{s.overflowDays}日分がはみ出します）。</strong>
              受給期間を過ぎると、残っている日数があっても支給は打ち切られます。離職後は早めに
              ハローワークで手続きしてください（病気・出産・育児・介護などで働けない期間がある場合は、
              受給期間を最大3年まで延長できる制度があります）。
            </div>
          )}
        </>
      )}

      <div className="note">
        本計算は目安です。賃金日額は実際には離職票の賃金額から算定され、
        受給資格の有無・離職理由の区分（自己都合か会社都合か）・所定給付日数は
        ハローワークが決定します。正確な金額は「雇用保険受給資格者証」でご確認ください。
      </div>
    </div>
  );
}

/** 0〜120 のような範囲に収める */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** ISO文字列（`toISOString()` の結果）→ `<input type="date">` に渡す 'YYYY-MM-DD' */
function isoOf(iso: string): string {
  return iso.slice(0, 10);
}

/** 同上のn日後 */
function isoAfter(iso: string, days: number): string {
  const parts = parseDate(isoOf(iso));
  return parts ? formatDate(addDays(parts, days)) : isoOf(iso);
}
