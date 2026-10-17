'use client';

import { useEffect, useRef, useState } from 'react';
import { SUIT_SYMBOL, SUITS } from '@/lib/cards';
import {
  autoMoveFromTableau,
  autoMoveFromWaste,
  deal,
  drawStock,
  isWon,
  tableauToFoundation,
  tableauToTableau,
  wasteToFoundation,
  wasteToTableau,
  type KlondikeState,
} from '@/lib/klondike';
import { trackToolUse } from '@/lib/analytics';
import { CardView, DragGhost, EmptySlot, stackMargin } from '@/app/_cards/CardView';
import { useCardDrag } from '@/app/_cards/useCardDrag';
import { firstMoveAction, type DropTarget, type FirstMoveVia } from '@/lib/card-drag';
import { BestBadge, RecordStrip, useRecords, useStopwatch } from '@/app/_records/Records';
import { formatTime, type Improved } from '@/lib/records';

/**
 * 選択中の札。
 * 1タップ目で選択、2タップ目で行き先を指定する。
 * 同じ札をもう一度タップすると自動でいちばん良い場所へ移動する。
 */
type Selection =
  | { kind: 'waste' }
  | { kind: 'tableau'; col: number; idx: number }
  | null;

/** つかむ元（めくり札の一番上・場札の並び） */
type DragSource = { kind: 'waste' } | { kind: 'tableau'; col: number; cardIndex: number };

/** 落とし先（列7・組札） */
const DROP_TARGETS: DropTarget[] = [
  ...Array.from({ length: 7 }, (_, col): DropTarget => ({ kind: 'tableau', col })),
  { kind: 'foundation' },
];

function canGrab(s: KlondikeState, src: DragSource): boolean {
  if (src.kind === 'waste') return s.waste.length > 0;
  return s.tableau[src.col][src.cardIndex]?.faceUp ?? false;
}

/** ドラッグで置いたときの盤。既存のタップと同じ関数を呼ぶだけ（ルールは lib/klondike.ts） */
function dropMove(s: KlondikeState, src: DragSource, t: DropTarget): KlondikeState | null {
  if (t.kind === 'tableau') {
    return src.kind === 'waste' ? wasteToTableau(s, t.col) : tableauToTableau(s, src, t.col);
  }
  if (t.kind === 'foundation') {
    if (src.kind === 'waste') return wasteToFoundation(s);
    // 組札へは1枚ずつ（列のいちばん下の札だけ）
    return src.cardIndex === s.tableau[src.col].length - 1 ? tableauToFoundation(s, src.col) : null;
  }
  return null;
}

function sourceKey(src: DragSource): string {
  return src.kind === 'waste' ? 'waste' : `tableau:${src.col}:${src.cardIndex}`;
}

