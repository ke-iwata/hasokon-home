'use client';

import { useMemo, useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import {
  DEFAULT_ROUNDING,
  DEFAULT_TAX_MODE,
  ROUNDINGS,
  TAX_RATES,
  applyDiscount,
  formatPercent,
  formatYen,
  percentChange,
  percentOf,
  percentRatio,
  reverseDiscount,
  roundBy,
  type Rounding,
  type TaxMode,
  type TaxRateId,
} from '@/lib/waribiki-percent';

/**
 * 割引・パーセント計算のUI。
 *
 * 仕様（docs/features/waribiki-percent-keisan.md）どおり、タブではなく
 * 縦に3モードを並べる。検索から来た人が自分の用がどのモードか迷わないため。
 *
 * 端数処理と税の扱いは3モード共通の設定として先頭に置き、
 * すべての結果パネルで同じ丸め方が効いているのが目で分かるようにする。
 */

/** 割引率のよく使うプリセット（チップ） */
const RATE_CHIPS: number[] = [5, 10, 20, 30, 50, 70];

/** パーセント計算モードのサブモード */
type PercentSubMode = 'of' | 'ratio' | 'change';

const PERCENT_SUB_MODES: { id: PercentSubMode; label: string }[] = [
  { id: 'of', label: 'AのB%はいくら？' },
  { id: 'ratio', label: 'AはBの何%？' },
  { id: 'change', label: 'AがBに増えた／減った変化率は？' },
];

/** 数値入力の解析。空欄・NaN は 0 として扱う（表示上は 0 が返る） */
function num(str: string): number {
  const v = Number.parseFloat(str);
  return Number.isFinite(v) ? v : 0;
}

/** 数値入力の解析（0 に落とさない版）。空欄・NaN は NaN を返す */
function numOrNaN(str: string): number {
  const v = Number.parseFloat(str);
  return Number.isFinite(v) ? v : Number.NaN;
}

/** 共通ラジオ */
function Radios<T extends string>({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: T;
  onChange: (next: T) => void;
  options: readonly { id: T; label: string }[];
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px' }}>
      {options.map((opt) => (
        <label key={opt.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input
            type="radio"
            name={name}
            value={opt.id}
            checked={value === opt.id}
            onChange={() => onChange(opt.id)}
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

export default function Calculator() {
  /* 共通の設定 */
  const [rounding, setRounding] = useState<Rounding>(DEFAULT_ROUNDING);
  const [taxMode, setTaxMode] = useState<TaxMode>(DEFAULT_TAX_MODE);
  const [taxRateId, setTaxRateId] = useState<TaxRateId>('standard');

  /* モード1: 割引後の値段 */
  const [priceStr, setPriceStr] = useState('3980');
  const [rate1Str, setRate1Str] = useState('30');
  const [useSecondDiscount, setUseSecondDiscount] = useState(false);
  const [rate2Str, setRate2Str] = useState('20');

  /* モード2: 割引率の逆算 */
  const [originalStr, setOriginalStr] = useState('3980');
  const [saleStr, setSaleStr] = useState('2786');

  /* モード3: パーセント計算 */
  const [subMode, setSubMode] = useState<PercentSubMode>('of');
  const [pA, setPA] = useState('1200');
  const [pB, setPB] = useState('8');

  const rates = useMemo(() => {
    const r1 = num(rate1Str);
    if (!useSecondDiscount) return [r1];
    return [r1, num(rate2Str)];
  }, [rate1Str, useSecondDiscount, rate2Str]);

  const discountResult = useMemo(
    () =>
      applyDiscount({
        price: num(priceStr),
        rates,
        rounding,
        taxMode,
        taxRateId,
      }),
    [priceStr, rates, rounding, taxMode, taxRateId],
  );

  const reverseResult = useMemo(
    () =>
      reverseDiscount({
        original: num(originalStr),
        sale: num(saleStr),
      }),
    [originalStr, saleStr],
  );

  const percentResult = useMemo(() => {
    const a = numOrNaN(pA);
    const b = numOrNaN(pB);
    if (subMode === 'of') return percentOf(a, b);
    if (subMode === 'ratio') return percentRatio(a, b);
    return percentChange(a, b);
  }, [subMode, pA, pB]);

  const track = (action: string) => trackToolUse('waribiki-percent', action);

  /* 割引率チップの押下 */
  const setRateFromChip = (rate: number) => {
    setRate1Str(String(rate));
    track('rate-chip');
  };

  const percentSubMode = PERCENT_SUB_MODES.find((m) => m.id === subMode) ?? PERCENT_SUB_MODES[0];

  return (
    <>
      {/* 目次（3モードへのアンカー） */}
      <nav
        className="card"
        aria-label="このページの計算モード"
        style={{ padding: '12px 16px', marginBottom: 16 }}
      >
        <p style={{ margin: '0 0 6px', fontWeight: 700 }}>用途で選ぶ（クリックで移動）</p>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
          <li>
            <a href="#mode-discount">① 割引後の値段（何%オフでいくら？）</a>
          </li>
          <li>
            <a href="#mode-reverse">② 割引率の逆算（何%オフだった？）</a>
          </li>
          <li>
            <a href="#mode-percent">③ パーセント計算（%と割合）</a>
          </li>
        </ul>
      </nav>

      {/* 共通の設定（丸め方・税の扱い） */}
      <div className="card">
        <p style={{ margin: '0 0 8px', fontWeight: 700 }}>共通の設定</p>
        <div className="field">
          <span className="field-label">端数の処理（1円未満）</span>
          <Radios
            name="rounding"
            value={rounding}
            onChange={(next) => {
              setRounding(next);
              track('rounding');
            }}
            options={ROUNDINGS}
          />
          <p className="hint" style={{ marginTop: 6 }}>
            店舗ごとに実運用が違います。「レジと1円合わない」ときは切り上げ・切り捨てを切り替えてみてください。
          </p>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">入力する値段は</span>
          <Radios
            name="taxMode"
            value={taxMode}
            onChange={(next) => {
              setTaxMode(next);
              track('tax-mode');
            }}
            options={[
              { id: 'inclusive', label: '税込（総額表示のまま）' },
              { id: 'exclusive', label: '税抜（税別で入力）' },
            ]}
          />
          {taxMode === 'exclusive' && (
            <div style={{ marginTop: 8 }}>
              <label>
                消費税率{' '}
                <select
                  value={taxRateId}
                  onChange={(e) => {
                    setTaxRateId(e.target.value as TaxRateId);
                    track('tax-rate');
                  }}
                >
                  {TAX_RATES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="hint" style={{ marginTop: 6 }}>
                <strong>軽減税率（8%）は飲食料品・定期購読の新聞など対象品目が限られます。</strong>
                このツールは品目の判定はしないので、対象かどうかは領収書やレシートで確認してください。
              </p>
            </div>
          )}
          {taxMode === 'inclusive' && (
            <p className="hint" style={{ marginTop: 6 }}>
              2021年の総額表示義務以降、値札は税込が原則です。税込のまま計算した割引後の値段が、そのまま支払額になります。
            </p>
          )}
        </div>
      </div>

      {/* ① 割引後の値段 */}
      <section id="mode-discount" style={{ scrollMarginTop: 12 }}>
        <h2 style={{ marginTop: 22 }}>① 割引後の値段（何%オフでいくら？）</h2>
        <div className="card">
          <div className="field">
            <label>
              元の値段（円）
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={priceStr}
                onChange={(e) => setPriceStr(e.target.value)}
                onBlur={() => track('discount')}
              />
            </label>
          </div>
          <div className="field">
            <label>
              割引率（%）
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step="any"
                value={rate1Str}
                onChange={(e) => setRate1Str(e.target.value)}
                onBlur={() => track('discount')}
              />
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {RATE_CHIPS.map((r) => (
                <button
                  key={r}
                  type="button"
                  className="chip"
                  style={{ cursor: 'pointer', padding: '4px 12px' }}
                  onClick={() => setRateFromChip(r)}
                >
                  {r}%オフ
                </button>
              ))}
            </div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={useSecondDiscount}
                onChange={(e) => {
                  setUseSecondDiscount(e.target.checked);
                  track('stacked-discount');
                }}
              />
              さらに重ねて割引を掛ける（二重割引）
            </label>
            {useSecondDiscount && (
              <div style={{ marginTop: 8 }}>
                <label>
                  2段目の割引率（%）
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step="any"
                    value={rate2Str}
                    onChange={(e) => setRate2Str(e.target.value)}
                    onBlur={() => track('discount')}
                  />
                </label>
                <p className="hint" style={{ marginTop: 6 }}>
                  「30%オフからさらに20%オフ」は<strong>合計50%オフではありません</strong>。残りどうしを掛けて計算します（下に合計割引率が出ます）。
                </p>
              </div>
            )}
          </div>

          {discountResult === null ? (
            <p className="hint" style={{ marginTop: 16 }}>
              値段は0以上、割引率は0〜100%で入力してください。
            </p>
          ) : (
            <>
              <div className="panel">
                <div className="metric">
                  <span className="label">割引後の値段は</span>
                  <span className="value">
                    {formatYen(
                      discountResult.taxMode === 'exclusive'
                        ? (discountResult.discountedIncludingTax as number)
                        : discountResult.discounted,
                    ).replace('円', '')}
                  </span>
                  <span className="unit">円</span>
                </div>
                <p className="hint" style={{ marginTop: 4 }}>
                  値引き額 {formatYen(discountResult.saved)}／合計割引率{' '}
                  {formatPercent(discountResult.effectiveRate)}
                </p>
              </div>

              <div className="panel quiet">
                <dl className="kv">
                  <div>
                    <dt>元の値段</dt>
                    <dd>{formatYen(discountResult.price)}</dd>
                  </div>
                  <div>
                    <dt>合計割引率</dt>
                    <dd>{formatPercent(discountResult.effectiveRate)}</dd>
                  </div>
                  {discountResult.taxMode === 'exclusive' ? (
                    <>
                      <div>
                        <dt>割引後（税抜、{ROUNDINGS.find((r) => r.id === rounding)?.short}）</dt>
                        <dd>{formatYen(discountResult.discounted)}</dd>
                      </div>
                      <div>
                        <dt>
                          消費税（
                          {TAX_RATES.find((r) => r.id === (discountResult.taxRateId ?? 'standard'))?.percentLabel}）
                        </dt>
                        <dd>{formatYen(discountResult.tax as number)}</dd>
                      </div>
                      <div>
                        <dt>割引後（税込、{ROUNDINGS.find((r) => r.id === rounding)?.short}）</dt>
                        <dd>
                          <strong>{formatYen(discountResult.discountedIncludingTax as number)}</strong>
                        </dd>
                      </div>
                    </>
                  ) : (
                    <div>
                      <dt>割引後の値段（{ROUNDINGS.find((r) => r.id === rounding)?.short}）</dt>
                      <dd>
                        <strong>{formatYen(discountResult.discounted)}</strong>
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>値引き額</dt>
                    <dd>{formatYen(discountResult.saved)}</dd>
                  </div>
                </dl>
                <p className="hint" style={{ marginTop: 8 }}>
                  {discountResult.taxMode === 'exclusive'
                    ? '税抜の割引後・税込額の2段階それぞれに、選んだ丸め方を1回ずつ適用しています。'
                    : '入力の値段が税込なので、割引後の値段がそのまま支払額です。'}
                </p>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ② 割引率の逆算 */}
      <section id="mode-reverse" style={{ scrollMarginTop: 12 }}>
        <h2 style={{ marginTop: 22 }}>② 割引率の逆算（何%オフだった？）</h2>
        <div className="card">
          <div className="field-row">
            <label className="field" style={{ marginBottom: 0 }}>
              元の値段（円）
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={originalStr}
                onChange={(e) => setOriginalStr(e.target.value)}
                onBlur={() => track('reverse')}
              />
            </label>
            <label className="field" style={{ marginBottom: 0 }}>
              売値（円）
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={saleStr}
                onChange={(e) => setSaleStr(e.target.value)}
                onBlur={() => track('reverse')}
              />
            </label>
          </div>

          {reverseResult === null ? (
            <p className="hint" style={{ marginTop: 16 }}>
              元の値段は0より大きい値を入れてください。
            </p>
          ) : (
            <div className="panel" style={{ marginTop: 14 }}>
              <div className="metric">
                <span className="label">
                  {reverseResult.rate >= 0 ? '割引率は' : '値上げ率は'}
                </span>
                <span className="value">{formatPercent(Math.abs(reverseResult.rate))}</span>
                <span className="unit">
                  {reverseResult.rate >= 0 ? 'オフ' : 'アップ'}
                </span>
              </div>
              <p className="hint" style={{ marginTop: 4 }}>
                {reverseResult.rate >= 0
                  ? `値引き額 ${formatYen(reverseResult.saved)}`
                  : `差額 ${formatYen(-reverseResult.saved)}（売値のほうが高い）`}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ③ パーセント計算 */}
      <section id="mode-percent" style={{ scrollMarginTop: 12 }}>
        <h2 style={{ marginTop: 22 }}>③ パーセント計算（%と割合）</h2>
        <div className="card">
          <div className="field">
            <span className="field-label">計算の種類</span>
            <Radios
              name="subMode"
              value={subMode}
              onChange={(next) => {
                setSubMode(next);
                track('percent-submode');
              }}
              options={PERCENT_SUB_MODES}
            />
          </div>
          <div className="field-row">
            <label className="field" style={{ marginBottom: 0 }}>
              A
              <input
                type="number"
                inputMode="decimal"
                step="any"
                value={pA}
                onChange={(e) => setPA(e.target.value)}
                onBlur={() => track('percent')}
              />
            </label>
            <label className="field" style={{ marginBottom: 0 }}>
              B
              <input
                type="number"
                inputMode="decimal"
                step="any"
                value={pB}
                onChange={(e) => setPB(e.target.value)}
                onBlur={() => track('percent')}
              />
            </label>
          </div>

          {percentResult === null ? (
            <p className="hint" style={{ marginTop: 16 }}>
              {subMode === 'of'
                ? 'AとBに数値を入れてください。'
                : subMode === 'ratio'
                  ? 'Bに0以外の数値を入れてください。'
                  : 'Aに0以外の数値を入れてください。'}
            </p>
          ) : (
            <div className="panel" style={{ marginTop: 14 }}>
              <div className="metric">
                <span className="label">{percentSubMode.label}</span>
                <span className="value">
                  {subMode === 'of'
                    ? roundBy(percentResult, rounding).toLocaleString('ja-JP')
                    : formatPercent(percentResult).replace('%', '')}
                </span>
                <span className="unit">{subMode === 'of' ? '' : '%'}</span>
              </div>
              <p className="hint" style={{ marginTop: 4 }}>
                {subMode === 'of'
                  ? `A × B ÷ 100（端数は${ROUNDINGS.find((r) => r.id === rounding)?.label}で整数に）`
                  : subMode === 'ratio'
                    ? 'A ÷ B × 100'
                    : '(B − A) ÷ A × 100'}
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
