'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CHARSET_LABELS,
  DEBOUNCE_MS,
  ENCODE_FORMAT_LABELS,
  FORMAT_LABELS,
  JWT_SIGNATURE_NOTE,
  MAX_FILE_BYTES,
  NEEDS_BUTTON_MESSAGE,
  SAVE_BLOB_TYPE,
  TOO_LARGE_MESSAGE,
  bytesBand,
  bytesToBase64,
  convert,
  inputSizeMode,
  sniff,
  toDataUri,
  trackCharsetOf,
  trackFormat,
  type Charset,
  type EncodeFormat,
  type Format,
  type Mode,
  type Segment,
} from '@/lib/base64';
import { DECODE_CHARSETS } from '@/lib/charset-guess';
import { trackToolUse } from '@/lib/analytics';

/**
 * Base64 エンコード・デコードの画面。ロジックは lib/base64.ts。
 *
 * - **送信しない・保存しない・開かない。** 入力・ファイルはこのコンポーネントの state にだけある。
 *   結果は React のテキストとして描くだけで、リンク（a 要素の href）にしない
 * - data: の画像は `<img>` だけでプレビューする（SVG も。スクリプトを動かさない）。画像でないものはプレビューしない
 * - 保存は `<a download>` で落とすだけ。Blob URL を新しいタブで開かない（Blob URL は hasokon.com と同じオリジンになる）
 * - tool_use には形式・文字コード・バイト数の帯だけを送る（中身は送らない）
 *
 * 仕様: docs/features/base64-henkan.md
 */

const SLUG = 'base64';

/** iOS Safari は 16px 未満の入力欄で拡大するので 16px */
const FONT_SIZE = 16;

const mono: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  overflowWrap: 'anywhere',
  whiteSpace: 'pre-wrap',
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

/** 見えない文字の印（文字の代わりに薄い色で描く。コピーする値は元の文字のまま） */
const invisibleStyle: React.CSSProperties = {
  color: 'var(--muted)',
  border: '1px dashed var(--border)',
  borderRadius: 3,
  padding: '0 2px',
  margin: '0 1px',
  fontSize: '0.85em',
};

const outputBox: React.CSSProperties = {
  ...mono,
  margin: 0,
  padding: 12,
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  maxHeight: '24em',
  overflow: 'auto',
};

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

