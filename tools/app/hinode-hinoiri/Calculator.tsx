'use client';

import { useEffect, useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import {
  checkLatLon,
  dayLengthChange,
  dayLengthChangeText,
  direction16,
  formatDuration,
  formatHm,
  hatsuhinodeYearFor,
  longDateJa,
  monthTable,
  nextHatsuhinode,
  nextSolstice,
  parseYmd,
  shortDateJa,
  sunTimes,
  todayJst,
  type SunTimes,
} from '@/lib/hinode';
import { DEFAULT_PREF, findCapital, PREFECTURE_CAPITALS } from '@/lib/prefecture-capitals';
import HatsuhinodeList from './HatsuhinodeList';

type Mode = 'pref' | 'latlon';

const TOOL = 'hinode-hinoiri';

/** プルダウンの「緯度・経度を入れる」の値（都道府県名と重ならない） */
const LATLON = '__latlon__';

/** 結果の枠の高さ。マウント前（静的 HTML）と後で変えない（仕様書「今日と時刻の扱い」） */
const RESULT_MIN_HEIGHT = 0;

/** 600px 以上は表、それ未満は日の出・日の入りの2列（CSS クラスを増やさないため matchMedia で切り替える） */
function useWide(): boolean {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 600px)');
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return wide;
}

const btn: React.CSSProperties = {
  width: 'auto',
  padding: '4px 8px',
  marginRight: 6,
  marginBottom: 4,
  fontSize: 'var(--fs-xs)',
  whiteSpace: 'nowrap',
};

/** 方位の1行（「出 東南東 118.1°」）。az が undefined ならマウント前の同じ幅の枠 */
function Azimuth({ label, az }: { label: string; az: number | null | undefined }) {
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      {label} {az === undefined ? '---' : az === null ? '—' : direction16(az)}
      <span className="hint" style={{ fontWeight: 400 }}>
        {' '}
        {az === undefined ? '---.-' : az === null ? '' : az.toFixed(1)}°
      </span>
    </span>
  );
}

function polarText(r: SunTimes): string | null {
  if (r.polar === 'day') return 'この日は一日中太陽が沈みません（白夜）。';
  if (r.polar === 'night') return 'この日は一日中太陽が昇りません（極夜）。';
  return null;
}

