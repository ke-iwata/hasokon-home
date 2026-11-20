'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ALGORITHMS,
  ALGORITHM_LABELS,
  formatDigest,
  hashAll,
  toSri,
  type Algorithm,
  type Digests,
  type OutputFormat,
} from '@/lib/hash/digest';
import {
  DEFAULT_TEXT_OPTIONS,
  NEWLINE_LABELS,
  TEXT_CHARSET_LABELS,
  textToBytes,
  type NewlineMode,
  type TextCharset,
  type TextOptions,
  type TrailingMode,
} from '@/lib/hash/text';
import { bytesEqual, findEntry, findHint, parseExpected, type Expected, type Hint } from '@/lib/hash/compare';
import { commandsFor } from '@/lib/hash/command';
import { formatBytes, hashBlob, sizeBand } from '@/lib/hash/file';
import { trackToolUse } from '@/lib/analytics';
import type { HashRequest, HashResponse } from './hash.worker';

/**
 * ハッシュ値 計算の画面。ロジックは lib/hash/。
 *
 * - **送信しない・保存しない。** 入力・ファイルはこのコンポーネントの state と Worker の中にだけある
 *   （localStorage にも残さない。秘密の文字列のことがあるため）
 * - ファイルは Web Worker で 4MB ずつ読む（hash.worker.ts）。中止は terminate して作り直す
 * - tool_use に送るのはアルゴリズム名・原因の種類・ファイルサイズの区分だけ。
 *   入力の文字列・ハッシュ値・ファイル名・正確なバイト数は送らない
 *
 * 仕様: docs/features/hash-keisan.md
 */

const SLUG = 'hash-keisan';
const DEBOUNCE_MS = 150;

const mono: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  overflowWrap: 'anywhere',
  wordBreak: 'break-all',
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

const rowStyle: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0' };

const textareaStyle: React.CSSProperties = {
  ...mono,
  width: '100%',
  fontSize: 16, // iOS Safari は 16px 未満の入力欄で拡大する
  padding: 10,
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  boxSizing: 'border-box',
};

const WEAK_NOTE = '改ざん対策には使わない（衝突が見つかっている）。同じファイルかどうかの確認には使えます。';

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** 同じ action は1回だけ送る（入力のたびに送らない） */
function useTrackOnce() {
  const sent = useRef(new Set<string>());
  return useCallback((action: string) => {
    if (sent.current.has(action)) return;
    sent.current.add(action);
    trackToolUse(SLUG, action);
  }, []);
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const on = () => setMatches(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [query]);
  return matches;
}

