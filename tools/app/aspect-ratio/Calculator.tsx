'use client';

import { useState } from 'react';
import {
  simplify,
  nearestCommonRatio,
  scaleByWidth,
  scaleByHeight,
} from '@/lib/aspect-ratio';

export default function Calculator() {
  const [width, setWidth] = useState('1920');
  const [height, setHeight] = useState('1080');
  const [scaleMode, setScaleMode] = useState<'width' | 'height'>('width');
  const [scaleValue, setScaleValue] = useState('1280');
  const [copied, setCopied] = useState(false);

  const w = Number(width) || 0;
  const h = Number(height) || 0;

  const ratio = simplify(w, h);
  const nearest = nearestCommonRatio(w, h);
  const cssCode = ratio ? `aspect-ratio: ${ratio.w} / ${ratio.h};` : '';

  const sv = Number(scaleValue) || 0;
  const scaled =
    scaleMode === 'width' ? scaleByWidth(w, h, sv) : scaleByHeight(w, h, sv);

  const copyCss = async () => {
    try {
      await navigator.clipboard.writeText(cssCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* クリップボード非対応環境では何もしない */
    }
  };

  return (
    <div className="card">
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <label>
          幅（px）
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={width}
            onChange={(e) => setWidth(e.target.value)}
          />
        </label>
        <label>
          高さ（px）
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={height}
            onChange={(e) => setHeight(e.target.value)}
          />
        </label>
      </div>

      {ratio && nearest ? (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 600 }}>
            アスペクト比（最簡分数）
          </div>
          <div style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--accent)' }}>
            {ratio.w} : {ratio.h}
          </div>

          <p
            style={{
              margin: '12px 0 0',
              padding: '10px 14px',
              background: 'var(--accent-soft)',
              borderRadius: 10,
              fontSize: '0.95rem',
            }}
          >
            {nearest.exact ? (
              <>
                よく使う比率 <strong>{nearest.label}</strong> にぴったりです。
              </>
            ) : (
              <>
                よく使う比率では <strong>{nearest.label}</strong> に近い比率です（ずれ 約
                {nearest.diffPercent < 0.1 ? '0.1未満' : nearest.diffPercent.toFixed(1)}%）。
              </>
            )}
          </p>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 600 }}>
              CSSコピー用コード
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
              <code
                style={{
                  background: 'var(--code-bg)',
                  color: 'var(--code-fg)',
                  padding: '8px 14px',
                  borderRadius: 8,
                  fontSize: '0.9rem',
                }}
              >
                {cssCode}
              </code>
              <button
                type="button"
                onClick={copyCss}
                style={{
                  padding: '8px 16px',
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
          </div>

          <div
            style={{
              marginTop: 18,
              paddingTop: 16,
              borderTop: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 8 }}>
              この比率のままサイズを変えると？
            </div>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              <label>
                基準にする辺
                <select
                  value={scaleMode}
                  onChange={(e) => setScaleMode(e.target.value as 'width' | 'height')}
                >
                  <option value="width">新しい幅を指定</option>
                  <option value="height">新しい高さを指定</option>
                </select>
              </label>
              <label>
                {scaleMode === 'width' ? '新しい幅（px）' : '新しい高さ（px）'}
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={scaleValue}
                  onChange={(e) => setScaleValue(e.target.value)}
                />
              </label>
            </div>
            {scaled !== null && (
              <p style={{ margin: '10px 0 0', fontSize: '0.95rem' }}>
                {scaleMode === 'width' ? (
                  <>
                    幅 {sv.toLocaleString('ja-JP')}px のとき、高さは{' '}
                    <strong style={{ color: 'var(--accent)', fontSize: '1.1rem' }}>
                      {scaled.toLocaleString('ja-JP')}px
                    </strong>{' '}
                    です（四捨五入）。
                  </>
                ) : (
                  <>
                    高さ {sv.toLocaleString('ja-JP')}px のとき、幅は{' '}
                    <strong style={{ color: 'var(--accent)', fontSize: '1.1rem' }}>
                      {scaled.toLocaleString('ja-JP')}px
                    </strong>{' '}
                    です（四捨五入）。
                  </>
                )}
              </p>
            )}
          </div>
        </div>
      ) : (
        <p style={{ marginTop: 16, fontSize: '0.9rem', color: 'var(--muted)' }}>
          幅・高さに1以上の数値を入力してください。
        </p>
      )}
    </div>
  );
}
