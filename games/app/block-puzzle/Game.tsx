'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyPlacement,
  canPlace,
  canPlaceAnywhere,
  deal,
  HAND_SIZE,
  idx,
  isGameOver,
  newBoard,
  placementCells,
  SIZE,
  type Board,
  type Piece,
} from '@/lib/block-puzzle';
import { trackToolUse } from '@/lib/analytics';

const BEST_KEY = 'block-puzzle:best';

/**
 * ピースの色。盤面に置いたあとも同じ色で残る。
 *
 * 2048 のタイルと同じ考え方で、地の色が明暗どちらでも変わらない固定色にしている
 * （テーマ連動のトークンにすると、明モードで白いブロックが盤面に沈む）。
 */
const COLORS: Record<number, string> = {
  1: '#f97316',
  2: '#0ea5e9',
  3: '#6366f1',
  4: '#22c55e',
  5: '#ef4444',
  6: '#eab308',
  7: '#a855f7',
};

/**
 * ドラッグ中、指の何マスぶん上にピースを出すか。
 *
 * スマホでは指がピースを完全に隠してしまうため、置き先が見えるように持ち上げる
 * （docs/features/game-block-puzzle.md の「ピースの掴みやすさ」）。
 * マウスにはこのずれは要らない。
 */
const TOUCH_LIFT = 1.6;

/** これ以下しか動かなかったら「ドラッグ」ではなく「タップ」として扱う（px） */
const TAP_SLOP = 8;

/** 消えたマスを光らせる時間。CSS の bp-clear アニメーションと揃える */
const FLASH_MS = 260;

interface DragState {
  slot: number;
  pointerId: number;
  /** 指の現在地（ゴーストの表示位置） */
  x: number;
  y: number;
  /** 掴んだ位置からどれだけ動いたか。タップとの切り分けに使う */
  moved: number;
  lift: number;
}

/** 置き先の候補。`valid` が false のときは赤く出して「置けない」と分かるようにする */
interface Preview {
  cells: number[];
  valid: boolean;
}

