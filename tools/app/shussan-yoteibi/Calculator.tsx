'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { addDays, formatDate, formatJa, parseDate, weekdayLabel } from '@/lib/date-parts';
import { toWareki } from '@/lib/nenrei';
import { trackToolUse } from '@/lib/analytics';
import {
  calcShussanYoteibi,
  INVALID_DATE_MESSAGE,
  LMP_TO_DUE_DAYS,
  MAX_GESTATION_DAYS,
  MEDICAL_NOTE,
  shussanTeateHandoffQuery,
  trimesterLabel,
  type DueDateBasis,
} from '@/lib/shussan-yoteibi';

/** 最終月経として受け付ける最大の遡り日数（仕様：今日から300日前まで） */
const LMP_MAX_PAST_DAYS = 300;

const BASES: { value: DueDateBasis; label: string; hint: string }[] = [
  {
    value: 'lmp',
    label: '最終月経の開始日',
    hint: '生理が始まった日。この日を妊娠0週0日として280日目が出産予定日です。',
  },
  {
    value: 'ovulation',
    label: '排卵日・受精日',
    hint: '排卵日が分かっている場合。排卵日を2週0日として266日目が出産予定日です。',
  },
  {
    value: 'due',
    label: '医師に言われた出産予定日',
    hint: '超音波検査で予定日が修正されている場合は、こちらを選んでください。',
  },
];

/** '2026年10月8日（木）' の形。和暦は括弧で添える */
function fullDate(iso: string): string {
  const parts = parseDate(iso);
  if (!parts) return iso;
  return `${formatJa(parts)}（${weekdayLabel(parts)}）`;
}

/**
 * 出産予定日・妊娠週数の計算UI。
 *
 * ロジックは持たせない（すべて `lib/shussan-yoteibi.ts` の純関数）。
 * 「今日」は `nenshu-kabe` と同じ仕組みで、サーバ描画・ハイドレーション直後は
 * ビルド時刻を使い、マウント後に端末の日付へ差し替える（ずれるとReactが警告を出す）。
 *
 * @param buildDate ビルド時刻（ISO文字列）
 */
