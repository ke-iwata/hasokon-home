'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { trackToolUse } from '@/lib/analytics';
import {
  MONTHS_FROM_REFORM_IN_2026,
  PARKING_CAP,
  PARKING_UNIT_LABELS,
  TOTAL_CAP,
  bandLabel,
  calcTsukinTeate,
  type CommuteMode,
  type ParkingExclusion,
  type ParkingFee,
  type Period,
} from '@/lib/tsukin-teate';

const yen = (v: number) => `${Math.round(v).toLocaleString('ja-JP')}円`;

const SLUG = 'tsukin-teate-hikazei';

/** 駐車場の加算が付かない理由の説明 */
const EXCLUSION_TEXT: Record<Exclude<ParkingExclusion, 'none'>, string> = {
  'transit-only': '交通機関のみの通勤なので、駐車場代の加算はありません。',
  'under-2km': '交通用具を使う片道の距離が2km未満の人は、駐車場代の加算の対象外です（国税庁Q&A Q3-4）。',
  'not-eligible-location':
    '加算の対象は勤務先の周辺か、通勤で使う駅・停留所・空港などの周辺の駐車場等だけです。自宅付近の駐車場は対象外です（Q2-4）。',
  'before-reform': '駐車場代の加算は令和8年4月1日以後に支払われるべき通勤手当からの制度です。',
};

