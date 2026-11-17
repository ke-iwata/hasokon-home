'use client';

import { useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import { addDays, formatDate, formatJa, parseDate, weekdayLabel, type DateParts } from '@/lib/date-parts';
import {
  CLOSING_DAYS,
  CONTRACTOR_TYPE_LABELS,
  DAYS_PER_YEAR,
  DEAL_KIND_LABELS,
  LATE_RATE_LABEL,
  LIMIT_DAYS,
  PAY_DAYS,
  TORITEKI_EFFECTIVE,
  VERDICT_LABELS,
  applicability,
  closedReason,
  dayCount,
  dayLabel,
  daysForAfterN,
  holidayKnown,
  lateInterest,
  legalDueDate,
  longestCase,
  payDateFor,
  worstCaseDays,
  type ContractorType,
  type DealKind,
} from '@/lib/shiharai-kijitsu';

type Mode = 'due' | 'check' | 'late';

const SLUG = 'shiharai-kijitsu';

/** 仕様書の例。「入れたら変わる」型にするため最初から結果を出す */
const DEFAULT_RECEIVED = '2027-01-10';
const DEFAULT_PAID = '2027-03-31';
const DEFAULT_AMOUNT = '1000000';

/** 締めなし（納品ごとに支払日を決める） */
const NO_CLOSING = 0;

const yen = (n: number) => n.toLocaleString('ja-JP');
const wd = (p: DateParts) => `${formatJa(p)}（${weekdayLabel(p)}）`;
const md = (p: DateParts) => `${p.month}/${p.day}`;

/** 金額欄の文字列 → 円（全角数字・カンマを許す） */
function toYen(s: string): number | null {
  const t = s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[,，\s円]/g, '');
  if (t === '' || !/^\d+$/.test(t)) return null;
  return Number(t);
}

