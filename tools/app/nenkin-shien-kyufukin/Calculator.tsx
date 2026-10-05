'use client';

import { useEffect, useState } from 'react';
import { parseDate, type DateParts } from '@/lib/date-parts';
import { trackToolUse } from '@/lib/analytics';
import {
  calcShien,
  CURRENT,
  formatMonthJa,
  PENSION_LABELS,
  slopePoints,
  validate,
  type HouseholdTaxExempt,
  type PensionKind,
  type RoreiResult,
  type ShogaiIzokuResult,
} from '@/lib/nenkin-shien-kyufukin';

const yen = (n: number) => `${Math.round(n).toLocaleString('ja-JP')}円`;

const KINDS: PensionKind[] = ['rorei', 'shogai1', 'shogai2', 'izoku'];

const HOUSEHOLD_LABELS: Record<HouseholdTaxExempt, string> = {
  yes: 'はい',
  no: 'いいえ',
  unknown: '分からない',
};

const radioRow = { display: 'flex', gap: 16, flexWrap: 'wrap' as const };
const radioLabel = { fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center', minHeight: 44 };

/** 空欄は 0、数字以外（カンマは許す）は NaN にして validate に落とさせる */
const num = (s: string) => (s.trim() === '' ? 0 : Number(s.replace(/[,，]/g, '')));

/** 静的出力のときの基準日（ブラウザでは今日に置き換える）。支給の切り替わる 10 月分の初日 */
const FALLBACK_AS_OF: DateParts = { year: 2026, month: 10, day: 1 };

/**
 * 年金生活者支援給付金の判定・月額の計算UI。
 *
 * 受けている年金の種類で出す入力が変わる（仕様書の「出す入力／使う要件」の表）。
 * ロジックは持たせない（すべて lib/nenkin-shien-kyufukin.ts の純関数）。
 */
export default function Calculator() {
  const [kind, setKind] = useState<PensionKind>('rorei');
  const [birthDate, setBirthDate] = useState('1959-05-15');
  const [pensionIncome, setPensionIncome] = useState('780000');
  const [otherIncome, setOtherIncome] = useState('0');
  const [paid, setPaid] = useState('480');
  const [exemptFull, setExemptFull] = useState('0');
  const [exemptQuarter, setExemptQuarter] = useState('0');
  const [household, setHousehold] = useState<HouseholdTaxExempt>('unknown');
  const [dependents, setDependents] = useState('0');
  const [children, setChildren] = useState('1');
  const [asOf, setAsOf] = useState<DateParts>(FALLBACK_AS_OF);

  // 今日の日付は描画後に入れる（静的HTMLとの食い違いで hydration が落ちないように）
  useEffect(() => {
    const d = new Date();
    setAsOf({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });
  }, []);

  const birth = parseDate(birthDate);
  const isRorei = kind === 'rorei';
  const input = birth
    ? {
        kind,
        birth,
        asOf,
        pensionIncome: num(pensionIncome),
        otherIncome: num(otherIncome),
        paidMonths: num(paid),
        exemptFullMonths: num(exemptFull),
        exemptQuarterMonths: num(exemptQuarter),
        household,
        dependents: num(dependents),
        children: num(children),
      }
    : null;
  const errors = input ? validate(input) : ['生年月日を入れてください。'];
  const r = input && errors.length === 0 ? calcShien(input) : null;

  const track = () => trackToolUse('nenkin-shien-kyufukin', 'input');

  return (
    <div className="card">
      <div className="field">
        <div className="field-label" style={{ fontWeight: 700 }}>
          受けている年金
        </div>
        <div style={radioRow}>
          {KINDS.map((k) => (
            <label key={k} style={radioLabel}>
              <input
                type="radio"
                name="shien-kind"
                checked={kind === k}
                onChange={() => {
                  setKind(k);
                  track();
                }}
                style={{ width: 'auto' }}
              />
              {PENSION_LABELS[k]}
            </label>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="shien-birth">生年月日</label>
        <input id="shien-birth" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} onBlur={track} />
      </div>

      {isRorei && (
        <div className="field">
          <label htmlFor="shien-pension">前年（2025年）の公的年金等の収入金額（年額・円）</label>
          <input
            id="shien-pension"
            type="number"
            inputMode="numeric"
            min={0}
            value={pensionIncome}
            onChange={(e) => setPensionIncome(e.target.value)}
            onBlur={track}
          />
          <p className="hint">
            年金振込通知書・源泉徴収票の年額。<strong>遺族年金・障害年金は非課税なので含めません。</strong>
          </p>
        </div>
      )}

      <div className="field">
        <label htmlFor="shien-other">{isRorei ? '前年のその他の所得（円）' : '前年の所得（年金以外・円）'}</label>
        <input
          id="shien-other"
          type="number"
          inputMode="numeric"
          min={0}
          value={otherIncome}
          onChange={(e) => setOtherIncome(e.target.value)}
          onBlur={track}
        />
        <p className="hint">給与・事業などの<strong>所得金額</strong>（収入から給与所得控除・経費を引いた額）。無ければ 0。</p>
      </div>

      {isRorei && (
        <>
          <div className="field-row">
            <div className="field">
              <label htmlFor="shien-paid">保険料納付済の月数</label>
              <input id="shien-paid" type="number" inputMode="numeric" min={0} value={paid} onChange={(e) => setPaid(e.target.value)} onBlur={track} />
            </div>
            <div className="field">
              <label htmlFor="shien-exempt-full">全額・3/4・半額免除の月数</label>
              <input
                id="shien-exempt-full"
                type="number"
                inputMode="numeric"
                min={0}
                value={exemptFull}
                onChange={(e) => setExemptFull(e.target.value)}
                onBlur={track}
              />
            </div>
            <div className="field">
              <label htmlFor="shien-exempt-quarter">1/4免除の月数</label>
              <input
                id="shien-exempt-quarter"
                type="number"
                inputMode="numeric"
                min={0}
                value={exemptQuarter}
                onChange={(e) => setExemptQuarter(e.target.value)}
                onBlur={track}
              />
            </div>
          </div>
          <p className="hint" style={{ marginTop: -8 }}>
            ねんきん定期便・ねんきんネットの数字。厚生年金に入っていた月（20〜60歳）は納付済に数えます。
            納付猶予・学生納付特例の月は免除に入れません（追納していなければ 0 として扱われます）。
          </p>

          <div className="field">
            <div className="field-label" style={{ fontWeight: 700 }}>
              同じ世帯の全員が市町村民税非課税ですか
            </div>
            <div style={radioRow}>
              {(['yes', 'no', 'unknown'] as const).map((h) => (
                <label key={h} style={radioLabel}>
                  <input
                    type="radio"
                    name="shien-household"
                    checked={household === h}
                    onChange={() => setHousehold(h)}
                    style={{ width: 'auto' }}
                  />
                  {HOUSEHOLD_LABELS[h]}
                </label>
              ))}
            </div>
          </div>
        </>
      )}

      {!isRorei && (
        <div className="field-row">
          <div className="field">
            <label htmlFor="shien-dependents">扶養親族等の数</label>
            <input
              id="shien-dependents"
              type="number"
              inputMode="numeric"
              min={0}
              value={dependents}
              onChange={(e) => setDependents(e.target.value)}
              onBlur={track}
            />
          </div>
          {kind === 'izoku' && (
            <div className="field">
              <label htmlFor="shien-children">遺族基礎年金を受けている子の人数</label>
              <input
                id="shien-children"
                type="number"
                inputMode="numeric"
                min={1}
                value={children}
                onChange={(e) => setChildren(e.target.value)}
                onBlur={track}
              />
            </div>
          )}
        </div>
      )}

      {r === null ? (
        <div className="panel quiet" role="alert">
          {errors.map((e) => (
            <p key={e} style={{ margin: 0 }}>
              {e}
            </p>
          ))}
        </div>
      ) : r.kind === 'rorei' ? (
        <RoreiView r={r} paid={num(paid)} exemptFull={num(exemptFull)} exemptQuarter={num(exemptQuarter)} birth={birth!} />
      ) : (
        <ShogaiIzokuView r={r} />
      )}

      <p className="hint">
        <strong>請求書（はがき）が届いた人は、この結果にかかわらず出してください。</strong>
        前年の所得は日本年金機構が市区町村の情報で判定します。このツールの判定は目安です。
        支給は年金と同じ偶数月で、2026年10月分からの初回は12月（10・11月分）です。
      </p>
    </div>
  );
}

function Amount({ monthly, annual, label }: { monthly: number; annual: number; label: string }) {
  return (
    <div className="metric">
      <span className="value">{monthly.toLocaleString('ja-JP')}</span>
      <span className="unit">円</span>
      <span className="label">
        {label}（年{yen(annual)}）
      </span>
    </div>
  );
}

function RoreiView({
  r,
  paid,
  exemptFull,
  exemptQuarter,
  birth,
}: {
  r: RoreiResult;
  paid: number;
  exemptFull: number;
  exemptQuarter: number;
  birth: DateParts;
}) {
  const t = r.thresholds;
  const n = r.insuredMonths;
  const base = CURRENT.baseAmount;

  const incomeText =
    r.incomeClass === 'rorei'
      ? '老齢年金生活者支援給付金の対象の見込み'
      : r.incomeClass === 'hosokuteki'
        ? '補足的老齢年金生活者支援給付金の対象の見込み'
        : '所得基準を超えているため対象外の見込み';
  const incomeNote =
    r.incomeClass === 'rorei'
      ? `所得 ${yen(r.income)} が所得基準額 ${yen(t.base)} 以下`
      : r.incomeClass === 'hosokuteki'
        ? `所得 ${yen(r.income)} が基準額 ${yen(t.base)} を超えて、${yen(t.supplementCap)} 以内`
        : `所得 ${yen(r.income)} が 基準額 ＋ 10万円 ＝ ${yen(t.supplementCap)} を超えています`;

  return (
    <>
      <div className="panel" style={{ textAlign: 'center' }}>
        <p style={{ margin: '0 0 4px', fontWeight: 700 }}>{incomeText}</p>
        <p className="hint" style={{ margin: 0 }}>
          {incomeNote}
        </p>
        {r.household === 'no' && (
          <p style={{ margin: '8px 0 0' }}>
            <strong>世帯に市町村民税が課税されている人がいるため、対象外の見込みです。</strong>
            （世帯全員が非課税になった年度からは、上の所得の区分で受けられます）
          </p>
        )}
        {r.household === 'unknown' && r.incomeClass !== 'over' && (
          <p className="hint" style={{ margin: '8px 0 0' }}>
            世帯全員の非課税は、市区町村の課税（非課税）証明書で確認してください。非課税でなければ対象外です。
          </p>
        )}
        {!r.is65 && (
          <p className="hint" style={{ margin: '8px 0 0' }}>
            まだ65歳になっていません。給付金は<strong>{formatMonthJa(r.startMonth)}分から</strong>
            （65歳に達した月の翌月分から）。繰上げ受給中の人もこの月からです。
          </p>
        )}
        {r.incomeClass !== 'over' &&
          (r.zeroReason ? (
            <p style={{ margin: '8px 0 0' }}>
              所得の区分は補足的給付の対象ですが、<strong>計算上の月額は0円です</strong>（
              {r.zeroReason === 'rate-zero' ? '調整支給率が0のため' : '保険料納付済の期間が無いため'}
              ）。請求書が届いた人は年金機構の判定に従ってください。
            </p>
          ) : (
            <Amount monthly={r.monthly} annual={r.annual} label={r.household === 'no' ? '所得だけで見た月額' : '月額の見込み'} />
          ))}
      </div>

      {r.incomeClass === 'rorei' && (
        <p className="hint">
          計算：{base.toLocaleString('ja-JP')} × {paid}月 ÷ {n}月 ＝ {yen(r.paidPart)}
          {(exemptFull > 0 || exemptQuarter > 0) && (
            <>
              <br />
              免除分：（{t.exemptFull.toLocaleString('ja-JP')} × {exemptFull}月
              {exemptQuarter > 0 && ` ＋ ${t.exemptQuarter.toLocaleString('ja-JP')} × ${exemptQuarter}月`}）÷ {n}月 ＝{' '}
              {yen(r.exemptPart)}
            </>
          )}
          <br />
          月額 ＝ {yen(r.monthly)}（50銭以上は1円に切り上げ、50銭未満は切り捨て）
        </p>
      )}
      {r.incomeClass === 'hosokuteki' && r.rate !== null && (
        <p className="hint">
          調整支給率 ＝（{t.supplementCap.toLocaleString('ja-JP')} − {r.income.toLocaleString('ja-JP')}）÷ 100,000 ＝{' '}
          {r.rate.toFixed(5)}
          <br />
          計算：{base.toLocaleString('ja-JP')} × {paid}月 ÷ {n}月 × {r.rate.toFixed(5)} ＝ {yen(r.monthly)}
          （補足的給付には免除期間の分はありません）
        </p>
      )}

      <Slope paid={paid} exemptFull={exemptFull} exemptQuarter={exemptQuarter} birth={birth} income={r.income} />
    </>
  );
}

function ShogaiIzokuView({ r }: { r: ShogaiIzokuResult }) {
  return (
    <div className="panel" style={{ textAlign: 'center' }}>
      <p style={{ margin: '0 0 4px', fontWeight: 700 }}>
        {r.withinLimit
          ? `${r.kind === 'izoku' ? '遺族' : '障害'}年金生活者支援給付金の対象の見込み`
          : '所得制限を超えているため対象外の見込み'}
      </p>
      <p className="hint" style={{ margin: 0 }}>
        前年の所得 {yen(r.income)} が 所得制限（{yen(CURRENT.shogaiIzokuLimit)} ＋ 扶養親族の加算 ＝ {yen(r.limit)}）
        {r.withinLimit ? '以下' : 'を超えています'}
      </p>
      {r.withinLimit && <Amount monthly={r.monthly} annual={r.annual} label="月額の見込み" />}
      <p className="hint" style={{ margin: 0 }}>
        扶養親族の加算は1人38万円で数えています。70歳以上の扶養親族・配偶者（48万円）、19〜22歳の扶養親族（63万円）がいる場合は上限がさらに上がります。
        世帯の非課税は、障害・遺族の給付金の要件ではありません。
      </p>
    </div>
  );
}

/** 所得 80万〜94万円の月額の折れ線（「1円超えたら0」ではなく10万円の幅で減ることを見せる） */
function Slope({
  paid,
  exemptFull,
  exemptQuarter,
  birth,
  income,
}: {
  paid: number;
  exemptFull: number;
  exemptQuarter: number;
  birth: DateParts;
  income: number;
}) {
  const from = 800_000;
  const to = 940_000;
  const pts = slopePoints(paid, exemptFull, exemptQuarter, birth, from, to);
  const max = Math.max(1, ...pts.map((p) => p.monthly));
  const W = 320;
  const H = 140;
  const pad = { l: 16, r: 8, t: 12, b: 24 };
  const x = (v: number) => pad.l + ((v - from) / (to - from)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.income).toFixed(1)},${y(p.monthly).toFixed(1)}`).join(' ');
  const inRange = income >= from && income <= to;
  const here = pts.reduce((a, b) => (Math.abs(b.income - income) < Math.abs(a.income - income) ? b : a));

  return (
    <figure style={{ margin: '16px 0' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`所得80万円から94万円までの月額。基準額までは${yen(max)}、そこから10万円の幅で0円まで下がります`}
        style={{ maxWidth: 520, display: 'block', margin: '0 auto' }}
      >
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--border)" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
        {inRange && <circle cx={x(here.income)} cy={y(here.monthly)} r={5} fill="var(--accent-strong)" />}
        {[800_000, 850_000, 900_000].map((v) => (
          <text key={v} x={x(v)} y={H - 6} fontSize={10} fill="var(--muted)" textAnchor="middle">
            {v / 10_000}万
          </text>
        ))}
        <text x={W - pad.r} y={H - 6} fontSize={10} fill="var(--muted)" textAnchor="end">
          所得
        </text>
      </svg>
      <figcaption className="hint" style={{ textAlign: 'center' }}>
        あなたの月数で見た、所得ごとの月額（{inRange ? '点があなたの所得' : 'あなたの所得はこの範囲の外'}）。
        基準額を1円超えても0円にはならず、10万円の幅で減っていきます。
      </figcaption>
    </figure>
  );
}
