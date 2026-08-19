/**
 * ピンボールの物理・進行ロジック
 *
 * 描画（canvas）から切り離した純関数のステート機械。ブロック崩し
 * （`lib/breakout.ts`）と同じ作りで、UI側は毎フレーム `step()` を呼んで
 * 返ってきた状態を描くだけにする。こうしておくと反射やフリッパーの
 * 打ち返しをテストできる。
 *
 * 座標系は**幅1×高さ1.5**の正規化空間。原点は左上、yは下向きに正。
 * ブロック崩しは幅1×高さ1だったが、ピンボールは重力が効くので、
 * 縦横比を座標に持たせないと「重力が縦横で違う強さになる」。
 * 描画側は canvas の縦横比を 2:3 に固定して、この座標をそのまま拡大する。
 *
 * 台の名前は一般名詞の「ピンボール」。特定製品の盤面・意匠は真似ない
 * （games/CLAUDE.md の商標の約束）。
 */

export const TABLE_H = 1.5;
export const BALL_R = 0.022;

/** 重力（1秒²あたり）。台の高さ1.5を約1.2秒で落ちる強さ */
const GRAVITY = 2.2;
/**
 * 球の速さの上限。これが無いと、バンパーの蹴り出しとフリッパーの
 * 打ち返しが重なったときに1フレームで壁を突き抜ける
 */
const MAX_SPEED = 3.6;
/**
 * 1フレームを何回に割って進めるか。球は速く、当たり判定は「その瞬間に
 * 重なっているか」しか見ていないので、1回で進めると薄い壁を抜ける。
 * dt上限 1/30 秒 ÷ 6 で、最速でも1回の移動は 0.02（球の半径以下）
 */
const SUBSTEPS = 6;
/** 転がり摩擦。入れないと球がいつまでも減速せず、台の中で暴れ続ける */
const FRICTION = 0.12;

export interface Ball {
  x: number;
  y: number;
  /** 1秒あたりの移動量 */
  vx: number;
  vy: number;
}

/** 壁。線分に太さ（`radius`）を持たせたカプセルとして当てる */
export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 反発係数。1で完全弾性、0で貼り付く */
  bounce: number;
  /** 当たった瞬間に法線方向へ足す速さ（スリングショットの蹴り出し） */
  kick: number;
  kind: 'wall' | 'kicker';
}

export interface Bumper {
  x: number;
  y: number;
  r: number;
}

/** 的。全部倒すと倍率が上がって復活する */
export interface Target {
  x: number;
  y: number;
  w: number;
  h: number;
  down: boolean;
}

/**
 * スピナー。プランジャーのレーンの途中に立てた回転板。
 *
 * 球が通り抜けるたびに回り、回っているあいだ点が入る（勢いが強いほど長く回る）。
 * **通り抜けを妨げない**——当たり判定を持たせると打ち出しが台の上まで届かなくなるので、
 * 「線をまたいだか」だけを見て加点する。
 */
export interface Spinner {
  x: number;
  /** レーンを横切る線の高さ */
  y: number;
  /** 線の幅（レーンの内寸） */
  w: number;
  /** 描画用の回転角（ラジアン） */
  angle: number;
  /** 残りの回転の勢い（0で止まる） */
  spin: number;
}

/**
 * 吸い込みホール（サドン）。落ちた球をしばらく抱えてから撃ち出す。
 *
 * **抱えているあいだ球は落ちない**ので、遊びに「ひと呼吸」が生まれる。
 * 撃ち出したあとに入り口へ戻って即再捕獲されないよう、`cool` を置いてある
 * （これが無いと吸い込み → 撃ち出し → 吸い込みを繰り返して抜け出せない）
 */
export interface Saucer {
  x: number;
  y: number;
  r: number;
  /** 抱えている残り秒数（0なら空） */
  hold: number;
  /** 撃ち出した直後の無効時間（秒） */
  cool: number;
}

