'use client';

import { useState } from 'react';
import { calcWarikan, type KanjiMode } from '@/lib/warikan';

const fmtYen = (yen: number) => `${yen.toLocaleString('ja-JP')}円`;

const UNITS = [1, 10, 100, 500, 1000];

const MODES: { value: KanjiMode; label: string }[] = [
  { value: 'kanji-more', label: '幹事が端数を負担（参加者は切り捨て）' },
  { value: 'kanji-less', label: '幹事が端数を得（参加者は切り上げ）' },
  { value: 'equal', label: '均等（1円単位）' },
];

export default function Calculator() {
  const [totalStr, setTotalStr] = useState('25000');
  const [peopleStr, setPeopleStr] = useState('5');
  const [roundUnit, setRoundUnit] = useState(100);
  const [mode, setMode] = useState<KanjiMode>('kanji-more');

  const total = Math.max(0, Number(totalStr) || 0);
  const people = Math.max(1, Number(peopleStr) || 1);
  const r = calcWarikan({ total, people, roundUnit, mode });

  const participants = people - 1;
  const kanjiIsChange = r.kanji < 0;

  return (
    <div className="card">
      <div style={{ display: 'grid', gap: 14 }}>
        <label>
          合計金額（円）
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            value={totalStr}
            onChange={(e) => setTotalStr(e.target.value)}
          />
        </label>
        <label>
          人数（幹事を含む）
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={peopleStr}
            onChange={(e) => setPeopleStr(e.target.value)}
          />
        </label>
        <label>
          端数の丸め単位
          <select
            value={roundUnit}
            onChange={(e) => setRoundUnit(Number(e.target.value))}
            disabled={mode === 'equal'}
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}円単位
              </option>
            ))}
          </select>
        </label>
        <label>
          幹事の扱い
          <select value={mode} onChange={(e) => setMode(e.target.value as KanjiMode)}>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
        <div
          className="panel" style={{borderLeft: '4px solid var(--brand)'}}
        >
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
            参加者一人あたり{participants > 0 ? `（${participants}人）` : ''}
          </div>
          <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 800 }}>{fmtYen(r.perPerson)}</div>
        </div>
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '12px 16px',
            background: 'var(--surface)',
          }}
        >
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>幹事の支払額</div>
          <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700 }}>
            {kanjiIsChange ? (
              <>
                0円{' '}
                <span style={{ fontSize: 'var(--fs-sm)', color: '#b45309', fontWeight: 600 }}>
                  （集めすぎ: お釣り{fmtYen(-r.kanji)}）
                </span>
              </>
            ) : (
              fmtYen(r.kanji)
            )}
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
          検算: {fmtYen(r.perPerson)} × {participants}人 + 幹事{fmtYen(r.kanji)} ={' '}
          <strong>{fmtYen(r.collected)}</strong>
          {r.collected === total ? '（合計と一致）' : ''}
        </p>
      </div>
    </div>
  );
}
