'use client';

import { useMemo, useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import {
  BUSINESS_TYPES,
  CONSUMPTION_TAX_RATE,
  DATA_CHECKED_AT,
  KANI_LOCK_IN_YEARS,
  REDUCED_TAX_RATE,
  TRADE_OFFS,
  YEARS,
  compareMethods,
  formatDate,
  formatPercent,
  formatYen,
  kaniDeadline,
  methodLabel,
  type BusinessTypeId,
  type MethodResult,
} from '@/lib/invoice-nozeigaku';

/** 入力欄の数値を読む。空欄・不正な値は0にする */
function num(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * 初期値。
 * 売上550万円（税込）・第5種（サービス業）・仕入20% は、
 * インボイス登録した元免税の個人事業主でいちばん多い形に寄せてある。
 * この組み合わせだと「3割特例 < 簡易課税 < 本則課税」になり、
 * **方式によって答えが変わる**ことが最初の画面で伝わる。
 */
const DEFAULT_SALES = '5500000';
const DEFAULT_PURCHASE_PERCENT = '20';
const DEFAULT_TYPE: BusinessTypeId = 'type5';

export default function Calculator() {
  const [year, setYear] = useState<number>(YEARS[1].year);
  const [sales, setSales] = useState(DEFAULT_SALES);
  const [includesTax, setIncludesTax] = useState(true);
  const [businessType, setBusinessType] = useState<BusinessTypeId>(DEFAULT_TYPE);
  const [purchasePercent, setPurchasePercent] = useState(DEFAULT_PURCHASE_PERCENT);

  const result = useMemo(
    () =>
      compareMethods({
        year,
        sales: num(sales),
        salesIncludesTax: includesTax,
        businessType,
        purchaseRatePercent: num(purchasePercent),
      }),
    [year, sales, includesTax, businessType, purchasePercent],
  );

  const def = YEARS.find((y) => y.year === year) ?? YEARS[YEARS.length - 1];
  const deadline = kaniDeadline(year);
  const track = () => trackToolUse('invoice-nozeigaku', 'calculate');

  return (
    <div className="card">
      <div className="field">
        <span className="field-label" style={{ fontWeight: 700 }}>
          どの年の申告を考えていますか？
        </span>
        <select
          value={year}
          onChange={(e) => {
            setYear(Number(e.target.value));
            track();
          }}
          aria-label="申告する年"
        >
          {YEARS.map((y) => (
            <option key={y.year} value={y.year}>
              {y.label}
            </option>
          ))}
        </select>
        <p className="hint" style={{ marginTop: 6 }}>
          {def.note}
        </p>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="inv-sales">年間の課税売上高</label>
          <input
            id="inv-sales"
            type="number"
            inputMode="numeric"
            min={0}
            step={100000}
            value={sales}
            onChange={(e) => setSales(e.target.value)}
            onBlur={track}
            placeholder="5500000"
          />
          <div style={{ marginTop: 6 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input
                type="radio"
                name="inv-tax-included"
                checked={includesTax}
                onChange={() => setIncludesTax(true)}
              />
              税込
            </label>
            <label
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 14 }}
            >
              <input
                type="radio"
                name="inv-tax-included"
                checked={!includesTax}
                onChange={() => setIncludesTax(false)}
              />
              税抜
            </label>
          </div>
        </div>

        <div className="field">
          <label htmlFor="inv-type">業種（簡易課税の区分）</label>
          <select
            id="inv-type"
            value={businessType}
            onChange={(e) => {
              setBusinessType(e.target.value as BusinessTypeId);
              track();
            }}
          >
            {BUSINESS_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}（{t.example}）みなし仕入率{formatPercent(t.deemedRate)}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="inv-purchase">課税仕入れの割合（売上に対して）</label>
          <input
            id="inv-purchase"
            type="number"
            inputMode="numeric"
            min={0}
            max={200}
            step={5}
            value={purchasePercent}
            onChange={(e) => setPurchasePercent(e.target.value)}
            onBlur={track}
            placeholder="20"
          />
          <p className="hint" style={{ marginTop: 6 }}>
            % ／ 本則課税の計算に使います。ざっくりで構いません（仕入れ・外注費・
            経費のうち<strong>消費税がかかるもの</strong>の合計 ÷ 売上）。給料・保険料・
            家賃（住宅）などは含めません。
          </p>
        </div>
      </div>

      <p className="hint" style={{ marginTop: 0 }}>
        <strong>
          売上はすべて標準税率{formatPercent(CONSUMPTION_TAX_RATE)}として計算しています。
        </strong>
        {formatPercent(REDUCED_TAX_RATE)}
        （軽減税率）の売上がある場合は、売上税額の時点でずれるため、この概算は合いません。
      </p>

      {result.empty ? (
        <p className="hint">年間の課税売上高を入れると、方式ごとの納税額を比べます。</p>
      ) : (
        <>
          <div className="panel">
            <div className="metric">
              <span className="label">{def.label}でいちばん安いのは</span>
            </div>
            <div className="metric" style={{ marginTop: 4 }}>
              <span className="value">{result.best.label}</span>
              <span className="unit">{formatYen(result.best.tax)}</span>
            </div>
            <p className="hint" style={{ marginTop: 6 }}>
              税抜の課税売上高 {formatYen(result.netSales)} ／ 売上税額{' '}
              {formatYen(result.salesTax)}（税抜売上 × 10%）を前提にした概算です。
              {result.honsokuBreakEvenPercent !== null && (
                <>
                  {' '}
                  課税仕入れの割合が
                  <strong>{result.honsokuBreakEvenPercent}%</strong>
                  を超えると本則課税がいちばん安くなります。
                </>
              )}
            </p>
          </div>

          <div style={{ overflowX: 'auto', marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>方式</th>
                  <th>納税額の概算</th>
                  <th>売上税額に対して</th>
                  <th>{def.label}に選べるか</th>
                </tr>
              </thead>
              <tbody>
                {result.methods.map((m) => (
                  <tr key={m.id}>
                    <th scope="row" style={{ fontWeight: 600 }}>
                      {m.label}
                      {m.id === result.best.id && <span className="chip">最安</span>}
                    </th>
                    <td style={{ opacity: m.available ? 1 : 0.55 }}>
                      {m.available ? <strong>{formatYen(m.tax)}</strong> : formatYen(m.tax)}
                    </td>
                    <td style={{ opacity: m.available ? 1 : 0.55 }}>
                      {formatPercent(m.rateOfSalesTax)}
                    </td>
                    <td>
                      {m.available ? (
                        '選べる'
                      ) : (
                        <span className="hint">選べない — {m.unavailableReason}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">
            特例が選べるかどうかは<strong>基準期間（前々年）の課税売上高</strong>
            で決まります。ここでは入力した売上高を基準期間の売上高とみなして判定しているので、
            前々年と大きく違う年は実際の基準期間の額でご確認ください。
          </p>

          <KaniDeadlinePanel deadline={deadline} best={result.best} />

          <div className="panel quiet">
            <p style={{ margin: '0 0 8px', fontWeight: 700 }}>
              納税額だけで決めないでください
            </p>
            <dl className="kv">
              {TRADE_OFFS.map((t) => (
                <div key={t.title} style={{ display: 'block' }}>
                  <dt style={{ fontWeight: 700, color: 'var(--text)' }}>
                    {t.title}
                    <span className="chip" style={{ marginLeft: 6 }}>
                      {methodLabel(t.method)}
                    </span>
                  </dt>
                  <dd style={{ marginTop: 4, fontWeight: 400 }}>{t.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </>
      )}

      <p className="hint" style={{ marginTop: 16 }}>
        納税額は概算です（円未満切捨て。実際の申告では国税分7.8%と地方消費税分2.2%に分けて
        百円未満切捨てなどの端数処理が入るため、数百円ずれることがあります）。
        簡易課税は原則{KANI_LOCK_IN_YEARS}年間やめられません。データ最終更新日：
        {formatDate(DATA_CHECKED_AT)}
      </p>
    </div>
  );
}

/**
 * 簡易課税の届出期限。
 *
 * **原則と特則を必ず並べて出す。** 原則の期限は「前年の大晦日」なので、
 * 年が明けてから来た人は原則だけを見て「もう手遅れ」と諦めてしまう。
 * 2割特例・3割特例からの移行には特則があり、1年以上あとまで間に合う。
 */
function KaniDeadlinePanel({
  deadline,
  best,
}: {
  deadline: ReturnType<typeof kaniDeadline>;
  best: MethodResult;
}) {
  return (
    <div className="panel">
      <p style={{ margin: '0 0 8px', fontWeight: 700 }}>
        {deadline.year}年分から簡易課税にするときの届出期限
      </p>
      <dl className="kv">
        <div>
          <dt>原則</dt>
          <dd>{formatDate(deadline.principle)}まで</dd>
        </div>
        {deadline.special && (
          <div>
            <dt>
              特則（前年に{methodLabel(deadline.previousSpecial ?? 'niwari')}を使った人）
            </dt>
            <dd>{formatDate(deadline.special)}まで</dd>
          </div>
        )}
      </dl>
      {deadline.special ? (
        <p className="hint" style={{ marginTop: 8 }}>
          <strong>
            原則の{formatDate(deadline.principle)}を過ぎていても、まだ間に合います。
          </strong>
          {methodLabel(deadline.previousSpecial ?? 'niwari')}
          の適用を受けた課税期間の翌課税期間に係る確定申告期限までに「消費税簡易課税制度選択届出書」
          （{deadline.year}年分から適用を受ける旨を記載したもの）を提出すれば、
          その課税期間の初日の前日に提出したものとみなされます
          （28年改正法附則51の2⑥・51の3⑤）。
        </p>
      ) : (
        <p className="hint" style={{ marginTop: 8 }}>
          この年は特則の対象ではありません（前年に2割特例・3割特例を使っていないため）。
          適用したい課税期間が始まる前日までに提出する必要があります。
        </p>
      )}
      {best.id !== 'kani' && (
        <p className="hint" style={{ marginTop: 8 }}>
          いまの入力では{best.label}
          がいちばん安いので、簡易課税を選ぶ必要はありません。ただし
          {best.id === 'honsoku'
            ? '本則課税は帳簿とインボイスの保存が要件で、事務負担は重くなります。'
            : '特例が使えるのは期間が決まっているので、その先の年でもう一度お試しください。'}
        </p>
      )}
    </div>
  );
}
