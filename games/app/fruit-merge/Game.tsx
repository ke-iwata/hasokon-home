'use client';

import { useEffect, useRef, useState } from 'react';
import {
  aimAt,
  BOX_H,
  BOX_W,
  canDrop,
  debugFill,
  debugLadder,
  drop,
  DROP_Y,
  dropPreviewY,
  FRUITS,
  initialState,
  LINE_Y,
  OVER_LIMIT,
  radiusOf,
  restart,
  step,
  SUBSTEPS,
  type FruitDef,
  type FruitMergeState,
} from '@/lib/fruit-merge';
import { trackToolUse } from '@/lib/analytics';
import { BestBadge, RecordStrip, useRecords } from '@/app/_records/Records';
import { type Improved } from '@/lib/records';

/**
 * フルーツ合体パズルの画面。物理は `lib/fruit-merge.ts`（純関数）にあり、
 * ここは入力と描画だけ。
 *
 * ピンボールと同じく、**ゲーム本体は ref で回して React の状態にしない**。
 * 毎フレーム setState すると再描画で処理落ちする。表示に要る値
 * （スコア・次の果物・局面）だけを、変わったときに React 側へ渡す。
 */

/** 種は毎回変えたいが、SSRとの食い違いを避けるためマウント後に決める */
function freshSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) | 0;
}

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 種はマウント後に入れ替える。初回描画（空の箱）はサーバー側と同じ
  const stateRef = useRef<FruitMergeState>(initialState(1));
  const fxRef = useRef<Fx>(newFx());
  const reducedRef = useRef(false);
  /** サブステップ。重い端末では減らす（仕様書「パフォーマンス」） */
  const substepsRef = useRef(SUBSTEPS);
  const stageRef = useRef<HTMLDivElement>(null);
  /**
   * 箱が画面に入っているか。**キーを受けてよいかの判断に使う。**
   * 初期値は false で、`IntersectionObserver` が最初に呼ばれるまでは受けない
   * （見えていないのに奪うより、一瞬受け損ねるほうが害が小さい）
   */
  const onScreen = useRef(false);
  const [status, setStatus] = useState<FruitMergeState['status']>('playing');
  const [hud, setHud] = useState({ score: 0, next: stateRef.current.next });
  const [debug, setDebug] = useState(false);

  // 記録（ベストスコア。docs/features/game-records.md）。
  // スコア型のゲームなのでタイムは残さない
  const records = useRecords('fruit-merge');
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
    trackToolUse('fruit-merge', 'gameover');
  }, [status, records]);

  useEffect(() => {
    // 種の入れ替えと「動きを減らす」設定の読み取りはブラウザでだけ行う
    stateRef.current = initialState(freshSeed());
    setHud({ score: 0, next: stateRef.current.next });
    reducedRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 公開の条件2（60個の山で震え・すり抜けが出ないこと）を運営者が
    // 確かめるための入口。仕様書「公開の条件」の再現手段
    setDebug(new URLSearchParams(window.location.search).has('debug'));

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };
    resize();
    window.addEventListener('resize', resize);

    /**
     * **箱が画面に入っているあいだだけキーを受ける。**
     *
     * ヘビ（`app/snake/Game.tsx`）と同じ罠だが、あちらの「遊んでいる最中だけ」
     * という絞り方はここでは効かない。**このゲームは既定が `playing`** で、
     * ゲームオーバーまでずっと遊んでいる最中だからだ。
     *
     * 無条件に受けていたときは、解説やFAQを読みながらスペースで送ろうとすると
     * **ページが動かないうえ、画面外の箱に果物が落ちて「プレイ1回」が
     * 記録され、GA4 にも `start` が飛んでいた**（実測：箱から約4700px下で
     * スペースを押してもスクロールせず、記録の帯が1回に増えた）。
     * 計測の観点でも、箱を見ていない人の1打鍵をプレイと数えたくない
     * （docs/features/measurement-hygiene.md）
     */
    const stage = stageRef.current;
    const io = stage
      ? new IntersectionObserver(
          ([entry]) => {
            onScreen.current = entry.isIntersecting;
          },
          // 少しでも見えていれば受ける（端に半分だけ出ている状態でも遊べるように）
          { threshold: 0 },
        )
      : null;
    if (io && stage) io.observe(stage);

    // キーボード: ← → で狙いを動かし、スペース／↓ で落とす
    const onKey = (e: KeyboardEvent) => {
      // 見えていないときは `preventDefault` もしない（スクロールを奪わない）
      if (!onScreen.current) return;
      const k = e.key.toLowerCase();
      const s = stateRef.current;
      if (k === 'arrowleft' || k === 'a') stateRef.current = aimAt(s, s.aim - 0.04);
      else if (k === 'arrowright' || k === 'd') stateRef.current = aimAt(s, s.aim + 0.04);
      else if (k === ' ' || k === 'enter' || k === 'arrowdown') doDrop();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);

    let raf = 0;
    let last = performance.now();
    // 直近のフレーム時間の平均。重い端末を見分けてサブステップを減らす
    let avg = 1 / 60;
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      avg = avg * 0.9 + Math.min(dt, 1 / 10) * 0.1;
      // 60fps を割り続けるようなら物理を粗くする。見た目より操作の追従を優先する
      substepsRef.current = avg > 1 / 45 ? 2 : SUBSTEPS;

      const prev = stateRef.current;
      const next = step(prev, dt, substepsRef.current);
      stateRef.current = next;

      if (next.status !== prev.status) setStatus(next.status);
      if (next.score !== prev.score || next.next !== prev.next) {
        setHud({ score: next.score, next: next.next });
      }

      updateFx(fxRef.current, next, Math.min(dt, 1 / 20), reducedRef.current);
      draw(ctx, canvas, next, fxRef.current, reducedRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKey);
    };
    // 落とす関数は ref だけを触るので依存に入れない（入れるとループを張り直す）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 1手目を1プレイとして数える（ピンボール・ヨットと同じ扱い） */
  const countPlay = () => {
    if (counted.current) return;
    counted.current = true;
    records.start();
    trackToolUse('fruit-merge', 'start');
  };

  const doDrop = () => {
    const s = stateRef.current;
    if (!canDrop(s)) return;
    countPlay();
    stateRef.current = drop(s);
  };

  /** 指・マウスの位置を箱の座標（0〜1）に直す */
  const aimFrom = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    stateRef.current = aimAt(stateRef.current, ((clientX - rect.left) / rect.width) * BOX_W);
  };

  const retry = () => {
    stateRef.current = restart(freshSeed());
    fxRef.current = newFx();
    setStatus('playing');
    setHud({ score: 0, next: stateRef.current.next });
    setResult(null);
    recorded.current = false;
    counted.current = false;
    trackToolUse('fruit-merge', 'retry');
  };

  const nextFruit = FRUITS[hud.next];

  return (
    <div className="card">
      {/* **この行は1行に収める。** スコアと予告が1行に収まらないと、
          320×568 で箱が画面から出る（実測：2行になると card が 574px、
          1行なら 538px）。連鎖の知らせはここに置かず、合体した場所に
          浮かぶ得点（`drawPops`）で見せている */}
      <div className="status-bar fm-bar">
        <span>
          スコア: <strong style={{ color: 'var(--text)' }}>{hud.score}</strong>
        </span>
        <span className="fm-next">
          つぎ
          <FruitChip fruit={nextFruit} />
          <span className="fm-next-name">{nextFruit.name}</span>
        </span>
      </div>

      {/* **1回も遊んでいなくても出す**（0 / 0回）。記録ができた瞬間に帯が現れると、
          箱が34px押し下げられて画面から出る（games/CLAUDE.md「画面の約束」の1） */}
      <RecordStrip
        items={[
          { label: 'ベストスコア', value: String(best) },
          { label: 'プレイ', value: `${entry.plays ?? 0}回` },
        ]}
      />

      <div className="fm-stage" ref={stageRef}>
        {/* **指の受け口は canvas 自身に付ける。**
            外側の枠に付けると、枠が `setPointerCapture` で指をつかんだまま
            になり、上に重ねた「もう一度」のボタンが押せなくなる
            （押しても click が枠の側に飛んで、ボタンの onClick が呼ばれない。
            実測でゲームオーバーから復帰できなかった）。
            canvas はゲームオーバーの覆いの下に隠れるので、この付け方なら
            覆いが出ているあいだは箱に触れないという意味にもなる */}
        <canvas
          ref={canvasRef}
          aria-label="フルーツ合体パズルの箱"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            aimFrom(e.clientX);
          }}
          onPointerMove={(e) => {
            // 押していなくても狙いは動かす（マウスで狙いが見えるほうが分かりやすい）
            aimFrom(e.clientX);
          }}
          onPointerUp={(e) => {
            aimFrom(e.clientX);
            doDrop();
          }}
        />

        {status === 'gameover' && (
          <div className="fm-overlay">
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

      {debug && (
        <div className="btn-row fm-debug">
          <button
            type="button"
            className="btn"
            onClick={() => {
              stateRef.current = debugFill(stateRef.current, 60);
            }}
          >
            60個積む（確認用）
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              stateRef.current = debugLadder(stateRef.current);
            }}
          >
            11段を並べる（確認用）
          </button>
          <button type="button" className="btn" onClick={retry}>
            空にする
          </button>
        </div>
      )}

      <details className="game-tips">
        <summary>この画面の見かた</summary>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>
          箱を左右になぞって落とす場所を決め、指を離すと落ちます。点線は
          <strong>落ちる先</strong>の目安です。同じ果物どうしが触れると
          <strong>1段大きい果物</strong>になり、続けて合体すると
          <strong>連鎖</strong>で点が伸びます。上の<strong>赤い線</strong>を果物が
          {OVER_LIMIT}秒こえたままだと終わりで、こえているあいだは線が点滅します。
          いちばん大きい{FRUITS[FRUITS.length - 1].name}どうしは、合体すると消えてボーナスです。
        </p>
      </details>
    </div>
  );
}

