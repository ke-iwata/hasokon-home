'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  availableMatches,
  cleared,
  deadlocked,
  DEFAULT_LEVEL,
  hint as findHint,
  LEVELS,
  newGame,
  remaining,
  shuffleRemaining,
  tap,
  tileCount,
  undo,
  type Level,
  type NikakudoriState,
  type Path,
} from '@/lib/nikakudori';
import { faceById } from '@/lib/mahjong-tiles';
import { trackToolUse } from '@/lib/analytics';
import { BestBadge, RecordStrip, useRecords, useStopwatch } from '@/app/_records/Records';
import { formatTime, type Improved } from '@/lib/records';
import TileFace from '@/app/mahjong-solitaire/TileFace';

/** 「消せた経路」の光る時間（ms）。短すぎると目で追えず、長すぎると次の手が止まる */
const PATH_MS = 380;
/** ヒントで光らせておく時間（ms） */
const HINT_MS = 2200;

/**
 * 二角取り（docs/features/game-nikakudori.md）の画面。
 *
 * ロジックは `lib/nikakudori.ts` に、絵柄は `app/mahjong-solitaire/TileFace.tsx` に
 * 集約してある（麻雀ソリティアと同じ牌を再利用する仕様書の約束）。
 * この Game.tsx は入力と描画だけを持つ。演出（消せたときの経路光）は状態には入れず、
 * useState で持って一定時間後に自然に消す（`games/CLAUDE.md` の「演出はゲームの状態に
 * 持たせない」に従う）。
 */
