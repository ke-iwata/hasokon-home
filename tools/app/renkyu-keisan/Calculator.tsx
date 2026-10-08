'use client';

import { useEffect, useState } from 'react';
import { formatDate, formatJa, parseDate, type DateParts } from '@/lib/date-parts';
import { HOLIDAY_LAST_YEAR } from '@/lib/nissu-keisan';
import {
  calendarWeeks,
  defaultYear,
  DEFAULT_RULE,
  FIRST_DATE,
  findPlans,
  formatLeaveDays,
  formatMd,
  groupPlans,
  isUpcoming,
  LAST_DATE,
  leaveNeeded,
  MAX_LEAVE,
  planHeadline,
  selectableYears,
  type CalendarCell,
  type NewYearRule,
  type OffRule,
  type Plan,
  type PlanCard,
  type SummerRule,
  type WeekendRule,
} from '@/lib/renkyu-keisan';
import { trackToolUse } from '@/lib/analytics';

type Mode = 'plans' | 'range';

/** 最初に見せるカードの枚数。残りは「ほかの時期も見る」で開く */
const CARDS_SHOWN = 4;

/** モード 2 でカレンダーを描く期間の上限（長い期間は週の行が増えすぎるので数字だけにする） */
const CALENDAR_MAX_DAYS = 62;

