'use client';

import { useEffect, useState } from 'react';
import { parseDate, type DateParts } from '@/lib/nenrei';
import {
  baseYearChoices,
  cohortAlignedYear,
  defaultShichigosanYear,
  hayaumareCohort,
  isBirthYearInRange,
  kazoeAge,
  MAX_BIRTH_YEAR,
  MIN_BIRTH_YEAR,
  SHICHIGOSAN_AGES,
  SHICHIGOSAN_YEAR,
  shichigosanTable,
  shichigosanWeekday,
  shichigosanYears,
  todayInJapan,
  yearOfMan,
  yearWithWareki,
  type ChildSex,
} from '@/lib/toshi-iwai';
import { trackToolUse } from '@/lib/analytics';

type InputMode = 'date' | 'year';

const DEFAULT_BIRTH = '2023-05-10';

const SEX_LABELS: [ChildSex, string][] = [
  ['both', '両方表示'],
  ['boy', '男の子'],
  ['girl', '女の子'],
];

/** 入力から生まれ年と（あれば）生年月日を読む。範囲外・空欄は理由を返す */
function readBirth(
  mode: InputMode,
  dateIso: string,
  yearText: string
): { year: number; date: DateParts | null } | { error: string } {
  const range = `${MIN_BIRTH_YEAR}年〜${MAX_BIRTH_YEAR}年の範囲で入力してください。`;
  if (mode === 'date') {
    const date = parseDate(dateIso);
    if (!date) return { error: '生年月日を入力してください。' };
    if (!isBirthYearInRange(date.year)) return { error: range };
    return { year: date.year, date };
  }
  const year = Number(yearText);
  if (!yearText || !Number.isInteger(year)) return { error: '生まれ年（西暦）を入力してください。' };
  if (!isBirthYearInRange(year)) return { error: range };
  return { year, date: null };
}