export default function Calculator() {
  const [mode, setMode] = useState<Mode>('pref');
  const [pref, setPref] = useState(DEFAULT_PREF);
  const [latText, setLatText] = useState('35.6896');
  const [lonText, setLonText] = useState('139.6918');
  // 「今日」はビルド時に決めない。マウント後に JST の日付で決める（null の間は結果を描かない）
  const [date, setDate] = useState<string | null>(null);
  const wide = useWide();

  useEffect(() => {
    setDate(todayJst(new Date()));
  }, []);

  const capital = findCapital(pref) ?? findCapital(DEFAULT_PREF)!;
  const ll = mode === 'latlon' ? checkLatLon(latText, lonText) : null;
  const loc =
    mode === 'pref'
      ? { lat: capital.lat, lon: capital.lon, label: `${capital.pref}（${capital.city}）`, inJapan: true }
      : ll && ll.ok
        ? { lat: ll.lat, lon: ll.lon, label: `北緯${ll.lat}°・東経${ll.lon}°`, inJapan: ll.inJapan }
        : null;

  const valid = date !== null && parseYmd(date) !== null;
  const result = valid && loc ? sunTimes({ lat: loc.lat, lon: loc.lon, date: date! }) : null;
  const diff = valid && loc && !result?.polar ? dayLengthChange({ lat: loc.lat, lon: loc.lon, date: date! }) : null;
  const ymd = valid ? parseYmd(date!) : null;
  const month = ymd && loc ? monthTable(loc.lat, loc.lon, ymd.y, ymd.m) : null;
  const hatsuYear = valid ? hatsuhinodeYearFor(date!) : null;

  const winter = valid ? nextSolstice(date!, 'winter') : null;
  const hatsu = valid ? nextHatsuhinode(date!) : null;
  const summer = valid ? nextSolstice(date!, 'summer') : null;

  function changeDate(next: string, action: string) {
    setDate(next);
    trackToolUse(TOOL, action);
  }

  const dash = '—';

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="hinode-place">地点</label>
        {/* 都道府県と「緯度・経度を入れる」を1つのプルダウンにまとめる（スマホで結果を1画面に収めるため） */}
        <select
          id="hinode-place"
          value={mode === 'latlon' ? LATLON : pref}
          onChange={(e) => {
            if (e.target.value === LATLON) {
              setMode('latlon');
              trackToolUse(TOOL, 'latlon');
            } else {
              setMode('pref');
              setPref(e.target.value);
              trackToolUse(TOOL, 'calculate');
            }
          }}
        >
          {PREFECTURE_CAPITALS.map((p) => (
            <option key={p.pref} value={p.pref}>
              {p.pref}（{p.city}）
            </option>
          ))}
          <option value={LATLON}>緯度・経度を入れる…</option>
        </select>
        {mode === 'latlon' && (
          <div className="field-row" style={{ marginTop: 8 }}>
            <label>
              緯度（北緯が正・10進の度）
              <input
                type="text"
                inputMode="decimal"
                value={latText}
                onChange={(e) => setLatText(e.target.value)}
                onBlur={() => trackToolUse(TOOL, 'calculate')}
              />
            </label>
            <label>
              経度（東経が正・10進の度）
              <input
                type="text"
                inputMode="decimal"
                value={lonText}
                onChange={(e) => setLonText(e.target.value)}
                onBlur={() => trackToolUse(TOOL, 'calculate')}
              />
            </label>
          </div>
        )}
        {ll && !ll.ok && (
          <p className="hint" role="alert" style={{ color: 'var(--danger-fg)' }}>
            {ll.error}
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor="hinode-date">日付</label>
        <input
          id="hinode-date"
          type="date"
          value={date ?? ''}
          onChange={(e) => e.target.value && changeDate(e.target.value, 'calculate')}
        />
        <div style={{ marginTop: 8 }}>
          <button type="button" style={btn} disabled={!winter} onClick={() => winter && changeDate(winter, 'toji')}>
            冬至（{winter ? shortDateJa(winter) : dash}）
          </button>
          <button type="button" style={btn} disabled={!hatsu} onClick={() => hatsu && changeDate(hatsu, 'hatsuhinode')}>
            初日の出（{hatsu ? shortDateJa(hatsu) : dash}）
          </button>
          <button type="button" style={btn} disabled={!summer} onClick={() => summer && changeDate(summer, 'geshi')}>
            夏至（{summer ? shortDateJa(summer) : dash}）
          </button>
        </div>
      </div>

      <div className="panel" style={{ minHeight: RESULT_MIN_HEIGHT }} aria-live="polite">
        <p style={{ margin: 0, fontWeight: 700 }}>{valid ? longDateJa(date!) : '----年--月--日（-）'}</p>
        <p className="hint" style={{ margin: '0 0 6px' }}>
          {loc ? loc.label : '—'}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div className="metric">
            <span className="label">日の出</span>
            <span className="value">{result ? formatHm(result.sunrise) : '-:--'}</span>
          </div>
          <div className="metric">
            <span className="label">日の入り</span>
            <span className="value">{result ? formatHm(result.sunset) : '--:--'}</span>
          </div>
        </div>
        <dl className="kv" style={{ marginTop: 4 }}>
          <div>
            <dt style={{ whiteSpace: 'nowrap' }}>南中</dt>
            <dd style={{ textAlign: 'right' }}>
              {result ? formatHm(result.transit) : '--:--'}
              <span className="hint" style={{ fontWeight: 400 }}>
                {' '}
                高度 {result ? result.transitAltitude.toFixed(1) : '--.-'}°
              </span>
            </dd>
          </div>
          <div>
            <dt style={{ whiteSpace: 'nowrap' }}>昼の長さ</dt>
            <dd style={{ textAlign: 'right' }}>
              {result ? formatDuration(result.dayLength) : '--時間--分'}
              <br />
              <span className="hint" style={{ fontWeight: 400 }}>
                {diff !== null ? dayLengthChangeText(diff) : result ? dash : '昨日より --分 長い'}
              </span>
            </dd>
          </div>
          <div>
            <dt style={{ whiteSpace: 'nowrap' }}>方位</dt>
            <dd style={{ textAlign: 'right' }}>
              <Azimuth label="出" az={result ? result.azimuthRise : undefined} />
              <br />
              <Azimuth label="入り" az={result ? result.azimuthSet : undefined} />
            </dd>
          </div>
        </dl>
        {result && polarText(result) && <p style={{ margin: '8px 0 0' }}>{polarText(result)}</p>}
        <p className="hint" style={{ margin: '6px 0 0' }}>
          時刻はすべて日本時間（JST）。方位は北を0°とし東回りに測った角度。
          {loc && !loc.inJapan && <strong> 日本時間で表示しています。現地時刻ではありません。</strong>}
        </p>
      </div>

      <p className="note">
        <strong>海抜0m・地平線が見通せる場所</strong>
        での時刻です。山や建物があると実際に見えるのは数分〜十数分遅れます。山頂など高い場所では早くなります。
      </p>
      <p className="hint">
        位置情報は使いません。計算はこのブラウザの中だけで行い、地点も日付もどこにも送りません。
      </p>

      {hatsuYear !== null && (
        <>
          <h3>{hatsuYear}年の初日の出（47都道府県・早い順）</h3>
          <HatsuhinodeList year={hatsuYear} selected={mode === 'pref' ? pref : null} />
        </>
      )}

      <h3>{ymd ? `${ymd.y}年${ymd.m}月` : '1か月'}の日の出・日の入り{loc ? `（${loc.label}）` : ''}</h3>
      <table style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>日</th>
            <th>日の出</th>
            <th>日の入り</th>
            {wide && <th>昼の長さ</th>}
          </tr>
        </thead>
        <tbody>
          {month
            ? month.map((r) => {
                const isSel = r.date === date;
                return (
                  <tr
                    key={r.date}
                    style={{ background: isSel ? 'var(--accent-soft)' : undefined, fontWeight: isSel ? 700 : undefined }}
                  >
                    <td>{Number(r.date.slice(8))}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{formatHm(r.sunrise)}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{formatHm(r.sunset)}</td>
                    {wide && <td style={{ whiteSpace: 'nowrap' }}>{formatDuration(r.dayLength)}</td>}
                  </tr>
                );
              })
            : // マウント前は31行の枠だけ（日付に依存する値を静的 HTML に焼かない）
              Array.from({ length: 31 }, (_, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{dash}</td>
                  <td>{dash}</td>
                  {wide && <td>{dash}</td>}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
