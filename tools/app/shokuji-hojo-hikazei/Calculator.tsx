'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { trackToolUse } from '@/lib/analytics';
import {
  LIMIT_BEFORE,
  MAX_ROWS,
  MEAL_KIND_LABELS,
  judgeShokuji,
  judgeYashoku,
  limitFor,
  parseCount,
  type MealKind,
  type Period,
} from '@/lib/shokuji-hojo-hikazei';

const yen = (v: number) => `${Math.round(v).toLocaleString('ja-JP')}円`;

const SLUG = 'shokuji-hojo-hikazei';

interface RowState {
  id: number;
  kind: MealKind;
  price: string;
  selfPay: string;
  count: string;
}

const KINDS = Object.keys(MEAL_KIND_LABELS) as MealKind[];

const buttonBase: React.CSSProperties = {
  font: 'inherit',
  color: 'var(--text)',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  cursor: 'pointer',
};

/** 金額・食数の入力欄。数字のキーボードを出し、全角数字も受け付ける（lib の parseCount で直す） */
function NumField({
  id,
  label,
  value,
  onChange,
  unit,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit: string;
}) {
  return (
    <div className="field" style={{ marginBottom: 10 }}>
      <label htmlFor={id}>
        {label}（{unit}）
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export default function Calculator() {
  const [period, setPeriod] = useState<Period>('from-2026-04');
  const [method, setMethod] = useState<'meal' | 'cash'>('meal');
  const [yashoku, setYashoku] = useState<'yes' | 'no'>('yes');
  const [yashokuAmount, setYashokuAmount] = useState('600');
  const [lateNight, setLateNight] = useState(true);
  const [fixedPerShift, setFixedPerShift] = useState(true);
  const [hardToProvide, setHardToProvide] = useState(true);
  const [rows, setRows] = useState<RowState[]>([
    { id: 1, kind: 'reduced', price: '500', selfPay: '250', count: '20' },
  ]);
  const [nextId, setNextId] = useState(2);

  const updateRow = (id: number, patch: Partial<RowState>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const r = useMemo(
    () =>
      judgeShokuji(
        rows.map((row) => ({
          kind: row.kind,
          price: parseCount(row.price),
          selfPay: parseCount(row.selfPay),
          count: parseCount(row.count),
        })),
        period,
      ),
    [rows, period],
  );

  const y = useMemo(
    () =>
      judgeYashoku({
        amountPerShift: parseCount(yashokuAmount),
        period,
        lateNightWorker: lateNight,
        fixedPerShift,
        hardToProvide,
      }),
    [yashokuAmount, period, lateNight, fixedPerShift, hardToProvide],
  );

  const limit = limitFor(period);
  const ratio = r.totalPrice > 0 ? Math.round((r.totalSelf / r.totalPrice) * 1000) / 10 : 0;

  return (
    <div className="card">
      <div className="field">
        <span className="field-label">この食事を出した期間</span>
        {(
          [
            ['from-2026-04', '2026年4月1日以後（限度額 月7,500円）'],
            ['before-2026-04', '2026年3月31日以前（限度額 月3,500円）'],
          ] as const
        ).map(([value, label]) => (
          <label key={value} style={{ display: 'block' }}>
            <input
              type="radio"
              name="period"
              value={value}
              checked={period === value}
              onChange={() => {
                setPeriod(value);
                trackToolUse(SLUG, 'select-period');
              }}
            />{' '}
            {label}
          </label>
        ))}
        <p className="hint">
          <strong>3月31日以前の食事と4月1日以後の食事は分けて判定してください</strong>
          （限度額が{yen(LIMIT_BEFORE)}と{yen(limitFor('from-2026-04'))}で違います）。3月21日〜4月20日のような締め日なら、2回に分けて入れます。
        </p>
      </div>

      <div className="field">
        <span className="field-label">出し方</span>
        <label style={{ display: 'block' }}>
          <input
            type="radio"
            name="method"
            checked={method === 'meal'}
            onChange={() => {
              setMethod('meal');
              trackToolUse(SLUG, 'select-meal');
            }}
          />{' '}
          食事を出している（弁当・社員食堂・食事券・提携店など）
        </label>
        <label style={{ display: 'block' }}>
          <input
            type="radio"
            name="method"
            checked={method === 'cash'}
            onChange={() => {
              setMethod('cash');
              trackToolUse(SLUG, 'select-cash');
            }}
          />{' '}
          お金で渡している
        </label>
      </div>

      {method === 'cash' ? (
        <>
          <div className="field">
            <span className="field-label">深夜勤務で夜食を出せない人への夜食代ですか</span>
            <label style={{ display: 'block' }}>
              <input
                type="radio"
                name="yashoku"
                checked={yashoku === 'yes'}
                onChange={() => setYashoku('yes')}
              />{' '}
              はい
            </label>
            <label style={{ display: 'block' }}>
              <input
                type="radio"
                name="yashoku"
                checked={yashoku === 'no'}
                onChange={() => setYashoku('no')}
              />{' '}
              いいえ
            </label>
          </div>

          {yashoku === 'yes' ? (
            <>
              <NumField
                id="yashoku-amount"
                label="勤務1回（1食）当たりの支給額"
                unit="円"
                value={yashokuAmount}
                onChange={setYashokuAmount}
              />
              <div className="field">
                <label style={{ display: 'block' }}>
                  <input
                    type="checkbox"
                    checked={lateNight}
                    onChange={(e) => setLateNight(e.target.checked)}
                  />{' '}
                  深夜勤務者である（正規の勤務時間の一部か全部が午後10時〜翌午前5時）
                </label>
                <label style={{ display: 'block' }}>
                  <input
                    type="checkbox"
                    checked={fixedPerShift}
                    onChange={(e) => setFixedPerShift(e.target.checked)}
                  />{' '}
                  通常の給与に加えて、勤務1回ごとの定額で渡している
                </label>
                <label style={{ display: 'block' }}>
                  <input
                    type="checkbox"
                    checked={hardToProvide}
                    onChange={(e) => setHardToProvide(e.target.checked)}
                  />{' '}
                  調理施設が無いなどで、夜食を現物で出すのが著しく困難
                </label>
              </div>

              <div className="panel">
                <div className="metric">
                  <span className="value">
                    {y.verdict === 'hikazei' ? '非課税です' : y.verdict === 'kazei' ? '課税です' : '判定を保留します'}
                  </span>
                </div>
                <p className="hint" style={{ marginBottom: 0 }}>
                  {y.conditionsMissing
                    ? '夜食代の例外は、深夜勤務者に・勤務1回ごとの定額で・夜食を現物で出すのが著しく困難な場合に限られます。外れているので、渡したお金の全額が給与になります。'
                    : y.verdict === 'hikazei'
                      ? `1回の支給額が${yen(y.limit)}以下なので、給与にしなくてかまいません。`
                      : y.verdict === 'kazei'
                        ? `8%で除いても10%で除いても${yen(y.limit)}を超えるので、渡したお金の全額が給与になります。`
                        : `消費税等相当額を除けば${yen(y.limit)}以下になりうる金額です（8%で除けば${yen(y.maxWith8)}まで、10%で除けば${yen(y.maxWith10)}まで）。どちらで除くかは通達に書かれていないため、税務署または税理士に確認してください。`}
                </p>
              </div>
            </>
          ) : (
            <div className="panel">
              <div className="metric">
                <span className="value">課税です</span>
                <span className="label">（渡したお金の全額が給与になります）</span>
              </div>
              <p className="hint" style={{ marginBottom: 0 }}>
                食事代をお金で渡すと、金額にかかわらず全額が給与です（社員が払った食事代の半分を口座に振り込む形も同じ）。
                ただし、<strong>会社と飲食店の契約で会社が飲食店に食事代を払う形</strong>や、
                利用先・1回の上限・釣銭なし・有効期間などの<strong>条件を満たす食券</strong>なら、食事の支給として扱える場合があります。
                その場合は「食事を出している」で判定してください（国税庁 質疑応答事例・在宅勤務FAQ 問12）。
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="hint" style={{ marginTop: 0 }}>
            1か月分の食事を種類ごとに入れます。<strong>残業・宿日直のときに無料で出した食事は入れません</strong>（給与にしなくてよいため）。
          </p>

          {rows.map((row, i) => (
            <div
              key={row.id}
              style={{
                position: 'relative',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '12px 14px 4px',
                marginBottom: 12,
                background: 'var(--surface-2)',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6, paddingRight: 48 }}>食事 {i + 1}</div>
              {rows.length > 1 && (
                <button
                  type="button"
                  aria-label={`食事 ${i + 1} を削除`}
                  onClick={() => setRows((rs) => rs.filter((x) => x.id !== row.id))}
                  style={{
                    ...buttonBase,
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 44,
                    height: 44,
                    fontSize: '1.2rem',
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              )}
              <fieldset className="field" style={{ border: 'none', padding: 0, margin: '0 0 10px' }}>
                <legend className="field-label" style={{ padding: 0 }}>
                  種類
                </legend>
                {KINDS.map((k) => (
                  <label key={k} style={{ display: 'block' }}>
                    <input
                      type="radio"
                      name={`kind-${row.id}`}
                      checked={row.kind === k}
                      onChange={() => updateRow(row.id, { kind: k })}
                    />{' '}
                    {MEAL_KIND_LABELS[k]}
                  </label>
                ))}
              </fieldset>
              <NumField
                id={`price-${row.id}`}
                label="1食の価額（税込み。社員食堂は材料費などの合計）"
                unit="円"
                value={row.price}
                onChange={(v) => updateRow(row.id, { price: v })}
              />
              <NumField
                id={`self-${row.id}`}
                label="1食の本人負担額"
                unit="円"
                value={row.selfPay}
                onChange={(v) => updateRow(row.id, { selfPay: v })}
              />
              <NumField
                id={`count-${row.id}`}
                label="その月の食数"
                unit="食"
                value={row.count}
                onChange={(v) => updateRow(row.id, { count: v })}
              />
            </div>
          ))}

          <button
            type="button"
            disabled={rows.length >= MAX_ROWS}
            onClick={() => {
              setRows((rs) => [...rs, { id: nextId, kind: 'standard', price: '', selfPay: '', count: '' }]);
              setNextId((n) => n + 1);
              trackToolUse(SLUG, 'add-row');
            }}
            style={{
              ...buttonBase,
              width: '100%',
              minHeight: 44,
              opacity: rows.length >= MAX_ROWS ? 0.5 : 1,
              cursor: rows.length >= MAX_ROWS ? 'not-allowed' : 'pointer',
            }}
          >
            ＋ 行を足す{rows.length >= MAX_ROWS && `（${MAX_ROWS}行まで）`}
          </button>

          <div className="panel">
            <div className="metric">
              {r.noCompanyBurden ? (
                <>
                  <span className="value">非課税です</span>
                  <span className="label">（会社の負担が無いので、給与になる額はありません）</span>
                </>
              ) : r.hikazei ? (
                <span className="value">非課税です</span>
              ) : (
                <>
                  <span className="value">課税です</span>
                  <span className="label">（会社負担の {yen(r.taxableAmount)} が給与になります）</span>
                </>
              )}
            </div>
            {!r.hikazei && (
              <p className="hint" style={{ marginBottom: 0 }}>
                限度額を超えた分だけではなく、<strong>会社負担の全額（税込み）</strong>が給与です。
              </p>
            )}
          </div>

          {!r.noCompanyBurden && (
            <div className="stack-wrap">
              <table className="stack-table">
                <thead>
                  <tr>
                    <th>条件</th>
                    <th>あなたの場合</th>
                    <th>判定</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td data-label="条件" style={{ textAlign: 'left' }}>
                      本人が半分以上を負担
                    </td>
                    <td data-label="あなたの場合">
                      本人 {yen(r.totalSelf)} ／ 価額 {yen(r.totalPrice)}（{ratio}%）
                    </td>
                    <td data-label="判定" style={{ textAlign: 'center', fontWeight: 700 }}>
                      {r.cond1 ? '○' : '×'}
                    </td>
                  </tr>
                  <tr>
                    <td data-label="条件" style={{ textAlign: 'left' }}>
                      会社負担が税抜き {yen(limit)} 以下
                    </td>
                    <td data-label="あなたの場合">
                      {yen(r.companyTaxExcl)}（税込み {yen(r.companyTaxIncl)}）
                    </td>
                    <td data-label="判定" style={{ textAlign: 'center', fontWeight: 700 }}>
                      {r.cond2 ? '○' : '×'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {!r.hikazei && (
            <div className="panel quiet">
              <strong>あといくらで非課税か</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: '1.2em' }}>
                {r.reduceToPass !== undefined && (
                  <li>
                    {r.mixedRates ? (
                      <>
                        <strong>8%と10%の割合を変えずに減らした場合</strong>、会社負担をあと {yen(r.reduceToPass)}（税込み）減らせば、会社負担の条件を満たします（割合を変えると額が変わります）。
                      </>
                    ) : (
                      <>会社負担をあと {yen(r.reduceToPass)}（税込み）減らせば、会社負担の条件を満たします。</>
                    )}
                  </li>
                )}
                {r.perMealCompanyMax !== undefined && (
                  <li>
                    いまの食数（{r.totalCount}食）のままなら、1食あたりの会社負担を {yen(r.perMealCompanyMax)}（税込み）以下にします。
                  </li>
                )}
                {r.selfPayPerMealNeeded !== undefined && r.selfShortfall !== undefined && (
                  <li>
                    本人負担が半分に {yen(r.selfShortfall)} 足りません。1食あたり平均 {yen(r.selfPayPerMealNeeded)} 以上を本人が負担すれば、半分以上の条件を満たします。
                  </li>
                )}
              </ul>
            </div>
          )}

          {period === 'from-2026-04' && r.hikazeiBeforeReform !== undefined && (
            <p className="hint">
              {!r.hikazei
                ? `改正前の限度額（月${yen(LIMIT_BEFORE)}）でも課税でした。`
                : r.hikazeiBeforeReform
                  ? `改正前の限度額（月${yen(LIMIT_BEFORE)}）でも非課税でした。`
                  : `改正前の限度額（月${yen(LIMIT_BEFORE)}）なら課税でした。令和8年4月の引き上げで非課税になったケースです。`}
            </p>
          )}
        </>
      )}

      <div className="note">
        所得税の判定です。<strong>社会保険料の「報酬」に入るかは別の基準</strong>
        （厚生労働大臣が都道府県ごとに定める食事の価額）で決まります。住民税は所得税の給与の額に連動します。
        給与が増えたときの手取りは<Link href="/tedori-keisan/">手取り計算機</Link>で確かめられます。
      </div>
    </div>
  );
}
