'use client';

/**
 * 四目並べ（落とし込み）の画面。
 *
 * 仕様: docs/features/game-yonmoku-narabe.md
 *
 * 盤・合法手・勝敗判定・CPU の探索・「1 手もどす」の手数・計測の `action` は、
 * すべて `lib/yonmoku-narabe.ts`（純関数）が持つ。ここは**入力（列のタップ・マウスの影・←→ と Enter／Space）と
 * 描画と、CPU の間**だけを持つ。
 *
 * - 局は「指した列の並び」（`history`）だけで持ち、盤はそこから毎回組み立てる（もどすは配列を縮めるだけ）
 * - コマが落ちる動きと勝ちの線は描画だけの演出で、`lib/` の状態には入れない（画面の約束 9）
 * - 盤の上の影の段・結果の行・設定の行は常に置き、指しても高さが変わらない（画面の約束 1）
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  beginAction,
  canPlay,
  cellsOf,
  COLS,
  cpuMove,
  dropRow,
  fromMoves,
  LEVEL_LABEL,
  LEVEL_ORDER,
  outcomeOf,
  ROWS,
  sideToMove,
  undoCount,
  winLine,
  winnerOf,
  type Level,
  type Side,
} from '@/lib/yonmoku-narabe';
import { trackToolUse } from '@/lib/analytics';
import { winRate } from '@/lib/records';
import { RecordStrip, useRecords } from '@/app/_records/Records';
import { CpuSpeedSeg, delayFor, readCpuSpeed, writeCpuSpeed, type CpuSpeed } from '@/app/_cpu/CpuSpeed';
import { StartGate } from '@/app/_cpu/StartGate';

const SLUG = 'yonmoku-narabe';
/** CPU が指すまでの間（ms、「ふつう」のとき。仕様書の 600ms） */
const THINK_MS = 600;

type Mode = 'cpu' | 'pvp';
const MODE_LABEL: Record<Mode, string> = { cpu: 'CPUと対戦', pvp: '2人で対戦' };
const SIDE_NAME: Record<Side, string> = { 1: '先手（黒）', 2: '後手（白）' };

