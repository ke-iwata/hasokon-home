'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEBOUNCE_MS,
  DEBOUNCE_THRESHOLD_BYTES,
  DEFAULT_INDENT,
  HIGHLIGHT_LIMIT_BYTES,
  HIGHLIGHT_LIST_MAX,
  INDENT_OPTIONS,
  MAX_INPUT_BYTES,
  checkJson,
  formatBytes,
  renderOutput,
  scanZenkaku,
  stripBom,
  utf8Bytes,
  type IndentKind,
  type OutputMode,
  type ZenkakuMark,
} from '@/lib/json-seikei';
import { trackToolUse } from '@/lib/analytics';

/**
 * JSON 整形・チェックの画面。ロジックは lib/json-seikei.ts。
 *
 * - **通信しない。** 入力はこのコンポーネントの state にだけあり、保存もしない
 *   （ブラウザの保存領域にも書かない）。ファイルは FileReader で読むだけ
 * - 色付けは textarea の後ろに同じ文字の pre を重ねて描く（重いエディタを入れないため）。
 *   折り返しがずれないよう、両方とも折り返さない（横スクロール）
 * - 200KB を超えたら色付けをやめ、全角の位置は一覧だけで出す
 */

const SLUG = 'json-seikei';

/** 入力欄と行番号の共通の文字の大きさ。iOS Safari は 16px 未満の入力欄で拡大するので 16px */
const FONT_SIZE = 16;
const LINE_HEIGHT = 24;
const PAD = 10;

const mono: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: FONT_SIZE,
  lineHeight: `${LINE_HEIGHT}px`,
  tabSize: 4,
};

