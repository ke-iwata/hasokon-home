'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  DEFENSE_START_YEAR,
  EXTENDED_YEARS,
  RECONSTRUCTION_LAST_YEAR_AFTER,
  RECONSTRUCTION_LAST_YEAR_BEFORE,
  calcBoei,
  isDefenseTaxInEffect,
  type BoeiResult,
} from '@/lib/boei-tokubetsu-shotokuzei';
import { toYmd } from '@/lib/nenshu-kabe';

const yen = (v: number) => `${Math.round(v).toLocaleString('ja-JP')}円`;
/** 円 → 「500万円」。年収の見出し用 */
const man = (v: number) => `${(Math.round(v / 1000) / 10).toLocaleString('ja-JP')}万円`;

const DEPENDENT_OPTIONS = [0, 1, 2, 3, 4, 5];

/**
 * @param buildDate ビルド時刻（ISO文字列）。静的書き出しなので、サーバ描画と
 *   ハイドレーション直後はこの固定値で判定し、マウント後に「画面を開いた日」で評価し直す
 *   （lib/nenshu-kabe.ts と同じ方式）。こうしないと、2026年にビルドしたHTMLを
 *   2027年に開いたとき「2027年1月から始まります」と未来形のまま出てしまう。
 */
export default function Calculator({ buildDate }: { buildDate: string }) {
  const [incomeMan, setIncomeMan] = useState('500');
  const [dependents, setDependents] = useState(0);
  const [asOf, setAsOf] = useState(() => new Date(buildDate));

  useEffect(() => {
    setAsOf(new Date());
  }, []);

  const income = Math.max(0, Number(incomeMan) || 0) * 10_000;
  const r = calcBoei({ income, dependents });
  const started = isDefenseTaxInEffect(toYmd(asOf));

  return (
    <div className="card">
      <div style={{ display: 'grid', gap: 14 }}>
        <label>
          年収（額面・万円）
          <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
            賞与を含めた年間の給与の総支給額
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={incomeMan}
            onChange={(e) => setIncomeMan(e.target.value)}
          />
        </label>
        <label>
          扶養している家族の人数（16歳以上）
          <select value={dependents} onChange={(e) => setDependents(Number(e.target.value))}>
            {DEPENDENT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? 'なし' : `${n}人`}
              </option>
            ))}
          </select>
        </label>
      </div>

      {income <= 0 ? (
        <div className="note" style={{ marginTop: 18 }}>
          年収を入力すると防衛特別所得税の額が出ます。
        </div>
      ) : r.baseTax <= 0 ? (
        <div className="note" style={{ marginTop: 18, lineHeight: 1.7 }}>
          <strong>この年収では所得税がかからないため、防衛特別所得税も0円です。</strong>
          防衛特別所得税は所得税額の1%なので、所得税がかからない人には生じません
          （復興特別所得税も同じです）。
        </div>
      ) : (
        <Results r={r} started={started} />
      )}
    </div>
  );
}