/** 計測の印を読むための sessionStorage（使えなければ null） */
function sessionStore(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export default function Game() {
  const [mode, setMode] = useState<Mode>('cpu');
  const [level, setLevel] = useState<Level>('normal');
  /** この局での自分の側（CPU 対戦） */
  const [human, setHuman] = useState<Side>(1);
  const [history, setHistory] = useState<number[]>([]);
  /** 投了した側（投了していなければ null） */
  const [resigned, setResigned] = useState<Side | null>(null);
  /** スタート待ち（後手のとき、開いた瞬間に CPU が指し始めないように） */
  const [begun, setBegun] = useState(false);
  const [speed, setSpeed] = useState<CpuSpeed>('normal');
  /** マウスを乗せている列 */
  const [hover, setHover] = useState<number | null>(null);
  /** キーボードで選んでいる列（←→） */
  const [cursor, setCursor] = useState(3);
  const [useKeys, setUseKeys] = useState(false);

  const records = useRecords(SLUG);
  const entry = records.entry(level);
  /** 1 局につき 1 回だけ数える（もどすで終局をやり直しても二重に数えない） */
  const recorded = useRef(false);
  const beginSent = useRef(false);
  const colRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const board = useMemo(() => fromMoves(history), [history]);
  const cells = useMemo(() => cellsOf(board), [board]);
  const outcome = outcomeOf(board);
  const over = outcome !== 'playing' || resigned !== null;
  const turn = sideToMove(board);
  const cpuTurn = mode === 'cpu' && !over && turn !== human;
  const humanTurn = !over && !cpuTurn;
  const line = outcome === 'win' ? winLine(cells) : null;

  /** 新しい局を始める */
  const start = useCallback((m: Mode, first: Side) => {
    setMode(m);
    setHuman(first);
    setHistory([]);
    setResigned(null);
    setBegun(false);
    recorded.current = false;
    beginSent.current = false;
  }, []);

  useEffect(() => {
    setSpeed(readCpuSpeed(SLUG));
  }, []);

  // 局の開始を 1 回だけ送る（CPU 対戦は `begin-<強さ>`、対面は `begin-pvp`。リバーシ経由の印は最初の 1 局だけ）
  useEffect(() => {
    if (!begun || beginSent.current) return;
    beginSent.current = true;
    trackToolUse(SLUG, beginAction(mode === 'pvp' ? 'pvp' : level, sessionStore()));
  }, [begun, mode, level]);

  // CPU の手番。読みは同期処理なので、間を置いてから動かす。スタート前は動かない
  useEffect(() => {
    if (!cpuTurn || !begun) return;
    const t = window.setTimeout(() => {
      const col = cpuMove(board, level, Math.random);
      setHistory((h) => [...h, col]);
    }, delayFor(THINK_MS, speed));
    return () => window.clearTimeout(t);
  }, [cpuTurn, begun, board, level, speed]);

  // 決着（記録と計測は 1 局 1 回。対面モードは記録を付けない）
  useEffect(() => {
    if (!over || recorded.current || mode !== 'cpu') return;
    recorded.current = true;
    const winner = resigned !== null ? (resigned === 1 ? 2 : 1) : winnerOf(board);
    const o = winner === null ? 'draw' : winner === human ? 'win' : 'loss';
    records.finish({ outcome: o }, level);
    trackToolUse(SLUG, `${o === 'loss' ? 'lose' : o}-${level}`);
  }, [over, mode, resigned, board, human, records, level]);

  const drop = useCallback(
    (col: number) => {
      if (!humanTurn || !canPlay(board, col)) return;
      // 自分から指したら、それをスタートの合図とみなす
      setBegun(true);
      setHover(null);
      setHistory((h) => [...h, col]);
    },
    [humanTurn, board],
  );

  // キーボード：←→ で列を選び、Enter／Space で落とす
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT|SUMMARY)$/.test(target.tagName)) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        setUseKeys(true);
        setCursor((c) => {
          const next = Math.max(0, Math.min(COLS - 1, c + (e.key === 'ArrowLeft' ? -1 : 1)));
          // 盤の列にフォーカスがあるときは、フォーカスも一緒に動かす
          if (target?.classList.contains('y4-col')) colRefs.current[next]?.focus();
          return next;
        });
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        // ボタンの上ではボタンそのものが押される（二重に落とさない）
        if (target?.tagName === 'BUTTON') return;
        e.preventDefault();
        setUseKeys(true);
        drop(cursor);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drop, cursor]);

  const nUndo = undoCount(history.length, mode === 'cpu' ? human : null);
  const canUndo = nUndo > 0 && !cpuTurn && resigned === null;
  const undo = () => {
    if (!canUndo) return;
    setHistory((h) => h.slice(0, h.length - nUndo));
  };

  const resign = () => {
    if (over || history.length === 0) return;
    setBegun(true);
    setResigned(mode === 'cpu' ? human : turn);
  };

  /** 次の局（CPU 対戦は先手・後手を入れ替える） */
  const next = () => start(mode, mode === 'cpu' ? (human === 1 ? 2 : 1) : 1);

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    start(m, 1);
  };

  const changeLevel = (lv: Level) => {
    setLevel(lv);
    start('cpu', human);
  };

  // ---- 表示 ----

  const nameOf = (s: Side) => (mode === 'pvp' ? SIDE_NAME[s].slice(0, 2) : s === human ? 'あなた' : 'CPU');

  /** 読み上げ（直前の 2 手と結果） */
  const spoken = (() => {
    const parts: string[] = [];
    const from = Math.max(0, history.length - 2);
    for (let i = from; i < history.length; i += 1) {
      parts.push(`${nameOf(i % 2 === 0 ? 1 : 2)}：${history[i] + 1}列目`);
    }
    return parts.join('。');
  })();

  let result = '';
  let good = false;
  if (resigned !== null) {
    result = mode === 'cpu' ? '投了しました。CPUの勝ちです' : `${SIDE_NAME[resigned]}の投了。${SIDE_NAME[resigned === 1 ? 2 : 1]}の勝ちです`;
  } else if (outcome === 'draw') {
    result = '引き分け（全部のマスが埋まりました）';
  } else if (outcome === 'win') {
    const w = winnerOf(board) as Side;
    if (mode === 'pvp') {
      result = `🎉 ${SIDE_NAME[w]}の勝ちです`;
      good = true;
    } else if (w === human) {
      result = '🎉 あなたの勝ちです';
      good = true;
    } else {
      result = 'CPUの勝ちです';
    }
  }

  let status: string;
  if (over) status = '対局終了';
  else if (mode === 'cpu' && !begun) status = 'スタート待ち';
  else if (cpuTurn) status = 'CPUが考えています…';
  else if (mode === 'pvp') status = `${SIDE_NAME[turn]}の番です`;
  else status = 'あなたの番です';

  const recordItems =
    mode === 'cpu'
      ? [
          {
            label: `${LEVEL_LABEL[level]}との戦績`,
            value: `${entry.wins ?? 0}勝 ${entry.losses ?? 0}敗 ${entry.draws ?? 0}分`,
          },
          { label: '勝率', value: winRate(entry) === null ? '—' : `${winRate(entry)}%` },
        ]
      : [{ label: '2人で対戦', value: '記録は付けません' }];

  /** 影を出す列（自分の番だけ） */
  const ghostCol = humanTurn && (mode === 'pvp' || begun || turn === human) ? (hover ?? (useKeys ? cursor : null)) : null;
  const lastCol = history.length > 0 ? history[history.length - 1] : -1;
  const lastRow = lastCol >= 0 ? dropRow(fromMoves(history.slice(0, -1)), lastCol) : -1;
  const winSet = new Set(line?.line ?? []);
  const discClass = (v: number) => (v === 1 ? 'black' : 'white');

  return (
    <div className="card y4-game">
      <div className="btn-row">
        <div className="seg" role="group" aria-label="モード">
          {(['cpu', 'pvp'] as Mode[]).map((m) => (
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

      {/* モードごとの設定。行は常に置いて高さを変えない（画面の約束 1・5） */}
      <div className="btn-row y4-options">
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
            <CpuSpeedSeg
              value={speed}
              onChange={(v) => {
                setSpeed(v);
                writeCpuSpeed(SLUG, v);
              }}
            />
          </>
        ) : (
          <span className="y4-option-text">1台を交互に使います。先手が黒・後手が白</span>
        )}
      </div>

      <RecordStrip items={recordItems} />

      <div className="status-bar y4-status">
        <span className="y4-who">
          {mode === 'cpu' ? (
            <>
              あなた
              <span className={`y4-chip ${discClass(human)}`} aria-hidden="true" />
              {SIDE_NAME[human]}
            </>
          ) : (
            <>
              先手
              <span className="y4-chip black" aria-hidden="true" />
              ・後手
              <span className="y4-chip white" aria-hidden="true" />
            </>
          )}
        </span>
        <span>{status}</span>
      </div>

      <p className={`result-row y4-result${good ? ' y4-good' : ''}`}>{result}</p>
      {/* 読み上げ専用。「あなた：4列目。CPU：3列目」 */}
      <p className="y4-sr" aria-live="polite">
        {[spoken, result].filter(Boolean).join('。')}
      </p>

      <StartGate show={mode === 'cpu' && !begun && !over} onStart={() => setBegun(true)}>
        <div className="y4-board" role="grid" aria-label="四目並べの盤（7列）">
          {/* マウスを乗せた列・キーボードで選んだ列の上にコマの影（段は常に置く） */}
          <div className="y4-ghosts" aria-hidden="true">
            {Array.from({ length: COLS }, (_, c) => (
              <span key={c} className="y4-ghost-slot">
                {ghostCol === c && canPlay(board, c) && <span className={`y4-disc ${discClass(turn)} y4-shadow`} />}
              </span>
            ))}
          </div>
          <div className="y4-frame">
            <div className="y4-cols" role="row">
              {Array.from({ length: COLS }, (_, c) => {
                const free = ROWS - Array.from({ length: ROWS }, (_, r) => cells[r * COLS + c]).filter((v) => v !== 0).length;
                const playable = humanTurn && free > 0;
                return (
                  <div key={c} role="gridcell" className="y4-colcell">
                    <button
                      type="button"
                      ref={(el) => {
                        colRefs.current[c] = el;
                      }}
                      className={`y4-col${playable ? ' playable' : ''}${useKeys && cursor === c && humanTurn ? ' y4-cursor' : ''}`}
                      disabled={!playable}
                      aria-label={`${c + 1}列目（${free > 0 ? `あと${free}マス` : '満杯'}）`}
                      onClick={() => drop(c)}
                      onMouseEnter={() => setHover(c)}
                      onMouseLeave={() => setHover((h) => (h === c ? null : h))}
                      onFocus={() => setCursor(c)}
                    >
                      {Array.from({ length: ROWS }, (_, r) => {
                        const v = cells[r * COLS + c];
                        const i = r * COLS + c;
                        const isLast = c === lastCol && r === lastRow;
                        return (
                          <span key={r} className={`y4-cell${winSet.has(i) ? ' y4-win' : ''}`}>
                            {v !== 0 && (
                              <span
                                // 指すたびに作り直して、落ちる動きを毎回出す
                                key={isLast ? `d${history.length}` : 'd'}
                                className={`y4-disc ${discClass(v)}${isLast ? ' y4-drop y4-last' : ''}`}
                                style={isLast ? ({ '--y4-fall': r + 1 } as React.CSSProperties) : undefined}
                              />
                            )}
                          </span>
                        );
                      })}
                    </button>
                  </div>
                );
              })}
            </div>
            {line && (
              <svg className="y4-line" viewBox={`0 0 ${COLS} ${ROWS}`} preserveAspectRatio="none" aria-hidden="true">
                <line
                  x1={(line.line[0] % COLS) + 0.5}
                  y1={Math.floor(line.line[0] / COLS) + 0.5}
                  x2={(line.line[3] % COLS) + 0.5}
                  y2={Math.floor(line.line[3] / COLS) + 0.5}
                />
              </svg>
            )}
          </div>
        </div>
      </StartGate>

      <div className="btn-row y4-actions">
        <button type="button" className="btn" onClick={undo} disabled={!canUndo}>
          ↩ 1手もどす
        </button>
        <button type="button" className="btn" onClick={resign} disabled={over || history.length === 0}>
          投了
        </button>
        <button type="button" className="btn btn-primary" onClick={next}>
          もう1局
        </button>
      </div>

      <details className="game-tips">
        <summary>この画面の見かた</summary>
        <p>
          列のどこを押しても、その列のいちばん下の空きにコマが落ちます。パソコンではマウスを乗せた列の上にコマの影が出て、
          キーボードの←→で列を選び、EnterかSpaceで落とせます。
          {mode === 'cpu'
            ? '「1手もどす」は自分の直前の手まで（あいだのCPUの手も一緒に）戻します。先手・後手は「もう1局」のたびに入れ替わります。'
            : '「1手もどす」は1手ぶん戻します。'}
        </p>
      </details>
    </div>
  );
}
