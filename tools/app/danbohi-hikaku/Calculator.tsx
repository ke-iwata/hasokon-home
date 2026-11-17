'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DEFAULT_UNIT_PRICE, HEATING_PRESETS } from '@/lib/aircon-denkidai';
import { discountFor, formatYearMonth } from '@/lib/denki-gas-shien';
import { KEROSENE_BY_PREF } from '@/lib/gasoline-dai';
import {
  CITY_GAS_13A_MJ_PER_M3,
  GAS_LABELS,
  HEATER_LABELS,
  LPG_MJ_PER_M3,
  MAX_ROWS,
  PRICE_LABELS,
  airconWattEstimate,
  calcRow,
  defaultKerosene18L,
  formatNum,
  formatYen,
  heatUnitTable,
  heaterDefaultUsageMonth,
  heaterUsageMonthOptions,
  parseAmount,
  parsePrice,
  perLiterFrom18L,
  priceDateNotes,
  rankRows,
  type GasType,
  type HeaterKind,
  type HeaterRow,
  type Prices,
} from '@/lib/danbohi-hikaku';
import { trackToolUse } from '@/lib/analytics';

const SLUG = 'danbohi-hikaku';

type RowState = {
  id: number;
  kind: HeaterKind;
  watt: string;
  liters: string;
  gasKw: string;
  gasType: GasType;
  /** エアコンの目安（能力・APF） */
  capacityKw: string;
  apf: string;
};

const KINDS: HeaterKind[] = ['aircon', 'kerosene', 'gas', 'electric', 'kotatsu'];

/** 機器を選んだときの入力例（カタログの値に入れ替えてもらう前提の値） */
function exampleFor(kind: HeaterKind, id: number): RowState {
  const base = { id, kind, watt: '', liters: '', gasKw: '', gasType: 'city13A' as GasType, capacityKw: '', apf: '' };
  switch (kind) {
    case 'aircon':
      // 6 畳用の暖房の定格消費電力（aircon-denkidai.ts の HEATING_PRESETS。メーカーの公式仕様表）
      return { ...base, watt: String(HEATING_PRESETS[0].watt) };
    case 'kerosene':
      return { ...base, liters: '0.25', watt: '10' };
    case 'gas':
      return { ...base, gasKw: '2.5', watt: '10' };
    case 'electric':
      return { ...base, watt: '800' };
    case 'kotatsu':
      return { ...base, watt: '300' };
  }
}

const toRow = (r: RowState): HeaterRow => ({
  kind: r.kind,
  watt: parseAmount(r.watt),
  litersPerHour: parseAmount(r.liters),
  gasKw: parseAmount(r.gasKw),
  gasType: r.gasType,
});

const btn = (on: boolean) => ({
  padding: '6px 10px',
  fontWeight: on ? 700 : 400,
  background: on ? 'var(--accent-soft)' : undefined,
});

const small = { fontSize: 'var(--fs-sm)' } as const;

