'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { trackToolUse } from '@/lib/analytics';
import { PREFECTURES } from '@/lib/saitei-chingin';
import {
  DEFAULT_ANNUAL_WORK_DAYS,
  MONTHLY_OVERTIME_THRESHOLD,
  calcZangyodai,
  displayYen,
  hoursFrom,
  workDaysFromHolidays,
  type RoundingMode,
  type WageType,
  type ZangyodaiInput,
} from '@/lib/zangyodai';

const yen = (v: number) => `${Math.round(v).toLocaleString('ja-JP')}円`;
/** 表示用の円（法令どおりモードは切り上げ） */
const dispYen = (v: number, rounding: RoundingMode) =>
  `${displayYen(v, rounding).toLocaleString('ja-JP')}円`;
/** 1.25 → '×1.25' */
const rateLabel = (rate: number) => `×${rate.toFixed(2)}`;
/** 1836.7346 → '1,836.73' */
const rateYen = (v: number) =>
  v.toLocaleString('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** 163.3333 → '163.3' */
const hoursLabel = (h: number) => `${Math.round(h * 10) / 10}`;

/** 1日の所定労働時間の選択肢（よくある値＋自由入力） */
const DAILY_HOURS_CHOICES = ['7', '7.5', '7.75', '8'] as const;

type HM = { h: string; m: string };

const toHours = (v: HM) => hoursFrom(Number(v.h) || 0, Number(v.m) || 0);

/** 時間＋分の入力1組 */
function HoursField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  value: HM;
  onChange: (v: HM) => void;
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="field-row">
        <input
          id={`${id}-h`}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          aria-label={`${label}（時間）`}
          value={value.h}
          onChange={(e) => onChange({ ...value, h: e.target.value })}
          placeholder="時間"
        />
        <input
          id={`${id}-m`}
          type="number"
          inputMode="numeric"
          min={0}
          max={59}
          step={1}
          aria-label={`${label}（分）`}
          value={value.m}
          onChange={(e) => onChange({ ...value, m: e.target.value })}
          placeholder="分"
        />
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export default function Calculator() {
  const [wageType, setWageType] = useState<WageType>('monthly');
  const [monthlyWage, setMonthlyWage] = useState('300000');
  const [hourlyWage, setHourlyWage] = useState('1200');
  const [dailyHoursChoice, setDailyHoursChoice] = useState<string>('8');
  const [dailyHoursOther, setDailyHoursOther] = useState('7.9');
  const [annualWorkDays, setAnnualWorkDays] = useState(String(DEFAULT_ANNUAL_WORK_DAYS));
  const [annualHolidays, setAnnualHolidays] = useState('');

  const [overtime, setOvertime] = useState<HM>({ h: '20', m: '0' });
  const [withinStatutory, setWithinStatutory] = useState<HM>({ h: '0', m: '0' });
  const [overtimeNight, setOvertimeNight] = useState<HM>({ h: '0', m: '0' });
  const [holiday, setHoliday] = useState<HM>({ h: '0', m: '0' });
  const [holidayNight, setHolidayNight] = useState<HM>({ h: '0', m: '0' });
  const [scheduledNight, setScheduledNight] = useState<HM>({ h: '0', m: '0' });

  const [commuteFamily, setCommuteFamily] = useState('0');
  const [housing, setHousing] = useState('0');
  const [attendance, setAttendance] = useState('0');

  const [rounding, setRounding] = useState<RoundingMode>('strict');
  const [fixedAmount, setFixedAmount] = useState('0');
  const [fixedHours, setFixedHours] = useState('0');
  const [prefCode, setPrefCode] = useState('');

  /**
   * 最低賃金の改定の発効判定に使う基準日。
   * 静的書き出しなのでビルド時刻で描画してから、マウント後に「開いた日」へ差し替える
   * （サーバ描画とハイドレーションの食い違いを避ける。lib/saitei-chingin.ts と同じ作法）。
   */
  const [asOf, setAsOf] = useState<Date>(() => new Date());
  useEffect(() => setAsOf(new Date()), []);

  const dailyHours =
    dailyHoursChoice === 'other' ? Number(dailyHoursOther) || 0 : Number(dailyHoursChoice);

  const input = useMemo<ZangyodaiInput>(
    () => ({
      wageType,
      monthlyWage: Number(monthlyWage) || 0,
      hourlyWage: Number(hourlyWage) || 0,
      dailyHours,
      annualWorkDays: Number(annualWorkDays) || 0,
      allowances:
        wageType === 'monthly'
          ? {
              commuteFamily: Number(commuteFamily) || 0,
              housing: Number(housing) || 0,
              attendance: Number(attendance) || 0,
            }
          : undefined,
      hours: {
        withinStatutory: toHours(withinStatutory),
        overtime: toHours(overtime),
        overtimeNight: toHours(overtimeNight),
        holiday: toHours(holiday),
        holidayNight: toHours(holidayNight),
        scheduledNight: toHours(scheduledNight),
      },
      rounding,
      fixedOvertime:
        Number(fixedAmount) > 0 || Number(fixedHours) > 0
          ? { amount: Number(fixedAmount) || 0, hours: Number(fixedHours) || 0 }
          : null,
      prefectureCode: prefCode === '' ? null : Number(prefCode),
      asOf,
    }),
    [
      wageType,
      monthlyWage,
      hourlyWage,
      dailyHours,
      annualWorkDays,
      commuteFamily,
      housing,
      attendance,
      withinStatutory,
      overtime,
      overtimeNight,
      holiday,
      holidayNight,
      scheduledNight,
      rounding,
      fixedAmount,
      fixedHours,
      prefCode,
      asOf,
    ],
  );

  const r = calcZangyodai(input);
  // 端数処理を切り替えたときの差を1行で出すため、もう一方も計算しておく
  const otherRounding: RoundingMode = rounding === 'strict' ? 'simplified' : 'strict';
  const other = calcZangyodai({ ...input, rounding: otherRounding });
  const roundingDiff = displayYen(other.total, otherRounding) - displayYen(r.total, rounding);

  const check = r.minWageCheck;

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="wage-type">賃金の形態</label>
        <select
          id="wage-type"
          value={wageType}
          onChange={(e) => {
            setWageType(e.target.value as WageType);
            trackToolUse('zangyodai-keisan', 'select-wage-type');
          }}
        >
          <option value="monthly">月給制</option>
          <option value="hourly">時給制</option>
        </select>
        <p className="hint">
          日給制・年俸制・歩合給（出来高払）には対応していません（1時間あたりの賃金の出しかたが違います）。
        </p>
      </div>

      {wageType === 'monthly' ? (
        <>
          <div className="field">
            <label htmlFor="monthly-wage">月給（額面・円）</label>
            <input
              id="monthly-wage"
              type="number"
              inputMode="numeric"
              min={0}
              step={10000}
              value={monthlyWage}
              onChange={(e) => setMonthlyWage(e.target.value)}
            />
            <p className="hint">
              基本給＋手当の合計（社会保険料・税金を引く前）。賞与や臨時の賃金は含めません。
            </p>
          </div>

          <div className="field">
            <label htmlFor="daily-hours">1日の所定労働時間</label>
            <select
              id="daily-hours"
              value={dailyHoursChoice}
              onChange={(e) => setDailyHoursChoice(e.target.value)}
            >
              {DAILY_HOURS_CHOICES.map((h) => (
                <option key={h} value={h}>
                  {h}時間
                </option>
              ))}
              <option value="other">その他（自分で入力）</option>
            </select>
            {dailyHoursChoice === 'other' && (
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={8}
                step={0.25}
                aria-label="1日の所定労働時間（自由入力）"
                value={dailyHoursOther}
                onChange={(e) => setDailyHoursOther(e.target.value)}
                style={{ marginTop: 8 }}
              />
            )}
            <p className="hint">就業規則で決まっている、休憩を除いた1日の労働時間です。</p>
          </div>

          <div className="field">
            <label htmlFor="work-days">年間の所定労働日数</label>
            <input
              id="work-days"
              type="number"
              inputMode="numeric"
              min={1}
              max={366}
              step={1}
              value={annualWorkDays}
              onChange={(e) => setAnnualWorkDays(e.target.value)}
            />
            <p className="hint">
              就業規則やカレンダーに書かれている日数。分からなければ年間休日から目安を入れられます。
            </p>
            <div className="field-row" style={{ marginTop: 8, alignItems: 'end' }}>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={365}
                step={1}
                aria-label="年間休日数"
                placeholder="年間休日数（例：120）"
                value={annualHolidays}
                onChange={(e) => {
                  setAnnualHolidays(e.target.value);
                  const days = Number(e.target.value);
                  if (Number.isFinite(days) && e.target.value !== '') {
                    setAnnualWorkDays(String(workDaysFromHolidays(days)));
                  }
                }}
              />
            </div>
            <p className="hint">
              年間休日を入れると <strong>365 − 休日数</strong> を上の欄に入れます。
              <strong>閏年は366日</strong>なので、これはあくまで目安です。正確には就業規則の年間所定労働日数を入れてください。
            </p>
          </div>
        </>
      ) : (
        <div className="field">
          <label htmlFor="hourly-wage">時給（円）</label>
          <input
            id="hourly-wage"
            type="number"
            inputMode="numeric"
            min={0}
            step={10}
            value={hourlyWage}
            onChange={(e) => setHourlyWage(e.target.value)}
          />
          <p className="hint">
            この時給がそのまま「1時間あたりの賃金」になります（月給制のような換算は不要です）。
          </p>
        </div>
      )}

      <HoursField
        id="overtime"
        label="今月の時間外労働"
        hint={
          <>
            1日8時間・週40時間の<strong>法定労働時間を超えた分</strong>の1か月合計です。0でも構いません。
            所定7時間の会社で8時間目まで働いた分は「法定内残業」なので、下の「詳しい条件」に入れてください。
          </>
        }
        value={overtime}
        onChange={(v) => {
          setOvertime(v);
          trackToolUse('zangyodai-keisan', 'input-overtime');
        }}
      />

      <details className="field">
        <summary style={{ cursor: 'pointer' }}>詳しい条件（残業の内訳・手当・固定残業代・都道府県）</summary>

        <div style={{ marginTop: 14 }}>
          <p className="hint" style={{ marginTop: 0 }}>
            <strong>残業の内訳</strong>
            （深夜・法定休日は、上の「今月の時間外労働」の<strong>うち何時間か</strong>を入れます）
          </p>

          <HoursField
            id="within-statutory"
            label="法定内残業（所定〜8時間の分）"
            hint="所定7時間の会社で8時間目まで働いた分など。割増は不要で、1時間あたりの賃金 ×1.00 が付きます。"
            value={withinStatutory}
            onChange={setWithinStatutory}
          />
          <HoursField
            id="overtime-night"
            label="時間外労働のうち深夜（22〜5時）"
            hint="上の「今月の時間外労働」のうち、22時〜5時に当たる時間です。"
            value={overtimeNight}
            onChange={setOvertimeNight}
          />
          <HoursField
            id="holiday"
            label="法定休日の労働"
            hint="週1日（または4週4日）の法定休日に働いた時間。週休2日の会社の土曜は法定外休日なので、ここではなく「時間外労働」に入れます。"
            value={holiday}
            onChange={setHoliday}
          />
          <HoursField
            id="holiday-night"
            label="法定休日の労働のうち深夜"
            value={holidayNight}
            onChange={setHolidayNight}
          />
          <HoursField
            id="scheduled-night"
            label="所定労働時間内の深夜（夜勤など）"
            hint="残業ではない深夜勤務。1.0 の部分は月給に含まれているので、割増分の 0.25 だけが付きます。"
            value={scheduledNight}
            onChange={setScheduledNight}
          />

          {wageType === 'monthly' && (
            <>
              <p className="hint">
                <strong>算定基礎から除外できる手当（月額）</strong>
                。労働基準法施行規則21条の7つ（家族・通勤・別居・子女教育・住宅の各手当、臨時に支払われた賃金、1か月を超える期間ごとに支払われる賃金）
                <strong>だけ</strong>が除外できます。
                <strong>全員に一律で支給される手当は、名前が同じでも除外できません</strong>
                （例：全員に一律1万円の「住宅手当」は算定基礎に入ります）。
              </p>
              <div className="field">
                <label htmlFor="allow-commute">通勤手当・家族手当</label>
                <input
                  id="allow-commute"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1000}
                  value={commuteFamily}
                  onChange={(e) => setCommuteFamily(e.target.value)}
                />
                <p className="hint">割増の算定基礎からも、最低賃金の対象賃金からも除きます。</p>
              </div>
              <div className="field">
                <label htmlFor="allow-housing">住宅手当・別居手当・子女教育手当</label>
                <input
                  id="allow-housing"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1000}
                  value={housing}
                  onChange={(e) => setHousing(e.target.value)}
                />
                <p className="hint">
                  割増の算定基礎からは除きますが、<strong>最低賃金の対象賃金には含めます</strong>。
                </p>
              </div>
              <div className="field">
                <label htmlFor="allow-attendance">精皆勤手当</label>
                <input
                  id="allow-attendance"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1000}
                  value={attendance}
                  onChange={(e) => setAttendance(e.target.value)}
                />
                <p className="hint">
                  割増の算定基礎には<strong>含めます</strong>が、最低賃金の対象賃金からは除きます（割増賃金とちょうど逆です）。
                </p>
              </div>
            </>
          )}

          <div className="field">
            <label htmlFor="rounding">端数処理</label>
            <select
              id="rounding"
              value={rounding}
              onChange={(e) => setRounding(e.target.value as RoundingMode)}
            >
              <option value="strict">法令どおり（丸めない）</option>
              <option value="simplified">通達の簡便法（30分・50銭で丸める）</option>
            </select>
            <p className="hint">
              簡便法は昭和63年3月14日 基発第150号が認めている丸め方です。
              1か月の時間数は30分未満切捨て・30分以上切上げ、金額の円未満は50銭未満切捨て・50銭以上切上げ。
              <strong>1日ごとに端数を切り捨てるのは認められていません。</strong>
            </p>
          </div>

          <div className="field">
            <span className="field-label">固定残業代（みなし残業）</span>
            <div className="field-row">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1000}
                aria-label="固定残業代の月額（円）"
                placeholder="月額（円）"
                value={fixedAmount}
                onChange={(e) => setFixedAmount(e.target.value)}
              />
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                aria-label="固定残業代が何時間分か"
                placeholder="何時間分"
                value={fixedHours}
                onChange={(e) => setFixedHours(e.target.value)}
              />
            </div>
            <p className="hint">
              求人票や給与明細に「みなし残業◯時間分（◯円）」と書かれている額と時間数です。無ければ0のままで構いません。
            </p>
          </div>

          <div className="field">
            <label htmlFor="pref">都道府県（参考：最低賃金との比較）</label>
            <select
              id="pref"
              value={prefCode}
              onChange={(e) => {
                setPrefCode(e.target.value);
                trackToolUse('zangyodai-keisan', 'select-prefecture');
              }}
            >
              <option value="">選ばない（比較しない）</option>
              {PREFECTURES.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </details>

      <div className="panel">
        <div className="metric">
          <span className="value">{displayYen(r.total, rounding).toLocaleString('ja-JP')}</span>
          <span className="unit">円</span>
          <span className="label">
            が今月の残業代（法定の最低限度
            {rounding === 'strict' && '・円未満は切り上げ'}）
          </span>
        </div>
        <p className="hint" style={{ marginBottom: 0 }}>
          1時間あたりの賃金は <strong>{rateYen(r.hourlyRate)}円</strong>
          {wageType === 'monthly' ? (
            <>
              （{yen(r.baseWage)} ÷（{Number(annualWorkDays) || 0}日 × {dailyHours}h ÷ 12 ＝{' '}
              {hoursLabel(r.monthlyAverageHours)}h））
            </>
          ) : (
            <>（入力した時給をそのまま使います）</>
          )}
          。
        </p>
      </div>

      {r.rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>種類</th>
              <th>時間</th>
              <th>金額</th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((row) => (
              <tr key={row.key}>
                <td style={{ textAlign: 'left' }}>
                  {row.label}
                  <span style={{ color: 'var(--muted)' }}>（{rateLabel(row.rate)}）</span>
                </td>
                <td>{hoursLabel(row.hours)}h</td>
                <td>{dispYen(row.amount, rounding)}</td>
              </tr>
            ))}
            <tr>
              <td style={{ textAlign: 'left' }}>
                <strong>合計</strong>
              </td>
              <td />
              <td>
                <strong>{dispYen(r.total, rounding)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      )}

      {r.nightHours > 0 && (
        <p className="hint">
          深夜（22〜5時）は、時間外・法定休日のどちらと重なっても <strong>+0.25</strong> が乗るだけなので、
          1行にまとめています（時間外＋深夜＝1.50、月60時間超＋深夜＝1.75、法定休日＋深夜＝1.60と同じ金額になります）。
        </p>
      )}

      <div className="panel quiet">
        <dl className="kv">
          {r.grossWithOvertime !== undefined && (
            <div>
              <dt>残業代込みの今月の額面</dt>
              <dd>{dispYen(r.grossWithOvertime, rounding)}</dd>
            </div>
          )}
          <div>
            <dt>同じ残業が1年続いた場合の残業代</dt>
            <dd>{dispYen(r.annualOvertime, rounding)}</dd>
          </div>
          {r.overtimeOver60 > 0 && (
            <div>
              <dt>月{MONTHLY_OVERTIME_THRESHOLD}時間を超えた時間外労働</dt>
              <dd>{hoursLabel(r.overtimeOver60)}h（5割増）</dd>
            </div>
          )}
        </dl>
        {r.grossWithOvertime !== undefined && (
          <p className="hint" style={{ marginBottom: 0 }}>
            この額面から手取りがいくらになるかは{' '}
            <Link href="/tedori-keisan/">手取り計算機</Link> で計算できます。
          </p>
        )}
      </div>

      {r.fixedOvertime && (
        <div className="panel quiet">
          <strong>固定残業代（みなし残業）との差額</strong>
          <p className="hint" style={{ marginBottom: 0 }}>
            固定分の{hoursLabel(r.fixedOvertime.hours)}時間を法定どおり払うと{' '}
            {dispYen(r.fixedOvertime.requiredYen, rounding)} です。
            {r.fixedOvertime.sufficient ? (
              <>入力された{yen(r.fixedOvertime.amount)}はこれを満たしています。</>
            ) : (
              <>
                入力された{yen(r.fixedOvertime.amount)}では{' '}
                <strong>{dispYen(r.fixedOvertime.shortfallYen, rounding)}足りません</strong>
                （固定残業代は、その時間数を法定の割増で払える額である必要があります）。
              </>
            )}{' '}
            今月の残業代{dispYen(r.total, rounding)}のうち、固定残業代を超える分は{' '}
            <strong>{dispYen(r.fixedOvertime.differenceYen, rounding)}</strong> です。
            {r.fixedOvertime.differenceYen <= 0 &&
              '（今月は固定分の範囲に収まっているため、差額はありません。）'}
          </p>
        </div>
      )}

      {r.total > 0 && roundingDiff !== 0 && (
        <p className="hint">
          端数処理を「{rounding === 'strict' ? '通達の簡便法' : '法令どおり'}」にすると{' '}
          <strong>
            {roundingDiff > 0 ? '+' : '−'}
            {Math.abs(roundingDiff).toLocaleString('ja-JP')}円
          </strong>{' '}
          になります。
        </p>
      )}

      {check && (
        <div className="panel quiet">
          <strong>参考：最低賃金との比較</strong>
          <p className="hint" style={{ marginBottom: 0 }}>
            {check.prefecture.name}の最低賃金は{' '}
            <strong>{check.current.minimumYen.toLocaleString('ja-JP')}円</strong>
            （{check.revision.status === '発効済み' ? '発効済み' : `改定後は${check.revision.yen.toLocaleString('ja-JP')}円`}）。
            あなたの時給換算は <strong>{rateYen(check.hourlyYen)}円</strong> で、
            {check.current.meets ? (
              <>現行額を{Math.floor(check.current.surplus).toLocaleString('ja-JP')}円上回っています。</>
            ) : (
              <>
                現行額を<strong>{Math.ceil(check.current.shortfall).toLocaleString('ja-JP')}円下回っています</strong>
                。勤務先か労働局にご確認ください。
              </>
            )}
            {!check.revised.meets && check.current.meets && (
              <>
                {' '}
                改定後の額（{check.revision.yen.toLocaleString('ja-JP')}円）は下回ります。
              </>
            )}
            <br />
            {wageType === 'monthly' && (
              <>
                最低賃金の比較では<strong>住宅手当は含め、精皆勤手当は除きます</strong>
                （割増賃金とは逆です）。ここで使った対象賃金は {yen(r.minWageBaseWage)} です。
              </>
            )}
            {wageType === 'hourly' && <>時給制なので、入力した時給をそのまま比べています。</>}{' '}
            くわしくは <Link href="/saitei-chingin/">最低賃金 早見表・チェッカー</Link> をご覧ください。
          </p>
        </div>
      )}

      <div className="note">
        <strong>この計算機は労働基準法の最低限度で計算しています。</strong>
        就業規則・給与規程でこれ以上の率や手当を定めている場合は、そちらが優先します。
        管理監督者・変形労働時間制・フレックスタイム制・事業場外みなし労働時間制・裁量労働制は計算の前提が違うため対応していません。
        <strong>日給制・年俸制・歩合給（出来高払）にも対応していません。</strong>
        未払いがあると思われる場合の請求額（遅延損害金・付加金など）はここでは出せません。労働基準監督署か弁護士にご相談ください。
      </div>
    </div>
  );
}
