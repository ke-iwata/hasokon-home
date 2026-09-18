'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  NO_DECLARATION_RATE,
  TEN_YEAR_RULE_FROM,
  calcTaishokukin,
  type RetirementKind,
  type TaishokukinInput,
} from '@/lib/taishokukin';

const yen = (v: number) => `${Math.round(v).toLocaleString('ja-JP')}円`;
/** 円 → 「480万円」。控除額は1万円単位なので万円で見せる */
const man = (v: number) => `${(Math.round(v / 1000) / 10).toLocaleString('ja-JP')}万円`;

const num = (v: string) => Math.max(0, Number(v) || 0);

/** 年月 → 「2002年4月」。短縮後の期間を画面に出すのに使う */
const ymLabel = (ym?: { year: number; month: number }) =>
  ym ? `${ym.year}年${ym.month}月` : '';

/** 先にiDeCoの一時金を受け取ったか */
type PriorChoice = 'no' | 'yes' | 'unknown';

const KINDS: { value: RetirementKind; label: string }[] = [
  { value: 'general', label: '一般（役員等以外）' },
  { value: 'officer', label: '役員等（法人の役員・議員・公務員など）' },
  { value: 'disability', label: '障害者になったことが直接の原因の退職' },
];

const rowLabel = { textAlign: 'left' as const };

/** 年月の2つ組の入力 */
function YearMonthInput({
  label,
  year,
  month,
  onYear,
  onMonth,
}: {
  label: string;
  year: string;
  month: string;
  onYear: (v: string) => void;
  onMonth: (v: string) => void;
}) {
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="number"
          inputMode="numeric"
          min={1950}
          max={2100}
          value={year}
          onChange={(e) => onYear(e.target.value)}
          aria-label={`${label}（年）`}
        />
        <span>年</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={12}
          value={month}
          onChange={(e) => onMonth(e.target.value)}
          aria-label={`${label}（月）`}
          style={{ maxWidth: 90 }}
        />
        <span>月</span>
      </div>
    </div>
  );
}

