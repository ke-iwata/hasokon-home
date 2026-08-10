'use client';

import { useState } from 'react';
import { evaluateKabe, nextWall, type Position } from '@/lib/nenshu-kabe';

const fmtMan = (yen: number) => {
  const man = yen / 10_000;
  return Number.isInteger(man) ? `${man.toLocaleString('ja-JP')}万円` : `約${Math.round(man).toLocaleString('ja-JP')}万円`;
};

const POSITIONS: { value: Position; label: string }[] = [
  { value: 'spouse', label: '配偶者の扶養内で働いている（パート等）' },
  { value: 'student', label: '親の扶養内・19〜22歳の学生' },
  { value: 'dependent', label: '親の扶養内・その他' },
  { value: 'none', label: '扶養には入っていない' },
];

export default function Calculator() {
  const [incomeMan, setIncomeMan] = useState('120');
  const [position, setPosition] = useState<Position>('spouse');
  const [size51, setSize51] = useState(false);
  const [hours20, setHours20] = useState(false);

  const income = (Number(incomeMan) || 0) * 10_000;
  const results = evaluateKabe({ income, position, size51, hours20 });
  const next = nextWall(results);
  const showShahoInputs = position !== 'none';

  return (
    <div className="card">
      <div style={{ display: 'grid', gap: 14 }}>
        <label>
          年収（額面・万円）
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={incomeMan}
            onChange={(e) => setIncomeMan(e.target.value)}
          />
        </label>
        <label>
          あなたの立場
          <select value={position} onChange={(e) => setPosition(e.target.value as Position)}>
            {POSITIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {showShahoInputs && (
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: '0.9rem' }}>
            <label style={{ fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={size51}
                onChange={(e) => setSize51(e.target.checked)}
                style={{ width: 'auto' }}
              />
              勤務先の従業員が51人以上
            </label>
            <label style={{ fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={hours20}
                onChange={(e) => setHours20(e.target.checked)}
                style={{ width: 'auto' }}
              />
              週20時間以上働いている
            </label>
          </div>
        )}
      </div>

      {next ? (
        <p
          style={{
            margin: '18px 0 4px',
            padding: '10px 14px',
            background: '#eef2ff',
            borderRadius: 10,
            fontSize: '0.95rem',
          }}
        >
          次の壁は <strong style={{ color: 'var(--brand)' }}>{next.label}</strong>
          {next.diff === 0 ? '（ちょうど到達）' : <>（あと <strong>{fmtMan(next.diff)}</strong>）</>}
        </p>
      ) : (
        <p style={{ margin: '18px 0 4px', fontSize: '0.95rem' }}>
          該当するすべての壁を超えています。
        </p>
      )}

      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        {results.map((r) => (
          <div
            key={r.label}
            style={{
              border: '1px solid var(--border)',
              borderLeft: `4px solid ${r.over ? '#f59e0b' : r.impact === 'high' ? 'var(--brand)' : 'var(--border)'}`,
              borderRadius: 10,
              padding: '10px 14px',
              background: '#fff',
              fontSize: '0.9rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
              <strong>
                {r.label}
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: '0.72rem',
                    color: 'var(--muted)',
                    fontWeight: 600,
                    border: '1px solid var(--border)',
                    borderRadius: 999,
                    padding: '1px 8px',
                  }}
                >
                  {r.category}
                </span>
              </strong>
              <span style={{ color: r.over ? '#b45309' : 'var(--muted)' }}>
                {/* 壁ちょうどは「+0万円」「あと0万円」だと不自然なので専用の文言にする */}
                {r.diff === 0
                  ? r.over
                    ? 'ちょうど（超えています）'
                    : 'ちょうど（まだ超えていません）'
                  : r.over
                    ? `超えています（+${fmtMan(r.diff)}）`
                    : `あと${fmtMan(r.diff)}`}
              </span>
            </div>
            <div style={{ color: 'var(--muted)', marginTop: 4, lineHeight: 1.6 }}>{r.effect}</div>
            {r.note && (
              <div style={{ color: 'var(--muted)', marginTop: 4, fontSize: '0.8rem' }}>※ {r.note}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
