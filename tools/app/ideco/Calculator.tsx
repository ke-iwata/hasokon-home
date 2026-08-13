'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CONTRIBUTION_UNIT,
  JOIN_AGE_LIMIT_AFTER,
  JOIN_AGE_LIMIT_BEFORE,
  MIN_CONTRIBUTION,
  REFORM_FIRST_CONTRIBUTION,
  calcIdeco,
  type CorporatePension,
  type IncomeMode,
  type InsuredType,
} from '@/lib/ideco';

const yen = (v: number) => `${Math.round(v).toLocaleString('ja-JP')}円`;
/** 円 → 「6.2万円」。制度上の区切りのいい額は万円で見せる */
const man = (v: number) => `${(Math.round(v / 100) / 100).toLocaleString('ja-JP')}万円`;

const INSURED: { value: InsuredType; label: string }[] = [
  { value: 'type2', label: '第2号（会社員・公務員）' },
  { value: 'type1', label: '第1号（自営業・フリーランス・学生）' },
  { value: 'type3', label: '第3号（第2号に扶養されている配偶者）' },
];

const PENSIONS: { value: CorporatePension; label: string }[] = [
  { value: 'none', label: '企業年金なし' },
  { value: 'dc', label: '企業型DC（企業型確定拠出年金）' },
  { value: 'db', label: 'DB等（確定給付企業年金・厚生年金基金・公務員の年金払い退職給付）' },
  { value: 'both', label: '企業型DCとDB等の両方' },
];

/**
 * @param buildDate ビルド時刻（ISO文字列）。静的書き出しなので、サーバ描画と
 *   ハイドレーション直後はこの固定値で判定し、マウント後に「画面を開いた日」で
 *   評価し直す。こうしないと、8月にビルドしたHTMLを12月に開いたときに
 *   「いまは改正前」と表示されたままになる（lib/nenshu-kabe.ts と同じ理由）。
 */
