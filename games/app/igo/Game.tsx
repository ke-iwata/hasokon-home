'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyMove,
  atariStones,
  beginAction,
  BLACK,
  bothPassed,
  columnLabels,
  decideCount,
  EMPTY,
  estimateDead,
  hasLegalMove,
  HANDICAPS,
  ILLEGAL_MESSAGE,
  illegalReason,
  initialState,
  ishitoriRemaining,
  ishitoriResult,
  ISHITORI_TARGETS,
  LEVELS,
  marginLabel,
  MAX_RESUMES,
  pass,
  PASS,
  pointLabel,
  recordVariant,
  rowLabels,
  scoreGame,
  scoreSentence,
  starPoints,
  takeFromReversi,
  toggleDead,
  undoIndex,
  WHITE,
  type BoardSize,
  type IgoState,
  type Level,
  type Mode,
  type Player,
  type Score,
} from '@/lib/igo';
import { chooseMove, type CpuRequest, type CpuResult } from '@/lib/igo-cpu';
import { mulberry32 } from '@/lib/daily';
import { trackToolUse } from '@/lib/analytics';
import { RecordStrip, useRecords } from '@/app/_records/Records';
import { winRate } from '@/lib/records';
import { CpuSpeedSeg, delayFor, readCpuSpeed, writeCpuSpeed, type CpuSpeed } from '@/app/_cpu/CpuSpeed';
import { StartGate } from '@/app/_cpu/StartGate';

/**
 * 囲碁（6路・9路）。仕様: docs/features/game-igo.md
 *
 * ルール・数え方・CPU はすべて lib/igo.ts・lib/igo-cpu.ts の純関数で、ここは入力と描画だけ。
 * CPU の探索は Web Worker（./cpu.worker.ts）で回し、画面は止めない。
 */

const SLUG = 'igo';

/** 設定（遊んだ記録ではないので records には入れない） */
interface Settings {
  mode: Mode;
  /** 石取りの盤（対局は 9路だけ） */
  size: BoardSize;
  target: number;
  /** null は 2 人で対面 */
  level: Level | null;
  /** CPU 対戦で自分が持つ色（置き石のある対局は黒） */
  color: Player;
  handicap: number;
  /** アタリの表示（既定オン） */
  showAtari: boolean;
  /** タップした瞬間に打つ（既定オフ：指を離した交点に打つ） */
  instant: boolean;
}

const DEFAULTS: Settings = {
  mode: 'ishitori',
  size: 6,
  target: 1,
  level: 'easy',
  color: BLACK,
  handicap: 0,
  showAtari: true,
  instant: false,
};

const SETTINGS_KEY = 'igo:settings';

function readSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') as Partial<Settings> | null;
    if (!raw || typeof raw !== 'object') return DEFAULTS;
    const s = { ...DEFAULTS };
    if (raw.mode === 'ishitori' || raw.mode === 'taikyoku') s.mode = raw.mode;
    if (raw.size === 6 || raw.size === 9) s.size = raw.size;
    if ((ISHITORI_TARGETS as readonly number[]).includes(raw.target as number)) s.target = raw.target as number;
    if (raw.level === null || raw.level === 'easy' || raw.level === 'normal' || raw.level === 'hard') {
      s.level = raw.level;
    }
    if (raw.color === BLACK || raw.color === WHITE) s.color = raw.color;
    if ((HANDICAPS as readonly number[]).includes(raw.handicap as number)) s.handicap = raw.handicap as number;
    if (typeof raw.showAtari === 'boolean') s.showAtari = raw.showAtari;
    if (typeof raw.instant === 'boolean') s.instant = raw.instant;
    return s;
  } catch {
    return DEFAULTS;
  }
}

function writeSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // 覚えられなくても、その対局は普通に遊べる
  }
}

/** 盤の大きさ（対局は 9路） */
function boardSize(s: Settings): BoardSize {
  return s.mode === 'taikyoku' ? 9 : s.size;
}

/** 対局の置き石（石取りには無い） */
function handicapOf(s: Settings): number {
  return s.mode === 'taikyoku' && s.level ? s.handicap : 0;
}

/** 自分の色。置き石のある対局は黒、対面は null */
function humanOf(s: Settings): Player | null {
  if (!s.level) return null;
  return handicapOf(s) > 0 ? BLACK : s.color;
}

function freshGame(s: Settings): IgoState {
  return initialState(boardSize(s), handicapOf(s));
}

