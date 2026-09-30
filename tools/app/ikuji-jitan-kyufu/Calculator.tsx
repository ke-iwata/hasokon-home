'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { addMonths, formatDate, formatJa, parseDate } from '@/lib/date-parts';
import { trackToolUse } from '@/lib/analytics';
import {
  CONTINUOUS_GAP_DAYS,
  LIMIT_MAX,
  LIMIT_MIN,
  START_WAGE_MAX,
  START_WAGE_MIN,
  calcIkujiJitan,
  formatRate,
  type AmountReason,
  type IkujiJitanResult,
} from '@/lib/ikuji-jitan-kyufu';

const fmtYen = (yen: number) => `${Math.round(yen).toLocaleString('ja-JP')}円`;

/** 「どの式で決まったか」の1行 */
function reasonText(r: IkujiJitanResult): string {
  const m = r.month;
  const texts: Record<AmountReason, string> = {
    base: `時短後の月給が時短前の90%（${fmtYen(m.threshold90)}）以下なので、月給の10%です。`,
    taper: `時短後の月給が時短前の90%（${fmtYen(m.threshold90)}）を超えるので、支給率が ${formatRate(m.rateHundredths)} に下がります（賃金率 ${formatRate(m.wageRateHundredths)}、9,000 ÷ 賃金率 − 90）。`,
    cap: `月給 ＋ 支給額（${fmtYen(m.beforeCap)}）が支給限度額 ${fmtYen(LIMIT_MAX)} を超えるので、${fmtYen(LIMIT_MAX)} − 月給 です。`,
    'none-over100': '時短後の月給が時短前（開始時賃金月額）の100%以上なので、支給されません。',
    'none-over-limit': `時短後の月給が支給限度額 ${fmtYen(LIMIT_MAX)} 以上なので、支給されません。`,
    'none-min': `算定した支給額が最低限度額 ${fmtYen(LIMIT_MIN)} 以下なので、支給されません。`,
  };
  return texts[m.reason];
}

/**
 * @param buildDate ビルド時刻（ISO文字列）。静的書き出しなので、サーバ描画と
 *   ハイドレーション直後はこの固定値を初期値にし、マウント後に「画面を開いた日」へ差し替える。
 */
