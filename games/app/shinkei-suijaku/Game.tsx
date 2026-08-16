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
import {
  CpuSpeedSeg,
  delayFor,
  readCpuSpeed,
  writeCpuSpeed,
  type CpuSpeed,
} from '@/app/_cpu/CpuSpeed';
import { StartGate } from '@/app/_cpu/StartGate';

/**
 * 神経衰弱の画面。ロジックは `lib/shinkei-suijaku.ts`（純関数）にあり、ここは入力と描画だけ。
 * 仕様: docs/features/game-shinkei-suijaku.md
 */

/*
 * 間（ms）。いずれも「ふつう」のときの値で、速さの設定に応じて
 * `delayFor` が倍率を掛ける（app/_cpu/CpuSpeed.tsx）。
 * **めくった札を見せる時間も一緒に動かす**。CPUだけ速くしても、
 * 札が伏せられるのを待つ時間が変わらなければ体感は速くならない
 */
/** はずれた2枚を見せておく時間。仕様の「約1秒」。画面タップで短縮できる */
const MISS_MS = 1000;
/** 当たった2枚を見せておく時間。取るだけなので短くていい */
const HIT_MS = 500;
/** CPUが1枚めくるまでの間。速すぎると何をめくったか追えない */
const CPU_MS = 700;

/** 遊び方・枚数・強さは覚えておく。遊んだ記録ではないので lib/records.ts には入れない */
const OPTIONS_KEY = 'shinkei-suijaku:options';

/** 画面の設定。ゲームのルール（Options）に、CPU対戦の先攻・後攻を足したもの */
interface Prefs extends Options {
  first: 'you' | 'cpu';
}

const DEFAULT_PREFS: Prefs = { ...DEFAULT_OPTIONS, first: 'you' };

function readPrefs(): Prefs {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(OPTIONS_KEY);
  } catch {
    return DEFAULT_PREFS;
  }
  if (!raw) return DEFAULT_PREFS;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      mode: parsed.mode === 'cpu' || parsed.mode === 'solo' ? parsed.mode : DEFAULT_PREFS.mode,
      size: (SIZES as readonly number[]).includes(parsed.size as number)
        ? (parsed.size as Size)
        : DEFAULT_PREFS.size,
      level: CPU_LEVELS.includes(parsed.level as CpuLevel)
        ? (parsed.level as CpuLevel)
        : DEFAULT_PREFS.level,
      first: parsed.first === 'cpu' ? 'cpu' : DEFAULT_PREFS.first,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function writePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(prefs));
  } catch {
    // 覚えられなくても、その回は普通に遊べる
  }
}

const SEAT_NAMES = ['あなた', 'CPU'];

