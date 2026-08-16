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
import {
  CpuSpeedSeg,
  delayFor,
  readCpuSpeed,
  writeCpuSpeed,
  type CpuSpeed,
} from '@/app/_cpu/CpuSpeed';
import { StartGate } from '@/app/_cpu/StartGate';

/**
 * 強さと先手・後手の選択は覚えておく（毎回選び直させない）。
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

/** 自分が持つ色（先手＝黒／後手＝白）。前回の選択を覚えておく */
function readHuman(): Player {
  return readSetting(FIRST_KEY) === 'white' ? WHITE : BLACK;
}

/** CPUが考えているように見せる最短の間（ms、「ふつう」のとき）。
    速すぎると盤面の変化を追えない。3段階の倍率は app/_cpu/CpuSpeed.tsx が持つ */
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
  /**
   * スタート待ち。ページを開いた・仕切り直した直後は false で、CPUは動かない。
   * 「スタート」を押すか、自分が先に打つと true になる。
   * 後手（白）のとき、開いた瞬間にCPUが打ち始めるのを防ぐ
   */
  const [begun, setBegun] = useState(false);
  /** CPUの速さ。対局の中身は変わらないので、その場で効く（仕切り直さない） */
  const [speed, setSpeed] = useState<CpuSpeed>('normal');
  const ended = useRef(false);
  // 対CPUの戦績。強さごとに分けて持つ（docs/features/game-records.md）
  const records = useRecords('gomoku');
  const entry = records.entry(level);
  // 1局につき1回だけ数える。「待った」で終局をやり直しても二重に数えない
  const recorded = useRef(false);

  const current = history[history.length - 1];
  const humanTurn = !current.finished && current.turn === human;

  /**
   * 新しい対局を始める。
   *
   * 以前は「先手は1局ごとに入れ替える」自動運用だったが、運営者の要望で
   * **先手・後手を自分で選ぶ**形にした（選んだ色は次回のために覚える）。
   */
  const start = useCallback((nextLevel: Level, nextHuman: Player) => {
    ended.current = false;
    recorded.current = false;
    setHistory([initialState(BLACK)]);
    setThinking(false);
    setBegun(false);
    setHuman(nextHuman);
    writeSetting(FIRST_KEY, nextHuman === BLACK ? 'black' : 'white');
    trackToolUse('gomoku', `new-${nextLevel}-${nextHuman === BLACK ? 'black' : 'white'}`);
  }, []);

  useEffect(() => {
    setLevel(readLevel());
    setHuman(readHuman());
    setSpeed(readCpuSpeed('gomoku'));
    setReady(true);
  }, []);

  // CPUの手番。読みは同期処理なので、いったん描画させてから動かす。
  // スタート前（!begun）は動かない
  useEffect(() => {
    if (!ready || !begun || current.finished || current.turn === human) return;
    setThinking(true);
    const timer = window.setTimeout(() => {
      const move = chooseMove(current, level);
      setThinking(false);
      if (move >= 0) setHistory((h) => [...h, applyMove(h[h.length - 1], move)]);
    }, delayFor(THINK_DELAY, speed));
    return () => {
      window.clearTimeout(timer);
      setThinking(false);
    };
  }, [ready, begun, current, human, level, speed]);

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
    // 先手で自分から打ったときは、それをスタートの合図とみなす
    setBegun(true);
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

  /** 先手（黒）・後手（白）の選び直し。対局は仕切り直しになる */
  const changeColor = (next: Player) => {
    start(level, next);
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
        <CpuSpeedSeg
          value={speed}
          onChange={(next) => {
            setSpeed(next);
            writeCpuSpeed('gomoku', next);
          }}
        />

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
            : !begun
              ? 'スタート待ち'
              : thinking
                ? 'CPUが考えています…'
                : humanTurn
                  ? 'あなたの番です'
                  : 'CPUの番です'}
        </span>
      </div>


      {/* 戦績は「いま選んでいる強さ」のもの。かんたんとつよいは別物なので分ける */}
      {/* **1局も終えていなくても出す**（0勝0敗0分）。初戦を終えた瞬間に
          帯が現れると、盤が139px押し下げられる（実測）。空欄を確保するより、
          最初から数字を見せたほうが場所も情報も無駄にならない */}
      <RecordStrip
        items={[
          {
            label: `${LEVELS[level].label}との戦績`,
            value: `${entry.wins ?? 0}勝 ${entry.losses ?? 0}敗 ${entry.draws ?? 0}分`,
          },
          { label: '勝率', value: winRate(entry) === null ? '—' : `${winRate(entry)}%` },
        ]}
      />

      {/* 終局の知らせ。**条件付きで出し入れせず、常に置く**（`.result-row` が
          高さを確保するので、終局した瞬間に盤より下が動かない） */}
      <p
        className="result-row"
        style={{ color: current.winner === human ? 'var(--ok)' : 'var(--text)' }}
        aria-live="polite"
      >
        {!current.finished
          ? ''
          : current.winner === 0
            ? '引き分けです（盤が埋まりました）'
            : current.winner === human
              ? '🎉 あなたの勝ちです'
              : 'あなたの負けです'}
      </p>

      <StartGate show={!begun && !current.finished} onStart={() => setBegun(true)}>
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
      </StartGate>

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
        <button type="button" className="btn" onClick={() => start(level, human)}>
          次の対局
        </button>
      </div>

      <details className="game-tips">
        <summary>この画面の見かた</summary>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>
          あなたは{human === BLACK ? COLOR_LABEL.black : COLOR_LABEL.white}、CPUは「
          {LEVELS[level].label}」です。先手・後手は上の切り替えで選べます。
          「待った」は自分が打つ直前まで戻します（あいだのCPUの手も一緒に戻ります）。
          禁じ手（三三など）はありません。
        </p>
      </details>
    </div>
  );
}
