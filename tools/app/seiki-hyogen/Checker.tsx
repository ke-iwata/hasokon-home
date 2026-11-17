'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEBOUNCE_MS,
  DEFAULT_FLAGS,
  HIGHLIGHT_LIMIT,
  MATCH_TIMEOUT_MS,
  MAX_TEXT_CHARS,
  TARGET_STORAGE_KEY,
  checkAction,
  compile,
  displayPieces,
  flagsToString,
  invisibleNames,
  pasteForms,
  prepareText,
  splitSlashForm,
  timeoutAction,
  warnings,
  type FlagState,
  type MatchResult,
  type RegexError,
  type ReplacePiece,
} from '@/lib/regex-check';
import { REGEX_PARTS, TARGETS, type RegexTarget } from '@/lib/regex-parts';
import { trackToolUse } from '@/lib/analytics';
import { MatchRunner, type WorkerLike } from '@/lib/regex-runner';
import type { MatchRequest, MatchResponse } from './regex.worker';

/**
 * 正規表現チェッカーの画面。ロジックは lib/regex-check.ts、部品と方言の表は lib/regex-parts.ts。
 *
 * - **送信しない・URL に残さない。** 入力はこのコンポーネントの state にだけある。
 *   localStorage に残すのは「使う先」の選択だけ
 * - 照合は Web Worker で行い、1 秒を超えたら terminate して作り直す（メインのスレッドを固めない）
 * - 当たりの色塗りは React のテキストとして描く（innerHTML を使わない）。塗るのは最初の 1,000 件まで
 * - tool_use には「使う先」「件数の区分」「時間切れ」だけを送る
 *
 * 仕様: docs/features/seiki-hyogen-checker.md
 */

const SLUG = 'seiki-hyogen';

const nf = new Intl.NumberFormat('ja-JP');

const mono: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  overflowWrap: 'anywhere',
  whiteSpace: 'pre-wrap',
};

/** iOS Safari は 16px 未満の入力欄で拡大するので 16px */
const inputStyle: React.CSSProperties = { ...mono, fontSize: 16, width: '100%' };

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

const rowStyle: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0' };

const outputBox: React.CSSProperties = {
  ...mono,
  fontSize: 15,
  lineHeight: 1.7,
  padding: '10px 12px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--surface)',
  maxHeight: 420,
  overflow: 'auto',
};

const MATCH_BG = ['color-mix(in srgb, var(--warn-border) 35%, transparent)', 'color-mix(in srgb, var(--info-fg) 22%, transparent)'];

const invisibleStyle: React.CSSProperties = {
  color: 'var(--muted)',
  border: '1px dashed var(--border)',
  borderRadius: 3,
  padding: '0 2px',
  margin: '0 1px',
  fontSize: '0.85em',
};

/** スマホ（390 幅）で 3 行に収まるよう短く。くわしい意味は title とヒントの行に書く */
const FLAG_LABELS: readonly { key: 'g' | 'i' | 'm' | 's'; label: string; title: string }[] = [
  { key: 'g', label: 'g 全部', title: 'すべての当たりを探す' },
  { key: 'i', label: 'i 大小', title: '大文字と小文字を区別しない' },
  { key: 'm', label: 'm 行', title: '^ と $ が行ごとに当たる' },
  { key: 's', label: 's 改行', title: '. が改行にも当たる' },
];

const chip = (active: boolean): React.CSSProperties => ({
  ...buttonStyle(active),
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '6px 10px',
});

function createWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./regex.worker.ts', import.meta.url));
  } catch {
    return null;
  }
}

type Outcome =
  | { kind: 'idle' }
  | { kind: 'error'; error: RegexError }
  | { kind: 'busy' }
  | { kind: 'timeout' }
  | { kind: 'ok'; result: MatchResult; replaced?: ReplacePiece[]; text: string };

async function copyText(s: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(s);
    return true;
  } catch {
    return false;
  }
}

