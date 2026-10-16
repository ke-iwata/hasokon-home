'use client';

import { useState, type ReactNode } from 'react';
import {
  FIRST_RESIDENT_FISCAL_YEAR,
  FIRST_TAX_YEAR,
  FORM_PAGE,
  RESIDENT_EXEMPT_LIMIT,
  asksEBook,
  asksFilingR8,
  judge,
  type AoiroInput,
  type Bookkeeping,
  type EBook,
  type FilingR8,
  type FilingR9,
  type IncomeKind,
  type ReasonR9,
  type Upgrade,
} from '@/lib/aoiro-shinkoku-kojo';
import { trackToolUse } from '@/lib/analytics';

const yen = (v: number) => `${Math.round(v).toLocaleString('ja-JP')}円`;
const man = (v: number) => `${(Math.round(v / 1000) / 10).toLocaleString('ja-JP')}万円`;

/** 結果の下に出す理由の1文 */
const REASON_TEXT: Record<ReasonR9, string> = {
  top: '複式簿記で期限内に e-Tax で申告し、優良な電子帳簿かデジタルシームレス保存の要件を満たすので、最高の75万円です。',
  etax: '複式簿記で期限内に e-Tax で申告するので65万円です。',
  etaxUnknownEBook:
    '複式簿記で期限内に e-Tax で申告するので65万円です（優良な電子帳簿・デジタルシームレス保存の要件を満たしていれば75万円）。',
  paper: '書面申告なので、複式簿記でも上限は10万円です（令和8年分までは55万円でした）。',
  late: '期限後の申告では65万円・75万円は受けられないので10万円です（還付申告も期限までの提出が必要です）。',
  simple: '簡易簿記なので10万円です。',
  simpleOver:
    '簡易簿記で、前々年の事業・不動産の収入が1,000万円を超えるので、令和9年分から青色申告特別控除は受けられません。',
  cashBasis: '現金主義による所得計算の特例を受けているので、65万円・75万円は受けられず10万円です。',
  realEstateSmall:
    '事業的規模に満たない（業務的規模の）不動産所得は、複式簿記でも、前々年の収入が1,000万円を超えても10万円です。',
};

const UPGRADE_TEXT: Record<Upgrade['action'], string> = {
  etax: '期限内に e-Tax で申告すれば',
  eBook: `優良な電子帳簿を${FIRST_TAX_YEAR}年1月1日から付ける（またはデジタルシームレス保存）と`,
  doubleEntry: '複式簿記に切り替えて、期限内に e-Tax で申告すれば',
  stopCashBasis: '現金主義の特例をやめ、複式簿記で期限内に e-Tax で申告すれば',
};

const toYen = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Math.floor(Number(v) || 0)));