/** 選択欄は 320 幅でも 2 列に並べる（1 列に落とすと 1 件目の結果が画面の外に出る） */
const TWO_COLUMNS = { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' };

const WEEK_HEAD = ['日', '月', '火', '水', '木', '金', '土'];

/** マスの見た目。色だけに頼らないよう、記号も 1 文字添える */
const CELL_STYLE: Record<CalendarCell['kind'], { bg: string; fg: string; mark: string }> = {
  leave: { bg: 'var(--accent)', fg: 'var(--on-accent)', mark: '有' },
  holiday: { bg: 'var(--danger-soft)', fg: 'var(--danger-fg)', mark: '祝' },
  company: { bg: 'var(--info-soft)', fg: 'var(--info-fg)', mark: '休' },
  weekend: { bg: 'var(--surface-2)', fg: 'var(--text)', mark: '' },
  work: { bg: 'transparent', fg: 'var(--muted)', mark: '' },
};

/** 連休の前後の週だけを出すミニカレンダー（表示専用。タップしない） */
function MiniCalendar({ plan, rule }: { plan: Pick<Plan, 'start' | 'end' | 'leaveDays'>; rule: OffRule }) {
  const weeks = calendarWeeks(plan, rule);
  return (
    <table
      aria-label={`${formatMd(plan.start)}〜${formatMd(plan.end)}のカレンダー`}
      style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 2, marginTop: 8 }}
    >
      <thead>
        <tr>
          {WEEK_HEAD.map((w) => (
            <th key={w} scope="col" style={{ padding: 2, fontSize: 'var(--fs-xs)', textAlign: 'center' }}>
              {w}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={formatDate(week[0].date)}>
            {week.map((cell) => {
              const s = CELL_STYLE[cell.kind];
              return (
                <td
                  key={formatDate(cell.date)}
                  title={cell.label ?? undefined}
                  style={{
                    padding: '2px 0',
                    textAlign: 'center',
                    lineHeight: 1.2,
                    fontSize: 'var(--fs-xs)',
                    fontVariantNumeric: 'tabular-nums',
                    background: s.bg,
                    color: s.fg,
                    borderRadius: 6,
                    outline: cell.inPlan ? '2px solid var(--accent)' : 'none',
                    outlineOffset: -2,
                    opacity: cell.inPlan ? 1 : 0.7,
                  }}
                >
                  {cell.date.day === 1 || cell === week[0] ? `${cell.date.month}/` : ''}
                  {cell.date.day}
                  <br />
                  <span aria-hidden={s.mark === ''}>{s.mark || ' '}</span>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 時期ごとのカード。有給の日数ごとの案をタブで切り替える */
function Card({ card, rule }: { card: PlanCard; rule: OffRule }) {
  const leaveCounts = [...new Set(card.plans.map((p) => p.leaveDays.length))];
  const [leave, setLeave] = useState(leaveCounts[0]);
  const current = card.plans.filter((p) => p.leaveDays.length === leave);
  const plan = current[0] ?? card.plans[0];
  const others = current.slice(1);

  return (
    <div className="panel">
      <p style={{ margin: '0 0 6px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="chip">{card.label}</span>
        {leaveCounts.length > 1 &&
          leaveCounts.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={n === leave}
              onClick={() => setLeave(n)}
              style={{
                width: 'auto',
                padding: '4px 10px',
                fontWeight: n === leave ? 700 : 400,
                background: n === leave ? 'var(--accent)' : undefined,
                color: n === leave ? 'var(--on-accent)' : undefined,
              }}
            >
              有給{n}日
            </button>
          ))}
      </p>
      <p style={{ margin: 0, fontWeight: 700 }}>{planHeadline(plan)}</p>
      <MiniCalendar plan={plan} rule={rule} />
      {others.length > 0 && (
        <p className="hint" style={{ margin: '6px 0 0' }}>
          同じ {plan.days} 連休になる別の取り方：
          {others
            .map((p) => `${formatMd(p.start)}〜${formatMd(p.end)}（有給 ${formatLeaveDays(p.leaveDays)}）`)
            .join('／')}
        </p>
      )}
      {plan.unconfirmed && (
        <p className="hint" style={{ margin: '6px 0 0' }}>
          {HOLIDAY_LAST_YEAR + 1}年の祝日は未確定のため、元日以外は休みの曜日と会社の休みだけで計算しています。
        </p>
      )}
    </div>
  );
}

export default function Calculator({ buildDate }: { buildDate: string }) {
  // 静的書き出しなので、サーバ描画とハイドレーション直後はビルド日を入れ、
  // マウント後に「画面を開いた日」へ差し替える（両者がずれるとReactが警告を出す）
  const buildDay = parseDate(buildDate.slice(0, 10)) as DateParts;
  const [today, setToday] = useState<DateParts>(buildDay);
  const [mode, setMode] = useState<Mode>('plans');
  const [year, setYear] = useState(defaultYear(buildDay));
  const [maxLeave, setMaxLeave] = useState(2);
  const [weekend, setWeekend] = useState<WeekendRule>(DEFAULT_RULE.weekend);
  const [newYear, setNewYear] = useState<NewYearRule>(DEFAULT_RULE.newYear);
  const [summer, setSummer] = useState<SummerRule>(DEFAULT_RULE.summer);
  const [showAll, setShowAll] = useState(false);
  const [from, setFrom] = useState(`${HOLIDAY_LAST_YEAR}-04-29`);
  const [to, setTo] = useState(`${HOLIDAY_LAST_YEAR}-05-09`);

  useEffect(() => {
    const now = new Date();
    const t = { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
    setToday(t);
    setYear(defaultYear(t));
  }, []);

  const rule: OffRule = { weekend, newYear, summer };
  const cards = groupPlans(findPlans(year, maxLeave, rule).filter((p) => isUpcoming(p, today)));
  const shown = showAll ? cards : cards.slice(0, CARDS_SHOWN);

  const fromDate = parseDate(from);
  const toDate = parseDate(to);
  const range = fromDate && toDate ? leaveNeeded(fromDate, toDate, rule) : null;

  function track(action: string) {
    trackToolUse('renkyu-keisan', action);
  }

  return (
    <div className="card">
      <div className="field">
        <span className="field-label">計算の種類</span>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {(
            [
              ['plans', '有給の日数から何連休かを出す'],
              ['range', 'この期間を休むには有給が何日？'],
            ] as [Mode, string][]
          ).map(([value, label]) => (
            <label key={value} style={{ fontWeight: mode === value ? 700 : 400 }}>
              <input
                type="radio"
                name="renkyu-mode"
                value={value}
                checked={mode === value}
                onChange={() => {
                  setMode(value);
                  track(value);
                }}
                style={{ width: 'auto', marginRight: 6 }}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {mode === 'plans' && (
        <div className="field-row" style={TWO_COLUMNS}>
          <label>
            年
            <select
              value={year}
              onChange={(e) => {
                setYear(Number(e.target.value));
                track('year');
              }}
            >
              {selectableYears().map((y) => (
                <option key={y} value={y}>
                  {y}年
                </option>
              ))}
            </select>
          </label>
          <label>
            使える有給
            <select
              value={maxLeave}
              onChange={(e) => {
                setMaxLeave(Number(e.target.value));
                track('leave');
              }}
            >
              {Array.from({ length: MAX_LEAVE }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}日まで
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {mode === 'plans' && (
        <p className="hint" style={{ margin: '4px 0 0' }}>
          年末年始は、選んだ年の12月から翌年1月3日までの1つだけを数えます。
        </p>
      )}

      {mode === 'range' && (
        <div className="field-row" style={TWO_COLUMNS}>
          <label>
            開始日
            <input
              type="date"
              value={from}
              min={formatDate(FIRST_DATE)}
              max={formatDate(LAST_DATE)}
              onChange={(e) => setFrom(e.target.value)}
              onBlur={() => track('from')}
            />
          </label>
          <label>
            終了日
            <input
              type="date"
              value={to}
              min={formatDate(FIRST_DATE)}
              max={formatDate(LAST_DATE)}
              onChange={(e) => setTo(e.target.value)}
              onBlur={() => track('to')}
            />
          </label>
        </div>
      )}

      <div className="field-row" style={{ ...TWO_COLUMNS, marginTop: 12 }}>
        <label>
          休みの曜日
          <select
            value={weekend}
            onChange={(e) => {
              setWeekend(e.target.value as WeekendRule);
              track('weekend');
            }}
          >
            <option value="satsun">土日</option>
            <option value="sun">日曜のみ</option>
          </select>
        </label>
        <label>
          年末年始休暇
          <select
            value={newYear}
            onChange={(e) => {
              setNewYear(e.target.value as NewYearRule);
              track('new-year');
            }}
          >
            <option value="dec29">12/29〜1/3</option>
            <option value="dec30">12/30〜1/3</option>
            <option value="none">なし</option>
          </select>
        </label>
        <label>
          夏季休暇
          <select
            value={summer}
            onChange={(e) => {
              setSummer(e.target.value as SummerRule);
              track('summer');
            }}
          >
            <option value="none">なし</option>
            <option value="obon">8/13〜8/16</option>
          </select>
        </label>
      </div>

      {mode === 'plans' &&
        (cards.length === 0 ? (
          <p className="panel quiet" role="status">
            {year}年はこれから取れる連休の案がありません。年を変えてみてください。
          </p>
        ) : (
          <>
            {shown.map((card) => (
              <Card key={`${card.key}|${maxLeave}|${weekend}|${newYear}|${summer}`} card={card} rule={rule} />
            ))}
            {!showAll && cards.length > CARDS_SHOWN && (
              <p style={{ marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowAll(true);
                    track('show-all');
                  }}
                  style={{ width: 'auto', padding: '6px 14px' }}
                >
                  ほかの時期も見る（あと{cards.length - CARDS_SHOWN}件）
                </button>
              </p>
            )}
            <p className="hint" style={{ marginTop: 8 }}>
              「連休の日数 ÷ 有給の日数」の大きい順。今日より前の案は出していません。
              マスの記号は「有」＝有給、「祝」＝祝日、「休」＝会社の休みです。
            </p>
          </>
        ))}

      {mode === 'range' &&
        (!range ? (
          <p className="panel quiet" role="status">
            {formatJa(FIRST_DATE)}〜{formatJa(LAST_DATE)}の範囲で、開始日が終了日より前になるように選んでください。
          </p>
        ) : (
          <div className="panel" role="status">
            <div className="metric">
              <span className="label">必要な有給</span>
              <span className="value">{range.leaveDays.length}</span>
              <span className="unit">日</span>
            </div>
            <p style={{ margin: '6px 0 0', fontWeight: 700 }}>
              {range.leaveDays.length === 0
                ? `有給なしで ${formatMd(fromDate as DateParts)}〜${formatMd(toDate as DateParts)}の ${range.days} 連休`
                : planHeadline({
                    start: fromDate as DateParts,
                    end: toDate as DateParts,
                    days: range.days,
                    leaveDays: range.leaveDays,
                  })}
            </p>
            {range.days <= CALENDAR_MAX_DAYS && (
              <MiniCalendar
                plan={{ start: fromDate as DateParts, end: toDate as DateParts, leaveDays: range.leaveDays }}
                rule={rule}
              />
            )}
            {range.unconfirmed && (
              <p className="hint" style={{ margin: '6px 0 0' }}>
                {HOLIDAY_LAST_YEAR + 1}年の祝日は未確定のため、元日以外は土日（休みの曜日）だけで計算しています。
              </p>
            )}
          </div>
        ))}

      <p className="hint" style={{ marginTop: 12 }}>
        有給の取得日は労働者が指定できますが、事業の正常な運営を妨げる場合、会社は時季を変更できます（労働基準法39条5項）。
        年末年始・夏季の休みは会社ごとに違います。就業規則・会社のカレンダーで確認してください。
        入力した内容はブラウザの中だけで計算され、どこにも送信されません。
      </p>
    </div>
  );
}
