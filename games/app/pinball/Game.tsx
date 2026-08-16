'use client';

import { useEffect, useRef, useState } from 'react';
import {
  BALL_R,
  FLIPPER_R,
  flipperTip,
  initialState,
  LANE_X,
  step,
  TABLE_H,
  WALL_R,
  WALLS,
  type PinballState,
} from '@/lib/pinball';
import { trackToolUse } from '@/lib/analytics';
import { BestBadge, RecordStrip, useRecords } from '@/app/_records/Records';
import { type Improved } from '@/lib/records';

/**
 * ピンボールの画面。物理は `lib/pinball.ts`（純関数）にあり、ここは入力と描画だけ。
 *
 * ブロック崩しと同じく、**ゲーム本体は ref で回して React の状態にしない**。
 * 毎フレーム setState すると再描画で処理落ちする。表示に要る値
 * （スコア・残機・倍率・局面）だけを、変わったときに React 側へ渡す。
 */

/** 押している操作。キーとタッチの両方がここに集まる */
interface Held {
  left: boolean;
  right: boolean;
  plunger: boolean;
}

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<PinballState>(initialState());
  const held = useRef<Held>({ left: false, right: false, plunger: false });
  const [status, setStatus] = useState<PinballState['status']>('ready');
  const [hud, setHud] = useState({ score: 0, balls: 3, multiplier: 1 });
  // 記録（ベストスコア。docs/features/game-records.md）。
  // スコア型のゲームなのでタイムは残さない
  const records = useRecords('pinball');
  const entry = records.entry();
  const best = entry.bestScore ?? 0;
  const recorded = useRef(false);
  const counted = useRef(false);
  const [result, setResult] = useState<{ score: number; improved: Improved } | null>(null);

  useEffect(() => {
    if (status !== 'gameover' || recorded.current) return;
    recorded.current = true;
    const score = stateRef.current.score;
    const { improved } = records.finish({ score });
    setResult({ score, improved });
    trackToolUse('pinball', 'gameover');
  }, [status, records]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };
    resize();
    window.addEventListener('resize', resize);

    // キーボード: ← → または Z X でフリッパー、スペースでプランジャー
    const set = (e: KeyboardEvent, down: boolean) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'z') held.current.left = down;
      else if (k === 'arrowright' || k === '/' || k === 'x') held.current.right = down;
      else if (k === ' ' || k === 'enter') held.current.plunger = down;
      else return;
      // 矢印・スペースでページがスクロールしないようにする
      e.preventDefault();
    };
    const onDown = (e: KeyboardEvent) => set(e, true);
    const onUp = (e: KeyboardEvent) => set(e, false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const prev = stateRef.current;
      const next = step(prev, dt, held.current);
      stateRef.current = next;

      if (next.status !== prev.status) setStatus(next.status);
      if (
        next.score !== prev.score ||
        next.balls !== prev.balls ||
        next.multiplier !== prev.multiplier
      ) {
        setHud({ score: next.score, balls: next.balls, multiplier: next.multiplier });
      }

      draw(ctx, canvas, next);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  /**
   * タッチ・マウスの割り当て。
   *
   * **画面の左半分＝左フリッパー、右半分＝右フリッパー**。指を置いた位置で
   * 決めるので、スマホでも両手の親指でそのまま遊べる。
   * 打ち出し前（`ready`）はどこを押してもプランジャーを引く
   */
  const press = (clientX: number, down: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (stateRef.current.status === 'ready') {
      held.current.plunger = down;
      if (down && !counted.current) {
        counted.current = true;
        records.start();
        trackToolUse('pinball', 'start');
      }
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const side = (clientX - rect.left) / rect.width < 0.5 ? 'left' : 'right';
    held.current[side] = down;
  };

  const release = () => {
    held.current.left = false;
    held.current.right = false;
    held.current.plunger = false;
  };

  const retry = () => {
    stateRef.current = initialState();
    setStatus('ready');
    setHud({ score: 0, balls: 3, multiplier: 1 });
    setResult(null);
    recorded.current = false;
    counted.current = false;
    release();
    trackToolUse('pinball', 'retry');
  };

  return (
    <div className="card">
      <div className="status-bar">
        <span>
          スコア: <strong style={{ color: 'var(--text)' }}>{hud.score}</strong>
          {'　'}球: {'⚪'.repeat(Math.max(0, hud.balls))}
          {'　'}倍率: ×{hud.multiplier}
        </span>
      </div>

      {/* **1回も遊んでいなくても出す**（0 / 0回）。記録ができた瞬間に帯が現れると、
          台が34px押し下げられて画面から出る。リバーシと同じ扱い
          （games/CLAUDE.md「画面の約束」の1） */}
      <RecordStrip
        items={[
          { label: 'ベストスコア', value: String(best) },
          { label: 'プレイ', value: `${entry.plays ?? 0}回` },
        ]}
      />

      <div
        className="pb-stage"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          press(e.clientX, true);
        }}
        onPointerUp={(e) => {
          press(e.clientX, false);
        }}
        onPointerCancel={release}
        onPointerLeave={release}
      >
        <canvas ref={canvasRef} aria-label="ピンボールの台" />

        {status === 'ready' && (
          <div className="pb-hint">
            <p>
              <strong>押し続けて離すと打ち出し</strong>（長く押すほど強く）
            </p>
            <p>左半分＝左フリッパー / 右半分＝右フリッパー</p>
          </div>
        )}

        {status === 'gameover' && (
          <div className="pb-overlay">
            <p style={{ fontSize: '1.2rem', fontWeight: 700 }}>ゲームオーバー</p>
            <p>
              スコア: {hud.score}
              {result && !result.improved.score && best > 0 ? `　ベスト: ${best}` : ''}
              <BestBadge improved={result?.improved ?? null} />
            </p>
            <button type="button" className="btn btn-primary" onClick={retry}>
              もう一度
            </button>
          </div>
        )}
      </div>

      {/* 指が使えない環境（PCでマウスだけ・キーボードを使いたくない人）向けの控え。
          押しているあいだフリッパーが上がる */}
      <div className="btn-row pb-pads">
        <button
          type="button"
          className="btn"
          aria-label="左フリッパー"
          onPointerDown={() => {
            held.current.left = true;
          }}
          onPointerUp={() => {
            held.current.left = false;
          }}
          onPointerLeave={() => {
            held.current.left = false;
          }}
        >
          ◀ 左
        </button>
        <button
          type="button"
          className="btn"
          aria-label="右フリッパー"
          onPointerDown={() => {
            held.current.right = true;
          }}
          onPointerUp={() => {
            held.current.right = false;
          }}
          onPointerLeave={() => {
            held.current.right = false;
          }}
        >
          右 ▶
        </button>
      </div>

      <details className="game-tips">
        <summary>この画面の見かた</summary>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>
          丸い<strong>バンパー</strong>は当たるたび100点、横に並ぶ<strong>的</strong>は250点。
          的を4つ全部倒すとボーナス1000点が入って倍率が1つ上がります（最大5倍）。
          球を落とすと倍率は1に戻ります。球は3つです。
        </p>
      </details>
    </div>
  );
}

