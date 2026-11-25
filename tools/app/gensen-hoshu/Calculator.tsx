'use client';

import { useEffect, useRef, useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import { DEFENSE_START_YEAR } from '@/lib/boei-tokubetsu-shotokuzei';
import {
  MAX_AMOUNT,
  calcHoshu,
  formulaText,
  fromNet,
  invoiceLines,
  invoiceText,
  needsPaidOnNotice,
  yearOf,
  type HoshuOptions,
  type PayeeKind,
  type TaxMode,
} from '@/lib/gensen-hoshu';
import { toYmd } from '@/lib/nenshu-kabe';

const SLUG = 'gensen-hoshu';

type Direction = 'gross' | 'net';

const yen = (v: number) => `${Math.round(v).toLocaleString('ja-JP')}円`;

const buttonStyle = (active: boolean): React.CSSProperties => ({
  flex: '1 1 0',
  minHeight: 44,
  padding: '8px 4px',
  borderRadius: 8,
  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
  background: active ? 'var(--accent-soft)' : 'var(--surface)',
  color: 'var(--text)',
  fontSize: 'var(--fs-sm)',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
});

const rowStyle: React.CSSProperties = { display: 'flex', gap: 6 };

const TAX_MODES: [TaxMode, string, string][] = [
  ['exclusive', '税抜', '消費税10%を別に足し、報酬だけに源泉'],
  ['inclusiveSeparated', '税込・区分あり', '請求書で消費税を分けて記載。報酬だけに源泉'],
  ['inclusiveUnseparated', '税込・区分なし', '消費税を分けて書いていない。税込額に源泉'],
];

const KIND_LABEL: Record<PayeeKind, string> = {
  normal: 'ふつうの報酬',
  shihoshoshi: '司法書士・土地家屋調査士・海事代理士',
};

/** 入力欄の文字列 → 円（カンマ・全角数字も受ける） */
function toYen(s: string): number {
  const half = s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[,，\s円]/g, '');
  const v = Number(half);
  return Number.isFinite(v) && v > 0 ? Math.min(MAX_AMOUNT, Math.floor(v)) : 0;
}

/**
 * @param buildDate ビルド時刻（ISO文字列）。静的書き出しなので、ハイドレーション直後はこの値で
 *   支払日の既定値を作り、マウント後に「画面を開いた日」に置き換える（利用者が触っていなければ）。
 */
