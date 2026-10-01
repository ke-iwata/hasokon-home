'use client';

import { useEffect, useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import { formatJaWithWeekday } from '@/lib/sozoku-toki-kigen';
import {
  FILING_NOTE,
  FIRST_SETTLEMENT_NOTE,
  LIMITS,
  SETTLEMENT_AGE_NOTE,
  SETTLEMENT_IRREVOCABLE_NOTE,
  adultBirthCutoff,
  deadlines,
  eligibility,
  failureMessage,
  periodMessage,
  rekinenAfterExclusion,
  settlementAfterExclusion,
  type EnergyAnswer,
  type HouseKind,
  type Method,
} from '@/lib/jutaku-shutoku-shikin';
import { SETTLEMENT_SPECIAL_DEDUCTION } from '@/lib/zoyozei-keisan';

const yen = (n: number) => `${Math.round(n).toLocaleString('ja-JP')}円`;
const manYen = (n: number) => `${(n / 10_000).toLocaleString('ja-JP')}万円`;
/** 万円の入力 → 円 */
const fromMan = (v: string) => Math.max(0, Math.round((Number(v) || 0) * 10_000));
const pct = (r: number) => `${Math.round(r * 100)}%`;

const radioRow = { display: 'flex', gap: 16, flexWrap: 'wrap' as const, fontSize: 'var(--fs-sm)' };
const radioLabel = { fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' };
const rowLabel = { textAlign: 'left' as const };

/** 320px 幅では 2 列の表を縦に積む（仕様書「表示」）。CSS クラスを増やさないため matchMedia で切り替える */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 359px)');
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return narrow;
}

function Radio<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <div style={radioRow}>
      {options.map(([v, label]) => (
        <label key={v} style={radioLabel}>
          <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} style={{ width: 'auto' }} />
          {label}
        </label>
      ))}
    </div>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label style={{ ...radioLabel, alignItems: 'flex-start', fontSize: 'var(--fs-sm)' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 'auto', marginTop: 4 }} />
      <span>{children}</span>
    </label>
  );
}

/**
 * 住宅取得等資金の贈与税 非課税 判定・計算機の UI。
 *
 * 1 段目に使える／使えないと限度額、2 段目に暦年課税／相続時精算課税の 2 列、3 段目に期限。
 * ロジックは持たせない（すべて lib/jutaku-shutoku-shikin.ts の純関数）。
 */