/** 天井のレーン。3つ全部を通すとボーナスと倍率が上がる */
export interface Lane {
  x: number;
  y: number;
  w: number;
  lit: boolean;
}

export interface Flipper {
  pivotX: number;
  pivotY: number;
  length: number;
  /** 離しているときの角度（ラジアン。+x方向が0、yは下向き） */
  restAngle: number;
  /** 押しているときの角度 */
  upAngle: number;
  /** いまの角度 */
  angle: number;
}

export type HitKind =
  | 'bumper'
  | 'kicker'
  | 'target'
  | 'clear'
  | 'drain'
  | 'launch'
  | 'spinner'
  | 'saucer'
  | 'lane'
  | 'laneClear';

export interface PinballState {
  ball: Ball;
  /** [左, 右] */
  flippers: [Flipper, Flipper];
  bumpers: Bumper[];
  targets: Target[];
  spinner: Spinner;
  saucer: Saucer;
  lanes: Lane[];
  score: number;
  /** 残りの球（打ち出し前の球を含む） */
  balls: number;
  /** 得点の倍率。的を全部倒すと上がり、球を落とすと1に戻る */
  multiplier: number;
  status: 'ready' | 'playing' | 'gameover';
  /** プランジャーの引き具合（0〜1）。`ready` のあいだだけ動く */
  plunger: number;
  /** このフレームで起きた当たり。UIの演出用で、状態の判断には使わない */
  hits: HitKind[];
  /** ほとんど動かなくなってからの秒数（詰まり対策。`nudge` の判断に使う） */
  restSec: number;
}

export interface PinballInput {
  left: boolean;
  right: boolean;
  /** プランジャーを引いている（離した瞬間に打ち出す） */
  plunger: boolean;
}

/** 壁の太さ。線分に厚みを持たせて、球が角に刺さらないようにする */
export const WALL_R = 0.012;
export const FLIPPER_R = 0.016;

/** プランジャーのレーン（右端の縦通路）。球はここから打ち出す */
export const LANE_X = 0.92;
const LANE_LEFT = 0.87;
const BALL_START_Y = 1.4;

/** 打ち出しの速さ。引かなくても台の上まで届く強さを下限にしてある
    （届かないと球がレーンに落ちて戻るだけで、遊びが止まる） */
const LAUNCH_MIN = 2.45;
const LAUNCH_ADD = 0.75;
/** プランジャーを引く速さ（1秒で満タン） */
const PLUNGER_RATE = 1;

/** フリッパーが振れる速さ（ラジアン/秒） */
const FLIPPER_OMEGA = 16;

const SLING_BOUNCE = 0.5;
const SLING_KICK = 0.55;
const BUMPER_KICK = 1.15;

/** 得点。倍率を掛ける前の素点 */
const POINTS = {
  bumper: 100,
  kicker: 10,
  target: 250,
  clear: 1000,
  /** スピナーは半回転ごと。強く打つほど長く回るので、打ち出しの手応えになる */
  spinner: 60,
  saucer: 500,
  lane: 50,
  laneClear: 1000,
} as const;

/** スピナーの回りかた。`spin` は「残りの回転量（ラジアン）」で、毎秒この割合で減る */
const SPIN_PER_SPEED = 26;
const SPIN_DECAY = 1.6;
/** 吸い込みホールが球を抱える秒数と、撃ち出したあと吸わない秒数 */
const SAUCER_HOLD = 0.7;
const SAUCER_COOL = 0.6;
/** 吸い込みホールから撃ち出す速さ（上のバンパー地帯へ送り込む強さ） */
const SAUCER_KICK = 2.35;

/**
 * 台の壁。
 *
 * 右端はプランジャーのレーンで、外側の壁が上で左へ回り込んでいる。
 * 打ち出した球はレーンを上ってこの回り込みに当たり、盤面へ流れ込む。
 * レーンの内側の壁は y=0.34 で終わっていて、そこから上が出口になる。
 */
