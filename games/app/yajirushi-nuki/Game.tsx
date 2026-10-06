'use client';

/**
 * 矢印ぬきの画面。
 *
 * 仕様: docs/features/game-yajirushi-nuki.md
 *
 * 盤の生成・抜けるかどうかの判定・ミスの数え方は、すべて `lib/yajirushi-nuki.ts`（純関数）が持つ。
 * ここは**入力（タップ・キー）と描画だけ**を持つ。
 *
 * - 抜ける・ぶつかるの動き、ヒントの光りは演出なので、ここの状態に置く（`lib/` には入れない）
 * - マスの読み上げは「3行4列、右向き」だけ。**抜けられるかどうかは読まない**（答えになる）
 * - 記録は `records.finish()` に乗せる。今日の 1 面は**その日の 1 回目だけ**を記録し、
 *   1 回目かどうかは `lib/yajirushi-nuki.ts` の `DAILY_PLAYED_KEY`（今日の日付を 1 つだけ）で見る
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import {
  cellLabel,
  dailyBoard,
  DIFFICULTIES,
  generateFor,
  HEARTS,
  hintCell,
  HINT_PENALTY_MS,
  isCleared,
  isFirstDailyPlay,
  isLost,
  levelOf,
  MODE_LABEL,
  MODE_ORDER,
  moveCursor,
  readDailyPlayed,
  shareText,
  startPlay,
  tapArrow,
  totalTimeMs,
  variantOf,
  writeDailyPlayed,
  type Board,
  type Cell,
  type Dir,
  type Mode,
  type PlayState,
} from '@/lib/yajirushi-nuki';
import { currentStreak, localDateKey, nextStreak } from '@/lib/daily';
import { SITE_URL } from '@/lib/registry';
import { trackToolUse } from '@/lib/analytics';
import { BestBadge, RecordStrip, useRecords, useStopwatch } from '@/app/_records/Records';
import { browserStorage, formatTime, type Improved } from '@/lib/records';

/** 抜ける矢印が滑って消えるまで（ms）。CSS の `.yn-fly` と同じ値 */
const FLY_MS = 150;
/** ぶつかって戻るまで（ms）。CSS の `.yn-bump` と同じ値 */
const BUMP_MS = 300;
/** ヒントで光らせる長さ（ms） */
const HINT_FLASH_MS = 1000;

const ROTATE: Record<Dir, number> = { right: 0, down: 90, left: 180, up: 270 };

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

type Phase = 'loading' | 'playing' | 'won' | 'lost';

interface Result {
  timeMs: number;
  /** 記録した結果か（今日の 1 面の 2 回目以降・同じ盤のやり直しは記録しない） */
  recorded: boolean;
  improved: Improved | null;
  /** 日替わりで記録したときだけ入る連続日数 */
  streak?: number;
}

/** 抜けていく矢印（盤からはもう消えている。消えるまでの残像だけを描く） */
interface Flying {
  key: number;
  cell: Cell;
  dir: Dir;
}

/** ぶつかって戻る矢印。`steps` はぶつかる相手の手前まで何マス進むか */
interface Bump {
  key: number;
  cell: Cell;
  dir: Dir;
  steps: number;
}

function ArrowGlyph({ dir }: { dir: Dir }) {
  return (
    <svg viewBox="0 0 10 10" className="yn-arrow" style={{ transform: `rotate(${ROTATE[dir]}deg)` }} aria-hidden="true" focusable="false">
      <path d="M1.8 5H8M5.4 2.4 8 5 5.4 7.6" />
    </svg>
  );
}

