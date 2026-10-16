'use client';

/**
 * 四角わけパズルの画面。
 *
 * 仕様: docs/features/game-shikaku-wake.md
 *
 * 盤の生成・四角の置き方・入力の状態（2 点タップ／なぞり）・クリア判定は、
 * すべて `lib/shikaku-wake.ts`（純関数）が持つ。ここは**入力と描画だけ**を持つ。
 *
 * **答えは画面に出さない。** `puzzle.solution` は参照しない（クリアはルールで判定する）。
 * 「チェック」もルール違反の四角に印を付けるだけ。
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
  assignColors,
  cellLabel,
  clearAll,
  clearResult,
  colOf,
  dailyPuzzle,
  EMPTY_BOARD,
  IDLE,
  isSatisfied,
  isSolved,
  MODE_ORDER,
  MODES,
  placeRect,
  pointerStep,
  previewRect,
  readProgress,
  puzzleFromSeed,
  rectArea,
  rectContainsCell,
  rectShape,
  removeAt,
  restoreRects,
  rowOf,
  shareText,
  undo as undoBoard,
  variantOf,
  violations,
  writeProgress,
  type BoardState,
  type InputEvent,
  type InputState,
  type Mode,
  type Puzzle,
  type Rect,
} from '@/lib/shikaku-wake';
import { currentStreak, localDateKey, nextStreak } from '@/lib/daily';
import { SITE_URL } from '@/lib/registry';
import { trackToolUse } from '@/lib/analytics';
import { BestBadge, RecordStrip, useRecords, useStopwatch } from '@/app/_records/Records';
import { browserStorage, formatTime, type Improved } from '@/lib/records';

interface Result {
  timeMs: number;
  improved: Improved;
  /** 日替わりのときだけ入る連続日数 */
  streak?: number;
  /** 今日の1問の 2 回目以降（記録しない） */
  unrecorded?: boolean;
}

/** 矢印キー → 行・列の向き */
const KEY_DIR: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

function newSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