/** 次に落ちる果物の丸。**大きさは段によらず一定**（行の高さを変えないため） */
function FruitChip({ fruit }: { fruit: FruitDef }) {
  return (
    <span
      className="fm-chip"
      aria-hidden="true"
      style={{ background: `radial-gradient(circle at 35% 30%, ${fruit.light}, ${fruit.dark})` }}
    />
  );
}

/* ------------------------------------------------------------------ *
 * 演出（描画だけの値）
 * ------------------------------------------------------------------ */

/**
 * 合体の余韻。**`FruitMergeState` には持たせない**
 * （物理の状態に演出を混ぜると、テストがUIの都合で壊れるようになる。
 * games/CLAUDE.md「画面の約束」の9）。
 */
interface Fx {
  /** 生まれたばかりの果物の膨らみ。果物の id → 残量（1で生まれた直後） */
  born: Map<number, number>;
  /** 合体した場所に広がる輪 */
  rings: { x: number; y: number; r: number; life: number }[];
  /** 浮かび上がる得点 */
  pops: { x: number; y: number; text: string; life: number }[];
  /** 警告の点滅に使う時計 */
  clock: number;
}

function newFx(): Fx {
  return { born: new Map(), rings: [], pops: [], clock: 0 };
}

/** 位置がいちばん近い果物。合体イベントは id を持たないので位置から当てる */
function nearestId(state: FruitMergeState, tier: number, x: number, y: number): number | null {
  let id: number | null = null;
  let bestD = Infinity;
  for (const f of state.fruits) {
    if (f.tier !== tier) continue;
    const d = (f.x - x) ** 2 + (f.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      id = f.id;
    }
  }
  return id;
}

