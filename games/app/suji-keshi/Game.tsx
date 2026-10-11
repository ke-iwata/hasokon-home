'use client';

/**
 * 数字けしの画面。
 *
 * 仕様: docs/features/game-suji-keshi.md
 *
 * 盤の生成・消せる組の判定・書き足し・終わりの判定は、すべて `lib/suji-keshi.ts`（純関数）が持つ。
 * ここは**入力（タップ・キー）と描画だけ**を持つ。
 *
 * - **列数は面を始めるときに決め、遊んでいる途中では変えない。** 9 列は盤の幅が 9 × 44px ＋ 隙間を
 *   取れるときだけ選べる。途中で幅が足りなくなっても横にスクロールさせず、盤を縮めて注意を出し、
 *   次の面を始めるときに判定し直して 6 列に戻す
 * - 盤の枠は高さを固定し、**枠の中だけを縦にスクロール**する（書き足しで盤が伸びても、見出し・ボタンは動かない）
 * - 書き足した直後は最後の行まで送る。ただし 1 つ目のマスを選んでいる間は送らず、選択が外れてから送る
 * - ヒントの光り・組める位置の薄い印は演出なので、ここの状態に置く（`lib/` には入れない）
 * - 記録は `records.finish()` に乗せる。今日の 1 面は**その日の 1 回目だけ**を記録し、
 *   1 回目かどうかは `lib/suji-keshi.ts` の `DAILY_PLAYED_KEY`（今日の日付を 1 つだけ）で見る
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import {
  append,
  APPENDS,
  canPair,
  canUseNineCols,
  cellLabel,
  colsOf,
  dailyBoard,
  generate,
  hintPair,
  HINT_PENALTY_MS,
  isCleared,
  isFirstDailyPlay,
  isStuck,
  MODE_LABEL,
  MODE_ORDER,
  moveCursor,
  partnersOf,
  readDailyPlayed,
  remaining,
  removePair,
  shareText,
  totalTimeMs,
  variantOf,
  writeDailyPlayed,
  type Board,
  type Cell,
  type Mode,
} from '@/lib/suji-keshi';
import { currentStreak, localDateKey, mulberry32, nextStreak } from '@/lib/daily';
import { SITE_URL } from '@/lib/registry';
import { trackToolUse } from '@/lib/analytics';
import { BestBadge, RecordStrip, useRecords, useStopwatch } from '@/app/_records/Records';
import { browserStorage, formatTime, type Improved } from '@/lib/records';

/** ヒントで光らせる長さ（ms） */
const HINT_FLASH_MS = 1500;
/** マスの隙間（px）。CSS の `.sjk-board` の `gap` と同じ値 */
const GAP_PX = 3;
/** 広い画面でのマスの大きさの上限（px）。CSS の `.sjk-board` の `max-width` と同じ値 */
const CELL_MAX_PX = 64;
/** 押す先の下限（px）。games/CLAUDE.md の画面の約束 4 */
const TAP_MIN_PX = 44;

const KEY_DIR: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

type Phase = 'loading' | 'playing' | 'won' | 'lost';

interface Result {
  timeMs: number;
  appendsUsed: number;
  /** 記録した結果か（今日の 1 面の 2 回目以降・同じ盤のやり直しは記録しない） */
  recorded: boolean;
  improved: Improved | null;
  /** 日替わりで記録したときだけ入る連続日数 */
  streak?: number;
}

/** 盤の幅（px）。広い画面では 1 マス `CELL_MAX_PX` までに抑える */
function boardWidthFor(wrapWidth: number, cols: number): number {
  return Math.min(wrapWidth, cols * CELL_MAX_PX + (cols - 1) * GAP_PX);
}

