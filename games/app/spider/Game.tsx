'use client';

import { useEffect, useRef, useState } from 'react';
import {
  autoMoveSpider,
  dealRow,
  dealSpider,
  isSpiderWon,
  SPIDER_LEVELS,
  type SpiderLevel,
  type SpiderState,
} from '@/lib/spider';
import { trackToolUse } from '@/lib/analytics';
import { CardView, EmptySlot, stackMargin } from '@/app/_cards/CardView';

export default function Game() {
  const [level, setLevel] = useState<SpiderLevel>('one');
  const [state, setState] = useState<SpiderState | null>(null);
  const [message, setMessage] = useState('');
  const history = useRef<SpiderState[]>([]);
  const notified = useRef(false);

  useEffect(() => {
    setState(dealSpider('one'));
  }, []);

  if (!state) return <div className="card">配っています…</div>;

  const won = isSpiderWon(state);
  if (won && !notified.current) {
    notified.current = true;
    trackToolUse('spider', `win-${state.level}`);
  }

  const apply = (next: SpiderState | null, invalidMessage = '') => {
    if (!next) {
      if (invalidMessage) setMessage(invalidMessage);
      return;
    }
    setMessage('');
    history.current = [...history.current.slice(-29), state];
    setState(next);
  };

  const undo = () => {
    const prev = history.current.pop();
    if (prev) {
      setMessage('');
      setState(prev);
    }
  };

  const newGame = (l: SpiderLevel) => {
    history.current = [];
    notified.current = false;
    setMessage('');
    setState(dealSpider(l));
    trackToolUse('spider', `new-${l}`);
  };

  const dealsLeft = Math.floor(state.stock.length / 10);

  return (
    <div className="card cardgame">
      <div className="btn-row">
        <div className="seg" role="group" aria-label="難易度">
          {(Object.keys(SPIDER_LEVELS) as SpiderLevel[]).map((l) => (
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
              {SPIDER_LEVELS[l].label}
            </button>
          ))}
        </div>
        <button type="button" className="btn" onClick={undo} disabled={history.current.length === 0}>
          もどす
        </button>
        <button type="button" className="btn" onClick={() => newGame(level)}>
          新しいゲーム
        </button>
      </div>

      <div className="status-bar">
        <span>
          完成: <strong style={{ color: 'var(--text)' }}>{state.completed} / 8</strong>
          {'　'}手数: {state.moves}
        </span>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            apply(dealRow(state), dealsLeft === 0 ? '' : '空の列があると配れません。先に埋めてください。')
          }
          disabled={dealsLeft === 0}
        >
          配る（残り{dealsLeft}回）
        </button>
      </div>

      {message && (
        <p className="status-bar" style={{ color: 'var(--accent)' }}>
          {message}
        </p>
      )}
      {won && (
        <p className="status-bar" style={{ color: 'var(--ok)', fontWeight: 700 }}>
          🎉 クリア！おめでとうございます（{state.moves}手）
        </p>
      )}

      {/* 場札10列。タップで自動移動 */}
      <div className="tableau cols10">
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
                    ? () =>
                        apply(
                          autoMoveSpider(state, col, i),
                          '同じスートで小さい順に並んだ札だけ動かせます。'
                        )
                    : undefined
                }
              />
            ))}
          </div>
        ))}
      </div>

      <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center', marginTop: 12 }}>
        札をタップすると自動で置ける場所へ移動します。KからAまで同じスートで揃うと自動で回収されます。
      </p>
    </div>
  );
}
