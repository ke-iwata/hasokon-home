'use client';

import { useEffect, useRef, useState } from 'react';
import {
  BAND_BOTTOM,
  BAND_HEIGHT,
  BAND_TOP,
  BRACKET_Y,
  bandLayout,
  FONT,
  type TextBox,
} from '@/lib/bmi-band';

/**
 * 判定の帯（BMI 15〜42）。座標は lib/bmi-band.ts が決め、ここは描くだけ。
 *
 * 幅は実際の表示幅を測って viewBox に使う（文字を縮めずに 1:1 で描くため）。
 * 色は区分ごとに変えるが、**区分名を必ず文字で書く**ので色だけには頼らない。
 * 普通体重の区間だけ白地（結果パネルの淡い緑の上で目立つ）、ほかは灰色の地で、赤は使わない（仕様「強い言葉・赤で煽らない」）。
 */
export default function BmiBand({
  bmiTenths,
  target,
  description,
}: {
  bmiTenths: number;
  target: { lowerTenths: number; upperTenths: number; label: string } | null;
  /** 読み上げ用の説明（判定と同じ文を渡す） */
  description: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(280, Math.round(el.clientWidth)));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const L = bandLayout(width, bmiTenths, target);
  const text = (t: TextBox, props: React.SVGProps<SVGTextElement> = {}) => (
    <text x={t.x} y={t.y} textAnchor={t.anchor} fontSize={FONT} {...props}>
      {t.text}
    </text>
  );

  return (
    <div ref={ref} style={{ marginTop: 14 }}>
      <svg
        role="img"
        aria-label={description}
        width="100%"
        height={L.height}
        viewBox={`0 0 ${L.width} ${L.height}`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {L.bracket && (
          <g stroke="var(--muted)" fill="none" strokeWidth={1}>
            <path
              d={`M${L.bracket.x1} ${BRACKET_Y + 4} V${BRACKET_Y} H${L.bracket.x2} V${BRACKET_Y + 4}`}
            />
            {text(L.bracket.label, { fill: 'var(--muted)', stroke: 'none' })}
          </g>
        )}

        {L.segments.map((s) => (
          <rect
            key={s.id}
            x={s.x1}
            y={BAND_TOP}
            width={Math.max(0, s.x2 - s.x1)}
            height={BAND_HEIGHT}
            fill={s.id === 'normal' ? 'var(--surface)' : 'var(--surface-2)'}
            stroke="var(--border)"
          />
        ))}

        {L.segments.map((s) =>
          s.inside ? (
            <g key={s.id}>{text(s.label, { fill: 'var(--text)' })}</g>
          ) : (
            <g key={s.id}>
              {s.leader && (
                <line
                  x1={s.leader.x}
                  x2={s.leader.x}
                  y1={s.leader.y1}
                  y2={s.leader.y2}
                  stroke="var(--muted)"
                  strokeWidth={1}
                />
              )}
              {text(s.label, { fill: 'var(--text)' })}
            </g>
          ),
        )}

        {L.ticks.map((t) => (
          <g key={t.text}>
            <line x1={t.x} x2={t.x} y1={BAND_BOTTOM} y2={BAND_BOTTOM + 3} stroke="var(--muted)" />
            {text(t, { fill: 'var(--muted)', fontSize: FONT - 1 })}
          </g>
        ))}

        <g>
          <line
            x1={L.marker.x}
            x2={L.marker.x}
            y1={BAND_TOP - 2}
            y2={BAND_BOTTOM + 2}
            stroke="var(--text)"
            strokeWidth={3}
          />
          <path
            d={`M${L.marker.x} ${L.marker.label.y - FONT - 8} l-5 7 h10 z`}
            fill="var(--text)"
          />
          {text(L.marker.label, { fill: 'var(--text)', fontWeight: 700 })}
        </g>
      </svg>
    </div>
  );
}
