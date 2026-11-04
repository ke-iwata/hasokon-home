'use client';

/**
 * チェスの画面。
 *
 * 仕様: docs/features/game-chess.md
 *
 * 指し手の生成・終局の判定・CPU・今日の 1 手詰めの生成は、すべて `lib/chess.ts`（純関数）が持つ。
 * ここは**入力と描画だけ**。
 *
 * 操作は 2 通り：① 駒をタップ → 動ける先に丸（取れる先は輪）→ 行き先をタップ。
 * ② ドラッグ＆ドロップ（押してから 6px 以上動かしたらドラッグ。未満で離したらタップ扱い。
 * `lib/card-drag.ts` の閾値を使う）。動ける先以外に落とすと元に戻る。
 *
 * 表示の出し分けは局面（`phase`：idle / me / promote / cpu / over）で決める（画面の約束 7）。
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import {
  applyMove,
  colOf,
  cpuMove,
  dailyPuzzle,
  endEvent,
  inCheck,
  isOver,
  KING,
  legalMoves,
  LEVELS,
  outcomeOf,
  positionKey,
  PUZZLE_VERSION,
  rowOf,
  sameMove,
  settleGame,
  squareName,
  status,
  toSan,
  type ChessState,
  type Color,
  type Level,
  type Move,
  type Outcome,
  type Puzzle,
  type Status,
  initialState,
  PROMO_PIECES,
} from '@/lib/chess';
import { isDragDistance } from '@/lib/card-drag';
import { currentStreak, dailySeed, localDateKey } from '@/lib/daily';
import { winRate } from '@/lib/records';
import { trackToolUse } from '@/lib/analytics';
import { RecordStrip, useRecords } from '@/app/_records/Records';
import { CpuSpeedSeg, delayFor, readCpuSpeed, writeCpuSpeed, type CpuSpeed } from '@/app/_cpu/CpuSpeed';
import { StartGate } from '@/app/_cpu/StartGate';
import { PieceIcon, PieceShape } from './Pieces';

const SLUG = 'chess';
const DAILY_VARIANT = 'daily';

/** 設定は覚えておく（遊んだ記録ではないので `lib/records.ts` には入れない。リバーシと同じ） */
const LEVEL_KEY = `${SLUG}:level`;
const COLOR_KEY = `${SLUG}:color`;

function readSetting(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 覚えられなくても、その対局は普通に遊べる
  }
}

/** CPU が考えているように見せる最短の間（ms、「ふつう」のとき）。倍率は app/_cpu/CpuSpeed.tsx */
const THINK_DELAY = 420;

type Mode = 'cpu' | 'daily';
type Phase = 'idle' | 'me' | 'promote' | 'cpu' | 'over';

const COLOR_LABEL: Record<Color, string> = { w: '白（先手）', b: '黒（後手）' };
const SIDE_NAME: Record<Color, string> = { w: '白', b: '黒' };

/** 1 手ぶんの記録。最初の 1 つは手が無い（初期局面） */
interface Ply {
  state: ChessState;
  move: Move | null;
  san: string;
  /** 同一局面 3 回の判定用のキー（`positionKey`） */
  key: string;
}

function startPly(state: ChessState): Ply {
  return { state, move: null, san: '', key: positionKey(state) };
}

function nextPly(prev: ChessState, move: Move): Ply {
  const state = applyMove(prev, move);
  return { state, move, san: toSan(prev, move), key: positionKey(state) };
}

const END_TEXT: Record<Exclude<Status, 'play' | 'check' | 'checkmate'>, string> = {
  stalemate: 'ステイルメイトで引き分け（動ける手が無く、チェックもされていません）',
  'draw-repetition': '同じ局面が3回現れたので引き分けです',
  'draw-50': '50手ルール（50手ずつ取りもポーンの移動も無い）で引き分けです',
  'draw-material': '駒が足りず、どちらも詰ませられないので引き分けです',
};

