'use client';

import { useEffect, useState } from 'react';
import { ASSETS, assetById, usedLife } from '@/lib/genka-shokyaku';
import {
  KAISEI_AFTER_NENDO,
  KAISEI_BEFORE_NENDO,
  MAX_LIFE,
  MAX_ROWS,
  MAX_SCHEDULE_YEARS,
  MIN_LIFE,
  RATE_PERMIL_MAX,
  RATE_PERMIL_MIN,
  STANDARD_RATE_PERMIL,
  TREATMENT_LABEL,
  assess,
  compareKaisei,
  defaultNendo,
  filingDeadline,
  reiwa,
  schedule,
  selectableNendos,
  showCompareOpen,
  solarLikelyTaxable,
  type Assessment,
  type AssetRow,
  type SolarUse,
  type Treatment,
} from '@/lib/shokyaku-shisanzei';
import { weekdayLabel } from '@/lib/date-parts';
import { trackToolUse } from '@/lib/analytics';

const yen = (v: number) => `${v.toLocaleString('ja-JP')}円`;
const man = (v: number) => `${(v / 10_000).toLocaleString('ja-JP')}万円`;
const toInt = (v: string) => (v.trim() === '' ? NaN : Math.floor(Number(v)));

/** ビルド日で描いてからマウント後に開いた日で評価し直す（静的書き出しなので） */
const BUILD_TODAY = '2026-10-26';

interface RowInput {
  key: number;
  name: string;
  cost: string;
  /** 'YYYY-MM' */
  acquired: string;
  assetId: string;
  customYears: string;
  used: boolean;
  usedYears: string;
  treatment: Treatment;
}

let nextKey = 1;
const newRow = (acquired: string): RowInput => ({
  key: nextKey++,
  name: '',
  cost: '',
  acquired,
  assetId: 'pc',
  customYears: '',
  used: false,
  usedYears: '',
  treatment: 'normal',
});

/** 入力の行 → 耐用年数 */
function lifeOf(r: RowInput): number {
  const asset = assetById(r.assetId);
  const legal = r.assetId === 'other' ? toInt(r.customYears) : (asset?.years ?? NaN);
  if (!(legal >= MIN_LIFE && legal <= MAX_LIFE)) return NaN;
  if (!r.used) return legal;
  const elapsed = toInt(r.usedYears);
  return usedLife(legal, Number.isFinite(elapsed) ? elapsed * 12 : 0);
}

function toAssetRow(r: RowInput): AssetRow {
  const m = /^(\d{4})-(\d{2})$/.exec(r.acquired);
  return {
    name: r.name.trim() || undefined,
    cost: toInt(r.cost),
    acquired: { year: m ? Number(m[1]) : NaN, month: m ? Number(m[2]) : NaN },
    life: lifeOf(r),
    treatment: r.treatment,
  };
}

const deadlineText = (nendo: number) => {
  const d = filingDeadline(nendo);
  return `${d.year}年${d.month}月${d.day}日（${weekdayLabel(d)}）`;
};

/** 判定の1行 */
function verdict(a: Assessment): string {
  return a.taxable
    ? `課税標準 ${yen(a.taxBase)} → ${man(a.menzeiten)}以上なので ${yen(a.tax)} かかります`
    : `課税標準 ${yen(a.taxBase)} → ${man(a.menzeiten)}未満なので かかりません`;
}