export default function Calculator() {
  const [mode, setMode] = useState<CommuteMode>('vehicle');
  const [distance, setDistance] = useState('20');
  const [allowance, setAllowance] = useState('15000');
  const [fare, setFare] = useState('');
  const [parkingAmount, setParkingAmount] = useState('');
  const [parkingUnit, setParkingUnit] = useState<ParkingFee['unit']>('months');
  const [parkingPeriod, setParkingPeriod] = useState('1');
  const [nearWork, setNearWork] = useState(true);
  const [period, setPeriod] = useState<Period>('from-2026-04');

  const usesVehicle = mode !== 'transit';
  const usesTransit = mode !== 'vehicle';

  const parkingFee = useMemo<ParkingFee>(() => {
    const amount = Number(parkingAmount) || 0;
    const n = Number(parkingPeriod) || 0;
    switch (parkingUnit) {
      case 'months':
        return { unit: 'months', amount, months: n };
      case 'years':
        return { unit: 'years', amount, years: n };
      case 'per-use':
        return { unit: 'per-use', amount, usesPerMonth: n };
      case 'days':
        return { unit: 'days', amount, days: n };
    }
  }, [parkingAmount, parkingUnit, parkingPeriod]);

  const r = useMemo(
    () =>
      calcTsukinTeate({
        mode,
        distanceKm: Number(distance),
        allowance: Number(allowance) || 0,
        fare: Number(fare) || 0,
        parking: parkingAmount ? { fee: parkingFee, nearWorkOrStation: nearWork } : undefined,
        period,
      }),
    [mode, distance, allowance, fare, parkingAmount, parkingFee, nearWork, period],
  );

  const periodLabel: Record<ParkingFee['unit'], string> = {
    months: '何か月分の料金か',
    years: '何年分の料金か',
    'per-use': '1か月に通勤で使う回数',
    days: '何日分の料金か',
  };

  const parkingFormula = (() => {
    const a = Number(parkingAmount) || 0;
    const n = Number(parkingPeriod) || 0;
    switch (parkingUnit) {
      case 'months':
        return n === 1 ? `${yen(a)}` : `${yen(a)} ÷ ${n}`;
      case 'years':
        return `${yen(a)} ÷ (12 × ${n})`;
      case 'per-use':
        return `${yen(a)} × ${n}回`;
      case 'days':
        return `${yen(a)} × 365 ÷ ${n} ÷ 12`;
    }
  })();

  const allowanceNum = Number(allowance) || 0;

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="mode">通勤の手段</label>
        <select
          id="mode"
          value={mode}
          onChange={(e) => {
            setMode(e.target.value as CommuteMode);
            trackToolUse(SLUG, 'select-mode');
          }}
        >
          <option value="vehicle">マイカー・バイク・自転車など</option>
          <option value="transit">電車・バスなど交通機関のみ（有料道路を含む）</option>
          <option value="both">交通機関と交通用具の併用</option>
        </select>
      </div>

      {usesVehicle && (
        <div className="field">
          <label htmlFor="distance">
            片道の通勤距離（km）{mode === 'both' && '：マイカー・自転車などを使う区間'}
          </label>
          <input
            id="distance"
            type="number"
            inputMode="decimal"
            min={0}
            step={0.1}
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
          />
          <p className="hint">
            区分の境目（10km・15km…）ちょうどは上の区分に入ります（10.0kmは7,300円）。片道2km未満は全額課税です。
          </p>
        </div>
      )}

      {mode === 'transit' && (
        <div className="field">
          <label htmlFor="fare">定期代など交通機関の運賃（月額。有料道路の料金を含む）</label>
          <input
            id="fare"
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            value={fare}
            onChange={(e) => setFare(e.target.value)}
          />
          <p className="hint">経済的かつ合理的な経路・方法の1か月当たりの額です。3か月・6か月定期なら月あたりに割ってください。</p>
        </div>
      )}

      <div className="field">
        <label htmlFor="allowance">勤務先から支給されている通勤手当（月額）</label>
        <input
          id="allowance"
          type="number"
          inputMode="numeric"
          min={0}
          step={1000}
          value={allowance}
          onChange={(e) => {
            setAllowance(e.target.value);
          }}
          onBlur={() => trackToolUse(SLUG, 'input-allowance')}
        />
        <p className="hint">
          給与明細の通勤手当（定期券の現物支給・会社が直接払っている駐車場代も含めます）。0にすると「いくらまで非課税で出せるか」の早見になります。
        </p>
      </div>

      <details className="field">
        <summary style={{ cursor: 'pointer' }}>駐車場・定期代・計算する月</summary>

        {usesVehicle && (
          <>
            <div className="field">
              <span className="field-label">駐車場・駐輪場の料金（消費税込み）</span>
              <div className="field-row">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={100}
                  aria-label="駐車場・駐輪場の料金（円）"
                  placeholder="料金（円）"
                  value={parkingAmount}
                  onChange={(e) => setParkingAmount(e.target.value)}
                />
                <select
                  aria-label="料金の単位"
                  value={parkingUnit}
                  onChange={(e) => {
                    const unit = e.target.value as ParkingFee['unit'];
                    setParkingUnit(unit);
                    setParkingPeriod(unit === 'per-use' ? '20' : unit === 'days' ? '7' : '1');
                  }}
                >
                  {(Object.keys(PARKING_UNIT_LABELS) as ParkingFee['unit'][]).map((u) => (
                    <option key={u} value={u}>
                      {PARKING_UNIT_LABELS[u]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="parking-period">{periodLabel[parkingUnit]}</label>
              <input
                id="parking-period"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={parkingPeriod}
                onChange={(e) => setParkingPeriod(e.target.value)}
              />
              <p className="hint">
                {parkingUnit === 'per-use'
                  ? '料金には1回あたりの額を入れます（回数券なら綴りの値段 ÷ 枚数、コインパーキングなら1時間の料金 × 平均の利用時間）。'
                  : '月極・3か月払いは「月単位」、年払いは「年単位」、7日券などは「日単位」。コインパーキングに1か月で払った合計なら「月単位・1」で入れます。複数の駐車場を使うときは、1か月あたりに直した合計を入れてください。'}
              </p>
            </div>
            <div className="field">
              <label>
                <input
                  type="checkbox"
                  checked={nearWork}
                  onChange={(e) => setNearWork(e.target.checked)}
                />{' '}
                勤務先か、通勤で使う駅・停留所・空港などの周辺の駐車場（自宅付近は対象外）
              </label>
            </div>
          </>
        )}

        {mode === 'both' && (
          <div className="field">
            <label htmlFor="fare-both">定期代など交通機関の運賃（月額。有料道路の料金を含む）</label>
            <input
              id="fare-both"
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              value={fare}
              onChange={(e) => setFare(e.target.value)}
            />
          </div>
        )}

        <div className="field">
          <label htmlFor="period">計算する月</label>
          <select
            id="period"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value as Period);
              trackToolUse(SLUG, 'select-period');
            }}
          >
            <option value="from-2026-04">令和8年（2026年）4月以後に支払われる分（改正後）</option>
            <option value="before-2026-04">令和8年3月以前に支払われた分（改正前）</option>
          </select>
          <p className="hint">
            改正前の表は55km以上が一律38,700円で、駐車場代の加算がありません。年末調整で1〜3月分を確かめるときに使います。
          </p>
        </div>
      </details>

      <div className="panel">
        <div className="metric">
          {r.taxableMonthly > 0 ? (
            <>
              <span className="value">{r.taxableMonthly.toLocaleString('ja-JP')}</span>
              <span className="unit">円</span>
              <span className="label">が課税される額（月）</span>
            </>
          ) : (
            <>
              <span className="value">全額非課税</span>
              <span className="label">
                {allowanceNum > 0 ? `（支給額${yen(allowanceNum)}は限度額以内）` : '（支給額が0円）'}
              </span>
            </>
          )}
        </div>
        <p className="hint" style={{ marginBottom: 0 }}>
          1か月あたりの非課税限度額は <strong>{yen(r.limit)}</strong>
          {allowanceNum > 0 && (
            <>
              。支給額{yen(allowanceNum)}のうち、非課税は{yen(r.nonTaxableMonthly)}です
            </>
          )}
          。
        </p>
      </div>

      <table>
        <thead>
          <tr>
            <th>内訳</th>
            <th>金額（月）</th>
          </tr>
        </thead>
        <tbody>
          {usesTransit && (
            <tr>
              <td style={{ textAlign: 'left' }}>交通機関の運賃等</td>
              <td style={{ whiteSpace: 'nowrap' }}>{yen(r.fare)}</td>
            </tr>
          )}
          {usesVehicle && (
            <tr>
              <td style={{ textAlign: 'left' }}>
                距離区分の限度額
                <span style={{ color: 'var(--muted)' }}>
                  （{r.band ? `片道${bandLabel(r.band)}` : '片道2km未満は全額課税'}）
                </span>
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>{yen(r.distanceLimit)}</td>
            </tr>
          )}
          {usesVehicle && r.parkingMonthly > 0 && (
            <tr>
              <td style={{ textAlign: 'left' }}>
                駐車場等の加算
                <span style={{ color: 'var(--muted)' }}>
                  （{parkingFormula} ＝ 月{yen(r.parkingMonthly)}
                  {r.parkingCapped && `、上限${yen(PARKING_CAP)}`}）
                </span>
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>{yen(r.parkingAddition)}</td>
            </tr>
          )}
          {r.totalCapped && (
            <tr>
              <td style={{ textAlign: 'left' }}>
                合計（{yen(r.sumBeforeCap)}）は上限{yen(TOTAL_CAP)}で頭打ち
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>−{yen(r.sumBeforeCap - TOTAL_CAP)}</td>
            </tr>
          )}
          <tr>
            <td style={{ textAlign: 'left' }}>
              <strong>非課税限度額</strong>
            </td>
            <td style={{ whiteSpace: 'nowrap' }}>
              <strong>{yen(r.limit)}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      {r.parkingExclusion && r.parkingExclusion !== 'none' && (
        <p className="hint">{EXCLUSION_TEXT[r.parkingExclusion]}</p>
      )}
      {r.parkingMonthly > 0 && !r.parkingExclusion && (
        <p className="hint">1か月あたりに直した料金に1円未満の端数が出たときは切り上げています。</p>
      )}

      {r.taxableMonthly > 0 && (
        <div className="panel quiet">
          <dl className="kv">
            <div>
              <dt>毎月同額なら1年分（12か月）</dt>
              <dd>{yen(r.taxableAnnual)}</dd>
            </div>
            {period === 'from-2026-04' && (
              <div>
                <dt>令和8年4月〜12月（{MONTHS_FROM_REFORM_IN_2026}か月）</dt>
                <dd>{yen(r.taxableMonthly * MONTHS_FROM_REFORM_IN_2026)}</dd>
              </div>
            )}
          </dl>
          <p className="hint" style={{ marginBottom: 0 }}>
            この課税される分は<strong>給与収入（源泉徴収票の支払金額）に入り</strong>、所得税・住民税の対象になります。
            税額は他の所得で決まるので、ここでは出しません。
            <Link href="/nenmatsu-chosei/">年末調整 還付金 計算機</Link>・
            <Link href="/tedori-keisan/">手取り計算機</Link>で確かめられます。
          </p>
        </div>
      )}

      <div className="note">
        所得税の非課税限度額だけを計算しています。<strong>社会保険料の計算では、通勤手当は非課税分も含めて全額が報酬に入ります。</strong>
        新幹線・特急を使う場合に「合理的な運賃」に当たるかどうかは個別の事情によるため、判定していません。
      </div>
    </div>
  );
}
