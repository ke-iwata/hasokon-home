'use client';

/**
 * バックギャモンの画面（入力と描画だけ。ロジックは lib/backgammon.ts）
 *
 * 仕様: docs/features/game-backgammon.md
 *
 * - 盤は SVG 1枚。スマホ幅 343px を基準に、ポイント 12 列 × 25px・中央のバー 20px・
 *   右端のベアオフの置き場 23px、高さ約 262px で描く（座標はこの寸法のまま、幅に合わせて伸び縮み）
 * - 操作はタップ2回（駒の列 → 光っている行き先）とドラッグ。2回目のタップは光っている列だけが受け付け、
 *   それ以外を叩いたら選択を取り消すだけ
 * - CPU の読みは Web Worker（./cpu.worker.ts）。手は1駒ずつ、`CpuSpeed` の倍率で見せる
 * - 先手決めで CPU が勝ったときは `StartGate` で堰き止める（開いただけで CPU が動き出さない）
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BAR,
  canEndTurn,
  canUndo,
  cryptoDie,
  destinations,
  diceToUse,
  endTurn,
  movableFrom,
  newGame,
  OFF,
  pipCount,
  playStep,
  remainingDice,
  roll,
  undoStep,
  type BgState,
  type Side,
  type Step,
} from '@/lib/backgammon';
import { chooseMove, LEVELS, type CpuRequest, type Level } from '@/lib/backgammon-cpu';
import { trackToolUse } from '@/lib/analytics';
import { RecordStrip, useRecords } from '@/app/_records/Records';
import { winRate } from '@/lib/records';
import { CpuSpeedSeg, delayFor, readCpuSpeed, writeCpuSpeed, type CpuSpeed } from '@/app/_cpu/CpuSpeed';
import { StartGate } from '@/app/_cpu/StartGate';

const SLUG = 'backgammon';

type Mode = Level | 'pvp';
const MODES: Mode[] = ['easy', 'normal', 'hard', 'pvp'];
const MODE_LABEL: Record<Mode, string> = {
  easy: LEVELS.easy.label,
  normal: LEVELS.normal.label,
  hard: LEVELS.hard.label,
  pvp: '2人で',
};

/** CPU が1駒動かす間（ms、「ふつう」のとき。ゆっくり・はやいは CpuSpeed の倍率で決まる） */
const MOVE_MS = 350;
/** CPU がサイコロを振るまでの間（ms、「ふつう」のとき） */
const ROLL_MS = 350;
/** 「動かせる手がありません」を出しておく時間（ms） */
const PASS_MS = 1000;

const MODE_KEY = 'backgammon:mode';
const PASS_KEY = 'backgammon:pass';

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

function createWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./cpu.worker.ts', import.meta.url));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 盤の寸法（SVG の座標。スマホ 343px 幅のときの px と同じ）
// ---------------------------------------------------------------------------

const W = 343;
const H = 262;
const COL = 25;
const BAR_X = 150;
const BAR_W = 20;
const TRAY_X = 320;
const TRAY_W = 23;
const EDGE = 4;
const HALF = 115;
const TOP_Y = EDGE;
const BOTTOM_Y = H - EDGE;
const MID_TOP = EDGE + HALF;
const MID_BOTTOM = H - EDGE - HALF;
const R = 11.5;
const BAR_R = 9.5;
const STACK = 5;

/** 側 0 から見たポイント番号 n の列（0〜11） */
function colOf(n: number): number {
  return n <= 12 ? 12 - n : n - 13;
}

function colX(col: number): number {
  return col < 6 ? col * COL : BAR_X + BAR_W + (col - 6) * COL;
}

/** 当たり判定の区画 */
type Region = { kind: 'point'; n0: number } | { kind: 'bar' } | { kind: 'tray' };

