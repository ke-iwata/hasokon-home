'use client';

import { useEffect, useRef, useState } from 'react';
import {
  chord,
  emptyState,
  isFresh,
  minesLeft,
  MS_LEVELS,
  placeMines,
  reveal,
  toggleFlag,
  type MsLevel,
  type MsState,
} from '@/lib/minesweeper';
import { trackToolUse } from '@/lib/analytics';

export default function Game() {
  const [level, setLevel] = useState<MsLevel>('easy');
  const [state, setState] = useState<MsState>(() => emptyState('easy'));
  const [flagMode, setFlagMode] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const notified = useRef(false);

  const newGame = (l: MsLevel) => {
    setState(emptyState(l));
    setStartedAt(null);
    setElapsed(0);
    notified.current = false;
    trackToolUse('minesweeper', `new-${l}`);
  };

  // タイマー。ゲーム中だけ進める
  useEffect(() => {
    if (startedAt === null || state.status !== 'playing') return;
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500);
    return () => clearInterval(t);
  }, [startedAt, state.status]);

  useEffect(() => {
    if (state.status !== 'playing' && !notified.current) {
      notified.current = true;
      trackToolUse('minesweeper', state.status);
    }
  }, [state.status]);

  const open = (index: number) => {
    if (state.status !== 'playing') return;
    const cell = state.cells[index];
    if (cell.revealed) {
      // 開いている数字のタップはコード（周囲の一括開放）
      setState((s) => chord(s, index));
      return;
    }
    if (flagMode) {
      setState((s) => toggleFlag(s, index));
      return;
    }
    setState((s) => {
      // 最初のクリック時に地雷を配置する（初手安全のため）
      const placed = isFresh(s) ? placeMines(s, index) : s;
      return reveal(placed, index);
    });
    if (startedAt === null) setStartedAt(Date.now());
  };

  const flag = (index: number) => {
    if (state.status !== 'playing') return;
    setState((s) => toggleFlag(s, index));
  };

  const cols = state.width;

  return (
    <div className="card">
      <div className="btn-row">
        <div className="seg" role="group" aria-label="難易度">
          {(Object.keys(MS_LEVELS) as MsLevel[]).map((l) => (
            <button
              key={l}
              type="button"
              className={l === level ? 'active' : ''}
              aria-pressed={l === level}
              onClick={() => {
                setLevel(l);
                newGame(l);
              }}
            >
              {MS_LEVELS[l].label}
            </button>
          ))}
        </div>
        <button type="button" className="btn" onClick={() => newGame(level)}>
          リセット
        </button>
      </div>

      <div className="status-bar">
        <span>
          💣 残り: <strong style={{ color: 'var(--text)' }}>{minesLeft(state)}</strong>
          {'　'}⏱ {elapsed}秒
        </span>
        {/* スマホには右クリックがないので、旗モードをボタンで切り替える */}
        <button
          type="button"
          className={`btn ${flagMode ? 'btn-primary' : ''}`}
          onClick={() => setFlagMode((f) => !f)}
          aria-pressed={flagMode}
        >
          🚩 旗モード{flagMode ? 'ON' : 'OFF'}
        </button>
      </div>

      {state.status === 'won' && (
        <p className="status-bar" style={{ color: 'var(--ok)', fontWeight: 700 }}>
          🎉 クリア！タイム: {elapsed}秒
        </p>
      )}
      {state.status === 'lost' && (
        <p className="status-bar" style={{ color: 'var(--danger)', fontWeight: 700 }}>
          💥 地雷を踏みました。「リセット」でもう一度。
        </p>
      )}

      <div
        className="ms-board"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, maxWidth: cols > 9 ? 560 : 380 }}
        role="grid"
        aria-label="マインスイーパーの盤面"
      >
        {state.cells.map((cell, i) => {
          let content = '';
          let cls = 'ms-cell';
          if (cell.revealed) {
            cls += ' revealed';
            if (cell.mine) {
              content = '💣';
              if (state.exploded === i) cls += ' exploded';
            } else if (cell.count > 0) {
              content = String(cell.count);
              cls += ` ms-n${cell.count}`;
            }
          } else if (cell.flagged) {
            content = '🚩';
          }
          return (
            <button
              key={i}
              type="button"
              className={cls}
              onClick={() => open(i)}
              onContextMenu={(e) => {
                e.preventDefault(); // PCの右クリックで旗
                flag(i);
              }}
              aria-label={
                cell.revealed ? `開いたマス ${cell.mine ? '地雷' : cell.count}` : '閉じたマス'
              }
            >
              {content}
            </button>
          );
        })}
      </div>

      <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>
        PC: 左クリックで開く / 右クリックで旗。スマホ: 旗モードに切り替えて旗を立てる。
        開いた数字をタップすると、旗が揃っていれば周囲をまとめて開けます。
      </p>
    </div>
  );
}