export default function Game() {
  const [board, setBoard] = useState<Board>(newBoard);
  // 使い切った枠は null にして残す（3つ置き切ったら次の3つを配る）
  const [hand, setHand] = useState<(Piece | null)[]>([]);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [combo, setCombo] = useState(0);
  const [lastCleared, setLastCleared] = useState(0);
  const [flash, setFlash] = useState<number[]>([]);
  /** タップで選んだ枠。スマホでドラッグが難しい人向けの2操作の入口 */
  const [selected, setSelected] = useState<number | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const boardRef = useRef<HTMLDivElement | null>(null);
  const flashTimer = useRef<number | null>(null);

  // 配り札はマウント後に決める（静的書き出し時にサーバーとクライアントで食い違わないように）
  useEffect(() => {
    setHand(deal(Math.random));
    const saved = Number(localStorage.getItem(BEST_KEY) || 0);
    if (saved > 0) setBest(saved);
  }, []);

  useEffect(() => {
    return () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    };
  }, []);

  const reset = () => {
    setBoard(newBoard());
    setHand(deal(Math.random));
    setScore(0);
    setCombo(0);
    setLastCleared(0);
    setFlash([]);
    setSelected(null);
    setDrag(null);
    setPreview(null);
    trackToolUse('block-puzzle', 'new');
  };

  const remaining = hand.filter((p): p is Piece => p !== null);
  const over = hand.length > 0 && isGameOver(board, remaining);

  /**
   * 画面上の座標から置き先の左上マスを求める。
   *
   * ピースの中心を指（カーソル）に合わせ、盤面からはみ出す位置は端に寄せる。
   * 盤面から大きく離れているときは null にして、置く気のない指の動きで
   * 勝手にプレビューが出ないようにする。
   */
  const targetAt = useCallback(
    (clientX: number, clientY: number, piece: Piece, lift: number) => {
      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const cell = rect.width / SIZE;
      const x = clientX - rect.left;
      const y = clientY - rect.top - lift * cell;
      // 盤面の外側1マスぶんまでは「置こうとしている」とみなす（端が狙いにくいため）
      if (x < -cell || x > rect.width + cell) return null;
      if (y < -cell || y > rect.height + cell) return null;
      const col = Math.round(x / cell - piece.width / 2);
      const row = Math.round(y / cell - piece.height / 2);
      return {
        row: Math.min(Math.max(row, 0), SIZE - piece.height),
        col: Math.min(Math.max(col, 0), SIZE - piece.width),
      };
    },
    [],
  );

  /** 1手ぶん進める。置けない位置なら何もしない（false を返す） */
  const drop = useCallback(
    (slot: number, row: number, col: number): boolean => {
      const piece = hand[slot];
      if (!piece || over || !canPlace(board, piece, row, col)) return false;

      const r = applyPlacement(board, piece, row, col, combo);
      setBoard(r.board);
      setCombo(r.combo);
      setLastCleared(r.cleared);

      if (r.cleared > 0) {
        // 消えたマスを一瞬光らせる。盤面はもう空なので、位置だけを覚えておく
        const cells: number[] = [];
        for (const rr of r.clearedRows) for (let c = 0; c < SIZE; c++) cells.push(idx(rr, c));
        for (const cc of r.clearedCols) for (let rr = 0; rr < SIZE; rr++) cells.push(idx(rr, cc));
        setFlash(cells);
        if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
        flashTimer.current = window.setTimeout(() => setFlash([]), FLASH_MS);
      }

      setScore((s) => {
        const next = s + r.gained;
        setBest((b) => {
          if (next <= b) return b;
          localStorage.setItem(BEST_KEY, String(next));
          return next;
        });
        return next;
      });

      // 3つ置き切ったら次の3つを配る
      const nextHand = hand.map((p, i) => (i === slot ? null : p));
      setHand(nextHand.every((p) => p === null) ? deal(Math.random) : nextHand);
      setSelected(null);
      return true;
    },
    [board, combo, hand, over],
  );

  // 終了したときだけ1回送る
  const reportedOver = useRef(false);
  useEffect(() => {
    if (over && !reportedOver.current) {
      reportedOver.current = true;
      trackToolUse('block-puzzle', 'gameover');
    }
    if (!over) reportedOver.current = false;
  }, [over]);

  const onPiecePointerDown = (e: React.PointerEvent, slot: number) => {
    if (over || !hand[slot]) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const lift = e.pointerType === 'mouse' ? 0 : TOUCH_LIFT;
    setDrag({ slot, pointerId: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, lift });
    setPreview(null);
  };

  const onPiecePointerMove = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const moved = drag.moved + Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
    setDrag({ ...drag, x: e.clientX, y: e.clientY, moved });

    const piece = hand[drag.slot];
    if (!piece || moved <= TAP_SLOP) return;
    const at = targetAt(e.clientX, e.clientY, piece, drag.lift);
    setPreview(
      at
        ? { cells: placementCells(piece, at.row, at.col), valid: canPlace(board, piece, at.row, at.col) }
        : null,
    );
  };

  const onPiecePointerUp = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const piece = hand[drag.slot];
    const wasTap = drag.moved <= TAP_SLOP;
    const at = piece && !wasTap ? targetAt(e.clientX, e.clientY, piece, drag.lift) : null;

    setDrag(null);
    setPreview(null);
    if (at) {
      drop(drag.slot, at.row, at.col);
    } else if (wasTap) {
      // 動かさずに離したらタップ。選び直し（もう一度押すと選択解除）
      setSelected((s) => (s === drag.slot ? null : drag.slot));
    }
  };

  /** タップで選んでから盤面をタップしたとき。押したマスを中心にピースを置く */
  const onCellClick = (i: number) => {
    if (selected === null) return;
    const piece = hand[selected];
    if (!piece) return;
    const row = Math.min(Math.max(Math.floor(i / SIZE) - Math.floor((piece.height - 1) / 2), 0), SIZE - piece.height);
    const col = Math.min(Math.max((i % SIZE) - Math.floor((piece.width - 1) / 2), 0), SIZE - piece.width);
    drop(selected, row, col);
  };

  /** 選択中のピースを盤面に重ねて見せる（タップ操作のプレビュー） */
  const onCellEnter = (i: number) => {
    if (selected === null || drag) return;
    const piece = hand[selected];
    if (!piece) return;
    const row = Math.min(Math.max(Math.floor(i / SIZE) - Math.floor((piece.height - 1) / 2), 0), SIZE - piece.height);
    const col = Math.min(Math.max((i % SIZE) - Math.floor((piece.width - 1) / 2), 0), SIZE - piece.width);
    setPreview({ cells: placementCells(piece, row, col), valid: canPlace(board, piece, row, col) });
  };

  const previewCells = new Set(preview?.cells ?? []);
  const flashCells = new Set(flash);
  const dragging = drag !== null && drag.moved > TAP_SLOP ? hand[drag.slot] : null;

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

      {/* 文言の出入りで盤面が動かないよう、常に1行ぶんの高さを取る */}
      <p
        className="hint-row"
        style={{ fontWeight: 700, color: over ? 'var(--danger)' : 'var(--ok)' }}
      >
        {over
          ? `置ける場所がなくなりました。スコア: ${score}`
          : combo >= 2
            ? `🔥 ${combo}連続消し！`
            : lastCleared >= 2
              ? `✨ ${lastCleared}ライン同時消し！`
              : ' '}
      </p>

      <div className="bp-stage">
        <div
          className="bp-board"
          ref={boardRef}
          role="grid"
          aria-label="ブロックパズルの盤面"
          onPointerLeave={() => {
            if (!drag) setPreview(null);
          }}
        >
          {Array.from({ length: SIZE * SIZE }, (_, i) => {
            const value = board[i];
            const inPreview = previewCells.has(i);
            const cls = [
              'bp-cell',
              value !== 0 ? 'filled' : '',
              inPreview ? (preview?.valid ? 'preview' : 'preview-bad') : '',
              flashCells.has(i) ? 'cleared' : '',
            ]
              .filter(Boolean)
              .join(' ');
            const r = Math.floor(i / SIZE);
            const c = i % SIZE;
            return (
              <button
                key={i}
                type="button"
                className={cls}
                style={value !== 0 ? { background: COLORS[value] ?? COLORS[1] } : undefined}
                onClick={() => onCellClick(i)}
                onPointerEnter={() => onCellEnter(i)}
                aria-label={`${r + 1}行${c + 1}列 ${value !== 0 ? 'ブロックあり' : '空き'}`}
                disabled={over}
              />
            );
          })}
        </div>

        {over && (
          <div className="bp-overlay">
            <strong style={{ fontSize: '1.1rem' }}>ゲームオーバー</strong>
            <span>スコア {score}（ベスト {best}）</span>
            <button type="button" className="btn btn-primary" onClick={reset}>
              もう一度
            </button>
          </div>
        )}
      </div>

      {/* 配り札。押しやすいよう、枠は空でも同じ大きさのまま残す */}
      <div className="bp-tray" aria-label="配られたピース">
        {Array.from({ length: HAND_SIZE }, (_, slot) => {
          const piece = hand[slot] ?? null;
          return (
            <div
              key={slot}
              className={`bp-slot ${selected === slot ? 'selected' : ''} ${
                drag?.slot === slot ? 'dragging' : ''
              }`}
            >
              {piece && (
                <button
                  type="button"
                  className="bp-piece"
                  onPointerDown={(e) => onPiecePointerDown(e, slot)}
                  onPointerMove={onPiecePointerMove}
                  onPointerUp={onPiecePointerUp}
                  onPointerCancel={() => {
                    setDrag(null);
                    setPreview(null);
                  }}
                  aria-pressed={selected === slot}
                  aria-label={`${slot + 1}つ目のピース（${piece.cells.length}マス）${
                    canPlaceAnywhere(board, piece) ? '' : '・置ける場所なし'
                  }`}
                  disabled={over}
                >
                  <PieceShape piece={piece} dim={!canPlaceAnywhere(board, piece)} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* ドラッグ中のピース。指の少し上に出して、置き先が指で隠れないようにする */}
      {dragging && drag && (
        <div
          className="bp-ghost"
          style={{
            left: drag.x,
            top: drag.y - drag.lift * (boardRef.current ? boardRef.current.clientWidth / SIZE : 0),
            width: (boardRef.current ? boardRef.current.clientWidth / SIZE : 0) * dragging.width,
            height: (boardRef.current ? boardRef.current.clientWidth / SIZE : 0) * dragging.height,
          }}
          aria-hidden="true"
        >
          <PieceShape piece={dragging} />
        </div>
      )}

      <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>
        ピースを盤面へドラッグすると置けます。ピースを軽くタップして選んでから、置きたい場所をタップしてもかまいません。
      </p>
    </div>
  );
}

/** ピースの形。マス目を敷いて `#` の位置だけ色を塗る */
function PieceShape({ piece, dim = false }: { piece: Piece; dim?: boolean }) {
  const filled = new Set(piece.cells.map(([r, c]) => r * piece.width + c));
  return (
    <div
      className={`bp-shape ${dim ? 'dim' : ''}`}
      // --w / --h から1マスの大きさを決める（計算は globals.css の .bp-shape 側）
      style={
        {
          gridTemplateColumns: `repeat(${piece.width}, 1fr)`,
          gridTemplateRows: `repeat(${piece.height}, 1fr)`,
          '--w': piece.width,
          '--h': piece.height,
        } as React.CSSProperties
      }
    >
      {Array.from({ length: piece.width * piece.height }, (_, i) => (
        <span
          key={i}
          className={filled.has(i) ? 'on' : ''}
          style={filled.has(i) ? { background: COLORS[piece.color] ?? COLORS[1] } : undefined}
        />
      ))}
    </div>
  );
}
