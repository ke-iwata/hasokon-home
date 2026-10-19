'use client';

/**
 * マンカラ（カラハ）の画面。
 *
 * 仕様: docs/features/game-mancala.md
 *
 * 撒く・取る・終局・CPU・今日の 1 手番の生成と解き手は、すべて `lib/mancala.ts`（純関数）が持つ。
 * ここは**入力（タップ・1〜6 のキー・マウスを乗せたときの予告）と描画と、撒く演出の間**だけを持つ。
 *
 * ## 局面
 *
 * `choose`（選ぶ）→ `sowing`（1 個ずつ進める）→ `capture`（横取りの演出）→ `cpu`（考える）→ `over`。
 * 表示の出し分けは `phase` で決める（画面の約束 7）。撒いている途中の数は `display`、
 * 光るマスは `glowRef` に置き、`lib/` の状態には入れない（約束 9）。
 *
 * ## 盤の並び
 *
 * PC は横長（左に相手のゴール・右に自分のゴール）、600px 以下はゴールを横長の帯にして盤の上下へ移す。
 * DOM は 1 つで、並びは `app/globals.css` の `grid-template-areas` だけで切り替える。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyMove,
  cpuMove,
  CPU_STORE,
  dailyPuzzle,
  DAILY_VERSION,
  finish,
  LEVEL_LABEL,
  LEVEL_ORDER,
  legalMoves,
  MODE_LABEL,
  MODE_ORDER,
  MY_STORE,
  opposite,
  outcomeOf,
  ownerOf,
  pitsOf,
  playTurn,
  previewMove,
  readDailyProgress,
  shareText,
  sowPath,
  initialState,
  variantOf,
  writeDailyProgress,
  type DailyPuzzle,
  type Level,
  type MancalaState,
  type Mode,
  type MoveResult,
} from '@/lib/mancala';
import { currentStreak, dailySeed, localDateKey, nextStreak } from '@/lib/daily';
import { browserStorage, winRate, type Improved } from '@/lib/records';
import { SITE_URL } from '@/lib/registry';
import { trackToolUse } from '@/lib/analytics';
import { BestBadge, RecordStrip, useRecords } from '@/app/_records/Records';
import { CpuSpeedSeg, delayFor, readCpuSpeed, writeCpuSpeed, type CpuSpeed } from '@/app/_cpu/CpuSpeed';
import { StartGate } from '@/app/_cpu/StartGate';

/** 石が 1 マス進む間（ms、「ふつう」のとき） */
const SOW_STEP_MS = 140;
/** 横取りの演出の間（ms、「ふつう」のとき） */
const CAPTURE_MS = 520;
/** CPU が考えている間（ms、「ふつう」のとき） */
const THINK_MS = 520;
/** 石の粒を描く上限（これを超えたら数字だけ） */
const MAX_DOTS = 8;

type Phase = 'loading' | 'choose' | 'sowing' | 'capture' | 'cpu' | 'over';

/** 画面の左から並べた CPU の穴（CPU から見て右から） */
const TOP_ROW = pitsOf('cpu').slice().reverse();
const BOTTOM_ROW = pitsOf('me');

function resultNote(r: MoveResult, who: 'me' | 'cpu'): string {
  const name = who === 'me' ? '' : 'CPU：';
  if (r.captured > 0 && r.extraTurn) return `${name}横取り（${r.captured}個）・もう1回`;
  if (r.captured > 0) return `${name}横取り（${r.captured}個）`;
  if (r.extraTurn) return `${name}もう1回！`;
  return '';
}