export default function Calculator() {
  const [today, setToday] = useState(BUILD_TODAY);
  const [nendo, setNendo] = useState(() => defaultNendo(BUILD_TODAY));
  const [rows, setRows] = useState<RowInput[]>(() => [
    { ...newRow('2025-06'), name: 'パソコン', cost: '300000' },
  ]);
  const [rate, setRate] = useState(String(STANDARD_RATE_PERMIL / 10));
  const [solarKw, setSolarKw] = useState('');
  const [solarUse, setSolarUse] = useState<SolarUse>('jutaku');

  useEffect(() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const t = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    setToday(t);
    setNendo(defaultNendo(t));
  }, []);

  const nendos = selectableNendos(today);
  const ratePermil = Math.round(Number(rate) * 10);
  const rateOk = ratePermil >= RATE_PERMIL_MIN && ratePermil <= RATE_PERMIL_MAX;
  const permil = rateOk ? ratePermil : STANDARD_RATE_PERMIL;
  const assetRows = rows.map(toAssetRow);
  const a = assess(assetRows, nendo, permil);
  const cmp = compareKaisei(assetRows, permil);
  const track = () => trackToolUse('shokyaku-shisanzei', 'calculate');

  const update = (key: number, patch: Partial<RowInput>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const kw = Number(solarKw);

  return (
    <div className="card">
      <div style={{ display: 'grid', gap: 16 }}>
        <label>
          1. 年度
          <select value={nendo} onChange={(e) => setNendo(Number(e.target.value))} style={{ marginTop: 6 }}>
            {nendos.map((n) => (
              <option key={n} value={n}>
                令和{reiwa(n)}年度（{n}年1月1日）
              </option>
            ))}
          </select>
          <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
            申告期限は {deadlineText(nendo)} です。
          </span>
        </label>

        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>2. 資産（最大{MAX_ROWS}行）</div>
          <div style={{ display: 'grid', gap: 12 }}>
            {rows.map((r, i) => (
              <RowCard
                key={r.key}
                index={i}
                r={r}
                canRemove={rows.length > 1}
                onChange={(patch) => update(r.key, patch)}
                onRemove={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                onBlur={track}
              />
            ))}
          </div>
          {rows.length < MAX_ROWS && (
            <button
              type="button"
              onClick={() => setRows((rs) => [...rs, newRow(`${nendo - 1}-06`)])}
              style={{ marginTop: 10, minHeight: 44 }}
            >
              ＋ 資産を足す
            </button>
          )}
        </div>

        <label>
          3. 税率（%）
          <input
            type="number"
            inputMode="decimal"
            min={RATE_PERMIL_MIN / 10}
            max={RATE_PERMIL_MAX / 10}
            step={0.1}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
          <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
            標準税率は1.4%です（地方税法350条）。条例で高い税率にしている市町村だけ変えてください。
            {RATE_PERMIL_MIN / 10}〜{RATE_PERMIL_MAX / 10}%は打ち間違いを防ぐための入力の範囲で、法律上の上限ではありません。
            {!rateOk && <strong> 範囲外なので1.4%で計算しています。</strong>}
          </span>
        </label>

        <details>
          <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)', fontWeight: 700 }}>
            4. 太陽光発電の設備があるとき
          </summary>
          <div className="field-row" style={{ marginTop: 10 }}>
            <label>
              出力（kW）
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.1}
                value={solarKw}
                placeholder="例：5.5"
                onChange={(e) => setSolarKw(e.target.value)}
              />
            </label>
            <label>
              用途
              <select value={solarUse} onChange={(e) => setSolarUse(e.target.value as SolarUse)}>
                <option value="jutaku">住宅用（自宅の屋根など）</option>
                <option value="jigyo">事業用（売電事業・店舗・工場など）</option>
              </select>
            </label>
          </div>
          {solarKw.trim() !== '' && kw >= 0 && (
            <p className="hint">
              {solarLikelyTaxable(kw, solarUse)
                ? '10kW以上や事業用の設備は、償却資産として申告の対象になる場合が多いです。'
                : '住宅用で10kW未満の設備は、償却資産の対象にならない場合が多いです。'}
              扱いは市町村によって違うので、お住まいの市町村に確認してください。対象になるときは、資産の行に足してください。
            </p>
          )}
        </details>
      </div>

      <div className="panel" style={{ marginTop: 18 }} aria-live="polite">
        <div style={{ fontWeight: 700 }}>
          令和{reiwa(nendo)}年度：{verdict(a)}
        </div>
        {nendo === KAISEI_AFTER_NENDO && cmp.becomesExempt && (
          <div style={{ fontSize: 'var(--fs-sm)', marginTop: 4 }}>
            令和{reiwa(KAISEI_BEFORE_NENDO)}年度は{yen(cmp.before.tax)}でした（免税点が{man(cmp.before.menzeiten)}だったため）。
          </div>
        )}
        <p className="hint" style={{ margin: '6px 0 0' }}>
          評価額は最終的に市町村が決めます（増加償却・耐用年数の短縮・評価額の最低限度の扱いなど）。
          <strong>納税通知書の額が正しい額です。</strong>
        </p>
      </div>

      <dl className="kv">
        <div>
          <dt>評価額の合計</dt>
          <dd>{yen(a.totalValue)}</dd>
        </div>
        <div>
          <dt>課税標準（1,000円未満切捨て）</dt>
          <dd>{yen(a.taxBase)}</dd>
        </div>
        <div>
          <dt>免税点</dt>
          <dd>{man(a.menzeiten)}（ちょうどは課税）</dd>
        </div>
        <div>
          <dt>税額（{permil / 10}%・100円未満切捨て）</dt>
          <dd>{a.taxable ? yen(a.tax) : '0円（免税点未満）'}</dd>
        </div>
        <div>
          <dt>申告期限</dt>
          <dd>{deadlineText(nendo)}</dd>
        </div>
      </dl>
      {!a.taxable && (
        <p className="hint">免税点未満でも、市町村から申告を求められることが多いです（税がかからないだけです）。</p>
      )}

      <CompareBlock open={showCompareOpen(today)} before={cmp.before} after={cmp.after} />

      <h3 style={{ marginTop: 22 }}>資産ごとの評価額（令和{reiwa(nendo)}年度）</h3>
      {a.rows.map((x) => (
        <AssetResult key={rows[x.index].key} x={x} nendo={nendo} />
      ))}

      <ExcludedList a={a} />
    </div>
  );
}

