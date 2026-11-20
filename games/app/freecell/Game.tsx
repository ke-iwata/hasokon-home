'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SUIT_SYMBOL, SUITS } from '@/lib/cards';
import {
  autoMove,
  autoPlay,
  deal,
  finishAll,
  findHint,
  hasAnyMove,
  canPickUp,
  isTriviallySolvable,
  isWon,
  move,
  newSeed,
  type AutoStep,
  type FreecellState,
  type Hint,
  type Source,
} from '@/lib/freecell';
import { trackToolUse } from '@/lib/analytics';
import { CardView, DragGhost, EmptySlot, stackMargin } from '@/app/_cards/CardView';
import { useCardDrag } from '@/app/_cards/useCardDrag';
import { firstMoveAction, type DropTarget, type FirstMoveVia } from '@/lib/card-drag';
import { BestBadge, RecordStrip, useRecords, useStopwatch } from '@/app/_records/Records';
import { formatTime, type Improved } from '@/lib/records';

/**
 * 選択中の札。
 * 1タップ目で選択、2タップ目で行き先を指定する。
 * 同じ札をもう一度タップすると自動でいちばん良い場所へ移動する。
 */
type Selection =
  | { kind: 'free'; index: number }
  | { kind: 'tableau'; col: number; idx: number }
  | null;

/** 落とし先（列8・フリーセル4・ホームセル） */
const DROP_TARGETS: DropTarget[] = [
  ...Array.from({ length: 8 }, (_, col): DropTarget => ({ kind: 'tableau', col })),
  ...Array.from({ length: 4 }, (_, index): DropTarget => ({ kind: 'free', index })),
  { kind: 'foundation' },
];

/** 自動でホームへ送る1枚の動きの長さ（docs/features/freecell-asobiyasusa.md） */
const FLY_MS = 120;
/** ヒントの光を出しておく長さ */
const HINT_MS = 1500;

/** 「自動でホームへ」のスイッチは覚えておく。遊んだ記録ではないので lib/records.ts には入れない */
const AUTOPLAY_KEY = 'freecell:autoplay';

function readAutoplay(): boolean {
  try {
    return localStorage.getItem(AUTOPLAY_KEY) !== 'off';
  } catch {
    return true;
  }
}

