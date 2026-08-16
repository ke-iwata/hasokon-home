'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyFlip,
  applyPlay,
  chooseCpuPlay,
  CPU,
  CPU_LEVELS,
  cpuDelay,
  DEFAULT_OPTIONS,
  HAND_SIZE,
  HUMAN,
  isStuck,
  LEVEL_LABELS,
  LEVEL_NOTES,
  newGame,
  outcome,
  pileTop,
  playableTargets,
  remainingCards,
  variantOf,
  type CpuLevel,
  type Options,
  type SpeedState,
} from '@/lib/speed';
import { CardView } from '@/app/_cards/CardView';
import { BestBadge, RecordStrip, useRecords, useStopwatch } from '@/app/_records/Records';
import { formatTime, type Improved } from '@/lib/records';
import { trackToolUse } from '@/lib/analytics';

/**
 * スピードの画面。ロジックは `lib/speed.ts`（純関数）にあり、ここは入力と描画だけ。
 * 仕様: docs/features/game-speed.md
 *
 * サイト初のリアルタイム面なので、**CPUは手番ではなくタイマーで動く**。
 * その分の約束が2つある:
 *
 * 1. **CPUのタイマーは局面に依存させない。** `useEffect` の依存に局面を入れると、
 *    こちらがタップするたびにCPUの間（`cpuDelay`）が測り直され、速く押すほど
 *    CPUが動けなくなる。1ゲームにつき1本のループを張り、自分で次の間を積む
 * 2. **判断は必ず `setState` の更新関数の中でやる。** タイマーが起きた時点の
 *    局面と、実際に反映される局面はずれうる（直前にこちらが出しているかもしれない）。
 *    出せない手は `applyPlay` が黙って捨てるので、遅れて届いた手は自然に弾かれる
 */

/** 手詰まりの合図から、台札をめくるまでの間（ms）。「せーの」の掛け声ぶん */
const SIGNAL_MS = 900;
/** 出せない札をタップしたときに、その枠を光らせておく時間（ms） */
const WARN_MS = 400;

