'use client';

import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AUTO_COMPARE_MAX_CHARS,
  DEBOUNCE_MS,
  IGNORE_LABELS,
  MAX_LINE_D,
  NO_IGNORE,
  SLOW_NOTICE_MS,
  activeIgnoreLabels,
  collapseRows,
  compareAction,
  compareTexts,
  formatUnified,
  lineCount,
  sizeBucket,
  type CollapsedItem,
  type CompareResult,
  type IgnoreOptions,
  type LineRef,
  type Row,
  type Segment,
} from '@/lib/text-hikaku';
import { trackToolUse } from '@/lib/analytics';

/**
 * テキスト比較の画面。ロジックは lib/text-hikaku.ts。
 *
 * - **通信しない。** 入力はこのコンポーネントの state にだけあり、保存もしない。
 *   ファイルは FileReader で読むだけ
 * - 貼った文字列は React のテキストとして描くだけ（HTML として解釈しない）
 * - 計算は Web Worker で回す。2 秒を超えたら「比べています…」と中止ボタン
 */

const SLUG = 'text-hikaku';

/** 一度に描き足す行数 */
const RENDER_CHUNK = 800;

/** これ以上の幅なら左右並び（仕様「出力」） */
const WIDE_MIN_PX = 900;

type View = 'split' | 'unified';

const mono: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 14,
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  tabSize: 4,
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
  whiteSpace: 'nowrap',
});

const bandStyle = (tone: 'ok' | 'warn' | 'info'): React.CSSProperties => ({
  padding: '10px 14px',
  borderRadius: 8,
  margin: '10px 0 0',
  background: tone === 'ok' ? 'var(--ok-soft)' : tone === 'info' ? 'var(--info-soft)' : 'var(--warn-bg)',
  color: tone === 'ok' ? 'var(--ok-fg)' : 'var(--text)',
  border: tone === 'warn' ? '1px solid var(--warn-border)' : '1px solid transparent',
  fontSize: 'var(--fs-sm)',
});

/** 行の地の色と、変わった文字の濃い色 */
const TONE = {
  del: { bg: 'var(--danger-soft)', strong: 'color-mix(in srgb, var(--danger) 32%, transparent)', sign: '−' },
  add: { bg: 'var(--ok-soft)', strong: 'color-mix(in srgb, var(--ok-fg) 32%, transparent)', sign: '＋' },
  chg: { bg: 'var(--warn-bg)', strong: 'color-mix(in srgb, var(--warn-border) 45%, transparent)', sign: '' },
} as const;

type Tone = keyof typeof TONE;

const nf = new Intl.NumberFormat('ja-JP');

