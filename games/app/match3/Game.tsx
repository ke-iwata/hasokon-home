'use client';

/**
 * マッチ3パズルの画面。
 *
 * 仕様: docs/features/game-match3.md
 *
 * 盤の生成・入れ替えの判定・消滅／落下／補充／連鎖・シャッフル・手数は、
 * すべて `lib/match3.ts`（純関数）が持つ。ここは**入力（タップ・スワイプ）と描画だけ**。
 *
 * - `playMove` は1手ぶんの段（`steps`）をまとめて返す。ここではそれを
 *   **1段ずつ間を置いて描く**（途中の状態を見せたいなら局面を分ける）
 * - 消える光り方（どのマスが消えるか・何点入ったか）は ref の `Fx` に置き、
 *   `lib/` の状態には入れない（ピンボールの `Fx` と同じ）
 * - 乱数は ref に1本だけ持つ。「今日の1盤面」は日付シードの `mulberry32` で、
 *   初期盤面・補充・シャッフルがすべてこの1本から出る（同じ手順なら同じ盤面）
 */

import { useCallback, useEffect, useReducer, useRef, useState, type PointerEvent } from 'react';
import {
  colOf,
  dailyRng,
  isAdjacent,
  isOver,
  newGame,
  playMove,
  rowOf,
  shareText,
  SIZE,
  variantOf,
  type Board,
  type GameState,
  type Mode,
  type Rng,
} from '@/lib/match3';
import { currentStreak, localDateKey, mulberry32, nextStreak } from '@/lib/daily';
import { SITE_URL } from '@/lib/registry';
import { trackToolUse } from '@/lib/analytics';
import { delayFor } from '@/app/_cpu/CpuSpeed';
import { BestBadge, useRecords } from '@/app/_records/Records';
import { bestScoreOf, type Improved } from '@/lib/records';

/**
 * 6種の色。**形と1対1**（色だけに頼らない）。
 * ブロックパズル・カラーソートの `COLORS` と同じく、ここに定数で持つ（`globals.css` にトークンは足さない）。
 * ライトの地（--surface-2）とダークの地のどちらからも浮く、中くらいの明るさにそろえてある。
 * 輪郭は本文色の細線で引くので、黄色も白地に沈まない
 */
const COLORS = ['#e5484d', '#2f7ae5', '#1f9d55', '#d4a106', '#9b5de5', '#ef7d22'] as const;
const SHAPE_NAMES = ['円', '四角', '三角', 'ひし形', '星', '六角形'] as const;

/** 入れ替えの往復・段ごとの間（「ふつう」の値。`delayFor` で倍率に乗せる） */
const SWAP_MS = 200;
const CLEAR_MS = 260;
const SHUFFLE_MS = 700;

const MODE_LABEL: Record<Mode, string> = { daily: '今日の1盤面', endless: 'エンドレス' };

/** 消える演出。**ゲームの状態に入れない**（`Game.tsx` の ref にだけ置く） */
interface Fx {
  /** いま光らせて消すマス */
  clearing: Set<number>;
  /** いま動かしている2マスと、その向き（往復の動き） */
  offsets: Map<number, [number, number]>;
  /** 並ばなかったので元の位置へ戻している2マス（戻る動きにも transition を付ける） */
  returning: Set<number>;
  /** 直前の段の得点と連鎖（盤の上に浮かべる） */
  popup: string;
}

