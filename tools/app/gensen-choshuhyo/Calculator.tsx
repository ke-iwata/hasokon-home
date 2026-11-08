'use client';

import { useState } from 'react';
import Link from 'next/link';
import { trackToolUse } from '@/lib/analytics';
import {
  MISMATCH_REASON_TEXT,
  REFORM_POINTS,
  TAX_YEAR,
  basicDeductionBandLabel,
  checkGensenChoshuhyo,
  parseYen,
} from '@/lib/gensen-choshuhyo';

const SLUG = 'gensen-choshuhyo';
const yen = (v: number) => `${Math.round(v).toLocaleString('ja-JP')}円`;

/**
 * 源泉徴収票の金額を写す欄。全角数字・カンマ入りの貼り付けを受けるので type="text"。
 * 入力はこの端末の中だけで使い、URL にも載せない
 */
function SlipField({
  label,
  hint,
  value,
  onChange,
  onBlur,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder: string;
}) {
  const invalid = value.trim() !== '' && parseYen(value) === null;
  return (
    <label style={{ fontSize: 'var(--fs-sm)' }}>
      {label}
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
      />
      {invalid && (
        <span style={{ display: 'block', marginTop: 4, fontSize: 'var(--fs-xs)', fontWeight: 600 }}>
          数字で入れてください（カンマ・全角数字はそのままで大丈夫です）
        </span>
      )}
      {hint && (
        <span
          style={{
            display: 'block',
            marginTop: 4,
            color: 'var(--muted)',
            fontWeight: 400,
            fontSize: 'var(--fs-xs)',
          }}
        >
          {hint}
        </span>
      )}
    </label>
  );
}

/** 検算の1行。✓／✗ は色だけでなく記号と文言でも区別する */
function CheckRow({
  ok,
  title,
  formula,
  detail,
}: {
  ok: boolean | null;
  title: string;
  formula: string;
  detail?: string;
}) {
  const mark = ok === null ? '→' : ok ? '✓' : '✗';
  const word = ok === null ? '途中の計算' : ok ? '一致' : '一致しません';
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span aria-hidden="true" style={{ fontWeight: 700, fontSize: '1.1rem' }}>
          {mark}
        </span>
        <strong>{title}</strong>
        <span
          style={{
            fontSize: 'var(--fs-xs)',
            fontWeight: 700,
            padding: '1px 8px',
            borderRadius: 999,
            border: '1px solid var(--border)',
            background: ok === false ? 'var(--accent-soft)' : 'transparent',
          }}
        >
          {word}
        </span>
      </div>
      <div style={{ fontSize: '0.9rem', marginTop: 4, overflowWrap: 'anywhere' }}>{formula}</div>
      {detail && (
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)', marginTop: 4 }}>{detail}</div>
      )}
    </div>
  );
}