export default function Game() {
  const [state, setState] = useState<KlondikeState | null>(null);
  const [sel, setSel] = useState<Selection>(null);
  // もどす用の履歴（直近30手）
  const history = useRef<KlondikeState[]>([]);
  const notified = useRef(false);
  // 記録（docs/features/game-records.md）
  const records = useRecords('solitaire');
  const entry = records.entry();
  const timer = useStopwatch();
  // この配りをプレイ数に数えたか（1手目で数える）
  const counted = useRef(false);
  // 置けない所へ落としたことを、この配りで送ったか（1ゲーム最大1回）
  const missed = useRef(false);
  const [result, setResult] = useState<{ timeMs: number; improved: Improved } | null>(null);

  useEffect(() => {
    setState(deal());
  }, []);

  // つかんで運ぶ（docs/features/card-games-drag-drop.md）
  const drag = useCardDrag<DragSource>({
    targets: DROP_TARGETS,
    canGrab: (src) => (state ? canGrab(state, src) : false),
    canDrop: (src, t) => (state ? dropMove(state, src, t) !== null : false),
    drop: (src, t) => (state ? apply(dropMove(state, src, t), 'drag') : false),
    isHome: (src, t) => src.kind === 'tableau' && t.kind === 'tableau' && t.col === src.col,
    keyOf: sourceKey,
    onGrab: () => setSel(null),
    onMiss: () => {
      if (missed.current) return;
      missed.current = true;
      trackToolUse('solitaire', 'drag-miss');
    },
  });

  const won = state ? isWon(state) : false;
  const moveCount = state?.moves ?? 0;

  // クリアの記録（タイム・手数の保存とGA4への送信）
  useEffect(() => {
    if (!won || notified.current) return;
    notified.current = true;
    trackToolUse('solitaire', 'win');
    const timeMs = timer.stop();
    const { improved } = records.finish({ outcome: 'win', timeMs, moves: moveCount });
    setResult({ timeMs, improved });
  }, [won, moveCount, records, timer]);

  if (!state) return <div className="card">配っています…</div>;

  /** 状態を更新しつつ履歴を残す。null（無効な操作）なら false */
  function apply(next: KlondikeState | null, via: FirstMoveVia = 'tap'): boolean {
    if (!next || !state) return false;
    history.current = [...history.current.slice(-29), state];
    if (!counted.current) {
      counted.current = true;
      records.start();
      trackToolUse('solitaire', firstMoveAction(via));
    }
    timer.begin();
    setState(next);
    setSel(null);
    return true;
  }

  const undo = () => {
    const prev = history.current.pop();
    if (prev) {
      setState(prev);
      setSel(null);
    }
  };

  const newGame = () => {
    history.current = [];
    notified.current = false;
    counted.current = false;
    missed.current = false;
    setState(deal());
    setSel(null);
    setResult(null);
    timer.reset();
    trackToolUse('solitaire', 'new');
  };

  const onStock = () => {
    setSel(null);
    apply(drawStock(state));
  };

  const onWaste = () => {
    if (sel?.kind === 'waste') {
      // 2回目のタップ: 自動でいちばん良い場所へ
      if (!apply(autoMoveFromWaste(state))) setSel(null);
      return;
    }
    if (state.waste.length > 0) setSel({ kind: 'waste' });
  };

  const onFoundation = () => {
    if (!sel) return;
    if (sel.kind === 'waste') {
      apply(wasteToFoundation(state));
    } else if (sel.idx === state.tableau[sel.col].length - 1) {
      apply(tableauToFoundation(state, sel.col));
    }
  };

  /** 場札のタップ。idx=-1 は空列 */
  const onTableau = (col: number, idx: number) => {
    const pile = state.tableau[col];
    if (sel) {
      if (sel.kind === 'tableau' && sel.col === col && sel.idx === idx) {
        // 同じ札をもう一度: 自動移動
        if (!apply(autoMoveFromTableau(state, { col, cardIndex: idx }))) setSel(null);
        return;
      }
      // 選択中 → この列を行き先として移動を試す
      const moved =
        sel.kind === 'waste'
          ? apply(wasteToTableau(state, col))
          : apply(tableauToTableau(state, { col: sel.col, cardIndex: sel.idx }, col));
      if (moved) return;
      // 置けなければ、タップした札を選択し直す
      if (idx >= 0 && pile[idx]?.faceUp) setSel({ kind: 'tableau', col, idx });
      else setSel(null);
      return;
    }
    if (idx >= 0 && pile[idx]?.faceUp) setSel({ kind: 'tableau', col, idx });
  };

  const wasteTop = state.waste[state.waste.length - 1];
  const isSelected = (col: number, idx: number) =>
    sel?.kind === 'tableau' && sel.col === col && idx >= sel.idx;

  // 運んでいる並び（元の位置は半透明で残す）
  const held = drag.drag?.src ?? null;
  const isHeld = (src: DragSource) =>
    held !== null &&
    (held.kind === 'waste'
      ? src.kind === 'waste'
      : src.kind === 'tableau' && src.col === held.col && src.cardIndex >= held.cardIndex);
  const heldCards = !held
    ? []
    : held.kind === 'waste'
      ? state.waste.slice(-1)
      : state.tableau[held.col].slice(held.cardIndex);
  /** 札の状態のクラス（つかめる・運んでいる元・揺れ） */
  const cardClass = (src: DragSource) =>
    [
      canGrab(state, src) ? 'grabbable' : '',
      isHeld(src) ? 'drag-origin' : '',
      drag.isShaking(src) ? 'shake' : '',
    ]
      .filter(Boolean)
      .join(' ');
  const dropClass = (t: DropTarget) => (drag.isDropOk(t) ? 'drop-ok' : '');

  return (
    <div className="card cardgame" {...drag.boardProps}>
      <div className="status-bar">
        <span>
          手数: {state.moves}
          {'　'}⏱ {formatTime(timer.ms)}
        </span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn" onClick={undo} disabled={history.current.length === 0}>
            もどす
          </button>
          <button type="button" className="btn" onClick={newGame}>
            新しいゲーム
          </button>
        </span>
      </div>

      <RecordStrip
        items={[
          ...(entry.bestTimeMs ? [{ label: 'ベスト', value: formatTime(entry.bestTimeMs) }] : []),
          ...(entry.bestMoves ? [{ label: '最少手数', value: `${entry.bestMoves}手` }] : []),
          ...(entry.plays
            ? [{ label: 'クリア', value: `${entry.wins ?? 0} / ${entry.plays}回` }]
            : []),
        ]}
      />

      {/* 文言が切り替わっても盤面が動かないよう、常に2行分の高さ */}
      <p className="hint-row">
        {won ? (
          <span style={{ color: 'var(--ok)', fontWeight: 700 }}>
            🎉 クリア！{state.moves}手・{formatTime(result?.timeMs ?? timer.ms)}
            {result && !result.improved.time && entry.bestTimeMs
              ? `（ベスト ${formatTime(entry.bestTimeMs)}）`
              : ''}
            <BestBadge improved={result?.improved ?? null} />
          </span>
        ) : sel ? (
          '置きたい場所（列・組札）をタップ。同じ札をもう一度タップで自動移動。'
        ) : (
          '動かしたい札をドラッグするか、タップして選択します。'
        )}
      </p>

      {/* 上段: 山札・めくり札・組札4山 */}
      <div className="top-row">
        <div className="piles" style={{ flex: '0 0 auto', width: '28%' }}>
          <div style={{ width: '50%' }}>
            {state.stock.length > 0 ? (
              <CardView card={state.stock[state.stock.length - 1]} onClick={onStock} />
            ) : (
              <EmptySlot label="↻" onClick={onStock} />
            )}
          </div>
          <div style={{ width: '50%' }}>
            {wasteTop ? (
              <CardView
                card={wasteTop}
                selected={sel?.kind === 'waste'}
                onClick={onWaste}
                className={cardClass({ kind: 'waste' })}
                pointer={drag.bind({ kind: 'waste' })}
              />
            ) : (
              <EmptySlot />
            )}
          </div>
        </div>
        <div className="piles" style={{ flex: 1, maxWidth: '56%' }}>
          {SUITS.map((suit) => {
            const pile = state.foundations[suit];
            const top = pile[pile.length - 1];
            return (
              <div key={suit} style={{ width: '25%' }} data-drop="foundation" className={dropClass({ kind: 'foundation' })}>
                {top ? (
                  <CardView card={top} onClick={onFoundation} />
                ) : (
                  <EmptySlot label={SUIT_SYMBOL[suit]} onClick={onFoundation} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 場札7列。タップで選択 → タップで行き先指定 */}
      <div className="tableau cols7">
        {state.tableau.map((pile, col) => (
          <div
            key={col}
            className={`pile${drag.isDropOk({ kind: 'tableau', col }) ? ' drop-ok' : ''}`}
            data-drop={`tableau:${col}`}
          >
            {pile.length === 0 && <EmptySlot onClick={() => onTableau(col, -1)} />}
            {pile.map((c, i) => (
              <CardView
                key={c.id}
                card={c}
                selected={isSelected(col, i)}
                style={stackMargin(i, pile[i - 1]?.faceUp)}
                onClick={() => onTableau(col, i)}
                className={c.faceUp ? cardClass({ kind: 'tableau', col, cardIndex: i }) : ''}
                pointer={c.faceUp ? drag.bind({ kind: 'tableau', col, cardIndex: i }) : undefined}
              />
            ))}
          </div>
        ))}
      </div>

      {drag.drag && (
        <DragGhost
          cards={heldCards}
          left={drag.drag.left}
          top={drag.drag.top}
          width={drag.drag.width}
          ghostRef={drag.ghostRef}
        />
      )}
    </div>
  );
}
