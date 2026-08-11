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
/** スライドアニメーションの長さ（CSSの transition と揃える） */
const SLIDE_MS = 130;

/** 画面上のタイル。盤面とは別に、アニメーションのため位置と状態を個別に持つ */
interface Tile {
  id: number;
  value: number;
  /** 盤面上の位置（0〜15） */
  cell: number;
  /** 湧いた直後（出現アニメーション用） */
  isNew?: boolean;
  /** 合体でできた直後（ポップアニメーション用） */
  isMerged?: boolean;
}

let nextId = 1;

/** 盤面からタイル一覧を作る（初期化・リセット用） */
function tilesFrom(board: Board2048): Tile[] {
  return board
    .map((v, cell) => ({ id: nextId++, value: v, cell }))
    .filter((t) => t.value !== 0);
}

export default function Game() {
  const [board, setBoard] = useState<Board2048 | null>(null);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [won, setWon] = useState(false);
  const [wonNotified, setWonNotified] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  // アニメーション中は次の入力を捨てる（連打で状態が壊れるのを防ぐ）
  const animating = useRef(false);
  // 盤面の正本。stateのクロージャ経由だと、連打時に古い盤面で
  // move が走ってタイルが二重に残る競合が起きるため、refを正とする
  const boardRef = useRef<Board2048 | null>(null);

  useEffect(() => {
    const b = newBoard();
    boardRef.current = b;
    setBoard(b);
    setTiles(tilesFrom(b));
    const saved = Number(localStorage.getItem(BEST_KEY) || 0);
    if (saved > 0) setBest(saved);
  }, []);

  const reset = () => {
    const b = newBoard();
    boardRef.current = b;
    setBoard(b);
    setTiles(tilesFrom(b));
    setScore(0);
    setWon(false);
    setWonNotified(false);
    animating.current = false;
    trackToolUse('2048', 'new');
  };

  const move = useCallback(
    (dir: Direction) => {
      const current = boardRef.current;
      if (!current || animating.current) return;
      const r = slide(current, dir);
      if (!r.moved) return;
      animating.current = true;

      // 1. スライド: 各タイルを移動先へ動かす（CSS transition が効く）。
      //    合体で消える側は dying を付けて、移動後に取り除く
      setTiles((ts) =>
        ts.map((t) => {
          const m = r.moves.find((mv) => mv.from === t.cell);
          if (!m) return t;
          return { ...t, cell: m.to, isNew: undefined, isMerged: undefined };
        }),
      );
      // 合体が起きるセルの一覧（タイムアウト後に2枚→1枚へ差し替える）
      const mergeTargets = new Map<number, number[]>();
      for (const m of r.moves) {
        if (m.merged) mergeTargets.set(m.to, [...(mergeTargets.get(m.to) ?? []), m.from]);
      }

      // 2. スライドが終わったら: 合体の後始末 + 新タイルを湧かせる
      window.setTimeout(() => {
        const spawned = spawn(r.board);
        const spawnCell = spawned.findIndex((v, i) => v !== r.board[i]);
        boardRef.current = spawned;

        setTiles((ts) => {
          let out = ts;
          // 合体セルごとに1枚だけ残して値を2倍にし、もう1枚を消す
          for (const [cell] of mergeTargets) {
            const pair = out.filter((t) => t.cell === cell);
            if (pair.length === 2) {
              const [keep, remove] = pair;
              out = out
                .filter((t) => t.id !== remove.id)
                .map((t) =>
                  t.id === keep.id ? { ...t, value: t.value * 2, isMerged: true } : t,
                );
            }
          }
          if (spawnCell !== -1) {
            out = [...out, { id: nextId++, value: spawned[spawnCell], cell: spawnCell, isNew: true }];
          }
          return out;
        });
        setBoard(spawned);
        setScore((s) => {
          const ns = s + r.gained;
          setBest((b) => {
            const nb = Math.max(b, ns);
            localStorage.setItem(BEST_KEY, String(nb));
            return nb;
          });
          return ns;
        });
        if (!wonNotified && hasWon(spawned)) {
          setWon(true);
          setWonNotified(true);
          trackToolUse('2048', 'win');
        }
        animating.current = false;
      }, SLIDE_MS);
    },
    [wonNotified],
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

      {/* 文言の出入りで盤面が動かないよう、常に2行分の高さ */}
      <p
        className="hint-row"
        style={{
          fontWeight: 700,
          color: over ? 'var(--danger)' : 'var(--ok)',
        }}
      >
        {over
          ? `動かせるマスがなくなりました。スコア: ${score}`
          : won
            ? '🎉 2048達成！そのまま続けられます。'
            : ' '}
      </p>

      <div
        className="g2048-board"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        role="grid"
        aria-label="2048の盤面"
      >
        {/* 下敷きの空セル（常に16個で固定） */}
        {Array.from({ length: 16 }, (_, i) => (
          <div
            key={i}
            className="g2048-bg"
            style={{ transform: `translate(${(i % 4) * 100}%, ${Math.floor(i / 4) * 100}%)` }}
          />
        ))}
        {/* タイル層。位置は transform で動かし、transition でスライドさせる */}
        {tiles.map((t) => (
          <div
            key={t.id}
            className={`g2048-tile ${t.isNew ? 'new' : ''} ${t.isMerged ? 'merged' : ''}`}
            style={{
              transform: `translate(${(t.cell % 4) * 100}%, ${Math.floor(t.cell / 4) * 100}%)`,
            }}
          >
            <div className="g2048-face" style={{ background: TILE_COLORS[t.value] ?? '#0ea5e9' }}>
              {t.value}
            </div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>
        スワイプまたは矢印キーで操作
      </p>
    </div>
  );
}
