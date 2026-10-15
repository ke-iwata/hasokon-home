'use client';

/**
 * 将棋盤（9×9）と駒の SVG。詰将棋とはさみ将棋で使い回す。
 *
 * 仕様: docs/features/game-hasami-shogi.md の「実装メモ」（詰将棋の盤を共通部品に切り出してから使う）。
 * 元は `app/tsume-shogi/Game.tsx` の中にあった描画とタップ・キー操作で、**詰将棋の見た目は変えていない**
 * （クラス名は `ts-` のまま。CSS は `app/globals.css` の「詰将棋」の節）。
 *
 * ここは描画と入力だけを持つ。どのマスを選んでいるか・どこへ動けるかは呼ぶ側が決めて渡す。
 * 操作は「マスを押す（`onCell`）」と、キーボードの矢印でカーソルを動かして Enter で押す、の 2 通り。
 */

import { useCallback, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';

export const SHOGI_SIZE = 9;

/** 盤の外の番号のぶん、SVG の座標を広げる（上に筋、右に段） */
const PAD = 0.6;
const FILE_LABELS = '９８７６５４３２１';
const RANK_LABELS = '一二三四五六七八九';

const KEY_DIR: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

export interface ShogiPiece {
  /** 駒の字（歩・と など） */
  char: string;
  /** 相手側の駒として 180 度回して描く */
  flip: boolean;
  /** `ts-piece` に足すクラス（成駒の赤字など） */
  className?: string;
}

export function ShogiBoard({
  cells,
  cellClass,
  dots,
  cursor,
  onCursor,
  onCell,
  onEscape,
  ariaLabel,
  className,
  coords = true,
  children,
}: {
  /** 81 マスぶん。添字は `行 * 9 + 列`（行 0 が上） */
  cells: readonly (ShogiPiece | null)[];
  /** `ts-cell` に足すクラス（selected / target / moved など） */
  cellClass?: (i: number) => string;
  /** 空きマスに点を打つマス（動ける先） */
  dots?: ReadonlySet<number>;
  /** キーボードのカーソルのマス */
  cursor: number;
  onCursor: (i: number) => void;
  onCell: (i: number) => void;
  onEscape?: () => void;
  ariaLabel: string;
  /** `ts-board` に足すクラス */
  className?: string;
  /** 盤の外に筋・段の番号を出す（詰将棋は出す。はさみ将棋は向きを入れ替えるので出さない） */
  coords?: boolean;
  /** 駒の上に重ねる SVG（はさみ将棋の取られた駒の残像など） */
  children?: ReactNode;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pad = coords ? PAD : 0;
  const view = SHOGI_SIZE + pad;
  const size = SHOGI_SIZE;

  const onClick = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * view;
      const y = ((e.clientY - rect.top) / rect.height) * view - pad;
      const c = Math.floor(x);
      const r = Math.floor(y);
      if (r < 0 || c < 0 || r >= size || c >= size) return;
      onCell(r * size + c);
    },
    [onCell, view, pad, size],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<SVGSVGElement>) => {
      const dir = KEY_DIR[e.key];
      if (dir) {
        e.preventDefault();
        const r = Math.min(size - 1, Math.max(0, Math.floor(cursor / size) + dir[0]));
        const c = Math.min(size - 1, Math.max(0, (cursor % size) + dir[1]));
        onCursor(r * size + c);
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onCell(cursor);
        return;
      }
      if (e.key === 'Escape') onEscape?.();
    },
    [cursor, onCell, onCursor, onEscape, size],
  );

  return (
    <svg
      ref={svgRef}
      className={`ts-board${className ? ` ${className}` : ''}`}
      viewBox={`0 0 ${view} ${view}`}
      role="application"
      aria-label={ariaLabel}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {coords
        ? Array.from({ length: size }, (_, c) => (
            <text key={`f${c}`} className="ts-coord" x={c + 0.5} y={PAD * 0.62}>
              {FILE_LABELS[c]}
            </text>
          ))
        : null}
      {coords
        ? Array.from({ length: size }, (_, r) => (
            <text key={`r${r}`} className="ts-coord" x={size + PAD / 2} y={PAD + r + 0.62}>
              {RANK_LABELS[r]}
            </text>
          ))
        : null}
      <rect className="ts-ground" x={0} y={pad} width={size} height={size} />
      {cells.map((s, i) => {
        const x = i % size;
        const y = Math.floor(i / size) + pad;
        const extra = cellClass?.(i);
        return (
          <g key={i}>
            <rect className={extra ? `ts-cell ${extra}` : 'ts-cell'} x={x} y={y} width={1} height={1} />
            {dots?.has(i) && !s ? <circle className="ts-dot" cx={x + 0.5} cy={y + 0.5} r={0.12} /> : null}
            {s ? (
              <text
                className={`ts-piece${s.className ? ` ${s.className}` : ''}`}
                x={x + 0.5}
                y={y + 0.5}
                transform={s.flip ? `rotate(180 ${x + 0.5} ${y + 0.5})` : undefined}
              >
                {s.char}
              </text>
            ) : null}
          </g>
        );
      })}
      {children}
      <rect className="ts-cursor" x={cursor % size} y={Math.floor(cursor / size) + pad} width={1} height={1} />
    </svg>
  );
}
