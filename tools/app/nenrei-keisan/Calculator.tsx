'use client';

import { useEffect, useState } from 'react';
import {
  calcNenrei,
  compareDate,
  ERAS,
  eraYearLabel,
  formatDate,
  formatJa,
  fromWareki,
  parseDate,
  toWareki,
  BRANCH_READINGS,
  type DateParts,
} from '@/lib/nenrei';
import { trackToolUse } from '@/lib/analytics';

type Mode = 'seireki' | 'wareki';

/** 和暦入力の各欄。空欄を許すので文字列で持つ */
interface WarekiInput {
  era: string;
  year: string;
  month: string;
  day: string;
}

/** 初期表示の生年月日。西暦・和暦のどちらで開いても同じ日を指す */
const DEFAULT_BIRTH = '1990-05-15';

function toWarekiInput(iso: string): WarekiInput | null {
  const parts = parseDate(iso);
  const w = parts && toWareki(parts);
  if (!w) return null;
  return { era: w.era, year: String(w.eraYear), month: String(w.month), day: String(w.day) };
}

/** 和暦の4つの欄から日付を組み立てる。空欄・不正は理由を返す */
function readWareki(input: WarekiInput): DateParts | { error: string } {
  const year = Number(input.year);
  const month = Number(input.month);
  const day = Number(input.day);
  if (!input.year || !input.month || !input.day) {
    return { error: '和暦の年・月・日をすべて入力してください。' };
  }
  return fromWareki(input.era, year, month, day);
}

