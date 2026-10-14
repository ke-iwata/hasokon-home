'use client';

/**
 * はさみ将棋の画面。
 *
 * 仕様: docs/features/game-hasami-shogi.md
 *
 * 動き・取り・勝敗・CPU の読みは、すべて `lib/hasami-shogi.ts`（純関数）が持つ。
 * ここは**入力と描画だけ**を持つ。盤と駒の SVG は詰将棋と共通の `app/_shogi/ShogiBoard.tsx`。
 *
 * 操作は「駒を押す → 動ける先に点 → 先を押す」の 2 段（詰将棋と同じ。盤のマスは 44px を割るので
 * 2 段の操作で誤タップを防ぐ）。**あなたの駒はいつも盤の下側**に出す（後手を選んだら盤を 180 度回して描く）。
 *
 * 取られた瞬間の光り（0.3 秒）は演出なので `lib/` の状態には入れず、ここで持つ（画面の約束 9）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyMove,
  capturesFor,
  CELLS,
  chooseMove,
  DEFAULT_RULES,
  destinations,
  GOTE,
  initialState,
  LEVELS,
  MOVE_LIMIT,
  opponent,
  resign,
  SENTE,
  undoIndex,
  WIN_RULES,
  type HasamiState,
  type Level,
  type Player,
  type Rules,
  type WinRule,
} from '@/lib/hasami-shogi';
import { trackToolUse } from '@/lib/analytics';
import { RecordStrip, useRecords } from '@/app/_records/Records';
import { winRate } from '@/lib/records';
import { CpuSpeedSeg, delayFor, readCpuSpeed, writeCpuSpeed, type CpuSpeed } from '@/app/_cpu/CpuSpeed';
import { StartGate } from '@/app/_cpu/StartGate';
import { ShogiBoard, type ShogiPiece } from '@/app/_shogi/ShogiBoard';

const SLUG = 'hasami-shogi';

/**
 * 設定は覚えておく（毎回選び直させない）。遊んだ記録ではないので `lib/records.ts` には入れない
 * （リバーシ・五目並べと同じ）。読めなくても既定で遊べる
 */
const LEVEL_KEY = `${SLUG}:level`;
const COLOR_KEY = `${SLUG}:color`;
const CORNER_KEY = `${SLUG}:corner`;
const WIN_KEY = `${SLUG}:win`;

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

function readLevel(): Level {
  const saved = readSetting(LEVEL_KEY);
  return saved === 'easy' || saved === 'normal' || saved === 'hard' ? saved : 'normal';
}

function readRules(): Rules {
  const win = readSetting(WIN_KEY);
  return {
    corner: readSetting(CORNER_KEY) !== 'off',
    win: win === 'all' || win === 'diff3' || win === 'five' ? win : DEFAULT_RULES.win,
  };
}

/** CPU が考えているように見せる最短の間（ms、「ふつう」のとき）。倍率は app/_cpu/CpuSpeed.tsx */
const THINK_DELAY = 420;
/** 取られた駒を光らせる長さ（ms） */
const FLASH_MS = 300;

const PIECE: Record<Player, { char: string; className?: string; name: string }> = {
  [SENTE]: { char: '歩', name: '歩' },
  // 後手の「と」は成駒と同じ赤字。向きに加えて色でも区別する
  [GOTE]: { char: 'と', className: 'promoted', name: 'と' },
};

const COLOR_LABEL: Record<Player, string> = { [SENTE]: '先手（歩）', [GOTE]: '後手（と）' };

const WIN_NOTE: Record<WinRule, string> = {
  five: '先に5枚取ったほうの勝ち',
  all: '相手の駒を全部取ったほうの勝ち',
  diff3: '取った枚数で3枚差をつけたほうの勝ち',
};

interface Flash {
  /** 光らせるマス（盤の添字）。取られた駒とはさんだ駒 */
  captured: number[];
  partners: number[];
  /** 取られた側 */
  victim: Player;
}

