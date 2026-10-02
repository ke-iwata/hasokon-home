'use client';

/**
 * 詰将棋（1手詰・3手詰）の画面。
 *
 * 仕様: docs/features/game-tsume-shogi.md
 *
 * 駒の動き・合法手・王手と詰みの判定・玉方の応手・問題の生成は、すべて `lib/tsume-shogi.ts`（純関数）が持つ。
 * ここは**入力（タップ・キー）と描画だけ**を持つ。
 *
 * 操作は「駒（持ち駒）を選ぶ → 動ける先がハイライト → 先をタップ」の 2 段。盤のマスは 44px を割るので
 * （390px 幅で約 38px）、誤タップは 2 段の操作で防ぐ。44px を守るのは持ち駒・成／不成・ボタン（仕様書の「画面」）。
 *
 * 王手でない手・逃げられる王手は**指せるが不正解**で、理由を 1 行出してから指す前の局面に戻す。
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import {
  applyAs,
  candidateMoves,
  cellLabel,
  colOf,
  dailyProblem,
  DAILY_VARIANT,
  defenderReply,
  formatMove,
  generate,
  HAND_ORDER,
  illegalReason,
  ILLEGAL_MESSAGE,
  judge,
  PIECE_CHAR,
  PIECE_NAME,
  rowOf,
  SIZE,
  type Board,
  type HandPiece,
  type Move,
  type Problem,
} from '@/lib/tsume-shogi';
import { currentStreak, localDateKey, nextStreak } from '@/lib/daily';
import { trackToolUse } from '@/lib/analytics';
import { delayFor } from '@/app/_cpu/CpuSpeed';
import { BestBadge, RecordStrip, useRecords, useStopwatch } from '@/app/_records/Records';
import { formatTime, type Improved } from '@/lib/records';

type Mode = '1' | '3' | 'daily';

const MODE_ORDER: readonly Mode[] = ['1', '3', 'daily'];
const MODE_LABEL: Record<Mode, string> = { '1': '1手詰', '3': '3手詰', daily: '今日の1問' };

function variantOf(mode: Mode): string {
  return mode === 'daily' ? DAILY_VARIANT : mode;
}

/**
 * 局面。表示の出し分けはここで決める（画面の約束 7）。
 * - `play`：攻方の手番 / `promote`：成・不成を選んでいる / `reply`：玉方が応手を考えている
 * - `wrong`：不正解の手を見せている（一拍おいて指す前の局面に戻す）
 * - `solved`：詰んだ / `revealed`：答えを見た（タイムは記録しない）
 */
type Phase = 'loading' | 'play' | 'promote' | 'reply' | 'wrong' | 'solved' | 'revealed';

type Selection = { kind: 'cell'; at: number } | { kind: 'hand'; piece: HandPiece } | null;

interface Result {
  timeMs: number;
  improved: Improved;
  streak?: number;
}

/** 玉方の応手を指すまでの間（ms、cpu-speed.md の「ふつう」） */
const REPLY_DELAY = 420;
/** 不正解の手を見せてから戻すまでの間（ms） */
const WRONG_HOLD = 1400;
/** 「答えを見る」を出すまでの不正解の回数 */
const REVEAL_AFTER = 3;

/** 盤の外の番号のぶん、SVG の座標を広げる（上に筋、右に段） */
const PAD = 0.6;
const VIEW = SIZE + PAD;
const FILE_LABELS = '９８７６５４３２１';
const RANK_LABELS = '一二三四五六七八九';

const KEY_DIR: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

