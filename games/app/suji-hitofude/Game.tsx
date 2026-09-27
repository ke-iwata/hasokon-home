'use client';

/**
 * 数字つなぎ一筆書きの画面。
 *
 * 仕様: docs/features/game-suji-hitofude.md
 *
 * 盤の生成・道の伸び縮み・弾く判定・クリア判定は、すべて `lib/suji-hitofude.ts`（純関数）が持つ。
 * ここは**入力（なぞる・キー）と描画だけ**を持つ。
 *
 * **答えは画面に出さない。** ヒントは無く、`puzzle.solution` も参照しない
 * （クリアかどうかは、引いた道だけから判定できる）。
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import {
  BLOCKED_MESSAGE,
  canGrab,
  colOf,
  dailyPuzzle,
  dragTo,
  generateFor,
  isSolved,
  MODE_ORDER,
  MODES,
  rowOf,
  shareText,
  variantOf,
  wallSegments,
  type Mode,
  type Puzzle,
} from '@/lib/suji-hitofude';
import { currentStreak, localDateKey, nextStreak } from '@/lib/daily';
import { SITE_URL } from '@/lib/registry';
import { trackToolUse } from '@/lib/analytics';
import { BestBadge, RecordStrip, useRecords, useStopwatch } from '@/app/_records/Records';
import { formatTime, type Improved } from '@/lib/records';

interface Result {
  timeMs: number;
  improved: Improved;
  /** 日替わりのときだけ入る連続日数 */
  streak?: number;
}

/** 矢印キー → 行・列の向き */
const KEY_DIR: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

