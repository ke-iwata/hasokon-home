'use client';

import { useState } from 'react';
import { toHebonRomaji, type HebonResult } from '@/lib/hebon-romaji';

export default function Calculator() {
  const [sei, setSei] = useState('さいとう');
  const [mei, setMei] = useState('ゆうこ');

  const seiResult: HebonResult | null = sei.trim() ? toHebonRomaji(sei) : null;
  const meiResult: HebonResult | null = mei.trim() ? toHebonRomaji(mei) : null;

  const hasError = (seiResult && !seiResult.ok) || (meiResult && !meiResult.ok);
  const bothOk = seiResult?.ok && meiResult?.ok;
  const hasOh = Boolean(seiResult?.ohRomaji || meiResult?.ohRomaji);

  const full = bothOk ? `${seiResult.romaji} ${meiResult.romaji}` : '';
  const fullOh = bothOk
    ? `${seiResult.ohRomaji ?? seiResult.romaji} ${meiResult.ohRomaji ?? meiResult.romaji}`
    : '';

  return (
    <div className="card">
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <label>
          姓（ひらがな / カタカナ）
          <input
            type="text"
            value={sei}
            onChange={(e) => setSei(e.target.value)}
            placeholder="さいとう"
          />
        </label>
        <label>
          名（ひらがな / カタカナ）
          <input
            type="text"
            value={mei}
            onChange={(e) => setMei(e.target.value)}
            placeholder="ゆうこ"
          />
        </label>
      </div>

      {hasError && (
        <div
          style={{
            marginTop: 16,
            padding: '10px 14px',
            background: 'var(--danger-soft)',
            border: '1px solid var(--danger)',
            borderRadius: 10,
            fontSize: '0.9rem',
            color: 'var(--danger-fg)',
          }}
        >
          {seiResult && !seiResult.ok && <div>姓: {seiResult.error}</div>}
          {meiResult && !meiResult.ok && <div>名: {meiResult.error}</div>}
        </div>
      )}

      {bothOk && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 600 }}>
            パスポート表記（ヘボン式）
          </div>
          <div
            style={{
              fontSize: '1.9rem',
              fontWeight: 800,
              letterSpacing: '0.04em',
              color: 'var(--accent)',
              margin: '4px 0 0',
            }}
          >
            {full}
          </div>
          {hasOh && (
            <div
              style={{
                marginTop: 12,
                padding: '10px 14px',
                background: 'var(--accent-soft)',
                borderRadius: 10,
                fontSize: '0.9rem',
              }}
            >
              長音Oを含むため、申請時に選べる<strong>OH表記（長音氏名表記）</strong>の場合:{' '}
              <strong style={{ letterSpacing: '0.04em' }}>{fullOh}</strong>
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: '0.82rem', color: 'var(--muted)' }}>
            姓: {seiResult.romaji}
            {seiResult.ohRomaji ? `（OH表記: ${seiResult.ohRomaji}）` : ''} ／ 名: {meiResult.romaji}
            {meiResult.ohRomaji ? `（OH表記: ${meiResult.ohRomaji}）` : ''}
          </div>
        </div>
      )}
    </div>
  );
}