export default function Calculator() {
  const [payment, setPayment] = useState('5,000,000');
  const [salaryIncome, setSalaryIncome] = useState('3,560,000');
  const [deductionTotal, setDeductionTotal] = useState('1,760,000');
  const [withheld, setWithheld] = useState('91,800');
  const [housingLoan, setHousingLoan] = useState('');
  const [basic, setBasic] = useState('');
  const [adjustment, setAdjustment] = useState('');
  const [social, setSocial] = useState('');
  const [life, setLife] = useState('');
  const [quake, setQuake] = useState('');
  const [notAdjusted, setNotAdjusted] = useState(false);
  const [otsu, setOtsu] = useState(false);

  const required = [payment, salaryIncome, deductionTotal, withheld].map(parseYen);
  const ready = required.every((v) => v !== null);

  const r = ready
    ? checkGensenChoshuhyo({
        payment: required[0] ?? 0,
        salaryIncome: required[1] ?? 0,
        deductionTotal: required[2] ?? 0,
        withheldTax: required[3] ?? 0,
        housingLoanCredit: parseYen(housingLoan),
        basicDeduction: parseYen(basic),
        adjustmentDeduction: parseYen(adjustment),
        socialInsurance: parseYen(social),
        lifeInsurance: parseYen(life),
        earthquakeInsurance: parseYen(quake),
        notAdjusted,
        otsu,
      })
    : null;

  /** 送るのは「一致したか」と年分だけ。金額は送らない */
  const track = () => {
    if (!r) return;
    if (r.status === 'skipped') trackToolUse(SLUG, 'skip-r8');
    else if (r.allOk) trackToolUse(SLUG, 'check-match-r8');
    else trackToolUse(SLUG, 'check-mismatch-r8');
  };

  const summaryStyle = { cursor: 'pointer', fontSize: 'var(--fs-sm)', fontWeight: 600 } as const;
  const stack = { display: 'grid', gap: 14, marginTop: 12 } as const;

  return (
    <>
      <div className="card">
        <p style={{ fontSize: 'var(--fs-sm)', marginTop: 0 }}>
          {TAX_YEAR.label}の源泉徴収票から、<strong>上の段の4つの数字</strong>
          を左から順に写してください。入力はこの端末の中だけで計算し、どこにも送りません。
        </p>
        <div style={{ display: 'grid', gap: 14 }}>
          <SlipField
            label="① 支払金額"
            hint="左上の欄。賞与・課税される通勤手当を含む1年分の額面"
            value={payment}
            onChange={setPayment}
            placeholder="例：5,000,000"
          />
          <SlipField
            label="② 給与所得控除後の金額（調整控除後）"
            hint="①の右隣"
            value={salaryIncome}
            onChange={setSalaryIncome}
            placeholder="例：3,560,000"
          />
          <SlipField
            label="③ 所得控除の額の合計額"
            hint="②の右隣"
            value={deductionTotal}
            onChange={setDeductionTotal}
            placeholder="例：1,760,000"
          />
          <SlipField
            label="④ 源泉徴収税額"
            hint="右端。0円のこともあります"
            value={withheld}
            onChange={setWithheld}
            onBlur={track}
            placeholder="例：91,800"
          />
        </div>

        <details style={{ marginTop: 16 }}>
          <summary style={summaryStyle}>中段の欄も写す（任意）</summary>
          <div style={stack}>
            <SlipField
              label="住宅借入金等特別控除の額"
              hint="ある人だけ。摘要欄の「住宅借入金等特別控除可能額」ではなく、この欄の額"
              value={housingLoan}
              onChange={setHousingLoan}
              placeholder="空欄なら0円"
            />
            <SlipField
              label="基礎控除の額"
              hint="空欄なら②から令和8年分の額を推定します"
              value={basic}
              onChange={setBasic}
              placeholder="例：1,040,000"
            />
            <SlipField
              label="所得金額調整控除額"
              hint="23歳未満の扶養親族がいる・特別障害者・給与と年金の両方がある、などで額が入ります"
              value={adjustment}
              onChange={setAdjustment}
              placeholder="空欄なら0円"
            />
            <SlipField
              label="社会保険料等の金額"
              value={social}
              onChange={setSocial}
              placeholder="例：720,000"
            />
            <SlipField
              label="生命保険料の控除額"
              value={life}
              onChange={setLife}
              placeholder="空欄なら0円"
            />
            <SlipField
              label="地震保険料の控除額"
              value={quake}
              onChange={setQuake}
              placeholder="空欄なら0円"
            />
          </div>
        </details>

        <details style={{ marginTop: 12 }}>
          <summary style={summaryStyle}>「年調未済」「乙欄」の印がある（任意）</summary>
          <div style={stack}>
            <label style={{ fontSize: 'var(--fs-sm)' }}>
              <input
                type="checkbox"
                checked={notAdjusted}
                onChange={(e) => setNotAdjusted(e.target.checked)}
              />{' '}
              摘要欄に「年調未済」とある（年の途中で退職した、など）
            </label>
            <label style={{ fontSize: 'var(--fs-sm)' }}>
              <input type="checkbox" checked={otsu} onChange={(e) => setOtsu(e.target.checked)} />{' '}
              種別の欄・摘要に「乙」とある（扶養控除等申告書を出していない副業先など）
            </label>
          </div>
        </details>
      </div>

      {!r && (
        <div className="note" style={{ marginTop: 14 }}>
          ①〜④の4つを入れると検算します。
        </div>
      )}

      {r?.status === 'skipped' && (
        <div className="panel" style={{ marginTop: 20 }}>
          <p style={{ marginTop: 0, fontWeight: 700 }}>
            {r.reason === 'otsu'
              ? '乙欄の源泉徴収票は年末調整をしていないので、検算はしません'
              : '年調未済の源泉徴収票は年末調整をしていないので、検算はしません'}
          </p>
          <p>
            この票の源泉徴収税額は、毎月の給与から引かれた額の合計です。1年分の正しい税額とは一致しないのがふつうで、
            <strong>確定申告で精算します</strong>（払いすぎなら還付、足りなければ納付）。
          </p>
          <p style={{ marginBottom: 0 }}>
            <Link href="/kakutei-shinkoku-hantei/">確定申告が必要か 判定ツール</Link>
            で、申告が要るかを確かめてください。
          </p>
        </div>
      )}

      {r?.status === 'checked' && (
        <>
          <div className="panel" style={{ marginTop: 20 }}>
            <p style={{ marginTop: 0, textAlign: 'center', fontWeight: 700 }}>
              {r.allOk
                ? '✓ 2つの検算はどちらも一致しました'
                : '✗ 一致しない欄があります（下の「よくある理由」を見てください）'}
            </p>
            <h3 style={{ fontSize: '1rem', marginBottom: 4 }}>4つの欄の検算</h3>
            <CheckRow
              ok={r.salaryIncome.ok}
              title="① 支払金額 → ② 給与所得控除後の金額"
              formula={
                r.salaryIncome.adjustmentDeduction > 0
                  ? `${yen(required[0] ?? 0)} を「給与所得控除後の給与等の金額の表」で引くと ${yen(r.salaryIncome.expected + r.salaryIncome.adjustmentDeduction)}、所得金額調整控除 ${yen(r.salaryIncome.adjustmentDeduction)} を引いて ${yen(r.salaryIncome.expected)}（票は ${yen(r.salaryIncome.actual ?? 0)}）`
                  : `${yen(required[0] ?? 0)} を「給与所得控除後の給与等の金額の表」で引くと ${yen(r.salaryIncome.expected)}（票は ${yen(r.salaryIncome.actual ?? 0)}）`
              }
              detail={
                r.salaryIncome.ok
                  ? '660万円未満は4,000円刻みの表、660万円以上は式で求めます'
                  : '子育て・特別障害者、給与と年金の両方がある人は「所得金額調整控除」で表より小さくなります。票の中段「所得金額調整控除額」の欄を見て、上の任意の欄に入れてください'
              }
            />
            <CheckRow
              ok={null}
              title="② − ③ ＝ 課税給与所得金額"
              formula={`${yen(r.salaryIncome.actual ?? 0)} − ${yen(required[2] ?? 0)} ＝ ${yen(r.taxableIncome.expected)}（1,000円未満切捨て）`}
              detail="この額は票には書かれていません。次の年税額の計算に使います"
            />
            <CheckRow
              ok={r.yearTax.ok}
              title="年税額 → ④ 源泉徴収税額"
              formula={
                r.housingLoanCredit > 0
                  ? `速算表で ${yen(r.calculatedTax)} − 住宅ローン控除 ${yen(r.housingLoanCredit)} ＝ ${yen(r.adjustedTax)}、× 102.1% → 100円未満切捨てで ${yen(r.yearTax.expected)}（票は ${yen(r.yearTax.actual ?? 0)}）`
                  : `速算表で ${yen(r.calculatedTax)}、× 102.1% → 100円未満切捨てで ${yen(r.yearTax.expected)}（票は ${yen(r.yearTax.actual ?? 0)}）`
              }
              detail={
                r.yearTax.expected === 0 && r.yearTax.ok
                  ? '課税給与所得金額が0円（または住宅ローン控除で引ききった）ので、源泉徴収税額は0円で合っています'
                  : '102.1% のうち 2.1% は復興特別所得税です'
              }
            />

            {!r.allOk && (
              <div className="note" style={{ marginTop: 14 }}>
                <strong>一致しないときのよくある理由</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: '1.2em' }}>
                  {r.reasons.map((k) => (
                    <li key={k} style={{ marginBottom: 4 }}>
                      {MISMATCH_REASON_TEXT[k]}
                    </li>
                  ))}
                </ul>
                <p style={{ margin: '8px 0 0' }}>
                  写し間違いがないかも確かめてください。それでも合わないときは、勤務先の給与の担当に「どの数字で年末調整したか」を確かめるのが確実です。
                </p>
              </div>
            )}
          </div>

          <div className="panel" style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: '1rem', marginTop: 0 }}>各欄の意味（あなたの数字で）</h3>
            <ul style={{ margin: 0, paddingLeft: '1.2em', fontSize: '0.9rem' }}>
              <li>
                支払金額 {yen(required[0] ?? 0)}
                は、1年間に支払われた給与・賞与の額面の合計です（非課税の通勤手当は含みません）。
              </li>
              <li>
                給与所得控除後の金額 {yen(r.salaryIncome.actual ?? 0)}
                は、額面から「会社員の必要経費」にあたる給与所得控除を引いた額で、給与だけの人はこれが合計所得金額です。
              </li>
              <li>
                所得控除の額の合計額 {yen(required[2] ?? 0)} のうち、基礎控除は{' '}
                {yen(r.breakdown.basicDeduction)}
                {r.breakdown.basicDeductionEstimated
                  ? `（${TAX_YEAR.label}・${basicDeductionBandLabel(r.salaryIncome.actual ?? 0)}として推定）`
                  : '（票の額）'}
                です。
                {r.breakdown.socialInsurance !== null &&
                  ` 社会保険料等は ${yen(r.breakdown.socialInsurance)}。`}
                {r.breakdown.lifeInsurance !== null &&
                  ` 生命保険料控除は ${yen(r.breakdown.lifeInsurance)}。`}
                {r.breakdown.earthquakeInsurance !== null &&
                  ` 地震保険料控除は ${yen(r.breakdown.earthquakeInsurance)}。`}
                {r.breakdown.others > 0 &&
                  ` 残りの ${yen(r.breakdown.others)} は${
                    r.breakdown.socialInsurance === null ? '社会保険料・' : ''
                  }配偶者・扶養・iDeCo などの控除です。`}
                {r.breakdown.others < 0 &&
                  ' 内訳の合計が所得控除の額の合計額を超えています。写した数字をもう一度確かめてください。'}
              </li>
              <li>
                源泉徴収税額 {yen(r.yearTax.actual ?? 0)}
                は、年末調整で精算したあとの1年分の所得税（復興特別所得税を含む）です。毎月引かれた額の合計ではありません。
              </li>
            </ul>
          </div>

          <div className="panel" style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: '1rem', marginTop: 0 }}>{TAX_YEAR.label}で変わったところ</h3>
            <p style={{ fontSize: '0.9rem' }}>
              基礎控除が {yen(REFORM_POINTS.basicDeductionBefore)}（本則）→ 最大{' '}
              {yen(REFORM_POINTS.basicDeductionAfterMax)}、給与所得控除の最低保障額が{' '}
              {yen(REFORM_POINTS.salaryDeductionMinBefore)} → {yen(REFORM_POINTS.salaryDeductionMinAfter)}
              に上がりました。
            </p>
            <p style={{ fontSize: '0.9rem', marginBottom: 0 }}>
              {r.previous.difference > 0
                ? `${TAX_YEAR.previousLabel}の制度なら 約 ${yen(r.previous.difference)} 多かった計算です`
                : r.previous.difference < 0
                  ? `${TAX_YEAR.previousLabel}の制度のほうが 約 ${yen(-r.previous.difference)} 少ない計算です`
                  : `${TAX_YEAR.previousLabel}の制度でも税額は変わらない計算です`}
              （基礎控除と給与所得控除だけを差し替えた<strong>概算</strong>
              。{TAX_YEAR.previousLabel}の制度での年税額 {yen(r.previous.yearTax)}）。
            </p>
          </div>

          <div className="panel" style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: '1rem', marginTop: 0 }}>この数字を持って次へ</h3>
            {r.recommendKakutei && (
              <p style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                給与が2,000万円を超えると年末調整の対象外で、確定申告が必要です。
              </p>
            )}
            <ul style={{ margin: 0, paddingLeft: '1.2em', fontSize: '0.9rem' }}>
              <li>
                <Link href="/furusato-nozei/">ふるさと納税 控除額計算機</Link>
                ：支払金額を入れると、寄附の上限の目安が出ます
              </li>
              <li>
                <Link href="/kakutei-shinkoku-hantei/">確定申告が必要か 判定ツール</Link>
                ：副業・2か所以上の給与・年の途中の退職がある人
              </li>
              <li>
                <Link href="/iryohi-kojo/">医療費控除・セルフメディケーション税制 計算機</Link>
                ：医療費控除は源泉徴収票の所得控除に入っていません（確定申告で受けます）
              </li>
            </ul>
            <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)', marginBottom: 0 }}>
              数字は引き継がれません（入力した金額を URL に載せないため）。行き先でもう一度入れてください。
            </p>
          </div>
        </>
      )}
    </>
  );
}
