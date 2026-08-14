'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyMove,
  BLACK,
  CELLS,
  chooseMove,
  colOf,
  indexOf,
  initialState,
  isLegalMove,
  LEVELS,
  opponent,
  resign,
  rowOf,
  undoIndex,
  WHITE,
  type GomokuState,
  type Level,
  type Player,
} from '@/lib/gomoku';
import { trackToolUse } from '@/lib/analytics';
import { RecordStrip, useRecords } from '@/app/_records/Records';
import { winRate } from '@/lib/records';

/**
 * 強さと「次の対局の先手」は覚えておく（毎回選び直させない）。
 *
 * リバーシと同じく、これは「設定」であって遊んだ記録ではないので、
 * 記録（docs/features/game-records.md、`lib/records.ts`）には移さずここで持つ。
 */
const LEVEL_KEY = 'gomoku:level';
const FIRST_KEY = 'gomoku:first';

/** 設定の読み書き。ストレージが使えなくても落ちないようにする */
function readSetting(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 覚えられなくても、その対局は普通に遊べる
  }
}

function readLevel(): Level {
  const saved = readSetting(LEVEL_KEY);
  return saved === 'easy' || saved === 'normal' || saved === 'hard' ? saved : 'normal';
}

/** 次の対局で自分が持つ色。先手は1局ごとに入れ替わる（仕様書の先手有利の緩和） */
function readHuman(): Player {
  return readSetting(FIRST_KEY) === 'white' ? WHITE : BLACK;
}

/** CPUが考えているように見せる最短の間（ms）。速すぎると盤面の変化を追えない */
const THINK_DELAY = 320;

/** 星（天元と4つの星）。位置の見当をつけるための目印 */
const STARS = new Set([indexOf(6, 6), indexOf(3, 3), indexOf(3, 9), indexOf(9, 3), indexOf(9, 9)]);

const COLOR_LABEL: Record<'black' | 'white', string> = { black: '黒（先手）', white: '白（後手）' };

