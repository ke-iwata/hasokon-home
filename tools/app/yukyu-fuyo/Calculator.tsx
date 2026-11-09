'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import { formatDate } from '@/lib/date-parts';
import {
  calcYukyu,
  formatDays,
  formatJaDate,
  formatShortDate,
  resolveWeekly,
  tenureLabel,
  tenureShort,
  validateYukyu,
  YUKYU_ERROR_MESSAGES,
  type WeeklyDays,
  type YukyuInput,
} from '@/lib/yukyu-fuyo';

const SLUG = 'yukyu-fuyo';

type WeeklyChoice = '5' | '4' | '3' | '2' | '1' | 'annual';

const WEEKLY_OPTIONS: Array<[WeeklyChoice, string]> = [
  ['5', '週5日以上'],
  ['4', '週4日'],
  ['3', '週3日'],
  ['2', '週2日'],
  ['1', '週1日'],
  ['annual', '週で決まっていない（年の日数で入れる）'],
];

/** 予定表は 360px で折り返さない（日付は短い形・nowrap） */
const cell = {
  padding: '6px 4px',
  fontSize: 'var(--fs-sm)',
  whiteSpace: 'nowrap' as const,
  fontVariantNumeric: 'tabular-nums' as const,
};

/** 空欄は undefined、それ以外は数に（不正な文字列は NaN のまま渡して検査で落とす） */
function num(v: string): number | undefined {
  return v.trim() === '' ? undefined : Number(v);
}

/**
 * 有給休暇 付与日数 計算機の UI。ロジックは lib/yukyu-fuyo.ts。
 * 結果は縦に 1 列で積む（次の付与・残り・年 5 日・予定表）。
 */
