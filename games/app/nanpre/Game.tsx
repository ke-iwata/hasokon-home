'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DIFFICULTIES,
  findConflicts,
  generatePuzzle,
  isComplete,
  type Board,
  type Difficulty,
  type Puzzle,
} from '@/lib/nanpre';
import { trackToolUse } from '@/lib/analytics';

export default function Game() {
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [board, setBoard] = useState<Board>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [clearTime, setClearTime] = useState<number | null>(null);

  // 生成はマウント後に行う（静的書き出し時にサーバーとクライアントで
  // 盤面が食い違うのを避ける）
  const newGame = useCallback((d: Difficulty) => {
    const p = generatePuzzle(d);
    setPuzzle(p);
    setBoard([...p.puzzle]);
    setSelected(null);
    setClearTime(null);
    setStartedAt(Date.now());
    trackToolUse('nanpre', `new-${d}`);
  }, []);

  useEffect(() => {
    newGame('easy');
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conflicts = new Set(findConflicts(board));
  const done = board.length > 0 && isComplete(board);

  // クリア判定。時間は state に固定して以後動かさない
  useEffect(() => {
    if (done && clearTime === null) {
      setClearTime(Math.round((Date.now() - startedAt) / 1000));
      trackToolUse('nanpre', 'clear');
    }
  }, [done, clearTime, startedAt]);

  const input = useCallback(
    (value: number) => {
      if (selected === null || !puzzle) return;
      if (puzzle.puzzle[selected] !== 0) return; // 出題マスは変更不可
      setBoard((b) => b.map((v, i) => (i === selected ? value : v)));
    },
    [selected, puzzle],
  );

  // キーボード入力（PC向け）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selected === null) return;
      if (e.key >= '1' && e.key <= '9') input(Number(e.key));
      if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') input(0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, input]);

  if (!puzzle) {
    return <div className="card">読み込み中…</div>;
  }

  const selectedValue = selected !== null ? board[selected] : 0;
  const fmt = (sec: number) => `${Math.floor(sec / 60)}分${sec % 60}秒`;

  return (
    <div className="card">
      <div className="btn-row">
        <div className="seg" role="group" aria-label="難易度">
          {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
            <button
              key={d}
              type="button"
              className={d === difficulty ? 'active' : ''}
              aria-pressed={d === difficulty}
              onClick={() => {
                setDifficulty(d);
                newGame(d);
              }}
            >
              {DIFFICULTIES[d].label}
            </button>
          ))}
        </div>
        <button type="button" className="btn" onClick={() => newGame(difficulty)}>
          新しい問題
        </button>
      </div>

      {done ? (
        <p className="status-bar" style={{ color: 'var(--ok)', fontWeight: 700 }}>
          🎉 クリア！{clearTime !== null && ` タイム: ${fmt(clearTime)}`}
        </p>
      ) : (
        <p className="status-bar">
          <span>マスを選んで数字を入力。0または消すで空欄に戻せます。</span>
        </p>
      )}

      <div className="np-board" role="grid" aria-label="ナンプレの盤面">
        {board.map((v, i) => {
          const isGiven = puzzle.puzzle[i] !== 0;
          const cls = [
            'np-cell',
            Math.floor(i / 9) % 3 === 0 && i >= 9 ? 'row-sep' : '',
            isGiven ? 'given' : '',
            selected === i ? 'selected' : '',
            v !== 0 && v === selectedValue && selected !== i ? 'same-number' : '',
            conflicts.has(i) ? 'conflict' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={i}
              type="button"
              className={cls}
              onClick={() => setSelected(i)}
              aria-label={`${Math.floor(i / 9) + 1}行${(i % 9) + 1}列 ${v || '空欄'}`}
            >
              {v !== 0 ? v : ''}
            </button>
          );
        })}
      </div>

      <div className="np-pad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button key={n} type="button" onClick={() => input(n)}>
            {n}
          </button>
        ))}
        <button type="button" onClick={() => input(0)} aria-label="消す">
          ⌫
        </button>
      </div>
    </div>
  );
}
