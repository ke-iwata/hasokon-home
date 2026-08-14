'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyFlip,
  canFlip,
  chooseCpuFlip,
  COLUMNS,
  CPU,
  CPU_LEVELS,
  DEFAULT_OPTIONS,
  HUMAN,
  LEVEL_LABELS,
  LEVEL_NOTES,
  MODE_LABELS,
  newGame,
  outcome,
  resolve,
  sizeLabel,
  SIZES,
  takenPairs,
  variantOf,
  type CpuLevel,
  type MemoryState,
  type Mode,
  type Options,
  type Size,
} from '@/lib/shinkei-suijaku';
import { CardView } from '@/app/_cards/CardView';
import { BestBadge, RecordStrip, useRecords, useStopwatch } from '@/app/_records/Records';
import { formatTime, type Improved } from '@/lib/records';
import { trackToolUse } from '@/lib/analytics';

/**
 * 神経衰弱の画面。ロジックは `lib/shinkei-suijaku.ts`（純関数）にあり、ここは入力と描画だけ。
 * 仕様: docs/features/game-shinkei-suijaku.md
 */

/** はずれた2枚を見せておく時間（ms）。仕様の「約1秒」。画面タップで短縮できる */
const MISS_MS = 1000;
/** 当たった2枚を見せておく時間。取るだけなので短くていい */
const HIT_MS = 500;
/** CPUが1枚めくるまでの間。速すぎると何をめくったか追えない */
const CPU_MS = 700;

/** 遊び方・枚数・強さは覚えておく。遊んだ記録ではないので lib/records.ts には入れない */
const OPTIONS_KEY = 'shinkei-suijaku:options';

function readOptions(): Options {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(OPTIONS_KEY);
  } catch {
    return DEFAULT_OPTIONS;
  }
  if (!raw) return DEFAULT_OPTIONS;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      mode: parsed.mode === 'cpu' || parsed.mode === 'solo' ? parsed.mode : DEFAULT_OPTIONS.mode,
      size: (SIZES as readonly number[]).includes(parsed.size as number)
        ? (parsed.size as Size)
        : DEFAULT_OPTIONS.size,
      level: CPU_LEVELS.includes(parsed.level as CpuLevel)
        ? (parsed.level as CpuLevel)
        : DEFAULT_OPTIONS.level,
    };
  } catch {
    return DEFAULT_OPTIONS;
  }
}

function writeOptions(options: Options): void {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
  } catch {
    // 覚えられなくても、その回は普通に遊べる
  }
}

const SEAT_NAMES = ['あなた', 'CPU'];

