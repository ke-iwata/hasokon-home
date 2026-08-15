'use client';

import { useEffect, useState } from 'react';
import { addDays, daysBetween, formatDate, formatJa, parseDate, type DateParts } from '@/lib/date-parts';
import {
  calcDeadline,
  calcDuration,
  HOLIDAY_FIRST_YEAR,
  HOLIDAY_LAST_YEAR,
  MAX_AMOUNT,
  type CountUnit,
  type Direction,
} from '@/lib/nissu-keisan';
import { trackToolUse } from '@/lib/analytics';

type Tab = 'duration' | 'deadline';

/** 飛ばした土日・祝日を全部並べると長くなるので、先頭だけ出して残りは件数で示す */
const SKIPPED_SHOWN = 8;

/** '2026年5月11日（月）' の形 */
function withWeekday(date: DateParts, weekday: string): string {
  return `${formatJa(date)}（${weekday}）`;
}

export default function Calculator({ buildDate }: { buildDate: string }) {
  const [tab, setTab] = useState<Tab>('duration');

  // 静的書き出しなので、サーバ描画とハイドレーション直後はビルド日を入れ、
  // マウント後に「画面を開いた日」へ差し替える（両者がずれるとReactが警告を出す）
  const buildIso = buildDate.slice(0, 10);
  const [today, setToday] = useState<string | null>(null);
  const [from, setFrom] = useState(buildIso);
  const [to, setTo] = useState(() => formatDate(addDays(parseDate(buildIso) as DateParts, 30)));
  const [start, setStart] = useState(buildIso);

  const [amount, setAmount] = useState('30');
  const [direction, setDirection] = useState<Direction>('after');
  const [unit, setUnit] = useState<CountUnit>('calendar');

  useEffect(() => {
    const now = new Date();
    const iso = formatDate({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });
    setToday(iso);
    setFrom(iso);
    setTo(formatDate(addDays(parseDate(iso) as DateParts, 30)));
    setStart(iso);
  }, []);

  function switchTab(next: Tab) {
    setTab(next);
    trackToolUse('nissu-keisan', next);
  }

  const fromDate = parseDate(from);
  const toDate = parseDate(to);
  const startDate = parseDate(start);
  const duration = fromDate && toDate ? calcDuration(fromDate, toDate) : null;

  const amountNumber = Number(amount);
  const deadline = startDate
    ? calcDeadline({
        start: startDate,
        amount: amount.trim() === '' || !Number.isFinite(amountNumber) ? -1 : amountNumber,
        direction,
        unit,
      })
    : null;

  return (
    <div className="card">
      <div className="field">
        <span className="field-label">計算の種類</span>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {(
            [
              ['duration', '日数を数える（日付A→日付B）'],
              ['deadline', '期日を求める（◯日後・◯営業日後）'],
            ] as [Tab, string][]
          ).map(([value, label]) => (
            <label key={value} style={{ fontWeight: tab === value ? 700 : 400 }}>
              <input
                type="radio"
                name="nissu-tab"
                value={value}
                checked={tab === value}
                onChange={() => switchTab(value)}
                style={{ width: 'auto', marginRight: 6 }}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {tab === 'duration' ? (
        <>
          <div className="field">
            <label htmlFor="nissu-from">開始日</label>
            <input
              id="nissu-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              onBlur={() => trackToolUse('nissu-keisan', 'from')}
            />
          </div>

          <div className="field">
            <label htmlFor="nissu-to">終了日</label>
            <input
              id="nissu-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              onBlur={() => trackToolUse('nissu-keisan', 'to')}
            />
            {today && (
              <p className="hint">
                <button
                  type="button"
                  onClick={() => {
                    setFrom(today);
                    trackToolUse('nissu-keisan', 'today');
                  }}
                  style={{ width: 'auto', padding: '4px 10px', marginRight: 8 }}
                >
                  開始日を今日にする
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTo(today);
                    trackToolUse('nissu-keisan', 'today');
                  }}
                  style={{ width: 'auto', padding: '4px 10px' }}
                >
                  終了日を今日にする
                </button>
              </p>
            )}
          </div>

          {!fromDate || !toDate ? (
            <p className="panel quiet" role="status">
              開始日と終了日を入力してください。
            </p>
          ) : !duration ? (
            <p className="panel quiet" role="status">
              終了日が開始日より前です。終了日を後の日付にしてください。
            </p>
          ) : (
            <>
              <div className="panel">
                <div className="metric">
                  <span className="label">
                    {formatJa(duration.from)} 〜 {formatJa(duration.to)} の日数（初日を含まない）
                  </span>
                  <span className="value">{duration.days.toLocaleString('ja-JP')}</span>
                  <span className="unit">日</span>
                </div>
                <dl className="kv" style={{ marginTop: 10 }}>
                  <div>
                    <dt>初日を含む</dt>
                    <dd>{duration.daysInclusive.toLocaleString('ja-JP')}日</dd>
                  </div>
                  <div>
                    <dt>週で数えると</dt>
                    <dd>
                      {duration.weeks.weeks.toLocaleString('ja-JP')}週
                      {duration.weeks.days > 0 && `と${duration.weeks.days}日`}
                    </dd>
                  </div>
                  <div>
                    <dt>月で数えると</dt>
                    <dd>
                      {duration.months.months.toLocaleString('ja-JP')}か月
                      {duration.months.days > 0 && `と${duration.months.days}日`}
                    </dd>
                  </div>
                  <div>
                    <dt>年月日で数えると</dt>
                    <dd>
                      {duration.ymd.years > 0 && `${duration.ymd.years}年`}
                      {duration.ymd.months > 0 && `${duration.ymd.months}か月`}
                      {duration.ymd.days}日
                    </dd>
                  </div>
                  <div>
                    <dt>開始日</dt>
                    <dd>
                      {withWeekday(duration.from, duration.fromWeekday)}
                      {duration.fromHoliday && `・${duration.fromHoliday}`}
                    </dd>
                  </div>
                  <div>
                    <dt>終了日</dt>
                    <dd>
                      {withWeekday(duration.to, duration.toWeekday)}
                      {duration.toHoliday && `・${duration.toHoliday}`}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="panel quiet">
                <p style={{ margin: '0 0 8px', fontWeight: 700 }}>この期間の営業日（両端を含む）</p>
                {duration.business ? (
                  <dl className="kv">
                    <div>
                      <dt>営業日</dt>
                      <dd>{duration.business.count.toLocaleString('ja-JP')}日</dd>
                    </div>
                    <div>
                      <dt>土日</dt>
                      <dd>{duration.business.weekends.toLocaleString('ja-JP')}日</dd>
                    </div>
                    <div>
                      <dt>祝日（土日と重なる日を除く）</dt>
                      <dd>{duration.business.holidays.toLocaleString('ja-JP')}日</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="hint" style={{ margin: 0 }}>
                    祝日データの範囲外です。営業日は{HOLIDAY_FIRST_YEAR}年1月1日〜{HOLIDAY_LAST_YEAR}
                    年12月31日の期間でのみ数えられます（未公示の年の祝日は概算しません）。
                  </p>
                )}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="nissu-start">起算日</label>
            <input
              id="nissu-start"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              onBlur={() => trackToolUse('nissu-keisan', 'start')}
            />
            {today && (
              <p className="hint">
                <button
                  type="button"
                  onClick={() => {
                    setStart(today);
                    trackToolUse('nissu-keisan', 'today');
                  }}
                  style={{ width: 'auto', padding: '4px 10px' }}
                >
                  今日にする
                </button>
              </p>
            )}
          </div>

          <div className="field">
            <span className="field-label">数える日数と向き</span>
            <div className="field-row">
              <label>
                日数
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MAX_AMOUNT}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onBlur={() => trackToolUse('nissu-keisan', 'amount')}
                />
              </label>
              <label>
                数え方
                <select
                  value={unit}
                  onChange={(e) => {
                    setUnit(e.target.value as CountUnit);
                    trackToolUse('nissu-keisan', 'unit');
                  }}
                >
                  <option value="calendar">暦日（土日祝も数える）</option>
                  <option value="business">営業日（土日祝を除く）</option>
                </select>
              </label>
              <label>
                向き
                <select
                  value={direction}
                  onChange={(e) => {
                    setDirection(e.target.value as Direction);
                    trackToolUse('nissu-keisan', 'direction');
                  }}
                >
                  <option value="after">後（未来）</option>
                  <option value="before">前（過去）</option>
                </select>
              </label>
            </div>
            <p className="hint">
              起算日は数えません。「3日後」は起算日の翌日から3日目、「3営業日後」は起算日の次の営業日を1営業日目として3つ目の営業日です。
            </p>
          </div>

          {!startDate || !deadline ? (
            <p className="panel quiet" role="status">
              起算日を入力してください。
            </p>
          ) : !deadline.ok ? (
            <p className="panel quiet" role="status">
              {deadline.message}
            </p>
          ) : (
            <>
              <div className="panel">
                <div className="metric">
                  <span className="label">
                    {formatJa(startDate)}の{amountNumber.toLocaleString('ja-JP')}
                    {unit === 'business' ? '営業日' : '日'}
                    {direction === 'after' ? '後' : '前'}
                  </span>
                  <span className="value">{formatJa(deadline.date)}</span>
                  <span className="unit">（{deadline.weekday}）</span>
                </div>
                <dl className="kv" style={{ marginTop: 10 }}>
                  <div>
                    <dt>その日は</dt>
                    <dd>
                      {deadline.holiday
                        ? `${deadline.holiday}（休日）`
                        : deadline.isBusinessDay === null
                          ? '祝日データの範囲外のため、営業日かどうかは判定していません'
                          : deadline.isBusinessDay
                            ? '営業日'
                            : '土日'}
                    </dd>
                  </div>
                  <div>
                    <dt>起算日から</dt>
                    <dd>
                      {Math.abs(daysBetween(startDate, deadline.date)).toLocaleString('ja-JP')}日（暦日）
                    </dd>
                  </div>
                </dl>
              </div>

              {unit === 'business' && deadline.skipped.length > 0 && (
                <div className="panel quiet">
                  <p style={{ margin: '0 0 8px', fontWeight: 700 }}>
                    飛ばした休み（{deadline.skipped.length.toLocaleString('ja-JP')}日）
                  </p>
                  <ul style={{ margin: 0, paddingLeft: '1.2em' }}>
                    {deadline.skipped.slice(0, SKIPPED_SHOWN).map((s) => (
                      <li key={formatDate(s.date)}>
                        {formatJa(s.date)}　{s.reason}
                      </li>
                    ))}
                  </ul>
                  {deadline.skipped.length > SKIPPED_SHOWN && (
                    <p className="hint" style={{ margin: '8px 0 0' }}>
                      ほか{(deadline.skipped.length - SKIPPED_SHOWN).toLocaleString('ja-JP')}日
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      <p className="hint" style={{ marginTop: 12 }}>
        入力した内容はブラウザの中だけで計算され、どこにも送信されません。営業日は土日と国民の祝日（振替休日・国民の休日を含む）を除いて数えます。会社ごとの年末年始休業やお盆休みは含みません。
      </p>
    </div>
  );
}