export default function Game() {
  const [mode, setMode] = useState<Mode>('cpu');
  const [level, setLevel] = useState<Level>('normal');
  /** 次の対局で自分が先手か。1 局ごとに交互（最初の 1 局は先手） */
  const [userFirst, setUserFirst] = useState(true);
  /** この局で自分が先手か */
  const [firstNow, setFirstNow] = useState(true);
  const [speed, setSpeed] = useState<CpuSpeed>('normal');
  const [today, setToday] = useState('');

  const [phase, setPhase] = useState<Phase>('loading');
  const [state, setState] = useState<MancalaState>(() => initialState('me'));
  /** 撒いている途中に見せる石の数（撒いていないときは null で `state` を見せる） */
  const [display, setDisplay] = useState<number[] | null>(null);
  /** 盤の下の 1 行（「もう 1 回」「横取り」・終局の知らせ） */
  const [note, setNote] = useState('');
  const [hover, setHover] = useState<number | null>(null);
  /** スタート待ち（後手のとき、開いた瞬間に CPU が撒き始めないように） */
  const [begun, setBegun] = useState(false);
  const [improved, setImproved] = useState<Improved | null>(null);
  const [copied, setCopied] = useState(false);

  /** 今日の 1 手番 */
  const [puzzle, setPuzzle] = useState<DailyPuzzle | null>(null);
  const [dailyPath, setDailyPath] = useState<number[]>([]);
  const [streak, setStreak] = useState<number | undefined>(undefined);

  const records = useRecords('mancala');
  const variant = variantOf(mode, level);
  const entry = records.entry(variant);

  /** 光るマス（演出。状態に入れない） */
  const glowRef = useRef<Set<number>>(new Set());
  const timers = useRef<number[]>([]);
  const counted = useRef(false);
  const firstMoveSent = useRef(false);
  // 間の途中で設定が変わっても、走っている演出が古い値を読まないように
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const levelRef = useRef(level);
  levelRef.current = level;

  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  /** CPU 対戦を始める */
  const startCpu = useCallback((first: boolean, lv: Level) => {
    clearTimers();
    glowRef.current = new Set();
    counted.current = false;
    setMode('cpu');
    setFirstNow(first);
    setState(initialState(first ? 'me' : 'cpu'));
    setDisplay(null);
    setNote('');
    setImproved(null);
    setBegun(first);
    setPhase(first ? 'choose' : 'cpu');
    trackToolUse('mancala', `new-${lv}-${first ? 'first' : 'second'}`);
  }, []);

  /** 今日の 1 手番を始める（保存してある撒き順があれば戻す） */
  const startDaily = useCallback((key: string) => {
    clearTimers();
    glowRef.current = new Set();
    setMode('daily');
    setDisplay(null);
    setImproved(null);
    setCopied(false);
    const p = dailyPuzzle(dailySeed(key, DAILY_VERSION));
    setPuzzle(p);
    const saved = readDailyProgress(browserStorage(), key);
    const replayed = playTurn(p.state, saved);
    setDailyPath(saved.slice(0, saved.length));
    setState(replayed.state);
    counted.current = saved.length > 0;
    if (replayed.done) {
      setNote('');
      setPhase('over');
    } else {
      setNote('');
      setPhase('choose');
    }
    setBegun(true);
  }, []);

  useEffect(() => {
    // 「今日」と局面はマウント後に決める（静的書き出しの HTML に焼き付けない）
    setToday(localDateKey());
    setSpeed(readCpuSpeed('mancala'));
    startCpu(true, 'normal');
    return clearTimers;
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 撒いた後の処理（演出が済んでから呼ぶ） */
  const settle = useCallback(
    (r: MoveResult, mover: 'me' | 'cpu', m: Mode, path: number[]) => {
      glowRef.current = new Set();
      setDisplay(null);
      if (m === 'daily') {
        setState(r.state);
        setNote(resultNote(r, 'me'));
        if (!r.extraTurn || r.gameOver) {
          // 手番が終わった（途中の終局も `finish()` を呼ばない）
          setPhase('over');
          const p = puzzle;
          if (!p) return;
          const got = r.state.pits[MY_STORE] - p.state.pits[MY_STORE];
          if (got >= p.best) {
            setStreak(nextStreak(entry.lastClearedOn, today, entry.streak));
            if (entry.lastClearedOn !== today) {
              const res = records.finish({ outcome: 'win', clearedOn: today }, 'daily');
              setImproved(res.improved);
            }
            trackToolUse('mancala', 'daily-clear');
          } else {
            trackToolUse('mancala', 'daily-miss');
          }
          writeDailyProgress(browserStorage(), today, path);
        } else {
          setPhase('choose');
        }
        return;
      }
      if (r.gameOver) {
        const done = finish(r.state);
        setState(done);
        const o = outcomeOf(done);
        setNote('');
        setPhase('over');
        const res = records.finish({ outcome: o, score: done.pits[MY_STORE] }, `cpu-${levelRef.current}`);
        setImproved(res.improved);
        trackToolUse('mancala', `${o === 'loss' ? 'lose' : o}-${levelRef.current}`);
        // 次の局は先手・後手を入れ替える
        setUserFirst((f) => !f);
        return;
      }
      setState(r.state);
      setNote(resultNote(r, mover));
      setPhase(r.state.turn === 'cpu' ? 'cpu' : 'choose');
    },
    [puzzle, entry, today, records],
  );

  /** 1 回撒く（石を 1 個ずつ進め、横取りがあれば光らせてから確定する） */
  const sow = useCallback(
    (from: MancalaState, pit: number, m: Mode, path: number[]) => {
      const mover = from.turn;
      const steps = sowPath(from, pit);
      const r = applyMove(from, pit);
      const shown = from.pits.slice();
      shown[pit] = 0;
      glowRef.current = new Set([pit]);
      setDisplay(shown.slice());
      setPhase('sowing');
      setHover(null);
      const step = delayFor(SOW_STEP_MS, speedRef.current);
      steps.forEach((at, i) => {
        later(() => {
          shown[at] += 1;
          glowRef.current = new Set([at]);
          setDisplay(shown.slice());
        }, step * (i + 1));
      });
      const end = step * (steps.length + 1);
      if (r.captured > 0) {
        const last = steps[steps.length - 1];
        later(() => {
          glowRef.current = new Set([last, opposite(last), mover === 'me' ? MY_STORE : CPU_STORE]);
          setPhase('capture');
          setDisplay(r.state.pits.slice());
        }, end);
        later(() => settle(r, mover, m, path), end + delayFor(CAPTURE_MS, speedRef.current));
      } else {
        later(() => settle(r, mover, m, path), end);
      }
    },
    [settle],
  );

  // CPU の手番（考える間を置いてから撒く）。スタート前は動かない
  useEffect(() => {
    if (phase !== 'cpu' || !begun || mode !== 'cpu') return;
    const t = window.setTimeout(() => {
      // CPU に渡すのは盤の状態だけ
      sow(state, cpuMove(state, levelRef.current, Math.random), 'cpu', []);
    }, delayFor(THINK_MS, speedRef.current));
    return () => window.clearTimeout(t);
  }, [phase, begun, mode, state, sow]);

  const myTurn = phase === 'choose' && state.turn === 'me';
  const legal = useMemo(() => (myTurn ? legalMoves(state) : []), [myTurn, state]);

  const play = useCallback(
    (pit: number) => {
      if (!myTurn || !legal.includes(pit)) return;
      setBegun(true);
      setNote('');
      if (!firstMoveSent.current) {
        firstMoveSent.current = true;
        trackToolUse('mancala', 'first-move');
      }
      if (!counted.current) {
        counted.current = true;
        records.start(variant);
      }
      let path: number[] = [];
      if (mode === 'daily') {
        path = [...dailyPath, pit];
        setDailyPath(path);
        writeDailyProgress(browserStorage(), today, path);
      }
      sow(state, pit, mode, path);
    },
    [myTurn, legal, records, variant, mode, dailyPath, today, sow, state],
  );

  // キーボードの 1〜6（左から）
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (/^[1-6]$/.test(e.key)) {
        e.preventDefault();
        play(BOTTOM_ROW[Number(e.key) - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [play]);

  const switchMode = (m: Mode) => {
    if (m === 'daily') startDaily(today || localDateKey());
    else startCpu(userFirst, level);
  };

  const changeLevel = (lv: Level) => {
    setLevel(lv);
    startCpu(userFirst, lv);
  };

  const changeFirst = (f: boolean) => {
    setUserFirst(f);
    startCpu(f, level);
  };

  const pits = display ?? state.pits;
  const preview = myTurn && hover !== null && legal.includes(hover) ? previewMove(state, hover) : null;
  const glow = phase === 'sowing' || phase === 'capture' ? glowRef.current : new Set<number>();

  // 今日の 1 手番の結果
  const got = puzzle ? state.pits[MY_STORE] - puzzle.state.pits[MY_STORE] : 0;
  const dailyCleared = mode === 'daily' && phase === 'over' && puzzle !== null && got >= puzzle.best;
  const streakNow = currentStreak(entry.lastClearedOn, today, entry.streak);

  /** 盤の下の 1 行（高さは常に確保。予告・結果・終局の知らせのどれか 1 つ） */
  let line = '';
  let lineStrong = false;
  if (phase === 'over' && mode === 'cpu') {
    const o = outcomeOf(state);
    const a = state.pits[MY_STORE];
    const b = state.pits[CPU_STORE];
    line = o === 'win' ? `🎉 あなたの勝ち（${a} 対 ${b}）` : o === 'loss' ? `CPUの勝ち（${a} 対 ${b}）` : `引き分け（${a} 対 ${b}）`;
    lineStrong = true;
  } else if (phase === 'over' && mode === 'daily' && puzzle) {
    line = dailyCleared
      ? `🎉 ${got}個 / 最大${puzzle.best}個　クリア！${streak ? `・連続${streak}日` : ''}`
      : `${got}個 / 最大${puzzle.best}個　最適な撒き順：左から ${puzzle.path.map((p) => p + 1).join(' → ')}`;
    lineStrong = true;
  } else if (preview) {
    line =
      preview.captured > 0
        ? `横取り（${preview.captured}個）${preview.extraTurn ? '・もう1回' : ''}`
        : preview.extraTurn
          ? 'もう1回'
          : '';
  } else {
    line = note;
  }

  let status: string;
  if (phase === 'loading') status = '準備しています…';
  else if (phase === 'over') status = mode === 'cpu' ? '対局終了' : '手番が終わりました';
  else if (!begun) status = 'スタート待ち';
  else if (phase === 'cpu') status = 'CPUが考えています…';
  else if (phase === 'sowing' || phase === 'capture') status = state.turn === 'me' ? '撒いています…' : 'CPUが撒いています…';
  else if (mode === 'daily') status = `この手番でいま${got}個`;
  else status = 'あなたの番です';

  const recordItems = useMemo(() => {
    if (mode === 'daily') {
      return [
        { label: 'クリア', value: `${entry.wins ?? 0}回` },
        { label: '連続', value: `${streakNow}日` },
      ];
    }
    return [
      {
        label: `${LEVEL_LABEL[level]}との戦績`,
        value: `${entry.wins ?? 0}勝 ${entry.losses ?? 0}敗 ${entry.draws ?? 0}分`,
      },
      // 「最多」（bestScore）は記録には残すが帯には出さない。初戦を終えた瞬間に項目が増えると、
      // 320px で帯が 2 行に折り返して盤が 50px 下がる（画面の約束 1。#424 のレビュー）
      { label: '勝率', value: winRate(entry) === null ? '—' : `${winRate(entry)}%` },
    ];
  }, [mode, entry, level, streakNow]);

  const copyResult = () => {
    if (!puzzle) return;
    const text = shareText({ dateKey: today, got, best: puzzle.best, url: `${SITE_URL}/mancala/` });
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        trackToolUse('mancala', 'copy-result');
      },
      () => setCopied(false),
    );
  };

  /** 局の途中は今の局の、決着後は次の局の先手・後手を見せる */
  const shownFirst = phase === 'over' ? userFirst : firstNow;

  const renderPit = (i: number, area: string) => {
    const n = pits[i];
    const mine = ownerOf(i) === 'me';
    const playable = mine && legal.includes(i);
    const cls = [
      'mc-pit',
      mine ? 'mc-mine' : 'mc-theirs',
      playable ? 'mc-playable' : '',
      glow.has(i) ? 'mc-glow' : '',
      preview?.last === i ? 'mc-target' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const label = mine ? `あなたの穴 ${BOTTOM_ROW.indexOf(i) + 1}：${n}個` : `CPUの穴：${n}個`;
    return (
      <button
        key={i}
        type="button"
        className={cls}
        style={{ gridArea: area }}
        disabled={!playable}
        aria-label={label}
        onClick={() => play(i)}
        onMouseEnter={() => mine && setHover(i)}
        onMouseLeave={() => setHover((h) => (h === i ? null : h))}
      >
        <span className="mc-hole" aria-hidden="true">
          {n <= MAX_DOTS && (
            <span className="mc-dots">
              {Array.from({ length: n }, (_, k) => (
                <span key={k} className="mc-dot" />
              ))}
            </span>
          )}
          <span className="mc-count">{n}</span>
        </span>
      </button>
    );
  };

  const renderStore = (i: number, area: string, label: string) => (
    <div
      className={`mc-store ${i === MY_STORE ? 'mc-store-mine' : 'mc-store-theirs'}${glow.has(i) ? ' mc-glow' : ''}${preview?.last === i ? ' mc-target' : ''}`}
      style={{ gridArea: area }}
      aria-label={`${label}：${pits[i]}個`}
      role="img"
    >
      <span className="mc-store-label">{label}</span>
      <span className="mc-store-count">{pits[i]}</span>
      {i === MY_STORE && (
        <span className="mc-store-turn" aria-hidden="true">
          ↻
        </span>
      )}
    </div>
  );

  return (
    <div className="card mc-game">
      <div className="btn-row">
        <div className="seg" role="group" aria-label="モード">
          {MODE_ORDER.map((m) => (
            <button
              key={m}
              type="button"
              className={m === mode ? 'active' : ''}
              aria-pressed={m === mode}
              onClick={() => switchMode(m)}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      {/* モードごとの設定。行は常に置いて高さを変えない（画面の約束 1・5。強さ・先手後手は畳まない） */}
      <div className="btn-row mc-options">
        {mode === 'cpu' ? (
          <>
            <div className="seg" role="group" aria-label="CPUの強さ">
              {LEVEL_ORDER.map((l) => (
                <button
                  key={l}
                  type="button"
                  className={l === level ? 'active' : ''}
                  aria-pressed={l === level}
                  onClick={() => changeLevel(l)}
                >
                  {LEVEL_LABEL[l]}
                </button>
              ))}
            </div>
            <div className="seg" role="group" aria-label="先手・後手">
              {[true, false].map((f) => (
                <button
                  key={String(f)}
                  type="button"
                  className={f === shownFirst ? 'active' : ''}
                  aria-pressed={f === shownFirst}
                  onClick={() => changeFirst(f)}
                >
                  {f ? '先手' : '後手'}
                </button>
              ))}
            </div>
            <CpuSpeedSeg
              value={speed}
              onChange={(next) => {
                setSpeed(next);
                writeCpuSpeed('mancala', next);
              }}
            />
          </>
        ) : (
          <span className="mc-option-text">今日は全員同じ局面・「もう1回」をつないで最大を狙う</span>
        )}
      </div>

      <RecordStrip items={recordItems} />

      <div className="status-bar">
        <span className="mc-score">
          CPU <strong>{pits[CPU_STORE]}</strong>・あなた <strong>{pits[MY_STORE]}</strong>
        </span>
        <span className="mc-status" aria-live="polite">
          {status}
        </span>
      </div>

      <StartGate show={!begun && mode === 'cpu' && phase !== 'over'} onStart={() => setBegun(true)}>
        <div className="mc-board" role="group" aria-label="マンカラの盤">
          {renderStore(CPU_STORE, 'cs', 'CPU')}
          <span className="mc-arrows mc-arrows-top" aria-hidden="true">
            ← ← ←
          </span>
          {TOP_ROW.map((i, k) => renderPit(i, `t${k}`))}
          {BOTTOM_ROW.map((i, k) => renderPit(i, `b${k}`))}
          <span className="mc-arrows mc-arrows-bottom" aria-hidden="true">
            → → →
          </span>
          {renderStore(MY_STORE, 'ms', 'あなた')}
        </div>
      </StartGate>

      <p className={`mc-line${lineStrong ? ' mc-line-strong' : ''}`} aria-live="polite">
        {line}
        {/* 負けた局でも最多の個数は記録に残るが、「ベスト更新！」で祝うのは勝った局と今日の 1 手番のクリアだけ */}
        {phase === 'over' && (mode === 'daily' || outcomeOf(state) === 'win') && <BestBadge improved={improved} />}
      </p>

      <div className="btn-row mc-actions">
        {mode === 'cpu' ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => startCpu(phase === 'over' ? userFirst : firstNow, level)}
          >
            {phase === 'over' ? `次の対局（${userFirst ? '先手' : '後手'}）` : '最初から'}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={copyResult} disabled={phase !== 'over'}>
            {copied ? 'コピーしました' : '結果をコピー'}
          </button>
        )}
      </div>

      <details className="game-tips">
        <summary>この画面の見かた</summary>
        <p>
          下の列があなたの穴で、押すと中の石を右隣から反時計回りに1個ずつ配ります（キーボードの1〜6でも撒けます）。
          最後の石があなたのゴールで止まれば「もう1回」、自分の空の穴で止まって向かいに石があれば「横取り」です。
          PCでは穴にマウスを乗せると、最後の石が止まるマスが光ります。
          {mode === 'daily'
            ? '今日の1手番は、この1回の手番だけで何個ゴールに入れられるかに挑みます（CPUは撒きません）。'
            : '先手・後手は1局ごとに入れ替わります。'}
        </p>
      </details>
    </div>
  );
}
