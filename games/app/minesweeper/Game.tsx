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
import { BestBadge, RecordStrip, useRecords, useStopwatch } from '@/app/_records/Records';
import { formatTime, winRate, type Improved } from '@/lib/records';

export default function Game() {
  const [level, setLevel] = useState<MsLevel>('easy');
  const [state, setState] = useState<MsState>(() => emptyState('easy'));
  const [flagMode, setFlagMode] = useState(false);
  const notified = useRef(false);
  // 記録は難易度ごとに分けて持つ（docs/features/game-records.md）
  const records = useRecords('minesweeper');
  const entry = records.entry(level);
  const timer = useStopwatch();
  // この盤面をプレイ数に数えたか（最初にマスを開いたときに数える）
  const counted = useRef(false);
  const [result, setResult] = useState<{ timeMs: number; improved: Improved } | null>(null);

  const newGame = (l: MsLevel) => {
    setState(emptyState(l));
    notified.current = false;
    counted.current = false;
    setResult(null);
    timer.reset();
    trackToolUse('minesweeper', `new-${l}`);
  };

  // 決着したら記録する。勝ったときだけタイムを残す
  useEffect(() => {
    if (state.status === 'playing' || notified.current) return;
    notified.current = true;
    trackToolUse('minesweeper', state.status);
    const timeMs = timer.stop();
    if (state.status === 'won') {
      const { improved } = records.finish({ outcome: 'win', timeMs }, level);
      setResult({ timeMs, improved });
    } else {
      records.finish({ outcome: 'loss' }, level);
    }
  }, [state.status, level, records, timer]);

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
    if (!counted.current) {
      counted.current = true;
      records.start(level);
    }
    timer.begin();
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
          {'　'}⏱ {formatTime(timer.ms)}
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

      {/* 記録は「いま選んでいる難易度」のもの。初級と上級は別物なので分ける */}
      <RecordStrip
        items={[
          ...(entry.bestTimeMs
            ? [{ label: `${MS_LEVELS[level].label}のベスト`, value: formatTime(entry.bestTimeMs) }]
            : []),
          ...(winRate(entry) !== null
            ? [
                {
                  label: '勝率',
                  value: `${winRate(entry)}%（${entry.wins ?? 0}勝${entry.losses ?? 0}敗）`,
                },
              ]
            : []),
        ]}
      />

      {state.status === 'won' && (
        <p className="status-bar" style={{ color: 'var(--ok)', fontWeight: 700 }}>
          🎉 クリア！タイム: {formatTime(result?.timeMs ?? timer.ms)}
          {result && !result.improved.time && entry.bestTimeMs
            ? `（ベスト ${formatTime(entry.bestTimeMs)}）`
            : ''}
          <BestBadge improved={result?.improved ?? null} />
        </p>
      )}
      {state.status === 'lost' && (
        <p className="status-bar" style={{ color: 'var(--danger)', fontWeight: 700 }}>
          💥 地雷を踏みました。「リセット」でもう一度。
        </p>
      )}

      <div
        className="ms-board"
        style={
          {
            // minmax(0, 1fr) にしないと、トラックが min-content より縮まず
            // マスが盤の枠からはみ出す（--ms-cols は文字サイズの計算に使う）
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            maxWidth: cols > 9 ? 560 : 380,
            '--ms-cols': cols,
          } as React.CSSProperties
        }
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
