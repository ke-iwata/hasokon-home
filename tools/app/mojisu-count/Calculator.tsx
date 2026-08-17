'use client';

import { useMemo, useState } from 'react';
import {
  countText,
  evaluateTarget,
  manuscriptSheets,
  type TextCount,
} from '@/lib/mojisu-count';
import { trackToolUse } from '@/lib/analytics';

/** 目標判定に使う数え方 */
type CountMode = 'chars' | 'charsNoSpace';

const MODE_LABEL: Record<CountMode, string> = {
  chars: 'スペース・改行を含む',
  charsNoSpace: 'スペース・改行を含まない',
};

/** 入力欄のプレースホルダー。初期値としては入れない（消す手間をかけさせない） */
const PLACEHOLDER = 'ここに文章を貼り付けてください。入力と同時に数えます。';

/** 3桁区切り。桁が多い数（バイト数）でも読めるようにする */
const fmt = (n: number) => n.toLocaleString('ja-JP');

/** 大きく出す数値。文字数の2つはこれで並べる */
function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="metric">
        <span className="value">{fmt(value)}</span>
        <span className="unit">文字</span>
      </div>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>{label}</div>
    </div>
  );
}

/** 内訳の1行 */
function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default function Calculator() {
  const [text, setText] = useState('');
  const [target, setTarget] = useState('');
  const [mode, setMode] = useState<CountMode>('chars');
  const [copied, setCopied] = useState(false);

  // 長文を貼り付けたときに毎回の再描画で数え直さないようにしている
  const count: TextCount = useMemo(() => countText(text), [text]);

  const progress = evaluateTarget(count[mode], Number(target));
  const sheets = manuscriptSheets(count.charsNoBreak);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      trackToolUse('mojisu-count', 'copy');
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // クリップボードが使えない環境（権限拒否・http接続など）では何もしない。
      // 本文は上の入力欄から手で選択してコピーできる
    }
  };

  const onClear = () => {
    setText('');
    setCopied(false);
    trackToolUse('mojisu-count', 'clear');
  };

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="mc-input">数えたい文章</label>
        <textarea
          id="mc-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          spellCheck={false}
          placeholder={PLACEHOLDER}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <button
            type="button"
            onClick={onCopy}
            disabled={text === ''}
            style={{
              padding: '6px 16px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: copied ? '#dcfce7' : 'var(--surface)',
              fontSize: 'var(--fs-sm)',
              fontWeight: 600,
              cursor: text === '' ? 'default' : 'pointer',
              opacity: text === '' ? 0.5 : 1,
            }}
          >
            {copied ? 'コピーしました' : '本文をコピー'}
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={text === ''}
            style={{
              padding: '6px 16px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              fontSize: 'var(--fs-sm)',
              fontWeight: 600,
              cursor: text === '' ? 'default' : 'pointer',
              opacity: text === '' ? 0.5 : 1,
            }}
          >
            クリア
          </button>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          入力した文章はお使いのブラウザ内だけで処理され、サーバーには送信されません。
        </p>
      </div>

      <div className="panel">
        <div
          style={{
            display: 'grid',
            gap: 14,
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          }}
        >
          <Metric value={count.chars} label="スペース・改行を含む" />
          <Metric value={count.charsNoSpace} label="スペース・改行を含まない" />
        </div>
      </div>

      <div className="panel quiet">
        <dl className="kv">
          <Row term="行数">{fmt(count.lines)} 行</Row>
          <Row term="段落数">{fmt(count.paragraphs)} 段落</Row>
          <Row term="全角・半角の内訳">
            全角 {fmt(count.full)} / 半角 {fmt(count.half)}
          </Row>
          <Row term="バイト数（UTF-8）">{fmt(count.bytes)} バイト</Row>
          <Row term="400字詰め原稿用紙">約 {sheets.toFixed(1)} 枚</Row>
        </dl>
        <p className="hint" style={{ marginTop: 10 }}>
          原稿用紙の枚数は「改行を除いた文字数 ÷ 400」の目安です（升目の空きは考えません）。
          全角・半角の内訳も改行を除いた文字が対象です。
        </p>
      </div>

      <div className="field" style={{ marginTop: 20, marginBottom: 0 }}>
        <div className="field-label">目標文字数（レポート・エントリーシート向け）</div>
        <div className="field-row">
          <label>
            目標の文字数
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={100}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              // 入力の1文字ごとに送らないよう、欄を離れたときだけ計測する
              onBlur={() => {
                if (Number(target) > 0) trackToolUse('mojisu-count', 'target');
              }}
              placeholder="例: 2000"
            />
          </label>
          <label>
            判定に使う数え方
            <select value={mode} onChange={(e) => setMode(e.target.value as CountMode)}>
              <option value="chars">{MODE_LABEL.chars}</option>
              <option value="charsNoSpace">{MODE_LABEL.charsNoSpace}</option>
            </select>
          </label>
        </div>

        {progress && (
          <div className="panel">
            <div className="metric">
              <span className="value">{progress.percent.toFixed(1)}</span>
              <span className="unit">%</span>
              <span className="label">
                {progress.reached
                  ? `目標達成（${fmt(progress.over)}文字オーバー）`
                  : `目標まで残り ${fmt(progress.remaining)} 文字`}
              </span>
            </div>
            {/* 達成率のバー。100%を超えても幅は100%で止める */}
            <div
              style={{
                marginTop: 10,
                height: 8,
                borderRadius: 999,
                background: 'var(--surface-2)',
                overflow: 'hidden',
              }}
              role="img"
              aria-label={`達成率 ${progress.percent.toFixed(1)}%`}
            >
              <div
                style={{
                  width: `${Math.min(progress.percent, 100)}%`,
                  height: '100%',
                  background: progress.reached ? 'var(--accent)' : 'var(--accent-strong)',
                  opacity: progress.reached ? 1 : 0.55,
                }}
              />
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              {MODE_LABEL[mode]}文字数（{fmt(progress.count)}文字）で、目標{' '}
              {fmt(progress.target)}文字と比べています。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