function updateFx(fx: Fx, s: FruitMergeState, dt: number, reduced: boolean): void {
  fx.clock += dt;

  for (const [id, v] of fx.born) {
    const next = v - dt * 3.2;
    if (next <= 0) fx.born.delete(id);
    else fx.born.set(id, next);
  }
  for (let i = fx.rings.length - 1; i >= 0; i -= 1) {
    fx.rings[i].life -= dt * 2.2;
    if (fx.rings[i].life <= 0) fx.rings.splice(i, 1);
  }
  for (let i = fx.pops.length - 1; i >= 0; i -= 1) {
    fx.pops[i].life -= dt * 1.2;
    if (fx.pops[i].life <= 0) fx.pops.splice(i, 1);
  }

  for (const e of s.events) {
    // **動きを減らす設定のときは合体エフェクトを省く**（仕様書「パフォーマンス」）。
    // 点の表示だけは残す（何点入ったか分からないと手応えが無い）
    if (!reduced) {
      if (e.tier >= 0) {
        const id = nearestId(s, e.tier, e.x, e.y);
        if (id !== null) fx.born.set(id, 1);
      }
      fx.rings.push({ x: e.x, y: e.y, r: e.tier >= 0 ? radiusOf(e.tier) : radiusOf(10), life: 1 });
      if (fx.rings.length > 8) fx.rings.shift();
    }
    if (fx.pops.length > 6) fx.pops.shift();
    fx.pops.push({
      x: e.x,
      y: e.y,
      text: e.chain >= 2 ? `${e.chain}連鎖 +${e.gain}` : `+${e.gain}`,
      life: 1,
    });
  }
}

/* ------------------------------------------------------------------ *
 * 描画
 * ------------------------------------------------------------------ */

/**
 * 正規化座標（幅1×高さ1.5）の状態をcanvasのピクセルへ拡大して描く。
 *
 * **拡大率は幅だけから出す**（canvas の縦横比を 1:1.5 に固定してあるので、
 * 幅を掛ければ縦もそろう）。座標の意味は `lib/fruit-merge.ts` を見ること。
 */
