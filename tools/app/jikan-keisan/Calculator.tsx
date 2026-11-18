'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import {
  EXCEL_FORMULAS,
  WORK_ERROR_TEXT,
  calcWorkDay,
  decimalHoursToSec,
  formatDaysHm,
  formatDecimalHours,
  formatHm,
  formatYen,
  formatYen2,
  hmToSec,
  isWorkError,
  minutesToSec,
  parsePasted,
  parseWage,
  sumDurations,
  sumWorkDays,
  toWholeMinutes,
  wageAmount,
  type Rounding,
  type WorkDay,
} from '@/lib/jikan-keisan';
import PublicToolLink, { ToolLink } from '@/app/PublicToolLink';

/**
 * 時間計算の画面。ロジックは lib/jikan-keisan.ts。
 *
 * - **通信しない・保存しない。** 入力はこのコンポーネントの state にだけある（URL にも localStorage にも載せない。
 *   仕様書「送らない・残さない」・決めること 3 の既定）
 * - タブ3つは unix-jikan と同じ buttonStyle と aria-pressed の切り替えボタン（新しい部品を作らない）
 * - 勤務時間は表ではなく1日＝1枚の行（320px でも横スクロールを出さない）。合計は行の一覧の上
 */

const SLUG = 'jikan-keisan';

/** iOS Safari は 16px 未満の入力欄で拡大するので 16px（unix-jikan と同じ） */
const FONT_SIZE = 16;

const mono: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontVariantNumeric: 'tabular-nums',
  overflowWrap: 'anywhere',
};

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

const inputStyle: React.CSSProperties = { fontSize: FONT_SIZE, width: '100%', minWidth: 0, ...mono };

const small: React.CSSProperties = { fontSize: '0.85rem', color: 'var(--muted)', margin: 0 };

type Tab = 'work' | 'sum' | 'convert';
const TABS: { key: Tab; label: string }[] = [
  { key: 'work', label: '勤務時間' },
  { key: 'sum', label: '足し算・引き算' },
  { key: 'convert', label: '10進数 ⇔ 時分' },
];

/** 一度だけ送る（入力のたびに送らない。値そのものは送らない） */
function useTrackOnce() {
  const sent = useRef(new Set<string>());
  return useCallback((action: string) => {
    if (sent.current.has(action)) return;
    sent.current.add(action);
    trackToolUse(SLUG, action);
  }, []);
}

function useCopy(track: (action: string) => void) {
  const [copied, setCopied] = useState<string | null>(null);
  const onCopy = async (value: string, id: string, action = 'copy') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      track(action);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      // クリップボードが使えない環境では何もしない（表示を手で選んでコピーできる）
    }
  };
  return { copied, onCopy };
}

/** 深夜の幅：最小と最大が同じなら1つだけ */
const nightRange = (minSec: number, maxSec: number) =>
  minSec === maxSec ? formatHm(minSec) : `${formatHm(minSec)}〜${formatHm(maxSec)}`;

// ---------------------------------------------------------------------------
// A. 勤務時間
// ---------------------------------------------------------------------------

interface RowState {
  id: number;
  label: string | null;
  start: string;
  end: string;
  breakTime: string;
}

let nextId = 1;
const newRow = (start = '', end = '', breakTime = '', label: string | null = null): RowState => ({
  id: nextId++,
  label,
  start,
  end,
  breakTime,
});

