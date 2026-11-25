'use client';

/**
 * 迷路の画面。
 *
 * 仕様: docs/features/game-meiro.md
 *
 * 生成・答え・壁の判定・なぞった道の伸び縮みはすべて `lib/meiro.ts`（純関数）が持つ。
 * ここは**入力（なぞる・矢印キー・拡大）と描画、印刷**だけ。
 *
 * ## なぞり中のスクロール止め
 *
 * `touch-action: none` は**盤面の SVG（`.mz-board-svg`）だけ**に付ける。ページ全体に付けると
 * 盤の外でもスクロールできなくなる。拡大中は盤が見える範囲より大きくなるが、
 * 1本指はなぞりに使うので、表示位置は**2本指のドラッグ**で動かし（パソコンはスクロール）、
 * なぞっている先端が見える範囲から出たら自動で追いかける。
 *
 * ## 印刷
 *
 * 印刷用の紙（`data-print="mz-sheet"`）は常に描いておき、画面では隠す。
 * `@media print` でそれ以外を消すので、ブラウザのメニューから印刷しても広告やボタンは出ない。
 * 「印刷する」「4面まとめて」は `trackToolUse` で**押した回数**だけを数える（印刷物は送らない）。
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import {
  dailyMaze,
  dirFromKey,
  generateLevel,
  goal,
  initialPath,
  LEVELS,
  levelOf,
  reachedGoal,
  routePathData,
  solve,
  step,
  traceTo,
  variantOf,
  wallPathData,
  type LevelId,
  type Maze,
  type Path,
} from '@/lib/meiro';
import { currentStreak, localDateKey } from '@/lib/daily';
import { trackToolUse } from '@/lib/analytics';
import { BestBadge, RecordStrip, useRecords, useStopwatch } from '@/app/_records/Records';
import { formatTime, type Improved } from '@/lib/records';

type Mode = 'free' | 'daily';

/** 拡大の段（倍率）。大きい段階だけで使う */
const ZOOMS = [1, 1.5, 2, 3] as const;

/** 拡大を使う段階（360px幅で1マスが指で押せる大きさを割るもの） */
const ZOOMABLE: readonly LevelId[] = ['muzukashii', 'onimuzu'];

/** 4面まとめて印刷できる段階（それより大きいと A4 の4分の1ではマスが小さすぎる） */
const FOUR_UP: readonly LevelId[] = ['youji', 'kantan', 'futsu'];

/** 印刷物に入れるページの場所（配られた紙から人が来る入口） */
const PRINT_URL = 'hasokon.com/games/meiro/';

/** 壁の線の太さ（1マス = 1 の単位）。小さい迷路ほど太く */
function wallWidth(size: number): number {
  if (size <= 5) return 0.14;
  if (size <= 12) return 0.11;
  return 0.09;
}