function Radios<T extends string>({
  name,
  label,
  hint,
  value,
  options,
  onChange,
}: {
  name: string;
  label: string;
  hint?: ReactNode;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend style={{ fontWeight: 700, marginBottom: 6 }}>{label}</legend>
      <div style={{ display: 'grid', gap: 4, fontSize: 'var(--fs-sm)' }}>
        {options.map((o) => (
          <label
            key={o.value}
            style={{ fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' }}
          >
            <input
              type="radio"
              name={name}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              style={{ width: 'auto' }}
            />
            {o.label}
          </label>
        ))}
      </div>
      {hint && (
        <p className="hint" style={{ marginTop: 6 }}>
          {hint}
        </p>
      )}
    </fieldset>
  );
}

export default function Calculator() {
  // 既定値は「何もしないと45万円減る」人（複式簿記・書面申告）。開いた瞬間に一番多い答えが出る
  const [kind, setKind] = useState<IncomeKind>('business');
  const [bookkeeping, setBookkeeping] = useState<Bookkeeping>('double');
  const [cashBasis, setCashBasis] = useState(false);
  const [filingR9, setFilingR9] = useState<FilingR9>('paper');
  const [eBook, setEBook] = useState<EBook>('none');
  const [priorOver, setPriorOver] = useState(false);
  const [filingR8, setFilingR8] = useState<FilingR8>('paper');
  const [income, setIncome] = useState('');
  const [otherIncome, setOtherIncome] = useState('');
  const [otherDeductions, setOtherDeductions] = useState('');

  const incomeYen = toYen(income);
  const input: AoiroInput = {
    kind,
    bookkeeping,
    cashBasis,
    filingR9,
    eBook,
    priorRevenueOver: priorOver,
    filingR8,
    incomeBeforeDeduction: incomeYen,
    otherIncome: toYen(otherIncome) ?? 0,
    otherDeductions: toYen(otherDeductions) ?? 0,
  };
  const r = judge(input);
  const showEBook = asksEBook(input);
  const showR8 = asksFilingR8(input);
  const track = () => trackToolUse('aoiro-shinkoku-kojo', 'judge');

  return (
    <div className="card">
      <div style={{ display: 'grid', gap: 16 }}>
        <Radios
          name="kind"
          label="1. 所得の種類"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'business', label: '事業所得' },
            { value: 'realEstateBusiness', label: '不動産所得（事業的規模）' },
            { value: 'realEstateSmall', label: '不動産所得（業務的規模＝事業的規模に満たない）' },
            { value: 'both', label: '事業所得と不動産所得（事業的規模）の両方' },
          ]}
          hint="事業的規模は、貸家なら5棟以上・アパートなどの貸室なら10室以上が目安です（5棟10室基準）。不動産が業務的規模で事業所得もある方は「事業所得」を選んでください。"
        />

        <Radios
          name="bookkeeping"
          label="2. 帳簿の付け方"
          value={bookkeeping}
          onChange={setBookkeeping}
          options={[
            { value: 'double', label: '複式簿記（正規の簿記。貸借対照表まで作る）' },
            { value: 'simple', label: '簡易簿記（現金出納帳・売掛帳などの簡易な帳簿）' },
          ]}
        />

        <Radios
          name="cashBasis"
          label="3. 現金主義による所得計算の特例を受けていますか"
          value={cashBasis ? 'yes' : 'no'}
          onChange={(v) => setCashBasis(v === 'yes')}
          options={[
            { value: 'no', label: 'いいえ（ふつうはこちら）' },
            { value: 'yes', label: 'はい（届出をして、入金・出金の時点で売上・経費を計上している）' },
          ]}
        />

        <Radios
          name="filingR9"
          label={`4. ${FIRST_TAX_YEAR}年分（令和9年分）の申告の方法（予定）`}
          value={filingR9}
          onChange={setFilingR9}
          options={[
            { value: 'etax', label: 'e-Tax で期限内に送信する' },
            { value: 'paper', label: '書面で期限内に提出する' },
            { value: 'late', label: '期限後になりそう' },
          ]}
          hint={`確定申告の期限は${FIRST_TAX_YEAR + 1}年3月15日です。還付申告は期限後でも出せますが、その場合の控除は10万円です（65万円・75万円は期限内の提出が必要）。`}
        />

        {showEBook && (
          <Radios
            name="eBook"
            label="5. 電子帳簿"
            value={eBook}
            onChange={setEBook}
            options={[
              { value: 'yuryo', label: `優良な電子帳簿（${FIRST_TAX_YEAR}年1月1日から付ける）` },
              { value: 'seamless', label: 'デジタルシームレス保存' },
              { value: 'none', label: 'どちらでもない' },
              { value: 'unknown', label: '分からない' },
            ]}
            hint="優良な電子帳簿は、訂正・削除の履歴が残る・帳簿どうしが相互に関連づく・日付・金額・相手方で検索できる、の3つを満たす電子帳簿です。会計ソフトがこれに当たるかは、JIIMA 認証の有無などで確かめられます。"
          />
        )}

        <Radios
          name="priorOver"
          label="6. 前々年分（2025年分）の事業・不動産の収入金額"
          value={priorOver ? 'over' : 'under'}
          onChange={(v) => setPriorOver(v === 'over')}
          options={[
            { value: 'under', label: '1,000万円以下' },
            { value: 'over', label: '1,000万円を超える' },
          ]}
          hint={
            <>
              経費を引く前の<strong>売上（収入金額）</strong>で、所得ではありません。
              {kind === 'both' && (
                <>
                  事業・不動産の<strong>どちらか一方でも</strong>1,000万円を超えていれば「超える」です（合計ではありません）。
                </>
              )}
              不動産所得で1,000万円を超えても、業務的規模なら0円にはならず10万円のままです。
            </>
          }
        />

        {showR8 && (
          <Radios
            name="filingR8"
            label={`7. ${FIRST_TAX_YEAR - 1}年分（令和8年分・今年）の申告の方法`}
            value={filingR8}
            onChange={setFilingR8}
            options={[
              { value: 'paper', label: '書面で提出する（55万円）' },
              { value: 'etax', label: 'e-Tax で送信する（65万円）' },
              { value: 'yuryo', label: '優良な電子帳簿を付けている（65万円）' },
            ]}
            hint="比べる相手（今年の控除額）を出すためだけに使います。"
          />
        )}

        <details>
          <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)' }}>
            税額の差も見る（任意）
          </summary>
          <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
            <label>
              青色申告特別控除を引く前の所得（円）
              <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
                事業所得・不動産所得の合計（収入 − 必要経費 − 青色事業専従者給与）。控除はこの額が上限です
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={10000}
                value={income}
                placeholder="例：3100000"
                onChange={(e) => setIncome(e.target.value)}
                onBlur={track}
              />
            </label>
            <label>
              給与所得など、ほかの所得（円）
              <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
                会社員の副業などで給与がある方は、源泉徴収票の「給与所得控除後の金額」。給与の分で税率の帯が上がるので、入れると税額の目安が実際に近くなります
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={10000}
                value={otherIncome}
                placeholder="例：0"
                onChange={(e) => setOtherIncome(e.target.value)}
              />
            </label>
            <label>
              基礎控除を除く所得控除の合計（円）
              <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
                社会保険料控除・小規模企業共済等掛金控除などの合計。基礎控除は所得から自動で引きます（所得税と住民税で額が違うため）
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={10000}
                value={otherDeductions}
                placeholder="例：0"
                onChange={(e) => setOtherDeductions(e.target.value)}
              />
            </label>
          </div>
        </details>
      </div>

      <div className="panel" style={{ marginTop: 18, textAlign: 'center', lineHeight: 1.7 }}>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
          {FIRST_TAX_YEAR}年分（令和9年分）の青色申告特別控除
        </div>
        <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, color: 'var(--accent)' }}>
          {r.r9 === 0 && !r.cappedByIncome ? '0円（受けられない）' : man(r.r9)}
        </div>
        <div style={{ fontSize: 'var(--fs-sm)' }}>
          {r.cappedByIncome
            ? `控除前の所得（${yen(r.r9)}）が上限なので、控除は${yen(r.r9)}です。`
            : REASON_TEXT[r.reason]}
        </div>
        <div style={{ fontSize: 'var(--fs-sm)', marginTop: 6 }}>
          令和8年分の{man(r.r8)}から
          <strong>
            {r.change === 0
              ? '変わりません'
              : r.change < 0
                ? `${man(-r.change)}減ります`
                : `${man(r.change)}増えます`}
          </strong>
        </div>
      </div>

      {r.tax && (
        <>
          <h3 style={{ marginTop: 22 }}>税額の増減の目安</h3>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>令和8年分の控除</th>
                <th>令和9年分の控除</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ textAlign: 'left' }}>所得税の課税所得</td>
                <td>{yen(r.tax.before.taxableIncome)}</td>
                <td>{yen(r.tax.after.taxableIncome)}</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'left' }}>住民税の課税所得</td>
                <td>{yen(r.tax.before.residentTaxable)}</td>
                <td>{yen(r.tax.after.residentTaxable)}</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'left' }}>所得税（復興特別所得税を含む）</td>
                <td>{yen(r.tax.before.incomeTax)}</td>
                <td>{yen(r.tax.after.incomeTax)}</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'left' }}>住民税所得割（10% − 調整控除）</td>
                <td>{r.tax.before.residentExempt ? '0円（非課税）' : yen(r.tax.before.residentTax)}</td>
                <td>{r.tax.after.residentExempt ? '0円（非課税）' : yen(r.tax.after.residentTax)}</td>
              </tr>
            </tbody>
          </table>
          <p style={{ marginTop: 8 }}>
            同じ所得なら、控除の変化で税額は合計
            <strong>
              {r.tax.total === 0
                ? '変わりません'
                : r.tax.total > 0
                  ? `約${yen(r.tax.total)}増えます`
                  : `約${yen(-r.tax.total)}減ります`}
            </strong>
            （所得税は{FIRST_TAX_YEAR}年分、住民税は{FIRST_RESIDENT_FISCAL_YEAR}年度分）。
          </p>
          <p className="hint">
            所得税は両方の課税所得で速算表を通しで計算しています（控除の差で税率の帯をまたぐと、差額×税率より大きく変わります）。
            基礎控除は所得税・住民税それぞれの額（住民税は43万円）を、控除の前後の合計所得で取り直しています。
            住民税は、所得が単身の非課税の線（総所得金額等{man(RESIDENT_EXEMPT_LIMIT)}）以下なら所得割0円としています（扶養のある方は線が上がります）。
            生命保険料控除など住民税で額が違う控除は、同じ額で入れた概算です。
          </p>
        </>
      )}

      {r.upgrades.length > 0 && (
        <>
          <h3 style={{ marginTop: 22 }}>1つ上の区分に上がるには</h3>
          <ul>
            {r.upgrades.map((u) => (
              <li key={u.action}>
                {UPGRADE_TEXT[u.action]} <strong>{man(u.amount)}</strong>（＋{man(u.gain)}
                {u.taxSaving !== undefined && u.taxSaving > 0 && `、税額で約${yen(u.taxSaving)}`}）
              </li>
            ))}
          </ul>
          {r.upgrades.some((u) => u.needsFromJan1) && (
            <div className="note" style={{ lineHeight: 1.7 }}>
              <strong>注意：優良な電子帳簿は年の途中からでは間に合いません</strong>
              <br />
              75万円を優良な電子帳簿で受けるには、その年の仕訳帳・総勘定元帳を<strong>課税期間の最初（{FIRST_TAX_YEAR}年1月1日）から</strong>
              要件を満たして付けている必要があります。{FIRST_TAX_YEAR}年分で受けるなら、{FIRST_TAX_YEAR - 1}年12月31日までに帳簿の付け方を決めてください。
              届出書は{FIRST_TAX_YEAR + 1}年3月15日（確定申告期限）までに税務署へ出します（様式は
              <a href={FORM_PAGE.url} target="_blank" rel="nofollow noopener noreferrer">
                {FORM_PAGE.label}
              </a>
              ）。
            </div>
          )}
        </>
      )}

      {r.reason === 'top' && eBook === 'yuryo' && (
        <div className="note" style={{ lineHeight: 1.7 }}>
          <strong>確認：{FIRST_TAX_YEAR}年1月1日から付けていますか</strong>
          <br />
          優良な電子帳簿で75万円を受けるには、課税期間の最初から要件を満たして帳簿を付けている必要があります。
          すでに優良な電子帳簿で65万円を受けている方は、届出書を出し直す必要はありません。
        </div>
      )}

      <p className="hint" style={{ marginTop: 12 }}>
        控除額は国税庁の資料と租税特別措置法25条の2にもとづく判定です。実際に受けられるかは、
        帳簿の内容や届出の状況で変わります。最終的には税務署か税理士に確認してください。
        国民健康保険料（自治体ごとに計算）と個人事業税（青色申告特別控除が効かない）は計算していません。
      </p>
    </div>
  );
}
