'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { checkCron, DOW_NUMBER_TABLE, GITHUB_SCHEDULE_DOC, type CheckResult, type ReadingResult } from '@/lib/cron/check';
import { buildCron, COMMON_EXPRESSIONS, type BuildKind } from '@/lib/cron/build';
import { DOW_JA, circled } from '@/lib/cron/describe';
import { FIELD_NAMES, FIELD_ORDER, GRAMMAR_OF, DIALECTS, DIALECT_LABELS, DIALECT_QUERY, ZONE_NOTE, DEFAULT_ZONE, type Dialect, type Zone } from '@/lib/cron/types';
import type { DialectChoice } from '@/lib/cron/dialect';
import { trackToolUse } from '@/lib/analytics';

/**
 * cron 式 チェッカーの画面。ロジックは lib/cron/。
 *
 * - **式はどこにも送らない。** URL のクエリ（?q=…&d=…）はブラウザの中で読むだけ（静的書き出し）
 * - **次回実行は「いま」から数えるので、マウント後にだけ出す。** 描画中に Date.now() を読むと
 *   ビルド時刻が HTML に焼き付き、ハイドレーションもずれる
 * - 計測（tool_use）には式そのものを送らない
 */

const SLUG = 'cron-shiki';
const DEBOUNCE_MS = 200;

const mono: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  overflowWrap: 'anywhere',
};

const buttonStyle = (active = false): React.CSSProperties => ({
  minHeight: 44,
  padding: '8px 12px',
  borderRadius: 8,
  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
  background: active ? 'var(--accent-soft)' : 'var(--surface)',
  color: 'var(--text)',
  fontSize: 'var(--fs-sm)',
  fontWeight: 600,
  cursor: 'pointer',
});

/** フィールドの下線の色。色は補助で、番号と名前を必ず添える */
const FIELD_COLORS = ['var(--cat-calc)', 'var(--cat-money)', 'var(--cat-life)', 'var(--cat-pick)', 'var(--cat-mark)', 'var(--accent)', 'var(--muted)'];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

function useTrackOnce() {
  const sent = useRef(new Set<string>());
  return useCallback((action: string) => {
    if (sent.current.has(action)) return;
    sent.current.add(action);
    trackToolUse(SLUG, action);
  }, []);
}

const QUERY_TO_DIALECT: Record<string, Dialect> = Object.fromEntries(
  DIALECTS.map((d) => [DIALECT_QUERY[d], d]),
) as Record<string, Dialect>;

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