/** 迷路1面の SVG。画面と印刷で同じものを使う */
function MazeSvg({
  maze,
  route,
  answer,
  className,
  label,
  svgRef,
  ...handlers
}: {
  svgRef?: Ref<SVGSVGElement>;
  onPointerDown?: (e: PointerEvent<SVGSVGElement>) => void;
  onPointerMove?: (e: PointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (e: PointerEvent<SVGSVGElement>) => void;
  onPointerCancel?: (e: PointerEvent<SVGSVGElement>) => void;
  maze: Maze;
  /** なぞった道 */
  route?: Path;
  /** 答えの道（薄く出す） */
  answer?: Path;
  className?: string;
  label: string;
}) {
  const sw = wallWidth(maze.w);
  const g = goal(maze);
  const gx = (g % maze.w) + 0.5;
  const gy = Math.floor(g / maze.w) + 0.5;
  const fontSize = Math.min(0.6, 0.45 + 2 / maze.w);
  return (
    <svg
      ref={svgRef}
      className={className}
      {...handlers}
      viewBox={`-0.5 -0.5 ${maze.w + 1} ${maze.h + 1}`}
      role="img"
      aria-label={label}
    >
      {/* スタートとゴールは色だけに頼らず「S」「G」の文字も出す */}
      <rect className="mz-start" x={0.08} y={0.08} width={0.84} height={0.84} rx={0.15} />
      <rect className="mz-goal" x={gx - 0.42} y={gy - 0.42} width={0.84} height={0.84} rx={0.15} />
      {answer && answer.length > 1 && (
        <path className="mz-answer" d={routePathData(maze, answer)} strokeWidth={0.3} />
      )}
      {route && route.length > 1 && (
        <path className="mz-route" d={routePathData(maze, route)} strokeWidth={0.42} />
      )}
      {/* 先端の丸は、なぞり始めてから出す（スタートの「S」を隠さないように） */}
      {route && route.length > 1 && (
        <circle
          className="mz-head"
          cx={(route[route.length - 1] % maze.w) + 0.5}
          cy={Math.floor(route[route.length - 1] / maze.w) + 0.5}
          r={0.3}
        />
      )}
      <text className="mz-label" x={0.5} y={0.5} fontSize={fontSize}>
        S
      </text>
      <text className="mz-label" x={gx} y={gy} fontSize={fontSize}>
        G
      </text>
      <path className="mz-walls" d={wallPathData(maze)} strokeWidth={sw} />
    </svg>
  );
}

export default function Game() {
  const [mode, setMode] = useState<Mode>('free');
  const [level, setLevel] = useState<LevelId>('kantan');
  // 最初の迷路はマウント後に作る（静的書き出しのHTMLとブラウザで乱数が食い違わないように）
  const [maze, setMaze] = useState<Maze | null>(null);
  const [path, setPath] = useState<Path>([0]);
  const [today, setToday] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [peeked, setPeeked] = useState(false);
  const [auto, setAuto] = useState(false);
  const [zoom, setZoom] = useState<number>(1);
  const [result, setResult] = useState<{ timeMs: number; improved: Improved; streak?: number; counted: boolean } | null>(null);
  /** 印刷する面（1面のときは今の迷路だけ。4面のときは今の迷路＋3面） */
  const [printMazes, setPrintMazes] = useState<Maze[]>([]);

  const records = useRecords('meiro');
  const timer = useStopwatch();
  const counted = useRef(false);
  const notified = useRef(false);
  const dragging = useRef(false);
  /** 盤に乗っている指（2本指のドラッグで表示位置を動かすため） */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pathRef = useRef<Path>(path);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const daily = mode === 'daily';
  const variant = variantOf(level, daily);
  const entry = records.entry(variant);
  const cleared = result !== null;
  const info = levelOf(level);
  const zoomable = ZOOMABLE.includes(level);
  const small = level === 'youji';

  const commit = useCallback((next: Path) => {
    pathRef.current = next;
    setPath(next);
  }, []);

  /** 迷路を作り直す */
  const begin = useCallback(
    (nextMode: Mode, nextLevel: LevelId) => {
      const key = localDateKey();
      setToday(key);
      const m = nextMode === 'daily' ? dailyMaze(nextLevel, key) : generateLevel(nextLevel, Math.random);
      setMaze(m);
      commit(initialPath(m));
      setShowAnswer(false);
      setPeeked(false);
      setResult(null);
      setZoom(1);
      timer.reset();
      counted.current = false;
      notified.current = false;
    },
    [commit, timer],
  );

  useEffect(() => {
    begin('free', 'kantan');
    // マウント時に一度だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 印刷が終わったら、4面まとめの追加分を捨てて1面に戻す
  useEffect(() => {
    const reset = () => setPrintMazes([]);
    window.addEventListener('afterprint', reset);
    return () => window.removeEventListener('afterprint', reset);
  }, []);

  // ゴールの判定。時間は止めた瞬間の値で固定する
  useEffect(() => {
    if (!maze || notified.current || !reachedGoal(maze, path) || path.length < 2) return;
    notified.current = true;
    dragging.current = false;
    const timeMs = timer.stop();
    if (peeked) {
      // 答えを見たあとのクリアは記録しない
      setResult({ timeMs, improved: { time: false, score: false, moves: false }, counted: false });
      return;
    }
    trackToolUse('meiro', `clear-${variant}`);
    const { entry: after, improved } = records.finish(
      { outcome: 'win', timeMs, ...(daily && today ? { clearedOn: today } : {}) },
      variant,
    );
    setResult({ timeMs, improved, streak: daily ? after.streak : undefined, counted: true });
  }, [maze, path, peeked, daily, today, variant, records, timer]);

  // 拡大中は、なぞっている先端が見える範囲に入るよう表示位置を追いかける
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !maze || zoom === 1) return;
    const head = path[path.length - 1];
    const cellPx = vp.scrollWidth / (maze.w + 1);
    const x = ((head % maze.w) + 1) * cellPx;
    const y = (Math.floor(head / maze.w) + 1) * cellPx;
    const margin = cellPx * 2;
    let left = vp.scrollLeft;
    let top = vp.scrollTop;
    if (x - margin < left) left = x - margin;
    if (x + margin > left + vp.clientWidth) left = x + margin - vp.clientWidth;
    if (y - margin < top) top = y - margin;
    if (y + margin > top + vp.clientHeight) top = y + margin - vp.clientHeight;
    if (left !== vp.scrollLeft || top !== vp.scrollTop) vp.scrollTo({ left, top });
  }, [path, zoom, maze]);

  /** 道を伸ばす・縮める（1手目でプレイ数とタイマーを始める） */
  const moveTo = useCallback(
    (next: Path) => {
      if (!maze || cleared) return;
      if (next === pathRef.current) return;
      if (!counted.current) {
        counted.current = true;
        records.start(variant);
        trackToolUse('meiro', `start-${variant}`);
      }
      timer.begin();
      commit(next);
    },
    [maze, cleared, variant, records, timer, commit],
  );

  /** 画面の座標 → マス。盤の外なら null */
  const cellAt = useCallback(
    (x: number, y: number): number | null => {
      const svg = svgRef.current;
      if (!svg || !maze) return null;
      const rect = svg.getBoundingClientRect();
      // viewBox は盤の外に半マスずつ余白を取っている
      const unit = rect.width / (maze.w + 1);
      const c = Math.floor((x - rect.left) / unit - 0.5);
      const r = Math.floor((y - rect.top) / unit - 0.5);
      if (r < 0 || c < 0 || r >= maze.h || c >= maze.w) return null;
      return r * maze.w + c;
    },
    [maze],
  );

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // 2本目の指が乗ったら、なぞりをやめて表示位置を動かす（拡大中の移動）
    if (pointers.current.size >= 2) {
      dragging.current = false;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      return;
    }
    if (!maze || cleared) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (cell === null) return;
    // 道の上（先端・途中）を押したときだけなぞり始める。途中を押せばそこまで戻る
    if (!pathRef.current.includes(cell)) return;
    e.preventDefault();
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    moveTo(traceTo(maze, pathRef.current, cell));
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (prev && pointers.current.size >= 2) {
      // 2本指のドラッグ：動いた指の半分ずつ（2本の真ん中の動き）だけ表示をずらす
      const vp = viewportRef.current;
      vp?.scrollBy({ left: -(e.clientX - prev.x) / 2, top: -(e.clientY - prev.y) / 2 });
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      return;
    }
    if (prev) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!dragging.current || !maze) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (cell !== null) moveTo(traceTo(maze, pathRef.current, cell));
  };

  const endDrag = (e: PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    dragging.current = false;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!maze || cleared) return;
    const dir = dirFromKey(e.key);
    if (dir === null) return;
    // 盤の上で矢印キーを押したときにページが動かないようにする
    e.preventDefault();
    moveTo(step(maze, pathRef.current, dir, auto));
  };

  const changeZoom = (delta: number) => {
    const i = ZOOMS.indexOf(zoom as (typeof ZOOMS)[number]);
    const next = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + delta))];
    setZoom(next);
  };

  const print = (fourUp: boolean) => {
    if (!maze) return;
    if (fourUp) {
      // 今の迷路＋同じ段階の新しい3面
      setPrintMazes([maze, ...[0, 1, 2].map(() => generateLevel(level, Math.random))]);
      trackToolUse('meiro', 'print-4up');
    } else {
      setPrintMazes([]);
      trackToolUse('meiro', 'print');
    }
    // 4面ぶんの紙が描かれてから印刷ダイアログを開く
    window.setTimeout(() => window.print(), 50);
  };

  const sheetMazes = printMazes.length > 0 ? printMazes : maze ? [maze] : [];
  const fourUpSheet = sheetMazes.length === 4;
  const streakNow = today ? currentStreak(entry.lastClearedOn, today, entry.streak) : 0;

  let message: ReactNode = <span>&nbsp;</span>;
  if (cleared) {
    message = small ? (
      <span className="mz-clear mz-clear-big">ゴール！ よくできました</span>
    ) : (
      <span className="mz-clear">
        🎉 ゴール！ {formatTime(result.timeMs)}
        {result.counted ? <BestBadge improved={result.improved} /> : '（こたえを見たので記録なし）'}
      </span>
    );
  } else if (showAnswer) {
    message = <span>こたえを薄く出しています（このあとは記録が付きません）</span>;
  } else if (daily) {
    message = (
      <span className="mz-note">
        {today ?? ''} の1面（{info.label}）。同じ日は誰でも同じ迷路です
      </span>
    );
  } else {
    message = <span className="mz-note">S の丸を押したまま、G までなぞってください</span>;
  }

  return (
    <div className={`card mz-game mz-${level}`}>
      <div className="mz-screen">
        {/* 遊び方と段階。**畳まない**（画面の約束5） */}
        <div className="mz-modes">
          <div className="seg" role="group" aria-label="遊び方">
            {(
              [
                ['free', 'フリー'],
                ['daily', '今日の1面'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={id === mode ? 'active' : ''}
                aria-pressed={id === mode}
                onClick={() => {
                  setMode(id);
                  begin(id, level);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="seg mz-levels" role="group" aria-label="大きさ">
            {LEVELS.map((l) => (
              <button
                key={l.id}
                type="button"
                className={l.id === level ? 'active' : ''}
                aria-pressed={l.id === level}
                title={`${l.size}×${l.size}（${l.target}）`}
                onClick={() => {
                  setLevel(l.id);
                  begin(mode, l.id);
                }}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div className="btn-row mz-actions">
          <button type="button" className="btn" onClick={() => begin(mode, level)}>
            {daily ? '今日の迷路' : cleared ? 'もう1面' : '新しい迷路'}
          </button>
          <button
            type="button"
            className="btn"
            disabled={!maze || cleared}
            aria-pressed={showAnswer}
            onClick={() => {
              setShowAnswer((v) => !v);
              setPeeked(true);
            }}
          >
            {showAnswer ? 'こたえを消す' : 'こたえを見る'}
          </button>
          <button type="button" className="btn" disabled={!maze} onClick={() => print(false)}>
            印刷する
          </button>
          <button
            type="button"
            className="btn"
            disabled={!maze || !FOUR_UP.includes(level)}
            onClick={() => print(true)}
          >
            4面まとめて
          </button>
        </div>

        <RecordStrip
          items={[
            ...(entry.wins ? [{ label: 'クリア', value: `${entry.wins}回` }] : []),
            ...(entry.bestTimeMs ? [{ label: 'ベスト', value: formatTime(entry.bestTimeMs) }] : []),
            ...(daily && streakNow > 0 ? [{ label: '連続', value: `${streakNow}日` }] : []),
          ]}
        />

        {/* 時間と拡大は1行にまとめる。拡大のボタンは常に置き、使わない段階では押せなくする
            （段を出し入れすると盤が動く） */}
        <div className="status-bar mz-status">
          <span className="mz-time">⏱ {formatTime(result?.timeMs ?? timer.ms)}</span>
          <span className="mz-zoom" role="group" aria-label="拡大">
            <button
              type="button"
              className="btn"
              aria-label="縮小"
              disabled={!zoomable || zoom === ZOOMS[0]}
              onClick={() => changeZoom(-1)}
            >
              −
            </button>
            <button
              type="button"
              className="btn"
              aria-label={`拡大（いま ${Math.round(zoom * 100)}%）`}
              disabled={!zoomable || zoom === ZOOMS[ZOOMS.length - 1]}
              onClick={() => changeZoom(1)}
            >
              ＋
            </button>
          </span>
        </div>

        <div
          ref={viewportRef}
          className="mz-board"
          role="group"
          aria-label={`迷路の盤面（${info.size}×${info.size}）。矢印キーでも進めます`}
          tabIndex={0}
          onKeyDown={onKeyDown}
        >
          {maze && (
            <div className="mz-zoomer" style={{ width: `${zoom * 100}%` }}>
              <MazeSvg
                svgRef={svgRef}
                maze={maze}
                route={path}
                answer={showAnswer ? solve(maze) : undefined}
                className="mz-svg mz-board-svg"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                label={`迷路 ${info.size}×${info.size}`}
              />
            </div>
          )}
        </div>

        {/* 出ても消えても盤が動かないよう、高さは常に確保しておく */}
        <p className="result-row mz-result" aria-live="polite">
          {message}
        </p>

        <details className="game-tips">
          <summary>画面の見かた</summary>
          <p>
            左上の S から右下の G まで、押したままなぞると線が伸びます。来た道を戻ると線が消え、
            線の途中を押すとそこからなぞり直せます。壁の向こうへは伸びません。
            キーボードでは盤を選んで矢印キーで進みます。
          </p>
          <p>
            <label className="mz-check">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              すいすいモード（矢印キーで分かれ道まで自動で進む）
            </label>
          </p>
        </details>
      </div>

      {/* 印刷用の紙。画面では隠し、@media print でこれだけを出す */}
      <div className="mz-sheet" data-print="mz-sheet" aria-hidden="true">
        <section className="mz-page">
          <p className="mz-sheet-head">
            <span>なまえ ＿＿＿＿＿＿＿＿＿＿</span>
            <span>ひづけ ＿＿＿＿＿＿＿＿</span>
          </p>
          <p className="mz-sheet-title">
            めいろ（{info.label}・{info.size}×{info.size}）　S から G まで すすもう
          </p>
          <div className={fourUpSheet ? 'mz-sheet-grid' : 'mz-sheet-one'}>
            {sheetMazes.map((m, i) => (
              <MazeSvg key={i} maze={m} className="mz-print-svg" label={`迷路 ${i + 1}`} />
            ))}
          </div>
          <p className="mz-sheet-foot">{PRINT_URL}</p>
        </section>
        <section className="mz-page mz-answers">
          <p className="mz-sheet-title">こたえ</p>
          <div className={fourUpSheet ? 'mz-sheet-grid' : 'mz-sheet-one'}>
            {sheetMazes.map((m, i) => (
              <MazeSvg key={i} maze={m} answer={solve(m)} className="mz-print-svg" label={`こたえ ${i + 1}`} />
            ))}
          </div>
          <p className="mz-sheet-foot">{PRINT_URL}</p>
        </section>
      </div>
    </div>
  );
}
