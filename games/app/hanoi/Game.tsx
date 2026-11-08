'use client';

/**
 * ハノイの塔の画面。
 *
 * 仕様: docs/features/game-hanoi-no-to.md
 *
 * 局面・合法手・ヒント（最短の次の1手）・最短手順はすべて `lib/hanoi.ts`（純関数）が持つ。
 * ここは**入力（タップ2回・ドラッグ・キーボード）と描画、自動再生の間（0.4秒）だけ**を持つ。
 * 持ち上げ表示・ヒントの光り・置けない柱の赤い縁取りは演出なので、`lib/` の状態に入れない
 * （games/CLAUDE.md の画面の約束9）。
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react';
import {
  clearResult,
  DEFAULT_DISCS,
  DISC_COUNTS,
  initialPegs,
  isPerfect,
  isSolved,
  MAX_DISCS,
  minMoves,
  movesOf,
  nextOptimalMove,
  optimalSolution,
  PEG_NAMES,
  pegFromKey,
  PEGS,
  play,
  recordVariant,
  startGame,
  tap,
  undo,
  applyMove,
  type Move,
  type Peg,
  type Pegs,
  type PlayState,
} from '@/lib/hanoi';
import { trackToolUse } from '@/lib/analytics';
import { BestBadge, RecordStrip, useRecords, useStopwatch } from '@/app/_records/Records';
import { formatTime, type Improved } from '@/lib/records';

/** 自動再生の1手の間（ms） */
const REPLAY_STEP_MS = 400;
/** 最後まで再生したあと、完成の形を見せておく間（ms） */
const REPLAY_END_MS = 1200;
/** 置けない柱を赤く縁取る間（ms） */
const REJECT_MS = 500;

/**
 * 円盤の幅（柱の列に対する %）。いちばん小さい 1 が 25%、8 が 90%（柱の間隔の 90%）。
 * 枚数を変えても同じ大きさの円盤は同じ幅にする（色だけでなく幅で必ず区別できる）
 */
function discWidth(disc: number): string {
  return `${25 + ((disc - 1) * 65) / (MAX_DISCS - 1)}%`;
}

interface Replay {
  /** 最短手順 */
  solution: readonly Move[];
  /** 何手目まで打ったか */
  step: number;
  pegs: Pegs;
  /** 自動で進めているか（false は一時停止） */
  playing: boolean;
}