export default function Calculator({ buildDate }: { buildDate: string }) {
  const [mode, setMode] = useState<Mode>('seireki');
  const [birthIso, setBirthIso] = useState(DEFAULT_BIRTH);
  const [wareki, setWareki] = useState<WarekiInput>(
    () => toWarekiInput(DEFAULT_BIRTH) as WarekiInput
  );
  // 静的書き出しなので、サーバ描画とハイドレーション直後はビルド時刻を基準日にし、
  // マウント後に「画面を開いた日」へ差し替える（両者がずれるとReactが警告を出す）
  const [baseIso, setBaseIso] = useState(() => buildDate.slice(0, 10));
  // 「今日」はマウント後にしか分からない（サーバ描画はビルド時刻）。
  // 見出しの出し分けだけに使い、判定そのものには使わない
  const [today, setToday] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    const iso = formatDate({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
    });
    setBaseIso(iso);
    setToday(iso);
  }, []);

  function changeMode(next: Mode) {
    // 入力中の日付を保ったまま切り替える（入れ直しをさせない）
    if (next === 'wareki') {
      const converted = toWarekiInput(birthIso);
      if (converted) setWareki(converted);
    } else {
      const read = readWareki(wareki);
      if (!('error' in read)) setBirthIso(formatDate(read));
    }
    setMode(next);
    trackToolUse('nenrei-keisan', next);
  }

  const birthRead: DateParts | { error: string } | null =
    mode === 'wareki' ? readWareki(wareki) : (parseDate(birthIso) ?? { error: '生年月日を入力してください。' });

  const birth = birthRead && !('error' in birthRead) ? birthRead : null;
  const inputError = birthRead && 'error' in birthRead ? birthRead.error : null;
  const base = parseDate(baseIso);

  const future = birth && base ? compareDate(base, birth) < 0 : false;
  const result = birth && base ? calcNenrei(birth, base) : null;
  const baseIsToday = base !== null && today !== null && formatDate(base) === today;

  return (
    <div className="card">
      <div className="field">
        <span className="field-label">生年月日の入力方法</span>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {(
            [
              ['seireki', '西暦で入力'],
              ['wareki', '和暦で入力'],
            ] as [Mode, string][]
          ).map(([value, label]) => (
            <label key={value} style={{ fontWeight: mode === value ? 700 : 400 }}>
              <input
                type="radio"
                name="nenrei-mode"
                value={value}
                checked={mode === value}
                onChange={() => changeMode(value)}
                style={{ width: 'auto', marginRight: 6 }}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {mode === 'seireki' ? (
        <div className="field">
          <label htmlFor="nenrei-birth">生年月日（西暦）</label>
          <input
            id="nenrei-birth"
            type="date"
            value={birthIso}
            max="2100-12-31"
            onChange={(e) => setBirthIso(e.target.value)}
            onBlur={() => trackToolUse('nenrei-keisan', 'birth')}
          />
        </div>
      ) : (
        <div className="field">
          <span className="field-label">生年月日（和暦）</span>
          <div className="field-row">
            <label>
              元号
              <select
                value={wareki.era}
                onChange={(e) => setWareki({ ...wareki, era: e.target.value })}
              >
                {ERAS.map((era) => (
                  <option key={era.name} value={era.name}>
                    {era.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              年（元年は1）
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={wareki.year}
                onChange={(e) => setWareki({ ...wareki, year: e.target.value })}
                onBlur={() => trackToolUse('nenrei-keisan', 'birth')}
              />
            </label>
            <label>
              月
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={12}
                value={wareki.month}
                onChange={(e) => setWareki({ ...wareki, month: e.target.value })}
              />
            </label>
            <label>
              日
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                value={wareki.day}
                onChange={(e) => setWareki({ ...wareki, day: e.target.value })}
              />
            </label>
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor="nenrei-base">基準日（この日時点の年齢を出します）</label>
        <input
          id="nenrei-base"
          type="date"
          value={baseIso}
          onChange={(e) => {
            setBaseIso(e.target.value);
            trackToolUse('nenrei-keisan', 'base');
          }}
        />
        <p className="hint">
          初期値は今日です。過去や未来の日付に変えると、その日時点の満年齢が出ます。
        </p>
      </div>

      {inputError ? (
        <p className="panel quiet" role="status">
          {inputError}
        </p>
      ) : !base ? (
        <p className="panel quiet" role="status">
          基準日を入力してください。
        </p>
      ) : future ? (
        <p className="panel quiet" role="status">
          基準日が生年月日より前です。基準日を後の日付にしてください。
        </p>
      ) : (
        result && (
          <>
            <div className="panel">
              <div className="metric">
                <span className="label">
                  {baseIsToday ? '今日時点の満年齢' : `${formatJa(result.base)}時点の満年齢`}
                </span>
                <span className="value">{result.age}</span>
                <span className="unit">歳</span>
              </div>
              {/*
                書類の「満何歳何ヶ月」欄や、乳幼児の月齢のための表示。
                （）内は◯ヶ月を数えたあとの端数の日数で、通算日数ではない
              */}
              <p style={{ margin: '6px 0 0', fontWeight: 700 }}>
                満{result.detail.years}歳{result.detail.months}ヶ月（{result.detail.days}日）
                {result.detail.totalMonths < 24 && (
                  <span className="chip" style={{ marginLeft: 8 }}>
                    生後{result.detail.totalMonths}ヶ月
                  </span>
                )}
              </p>
              <p className="hint" style={{ margin: '2px 0 0' }}>
                （）内は{result.detail.months}
                ヶ月を数えたあとの端数の日数です。月の数え方は満年齢と同じで、応当日を迎えていない月は数えません。
              </p>
              <dl className="kv" style={{ marginTop: 10 }}>
                <div>
                  <dt>生年月日</dt>
                  <dd>
                    {formatJa(result.birth)}（{result.birthWeekday}）
                  </dd>
                </div>
                <div>
                  <dt>和暦</dt>
                  <dd>
                    {result.birthWareki
                      ? `${result.birthWareki.label}（${result.birthWareki.short}）`
                      : '明治より前は対応していません'}
                  </dd>
                </div>
                <div>
                  <dt>干支（えと）</dt>
                  <dd>
                    {result.zodiac}（{BRANCH_READINGS[result.zodiac]}）年・{result.eto}
                  </dd>
                </div>
                <div>
                  <dt>次の誕生日</dt>
                  <dd>
                    {result.nextBirthday.isToday
                      ? '今日です'
                      : `${formatJa(result.nextBirthday.date)}（あと${result.nextBirthday.days.toLocaleString('ja-JP')}日・${result.nextBirthday.age}歳）`}
                  </dd>
                </div>
                <div>
                  <dt>生まれてからの日数</dt>
                  <dd>{result.livedDays.toLocaleString('ja-JP')}日</dd>
                </div>
              </dl>
              {result.nextBirthday.shifted && (
                <p className="hint" style={{ marginTop: 8 }}>
                  ※ 2月29日生まれのため、平年は3月1日に年齢が増えるものとして計算しています。
                </p>
              )}
              {result.birthWareki?.lunisolar && (
                <p className="hint" style={{ marginTop: 8 }}>
                  ※ 明治5年12月2日以前は旧暦（太陰太陽暦）です。和暦の月日は西暦の月日と対応しません。
                </p>
              )}
            </div>

            <div className="panel quiet">
              <p style={{ margin: '0 0 8px', fontWeight: 700 }}>
                学年の目安
                {result.school.hayaumare && (
                  <span className="chip" style={{ marginLeft: 8 }}>
                    早生まれ
                  </span>
                )}
              </p>
              <p className="hint" style={{ margin: '0 0 10px' }}>
                {result.school.cohortYear}年4月2日〜{result.school.cohortYear + 1}
                年4月1日生まれと同じ学年です（浪人・留年・飛び級がない場合の目安）。
              </p>
              <table>
                <thead>
                  <tr>
                    <th scope="col">節目</th>
                    <th scope="col">時期</th>
                  </tr>
                </thead>
                <tbody>
                  {result.school.milestones.map((m) => (
                    <tr key={m.label}>
                      <td>{m.label}</td>
                      <td>{m.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      )}

      <p className="hint" style={{ marginTop: 12 }}>
        入力した内容はブラウザの中だけで計算され、どこにも送信されません。和暦は
        {ERAS.map((e) => e.name).join('・')}に対応しています（
        {eraYearLabel('令和', 1)}＝2019年5月1日から）。
      </p>
    </div>
  );
}