function draw(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  s: FruitMergeState,
  fx: Fx,
  reduced: boolean,
): void {
  const w = canvas.width;
  const h = canvas.height;
  const k = w / BOX_W;
  ctx.clearRect(0, 0, w, h);

  drawBox(ctx, w, h, k);
  drawLine(ctx, s, fx, k);
  if (s.status === 'playing') drawGuide(ctx, s, k);
  for (const f of s.fruits) {
    drawFruit(ctx, k, f.tier, f.x, f.y, 1 + (fx.born.get(f.id) ?? 0) * 0.22);
  }
  if (s.status === 'playing') drawFruit(ctx, k, s.hold, s.aim, DROP_Y, 1);
  if (!reduced) drawRings(ctx, fx, k);
  drawPops(ctx, fx, k);
}

/** 箱の地。上が明るい木箱のような地にして、果物の色を沈ませない */
function drawBox(ctx: CanvasRenderingContext2D, w: number, h: number, k: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#3b2f47');
  g.addColorStop(0.45, '#2a2138');
  g.addColorStop(1, '#181226');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // 底に敷いた影。果物が「箱の中にある」と分かる
  const floor = ctx.createLinearGradient(0, (BOX_H - 0.25) * k, 0, BOX_H * k);
  floor.addColorStop(0, 'rgba(0, 0, 0, 0)');
  floor.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
  ctx.fillStyle = floor;
  ctx.fillRect(0, (BOX_H - 0.25) * k, w, 0.25 * k);

  // 壁ぎわの縦の陰。左右の板があるように見せる
  for (const [x, dir] of [
    [0, 1],
    [BOX_W, -1],
  ] as const) {
    const side = ctx.createLinearGradient(x * k, 0, (x + dir * 0.06) * k, 0);
    side.addColorStop(0, 'rgba(0, 0, 0, 0.28)');
    side.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = side;
    ctx.fillRect(dir > 0 ? 0 : (BOX_W - 0.06) * k, 0, 0.06 * k, h);
  }
}

/**
 * ゲームオーバーライン。**常時出しておき、超えているあいだは点滅させる**
 * （突然死の理不尽感を消す。仕様書「遊びやすさ」）
 */
function drawLine(ctx: CanvasRenderingContext2D, s: FruitMergeState, fx: Fx, k: number): void {
  const warn = s.status === 'playing' && s.overSec > 0;
  const y = LINE_Y * k;

  ctx.save();
  ctx.setLineDash([0.03 * k, 0.024 * k]);
  ctx.lineWidth = Math.max(1.5, 0.008 * k);
  if (warn) {
    // 残り時間が減るほど速く点滅する（あとどれくらいかが伝わる）
    const speed = 6 + (s.overSec / OVER_LIMIT) * 10;
    ctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(fx.clock * speed));
    ctx.strokeStyle = '#f87171';
  } else {
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#fbbf24';
  }
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(BOX_W * k, y);
  ctx.stroke();
  ctx.restore();
}

/**
 * 落下予測線。縦の点線と、着地するところの薄い輪。
 * **タップ操作でも狙いがつけられるようにするための線**（仕様書「遊びやすさ」）
 */