/** 一片の列を描く。見えない文字は印に置き換えて、呼び名を title に入れる */
function Segs({ segs, tone }: { segs: Segment[]; tone: Tone }) {
  return (
    <>
      {segs.map((s, i) =>
        s.invisible ? (
          <span
            key={i}
            title={s.invisible.name}
            aria-label={s.invisible.name}
            style={{
              background: TONE[tone].strong,
              color: 'var(--muted)',
              outline: '1px dashed var(--muted)',
              borderRadius: 2,
              padding: '0 1px',
            }}
          >
            {s.invisible.mark}
          </span>
        ) : s.changed ? (
          <mark key={i} style={{ background: TONE[tone].strong, color: 'inherit', borderRadius: 2 }}>
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

const numStyle: React.CSSProperties = {
  color: 'var(--muted)',
  textAlign: 'right',
  padding: '0 6px',
  userSelect: 'none',
  fontVariantNumeric: 'tabular-nums',
  fontSize: 12,
};

function Cell({ line, segs, tone }: { line?: LineRef; segs?: Segment[]; tone?: Tone }) {
  const bg = tone ? TONE[tone].bg : undefined;
  return (
    <>
      <div style={{ ...numStyle, background: bg }}>{line?.no ?? ''}</div>
      <div style={{ ...mono, padding: '0 8px', background: bg, minWidth: 0 }}>
        {line ? segs && tone ? <Segs segs={segs} tone={tone} /> : line.text : ''}
        {line && line.text === '' ? '​' : null}
      </div>
    </>
  );
}

/** 左右並びの 1 行 */
const SplitRow = memo(function SplitRow({ row }: { row: Row }) {
  switch (row.kind) {
    case 'equal':
      return (
        <>
          <Cell line={row.left} />
          <Cell line={row.right} />
        </>
      );
    case 'change':
      return (
        <>
          <Cell line={row.left} segs={row.leftSegs} tone="chg" />
          <Cell line={row.right} segs={row.rightSegs} tone="chg" />
        </>
      );
    case 'delete':
      return (
        <>
          <Cell line={row.left} segs={row.segs} tone="del" />
          <Cell />
        </>
      );
    case 'insert':
      return (
        <>
          <Cell />
          <Cell line={row.right} segs={row.segs} tone="add" />
        </>
      );
    case 'skipped':
      return (
        <>
          <div style={{ ...numStyle, opacity: 0.5 }}>{row.left?.no ?? ''}</div>
          <div style={{ ...mono, opacity: 0.5, padding: '0 8px' }}>{row.left?.text ?? ''}</div>
          <div style={{ ...numStyle, opacity: 0.5 }}>{row.right?.no ?? ''}</div>
          <div style={{ ...mono, opacity: 0.5, padding: '0 8px' }}>{row.right?.text ?? ''}</div>
        </>
      );
  }
});

function UnifiedLine({ sign, no, segs, text, tone, dim }: {
  sign: string;
  no?: number;
  segs?: Segment[];
  text?: string;
  tone?: Tone;
  dim?: boolean;
}) {
  const bg = tone ? TONE[tone].bg : undefined;
  return (
    <>
      <div style={{ ...numStyle, background: bg, opacity: dim ? 0.5 : 1 }}>{no ?? ''}</div>
      <div style={{ ...mono, background: bg, padding: '0 4px', color: 'var(--muted)', userSelect: 'none' }}>{sign}</div>
      <div style={{ ...mono, background: bg, padding: '0 8px', minWidth: 0, opacity: dim ? 0.5 : 1 }}>
        {segs && tone ? <Segs segs={segs} tone={tone} /> : text}
        {(segs ? segs.length === 0 : text === '') ? '​' : null}
      </div>
    </>
  );
}

/** 上下 1 列の 1 行（変更は − の直後に ＋） */
const UnifiedRow = memo(function UnifiedRow({ row }: { row: Row }) {
  switch (row.kind) {
    case 'equal':
      return <UnifiedLine sign="" no={row.right.no} text={row.right.text} />;
    case 'change':
      return (
        <>
          <UnifiedLine sign="−" no={row.left.no} segs={row.leftSegs} tone="del" />
          <UnifiedLine sign="＋" no={row.right.no} segs={row.rightSegs} tone="add" />
        </>
      );
    case 'delete':
      return <UnifiedLine sign="−" no={row.left.no} segs={row.segs} tone="del" />;
    case 'insert':
      return <UnifiedLine sign="＋" no={row.right.no} segs={row.segs} tone="add" />;
    case 'skipped':
      return <UnifiedLine sign="" no={(row.right ?? row.left)?.no} text={(row.right ?? row.left)?.text} dim />;
  }
});

/**
 * 結果の表。行が多いと描き直しが重いので memo にして、入力欄を打つたびに描き直さない
 */
const ResultGrid = memo(function ResultGrid({ rows, items, limit, view, currentRow }: {
  rows: Row[];
  items: CollapsedItem[];
  limit: number;
  view: View;
  currentRow: number;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: view === 'split' ? 'auto minmax(0,1fr) auto minmax(0,1fr)' : 'auto auto minmax(0,1fr)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        overflow: 'hidden',
        marginTop: 8,
      }}
    >
      {items.slice(0, limit).map((item, idx) =>
        item.type === 'gap' ? (
          <div
            key={`g${idx}`}
            style={{
              gridColumn: '1 / -1',
              textAlign: 'center',
              color: 'var(--muted)',
              fontSize: 'var(--fs-xs)',
              padding: '4px 0',
              background: 'var(--bg)',
            }}
          >
            … 同じ行 {nf.format(item.count)} 行 …
          </div>
        ) : (
          <Fragment key={item.index}>
            {/* 飛び先の目印（display: contents の要素には scrollIntoView が効かないため、高さのある印を置く） */}
            <div
              data-row={item.index}
              style={{
                gridColumn: '1 / -1',
                height: item.index === currentRow ? 3 : 0,
                background: 'var(--accent)',
                scrollMarginTop: 140,
              }}
            />
            {view === 'split' ? <SplitRow row={rows[item.index]} /> : <UnifiedRow row={rows[item.index]} />}
          </Fragment>
        ),
      )}
    </div>
  );
});

function signed(n: number): string {
  return n > 0 ? `+${nf.format(n)}` : n < 0 ? `−${nf.format(-n)}` : '±0';
}

function TextBox({ label, value, onChange, onFile }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onFile: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const rows = Math.min(20, Math.max(6, value.split('\n').length + 1));
  return (
    <div style={{ flex: '1 1 320px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <label style={{ fontWeight: 700 }}>
          {label}
          <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 'var(--fs-xs)', marginLeft: 8 }}>
            {nf.format(lineCount(value))}行
          </span>
        </label>
        <button type="button" style={{ ...buttonStyle(), marginLeft: 'auto' }} onClick={() => fileRef.current?.click()}>
          ファイルを読む
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.csv,.tsv,.md,.json,.xml,.html,.yml,.yaml,.ini,.conf,.log,text/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
        />
      </div>
      <textarea
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        spellCheck={false}
        placeholder={`${label}を貼り付け`}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          fontFamily: mono.fontFamily,
          fontSize: 16,
          lineHeight: 1.5,
          padding: 10,
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          color: 'var(--text)',
          resize: 'vertical',
        }}
      />
    </div>
  );
}

function createWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./compare.worker.ts', import.meta.url));
  } catch {
    return null;
  }
}

