'use client';

import { useState } from 'react';
import {
  calcNenmatsuChosei,
  type HousingLoanTier,
  type SpouseKind,
} from '@/lib/nenmatsu-chosei';

const yen = (v: number) => `${Math.round(v).toLocaleString('ja-JP')}円`;
const manToYen = (v: string) => (Number(v) || 0) * 10_000;
const toYen = (v: string) => Number(v) || 0;

const SPOUSES: { value: SpouseKind; label: string }[] = [
  { value: 'none', label: 'なし（独身・共働きで配偶者控除の対象外）' },
  { value: 'general', label: 'あり' },
  { value: 'elderly', label: 'あり・70歳以上' },
];

/** 扶養親族の人数を選ぶ小さなセレクト（ふるさと納税の計算機と同じ形） */
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
    <label style={{ fontSize: 'var(--fs-sm)' }}>
      {label}
      <span
        style={{ display: 'block', color: 'var(--muted)', fontWeight: 400, fontSize: 'var(--fs-xs)' }}
      >
        {hint}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ marginTop: 4, fontSize: 'var(--fs-md)' }}
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

/** 内訳の1行 */
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
          <span
            style={{
              display: 'block',
              color: 'var(--muted)',
              fontSize: 'var(--fs-xs)',
              fontWeight: 400,
            }}
          >
            {sub}
          </span>
        )}
      </span>
      <span style={{ whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}

/** 円で入れる控除額の入力欄（保険料控除証明書や源泉徴収票の額をそのまま入れる想定） */
function YenField({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label style={{ fontSize: 'var(--fs-sm)' }}>
      {label}
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={1000}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
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

export default function Calculator() {
  const [incomeMan, setIncomeMan] = useState('500');
  const [withheldYen, setWithheldYen] = useState('');
  const [useSocialEstimate, setUseSocialEstimate] = useState(true);
  const [socialMan, setSocialMan] = useState('');
  const [kaigo, setKaigo] = useState(false);
  const [spouse, setSpouse] = useState<SpouseKind>('none');
  const [spouseIncomeMan, setSpouseIncomeMan] = useState('0');
  const [depGeneral, setDepGeneral] = useState(0);
  const [depSpecific, setDepSpecific] = useState(0);
  const [depElderly, setDepElderly] = useState(0);
  const [relativeIncomeMan, setRelativeIncomeMan] = useState('');
  const [lifeYen, setLifeYen] = useState('');
  const [earthquakeYen, setEarthquakeYen] = useState('');
  const [idecoYen, setIdecoYen] = useState('');
  const [loanYen, setLoanYen] = useState('');
  const [loanTier, setLoanTier] = useState<HousingLoanTier>('rate5');

  const r = calcNenmatsuChosei({
    income: manToYen(incomeMan),
    withheld: withheldYen.trim() === '' ? null : toYen(withheldYen),
    socialInsurance: useSocialEstimate ? null : manToYen(socialMan),
    kaigo,
    spouse,
    spouseIncome: manToYen(spouseIncomeMan),
    dependentsGeneral: depGeneral,
    dependentsSpecific: depSpecific,
    dependentsElderly: depElderly,
    specialRelativeIncomes:
      relativeIncomeMan.trim() === '' ? [] : [manToYen(relativeIncomeMan)],
    lifeInsurance: toYen(lifeYen),
    earthquakeInsurance: toYen(earthquakeYen),
    smallEnterpriseMutualAid: toYen(idecoYen),
    housingLoanCredit: toYen(loanYen),
    housingLoanTier: loanTier,
  });

  const c = r.current;
  const isRefund = r.difference >= 0;

  return (
    <div className="card">
      <div style={{ display: 'grid', gap: 14 }}>
        <label>
          年収（額面・賞与込み・万円）
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
          源泉徴収税額の累計（円・空欄なら推計）
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            value={withheldYen}
            onChange={(e) => setWithheldYen(e.target.value)}
            placeholder={`空欄なら ${r.withheld.toLocaleString('ja-JP')} 円として計算`}
          />
          <span
            style={{
              display: 'block',
              marginTop: 4,
              color: 'var(--muted)',
              fontWeight: 400,
              fontSize: 'var(--fs-xs)',
            }}
          >
            1月〜12月の給与明細の「所得税」を合計した金額です。賞与の分も足してください。
            <strong>ここを入れると還付額の精度が大きく上がります。</strong>
          </span>
        </label>

        <div>
          <label
            style={{
              fontWeight: 400,
              display: 'flex',
              gap: 6,
              alignItems: 'flex-start',
              fontSize: 'var(--fs-sm)',
            }}
          >
            <input
              type="checkbox"
              checked={!useSocialEstimate}
              onChange={(e) => setUseSocialEstimate(!e.target.checked)}
              style={{ width: 'auto', marginTop: 3 }}
            />
            社会保険料を自分で入力する（給与明細の健康保険＋厚生年金＋雇用保険の年間合計）
          </label>
          {useSocialEstimate ? (
            <label
              style={{
                fontWeight: 400,
                display: 'flex',
                gap: 6,
                alignItems: 'center',
                fontSize: 'var(--fs-sm)',
                marginTop: 8,
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
          配偶者
          <select value={spouse} onChange={(e) => setSpouse(e.target.value as SpouseKind)}>
            {SPOUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        {spouse !== 'none' && (
          <label style={{ fontSize: 'var(--fs-sm)' }}>
            配偶者の年収（万円）
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={10}
              value={spouseIncomeMan}
              onChange={(e) => setSpouseIncomeMan(e.target.value)}
            />
            <span
              style={{
                display: 'block',
                marginTop: 4,
                color: 'var(--muted)',
                fontWeight: 400,
                fontSize: 'var(--fs-xs)',
              }}
            >
              136万円までは配偶者控除、超えると配偶者特別控除に自動で切り替わります（207万円で消えます）。
            </span>
          </label>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 12,
          }}
        >
          <CountSelect
            label="扶養親族"
            hint="16〜18歳・23〜69歳"
            value={depGeneral}
            onChange={setDepGeneral}
          />
          <CountSelect
            label="うち19〜22歳"
            hint="特定扶養親族"
            value={depSpecific}
            onChange={setDepSpecific}
          />
          <CountSelect
            label="うち70歳以上"
            hint="老人扶養親族"
            value={depElderly}
            onChange={setDepElderly}
          />
        </div>
        <p style={{ margin: '-6px 0 0', fontSize: 'var(--fs-xs)', color: 'var(--muted)' }}>
          16歳未満の子どもは扶養控除の対象外なので、人数に含めないでください。年収136万円を超える親族も含めません。
        </p>

        <details>
          <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)', fontWeight: 600 }}>
            生命保険料控除・地震保険料控除・iDeCo を入れる
          </summary>
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            <YenField
              label="生命保険料控除（円）"
              hint="保険料控除申告書で計算した額（所得税は最大12万円）。控除証明書の支払額そのものではありません。"
              value={lifeYen}
              onChange={setLifeYen}
              placeholder="例: 40000"
            />
            <YenField
              label="地震保険料控除（円）"
              hint="所得税は最大5万円。"
              value={earthquakeYen}
              onChange={setEarthquakeYen}
              placeholder="例: 50000"
            />
            <YenField
              label="iDeCo・小規模企業共済等掛金（円）"
              hint="年間の掛金の全額が控除されます。企業型DCのマッチング拠出も含みます。"
              value={idecoYen}
              onChange={setIdecoYen}
              placeholder="例: 276000"
            />
          </div>
        </details>

        <details>
          <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)', fontWeight: 600 }}>
            住宅ローン控除を使っている（2年目以降）
          </summary>
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            <YenField
              label="住宅借入金等特別控除の額（年間・円）"
              hint="年末残高証明書と控除申告書で計算した額。1年目は確定申告が必要なので、年末調整では引けません。"
              value={loanYen}
              onChange={setLoanYen}
              placeholder="例: 210000"
            />
            <label style={{ fontSize: 'var(--fs-sm)' }}>
              入居した時期
              <select
                value={loanTier}
                onChange={(e) => setLoanTier(e.target.value as HousingLoanTier)}
              >
                <option value="rate5">令和4年（2022年）1月以降</option>
                <option value="rate7">平成28年〜令和3年（2016〜2021年）</option>
              </select>
            </label>
          </div>
        </details>

        <details>
          <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)', fontWeight: 600 }}>
            19〜22歳で年収136万円を超える子どもがいる（特定親族特別控除）
          </summary>
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            <label style={{ fontSize: 'var(--fs-sm)' }}>
              その子どもの年収（万円）
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={relativeIncomeMan}
                onChange={(e) => setRelativeIncomeMan(e.target.value)}
                placeholder="例: 170"
              />
            </label>
            <p style={{ margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--muted)' }}>
              159万円までは満額63万円、そこから段階的に減って197万円で無くなります。136万円以下なら上の「うち19〜22歳」の人数に入れてください。
            </p>
          </div>
        </details>
      </div>

      {/* 結果 */}
      <div className="panel" style={{ marginTop: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', fontWeight: 600 }}>
          {isRefund ? '年末調整で還付される見込み額' : '年末調整で徴収される不足額'}
        </div>
        <div
          style={{
            fontSize: 'var(--fs-xl)',
            fontWeight: 700,
            color: 'var(--accent)',
            lineHeight: 1.3,
          }}
        >
          {(isRefund ? r.refund : r.shortfall).toLocaleString('ja-JP')}
          <span style={{ fontSize: 'var(--fs-md)', marginLeft: 2 }}>円</span>
        </div>
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)' }}>
          源泉徴収の累計 {yen(r.withheld)} − 年税額 {yen(c.yearTax)}
          {r.estimated && <>（推計を含む概算です）</>}
        </div>
      </div>

      {r.estimated && (
        <div className="note" style={{ marginTop: 14 }}>
          <strong>この結果は概算です。</strong>
          {r.withheldEstimated && (
            <>
              源泉徴収税額の累計を推計しています。令和8年11月までの源泉徴収には今回の改正が反映されていないため、
              <strong>改正前（令和7年分）の控除額</strong>
              で毎月引かれていたものとして計算しました。実際の源泉徴収は月額表で月ごとに計算されるため、賞与の配分や給与の変動で累計はずれます。
              <strong>給与明細の「所得税」を合計して入力すると、実額どおりの還付額が出ます。</strong>
            </>
          )}
          {r.socialInsuranceEstimated && (
            <>
              社会保険料も年収からの概算（{yen(r.socialInsurance)}）を使っています。
            </>
          )}
        </div>
      )}

      {!isRefund && (
        <div className="note" style={{ marginTop: 14 }}>
          <strong>不足額があります。</strong>
          源泉徴収された額が年税額に届いていないため、12月（または1月）の給与から不足分が徴収されます。年の途中で扶養親族が減った場合や、賞与の割合が大きい場合に起こります。
        </div>
      )}

      {r.reformSaving > 0 && (
        <div className="note" style={{ marginTop: 14 }}>
          <strong>令和8年分の改正で、年税額が {yen(r.reformSaving)} 下がっています。</strong>
          令和7年分の控除額（給与所得控除の最低保障65万円・基礎控除
          {yen(r.previous.basicDeduction)}）で計算すると年税額は {yen(r.previous.yearTax)}
          でした。令和8年分は給与所得控除の最低保障が74万円、基礎控除が{' '}
          {yen(c.basicDeduction)} なので {yen(c.yearTax)} になります。
          <br />
          この改正は<strong>令和8年12月1日施行</strong>で、
          <strong>11月までの毎月の源泉徴収には反映されていません</strong>
          。つまりこの差額は毎月の給与ではなく、
          <strong>12月の年末調整でまとめて精算されます</strong>
          。これが今年の還付が例年より大きくなる主な理由です。なお基礎控除の特例加算42万円は
          <strong>令和8年・9年分だけの時限措置</strong>です。
        </div>
      )}

      <h3 style={{ fontSize: 'var(--fs-md)', margin: '22px 0 2px' }}>年税額の内訳</h3>
      <p style={{ margin: '0 0 8px', fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
        年末調整は「毎月引かれていた所得税」と「1年分の正しい所得税」を精算する手続きです。下が正しいほうの計算です。
      </p>

      <div>
        <Row label="年収（額面）" value={yen(manToYen(incomeMan))} />
        <Row label="− 給与所得控除" value={yen(c.salaryDeduction)} />
        <Row label="＝ 給与所得控除後の金額" value={yen(c.totalIncome)} />
        <Row
          label="− 社会保険料控除"
          sub={r.socialInsuranceEstimated ? '年収からの概算' : undefined}
          value={yen(c.socialInsurance)}
        />
        <Row
          label="− 基礎控除"
          sub="本則62万円 + 特例加算（合計所得489万円以下なら42万円）"
          value={yen(c.basicDeduction)}
        />
        {c.spouseDeduction > 0 && (
          <Row
            label={c.spouseIsSpecial ? '− 配偶者特別控除' : '− 配偶者控除'}
            value={yen(c.spouseDeduction)}
          />
        )}
        {c.dependentDeduction > 0 && (
          <Row label="− 扶養控除" value={yen(c.dependentDeduction)} />
        )}
        {c.specialRelativeDeduction > 0 && (
          <Row
            label="− 特定親族特別控除"
            sub="19〜22歳の親族が年収136万円を超えたときの控除"
            value={yen(c.specialRelativeDeduction)}
          />
        )}
        {c.insuranceDeduction > 0 && (
          <Row
            label="− 生命保険料・地震保険料・小規模企業共済等掛金の控除"
            sub="年末調整で初めて反映される控除。ここが還付の主な源になります"
            value={yen(c.insuranceDeduction)}
          />
        )}
        <Row label="＝ 課税給与所得金額" sub="1,000円未満切捨て" value={yen(c.taxableIncome)} />
        <Row label="算出所得税額" sub="速算表で計算した額" value={yen(c.calculatedTax)} />
        {c.housingLoan && (
          <Row
            label="− 住宅借入金等特別控除"
            sub="税額控除なので、所得税額から直接引きます"
            value={yen(c.housingLoan.fromIncomeTax)}
          />
        )}
        <Row label="＝ 年調所得税額" value={yen(c.adjustedTax)} />
        <Row
          label="年調年税額"
          sub="年調所得税額 × 102.1%（復興特別所得税）・100円未満切捨て"
          value={yen(c.yearTax)}
          strong
        />
        <Row
          label="源泉徴収された所得税の累計"
          sub={r.withheldEstimated ? '推計値' : '入力した実額'}
          value={yen(r.withheld)}
        />
        <Row
          label={isRefund ? '差額（還付）' : '差額（不足額の徴収）'}
          value={yen(Math.abs(r.difference))}
          strong
        />
      </div>

      {c.housingLoan && c.housingLoan.fromResidentTax > 0 && (
        <div className="note" style={{ marginTop: 14 }}>
          住宅ローン控除のうち {yen(c.housingLoan.fromIncomeTax)}{' '}
          を所得税から引き、引ききれなかった {yen(c.housingLoan.fromResidentTax)}{' '}
          は翌年6月からの住民税から引かれます（上限は課税総所得金額等の
          {loanTier === 'rate7' ? '7%・最高136,500円' : '5%・最高97,500円'}）。
          {c.housingLoan.wasted > 0 && (
            <>
              {' '}
              その上限も超えた {yen(c.housingLoan.wasted)} は切り捨てになり、戻ってきません。
            </>
          )}
        </div>
      )}

      <div className="note" style={{ marginTop: 14 }}>
        <strong>住民税は年末調整の対象外です。</strong>
        年末調整で精算されるのは所得税だけで、住民税は年末調整の結果をもとに市区町村が計算し、
        <strong>翌年6月からの給与天引き</strong>で1年かけて納めます。今回の還付額に住民税は含まれていません。
      </div>
    </div>
  );
}
