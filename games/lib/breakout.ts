/**
 * ブロック崩しの物理・進行ロジック
 *
 * 描画（canvas）から切り離した純関数のステート機械。
 * UI側は毎フレーム step() を呼んで、返ってきた状態を描くだけにする。
 * こうしておくと反射や当たり判定をテストできる。
 *
 * 座標系は幅1×高さ1の正規化空間。描画時にcanvasのピクセルへ拡大する。
 * 原点は左上、yは下向きに正。
 */

export interface Ball {
  x: number;
  y: number;
  /** 1秒あたりの移動量 */
  vx: number;
  vy: number;
  radius: number;
}

export interface Brick {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 残り耐久。0になったら消える */
  hp: number;
  /** 行番号（色分け用） */
  row: number;
}

export interface BreakoutState {
  ball: Ball;
  /** パドル中心のx座標（0〜1） */
  paddleX: number;
  paddleWidth: number;
  bricks: Brick[];
  score: number;
  lives: number;
  /** クリアした面数。面が進むごとに球が速くなる */
  stage: number;
  status: 'ready' | 'playing' | 'cleared' | 'gameover';
}

export const PADDLE_Y = 0.93;
export const PADDLE_HEIGHT = 0.02;
const BALL_RADIUS = 0.015;
/** 初速。面が進むごとに SPEED_STEP ずつ速くなる */
const BASE_SPEED = 0.75;
const SPEED_STEP = 0.08;
/** 1ヒットあたりの得点。下の行（当てにくい）ほど高い */
const POINTS_PER_ROW = [50, 40, 30, 20, 10];

/** ブロックの配置を作る（5行10列。上の行ほど得点が高い） */
export function buildBricks(stage: number): Brick[] {
  const rows = 5;
  const cols = 10;
  const top = 0.08;
  const height = 0.035;
  const gap = 0.006;
  const width = (1 - gap * (cols + 1)) / cols;
  const bricks: Brick[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      bricks.push({
        x: gap + c * (width + gap),
        y: top + r * (height + gap),
        width,
        height,
        // 2面目以降は上2行が2回当てないと消えないブロックになる
        hp: stage >= 2 && r < 2 ? 2 : 1,
        row: r,
      });
    }
  }
  return bricks;
}

/** 球の初期状態。斜め上に打ち出す（角度は毎回少し変える） */
function initialBall(stage: number, rng: () => number): Ball {
  const speed = BASE_SPEED + (stage - 1) * SPEED_STEP;
  // 打ち出し角は真上から±40度の範囲。真横に近い角度は膠着するので避ける
  const angle = (-90 + (rng() * 80 - 40)) * (Math.PI / 180);
  return {
    x: 0.5,
    y: PADDLE_Y - 0.05,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: BALL_RADIUS,
  };
}

export function initialState(rng: () => number = Math.random): BreakoutState {
  return {
    ball: initialBall(1, rng),
    paddleX: 0.5,
    paddleWidth: 0.18,
    bricks: buildBricks(1),
    score: 0,
    lives: 3,
    stage: 1,
    status: 'ready',
  };
}

/** 矩形と球の衝突判定（球の中心と矩形の最近点の距離で見る） */
export function hitsBrick(ball: Ball, brick: Brick): boolean {
  const nearestX = Math.max(brick.x, Math.min(ball.x, brick.x + brick.width));
  const nearestY = Math.max(brick.y, Math.min(ball.y, brick.y + brick.height));
  const dx = ball.x - nearestX;
  const dy = ball.y - nearestY;
  return dx * dx + dy * dy <= ball.radius * ball.radius;
}

/**
 * 1フレーム進める。
 *
 * @param state 現在の状態（変更しない）
 * @param dt 経過秒（requestAnimationFrame の間隔。上限を設けて突き抜けを防ぐ）
 * @param paddleX パドルの目標位置（マウス/タッチの位置）
 * @param rng 乱数（リスタート時の打ち出し角に使う）
 */