/** 強さは覚えておく。遊んだ記録ではないので lib/records.ts には入れない */
const OPTIONS_KEY = 'speed:options';

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
  const [state, setState] = useState<SpeedState | null>(null);
  const [result, setResult] = useState<{ timeMs: number; improved: Improved } | null>(null);
  /** 選んでいる場札の枠。台札2つとも出せるときだけ使う */
  const [picked, setPicked] = useState<number | null>(null);
  /** 出せない札をタップした枠（一瞬だけ光らせる） */
  const [warn, setWarn] = useState<number | null>(null);
  /** CPUのループを回してよいか。決着したら止める */
  const [running, setRunning] = useState(false);
  /** ゲームを配り直すたびに増やす。CPUのループを張り直す目印 */
  const [round, setRound] = useState(0);

  const records = useRecords('speed');
  const timer = useStopwatch();
  const variant = variantOf(options);
  const entry = records.entry(variant);
  const finished = useRef(false);

  const start = useCallback(
    (next: Options) => {
      finished.current = false;
      setResult(null);
      setPicked(null);
      setWarn(null);
      setRunning(false);
      timer.reset();
      setState(newGame(next));
      setRound((n) => n + 1);
    },
    [timer],
  );

  // 配るのに乱数を使うので、静的書き出しのHTMLと食い違わないよう
  // ブラウザに載ってから最初の局面を作る（神経衰弱・麻雀ソリティアと同じ理由）
  const dealt = useRef(false);
  useEffect(() => {
    if (dealt.current) return;
    dealt.current = true;
    const saved = readOptions();
    setOptions(saved);
    start(saved);
  }, [start]);

  /**
   * 「はじめる」。合図で双方の山札から1枚ずつ台札に置く（本物と同じ開始手順）。
   *
   * 開いた瞬間に始めないのは、こちらが盤を見る前にCPUが出し始めてしまうため。
   * リアルタイムなので、開始の合図は人間が出す。
   */
  const begin = () => {
    if (!state || state.started) return;
    records.start(variant);
    trackToolUse('speed', `new-${variant}`);
    timer.begin();
    setState(applyFlip(state));
    setRunning(true);
  };

  /** 手詰まりの合図。双方とも出せなくなったら、少し置いて台札をめくり直す */
  useEffect(() => {
    if (!state || !isStuck(state)) return;
    const id = window.setTimeout(() => {
      setState((s) => (s && isStuck(s) ? applyFlip(s) : s));
    }, SIGNAL_MS);
    return () => window.clearTimeout(id);
  }, [state]);

  /**
   * CPUの思考ループ。**局面を依存に入れない**（上のコメントの約束1）。
   * 1回起きるたびに次の間を自分で積むので、こちらの操作では乱れない。
   */
  useEffect(() => {
    if (!running) return;
    let stopped = false;
    let id = 0;
    const step = () => {
      if (stopped) return;
      setState((cur) => {
        if (!cur || cur.finished || !cur.started) return cur;
        const move = chooseCpuPlay(cur);
        return move ? applyPlay(cur, CPU, move.slot, move.pile) : cur;
      });
      id = window.setTimeout(step, cpuDelay(options.level));
    };
    id = window.setTimeout(step, cpuDelay(options.level));
    return () => {
      stopped = true;
      window.clearTimeout(id);
    };
  }, [running, round, options.level]);

  /** 決着したら記録する。CPUのループもここで止める */
  useEffect(() => {
    if (!state || !state.finished || finished.current) return;
    finished.current = true;
    setRunning(false);
    setPicked(null);
    const timeMs = timer.stop();
    const decided = outcome(state) ?? 'draw';
    trackToolUse('speed', `${decided}-${variantOf({ level: state.level })}`);
    const { improved } = records.finish(
      // タイムは勝ったときだけ残す（負けの所要時間はベストの意味を持たない）
      decided === 'win' ? { outcome: decided, timeMs } : { outcome: decided },
      variantOf({ level: state.level }),
    );
    setResult({ timeMs, improved });
  }, [state, records, timer]);

  /** 光らせた枠を戻す */
  useEffect(() => {
    if (warn === null) return;
    const id = window.setTimeout(() => setWarn(null), WARN_MS);
    return () => window.clearTimeout(id);
  }, [warn]);

  /**
   * 場札をタップした。
   *
   * 出せる台札が1つならそこへ即座に出す。2つとも出せるときだけ、
   * どちらへ出すかを選んでもらう（仕様の「ドラッグは要求しない」）。
   */
  const tapCard = (slot: number) => {
    if (!state || !state.started || state.finished) return;
    if (picked === slot) {
      setPicked(null);
      return;
    }
    const targets = playableTargets(state, HUMAN, slot);
    if (targets.length === 0) {
      setPicked(null);
      setWarn(slot);
      return;
    }
    if (targets.length === 1) {
      setPicked(null);
      setState(applyPlay(state, HUMAN, slot, targets[0]));
      return;
    }
    setPicked(slot);
  };

  /** 台札をタップした。選んでいる場札があればそこへ出す */
  const tapPile = (pile: number) => {
    if (!state || picked === null) return;
    setPicked(null);
    setState(applyPlay(state, HUMAN, picked, pile));
  };

  const change = (next: Options) => {
    setOptions(next);
    writeOptions(next);
    // 強さを変えたらその場で配り直す（途中で相手が入れ替わらないように）
    start(next);
  };

  const strip = useMemo(() => {
    const decided = (entry.wins ?? 0) + (entry.losses ?? 0) + (entry.draws ?? 0);
    if (decided === 0) return [];
    return [
      {
        label: `${LEVEL_LABELS[options.level]}との成績`,
        value: `${entry.wins ?? 0}勝${entry.losses ?? 0}敗${entry.draws ?? 0}分`,
      },
      { label: 'ベストタイム', value: entry.bestTimeMs ? formatTime(entry.bestTimeMs) : '—' },
    ];
  }, [options.level, entry]);

  if (!state) {
    return (
      <div className="card cardgame">
        <p className="sp-msg">配っています…</p>
      </div>
    );
  }

  const decided = outcome(state);
  const stuck = isStuck(state);
  // 選んだ枠がもう出せなくなっていたら（先に台札を取られた）、選択は無かったことにする
  const pickedTargets = picked === null ? [] : playableTargets(state, HUMAN, picked);
  const choosing = pickedTargets.length > 1 ? picked : null;

  /** 1人ぶんの列（山札＋場札4枚）。CPU側は自分の札と同じく表向きに見えている */
  const seatRow = (player: number) => (
    <div className="sp-seat">
      <div className="sp-seat-head">
        <span className={`sp-seat-name${player === HUMAN ? ' me' : ''}`}>{SEAT_NAMES[player]}</span>
        <span className="sp-seat-left">
          残り <strong>{remainingCards(state, player)}</strong>枚
        </span>
      </div>
      <div className="sp-row">
        <span className="sp-slot sp-stock">
          {state.stocks[player].length > 0 ? (
            // 裏面だけを描くので中身はDOMに出ない（CardView の裏はランクもスートも見ない）
            <CardView card={{ ...state.stocks[player][0], faceUp: false }} />
          ) : (
            <span className="sp-empty" aria-hidden />
          )}
          <span className="sp-count">{state.stocks[player].length}</span>
        </span>
        {state.hands[player].map((card, slot) => (
          <span
            key={slot}
            className={[
              'sp-slot',
              player === HUMAN && choosing === slot ? 'picked' : '',
              player === HUMAN && warn === slot ? 'warn' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {card ? (
              <CardView
                card={card}
                selected={player === HUMAN && choosing === slot}
                onClick={player === HUMAN ? () => tapCard(slot) : undefined}
              />
            ) : (
              <span className="sp-empty" aria-hidden />
            )}
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <div className="card cardgame sp-game">
      <div className="btn-row">
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

        <button type="button" className="btn" onClick={() => start(options)}>
          配り直す
        </button>
      </div>

      <div className="status-bar">
        <span>
          あなた <strong>{remainingCards(state, HUMAN)}枚</strong>
        </span>
        <span>
          CPU <strong>{remainingCards(state, CPU)}枚</strong>
        </span>
        <span>
          時間 <strong>{formatTime(timer.ms)}</strong>
        </span>
      </div>

      <RecordStrip items={strip} />

      {seatRow(CPU)}

      <div className={`sp-piles${stuck ? ' signal' : ''}`} aria-label="台札">
        {state.piles.map((_stack, pile) => {
          const target = pickedTargets.includes(pile);
          const top = pileTop(state, pile);
          return (
            <span key={pile} className={`sp-pile${target ? ' target' : ''}`}>
              {top ? (
                <CardView card={top} onClick={target ? () => tapPile(pile) : undefined} />
              ) : (
                <span className="sp-empty" aria-hidden />
              )}
            </span>
          );
        })}
      </div>

      {seatRow(HUMAN)}

      <p className="sp-msg" aria-live="polite">
        {state.finished
          ? decided === 'win'
            ? `あなたの勝ち！ ${formatTime(result?.timeMs ?? timer.ms)}`
            : decided === 'loss'
              ? state.deadlocked
                ? `手詰まり。残り枚数の少ないCPUの勝ちです（${remainingCards(state, HUMAN)}枚 対 ${remainingCards(state, CPU)}枚）`
                : 'CPUの勝ち。もう一度いきましょう'
              : '引き分け。山札が尽きて、残り枚数も同じでした'
          : !state.started
            ? '「はじめる」で、おたがいの山札から1枚ずつ台札に置きます'
            : stuck
              ? 'せーの！ どちらも出せません。台札をめくり直します'
              : choosing !== null
                ? 'どちらの台札に出しますか？（枠が光っている台札をタップ）'
                : '台札とつながる数字の場札をタップ（AとKもつながります）'}
        {state.finished && <BestBadge improved={result?.improved ?? null} />}
      </p>

      {!state.started && (
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn btn-primary" onClick={begin}>
            はじめる
          </button>
        </div>
      )}

      {state.finished && (
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn btn-primary" onClick={() => start(options)}>
            もう一度あそぶ
          </button>
        </div>
      )}

      <details className="game-tips">
        <summary>この画面の見かた</summary>
        <p className="sp-note">
          場札は{HAND_SIZE}枚。出すたびに山札から補充され、
          <strong>山札と場札を先に出し切ったほうの勝ち</strong>です。 CPUの強さ「
          {LEVEL_LABELS[options.level]}」は{LEVEL_NOTES[options.level]}。
        </p>
      </details>
    </div>
  );
}
