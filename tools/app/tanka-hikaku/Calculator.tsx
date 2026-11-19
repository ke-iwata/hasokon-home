'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import {
  DEFAULT_PER,
  DEFAULT_TAX,
  UNITS,
  defaultName,
  formatChange,
  formatNumber,
  formatQty,
  formatUnitPrice,
  itemCountBucket,
  parseLooseNumber,
  parsePack,
  rank,
  rankedOnly,
  shrinkflation,
  taxChoices,
  type ItemInput,
  type PerScale,
  type TaxChoice,
  type UnitId,
} from '@/lib/tanka-hikaku';

/**
 * 単価比較 計算機の UI。計算は lib/tanka-hikaku.ts だけが持つ。
 *
 * 仕様: docs/features/tanka-hikaku.md
 *
 * - 1品＝1枚のカード（表の1行に7欄を並べない。390px で横スクロールを出さない）
 * - 入り数と割引はカードの中の折りたたみ（使う人だけ開く）
 * - 結果も横長の表にせず、安い順のカードの並び
 * - タブの切り替えは jikan-keisan と同じ buttonStyle と aria-pressed のボタン。
 *   2つのタブは常にマウントしたまま表示だけ切り替える（入力を消さない）
 * - `localStorage` に残すのは「何あたりで比べるか」の選択だけ（値段は残さない）
 * - `tool_use` は「比較を出した」「実質値上げ率を出した」の2種。品数の区分（2・3・4以上）だけ付ける
 */

const SLUG = 'tanka-hikaku';
const PER_KEY = 'hasokon:tanka-hikaku:per';

/** iOS Safari は 16px 未満の入力欄で拡大するので 16px */
const FONT_SIZE = 16;

const buttonStyle = (active = false): React.CSSProperties => ({
  minHeight: 44,
  padding: '8px 14px',
  borderRadius: 8,
  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
  background: active ? 'var(--accent-soft)' : 'var(--surface)',
  color: 'var(--text)',
  fontSize: 'var(--fs-sm)',
  fontWeight: 600,
  cursor: 'pointer',
});

const chipButton = (active: boolean): React.CSSProperties => ({
  cursor: 'pointer',
  padding: '6px 12px',
  minHeight: 36,
  borderColor: active ? 'var(--accent)' : undefined,
  background: active ? 'var(--accent-soft)' : undefined,
  color: active ? 'var(--text)' : undefined,
});

const inputStyle: React.CSSProperties = {
  fontSize: FONT_SIZE,
  width: '100%',
  minWidth: 0,
  fontVariantNumeric: 'tabular-nums',
};

const small: React.CSSProperties = { fontSize: '0.85rem', color: 'var(--muted)', margin: 0 };

/** 入力欄の文字列のまま持つ（全角や「円」を入れても消さない） */
interface Row {
  id: number;
  name: string;
  price: string;
  tax: TaxChoice;
  qty: string;
  unit: UnitId;
  pack1: string;
  pack2: string;
  yenOff: string;
  percentOff: string;
  pointPercent: string;
}

const emptyRow = (id: number, over: Partial<Row> = {}): Row => ({
  id,
  name: '',
  price: '',
  tax: DEFAULT_TAX,
  qty: '',
  unit: 'g',
  pack1: '',
  pack2: '',
  yenOff: '',
  percentOff: '',
  pointPercent: '',
  ...over,
});

/** 初めて開いたときの例（大袋と小袋） */
const INITIAL_ROWS: Row[] = [
  emptyRow(1, { price: '498', qty: '1', unit: 'kg' }),
  emptyRow(2, { price: '198', qty: '300', unit: 'g' }),
];

/** 空欄は 0（使わない）、それ以外は読めた数（読めなければ NaN） */
function optional(str: string): number {
  return str.trim() === '' ? 0 : parseLooseNumber(str);
}

