'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { trackToolUse } from '@/lib/analytics';
import {
  EXPRESSWAY_CLASSES,
  ROADS,
  SUSPENSION_POINTS,
  VEHICLES,
  formatYen,
  judge,
  roadById,
  type Area,
  type ExpresswayClass,
  type Outcome,
  type RoadId,
  type VehicleId,
  type Violation,
} from '@/lib/sokudo-ihan';

const toInt = (v: string) => (v.trim() === '' ? Number.NaN : Number(v));

function Radios<T extends string>({
  name,
  label,
  hint,
  value,
  options,
  onChange,
}: {
  name: string;
  label: string;
  hint?: ReactNode;
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend style={{ fontWeight: 700, marginBottom: 6 }}>{label}</legend>
      <div style={{ display: 'grid', gap: 4, fontSize: 'var(--fs-sm)' }}>
        {options.map((o) => (
          <label key={o.value} style={{ fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="radio"
              name={name}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              style={{ width: 'auto' }}
            />
            {o.label}
          </label>
        ))}
      </div>
      {hint && (
        <p className="hint" style={{ marginTop: 6 }}>
          {hint}
        </p>
      )}
    </fieldset>
  );
}

function ViolationView({ v, area }: { v: Violation | null; area: Area }) {
  if (v === null) {
    return (
      <div className="metric">
        <span className="value" style={{ fontSize: 'var(--fs-lg)' }}>
          速度超過ではありません
        </span>
      </div>
    );
  }
  return (
    <>
      <div className="metric">
        <span className="label">反則金</span>
        {v.yen === null ? (
          <span className="value" style={{ fontSize: 'var(--fs-lg)' }}>
            反則金の対象外（赤切符）
          </span>
        ) : (
          <>
            <span className="value">{v.yen.toLocaleString('ja-JP')}</span>
            <span className="unit">円</span>
          </>
        )}
      </div>
      <dl className="kv">
        <div>
          <dt>超過速度</dt>
          <dd>{v.excess}km/h</dd>
        </div>
        <div>
          <dt>違反点数（基礎点数）</dt>
          <dd>{v.points}点</dd>
        </div>
      </dl>
      {v.yen === null && (
        <p className="hint" style={{ marginTop: 6 }}>
          {area === 'general' ? '一般道路で30km/h以上' : '高速道路で40km/h以上'}
          の超過は刑事手続になり、罰金の額は裁判で決まります。
        </p>
      )}
      {v.points >= SUSPENSION_POINTS && (
        <p className="hint" style={{ marginTop: 6 }}>
          前歴が無い人でも、累積{SUSPENSION_POINTS}点以上で<strong>免許停止（30日）の対象</strong>になります。
          前歴がある場合・ほかの違反の点数との合計は警視庁の点数一覧表でご確認ください。
        </p>
      )}
    </>
  );
}

function compareText(o: Outcome): string {
  const v = o.violation;
  if (v === null) return '違反なし';
  return `${v.excess}km/h超過・${v.yen === null ? '赤切符' : formatYen(v.yen)}・${v.points}点`;
}

/** ビルド時の日付で描いてからマウント後に今日へ差し替える（静的書き出しなので） */
const BUILD_DEFAULT_DATE = '2026-10-17';

export default function Calculator() {
  const [road, setRoad] = useState<RoadId>('seikatsu');
  const [signKmh, setSignKmh] = useState('40');
  const [signArea, setSignArea] = useState<Area>('general');
  const [speed, setSpeed] = useState('50');
  const [vehicle, setVehicle] = useState<VehicleId>('ordinary');
  const [expresswayClass, setExpresswayClass] = useState<ExpresswayClass | null>('standard');
  const [date, setDate] = useState(BUILD_DEFAULT_DATE);

  useEffect(() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    setDate(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
  }, []);

  const changeVehicle = (v: VehicleId) => {
    setVehicle(v);
    // 大型車は既定を空にして、選ぶまで結果を出さない（大型トラックが 100km/h で判定されないよう）
    if (v === 'large') setExpresswayClass(null);
    else if (expresswayClass === 'heavy-cargo' || expresswayClass === null) setExpresswayClass('standard');
  };

  const r = judge({
    road,
    vehicle,
    expresswayClass,
    date,
    speedKmh: toInt(speed),
    signKmh: road === 'sign' ? toInt(signKmh) : undefined,
    signArea,
  });
  const track = () => trackToolUse('sokudo-ihan-hansokukin', 'calculate');

  return (
    <div className="card">
      <div style={{ display: 'grid', gap: 16 }}>
        <Radios
          name="road"
          label="1. 道路の種類"
          value={road}
          onChange={(v) => {
            setRoad(v);
            track();
          }}
          options={ROADS.map((x) => ({ value: x.id, label: x.label }))}
          hint={roadById(road).hint}
        />

        {road === 'sign' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <label>
              標識の速度（km/h）
              <input
                type="number"
                inputMode="numeric"
                min={10}
                max={120}
                step={10}
                value={signKmh}
                onChange={(e) => setSignKmh(e.target.value)}
                onBlur={track}
              />
            </label>
            <Radios
              name="sign-area"
              label="標識のある道路の区分"
              value={signArea}
              onChange={setSignArea}
              options={[
                { value: 'general', label: '一般道路' },
                { value: 'expressway', label: '高速道路（高速自動車国道・自動車専用道路）' },
              ]}
              hint="30km/h以上の超過で、反則金になるか（高速道路）赤切符になるか（一般道路）が分かれます。首都高・都市高速は高速道路です。"
            />
          </div>
        )}

        <label>
          2. 出した速度（km/h）
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={400}
            value={speed}
            onChange={(e) => setSpeed(e.target.value)}
            onBlur={track}
          />
        </label>

        <Radios
          name="vehicle"
          label="3. 車の種類"
          value={vehicle}
          onChange={changeVehicle}
          options={VEHICLES.map((v) => ({ value: v.id, label: `${v.label}（${v.includes}）` }))}
        />

        {road === 'expressway' && vehicle !== 'moped' && (
          <Radios
            name="expressway-class"
            label="高速道路での区分"
            value={expresswayClass}
            onChange={setExpresswayClass}
            options={EXPRESSWAY_CLASSES.filter((c) => vehicle === 'large' || !c.largeOnly).map((c) => ({
              value: c.id,
              label: c.label,
            }))}
            hint={
              vehicle === 'large'
                ? '特定中型貨物は、中型のトラックのうち車両総重量8t以上・最大積載量5t以上・乗車定員11人以上のどれかにあたるもの。大型特殊自動車は80km/h。大型・中型のバスは「乗用車・下記以外」です。'
                : undefined
            }
          />
        )}

        <label>
          4. 走った日
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
            生活道路の30km/hは2026年9月1日からです。それより前の日は60km/hで判定します
          </span>
        </label>
      </div>

      {r.kind === 'not-allowed' && (
        <div className="note">
          原付・小型特殊自動車は高速道路・自動車専用道路を通行できません。
        </div>
      )}
      {r.kind === 'need-class' && (
        <p className="hint">大型車は、高速道路での区分を選ぶと結果を表示します。</p>
      )}
      {r.kind === 'error' && (
        <p className="hint">
          {r.error === 'sign'
            ? '標識の速度を入れてください。'
            : r.error === 'date'
              ? '走った日を入れてください。'
              : '出した速度をkm/hの整数で入れてください。'}
        </p>
      )}
      {r.kind === 'ok' && (
        <>
          <div className="panel">
            <div className="metric">
              <span className="label">この道の制限速度</span>
              <span className="value">{r.limit}</span>
              <span className="unit">km/h</span>
            </div>
            <p className="hint" style={{ marginTop: 4 }}>
              {r.reason}
            </p>
          </div>
          <div className="panel">
            <ViolationView v={r.violation} area={r.area} />
          </div>
          {r.compare && (
            <div className="panel quiet">
              <dl className="kv">
                <div>
                  <dt>いま（{r.limit}km/h）</dt>
                  <dd>{compareText({ limit: r.limit, violation: r.violation })}</dd>
                </div>
                <div>
                  <dt>引下げ前（{r.compare.limit}km/h）なら</dt>
                  <dd>{compareText(r.compare)}</dd>
                </div>
              </dl>
            </div>
          )}
          <p className="hint">
            反則金・点数は政令の表の写しです。実際の処分は個別の事情で決まります。
          </p>
        </>
      )}
    </div>
  );
}
