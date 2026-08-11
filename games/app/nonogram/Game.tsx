'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cellsBetween,
  EMPTY,
  emptyBoard,
  FILLED,
  isSolved,
  LEVELS,
  loadPuzzle,
  MARKED,
  nextCell,
  paint,
  pickPuzzle,
  PUZZLES,
  satisfiedLines,
  type Board,
  type Cell,
  type Level,
  type Puzzle,
} from '@/lib/nonogram';
import { trackToolUse } from '@/lib/analytics';

/**
 * 解いた問題のID。
 * ノノグラムは一度解いた問題を解き直す意味がない（絵を覚えてしまう）ので、
 * 解き切るまでは同じ問題に当たらないようにする。
 */
const SOLVED_KEY = 'nonogram:solved';

function readSolved(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SOLVED_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    // 壊れた値が入っていても遊べなくならないように、黙って空扱いにする
    return [];
  }
}

/** 盤面の広さ。1マスが小さくなりすぎないよう、サイズごとに上限を変える */
const MAX_WIDTH: Record<number, number> = { 5: 300, 10: 460, 15: 580 };

/** なぞり塗りの途中経過。基準の盤面を持ち、指を戻せば塗りも戻る */
interface Drag {
  start: number;
  last: number;
  value: Cell;
  base: Board;
}

