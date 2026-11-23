'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { allFormats, formatHex, hexForQuery, round8, type Rgba } from '@/lib/color/convert';
import { INPUT_FORMAT_LABELS, parseColor, readColorQuery, type ToolTab } from '@/lib/color/parse';
import {
  TARGET_LABELS,
  contrastOf,
  formatRatio,
  judge,
  nearestPassing,
  visiblePair,
  type Judgement,
  type Suggestion,
  type Target,
} from '@/lib/color/contrast';
import { simulate, VISION_LABELS, VISION_TYPES } from '@/lib/color/vision';
import { nearestNames } from '@/lib/color/names';
import { trackToolUse } from '@/lib/analytics';

/**
 * カラーコード変換・コントラスト比チェッカーの画面。ロジックは lib/color/。
 *
 * - **送信しない。** 色はこのコンポーネントの state と URL のクエリ（アドレスバーを書き換えるだけ）にだけある
 * - URL のクエリ（?c= / ?fg=&bg=）はマウント後に読む（useSearchParams は静的出力で CSR 化を招くため）。
 *   不正な値は何も言わずに既定値に戻す（lib/color/parse.ts の readColorQuery）
 * - tool_use に送るのは操作の種類と入力形式だけ。色の値は送らない
 *
 * 仕様: docs/features/color-code-contrast.md
 */

const SLUG = 'color-code';

const mono: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
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

const inputStyle: React.CSSProperties = {
  ...mono,
  flex: '1 1 0',
  minWidth: 0,
  fontSize: 16, // iOS Safari は 16px 未満の入力欄で拡大する
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  boxSizing: 'border-box',
};

const swatchBorder = '1px solid var(--border)';

/** 透明度があるときに市松模様の上に色を重ねる（透明度が見えるように） */
function swatchBackground(c: Rgba): string {
  const color = formatHex(c);
  if (c.a >= 1) return color;
  return `linear-gradient(${color}, ${color}), repeating-conic-gradient(#cccccc 0% 25%, #ffffff 0% 50%) 0 0 / 12px 12px`;
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

interface EyeDropperLike {
  open(): Promise<{ sRGBHex: string }>;
}

function useEyeDropper(): (() => Promise<string | null>) | null {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'EyeDropper' in window);
  }, []);
  const pick = useCallback(async () => {
    try {
      const Ctor = (window as unknown as { EyeDropper: new () => EyeDropperLike }).EyeDropper;
      const r = await new Ctor().open();
      return r.sRGBHex;
    } catch {
      return null; // Esc で閉じたとき
    }
  }, []);
  return supported ? pick : null;
}

