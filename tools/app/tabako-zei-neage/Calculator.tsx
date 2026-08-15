'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { trackToolUse } from '@/lib/analytics';
import {
  DATA_CHECKED_AT,
  PRODUCT_LABEL,
  estimateSpending,
  formatDate,
  formatYen,
  formatYenDecimal,
  heatedAlignment,
  increases,
  phaseAt,
  phaseIndexAt,
  priceTimeline,
  quitSavings,
  taxPerStick,
  type ProductKind,
} from '@/lib/tabako-zei';

/** 初期値。代表的な紙巻たばこ1箱（20本入り・580円）を1日1箱吸う想定 */
const DEFAULT_PRICE = '580';
const DEFAULT_STICKS_PER_DAY = '20';
const DEFAULT_STICKS_PER_PACK = '20';

/** 入力欄の数値を読む。空欄・不正な値は undefined にして「まだ入力されていない」と区別する */
function num(value: string): number | undefined {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export default function Calculator() {
  const [kind, setKind] = useState<ProductKind>('paper');
  const [price, setPrice] = useState(DEFAULT_PRICE);
  const [perDay, setPerDay] = useState(DEFAULT_STICKS_PER_DAY);
  const [perPack, setPerPack] = useState(DEFAULT_STICKS_PER_PACK);

  /**
   * 判定の基準日。
   * 静的書き出しなのでビルド時刻で描画してから、マウント後に「開いた日」へ差し替える
   * （サーバ描画とハイドレーションの食い違いを避けるため。lib/nenshu-kabe.ts と同じ作法）。
   */
  const [asOf, setAsOf] = useState<Date>(() => new Date());
  useEffect(() => setAsOf(new Date()), []);

  const priceYen = num(price);
  const sticksPerDay = num(perDay);
  // 1箱の本数は空欄・0だと按分できないので、既定の20本に戻して計算を続ける
  const perPackInput = num(perPack);
  const sticksPerPack = perPackInput !== undefined && perPackInput > 0 ? perPackInput : 20;

  const baseIndex = phaseIndexAt(asOf);
  const currentPhase = phaseAt(asOf);
  const alignment = heatedAlignment(asOf);
  /** 加熱式で、まだ紙巻と同じ課税に揃っていない状態。金額を断定できない */
  const heatedPending = kind === 'heated' && !alignment.aligned;

  const rows = useMemo(
    () => priceTimeline({ basePrice: priceYen, sticksPerPack, baseIndex }),
    [priceYen, sticksPerPack, baseIndex],
  );

  const spending =
    priceYen !== undefined && sticksPerDay !== undefined
      ? estimateSpending({
          sticksPerDay,
          pricePerPack: priceYen,
          sticksPerPack,
          rates: currentPhase.rates,
        })
      : null;

  const rises =
    sticksPerDay !== undefined ? increases({ sticksPerDay, sticksPerPack, baseIndex }) : [];
  const lastRise = rises.at(-1);
  const savings = spending ? quitSavings(spending.annual) : [];

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="kind">たばこの種類</label>
        <select
          id="kind"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as ProductKind);
            trackToolUse('tabako-zei-neage', 'select-kind');
          }}
        >
          <option value="paper">{PRODUCT_LABEL.paper}</option>
          <option value="heated">{PRODUCT_LABEL.heated}</option>
        </select>
        <p className="hint">
          2027年4月からの引き上げは紙巻・加熱式に共通です。加熱式は、これとは別に
          {formatDate(alignment.alignedFrom)}に紙巻たばこと同じ課税へ揃える見直しがあります。
        </p>
      </div>

      {heatedPending && (
        <div className="panel quiet">
          <p style={{ margin: 0, fontWeight: 700 }}>
            加熱式たばこは{formatDate(alignment.alignedFrom)}の見直しぶんを織り込めません
          </p>
          <p className="hint" style={{ marginTop: 4 }}>
            {formatDate(alignment.step1From)}と{formatDate(alignment.alignedFrom)}
            の2段階で、加熱式たばこは紙巻たばこと同じ課税方式に揃えられます。上がり幅は製品ごとの重量と定価で決まるため、1箱いくらになるかを一律には出せません。
            <strong>
              下の想定価格は、{formatDate(alignment.alignedFrom)}
              以降の価格が入力額のままだった場合の推移
            </strong>
            として見てください（実際にはここからさらに上がります）。
          </p>
        </div>
      )}

      <div className="field">
        <label htmlFor="price">いつも買う銘柄の1箱の価格（円・税込）</label>
        <input
          id="price"
          type="number"
          inputMode="numeric"
          min={0}
          step={10}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={() => priceYen !== undefined && trackToolUse('tabako-zei-neage', 'calculate')}
          placeholder="580"
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="per-day">1日に吸う本数</label>
          <input
            id="per-day"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={perDay}
            onChange={(e) => setPerDay(e.target.value)}
            onBlur={() =>
              sticksPerDay !== undefined && trackToolUse('tabako-zei-neage', 'calculate')
            }
            placeholder="20"
          />
        </div>
        <div className="field">
          <label htmlFor="per-pack">1箱の本数</label>
          <input
            id="per-pack"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={perPack}
            onChange={(e) => setPerPack(e.target.value)}
            placeholder="20"
          />
        </div>
      </div>

      <h3 style={{ fontSize: '1rem', margin: '20px 0 8px' }}>この銘柄の想定価格の推移</h3>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>時期</th>
              <th>1箱のたばこ税</th>
              <th>想定小売価格</th>
              <th>いまとの差</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.phase.id}>
                <th scope="row">{row.phase.label}</th>
                <td>{formatYenDecimal(row.perPack)}</td>
                <td>{row.priceYen !== undefined ? formatYen(row.priceYen) : '—'}</td>
                <td>
                  {row.risePerPackWithTax > 0
                    ? `+${formatYenDecimal(row.risePerPackWithTax)}`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        たばこの小売定価はメーカーの申請にもとづく財務大臣の認可で決まります。上の想定価格は
        <strong>増税分がそのまま価格に乗った場合</strong>
        の目安で、確定した価格ではありません（増税分にも消費税がかかるため、1箱20本なら1回あたり税込11円の上昇になります）。
      </p>

      {spending ? (
        <>
          <div className="panel">
            <div className="metric">
              <span className="label">いまの年間の支出</span>
              <span className="value">{spending.annual.toLocaleString('ja-JP')}</span>
              <span className="unit">円</span>
            </div>
            <p className="hint" style={{ marginTop: 4 }}>
              1日 {formatYen(spending.daily)} ／ 1か月 {formatYen(spending.monthly)}。
              1年で{spending.sticksPerYear.toLocaleString('ja-JP')}本（
              {spending.packsPerYear.toLocaleString('ja-JP')}箱）ぶんです。
            </p>
          </div>

          <div className="panel quiet">
            <dl className="kv">
              <div>
                <dt>うち たばこ税（国・地方・特別税の合計）</dt>
                <dd>{formatYen(spending.annualTobaccoTax)}</dd>
              </div>
              <div>
                <dt>うち 消費税</dt>
                <dd>{formatYen(spending.annualConsumptionTax)}</dd>
              </div>
              <div>
                <dt>支出に占める税の割合</dt>
                <dd>{spending.taxRatioPercent}%</dd>
              </div>
            </dl>
            <p className="hint" style={{ marginTop: 8 }}>
              たばこ税は本数にかかる従量税（1本{formatYenDecimal(taxPerStick(currentPhase.rates), 3)}
              ）なので、銘柄が高くても安くても税額は同じです。高い銘柄ほど税の割合は下がります。
            </p>
          </div>
        </>
      ) : (
        <p className="hint">価格と1日の本数を入力すると、月間・年間の負担額を計算します。</p>
      )}

      {spending && lastRise && (
        <div className="panel">
          <div className="metric">
            <span className="label">
              {lastRise.phase.label.replace('〜', '')}時点で、年間の支出は
            </span>
            <span className="value">+{lastRise.annual.toLocaleString('ja-JP')}</span>
            <span className="unit">円</span>
          </div>
          <p className="hint" style={{ marginTop: 4 }}>
            月あたり {formatYen(lastRise.monthly)} の増加です。
            {heatedPending &&
              `加熱式はこれに加えて、${formatDate(alignment.alignedFrom)}の課税方式の見直しぶんが上乗せされます。`}
          </p>
          <dl className="kv" style={{ marginTop: 12 }}>
            {rises.map((rise) => (
              <div key={rise.phase.id}>
                <dt>
                  {formatDate(rise.phase.effectiveFrom)}から
                  <span className="chip">1箱 +{formatYenDecimal(rise.perPack)}</span>
                </dt>
                <dd>
                  年間 +{formatYen(rise.annual)}（月 +{formatYen(rise.monthly)}）
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {spending && spending.annual > 0 && (
        <div className="panel quiet">
          <p style={{ margin: '0 0 8px', fontWeight: 700 }}>買わなくなった場合に浮く額</p>
          <dl className="kv">
            {savings.map((s) => (
              <div key={s.years}>
                <dt>{s.years}年で</dt>
                <dd>{formatYen(s.yen)}</dd>
              </div>
            ))}
          </dl>
          <p className="hint" style={{ marginTop: 8 }}>
            いまの支出をそのまま年数倍した金額です（今後の値上げぶんは含みません）。
          </p>
        </div>
      )}

      <p className="hint" style={{ marginTop: 16 }}>
        データ最終更新日：{formatDate(DATA_CHECKED_AT)} ／ 家計の負担をほかの面からも見るなら
        <Link href="/nenshu-kabe/">年収の壁 計算機</Link>、
        <Link href="/nenmatsu-chosei/">年末調整 還付金 計算機</Link>もどうぞ。
      </p>
    </div>
  );
}
