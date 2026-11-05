'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEBOUNCE_MS,
  JST_OFFSET_MS,
  UNITS,
  UNIT_LABELS,
  annotateLog,
  convertNumber,
  dateTimeToNumbers,
  formatHms,
  formatIso,
  formatJa,
  formatRelative,
  formatSerial,
  formatYmd,
  wallClockAt,
  wallToMs,
  warekiOf,
  weekdayJa,
  y2038Note,
  type Unit,
  type WallClock,
  type Zone,
} from '@/lib/unix-jikan';
import { trackToolUse } from '@/lib/analytics';

/**
 * UNIX時間・Excel シリアル値 変換の画面。ロジックは lib/unix-jikan.ts。
 *
 * - **通信しない・保存しない。** 入力はこのコンポーネントの state にだけある
 * - **現在時刻と「いまから◯日前／後」はマウント後にだけ描画する。** 静的書き出しなので、
 *   描画中に Date.now() を読むとビルド時刻が HTML に焼き付き、ハイドレーションもずれる
 * - 毎秒変わる表示に aria-live を付けない（スクリーンリーダーが毎秒読み上げるため）
 */

const SLUG = 'unix-jikan';

/** iOS Safari は 16px 未満の入力欄で拡大するので 16px */
const FONT_SIZE = 16;

const mono: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  // break-all だと「09:00:00.」「123」のように数字の途中で折れる。
  // anywhere なら空白で先に折れ、19 桁の数字のような長い 1 語だけがはみ出さずに折れる
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

const inputStyle: React.CSSProperties = { fontSize: FONT_SIZE };

/** 入力が止まってから値を返す */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** マウント後だけ現在時刻を持つ。1 秒ごと、タブが裏のときは止める */
function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    let id: number | undefined;
    const start = () => {
      setNow(Date.now());
      id = window.setInterval(() => setNow(Date.now()), 1000);
    };
    const stop = () => {
      if (id !== undefined) window.clearInterval(id);
      id = undefined;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  return now;
}

/** 一度だけ送る（入力のたびに送らない。値そのものは送らない） */
function useTrackOnce() {
  const sent = useRef(new Set<string>());
  // 毎秒の描画（useNow）のたびに effect を回さないよう、同じ関数を返す
  return useCallback((action: string) => {
    if (sent.current.has(action)) return;
    sent.current.add(action);
    trackToolUse(SLUG, action);
  }, []);
}

function CopyButton({ value, label, id, copied, onCopy }: {
  value: string;
  /** 読み上げ用の項目名。値そのものを aria-label に入れない（ログは最大 1MB になる） */
  label: string;
  id: string;
  copied: string | null;
  onCopy: (value: string, id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onCopy(value, id)}
      style={{ ...buttonStyle(), minHeight: 44, flexShrink: 0 }}
      aria-label={`${label}をコピー`}
    >
      {copied === id ? 'コピーしました' : 'コピー'}
    </button>
  );
}

interface Row {
  id: string;
  label: string;
  value: string;
  copy?: boolean;
}

function ResultRows({ rows, copied, onCopy }: {
  rows: Row[];
  copied: string | null;
  onCopy: (value: string, id: string) => void;
}) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
      {rows.map((row) => (
        <li
          key={row.id}
          className="panel"
          style={{
            margin: 0,
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div className="hint" style={{ margin: 0 }}>{row.label}</div>
            <div style={{ ...mono, fontWeight: 700 }}>{row.value}</div>
          </div>
          {row.copy !== false && (
            <CopyButton value={row.value} label={row.label} id={row.id} copied={copied} onCopy={onCopy} />
          )}
        </li>
      ))}
    </ul>
  );
}

const jaWithWareki = (w: WallClock, showMs = false) => {
  const wareki = warekiOf(w);
  return wareki ? `${formatJa(w, showMs)}（${wareki}）` : formatJa(w, showMs);
};

