'use client';

import { useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import { parseDate } from '@/lib/date-parts';
import {
  LIFETIME_CAP,
  MONTHLY_CAP,
  SCHEDULE_ERROR_MESSAGES,
  START_YM,
  contributionSchedule,
  formatDateJa,
  formatYen,
  formatYmJa,
  isScheduleError,
} from '@/lib/kodomo-nisa';

/** 既定値。「入れたら変わる」型にするため最初から結果を出す */
const DEFAULT_BIRTH = '2020-06-15';
const DEFAULT_MONTHLY = 30000;

const row = { margin: '4px 0 0', fontSize: 'var(--fs-sm)' };
const left = { textAlign: 'left' as const };
/** 320px 幅で横スクロールさせないため余白を詰める */
const tight = { padding: '6px 6px' };

/**
 * こどもNISA シミュレーターの UI。
 *
 * 入力は子の生年月日・積立を始める月・毎月の積立額の3つ。
 * 結果はタイムライン（日付は太字）と、制度から一意に決まる拠出額のカード。
 * 利回りの入力は置かない（仕様書「やらないこと」）。ロジックは lib/kodomo-nisa.ts。
 */
export default function Calculator() {
  const [birth, setBirth] = useState(DEFAULT_BIRTH);
  const [startYm, setStartYm] = useState(START_YM);
  const [monthlyText, setMonthlyText] = useState(String(DEFAULT_MONTHLY));

  const birthParts = parseDate(birth);
  const monthly = Number(monthlyText.replace(/[,，]/g, ''));
  const r = birthParts ? contributionSchedule({ birth: birthParts, startYm, monthly }) : null;

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="kodomo-nisa-birth">子の生年月日</label>
        <input
          id="kodomo-nisa-birth"
          type="date"
          value={birth}
          min="2008-01-01"
          max="2044-12-31"
          onChange={(e) => setBirth(e.target.value)}
          onBlur={() => trackToolUse('kodomo-nisa', 'birth')}
        />
      </div>
      <div className="field">
        <label htmlFor="kodomo-nisa-start">積立を始める月</label>
        <input
          id="kodomo-nisa-start"
          type="month"
          value={startYm}
          min={START_YM}
          max="2044-12"
          onChange={(e) => setStartYm(e.target.value < START_YM ? START_YM : e.target.value)}
        />
        <p className="hint">
          制度は2027年1月に始まるので、それより前は選べません。月を選ぶ欄が出ないブラウザでは「2027-01」の形で入れてください。
        </p>
      </div>
      <div className="field">
        <label htmlFor="kodomo-nisa-monthly">毎月の積立額（円）</label>
        <input
          id="kodomo-nisa-monthly"
          type="number"
          inputMode="numeric"
          min={1000}
          max={MONTHLY_CAP}
          step={1000}
          value={monthlyText}
          onChange={(e) => setMonthlyText(e.target.value)}
          onBlur={() => trackToolUse('kodomo-nisa', 'monthly')}
        />
      </div>

      {!r ? (
        <div className="panel quiet">
          <p className="hint" style={{ margin: 0 }}>
            子の生年月日を入れると、600万円に届く月・払い出せる年・大人の NISA へ移る日が出ます。
          </p>
        </div>
      ) : isScheduleError(r) ? (
        <p className="note" role="alert">
          {SCHEDULE_ERROR_MESSAGES[r]}
        </p>
      ) : (
        <>
          {r.capped && (
            <p className="note" role="alert">
              年60万円（月5万円）が上限です。月{formatYen(MONTHLY_CAP)}で計算しています。
            </p>
          )}
          <p className="hint" style={{ fontWeight: 700 }}>
            途中で払い出さない前提の計算です。
          </p>

          <div className="panel">
            <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)' }}>タイムライン</div>
            <p style={row}>
              積立開始：<strong>{formatYmJa(r.startYm)}</strong>
            </p>
            <p style={row}>
              非課税で払い出せる最初の年：<strong>{r.firstWithdrawalYear}年</strong>
              {r.withdrawableFromStart && <>（開始した年から払い出せます）</>}
            </p>
            <p style={row}>
              600万円に届く月：
              {r.reachedYm ? (
                <strong>{formatYmJa(r.reachedYm)}</strong>
              ) : (
                <>
                  <strong>届かない</strong>（18歳で移るまでの累計 {formatYen(r.total)}）
                </>
              )}
            </p>
            <p style={row}>
              大人の NISA へ移る日：<strong>{formatDateJa(r.transfer)}</strong>
            </p>
            <p className="hint" style={{ margin: '4px 0 0' }}>
              積み立てられるのは{formatYmJa(r.lastYm)}まで（その年の1月1日に17歳の年の12月）。
              払出しの制限は{formatDateJa(r.restrictionEnd)}に外れます。
            </p>
          </div>

          <div className="panel quiet">
            <div className="metric">
              <span className="value" style={{ fontSize: 'clamp(1.15rem, 5.4vw, 1.6rem)' }}>
                {formatYen(r.total)}
              </span>
              <span className="label">18歳で移るまでに積み立てる額（取得価額の累計）</span>
            </div>
            {r.remaining > 0 && (
              <p style={row}>
                {formatYen(LIFETIME_CAP)}の枠の残り：<strong>{formatYen(r.remaining)}</strong>
              </p>
            )}
            <table style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th style={{ ...tight, ...left }}>年</th>
                  <th style={tight}>月数</th>
                  <th style={tight}>その年</th>
                  <th style={tight}>累計</th>
                </tr>
              </thead>
              <tbody>
                {r.years.map((y) => (
                  <tr key={y.year}>
                    <td style={{ ...tight, ...left }}>{y.year}年</td>
                    <td style={tight}>{y.months}</td>
                    <td style={tight}>{formatYen(y.amount)}</td>
                    <td style={tight}>{formatYen(y.cumulative)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint" style={{ margin: '4px 0 0' }}>
              値上がり・値下がりは含みません（利回りによる評価額は出していません）。
            </p>
          </div>
        </>
      )}
    </div>
  );
}