function regionAt(x: number, y: number): Region | null {
  if (x < 0 || x > W || y < 0 || y > H) return null;
  if (x >= TRAY_X) return { kind: 'tray' };
  if (x >= BAR_X && x < BAR_X + BAR_W) return { kind: 'bar' };
  const col = x < BAR_X ? Math.floor(x / COL) : 6 + Math.floor((x - BAR_X - BAR_W) / COL);
  if (col < 0 || col > 11) return null;
  if (y < H / 2) return { kind: 'point', n0: col + 13 };
  return { kind: 'point', n0: 12 - col };
}

/** 区画を手番の側から見た番号に直す（バー 25・上がり 0） */
function regionToPoint(r: Region, turn: Side): number {
  if (r.kind === 'bar') return BAR;
  if (r.kind === 'tray') return OFF;
  return turn === 0 ? r.n0 : 25 - r.n0;
}

/** 手番の側から見た番号を、側 0 の番号に直す */
function toN0(p: number, turn: Side): number {
  return turn === 0 ? p : 25 - p;
}

// ---------------------------------------------------------------------------
// サイコロの絵
// ---------------------------------------------------------------------------

const PIPS: Record<number, [number, number][]> = {
  1: [[2, 2]],
  2: [[1, 1], [3, 3]],
  3: [[1, 1], [2, 2], [3, 3]],
  4: [[1, 1], [3, 1], [1, 3], [3, 3]],
  5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]],
  6: [[1, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]],
};