function drawGuide(ctx: CanvasRenderingContext2D, s: FruitMergeState, k: number): void {
  const r = radiusOf(s.hold);
  const x = s.aim * k;
  const landing = dropPreviewY(s);

  ctx.save();
  ctx.setLineDash([0.016 * k, 0.018 * k]);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
  ctx.lineWidth = Math.max(1, 0.005 * k);
  ctx.beginPath();
  ctx.moveTo(x, (DROP_Y + r) * k);
  ctx.lineTo(x, landing * k);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.arc(x, landing * k, r * k, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * 果物1つ。**丸い実＋へた・葉だけのフラットな絵**にしてある。
 * 顔つきのデフォルメは同系の商品の意匠なので真似ない
 * （docs/features/game-fruit-merge.md の「名称・権利の注意」）
 */
function drawFruit(
  ctx: CanvasRenderingContext2D,
  k: number,
  tier: number,
  fx: number,
  fy: number,
  scale: number,
): void {
  const def = FRUITS[Math.max(0, Math.min(FRUITS.length - 1, tier))];
  const r = radiusOf(tier) * k * scale;
  const cx = fx * k;
  const cy = fy * k;

  // 接地の影
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.1, cy + r * 0.16, r * 0.98, r * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();

  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.12, cx, cy, r);
  g.addColorStop(0, def.light);
  g.addColorStop(1, def.dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  drawDeco(ctx, def, cx, cy, r);

  // 光沢。1つ入れるだけで「平らな丸」から抜ける
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.36, cy - r * 0.42, r * 0.2, r * 0.14, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

/** 果物ごとの飾り。段の見分けを色だけに頼らないための描き分け */
function drawDeco(
  ctx: CanvasRenderingContext2D,
  def: FruitDef,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.save();
  ctx.strokeStyle = def.stem;
  ctx.lineWidth = Math.max(1, r * 0.11);
  ctx.lineCap = 'round';

  if (def.deco === 'stem' || def.deco === 'leaf') {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.86);
    ctx.quadraticCurveTo(cx + r * 0.14, cy - r * 1.15, cx + r * 0.05, cy - r * 1.3);
    ctx.stroke();
  }
  if (def.deco === 'leaf') {
    ctx.fillStyle = def.stem;
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.42, cy - r * 1.02, r * 0.34, r * 0.16, -0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  if (def.deco === 'dots') {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    for (const [dx, dy] of [
      [-0.3, 0.1],
      [0.24, -0.12],
      [0.02, 0.42],
    ]) {
      ctx.beginPath();
      ctx.ellipse(cx + dx * r, cy + dy * r, r * 0.09, r * 0.13, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (def.deco === 'net') {
    /**
     * メロンの網目。**左右対称にしないのが肝。**
     *
     * 中心をそろえた楕円を重ねる描き方（縦の筋・斜めの輪）はどちらも
     * 原子模型の記号に見えてしまった。実物の網は不規則な筋なので、
     * 端点をばらした短い線をつないで描く。円からはみ出さないよう切り抜く
     */
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.94, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = Math.max(1, r * 0.05);
    for (const [x1, y1, x2, y2] of [
      [-1, -0.35, 0.1, -0.62],
      [0.1, -0.62, 1, -0.2],
      [-1, 0.12, -0.15, -0.05],
      [-0.15, -0.05, 0.7, 0.3],
      [-0.55, -0.9, -0.3, 0.1],
      [-0.3, 0.1, -0.45, 1],
      [0.42, -0.9, 0.28, -0.1],
      [0.28, -0.1, 0.5, 0.95],
      [-0.85, 0.55, 0.05, 0.42],
      [0.05, 0.42, 0.95, 0.7],
    ]) {
      ctx.beginPath();
      ctx.moveTo(cx + x1 * r, cy + y1 * r);
      ctx.lineTo(cx + x2 * r, cy + y2 * r);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (def.deco === 'crown') {
    // パイナップルの冠。上に3枚の葉を立てる
    ctx.fillStyle = def.stem;
    for (const a of [-0.5, 0, 0.5]) {
      ctx.save();
      ctx.translate(cx, cy - r * 0.88);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.26, r * 0.11, r * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // 実の表面の格子
    ctx.strokeStyle = 'rgba(120, 53, 15, 0.4)';
    ctx.lineWidth = Math.max(1, r * 0.05);
    for (const a of [-0.7, 0.7]) {
      for (const off of [-0.45, 0, 0.45]) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(-r * 0.8, off * r);
        ctx.lineTo(r * 0.8, off * r);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
  ctx.restore();
}

/** 合体した場所に広がる輪。**軽い演出にとどめる**（エフェクト過多にしない） */
function drawRings(ctx: CanvasRenderingContext2D, fx: Fx, k: number): void {
  for (const ring of fx.rings) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, ring.life) * 0.55;
    ctx.strokeStyle = '#fef3c7';
    ctx.lineWidth = Math.max(1.5, 0.008 * k);
    ctx.beginPath();
    ctx.arc(ring.x * k, ring.y * k, ring.r * k * (1 + (1 - ring.life) * 0.9), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/** 浮かび上がる得点。**何点入ったかが分からないと、合体の手応えが出ない** */
function drawPops(ctx: CanvasRenderingContext2D, fx: Fx, k: number): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of fx.pops) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, p.life);
    ctx.font = `700 ${0.042 * k}px system-ui, sans-serif`;
    ctx.fillStyle = '#fef9c3';
    ctx.strokeStyle = 'rgba(24, 18, 38, 0.8)';
    ctx.lineWidth = Math.max(2, 0.008 * k);
    const y = (p.y - (1 - p.life) * 0.1) * k;
    ctx.strokeText(p.text, p.x * k, y);
    ctx.fillText(p.text, p.x * k, y);
    ctx.restore();
  }
}
