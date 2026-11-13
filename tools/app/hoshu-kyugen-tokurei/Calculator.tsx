'use client';

import { useEffect, useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import { parseDate } from '@/lib/date-parts';
import { PREFECTURES, type Prefecture } from '@/lib/shaho-ryoritsu';
import { standardMonthly } from '@/lib/shaho-grades';
import {
  addMonthsYm,
  deductedIn,
  DEFAULT_TOKUREI_MONTHS,
  evaluate,
  healthGrades,
  isPreschoolIn,
  isUnder3In,
  REASON_LABELS,
  rowOfStandard,
  specialThresholds,
  ymJa,
  type Adjustment,
  type Premiums,
  type Reason,
  type TokureiResult,
} from '@/lib/hoshu-kyugen-tokurei';

const yen = (n: number) => `${Math.round(n).toLocaleString('ja-JP')}円`;
const num = (s: string) => Math.max(0, Number(s) || 0);
const pad = (n: number) => String(n).padStart(2, '0');
const nextMonthOf = (d: Date) => addMonthsYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`, 1);

const SLUG = 'hoshu-kyugen-tokurei';
const TOP_THRESHOLD = specialThresholds(healthGrades()).top;
const TOP_GRADE = healthGrades()[healthGrades().length - 1][0];

/**
 * 報酬急減の特例改定の計算UI。ロジックは lib/hoshu-kyugen-tokurei.ts の純関数。
 *
 * 最初に見せる入力は 理由・従前の標準報酬月額・初月の報酬総額・初月 の4つだけ。
 * 子の生年月日・認定のチェックは理由を選んだときだけ、残りは「詳しい条件」に畳む（仕様「入力」）。
 *
 * @param buildDate ビルド時刻（ISO文字列）。初月の既定（今日の翌月）は、ハイドレーション直後は
 *   この固定値、マウント後に画面を開いた日へ差し替える
 */
export default function Calculator({ buildDate }: { buildDate: string }) {
  const [reason, setReason] = useState<Reason>('ryoyo-honnin');
  const [childBirth, setChildBirth] = useState('');
  const [kaigoNintei, setKaigoNintei] = useState(true);
  const [formerMode, setFormerMode] = useState<'standard' | 'pay'>('standard');
  const [formerText, setFormerText] = useState('300000');
  const [formerTop, setFormerTop] = useState(false);
  const [payText, setPayText] = useState('220000');
  const [firstMonth, setFirstMonth] = useState(() => nextMonthOf(new Date(buildDate)));
  const [adjustment, setAdjustment] = useState<Adjustment>('zangyo');
  const [baseDaysText, setBaseDaysText] = useState('20');
  const [shortTime, setShortTime] = useState(false);
  const [lasts, setLasts] = useState(true);
  const [ageText, setAgeText] = useState('35');
  const [insurer, setInsurer] = useState<Prefecture | 'kumiai'>('東京都');
  const [kumiaiRateText, setKumiaiRateText] = useState('9.5');
  const [retires, setRetires] = useState(false);
  const [under3Insured, setUnder3Insured] = useState(false);
  const [monthsText, setMonthsText] = useState(String(DEFAULT_TOKUREI_MONTHS));
  const [ikujiBaseText, setIkujiBaseText] = useState('');

  useEffect(() => {
    setFirstMonth(nextMonthOf(new Date()));
  }, []);

  const formerInput = num(formerText);
  const formerStandard = formerMode === 'standard' ? formerInput : standardMonthly(formerInput);
  const formerIsTop = rowOfStandard(healthGrades(), formerStandard).row[0] === TOP_GRADE;
  const birth = reason === 'ikuji' ? parseDate(childBirth) : null;
  const validMonth = /^\d{4}-\d{2}$/.test(firstMonth);
  const childUnder3 =
    birth !== null && validMonth && isPreschoolIn(birth, firstMonth) && isUnder3In(birth, addMonthsYm(firstMonth, 1));

  const ready = formerInput > 0 && payText !== '' && validMonth;
  const result = ready
    ? evaluate({
        reason,
        childBirth: birth,
        kaigoNintei,
        formerStandard,
        formerPay: formerMode === 'pay' ? formerInput : formerIsTop && formerTop ? TOP_THRESHOLD : null,
        firstMonthPay: num(payText),
        firstMonth,
        baseDays: num(baseDaysText),
        shortTime,
        lastsThreeMonths: lasts,
        retiresNextMonth: retires,
        insuredUnder3Months: under3Insured,
        adjustment,
        age: num(ageText),
        prefecture: insurer === 'kumiai' ? null : insurer,
        kumiaiHealthRate: num(kumiaiRateText) / 100,
        tokureiMonths: num(monthsText),
        ikujiBaseStandard: ikujiBaseText === '' ? null : num(ikujiBaseText),
      })
    : null;

  const track = () => trackToolUse(SLUG, 'calculate');
  const small = { display: 'block', fontWeight: 400 } as const;

  return (
    <div className="card">
      <div style={{ display: 'grid', gap: 14 }}>
        <label>
          就労調整の理由
          <select value={reason} onChange={(e) => setReason(e.target.value as Reason)}>
            {(Object.keys(REASON_LABELS) as Reason[]).map((r) => (
              <option key={r} value={r}>
                {REASON_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        {reason === 'ikuji' && (
          <label>
            子の生年月日
            <span className="hint" style={small}>
              就学前か（6歳に達した日以後の最初の3月31日まで）と、3歳未満かを判定します
            </span>
            <input type="date" value={childBirth} onChange={(e) => setChildBirth(e.target.value)} onBlur={track} />
          </label>
        )}
        {reason === 'kaigo' && (
          <label style={{ fontWeight: 400 }}>
            <input type="checkbox" checked={kaigoNintei} onChange={(e) => setKaigoNintei(e.target.checked)} />{' '}
            家族が要介護・要支援の認定を受けている
          </label>
        )}
        <label>
          {formerMode === 'standard' ? '従前の標準報酬月額（円）' : '従前の月の報酬の目安（円）'}
          <span className="hint" style={small}>
            {formerMode === 'standard'
              ? '給与明細や「標準報酬決定通知書」に書かれた額（健康保険）'
              : `等級表で標準報酬月額 ${yen(formerStandard)} として計算します`}
            {' '}
            <button
              type="button"
              onClick={() => setFormerMode(formerMode === 'standard' ? 'pay' : 'standard')}
              style={{ background: 'none', border: 0, padding: 0, color: 'var(--brand)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}
            >
              {formerMode === 'standard' ? '分からなければ、月の報酬の目安から出す' : '標準報酬月額を直接入れる'}
            </button>
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            value={formerText}
            onChange={(e) => setFormerText(e.target.value)}
            onBlur={track}
          />
        </label>
        {formerMode === 'standard' && formerIsTop && (
          <label style={{ fontWeight: 400 }}>
            <input type="checkbox" checked={formerTop} onChange={(e) => setFormerTop(e.target.checked)} />{' '}
            従前の報酬月額は {yen(TOP_THRESHOLD)} 以上だった（{TOP_GRADE}級から1つ下がっても2等級として扱う特則）
          </label>
        )}
        <label>
          報酬減となった初月の報酬の総額（円）
          <span className="hint" style={small}>
            残業代・通勤手当などを含めた、その月に受けた報酬の総額
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            value={payText}
            onChange={(e) => setPayText(e.target.value)}
            onBlur={track}
          />
        </label>
        <label>
          報酬減となった初月
          <span className="hint" style={small}>
            減った報酬を受けた月（2027年1月以降が対象）
          </span>
          <input type="month" value={firstMonth} onChange={(e) => setFirstMonth(e.target.value)} onBlur={track} />
        </label>
        {childUnder3 && (
          <label>
            養育を始めた月の前月の標準報酬月額（円・任意）
            <span className="hint" style={small}>
              養育特例で年金の計算に使う額。空欄なら従前の標準報酬月額と同じとみなします（第2子・復職後の昇給などで違うことがあります）
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              value={ikujiBaseText}
              placeholder={String(formerStandard)}
              onChange={(e) => setIkujiBaseText(e.target.value)}
            />
          </label>
        )}

        <details>
          <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)', fontWeight: 600 }}>
            詳しい条件（支払基礎日数・年齢・健康保険など）
          </summary>
          <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
            <label>
              就労調整の中身
              <span className="hint" style={small}>
                通常の改定と比べて何か月早く下がるかが変わります
              </span>
              <select value={adjustment} onChange={(e) => setAdjustment(e.target.value as Adjustment)}>
                <option value="zangyo">残業の抑制だけ（基本給・手当の単価は変わらない）</option>
                <option value="jitan">所定労働時間の短縮など（固定的賃金が変わる）</option>
              </select>
            </label>
            <label>
              初月の支払基礎日数
              <span className="hint" style={small}>
                就労調整で勤務しなかった日も、所定労働日数が変わっていなければ数えます
              </span>
              <input type="number" inputMode="numeric" min={0} max={31} value={baseDaysText} onChange={(e) => setBaseDaysText(e.target.value)} />
            </label>
            <label style={{ fontWeight: 400 }}>
              <input type="checkbox" checked={shortTime} onChange={(e) => setShortTime(e.target.checked)} />{' '}
              短時間労働者（労働時間・日数が正社員の4分の3未満）
            </label>
            <label style={{ fontWeight: 400 }}>
              <input type="checkbox" checked={lasts} onChange={(e) => setLasts(e.target.checked)} /> 減った状態が3か月以上続く見込み
            </label>
            <label>
              年齢
              <span className="hint" style={small}>
                40〜64歳なら介護保険料を含めます
              </span>
              <input type="number" inputMode="numeric" min={15} max={99} value={ageText} onChange={(e) => setAgeText(e.target.value)} />
            </label>
            <label>
              加入している健康保険
              <select value={insurer} onChange={(e) => setInsurer(e.target.value as Prefecture | 'kumiai')}>
                {PREFECTURES.map((p) => (
                  <option key={p} value={p}>
                    協会けんぽ（{p}）
                  </option>
                ))}
                <option value="kumiai">健康保険組合（料率を入れる）</option>
              </select>
            </label>
            {insurer === 'kumiai' && (
              <label>
                健康保険料率（%・労使合計）
                <span className="hint" style={small}>
                  介護保険料・子ども・子育て支援金を含めない率。会社と本人の合計（例 9.5）
                </span>
                <input type="number" inputMode="decimal" min={0} step={0.01} value={kumiaiRateText} onChange={(e) => setKumiaiRateText(e.target.value)} />
              </label>
            )}
            <label style={{ fontWeight: 400 }}>
              <input type="checkbox" checked={retires} onChange={(e) => setRetires(e.target.checked)} /> 初月の翌月に退職する
            </label>
            <label style={{ fontWeight: 400 }}>
              <input type="checkbox" checked={under3Insured} onChange={(e) => setUnder3Insured(e.target.checked)} />{' '}
              初月を含めて加入3か月未満
            </label>
            <label>
              特例の月数（年金・手当金の減少を数える月数）
              <input type="number" inputMode="numeric" min={1} max={120} value={monthsText} onChange={(e) => setMonthsText(e.target.value)} />
            </label>
          </div>
        </details>
      </div>

      {result ? (
        <Results r={result} />
      ) : (
        <div className="note" style={{ marginTop: 18 }}>
          従前の標準報酬月額・初月の報酬・初月を入れると結果が出ます。
        </div>
      )}
    </div>
  );
}

function Results({ r }: { r: TokureiResult }) {
  const pensionShown = r.ikujiUnder3 ? r.pensionLoss.withIkuji : r.pensionLoss.withoutIkuji;
  const accelLabel = r.accel.normalKind === 'zuiji' ? '通常の随時改定' : '次の定時決定';

  return (
    <>
      {/* 要約（合否の基準：入力の直後に見えること） */}
      <div className="panel" style={{ marginTop: 18 }} aria-live="polite">
        <div className="metric">
          <span className="value" style={{ fontSize: '1.3rem' }}>
            {r.eligible ? '特例の対象になりえます' : '特例の対象外です'}
          </span>
        </div>
        {r.eligible ? (
          <ul style={{ margin: '8px 0 0', paddingLeft: '1.2em', lineHeight: 1.8 }}>
            <li>
              <strong>{ymJa(r.accel.tokureiFrom)}分から</strong>標準報酬月額が {yen(r.health.formerRow[1])} →{' '}
              {yen(r.health.newRow[1])}（健保{r.health.formerRow[0]}級→{r.health.newRow[0]}級・{r.health.drop}等級の低下）
            </li>
            <li>
              保険料（本人分）が<strong style={{ fontSize: '1.15rem' }}> 月 {yen(r.firstRow.diff)} </strong>下がる
              （{accelLabel}より{r.accel.months.length}か月早く、合計 {yen(r.acceleratedTotal)}）
            </li>
            <li>
              引き換えに老齢厚生年金が<strong> 年 {yen(pensionShown)} </strong>減る（{r.pensionLoss.months}か月続いた場合・生涯毎年）
              {r.ikujiUnder3 && '：養育特例を併せて出した場合'}
            </li>
          </ul>
        ) : (
          <ul style={{ margin: '8px 0 0', paddingLeft: '1.2em', lineHeight: 1.8 }}>
            {r.rejects.map((x) => (
              <li key={x.code}>{x.message}</li>
            ))}
          </ul>
        )}
        <p className="hint" style={{ marginTop: 8, lineHeight: 1.7 }}>
          {r.eligible
            ? '事業主の届出と、あなたの書面の同意が要ります。判定は目安で、最終的には事業主・年金事務所が判断します。'
            : '判定は目安で、最終的には事業主・年金事務所が判断します。'}
        </p>
      </div>

      {!r.eligible && (
        <>
          <h3 style={{ marginTop: 22 }}>通常の改定なら</h3>
          <ul style={{ lineHeight: 1.8 }}>
            <li>
              固定的賃金（基本給・手当の単価）が変わって、3か月の平均で2等級以上下がれば、随時改定で
              {ymJa(addMonthsYm(r.accel.tokureiFrom, 2))}分から下がりえます
            </li>
            <li>残業が減っただけなら随時改定は起きず、次の定時決定（9月分から）まで標準報酬月額は変わりません</li>
          </ul>
        </>
      )}

      {r.eligible && <Details r={r} />}

      {r.notes.length > 0 && (
        <ul className="hint" style={{ marginTop: 14, lineHeight: 1.7, paddingLeft: '1.2em' }}>
          {r.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </>
  );
}

function PremiumTable({ before, after }: { before: Premiums; after: Premiums }) {
  const rows: [string, number, number][] = [
    ['健康保険', before.health, after.health],
    ['介護保険', before.kaigo, after.kaigo],
    ['子ども・子育て支援金', before.shienkin, after.shienkin],
    ['厚生年金', before.pension, after.pension],
    ['合計', before.total, after.total],
  ];
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ whiteSpace: 'nowrap' }}>
        <thead>
          <tr>
            <th></th>
            <th>改定前</th>
            <th>改定後</th>
            <th>差額</th>
          </tr>
        </thead>
        <tbody>
          {rows
            .filter(([label, b]) => label !== '介護保険' || b > 0)
            .map(([label, b, a]) => (
              <tr key={label}>
                <th scope="row" style={{ textAlign: 'left' }}>
                  {label === '合計' ? <strong>{label}</strong> : label}
                </th>
                <td>{yen(b)}</td>
                <td>{yen(a)}</td>
                <td>−{yen(b - a)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function Details({ r }: { r: TokureiResult }) {
  const p = r.pensionLoss;
  const months = r.accel.months;
  return (
    <>
      <h3 style={{ marginTop: 22 }}>いつから下がるか</h3>
      <p style={{ lineHeight: 1.8 }}>
        報酬減の初月の翌月、<strong>{ymJa(r.accel.tokureiFrom)}分</strong>の標準報酬月額から改定されます
        （保険料を翌月の給与から引く多くの会社では、<strong>{ymJa(deductedIn(r.accel.tokureiFrom))}の給与</strong>から天引きが下がります）。
        {r.accel.normalKind === 'zuiji'
          ? `通常の随時改定なら${ymJa(r.accel.normalFrom)}分からなので、${months.length}か月早まります。`
          : `残業の抑制だけなら随時改定は起きず、次の定時決定（${ymJa(r.accel.normalFrom)}分から）まで下がらないので、${months.length}か月早まります。`}
        {r.accel.teijiSkipped && ' 特例の改定が7〜9月分になるので、その年の定時決定の対象外になり、比較相手は翌年の定時決定です。'}
        {r.accel.teijiMixed &&
          ' 初月が5月なので、その年の定時決定（4〜6月の平均）に減る前の4月の報酬が混ざり、9月分からも一部しか下がらないことがあります。'}
      </p>

      <h3 style={{ marginTop: 22 }}>毎月の保険料（本人分・{ymJa(r.accel.tokureiFrom)}分）</h3>
      <PremiumTable before={r.firstRow.before} after={r.firstRow.after} />
      <p className="hint" style={{ marginTop: 8, lineHeight: 1.7 }}>
        厚生年金の標準報酬月額は {yen(p.formerStd)} → {yen(p.newStd)}（厚年{r.pension.formerRow[0]}級→
        {r.pension.newRow[0]}級）。早く下がる{months.length}か月（{ymJa(months[0])}〜{ymJa(months[months.length - 1])}分）の合計は
        <strong> {yen(r.acceleratedTotal)}</strong>（その月ごとの料率で計算）。
      </p>

      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)', fontWeight: 600 }}>
          事業主の負担（人事担当の方向け）
        </summary>
        <PremiumTable before={r.firstRow.employerBefore} after={r.firstRow.employerAfter} />
        <p className="hint" style={{ marginTop: 8 }}>
          早く下がる{months.length}か月の事業主負担の減少は合計 {yen(r.acceleratedEmployerTotal)}（目安）。
        </p>
      </details>

      <h3 style={{ marginTop: 22 }}>引き換えに減るもの</h3>
      <dl className="kv">
        <div>
          <dt>老齢厚生年金（報酬比例部分）</dt>
          <dd>
            {r.ikujiUnder3 && p.withIkuji < p.withoutIkuji ? (
              <>
                <s>年 {yen(p.withoutIkuji)}</s> → 年 {yen(p.withIkuji)} 減
              </>
            ) : (
              <>年 {yen(p.withoutIkuji)} 減</>
            )}
            <span className="hint" style={{ display: 'block' }}>
              ({yen(p.formerStd)} − {yen(p.newStd)}) × 5.481/1000 × {p.months}か月。生涯毎年
            </span>
          </dd>
        </div>
        <div>
          <dt>傷病手当金・出産手当金（日額）</dt>
          <dd>
            {yen(r.allowance.without)} → {yen(r.allowance.with)}
            <span className="hint" style={{ display: 'block' }}>
              支給開始日以前12か月のうち{r.allowance.monthsInAverage}か月が特例の額になったとき
            </span>
          </dd>
        </div>
      </dl>
      {r.ikujiUnder3 && (
        <div className="note" style={{ marginTop: 12, lineHeight: 1.7 }}>
          <strong>
            3歳未満の子を養育しているので、「厚生年金保険 養育期間標準報酬月額特例申出書」を併せて出せば、年金は養育を始めた前月の標準報酬月額（
            {yen(p.ikujiBase ?? p.formerStd)}）で計算されます。
          </strong>
          {p.ikujiMonths < p.months && ` 子が3歳になる月からは効かないので、守られるのは${p.months}か月のうち${p.ikujiMonths}か月です。`}
          {p.ikujiBase !== null && p.ikujiBase < p.formerStd && ' 基準の額が従前より低いので、その差の分は減ります。'}
          <br />
          守られるのは厚生年金だけで、傷病手当金・出産手当金は守られません。申出書は本人が事業主を通して出します。
        </div>
      )}

      <h3 style={{ marginTop: 22 }}>戻すときと手続き</h3>
      <ul style={{ lineHeight: 1.8 }}>
        <li>時短・残業の抑制が終わって2等級以上上がったら、事業主が速やかに届け出て、報酬が増えた初月の翌月から戻ります</li>
        <li>事業主：被保険者報酬月額変更届（特例改定用）＋申立書兼同意書（健保組合にも同時に）</li>
        <li>本人：書面の同意{r.ikujiUnder3 && '・養育期間標準報酬月額特例申出書'}</li>
        <li>保存する書類：出勤簿・賃金台帳・診断書・子の年齢や要介護認定の証明などを届出から2年間</li>
      </ul>
    </>
  );
}