function Marked({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((s, i) =>
        s.invisible ? (
          <mark key={i} style={invisibleStyle} title={s.invisible} aria-label={s.invisible}>
            {s.mark}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

function CopyButton({ value, label, id, copied, onCopy }: {
  value: string;
  label: string;
  id: string;
  copied: string | null;
  onCopy: (value: string, id: string) => void;
}) {
  return (
    <button type="button" onClick={() => onCopy(value, id)} style={{ ...buttonStyle(), flexShrink: 0 }} aria-label={`${label}をコピー`}>
      {copied === id ? 'コピーしました' : 'コピー'}
    </button>
  );
}

function Output({ title, value, segments, id, copied, onCopy }: {
  title: string;
  value: string;
  segments?: Segment[];
  id: string;
  copied: string | null;
  onCopy: (value: string, id: string) => void;
}) {
  return (
    <div style={{ margin: '12px 0' }}>
      <div style={{ ...rowStyle, justifyContent: 'space-between' }}>
        <strong>{title}</strong>
        <CopyButton value={value} label={title} id={id} copied={copied} onCopy={onCopy} />
      </div>
      <pre style={outputBox}>{segments ? <Marked segments={segments} /> : value}</pre>
    </div>
  );
}

/** キーと値を縦に積む（スマホで横スクロールさせない） */
function KV({ rows }: { rows: { k: React.ReactNode; v: React.ReactNode }[] }) {
  return (
    <dl style={{ margin: 0, display: 'grid', gap: 6 }}>
      {rows.map((r, i) => (
        <div key={i} className="panel" style={{ margin: 0 }}>
          <dt className="hint" style={{ margin: 0 }}>{r.k}</dt>
          <dd style={{ ...mono, margin: 0, fontWeight: 600 }}>{r.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** `<a download>` で落とすだけ。開かない。落としたら Blob URL を片づける（デコードの約束 7） */
function saveBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: SAVE_BLOB_TYPE });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n.toLocaleString('ja-JP')} バイト`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB（${n.toLocaleString('ja-JP')} バイト）`;
  return `${(n / 1024 / 1024).toFixed(2)} MB（${n.toLocaleString('ja-JP')} バイト）`;
}

/** プレビュー用の data URI。画像の種類のときだけ作る（`<img>` 以外には渡さない） */
function imageSrc(bytes: Uint8Array, mime: string): string {
  return toDataUri(bytes, mime);
}

interface FileInput {
  name: string;
  type: string;
  bytes: Uint8Array;
}

export default function Converter() {
  const track = useTrackOnce();
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('auto');
  const [charsetChoice, setCharsetChoice] = useState<Charset | null>(null);
  const [encodeFormat, setEncodeFormat] = useState<EncodeFormat>('base64');
  const [crlf, setCrlf] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const [manual, setManual] = useState<string | null>(null);
  const [file, setFile] = useState<FileInput | null>(null);
  const [dragging, setDragging] = useState(false);
  /** JWT の残り時間に使う。マウント後にだけ入れる（ビルド時刻を焼かない） */
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => setNowMs(Date.now()), []);

  const debounced = useDebounced(input, DEBOUNCE_MS);
  const size = inputSizeMode(debounced.length);
  const source = size === 'auto' ? debounced : manual === input ? manual : null;

  const onInput = (v: string) => {
    if (inputSizeMode(v.length) === 'too-large') {
      setRejected(TOO_LARGE_MESSAGE);
      return;
    }
    setRejected(null);
    setFile(null);
    setInput(v);
    setCharsetChoice(null);
  };

  const onCopy = async (value: string, id: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      trackToolUse(SLUG, 'copy');
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      // クリップボードが使えない環境では何もしない（結果を手で選んでコピーできる）
    }
  };

  const onFile = async (f: File | undefined | null) => {
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      setRejected(`${f.name} は ${formatBytes(f.size)} です。5MB を超えるファイルは、大きすぎて画面が固まるため変換しません`);
      return;
    }
    const bytes = new Uint8Array(await f.arrayBuffer());
    setRejected(null);
    setInput('');
    setFile({ name: f.name, type: f.type || sniff(bytes)?.mime || 'application/octet-stream', bytes });
    trackToolUse(SLUG, `file-encode-${bytesBand(bytes.length)}`);
  };

  const result = useMemo(
    () => (source === null || file ? null : convert(source, { mode, charset: charsetChoice ?? undefined, encodeFormat, crlf, nowMs })),
    [source, file, mode, charsetChoice, encodeFormat, crlf, nowMs],
  );

  useEffect(() => {
    if (!result) return;
    const format = trackFormat(result);
    if (!format) return;
    const bytes = result.kind === 'decoded' || result.kind === 'datauri' ? result.bytes.length : result.kind === 'encoded' ? result.bytes : (source?.length ?? 0);
    track(`${format}-${trackCharsetOf(result)}-${bytesBand(bytes)}`);
  }, [result, source, track]);

  const fileOutput = useMemo(() => {
    if (!file) return null;
    return { base64: bytesToBase64(file.bytes, encodeFormat), dataUri: toDataUri(file.bytes, file.type) };
  }, [file, encodeFormat]);

  const showEncodeOptions = !!file || result?.kind === 'encoded' || (result?.kind === 'decoded' && !!result.alsoEncoded);

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="b64-input">Base64・メールの件名（=?…?=）・JWT・data: URI、またはエンコードしたい文字</label>
        <textarea
          id="b64-input"
          rows={5}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            if (e.dataTransfer.files.length === 0) return;
            e.preventDefault();
            setDragging(false);
            void onFile(e.dataTransfer.files[0]);
          }}
          placeholder="例：44GT44KT44Gr44Gh44Gv　／　=?ISO-2022-JP?B?GyRCJCIbKEI=?="
          style={{ ...mono, fontSize: FONT_SIZE, width: '100%', outline: dragging ? '2px dashed var(--accent)' : undefined }}
        />
        <p className="hint">
          <strong>この画面の中だけで変換し、どこにも送りません。</strong>保存もしません。
        </p>
      </div>

      <div style={rowStyle}>
        <label style={{ ...buttonStyle(true), display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
          ファイルを選ぶ（画像・PDF など。5MB まで）
          <input
            type="file"
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        <span className="hint" style={{ margin: 0 }}>パソコンでは入力欄にドラッグ＆ドロップもできます</span>
      </div>

      {!file && (
        <Choice<Mode>
          label="向き"
          value={mode}
          onChange={setMode}
          options={[
            ['auto', '自動'],
            ['decode', 'デコード'],
            ['encode', 'エンコード'],
          ]}
        />
      )}

      {showEncodeOptions && (
        <>
          <Choice<EncodeFormat>
            label="出力の形式"
            value={encodeFormat}
            onChange={setEncodeFormat}
            options={(Object.keys(ENCODE_FORMAT_LABELS) as EncodeFormat[]).map((k) => [k, ENCODE_FORMAT_LABELS[k]] as const)}
          />
          {!file && (
            <label style={{ ...rowStyle, minHeight: 44, cursor: 'pointer' }}>
              <input type="checkbox" checked={crlf} onChange={(e) => setCrlf(e.target.checked)} />
              改行を CRLF にする（Windows・メールの改行）
            </label>
          )}
        </>
      )}

      {rejected && (
        <div className="note" role="alert">
          {rejected}
        </div>
      )}

      {size !== 'auto' && manual !== input && !rejected && (
        <div className="note">
          {NEEDS_BUTTON_MESSAGE}（{debounced.length.toLocaleString('ja-JP')} 文字）。
          <button type="button" style={{ ...buttonStyle(true), marginLeft: 8 }} onClick={() => setManual(input)}>
            変換
          </button>
        </div>
      )}

      {file && fileOutput && (
        <div aria-live="polite">
          <KV
            rows={[
              { k: 'ファイル', v: file.name },
              { k: '種類', v: file.type },
              { k: '大きさ', v: `${formatBytes(file.bytes.length)} → Base64 で ${fileOutput.base64.length.toLocaleString('ja-JP')} 文字（約 4/3 倍）` },
            ]}
          />
          <Output title={`Base64（${ENCODE_FORMAT_LABELS[encodeFormat]}）`} value={fileOutput.base64} id="file-b64" copied={copied} onCopy={onCopy} />
          <Output title="data: URI（HTML・CSS に貼る形）" value={fileOutput.dataUri} id="file-datauri" copied={copied} onCopy={onCopy} />
          <button type="button" style={buttonStyle()} onClick={() => setFile(null)}>
            ファイルを外す
          </button>
        </div>
      )}

      {result && result.detection && result.kind !== 'empty' && (
        <p style={{ margin: '8px 0' }} aria-live="polite">
          <strong>{mode === 'auto' ? result.detection.reason : mode === 'encode' ? 'エンコードしました（手で選択）' : 'デコードしました（手で選択）'}</strong>
        </p>
      )}

      {result?.kind === 'error' && (
        <div className="note" role="alert">
          Base64 として読めません：{result.message}
        </div>
      )}

      {result?.kind === 'encoded' && (
        <>
          <Output title={`Base64（${ENCODE_FORMAT_LABELS[encodeFormat]}）`} value={result.output} id="encoded" copied={copied} onCopy={onCopy} />
          <p className="hint">文字コード：UTF-8 ／ 元の大きさ：{formatBytes(result.bytes)}</p>
        </>
      )}

      {result?.kind === 'decoded' && (
        <>
          {result.padded > 0 && <p className="hint">末尾の「=」を補いました（{result.padded} 個）</p>}
          {result.alsoEncoded && (
            <div className="note">
              Base64 として読めますが、意味のある文字になりませんでした。エンコードした結果も並べます。
            </div>
          )}
          {result.output.kind === 'text' ? (
            <>
              <div style={rowStyle}>
                <span className="hint" style={{ margin: 0 }}>文字コード：</span>
                <strong>{CHARSET_LABELS[result.output.charset]}</strong>
                <span className="hint" style={{ margin: 0 }}>
                  {charsetChoice ? '（手で選択）' : result.output.guess.asciiOnly ? '（日本語のバイトなし）' : '（自動判別）'}
                </span>
                <span className="hint" style={{ margin: 0 }}>／ {formatBytes(result.bytes.length)}</span>
              </div>
              <Choice<Charset>
                label="文字コードを変える"
                value={result.output.charset}
                onChange={setCharsetChoice}
                options={DECODE_CHARSETS.map((c) => [c, CHARSET_LABELS[c]] as const)}
              />
              {result.output.invisibles.length > 0 && (
                <div className="note">見えない文字が入っています：{result.output.invisibles.join('・')}（点線の枠で示しています。コピーすると元の文字のまま）</div>
              )}
              <Output title="デコードした結果" value={result.output.text} segments={result.output.segments} id="decoded" copied={copied} onCopy={onCopy} />
              {/^\s*[[{]/.test(result.output.text) && (
                <p className="hint">
                  JSON のようです。<Link href="/json-seikei/">JSON 整形</Link>に貼ると見やすくなります。
                </p>
              )}
            </>
          ) : (
            <div className="panel">
              <p style={{ margin: '0 0 8px' }}>
                文字になりません。{result.output.sniffed ? <strong>{result.output.sniffed.label}</strong> : '種類の分からないデータ'}のようです（{formatBytes(result.bytes.length)}）。
              </p>
              <div style={rowStyle}>
                <button
                  type="button"
                  style={buttonStyle(true)}
                  onClick={() => {
                    if (result.output.kind !== 'binary') return;
                    saveBytes(result.bytes, `decoded.${result.output.sniffed?.ext ?? 'bin'}`);
                    trackToolUse(SLUG, 'save');
                  }}
                >
                  ファイルとして保存
                </button>
                {!charsetChoice && (
                  <button type="button" style={buttonStyle()} onClick={() => setCharsetChoice('utf-8')}>
                    それでも文字として読む
                  </button>
                )}
              </div>
              {result.output.sniffed && result.output.sniffed.mime.startsWith('image/') && result.output.sniffed.mime !== 'image/svg+xml' && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageSrc(result.bytes, result.output.sniffed.mime)} alt="デコードした画像のプレビュー" style={{ maxWidth: '100%', maxHeight: 320, marginTop: 8 }} />
              )}
            </div>
          )}
          {result.alsoEncoded && (
            <Output title="エンコードした結果（文字として Base64 にしたもの）" value={result.alsoEncoded} id="also-encoded" copied={copied} onCopy={onCopy} />
          )}
        </>
      )}

      {result?.kind === 'mime' && (
        <>
          <p className="hint">文字コード：{result.charsets.join('・') || '—'}</p>
          {result.problems.map((p) => (
            <div key={p} className="note">{p}</div>
          ))}
          <Output title="ほどいた件名・差出人" value={result.text} segments={result.segments} id="mime" copied={copied} onCopy={onCopy} />
        </>
      )}

      {result?.kind === 'jwt' && (
        <>
          <div className="note" role="note">
            <strong>{JWT_SIGNATURE_NOTE}</strong>。トークンは認証情報そのものなので、他人やチャットに貼らないでください（この画面は送信しません）。
          </div>
          {result.problems.map((p) => (
            <div key={p} className="note">{p}</div>
          ))}
          {result.times.length > 0 && (
            <KV
              rows={result.times.map((t) => ({
                k: t.label,
                v: (
                  <>
                    {t.jst}（日本時間）{t.remaining && <> — <strong>{t.remaining}</strong></>}
                    <br />
                    <span className="hint">UNIX時間 {t.seconds}</span>
                  </>
                ),
              }))}
            />
          )}
          {result.headerJson && <Output title={`ヘッダー${result.alg ? `（alg: ${result.alg}）` : ''}`} value={result.headerJson} id="jwt-header" copied={copied} onCopy={onCopy} />}
          {result.payloadJson && <Output title="ペイロード（中身）" value={result.payloadJson} id="jwt-payload" copied={copied} onCopy={onCopy} />}
          <p className="hint">
            {result.hasSignature ? '3つ目の部分は署名です（このツールは検証しません）。' : '署名の部分がありません（alg: none の可能性）。'}
            時刻は <Link href="/unix-jikan/">UNIX時間 変換</Link>、中身は <Link href="/json-seikei/">JSON 整形</Link> でも見られます。
          </p>
        </>
      )}

      {result?.kind === 'datauri' && (
        <div className="panel">
          <KV
            rows={[
              { k: '種類', v: result.mime },
              { k: '大きさ', v: formatBytes(result.bytes.length) },
            ]}
          />
          {result.previewable ? (
            // SVG も <img> だけで描く（innerHTML・object・iframe に入れない。スクリプトが動かない）
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageSrc(result.bytes, result.mime)} alt="data: URI の画像のプレビュー" style={{ maxWidth: '100%', maxHeight: 320, margin: '8px 0', display: 'block' }} />
          ) : (
            <p className="hint">画像ではないので、プレビューしません。</p>
          )}
          <button
            type="button"
            style={buttonStyle(true)}
            onClick={() => {
              saveBytes(result.bytes, `decoded.${result.ext}`);
              trackToolUse(SLUG, 'save');
            }}
          >
            ファイルとして保存
          </button>
        </div>
      )}

      {result && trackFormat(result) && (
        <p className="hint" style={{ marginTop: 8 }}>形式：{FORMAT_LABELS[trackFormat(result) as Format]}</p>
      )}
    </div>
  );
}
