'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AMBIGUOUS_CHARS,
  BITS_PER_WORD,
  CHARSETS,
  CHARSET_KEYS,
  CHARSET_LABELS,
  DEFAULT_PASSPHRASE_OPTIONS,
  DEFAULT_PASSWORD_OPTIONS,
  MAX_COUNT,
  MAX_LENGTH,
  MAX_WORDS,
  MIN_LENGTH,
  MIN_WORDS,
  PASSPHRASE_WORDS,
  PasswordOptionError,
  SEPARATORS,
  alphabetSize,
  crackSeconds,
  entropyBits,
  formatDuration,
  generatePassphrases,
  generatePasswords,
  passphraseEntropyBits,
  STRENGTH_LABELS,
  strengthOf,
  type CharsetKey,
  type PassphraseOptions,
  type PasswordOptions,
  type Strength,
} from '@/lib/password';
import { trackToolUse } from '@/lib/analytics';

/** 生成するもの */
type Mode = 'password' | 'passphrase';

/** 区切り文字の表示名（空文字は見えないので言葉で書く） */
const SEPARATOR_LABELS: Record<string, string> = {
  '-': 'ハイフン（-）',
  _: 'アンダースコア（_）',
  '.': 'ピリオド（.）',
  ' ': 'スペース',
  '': '区切らない',
};

/** 強度に対応する色。段階の違いが一目で分かればよいので4色だけ */
const STRENGTH_COLORS: Record<Strength, string> = {
  weak: '#dc2626',
  fair: '#d97706',
  strong: '#16a34a',
  verystrong: '#15803d',
};

const monospace = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  // 生成した値は途中で折り返してよい（長いパスワードが画面からはみ出さないように）
  wordBreak: 'break-all' as const,
};

const buttonStyle = (variant: 'primary' | 'quiet' = 'quiet'): React.CSSProperties => ({
  padding: variant === 'primary' ? '10px 22px' : '4px 12px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  fontSize: variant === 'primary' ? 'var(--fs-sm)' : '0.8rem',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
});