export const WALLS: Segment[] = [
  // 天井と左の壁
  wall(0.03, 0.05, 0.03, 1.02),
  wall(0.03, 0.05, 0.74, 0.05),
  // 右上の回り込み（円弧を線分で近似）
  wall(0.74, 0.05, 0.88, 0.11),
  wall(0.88, 0.11, 0.95, 0.21),
  wall(0.95, 0.21, 0.97, 0.34),
  // レーンの外側と内側。**内側は y=0.34 から下だけ**。
  // ここに上まで壁を立てると、打ち出した球が盤面へ出られなくなる
  wall(0.97, 0.34, 0.97, 1.45),
  wall(LANE_LEFT, 0.34, LANE_LEFT, 1.45),
  // フリッパーの上の斜面。ここは蹴り返す（スリングショット）
  kicker(0.03, 1.02, 0.21, 1.31),
  kicker(0.87, 1.02, 0.69, 1.31),
];

function wall(x1: number, y1: number, x2: number, y2: number): Segment {
  return { x1, y1, x2, y2, bounce: 0.42, kick: 0, kind: 'wall' };
}

function kicker(x1: number, y1: number, x2: number, y2: number): Segment {
  return { x1, y1, x2, y2, bounce: SLING_BOUNCE, kick: SLING_KICK, kind: 'kicker' };
}

/**
 * バンパー。上の3つが本体で、下の2つは的の下に置いた小さめの返し。
 * 下の2つが無いと的からフリッパーまでが素通りの空白になり、
 * 落ちてくる球にさわれる場所が無い（見た目も間延びする）
 */
export function buildBumpers(): Bumper[] {
  return [
    { x: 0.28, y: 0.4, r: 0.055 },
    { x: 0.5, y: 0.27, r: 0.055 },
    { x: 0.68, y: 0.42, r: 0.055 },
    { x: 0.18, y: 0.92, r: 0.038 },
    { x: 0.74, y: 0.92, r: 0.038 },
  ];
}

export function buildTargets(): Target[] {
  return [0.14, 0.32, 0.5, 0.68].map((x) => ({ x, y: 0.68, w: 0.11, h: 0.03, down: false }));
}

/**
 * スピナーはレーンの中に置く。打ち出した球が**必ず**通るので、
 * 「強く打つと長く回って点が伸びる」が打ち出しの手応えになる
 */
export function buildSpinner(): Spinner {
  return { x: LANE_X, y: 0.72, w: 0.085, angle: 0, spin: 0 };
}

/**
 * 吸い込みホールは盤面のまんなか（バンパーと的のあいだ）。
 * ここは元は素通りの空白で、落ちてくる球にさわれる場所が無かった
 */
export function buildSaucer(): Saucer {
  return { x: 0.5, y: 0.55, r: 0.042, hold: 0, cool: 0 };
}

/** 天井のレーン。打ち出した球が回り込みから流れ込む道の途中に置く */
export function buildLanes(): Lane[] {
  return [0.17, 0.35, 0.53].map((x) => ({ x, y: 0.17, w: 0.12, lit: false }));
}

/**
 * フリッパー。支点は左右の斜面（`kicker`）の下端に合わせる。
 *
 * **先端どうしの隙間は球3つぶんは空けること。** 隙間が球1〜2つぶんだと、
 * 両方を連打しているだけで球が落ちなくなり（実測で90秒たっても落ちない）、
 * 遊びとして成立しない。無操作なら約6秒、連打しても20〜40秒で落ちる幅にしてある
 */
function buildFlippers(): [Flipper, Flipper] {
  return [
    { pivotX: 0.21, pivotY: 1.31, length: 0.185, restAngle: 0.5, upAngle: -0.42, angle: 0.5 },
    {
      pivotX: 0.69,
      pivotY: 1.31,
      length: 0.185,
      restAngle: Math.PI - 0.5,
      upAngle: Math.PI + 0.42,
      angle: Math.PI - 0.5,
    },
  ];
}

/** レーンの底で打ち出しを待つ球 */
function waitingBall(): Ball {
  return { x: LANE_X, y: BALL_START_Y, vx: 0, vy: 0 };
}

