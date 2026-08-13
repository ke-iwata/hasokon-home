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
import { BestBadge, RecordStrip, useRecords, useStopwatch } from '@/app/_records/Records';
import { formatTime, type Improved } from '@/lib/records';

/** 選択中の並び（col の idx 以降）。2タップ目で行き先を指定する */
type Selection = { col: number; idx: number } | null;

export default function Game() {
  const [level, setLevel] = useState<SpiderLevel>('one');
  const [state, setState] = useState<SpiderState | null>(null);
  const [sel, setSel] = useState<Selection>(null);
  const [message, setMessage] = useState('');
  const history = useRef<SpiderState[]>([]);
  const notified = useRef(false);
  // 記録は難易度（1〜4スート）ごとに分けて持つ（docs/features/game-records.md）
  const records = useRecords('spider');
  const entry = records.entry(level);
  const timer = useStopwatch();
  // この配りをプレイ数に数えたか（1手目で数える）
  const counted = useRef(false);
  const [result, setResult] = useState<{ timeMs: number; improved: Improved } | null>(null);

  useEffect(() => {
    setState(dealSpider('one'));
  }, []);

  const won = state ? isSpiderWon(state) : false;
  const playedLevel = state?.level ?? 'one';
  const moveCount = state?.moves ?? 0;

  // クリアの記録（タイム・手数の保存とGA4への送信）
  useEffect(() => {
    if (!won || notified.current) return;
    notified.current = true;
    trackToolUse('spider', `win-${playedLevel}`);
    const timeMs = timer.stop();
    const { improved } = records.finish(
      { outcome: 'win', timeMs, moves: moveCount },
      playedLevel,
    );
    setResult({ timeMs, improved });
  }, [won, playedLevel, moveCount, records, timer]);

  if (!state) return <div className="card">配っています…</div>;

  const apply = (next: SpiderState | null): boolean => {
    if (!next) return false;
    setMessage('');
    history.current = [...history.current.slice(-29), state];
    if (!counted.current) {
      counted.current = true;
      records.start(state.level);
    }
    timer.begin();
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
    counted.current = false;
    setMessage('');
    setState(dealSpider(l));
    setSel(null);
    setResult(null);
    timer.reset();
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
          {'　'}⏱ {formatTime(timer.ms)}
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

      {/* 記録は「いま選んでいる難易度」のもの。1スートと4スートは別物なので分ける */}
      <RecordStrip
        items={[
          ...(entry.bestTimeMs
            ? [{ label: `${SPIDER_LEVELS[level].label}のベスト`, value: formatTime(entry.bestTimeMs) }]
            : []),
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