export default function Calculator({ buildDate }: { buildDate: string }) {
  const [mode, setMode] = useState<InputMode>('date');
  const [dateIso, setDateIso] = useState(DEFAULT_BIRTH);
  const [yearText, setYearText] = useState(DEFAULT_BIRTH.slice(0, 4));
  const [sex, setSex] = useState<ChildSex>('both');
  // サーバ描画とハイドレーション直後は定数の年。マウント後に「開いた日」で既定値を決め直す
  // （11-16〜12-31 は来年）。SSR の早見表（page.tsx）はこの値に関係なく定数の年のまま
  const [thisYear, setThisYear] = useState(() => Number(buildDate.slice(0, 4)));
  const [baseYear, setBaseYear] = useState(SHICHIGOSAN_YEAR);

  useEffect(() => {
    const today = todayInJapan(new Date());
    setThisYear(today.year);
    setBaseYear(defaultShichigosanYear(today));
  }, []);

  const birth = readBirth(mode, dateIso, yearText);
  const ok = !('error' in birth);
  const years = ok ? shichigosanYears(birth.year, sex) : [];
  const cohort = ok && birth.date ? hayaumareCohort(birth.date) : null;
  const choices = baseYearChoices(thisYear, baseYear);

  // 基準の年に、この子が数え年・満年齢で何歳になるか
  const ages = SHICHIGOSAN_AGES[sex];
  const kazoe = ok ? kazoeAge(birth.year, baseYear) : 0;
  const man = ok ? baseYear - birth.year : 0;
  const kazoeHit = ages.find((a) => a === kazoe);
  const manHit = ages.find((a) => a === man);

  return (
    <div className="card">
      <div className="field">
        <span className="field-label">子どもの生まれ</span>
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
                name="shichigosan-mode"
                value={value}
                checked={mode === value}
                onChange={() => {
                  setMode(value);
                  trackToolUse('shichigosan', value);
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
              onBlur={() => trackToolUse('shichigosan', 'birth')}
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
              onBlur={() => trackToolUse('shichigosan', 'birth')}
            />
          </label>
        )}
        <label>
          性別
          <select value={sex} onChange={(e) => setSex(e.target.value as ChildSex)}>
            {SEX_LABELS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          基準の年
          <select
            value={baseYear}
            onChange={(e) => {
              setBaseYear(Number(e.target.value));
              trackToolUse('shichigosan', 'year');
            }}
          >
            {choices.map((y) => (
              <option key={y} value={y}>
                {y}{y === thisYear ? '（今年）' : y === thisYear + 1 ? '（来年）' : '年'}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!ok ? (
        <p className="panel quiet" role="status">
          {birth.error}
        </p>
      ) : (
        <>
          <div className="panel">
            <p style={{ margin: '0 0 8px', fontWeight: 700 }}>
              {baseYear}年は、
              {kazoeHit || manHit
                ? [
                    kazoeHit && `数え年なら${kazoeHit}歳の七五三`,
                    manHit && `満年齢なら${manHit}歳の七五三`,
                  ]
                    .filter(Boolean)
                    .join('・')
                : '七五三の年ではありません'}
              （数え{kazoe > 0 ? kazoe : '—'}歳・満{man >= 0 ? man : '—'}歳）
            </p>
            <table>
              <thead>
                <tr>
                  <th scope="col">年齢</th>
                  <th scope="col">数え年なら</th>
                  <th scope="col">満年齢なら</th>
                </tr>
              </thead>
              <tbody>
                {years.map((y) => {
                  const aligned = birth.date ? cohortAlignedYear(birth.date, y.age) : null;
                  return (
                    <tr key={y.age}>
                      <th scope="row">{y.age}歳</th>
                      <td style={{ fontWeight: y.kazoe === baseYear ? 700 : 400 }}>
                        {yearWithWareki(y.kazoe)}
                        <br />
                        <span className="hint">11月15日（{shichigosanWeekday(y.kazoe)}）</span>
                      </td>
                      <td style={{ fontWeight: y.man === baseYear ? 700 : 400 }}>
                        {yearWithWareki(y.man)}
                        <br />
                        <span className="hint">11月15日（{shichigosanWeekday(y.man)}）</span>
                        {aligned !== null && (
                          <>
                            <br />
                            <span className="hint">
                              同じ学年のお友だちと揃えるなら<strong>{aligned}年</strong>（{cohort}
                              年度生まれの学年が満{y.age}歳になる年）
                            </span>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {cohort !== null && (
              <p className="hint" style={{ marginTop: 8 }}>
                早生まれ（1月1日〜4月1日生まれ）のため、満年齢の年は同じ学年の多くの子より1年遅くなります（満
                {years[0]?.age}歳は{yearOfMan(birth.year, years[0]?.age ?? 3)}年）。
              </p>
            )}
            {mode === 'year' && (
              <p className="hint" style={{ marginTop: 8 }}>
                生まれ年だけの入力では早生まれかどうかを判定できません。学年と揃える年を見るときは生年月日で入力してください。
              </p>
            )}
          </div>

          {baseYear !== SHICHIGOSAN_YEAR && (
            <div className="panel quiet">
              <p style={{ margin: '0 0 8px', fontWeight: 700 }}>{baseYear}年の七五三 早見表</p>
              <table>
                <thead>
                  <tr>
                    <th scope="col">年齢</th>
                    <th scope="col">数え年なら</th>
                    <th scope="col">満年齢なら</th>
                  </tr>
                </thead>
                <tbody>
                  {shichigosanTable(baseYear).map((r) => (
                    <tr key={r.age}>
                      <th scope="row">{r.age}歳</th>
                      <td>{r.kazoeBirthYear}年生まれ</td>
                      <td>{r.manBirthYear}年生まれ</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <p className="hint" style={{ marginTop: 12 }}>
        入力した内容はブラウザの中だけで計算され、どこにも送信されません。数え年・満年齢のどちらで祝うか、男の子の3歳を祝うかは地域・家庭によって異なります。
      </p>
    </div>
  );
}