export function initialState(): PinballState {
  return {
    ball: waitingBall(),
    flippers: buildFlippers(),
    bumpers: buildBumpers(),
    targets: buildTargets(),
    spinner: buildSpinner(),
    saucer: buildSaucer(),
    lanes: buildLanes(),
    score: 0,
    balls: 3,
    multiplier: 1,
    status: 'ready',
    plunger: 0,
    hits: [],
    restSec: 0,
  };
}

/** フリッパーの先端の座標（描画と当たり判定の両方で使う） */
export function flipperTip(f: Flipper): { x: number; y: number } {
  return { x: f.pivotX + Math.cos(f.angle) * f.length, y: f.pivotY + Math.sin(f.angle) * f.length };
}

interface Contact {
  nx: number;
  ny: number;
  depth: number;
  /** 接触点（フリッパーの表面速度を出すのに使う） */
  px: number;
  py: number;
}

/** 円（球）と線分の接触。重なっていなければ null */
export function contactSegment(
  ball: Ball,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  radius: number,
): Contact | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((ball.x - x1) * dx + (ball.y - y1) * dy) / len2));
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  let nx = ball.x - px;
  let ny = ball.y - py;
  let d = Math.hypot(nx, ny);
  const reach = BALL_R + radius;
  if (d > reach) return null;
  if (d < 1e-9) {
    // 中心が線分の上に乗った（真上から刺さった）ときは、線分の法線を使う
    const l = Math.hypot(dx, dy) || 1;
    nx = -dy / l;
    ny = dx / l;
    d = 1e-9;
  } else {
    nx /= d;
    ny /= d;
  }
  return { nx, ny, depth: reach - d, px, py };
}

/** 矩形（的）と球の接触 */
function contactRect(ball: Ball, t: Target): Contact | null {
  const px = Math.max(t.x, Math.min(ball.x, t.x + t.w));
  const py = Math.max(t.y, Math.min(ball.y, t.y + t.h));
  let nx = ball.x - px;
  let ny = ball.y - py;
  const d = Math.hypot(nx, ny);
  if (d > BALL_R) return null;
  if (d < 1e-9) {
    // 中心が矩形の中に入り込んだ。いちばん近い辺へ押し出す
    ny = ball.y < t.y + t.h / 2 ? -1 : 1;
    return { nx: 0, ny, depth: BALL_R, px, py };
  }
  return { nx: nx / d, ny: ny / d, depth: BALL_R - d, px, py };
}

/**
 * 接触を1つ解く。球を面の外へ押し出し、法線方向の速度を跳ね返す。
 *
 * @param surfaceVx 面そのものの速度（フリッパーの振りを球に伝えるのに使う）
 * @returns 近づく向きの相対速度（0なら離れていく＝実際には当たっていない）
 */
function resolve(
  ball: Ball,
  c: Contact,
  bounce: number,
  kick: number,
  surfaceVx = 0,
  surfaceVy = 0,
): number {
  ball.x += c.nx * c.depth;
  ball.y += c.ny * c.depth;
  const rvx = ball.vx - surfaceVx;
  const rvy = ball.vy - surfaceVy;
  const vn = rvx * c.nx + rvy * c.ny;
  if (vn >= 0) return 0;
  ball.vx -= (1 + bounce) * vn * c.nx;
  ball.vy -= (1 + bounce) * vn * c.ny;
  if (kick > 0) {
    ball.vx += c.nx * kick;
    ball.vy += c.ny * kick;
  }
  return -vn;
}

function clampSpeed(ball: Ball): void {
  const s = Math.hypot(ball.vx, ball.vy);
  if (s > MAX_SPEED) {
    ball.vx = (ball.vx / s) * MAX_SPEED;
    ball.vy = (ball.vy / s) * MAX_SPEED;
  }
}