export function step(
  state: BreakoutState,
  dt: number,
  paddleX: number,
  rng: () => number = Math.random,
): BreakoutState {
  // タブが非アクティブだった後などに dt が跳ね上がると球が壁やブロックを
  // 突き抜けるため、1フレームぶんの移動量に上限を設ける
  const clampedDt = Math.min(dt, 1 / 30);
  const half = state.paddleWidth / 2;
  const px = Math.max(half, Math.min(1 - half, paddleX));

  if (state.status !== 'playing') {
    // 待機中はパドルだけ動かし、球はパドルの上に乗せておく
    return {
      ...state,
      paddleX: px,
      ball: state.status === 'ready' ? { ...state.ball, x: px } : state.ball,
    };
  }

  const ball = { ...state.ball };
  ball.x += ball.vx * clampedDt;
  ball.y += ball.vy * clampedDt;

  // 左右の壁
  if (ball.x - ball.radius < 0) {
    ball.x = ball.radius;
    ball.vx = Math.abs(ball.vx);
  } else if (ball.x + ball.radius > 1) {
    ball.x = 1 - ball.radius;
    ball.vx = -Math.abs(ball.vx);
  }
  // 天井
  if (ball.y - ball.radius < 0) {
    ball.y = ball.radius;
    ball.vy = Math.abs(ball.vy);
  }

  // パドル。下向きに動いているときだけ反射（すり抜け直後の再反射を防ぐ）
  if (
    ball.vy > 0 &&
    ball.y + ball.radius >= PADDLE_Y &&
    ball.y + ball.radius <= PADDLE_Y + PADDLE_HEIGHT + 0.02 &&
    ball.x >= px - half - ball.radius &&
    ball.x <= px + half + ball.radius
  ) {
    ball.y = PADDLE_Y - ball.radius;
    // 当たった位置で反射角を変える（端に当たるほど横に飛ぶ）。速さは保つ
    const offset = Math.max(-1, Math.min(1, (ball.x - px) / half));
    const speed = Math.hypot(ball.vx, ball.vy);
    const angle = (-90 + offset * 60) * (Math.PI / 180);
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;
  }

  // ブロック
  let bricks = state.bricks;
  let score = state.score;
  const hitIndex = bricks.findIndex((b) => b.hp > 0 && hitsBrick(ball, b));
  if (hitIndex !== -1) {
    const brick = bricks[hitIndex];
    bricks = bricks.map((b, i) => (i === hitIndex ? { ...b, hp: b.hp - 1 } : b));
    if (brick.hp === 1) score += POINTS_PER_ROW[brick.row] ?? 10;
    // 反射方向: 球の中心がブロックの左右の外にあれば横向き、そうでなければ縦向き
    if (ball.x < brick.x || ball.x > brick.x + brick.width) {
      ball.vx = -ball.vx;
    } else {
      ball.vy = -ball.vy;
    }
  }

  // 全ブロック破壊で面クリア
  if (bricks.every((b) => b.hp <= 0)) {
    return { ...state, paddleX: px, ball, bricks, score, status: 'cleared' };
  }

  // 落下
  if (ball.y - ball.radius > 1) {
    const lives = state.lives - 1;
    if (lives <= 0) {
      return { ...state, paddleX: px, ball, bricks, score, lives: 0, status: 'gameover' };
    }
    return {
      ...state,
      paddleX: px,
      ball: initialBall(state.stage, rng),
      bricks,
      score,
      lives,
      status: 'ready',
    };
  }

  return { ...state, paddleX: px, ball, bricks, score };
}

/** ready 状態から球を打ち出す */
export function launch(state: BreakoutState): BreakoutState {
  if (state.status !== 'ready') return state;
  return { ...state, status: 'playing' };
}

/** 面クリア後、次の面へ。球は速くなり、上2行が固いブロックになる */
export function nextStage(state: BreakoutState, rng: () => number = Math.random): BreakoutState {
  if (state.status !== 'cleared') return state;
  const stage = state.stage + 1;
  return {
    ...state,
    stage,
    bricks: buildBricks(stage),
    ball: initialBall(stage, rng),
    status: 'ready',
  };
}
