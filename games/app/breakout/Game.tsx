'use client';

import { useEffect, useRef, useState } from 'react';
import {
  initialState,
  launch,
  nextStage,
  PADDLE_HEIGHT,
  PADDLE_Y,
  step,
  type BreakoutState,
} from '@/lib/breakout';
import { trackToolUse } from '@/lib/analytics';

/** ブロックの行ごとの色（上の行ほど高得点で暖色） */
const ROW_COLORS = ['#f87171', '#fb923c', '#fbbf24', '#4ade80', '#38bdf8'];

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<BreakoutState>(initialState());
  const paddleTarget = useRef(0.5);
  // オーバーレイ表示の切り替えにだけ React の状態を使う
  // （毎フレーム setState すると再描画で処理落ちするため、ゲーム本体は ref で回す）
  const [status, setStatus] = useState<BreakoutState['status']>('ready');
  const [hud, setHud] = useState({ score: 0, lives: 3, stage: 1 });

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
    };
    resize();
    window.addEventListener('resize', resize);

    // マウス・タッチでパドルを動かす
    const toX = (clientX: number) => {
      const rect = canvas.getBoundingClientRect();
      return (clientX - rect.left) / rect.width;
    };
    const onMouse = (e: MouseEvent) => {
      paddleTarget.current = toX(e.clientX);
    };
    const onTouch = (e: TouchEvent) => {
      if (e.touches[0]) paddleTarget.current = toX(e.touches[0].clientX);
    };
    canvas.addEventListener('mousemove', onMouse);
    canvas.addEventListener('touchmove', onTouch, { passive: true });
    canvas.addEventListener('touchstart', onTouch, { passive: true });

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const prev = stateRef.current;
      const next = step(prev, dt, paddleTarget.current);
      stateRef.current = next;

      // 状態が変わったときだけ React 側へ反映する
      if (next.status !== prev.status) setStatus(next.status);
      if (next.score !== prev.score || next.lives !== prev.lives || next.stage !== prev.stage) {
        setHud({ score: next.score, lives: next.lives, stage: next.stage });
      }

      draw(ctx, canvas, next);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', onMouse);
      canvas.removeEventListener('touchmove', onTouch);
      canvas.removeEventListener('touchstart', onTouch);
    };
  }, []);

  const start = () => {
    const s = stateRef.current;
    if (s.status === 'ready') {
      stateRef.current = launch(s);
      setStatus('playing');
      trackToolUse('breakout', s.score === 0 && s.stage === 1 ? 'start' : 'continue');
    } else if (s.status === 'cleared') {
      stateRef.current = nextStage(s);
      setStatus('ready');
      trackToolUse('breakout', 'next-stage');
    } else if (s.status === 'gameover') {
      stateRef.current = initialState();
      setStatus('ready');
      setHud({ score: 0, lives: 3, stage: 1 });
      trackToolUse('breakout', 'retry');
    }
  };

  return (
    <div className="card">
      <div className="status-bar">
        <span>
          スコア: <strong style={{ color: 'var(--text)' }}>{hud.score}</strong>
          {'　'}残機: {'❤️'.repeat(Math.max(0, hud.lives))}
          {'　'}面: {hud.stage}
        </span>
      </div>
      <div className="bk-stage" onClick={start}>
        <canvas ref={canvasRef} aria-label="ブロック崩しのゲーム画面" />
        {status !== 'playing' && (
          <div className="bk-overlay">
            {status === 'ready' && (
              <>
                <p style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                  タップ / クリックでスタート
                </p>
                <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                  パドルの下の余白に指を置いて左右に動かす（指で隠れません）
                </p>
              </>
            )}
            {status === 'cleared' && (
              <>
                <p style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--ok)' }}>
                  🎉 ステージクリア！
                </p>
                <button type="button" className="btn btn-primary" onClick={start}>
                  次の面へ（球が速くなります）
                </button>
              </>
            )}
            {status === 'gameover' && (
              <>
                <p style={{ fontSize: '1.2rem', fontWeight: 700 }}>ゲームオーバー</p>
                <p>
                  スコア: {hud.score}（{hud.stage}面）
                </p>
                <button type="button" className="btn btn-primary" onClick={start}>
                  もう一度
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 正規化座標（0〜1）の状態をcanvasのピクセルに拡大して描く */
function draw(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  s: BreakoutState,
): void {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // ブロック
  for (const b of s.bricks) {
    if (b.hp <= 0) continue;
    ctx.fillStyle = ROW_COLORS[b.row] ?? '#38bdf8';
    // 2回当てるブロックは半透明にして「まだ固い」と分かるようにする
    ctx.globalAlpha = b.hp >= 2 ? 0.55 : 1;
    ctx.fillRect(b.x * w, b.y * h, b.width * w, b.height * h);
  }
  ctx.globalAlpha = 1;

  // パドル
  const half = s.paddleWidth / 2;
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.roundRect(
    (s.paddleX - half) * w,
    PADDLE_Y * h,
    s.paddleWidth * w,
    PADDLE_HEIGHT * h,
    6,
  );
  ctx.fill();

  // 球
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(s.ball.x * w, s.ball.y * h, s.ball.radius * w, 0, Math.PI * 2);
  ctx.fill();
}
