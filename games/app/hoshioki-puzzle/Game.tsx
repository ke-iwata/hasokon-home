'use client';

/**
 * 星置きパズルの画面。
 *
 * 仕様: docs/features/game-hoshioki-puzzle.md
 *
 * 盤の生成・矛盾の判定・自動×の範囲は、すべて `lib/hoshioki-puzzle.ts`（純関数）が持つ。
 * ここは**入力（タップ・右クリック・長押し）と描画だけ**を持つ。
 *
 * **答えは画面に出さない。** ヒントは無く、`puzzle.solution` も参照しない
 * （矛盾しているかどうかは、置かれた星だけから判定できる）。
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  autoCrossTargets,
  borderOf,
  colOf,
  CROSS,
  cycleMark,
  dailyPuzzle,
  emptyMarks,
  EMPTY,
  findConflicts,
  generateFor,
  isSolved,
  MODE_ORDER,
  MODES,
  rowOf,
  shareText,
  STAR,
  starCount,
  variantOf,
  type Mark,
  type Mode,
  type Puzzle,
} from '@/lib/hoshioki-puzzle';
import { currentStreak, localDateKey, nextStreak } from '@/lib/daily';
import { SITE_URL } from '@/lib/registry';
import { trackToolUse } from '@/lib/analytics';
import { BestBadge, RecordStrip, useRecords, useStopwatch } from '@/app/_records/Records';
import { formatTime, type Improved } from '@/lib/records';

/** 長押しで★にするまでの時間（ms）。スクロールの誤爆と文脈メニューの両方を避けられる長さ */
const LONG_PRESS_MS = 450;

interface Result {
  timeMs: number;
  improved: Improved;
  /** 日替わりのときだけ入る連続日数 */
  streak?: number;
}

