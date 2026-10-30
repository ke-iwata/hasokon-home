'use client';

/**
 * ペグ・ソリティア（駒とび）の画面。
 *
 * 仕様: docs/features/game-peg-solitaire.md
 *
 * 跳ぶ判定・解き手・ヒント・詰みの予告・今日の 1 問の生成・タップの解釈は、すべて
 * `lib/peg-solitaire.ts`（純関数）が持つ。ここは**入力（タップとドラッグ）と描画と、跳ぶ演出の間**だけを持つ。
 *
 * ## 局面
 *
 * `choose`（駒を選ぶ）→ `jumping`（跳ぶ演出）→ `chain`（同じ駒で続けて跳べる）→ `over`（跳べる手が無い）。
 * 表示の出し分けは `phase` で決める（画面の約束 7）。跳んでいる駒・消える駒の光りは `fxRef` に置き、
 * `lib/` の状態には入れない（約束 9）。
 *
 * ## ドラッグ
 *
 * `lib/card-drag.ts` の作法（6px 以上動いたらドラッグ・ドラッグのあとの click を 1 回捨てる）に合わせる。
 * 運んでいる間は駒の要素 1 つに `transform` をかけるだけで、盤は再描画しない。
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  applyJump,
  boardOf,
  countMoves,
  DAILY_VERSION,
  dailyPuzzle,
  ENGLISH_MIN_MOVES,
  hasPeg,
  hint as findHint,
  initialState,
  isDoomed,
  isOver,
  jumpsFromHole,
  NO_SELECTION,
  remaining,
  selectionAfterJump,
  shareText,
  tap,
  VARIANT_LABEL,
  VARIANT_ORDER,
  type Jump,
  type PegState,
  type Selection,
  type Variant,
} from '@/lib/peg-solitaire';
import { createClickGuard, isDragDistance } from '@/lib/card-drag';
import { currentStreak, dailySeed, localDateKey, nextStreak } from '@/lib/daily';
import { type Improved } from '@/lib/records';
import { SITE_URL } from '@/lib/registry';
import { trackToolUse } from '@/lib/analytics';
import { BestBadge, RecordStrip, useRecords } from '@/app/_records/Records';
import { delayFor } from '@/app/_cpu/CpuSpeed';

/** 跳ぶ演出の間（ms） */
const JUMP_MS = 150;

type Phase = 'loading' | 'choose' | 'jumping' | 'chain' | 'over';

/** 盤の下の 1 行に出すヒントの知らせ */
type HintNote =
  | { kind: 'jump'; jump: Jump }
  | { kind: 'too-many'; need: number }
  | { kind: 'none' }
  | { kind: 'timeout' };

interface Game {
  variant: Variant;
  start: PegState;
  goal: number;
  history: Jump[];
  states: PegState[];
}

function newGame(variant: Variant, today: string): Game {
  if (variant === 'daily') {
    const p = dailyPuzzle(dailySeed(today, DAILY_VERSION));
    return { variant, start: p.state, goal: p.goal, history: [], states: [p.state] };
  }
  const board = boardOf(variant);
  const s = initialState(board);
  return { variant, start: s, goal: board.goal, history: [], states: [s] };
}

