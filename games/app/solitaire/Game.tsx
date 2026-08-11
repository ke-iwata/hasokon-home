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
import { CardView, EmptySlot, stackMargin } from '@/app/_cards/CardView';

/**
 * 選択中の札。
 * 1タップ目で選択、2タップ目で行き先を指定する。
 * 同じ札をもう一度タップすると自動でいちばん良い場所へ移動する。
 */
type Selection =
  | { kind: 'waste' }
  | { kind: 'tableau'; col: number; idx: number }
  | null;

export default function Game() {
  const [state, setState] = useState<KlondikeState | null>(null);
  const [sel, setSel] = useState<Selection>(null);
  // もどす用の履歴（直近30手）
  const history = useRef<KlondikeState[]>([]);
  const notified = useRef(false);

  useEffect(() => {
    setState(deal());
  }, []);

  if (!state) return <div className="card">配っています…</div>;

  const won = isWon(state);
  if (won && !notified.current) {
    notified.current = true;
    trackToolUse('solitaire', 'win');
  }

  /** 状態を更新しつつ履歴を残す。null（無効な操作）なら false */
  const apply = (next: KlondikeState | null): boolean => {
    if (!next) return false;
    history.current = [...history.current.slice(-29), state];
    setState(next);
    setSel(null);
    return true;
  };

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
    setState(deal());
    setSel(null);
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

  return (
    <div className="card cardgame">
      <div className="status-bar">
        <span>手数: {state.moves}</span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn" onClick={undo} disabled={history.current.length === 0}>
            もどす
          </button>
          <button type="button" className="btn" onClick={newGame}>
            新しいゲーム
          </button>
        </span>
      </div>

      {/* 文言が切り替わっても盤面が動かないよう、常に2行分の高さ */}
      <p className="hint-row">
        {won ? (
          <span style={{ color: 'var(--ok)', fontWeight: 700 }}>
            🎉 クリア！おめでとうございます（{state.moves}手）
          </span>
        ) : sel ? (
          '置きたい場所（列・組札）をタップ。同じ札をもう一度タップで自動移動。'
        ) : (
          '動かしたい札をタップして選択します。'
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
              <CardView card={wasteTop} selected={sel?.kind === 'waste'} onClick={onWaste} />
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
              <div key={suit} style={{ width: '25%' }}>
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
          <div key={col} className="pile">
            {pile.length === 0 && <EmptySlot onClick={() => onTableau(col, -1)} />}
            {pile.map((c, i) => (
              <CardView
                key={c.id}
                card={c}
                selected={isSelected(col, i)}
                style={stackMargin(i, pile[i - 1]?.faceUp)}
                onClick={() => onTableau(col, i)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