export default function Calculator() {
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');
  const [opts, setOpts] = useState<IgnoreOptions>(NO_IGNORE);
  const [view, setView] = useState<View>('split');
  const [changedOnly, setChangedOnly] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  /** 入力が変わったが、まだ比べていない（大きい入力でボタン待ち） */
  const [stale, setStale] = useState(false);
  const [current, setCurrent] = useState(-1);
  const [copied, setCopied] = useState(false);
  /** 「次の違い」を押した回数（同じ違いにもう一度移るときも effect を回すため） */
  const [jumpTick, setJumpTick] = useState(0);

  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const resultRef = useRef<HTMLDivElement>(null);
  const sent = useRef(new Set<string>());
  const pending = useRef<{ lines: number; opts: IgnoreOptions; view: View } | null>(null);

  const trackOnce = useCallback((action: string) => {
    if (sent.current.has(action)) return;
    sent.current.add(action);
    trackToolUse(SLUG, action);
  }, []);

  // 狭い画面は上下 1 列から始める。固定するボタンの列は、サイトのヘッダー（sticky）の下に置く
  const [headerHeight, setHeaderHeight] = useState(0);
  useEffect(() => {
    if (window.matchMedia(`(max-width: ${WIDE_MIN_PX - 1}px)`).matches) setView('unified');
    const header = document.querySelector('.site-header');
    if (header) setHeaderHeight(Math.round(header.getBoundingClientRect().height));
  }, []);

  const finish = useCallback(
    (res: CompareResult) => {
      clearTimeout(slowTimer.current);
      setBusy(false);
      setSlow(false);
      setResult(res);
      setCurrent(-1);
      const p = pending.current;
      if (p && res.status === 'ok') trackOnce(compareAction(sizeBucket(p.lines), p.opts, p.view));
    },
    [trackOnce],
  );

  const attachWorker = useCallback(() => {
    const w = createWorker();
    if (w) {
      w.onmessage = (e: MessageEvent<{ id: number; result: CompareResult }>) => {
        if (e.data.id === reqId.current) finish(e.data.result);
      };
    }
    workerRef.current = w;
  }, [finish]);

  useEffect(() => {
    attachWorker();
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      clearTimeout(slowTimer.current);
    };
  }, [attachWorker]);

  const run = useCallback(() => {
    setStale(false);
    if (left === '' && right === '') {
      setResult(null);
      return;
    }
    const id = ++reqId.current;
    pending.current = { lines: Math.max(lineCount(left), lineCount(right)), opts, view };
    const w = workerRef.current;
    if (!w) {
      finish(compareTexts(left, right, opts));
      return;
    }
    setBusy(true);
    clearTimeout(slowTimer.current);
    slowTimer.current = setTimeout(() => setSlow(true), SLOW_NOTICE_MS);
    w.postMessage({ id, left, right, opts });
  }, [left, right, opts, view, finish]);

  const cancel = () => {
    reqId.current++;
    workerRef.current?.terminate();
    attachWorker();
    clearTimeout(slowTimer.current);
    setBusy(false);
    setSlow(false);
    setStale(true);
  };

  // 合わせて 2 万字以下なら、入力が止まって 300ms 後に自動で比べる
  const total = left.length + right.length;
  const auto = total <= AUTO_COMPARE_MAX_CHARS;
  useEffect(() => {
    if (!auto) {
      setStale(true);
      return;
    }
    const t = setTimeout(run, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // view は比べ直す理由にならない（計測の値に使うだけ）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, right, opts, auto]);

  const ok = result?.status === 'ok' ? result : null;
  const hunks = ok?.hunks ?? [];

  const jump = useCallback(
    (dir: 1 | -1) => {
      if (hunks.length === 0) return;
      const next = current < 0 ? (dir === 1 ? 0 : hunks.length - 1) : (current + dir + hunks.length) % hunks.length;
      setCurrent(next);
      trackOnce('jump');
      setJumpTick((t) => t + 1);
    },
    [hunks, current, trackOnce],
  );

  // n / p キーで次・前の違いへ（入力欄の中では効かせない）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'n') jump(1);
      else if (e.key === 'p') jump(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [jump]);

  const readFile = (file: File, set: (v: string) => void) => {
    const reader = new FileReader();
    reader.onload = () => set(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsText(file);
    trackOnce('file');
  };

  const copy = async () => {
    if (!ok) return;
    try {
      await navigator.clipboard.writeText(formatUnified(ok.rows));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      trackOnce('copy');
    } catch {
      // クリップボードが使えない環境では何もしない
    }
  };

  const items = useMemo(() => {
    if (!ok) return [];
    return changedOnly
      ? collapseRows(ok.rows)
      : ok.rows.map((_, index) => ({ type: 'row' as const, index }));
  }, [ok, changedOnly]);

  const ignored = activeIgnoreLabels(opts);
  const currentRow = current >= 0 ? hunks[current] : -1;

  // 行が多いと一度に描くのに時間がかかるので、先頭から少しずつ描き足す（最初の画面を早く出す）
  const [limit, setLimit] = useState(RENDER_CHUNK);
  useEffect(() => setLimit(RENDER_CHUNK), [items]);
  useEffect(() => {
    // 次の比較を待っている間は描き足さない（結果の受け取りを遅らせないため）
    if (busy || limit >= items.length) return;
    const t = setTimeout(() => setLimit((l) => l + RENDER_CHUNK), 0);
    return () => clearTimeout(t);
  }, [limit, items.length, busy]);

  // 飛び先がまだ描かれていなければ、全部描いてから移る
  const scrolledTick = useRef(0);
  useEffect(() => {
    if (jumpTick === scrolledTick.current || currentRow < 0) return;
    const el = resultRef.current?.querySelector(`[data-row="${currentRow}"]`);
    if (!el) {
      setLimit(items.length);
      return;
    }
    scrolledTick.current = jumpTick;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [jumpTick, currentRow, limit, items.length]);

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <TextBox label="元の文章" value={left} onChange={setLeft} onFile={(f) => readFile(f, setLeft)} />
        <TextBox label="新しい文章" value={right} onChange={setRight} onFile={(f) => readFile(f, setRight)} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <button
          type="button"
          style={buttonStyle()}
          onClick={() => {
            setLeft(right);
            setRight(left);
          }}
        >
          左右を入れ替え
        </button>
        <button
          type="button"
          style={buttonStyle()}
          onClick={() => {
            setLeft('');
            setRight('');
            setResult(null);
          }}
        >
          クリア
        </button>
        {!auto && (
          <button type="button" style={buttonStyle(true)} onClick={run} disabled={busy}>
            比較する
          </button>
        )}
      </div>

      <fieldset style={{ border: 'none', padding: 0, margin: '12px 0 0' }}>
        <legend style={{ fontWeight: 700, fontSize: 'var(--fs-sm)', marginBottom: 4 }}>無視する違い</legend>
        <div style={{ display: 'flex', gap: '4px 16px', flexWrap: 'wrap' }}>
          {(Object.keys(IGNORE_LABELS) as (keyof IgnoreOptions)[]).map((k) => (
            <label key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44 }}>
              <input
                type="checkbox"
                checked={opts[k]}
                onChange={(e) => setOpts((o) => ({ ...o, [k]: e.target.checked }))}
              />
              {k === 'width' || k === 'case' ? `${IGNORE_LABELS[k]}を区別しない` : `${IGNORE_LABELS[k]}を無視`}
            </label>
          ))}
        </div>
      </fieldset>

      {busy && slow && (
        <p style={bandStyle('info')} role="status">
          比べています…{' '}
          <button type="button" style={{ ...buttonStyle(), minHeight: 32, marginLeft: 8 }} onClick={cancel}>
            中止
          </button>
        </p>
      )}
      {!auto && stale && !busy && (
        <p style={bandStyle('info')}>
          長い文章なので自動では比べません（合わせて{nf.format(AUTO_COMPARE_MAX_CHARS)}字超）。「比較する」を押してください。
        </p>
      )}

      {result?.status === 'too-long' && (
        <p style={bandStyle('warn')} role="alert">
          {result.side === 'left' ? '元の文章' : '新しい文章'}が長すぎます（{nf.format(result.chars)}字・
          {nf.format(result.lines)}行）。20万字・1万行までです。分けて比べてください。
        </p>
      )}
      {result?.status === 'too-many-diffs' && (
        <p style={bandStyle('warn')} role="alert">
          違いが多すぎます（{nf.format(MAX_LINE_D)}行以上）。比べる範囲を絞ってください。
        </p>
      )}

      {ok && (
        <div style={{ marginTop: 14 }}>
          <div aria-live="polite">
            {ok.summary.identical ? (
              <p style={bandStyle('ok')}>
                <strong>
                  {ok.summary.identicalRaw || ignored.length === 0
                    ? '2つの文章は同じです'
                    : `${ignored.join('・')}を無視すると同じです`}
                </strong>
              </p>
            ) : (
              <p style={{ ...bandStyle('info'), fontVariantNumeric: 'tabular-nums' }}>
                <strong>
                  追加 {nf.format(ok.summary.added)} 行・削除 {nf.format(ok.summary.deleted)} 行・変更{' '}
                  {nf.format(ok.summary.changed)} 行
                </strong>
                ／文字数 {nf.format(ok.summary.leftChars)} → {nf.format(ok.summary.rightChars)}（
                {signed(ok.summary.rightChars - ok.summary.leftChars)}）
              </p>
            )}
            {ok.summary.eolDiffers && (
              <p style={bandStyle('warn')}>
                改行コードが違います（左：{ok.summary.eolDiffers.left === 'mixed' ? '混在' : ok.summary.eolDiffers.left}・右：
                {ok.summary.eolDiffers.right === 'mixed' ? '混在' : ok.summary.eolDiffers.right}）。比較では同じとみなしています。
              </p>
            )}
            {ok.summary.missingFinalNewline && (
              <p style={bandStyle('warn')}>
                {ok.summary.missingFinalNewline === 'left' ? '元の文章' : '新しい文章'}は、最後の行に改行がありません。
              </p>
            )}
            {ok.summary.invisibles.length > 0 && (
              <p style={bandStyle('warn')}>
                違いに見えない文字が含まれています：
                {ok.summary.invisibles.map((c) => `${c.name}（${c.mark}）`).join('・')}
              </p>
            )}
          </div>

          {!ok.summary.identical && (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, fontSize: 'var(--fs-sm)' }}>
                  <input type="checkbox" checked={changedOnly} onChange={(e) => setChangedOnly(e.target.checked)} />
                  変わった行だけ表示
                </label>
                <button
                  type="button"
                  style={buttonStyle()}
                  onClick={() => setView(view === 'split' ? 'unified' : 'split')}
                >
                  {view === 'split' ? '上下1列で見る' : '左右に並べる'}
                </button>
                <button type="button" style={buttonStyle()} onClick={copy}>
                  {copied ? 'コピーしました' : '結果をコピー'}
                </button>
              </div>

              {/* 次の違い・前の違いは、スクロールしても押せるよう結果の上に固定する */}
              <div
                style={{
                  position: 'sticky',
                  top: headerHeight,
                  zIndex: 2,
                  background: 'var(--surface)',
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <button type="button" style={buttonStyle()} onClick={() => jump(-1)} aria-keyshortcuts="p">
                  前の違い
                </button>
                <button type="button" style={buttonStyle(true)} onClick={() => jump(1)} aria-keyshortcuts="n">
                  次の違い
                </button>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 'var(--fs-sm)' }}>
                  {current >= 0 ? current + 1 : '–'} / {hunks.length}
                </span>
              </div>

              <div ref={resultRef}>
                <ResultGrid rows={ok.rows} items={items} limit={limit} view={view} currentRow={currentRow} />
              </div>
              <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)', marginTop: 6 }}>
                赤は削除・緑は追加・黄は変更（濃い部分が変わった文字）。キーボードの n／p で次・前の違いへ移れます。
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
