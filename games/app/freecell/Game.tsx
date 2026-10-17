'use client';

import { useEffect, useRef, useState } from 'react';
import { SUIT_SYMBOL, SUITS } from '@/lib/cards';
import {
  autoMove,
  deal,
  hasAnyMove,
  canPickUp,
  isWon,
  move,
  newSeed,
  type FreecellState,
  type Source,
} from '@/lib/freecell';
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
  | { kind: 'free'; index: number }
  | { kind: 'tableau'; col: number; idx: number }
  | null;

/** 落とし先（列8・フリーセル4・ホームセル） */
const DROP_TARGETS: DropTarget[] = [
  ...Array.from({ length: 8 }, (_, col): DropTarget => ({ kind: 'tableau', col })),
  ...Array.from({ length: 4 }, (_, index): DropTarget => ({ kind: 'free', index })),
  { kind: 'foundation' },
];

function sourceKey(src: Source): string {
  return src.kind === 'free' ? `free:${src.index}` : `tableau:${src.col}:${src.cardIndex}`;
}

/** 選択を、ロジック側の移動元の形に直す */
function toSource(sel: NonNullable<Selection>): Source {
  return sel.kind === 'free'
    ? { kind: 'free', index: sel.index }
    : { kind: 'tableau', col: sel.col, cardIndex: sel.idx };
}