export default function Game() {
  const [level, setLevel] = useState<Level>(DEFAULT_LEVEL);
  const [state, setState] = useState<NikakudoriState | null>(null);
  const [hinted, setHinted] = useState<[number, number] | null>(null);
  /** 直近に消した経路。線を描くために使い、一定時間で消す */
  const [flash, setFlash] = useState<Path | null>(null);
  const finished = useRef(false);
  const notified = useRef(false);
  const counted = useRef(false);
  const dealt = useRef(false);
  // 記録は難易度ごとに分けて持つ（docs/features/game-records.md）
  const records = useRecords('nikakudori');
  const entry = records.entry(level);
  const timer = useStopwatch();
  const [result, setResult] = useState<{ timeMs: number; improved: Improved } | null>(null);

  const start = useCallback(
    (l: Level) => {
      finished.current = false;
      notified.current = false;
      counted.current = false;
      setHinted(null);
      setFlash(null);
      setResult(null);
      timer.reset();
      setState(newGame(l));
      trackToolUse('nikakudori', `new-${l}`);
    },
    [timer],
  );

  // 最初の1回だけ配る。ブラウザに載ってからにすることで、静的HTMLと食い違わない
  useEffect(() => {
    if (dealt.current) return;
    dealt.current = true;
    start(level);
  }, [level, start]);

  // ヒントは一定時間で自然に消す
  useEffect(() => {
    if (!hinted) return;
    const timer = window.setTimeout(() => setHinted(null), HINT_MS);
    return () => window.clearTimeout(timer);
  }, [hinted]);

  // 消えた経路の光も自然に消す
  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), PATH_MS);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const matches = useMemo(() => (state ? availableMatches(state) : []), [state]);
  const left = state ? remaining(state) : 0;
  const done = state ? cleared(state) : false;
  const stuck = state ? deadlocked(state) : false;

  useEffect(() => {
    if (!done || finished.current || !state) return;
    finished.current = true;
    trackToolUse('nikakudori', `clear-${state.level}`);
    const timeMs = timer.stop();
    const { improved } = records.finish({ outcome: 'win', timeMs }, state.level);
    setResult({ timeMs, improved });
  }, [done, records, state, timer]);

  useEffect(() => {
    if (!stuck || notified.current || !state) return;
    notified.current = true;
    trackToolUse('nikakudori', `deadlock-${state.level}`);
  }, [stuck, state]);

  const onTap = (slot: number) => {
    if (!state) return;
    setHinted(null);
    if (!counted.current) {
      counted.current = true;
      records.start(level);
    }
    timer.begin();
    const outcome = tap(state, slot);
    setState(outcome.state);
    if (outcome.result === 'matched' && outcome.path) setFlash(outcome.path);
  };

  const onUndo = () => {
    if (!state || state.removed.length === 0) return;
    setHinted(null);
    notified.current = false;
    setState(undo(state));
    trackToolUse('nikakudori', 'undo');
  };

  const onHint = () => {
    if (!state) return;
    const pair = findHint(state);
    if (!pair) return;
    setHinted(pair);
    setState({ ...state, hints: state.hints + 1 });
    trackToolUse('nikakudori', 'hint');
  };

  const onShuffle = () => {
    if (!state) return;
    setHinted(null);
    notified.current = false;
    setState(shuffleRemaining(state));
    trackToolUse('nikakudori', 'shuffle');
  };

  const onChangeLevel = (l: Level) => {
    if (l === level) return;
    setLevel(l);
    start(l);
  };

  const cols = state?.cols ?? LEVELS[level].cols;
  const rows = state?.rows ?? LEVELS[level].rows;
  // 経路の座標を「マスの中央」に直す。盤の外は -0.5 / rows+0.5 に丸めて枠外へ少しだけ出す
  const pathPoints = flash
    ? flash
        .map(({ r, c }) => {
          const cx = ((c + 0.5) / cols) * 100;
          const cy = ((r + 0.5) / rows) * 100;
          return `${cx.toFixed(2)},${cy.toFixed(2)}`;
        })
        .join(' ')
    : '';

  return (
    <div className="card">
      <div className="btn-row">
        <div className="seg" role="group" aria-label="広さ">
          {(Object.keys(LEVELS) as Level[]).map((l) => (
            <button
              key={l}
              type="button"
              className={l === level ? 'active' : ''}
              aria-pressed={l === level}
              onClick={() => onChangeLevel(l)}
            >
              {LEVELS[l].label}
            </button>
          ))}
        </div>
        <button type="button" className="btn" onClick={() => start(level)}>
          はじめから
        </button>
      </div>

      <div className="status-bar">
        <span>
          残り <strong style={{ color: 'var(--text)' }}>{left}</strong> / {tileCount(level)} 枚
          {'　'}⏱ {formatTime(timer.ms)}
        </span>
        <span>
          {done
            ? 'クリア！'
            : stuck
              ? '消せる組がありません'
              : `消せる組 ${matches.length}`}
        </span>
      </div>

      <RecordStrip
        items={[
          ...(entry.bestTimeMs
            ? [{ label: `${LEVELS[level].label}のベスト`, value: formatTime(entry.bestTimeMs) }]
            : []),
          ...(entry.plays
            ? [{ label: 'クリア', value: `${entry.wins ?? 0} / ${entry.plays}回` }]
            : []),
        ]}
      />

      {done && (
        <p className="status-bar" style={{ color: 'var(--ok)', fontWeight: 700 }}>
          🎉 全部消せました！タイム: {formatTime(result?.timeMs ?? timer.ms)}
          {result && !result.improved.time && entry.bestTimeMs
            ? `（ベスト ${formatTime(entry.bestTimeMs)}）`
            : ''}
          <BestBadge improved={result?.improved ?? null} />
        </p>
      )}

      {stuck && !done && (
        <p className="status-bar" style={{ color: 'var(--danger)', fontWeight: 700 }}>
          詰みです。「もどす」で打ち直すか、「並べ替え」で残りを配り直してください。
        </p>
      )}

      <div
        className="nk-board"
        role="group"
        aria-label="二角取りの盤面"
        style={
          {
            '--nk-cols': cols,
            '--nk-rows': rows,
            '--board-max': cols >= 14 ? '620px' : cols >= 12 ? '540px' : '460px',
          } as React.CSSProperties
        }
      >
        {state &&
          state.faces.map((face, slot) => {
            if (face === null) return <div key={slot} className="nk-slot nk-empty" aria-hidden="true" />;
            const cls = [
              'nk-tile',
              state.selected === slot ? 'selected' : '',
              hinted && (hinted[0] === slot || hinted[1] === slot) ? 'hinted' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <button
                key={slot}
                type="button"
                className={cls}
                onClick={() => onTap(slot)}
                aria-pressed={state.selected === slot}
                aria-label={faceById(face).name}
              >
                <TileFace id={face} />
              </button>
            );
          })}
        {!state && <p className="nk-loading">牌を配っています…</p>}

        {/* 消したときの経路。SVGは % 座標で盤面いっぱいに敷く */}
        {flash && (
          <svg className="nk-path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polyline points={pathPoints} />
          </svg>
        )}
      </div>

      <div className="btn-row" style={{ marginTop: 14, justifyContent: 'center' }}>
        <button
          type="button"
          className="btn"
          onClick={onUndo}
          disabled={!state || state.removed.length === 0}
        >
          ↩ もどす
        </button>
        <button
          type="button"
          className="btn"
          onClick={onHint}
          disabled={!state || matches.length === 0}
        >
          ヒント
        </button>
        <button type="button" className="btn" onClick={onShuffle} disabled={!state || done}>
          並べ替え
        </button>
      </div>

      <details className="game-tips">
        <summary>この画面の見かた</summary>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>
          同じ絵柄の牌を2つタップすると、<strong>曲がり角2回以内（直線3本以内）で
          途中に牌が無ければ</strong>消えます。線は盤の外を通ってもかまいません。
          配られる盤面は必ず最後まで消せるようになっています。
          「ヒント」と「並べ替え」の使用回数は成績に記録されます。
        </p>
      </details>
    </div>
  );
}