export default function Game() {
  const [today, setToday] = useState('');
  const [game, setGame] = useState<Game>(() => newGame('english', '2026-01-01'));
  const [phase, setPhase] = useState<Phase>('loading');
  const [sel, setSel] = useState<Selection>(NO_SELECTION);
  const [hintNote, setHintNote] = useState<HintNote | null>(null);
  /** この局でヒントを使ったか（使った局は手数の記録を更新しない） */
  const [hintUsed, setHintUsed] = useState(false);
  const [doomed, setDoomed] = useState(false);
  const [improved, setImproved] = useState<Improved | null>(null);
  const [streak, setStreak] = useState<number | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  /** ドラッグ中の駒（行き先を光らせる） */
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const records = useRecords('peg-solitaire');
  const entry = records.entry(game.variant);

  /** 跳んでいる最中の駒・消える駒（演出。状態に入れない） */
  const fxRef = useRef<Jump | null>(null);
  const timer = useRef<number | null>(null);
  const counted = useRef(false);
  const firstMoveSent = useRef(false);
  const guard = useRef(createClickGuard()).current;
  const dragRef = useRef<{ hole: number; pointerId: number; x: number; y: number; dragging: boolean; el: HTMLElement } | null>(
    null,
  );

  const board = boardOf(game.variant);
  const state = game.states[game.states.length - 1];
  const moves = countMoves(game.history);
  const pegs = remaining(state);

  const clearTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  const start = useCallback((variant: Variant, key: string) => {
    clearTimer();
    fxRef.current = null;
    counted.current = false;
    setGame(newGame(variant, key));
    setSel(NO_SELECTION);
    setHintNote(null);
    setHintUsed(false);
    setDoomed(false);
    setImproved(null);
    setCopied(false);
    setPhase('choose');
    trackToolUse('peg-solitaire', `new-${variant}`);
  }, []);

  useEffect(() => {
    // 「今日」と局面はマウント後に決める（静的書き出しの HTML に焼き付けない）
    const key = localDateKey();
    setToday(key);
    start('daily', key);
    return clearTimer;
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 局が終わったときの記録 */
  const finishGame = useCallback(
    (g: Game, s: PegState, usedHint: boolean) => {
      const v = g.variant;
      if (remaining(s) === 1) {
        const perfect = hasPeg(s, g.goal);
        const res = records.finish(
          {
            outcome: 'win',
            ...(usedHint ? {} : { moves: countMoves(g.history) }),
            ...(v === 'daily' && entry.lastClearedOn !== today ? { clearedOn: today } : {}),
          },
          v,
        );
        setImproved(res.improved);
        trackToolUse('peg-solitaire', `clear-${v}`);
        if (perfect) trackToolUse('peg-solitaire', `perfect-${v}`);
        if (v === 'daily') {
          setStreak(nextStreak(entry.lastClearedOn, today, entry.streak));
          trackToolUse('peg-solitaire', 'daily-clear');
        }
      } else {
        records.finish({ outcome: 'loss' }, v);
        trackToolUse('peg-solitaire', `stuck-${v}`);
      }
    },
    [records, entry, today],
  );

  /** 1 回跳ぶ（演出の間を置いてから確定する） */
  const doJump = useCallback(
    (jump: Jump) => {
      if (phase !== 'choose' && phase !== 'chain') return;
      if (!firstMoveSent.current) {
        firstMoveSent.current = true;
        trackToolUse('peg-solitaire', 'first-move');
      }
      if (!counted.current) {
        counted.current = true;
        records.start(game.variant);
      }
      const next = applyJump(board, state, jump).state;
      const g: Game = { ...game, history: [...game.history, jump], states: [...game.states, next] };
      fxRef.current = jump;
      setPhase('jumping');
      setHintNote(null);
      clearTimer();
      timer.current = window.setTimeout(() => {
        timer.current = null;
        fxRef.current = null;
        setGame(g);
        if (isOver(board, next)) {
          setSel(NO_SELECTION);
          setDoomed(false);
          setPhase('over');
          finishGame(g, next, hintUsed);
          return;
        }
        const after = selectionAfterJump(board, next, jump);
        setSel(after);
        setPhase(after.chain ? 'chain' : 'choose');
        // 詰みの予告（どこでも 1 本。駒が 16 本以下のときだけ、50ms で打ち切る）
        setDoomed(isDoomed(board, next));
      }, delayFor(JUMP_MS, 'normal'));
    },
    [phase, board, state, game, records, finishGame, hintUsed],
  );

  const onHole = useCallback(
    (hole: number) => {
      if (phase !== 'choose' && phase !== 'chain') return;
      const r = tap(board, state, sel, hole);
      if (r.kind === 'jump') doJump(r.jump);
      else if (r.kind === 'select') {
        setSel({ selected: r.hole, chain: false });
        setPhase('choose');
      } else if (r.kind === 'deselect') {
        setSel(NO_SELECTION);
        setPhase('choose');
      }
    },
    [phase, board, state, sel, doJump],
  );

  const undo = () => {
    if (game.history.length === 0 || phase === 'jumping') return;
    clearTimer();
    const states = game.states.slice(0, -1);
    const s = states[states.length - 1];
    setGame({ ...game, history: game.history.slice(0, -1), states });
    setSel(NO_SELECTION);
    setHintNote(null);
    setImproved(null);
    setDoomed(isDoomed(board, s));
    setPhase('choose');
  };

  const showHint = () => {
    if (phase !== 'choose' && phase !== 'chain') return;
    const h = findHint(game.variant, state, game.history);
    setHintNote(h);
    if (h.kind === 'jump') {
      setHintUsed(true);
      setSel({ selected: h.jump.from, chain: false });
      setPhase('choose');
    }
    trackToolUse('peg-solitaire', 'hint');
  };

  const copyResult = () => {
    const text = shareText({ dateKey: today, moves, url: `${SITE_URL}/peg-solitaire/` });
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        trackToolUse('peg-solitaire', 'copy-result');
      },
      () => setCopied(false),
    );
  };

  // ---- ドラッグ（6px 以上動いたら運ぶ。離した穴が行き先なら跳ぶ） ----

  const pointerDown = (hole: number) => (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (phase !== 'choose' && phase !== 'chain') return;
    if (!hasPeg(state, hole) || jumpsFromHole(board, state, hole).length === 0) return;
    const peg = e.currentTarget.querySelector<HTMLElement>('.pg-peg');
    if (!peg) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { hole, pointerId: e.pointerId, x: e.clientX, y: e.clientY, dragging: false, el: peg };
  };

  const pointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.dragging) {
      if (!isDragDistance(dx, dy)) return;
      d.dragging = true;
      setDragFrom(d.hole);
      // 連続跳びの最中に別の駒を運び始めたら、手が切り替わる
      if (sel.selected !== d.hole) setSel({ selected: d.hole, chain: false });
    }
    d.el.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const endDrag = (e: React.PointerEvent<HTMLElement>, cancelled: boolean) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (!d.dragging) return;
    d.el.style.transform = '';
    setDragFrom(null);
    guard.arm();
    requestAnimationFrame(() => guard.disarm());
    if (cancelled) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-hole]');
    const to = el ? Number(el.dataset.hole) : NaN;
    const j = jumpsFromHole(board, state, d.hole).find((x) => x.to === to);
    if (j) doJump(j);
  };

  // ---- 表示 ----

  const fx = phase === 'jumping' ? fxRef.current : null;
  const active = phase === 'choose' || phase === 'chain';
  const selected = dragFrom ?? sel.selected;
  const targets = useMemo(
    () => new Set(active && selected !== null ? jumpsFromHole(board, state, selected).map((j) => j.to) : []),
    [active, selected, board, state],
  );
  const hintJump = hintNote?.kind === 'jump' && active ? hintNote.jump : null;

  const won = phase === 'over' && pegs === 1;
  const perfect = won && hasPeg(state, game.goal);
  const streakNow = currentStreak(entry.lastClearedOn, today, entry.streak);

  let line = '';
  let lineStrong = false;
  if (phase === 'over') {
    lineStrong = true;
    if (perfect) line = `🎉 完全クリア！ 印の穴に1本（${moves}手）`;
    else if (won) line = `🎉 クリア！ 残り1本（${moves}手）。印の穴に残せば完全クリア`;
    else line = `跳べる手がなくなりました（残り${pegs}本）。待ったで戻れます`;
    if (won && game.variant === 'english') line += `・最短は${ENGLISH_MIN_MOVES}手`;
    if (won && game.variant === 'daily' && streak) line += `・連続${streak}日`;
  } else if (hintNote?.kind === 'jump') {
    line = 'ヒント：点線の穴へ跳ぶと1本残しに届きます（◎に残せるとは限りません）';
  } else if (hintNote?.kind === 'too-many') {
    line = `駒があと${hintNote.need}本減るとヒントが出せます`;
  } else if (hintNote?.kind === 'none') {
    line = 'この局面からは1本残しに届きません（待ったで戻れます）';
  } else if (hintNote?.kind === 'timeout') {
    line = 'ヒントを見つけきれませんでした。もう少し駒を減らしてから押してください';
  } else if (doomed) {
    line = 'この局面からは1本残しに届きません（待ったで戻れます）';
  } else if (phase === 'chain') {
    line = '同じ駒で続けて跳べます（1手のまま）。駒をもう一度押すと手を締めます';
  } else if (sel.selected !== null) {
    line = '光った穴を押すと跳びます';
  } else if (game.history.length === 0) {
    line =
      game.variant === 'daily'
        ? '◎の穴に最後の1本を残すと完全クリア。駒を押して始めます'
        : game.variant === 'english'
          ? `中央に1本残すのが目標。最短は${ENGLISH_MIN_MOVES}手です`
          : '上の角に1本残せば完全クリア';
  }

  const recordItems = useMemo(() => {
    const items = [{ label: 'クリア', value: `${entry.wins ?? 0}回` }];
    if (game.variant === 'daily') items.push({ label: '連続', value: `${streakNow}日` });
    else items.push({ label: '最少', value: entry.bestMoves ? `${entry.bestMoves}手` : '—' });
    return items;
  }, [entry, game.variant, streakNow]);

  const isTri = board.id === 'triangle';

  const renderHole = (h: number) => {
    const { r, c } = board.coords[h];
    const peg = hasPeg(state, h);
    const movable = active && peg && jumpsFromHole(board, state, h).length > 0;
    const cls = [
      'pg-hole',
      peg ? 'pg-has' : '',
      movable ? 'pg-movable' : '',
      selected === h ? 'pg-selected' : '',
      targets.has(h) ? 'pg-target' : '',
      h === game.goal ? 'pg-goal' : '',
      hintJump && (hintJump.from === h || hintJump.to === h) ? 'pg-hint' : '',
      fx && fx.from === h ? 'pg-leaving' : '',
      fx && fx.over === h ? 'pg-taken' : '',
      fx && fx.to === h ? 'pg-landing' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const style: CSSProperties = isTri
      ? { gridRow: r + 1, gridColumn: `${4 - r + 2 * c + 1} / span 2` }
      : { gridRow: r + 1, gridColumn: c + 1 };
    const label = `${r + 1}行${c + 1}列：${peg ? '駒' : '空き'}${h === game.goal ? '（印の穴）' : ''}${
      targets.has(h) ? '・ここへ跳べます' : ''
    }`;
    return (
      <button
        key={h}
        type="button"
        className={cls}
        style={style}
        data-hole={h}
        aria-label={label}
        aria-pressed={selected === h}
        onClick={() => onHole(h)}
        onPointerDown={pointerDown(h)}
        onPointerMove={pointerMove}
        onPointerUp={(e) => endDrag(e, false)}
        onPointerCancel={(e) => endDrag(e, true)}
      >
        <span className="pg-pit" aria-hidden="true">
          {peg && <span className="pg-peg" />}
        </span>
      </button>
    );
  };

  return (
    <div className="card pg-game">
      <div className="btn-row pg-variants">
        <div className="seg" role="group" aria-label="盤">
          {VARIANT_ORDER.map((v) => (
            <button
              key={v}
              type="button"
              className={v === game.variant ? 'active' : ''}
              aria-pressed={v === game.variant}
              onClick={() => start(v, today || localDateKey())}
            >
              {VARIANT_LABEL[v]}
            </button>
          ))}
        </div>
      </div>

      <RecordStrip items={recordItems} />

      <div className="status-bar pg-status">
        <span>
          残り <strong>{pegs}</strong>本・<strong>{moves}</strong>手
        </span>
        <span className="pg-status-note" aria-live="polite">
          {phase === 'loading'
            ? '準備しています…'
            : game.variant === 'daily'
              ? `今日の1問 ${today}`
              : game.variant === 'english'
                ? `目標 ${ENGLISH_MIN_MOVES}手`
                : '角から始める'}
        </span>
      </div>

      <div
        className={`pg-board${isTri ? ' pg-tri' : ''}`}
        role="group"
        aria-label={`${VARIANT_LABEL[game.variant]}の盤`}
        onClickCapture={(e) => {
          if (guard.swallow()) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {Array.from({ length: board.holes }, (_, h) => renderHole(h))}
      </div>

      <p className={`pg-line${lineStrong ? ' pg-line-strong' : ''}`} aria-live="polite">
        {line}
        {won && <BestBadge improved={improved} />}
      </p>

      <div className="btn-row pg-actions">
        <button type="button" className="btn" onClick={undo} disabled={game.history.length === 0 || phase === 'jumping'}>
          待った
        </button>
        <button type="button" className="btn" onClick={showHint} disabled={!active}>
          ヒント
        </button>
        {game.variant === 'daily' && won ? (
          <button type="button" className="btn btn-primary" onClick={copyResult}>
            {copied ? 'コピーしました' : '結果をコピー'}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => start(game.variant, today || localDateKey())}>
            最初から
          </button>
        )}
      </div>

      <details className="game-tips">
        <summary>この画面の見かた</summary>
        <p>
          駒を押すと、跳べる先の穴が光ります。光った穴を押すと、間の駒を取って跳びます（駒を光った穴へドラッグしても跳べます）。
          跳べる先が1つだけなら、同じ駒をもう一度押しても跳びます。続けて同じ駒で跳んだ分は1手と数え、
          続けて跳んでいる途中で同じ駒を押すと手を締めます。◎の穴が印の穴で、最後の1本をそこに残すと完全クリアです。
          ヒントは駒が16本以下になると出せます（英国式で最短の手順をたどっている間は、最初から出せます）。
        </p>
      </details>
    </div>
  );
}
