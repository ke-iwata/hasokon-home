'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CHARSET_LABELS,
  DEBOUNCE_MS,
  DECODE_CHARSETS,
  ENCODE_CHARSETS,
  MAX_AUTO_CHARS,
  MAX_AUTO_LINES,
  MAX_DECODE_ROUNDS,
  NO_WARNING_IS_NOT_SAFE,
  cleanUrl,
  decodeText,
  detectDirection,
  encodeText,
  parseUrl,
  splitLines,
  trackCharset,
  type Charset,
  type Direction,
  type EncodeCharset,
  type EncodeScope,
  type LineResult,
  type PlusMode,
  type Segment,
  type SpaceMode,
} from '@/lib/url-decode';
import { trackToolUse } from '@/lib/analytics';

/**
 * URLデコード・エンコードの画面。ロジックは lib/url-decode.ts。
 *
 * - **通信しない・保存しない・開かない。** 入力はこのコンポーネントの state にだけある。
 *   結果は React のテキストとして描くだけで、リンク（a 要素）にしない（javascript: を貼られても押せない）
 * - tool_use には向き・文字コードの区分・行数の区分だけを送る（入力・結果・ホスト名・キーは送らない）
 */

const SLUG = 'url-decode';

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

/** 印の付いた部分の見た目（壊れた %・読めないバイト・その文字コードに無い文字） */
const markStyle: React.CSSProperties = {
  background: 'var(--accent-soft)',
  textDecoration: 'underline wavy',
  textDecorationColor: 'var(--danger)',
  borderRadius: 3,
};

