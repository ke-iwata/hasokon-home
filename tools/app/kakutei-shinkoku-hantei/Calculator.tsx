'use client';

import { useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import {
  EMPTY_REFUND,
  NO_KINDS,
  REFUND_HINT_TOOL,
  filingDeadline,
  filingStart,
  isRequiredReason,
  judge,
  refundDeadline,
  refundStart,
  type IncomeKinds,
  type RefundChecks,
} from '@/lib/kakutei-shinkoku-hantei';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';
import { HINT_TEXT, HINT_TOOL_LABEL, Meyasu, NOTE_TEXT, OUT_OF_SCOPE, REASON_TEXT, jaDate } from './text';

const KIND_OPTIONS: { key: keyof IncomeKinds; label: string }[] = [
  { key: 'salary', label: '会社員・パートの給与' },
  { key: 'pension', label: '公的年金' },
  { key: 'business', label: '事業・フリーランス' },
  { key: 'realEstate', label: '不動産' },
  { key: 'side', label: '副業（雑所得・アフィリエイト等）' },
  { key: 'stocks', label: '株・投資信託' },
];

const REFUND_OPTIONS: { key: keyof RefundChecks; label: string }[] = [
  { key: 'medical', label: '医療費が10万円（または総所得金額等の5%）を超えた' },
  { key: 'selfMedication', label: 'セルフメディケーション税制を使いたい' },
  { key: 'furusato', label: 'ふるさと納税：6団体以上に寄附した・またはワンストップ特例の申請を出していない' },
  { key: 'onestopApplied', label: 'ふるさと納税：ワンストップ特例の申請書を出した寄附がある' },
  { key: 'housingLoanFirst', label: '住宅ローン控除の1年目' },
  { key: 'retirementNoDeclaration', label: '退職金で「退職所得の受給に関する申告書」を出していない' },
  { key: 'disaster', label: '災害・盗難にあった' },
];

/** 行全体をタップできるチェック（<label> で入力と文言を包む） */
const checkRow = {
  fontWeight: 400,
  display: 'flex',
  gap: 8,
  alignItems: 'flex-start',
  padding: '8px 0',
  minHeight: 44,
  boxSizing: 'border-box' as const,
};
const checkBox = { width: 'auto', marginTop: 4, flexShrink: 0 };

/** '400' → 4,000,000（万円で入れる） */
const man = (s: string) => Math.max(0, Number(s) || 0) * 10_000;

const ANSWER_LABEL = {
  required: '必要です',
  notRequired: '不要です',
  notRequiredButRefund: '不要です（ただし申告すると戻る可能性があります）',
} as const;

const RESIDENT_LABEL = {
  required: '必要です',
  notRequired: '不要です',
  unknown: 'お住まいの市区町村に確認してください',
} as const;

export default function Calculator() {
  const [kinds, setKinds] = useState<IncomeKinds>(NO_KINDS);
  const [none, setNone] = useState(false);
  const [twoOrMore, setTwoOrMore] = useState(false);
  const [adjusted, setAdjusted] = useState(true);
  const [salaryMain, setSalaryMain] = useState('400');
  const [salarySub, setSalarySub] = useState('30');
  const [pension, setPension] = useState('200');
  const [over65, setOver65] = useState(true);
  const [unwithheld, setUnwithheld] = useState(false);
  const [other, setOther] = useState('0');
  const [refund, setRefund] = useState<RefundChecks>(EMPTY_REFUND);
  const [tracked, setTracked] = useState(false);

  const anyKind = Object.values(kinds).some(Boolean);
  const hasOther = kinds.business || kinds.realEstate || kinds.side || kinds.stocks;
  const answered = anyKind || none;

  const toggleKind = (key: keyof IncomeKinds, on: boolean) => {
    setKinds((k) => ({ ...k, [key]: on }));
    if (on) setNone(false);
    if (!tracked) {
      trackToolUse('kakutei-shinkoku-hantei', 'judge');
      setTracked(true);
    }
  };

  const r = judge({
    kinds: none ? NO_KINDS : kinds,
    salaryTwoOrMore: twoOrMore,
    yearEndAdjusted: adjusted,
    salaryMain: man(salaryMain),
    salarySub: man(salarySub),
    pensionAnnual: man(pension),
    over65,
    unwithheldPension: unwithheld,
    otherIncome: man(other),
    refund,
  });
  // 「要る」なら要る側の行だけ。「不要」なら全部（要る側の行が残るのは、所得税額が出ず no-tax-due で外れたときだけ）
  const shownReasons = r.incomeTax === 'required' ? r.reasons.filter(isRequiredReason) : r.reasons;

  return (
    <div className="card">
      <fieldset style={{ border: 0, padding: 0, margin: '0 0 14px' }}>
        <legend style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', marginBottom: 4 }}>
          1. 2026年の収入の種類（いくつでも）
        </legend>
        {KIND_OPTIONS.map((o) => (
          <label key={o.key} style={checkRow}>
            <input
              type="checkbox"
              checked={!none && kinds[o.key]}
              onChange={(e) => toggleKind(o.key, e.target.checked)}
              style={checkBox}
            />
            {o.label}
          </label>
        ))}
        <label style={checkRow}>
          <input
            type="checkbox"
            checked={none}
            onChange={(e) => {
              setNone(e.target.checked);
              if (e.target.checked) setKinds(NO_KINDS);
            }}
            style={checkBox}
          />
          なし
        </label>
      </fieldset>

      {!none && kinds.salary && (
        <fieldset style={{ border: 0, padding: 0, margin: '0 0 14px' }}>
          <legend style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', marginBottom: 4 }}>2. 給与</legend>
          <div className="field">
            <label>
              何か所から
              <select value={twoOrMore ? '2' : '1'} onChange={(e) => setTwoOrMore(e.target.value === '2')}>
                <option value="1">1か所（年の途中の転職で、前の勤務先の分も年末調整されたものを含む）</option>
                <option value="2">2か所以上（掛け持ち）</option>
              </select>
            </label>
          </div>
          <div className="field">
            <label>
              年末調整
              <select value={adjusted ? 'yes' : 'no'} onChange={(e) => setAdjusted(e.target.value === 'yes')}>
                <option value="yes">受けた</option>
                <option value="no">受けていない（年の途中で退職して再就職していない）</option>
              </select>
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              {twoOrMore ? '年末調整を受けた勤務先の年収（万円）' : '給与の年収（額面・万円）'}
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={salaryMain}
                onChange={(e) => setSalaryMain(e.target.value)}
              />
            </label>
            {twoOrMore && (
              <label className="field">
                年末調整されなかった給与の年収（万円）
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={salarySub}
                  onChange={(e) => setSalarySub(e.target.value)}
                />
              </label>
            )}
          </div>
        </fieldset>
      )}

      {!none && kinds.pension && (
        <fieldset style={{ border: 0, padding: 0, margin: '0 0 14px' }}>
          <legend style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', marginBottom: 4 }}>3. 公的年金</legend>
          <div className="field-row">
            <label className="field">
              公的年金等の収入（年額・万円）
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={pension}
                onChange={(e) => setPension(e.target.value)}
              />
            </label>
            <label className="field">
              12月31日の年齢
              <select value={over65 ? '65' : '64'} onChange={(e) => setOver65(e.target.value === '65')}>
                <option value="65">65歳以上</option>
                <option value="64">65歳未満</option>
              </select>
            </label>
          </div>
          <label style={checkRow}>
            <input
              type="checkbox"
              checked={unwithheld}
              onChange={(e) => setUnwithheld(e.target.checked)}
              style={checkBox}
            />
            源泉徴収されていない年金（外国の年金など）がある
          </label>
        </fieldset>
      )}

      {!none && hasOther && (
        <fieldset style={{ border: 0, padding: 0, margin: '0 0 14px' }}>
          <legend style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', marginBottom: 4 }}>
            4. 給与・年金以外の所得
          </legend>
          <label className="field">
            所得の合計（万円）
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={0.1}
              value={other}
              onChange={(e) => setOther(e.target.value)}
            />
          </label>
          <p className="hint" style={{ margin: 0 }}>
            収入 − 経費 ＝ 所得。売上や振込額そのものではありません。特定口座（源泉徴収あり）の利益は、申告しないなら数えません。
          </p>
        </fieldset>
      )}

      {answered && (
        <fieldset style={{ border: 0, padding: 0, margin: '0 0 14px' }}>
          <legend style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', marginBottom: 4 }}>
            5. 戻るかもしれないもの（当てはまれば）
          </legend>
          {REFUND_OPTIONS.map((o) => (
            <label key={o.key} style={checkRow}>
              <input
                type="checkbox"
                checked={refund[o.key]}
                onChange={(e) => setRefund((x) => ({ ...x, [o.key]: e.target.checked }))}
                style={checkBox}
              />
              {o.label}
            </label>
          ))}
        </fieldset>
      )}

      {answered && (
        <div aria-live="polite">
          <div className={r.incomeTax === 'required' ? 'panel' : 'panel quiet'}>
            <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)' }}>所得税の確定申告</div>
            <div className="metric">
              <span className="value" style={{ fontSize: 'clamp(1.15rem, 5.4vw, 1.6rem)' }}>
                {ANSWER_LABEL[r.incomeTax]}
              </span>
            </div>
            {shownReasons.map((x) => (
              <p key={x} style={{ margin: '6px 0 0', fontSize: 'var(--fs-sm)' }}>
                {REASON_TEXT[x]}
              </p>
            ))}
            {r.incomeTax === 'required' && (
              <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-sm)' }}>
                期限：<strong>{jaDate(filingDeadline())}</strong>まで（受付は{jaDate(filingStart())}から）
              </p>
            )}
            {r.notes.includes('two-salaries-gross') && (
              <p className="hint" style={{ margin: '6px 0 0' }}>
                {NOTE_TEXT['two-salaries-gross']}
              </p>
            )}
            <Meyasu />
          </div>

          <div className="panel quiet">
            <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)' }}>還付申告</div>
            {r.refundHints.length === 0 ? (
              <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-sm)' }}>
                5. のチェックに当てはまるものが無いので、還付申告の候補は見つかりませんでした。
              </p>
            ) : (
              <>
                <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-sm)' }}>
                  {r.incomeTax === 'required'
                    ? '確定申告書に一緒に書くと、税金が戻る（または減る）可能性があります。'
                    : '申告の義務はありませんが、申告すると戻る可能性があります。'}
                  出せる期間：<strong>{jaDate(refundStart())}〜{jaDate(refundDeadline())}</strong>
                </p>
                <ul style={{ margin: '6px 0 0', paddingLeft: '1.2em', fontSize: 'var(--fs-sm)' }}>
                  {r.refundHints.map((h) => {
                    const slug = REFUND_HINT_TOOL[h];
                    const label = HINT_TOOL_LABEL[h];
                    return (
                      <li key={h}>
                        {HINT_TEXT[h]}
                        {slug && label && (
                          <PublicToolLink slug={slug}>
                            {' → '}
                            <ToolLink slug={slug}>{label}</ToolLink>
                          </PublicToolLink>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {r.notes.includes('refund-include-other-income') && (
              <p className="note" style={{ margin: '8px 0 0' }}>
                {NOTE_TEXT['refund-include-other-income']}
              </p>
            )}
            {r.notes.includes('onestop-invalid') && (
              <p className="note" role="alert" style={{ margin: '8px 0 0' }}>
                {NOTE_TEXT['onestop-invalid']}
              </p>
            )}
            <Meyasu />
          </div>

          <div className="panel quiet">
            <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)' }}>住民税の申告</div>
            {r.incomeTax === 'required' ? (
              <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-sm)' }}>
                所得税の確定申告をすれば、その内容が市区町村に回るので、住民税の申告は別に要りません。
              </p>
            ) : (
              <>
                <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-sm)' }}>
                  所得税の確定申告（還付申告を含む）をしない場合：<strong>{RESIDENT_LABEL[r.residentTax]}</strong>
                </p>
                {r.residentTax === 'required' && (
                  <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-sm)' }}>
                    所得税の「20万円以下なら申告不要」は住民税にはありません。お住まいの市区町村へ、
                    {jaDate(filingDeadline())}までに申告してください。
                  </p>
                )}
                {r.residentTax === 'unknown' && (
                  <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-sm)' }}>
                    住民税の基礎控除（43万円）以下なので税額は出ない見込みですが、国民健康保険料の計算や非課税証明のために申告を求める市区町村があります。
                  </p>
                )}
                {r.notes.includes('pension-resident-deductions') && (
                  <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-sm)' }}>
                    {NOTE_TEXT['pension-resident-deductions']}
                  </p>
                )}
              </>
            )}
            <Meyasu />
          </div>

          <p className="hint" style={{ marginTop: 10 }}>
            {OUT_OF_SCOPE}
          </p>
        </div>
      )}
    </div>
  );
}
