'use client';

/**
 * 間違い探しの画面。
 *
 * 仕様: docs/features/game-machigai-sagashi.md
 *
 * 絵の生成・違いの注入・当たり判定・ヒントの対象・タイムの計算は、すべて
 * `lib/machigai-sagashi.ts`（純関数）が持つ。ここは**入力（タップ・キー）と描画だけ**を持つ。
 *
 * - 左右の絵は同じ座標系（viewBox 320×240）。どちらをタップしても同じ `hitTest` に渡す
 * - キーボードは左右の図形のマスの和集合を Tab で辿り、Enter でそのマスを調べる。
 *   **読み上げは位置だけ**（色・形を読むと、左右を読み比べて違いが分かってしまう）
 * - ヒントの点滅は演出なので、ここの状態に置く（`lib/` には入れない）
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import {
  cellHeight,
  cellLabel,
  cellWidth,
  COLORS,
  dailyPuzzle,
  difficultyOf,
  focusCells,
  hintAvailable,
  hintTarget,
  hitCell,
  hitTest,
  isStroke,
  makePuzzle,
  MISS_STREAK_NOTE,
  MODE_LABEL,
  MODE_ORDER,
  shapePath,
  shareText,
  totalTimeMs,
  variantOf,
  VIEW_H,
  VIEW_W,
  HINT_AFTER_MS,
  HINT_PENALTY_MS,
  type Mode,
  type Puzzle,
  type Scene,
} from '@/lib/machigai-sagashi';
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

const MISS_NOTE = '違いの近くを少し大きめに押してみてください（外れても減点はありません）。';

/** 1 枚の絵。`prefix` は模様の id を左右で分けるため（同じ文書に 2 枚あるので） */
function Picture({
  scene,
  prefix,
  puzzle,
  found,
  flash,
  focusCell,
}: {
  scene: Scene;
  prefix: string;
  puzzle: Puzzle;
  found: ReadonlySet<number>;
  flash: number | null;
  focusCell: number | null;
}) {
  const cw = cellWidth(scene);
  const ch = cellHeight(scene);
  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="ms-svg" aria-hidden="true" focusable="false">
      <defs>
        <pattern id={`${prefix}-stripe`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="2.2" height="5" fill="#fff" fillOpacity="0.85" />
        </pattern>
        <pattern id={`${prefix}-dots`} width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1.5" fill="#fff" fillOpacity="0.9" />
        </pattern>
      </defs>
      <rect className="ms-bg" width={VIEW_W} height={VIEW_H} />
      {scene.shapes.map((s) => {
        const d = shapePath(s.kind, s.size);
        const color = COLORS[s.color];
        return (
          <g key={s.cell} transform={`translate(${s.x} ${s.y}) rotate(${s.rotation})`}>
            {isStroke(s.kind) ? (
              <path d={d} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" />
            ) : (
              <>
                <path d={d} fill={color} fillRule="evenodd" />
                {s.pattern !== 'none' ? <path d={d} fill={`url(#${prefix}-${s.pattern})`} /> : null}
              </>
            )}
          </g>
        );
      })}
      {focusCell !== null ? (
        <rect
          className="ms-focus"
          x={(focusCell % scene.cols) * cw + 2}
          y={Math.floor(focusCell / scene.cols) * ch + 2}
          width={cw - 4}
          height={ch - 4}
          rx={6}
        />
      ) : null}
      {puzzle.differences.map((d, i) =>
        found.has(i) ? (
          <circle key={`f${i}`} className="ms-found" cx={d.x} cy={d.y} r={d.radius} />
        ) : flash === i ? (
          <circle key={`h${i}`} className="ms-hint" cx={d.x} cy={d.y} r={d.radius + 6} />
        ) : null,
      )}
    </svg>
  );
}