export default function Game() {
  const [state, setState] = useState<PlayState>(() => startGame(DEFAULT_DISCS));
  const [selected, setSelected] = useState<Peg | null>(null);
  const [rejected, setRejected] = useState<Peg | null>(null);
  const [hint, setHint] = useState<Move | null>(null);
  const [replay, setReplay] = useState<Replay | null>(null);
  const [result, setResult] = useState<{
    moves: number;
    timeMs: number;
    improved: Improved;
    assisted: boolean;
  } | null>(null);

  const n = state.n;
  const records = useRecords('hanoi');
  const entry = records.entry(recordVariant(n));
  const timer = useStopwatch();

  /** 1手目を指したか（プレイ数は「1手でも動かしたゲーム」だけ数える） */
  const counted = useRef(false);
  /** クリアを二重に記録しないための目印 */
  const notified = useRef(false);
  /** この回でヒントを使ったか（使った回は最少手数・最短時間を更新しない） */
  const hinted = useRef(false);
  /** 自動再生を見たあとの1回か（その回も最少手数・最短時間を更新しない） */
  const afterReplay = useRef(false);
  /** ドラッグで持ち上げた柱（指を離した柱へ置く） */
  const dragFrom = useRef<Peg | null>(null);
  const rejectTimer = useRef<number | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);

  const cleared = result !== null;
  const replaying = replay !== null;

  /** 同じ枚数か別の枚数で、最初の局面から遊び直す */
  const reset = useCallback(
    (discs: number) => {
      setState(startGame(discs));
      setSelected(null);
      setHint(null);
      setResult(null);
      timer.reset();
      counted.current = false;
      notified.current = false;
      hinted.current = false;
    },
    [timer],
  );

  // 完成の判定。時間は止めた瞬間の値で固定する
  useEffect(() => {
    if (replaying || notified.current || !isSolved(state.pegs)) return;
    notified.current = true;
    const timeMs = timer.stop();
    const moves = movesOf(state);
    const assisted = hinted.current || afterReplay.current;
    afterReplay.current = false;
    trackToolUse('hanoi', `clear-${state.n}`);
    const { improved } = records.finish(
      clearResult({ moves, timeMs, assisted }),
      recordVariant(state.n),
    );
    setResult({ moves, timeMs, improved, assisted });
    setSelected(null);
    setHint(null);
  }, [state, replaying, records, timer]);

  /** 1手打つ。置けない手では何も変わらない */
  const move = useCallback(
    (from: Peg, to: Peg) => {
      const next = play(state, from, to);
      if (next === state) return;
      if (!counted.current) {
        counted.current = true;
        records.start(recordVariant(state.n));
        trackToolUse('hanoi', `start-${state.n}`);
      }
      timer.begin();
      setHint(null);
      setState(next);
    },
    [state, records, timer],
  );

  const flashReject = useCallback((peg: Peg) => {
    setRejected(peg);
    if (rejectTimer.current !== null) window.clearTimeout(rejectTimer.current);
    rejectTimer.current = window.setTimeout(() => setRejected(null), REJECT_MS);
  }, []);

  useEffect(
    () => () => {
      if (rejectTimer.current !== null) window.clearTimeout(rejectTimer.current);
    },
    [],
  );

  /** 柱を押した（タップ・キーボードの 1/2/3 共通） */
  const press = useCallback(
    (peg: Peg, current: Peg | null = selected) => {
      if (cleared || replaying) return;
      const r = tap(state.pegs, current, peg);
      setSelected(r.selected);
      if (r.move) move(r.move.from, r.move.to);
      if (r.rejected !== null) flashReject(r.rejected);
    },
    [cleared, replaying, state.pegs, selected, move, flashReject],
  );

  const undoOne = useCallback(() => {
    if (cleared || replaying) return;
    setState(undo);
    setSelected(null);
    setHint(null);
  }, [cleared, replaying]);

  /** 指を置いた柱。何も持っていなければ持ち上げ、持っていれば置く（タップ2回の2回目） */
  const onColumnPointerDown = (e: PointerEvent<HTMLButtonElement>, peg: Peg) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const picking = selected === null;
    press(peg);
    dragFrom.current = picking && state.pegs[peg].length > 0 && !cleared && !replaying ? peg : null;
  };

  /**
   * 指を離した柱。持ち上げた柱と違う柱で離したらドラッグとして置く。
   * タッチではポインタが押した要素に捕まるので、離した位置は盤の横の位置から割り出す
   */
  const onBoardPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const from = dragFrom.current;
    dragFrom.current = null;
    const board = boardRef.current;
    if (from === null || board === null) return;
    const rect = board.getBoundingClientRect();
    const col = Math.floor(((e.clientX - rect.left) / rect.width) * 3);
    if (col < 0 || col > 2 || col === from) return;
    press(col as Peg, from);
  };

  /**
   * キーボードの受け口が呼ぶ最新の `press` / `undoOne`。
   * 受け口を `useEffect` で付け直すだけだと、続けて押したキーが付け直しの前に届き、
   * 古い局面のまま処理されて手が消える（実測）。描画の確定と同時に差し替える
   */
  const keyActions = useRef({ press, undoOne });
  useLayoutEffect(() => {
    keyActions.current = { press, undoOne };
  }, [press, undoOne]);

  // キーボード：1・2・3 で柱を選ぶ（取る→置く）、Z で1手戻す
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const peg = pegFromKey(e.key);
      if (peg !== null) {
        e.preventDefault();
        keyActions.current.press(peg);
        return;
      }
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        keyActions.current.undoOne();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const showHint = () => {
    if (cleared || replaying) return;
    const m = nextOptimalMove(state.pegs);
    if (m === null) return;
    hinted.current = true;
    setSelected(null);
    setRejected(null);
    setHint(m);
    trackToolUse('hanoi', 'hint');
  };

  // ---- 自動再生 ----

  const startReplay = () => {
    if (movesOf(state) > 0 && !cleared) {
      const ok = window.confirm('いまの局面を捨てて、最初から手順を見ますか？');
      if (!ok) return;
    }
    // 途中の局面は取っておかない
    reset(n);
    setReplay({ solution: optimalSolution(n), step: 0, pegs: initialPegs(n), playing: true });
    trackToolUse('hanoi', `replay-${n}`);
  };

  /** 再生を終える。最初の局面に戻して遊び直せる状態にする（「最初から」と同じ） */
  const stopReplay = useCallback(() => {
    setReplay(null);
    afterReplay.current = true;
    reset(n);
  }, [n, reset]);

  const stepReplay = (r: Replay): Replay => {
    if (r.step >= r.solution.length) return r;
    const m = r.solution[r.step];
    const pegs = applyMove(r.pegs, m.from, m.to) ?? r.pegs;
    return { ...r, pegs, step: r.step + 1 };
  };

  useEffect(() => {
    if (replay === null) return;
    if (replay.step >= replay.solution.length) {
      const t = window.setTimeout(stopReplay, REPLAY_END_MS);
      return () => window.clearTimeout(t);
    }
    if (!replay.playing) return;
    const t = window.setTimeout(() => setReplay((r) => (r ? stepReplay(r) : r)), REPLAY_STEP_MS);
    return () => window.clearTimeout(t);
  }, [replay, stopReplay]);

  const pegs = replay ? replay.pegs : state.pegs;
  const best = entry.bestMoves;

  let message: ReactNode = <span>&nbsp;</span>;
  if (replay) {
    message = (
      <span>
        自動再生 {replay.step} / {replay.solution.length}手
        {replay.step >= replay.solution.length ? '（最初の局面に戻します）' : ''}
      </span>
    );
  } else if (result) {
    const extra = result.moves - minMoves(n);
    message = (
      <span style={{ color: 'var(--ok)' }}>
        🎉 完成！{result.moves}手
        {extra === 0 ? (
          <span className="hno-perfect">最少手数！</span>
        ) : (
          `（最少より${extra}手多い）`
        )}
        {result.assisted ? '（記録は回数だけ）' : ''}
        <BestBadge improved={result.improved} />
      </span>
    );
  } else if (rejected !== null) {
    message = <span style={{ color: 'var(--danger)' }}>小さい円盤の上に大きい円盤は置けません</span>;
  } else if (hint) {
    message = (
      <span>
        ヒント：{PEG_NAMES[hint.from]}の柱のいちばん上を、{PEG_NAMES[hint.to]}の柱へ
      </span>
    );
  } else if (selected !== null) {
    message = <span>置く柱をタップ（同じ柱でやめる）</span>;
  }

  return (
    <div className="card hno-game">
      <div className="seg hno-counts" role="group" aria-label="円盤の枚数">
        {DISC_COUNTS.map((count) => (
          <button
            key={count}
            type="button"
            className={count === n ? 'active' : ''}
            aria-pressed={count === n}
            onClick={() => {
              setReplay(null);
              afterReplay.current = false;
              reset(count);
            }}
          >
            {count}枚
          </button>
        ))}
      </div>

      <RecordStrip
        items={[
          ...(entry.wins ? [{ label: 'クリア', value: `${entry.wins}回` }] : []),
          ...(best
            ? [{ label: '最少手数', value: isPerfect(n, best) ? `${best}手（最少手数！）` : `${best}手` }]
            : []),
          ...(entry.bestTimeMs ? [{ label: 'ベストタイム', value: formatTime(entry.bestTimeMs) }] : []),
        ]}
      />

      <p className="status-bar hno-status">
        <span>
          {replay ? replay.step : movesOf(state)}手 ／ 最少 {minMoves(n)}手
        </span>
        <span>⏱ {formatTime(result?.timeMs ?? timer.ms)}</span>
      </p>

      <div
        ref={boardRef}
        className={`hno-board${replaying ? ' replaying' : ''}`}
        role="group"
        aria-label="ハノイの塔の盤（柱を押して円盤を取り、置く柱を押す）"
        onPointerUp={onBoardPointerUp}
        onPointerCancel={() => {
          dragFrom.current = null;
        }}
      >
        {PEGS.map((peg) => {
          const stack = pegs[peg];
          const lifted = selected === peg && !replaying ? stack[stack.length - 1] : null;
          const resting = lifted === null ? stack : stack.slice(0, -1);
          const cls = [
            'hno-col',
            selected === peg ? 'selected' : '',
            rejected === peg ? 'rejected' : '',
            hint?.from === peg ? 'hint-from' : '',
            hint?.to === peg ? 'hint-to' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={peg}
              type="button"
              className={cls}
              aria-pressed={selected === peg}
              aria-label={`${PEG_NAMES[peg]}の柱（${peg + 1}）、${
                stack.length === 0 ? '空' : `${stack.length}枚、いちばん上は${stack[stack.length - 1]}`
              }`}
              onPointerDown={(e) => onColumnPointerDown(e, peg)}
              onClick={(e) => {
                // ポインタの操作は pointerdown で済ませている。ここはキーボード（Enter・Space）だけ
                if (e.detail === 0) press(peg);
              }}
            >
              <span className="hno-rod" aria-hidden="true" />
              <span className="hno-lift" aria-hidden="true">
                {lifted !== null && (
                  <span className={`hno-disc hno-d${lifted}`} style={{ width: discWidth(lifted) }} />
                )}
              </span>
              <span className="hno-stack" aria-hidden="true">
                {resting.map((disc) => (
                  <span key={disc} className={`hno-disc hno-d${disc}`} style={{ width: discWidth(disc) }} />
                ))}
              </span>
              <span className="hno-base" aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {/* 出ても消えても盤が動かないよう、高さは常に確保しておく */}
      <p className="result-row hno-result" aria-live="polite">
        {message}
      </p>

      <div className="hno-actions">
        {replay ? (
          <>
            <button
              type="button"
              className="btn"
              disabled={replay.step >= replay.solution.length}
              onClick={() => setReplay((r) => (r ? stepReplay({ ...r, playing: false }) : r))}
            >
              1手送り
            </button>
            <button
              type="button"
              className="btn"
              disabled={replay.step >= replay.solution.length}
              onClick={() => setReplay((r) => (r ? { ...r, playing: !r.playing } : r))}
            >
              {replay.playing ? '一時停止' : '再開'}
            </button>
            <button type="button" className="btn" disabled>
              ヒント
            </button>
            <button type="button" className="btn" onClick={stopReplay}>
              停止
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn"
              onClick={undoOne}
              disabled={movesOf(state) === 0 || cleared}
            >
              1手戻す
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => reset(n)}
              disabled={movesOf(state) === 0}
            >
              最初から
            </button>
            <button type="button" className="btn" onClick={showHint} disabled={cleared}>
              ヒント
            </button>
            <button type="button" className="btn" onClick={startReplay}>
              自動再生
            </button>
          </>
        )}
      </div>

      <details className="game-tips">
        <summary>画面の見かた</summary>
        <p>
          <strong>円盤を取る柱をタップし、次に置く柱をタップ</strong>します（円盤をつまんで
          置く柱まで<strong>ドラッグ</strong>しても動かせます）。同じ柱をもう一度タップすると取り消しです。
          小さい円盤の上に大きい円盤は置けません。<strong>全部を右の柱に移せば完成</strong>です。
          キーボードでは <kbd>1</kbd>・<kbd>2</kbd>・<kbd>3</kbd> で柱を選び、<kbd>Z</kbd> で1手戻します。
          ヒントや自動再生を使った回は、クリア回数だけを記録します。
        </p>
      </details>
    </div>
  );
}