export default function Calculator() {
  const [hireDate, setHireDate] = useState('');
  const [weekly, setWeekly] = useState<WeeklyChoice>('5');
  const [annualDays, setAnnualDays] = useState('');
  const [over30h, setOver30h] = useState(false);
  const [carried, setCarried] = useState('');
  const [used, setUsed] = useState('');
  const [today, setToday] = useState('');

  /** 基準日の既定は開いた日。静的書き出しなのでビルド時刻で固定せず、マウント後に入れる */
  useEffect(() => {
    const now = new Date();
    setToday(
      formatDate({
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: now.getDate(),
      }),
    );
  }, []);

  const input: YukyuInput = {
    hireDate,
    weekly: weekly === 'annual' ? 'annual' : (Number(weekly) as WeeklyDays),
    annualDays: num(annualDays),
    over30h,
    carriedAtGrant: num(carried),
    usedSinceGrant: num(used),
    today,
  };
  const ready = hireDate !== '' && today !== '' && (weekly !== 'annual' || annualDays.trim() !== '');
  const error = ready ? validateYukyu(input) : null;
  const r = ready && !error ? calcYukyu(input) : null;

  // 結果を出したときに 1 回だけ送る（入力値は送らない）
  const sent = useRef(false);
  useEffect(() => {
    if (r && !sent.current) {
      sent.current = true;
      trackToolUse(SLUG, 'result');
    }
  }, [r]);

  const resolved = resolveWeekly(input);
  const askHours = resolved !== null && resolved !== 5;

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="yukyu-hire">入社日（雇入れ日）</label>
        <input
          id="yukyu-hire"
          type="date"
          value={hireDate}
          max="2100-12-31"
          onChange={(e) => setHireDate(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="yukyu-weekly">週の所定労働日数</label>
        <select
          id="yukyu-weekly"
          value={weekly}
          onChange={(e) => {
            setWeekly(e.target.value as WeeklyChoice);
            trackToolUse(SLUG, `weekly-${e.target.value}`);
          }}
        >
          {WEEKLY_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {weekly === 'annual' && (
        <div className="field">
          <label htmlFor="yukyu-annual">年の所定労働日数</label>
          <input
            id="yukyu-annual"
            type="number"
            inputMode="numeric"
            min={1}
            max={366}
            value={annualDays}
            onChange={(e) => setAnnualDays(e.target.value)}
          />
          <p className="hint">
            シフト制などで週の日数が決まっていない人は、1年間の所定労働日数を入れてください（48〜366日）。
          </p>
        </div>
      )}

      {askHours && (
        <div className="field">
          <span className="field-label">週の所定労働時間は30時間以上ですか</span>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {(
              [
                [true, 'はい'],
                [false, 'いいえ'],
              ] as const
            ).map(([value, label]) => (
              <label key={label} style={{ fontWeight: over30h === value ? 700 : 400 }}>
                <input
                  type="radio"
                  name="yukyu-over30h"
                  checked={over30h === value}
                  onChange={() => setOver30h(value)}
                  style={{ width: 'auto', marginRight: 6 }}
                />
                {label}
              </label>
            ))}
          </div>
          <p className="hint">30時間以上なら、週4日以下でも正社員と同じ日数（通常の表）になります。</p>
        </div>
      )}

      <details className="field">
        <summary style={{ cursor: 'pointer' }}>繰越・取った日数・基準日（残りと年5日を出すとき）</summary>
        <div style={{ marginTop: 8 }}>
          <div className="field">
            <label htmlFor="yukyu-carried">今回の付与日の時点で、前回分が何日残っていたか</label>
            <input
              id="yukyu-carried"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.5}
              value={carried}
              onChange={(e) => setCarried(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="yukyu-used">今回の付与日以降に取った日数</label>
            <input
              id="yukyu-used"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.5}
              value={used}
              onChange={(e) => setUsed(e.target.value)}
            />
            <p className="hint">
              繰越分から取った日も含めてください。半日は0.5日で数えます。時間単位で取った分は年5日に数えられないので、ここには含めずに入れてください。そのぶん結果の「残り」は多めに出るので、時間単位で取った分を自分で引いて読んでください。
            </p>
          </div>
          <div className="field">
            <label htmlFor="yukyu-today">基準日（今日）</label>
            <input id="yukyu-today" type="date" value={today} onChange={(e) => setToday(e.target.value)} />
          </div>
        </div>
      </details>

      {error ? (
        <p className="note" role="alert">
          {YUKYU_ERROR_MESSAGES[error]}
        </p>
      ) : !r ? (
        <div className="panel quiet">
          <p className="hint" style={{ margin: 0 }}>
            入社日を入れると、次の付与日と日数・時効で消える日・年5日の取得義務の期限が出ます。
          </p>
        </div>
      ) : (
        <>
          <div className="panel">
            <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)' }}>次の付与</div>
            <div className="metric">
              <span className="value" style={{ fontSize: 'clamp(1.2rem, 5.6vw, 1.7rem)' }}>
                {formatJaDate(r.nextGrant.date)}・{r.nextGrant.days}日
              </span>
              <span className="label">（勤続{tenureLabel(r.nextGrant.n)}）</span>
            </div>
            {r.proportional && (
              <p className="hint" style={{ margin: '4px 0 0' }}>
                パート・アルバイトの比例付与（週{r.weekly}
                日の表）で計算しています。
              </p>
            )}
          </div>

          {r.current ? (
            <div className="panel">
              <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)' }}>いま使える有給</div>
              <div className="metric">
                <span className="value">{formatDays(r.balance)}</span>
                <span className="unit">日</span>
              </div>
              {r.carried && (
                <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-sm)' }}>
                  前回分 {formatDays(r.carried.remaining)}日は
                  <strong>{formatJaDate(r.carried.expiresOn)}</strong>
                  まで使えます（その翌日に時効で消えます）
                </p>
              )}
              <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-sm)' }}>
                今回分 {formatDays(r.current.remaining)}日（
                {formatJaDate(r.current.grantedOn)}に{r.current.days}
                日付与）は<strong>{formatJaDate(r.current.expiresOn)}</strong>
                まで使えます
              </p>
              <p className="hint" style={{ margin: '4px 0 0' }}>
                取った日は古いほう（前回分）から先に引いています。どちらから引くかは就業規則によります（多くの会社は古いほうから）。
              </p>
            </div>
          ) : (
            <div className="panel quiet">
              <p style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>
                まだ最初の付与（入社から6か月）の前です。
                {formatJaDate(r.nextGrant.date)}に{r.nextGrant.days}
                日付与されます。
              </p>
            </div>
          )}

          <div className="panel quiet">
            <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)' }}>年5日の取得義務（会社の義務）</div>
            {r.fiveDayDuty.applies && r.fiveDayDuty.deadline ? (
              r.fiveDayDuty.remaining === 0 ? (
                <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-sm)' }}>
                  {formatJaDate(r.fiveDayDuty.deadline)}
                  までの5日は、もう取り終えています。
                </p>
              ) : (
                <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-sm)' }}>
                  <strong>
                    {formatJaDate(r.fiveDayDuty.deadline)}までにあと
                    {formatDays(r.fiveDayDuty.remaining ?? 0)}日
                  </strong>
                  取る必要があります（会社の義務）。
                </p>
              )
            ) : (
              <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-sm)' }}>
                {r.current ? '年10日未満の付与なので、' : 'まだ付与前なので、'}
                年5日の義務の対象外です。
                {r.dutyStartsAt && r.dutyStartsAt.date > (r.current?.grantedOn ?? '') && (
                  <>
                    <strong>
                      週{r.weekly}日の人は{formatJaDate(r.dutyStartsAt.date)}
                      の付与（{tenureLabel(r.dutyStartsAt.n)}
                      ）から対象
                    </strong>
                    になります。
                  </>
                )}
                {r.proportional &&
                  !r.dutyStartsAt &&
                  `週${r.weekly}日の人は10日に届かないので、勤続が延びても対象になりません。`}
                {!r.proportional && !r.current && `${formatJaDate(r.nextGrant.date)}の付与（10日）から対象になります。`}
              </p>
            )}
          </div>

          <h3 style={{ fontSize: '1rem', marginTop: 20 }}>付与の予定</h3>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th scope="col" style={cell}>
                    付与日
                  </th>
                  <th scope="col" style={cell}>
                    勤続
                  </th>
                  <th scope="col" style={cell}>
                    日数
                  </th>
                  <th scope="col" style={cell}>
                    期限
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.schedule.map((s) => {
                  const isCurrent = r.current?.n === s.n;
                  return (
                    <tr key={s.n} style={isCurrent ? { fontWeight: 700 } : undefined}>
                      <td style={cell}>{formatShortDate(s.date)}</td>
                      <td style={cell}>{tenureShort(s.n)}</td>
                      <td style={cell}>{s.days}日</td>
                      <td style={cell}>{formatShortDate(s.expiresOn)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="hint">
            「期限」はその日まで使える最後の日（翌日に時効で消えます）。出勤率8割以上の前提です。8割未満の年はその年の付与が0日になります（翌年以降は勤続年数どおりに戻ります）。
            入社日にまとめて付与する会社は、付与日と年5日の期限が変わります。
          </p>
          <p className="note">
            表示は労働基準法の<strong>最低基準</strong>
            です。会社の就業規則でこれより多く付与されている場合や、個別のご事情の判断は、会社または労働基準監督署にご確認ください。
          </p>

          {r.balance > 0 && (
            <p>
              この<strong>{formatDays(r.balance)}日</strong>
              で年末年始・GWに何連休できるか → <Link href="/renkyu-keisan/">連休計算機</Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