/** 正規化座標（幅1×高さ1.5）の状態をcanvasのピクセルへ拡大して描く */
function draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, s: PinballState): void {
  const w = canvas.width;
  // 台の縦横比は 1 : TABLE_H。canvas 側も同じ比なので、拡大率は幅から出せば足りる
  const k = w;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // 盤面の地
  ctx.fillStyle = '#111c33';
  ctx.fillRect(0, 0, w, h);

  // プランジャーのレーン（盤面と地の色を変えて、通路だと分かるようにする）
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0.87 * k, 0.34 * k, 0.1 * k, (TABLE_H - 0.34) * k);

  // 壁
  ctx.lineCap = 'round';
  for (const wall of WALLS) {
    ctx.strokeStyle = wall.kind === 'kicker' ? '#f472b6' : '#64748b';
    ctx.lineWidth = WALL_R * 2 * k;
    ctx.beginPath();
    ctx.moveTo(wall.x1 * k, wall.y1 * k);
    ctx.lineTo(wall.x2 * k, wall.y2 * k);
    ctx.stroke();
  }

  // 的（倒れたものは枠だけ残して「また出てくる」と分かるようにする）
  for (const t of s.targets) {
    if (t.down) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = 2;
      ctx.strokeRect(t.x * k, t.y * k, t.w * k, t.h * k);
    } else {
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(t.x * k, t.y * k, t.w * k, t.h * k);
    }
  }

  // バンパー
  for (const b of s.bumpers) {
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(b.x * k, b.y * k, b.r * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b1220';
    ctx.beginPath();
    ctx.arc(b.x * k, b.y * k, b.r * 0.45 * k, 0, Math.PI * 2);
    ctx.fill();
  }

  // フリッパー
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = FLIPPER_R * 2 * k;
  for (const f of s.flippers) {
    const tip = flipperTip(f);
    ctx.beginPath();
    ctx.moveTo(f.pivotX * k, f.pivotY * k);
    ctx.lineTo(tip.x * k, tip.y * k);
    ctx.stroke();
  }

  // プランジャー（引いた分だけ縮む棒）
  if (s.status === 'ready') {
    const top = 1.42 + s.plunger * 0.05;
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 0.03 * k;
    ctx.beginPath();
    ctx.moveTo(LANE_X * k, top * k);
    ctx.lineTo(LANE_X * k, TABLE_H * k);
    ctx.stroke();
  }

  // 球
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(s.ball.x * k, s.ball.y * k, BALL_R * k, 0, Math.PI * 2);
  ctx.fill();
}