/** 入力欄の下に、フィールドごとの色の下線と「①分 ②時…」を出す */
function FieldStrip({ tokens, kinds }: { tokens: string[]; kinds: (keyof typeof FIELD_NAMES)[] }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }} aria-hidden="true">
      {tokens.map((t, i) => (
        <div key={i} style={{ textAlign: 'center' }}>
          <div style={{ ...mono, padding: '0 4px', borderBottom: `3px solid ${FIELD_COLORS[i]}` }}>{t}</div>
          <div className="hint" style={{ margin: 0, fontSize: '0.75rem' }}>
            {circled(i)}{kinds[i] ? FIELD_NAMES[kinds[i]] : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

function RunsTable({ reading }: { reading: ReadingResult }) {
  if (reading.runs.length === 0) return null;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm)' }}>
      <thead>
        <tr>
          <th style={{ textAlign: 'left', padding: '4px 6px', width: '2em' }}>#</th>
          <th style={{ textAlign: 'left', padding: '4px 6px' }}>日本時間／UTC</th>
          <th style={{ textAlign: 'left', padding: '4px 6px' }}>祝日など</th>
        </tr>
      </thead>
      <tbody>
        {reading.runs.map((r, i) => {
          const marks: string[] = [];
          if (r.holiday.kind === 'holiday') marks.push(`祝日（${r.holiday.name}）`);
          if (r.holiday.kind === 'out-of-range') marks.push('—（表の範囲外）');
          if (r.yearEnd) marks.push('年末年始');
          return (
            <tr key={r.ms} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '6px', verticalAlign: 'top' }}>{i + 1}</td>
              <td style={{ padding: '6px' }}>
                <div style={{ ...mono, fontWeight: 700 }}>{r.jst}</div>
                <div className="hint" style={{ ...mono, margin: 0 }}>UTC {r.utc}</div>
              </td>
              <td style={{ padding: '6px', verticalAlign: 'top' }}>
                {marks.length > 0 ? <strong>{marks.join('・')}</strong> : ''}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function FieldsTable({ reading }: { reading: ReadingResult }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm)' }}>
      <thead>
        <tr>
          <th style={{ textAlign: 'left', padding: '4px 6px' }}>フィールド</th>
          <th style={{ textAlign: 'left', padding: '4px 6px' }}>書いた値</th>
          <th style={{ textAlign: 'left', padding: '4px 6px' }}>当てはまる値</th>
        </tr>
      </thead>
      <tbody>
        {reading.fields.map((f, i) => (
          <tr key={f.label} style={{ borderTop: '1px solid var(--border)' }}>
            <td style={{ padding: '6px', whiteSpace: 'nowrap', borderLeft: `4px solid ${FIELD_COLORS[i]}` }}>{f.label}</td>
            <td style={{ padding: '6px', ...mono }}>{f.text}</td>
            <td style={{ padding: '6px', overflowWrap: 'anywhere' }}>{f.values}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const BUILD_KINDS: { kind: BuildKind; label: string }[] = [
  { kind: 'daily', label: '毎日' },
  { kind: 'weekdays', label: '平日（月〜金）' },
  { kind: 'weekly', label: '毎週◯曜' },
  { kind: 'monthly', label: '毎月◯日' },
  { kind: 'interval', label: '◯分ごと' },
];

export default function Calculator() {
  const track = useTrackOnce();
  const [input, setInput] = useState('30 9 * * 1-5');
  const [choice, setChoice] = useState<DialectChoice>('auto');
  const [zoneOverride, setZoneOverride] = useState<Zone | null>(null);
  const [readingIndex, setReadingIndex] = useState(0);
  const [now, setNow] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [envOpen, setEnvOpen] = useState(true);

  // 作る
  const [bKind, setBKind] = useState<BuildKind>('weekdays');
  const [bHour, setBHour] = useState(9);
  const [bMinute, setBMinute] = useState(0);
  const [bWeekday, setBWeekday] = useState(1);
  const [bDay, setBDay] = useState(1);
  const [bEvery, setBEvery] = useState(15);

  // URL のクエリから式と方言を読む（マウント後に1回）
  useEffect(() => {
    setNow(Date.now());
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('q');
      const d = params.get('d');
      if (q) setInput(q);
      if (d && QUERY_TO_DIALECT[d]) setChoice(QUERY_TO_DIALECT[d]);
    } catch {
      // クエリが読めなければ既定の例のまま
    }
  }, []);

  const debounced = useDebounced(input, DEBOUNCE_MS);

  const result: CheckResult | null = useMemo(() => {
    if (now === null) return null;
    return checkCron(debounced, { dialect: choice, zone: zoneOverride ?? undefined, now });
  }, [debounced, choice, zoneOverride, now]);

  useEffect(() => {
    setReadingIndex(0);
  }, [debounced, choice]);

  useEffect(() => {
    if (result?.ok) track('parse');
  }, [result, track]);

  // 共有用の URL（式は送らない。アドレスバーを書き換えるだけ）
  useEffect(() => {
    if (now === null) return;
    try {
      const params = new URLSearchParams();
      if (debounced.trim()) params.set('q', debounced.trim());
      if (choice !== 'auto') params.set('d', DIALECT_QUERY[choice]);
      const qs = params.toString();
      window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
    } catch {
      // 履歴を書き換えられない環境では何もしない
    }
  }, [debounced, choice, now]);

  const onCopy = async (value: string, id: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      trackToolUse(SLUG, 'copy');
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // クリップボードが使えない環境では、表示を手で選んでコピーできる
    }
  };

  const tokens = input.trim() === '' ? [] : input.trim().split(/\s+/);
  const activeDialect: Dialect | null = result?.ok ? result.dialect : choice === 'auto' ? null : choice;
  const stripKinds = activeDialect && result?.ok && result.analysis.kind === 'cron'
    ? FIELD_ORDER[result.analysis.readings[readingIndex]?.grammar ?? GRAMMAR_OF[activeDialect]]
    : tokens.length === 5 ? FIELD_ORDER.cron5 : tokens.length === 7 ? FIELD_ORDER.quartz : FIELD_ORDER.quartz;
  const showStrip = tokens.length >= 5 && !tokens[0].startsWith('@') && !/^(cron|rate|at)\(/i.test(input.trim());

  const reading = result?.ok ? result.readings[Math.min(readingIndex, Math.max(0, result.readings.length - 1))] : undefined;
  const zone = result?.ok ? result.zone : null;

  const built = buildCron({ kind: bKind, hour: bHour, minute: bMinute, weekday: bWeekday, day: bDay, every: bEvery });

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="cron-input">cron 式</label>
        <input
          id="cron-input"
          type="text"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="例：30 9 * * 1-5 ／ 0 0 12 ? * WED ／ cron(0 0 ? * MON *)"
          style={{ ...mono, fontSize: 16 }}
          aria-describedby="cron-input-hint"
        />
        {showStrip && <FieldStrip tokens={tokens.slice(0, stripKinds.length)} kinds={stripKinds} />}
        <p className="hint" id="cron-input-hint">
          crontab -l の1行を丸ごと貼っても、後ろのコマンドを無視して読みます。式はこの画面の中だけで読み、どこにも送りません。
        </p>
      </div>

      <div className="field">
        <span className="hint" style={{ display: 'block', margin: '0 0 4px' }}>方言</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="方言">
          <button type="button" style={buttonStyle(choice === 'auto')} aria-pressed={choice === 'auto'} onClick={() => { setChoice('auto'); setZoneOverride(null); }}>
            自動
          </button>
          {DIALECTS.map((d) => (
            <button
              key={d}
              type="button"
              style={buttonStyle(choice === d)}
              aria-pressed={choice === d}
              onClick={() => {
                setChoice(d);
                setZoneOverride(null);
                trackToolUse(SLUG, `dialect-${DIALECT_QUERY[d]}`);
              }}
            >
              {DIALECT_LABELS[d]}
            </button>
          ))}
        </div>
      </div>

      {result === null && <p className="hint">読み込み中…</p>}

      {result && !result.ok && (
        <div className="note" role="alert">
          <strong>読めませんでした</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: '1.2em' }}>
            {result.errors.slice(0, 4).map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}

      {result?.ok && (
        <>
          <p style={{ margin: '12px 0 4px' }}>
            <strong>{result.analysis.detectedAs}</strong>
            {result.analysis.kind === 'cron' && result.analysis.ignoredCommand && (
              <span className="hint" style={{ display: 'block', margin: 0 }}>
                後ろのコマンド（<span style={mono}>{result.analysis.ignoredCommand}</span>）は無視しました
              </span>
            )}
          </p>

          {result.readings.length > 1 && (
            <div className="note">
              方言によって意味が変わります：
              {result.readings.map((r, i) => (
                <span key={r.label}>
                  {i > 0 && '、'}
                  {r.label}なら<strong>{r.description}</strong>
                </span>
              ))}
              。どちらで動かしますか？
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {result.readings.map((r, i) => (
                  <button key={r.label} type="button" style={buttonStyle(readingIndex === i)} aria-pressed={readingIndex === i} onClick={() => setReadingIndex(i)}>
                    {r.label}として読む
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="panel" style={{ marginTop: 8 }} aria-live="polite">
            <div className="hint" style={{ margin: 0 }}>この式の意味</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{reading ? reading.description : result.plainText}</div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '10px 0' }}>
            <span className="hint" style={{ margin: 0 }}>式のタイムゾーン：</span>
            {(['Asia/Tokyo', 'UTC'] as Zone[]).map((z) => (
              <button key={z} type="button" style={buttonStyle(zone === z)} aria-pressed={zone === z} onClick={() => setZoneOverride(z === DEFAULT_ZONE[result.dialect] ? null : z)}>
                {z === 'Asia/Tokyo' ? '日本時間で書いた' : 'UTC で書いた'}
              </button>
            ))}
            <span className="hint" style={{ margin: 0, flexBasis: '100%' }}>{ZONE_NOTE[result.dialect]}</span>
          </div>

          {reading && (
            <>
              <h3 style={{ fontSize: '1rem', marginTop: 16 }}>次の実行日時（{reading.runs.length} 件）</h3>
              {reading.runs.length === 0 ? (
                <p>5 年以内に実行される日時はありません。</p>
              ) : (
                <RunsTable reading={reading} />
              )}
              {result.holidayNote && <p className="hint">{result.holidayNote}</p>}
              {reading.exhausted && reading.runs.length > 0 && <p className="hint">5 年以内には {reading.runs.length} 回だけです。</p>}
            </>
          )}

          {result.warnings.length > 0 && (
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              {result.warnings.map((w) => (
                <div key={w.id} className="note" style={{ margin: 0 }}>
                  {w.text}
                  {w.id === 'github-min' && (
                    <>
                      {' '}
                      <a href={GITHUB_SCHEDULE_DOC} target="_blank" rel="nofollow noopener noreferrer">GitHub のドキュメント</a>
                    </>
                  )}
                  {w.id === 'dow-number' && (
                    <div style={{ overflowX: 'auto', marginTop: 6 }}>
                      <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left', padding: '2px 6px' }}>方言</th>
                            {DOW_JA.map((d) => (
                              <th key={d} style={{ padding: '2px 6px' }}>{d.slice(0, 1)}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {DOW_NUMBER_TABLE.map((row) => (
                            <tr key={row.dialect}>
                              <td style={{ padding: '2px 6px' }}>{row.dialect}</td>
                              {row.values.map((v, i) => (
                                <td key={i} style={{ padding: '2px 6px', textAlign: 'center', ...mono }}>{v}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {reading && (
            <>
              <h3 style={{ fontSize: '1rem', marginTop: 20 }}>フィールドの内訳</h3>
              <FieldsTable reading={reading} />
            </>
          )}

          {reading && reading.envs.length > 0 && (
            <>
              <h3 style={{ fontSize: '1rem', marginTop: 20 }}>
                <button
                  type="button"
                  style={{ ...buttonStyle(envOpen), width: '100%', textAlign: 'left' }}
                  aria-expanded={envOpen}
                  onClick={() => {
                    setEnvOpen(!envOpen);
                    if (!envOpen) track('env-open');
                  }}
                >
                  {envOpen ? '▾' : '▸'} 環境ごとの書き方（{zone === 'UTC' ? 'UTC で書いた式を、日本時間でも' : '日本時間で書いた式を、その環境で日本時間に'}動かすには）
                </button>
              </h3>
              {envOpen && (
                <div style={{ display: 'grid', gap: 10 }}>
                  {reading.envs.map((e) => (
                    <div key={e.id} className="panel" style={{ margin: 0 }}>
                      <div style={{ fontWeight: 700 }}>{e.title}</div>
                      <p className="hint" style={{ margin: '2px 0 6px' }}>{e.note}</p>
                      {e.code ? (
                        <>
                          <pre style={{ ...mono, margin: 0, padding: 8, background: 'var(--bg)', borderRadius: 6, whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>{e.code}</pre>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                            <CopyButton value={e.code} label={`${e.title}の設定`} id={`${e.id}-code`} copied={copied} onCopy={onCopy} />
                            <CopyButton value={e.expressions.join('\n')} label={`${e.title}の式`} id={`${e.id}-expr`} copied={copied} onCopy={onCopy} />
                            <span className="hint" style={{ margin: 0, alignSelf: 'center' }}>左：設定のブロック／右：式だけ</span>
                          </div>
                        </>
                      ) : (
                        <p style={{ margin: 0 }}>この環境では1つの式で書けません：{e.reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      <h3 style={{ fontSize: '1rem', marginTop: 24 }}>式を作る</h3>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="作る式の形">
        {BUILD_KINDS.map((b) => (
          <button key={b.kind} type="button" style={buttonStyle(bKind === b.kind)} aria-pressed={bKind === b.kind} onClick={() => setBKind(b.kind)}>
            {b.label}
          </button>
        ))}
      </div>
      <div className="field-row" style={{ marginTop: 8 }}>
        {bKind === 'interval' ? (
          <label>
            間隔（分）
            <select value={bEvery} onChange={(e) => setBEvery(Number(e.target.value))} style={{ fontSize: 16 }}>
              {[1, 2, 5, 10, 15, 20, 30].map((n) => (
                <option key={n} value={n}>{n}分ごと</option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label>
              時
              <select value={bHour} onChange={(e) => setBHour(Number(e.target.value))} style={{ fontSize: 16 }}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{h}時</option>
                ))}
              </select>
            </label>
            <label>
              分
              <select value={bMinute} onChange={(e) => setBMinute(Number(e.target.value))} style={{ fontSize: 16 }}>
                {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
                  <option key={m} value={m}>{m}分</option>
                ))}
              </select>
            </label>
          </>
        )}
        {bKind === 'weekly' && (
          <label>
            曜日
            <select value={bWeekday} onChange={(e) => setBWeekday(Number(e.target.value))} style={{ fontSize: 16 }}>
              {DOW_JA.map((d, i) => (
                <option key={d} value={i}>{d}</option>
              ))}
            </select>
          </label>
        )}
        {bKind === 'monthly' && (
          <label>
            日
            <select value={bDay} onChange={(e) => setBDay(Number(e.target.value))} style={{ fontSize: 16 }}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d}日</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="panel" style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span style={{ ...mono, fontWeight: 700, fontSize: '1.1rem' }}>{built}</span>
        <span style={{ display: 'flex', gap: 6 }}>
          <button type="button" style={buttonStyle()} onClick={() => { setInput(built); setChoice('auto'); setZoneOverride(null); track('build'); }}>
            この式を調べる
          </button>
          <CopyButton value={built} label="作った式" id="built" copied={copied} onCopy={onCopy} />
        </span>
      </div>
      <p className="hint">29〜31日は月によって無いので、毎月の日は28日までにしています（末日は Quartz・AWS の L で書けます）。</p>

      <h3 style={{ fontSize: '1rem', marginTop: 20 }}>よく使う式</h3>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {COMMON_EXPRESSIONS.map((e) => (
          <button key={e} type="button" style={{ ...buttonStyle(input.trim() === e), ...mono }} onClick={() => { setInput(e); setChoice('auto'); setZoneOverride(null); }}>
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