function Results({ r, started }: { r: BoeiResult; started: boolean }) {
  const reconstructionCut = r.reconstructionBefore - r.reconstructionAfter;

  return (
    <>
      <div className="panel" style={{ marginTop: 18 }}>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
          年収 {man(r.gross)} の防衛特別所得税は
          {started ? '（2027年1月から適用中）' : `（${DEFENSE_START_YEAR}年1月から）`}
        </div>
        <div className="metric" style={{ marginTop: 4 }}>
          <span className="value">{yen(r.defenseTax)}</span>
          <span className="label">／年（所得税額 {yen(r.baseTax)} × 1%）</span>
        </div>
      </div>

      <div className="panel quiet" style={{ marginTop: 12 }}>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
          {DEFENSE_START_YEAR}年の手取りの変化
        </div>
        <div className="metric" style={{ marginTop: 4 }}>
          <span className="value">
            {r.change2027 === 0 ? '±0円' : `${r.change2027 > 0 ? '+' : '−'}${yen(Math.abs(r.change2027))}`}
          </span>
          <span className="label">（差し引きゼロ）</span>
        </div>
        <dl className="kv" style={{ marginTop: 8 }}>
          <div>
            <dt>＋ 防衛特別所得税（1%）</dt>
            <dd>+{yen(r.defenseTax)}</dd>
          </div>
          <div>
            <dt>− 復興特別所得税の引下げ（2.1% → 1.1%）</dt>
            <dd>−{yen(reconstructionCut)}</dd>
          </div>
        </dl>
        <p className="hint" style={{ marginTop: 6 }}>
          付加税の合計は改正前後とも所得税額の2.1%で同じです。内訳は1円未満を切り捨てて表示しているため、1円ずれることがあります（実際の端数計算は合計額で行います）。
        </p>
      </div>

      <h3 style={{ marginTop: 22 }}>負担が増えるのは{RECONSTRUCTION_LAST_YEAR_BEFORE + 1}年から</h3>
      <p style={{ marginTop: 0 }}>
        改正前なら復興特別所得税は{RECONSTRUCTION_LAST_YEAR_BEFORE}年で終わり、
        {RECONSTRUCTION_LAST_YEAR_BEFORE + 1}年からは付加税がなくなるはずでした。改正後はそこから先も続きます。
        同じ年収・同じ控除が続いた場合の目安です。
      </p>
      <dl className="kv">
        <div>
          <dt>
            {RECONSTRUCTION_LAST_YEAR_BEFORE + 1}〜{RECONSTRUCTION_LAST_YEAR_AFTER}年（復興1.1%＋防衛1%）
          </dt>
          <dd>+{yen(r.annual2038)}／年</dd>
        </div>
        <div>
          <dt>上の{EXTENDED_YEARS}年分の合計</dt>
          <dd>
            <strong>+{yen(r.cumulative2038to2047)} 以上</strong>
          </dd>
        </div>
        <div>
          <dt>{RECONSTRUCTION_LAST_YEAR_AFTER + 1}年以降（防衛1%）</dt>
          <dd>+{yen(r.annual2048)}／年（終わりの定めなし）</dd>
        </div>
      </dl>
      <div className="note" style={{ marginTop: 10, lineHeight: 1.7 }}>
        <strong>{EXTENDED_YEARS}年分の合計は「下限」です。</strong>
        防衛特別所得税の課税期間は「令和9年以後の<strong>当分の間</strong>」とされ、終わりの年が決まっていません。
        {RECONSTRUCTION_LAST_YEAR_AFTER + 1}年以降も、法律が変わらない限り所得税額の1%が毎年続きます。
      </div>

      <details style={{ marginTop: 14 }}>
        <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)', fontWeight: 600 }}>
          計算過程を見る（令和9年分）
        </summary>
        <dl className="kv" style={{ marginTop: 10 }}>
          <div>
            <dt>給与収入</dt>
            <dd>{yen(r.gross)}</dd>
          </div>
          <div>
            <dt>− 給与所得控除</dt>
            <dd>{yen(r.salaryDeduction)}</dd>
          </div>
          <div>
            <dt>＝ 給与所得</dt>
            <dd>{yen(r.totalIncome)}</dd>
          </div>
          <div>
            <dt>− 社会保険料控除（年収からの概算）</dt>
            <dd>{yen(r.socialInsurance)}</dd>
          </div>
          <div>
            <dt>− 基礎控除</dt>
            <dd>{yen(r.basicDeduction)}</dd>
          </div>
          {r.dependentDeduction > 0 && (
            <div>
              <dt>− 扶養控除</dt>
              <dd>{yen(r.dependentDeduction)}</dd>
            </div>
          )}
          <div>
            <dt>＝ 課税所得（1,000円未満切捨て）</dt>
            <dd>{yen(r.taxableIncome)}</dd>
          </div>
          <div>
            <dt>所得税額（速算表）</dt>
            <dd>{yen(r.calculatedTax)}</dd>
          </div>
          <div>
            <dt>− 税額控除（住宅ローン控除など）</dt>
            <dd>{r.taxCredit > 0 ? yen(r.taxCredit) : '—（入力なし）'}</dd>
          </div>
          <div>
            <dt>＝ 基準所得税額</dt>
            <dd>{yen(r.baseTax)}</dd>
          </div>
          <div>
            <dt>防衛特別所得税（× 1%）</dt>
            <dd>{yen(r.defenseTax)}</dd>
          </div>
          <div>
            <dt>復興特別所得税（× 1.1%）</dt>
            <dd>{yen(r.reconstructionAfter)}</dd>
          </div>
          <div>
            <dt>年税額（基準所得税額 × 102.1%・100円未満切捨て）</dt>
            <dd>{yen(r.yearTax2027After)}</dd>
          </div>
        </dl>
      </details>

      <h3 style={{ marginTop: 22 }}>この結果を読むときの注意</h3>
      <div className="note" style={{ lineHeight: 1.7 }}>
        <strong>住宅ローン控除などの税額控除がある場合、実際の防衛特別所得税はこれより少なくなります。</strong>
        防衛特別所得税は、税額控除を差し引いたあとの所得税額（基準所得税額）に1%を掛けるためです。
        所得税が住宅ローン控除でゼロになっている人は、防衛特別所得税もゼロです。
      </div>
      <div className="note" style={{ marginTop: 10, lineHeight: 1.7 }}>
        <strong>給与のみ・扶養控除と基礎控除だけの目安です。</strong>
        社会保険料は協会けんぽの全国平均の料率から概算しています。配偶者控除・生命保険料控除・iDeCoなどがある人は、所得税額が下がるぶん防衛特別所得税も下がります。
        控除を細かく入れた所得税額は <Link href="/nenmatsu-chosei/">年末調整 還付金 計算機</Link>{' '}
        で出せます（「年調所得税額」＝住宅ローン控除後・102.1%を掛ける前の額の1%が防衛特別所得税です）。
      </div>
    </>
  );
}
