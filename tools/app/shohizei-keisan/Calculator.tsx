'use client';

import { useMemo, useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import {
  DEFAULT_FOOD_BUDGET,
  DEFAULT_PRICE_MODE,
  DEFAULT_TAX_ROUNDING,
  FOOD_BUDGET_PRESETS,
  FOOD_RATE_2027,
  FOOD_RELIEF_MONTHS,
  FOOD_RELIEF_RATIO,
  LOOKUP_TABLE,
  RELIEF_LOOKUP_TABLE,
  ROUNDINGS,
  SOURCE_NTA_QA,
  compareRates,
  foodRateBadge,
  foodRelief,
  formatDate,
  formatPercent,
  formatYen,
  isFoodRatePending,
  isFoodRateShown,
  taxBreakdown,
  taxRates,
  type PriceMode,
  type Rounding,
  type TaxRateId,
} from '@/lib/shohizei';
import {
  ITEMS_CHECKED_AT,
  ITEM_CATEGORY_LABEL,
  ITEM_COUNT,
  ITEM_RATE_LABEL,
  QA_REVISION,
  RATE_2027_LABEL,
  itemGroups,
  rate2027For,
  searchItems,
  type ShohizeiItem,
} from '@/lib/shohizei-items';

const RATES = taxRates();
const PENDING = isFoodRatePending();
const SHOW_FOOD_RATE = isFoodRateShown();
const BADGE = foodRateBadge();

/** 1%だけに付ける「成立前」の印 */
function PendingMark() {
  if (!PENDING) return null;
  return <span className="chip">予定</span>;
}

export default function Calculator() {
  /* ---- A. 税込 ⇔ 税抜 ---- */
  const [amount, setAmount] = useState('1000');
  const [mode, setMode] = useState<PriceMode>(DEFAULT_PRICE_MODE);
  const [rateId, setRateId] = useState<TaxRateId>('standard');
  const [rounding, setRounding] = useState<Rounding>(DEFAULT_TAX_ROUNDING);

  const parsedAmount = Number(amount.replace(/[,\s]/g, ''));
  const result = taxBreakdown({ amount: parsedAmount, mode, rateId, rounding });
  const comparison = result === null ? [] : compareRates(parsedAmount, mode, rounding);

  /* ---- B. 軽減税率チェッカー ---- */
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ShohizeiItem | null>(null);
  const groups = useMemo(() => itemGroups(searchItems(query)), [query]);
  const hitCount = groups.reduce((n, g) => n + g.items.length, 0);

  /* ---- C. 食料品1%の軽減額 ---- */
  const [food, setFood] = useState(String(DEFAULT_FOOD_BUDGET));
  const parsedFood = Number(food.replace(/[,\s]/g, ''));
  const relief = foodRelief(parsedFood);

  const selectItem = (item: ShohizeiItem) => {
    setSelected(item);
    trackToolUse('shohizei-keisan', 'check-item');
  };

  return (
    <>
      {/* ================= A. 税込 ⇔ 税抜 ================= */}
      <div className="card">
        <h2 style={{ fontSize: '1.1rem', marginTop: 0 }}>税込・税抜を計算する</h2>

        <div className="field">
          <label htmlFor="amount">金額（円）</label>
          <input
            id="amount"
            type="text"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1000"
          />
        </div>

        <div className="field">
          <span className="field-label">入れた金額は</span>
          <div className="field-row">
            <button type="button" onClick={() => setMode('inclusive')} aria-pressed={mode === 'inclusive'}>
              税込
            </button>
            <button
              type="button"
              onClick={() => setMode('exclusive')}
              aria-pressed={mode === 'exclusive'}
            >
              税抜
            </button>
          </div>
        </div>

        <div className="field">
          <span className="field-label">税率</span>
          <div className="field-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {RATES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRateId(r.id)}
                aria-pressed={rateId === r.id}
                style={{ fontWeight: rateId === r.id ? 700 : 400 }}
              >
                {r.percentLabel}
                {r.pending && '（予定）'}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">1円未満の端数</span>
          <div className="field-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {ROUNDINGS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRounding(r.id)}
                aria-pressed={rounding === r.id}
                style={{ fontWeight: rounding === r.id ? 700 : 400 }}
              >
                {r.label}
                {r.id === DEFAULT_TAX_ROUNDING && '（既定）'}
              </button>
            ))}
          </div>
        </div>

        {result === null ? (
          <p className="hint">金額を入れてください（0以上の数）。</p>
        ) : (
          <>
            <div className="panel">
              <dl className="kv">
                <div>
                  <dt>税抜（本体）</dt>
                  <dd>{formatYen(result.excluding)}</dd>
                </div>
                <div>
                  <dt>消費税</dt>
                  <dd>{formatYen(result.tax)}</dd>
                </div>
                <div>
                  <dt>税込</dt>
                  <dd>
                    <strong>{formatYen(result.including)}</strong>
                  </dd>
                </div>
              </dl>
            </div>

            <div className="panel quiet">
              <p style={{ margin: '0 0 6px', fontWeight: 700 }}>3つの税率で比べる</p>
              <table>
                <thead>
                  <tr>
                    <th>税率</th>
                    <th>税抜</th>
                    <th>消費税</th>
                    <th>税込</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((row) => {
                    const option = RATES.find((r) => r.id === row.rateId)!;
                    return (
                      <tr key={row.rateId}>
                        <th scope="row">
                          {option.percentLabel}
                          {option.pending && <PendingMark />}
                        </th>
                        <td>{formatYen(row.excluding)}</td>
                        <td>{formatYen(row.tax)}</td>
                        <td>
                          <strong>{formatYen(row.including)}</strong>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="note">
          <strong>1円未満の端数は店ごとに違います。</strong>
          消費税額の1円未満をどう処理するかは事業者の任意なので、レシートの金額とここの答えが1円ずれることがあります。実務でもっとも多い切り捨てを既定にしています。
        </div>

        <h3 style={{ fontSize: '1rem', marginTop: 28 }}>税抜価格から税込額の早見表</h3>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>税抜</th>
                {RATES.map((r) => (
                  <th key={r.id}>
                    {r.percentLabel}
                    {r.pending && <PendingMark />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LOOKUP_TABLE.map((row) => (
                <tr key={row.excluding}>
                  <th scope="row">{row.excluding.toLocaleString('ja-JP')}円</th>
                  {row.including.map((cell) => (
                    <td key={cell.rateId}>{cell.including.toLocaleString('ja-JP')}円</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">端数は切り捨てで計算しています。</p>
      </div>

      {/* ================= B. 軽減税率チェッカー ================= */}
      <div className="card" style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: '1.1rem', marginTop: 0 }}>これは8%か10%か（軽減税率チェッカー）</h2>
        <p className="hint">
          国税庁のQ&A（個別事例編）に載っている{ITEM_COUNT}項目です。タップすると税率と理由が出ます。
        </p>

        <div className="field">
          <label htmlFor="item-search">品目をしぼり込む（任意）</label>
          <input
            id="item-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="みりん、イートイン、ペットフード …"
          />
        </div>

        {selected !== null && (
          <div className="panel">
            <div className="metric">
              <span className="label">{selected.label}</span>
              <span className="value" style={{ fontSize: 'var(--fs-lg)' }}>
                {ITEM_RATE_LABEL[selected.rate]}
              </span>
            </div>
            <p className="hint" style={{ marginTop: 4 }}>{selected.reason}</p>
            {selected.note && (
              <p className="hint" style={{ marginTop: 4 }}>
                <strong>注意</strong>：{selected.note}
              </p>
            )}
            {SHOW_FOOD_RATE && (
              <p className="hint" style={{ marginTop: 4 }}>
                2027年4月以降：
                <strong>{RATE_2027_LABEL[rate2027For(selected, SHOW_FOOD_RATE)!]}</strong>
                {rate2027For(selected, SHOW_FOOD_RATE) === 'food-1percent' && <PendingMark />}
                {rate2027For(selected, SHOW_FOOD_RATE) === 'newspaper-unconfirmed' &&
                  '（新聞の扱いは法案の条文で確認できていないため、税率を載せていません）'}
              </p>
            )}
            <p className="hint" style={{ marginTop: 4 }}>
              出典：
              <a href={SOURCE_NTA_QA.url} target="_blank" rel="noopener noreferrer">
                国税庁Q&A（個別事例編）問{selected.qa}
              </a>
            </p>
          </div>
        )}

        {hitCount === 0 ? (
          <p className="hint">
            あてはまる品目が見つかりませんでした。しぼり込みの言葉を消すか、別の言い方でお試しください。ここに無いものは
            <a href={SOURCE_NTA_QA.url} target="_blank" rel="noopener noreferrer">
              国税庁のQ&A
            </a>
            でご確認ください（個別の事例は税務署の判断になります）。
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.category} style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: '0.95rem', margin: '0 0 6px' }}>
                {ITEM_CATEGORY_LABEL[group.category]}
              </h3>
              <div className="field-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectItem(item)}
                    aria-pressed={selected?.id === item.id}
                    style={{
                      fontSize: 'var(--fs-sm)',
                      fontWeight: selected?.id === item.id ? 700 : 400,
                    }}
                  >
                    {item.label}
                    <span className="chip">{ITEM_RATE_LABEL[item.rate]}</span>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}

        <div className="note">
          <strong>判定を断言するものではありません。</strong>
          ここに挙げているのは国税庁のQ&A（個別事例編・{QA_REVISION}）に載っている事例を
          {formatDate(ITEMS_CHECKED_AT)}に突き合わせたものです。同じ品目でも契約や提供のしかたで結論が変わるため、個別の判断は税務署にご確認ください。
        </div>
      </div>

      {/* ================= C. 食料品1%でいくら安くなるか ================= */}
      {SHOW_FOOD_RATE && (
        <div className="card" style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: '1.1rem', marginTop: 0 }}>
            食料品1%で<strong>最大で</strong>いくら安くなるか（2027年4月〜）
            <PendingMark />
          </h2>
          {BADGE && <div className="note">{BADGE}</div>}

          <div className="field">
            <label htmlFor="food-budget">1か月の食費（外食・酒類を除く、税込・円）</label>
            <input
              id="food-budget"
              type="text"
              inputMode="numeric"
              value={food}
              onChange={(e) => setFood(e.target.value)}
              placeholder="74548"
            />
          </div>

          <div className="field">
            <span className="field-label">目安を入れる</span>
            <div className="field-row" style={{ flexWrap: 'wrap', gap: 8 }}>
              {FOOD_BUDGET_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setFood(String(preset.monthly))}
                  aria-pressed={parsedFood === preset.monthly}
                  style={{ fontSize: 'var(--fs-sm)' }}
                >
                  {preset.label}（{preset.monthly.toLocaleString('ja-JP')}円）
                </button>
              ))}
            </div>
          </div>

          {relief === null ? (
            <p className="hint">1か月の食費を入れてください（0以上の数）。</p>
          ) : (
            <div className="panel">
              <dl className="kv">
                <div>
                  <dt>1か月で最大</dt>
                  <dd>
                    <strong>{formatYen(relief.monthly)}</strong>
                  </dd>
                </div>
                <div>
                  <dt>1年で最大</dt>
                  <dd>{formatYen(relief.yearly)}</dd>
                </div>
                <div>
                  <dt>2年間（2027年4月〜2029年3月）で最大</dt>
                  <dd>{formatYen(relief.total)}</dd>
                </div>
              </dl>
              <p className="hint" style={{ marginTop: 4 }}>
                税込の食費に{formatPercent(FOOD_RELIEF_RATIO)}を掛けた額です（1 − 1.01 ÷
                1.08）。{FOOD_RELIEF_MONTHS}か月分を通算しています。
              </p>
            </div>
          )}

          <div className="note">
            <strong>「最大で」の額です。</strong>
            いまの税込8%の価格が、そのまま税込1%の価格に置き換わるとした場合の上限の目安です。値下げが遅れたり、原材料費の改定と重なって価格が据え置かれたりすると、実際に下がる額はこれより小さくなります。
            <br />
            また、この額に<strong>給付付き税額控除の給付は含みません</strong>
            。給付の額や条件は公表されていないため、このツールでは計算していません。
          </div>

          <h3 style={{ fontSize: '1rem', marginTop: 28 }}>食費別の軽減額の早見表</h3>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>1か月の食費（税込）</th>
                  <th>1か月</th>
                  <th>1年</th>
                  <th>2年間</th>
                </tr>
              </thead>
              <tbody>
                {RELIEF_LOOKUP_TABLE.map((row) => (
                  <tr key={row.monthlyFood}>
                    <th scope="row">{row.monthlyFood.toLocaleString('ja-JP')}円</th>
                    <td>{formatYen(row.relief.monthly)}</td>
                    <td>{formatYen(row.relief.yearly)}</td>
                    <td>
                      <strong>{formatYen(row.relief.total)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">
            期間は{formatDate(FOOD_RATE_2027.from)}から{formatDate(FOOD_RATE_2027.to)}までの2年間
            {PENDING && '（予定）'}です。
          </p>
        </div>
      )}
    </>
  );
}