export default function Game() {
  const [mode, setMode] = useState<Mode>('daily');
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [found, setFound] = useState<ReadonlySet<number>>(new Set());
  const [hints, setHints] = useState(0);
  const [flash, setFlash] = useState<number | null>(null);
  const [focusCell, setFocusCell] = useState<number | null>(null);
  const [misses, setMisses] = useState(0);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  /**
   * 「今日」は**端末のローカル日付**。マウント後に決める
   * （静的書き出しのHTMLに焼き付けると、日付が変わっても古いままになる）。
   */
  const [today, setToday] = useState('');

  const records = useRecords('machigai-sagashi');
  const variant = variantOf(mode);
  const entry = records.entry(variant);
  const timer = useStopwatch();
  const counted = useRef(false);
  const notified = useRef(false);
  /** 誤タップの連続回数と、注意を出し済みか（注意は 1 枚に 1 度だけ） */
  const missStreak = useRef(0);
  const missNoted = useRef(false);
  const flashTimer = useRef<number | undefined>(undefined);

  const newGame = useCallback(
    (next: Mode, dateKey: string) => {
      setFound(new Set());
      setHints(0);
      setFlash(null);
      setMisses(0);
      setResult(null);
      setNote('');
      setCopied(false);
      counted.current = false;
      notified.current = false;
      missStreak.current = 0;
      missNoted.current = false;
      timer.reset();
      const made =
        next === 'daily' ? dailyPuzzle(dateKey) : makePuzzle((Math.random() * 2 ** 32) | 0, difficultyOf(next));
      setPuzzle(made);
      // 絵が出た瞬間から数える（見比べている時間も含めて「何秒で見つけたか」）
      timer.begin();
      trackToolUse('machigai-sagashi', `new-${next}`);
    },
    [timer],
  );

  // 生成はマウント後に行う（静的書き出し時にサーバーとクライアントで絵が食い違うため）
  useEffect(() => {
    const key = localDateKey();
    setToday(key);
    newGame('daily', key);
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  const total = puzzle?.differences.length ?? 0;
  const left = total - found.size;
  const done = puzzle !== null && found.size === total;

  // クリアの記録。ヒントのペナルティを足した値を記録と表示の両方に使う
  useEffect(() => {
    if (!done || notified.current || !puzzle) return;
    notified.current = true;
    trackToolUse('machigai-sagashi', `clear-${mode}`);
    const timeMs = totalTimeMs(timer.stop(), hints);
    const clearedOn = mode === 'daily' ? today : undefined;
    // 連続日数は記録に入れる前の値から数える（表示と保存を同じ計算にそろえる）
    const streak = mode === 'daily' ? nextStreak(entry.lastClearedOn, today, entry.streak) : undefined;
    const { improved } = records.finish({ outcome: 'win', timeMs, clearedOn }, variant);
    setResult({ timeMs, improved, streak });
  }, [done, mode, today, puzzle, records, timer, variant, entry, hints]);

  /** 当たり（index）か外れ（null）を反映する。1 回でも押したら 1 プレイと数える */
  const judge = useCallback(
    (hit: number | null) => {
      if (!puzzle || done) return;
      if (!counted.current) {
        counted.current = true;
        records.start(variant);
      }
      if (hit === null) {
        setMisses((m) => m + 1);
        missStreak.current += 1;
        if (missStreak.current >= MISS_STREAK_NOTE && !missNoted.current) {
          missNoted.current = true;
          setNote(MISS_NOTE);
        }
        return;
      }
      missStreak.current = 0;
      setNote('');
      if (flash === hit) setFlash(null);
      setFound((prev) => new Set(prev).add(hit));
    },
    [puzzle, done, records, variant, flash],
  );

  /**
   * 絵のタップ。**`click` で取る**（`pointerdown` だと、絵の上から始めたスクロールの指の置き始めが
   * そのまま判定され、スクロールしただけで違いが見つかってしまう。#314 のレビュー）。
   * ブラウザはスクロール・長押しを click にしないので、それだけで区別できる。
   * `detail === 0` はキーボード由来の click（左の絵の中の `.ms-key` の Enter が泡立ってきたもの）なので無視する
   */
  const onPictureClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!puzzle || done || e.detail === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * VIEW_W;
      const y = ((e.clientY - rect.top) / rect.height) * VIEW_H;
      judge(hitTest({ x, y }, puzzle.differences, found));
    },
    [puzzle, done, found, judge],
  );

  const onCell = useCallback(
    (cell: number) => {
      if (!puzzle) return;
      judge(hitCell(cell, puzzle.differences, found));
    },
    [puzzle, found, judge],
  );

  const takeHint = useCallback(() => {
    if (!puzzle || done) return;
    const target = hintTarget(puzzle.differences, found);
    if (target === null) return;
    setHints((h) => h + 1);
    setFlash(target);
    trackToolUse('machigai-sagashi', 'hint');
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1000);
  }, [puzzle, done, found]);

  const copyResult = useCallback(() => {
    if (!result) return;
    const text = shareText({
      mode,
      timeMs: result.timeMs,
      hints,
      dateKey: mode === 'daily' ? today : undefined,
      streak: result.streak,
      url: `${SITE_URL}/machigai-sagashi/`,
    });
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        trackToolUse('machigai-sagashi', 'copy-result');
      },
      () => setCopied(false),
    );
  }, [result, mode, hints, today]);

  const cells = useMemo(() => (puzzle ? focusCells(puzzle) : []), [puzzle]);
  const streakNow = currentStreak(entry.lastClearedOn, today, entry.streak);
  const shownMs = done && result ? result.timeMs : totalTimeMs(timer.ms, hints);
  const canHint = !done && hintAvailable(timer.ms);

  return (
    <div className="card ms-game">
      <div className="btn-row ms-modes">
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
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="ms-status">
        {done ? (
          <span className="ms-left ms-clear">
            🎉 クリア！
            {result?.streak ? <span className="ms-sub">連続{result.streak}日</span> : null}
            <BestBadge improved={result?.improved ?? null} />
          </span>
        ) : (
          <span className="ms-left">
            あと<strong>{left}</strong>
          </span>
        )}
        <span className="ms-time">
          ⏱ {formatTime(shownMs)}
          {hints > 0 ? <span className="ms-sub">（ヒント{hints}回）</span> : null}
        </span>
        {/* ヒントの枠は常に置く（出し入れで行が動かないように。画面の約束1） */}
        <button
          type="button"
          className="btn ms-hint-btn"
          onClick={takeHint}
          disabled={!canHint}
          style={{ visibility: canHint ? 'visible' : 'hidden' }}
          aria-label={`ヒント（タイムに${HINT_PENALTY_MS / 1000}秒足されます）`}
        >
          ヒント<span className="ms-hint-penalty">+{HINT_PENALTY_MS / 1000}秒</span>
        </button>
        <button type="button" className="btn ms-new-btn" onClick={() => newGame(mode, today)}>
          {/* 今日の1枚は全員同じ絵なので、作り直しても同じ絵が出る（やり直しになる） */}
          {mode === 'daily' ? 'やり直す' : '新しい絵'}
        </button>
      </div>
      <p className="ms-live" aria-live="polite">
        {puzzle ? (done ? '全部見つけました' : `あと${left}`) : ''}
      </p>

      {puzzle === null ? (
        <div className="ms-loading">絵を作っています…</div>
      ) : (
        <div className={`ms-pics${done ? ' done' : ''}`}>
          <div
            className="ms-pic"
            onClick={onPictureClick}
            onContextMenu={(e) => e.preventDefault()}
          >
            <Picture scene={puzzle.left} prefix="ms-l" puzzle={puzzle} found={found} flash={flash} focusCell={focusCell} />
            {/* キーボード・読み上げ用のマス。指では押せない（pointer-events: none）ので、タップは上の判定に届く */}
            <div className="ms-keys" role="group" aria-label={`左の絵のマス（${cells.length}か所）。Enterで調べます`}>
              {cells.map((cell) => (
                <button
                  key={cell}
                  type="button"
                  className="ms-key"
                  aria-label={cellLabel(puzzle.left.cols, cell)}
                  disabled={done}
                  style={
                    {
                      left: `${((cell % puzzle.left.cols) / puzzle.left.cols) * 100}%`,
                      top: `${(Math.floor(cell / puzzle.left.cols) / puzzle.left.rows) * 100}%`,
                      width: `${100 / puzzle.left.cols}%`,
                      height: `${100 / puzzle.left.rows}%`,
                    } as CSSProperties
                  }
                  onFocus={() => setFocusCell(cell)}
                  onBlur={() => setFocusCell((c) => (c === cell ? null : c))}
                  onClick={(e) => {
                    // 絵の click（座標での判定）まで泡立たせない
                    e.stopPropagation();
                    onCell(cell);
                  }}
                />
              ))}
            </div>
          </div>
          <div className="ms-pic" onClick={onPictureClick} onContextMenu={(e) => e.preventDefault()}>
            <Picture scene={puzzle.right} prefix="ms-r" puzzle={puzzle} found={found} flash={flash} focusCell={focusCell} />
          </div>
        </div>
      )}

      {/* 記録の帯は絵の下に置く（絵の上に置くと、2 枚が 1 画面に入らない） */}
      <RecordStrip
        items={[
          ...(entry.bestTimeMs ? [{ label: 'ベスト', value: formatTime(entry.bestTimeMs) }] : []),
          ...(entry.wins ? [{ label: 'クリア', value: `${entry.wins}回` }] : []),
          ...(mode === 'daily' && streakNow > 0 ? [{ label: '連続', value: `${streakNow}日` }] : []),
        ]}
      />

      {/* 文言で行数が変わると絵が動くので、枠は常に置いて高さを固定する（画面の約束1） */}
      <p className="ms-note">
        {note || (done ? `外れたタップ ${misses}回（減点なし）` : '')}
      </p>

      {done && (
        <p className="ms-share">
          <button type="button" className="btn" onClick={copyResult}>
            {copied ? 'コピーしました' : '結果をコピー'}
          </button>
          <span className="ms-share-note">コピーする文面に違いの場所は入りません（時間と日付だけ）。</span>
        </p>
      )}

      <details className="game-tips">
        <summary>この画面の見かた</summary>
        <p>
          2枚の絵の違うところを、<strong>どちらかの絵で押します</strong>。当たると両方の絵に丸が付きます。
          外れても減点はありません。始めてから{HINT_AFTER_MS / 1000}秒たつとヒントが使えます（1回につき+{HINT_PENALTY_MS / 1000}秒）。
          {mode === 'daily'
            ? '「今日の1枚」は日付から作る全員共通の絵で、連続日数はこの端末のブラウザに保存しています（端末やブラウザを変えると引き継げません）。'
            : ''}
        </p>
      </details>
    </div>
  );
}
