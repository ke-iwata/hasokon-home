'use client';

import { useEffect, useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import {
  BASIC_DEDUCTION,
  EXTENDED_EXCLUSION,
  GIFT_CLASS_LABELS,
  PERIOD_ROWS,
  SETTLEMENT_SPECIAL_DEDUCTION,
  addedAmountRange,
  additionPeriod,
  classifyGift,
  compareDate,
  formatDate,
  formatJaDate,
  formatMd,
  giftTax,
  hayamiTable,
  parseDate,
  settlementTax,
  type DateParts,
  type GiftClass,
  type HayamiSegment,
} from '@/lib/zoyozei-keisan';

const yen = (n: number) => `${Math.round(n).toLocaleString('ja-JP')}円`;
const num = (v: string) => Math.max(0, Number(v) || 0);
const pct = (r: number) => `${(Math.round(r * 1000) / 10).toLocaleString('ja-JP')}%`;

type Method = 'rekinen' | 'seisan';
/** 贈与者との関係。'mixed' は直系尊属とそれ以外の両方から受けた年（No.4408 の按分） */
type Relation = 'lineal' | 'other' | 'mixed';

const radioRow = { display: 'flex', gap: 16, flexWrap: 'wrap' as const, fontSize: 'var(--fs-sm)' };
const radioLabel = { fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' };
const rowLabel = { textAlign: 'left' as const };
/** 早見表のセル。320px 幅で横スクロールさせないため余白を詰める（仕様書「画面」） */
const tight = { padding: '6px 6px' };

/**
 * 区分の見た目。**色と文字ラベルの両方**で出す（色だけに頼らない。仕様書「画面」）。
 * 3 年以内は塗り、延長 4 年分は実線の枠、対象外は破線で、白黒でも区別できる
 */
const CLASS_STYLE: Record<GiftClass, React.CSSProperties> = {
  'within-3y': { background: 'var(--accent)', color: 'var(--on-accent)', border: '2px solid var(--accent)' },
  'extended-4y': { background: 'var(--surface)', color: 'var(--accent-strong)', border: '2px solid var(--accent)' },
  'not-added': { background: 'transparent', color: 'var(--muted)', border: '2px dashed var(--muted)' },
};

function ClassChip({ cls }: { cls: GiftClass }) {
  return (
    <span
      style={{
        ...CLASS_STYLE[cls],
        display: 'inline-block',
        borderRadius: 4,
        padding: '1px 6px',
        fontSize: 'var(--fs-xs)',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {GIFT_CLASS_LABELS[cls]}
    </span>
  );
}

/**
 * 贈与税 計算機・生前贈与加算チェッカーの UI。
 *
 * 上（A）が主役の加算チェッカー、下（B）が暦年課税の贈与税、その下（C）に精算課税との比較を畳む。
 * 贈与額は A の冒頭に置き、B・C はその値を引き継ぐ（同じ state。依存は上 → 下の一方向だけ）。
 * ロジックは持たせない（すべて lib/zoyozei-keisan.ts の純関数）。
 */
export default function Calculator() {
  const [amount, setAmount] = useState('5000000');
  const [giftDate, setGiftDate] = useState('');
  const [inheritanceDate, setInheritanceDate] = useState('');
  const [method, setMethod] = useState<Method>('rekinen');

  const [relation, setRelation] = useState<Relation>('lineal');
  const [adult, setAdult] = useState(true);
  const [linealAmount, setLinealAmount] = useState('3000000');
  const [usedSpecial, setUsedSpecial] = useState('0');

  /** 贈与日の既定は「開いた日」。静的書き出しなのでビルド時刻で固定せず、マウント後に入れる */
  useEffect(() => {
    const now = new Date();
    setGiftDate(formatDate({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }));
  }, []);

  const gift = parseDate(giftDate);
  const inheritance = parseDate(inheritanceDate);
  const total = num(amount);

  const tax = giftTax(total, {
    lineal: relation !== 'other',
    adultOn0101: adult,
    linealAmount: relation === 'mixed' ? num(linealAmount) : undefined,
  });
  const settlement = settlementTax(total, num(usedSpecial));

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>A. 生前贈与加算チェッカー</h2>

      <div className="field">
        <label htmlFor="zoyo-amount">その年に受けた贈与の合計額（円）</label>
        <input
          id="zoyo-amount"
          type="number"
          inputMode="numeric"
          min={0}
          step={10000}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onBlur={() => trackToolUse('zoyozei-keisan', 'amount')}
        />
        <p className="hint">
          1月1日〜12月31日に受けた贈与の合計（複数の人から受けた場合は全員分の合計）。下の「B. 贈与税」はこの額で計算します。
          A の加算の判定は、このうち亡くなった人（贈与者）から受けた分に当てはまります。
        </p>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="zoyo-gift-date">贈与日</label>
          <input id="zoyo-gift-date" type="date" value={giftDate} onChange={(e) => setGiftDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="zoyo-inheritance-date">相続開始日（想定・空欄可）</label>
          <input
            id="zoyo-inheritance-date"
            type="date"
            value={inheritanceDate}
            onChange={(e) => setInheritanceDate(e.target.value)}
            onBlur={() => trackToolUse('zoyozei-keisan', 'inheritance-date')}
          />
        </div>
      </div>
      <p className="hint">相続開始日を空欄にすると、2026〜2034年の相続開始年ごとの早見表を出します。</p>

      <div className="field">
        <div style={{ fontWeight: 700, marginBottom: 6 }}>課税方式</div>
        <div style={radioRow}>
          <label style={radioLabel}>
            <input
              type="radio"
              name="zoyo-method"
              checked={method === 'rekinen'}
              onChange={() => setMethod('rekinen')}
              style={{ width: 'auto' }}
            />
            暦年課税（ふつうの贈与）
          </label>
          <label style={radioLabel}>
            <input
              type="radio"
              name="zoyo-method"
              checked={method === 'seisan'}
              onChange={() => setMethod('seisan')}
              style={{ width: 'auto' }}
            />
            相続時精算課税
          </label>
        </div>
      </div>

      {method === 'seisan' ? (
        <SettlementCheck amount={total} />
      ) : gift === null ? (
        <div className="panel quiet">
          <p className="hint" style={{ margin: 0 }}>
            贈与日を入れると、相続税に加算されるかが出ます。
          </p>
        </div>
      ) : inheritance === null ? (
        <Hayami gift={gift} />
      ) : (
        <CheckResult gift={gift} inheritance={inheritance} amount={total} />
      )}

      <h2>B. 贈与税 計算（暦年課税）</h2>

      <div className="field">
        <div style={{ fontWeight: 700, marginBottom: 6 }}>贈与者との関係</div>
        <div style={radioRow}>
          {(
            [
              ['lineal', '父母・祖父母（直系尊属）'],
              ['other', 'それ以外（配偶者・兄弟・おじおば・他人など）'],
              ['mixed', '両方から受けた'],
            ] as const
          ).map(([v, label]) => (
            <label key={v} style={radioLabel}>
              <input
                type="radio"
                name="zoyo-relation"
                checked={relation === v}
                onChange={() => setRelation(v)}
                style={{ width: 'auto' }}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {relation === 'mixed' && (
        <div className="field">
          <label htmlFor="zoyo-lineal-amount">うち父母・祖父母から受けた額（円）</label>
          <input
            id="zoyo-lineal-amount"
            type="number"
            inputMode="numeric"
            min={0}
            step={10000}
            value={linealAmount}
            onChange={(e) => setLinealAmount(e.target.value)}
          />
        </div>
      )}

      <div className="field">
        <div style={{ fontWeight: 700, marginBottom: 6 }}>受け取る人は、贈与を受けた年の1月1日に18歳以上か</div>
        <div style={radioRow}>
          <label style={radioLabel}>
            <input
              type="radio"
              name="zoyo-adult"
              checked={adult}
              onChange={() => setAdult(true)}
              style={{ width: 'auto' }}
            />
            18歳以上
          </label>
          <label style={radioLabel}>
            <input
              type="radio"
              name="zoyo-adult"
              checked={!adult}
              onChange={() => setAdult(false)}
              style={{ width: 'auto' }}
            />
            18歳未満
          </label>
        </div>
      </div>

      <div className="panel" style={{ textAlign: 'center' }}>
        <div className="metric">
          <span className="value">{tax.tax.toLocaleString('ja-JP')}</span>
          <span className="unit">円</span>
          <span className="label">
            が贈与税（
            {tax.table === 'special' ? '特例税率' : tax.table === 'general' ? '一般税率' : '一般・特例の按分'}
            ・実効税率 {pct(tax.effectiveRate)}）
          </span>
        </div>
      </div>
      <table>
        <tbody>
          <tr>
            <td style={rowLabel}>贈与の合計</td>
            <td>{yen(tax.amount)}</td>
          </tr>
          <tr>
            <td style={rowLabel}>基礎控除</td>
            <td>−{yen(Math.min(tax.amount, BASIC_DEDUCTION))}</td>
          </tr>
          <tr>
            <td style={rowLabel}>基礎控除後の課税価格</td>
            <td>{yen(tax.taxable)}</td>
          </tr>
          {tax.bracket && tax.taxable > 0 && (
            <tr>
              <td style={rowLabel}>税率／控除額</td>
              <td>
                {pct(tax.bracket.rate)}／{yen(tax.bracket.deduction)}
              </td>
            </tr>
          )}
          {tax.table === 'mixed' && tax.general && tax.special && (
            <>
              <tr>
                <td style={rowLabel}>
                  一般税率分（全額を一般税率で {yen(tax.general.fullTax)} × {yen(tax.general.amount)}／
                  {yen(tax.amount)}）
                </td>
                <td>{yen(tax.general.share)}</td>
              </tr>
              <tr>
                <td style={rowLabel}>
                  特例税率分（全額を特例税率で {yen(tax.special.fullTax)} × {yen(tax.special.amount)}／
                  {yen(tax.amount)}）
                </td>
                <td>{yen(tax.special.share)}</td>
              </tr>
            </>
          )}
          <tr>
            <td style={rowLabel}>
              <strong>贈与税</strong>
            </td>
            <td>
              <strong>{yen(tax.tax)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="hint">
        課税価格は1,000円未満、税額は100円未満を切り捨てています。住宅取得等資金・結婚子育て資金などの非課税の特例や、
        贈与税の配偶者控除を使う贈与はこの計算に乗りません。
      </p>

      <details className="field">
        <summary style={{ cursor: 'pointer' }}>C. 同じ額を相続時精算課税で受けた場合と比べる</summary>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="zoyo-used-special">前の年までに使った特別控除の累計（円）</label>
          <input
            id="zoyo-used-special"
            type="number"
            inputMode="numeric"
            min={0}
            max={SETTLEMENT_SPECIAL_DEDUCTION}
            step={10000}
            value={usedSpecial}
            onChange={(e) => setUsedSpecial(e.target.value)}
          />
        </div>
        <table>
          <thead>
            <tr>
              <th />
              <th>暦年課税</th>
              <th>精算課税</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={rowLabel}>この年の贈与税</td>
              <td>{yen(tax.tax)}</td>
              <td>{yen(settlement.tax)}</td>
            </tr>
            <tr>
              <td style={rowLabel}>相続時に加算される額</td>
              <td>相続開始日で決まる（A）</td>
              <td>{yen(settlement.afterBasic)}</td>
            </tr>
            <tr>
              <td style={rowLabel}>残りの特別控除</td>
              <td>—</td>
              <td>{yen(settlement.specialDeductionLeft)}</td>
            </tr>
          </tbody>
        </table>
        <p className="hint">
          精算課税は、年110万円の基礎控除を引いた額から特別控除（累計{yen(SETTLEMENT_SPECIAL_DEDUCTION)}
          まで）を引き、残りに一律20%です。一度選ぶとその贈与者からの贈与は暦年課税に戻せません。
          どちらが向くかは財産の総額・家族構成・将来の相続税率で変わるため、このページでは数字を並べるところまでにしています。
        </p>
      </details>
    </div>
  );
}

/** 相続開始日を入れたときの判定 */
function CheckResult({ gift, inheritance, amount }: { gift: DateParts; inheritance: DateParts; amount: number }) {
  if (compareDate(gift, inheritance) > 0) {
    return (
      <div className="panel quiet">
        <p style={{ margin: 0 }}>贈与日が相続開始日より後です。日付を確かめてください。</p>
      </div>
    );
  }
  const period = additionPeriod(inheritance);
  const cls = classifyGift(gift, inheritance);
  const range = addedAmountRange(amount, cls);
  const row = PERIOD_ROWS[period.kind];

  return (
    <>
      <div className="panel" style={{ textAlign: 'center' }}>
        <p style={{ margin: '0 0 6px', fontSize: '1.2rem' }}>
          <strong>{cls === 'not-added' ? '加算されない' : '相続税の課税価格に加算される'}</strong>
        </p>
        <ClassChip cls={cls} />
        {cls === 'within-3y' && (
          <p className="hint" style={{ margin: '6px 0 0' }}>
            亡くなった人から受けた分の全額が加算されます（上の額がすべてその人からなら{yen(range.max)}。110万円以下の贈与や、贈与税を払った贈与も加算されます）。
          </p>
        )}
        {cls === 'extended-4y' && (
          <p className="hint" style={{ margin: '6px 0 0' }}>
            上の額がすべて亡くなった人からなら、加算される額は{yen(range.min)}〜{yen(range.max)}（延長4年分の贈与の合計から100万円までは加算されません）。
          </p>
        )}
      </div>

      <p>
        <strong>根拠：</strong>相続開始日 {formatJaDate(inheritance)} は国税庁 No.4161 の表の「{row.inheritance}」の行で、
        加算期間は<strong>{row.period}</strong>（{formatJaDate(period.from)}〜{formatJaDate(inheritance)}）。
        贈与日 {formatJaDate(gift)} は
        {cls === 'not-added'
          ? 'この期間の外です。'
          : cls === 'within-3y'
            ? 'このうち相続開始前3年以内です。'
            : 'このうち相続開始前3年より前（延長された4年分）です。'}
      </p>

      {cls === 'extended-4y' && (
        <div className="note">
          <strong>100万円の枠は、延長4年分に当たる贈与の合計に対して効きます。</strong>
          この画面は1回分の贈与日で判定しているので、同じ期間のほかの贈与で枠をどこまで使ったかは出せません
          （枠を{yen(EXTENDED_EXCLUSION)}すべてこの贈与に使えたときが下限です）。
        </div>
      )}

      <p className="hint">
        加算された贈与に対応する贈与税は、相続税から差し引かれます。加算の対象は相続や遺贈などで財産を取得した人です。
      </p>
    </>
  );
}

/** 早見表の区分セル。年の途中で区分が変わるときは日付つきで行を分ける */
function SegmentsCell({ segments, render }: { segments: HayamiSegment[]; render: (s: HayamiSegment) => React.ReactNode }) {
  if (segments.length === 1) return <>{render(segments[0])}</>;
  return (
    <>
      {segments.map((s, i) => (
        <div key={i} style={{ marginTop: i === 0 ? 0 : 4 }}>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)' }}>
            {i === 0 ? `〜${formatMd(s.to)}` : `${formatMd(s.from)}〜`}
          </div>
          {render(s)}
        </div>
      ))}
    </>
  );
}

/** 隣り合う区間のうち key が同じものをまとめる（判定の列は「加算／されない」だけで分ける） */
function mergeBy(segments: HayamiSegment[], key: (s: HayamiSegment) => boolean): HayamiSegment[] {
  const out: HayamiSegment[] = [];
  for (const s of segments) {
    const last = out.at(-1);
    if (last && key(last) === key(s)) out[out.length - 1] = { ...last, to: s.to };
    else out.push(s);
  }
  return out;
}

/** 相続開始日が空のとき：贈与日を固定して相続開始年を 2026〜2034 年で動かした早見表 */
function Hayami({ gift }: { gift: DateParts }) {
  const rows = hayamiTable(gift);
  return (
    <>
      <p style={{ marginBottom: 6 }}>
        <strong>{formatJaDate(gift)}の贈与</strong>は、相続がいつ起きると加算されるか：
      </p>
      <table style={{ fontSize: 'var(--fs-sm)' }}>
        <thead>
          <tr>
            <th style={tight}>相続開始年</th>
            <th style={tight}>判定</th>
            <th style={tight}>区分</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.year}>
              <td style={{ ...tight, ...rowLabel }}>{r.year}</td>
              <td style={tight}>
                <SegmentsCell
                  segments={mergeBy(r.segments, (s) => s.cls !== 'not-added')}
                  render={(s) => <span style={{ whiteSpace: 'nowrap' }}>{s.cls === 'not-added' ? 'されない' : '加算'}</span>}
                />
              </td>
              <td style={tight}>
                <SegmentsCell segments={r.segments} render={(s) => <ClassChip cls={s.cls} />} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        日付は相続開始日（その日を含む）。「延長4年分」は、延長4年分の贈与の合計から100万円までは加算されません。
        {gift.year < 2024 && '2024年より前の贈与は、2027年以後の相続では加算期間の外になります。'}
      </p>
    </>
  );
}

/** 精算課税を選んだとき */
function SettlementCheck({ amount }: { amount: number }) {
  const excess = Math.max(0, amount - BASIC_DEDUCTION);
  return (
    <div className="panel" style={{ textAlign: 'center' }}>
      <p style={{ margin: '0 0 6px' }}>
        精算課税の贈与は、<strong>年110万円の基礎控除以内なら加算されず、超えた分は年数に関係なく</strong>
        相続税の課税価格に加算されます。
      </p>
      <div className="metric">
        <span className="value">{excess.toLocaleString('ja-JP')}</span>
        <span className="unit">円</span>
        <span className="label">が相続時に加算される額（{yen(amount)} − 110万円）</span>
      </div>
      <p className="hint" style={{ margin: 0 }}>暦年課税の3〜7年の加算は受けません。2024年以後の贈与の場合です。</p>
    </div>
  );
}
