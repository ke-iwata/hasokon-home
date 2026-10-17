'use client';

/**
 * 橋かけパズルの画面。
 *
 * 仕様: docs/features/game-hashi-kake.md
 *
 * 盤の生成・橋の切り替え・島の 2 回タップ・当たり判定・クリア判定は、
 * すべて `lib/hashi-kake.ts`（純関数）が持つ。ここは**入力と描画だけ**を持つ。
 *
 * **答えは画面に出さない。** `puzzle.solution` は参照しない（クリアはルールで判定する）。
 * 「チェック」も数字を超えた島と交差に印を付けるだけ。
 *
 * 押した場所の判定は、盤全体の 1 つの `pointerdown` から `hitTest` で決める。
 * 帯の `<button>` はキーボードと読み上げのためだけに置き、ポインターは受けない。
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
  bandRect,
  clearAll,
  clearResult,
  dailyPuzzle,
  degrees,
  edgeBetween,
  edgeLabel,
  emptyBoard,
  hitTest,
  islandAria,
  isSolved,
  MODE_ORDER,
  MODES,
  puzzleFromSeed,
  readProgress,
  restoreCounts,
  shareText,
  tapIsland,
  toggleEdge,
  undo as undoBoard,
  variantOf,
  violations,
  writeProgress,
  type BoardState,
  type Hit,
  type Mode,
  type Puzzle,
} from '@/lib/hashi-kake';
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

/** これ未満の移動はタップとして扱う（px） */
const TAP_SLOP = 6;

/** 交差相手を点滅させる時間（ms） */
const FLASH_MS = 600;

function newSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

const EMPTY: BoardState = { counts: [], history: [] };

