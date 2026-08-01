'use client';

import { useMemo, useState } from 'react';
import {
  convertWidth,
  countChars,
  DEFAULT_OPTIONS,
  type Direction,
  type WidthOptions,
} from '@/lib/hankaku-zenkaku';
import { trackToolUse } from '@/lib/analytics';

const TARGETS: { key: keyof WidthOptions; label: string; hint: string }[] = [
  { key: 'alnum', label: '英数字', hint: 'ＡＢ１２ ⇔ AB12' },
  { key: 'kana', label: 'カタカナ', hint: 'アイ ⇔ ｱｲ' },
  { key: 'symbol', label: '記号', hint: '！？ ⇔ !?' },
  { key: 'space', label: 'スペース', hint: '全角空白 ⇔ 半角空白' },
];

const SAMPLE = 'ﾔﾏﾀﾞ ﾀﾛｳ\n東京都渋谷区１−２−３　渋谷ビル４Ｆ\nTEL：０３−１２３４−５６７８';

/** 向きの切り替えボタン。選択中は塗りつぶす */
function DirectionButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: '8px 18px',
        borderRadius: 999,
        border: `1px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
        background: active ? 'var(--brand)' : 'var(--surface)',
        color: active ? '#fff' : 'var(--text)',
        fontSize: '0.9rem',
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

export default function Converter() {
  const [text, setText] = useState(SAMPLE);
  const [direction, setDirection] = useState<Direction>('toFull');
  const [options, setOptions] = useState<WidthOptions>(DEFAULT_OPTIONS);
  const [copied, setCopied] = useState(false);

  const result = useMemo(
    () => convertWidth(text, direction, options),
    [text, direction, options],
  );
  const before = countChars(text);
  const after = countChars(result);

  const toggle = (key: keyof WidthOptions) =>
    setOptions((o) => ({ ...o, [key]: !o[key] }));

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      trackToolUse('hankaku-zenkaku', direction);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // クリップボードが使えない環境（権限拒否・http接続など）では何もしない。
      // 結果は下のテキストエリアから手で選択してコピーできる
    }
  };

  return (
    <div className="card">
      <div style={{ display: 'grid', gap: 16 }}>
        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 6 }}>変換の向き</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <DirectionButton active={direction === 'toFull'} onClick={() => setDirection('toFull')}>
              半角 → 全角
            </DirectionButton>
            <DirectionButton active={direction === 'toHalf'} onClick={() => setDirection('toHalf')}>
              全角 → 半角
            </DirectionButton>
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 6 }}>
            変換する文字の種類
          </div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: '0.9rem' }}>
            {TARGETS.map((t) => (
              <label
                key={t.key}
                style={{ fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' }}
              >
                <input
                  type="checkbox"
                  checked={options[t.key]}
                  onChange={() => toggle(t.key)}
                  style={{ width: 'auto' }}
                />
                {t.label}
                <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{t.hint}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="hz-input">変換したい文字列</label>
          <textarea
            id="hz-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            spellCheck={false}
            placeholder="ここに貼り付けてください"
            style={{ marginTop: 6 }}
          />
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
            {before.total}文字（全角 {before.full} / 半角 {before.half}）
          </p>
        </div>

        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <label htmlFor="hz-output">変換結果</label>
            <button
              type="button"
              onClick={onCopy}
              style={{
                padding: '6px 16px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: copied ? '#dcfce7' : 'var(--surface)',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {copied ? 'コピーしました' : 'コピー'}
            </button>
          </div>
          <textarea
            id="hz-output"
            value={result}
            readOnly
            rows={5}
            spellCheck={false}
            style={{ marginTop: 6, background: '#eef2ff' }}
          />
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
            {after.total}文字（全角 {after.full} / 半角 {after.half}）
          </p>
        </div>
      </div>
    </div>
  );
}