interface Result {
  score: number;
  cleared: number;
  maxChain: number;
  improved: Improved;
  best?: number;
  streak?: number;
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** 6種の図形。`viewBox` 0〜1 の中に描き、`<use>` で並べる */
function Symbols() {
  return (
    <defs>
      <symbol id="m3-k0" viewBox="0 0 1 1">
        <circle cx="0.5" cy="0.5" r="0.36" />
      </symbol>
      <symbol id="m3-k1" viewBox="0 0 1 1">
        <rect x="0.17" y="0.17" width="0.66" height="0.66" rx="0.06" />
      </symbol>
      <symbol id="m3-k2" viewBox="0 0 1 1">
        <polygon points="0.5,0.13 0.88,0.82 0.12,0.82" />
      </symbol>
      <symbol id="m3-k3" viewBox="0 0 1 1">
        <polygon points="0.5,0.1 0.87,0.5 0.5,0.9 0.13,0.5" />
      </symbol>
      <symbol id="m3-k4" viewBox="0 0 1 1">
        <polygon points="0.5,0.1 0.6,0.37 0.89,0.38 0.66,0.56 0.74,0.85 0.5,0.68 0.26,0.85 0.34,0.56 0.11,0.38 0.4,0.37" />
      </symbol>
      <symbol id="m3-k5" viewBox="0 0 1 1">
        <polygon points="0.5,0.12 0.83,0.31 0.83,0.69 0.5,0.88 0.17,0.69 0.17,0.31" />
      </symbol>
    </defs>
  );
}

export default function Game() {
  const [mode, setMode] = useState<Mode>('daily');
  const [state, setState] = useState<GameState | null>(null);
  /** 描いている盤。段ごとの途中の盤もここに入る（`state.board` は1手ぶん進んだあとの盤） */
  const [shown, setShown] = useState<Board | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  /**
   * 「今日」は**端末のローカル日付**。マウント後に決める
   * （静的書き出しのHTMLに焼き付けると、日付が変わっても古いままになる）
   */
  const [today, setToday] = useState('');

  const records = useRecords('match3');
  const variant = variantOf(mode);
  const entry = records.entry(variant);
  const rngRef = useRef<Rng>(Math.random);
  const counted = useRef(false);
  const fxRef = useRef<Fx>({ clearing: new Set(), offsets: new Map(), returning: new Set(), popup: '' });
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const boardRef = useRef<SVGSVGElement>(null);
  /** なぞり始めたマスと座標（スワイプの判定） */
  const dragFrom = useRef<{ cell: number; x: number; y: number } | null>(null);
  /** 盤を作り直したら古い演出の続きを捨てる（非同期の段の描画が新しい盤に混ざらないように） */
  const generation = useRef(0);

  const start = useCallback((next: Mode, dateKey: string) => {
    generation.current++;
    const rng = next === 'daily' ? dailyRng(dateKey) : mulberry32((Math.random() * 2 ** 32) | 0);
    rngRef.current = rng;
    const g = newGame(next, rng);
    fxRef.current = { clearing: new Set(), offsets: new Map(), returning: new Set(), popup: '' };
    setState(g);
    setShown(g.board);
    setSelected(null);
    setNote('');
    setResult(null);
    setCopied(false);
    setBusy(false);
    counted.current = false;
    dragFrom.current = null;
    trackToolUse('match3', `new-${next}`);
  }, []);

  // 生成はマウント後に行う（静的書き出し時にサーバーとクライアントで盤面が食い違うため）
  useEffect(() => {
    const key = localDateKey();
    setToday(key);
    start('daily', key);
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 1局を終える（今日の1盤面は30手を使い切ったとき、エンドレスは「ここで終える」） */
  const finish = useCallback(
    (g: GameState) => {
      trackToolUse('match3', 'gameover');
      const daily = g.mode === 'daily';
      const v = variantOf(g.mode);
      const before = records.entry(v);
      // 連続日数は「今日の1盤面を30手遊び切った」で数える
      const streak = daily ? nextStreak(before.lastClearedOn, today, before.streak) : undefined;
      const { improved, records: after } = records.finish(
        {
          score: g.score,
          clearedOn: daily ? today : undefined,
          scoredOn: daily ? today : undefined,
        },
        v,
      );
      const saved = after[v] ?? {};
      setResult({
        score: g.score,
        cleared: g.cleared,
        maxChain: g.maxChain,
        improved,
        best: daily ? bestScoreOf(saved, today) : saved.bestScore,
        streak,
      });
    },
    [records, today],
  );

  /** 入れ替えを試す。並ばなければ往復して元に戻る（手数は減らない） */
  const attempt = useCallback(
    async (a: number, b: number) => {
      if (!state || busy || isOver(state) || result || !isAdjacent(a, b)) return;
      const gen = generation.current;
      const alive = () => generation.current === gen;
      setSelected(null);
      setBusy(true);
      const fx = fxRef.current;
      const dr = rowOf(b) - rowOf(a);
      const dc = colOf(b) - colOf(a);
      fx.offsets = new Map([
        [a, [dr, dc]],
        [b, [-dr, -dc]],
      ]);
      fx.popup = '';
      redraw();
      await wait(delayFor(SWAP_MS, 'normal'));
      if (!alive()) return;

      const r = playMove(state, a, b, rngRef.current);
      if (!r.valid) {
        // 往復：元の位置へ戻す（transition で戻る動きを見せる）
        fx.offsets = new Map();
        fx.returning = new Set([a, b]);
        setNote('そろわない入れ替えは元に戻ります（手数は減りません）');
        redraw();
        await wait(delayFor(SWAP_MS, 'normal'));
        if (!alive()) return;
        fx.returning = new Set();
        setBusy(false);
        return;
      }
      if (!counted.current) {
        counted.current = true;
        records.start(variant);
      }
      setNote('');
      // 入れ替えた盤を「動かし終えた位置」で描き直す（動きの残りは付けない）
      fx.offsets = new Map();
      setShown(r.swapped);
      for (const step of r.steps) {
        fx.clearing = new Set(step.cleared);
        fx.popup = step.chain >= 2 ? `+${step.points}（${step.chain}連鎖）` : `+${step.points}`;
        redraw();
        await wait(delayFor(CLEAR_MS, 'normal'));
        if (!alive()) return;
        fx.clearing = new Set();
        setShown(step.board);
        await wait(delayFor(CLEAR_MS / 2, 'normal'));
        if (!alive()) return;
      }
      if (r.shuffled) {
        setNote('入れ替えられる手が無いので、並べ替えます');
        await wait(delayFor(SHUFFLE_MS, 'normal'));
        if (!alive()) return;
        setShown(r.shuffled);
        setNote('');
      }
      fx.popup = '';
      setState(r.state);
      setBusy(false);
      if (isOver(r.state)) finish(r.state);
    },
    [state, busy, result, records, variant, finish],
  );

  /** 画面の座標 → マスの添字（盤の外なら null） */
  const cellAt = useCallback((x: number, y: number): number | null => {
    const svg = boardRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const c = Math.floor(((x - rect.left) / rect.width) * SIZE);
    const r = Math.floor(((y - rect.top) / rect.height) * SIZE);
    if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return null;
    return r * SIZE + c;
  }, []);

  const onPointerDown = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      if (busy || !state || isOver(state) || result) return;
      const cell = cellAt(e.clientX, e.clientY);
      if (cell === null) return;
      e.preventDefault();
      // タップ→タップ：選んであるマスの隣を押したら入れ替える
      if (selected !== null && isAdjacent(selected, cell)) {
        dragFrom.current = null;
        void attempt(selected, cell);
        return;
      }
      setSelected(cell === selected ? null : cell);
      dragFrom.current = { cell, x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    [busy, state, result, selected, cellAt, attempt],
  );

  /** スワイプ：触れたマスから、半マス以上なぞった向きの隣と入れ替える */
  const onPointerMove = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      const from = dragFrom.current;
      const svg = boardRef.current;
      if (!from || !svg) return;
      const cellPx = svg.getBoundingClientRect().width / SIZE;
      const dx = e.clientX - from.x;
      const dy = e.clientY - from.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < cellPx / 2) return;
      const r = rowOf(from.cell) + (Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) : 0);
      const c = colOf(from.cell) + (Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0);
      dragFrom.current = null;
      if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return;
      void attempt(from.cell, r * SIZE + c);
    },
    [attempt],
  );

  const endDrag = useCallback(() => {
    dragFrom.current = null;
  }, []);

  const copyResult = useCallback(() => {
    if (!result || !state) return;
    const text = shareText({
      mode: state.mode,
      score: result.score,
      maxChain: result.maxChain,
      dateKey: state.mode === 'daily' ? today : undefined,
      url: `${SITE_URL}/match3/`,
    });
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        trackToolUse('match3', 'copy-result');
      },
      () => setCopied(false),
    );
  }, [result, state, today]);

  const fx = fxRef.current;
  const board = shown;
  const todayBest = mode === 'daily' ? bestScoreOf(entry, today) : entry.bestScore;
  const streakNow = currentStreak(entry.lastClearedOn, today, entry.streak);
  const over = state !== null && isOver(state);

  return (
    // 盤の大きさを決める変数（--chrome / --board-max）はこの入れ物に置く（app/globals.css の .m3-game）
    <div className="card m3-game">
      <div className="btn-row">
        <div className="seg" role="group" aria-label="モード">
          {(['daily', 'endless'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={m === mode ? 'active' : ''}
              aria-pressed={m === mode}
              onClick={() => {
                setMode(m);
                start(m, today);
              }}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <button type="button" className="btn" onClick={() => start(mode, today)}>
          {/* 今日の1盤面は全員同じ盤なので、作り直しても同じ盤が出る（やり直しになる） */}
          {/* エンドレスも同じ4文字にそろえる（「新しい盤面」だと 320px 幅で折り返して盤が動く） */}
          {mode === 'daily' ? 'やり直す' : '作り直す'}
        </button>
      </div>

      {/* 「残り手数 / スコア / ベスト」は height で1行ぶん確保する（伸び縮みさせない）。
          **連続日数はここに入れない。** 4〜5桁のスコアと並べると 390px 幅でも右端が切れる
          （#295 のレビュー。実測で中身 350px ＞ 表示 336px）。連続日数は盤の下の案内の1行に出す */}
      <p className="m3-stats" aria-live="polite">
        <span>
          残り<strong>{state?.movesLeft === null ? '∞' : (state?.movesLeft ?? '')}</strong>手
        </span>
        {/* 「スコア」の3文字は付けず「点」で示す（5桁でも 320px 幅の1行に収めるため） */}
        <span>
          <strong>{(state?.score ?? 0).toLocaleString('ja-JP')}</strong>点
        </span>
        <span>
          {mode === 'daily' ? '今日のベスト' : 'ベスト'} <strong>{(todayBest ?? 0).toLocaleString('ja-JP')}</strong>
        </span>
      </p>

      {board === null ? (
        <div className="m3-loading">盤面を作っています…</div>
      ) : (
        <div className="m3-wrap">
          <svg
            ref={boardRef}
            className={`m3-board${over ? ' done' : ''}`}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            role="img"
            aria-label={`マッチ3パズルの盤面（${SIZE}×${SIZE}）。隣どうしをタップかスワイプで入れ替えます`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            /* iOS の文脈メニュー・テキスト選択と当たるので、盤の上では既定の動作を止める */
            onContextMenu={(e) => e.preventDefault()}
          >
            <Symbols />
            {board.map((kind, i) => {
              const off = fx.offsets.get(i);
              const r = rowOf(i);
              const c = colOf(i);
              return (
                <g
                  key={i}
                  className={['m3-piece', fx.clearing.has(i) ? 'clearing' : '', off || fx.returning.has(i) ? 'moving' : '']
                    .filter(Boolean)
                    .join(' ')}
                  style={{ transform: `translate(${c + (off?.[1] ?? 0)}px, ${r + (off?.[0] ?? 0)}px)` }}
                >
                  <use href={`#m3-k${kind}`} width="1" height="1" fill={COLORS[kind]} className="m3-shape" />
                </g>
              );
            })}
            {selected !== null ? (
              <rect
                className="m3-selected"
                x={colOf(selected) + 0.05}
                y={rowOf(selected) + 0.05}
                width="0.9"
                height="0.9"
                rx="0.12"
              />
            ) : null}
          </svg>
          {fx.popup ? (
            <div className="m3-popup" aria-hidden="true">
              {fx.popup}
            </div>
          ) : null}
        </div>
      )}

      {/* 案内の1行。**空でも枠は置く**（高さを確保して下を動かさない） */}
      <p className="m3-note">
        {note || (mode === 'daily' && streakNow > 0 && !result ? `連続${streakNow}日（今日の1盤面を遊び切った日数）` : '')}
      </p>

      {/* エンドレスの「ここで終える」は盤の下に置く。上の段に足すと 390px 幅で折り返し、
          モードを切り替えるたびに盤が 40px 上下する（実測） */}
      {mode === 'endless' && !result ? (
        <p className="m3-share">
          <button
            type="button"
            className="btn"
            disabled={!state || state.score === 0 || busy}
            onClick={() => state && finish(state)}
          >
            ここで終える
          </button>
        </p>
      ) : null}

      {result && (
        <div className="m3-result">
          <p className="m3-result-score">
            {state?.mode === 'daily' ? `${today}　` : ''}
            {result.score.toLocaleString('ja-JP')} 点
            <BestBadge improved={result.improved} />
          </p>
          <p className="m3-result-detail">
            消した数 {result.cleared}・最大連鎖 {result.maxChain}
            {result.best !== undefined ? `・${state?.mode === 'daily' ? '今日のベスト' : 'ベスト'} ${result.best.toLocaleString('ja-JP')}` : ''}
            {result.streak ? `・連続${result.streak}日` : ''}
          </p>
          <p className="m3-share">
            <button type="button" className="btn" onClick={copyResult}>
              {copied ? 'コピーしました' : '結果をコピー'}
            </button>
            <button type="button" className="btn" onClick={() => start(mode, today)}>
              {mode === 'daily' ? 'もう一度' : '新しい盤面'}
            </button>
          </p>
        </div>
      )}

      <details className="game-tips">
        <summary>この画面の見かた</summary>
        <p>
          隣どうし（上下左右）の2つを、<strong>タップ→タップ</strong>か<strong>スワイプ</strong>で入れ替えます。
          縦か横に同じ形が3つ以上並ぶと消え、上から落ちてきたピースでまた並ぶと<strong>連鎖</strong>になります。
          並ばない入れ替えは元に戻り、<strong>手数は減りません</strong>。
          形は{SHAPE_NAMES.join('・')}の6種で、色と形が1対1に対応しています。
          {mode === 'daily'
            ? '「今日の1盤面」は日付から作る全員共通の盤で、30手のスコアを競います。今日のベストと連続日数はこの端末のブラウザに保存しています。'
            : ''}
        </p>
      </details>
    </div>
  );
}