function Choice<T extends string>({ options, value, onChange, label }: {
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} style={rowStyle}>
      <span className="hint" style={{ margin: 0, minWidth: '5.5em' }}>{label}</span>
      {options.map(([v, text]) => (
        <button key={v} type="button" style={buttonStyle(value === v)} aria-pressed={value === v} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback(async (value: string, id: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      trackToolUse(SLUG, 'copy');
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    } catch {
      // クリップボードが使えない環境では何もしない（値は手で選んでコピーできる）
    }
  }, []);
  return { copied, copy };
}

function CopyButton({ value, id, label, copied, onCopy }: {
  value: string;
  id: string;
  label: string;
  copied: string | null;
  onCopy: (value: string, id: string) => void;
}) {
  return (
    <button type="button" onClick={() => onCopy(value, id)} style={{ ...buttonStyle(), flexShrink: 0, minWidth: 44 }} aria-label={`${label}をコピー`}>
      {copied === id ? 'コピーしました' : 'コピー'}
    </button>
  );
}

/** 1行1アルゴリズム。一致した行は緑の枠で一番上へ */
function DigestRows({ digests, format, matched, idPrefix, copied, onCopy }: {
  digests: Digests;
  format: OutputFormat;
  matched: Algorithm | null;
  idPrefix: string;
  copied: string | null;
  onCopy: (value: string, id: string) => void;
}) {
  const order = matched ? [matched, ...ALGORITHMS.filter((a) => a !== matched)] : ALGORITHMS;
  const sri = toSri(digests.sha384);
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
      {order.map((a) => {
        const value = formatDigest(digests[a], format);
        const isMatch = a === matched;
        return (
          <div
            key={a}
            className="panel quiet"
            style={{ margin: 0, padding: '10px 12px', border: isMatch ? '2px solid var(--ok-fg)' : undefined, background: isMatch ? 'var(--ok-soft)' : undefined }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
              <strong>
                {ALGORITHM_LABELS[a]}
                {isMatch && <span style={{ color: 'var(--ok-fg)', marginLeft: 8 }}>✓ 一致</span>}
              </strong>
              <CopyButton value={value} id={`${idPrefix}-${a}`} label={ALGORITHM_LABELS[a]} copied={copied} onCopy={onCopy} />
            </div>
            <div style={{ ...mono, marginTop: 4 }}>{value}</div>
            {(a === 'md5' || a === 'sha1') && <p className="hint" style={{ margin: '4px 0 0' }}>{WEAK_NOTE}</p>}
          </div>
        );
      })}
      <div className="panel quiet" style={{ margin: 0, padding: '10px 12px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
          <strong>SRI（integrity 属性）</strong>
          <CopyButton value={sri} id={`${idPrefix}-sri`} label="SRI" copied={copied} onCopy={onCopy} />
        </div>
        <div style={{ ...mono, marginTop: 4 }}>{sri}</div>
        <p className="hint" style={{ margin: '4px 0 0' }}>{'<script src="…" integrity="…" crossorigin="anonymous">'} にそのまま貼れる形（SHA-384 を Base64 にしたもの）</p>
      </div>
    </div>
  );
}

function Verdict({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="panel"
      style={{
        background: ok ? 'var(--ok-soft)' : 'var(--danger-soft)',
        borderColor: ok ? 'var(--ok-fg)' : 'var(--danger)',
        color: 'var(--text)',
      }}
    >
      {children}
    </div>
  );
}

type TextResult =
  | { kind: 'ok'; digests: Digests; bytes: number }
  | { kind: 'error'; position: number; char: string };

type FileStatus = 'queued' | 'running' | 'done' | 'cancelled' | 'error';

interface FileJob {
  id: number;
  file: File;
  status: FileStatus;
  done: number;
  digests?: Digests;
  error?: string;
}

function createWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./hash.worker.ts', import.meta.url));
  } catch {
    return null;
  }
}

const TRAILING_OPTIONS: readonly (readonly [TrailingMode, string])[] = [
  ['keep', 'そのまま'],
  ['lf', '改行を1つ足す（echo と同じ）'],
  ['crlf', 'CRLF を1つ足す'],
  ['strip', '末尾の改行を外す'],
];

export default function Calculator() {
  const track = useTrackOnce();
  const { copied, copy } = useCopy();
  const [tab, setTab] = useState<'text' | 'file'>('text');
  const [text, setText] = useState('');
  const [opts, setOpts] = useState<TextOptions>(DEFAULT_TEXT_OPTIONS);
  const [format, setFormat] = useState<OutputFormat>('hex');
  const [compare, setCompare] = useState('');
  const [jobs, setJobs] = useState<FileJob[]>([]);
  const [dragging, setDragging] = useState(false);
  /** 隠した input[type=file] にキーボードでフォーカスが来たら、ボタンの見た目に枠を出す */
  const [fileFocus, setFileFocus] = useState(false);
  const isDesktop = useMediaQuery('(hover: hover) and (pointer: fine)');
  const isWide = useMediaQuery('(min-width: 640px)');

  const debouncedText = useDebounced(text, DEBOUNCE_MS);
  const debouncedCompare = useDebounced(compare, DEBOUNCE_MS);
  const parsed = useMemo(() => parseExpected(debouncedCompare), [debouncedCompare]);

  // ---- 文字列 ----
  const textResult = useMemo((): TextResult | null => {
    if (debouncedText === '') return null;
    const enc = textToBytes(debouncedText, opts);
    if (!enc.ok) return { kind: 'error', position: enc.position, char: enc.char };
    return { kind: 'ok', digests: hashAll(enc.bytes), bytes: enc.bytes.length };
  }, [debouncedText, opts]);

  useEffect(() => {
    if (debouncedText !== '') track('text');
  }, [debouncedText, track]);

  /** 文字列タブで比べる値（SHA256SUMS を貼ったときは最初の行） */
  const textExpected: Expected | null = parsed.kind === 'single' ? parsed.expected : parsed.kind === 'list' ? parsed.entries[0] : null;
  const textMatch = textResult?.kind === 'ok' && textExpected ? bytesEqual(textResult.digests[textExpected.algorithm], textExpected.bytes) : null;
  const hint: Hint | null = useMemo(() => {
    if (tab !== 'text' || textMatch !== false || !textExpected) return null;
    return findHint(debouncedText, opts, textExpected);
  }, [tab, textMatch, textExpected, debouncedText, opts]);

  useEffect(() => {
    if (tab !== 'text' || textMatch === null || !textExpected) return;
    if (textMatch) track(`compare-match-${textExpected.algorithm}`);
    else {
      track('compare-mismatch');
      if (hint) track(`compare-hint-${hint.kinds.join('-')}`);
    }
  }, [tab, textMatch, textExpected, hint, track]);

  // ---- ファイル ----
  const workerRef = useRef<Worker | null>(null);
  /** Worker を読み込めなかった（以後はこのスレッドで計算する） */
  const workerBrokenRef = useRef(false);
  /** いま Worker で計算中のファイルがあるとき、Worker が落ちたらどうするか */
  const onWorkerFailRef = useRef<(() => void) | null>(null);
  const runningRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const nextId = useRef(1);

  const updateJob = useCallback((id: number, patch: Partial<FileJob>) => {
    setJobs((list) => list.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);

  /** Worker を捨てて、以後はこのスレッドで計算する */
  const dropWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    workerBrokenRef.current = true;
  }, []);

  /**
   * Worker を作る（作ってあればそれを返す）。error はここで作った時点から拾う。
   * ページを開いたあとに通信が切れると、Worker のスクリプトが読めずに error になる。
   * 先に読んでおいた Worker でも、計算を頼んだあとでも、ここで拾ってこのスレッドの計算に切り替える
   */
  const ensureWorker = useCallback((): Worker | null => {
    if (workerRef.current || workerBrokenRef.current) return workerRef.current;
    const w = createWorker();
    if (!w) {
      workerBrokenRef.current = true;
      return null;
    }
    w.onerror = (e) => {
      e.preventDefault?.();
      const onFail = onWorkerFailRef.current;
      onWorkerFailRef.current = null;
      if (onFail) onFail();
      else dropWorker();
    };
    workerRef.current = w;
    return w;
  }, [dropWorker]);

  // 待っているファイルを1つずつ計算する
  useEffect(() => {
    if (runningRef.current !== null) return;
    const job = jobs.find((j) => j.status === 'queued');
    if (!job) return;
    runningRef.current = job.id;
    cancelledRef.current = false;
    updateJob(job.id, { status: 'running', done: 0 });

    const finish = (patch: Partial<FileJob>) => {
      runningRef.current = null;
      onWorkerFailRef.current = null;
      updateJob(job.id, patch);
      if (patch.status === 'done') track(`file-${sizeBand(job.file.size)}`);
    };

    // Worker の無い環境・Worker を読み込めなかったとき：塊ごとに await しながらこのスレッドで計算する
    const runOnMainThread = () =>
      hashBlob(job.file, { onProgress: (done) => updateJob(job.id, { done }), isCancelled: () => cancelledRef.current })
        .then((digests) => (digests ? finish({ status: 'done', done: job.file.size, digests }) : finish({ status: 'cancelled' })))
        .catch((err) => finish({ status: 'error', error: String(err) }));

    const worker = ensureWorker();
    if (!worker) {
      runOnMainThread();
      return;
    }
    let answered = false;
    onWorkerFailRef.current = () => {
      dropWorker();
      // 何か返ってきたあとの失敗は計算中の問題。まだ何も返ってこないうちの失敗は読み込みの失敗なので計算し直す
      if (answered) finish({ status: 'error', error: '計算中に問題が起きました' });
      else runOnMainThread();
    };
    worker.onmessage = (e: MessageEvent<HashResponse>) => {
      const m = e.data;
      if (m.id !== job.id) return;
      answered = true;
      if (m.type === 'progress') updateJob(job.id, { done: m.done });
      else if (m.type === 'done') finish({ status: 'done', done: job.file.size, digests: m.digests });
      else finish({ status: 'error', error: m.message });
    };
    worker.postMessage({ id: job.id, file: job.file } satisfies HashRequest);
  }, [jobs, updateJob, track, ensureWorker, dropWorker]);

  // ファイルタブを開いた時点で Worker を先に読んでおく（あとで通信が切れても計算できるように）
  useEffect(() => {
    if (tab === 'file') ensureWorker();
  }, [tab, ensureWorker]);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const addFiles = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files).map((file) => ({ id: nextId.current++, file, status: 'queued' as const, done: 0 }));
    setJobs((prev) => [...prev, ...list]);
  };

  const cancel = () => {
    cancelledRef.current = true;
    onWorkerFailRef.current = null;
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
      runningRef.current = null;
    }
    setJobs((list) => list.map((j) => (j.status === 'running' || j.status === 'queued' ? { ...j, status: 'cancelled' } : j)));
  };

  const busy = jobs.some((j) => j.status === 'running' || j.status === 'queued');

  /** ファイルごとの判定 */
  const fileVerdicts = useMemo(() => {
    const out = new Map<number, { match: boolean; algorithm: Algorithm } | { missing: true }>();
    for (const j of jobs) {
      if (!j.digests) continue;
      if (parsed.kind === 'single') {
        const e = parsed.expected;
        out.set(j.id, { match: bytesEqual(j.digests[e.algorithm], e.bytes), algorithm: e.algorithm });
      } else if (parsed.kind === 'list') {
        const entries = findEntry(parsed.entries, j.file.name);
        if (entries.length === 0) {
          out.set(j.id, { missing: true });
          continue;
        }
        const hit = entries.find((e) => bytesEqual(j.digests![e.algorithm], e.bytes));
        out.set(j.id, { match: !!hit, algorithm: (hit ?? entries[0]).algorithm });
      }
    }
    return out;
  }, [jobs, parsed]);

  useEffect(() => {
    if (tab !== 'file') return;
    for (const v of fileVerdicts.values()) {
      if ('missing' in v) continue;
      track(v.match ? `compare-match-${v.algorithm}` : 'compare-mismatch');
    }
  }, [tab, fileVerdicts, track]);

  // ---- コマンドの欄 ----
  const commandAlgorithm: Algorithm =
    tab === 'text' && textExpected
      ? textExpected.algorithm
      : parsed.kind === 'single'
        ? parsed.expected.algorithm
        : parsed.kind === 'list'
          ? parsed.entries[0].algorithm
          : 'sha256';
  const commandFile = jobs.length > 0 ? jobs[jobs.length - 1].file.name : null;
  const commands = commandsFor(commandFile, commandAlgorithm);

  const textMatched = textMatch && textExpected ? textExpected.algorithm : null;

  return (
    <div className="card">
      <div role="tablist" aria-label="入力の種類" style={rowStyle}>
        {(
          [
            ['text', '文字列'],
            ['file', 'ファイル'],
          ] as const
        ).map(([v, label]) => (
          <button key={v} type="button" role="tab" aria-selected={tab === v} style={buttonStyle(tab === v)} onClick={() => setTab(v)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'text' && (
        <div className="field">
          <label htmlFor="hash-text">ハッシュ値を出したい文字列</label>
          <textarea
            id="hash-text"
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="ここに入力・貼り付け（入力するたびに計算します）"
            spellCheck={false}
            autoComplete="off"
            style={textareaStyle}
          />
          <Choice<TextCharset>
            label="文字コード"
            value={opts.charset}
            onChange={(charset) => setOpts((o) => ({ ...o, charset }))}
            options={(Object.keys(TEXT_CHARSET_LABELS) as TextCharset[]).map((c) => [c, TEXT_CHARSET_LABELS[c]] as const)}
          />
          <Choice<NewlineMode>
            label="改行"
            value={opts.newline}
            onChange={(newline) => setOpts((o) => ({ ...o, newline }))}
            options={(Object.keys(NEWLINE_LABELS) as NewlineMode[]).map((n) => [n, NEWLINE_LABELS[n]] as const)}
          />
          <Choice<TrailingMode> label="末尾の改行" value={opts.trailing} onChange={(trailing) => setOpts((o) => ({ ...o, trailing }))} options={TRAILING_OPTIONS} />
          <label style={{ ...rowStyle, cursor: 'pointer' }}>
            <input type="checkbox" checked={opts.trim} onChange={(e) => setOpts((o) => ({ ...o, trim: e.target.checked }))} style={{ width: 20, height: 20 }} />
            前後の空白・改行を外す
          </label>
        </div>
      )}

      {tab === 'file' && (
        <div className="field">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            style={{
              border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 8,
              padding: 16,
              textAlign: 'center',
              background: dragging ? 'var(--accent-soft)' : undefined,
            }}
          >
            <label
              style={{
                ...buttonStyle(true),
                display: 'inline-flex',
                alignItems: 'center',
                position: 'relative',
                outline: fileFocus ? '3px solid var(--accent)' : undefined,
                outlineOffset: 2,
              }}
            >
              ファイルを選ぶ（複数可）
              <input
                type="file"
                multiple
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = '';
                }}
                onFocus={(e) => setFileFocus(e.currentTarget.matches(':focus-visible'))}
                onBlur={() => setFileFocus(false)}
                style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
              />
            </label>
            {isDesktop && <p className="hint" style={{ margin: '8px 0 0' }}>ここにファイルをドラッグ＆ドロップしても計算できます</p>}
            <p className="hint" style={{ margin: '8px 0 0' }}>ファイルはこの端末の中で 4MB ずつ読んで計算します。送信しません。何GBでも計算できます。</p>
          </div>
          {jobs.length > 0 && (
            <div style={rowStyle}>
              {busy && (
                <button type="button" style={buttonStyle()} onClick={cancel}>
                  中止
                </button>
              )}
              {!busy && (
                <button type="button" style={buttonStyle()} onClick={() => setJobs([])}>
                  ファイルを外す
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="field">
        <label htmlFor="hash-compare">比べる値（任意）</label>
        <textarea
          id="hash-compare"
          rows={2}
          value={compare}
          onChange={(e) => setCompare(e.target.value)}
          placeholder="配布元が載せている値や SHA256SUMS の中身を貼る"
          spellCheck={false}
          autoComplete="off"
          style={textareaStyle}
        />
        <p className="hint" style={{ margin: '4px 0 0' }}>
          桁数でアルゴリズムを自動で決めます（32 桁＝MD5・40＝SHA-1・64＝SHA-256・96＝SHA-384・128＝SHA-512・sha384-… も可）。大文字小文字・空白・「:」は無視します。
        </p>
        {parsed.kind === 'invalid' && (
          <div className="note" role="alert">
            {parsed.message}
          </div>
        )}
        {parsed.kind === 'list' && (
          <p className="hint" style={{ margin: '4px 0 0' }}>
            {parsed.entries.length} 行を読みました（{tab === 'file' ? 'ファイル名で突き合わせます' : '最初の行の値と比べます'}）
          </p>
        )}
      </div>

      <Choice<OutputFormat>
        label="表示"
        value={format}
        onChange={setFormat}
        options={[
          ['hex', '16進（小文字）'],
          ['HEX', '16進（大文字）'],
          ['base64', 'Base64'],
        ]}
      />

      {tab === 'text' && (
        <div aria-live="polite">
          {textResult?.kind === 'error' && (
            <div className="note" role="alert">
              Shift_JIS に無い文字があります（{textResult.position} 文字目：{textResult.char}）。Shift_JIS の値は出せません。文字コードを UTF-8 にしてください。
            </div>
          )}
          {textResult?.kind === 'ok' && (
            <>
              {textMatch === true && textExpected && (
                <Verdict ok>
                  <strong style={{ color: 'var(--ok-fg)' }}>一致しました（{ALGORITHM_LABELS[textExpected.algorithm]}）</strong>
                </Verdict>
              )}
              {textMatch === false && textExpected && (
                <Verdict ok={false}>
                  <strong style={{ color: 'var(--danger-fg)' }}>一致しません（{ALGORITHM_LABELS[textExpected.algorithm]}）</strong>
                  {hint ? (
                    <>
                      <p style={{ margin: '8px 0 0' }}>
                        <strong>{hint.message}</strong>
                      </p>
                      {hint.note && <p className="hint" style={{ margin: '4px 0 0' }}>{hint.note}</p>}
                      <button type="button" style={{ ...buttonStyle(true), marginTop: 8 }} onClick={() => setOpts(hint.options)}>
                        この設定にする
                      </button>
                    </>
                  ) : (
                    <p className="hint" style={{ margin: '8px 0 0' }}>
                      末尾の改行・改行コード・BOM・文字コード（UTF-8／Shift_JIS）・前後の空白を変えて試しましたが、どれでも一致しませんでした。元の文字列そのものが違う可能性があります。
                    </p>
                  )}
                </Verdict>
              )}
              <p className="hint" style={{ margin: '12px 0 0' }}>
                {TEXT_CHARSET_LABELS[opts.charset]}・{textResult.bytes.toLocaleString('ja-JP')} バイトとして計算
              </p>
              <DigestRows digests={textResult.digests} format={format} matched={textMatched} idPrefix="text" copied={copied} onCopy={copy} />
            </>
          )}
          {!textResult && <p className="hint">文字を入れると、SHA-256・SHA-1・MD5・SHA-384・SHA-512 をまとめて出します。</p>}
        </div>
      )}

      {tab === 'file' && (
        <div aria-live="polite">
          {jobs.map((j) => {
            const v = fileVerdicts.get(j.id);
            const pct = j.file.size === 0 ? 100 : Math.floor((j.done / j.file.size) * 100);
            return (
              <section key={j.id} style={{ marginTop: 16 }}>
                <h3 style={{ ...mono, fontSize: 'var(--fs-sm)', margin: '0 0 4px' }}>{j.file.name}</h3>
                <p className="hint" style={{ margin: 0 }}>{formatBytes(j.file.size)}</p>
                {(j.status === 'running' || j.status === 'queued') && (
                  <div style={{ marginTop: 6 }}>
                    <progress value={j.status === 'queued' ? 0 : pct} max={100} style={{ width: '100%' }} aria-label={`${j.file.name} の計算`} />
                    <p className="hint" style={{ margin: 0 }}>{j.status === 'queued' ? '順番待ち' : `計算中… ${pct}%`}</p>
                  </div>
                )}
                {j.status === 'cancelled' && <p className="hint">中止しました</p>}
                {j.status === 'error' && (
                  <div className="note" role="alert">
                    読み込めませんでした（{j.error}）
                  </div>
                )}
                {j.digests && (
                  <>
                    {v && 'missing' in v && <p className="hint">貼った一覧に、このファイル名の行がありません。</p>}
                    {v && 'match' in v && v.match && (
                      <Verdict ok>
                        <strong style={{ color: 'var(--ok-fg)' }}>✓ 一致しました（{ALGORITHM_LABELS[v.algorithm]}）</strong>
                      </Verdict>
                    )}
                    {v && 'match' in v && !v.match && (
                      <Verdict ok={false}>
                        <strong style={{ color: 'var(--danger-fg)' }}>✗ 一致しません（{ALGORITHM_LABELS[v.algorithm]}）</strong>
                        <p style={{ margin: '8px 0 0' }}>
                          ダウンロードが途中で切れた・別の版を落とした可能性があります。配布元に大きさ（バイト数）が載っていれば、このファイルの{' '}
                          <strong>{j.file.size.toLocaleString('ja-JP')} バイト</strong>と比べてください。
                        </p>
                      </Verdict>
                    )}
                    <DigestRows
                      digests={j.digests}
                      format={format}
                      matched={v && 'match' in v && v.match ? v.algorithm : null}
                      idPrefix={`file${j.id}`}
                      copied={copied}
                      onCopy={copy}
                    />
                  </>
                )}
              </section>
            );
          })}
          {jobs.length === 0 && <p className="hint">ファイルを選ぶと、SHA-256・SHA-1・MD5・SHA-384・SHA-512 をまとめて出します。</p>}
        </div>
      )}

      <details open={isWide} style={{ marginTop: 16 }} key={isWide ? 'wide' : 'narrow'}>
        <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>
          <strong>コマンドで確かめるなら（{ALGORITHM_LABELS[commandAlgorithm]}）</strong>
        </summary>
        <div style={{ display: 'grid', gap: 8 }}>
          {commands.map((c, i) => (
            <div key={c.os} className="panel quiet" style={{ margin: 0, padding: '10px 12px' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="hint" style={{ margin: 0 }}>{c.os}</span>
                <CopyButton value={c.command} id={`cmd-${i}`} label={`${c.os}のコマンド`} copied={copied} onCopy={copy} />
              </div>
              <code style={{ ...mono, display: 'block', marginTop: 4 }}>{c.command}</code>
            </div>
          ))}
          <p className="hint" style={{ margin: 0 }}>
            {commandFile ? '選んだファイルの名前を入れてあります。' : '「ファイル名」を実際の名前に置き換えてください。'}ファイルのある場所で打ちます（空白や記号の入った名前でも動くよう、引用符で囲んであります）。
          </p>
        </div>
      </details>
    </div>
  );
}