function toItem(row: Row): ItemInput {
  const packs = [parsePack(row.pack1), parsePack(row.pack2)].filter((p): p is number => p !== null);
  return {
    name: row.name,
    price: parseLooseNumber(row.price),
    tax: row.tax,
    qty: parseLooseNumber(row.qty),
    unit: row.unit,
    packs,
    discounts: {
      yenOff: optional(row.yenOff),
      percentOff: optional(row.percentOff),
      pointPercent: optional(row.pointPercent),
    },
  };
}

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 同じ action を1ページで何度も送らない */
function useTrackOnce() {
  const sent = useRef(new Set<string>());
  return (action: string) => {
    if (sent.current.has(action)) return;
    sent.current.add(action);
    trackToolUse(SLUG, action);
  };
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <label style={{ display: 'block', minWidth: 0 }}>
      <span className="field-label" style={{ display: 'block', marginBottom: 4 }}>
        {label}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle}
        />
        {suffix && <span style={{ whiteSpace: 'nowrap' }}>{suffix}</span>}
      </span>
    </label>
  );
}

function ItemCard({
  row,
  index,
  canRemove,
  taxOptions,
  message,
  onChange,
  onRemove,
}: {
  row: Row;
  index: number;
  canRemove: boolean;
  taxOptions: { id: TaxChoice; label: string }[];
  message?: string;
  onChange: (next: Partial<Row>) => void;
  onRemove: () => void;
}) {
  const packTotal = useMemo(() => {
    const qty = parseLooseNumber(row.qty);
    const packs = [parsePack(row.pack1), parsePack(row.pack2)].filter((p): p is number => p !== null);
    if (packs.length === 0 || !(qty > 0) || !packs.every((p) => p > 0)) return null;
    return Number(packs.reduce((a, p) => a * p, qty).toPrecision(12));
  }, [row.qty, row.pack1, row.pack2]);
  const hasDiscount = row.yenOff.trim() !== '' || row.percentOff.trim() !== '' || row.pointPercent.trim() !== '';
  const hasPack = row.pack1.trim() !== '' || row.pack2.trim() !== '';

  return (
    <div className="card" style={{ padding: 14, margin: 0, minWidth: 0 }}>
      {/* 1段目：名前と削除 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <input
          type="text"
          aria-label={`${index + 1}品目の名前（任意）`}
          placeholder={`${defaultName(index)}（名前は任意）`}
          value={row.name}
          onChange={(e) => onChange({ name: e.target.value })}
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          type="button"
          aria-label={`${row.name.trim() || defaultName(index)} を削除`}
          disabled={!canRemove}
          onClick={onRemove}
          style={{ ...buttonStyle(), minWidth: 44, padding: '8px 12px', opacity: canRemove ? 1 : 0.4, cursor: canRemove ? 'pointer' : 'not-allowed' }}
        >
          ×
        </button>
      </div>

      {/* 2段目：値段と税 */}
      <div style={{ marginBottom: 10 }}>
        <NumberField label="値段" value={row.price} onChange={(v) => onChange({ price: v })} suffix="円" placeholder="298" />
        <div role="group" aria-label="税の扱い" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {taxOptions.map((t) => (
            <button
              key={t.id}
              type="button"
              className="chip"
              aria-pressed={row.tax === t.id}
              style={chipButton(row.tax === t.id)}
              onClick={() => onChange({ tax: t.id })}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3段目：内容量と単位 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'end' }}>
        <NumberField label="内容量" value={row.qty} onChange={(v) => onChange({ qty: v })} placeholder="350" />
        <label>
          <span className="field-label" style={{ display: 'block', marginBottom: 4 }}>
            単位
          </span>
          <select value={row.unit} onChange={(e) => onChange({ unit: e.target.value as UnitId })} style={{ fontSize: FONT_SIZE, minHeight: 40 }}>
            {UNITS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.id}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* 入り数（折りたたみ） */}
      <details style={{ marginTop: 10 }} open={hasPack || undefined}>
        <summary style={{ cursor: 'pointer' }}>入り数（「×6缶×2パック」のとき）</summary>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8, marginTop: 8 }}>
          <NumberField label="× 入り数" value={row.pack1} onChange={(v) => onChange({ pack1: v })} placeholder="6" />
          <NumberField label="× パック数" value={row.pack2} onChange={(v) => onChange({ pack2: v })} placeholder="2" />
        </div>
        {packTotal !== null && (
          <p style={{ ...small, marginTop: 6 }}>
            合計の内容量：{formatNumber(packTotal, 3)}
            {row.unit}
          </p>
        )}
      </details>

      {/* 割引（折りたたみ） */}
      <details style={{ marginTop: 8 }} open={hasDiscount || undefined}>
        <summary style={{ cursor: 'pointer' }}>割引・ポイント</summary>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginTop: 8 }}>
          <NumberField label="◯円引き" value={row.yenOff} onChange={(v) => onChange({ yenOff: v })} suffix="円" placeholder="30" />
          <NumberField label="◯%引き" value={row.percentOff} onChange={(v) => onChange({ percentOff: v })} suffix="%" placeholder="20" />
          <NumberField label="ポイント" value={row.pointPercent} onChange={(v) => onChange({ pointPercent: v })} suffix="%" placeholder="5" />
        </div>
        <p style={{ ...small, marginTop: 6 }}>
          円引き → %引き → 税込の順に掛けます（入れた値段に掛け、税抜の行は割引のあとで税込に直します）。
          ポイントは支払う額に含めず、比べるときの実質の値段にだけ入れます（税込の支払額に掛けて計算。店により異なります）。
        </p>
      </details>

      {message && (
        <p className="hint" role="status" style={{ margin: '8px 0 0', color: 'var(--text)' }}>
          {message}
        </p>
      )}
    </div>
  );
}