export default function Game() {
  const [mode, setMode] = useState<Mode>('daily');
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [board, setBoard] = useState<BoardState>(EMPTY_BOARD);
  const [input, setInput] = useState<InputState>(IDLE);
  const [hover, setHover] = useState<number | null>(null);
  const [cursor, setCursor] = useState(0);
  const [checked, setChecked] = useState(false);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  /**
   * 「今日」は**端末のローカル日付**。マウント後に決める
   * （静的書き出しのHTMLに焼き付けると、日付が変わっても古いままになる）。
   */
  const [today, setToday] = useState('');

  const records = useRecords('shikaku-wake');
  const variant = variantOf(mode);
  const entry = records.entry(variant);
  const timer = useStopwatch();
  const counted = useRef(false);
  const notified = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);
  /** 練習の盤の種（保存して、再読み込みで同じ盤を作り直す） */
  const seedRef = useRef<number | null>(null);
  /**
   * 入力の状態の最新の値。pointer の出来事は描き直しより速く続けて届くので、
   * 前の描画の値から計算するとずれる。更新は必ず `stepInput` を通す
   */
  const inputRef = useRef<InputState>(IDLE);
  const boardStateRef = useRef<BoardState>(EMPTY_BOARD);

  const size = puzzle?.size ?? 0;

  /** 盤を差し替え、途中経過を保存する */
  const commitBoard = useCallback(
    (next: BoardState, m: Mode = mode) => {
      boardStateRef.current = next;
      setBoard(next);
      setChecked(false);
      writeProgress(
        browserStorage(),
        m,
        m === 'daily' ? { dateKey: localDateKey(), rects: next.rects } : { seed: seedRef.current ?? 0, rects: next.rects },
      );
    },
    [mode],
  );

  const resetInput = useCallback(() => {
    inputRef.current = IDLE;
    setInput(IDLE);
  }, []);

  /**
   * 盤を用意する。`fresh` なら保存を捨てて新しい盤（練習は新しい種、今日の1問はやり直し）。
   * そうでなければ、保存してある途中経過から戻す
   */
  const loadGame = useCallback(
    (next: Mode, dateKey: string, fresh: boolean) => {
      setPuzzle(null);
      setResult(null);
      setNote('');
      setCopied(false);
      setChecked(false);
      setHover(null);
      resetInput();
      counted.current = false;
      notified.current = false;
      timer.reset();
      // 「作成中」を描いてから作る（押しても反応しないように見えるのを防ぐ）
      window.setTimeout(() => {
        const saved = fresh ? undefined : readProgress(browserStorage())[next];
        let made: Puzzle;
        let rects: Rect[] = [];
        if (next === 'daily') {
          made = dailyPuzzle(dateKey);
          if (saved && saved.dateKey === dateKey) rects = restoreRects(saved.rects, made.size);
        } else {
          seedRef.current = saved?.seed ?? newSeed();
          made = puzzleFromSeed(next, seedRef.current);
          if (saved) rects = restoreRects(saved.rects, made.size);
        }
        // 解き終わった盤が残っていたら（クリア直後に閉じた等）、空から始める
        if (isSolved(made, rects)) rects = [];
        const state: BoardState = { rects, history: [] };
        boardStateRef.current = state;
        setBoard(state);
        writeProgress(browserStorage(), next, next === 'daily' ? { dateKey, rects } : { seed: seedRef.current ?? 0, rects });
        // 途中から戻した盤は、前回の開始で 1 プレイと数えてある
        counted.current = rects.length > 0;
        setCursor(Math.floor((made.size * made.size) / 2));
        setPuzzle(made);
        trackToolUse('shikaku-wake', `new-${next}`);
      }, 0);
    },
    [timer, resetInput],
  );

  // 生成はマウント後に行う（静的書き出し時にサーバーとクライアントで盤面が食い違うため）
  useEffect(() => {
    const key = localDateKey();
    setToday(key);
    loadGame('daily', key, false);
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const done = puzzle !== null && isSolved(puzzle, board.rects);

  // クリアの記録。時間は止めた瞬間の値で固定し、以後動かさない
  useEffect(() => {
    if (!done || notified.current || !puzzle) return;
    notified.current = true;
    resetInput();
    trackToolUse('shikaku-wake', `clear-${mode}`);
    const timeMs = timer.stop();
    // 解き終わった盤は保存から外す（再読み込みで「クリア済みの盤」がまた記録されないように）
    writeProgress(browserStorage(), mode, null);
    // 今日の1問は**その日の初回のクリアだけ**を記録する（解き直しでベストを稼げないように）
    if (mode === 'daily' && entry.lastClearedOn === today) {
      setResult({ timeMs, improved: { time: false, score: false, moves: false }, streak: entry.streak, unrecorded: true });
      return;
    }
    // 連続日数は記録に入れる前の値から数える（表示と保存を同じ計算にそろえる）
    const streak = mode === 'daily' ? nextStreak(entry.lastClearedOn, today, entry.streak) : undefined;
    const { improved } = records.finish(clearResult(mode, timeMs, today), variant);
    setResult({ timeMs, improved, streak });
  }, [done, mode, today, puzzle, records, timer, variant, entry, resetInput]);

  /** 四角を引く。1 手目で 1 プレイと数え、時計を動かす */
  const place = useCallback(
    (a: number, b: number) => {
      if (!puzzle || done) return;
      const before = boardStateRef.current;
      const next = placeRect(before, a, b, puzzle.size);
      if (!counted.current) {
        counted.current = true;
        records.start(variant);
      }
      timer.begin();
      commitBoard(next);
      const last = next.history[next.history.length - 1];
      if (last?.placed) {
        const r = last.placed;
        const from = cellLabel(r.r0 * puzzle.size + r.c0, puzzle.size);
        const to = cellLabel(r.r1 * puzzle.size + r.c1, puzzle.size);
        const replaced = last.removed.length > 0 ? `（重なった${last.removed.length}つを消しました）` : '';
        setNote(`${from}から${to}に${rectShape(r)}の四角を引きました${replaced}`);
      } else if (last?.removed.length) {
        setNote(`${rectShape(last.removed[0])}の四角を消しました`);
      }
    },
    [puzzle, done, records, timer, variant, commitBoard],
  );

  /** 入力の状態を 1 つ進め、四角を引くなら引く */
  const stepInput = useCallback(
    (event: InputEvent) => {
      if (!puzzle) return;
      const out = pointerStep(inputRef.current, event);
      const wasIdle = inputRef.current.kind === 'idle' || inputRef.current.kind === 'pressIdle';
      inputRef.current = out.state;
      setInput(out.state);
      if (out.place) place(out.place.a, out.place.b);
      else if (out.state.kind === 'corner' && wasIdle) {
        setNote(`${cellLabel(out.state.a, puzzle.size)}に角を置きました。対角のマスを押してください`);
      } else if (out.state.kind === 'idle' && event.type === 'dismiss') setNote('角を取り消しました');
    },
    [puzzle, place],
  );

  /** 画面の座標 → マスの添字（盤の外なら null） */
  const cellAt = useCallback(
    (x: number, y: number): number | null => {
      const el = boardRef.current;
      if (!el || !puzzle) return null;
      const rect = el.getBoundingClientRect();
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
      e.preventDefault();
      // 指が盤の外へ出ても pointerup を受け取る（盤の外で離した＝取りやめ、を判定するため）
      e.currentTarget.setPointerCapture?.(e.pointerId);
      e.currentTarget.focus({ preventScroll: true });
      setCursor(cell);
      setHover(cell);
      stepInput({ type: 'down', cell });
    },
    [puzzle, done, cellAt, stepInput],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!puzzle || done) return;
      // PC のホバー（角を置いたあと）と、押している間の指の位置。予定の四角を薄く出すのに使う
      setHover(cellAt(e.clientX, e.clientY));
    },
    [puzzle, done, cellAt],
  );

  const onPointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!puzzle || done) return;
      const cell = cellAt(e.clientX, e.clientY);
      stepInput({ type: 'up', cell });
      if (e.pointerType !== 'mouse') setHover(null);
    },
    [puzzle, done, cellAt, stepInput],
  );

  const onPointerCancel = useCallback(() => {
    stepInput({ type: 'cancel' });
    setHover(null);
  }, [stepInput]);

  // 角を置いたあと、盤の外をタップしたら角を取り消す
  useEffect(() => {
    if (input.kind !== 'corner') return;
    const onDown = (e: globalThis.PointerEvent) => {
      const el = boardRef.current;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      stepInput({ type: 'dismiss' });
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [input.kind, stepInput]);

  const undo = useCallback(() => {
    const next = undoBoard(boardStateRef.current);
    if (next === boardStateRef.current) return;
    commitBoard(next);
    resetInput();
    setNote('1手もどしました');
  }, [commitBoard, resetInput]);

  const restart = useCallback(() => {
    const next = clearAll(boardStateRef.current);
    if (next === boardStateRef.current) return;
    commitBoard(next);
    resetInput();
    setNote('四角を全部消しました（「もどす」で戻せます）');
  }, [commitBoard, resetInput]);

  const check = useCallback(() => {
    if (!puzzle) return;
    const bad = violations(puzzle, boardStateRef.current.rects).length;
    setChecked(true);
    setNote(bad > 0 ? `決まりに合わない四角が${bad}つあります（×の印）` : 'いまの四角に決まり違反はありません');
    trackToolUse('shikaku-wake', 'check');
  }, [puzzle]);

  /** キーボード：矢印でカーソル、Space／Enter で角→確定、Delete で消す、Esc で角の取り消し、Z でもどす */
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!puzzle || done) return;
      const dir = KEY_DIR[e.key];
      if (dir) {
        e.preventDefault();
        const r = Math.min(puzzle.size - 1, Math.max(0, rowOf(cursor, puzzle.size) + dir[0]));
        const c = Math.min(puzzle.size - 1, Math.max(0, colOf(cursor, puzzle.size) + dir[1]));
        const next = r * puzzle.size + c;
        setCursor(next);
        setHover(next);
        return;
      }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        stepInput({ type: 'key', cell: cursor });
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        stepInput({ type: 'dismiss' });
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const next = removeAt(boardStateRef.current, cursor, puzzle.size);
        if (next !== boardStateRef.current) {
          commitBoard(next);
          setNote(`${cellLabel(cursor, puzzle.size)}の四角を消しました`);
        }
        return;
      }
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        undo();
      }
    },
    [puzzle, done, cursor, stepInput, commitBoard, undo],
  );

  const copyResult = useCallback(() => {
    if (!puzzle || !result) return;
    const text = shareText({
      mode,
      size: puzzle.size,
      timeMs: result.timeMs,
      dateKey: mode === 'daily' ? today : undefined,
      streak: result.streak,
      url: `${SITE_URL}/shikaku-wake/`,
    });
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        trackToolUse('shikaku-wake', 'copy-result');
      },
      () => setCopied(false),
    );
  }, [puzzle, result, mode, today]);

  const streakNow = currentStreak(entry.lastClearedOn, today, entry.streak);
  const rects = board.rects;
  const colors = assignColors(rects);
  const bad = new Set(checked && puzzle ? violations(puzzle, rects) : []);
  const preview = puzzle && !done ? previewRect(input, hover, puzzle.size) : null;
  const corner = input.kind === 'corner' || input.kind === 'pressCorner' ? input.a : null;
  const satisfiedClue = new Set<number>();
  if (puzzle) {
    rects.forEach((r) => {
      if (!isSatisfied(puzzle, r)) return;
      for (let row = r.r0; row <= r.r1; row++)
        for (let col = r.c0; col <= r.c1; col++) if (puzzle.clues[row * size + col] > 0) satisfiedClue.add(row * size + col);
    });
  }
  const covered = rects.reduce((s, r) => s + rectArea(r), 0);

  /** マスの読み上げ（「3行4列、数字6、四角の中（6マス・数字1つ）」） */
  const ariaFor = (cell: number): string => {
    if (!puzzle) return '';
    const parts = [cellLabel(cell, size)];
    if (puzzle.clues[cell] > 0) parts.push(`数字${puzzle.clues[cell]}`);
    const r = rects.find((x) => rectContainsCell(x, cell, size));
    if (r) {
      let n = 0;
      for (let row = r.r0; row <= r.r1; row++)
        for (let col = r.c0; col <= r.c1; col++) if (puzzle.clues[row * size + col] > 0) n++;
      parts.push(`四角の中（${rectArea(r)}マス・数字${n}つ${isSatisfied(puzzle, r) ? '・決まりどおり' : ''}）`);
    } else parts.push('四角の外');
    if (cell === corner) parts.push('角');
    return parts.join('、');
  };

  return (
    // 盤の大きさを決める変数（--chrome / --board-max）はこの入れ物に置く。
    // 盤と「生成中」の幕が同じ値を継承するようにするため（app/globals.css の .sw-game）
    <div className="card sw-game">
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
                loadGame(m, today, false);
              }}
            >
              {MODES[m].label}
            </button>
          ))}
        </div>
        <button type="button" className="btn" onClick={() => loadGame(mode, today, true)}>
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
            {mode === 'daily' && today ? `${today} の1問。` : `${MODES[mode].label}。`}
            のこり{size * size - covered}マス
          </span>
          <span>⏱ {formatTime(timer.ms)}</span>
        </p>
      )}

      {puzzle === null ? (
        <div className="sw-loading">問題を作っています…</div>
      ) : (
        <div
          ref={boardRef}
          className={`sw-board${done ? ' done' : ''}${corner !== null ? ' has-corner' : ''}`}
          role="grid"
          aria-label={`四角わけパズルの盤面（${size}×${size}）。矢印キーで動き、SpaceかEnterで角を置いてもう一度で四角を引きます。Deleteで消す、Escで角の取り消し、Zでもどす`}
          tabIndex={0}
          style={{ '--sw-cols': size } as CSSProperties}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') setHover(null);
          }}
          onKeyDown={onKeyDown}
          /* iOS の文脈メニュー・テキスト選択と当たるので、盤の上では既定の動作を止める */
          onContextMenu={(e) => e.preventDefault()}
        >
          <svg className="sw-fill" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
            {rects.map((r, i) => (
              <rect
                key={`f-${r.r0}-${r.c0}-${r.r1}-${r.c1}`}
                className={`sw-r${colors[i]}`}
                x={r.c0}
                y={r.r0}
                width={r.c1 - r.c0 + 1}
                height={r.r1 - r.r0 + 1}
              />
            ))}
          </svg>
          {Array.from({ length: size }, (_, row) => (
            <div key={row} role="row" className="sw-row">
              {Array.from({ length: size }, (_, col) => {
                const cell = row * size + col;
                const n = puzzle.clues[cell];
                return (
                  <div
                    key={cell}
                    role="gridcell"
                    aria-label={ariaFor(cell)}
                    aria-selected={cell === corner}
                    className={['sw-cell', cell === cursor ? 'cursor' : '', cell === corner ? 'corner' : '']
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {n > 0 ? <span className={`sw-num${satisfiedClue.has(cell) ? ' ok' : ''}`}>{n}</span> : null}
                  </div>
                );
              })}
            </div>
          ))}
          <svg className="sw-overlay" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
            {preview ? (
              <rect
                className="sw-preview"
                x={preview.c0 + 0.06}
                y={preview.r0 + 0.06}
                width={preview.c1 - preview.c0 + 1 - 0.12}
                height={preview.r1 - preview.r0 + 1 - 0.12}
              />
            ) : null}
            {rects.map((r, i) => (
              <g key={`b-${r.r0}-${r.c0}-${r.r1}-${r.c1}`}>
                <rect
                  className={`sw-edge${bad.has(i) ? ' bad' : ''}`}
                  x={r.c0 + 0.06}
                  y={r.r0 + 0.06}
                  width={r.c1 - r.c0 + 1 - 0.12}
                  height={r.r1 - r.r0 + 1 - 0.12}
                  rx={0.12}
                />
                {bad.has(i) ? (
                  <text className="sw-bad-mark" x={r.c0 + 0.22} y={r.r0 + 0.36}>
                    ×
                  </text>
                ) : null}
              </g>
            ))}
          </svg>
        </div>
      )}

      <div className="btn-row sw-actions">
        <button type="button" className="btn" onClick={undo} disabled={board.history.length === 0 || done}>
          もどす
        </button>
        <button type="button" className="btn" onClick={restart} disabled={rects.length === 0 || done}>
          最初から
        </button>
        <button type="button" className="btn" onClick={check} disabled={rects.length === 0 || done}>
          チェック
        </button>
        {/* 角を置いたあとの取り消し。ボタンは常に置き、角が無いあいだは押せないだけ（盤を動かさない） */}
        <button type="button" className="btn" onClick={() => stepInput({ type: 'dismiss' })} disabled={corner === null}>
          やめる
        </button>
      </div>

      {/* 読み上げの 1 行。文言で行数が変わると盤が動くので、枠は常に置いて高さを固定する（画面の約束1） */}
      <p className="sw-note" aria-live="polite">
        {done && result?.unrecorded ? '今日の1問は初回の記録だけを残します（このタイムは記録しません）。' : note}
      </p>

      {done && (
        <p className="sw-share">
          <button type="button" className="btn" onClick={copyResult}>
            {copied ? 'コピーしました' : '結果をコピー'}
          </button>
          <span className="sw-share-note">コピーする文面に答え（盤の区切り）は入りません。</span>
        </p>
      )}

      <details className="game-tips">
        <summary>この画面の見かた</summary>
        <p>
          マスを<strong>2つ続けてタップ</strong>すると、その2つを角とする四角が引けます（なぞっても引けます）。
          重なった四角は消えて新しい方に置き換わり、「もどす」1回で元に戻ります。
          同じマスを2回タップすると1マスの四角、四角の中なら<strong>その四角を消します</strong>
          （四角の中に1マスの四角を作るときは、先にその四角を消してください）。
          数字が太字になったら、その四角は決まりを満たしています。「チェック」は決まりに合わない四角に印を付けるだけで、
          <strong>正解は教えません</strong>。
          {mode === 'daily'
            ? '「今日の1問」は日付から作る全員共通の問題で、途中の盤と連続日数はこの端末のブラウザに保存しています（端末やブラウザを変えると引き継げません）。'
            : '途中の盤はこの端末のブラウザに保存していて、再読み込みしても戻ります。'}
        </p>
      </details>
    </div>
  );
}
