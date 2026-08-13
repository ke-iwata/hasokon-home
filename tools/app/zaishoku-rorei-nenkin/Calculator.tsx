'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  DEFAULT_FISCAL_YEAR,
  FISCAL_YEARS,
  PENSION_STANDARD_MAX,
  THRESHOLD_BEFORE_REFORM,
  calcZaishoku,
  standardMonthlyFromSalary,
} from '@/lib/zaishoku-rorei-nenkin';

const yen = (v: number) => `${Math.round(v).toLocaleString('ja-JP')}円`;
/** 円 → 「65万円」。基準額のような区切りのいい額は万円で見せる */
const man = (v: number) => `${(Math.round(v / 1000) / 10).toLocaleString('ja-JP')}万円`;

export default function Calculator() {
  // 既定値は日本年金機構の計算例（基本月額10万円・総報酬月額相当額46万円）に寄せている。
  // 月給46万円は等級表で標準報酬月額47万円に丸まるので数字はぴったり同じにならないが、
  // 開いた瞬間に「改正前なら止まっていたが、いまは全額支給」が出る水準にはなる
  const [pensionYearly, setPensionYearly] = useState('1200000');
  const [salaryMode, setSalaryMode] = useState<'salary' | 'standard'>('salary');
  const [salary, setSalary] = useState('460000');
  const [standard, setStandard] = useState('460000');
  const [bonus, setBonus] = useState('0');
  const [fiscalYear, setFiscalYear] = useState(DEFAULT_FISCAL_YEAR);
  const [basicPension, setBasicPension] = useState('');
  const [kakyu, setKakyu] = useState('');

  const standardMonthly =
    salaryMode === 'salary'
      ? standardMonthlyFromSalary(Number(salary) || 0)
      : Math.max(0, Number(standard) || 0);

  const r = calcZaishoku({
    pensionYearly: Number(pensionYearly) || 0,
    standardMonthly,
    bonusYearly: Number(bonus) || 0,
    fiscalYear,
    basicPensionYearly: Number(basicPension) || 0,
    kakyuYearly: Number(kakyu) || 0,
  });

  const stopped = r.suspendedMonthly > 0;

  return (
    <div className="card">
      <div style={{ display: 'grid', gap: 14 }}>
        <label>
          老齢厚生年金（報酬比例部分）の年額（円）
          <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
            ねんきん定期便・ねんきんネットの額。<strong>加給年金額と老齢基礎年金は含めない</strong>
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={10000}
            value={pensionYearly}
            onChange={(e) => setPensionYearly(e.target.value)}
          />
        </label>

        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>毎月の賃金</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 'var(--fs-sm)' }}>
            <label style={{ fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="radio"
                name="salary-mode"
                checked={salaryMode === 'salary'}
                onChange={() => setSalaryMode('salary')}
                style={{ width: 'auto' }}
              />
              月給から自動で判定する
            </label>
            <label style={{ fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="radio"
                name="salary-mode"
                checked={salaryMode === 'standard'}
                onChange={() => setSalaryMode('standard')}
                style={{ width: 'auto' }}
              />
              標準報酬月額を直接入れる
            </label>
          </div>
          {salaryMode === 'salary' ? (
            <>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={10000}
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                style={{ marginTop: 8 }}
              />
              <p className="hint" style={{ marginTop: 6 }}>
                月給（額面）を入れると、厚生年金の等級表（1〜32等級）で標準報酬月額
                {yen(standardMonthly)} に丸めます。
              </p>
            </>
          ) : (
            <>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={10000}
                value={standard}
                onChange={(e) => setStandard(e.target.value)}
                style={{ marginTop: 8 }}
              />
              <p className="hint" style={{ marginTop: 6 }}>
                給与明細・標準報酬決定通知書に書かれている額をそのまま入れてください。
              </p>
            </>
          )}
        </div>

        <label>
          直近1年間の賞与の合計（標準賞与額・円）
          <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
            12で割って総報酬月額相当額に足します。賞与が無ければ0
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={10000}
            value={bonus}
            onChange={(e) => setBonus(e.target.value)}
          />
        </label>

        <label>
          計算する年度
          <select value={fiscalYear} onChange={(e) => setFiscalYear(Number(e.target.value))}>
            {FISCAL_YEARS.map((f) => (
              <option key={f.year} value={f.year}>
                {f.label}：基準額 {man(f.threshold)}
              </option>
            ))}
          </select>
        </label>

        <label>
          老齢基礎年金の年額（円・任意）
          <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
            経過的加算額を含む。<strong>在職による支給停止の対象外</strong>で、常に全額もらえます
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={10000}
            placeholder="未入力なら受取総額に含めません"
            value={basicPension}
            onChange={(e) => setBasicPension(e.target.value)}
          />
        </label>

        <label>
          加給年金額の年額（円・任意）
          <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
            基本月額には含めませんが、<strong>全部支給停止のときは加給年金額も止まります</strong>
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={10000}
            placeholder="対象の配偶者・子がいなければ空欄"
            value={kakyu}
            onChange={(e) => setKakyu(e.target.value)}
          />
        </label>
      </div>

      <div className="panel" style={{ marginTop: 18, textAlign: 'center' }}>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
          調整後の老齢厚生年金（月額）
        </div>
        {/* 全部支給停止のときにアクセント色（緑）で0円を出すと good news に見えるので色を分ける */}
        <div
          style={{
            fontSize: 'var(--fs-xl)',
            fontWeight: 800,
            color: r.fullySuspended ? '#b45309' : 'var(--accent)',
          }}
        >
          {yen(r.payableMonthly)}
        </div>
        <div style={{ fontSize: 'var(--fs-sm)', color: stopped ? '#b45309' : 'var(--muted)' }}>
          {r.fullySuspended
            ? `全部支給停止（${yen(r.suspendedMonthly)} が止まります）`
            : stopped
              ? `${yen(r.suspendedMonthly)} が支給停止されます`
              : `全額支給されます（基準額 ${man(r.threshold)} まであと ${yen(r.headroom)}）`}
        </div>
      </div>

      {!stopped && (
        <div className="note" style={{ lineHeight: 1.7 }}>
          いまは<strong>1円も止まっていません</strong>。総報酬月額相当額（毎月の賃金＋賞与÷12）を
          あと <strong>{yen(r.headroom)}</strong>{' '}
          増やすと、そこから先は増えた額の半分ずつ年金が止まり始めます。
          {r.standardMonthlyCapped && (
            <>
              {' '}
              なお標準報酬月額は厚生年金の上限（{yen(PENSION_STANDARD_MAX)}
              ・32等級）に達しているため、月給を上げても総報酬月額相当額は増えません（賞与では増えます）。
            </>
          )}
        </div>
      )}

      <h3 style={{ marginTop: 22 }}>計算の内訳</h3>
      <table>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>基本月額（年金の年額 ÷ 12）</td>
            <td>{yen(r.basicMonthly)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>総報酬月額相当額（標準報酬月額 ＋ 賞与 ÷ 12）</td>
            <td>{yen(r.totalRemunerationMonthly)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>合計</td>
            <td>
              <strong>{yen(r.combined)}</strong>
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>支給停止調整額（基準額）</td>
            <td>{yen(r.threshold)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>支給停止額（超過分の半分）</td>
            <td>{stopped ? `− ${yen(r.suspendedMonthly)}` : '0円'}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>＝ 老齢厚生年金の支給月額</td>
            <td>
              <strong>{yen(r.payableMonthly)}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ marginTop: 22 }}>改正前（基準額 {man(THRESHOLD_BEFORE_REFORM)}）との比較</h3>
      {r.threshold === THRESHOLD_BEFORE_REFORM ? (
        <div className="note" style={{ lineHeight: 1.7 }}>
          いまは改正前（令和7年度以前）の基準額で計算しています。年度を
          <strong>令和8年度</strong>に切り替えると、基準額が{man(THRESHOLD_BEFORE_REFORM)}から
          {man(650_000)}に上がった効果が金額で出ます。
        </div>
      ) : (
        <>
          <table>
            <tbody>
              <tr>
                <td style={{ textAlign: 'left' }}>改正前（{man(THRESHOLD_BEFORE_REFORM)}）の支給停止額</td>
                <td>{yen(r.beforeReform.suspendedMonthly)}</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'left' }}>改正後（{man(r.threshold)}）の支給停止額</td>
                <td>{yen(r.suspendedMonthly)}</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'left' }}>改正で増える年金（月額）</td>
                <td>
                  <strong>{r.reformGainMonthly > 0 ? `＋${yen(r.reformGainMonthly)}` : '0円'}</strong>
                </td>
              </tr>
              <tr>
                <td style={{ textAlign: 'left' }}>同・年額</td>
                <td>{r.reformGainYearly > 0 ? `＋${yen(r.reformGainYearly)}` : '0円'}</td>
              </tr>
            </tbody>
          </table>
          <p className="hint" style={{ marginTop: 8 }}>
            {r.reformGainMonthly > 0
              ? `改正前なら ${yen(r.beforeReform.suspendedMonthly)} 止まっていましたが、いまは ${
                  stopped ? `${yen(r.suspendedMonthly)} で済みます` : '1円も止まりません'
                }。`
              : '改正前の基準額でも支給停止にならない水準のため、改正による差は出ません。'}
          </p>
        </>
      )}

      <h3 style={{ marginTop: 22 }}>実際に受け取る年金の合計（月額）</h3>
      <table>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>老齢厚生年金（調整後）</td>
            <td>{yen(r.payableMonthly)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>加給年金</td>
            <td>
              {yen(r.kakyuMonthly)}
              {r.fullySuspended && Number(kakyu) > 0 && (
                <span style={{ fontSize: 'var(--fs-xs)', color: '#b45309', display: 'block' }}>
                  全部支給停止のため加給年金も止まります
                </span>
              )}
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>老齢基礎年金（調整の対象外）</td>
            <td>{yen(r.basicPensionMonthly)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>＝ 受取合計</td>
            <td>
              <strong>{yen(r.totalReceivedMonthly)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="hint" style={{ marginTop: 8 }}>
        止まるのは<strong>老齢厚生年金（報酬比例部分）だけ</strong>です。老齢基礎年金と経過的加算額は
        在職による支給停止の対象外で、働いていても全額受け取れます。
      </p>

      <div className="note">
        本計算は目安です。厚生年金基金の加入期間がある場合は代行部分を国が支払うべき年金額とみなして基本月額を算出するため、結果が変わります。共済組合等からも老齢厚生年金を受け取っている場合は、すべての老齢厚生年金を合わせた額で判定され、支給停止の総額がそれぞれの年金額に応じて割り振られます（本ツールは単一の年金を前提にしています）。正確な金額は年金事務所・ねんきんダイヤルにご確認ください。関連する計算は{' '}
        <Link href="/hatarakizon/">社会保険 損得計算機</Link> でも確認できます。
      </div>
    </div>
  );
}