export default function Calculator() {
  const [giftDate, setGiftDate] = useState('');
  const [amountMan, setAmountMan] = useState('1500');
  const [houseKind, setHouseKind] = useState<HouseKind>('new');
  const [energy, setEnergy] = useState<EnergyAnswer>('yes');
  const [floorArea, setFloorArea] = useState('100');

  const [adult, setAdult] = useState(true);
  const [incomeMan, setIncomeMan] = useState('600');
  const [lineal, setLineal] = useState(true);
  const [moveIn, setMoveIn] = useState(true);
  const [residential, setResidential] = useState(true);
  const [quakeOk, setQuakeOk] = useState(true);
  const [method, setMethod] = useState<Method>('rekinen');
  const [usedSpecialMan, setUsedSpecialMan] = useState('0');

  const narrow = useNarrow();

  /** 贈与日の既定は「開いた日」。静的書き出しなのでビルド時刻で固定せず、マウント後に入れる */
  useEffect(() => {
    const now = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    setGiftDate(`${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`);
  }, []);

  const giftYear = /^\d{4}-/.test(giftDate) ? Number(giftDate.slice(0, 4)) : null;
  const amount = fromMan(amountMan);
  const area = Math.max(0, Number(floorArea) || 0);
  const usedSpecial = Math.min(SETTLEMENT_SPECIAL_DEDUCTION, fromMan(usedSpecialMan));

  const elig =
    giftYear === null
      ? null
      : eligibility({
          giftYear,
          amount,
          houseKind,
          energy,
          floorArea: area,
          adultOnJan1: adult,
          income: fromMan(incomeMan),
          lineal,
          acquireAndMoveInByMar15: moveIn,
          mostlyResidential: residential,
          quakeOk,
        });

  const limit = elig?.limit ?? 0;
  const rekinen = rekinenAfterExclusion(amount, limit, { special: lineal && adult });
  const seisan = settlementAfterExclusion(amount, limit, usedSpecial);
  const headline = method === 'rekinen' ? rekinen.tax : seisan.tax;
  const cutoff = giftYear ? adultBirthCutoff(giftYear) : null;

  return (
    <div className="card">
      <div className="field-row">
        <div className="field">
          <label htmlFor="jutaku-gift-date">贈与を受ける（受けた）日</label>
          <input id="jutaku-gift-date" type="date" value={giftDate} onChange={(e) => setGiftDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="jutaku-amount">贈与額（万円）</label>
          <input
            id="jutaku-amount"
            type="number"
            inputMode="decimal"
            min={0}
            step={10}
            value={amountMan}
            onChange={(e) => setAmountMan(e.target.value)}
            onBlur={() => trackToolUse('jutaku-shutoku-shikin', 'amount')}
          />
        </div>
      </div>

      <div className="field">
        <div style={{ fontWeight: 700, marginBottom: 6 }}>住宅の種類</div>
        <Radio
          name="jutaku-kind"
          value={houseKind}
          onChange={setHouseKind}
          options={[
            ['new', '新築・建売の取得・増改築'],
            ['existing', '既存住宅（中古）の取得'],
          ]}
        />
      </div>

      <div className="field">
        <div style={{ fontWeight: 700, marginBottom: 6 }}>省エネ等住宅の基準を満たすか</div>
        <Radio
          name="jutaku-energy"
          value={energy}
          onChange={(v) => {
            setEnergy(v);
            trackToolUse('jutaku-shutoku-shikin', 'energy');
          }}
          options={[
            ['yes', 'はい'],
            ['no', 'いいえ'],
            ['unknown', 'わからない'],
          ]}
        />
        <p className="hint">
          {houseKind === 'new'
            ? '新築等は、断熱等性能等級5以上かつ一次エネルギー消費量等級6以上／耐震等級2以上または免震／高齢者等配慮対策等級3以上のいずれか（2023年12月31日までに建築確認を受けたものは等級4でよい緩和あり）。'
            : '既存住宅は、断熱等性能等級4以上または一次エネルギー消費量等級4以上／耐震等級2以上または免震／高齢者等配慮対策等級3以上のいずれか。'}
          住宅性能証明書などの証明書で確かめます。
        </p>
      </div>

      <div className="field">
        <label htmlFor="jutaku-area">床面積（㎡）</label>
        <input
          id="jutaku-area"
          type="number"
          inputMode="decimal"
          min={0}
          step={0.01}
          value={floorArea}
          onChange={(e) => setFloorArea(e.target.value)}
        />
        <p className="hint">登記簿上の床面積。マンションは専有部分の面積です。40㎡以上240㎡以下が対象です。</p>
      </div>

      <details className="field">
        <summary style={{ cursor: 'pointer' }}>受け取る人・贈与者・課税方式（細かい要件）</summary>

        <div className="field" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>受け取る人は、贈与を受ける年の1月1日に18歳以上か</div>
          <Radio
            name="jutaku-adult"
            value={adult ? 'y' : 'n'}
            onChange={(v) => setAdult(v === 'y')}
            options={[
              ['y', '18歳以上'],
              ['n', '18歳未満'],
            ]}
          />
          {cutoff && (
            <p className="hint">
              {giftYear}年の贈与なら、{cutoff.year}年1月2日以前に生まれた人が18歳以上です。
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="jutaku-income">受け取る人の、贈与を受ける年の合計所得金額（万円）</label>
          <input
            id="jutaku-income"
            type="number"
            inputMode="decimal"
            min={0}
            step={10}
            value={incomeMan}
            onChange={(e) => setIncomeMan(e.target.value)}
          />
          <p className="hint">
            {manYen(elig?.incomeLimit ?? 20_000_000)}以下が要件です（床面積40㎡以上50㎡未満は1,000万円以下）。
            給与だけなら、年収から給与所得控除を引いた額です。
          </p>
        </div>

        <div className="field" style={{ display: 'grid', gap: 8 }}>
          <Check checked={lineal} onChange={setLineal}>
            贈与者は父母・祖父母など<strong>直系尊属</strong>（配偶者の父母は当たりません）
          </Check>
          <Check checked={moveIn} onChange={setMoveIn}>
            {giftYear ? `${giftYear + 1}年3月15日` : '翌年3月15日'}までに<strong>引渡しを受け（新築・取得・増改築を済ませ）</strong>
            、住むことができる（同日後遅滞なく住むことが確実な場合を含む）
          </Check>
          <Check checked={residential} onChange={setResidential}>
            床面積の2分の1以上が居住用
          </Check>
          {houseKind === 'existing' && (
            <Check checked={quakeOk} onChange={setQuakeOk}>
              昭和57年（1982年）以降の建築か、耐震基準に適合している（取得までに耐震改修する場合を含む）
            </Check>
          )}
        </div>

        <div className="field">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>見出しに出す課税方式</div>
          <Radio
            name="jutaku-method"
            value={method}
            onChange={setMethod}
            options={[
              ['rekinen', '暦年課税（ふつうの贈与）'],
              ['seisan', '相続時精算課税'],
            ]}
          />
        </div>

        {method === 'seisan' && (
          <div className="field">
            <label htmlFor="jutaku-used-special">前の年までに使った相続時精算課税の特別控除の累計（万円）</label>
            <input
              id="jutaku-used-special"
              type="number"
              inputMode="decimal"
              min={0}
              max={SETTLEMENT_SPECIAL_DEDUCTION / 10_000}
              step={10}
              value={usedSpecialMan}
              onChange={(e) => setUsedSpecialMan(e.target.value)}
            />
            <p className="hint">特別控除{manYen(SETTLEMENT_SPECIAL_DEDUCTION)}は同じ贈与者からの累計の枠です。初めてなら0のまま。</p>
          </div>
        )}
      </details>

      {elig === null || giftYear === null ? (
        <div className="panel quiet">
          <p className="hint" style={{ margin: 0 }}>
            贈与を受ける日を入れると判定します。
          </p>
        </div>
      ) : (
        <>
          {/* 1 段目：使える／使えない */}
          <div className="panel" style={{ textAlign: 'center' }}>
            <p style={{ margin: '0 0 6px', fontSize: '1.2rem' }}>
              <strong>{elig.ok ? '非課税の特例を使える' : '非課税の特例は使えない'}</strong>
            </p>
            {elig.ok ? (
              <div className="metric">
                <span className="value">{(elig.limit / 10_000).toLocaleString('ja-JP')}</span>
                <span className="unit">万円</span>
                <span className="label">
                  まで非課税（{energy === 'yes' ? '省エネ等住宅' : '省エネ等住宅以外'}）
                </span>
              </div>
            ) : (
              <ul style={{ textAlign: 'left', margin: '6px 0 0' }}>
                {elig.failures.map((f) => (
                  <li key={f}>{failureMessage(f, { giftYear, incomeLimit: elig.incomeLimit })}</li>
                ))}
              </ul>
            )}
            {elig.certificateBonus > 0 && (
              <p className="hint" style={{ margin: '6px 0 0' }}>
                「わからない」は{manYen(LIMITS.other)}で計算しています。省エネ等住宅の証明書があれば
                <strong>+{manYen(elig.certificateBonus)}</strong>（{manYen(LIMITS.energySaving)}まで）になります。
              </p>
            )}
          </div>

          {periodMessage(elig.period) && <div className="note">{periodMessage(elig.period)}</div>}

          {/* 2 段目：2 方式 */}
          <div className="panel" style={{ textAlign: 'center' }}>
            <div className="metric">
              <span className="value">{headline.toLocaleString('ja-JP')}</span>
              <span className="unit">円</span>
              <span className="label">が残りの贈与税（{method === 'rekinen' ? '暦年課税' : '相続時精算課税'}）</span>
            </div>
          </div>

          {narrow ? (
            <>
              <MethodTable title="暦年課税" rows={rekinenRows(rekinen)} />
              <MethodTable title="相続時精算課税" rows={seisanRows(seisan)} />
            </>
          ) : (
            <table>
              <thead>
                <tr>
                  <th />
                  <th>暦年課税</th>
                  <th>相続時精算課税</th>
                </tr>
              </thead>
              <tbody>
                {rekinenRows(rekinen).map(([label, r], i) => (
                  <tr key={label}>
                    <td style={rowLabel}>{i === rekinenRows(rekinen).length - 1 ? <strong>{label}</strong> : label}</td>
                    <td>{r}</td>
                    <td>{seisanRows(seisan)[i][1]}</td>
                  </tr>
                ))}
                <tr>
                  <td style={rowLabel}>残りの特別控除</td>
                  <td>—</td>
                  <td>{yen(seisan.settlement.specialDeductionLeft)}</td>
                </tr>
              </tbody>
            </table>
          )}
          {narrow && (
            <p className="hint">相続時精算課税の残りの特別控除：{yen(seisan.settlement.specialDeductionLeft)}</p>
          )}

          <p className="hint">
            {usedSpecial === 0 && FIRST_SETTLEMENT_NOTE}
            {SETTLEMENT_IRREVOCABLE_NOTE}
            {SETTLEMENT_AGE_NOTE}
            相続時精算課税の非課税分を除いた額（基礎控除後）は、相続のときに相続財産に加算されます。
            どちらが向くかは財産の総額・家族構成で変わるため、ここでは差額を並べるところまでにしています
            （差額 {yen(Math.abs(rekinen.tax - seisan.tax))}）。
            {!(lineal && adult) && ' 直系尊属から18歳以上への贈与でないため、暦年課税は一般税率で計算しています。'}
          </p>

          {/* 3 段目：期限 */}
          <Deadlines giftYear={giftYear} />
        </>
      )}
    </div>
  );
}

type Row = readonly [string, string];

function rekinenRows(r: ReturnType<typeof rekinenAfterExclusion>): Row[] {
  return [
    ['贈与額', yen(r.amount)],
    ['非課税分', `−${yen(r.exclusion)}`],
    ['基礎控除', `−${yen(r.basicDeduction)}`],
    ['課税対象', yen(r.taxable)],
    ['税率', r.bracket ? `${pct(r.bracket.rate)}（控除 ${yen(r.bracket.deduction)}）` : '—'],
    ['贈与税', yen(r.tax)],
  ];
}

function seisanRows(s: ReturnType<typeof settlementAfterExclusion>): Row[] {
  const st = s.settlement;
  return [
    ['贈与額', yen(s.amount)],
    ['非課税分', `−${yen(s.exclusion)}`],
    ['基礎控除', `−${yen(s.afterExclusion - st.afterBasic)}`],
    ['課税対象', `${yen(st.taxable)}（特別控除 −${yen(st.specialDeductionUsed)} の後）`],
    ['税率', '20%'],
    ['贈与税', yen(s.tax)],
  ];
}

/** 320px 幅で使う 1 方式の表（見出しに方式名を出す） */
function MethodTable({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th colSpan={2}>{title}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, v], i) => (
          <tr key={label}>
            <td style={rowLabel}>{i === rows.length - 1 ? <strong>{label}</strong> : label}</td>
            <td>{i === rows.length - 1 ? <strong>{v}</strong> : v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Deadlines({ giftYear }: { giftYear: number }) {
  const d = deadlines(giftYear);
  return (
    <>
      <h3>期限</h3>
      <table>
        <tbody>
          <tr>
            <td style={rowLabel}>引渡しを受けて住むまで</td>
            <td>{formatJaWithWeekday(d.moveIn)}まで</td>
          </tr>
          <tr>
            <td style={rowLabel}>贈与税の申告</td>
            <td>
              {formatJaWithWeekday(d.filingFrom)}〜{formatJaWithWeekday(d.filingTo.due)}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="hint">
        <strong>{FILING_NOTE}</strong>
        申告書に戸籍謄本・登記事項証明書・契約書の写しなどを添えます（省エネ等住宅なら性能の証明書も）。
        {d.filingTo.shiftedBecause && ` 3月15日が${d.filingTo.shiftedBecause}のため、申告の期限は翌開庁日です。`}
      </p>
    </>
  );
}