export default function Game() {
  const [level, setLevel] = useState<Level>('normal');
  const [human, setHuman] = useState<Player>(BLACK);
  const [history, setHistory] = useState<GomokuState[]>([initialState()]);
  const [thinking, setThinking] = useState(false);
  // 設定を読むまでは対局を始めない（静的書き出し時のサーバー側と食い違わないように）
  const [ready, setReady] = useState(false);
  const ended = useRef(false);
  // 対CPUの戦績。強さごとに分けて持つ（docs/features/game-records.md）
  const records = useRecords('gomoku');
  const entry = records.entry(level);
  // 1局につき1回だけ数える。「待った」で終局をやり直しても二重に数えない
  const recorded = useRef(false);

  const current = history[history.length - 1];
  const humanTurn = !current.finished && current.turn === human;

  /**
   * 新しい対局を始める。**先手は1局ごとに入れ替える。**
   * 五目並べは先手が有利なので、色を選ばせるより交互にするほうが公平になる。
   */
  const start = useCallback((nextLevel: Level, nextHuman: Player) => {
    ended.current = false;
    recorded.current = false;
    setHistory([initialState(BLACK)]);
    setThinking(false);
    setHuman(nextHuman);
    writeSetting(FIRST_KEY, nextHuman === BLACK ? 'black' : 'white');
    trackToolUse('gomoku', `new-${nextLevel}-${nextHuman === BLACK ? 'black' : 'white'}`);
  }, []);

  useEffect(() => {
    setLevel(readLevel());
    setHuman(readHuman());
    setReady(true);
  }, []);

  // CPUの手番。読みは同期処理なので、いったん描画させてから動かす
  useEffect(() => {
    if (!ready || current.finished || current.turn === human) return;
    setThinking(true);
    const timer = window.setTimeout(() => {
      const move = chooseMove(current, level);
      setThinking(false);
      if (move >= 0) setHistory((h) => [...h, applyMove(h[h.length - 1], move)]);
    }, THINK_DELAY);
    return () => {
      window.clearTimeout(timer);
      setThinking(false);
    };
  }, [ready, current, human, level]);

  useEffect(() => {
    if (!current.finished || ended.current) return;
    ended.current = true;
    const outcome =
      current.winner === 0 ? 'draw' : current.winner === human ? 'win' : 'loss';
    trackToolUse('gomoku', `${outcome}-${level}`);
    if (recorded.current) return;
    recorded.current = true;
    records.finish({ outcome }, level);
  }, [current, human, level, records]);

  const place = (sq: number) => {
    if (!humanTurn || !isLegalMove(current, sq)) return;
    setHistory((h) => [...h, applyMove(h[h.length - 1], sq)]);
  };

  const undoTarget = undoIndex(history, human);
  const undo = () => {
    if (undoTarget === null) return;
    ended.current = false;
    setHistory((h) => h.slice(0, undoTarget + 1));
  };

  const changeLevel = (next: Level) => {
    setLevel(next);
    writeSetting(LEVEL_KEY, next);
    // 強さを変えると対局は仕切り直しになるが、**先手は入れ替えない**。
    // 入れ替えると「強さを選び直しただけで後手にされた」ように見える
    start(next, human);
  };

  const winLine = new Set(current.line);

  return (
    <div className="card">
      <div className="btn-row">
        <div className="seg" role="group" aria-label="CPUの強さ">
          {(Object.keys(LEVELS) as Level[]).map((l) => (
            <button
              key={l}
              type="button"
              className={l === level ? 'active' : ''}
              aria-pressed={l === level}
              onClick={() => changeLevel(l)}
            >
              {LEVELS[l].label}
            </button>
          ))}
        </div>
      </div>

      <div className="status-bar">
        <span className="gm-score">
          <span className="gm-chip">
            <span className="gm-stone black" aria-hidden="true" />
            {human === BLACK ? 'あなた' : 'CPU'}
          </span>
          <span className="gm-chip">
            <span className="gm-stone white" aria-hidden="true" />
            {human === WHITE ? 'あなた' : 'CPU'}
          </span>
        </span>
        <span>
          {current.finished
            ? '対局終了'
            : thinking
              ? 'CPUが考えています…'
              : humanTurn
                ? 'あなたの番です'
                : 'CPUの番です'}
        </span>
      </div>

      {/* 戦績は「いま選んでいる強さ」のもの。かんたんとつよいは別物なので分ける */}
      <RecordStrip
        items={
          winRate(entry) === null
            ? []
            : [
                {
                  label: `${LEVELS[level].label}との戦績`,
                  value: `${entry.wins ?? 0}勝 ${entry.losses ?? 0}敗 ${entry.draws ?? 0}分`,
                },
                { label: '勝率', value: `${winRate(entry)}%` },
              ]
        }
      />

      {current.finished && (
        <p
          className="status-bar"
          style={{
            color: current.winner === human ? 'var(--ok)' : 'var(--text)',
            fontWeight: 700,
          }}
        >
          {current.winner === 0
            ? '引き分けです（盤が埋まりました）'
            : current.winner === human
              ? '🎉 あなたの勝ちです'
              : 'あなたの負けです'}
        </p>
      )}

      <div className="gm-board" role="grid" aria-label="五目並べの盤面">
        {Array.from({ length: CELLS }, (_, sq) => {
          const v = current.board[sq];
          const playable = humanTurn && v === 0;
          const cls = [
            'gm-cell',
            STARS.has(sq) ? 'star' : '',
            sq === current.last ? 'last' : '',
            winLine.has(sq) ? 'win' : '',
          ]
            .filter(Boolean)
            .join(' ');
          const what = v === BLACK ? '黒' : v === WHITE ? '白' : '空き';
          return (
            <button
              key={sq}
              type="button"
              className={cls}
              onClick={() => place(sq)}
              disabled={!playable}
              aria-label={`${rowOf(sq) + 1}行${colOf(sq) + 1}列 ${what}`}
            >
              {v !== 0 && (
                <span className={`gm-stone ${v === BLACK ? 'black' : 'white'}`} aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>

      <div className="btn-row" style={{ marginTop: 12, justifyContent: 'center' }}>
        <button type="button" className="btn" onClick={undo} disabled={undoTarget === null}>
          ↩ 待った
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setHistory((h) => [...h, resign(h[h.length - 1], human)]);
          }}
          disabled={current.finished || current.placed === 0}
        >
          投了
        </button>
        <button type="button" className="btn" onClick={() => start(level, opponent(human))}>
          次の対局
        </button>
      </div>

      <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>
        あなたは{human === BLACK ? COLOR_LABEL.black : COLOR_LABEL.white}、CPUは「
        {LEVELS[level].label}」です。<strong>先手は1局ごとに入れ替わります。</strong>
        「待った」は自分が打つ直前まで戻します（あいだのCPUの手も一緒に戻ります）。
        禁じ手（三三など）はありません。
      </p>
    </div>
  );
}