export default function Game() {
  const [mode, setMode] = useState<Mode>('easy');
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [history, setHistory] = useState<Mark[][]>([]);
  const [autoCross, setAutoCross] = useState(true);
  const [checked, setChecked] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  /**
   * 「今日」は**端末のローカル日付**。マウント後に決める
   * （静的書き出しのHTMLに焼き付けると、日付が変わっても古いままになる）。
   */
  const [today, setToday] = useState<string>('');

  const records = useRecords('hoshioki-puzzle');
  const variant = variantOf(mode);
  const entry = records.entry(variant);
  const timer = useStopwatch();
  const counted = useRef(false);
  const notified = useRef(false);
  /** 長押しで★にしたあとに続けて飛んでくる click を1回だけ捨てるための目印 */
  const longPressed = useRef(false);
  const pressTimer = useRef<number | null>(null);

  const newGame = useCallback(
    (next: Mode, dateKey: string) => {
      // 9×9 は生成に数百ミリ秒かかることがあるので、いったん盤を消して
      // 「作成中」を描いてから作る（押しても反応しないように見えるのを防ぐ）
      setPuzzle(null);
      setMarks([]);
      setHistory([]);
      setResult(null);
      setChecked('');
      setCopied(false);
      counted.current = false;
      notified.current = false;
      timer.reset();
      window.setTimeout(() => {
        const made = next === 'daily' ? dailyPuzzle(dateKey) : generateFor(next, Math.random).puzzle;
        setPuzzle(made);
        setMarks(emptyMarks(made.size));
        trackToolUse('hoshioki-puzzle', `new-${next}`);
      }, 0);
    },
    [timer],
  );

  // 生成はマウント後に行う（静的書き出し時にサーバーとクライアントで盤面が食い違うため）
  useEffect(() => {
    const key = localDateKey();
    setToday(key);
    newGame('easy', key);
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conflicts = useMemo(
    () => (puzzle ? findConflicts(puzzle, marks) : new Set<number>()),
    [puzzle, marks],
  );
  const done = puzzle !== null && marks.length > 0 && isSolved(puzzle, marks);

  // クリアの記録。時間は止めた瞬間の値で固定し、以後動かさない
  useEffect(() => {
    if (!done || notified.current || !puzzle) return;
    notified.current = true;
    trackToolUse('hoshioki-puzzle', `clear-${mode}`);
    const timeMs = timer.stop();
    const clearedOn = mode === 'daily' ? today : undefined;
    // 連続日数は記録に入れる前の値から数える（表示と保存を同じ計算にそろえる）
    const streak =
      mode === 'daily' ? nextStreak(entry.lastClearedOn, today, entry.streak) : undefined;
    const { improved } = records.finish({ outcome: 'win', timeMs, clearedOn }, variant);
    setResult({ timeMs, improved, streak });
  }, [done, mode, today, puzzle, records, timer, variant, entry]);

  const change = useCallback(
    (update: (before: Mark[]) => Mark[]) => {
      if (!counted.current) {
        counted.current = true;
        records.start(variant);
      }
      timer.begin();
      setChecked('');
      setMarks((before) => {
        setHistory((h) => [...h, before]);
        return update(before);
      });
    },
    [records, timer, variant],
  );

  /** タップ：空 → × → ★ → 空 */
  const tap = useCallback(
    (index: number) => {
      if (!puzzle || done) return;
      change((before) => {
        const next = [...before];
        next[index] = cycleMark(before[index]);
        if (next[index] === STAR && autoCross) {
          for (const i of autoCrossTargets(puzzle, index, next)) next[i] = CROSS;
        }
        return next;
      });
    },
    [puzzle, done, autoCross, change],
  );

  /** 右クリック・長押し：いきなり★（すでに★なら空に戻す） */
  const toggleStar = useCallback(
    (index: number) => {
      if (!puzzle || done) return;
      change((before) => {
        const next = [...before];
        next[index] = before[index] === STAR ? EMPTY : STAR;
        if (next[index] === STAR && autoCross) {
          for (const i of autoCrossTargets(puzzle, index, next)) next[i] = CROSS;
        }
        return next;
      });
    },
    [puzzle, done, autoCross, change],
  );

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      setMarks(h[h.length - 1]);
      setChecked('');
      return h.slice(0, -1);
    });
  }, []);

  const restart = useCallback(() => {
    if (!puzzle) return;
    setMarks(emptyMarks(puzzle.size));
    setHistory([]);
    setChecked('');
    setResult(null);
    counted.current = false;
    notified.current = false;
    timer.reset();
  }, [puzzle, timer]);

  /** チェック：**答えは教えない**。ルールに反している星があるかどうかだけ */
  const check = useCallback(() => {
    if (!puzzle) return;
    const stars = starCount(marks);
    if (conflicts.size > 0) {
      setChecked('ルールに反している星があります（赤いマス）。');
      return;
    }
    setChecked(
      stars < puzzle.size
        ? `ここまでは矛盾ありません。あと${puzzle.size - stars}つ置けます。`
        : '矛盾ありません。',
    );
  }, [puzzle, marks, conflicts]);

  const copyResult = useCallback(() => {
    if (!puzzle || !result) return;
    const text = shareText({
      mode,
      size: puzzle.size,
      timeMs: result.timeMs,
      dateKey: mode === 'daily' ? today : undefined,
      streak: result.streak,
      url: `${SITE_URL}/hoshioki-puzzle/`,
    });
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        trackToolUse('hoshioki-puzzle', 'copy-result');
      },
      () => setCopied(false),
    );
  }, [puzzle, result, mode, today]);

  // 長押しの後始末（押したまま画面を離れてもタイマーが残らないように）
  const clearPress = useCallback(() => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }, []);
  useEffect(() => clearPress, [clearPress]);

  const streakNow = currentStreak(entry.lastClearedOn, today, entry.streak);
  const remaining = puzzle ? puzzle.size - starCount(marks) : 0;

  return (
    // 盤の大きさを決める変数（--chrome / --board-max）はこの入れ物に置いてある。
    // 盤と「生成中」の幕が同じ値を継承するようにするため（app/globals.css の .hp-game）
    <div className="card hp-game">
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
        <button
          type="button"
          className="btn"
          onClick={() => newGame(mode, today)}
          /* 今日の1問は全員同じ問題なので、作り直しても同じ盤が出る（やり直しになる） */
        >
          {mode === 'daily' ? 'やり直す' : '新しい問題'}
        </button>
      </div>

      <RecordStrip
        items={[
          ...(entry.bestTimeMs
            ? [{ label: `${MODES[mode].label}のベスト`, value: formatTime(entry.bestTimeMs) }]
            : []),
          ...(entry.wins ? [{ label: 'クリア', value: `${entry.wins}回` }] : []),
          ...(mode === 'daily' && streakNow > 0
            ? [{ label: '連続', value: `${streakNow}日` }]
            : []),
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
            のこり{remaining}つ
          </span>
          <span>⏱ {formatTime(timer.ms)}</span>
        </p>
      )}

      {puzzle === null ? (
        <div className="hp-loading">問題を作っています…</div>
      ) : (
        <div
          className="hp-board"
          role="grid"
          aria-label="星置きパズルの盤面"
          style={{ '--hp-cols': puzzle.size } as CSSProperties}
          /* iOS の文脈メニュー・テキスト選択と当たるので、盤の上では既定の動作を止める */
          onContextMenu={(e) => e.preventDefault()}
        >
          {marks.map((mark, i) => {
            const edge = borderOf(puzzle, i);
            const cls = [
              'hp-cell',
              `hp-r${puzzle.regions[i] % 9}`,
              edge.top ? 'edge-t' : '',
              edge.right ? 'edge-r' : '',
              edge.bottom ? 'edge-b' : '',
              edge.left ? 'edge-l' : '',
              conflicts.has(i) ? 'conflict' : '',
            ]
              .filter(Boolean)
              .join(' ');
            const label = `${rowOf(i, puzzle.size) + 1}行${colOf(i, puzzle.size) + 1}列 ${
              mark === STAR ? '星' : mark === CROSS ? 'バツ' : '空'
            }`;
            return (
              <button
                key={i}
                type="button"
                className={cls}
                aria-label={label}
                onClick={() => {
                  if (longPressed.current) {
                    longPressed.current = false;
                    return;
                  }
                  tap(i);
                }}
                onContextMenu={(e) => {
                  e.preventDefault(); // PCの右クリックで★
                  toggleStar(i);
                }}
                onPointerDown={(e) => {
                  if (e.pointerType === 'mouse') return; // 長押しはタッチとペンだけ
                  clearPress();
                  pressTimer.current = window.setTimeout(() => {
                    longPressed.current = true;
                    toggleStar(i);
                  }, LONG_PRESS_MS);
                }}
                onPointerUp={clearPress}
                onPointerLeave={clearPress}
                onPointerCancel={clearPress}
              >
                {mark === STAR ? '★' : mark === CROSS ? '×' : ''}
              </button>
            );
          })}
        </div>
      )}

      <div className="btn-row hp-actions">
        <button type="button" className="btn" onClick={undo} disabled={history.length === 0}>
          もどす
        </button>
        <button type="button" className="btn" onClick={restart}>
          最初から
        </button>
        <button type="button" className="btn" onClick={check} disabled={!puzzle}>
          チェック
        </button>
        <label className="hp-toggle">
          <input
            type="checkbox"
            checked={autoCross}
            onChange={(e) => setAutoCross(e.target.checked)}
          />
          星を置いたら自動で×
        </label>
      </div>

      {/* 文言で行数が変わると盤が動くので、枠は常に置いて高さを固定する（画面の約束1） */}
      <p className="hp-note">{checked}</p>

      {done && (
        <p className="hp-share">
          <button type="button" className="btn" onClick={copyResult}>
            {copied ? 'コピーしました' : '結果をコピー'}
          </button>
          <span className="hp-share-note">
            コピーする文面に答え（星の位置）は入りません。
          </span>
        </p>
      )}

      <details className="game-tips">
        <summary>この画面の見かた</summary>
        <p>
          マスをタップするたびに <strong>空 → ×（ここには置かない印）→ ★ → 空</strong> と変わります。
          PCの右クリック、スマホの長押しでいきなり★になります。
          太い線が領域の区切りです。ルールに反している星は赤くなります
          （<strong>正解かどうかは教えません</strong>）。
          {mode === 'daily'
            ? '「今日の1問」は日付から作る全員共通の問題で、連続日数はこの端末のブラウザに保存しています（端末やブラウザを変えると引き継げません）。'
            : ''}
        </p>
      </details>
    </div>
  );
}