export default function Game() {
  const [mode, setMode] = useState<Mode>('1');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  /** 次に指す攻方の手が何手目か */
  const [ply, setPly] = useState<1 | 3>(1);
  const [phase, setPhase] = useState<Phase>('loading');
  const [selection, setSelection] = useState<Selection>(null);
  const [pending, setPending] = useState<Move | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [note, setNote] = useState('');
  /** 直前に動いた駒のマス（玉方の応手・不正解の手を一瞬ハイライトする） */
  const [moved, setMoved] = useState<number[]>([]);
  const [cursor, setCursor] = useState(4);
  const [result, setResult] = useState<Result | null>(null);
  const [today, setToday] = useState('');

  const records = useRecords('tsume-shogi');
  const variant = variantOf(mode);
  const entry = records.entry(variant);
  const timer = useStopwatch();
  const counted = useRef(false);
  /** 進行中のタイマー（応手・戻し）。新しい問題に切り替えたら止める */
  const timers = useRef<number[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const newGame = useCallback(
    (next: Mode, dateKey: string) => {
      clearTimers();
      setPhase('loading');
      setProblem(null);
      setBoard(null);
      setPly(1);
      setSelection(null);
      setPending(null);
      setMistakes(0);
      setNote('');
      setMoved([]);
      setResult(null);
      counted.current = false;
      timer.reset();
      // 「作っています」を描いてから作る（押しても反応しないように見えるのを防ぐ）
      later(() => {
        const made = next === 'daily' ? dailyProblem(dateKey) : generate(Math.random, next === '1' ? 1 : 3);
        setProblem(made);
        setBoard(made.board);
        setPhase('play');
        trackToolUse('tsume-shogi', `new-${next}`);
      }, 0);
    },
    [clearTimers, later, timer],
  );

  // 生成はマウント後に行う（静的書き出し時にサーバーとクライアントで盤面が食い違うため）
  useEffect(() => {
    const key = localDateKey();
    setToday(key);
    newGame('1', key);
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 画面でハイライトに出す手（合法手＋打ち歩詰め・二歩の打ち。指してから理由を出す） */
  const candidates = useMemo(() => (board && phase === 'play' ? candidateMoves(board, 'A') : []), [board, phase]);

  const targets = useMemo(() => {
    if (!selection) return [] as Move[];
    return candidates.filter((m) =>
      selection.kind === 'cell' ? m.from === selection.at : m.from === null && m.piece === selection.piece,
    );
  }, [candidates, selection]);

  const targetSquares = useMemo(() => new Set(targets.map((m) => m.to)), [targets]);

  const finishSolved = useCallback(
    (revealed: boolean) => {
      const timeMs = timer.stop();
      if (revealed) return;
      trackToolUse('tsume-shogi', `clear-${mode}`);
      const clearedOn = mode === 'daily' ? today : undefined;
      // 連続日数は記録に入れる前の値から数える（表示と保存を同じ計算にそろえる）
      const streak = mode === 'daily' ? nextStreak(entry.lastClearedOn, today, entry.streak) : undefined;
      const { improved } = records.finish({ outcome: 'win', timeMs, clearedOn }, variant);
      setResult({ timeMs, improved, streak });
    },
    [timer, mode, today, entry, records, variant],
  );

  /** 攻方の手を指す。判定は lib の `judge` に任せる */
  const play = useCallback(
    (move: Move) => {
      if (!problem || !board) return;
      setSelection(null);
      setPending(null);
      if (!counted.current) {
        counted.current = true;
        records.start(variant);
      }
      timer.begin();

      const verdict = judge(problem, move, board, ply);
      const before = board;
      const miss = (message: string) => {
        setNote(message);
        setMistakes((n) => n + 1);
      };

      if (verdict === 'illegal') {
        const reason = illegalReason(board, move, 'A');
        miss(reason ? ILLEGAL_MESSAGE[reason] : 'その手は指せません。');
        setPhase('play');
        return;
      }

      const after = applyAs(board, move, 'A');
      setBoard(after);
      setMoved([move.to]);

      if (verdict === 'mate') {
        setNote(`${formatMove(board, move, 'A')}まで、詰み！`);
        setPhase('solved');
        finishSolved(false);
        return;
      }

      const restore = () => {
        setBoard(before);
        setMoved([]);
        setPhase('play');
      };

      if (verdict === 'not-check') {
        miss('王手ではありません。王手の連続で詰ませます。');
        setPhase('wrong');
        later(restore, WRONG_HOLD);
        return;
      }

      // 玉方の応手は一拍おいて指す（cpu-speed.md）
      setNote('');
      setPhase(verdict === 'continue' ? 'reply' : 'wrong');
      later(() => {
        const reply = defenderReply(after);
        const replied = applyAs(after, reply, 'D');
        setBoard(replied);
        setMoved(reply.from === null ? [reply.to] : [reply.from, reply.to]);
        if (verdict === 'continue') {
          setPly(3);
          setPhase('play');
          return;
        }
        miss(`玉が逃げられます（${formatMove(after, reply, 'D')}）。`);
        later(restore, WRONG_HOLD);
      }, delayFor(REPLY_DELAY, 'normal'));
    },
    [problem, board, ply, records, variant, timer, later, finishSolved],
  );

  /** 先のマスを選んだ。成・不成の両方があれば 2 択を出す */
  const chooseTarget = useCallback(
    (to: number) => {
      const options = targets.filter((m) => m.to === to);
      if (options.length === 0) return;
      if (options.length === 2) {
        setPending(options.find((m) => m.promote) ?? options[0]);
        setPhase('promote');
        return;
      }
      play(options[0]);
    },
    [targets, play],
  );

  const onCell = useCallback(
    (i: number) => {
      if (!board || phase !== 'play') return;
      setCursor(i);
      if (selection && targetSquares.has(i)) {
        chooseTarget(i);
        return;
      }
      const s = board.cells[i];
      if (s && s.side === 'A') {
        setSelection(selection?.kind === 'cell' && selection.at === i ? null : { kind: 'cell', at: i });
        return;
      }
      setSelection(null);
    },
    [board, phase, selection, targetSquares, chooseTarget],
  );

  const onBoardClick = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * VIEW;
      const y = ((e.clientY - rect.top) / rect.height) * VIEW - PAD;
      const c = Math.floor(x);
      const r = Math.floor(y);
      if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return;
      onCell(r * SIZE + c);
    },
    [onCell],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<SVGSVGElement>) => {
      const dir = KEY_DIR[e.key];
      if (dir) {
        e.preventDefault();
        const r = Math.min(SIZE - 1, Math.max(0, rowOf(cursor) + dir[0]));
        const c = Math.min(SIZE - 1, Math.max(0, colOf(cursor) + dir[1]));
        setCursor(r * SIZE + c);
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onCell(cursor);
        return;
      }
      if (e.key === 'Escape') setSelection(null);
    },
    [cursor, onCell],
  );

  const onHand = useCallback(
    (piece: HandPiece) => {
      if (phase !== 'play') return;
      setSelection(selection?.kind === 'hand' && selection.piece === piece ? null : { kind: 'hand', piece });
    },
    [phase, selection],
  );

  const reveal = useCallback(() => {
    if (!problem) return;
    clearTimers();
    let b = problem.board;
    const words = problem.solution.map((m, i) => {
      const side = i % 2 === 0 ? 'A' : 'D';
      const w = formatMove(b, m, side);
      b = applyAs(b, m, side);
      return w;
    });
    setBoard(b);
    setMoved([problem.solution[problem.solution.length - 1].to]);
    setSelection(null);
    setPending(null);
    setNote(`答え：${words.join(' ')} まで（タイムは記録しません）`);
    setPhase('revealed');
    finishSolved(true);
    trackToolUse('tsume-shogi', 'reveal');
  }, [problem, clearTimers, finishSolved]);

  const streakNow = currentStreak(entry.lastClearedOn, today, entry.streak);
  const over = phase === 'solved' || phase === 'revealed';
  const attackerHand = board?.attackerHand;
  const defenderHand = board?.defenderHand;
  const defenderTotal = defenderHand ? HAND_ORDER.reduce((n, p) => n + defenderHand[p], 0) : 0;

  return (
    // 盤の大きさを決める変数（--chrome / --board-max）は入れ物に置く（盤と「作っています」の幕が同じ値を継承する）
    <div className="card ts-game">
      <div className="btn-row">
        <div className="seg" role="group" aria-label="問題の種類">
          {MODE_ORDER.map((m) => (
            <button
              key={m}
              type="button"
              className={m === mode ? 'active' : ''}
              aria-pressed={m === mode}
              onClick={() => {
                setMode(m);
                newGame(m, today);
              }}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      <RecordStrip
        items={[
          ...(entry.bestTimeMs ? [{ label: `${MODE_LABEL[mode]}のベスト`, value: formatTime(entry.bestTimeMs) }] : []),
          ...(entry.wins ? [{ label: '正解', value: `${entry.wins}回` }] : []),
          ...(mode === 'daily' && streakNow > 0 ? [{ label: '連続', value: `${streakNow}日` }] : []),
        ]}
      />

      {phase === 'solved' ? (
        <p className="status-bar" style={{ color: 'var(--ok)', fontWeight: 700 }}>
          🎉 詰み！ {formatTime(result?.timeMs ?? timer.ms)}
          {mode === 'daily' && result?.streak ? `　連続${result.streak}日` : ''}
          <BestBadge improved={result?.improved ?? null} />
        </p>
      ) : (
        <p className="status-bar">
          <span>
            {mode === 'daily' && today ? `${today}・` : ''}
            {problem ? `${problem.moves}手詰` : ''}
            {problem?.moves === 3 && !over ? `（${ply}手目）` : ''}
            {mistakes > 0 ? `　不正解${mistakes}回` : ''}
          </span>
          <span>⏱ {formatTime(timer.ms)}</span>
        </p>
      )}

      {/* 玉方の持ち駒は「残り全部」。折り畳まず 1 行で出す（狭い画面は枚数だけ） */}
      <p className="ts-hand-d" aria-label="玉方の持ち駒">
        <span className="ts-hand-d-full">
          玉方の持ち駒{' '}
          {defenderHand
            ? HAND_ORDER.filter((p) => defenderHand[p] > 0)
                .map((p) => `${PIECE_CHAR[p]}${defenderHand[p]}`)
                .join(' ')
            : ''}
        </span>
        <span className="ts-hand-d-short">玉方の持ち駒 残り全部（{defenderTotal}枚）</span>
      </p>

      <div className="ts-board-wrap">
        {board === null ? (
          <div className="ts-loading">問題を作っています…</div>
        ) : (
          <svg
            ref={svgRef}
            className={`ts-board${phase === 'solved' ? ' done' : ''}`}
            viewBox={`0 0 ${VIEW} ${VIEW}`}
            role="application"
            aria-label={`詰将棋の盤面。矢印キーでマスを移動、Enterで選択。いまのマス：${cellLabel(board, cursor)}`}
            tabIndex={0}
            onClick={onBoardClick}
            onKeyDown={onKeyDown}
            onContextMenu={(e) => e.preventDefault()}
          >
            {Array.from({ length: SIZE }, (_, c) => (
              <text key={`f${c}`} className="ts-coord" x={c + 0.5} y={PAD * 0.62}>
                {FILE_LABELS[c]}
              </text>
            ))}
            {Array.from({ length: SIZE }, (_, r) => (
              <text key={`r${r}`} className="ts-coord" x={SIZE + PAD / 2} y={PAD + r + 0.62}>
                {RANK_LABELS[r]}
              </text>
            ))}
            <rect className="ts-ground" x={0} y={PAD} width={SIZE} height={SIZE} />
            {board.cells.map((s, i) => {
              const x = colOf(i);
              const y = rowOf(i) + PAD;
              const cls = [
                'ts-cell',
                selection?.kind === 'cell' && selection.at === i ? 'selected' : '',
                targetSquares.has(i) ? 'target' : '',
                moved.includes(i) ? 'moved' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <g key={i}>
                  <rect className={cls} x={x} y={y} width={1} height={1} />
                  {targetSquares.has(i) && !s ? <circle className="ts-dot" cx={x + 0.5} cy={y + 0.5} r={0.12} /> : null}
                  {s ? (
                    <text
                      className={`ts-piece${s.piece.startsWith('+') ? ' promoted' : ''}${s.side === 'D' ? ' def' : ''}`}
                      x={x + 0.5}
                      y={y + 0.5}
                      transform={s.side === 'D' ? `rotate(180 ${x + 0.5} ${y + 0.5})` : undefined}
                    >
                      {PIECE_CHAR[s.piece]}
                    </text>
                  ) : null}
                </g>
              );
            })}
            <rect className="ts-cursor" x={colOf(cursor)} y={rowOf(cursor) + PAD} width={1} height={1} />
          </svg>
        )}

        {phase === 'promote' && pending ? (
          <div className="ts-promote" role="dialog" aria-label="成りますか">
            <button type="button" className="btn btn-primary" onClick={() => play({ ...pending, promote: true })}>
              成
            </button>
            <button type="button" className="btn" onClick={() => play({ ...pending, promote: false })}>
              不成
            </button>
          </div>
        ) : null}
      </div>

      {/* 攻方の持ち駒。押す先は 44px を割らない。空でも枠は置く（盤の下がずれない） */}
      <div className="ts-hand-a" role="group" aria-label="攻方（あなた）の持ち駒">
        <span className="ts-hand-label">持ち駒</span>
        {attackerHand && HAND_ORDER.some((p) => attackerHand[p] > 0) ? (
          HAND_ORDER.filter((p) => attackerHand[p] > 0).map((p) => (
            <button
              key={p}
              type="button"
              className={`ts-hand-btn${selection?.kind === 'hand' && selection.piece === p ? ' selected' : ''}`}
              aria-pressed={selection?.kind === 'hand' && selection.piece === p}
              aria-label={`持ち駒の${PIECE_NAME[p]}（${attackerHand[p]}枚）`}
              disabled={phase !== 'play'}
              onClick={() => onHand(p)}
            >
              {PIECE_CHAR[p]}
              {attackerHand[p] > 1 ? <small>×{attackerHand[p]}</small> : null}
            </button>
          ))
        ) : (
          <span className="ts-hand-none">なし</span>
        )}
      </div>

      {/* 理由の 1 行。空でも枠は置く（画面の約束 1） */}
      <p className={`ts-note${phase === 'wrong' ? ' wrong' : ''}`} role="status">
        {note}
      </p>

      <div className="btn-row ts-actions">
        <button type="button" className="btn" onClick={() => newGame(mode, today)}>
          {mode === 'daily' ? 'やり直す' : '次の問題'}
        </button>
        <button type="button" className="btn" onClick={reveal} disabled={over || mistakes < REVEAL_AFTER || !problem}>
          答えを見る
        </button>
      </div>

      <details className="game-tips">
        <summary>この画面の見かた</summary>
        <p>
          あなたは攻方（下側）です。駒か持ち駒を選ぶと、動ける先に印が付きます。印のマスを押すと指します。
          <strong>王手の連続</strong>で玉を詰ませると正解です。王手でない手や逃げられる王手は、理由を出して指す前に戻します。
          {REVEAL_AFTER}回間違えると「答えを見る」が押せます（そのときはタイムを記録しません）。
          {mode === 'daily'
            ? '「今日の1問」は日付から作る全員共通の3手詰で、連続日数はこの端末のブラウザに保存しています。'
            : ''}
        </p>
      </details>
    </div>
  );
}
