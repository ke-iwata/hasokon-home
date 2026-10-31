'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { formatJa, parseDate, type DateParts } from '@/lib/date-parts';
import { trackToolUse } from '@/lib/analytics';
import { PREFECTURES, type Prefecture } from '@/lib/shaho-ryoritsu';
import {
  ageOn,
  calc,
  choiceLabel,
  defaultApplyDate,
  defaultBenefitTerms,
  defaultLeaveYearSalary,
  KOKUHO_NOTIFY_DAYS,
  KOKUHO_TABLES,
  NINKEI_APPLY_DAYS,
  switchSteps,
  ymJa,
  type CalcResult,
  type Choice,
  type Family,
  type KokuhoTable,
  type LeaveKind,
  type MonthRow,
  type PlanResult,
} from '@/lib/taishokugo-kenko-hoken';

const SLUG = 'taishokugo-kenko-hoken';

/** 画面だけ 100 円単位に丸める（lib は円単位を返す） */
const round100 = (n: number) => Math.round(n / 100) * 100;
const yen100 = (n: number) => `${round100(n).toLocaleString('ja-JP')}円`;
const man = (n: number) => `${(Math.round(n / 1_000) / 10).toLocaleString('ja-JP')}万円`;

const num = (s: string, fallback = 0) => {
  const v = Number(s);
  return s.trim() !== '' && Number.isFinite(v) ? v : fallback;
};

const radioRow: CSSProperties = { display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 'var(--fs-sm)' };
const radioLabel: CSSProperties = { fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' };
const grid2: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 };
const cell: CSSProperties = { textAlign: 'right', whiteSpace: 'nowrap' };

const DEFAULT_TABLE = KOKUHO_TABLES[KOKUHO_TABLES.length - 1];

/**
 * 退職後の健康保険 比較の入力と表示。計算は lib/taishokugo-kenko-hoken.ts の純関数だけ。
 * 100円単位の丸めは画面だけで行う。
 */