function RowCard({
  index,
  r,
  canRemove,
  onChange,
  onRemove,
  onBlur,
}: {
  index: number;
  r: RowInput;
  canRemove: boolean;
  onChange: (patch: Partial<RowInput>) => void;
  onRemove: () => void;
  onBlur: () => void;
}) {
  return (
    <div className="panel quiet" style={{ display: 'grid', gap: 10, margin: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <strong>資産 {index + 1}</strong>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`資産 ${index + 1} を削除`}
            style={{ minWidth: 44, minHeight: 44 }}
          >
            削除
          </button>
        )}
      </div>
      <label>
        名前（任意）
        <input type="text" value={r.name} placeholder="例：業務用エアコン" onChange={(e) => onChange({ name: e.target.value })} />
      </label>
      <label>
        取得価額（円）
        <input
          type="number"
          inputMode="numeric"
          min={1}
          step={1000}
          value={r.cost}
          placeholder="例：300000"
          onChange={(e) => onChange({ cost: e.target.value })}
          onBlur={onBlur}
        />
      </label>
      <label>
        取得年月
        <input type="month" value={r.acquired} onChange={(e) => onChange({ acquired: e.target.value })} />
        <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
          1月に取得した物は、その年の取得（翌年度から対象）として計算します。1月1日に取得した物は市町村に確認してください
        </span>
      </label>
      <label>
        種類（耐用年数）
        <select value={r.assetId} onChange={(e) => onChange({ assetId: e.target.value })}>
          {ASSETS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
              {x.years > 0 ? `（${x.years}年）` : ''}
            </option>
          ))}
        </select>
      </label>
      {r.assetId === 'other' && (
        <label>
          耐用年数（年）
          <input
            type="number"
            inputMode="numeric"
            min={MIN_LIFE}
            max={MAX_LIFE}
            value={r.customYears}
            placeholder="例：15"
            onChange={(e) => onChange({ customYears: e.target.value })}
          />
        </label>
      )}
      <label style={{ fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={r.used}
          onChange={(e) => onChange({ used: e.target.checked })}
          style={{ width: 'auto' }}
        />
        中古で買った
      </label>
      {r.used && (
        <label>
          前の持ち主が使っていた年数
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={r.usedYears}
            placeholder="例：3"
            onChange={(e) => onChange({ usedYears: e.target.value })}
          />
          <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
            耐用年数は簡便法（法定耐用年数 − 経過年数 ＋ 経過年数 × 20%）で見積もります
          </span>
        </label>
      )}
      <label>
        経費の扱い（所得税・法人税）
        <select value={r.treatment} onChange={(e) => onChange({ treatment: e.target.value as Treatment })}>
          {(Object.keys(TREATMENT_LABEL) as Treatment[]).map((t) => (
            <option key={t} value={t}>
              {TREATMENT_LABEL[t]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function CompareBlock({ open, before, after }: { open: boolean; before: Assessment; after: Assessment }) {
  const body = (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginTop: 8 }}>
      {[before, after].map((x) => (
        <div key={x.nendo} className="panel quiet" style={{ margin: 0 }}>
          <div style={{ fontWeight: 700 }}>
            令和{reiwa(x.nendo)}年度（免税点 {man(x.menzeiten)}）
          </div>
          <div style={{ fontSize: 'var(--fs-sm)' }}>課税標準 {yen(x.taxBase)}</div>
          <div style={{ fontSize: 'var(--fs-sm)' }}>
            {x.taxable ? <strong>{yen(x.tax)}かかります</strong> : <strong>かかりません</strong>}
          </div>
        </div>
      ))}
    </div>
  );
  const title = `改正前（令和${reiwa(before.nendo)}年度）との比較`;
  if (open) {
    return (
      <>
        <h3 style={{ marginTop: 22 }}>{title}</h3>
        {body}
        <p className="hint">同じ資産を、それぞれの年度の1月1日時点の評価額で並べています（評価額も1年分下がります）。</p>
      </>
    );
  }
  return (
    <details style={{ marginTop: 16 }}>
      <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)', fontWeight: 700 }}>{title}</summary>
      {body}
    </details>
  );
}

function AssetResult({ x, nendo }: { x: Assessment['rows'][number]; nendo: number }) {
  const label = x.row.name ?? `資産 ${x.index + 1}`;
  if (x.status === 'invalid') {
    return (
      <p className="hint">
        {label}：取得価額・取得年月・耐用年数（{MIN_LIFE}〜{MAX_LIFE}年）を入れてください。
      </p>
    );
  }
  if (x.status === 'excluded') {
    return <p className="hint">{label}：{TREATMENT_LABEL[x.row.treatment]}なので申告から外れます。</p>;
  }
  const rows = schedule(x.row.cost, x.row.acquired, x.row.life, MAX_SCHEDULE_YEARS);
  return (
    <div className="panel quiet">
      <div style={{ fontWeight: 700 }}>
        {label}：{x.status === 'notYet' ? `令和${reiwa(nendo)}年度はまだ対象外` : yen(x.value)}
      </div>
      <div className="hint" style={{ margin: 0 }}>
        取得価額 {yen(x.row.cost)}・耐用年数 {x.row.life}年・{x.row.acquired.year}年{x.row.acquired.month}月取得
      </div>
      {x.treatmentMismatch && (
        <p className="hint" style={{ margin: '4px 0 0' }}>
          取得価額が「{TREATMENT_LABEL[x.row.treatment]}」の上限を超えているので、申告に載る資産として計算しています。
        </p>
      )}
      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)' }}>年ごとの評価額（最大{MAX_SCHEDULE_YEARS}年）</summary>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>年度</th>
                <th>評価額</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.nendo}>
                  <td>
                    令和{reiwa(s.nendo)}年度{s.nendo === nendo ? '（選択中）' : ''}
                  </td>
                  <td>
                    {yen(s.value)}
                    {s.atFloor ? '（5%の下限）' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function ExcludedList({ a }: { a: Assessment }) {
  const out = a.rows.filter((x) => x.status === 'excluded');
  const tokurei = a.rows.filter((x) => x.row.treatment === 'tokurei' && x.status !== 'invalid' && !x.treatmentMismatch);
  if (out.length === 0 && tokurei.length === 0) return null;
  const name = (x: Assessment['rows'][number]) => x.row.name ?? `資産 ${x.index + 1}`;
  return (
    <details style={{ marginTop: 16 }}>
      <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)', fontWeight: 700 }}>
        申告から外れる資産・外れない資産
      </summary>
      {out.length > 0 && (
        <>
          <p style={{ fontSize: 'var(--fs-sm)', marginBottom: 4 }}>
            <strong>外れる</strong>（10万円未満で全額経費・一括償却。地方税法施行令49条）
          </p>
          <ul style={{ fontSize: 'var(--fs-sm)', marginTop: 0 }}>
            {out.map((x) => (
              <li key={x.index}>
                {name(x)}（{yen(x.row.cost)}・{TREATMENT_LABEL[x.row.treatment]}）
              </li>
            ))}
          </ul>
        </>
      )}
      {tokurei.length > 0 && (
        <>
          <p style={{ fontSize: 'var(--fs-sm)', marginBottom: 4 }}>
            <strong>経費にしたが外れない</strong>（40万円未満の特例。申告が要ります）
          </p>
          <ul style={{ fontSize: 'var(--fs-sm)', marginTop: 0 }}>
            {tokurei.map((x) => (
              <li key={x.index}>
                {name(x)}（{yen(x.row.cost)}）
              </li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}