export default function Calculator() {
  const [rows, setRows] = useState<RowState[]>([exampleFor('aircon', 1), exampleFor('kerosene', 2)]);
  const [nextId, setNextId] = useState(3);
  const [hours, setHours] = useState('8');
  const [days, setDays] = useState('30');
  // 使用月は「開いた日」で決まる。最初の描画（ビルド時の HTML）は「使用月なし＝値引きなし」で出し、
  // マウント後に差し替える（ハイドレーションの食い違いを起こさない）
  const [monthOptions, setMonthOptions] = useState<string[]>([]);
  const [usageMonth, setUsageMonth] = useState<string | null>(null);
  const [pref, setPref] = useState('');
  const [elec, setElec] = useState(String(DEFAULT_UNIT_PRICE));
  const [kerosene, setKerosene] = useState(String(defaultKerosene18L(null)));
  const [keroseneUnit, setKeroseneUnit] = useState<'18L' | '1L'>('18L');
  const [cityGas, setCityGas] = useState('');
  const [lpg, setLpg] = useState('');
  const [cityGasMj, setCityGasMj] = useState(String(CITY_GAS_13A_MJ_PER_M3));
  const [lpgMj, setLpgMj] = useState(String(LPG_MJ_PER_M3));
  const [cop, setCop] = useState('');
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    const today = new Date();
    setMonthOptions(heaterUsageMonthOptions(today));
    setUsageMonth(heaterDefaultUsageMonth(today));
  }, []);

  const keroseneValue = parsePrice(kerosene);
  const prices: Prices = {
    electricity: parsePrice(elec),
    kerosenePerLiter: keroseneValue === null ? null : keroseneUnit === '18L' ? perLiterFrom18L(keroseneValue) : keroseneValue,
    cityGas: parsePrice(cityGas),
    lpg: parsePrice(lpg),
    cityGasMj: parseAmount(cityGasMj) || CITY_GAS_13A_MJ_PER_M3,
    lpgMj: parseAmount(lpgMj) || LPG_MJ_PER_M3,
  };
  const usage = { hoursPerDay: parseAmount(hours), daysPerMonth: parseAmount(days), usageMonth };
  const results = rows.map((r) => calcRow(toRow(r), prices, usage));
  const rank = rankRows(results);
  const discount = usageMonth ? discountFor(usageMonth) : null;
  const heatRows = heatUnitTable(prices, usageMonth, parsePrice(cop));

  const keroseneIsDefault = keroseneUnit === '18L' && keroseneValue === defaultKerosene18L(pref || null);
  const notes = priceDateNotes({
    pref: pref || null,
    keroseneIsDefault,
    electricityIsDefault: parsePrice(elec) === DEFAULT_UNIT_PRICE,
  });

  const update = (id: number, patch: Partial<RowState>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const changeKind = (id: number, kind: HeaterKind) => {
    setRows((rs) => rs.map((r) => (r.id === id ? exampleFor(kind, id) : r)));
    trackToolUse(SLUG, `kind-${kind}`);
  };

  const addRow = () => {
    if (rows.length >= MAX_ROWS) return;
    const used = new Set(rows.map((r) => r.kind));
    const kind = KINDS.find((k) => !used.has(k)) ?? 'electric';
    setRows((rs) => [...rs, exampleFor(kind, nextId)]);
    setNextId((n) => n + 1);
    trackToolUse(SLUG, 'add-row');
  };

  const onPrefChange = (p: string) => {
    setPref(p);
    setKerosene(String(defaultKerosene18L(p || null)));
    setKeroseneUnit('18L');
    trackToolUse(SLUG, 'pref');
  };

  const shienText = (i: number) => {
    const r = results[i];
    if (!r.ok) return null;
    if (r.shien === 'not-covered') {
      const isLpg = rows[i].kind === 'gas';
      const fuelNote = isLpg ? 'LP ガスは国の支援の対象外' : '灯油は対象外（激変緩和措置は店頭価格に織り込み済み）';
      return r.discountMonth > 0 ? `${fuelNote}。送風の電気代 −${formatYen(r.discountMonth)}円` : fuelNote;
    }
    if (r.shien === 'discounted') return `支援の値引き −${formatYen(r.discountMonth)}円`;
    return null;
  };

  return (
    <div className="card">
      <div style={{ display: 'grid', gap: 14 }}>
        {monthOptions.length > 0 && (
          <div className="field" style={{ marginBottom: 0 }} role="group" aria-label="使用月">
            <span className="field-label" style={{ ...small, fontWeight: 600 }}>
              使用月（電気・都市ガスの支援）
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {monthOptions.map((m) => {
                const d = discountFor(m);
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={usageMonth === m}
                    onClick={() => {
                      setUsageMonth(m);
                      trackToolUse(SLUG, 'usage-month');
                    }}
                    style={btn(usageMonth === m)}
                  >
                    {formatYearMonth(m)}
                    {d ? '' : '（支援なし）'}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {rows.map((r, i) => {
          const res = results[i];
          const est = r.kind === 'aircon' ? airconWattEstimate(parseAmount(r.capacityKw), parseAmount(r.apf)) : null;
          return (
            <fieldset key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, margin: 0 }}>
              <legend style={{ ...small, fontWeight: 600 }}>
                {i + 1}台目{rank.cheapest.includes(i) ? '（いちばん安い）' : ''}
                {rows.length > 1 && (
                  <button
                    type="button"
                    aria-label={`${i + 1}台目を消す`}
                    style={{ ...small, marginLeft: 8, padding: '0 8px' }}
                    onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
                  >
                    消す
                  </button>
                )}
              </legend>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                <label>
                  機器
                  <select value={r.kind} onChange={(e) => changeKind(r.id, e.target.value as HeaterKind)}>
                    {KINDS.map((k) => (
                      <option key={k} value={k}>
                        {HEATER_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </label>
                {r.kind === 'kerosene' && (
                  <label>
                    灯油消費量（L/h）
                    <input type="number" inputMode="decimal" min={0} step={0.01} value={r.liters} onChange={(e) => update(r.id, { liters: e.target.value })} />
                  </label>
                )}
                {r.kind === 'gas' && (
                  <>
                    <label>
                      ガスの種類
                      <select value={r.gasType} onChange={(e) => update(r.id, { gasType: e.target.value as GasType })}>
                        <option value="city13A">{GAS_LABELS.city13A}</option>
                        <option value="lpg">{GAS_LABELS.lpg}</option>
                      </select>
                    </label>
                    <label>
                      ガス消費量（kW）
                      <input type="number" inputMode="decimal" min={0} step={0.01} value={r.gasKw} onChange={(e) => update(r.id, { gasKw: e.target.value })} />
                    </label>
                  </>
                )}
                <label>
                  {r.kind === 'kerosene' || r.kind === 'gas' ? '送風などの消費電力（W）' : r.kind === 'aircon' ? '暖房の消費電力（W）' : '消費電力（W）'}
                  <input type="number" inputMode="numeric" min={0} step={1} value={r.watt} onChange={(e) => update(r.id, { watt: e.target.value })} />
                </label>
              </div>
              {r.kind === 'kotatsu' && (
                <p className="hint">
                  カタログの消費電力は「強」で温まるまでの値です。温まったあとはヒーターが入り切りするので、実際の平均はこれより小さくなります（弱ならさらに小さい）。
                </p>
              )}
              {r.kind === 'aircon' && (
                <details style={{ marginTop: 6 }}>
                  <summary style={small}>消費電力がわからないとき（暖房能力と APF から目安）</summary>
                  <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr', marginTop: 6 }}>
                    <label>
                      定格の暖房能力（kW）
                      <input type="number" inputMode="decimal" min={0} step={0.1} value={r.capacityKw} onChange={(e) => update(r.id, { capacityKw: e.target.value })} />
                    </label>
                    <label>
                      APF
                      <input type="number" inputMode="decimal" min={0} step={0.1} value={r.apf} onChange={(e) => update(r.id, { apf: e.target.value })} />
                    </label>
                  </div>
                  {est !== null && (
                    <p className="hint">
                      目安 約{formatYen(est)}W（暖房能力 ÷ APF）。外気温が下がると効率が下がり、霜取り運転でも電気を使うので、寒冷地ではこれより多くなります。{' '}
                      <button type="button" style={btn(false)} onClick={() => update(r.id, { watt: String(Math.round(est)) })}>
                        この値を使う
                      </button>
                    </p>
                  )}
                </details>
              )}
              <div style={{ ...small, marginTop: 6 }}>
                {res.ok ? (
                  <>
                    1か月 <strong style={{ fontSize: 'var(--fs-md)' }}>{formatYen(res.perMonthAfter)}円</strong>
                    {rank.cheapest.includes(i) && rank.cheapestSaves !== null && `（次に安い機器より月 ${formatYen(rank.cheapestSaves)}円安い）`}
                    {rank.moreThanCheapest[i] !== null && `（いちばん安い機器より月 ${formatYen(rank.moreThanCheapest[i]!)}円高い）`}
                  </>
                ) : (
                  <span>単価を入れると出ます（{res.missing.map((k) => PRICE_LABELS[k]).join('・')}の単価）</span>
                )}
              </div>
            </fieldset>
          );
        })}

        {rows.length < MAX_ROWS && (
          <button type="button" onClick={addRow} style={btn(false)}>
            ＋ 機器を足す（最大{MAX_ROWS}台）
          </button>
        )}

        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
          <label>
            1日の使用時間（h）
            <input type="number" inputMode="decimal" min={0} max={24} step={1} value={hours} onChange={(e) => setHours(e.target.value)} />
          </label>
          <label>
            1か月の日数（日）
            <input type="number" inputMode="numeric" min={0} max={31} step={1} value={days} onChange={(e) => setDays(e.target.value)} />
          </label>
        </div>
      </div>

      <h3 style={{ marginTop: 18 }}>結果{discount && usageMonth ? `（${formatYearMonth(usageMonth)}使用分の値引き後）` : ''}</h3>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>機器</th>
              <th>1時間</th>
              <th>1日</th>
              <th>1か月</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const res = results[i];
              const label = r.kind === 'gas' ? `ガスファンヒーター（${GAS_LABELS[r.gasType]}）` : HEATER_LABELS[r.kind];
              const mark = rank.cheapest.includes(i);
              if (!res.ok) {
                return (
                  <tr key={r.id}>
                    <td style={{ textAlign: 'left' }}>{label}</td>
                    <td colSpan={3}>単価を入れると出ます</td>
                  </tr>
                );
              }
              const sh = shienText(i);
              const hasFuel = r.kind === 'kerosene' || r.kind === 'gas';
              return (
                <tr key={r.id}>
                  <td style={{ textAlign: 'left' }}>
                    {mark && <strong>★ いちばん安い </strong>}
                    {label}
                    {hasFuel && (
                      <div style={small}>
                        内訳：燃料 {formatYen(res.fuelMonthAfter)}円＋電気 {formatYen(res.electricityMonthAfter)}円
                        {r.kind === 'gas' && res.m3PerHour !== undefined && `（${formatNum(res.m3PerHour, 3)}㎥/h）`}
                      </div>
                    )}
                    {sh && <div style={small}>{sh}</div>}
                  </td>
                  <td>{formatYen(res.hourlyAfter.total)}円</td>
                  <td>{formatYen(res.hourlyAfter.total * usage.hoursPerDay)}円</td>
                  <td>
                    <strong>{formatYen(res.perMonthAfter)}円</strong>
                    {res.discountMonth > 0 && <div style={small}>値引き前 {formatYen(res.perMonth)}円</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul style={{ ...small, color: 'var(--muted)', paddingLeft: 18 }}>
        {notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>

      <h3 style={{ marginTop: 18 }}>単価（変えると上の結果に反映）</h3>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <label>
          電気（円/kWh）
          <input type="number" inputMode="decimal" min={0} step={0.1} value={elec} onChange={(e) => setElec(e.target.value)} />
        </label>
        <label>
          都道府県（灯油の既定の単価）
          <select value={pref} onChange={(e) => onPrefChange(e.target.value)}>
            <option value="">全国平均</option>
            {KEROSENE_BY_PREF.map((p) => (
              <option key={p.pref} value={p.pref}>
                {p.pref}
              </option>
            ))}
          </select>
        </label>
        <label>
          灯油（円/{keroseneUnit}）
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="number" inputMode="decimal" min={0} step={1} value={kerosene} onChange={(e) => setKerosene(e.target.value)} style={{ flex: 1 }} />
            <select
              value={keroseneUnit}
              onChange={(e) => setKeroseneUnit(e.target.value as '18L' | '1L')}
              aria-label="灯油の単価の単位"
              style={{ width: 'auto' }}
            >
              <option value="18L">18L</option>
              <option value="1L">1L</option>
            </select>
          </div>
        </label>
        <label>
          都市ガス（円/㎥）
          <input type="number" inputMode="decimal" min={0} step={0.01} value={cityGas} placeholder="請求書の単位料金" onChange={(e) => setCityGas(e.target.value)} />
        </label>
        <label>
          LP ガス（円/㎥）
          <input type="number" inputMode="decimal" min={0} step={0.01} value={lpg} placeholder="請求書の単位料金" onChange={(e) => setLpg(e.target.value)} />
        </label>
      </div>
      <p className="hint">
        ガスの単価は会社と契約で大きく違うので既定値を置いていません。請求書（検針票）の「単位料金」（円/㎥。LP ガスは基本料金を含めない従量の単価）を入れてください。
      </p>

      <details open={showDetail} onToggle={(e) => setShowDetail((e.target as HTMLDetailsElement).open)}>
        <summary style={small}>詳しい設定（ガスの発熱量）</summary>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr', marginTop: 6 }}>
          <label>
            都市ガスの発熱量（MJ/㎥）
            <input type="number" inputMode="decimal" min={0} step={0.1} value={cityGasMj} onChange={(e) => setCityGasMj(e.target.value)} />
          </label>
          <label>
            LP ガスの発熱量（MJ/㎥）
            <input type="number" inputMode="decimal" min={0} step={0.1} value={lpgMj} onChange={(e) => setLpgMj(e.target.value)} />
          </label>
        </div>
        <p className="hint">都市ガス 13A は 45 MJ/㎥。地域によって標準熱量が違う都市ガスがあるので、ガス会社の案内の値に変えられます。</p>
      </details>

      <h3 style={{ marginTop: 18 }}>熱 1 kWh あたりの単価（参考）</h3>
      <label style={{ maxWidth: 260 }}>
        エアコンの COP（空なら行を出しません）
        <input type="number" inputMode="decimal" min={0} step={0.1} value={cop} onChange={(e) => setCop(e.target.value)} />
      </label>
      {heatRows.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>燃料</th>
                <th>熱 1 kWh あたり</th>
                <th style={{ textAlign: 'left' }}>式と前提</th>
              </tr>
            </thead>
            <tbody>
              {heatRows.map((h) => (
                <tr key={h.label}>
                  <td style={{ textAlign: 'left' }}>{h.label}</td>
                  <td>{formatNum(h.yenPerKwhHeat, 1)}円</td>
                  <td style={{ textAlign: 'left', ...small }}>
                    {h.formula}（{h.premise}）
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="hint">単価を入れると出ます。</p>
      )}
      <p className="hint">
        燃焼器具の効率（排気で逃げる熱）は入れていません。部屋に排気を出すファンヒーター・ストーブはほぼ 100%、FF 式は 80〜90% 台とカタログで割れるので、比べるときは上の「機器を並べる」のカタログの値で比べてください。
      </p>

      <div className="note">
        計算はカタログの値（燃料消費量・消費電力）で動き続けた場合の目安です。実際は設定温度・外気温・部屋の断熱で変わり、点火時だけ消費電力が大きくなる機種もあります。都道府県や自治体の独自の LP ガス・灯油の支援は入れていないので、お住まいの自治体の案内も見てください。
        エアコンだけを詳しく見るなら <Link href="/aircon-denkidai/">エアコン電気代 計算機</Link>。
      </div>
    </div>
  );
}