export default function Game() {
  const [mode, setMode] = useState<Mode>('daily');
  const [phase, setPhase] = useState<Phase>('loading');
  /** 最初に出した盤（「同じ盤でやり直す」で戻す先） */
  const [initial, setInitial] = useState<Board | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [selected, setSelected] = useState<Cell | null>(null);
  const [cursor, setCursor] = useState<Cell>(0);
  const [hints, setHints] = useState(0);
  const [hint, setHint] = useState<readonly Cell[] | null>(null);
  const [hintAppend, setHintAppend] = useState(false);
  /** 1 つ目を選んだら組める位置を薄く示す（既定オフ） */
  const [showPartners, setShowPartners] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  /** この盤の結果を記録するか（新しい盤・今日の 1 面の 1 回目だけ true） */
  const [recordable, setRecordable] = useState(true);
  /** 盤の入れ物の幅（px）。9 列を選べるかとマスの大きさを決める */
  const [wrapWidth, setWrapWidth] = useState(0);
  /**
   * 「今日」は**端末のローカル日付**。マウント後に決める
   * （静的書き出しのHTMLに焼き付けると、日付が変わっても古いままになる）。
   */
  const [today, setToday] = useState('');

  const records = useRecords('suji-keshi');
  const variant = variantOf(mode);
  const entry = records.entry(variant);
  const timer = useStopwatch();
  const counted = useRef(false);
  const hintTimer = useRef<number | undefined>(undefined);
  /** 書き足したあと、最後の行まで送るのを待っているか（選んでいる間は送らない） */
  const pendingScroll = useRef(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // 盤の入れ物の幅を測る（回転・Split View で変わる）
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWrapWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWrapWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const resetPlay = useCallback(
    (b: Board, canRecord: boolean) => {
      setBoard(b);
      setSelected(null);
      setHints(0);
      setHint(null);
      setHintAppend(false);
      setResult(null);
      setCopied(false);
      setRecordable(canRecord);
      setCursor(0);
      counted.current = false;
      pendingScroll.current = false;
      frameRef.current?.scrollTo({ top: 0 });
      timer.reset();
      setPhase('playing');
      // 盤が出た瞬間から数える（探している時間も含めて「何秒で消したか」）
      timer.begin();
    },
    [timer],
  );

  const newGame = useCallback(
    (requested: Mode, dateKey: string) => {
      // 9 列を選べるかは面を始めるときに判定し直す。幅が足りなければ次の面から 6 列に戻す
      const width = wrapRef.current?.clientWidth ?? 0;
      const next: Mode = requested === '9col' && !canUseNineCols(width) ? '6col' : requested;
      setMode(next);
      setPhase('loading');
      setBoard(null);
      timer.reset();
      // 生成（解けることの検査込み）は「作成中」を描いてから行う
      window.setTimeout(() => {
        const b =
          next === 'daily'
            ? dailyBoard(dateKey)
            : generate(colsOf(next), mulberry32(Math.floor(Math.random() * 0x7fffffff))).board;
        setInitial(b);
        resetPlay(b, next === 'daily' ? isFirstDailyPlay(readDailyPlayed(browserStorage()), dateKey) : true);
        trackToolUse('suji-keshi', `new-${next}`);
      }, 0);
    },
    [timer, resetPlay],
  );

  // 生成はマウント後に行う（静的書き出し時にサーバーとクライアントで盤面が食い違うため）
  useEffect(() => {
    const key = localDateKey();
    setToday(key);
    newGame('daily', key);
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => window.clearTimeout(hintTimer.current), []);

  // 書き足した直後は最後の行まで送る。1 つ目を選んでいる間は送らない（選んだマスが枠の外へ出ないように）
  useEffect(() => {
    if (!pendingScroll.current || selected !== null) return;
    pendingScroll.current = false;
    const frame = frameRef.current;
    if (frame) frame.scrollTo({ top: frame.scrollHeight, behavior: 'smooth' });
  }, [board, selected]);

  /** 決着を記録する（記録しない盤なら表示だけ） */
  const settle = useCallback(
    (won: boolean, finalBoard: Board) => {
      const timeMs = totalTimeMs(timer.stop(), hints);
      const appendsUsed = APPENDS - finalBoard.appendsLeft;
      setPhase(won ? 'won' : 'lost');
      setSelected(null);
      trackToolUse('suji-keshi', `${won ? 'clear' : 'lose'}-${mode}`);
      if (!recordable) {
        setResult({ timeMs, appendsUsed, recorded: false, improved: null });
        return;
      }
      if (won) {
        const clearedOn = mode === 'daily' ? today : undefined;
        // 連続日数は記録に入れる前の値から数える（表示と保存を同じ計算にそろえる）
        const streak = mode === 'daily' ? nextStreak(entry.lastClearedOn, today, entry.streak) : undefined;
        const { improved } = records.finish({ outcome: 'win', timeMs, clearedOn }, variant);
        setResult({ timeMs, appendsUsed, recorded: true, improved, streak });
      } else {
        records.finish({ outcome: 'loss' }, variant);
        setResult({ timeMs, appendsUsed, recorded: true, improved: null });
      }
    },
    [timer, hints, mode, recordable, today, entry, records, variant],
  );

  /** 最初の操作で記録を始める（今日の 1 面は「今日はもう遊んだ」にする。途中で読み込み直してやり直せないように） */
  const markStarted = useCallback(() => {
    if (counted.current || !recordable) return;
    counted.current = true;
    records.start(variant);
    if (mode === 'daily') writeDailyPlayed(browserStorage(), today);
  }, [recordable, records, variant, mode, today]);

  const onTap = useCallback(
    (cell: Cell) => {
      if (phase !== 'playing' || !board || board.cells[cell] == null) return;
      setCursor(cell);
      markStarted();
      if (selected === null || selected === cell) {
        setSelected(selected === cell ? null : cell);
        return;
      }
      if (!canPair(board, selected, cell)) {
        // 組めない相手を押したら、選び直しとして扱う（ミスは数えない）
        setSelected(cell);
        return;
      }
      const next = removePair(board, selected, cell) as Board;
      setBoard(next);
      setSelected(null);
      setHint(null);
      // 行が詰まると添字がずれるので、カーソルは盤の中に収める
      setCursor((c) => Math.min(c, Math.max(0, next.cells.length - 1)));
      if (isCleared(next)) settle(true, next);
      else if (isStuck(next)) settle(false, next);
    },
    [phase, board, selected, markStarted, settle],
  );

  const onAppend = useCallback(() => {
    if (phase !== 'playing' || !board || board.appendsLeft <= 0) return;
    markStarted();
    const next = append(board);
    setBoard(next);
    setHint(null);
    setHintAppend(false);
    pendingScroll.current = true;
    trackToolUse('suji-keshi', 'append');
    if (isStuck(next)) settle(false, next);
  }, [phase, board, markStarted, settle]);

  const takeHint = useCallback(() => {
    if (phase !== 'playing' || !board) return;
    const pair = hintPair(board, Math.random);
    // 消せる組が無ければ「書き足す」を光らせる（タイムは足さない）
    if (pair === null) {
      setHintAppend(true);
      window.clearTimeout(hintTimer.current);
      hintTimer.current = window.setTimeout(() => setHintAppend(false), HINT_FLASH_MS);
      return;
    }
    setHints((h) => h + 1);
    setHint(pair);
    trackToolUse('suji-keshi', 'hint');
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(null), HINT_FLASH_MS);
  }, [phase, board]);

  /** 同じ盤でやり直す。**記録しない**（盤を覚えた状態なので） */
  const retrySame = useCallback(() => {
    if (!initial) return;
    resetPlay(initial, false);
    trackToolUse('suji-keshi', `retry-${mode}`);
  }, [initial, resetPlay, mode]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!board) return;
      const dir = KEY_DIR[e.key];
      if (dir) {
        e.preventDefault();
        const next = moveCursor(board, cursor, dir);
        setCursor(next);
        cellRefs.current[next]?.focus();
      } else if (e.key === 'Escape') {
        setSelected(null);
      }
    },
    [board, cursor],
  );

  const copyResult = useCallback(() => {
    if (!result) return;
    const text = shareText({
      mode,
      appendsUsed: result.appendsUsed,
      timeMs: result.timeMs,
      dateKey: mode === 'daily' ? today : undefined,
      url: `${SITE_URL}/suji-keshi/`,
    });
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        trackToolUse('suji-keshi', 'copy-result');
      },
      () => setCopied(false),
    );
  }, [result, mode, today]);

  const cols = board?.cols ?? colsOf(mode);
  const boardWidth = boardWidthFor(wrapWidth, cols);
  const cellPx = wrapWidth > 0 ? (boardWidth - (cols - 1) * GAP_PX) / cols : CELL_MAX_PX;
  const tooNarrow = phase === 'playing' && cols === 9 && cellPx < TAP_MIN_PX;
  const nineAvailable = canUseNineCols(wrapWidth);
  const appendsLeft = board?.appendsLeft ?? APPENDS;
  const left = board ? remaining(board) : 0;
  const partners = showPartners && selected !== null && board && phase === 'playing' ? new Set(partnersOf(board, selected)) : null;
  const shownMs = phase === 'won' || phase === 'lost' ? (result?.timeMs ?? 0) : totalTimeMs(timer.ms, hints);
  const streakNow = currentStreak(entry.lastClearedOn, today, entry.streak);

  let note = '';
  if (phase === 'won') {
    const body = `書き足し${result?.appendsUsed ?? 0}回・${formatTime(shownMs)}`;
    note = result?.recorded ? body : `${body}　練習（記録なし）`;
  } else if (phase === 'lost') {
    note = result?.recorded ? '消せる組がなくなりました' : '消せる組がなくなりました　練習（記録なし）';
  } else if (tooNarrow) {
    note = '画面を広げるか、次の面から6列になります';
  } else if (phase === 'playing' && !recordable) {
    note = '練習（記録なし）';
  }

  return (
    // 盤の枠の高さを決める変数（--chrome）はこの入れ物に置いてある（app/globals.css の .sjk-game）
    <div className="card sjk-game">
      <div className="btn-row sjk-modes">
        <div className="seg" role="group" aria-label="遊びかた">
          {MODE_ORDER.map((m) => {
            const disabled = m === '9col' && !nineAvailable;
            return (
              <button
                key={m}
                type="button"
                className={m === mode ? 'active' : ''}
                aria-pressed={m === mode}
                disabled={disabled}
                title={disabled ? '9列は画面の幅が広いときだけ選べます' : undefined}
                onClick={() => newGame(m, today)}
              >
                {MODE_LABEL[m]}
              </button>
            );
          })}
        </div>
        <label className="sjk-option">
          <input type="checkbox" checked={showPartners} onChange={(e) => setShowPartners(e.target.checked)} />
          組める所を示す
        </label>
      </div>

      <div className="sjk-status">
        <span className="sjk-left">のこり{left}</span>
        <span className="sjk-time">⏱ {formatTime(shownMs)}</span>
        {/* ヒントの枠は常に置く（出し入れで行が動かないように。画面の約束1） */}
        <button
          type="button"
          className="btn sjk-hint-btn"
          onClick={takeHint}
          disabled={phase !== 'playing'}
          aria-label={`ヒント（タイムに${HINT_PENALTY_MS / 1000}秒足されます）`}
        >
          ヒント<span className="sjk-hint-penalty">+{HINT_PENALTY_MS / 1000}秒</span>
        </button>
      </div>
      <p className="sjk-live" aria-live="polite">
        {phase === 'won'
          ? '盤が空になりました'
          : phase === 'lost'
            ? '消せる組がなくなりました'
            : board
              ? `のこり${left}個、書き足しあと${appendsLeft}回${selected !== null ? `、${cellLabel(board, selected)}を選択中` : ''}`
              : ''}
      </p>

      <div className="sjk-wrap" ref={wrapRef}>
        {/* 枠の高さは固定。書き足しで盤が伸びても、枠の中だけが縦にスクロールする（画面の約束1） */}
        <div className="sjk-frame" ref={frameRef}>
          {phase === 'loading' || !board ? (
            <div className="sjk-loading">盤を作っています…</div>
          ) : (
            <div
              className={`sjk-board${phase === 'won' ? ' done' : ''}`}
              role="group"
              aria-label={`数字けしの盤（横${cols}列）。矢印キーで移動、Enterで選びます`}
              style={
                {
                  '--sjk-cols': cols,
                  '--sjk-font': `${Math.round(Math.min(cellPx, CELL_MAX_PX) * 0.6)}px`,
                } as CSSProperties
              }
              onKeyDown={onKeyDown}
              onContextMenu={(e) => e.preventDefault()}
            >
              {board.cells.map((v, i) => {
                const cls = [
                  'sjk-cell',
                  v == null ? 'gone' : '',
                  selected === i ? 'selected' : '',
                  hint?.includes(i) ? 'hint' : '',
                  partners?.has(i) ? 'partner' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <button
                    key={i}
                    ref={(el) => {
                      cellRefs.current[i] = el;
                    }}
                    type="button"
                    className={cls}
                    tabIndex={i === cursor ? 0 : -1}
                    aria-label={cellLabel(board, i)}
                    aria-pressed={v == null ? undefined : selected === i}
                    onFocus={() => setCursor(i)}
                    onClick={() => onTap(i)}
                  >
                    {v ?? ''}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 文言で行数が変わると盤が動くので、枠は常に置いて高さを固定する（画面の約束1） */}
      <p className={`sjk-note${phase === 'won' ? ' win' : phase === 'lost' ? ' lose' : tooNarrow ? ' warn' : ''}`}>
        {phase === 'won' ? '🎉 クリア！ ' : ''}
        {note}
        {phase === 'won' && result?.streak ? `　連続${result.streak}日` : ''}
        {phase === 'won' ? <BestBadge improved={result?.improved ?? null} /> : null}
      </p>

      <div className="btn-row sjk-actions">
        {phase === 'lost' ? (
          <>
            <button type="button" className="btn btn-primary" onClick={retrySame}>
              同じ盤でやり直す
            </button>
            {mode !== 'daily' ? (
              <button type="button" className="btn" onClick={() => newGame(mode, today)}>
                新しい盤
              </button>
            ) : null}
          </>
        ) : phase === 'won' ? (
          <>
            <button type="button" className="btn btn-primary" onClick={copyResult}>
              {copied ? 'コピーしました' : '結果をコピー'}
            </button>
            {mode !== 'daily' ? (
              <button type="button" className="btn" onClick={() => newGame(mode, today)}>
                新しい盤
              </button>
            ) : (
              <button type="button" className="btn" onClick={retrySame}>
                もう一度（練習）
              </button>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              className={`btn btn-primary sjk-append${hintAppend ? ' hint' : ''}`}
              onClick={onAppend}
              disabled={phase !== 'playing' || appendsLeft <= 0}
            >
              書き足す（あと{appendsLeft}回）
            </button>
            {mode !== 'daily' ? (
              <button type="button" className="btn" onClick={() => newGame(mode, today)}>
                新しい盤
              </button>
            ) : null}
          </>
        )}
      </div>

      <RecordStrip
        items={[
          ...(entry.bestTimeMs ? [{ label: `${MODE_LABEL[mode]}のベスト`, value: formatTime(entry.bestTimeMs) }] : []),
          ...(entry.wins ? [{ label: 'クリア', value: `${entry.wins}回` }] : []),
          ...(mode === 'daily' && streakNow > 0 ? [{ label: '連続', value: `${streakNow}日` }] : []),
        ]}
      />

      <details className="game-tips">
        <summary>この画面の見かた</summary>
        <p>
          数字を2つ順にタップして、<strong>同じ数</strong>か<strong>足して10</strong>なら消えます。
          消せるのは縦・横・斜めに並ぶ2つか、読む順（行の終わりと次の行の始めもつながる）で前後になる2つで、
          間に消えたマスしか無ければ離れていても消せます。詰まったら「書き足す」で残りの数字を盤の後ろに書き足せます（1面に{APPENDS}回まで）。
          ヒントは消せる組を1つ光らせます（1回につきタイムに+{HINT_PENALTY_MS / 1000}秒）。
          {mode === 'daily'
            ? '「今日の1面」は日付から作る全員共通の盤（6列）で、記録になるのはその日の1回目だけです。連続日数はこの端末のブラウザに保存しています。'
            : '同じ盤でやり直したときは練習扱いで、記録は付きません。記録は6列と9列で分けています。'}
        </p>
      </details>
    </div>
  );
}
