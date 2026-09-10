'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  changeLevel,
  createGame,
  currentWord,
  finishRound,
  isLevel,
  orderedGame,
  pressKey,
  resultOf,
  ROUND_MS,
  scoreOf,
  startRound,
  type Level,
  type TypingResult,
  type TypingState,
} from '@/lib/typing';
import { isTypingKey, romajiView } from '@/lib/typing-romaji';
import { LEVELS, LEVEL_LABELS } from '@/lib/typing-words';
import { publicGames } from '@/lib/registry';
import { trackToolUse } from '@/lib/analytics';
import { BestBadge, RecordStrip, useRecords } from '@/app/_records/Records';
import { type Improved } from '@/lib/records';
import GameIcon from '@/app/GameIcon';

/**
 * タイピング練習の画面。判定と進行は `lib/typing.ts` / `lib/typing-romaji.ts`
 * （純関数）にあり、ここは入力・時間の計測・描画だけ。
 *
 * 仕様: docs/features/game-typing.md
 *
 * ## キーボードが要る初めてのゲーム
 *
 * タッチだけの端末には**遊べない理由と案内**を出す（ソフトキーボードでの
 * ローマ字打ちは練習にならない）。ただし**行き止まりにしない**ので、
 * キーボードの要らないゲームへのカードを並べる。
 * 判定は「物理キーボードの keydown が来たら遊べる」を正にしているため、
 * iPad に外付けキーボードをつないでいる人は案内から遊ぶ側へ移れる。
 */

/** 遊ぶのに使えるキーがあるか。`checking` はまだ判定していない（＝SSRと同じ絵） */
type Device = 'checking' | 'keyboard' | 'touch';

/** 難易度の保存先。**記録ではなく設定**なので `lib/records.ts` には入れない */
const LEVEL_KEY = 'typing:level';

/** 案内画面から誘導するゲーム（キーボードが要らないもの） */
const TOUCH_FRIENDLY = ['solitaire', 'block-puzzle', '2048'];

/** 打ち間違いを赤く見せる時間（ミリ秒） */
const MISS_FLASH_MS = 220;

/** 難易度を読み戻す。読めなければ「やさしい」 */
function savedLevel(): Level {
  try {
    const raw = window.localStorage.getItem(LEVEL_KEY);
    return isLevel(raw) ? raw : 'easy';
  } catch {
    return 'easy';
  }
}

