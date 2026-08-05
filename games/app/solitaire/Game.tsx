'use client';

import { useEffect, useRef, useState } from 'react';
import { SUIT_SYMBOL, SUITS } from '@/lib/cards';
import {
  autoMoveFromTableau,
  autoMoveFromWaste,
  deal,
  drawStock,
  isWon,
  type KlondikeState,
} from '@/lib/klondike';
import { trackToolUse } from '@/lib/analytics';
import { CardView, EmptySlot, stackMargin } from '@/app/_cards/CardView';

export default function Game() {
  const [state, setState] = useState<KlondikeState | null>(null);
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

  /** 状態を更新しつつ履歴を残す。null（無効な操作）は無視 */
  const apply = (next: KlondikeState | null) => {
    if (!next) return;
    history.current = [...history.current.slice(-29), state];
    setState(next);
  };

  const undo = () => {
    const prev = history.current.pop();
    if (prev) setState(prev);
  };

  const newGame = () => {
    history.current = [];
    notified.current = false;
    setState(deal());
    trackToolUse('solitaire', 'new');
  };

  const wasteTop = state.waste[state.waste.length - 1];

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

      {won && (
        <p className="status-bar" style={{ color: 'var(--ok)', fontWeight: 700 }}>
          🎉 クリア！おめでとうございます（{state.moves}手）
        </p>
      )}

      {/* 上段: 山札・めくり札・組札4山 */}
      <div className="top-row">
        <div className="piles" style={{ flex: '0 0 auto', width: '28%' }}>
          <div style={{ width: '50%' }}>
            {state.stock.length > 0 ? (
              <CardView card={state.stock[state.stock.length - 1]} onClick={() => apply(drawStock(state))} />
            ) : (
              <EmptySlot label="↻" onClick={() => apply(drawStock(state))} />
            )}
          </div>
          <div style={{ width: '50%' }}>
            {wasteTop ? (
              <CardView card={wasteTop} onClick={() => apply(autoMoveFromWaste(state))} />
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
                {top ? <CardView card={top} /> : <EmptySlot label={SUIT_SYMBOL[suit]} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* 場札7列。タップで自動移動 */}
      <div className="tableau cols7">
        {state.tableau.map((pile, col) => (
          <div key={col} className="pile">
            {pile.length === 0 && <EmptySlot />}
            {pile.map((c, i) => (
              <CardView
                key={c.id}
                card={c}
                style={stackMargin(i, pile[i - 1]?.faceUp)}
                onClick={
                  c.faceUp
                    ? () => apply(autoMoveFromTableau(state, { col, cardIndex: i }))
                    : undefined
                }
              />
            ))}
          </div>
        ))}
      </div>

      <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center', marginTop: 12 }}>
        札をタップすると自動でいちばん良い場所へ移動します。山札をタップしてめくります。
      </p>
    </div>
  );
}