export default function Game() {
  const [mode, setMode] = useState<Mode>('easy');
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [path, setPath] = useState<number[]>([]);
  const [note, setNote] = useState('');
  const [showTimer, setShowTimer] = useState(true);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  /**
   * 「今日」は**端末のローカル日付**。マウント後に決める
   * （静的書き出しのHTMLに焼き付けると、日付が変わっても古いままになる）。
   */
  const [today, setToday] = useState('');

  const records = useRecords('suji-hitofude');
  const variant = variantOf(mode);
  const entry = records.entry(variant);
  const timer = useStopwatch();
  const counted = useRef(false);
  const notified = useRef(false);
  /** なぞっている最中か（指・マウスを押している間だけ true） */
  const dragging = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);
  /**
   * 道の最新の値。pointermove は描き直しより速く続けて届くので、
   * 前の描画の `path` から計算すると 1 マスぶん遅れて弾かれる。道の更新は必ず `commit` を通す
   */
  const pathRef = useRef<number[]>([]);
  const commit = useCallback((next: number[]) => {
    pathRef.current = next;
    setPath(next);
  }, []);

  const newGame = useCallback(
    (next: Mode, dateKey: string) => {
      setPuzzle(null);
      commit([]);
      setResult(null);
      setNote('');
      setCopied(false);
      counted.current = false;
      notified.current = false;
      dragging.current = false;
      timer.reset();
      // 「作成中」を描いてから作る（押しても反応しないように見えるのを防ぐ）
      window.setTimeout(() => {
        const made = next === 'daily' ? dailyPuzzle(dateKey) : generateFor(next, Math.random).puzzle;
        setPuzzle(made);
        trackToolUse('suji-hitofude', `new-${next}`);
      }, 0);
    },
    [timer, commit],
  );

  // 生成はマウント後に行う（静的書き出し時にサーバーとクライアントで盤面が食い違うため）
  useEffect(() => {
    const key = localDateKey();
    setToday(key);
    newGame('easy', key);
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const done = puzzle !== null && isSolved(puzzle, path);

  // クリアの記録。時間は止めた瞬間の値で固定し、以後動かさない
  useEffect(() => {
    if (!done || notified.current || !puzzle) return;
    notified.current = true;
    dragging.current = false;
    trackToolUse('suji-hitofude', `clear-${mode}`);
    const timeMs = timer.stop();
    const clearedOn = mode === 'daily' ? today : undefined;
    // 連続日数は記録に入れる前の値から数える（表示と保存を同じ計算にそろえる）
    const streak = mode === 'daily' ? nextStreak(entry.lastClearedOn, today, entry.streak) : undefined;
    const { improved } = records.finish({ outcome: 'win', timeMs, clearedOn }, variant);
    setResult({ timeMs, improved, streak });
  }, [done, mode, today, puzzle, records, timer, variant, entry]);

  /** 道を `cell` へ向けて伸ばす（縮む・弾くも含む）。1 マスでも動いたら 1 プレイと数える */
  const moveTo = useCallback(
    (cell: number) => {
      if (!puzzle || done) return;
      const before = pathRef.current;
      const r = dragTo(puzzle, before, cell);
      setNote(r.blocked ? BLOCKED_MESSAGE[r.blocked] : '');
      if (r.path === before) return;
      if (!counted.current) {
        counted.current = true;
        records.start(variant);
      }
      timer.begin();
      commit(r.path);
    },
    [puzzle, done, records, timer, variant, commit],
  );

  /** 画面の座標 → マスの添字（盤の外なら null） */
  const cellAt = useCallback(
    (x: number, y: number): number | null => {
      const board = boardRef.current;
      if (!board || !puzzle) return null;
      const rect = board.getBoundingClientRect();
      const c = Math.floor(((x - rect.left) / rect.width) * puzzle.size);
      const r = Math.floor(((y - rect.top) / rect.height) * puzzle.size);
      if (r < 0 || c < 0 || r >= puzzle.size || c >= puzzle.size) return null;
      return r * puzzle.size + c;
    },
    [puzzle],
  );

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!puzzle || done) return;
      const cell = cellAt(e.clientX, e.clientY);
      if (cell === null) return;
      // 先端（道が無ければ「1」）以外を押しても何もしない（誤タップで道が壊れないように）
      const path = pathRef.current;
      if (!canGrab(puzzle, path, cell)) {
        setNote(path.length === 0 ? BLOCKED_MESSAGE.start : '道の先端からなぞると続きを引けます。');
        return;
      }
      e.preventDefault();
      dragging.current = true;
      // 指が盤の外へ出ても pointermove を受け取り続ける
      e.currentTarget.setPointerCapture?.(e.pointerId);
      moveTo(cell);
    },
    [puzzle, done, cellAt, moveTo],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      const cell = cellAt(e.clientX, e.clientY);
      if (cell !== null) moveTo(cell);
    },
    [cellAt, moveTo],
  );

  const endDrag = useCallback(() => {
    dragging.current = false;
  }, []);

  /** キーボード：矢印で先端から 1 マス。道が無ければ「1」から始める。Backspace で 1 マス戻す */
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!puzzle || done) return;
      const path = pathRef.current;
      if (e.key === 'Backspace') {
        e.preventDefault();
        commit(path.slice(0, -1));
        setNote('');
        return;
      }
      const dir = KEY_DIR[e.key];
      if (!dir) return;
      e.preventDefault();
      if (path.length === 0) {
        moveTo(puzzle.numbers.indexOf(1));
        return;
      }
      const head = path[path.length - 1];
      const r = rowOf(head, puzzle.size) + dir[0];
      const c = colOf(head, puzzle.size) + dir[1];
      if (r < 0 || c < 0 || r >= puzzle.size || c >= puzzle.size) return;
      moveTo(r * puzzle.size + c);
    },
    [puzzle, done, moveTo, commit],
  );

  const undo = useCallback(() => {
    commit(pathRef.current.slice(0, -1));
    setNote('');
  }, [commit]);

  const restart = useCallback(() => {
    commit([]);
    setNote('');
    setResult(null);
    counted.current = false;
    notified.current = false;
    timer.reset();
  }, [timer, commit]);

  const copyResult = useCallback(() => {
    if (!puzzle || !result) return;
    const text = shareText({
      mode,
      size: puzzle.size,
      timeMs: result.timeMs,
      dateKey: mode === 'daily' ? today : undefined,
      streak: result.streak,
      url: `${SITE_URL}/suji-hitofude/`,
    });
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        trackToolUse('suji-hitofude', 'copy-result');
      },
      () => setCopied(false),
    );
  }, [puzzle, result, mode, today]);

  const streakNow = currentStreak(entry.lastClearedOn, today, entry.streak);
  const visited = new Set(path);
  const remaining = puzzle ? puzzle.size * puzzle.size - path.length : 0;
  const head = path.length > 0 ? path[path.length - 1] : -1;
  const size = puzzle?.size ?? 0;
  const center = (cell: number) => `${colOf(cell, size) + 0.5},${rowOf(cell, size) + 0.5}`;

  return (
    // 盤の大きさを決める変数（--chrome / --board-max）はこの入れ物に置く。
    // 盤と「生成中」の幕が同じ値を継承するようにするため（app/globals.css の .hn-game）
    <div className="card hn-game">
      <div className="btn-row">
        <div className="seg" role="group" aria-label="難易度">
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
              {MODES[m].label}
            </button>
          ))}
        </div>
        <button type="button" className="btn" onClick={() => newGame(mode, today)}>
          {/* 今日の1問は全員同じ問題なので、作り直しても同じ盤が出る（やり直しになる） */}
          {mode === 'daily' ? 'やり直す' : '新しい問題'}
        </button>
      </div>

      <RecordStrip
        items={[
          ...(entry.bestTimeMs ? [{ label: `${MODES[mode].label}のベスト`, value: formatTime(entry.bestTimeMs) }] : []),
          ...(entry.wins ? [{ label: 'クリア', value: `${entry.wins}回` }] : []),
          ...(mode === 'daily' && streakNow > 0 ? [{ label: '連続', value: `${streakNow}日` }] : []),
        ]}
      />

      {done ? (
        <p className="status-bar" style={{ color: 'var(--ok)', fontWeight: 700 }}>
          🎉 クリア！タイム: {formatTime(result?.timeMs ?? timer.ms)}
          {mode === 'daily' && result?.streak ? `　連続${result.streak}日` : ''}
          <BestBadge improved={result?.improved ?? null} />
        </p>
      ) : (
        <p className="status-bar">
          <span>
            {mode === 'daily' && today ? `${today} の1問。` : ''}
            のこり{remaining}マス
          </span>
          <span>{showTimer ? `⏱ ${formatTime(timer.ms)}` : ''}</span>
        </p>
      )}

      {puzzle === null ? (
        <div className="hn-loading">問題を作っています…</div>
      ) : (
        <div
          ref={boardRef}
          className={`hn-board${done ? ' done' : ''}`}
          role="application"
          aria-label={`数字つなぎ一筆書きの盤面（${size}×${size}）。矢印キーで道を伸ばし、Backspaceで1マス戻します`}
          tabIndex={0}
          style={{ '--hn-cols': size } as CSSProperties}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
          /* iOS の文脈メニュー・テキスト選択と当たるので、盤の上では既定の動作を止める */
          onContextMenu={(e) => e.preventDefault()}
        >
          {puzzle.numbers.map((n, i) => (
            <div
              key={i}
              className={['hn-cell', visited.has(i) ? 'visited' : '', i === head ? 'head' : '']
                .filter(Boolean)
                .join(' ')}
              aria-hidden="true"
            >
              {n > 0 ? <span className="hn-num">{n}</span> : null}
            </div>
          ))}
          <svg className="hn-overlay" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
            {path.length > 1 ? (
              <polyline className="hn-path" points={path.map(center).join(' ')} />
            ) : null}
            {wallSegments(puzzle).map(({ cell, side }) => {
              const r = rowOf(cell, size);
              const c = colOf(cell, size);
              return side === 'right' ? (
                <line key={`${cell}-r`} className="hn-wall" x1={c + 1} y1={r} x2={c + 1} y2={r + 1} />
              ) : (
                <line key={`${cell}-b`} className="hn-wall" x1={c} y1={r + 1} x2={c + 1} y2={r + 1} />
              );
            })}
          </svg>
        </div>
      )}

      <div className="btn-row hn-actions">
        <button type="button" className="btn" onClick={undo} disabled={path.length === 0 || done}>
          もどす
        </button>
        <button type="button" className="btn" onClick={restart} disabled={path.length === 0}>
          最初から
        </button>
        <label className="hn-toggle">
          <input type="checkbox" checked={showTimer} onChange={(e) => setShowTimer(e.target.checked)} />
          タイマーを表示
        </label>
      </div>

      {/* 文言で行数が変わると盤が動くので、枠は常に置いて高さを固定する（画面の約束1） */}
      <p className="hn-note">{note}</p>

      {done && (
        <p className="hn-share">
          <button type="button" className="btn" onClick={copyResult}>
            {copied ? 'コピーしました' : '結果をコピー'}
          </button>
          <span className="hn-share-note">コピーする文面に答え（道の形）は入りません。</span>
        </p>
      )}

      <details className="game-tips">
        <summary>この画面の見かた</summary>
        <p>
          「1」のマスから指（マウス）を離さずになぞると道が伸びます。
          <strong>1つ前のマスに戻ると道が縮みます</strong>。指を離しても道は残るので、
          道の先端からなぞると続きを引けます。番号を飛ばす・壁を越える・通ったマスに戻る動きは
          その場で止まります（<strong>正解かどうかは教えません</strong>）。
          {mode === 'daily'
            ? '「今日の1問」は日付から作る全員共通の問題で、連続日数はこの端末のブラウザに保存しています（端末やブラウザを変えると引き継げません）。'
            : ''}
        </p>
      </details>
    </div>
  );
}