const MARK_TITLES: Record<NonNullable<Segment['mark']>, string> = {
  broken: '途中で切れた %',
  unreadable: 'この文字コードでは読めないバイト',
  unencodable: 'この文字コードに無い文字',
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
        s.mark ? (
          <mark key={i} style={markStyle} title={MARK_TITLES[s.mark]}>
            {s.text}
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

/** キーと値を縦に積む表（横スクロールさせない） */
function KV({ rows }: { rows: { k: React.ReactNode; v: React.ReactNode; muted?: boolean }[] }) {
  return (
    <dl style={{ margin: 0, display: 'grid', gap: 6 }}>
      {rows.map((r, i) => (
        <div key={i} className="panel" style={{ margin: 0, opacity: r.muted ? 0.6 : 1 }}>
          <dt className="hint" style={{ margin: 0 }}>{r.k}</dt>
          <dd style={{ ...mono, margin: 0, fontWeight: 600 }}>{r.v}</dd>
        </div>
      ))}
    </dl>
  );
}

type DirectionChoice = 'auto' | Direction;

export default function Calculator() {
  const track = useTrackOnce();
  const [input, setInput] = useState('');
  const [directionChoice, setDirectionChoice] = useState<DirectionChoice>('auto');
  const [charsetChoice, setCharsetChoice] = useState<Charset | null>(null);
  const [plus, setPlus] = useState<PlusMode>('auto');
  const [rounds, setRounds] = useState(1);
  const [encCharset, setEncCharset] = useState<EncodeCharset>('utf-8');
  const [scope, setScope] = useState<EncodeScope>('component');
  const [space, setSpace] = useState<SpaceMode>('%20');
  const [keep, setKeep] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  /** 上限を超えたときに「変換する」で確定した入力 */
  const [manual, setManual] = useState<string | null>(null);

  const debounced = useDebounced(input, DEBOUNCE_MS);
  const tooLarge = debounced.length > MAX_AUTO_CHARS || splitLines(debounced).length > MAX_AUTO_LINES;
  const source = tooLarge ? (manual === input ? manual : null) : debounced;

  const onInput = (v: string) => {
    setInput(v);
    setCharsetChoice(null);
    setRounds(1);
    setKeep(new Set());
  };

  const onCopy = async (value: string, id: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      trackToolUse(SLUG, id === 'clean' ? 'copy-clean' : 'copy');
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      // クリップボードが使えない環境では何もしない（結果を手で選んでコピーできる）
    }
  };

  const detected = useMemo(() => (source ? detectDirection(source) : null), [source]);
  const direction: Direction | 'none' | null = !detected ? null : directionChoice === 'auto' ? detected.direction : directionChoice;

  const decoded = useMemo(() => {
    if (!source || direction !== 'decode') return null;
    let text = source;
    let result = decodeText(text, { charset: charsetChoice ?? undefined, plus });
    // 「もう1回デコード」を押した回数だけ繰り返す（自動では繰り返さない）
    for (let i = 1; i < rounds; i++) {
      text = result.lines.map((l) => l.text).join('\n');
      result = decodeText(text, { charset: charsetChoice ?? undefined, plus });
    }
    return result;
  }, [source, direction, charsetChoice, plus, rounds]);

  const encoded = useMemo(
    () => (source && direction === 'encode' ? encodeText(source, { charset: encCharset, scope, space }) : null),
    [source, direction, encCharset, scope, space],
  );

  const lines: LineResult[] | null = decoded?.lines ?? encoded ?? null;
  const output = lines?.map((l) => l.text).join('\n') ?? '';
  const nonEmptyLines = source ? splitLines(source).filter((l) => l.trim() !== '') : [];
  const singleLine = nonEmptyLines.length === 1 ? nonEmptyLines[0] : null;

  const url = useMemo(
    () => (singleLine ? parseUrl(singleLine, decoded?.charset ?? 'utf-8') : null),
    [singleLine, decoded?.charset],
  );
  const clean = useMemo(() => (singleLine && url && !url.dangerous ? cleanUrl(singleLine, keep) : null), [singleLine, url, keep]);

  useEffect(() => {
    if (!source || !direction || direction === 'none') return;
    const size = nonEmptyLines.length > 1 ? 'multi' : 'single';
    track(direction === 'decode' && decoded ? `decode-${trackCharset(decoded.guess)}-${size}` : `encode-${size}`);
  }, [source, direction, decoded, nonEmptyLines.length, track]);

  useEffect(() => {
    if (url && url.homograph.length > 0) track('homograph-warn');
  }, [url, track]);

  const problems = lines?.flatMap((l, i) => l.problems.map((p) => ({ ...p, line: i + 1 }))) ?? [];
  const multi = (lines?.length ?? 0) > 1;

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="ud-input">URL・%XX の文字列・日本語（1行に1つ。複数行をまとめて変換できます）</label>
        <textarea
          id="ud-input"
          rows={4}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          value={input}
          onChange={(e) => onInput(e.target.value)}
          placeholder="例：https://example.com/search?q=%E6%9D%B1%E4%BA%AC&utm_source=x"
          style={{ ...mono, fontSize: FONT_SIZE, width: '100%' }}
        />
        <p className="hint">
          <strong>貼った文字はこのブラウザの中だけで変換し、どこにも送らず、保存もしません。URL を開くこともありません。</strong>
        </p>
      </div>

      <Choice<DirectionChoice>
        label="向き"
        value={directionChoice}
        onChange={setDirectionChoice}
        options={[
          ['auto', '自動'],
          ['decode', 'デコード（%XX → 文字）'],
          ['encode', 'エンコード（文字 → %XX）'],
        ]}
      />

      {tooLarge && manual !== input && (
        <div className="note">
          {MAX_AUTO_CHARS.toLocaleString()}字・{MAX_AUTO_LINES.toLocaleString()}行を超えたので、自動では変換しません。
          <button type="button" style={{ ...buttonStyle(true), marginLeft: 8 }} onClick={() => setManual(input)}>
            変換する
          </button>
        </div>
      )}

      {detected && direction && (
        <p style={{ margin: '8px 0' }} aria-live="polite">
          {direction === 'none' ? (
            <>{detected.reason}。向きを選べば、その向きで変換します。</>
          ) : directionChoice === 'auto' ? (
            <>
              <strong>{direction === 'decode' ? 'デコード' : 'エンコード'}</strong>しました（{detected.reason}）
            </>
          ) : (
            <>
              <strong>{direction === 'decode' ? 'デコード' : 'エンコード'}</strong>しました（手で選択）
            </>
          )}
        </p>
      )}

      {direction === 'decode' && decoded && (
        <>
          <div style={rowStyle}>
            <span className="hint" style={{ margin: 0 }}>文字コード：</span>
            <strong>{CHARSET_LABELS[decoded.charset]}</strong>
            <span className="hint" style={{ margin: 0 }}>
              {charsetChoice ? '（手で選択）' : decoded.guess.asciiOnly ? '（日本語のバイトなし）' : '（自動判別）'}
            </span>
          </div>
          {!charsetChoice && decoded.guess.candidates.length > 1 && (
            <div className="note">
              <p style={{ margin: '0 0 8px' }}>文字コードを決めきれませんでした。読める文字になっているほうを選んでください。</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                {decoded.guess.candidates.map((cs) => (
                  <li key={cs} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button type="button" style={buttonStyle(decoded.charset === cs)} onClick={() => setCharsetChoice(cs)}>
                      {CHARSET_LABELS[cs]}
                    </button>
                    <span style={mono}>{decodeText(nonEmptyLines[0] ?? '', { charset: cs, plus }).lines[0].text.slice(0, 80)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {decoded.guess.unreadable && !charsetChoice && (
            <div className="note">UTF-8・Shift_JIS・EUC-JP のどれでも読めませんでした。UTF-8 として読めたところまでを出し、読めなかった位置に印を付けています。</div>
          )}
        </>
      )}

      {lines && (
        <div className="field">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <strong>変換結果{multi ? `（${lines.length}行）` : ''}</strong>
            <CopyButton value={output} label="変換結果" id="all" copied={copied} onCopy={onCopy} />
          </div>
          {multi && <p className="hint" style={{ margin: '4px 0' }}>上の「コピー」で全行をまとめてコピーします。</p>}
          <ol style={{ listStyle: multi ? 'decimal' : 'none', paddingLeft: multi ? 28 : 0, margin: '8px 0', display: 'grid', gap: 6 }}>
            {lines.map((l, i) => (
              <li key={i} className="panel" style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ ...mono, minWidth: 0 }}>
                  <Marked segments={l.segments} />
                </div>
                {multi && l.text && <CopyButton value={l.text} label={`${i + 1}行目`} id={`line-${i}`} copied={copied} onCopy={onCopy} />}
              </li>
            ))}
          </ol>
          {problems.length > 0 && (
            <ul className="note" style={{ margin: '8px 0', paddingLeft: 24 }}>
              {problems.slice(0, 20).map((p, i) => (
                <li key={i}>
                  {multi ? `${p.line}行目：` : ''}
                  {p.message}
                </li>
              ))}
              {problems.length > 20 && <li>ほか {problems.length - 20} か所</li>}
            </ul>
          )}
          {decoded?.doubleEncoded && (
            <div className="note">
              2回エンコードされています（%25 は % をエンコードしたもの）。
              {rounds < MAX_DECODE_ROUNDS ? (
                <button
                  type="button"
                  style={{ ...buttonStyle(true), marginLeft: 8 }}
                  onClick={() => {
                    setRounds(rounds + 1);
                    trackToolUse(SLUG, 'decode-again');
                  }}
                >
                  もう1回デコード
                </button>
              ) : (
                `（${MAX_DECODE_ROUNDS}回までです）`
              )}
            </div>
          )}
          {rounds > 1 && <p className="hint">{rounds}回デコードしました。</p>}
        </div>
      )}

      {direction === 'decode' && (
        <details style={{ margin: '8px 0' }}>
          <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>デコードの設定（文字コード・+ の扱い）</summary>
          <Choice<Charset | 'auto'>
            label="文字コード"
            value={charsetChoice ?? 'auto'}
            onChange={(v) => setCharsetChoice(v === 'auto' ? null : v)}
            options={[['auto', '自動'], ...DECODE_CHARSETS.map((c) => [c, CHARSET_LABELS[c]] as const)]}
          />
          <Choice<PlusMode>
            label="+ の扱い"
            value={plus}
            onChange={setPlus}
            options={[
              ['auto', '自動（? より後ろだけ空白）'],
              ['space', '+ を空白に戻す'],
              ['keep', '+ のまま'],
            ]}
          />
          <p className="hint">+ はフォーム送信（クエリ）では空白の意味で、パスではただの + です。</p>
        </details>
      )}

      {direction === 'encode' && (
        <details open style={{ margin: '8px 0' }}>
          <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>エンコードの設定</summary>
          <Choice<EncodeScope>
            label="範囲"
            value={scope}
            onChange={setScope}
            options={[
              ['component', 'URL の部品として'],
              ['whole', 'URL 全体として'],
            ]}
          />
          <p className="hint">検索語やファイル名を URL に入れるなら「部品」（/ ? &amp; = # も %XX にします）。URL をまるごと貼ったなら「全体」（/ ? &amp; = # : を残します）。</p>
          <Choice<EncodeCharset>
            label="文字コード"
            value={encCharset}
            onChange={setEncCharset}
            options={ENCODE_CHARSETS.map((c) => [c, CHARSET_LABELS[c]] as const)}
          />
          <Choice<SpaceMode>
            label="空白"
            value={space}
            onChange={setSpace}
            options={[
              ['%20', '%20'],
              ['+', '+（フォーム用）'],
            ]}
          />
        </details>
      )}

      {url && singleLine && (
        <div className="field" style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: '1.05rem', margin: '0 0 8px' }}>URL の分解</h2>
          {url.assumedScheme && <p className="hint">https:// を補って読みました（変換結果には足していません）。</p>}
          {url.dangerous && (
            <div className="note" style={{ borderColor: 'var(--danger)' }}>
              <strong style={{ color: 'var(--danger)' }}>{url.scheme}</strong> このURLは開くとプログラムが動きます。このツールは開きませんが、知らない人から届いたものは開かないでください。
            </div>
          )}
          {url.homograph.map((w) => (
            <div key={w.label} className="note" role="alert">
              <strong>{w.message}</strong>
            </div>
          ))}
          <KV
            rows={[
              { k: 'スキーム', v: url.scheme },
              ...(url.hostAscii || url.hostUnicode
                ? [
                    {
                      k: 'ホスト',
                      v: (
                        <>
                          {url.hostUnicode}
                          {url.hostUnicode !== url.hostAscii && (
                            <>
                              <br />
                              <span className="hint">{url.hostAscii}</span>
                            </>
                          )}
                          <br />
                          <span className="hint" style={{ fontWeight: 400 }}>{NO_WARNING_IS_NOT_SAFE}。</span>
                        </>
                      ),
                    },
                  ]
                : []),
              ...(url.port ? [{ k: 'ポート', v: url.port }] : []),
              ...(url.userinfo ? [{ k: 'ユーザー情報', v: '@ の前にユーザー名などが入っています（見せかけのホストに注意）' }] : []),
              ...url.pathSegments.map((s, i) => ({ k: `パス ${i + 1}`, v: s || '（空）' })),
            ]}
          />
          {url.query.length > 0 && (
            <>
              <h3 style={{ fontSize: '1rem', margin: '16px 0 8px' }}>クエリ（{url.query.length}個）</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                {url.query.map((q, i) => {
                  const removed = q.tracking !== null && !keep.has(q.key);
                  return (
                    <li key={i} className="panel" style={{ margin: 0 }}>
                      <div style={{ ...mono, fontWeight: 700, textDecoration: removed ? 'line-through' : undefined }}>{q.key}</div>
                      <div style={{ ...mono, textDecoration: removed ? 'line-through' : undefined }}>{q.noValue ? '（値なし）' : q.value || '（空）'}</div>
                      {q.tracking && (
                        <label className="hint" style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44, margin: 0 }}>
                          <input
                            type="checkbox"
                            checked={removed}
                            onChange={(e) => {
                              const next = new Set(keep);
                              if (e.target.checked) next.delete(q.key);
                              else next.add(q.key);
                              setKeep(next);
                            }}
                          />
                          共有用の URL から外す（{q.tracking}）
                        </label>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {url.fragment !== null && (
            <div style={{ marginTop: 12 }}>
              <KV
                rows={[
                  { k: 'フラグメント（#）', v: url.fragment || '（空）' },
                  ...url.textFragments.map((t) => ({ k: 'ハイライトする文字', v: t })),
                ]}
              />
            </div>
          )}

          {clean && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: '1rem', margin: '0 0 8px' }}>共有用のきれいな URL</h3>
              <div className="panel" style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ ...mono, minWidth: 0 }}>{clean.url}</div>
                <CopyButton value={clean.url} label="共有用の URL" id="clean" copied={copied} onCopy={onCopy} />
              </div>
              <p className="hint">
                {clean.removed.length > 0
                  ? `追跡用のパラメータを${clean.removed.length}個外しました（元の URL は書き換えていません）。`
                  : '外す追跡用パラメータ（utm_・fbclid など）はありませんでした。'}
                この URL の QR コードは <Link href="/qr-code/">QR コード作成</Link> で、貼り直して作れます（URL は渡しません）。
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