/** 文字の入力欄・カラーピッカー・スポイトのまとまり */
function ColorField({
  id,
  label,
  text,
  color,
  error,
  onText,
  onPick,
  eyeDropper,
}: {
  id: string;
  label: string;
  text: string;
  color: Rgba;
  error: string | null;
  onText: (v: string) => void;
  onPick: (hex: string, how: 'picker' | 'eyedropper') => void;
  eyeDropper: (() => Promise<string | null>) | null;
}) {
  return (
    <div className="field" style={{ marginBottom: 8 }}>
      <label htmlFor={id}>{label}</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          id={id}
          type="text"
          value={text}
          onChange={(e) => onText(e.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          style={inputStyle}
        />
        <input
          type="color"
          aria-label={`${label}をパレットから選ぶ`}
          value={formatHex({ ...color, a: 1 })}
          onChange={(e) => onPick(e.target.value, 'picker')}
          style={{ width: 44, height: 44, padding: 2, border: swatchBorder, borderRadius: 8, background: 'var(--surface)', flex: '0 0 auto' }}
        />
        {eyeDropper && (
          <button
            type="button"
            style={buttonStyle()}
            onClick={async () => {
              const hex = await eyeDropper();
              if (hex) onPick(hex, 'eyedropper');
            }}
          >
            スポイト
          </button>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="hint" style={{ margin: '4px 0 0', color: 'var(--danger-fg)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

const ERROR_TEXT = {
  empty: null,
  unknown: '色として読めません。#1a1a1a・rgb(26 26 26)・hsl(0 0% 10%)・cmyk(0% 0% 0% 90%)・色の名前のどれかで入れてください（直前の色を表示しています）。',
  range: '値が範囲の外です（RGB は 0〜255、% は 0〜100）。直前の色を表示しています。',
} as const;

/** 入力欄の文字列と、読めた最後の色を持つ */
function useColorInput(initial: Rgba) {
  const [text, setText] = useState(formatHex(initial));
  const [color, setColor] = useState<Rgba>(initial);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<keyof typeof INPUT_FORMAT_LABELS>('hex');

  const onText = useCallback((v: string) => {
    setText(v);
    const p = parseColor(v);
    if (p.ok) {
      setColor(p.color);
      setFormat(p.format);
      setError(null);
    } else {
      setError(ERROR_TEXT[p.reason]);
    }
  }, []);

  /** パレット・スポイト・提案・クエリから色を入れる（入力欄は HEX にそろえる） */
  const set = useCallback((c: Rgba) => {
    setColor(c);
    setText(formatHex(c));
    setFormat('hex');
    setError(null);
  }, []);

  return { text, color, error, format, onText, set };
}

function useCopy(track: (a: string) => void) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback(
    async (value: string, id: string) => {
      try {
        await navigator.clipboard.writeText(value);
        setCopied(id);
        trackToolUse(SLUG, `copy-${id}`);
        track('copy');
        window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
      } catch {
        // クリップボードが使えない環境では何もしない（値は手で選んでコピーできる）
      }
    },
    [track],
  );
  return { copied, copy };
}

const TARGET_OPTIONS: { min: number; label: string }[] = [
  { min: 4.5, label: '4.5（通常の文字の AA・大きな文字の AAA）' },
  { min: 7, label: '7（通常の文字の AAA）' },
  { min: 3, label: '3（大きな文字の AA・アイコンや枠）' },
];

function PassMark({ j }: { j: Judgement | undefined }) {
  if (!j) return <span className="hint">—</span>;
  return j.pass ? (
    <strong style={{ color: 'var(--ok-fg)', whiteSpace: 'nowrap' }}>○合格</strong>
  ) : (
    <strong style={{ color: 'var(--danger-fg)', whiteSpace: 'nowrap' }}>×不合格</strong>
  );
}

/** 文字色・背景色の見本（漢字かな交じり、大小・太字） */
function TextSample({ fg, bg, compact = false }: { fg: Rgba; bg: Rgba; compact?: boolean }) {
  const v = visiblePair(fg, bg);
  return (
    <div
      style={{
        background: formatHex(v.bg),
        color: formatHex(v.fg),
        border: swatchBorder,
        borderRadius: 'var(--radius-sm)',
        padding: compact ? '10px 12px' : '14px 16px',
        overflowWrap: 'anywhere',
      }}
    >
      {compact ? (
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>見本の文 Aa</p>
      ) : (
        <>
          <p style={{ margin: '0 0 6px', fontSize: 16, lineHeight: 1.6 }}>通常の文字（16px）：今日は晴れ、気温は23度です。</p>
          <p style={{ margin: '0 0 6px', fontSize: 24, lineHeight: 1.4 }}>大きな文字（24px）</p>
          <p style={{ margin: 0, fontSize: 18.66, fontWeight: 700, lineHeight: 1.4 }}>太字の大きな文字（18.66px）</p>
        </>
      )}
    </div>
  );
}

function SuggestionRow({
  side,
  suggestion,
  onApply,
}: {
  side: '文字色' | '背景色';
  suggestion: Suggestion | null;
  onApply: (c: Rgba) => void;
}) {
  if (!suggestion) {
    return (
      <p style={{ margin: '8px 0' }}>
        <strong>{side}</strong>：{side}の明るさだけでは届きません。
        {side === '文字色' ? '背景色側を変えてください。' : '文字色側を変えてください。'}
      </p>
    );
  }
  const hex = formatHex(suggestion.color);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '8px 0' }}>
      <span
        aria-hidden="true"
        style={{ width: 32, height: 32, borderRadius: 6, border: swatchBorder, background: swatchBackground(suggestion.color), flex: '0 0 auto' }}
      />
      <span style={{ flex: '1 1 10em', minWidth: 0 }}>
        <strong>{side}</strong>を{suggestion.direction === 'lighter' ? '明るく' : '暗く'}して{' '}
        <code style={{ ...mono, fontSize: 'var(--fs-sm)' }}>{hex}</code>
        <span className="hint">（{formatRatio(suggestion.ratio)} : 1）</span>
      </span>
      <button type="button" style={buttonStyle()} onClick={() => onApply(suggestion.color)}>
        この色に替える
      </button>
    </div>
  );
}

function VisionGrid({ fg, bg, single }: { fg: Rgba; bg: Rgba; single: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 8 }}>
      {VISION_TYPES.map((t) => {
        const v = visiblePair(fg, bg);
        const sf = round8(simulate(v.fg, t));
        const sb = round8(simulate(v.bg, t));
        return (
          <figure key={t} style={{ margin: 0, minWidth: 0 }}>
            {single ? (
              <div aria-hidden="true" style={{ height: 56, borderRadius: 'var(--radius-sm)', border: swatchBorder, background: formatHex(sf) }} />
            ) : (
              <TextSample fg={sf} bg={sb} compact />
            )}
            <figcaption className="hint" style={{ marginTop: 4 }}>
              {VISION_LABELS[t]}
              {!single && <>・{formatRatio(contrastOf(sf, sb))} : 1</>}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

export default function Calculator() {
  const [tab, setTab] = useState<ToolTab>('convert');
  const [ready, setReady] = useState(false);
  const conv = useColorInput(readColorQuery('').c);
  const fg = useColorInput(readColorQuery('').fg);
  const bg = useColorInput(readColorQuery('').bg);
  const [targetMin, setTargetMin] = useState<number | null>(null);
  const track = useTrackOnce();
  const { copied, copy } = useCopy(track);
  const eyeDropper = useEyeDropper();

  // URL のクエリから色を読む（マウント後に1回）
  useEffect(() => {
    const q = readColorQuery(window.location.search);
    setTab(q.tab);
    conv.set(q.c);
    fg.set(q.fg);
    bg.set(q.bg);
    setReady(true);
  }, [conv.set, fg.set, bg.set]);

  // 共有用の URL（アドレスバーを書き換えるだけ。値は送らない）
  useEffect(() => {
    if (!ready) return;
    try {
      const params = new URLSearchParams();
      if (tab === 'convert') params.set('c', hexForQuery(conv.color));
      else {
        params.set('fg', hexForQuery(fg.color));
        params.set('bg', hexForQuery(bg.color));
      }
      window.history.replaceState(null, '', `?${params.toString()}`);
    } catch {
      // 履歴を書き換えられない環境では何もしない
    }
  }, [ready, tab, conv.color, fg.color, bg.color]);

  useEffect(() => {
    if (ready && conv.format !== 'hex') track(`parse-${conv.format}`);
  }, [ready, conv.format, track]);

  const formats = useMemo(() => allFormats(conv.color), [conv.color]);
  const names = useMemo(() => nearestNames(conv.color), [conv.color]);

  const ratio = useMemo(() => contrastOf(fg.color, bg.color), [fg.color, bg.color]);
  const judgements = useMemo(() => judge(ratio), [ratio]);
  const find = (t: Target, level: 'AA' | 'AAA') => judgements.find((j) => j.target === t && j.level === level);

  // 目標：選んでいなければ、落ちている中で一番低い基準（通常の文字の AA → AAA）
  const effectiveTarget = targetMin ?? (ratio < 4.5 ? 4.5 : 7);
  const failing = ratio < effectiveTarget;
  const fgSuggestion = useMemo(
    () => (failing ? nearestPassing(fg.color, bg.color, effectiveTarget) : null),
    [failing, fg.color, bg.color, effectiveTarget],
  );
  const bgSuggestion = useMemo(
    () => (failing ? nearestPassing(bg.color, fg.color, effectiveTarget) : null),
    [failing, fg.color, bg.color, effectiveTarget],
  );

  const onPick = (field: ReturnType<typeof useColorInput>) => (hex: string, how: 'picker' | 'eyedropper') => {
    const p = parseColor(hex);
    if (!p.ok) return;
    field.set({ ...p.color, a: field.color.a });
    track(how);
  };

  const swap = () => {
    const [f, b] = [fg.color, bg.color];
    fg.set(b);
    bg.set(f);
    trackToolUse(SLUG, 'swap');
  };

  return (
    <div className="card">
      <div role="tablist" aria-label="使い方" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {(
          [
            ['convert', '色の変換'],
            ['contrast', 'コントラスト比'],
          ] as const
        ).map(([t, text]) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            style={{ ...buttonStyle(tab === t), flex: '1 1 0' }}
            onClick={() => {
              setTab(t);
              track(`tab-${t}`);
            }}
          >
            {text}
          </button>
        ))}
      </div>

      {tab === 'convert' ? (
        <div role="tabpanel">
          <ColorField
            id="color-input"
            label="色（HEX・RGB・HSL・CMYK・色の名前）"
            text={conv.text}
            color={conv.color}
            error={conv.error}
            onText={conv.onText}
            onPick={onPick(conv)}
            eyeDropper={eyeDropper}
          />
          <p className="hint" style={{ margin: '0 0 8px' }}>
            貼った形式を自動で判定します：<span className="chip">{INPUT_FORMAT_LABELS[conv.format]}</span>
            {conv.color.a < 1 && <>（透明度 {Math.round(conv.color.a * 1000) / 10}%）</>}
          </p>

          <div className="panel quiet">
            <div
              aria-hidden="true"
              style={{ height: 64, borderRadius: 'var(--radius-sm)', border: swatchBorder, background: swatchBackground(conv.color), marginBottom: 6 }}
            />
            {/* 1行1形式。値は折り返さず省略もしないため、行の幅いっぱいを使い、収まる文字サイズにする
                （等幅は1文字 ≒ 0.6em。上限は --fs-sm）。コピーは見出しの行の右端 */}
            <dl className="kv">
              {formats.map((f) => (
                <div key={f.key} style={{ display: 'block' }}>
                  <dt style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    {f.label}
                    <button type="button" style={{ ...buttonStyle(copied === f.key), minHeight: 36, padding: '4px 12px' }} onClick={() => copy(f.value, f.key)}>
                      {copied === f.key ? 'コピーしました' : 'コピー'}
                    </button>
                  </dt>
                  <dd style={{ containerType: 'inline-size', marginTop: 2 }}>
                    <code
                      style={{
                        ...mono,
                        display: 'block',
                        whiteSpace: 'nowrap',
                        fontSize: `min(var(--fs-md), calc(100cqi / ${(f.value.length * 0.62).toFixed(2)}))`,
                      }}
                    >
                      {f.value}
                    </code>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="hint" style={{ margin: '6px 0 0' }}>
              CMYK は ICC プロファイルを使わない簡易変換です。印刷所に入稿する色は、印刷所の指定に従ってください。
            </p>
          </div>

          <h3 style={{ marginBottom: 4 }}>近い色の名前</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {names.map((n) => (
              <li key={`${n.source}-${n.name}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: swatchBorder }}>
                <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 6, border: swatchBorder, background: `#${n.hex}`, flex: '0 0 auto' }} />
                <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <strong>{n.name}</strong>{' '}
                  <code style={{ ...mono, fontSize: 'var(--fs-xs)' }}>#{n.hex}</code>
                  <br />
                  <span className="hint">
                    {n.source === 'css' ? 'CSS の色名' : `JIS 慣用色名（${n.munsell} からの近似）`}・色差 {n.deltaE.toFixed(1)}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <h3 style={{ marginBottom: 4 }}>色の見え方のちがい（近似）</h3>
          <VisionGrid fg={conv.color} bg={conv.color} single />
          <p className="hint">シミュレーションは目安で、見え方には個人差があります。診断ではありません。</p>

          <button
            type="button"
            style={{ ...buttonStyle(), marginTop: 8, whiteSpace: 'normal', width: '100%' }}
            onClick={() => {
              fg.set(conv.color);
              setTab('contrast');
              trackToolUse(SLUG, 'to-contrast');
            }}
          >
            この色を文字色にしてコントラストを調べる
          </button>
        </div>
      ) : (
        <div role="tabpanel">
          <ColorField
            id="fg-input"
            label="文字色"
            text={fg.text}
            color={fg.color}
            error={fg.error}
            onText={fg.onText}
            onPick={onPick(fg)}
            eyeDropper={eyeDropper}
          />
          <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 8px' }}>
            <button type="button" style={buttonStyle()} onClick={swap} aria-label="文字色と背景色を入れ替える">
              ⇅ 入れ替え
            </button>
          </div>
          <ColorField
            id="bg-input"
            label="背景色"
            text={bg.text}
            color={bg.color}
            error={bg.error}
            onText={bg.onText}
            onPick={onPick(bg)}
            eyeDropper={eyeDropper}
          />

          <div className="panel" aria-live="polite">
            <div className="metric">
              <span className="label">コントラスト比</span>
              <span className="value">{formatRatio(ratio)}</span>
              <span className="unit">: 1</span>
            </div>
            {(fg.color.a < 1 || bg.color.a < 1) && (
              <p className="hint" style={{ margin: '4px 0 0' }}>
                透明度つきの色は、{bg.color.a < 1 ? '背景色を白い地に、' : ''}文字色を背景色に重ねた色で比を出しています。
              </p>
            )}
            <table style={{ width: '100%', marginTop: 10, fontSize: 'var(--fs-sm)' }}>
              <thead>
                <tr>
                  <th>対象</th>
                  <th>AA</th>
                  <th>AAA</th>
                </tr>
              </thead>
              <tbody>
                {(['normal', 'large', 'ui'] as const).map((t) => (
                  <tr key={t}>
                    <td style={{ textAlign: 'left' }}>
                      {t === 'large' ? (
                        <>
                          大きな文字
                          <br />
                          <span className="hint">24px 以上／太字 18.66px 以上</span>
                        </>
                      ) : (
                        TARGET_LABELS[t]
                      )}
                    </td>
                    <td>
                      <PassMark j={find(t, 'AA')} />
                    </td>
                    <td>
                      <PassMark j={find(t, 'AAA')} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint" style={{ margin: '6px 0 0' }}>
              基準：通常の文字 4.5 以上（AA）・7 以上（AAA）／大きな文字 3 以上・4.5 以上／アイコン・ボタンの枠など 3 以上（1.4.11）。判定は表示を丸める前の値で行います。
            </p>
          </div>

          {ratio < 7 && (
            <div className="panel quiet">
              <div className="field" style={{ marginBottom: 6 }}>
                <label htmlFor="target-select">目標の比</label>
                <select
                  id="target-select"
                  value={effectiveTarget}
                  onChange={(e) => setTargetMin(Number(e.target.value))}
                  style={{ ...inputStyle, fontFamily: 'inherit', width: '100%' }}
                >
                  {TARGET_OPTIONS.map((o) => (
                    <option key={o.min} value={o.min}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              {failing ? (
                <>
                  <p style={{ margin: '6px 0' }}>
                    <strong>合格する一番近い色</strong>
                    <span className="hint">（色相と彩度はそのまま、明るさだけを動かした色）</span>
                  </p>
                  <SuggestionRow
                    side="文字色"
                    suggestion={fgSuggestion}
                    onApply={(c) => {
                      fg.set(c);
                      trackToolUse(SLUG, 'apply-fg');
                    }}
                  />
                  <SuggestionRow
                    side="背景色"
                    suggestion={bgSuggestion}
                    onApply={(c) => {
                      bg.set(c);
                      trackToolUse(SLUG, 'apply-bg');
                    }}
                  />
                  {!fgSuggestion && !bgSuggestion && (
                    <p style={{ margin: '8px 0 0' }}>
                      <strong>どちらか一方の明るさを動かすだけでは届きません。両方の色を変えてください。</strong>
                    </p>
                  )}
                </>
              ) : (
                <p style={{ margin: '6px 0 0' }}>この目標は満たしています。</p>
              )}
            </div>
          )}

          <h3 style={{ marginBottom: 4 }}>見本</h3>
          <TextSample fg={fg.color} bg={bg.color} />

          <h3 style={{ marginBottom: 4 }}>色の見え方のちがい（近似）</h3>
          <VisionGrid fg={fg.color} bg={bg.color} single={false} />
          <p className="hint">シミュレーションは目安で、見え方には個人差があります。診断ではありません。</p>
        </div>
      )}
    </div>
  );
}
