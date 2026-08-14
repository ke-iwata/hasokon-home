'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyMove,
  BLACK,
  chooseMove,
  initialState,
  leader,
  legalMoves,
  LEVELS,
  score,
  undoIndex,
  WHITE,
  type Level,
  type Player,
  type ReversiState,
} from '@/lib/reversi';
import { trackToolUse } from '@/lib/analytics';
import { RecordStrip, useRecords } from '@/app/_records/Records';
import { winRate } from '@/lib/records';

/**
 * 強さと先手・後手の選択は覚えておく（毎回選び直させない）。
 *
 * これは「設定」であって遊んだ記録ではないので、記録
 * （docs/features/game-records.md、`lib/records.ts`）には移さずここで持つ。
 */
const LEVEL_KEY = 'reversi:level';
const COLOR_KEY = 'reversi:color';

/**
 * 設定の読み書き。記録と同じく、ストレージが使えなくても落ちないようにする
 * （Safari のプライベートブラウズなどでは参照だけで例外が飛ぶ）。
 */
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

function readColor(): Player {
  return readSetting(COLOR_KEY) === 'white' ? WHITE : BLACK;
}

/** CPUが考えているように見せる最短の間（ms）。速すぎると盤面の変化を追えない */
const THINK_DELAY = 420;

const COLOR_LABEL: Record<'black' | 'white', string> = { black: '黒（先手）', white: '白（後手）' };

export default function Game() {
  const [level, setLevel] = useState<Level>('normal');
  const [human, setHuman] = useState<Player>(BLACK);
  const [history, setHistory] = useState<ReversiState[]>([initialState()]);
  const [thinking, setThinking] = useState(false);
  // 設定を読むまでは対局を始めない（静的書き出し時のサーバー側と食い違わないように）
  const [ready, setReady] = useState(false);
  const finished = useRef(false);
  // 対CPUの戦績。強さごとに分けて持つ（docs/features/game-records.md）
  const records = useRecords('reversi');
  const entry = records.entry(level);
  // 1局につき1回だけ数える。「もどす」で終局をやり直しても二重に数えない
  const recorded = useRef(false);

  const current = history[history.length - 1];
  const moves = legalMoves(current.board, current.turn);
  const counts = score(current.board);
  const humanTurn = !current.finished && current.turn === human;

  const start = useCallback((nextLevel: Level, nextHuman: Player) => {
    finished.current = false;
    recorded.current = false;
    setHistory([initialState()]);
    setThinking(false);
    trackToolUse('reversi', `new-${nextLevel}-${nextHuman === BLACK ? 'black' : 'white'}`);
  }, []);

  useEffect(() => {
    const savedLevel = readLevel();
    const savedColor = readColor();
    setLevel(savedLevel);
    setHuman(savedColor);
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
    if (!current.finished || finished.current) return;
    finished.current = true;
    const won = leader(current.board);
    trackToolUse('reversi', won === 0 ? `draw-${level}` : won === human ? `win-${level}` : `lose-${level}`);
    if (recorded.current) return;
    recorded.current = true;
    records.finish({ outcome: won === 0 ? 'draw' : won === human ? 'win' : 'loss' }, level);
  }, [current, human, level, records]);

  const place = (sq: number) => {
    if (!humanTurn || !moves.includes(sq)) return;
    setHistory((h) => [...h, applyMove(h[h.length - 1], sq)]);
  };

  const undoTarget = undoIndex(history, human);
  const undo = () => {
    if (undoTarget === null) return;
    finished.current = false;
    setHistory((h) => h.slice(0, undoTarget + 1));
  };

  const changeLevel = (next: Level) => {
    setLevel(next);
    writeSetting(LEVEL_KEY, next);
    start(next, human);
  };

  const changeColor = (next: Player) => {
    setHuman(next);
    writeSetting(COLOR_KEY, next === BLACK ? 'black' : 'white');
    start(level, next);
  };

  const won = current.finished ? leader(current.board) : 0;
  const humanCount = human === BLACK ? counts.black : counts.white;
  const cpuCount = human === BLACK ? counts.white : counts.black;

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
        <div className="seg" role="group" aria-label="自分の色">
          {([BLACK, WHITE] as Player[]).map((c) => (
            <button
              key={c}
              type="button"
              className={c === human ? 'active' : ''}
              aria-pressed={c === human}
              onClick={() => changeColor(c)}
            >
              {COLOR_LABEL[c === BLACK ? 'black' : 'white']}
            </button>
          ))}
        </div>
      </div>

      <div className="status-bar">
        <span className="rv-score">
          <span className="rv-chip">
            <span className="rv-disc black" aria-hidden="true">
              <span className="face b" />
              <span className="face w" />
            </span>
            {counts.black}
          </span>
          <span className="rv-chip">
            <span className="rv-disc white" aria-hidden="true">
              <span className="face b" />
              <span className="face w" />
            </span>
            {counts.white}
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

      {current.passed && !current.finished && (
        <p className="status-bar" style={{ color: 'var(--muted)' }}>
          {current.turn === human ? 'CPUは打てる場所が無いのでパスしました。' : 'あなたは打てる場所が無いのでパスになりました。'}
        </p>
      )}

      {current.finished && (
        <p className="status-bar" style={{ color: won === human ? 'var(--ok)' : 'var(--text)', fontWeight: 700 }}>
          {won === 0
            ? `引き分け（${counts.black} 対 ${counts.white}）`
            : won === human
              ? `🎉 あなたの勝ちです（${humanCount} 対 ${cpuCount}）`
              : `あなたの負けです（${humanCount} 対 ${cpuCount}）`}
        </p>
      )}

      <div className="rv-board" role="grid" aria-label="リバーシの盤面">
        {Array.from({ length: 64 }, (_, sq) => {
          const v = current.board[sq];
          const playable = humanTurn && moves.includes(sq);
          const cls = [
            'rv-cell',
            playable ? 'playable' : '',
            sq === current.last ? 'last' : '',
          ]
            .filter(Boolean)
            .join(' ');
          const row = Math.floor(sq / 8) + 1;
          const col = (sq % 8) + 1;
          const what = v === BLACK ? '黒' : v === WHITE ? '白' : playable ? '打てます' : '空き';
          return (
            <button
              key={sq}
              type="button"
              className={cls}
              onClick={() => place(sq)}
              disabled={!playable}
              aria-label={`${row}行${col}列 ${what}`}
            >
              {v !== 0 && (
                <span className={`rv-disc ${v === BLACK ? 'black' : 'white'}`} aria-hidden="true">
                  <span className="face b" />
                  <span className="face w" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="btn-row" style={{ marginTop: 12, justifyContent: 'center' }}>
        <button type="button" className="btn" onClick={undo} disabled={undoTarget === null}>
          ↩ もどす
        </button>
        <button type="button" className="btn" onClick={() => start(level, human)}>
          はじめから
        </button>
      </div>

      <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>
        あなたは{human === BLACK ? COLOR_LABEL.black : COLOR_LABEL.white}、CPUは「
        {LEVELS[level].label}」です。打てる場所は盤の上に薄い丸で出ます。
        「もどす」は自分が打つ直前まで戻します（あいだのCPUの手も一緒に戻ります）。
        残り {counts.empty} マス。
      </p>
    </div>
  );
}