function DieFace({ value, used }: { value: number; used?: boolean }) {
  return (
    <svg
      className={`bg-die${used ? ' used' : ''}`}
      viewBox="0 0 24 24"
      width="26"
      height="26"
      role="img"
      aria-label={`${value}${used ? '（使用済み）' : ''}`}
    >
      <rect x="1" y="1" width="22" height="22" rx="4" className="bg-die-face" />
      {PIPS[value].map(([cx, cy], i) => (
        <circle key={i} cx={cx * 6} cy={cy * 6} r="2.1" className="bg-die-pip" />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 本体
// ---------------------------------------------------------------------------

interface Drag {
  from: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  moved: boolean;
}

/** 静的書き出しの HTML と食い違わないよう、最初の描画は決まった目で作る */
function placeholderGame(): BgState {
  const seq = [2, 1];
  let i = 0;
  return newGame(() => seq[i++ % 2] as 1 | 2);
}

export default function Game() {
  const [mode, setMode] = useState<Mode>('normal');
  const [autoPass, setAutoPass] = useState(false);
  const [speed, setSpeed] = useState<CpuSpeed>('normal');
  const [game, setGame] = useState<BgState>(placeholderGame);
  /** 対局の通し番号（はじめから・設定の変更で増やす。古い CPU の手を捨てるため） */
  const [gameNo, setGameNo] = useState(0);
  const [ready, setReady] = useState(false);
  const [begun, setBegun] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [notice, setNotice] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const gameRef = useRef(game);
  gameRef.current = game;
  const recorded = useRef(false);

  const records = useRecords(SLUG);
  const vsCpu = mode !== 'pvp';
  const variant = mode;
  const entry = records.entry(variant);

  const names: [string, string] = vsCpu ? ['あなた', 'CPU'] : ['手前', '奥'];
  const cpuTurn = vsCpu && game.turn === 1 && game.phase !== 'done';
  const myMove = ready && begun && game.phase === 'move' && !cpuTurn;

  useEffect(() => {
    const m = readSetting(MODE_KEY);
    const nextMode: Mode = MODES.includes(m as Mode) ? (m as Mode) : 'normal';
    setMode(nextMode);
    setAutoPass(readSetting(PASS_KEY) === 'auto');
    setSpeed(readCpuSpeed(SLUG));
    setGame(newGame(cryptoDie));
    setReady(true);
  }, []);

  useEffect(() => {
    workerRef.current = createWorker();
    return () => workerRef.current?.terminate();
  }, []);

  const restart = useCallback(() => {
    setGame(newGame(cryptoDie));
    setGameNo((n) => n + 1);
    setBegun(false);
    setSel(null);
    setDrag(null);
    setNotice('');
    recorded.current = false;
  }, []);

  const begin = useCallback(() => {
    if (begun) return;
    setBegun(true);
    records.start(variant);
    trackToolUse(SLUG, `start-${variant}`);
  }, [begun, records, variant]);

  // ---- 人の操作 ----

  const doRoll = useCallback(() => {
    const g = gameRef.current;
    if (!ready || g.phase !== 'roll' || cpuTurn) return;
    begin();
    setSel(null);
    setGame(roll(g, cryptoDie));
  }, [ready, cpuTurn, begin]);

  const doUndo = useCallback(() => {
    if (!myMove) return;
    setSel(null);
    setGame((g) => undoStep(g));
  }, [myMove]);

  const doEnd = useCallback(() => {
    if (!myMove) return;
    setSel(null);
    setGame((g) => endTurn(g));
  }, [myMove]);

  const playPath = useCallback(
    (path: Step[]) => {
      setSel(null);
      setGame((g) => path.reduce((s, st) => playStep(s, st, autoPass), g));
    },
    [autoPass],
  );

  const movable = useMemo(() => (myMove ? movableFrom(game) : []), [myMove, game]);
  const dests = useMemo(
    () => (myMove && sel !== null ? destinations(game, sel) : new Map<number, Step[]>()),
    [myMove, sel, game],
  );

  /** 列を叩いた（タップ・ドラッグの離した先） */
  const tapPoint = (p: number) => {
    if (!myMove) return;
    if (sel !== null) {
      const path = dests.get(p);
      if (path) {
        playPath(path);
        return;
      }
      // 光っていない列：選択を取り消すだけ（駒は動かさない）
      setSel(null);
      return;
    }
    if (movable.includes(p)) setSel(p);
  };

  const svgPoint = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!myMove) return;
    const { x, y } = svgPoint(e);
    const r = regionAt(x, y);
    if (!r) return;
    const p = regionToPoint(r, game.turn);
    if (sel === null && movable.includes(p)) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ from: p, x0: x, y0: y, x, y, moved: false });
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const { x, y } = svgPoint(e);
    const moved = drag.moved || Math.hypot(x - drag.x0, y - drag.y0) > 6;
    if (moved && !drag.moved) setSel(drag.from);
    setDrag({ ...drag, x, y, moved });
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const { x, y } = svgPoint(e);
    const r = regionAt(x, y);
    const d = drag;
    setDrag(null);
    if (d && d.moved) {
      // ドラッグ：候補の上で離したら動かす。それ以外は取り消す
      if (r) {
        const path = destinations(game, d.from).get(regionToPoint(r, game.turn));
        if (path) {
          playPath(path);
          return;
        }
      }
      setSel(null);
      return;
    }
    if (r) tapPoint(regionToPoint(r, game.turn));
  };

  // ---- キーボード ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === ' ') {
        e.preventDefault();
        doRoll();
      } else if (e.key === 'z' || e.key === 'Z') {
        doUndo();
      } else if (e.key === 'Enter') {
        doEnd();
      } else if (e.key === 'Escape') {
        setSel(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doRoll, doUndo, doEnd]);

  // ---- パス（使える手が1つも無い） ----
  const passKey = game.phase === 'move' && game.required === 0 ? `${gameNo}-${game.turn}-${game.dice}` : '';
  useEffect(() => {
    if (!passKey) return;
    const g = gameRef.current;
    setNotice(`${names[g.turn]}は動かせる手がありません`);
    const t = window.setTimeout(() => {
      setNotice('');
      setGame((s) => endTurn(s));
    }, PASS_MS);
    return () => window.clearTimeout(t);
    // names は表示だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passKey]);

  // ---- CPU ----
  const cpuKey =
    ready && begun && cpuTurn && !(game.phase === 'move' && game.required === 0)
      ? `${gameNo}-${game.phase}-${game.dice}-${game.turn}`
      : '';
  useEffect(() => {
    if (!cpuKey) return;
    const g = gameRef.current;
    const level = mode as Level;
    const timers: number[] = [];
    let cancelled = false;
    if (g.phase === 'roll') {
      timers.push(window.setTimeout(() => setGame((s) => roll(s, cryptoDie)), delayFor(ROLL_MS, speed)));
      return () => timers.forEach((t) => window.clearTimeout(t));
    }
    if (g.phase !== 'move' || !g.dice || g.played.length > 0) return;
    const req: CpuRequest = {
      me: g.pts[1],
      opp: g.pts[0],
      dice: g.dice,
      level,
      seed: (Math.random() * 0x7fffffff) | 0,
    };
    const animate = (steps: Step[]) => {
      if (cancelled) return;
      const gap = delayFor(MOVE_MS, speed);
      steps.forEach((s, i) => {
        timers.push(window.setTimeout(() => setGame((st) => playStep(st, s)), gap * (i + 1)));
      });
      timers.push(window.setTimeout(() => setGame((st) => endTurn(st)), gap * (steps.length + 1)));
    };
    const worker = workerRef.current;
    const id = Math.random();
    let onMessage: ((e: MessageEvent<{ id: number; steps: Step[] }>) => void) | null = null;
    if (worker) {
      onMessage = (e) => {
        if (e.data.id === id) animate(e.data.steps);
      };
      worker.addEventListener('message', onMessage);
      worker.postMessage({ id, req });
    } else {
      timers.push(window.setTimeout(() => animate(chooseMove(req)), 30));
    }
    return () => {
      cancelled = true;
      if (worker && onMessage) worker.removeEventListener('message', onMessage);
      timers.forEach((t) => window.clearTimeout(t));
    };
    // cpuKey が手番ごとに変わる。手を見せている途中の局面の変化では読み直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cpuKey]);

  // ---- 決着 ----
  useEffect(() => {
    if (game.phase !== 'done' || recorded.current || game.winner === null) return;
    recorded.current = true;
    const kind = game.points === 3 ? 'backgammon' : game.points === 2 ? 'gammon' : 'single';
    if (vsCpu) {
      const won = game.winner === 0;
      records.finish({ outcome: won ? 'win' : 'loss' }, variant);
      trackToolUse(SLUG, `${won ? 'win' : 'lose'}-${variant}-${kind}`);
    } else {
      records.finish({}, variant);
      trackToolUse(SLUG, `finish-pvp-${kind}`);
    }
  }, [game, vsCpu, records, variant]);

  // ---- 設定 ----
  const changeMode = (next: Mode) => {
    setMode(next);
    writeSetting(MODE_KEY, next);
    restart();
  };
  const changePass = (auto: boolean) => {
    setAutoPass(auto);
    writeSetting(PASS_KEY, auto ? 'auto' : 'confirm');
  };

  // ---- 表示 ----
  const rest = remainingDice(game);
  const shownDice: { value: number; used: boolean }[] = [];
  if (game.dice) {
    const all = diceToUse(game.dice);
    const left = rest.slice();
    for (const v of all) {
      const i = left.indexOf(v);
      if (i >= 0) {
        left.splice(i, 1);
        shownDice.push({ value: v, used: false });
      } else {
        shownDice.push({ value: v, used: true });
      }
    }
    // 使っていない目を先に並べる
    shownDice.sort((a, b) => Number(a.used) - Number(b.used));
  }

  const endable = myMove && canEndTurn(game) && game.required > 0;
  const showGate = ready && vsCpu && !begun && game.phase === 'roll' && game.turn === 1;

  let message = '';
  if (!ready) message = '';
  else if (game.phase === 'done' && game.winner !== null) {
    const kind = game.points === 3 ? 'バックギャモン・3点' : game.points === 2 ? 'ギャモン・2点' : '1点';
    message = vsCpu
      ? game.winner === 0
        ? `🎉 あなたの勝ちです（${kind}）`
        : `CPUの勝ちです（${kind}）`
      : `${names[game.winner]}の勝ちです（${kind}）`;
  } else if (notice) message = notice;
  else if (game.phase === 'roll' && game.opening) {
    const [a, b] = game.opening;
    const who = names[game.turn];
    message = `先手決め：${names[0]} ${a}・${names[1]} ${b} → ${who}の先手。`;
    message += cpuTurn ? '「スタート」で始めます' : '「振る」でこの2つの目で指します';
  } else if (game.phase === 'roll') {
    message = cpuTurn ? 'CPUが振ります…' : `${names[game.turn]}の番です。「振る」を押してください`;
  } else if (game.phase === 'move') {
    if (cpuTurn) message = 'CPUが動かしています…';
    else if (endable) message = autoPass ? '' : '目を使い切りました。「手番を終える」で渡します';
    else if (sel !== null) message = '光っている行き先を選んでください';
    else message = `${vsCpu ? '' : `${names[game.turn]}の番：`}動かす駒を選んでください（残りの目：${rest.join('・')}）`;
  }

  // 光らせる列（側 0 の番号。バー 25・上がり 0）
  const srcSet = new Set(sel === null ? movable.map((p) => toN0Region(p, game.turn)) : []);
  const dstSet = new Set([...dests.keys()].map((p) => toN0Region(p, game.turn)));
  const selN0 = sel === null ? null : toN0Region(sel, game.turn);

  const pip0 = pipCount(game.pts[0]);
  const pip1 = pipCount(game.pts[1]);

  return (
    <div className="card bg-game">
      <div className="btn-row">
        <div className="seg" role="group" aria-label="相手">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              className={m === mode ? 'active' : ''}
              aria-pressed={m === mode}
              onClick={() => changeMode(m)}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
        {vsCpu && (
          <CpuSpeedSeg
            value={speed}
            onChange={(next) => {
              setSpeed(next);
              writeCpuSpeed(SLUG, next);
            }}
          />
        )}
        <div className="seg" role="group" aria-label="手番の渡し方">
          <button type="button" className={!autoPass ? 'active' : ''} aria-pressed={!autoPass} onClick={() => changePass(false)}>
            確認して渡す
          </button>
          <button type="button" className={autoPass ? 'active' : ''} aria-pressed={autoPass} onClick={() => changePass(true)}>
            自動で渡す
          </button>
        </div>
        <button type="button" className="btn bg-restart" onClick={restart}>
          はじめから
        </button>
      </div>

      <RecordStrip
        items={
          vsCpu
            ? [
                {
                  label: `${LEVELS[mode as Level].label}との戦績`,
                  value: `${entry.wins ?? 0}勝 ${entry.losses ?? 0}敗`,
                },
                { label: '勝率', value: winRate(entry) === null ? '—' : `${winRate(entry)}%` },
              ]
            : [{ label: '2人での対局', value: `${entry.plays ?? 0}局` }]
        }
      />

      <p
        className="result-row"
        aria-live="polite"
        style={{
          color: game.phase === 'done' ? (vsCpu && game.winner === 0 ? 'var(--ok)' : 'var(--text)') : 'var(--muted)',
          fontWeight: game.phase === 'done' ? 700 : 400,
        }}
      >
        {message}
      </p>

      <div className="bg-play">
        <div className="bg-info">
          <span className="bg-pip">
            <span className="bg-chip side0" aria-hidden="true" />
            {names[0]} <b>{pip0}</b>
          </span>
          <span className="bg-dice" aria-label="サイコロ">
            {game.phase === 'roll' && game.opening && ready ? (
              <>
                <DieFace value={game.opening[0]} />
                <DieFace value={game.opening[1]} />
              </>
            ) : (
              shownDice.map((d, i) => <DieFace key={i} value={d.value} used={d.used} />)
            )}
          </span>
          <span className="bg-pip">
            <span className="bg-chip side1" aria-hidden="true" />
            {names[1]} <b>{pip1}</b>
          </span>
        </div>

        <div className="bg-board-wrap">
          <StartGate show={showGate} onStart={begin}>
            <svg
              ref={svgRef}
              className="bg-board"
              viewBox={`0 0 ${W} ${H}`}
              role="img"
              aria-label={`バックギャモンの盤。${names[0]}のピップ ${pip0}、${names[1]}のピップ ${pip1}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => setDrag(null)}
            >
              <Board
                game={game}
                srcSet={srcSet}
                dstSet={dstSet}
                selN0={selN0}
                hideOne={drag && drag.moved ? toN0Region(drag.from, game.turn) : null}
                labelSide={vsCpu ? 0 : game.turn}
              />
              {drag && drag.moved && (
                <circle cx={drag.x} cy={drag.y} r={R} className={`bg-checker side${game.turn} ghost`} />
              )}
            </svg>
          </StartGate>
        </div>

        <div className="bg-actions">
          <button
            type="button"
            className={`btn${game.phase === 'roll' && !cpuTurn && ready ? ' btn-primary' : ''}`}
            onClick={doRoll}
            disabled={!ready || game.phase !== 'roll' || cpuTurn}
          >
            振る
          </button>
          <button type="button" className="btn" onClick={doUndo} disabled={!myMove || !canUndo(game)}>
            ↩ 1手戻す
          </button>
          <button
            type="button"
            className={`btn${endable && !autoPass ? ' btn-primary' : ''}`}
            onClick={doEnd}
            disabled={!endable}
          >
            手番を終える
          </button>
        </div>
      </div>

      <details className="game-tips">
        <summary>この画面の見かた</summary>
        <p>
          {names[0]}は塗りの駒で、右下のインナーボード（1〜6）に向かって反時計回りに進みます。
          {names[1]}は白地に太い縁の駒です。動かせる駒の列が光り、選ぶと行き先が光ります。
          駒をつまんで行き先で離しても動かせます。右端の細い列が上げた駒の置き場です。
        </p>
        <p>
          「1手戻す」で戻せるのは、振ったあと・手番を渡す前の手です（何手でも。振った目は戻せません）。
          「自動で渡す」にすると、最後の1手を置いた瞬間に手番が渡るので、その1手は戻せません。
          キーボードは Space で振る・Z で戻す・Enter で手番を終える。
        </p>
      </details>
    </div>
  );
}

/** 手番の側の番号（バー 25・上がり 0）を、光らせる区画のキーにする */
function toN0Region(p: number, turn: Side): number {
  if (p === BAR) return BAR;
  if (p === OFF) return OFF;
  return toN0(p, turn);
}

function Board({
  game,
  srcSet,
  dstSet,
  selN0,
  hideOne,
  labelSide,
}: {
  game: BgState;
  srcSet: Set<number>;
  dstSet: Set<number>;
  selN0: number | null;
  /** ドラッグ中に持ち上げている駒（その列から1つ減らして描く） */
  hideOne: number | null;
  labelSide: Side;
}) {
  const [p0, p1] = game.pts;
  const lifted = (n0: number, side: Side) => (hideOne === n0 && game.turn === side ? 1 : 0);
  const items: React.ReactNode[] = [];

  // 地と縁
  items.push(<rect key="bg" x="0" y="0" width={W} height={H} rx="6" className="bg-felt" />);
  items.push(<rect key="bar" x={BAR_X} y="0" width={BAR_W} height={H} className="bg-barcol" />);
  items.push(<rect key="tray" x={TRAY_X} y="0" width={TRAY_W} height={H} className="bg-tray" />);

  for (let n0 = 1; n0 <= 24; n0++) {
    const col = colOf(n0);
    const x = colX(col);
    const top = n0 >= 13;
    const tipY = top ? TOP_Y + HALF - 10 : BOTTOM_Y - HALF + 10;
    const baseY = top ? TOP_Y : BOTTOM_Y;
    const hl = selN0 === n0 ? 'sel' : dstSet.has(n0) ? 'dst' : srcSet.has(n0) ? 'src' : '';
    items.push(
      <rect
        key={`hl${n0}`}
        x={x}
        y={top ? TOP_Y : MID_BOTTOM}
        width={COL}
        height={HALF}
        className={`bg-col ${hl}`}
      />,
    );
    items.push(
      <polygon
        key={`tri${n0}`}
        points={`${x + 0.5},${baseY} ${x + COL - 0.5},${baseY} ${x + COL / 2},${tipY}`}
        className={`bg-tri ${col % 2 === 0 ? 'a' : 'b'}`}
      />,
    );
    const label = labelSide === 0 ? n0 : 25 - n0;
    items.push(
      <text
        key={`lb${n0}`}
        x={x + COL / 2}
        y={top ? MID_TOP + 9 : MID_BOTTOM - 3}
        className="bg-label"
        textAnchor="middle"
      >
        {label}
      </text>,
    );

    // 駒
    const c0 = p0[n0] - lifted(n0, 0);
    const c1 = p1[25 - n0] - lifted(n0, 1);
    const side: Side = p0[n0] > 0 ? 0 : 1;
    const count = side === 0 ? c0 : c1;
    for (let k = 0; k < Math.min(count, STACK); k++) {
      const cy = top ? TOP_Y + R + k * (R * 2) : BOTTOM_Y - R - k * (R * 2);
      items.push(<circle key={`c${n0}-${k}`} cx={x + COL / 2} cy={cy} r={R - 0.5} className={`bg-checker side${side}`} />);
    }
    if (count > STACK) {
      const cy = top ? TOP_Y + R + (STACK - 1) * R * 2 : BOTTOM_Y - R - (STACK - 1) * R * 2;
      items.push(
        <text key={`n${n0}`} x={x + COL / 2} y={cy + 4} textAnchor="middle" className={`bg-count side${side}`}>
          {count}
        </text>,
      );
    }
  }

  // バー（側 0 は下半分・側 1 は上半分の、中央寄り）
  const barHl = selN0 === BAR ? 'sel' : srcSet.has(BAR) ? 'src' : '';
  items.push(<rect key="barhl" x={BAR_X} y={0} width={BAR_W} height={H} className={`bg-col ${barHl}`} />);
  ([0, 1] as Side[]).forEach((side) => {
    const n = game.pts[side][BAR] - (hideOne === BAR && game.turn === side ? 1 : 0);
    for (let k = 0; k < Math.min(n, 4); k++) {
      const cy = side === 0 ? MID_BOTTOM + BAR_R + 2 + k * BAR_R * 2 : MID_TOP - BAR_R - 2 - k * BAR_R * 2;
      items.push(
        <circle key={`bar${side}-${k}`} cx={BAR_X + BAR_W / 2} cy={cy} r={BAR_R} className={`bg-checker side${side}`} />,
      );
    }
    if (n > 4) {
      const cy = side === 0 ? MID_BOTTOM + BAR_R + 2 + 3 * BAR_R * 2 : MID_TOP - BAR_R - 2 - 3 * BAR_R * 2;
      items.push(
        <text key={`barn${side}`} x={BAR_X + BAR_W / 2} y={cy + 4} textAnchor="middle" className={`bg-count side${side}`}>
          {n}
        </text>,
      );
    }
  });

  // ベアオフの置き場（上半分が側 1・下半分が側 0。横向きの薄い板で積む）
  const trayHl = dstSet.has(OFF) ? 'dst' : '';
  items.push(<rect key="trayhl" x={TRAY_X} y={0} width={TRAY_W} height={H} className={`bg-col ${trayHl}`} />);
  ([0, 1] as Side[]).forEach((side) => {
    const n = game.pts[side][OFF];
    for (let k = 0; k < n; k++) {
      const y = side === 0 ? BOTTOM_Y - 6 - k * 6 : TOP_Y + k * 6;
      items.push(
        <rect key={`off${side}-${k}`} x={TRAY_X + 1.5} y={y} width={TRAY_W - 3} height={5} rx="1.5" className={`bg-checker side${side}`} />,
      );
    }
  });

  return <>{items}</>;
}