export default function Game() {
  const [mode, setMode] = useState<Mode>('daily');
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [board, setBoard] = useState<BoardState>(EMPTY);
  const [selected, setSelected] = useState<number | null>(null);
  const [flash, setFlash] = useState<number[]>([]);
  const [checked, setChecked] = useState(false);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  /**
   * 「今日」は**端末のローカル日付**。マウント後に決める
   * （静的書き出しのHTMLに焼き付けると、日付が変わっても古いままになる）。
   */
  const [today, setToday] = useState('');

  const records = useRecords('hashi-kake');
  const variant = variantOf(mode);
  const entry = records.entry(variant);
  const timer = useStopwatch();
  const counted = useRef(false);
  const notified = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);
  /** 練習の盤の種（保存して、再読み込みで同じ盤を作り直す） */
  const seedRef = useRef<number | null>(null);
  /** 盤の最新の値。pointer の出来事は描き直しより速く続けて届くので、ref から読む */
  const boardStateRef = useRef<BoardState>(EMPTY);
  const selectedRef = useRef<number | null>(null);
  /** 押し始めの位置と当たり（なぞりの判定に使う） */
  const pressRef = useRef<{ x: number; y: number; hit: Hit } | null>(null);
  const flashTimer = useRef<number | null>(null);

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
        m === 'daily' ? { dateKey: localDateKey(), counts: next.counts } : { seed: seedRef.current ?? 0, counts: next.counts },
      );
    },
    [mode],
  );

  const select = useCallback((island: number | null) => {
    selectedRef.current = island;
    setSelected(island);
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
      setFlash([]);
      select(null);
      counted.current = false;
      notified.current = false;
      timer.reset();
      // 「作成中」を描いてから作る（押しても反応しないように見えるのを防ぐ）
      window.setTimeout(() => {
        const saved = fresh ? undefined : readProgress(browserStorage())[next];
        let made: Puzzle;
        let counts: number[] = [];
        if (next === 'daily') {
          made = dailyPuzzle(dateKey);
          if (saved && saved.dateKey === dateKey) counts = restoreCounts(made, saved.counts);
        } else {
          seedRef.current = saved?.seed ?? newSeed();
          made = puzzleFromSeed(next, seedRef.current);
          if (saved) counts = restoreCounts(made, saved.counts);
        }
        if (counts.length !== made.edges.length) counts = emptyBoard(made).counts;
        // 解き終わった盤が残っていたら（クリア直後に閉じた等）、空から始める
        if (isSolved(made, counts)) counts = emptyBoard(made).counts;
        const state: BoardState = { counts, history: [] };
        boardStateRef.current = state;
        setBoard(state);
        writeProgress(browserStorage(), next, next === 'daily' ? { dateKey, counts } : { seed: seedRef.current ?? 0, counts });
        // 途中から戻した盤は、前回の開始で 1 プレイと数えてある
        counted.current = counts.some((v) => v > 0);
        setPuzzle(made);
        trackToolUse('hashi-kake', `new-${next}`);
      }, 0);
    },
    [timer, select],
  );

  // 生成はマウント後に行う（静的書き出し時にサーバーとクライアントで盤面が食い違うため）
  useEffect(() => {
    const key = localDateKey();
    setToday(key);
    loadGame('daily', key, false);
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  const done = puzzle !== null && board.counts.length === puzzle.edges.length && isSolved(puzzle, board.counts);

  // クリアの記録。時間は止めた瞬間の値で固定し、以後動かさない
  useEffect(() => {
    if (!done || notified.current || !puzzle) return;
    notified.current = true;
    select(null);
    const timeMs = timer.stop();
    // 解き終わった盤は保存から外す（再読み込みで「クリア済みの盤」がまた記録されないように）
    writeProgress(browserStorage(), mode, null);
    // 今日の1問は**その日の初回のクリアだけ**を記録する（解き直しでベストを稼げないように）
    if (mode === 'daily' && entry.lastClearedOn === today) {
      setResult({ timeMs, improved: { time: false, score: false, moves: false }, streak: entry.streak, unrecorded: true });
      return;
    }
    trackToolUse('hashi-kake', mode === 'daily' ? 'daily-clear' : `clear-${mode}`);
    // 連続日数は記録に入れる前の値から数える（表示と保存を同じ計算にそろえる）
    const streak = mode === 'daily' ? nextStreak(entry.lastClearedOn, today, entry.streak) : undefined;
    const { improved } = records.finish(clearResult(mode, timeMs, today), variant);
    setResult({ timeMs, improved, streak });
  }, [done, mode, today, puzzle, records, timer, variant, entry, select]);

  /** 帯 k の本数を切り替える。1 手目で 1 プレイと数え、時計を動かす */
  const toggle = useCallback(
    (k: number) => {
      if (!puzzle || done) return;
      const out = toggleEdge(puzzle, boardStateRef.current, k);
      if (out.blockedBy.length > 0) {
        setFlash(out.blockedBy);
        if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
        flashTimer.current = window.setTimeout(() => setFlash([]), FLASH_MS);
        setNote('ほかの橋と交差するので架けられません（交差する橋が光ります）');
        return;
      }
      if (!counted.current) {
        counted.current = true;
        records.start(variant);
      }
      timer.begin();
      commitBoard(out.state);
      setNote(edgeLabel(puzzle, k, out.state.counts[k]));
    },
    [puzzle, done, records, timer, variant, commitBoard],
  );

  /** タップの当たりを処理する */
  const onTap = useCallback(
    (hit: Hit) => {
      if (!puzzle || !hit) return;
      if (hit.kind === 'edge') {
        toggle(hit.edge);
        return;
      }
      const r = tapIsland(puzzle, selectedRef.current, hit.island);
      select(r.selected);
      if (r.toggle >= 0) toggle(r.toggle);
      else if (r.selected !== null) {
        const s = puzzle.islands[r.selected];
        setNote(`${s.r + 1}行${s.c + 1}列の島(${s.n})を選びました。つなぐ相手の島を押してください`);
      } else setNote('島の選択を外しました');
    },
    [puzzle, toggle, select],
  );

  /** 画面の座標 → 盤の左上からの px とマスの大きさ */
  const localPoint = useCallback(
    (x: number, y: number) => {
      const el = boardRef.current;
      if (!el || !puzzle) return null;
      const rect = el.getBoundingClientRect();
      // 枠線の内側を盤として扱う
      const border = el.clientLeft;
      const inner = rect.width - border * 2;
      return { x: x - rect.left - border, y: y - rect.top - border, cellPx: inner / puzzle.size };
    },
    [puzzle],
  );

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!puzzle || done) return;
      const p = localPoint(e.clientX, e.clientY);
      if (!p) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const hit = hitTest(puzzle, boardStateRef.current.counts, p, p.cellPx);
      pressRef.current = { x: e.clientX, y: e.clientY, hit };
    },
    [puzzle, done, localPoint],
  );

  const onPointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const press = pressRef.current;
      pressRef.current = null;
      if (!puzzle || done || !press) return;
      const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
      if (moved < TAP_SLOP) {
        onTap(press.hit);
        return;
      }
      // なぞり：島から押して、隣の島で離すと、その間を 1 つ進める
      if (press.hit?.kind !== 'island') return;
      const p = localPoint(e.clientX, e.clientY);
      if (!p) return;
      const end = hitTest(puzzle, boardStateRef.current.counts, p, p.cellPx);
      if (end?.kind !== 'island' || end.island === press.hit.island) return;
      const k = edgeBetween(puzzle, press.hit.island, end.island);
      if (k >= 0) toggle(k);
    },
    [puzzle, done, onTap, localPoint, toggle],
  );

  // 島を選んでいる間、盤の外をタップしたら選択を外す
  useEffect(() => {
    if (selected === null) return;
    const onDown = (e: globalThis.PointerEvent) => {
      const el = boardRef.current;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      select(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [selected, select]);

  const undo = useCallback(() => {
    const next = undoBoard(boardStateRef.current);
    if (next === boardStateRef.current) return;
    commitBoard(next);
    setNote('1手もどしました');
  }, [commitBoard]);

  const restart = useCallback(() => {
    const next = clearAll(boardStateRef.current);
    if (next === boardStateRef.current) return;
    commitBoard(next);
    select(null);
    setNote('橋を全部外しました（「もどす」で戻せます）');
  }, [commitBoard, select]);

  const check = useCallback(() => {
    if (!puzzle) return;
    const v = violations(puzzle, boardStateRef.current.counts);
    setChecked(true);
    const parts: string[] = [];
    if (v.islands.length > 0) parts.push(`数字を超えた島が${v.islands.length}つ`);
    if (v.edges.length > 0) parts.push(`交差している橋が${v.edges.length}本`);
    setNote(parts.length > 0 ? `${parts.join('、')}あります（×の印）` : 'いまの橋に決まり違反はありません');
    trackToolUse('hashi-kake', 'check');
  }, [puzzle]);

  /** キーボード：Tab で帯を移動、Space／Enter で切り替え（帯のボタン）、Z（Ctrl/Cmd+Z）でもどす、Esc で選択を外す */
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!puzzle || done) return;
      if (e.key === 'Escape') {
        if (selectedRef.current !== null) {
          e.preventDefault();
          select(null);
          setNote('島の選択を外しました');
        }
        return;
      }
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        undo();
      }
    },
    [puzzle, done, undo, select],
  );

  const copyResult = useCallback(() => {
    if (!puzzle || !result) return;
    const text = shareText({
      mode,
      size: puzzle.size,
      timeMs: result.timeMs,
      dateKey: mode === 'daily' ? today : undefined,
      streak: result.streak,
      url: `${SITE_URL}/hashi-kake/`,
    });
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        trackToolUse('hashi-kake', 'copy-result');
      },
      () => setCopied(false),
    );
  }, [puzzle, result, mode, today]);

  const streakNow = currentStreak(entry.lastClearedOn, today, entry.streak);
  const counts = board.counts;
  const ready = puzzle !== null && counts.length === puzzle.edges.length;
  const deg = ready ? degrees(puzzle, counts) : [];
  const bad = ready && checked ? violations(puzzle, counts) : { islands: [], edges: [] };
  const badIslands = new Set(bad.islands);
  const badEdges = new Set(bad.edges);
  const flashing = new Set(flash);
  const need = puzzle ? puzzle.islands.reduce((s, i) => s + i.n, 0) / 2 : 0;
  const placed = counts.reduce((s, v) => s + v, 0);
  /** 選んでいる島から出る帯（候補として強調する） */
  const candidates = new Set(
    ready && selected !== null ? puzzle.edges.map((e, k) => (e.a === selected || e.b === selected ? k : -1)).filter((k) => k >= 0) : [],
  );

  return (
    // 盤の大きさを決める変数（--chrome / --board-max）はこの入れ物に置く。
    // 盤と「生成中」の幕が同じ値を継承するようにするため（app/globals.css の .hk-game）
    <div className="card hk-game">
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
            のこり{Math.max(0, need - placed)}本
          </span>
          <span>⏱ {formatTime(timer.ms)}</span>
        </p>
      )}

      {!ready ? (
        <div className="hk-loading">問題を作っています…</div>
      ) : (
        <div
          ref={boardRef}
          className={`hk-board${done ? ' done' : ''}`}
          role="group"
          aria-label={`橋かけパズルの盤面（${size}×${size}）。Tabで島と島の間を順に移動し、SpaceかEnterで橋の本数を0→1→2→0と切り替えます。Zでもどす`}
          style={{ '--hk-cols': size } as CSSProperties}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            pressRef.current = null;
          }}
          onKeyDown={onKeyDown}
          /* iOS の文脈メニュー・テキスト選択と当たるので、盤の上では既定の動作を止める */
          onContextMenu={(e) => e.preventDefault()}
        >
          <svg className="hk-svg" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
            {/* マスの目は点で薄く（島の位置の手がかり） */}
            {Array.from({ length: size * size }, (_, i) => (
              <circle key={`d${i}`} className="hk-dot" cx={(i % size) + 0.5} cy={Math.floor(i / size) + 0.5} r={0.04} />
            ))}
            {puzzle.edges.map((e, k) => {
              if (!candidates.has(k) || counts[k] === 2) return null;
              const b = bandRect(puzzle, k, 1);
              return <rect key={`c${k}`} className="hk-cand" x={b.x} y={b.y} width={b.w} height={b.h} rx={0.2} />;
            })}
            {puzzle.edges.map((e, k) => {
              const n = counts[k];
              if (n === 0) return null;
              const a = puzzle.islands[e.a];
              const b = puzzle.islands[e.b];
              const offs = n === 1 ? [0] : [-0.11, 0.11];
              const cls = ['hk-bridge', badEdges.has(k) ? 'bad' : '', flashing.has(k) ? 'flash' : ''].filter(Boolean).join(' ');
              return (
                <g key={`b${k}`} className={cls}>
                  {offs.map((o) =>
                    e.horizontal ? (
                      <line key={o} x1={a.c + 0.5} y1={a.r + 0.5 + o} x2={b.c + 0.5} y2={b.r + 0.5 + o} />
                    ) : (
                      <line key={o} x1={a.c + 0.5 + o} y1={a.r + 0.5} x2={b.c + 0.5 + o} y2={b.r + 0.5} />
                    ),
                  )}
                </g>
              );
            })}
            {puzzle.islands.map((s, i) => {
              const ok = deg[i] === s.n;
              const cls = [
                'hk-island',
                ok ? 'ok' : '',
                badIslands.has(i) ? 'bad' : '',
                i === selected ? 'selected' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <g key={`i${i}`} className={cls}>
                  <circle cx={s.c + 0.5} cy={s.r + 0.5} r={0.4} />
                  <text x={s.c + 0.5} y={s.r + 0.53}>
                    {s.n}
                  </text>
                  {badIslands.has(i) ? (
                    <text className="hk-bad-mark" x={s.c + 0.9} y={s.r + 0.18}>
                      ×
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
          {/* 島の読み上げ。押す先には使わない（盤が座標から決める） */}
          <ul className="hk-sr">
            {puzzle.islands.map((s, i) => (
              <li key={i}>{islandAria(s, deg[i])}</li>
            ))}
          </ul>
          {/* 帯のボタン。キーボード（Tab・Space／Enter）と読み上げのためだけに置く。並びは盤の左上から行優先 */}
          {puzzle.edges.map((e, k) => {
            const b = bandRect(puzzle, k, 100 / size);
            return (
              <button
                key={k}
                type="button"
                className="hk-band"
                tabIndex={done ? -1 : 0}
                aria-label={edgeLabel(puzzle, k, counts[k])}
                style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }}
                onClick={() => toggle(k)}
              />
            );
          })}
        </div>
      )}

      <div className="btn-row hk-actions">
        <button type="button" className="btn" onClick={undo} disabled={board.history.length === 0 || done}>
          もどす
        </button>
        <button type="button" className="btn" onClick={restart} disabled={placed === 0 || done}>
          最初から
        </button>
        <button type="button" className="btn" onClick={check} disabled={placed === 0 || done}>
          チェック
        </button>
      </div>

      {/* 読み上げの 1 行。文言で行数が変わると盤が動くので、枠は常に置いて高さを固定する（画面の約束1） */}
      <p className="hk-note" aria-live="polite">
        {done && result?.unrecorded ? '今日の1問は初回の記録だけを残します（このタイムは記録しません）。' : note}
      </p>

      {done && (
        <p className="hk-share">
          <button type="button" className="btn" onClick={copyResult}>
            {copied ? 'コピーしました' : '結果をコピー'}
          </button>
          <span className="hk-share-note">コピーする文面に答え（盤の橋）は入りません。</span>
        </p>
      )}

      <details className="game-tips">
        <summary>この画面の見かた</summary>
        <p>
          <strong>島と島の間をタップ</strong>するたびに、橋が 0→1→2→0 本と切り替わります。
          間が細くて押しにくいときは、<strong>島を1つタップしてから、つなぐ相手の島をタップ</strong>しても架けられます
          （相手の島をもう一度タップで2本目）。押しにくければ、上の段階で 7×7（かんたん）や 9×9 を選んでください。
          数字ぶんの橋が架かった島は塗りが薄くなり、数字が太字になります。
          「チェック」は数字を超えた島と交差に印を付けるだけで、<strong>正解は教えません</strong>。
          {mode === 'daily'
            ? '「今日の1問」は日付から作る全員共通の問題で、途中の盤と連続日数はこの端末のブラウザに保存しています（端末やブラウザを変えると引き継げません）。'
            : '途中の盤はこの端末のブラウザに保存していて、再読み込みしても戻ります。'}
        </p>
      </details>
    </div>
  );
}