export default function Calculator() {
  const [mode, setMode] = useState<Mode>('password');
  const [options, setOptions] = useState<PasswordOptions>(DEFAULT_PASSWORD_OPTIONS);
  const [phraseOptions, setPhraseOptions] = useState<PassphraseOptions>(
    DEFAULT_PASSPHRASE_OPTIONS,
  );
  const [results, setResults] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  /**
   * 生成。**描画中には呼ばない。**
   *
   * 静的書き出し（`output: 'export'`）なので、描画中に乱数を引くと
   * ビルド時に決まった値がHTMLに焼き付き、全員に同じパスワードが配られてしまう。
   * マウント後の `useEffect` からだけ呼ぶことで、必ず利用者の端末で作られる。
   */
  const generate = useCallback(() => {
    try {
      setResults(
        mode === 'password'
          ? generatePasswords(MAX_COUNT, options)
          : generatePassphrases(MAX_COUNT, phraseOptions),
      );
      setError(null);
    } catch (e) {
      if (e instanceof PasswordOptionError) {
        setResults([]);
        setError(e.message);
        return;
      }
      throw e;
    }
    setCopied(null);
  }, [mode, options, phraseOptions]);

  // 条件を変えたらその場で作り直す（ボタンを押させない）。初回もここで作られる
  useEffect(() => {
    generate();
  }, [generate]);

  /** 強度。乱数を使わないのでサーバー描画でも同じ値になる */
  const strength = useMemo(() => {
    try {
      const bits =
        mode === 'password' ? entropyBits(options) : passphraseEntropyBits(phraseOptions);
      return {
        bits,
        level: strengthOf(bits),
        duration: formatDuration(crackSeconds(bits)),
        candidates: mode === 'password' ? alphabetSize(options) : PASSPHRASE_WORDS.length,
      };
    } catch {
      // 文字種を1つも選んでいないとき。エラーの文言は error 側で出す
      return null;
    }
  }, [mode, options, phraseOptions]);

  const onCopy = async (value: string, index: number) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(index);
      trackToolUse('password', `copy-${mode}`);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      // クリップボードが使えない環境（権限拒否・http接続など）では何もしない。
      // 表示されている文字列を手で選択してコピーできる
    }
  };

  const onRegenerate = () => {
    generate();
    trackToolUse('password', `generate-${mode}`);
  };

  const toggle = (key: CharsetKey) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="card">
      <div className="field">
        <span className="field-label">作るもの</span>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {(
            [
              ['password', 'パスワード'],
              ['passphrase', 'パスフレーズ（単語をつなぐ）'],
            ] as [Mode, string][]
          ).map(([value, label]) => (
            <label key={value} style={{ fontWeight: mode === value ? 700 : 400 }}>
              <input
                type="radio"
                name="pw-mode"
                value={value}
                checked={mode === value}
                onChange={() => {
                  setMode(value);
                  trackToolUse('password', `mode-${value}`);
                }}
                style={{ width: 'auto', marginRight: 6 }}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {mode === 'password' ? (
        <>
          <div className="field">
            <label htmlFor="pw-length">
              長さ：<strong>{options.length}</strong> 文字
            </label>
            <input
              id="pw-length"
              type="range"
              min={MIN_LENGTH}
              max={MAX_LENGTH}
              step={1}
              value={options.length}
              onChange={(e) => setOptions({ ...options, length: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
            <p className="hint">
              長さは強さに最も効きます。{MIN_LENGTH}〜{MAX_LENGTH}文字。迷ったら16文字以上に。
            </p>
          </div>

          <div className="field">
            <span className="field-label">使う文字</span>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {CHARSET_KEYS.map((key) => (
                <label key={key} style={{ fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={options[key]}
                    onChange={() => toggle(key)}
                    style={{ width: 'auto', marginRight: 6 }}
                  />
                  {CHARSET_LABELS[key]}
                  <span className="hint" style={{ marginLeft: 4 }}>
                    {key === 'symbol' ? `（${CHARSETS.symbol.slice(0, 8)}…）` : ''}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label style={{ fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={options.excludeAmbiguous}
                onChange={(e) => setOptions({ ...options, excludeAmbiguous: e.target.checked })}
                style={{ width: 'auto', marginRight: 6 }}
              />
              紛らわしい文字（{[...AMBIGUOUS_CHARS].join(' ')}）を除く
            </label>
            <p className="hint">
              紙に書き写す・口頭で伝えるときに読み違えにくくなります。
              そのぶん使える文字が減るので、強さは少し下がります。
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="field-row">
            <label>
              単語の数
              <select
                value={phraseOptions.wordCount}
                onChange={(e) =>
                  setPhraseOptions({ ...phraseOptions, wordCount: Number(e.target.value) })
                }
              >
                {Array.from({ length: MAX_WORDS - MIN_WORDS + 1 }, (_, i) => MIN_WORDS + i).map(
                  (count) => (
                    <option key={count} value={count}>
                      {count}語（{count * BITS_PER_WORD}ビット）
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              区切り
              <select
                value={phraseOptions.separator}
                onChange={(e) =>
                  setPhraseOptions({ ...phraseOptions, separator: e.target.value })
                }
              >
                {SEPARATORS.map((separator) => (
                  <option key={separator || 'none'} value={separator}>
                    {SEPARATOR_LABELS[separator]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="field">
            <label style={{ fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={phraseOptions.capitalize}
                onChange={(e) =>
                  setPhraseOptions({ ...phraseOptions, capitalize: e.target.checked })
                }
                style={{ width: 'auto', marginRight: 6 }}
              />
              各単語の先頭を大文字にする（「大文字を含めること」の条件対策）
            </label>
            <label style={{ fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={phraseOptions.appendNumber}
                onChange={(e) =>
                  setPhraseOptions({ ...phraseOptions, appendNumber: e.target.checked })
                }
                style={{ width: 'auto', marginRight: 6 }}
              />
              末尾に2桁の数字を足す（「数字を含めること」の条件対策）
            </label>
            <p className="hint">
              単語は{PASSPHRASE_WORDS.length.toLocaleString('ja-JP')}語の中から選んでいます
              （1語あたり{BITS_PER_WORD}ビット）。大文字にするだけでは強さは増えません。
            </p>
          </div>
        </>
      )}

      {error !== null && <div className="note">{error}</div>}

      {strength && (
        <div className="panel">
          <dl className="kv">
            <div>
              <dt>強さの目安</dt>
              <dd>
                <strong style={{ color: STRENGTH_COLORS[strength.level] }}>
                  {STRENGTH_LABELS[strength.level]}
                </strong>
                （{strength.bits.toFixed(1)} ビット）
              </dd>
            </div>
            <div>
              <dt>総当たりにかかる時間</dt>
              <dd>{strength.duration}</dd>
            </div>
            <div>
              <dt>選ばれ方</dt>
              <dd>
                {mode === 'password'
                  ? `${strength.candidates}種類の文字から${options.length}文字`
                  : `${strength.candidates.toLocaleString('ja-JP')}語から${phraseOptions.wordCount}語`}
              </dd>
            </div>
          </dl>
          <p className="hint" style={{ marginBottom: 0 }}>
            1秒あたり1兆回試せる装置で、平均して当たるまでの時間の目安です
            （下の「強さの見方」で計算式を説明しています）。
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="field" style={{ marginTop: 16 }}>
          <span className="field-label">生成した{results.length}件</span>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {results.map((value, index) => (
              <li
                key={`${index}-${value}`}
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <code style={monospace}>{value}</code>
                <button
                  type="button"
                  onClick={() => onCopy(value, index)}
                  style={{
                    ...buttonStyle(),
                    background: copied === index ? '#dcfce7' : 'var(--surface)',
                  }}
                >
                  {copied === index ? 'コピーしました' : 'コピー'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
        <button type="button" onClick={onRegenerate} style={buttonStyle('primary')}>
          作り直す
        </button>
      </div>

      <p className="hint" style={{ marginTop: 12 }}>
        生成はすべてこの端末の中（ブラウザ）で行われ、
        <strong>作った値はどこにも送信されず、保存もされません</strong>。
        ページを閉じると消えるので、使うものは先に保存してください。
      </p>
    </div>
  );
}