/** 数値欄（人数・万円）→ 数。空なら 0 */
function toNum(s: string): number {
  const n = Number(s.replace(/[,，]/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

const rowGrid = {
  display: 'grid',
  gridTemplateColumns: '3.2em 1fr 5.5em',
  gap: 8,
  alignItems: 'baseline',
  padding: '8px 4px',
} as const;

/** 支払期日が休業日のときの注記（期日は動かさない。仕様書「決めること 2」） */
function ClosedNote({ date }: { date: DateParts }) {
  const reason = closedReason(date);
  if (!reason) return null;
  return (
    <p className="hint" style={{ margin: '4px 0 0' }}>
      この日は{reason}で、金融機関の休業日です。期日そのものは動きません（前の営業日までに払えば確実です）。
      {!holidayKnown(date.year) && '祝日表がまだ無い年なので、土日だけで判定しています。'}
    </p>
  );
}

export default function Calculator() {
  const [mode, setMode] = useState<Mode>('due');
  const [received, setReceived] = useState(DEFAULT_RECEIVED);

  const [closing, setClosing] = useState<number>(31);
  const [offset, setOffset] = useState(1);
  const [payDay, setPayDay] = useState<number>(31);
  const [afterN, setAfterN] = useState('30');
  const [year, setYear] = useState<number | null>(null);

  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [paid, setPaid] = useState(DEFAULT_PAID);

  const [ordererCapital, setOrdererCapital] = useState('5000');
  const [ordererEmployees, setOrdererEmployees] = useState('30');
  const [contractorType, setContractorType] = useState<ContractorType>('individual');
  const [contractorCapital, setContractorCapital] = useState('');
  const [contractorEmployees, setContractorEmployees] = useState('0');
  const [kind, setKind] = useState<DealKind>('other');
  const [applyOpen, setApplyOpen] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    trackToolUse(SLUG, next);
  }

  const receivedDate = parseDate(received);
  const due = receivedDate ? legalDueDate(receivedDate) : null;

  const app = applicability({
    ordererCapital: toNum(ordererCapital) * 10_000,
    ordererEmployees: toNum(ordererEmployees),
    contractorCapital: toNum(contractorCapital) * 10_000,
    contractorEmployees: toNum(contractorEmployees),
    contractorType,
    kind,
  });
  // 判定を開かなければ「取適法の対象だとして」計算する（仕様書「入力」5）
  const lateApplies = !applyOpen || app.lateInterestApplies;

  // ---- 支払条件のチェック
  const tableYear = year ?? receivedDate?.year ?? 2027;
  const cases = closing === NO_CLOSING ? null : worstCaseDays(closing, offset, payDay, tableYear);
  const worst = cases ? longestCase(cases) : null;
  const afterNum = Number(afterN);
  const afterValid = closing === NO_CLOSING && afterN.trim() !== '' && Number.isInteger(afterNum) && afterNum >= 0;
  const own =
    receivedDate && closing !== NO_CLOSING ? payDateFor(receivedDate, closing, offset, payDay) : null;

  // ---- 遅延利息
  const paidDate = parseDate(paid);
  const amountYen = toYen(amount);
  const late = receivedDate && paidDate && amountYen !== null ? lateInterest(amountYen, receivedDate, paidDate) : null;

  return (
    <div className="card">
      <div className="field">
        <span className="field-label">計算の種類</span>
        <div style={{ display: 'flex', gap: '6px 20px', flexWrap: 'wrap' }}>
          {(
            [
              ['due', '納品日から期日を出す'],
              ['check', '支払条件をチェック'],
              ['late', '遅延利息を出す'],
            ] as [Mode, string][]
          ).map(([value, label]) => (
            <label key={value} style={{ fontWeight: mode === value ? 700 : 400 }}>
              <input
                type="radio"
                name="shiharai-mode"
                value={value}
                checked={mode === value}
                onChange={() => switchMode(value)}
                style={{ width: 'auto', marginRight: 6 }}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="shiharai-received">
          受領日（納品日・役務の提供を受けた日）{mode === 'check' && '（入れなくても判定できます）'}
        </label>
        <input
          id="shiharai-received"
          type="date"
          value={received}
          max="2100-12-31"
          onChange={(e) => setReceived(e.target.value)}
          onBlur={() => trackToolUse(SLUG, `${mode}-received`)}
        />
        {receivedDate && formatDate(receivedDate) < TORITEKI_EFFECTIVE && (
          <p className="hint">
            2025年12月31日以前の取引は旧下請法の対象です（支払期日の60日・遅延利息の年14.6%は同じ）。
          </p>
        )}
      </div>

      {mode === 'check' && (
        <>
          <div className="field-row">
            <div className="field">
              <label htmlFor="shiharai-closing">締め日</label>
              <select
                id="shiharai-closing"
                value={closing}
                onChange={(e) => {
                  setClosing(Number(e.target.value));
                  trackToolUse(SLUG, 'check-terms');
                }}
              >
                {CLOSING_DAYS.map((c) => (
                  <option key={c} value={c}>
                    毎月{dayLabel(c)}
                  </option>
                ))}
                <option value={NO_CLOSING}>締めなし（納品ごと）</option>
              </select>
            </div>
            {closing === NO_CLOSING ? (
              <div className="field">
                <label htmlFor="shiharai-after">支払日：受領日から何日後</label>
                <input
                  id="shiharai-after"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={afterN}
                  onChange={(e) => setAfterN(e.target.value)}
                  onBlur={() => trackToolUse(SLUG, 'check-terms')}
                />
              </div>
            ) : (
              <div className="field">
                <span className="field-label">支払日</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    aria-label="支払う月"
                    value={offset}
                    onChange={(e) => {
                      setOffset(Number(e.target.value));
                      trackToolUse(SLUG, 'check-terms');
                    }}
                  >
                    <option value={1}>翌月</option>
                    <option value={2}>翌々月</option>
                  </select>
                  <select
                    aria-label="支払う日"
                    value={payDay}
                    onChange={(e) => {
                      setPayDay(Number(e.target.value));
                      trackToolUse(SLUG, 'check-terms');
                    }}
                  >
                    {PAY_DAYS.map((p) => (
                      <option key={p} value={p}>
                        {dayLabel(p)}払い
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
          {closing !== NO_CLOSING && (
            <p className="hint">「締めなし」は、締め日を置かずに納品ごとに支払日を決める取引です。</p>
          )}
        </>
      )}

      {mode === 'late' && (
        <div className="field-row">
          <div className="field">
            <label htmlFor="shiharai-amount">未払金額（円）</label>
            <input
              id="shiharai-amount"
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => trackToolUse(SLUG, 'late-amount')}
            />
          </div>
          <div className="field">
            <label htmlFor="shiharai-paid">実際に支払った（支払う）日</label>
            <input
              id="shiharai-paid"
              type="date"
              value={paid}
              max="2100-12-31"
              onChange={(e) => setPaid(e.target.value)}
              onBlur={() => trackToolUse(SLUG, 'late-paid')}
            />
          </div>
        </div>
      )}

      <details
        className="field"
        onToggle={(e) => {
          const open = (e.currentTarget as HTMLDetailsElement).open;
          setApplyOpen(open);
          if (open) trackToolUse(SLUG, 'applicability');
        }}
      >
        <summary style={{ cursor: 'pointer' }}>適用の判定（取適法・フリーランス法の対象か）</summary>
        <div style={{ marginTop: 8 }}>
          <div className="field">
            <label htmlFor="shiharai-kind">取引の種類</label>
            <select id="shiharai-kind" value={kind} onChange={(e) => setKind(e.target.value as DealKind)}>
              {(Object.keys(DEAL_KIND_LABELS) as DealKind[]).map((k) => (
                <option key={k} value={k}>
                  {DEAL_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="shiharai-o-cap">発注側の資本金（万円）</label>
              <input
                id="shiharai-o-cap"
                type="number"
                inputMode="numeric"
                min={0}
                value={ordererCapital}
                onChange={(e) => setOrdererCapital(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="shiharai-o-emp">発注側の従業員（人）</label>
              <input
                id="shiharai-o-emp"
                type="number"
                inputMode="numeric"
                min={0}
                value={ordererEmployees}
                onChange={(e) => setOrdererEmployees(e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="shiharai-c-type">受注側</label>
            <select
              id="shiharai-c-type"
              value={contractorType}
              onChange={(e) => setContractorType(e.target.value as ContractorType)}
            >
              {(Object.keys(CONTRACTOR_TYPE_LABELS) as ContractorType[]).map((t) => (
                <option key={t} value={t}>
                  {CONTRACTOR_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="field-row">
            {contractorType !== 'individual' && (
              <div className="field">
                <label htmlFor="shiharai-c-cap">受注側の資本金（万円）</label>
                <input
                  id="shiharai-c-cap"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={contractorCapital}
                  onChange={(e) => setContractorCapital(e.target.value)}
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="shiharai-c-emp">受注側の従業員（人）</label>
              <input
                id="shiharai-c-emp"
                type="number"
                inputMode="numeric"
                min={0}
                value={contractorEmployees}
                onChange={(e) => setContractorEmployees(e.target.value)}
              />
            </div>
          </div>
          <p className="hint">
            従業員は「常時使用する従業員」の数です。開かなければ、取適法の対象だとして計算します。
          </p>
        </div>
      </details>

      {/* ---------------- 結果 ---------------- */}

      {due && receivedDate ? (
        <div className={mode === 'due' ? 'panel' : 'panel quiet'}>
          <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)' }}>法律上の支払期日</div>
          <div className="metric">
            <span className="value" style={{ fontSize: 'clamp(1.15rem, 5.4vw, 1.6rem)' }}>
              {wd(due)}
            </span>
            <span className="label">まで</span>
          </div>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            受領日 {md(receivedDate)} を1日目として{LIMIT_DAYS}日目（取適法第3条・フリーランス法第4条）
          </p>
          <ClosedNote date={due} />
        </div>
      ) : (
        mode !== 'check' && (
          <div className="panel quiet">
            <p className="hint" style={{ margin: 0 }}>
              受領日を入れると、法律上の支払期日が出ます。
            </p>
          </div>
        )
      )}

      {mode === 'check' && closing === NO_CLOSING && (
        <div className="panel">
          <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)' }}>支払条件の判定</div>
          {afterValid ? (
            <p style={{ margin: '4px 0 0' }}>
              受領日から{afterNum}日後の支払いは、受領日を1日目として
              <strong>{daysForAfterN(afterNum)}日目</strong>。
              {daysForAfterN(afterNum) > LIMIT_DAYS ? (
                <strong style={{ color: 'var(--danger-fg)' }}>60日を超えます。</strong>
              ) : (
                '60日以内です。'
              )}
              {receivedDate && <>（{md(receivedDate)} 受領なら支払日は {wd(addDays(receivedDate, afterNum))}）</>}
            </p>
          ) : (
            <p className="hint">何日後かを0以上の整数で入れてください。</p>
          )}
        </div>
      )}

      {mode === 'check' && cases && worst && (
        <div className="panel">
          <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)' }}>
            支払条件の判定（毎月{dayLabel(closing)}締め・{offset === 1 ? '翌月' : '翌々月'}
            {dayLabel(payDay)}払い）
          </div>
          <p style={{ margin: '4px 0 0' }}>
            最も長いケース：
            <strong>
              {md(worst.earliestDelivery)} 納品 → {md(worst.payDate)} 払い＝{worst.maxDays}日
            </strong>
            。
            {worst.over60 ? (
              <strong style={{ color: 'var(--danger-fg)' }}>60日を超えます。</strong>
            ) : (
              '12か月とも60日以内です。'
            )}
          </p>
          {own && receivedDate && (
            <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-sm)' }}>
              入れた受領日 {md(receivedDate)} なら、支払日は {wd(own)}＝{dayCount(receivedDate, own)}日目
              {dayCount(receivedDate, own) > LIMIT_DAYS ? '（60日を超えます）' : '（60日以内）'}。
            </p>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 4px' }}>
            <label htmlFor="shiharai-year" style={{ fontWeight: 400 }}>
              締め日のある年
            </label>
            <select
              id="shiharai-year"
              value={tableYear}
              onChange={(e) => setYear(Number(e.target.value))}
              style={{ width: 'auto' }}
            >
              {[tableYear - 1, tableYear, tableYear + 1].map((y) => (
                <option key={y} value={y}>
                  {y}年
                </option>
              ))}
            </select>
          </div>
          <div role="table" aria-label="月ごとの最長日数" style={{ fontSize: 'var(--fs-sm)' }}>
            <div role="row" style={{ ...rowGrid, fontWeight: 700, borderBottom: '1px solid var(--border)' }}>
              <span role="columnheader">月</span>
              <span role="columnheader">最長日数</span>
              <span role="columnheader">判定</span>
            </div>
            {cases.map((c) => (
              <details key={c.month} role="row" style={{ borderBottom: '1px solid var(--border)' }}>
                <summary style={{ ...rowGrid, cursor: 'pointer', listStyle: 'none' }}>
                  <span role="cell">{c.month}月</span>
                  <span role="cell" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {c.maxDays}日
                  </span>
                  <span role="cell" style={c.over60 ? { color: 'var(--danger-fg)', fontWeight: 700 } : undefined}>
                    {c.over60 ? '超える' : '60日以内'}
                  </span>
                </summary>
                <p className="hint" style={{ margin: '0 4px 8px' }}>
                  締め期間 {md(c.earliestDelivery)}〜{md(c.latestDelivery)} → 支払日 {wd(c.payDate)}。
                  最長 {c.maxDays}日（{md(c.earliestDelivery)} 納品）・最短 {c.minDays}日（{md(c.latestDelivery)} 納品）
                </p>
              </details>
            ))}
          </div>
          <p className="hint" style={{ margin: '6px 0 0' }}>
            行を押すと締め期間と支払日が出ます。判定は条文の「60日」（受領日を1日目）で数えています。
            月単位の締切制度では「60日」を「2か月」と読み替えて運用する扱いが旧下請法の講習会テキストにあったとされますが、
            取適法での扱いは一次資料で確かめられていません。運用上の扱いは公正取引委員会に確認してください。
          </p>
        </div>
      )}

      {mode === 'late' && late && receivedDate && paidDate && amountYen !== null && (
        <div className="panel">
          <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)' }}>遅延利息（取適法第6条）</div>
          {!lateApplies ? (
            <p style={{ margin: '4px 0 0' }}>
              適用の判定では取適法の対象外です。フリーランス法には遅延利息の規定がありません（契約上の遅延損害金は別です）。
            </p>
          ) : late.days === 0 ? (
            <>
              <div className="metric">
                <span className="value">0</span>
                <span className="unit">円</span>
              </div>
              <p className="hint" style={{ margin: '4px 0 0' }}>
                {wd(paidDate)} の支払いは、受領日から{dayCount(receivedDate, paidDate)}日目で60日以内です。取適法の遅延利息は生じません。
              </p>
            </>
          ) : (
            <>
              <div className="metric">
                <span className="value">{yen(late.interest)}</span>
                <span className="unit">円</span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-sm)' }}>
                60日を経過した日（{md(late.fromDate)}）から支払日（{md(paidDate)}）まで
                <br />
                <strong>
                  {late.days}日 × {LATE_RATE_LABEL} × {yen(amountYen)}円 ÷ {DAYS_PER_YEAR} ＝ {yen(late.interest)}円
                </strong>
              </p>
              <p className="hint" style={{ margin: '4px 0 0' }}>
                円未満は切り捨て。起算日は「定めた支払期日」ではなく「受領日から60日を経過した日」です（第6条第1項）。
              </p>
            </>
          )}
        </div>
      )}

      {applyOpen && (
        <div className="panel quiet">
          <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)' }}>適用の判定</div>
          <p style={{ margin: '4px 0 0' }}>
            <strong>{VERDICT_LABELS[app.verdict]}</strong>
          </p>
          <ul className="hint" style={{ margin: '4px 0 0', paddingLeft: '1.2em' }}>
            {app.toritekiClause !== null && (
              <li>
                取適法：第2条第8項第{app.toritekiClause}号
                {app.toritekiClause >= 5 ? '（従業員基準）' : '（資本金基準）'}に当たる取引。支払期日は第3条、遅延利息は第6条（{LATE_RATE_LABEL}）
              </li>
            )}
            {app.freelance && <li>フリーランス法：第4条の60日がかかります。遅延利息の規定はありません</li>}
            {app.verdict === 'both' && (
              <li>
                両方に当てはまります。遅延利息は取適法第6条の規定で出しています。どちらの法律で扱われるかは、所管の窓口で確かめてください
              </li>
            )}
            {app.verdict === 'none' && (
              <li>支払期日の60日ルールはかかりません。契約で決めた支払期日と、民法・契約上の遅延損害金の扱いになります</li>
            )}
          </ul>
        </div>
      )}

      <p className="note">
        手形での支払いや、期日までに満額を現金化できない電子記録債権・ファクタリングでの支払いは、期日内でも支払遅延になります（取適法第5条第1項第2号）。
      </p>
    </div>
  );
}