const buttonStyle = (active = false): React.CSSProperties => ({
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

const bandStyle = (tone: 'ok' | 'error' | 'warn'): React.CSSProperties => ({
  padding: '10px 14px',
  borderRadius: 8,
  margin: '12px 0 0',
  background: tone === 'ok' ? 'var(--ok-soft)' : tone === 'error' ? 'var(--danger-soft)' : 'var(--warn-bg)',
  color: tone === 'ok' ? 'var(--ok-fg)' : tone === 'error' ? 'var(--danger-fg)' : 'var(--text)',
  border: tone === 'warn' ? '1px solid var(--warn-border)' : '1px solid transparent',
  fontSize: 'var(--fs-sm)',
});

const MODE_LABELS: { mode: OutputMode; label: string }[] = [
  { mode: 'format', label: '整形' },
  { mode: 'minify', label: '1行に圧縮' },
  { mode: 'sort', label: 'キーを並べ替え' },
];

/** 入力欄の重ね描き。全角に下線と薄い背景、強調する行に背景 */
function Overlay({
  text,
  marks,
  markLine,
}: {
  text: string;
  marks: ZenkakuMark[];
  markLine: number;
}) {
  const lines = text.split('\n');
  const byLine = new Map<number, ZenkakuMark[]>();
  for (const m of marks) {
    const list = byLine.get(m.line);
    if (list) list.push(m);
    else byLine.set(m.line, [m]);
  }
  return (
    <>
      {lines.map((line, index) => {
        const no = index + 1;
        const lineMarks = byLine.get(no) ?? [];
        const parts: React.ReactNode[] = [];
        let pos = 0;
        for (const m of lineMarks) {
          const col = m.column - 1;
          if (col < pos) continue;
          parts.push(line.slice(pos, col));
          parts.push(
            <span
              key={col}
              style={{
                background: 'var(--warn-bg)',
                textDecoration: 'underline wavy var(--warn-border)',
                textUnderlineOffset: 3,
              }}
            >
              {line.slice(col, col + m.char.length)}
            </span>,
          );
          pos = col + m.char.length;
        }
        parts.push(line.slice(pos));
        return (
          <div
            key={index}
            style={{
              background: no === markLine ? 'var(--danger-soft)' : undefined,
              minHeight: LINE_HEIGHT,
            }}
          >
            {parts}
            {'​'}
          </div>
        );
      })}
    </>
  );
}

export default function Calculator() {
  const [input, setInput] = useState('');
  /** 判定に使う入力。2MB を超えたら入力が止まってから DEBOUNCE_MS 後に追いつく */
  const [settled, setSettled] = useState('');
  const [mode, setMode] = useState<OutputMode>('format');
  const [indent, setIndent] = useState<IndentKind>(DEFAULT_INDENT);
  const [copied, setCopied] = useState(false);
  const [undo, setUndo] = useState<{ before: string; message: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (input.length <= DEBOUNCE_THRESHOLD_BYTES / 3 || utf8Bytes(input) <= DEBOUNCE_THRESHOLD_BYTES) {
      setSettled(input);
      return;
    }
    const timer = setTimeout(() => setSettled(input), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const bytes = useMemo(() => utf8Bytes(settled), [settled]);
  const check = useMemo(() => (settled.trim() === '' ? null : checkJson(settled)), [settled]);
  const scan = useMemo(() => {
    if (settled === '' || bytes > MAX_INPUT_BYTES) return null;
    return scanZenkaku(stripBom(settled).text);
  }, [settled, bytes]);
  const highlight = bytes <= HIGHLIGHT_LIMIT_BYTES;
  const bomOffset = settled.startsWith('﻿') ? 1 : 0;

  const output = useMemo(
    () => (check?.ok ? renderOutput(check.tree, mode, indent) : ''),
    [check, mode, indent],
  );

  const errorLine = check && !check.ok && !check.tooLarge ? check.markLine : 0;
  const marks = useMemo(
    () => (scan ? [...scan.replaced, ...scan.unfixed].sort((a, b) => a.offset - b.offset) : []),
    [scan],
  );
  const markedLines = useMemo(() => new Set(marks.map((m) => m.line)), [marks]);

  // 誤りの行が見えていなければ、そこへスクロールする（入力中に毎回動かさないよう、行が変わったときだけ）
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta || errorLine === 0) return;
    const top = (errorLine - 1) * LINE_HEIGHT + PAD;
    if (top < ta.scrollTop || top + LINE_HEIGHT > ta.scrollTop + ta.clientHeight) {
      ta.scrollTop = Math.max(0, top - ta.clientHeight / 3);
      syncScroll();
    }
  }, [errorLine]);

  function syncScroll() {
    const ta = textareaRef.current;
    if (!ta) return;
    if (overlayRef.current) {
      overlayRef.current.scrollTop = ta.scrollTop;
      overlayRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
  }

  function changeInput(next: string) {
    setInput(next);
    setCopied(false);
    setUndo(null);
    setFileError(null);
  }

  function readFile(file: File) {
    if (file.size > MAX_INPUT_BYTES) {
      setFileError(
        `${formatBytes(file.size)} のファイルは扱えません（${formatBytes(MAX_INPUT_BYTES)} まで。重いのでブラウザが固まります）`,
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      changeInput(typeof reader.result === 'string' ? reader.result : '');
      trackToolUse(SLUG, 'file');
    };
    reader.onerror = () => setFileError('ファイルを読み込めませんでした');
    reader.readAsText(file);
  }

  function fixZenkaku() {
    if (!scan || scan.replaced.length === 0) return;
    const before = input;
    const first = scan.replaced
      .slice(0, 3)
      .map((m) => `${m.line} 行目 ${m.column} 文字目`)
      .join('・');
    const fixed = scan.fixed;
    setInput(fixed);
    setSettled(fixed);
    setCopied(false);
    setUndo({
      before,
      message: `${scan.replaced.length} か所を半角に直しました（${first}${scan.replaced.length > 3 ? ' ほか' : ''}）。文字列の中身は変えていません`,
    });
    trackToolUse(SLUG, 'fix-zenkaku');
  }

  async function copy() {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
    } catch {
      // クリップボードが使えないときは選択状態にして、利用者にコピーしてもらう
      const pre = outputRef.current;
      if (pre) {
        const range = document.createRange();
        range.selectNodeContents(pre);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
    trackToolUse(SLUG, 'copy');
  }

  function chooseMode(next: OutputMode) {
    setMode(next);
    setCopied(false);
    trackToolUse(SLUG, next);
  }

  const lineCount = useMemo(() => (highlight ? settled.split('\n').length : 0), [settled, highlight]);
  const visibleText = bomOffset ? settled.slice(1) : settled;

  return (
    <div className="card">
      <p style={{ margin: '0 0 10px', fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
        貼った JSON はこのページの中だけで処理し、どこにも送りません。保存もしません。
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <label htmlFor="json-input" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
            JSON を貼り付け
          </label>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) readFile(file);
            }}
            style={{
              position: 'relative',
              display: 'flex',
              height: 360,
              border: `1px solid ${dragging ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 8,
              background: 'var(--surface)',
              overflow: 'hidden',
            }}
          >
            {highlight && (
              <div
                ref={gutterRef}
                aria-hidden="true"
                style={{
                  ...mono,
                  fontSize: 12,
                  overflow: 'hidden',
                  padding: `${PAD}px 6px ${PAD}px 4px`,
                  color: 'var(--muted)',
                  background: 'var(--surface-2)',
                  textAlign: 'right',
                  minWidth: '4.5em',
                  userSelect: 'none',
                  flex: 'none',
                }}
              >
                {Array.from({ length: lineCount }, (_, i) => (
                  <div
                    key={i}
                    style={{
                      height: LINE_HEIGHT,
                      color: i + 1 === errorLine ? 'var(--danger-fg)' : undefined,
                      fontWeight: i + 1 === errorLine ? 700 : undefined,
                    }}
                  >
                    {markedLines.has(i + 1) && (
                      <span
                        style={{
                          fontSize: 10,
                          padding: '0 3px',
                          marginRight: 3,
                          borderRadius: 4,
                          border: '1px solid var(--warn-border)',
                          background: 'var(--warn-bg)',
                          color: 'var(--text)',
                        }}
                      >
                        全角
                      </span>
                    )}
                    {i + 1}
                  </div>
                ))}
              </div>
            )}
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              {highlight && (
                <div
                  ref={overlayRef}
                  aria-hidden="true"
                  style={{
                    ...mono,
                    position: 'absolute',
                    inset: 0,
                    padding: PAD,
                    overflow: 'hidden',
                    whiteSpace: 'pre',
                    color: 'transparent',
                    pointerEvents: 'none',
                  }}
                >
                  <Overlay
                    text={visibleText}
                    marks={settled === input ? marks : []}
                    markLine={settled === input ? errorLine : 0}
                  />
                </div>
              )}
              <textarea
                id="json-input"
                ref={textareaRef}
                value={input}
                onChange={(e) => changeInput(e.target.value)}
                onScroll={syncScroll}
                wrap="off"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                placeholder={'{"name": "例", "items": [1, 2, 3]}'}
                style={{
                  ...mono,
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  padding: PAD,
                  margin: 0,
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  whiteSpace: 'pre',
                  overflow: 'auto',
                  background: 'transparent',
                  color: 'var(--text)',
                  caretColor: 'var(--text)',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, alignItems: 'center' }}>
            <label style={{ ...buttonStyle(), display: 'inline-block' }}>
              ファイルを選ぶ
              <input
                type="file"
                accept=".json,application/json,text/plain"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) readFile(file);
                  e.target.value = '';
                }}
              />
            </label>
            <button
              type="button"
              style={buttonStyle()}
              onClick={fixZenkaku}
              // 2MB 超で判定が入力に追いついていない間に押すと、最後の打鍵が消えるので押させない
              disabled={!scan || scan.replaced.length === 0 || input !== settled}
            >
              全角を直す{scan && scan.replaced.length > 0 ? `（${scan.replaced.length}）` : ''}
            </button>
            <button type="button" style={buttonStyle()} onClick={() => changeInput('')} disabled={input === ''}>
              消す
            </button>
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--muted)' }}>
              ドラッグ＆ドロップでも読み込めます（{formatBytes(MAX_INPUT_BYTES)} まで）
            </span>
          </div>

          {fileError && <div style={bandStyle('error')}>{fileError}</div>}

          {undo && (
            <div style={bandStyle('warn')}>
              {undo.message}{' '}
              <button
                type="button"
                style={{ ...buttonStyle(), padding: '2px 10px' }}
                onClick={() => {
                  setInput(undo.before);
                  setSettled(undo.before);
                  setUndo(null);
                }}
              >
                元に戻す
              </button>
            </div>
          )}

          {!highlight && scan && marks.length > 0 && (
            <div style={bandStyle('warn')}>
              全角 {marks.length} か所（{formatBytes(HIGHLIGHT_LIMIT_BYTES)} を超えるので色付けはしていません）：
              <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                {marks.slice(0, HIGHLIGHT_LIST_MAX).map((m) => (
                  <li key={m.offset}>
                    {m.line} 行目 {m.column} 文字目 — {m.name}「{m.char}」
                  </li>
                ))}
              </ul>
              {marks.length > HIGHLIGHT_LIST_MAX && <div>ほか {marks.length - HIGHLIGHT_LIST_MAX} か所</div>}
            </div>
          )}
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>結果</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {MODE_LABELS.map(({ mode: m, label }) => (
              <button
                key={m}
                type="button"
                style={buttonStyle(mode === m)}
                aria-pressed={mode === m}
                onClick={() => chooseMode(m)}
              >
                {label}
              </button>
            ))}
            <label
              style={{
                fontSize: 'var(--fs-sm)',
                display: 'inline-flex',
                gap: 6,
                alignItems: 'center',
                whiteSpace: 'nowrap',
              }}
            >
              インデント
              <select
                value={indent}
                onChange={(e) => setIndent(e.target.value as IndentKind)}
                disabled={mode === 'minify'}
                style={{ fontSize: FONT_SIZE }}
              >
                {INDENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" style={buttonStyle()} onClick={copy} disabled={!output}>
              {copied ? 'コピーしました' : 'コピー'}
            </button>
          </div>

          <div aria-live="polite">
            {check === null && (
              <div style={{ ...bandStyle('warn'), background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                左の欄に JSON を貼ると、ここに結果が出ます。
              </div>
            )}
            {check?.ok && (
              <div style={bandStyle('ok')}>
                <strong>正しい JSON です</strong>（階層 {check.stats.depth}・キー {check.stats.keys}・
                {formatBytes(check.stats.bytes)}）
              </div>
            )}
            {check && !check.ok && (
              <div style={bandStyle('error')}>
                {check.tooLarge ? (
                  <strong>{check.message}</strong>
                ) : (
                  <>
                    <strong>
                      {check.line} 行目 {check.column} 文字目
                    </strong>
                    ：{check.message}
                    {check.hint && <div style={{ marginTop: 4 }}>→ {check.hint}</div>}
                    {check.markLine !== check.line && (
                      <div style={{ marginTop: 4, fontSize: 'var(--fs-xs)' }}>
                        入力欄では {check.markLine} 行目に印を付けています
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {check?.ok &&
              check.notices.map((n, i) => (
                <div key={i} style={bandStyle('warn')}>
                  注意：{n.message}
                </div>
              ))}
          </div>

          {output && (
            <div
              style={{
                display: 'flex',
                marginTop: 12,
                maxHeight: 360,
                overflow: 'auto',
                border: '1px solid var(--border)',
                borderRadius: 8,
                background: 'var(--surface)',
              }}
            >
              {output.length <= HIGHLIGHT_LIMIT_BYTES && (
                <pre
                  aria-hidden="true"
                  style={{
                    ...mono,
                    fontSize: 12,
                    margin: 0,
                    padding: `${PAD}px 6px`,
                    color: 'var(--muted)',
                    background: 'var(--surface-2)',
                    textAlign: 'right',
                    userSelect: 'none',
                    position: 'sticky',
                    left: 0,
                  }}
                >
                  {Array.from({ length: output.split('\n').length }, (_, i) => i + 1).join('\n')}
                </pre>
              )}
              <pre
                ref={outputRef}
                style={{ ...mono, fontSize: 14, margin: 0, padding: PAD, whiteSpace: 'pre', flex: 1 }}
              >
                {output}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