export default function Calculator() {
  const [leave, setLeave] = useState('2026-12-31');
  const [birth, setBirth] = useState('1981-06-15');
  const [salary, setSalary] = useState('500000');
  const [healthKind, setHealthKind] = useState<'kyokai' | 'kumiai'>('kyokai');
  const [pref, setPref] = useState<Prefecture>('東京都');
  const [kumiaiRate, setKumiaiRate] = useState('');
  const [kumiaiKaigo, setKumiaiKaigo] = useState('');
  const [kumiaiCap, setKumiaiCap] = useState('');
  const [eligible, setEligible] = useState(true);
  const [prevYear, setPrevYear] = useState('');
  const [leaveYear, setLeaveYear] = useState('');
  const [after, setAfter] = useState('0');
  const [other, setOther] = useState('0');
  const [leaveKind, setLeaveKind] = useState<LeaveKind>('self');
  const [family, setFamily] = useState<Record<keyof Family, string>>({ preschool: '0', minor: '0', kaigo: '0', adult: '0' });
  const [fuyoAvail, setFuyoAvail] = useState(false);
  const [supporter, setSupporter] = useState<'spouse' | 'other'>('spouse');
  const [daily, setDaily] = useState('');
  const [applyDate, setApplyDate] = useState('');
  const [tenure, setTenure] = useState('10');
  const [restriction, setRestriction] = useState('');
  const [days, setDays] = useState('');
  const [customOn, setCustomOn] = useState(false);
  const [custom, setCustom] = useState({
    iryoRate: '7.51', iryoCap: '670000', iryoCapita: '47600',
    shienRate: '2.80', shienCap: '260000', shienCapita: '17600',
    kaigoRate: '2.43', kaigoCap: '170000', kaigoCapita: '17800',
    kodomoRate: '0.27', kodomoCap: '30000', kodomoCapita: '1873',
  });

  const leaveD = parseDate(leave);
  const birthD = parseDate(birth);
  const monthly = num(salary);

  let r: CalcResult | null = null;
  let leaveAge = 0;
  if (leaveD && birthD && compareOk(birthD, leaveD)) {
    leaveAge = ageOn(birthD, leaveD);
    const terms = defaultBenefitTerms({ leaveKind, age: leaveAge, tenureYears: num(tenure, 10), leaveDate: leaveD });
    const toBp = (s: string) => Math.round(num(s) * 100);
    const kokuhoCustom: Omit<KokuhoTable, 'fiscalYear' | 'label'> | undefined = customOn
      ? {
          iryo: { rate: toBp(custom.iryoRate), perCapita: num(custom.iryoCapita), cap: num(custom.iryoCap) },
          shien: { rate: toBp(custom.shienRate), perCapita: num(custom.shienCapita), cap: num(custom.shienCap) },
          kaigo: { rate: toBp(custom.kaigoRate), perCapita: num(custom.kaigoCapita), cap: num(custom.kaigoCap) },
          kodomo: { rate: toBp(custom.kodomoRate), perCapita: num(custom.kodomoCapita), cap: num(custom.kodomoCap) },
          baseDeduction: DEFAULT_TABLE.baseDeduction,
          keigen: DEFAULT_TABLE.keigen,
        }
      : undefined;
    r = calc({
      leaveDate: leaveD,
      birthDate: birthD,
      monthlySalary: monthly,
      health:
        healthKind === 'kyokai'
          ? { kind: 'kyokai', prefecture: pref }
          : {
              kind: 'kumiai',
              ratePercent: num(kumiaiRate, 10),
              kaigoRatePercent: num(kumiaiKaigo, 1.6),
              cap: num(kumiaiCap, 320_000),
            },
      ninkeiEligible: eligible,
      salaryPrevYear: num(prevYear, monthly * 12),
      salaryLeaveYear: num(leaveYear, defaultLeaveYearSalary(monthly, leaveD)),
      salaryAfter: num(after),
      otherIncome: num(other),
      leaveKind,
      family: {
        preschool: Math.max(0, Math.floor(num(family.preschool))),
        minor: Math.max(0, Math.floor(num(family.minor))),
        kaigo: Math.max(0, Math.floor(num(family.kaigo))),
        adult: Math.max(0, Math.floor(num(family.adult))),
      },
      fuyo: {
        available: fuyoAvail,
        supporter,
        benefitDaily: num(daily),
        applyDate: parseDate(applyDate) ?? defaultApplyDate(leaveD),
        restrictionMonths: num(restriction, terms.restrictionMonths),
        prescribedDays: num(days, terms.prescribedDays),
      },
      kokuhoCustom,
    });
  }

  // 入力が落ち着いたら1回だけ計測する（打鍵ごとに送らない）
  const tracked = useRef(false);
  useEffect(() => {
    if (!r || tracked.current) return;
    const t = setTimeout(() => {
      tracked.current = true;
      trackToolUse(SLUG, 'compare');
    }, 3000);
    return () => clearTimeout(t);
  });

  const terms =
    leaveD && birthD
      ? defaultBenefitTerms({ leaveKind, age: leaveAge, tenureYears: num(tenure, 10), leaveDate: leaveD })
      : null;

  return (
    <div className="card">
      <div style={grid2}>
        <div className="field">
          <label htmlFor="tk-leave">退職日</label>
          <input id="tk-leave" type="date" value={leave} onChange={(e) => setLeave(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="tk-birth">生年月日</label>
          <input id="tk-birth" type="date" value={birth} onChange={(e) => setBirth(e.target.value)} />
          <p className="hint">40歳・60歳・65歳になる月で介護分・国民年金が切り替わります。</p>
        </div>
      </div>

      <div className="field">
        <label htmlFor="tk-salary">退職時の月給（額面）</label>
        <input id="tk-salary" type="number" inputMode="numeric" min={0} step={10000} value={salary} onChange={(e) => setSalary(e.target.value)} />
        <p className="hint">標準報酬月額は等級表で引きます。任意継続は上限（協会けんぽは32万円）までです。</p>
      </div>

      <div className="field">
        <span className="label">前の勤め先の健康保険</span>
        <div style={radioRow}>
          <label style={radioLabel}>
            <input type="radio" name="tk-health" checked={healthKind === 'kyokai'} onChange={() => setHealthKind('kyokai')} style={{ width: 'auto' }} />
            協会けんぽ
          </label>
          <label style={radioLabel}>
            <input type="radio" name="tk-health" checked={healthKind === 'kumiai'} onChange={() => setHealthKind('kumiai')} style={{ width: 'auto' }} />
            健康保険組合
          </label>
        </div>
        {healthKind === 'kyokai' ? (
          <select aria-label="協会けんぽの都道府県" value={pref} onChange={(e) => setPref(e.target.value as Prefecture)} style={{ marginTop: 8 }}>
            {PREFECTURES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        ) : (
          <div style={{ ...grid2, marginTop: 8 }}>
            <label style={{ fontSize: 'var(--fs-sm)' }}>
              料率（健保＋支援金・全額 %）
              <input type="number" step={0.01} value={kumiaiRate} placeholder="10" onChange={(e) => setKumiaiRate(e.target.value)} />
            </label>
            <label style={{ fontSize: 'var(--fs-sm)' }}>
              介護の料率（全額 %）
              <input type="number" step={0.01} value={kumiaiKaigo} placeholder="1.6" onChange={(e) => setKumiaiKaigo(e.target.value)} />
            </label>
            <label style={{ fontSize: 'var(--fs-sm)' }}>
              任意継続の上限（標準報酬月額）
              <input type="number" step={10000} value={kumiaiCap} placeholder="320000" onChange={(e) => setKumiaiCap(e.target.value)} />
            </label>
          </div>
        )}
        <label style={{ ...radioLabel, marginTop: 8 }}>
          <input type="checkbox" checked={eligible} onChange={(e) => setEligible(e.target.checked)} style={{ width: 'auto' }} />
          <span className="hint" style={{ margin: 0 }}>退職日まで続けて2か月以上、この健康保険に入っていた</span>
        </label>
      </div>

      <details className="field">
        <summary style={{ cursor: 'pointer' }}>所得（前年・退職した年・その後）</summary>
        <div style={{ ...grid2, marginTop: 8 }}>
          <label style={{ fontSize: 'var(--fs-sm)' }}>
            退職した年の前年の給与収入
            <input type="number" step={10000} value={prevYear} placeholder={String(monthly * 12)} onChange={(e) => setPrevYear(e.target.value)} />
          </label>
          <label style={{ fontSize: 'var(--fs-sm)' }}>
            退職した年の給与収入
            <input type="number" step={10000} value={leaveYear} placeholder={leaveD ? String(defaultLeaveYearSalary(monthly, leaveD)) : ''} onChange={(e) => setLeaveYear(e.target.value)} />
          </label>
          <label style={{ fontSize: 'var(--fs-sm)' }}>
            退職翌年からの見込みの給与収入（年）
            <input type="number" step={10000} value={after} onChange={(e) => setAfter(e.target.value)} />
          </label>
          <label style={{ fontSize: 'var(--fs-sm)' }}>
            給与以外の所得（年・毎年）
            <input type="number" step={10000} value={other} onChange={(e) => setOther(e.target.value)} />
          </label>
        </div>
        <p className="hint">空欄は月給から見積もります。退職金（退職所得）と失業給付は国保の所得に入りません。</p>
      </details>

      <div className="field">
        <span className="label">辞め方</span>
        <div style={radioRow}>
          <label style={radioLabel}>
            <input type="radio" name="tk-kind" checked={leaveKind === 'self'} onChange={() => setLeaveKind('self')} style={{ width: 'auto' }} />
            自己都合
          </label>
          <label style={radioLabel}>
            <input type="radio" name="tk-kind" checked={leaveKind === 'company'} onChange={() => setLeaveKind('company')} style={{ width: 'auto' }} />
            会社都合など
          </label>
        </div>
        <p className="hint">
          会社都合など＝雇用保険の特定受給資格者（離職理由コード11・12・21・22・31・32）か特定理由離職者（23・33・34）。国保の所得が給与所得の30/100になります（離職日に65歳未満）。
        </p>
      </div>

      <details className="field">
        <summary style={{ cursor: 'pointer' }}>一緒に国保に入る家族（任意）</summary>
        <div style={{ ...grid2, marginTop: 8 }}>
          {(
            [
              ['preschool', '未就学児'],
              ['minor', '18歳未満（未就学児を除く）'],
              ['kaigo', '40〜64歳'],
              ['adult', 'そのほかの大人'],
            ] as const
          ).map(([k, label]) => (
            <label key={k} style={{ fontSize: 'var(--fs-sm)' }}>
              {label}（人）
              <input type="number" min={0} step={1} value={family[k]} onChange={(e) => setFamily({ ...family, [k]: e.target.value })} />
            </label>
          ))}
        </div>
        <p className="hint">任意継続では家族は被扶養者として0円です。家族の所得は0円として計算します。</p>
      </details>

      <div className="field">
        <label style={radioLabel}>
          <input type="checkbox" checked={fuyoAvail} onChange={(e) => setFuyoAvail(e.target.checked)} style={{ width: 'auto' }} />
          家族（会社員・公務員）の扶養に入れる
        </label>
        {fuyoAvail && (
          <>
            <div style={{ ...radioRow, marginTop: 8 }}>
              <label style={radioLabel}>
                <input type="radio" name="tk-sup" checked={supporter === 'spouse'} onChange={() => setSupporter('spouse')} style={{ width: 'auto' }} />
                配偶者の扶養
              </label>
              <label style={radioLabel}>
                <input type="radio" name="tk-sup" checked={supporter === 'other'} onChange={() => setSupporter('other')} style={{ width: 'auto' }} />
                親・子など
              </label>
            </div>
            <p className="hint">配偶者の扶養なら国民年金も第3号で0円（20〜59歳）。親・子などの扶養では国民年金は払い続けます。</p>
            <div style={{ ...grid2, marginTop: 8 }}>
              <label style={{ fontSize: 'var(--fs-sm)' }}>
                失業給付の日額（受けないなら空欄）
                <input type="number" step={1} value={daily} placeholder="0" onChange={(e) => setDaily(e.target.value)} />
              </label>
              <label style={{ fontSize: 'var(--fs-sm)' }}>
                求職の申込みをする日
                <input type="date" value={applyDate} onChange={(e) => setApplyDate(e.target.value)} />
              </label>
              <label style={{ fontSize: 'var(--fs-sm)' }}>
                雇用保険に入っていた年数
                <input type="number" min={0} step={1} value={tenure} onChange={(e) => setTenure(e.target.value)} />
              </label>
              <label style={{ fontSize: 'var(--fs-sm)' }}>
                給付制限（か月）
                <input type="number" min={0} step={1} value={restriction} placeholder={terms ? String(terms.restrictionMonths) : ''} onChange={(e) => setRestriction(e.target.value)} />
              </label>
              <label style={{ fontSize: 'var(--fs-sm)' }}>
                所定給付日数
                <input type="number" min={0} step={1} value={days} placeholder={terms ? String(terms.prescribedDays) : ''} onChange={(e) => setDays(e.target.value)} />
              </label>
            </div>
            <p className="hint">
              日額が3,612円以上（60歳以上は5,000円以上）だと、受給している間は扶養に入れません。日額は
              <Link href="/shitsugyo-hoken/">失業保険の計算機</Link>で出せます。申込み日の空欄は退職日の翌日から14日後です。
            </p>
          </>
        )}
      </div>

      <details className="field" open={customOn} onToggle={(e) => setCustomOn((e.target as HTMLDetailsElement).open)}>
        <summary style={{ cursor: 'pointer' }}>お住まいの市区町村の国保の料率を入れる</summary>
        <p className="hint">開いている間は、この料率で全期間を計算します（既定は東京23区の令和8年度）。</p>
        {(
          [
            ['iryo', '医療分'],
            ['shien', '後期高齢者支援金分'],
            ['kaigo', '介護分'],
            ['kodomo', '子ども・子育て支援納付金分'],
          ] as const
        ).map(([k, label]) => (
          <div key={k} style={{ ...grid2, marginTop: 8 }}>
            <label style={{ fontSize: 'var(--fs-sm)' }}>
              {label} 所得割（%）
              <input type="number" step={0.01} value={custom[`${k}Rate`]} onChange={(e) => setCustom({ ...custom, [`${k}Rate`]: e.target.value })} />
            </label>
            <label style={{ fontSize: 'var(--fs-sm)' }}>
              均等割（円）
              <input type="number" step={100} value={custom[`${k}Capita`]} onChange={(e) => setCustom({ ...custom, [`${k}Capita`]: e.target.value })} />
            </label>
            <label style={{ fontSize: 'var(--fs-sm)' }}>
              限度額（円）
              <input type="number" step={10000} value={custom[`${k}Cap`]} onChange={(e) => setCustom({ ...custom, [`${k}Cap`]: e.target.value })} />
            </label>
          </div>
        ))}
      </details>

      {r === null ? (
        <div className="panel quiet">
          <p className="hint" style={{ margin: 0 }}>退職日と生年月日を入れると、24か月の保険料を比べます。</p>
        </div>
      ) : (
        <Result r={r} eligible={eligible} leaveKind={leaveKind} fuyoAvail={fuyoAvail} />
      )}
    </div>
  );
}

function compareOk(birth: DateParts, leave: DateParts): boolean {
  const age = ageOn(birth, leave);
  return age >= 15 && age < 75;
}

function planText(p: PlanResult): string {
  return p.segments
    .map((s) => `${choiceLabel(s.choice)}（${ymJa(s.from)}${s.months > 1 ? `〜${ymJa(s.to)}` : ''}）`)
    .join(' → ');
}

function Result({
  r,
  eligible,
  leaveKind,
  fuyoAvail,
}: {
  r: CalcResult;
  eligible: boolean;
  leaveKind: LeaveKind;
  fuyoAvail: boolean;
}) {
  const vsKokuho = r.kokuhoOnly.total - r.best.total;
  const vsNinkei = r.ninkeiOnly ? r.ninkeiOnly.total - r.best.total : 0;
  const steps = r.best.switchAt ? switchSteps(r.best.switchAt) : null;
  const nextChoice: Choice | null = r.best.switchAt
    ? r.best.choices[r.months.findIndex((m) => m.ym === r.best.switchAt)]
    : null;
  const marks = Array.from(new Set(r.months.flatMap((m) => m.marks)));

  return (
    <>
      <div className="panel">
        <p style={{ margin: 0 }}>
          24か月でいちばん安いのは <strong>{planText(r.best)}</strong> で、合計 <strong>{man(r.best.total)}</strong>
          （健康保険 {man(r.best.health)}＋国民年金 {man(r.best.pension)}）。
          {vsKokuho > 0 && <>国保だけより{man(vsKokuho)}</>}
          {vsKokuho > 0 && vsNinkei > 0 && '、'}
          {vsNinkei > 0 && <>任意継続だけより{man(vsNinkei)}</>}
          {(vsKokuho > 0 || vsNinkei > 0) && '安くなります。'}
        </p>
        <p className="hint" style={{ marginBottom: 0 }}>
          目安です。国保はお住まいの市区町村の料率で計算し直してください（上の「お住まいの市区町村の国保の料率を入れる」）。
        </p>
      </div>

      {eligible ? (
        <div className="note">
          任意継続の申出は <strong>{formatJa(r.ninkeiDeadline)}まで</strong>（退職日の翌日から{NINKEI_APPLY_DAYS}日以内。健康保険法37条）。
          過ぎると任意継続には入れません。
        </div>
      ) : (
        <div className="note">任意継続は退職日まで継続して2か月以上の加入が要ります（健康保険法3条4項）。任意継続の列は出していません。</div>
      )}

      {steps && nextChoice && (
        <div className="note">
          <strong>乗り換えの手順：</strong>
          {ymJa(steps.applyMonth)}中に任意継続の資格喪失の申出 → {formatJa(steps.lossDate)}に喪失 →{' '}
          {nextChoice === 'kokuho'
            ? `${KOKUHO_NOTIFY_DAYS}日以内に区市町村で国保の加入手続き`
            : '家族の勤め先で扶養に入る届出'}
          。一度脱退した任意継続には戻れません。
        </div>
      )}

      {leaveKind === 'company' && r.involuntary && (
        <div className="note">
          国保の軽減（給与所得30/100）は届出が要ります。雇用保険受給資格者証（受給資格通知）を持って区市町村の窓口へ。
        </div>
      )}
      {leaveKind === 'company' && !r.involuntary && (
        <div className="note">離職日に65歳以上のため、国保の非自発的失業の軽減の対象外として計算しています。</div>
      )}

      {fuyoAvail && r.fuyoBlockedReason && <div className="note">{r.fuyoBlockedReason}。</div>}
      {fuyoAvail && r.benefitPeriod && (
        <p className="hint">
          失業給付を受ける期間の目安：{formatJa(r.benefitPeriod.start)}〜{formatJa(r.benefitPeriod.end)}。
          受給開始前（待期・給付制限）の扱いは健康保険によって違うことがあるので、扶養する家族の勤め先の健康保険に確かめてください。
        </p>
      )}

      <h3>入り方ごとの24か月の合計</h3>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>入り方</th>
              <th style={cell}>健康保険</th>
              <th style={cell}>国民年金</th>
              <th style={cell}>合計</th>
            </tr>
          </thead>
          <tbody>
            {r.plans.map((p) => (
              <tr key={p.key}>
                <td>
                  {p === r.best ? <strong>{p.label}</strong> : p.label}
                  {p.switchAt && <span className="hint">（{ymJa(p.switchAt)}に乗り換え）</span>}
                </td>
                <td style={cell}>{yen100(p.health)}</td>
                <td style={cell}>{yen100(p.pension)}</td>
                <td style={cell}>{yen100(p.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>月ごとの保険料</h3>
      <MonthTable months={r.months} eligible={eligible} fuyoAvail={fuyoAvail} best={r.best} />

      <p className="hint">
        金額は100円単位に丸めた目安です。国民年金の行は、任意継続・国保の人（20〜59歳）が第1号として払う額です。
        失業を理由に国民年金の免除（失業による特例免除）を申請できる場合がありますが、承認は審査次第で、免除された期間は年金額が減るため、比較の金額には入れていません。
      </p>
      {marks.length > 0 && <p className="hint">印：{marks.join('／')}。未公表の年度は直前の年度の料率で計算しています。</p>}
    </>
  );
}

function MonthTable({
  months,
  eligible,
  fuyoAvail,
  best,
}: {
  months: MonthRow[];
  eligible: boolean;
  fuyoAvail: boolean;
  best: PlanResult;
}) {
  // 360px で長くなりすぎないよう、6か月ごとに折りたためる
  const chunks: MonthRow[][] = [];
  for (let i = 0; i < months.length; i += 6) chunks.push(months.slice(i, i + 6));
  return (
    <>
      {chunks.map((rows, ci) => (
        <details key={rows[0].ym} open={ci < 2}>
          <summary style={{ cursor: 'pointer' }}>
            {ymJa(rows[0].ym)}〜{ymJa(rows[rows.length - 1].ym)}
          </summary>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>月</th>
                  {eligible && <th style={cell}>任意継続</th>}
                  <th style={cell}>国保</th>
                  {fuyoAvail && <th style={cell}>扶養</th>}
                  <th style={cell}>国民年金</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const idx = months.indexOf(m);
                  const pick = best.choices[idx];
                  const b = (c: Choice, text: string) => (pick === c ? <strong>{text}</strong> : text);
                  return (
                    <tr key={m.ym}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {ymJa(m.ym)}
                        {m.involuntary && <span className="hint">（軽減）</span>}
                      </td>
                      {m.kouki ? (
                        <td colSpan={2 + (eligible ? 1 : 0) + (fuyoAvail ? 1 : 0)}>後期高齢者医療に移ります</td>
                      ) : (
                        <>
                          {eligible && <td style={cell}>{b('ninkei', yen100(m.ninkei ?? 0))}</td>}
                          <td style={cell}>{b('kokuho', yen100(m.kokuho))}</td>
                          {fuyoAvail && (
                            <td style={cell}>
                              {m.fuyoOk ? b('fuyo', m.pensionFuyo === m.pension ? '0円' : '0円（年金も0）') : '入れない'}
                            </td>
                          )}
                          <td style={cell}>{yen100(m.pension)}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      ))}
      <p className="hint">太字は、いちばん安い入り方でその月に入るもの。</p>
    </>
  );
}