export default function Calculator({ buildDate }: { buildDate: string }) {
  const [direction, setDirection] = useState<Direction>('gross');
  const [amountText, setAmountText] = useState('100000');
  const [taxMode, setTaxMode] = useState<TaxMode>('exclusive');
  const [kind, setKind] = useState<PayeeKind>('normal');
  const [paidOn, setPaidOn] = useState(() => toYmd(new Date(buildDate)));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [today, setToday] = useState(() => toYmd(new Date(buildDate)));
  const paidOnTouched = useRef(false);

  useEffect(() => {
    const now = toYmd(new Date());
    setToday(now);
    if (!paidOnTouched.current) setPaidOn(now);
  }, []);

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(paidOn) ? paidOn : today;
  const opts: HoshuOptions = { taxMode, kind, paidOn: validDate };
  const amount = toYen(amountText);
  const back = direction === 'net' ? fromNet(amount, opts) : null;
  const r = back ? back.result : calcHoshu(amount, opts);
  const lines = invoiceLines(r, taxMode);
  const isNewWorld = yearOf(validDate) >= DEFENSE_START_YEAR;

  function track(action: string) {
    trackToolUse(SLUG, action);
  }

  async function copyInvoice() {
    try {
      await navigator.clipboard.writeText(invoiceText(lines));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      track('copy-invoice');
    } catch {
      /* クリップボード非対応環境では何もしない */
    }
  }

  const amountLabel =
    direction === 'gross'
      ? taxMode === 'exclusive'
        ? '報酬の額（税抜・円）'
        : '請求額（税込・円）'
      : '手取り（振込額・円）';

  return (
    <div className="card">
      <div role="tablist" aria-label="計算の向き" style={{ ...rowStyle, marginBottom: 14 }}>
        {(
          [
            ['gross', '請求額から'],
            ['net', '手取り（振込額）から'],
          ] as [Direction, string][]
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={direction === v}
            style={buttonStyle(direction === v)}
            onClick={() => {
              setDirection(v);
              track(v === 'gross' ? 'from-gross' : 'from-net');
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="field">
        <label htmlFor="gensen-hoshu-amount">{amountLabel}</label>
        <input
          id="gensen-hoshu-amount"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          onBlur={() => track(direction === 'gross' ? 'calc' : 'reverse')}
        />
      </div>

      <div className="field">
        <span className="field-label">消費税</span>
        <div role="group" aria-label="消費税" style={rowStyle}>
          {TAX_MODES.map(([v, label, help]) => (
            <button
              key={v}
              type="button"
              title={help}
              aria-pressed={taxMode === v}
              style={buttonStyle(taxMode === v)}
              onClick={() => {
                setTaxMode(v);
                track(`tax-${v}`);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="hint" style={{ margin: '4px 0 0' }}>
          ⓘ {TAX_MODES.find(([v]) => v === taxMode)?.[2]}
        </p>
      </div>

      <details
        open={detailsOpen}
        onToggle={(e) => setDetailsOpen((e.currentTarget as HTMLDetailsElement).open)}
        style={{ marginBottom: 4 }}
      >
        <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)' }}>
          <strong>くわしい条件</strong>
          {!detailsOpen && (
            <span className="hint">
              {' '}
              — {kind === 'normal' ? 'ふつうの報酬' : '司法書士等'}・{validDate === today ? '今日払い' : `${validDate}払い`}
            </span>
          )}
        </summary>
        <div style={{ marginTop: 10 }}>
          <div className="field">
            <label htmlFor="gensen-hoshu-kind">支払う相手</label>
            <select
              id="gensen-hoshu-kind"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as PayeeKind);
                track(`kind-${e.target.value}`);
              }}
            >
              <option value="normal">ふつうの報酬（原稿料・講演料・デザイン料・士業など）</option>
              <option value="shihoshoshi">{KIND_LABEL.shihoshoshi}</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="gensen-hoshu-paid-on">支払日（源泉徴収する日）</label>
            <input
              id="gensen-hoshu-paid-on"
              type="date"
              value={paidOn}
              onChange={(e) => {
                paidOnTouched.current = true;
                setPaidOn(e.target.value);
              }}
              onBlur={() => track('paid-on')}
            />
            <p className="hint" style={{ margin: '4px 0 0' }}>
              仕事をした月や請求した日ではなく、実際に払う日を入れます。税額は同じで、内訳の表示だけが変わります。
            </p>
          </div>
        </div>
      </details>

      {amount <= 0 ? (
        <div className="note" style={{ marginTop: 14 }}>
          金額を入れると源泉徴収税額と振込額が出ます。
        </div>
      ) : (
        <>
          <div className="panel">
            {direction === 'net' && back && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
                  手取り {yen(amount)} にするための{taxMode === 'exclusive' ? '報酬の額（税抜）' : '請求額（税込）'}
                </div>
                <div className="metric" style={{ marginTop: 4 }}>
                  <span className="value">{yen(back.amount)}</span>
                </div>
                {!back.exact && (
                  <p className="hint" style={{ margin: '4px 0 0' }}>
                    1円未満の切り捨ての都合で、ちょうど {yen(amount)} になる金額はありません。手取りが {yen(r.net)}（1円多い）になる最小の金額です。
                  </p>
                )}
                {back.sameNetAtNext && (
                  <p className="hint" style={{ margin: '4px 0 0' }}>
                    {yen(back.amount + 1)} にしても手取りは同じ {yen(r.net)} です（源泉徴収税額が1円増えるため）。小さいほうを出しています。
                  </p>
                )}
              </div>
            )}
            <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>源泉徴収税額</div>
            <div className="metric" style={{ marginTop: 4 }}>
              <span className="value">{yen(r.withholding)}</span>
            </div>
            <dl className="kv" style={{ marginTop: 8 }}>
              <div>
                <dt>請求額（税込）</dt>
                <dd>{yen(r.gross)}</dd>
              </div>
              <div>
                <dt>− 源泉徴収税額</dt>
                <dd>{yen(r.withholding)}</dd>
              </div>
              <div>
                <dt>
                  <strong>＝ 差引の振込額</strong>
                </dt>
                <dd>
                  <strong>{yen(r.net)}</strong>
                </dd>
              </div>
            </dl>
          </div>

          {r.unseparatedExtra > 0 && (
            <p className="hint" style={{ marginTop: 8 }}>
              請求書で報酬 {yen(r.fee)} と消費税 {yen(r.consumptionTax)} を分けて書けば、源泉徴収税額は{' '}
              {yen(r.withholding - r.unseparatedExtra)} になり、<strong>{yen(r.unseparatedExtra)} 少なく</strong>なります。
            </p>
          )}

          <h3 style={{ marginTop: 20 }}>計算の式</h3>
          <p style={{ margin: 0, overflowWrap: 'anywhere' }}>
            {kind === 'shihoshoshi' && <>({yen(r.withholdingBase)} − 10,000円) → </>}
            {formulaText(r)}
          </p>
          {r.withholdingBase !== r.fee && (
            <p className="hint" style={{ margin: '4px 0 0' }}>消費税を区分していないので、税込額 {yen(r.gross)} に源泉しています。</p>
          )}

          <h3 style={{ marginTop: 20 }}>内訳（参考）</h3>
          <dl className="kv">
            {r.breakdown.map((row) => (
              <div key={row.label}>
                <dt>
                  {row.label}
                  {row.permille > 0 && `（所得税額の${row.permille / 10}%）`}
                </dt>
                <dd>{yen(row.amount)}</dd>
              </div>
            ))}
          </dl>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            {isNewWorld
              ? `${DEFENSE_START_YEAR}年1月からは防衛特別所得税（1%）が加わり、復興特別所得税が2.1%→1.1%に下がります。合計は同じです。`
              : `${DEFENSE_START_YEAR}年1月以後の支払では、内訳が「所得税・防衛特別所得税・復興特別所得税」の3つになります（合計は同じ）。`}
            納付は合計額で行うので、内訳は参考の表示です。
          </p>
          {needsPaidOnNotice(validDate) && (
            <div className="note" style={{ marginTop: 10, lineHeight: 1.7 }}>
              {isNewWorld
                ? '2026年中の仕事の分を2027年1月に払う場合も、ここでは支払日で内訳を分けています。'
                : '2027年1月以後に支払う分は、防衛特別所得税を含む内訳になります。'}
              報酬・料金をどの日で判定するかは国税庁の説明を確認中です。源泉徴収税額（合計）はどちらでも変わりません。
            </div>
          )}

          <h3 style={{ marginTop: 20 }}>請求書の書き方の例</h3>
          <dl className="kv">
            {lines.map((l) => (
              <div key={l.label}>
                <dt>{l.label}</dt>
                <dd>{l.amount < 0 ? `−${yen(-l.amount)}` : yen(l.amount)}</dd>
              </div>
            ))}
          </dl>
          <button
            type="button"
            onClick={copyInvoice}
            style={{ ...buttonStyle(false), flex: 'none', marginTop: 10, padding: '8px 16px' }}
          >
            {copied ? 'コピーしました' : '請求書の例をコピー'}
          </button>
        </>
      )}
    </div>
  );
}