export default function Calculator({ buildDate }: { buildDate: string }) {
  const [before, setBefore] = useState('300000');
  const [after, setAfter] = useState('220000');
  const [birth, setBirth] = useState(() => defaultBirth(buildDate));
  const [start, setStart] = useState(() => buildDate.slice(0, 10));
  const [continuous, setContinuous] = useState(true);

  useEffect(() => {
    const today = new Date().toISOString();
    setBirth(defaultBirth(today));
    setStart(today.slice(0, 10));
  }, []);

  const birthDate = parseDate(birth);
  const startDate = parseDate(start);

  const r = useMemo(() => {
    if (!birthDate || !startDate) return null;
    return calcIkujiJitan({
      wageBefore: Number(before) || 0,
      wageAfter: Number(after) || 0,
      birth: birthDate,
      jitanStart: startDate,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [before, after, birth, start]);

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="ij-before">
          {continuous ? '育休前の月給（円）' : '時短前の月給（円）'}
        </label>
        <input
          id="ij-before"
          type="number"
          inputMode="numeric"
          min={0}
          step={10000}
          value={before}
          onChange={(e) => setBefore(e.target.value)}
        />
        <p className="hint">
          <strong>基本給ではなく、残業代・通勤手当などを含む総支給額</strong>
          （賞与・臨時の手当を除く）。{continuous ? '育休前' : '時短前'}6か月の平均です。
          開始時賃金月額は {fmtYen(START_WAGE_MIN)}〜{fmtYen(START_WAGE_MAX)} の範囲に収めて計算します。
        </p>
      </div>

      <div className="field">
        <label htmlFor="ij-after">時短後の月給（円）</label>
        <input
          id="ij-after"
          type="number"
          inputMode="numeric"
          min={0}
          step={10000}
          value={after}
          onChange={(e) => setAfter(e.target.value)}
          onBlur={() => trackToolUse('ikuji-jitan-kyufu', 'wage-after')}
        />
        <p className="hint">
          支給対象月に支払われる賃金（同じく総支給額）。賞与・臨時に支払われた賃金は含めません。
        </p>
      </div>

      <div className="field">
        <div className="field-row">
          <div>
            <label htmlFor="ij-birth">子の生年月日</label>
            <input
              id="ij-birth"
              type="date"
              value={birth}
              onChange={(e) => setBirth(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="ij-start">時短の開始日</label>
            <input
              id="ij-start"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
        </div>
        <label
          style={{ fontWeight: 400, display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 'var(--fs-sm)', marginTop: 8 }}
        >
          <input
            type="checkbox"
            checked={continuous}
            onChange={(e) => setContinuous(e.target.checked)}
            style={{ width: 'auto', marginTop: 3 }}
          />
          育休から引き続いて時短を始める（育休の終了日から{CONTINUOUS_GAP_DAYS}日以内）
        </label>
        {!continuous && (
          <p className="hint">
            育休から引き続かない場合は、<strong>時短の開始日前2年間に、賃金支払基礎日数が11日以上
            （無ければ賃金支払の基礎となった時間が80時間以上）の完全月が12か月以上</strong>
            あることが受給資格です。この計算機では判定しません。
          </p>
        )}
      </div>

      {r === null ? (
        <div className="note">
          月給と日付を入力すると計算します（時短の開始日は子の生年月日より後にしてください）。
        </div>
      ) : (
        <>
          <div className="panel">
            <div className="metric">
              <span className="label">月の支給額</span>
              <span className="value">{fmtYen(r.month.amount)}</span>
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              {reasonText(r)}
            </p>
            {r.months > 0 ? (
              <div className="metric" style={{ marginTop: 8 }}>
                <span className="label">
                  {r.firstMonth.year}年{r.firstMonth.month}月〜{r.lastMonth.year}年{r.lastMonth.month}月の
                  {r.months}か月ぶん（毎月同じ月給なら）
                </span>
                <span className="value">{fmtYen(r.total)}</span>
              </div>
            ) : (
              <p className="hint" style={{ marginTop: 8 }}>
                支給対象月は、子が2歳に達する日（{formatJa(r.reachesTwo)}）の前日の属する
                {r.lastMonth.year}年{r.lastMonth.month}月までです。この開始日では支給対象月がありません。
              </p>
            )}
          </div>

          <dl className="kv" style={{ marginTop: 16 }}>
            <div>
              <dt>開始時賃金月額</dt>
              <dd>
                {fmtYen(r.startWage.monthly)}
                {r.startWage.cap === 'max' && (
                  <span className="chip" style={{ marginLeft: 8 }}>
                    上限適用
                  </span>
                )}
                {r.startWage.cap === 'min' && (
                  <span className="chip" style={{ marginLeft: 8 }}>
                    下限適用
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt>時短前の90%（10%のままの上限）</dt>
              <dd>{fmtYen(r.month.threshold90)}</dd>
            </div>
            <div>
              <dt>手取りの目安（時短後の月給 ＋ 支給額）</dt>
              <dd>{fmtYen(r.paidPlusBenefit)}</dd>
            </div>
            <div>
              <dt>子が2歳に達する日</dt>
              <dd>{formatJa(r.reachesTwo)}</dd>
            </div>
          </dl>

          <p className="hint">
            給付は非課税で、社会保険料もかからないので、月給の手取りにそのまま足せます
            （月給から引かれる税・保険料はこの計算機では出しません）。
            開始月と終了月は賃金が日割りになるため、実際の額は変わります。
          </p>
        </>
      )}

      <div className="note">
        支給の可否と金額はハローワークの決定によります。このツールは毎月同じ賃金が続く前提の目安です。
      </div>

      <p className="hint" style={{ marginTop: 12 }}>
        育休中の給付は → <Link href="/ikuji-kyugyo-kyufu/">育児休業給付金 計算機</Link>
      </p>
    </div>
  );
}

/** 生年月日の初期値（開いた日の1年前）。'YYYY-MM-DD...' を受け取る */
function defaultBirth(iso: string): string {
  const today = parseDate(iso.slice(0, 10));
  return today ? formatDate(addMonths(today, -12)) : '';
}