export default function Game() {
  const [level, setLevel] = useState<Level>('normal');
  const [human, setHuman] = useState<Player>(SENTE);
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [history, setHistory] = useState<HasamiState[]>([initialState()]);
  const [selected, setSelected] = useState<number | null>(null);
  const [cursor, setCursor] = useState(76);
  const [thinking, setThinking] = useState(false);
  const [ready, setReady] = useState(false);
  /** スタート待ち。後手を選んだとき、開いた瞬間に CPU が指し始めないように */
  const [begun, setBegun] = useState(false);
  const [speed, setSpeed] = useState<CpuSpeed>('normal');
  const [flash, setFlash] = useState<Flash | null>(null);
  const records = useRecords(SLUG);
  const entry = records.entry(level);
  /** 1 局につき 1 回だけ数える。「待った」で終局をやり直しても二重に数えない */
  const recorded = useRef(false);
  const tracked = useRef(false);

  const current = history[history.length - 1];
  const humanTurn = !current.finished && current.turn === human;
  /** あなたの駒をいつも下に出す。後手のときは盤を 180 度回す */
  const flip = human === GOTE;
  const toView = useCallback((i: number) => (flip ? CELLS - 1 - i : i), [flip]);

  const start = useCallback((nextLevel: Level, nextHuman: Player, nextRules: Rules) => {
    recorded.current = false;
    tracked.current = false;
    setHistory([initialState(nextRules)]);
    setSelected(null);
    setThinking(false);
    setBegun(false);
    setFlash(null);
    trackToolUse(SLUG, `new-${nextLevel}-${nextHuman === SENTE ? 'sente' : 'gote'}`);
  }, []);

  useEffect(() => {
    const savedRules = readRules();
    setLevel(readLevel());
    setHuman(readSetting(COLOR_KEY) === 'gote' ? GOTE : SENTE);
    setRules(savedRules);
    setHistory([initialState(savedRules)]);
    setSpeed(readCpuSpeed(SLUG));
    setReady(true);
  }, []);

  // CPU の手番。読みは同期処理（最長 1 秒で打ち切る）なので、いったん描画させてから動かす
  useEffect(() => {
    if (!ready || !begun || current.finished || current.turn === human) return;
    setThinking(true);
    const timer = window.setTimeout(() => {
      const move = chooseMove(current, level);
      setThinking(false);
      if (move) setHistory((h) => [...h, applyMove(h[h.length - 1], move)]);
    }, delayFor(THINK_DELAY, speed));
    return () => {
      window.clearTimeout(timer);
      setThinking(false);
    };
  }, [ready, begun, current, human, level, speed]);

  // 取られた瞬間に、はさんだ駒と取られた駒を光らせる。
  // 新しい手が指されたときだけ（「待った」で戻った先・投了では光らせない）
  const seenLast = useRef<HasamiState['last']>(null);
  const seenLength = useRef(1);
  useEffect(() => {
    const last = current.last;
    const fresh = history.length > seenLength.current && last !== seenLast.current;
    seenLength.current = history.length;
    seenLast.current = last;
    if (!fresh || !last || last.captured.length === 0) {
      setFlash(null);
      return;
    }
    setFlash({ captured: last.captured, partners: last.partners, victim: current.turn });
    const timer = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [current, history.length]);

  // 終局を記録する
  useEffect(() => {
    if (!current.finished) return;
    const won = current.winner;
    const outcome = won === 0 ? 'draw' : won === human ? 'win' : 'loss';
    if (!tracked.current) {
      tracked.current = true;
      trackToolUse(SLUG, `${outcome === 'loss' ? 'lose' : outcome}-${level}`);
    }
    if (recorded.current) return;
    recorded.current = true;
    records.finish({ outcome }, level);
  }, [current, human, level, records]);

  const targets = useMemo(
    () => (selected !== null && humanTurn ? destinations(current.board, selected) : []),
    [selected, humanTurn, current],
  );
  /** かんたんだけ：はさめるマスに印 */
  const captureHints = useMemo(() => {
    if (level !== 'easy' || selected === null) return new Set<number>();
    return new Set(
      targets.filter((to) => capturesFor(current.board, { from: selected, to }, current.rules).captured.length > 0),
    );
  }, [level, selected, targets, current]);

  const onCell = (view: number) => {
    const i = toView(view);
    setCursor(view);
    if (!humanTurn) return;
    if (selected !== null && targets.includes(i)) {
      // 先手で自分から指したときは、それをスタートの合図とみなす
      setBegun(true);
      setSelected(null);
      setHistory((h) => [...h, applyMove(h[h.length - 1], { from: selected, to: i })]);
      return;
    }
    if (current.board[i] === human) {
      setSelected(selected === i ? null : i);
      return;
    }
    setSelected(null);
  };

  const undoTarget = undoIndex(history, human);
  const undo = () => {
    if (undoTarget === null) return;
    tracked.current = false;
    setSelected(null);
    setFlash(null);
    setHistory((h) => h.slice(0, undoTarget + 1));
  };

  const giveUp = () => {
    if (current.finished || !begun) return;
    setSelected(null);
    setHistory((h) => [...h, resign(h[h.length - 1], human)]);
  };

  const changeLevel = (next: Level) => {
    setLevel(next);
    writeSetting(LEVEL_KEY, next);
    start(next, human, rules);
  };

  const changeColor = (next: Player) => {
    setHuman(next);
    writeSetting(COLOR_KEY, next === SENTE ? 'sente' : 'gote');
    start(level, next, rules);
  };

  const changeRules = (next: Rules) => {
    setRules(next);
    writeSetting(CORNER_KEY, next.corner ? 'on' : 'off');
    writeSetting(WIN_KEY, next.win);
    start(level, human, next);
  };

  const cpu = opponent(human);
  const mine = human === SENTE ? current.captured.sente : current.captured.gote;
  const theirs = human === SENTE ? current.captured.gote : current.captured.sente;

  const cells: (ShogiPiece | null)[] = Array.from({ length: CELLS }, (_, view) => {
    const v = current.board[toView(view)];
    if (v === 0) return null;
    const p = PIECE[v as Player];
    return { char: p.char, flip: v !== human, className: p.className };
  });

  const flashSet = new Set(flash ? [...flash.captured, ...flash.partners] : []);
  const last = current.last;
  const cellClass = (view: number) => {
    const i = toView(view);
    return [
      selected === i ? 'selected' : '',
      targets.includes(i) ? 'target' : '',
      captureHints.has(i) ? 'hs-hint' : '',
      last && (last.from === i || last.to === i) ? 'moved' : '',
      flashSet.has(i) ? 'hs-flash' : '',
    ]
      .filter(Boolean)
      .join(' ');
  };
  const dots = new Set(targets.map(toView));

  const result = current.finished
    ? current.reason === 'resign'
      ? current.winner === human
        ? '🎉 CPUが投了しました。あなたの勝ちです'
        : '投了しました。あなたの負けです'
      : current.winner === 0
        ? current.reason === 'repetition'
          ? `同じ局面が4回出たので引き分けです（${mine} 対 ${theirs}）`
          : `引き分けです（${mine} 対 ${theirs}）`
        : current.winner === human
          ? `🎉 あなたの勝ちです（${mine} 対 ${theirs}）`
          : `あなたの負けです（${mine} 対 ${theirs}）`
    : last && last.captured.length > 0
      ? current.turn === human
        ? `CPUに${last.captured.length}枚取られました`
        : `${last.captured.length}枚取りました`
      : '';

  return (
    // 盤の大きさを決める変数（--chrome / --board-max）は入れ物に置く
    <div className="card hs-game">
      <div className="btn-row">
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
        <CpuSpeedSeg
          value={speed}
          onChange={(next) => {
            setSpeed(next);
            writeCpuSpeed(SLUG, next);
          }}
        />
        <div className="seg" role="group" aria-label="先手・後手">
          {([SENTE, GOTE] as Player[]).map((c) => (
            <button
              key={c}
              type="button"
              className={c === human ? 'active' : ''}
              aria-pressed={c === human}
              onClick={() => changeColor(c)}
            >
              {COLOR_LABEL[c]}
            </button>
          ))}
        </div>
      </div>

      {/* 隅取り・勝ちの枚数は毎局は変えないルールなので畳む（画面の約束 5。大富豪の .df-rules と同じ） */}
      <details className="df-rules hs-rules">
        <summary>
          ルール：隅取り{rules.corner ? 'あり' : 'なし'}・{WIN_RULES[rules.win].label}
          {rules.win === 'diff3' ? 'つけたら' : '取ったら'}勝ち
        </summary>
        <div className="btn-row">
          <div className="seg" role="group" aria-label="隅取り">
            {[true, false].map((on) => (
              <button
                key={String(on)}
                type="button"
                className={on === rules.corner ? 'active' : ''}
                aria-pressed={on === rules.corner}
                onClick={() => changeRules({ ...rules, corner: on })}
              >
                隅取り{on ? 'あり' : 'なし'}
              </button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="勝ちの枚数">
            {(Object.keys(WIN_RULES) as WinRule[]).map((w) => (
              <button
                key={w}
                type="button"
                className={w === rules.win ? 'active' : ''}
                aria-pressed={w === rules.win}
                onClick={() => changeRules({ ...rules, win: w })}
              >
                {WIN_RULES[w].label}
              </button>
            ))}
          </div>
        </div>
      </details>

      <div className="status-bar">
        <span>
          {current.finished
            ? '対局終了'
            : !begun
              ? 'スタート待ち'
              : thinking
                ? 'CPUが考えています…'
                : humanTurn
                  ? 'あなたの番です'
                  : 'CPUの番です'}
        </span>
        <span>
          {current.ply}／{MOVE_LIMIT}手
        </span>
      </div>

      {/* 1局も終えていなくても出す（初戦の後に帯が現れて盤が下がらないように。リバーシと同じ） */}
      <RecordStrip
        items={[
          {
            label: `${LEVELS[level].label}との戦績`,
            value: `${entry.wins ?? 0}勝 ${entry.losses ?? 0}敗 ${entry.draws ?? 0}分`,
          },
          { label: '勝率', value: winRate(entry) === null ? '—' : `${winRate(entry)}%` },
        ]}
      />

      {/* 取った駒は盤の上下に並べる。空でも枠は置く（盤が動かない） */}
      <p className="hs-captures" aria-label={`CPUが取った駒 ${theirs}枚`}>
        <span className="hs-captures-label">CPU</span>
        <span className="hs-captures-pieces">{PIECE[human].char.repeat(theirs)}</span>
        <span className="hs-captures-count">{theirs}枚</span>
      </p>

      <StartGate show={ready && !begun && !current.finished} onStart={() => setBegun(true)}>
        <ShogiBoard
          coords={false}
          className={current.finished ? 'done' : undefined}
          ariaLabel={`はさみ将棋の盤面。あなたは${COLOR_LABEL[human]}で下側。矢印キーでマスを移動、Enterで選択`}
          cells={cells}
          cellClass={cellClass}
          dots={dots}
          cursor={cursor}
          onCursor={setCursor}
          onCell={onCell}
          onEscape={() => setSelected(null)}
        >
          {/* 取られた駒の残像。0.3 秒だけ出す（動きを減らす設定では CSS で出さない） */}
          {flash
            ? flash.captured.map((i) => {
                const view = toView(i);
                const x = (view % 9) + 0.5;
                const y = Math.floor(view / 9) + 0.5;
                const p = PIECE[flash.victim];
                return (
                  <text
                    key={`ghost${i}`}
                    className={`ts-piece hs-ghost${p.className ? ` ${p.className}` : ''}`}
                    x={x}
                    y={y}
                    transform={flash.victim !== human ? `rotate(180 ${x} ${y})` : undefined}
                  >
                    {p.char}
                  </text>
                );
              })
            : null}
        </ShogiBoard>
      </StartGate>

      <p className="hs-captures" aria-label={`あなたが取った駒 ${mine}枚`}>
        <span className="hs-captures-label">あなた</span>
        <span className="hs-captures-pieces">{PIECE[cpu].char.repeat(mine)}</span>
        <span className="hs-captures-count">{mine}枚</span>
      </p>

      {/* 終局と取りの知らせ。条件付きで出し入れせず常に置く（.result-row が高さを確保する） */}
      <p
        className="result-row"
        style={{
          color: current.finished ? (current.winner === human ? 'var(--ok)' : 'var(--text)') : 'var(--muted)',
          fontWeight: current.finished ? 700 : 400,
        }}
        aria-live="polite"
      >
        {result}
      </p>

      <div className="btn-row" style={{ justifyContent: 'center' }}>
        <button type="button" className="btn" onClick={undo} disabled={undoTarget === null}>
          ↩ 待った
        </button>
        <button type="button" className="btn" onClick={giveUp} disabled={current.finished || !begun}>
          投了
        </button>
        <button type="button" className="btn" onClick={() => start(level, human, rules)}>
          最初から
        </button>
      </div>

      <details className="game-tips">
        <summary>この画面の見かた</summary>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>
          あなたは{COLOR_LABEL[human]}で、駒はいつも盤の下側です。CPUは「{LEVELS[level].label}」。
          駒を押すと動ける先に点が出ます。{WIN_NOTE[rules.win]}
          {rules.corner ? '（隅取りあり）' : '（隅取りなし）'}。
          {level === 'easy' ? '「かんたん」では、相手の駒をはさめるマスに枠が付きます。' : ''}
          「待った」は自分が指す直前まで戻します（あいだのCPUの手も一緒に戻ります）。
        </p>
      </details>
    </div>
  );
}