export default function Calculator({ buildDate }: { buildDate: string }) {
  const [basis, setBasis] = useState<DueDateBasis>('lmp');
  const [dateIso, setDateIso] = useState('');
  const [fetusCount, setFetusCount] = useState('1');
  const [asOfIso, setAsOfIso] = useState(() => buildDate.slice(0, 10));

  useEffect(() => {
    const now = new Date();
    setAsOfIso(
      formatDate({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }),
    );
  }, []);

  const date = parseDate(dateIso);
  const asOf = parseDate(asOfIso);
  const count = Number(fetusCount) || 1;
  const r = date
    ? calcShussanYoteibi({ basis, date, fetusCount: count, asOf: asOf ?? undefined })
    : null;

  const selected = BASES.find((b) => b.value === basis) as (typeof BASES)[number];
  // 最終月経は「今日から300日前まで」。医師の予定日は未来なので範囲を変える
  const dateMax = basis === 'due' && asOf ? formatDate(addDays(asOf, MAX_GESTATION_DAYS)) : asOfIso;
  const dateMin =
    basis === 'due' ? asOfIso : asOf ? formatDate(addDays(asOf, -LMP_MAX_PAST_DAYS)) : undefined;
  const wareki = r ? toWareki(r.dueDate) : null;

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="yoteibi-basis">基準にするもの</label>
        <select
          id="yoteibi-basis"
          value={basis}
          onChange={(e) => {
            setBasis(e.target.value as DueDateBasis);
            trackToolUse('shussan-yoteibi', 'basis');
          }}
        >
          {BASES.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
        <p className="hint">{selected.hint}</p>
      </div>

      <div className="field">
        <label htmlFor="yoteibi-date">{selected.label}</label>
        <input
          id="yoteibi-date"
          type="date"
          value={dateIso}
          min={dateMin}
          max={dateMax}
          onChange={(e) => setDateIso(e.target.value)}
          onBlur={() => trackToolUse('shussan-yoteibi', 'date')}
        />
      </div>

      <div className="field">
        <label htmlFor="yoteibi-fetus">赤ちゃんの人数</label>
        <select
          id="yoteibi-fetus"
          value={fetusCount}
          onChange={(e) => setFetusCount(e.target.value)}
        >
          <option value="1">1人（単胎）</option>
          <option value="2">2人（双子）</option>
          <option value="3">3人（三つ子）</option>
        </select>
        <p className="hint">
          人数は<strong>産前休業を請求できる日にだけ</strong>効きます（多胎は予定日の14週間前から）。
          出産予定日そのものは変わりません。
        </p>
      </div>

      <div className="field">
        <label htmlFor="yoteibi-asof">今日の日付</label>
        <input
          id="yoteibi-asof"
          type="date"
          value={asOfIso}
          onChange={(e) => setAsOfIso(e.target.value)}
        />
        <p className="hint">
          妊娠週数を数える基準日です。ふだんは変更する必要はありません（端末の日付が入ります）。
        </p>
      </div>

      {date === null ? (
        <div className="panel quiet">
          <p className="hint" style={{ margin: 0 }}>
            日付を入れると、出産予定日と今日の妊娠週数、産前産後休業の日付が出ます。
          </p>
        </div>
      ) : r === null ? (
        <div className="panel quiet">
          <p className="hint" style={{ margin: 0 }}>
            {INVALID_DATE_MESSAGE}
          </p>
        </div>
      ) : (
        <>
          <div className="panel" style={{ textAlign: 'center' }}>
            <div className="metric">
              <span className="value" style={{ fontSize: '1.6rem' }}>
                {formatJa(r.dueDate)}
              </span>
              <span className="unit">（{weekdayLabel(r.dueDate)}）</span>
              <span className="label">
                が出産予定日（妊娠40週0日）
                {wareki && <>／{wareki.label}</>}
              </span>
            </div>
            {r.gestation && (
              <p style={{ margin: 0, fontSize: '1.1rem' }}>
                今日は<strong>妊娠{r.gestation.label}</strong>（妊娠{r.gestation.months}か月・
                {r.trimester && trimesterLabel(r.trimester)}）
                {r.overdueDays > 0 ? (
                  <span className="hint" style={{ display: 'block' }}>
                    予定日から{r.overdueDays}日目です
                  </span>
                ) : (
                  <span className="hint" style={{ display: 'block' }}>
                    予定日まであと{r.daysToDue}日
                    {r.isTerm && '（正期産の期間に入っています）'}
                  </span>
                )}
              </p>
            )}
          </div>

          {r.gestation && (
            <WeekBar
              days={r.gestation.days}
              leaveFromDay={LMP_TO_DUE_DAYS - (r.leave.beforeDays - 1)}
            />
          )}

          <div className="note" style={{ marginTop: 0 }}>
            {MEDICAL_NOTE}
          </div>

          <h3 style={{ fontSize: '1rem', marginBottom: 4 }}>産休・給付の日付</h3>
          <table>
            <tbody>
              <tr>
                <td style={{ textAlign: 'left' }}>
                  産前休業を請求できる日
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)', display: 'block' }}>
                    予定日の{r.multiple ? 14 : 6}週間前（予定日を含めて{r.leave.beforeDays}日）
                  </span>
                </td>
                <td>{fullDate(formatDate(r.leave.leaveFrom))}から</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'left' }}>
                  産後休業が明ける日
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)', display: 'block' }}>
                    出産の翌日から{r.leave.afterDays}日（予定日どおりに生まれた場合）
                  </span>
                </td>
                <td>{fullDate(formatDate(r.leave.afterLeaveUntil))}まで</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'left' }}>
                  産後6週間を過ぎて就業できる日
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)', display: 'block' }}>
                    本人が請求し、医師が支障ないと認めた場合に限られます（労働基準法65条2項）
                  </span>
                </td>
                <td>{fullDate(formatDate(r.leave.workableFrom))}から</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'left' }}>育児休業に入れる日</td>
                <td>{fullDate(formatDate(r.leave.childcareLeaveFrom))}から</td>
              </tr>
            </tbody>
          </table>

          <p style={{ margin: '12px 0' }}>
            <Link
              href={`/shussan-teate/${shussanTeateHandoffQuery(r.dueDate, r.fetusCount)}`}
              onClick={() => trackToolUse('shussan-yoteibi', 'to-shussan-teate')}
              style={{
                display: 'inline-block',
                padding: '10px 18px',
                borderRadius: 'var(--radius-pill)',
                background: 'var(--accent)',
                color: 'var(--on-accent)',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              この予定日で出産手当金を計算する →
            </Link>
          </p>
          <p className="hint">
            予定日と人数を引き継ぎます。産休中にもらえる額は
            <Link href="/shussan-teate/">出産手当金・出産育児一時金 計算機</Link>、
            産休のあとは<Link href="/ikuji-kyugyo-kyufu/">育児休業給付金 計算機</Link>
            で計算できます。
          </p>

          <div className="note">
            <strong>いずれも「予定日どおりに生まれた場合」の日付です。</strong>
            産後休業は出産日の翌日から数えるので、実際の出産が予定日より前後すると産後の日付は同じ日数だけ動きます（産前休業を請求できる日は予定日を基準に決まるので動きません）。
            また産前休業は<strong>請求すれば取得できるもの</strong>で（労働基準法65条1項）、
            自動的に休みになるわけではありません。勤務先への申し出が必要です。
          </div>

          <h3 style={{ fontSize: '1rem', marginBottom: 4 }}>週数の節目</h3>
          <table>
            <tbody>
              {r.milestones.map((m) => (
                <tr key={m.label} style={{ opacity: m.passed ? 0.6 : 1 }}>
                  <td style={{ textAlign: 'left' }}>
                    {m.label}
                    <span
                      style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)', display: 'block' }}
                    >
                      {m.basis}
                    </span>
                  </td>
                  <td>
                    {fullDate(formatDate(m.date))}
                    {m.passed && (
                      <span
                        style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)', display: 'block' }}
                      >
                        経過
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

/**
 * 週数の帯（0〜42週）。初期／中期／後期の区分の上に、産前休業の開始・予定日・今日を置く。
 *
 * 新しいCSSクラスを増やさない約束なので、インラインstyleだけで組む。
 * 目盛りは `justify-content: space-between` ではなく**実際の週数の位置**に置く
 * （等間隔に並べると、40週が帯の右端にあるように見えてしまう。帯の右端は42週）。
 */
function WeekBar({ days, leaveFromDay }: { days: number; leaveFromDay: number }) {
  const percent = (day: number) =>
    `${(Math.max(0, Math.min(day, MAX_GESTATION_DAYS)) / MAX_GESTATION_DAYS) * 100}%`;

  const segments = [
    { label: '初期', to: 14 * 7, background: 'var(--surface-2)' },
    { label: '中期', to: 28 * 7, background: 'var(--surface)' },
    { label: '後期', to: MAX_GESTATION_DAYS, background: 'var(--surface-2)' },
  ];

  const markers = [
    { day: leaveFromDay, label: '産休', color: 'var(--muted)', dashed: true },
    { day: LMP_TO_DUE_DAYS, label: '予定日', color: 'var(--muted)', dashed: true },
    { day: days, label: '今日', color: 'var(--accent)', dashed: false },
  ];

  return (
    <div style={{ margin: '16px 0 20px' }}>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          borderRadius: 8,
          overflow: 'hidden',
          border: '1px solid var(--border)',
        }}
      >
        {segments.map((s, i) => {
          const from = i === 0 ? 0 : segments[i - 1].to;
          return (
            <div
              key={s.label}
              style={{
                flex: s.to - from,
                padding: '10px 4px',
                textAlign: 'center',
                fontSize: '0.8rem',
                background: s.background,
                borderLeft: i === 0 ? undefined : '1px solid var(--border)',
              }}
            >
              {s.label}
            </div>
          );
        })}
        {markers.map((m) => (
          <div
            key={m.label}
            aria-hidden
            style={{
              position: 'absolute',
              left: percent(m.day),
              top: 0,
              bottom: 0,
              width: 0,
              borderLeft: `2px ${m.dashed ? 'dashed' : 'solid'} ${m.color}`,
            }}
          />
        ))}
      </div>

      {/* 目盛り（実際の週数の位置に置く） */}
      <div style={{ position: 'relative', height: 18, fontSize: 'var(--fs-xs)', color: 'var(--muted)' }}>
        {[0, 14, 28, 42].map((week) => (
          <span
            key={week}
            style={{
              position: 'absolute',
              left: percent(week * 7),
              transform:
                week === 0 ? undefined : week === 42 ? 'translateX(-100%)' : 'translateX(-50%)',
              whiteSpace: 'nowrap',
            }}
          >
            {week}週
          </span>
        ))}
      </div>

      <p className="hint" style={{ margin: '4px 0 0' }}>
        今日（妊娠{Math.floor(days / 7)}週{days % 7}日
        {days > LMP_TO_DUE_DAYS && `・予定日から${days - LMP_TO_DUE_DAYS}日目`}）は
        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>実線</span>、
        産前休業を請求できる日と出産予定日（40週0日）は破線です。
      </p>
    </div>
  );
}