export default function Game() {
  const [options, setOptions] = useState<Options>(DEFAULT_OPTIONS);
  const [state, setState] = useState<MemoryState | null>(null);
  const [result, setResult] = useState<{ timeMs: number; improved: Improved } | null>(null);
  const records = useRecords('shinkei-suijaku');
  const timer = useStopwatch();
  const variant = variantOf(options);
  const entry = records.entry(variant);
  // 1回のゲームにつき1度だけ数える
  const counted = useRef(false);
  const finished = useRef(false);

  const start = useCallback(
    (next: Options) => {
      counted.current = false;
      finished.current = false;
      setResult(null);
      timer.reset();
      setState(newGame(next));
      trackToolUse('shinkei-suijaku', `new-${variantOf(next)}`);
    },
    [timer],
  );

  // 配るのに乱数を使うので、静的書き出しのHTMLと食い違わないよう
  // ブラウザに載ってから最初の盤面を作る（麻雀ソリティアと同じ理由）
  const dealt = useRef(false);
  useEffect(() => {
    if (dealt.current) return;
    dealt.current = true;
    const saved = readOptions();
    setOptions(saved);
    start(saved);
  }, [start]);

  /** めくった2枚の後始末。時間で自然に消える（画面タップでも呼ぶ） */
  useEffect(() => {
    if (!state || state.judge === null) return;
    const wait = state.judge === 'hit' ? HIT_MS : MISS_MS;
    const id = window.setTimeout(() => setState((s) => (s ? resolve(s) : s)), wait);
    return () => window.clearTimeout(id);
  }, [state]);

  /** CPUの手番。1枚目と2枚目でこの効果が2回走る */
  useEffect(() => {
    if (!state || state.finished || state.mode !== 'cpu') return;
    if (state.turn !== CPU || state.judge !== null) return;
    const id = window.setTimeout(() => {
      setState((s) => {
        if (!s || s.finished || s.turn !== CPU || s.judge !== null) return s;
        const pos = chooseCpuFlip(s);
        return pos === null ? s : applyFlip(s, pos);
      });
    }, CPU_MS);
    return () => window.clearTimeout(id);
  }, [state]);

  /** 決着したら記録する */
  useEffect(() => {
    if (!state || !state.finished || finished.current) return;
    finished.current = true;
    const timeMs = timer.stop();
    const decided = outcome(state) ?? 'win';
    trackToolUse('shinkei-suijaku', `${decided}-${variantOf(state)}`);
    const { improved } = records.finish(
      state.mode === 'solo'
        ? { outcome: 'win', timeMs, moves: state.moves }
        : { outcome: decided, score: state.pairs[HUMAN] },
      variantOf(state),
    );
    setResult({ timeMs, improved });
  }, [state, records, timer]);

  /** 判定待ちなら待ち時間を飛ばす。そうでなければ札をめくる */
  const flip = (pos: number) => {
    if (!state) return;
    if (state.judge !== null) {
      setState(resolve(state));
      return;
    }
    if (state.mode === 'cpu' && state.turn !== HUMAN) return;
    if (!canFlip(state, pos)) return;
    if (!counted.current) {
      counted.current = true;
      records.start(variant);
    }
    timer.begin();
    setState(applyFlip(state, pos));
  };

  const change = (next: Options) => {
    setOptions(next);
    writeOptions(next);
    // 枚数も遊び方も盤の作りが変わるので、その場で配り直す
    start(next);
  };

  const strip = useMemo(() => {
    if (options.mode === 'solo') {
      if (!entry.bestTimeMs && !entry.bestMoves) return [];
      return [
        { label: 'ベストタイム', value: entry.bestTimeMs ? formatTime(entry.bestTimeMs) : '—' },
        { label: '最少手数', value: entry.bestMoves ? `${entry.bestMoves}手` : '—' },
        { label: 'クリア', value: `${entry.wins ?? 0}回` },
      ];
    }
    const decided = (entry.wins ?? 0) + (entry.losses ?? 0) + (entry.draws ?? 0);
    if (decided === 0) return [];
    return [
      {
        label: `${LEVEL_LABELS[options.level]}との成績`,
        value: `${entry.wins ?? 0}勝${entry.losses ?? 0}敗${entry.draws ?? 0}分`,
      },
      { label: '最高獲得', value: `${entry.bestScore ?? 0}組` },
    ];
  }, [options.mode, options.level, entry]);

  if (!state) {
    return (
      <div className="card cardgame">
        <p className="ss-msg">配っています…</p>
      </div>
    );
  }

  const total = state.size / 2;
  const done = takenPairs(state);
  const humanTurn = state.mode === 'solo' || state.turn === HUMAN;
  const decided = outcome(state);

  return (
    <div className="card cardgame ss-game">
      <div className="btn-row">
        <div className="seg" role="group" aria-label="遊び方">
          {(Object.keys(MODE_LABELS) as Mode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={mode === options.mode ? 'active' : ''}
              aria-pressed={mode === options.mode}
              onClick={() => change({ ...options, mode })}
            >
              {MODE_LABELS[mode]}
            </button>
          ))}
        </div>

        <div className="seg" role="group" aria-label="枚数">
          {SIZES.map((size) => (
            <button
              key={size}
              type="button"
              className={size === options.size ? 'active' : ''}
              aria-pressed={size === options.size}
              onClick={() => change({ ...options, size })}
            >
              {size}枚
            </button>
          ))}
        </div>

        {options.mode === 'cpu' && (
          <div className="seg" role="group" aria-label="CPUの強さ">
            {CPU_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                className={level === options.level ? 'active' : ''}
                aria-pressed={level === options.level}
                title={LEVEL_NOTES[level]}
                onClick={() => change({ ...options, level })}
              >
                {LEVEL_LABELS[level]}
              </button>
            ))}
          </div>
        )}

        <button type="button" className="btn" onClick={() => start(options)}>
          最初から
        </button>
      </div>

      <div className="status-bar">
        <span>
          めくった枚数 <strong>{state.moves * 2}枚</strong>
        </span>
        <span>
          そろった組{' '}
          <strong>
            {done} / {total}
          </strong>
        </span>
        <span>
          時間 <strong>{formatTime(timer.ms)}</strong>
        </span>
      </div>

      <RecordStrip items={strip} />

      {state.mode === 'cpu' && (
        <div className="ss-seats">
          {[HUMAN, CPU].map((seat) => (
            <div
              key={seat}
              className={`ss-seat${!state.finished && state.turn === seat ? ' active' : ''}`}
            >
              <span className="ss-seat-name">{SEAT_NAMES[seat]}</span>
              <span className="ss-seat-pairs">{state.pairs[seat]}組</span>
            </div>
          ))}
        </div>
      )}

      {/* 判定待ちのあいだは、盤のどこを触っても待ち時間を飛ばせる
          （仕様の「待ち時間は画面タップで短縮可」）。札そのものを触っても
          canFlip が false なので、めくり直しにはならない */}
      <div
        className="ss-board"
        aria-label="場"
        style={{ '--ss-cols': COLUMNS[state.size] } as React.CSSProperties}
        onClick={() => {
          if (state.judge !== null) setState(resolve(state));
        }}
      >
        {state.cards.map((card, pos) => {
          const owner = state.taken[pos];
          if (owner !== null) {
            return (
              <span
                key={card.id}
                className={`ss-taken${state.mode === 'cpu' ? ` p${owner}` : ''}`}
                aria-hidden
              />
            );
          }
          return (
            <span key={card.id} className={`ss-slot${humanTurn ? '' : ' wait'}`}>
              <CardView card={card} onClick={() => flip(pos)} />
            </span>
          );
        })}
      </div>

      <p className="ss-msg" aria-live="polite">
        {state.finished
          ? state.mode === 'solo'
            ? `全${total}組そろいました！ ${state.moves}手・${formatTime(result?.timeMs ?? timer.ms)}`
            : decided === 'win'
              ? `あなたの勝ち！ ${state.pairs[HUMAN]}組 対 ${state.pairs[CPU]}組`
              : decided === 'loss'
                ? `CPUの勝ち。${state.pairs[HUMAN]}組 対 ${state.pairs[CPU]}組`
                : `引き分け。${state.pairs[HUMAN]}組 対 ${state.pairs[CPU]}組`
          : state.judge === 'hit'
            ? `そろいました！ ${humanTurn ? 'もう一度めくれます' : 'CPUがもう一度めくります'}`
            : state.judge === 'miss'
              ? 'はずれ。裏に戻します（タップで早送り）'
              : humanTurn
                ? state.flipped.length === 0
                  ? '札を1枚タップしてめくってください'
                  : 'もう1枚めくってください'
                : 'CPUの番です…'}
        {state.finished && <BestBadge improved={result?.improved ?? null} />}
      </p>

      {state.finished && (
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn btn-primary" onClick={() => start(options)}>
            もう一度あそぶ
          </button>
        </div>
      )}

      <p className="ss-note">
        同じ数字の2枚がそろえば取れて、<strong>そのままもう一度めくれます</strong>。
        {options.mode === 'cpu' && `CPUの強さ「${LEVEL_LABELS[options.level]}」は${LEVEL_NOTES[options.level]}。`}
        枚数は{SIZES.map((s) => sizeLabel(s)).join('・')}から選べます。
      </p>
    </div>
  );
}