export default function Calculator() {
  const now = useNow();
  const track = useTrackOnce();
  const [copied, setCopied] = useState<string | null>(null);

  const onCopy = async (value: string, id: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      trackToolUse(SLUG, 'copy');
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      // クリップボードが使えない環境では何もしない（表示を手で選んでコピーできる）
    }
  };

  // ---- 数字 → 日時 ----
  const [input, setInput] = useState('');
  const [override, setOverride] = useState<Unit | null>(null);
  const [excelBase, setExcelBase] = useState<1900 | 1904>(1900);
  const debouncedInput = useDebounced(input, DEBOUNCE_MS);

  const converted = useMemo(
    () => (debouncedInput.trim() ? convertNumber(debouncedInput, override ?? undefined, { excelBase }) : null),
    [debouncedInput, override, excelBase],
  );
  /** 自動の判定が Excel のとき、秒として読んだ結果も併記する */
  const asSeconds = useMemo(
    () => (converted && converted.detected === 'excel' && converted.unit === 'excel'
      ? convertNumber(debouncedInput, 'sec')
      : null),
    [converted, debouncedInput],
  );

  useEffect(() => {
    if (converted && converted.result.kind !== 'error') track(`to-date-${converted.unit}`);
  }, [converted, track]);

  const chooseUnit = (unit: Unit) => {
    if (!converted) return;
    setOverride(unit === converted.detected ? null : unit);
    if (unit !== converted.unit) trackToolUse(SLUG, `override-${converted.unit}-${unit}`);
  };

  // ---- 日時 → 数字 ----
  const [date, setDate] = useState('');
  const [time, setTime] = useState('00:00:00');
  const [zone, setZone] = useState<Zone>('jst');
  const reverse = useMemo(() => (date ? dateTimeToNumbers(date, time, zone) : null), [date, time, zone]);

  useEffect(() => {
    if (reverse) track('to-number');
  }, [reverse, track]);

  const fillNow = () => {
    const w = wallClockAt(Date.now(), zone === 'jst' ? JST_OFFSET_MS : 0);
    setDate(formatYmd(w));
    setTime(formatHms(w));
  };

  // ---- ログ ----
  const [log, setLog] = useState('');
  const debouncedLog = useDebounced(log, DEBOUNCE_MS);
  const logResult = useMemo(() => (debouncedLog ? annotateLog(debouncedLog) : null), [debouncedLog]);

  useEffect(() => {
    if (logResult?.ok && logResult.count > 0) track('log');
  }, [logResult, track]);

  const nowSeconds = now === null ? null : Math.floor(now / 1000);

  return (
    <div className="card">
      <div className="panel quiet" style={{ marginTop: 0, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div>
          <div className="hint" style={{ margin: 0 }}>いまの UNIX時間（秒）</div>
          <div style={{ ...mono, fontSize: '1.4rem', fontWeight: 700 }}>{nowSeconds ?? '—'}</div>
          <div className="hint" style={{ margin: 0 }}>
            {now === null ? '—' : `${jaWithWareki(wallClockAt(now, JST_OFFSET_MS))} 日本時間`}
          </div>
        </div>
        {nowSeconds !== null && (
          <CopyButton value={String(nowSeconds)} label="いまの UNIX時間" id="now" copied={copied} onCopy={onCopy} />
        )}
      </div>

      <h2 style={{ fontSize: '1.05rem', marginTop: 20 }}>数字 → 日時</h2>
      <div className="field">
        <label htmlFor="uj-input">UNIX時間・ミリ秒・Excel のシリアル値</label>
        <input
          id="uj-input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder="例：1793836800 ／ 1793836800000 ／ 46331"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOverride(null);
          }}
          style={{ ...inputStyle, ...mono }}
        />
        <p className="hint">10 桁は秒、13 桁はミリ秒、6 桁以下は Excel のシリアル値として自動で読みます。読み方は下のボタンで直せます。</p>
      </div>

      {debouncedInput.trim() !== '' && converted === null && (
        <div className="note">数字として読めませんでした。半角の数字（小数点・マイナスも可）を入れてください。</div>
      )}

      {converted && (
        <>
          <p style={{ margin: '8px 0' }}>
            <strong>{UNIT_LABELS[converted.unit]}</strong>として読みました
            {converted.unit !== converted.detected && '（手で切り替え）'}
            {converted.unit === 'excel' && `・${excelBase} 年基準`}
          </p>
          <NumberResult
            converted={converted}
            asSeconds={asSeconds}
            now={now}
            copied={copied}
            onCopy={onCopy}
          />

          {/* 答えを先に見せ、読み方の切り替えはその下に置く（360px で最初の画面に答えが入るように） */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
            {UNITS.filter((u) => u !== converted.unit).map((u) => (
              <button key={u} type="button" style={buttonStyle()} onClick={() => chooseUnit(u)}>
                {UNIT_LABELS[u]}として読む
              </button>
            ))}
            {converted.unit === 'excel' && (
              <button
                type="button"
                style={buttonStyle(excelBase === 1904)}
                aria-pressed={excelBase === 1904}
                onClick={() => {
                  setExcelBase(excelBase === 1900 ? 1904 : 1900);
                  trackToolUse(SLUG, `excel-base-${excelBase === 1900 ? 1904 : 1900}`);
                }}
              >
                {excelBase === 1900 ? '1904 年基準として読む（Mac の古い Excel）' : '1900 年基準に戻す'}
              </button>
            )}
          </div>

        </>
      )}

      <h2 style={{ fontSize: '1.05rem', marginTop: 28 }}>日時 → 数字</h2>
      <div className="field-row">
        <label>
          日付
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
        </label>
        <label>
          時刻
          <input type="time" step={1} value={time} onChange={(e) => setTime(e.target.value)} style={inputStyle} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0 12px' }}>
        {([['jst', '日本時間'], ['utc', 'UTC']] as [Zone, string][]).map(([z, label]) => (
          <button key={z} type="button" style={buttonStyle(zone === z)} aria-pressed={zone === z} onClick={() => setZone(z)}>
            {label}として
          </button>
        ))}
        <button type="button" style={buttonStyle()} onClick={fillNow}>いまの時刻</button>
      </div>

      {reverse && (
        <>
          <ResultRows
            copied={copied}
            onCopy={onCopy}
            rows={[
              { id: 'r-sec', label: 'UNIX時間（秒）', value: String(reverse.seconds) },
              { id: 'r-ms', label: 'ミリ秒', value: String(reverse.milliseconds) },
              reverse.excel === null
                ? { id: 'r-excel', label: 'Excel のシリアル値（1900 年基準）', value: reverse.excelError ?? '', copy: false }
                : { id: 'r-excel', label: 'Excel のシリアル値（1900 年基準）', value: formatSerial(reverse.excel) },
              { id: 'r-iso', label: 'ISO 8601', value: reverse.iso },
            ]}
          />
          <p className="hint">
            Excel のシリアル値にはタイムゾーンがありません。入力した見たままの日時から出すので、日本時間／UTC を切り替えても変わりません（変わるのは UNIX時間・ミリ秒・ISO 8601 だけです）。
          </p>
        </>
      )}

      <details style={{ marginTop: 28 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700, minHeight: 44, display: 'flex', alignItems: 'center' }}>
          ログをまとめて変換（貼った中の 10 桁・13 桁に日本時間を添える）
        </summary>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="uj-log">ログ・API の応答</label>
          <textarea
            id="uj-log"
            rows={8}
            spellCheck={false}
            value={log}
            onChange={(e) => setLog(e.target.value)}
            placeholder={'例：{"timestamp": 1793836800, "level": "info"}'}
            style={{ ...inputStyle, ...mono, width: '100%' }}
          />
          <p className="hint">
            元の文字は変えず、時刻の直後に［日本時間］を書き足すだけです。先頭が 0 のもの・直前が「.」「-」「/」のもの・2000〜2100 年に入らないものは、電話番号や ID とみなして拾いません。Excel のシリアル値は拾いません。
          </p>
        </div>
        {logResult && !logResult.ok && <div className="note">{logResult.message}</div>}
        {logResult?.ok && (
          <div className="field">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <strong>{logResult.count}件に日時を添えました</strong>
              {logResult.count > 0 && (
                <CopyButton value={logResult.output} label="変換したログ" id="log" copied={copied} onCopy={onCopy} />
              )}
            </div>
            <pre
              style={{
                ...mono,
                whiteSpace: 'pre-wrap',
                fontSize: '0.85rem',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 10,
                maxHeight: 400,
                overflow: 'auto',
              }}
            >
              {logResult.output}
            </pre>
          </div>
        )}
      </details>

      <p className="hint" style={{ marginTop: 16 }}>
        計算はすべてこの端末の中（ブラウザ）で行い、<strong>入力した数字・ログはどこにも送信されず、保存もされません</strong>。
      </p>
    </div>
  );
}