export default function Checker() {
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState<FlagState>(DEFAULT_FLAGS);
  const [text, setText] = useState('');
  const [replacement, setReplacement] = useState('');
  const [useReplace, setUseReplace] = useState(false);
  const [target, setTarget] = useState<RegexTarget>('js');
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [copied, setCopied] = useState<string | null>(null);

  const patternRef = useRef<HTMLInputElement>(null);
  const runnerRef = useRef<MatchRunner<Omit<MatchRequest, 'id'>, MatchResponse> | null>(null);
  const sent = useRef(new Set<string>());
  const pendingTarget = useRef<RegexTarget>('js');
  const pendingText = useRef('');

  const trackOnce = useCallback((action: string) => {
    if (sent.current.has(action)) return;
    sent.current.add(action);
    trackToolUse(SLUG, action);
  }, []);

  // 「使う先」だけは前回の選択を覚えておく
  useEffect(() => {
    try {
      const v = localStorage.getItem(TARGET_STORAGE_KEY);
      if (v === 'js' || v === 'excel' || v === 'sheets') setTarget(v);
    } catch {
      /* 保存できない環境では既定のまま */
    }
  }, []);
  const chooseTarget = (t: RegexTarget) => {
    setTarget(t);
    try {
      localStorage.setItem(TARGET_STORAGE_KEY, t);
    } catch {
      /* 保存できなくても使える */
    }
  };

  // 照合の係。前の照合が返っていなければ Worker を作り直してから送る（lib/regex-runner.ts）
  useEffect(() => {
    const runner = new MatchRunner<Omit<MatchRequest, 'id'>, MatchResponse>(
      () => createWorker() as unknown as WorkerLike | null,
      {
        onResult: ({ result, replaced, error }) => {
          if (error || !result) {
            setOutcome({ kind: 'error', error: { kind: 'other', message: 'パターンの書き方に誤りがあります。' } });
            return;
          }
          setOutcome({ kind: 'ok', result, replaced, text: pendingText.current });
          trackOnce(checkAction(pendingTarget.current, result.total));
        },
        onTimeout: () => {
          setOutcome({ kind: 'timeout' });
          trackOnce(timeoutAction(pendingTarget.current));
        },
      },
      MATCH_TIMEOUT_MS,
    );
    runnerRef.current = runner;
    return () => {
      runner.dispose();
      runnerRef.current = null;
    };
  }, [trackOnce]);

  const prepared = useMemo(() => prepareText(text), [text]);
  const flagStr = flagsToString(flags);

  // 入力が止まって 150ms 後に照合する（判定の約束 9）
  useEffect(() => {
    const t = setTimeout(() => {
      const runner = runnerRef.current;
      if (pattern === '') {
        runner?.cancel();
        setOutcome({ kind: 'idle' });
        return;
      }
      const c = compile(pattern, flagStr);
      if ('error' in c) {
        runner?.cancel();
        setOutcome({ kind: 'error', error: c.error });
        return;
      }
      if (!runner?.available) {
        // Worker の無い環境：時間切れで止められないので、照合はしない
        setOutcome({ kind: 'error', error: { kind: 'other', message: 'このブラウザでは照合できません（Web Worker が使えません）。' } });
        return;
      }
      pendingTarget.current = target;
      pendingText.current = prepared.text;
      setOutcome({ kind: 'busy' });
      runner.run({ pattern, flags: flagStr, text: prepared.text, replacement: useReplace ? replacement : null });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // target は照合し直す理由にならない（計測の値に使うだけ）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pattern, flagStr, prepared.text, replacement, useReplace]);

  const onPatternChange = (v: string) => {
    const split = splitSlashForm(v);
    if (split) {
      setPattern(split.pattern);
      setFlags(split.flags);
    } else setPattern(v);
  };

  const insertPart = (src: string) => {
    const el = patternRef.current;
    const start = el?.selectionStart ?? pattern.length;
    const end = el?.selectionEnd ?? pattern.length;
    const next = pattern.slice(0, start) + src + pattern.slice(end);
    setPattern(next);
    if (flags.unicode === 'none') setFlags({ ...flags, unicode: 'u' });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + src.length, start + src.length);
    });
  };

  const warns = useMemo(
    () => (pattern === '' ? [] : warnings({ pattern, flags, target, text: prepared.text, replacement: useReplace ? replacement : '' })),
    [pattern, flags, target, prepared.text, replacement, useReplace],
  );
  const forms = useMemo(() => (pattern === '' ? [] : pasteForms(pattern, flags, useReplace ? replacement : '')), [pattern, flags, replacement, useReplace]);
  const invisibles = useMemo(() => invisibleNames(prepared.text), [prepared.text]);

  const ok = outcome.kind === 'ok' ? outcome : null;
  const pieces = useMemo(() => (ok ? displayPieces(ok.text, ok.result.items) : null), [ok]);

  const doCopy = async (key: string, s: string) => {
    if (await copyText(s)) {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
      trackOnce(`copy-${key.startsWith('form') ? 'form' : 'replaced'}`);
    }
  };

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="re-pattern">パターン（/…/gu の形で貼っても読めます）</label>
        <input
          id="re-pattern"
          ref={patternRef}
          type="text"
          value={pattern}
          onChange={(e) => onPatternChange(e.target.value)}
          placeholder="例：\p{Script=Hiragana}+"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          style={inputStyle}
        />
      </div>

      <div role="group" aria-label="フラグ" style={{ ...rowStyle, gap: 6 }}>
        {FLAG_LABELS.map(({ key, label, title }) => (
          <label key={key} title={title} style={chip(flags[key])}>
            <input type="checkbox" checked={flags[key]} onChange={(e) => setFlags({ ...flags, [key]: e.target.checked })} />
            {label}
          </label>
        ))}
        {(['u', 'v', 'none'] as const).map((u) => (
          <label key={u} title={u === 'none' ? 'Unicode のフラグを付けない' : 'Unicode（u と v はどちらか一方）'} style={chip(flags.unicode === u)}>
            <input type="radio" name="re-unicode" checked={flags.unicode === u} onChange={() => setFlags({ ...flags, unicode: u })} />
            {u === 'none' ? 'u・v なし' : u}
          </label>
        ))}
      </div>
      <p className="hint" style={{ margin: '0 0 8px' }}>
        g：すべて探す ／ i：大文字小文字を区別しない ／ m：^ $ が行ごと ／ s：. が改行にも当たる ／ u・v：Unicode（どちらか一方）
      </p>

      <div style={{ margin: '8px 0' }}>
        <span className="hint" style={{ margin: 0 }}>日本語の部品（押すとパターンに差し込みます）</span>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '6px 0', WebkitOverflowScrolling: 'touch' }}>
          {REGEX_PARTS.map((p) => (
            <button key={p.id} type="button" style={buttonStyle()} onClick={() => insertPart(p.pattern)} title={p.pattern}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="re-text">試す文章</label>
        <textarea
          id="re-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          spellCheck={false}
          placeholder="ここに文章を貼ります"
          style={inputStyle}
        />
      </div>

      <div style={rowStyle}>
        <label style={{ ...rowStyle, margin: 0, minHeight: 44, cursor: 'pointer' }}>
          <input type="checkbox" checked={useReplace} onChange={(e) => setUseReplace(e.target.checked)} />
          置換もする
        </label>
      </div>
      {useReplace && (
        <div className="field">
          <label htmlFor="re-replace">置換後の文字列（$1・$&lt;名前&gt;・$&amp; が使えます）</label>
          <input
            id="re-replace"
            type="text"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            style={inputStyle}
          />
        </div>
      )}

      <div role="radiogroup" aria-label="使う先" style={rowStyle}>
        <span className="hint" style={{ margin: 0 }}>使う先：</span>
        {TARGETS.map((t) => (
          <label key={t.id} style={{ ...buttonStyle(target === t.id), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="radio" name="re-target" checked={target === t.id} onChange={() => chooseTarget(t.id)} />
            {t.label}
          </label>
        ))}
      </div>

      {prepared.newlinesNormalized && <p className="hint">改行（CRLF）を LF にそろえて試しています（m フラグの $ の当たり方が変わるため）。</p>}
      {prepared.truncated && <div className="note">文章が {nf.format(MAX_TEXT_CHARS)} 字を超えたので、先頭の {nf.format(MAX_TEXT_CHARS)} 字だけで試しています。</div>}
      {invisibles.length > 0 && (
        <div className="note">見えない文字が入っています：{invisibles.join('・')}（点線の枠で示しています）</div>
      )}

      {warns.map((w) => (
        <div key={w.id} className="note">
          {w.message}
        </div>
      ))}

      {outcome.kind === 'error' && (
        <div className="note" role="alert">
          {outcome.error.message}
        </div>
      )}
      {outcome.kind === 'timeout' && (
        <div className="note" role="alert">
          このパターンは時間がかかりすぎます（同じものの繰り返しを入れ子にしていないか）。{MATCH_TIMEOUT_MS / 1000} 秒で照合を止めました。
        </div>
      )}
      {outcome.kind === 'busy' && <p className="hint">照合しています…</p>}

      {ok && pieces && (
        <>
          <p style={{ fontWeight: 700, margin: '12px 0 4px' }} aria-live="polite">
            {nf.format(ok.result.total)} 件 当たりました{!flags.g && ok.result.total > 0 ? '（g フラグが無いので最初の 1 件だけ）' : ''}
          </p>
          {ok.result.total > HIGHLIGHT_LIMIT && (
            <div className="note">{nf.format(HIGHLIGHT_LIMIT)} 件を超えたので、色は最初の {nf.format(HIGHLIGHT_LIMIT)} 件だけ塗っています。</div>
          )}
          <div style={outputBox} aria-label="当たった箇所">
            {pieces.map((p, i) => {
              switch (p.kind) {
                case 'text':
                  return <span key={i}>{p.text}</span>;
                case 'match':
                  return (
                    <mark key={i} style={{ background: MATCH_BG[p.n % 2], color: 'inherit', borderRadius: 2 }}>
                      {p.text}
                    </mark>
                  );
                case 'empty':
                  return (
                    <span key={i} title="空の当たり" style={{ borderLeft: '2px solid var(--warn-border)', margin: '0 1px' }}>
                      ​
                    </span>
                  );
                case 'invisible':
                  return (
                    <span
                      key={i}
                      title={p.char.name}
                      aria-label={p.char.name}
                      style={{ ...invisibleStyle, background: p.n === undefined ? undefined : MATCH_BG[p.n % 2] }}
                    >
                      {p.char.mark}
                    </span>
                  );
              }
            })}
          </div>

          {ok.result.items.length > 0 && (
            <details style={{ margin: '10px 0' }}>
              <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                当たった箇所の一覧（{nf.format(ok.result.items.length)} 件）
              </summary>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>行・列</th>
                      <th>位置（UTF-16）</th>
                      <th>当たった文字列</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ok.result.items.map((m, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>
                          {m.line} 行 {m.column} 列
                        </td>
                        <td>{m.index}</td>
                        <td style={{ ...mono, textAlign: 'left' }}>{m.text === '' ? `（位置 ${m.index} の空の当たり）` : m.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          {ok.result.groupCount > 0 && ok.result.items.length > 0 && (
            <details style={{ margin: '10px 0' }}>
              <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                グループの中身（{ok.result.groupCount} 個）
              </summary>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      {Array.from({ length: ok.result.groupCount }, (_, g) => (
                        <th key={g}>
                          ${g + 1}
                          {ok.result.groupNames[g] ? `（${ok.result.groupNames[g]}）` : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ok.result.items.map((m, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        {m.groups.map((g, k) => (
                          <td key={k} style={{ ...mono, textAlign: 'left' }}>
                            {g === undefined ? '—' : g}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          {ok.replaced && (
            <>
              <h3 style={{ margin: '14px 0 6px' }}>置換の結果</h3>
              <div style={outputBox} aria-label="置換の結果">
                {ok.replaced.map((p, i) =>
                  p.changed ? (
                    <mark key={i} style={{ background: 'var(--ok-soft)', color: 'inherit', outline: '1px solid var(--ok-fg)', borderRadius: 2 }}>
                      {p.text === '' ? '​' : p.text}
                    </mark>
                  ) : (
                    <span key={i}>{p.text}</span>
                  ),
                )}
              </div>
              <div style={rowStyle}>
                <button type="button" style={buttonStyle()} onClick={() => doCopy('replaced', ok.replaced!.map((p) => p.text).join(''))}>
                  {copied === 'replaced' ? 'コピーしました' : '置換後の全文をコピー'}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {forms.length > 0 && outcome.kind !== 'error' && (
        <>
          <h3 style={{ margin: '14px 0 6px' }}>そのまま貼れる形</h3>
          {forms
            .filter((f) => f.target === target || target === 'js')
            .map((f, i) => (
              <div key={f.label} style={{ ...rowStyle, flexWrap: 'nowrap' }}>
                <code style={{ ...mono, flex: 1, minWidth: 0, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
                  <span className="hint" style={{ margin: 0, display: 'block' }}>
                    {f.label}
                  </span>
                  {f.code}
                </code>
                <button type="button" style={buttonStyle()} onClick={() => doCopy(`form-${i}`, f.code)}>
                  {copied === `form-${i}` ? 'コピーしました' : 'コピー'}
                </button>
              </div>
            ))}
        </>
      )}
    </div>
  );
}