export default function Game() {
  const [options, setOptions] = useState<Prefs>(DEFAULT_PREFS);
  const [state, setState] = useState<MemoryState | null>(null);
  const [result, setResult] = useState<{ timeMs: number; improved: Improved } | null>(null);
  /**
   * スタート待ち。後攻（CPUが先）のとき、配った瞬間にCPUがめくり始めるのを防ぐ。
   * 「スタート」を押すか、先攻で自分がめくると true になる
   */
  const [begun, setBegun] = useState(false);
  /** CPUの速さ。盤の中身は変わらないので、その場で効く（配り直さない） */
  const [speed, setSpeed] = useState<CpuSpeed>('normal');
  const records = useRecords('shinkei-suijaku');
  const timer = useStopwatch();
  const variant = variantOf(options);
  const entry = records.entry(variant);
  // 1回のゲームにつき1度だけ数える
  const counted = useRef(false);
  const finished = useRef(false);

  const start = useCallback(
    (next: Prefs) => {
      counted.current = false;
      finished.current = false;
      setResult(null);
      setBegun(false);
      timer.reset();
      setState(newGame(next, Math.random, next.first === 'cpu' ? CPU : HUMAN));
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
    const saved = readPrefs();
    setOptions(saved);
    setSpeed(readCpuSpeed('shinkei-suijaku'));
    start(saved);
  }, [start]);

  /** めくった2枚の後始末。時間で自然に消える（画面タップでも呼ぶ） */
  useEffect(() => {
    if (!state || state.judge === null) return;
    const wait = delayFor(state.judge === 'hit' ? HIT_MS : MISS_MS, speed);
    const id = window.setTimeout(() => setState((s) => (s ? resolve(s) : s)), wait);
    return () => window.clearTimeout(id);
  }, [state, speed]);

  /** CPUの手番。1枚目と2枚目でこの効果が2回走る。スタート前（!begun）は動かない */
  useEffect(() => {
    if (!state || !begun || state.finished || state.mode !== 'cpu') return;
    if (state.turn !== CPU || state.judge !== null) return;
    const id = window.setTimeout(() => {
      setState((s) => {
        if (!s || s.finished || s.turn !== CPU || s.judge !== null) return s;
        const pos = chooseCpuFlip(s);
        return pos === null ? s : applyFlip(s, pos);
      });
    }, delayFor(CPU_MS, speed));
    return () => window.clearTimeout(id);
  }, [state, begun, speed]);

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

  /**
   * 札をめくる。
   *
   * 判定待ちのあいだは**ここでは何もしない**。待ち時間の短縮は盤（`.ss-board`）側の
   * onClick が一手に引き受ける（札のクリックもそこへバブリングする）。
   * 両方で `resolve` を呼ぶと、同じ局面に対して2回走ることになる
   * （結果は同じだが意図しない二重呼び出し。#86 のレビュー指摘）
   */
  const flip = (pos: number) => {
    if (!state || state.judge !== null) return;
    if (state.mode === 'cpu' && state.turn !== HUMAN) return;
    if (!canFlip(state, pos)) return;
    if (!counted.current) {
      counted.current = true;
      records.start(variant);
    }
    // 先攻で自分からめくったときは、それをスタートの合図とみなす
    setBegun(true);
    timer.begin();
    setState(applyFlip(state, pos));
  };

  const change = (next: Prefs) => {
    setOptions(next);
    writePrefs(next);
    // 枚数も遊び方も盤の作りが変わるので、その場で配り直す
    start(next);
  };

  const strip = useMemo(() => {
    if (options.mode === 'solo') {
      // 記録が無くても出す（「—」）。初クリアで帯が現れると盤が押し下がるため
      return [
        { label: 'ベストタイム', value: entry.bestTimeMs ? formatTime(entry.bestTimeMs) : '—' },
        { label: '最少手数', value: entry.bestMoves ? `${entry.bestMoves}手` : '—' },
        { label: 'クリア', value: `${entry.wins ?? 0}回` },
      ];
    }
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

        {options.mode === 'cpu' && (
          <CpuSpeedSeg
            value={speed}
            onChange={(next) => {
              setSpeed(next);
              writeCpuSpeed('shinkei-suijaku', next);
            }}
          />
        )}

        {options.mode === 'cpu' && (
          <div className="seg" role="group" aria-label="先攻・後攻">
            {(['you', 'cpu'] as const).map((first) => (
              <button
                key={first}
                type="button"
                className={first === options.first ? 'active' : ''}
                aria-pressed={first === options.first}
                onClick={() => change({ ...options, first })}
              >
                {first === 'you' ? '先攻' : '後攻'}
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
          （仕様の「待ち時間は画面タップで短縮可」）。**短縮はここだけの仕事**で、
          札のクリックもここへバブリングしてくる（flip 側は判定待ちなら何もしない）。
          両方で resolve を呼ぶと同じ局面に2回走るため、片方に寄せてある */}
      <StartGate
        show={!begun && state.mode === 'cpu' && !state.finished}
        onStart={() => setBegun(true)}
      >
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
      </StartGate>

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
                : !begun
                  ? 'スタートを押すと、CPUから先にめくり始めます'
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

      <details className="game-tips">
        <summary>この画面の見かた</summary>
        <p className="ss-note">
          同じ数字の2枚がそろえば取れて、<strong>そのままもう一度めくれます</strong>。
          {options.mode === 'cpu' && `CPUの強さ「${LEVEL_LABELS[options.level]}」は${LEVEL_NOTES[options.level]}。`}
          枚数は{SIZES.map((s) => sizeLabel(s)).join('・')}から選べます。
        </p>
      </details>
    </div>
  );
}
