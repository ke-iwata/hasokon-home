'use client';

import { useEffect, useState } from 'react';
import { parseDate } from '@/lib/nenrei';
import {
  baseYearChoices,
  chojuYears,
  currentOrNextYaku,
  defaultYakudoshiYear,
  isBirthYearInRange,
  kazoeAge,
  lifetimeYaku,
  MAX_BIRTH_YEAR,
  MIN_BIRTH_YEAR,
  todayInJapan,
  YAKU_KIND_LABELS,
  YAKU_NOTE,
  YAKUDOSHI_YEAR,
  yearWithWareki,
  type Sex,
} from '@/lib/toshi-iwai';
import { trackToolUse } from '@/lib/analytics';

type InputMode = 'date' | 'year';

const DEFAULT_BIRTH = '1986-05-15';

/** 入力から生まれ年を読む。数え年の計算には生まれ年しか使わない */
function readBirthYear(mode: InputMode, dateIso: string, yearText: string): number | { error: string } {
  const range = `${MIN_BIRTH_YEAR}年〜${MAX_BIRTH_YEAR}年の範囲で入力してください。`;
  if (mode === 'date') {
    const date = parseDate(dateIso);
    if (!date) return { error: '生年月日を入力してください。' };
    return isBirthYearInRange(date.year) ? date.year : { error: range };
  }
  const year = Number(yearText);
  if (!yearText || !Number.isInteger(year)) return { error: '生まれ年（西暦）を入力してください。' };
  return isBirthYearInRange(year) ? year : { error: range };
}