export default function Game() {
  const [state, setState] = useState<FreecellState | null>(null);
  const [sel, setSel] = useState<Selection>(null);
  // もどす用の履歴。フリーセルは1手の重みが大きいので最初まで遡れるようにする
  const history = useRef<FreecellState[]>([]);
  const notified = useRef(false);
  // 記録（docs/features/game-records.md）。旧 `freecell:best`（秒）は自動で移行される
  const records = useRecords('freecell');
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

  // つかんで運ぶ（docs/features/card-games-drag-drop.md）。置けるかは move() が決める
  const drag = useCardDrag<Source>({
    targets: DROP_TARGETS,
    canGrab: (src) => (state ? canPickUp(state, src) : false),
    canDrop: (src, t) => (state ? move(state, src, t) !== null : false),
    drop: (src, t) => (state ? apply(move(state, src, t), 'drag') : false),
    isHome: (src, t) =>
      src.kind === 'free' ? t.kind === 'free' && t.index === src.index : t.kind === 'tableau' && t.col === src.col,
    keyOf: sourceKey,
    onGrab: () => setSel(null),
    onMiss: () => {
      if (missed.current) return;
      missed.current = true;
      trackToolUse('freecell', 'drag-miss');
    },
  });

  const won = state ? isWon(state) : false;
  const moves = state?.moves ?? 0;

  // クリアの記録（タイム・手数の保存とGA4への送信）
  useEffect(() => {
    if (!won || notified.current) return;
    notified.current = true;
    trackToolUse('freecell', 'win');
    const timeMs = timer.stop();
    const { improved } = records.finish({ outcome: 'win', timeMs, moves });
    setResult({ timeMs, improved });
  }, [won, moves, records, timer]);

  if (!state) return <div className="card">配っています…</div>;

  const stuck = !won && !hasAnyMove(state);

  /** 状態を更新しつつ履歴を残す。null（無効な操作）なら false */
  function apply(next: FreecellState | null, via: FirstMoveVia = 'tap'): boolean {
    if (!next || !state) return false;
    history.current = [...history.current, state];
    if (!counted.current) {
      counted.current = true;
      records.start();
      trackToolUse('freecell', firstMoveAction(via));
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

  const start = (seed: number, action: string) => {
    history.current = [];
    notified.current = false;
    counted.current = false;
    missed.current = false;
    setState(deal(seed));
    setSel(null);
    setResult(null);
    timer.reset();
    trackToolUse('freecell', action);
  };

  /** 配り直し。進行中は取り消しの確認を出す */
  const newGame = () => {
    if (!won && state.moves > 0 && !window.confirm('いまのゲームをやめて新しく配り直しますか？')) {
      return;
    }
    start(newSeed(), 'new');
  };

  const replay = () => {
    if (!won && state.moves > 0 && !window.confirm(`同じ配り（No.${state.seed}）で最初からやり直しますか？`)) {
      return;
    }
    start(state.seed, 'replay');
  };

  const onFree = (index: number) => {
    if (sel) {
      if (sel.kind === 'free' && sel.index === index) {
        // 同じ札をもう一度: 自動移動
        if (!apply(autoMove(state, toSource(sel)))) setSel(null);
        return;
      }
      if (apply(move(state, toSource(sel), { kind: 'free', index }))) return;
    }
    setSel(state.free[index] ? { kind: 'free', index } : null);
  };

  const onFoundation = () => {
    if (!sel) return;
    if (!apply(move(state, toSource(sel), { kind: 'foundation' }))) setSel(null);
  };

  /** 場札のタップ。idx=-1 は空列 */
  const onTableau = (col: number, idx: number) => {
    const pile = state.tableau[col];
    if (sel) {
      if (sel.kind === 'tableau' && sel.col === col && sel.idx === idx) {
        if (!apply(autoMove(state, toSource(sel)))) setSel(null);
        return;
      }
      // 選択中 → この列を行き先として移動を試す
      if (apply(move(state, toSource(sel), { kind: 'tableau', col }))) return;
      // 置けなければ、タップした札を選択し直す
      setSel(idx >= 0 && pile[idx] ? { kind: 'tableau', col, idx } : null);
      return;
    }
    if (idx >= 0 && pile[idx]) setSel({ kind: 'tableau', col, idx });
  };

  const isSelected = (col: number, idx: number) =>
    sel?.kind === 'tableau' && sel.col === col && idx >= sel.idx;

  // 運んでいる並び（元の位置は半透明で残す）
  const held = drag.drag?.src ?? null;
  const isHeld = (src: Source) =>
    held !== null &&
    (held.kind === 'free'
      ? src.kind === 'free' && src.index === held.index
      : src.kind === 'tableau' && src.col === held.col && src.cardIndex >= held.cardIndex);
  const heldCards = !held
    ? []
    : held.kind === 'free'
      ? [state.free[held.index]].filter((c) => c !== null)
      : state.tableau[held.col].slice(held.cardIndex);
  /** 札の状態のクラス（つかめる・運んでいる元・揺れ） */
  const cardClass = (src: Source) =>
    [
      canPickUp(state, src) ? 'grabbable' : '',
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
            新しく配る
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
        ) : stuck ? (
          <span style={{ color: 'var(--danger)', fontWeight: 700 }}>
            動かせる手がありません。「もどす」か「新しく配る」でやり直してください。
          </span>
        ) : sel ? (
          '置きたい場所（列・フリーセル・ホームセル）をタップ。同じ札をもう一度タップで自動移動。'
        ) : (
          '動かしたい札をドラッグするか、タップして選択します。'
        )}
      </p>

      {/* 上段: フリーセル4つ・ホームセル4つ */}
      <div className="top-row">
        <div className="piles" style={{ flex: 1 }} aria-label="フリーセル">
          {state.free.map((c, i) => (
            <div key={i} style={{ width: '25%' }} data-drop={`free:${i}`} className={dropClass({ kind: 'free', index: i })}>
              {c ? (
                <CardView
                  card={c}
                  selected={sel?.kind === 'free' && sel.index === i}
                  onClick={() => onFree(i)}
                  className={cardClass({ kind: 'free', index: i })}
                  pointer={drag.bind({ kind: 'free', index: i })}
                />
              ) : (
                <EmptySlot onClick={() => onFree(i)} />
              )}
            </div>
          ))}
        </div>
        <div className="piles" style={{ flex: 1 }} aria-label="ホームセル">
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

      {/* 場札8列。タップで選択 → タップで行き先指定 */}
      <div className="tableau cols8">
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
                className={cardClass({ kind: 'tableau', col, cardIndex: i })}
                pointer={drag.bind({ kind: 'tableau', col, cardIndex: i })}
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

      <div className="status-bar" style={{ marginTop: 10 }}>
        <span>配り番号: No.{state.seed}</span>
        <button type="button" className="btn" onClick={replay}>
          同じ配りをもう一度
        </button>
      </div>
    </div>
  );
}
