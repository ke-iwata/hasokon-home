'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  KOJO_RESIDENT_CAP,
  METHOD_LABEL,
  PREPAY_TYPE_LABEL,
  RATE_CHANGES_MAX,
  compareMethods,
  effectivePrepayments,
  formatMonths,
  formatYen as yen,
  kojoLimitRange,
  parseNumber,
  prepayEffect,
  rateChangesWithinTerm,
  burdenRatio,
  simulate,
  validate,
  yearEndTable,
  type LoanInput,
  type LoanResult,
  type Method,
  type PrepayType,
} from '@/lib/loan-hensai';
import { isPublicTool } from '@/lib/registry';
import { trackToolUse } from '@/lib/analytics';

const MAN = 10_000;
/** 年末残高の表で最初に出す年数（残りは「すべて表示」で開く） */
const TABLE_FIRST_ROWS = 10;
/** 繰上返済の入力欄の数 */
const PREPAY_SLOTS = 3;
/** 返済開始（年）として受け付ける範囲 */
const START_YEAR_MIN = 1980;
const START_YEAR_MAX = 2100;

interface PrepayRow {
  year: string;
  amountMan: string;
  type: PrepayType;
}

interface RateRow {
  afterYears: string;
  plus: string;
}

const choiceStyle = (on: boolean) => ({
  padding: '8px 0',
  fontWeight: on ? 700 : 400,
  background: on ? 'var(--accent-soft)' : undefined,
});