export default function Calculator({ buildDate }: { buildDate: string }) {
  const [mode, setMode] = useState<InputMode>('date');
  const [dateIso, setDateIso] = useState(DEFAULT_BIRTH);
  const [yearText, setYearText] = useState(DEFAULT_BIRTH.slice(0, 4));
  const [sex, setSex] = useState<Sex>('male');
  const [female61, setFemale61] = useState(false);
  // サーバ描画とハイドレーション直後は定数の年。マウント後に「開いた日」で既定値を決め直す
  // （10-01〜12-31 は来年）。SSR の早見表（page.tsx）はこの値に関係なく定数の年のまま
  const [thisYear, setThisYear] = useState(() => Number(buildDate.slice(0, 4)));
  const [baseYear, setBaseYear] = useState(YAKUDOSHI_YEAR);

  useEffect(() => {
    const today = todayInJapan(new Date());
    setThisYear(today.year);
    setBaseYear(defaultYakudoshiYear(today));
  }, []);

  const birth = readBirthYear(mode, dateIso, yearText);
  const ok = typeof birth === 'number';
  const opts = { female61: sex === 'female' && female61 };
  const lifetime = ok ? lifetimeYaku(birth, sex, opts) : [];
  const headline = ok ? currentOrNextYaku(birth, baseYear, sex, opts) : null;
  const choju = ok ? chojuYears(birth) : [];
  const choices = baseYearChoices(thisYear, baseYear);

  return (
    <div className="card">
      <div className="field">
        <span className="field-label">生まれ</span>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {(
            [
              ['date', '生年月日で入力'],
              ['year', '生まれ年だけ'],
            ] as [InputMode, string][]
          ).map(([value, label]) => (
            <label key={value} style={{ fontWeight: mode === value ? 700 : 400 }}>
              <input
                type="radio"
                name="yakudoshi-mode"
                value={value}
                checked={mode === value}
                onChange={() => {
                  setMode(value);
                  trackToolUse('yakudoshi', value);
                }}
                style={{ width: 'auto', marginRight: 6 }}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="field-row">
        {mode === 'date' ? (
          <label>
            生年月日
            <input
              type="date"
              value={dateIso}
              min={`${MIN_BIRTH_YEAR}-01-01`}
              max={`${MAX_BIRTH_YEAR}-12-31`}
              onChange={(e) => setDateIso(e.target.value)}
              onBlur={() => trackToolUse('yakudoshi', 'birth')}
            />
          </label>
        ) : (
          <label>
            生まれ年（西暦）
            <input
              type="number"
              inputMode="numeric"
              min={MIN_BIRTH_YEAR}
              max={MAX_BIRTH_YEAR}
              value={yearText}
              onChange={(e) => setYearText(e.target.value)}
              onBlur={() => trackToolUse('yakudoshi', 'birth')}
            />
          </label>
        )}
        <label>
          性別
          <select value={sex} onChange={(e) => setSex(e.target.value as Sex)}>
            <option value="male">男性</option>
            <option value="female">女性</option>
          </select>
        </label>
        <label>
          基準の年
          <select
            value={baseYear}
            onChange={(e) => {
              setBaseYear(Number(e.target.value));
              trackToolUse('yakudoshi', 'year');
            }}
          >
            {choices.map((y) => (
              <option key={y} value={y}>
                {y}年{y === thisYear ? '（今年）' : y === thisYear + 1 ? '（来年）' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      {sex === 'female' && (
        <div className="field">
          <label style={{ fontWeight: 400 }}>
            <input
              type="checkbox"
              checked={female61}
              onChange={(e) => setFemale61(e.target.checked)}
              style={{ width: 'auto', marginRight: 6 }}
            />
            女性の61歳も厄年に含める（含める寺社もあります）
          </label>
        </div>
      )}

      {!ok ? (
        <p className="panel quiet" role="status">
          {birth.error}
        </p>
      ) : (
        <>
          <div className="panel">
            <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: '1.1rem' }}>
              {headline === null
                ? `${baseYear}年以降に厄年はありません`
                : headline.current
                  ? `あなたは${baseYear}年が${YAKU_KIND_LABELS[headline.yaku.kind]}（数え${headline.yaku.age}${headline.yaku.taiyaku ? '・大厄' : ''}）`
                  : `次の厄年は${headline.yaku.year}年（${YAKU_KIND_LABELS[headline.yaku.kind]}・数え${headline.yaku.age}${headline.yaku.taiyaku ? '・大厄' : ''}）`}
            </p>
            <p className="hint" style={{ margin: '0 0 10px' }}>
              {baseYear}年の数え年は{kazoeAge(birth, baseYear)}歳です（{yearWithWareki(birth)}生まれ）。
            </p>
            <table>
              <caption style={{ captionSide: 'top', textAlign: 'left', padding: '4px 0' }}>
                一生分の厄年（数え年）
              </caption>
              <thead>
                <tr>
                  <th scope="col">年</th>
                  <th scope="col">厄</th>
                  <th scope="col">数え年</th>
                </tr>
              </thead>
              <tbody>
                {lifetime.map((y) => {
                  const now = y.year === baseYear;
                  return (
                    <tr key={y.year} style={{ fontWeight: now ? 700 : 400 }}>
                      <td>
                        {yearWithWareki(y.year)}
                        {now && '★'}
                      </td>
                      <td>
                        {YAKU_KIND_LABELS[y.kind]}
                        {y.taiyaku && y.kind === 'hon' && '（大厄）'}
                      </td>
                      <td>{y.age}歳</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="panel quiet">
            <p style={{ margin: '0 0 8px', fontWeight: 700 }}>長寿祝いの年</p>
            <table>
              <thead>
                <tr>
                  <th scope="col">祝い</th>
                  <th scope="col">数え年なら</th>
                  <th scope="col">満年齢なら</th>
                </tr>
              </thead>
              <tbody>
                {choju.map((c) => (
                  <tr key={c.choju.name}>
                    <th scope="row">
                      {c.choju.name}（{c.choju.age}
                      {c.choju.manAge !== c.choju.age && `・満${c.choju.manAge}`}）
                    </th>
                    <td style={{ fontWeight: c.kazoe === baseYear ? 700 : 400 }}>
                      {c.kazoe === null ? '—' : `${c.kazoe}年`}
                    </td>
                    <td style={{ fontWeight: c.man === baseYear ? 700 : 400 }}>
                      {c.man}年{c.choju.name === '還暦' && '（数え・満とも同じ年）'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint" style={{ marginTop: 8 }}>
              緑寿は満66歳で祝うのが一般的なので、満年齢の年だけを出しています。
            </p>
          </div>
        </>
      )}

      <p className="hint" style={{ marginTop: 12 }}>
        {YAKU_NOTE} 入力した内容はブラウザの中だけで計算され、どこにも送信されません。
      </p>
    </div>
  );
}