export default function Game() {
  // **最初は並べ替えずに描く。** 静的書き出しのHTMLとブラウザの最初の描画で
  // お題が食い違うと hydration が壊れるため、並べ替えはマウント後に行う
  const [state, setState] = useState<TypingState>(() => orderedGame('easy'));
  const [device, setDevice] = useState<Device>('checking');
  const [remainingMs, setRemainingMs] = useState(ROUND_MS);
  const [miss, setMiss] = useState(false);
  const [result, setResult] = useState<(TypingResult & { improved: Improved }) | null>(null);

  const startedAt = useRef<number | null>(null);
  const missTimer = useRef<number | null>(null);
  const recorded = useRef(false);

  const records = useRecords('typing');
  const entry = records.entry(state.level);

  /**
   * いまの状態の写し。**キーの購読から読むために置く。**
   *
   * `setState` の更新関数の中で記録や計測の副作用を起こすと、開発時の
   * 二重呼び出しでプレイ数が2つ増える。判断は写しを見て外で済ませ、
   * `setState` には結果だけを渡す。
   */
  const stateRef = useRef(state);

  /**
   * 状態を差し替える。**写しも同時に更新する**のが要点で、
   * 描画を待つと、速く打つ人の2打目が1打目と同じ状態を見てしまう。
   */
  const apply = useCallback((next: TypingState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  // 端末の判定と、前回の難易度の読み戻し。**マウント後に行う**
  // （静的書き出しのHTMLとブラウザで食い違わないように）
  useEffect(() => {
    const fine = window.matchMedia?.('(pointer: fine)').matches ?? true;
    setDevice(fine ? 'keyboard' : 'touch');
    // ここで初めて出題を並べ替える（前回の難易度があればそれで作り直す）
    apply(createGame(savedLevel()));
  }, [apply]);

  /** ラウンドを始める */
  const begin = useCallback(() => {
    const s = stateRef.current;
    if (s.status !== 'ready') return;
    startedAt.current = Date.now();
    recorded.current = false;
    setRemainingMs(ROUND_MS);
    setResult(null);
    apply(startRound(s));
    records.start(s.level);
    trackToolUse('typing', 'start');
  }, [apply, records]);

  /** はじめからやり直す（Esc とボタン） */
  const reset = useCallback(() => {
    apply(createGame(stateRef.current.level));
    startedAt.current = null;
    recorded.current = false;
    setRemainingMs(ROUND_MS);
    setResult(null);
    setMiss(false);
  }, [apply]);

  /** 難易度を変える。ラウンド中は変えない（数え方が混ざるため） */
  const selectLevel = useCallback((level: Level) => {
    const next = changeLevel(stateRef.current, level);
    if (next === stateRef.current) return;
    try {
      window.localStorage.setItem(LEVEL_KEY, level);
    } catch {
      // 保存できなくても遊べる（次回また「やさしい」から始まるだけ）
    }
    apply(next);
    setResult(null);
    setRemainingMs(ROUND_MS);
  }, [apply]);

  /** 打ち間違いを一瞬だけ赤くする。**演出なのでゲームの状態には持たせない** */
  const flashMiss = useCallback(() => {
    setMiss(true);
    if (missTimer.current !== null) window.clearTimeout(missTimer.current);
    missTimer.current = window.setTimeout(() => setMiss(false), MISS_FLASH_MS);
  }, []);

  useEffect(() => () => {
    if (missTimer.current !== null) window.clearTimeout(missTimer.current);
  }, []);

  // キーボード。**物理キーが来たら「遊べる端末」に切り替える**
  // （タッチ端末でも外付けキーボードなら遊べるようにする）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        reset();
        return;
      }
      if (!isTypingKey(e.key, e.ctrlKey || e.metaKey || e.altKey)) return;
      setDevice('keyboard');
      const s = stateRef.current;
      if (s.status !== 'playing') return;
      e.preventDefault(); // 打鍵でページが動かないように
      const next = pressKey(s, e.key);
      apply(next);
      if (next.misses > s.misses) flashMiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [apply, reset, flashMiss]);

  // 60秒の計測。**残り時間はここで測って渡す**（`lib/typing.ts` は時刻を持たない）
  useEffect(() => {
    if (state.status !== 'playing') return;
    const tick = () => {
      const began = startedAt.current;
      if (began === null) return;
      const left = ROUND_MS - (Date.now() - began);
      setRemainingMs(Math.max(0, left));
      if (left <= 0) apply(finishRound(stateRef.current));
    };
    const timer = window.setInterval(tick, 100);
    return () => window.clearInterval(timer);
  }, [apply, state.status]);

  // 決着したら記録する（1ラウンドにつき1回だけ）
  useEffect(() => {
    if (state.status !== 'finished' || recorded.current) return;
    recorded.current = true;
    const round = resultOf(state);
    const { improved } = records.finish(
      { score: scoreOf(round), accuracy: round.accuracy },
      state.level,
    );
    setResult({ ...round, improved });
    trackToolUse('typing', 'finish');
  }, [state, records]);

  const word = currentWord(state);
  const view = romajiView(state.chunks, state.progress);
  const seconds = Math.ceil(remainingMs / 1000);
  const playing = state.status === 'playing';
  const live = resultOf(state);

  // タッチだけの端末。**遊べない理由を出して、行き止まりにしない**
  if (device === 'touch') {
    const suggestions = publicGames.filter((g) => TOUCH_FRIENDLY.includes(g.slug));
    return (
      <div className="card tp-guide">
        <p className="tp-guide-title">パソコンのキーボードで遊ぶゲームです</p>
        <p className="tp-guide-note">
          ローマ字入力の練習なので、画面のキーボードでは練習になりません。
          パソコン（または外付けキーボードをつないだタブレット）で開いてください。
          <strong>キーを押すとそのまま始められます。</strong>
        </p>
        <p className="tp-guide-lead">この端末でそのまま遊べるゲーム</p>
        <div className="game-grid">
          {suggestions.map((g) => (
            <Link key={g.slug} className="game-card" href={`/${g.slug}/`}>
              <div className="icon" aria-hidden="true">
                <GameIcon name={g.icon} />
              </div>
              <div className="name">{g.name}</div>
              <div className="desc">{g.description}</div>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="btn-row">
        <div className="seg" role="group" aria-label="難易度">
          {LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              className={level === state.level ? 'active' : ''}
              aria-pressed={level === state.level}
              disabled={playing}
              onClick={() => selectLevel(level)}
            >
              {LEVEL_LABELS[level].name}
            </button>
          ))}
        </div>
      </div>

      {/* 数字は幅で揺れないように等幅で出す（1文字増えても盤がずれない） */}
      <div className="status-bar tp-status">
        <span>
          のこり <strong className="tp-num">{seconds}</strong> 秒
        </span>
        <span>
          打てた語 <strong className="tp-num">{state.cleared}</strong>
        </span>
        <span>
          正確率 <strong className="tp-num">{live.accuracy}</strong>%
        </span>
      </div>

      <RecordStrip
        items={[
          ...(entry.bestScore ? [{ label: 'ベストKPM', value: String(entry.bestScore) }] : []),
          ...(entry.bestAccuracy
            ? [{ label: 'ベスト正確率', value: `${entry.bestAccuracy}%` }]
            : []),
          ...(entry.plays ? [{ label: 'プレイ', value: `${entry.plays}回` }] : []),
        ]}
      />

      <div className="tp-stage">
        <p className="tp-kana" aria-live="off">
          {word}
        </p>
        {/* 打てたところ・次の1文字・残り。間違えた瞬間だけ次の1文字が赤くなる */}
        <p className={`tp-romaji${miss ? ' tp-missed' : ''}`}>
          <span className="tp-typed">{view.typed}</span>
          <span className="tp-next">{view.rest.slice(0, 1)}</span>
          <span className="tp-rest">{view.rest.slice(1)}</span>
        </p>

        {state.status === 'ready' && (
          <div className="tp-overlay">
            <p className="tp-overlay-title">60秒でどれだけ打てるか</p>
            <p className="tp-overlay-sub">
              {LEVEL_LABELS[state.level].hint}／ローマ字で入力（shi・si どちらでも）
            </p>
            <button type="button" className="btn btn-primary" onClick={begin}>
              スタート
            </button>
          </div>
        )}

        {state.status === 'finished' && result && (
          <div className="tp-overlay">
            <p className="tp-overlay-title">
              {result.kpm} KPM
              <BestBadge improved={result.improved} />
            </p>
            <p className="tp-overlay-sub">
              正確率 {result.accuracy}%／打てた語 {result.cleared}／打鍵 {result.hits}
              {result.misses > 0 ? `（ミス ${result.misses}）` : ''}
            </p>
            <button type="button" className="btn btn-primary" onClick={reset}>
              もう一度
            </button>
          </div>
        )}
      </div>

      {/* 押せない局面でも段ごと消さない（消すと上の表示が動く） */}
      <div className="btn-row tp-controls">
        <button type="button" className="btn" onClick={reset} disabled={state.status === 'ready'}>
          やり直す
        </button>
      </div>
    </div>
  );
}
