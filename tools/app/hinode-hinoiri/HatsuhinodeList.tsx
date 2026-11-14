'use client';

import { useState } from 'react';
import { trackToolUse } from '@/lib/analytics';
import { formatHm, hatsuhinodeInitialPrefs, hatsuhinodeRanking } from '@/lib/hinode';
import { PREFECTURE_CAPITALS } from '@/lib/prefecture-capitals';

const cell: React.CSSProperties = { whiteSpace: 'nowrap' };

/**
 * 初日の出の47地点の一覧（早い順）。
 *
 * 初期は「早い5・遅い5・選んでいる地点」だけを出し、「47地点をすべて見る」で開く（仕様書「結果」4。
 * 47行で結果を押し下げないため）。閉じている間も行は DOM に残して `hidden` にするので、
 * JS が動かないクローラーにも47地点が読める。3列（順位・地点・時刻）は折り返さない。
 */
export default function HatsuhinodeList({ year, selected }: { year: number; selected: string | null }) {
  const [open, setOpen] = useState(false);
  const rows = hatsuhinodeRanking(PREFECTURE_CAPITALS, year);
  const initial = hatsuhinodeInitialPrefs(rows, selected);
  const first = rows[0];
  const last = rows[rows.length - 1];

  return (
    <div>
      <p style={{ margin: '0 0 8px' }}>
        最も早いのは<strong>{first.place.pref}（{first.place.city}）の{formatHm(first.sunrise)}</strong>、
        最も遅いのは<strong>{last.place.pref}（{last.place.city}）の{formatHm(last.sunrise)}</strong>です。
      </p>
      <table style={{ width: '100%' }}>
        <caption className="hint" style={{ textAlign: 'left', captionSide: 'bottom', paddingTop: 6 }}>
          {year}年1月1日・都道府県庁の位置・海抜0mでの日の出（日本時間）
        </caption>
        <thead>
          <tr>
            <th style={cell}>順位</th>
            <th style={cell}>地点</th>
            <th style={cell}>日の出</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isSelected = r.place.pref === selected;
            // 早い5と遅い5の間（閉じているとき）に「…」の区切りを1行だけ出す
            const gapBefore = !open && i > 0 && !initial.has(rows[i - 1].place.pref) && initial.has(r.place.pref);
            return (
              <tr
                key={r.place.pref}
                hidden={!open && !initial.has(r.place.pref)}
                style={{
                  background: isSelected ? 'var(--accent-soft)' : undefined,
                  fontWeight: isSelected ? 700 : undefined,
                  borderTop: gapBefore ? '3px double var(--border)' : undefined,
                }}
              >
                <td style={cell}>{r.rank}</td>
                <td style={{ ...cell, textAlign: 'left' }}>
                  {r.place.pref}
                  <span className="hint">（{r.place.city}）</span>
                </td>
                <td style={{ ...cell, fontVariantNumeric: 'tabular-nums' }}>{formatHm(r.sunrise)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={{ margin: '8px 0 0' }}>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            if (!open) trackToolUse('hinode-hinoiri', 'hatsuhinode_all');
            setOpen(!open);
          }}
        >
          {open ? '早い5・遅い5地点だけにする' : '47地点をすべて見る'}
        </button>
      </p>
    </div>
  );
}