export default function Calculator({ buildDate }: { buildDate: string }) {
  const [insured, setInsured] = useState<InsuredType>('type2');
  const [pension, setPension] = useState<CorporatePension>('none');
  const [employer, setEmployer] = useState('20000');
  const [fund, setFund] = useState('0');
  const [age, setAge] = useState('40');
  const [incomeMode, setIncomeMode] = useState<IncomeMode>('salary');
  const [income, setIncome] = useState('5000000');
  const [taxable, setTaxable] = useState('3000000');
  const [socialInsurance, setSocialInsurance] = useState('');
  const [kaigo, setKaigo] = useState(false);
  /** null は「限度額いっぱい」。スライダーを動かすと金額が入る */
  const [contribution, setContribution] = useState<number | null>(null);
  const [asOf, setAsOf] = useState(() => new Date(buildDate));

  useEffect(() => {
    setAsOf(new Date());
  }, []);

  const showPension = insured === 'type2';
  const showEmployer = showPension && pension !== 'none';
  const showFund = insured === 'type1';

  const r = calcIdeco({
    insured,
    pension,
    employerContribution: showEmployer ? Number(employer) || 0 : 0,
    nationalPensionFund: showFund ? Number(fund) || 0 : 0,
    age: Number(age) || 0,
    incomeMode,
    income: Number(income) || 0,
    taxableIncome: Number(taxable) || 0,
    socialInsurance: socialInsurance === '' ? null : Number(socialInsurance) || 0,
    kaigo,
    contributionMonthly: contribution,
    asOf,
  });

  return (
    <div className="card">
      <div style={{ display: 'grid', gap: 14 }}>
        <label>
          国民年金の被保険者区分
          <select
            value={insured}
            onChange={(e) => {
              setInsured(e.target.value as InsuredType);
              setContribution(null);
            }}
          >
            {INSURED.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        {showPension && (
          <label>
            勤め先の企業年金
            <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
              分からないときは勤め先の総務・人事に確認してください。公務員は「DB等」に当たります
            </span>
            <select
              value={pension}
              onChange={(e) => {
                setPension(e.target.value as CorporatePension);
                setContribution(null);
              }}
            >
              {PENSIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {showEmployer && (
          <label>
            事業主掛金・他制度掛金相当額の合計（月額・円）
            <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
              <strong>この額が改正後のiDeCoの上限を決めます。</strong>
              企業型DCの事業主掛金とDB等の他制度掛金相当額の合計で、勤め先から通知されます
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              value={employer}
              onChange={(e) => {
                setEmployer(e.target.value);
                setContribution(null);
              }}
            />
          </label>
        )}

        {showFund && (
          <label>
            国民年金基金の掛金・付加保険料の合計（月額・円）
            <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
              iDeCoと合算した枠なので、この額だけiDeCoの上限が下がります。無ければ0
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              value={fund}
              onChange={(e) => {
                setFund(e.target.value);
                setContribution(null);
              }}
            />
          </label>
        )}

        <label>
          年齢（歳）
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step={1}
            value={age}
            onChange={(e) => setAge(e.target.value)}
          />
        </label>

        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>節税額を出すための所得</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 'var(--fs-sm)' }}>
            <label style={{ fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="radio"
                name="income-mode"
                checked={incomeMode === 'salary'}
                onChange={() => setIncomeMode('salary')}
                style={{ width: 'auto' }}
              />
              年収から概算する
            </label>
            <label style={{ fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="radio"
                name="income-mode"
                checked={incomeMode === 'taxable'}
                onChange={() => setIncomeMode('taxable')}
                style={{ width: 'auto' }}
              />
              課税所得を直接入れる
            </label>
          </div>

          {incomeMode === 'salary' ? (
            <>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={100000}
                value={income}
                onChange={(e) => setIncome(e.target.value)}
                style={{ marginTop: 8 }}
              />
              <p className="hint" style={{ marginTop: 6 }}>
                給与収入（額面・年間）。給与所得控除・社会保険料・基礎控除だけを引いた概算です。
                扶養控除・生命保険料控除などがある方は「課税所得を直接入れる」を選んでください。
              </p>
              <label style={{ marginTop: 8, display: 'block' }}>
                社会保険料の年間合計（円・任意）
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={10000}
                  placeholder={`未入力なら年収から概算（${yen(r.saving.socialInsurance)}）`}
                  value={socialInsurance}
                  onChange={(e) => setSocialInsurance(e.target.value)}
                />
              </label>
              {socialInsurance === '' && (
                <label
                  style={{
                    fontWeight: 400,
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center',
                    marginTop: 8,
                    fontSize: 'var(--fs-sm)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={kaigo}
                    onChange={(e) => setKaigo(e.target.checked)}
                    style={{ width: 'auto' }}
                  />
                  40〜64歳（介護保険料がかかる）
                </label>
              )}
            </>
          ) : (
            <>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={100000}
                value={taxable}
                onChange={(e) => setTaxable(e.target.value)}
                style={{ marginTop: 8 }}
              />
              <p className="hint" style={{ marginTop: 6 }}>
                所得税の課税総所得金額（源泉徴収票の「給与所得控除後の金額」から
                「所得控除の額の合計額」を引いた額）。住民税の課税所得も同じ額として計算します
                （住民税の基礎控除は43万円と小さいため、実際の住民税の節税額はこれ以上になります）。
              </p>
            </>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 18, textAlign: 'center' }}>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
          {REFORM_FIRST_CONTRIBUTION}からのiDeCo拠出限度額（月額）
        </div>
        <div
          style={{
            fontSize: 'var(--fs-xl)',
            fontWeight: 800,
            color: r.after.blocked ? '#b45309' : 'var(--accent)',
          }}
        >
          {yen(r.after.monthly)}
        </div>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
          年額 {yen(r.after.yearly)}／
          {r.reformApplied ? 'いま適用されている額です' : `いま（〜2026年11月拠出分）は ${yen(r.before.monthly)}`}
        </div>
      </div>

      {/* 「いま出せる額」と「12月から出せる額」を必ず並べる。
          新しい額だけを出すと、いますぐ6.2万円出せると誤解される */}
      {!r.reformApplied && (
        <div className="note" style={{ lineHeight: 1.7 }}>
          いま拠出できるのは <strong>月{yen(r.before.monthly)}</strong> までです。
          新しい限度額が使えるのは <strong>{REFORM_FIRST_CONTRIBUTION}</strong> からで、
          いま掛金額の変更を申し込んでも、増えた枠が引き落としに反映されるのは2027年1月です。
        </div>
      )}

      {r.after.blocked && (
        <div className="note" style={{ lineHeight: 1.7 }}>
          事業主掛金・他制度掛金相当額の合計が枠（{man(r.after.frame)}）に達しているため、
          <strong>iDeCoには拠出できません。</strong>
          改正後は企業年金とiDeCoを合算して{man(r.after.frame)}までとなるためです。
        </div>
      )}

      {!r.after.blocked && r.after.contributableMonthly === 0 && (
        <div className="note" style={{ lineHeight: 1.7 }}>
          限度額は {yen(r.after.monthly)} ですが、iDeCoの掛金は
          <strong>月{yen(MIN_CONTRIBUTION)}以上・{yen(CONTRIBUTION_UNIT)}単位</strong>
          のため、この額では申し込めません。
        </div>
      )}

      <h3 style={{ marginTop: 22 }}>限度額の内訳（{REFORM_FIRST_CONTRIBUTION}〜）</h3>
      <table>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>
              {insured === 'type2'
                ? '企業年金と合わせた枠'
                : insured === 'type1'
                  ? '国民年金基金等と合わせた枠'
                  : '第3号被保険者の限度額'}
            </td>
            <td>{yen(r.after.frame)}</td>
          </tr>
          {r.after.deducted > 0 && (
            <>
              <tr>
                <td style={{ textAlign: 'left' }}>
                  −{' '}
                  {insured === 'type1'
                    ? '国民年金基金の掛金・付加保険料'
                    : '事業主掛金・他制度掛金相当額'}
                </td>
                <td>− {yen(r.after.deducted)}</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'left' }}>＝ iDeCoに出せる額（月額）</td>
                <td>
                  <strong>{yen(r.after.monthly)}</strong>
                </td>
              </tr>
            </>
          )}
          <tr>
            <td style={{ textAlign: 'left' }}>
              実際に申し込める額（{yen(MIN_CONTRIBUTION)}以上・{yen(CONTRIBUTION_UNIT)}単位）
            </td>
            <td>{yen(r.after.contributableMonthly)}</td>
          </tr>
        </tbody>
      </table>
      {r.after.deducted === 0 && insured === 'type2' && (
        <p className="hint" style={{ marginTop: 8 }}>
          企業年金がないため、枠の{man(r.after.frame)}がそのままiDeCoの上限になります。
          企業型DC・DBがある方は、事業主掛金の分だけこの額から下がります。
        </p>
      )}

      <h3 style={{ marginTop: 22 }}>改正前後の比較</h3>
      <table>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>いま（〜2026年11月拠出分）</td>
            <td>
              {yen(r.before.monthly)}
              {r.before.cappedByInner && (
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)', display: 'block' }}>
                  {man(r.before.frame)} − {yen(r.before.deducted)} ＝{' '}
                  {yen(r.before.afterDeduction)} ですが、内枠{man(r.before.cap ?? 0)}が上限
                </span>
              )}
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>{REFORM_FIRST_CONTRIBUTION}〜</td>
            <td>{yen(r.after.monthly)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>増える額（月額）</td>
            <td>
              <strong>{r.gainMonthly > 0 ? `＋${yen(r.gainMonthly)}` : '変わりません'}</strong>
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>同・年額</td>
            <td>{r.gainYearly > 0 ? `＋${yen(r.gainYearly)}` : '0円'}</td>
          </tr>
        </tbody>
      </table>
      <p className="hint" style={{ marginTop: 8 }}>
        {insured === 'type3'
          ? '第3号被保険者は今回の改正の対象外で、限度額は月2.3万円のまま変わりません。'
          : r.gainRatio !== null && r.gainRatio > 1
            ? `限度額は約${r.gainRatio.toFixed(1)}倍になります。`
            : '限度額は変わりません。'}
      </p>

      <h3 style={{ marginTop: 22 }}>拠出額と年間の節税額</h3>
      <label>
        実際に拠出する月額：<strong>{yen(r.contributionMonthly)}</strong>（年{' '}
        {yen(r.contributionYearly)}）
        <input
          type="range"
          min={0}
          max={Math.max(CONTRIBUTION_UNIT, r.after.contributableMonthly)}
          step={CONTRIBUTION_UNIT}
          value={r.contributionMonthly}
          onChange={(e) => setContribution(Number(e.target.value))}
          disabled={r.after.contributableMonthly === 0}
          style={{ width: '100%' }}
        />
      </label>

      <table>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>年間の拠出額（全額が所得控除）</td>
            <td>{yen(r.contributionYearly)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>
              所得税の軽減（税率{Math.round(r.saving.rate * 100)}%・復興特別所得税込み）
            </td>
            <td>{yen(r.saving.incomeTax)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>住民税の軽減（所得割10%）</td>
            <td>{yen(r.saving.residentTax)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>＝ 年間の節税額</td>
            <td>
              <strong style={{ color: 'var(--accent)' }}>{yen(r.saving.total)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
      {r.saving.noTaxableIncome ? (
        <div className="note" style={{ lineHeight: 1.7 }}>
          課税所得が0のため、iDeCoの掛金を出しても<strong>所得控除による節税は起きません</strong>。
          iDeCoには運用益が非課税になるという別の利点がありますが、
          この計算機は所得控除による節税額だけを扱っています。
        </div>
      ) : (
        <p className="hint" style={{ marginTop: 8 }}>
          拠出額の <strong>{Math.round(r.saving.effectiveRate * 100)}%</strong>{' '}
          が税金の軽減として戻る計算です。
          {r.saving.socialInsuranceEstimated &&
            '社会保険料を年収から概算しているため、結果は概算です。'}
        </p>
      )}

      <h3 style={{ marginTop: 22 }}>加入可能年齢までの累計</h3>
      <p className="hint" style={{ marginTop: 0 }}>
        加入可能年齢も{JOIN_AGE_LIMIT_BEFORE}歳未満から{JOIN_AGE_LIMIT_AFTER}
        歳未満に延びます（老齢基礎年金・iDeCoの老齢給付金を受給していないことが条件）。
        いまの拠出額・いまの課税所得のまま続けた場合の累計です。
      </p>
      <table>
        <thead>
          <tr>
            <th></th>
            <th>{JOIN_AGE_LIMIT_BEFORE}歳まで</th>
            <th>{JOIN_AGE_LIMIT_AFTER}歳まで</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ textAlign: 'left' }}>加入できる期間</td>
            <td>{r.cumulativeBefore.months}ヶ月</td>
            <td>{r.cumulativeAfter.months}ヶ月</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>累計の拠出額</td>
            <td>{yen(r.cumulativeBefore.contribution)}</td>
            <td>{yen(r.cumulativeAfter.contribution)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: 'left' }}>累計の節税額</td>
            <td>{yen(r.cumulativeBefore.saving)}</td>
            <td>
              <strong>{yen(r.cumulativeAfter.saving)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
      {r.cumulativeSavingGain > 0 && (
        <p className="hint" style={{ marginTop: 8 }}>
          加入できる期間が5年延びるぶん、累計の節税額が{' '}
          <strong>{yen(r.cumulativeSavingGain)}</strong> 増えます。
        </p>
      )}

      <div className="note">
        本計算は目安です。掛金の全額が小規模企業共済等掛金控除の対象になりますが、実際の税額は他の所得控除・税額控除によって変わります。企業型DCの事業主掛金や他制度掛金相当額は勤め先から通知される額を使ってください。iDeCoは原則60歳まで引き出せず、<strong>受け取るときにも課税があります</strong>（退職所得控除・公的年金等控除の対象）。運用商品の選択や利回りは本ツールでは扱いません。年末調整・確定申告での戻り方は{' '}
        <Link href="/nenmatsu-chosei/">年末調整 還付金 計算機</Link>、掛金でふるさと納税の上限がどう下がるかは{' '}
        <Link href="/furusato-nozei/">ふるさと納税 控除額計算機</Link> で確認できます。
      </div>
    </div>
  );
}