function TimeInput({ id, label, value, onChange, placeholder }: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <label htmlFor={id} style={{ ...small, display: 'block' }}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // 320px 幅で 3 つの欄と実働を1段に並べるため、等幅にせず左右の余白も詰める（文字は 16px のまま）
        style={{ fontSize: FONT_SIZE, width: '100%', minWidth: 0, padding: '8px 4px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
      />
    </div>
  );
}

function WorkRow({ row, index, result, onChange, onRemove, canRemove }: {
  row: RowState;
  index: number;
  result: WorkDay | { error: keyof typeof WORK_ERROR_TEXT } | null;
  onChange: (patch: Partial<RowState>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ok = result && !isWorkError(result) ? result : null;
  const prefix = `jk-row-${row.id}`;
  const badges: string[] = [];
  if (ok) {
    if (ok.overnight) badges.push('日またぎ');
    if (ok.nightMaxSec > 0) badges.push(`深夜 ${nightRange(ok.nightMinSec, ok.nightMaxSec)}`);
    if (ok.over8Sec > 0) badges.push(`8h超 ${formatHm(ok.over8Sec)}`);
  }
  return (
    <li className="panel" style={{ margin: 0, padding: '8px 8px' }}>
      <div style={{ ...small, fontWeight: 600 }}>{row.label ?? `${index + 1}日目`}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', alignItems: 'flex-end' }}>
        <div
          style={{
            flex: '1 1 300px',
            minWidth: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr)) auto',
            gap: 4,
            alignItems: 'end',
          }}
        >
          <TimeInput id={`${prefix}-s`} label="出勤" value={row.start} onChange={(v) => onChange({ start: v })} placeholder="900" />
          <TimeInput id={`${prefix}-e`} label="退勤" value={row.end} onChange={(v) => onChange({ end: v })} placeholder="1800" />
          <TimeInput id={`${prefix}-b`} label="休憩" value={row.breakTime} onChange={(v) => onChange({ breakTime: v })} placeholder="60" />
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={`${prefix}-detail`}
            aria-label={`${row.label ?? `${index + 1}日目`}の実働 ${ok ? formatHm(ok.workSec) : '未入力'}。詳細を開く`}
            style={{ ...buttonStyle(open), padding: '4px 6px', textAlign: 'right' }}
          >
            <span style={{ ...small, display: 'block', fontWeight: 400 }}>実働</span>
            <span style={{ ...mono, fontSize: '1.05rem' }}>{ok ? formatHm(ok.workSec) : '—'}</span>
          </button>
        </div>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          {result && isWorkError(result) && (row.start || row.end || row.breakTime) && (
            <p style={{ ...small, color: 'var(--danger)' }}>{WORK_ERROR_TEXT[result.error]}</p>
          )}
          {ok && (badges.length > 0 || ok.breakShortage) && (
            <p style={small}>
              {badges.join('・')}
              {ok.breakShortage && (
                <strong style={{ color: 'var(--text)' }}>
                  {badges.length > 0 ? '・' : ''}休憩が{toWholeMinutes(ok.breakShortage.shortSec)}分足りないかも（{toWholeMinutes(ok.breakShortage.requiredSec)}分以上）
                </strong>
              )}
            </p>
          )}
        </div>
      </div>
      {open && (
        <div id={`${prefix}-detail`} style={{ marginTop: 8 }}>
          {ok ? (
            <p style={{ ...small, color: 'var(--text)' }}>
              拘束 <span style={mono}>{formatHm(ok.spanSec)}</span>・休憩 <span style={mono}>{formatHm(ok.breakSec)}</span>・
              実働 <span style={mono}>{formatHm(ok.workSec)}</span>（<span style={mono}>{formatDecimalHours(ok.workSec)}</span> 時間）・
              深夜帯の拘束 <span style={mono}>{formatHm(ok.nightSpanSec)}</span>
            </p>
          ) : (
            <p style={small}>出勤・退勤を入れると内訳が出ます。</p>
          )}
          {canRemove && (
            <button type="button" style={{ ...buttonStyle(), marginTop: 6 }} onClick={onRemove}>
              この行を消す
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function WorkTab({ track, copied, onCopy }: {
  track: (a: string) => void;
  copied: string | null;
  onCopy: (value: string, id: string, action?: string) => void;
}) {
  // 「入れたら変わる」型にするため、最初の1行に例を入れておく
  const [rows, setRows] = useState<RowState[]>(() => [{ id: 0, label: null, start: '9:00', end: '18:00', breakTime: '60' }]);
  const [rounding, setRounding] = useState<Rounding>('none');
  const [wageText, setWageText] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteMsg, setPasteMsg] = useState<string | null>(null);
  const touched = useRef(false);

  const results = useMemo(
    () => rows.map((r) => (r.start.trim() === '' && r.end.trim() === '' ? null : calcWorkDay(r))),
    [rows],
  );
  const valid = results.filter((r): r is WorkDay => r !== null && !isWorkError(r));
  const totals = sumWorkDays(valid, rounding);
  const wage = parseWage(wageText);
  const amount = wage !== null && valid.length > 0 ? wageAmount(totals.workSec, wage) : null;

  useEffect(() => {
    if (touched.current && valid.length > 0) track('calc');
  }, [valid.length, rows, track]);

  const update = (id: number, patch: Partial<RowState>) => {
    touched.current = true;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const loadPaste = (mode: 'replace' | 'append') => {
    const p = parsePasted(pasteText);
    if (p.rows.length === 0) {
      setPasteMsg('出勤・退勤（・休憩）の列が読めませんでした。Excel で2〜3列を選んでコピーし、そのまま貼り付けてください。');
      return;
    }
    touched.current = true;
    const added = p.rows.map((r) => newRow(r.start, r.end, r.breakTime, r.label));
    setRows((rs) => (mode === 'replace' ? added : [...rs.filter((r) => r.start || r.end), ...added]));
    const notes = [`${p.rows.length}行を読み込みました`];
    if (p.skipped.length) notes.push(`読めなかった行：${p.skipped.slice(0, 10).join('・')}${p.skipped.length > 10 ? ' ほか' : ''}行目`);
    if (p.truncated) notes.push(`${p.truncated}行は上限を超えたため読み込んでいません`);
    setPasteMsg(notes.join('。'));
    setPasteText('');
    setPasteOpen(false);
    track('paste');
  };

  const r = totals.rounded;
  const isRounded = rounding === 'kihatsu150';

  return (
    <>
      {/* 合計は一覧の上（20行を貼ったあと、スクロールせずに見える） */}
      <div className="panel quiet" style={{ marginTop: 0 }} aria-live="polite">
        <div className="hint" style={{ margin: 0 }}>{totals.days}日分の実働の合計</div>
        <div style={{ ...mono, fontSize: '1.6rem', fontWeight: 700 }}>
          {formatHm(totals.workSec)}
          <span style={{ fontSize: '1rem', fontWeight: 600 }}>（{formatDecimalHours(totals.workSec)} 時間）</span>
        </div>
        <ul style={{ ...small, color: 'var(--text)', paddingLeft: '1.2em', margin: '6px 0 0' }}>
          <li>拘束の合計 <span style={mono}>{formatHm(totals.spanSec)}</span>・休憩の合計 <span style={mono}>{formatHm(totals.breakSec)}</span></li>
          <li>
            深夜（22〜5時）の実働 <span style={mono}>{nightRange(totals.nightMinSec, totals.nightMaxSec)}</span>
            {isRounded && totals.nightMaxSec > 0 && <>（丸めると <span style={mono}>{nightRange(r.nightMinSec, r.nightMaxSec)}</span>）</>}
          </li>
          <li>
            8時間を超えた実働 <span style={mono}>{formatHm(totals.over8Sec)}</span>
            {isRounded && <>（丸めると <span style={mono}>{formatHm(r.over8Sec)}</span>）</>}
          </li>
          {totals.overnightDays > 0 && <li>日またぎ {totals.overnightDays}日</li>}
          {totals.breakShortDays > 0 && <li><strong>休憩が足りないかもしれない日 {totals.breakShortDays}日</strong>（労基法34条の目安）</li>}
          {amount && (
            <li>
              時給 {formatYen(wage!)} × 実働 = <strong style={mono}>{formatYen2(amount.hundredths)}</strong>
              （四捨五入した目安 <span style={mono}>{formatYen(amount.yenRounded)}</span>）
            </li>
          )}
        </ul>
        {totals.nightMinSec !== totals.nightMaxSec && (
          <p style={{ ...small, marginTop: 6 }}>
            深夜の実働は、休憩を全部深夜帯に取ったとき（少ないほう）から、全部深夜帯の外で取ったとき（多いほう）までの幅です。
            実際の深夜の時間は、休憩を取った時刻で決まります。
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
        <button type="button" style={buttonStyle(pasteOpen)} aria-pressed={pasteOpen} onClick={() => setPasteOpen((o) => !o)}>
          Excel から貼り付け
        </button>
        <button
          type="button"
          style={buttonStyle()}
          onClick={() => {
            touched.current = true;
            setRows((rs) => [...rs, newRow()]);
          }}
        >
          行を足す
        </button>
        <button
          type="button"
          style={buttonStyle()}
          onClick={() => {
            setRows([newRow()]);
            setPasteMsg(null);
          }}
        >
          すべて消す
        </button>
      </div>

      {pasteOpen && (
        <div className="field">
          <label htmlFor="jk-paste">出勤・退勤・休憩の列（タブ・カンマ区切り。先頭に日付の列があってもよい）</label>
          <textarea
            id="jk-paste"
            rows={6}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={'9:00\t18:00\t1:00\n22:00\t7:00\t60'}
            spellCheck={false}
            style={{ ...inputStyle, width: '100%' }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <button type="button" style={buttonStyle(true)} onClick={() => loadPaste('replace')}>読み込む（置き換え）</button>
            <button type="button" style={buttonStyle()} onClick={() => loadPaste('append')}>下に足す</button>
          </div>
        </div>
      )}
      {pasteMsg && <p className="hint">{pasteMsg}</p>}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {rows.map((row, i) => (
          <WorkRow
            key={row.id}
            row={row}
            index={i}
            result={results[i]}
            onChange={(patch) => update(row.id, patch)}
            onRemove={() => setRows((rs) => rs.filter((x) => x.id !== row.id))}
            canRemove={rows.length > 1}
          />
        ))}
      </ul>
      <p className="hint">
        時刻は 900・1730 のように数字だけでも入ります。退勤が出勤より前なら翌日（夜勤）、26:00 のような25時表記も使えます。休憩は 60（分）・1:00・100（＝1:00）。
      </p>

      <div className="field-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
        <div className="field" style={{ flex: '1 1 160px', minWidth: 0 }}>
          <label htmlFor="jk-wage">時給（任意）</label>
          <input
            id="jk-wage"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="例 1226"
            value={wageText}
            onChange={(e) => setWageText(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div className="field" style={{ flex: '2 1 260px', minWidth: 0 }}>
          <span className="field-label">月の合計の丸め</span>
          <div role="group" aria-label="月の合計の丸め" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={buttonStyle(!isRounded)} aria-pressed={!isRounded} onClick={() => setRounding('none')}>丸めない</button>
            <button type="button" style={buttonStyle(isRounded)} aria-pressed={isRounded} onClick={() => setRounding('kihatsu150')}>30分で丸める</button>
          </div>
        </div>
      </div>
      <p className="hint">
        丸めは「8時間を超えた時間」と「深夜」の月の合計にだけ当てます（基発第150号：30分未満は切り捨て、30分以上は1時間に切り上げ）。
        実働の合計・1日ごとの値・時給の額は丸めません。時給の額は時間外・深夜の割増を含みません
        <PublicToolLink slug="zangyodai-keisan">
          （割増は<ToolLink slug="zangyodai-keisan">残業代の計算機</ToolLink>で）
        </PublicToolLink>
        。円未満の扱いは就業規則・賃金規程によります。
      </p>

      <h3 style={{ fontSize: '1rem', marginTop: 20 }}>同じ計算の Excel の式（A列=出勤・B列=退勤・C列=休憩）</h3>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {EXCEL_FORMULAS.map((f) => (
          <li key={f.key} className="panel" style={{ margin: 0, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ minWidth: 0 }}>
              <div className="hint" style={{ margin: 0 }}>{f.label}</div>
              <div style={{ ...mono, fontWeight: 700 }}>{f.formula}</div>
              <div className="hint" style={{ margin: 0 }}>{f.note}</div>
            </div>
            <button
              type="button"
              onClick={() => onCopy(f.formula, `xl-${f.key}`, 'copy-excel')}
              style={{ ...buttonStyle(), flexShrink: 0 }}
              aria-label={`${f.label}の式をコピー`}
            >
              {copied === `xl-${f.key}` ? 'コピーしました' : 'コピー'}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------
// B. 足し算・引き算
// ---------------------------------------------------------------------------

function SumTab({ track, copied, onCopy }: {
  track: (a: string) => void;
  copied: string | null;
  onCopy: (value: string, id: string, action?: string) => void;
}) {
  const [text, setText] = useState('1:30\n+ 0:50\n− 0:15');
  const result = useMemo(() => sumDurations(text), [text]);
  const has = result.terms.length > 0;
  const total = result.totalSec;
  const rows = has
    ? [
        { id: 'hm', label: '時:分', value: formatHm(total) },
        { id: 'min', label: '合計の分', value: `${total < 0 ? '−' : ''}${Math.abs(toWholeMinutes(total)).toLocaleString('ja-JP')}分${total % 60 ? `${Math.abs(total % 60)}秒` : ''}` },
        { id: 'dec', label: '10進数の時間', value: `${formatDecimalHours(total)} 時間` },
        { id: 'days', label: '日と時間', value: formatDaysHm(total) },
      ]
    : [];
  return (
    <>
      <div className="field">
        <label htmlFor="jk-sum">足す・引く時間（1行に1つ。行頭の − で引く。1行に式で書いてもよい）</label>
        <textarea
          id="jk-sum"
          rows={6}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            track('calc');
          }}
          spellCheck={false}
          style={{ ...inputStyle, width: '100%' }}
        />
        <p className="hint">1:30・1:30:15・90分・1.5時間・1時間30分を混ぜて書けます。単位のない数は「時間」として読みます。</p>
      </div>
      {result.errors.length > 0 && (
        <div className="note">読めなかったところ：{result.errors.slice(0, 5).join('・')}（合計には入れていません）</div>
      )}
      {has && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }} aria-live="polite">
          {rows.map((row) => (
            <li key={row.id} className="panel" style={{ margin: 0, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ minWidth: 0 }}>
                <div className="hint" style={{ margin: 0 }}>{row.label}</div>
                <div style={{ ...mono, fontWeight: 700, fontSize: row.id === 'hm' ? '1.4rem' : undefined }}>{row.value}</div>
              </div>
              <button type="button" onClick={() => onCopy(row.value, `sum-${row.id}`)} style={{ ...buttonStyle(), flexShrink: 0 }} aria-label={`${row.label}をコピー`}>
                {copied === `sum-${row.id}` ? 'コピーしました' : 'コピー'}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">24時間を超えても 0:30 のように戻らず、24:30 と出します。Excel で同じ表示にするにはセルの表示形式を [h]:mm にします。</p>
    </>
  );
}

// ---------------------------------------------------------------------------
// C. 10進数 ⇔ 時分
// ---------------------------------------------------------------------------

function ConvertField({ id, label, placeholder, inputMode, value, onChange, output }: {
  id: string;
  label: string;
  placeholder: string;
  inputMode: 'numeric' | 'decimal' | 'text';
  value: string;
  onChange: (v: string) => void;
  output: string | null;
}) {
  return (
    <div className="panel" style={{ margin: 0 }}>
      <label htmlFor={id} className="hint" style={{ margin: 0, display: 'block' }}>{label}</label>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          id={id}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...inputStyle, flex: '1 1 120px', width: 'auto' }}
        />
        <span aria-hidden="true">→</span>
        <output htmlFor={id} style={{ ...mono, fontWeight: 700, fontSize: '1.2rem', flex: '1 1 120px' }}>
          {value.trim() === '' ? '—' : output ?? '読めません'}
        </output>
      </div>
    </div>
  );
}

function ConvertTab({ track }: { track: (a: string) => void }) {
  const [hm, setHm] = useState('7:45');
  const [dec, setDec] = useState('7.8');
  const [min, setMin] = useState('465');
  const hmSec = hmToSec(hm);
  const decSec = decimalHoursToSec(dec);
  const minSec = minutesToSec(min);
  const on = (set: (v: string) => void) => (v: string) => {
    set(v);
    track('calc');
  };
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <ConvertField
        id="jk-hm"
        label="時:分 → 10進数の時間"
        placeholder="7:45"
        inputMode="text"
        value={hm}
        onChange={on(setHm)}
        output={hmSec === null ? null : `${formatDecimalHours(hmSec)} 時間（${toWholeMinutes(hmSec).toLocaleString('ja-JP')}分）`}
      />
      <ConvertField
        id="jk-dec"
        label="10進数の時間 → 時:分"
        placeholder="7.8"
        inputMode="decimal"
        value={dec}
        onChange={on(setDec)}
        output={decSec === null ? null : formatHm(decSec)}
      />
      <ConvertField
        id="jk-min"
        label="分 → 時:分"
        placeholder="465"
        inputMode="numeric"
        value={min}
        onChange={on(setMin)}
        output={minSec === null ? null : `${formatHm(minSec)}（${formatDecimalHours(minSec)} 時間）`}
      />
      <p className="hint" style={{ margin: 0 }}>
        10進数は分を整数で持ってから60で割り、表示のときだけ小数第2位で丸めます（7:20 は 7.333… 時間で、7.33 と出します）。
        時給を掛けるときは、丸めた 7.33 ではなく 7:20 のまま掛けてください（勤務時間のタブの時給の欄はそうしています）。
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function Calculator() {
  const [tab, setTab] = useState<Tab>('work');
  const track = useTrackOnce();
  const { copied, onCopy } = useCopy(track);
  return (
    <div className="card">
      <div role="group" aria-label="計算の種類" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" style={buttonStyle(tab === t.key)} aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'work' && <WorkTab track={track} copied={copied} onCopy={onCopy} />}
      {tab === 'sum' && <SumTab track={track} copied={copied} onCopy={onCopy} />}
      {tab === 'convert' && <ConvertTab track={track} />}
      <p className="hint" style={{ marginBottom: 0 }}>入力はこの画面の中だけで計算し、どこにも送りません。保存もしません（閉じると消えます）。</p>
    </div>
  );
}