export default function Calculator() {
  const [amount, setAmount] = useState('20000000');
  const [kind, setKind] = useState<RetirementKind>('general');
  const [declarationSubmitted, setDeclarationSubmitted] = useState(true);

  // 勤続年数（iDeCo一時金が「いいえ／わからない」のとき）
  const [years, setYears] = useState('30');
  const [months, setMonths] = useState('0');

  // iDeCo一時金を先に受け取ったか
  const [prior, setPrior] = useState<PriorChoice>('no');

  /*
   * 「はい」のときの初期値は、**新ルールで結果が変わる最初のケース**に合わせている
   * （2026年に一時金 → 2031年に退職）。9年内で判定されるのは一時金も退職金も
   * 2026年以後のときだけなので、ここを「2020年に一時金」にすると
   * 開いた瞬間の例が旧ルール（4年内）で対象外になり、機能が見えない。
   */
  const [joinYear, setJoinYear] = useState('2002');
  const [joinMonth, setJoinMonth] = useState('4');
  const [leaveYear, setLeaveYear] = useState('2031');
  const [leaveMonth, setLeaveMonth] = useState('3');

  // 先に受け取った一時金
  const [priorYear, setPriorYear] = useState('2026');
  const [priorAmount, setPriorAmount] = useState('2000000');
  const [contribFromYear, setContribFromYear] = useState('2002');
  const [contribFromMonth, setContribFromMonth] = useState('4');
  const [contribToYear, setContribToYear] = useState('2026');
  const [contribToMonth, setContribToMonth] = useState('3');

  const usePeriod = prior === 'yes';

  const args: TaishokukinInput = {
    amount: num(amount),
    kind,
    declarationSubmitted,
    service: usePeriod
      ? {
          from: { year: num(joinYear), month: num(joinMonth) || 1 },
          to: { year: num(leaveYear), month: num(leaveMonth) || 1 },
        }
      : { years: num(years), months: num(months) },
    paymentYear: usePeriod ? num(leaveYear) : TEN_YEAR_RULE_FROM,
    prior: usePeriod
      ? {
          year: num(priorYear),
          amount: num(priorAmount),
          from: { year: num(contribFromYear), month: num(contribFromMonth) || 1 },
          to: { year: num(contribToYear), month: num(contribToMonth) || 1 },
        }
      : undefined,
  };

  const r = calcTaishokukin(args);
  const o = r.deduction.overlap;

  return (
    <div className="card">
      <div style={{ display: 'grid', gap: 14 }}>
        <label>
          退職金の額（額面・円）
          <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
            同じ年に複数のところから退職手当等を受け取るなら、その<strong>合計</strong>を入れてください
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={100000}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>

        <label>
          退職の区分
          <select value={kind} onChange={(e) => setKind(e.target.value as RetirementKind)}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          iDeCo（確定拠出年金）の一時金を、この退職金より先に受け取りましたか？
          <select value={prior} onChange={(e) => setPrior(e.target.value as PriorChoice)}>
            <option value="no">いいえ（受け取っていない）</option>
            <option value="yes">はい（先に受け取った）</option>
            <option value="unknown">わからない</option>
          </select>
        </label>

        {prior === 'unknown' && (
          <div className="note" style={{ lineHeight: 1.7 }}>
            iDeCo・企業型DCの<strong>老齢給付金を「一時金」で受け取った</strong>ことがあるかどうかの話です。
            年金形式で受け取っている場合や、まだ受け取っていない場合は「いいえ」です。
            記録は運営管理機関（申し込んだ金融機関）の<strong>「支払通知書」</strong>や、
            受け取った年の<strong>退職所得の源泉徴収票</strong>で確認できます。
            ここでは「いいえ」と同じ計算（控除を満額使う前提）をしているため、
            <strong>実際に先に受け取っていた場合は、控除が減って税金が増えます。</strong>
          </div>
        )}

        {usePeriod ? (
          <>
            <div className="note" style={{ lineHeight: 1.7 }}>
              重複年数は<strong>こちらで計算します</strong>（ご自身で数える必要はありません）。
              勤続期間と、iDeCoの掛金を払っていた期間を入れてください。
            </div>
            <YearMonthInput
              label="入社年月"
              year={joinYear}
              month={joinMonth}
              onYear={setJoinYear}
              onMonth={setJoinMonth}
            />
            <YearMonthInput
              label="退職年月"
              year={leaveYear}
              month={leaveMonth}
              onYear={setLeaveYear}
              onMonth={setLeaveMonth}
            />
            <label>
              一時金を受け取った年
              <input
                type="number"
                inputMode="numeric"
                min={1950}
                max={2100}
                value={priorYear}
                onChange={(e) => setPriorYear(e.target.value)}
              />
            </label>
            <label>
              受け取った一時金の額（円）
              <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
                重複期間の短縮（下記）の判定に使います
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={100000}
                value={priorAmount}
                onChange={(e) => setPriorAmount(e.target.value)}
              />
            </label>
            <YearMonthInput
              label="iDeCoの掛金を払い始めた年月"
              year={contribFromYear}
              month={contribFromMonth}
              onYear={setContribFromYear}
              onMonth={setContribFromMonth}
            />
            <YearMonthInput
              label="iDeCoの掛金を払い終えた年月"
              year={contribToYear}
              month={contribToMonth}
              onYear={setContribToYear}
              onMonth={setContribToMonth}
            />
          </>
        ) : (
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>勤続年数</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={years}
                onChange={(e) => setYears(e.target.value)}
                aria-label="勤続年数（年）"
                style={{ maxWidth: 120 }}
              />
              <span>年</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={11}
                value={months}
                onChange={(e) => setMonths(e.target.value)}
                aria-label="勤続年数（月）"
                style={{ maxWidth: 90 }}
              />
              <span>か月</span>
            </div>
            <p className="hint" style={{ marginTop: 6 }}>
              <strong>1年未満の端数は切り上げ</strong>ます。{r.serviceMonths % 12 !== 0 && <>入力の{Math.floor(r.serviceMonths / 12)}年{r.serviceMonths % 12}か月は</>}
              計算上<strong>{r.serviceYears}年</strong>として扱います。
            </p>
          </div>
        )}

        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            「退職所得の受給に関する申告書」を勤務先に出しましたか？
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 'var(--fs-sm)' }}>
            <label style={{ fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="radio"
                name="declaration"
                checked={declarationSubmitted}
                onChange={() => setDeclarationSubmitted(true)}
                style={{ width: 'auto' }}
              />
              出した（ふつうはこちら）
            </label>
            <label style={{ fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="radio"
                name="declaration"
                checked={!declarationSubmitted}
                onChange={() => setDeclarationSubmitted(false)}
                style={{ width: 'auto' }}
              />
              出していない
            </label>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 18, textAlign: 'center' }}>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>退職金の手取り</div>
        <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, color: 'var(--accent)' }}>
          {yen(r.net)}
        </div>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
          {r.totalTax === 0
            ? '退職所得控除に収まるため、所得税・住民税はかかりません'
            : `税金は合計 ${yen(r.totalTax)}（額面の ${(100 - r.netRate * 100).toFixed(1)}%）`}
        </div>
      </div>

      <h3 style={{ marginTop: 22 }}>退職所得控除の内訳</h3>
      <p style={{ fontSize: 'var(--fs-sm)' }}>
        勤続<strong>{r.serviceYears}年</strong>（1年未満切り上げ後）で計算しています。
      </p>
      <div className="panel" style={{ lineHeight: 1.9 }}>
        {r.deduction.formula}
      </div>

      {o?.applies && (
        <div className="note" style={{ lineHeight: 1.7 }}>
          {o.amount > 0 ? (
            <strong>
              iDeCo一時金との重複 {o.years}年分（{man(o.amount)}）を差し引きました。
            </strong>
          ) : (
            <strong>重複排除の対象ですが、差し引く期間が無いため控除は満額です。</strong>
          )}
          <br />
          {o.shortened ? (
            <>
              掛金期間は{o.contributionYears}年で、当時の退職所得控除額は{man(o.deductionAtThatTime)}
              でした。受け取った一時金（{man(num(priorAmount))}）はこれに満たないため、
              <strong>
                「前の勤続期間」は掛金開始から{o.deemedYears}年ぶん（
                {ymLabel(o.priorPeriod?.from)}〜{ymLabel(o.priorPeriod?.to)}）に短縮されます
              </strong>
              （所得税法施行令 第70条2項）。この短縮後の期間と勤続期間の重なりは
              <strong>{o.years}年</strong>（{o.deductibleMonths}か月を1年未満切り捨て）です。
              {o.deductibleMonths === 0 && (
                <>
                  {' '}
                  掛金期間そのものは{o.actualOverlapYears}年重なっていますが、
                  <strong>短縮後の期間は勤続期間と重なっていない</strong>ため、差し引きはありません。
                </>
              )}
            </>
          ) : (
            <>
              掛金期間と勤続期間が<strong>{o.years}年</strong>重なっています
              （{o.deductibleMonths}か月を1年未満切り捨て）。一時金（{man(num(priorAmount))}）は
              当時の退職所得控除額（{man(o.deductionAtThatTime)}）以上なので、期間は短縮されません。
            </>
          )}
        </div>
      )}

      {o?.sameYear && (
        <div className="note" style={{ lineHeight: 1.7 }}>
          一時金と退職金を<strong>同じ年に受け取る場合は、この計算ではありません。</strong>
          重複排除（施行令70条1項2号）は「その年の<strong>前年以前</strong>」に受け取った分が対象で、
          同じ年に受けた退職手当等どうしは<strong>通算</strong>（一時金の額も収入に足し、期間を合算する）
          という別の計算になります（施行令69条1項3号）。
          <strong>本ツールでは扱えない</strong>ので、勤務先・税理士にご確認ください。
        </div>
      )}

      {o?.reverseOrder && (
        <div className="note" style={{ lineHeight: 1.7 }}>
          入力では<strong>一時金のほうが退職金より後</strong>になっています。
          この順番（退職金が先、iDeCo一時金が後）は「前年以前19年内」で判定する別の決まりで、
          計算の主体もiDeCo側になるため、<strong>本ツールでは扱っていません</strong>。
        </div>
      )}

      {o && !o.applies && !o.sameYear && !o.reverseOrder && (
        <div className="note" style={{ lineHeight: 1.7 }}>
          一時金を受け取ったのは<strong>{o.gapYears}年前</strong>で、
          {o.lookbackYears === 9 ? '「前年以前9年内」' : '「前年以前4年内」'}
          に入らないため、<strong>控除の調整はありません</strong>（退職所得控除を満額使えます）。
          {o.lookbackYears === 4 && o.gapYears >= 5 && o.gapYears <= 9 && (
            <>
              {' '}
              <strong>9年内で判定されるのは、一時金も退職金も2026年以後のときだけ</strong>です
              （施行令70条1項2号ロ「令和八年一月一日以後に支払を受けたものに限り」）。
              この一時金は{priorYear}年に受け取っているため、従来どおり4年内で判定します。
            </>
          )}
        </div>
      )}

      <h3 style={{ marginTop: 22 }}>税額の内訳</h3>
      <table>
        <tbody>
          <tr>
            <td style={rowLabel}>退職金（額面）</td>
            <td>{yen(num(amount))}</td>
          </tr>
          <tr>
            <td style={rowLabel}>− 退職所得控除</td>
            <td>{yen(r.deduction.total)}</td>
          </tr>
          <tr>
            <td style={rowLabel}>
              ＝ 課税退職所得金額
              {r.halfRule === 'full' && '（残りの2分の1・1,000円未満切捨て）'}
              {r.halfRule === 'none' && '（特定役員退職手当等：2分の1なし）'}
              {r.halfRule === 'partial' && '（短期退職手当等：300万円超の部分は2分の1なし）'}
            </td>
            <td>
              <strong>{yen(r.taxableIncome)}</strong>
            </td>
          </tr>
          <tr>
            <td style={rowLabel}>
              所得税（税率{(r.taxRate * 100).toFixed(0)}%・復興特別所得税2.1%込み）
            </td>
            <td>{yen(r.incomeTax)}</td>
          </tr>
          <tr>
            <td style={rowLabel}>住民税（市町村民税6% ＋ 道府県民税4%）</td>
            <td>
              {yen(r.residentTax)}
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)', display: 'block' }}>
                内訳：市町村民税 {yen(r.cityTax)} ／ 道府県民税 {yen(r.prefTax)}
              </span>
            </td>
          </tr>
          <tr>
            <td style={rowLabel}>＝ 手取り</td>
            <td>
              <strong>{yen(r.net)}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      {r.halfRule === 'partial' && r.afterDeduction > 3_000_000 && (
        <div className="note" style={{ lineHeight: 1.7 }}>
          勤続5年以下の<strong>短期退職手当等</strong>に当たります。控除後の額のうち
          300万円までは2分の1になりますが、<strong>300万円を超える部分は2分の1になりません</strong>。
        </div>
      )}
      {r.halfRule === 'none' && (
        <div className="note" style={{ lineHeight: 1.7 }}>
          役員等で勤続5年以下の<strong>特定役員退職手当等</strong>に当たるため、
          <strong>2分の1課税は使えません</strong>。控除後の額がそのまま課税退職所得金額になります。
        </div>
      )}

      {r.withholding && (
        <>
          <h3 style={{ marginTop: 22 }}>申告書を出していない場合の「振り込まれる額」</h3>
          <p style={{ fontSize: 'var(--fs-sm)' }}>
            「退職所得の受給に関する申告書」を出していないと、
            <strong>所得税は退職金の額そのものに{(NO_DECLARATION_RATE * 100).toFixed(2)}%</strong>
            が源泉徴収されます（退職所得控除も2分の1も使われません）。
            <strong>税額そのものは変わらず</strong>、確定申告で精算します。
          </p>
          <table>
            <tbody>
              <tr>
                <td style={rowLabel}>
                  源泉徴収される所得税（{yen(num(amount))} × {(NO_DECLARATION_RATE * 100).toFixed(2)}%）
                </td>
                <td>{yen(r.withholding.incomeTaxWithheld)}</td>
              </tr>
              <tr>
                <td style={rowLabel}>住民税（申告書の有無にかかわらず特別徴収）</td>
                <td>{yen(r.residentTax)}</td>
              </tr>
              <tr>
                <td style={rowLabel}>＝ 振り込まれる額</td>
                <td>
                  <strong>{yen(r.withholding.netAtPayment)}</strong>
                </td>
              </tr>
              <tr>
                <td style={rowLabel}>確定申告で戻る額</td>
                <td>
                  <strong>
                    {r.withholding.refund >= 0
                      ? yen(r.withholding.refund)
                      : `${yen(-r.withholding.refund)}を追加で納める`}
                  </strong>
                </td>
              </tr>
              <tr>
                <td style={rowLabel}>＝ 最終的な手取り</td>
                <td>{yen(r.net)}</td>
              </tr>
            </tbody>
          </table>
          <p className="hint" style={{ marginTop: 8 }}>
            <strong>20.42%は所得税だけの話です。</strong>
            住民税は申告書の有無にかかわらず、正しい額（課税退職所得の10%）が退職金から
            特別徴収されます。
          </p>
        </>
      )}

      {prior === 'unknown' && (
        <div className="note" style={{ lineHeight: 1.7 }}>
          iDeCo・企業型DCの一時金を先に受け取っているかどうかが分からない場合、
          この結果は<strong>「受け取っていない」前提の概算</strong>です。
          <strong>勤務先の担当部署・iDeCoの運営管理機関でご確認ください。</strong>
        </div>
      )}

      <div className="note">
        本計算は目安です。実際の源泉徴収額は
        <strong>退職所得の源泉徴収票</strong>でご確認ください。同じ年に複数の退職手当等を受け取る場合や、
        企業型DC・中退共・小規模企業共済と通算される場合は計算が変わります。個別の税務については税理士にご相談ください。
        受け取り方の前後関係は <Link href="/ideco/">iDeCo 拠出限度額 計算機</Link>、
        退職後の収入は <Link href="/shitsugyo-hoken/">失業保険（基本手当）計算機</Link> も合わせてご覧ください。
      </div>
    </div>
  );
}