function NumberResult({ converted, asSeconds, now, copied, onCopy }: {
  converted: NonNullable<ReturnType<typeof convertNumber>>;
  asSeconds: ReturnType<typeof convertNumber>;
  now: number | null;
  copied: string | null;
  onCopy: (value: string, id: string) => void;
}) {
  const r = converted.result;
  if (r.kind === 'error') return <div className="note">{r.message}</div>;
  if (r.kind === 'excel-phantom') {
    return (
      <div className="note">
        <strong>1900年2月29日（Excel だけにある日付）</strong> {r.time}
        <br />
        実際の暦に 1900 年 2 月 29 日はありません。Excel は昔の表計算ソフト（Lotus 1-2-3）との互換のため 1900 年をうるう年として扱っていて、シリアル値 60 がこの日に当たります。
      </div>
    );
  }
  if (r.kind === 'excel-time-only') {
    return (
      <div className="note">
        日付の部分が 0 なので、時刻だけの値です：<strong>{r.time}</strong>（Excel では「1900/1/0」と表示されます）。
      </div>
    );
  }

  if (r.kind === 'excel') {
    const wallMs = wallToMs(r.wall.year, r.wall.month, r.wall.day, r.wall.hour, r.wall.minute, r.wall.second);
    const asJstSeconds = Math.floor((wallMs - JST_OFFSET_MS) / 1000);
    const wareki = warekiOf(r.wall);
    const rows: Row[] = [
      { id: 'e-ja', label: '日時（セルに見えるとおり）', value: formatJa(r.wall) },
      ...(wareki ? [{ id: 'e-wareki', label: '和暦', value: `${wareki}（${weekdayJa(r.wall)}）` }] : []),
      { id: 'e-iso', label: 'ISO 8601（タイムゾーンなし）', value: formatIso(r.wall, false, '') },
      { id: 'e-unix', label: '日本時間として読んだ UNIX時間（秒）', value: String(asJstSeconds) },
      { id: 'e-rel', label: 'いまから', value: now === null ? '—' : formatRelative(wallMs - JST_OFFSET_MS, now), copy: false },
    ];
    const alt = asSeconds?.result.kind === 'unix' ? asSeconds.result : null;
    return (
      <>
        <ResultRows rows={rows} copied={copied} onCopy={onCopy} />
        <p className="hint">
          Excel のシリアル値にはタイムゾーンがありません（セルに入っている見たままの日時）。
          {alt && `UNIX時間（秒）として読むと ${formatJa(alt.jst)} 日本時間です。`}
        </p>
      </>
    );
  }

  const note = y2038Note(r.epochMs);
  const rows: Row[] = [
    { id: 'u-jst', label: '日本時間', value: jaWithWareki(r.jst, r.showMs) },
    { id: 'u-utc', label: 'UTC', value: formatJa(r.utc, r.showMs) },
    { id: 'u-iso-jst', label: 'ISO 8601（日本時間）', value: formatIso(r.jst, r.showMs, '+09:00') },
    { id: 'u-iso-utc', label: 'ISO 8601（UTC）', value: formatIso(r.utc, r.showMs, 'Z') },
    { id: 'u-sec', label: 'UNIX時間（秒）', value: String(Math.floor(r.epochMs / 1000)) },
    { id: 'u-ms', label: 'ミリ秒', value: String(r.epochMs) },
    { id: 'u-rel', label: 'いまから', value: now === null ? '—' : formatRelative(r.epochMs, now), copy: false },
  ];
  return (
    <>
      <ResultRows rows={rows} copied={copied} onCopy={onCopy} />
      {r.truncated && <p className="hint">ミリ秒より細かい桁は以下切り捨てて表示しています。</p>}
      {note && <div className="note">{note}</div>}
    </>
  );
}