export default function Calculator() {
  const [principalMan, setPrincipalMan] = useState('3000');
  const [years, setYears] = useState('35');
  const [rate, setRate] = useState('1.0');
  const [method, setMethod] = useState<Method>('ganri');
  const [bonusMan, setBonusMan] = useState('0');
  // 返済開始年月の既定は「来月」。ビルド時刻で描いてからマウント後に開いた日へ差し替える
  const [start, setStart] = useState<{ y: number; m: number }>({ y: 2026, m: 11 });
  useEffect(() => {
    const now = new Date();
    const m = now.getMonth() + 2; // 来月（1〜13）
    setStart({ y: now.getFullYear() + (m > 12 ? 1 : 0), m: m > 12 ? 1 : m });
  }, []);
  const [prepays, setPrepays] = useState<PrepayRow[]>(
    Array.from({ length: PREPAY_SLOTS }, () => ({ year: '', amountMan: '', type: 'shorten' as PrepayType })),
  );
  const [rateRows, setRateRows] = useState<RateRow[]>(
    Array.from({ length: RATE_CHANGES_MAX }, () => ({ afterYears: '', plus: '' })),
  );
  const [rule125, setRule125] = useState(true);
  const [incomeMan, setIncomeMan] = useState('');
  const [showAll, setShowAll] = useState(false);
  // 返済開始（年）は入力欄の文字列を持ち、年として読めるときだけ使う（打ち直しの途中の「202」を通さない）
  // null の間は start.y（来月の年）をそのまま見せる
  const [startYearText, setStartYearText] = useState<string | null>(null);
  const typedYear = startYearText === null ? NaN : parseNumber(startYearText);
  const startYear =
    Number.isInteger(typedYear) && typedYear >= START_YEAR_MIN && typedYear <= START_YEAR_MAX ? typedYear : start.y;

  const baseRate = parseNumber(rate);
  const input: LoanInput = {
    principal: Math.round(parseNumber(principalMan) * MAN),
    years: parseNumber(years),
    ratePercent: baseRate,
    method,
    bonusPrincipal: Math.round((parseNumber(bonusMan) || 0) * MAN),
    // 「n 年目の返済の後」= 12n 回目の返済の後
    prepayments: prepays
      .map((p) => ({ afterPayment: parseNumber(p.year) * 12, amount: parseNumber(p.amountMan) * MAN, type: p.type }))
      .filter((p) => p.afterPayment > 0 && p.amount > 0),
    // 「n 年後から当初より +x%」= 12n + 1 回目から
    rateChanges: rateRows
      .map((r) => ({ fromPayment: parseNumber(r.afterYears) * 12 + 1, ratePercent: baseRate + parseNumber(r.plus) }))
      .filter((r) => Number.isFinite(r.fromPayment) && r.fromPayment > 1 && Number.isFinite(r.ratePercent)),
    rule125,
  };
  const error = validate(input);
  const r = error ? null : simulate(input);
  const cmp = error ? null : compareMethods(input);
  const effect = error ? null : prepayEffect(input);
  // 返済期間の中で実際に金利が変わるときだけ「金利が上がったとき」を出す（lib の 125%ルールと同じ判定）
  const hasRateChange = !error && rateChangesWithinTerm(input);
  // 最終年の終わりなど、計算に入らない繰上返済があるか
  const droppedPrepay = (input.prepayments ?? []).length > effectivePrepayments(input).length;
  const flat = hasRateChange && !error ? simulate({ ...input, rateChanges: [] }) : null;
  const table = r ? yearEndTable(r, startYear, start.m) : [];
  const ratio = r ? burdenRatio(r, parseNumber(incomeMan) * MAN) : null;
  const limits = kojoLimitRange();
  const linkKojo = isPublicTool('jutaku-loan-kojo');

  const track = () => trackToolUse('loan-hensai', 'calculate');

  return (
    <div className="card">
      <div className="field-row">
        <label>
          借入額（万円）
          <input type="number" inputMode="numeric" min={1} step={10} value={principalMan}
            onChange={(e) => setPrincipalMan(e.target.value)} onBlur={track} />
        </label>
        <label>
          返済期間（年）
          <input type="number" inputMode="numeric" min={1} max={50} step={1} value={years}
            onChange={(e) => setYears(e.target.value)} onBlur={track} />
        </label>
        <label>
          金利（年%）
          <input type="number" inputMode="decimal" min={0} max={15} step={0.001} value={rate}
            onChange={(e) => setRate(e.target.value)} onBlur={track} />
        </label>
      </div>
      <p className="hint" style={{ marginTop: 4 }}>
        既定の 1.0% は計算例で、現在の市場金利ではありません。借りる（借りている）ローンの金利を入れてください。
      </p>

      {error || !r ? (
        <div className="panel quiet">{error}</div>
      ) : (
        <div className="panel">
          <div className="metric">
            <span className="label">毎月の返済額（{METHOD_LABEL[method]}{method === 'gankin' ? '・初回' : ''}）</span>
            <span className="value">{r.firstMonthlyPayment.toLocaleString('ja-JP')}</span>
            <span className="unit">円</span>
          </div>
          {r.bonus && <p style={{ margin: '4px 0 0' }}>ボーナス月は ＋{yen(r.firstBonusPayment)}（年2回）</p>}
          <dl className="kv" style={{ marginTop: 8 }}>
            <div><dt>総返済額</dt><dd>{yen(r.totalPaid)}</dd></div>
            <div><dt>利息の合計</dt><dd>{yen(r.totalInterest)}</dd></div>
            <div><dt>最終回（{r.monthly.lastMonth}回目）</dt><dd>{yen(r.monthly.finalPayment)}</dd></div>
          </dl>
        </div>
      )}

      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)' }}>返済方式・ボーナス払い・返済開始年月</summary>
        <div className="field" style={{ marginTop: 8 }}>
          <span className="field-label">返済方式</span>
          <div className="field-row" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(['ganri', 'gankin'] as Method[]).map((m) => (
              <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)} style={choiceStyle(method === m)}>
                {METHOD_LABEL[m]}
              </button>
            ))}
          </div>
        </div>
        <div className="field-row">
          <label>
            うちボーナス払い（万円）
            <input type="number" inputMode="numeric" min={0} step={10} value={bonusMan} onChange={(e) => setBonusMan(e.target.value)} />
          </label>
          <label>
            返済開始（年）
            <input type="number" inputMode="numeric" min={START_YEAR_MIN} max={START_YEAR_MAX}
              value={startYearText ?? String(start.y)}
              onChange={(e) => setStartYearText(e.target.value)}
              onBlur={() => {
                // 確定した値だけを残す。読めない値なら直前の年に戻す
                setStart({ ...start, y: startYear });
                setStartYearText(null);
              }} />
          </label>
          <label>
            返済開始（月）
            <select value={start.m} onChange={(e) => setStart({ ...start, m: Number(e.target.value) })}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{m}月</option>
              ))}
            </select>
          </label>
        </div>
        <p className="hint" style={{ marginTop: 4 }}>
          ボーナス払いは借入額の50%まで。返済開始から6か月ごとに払う計算です。返済開始年月は年末残高の表に使います。
        </p>
      </details>

      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)' }}>繰上返済（任意）</summary>
        {prepays.map((p, i) => (
          <div className="field-row" key={i} style={{ marginTop: 8 }}>
            <label>
              何年目の終わりに
              <input type="number" inputMode="numeric" min={1} value={p.year}
                onChange={(e) => setPrepays(prepays.map((q, j) => (j === i ? { ...q, year: e.target.value } : q)))} />
            </label>
            <label>
              金額（万円）
              <input type="number" inputMode="numeric" min={0} step={10} value={p.amountMan}
                onChange={(e) => setPrepays(prepays.map((q, j) => (j === i ? { ...q, amountMan: e.target.value } : q)))} />
            </label>
            <label>
              型
              <select value={p.type}
                onChange={(e) => setPrepays(prepays.map((q, j) => (j === i ? { ...q, type: e.target.value as PrepayType } : q)))}>
                {(['shorten', 'reduce'] as PrepayType[]).map((t) => (
                  <option key={t} value={t}>{PREPAY_TYPE_LABEL[t]}</option>
                ))}
              </select>
            </label>
          </div>
        ))}
        <p className="hint" style={{ marginTop: 4 }}>
          「10年目の終わり」は120回目の返済の後に元金へ充てる扱いです。手数料は含めていません。ボーナス払いの分には充てません。
        </p>
        {droppedPrepay && (
          <p className="hint" style={{ marginTop: 4 }}>
            返済の最終年（{years}年目）の終わり以降には繰上返済を入れられません。その行は計算に入れていません。
          </p>
        )}
      </details>

      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)' }}>金利が上がったら（任意）</summary>
        {rateRows.map((row, i) => (
          <div className="field-row" key={i} style={{ marginTop: 8 }}>
            <label>
              何年後から
              <input type="number" inputMode="numeric" min={1} value={row.afterYears}
                onChange={(e) => setRateRows(rateRows.map((q, j) => (j === i ? { ...q, afterYears: e.target.value } : q)))} />
            </label>
            <label>
              当初より＋（%）
              <input type="number" inputMode="decimal" step={0.1} value={row.plus}
                onChange={(e) => setRateRows(rateRows.map((q, j) => (j === i ? { ...q, plus: e.target.value } : q)))} />
            </label>
          </div>
        ))}
        {method === 'ganri' ? (
          <div className="field" style={{ marginTop: 10 }}>
            <span className="field-label">5年ルール・125%ルール</span>
            <div className="field-row" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[true, false].map((v) => (
                <button key={String(v)} type="button" aria-pressed={rule125 === v} onClick={() => setRule125(v)} style={choiceStyle(rule125 === v)}>
                  {v ? '当てる' : '当てない'}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="hint" style={{ marginTop: 8 }}>
            元金均等は元金の返済額が一定なので、金利が変わった月から利息だけが変わります（5年ルール・125%ルールはありません）。
          </p>
        )}
        <p className="hint" style={{ marginTop: 4 }}>
          上がり幅はご自身で入れてください（このツールは金利の予想をしません）。「5年後から」は61回目の返済からの金利です。
        </p>
      </details>

      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)' }}>返済負担率（任意で年収を入れる）</summary>
        <div className="field-row" style={{ marginTop: 8 }}>
          <label>
            税込年収（万円）
            <input type="number" inputMode="numeric" min={0} step={10} value={incomeMan} onChange={(e) => setIncomeMan(e.target.value)} />
          </label>
        </div>
        {ratio !== null && (
          <p style={{ margin: '6px 0 0' }}>
            返済負担率 <strong>{(ratio * 100).toFixed(1)}%</strong>（最初の1年の返済額 {yen(r?.firstYearPaid ?? 0)} ÷ 年収）
          </p>
        )}
        <p className="hint" style={{ marginTop: 4 }}>
          基準は金融機関ごとに違うため、何%までなら借りられるかの目安は示していません。
        </p>
      </details>

      {r && cmp && <MethodCompare ganri={cmp.ganri} gankin={cmp.gankin} />}

      {r && effect && (
        <>
          <h3 style={{ marginTop: 22 }}>繰上返済の効果</h3>
          <dl className="kv">
            {effect.monthsShortened > 0 && (
              <div><dt>返済期間</dt><dd>{formatMonths(effect.monthsShortened)} 短くなる</dd></div>
            )}
            {effect.paymentDrop > 0 && (
              <div><dt>毎月の返済額</dt><dd>{yen(effect.paymentDrop)} 下がる（{yen(effect.paymentAfter)}）</dd></div>
            )}
            <div><dt>減る利息</dt><dd>{yen(effect.interestSaved)}</dd></div>
          </dl>
        </>
      )}

      {r && hasRateChange && flat && <RateRise result={r} flat={flat} rule={method === 'ganri' && rule125} />}

      {r && (
        <>
          <h3 style={{ marginTop: 22 }}>年末残高と住宅ローン控除の目安</h3>
          <table>
            <thead>
              <tr><th>年</th><th>年末残高</th><th>控除の目安</th></tr>
            </thead>
            <tbody>
              {(showAll ? table : table.slice(0, TABLE_FIRST_ROWS)).map((row) => (
                <tr key={row.year}>
                  <td style={{ textAlign: 'left' }}>{row.year}年</td>
                  <td>{yen(row.balance)}</td>
                  <td>{yen(row.kojo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {table.length > TABLE_FIRST_ROWS && (
            <button type="button" onClick={() => setShowAll(!showAll)} style={{ marginTop: 8, padding: '10px 16px', minHeight: 44 }}>
              {showAll ? '最初の10年だけ表示' : `すべて表示（${table.length}年分）`}
            </button>
          )}
          <ul className="hint" style={{ marginTop: 8 }}>
            <li>控除の目安＝年末残高 × 0.7%。<strong>住宅の取得のためのローンとして使う場合だけ</strong>の値です（自動車ローン・教育ローンには関係ありません）。</li>
            <li>
              これは<strong>上限の目安</strong>で、実際の控除は ①借入限度額（新築／中古・省エネ性能の区分で{(limits.min / MAN).toLocaleString('ja-JP')}万円〜{(limits.max / MAN).toLocaleString('ja-JP')}万円）
              ②控除期間（{limits.years.join('年／')}年） ③その年の所得税と住民税の額（住民税からの控除は上限{(KOJO_RESIDENT_CAP / MAN).toLocaleString('ja-JP')}万円）で頭打ちになります。
            </li>
            {linkKojo && (
              <li>
                実際に戻る額は <Link href="/jutaku-loan-kojo/">住宅ローン控除 計算機</Link> で、年末残高を入れて確かめられます。
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}

function MethodCompare({ ganri, gankin }: { ganri: LoanResult; gankin: LoanResult }) {
  const cards: [string, LoanResult][] = [
    [METHOD_LABEL.ganri, ganri],
    [METHOD_LABEL.gankin, gankin],
  ];
  const diff = ganri.totalInterest - gankin.totalInterest;
  return (
    <>
      <h3 style={{ marginTop: 22 }}>元利均等と元金均等の比較</h3>
      {/* スマホ幅では縦に積み、広い画面では横に並べる */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
        {cards.map(([label, x]) => (
          <div key={label} className="panel quiet" style={{ marginTop: 0 }}>
            <strong>{label}</strong>
            <dl className="kv">
              <div><dt>初回の返済額</dt><dd>{yen(x.firstMonthlyPayment)}</dd></div>
              <div><dt>総返済額</dt><dd>{yen(x.totalPaid)}</dd></div>
              <div><dt>利息の合計</dt><dd>{yen(x.totalInterest)}</dd></div>
            </dl>
          </div>
        ))}
      </div>
      <p className="hint" style={{ marginTop: 6 }}>
        利息の差は {yen(Math.abs(diff))}（{diff >= 0 ? '元金均等のほうが少ない' : '元利均等のほうが少ない'}）。元金均等は初めの返済額が大きくなります。
      </p>
    </>
  );
}

function RateRise({ result, flat, rule }: { result: LoanResult; flat: LoanResult; rule: boolean }) {
  const t = result.monthly;
  return (
    <>
      <h3 style={{ marginTop: 22 }}>金利が上がったとき</h3>
      {t.reviews.length > 0 && (
        <table>
          <thead>
            <tr><th>回</th><th>引き直した額</th>{rule && <th>上限（125%）</th>}<th>返済額</th></tr>
          </thead>
          <tbody>
            {t.reviews.map((v) => (
              <tr key={v.k}>
                <td style={{ textAlign: 'left' }}>{v.k}回目</td>
                <td>{yen(v.computed)}</td>
                {rule && <td>{v.cap === null ? '—' : yen(v.cap)}</td>}
                <td><strong>{yen(v.payment)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <dl className="kv" style={{ marginTop: 8 }}>
        {rule && (
          <div>
            <dt>払いきれない利息（未払利息）</dt>
            <dd>{t.maxUnpaid > 0 ? `たまる（最大 ${yen(t.maxUnpaid)}）` : 'たまらない'}</dd>
          </div>
        )}
        <div><dt>最終回（{t.lastMonth}回目）</dt><dd>{yen(t.finalPayment)}</dd></div>
        <div><dt>利息の合計</dt><dd>{yen(result.totalInterest)}（金利が変わらなければ {yen(flat.totalInterest)}）</dd></div>
      </dl>
      {result.bonus && result.bonus.reviews.length > 0 && (
        <p className="hint">
          ボーナス払いの分も別に見直します：{result.bonus.reviews.map((v) => `${v.k}回目〜 ${yen(v.payment)}`).join('、')}（最終回 {yen(result.bonus.finalPayment)}）。
        </p>
      )}
      <p className="hint">
        {rule
          ? '5年ルール・125%ルールは法令ではなく金融機関の約定です。多くの金融機関の変動金利型（元利均等）で採られていますが、採っていない商品もあります。返済額は5年ごと（61・121…回目）に見直し、前回の1.25倍までに抑えます。'
          : '金利が変わった月から、その時点の残高・残り回数・新しい金利で返済額を引き直しています（上限なし）。'}
      </p>
    </>
  );
}
