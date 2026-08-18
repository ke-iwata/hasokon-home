'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  INITIAL_LENGTH,
  initialState,
  intervalFor,
  start as startGame,
  step,
  togglePause,
  turn,
  type Direction,
  type SnakeState,
} from '@/lib/snake';
import { trackToolUse } from '@/lib/analytics';
import { BestBadge, RecordStrip, useRecords } from '@/app/_records/Records';
import { type Improved } from '@/lib/records';

/**
 * スネークの画面。ルールと進行は `lib/snake.ts`（純関数）にあり、ここは入力と描画だけ。
 *
 * ブロック崩し・ピンボールと同じく、**ゲーム本体は ref で回して React の状態にしない**。
 * 毎フレーム setState すると再描画で処理落ちする。表示に要る値（スコア・局面）だけを、
 * 変わったときに React 側へ渡す。
 */

/** スワイプと判定する最小の移動量（px）。誤タップで曲がらないようにする */
const SWIPE_THRESHOLD = 24;

/** キーと向きの対応。矢印キーと WASD の両方を受ける */
const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  a: 'left',
  s: 'down',
  d: 'right',
  W: 'up',
  A: 'left',
  S: 'down',
  D: 'right',
};

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<SnakeState>(initialState());
  const [status, setStatus] = useState<SnakeState['status']>('ready');
  const [score, setScore] = useState(0);
  // 記録（ベストスコア。docs/features/game-records.md）。
  // スコア型のゲームなのでタイムは残さない
  const records = useRecords('snake');
  const entry = records.entry();
  const best = entry.bestScore ?? 0;
  const recorded = useRef(false);
  const [result, setResult] = useState<{ score: number; improved: Improved } | null>(null);

  // 決着した時点のスコア（＝食べた餌の数）を記録する
  useEffect(() => {
    if ((status !== 'gameover' && status !== 'cleared') || recorded.current) return;
    recorded.current = true;
    const final = stateRef.current.score;
    const { improved } = records.finish({ score: final });
    setResult({ score: final, improved });
    trackToolUse('snake', status === 'cleared' ? 'clear' : 'gameover');
  }, [status, records]);

  /** 局面に応じた「押した」の意味。スタート・一時停止・やり直しを1か所にまとめる */
  const press = useCallback(() => {
    const s = stateRef.current;
    if (s.status === 'ready') {
      stateRef.current = startGame(s);
      setStatus('playing');
      records.start();
      trackToolUse('snake', 'start');
    } else if (s.status === 'playing' || s.status === 'paused') {
      const next = togglePause(s);
      stateRef.current = next;
      setStatus(next.status);
    } else {
      stateRef.current = initialState();
      setStatus('ready');
      setScore(0);
      setResult(null);
      recorded.current = false;
      trackToolUse('snake', 'retry');
    }
  }, [records]);

  /** 方向転換。キーとスワイプの両方がここに集まる */
  const changeDirection = useCallback((dir: Direction) => {
    const s = stateRef.current;
    // スタート待ちに方向を入れると、そのまま動き出したときに効く
    stateRef.current = turn(s, dir);
  }, []);

  // キーボード（矢印 / WASD で方向転換、スペースで一時停止）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const status = stateRef.current.status;
      if (e.key === ' ' || e.key === 'Spacebar') {
        // **遊んでいる最中だけ受ける。** 決着後や開始前にも奪うと、
        // ページを読みながらスペースで送ろうとした人のスクロールが止まる
        if (status !== 'playing' && status !== 'paused') return;
        e.preventDefault();
        press();
        return;
      }
      const dir = KEY_DIRECTIONS[e.key];
      if (!dir) return;
      if (status !== 'ready' && status !== 'playing') return;
      e.preventDefault(); // 矢印キーでページが動かないように
      changeDirection(dir);
      // スタート待ちなら、押した向きを積んだままそのまま動き出す
      if (status === 'ready') press();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press, changeDirection]);

  // ゲームループ。1マスぶんの時間（スコアで縮む）ごとに step を回す
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 実ピクセルに合わせる（Retinaでにじまないように）
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      draw(ctx, canvas, stateRef.current);
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    let last = performance.now();
    let elapsed = 0;
    const loop = (now: number) => {
      // タブが非アクティブだったぶんを一気に進めない（復帰した瞬間に
      // 何マスも動いて壁に刺さるのを防ぐ）
      const dt = Math.min(now - last, 250);
      last = now;
      const before = stateRef.current;
      if (before.status === 'playing') {
        elapsed += dt;
        let next = before;
        while (elapsed >= intervalFor(next.score) && next.status === 'playing') {
          elapsed -= intervalFor(next.score);
          next = step(next);
        }
        if (next !== before) {
          stateRef.current = next;
          if (next.status !== before.status) setStatus(next.status);
          if (next.score !== before.score) setScore(next.score);
        }
      } else {
        elapsed = 0;
      }

      draw(ctx, canvas, stateRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  // スワイプ。指を離さずに続けて曲がれるよう、しきい値を超えたら起点を取り直す
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    touchStart.current = { x: t.clientX, y: t.clientY };
    swiped.current = false;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const startPoint = touchStart.current;
    const t = e.touches[0];
    if (!startPoint || !t) return;
    const dx = t.clientX - startPoint.x;
    const dy = t.clientY - startPoint.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;
    changeDirection(
      Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up',
    );
    touchStart.current = { x: t.clientX, y: t.clientY };
    swiped.current = true;
  };

  const onTouchEnd = () => {
    touchStart.current = null;
  };

  /**
   * 盤を押したとき。スタート・再開・やり直しだけを受ける。
   *
   * **動いているあいだは何もしない。** 盤の上は方向転換の場所でもあるので、
   * しきい値に届かなかったスワイプが「一時停止」になると事故になる
   * （止めるのはスペースキーか下のボタン）。
   */
  const onStageClick = () => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    if (stateRef.current.status === 'playing') return;
    press();
  };

  /**
   * 幕の中のボタン。**盤へ伝わらないように止める。**
   * 伝わると「もう一度」の1押しで再開始まで進み、スタート待ちの画面を飛ばしてしまう
   */
  const onOverlayButton = (e: React.MouseEvent) => {
    e.stopPropagation();
    press();
  };

  const paused = status === 'paused';
  const running = status === 'playing' || paused;

  return (
    <div className="card">
      <div className="status-bar">
        <span>
          スコア: <strong style={{ color: 'var(--text)' }}>{score}</strong>
          {/* 長さは「最初の長さ＋食べた数」で必ず決まる（ref を読むと再描画されない） */}
          {'　'}長さ: {INITIAL_LENGTH + score}
        </span>
      </div>

      <RecordStrip
        items={[
          ...(best > 0 ? [{ label: 'ベストスコア', value: String(best) }] : []),
          ...(entry.plays ? [{ label: 'プレイ', value: `${entry.plays}回` }] : []),
        ]}
      />

      <div
        className="sk-stage"
        onClick={onStageClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <canvas ref={canvasRef} aria-label="スネークのゲーム画面" />
        {status !== 'playing' && (
          <div className="sk-overlay">
            {status === 'ready' && (
              <>
                <p style={{ fontSize: '1.05rem', fontWeight: 700 }}>タップ / キーでスタート</p>
                <p className="sk-sub">スマホは盤の上をスワイプ、PCは矢印キー（WASD）で曲がります</p>
              </>
            )}
            {paused && (
              <>
                <p style={{ fontSize: '1.2rem', fontWeight: 700 }}>一時停止中</p>
                <button type="button" className="btn btn-primary" onClick={onOverlayButton}>
                  再開する
                </button>
              </>
            )}
            {status === 'cleared' && (
              <>
                <p className="sk-win" style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                  🎉 盤面制覇！
                </p>
                <p>
                  スコア: {score}
                  <BestBadge improved={result?.improved ?? null} />
                </p>
                <button type="button" className="btn btn-primary" onClick={onOverlayButton}>
                  もう一度
                </button>
              </>
            )}
            {status === 'gameover' && (
              <>
                <p style={{ fontSize: '1.2rem', fontWeight: 700 }}>ゲームオーバー</p>
                <p>
                  スコア: {score}
                  {result && !result.improved.score && best > 0 ? `　ベスト: ${best}` : ''}
                  <BestBadge improved={result?.improved ?? null} />
                </p>
                <button type="button" className="btn btn-primary" onClick={onOverlayButton}>
                  もう一度
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* 一時停止はスマホにスペースキーが無いので画面にも置く。
          **押せない局面でも段ごと消さない**（消すと盤の位置が動く） */}
      <div className="btn-row sk-controls">
        <button type="button" className="btn" onClick={press} disabled={!running}>
          {paused ? '再開' : '一時停止'}
        </button>
      </div>

      {/* 「この画面の見かた」は置かない。遊び方は幕（スタート待ち）とページ下の
          「遊び方」で足りるので、そのぶんの高さを盤に回す（実測で31px） */}
    </div>
  );
}

/** 盤の色。ゲーム画面なので明暗どちらのテーマでも暗いままにする */
const COLORS = {
  grid: 'rgba(148, 163, 184, 0.14)',
  head: '#4ade80',
  body: '#22c55e',
  bodyAlt: '#16a34a',
  food: '#f87171',
  eye: '#0b1220',
};

/** 格子の状態をcanvasのピクセルに拡大して描く */
function draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, s: SnakeState): void {
  const w = canvas.width;
  const h = canvas.height;
  const cell = Math.min(w, h) / s.size;
  ctx.clearRect(0, 0, w, h);

  // 目安の格子。マス目で進むゲームなので、線があると次の位置を読みやすい
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = Math.max(1, cell * 0.02);
  ctx.beginPath();
  for (let i = 1; i < s.size; i += 1) {
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, s.size * cell);
    ctx.moveTo(0, i * cell);
    ctx.lineTo(s.size * cell, i * cell);
  }
  ctx.stroke();

  // 餌
  if (s.food) {
    ctx.fillStyle = COLORS.food;
    ctx.beginPath();
    ctx.arc((s.food.x + 0.5) * cell, (s.food.y + 0.5) * cell, cell * 0.34, 0, Math.PI * 2);
    ctx.fill();
  }

  // 体。頭だけ明るくして、どちらへ進んでいるか一目で分かるようにする
  const pad = cell * 0.08;
  const radius = Math.max(2, cell * 0.25);
  for (let i = s.body.length - 1; i >= 0; i -= 1) {
    const c = s.body[i];
    ctx.fillStyle = i === 0 ? COLORS.head : i % 2 === 0 ? COLORS.body : COLORS.bodyAlt;
    ctx.beginPath();
    ctx.roundRect(c.x * cell + pad, c.y * cell + pad, cell - pad * 2, cell - pad * 2, radius);
    ctx.fill();
  }

  // 目。進む向きに合わせて置く（頭の向きが分かると曲がる操作を間違えにくい）
  const head = s.body[0];
  const cx = (head.x + 0.5) * cell;
  const cy = (head.y + 0.5) * cell;
  const offset = cell * 0.18;
  const along = cell * 0.16;
  const dx = s.dir === 'left' ? -along : s.dir === 'right' ? along : 0;
  const dy = s.dir === 'up' ? -along : s.dir === 'down' ? along : 0;
  const px = s.dir === 'up' || s.dir === 'down' ? offset : 0;
  const py = s.dir === 'left' || s.dir === 'right' ? offset : 0;
  ctx.fillStyle = COLORS.eye;
  for (const sign of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + dx + px * sign, cy + dy + py * sign, cell * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
}