export default function Game() {
  const [level, setLevel] = useState<Level>('easy');
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [board, setBoard] = useState<Board>([]);
  const [mode, setMode] = useState<'fill' | 'mark'>('fill');
  const [solvedIds, setSolvedIds] = useState<string[]>([]);
  const history = useRef<Board[]>([]);
  const drag = useRef<Drag | null>(null);

  const data = useMemo(() => (puzzle ? loadPuzzle(puzzle) : null), [puzzle]);
  const size = puzzle?.size ?? 0;

  const start = useCallback((next: Level, solved: string[], exclude?: string) => {
    const picked = pickPuzzle(PUZZLES, next, solved, Math.random, exclude);
    if (!picked) return;
    setPuzzle(picked);
    setBoard(emptyBoard(picked.size));
    history.current = [];
    drag.current = null;
    trackToolUse('nonogram', `new-${next}`);
  }, []);

  // 出題はマウント後に選ぶ（静的書き出し時にサーバーとクライアントで食い違わないように）
  useEffect(() => {
    const saved = readSolved();
    setSolvedIds(saved);
    start('easy', saved);
  }, [start]);

  const solved = data !== null && board.length > 0 && isSolved(board, data.solution);

  // クリアの記録。ここで記録した問題は次から出題されない
  useEffect(() => {
    if (!solved || !puzzle || solvedIds.includes(puzzle.id)) return;
    const next = [...solvedIds, puzzle.id];
    setSolvedIds(next);
    localStorage.setItem(SOLVED_KEY, JSON.stringify(next));
    trackToolUse('nonogram', `clear-${puzzle.level}`);
  }, [solved, puzzle, solvedIds]);

  // ドラッグ中に盤面の外で指を離しても、塗りっぱなしにならないようにする
  useEffect(() => {
    const end = () => {
      drag.current = null;
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, []);

  if (!puzzle || !data) return <div className="card">読み込み中…</div>;

  const { hints } = data;
  const done = satisfiedLines(board, hints, size);
  const levelPuzzles = PUZZLES.filter((p) => p.level === level);
  const clearedCount = levelPuzzles.filter((p) => solvedIds.includes(p.id)).length;

  /** 1手ぶん盤面を進める。もどすで戻れるよう、直前の盤面を積んでおく */
  const push = (next: Board) => {
    history.current = [...history.current, board];
    setBoard(next);
  };

  const onPointerDown = (e: React.PointerEvent, i: number) => {
    // 右クリックは onContextMenu 側で×印として扱う
    if (solved || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const value = nextCell(board[i], mode);
    drag.current = { start: i, last: i, value, base: board };
    push(paint(board, [i], value));
  };

  /**
   * なぞった範囲を、最初のマスと同じ状態にそろえる（塗り／消しを途中で反転させない）。
   *
   * タッチでは pointerdown したマスに以降のイベントが集まるため、
   * 指の下のマスは座標から引く。
   */
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const at = document.elementFromPoint(e.clientX, e.clientY);
    const attr = at?.closest('[data-cell]')?.getAttribute('data-cell');
    if (attr === null || attr === undefined) return;
    const index = Number(attr);
    if (index === d.last) return;
    d.last = index;
    setBoard(paint(d.base, cellsBetween(d.start, index, size), d.value));
  };

  const toggleMark = (i: number) => {
    if (solved) return;
    push(paint(board, [i], board[i] === MARKED ? EMPTY : MARKED));
  };

  const undo = () => {
    const prev = history.current.pop();
    if (prev) setBoard(prev);
  };

  const label = (cell: Cell) => (cell === FILLED ? '塗り' : cell === MARKED ? '×' : '未確定');

  return (
    <div className="card">
      <div className="btn-row">
        <div className="seg" role="group" aria-label="難易度">
          {(Object.keys(LEVELS) as Level[]).map((l) => (
            <button
              key={l}
              type="button"
              className={l === level ? 'active' : ''}
              aria-pressed={l === level}
              onClick={() => {
                setLevel(l);
                start(l, solvedIds);
              }}
            >
              {LEVELS[l].label}
            </button>
          ))}
        </div>
        <button type="button" className="btn" onClick={() => start(level, solvedIds, puzzle.id)}>
          次の問題
        </button>
      </div>

      <div className="status-bar">
        <span>
          {LEVELS[level].label}（{size}×{size}）　解いた問題:{' '}
          <strong style={{ color: 'var(--text)' }}>
            {clearedCount}/{levelPuzzles.length}
          </strong>
        </span>
        {/* スマホには右クリックがないので、×印はボタンで切り替える */}
        <button
          type="button"
          className={`btn ${mode === 'mark' ? 'btn-primary' : ''}`}
          onClick={() => setMode((m) => (m === 'fill' ? 'mark' : 'fill'))}
          aria-pressed={mode === 'mark'}
        >
          {mode === 'mark' ? '× 印モードON' : '× 印モードOFF'}
        </button>
      </div>

      {solved && (
        <p className="status-bar" style={{ color: 'var(--ok)', fontWeight: 700 }}>
          🎉 クリア！この絵は「{puzzle.title}」でした。
        </p>
      )}

      <div
        className="ng-board"
        style={{
          gridTemplateColumns: `auto repeat(${size}, 1fr)`,
          maxWidth: MAX_WIDTH[size] ?? 460,
        }}
        role="grid"
        aria-label="ノノグラムの盤面"
        onPointerMove={onPointerMove}
      >
        <div />
        {hints.cols.map((h, c) => (
          <div
            key={`c${c}`}
            className={`ng-hint col ${done.cols[c] ? 'done' : ''}`}
            aria-label={`${c + 1}列目のヒント ${h.join(' ')}`}
          >
            {h.map((n, k) => (
              <span key={k}>{n}</span>
            ))}
          </div>
        ))}

        {hints.rows.map((h, r) => (
          <Fragment key={`r${r}`}>
            <div
              className={`ng-hint row ${done.rows[r] ? 'done' : ''}`}
              aria-label={`${r + 1}行目のヒント ${h.join(' ')}`}
            >
              {h.map((n, k) => (
                <span key={k}>{n}</span>
              ))}
            </div>
            {Array.from({ length: size }, (_, c) => {
              const i = r * size + c;
              const cell = board[i];
              const cls = [
                'ng-cell',
                cell === FILLED ? 'filled' : '',
                c > 0 && c % 5 === 0 ? 'sep-left' : '',
                r > 0 && r % 5 === 0 ? 'sep-top' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <button
                  key={i}
                  type="button"
                  data-cell={i}
                  className={cls}
                  onPointerDown={(e) => onPointerDown(e, i)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    toggleMark(i);
                  }}
                  onKeyDown={(e) => {
                    // キーボード操作。ポインタ操作と二重に効かないよう click は使わない
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    if (!solved) push(paint(board, [i], nextCell(cell, mode)));
                  }}
                  aria-label={`${r + 1}行${c + 1}列 ${label(cell)}`}
                >
                  {cell === MARKED ? '×' : ''}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>

      <div className="btn-row" style={{ marginTop: 12, justifyContent: 'center' }}>
        <button type="button" className="btn" onClick={undo} disabled={history.current.length === 0}>
          ↩ もどす
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            history.current = [];
            setBoard(emptyBoard(size));
          }}
        >
          やり直す
        </button>
      </div>

      <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>
        マスを押すと塗り、なぞると縦か横にまとめて塗れます。塗らないと決めたマスには×印を付けられます（PCは右クリック、スマホは×印モード）。
      </p>
    </div>
  );
}
