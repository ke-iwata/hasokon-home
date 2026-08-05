'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  canMove,
  hasWon,
  newBoard,
  slide,
  spawn,
  type Board2048,
  type Direction,
} from '@/lib/game2048';
import { trackToolUse } from '@/lib/analytics';

/** タイルの背景色。大きくなるほど濃い暖色に */
const TILE_COLORS: Record<number, string> = {
  2: '#eef2ff',
  4: '#e0e7ff',
  8: '#fcd34d',
  16: '#fbbf24',
  32: '#fb923c',
  64: '#f97316',
  128: '#fde047',
  256: '#facc15',
  512: '#eab308',
  1024: '#38bdf8',
  2048: '#22d3ee',
};

const BEST_KEY = 'g2048:best';

export default function Game() {
  const [board, setBoard] = useState<Board2048 | null>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [won, setWon] = useState(false);
  const [wonNotified, setWonNotified] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  // 盤面の生成はマウント後（サーバー描画と食い違わせない）
  useEffect(() => {
    setBoard(newBoard());
    const saved = Number(localStorage.getItem(BEST_KEY) || 0);
    if (saved > 0) setBest(saved);
  }, []);

  const reset = () => {
    setBoard(newBoard());
    setScore(0);
    setWon(false);
    setWonNotified(false);
    trackToolUse('2048', 'new');
  };

  const move = useCallback(
    (dir: Direction) => {
      if (!board) return;
      const r = slide(board, dir);
      if (!r.moved) return;
      const next = spawn(r.board);
      setBoard(next);
      setScore((s) => {
        const ns = s + r.gained;
        setBest((b) => {
          const nb = Math.max(b, ns);
          localStorage.setItem(BEST_KEY, String(nb));
          return nb;
        });
        return ns;
      });
      if (!wonNotified && hasWon(next)) {
        setWon(true);
        setWonNotified(true);
        trackToolUse('2048', 'win');
      }
    },
    [board, wonNotified],
  );

  // キーボード
  useEffect(() => {
    const keys: Record<string, Direction> = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down',
    };
    const onKey = (e: KeyboardEvent) => {
      const dir = keys[e.key];
      if (dir) {
        e.preventDefault();
        move(dir);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move]);

  // スワイプ
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    touchStart.current = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return; // 誤タップは無視
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
    else move(dy > 0 ? 'down' : 'up');
  };

  if (!board) return <div className="card">読み込み中…</div>;

  const over = !canMove(board);

  return (
    <div className="card">
      <div className="status-bar">
        <span>
          スコア: <strong style={{ color: 'var(--text)' }}>{score}</strong>
          {'　'}ベスト: {best}
        </span>
        <button type="button" className="btn" onClick={reset}>
          最初から
        </button>
      </div>

      {won && (
        <p className="status-bar" style={{ color: 'var(--ok)', fontWeight: 700 }}>
          🎉 2048達成！そのまま続けられます。
        </p>
      )}
      {over && (
        <p className="status-bar" style={{ color: 'var(--danger)', fontWeight: 700 }}>
          動かせるマスがなくなりました。スコア: {score}
        </p>
      )}

      <div
        className="g2048-board"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        role="grid"
        aria-label="2048の盤面"
      >
        {board.map((v, i) => (
          <div
            key={i}
            className="g2048-tile"
            style={
              v === 0
                ? undefined
                : {
                    background: TILE_COLORS[v] ?? '#0ea5e9',
                    fontSize: v >= 1024 ? 'clamp(0.8rem, 5vw, 1.3rem)' : undefined,
                  }
            }
          >
            {v || ''}
          </div>
        ))}
      </div>

      <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>
        スワイプまたは矢印キーで操作
      </p>
    </div>
  );
}