function CompareTab({ track, taxOptions }: { track: (a: string) => void; taxOptions: { id: TaxChoice; label: string }[] }) {
  const [rows, setRows] = useState<Row[]>(INITIAL_ROWS);
  const nextId = useRef(INITIAL_ROWS.length + 1);
  const [per, setPer] = useState<PerScale>(DEFAULT_PER);

  // 何あたりで比べるかだけを端末に残す（値段は残さない）
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PER_KEY);
      if (saved === 'small' || saved === 'large') setPer(saved);
    } catch {
      /* 使えない環境では既定のまま */
    }
  }, []);
  const choosePer = (p: PerScale) => {
    setPer(p);
    try {
      localStorage.setItem(PER_KEY, p);
    } catch {
      /* 残せなくても計算は続ける */
    }
  };

  const results = useMemo(() => rank(rows.map(toItem), per), [rows, per]);
  const ranked = useMemo(() => rankedOnly(results), [results]);
  const best = ranked[0];

  // 2品以上が並んだら「比較を出した」を1回だけ（初期の例のままでは送らない）
  const touched = useRef(false);
  useEffect(() => {
    if (touched.current && ranked.length >= 2) track(`compare-${itemCountBucket(ranked.length)}`);
  }, [ranked.length, track]);

  const update = (id: number, next: Partial<Row>) => {
    touched.current = true;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...next } : r)));
  };
  const remove = (id: number) => {
    touched.current = true;
    setRows((rs) => (rs.length <= 2 ? rs : rs.filter((r) => r.id !== id)));
  };
  const add = () => {
    touched.current = true;
    setRows((rs) => {
      const last = rs[rs.length - 1];
      // 単位と税は直前の行に合わせる（同じ棚の品を続けて入れることが多い）
      return [...rs, emptyRow(nextId.current++, { unit: last?.unit ?? 'g', tax: last?.tax ?? DEFAULT_TAX })];
    });
  };
  const clearAll = () => {
    touched.current = true;
    nextId.current += 2;
    setRows([emptyRow(nextId.current - 2), emptyRow(nextId.current - 1)]);
  };

  const perOptions: { id: PerScale; label: string }[] = useMemo(() => {
    const kind = best?.quantity?.kind ?? 'mass';
    if (kind === 'volume') return [{ id: 'small', label: '100mlあたり' }, { id: 'large', label: '1Lあたり' }];
    if (kind === 'count') {
      const u = best?.quantity?.baseUnit ?? '個';
      return [{ id: 'small', label: `1${u}あたり` }, { id: 'large', label: `10${u}あたり` }];
    }
    return [{ id: 'small', label: '100gあたり' }, { id: 'large', label: '1kgあたり' }];
  }, [best]);

  const hasPoints = ranked.some((r) => (r.price?.points ?? 0) > 0);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 12 }}>
        {rows.map((row, i) => {
          const r = results[i];
          return (
            <ItemCard
              key={row.id}
              row={row}
              index={i}
              canRemove={rows.length > 2}
              taxOptions={taxOptions}
              message={r.status === 'mismatch' ? r.message : undefined}
              onChange={(next) => update(row.id, next)}
              onRemove={() => remove(row.id)}
            />
          );
        })}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <button type="button" style={buttonStyle(true)} onClick={add}>
          ＋ 品を足す
        </button>
        <button type="button" style={buttonStyle()} onClick={clearAll}>
          すべて消す
        </button>
      </div>

      <h2 style={{ marginTop: 24 }}>安い順</h2>
      <div role="group" aria-label="何あたりで比べるか" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {perOptions.map((p) => (
          <button key={p.id} type="button" style={buttonStyle(per === p.id)} aria-pressed={per === p.id} onClick={() => choosePer(p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      {ranked.length === 0 ? (
        <p className="hint">値段と内容量を入れると、ここに安い順に並びます。</p>
      ) : (
        <div aria-live="polite" style={{ display: 'grid', gap: 10 }}>
          {ranked.map((r) => (
            <div key={r.index} className={r.cheapest ? 'panel' : 'panel quiet'} style={{ margin: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <strong style={{ overflowWrap: 'anywhere' }}>
                  {r.rank}. {r.name}
                </strong>
                {r.cheapest ? (
                  <span className="chip" style={{ color: 'var(--accent-strong)', borderColor: 'var(--accent)' }}>
                    いちばん安い
                  </span>
                ) : r.nearlySame ? (
                  <span className="chip">ほぼ同じ（差 0.1% 未満）</span>
                ) : (
                  <span className="chip">
                    {formatUnitPrice(r.diffYen as number)}円（{formatNumber(r.diffPercent as number, 1)}%）高い
                  </span>
                )}
              </div>
              <div className="metric" style={{ marginTop: 4 }}>
                <span className="label">{r.perLabel}あたり</span>
                <span className="value">{formatUnitPrice(r.effectiveUnitPrice as number)}</span>
                <span className="unit">円</span>
              </div>
              <p style={small}>
                {formatNumber(r.price!.pay)}円
                {r.price!.points > 0 && `（${formatNumber(r.price!.points, 0)}ポイント → 実質 ${formatNumber(r.price!.effective)}円）`}
                ／{formatQty(r.quantity!.base, r.quantity!.baseUnit)}
                {r.price!.orderNote && `／${r.price!.orderNote}`}
                {r.price!.points > 0 && `／支払額では ${formatUnitPrice(r.unitPrice as number)}円`}
              </p>
              {!r.cheapest && r.sameMoneyQty !== undefined && best && (
                <p style={{ ...small, marginTop: 4 }}>
                  同じ {formatNumber(r.price!.effective)}円 なら、{best.name}は {formatQty(r.sameMoneyQty, best.quantity!.baseUnit)} 買える
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      {results.some((r) => r.status === 'mismatch') && (
        <p className="hint" style={{ marginTop: 8 }}>
          重さ（g・kg）と量（ml・L）は比重で換算しません。個・枚・本・回分は同じ単位どうしだけ比べます。単位の違う品は順位から外しています。
        </p>
      )}
      {hasPoints && (
        <p className="hint" style={{ marginTop: 8 }}>
          順位はポイントを引いた実質の単価で付けています。ポイントを税抜の額に掛ける店や、端数の扱いが違う店もあります。
        </p>
      )}
    </div>
  );
}

function ShrinkTab({ track }: { track: (a: string) => void }) {
  const [beforePrice, setBeforePrice] = useState('198');
  const [beforeQty, setBeforeQty] = useState('200');
  const [beforeUnit, setBeforeUnit] = useState<UnitId>('g');
  const [afterPrice, setAfterPrice] = useState('198');
  const [afterQty, setAfterQty] = useState('180');
  const [afterUnit, setAfterUnit] = useState<UnitId>('g');
  const touched = useRef(false);
  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    touched.current = true;
    set(v);
  };

  const result = useMemo(
    () =>
      shrinkflation(
        { price: parseLooseNumber(beforePrice), qty: parseLooseNumber(beforeQty), unit: beforeUnit },
        { price: parseLooseNumber(afterPrice), qty: parseLooseNumber(afterQty), unit: afterUnit },
      ),
    [beforePrice, beforeQty, beforeUnit, afterPrice, afterQty, afterUnit],
  );
  useEffect(() => {
    if (touched.current && result) track('shrinkflation');
  }, [result, track]);

  const side = (
    title: string,
    price: string,
    setP: (v: string) => void,
    qty: string,
    setQ: (v: string) => void,
    unit: UnitId,
    setU: (v: UnitId) => void,
  ) => (
    <div className="card" style={{ padding: 14, margin: 0, minWidth: 0 }}>
      <p style={{ margin: '0 0 8px', fontWeight: 700 }}>{title}</p>
      <NumberField label="値段" value={price} onChange={setP} suffix="円" />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'end', marginTop: 8 }}>
        <NumberField label="内容量" value={qty} onChange={setQ} />
        <label>
          <span className="field-label" style={{ display: 'block', marginBottom: 4 }}>
            単位
          </span>
          <select value={unit} onChange={(e) => setU(e.target.value as UnitId)} style={{ fontSize: FONT_SIZE, minHeight: 40 }}>
            {UNITS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.id}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 12 }}>
        {side('前', beforePrice, touch(setBeforePrice), beforeQty, touch(setBeforeQty), beforeUnit, touch(setBeforeUnit))}
        {side('今', afterPrice, touch(setAfterPrice), afterQty, touch(setAfterQty), afterUnit, touch(setAfterUnit))}
      </div>
      {result === null ? (
        <p className="hint" style={{ marginTop: 12 }}>
          前と今の値段・内容量を入れてください（単位は g と kg、ml と L のように同じ系統どうしで）。
        </p>
      ) : (
        <div className="panel" aria-live="polite">
          <div className="metric">
            <span className="label">単価の変化（実質の値上げ率）</span>
            <span className="value">{formatChange(result.unitPct)}</span>
          </div>
          <dl className="kv" style={{ marginTop: 8 }}>
            <div>
              <dt>値段の変化</dt>
              <dd>{formatChange(result.pricePct)}</dd>
            </div>
            <div>
              <dt>内容量の変化</dt>
              <dd>{formatChange(result.qtyPct)}</dd>
            </div>
          </dl>
          <p className="hint" style={{ marginTop: 4 }}>
            単価の変化率 ＝（今の値段 ÷ 今の内容量）÷（前の値段 ÷ 前の内容量）− 1。値段が同じでも、量が減れば単価は上がります。
          </p>
        </div>
      )}
    </div>
  );
}

type Tab = 'compare' | 'shrink';

const TABS: { key: Tab; label: string }[] = [
  { key: 'compare', label: 'どっちが安い？' },
  { key: 'shrink', label: '実質値上げ率' },
];

export default function Calculator() {
  const [tab, setTab] = useState<Tab>('compare');
  const sent = useTrackOnce();
  const track = useRef(sent).current;
  // 1% の選択肢は日付で出し分ける。静的HTMLは2026年のビルドなので、ブラウザの日付で差し替える
  const [taxOptions, setTaxOptions] = useState(() => taxChoices('2000-01-01'));
  useEffect(() => setTaxOptions(taxChoices(today())), []);

  return (
    <div>
      <div role="group" aria-label="計算の種類" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" style={buttonStyle(tab === t.key)} aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <div hidden={tab !== 'compare'}>
        <CompareTab track={track} taxOptions={taxOptions} />
      </div>
      <div hidden={tab !== 'shrink'}>
        <ShrinkTab track={track} />
      </div>
      <p className="hint" style={{ marginTop: 14 }}>
        入力はこの画面の中だけで計算し、どこにも送りません。端末に残すのは「何あたりで比べるか」の選択だけです。
      </p>
    </div>
  );
}
