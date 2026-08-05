'use client';

import { useEffect, useRef, useState } from 'react';
import {
  autoMoveSpider,
  dealRow,
  dealSpider,
  isMovableRun,
  isSpiderWon,
  moveSpider,
  SPIDER_LEVELS,
  type SpiderLevel,
  type SpiderState,
} from '@/lib/spider';
import { trackToolUse } from '@/lib/analytics';
import { CardView, EmptySlot, stackMargin } from '@/app/_cards/CardView';

/** 選択中の並び（col の idx 以降）。2タップ目で行き先を指定する */
type Selection = { col: number; idx: number } | null;

export default function Game() {
  const [level, setLevel] = useState<SpiderLevel>('one');
  const [state, setState] = useState<SpiderState | null>(null);
  const [sel, setSel] = useState<Selection>(null);
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

  const apply = (next: SpiderState | null): boolean => {
    if (!next) return false;
    setMessage('');
    history.current = [...history.current.slice(-29), state];
    setState(next);
    setSel(null);
    return true;
  };

  const undo = () => {
    const prev = history.current.pop();
    if (prev) {
      setMessage('');
      setState(prev);
      setSel(null);
    }
  };

  const newGame = (l: SpiderLevel) => {
    history.current = [];
    notified.current = false;
    setMessage('');
    setState(dealSpider(l));
    setSel(null);
    trackToolUse('spider', `new-${l}`);
  };

  /** 場札のタップ。idx=-1 は空列 */
  const onTableau = (col: number, idx: number) => {
    const pile = state.tableau[col];
    if (sel) {
      if (sel.col === col && sel.idx === idx) {
        // 同じ札をもう一度: 自動移動
        if (!apply(autoMoveSpider(state, col, idx))) {
          setSel(null);
          setMessage('この並びを置ける場所がありません。');
        }
        return;
      }
      // 選択中 → この列を行き先として移動を試す
      if (apply(moveSpider(state, sel.col, sel.idx, col))) return;
      // 置けなければ選び直し
      if (idx >= 0 && isMovableRun(pile, idx)) {
        setSel({ col, idx });
        setMessage('');
      } else {
        setSel(null);
        setMessage('そこには置けません。1つ大きい数字の札の上に置けます。');
      }
      return;
    }
    if (idx < 0) return;
    if (isMovableRun(pile, idx)) {
      setSel({ col, idx });
      setMessage('');
    } else if (pile[idx]?.faceUp) {
      setMessage('同じスートで小さい順に並んだ札だけまとめて動かせます。');
    }
  };

  const dealsLeft = Math.floor(state.stock.length / 10);
  const isSelected = (col: number, idx: number) => sel !== null && sel.col === col && idx >= sel.idx;

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
          onClick={() => {
            if (!apply(dealRow(state)) && state.stock.length > 0) {
              setMessage('空の列があると配れません。先に埋めてください。');
            }
          }}
          disabled={dealsLeft === 0}
        >
          配る（残り{dealsLeft}回）
        </button>
      </div>

      {/* 高さ固定のヒント行（レイアウトを動かさない） */}
      <p className="status-bar" style={{ minHeight: '1.5em', margin: '2px 0 8px' }}>
        {won ? (
          <span style={{ color: 'var(--ok)', fontWeight: 700 }}>
            🎉 クリア！おめでとうございます（{state.moves}手）
          </span>
        ) : message ? (
          <span style={{ color: 'var(--accent)' }}>{message}</span>
        ) : sel ? (
          '置きたい列をタップ。同じ札をもう一度タップで自動移動。'
        ) : (
          '動かしたい札をタップして選択します。'
        )}
      </p>

      {/* 場札10列 */}
      <div className="tableau cols10">
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

      <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center', marginTop: 12 }}>
        KからAまで同じスートで揃うと自動で回収されます。
      </p>
    </div>
  );
}