export default function Game() {
  const [mode, setMode] = useState<Mode>('daily');
  const [phase, setPhase] = useState<Phase>('loading');
  /** 最初に出した盤（「同じ盤でやり直す」で戻す先） */
  const [initial, setInitial] = useState<Board | null>(null);
  const [play, setPlay] = useState<PlayState | null>(null);
  const [cursor, setCursor] = useState<Cell>(0);
  const [hints, setHints] = useState(0);
  const [hint, setHint] = useState<Cell | null>(null);
  const [flying, setFlying] = useState<Flying[]>([]);
  const [bump, setBump] = useState<Bump | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  /** この盤の結果を記録するか（新しい盤・今日の 1 面の 1 回目だけ true） */
  const [recordable, setRecordable] = useState(true);
  /**
   * 「今日」は**端末のローカル日付**。マウント後に決める
   * （静的書き出しのHTMLに焼き付けると、日付が変わっても古いままになる）。
   */
  const [today, setToday] = useState('');

  const records = useRecords('yajirushi-nuki');
  const variant = variantOf(mode);
  const entry = records.entry(variant);
  const timer = useStopwatch();
  const counted = useRef(false);
  const fxKey = useRef(0);
  const hintTimer = useRef<number | undefined>(undefined);
  const bumpTimer = useRef<number | undefined>(undefined);
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const resetPlay = useCallback(
    (board: Board, canRecord: boolean) => {
      setPlay(startPlay(board));
      setHints(0);
      setHint(null);
      setFlying([]);
      setBump(null);
      setResult(null);
      setCopied(false);
      setRecordable(canRecord);
      setCursor(0);
      counted.current = false;
      timer.reset();
      setPhase('playing');
      // 盤が出た瞬間から数える（探している時間も含めて「何秒で抜いたか」）
      timer.begin();
    },
    [timer],
  );

  const newGame = useCallback(
    (next: Mode, dateKey: string) => {
      setPhase('loading');
      setPlay(null);
      timer.reset();
      // 9×9 は生成に数十ミリ秒かかることがあるので、「作成中」を描いてから作る
      window.setTimeout(() => {
        const board = next === 'daily' ? dailyBoard(dateKey) : generateFor(levelOf(next), Math.random).board;
        setInitial(board);
        resetPlay(board, next === 'daily' ? isFirstDailyPlay(readDailyPlayed(browserStorage()), dateKey) : true);
        trackToolUse('yajirushi-nuki', `new-${next}`);
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

  useEffect(
    () => () => {
      window.clearTimeout(hintTimer.current);
      window.clearTimeout(bumpTimer.current);
    },
    [],
  );

  /** 決着を記録する（記録しない盤なら表示だけ） */
  const settle = useCallback(
    (won: boolean) => {
      const timeMs = totalTimeMs(timer.stop(), hints);
      setPhase(won ? 'won' : 'lost');
      trackToolUse('yajirushi-nuki', `${won ? 'clear' : 'lose'}-${mode}`);
      if (!recordable) {
        setResult({ timeMs, recorded: false, improved: null });
        return;
      }
      if (won) {
        const clearedOn = mode === 'daily' ? today : undefined;
        // 連続日数は記録に入れる前の値から数える（表示と保存を同じ計算にそろえる）
        const streak = mode === 'daily' ? nextStreak(entry.lastClearedOn, today, entry.streak) : undefined;
        const { improved } = records.finish({ outcome: 'win', timeMs, clearedOn }, variant);
        setResult({ timeMs, recorded: true, improved, streak });
      } else {
        records.finish({ outcome: 'loss' }, variant);
        setResult({ timeMs, recorded: true, improved: null });
      }
    },
    [timer, hints, mode, recordable, today, entry, records, variant],
  );

  const onTap = useCallback(
    (cell: Cell) => {
      if (phase !== 'playing' || !play || play.board.cells[cell] === null) return;
      setCursor(cell);
      if (!counted.current && recordable) {
        counted.current = true;
        records.start(variant);
        // 今日の 1 面は、最初の 1 手で「今日はもう遊んだ」にする
        // （途中で読み込み直して記録をやり直せないように）
        if (mode === 'daily') writeDailyPlayed(browserStorage(), today);
      }
      const dir = play.board.cells[cell] as Dir;
      const { state, outcome, blocker } = tapArrow(play, cell);
      if (outcome === 'ignored') return;
      setPlay(state);
      if (outcome === 'escaped') {
        if (hint === cell) setHint(null);
        const key = ++fxKey.current;
        setFlying((f) => [...f, { key, cell, dir }]);
        window.setTimeout(() => setFlying((f) => f.filter((x) => x.key !== key)), FLY_MS + 30);
        if (isCleared(state.board)) settle(true);
        return;
      }
      // ぶつかった：相手の手前まで進んで戻る（どれが邪魔かが分かるように）
      const size = play.board.size;
      const steps =
        blocker === null
          ? 0
          : Math.abs(Math.floor(blocker / size) - Math.floor(cell / size)) + Math.abs((blocker % size) - (cell % size)) - 1;
      const key = ++fxKey.current;
      setBump({ key, cell, dir, steps });
      window.clearTimeout(bumpTimer.current);
      bumpTimer.current = window.setTimeout(() => setBump(null), BUMP_MS + 30);
      if (isLost(state)) settle(false);
    },
    [phase, play, recordable, records, variant, mode, today, hint, settle],
  );

  const takeHint = useCallback(() => {
    if (phase !== 'playing' || !play) return;
    const target = hintCell(play.board, Math.random);
    if (target === null) return;
    setHints((h) => h + 1);
    setHint(target);
    trackToolUse('yajirushi-nuki', 'hint');
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(null), HINT_FLASH_MS);
  }, [phase, play]);

  /** 同じ盤でやり直す。**記録しない**（盤を覚えた状態なので） */
  const retrySame = useCallback(() => {
    if (!initial) return;
    resetPlay(initial, false);
    trackToolUse('yajirushi-nuki', `retry-${mode}`);
  }, [initial, resetPlay, mode]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!play) return;
      const dir = KEY_DIR[e.key];
      if (!dir) return;
      e.preventDefault();
      const next = moveCursor(play.board.size, cursor, dir);
      setCursor(next);
      cellRefs.current[next]?.focus();
    },
    [play, cursor],
  );

  const copyResult = useCallback(() => {
    if (!result || !play) return;
    const text = shareText({
      mode,
      misses: play.misses,
      timeMs: result.timeMs,
      dateKey: mode === 'daily' ? today : undefined,
      url: `${SITE_URL}/yajirushi-nuki/`,
    });
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        trackToolUse('yajirushi-nuki', 'copy-result');
      },
      () => setCopied(false),
    );
  }, [result, play, mode, today]);

  const size = play?.board.size ?? DIFFICULTIES[levelOf(mode)].size;
  const hearts = play?.hearts ?? HEARTS;
  const misses = play?.misses ?? 0;
  const shownMs = phase === 'won' || phase === 'lost' ? (result?.timeMs ?? 0) : totalTimeMs(timer.ms, hints);
  const streakNow = currentStreak(entry.lastClearedOn, today, entry.streak);
  const left = play ? play.board.cells.filter((c) => c !== null).length : 0;

  let note = '';
  if (phase === 'won') {
    note = result?.recorded ? `ミス ${misses}・${formatTime(shownMs)}` : `ミス ${misses}・${formatTime(shownMs)}　練習（記録なし）`;
  } else if (phase === 'lost') {
    note = result?.recorded ? 'ハートがなくなりました' : 'ハートがなくなりました　練習（記録なし）';
  } else if (phase === 'playing' && !recordable) {
    note = '練習（記録なし）';
  }

  return (
    // 盤の大きさを決める変数（--chrome / --board-max）はこの入れ物に置いてある。
    // 盤と「作成中」の幕が同じ値を継承するようにするため（app/globals.css の .yn-game）
    <div className="card yn-game">
      <div className="btn-row yn-modes">
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

      <div className="yn-status">
        <span className="yn-hearts" aria-label={`ハート ${hearts}／${HEARTS}`}>
          {Array.from({ length: HEARTS }, (_, i) => (
            <span key={i} className={i < hearts ? 'on' : 'off'} aria-hidden="true">
              {i < hearts ? '♥' : '♡'}
            </span>
          ))}
        </span>
        <span className="yn-misses">ミス{misses}</span>
        <span className="yn-time">⏱ {formatTime(shownMs)}</span>
        {/* ヒントの枠は常に置く（出し入れで行が動かないように。画面の約束1） */}
        <button
          type="button"
          className="btn yn-hint-btn"
          onClick={takeHint}
          disabled={phase !== 'playing'}
          aria-label={`ヒント（タイムに${HINT_PENALTY_MS / 1000}秒足されます）`}
        >
          ヒント<span className="yn-hint-penalty">+{HINT_PENALTY_MS / 1000}秒</span>
        </button>
      </div>
      <p className="yn-live" aria-live="polite">
        {phase === 'won' ? '全部抜けました' : phase === 'lost' ? 'ハートがなくなりました' : play ? `のこり${left}本` : ''}
      </p>

      {phase === 'loading' || !play ? (
        <div className="yn-loading">盤を作っています…</div>
      ) : (
        <div className="yn-wrap">
          <div
            className={`yn-board${phase === 'won' ? ' done' : ''}`}
            role="group"
            aria-label={`矢印ぬきの盤（${size}×${size}）。矢印キーで移動、Enterで抜きます`}
            style={{ '--yn-n': size } as CSSProperties}
            onKeyDown={onKeyDown}
            onContextMenu={(e) => e.preventDefault()}
          >
            {play.board.cells.map((dir, i) => {
              const bumping = bump && bump.cell === i ? bump : null;
              const cls = ['yn-cell', dir ? 'has' : '', hint === i ? 'hint' : '', bumping ? 'bump' : ''].filter(Boolean).join(' ');
              return (
                <button
                  key={i}
                  ref={(el) => {
                    cellRefs.current[i] = el;
                  }}
                  type="button"
                  className={cls}
                  tabIndex={i === cursor ? 0 : -1}
                  aria-label={cellLabel(play.board, i)}
                  onFocus={() => setCursor(i)}
                  onClick={() => onTap(i)}
                >
                  {dir ? (
                    <span
                      key={bumping ? bumping.key : 'still'}
                      className="yn-glyph"
                      style={
                        bumping
                          ? ({
                              '--yn-dx': `${(dir === 'right' ? 1 : dir === 'left' ? -1 : 0) * bumping.steps * 100 + (dir === 'right' ? 30 : dir === 'left' ? -30 : 0)}%`,
                              '--yn-dy': `${(dir === 'down' ? 1 : dir === 'up' ? -1 : 0) * bumping.steps * 100 + (dir === 'down' ? 30 : dir === 'up' ? -30 : 0)}%`,
                            } as CSSProperties)
                          : undefined
                      }
                    >
                      <ArrowGlyph dir={dir} />
                    </span>
                  ) : null}
                </button>
              );
            })}
            {/* 抜けていく矢印の残像。盤からはもう消えているので、ここにだけ出る（画面の約束6） */}
            {flying.map((f) => (
              <span
                key={f.key}
                className={`yn-fly yn-fly-${f.dir}`}
                aria-hidden="true"
                style={
                  {
                    left: `${((f.cell % size) / size) * 100}%`,
                    top: `${(Math.floor(f.cell / size) / size) * 100}%`,
                  } as CSSProperties
                }
              >
                <ArrowGlyph dir={f.dir} />
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 文言で行数が変わると盤が動くので、枠は常に置いて高さを固定する（画面の約束1） */}
      <p className={`yn-note${phase === 'won' ? ' win' : phase === 'lost' ? ' lose' : ''}`}>
        {phase === 'won' ? '🎉 クリア！ ' : ''}
        {note}
        {phase === 'won' && result?.streak ? `　連続${result.streak}日` : ''}
        {phase === 'won' ? <BestBadge improved={result?.improved ?? null} /> : null}
      </p>

      <div className="btn-row yn-actions">
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
mode !== 'daily' ? (
          <button type="button" className="btn" onClick={() => newGame(mode, today)}>
            新しい盤
          </button>
        ) : null
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
          矢印をタップすると、向いている方向へまっすぐ進みます。進む先に矢印が無ければ盤の外へ抜けて消え、
          あればぶつかって戻り、ハートが1つ減ります。<strong>いま抜けられる矢印を見つけて</strong>、全部抜けばクリアです。
          ヒントは抜けられる矢印を1本光らせます（1回につきタイムに+{HINT_PENALTY_MS / 1000}秒）。
          {mode === 'daily'
            ? '「今日の1面」は日付から作る全員共通の盤で、記録になるのはその日の1回目だけです。連続日数はこの端末のブラウザに保存しています。'
            : '同じ盤でやり直したときは練習扱いで、記録は付きません。'}
        </p>
      </details>
    </div>
  );
}
