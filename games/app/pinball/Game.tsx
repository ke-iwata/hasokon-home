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
  // 当たりの余韻と残像。**Reactの状態にしない**（毎フレーム変わるので再描画が要らない）
  const fxRef = useRef<Fx>(newFx(initialState().bumpers.length, 4, 3));
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

      updateFx(fxRef.current, next, Math.min(dt, 1 / 20), next.multiplier);
      draw(ctx, canvas, next, fxRef.current);
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
    fxRef.current = newFx(stateRef.current.bumpers.length, 4, 3);
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

      <div className="pb-stage">
        {/* **指の受け口は canvas 自身に付ける。**
            外側の枠に付けていたときは、枠が `setPointerCapture` で指をつかんだまま
            になり、**ゲームオーバーの「もう一度」が押せなかった**
            （押しても click が枠の側に飛んで、ボタンの onClick が呼ばれない。
            つまり球を3つ落としたら、再読み込みしないと遊び直せなかった）。
            canvas は覆い（`.pb-overlay`）の下に隠れるので、この付け方なら
            覆いが出ているあいだは台に触れないという意味にもなる。
            打ち出し前の案内（`.pb-hint`）は `pointer-events: none` なので素通りする */}
        <canvas
          ref={canvasRef}
          aria-label="ピンボールの台"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            press(e.clientX, true);
          }}
          onPointerUp={(e) => {
            press(e.clientX, false);
          }}
          onPointerCancel={release}
          onPointerLeave={release}
        />

        {status === 'ready' && (
          <div className="pb-hint">
            <p>
              <strong>押し続けて離すと打ち出し</strong>
            </p>
            <p>左半分＝左フリッパー / 右半分＝右</p>
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
          丸い<strong>バンパー</strong>は100点、左の階段状の<strong>的</strong>は250点、
          紫の<strong>吸い込みホール</strong>は500点（少し抱えてから上へ撃ち出します）。
          天井の<strong>レーン</strong>は50点で、<strong>左の周回レーン</strong>に打ち上げると通ります。
          打ち出しの通路の<strong>スピナー</strong>は回っているあいだ点が入ります。
          <strong>的3つ</strong>か<strong>レーン3つ</strong>をそろえるとボーナス1000点で倍率が1つ上がります（最大5倍）。
          球を落とすと倍率は1に戻ります。球は3つです。
        </p>
      </details>
    </div>
  );
}

/**
 * 当たりの余韻と球の残像。**描画だけの値なので `PinballState` には持たせない**
 * （物理の状態に演出を混ぜると、テストがUIの都合で壊れるようになる）。
 * 値は「1で当たった直後、0で消えた」の残量で、毎フレーム減らす。
 */
interface Fx {
  bumpers: number[];
  targets: number[];
  lanes: number[];
  sling: number;
  saucer: number;
  spinner: number;
  /** 球の残像。新しいものが先頭 */
  trail: { x: number; y: number }[];
  /** 浮かび上がる得点。当たった場所に出す */
  pops: { x: number; y: number; text: string; life: number }[];
}

function newFx(bumpers: number, targets: number, lanes: number): Fx {
  return {
    bumpers: new Array(bumpers).fill(0),
    targets: new Array(targets).fill(0),
    lanes: new Array(lanes).fill(0),
    sling: 0,
    saucer: 0,
    spinner: 0,
    trail: [],
    pops: [],
  };
}

