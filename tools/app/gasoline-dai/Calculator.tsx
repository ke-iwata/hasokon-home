'use client';

import Link from 'next/link';
import { useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import {
  FUEL_LABELS,
  PRICE_RISE,
  acceptsInteger,
  acceptsOneDecimal,
  acceptsPrice,
  calcMonthly,
  calcTrip,
  defaultPrice,
  formatLiters,
  formatYen,
  monthlyDetailLines,
  priceAsOfLabel,
  tripCopyText,
  type FuelType,
} from '@/lib/gasoline-dai';

type Mode = 'trip' | 'monthly';

const choiceStyle = (on: boolean) => ({
  padding: '8px 0',
  fontWeight: on ? 700 : 400,
  background: on ? 'var(--accent-soft)' : undefined,
});

const FUELS: FuelType[] = ['regular', 'highOctane', 'diesel'];
const PEOPLE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function Calculator() {
  const [mode, setMode] = useState<Mode>('trip');
  const [distance, setDistance] = useState('');
  const [roundTrip, setRoundTrip] = useState(true);
  const [kmPerLiter, setKmPerLiter] = useState('');
  const [fuel, setFuel] = useState<FuelType>('regular');
  const [price, setPrice] = useState(String(defaultPrice('regular')));
  const [extra, setExtra] = useState('');
  const [people, setPeople] = useState(1);
  const [driverExempt, setDriverExempt] = useState(false);
  const [monthlyKm, setMonthlyKm] = useState('');
  const [priceRise, setPriceRise] = useState<number>(PRICE_RISE.default);
  const [copied, setCopied] = useState(false);

  const asOf = priceAsOfLabel(fuel, price);

  const tripInput = {
    distanceKm: distance,
    roundTrip,
    kmPerLiter,
    pricePerLiter: price,
    extraYen: extra,
    people,
    driverExempt,
  };
  const trip = calcTrip(tripInput);
  const monthly = calcMonthly({ monthlyKm, kmPerLiter, pricePerLiter: price, fuel, priceRise });
  const result = mode === 'trip' ? trip : monthly;

  /** 入力の欄：受け付けない文字列（小数2桁目など）は反映しない */
  const gate = (accept: (t: string) => boolean, set: (t: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = e.target.value.replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
    if (accept(t)) set(t);
  };

  const onCopy = async () => {
    if (!trip.ok) return;
    try {
      await navigator.clipboard.writeText(tripCopyText(tripInput, trip));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      trackToolUse('gasoline-dai', 'copy');
    } catch {
      // クリップボードが使えない環境では何もしない
    }
  };

  return (
    <div className="card">
      <div className="field">
        <div className="field-row" role="group" aria-label="計算の種類" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {(['trip', 'monthly'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                trackToolUse('gasoline-dai', m === 'trip' ? 'mode-trip' : 'mode-monthly');
              }}
              style={choiceStyle(mode === m)}
            >
              {m === 'trip' ? '1回のドライブ' : '毎月・1年'}
            </button>
          ))}
        </div>
      </div>

      {mode === 'trip' ? (
        <div className="field">
          <label htmlFor="gd-distance">距離（片道・km）</label>
          <input
            id="gd-distance"
            type="text"
            inputMode="decimal"
            value={distance}
            onChange={gate(acceptsOneDecimal, setDistance)}
          />
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
            <input type="checkbox" checked={roundTrip} onChange={(e) => setRoundTrip(e.target.checked)} />
            往復にする（距離×2）
          </label>
        </div>
      ) : (
        <div className="field">
          <label htmlFor="gd-monthly">毎月の走行距離（km）</label>
          <input
            id="gd-monthly"
            type="text"
            inputMode="decimal"
            value={monthlyKm}
            onChange={gate(acceptsOneDecimal, setMonthlyKm)}
          />
          <p className="hint">例：通勤 片道 10 km×往復×月 20 日＝400 km</p>
        </div>
      )}

      <div className="field-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="field">
          <label htmlFor="gd-kmpl">燃費（km/L）</label>
          <input
            id="gd-kmpl"
            type="text"
            inputMode="decimal"
            value={kmPerLiter}
            onChange={gate(acceptsOneDecimal, setKmPerLiter)}
          />
        </div>
        <div className="field">
          <label htmlFor="gd-fuel">油種</label>
          <select
            id="gd-fuel"
            value={fuel}
            onChange={(e) => {
              const f = e.target.value as FuelType;
              setFuel(f);
              setPrice(String(defaultPrice(f)));
            }}
          >
            {FUELS.map((f) => (
              <option key={f} value={f}>
                {FUEL_LABELS[f]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="hint" style={{ marginTop: -8 }}>燃費の目安：軽 20・普通車 15・ミニバン 11（実燃費はカタログより2〜3割悪め）</p>

      <div className="field">
        <label htmlFor="gd-price">単価（円/L）</label>
        <input id="gd-price" type="text" inputMode="decimal" value={price} onChange={gate(acceptsPrice, setPrice)} />
        <p className="hint">
          {asOf ?? '入力した単価で計算しています。'}{' '}
          {!asOf && (
            <button type="button" onClick={() => setPrice(String(defaultPrice(fuel)))} style={{ padding: '2px 8px' }}>
              全国平均に戻す
            </button>
          )}
        </p>
      </div>

      {mode === 'trip' ? (
        <>
          <div className="field">
            <label htmlFor="gd-extra">高速代・駐車場代など（円）</label>
            <input id="gd-extra" type="text" inputMode="numeric" value={extra} placeholder="0" onChange={gate(acceptsInteger, setExtra)} />
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="gd-people">人数</label>
              <select id="gd-people" value={people} onChange={(e) => setPeople(Number(e.target.value))}>
                {PEOPLE.map((n) => (
                  <option key={n} value={n}>
                    {n}人
                  </option>
                ))}
              </select>
            </div>
            {people >= 2 && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={driverExempt} onChange={(e) => setDriverExempt(e.target.checked)} />
                運転する人は払わない
              </label>
            )}
          </div>
        </>
      ) : (
        <div className="field">
          <label htmlFor="gd-rise">単価が上がったら：＋{priceRise} 円/L</label>
          <input
            id="gd-rise"
            type="range"
            min={PRICE_RISE.min}
            max={PRICE_RISE.max}
            step={1}
            value={priceRise}
            onChange={(e) => setPriceRise(Number(e.target.value))}
          />
        </div>
      )}

      <div aria-live="polite">
        {!result.ok ? (
          <div className="panel quiet">
            <p className="hint" style={{ margin: 0 }}>
              {result.problems.join('。')}。
            </p>
          </div>
        ) : mode === 'trip' && trip.ok ? (
          <>
            <div className="panel">
              <div className="metric">
                <span className="label">ガソリン代</span>
                <span className="value">{formatYen(trip.fuelYen)}</span>
                <span className="unit">円</span>
                <span className="label">（{formatLiters(trip.liters)} L）</span>
              </div>
              {trip.people >= 2 && (
                <div className="metric" style={{ marginTop: 8 }}>
                  <span className="label">1人</span>
                  <span className="value">{formatYen(trip.perPersonYen)}</span>
                  <span className="unit">円</span>
                  <span className="label">
                    （{trip.payers}人で割り勘
                    {trip.overCollectedYen > 0 && `・集めすぎ ${formatYen(trip.overCollectedYen)}円は幹事に残る分`}）
                  </span>
                </div>
              )}
            </div>
            <dl className="kv">
              <div>
                <dt>走る距離</dt>
                <dd>{String(Math.round(trip.km * 10) / 10)} km</dd>
              </div>
              <div>
                <dt>高速代など込みの合計</dt>
                <dd>{formatYen(trip.totalYen)} 円</dd>
              </div>
            </dl>
            <div className="field-row" style={{ marginTop: 12 }}>
              <button type="button" onClick={onCopy}>
                {copied ? 'コピーしました' : 'この内訳をコピー'}
              </button>
            </div>
            {trip.people >= 2 && (
              <p className="hint">
                傾斜をつけるなら<Link href="/warikan/">割り勘計算機</Link>へ（合計 {formatYen(trip.totalYen)} 円を入れてください）。
              </p>
            )}
          </>
        ) : monthly.ok ? (
          <>
            <div className="panel">
              <div className="metric">
                <span className="label">月</span>
                <span className="value">{formatYen(monthly.monthYen)}</span>
                <span className="unit">円</span>
                <span className="label">・年</span>
                <span className="value">{formatYen(monthly.yearYen)}</span>
                <span className="unit">円</span>
              </div>
              <p className="hint" style={{ margin: '6px 0 0' }}>
                給油量 月 {formatLiters(monthly.litersPerMonth)} L・年 {formatLiters(monthly.litersPerYear)} L
              </p>
            </div>
            <dl className="kv">
              {monthlyDetailLines(monthly).map((l) => (
                <div key={l.label}>
                  <dt>{l.label}</dt>
                  <dd>{l.value}</dd>
                </div>
              ))}
            </dl>
            {/* dl > div の中には dt / dd しか置けないので、注記は dl の後ろに出す（注記のある行は最後の行） */}
            {monthlyDetailLines(monthly)
              .filter((l) => l.note)
              .map((l) => (
                <p key={l.label} className="hint" style={{ margin: 0 }}>
                  {l.note}
                </p>
              ))}
          </>
        ) : null}
      </div>
    </div>
  );
}