function writeAutoplay(on: boolean): void {
  try {
    localStorage.setItem(AUTOPLAY_KEY, on ? 'on' : 'off');
  } catch {
    // 覚えられなくても、その回は普通に遊べる
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 自動送り・一気の片づけの見た目の動き。状態はもう確定していて、
 * frames は途中の盤（1枚ずつホームへ送った姿）、steps はそれぞれで動いた1枚
 */
interface Flight {
  frames: FreecellState[];
  steps: AutoStep[];
  index: number;
}

function sourceKey(src: Source): string {
  return src.kind === 'free' ? `free:${src.index}` : `tableau:${src.col}:${src.cardIndex}`;
}

/** 移動元の札の画面上の位置（動きの起点）。見つからなければ null */
function sourceRect(board: HTMLElement | null, src: Source): DOMRect | null {
  if (!board) return null;
  if (src.kind === 'free') {
    return board.querySelector(`[data-drop="free:${src.index}"] > *`)?.getBoundingClientRect() ?? null;
  }
  const pile = board.querySelector(`[data-drop="tableau:${src.col}"]`);
  const el = pile?.children[src.cardIndex] ?? pile?.lastElementChild;
  return el?.getBoundingClientRect() ?? null;
}

/** 選択を、ロジック側の移動元の形に直す */
function toSource(sel: NonNullable<Selection>): Source {
  return sel.kind === 'free'
    ? { kind: 'free', index: sel.index }
    : { kind: 'tableau', col: sel.col, cardIndex: sel.idx };
}

export default function Game() {
  const [state, setState] = useState<FreecellState | null>(null);
  const [sel, setSel] = useState<Selection>(null);
  // もどす用の履歴。フリーセルは1手の重みが大きいので最初まで遡れるようにする
  const history = useRef<FreecellState[]>([]);
  const notified = useRef(false);
  // 記録（docs/features/game-records.md）。旧 `freecell:best`（秒）は自動で移行される
  const records = useRecords('freecell');
  const entry = records.entry();
  const timer = useStopwatch();
  // この配りをプレイ数に数えたか（1手目で数える）
  const counted = useRef(false);
  // 置けない所へ落としたことを、この配りで送ったか（1ゲーム最大1回）
  const missed = useRef(false);
  const [result, setResult] = useState<{ timeMs: number; improved: Improved } | null>(null);
  // 遊びやすさ（docs/features/freecell-asobiyasusa.md）
  const [autoplay, setAutoplay] = useState(true);
  const [hint, setHint] = useState<Hint | null>(null);
  const [hintMsg, setHintMsg] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // この配りでヒントを使った回数（結果の画面に出す。記録は割り引かない）
  const [hintCount, setHintCount] = useState(0);
  // 自動送りの動き（見た目だけ。演出はゲームの状態に持たせない）
  const [flight, setFlight] = useState<Flight | null>(null);
  const flightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const flyFrom = useRef<DOMRect | null>(null);

  useEffect(() => {
    setState(deal());
    setAutoplay(readAutoplay());
  }, []);

  /** 動きを即座に終わらせる（状態はもう確定しているので、見た目を最後の盤にするだけ） */
  const endFlight = useCallback(() => {
    if (flightTimer.current) clearTimeout(flightTimer.current);
    flightTimer.current = null;
    flyFrom.current = null;
    setFlight(null);
  }, []);

  const clearHint = useCallback(() => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = null;
    setHint(null);
    setHintMsg(null);
  }, []);

  useEffect(
    () => () => {
      if (flightTimer.current) clearTimeout(flightTimer.current);
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    [],
  );

  // 1枚ずつ盤を進める。次の1枚の移動元の位置を、進める前に測っておく
  useEffect(() => {
    if (!flight) return;
    flightTimer.current = setTimeout(() => {
      const step = flight.steps[flight.index + 1];
      if (!step) {
        flyFrom.current = null;
        setFlight(null);
        return;
      }
      flyFrom.current = sourceRect(boardRef.current, step.from);
      setFlight({ ...flight, index: flight.index + 1 });
    }, FLY_MS);
    return () => {
      if (flightTimer.current) clearTimeout(flightTimer.current);
    };
  }, [flight]);

  // ホームに着いた札を、移動元の位置から飛ばす（FLIP。位置は盤の中だけで動く）
  useLayoutEffect(() => {
    const from = flyFrom.current;
    if (!flight || !from) return;
    const step = flight.steps[flight.index];
    const slot = boardRef.current?.querySelector<HTMLElement>(`[data-fslot="${step.card.suit}"] > *`);
    if (!slot) return;
    const to = slot.getBoundingClientRect();
    slot.style.transition = 'none';
    slot.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px)`;
    slot.style.zIndex = '5';
    void slot.offsetWidth;
    slot.style.transition = `transform ${FLY_MS}ms ease-out`;
    slot.style.transform = '';
    const t = setTimeout(() => {
      slot.style.transition = '';
      slot.style.zIndex = '';
    }, FLY_MS);
    return () => {
      clearTimeout(t);
      slot.style.transition = '';
      slot.style.transform = '';
      slot.style.zIndex = '';
    };
  }, [flight]);

  // つかんで運ぶ（docs/features/card-games-drag-drop.md）。置けるかは move() が決める
  const drag = useCardDrag<Source>({
    targets: DROP_TARGETS,
    canGrab: (src) => (state ? canPickUp(state, src) : false),
    canDrop: (src, t) => (state ? move(state, src, t) !== null : false),
    drop: (src, t) => (state ? apply(move(state, src, t), 'drag') : false),
    isHome: (src, t) =>
      src.kind === 'free' ? t.kind === 'free' && t.index === src.index : t.kind === 'tableau' && t.col === src.col,
    keyOf: sourceKey,
    onGrab: () => {
      endFlight();
      clearHint();
      setSel(null);
    },
    onMiss: () => {
      if (missed.current) return;
      missed.current = true;
      trackToolUse('freecell', 'drag-miss');
    },
  });

  const won = state ? isWon(state) : false;
  const moves = state?.moves ?? 0;

  // クリアの記録（タイム・手数の保存とGA4への送信）
  useEffect(() => {
    if (!won || notified.current) return;
    notified.current = true;
    trackToolUse('freecell', 'win');
    const timeMs = timer.stop();
    const { improved } = records.finish({ outcome: 'win', timeMs, moves });
    setResult({ timeMs, improved });
  }, [won, moves, records, timer]);

  if (!state) return <div className="card">配っています…</div>;

  const stuck = !won && !hasAnyMove(state);
  // 画面に出す盤。動きの途中は、途中の盤を見せる（操作は確定した state に対して行う）
  const view = flight ? flight.frames[flight.index] : state;
  // 残りが並んだ（自動送りがオフのときだけボタンを出す。オンならもう片づいている）
  const canFinish = !won && !autoplay && isTriviallySolvable(state);
  // 配った直後、1手目までの案内（docs/features/freecell-asobiyasusa.md の D）
  const firstGuide = history.current.length === 0 && state.moves === 0;

  /**
   * 状態を更新しつつ履歴を残す。null（無効な操作）なら false。
   * 利用者の手に続けて自動送り（と一気の片づけ）を確定させ、履歴には利用者の手の前だけを積む。
   * なので「もどす」1回で、利用者の手と自動送りがまとめて戻る
   */
  function apply(next: FreecellState | null, via: FirstMoveVia = 'tap'): boolean {
    if (!next || !state) return false;
    endFlight();
    clearHint();
    history.current = [...history.current, state];
    if (!counted.current) {
      counted.current = true;
      records.start();
      trackToolUse('freecell', firstMoveAction(via));
    }
    timer.begin();
    let final = next;
    let steps: AutoStep[] = [];
    if (autoplay) {
      const a = autoPlay(next);
      final = a.state;
      steps = a.steps;
      if (!isWon(final) && isTriviallySolvable(final)) {
        const f = finishAll(final);
        final = f.state;
        steps = [...steps, ...f.steps];
        trackToolUse('freecell', 'finish-all');
      }
    }
    setState(final);
    setSel(null);
    startFlight(next, steps);
    return true;
  }

  /** 送った札に1枚ずつ動きを付ける（動きを減らす設定なら付けない） */
  function startFlight(from: FreecellState, steps: AutoStep[]) {
    if (steps.length === 0 || prefersReducedMotion()) return;
    const frames: FreecellState[] = [];
    let s = from;
    for (const step of steps) {
      s = move(s, step.from, { kind: 'foundation' }) ?? s;
      frames.push(s);
    }
    flyFrom.current = sourceRect(boardRef.current, steps[0].from);
    setFlight({ frames, steps, index: 0 });
  }

  /** 自動送りがオフのときの「残りを全部ホームへ」 */
  const finishNow = () => {
    if (!state) return;
    endFlight();
    clearHint();
    const f = finishAll(state);
    if (f.steps.length === 0) return;
    history.current = [...history.current, state];
    setState(f.state);
    setSel(null);
    trackToolUse('freecell', 'finish-all');
    startFlight(state, f.steps);
  };

  const undo = () => {
    endFlight();
    clearHint();
    const prev = history.current.pop();
    if (prev) {
      setState(prev);
      setSel(null);
    }
  };

  /** 動かせる手を1つ光らせる（動かすのは利用者） */
  const showHint = () => {
    if (!state) return;
    endFlight();
    clearHint();
    setSel(null);
    const h = findHint(state, history.current[history.current.length - 1]);
    if (!h) {
      setHintMsg('動かせる手がありません。「もどす」で戻ってください。');
    } else {
      setHint(h);
      if (hintCount === 0) trackToolUse('freecell', 'hint');
      setHintCount((n) => n + 1);
    }
    hintTimer.current = setTimeout(() => {
      setHint(null);
      setHintMsg(null);
    }, h ? HINT_MS : 3000);
  };

  const toggleAutoplay = (on: boolean) => {
    setAutoplay(on);
    writeAutoplay(on);
    if (!on) trackToolUse('freecell', 'autoplay-off');
  };

  const start = (seed: number, action: string) => {
    endFlight();
    clearHint();
    setHintCount(0);
    history.current = [];
    notified.current = false;
    counted.current = false;
    missed.current = false;
    setState(deal(seed));
    setSel(null);
    setResult(null);
    timer.reset();
    trackToolUse('freecell', action);
  };

  /** 配り直し。進行中は取り消しの確認を出す */
  const newGame = () => {
    if (!won && state.moves > 0 && !window.confirm('いまのゲームをやめて新しく配り直しますか？')) {
      return;
    }
    start(newSeed(), 'new');
  };

  const replay = () => {
    if (!won && state.moves > 0 && !window.confirm(`同じ配り（No.${state.seed}）で最初からやり直しますか？`)) {
      return;
    }
    start(state.seed, 'replay');
  };

  const onFree = (index: number) => {
    endFlight();
    if (sel) {
      if (sel.kind === 'free' && sel.index === index) {
        // 同じ札をもう一度: 自動移動
        if (!apply(autoMove(state, toSource(sel)))) setSel(null);
        return;
      }
      if (apply(move(state, toSource(sel), { kind: 'free', index }))) return;
    }
    setSel(state.free[index] ? { kind: 'free', index } : null);
  };

  const onFoundation = () => {
    endFlight();
    if (!sel) return;
    if (!apply(move(state, toSource(sel), { kind: 'foundation' }))) setSel(null);
  };

  /** 場札のタップ。idx=-1 は空列 */
  const onTableau = (col: number, idx: number) => {
    endFlight();
    const pile = state.tableau[col];
    if (sel) {
      if (sel.kind === 'tableau' && sel.col === col && sel.idx === idx) {
        if (!apply(autoMove(state, toSource(sel)))) setSel(null);
        return;
      }
      // 選択中 → この列を行き先として移動を試す
      if (apply(move(state, toSource(sel), { kind: 'tableau', col }))) return;
      // 置けなければ、タップした札を選択し直す
      setSel(idx >= 0 && pile[idx] ? { kind: 'tableau', col, idx } : null);
      return;
    }
    if (idx >= 0 && pile[idx]) setSel({ kind: 'tableau', col, idx });
  };

  const isSelected = (col: number, idx: number) =>
    sel?.kind === 'tableau' && sel.col === col && idx >= sel.idx;

  // 運んでいる並び（元の位置は半透明で残す）
  const held = drag.drag?.src ?? null;
  const isHeld = (src: Source) =>
    held !== null &&
    (held.kind === 'free'
      ? src.kind === 'free' && src.index === held.index
      : src.kind === 'tableau' && src.col === held.col && src.cardIndex >= held.cardIndex);
  const heldCards = !held
    ? []
    : held.kind === 'free'
      ? [state.free[held.index]].filter((c) => c !== null)
      : state.tableau[held.col].slice(held.cardIndex);
  /** 札の状態のクラス（つかめる・運んでいる元・揺れ） */
  const cardClass = (src: Source) =>
    [
      canPickUp(state, src) ? 'grabbable' : '',
      isHeld(src) ? 'drag-origin' : '',
      drag.isShaking(src) ? 'shake' : '',
    ]
      .filter(Boolean)
      .join(' ');
  const dropClass = (t: DropTarget) => (drag.isDropOk(t) ? 'drop-ok' : '');

  // ヒントの光（移動元の並びと行き先）
  const hintFrom = (src: Source) =>
    !!hint &&
    (hint.from.kind === 'free'
      ? src.kind === 'free' && src.index === hint.from.index
      : src.kind === 'tableau' && src.col === hint.from.col && src.cardIndex >= hint.from.cardIndex);
  const hintSuit =
    hint?.to.kind === 'foundation'
      ? (hint.from.kind === 'free' ? state.free[hint.from.index] : state.tableau[hint.from.col][hint.from.cardIndex])
          ?.suit
      : undefined;
  const hintFree = (index: number) => hint?.to.kind === 'free' && hint.to.index === index;
  const hintCol = (col: number) => hint?.to.kind === 'tableau' && hint.to.col === col;
  const cardHint = (src: Source, last: boolean) =>
    hintFrom(src) ||
    (src.kind === 'free' && hintFree(src.index)) ||
    (src.kind === 'tableau' && last && hintCol(src.col));
  const withHint = (cls: string, on: boolean) => (on ? `${cls} hinted`.trim() : cls);

  const hintButton = (inline: boolean) => (
    <button type="button" className={inline ? 'fc-inline-btn' : 'btn'} onClick={showHint}>
      ヒント
    </button>
  );

  return (
    <div className="card cardgame" ref={boardRef} {...drag.boardProps}>
      <div className="status-bar">
        <span>
          手数: {state.moves}
          {'　'}⏱ {formatTime(timer.ms)}
        </span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn" onClick={undo} disabled={history.current.length === 0}>
            もどす
          </button>
          <button type="button" className="btn" onClick={newGame}>
            新しく配る
          </button>
        </span>
      </div>

      <RecordStrip
        items={[
          ...(entry.bestTimeMs ? [{ label: 'ベスト', value: formatTime(entry.bestTimeMs) }] : []),
          ...(entry.bestMoves ? [{ label: '最少手数', value: `${entry.bestMoves}手` }] : []),
          ...(entry.plays
            ? [{ label: 'クリア', value: `${entry.wins ?? 0} / ${entry.plays}回` }]
            : []),
        ]}
      />

      {/* 文言が切り替わっても盤面が動かないよう、常に2行分の高さ */}
      <p className="hint-row">
        {won ? (
          <span style={{ color: 'var(--ok)', fontWeight: 700 }}>
            🎉 クリア！{state.moves}手・{formatTime(result?.timeMs ?? timer.ms)}
            {result && !result.improved.time && entry.bestTimeMs
              ? `（ベスト ${formatTime(entry.bestTimeMs)}）`
              : ''}
            {hintCount > 0 ? `・ヒント${hintCount}回` : ''}
            <BestBadge improved={result?.improved ?? null} />
          </span>
        ) : stuck ? (
          <span style={{ color: 'var(--danger)', fontWeight: 700 }}>
            動かせる手がありません。「もどす」か「新しく配る」でやり直してください。
          </span>
        ) : hintMsg ? (
          <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{hintMsg}</span>
        ) : canFinish ? (
          <>
            残りは順に並んでいます。{' '}
            <button type="button" className="fc-inline-btn" onClick={finishNow}>
              残りを全部ホームへ
            </button>
          </>
        ) : sel ? (
          '置きたい場所（列・フリーセル・ホームセル）をタップ。同じ札をもう一度タップで自動移動。'
        ) : firstGuide ? (
          <>下の札から動かせます。まずは A を右上のホームへ。迷ったら {hintButton(true)}</>
        ) : (
          '動かしたい札をドラッグするか、タップして選択します。'
        )}
      </p>

      {/* 上段: フリーセル4つ・ホームセル4つ */}
      <div className="top-row">
        <div className="piles" style={{ flex: 1 }} aria-label="フリーセル">
          {view.free.map((c, i) => (
            <div key={i} style={{ width: '25%' }} data-drop={`free:${i}`} className={dropClass({ kind: 'free', index: i })}>
              {c ? (
                <CardView
                  card={c}
                  selected={sel?.kind === 'free' && sel.index === i}
                  onClick={() => onFree(i)}
                  className={withHint(cardClass({ kind: 'free', index: i }), cardHint({ kind: 'free', index: i }, true))}
                  pointer={drag.bind({ kind: 'free', index: i })}
                />
              ) : (
                <EmptySlot onClick={() => onFree(i)} className={hintFree(i) ? 'hinted' : ''} />
              )}
            </div>
          ))}
        </div>
        <div className="piles" style={{ flex: 1 }} aria-label="ホームセル">
          {SUITS.map((suit) => {
            const pile = view.foundations[suit];
            const top = pile[pile.length - 1];
            const lit = hintSuit === suit;
            return (
              <div
                key={suit}
                style={{ width: '25%' }}
                data-drop="foundation"
                data-fslot={suit}
                className={dropClass({ kind: 'foundation' })}
              >
                {top ? (
                  <CardView card={top} onClick={onFoundation} className={lit ? 'hinted' : ''} />
                ) : (
                  <EmptySlot label={SUIT_SYMBOL[suit]} onClick={onFoundation} className={lit ? 'hinted' : ''} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 場札8列。タップで選択 → タップで行き先指定 */}
      <div className="tableau cols8">
        {view.tableau.map((pile, col) => (
          <div
            key={col}
            className={`pile${drag.isDropOk({ kind: 'tableau', col }) ? ' drop-ok' : ''}`}
            data-drop={`tableau:${col}`}
          >
            {pile.length === 0 && (
              <EmptySlot onClick={() => onTableau(col, -1)} className={hintCol(col) ? 'hinted' : ''} />
            )}
            {pile.map((c, i) => (
              <CardView
                key={c.id}
                card={c}
                selected={isSelected(col, i)}
                style={stackMargin(i, pile[i - 1]?.faceUp)}
                onClick={() => onTableau(col, i)}
                className={withHint(
                  cardClass({ kind: 'tableau', col, cardIndex: i }),
                  cardHint({ kind: 'tableau', col, cardIndex: i }, i === pile.length - 1),
                )}
                pointer={drag.bind({ kind: 'tableau', col, cardIndex: i })}
              />
            ))}
          </div>
        ))}
      </div>

      {drag.drag && (
        <DragGhost
          cards={heldCards}
          left={drag.drag.left}
          top={drag.drag.top}
          width={drag.drag.width}
          ghostRef={drag.ghostRef}
        />
      )}

      <div className="status-bar" style={{ marginTop: 10 }}>
        <span>配り番号: No.{state.seed}</span>
        <span className="fc-tools">
          <label className="fc-switch">
            <input type="checkbox" checked={autoplay} onChange={(e) => toggleAutoplay(e.target.checked)} />
            自動でホームへ
          </label>
          {hintButton(false)}
          <button type="button" className="btn" onClick={replay}>
            同じ配りをもう一度
          </button>
        </span>
      </div>
    </div>
  );
}