/** CPU の手を打つまでの最短の間（ms、「ふつう」のとき） */
const THINK_DELAY = 360;
/** これより長く考えたら「考えています…」を出す */
const SLOW_NOTICE = 500;
/** 取られた石が消えるまで（ms） */
const FADE_MS = 150;

function colorName(p: Player): string {
  return p === BLACK ? '黒' : '白';
}

// ---------------------------------------------------------------------------
// CPU（Web Worker。使えない環境ではその場で計算する）
// ---------------------------------------------------------------------------

function createWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./cpu.worker.ts', import.meta.url));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 盤の寸法（SVG の座標。交点の間隔を 1 とする）
// ---------------------------------------------------------------------------

/** 盤の縁（座標の数字の分を含む） */
const MARGIN = 0.95;

type Phase = 'play' | 'counting' | 'done';

interface CountState {
  /** CPU の推した死に石の候補 */
  candidates: number[];
  /** いま死に石として印の付いている石 */
  dead: number[];
  /** CPU と意見が分かれた（再開を勧めている） */
  disputed: boolean;
}

interface Final {
  score: Score | null;
  /** 勝った色（0 は引き分け） */
  winner: Player | 0;
}

export default function Game() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [history, setHistory] = useState<IgoState[]>(() => [freshGame(DEFAULTS)]);
  const [ready, setReady] = useState(false);
  const [begun, setBegun] = useState(false);
  const [speed, setSpeed] = useState<CpuSpeed>('normal');
  const [thinking, setThinking] = useState(false);
  const [slow, setSlow] = useState(false);
  const [notice, setNotice] = useState('');
  const [announce, setAnnounce] = useState('');
  const [count, setCount] = useState<CountState | null>(null);
  const [final, setFinal] = useState<Final | null>(null);
  /** 対局を再開した回数（1局に2回まで） */
  const [resumes, setResumes] = useState(0);
  /** キーボードで選んでいる交点 */
  const [cursor, setCursor] = useState(0);
  /** マウスを乗せている交点 */
  const [hover, setHover] = useState<number | null>(null);
  /** 指で押さえている交点（離した交点に打つ） */
  const [press, setPress] = useState<number | null>(null);

  const records = useRecords(SLUG);
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const boardRef = useRef<HTMLDivElement>(null);
  /** 1局につき1回だけ記録・計測する */
  const recorded = useRef(false);
  const countEdited = useRef(false);

  const s = settings;
  const size = boardSize(s);
  const human = humanOf(s);
  const vsCpu = s.level !== null;
  const current = history[history.length - 1];
  const variant = s.level ? recordVariant(s.mode, size, s.level, current.handicap) : '';

  const phase: Phase = final
    ? 'done'
    : s.mode === 'taikyoku' && bothPassed(current)
      ? 'counting'
      : 'play';
  const cpuTurn = vsCpu && phase === 'play' && current.turn !== human;
  const myTurn = phase === 'play' && begun && !cpuTurn;

  // 設定を読む（静的書き出しの HTML と食い違わないよう、マウント後に）
  useEffect(() => {
    const saved = readSettings();
    setSettings(saved);
    setHistory([freshGame(saved)]);
    setSpeed(readCpuSpeed(SLUG));
    setReady(true);
  }, []);

  useEffect(() => {
    workerRef.current = createWorker();
    return () => workerRef.current?.terminate();
  }, []);

  /** 新しい対局（設定を変えたときも） */
  const restart = useCallback((next: Settings) => {
    setSettings(next);
    writeSettings(next);
    setHistory([freshGame(next)]);
    setBegun(false);
    setThinking(false);
    setSlow(false);
    setCount(null);
    setFinal(null);
    setResumes(0);
    setNotice('');
    setAnnounce('');
    setPress(null);
    recorded.current = false;
    countEdited.current = false;
    reqId.current++;
  }, []);

  const change = (patch: Partial<Settings>) => restart({ ...s, ...patch });

  /** 対局の始まり（スタートか、先手で自分が打った） */
  const begin = useCallback(() => {
    if (begun) return;
    setBegun(true);
    const suffix = takeFromReversi() ? '-from-reversi' : '';
    trackToolUse(SLUG, beginAction(s.mode, size, s.level) + suffix);
    if (s.level) records.start(variant);
  }, [begun, s.mode, s.level, size, records, variant]);

  /** 手を盤に当てて、読み上げを作る */
  const commit = useCallback((prev: IgoState, move: number, who: 'human' | 'cpu' | Player) => {
    const next = applyMove(prev, move);
    const name = who === 'human' ? 'あなた' : who === 'cpu' ? 'CPU' : colorName(who as Player);
    const taken = next.lastCaptured.length;
    let text = `${name}：${pointLabel(prev.size, move)}。`;
    if (taken > 0) text += `${colorName(next.turn)}の石を ${taken} つ取りました。`;
    setAnnounce((a) => (who === 'cpu' && a.startsWith('あなた') ? `${a}${text}` : text));
    setHistory((h) => (h[h.length - 1] === prev ? [...h, next] : h));
    setNotice('');
  }, []);

  // CPU の手番
  useEffect(() => {
    if (!ready || !begun || !cpuTurn) return;
    const id = ++reqId.current;
    const req: CpuRequest = {
      state: current,
      mode: s.mode,
      level: s.level as Level,
      target: s.target,
      seed: (Math.random() * 0x7fffffff) | 0,
    };
    setThinking(true);
    const startedAt = Date.now();
    const slowTimer = window.setTimeout(() => setSlow(true), SLOW_NOTICE);
    let moveTimer: number | undefined;
    const done = (result: CpuResult) => {
      if (id !== reqId.current) return;
      const wait = Math.max(0, delayFor(THINK_DELAY, speed) - (Date.now() - startedAt));
      moveTimer = window.setTimeout(() => {
        if (id !== reqId.current) return;
        window.clearTimeout(slowTimer);
        setThinking(false);
        setSlow(false);
        commit(req.state, result.move, 'cpu');
      }, wait);
    };
    const worker = workerRef.current;
    let onMessage: ((e: MessageEvent<{ id: number; result: CpuResult }>) => void) | null = null;
    if (worker) {
      onMessage = (e) => {
        if (e.data.id === id) done(e.data.result);
      };
      worker.addEventListener('message', onMessage);
      worker.postMessage({ id, req });
    } else {
      // Worker が使えない環境：いったん描画させてからその場で計算する
      moveTimer = window.setTimeout(() => done(chooseMove(req)), 30);
    }
    return () => {
      if (worker && onMessage) worker.removeEventListener('message', onMessage);
      window.clearTimeout(slowTimer);
      if (moveTimer) window.clearTimeout(moveTimer);
      setThinking(false);
      setSlow(false);
    };
    // current が変わったら（もどす・やり直し）読み直す
  }, [ready, begun, cpuTurn, current, s.mode, s.level, s.target, speed, commit]);

  // 打てる手が 1 つも無い側は自動でパス（石取りでは、それが続けば両者パスで終わる）
  useEffect(() => {
    if (!begun || phase !== 'play' || cpuTurn) return;
    if (s.mode === 'ishitori' && ishitoriResult(current, s.target) !== null) return;
    if (!hasLegalMove(current)) {
      setNotice('打てる交点が無いので、自動でパスしました');
      setHistory((h) => [...h, pass(h[h.length - 1])]);
    }
  }, [begun, phase, cpuTurn, current, s.mode, s.target]);

  // 石取りの決着
  useEffect(() => {
    if (s.mode !== 'ishitori' || final) return;
    const w = ishitoriResult(current, s.target);
    if (w === null) return;
    setFinal({ score: null, winner: w });
  }, [current, s.mode, s.target, final]);

  // 対局：両者パス → 死に石の候補を推す
  useEffect(() => {
    if (phase !== 'counting' || count) return;
    const candidates = estimateDead(current, mulberry32(current.moves * 7919 + 17));
    setCount({ candidates, dead: candidates, disputed: false });
    setNotice('');
  }, [phase, count, current]);

  // 決着の記録と計測（1局に1回）
  useEffect(() => {
    if (!final || recorded.current) return;
    recorded.current = true;
    if (!s.level || human === null) return;
    const outcome = final.winner === 0 ? 'draw' : final.winner === human ? 'win' : 'loss';
    const label = outcome === 'loss' ? 'lose' : outcome;
    trackToolUse(SLUG, `${label}-${s.mode}-${size}-${s.level}`);
    records.finish({ outcome }, variant);
  }, [final, s.level, s.mode, size, human, records, variant]);

  // ---------------------------------------------------------------------------
  // 操作
  // ---------------------------------------------------------------------------

  const tryPlay = (p: number) => {
    if (phase !== 'play' || cpuTurn) return;
    const reason = illegalReason(current, p);
    if (reason) {
      setNotice(ILLEGAL_MESSAGE[reason]);
      return;
    }
    begin();
    commit(current, p, vsCpu ? 'human' : current.turn);
  };

  const doPass = () => {
    if (phase !== 'play' || cpuTurn) return;
    begin();
    setAnnounce(`${vsCpu ? 'あなた' : colorName(current.turn)}：パス。`);
    setHistory((h) => [...h, pass(h[h.length - 1])]);
    setNotice('');
  };

  const undoTarget = phase === 'play' || phase === 'counting' ? undoIndex(history, human) : null;
  const undo = () => {
    if (undoTarget === null) return;
    reqId.current++;
    setHistory((h) => h.slice(0, undoTarget + 1));
    setCount(null);
    setNotice('');
  };

  const tapDead = (p: number) => {
    if (!count || current.cells[p] === EMPTY) return;
    if (vsCpu && !countEdited.current) {
      countEdited.current = true;
      trackToolUse(SLUG, 'count-edit');
    }
    setCount({ ...count, dead: toggleDead(current, count.dead, p), disputed: false });
  };

  const confirmCount = () => {
    if (!count) return;
    const d = decideCount({ vsCpu, candidates: count.candidates, chosen: count.dead, resumes });
    if (d.action === 'resume') {
      setCount({ ...count, disputed: true });
      return;
    }
    const score = scoreGame(current, d.dead);
    if (!d.recorded && vsCpu) recorded.current = true;
    setCount({ ...count, dead: d.dead });
    setFinal({ score, winner: score.winner });
  };

  /** CPU と意見が分かれた：数える前の局面から打ち続ける */
  const resume = () => {
    let i = history.length - 1;
    while (i > 0 && history[i].last === PASS) i--;
    reqId.current++;
    setHistory((h) => h.slice(0, i + 1));
    setResumes((r) => r + 1);
    setCount(null);
    setNotice('対局を再開しました。死活を打って確かめましょう');
  };

  const handicapRetry = () => {
    trackToolUse(SLUG, 'handicap-retry');
    const nextH = s.handicap === 0 ? 2 : Math.min(5, s.handicap + 1);
    restart({ ...s, handicap: nextH, color: BLACK });
  };

  const toTaikyoku = () => {
    trackToolUse(SLUG, 'ishitori-to-taikyoku');
    restart({ ...s, mode: 'taikyoku', handicap: 0 });
  };

  // ---------------------------------------------------------------------------
  // 盤の入力（マウス・指・キーボード）
  // ---------------------------------------------------------------------------

  const V = size - 1 + MARGIN * 2;

  const pointFromEvent = (e: { clientX: number; clientY: number }): number | null => {
    const el = boardRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * V - MARGIN;
    const y = ((e.clientY - rect.top) / rect.height) * V - MARGIN;
    const c = Math.round(x);
    const r = Math.round(y);
    if (c < 0 || r < 0 || c >= size || r >= size) return null;
    if (Math.abs(x - c) > 0.5 || Math.abs(y - r) > 0.5) return null;
    return r * size + c;
  };

  const boardActive = phase === 'counting' || (phase === 'play' && !cpuTurn);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!boardActive) return;
    const p = pointFromEvent(e);
    if (e.pointerType === 'mouse') return;
    if (phase === 'counting' || s.instant) {
      if (p !== null) (phase === 'counting' ? tapDead : tryPlay)(p);
      return;
    }
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setPress(p);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointFromEvent(e);
    if (e.pointerType === 'mouse') {
      setHover(boardActive ? p : null);
      return;
    }
    if (press !== null || (e.buttons & 1) === 1) setPress(p);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const p = pointFromEvent(e);
    if (e.pointerType === 'mouse') {
      if (e.button !== 0 || p === null || !boardActive) return;
      if (phase === 'counting') tapDead(p);
      else tryPlay(p);
      return;
    }
    if (press === null) return;
    setPress(null);
    if (p !== null && phase === 'play') tryPlay(p);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const r = Math.floor(cursor / size);
    const c = cursor % size;
    let next = cursor;
    if (e.key === 'ArrowUp') next = Math.max(0, r - 1) * size + c;
    else if (e.key === 'ArrowDown') next = Math.min(size - 1, r + 1) * size + c;
    else if (e.key === 'ArrowLeft') next = r * size + Math.max(0, c - 1);
    else if (e.key === 'ArrowRight') next = r * size + Math.min(size - 1, c + 1);
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (phase === 'counting') tapDead(cursor);
      else tryPlay(cursor);
      return;
    } else if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      doPass();
      return;
    } else return;
    e.preventDefault();
    setCursor(next);
  };

  // 盤の大きさが変わったらカーソルを天元あたりへ
  useEffect(() => {
    setCursor(Math.floor(size / 2) * size + Math.floor(size / 2));
    setHover(null);
  }, [size]);

  // ---------------------------------------------------------------------------
  // 描画
  // ---------------------------------------------------------------------------

  const ataris = useMemo(
    () => (s.showAtari && phase === 'play' ? new Set(atariStones(current)) : new Set<number>()),
    [s.showAtari, phase, current],
  );
  const deadSet = useMemo(() => new Set(count?.dead ?? []), [count]);
  const liveScore = useMemo(
    () => (phase !== 'play' && count ? scoreGame(current, count.dead) : null),
    [phase, count, current],
  );
  const xy = (p: number) => [MARGIN + (p % size), MARGIN + Math.floor(p / size)] as const;
  const stars = starPoints(size);
  const cols = columnLabels(size);
  const rows = rowLabels(size);
  const shadowAt = press ?? (phase === 'play' && !cpuTurn ? hover : null);
  const shadowOk = shadowAt !== null && current.cells[shadowAt] === EMPTY && phase === 'play';

  const statusText = (() => {
    if (phase === 'done') return '対局終了';
    if (phase === 'counting') return '地を数えます';
    if (!begun) return 'スタート待ち';
    if (cpuTurn) return slow ? 'CPUが考えています…' : 'CPUの番です';
    if (!vsCpu) return `${colorName(current.turn)}の番です`;
    return 'あなたの番です';
  })();

  const capturedBy = (p: Player) => current.captures[p];
  const ishitoriHint =
    s.mode === 'ishitori' && phase === 'play'
      ? vsCpu && human
        ? `あと ${ishitoriRemaining(current, s.target, human)} つ取れば勝ち`
        : `先に ${s.target} つ取ったほうが勝ち`
      : '';

  const resultText = (() => {
    if (phase === 'counting' && count) {
      if (count.disputed) return 'CPU と意見が分かれました。打ち続けて決めましょう';
      return liveScore ? scoreSentence(liveScore) : '';
    }
    if (!final) return notice || ishitoriHint;
    if (final.score) {
      const head = scoreSentence(final.score);
      if (!vsCpu) return head;
      return `${head}（${final.winner === human ? '🎉 あなたの勝ち' : 'あなたの負け'}）`;
    }
    const w = final.winner;
    if (w === 0) return `引き分けです（取った数が同じ：${capturedBy(BLACK)} 対 ${capturedBy(WHITE)}）`;
    if (!vsCpu) return `${colorName(w)}の勝ちです（${capturedBy(w)} 個取りました）`;
    return w === human
      ? `🎉 あなたの勝ち（${capturedBy(w)} 個取りました）`
      : `あなたの負け（${capturedBy(w)} 個取られました）`;
  })();

  const lostToCpu = phase === 'done' && vsCpu && final !== null && final.winner !== 0 && final.winner !== human;
  const wonIshitori = phase === 'done' && vsCpu && s.mode === 'ishitori' && final?.winner === human;

  const entry = records.entry(variant);

  return (
    <div className="card ig-game">
      {/* モード・相手 */}
      <div className="btn-row">
        <div className="seg" role="group" aria-label="モード">
          {(['ishitori', 'taikyoku'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={m === s.mode ? 'active' : ''}
              aria-pressed={m === s.mode}
              onClick={() => change({ mode: m })}
            >
              {m === 'ishitori' ? '石取り' : '対局'}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="相手">
          {(['easy', 'normal', 'hard', null] as (Level | null)[]).map((l) => (
            <button
              key={l ?? 'pvp'}
              type="button"
              className={l === s.level ? 'active' : ''}
              aria-pressed={l === s.level}
              onClick={() => change({ level: l })}
            >
              {l ? LEVELS[l].label : '2人で'}
            </button>
          ))}
        </div>
      </div>

      {/* モードごとの設定（どちらも 1 段に収め、切り替えても高さを変えない） */}
      <div className="btn-row ig-opts">
        {s.mode === 'ishitori' ? (
          <>
            <div className="seg" role="group" aria-label="盤の大きさ">
              {([6, 9] as BoardSize[]).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={n === s.size ? 'active' : ''}
                  aria-pressed={n === s.size}
                  onClick={() => change({ size: n })}
                >
                  {n}路
                </button>
              ))}
            </div>
            <div className="seg" role="group" aria-label="勝ちになる取った数">
              {ISHITORI_TARGETS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={t === s.target ? 'active' : ''}
                  aria-pressed={t === s.target}
                  onClick={() => change({ target: t })}
                >
                  {t}つ
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="seg" role="group" aria-label="置き石">
            {HANDICAPS.map((h) => (
              <button
                key={h}
                type="button"
                className={h === s.handicap ? 'active' : ''}
                aria-pressed={h === s.handicap}
                disabled={!vsCpu}
                onClick={() => change({ handicap: h, color: h > 0 ? BLACK : s.color })}
              >
                {h === 0 ? '置き石なし' : `${h}子`}
              </button>
            ))}
          </div>
        )}
        {vsCpu && (
          <div className="seg" role="group" aria-label="自分の色">
            {([BLACK, WHITE] as Player[]).map((c) => (
              <button
                key={c}
                type="button"
                className={c === human ? 'active' : ''}
                aria-pressed={c === human}
                disabled={handicapOf(s) > 0 && c === WHITE}
                onClick={() => change({ color: c, handicap: c === WHITE ? 0 : s.handicap })}
              >
                {c === BLACK ? '黒（先手）' : '白（後手）'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="status-bar ig-status">
        <span className="gm-score">
          <span className="ig-caplabel">取った石</span>
          <span className="gm-chip">
            <span className="gm-stone black" aria-hidden="true" />
            {vsCpu ? (human === BLACK ? 'あなた' : 'CPU') : '黒'}
            <span className="ig-cap">{capturedBy(BLACK)}</span>
          </span>
          <span className="gm-chip">
            <span className="gm-stone white" aria-hidden="true" />
            {vsCpu ? (human === WHITE ? 'あなた' : 'CPU') : '白'}
            <span className="ig-cap">{capturedBy(WHITE)}</span>
          </span>
        </span>
        <span className="ig-turn">{statusText}</span>
      </div>

      {vsCpu ? (
        <RecordStrip
          items={[
            {
              label: `${s.mode === 'ishitori' ? `石取り${size}路` : `対局${current.handicap ? '（置き石）' : ''}`}・${LEVELS[s.level as Level].label}`,
              value: `${entry.wins ?? 0}勝 ${entry.losses ?? 0}敗 ${entry.draws ?? 0}分`,
            },
            { label: '勝率', value: winRate(entry) === null ? '—' : `${winRate(entry)}%` },
          ]}
        />
      ) : (
        <RecordStrip
          items={[
            { label: '2人で対面', value: '記録は付きません' },
            { label: '手数', value: `${current.moves}` },
          ]}
        />
      )}

      {/* 結果・知らせ・数え方の式。**常に置く**（出し入れすると盤が動く） */}
      <p
        className="result-row ig-result"
        style={{ color: phase === 'done' && final?.winner === human ? 'var(--ok)' : 'var(--text)' }}
      >
        {resultText}
      </p>
      <p className="ig-live" aria-live="polite">
        {announce}
      </p>

      <StartGate show={!begun && phase === 'play'} onStart={begin}>
        <div
          ref={boardRef}
          className={`ig-board${phase === 'counting' ? ' counting' : ''}`}
          style={{ ['--ig-size' as string]: String(size) }}
          role="grid"
          aria-label={`囲碁の盤面（${size}路）`}
          tabIndex={0}
          aria-activedescendant={`ig-pt-${cursor}`}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setPress(null)}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') setHover(null);
          }}
        >
          <svg viewBox={`0 0 ${V} ${V}`} aria-hidden="true" focusable="false">
            <rect x="0" y="0" width={V} height={V} className="ig-wood" />
            {Array.from({ length: size }, (_, i) => (
              <g key={i}>
                <line
                  x1={MARGIN}
                  y1={MARGIN + i}
                  x2={MARGIN + size - 1}
                  y2={MARGIN + i}
                  className="ig-line"
                />
                <line
                  x1={MARGIN + i}
                  y1={MARGIN}
                  x2={MARGIN + i}
                  y2={MARGIN + size - 1}
                  className="ig-line"
                />
                <text x={MARGIN + i} y={MARGIN * 0.42} className="ig-coord">
                  {cols[i]}
                </text>
                <text x={MARGIN * 0.42} y={MARGIN + i} className="ig-coord">
                  {rows[i]}
                </text>
              </g>
            ))}
            <rect
              x={MARGIN}
              y={MARGIN}
              width={size - 1}
              height={size - 1}
              className="ig-frame"
            />
            {stars.map((p) => {
              const [x, y] = xy(p);
              return <circle key={p} cx={x} cy={y} r={0.09} className="ig-star" />;
            })}

            {/* 数え方：地の小さな四角とダメの印 */}
            {liveScore &&
              liveScore.owners.map((o, p) => {
                if (o === 'stone') return null;
                const [x, y] = xy(p);
                if (o === 'dame') return <circle key={`t${p}`} cx={x} cy={y} r={0.08} className="ig-dame" />;
                return (
                  <rect
                    key={`t${p}`}
                    x={x - 0.17}
                    y={y - 0.17}
                    width={0.34}
                    height={0.34}
                    className={o === 'black' ? 'ig-terr-b' : 'ig-terr-w'}
                  />
                );
              })}

            {current.cells.map((v, p) => {
              if (v === EMPTY) return null;
              const [x, y] = xy(p);
              const dead = deadSet.has(p) && phase !== 'play';
              return (
                <g key={`s${p}`} className={dead ? 'ig-dead' : undefined}>
                  <circle cx={x} cy={y} r={0.46} className={v === BLACK ? 'ig-black' : 'ig-white'} />
                  {ataris.has(p) && <circle cx={x} cy={y} r={0.47} className="ig-atari" />}
                  {dead && (
                    <path
                      d={`M${x - 0.2} ${y - 0.2}L${x + 0.2} ${y + 0.2}M${x + 0.2} ${y - 0.2}L${x - 0.2} ${y + 0.2}`}
                      className="ig-x"
                    />
                  )}
                  {p === current.last && !dead && (
                    <circle cx={x} cy={y} r={0.14} className={v === BLACK ? 'ig-last-b' : 'ig-last-w'} />
                  )}
                </g>
              );
            })}

            {/* 「アタリ」の札（かたまりの代表の石の上に1つ） */}
            {s.showAtari &&
              phase === 'play' &&
              atariLabels(current, ataris).map((p) => {
                const [x, y] = xy(p);
                return (
                  <g key={`a${p}`}>
                    <rect x={x - 0.36} y={y - 0.78} width={0.72} height={0.3} rx={0.06} className="ig-atari-tag" />
                    <text x={x} y={y - 0.63} className="ig-atari-text">
                      アタリ
                    </text>
                  </g>
                );
              })}

            {/* 取られた石が消える（演出。状態には持たない） */}
            {current.lastCaptured.map((p) => {
              const [x, y] = xy(p);
              return (
                <circle
                  key={`f${history.length}-${p}`}
                  cx={x}
                  cy={y}
                  r={0.46}
                  className={`ig-fade ${current.turn === BLACK ? 'ig-black' : 'ig-white'}`}
                  style={{ animationDuration: `${FADE_MS}ms` }}
                />
              );
            })}

            {/* 打つ前の影：マウスは石の影、指は十字と 1 マス上に浮かせた石 */}
            {shadowOk && shadowAt !== null && (() => {
              const [x, y] = xy(shadowAt);
              const turnCls = current.turn === BLACK ? 'ig-black' : 'ig-white';
              if (press === null) return <circle cx={x} cy={y} r={0.46} className={`ig-ghost ${turnCls}`} />;
              const fy = y >= MARGIN + 1 ? y - 1 : y + 1;
              return (
                <g>
                  <line x1={MARGIN} y1={y} x2={MARGIN + size - 1} y2={y} className="ig-cross" />
                  <line x1={x} y1={MARGIN} x2={x} y2={MARGIN + size - 1} className="ig-cross" />
                  <circle cx={x} cy={y} r={0.46} className={`ig-ghost ${turnCls}`} />
                  <circle cx={x} cy={fy} r={0.4} className={`ig-float ${turnCls}`} />
                  <text x={x} y={fy - 0.52} className="ig-float-text">
                    ここに打ちます
                  </text>
                </g>
              );
            })()}

            {/* キーボードのカーソル（盤に焦点があるときだけ見える） */}
            {(() => {
              const [x, y] = xy(cursor);
              return <rect x={x - 0.5} y={y - 0.5} width={1} height={1} rx={0.12} className="ig-cursor" />;
            })()}
          </svg>
          {/* 読み上げ用の交点（見た目は SVG。aria-activedescendant でキーボードの位置を伝える） */}
          <div className="ig-live">
            {Array.from({ length: size }, (_, r) => (
              <div role="row" key={r}>
                {Array.from({ length: size }, (_, c) => {
                  const p = r * size + c;
                  const v = current.cells[p];
                  return (
                    <div role="gridcell" id={`ig-pt-${p}`} key={c} aria-selected={p === cursor}>
                      {pointLabel(size, p)} {v === BLACK ? '黒' : v === WHITE ? '白' : '空き'}
                      {deadSet.has(p) && phase !== 'play' ? '（死に石）' : ''}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </StartGate>

      <div className="btn-row ig-actions">
        {phase === 'play' && (
          <>
            <button type="button" className="btn" onClick={doPass} disabled={cpuTurn}>
              パス
            </button>
            <button type="button" className="btn" onClick={undo} disabled={undoTarget === null || cpuTurn}>
              ↩ 1手もどす
            </button>
            <button type="button" className="btn" onClick={() => restart(s)}>
              もう1局
            </button>
          </>
        )}
        {phase === 'counting' && count && (
          <>
            {count.disputed ? (
              <button type="button" className="btn btn-primary" onClick={resume}>
                対局を再開
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={confirmCount}>
                この形で数える
              </button>
            )}
            <button
              type="button"
              className="btn"
              onClick={() => setCount({ ...count, dead: count.candidates, disputed: false })}
            >
              CPUの候補に戻す
            </button>
            <button type="button" className="btn" onClick={undo} disabled={undoTarget === null}>
              ↩ 1手もどす
            </button>
          </>
        )}
        {phase === 'done' && (
          <>
            <button type="button" className="btn" onClick={() => restart(s)}>
              もう1局
            </button>
            {lostToCpu && s.mode === 'taikyoku' && s.handicap < 5 && (
              <button type="button" className="btn btn-primary" onClick={handicapRetry}>
                置き石を1子足して再戦
              </button>
            )}
            {wonIshitori && (
              <button type="button" className="btn btn-primary" onClick={toTaikyoku}>
                次は「対局」へ
              </button>
            )}
          </>
        )}
      </div>

      <p className="ig-help">
        {phase === 'counting'
          ? vsCpu
            ? `× は CPU が推した死に石の候補です。石をタップすると「死に／生き」が切り替わります（CPU と違う形にすると、対局を再開して確かめます。再開は1局に${MAX_RESUMES}回まで）。`
            : '× は死に石の候補です。石をタップすると「死に／生き」が切り替わります。どちらがタップしても構いません。'
          : wonIshitori
            ? '次は「対局」で、陣地の広さで勝ち負けを決めてみましょう'
            : lostToCpu && final?.score
              ? `${marginLabel(final.score.margin)}差でした。置き石を足すと黒が有利になります。`
              : s.mode === 'ishitori'
                ? '相手の石を囲んで呼吸点（隣の空いた交点）を無くすと取れます。'
                : '両者が続けてパスすると終局です。地（囲んだ交点）とあげはまを数えます。'}
      </p>

      <details className="game-tips">
        <summary>表示と操作の設定</summary>
        <div className="btn-row" style={{ justifyContent: 'center', marginTop: 10 }}>
          <label className="ig-toggle">
            <input
              type="checkbox"
              checked={s.showAtari}
              onChange={(e) => {
                const next = { ...s, showAtari: e.target.checked };
                setSettings(next);
                writeSettings(next);
              }}
            />
            アタリを表示する
          </label>
          <label className="ig-toggle">
            <input
              type="checkbox"
              checked={s.instant}
              onChange={(e) => {
                const next = { ...s, instant: e.target.checked };
                setSettings(next);
                writeSettings(next);
              }}
            />
            タップで即打つ（スマホ）
          </label>
          {vsCpu && (
            <CpuSpeedSeg
              value={speed}
              onChange={(next) => {
                setSpeed(next);
                writeCpuSpeed(SLUG, next);
              }}
            />
          )}
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>
          スマホでは、交点を押さえると十字の影が出て、<strong>指を離した交点に打ちます</strong>。
          キーボードは矢印で交点を動かし、Enter／Space で打つ、P でパスです。
        </p>
      </details>
    </div>
  );
}

/** アタリのかたまりごとに、札を付ける石を1つ（いちばん上の石） */
function atariLabels(state: IgoState, ataris: Set<number>): number[] {
  const out: number[] = [];
  const done = new Set<number>();
  for (const p of [...ataris].sort((a, b) => a - b)) {
    if (done.has(p)) continue;
    const stack = [p];
    done.add(p);
    while (stack.length) {
      const q = stack.pop() as number;
      const n = state.size;
      for (const r of [q - n, q + n, q % n ? q - 1 : -1, (q + 1) % n ? q + 1 : -1]) {
        if (r >= 0 && r < state.cells.length && ataris.has(r) && !done.has(r) && state.cells[r] === state.cells[p]) {
          done.add(r);
          stack.push(r);
        }
      }
    }
    out.push(p);
  }
  return out;
}