export default function Game() {
  const [mode, setMode] = useState<Mode>('cpu');
  const [level, setLevel] = useState<Level>('normal');
  const [human, setHuman] = useState<Color>('w');
  const [speed, setSpeed] = useState<CpuSpeed>('normal');
  const [ready, setReady] = useState(false);
  const [history, setHistory] = useState<Ply[]>(() => [startPly(initialState())]);
  const [begun, setBegun] = useState(false);
  const [resigned, setResigned] = useState(false);
  const [undoUsed, setUndoUsed] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [promo, setPromo] = useState<{ from: number; to: number } | null>(null);
  const [cursor, setCursor] = useState(52);
  /** ドラッグ中の駒（SVG の座標で、マスの左上） */
  const [drag, setDrag] = useState<{ from: number; x: number; y: number } | null>(null);

  // 今日の 1 手詰め
  const [today, setToday] = useState('');
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [tries, setTries] = useState(0);
  /** いまの挑戦の結果。null は考え中 */
  const [verdict, setVerdict] = useState<{ ok: boolean; san: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const records = useRecords(SLUG);
  const variant = mode === 'daily' ? DAILY_VARIANT : `cpu-${level}`;
  const entry = records.entry(variant);
  /** 1 局につき 1 回だけ記録・計測する */
  const settled = useRef(false);
  const startedRec = useRef(false);
  const firstMoveSent = useRef(false);
  const dailyRecorded = useRef(false);

  const current = history[history.length - 1];
  const state = current.state;
  const keys = useMemo(() => history.map((p) => p.key), [history]);
  const st: Status = useMemo(() => status(state, keys), [state, keys]);
  const legal = useMemo(() => legalMoves(state), [state]);

  /** 自分の色。今日の 1 手詰めでは手番側 */
  const me: Color = mode === 'daily' ? (puzzle?.state.turn ?? 'w') : human;
  const flip = me === 'b';

  const phase: Phase =
    mode === 'daily'
      ? !puzzle || verdict
        ? 'over'
        : promo
          ? 'promote'
          : 'me'
      : !begun
        ? 'idle'
        : resigned || isOver(st)
          ? 'over'
          : promo
            ? 'promote'
            : state.turn === human
              ? 'me'
              : 'cpu';

  // ---------------------------------------------------------------- 始め方

  const newGame = useCallback((nextLevel: Level, nextHuman: Color) => {
    setHistory([startPly(initialState())]);
    setBegun(false);
    setResigned(false);
    setUndoUsed(false);
    setSelected(null);
    setPromo(null);
    setDrag(null);
    settled.current = false;
    startedRec.current = false;
    trackToolUse(SLUG, `new-${nextLevel}-${nextHuman === 'w' ? 'white' : 'black'}`);
  }, []);

  const loadDaily = useCallback(() => {
    const key = localDateKey();
    const p = dailyPuzzle(dailySeed(key, PUZZLE_VERSION));
    setToday(key);
    setPuzzle(p);
    setHistory([startPly(p.state)]);
    setTries(0);
    setVerdict(null);
    setSelected(null);
    setPromo(null);
    setDrag(null);
    setCopied(false);
  }, []);

  useEffect(() => {
    const l = readSetting(LEVEL_KEY);
    setLevel(l === 'easy' || l === 'hard' ? l : 'normal');
    setHuman(readSetting(COLOR_KEY) === 'b' ? 'b' : 'w');
    setSpeed(readCpuSpeed(SLUG));
    setToday(localDateKey());
    setReady(true);
  }, []);

  const changeMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    if (next === 'daily') loadDaily();
    else newGame(level, human);
  };

  const changeLevel = (next: Level) => {
    setLevel(next);
    writeSetting(LEVEL_KEY, next);
    newGame(next, human);
  };

  const changeColor = (next: Color) => {
    setHuman(next);
    writeSetting(COLOR_KEY, next);
    newGame(level, next);
  };

  // ---------------------------------------------------------------- CPU の手番

  useEffect(() => {
    if (!ready || mode !== 'cpu' || phase !== 'cpu') return;
    const timer = window.setTimeout(() => {
      const m = cpuMove(state, level, Math.random);
      if (m) setHistory((h) => [...h, nextPly(h[h.length - 1].state, m)]);
    }, delayFor(THINK_DELAY, speed));
    return () => window.clearTimeout(timer);
  }, [ready, mode, phase, state, level, speed]);

  // ---------------------------------------------------------------- 終局の記録

  const humanMoves = useMemo(
    () => history.filter((p) => p.move && (p.move.piece > 0 ? 'w' : 'b') === human).length,
    [history, human],
  );
  const outcome: Outcome | null =
    mode === 'cpu' && phase === 'over' ? (resigned ? 'loss' : outcomeOf(st, state.turn, human)) : null;

  useEffect(() => {
    if (mode !== 'cpu' || outcome === null || settled.current) return;
    settled.current = true;
    trackToolUse(SLUG, resigned ? `resign-${level}` : endEvent(outcome, level, undoUsed));
    settleGame({ outcome, level, undoUsed, humanMoves }, records.finish);
  }, [mode, outcome, resigned, level, undoUsed, humanMoves, records.finish]);

  // ---------------------------------------------------------------- 指す

  const commit = useCallback(
    (move: Move) => {
      setSelected(null);
      setPromo(null);
      setDrag(null);
      if (!firstMoveSent.current) {
        firstMoveSent.current = true;
        trackToolUse(SLUG, 'first-move');
      }
      if (mode === 'daily') {
        if (!puzzle) return;
        const ok = sameMove(move, puzzle.answer);
        const n = tries + 1;
        setTries(n);
        setVerdict({ ok, san: toSan(state, move, legal) });
        // 正解なら詰んだ局面を見せる。外れたら問題の局面のまま、正解の手を矢印で示す
        setHistory((h) => (ok ? [h[0], nextPly(h[0].state, move)] : [h[0]]));
        if (n === 1 && !dailyRecorded.current) {
          dailyRecorded.current = true;
          trackToolUse(SLUG, ok ? 'daily-clear' : 'daily-miss');
          // 記録は最初の 1 回で付ける。今日すでに解いていれば付け直さない
          if (entry.lastClearedOn !== today) {
            records.start(DAILY_VARIANT);
            records.finish(ok ? { outcome: 'win', clearedOn: today } : { outcome: 'loss' }, DAILY_VARIANT);
          }
        }
        return;
      }
      setBegun(true);
      if (!startedRec.current) {
        startedRec.current = true;
        records.start(`cpu-${level}`);
      }
      setHistory((h) => [...h, nextPly(h[h.length - 1].state, move)]);
    },
    [mode, puzzle, tries, state, legal, entry.lastClearedOn, today, records, level],
  );

  const targetsOf = useCallback((from: number) => legal.filter((m) => m.from === from), [legal]);

  const tryMove = useCallback(
    (from: number, to: number): boolean => {
      const ms = legal.filter((m) => m.from === from && m.to === to);
      if (ms.length === 0) return false;
      if (ms.length > 1) {
        // プロモーション：行き先のマスの上に 4 つの駒を出して選ばせる
        setPromo({ from, to });
        setSelected(from);
        setDrag(null);
        return true;
      }
      commit(ms[0]);
      return true;
    },
    [legal, commit],
  );

  const own = (sq: number) => {
    const p = state.board[sq];
    return p !== 0 && (p > 0 ? 'w' : 'b') === me;
  };

  /** プロモーションの選択肢のマス（盤の添字）と駒 */
  const promoChoices = useMemo(() => {
    if (!promo) return [];
    const toRow = rowOf(promo.to);
    const step = toRow === 0 ? 8 : -8;
    return PROMO_PIECES.map((kind, i) => ({ sq: promo.to + step * i, kind }));
  }, [promo]);

  const onSquare = (sq: number) => {
    if (phase === 'promote' && promo) {
      const choice = promoChoices.find((c) => c.sq === sq);
      if (choice) {
        const m = legal.find((x) => x.from === promo.from && x.to === promo.to && x.promo === choice.kind);
        if (m) commit(m);
      } else {
        setPromo(null);
      }
      return;
    }
    // スタート待ち（idle）は StartGate の幕が盤を覆っていて、盤には触れない
    if (phase !== 'me') return;
    if (selected !== null && selected !== sq && tryMove(selected, sq)) return;
    if (own(sq) && selected !== sq) setSelected(sq);
    else setSelected(null);
  };

  // ---------------------------------------------------------------- 1 手もどす・投了

  /** 戻り先：いまより前で、自分の番だった最後の局面 */
  const undoTarget = useMemo(() => {
    for (let i = history.length - 2; i >= 0; i--) if (history[i].state.turn === human) return i;
    return null;
  }, [history, human]);
  const canUndo = mode === 'cpu' && (phase === 'me' || phase === 'over') && undoTarget !== null;

  const undo = () => {
    if (!canUndo || undoTarget === null) return;
    setHistory((h) => h.slice(0, undoTarget + 1));
    setUndoUsed(true);
    setResigned(false);
    setSelected(null);
    settled.current = false;
    trackToolUse(SLUG, 'undo');
  };

  const resign = () => {
    if (mode !== 'cpu' || phase !== 'me') return;
    setResigned(true);
    setSelected(null);
  };

  // ---------------------------------------------------------------- 今日の 1 手詰め

  const retry = () => {
    if (!puzzle) return;
    setHistory([startPly(puzzle.state)]);
    setVerdict(null);
    setSelected(null);
    setCopied(false);
  };

  const shareText = () => {
    const [, m, d] = today.split('-').map(Number);
    const mark = verdict?.ok ? '✅' : '❌';
    return `hasokon チェス 今日の1手詰め ${m}/${d} ${mark}（${tries}回目）\nhttps://hasokon.com/games/chess/`;
  };

  const copyResult = async () => {
    try {
      await navigator.clipboard.writeText(shareText());
      setCopied(true);
      trackToolUse(SLUG, 'copy-result');
    } catch {
      setCopied(false);
    }
  };

  // ---------------------------------------------------------------- 盤の入力（タップ・ドラッグ・キー）

  const svgRef = useRef<SVGSVGElement>(null);
  const press = useRef<{ sq: number; x: number; y: number; dragging: boolean; id: number } | null>(null);

  const toView = (sq: number) => (flip ? 63 - sq : sq);
  const pointToSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * 8, y: ((clientY - r.top) / r.height) * 8 };
  };
  const squareAt = (clientX: number, clientY: number): number | null => {
    const p = pointToSvg(clientX, clientY);
    if (!p || p.x < 0 || p.y < 0 || p.x >= 8 || p.y >= 8) return null;
    return toView(Math.floor(p.y) * 8 + Math.floor(p.x));
  };

  const canDragFrom = (sq: number) =>
    phase === 'me' && own(sq);

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const sq = squareAt(e.clientX, e.clientY);
    if (sq === null) return;
    press.current = { sq, x: e.clientX, y: e.clientY, dragging: false, id: e.pointerId };
    if (canDragFrom(sq)) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // 捕まえられなくてもタップは効く
      }
    }
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId || !canDragFrom(p.sq)) return;
    if (!p.dragging && !isDragDistance(e.clientX - p.x, e.clientY - p.y)) return;
    p.dragging = true;
    const pt = pointToSvg(e.clientX, e.clientY);
    if (pt) {
      setSelected(p.sq);
      setDrag({ from: p.sq, x: pt.x - 0.5, y: pt.y - 0.5 });
    }
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const p = press.current;
    press.current = null;
    if (!p || p.id !== e.pointerId) return;
    if (!p.dragging) {
      onSquare(p.sq);
      return;
    }
    const to = squareAt(e.clientX, e.clientY);
    setDrag(null);
    // 動ける先以外に落とすと元に戻る（選択は残して、続けてタップでも指せるようにする）
    if (to === null || to === p.sq || !tryMove(p.sq, to)) setSelected(p.sq);
  };

  const onPointerCancel = () => {
    press.current = null;
    setDrag(null);
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const dir: Record<string, number> = { ArrowUp: -8, ArrowDown: 8, ArrowLeft: -1, ArrowRight: 1 };
    if (e.key in dir) {
      e.preventDefault();
      // 見た目の向きで動かす（黒番は盤を回しているので添字の向きが逆になる）
      const v = toView(cursor);
      const d = dir[e.key];
      const nv = v + d;
      if (nv < 0 || nv > 63 || (Math.abs(d) === 1 && rowOf(nv) !== rowOf(v))) return;
      setCursor(toView(nv));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSquare(cursor);
    } else if (e.key === 'Escape') {
      setSelected(null);
      setPromo(null);
    }
  };

  // ---------------------------------------------------------------- 描画の材料

  const targets = selected !== null && (phase === 'me' || phase === 'promote') ? targetsOf(selected) : [];
  const targetSet = new Set(targets.map((m) => m.to));
  const lastMove = current.move;
  const checkSq = useMemo(() => {
    if (!inCheck(state)) return -1;
    const k = state.turn === 'w' ? KING : -KING;
    return state.board.indexOf(k);
  }, [state]);

  /** 取った駒（自分が取った駒・CPU が取った駒） */
  const captured = useMemo(() => {
    const byColor: Record<Color, number[]> = { w: [], b: [] };
    for (const p of history) {
      if (p.move && p.move.captured) byColor[p.move.piece > 0 ? 'w' : 'b'].push(p.move.captured);
    }
    const order = (a: number, b: number) => Math.abs(b) - Math.abs(a);
    return { w: byColor.w.sort(order), b: byColor.b.sort(order) };
  }, [history]);

  const answerArrow = mode === 'daily' && verdict && !verdict.ok && puzzle ? puzzle.answer : null;

  // ---------------------------------------------------------------- 知らせの行

  const lastSan = current.san;
  let message = '';
  if (mode === 'daily') {
    if (!puzzle) message = '問題を作っています…';
    else if (verdict?.ok) message = `🎉 正解！ ${verdict.san} でチェックメイトです（${tries}回目）`;
    else if (verdict) message = `残念、${verdict.san} では詰みません。正解の手を矢印で示しています`;
    else if (phase === 'promote') message = '成る駒を選んでください';
    else message = `${SIDE_NAME[me]}の番です。1手でチェックメイトにする手を指してください`;
  } else if (phase === 'idle') {
    message = human === 'w' ? 'スタートを押すと始まります。駒をタップすると動ける先が光ります' : 'スタートを押すと CPU（白）が指し始めます';
  } else if (phase === 'cpu') {
    message = 'CPUが考えています…';
  } else if (phase === 'promote') {
    message = '成る駒を選んでください';
  } else if (phase === 'me') {
    const prefix = lastSan ? `CPU：${lastSan}　` : '';
    message = st === 'check' ? `${prefix}チェック！ キングを守ってください` : `${prefix}あなたの番です`;
  } else {
    const note = undoUsed ? '（もどしを使ったので記録には残りません）' : '';
    if (resigned) message = `投了しました。あなたの負けです${note}`;
    else if (st === 'checkmate') {
      message =
        outcome === 'win'
          ? `🎉 チェックメイト！ あなたの勝ちです（${humanMoves}手）${note}`
          : `チェックメイト（${lastSan}）。あなたの負けです${note}`;
    } else if (st !== 'play' && st !== 'check') message = `${END_TEXT[st]}${note}`;
  }

  const streakNow = today ? currentStreak(entry.lastClearedOn, today, entry.streak) : 0;
  const recordItems =
    mode === 'daily'
      ? [
          { label: '今日の1手詰め', value: `${entry.wins ?? 0}回正解` },
          { label: '連続', value: `${streakNow}日` },
        ]
      : [
          {
            label: `${LEVELS[level].label}との戦績`,
            value: `${entry.wins ?? 0}勝 ${entry.losses ?? 0}敗 ${entry.draws ?? 0}分`,
          },
          { label: '勝率', value: winRate(entry) === null ? '—' : `${winRate(entry)}%` },
        ];

  // 上の行は相手（CPU・今日の問題では受ける側）、下の行は自分
  const them: Color = me === 'w' ? 'b' : 'w';
  const topLabel = mode === 'daily' ? SIDE_NAME[them] : `CPU（${LEVELS[level].label}）`;
  const bottomLabel = mode === 'daily' ? `${SIDE_NAME[me]}（あなた）` : 'あなた';

  return (
    <div className="card ch-game">
      <div className="btn-row">
        <div className="seg" role="group" aria-label="遊び方">
          {(['cpu', 'daily'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={m === mode ? 'active' : ''}
              aria-pressed={m === mode}
              onClick={() => changeMode(m)}
            >
              {m === 'cpu' ? 'CPU対戦' : '今日の1手詰め'}
            </button>
          ))}
        </div>
        {mode === 'cpu' && (
          <>
            <div className="seg" role="group" aria-label="CPUの強さ">
              {(Object.keys(LEVELS) as Level[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  className={l === level ? 'active' : ''}
                  aria-pressed={l === level}
                  onClick={() => changeLevel(l)}
                >
                  {LEVELS[l].label}
                </button>
              ))}
            </div>
            <div className="seg" role="group" aria-label="自分の色">
              {(['w', 'b'] as Color[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  className={c === human ? 'active' : ''}
                  aria-pressed={c === human}
                  aria-label={COLOR_LABEL[c]}
                  onClick={() => changeColor(c)}
                >
                  {SIDE_NAME[c]}
                  {/* 狭い画面では「（先手）」を省いて強さと同じ段に並べる（globals.css の .ch-wide） */}
                  <span className="ch-wide">{COLOR_LABEL[c].slice(1)}</span>
                </button>
              ))}
            </div>
            <CpuSpeedSeg
              value={speed}
              onChange={(next) => {
                setSpeed(next);
                writeCpuSpeed(SLUG, next);
              }}
            />
          </>
        )}
      </div>

      <RecordStrip items={recordItems} />

      <div className="ch-side" aria-label="相手が取った駒">
        <span className="ch-side-label">{topLabel}</span>
        <span className="ch-side-pieces">
          {captured[them].map((p, i) => (
            <PieceIcon key={i} piece={p} />
          ))}
        </span>
      </div>

      <StartGate show={mode === 'cpu' && phase === 'idle' && ready} onStart={() => setBegun(true)}>
        <svg
          ref={svgRef}
          className={`ch-board${drag ? ' dragging' : ''}`}
          viewBox="0 0 8 8"
          role="grid"
          aria-label={`チェスの盤面（${flip ? '黒' : '白'}が下）`}
          tabIndex={0}
          data-flip={flip ? 'true' : 'false'}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onKeyDown={onKeyDown}
        >
          {Array.from({ length: 64 }, (_, v) => {
            const sq = toView(v);
            const x = v % 8;
            const y = Math.floor(v / 8);
            const dark = (rowOf(sq) + colOf(sq)) % 2 === 1;
            const cls = [
              'ch-sq',
              dark ? 'dark' : 'light',
              lastMove && (lastMove.from === sq || lastMove.to === sq) ? 'last' : '',
              sq === selected ? 'selected' : '',
              sq === checkSq ? 'check' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <g key={v} data-square={squareName(sq)}>
                <rect className={cls} x={x} y={y} width={1} height={1} />
                {x === 0 && (
                  <text className="ch-coord" x={x + 0.06} y={y + 0.2}>
                    {8 - rowOf(sq)}
                  </text>
                )}
                {y === 7 && (
                  <text className="ch-coord" x={x + 0.94} y={y + 0.93} textAnchor="end">
                    {'abcdefgh'[colOf(sq)]}
                  </text>
                )}
              </g>
            );
          })}

          {Array.from({ length: 64 }, (_, v) => {
            const sq = toView(v);
            const p = state.board[sq];
            if (p === 0 || drag?.from === sq) return null;
            return (
              <g
                key={`p${v}`}
                className="ch-piece"
                data-piece={p}
                transform={`translate(${v % 8} ${Math.floor(v / 8)}) scale(0.01)`}
              >
                <PieceShape piece={p} />
              </g>
            );
          })}

          {targets.map((m) => {
            const v = toView(m.to);
            if (m.promo && m.promo !== PROMO_PIECES[0]) return null;
            const cx = (v % 8) + 0.5;
            const cy = Math.floor(v / 8) + 0.5;
            return m.captured ? (
              <circle key={`t${m.to}`} className="ch-ring" cx={cx} cy={cy} r={0.44} />
            ) : (
              <circle key={`t${m.to}`} className="ch-dot" cx={cx} cy={cy} r={0.16} />
            );
          })}

          {answerArrow && <Arrow from={toView(answerArrow.from)} to={toView(answerArrow.to)} />}

          {drag && (
            <g className="ch-piece ch-drag" transform={`translate(${drag.x} ${drag.y}) scale(0.01)`}>
              <PieceShape piece={state.board[drag.from]} />
            </g>
          )}

          {phase === 'promote' &&
            promoChoices.map((c) => {
              const v = toView(c.sq);
              const s = me === 'w' ? 1 : -1;
              return (
                <g key={`c${c.kind}`} className="ch-promo" data-promo={c.kind}>
                  <rect x={v % 8} y={Math.floor(v / 8)} width={1} height={1} />
                  <g transform={`translate(${v % 8} ${Math.floor(v / 8)}) scale(0.01)`}>
                    <PieceShape piece={c.kind * s} />
                  </g>
                </g>
              );
            })}

          <rect
            className="ch-cursor"
            x={toView(cursor) % 8 + 0.04}
            y={Math.floor(toView(cursor) / 8) + 0.04}
            width={0.92}
            height={0.92}
          />
        </svg>
      </StartGate>

      <div className="ch-side" aria-label="自分が取った駒">
        <span className="ch-side-label">{bottomLabel}</span>
        <span className="ch-side-pieces">
          {captured[me].map((p, i) => (
            <PieceIcon key={i} piece={p} />
          ))}
        </span>
      </div>

      <p
        className="result-row"
        style={{
          color:
            phase === 'over' && (outcome === 'win' || verdict?.ok) ? 'var(--ok)' : st === 'check' && phase === 'me' ? 'var(--danger)' : 'var(--text)',
          fontWeight: phase === 'over' || st === 'check' ? 700 : 400,
        }}
        aria-live="polite"
      >
        {message}
      </p>

      <div className="btn-row" style={{ justifyContent: 'center' }}>
        {mode === 'cpu' ? (
          <>
            <button type="button" className="btn" onClick={undo} disabled={!canUndo}>
              ↩ 1手もどす
            </button>
            <button type="button" className="btn" onClick={resign} disabled={phase !== 'me'}>
              投了
            </button>
            <button type="button" className="btn" onClick={() => newGame(level, human)}>
              はじめから
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn" onClick={retry} disabled={!verdict || verdict.ok}>
              もう一度
            </button>
            <button type="button" className="btn" onClick={copyResult} disabled={!verdict}>
              {copied ? 'コピーしました' : '結果をコピー'}
            </button>
          </>
        )}
      </div>

      <details className="game-tips">
        <summary>この画面の見かた</summary>
        <p>
          駒をタップすると、動ける先に丸（取れる先は輪）が出ます。行き先をタップするか、駒をドラッグして動かします。
          直前の手は薄く色づけし、チェックされているキングは赤く縁取ります。
          {mode === 'cpu'
            ? '「1手もどす」は自分の手とCPUの手を1組戻します（何回でも使えますが、使った対局は戦績に残りません）。'
            : '今日の1手詰めは全員同じ問題です。記録は最初の1回で付きます。'}
        </p>
      </details>
    </div>
  );
}

/** 正解の手の矢印（今日の 1 手詰めで外れたとき） */
function Arrow({ from, to }: { from: number; to: number }) {
  const x1 = (from % 8) + 0.5;
  const y1 = Math.floor(from / 8) + 0.5;
  const x2 = (to % 8) + 0.5;
  const y2 = Math.floor(to / 8) + 0.5;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const head = 0.32;
  const bx = x2 - ux * head;
  const by = y2 - uy * head;
  const px = -uy * 0.2;
  const py = ux * 0.2;
  return (
    <g className="ch-arrow" aria-label="正解の手">
      <line x1={x1} y1={y1} x2={bx} y2={by} />
      <polygon points={`${x2},${y2} ${bx + px},${by + py} ${bx - px},${by - py}`} />
    </g>
  );
}
