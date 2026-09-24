'use client';

import { useMemo, useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import {
  ECO_GRADES,
  HOUSE_KINDS,
  INCOME_LIMIT,
  INCOME_LIMIT_SMALL,
  INELIGIBLE_MESSAGE,
  MOVE_IN_YEARS,
  RED_ZONE_FROM_YEAR,
  RESIDENT_CAP_FULL_AT,
  RESIDENT_CAP_MAX,
  calculate,
  cellLimit,
  ecoGradeLabel,
  formatEra,
  formatMan,
  formatYen,
  hayamihyo,
  houseKindLabel,
  limitRowR7,
  parseAmountInput,
  transitionalApplies,
  transitionalLabel,
  type EcoGrade,
  type HouseKind,
  type MoveInYear,
} from '@/lib/jutaku-loan-kojo';

const rows = hayamihyo();

export default function Calculator() {
  /* ---- 入力 ---- */
  const [year, setYear] = useState<MoveInYear>(2026);
  const [kind, setKind] = useState<HouseKind>('new');
  const [grade, setGrade] = useState<EcoGrade>('zeh');
  const [tokurei, setTokurei] = useState(false);
  const [transitional, setTransitional] = useState(false);
  const [redZone, setRedZone] = useState(false);
  const [floorArea, setFloorArea] = useState('75');
  const [balance, setBalance] = useState('30000000');
  const [totalIncome, setTotalIncome] = useState('5000000');
  const [incomeTax, setIncomeTax] = useState('');
  const [taxableIncomeTax, setTaxableIncomeTax] = useState('');

  /** 早見表の世帯の切り替え。3軸目を表から外すためのもの */
  const [tableTokurei, setTableTokurei] = useState(false);

  const optional = (raw: string) => {
    const v = parseAmountInput(raw);
    return Number.isFinite(v) && v >= 0 ? v : null;
  };

  const result = calculate({
    year,
    kind,
    grade,
    tokurei,
    floorArea: parseAmountInput(floorArea),
    totalIncome: parseAmountInput(totalIncome),
    balance: parseAmountInput(balance),
    transitional,
    redZone,
    incomeTax: optional(incomeTax),
    taxableIncomeTax: optional(taxableIncomeTax),
  });

  /** 同じ条件を令和7年（改正前）に入居した場合の限度額。改正前後の比較に出す */
  const before = useMemo(() => limitRowR7(kind, grade), [kind, grade]);
  const beforeLimit = cellLimit(before, tokurei);

  const showTransitional = transitionalApplies(kind, grade);
  const showRedZone = kind === 'new' && year >= RED_ZONE_FROM_YEAR;

  const checkboxStyle = {
    fontWeight: 400,
    display: 'flex',
    gap: 6,
    alignItems: 'flex-start',
    fontSize: 'var(--fs-sm)',
  } as const;

  return (
    <>
      {/* ================= 計算 ================= */}
      <div className="card">
        <h2 style={{ fontSize: '1.1rem', marginTop: 0 }}>いくら控除されるか</h2>

        <div className="field">
          <label htmlFor="year">入居（予定）年</label>
          <select
            id="year"
            value={year}
            onChange={(e) => {
              setYear(Number(e.target.value) as MoveInYear);
              trackToolUse('jutaku-loan-kojo', 'change-year');
            }}
          >
            {MOVE_IN_YEARS.map((y) => (
              <option key={y} value={y}>
                {formatEra(y)}
              </option>
            ))}
          </select>
          <p className="hint">
            この計算機が扱うのは令和8年から令和12年までの入居です。令和7年以前に入居した場合は、借入限度額も控除期間も別の表になります。
          </p>
        </div>

        <div className="field">
          <span className="field-label">住宅の種類</span>
          {/* globals.css は [aria-pressed] にスタイルを持たないので、
              選ばれている側はインラインの fontWeight で示す（他の計算機と同じ作法） */}
          <div className="field-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {HOUSE_KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setKind(k.value)}
                aria-pressed={kind === k.value}
                style={{ fontWeight: kind === k.value ? 700 : 400 }}
              >
                {k.label}
              </button>
            ))}
          </div>
          <p className="hint">{HOUSE_KINDS.find((k) => k.value === kind)?.note}</p>
        </div>

        <div className="field">
          <label htmlFor="grade">省エネの区分</label>
          <select
            id="grade"
            value={grade}
            onChange={(e) => {
              setGrade(e.target.value as EcoGrade);
              trackToolUse('jutaku-loan-kojo', 'change-grade');
            }}
          >
            {ECO_GRADES.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
          <p className="hint">{ECO_GRADES.find((g) => g.value === grade)?.note}</p>
        </div>

        {showTransitional && (
          <div className="field">
            <label style={checkboxStyle}>
              <input
                type="checkbox"
                checked={transitional}
                onChange={(e) => setTransitional(e.target.checked)}
                style={{ width: 'auto', marginTop: 3 }}
              />
              {transitionalLabel(grade)}（建築確認の時期による経過措置）
            </label>
          </div>
        )}

        <div className="field">
          <span className="field-label">世帯</span>
          <label style={checkboxStyle}>
            <input
              type="checkbox"
              checked={tokurei}
              onChange={(e) => {
                setTokurei(e.target.checked);
                trackToolUse('jutaku-loan-kojo', 'toggle-tokurei');
              }}
              style={{ width: 'auto', marginTop: 3 }}
            />
            子育て世帯・若者夫婦世帯にあたる（入居年の12月31日時点で、40歳未満で配偶者がいる／40歳以上で配偶者が40歳未満／19歳未満の扶養親族がいる、のいずれか）
          </label>
        </div>

        {showRedZone && (
          <div className="field">
            <label style={checkboxStyle}>
              <input
                type="checkbox"
                checked={redZone}
                onChange={(e) => setRedZone(e.target.checked)}
                style={{ width: 'auto', marginTop: 3 }}
              />
              災害レッドゾーン（土砂災害特別警戒区域・地すべり防止区域・急傾斜地崩壊危険区域・浸水被害防止区域・災害危険区域）にある（特定建替えを除く）
            </label>
          </div>
        )}

        <div className="field">
          <label htmlFor="floorArea">床面積（㎡）</label>
          <input
            id="floorArea"
            type="text"
            inputMode="decimal"
            value={floorArea}
            onChange={(e) => setFloorArea(e.target.value)}
          />
          <p className="hint">
            登記事項証明書の床面積。マンションは専有部分で見ます。40㎡以上50㎡未満のときは、合計所得金額
            {formatMan(INCOME_LIMIT_SMALL)}以下が条件になります。
          </p>
        </div>

        <div className="field">
          <label htmlFor="balance">年末の住宅ローン残高（円）</label>
          <input
            id="balance"
            type="text"
            inputMode="numeric"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
          />
          <p className="hint">
            金融機関から届く「住宅取得資金に係る借入金の年末残高等証明書」の額。住宅の取得対価のほうが少ないときは、そちらの額で計算します。
          </p>
        </div>

        <div className="field">
          <label htmlFor="totalIncome">その年の合計所得金額（円）</label>
          <input
            id="totalIncome"
            type="text"
            inputMode="numeric"
            value={totalIncome}
            onChange={(e) => setTotalIncome(e.target.value)}
          />
          <p className="hint">
            給与だけなら「給与所得控除を引いたあと」の額（源泉徴収票の「給与所得控除後の金額」）。
            {formatMan(INCOME_LIMIT)}を超える年は、その年だけ控除を受けられません。
          </p>
        </div>

        <details style={{ margin: '12px 0' }}>
          <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)' }}>
            実際に戻る額まで出す（所得税額と課税総所得金額等を入れる）
          </summary>
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor="incomeTax">その年の所得税額（円）</label>
            <input
              id="incomeTax"
              type="text"
              inputMode="numeric"
              value={incomeTax}
              onChange={(e) => setIncomeTax(e.target.value)}
              placeholder="源泉徴収票の「源泉徴収税額」"
            />
            <p className="hint">
              住宅ローン控除を引く前の所得税額です。空欄のままなら、控除額までを出して「戻る額」は出しません。
            </p>
          </div>
          <div className="field">
            <label htmlFor="taxableIncomeTax">所得税の課税総所得金額等（円）</label>
            <input
              id="taxableIncomeTax"
              type="text"
              inputMode="numeric"
              value={taxableIncomeTax}
              onChange={(e) => setTaxableIncomeTax(e.target.value)}
              placeholder="住民税の決定通知書の「課税総所得金額」"
            />
            <p className="hint">
              住民税から引ける額の上限（この額の5%・最大{formatYen(RESIDENT_CAP_MAX)}
              ）を出すのに使います。空欄なら
              {formatYen(RESIDENT_CAP_FULL_AT)}以上とみなし、上限いっぱいで見積もります。
            </p>
          </div>
        </details>

        {/* ---- 結果。「適用できるか」を金額より先に出す ---- */}
        {result === null ? (
          <p className="hint">床面積・年末残高・合計所得金額を入れてください（0以上の数）。</p>
        ) : !result.eligible ? (
          <div
            className="panel"
            style={{ background: 'var(--warn-bg)', borderColor: 'var(--warn-border)' }}
          >
            <div className="metric">
              <span className="label">この条件では</span>
              <span className="value" style={{ fontSize: 'var(--fs-lg)', color: 'var(--danger-fg)' }}>
                控除を受けられません
              </span>
            </div>
            <ul className="hint" style={{ marginTop: 6, paddingLeft: '1.2em' }}>
              {result.reasons.map((reason) => (
                <li key={reason}>{INELIGIBLE_MESSAGE[reason]}</li>
              ))}
            </ul>
            {result.reasons.includes('no-period') && showTransitional && !transitional && (
              <p className="hint" style={{ marginTop: 6 }}>
                {transitionalLabel(grade)}住宅なら、経過措置で借入限度額2,000万円・控除期間10年の控除を受けられます。上のチェックを入れてみてください。
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="panel">
              <div className="metric">
                <span className="label">
                  {formatEra(year)}分の控除額（年末残高{formatYen(result.cappedBalance)}×0.7%）
                </span>
                <span className="value" style={{ fontSize: 'var(--fs-lg)' }}>
                  {formatYen(result.annualCredit)}
                </span>
              </div>
              <p className="hint" style={{ marginTop: 4 }}>
                借入限度額は<strong>{formatMan(result.limit)}</strong>、控除期間は
                <strong>{result.years}年</strong>です。
                {result.cappedByLimit && (
                  <>
                    {' '}
                    年末残高が借入限度額を超えているので、
                    {formatMan(result.limit)}で頭打ちになっています。
                  </>
                )}
                {result.tokureiApplied && (
                  <>
                    {' '}
                    子育て世帯・若者夫婦世帯への上乗せで、{formatMan(result.limitBase)}から
                    {formatMan(result.limit)}に上がっています。
                  </>
                )}
                {result.transitionalApplied && (
                  <> 建築確認の時期による経過措置で、2,000万円・10年の適用になっています。</>
                )}
              </p>
              {result.tokureiBlockedBySmallArea && (
                <p className="hint" style={{ marginTop: 4 }}>
                  床面積が40㎡以上50㎡未満なので、令和8年1月1日以降の入居では子育て世帯・若者夫婦世帯への上乗せを使えません（借入限度額は上乗せ前の
                  {formatMan(result.limit)}）。
                </p>
              )}
            </div>

            <div className="panel quiet">
              <dl className="kv">
                <div>
                  <dt>控除期間を通じた控除額の上限</dt>
                  <dd>
                    <strong>{formatYen(result.maxTotal)}</strong>
                  </dd>
                </div>
                <div>
                  <dt>1年あたりの上限</dt>
                  <dd>
                    {formatYen(result.annualCap)} × {result.years}年
                  </dd>
                </div>
              </dl>
              <p className="hint" style={{ marginTop: 6 }}>
                <strong>これは上限であって、この額が戻るわけではありません。</strong>
                ローンの残高は毎年減っていくので、実際の控除額は年を追うごとに小さくなります。
              </p>
            </div>

            {/* ---- 実際に戻る額。ここが誤解の最頻出点 ---- */}
            {result.refund === null ? (
              <p className="hint">
                上の「実際に戻る額まで出す」に所得税額を入れると、
                <strong>控除額のうち実際にいくら戻るか</strong>まで出ます。
              </p>
            ) : (
              <div className="panel">
                <div className="metric">
                  <span className="label">実際に戻る額（所得税＋住民税）</span>
                  <span className="value" style={{ fontSize: 'var(--fs-lg)' }}>
                    {formatYen(result.refund.used)}
                  </span>
                </div>
                <dl className="kv" style={{ marginTop: 8 }}>
                  <div>
                    <dt>所得税から引かれる額</dt>
                    <dd>{formatYen(result.refund.fromIncomeTax)}</dd>
                  </div>
                  <div>
                    <dt>住民税から引かれる額</dt>
                    <dd>
                      {formatYen(result.refund.fromResidentTax)}
                      <span className="hint">（上限 {formatYen(result.residentCap)}）</span>
                    </dd>
                  </div>
                  <div>
                    <dt>引ききれずに切り捨てになる額</dt>
                    <dd>
                      <strong>{formatYen(result.refund.wasted)}</strong>
                    </dd>
                  </div>
                </dl>
                <p className="hint" style={{ marginTop: 6 }}>
                  住宅ローン控除は<strong>納めた税金から引く仕組み</strong>なので、
                  もともと納めている額より多くは戻りません。
                  {result.refund.wasted > 0 && (
                    <>
                      {' '}
                      この条件では控除額{formatYen(result.annualCredit)}のうち
                      {formatYen(result.refund.wasted)}が使えずに切り捨てになります。
                    </>
                  )}
                  {result.residentCapAssumed && (
                    <>
                      {' '}
                      課税総所得金額等が未入力なので、住民税側の上限は
                      {formatYen(RESIDENT_CAP_MAX)}（課税総所得金額等が
                      {formatYen(RESIDENT_CAP_FULL_AT)}以上の場合）として計算しています。
                    </>
                  )}
                </p>
              </div>
            )}

            {/* ---- 改正前後の比較 ---- */}
            <div className="panel quiet">
              <h3 style={{ fontSize: '1rem', margin: '0 0 6px' }}>
                令和7年に入居していた場合（改正前）との比較
              </h3>
              {before.years === 0 ? (
                <p className="hint">
                  {houseKindLabel(kind)}の{ecoGradeLabel(grade)}
                  は、令和7年入居でも控除の対象外でした。
                </p>
              ) : (
                <>
                  <dl className="kv">
                    <div>
                      <dt>借入限度額</dt>
                      <dd>
                        {formatMan(beforeLimit)} → <strong>{formatMan(result.limit)}</strong>
                      </dd>
                    </div>
                    <div>
                      <dt>控除期間</dt>
                      <dd>
                        {before.years}年 → <strong>{result.years}年</strong>
                      </dd>
                    </div>
                  </dl>
                  <p className="hint" style={{ marginTop: 6 }}>
                    {result.limit > beforeLimit || result.years > before.years
                      ? '令和8年度税制改正で条件がよくなった区分です。'
                      : result.limit < beforeLimit
                        ? '借入限度額は令和7年入居より下がっています。'
                        : '令和7年入居と同じ条件です。'}
                    {kind === 'existing' && result.years > before.years && (
                      <>
                        {' '}
                        既存住宅の省エネ性能が高いものは、控除期間が10年から13年に拡充されました。
                      </>
                    )}
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* ================= 早見表 ================= */}
      <div className="card">
        <h2 style={{ fontSize: '1.1rem', marginTop: 0 }}>借入限度額の早見表（令和8年〜令和12年入居）</h2>
        <p className="hint">
          入居年・住宅の種類・世帯の3つで決まるので、
          <strong>世帯はボタンで切り替え</strong>にして表から外しています。
        </p>
        <div className="field-row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <button
            type="button"
            onClick={() => setTableTokurei(false)}
            aria-pressed={!tableTokurei}
            style={{ fontWeight: !tableTokurei ? 700 : 400 }}
          >
            一般の世帯
          </button>
          <button
            type="button"
            onClick={() => setTableTokurei(true)}
            aria-pressed={tableTokurei}
            style={{ fontWeight: tableTokurei ? 700 : 400 }}
          >
            子育て世帯・若者夫婦世帯
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>住宅の種類</th>
                <th>省エネの区分</th>
                <th>令和8・9年入居</th>
                <th>令和10〜12年入居</th>
                <th>控除期間</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const early = cellLimit(row.early, tableTokurei);
                const late = cellLimit(row.late, tableTokurei);
                return (
                  <tr key={`${row.kind}-${row.grade}`}>
                    <th scope="row">{houseKindLabel(row.kind)}</th>
                    <td style={{ textAlign: 'left' }}>{ecoGradeLabel(row.grade)}</td>
                    <td>{row.early.years === 0 ? '対象外' : formatMan(early)}</td>
                    <td>{row.late.years === 0 ? '対象外' : formatMan(late)}</td>
                    <td>
                      {/* 年で控除期間が変わる区分は無い（変わるのは「対象になるか」だけ）
                          ので、0年でないほうの年数を出せばよい */}
                      {row.early.years === 0 && row.late.years === 0
                        ? '—'
                        : `${Math.max(row.early.years, row.late.years)}年`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="hint">
          「対象外」の欄でも、新築の省エネ基準適合住宅とその他の住宅は、建築確認の時期によっては経過措置で借入限度額2,000万円・控除期間10年の控除を受けられます。
          {tableTokurei && (
            <>
              {' '}
              床面積が40㎡以上50㎡未満の認定住宅等は、令和8年1月1日以降の入居では上乗せを使えません（一般の世帯の額になります）。
            </>
          )}
        </p>
      </div>
    </>
  );
}