/** いちばん近いものの番号。当たりの種類しか分からないので、球の位置から当てる */
function nearest(items: { x: number; y: number }[], x: number, y: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < items.length; i += 1) {
    const d = (items[i].x - x) ** 2 + (items[i].y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** 1フレームぶん余韻を減らし、当たったものに新しい余韻を入れる */
function updateFx(fx: Fx, s: PinballState, dt: number, mult: number): void {
  const fade = Math.max(0, 1 - dt * 4.5);
  for (let i = 0; i < fx.bumpers.length; i += 1) fx.bumpers[i] *= fade;
  for (let i = 0; i < fx.targets.length; i += 1) fx.targets[i] *= fade;
  for (let i = 0; i < fx.lanes.length; i += 1) fx.lanes[i] *= fade;
  fx.sling *= fade;
  fx.saucer *= fade;
  fx.spinner *= fade;

  fx.trail.unshift({ x: s.ball.x, y: s.ball.y });
  if (fx.trail.length > 7) fx.trail.length = 7;

  for (let i = fx.pops.length - 1; i >= 0; i -= 1) {
    fx.pops[i].life -= dt * 1.3;
    if (fx.pops[i].life <= 0) fx.pops.splice(i, 1);
  }

  const { x, y } = s.ball;
  const pop = (text: string, py = y) => {
    if (fx.pops.length > 6) fx.pops.shift();
    fx.pops.push({ x, y: py, text, life: 1 });
  };

  for (const hit of s.hits) {
    if (hit === 'bumper') {
      fx.bumpers[nearest(s.bumpers, x, y)] = 1;
      pop(`+${100 * mult}`);
    } else if (hit === 'target') {
      fx.targets[nearest(s.targets, x, y)] = 1;
      pop(`+${250 * mult}`);
    } else if (hit === 'lane') {
      fx.lanes[nearest(s.lanes, x, y)] = 1;
      pop(`+${50 * mult}`);
    } else if (hit === 'kicker') {
      fx.sling = 1;
    } else if (hit === 'saucer') {
      fx.saucer = 1;
      pop(`+${500 * mult}`);
    } else if (hit === 'spinner') {
      fx.spinner = 1;
    } else if (hit === 'clear') {
      pop('的ぜんぶ +1000');
    } else if (hit === 'laneClear') {
      pop('レーン +1000', 0.24);
    }
  }
}

/** 角丸の四角。`roundRect` はSafariの古い版に無いので自前で持つ */
function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * 正規化座標（幅1×高さ1.5）の状態をcanvasのピクセルへ拡大して描く。
 *
 * **拡大率は幅だけから出す**（canvas の縦横比を 1:1.5 に固定してあるので、
 * 幅を掛ければ縦もそろう）。座標の意味は `lib/pinball.ts` を見ること。
 */
function draw(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  s: PinballState,
  fx: Fx,
): void {
  const w = canvas.width;
  const h = canvas.height;
  const k = w;
  ctx.clearRect(0, 0, w, h);

  drawPlayfield(ctx, w, h, k);
  drawLane(ctx, k);
  drawTopLanes(ctx, s, fx, k);
  drawWalls(ctx, fx, k);
  drawSpinner(ctx, s, fx, k);
  drawSaucer(ctx, s, fx, k);
  drawTargets(ctx, s, fx, k);
  drawBumpers(ctx, s, fx, k);
  drawFlippers(ctx, s, k);
  if (s.status === 'ready') drawPlunger(ctx, s, k);
  drawBall(ctx, s, fx, k);
  drawPops(ctx, fx, k);
}

/** 盤面の地。奥に光源があるように見せて、のっぺりした一色をやめる */
function drawPlayfield(ctx: CanvasRenderingContext2D, w: number, h: number, k: number): void {
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#1e2f52');
  base.addColorStop(0.4, '#152340');
  base.addColorStop(1, '#0a1020');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // 上のバンパー地帯にだけ淡い明かりを置く。台の「奥」が分かる
  const glow = ctx.createRadialGradient(0.52 * k, 0.4 * k, 0.02 * k, 0.52 * k, 0.4 * k, 0.62 * k);
  glow.addColorStop(0, 'rgba(96, 165, 250, 0.20)');
  glow.addColorStop(1, 'rgba(96, 165, 250, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // 盤面の飾り（同心の弧）。奥行きと「台の形」を出すための線
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.10)';
  ctx.lineWidth = Math.max(1, 0.004 * k);
  for (const r of [0.2, 0.3, 0.4]) {
    ctx.beginPath();
    ctx.arc(0.52 * k, 0.4 * k, r * k, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 排水口（フリッパーのあいだ）。ここに落ちると1つ減る。
  // **四角く塗ると台に黒い箱が乗って見える**ので、口を中心にした放射で落とす
  const drain = ctx.createRadialGradient(0.45 * k, 1.5 * k, 0.02 * k, 0.45 * k, 1.5 * k, 0.3 * k);
  drain.addColorStop(0, 'rgba(2, 6, 23, 0.92)');
  drain.addColorStop(1, 'rgba(2, 6, 23, 0)');
  ctx.fillStyle = drain;
  ctx.fillRect(0, 1.2 * k, k, 0.3 * k);
}

/** プランジャーのレーン。上向きの矢印で「ここから打ち出す」を示す */
function drawLane(ctx: CanvasRenderingContext2D, k: number): void {
  const floor = ctx.createLinearGradient(0, 0.34 * k, 0, 0.5 * k);
  floor.addColorStop(0, 'rgba(7, 13, 24, 0)');
  floor.addColorStop(1, '#070d18');
  ctx.fillStyle = floor;
  ctx.fillRect(0.875 * k, 0.34 * k, 0.09 * k, 0.16 * k);
  ctx.fillStyle = '#070d18';
  ctx.fillRect(0.875 * k, 0.5 * k, 0.09 * k, (TABLE_H - 0.5) * k);

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
  ctx.lineWidth = Math.max(1, 0.008 * k);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const y of [1.1, 1.19, 1.28]) {
    ctx.beginPath();
    ctx.moveTo(0.895 * k, y * k);
    ctx.lineTo(LANE_X * k, (y - 0.03) * k);
    ctx.lineTo(0.945 * k, y * k);
    ctx.stroke();
  }
}

/** 天井のレーン。通ると点灯し、3つそろうと倍率が上がる */
function drawTopLanes(ctx: CanvasRenderingContext2D, s: PinballState, fx: Fx, k: number): void {
  s.lanes.forEach((lane, i) => {
    const flash = fx.lanes[i] ?? 0;
    const x = (lane.x - lane.w / 2) * k;
    const y = (lane.y - 0.012) * k;
    const lw = lane.w * k;
    const lh = 0.024 * k;

    ctx.fillStyle = lane.lit ? 'rgba(250, 204, 21, 0.30)' : 'rgba(148, 163, 184, 0.12)';
    roundedRect(ctx, x, y, lw, lh, lh / 2);
    ctx.fill();

    ctx.strokeStyle = lane.lit ? '#facc15' : 'rgba(148, 163, 184, 0.45)';
    ctx.lineWidth = Math.max(1, 0.005 * k);
    ctx.stroke();

    if (flash > 0.01) {
      ctx.save();
      ctx.globalAlpha = flash;
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 0.05 * k;
      ctx.strokeStyle = '#fff7ed';
      ctx.stroke();
      ctx.restore();
    }
  });
}

/**
 * 壁とスリングショット。
 *
 * 壁は**太い暗線の上に細い明線**を重ねて、平面の棒ではなく面取りされた
 * レールに見せる。スリングショット（蹴り返す斜面）は面を塗ってゴムを張る
 */
function drawWalls(ctx: CanvasRenderingContext2D, fx: Fx, k: number): void {
  ctx.lineCap = 'round';

  // 斜面の面を先に塗る（線より下に敷く）
  ctx.fillStyle = 'rgba(244, 114, 182, 0.14)';
  ctx.beginPath();
  ctx.moveTo(0.03 * k, 1.02 * k);
  ctx.lineTo(0.21 * k, 1.31 * k);
  ctx.lineTo(0.03 * k, 1.31 * k);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0.87 * k, 1.02 * k);
  ctx.lineTo(0.69 * k, 1.31 * k);
  ctx.lineTo(0.87 * k, 1.31 * k);
  ctx.closePath();
  ctx.fill();

  for (const pass of [0, 1] as const) {
    for (const wall of WALLS) {
      const kicker = wall.kind === 'kicker';
      // 一方通行の門は**細い破線**にして「壁ではない」と分かるようにする
      if (wall.kind === 'gate') {
        if (pass === 0) continue;
        ctx.save();
        ctx.setLineDash([0.02 * k, 0.02 * k]);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
        ctx.lineWidth = Math.max(1, 0.006 * k);
        ctx.beginPath();
        ctx.moveTo(wall.x1 * k, wall.y1 * k);
        ctx.lineTo(wall.x2 * k, wall.y2 * k);
        ctx.stroke();
        ctx.restore();
        continue;
      }
      if (pass === 0) {
        ctx.strokeStyle = kicker ? '#9d174d' : '#334155';
        ctx.lineWidth = WALL_R * 2 * k;
      } else {
        ctx.strokeStyle = kicker ? '#f472b6' : '#7d8ca3';
        ctx.lineWidth = WALL_R * 0.95 * k;
      }
      if (kicker && pass === 1 && fx.sling > 0.01) {
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.shadowColor = '#f9a8d4';
        ctx.shadowBlur = fx.sling * 0.06 * k;
        ctx.strokeStyle = '#fbcfe8';
      }
      ctx.beginPath();
      ctx.moveTo(wall.x1 * k, wall.y1 * k);
      ctx.lineTo(wall.x2 * k, wall.y2 * k);
      ctx.stroke();
      if (kicker && pass === 1 && fx.sling > 0.01) ctx.restore();
    }
  }
}

/** スピナー。レーンを横切る回転板。回っているあいだ幅が伸び縮みして見える */
function drawSpinner(ctx: CanvasRenderingContext2D, s: PinballState, fx: Fx, k: number): void {
  const { x, y, w, angle } = s.spinner;
  const half = (w / 2) * k;
  const cx = x * k;
  const cy = y * k;

  // 軸受け
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
  ctx.lineWidth = Math.max(1, 0.004 * k);
  ctx.beginPath();
  ctx.moveTo(cx - half, cy);
  ctx.lineTo(cx + half, cy);
  ctx.stroke();

  // 板。奥へ倒れるほど薄く見えるので、高さを cos で縮める
  const face = Math.abs(Math.cos(angle));
  const height = 0.026 * k * face + 1;
  const lit = s.spinner.spin > 0.5 || fx.spinner > 0.01;
  const g = ctx.createLinearGradient(0, cy - height, 0, cy + height);
  g.addColorStop(0, lit ? '#fde68a' : '#94a3b8');
  g.addColorStop(1, lit ? '#b45309' : '#475569');
  ctx.fillStyle = g;
  roundedRect(ctx, cx - half, cy - height, half * 2, height * 2, 0.006 * k);
  ctx.fill();
  ctx.strokeStyle = lit ? 'rgba(253, 224, 71, 0.8)' : 'rgba(148, 163, 184, 0.6)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** 吸い込みホール。抱えているあいだは縁が回る */
function drawSaucer(ctx: CanvasRenderingContext2D, s: PinballState, fx: Fx, k: number): void {
  const { x, y, r, hold } = s.saucer;
  const cx = x * k;
  const cy = y * k;
  const rr = r * k;

  const g = ctx.createRadialGradient(cx, cy, rr * 0.2, cx, cy, rr * 1.35);
  g.addColorStop(0, 'rgba(2, 6, 23, 0.95)');
  g.addColorStop(0.72, 'rgba(15, 23, 42, 0.9)');
  g.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, rr * 1.35, 0, Math.PI * 2);
  ctx.fill();

  const inner = ctx.createRadialGradient(cx, cy + rr * 0.25, rr * 0.1, cx, cy, rr);
  inner.addColorStop(0, 'rgba(167, 139, 250, 0.35)');
  inner.addColorStop(1, 'rgba(167, 139, 250, 0)');
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.arc(cx, cy, rr, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = hold > 0 || fx.saucer > 0.01 ? '#a78bfa' : 'rgba(167, 139, 250, 0.55)';
  ctx.lineWidth = Math.max(1.5, 0.007 * k);
  ctx.beginPath();
  ctx.arc(cx, cy, rr, 0, Math.PI * 2);
  ctx.stroke();

  if (hold > 0) {
    // 抱えている残り時間を弧で見せる（いつ出るか分かると待つのが苦にならない）
    ctx.save();
    ctx.strokeStyle = '#f0abfc';
    ctx.lineWidth = Math.max(2, 0.01 * k);
    ctx.shadowColor = '#c084fc';
    ctx.shadowBlur = 0.04 * k;
    ctx.beginPath();
    ctx.arc(cx, cy, rr * 1.22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, hold / 0.7));
    ctx.stroke();
    ctx.restore();
  }
}

/** 的。倒れたものは沈んだスリットにして「また出てくる」と分かるようにする */
function drawTargets(ctx: CanvasRenderingContext2D, s: PinballState, fx: Fx, k: number): void {
  s.targets.forEach((t, i) => {
    const x = t.x * k;
    const y = t.y * k;
    const tw = t.w * k;
    const th = t.h * k;
    if (t.down) {
      ctx.fillStyle = 'rgba(2, 6, 23, 0.55)';
      roundedRect(ctx, x, y + th * 0.35, tw, th * 0.4, th * 0.2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      return;
    }
    const g = ctx.createLinearGradient(0, y, 0, y + th);
    g.addColorStop(0, '#fde68a');
    g.addColorStop(0.5, '#fbbf24');
    g.addColorStop(1, '#b45309');
    ctx.fillStyle = g;
    roundedRect(ctx, x, y, tw, th, th * 0.32);
    ctx.fill();

    const flash = fx.targets[i] ?? 0;
    if (flash > 0.01) {
      ctx.save();
      ctx.globalAlpha = flash;
      ctx.fillStyle = '#fffbeb';
      roundedRect(ctx, x, y, tw, th, th * 0.32);
      ctx.fill();
      ctx.restore();
    }
  });
}

/** バンパー。当たると白く光って一回り大きい輪が広がる */
function drawBumpers(ctx: CanvasRenderingContext2D, s: PinballState, fx: Fx, k: number): void {
  s.bumpers.forEach((b, i) => {
    const cx = b.x * k;
    const cy = b.y * k;
    const r = b.r * k;
    const flash = fx.bumpers[i] ?? 0;

    // 影（真下に少しずらす）
    ctx.fillStyle = 'rgba(2, 6, 23, 0.5)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.22, r, r * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();

    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.15, cx, cy, r);
    g.addColorStop(0, '#bae6fd');
    g.addColorStop(0.45, '#38bdf8');
    g.addColorStop(1, '#0369a1');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(224, 242, 254, 0.75)';
    ctx.lineWidth = Math.max(1, 0.005 * k);
    ctx.stroke();

    // キャップ
    ctx.fillStyle = flash > 0.01 ? '#f8fafc' : '#0c1a2e';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
    ctx.fill();

    if (flash > 0.01) {
      ctx.save();
      ctx.globalAlpha = flash;
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = Math.max(1.5, 0.008 * k);
      ctx.beginPath();
      ctx.arc(cx, cy, r * (1 + (1 - flash) * 0.55), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  });
}

/** フリッパー。根元が太く先が細い板にして、ただの棒に見えないようにする */
function drawFlippers(ctx: CanvasRenderingContext2D, s: PinballState, k: number): void {
  for (const f of s.flippers) {
    const tip = flipperTip(f);
    const dx = tip.x - f.pivotX;
    const dy = tip.y - f.pivotY;
    const len = Math.hypot(dx, dy) || 1;
    // 法線（板の厚みの向き）
    const nx = -dy / len;
    const ny = dx / len;
    const rootR = FLIPPER_R;
    const tipR = FLIPPER_R * 0.62;

    ctx.beginPath();
    ctx.moveTo((f.pivotX + nx * rootR) * k, (f.pivotY + ny * rootR) * k);
    ctx.lineTo((tip.x + nx * tipR) * k, (tip.y + ny * tipR) * k);
    ctx.arc(tip.x * k, tip.y * k, tipR * k, Math.atan2(ny, nx), Math.atan2(-ny, -nx), true);
    ctx.lineTo((f.pivotX - nx * rootR) * k, (f.pivotY - ny * rootR) * k);
    ctx.arc(f.pivotX * k, f.pivotY * k, rootR * k, Math.atan2(-ny, -nx), Math.atan2(ny, nx), true);
    ctx.closePath();

    const g = ctx.createLinearGradient(
      (f.pivotX + nx * rootR) * k,
      (f.pivotY + ny * rootR) * k,
      (f.pivotX - nx * rootR) * k,
      (f.pivotY - ny * rootR) * k,
    );
    g.addColorStop(0, '#f8fafc');
    g.addColorStop(0.55, '#cbd5e1');
    g.addColorStop(1, '#64748b');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.lineWidth = Math.max(1, 0.003 * k);
    ctx.stroke();

    // 支点のリベット
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(f.pivotX * k, f.pivotY * k, rootR * 0.42 * k, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** プランジャー。ばねを描いて「引いて離す」と分かるようにする */
function drawPlunger(ctx: CanvasRenderingContext2D, s: PinballState, k: number): void {
  const top = 1.42 + s.plunger * 0.05;
  const cx = LANE_X * k;

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 0.014 * k;
  ctx.beginPath();
  ctx.moveTo(cx, top * k);
  ctx.lineTo(cx, (top + 0.02) * k);
  ctx.stroke();

  // ばね（引くほど詰まる）
  const coils = 5;
  const from = top + 0.02;
  const to = TABLE_H;
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 0.009 * k;
  ctx.beginPath();
  for (let i = 0; i <= coils * 2; i += 1) {
    const t = i / (coils * 2);
    const y = (from + (to - from) * t) * k;
    const x = cx + (i % 2 === 0 ? -0.026 : 0.026) * k;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/** 球。残像・金属の陰影・接地の影を足して、白い丸から脱する */
function drawBall(ctx: CanvasRenderingContext2D, s: PinballState, fx: Fx, k: number): void {
  const r = BALL_R * k;

  fx.trail.forEach((p, i) => {
    if (i === 0) return;
    ctx.globalAlpha = 0.16 * (1 - i / fx.trail.length);
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(p.x * k, p.y * k, r * (1 - i * 0.07), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  const cx = s.ball.x * k;
  const cy = s.ball.y * k;

  ctx.fillStyle = 'rgba(2, 6, 23, 0.4)';
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.14, cy + r * 0.18, r * 0.98, r * 0.86, 0, 0, Math.PI * 2);
  ctx.fill();

  const g = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.45, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.45, '#dbe3ec');
  g.addColorStop(1, '#7c8ba1');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.beginPath();
  ctx.arc(cx - r * 0.35, cy - r * 0.4, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

/** 浮かび上がる得点。**何点入ったかが分からないと、当たった手応えが出ない** */
function drawPops(ctx: CanvasRenderingContext2D, fx: Fx, k: number): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of fx.pops) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, p.life);
    ctx.font = `700 ${0.036 * k}px system-ui, sans-serif`;
    ctx.fillStyle = '#fef9c3';
    ctx.strokeStyle = 'rgba(2, 6, 23, 0.75)';
    ctx.lineWidth = Math.max(2, 0.008 * k);
    const y = (p.y - (1 - p.life) * 0.09) * k;
    ctx.strokeText(p.text, p.x * k, y);
    ctx.fillText(p.text, p.x * k, y);
    ctx.restore();
  }
}