/** 目標の角度へ、決まった速さで近づける */
function moveFlipper(f: Flipper, pressed: boolean, dt: number): Flipper {
  const target = pressed ? f.upAngle : f.restAngle;
  const diff = target - f.angle;
  const max = FLIPPER_OMEGA * dt;
  const angle = Math.abs(diff) <= max ? target : f.angle + Math.sign(diff) * max;
  return { ...f, angle };
}

/**
 * 1フレーム進める。
 *
 * @param state 現在の状態（変更しない）
 * @param dt 経過秒（requestAnimationFrame の間隔。上限を設けて突き抜けを防ぐ）
 * @param input フリッパーとプランジャーの押し具合
 */
export function step(state: PinballState, dt: number, input: PinballInput): PinballState {
  const clamped = Math.min(Math.max(dt, 0), 1 / 30);
  if (state.status === 'gameover') return state.hits.length ? { ...state, hits: [] } : state;

  const hits: HitKind[] = [];
  let flippers = state.flippers;
  let plunger = state.plunger;
  // スピナーは球と関係なく惰性で回り続ける（打ち出したあとの余韻）。
  // 点は「回った分」に付くので、回転の管理は状態の側に置く
  const spinner = spinDown(state.spinner, clamped);

  // ---- 打ち出し前。プランジャーを引いて、離した瞬間に打ち出す
  if (state.status === 'ready') {
    if (input.plunger) {
      return {
        ...state,
        hits: [],
        spinner,
        plunger: Math.min(1, plunger + PLUNGER_RATE * clamped),
        ball: waitingBall(),
        flippers: swingBoth(flippers, input, clamped),
      };
    }
    if (plunger > 0) {
      return {
        ...state,
        status: 'playing',
        plunger: 0,
        restSec: 0,
        hits: ['launch'],
        spinner,
        ball: { x: LANE_X, y: BALL_START_Y, vx: 0, vy: -(LAUNCH_MIN + LAUNCH_ADD * plunger) },
        flippers: swingBoth(flippers, input, clamped),
      };
    }
    return {
      ...state,
      hits: [],
      spinner,
      ball: waitingBall(),
      flippers: swingBoth(flippers, input, clamped),
    };
  }

  // ---- 遊んでいる最中
  const ball: Ball = { ...state.ball };
  let targets = state.targets;
  let lanes = state.lanes;
  let saucer = { ...state.saucer, cool: Math.max(0, state.saucer.cool - clamped) };
  let score = state.score;
  let multiplier = state.multiplier;
  const sub = clamped / SUBSTEPS;

  // ---- 吸い込みホールに抱えられている最中は、物理を止めて待たせる。
  // ここで `continue` せずに下の substep を回すと、抱えたはずの球が
  // 重力で落ちていってしまう
  if (saucer.hold > 0) {
    const hold = saucer.hold - clamped;
    if (hold > 0) {
      return {
        ...state,
        ball: { x: saucer.x, y: saucer.y, vx: 0, vy: 0 },
        spinner,
        saucer: { ...saucer, hold },
        flippers: swingBoth(flippers, input, clamped),
        hits: [],
        restSec: 0,
      };
    }
    // 抱え終わり。真上のバンパー地帯へ撃ち出す（わずかに横へ振って毎回同じ道にしない）
    return {
      ...state,
      ball: {
        x: saucer.x,
        y: saucer.y - saucer.r - BALL_R,
        vx: (state.score % 2 === 0 ? 1 : -1) * 0.35,
        vy: -SAUCER_KICK,
      },
      spinner,
      saucer: { ...saucer, hold: 0, cool: SAUCER_COOL },
      flippers: swingBoth(flippers, input, clamped),
      hits: [],
      restSec: 0,
    };
  }

  let spinBoost = 0;
  let captured = false;

  for (let i = 0; i < SUBSTEPS; i += 1) {
    const before = flippers;
    flippers = [
      moveFlipper(flippers[0], input.left, sub),
      moveFlipper(flippers[1], input.right, sub),
    ];

    ball.vy += GRAVITY * sub;
    ball.vx -= ball.vx * FRICTION * sub;
    ball.vy -= ball.vy * FRICTION * sub;
    const prevY = ball.y;
    ball.x += ball.vx * sub;
    ball.y += ball.vy * sub;

    // ---- スピナー。**線をまたいだか**だけを見る。
    // ここに当たり判定を置くと打ち出しが台の上まで届かなくなる
    if (
      Math.abs(ball.x - spinner.x) < spinner.w / 2 &&
      (prevY - spinner.y) * (ball.y - spinner.y) <= 0 &&
      prevY !== ball.y
    ) {
      spinBoost += Math.abs(ball.vy) * SPIN_PER_SPEED;
    }

    // ---- 天井のレーン。3つ全部を通すとボーナスと倍率。
    // **「線をまたいだか」で見る**（重なっているかで見ると、3つそろえて消灯した
    // 直後にまだ帯の中にいる球が同じレーンを点け直してしまう）
    for (let li = 0; li < lanes.length; li += 1) {
      const lane = lanes[li];
      if (lane.lit) continue;
      if (Math.abs(ball.x - lane.x) > lane.w / 2) continue;
      if ((prevY - lane.y) * (ball.y - lane.y) > 0 || prevY === ball.y) continue;
      lanes = lanes.map((x, xi) => (xi === li ? { ...x, lit: true } : x));
      score += POINTS.lane * multiplier;
      hits.push('lane');
      if (lanes.every((x) => x.lit)) {
        score += POINTS.laneClear * multiplier;
        multiplier = Math.min(5, multiplier + 1);
        lanes = buildLanes();
        hits.push('laneClear');
      }
    }

    // ---- 吸い込みホール。入ったら抱えて、下の物理をこのフレームで打ち切る
    if (saucer.cool <= 0 && Math.hypot(ball.x - saucer.x, ball.y - saucer.y) < saucer.r) {
      saucer = { ...saucer, hold: SAUCER_HOLD };
      ball.x = saucer.x;
      ball.y = saucer.y;
      ball.vx = 0;
      ball.vy = 0;
      score += POINTS.saucer * multiplier;
      hits.push('saucer');
      captured = true;
      break;
    }

    for (const w of WALLS) {
      const c = contactSegment(ball, w.x1, w.y1, w.x2, w.y2, WALL_R);
      if (!c) continue;
      const speed = resolve(ball, c, w.bounce, w.kick);
      // 転がって触れただけで点が入らないよう、勢いよく当たったときだけ数える
      if (w.kind === 'kicker' && speed > 0.3) {
        score += POINTS.kicker * multiplier;
        hits.push('kicker');
      }
    }

    for (const b of state.bumpers) {
      const dx = ball.x - b.x;
      const dy = ball.y - b.y;
      const d = Math.hypot(dx, dy);
      if (d > b.r + BALL_R) continue;
      const nx = d < 1e-9 ? 0 : dx / d;
      const ny = d < 1e-9 ? -1 : dy / d;
      const c: Contact = { nx, ny, depth: b.r + BALL_R - d, px: b.x + nx * b.r, py: b.y + ny * b.r };
      if (resolve(ball, c, 0.3, BUMPER_KICK) > 0) {
        score += POINTS.bumper * multiplier;
        hits.push('bumper');
      }
    }

    for (let ti = 0; ti < targets.length; ti += 1) {
      const t = targets[ti];
      if (t.down) continue;
      const c = contactRect(ball, t);
      if (!c) continue;
      if (resolve(ball, c, 0.35, 0) <= 0) continue;
      targets = targets.map((x, xi) => (xi === ti ? { ...x, down: true } : x));
      score += POINTS.target * multiplier;
      hits.push('target');
      if (targets.every((x) => x.down)) {
        score += POINTS.clear * multiplier;
        multiplier = Math.min(5, multiplier + 1);
        targets = buildTargets();
        hits.push('clear');
      }
    }

    for (let fi = 0; fi < 2; fi += 1) {
      const f = flippers[fi];
      const tip = flipperTip(f);
      const c = contactSegment(ball, f.pivotX, f.pivotY, tip.x, tip.y, FLIPPER_R);
      if (!c) continue;
      // 面の速度 ＝ 角速度 × 支点からの距離（接線方向）。これが打ち返す力になる
      const omega = (f.angle - before[fi].angle) / sub;
      const rx = c.px - f.pivotX;
      const ry = c.py - f.pivotY;
      resolve(ball, c, 0.28, 0, -omega * ry, omega * rx);
    }

    clampSpeed(ball);
  }

  // ---- スピナーの回った分を点にする。半回転ごとに1回
  const spun: Spinner = { ...spinner, spin: Math.min(SPIN_MAX, spinner.spin + spinBoost) };
  const turns =
    Math.floor(spinner.angle / Math.PI) - Math.floor(state.spinner.angle / Math.PI);
  if (turns > 0) {
    score += POINTS.spinner * turns * multiplier;
    hits.push('spinner');
  }

  if (captured) {
    return {
      ...state,
      ball,
      flippers,
      targets,
      lanes,
      saucer,
      spinner: spun,
      score,
      multiplier,
      hits,
      restSec: 0,
    };
  }

  // ---- 詰まり対策。壁や的の上で止まったままにならないよう軽く突く
  let restSec = Math.hypot(ball.vx, ball.vy) < 0.1 ? state.restSec + clamped : 0;
  if (restSec > 1.5) {
    ball.vx += ball.x < 0.5 ? 0.35 : -0.35;
    ball.vy -= 0.2;
    restSec = 0;
  }

  // ---- 落下
  if (ball.y - BALL_R > TABLE_H) {
    const balls = state.balls - 1;
    hits.push('drain');
    if (balls <= 0) {
      return {
        ...state,
        ball,
        flippers,
        targets,
        lanes,
        saucer,
        spinner: spun,
        score,
        multiplier,
        balls: 0,
        status: 'gameover',
        hits,
        restSec: 0,
      };
    }
    return {
      ...state,
      ball: waitingBall(),
      flippers,
      // 球を落としたら的もレーンも元に戻る（倍率が1に戻るのと同じ扱い）
      targets: buildTargets(),
      lanes: buildLanes(),
      saucer: buildSaucer(),
      spinner: spun,
      score,
      multiplier: 1,
      balls,
      status: 'ready',
      plunger: 0,
      hits,
      restSec: 0,
    };
  }

  // ---- 打ち出しが弱くてレーンに戻ってきたら、打ち直させる
  if (ball.x > LANE_LEFT + BALL_R && ball.y > BALL_START_Y && ball.vy >= 0) {
    return {
      ...state,
      ball: waitingBall(),
      flippers,
      targets,
      lanes,
      saucer,
      spinner: spun,
      score,
      multiplier,
      status: 'ready',
      plunger: 0,
      hits,
      restSec: 0,
    };
  }

  return { ...state, ball, flippers, targets, lanes, saucer, spinner: spun, score, multiplier, hits, restSec };
}

/** スピナーの回転の上限（ラジアン/秒）。速すぎると描画がただのちらつきになる */
const SPIN_MAX = 46;

/** スピナーを惰性で回す。球と関係なく、勢いが尽きるまで回り続ける */
function spinDown(spinner: Spinner, dt: number): Spinner {
  if (spinner.spin <= 0) return spinner;
  const spin = Math.max(0, spinner.spin - spinner.spin * SPIN_DECAY * dt);
  return { ...spinner, angle: spinner.angle + spinner.spin * dt, spin };
}

/** 打ち出し前でもフリッパーは動かす（構えられるようにする） */
function swingBoth(
  flippers: [Flipper, Flipper],
  input: PinballInput,
  dt: number,
): [Flipper, Flipper] {
  return [moveFlipper(flippers[0], input.left, dt), moveFlipper(flippers[1], input.right, dt)];
}

/** ゲームオーバーから最初の1球へ戻す */
export function restart(): PinballState {
  return initialState();
}
